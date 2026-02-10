# 🛠️ 开发文档

## 目录

- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [技术栈](#技术栈)
- [核心模块说明](#核心模块说明)
- [代码规范](#代码规范)
- [调试技巧](#调试技巧)
- [文档资源](#文档资源)

---

## 环境要求

- Node.js 18+ (推荐使用 LTS 版本)
- npm (项目使用 npm 作为包管理器)
- Obsidian (用于测试插件)

---

## 快速开始

```bash
# 克隆项目
git clone https://github.com/Coeicy/Obsidian-ImageMgr.git
cd imagemgr

# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build
```

### 开发工作流

1. 运行 `npm run dev` 启动监听模式
2. 在 `src/` 目录修改代码
3. 文件保存后自动编译
4. 在 Obsidian 中按 `Ctrl+R` 重新加载插件
5. 测试修改是否正常工作

---

## 项目结构

```
src/
├── main.ts                    # 插件入口，生命周期管理
├── settings.ts                # 设置定义和默认值
├── types.ts                   # TypeScript 类型定义
├── constants.ts               # UI/时间/限制等常量配置
├── ui/                        # UI 组件
│   ├── image-manager-view.ts  # 图片管理主视图
│   ├── image-detail-modal.ts  # 图片详情模态框
│   ├── settings-tab.ts        # 设置页面
│   ├── trash-modal.ts         # 回收站模态框
│   ├── link-format-modal.ts   # 链接格式转换
│   ├── broken-links-modal.ts  # 空链接检测
│   ├── duplicate-detection-modal.ts  # 重复检测
│   ├── log-viewer-modal.ts    # 日志查看器
│   ├── sort-modal.ts          # 多级排序
│   ├── filter-modal.ts        # 高级筛选
│   ├── group-modal.ts         # 分组管理
│   ├── search-modal.ts        # 搜索模态框
│   ├── stats-modal.ts         # 统计信息
│   ├── rename-modal.ts        # 重命名模态框
│   ├── confirm-modal.ts       # 确认对话框
│   ├── reference-select-modal.ts  # 引用选择
│   ├── network-image-modal.ts # 网络图片管理
│   └── components/            # 可复用组件
│       ├── image-preview-panel.ts   # 图片预览面板
│       ├── image-controls-panel.ts  # 图片控制面板
│       └── image-history-panel.ts   # 操作历史面板
├── utils/                     # 工具函数
│   ├── logger.ts              # 操作日志系统
│   ├── error-handler.ts       # 错误处理器
│   ├── lock-list-manager.ts   # 锁定列表管理
│   ├── reference-manager.ts   # 引用管理
│   ├── reference-edit-service.ts  # 引用编辑服务
│   ├── trash-manager.ts       # 回收站管理
│   ├── trash-path-parser.ts   # 回收站路径解析
│   ├── trash-formatter.ts     # 回收站格式化
│   ├── history-manager.ts     # 历史记录管理
│   ├── hash-cache-manager.ts  # 哈希缓存管理
│   ├── image-hash.ts          # MD5 哈希计算
│   ├── image-scanner.ts       # 图片扫描器
│   ├── image-processor.ts     # 图片处理
│   ├── image-optimizer.ts     # 图片优化
│   ├── file-filter.ts         # 文件过滤
│   ├── file-edit-service.ts   # 文件编辑服务
│   ├── path-validator.ts      # 路径验证
│   ├── keyboard-shortcut-manager.ts  # 快捷键管理
│   ├── drag-select-manager.ts # 拖拽框选管理
│   ├── resizable-modal.ts     # 可调整大小的模态框
│   ├── network-image-scanner.ts  # 网络图片扫描器
│   ├── network-image-loader.ts   # 网络图片加载器
│   ├── retry-utils.ts         # 重试工具
│   ├── settings-io-manager.ts # 设置导入导出
│   └── uploader/              # 图床上传（支持7种图床）
│       ├── uploader-manager.ts    # 上传器管理器
│       ├── types.ts               # 类型定义
│       ├── smms-uploader.ts       # SM.MS 图床
│       ├── imgur-uploader.ts      # Imgur 图床
│       ├── github-uploader.ts     # GitHub 图床
│       ├── qiniu-uploader.ts      # 七牛云 Kodo
│       ├── aliyun-uploader.ts     # 阿里云 OSS
│       ├── tencent-uploader.ts    # 腾讯云 COS
│       ├── upyun-uploader.ts      # 又拍云
│       └── crypto-utils.ts        # 加密工具
└── network-image/             # 网络图片缓存系统
    ├── api.ts                 # 网络图片API
    ├── cache-manager.ts       # 缓存管理器
    ├── error-handler.ts       # 错误处理器
    ├── incremental-scanner.ts # 增量扫描器
    ├── indexeddb-manager.ts   # IndexedDB管理
    ├── types.ts               # 类型定义
    └── utils.ts               # 工具函数
```

---

## 技术栈

- **TypeScript** - 类型安全，严格模式
- **esbuild** - 快速构建
- **spark-md5** - MD5 哈希计算
- **HTML5 Canvas** - 图片处理
- **IndexedDB** - 网络图片缓存存储
- **Obsidian Plugin API** - 插件框架
- **Jest** - 单元测试框架

---

## 核心模块说明

### main.ts - 插件入口

- 插件生命周期管理 (onload, onunload)
- 视图注册和命令注册
- 事件监听器设置（包含防抖机制优化）
- 设置加载和保存
- 核心管理器初始化：
  - Logger
  - ErrorHandler
  - ReferenceManager
  - TrashManager
  - HistoryManager
  - LockListManager

### 工具模块

| 模块 | 功能 |
|------|------|
| **logger.ts** | 专业的日志记录系统，基于 MD5 哈希值追踪 |
| **image-scanner.ts** | 图片扫描器，支持递归扫描和增量更新 |
| **reference-manager.ts** | 引用管理，支持 Markdown/Wiki/HTML 多种格式 |
| **image-hash.ts** | MD5 哈希计算，支持缓存管理 |
| **trash-manager.ts** | 回收站管理，支持恢复和永久删除 |
| **lock-list-manager.ts** | 锁定列表管理，支持重复检测和批量操作 |
| **network-image-scanner.ts** | 网络图片扫描器，支持 http/https 链接 |
| **network-image/cache-manager.ts** | 网络图片缓存管理，IndexedDB 存储 |
| **settings-io-manager.ts** | 设置导入导出，支持 JSON 格式 |

---

## 代码规范

### TypeScript 严格模式

- 使用严格类型检查
- 开启 `strict: true`

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 类名 | PascalCase | `ImageScanner` |
| 函数名 | camelCase | `scanImages()` |
| 常量 | UPPER_SNAKE_CASE | `MAX_CACHE_SIZE` |
| 接口 | PascalCase | `ImageConfig` |
| 类型别名 | PascalCase | `ImageType` |

### 错误处理

- 使用 ErrorHandler 统一处理错误
- 避免使用 `console.log`，使用 Logger 系统

### 注释规范

- 为公开方法添加 JSDoc 注释
- 复杂逻辑添加行内注释

---

## 调试技巧

1. **启用 DEBUG 日志**：在设置中将日志级别设为 DEBUG
2. **打开开发者工具**：在 Obsidian 中按 `Ctrl+Shift+I`
3. **查看控制台输出**：查看浏览器控制台输出和网络请求
4. **检查 IndexedDB**：在 Application 标签页查看网络图片缓存

---

## 文档资源

| 文档 | 说明 | 链接 |
|------|------|------|
| 代码地图 | 代码结构和开发导航 | [CODEMAP.md](../CODEMAP.md) |
| 开发审查报告 | 代码质量和功能逻辑审查 | [DEVELOPMENT_REVIEW.md](../DEVELOPMENT_REVIEW.md) |
| API文档 | 完整的API接口说明 | [API_DOCUMENTATION.md](../API_DOCUMENTATION.md) |
| 使用示例 | 详细的代码示例和教程 | [EXAMPLES.md](../EXAMPLES.md) |
| P1 修复总结 | P1 高优先级问题修复进度 | [P1_FIXES_SUMMARY.md](../P1_FIXES_SUMMARY.md) |

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 `git checkout -b feature/xxx`
3. 提交更改 `git commit -m 'Add xxx'`
4. 推送分支 `git push origin feature/xxx`
5. 提交 Pull Request
