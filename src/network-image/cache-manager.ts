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
     * 使用 IDBCursor 优化大库性能
     * @returns 删除的图片数量
     */
    async cleanupLRU(): Promise<number> {
        try {
            const tx = this.db.transaction([ObjectStore.IMAGES], 'readwrite');
            const store = tx.objectStore(ObjectStore.IMAGES);
            const index = store.index('by-last-accessed');
            
            // 首先获取总数
            let totalCount = 0;
            try {
                const countRequest = store.count();
                totalCount = await new Promise<number>((resolve, reject) => {
                    countRequest.onsuccess = () => resolve(countRequest.result);
                    countRequest.onerror = () => reject(countRequest.error);
                });
            } catch (countError) {
                console.warn('Failed to get count, using alternative method:', countError);
                // 尝试使用 getAll() 获取总数
                try {
                    const getAllRequest = store.getAll();
                    const images = await new Promise<any[]>((resolve, reject) => {
                        getAllRequest.onsuccess = () => resolve((getAllRequest.result || []));
                        getAllRequest.onerror = () => reject(getAllRequest.error);
                    });
                    totalCount = images.length;
                } catch (getAllError) {
                    console.warn('Failed to get images, assuming no images to clean:', getAllError);
                    return 0;
                }
            }
            
            const toDelete = Math.max(0, totalCount - this.config.maxCacheSize);
            
            if (toDelete > 0) {
                console.log(`LRU cleanup: removing ${toDelete} oldest images (total: ${totalCount})`);
                
                let deletedCount = 0;
                try {
                    // 尝试使用 getAll() 获取所有图片，然后删除最旧的
                    const getAllRequest = store.getAll();
                    const images = await new Promise<any[]>((resolve, reject) => {
                        getAllRequest.onsuccess = () => resolve((getAllRequest.result || []));
                        getAllRequest.onerror = () => reject(getAllRequest.error);
                    });
                    
                    // 按最后访问时间排序
                    images.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));
                    
                    // 删除最旧的图片
                    for (let i = 0; i < toDelete && i < images.length; i++) {
                        try {
                            await new Promise<void>((resolve, reject) => {
                                const deleteRequest = store.delete(images[i].id);
                                deleteRequest.onsuccess = () => resolve();
                                deleteRequest.onerror = () => reject(deleteRequest.error);
                            });
                            deletedCount++;
                        } catch (deleteError) {
                            console.warn('Failed to delete image:', deleteError);
                        }
                    }
                } catch (getAllError) {
                    console.warn('Failed to get images using getAll(), trying cursor:', getAllError);
                    try {
                        // 检查 openCursor() 方法是否存在
                        if (typeof index.openCursor === 'function') {
                            // 尝试使用 openCursor()
                            await new Promise<void>((resolve) => {
                                try {
                                    const cursorRequest = index.openCursor(); // 默认升序，即最久未访问的在前
                                    cursorRequest.onsuccess = (event) => {
                                        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                                        if (cursor && deletedCount < toDelete) {
                                            cursor.delete();
                                            deletedCount++;
                                            cursor.continue();
                                        } else {
                                            resolve();
                                        }
                                    };
                                    cursorRequest.onerror = () => {
                                        console.warn('Cursor request failed:', cursorRequest.error);
                                        resolve();
                                    };
                                } catch (error) {
                                    console.warn('Failed to use cursor:', error);
                                    resolve();
                                }
                            });
                        } else {
                            console.warn('openCursor() is not available for index');
                        }
                    } catch (cursorError) {
                        console.warn('Failed to use cursor:', cursorError);
                    }
                }
                
                console.log(`LRU cleanup completed: removed ${deletedCount} images`);
                return deletedCount;
            } else {
                console.log(`LRU cleanup: no images to remove (${totalCount}/${this.config.maxCacheSize})`);
                return 0;
            }
        } catch (error: any) {
            console.error('LRU cleanup failed:', error);
            // 不抛出错误，避免影响主流程
            return 0;
        }
    }
    
    /**
     * TTL 清理策略
     * 清理过期的验证结果、元数据和黑名单记录
     * 使用 IDBCursor 优化大库性能
     * @returns 清理统计
     */
    async cleanupTTL(): Promise<{ images: number; files: number; blacklist: number }> {
        const now = Date.now();
        const result = { images: 0, files: 0, blacklist: 0 };
        
        try {
            // 1. 清理过期的图片验证结果和元数据
            const imageTx = this.db.transaction([ObjectStore.IMAGES], 'readwrite');
            const imageStore = imageTx.objectStore(ObjectStore.IMAGES);
            
            try {
                // 尝试使用 getAll() 作为最兼容的方案
                const getAllRequest = imageStore.getAll();
                const images = await new Promise<any[]>((resolve, reject) => {
                    getAllRequest.onsuccess = () => resolve((getAllRequest.result || []));
                    getAllRequest.onerror = () => reject(getAllRequest.error);
                });
                
                for (const image of images) {
                    const age = now - (image.lastValidated || 0);
                    
                    // 如果超过元数据 TTL，清除验证结果和元数据
                    if (age > this.config.metadataTTL) {
                        image.validationResult = undefined;
                        image.metadata = undefined;
                        image.status = 'pending'; // 重置状态以便重新验证
                        image.updatedAt = now;
                        
                        try {
                            await new Promise<void>((resolve, reject) => {
                                const updateRequest = imageStore.put(image);
                                updateRequest.onsuccess = () => resolve();
                                updateRequest.onerror = () => reject(updateRequest.error);
                            });
                            result.images++;
                        } catch (updateError) {
                            console.warn('Failed to update image:', updateError);
                        }
                    }
                }
            } catch (getAllError) {
                console.warn('Failed to get images using getAll(), trying cursor:', getAllError);
                try {
                    // 检查 openCursor() 方法是否存在
                    if (typeof imageStore.openCursor === 'function') {
                        // 尝试使用 openCursor()
                        await new Promise<void>((resolve) => {
                            try {
                                const cursorRequest = imageStore.openCursor();
                                cursorRequest.onsuccess = (event) => {
                                    const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                                    if (cursor) {
                                        const image = cursor.value;
                                        const age = now - (image.lastValidated || 0);
                                        
                                        // 如果超过元数据 TTL，清除验证结果和元数据
                                        if (age > this.config.metadataTTL) {
                                            image.validationResult = undefined;
                                            image.metadata = undefined;
                                            image.status = 'pending'; // 重置状态以便重新验证
                                            image.updatedAt = now;
                                            
                                            cursor.update(image);
                                            result.images++;
                                        }
                                        cursor.continue();
                                    } else {
                                        resolve();
                                    }
                                };
                                cursorRequest.onerror = () => {
                                    console.warn('Cursor request failed:', cursorRequest.error);
                                    resolve();
                                };
                            } catch (error) {
                                console.warn('Failed to use cursor for images:', error);
                                resolve();
                            }
                        });
                    } else {
                        console.warn('openCursor() is not available for imageStore');
                    }
                } catch (cursorError) {
                    console.warn('Failed to use cursor for images:', cursorError);
                }
            }
            
            if (result.images > 0) {
                console.log(`TTL cleanup: cleared metadata for ${result.images} images`);
            }
            
            // 2. 清理过期的黑名单记录
            const blacklistTx = this.db.transaction([ObjectStore.BLACKLIST], 'readwrite');
            const blacklistStore = blacklistTx.objectStore(ObjectStore.BLACKLIST);
            
            try {
                // 尝试使用 getAll() 作为最兼容的方案
                const getAllRequest = blacklistStore.getAll();
                const blacklistItems = await new Promise<any[]>((resolve, reject) => {
                    getAllRequest.onsuccess = () => resolve((getAllRequest.result || []));
                    getAllRequest.onerror = () => reject(getAllRequest.error);
                });
                
                for (const item of blacklistItems) {
                    const age = now - (item.detectedAt || 0);
                    
                    // 如果超过黑名单 TTL 且允许自动移除，则删除
                    if (age > this.config.blacklistTTL && item.autoRemove) {
                        try {
                            await new Promise<void>((resolve, reject) => {
                                const deleteRequest = blacklistStore.delete(item.id);
                                deleteRequest.onsuccess = () => resolve();
                                deleteRequest.onerror = () => reject(deleteRequest.error);
                            });
                            result.blacklist++;
                        } catch (deleteError) {
                            console.warn('Failed to delete blacklist item:', deleteError);
                        }
                    }
                }
            } catch (getAllError) {
                console.warn('Failed to get blacklist items using getAll(), trying cursor:', getAllError);
                try {
                    // 检查 openCursor() 方法是否存在
                    if (typeof blacklistStore.openCursor === 'function') {
                        // 尝试使用 openCursor()
                        await new Promise<void>((resolve) => {
                            try {
                                const cursorRequest = blacklistStore.openCursor();
                                cursorRequest.onsuccess = (event) => {
                                    const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                                    if (cursor) {
                                        const item = cursor.value;
                                        const age = now - (item.detectedAt || 0);
                                        
                                        // 如果超过黑名单 TTL 且允许自动移除，则删除
                                        if (age > this.config.blacklistTTL && item.autoRemove) {
                                            cursor.delete();
                                            result.blacklist++;
                                        }
                                        cursor.continue();
                                    } else {
                                        resolve();
                                    }
                                };
                                cursorRequest.onerror = () => {
                                    console.warn('Cursor request failed:', cursorRequest.error);
                                    resolve();
                                };
                            } catch (error) {
                                console.warn('Failed to use cursor for blacklist:', error);
                                resolve();
                            }
                        });
                    } else {
                        console.warn('openCursor() is not available for blacklistStore');
                    }
                } catch (cursorError) {
                    console.warn('Failed to use cursor for blacklist:', cursorError);
                }
            }
            
            if (result.blacklist > 0) {
                console.log(`TTL cleanup: removed ${result.blacklist} expired blacklist entries`);
            }
            
            console.log(`TTL cleanup completed: ${JSON.stringify(result)}`);
            return result;
        } catch (error: any) {
            console.error('TTL cleanup failed:', error);
            // 不抛出错误，避免影响主流程
            return result;
        }
    }
    
    /**
     * 清理孤立图片（没有对应文件的图片）
     * 使用 IDBCursor 优化大库性能
     * @returns 删除的图片数量
     */
    async cleanupOrphanedImages(): Promise<number> {
        try {
            const tx = this.db.transaction([ObjectStore.IMAGES, ObjectStore.FILES], 'readonly');
            const imageStore = tx.objectStore(ObjectStore.IMAGES);
            const fileStore = tx.objectStore(ObjectStore.FILES);
            
            // 1. 获取所有存在的文件路径 ID（仅存储 ID 以节省内存）
            const filePaths = new Set<string>();
            await new Promise<void>((resolve, reject) => {
                try {
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
                            console.warn('openCursor() is not available for fileStore');
                            resolve();
                        }
                    };
                } catch (error) {
                    // 如果所有方法都失败，使用空集合继续执行
                    console.warn('Failed to access file store:', error);
                    resolve();
                }
            });
            
            // 2. 找出孤立的图片
            const orphaned: string[] = [];
            await new Promise<void>((resolve, reject) => {
                try {
                    // 尝试使用 getAll() 作为最兼容的方案
                    const getAllRequest = imageStore.getAll();
                    getAllRequest.onsuccess = (event) => {
                        // Handle both real IDBRequest events and mock events from file-cache-adapter
                        const result = event && event.target ? (event.target as IDBRequest<any[]>).result : getAllRequest.result;
                        const images = result || [];
                        images.forEach(image => {
                            if (!filePaths.has(image.sourceFilePath)) {
                                orphaned.push(image.id);
                            }
                        });
                        resolve();
                    };
                    getAllRequest.onerror = () => {
                        // 如果 getAll() 失败，检查 openCursor() 方法是否存在
                        if (typeof imageStore.openCursor === 'function') {
                            try {
                                const cursorRequest = imageStore.openCursor();
                                cursorRequest.onsuccess = (event) => {
                                    const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                                    if (cursor) {
                                        const image = cursor.value;
                                        if (!filePaths.has(image.sourceFilePath)) {
                                            orphaned.push(image.id);
                                        }
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
                                // 如果所有方法都失败，使用空数组继续执行
                                console.warn('Failed to get images:', cursorError);
                                resolve();
                            }
                        } else {
                            // 如果 openCursor() 也不存在，使用空数组继续执行
                            console.warn('openCursor() is not available for imageStore');
                            resolve();
                        }
                    };
                } catch (error) {
                    // 如果所有方法都失败，使用空数组继续执行
                    console.warn('Failed to access image store:', error);
                    resolve();
                }
            });
            
            // 3. 删除孤立图片
            if (orphaned.length > 0) {
                console.log(`Found ${orphaned.length} orphaned images to delete`);
                
                try {
                    const deleteTx = this.db.transaction([ObjectStore.IMAGES], 'readwrite');
                    const deleteStore = deleteTx.objectStore(ObjectStore.IMAGES);
                    
                    for (const id of orphaned) {
                        try {
                            await new Promise<void>((resolve, reject) => {
                                const deleteRequest = deleteStore.delete(id);
                                deleteRequest.onsuccess = () => resolve();
                                deleteRequest.onerror = () => reject(deleteRequest.error);
                            });
                        } catch (deleteError) {
                            console.warn('Failed to delete orphaned image:', deleteError);
                        }
                    }
                    
                    console.log(`Deleted ${orphaned.length} orphaned images`);
                } catch (deleteTxError) {
                    console.warn('Failed to create delete transaction:', deleteTxError);
                }
            } else {
                console.log('No orphaned images found');
            }
            
            return orphaned.length;
        } catch (error: any) {
            console.error('Orphaned images cleanup failed:', error);
            // 不抛出错误，避免影响主流程
            return 0;
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
        } catch (error: any) {
            console.warn('Failed to update access stats:', error);
            // 不抛出错误，避免影响主流程
        }
    }
    
    /**
     * 获取缓存统计信息
     * 使用 IDBCursor 优化大库性能，避免 store.getAll() 导致的内存峰值
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
            
            const now = Date.now();
            const stats: CacheStats = {
                totalImages: 0,
                totalFiles: 0,
                totalBlacklist: 0,
                activeImages: 0,
                brokenImages: 0,
                deletedImages: 0,
                databaseSize: 0,
                lastCleanup: now,
                cacheHitRate: 0
            };

            // 1. 获取计数
            const [totalImages, totalFiles, totalBlacklist] = await Promise.all([
                this.countStore(imageStore),
                this.countStore(fileStore),
                this.countStore(blacklistStore)
            ]);
            
            stats.totalImages = totalImages;
            stats.totalFiles = totalFiles;
            stats.totalBlacklist = totalBlacklist;

            // 2. 使用游标遍历图片统计状态和命中率
            let totalAccessCount = 0;
            let estimatedSize = 0;

            await new Promise<void>((resolve) => {
                try {
                    // 检查 openCursor() 方法是否存在
                    if (typeof imageStore.openCursor === 'function') {
                        const cursorRequest = imageStore.openCursor();
                        cursorRequest.onsuccess = (event) => {
                            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                            if (cursor) {
                                const img = cursor.value;
                                
                                // 统计状态
                                if (img.status === 'active') stats.activeImages++;
                                else if (img.status === 'broken') stats.brokenImages++;
                                else if (img.status === 'deleted') stats.deletedImages++;
                                
                                // 统计访问次数用于计算命中率
                                totalAccessCount += (img.accessCount || 0);
                                
                                // 估算大小 (JSON 序列化后的近似长度)
                                estimatedSize += JSON.stringify(img).length;
                                
                                cursor.continue();
                            } else {
                                resolve();
                            }
                        };
                        cursorRequest.onerror = () => {
                            console.warn('Cursor request failed:', cursorRequest.error);
                            resolve();
                        };
                    } else {
                        // 如果 openCursor() 不存在，尝试使用 getAll() 作为替代
                        if (typeof imageStore.getAll === 'function') {
                            const getAllRequest = imageStore.getAll();
                            getAllRequest.onsuccess = (event) => {
                                // Handle both real IDBRequest events and mock events from file-cache-adapter
                                const result = event && event.target ? (event.target as IDBRequest<any[]>).result : getAllRequest.result;
                                const images = result || [];
                                images.forEach(img => {
                                    // 统计状态
                                    if (img.status === 'active') stats.activeImages++;
                                    else if (img.status === 'broken') stats.brokenImages++;
                                    else if (img.status === 'deleted') stats.deletedImages++;
                                    
                                    // 统计访问次数用于计算命中率
                                    totalAccessCount += (img.accessCount || 0);
                                    
                                    // 估算大小 (JSON 序列化后的近似长度)
                                    estimatedSize += JSON.stringify(img).length;
                                });
                                resolve();
                            };
                            getAllRequest.onerror = () => {
                                console.warn('getAll() request failed:', getAllRequest.error);
                                resolve();
                            };
                        } else {
                            console.warn('Neither openCursor() nor getAll() is available for imageStore');
                            resolve();
                        }
                    }
                } catch (error) {
                    console.warn('Failed to get image stats:', error);
                    resolve();
                }
            });

            // 估算其他表的大小
            const filesSize = await this.estimateStoreSize(fileStore);
            const blacklistSize = await this.estimateStoreSize(blacklistStore);
            stats.databaseSize = estimatedSize + filesSize + blacklistSize;

            // 计算命中率：活跃图片占比 (简单逻辑)
            if (stats.totalImages > 0) {
                stats.cacheHitRate = (stats.activeImages / stats.totalImages) * 100;
            }
            
            return stats;
        } catch (error: any) {
            console.error('Failed to get cache stats:', error);
            throw new Error(`Failed to get cache stats: ${error.message}`);
        }
    }

    /**
     * 计数存储中的记录
     */
    private countStore(store: IDBObjectStore): Promise<number> {
        return new Promise((resolve, reject) => {
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 估算存储大小
     */
    private async estimateStoreSize(store: IDBObjectStore): Promise<number> {
        let size = 0;
        await new Promise<void>((resolve) => {
            try {
                // 检查 openCursor() 方法是否存在
                if (typeof store.openCursor === 'function') {
                    const cursorRequest = store.openCursor();
                    cursorRequest.onsuccess = (event) => {
                        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                        if (cursor) {
                            size += JSON.stringify(cursor.value).length;
                            cursor.continue();
                        } else {
                            resolve();
                        }
                    };
                    cursorRequest.onerror = () => {
                        console.warn('Cursor request failed:', cursorRequest.error);
                        resolve();
                    };
                } else {
                    // 如果 openCursor() 不存在，尝试使用 getAll() 作为替代
                    if (typeof store.getAll === 'function') {
                        const getAllRequest = store.getAll();
                        getAllRequest.onsuccess = (event) => {
                            // Handle both real IDBRequest events and mock events from file-cache-adapter
                            const result = event && event.target ? (event.target as IDBRequest<any[]>).result : getAllRequest.result;
                            const items = result || [];
                            items.forEach(item => {
                                size += JSON.stringify(item).length;
                            });
                            resolve();
                        };
                        getAllRequest.onerror = () => {
                            console.warn('getAll() request failed:', getAllRequest.error);
                            resolve();
                        };
                    } else {
                        console.warn('Neither openCursor() nor getAll() is available for store');
                        resolve();
                    }
                }
            } catch (error) {
                console.warn('Failed to estimate store size:', error);
                resolve();
            }
        });
        return size;
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
    

}

export default NetworkImageCacheManager;