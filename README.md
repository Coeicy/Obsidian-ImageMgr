# ImageMgr

<p align="center">
  <strong>🖼️ 强大的 Obsidian 图片管理插件</strong>
</p>

<p align="center">
  <a href="https://github.com/Coeicy/Obsidian-ImageMgr/releases">
    <img src="https://img.shields.io/github/v/release/Coeicy/Obsidian-ImageMgr?style=flat-square" alt="Release">
  </a>
  <a href="https://github.com/Coeicy/Obsidian-ImageMgr/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/Coeicy/Obsidian-ImageMgr?style=flat-square" alt="License">
  </a>
  <a href="https://obsidian.md/">
    <img src="https://img.shields.io/badge/Obsidian-0.15.0+-purple?style=flat-square" alt="Obsidian">
  </a>
</p>

<p align="center">
  <a href="./README-EN.md">English</a> | 简体中文
</p>

---

ImageMgr 是一个功能丰富的 Obsidian 图片管理插件，帮助您轻松管理仓库中的所有图片文件。支持智能扫描、批量重命名、MD5 去重、引用追踪、回收站等功能。

## ✨ 功能亮点

| 功能 | 描述 |
|------|------|
| 📸 **智能扫描** | 自动扫描仓库中的所有图片（PNG、JPG、GIF、WEBP、SVG、BMP） |
| 🔍 **搜索筛选** | 实时搜索、多种排序方式、按类型筛选，支持倒序清除 |
| 📁 **智能分组** | 按文件夹、类型、引用状态分组，自定义分组管理 |
| 🏷️ **批量重命名** | 支持 `{index}`、`{name}` 占位符，智能重命名 |
| 🔗 **引用追踪** | 自动查找图片在笔记中的引用（Markdown/Wiki/HTML） |
| 🔄 **MD5 去重** | 通过哈希值检测重复图片，避免冗余存储 |
| 🗑️ **回收站** | 安全删除，支持恢复、永久删除、批量操作 |
| 📜 **操作日志** | 基于 MD5 哈希追踪所有操作历史 |
| 🈳 **空链接检测** | 检测笔记中指向不存在文件的图片链接 |
| 🔒 **文件保护** | 锁定重要文件，防止误操作 |
| ⚡ **性能优化** | 懒加载机制，流畅处理大量图片 |

## 📦 安装

### 方式一：BRAT 安装（推荐）

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. 打开 BRAT 设置，点击 **Add Beta plugin**
3. 输入仓库地址：`Coeicy/Obsidian-ImageMgr`
4. 点击 **Add Plugin**，等待安装完成
5. 在 **设置 → 社区插件** 中启用 ImageMgr

> BRAT 支持自动更新，无需手动下载文件

### 方式二：手动安装

1. 前往 [Releases](https://github.com/Coeicy/Obsidian-ImageMgr/releases) 下载最新版本
2. 下载 `main.js`、`manifest.json`、`styles.css` 三个文件
3. 在 Obsidian 仓库中创建 `.obsidian/plugins/imagemgr/` 目录
4. 将下载的文件复制到该目录
5. 重启 Obsidian，在 **设置 → 社区插件** 中启用 ImageMgr

## 🚀 快速开始

1. **打开插件**: 点击侧边栏图片图标 📷 或使用命令面板 `Ctrl+P` → "打开图片管理"
2. **浏览图片**: 自动扫描仓库中的所有图片，支持搜索、排序、筛选
3. **查看详情**: 双击图片打开详情页，可编辑文件名、路径，查看引用
4. **批量操作**: 选择多张图片进行批量重命名、删除等操作

## ⌨️ 快捷键

### 图片详情页
| 快捷键 | 功能 |
|--------|------|
| `←` `→` `↑` `↓` | 切换图片 |
| `Home` / `End` | 第一张 / 最后一张 |
| `+` / `-` | 缩放 |
| `R` / `L` | 顺时针 / 逆时针旋转 |
| `0` | 重置缩放 |
| `F` | 切换适应窗口/1:1 |
| `W` | 切换滚轮模式 |
| `Delete` | 删除图片 |
| `Ctrl+S` | 保存更改 |
| `Ctrl+Shift+L` | 锁定/解锁 |
| `Esc` | 关闭 |

### 图片管理视图
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+F` | 搜索 |
| `Ctrl+Shift+S` | 排序 |
| `Ctrl+Shift+E` | 筛选 |
| `Ctrl+Shift+G` | 分组 |
| `Ctrl+A` | 全选 |
| `Ctrl+R` | 批量重命名 |
| `Ctrl+Shift+C` | 批量复制 |
| `Ctrl+Shift+D` | 智能重命名 |
| `Ctrl+Shift+L` | 锁定/解锁 |
| `Delete` | 删除选中 |

### 回收站
| 快捷键 | 功能 |
|--------|------|
| `Delete` | 永久删除 |
| `R` | 恢复选中 |
| `Ctrl+A` | 全选/取消 |
| `Esc` | 关闭 |

> 所有快捷键可在设置中自定义

## 📖 功能详解

### 批量重命名

支持两种重命名模式：

**普通重命名**：使用占位符批量命名
- `{index}` - 自动编号（001, 002...）
- `{name}` - 原文件名
- 示例：`image_{index}` → `image_001.jpg`

**智能重命名**：根据引用笔记自动命名
- 自动查找图片的引用笔记
- 根据笔记路径和图片序号生成命名
- 支持多引用处理策略

### 引用追踪

自动检测图片在笔记中的引用，支持：
- Markdown 链接：`![](image.png)`
- Wiki 链接：`![[image.png]]`
- HTML 标签：`<img src="image.png">`

### 智能分组

灵活的图片分组管理：
- **按文件夹**：根据图片所在目录自动分组
- **按类型**：按图片格式（PNG、JPG等）分组
- **按引用状态**：区分已引用和未引用的图片
- **自定义分组**：手动创建和管理分组
- **倒序清除**：按操作顺序倒序清除搜索、排序、筛选、分组

### 回收站

安全的删除机制：
- 删除的图片移至 `.trash` 目录
- 支持恢复、永久删除、清空
- 保留 MD5 哈希用于历史追踪

### 文件保护

锁定重要文件防止误操作：
- 三要素精确匹配：MD5 + 文件名 + 路径
- 重复文件不会被误锁定
- 批量操作自动跳过锁定文件
- 点击空白区域可取消选中

## ⚙️ 设置选项

| 分类 | 选项 |
|------|------|
| **📌 基础设置** | 自动扫描、默认路径、包含子文件夹、MD5去重 |
| **🏠 主页设置** | 布局（每行数量、间距、圆角、高度）、默认值（排序、筛选）、统计信息 |
| **🖼️ 图片卡片** | 纯净画廊、自适应大小、显示名称/大小/尺寸/序号/锁定图标 |
| **🗑️ 删除与回收站** | 删除确认、系统回收站、插件回收站、恢复路径 |
| **🔗 引用与预览** | 保持详情页、引用时间、鼠标滚轮模式 |
| **🔄 重命名设置** | 自动生成、路径深度、重名处理、多引用处理 |
| **⚡ 性能优化** | 懒加载、延迟、缓存大小 |
| **🔍 搜索设置** | 大小写、延迟、路径搜索 |
| **📦 批量操作** | 最大数量、确认阈值、进度显示 |
| **🔒 锁定文件** | 锁定列表管理、批量解锁 |
| **📋 操作日志** | 日志级别、控制台输出、查看/清除日志 |
| **⌨️ 键盘快捷键** | 自定义所有快捷键 |

## ❓ 常见问题

<details>
<summary><b>扫描速度很慢怎么办？</b></summary>

MD5 去重功能会计算文件哈希值，可能较慢。可以在设置中暂时禁用，建议首次扫描后定期使用。
</details>

<details>
<summary><b>图片旋转会保存吗？</b></summary>

是的，点击旋转按钮后会立即保存到文件。预览模式的缩放和拖拽仅用于查看，不会保存。
</details>

<details>
<summary><b>操作日志保存在哪里？</b></summary>

保存在 `.obsidian/plugins/imagemgr/data.json`，最多保存 1000 条日志。
</details>

<details>
<summary><b>如何复制图片链接？</b></summary>

在图片详情页，点击 Markdown 或 HTML 链接即可复制到剪贴板。
</details>

## 🛠️ 开发

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

### 项目结构

```
src/
├── main.ts              # 插件入口
├── settings.ts          # 设置定义
├── types.ts             # 类型定义
├── constants.ts         # 常量配置
├── ui/                  # UI 组件
│   ├── image-manager-view.ts
│   ├── image-detail-modal.ts
│   ├── settings-tab.ts
│   └── ...
└── utils/               # 工具函数
    ├── logger.ts
    ├── lock-list-manager.ts # 锁定列表管理
    ├── reference-manager.ts
    ├── image-processor.ts
    └── ...
```

### 技术栈

- **TypeScript** - 类型安全
- **esbuild** - 快速构建
- **spark-md5** - MD5 哈希计算
- **HTML5 Canvas** - 图片处理

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 `git checkout -b feature/xxx`
3. 提交更改 `git commit -m 'Add xxx'`
4. 推送分支 `git push origin feature/xxx`
5. 提交 Pull Request

## 📄 许可证

[MIT License](LICENSE) © 2025 Coeicy
