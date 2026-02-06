# ImageMgr API 文档

**版本:** v1.0.4  
**最后更新:** 2026-02-07  
**适用对象:** 开发者、高级用户、贡献者

---

## 📚 目录

1. [快速开始](#快速开始)
2. [核心API](#核心api)
3. [类型定义](#类型定义)
4. [事件系统](#事件系统)
5. [使用示例](#使用示例)
6. [最佳实践](#最佳实践)
7. [故障排除](#故障排除)

---

## 快速开始

### 获取插件实例

```typescript
// 在 Obsidian 插件环境中获取 ImageMgr 实例
const plugin = app.plugins.plugins['imagemgr'];

if (!plugin) {
    console.error('ImageMgr 插件未安装或未启用');
    return;
}
```

### 基本使用流程

```typescript
// 1. 扫描图片
const images = await plugin.scanImages();

// 2. 获取图片引用
const references = await plugin.referenceManager.findAllReferences('path/to/image.png');

// 3. 重命名图片（自动更新引用）
await plugin.renameImage('old-name.png', 'new-name.png');
```

---

## 核心API

### ImageManagementPlugin 主类

插件主类，负责协调所有功能模块。

#### 属性

| 属性名 | 类型 | 描述 |
|--------|------|------|
| `settings` | `ImageManagementSettings` | 插件设置对象 |
| `logger` | `Logger` | 日志管理器 |
| `errorHandler` | `ErrorHandler` | 错误处理器 |
| `referenceManager` | `ReferenceManager` | 引用关系管理器 |
| `trashManager` | `TrashManager` | 回收站管理器 |
| `lockListManager` | `LockListManager` | 锁定列表管理器 |
| `historyManager` | `HistoryManager` | 历史记录管理器 |
| `networkImageAPI` | `NetworkImageScannerAPI` | 网络图片扫描API（含黑名单管理） |
| `networkImageDBManager` | `IndexedDBManager` | IndexedDB 数据库管理器 |
| `networkImageCacheManager` | `NetworkImageCacheManager` | 网络图片缓存管理器 |
| `networkImageErrorHandler` | `ScanErrorHandler` | 网络图片错误处理器 |
| `networkImageScanner` | `NetworkImageScanner` | 网络图片扫描器 |

#### 核心方法

##### scanImages(folderPath?: string): Promise<ImageInfo[]>

扫描指定文件夹中的图片文件。

**参数:**
- `folderPath` (可选): 要扫描的文件夹路径，默认为仓库根目录

**返回值:**
- `Promise<ImageInfo[]>`: 扫描到的图片信息数组

**示例:**
```typescript
// 扫描整个仓库
const allImages = await plugin.scanImages();

// 扫描特定文件夹
const folderImages = await plugin.scanImages('assets/images');

// 处理扫描结果
for (const image of allImages) {
    console.log(`图片: ${image.name}, 大小: ${image.size} bytes`);
}
```

##### renameImage(oldPath: string, newPath: string): Promise<boolean>

重命名图片文件并自动更新所有引用。

**参数:**
- `oldPath`: 原图片路径
- `newPath`: 新图片路径

**返回值:**
- `Promise<boolean>`: 重命名是否成功

**示例:**
```typescript
try {
    const success = await plugin.renameImage(
        'old-image.png',
        'new-image.png'
    );
    if (success) {
        new Notice('重命名成功');
    }
} catch (error) {
    console.error('重命名失败:', error);
}
```

##### deleteImage(imagePath: string, permanent?: boolean): Promise<boolean>

删除图片文件。

**参数:**
- `imagePath`: 图片路径
- `permanent` (可选): 是否永久删除，默认为 false（移至回收站）

**返回值:**
- `Promise<boolean>`: 删除是否成功

**示例:**
```typescript
// 移至回收站
await plugin.deleteImage('image.png', false);

// 永久删除
await plugin.deleteImage('image.png', true);
```

##### moveImage(imagePath: string, targetFolder: string): Promise<boolean>

移动图片到指定文件夹。

**参数:**
- `imagePath`: 图片路径
- `targetFolder`: 目标文件夹路径

**返回值:**
- `Promise<boolean>`: 移动是否成功

**示例:**
```typescript
await plugin.moveImage('image.png', 'assets/archive');
```

---

### ReferenceManager 引用管理器

管理图片在笔记中的引用关系。

#### 方法

##### findAllReferences(imagePath: string, forceRefresh?: boolean): Promise<ImageReferenceInfo[]>

查找图片的所有引用。

**参数:**
- `imagePath`: 图片路径
- `forceRefresh` (可选): 是否强制刷新缓存

**返回值:**
- `Promise<ImageReferenceInfo[]>`: 引用信息数组

**示例:**
```typescript
const references = await plugin.referenceManager.findAllReferences('image.png');

console.log(`图片被 ${references.length} 个笔记引用`);

for (const ref of references) {
    console.log(`- ${ref.filePath}:${ref.lineNumber}`);
}
```

##### updateReferences(oldPath: string, newPath: string, displayText?: string): Promise<void>

更新所有引用中的图片路径。

**参数:**
- `oldPath`: 原图片路径
- `newPath`: 新图片路径
- `displayText` (可选): Wiki 链接的显示文本

**示例:**
```typescript
await plugin.referenceManager.updateReferences(
    'old-image.png',
    'new-image.png',
    '新图片名称'
);
```

##### findBrokenLinks(): Promise<BrokenLinkInfo[]>

查找所有指向不存在图片的链接。

**返回值:**
- `Promise<BrokenLinkInfo[]>`: 空链接信息数组

**示例:**
```typescript
const brokenLinks = await plugin.referenceManager.findBrokenLinks();

for (const link of brokenLinks) {
    console.log(`空链接: ${link.linkText} 在 ${link.filePath}:${link.lineNumber}`);
}
```

---

### NetworkImageScannerAPI 网络图片扫描API

管理网络图片的扫描、缓存和黑名单功能。

#### 方法

##### scanNetworkImages(path?: string, options?: { quiet?: boolean }): Promise<any[]>

扫描网络图片链接。

**参数:**
- `path` (可选): 要扫描的文件夹路径，默认为整个仓库
- `options` (可选): 扫描选项
  - `quiet`: 是否静默模式（不显示通知）

**返回值:**
- `Promise<any[]>`: 扫描到的网络图片数组

**示例:**
```typescript
// 扫描整个仓库
const images = await plugin.scanNetworkImages();

// 扫描特定文件夹
const folderImages = await plugin.scanNetworkImages('docs');

// 静默扫描（不显示通知）
const quietImages = await plugin.scanNetworkImages('docs', { quiet: true });
```

##### performFullNetworkImageScan(): Promise<void>

执行完整扫描（用于定期维护）。

**示例:**
```typescript
await plugin.performFullNetworkImageScan();
```

##### cleanupNetworkImageCache(): Promise<void>

清理网络图片缓存。

**示例:**
```typescript
await plugin.cleanupNetworkImageCache();
```

##### getNetworkImageCacheStats(): Promise<any>

获取网络图片缓存统计信息。

**返回值:**
- `Promise<any>`: 统计信息对象，包含：
  - `totalImages`: 总图片数
  - `activeImages`: 活跃图片数
  - `brokenImages`: 失效图片数
  - `cacheHitRate`: 缓存命中率
  - `databaseSize`: 数据库大小

**示例:**
```typescript
const stats = await plugin.getNetworkImageCacheStats();
console.log(`缓存命中率: ${stats.cacheHitRate}%`);
console.log(`总图片数: ${stats.totalImages}`);
```

#### NetworkImageScannerAPI 直接访问

也可以通过 `networkImageAPI` 属性直接访问完整的 API：

```typescript
// 获取黑名单
const blacklist = await plugin.networkImageAPI.getBlacklist();

// 搜索图片
const result = await plugin.networkImageAPI.searchImages({
    url: 'example.com',
    status: 'active',
    page: 1,
    pageSize: 20
});

// 验证图片
const validationResults = await plugin.networkImageAPI.validateImages(['image-id-1']);

// 获取统计
const stats = await plugin.networkImageAPI.getStats();
```

更多详细API请参考 `src/network-image/README.md`。

---

### Logger 日志管理器

记录所有操作的日志系统。

#### 日志级别

```typescript
enum LogLevel {
    DEBUG = 0,    // 调试信息
    INFO = 1,     // 一般信息
    WARNING = 2,  // 警告信息
    ERROR = 3     // 错误信息
}
```

#### 方法

##### log(level: LogLevel, operation: OperationType, message: string, details?: any): Promise<void>

记录日志。

**参数:**
- `level`: 日志级别
- `operation`: 操作类型
- `message`: 日志消息
- `details` (可选): 详细信息

**示例:**
```typescript
// 记录信息日志
await plugin.logger.info(
    OperationType.IMAGE_RENAME,
    '图片重命名成功',
    { oldPath: 'old.png', newPath: 'new.png' }
);

// 记录错误日志
await plugin.logger.error(
    OperationType.IMAGE_DELETE,
    '删除图片失败',
    { error: error.message }
);
```

##### getLogs(filter?: LogFilter): Promise<LogEntry[]>

获取日志记录。

**参数:**
- `filter` (可选): 过滤条件

**示例:**
```typescript
// 获取所有错误日志
const errorLogs = await plugin.logger.getLogs({
    level: LogLevel.ERROR
});

// 获取特定操作的日志
const renameLogs = await plugin.logger.getLogs({
    operation: OperationType.IMAGE_RENAME
});
```

---

### TrashManager 回收站管理器

管理已删除的文件。

#### 方法

##### moveToTrash(file: TFile): Promise<boolean>

将文件移至回收站。

**示例:**
```typescript
const file = app.vault.getAbstractFileByPath('image.png');
if (file instanceof TFile) {
    await plugin.trashManager.moveToTrash(file);
}
```

##### restoreFromTrash(trashPath: string): Promise<boolean>

从回收站恢复文件。

**示例:**
```typescript
await plugin.trashManager.restoreFromTrash('.trash/image.png');
```

##### getTrashItems(): Promise<TrashItem[]>

获取回收站中的所有项目。

**示例:**
```typescript
const items = await plugin.trashManager.getTrashItems();
console.log(`回收站中有 ${items.length} 个项目`);
```

---

### LockListManager 锁定列表管理器

管理被保护的文件。

#### 方法

##### isLocked(imagePath: string, md5?: string): boolean

检查文件是否被锁定。

**示例:**
```typescript
const isLocked = plugin.lockListManager.isLocked('image.png');
if (isLocked) {
    console.log('文件已被锁定，无法操作');
}
```

##### addToLockList(imagePath: string, md5: string): Promise<void>

将文件添加到锁定列表。

**示例:**
```typescript
await plugin.lockListManager.addToLockList('important.png', 'abc123...');
```

##### removeFromLockList(imagePath: string): Promise<void>

从锁定列表移除文件。

**示例:**
```typescript
await plugin.lockListManager.removeFromLockList('image.png');
```

---

## 类型定义

### ImageInfo 图片信息

```typescript
interface ImageInfo {
    /** 图片完整路径 */
    path: string;
    /** 图片文件名 */
    name: string;
    /** 文件大小（字节） */
    size: number;
    /** 图片宽度（像素） */
    width?: number;
    /** 图片高度（像素） */
    height?: number;
    /** 修改时间戳 */
    modified: number;
    /** MD5 哈希值 */
    md5?: string;
    /** 引用列表 */
    references?: ImageReferenceInfo[];
    /** 引用数量 */
    referenceCount?: number;
    /** 是否为网络图片 */
    isRemote?: boolean;
}
```

### ImageReferenceInfo 图片引用信息

```typescript
interface ImageReferenceInfo {
    /** 引用该图片的笔记路径 */
    filePath: string;
    /** 引用所在的行号 */
    lineNumber: number;
    /** 显示文本（Wiki 链接中的别名） */
    displayText?: string;
    /** 完整的引用行内容 */
    fullLine?: string;
    /** 链接格式类型 */
    matchType?: string;
    /** 链接路径格式 */
    linkPathFormat?: 'shortest' | 'relative' | 'absolute';
}
```

### LinkFormatStats 链接格式统计

```typescript
interface LinkFormatStats {
    wiki: number;        // Wiki 格式链接数量
    markdown: number;    // Markdown 格式链接数量
    html: number;        // HTML 格式链接数量
    shortest: number;    // 最短路径格式数量
    relative: number;    // 相对路径格式数量
    absolute: number;    // 绝对路径格式数量
    remote: number;      // 网络图片链接数量
    total: number;       // 总链接数量
}
```

---

## 事件系统

### 可用事件

| 事件名 | 触发时机 | 数据 |
|--------|----------|------|
| `image-scanned` | 图片扫描完成 | `{ images: ImageInfo[], count: number }` |
| `image-renamed` | 图片重命名 | `{ oldPath: string, newPath: string }` |
| `image-deleted` | 图片删除 | `{ path: string, permanent: boolean }` |
| `image-moved` | 图片移动 | `{ oldPath: string, newPath: string }` |
| `reference-updated` | 引用更新 | `{ imagePath: string, references: ImageReferenceInfo[] }` |
| `trash-changed` | 回收站变更 | `{ items: TrashItem[] }` |

### 订阅事件

```typescript
// 订阅图片重命名事件
plugin.on('image-renamed', (data) => {
    console.log(`图片已从 ${data.oldPath} 重命名为 ${data.newPath}`);
});

// 订阅扫描完成事件
plugin.on('image-scanned', (data) => {
    new Notice(`扫描完成，发现 ${data.count} 张图片`);
});
```

---

## 使用示例

### 示例1: 批量重命名图片

```typescript
/**
 * 批量重命名图片
 * @param images 要重命名的图片列表
 * @param pattern 命名模式，如 "image_{index}"
 */
async function batchRename(images: ImageInfo[], pattern: string): Promise<void> {
    for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const extension = image.name.split('.').pop();
        const newName = pattern.replace('{index}', String(i + 1).padStart(3, '0'));
        const newPath = `${image.path.substring(0, image.path.lastIndexOf('/'))}/${newName}.${extension}`;
        
        try {
            await plugin.renameImage(image.path, newPath);
            console.log(`✓ ${image.name} -> ${newName}.${extension}`);
        } catch (error) {
            console.error(`✗ ${image.name} 重命名失败:`, error);
        }
    }
}

// 使用示例
const images = await plugin.scanImages('assets/to-rename');
await batchRename(images, 'screenshot_{index}');
```

### 示例2: 查找未使用的图片

```typescript
/**
 * 查找未被任何笔记引用的图片
 * @returns 未使用图片列表
 */
async function findUnusedImages(): Promise<ImageInfo[]> {
    const allImages = await plugin.scanImages();
    const unusedImages: ImageInfo[] = [];
    
    for (const image of allImages) {
        const references = await plugin.referenceManager.findAllReferences(image.path);
        if (references.length === 0) {
            unusedImages.push(image);
        }
    }
    
    return unusedImages;
}

// 使用示例
const unused = await findUnusedImages();
console.log(`发现 ${unused.length} 张未使用的图片`);
```

### 示例3: 批量删除未使用图片

```typescript
/**
 * 批量删除未使用的图片（带确认）
 */
async function deleteUnusedImages(): Promise<void> {
    const unused = await findUnusedImages();
    
    if (unused.length === 0) {
        new Notice('没有发现未使用的图片');
        return;
    }
    
    // 过滤掉锁定的文件
    const deletable = unused.filter(img => !plugin.lockListManager.isLocked(img.path));
    
    if (deletable.length === 0) {
        new Notice('所有未使用图片都已被锁定');
        return;
    }
    
    // 显示确认对话框
    const confirmed = confirm(`确定要删除 ${deletable.length} 张未使用的图片吗？`);
    if (!confirmed) return;
    
    // 批量删除
    let successCount = 0;
    for (const image of deletable) {
        try {
            await plugin.deleteImage(image.path, false); // 移至回收站
            successCount++;
        } catch (error) {
            console.error(`删除 ${image.name} 失败:`, error);
        }
    }
    
    new Notice(`成功删除 ${successCount}/${deletable.length} 张图片`);
}
```

### 示例4: 导出图片引用报告

```typescript
/**
 * 导出图片引用报告为 Markdown
 */
async function exportReferenceReport(): Promise<string> {
    const images = await plugin.scanImages();
    let report = '# 图片引用报告\n\n';
    report += `生成时间: ${new Date().toLocaleString()}\n\n`;
    report += `总计图片: ${images.length} 张\n\n`;
    
    report += '## 图片引用详情\n\n';
    report += '| 图片 | 大小 | 引用数 | 引用位置 |\n';
    report += '|------|------|--------|----------|\n';
    
    for (const image of images) {
        const references = await plugin.referenceManager.findAllReferences(image.path);
        const size = formatFileSize(image.size);
        const refCount = references.length;
        const refLocations = references.map(r => r.filePath).join(', ');
        
        report += `| ${image.name} | ${size} | ${refCount} | ${refLocations || '无'} |\n`;
    }
    
    return report;
}

// 辅助函数：格式化文件大小
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 使用示例
const report = await exportReferenceReport();
await app.vault.create('图片引用报告.md', report);
new Notice('报告已生成');
```

### 示例5: 监控文件变化

```typescript
/**
 * 设置文件变化监控
 */
function setupFileMonitoring(): void {
    // 监听图片重命名
    plugin.on('image-renamed', async (data) => {
        await plugin.logger.info(
            OperationType.IMAGE_RENAME,
            `图片重命名: ${data.oldPath} -> ${data.newPath}`
        );
    });
    
    // 监听图片删除
    plugin.on('image-deleted', async (data) => {
        const type = data.permanent ? '永久删除' : '移至回收站';
        await plugin.logger.info(
            OperationType.IMAGE_DELETE,
            `图片${type}: ${data.path}`
        );
    });
    
    // 监听扫描完成
    plugin.on('image-scanned', (data) => {
        new Notice(`扫描完成: ${data.count} 张图片`);
    });
}

// 在插件加载时调用
setupFileMonitoring();
```

---

## 最佳实践

### 1. 错误处理

始终使用 try-catch 包裹 API 调用：

```typescript
try {
    await plugin.renameImage(oldPath, newPath);
} catch (error) {
    // 记录错误
    await plugin.logger.error(
        OperationType.IMAGE_RENAME,
        '重命名失败',
        { error: error.message }
    );
    // 通知用户
    new Notice(`重命名失败: ${error.message}`);
}
```

### 2. 批量操作优化

对于大量文件操作，使用批量处理：

```typescript
const batchSize = 10;
for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    await Promise.all(batch.map(img => processImage(img)));
    // 让出控制权，避免阻塞 UI
    await new Promise(resolve => setTimeout(resolve, 0));
}
```

### 3. 缓存利用

利用引用缓存避免重复计算：

```typescript
// 首次查询会计算并缓存
const refs1 = await plugin.referenceManager.findAllReferences('image.png');

// 后续查询使用缓存，速度更快
const refs2 = await plugin.referenceManager.findAllReferences('image.png');

// 强制刷新缓存
const refs3 = await plugin.referenceManager.findAllReferences('image.png', true);
```

### 4. 锁定保护

在执行批量操作前检查锁定状态：

```typescript
const images = await plugin.scanImages();
const deletable = images.filter(img => 
    !plugin.lockListManager.isLocked(img.path)
);
```

---

## 故障排除

### 常见问题

#### Q: 插件实例获取失败

```typescript
const plugin = app.plugins.plugins['imagemgr'];
if (!plugin) {
    console.error('插件未启用');
    return;
}
```

#### Q: 扫描返回空数组

检查文件夹路径是否正确：
```typescript
const folder = app.vault.getAbstractFileByPath('assets/images');
if (!folder) {
    console.error('文件夹不存在');
    return;
}
```

#### Q: 重命名失败但无错误

检查文件是否被锁定：
```typescript
if (plugin.lockListManager.isLocked(imagePath)) {
    console.error('文件已被锁定');
    return;
}
```

### 调试技巧

1. **启用 DEBUG 日志**
   ```typescript
   plugin.settings.logLevel = 'DEBUG';
   await plugin.saveSettings();
   ```

2. **查看缓存状态**
   ```typescript
   console.log('引用缓存:', plugin.referenceCache);
   console.log('显示文本缓存:', plugin.displayTextCache);
   ```

3. **监控性能**
   ```typescript
   console.time('scan');
   await plugin.scanImages();
   console.timeEnd('scan');
   ```

---

## 更新日志

### v1.0.4 (2026-02-07)
- 添加网络图片扫描API文档
- 更新版本号和日期
- 添加 NetworkImageScannerAPI 相关API说明

### v1.0.1 (2025-01-31)
- 完善 API 文档，添加详细示例
- 添加故障排除指南
- 优化类型定义说明

### v1.0.0 (2025-01-24)
- 初始版本发布
- 核心 API 稳定

---

**文档维护:** ImageMgr 开发团队  
**问题反馈:** [GitHub Issues](https://github.com/Coeris/Obsidian-ImageMgr/issues)
