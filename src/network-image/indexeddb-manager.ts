/**
 * IndexedDB 管理器
 * 
 * @file 负责 IndexedDB 数据库的初始化、对象存储创建和索引管理
 * @module IndexedDBManager
 */

import { ObjectStore } from './types';

// 数据库配置常量
export const DB_NAME = 'ImageMgrNetworkImages';
export const DB_VERSION = 1;

/**
 * IndexedDB 管理器类
 * 提供数据库连接管理、对象存储创建和版本控制功能
 */
export class IndexedDBManager {
    private db: IDBDatabase | null = null;
    private readonly dbName: string;
    private readonly dbVersion: number;
    
    /**
     * 创建 IndexedDB 管理器实例
     * @param dbName - 数据库名称
     * @param dbVersion - 数据库版本
     */
    constructor(dbName: string = DB_NAME, dbVersion: number = DB_VERSION) {
        this.dbName = dbName;
        this.dbVersion = dbVersion;
    }
    
    /**
     * 初始化数据库
     * 如果数据库不存在则创建，如果版本升级则执行迁移
     * @returns 数据库实例
     * @throws 如果数据库初始化失败则抛出错误
     */
    async init(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            // 检查浏览器是否支持 IndexedDB
            if (!window.indexedDB) {
                reject(new Error('IndexedDB is not supported in this environment'));
                return;
            }
            
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(new Error(`Failed to open database: ${request.error?.message || 'Unknown error'}`));
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log(`Successfully opened database: ${this.dbName} (version: ${this.dbVersion})`);
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                console.log(`Database upgrade needed: ${event.oldVersion} -> ${this.dbVersion}`);
                const db = (event.target as IDBOpenDBRequest).result;
                const oldVersion = event.oldVersion;
                
                // 创建对象存储和索引
                this.createObjectStores(db, oldVersion);
            };
            
            request.onblocked = () => {
                console.warn('Database open blocked. Close other tabs using this database.');
            };
        });
    }
    
    /**
     * 创建对象存储和索引
     * @param db - 数据库实例
     * @param oldVersion - 旧版本号
     */
    private createObjectStores(db: IDBDatabase, oldVersion: number): void {
        // 网络图片表
        if (!db.objectStoreNames.contains(ObjectStore.IMAGES)) {
            console.log('Creating object store:', ObjectStore.IMAGES);
            const imageStore = db.createObjectStore(ObjectStore.IMAGES, { 
                keyPath: 'id',
                autoIncrement: false 
            });
            
            // 创建索引
            imageStore.createIndex('by-url', 'url', { unique: false });
            imageStore.createIndex('by-source-file', 'sourceFilePath', { unique: false });
            imageStore.createIndex('by-status', 'status', { unique: false });
            imageStore.createIndex('by-last-validated', 'lastValidated', { unique: false });
            imageStore.createIndex('by-created-at', 'createdAt', { unique: false });
            imageStore.createIndex('by-last-accessed', 'lastAccessed', { unique: false });
            console.log('Created indexes for', ObjectStore.IMAGES);
        }
        
        // 扫描文件表
        if (!db.objectStoreNames.contains(ObjectStore.FILES)) {
            console.log('Creating object store:', ObjectStore.FILES);
            const fileStore = db.createObjectStore(ObjectStore.FILES, { 
                keyPath: 'id',
                autoIncrement: false 
            });
            
            fileStore.createIndex('by-mtime', 'mtime', { unique: false });
            fileStore.createIndex('by-status', 'status', { unique: false });
            fileStore.createIndex('by-needs-rescan', 'needsRescan', { unique: false });
            fileStore.createIndex('by-last-scanned', 'lastScanned', { unique: false });
            console.log('Created indexes for', ObjectStore.FILES);
        }
        
        // 元数据表
        if (!db.objectStoreNames.contains(ObjectStore.METADATA)) {
            console.log('Creating object store:', ObjectStore.METADATA);
            db.createObjectStore(ObjectStore.METADATA, { 
                keyPath: 'id',
                autoIncrement: false 
            });
        }
        
        // 黑名单表
        if (!db.objectStoreNames.contains(ObjectStore.BLACKLIST)) {
            console.log('Creating object store:', ObjectStore.BLACKLIST);
            const blacklistStore = db.createObjectStore(ObjectStore.BLACKLIST, { 
                keyPath: 'id',
                autoIncrement: false 
            });
            
            blacklistStore.createIndex('by-detected-at', 'detectedAt', { unique: false });
            blacklistStore.createIndex('by-reason', 'reason', { unique: false });
            blacklistStore.createIndex('by-auto-remove', 'autoRemove', { unique: false });
            console.log('Created indexes for', ObjectStore.BLACKLIST);
        }
        
        // 处理版本升级逻辑
        if (oldVersion < 1) {
            // 版本 1 的初始化逻辑
            console.log('Performing version 1 initialization');
        }
    }
    
    /**
     * 获取数据库实例
     * @returns 数据库实例
     * @throws 如果数据库未初始化则抛出错误
     */
    getDB(): IDBDatabase {
        if (!this.db) {
            throw new Error('Database not initialized. Call init() first.');
        }
        return this.db;
    }
    
    /**
     * 检查数据库是否已初始化
     * @returns 是否已初始化
     */
    isInitialized(): boolean {
        return this.db !== null;
    }
    
    /**
     * 关闭数据库连接
     */
    close(): void {
        if (this.db) {
            console.debug('Closing database connection:', this.dbName);
            this.db.close();
            this.db = null;
        }
    }
    
    /**
     * 删除数据库
     * @returns 删除成功的 Promise
     * @throws 如果删除失败则抛出错误
     */
    async deleteDatabase(): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log('Deleting database:', this.dbName);
            
            // 先关闭现有连接
            this.close();
            
            const request = indexedDB.deleteDatabase(this.dbName);
            
            request.onsuccess = () => {
                console.log('Database deleted successfully:', this.dbName);
                resolve();
            };
            
            request.onerror = () => {
                console.error('Failed to delete database:', request.error);
                reject(new Error(`Failed to delete database: ${request.error?.message || 'Unknown error'}`));
            };
            
            request.onblocked = () => {
                console.warn('Database deletion blocked. Close all connections first.');
                reject(new Error('Database deletion blocked. Close all connections first.'));
            };
        });
    }
    
    /**
     * 获取数据库信息
     * @returns 数据库信息对象
     */
    getDatabaseInfo(): { name: string; version: number; initialized: boolean } {
        return {
            name: this.dbName,
            version: this.dbVersion,
            initialized: this.isInitialized()
        };
    }
}

/**
 * 创建默认的 IndexedDB 管理器实例
 * @returns IndexedDB 管理器实例
 */
export function createIndexedDBManager(): IndexedDBManager {
    return new IndexedDBManager(DB_NAME, DB_VERSION);
}

export default IndexedDBManager;