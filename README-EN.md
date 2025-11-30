# ImageMgr

<p align="center">
  <strong>🖼️ A Powerful Image Management Plugin for Obsidian</strong>
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
  English | <a href="./README.md">简体中文</a>
</p>

---

ImageMgr is a feature-rich image management plugin for Obsidian that helps you easily manage all image files in your vault. It supports smart scanning, batch renaming, MD5 deduplication, reference tracking, recycle bin, and more.

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📸 **Smart Scan** | Auto-scan all images in vault (PNG, JPG, GIF, WEBP, SVG, BMP) |
| 🔍 **Search & Filter** | Real-time search, multiple sort options, filter by type, reverse-order clear |
| 📁 **Smart Grouping** | Group by folder, type, reference status, custom group management |
| 🏷️ **Batch Rename** | Support `{index}`, `{name}` placeholders, smart rename |
| 🔗 **Reference Tracking** | Auto-find image references in notes (Markdown/Wiki/HTML) |
| 🔄 **MD5 Dedup** | Detect duplicate images via hash to avoid redundant storage |
| 🗑️ **Recycle Bin** | Safe deletion with restore, permanent delete, batch operations |
| 📜 **Operation Log** | Track all operation history based on MD5 hash |
| 🈳 **Broken Link Detection** | Detect image links pointing to non-existent files |
| 🔗 **Link Format Conversion** | Batch convert image link formats (shortest/relative/absolute) |
| 🔒 **File Protection** | Lock important files to prevent accidental operations |
| 🖱️ **Drag Select** | Drag mouse to batch select images like in file explorer |
| ⚡ **Performance** | Lazy loading mechanism for smooth handling of large image sets |

## 📦 Installation

### Option 1: BRAT (Recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Open BRAT settings, click **Add Beta plugin**
3. Enter repository: `Coeicy/Obsidian-ImageMgr`
4. Click **Add Plugin** and wait for installation
5. Enable ImageMgr in **Settings → Community Plugins**

### Option 2: Manual Installation

1. Download `main.js`, `manifest.json`, `styles.css` from [Latest Release](https://github.com/Coeicy/Obsidian-ImageMgr/releases)
2. Create `.obsidian/plugins/imagemgr/` directory in your vault
3. Copy the downloaded files to that directory
4. Restart Obsidian and enable ImageMgr in **Settings → Community Plugins**

## 🚀 Quick Start

1. **Open Plugin**: Click the image icon 📷 in sidebar or use command palette `Ctrl+P` → "Open Image Manager"
2. **Browse Images**: Auto-scan all images in vault, supports search, sort, filter
3. **View Details**: Double-click image to open detail page, edit filename, path, view references
4. **Batch Operations**: Select multiple images for batch rename, delete, etc.

## ⌨️ Keyboard Shortcuts

### Image Detail Page
| Shortcut | Action |
|----------|--------|
| `←` `→` `↑` `↓` | Navigate images |
| `Home` / `End` | First / Last image |
| `+` / `-` | Zoom in / out |
| `R` / `L` | Rotate CW / CCW |
| `0` | Reset zoom |
| `F` | Toggle fit/1:1 |
| `W` | Toggle scroll mode |
| `Delete` | Delete image |
| `Ctrl+S` | Save changes |
| `Ctrl+Shift+L` | Lock/Unlock |
| `Esc` | Close |

### Image Manager View
| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Search |
| `Ctrl+Shift+S` | Sort |
| `Ctrl+Shift+E` | Filter |
| `Ctrl+Shift+G` | Group |
| `Ctrl+A` | Select all |
| `Ctrl+R` | Batch rename |
| `Ctrl+Shift+C` | Batch copy |
| `Ctrl+Shift+D` | Smart rename |
| `Ctrl+Shift+L` | Lock/Unlock |
| `Delete` | Delete selected |

### Recycle Bin
| Shortcut | Action |
|----------|--------|
| `Delete` | Permanent delete |
| `R` | Restore selected |
| `Ctrl+A` | Select all/none |
| `Esc` | Close |

> All shortcuts can be customized in settings

## 📖 Feature Details

### Batch Rename

Two rename modes available:

**Normal Rename**: Use placeholders for batch naming
- `{index}` - Auto numbering (001, 002...)
- `{name}` - Original filename
- Example: `image_{index}` → `image_001.jpg`

**Smart Rename**: Auto-name based on referencing note
- Auto-find the note that references the image
- Generate name based on note path and image sequence
- Support multiple reference handling strategies

### Reference Tracking

Auto-detect image references in notes, supports:
- Markdown links: `![](image.png)`
- Wiki links: `![[image.png]]`
- HTML tags: `<img src="image.png">`

### Smart Grouping

Flexible image grouping management:
- **By Folder**: Auto-group by image directory
- **By Type**: Group by image format (PNG, JPG, etc.)
- **By Reference**: Distinguish referenced and unreferenced images
- **Custom Groups**: Manually create and manage groups
- **Reverse-order Clear**: Clear search, sort, filter, group in reverse operation order

### Recycle Bin

Safe deletion mechanism:
- Deleted images moved to `.trash` directory
- Support restore, permanent delete, clear all
- Preserve MD5 hash for history tracking

### Link Format Conversion

Batch convert image link formats, synced with Obsidian settings:
- **Shortest path**: Use filename only (when unique)
- **Relative path**: Path relative to current note
- **Absolute path**: Full path from vault root
- Auto-read Obsidian's "New link format" setting
- Support single click or batch conversion
- Preserve original display text and size info

### File Protection

Lock important files to prevent accidental operations:
- Three-factor precise matching: MD5 + filename + path
- Duplicate files won't be mistakenly locked
- Batch operations auto-skip locked files
- Click blank area to deselect

## ⚙️ Settings

| Category | Options |
|----------|---------|
| **📌 Basic** | Auto scan, default path, include subfolders, MD5 dedup |
| **🏠 Home** | Layout (columns, spacing, radius, height), defaults (sort, filter), statistics |
| **🖼️ Image Card** | Pure gallery, adaptive size, show name/size/dimensions/index/lock icon |
| **🗑️ Delete & Trash** | Confirm delete, system trash, plugin trash, restore path |
| **🔗 Reference & Preview** | Keep detail open, reference time, mouse wheel mode |
| **🔄 Rename** | Auto generate, path depth, duplicate handling, multi-reference handling |
| **⚡ Performance** | Lazy loading, delay, cache size |
| **🔍 Search** | Case sensitive, delay, path search |
| **📦 Batch** | Max count, confirm threshold, progress display |
| **🔒 Locked Files** | Lock list management, batch unlock |
| **📋 Logs** | Log level, console output, view/clear logs |
| **⌨️ Shortcuts** | Customize all keyboard shortcuts |

## ❓ FAQ

<details>
<summary><b>Scanning is slow?</b></summary>

MD5 deduplication calculates file hashes which can be slow. You can disable it in settings temporarily. Recommended to use periodically after initial scan.
</details>

<details>
<summary><b>Will image rotation be saved?</b></summary>

Yes, clicking the rotate button saves immediately to file. Preview zoom and drag are for viewing only and won't be saved.
</details>

<details>
<summary><b>Where are operation logs stored?</b></summary>

Stored in `.obsidian/plugins/imagemgr/data.json`, max 1000 entries.
</details>

<details>
<summary><b>How to copy image link?</b></summary>

In image detail page, click Markdown or HTML link to copy to clipboard.
</details>

## 🛠️ Development

```bash
# Clone project
git clone https://github.com/Coeicy/Obsidian-ImageMgr.git
cd imagemgr

# Install dependencies
npm install

# Dev mode (watch file changes)
npm run dev

# Production build
npm run build
```

### Project Structure

```
src/
├── main.ts              # Plugin entry
├── settings.ts          # Settings definition
├── types.ts             # Type definitions
├── constants.ts         # Constants config
├── ui/                  # UI components
│   ├── image-manager-view.ts
│   ├── image-detail-modal.ts
│   ├── settings-tab.ts
│   └── ...
└── utils/               # Utility functions
    ├── logger.ts
    ├── lock-list-manager.ts # Lock list management
    ├── reference-manager.ts
    ├── image-processor.ts
    └── ...
```

### Tech Stack

- **TypeScript** - Type safety
- **esbuild** - Fast bundling
- **spark-md5** - MD5 hash calculation
- **HTML5 Canvas** - Image processing

## 🤝 Contributing

Issues and Pull Requests are welcome!

1. Fork this repository
2. Create feature branch `git checkout -b feature/xxx`
3. Commit changes `git commit -m 'Add xxx'`
4. Push branch `git push origin feature/xxx`
5. Submit Pull Request

## 📄 License

[MIT License](LICENSE) © 2025 Coeicy
