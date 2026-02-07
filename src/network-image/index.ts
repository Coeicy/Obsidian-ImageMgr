/**
 * 网络图片缓存与增量扫描系统 - 主入口
 * 
 * @file 系统主入口文件，导出所有模块
 * @module NetworkImageCachingSystem
 * @version 1.0.0
 * @date 2025-01-25
 */

// 类型定义
export * from './types';

// 核心模块
export { IndexedDBManager, createIndexedDBManager, DB_NAME, DB_VERSION } from './indexeddb-manager';
export { FileCacheAdapter } from './file-cache-adapter';
export { NetworkImageCacheManager, DEFAULT_CACHE_CONFIG } from './cache-manager';
export { IncrementalNetworkImageScanner } from './incremental-scanner';
export { ScanErrorHandler } from './error-handler';
export { NetworkImageScannerAPI } from './api';

// 工具函数
export * from './utils';

// 接口定义
export type { NetworkImageScannerInterface } from './incremental-scanner';
