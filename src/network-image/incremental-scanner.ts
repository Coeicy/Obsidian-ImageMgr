/**
 * 增量网络图片扫描器
 * 
 * 核心功能：
 * - 增量扫描算法，仅处理新增或修改的文件
 * - 文件状态检测（修改时间、大小、内容哈希）
 * - 黑名单缓存机制，避免重复检查
 * - 自动清理孤立图片记录
 * 
 * 增量扫描流程：
 * 1. 获取所有 Markdown 文件
 * 2. 检查每个文件的扫描状态：
 *    - 从缓存获取文件记录
 *    - 检查文件是否存在（删除检测）
 *    - 检查文件是否修改（mtime/size/hash）
 * 3. 分类处理文件：
 *    - scan: 需要扫描的文件（新增或修改）
 *    - skip: 未修改的文件（跳过）
 *    - cleanup: 已删除的文件（清理）
 * 4. 并行扫描需要处理的文件
 * 5. 清理已删除文件的图片
 * 6. 清理孤立图片记录
 * 7. 计算缓存命中率和统计信息
 * 
 * 文件变更检测机制：
 * - 修改时间（mtime）: 快速检测
 * - 文件大小（size）: 辅助检测
 * - 内容哈希（hash）: 精确检测
 * 
 * 黑名单缓存优化：
 * - 首次访问时从数据库加载黑名单到内存
 * - 避免每次扫描时重复读取数据库
 * - 支持缓存清除（黑名单变化时）
 * 
 * 性能优化：
 * - 并行扫描（Promise.allSettled）
 * - 黑名单内存缓存
 * - 文件状态缓存（5秒有效期）
 * - 批量数据库操作
 * 
 * @file 实现增量扫描算法，仅处理新增或修改的文件
 * @module IncrementalNetworkImageScanner
 */

import { 
    ObjectStore, 
    IncrementalScanResult, 
    FileStatusCheck, 
    FileScanResult, 
    NetworkImageRecord, 
    ScannedFileRecord,
    NetworkImageReference,
    SystemMetadata
} from './types';
import { hashString, hashContent, hashNetworkImageId, extractNameFromUrl } from './utils';
import { ScanErrorHandler } from './error-handler';

/**
 * 网络图片扫描器接口（需要与现有系统集成）
 */
export interface NetworkImageScannerInterface {
    scan(filePath: string): Promise<NetworkImageReference[]>;
}

/**
 * 增量网络图片扫描器
 * 提供增量扫描功能，仅处理新增或修改的文件
 */
export class IncrementalNetworkImageScanner {
    private db: IDBDatabase;
    private app: any; // Obsidian App 实例
    private scanner: NetworkImageScannerInterface;
    private errorHandler: ScanErrorHandler;
    /** 黑名单缓存，避免重复从数据库加载 */
    private blacklistCache: Set<string> | null = null;
    
    /**
     * 创建增量扫描器实例
     * @param app - Obsidian App 实例
     * @param db - IndexedDB 数据库实例
     * @param scanner - 网络图片扫描器
     * @param errorHandler - 错误处理器（可选）
     */
    constructor(
        app: any, 
        db: IDBDatabase, 
        scanner: NetworkImageScannerInterface,
        errorHandler?: ScanErrorHandler
    ) {
        this.app = app;
        this.db = db;
        this.scanner = scanner;
        this.errorHandler = errorHandler || new ScanErrorHandler();
    }
    
    /**
     * 增量扫描网络图片
     * @param path - 扫描路径（可选）
     * @param incremental - 是否启用增量扫描
     * @param quiet - 静默模式，不输出控制台日志
     * @returns 扫描结果
     */
    async scan(
        path?: string,
        incremental: boolean = true,
        quiet: boolean = false
    ): Promise<IncrementalScanResult> {
        const startTime = Date.now();
        const result: IncrementalScanResult = {
            scannedFiles: 0,
            newImages: 0,
            updatedImages: 0,
            cachedImages: 0,
            deletedImages: 0,
            totalImages: 0,
            duration: 0,
            cacheHitRate: 0,
            errors: []
        };
        
        try {
            // 仅在非静默模式下输出扫描开始的关键信息
            if (!quiet) {
                console.log(`Starting ${incremental ? 'incremental' : 'full'} scan${path ? ` of ${path}` : ''}...`);
            }
            
            // 1. 获取所有 Markdown 文件
            const allFiles = this.app.vault.getMarkdownFiles();
            const targetFiles = path 
                ? allFiles.filter((f: any) => f.path.startsWith(path))
                : allFiles;
            
            result.scannedFiles = targetFiles.length;
            
            if (targetFiles.length === 0) {
                return result;
            }
            
            // 2. 检查每个文件的扫描状态
            const fileStatusChecks = await Promise.allSettled(
                targetFiles.map((file: any) => this.checkFileStatus(file, incremental))
            );
            
            // 3. 分类处理文件
            const filesToScan: any[] = [];
            const filesToSkip: any[] = [];
            const filesToCleanup: string[] = [];
            let skippedImageCount = 0;
            
            for (const checkResult of fileStatusChecks) {
                if (checkResult.status === 'fulfilled') {
                    const check = checkResult.value;
                    switch (check.action) {
                        case 'scan':
                            filesToScan.push(check.file);
                            break;
                        case 'skip':
                            filesToSkip.push(check.file);
                            skippedImageCount += check.cachedImageCount;
                            break;
                        case 'cleanup':
                            filesToCleanup.push(check.file.path);
                            break;
                    }
                } else {
                    // 状态检查失败，将文件加入扫描队列
                    console.warn('File status check failed:', checkResult.reason);
                }
            }
            
            result.cachedImages = skippedImageCount;
            
            // 4. 并行扫描需要处理的文件（引入简单的并发控制）
            if (filesToScan.length > 0) {
                const MAX_CONCURRENT_SCANS = 10;
                for (let i = 0; i < filesToScan.length; i += MAX_CONCURRENT_SCANS) {
                    const batch = filesToScan.slice(i, i + MAX_CONCURRENT_SCANS);
                    const scanResults = await Promise.allSettled(
                        batch.map(file => this.scanFile(file))
                    );
                    
                    for (const [index, scanResult] of scanResults.entries()) {
                        if (scanResult.status === 'fulfilled') {
                            const { newImages, updatedImages } = scanResult.value;
                            result.newImages += newImages;
                            result.updatedImages += updatedImages;
                        } else {
                            // 记录扫描错误
                            const error = scanResult.reason;
                            const filePath = batch[index]?.path || 'unknown';
                            
                            result.errors.push({
                                file: filePath,
                                error: error
                            });
                            
                            this.errorHandler.handleError(
                                error instanceof Error ? error : new Error(String(error)),
                                { file: filePath }
                            );
                        }
                    }
                }
            }
            
            // 5. 清理已删除文件的图片
            if (filesToCleanup.length > 0) {
                result.deletedImages = await this.cleanupDeletedFiles(filesToCleanup);
            }
            
            // 6. 清理孤立的图片记录
            await this.cleanupOrphanedImages();
            
            // 7. 计算总数和缓存命中率
            result.totalImages = result.newImages + result.updatedImages + result.cachedImages;
            result.cacheHitRate = result.totalImages > 0 
                ? (result.cachedImages / result.totalImages) * 100 
                : 0;
            
            // 只在非静默模式且有重要变化时输出日志（新增或更新图片数量 > 0）
            // 避免在无变化时产生大量日志
            if (!quiet) {
                if (result.newImages > 0 || result.updatedImages > 0 || result.deletedImages > 0) {
                    console.log(`Scan completed: ${JSON.stringify(result)}`);
                } else {
                    // 无变化时只输出简洁的完成信息
                    console.log(`Scan completed: no changes detected`);
                }
            }
            
        } catch (error) {
            const scanError = error instanceof Error ? error : new Error(String(error));
            console.error('Incremental scan failed:', scanError);
            
            this.errorHandler.handleError(scanError, {});
            
            result.errors.push({
                file: 'system',
                error: scanError
            });
        } finally {
            result.duration = Date.now() - startTime;
            
            // 更新元数据
            await this.updateMetadata(result);
        }
        
        return result;
    }
    
    /**
     * 检查文件扫描状态
     * @param file - 文件对象
     * @param incremental - 是否启用增量扫描
     * @returns 文件状态检查结果
     */
    private async checkFileStatus(
        file: any,
        incremental: boolean
    ): Promise<FileStatusCheck> {
        try {
            // 获取文件缓存记录
            const cachedFile = await this.getCachedFile(file.path);
            
            if (!cachedFile) {
                // 文件从未扫描过
                return {
                    action: 'scan',
                    file,
                    cachedImageCount: 0
                };
            }
            
            // 检查文件是否被删除
            const exists = await this.app.vault.adapter.exists(file.path);
            if (!exists) {
                return {
                    action: 'cleanup',
                    file,
                    cachedImageCount: cachedFile.imageCount
                };
            }
            
            if (!incremental) {
                // 非增量模式，重新扫描所有文件
                return {
                    action: 'scan',
                    file,
                    cachedImageCount: 0
                };
            }
            
            // 检查文件是否修改
            const isModified = await this.isFileModified(file, cachedFile);
            
            if (isModified) {
                return {
                    action: 'scan',
                    file,
                    cachedImageCount: 0
                };
            }
            
            // 文件未修改，跳过扫描
            // 文件未变化时不输出日志，减少日志量
            // console.debug(`File unchanged: ${file.path} (${cachedFile.imageCount} cached images)`);
            return {
                action: 'skip',
                file,
                cachedImageCount: cachedFile.imageCount
            };
            
        } catch (error) {
            console.warn(`Failed to check file status for ${file.path}:`, error);
            
            // 出错时重新扫描
            return {
                action: 'scan',
                file,
                cachedImageCount: 0
            };
        }
    }
    
    /**
     * 扫描单个文件
     * @param file - 文件对象
     * @returns 文件扫描结果
     */
    private async scanFile(file: any): Promise<FileScanResult> {
        const startTime = Date.now();
        let newImages = 0;
        let updatedImages = 0;
        
        try {
            // 1. 扫描文件中的网络图片
            const images = await this.scanner.scan(file.path);
            
            // 2. 计算内容哈希
            const contentHash = await this.calculateContentHash(file);
            
            // 3. 处理每个图片（过滤黑名单中的链接）
            const imageIds: string[] = [];
            
            for (const image of images) {
                // 检查是否在黑名单中，如果是则跳过
                if (await this.isUrlBlacklisted(image.url)) {
                    continue;
                }
                
                const resolved = await this.resolveImageRecord(image, file);
                if (!resolved) continue;
                
                imageIds.push(resolved.record.id);
                
                if (resolved.isNew) {
                    newImages++;
                } else if (await this.needsUpdate(resolved.record, file, image)) {
                    await this.updateCachedImage(resolved.record, image, file, contentHash);
                    updatedImages++;
                }
            }
            
            // 4. 更新文件缓存记录
            await this.updateFileCache(file, contentHash, imageIds, Date.now() - startTime);
            
            // 5. 标记文件的其他图片为删除状态
            await this.markDeletedImages(file.path, imageIds);
            
            // 不再输出单个文件的扫描日志，只在控制台显示开始和结束信息
            // 详细结果记录到插件日志中
            
        } catch (error) {
            console.error(`Failed to scan file ${file.path}:`, error);
            
            this.errorHandler.handleError(
                error instanceof Error ? error : new Error(String(error)),
                { file: file.path }
            );
            
            // 记录错误但不中断整个扫描过程
            await this.updateFileCache(file, '', [], Date.now() - startTime, (error as Error).message);
        }
        
        return { newImages, updatedImages };
    }
    
    /**
     * 计算文件内容哈希
     * @param file - 文件对象
     * @returns 文件内容哈希
     */
    private async calculateContentHash(file: any): Promise<string> {
        try {
            const content = await this.app.vault.read(file);
            return await hashContent(content);
        } catch (error) {
            console.warn(`Failed to calculate content hash for ${file.path}:`, error);
            return '';
        }
    }
    
    /**
     * 检查文件是否修改
     * @param file - 文件对象
     * @param cachedFile - 缓存的文件记录
     * @returns 是否修改
     */
    private async isFileModified(
        file: any, 
        cachedFile: ScannedFileRecord
    ): Promise<boolean> {
        try {
            // 检查修改时间
            if (file.stat.mtime !== cachedFile.mtime) {
                return true;
            }
            
            // 检查文件大小
            if (file.stat.size !== cachedFile.size) {
                return true;
            }
            
            // 检查内容哈希（更精确）
            const currentHash = await this.calculateContentHash(file);
            if (currentHash && currentHash !== cachedFile.contentHash) {
                return true;
            }
            
            return false;
        } catch (error) {
            console.warn(`Failed to check file modification for ${file.path}:`, error);
            // 出错时认为文件已修改
            return true;
        }
    }
    
    /**
     * 判断图片是否需要更新
     * @param cachedImage - 缓存的图片记录
     * @param file - 文件对象
     * @param newImage - 新的图片引用
     * @returns 是否需要更新
     */
    private async needsUpdate(
        cachedImage: NetworkImageRecord,
        file: any,
        newImage: NetworkImageReference
    ): Promise<boolean> {
        // 检查来源文件是否变化
        if (cachedImage.sourceFilePath !== file.path) {
            return true;
        }
        
        // 检查行号是否变化
        if (cachedImage.line !== newImage.line) {
            return true;
        }
        
        // 检查列号是否变化
        if (cachedImage.column !== newImage.index) {
            return true;
        }
        
        // 检查原始文本是否变化
        if (cachedImage.originalText !== newImage.originalText) {
            return true;
        }
        
        // 检查是否需要重新验证（超过 24 小时）
        const now = Date.now();
        const lastValidated = cachedImage.lastValidated;
        if (now - lastValidated > 24 * 60 * 60 * 1000) {
            return true;
        }
        
        return false;
    }
    
    /**
     * 按主键 id 或 urlHash/nameHash 解析出要使用的记录（含承接与迁移）
     * @returns { record, isNew } 若 isNew 则已写入新记录，否则为已有记录（可能已更新 name/url）
     */
    private async resolveImageRecord(
        image: NetworkImageReference,
        file: any
    ): Promise<{ record: NetworkImageRecord; isNew: boolean } | null> {
        const name = extractNameFromUrl(image.url);
        const id = await hashNetworkImageId(name, image.url);
        const urlHash = await hashString(image.url);
        const nameHash = await hashString(name);
        const now = Date.now();
        
        const tx = this.db.transaction([ObjectStore.IMAGES], 'readwrite');
        const store = tx.objectStore(ObjectStore.IMAGES);
        
        // 1) 按主键
        let record = await this.getFromStore(store, id);
        if (record) {
            return { record: record as NetworkImageRecord, isNew: false };
        }
        
        // 2) 按 URL 承接（仅改名的情形）
        record = await this.getCachedImageByUrlHash(store, urlHash);
        if (record) {
            const r = record as NetworkImageRecord;
            r.name = name;
            r.nameHash = nameHash;
            if (r.urlHash === undefined) r.urlHash = urlHash;
            r.updatedAt = now;
            await new Promise<void>((resolve, reject) => {
                const req = store.put(r);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
            return { record: r, isNew: false };
        }
        
        // 3) 按文件名承接（仅改链接的情形，仅当唯一时）
        record = await this.getCachedImageByNameHash(store, nameHash);
        if (record) {
            const r = record as NetworkImageRecord;
            r.url = image.url;
            r.urlHash = urlHash;
            r.updatedAt = now;
            await new Promise<void>((resolve, reject) => {
                const req = store.put(r);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
            return { record: r, isNew: false };
        }
        
        // 4) 新建
        const newRecord: NetworkImageRecord = {
            id,
            name,
            url: image.url,
            urlHash,
            nameHash,
            sourceFilePath: file.path,
            sourceFileMtime: file.stat.mtime,
            line: image.line,
            column: image.index,
            originalText: image.originalText,
            status: 'active',
            lastValidated: now,
            createdAt: now,
            updatedAt: now,
            accessCount: 0,
            lastAccessed: now
        };
        await new Promise<void>((resolve, reject) => {
            const req = store.put(newRecord);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
        return { record: newRecord, isNew: true };
    }
    
    /** 按 urlHash 查记录，兼容旧记录（无 urlHash 时用 hash(url) 匹配） */
    private async getCachedImageByUrlHash(store: IDBObjectStore, urlHash: string): Promise<NetworkImageRecord | null> {
        try {
            if (store.indexNames.contains('by-url-hash')) {
                const viaIndex = await this.getAllFromIndex(store.index('by-url-hash'), urlHash);
                if (viaIndex.length > 0) return viaIndex[0] as NetworkImageRecord;
            }
        } catch (_) { /* 索引可能尚未存在 */ }
        const all = await this.getAllFromStore(store);
        for (const r of all) {
            const rec = r as NetworkImageRecord;
            if (rec.urlHash === urlHash) return rec;
            if (rec.urlHash == null && (await hashString(rec.url)) === urlHash) return rec;
        }
        return null;
    }
    
    /** 按 nameHash 查记录，仅当恰好一条时返回（兼容旧记录） */
    private async getCachedImageByNameHash(store: IDBObjectStore, nameHash: string): Promise<NetworkImageRecord | null> {
        try {
            if (store.indexNames.contains('by-name-hash')) {
                const viaIndex = await this.getAllFromIndex(store.index('by-name-hash'), nameHash);
                if (viaIndex.length === 1) return viaIndex[0] as NetworkImageRecord;
                if (viaIndex.length > 1) return null; // 多条不承接
            }
        } catch (_) { /* 索引可能尚未存在 */ }
        const all = await this.getAllFromStore(store);
        const matches: NetworkImageRecord[] = [];
        for (const r of all) {
            const rec = r as NetworkImageRecord;
            const nHash = rec.nameHash != null ? rec.nameHash : await hashString(extractNameFromUrl(rec.url));
            if (nHash === nameHash) matches.push(rec);
        }
        return matches.length === 1 ? matches[0] : null;
    }
    
    /**
     * 缓存新图片（由 resolveImageRecord 内联创建，此方法保留供兼容）
     * @param image - 图片引用
     * @param file - 文件对象
     * @param contentHash - 文件内容哈希
     */
    private async cacheNewImage(
        image: NetworkImageReference,
        file: any,
        contentHash: string
    ): Promise<void> {
        const resolved = await this.resolveImageRecord(image, file);
        if (resolved?.isNew) { /* 已写入 */ }
    }
    
    /**
     * 更新缓存的图片
     * @param cachedImage - 缓存的图片记录
     * @param newImage - 新的图片引用
     * @param file - 文件对象
     * @param contentHash - 文件内容哈希
     */
    private async updateCachedImage(
        cachedImage: NetworkImageRecord,
        newImage: NetworkImageReference,
        file: any,
        contentHash: string
    ): Promise<void> {
        const now = Date.now();
        
        // 更新字段
        cachedImage.sourceFilePath = file.path;
        cachedImage.sourceFileMtime = file.stat.mtime;
        cachedImage.line = newImage.line;
        cachedImage.column = newImage.index;
        cachedImage.originalText = newImage.originalText;
        cachedImage.updatedAt = now;
        cachedImage.status = 'active';
        
        const tx = this.db.transaction([ObjectStore.IMAGES], 'readwrite');
        const store = tx.objectStore(ObjectStore.IMAGES);
        await store.put(cachedImage);
        

    }
    
    /**
     * 更新文件缓存记录
     * @param file - 文件对象
     * @param contentHash - 内容哈希
     * @param imageIds - 图片 ID 列表
     * @param scanDuration - 扫描耗时
     * @param error - 错误信息（可选）
     */
    private async updateFileCache(
        file: any,
        contentHash: string,
        imageIds: string[],
        scanDuration: number,
        error?: string
    ): Promise<void> {
        const now = Date.now();
        
        const record: ScannedFileRecord = {
            id: file.path,
            fileName: file.name,
            mtime: file.stat.mtime,
            size: file.stat.size,
            contentHash,
            imageCount: imageIds.length,
            imageIds,
            lastScanned: now,
            status: error ? 'pending' : 'scanned',
            needsRescan: !!error,
            scanDuration,
            error
        };
        
        const tx = this.db.transaction([ObjectStore.FILES], 'readwrite');
        const store = tx.objectStore(ObjectStore.FILES);
        await store.put(record);
        

    }
    
    /**
     * 标记删除的图片
     * @param filePath - 文件路径
     * @param currentImageIds - 当前图片 ID 列表
     */
    private async markDeletedImages(
        filePath: string,
        currentImageIds: string[]
    ): Promise<void> {
        const tx = this.db.transaction([ObjectStore.IMAGES], 'readwrite');
        const store = tx.objectStore(ObjectStore.IMAGES);
        const index = store.index('by-source-file');
        
        // 获取该文件的所有图片
        const fileImages = await this.getAllFromIndex(index, filePath);
        
        // 标记不再存在的图片为删除状态
        for (const image of fileImages) {
            if (!currentImageIds.includes(image.id)) {
                image.status = 'deleted';
                image.updatedAt = Date.now();
                await store.put(image);

            }
        }
    }
    
    /**
     * 清理已删除文件的图片
     * @param deletedFilePaths - 已删除文件路径列表
     * @returns 删除的图片数量
     */
    private async cleanupDeletedFiles(deletedFilePaths: string[]): Promise<number> {
        let deletedCount = 0;
        
        for (const filePath of deletedFilePaths) {
            const tx = this.db.transaction([ObjectStore.IMAGES], 'readwrite');
            const store = tx.objectStore(ObjectStore.IMAGES);
            const index = store.index('by-source-file');
            
            const fileImages = await this.getAllFromIndex(index, filePath);
            
            // 标记为删除状态
            for (const image of fileImages) {
                image.status = 'deleted';
                image.updatedAt = Date.now();
                await store.put(image);
                deletedCount++;
            }
            

        }
        
        return deletedCount;
    }
    
    /**
     * 清理孤立的图片记录
     * 孤立图片：来源文件已不存在或已删除的图片
     * 使用 IDBCursor 优化大库性能
     */
    private async cleanupOrphanedImages(): Promise<void> {
        try {
            const tx = this.db.transaction([ObjectStore.IMAGES, ObjectStore.FILES], 'readwrite');
            const imageStore = tx.objectStore(ObjectStore.IMAGES);
            const fileStore = tx.objectStore(ObjectStore.FILES);
            
            // 1. 获取所有存在的文件路径 ID（仅存储 ID 以节省内存）
            const filePaths = new Set<string>();
            await new Promise<void>((resolve) => {
                try {
                    // 检查 getAll() 方法是否存在
                    if (typeof fileStore.getAll === 'function') {
                        // 尝试使用 getAll() 作为最兼容的方案
                        const getAllRequest = fileStore.getAll();
                        getAllRequest.onsuccess = (event) => {
                            // Handle both real IDBRequest events and mock events from file-cache-adapter
                            const result = event && event.target ? (event.target as IDBRequest<any[]>).result : getAllRequest.result;
                            const files = result || [];
                            files.forEach(file => {
                                filePaths.add(file.id as string);
                            });
                            resolve();
                        };
                        getAllRequest.onerror = () => {
                            // 如果 getAll() 失败，检查 openCursor() 方法是否存在
                            if (typeof fileStore.openCursor === 'function') {
                                try {
                                    const cursorRequest = fileStore.openCursor();
                                    cursorRequest.onsuccess = (event) => {
                                        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                                        if (cursor) {
                                            filePaths.add(cursor.key as string);
                                            cursor.continue();
                                        } else {
                                            resolve();
                                        }
                                    };
                                    cursorRequest.onerror = () => {
                                        console.warn('Cursor request failed:', cursorRequest.error);
                                        resolve();
                                    };
                                } catch (cursorError) {
                                    // 如果所有方法都失败，使用空集合继续执行
                                    console.warn('Failed to get file paths:', cursorError);
                                    resolve();
                                }
                            } else {
                                // 如果 openCursor() 也不存在，使用空集合继续执行
                                console.warn('Neither getAll() nor openCursor() is available for fileStore');
                                resolve();
                            }
                        };
                    } else {
                        // 如果 getAll() 不存在，检查 openCursor() 方法是否存在
                        if (typeof fileStore.openCursor === 'function') {
                            try {
                                const cursorRequest = fileStore.openCursor();
                                cursorRequest.onsuccess = (event) => {
                                    const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                                    if (cursor) {
                                        filePaths.add(cursor.key as string);
                                        cursor.continue();
                                    } else {
                                        resolve();
                                    }
                                };
                                cursorRequest.onerror = () => {
                                    console.warn('Cursor request failed:', cursorRequest.error);
                                    resolve();
                                };
                            } catch (cursorError) {
                                // 如果所有方法都失败，使用空集合继续执行
                                console.warn('Failed to get file paths:', cursorError);
                                resolve();
                            }
                        } else {
                            // 如果所有方法都失败，使用空集合继续执行
                            console.warn('Neither getAll() nor openCursor() is available for fileStore');
                            resolve();
                        }
                    }
                } catch (error) {
                    // 如果所有方法都失败，使用空集合继续执行
                    console.warn('Failed to access file store:', error);
                    resolve();
                }
            });
            
            // 2. 遍历图片并标记孤立记录
            await new Promise<void>((resolve) => {
                try {
                    // 检查 getAll() 方法是否存在
                    if (typeof imageStore.getAll === 'function') {
                        // 尝试使用 getAll() 作为最兼容的方案
                        const getAllRequest = imageStore.getAll();
                        getAllRequest.onsuccess = async (event) => {
                            // Handle both real IDBRequest events and mock events from file-cache-adapter
                            const result = event && event.target ? (event.target as IDBRequest<any[]>).result : getAllRequest.result;
                            const images = result || [];
                            for (const image of images) {
                                // 如果来源文件不在文件记录列表中，检查磁盘上是否存在
                                if (!filePaths.has(image.sourceFilePath)) {
                                    try {
                                        const exists = await this.app.vault.adapter.exists(image.sourceFilePath);
                                        if (!exists) {
                                            image.status = 'deleted';
                                            image.updatedAt = Date.now();
                                            // 尝试更新记录
                                            try {
                                                imageStore.put(image);
                                            } catch (updateError) {
                                                console.warn('Failed to update image status:', updateError);
                                            }
                                        }
                                    } catch (existsError) {
                                        console.warn('Failed to check if file exists:', existsError);
                                    }
                                }
                            }
                            resolve();
                        };
                        getAllRequest.onerror = () => {
                            // 如果 getAll() 失败，检查 openCursor() 方法是否存在
                            if (typeof imageStore.openCursor === 'function') {
                                try {
                                    const cursorRequest = imageStore.openCursor();
                                    cursorRequest.onsuccess = async (event) => {
                                        try {
                                            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                                            if (cursor) {
                                                const image = cursor.value;
                                                // 如果来源文件不在文件记录列表中，检查磁盘上是否存在
                                                if (!filePaths.has(image.sourceFilePath)) {
                                                    try {
                                                        const exists = await this.app.vault.adapter.exists(image.sourceFilePath);
                                                        if (!exists) {
                                                            image.status = 'deleted';
                                                            image.updatedAt = Date.now();
                                                            cursor.update(image);
                                                        }
                                                    } catch (existsError) {
                                                        console.warn('Failed to check if file exists:', existsError);
                                                    }
                                                }
                                                cursor.continue();
                                            } else {
                                                resolve();
                                            }
                                        } catch (cursorError) {
                                            console.warn('Failed to process cursor:', cursorError);
                                            resolve();
                                        }
                                    };
                                    cursorRequest.onerror = () => {
                                        console.warn('Cursor request failed:', cursorRequest.error);
                                        resolve();
                                    };
                                } catch (cursorError) {
                                    // 如果所有方法都失败，跳过此步骤
                                    console.warn('Failed to open cursor:', cursorError);
                                    resolve();
                                }
                            } else {
                                // 如果 openCursor() 也不存在，跳过此步骤
                                console.warn('Neither getAll() nor openCursor() is available for imageStore');
                                resolve();
                            }
                        };
                    } else {
                        // 如果 getAll() 不存在，检查 openCursor() 方法是否存在
                        if (typeof imageStore.openCursor === 'function') {
                            try {
                                const cursorRequest = imageStore.openCursor();
                                cursorRequest.onsuccess = async (event) => {
                                    try {
                                        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                                        if (cursor) {
                                            const image = cursor.value;
                                            // 如果来源文件不在文件记录列表中，检查磁盘上是否存在
                                            if (!filePaths.has(image.sourceFilePath)) {
                                                try {
                                                    const exists = await this.app.vault.adapter.exists(image.sourceFilePath);
                                                    if (!exists) {
                                                        image.status = 'deleted';
                                                        image.updatedAt = Date.now();
                                                        cursor.update(image);
                                                    }
                                                } catch (existsError) {
                                                    console.warn('Failed to check if file exists:', existsError);
                                                }
                                            }
                                            cursor.continue();
                                        } else {
                                            resolve();
                                        }
                                    } catch (cursorError) {
                                        console.warn('Failed to process cursor:', cursorError);
                                        resolve();
                                    }
                                };
                                cursorRequest.onerror = () => {
                                    console.warn('Cursor request failed:', cursorRequest.error);
                                    resolve();
                                };
                            } catch (cursorError) {
                                // 如果所有方法都失败，跳过此步骤
                                console.warn('Failed to open cursor:', cursorError);
                                resolve();
                            }
                        } else {
                            // 如果所有方法都失败，跳过此步骤
                            console.warn('Neither getAll() nor openCursor() is available for imageStore');
                            resolve();
                        }
                    }
                } catch (error) {
                    // 如果所有方法都失败，跳过此步骤
                    console.warn('Failed to access image store:', error);
                    resolve();
                }
            });
        } catch (error) {
            console.warn('Failed to cleanup orphaned images:', error);
            // 不抛出错误，避免影响主流程
        }
    }

    
    /**
     * 从存储获取所有记录
     */
    private getAllFromStore(store: IDBObjectStore): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * 更新元数据
     * @param result - 扫描结果
     */
    private async updateMetadata(result: IncrementalScanResult): Promise<void> {
        try {
            const tx = this.db.transaction([ObjectStore.METADATA], 'readwrite');
            const store = tx.objectStore(ObjectStore.METADATA);
            
            // 获取当前元数据
            const metadataRecord = await this.getFromStore(store, 'system');
            const metadata: SystemMetadata = metadataRecord?.value || {
                version: '1.0.0',
                lastFullScan: 0,
                totalFilesScanned: 0,
                totalImagesFound: 0,
                databaseSize: 0,
                cacheHitRate: 0
            };
            
            // 更新元数据
            metadata.totalFilesScanned += result.scannedFiles;
            metadata.totalImagesFound += result.newImages + result.updatedImages;
            metadata.cacheHitRate = result.cacheHitRate;
            
            if (!result.cachedImages && result.newImages > 0) {
                metadata.lastFullScan = Date.now();
            }
            
            await store.put({
                id: 'system',
                value: metadata,
                updatedAt: Date.now()
            });
            
            // 元数据更新日志改为 debug 级别，不在控制台显示
            // 详细日志记录到插件日志中
        } catch (error) {
            console.warn('Failed to update metadata:', error);
        }
    }
    
    /**
     * 从存储获取记录
     */
    private async getCachedFile(filePath: string): Promise<ScannedFileRecord | null> {
        const tx = this.db.transaction([ObjectStore.FILES], 'readonly');
        const store = tx.objectStore(ObjectStore.FILES);
        return new Promise<ScannedFileRecord | null>((resolve, reject) => {
            const request = store.get(filePath);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }
    
    private async getCachedImage(imageId: string): Promise<NetworkImageRecord | null> {
        const tx = this.db.transaction([ObjectStore.IMAGES], 'readonly');
        const store = tx.objectStore(ObjectStore.IMAGES);
        return new Promise<NetworkImageRecord | null>((resolve, reject) => {
            const request = store.get(imageId);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }
    
    private getAllFromIndex(index: IDBIndex, key: string): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const request = index.getAll(key);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }
    
    private getFromStore(store: IDBObjectStore, key: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * 加载黑名单到内存缓存（只加载一次）
     */
    private async loadBlacklistToCache(): Promise<void> {
        if (this.blacklistCache !== null) {
            return; // 已经加载过，直接返回
        }
        
		try {
			const blacklist = await this.getBlacklistFromDB();
			this.blacklistCache = new Set(blacklist.map((item: any) => item.id));
			// 黑名单缓存加载成功（静默处理，不输出日志）
		} catch (error) {
			console.warn('Failed to load blacklist to cache:', error);
			this.blacklistCache = new Set();
		}
    }
    
    /**
     * 从数据库获取黑名单（原始数据）
     */
    private async getBlacklistFromDB(): Promise<any[]> {
        try {
            const tx = this.db.transaction([ObjectStore.BLACKLIST], 'readonly');
            const store = tx.objectStore(ObjectStore.BLACKLIST);
            return await this.getAllFromStore(store);
        } catch (error) {
            console.warn('Failed to get blacklist from DB:', error);
            return [];
        }
    }
    
    /**
     * 获取黑名单（兼容旧代码）
     */
    private async getBlacklist(): Promise<any[]> {
        await this.loadBlacklistToCache();
        // 将Set转换回数组格式
        return Array.from(this.blacklistCache || []).map(id => ({ id }));
    }
    
    /**
     * 检查URL是否在黑名单中
     */
    private async isUrlBlacklisted(url: string): Promise<boolean> {
        await this.loadBlacklistToCache();
        const urlId = await hashString(url);
        return this.blacklistCache?.has(urlId) || false;
    }
    
	/**
	 * 清除黑名单缓存（当黑名单发生变化时调用）
	 */
	public clearBlacklistCache(): void {
		this.blacklistCache = null;
		// 黑名单缓存已清除（静默处理，不输出日志）
	}
}

export default IncrementalNetworkImageScanner;