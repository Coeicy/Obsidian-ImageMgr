# ImageMgr

<p align="center">
  <strong>🖼️ 强大的 Obsidian 图片管理插件</strong>
</p>

<p align="center">
  <a href="https://github.com/Coeris/Obsidian-ImageMgr/releases">
    <img src="https://img.shields.io/github/v/release/Coeris/Obsidian-ImageMgr?style=flat-square" alt="Release">
  </a>
  <a href="https://github.com/Coeris/Obsidian-ImageMgr/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/Coeris/Obsidian-ImageMgr?style=flat-square" alt="License">
  </a>
  <a href="https://obsidian.md/">
    <img src="https://img.shields.io/badge/Obsidian-0.15.0+-purple?style=flat-square" alt="Obsidian">
  </a>
</p>

<p align="center">
  <a href="./README-EN.md">English</a> | 简体中文
</p>

---

ImageMgr 是一个功能丰富的 Obsidian 图片管理插件，帮助您轻松管理仓库中的所有图片文件。

## ✨ 功能亮点

| 功能 | 描述 |
|------|------|
| 📸 **智能扫描** | 自动扫描所有图片，支持增量扫描和缓存优化 |
| 🌩️ **云端图片** | 扫描和管理网络图片链接，支持代理加载 |
| ☁️ **图床上传** | 支持7种图床，轻松上传本地图片到云端 |
| 🔍 **搜索筛选** | 实时搜索、多种排序、多维度筛选 |
| 📁 **智能分组** | 按文件夹、类型、引用状态等多种方式分组 |
| 🏷️ **批量重命名** | 支持占位符和智能命名 |
| 🔗 **引用追踪** | 自动查找图片在笔记中的引用 |
| 🔄 **MD5 去重** | 检测重复图片，避免冗余存储 |
| 🗑️ **回收站** | 安全删除，支持恢复和永久删除 |
| 📜 **操作日志** | 追踪所有操作历史 |
| 🈳 **空链接检测** | 检测失效的本地/网络图片链接 |
| 🔗 **链接格式转换** | 批量转换图片链接格式 |
| 🔒 **文件保护** | 锁定重要文件，防止误操作 |
| 📐 **拖拽改尺寸** | 在笔记中拖拽调整图片尺寸 |
| 🖱️ **拖动框选** | 批量选择图片 |
| ⚙️ **设置管理** | 支持设置搜索、导入、导出和重置 |
| 📱 **移动端适配** | 响应式布局，支持手机和平板 |

## 📦 安装

### 方式一：BRAT 安装（推荐）

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. 打开 BRAT 设置，点击 **Add Beta plugin**
3. 输入仓库地址：`Coeicy/Obsidian-ImageMgr`
4. 点击 **Add Plugin**，等待安装完成
5. 在 **设置 → 社区插件** 中启用 ImageMgr

### 方式二：手动安装

1. 下载 [最新 Release](https://github.com/Coeris/Obsidian-ImageMgr/releases) 中的 `main.js`、`manifest.json`、`styles.css`
2. 在 Obsidian 仓库中创建 `.obsidian/plugins/imagemgr/` 目录
3. 将下载的文件复制到该目录
4. 重启 Obsidian，在 **设置 → 社区插件** 中启用 ImageMgr

## 🚀 快速开始

1. **打开插件**: 点击侧边栏图片图标 📷 或使用命令面板 `Ctrl+P` → "打开图片管理"
2. **浏览图片**: 自动扫描仓库中的所有图片，支持搜索、排序、筛选
3. **查看详情**: 双击图片打开详情页，可编辑文件名、路径，查看引用
4. **批量操作**: 选择多张图片进行批量重命名、删除等操作

## 📚 文档导航

| 文档 | 内容 | 链接 |
|------|------|------|
| 📖 **功能详解** | 完整功能说明和使用指南 | [docs/FEATURES.md](./docs/FEATURES.md) |
| ⌨️ **快捷键** | 所有快捷键列表 | [docs/SHORTCUTS.md](./docs/SHORTCUTS.md) |
| ⚙️ **设置选项** | 详细设置说明 | [docs/SETTINGS.md](./docs/SETTINGS.md) |
| ❓ **常见问题** | FAQ 和问题解答 | [docs/FAQ.md](./docs/FAQ.md) |
| 🛠️ **开发文档** | 开发指南和项目结构 | [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) |
| 📋 **更新日志** | 版本历史和更新内容 | [CHANGELOG.md](./CHANGELOG.md) |
| 💡 **使用示例** | 详细教程和代码示例 | [EXAMPLES.md](./EXAMPLES.md) |
| 🔧 **API文档** | API接口和事件系统 | [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) |

### 快速导航

- **新用户**: 从[快速开始](#-快速开始)开始，然后查看[功能详解](./docs/FEATURES.md)
- **高级用户**: 查看[快捷键](./docs/SHORTCUTS.md)和[设置选项](./docs/SETTINGS.md)
- **遇到问题**: 查看[常见问题](./docs/FAQ.md)
- **开发者**: 参考[开发文档](./docs/DEVELOPMENT.md)和[API文档](./API_DOCUMENTATION.md)

## 🛠️ 开发

```bash
# 克隆项目
git clone https://github.com/Coeicy/Obsidian-ImageMgr.git
cd imagemgr

# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build
```

更多开发信息请参考 [开发文档](./docs/DEVELOPMENT.md)。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 `git checkout -b feature/xxx`
3. 提交更改 `git commit -m 'Add xxx'`
4. 推送分支 `git push origin feature/xxx`
5. 提交 Pull Request

## 📄 许可证

[MIT License](LICENSE) © 2025 Coeris
