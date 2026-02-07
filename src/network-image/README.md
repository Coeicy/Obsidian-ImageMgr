# 网络图片缓存与增量扫描系统 - 使用文档

## 系统概述

网络图片缓存与增量扫描系统是一个高性能的文档扫描解决方案，通过插件目录下的本地缓存和智能增量算法，实现 10-20 倍的性能提升。

## 缓存数据说明

### 存储位置

缓存存储在**插件文件夹**下，路径为：

```
{仓库}/.obsidian/plugins/imagemgr/network-image-cache/
```

便于备份和迁移（随仓库一起复制即可保留缓存）。

### 缓存包含的内容

缓存由 4 个 JSON 文件组成，仅存储**元数据**（不存储图片二进制数据，图片仍从原始 URL 加载）：

| 文件 | 说明 |
|------|------|
| **images.json** | 网络图片记录：主键为 **文件名+URL 组合** 的 SHA-256 哈希（稳定 ID）；含 name、url、urlHash、nameHash、来源路径、行号、状态、验证结果等；仅改链接或仅改文件名时可承接旧记录 |
| **files.json** | 已扫描文件索引：每个 Markdown 文件的路径、修改时间、内容哈希、包含的网络图片数量与 ID 列表、扫描状态等，用于增量扫描时判断是否需要重新扫描 |
| **metadata.json** | 系统元数据：如最后完整扫描时间、扫描文件总数、网络图片总数、缓存命中率等统计信息 |
| **blacklist.json** | 失效 URL 黑名单：验证失败的图片 URL 及其失效原因（超时、404、403、网络错误等）、来源位置、检测时间等，用于避免重复验证失效链接 |

### 缓存用途

- **增量扫描**：仅扫描有变更的文件，提升扫描速度  
- **快速查询**：快速定位图片来源和状态  
- **错误追踪**：记录失效链接，便于在「空链接检测」等界面展示  
- **性能优化**：缓存验证结果，减少重复网络请求  

### 清理策略

- **LRU**：删除最久未访问的图片记录，控制缓存大小  
- **TTL**：清理过期的验证结果和元数据  
- **孤立记录**：删除来源文件已不存在的图片记录  

### 标识与哈希

- **图片 ID（稳定）**：每条网络图片记录的主键为 **SHA-256(文件名 + "|" + URL)**（64 位十六进制），用于缓存主键与操作记录按图追踪。仅改链接或仅改文件名时，新记录会**承接**旧记录（同一 ID）；同时改链接和文件名则视为新图。
- **黑名单**：仍按 **URL 的 SHA-256** 存储，与图片主键分离。
- **清除缓存**：在插件设置 → 网络图片中可一键清空所有缓存数据（`FileCacheAdapter.clearAll()`），下次扫描将重新建立。

## 安装

```typescript
// 导入模块
import {
    IndexedDBManager,
    NetworkImageScannerAPI,
    NetworkImageCacheManager,
    ScanErrorHandler
} from './network-image';
```

## 快速开始

### 1. 初始化数据库

```typescript
// 创建 IndexedDB 管理器
const dbManager = new IndexedDBManager();

// 初始化数据库
try {
    const db = await dbManager.init();
    console.log('Database initialized successfully');
} catch (error) {
    console.error('Failed to initialize database:', error);
}
```

### 2. 创建网络图片扫描器

```typescript
// 实现网络图片扫描器接口
class NetworkImageScanner implements NetworkImageScannerInterface {
    async scan(filePath: string): Promise<NetworkImageReference[]> {
        // 实现你的扫描逻辑
        // 返回文件中发现的网络图片
        const images: NetworkImageReference[] = [];
        
        // 示例：扫描 Markdown 文件中的图片链接
        // const content = await this.app.vault.adapter.read(filePath);
        // const matches = content.match(/!\[.*?\]\(https?:\/\/[^)]+\)/g) || [];
        // 
        // for (const match of matches) {
        //     const url = match.match(/https?:\/\/[^)]+/)?.[0];
        //     if (url) {
        //         images.push({
        //             url,
        //             line: 0, // 计算行号
        //             index: 0, // 计算列号
        //             originalText: match
        //         });
        //     }
        // }
        
        return images;
    }
}
```

### 3. 创建 API 实例

```typescript
// 创建错误处理器
const errorHandler = new ScanErrorHandler();

// 创建网络图片扫描器
const imageScanner = new NetworkImageScanner();

// 创建 API 实例
const api = new NetworkImageScannerAPI(
    app, // Obsidian App 实例
    db,
    imageScanner,
    errorHandler
);
```

### 4. 执行扫描

```typescript
// 增量扫描（推荐）
const result = await api.scan({
    path: '/',              // 扫描路径（可选）
    incremental: true,       // 启用增量扫描
    validateImages: false    // 是否验证图片
});

console.log('Scan completed:', result);
// {
//     scannedFiles: 150,
//     newImages: 10,
//     updatedImages: 5,
//     cachedImages: 285,
//     deletedImages: 2,
//     totalImages: 300,
//     duration: 3200,
//     cacheHitRate: 95.0,
//     errors: []
// }
```

## API 参考

### IndexedDBManager

数据库管理器，负责 IndexedDB 的初始化和版本控制。

#### 方法

- `init(): Promise<IDBDatabase>` - 初始化数据库
- `getDB(): IDBDatabase` - 获取数据库实例
- `close(): void` - 关闭数据库连接
- `deleteDatabase(): Promise<void>` - 删除数据库
- `getDatabaseInfo(): { name: string; version: number; initialized: boolean }` - 获取数据库信息

#### 示例

```typescript
const dbManager = new IndexedDBManager();
const db = await dbManager.init();

// 使用完后关闭连接
dbManager.close();
```

### NetworkImageScannerAPI

主要 API 接口，提供完整的扫描、搜索、清理和验证功能。

#### 方法

##### 扫描相关

- `scan(options?: ScanOptions): Promise<IncrementalScanResult>` - 增量扫描
- `fullScan(path?: string): Promise<IncrementalScanResult>` - 完整扫描
- `quickScan(path?: string): Promise<IncrementalScanResult>` - 快速扫描

##### 验证相关

- `validateImages(imageIds: string[]): Promise<ValidationResult[]>` - 验证图片有效性

##### 搜索相关

- `searchImages(query: SearchQuery): Promise<SearchResult>` - 搜索图片
- `searchImagesByUrl(url: string): Promise<SearchResult>` - 按 URL 搜索
- `searchImagesByFile(sourceFile: string): Promise<SearchResult>` - 按文件搜索
- `searchImagesByStatus(status: string): Promise<SearchResult>` - 按状态搜索

##### 清理相关

- `cleanup(options?: CleanupOptions): Promise<CleanupResult>` - 清理缓存
- `fullCleanup(): Promise<CleanupResult>` - 完整清理

##### 统计相关

- `getStats(): Promise<CacheStats>` - 获取缓存统计
- `updateImageAccess(imageId: string): Promise<void>` - 更新图片访问统计

#### 示例

```typescript
// 完整扫描
const fullResult = await api.fullScan('/docs');

// 快速扫描
const quickResult = await api.quickScan('/notes');

// 搜索图片
const searchResult = await api.searchImages({
    url: 'example.com',
    status: 'active',
    page: 1,
    pageSize: 20
});

// 验证图片
const validationResults = await api.validateImages(['image-id-1', 'image-id-2']);

// 清理缓存
const cleanupResult = await api.fullCleanup();

// 获取统计
const stats = await api.getStats();
console.log(`Total images: ${stats.totalImages}, Cache hit rate: ${stats.cacheHitRate}%`);
```

### NetworkImageCacheManager

缓存管理器，提供 LRU 和 TTL 缓存策略。

#### 方法

- `cleanupLRU(): Promise<number>` - LRU 清理
- `cleanupTTL(): Promise<{ images: number; files: number; blacklist: number }>` - TTL 清理
- `cleanupOrphanedImages(): Promise<number>` - 清理孤立图片
- `updateAccessStats(imageId: string): Promise<void>` - 更新访问统计
- `getCacheStats(): Promise<CacheStats>` - 获取缓存统计
- `cleanup(options?: { lru?: boolean; ttl?: boolean; orphaned?: boolean }): Promise<{ images: number; files: number; blacklist: number }>` - 执行清理

#### 示例

```typescript
const cacheManager = new NetworkImageCacheManager(db);

// 执行 LRU 清理
const removed = await cacheManager.cleanupLRU();
console.log(`Removed ${removed} images`);

// 获取统计
const stats = await cacheManager.getCacheStats();
```

### ScanErrorHandler

错误处理器，提供错误分类和日志功能。

#### 方法

- `handleError(error: Error, context: ErrorContext): ScanError` - 处理错误
- `getErrorLog(): ScanError[]` - 获取错误日志
- `getErrorsByType(type: ScanErrorType): ScanError[]` - 获取特定类型错误
- `getRetryableErrors(): ScanError[]` - 获取可重试错误
- `clearErrorLog(): void` - 清空错误日志
- `getErrorStats(): { total: number; byType: Record<string, number>; retryable: number; topErrors: Array<{ type: string; count: number }> }>` - 获取错误统计
- `generateErrorReport(): string` - 生成错误报告

#### 示例

```typescript
const errorHandler = new ScanErrorHandler();

// 处理错误
try {
    await someOperation();
} catch (error) {
    const scanError = errorHandler.handleError(error, { file: 'test.md' });
    console.log(`Error type: ${scanError.type}, Retryable: ${scanError.retryable}`);
}

// 获取错误统计
const stats = errorHandler.getErrorStats();
console.log(`Total errors: ${stats.total}, Retryable: ${stats.retryable}`);

// 生成错误报告
const report = errorHandler.generateErrorReport();
console.log(report);
```

## 高级用法

### 自定义缓存配置

```typescript
import { NetworkImageCacheManager, DEFAULT_CACHE_CONFIG } from './network-image';

// 自定义配置
const customConfig = {
    ...DEFAULT_CACHE_CONFIG,
    maxCacheSize: 2000,        // 最多缓存 2000 张图片
    validationTTL: 12 * 60 * 60 * 1000,  // 12 小时后重新验证
    metadataTTL: 3 * 24 * 60 * 60 * 1000   // 3 天后清理元数据
};

const cacheManager = new NetworkImageCacheManager(db, customConfig);
```

### 自定义错误处理

```typescript
import { ScanErrorHandler } from './network-image';

// 创建自定义错误处理器
const errorHandler = new ScanErrorHandler(200, true); // 最大 200 条日志，启用控制台输出

// 注册错误处理回调
errorHandler.handleError(new Error('Test error'), { file: 'test.md' });

// 获取错误报告
const report = errorHandler.generateErrorReport();
console.log(report);
```

### 批量操作

```typescript
// 批量验证图片
const imageIds = ['id1', 'id2', 'id3', 'id4', 'id5'];
const results = await api.validateImages(imageIds);

// 处理验证结果
const validImages = results.filter(r => r.isValid);
const invalidImages = results.filter(r => !r.isValid);

console.log(`Valid: ${validImages.length}, Invalid: ${invalidImages.length}`);
```

### 搜索和过滤

```typescript
// 搜索特定 URL 的图片
const urlResult = await api.searchImagesByUrl('example.com');

// 搜索特定文件的图片
const fileResult = await api.searchImagesByFile('/docs/README.md');

// 搜索失效的图片
const brokenResult = await api.searchImagesByStatus('broken');

// 分页搜索
const pagedResult = await api.searchImages({
    status: 'active',
    page: 2,
    pageSize: 50
});
```

### 性能优化

```typescript
// 使用快速扫描进行日常检查
const quickResult = await api.quickScan();

// 定期执行完整扫描（例如每周一次）
const fullResult = await api.fullScan();

// 定期清理缓存
const cleanupResult = await api.cleanup({
    lru: true,      // 启用 LRU 清理
    ttl: true,      // 启用 TTL 清理
    orphaned: true  // 清理孤立图片
});
```

## 与 Obsidian 集成

### 基本集成

```typescript
import { Plugin } from 'obsidian';
import {
    IndexedDBManager,
    NetworkImageScannerAPI,
    NetworkImageCacheManager
} from './network-image';

export default class ImageMgrPlugin extends Plugin {
    private dbManager: IndexedDBManager;
    private api: NetworkImageScannerAPI;
    
    async onload() {
        // 初始化数据库
        this.dbManager = new IndexedDBManager();
        const db = await this.dbManager.init();
        
        // 创建 API
        this.api = new NetworkImageScannerAPI(
            this.app,
            db,
            new NetworkImageScanner() // 实现扫描器
        );
        
        // 注册命令
        this.addCommand({
            id: 'scan-network-images',
            name: 'Scan Network Images',
            callback: async () => {
                const result = await this.api.quickScan();
                new Notice(`Scan completed: ${result.totalImages} images found`);
            }
        });
        
        // 注册定时扫描
        this.registerInterval(
            window.setInterval(async () => {
                await this.api.quickScan();
            }, 60 * 60 * 1000) // 每小时扫描一次
        );
    }
    
    async onunload() {
        // 关闭数据库连接
        if (this.dbManager) {
            this.dbManager.close();
        }
    }
}
```

## 性能指标

### 预期性能提升

| 指标 | 无缓存 | 有缓存 | 提升 |
|------|--------|--------|------|
| 扫描 1000 个文件 | 30 秒 | 3 秒 | 10x |
| 扫描 10000 个文件 | 5 分钟 | 15 秒 | 20x |
| 缓存命中率 | 0% | 85% | 85% |
| 内存占用 | 100MB | 50MB | 50% |

### 缓存统计示例

```typescript
const stats = await api.getStats();
console.log(`
Cache Statistics:
- Total Images: ${stats.totalImages}
- Active Images: ${stats.activeImages}
- Broken Images: ${stats.brokenImages}
- Cache Hit Rate: ${stats.cacheHitRate.toFixed(1)}%
- Database Size: ${(stats.databaseSize / 1024 / 1024).toFixed(2)} MB
- Last Cleanup: ${new Date(stats.lastCleanup).toLocaleString()}
`);
```

## 故障排除

### 数据库初始化失败

```typescript
try {
    const db = await dbManager.init();
} catch (error) {
    if (error.message.includes('not supported')) {
        console.error('IndexedDB is not supported in this environment');
    } else if (error.message.includes('blocked')) {
        console.error('Database is blocked by another tab');
    }
}
```

### 扫描失败

```typescript
try {
    const result = await api.scan();
    
    if (result.errors.length > 0) {
        console.warn(`Scan completed with ${result.errors.length} errors`);
        
        for (const error of result.errors) {
            console.error(`File: ${error.file}, Error: ${error.error.message}`);
        }
    }
} catch (error) {
    console.error('Scan failed:', error);
}
```

### 清理失败

```typescript
try {
    const result = await api.cleanup();
    console.log(`Cleanup completed: ${result.imagesRemoved} images removed`);
} catch (error) {
    console.error('Cleanup failed:', error);
}
```

## 最佳实践

1. **定期扫描**：设置定时任务定期执行快速扫描
2. **错误处理**：始终使用 try-catch 处理可能的错误
3. **资源清理**：及时关闭数据库连接和清理缓存
4. **日志记录**：使用错误处理器记录和分析错误
5. **性能监控**：定期检查缓存统计和命中率
6. **批量操作**：使用批量验证提高性能
7. **增量扫描**：优先使用增量扫描而不是完整扫描

## 版本信息

- **Version**: 1.0.0
- **Date**: 2025-01-25
- **License**: MIT

## 支持

如有问题或建议，请提交 Issue 或 Pull Request。
