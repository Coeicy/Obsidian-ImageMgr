/**
 * 增量扫描器
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
import { hashString, hashContent } from './utils';
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
            
            // 4. 并行扫描需要处理的文件
            if (filesToScan.length > 0) {
                const scanResults = await Promise.allSettled(
                    filesToScan.map(file => this.scanFile(file))
                );
                
                for (const [index, scanResult] of scanResults.entries()) {
                    if (scanResult.status === 'fulfilled') {
                        const { newImages, updatedImages } = scanResult.value;
                        result.newImages += newImages;
                        result.updatedImages += updatedImages;
                    } else {
                        // 记录扫描错误
                        const error = scanResult.reason;
                        const filePath = filesToScan[index]?.path || 'unknown';
                        
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
            
            // 获取黑名单（用于过滤）
            const blacklist = await this.getBlacklist();
            const blacklistSet = new Set(blacklist.map((item: any) => item.id));
            
            for (const image of images) {
                const imageId = await hashString(image.url);
                
                // 检查是否在黑名单中，如果是则跳过
                if (blacklistSet.has(imageId)) {
                    continue;
                }
                
                imageIds.push(imageId);
                
                // 检查图片是否已缓存
                const cachedImage = await this.getCachedImage(imageId);
                
                if (!cachedImage) {
                    // 新图片
                    await this.cacheNewImage(image, file, contentHash);
                    newImages++;
                } else if (await this.needsUpdate(cachedImage, file, image)) {
                    // 需要更新的图片
                    await this.updateCachedImage(cachedImage, image, file, contentHash);
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
            await this.updateFileCache(file, '', [], Date.now() - startTime, error.message);
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
     * 缓存新图片
     * @param image - 图片引用
     * @param file - 文件对象
     * @param contentHash - 文件内容哈希
     */
    private async cacheNewImage(
        image: NetworkImageReference,
        file: any,
        contentHash: string
    ): Promise<void> {
        const now = Date.now();
        const imageId = await hashString(image.url);
        
        const record: NetworkImageRecord = {
            id: imageId,
            url: image.url,
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
        
        const tx = this.db.transaction([ObjectStore.IMAGES], 'readwrite');
        const store = tx.objectStore(ObjectStore.IMAGES);
        await store.put(record);
        

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
     */
    private async cleanupOrphanedImages(): Promise<void> {
        try {
            const tx = this.db.transaction([ObjectStore.IMAGES, ObjectStore.FILES], 'readwrite');
            const imageStore = tx.objectStore(ObjectStore.IMAGES);
            const fileStore = tx.objectStore(ObjectStore.FILES);
            
            // 获取所有图片和文件
            const images = await this.getAllFromStore(imageStore);
            const files = await this.getAllFromStore(fileStore);
            
            // 构建文件路径集合
            const filePaths = new Set(files.map(f => f.id));
            const orphaned: string[] = [];
            
            // 检查每个图片的来源文件是否存在
            for (const image of images) {
                // 如果来源文件不在文件列表中，且文件确实不存在
                if (!filePaths.has(image.sourceFilePath)) {
                    const exists = await this.app.vault.adapter.exists(image.sourceFilePath);
                    if (!exists) {
                        orphaned.push(image.id);
                    }
                }
            }
            
            // 标记孤立图片为删除状态
            if (orphaned.length > 0) {
                for (const imageId of orphaned) {
                    const image = await this.getCachedImage(imageId);
                    if (image) {
                        image.status = 'deleted';
                        image.updatedAt = Date.now();
                        await imageStore.put(image);
                    }
                }
            }
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
     * 获取黑名单
     */
    private async getBlacklist(): Promise<any[]> {
        try {
            const tx = this.db.transaction([ObjectStore.BLACKLIST], 'readonly');
            const store = tx.objectStore(ObjectStore.BLACKLIST);
            return await this.getAllFromStore(store);
        } catch (error) {
            console.warn('Failed to get blacklist:', error);
            return [];
        }
    }
}

export default IncrementalNetworkImageScanner;