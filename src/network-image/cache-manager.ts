/**
 * 缓存管理器
 * 
 * @file 实现 LRU 和 TTL 缓存策略，管理网络图片缓存
 * @module NetworkImageCacheManager
 */

import { ObjectStore, CacheStats } from './types';

/**
 * 缓存配置接口
 */
export interface CacheConfig {
    /** LRU 缓存大小限制 */
    maxCacheSize: number;
    
    /** 验证 TTL（多久后重新验证） */
    validationTTL: number;
    
    /** 元数据 TTL（多久后清理元数据） */
    metadataTTL: number;
    
    /** 黑名单最大大小 */
    blacklistMaxSize: number;
    
    /** 黑名单 TTL */
    blacklistTTL: number;
    
    /** 批量操作大小 */
    batchSize: number;
    
    /** 验证批量大小 */
    validationBatchSize: number;
}

/**
 * 默认缓存配置
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
    maxCacheSize: 1000,           // 最多缓存 1000 张图片
    validationTTL: 24 * 60 * 60 * 1000,  // 24 小时后重新验证
    metadataTTL: 7 * 24 * 60 * 60 * 1000,  // 7 天后清理元数据
    blacklistMaxSize: 500,        // 黑名单最多 500 条
    blacklistTTL: 30 * 24 * 60 * 60 * 1000,  // 30 天后自动移出
    batchSize: 50,                // 每批处理 50 个文件
    validationBatchSize: 20       // 每批验证 20 个图片
};

/**
 * 网络图片缓存管理器
 * 提供 LRU 清理、TTL 清理、孤立记录清理等功能
 */
export class NetworkImageCacheManager {
    private db: IDBDatabase;
    private readonly config: CacheConfig;
    
    /**
     * 创建缓存管理器实例
     * @param db - IndexedDB 数据库实例
     * @param config - 缓存配置（可选）
     */
    constructor(db: IDBDatabase, config: Partial<CacheConfig> = {}) {
        this.db = db;
        this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    }

    /** 获取数据库实例（供 API 层使用） */
    getDb(): IDBDatabase {
        return this.db;
    }
    
    /**
     * LRU 清理策略
     * 删除最久未访问的图片，直到缓存大小符合限制
     * @returns 删除的图片数量
     */
    async cleanupLRU(): Promise<number> {
        try {
            const tx = this.db.transaction([ObjectStore.IMAGES], 'readwrite');
            const store = tx.objectStore(ObjectStore.IMAGES);
            const index = store.index('by-last-accessed');
            
            // 获取所有图片，按最后访问时间排序（最久未访问的在前面）
            const images = await this.getAllFromIndex(index);
            const toDelete = Math.max(0, images.length - this.config.maxCacheSize);
            
            if (toDelete > 0) {
                console.log(`LRU cleanup: removing ${toDelete} oldest images`);
                
                // 删除最久未访问的图片
                for (let i = 0; i < toDelete; i++) {
                    await store.delete(images[i].id);
                }
                
                console.log(`LRU cleanup completed: removed ${toDelete} images`);
            } else {
                console.log(`LRU cleanup: no images to remove (${images.length}/${this.config.maxCacheSize})`);
            }
            
            return toDelete;
        } catch (error) {
            console.error('LRU cleanup failed:', error);
            throw new Error(`LRU cleanup failed: ${error.message}`);
        }
    }
    
    /**
     * TTL 清理策略
     * 清理过期的验证结果、元数据和黑名单记录
     * @returns 清理统计
     */
    async cleanupTTL(): Promise<{ images: number; files: number; blacklist: number }> {
        const now = Date.now();
        const result = { images: 0, files: 0, blacklist: 0 };
        
        try {
            // 1. 清理过期的图片验证结果和元数据
            const imageTx = this.db.transaction([ObjectStore.IMAGES], 'readwrite');
            const imageStore = imageTx.objectStore(ObjectStore.IMAGES);
            const images = await this.getAllFromStore(imageStore);
            
            for (const image of images) {
                const age = now - image.lastValidated;
                
                // 如果超过元数据 TTL，清除验证结果和元数据
                if (age > this.config.metadataTTL) {
                    image.validationResult = undefined;
                    image.metadata = undefined;
                    image.status = 'pending'; // 重置状态以便重新验证
                    image.updatedAt = now;
                    
                    await imageStore.put(image);
                    result.images++;
                }
            }
            
            if (result.images > 0) {
                console.log(`TTL cleanup: cleared metadata for ${result.images} images`);
            }
            
            // 2. 清理过期的黑名单记录
            const blacklistTx = this.db.transaction([ObjectStore.BLACKLIST], 'readwrite');
            const blacklistStore = blacklistTx.objectStore(ObjectStore.BLACKLIST);
            const blacklistIndex = blacklistStore.index('by-detected-at');
            const blacklisted = await this.getAllFromIndex(blacklistIndex);
            
            for (const item of blacklisted) {
                const age = now - item.detectedAt;
                
                // 如果超过黑名单 TTL 且允许自动移除，则删除
                if (age > this.config.blacklistTTL && item.autoRemove) {
                    await blacklistStore.delete(item.id);
                    result.blacklist++;
                }
            }
            
            if (result.blacklist > 0) {
                console.log(`TTL cleanup: removed ${result.blacklist} expired blacklist entries`);
            }
            
            console.log(`TTL cleanup completed: ${JSON.stringify(result)}`);
            return result;
        } catch (error) {
            console.error('TTL cleanup failed:', error);
            throw new Error(`TTL cleanup failed: ${error.message}`);
        }
    }
    
    /**
     * 清理孤立图片（没有对应文件的图片）
     * @returns 删除的图片数量
     */
    async cleanupOrphanedImages(): Promise<number> {
        try {
            const tx = this.db.transaction([ObjectStore.IMAGES, ObjectStore.FILES], 'readonly');
            const imageStore = tx.objectStore(ObjectStore.IMAGES);
            const fileStore = tx.objectStore(ObjectStore.FILES);
            
            // 获取所有图片和文件
            const images = await this.getAllFromStore(imageStore);
            const files = await this.getAllFromStore(fileStore);
            
            // 构建文件路径集合
            const filePaths = new Set(files.map(f => f.id));
            const orphaned: string[] = [];
            
            // 找出孤立的图片（对应的文件不存在）
            for (const image of images) {
                if (!filePaths.has(image.sourceFilePath)) {
                    orphaned.push(image.id);
                }
            }
            
            // 删除孤立图片
            if (orphaned.length > 0) {
                console.log(`Found ${orphaned.length} orphaned images to delete`);
                
                const deleteTx = this.db.transaction([ObjectStore.IMAGES], 'readwrite');
                const deleteStore = deleteTx.objectStore(ObjectStore.IMAGES);
                
                for (const id of orphaned) {
                    await deleteStore.delete(id);
                }
                
                console.log(`Deleted ${orphaned.length} orphaned images`);
            } else {
                console.log('No orphaned images found');
            }
            
            return orphaned.length;
        } catch (error) {
            console.error('Orphaned images cleanup failed:', error);
            throw new Error(`Orphaned images cleanup failed: ${error.message}`);
        }
    }
    
    /**
     * 更新图片访问统计
     * @param imageId - 图片 ID
     */
    async updateAccessStats(imageId: string): Promise<void> {
        try {
            const tx = this.db.transaction([ObjectStore.IMAGES], 'readwrite');
            const store = tx.objectStore(ObjectStore.IMAGES);
            
            const image = await this.getFromStore(store, imageId);
            if (image) {
                image.accessCount = (image.accessCount || 0) + 1;
                image.lastAccessed = Date.now();
                
                await store.put(image);
                console.debug(`Updated access stats for image: ${imageId}`);
            }
        } catch (error) {
            console.warn('Failed to update access stats:', error);
            // 不抛出错误，避免影响主流程
        }
    }
    
    /**
     * 获取缓存统计信息
     * @returns 缓存统计
     */
    async getCacheStats(): Promise<CacheStats> {
        try {
            const tx = this.db.transaction([
                ObjectStore.IMAGES, 
                ObjectStore.FILES, 
                ObjectStore.BLACKLIST
            ], 'readonly');
            
            const imageStore = tx.objectStore(ObjectStore.IMAGES);
            const fileStore = tx.objectStore(ObjectStore.FILES);
            const blacklistStore = tx.objectStore(ObjectStore.BLACKLIST);
            
            // 获取所有记录
            const images = await this.getAllFromStore(imageStore);
            const files = await this.getAllFromStore(fileStore);
            const blacklist = await this.getAllFromStore(blacklistStore);
            
            const now = Date.now();
            
            // 计算统计数据
            const stats: CacheStats = {
                totalImages: images.length,
                totalFiles: files.length,
                totalBlacklist: blacklist.length,
                activeImages: images.filter(img => img.status === 'active').length,
                brokenImages: images.filter(img => img.status === 'broken').length,
                deletedImages: images.filter(img => img.status === 'deleted').length,
                databaseSize: this.estimateDatabaseSize(images, files, blacklist),
                lastCleanup: now,
                cacheHitRate: this.calculateCacheHitRate(images)
            };
            
            return stats;
        } catch (error) {
            console.error('Failed to get cache stats:', error);
            throw new Error(`Failed to get cache stats: ${error.message}`);
        }
    }
    
    /**
     * 执行完整清理
     * @param lru - 是否执行 LRU 清理
     * @param ttl - 是否执行 TTL 清理
     * @param orphaned - 是否清理孤立图片
     * @returns 清理结果
     */
    async cleanup(options: {
        lru?: boolean;
        ttl?: boolean;
        orphaned?: boolean;
    } = {}): Promise<{ images: number; files: number; blacklist: number }> {
        const result = { images: 0, files: 0, blacklist: 0 };
        
        if (options.lru !== false) {
            result.images += await this.cleanupLRU();
        }
        
        if (options.ttl !== false) {
            const ttlResult = await this.cleanupTTL();
            result.images += ttlResult.images;
            result.files += ttlResult.files;
            result.blacklist += ttlResult.blacklist;
        }
        
        if (options.orphaned !== false) {
            result.images += await this.cleanupOrphanedImages();
        }
        
        console.log(`Full cleanup completed: ${JSON.stringify(result)}`);
        return result;
    }
    
    /**
     * 从存储获取所有记录
     * @param store - 对象存储
     * @returns 所有记录
     */
    private getAllFromStore(store: IDBObjectStore): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * 从索引获取所有记录
     * @param index - 索引
     * @returns 所有记录
     */
    private getAllFromIndex(index: IDBIndex): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const request = index.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * 从存储获取单条记录
     * @param store - 对象存储
     * @param key - 主键
     * @returns 记录或 undefined
     */
    private getFromStore(store: IDBObjectStore, key: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * 估算数据库大小
     */
    private estimateDatabaseSize(images: any[], files: any[], blacklist: any[]): number {
        try {
            // 简单估算：将所有数据序列化为 JSON 后计算长度
            const data = { images, files, blacklist };
            return JSON.stringify(data).length;
        } catch {
            // 如果估算失败，返回 0
            return 0;
        }
    }
    
    /**
     * 计算缓存命中率
     */
    private calculateCacheHitRate(images: any[]): number {
        if (!images || images.length === 0) {
            return 0;
        }
        
        // 简单的命中率估算：活跃图片 / 总图片
        const activeImages = images.filter(img => img.status === 'active').length;
        return (activeImages / images.length) * 100;
    }
}

export default NetworkImageCacheManager;