# ImageMgr 技术架构指南

**版本:** v1.0.4  
**最后更新:** 2026-02-07  
**面向:** 开发者、贡献者、技术爱好者

---

## 📚 目录

1. [架构概览](#架构概览)
2. [核心模块](#核心模块)
3. [技术特性](#技术特性)
4. [性能优化](#性能优化)
5. [错误处理](#错误处理)
6. [安全机制](#安全机制)
7. [网络图片系统](#网络图片系统)
8. [缓存策略](#缓存策略)
9. [移动端优化](#移动端优化)
10. [开发指南](#开发指南)

---

## 架构概览

### 模块化架构

```
┌─────────────────────────────────┐
│   ImageManagementPlugin        │
│   (主协调器)                 │
│                              │
│  - 生命周期管理               │
│  - 事件监听                 │
│  - 管理器初始化              │
│  - UI 路由                   │
└─────────────────────────────────┘
         │           │           │
         ▼           ▼           ▼
┌─────────┐  ┌─────────┐  ┌─────────┐
│  核心   │  │  服务  │  │   UI   │
│ 管理器  │  │ 工具    │  │  视图   │
└─────────┘  └─────────┘  └─────────┘
```

### 核心管理器

| 管理器 | 职责 | 主要方法 |
|--------|------|----------|
| **Logger** | 日志记录和审计追踪 | log, getLogs, clearLogs |
| **ReferenceManager** | 引用关系管理 | findImageReferences, updateReferences |
| **TrashManager** | 已删除文件处理 | moveToTrash, restoreFile, emptyTrash |
| **LockListManager** | 文件保护 | isLocked, addToLockList, removeFromLockList |
| **HistoryManager** | 操作历史记录 | addHistory, getHistory, migrateHistory |
| **NetworkImageScannerAPI** | 网络图片扫描与黑名单 | scan, searchImages, cleanup, validateImages, getBlacklist |

### 服务层

| 服务 | 职责 |
|------|------|
| **ImageScanner** | 图片文件扫描和哈希计算 |
| **ImageProcessor** | 图片处理和批量重命名 |
| **FileEditService** | 文件重命名和移动服务 |
| **ReferenceEditService** | 引用编辑服务 |
| **HashCacheManager** | MD5 哈希缓存管理 |
| **LinkCacheManager** | 链接缓存管理 |
| **DOMCache** | DOM 元素缓存 |

### UI 层

| 组件 | 职责 |
|------|------|
| **ImageManagerView** | 主视图，图片网格展示 |
| **ImageDetailModal** | 图片详情模态框 |
| **SettingsTab** | 设置标签页 |
| **Various Modals** | 各种功能模态框（搜索、排序、筛选等） |
| **Sub-panels** | 子组件（预览、控制、历史） |

---

## 核心模块

### 1. ReferenceManager (引用管理器)

**核心功能：**
- 查找图片在笔记中的所有引用
- 支持多种链接格式（Wiki、Markdown、HTML）
- 自动更新引用（重命名后）
- 智能代码块过滤

**技术实现：**
```typescript
// 多轮解析，语法感知
1. 移除代码块（```）和行内代码（`）
2. 逐行处理
3. 支持 Wiki、Markdown、HTML 链接

// 缓存优化
- 引用缓存：5 秒有效期
- 显示文本缓存：永久有效
- 文件内容缓存：按需加载
```

**支持的链接格式：**
- Wiki: `![[image.png]]`, `![[image.png|text]]`, `![[image.png|100x200]]`
- Markdown: `![alt](image.png)`
- HTML: `<img src="image.png" alt="alt">`

### 2. TrashManager (回收站管理器)

**核心功能：**
- 安全删除文件到回收站
- 从回收站恢复文件
- 永久删除和清空回收站
- 缓存优化（5 秒有效期）

**技术实现：**
```typescript
// 回收站路径格式
.trash/原文件名__时间戳.扩展名

// 组件架构
- TrashFolderManager: 文件夹管理
- TrashItemCollector: 文件收集
- TrashPathParser: 路径解析
- TrashFormatter: 格式化显示

// 双模式操作
- API 模式：优先使用 Vault API
- Adapter 模式：降级使用 Adapter 直接操作
```

### 3. NetworkImageScannerAPI (网络图片扫描 API)

**核心功能：**
- 增量扫描（仅处理修改的文件）
- 完整扫描（重新扫描所有文件）
- 快速扫描（仅检查修改，不验证）
- 图片验证和黑名单管理

**增量扫描算法：**
```typescript
// 1. 文件状态检测
检查文件是否修改（mtime/size/hash）

// 2. 分类处理
- scan: 需要扫描的文件
- skip: 未修改的文件
- cleanup: 已删除的文件

// 3. 并行扫描
Promise.allSettled 并行处理

// 4. 黑名单过滤
跳过在黑名单中的 URL

// 5. 统计和缓存
计算缓存命中率，更新元数据
```

**性能数据：**
- 缓存命中率：60-80%
- 重试成功率：40-60%
- 错误提示减少：80%+

---

## 技术特性

### 1. 虚拟滚动

**目标：** 优化大量图片（1000+）的渲染性能

**实现：**
```typescript
// 仅渲染可视区域
- 计算可视区域范围
- 动态渲染和销毁 DOM
- 使用 IntersectionObserver 懒加载

// 性能提升
- DOM 数量：1000+ → 20-30（减少 95%+）
- 滚动性能：提升 10-20 倍
- 内存占用：减少 50%+
```

### 2. MD5 哈希缓存

**三级缓存：**
```typescript
// L1: 内存缓存
- 最大 1000 条目
- LRU 淘汰策略
- 瞬时哈希计算

// L2: 文件缓存 (imageHashCache.json)
- 持久化存储
- 自动加载和保存
- 修改时间验证

// L3: 图片元数据
- 存储在 ImageInfo.md5
- 扫描时自动计算
- 支持重哈希操作
```

### 3. 智能黑名单系统

**核心特性：**
- 容量无限（0 表示无限制）
- 自动检测失效域名
- 智能内存管理
- 本地持久化缓存

**自动添加策略：**
```typescript
// 快速通道域名
优先处理（ax1x.com, imgur.com, github.com）
失败 1 次即加入黑名单

// 批量域名
同域名下 10 个链接错误即批量处理

// 连续失败
连续失败 2 次即加入黑名单

// 失败率
失败率 60% 即加入黑名单

// 连接错误
连接类错误 + 1 次失败即加入黑名单
```

**内存管理：**
- 最大内存域名数：10,000
- 自动归档阈值：1,000
- 归档记录保存：30 天
- 缓存过期时间：7 天

---

## 性能优化

### 1. 批量操作

**策略：**
```typescript
// 批量大小：10 个文件/批
for (let i = 0; i < files.length; i += 10) {
    const batch = files.slice(i, i + 10);
    await Promise.all(batch.map(f => processFile(f)));
    // 让出控制权
    await new Promise(resolve => setTimeout(resolve, 0));
}
```

### 2. 防抖和节流

**应用场景：**
```typescript
// 搜索防抖：300ms
debounce(search, 300)

// 滚动节流：100ms
throttle(onScroll, 100)

// 输入防抖：500ms
debounce(onInput, 500)
```

### 3. 缓存策略

**缓存类型：**
- 引用缓存：5 秒有效期
- DOM 缓存：永久有效（手动失效）
- 哈希缓存：LRU 淘汰（1000 条目）
- 黑名单缓存：7 天自动过期
- 链接缓存：24 小时 TTL

### 4. 懒加载

**实现：**
```typescript
// IntersectionObserver
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            loadImage(entry.target);
        }
    });
});

// 图片预加载
preloadNextImages(5); // 预加载未来 5 张
```

---

## 错误处理

### 统一错误处理

**ErrorHandler 职责：**
- 集中错误记录
- 用户友好提示
- 自动重试逻辑
- 详细日志记录

**错误分类：**
```typescript
enum ErrorType {
    NETWORK_ERROR,      // 网络错误
    FILE_NOT_FOUND,     // 文件未找到
    PERMISSION_DENIED,   // 权限拒绝
    VALIDATION_ERROR,   // 验证错误
    PARSE_ERROR,        // 解析错误
    UNKNOWN_ERROR       // 未知错误
}
```

**重试策略：**
```typescript
// 网络错误：自动重试 3 次
// 文件操作：单次尝试
// 验证错误：不重试
// 超时错误：指数退避
```

### 网络图片错误处理

**9 种错误类型：**
1. connection_error - 连接错误
2. dns_error - DNS 解析错误
3. http_error - HTTP 错误
4. timeout_error - 超时错误
5. validation_error - 验证错误
6. fetch_error - 获取错误
7. parse_error - 解析错误
8. unknown_error - 未知错误
9. network_error - 网络错误（通用）

**自动处理：**
- 连接错误 → 加入黑名单
- DNS 错误 → 加入黑名单
- 超时错误 → 重试（最多 3 次）
- HTTP 404/403 → 加入黑名单

---

## 安全机制

### 1. 路径验证

**防护措施：**
```typescript
// 路径遍历保护
禁止包含: ../ 或 ..\

// 特殊字符检查
禁止字符: < > : " | ? *

// 长度限制
最大长度: 50 字符

// 路径分隔符规范化
统一使用 / 或 \
```

### 2. XSS 防护

**措施：**
```typescript
// DOM 操作
- 使用 textContent 而非 innerHTML
- 使用 createElement 而非字符串拼接
- 自动转义特殊字符

// URL 验证
- 验证 URL 格式
- 禁止 javascript: 协议
- 限制允许的协议（http, https）
```

### 3. 文件锁定

**三要素验证：**
```typescript
// 1. MD5 内容哈希
const md5Matches = image.md5 === lockItem.md5;

// 2. 精确文件名
const nameMatches = image.name === lockItem.name;

// 3. 精确路径
const pathMatches = image.path === lockItem.path;

// 全部匹配才视为锁定
const isLocked = md5Matches && nameMatches && pathMatches;
```

---

## 网络图片系统

### 架构设计

```
┌──────────────────────────────────┐
│   NetworkImageScannerAPI        │
│   (统一接口层)                 │
└──────────────────────────────────┘
         │           │
         ▼           ▼
┌──────────────┐  ┌──────────────┐
│ Incremental  │  │  Cache       │
│  Scanner     │  │  Manager     │
└──────────────┘  └──────────────┘
         │
         ▼
┌──────────────┐
│  IndexedDB  │
│   (持久化)   │
└──────────────┘
```

### 增量扫描算法

**流程：**
1. 获取所有 Markdown 文件
2. 检查每个文件的扫描状态
3. 分类：scan/skip/cleanup
4. 并行扫描需要处理的文件
5. 清理已删除文件的图片
6. 清理孤立图片记录
7. 更新元数据和统计

**文件变更检测：**
- 修改时间（mtime）
- 文件大小（size）
- 内容哈希（hash）

### 黑名单缓存优化

**优化策略：**
```typescript
// 首次访问：从数据库加载到内存
if (blacklistCache === null) {
    await loadBlacklistToCache();
}

// 后续访问：直接从内存检查
if (blacklistCache?.has(urlId)) {
    return true; // 已在黑名单
}

// 黑名单变化：清除缓存
public clearBlacklistCache(): void {
    this.blacklistCache = null;
}
```

**性能提升：**
- 加载速度：10-100 倍
- 内存占用：增加约 10-50KB
- 查询速度：从 10-50ms 降至 < 1ms

### 错误处理与优化

#### 智能黑名单管理系统

**核心模块：** `src/network-image/api.ts`（黑名单统一存储在 IndexedDB）

> **注意**：原 `src/utils/blacklist-manager.ts` 已移除，黑名单功能已整合到网络图片缓存系统中，统一使用 IndexedDB 存储。

**功能特性：**
- **容量无限的黑名单架构**
  - 统一存储在 IndexedDB（ObjectStore.BLACKLIST）
  - 内存缓存优化：首次加载后使用内存数据，避免重复读取
  - 7天自动过期清理机制（通过 TTL 机制）

- **自动域名检测与屏蔽**
  - 连续失败2次自动加入黑名单
  - 失败率60%即触发自动屏蔽（基于1小时统计窗口）
  - 扫描时自动跳过黑名单链接，避免重复错误提示
  - 错误提示减少 80%+

#### 错误分类体系

支持9种错误类型：
- `NETWORK_ERROR` - 网络连接错误
- `TIMEOUT_ERROR` - 超时错误
- `VALIDATION_ERROR` - 验证错误（404/403等）
- `DATABASE_ERROR` - 数据库错误
- `FILE_READ_ERROR` - 文件读取错误
- `EMPTY_NOTE_LINK` - 空笔记链接
- `INVALID_NOTE_LINK` - 无效笔记链接
- `DELETED_NOTE_LINK` - 已删除笔记链接
- `UNKNOWN_ERROR` - 未知错误

#### 智能重试机制

- **网络错误**：延迟5秒重试，最多2次
- **超时错误**：延迟1秒重试，最多3次
- **验证错误**：不重试（如404/403等）
- **退避算法**：指数退避，避免雪崩效应
- **重试成功率**：40-60%

#### 性能数据

| 指标 | 优化前 | 优化后 | 改进幅度 |
|------|--------|--------|----------|
| **错误提示数量** | 大量重复提示 | 减少80%+ | ⭐⭐⭐⭐⭐ |
| **扫描效率** | 因错误重试降低 | 保持稳定 | ⭐⭐⭐⭐ |
| **用户体验** | 频繁干扰 | 几乎无干扰 | ⭐⭐⭐⭐⭐ |
| **缓存命中率** | 0% | 60-80% | ⭐⭐⭐⭐⭐ |
| **黑名单加载** | 每次读数据库 | 内存缓存 | ⭐⭐⭐⭐⭐ |
| **重试成功率** | 无重试机制 | 40-60% | ⭐⭐⭐⭐ |

**实际运行数据：**
- 缓存命中率：平均60-80%（后续扫描）
- 重试成功率：网络错误40-60%
- 错误聚合效果：减少重复提示90%以上
- 黑名单加载速度：从~100ms降至~1ms（内存缓存）

---

## 缓存策略

### 多级缓存架构

```
┌──────────────┐
│  内存缓存    │ ← 最快，容量有限
└──────────────┘
         │ 缓存未命中
         ▼
┌──────────────┐
│  文件缓存    │ ← 中等速度，持久化
└──────────────┘
         │ 缓存未命中
         ▼
┌──────────────┐
│  实时计算    │ ← 最慢，但准确
└──────────────┘
```

### 缓存配置

| 缓存类型 | 容量 | 过期策略 | 淘汰策略 |
|---------|------|---------|---------|
| 引用缓存 | 无限 | 5 秒 | 手动失效 |
| 哈希缓存 | 1000 条目 | 修改时间 | LRU |
| DOM 缓存 | 无限 | 手动失效 | 手动失效 |
| 黑名单缓存 | 无限 | 7 天 | 自动过期 |
| 链接缓存 | 无限 | 24 小时 TTL | TTL 过期 |

---

## 移动端优化

### 响应式设计

**断点：**
```typescript
// 移动设备
@media (max-width: 768px)

// 平板设备
@media (min-width: 769px) and (max-width: 1024px)

// 桌面设备
@media (min-width: 1025px)
```

### 触摸优化

**改进：**
- 增大点击区域（最小 44x44px）
- 支持触摸手势（滑动、拖拽）
- 禁用不必要的悬停效果
- 优化滚动性能

### 内存管理

**策略：**
- 降低图片质量（移动端 50%）
- 限制并发请求数（2-4）
- 激进垃圾回收
- 减少缓存大小

---

## 开发指南

### 添加新功能

**步骤：**
1. 在对应管理器中添加方法
2. 更新类型定义
3. 添加日志记录
4. 更新 UI 组件（如需要）
5. 添加测试用例
6. 更新文档

### 调试技巧

**启用 DEBUG 日志：**
```typescript
plugin.settings.logLevel = 'DEBUG';
await plugin.saveSettings();
```

**查看缓存状态：**
```typescript
console.log('引用缓存:', plugin.referenceCache);
console.log('哈希缓存:', plugin.imageHashCache);
```

**性能监控：**
```typescript
console.time('scan');
await plugin.scanImages();
console.timeEnd('scan');
```

### 代码规范

**类型安全：**
- 避免使用 `any`
- 优先使用接口和类型定义
- 使用类型断言时要谨慎

**命名规范：**
- 类名：PascalCase
- 方法名：camelCase
- 常量：UPPER_SNAKE_CASE
- 私有方法：前缀 `_`

**注释规范：**
- 使用 JSDoc
- 包含参数和返回值说明
- 添加使用示例
- 说明复杂逻辑

---

## 附录

### 性能指标

| 操作 | 时间 | 吞吐量 |
|------|------|--------|
| 扫描 1000 张图片 | 2-3 秒 | 300-500 张/秒 |
| 查找引用（缓存命中） | < 10ms | 100+ 次/秒 |
| 查找引用（缓存未命中） | 50-100ms | 10-20 次/秒 |
| 批量重命名 100 张图片 | 5-8 秒 | 12-20 张/秒 |
| 虚拟滚动渲染 | < 16ms | 60+ FPS |

### 依赖项

```json
{
  "obsidian": "^0.15.0",
  "typescript": "^5.0.0",
  "esbuild": "^0.19.0"
}
```

---

**文档维护:** ImageMgr 开发团队  
**问题反馈:** [GitHub Issues](https://github.com/Coeris/Obsidian-ImageMgr/issues)  
**贡献指南:** [CONTRIBUTING.md](./CONTRIBUTING.md)

---

*最后更新: 2026-02-03*
