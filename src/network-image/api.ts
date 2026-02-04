/**
 * 网络图片扫描器 API 接口层
 * 
 * 核心功能：
 * - 提供统一的扫描、搜索、清理和验证功能
 * - 封装底层增量扫描器和缓存管理器
 * - 支持多种扫描模式（增量/完整/快速）
 * - 智能黑名单管理和自动添加
 * - 图片验证和错误处理
 * 
 * 扫描模式：
 * - 增量扫描（incremental）：仅扫描修改的文件
 * - 完整扫描（full）：重新扫描所有文件
 * - 快速扫描（quick）：仅检查修改的文件，不验证图片
 * 
 * 使用示例：
 * ```typescript
 * // 初始化 API
 * const api = new NetworkImageScannerAPI(app, db, scanner);
 * 
 * // 执行增量扫描
 * const result = await api.scan({
 *     path: 'docs/images',
 *     incremental: true,
 *     validateImages: false
 * });
 * console.log(`新增 ${result.newImages} 张图片，更新 ${result.updatedImages} 张图片`);
 * 
 * // 搜索图片
 * const searchResult = await api.searchImagesByUrl('https://example.com');
 * console.log(`找到 ${searchResult.total} 张图片`);
 * 
 * // 清理缓存
 * const cleanupResult = await api.cleanup({
 *     lru: true,
 *     ttl: true,
 *     orphaned: true
 * });
 * console.log(`清理了 ${cleanupResult.imagesRemoved} 张图片`);
 * 
 * // 获取缓存统计
 * const stats = await api.getStats();
 * console.log(`缓存命中率: ${stats.cacheHitRate.toFixed(2)}%`);
 * ```
 * 
 * 最佳实践：
 * 1. 定期执行完整扫描（建议每周一次）
 * 2. 日常使用增量扫描（减少资源消耗）
 * 3. 验证图片时控制并发数（避免过载）
 * 4. 定期清理缓存（建议每月一次）
 * 
 * 错误处理：
 * - 所有异步操作都会记录错误日志
 * - 扫描错误不会中断整个扫描过程
 * - 网络错误的图片会自动添加到黑名单
 * 
 * @file 提供对外使用的完整 API 接口
 * @module NetworkImageScannerAPI
 */

import { 
    NetworkImageScannerAPI as INetworkImageScannerAPI,
    ScanOptions,
    SearchQuery,
    SearchResult,
    CleanupOptions,
    CleanupResult,
    CacheStats,
    ValidationResult,
    NetworkImageRecord,
    IncrementalScanResult,
    ObjectStore
} from './types';
import { IncrementalNetworkImageScanner, NetworkImageScannerInterface } from './incremental-scanner';
import { NetworkImageCacheManager } from './cache-manager';
import { batchValidateImages } from './utils';
import { ScanErrorHandler } from './error-handler';

/**
 * 网络图片扫描器 API
 * 提供完整的扫描、搜索、清理和验证功能
 */
export class NetworkImageScannerAPI implements INetworkImageScannerAPI {
    private scanner: IncrementalNetworkImageScanner;
    private cacheManager: NetworkImageCacheManager;
    private errorHandler: ScanErrorHandler;
    private s1ax1xDomainWarned: boolean = false;
    private databaseConnectionWarned: boolean = false;
    
    /**
     * 创建 API 实例
     * @param app - Obsidian App 实例
     * @param db - IndexedDB 数据库实例
     * @param imageScanner - 网络图片扫描器
     * @param errorHandler - 错误处理器（可选）
     */
    constructor(
        app: any,
        db: IDBDatabase,
        imageScanner: NetworkImageScannerInterface,
        errorHandler?: ScanErrorHandler
    ) {
        this.errorHandler = errorHandler || new ScanErrorHandler();
        this.scanner = new IncrementalNetworkImageScanner(app, db, imageScanner, this.errorHandler);
        this.cacheManager = new NetworkImageCacheManager(db);
    }
    
    /**
     * 增量扫描
     * @param options - 扫描选项
     * @returns 扫描结果
     */
    async scan(options: ScanOptions = {}): Promise<IncrementalScanResult> {
        const defaultOptions: ScanOptions = {
            path: undefined,
            incremental: true,
            validateImages: false,
            maxConcurrency: 5,
            quiet: false // 新增静默模式参数
        };
        
        const scanOptions = { ...defaultOptions, ...options };
        
        try {
            // 仅在非静默模式下输出开始信息
            if (!scanOptions.quiet) {
                console.log(`Starting ${scanOptions.incremental ? 'incremental' : 'full'} scan${scanOptions.path ? ` of ${scanOptions.path}` : ''}...`);
            }
            
            const result = await this.scanner.scan(
                scanOptions.path,
                scanOptions.incremental,
                scanOptions.quiet // 传递静默模式给扫描器
            );
            
            // 如果需要验证图片，在扫描后执行验证
            if (scanOptions.validateImages && result.newImages > 0) {
                // 验证过程不输出控制台日志，详细结果记录到插件日志中
                await this.validateNewImages(scanOptions.path);
            }
            
            return result;
        } catch (error) {
            const scanError = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(scanError, {});
            throw scanError;
        }
    }
    
    /**
     * 完整扫描（强制重新扫描所有文件）
     * @param path - 扫描路径（可选）
     * @returns 扫描结果
     */
    async fullScan(path?: string): Promise<IncrementalScanResult> {
        // 使用简洁的扫描开始信息，详细日志记录到插件日志中
        return this.scan({
            path,
            incremental: false,
            validateImages: true
        });
    }
    
    /**
     * 快速扫描（仅检查修改的文件，不验证图片）
     * @param path - 扫描路径（可选）
     * @returns 扫描结果
     */
    async quickScan(path?: string): Promise<IncrementalScanResult> {
        // 使用简洁的扫描开始信息，详细日志记录到插件日志中
        return this.scan({
            path,
            incremental: true,
            validateImages: false
        });
    }
    
    /**
     * 验证图片有效性
     * @param imageIds - 要验证的图片 ID 列表
     * @returns 验证结果
     */
    async validateImages(imageIds: string[]): Promise<ValidationResult[]> {
        if (!imageIds || imageIds.length === 0) {
            return [];
        }
        
        // 验证过程不输出控制台日志，详细结果记录到插件日志中
        
        try {
            // 从数据库获取图片记录
            const images = await Promise.all(
                imageIds.map(id => this.getImage(id))
            );
            
            // 过滤有效的图片
            const validImages = images.filter((img): img is NetworkImageRecord => 
                img !== null && img.status === 'active'
            );
            
            if (validImages.length === 0) {
                // 无有效图片时不输出控制台日志
                return [];
            }
            
            // 批量验证
            const results = await batchValidateImages(
                validImages.map(img => img.url)
            );
            
            // 更新数据库中的验证结果
            await this.updateValidationResults(results);
            
            console.log(`Validation completed: ${results.length} images`);
            
            return results;
        } catch (error) {
            const scanError = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(scanError, {});
            throw scanError;
        }
    }
    
    /**
     * 验证新图片
     * @param path - 路径（可选）
     */
    private async validateNewImages(path?: string): Promise<void> {
        try {
            // 获取需要验证的新图片
            const tx = this.cacheManager['db'].transaction([ObjectStore.IMAGES], 'readonly');
            const store = tx.objectStore(ObjectStore.IMAGES);
            const images = await this.getAllFromStore(store);
            
            const newImages = images.filter(img => 
                img.status === 'active' && 
                (!path || img.sourceFilePath.startsWith(path))
            );
            
            if (newImages.length > 0) {
                await this.validateImages(newImages.map(img => img.id));
            }
        } catch (error) {
            console.warn('Failed to validate new images:', error);
        }
    }
    
    /**
     * 获取单张图片
     * @param imageId - 图片 ID
     * @returns 图片记录或 null
     */
    async getImage(imageId: string): Promise<NetworkImageRecord | null> {
        try {
            const db = this.cacheManager['db'];
            const tx = db.transaction([ObjectStore.IMAGES], 'readonly');
            const store = tx.objectStore(ObjectStore.IMAGES);
            
            return await this.getFromStore(store, imageId);
        } catch (error) {
            const scanError = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(scanError, {});
            return null;
        }
    }
    
    /**
     * 搜索图片
     * @param query - 搜索查询
     * @returns 搜索结果
     */
    async searchImages(query: SearchQuery): Promise<SearchResult> {
        console.log('Searching images with query:', query);
        
        try {
            const db = this.cacheManager['db'];
            const tx = db.transaction([ObjectStore.IMAGES], 'readonly');
            const store = tx.objectStore(ObjectStore.IMAGES);
            
            // 获取所有图片
            let images = await this.getAllFromStore(store);
            
            // 应用搜索条件
            if (query.url) {
                images = images.filter(img => img.url.includes(query.url));
            }
            
            if (query.sourceFile) {
                images = images.filter(img => img.sourceFilePath.includes(query.sourceFile));
            }
            
            if (query.status) {
                images = images.filter(img => img.status === query.status);
            }
            
            // 分页
            const page = query.page || 1;
            const pageSize = Math.min(query.pageSize || 50, 200); // 限制最大页面大小
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            
            const result: SearchResult = {
                images: images.slice(start, end),
                total: images.length,
                page,
                pageSize
            };
            
            console.log(`Search completed: found ${result.total} images, returning page ${page} (${result.images.length} items)`);
            
            return result;
        } catch (error) {
            const scanError = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(scanError, {});
            throw scanError;
        }
    }
    
    /**
     * 搜索特定 URL 的图片
     * @param url - URL 关键词
     * @returns 搜索结果
     */
    async searchImagesByUrl(url: string): Promise<SearchResult> {
        return this.searchImages({ url });
    }
    
    /**
     * 搜索特定文件的图片
     * @param sourceFile - 源文件路径
     * @returns 搜索结果
     */
    async searchImagesByFile(sourceFile: string): Promise<SearchResult> {
        return this.searchImages({ sourceFile });
    }
    
    /**
     * 按状态搜索图片
     * @param status - 图片状态
     * @returns 搜索结果
     */
    async searchImagesByStatus(status: 'active' | 'deleted' | 'broken' | 'pending'): Promise<SearchResult> {
        return this.searchImages({ status });
    }
    
    /**
     * 清理缓存
     * @param options - 清理选项
     * @returns 清理结果
     */
    async cleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
        console.log('Starting cache cleanup with options:', options);
        
        try {
            const defaultOptions: CleanupOptions = {
                lru: true,
                ttl: true,
                orphaned: true
            };
            
            const cleanupOptions = { ...defaultOptions, ...options };
            
            const result: CleanupResult = {
                imagesRemoved: 0,
                filesRemoved: 0,
                blacklistRemoved: 0,
                spaceFreed: 0
            };
            
            // 执行 LRU 清理
            if (cleanupOptions.lru) {
                result.imagesRemoved += await this.cacheManager.cleanupLRU();
            }
            
            // 执行 TTL 清理
            if (cleanupOptions.ttl) {
                const ttlResult = await this.cacheManager.cleanupTTL();
                result.imagesRemoved += ttlResult.images;
                result.filesRemoved += ttlResult.files;
                result.blacklistRemoved += ttlResult.blacklist;
            }
            
            // 清理孤立图片
            if (cleanupOptions.orphaned) {
                result.imagesRemoved += await this.cacheManager.cleanupOrphanedImages();
            }
            
            // 估算释放的空间
            result.spaceFreed = result.imagesRemoved * 1024; // 粗略估算每个图片记录 1KB
            
            console.log(`Cleanup completed: ${JSON.stringify(result)}`);
            
            return result;
        } catch (error) {
            const scanError = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(scanError, {});
            throw scanError;
        }
    }
    
    /**
     * 执行完整清理
     * @returns 清理结果
     */
    async fullCleanup(): Promise<CleanupResult> {
        return this.cleanup({
            lru: true,
            ttl: true,
            orphaned: true
        });
    }
    
    /**
     * 获取缓存统计
     * @returns 缓存统计信息
     */
    async getStats(): Promise<CacheStats> {
        try {
            return await this.cacheManager.getCacheStats();
        } catch (error) {
            const scanError = error instanceof Error ? error : new Error(String(error));
            this.errorHandler.handleError(scanError, {});
            throw scanError;
        }
    }
    
    /**
     * 更新图片访问统计
     * @param imageId - 图片 ID
     */
    async updateImageAccess(imageId: string): Promise<void> {
        try {
            await this.cacheManager.updateAccessStats(imageId);
        } catch (error) {
            // 访问统计更新失败不影响主流程
            console.warn('Failed to update image access stats:', error);
        }
    }
    
    /**
     * 更新验证结果到数据库
     * @param results - 验证结果列表
     */
    private async updateValidationResults(results: ValidationResult[]): Promise<void> {
        try {
            const db = this.cacheManager['db'];
            const imageTx = db.transaction([ObjectStore.IMAGES], 'readwrite');
            const imageStore = imageTx.objectStore(ObjectStore.IMAGES);
            
            // 准备黑名单记录
            const blacklistRecords: Array<{id: string, url: string, reason: any, errorMessage: string}> = [];
            
            for (const result of results) {
                if (!result.imageId) continue;
                
                const image = await this.getFromStore(imageStore, result.imageId);
                if (!image) continue;
                
                // 更新验证结果
                image.lastValidated = Date.now();
                
                if (result.status === 'success' && result.isValid) {
                    image.status = 'active';
                    image.validationResult = {
                        statusCode: result.statusCode || 200,
                        contentType: result.contentType || '',
                        contentLength: result.contentLength || 0
                    };
                } else {
                    image.status = 'broken';
                    image.validationResult = {
                        statusCode: result.statusCode || 0,
                        contentType: result.contentType || '',
                        contentLength: result.contentLength || 0,
                        error: result.error
                    };
                    
                    // 如果是网络错误（如 ERR_CONNECTION_CLOSED, ERR_NAME_NOT_RESOLVED），添加到黑名单
                    if (result.errorType === 'network_error' || 
                        (result.error && (result.error.includes('ERR_CONNECTION_CLOSED') ||
                                         result.error.includes('ERR_NAME_NOT_RESOLVED') || 
                                         result.error.includes('DNS resolution failed') ||
                                         result.error.includes('Failed to fetch') ||
                                         result.error.includes('Network error')))) {
                        const errorMsg = result.error || 'Network error';
                        
                        // 检查是否为 s1.ax1x.com 域名，避免重复添加
                        const domain = new URL(image.url).hostname;
                        if (domain === 's1.ax1x.com') {
                            // 对于特定域名，只记录一次警告
                            if (!this.s1ax1xDomainWarned) {
                                console.warn(`[Network Image Scanner] Domain s1.ax1x.com has connection issues, adding to blacklist: ${errorMsg}`);
                                this.s1ax1xDomainWarned = true;
                            }
                        } else {
                            console.warn(`[Network Image Scanner] Failed URL added to blacklist: ${image.url} - ${errorMsg}`);
                        }
                        
                        // 使用URL重新计算hash，确保与检查时的ID一致
                        const urlId = await hashUrl(image.url);
                        blacklistRecords.push({
                            id: urlId,
                            url: image.url,
                            reason: result.errorType || 'network_error',
                            errorMessage: errorMsg
                        });
                    }
                }
                
                await imageStore.put(image);
            }
            
            // 批量添加黑名单记录
            if (blacklistRecords.length > 0) {
                await this.addToBlacklist(blacklistRecords);
            }
        } catch (error) {
            console.warn('Failed to update validation results:', error);
        }
    }
    
    /**
     * 添加 URL 到黑名单
     * @param records - 黑名单记录数组
     */
    private async addToBlacklist(records: Array<{id: string, url: string, reason: any, errorMessage: string}>): Promise<void> {
        // 检查数据库连接是否可用
        if (!this.cacheManager || !this.cacheManager['db'] || this.cacheManager['db'].readyState !== 'open') {
            // 避免重复显示相同的数据库连接错误
            if (!this.databaseConnectionWarned) {
                console.warn('Database connection is not available, skipping blacklist update');
                this.databaseConnectionWarned = true;
            }
            return;
        }
        
        try {
            const db = this.cacheManager['db'];
            const tx = db.transaction([ObjectStore.BLACKLIST], 'readwrite');
            
            // 添加事务错误处理
            tx.onerror = (event) => {
                console.error('Transaction error in addToBlacklist:', event);
            };
            
            const store = tx.objectStore(ObjectStore.BLACKLIST);
            
            for (const record of records) {
                // 检查是否已存在
                const existing = await this.getFromStore(store, record.id);
                
                if (existing) {
                    // 更新重试次数
                    existing.retryCount = (existing.retryCount || 0) + 1;
                    existing.lastRetry = Date.now();
                    existing.errorMessage = record.errorMessage;
                    await store.put(existing);
                    console.log(`Updated blacklist entry: ${record.url} (retry count: ${existing.retryCount})`);
                } else {
                    // 创建新记录
                    const blacklistRecord = {
                        id: record.id,
                        url: record.url,
                        reason: record.reason,
                        errorMessage: record.errorMessage,
                        detectedAt: Date.now(),
                        retryCount: 0,
                        autoRemove: true // 默认自动移除
                    };
                    await store.put(blacklistRecord);
                    console.log(`Added to blacklist: ${record.url} - ${record.errorMessage}`);
                }
            }
            
            console.log(`Added/Updated ${records.length} URLs in blacklist`);
            
            // 清除扫描器的黑名单缓存，以便下次扫描使用更新后的黑名单
            if (this.scanner && typeof this.scanner.clearBlacklistCache === 'function') {
                this.scanner.clearBlacklistCache();
                console.log('[NetworkImageAPI] Blacklist cache cleared after update');
            }
        } catch (error) {
            console.warn('Failed to add to blacklist:', error);
        }
    }
    
    /**
     * 检查 URL 是否在黑名单中
     * @param url - 要检查的 URL
     * @returns 是否在黑名单中
     */
    async isBlacklisted(url: string): Promise<boolean> {
        try {
            const { hashUrl } = await import('./utils');
            const urlId = await hashUrl(url);
            const db = this.cacheManager['db'];
            const tx = db.transaction([ObjectStore.BLACKLIST], 'readonly');
            const store = tx.objectStore(ObjectStore.BLACKLIST);
            const record = await this.getFromStore(store, urlId);
            return !!record;
        } catch (error) {
            console.warn('Failed to check blacklist:', error);
            return false;
        }
    }
    
    /**
     * 获取所有黑名单记录
     * @returns 黑名单记录数组
     */
    async getBlacklist(): Promise<any[]> {
        try {
            const db = this.cacheManager['db'];
            const tx = db.transaction([ObjectStore.BLACKLIST], 'readonly');
            const store = tx.objectStore(ObjectStore.BLACKLIST);
            return await this.getAllFromStore(store);
        } catch (error) {
            console.warn('Failed to get blacklist:', error);
            return [];
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
     * 从存储获取单条记录
     */
    private getFromStore(store: IDBObjectStore, key: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * 获取错误处理器
     * @returns 错误处理器实例
     */
    getErrorHandler(): ScanErrorHandler {
        return this.errorHandler;
    }
    
    /**
     * 获取扫描器实例
     * @returns 增量扫描器实例
     */
    getScanner(): IncrementalNetworkImageScanner {
        return this.scanner;
    }
    
    /**
     * 获取缓存管理器实例
     * @returns 缓存管理器实例
     */
    getCacheManager(): NetworkImageCacheManager {
        return this.cacheManager;
    }
}

export default NetworkImageScannerAPI;