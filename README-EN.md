# ImageMgr

<p align="center">
  <strong>🖼️ A Powerful Image Management Plugin for Obsidian</strong>
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
  English | <a href="./README.md">简体中文</a>
</p>

---

ImageMgr is a feature-rich image management plugin for Obsidian that helps you easily manage all image files in your vault. It supports smart scanning, batch renaming, MD5 deduplication, reference tracking, recycle bin, and more.

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📸 **Smart Scan** | Auto-scan all images in vault (PNG, JPG, GIF, WEBP, SVG, BMP), supports incremental scan and cache optimization |
| 🌩️ **Cloud Images** | Scan and manage network image links, supports proxy loading and cloud image badges |
| 🔍 **Search & Filter** | Real-time search, multiple sort options, filter by type/location/lock/reference, reverse-order clear |
| 📁 **Smart Grouping** | Group by folder, type, reference status, lock status, location type, custom group management |
| 🏷️ **Batch Rename** | Support `{index}`, `{name}` placeholders, smart rename based on note references |
| 🔗 **Reference Tracking** | Auto-find image references in notes (Markdown/Wiki/HTML), supports reference updates |
| 🔄 **MD5 Dedup** | Detect duplicate **local** images via hash (cloud images excluded, no local storage) |
| 🗑️ **Recycle Bin** | Safe deletion with restore, permanent delete, batch operations, plugin-level trash |
| 📜 **Operation Log** | Track all operation history based on MD5 hash, supports filtering, search and export |
| 🈳 **Broken Link Detection** | Detect image links pointing to non-existent files |
| 🔗 **Link Format Conversion** | Batch convert image link formats (shortest/relative/absolute), supports single conversion or Ctrl+click |
| 🔒 **File Protection** | Lock important files to prevent accidental operations |
| 🖱️ **Drag Select** | Drag mouse to batch select images like in file explorer |
| ⚙️ **Settings Management** | Rich settings options, supports settings search, import, export and reset |
| 📱 **Mobile Adaptation** | Responsive layout, supports phones and tablets, optimized touch interactions |
| ⚡ **Performance** | Lazy loading, incremental scan cache, link info pre-calculation for smooth handling of large image sets |

## 🔄 Changelog

### v1.0.1 (2025-01-25)

#### 🐛 Bug Fixes
- ✅ **Fixed EventListener Memory Leak** - Properly clean up event listeners when closing image detail modal
- ✅ **Fixed Image Resource Leak** - Correctly release ObjectURL when previewing trash images
- ✅ **Fixed Recursive Stack Overflow Risk** - Added depth limit (max 100 levels) for trash file collection
- ✅ **Fixed Null Pointer Exception** - Added defensive checks in settings page

#### 📊 Issue Fix Statistics
- **Critical Issues:** 11 → 0 (100% fixed)
- **Actually Fixed:** 4
- **No Fix Needed:** 7 (already properly handled)
- **Stability:** Significantly improved

#### 📄 Related Documents
- [Issues Summary](./ISSUES_SUMMARY.md) - Detailed issue analysis and fix records
- [Technical Guide](./TECHNICAL_GUIDE.md) - In-depth plugin architecture
- [API Documentation](./API_DOCUMENTATION.md) - Development interface documentation

### v1.0.0 (2025-01-24)

- 🎉 Initial version release
- ✨ All core features included (smart scan, cloud images, search filter, batch operations, etc.)
- 📚 Complete documentation system (User Guide, API Docs, Technical Guide)

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

### 📸 Image Management

#### Smart Scan
- Auto-scan all image files in vault (PNG, JPG, GIF, WEBP, SVG, BMP)
- Support incremental scan, only scan new or modified files, 50-80% faster
- Link info pre-calculation: broken links and link format stats are pre-calculated and cached during scan
- Smart refresh: detect file changes, refresh display only when no changes

#### Search & Filter
- **Real-time Search**: Quick search for image names and paths
- **Flexible Sort**: Sort by name, size, date, dimensions, reference count, etc.
- **Type Filter**: Filter by image type (PNG, JPG, GIF, etc.)
- **Location Filter**: Filter by location type (🌩️ Remote / 💾 Local)
- **Lock Filter**: Filter by lock status (Locked / Unlocked)
- **Reference Filter**: Filter by reference status (Referenced / Unreferenced)
- **Multi-level Sort**: Support combining multiple sort conditions
- **Reverse-order Clear**: Clear search, sort, filter, group in reverse operation order

#### Smart Grouping
Flexible image grouping management:
- **By Folder**: Auto-group by image directory
- **By Type**: Group by image format (PNG, JPG, etc.)
- **By Reference**: Distinguish referenced and unreferenced images
- **By Lock Status**: Group by file protection status
- **By Location Type**: Distinguish 🌩️ remote images and 💾 local images
- **Custom Groups**: Manually create and manage groups

#### Image Preview
- Beautiful grid layout preview interface
- Support lazy loading for smooth handling of large image sets
- Adaptive card size and spacing
- Display image name, size, dimensions, index, lock icon, etc.

### 🏷️ Batch Rename

Two rename modes available:

**Normal Rename**: Use placeholders for batch naming
- `{index}` - Auto numbering (001, 002...)
- `{name}` - Original filename
- Example: `image_{index}` → `image_001.jpg`

**Smart Rename**: Auto-name based on referencing note
- Auto-find the note that references the image
- Generate name based on note path and image sequence
- Support multiple reference handling strategies (use first reference, use all references, etc.)
- Configurable path naming depth

### 🔗 Reference Tracking

#### Multi-format Support
Auto-detect image references in notes, supports:
- **Markdown Links**: `![](image.png)`, `![alt](image.png)`
- **Wiki Links**: `![[image.png]]`, `![[image.png|alt]]`
- **HTML Tags**: `<img src="image.png">`, `<img src="image.png" width="100">`
- **Multiple References per Line**: Precise parsing of multiple image references in the same line

#### Reference Management
- **Reference Query**: Auto-find image references in notes
- **Reference Update**: Auto-update image links in notes
- **Reference Info Cache**: Pre-calculate and cache reference info, display immediately when opening detail page
- **Real-time Reference Update**: Auto-update cache when note references change
- **Link Format Stats**: Pre-calculate counts of various link formats (Wiki/Markdown/HTML, shortest/relative/absolute path)

#### Broken Link Detection
- Detect image links pointing to non-existent files
- Pre-calculated cache, display immediately when opening
- Support batch fix broken links

### 🔗 Link Format Conversion

Batch convert image link formats, synced with Obsidian settings:
- **Shortest path**: Use filename only (when unique)
- **Relative path**: Path relative to current note
- **Absolute path**: Full path from vault root
- Auto-read Obsidian's "New link format" setting
- **Search Filter**: Support searching notes or image names to filter links
- **Click to Convert**: Click single link to convert individually
- **Ctrl+Click to Navigate**: Hold Ctrl and click to jump to note and select link
- **Smart Recognition**: Auto-exclude code blocks and note links, only recognize image links
- **Link Stats Pre-calculation**: Auto-count various link format stats during scan, display immediately when opening
- Preserve original display text and size info

### 🔄 MD5 Deduplication

- Detect duplicate **local** images via MD5 hash; avoid redundant storage, save space
- **Local only**: Cloud images are external links and do not use local storage; they are not included in duplicate detection
- Hash cache management, auto-cache calculation results
- Display duplicate image list, support batch delete (local only)

### 🔑 Role of Hash Values

The plugin uses two kinds of hashes for different purposes:

| Type | Algorithm | Input | Purpose |
|------|-----------|--------|---------|
| **URL hash** | SHA-256 | Image URL string | **Cloud images**: Primary key (ID) for cache and blacklist; unique identifier in incremental scan and broken-link detection; shown as "URL hash" in detail view |
| **MD5 hash** | MD5 | Image file content | **Local/trash images**: Duplicate detection and dedup; one of the three factors in lock list; operation log tracking by image; shown as "MD5 hash" in detail view |

- **Cloud images**: No local storage; URL hash identifies "which link" for cache and blacklist.
- **Local images**: MD5 identifies "which file content" for dedup, locking, and history tracking.

### 🗑️ Recycle Bin Management

Safe deletion mechanism:
- **Delete Protection**: Support move to system trash
- **Plugin Recycle Bin**: Deleted images moved to `.trash` directory
- **Batch Restore**: Restore deleted images
- **Permanent Delete**: Permanently delete files
- **Clear Recycle Bin**: One-click clear all deleted files
- **MD5 Cache**: Auto-calculate and cache MD5 values, preserve history tracking

### 🔒 File Protection

Lock important files to prevent accidental operations:
- **Three-factor Precise Matching**: MD5 + filename + path
- **Duplicate Detection**: Duplicate files won't be mistakenly locked
- **Batch Operation Protection**: Batch operations auto-skip locked files
- **Quick Mark**: Quick lock/unlock files
- **Unified Management**: Centralized management of all locked files through settings page
- **Operation Logging**: Lock/unlock operations auto-logged

### 📜 Operation Logs

Complete operation tracking system:
- **Log Levels**: DEBUG, INFO, WARNING, ERROR
- **Operation Types**: Scan, rename, move, delete, lock, reference update, etc.
- **Detailed Info**: Records old/new values, affected notes, line numbers, etc.
- **Image Tracking**: Track complete operation history based on MD5 hash
- **Log Query**: Filter by time, level, operation type
- **Export**: Export logs to JSON format
- **Real-time Refresh**: Image detail page displays operation records in real-time

### 🖱️ Drag Select

- Drag mouse to batch select images like in file explorer
- Auto-update checkbox status when dragging
- Support drag select in image manager page and recycle bin page
- Click blank area to deselect

### 📱 Mobile Adaptation

Complete mobile support, adapted for desktop, tablet, phone landscape, phone portrait, and more:

#### Responsive Layout
- **Desktop** (≥ 1200px): 5-column image layout
- **Tablet** (768px - 1199px): 3-column image layout
- **Phone Landscape** (480px - 767px): 2-column image layout
- **Phone Portrait** (< 480px): 1-column image layout

#### Mobile Optimization
- Toolbar adaptive layout, optimized button size and arrangement
- Smart hiding of image card info (hide dimensions, lock icon, etc. on mobile)
- Filename auto-wrap to ensure complete display
- Touch-friendly: minimum button size 32px × 32px, larger touch hot zones
- Modal responsive layout (desktop side-by-side, mobile stacked)

#### Mobile Settings
- Configurable mobile images per row
- Enable compact toolbar option
- Hide non-essential info option
- Separate configuration for tablet, phone landscape, phone portrait images per row

#### Android Gallery Hide
- Create `.nomedia` file to prevent Android gallery from scanning images

## 📋 Complete Feature List

Below is the complete feature list and implementation status of the plugin.

### Core Features

#### Image Management
- ✅ **Smart Scan** - Auto-scan all image files in vault
- ✅ **Real-time Search** - Quick search and filter images
- ✅ **Flexible Sort** - Sort by name, size, date, dimensions, etc.
- ✅ **Type Filter** - Filter by image type (PNG, JPG, GIF, etc.)
- ✅ **Location Filter** - Filter by location type (Remote/Local)
- ✅ **Lock Filter** - Filter by lock status
- ✅ **Reference Filter** - Filter by reference status
- ✅ **Detailed Info** - View complete image information
- ✅ **Image Preview** - Beautiful grid layout preview interface
- ✅ **Performance Optimization** - Lazy loading mechanism, support large image sets

#### Editing Features
- ✅ **Batch Rename** - Support flexible file renaming patterns
- ✅ **Smart Rename** - Auto-generate names based on referencing note path and image sequence
- ✅ **Image Editing** - Rotate, flip, resize
- ✅ **Path Modification** - Support moving images to different directories
- ✅ **Undo Function** - Restore to last saved position

#### Selection Features
- ✅ **Drag Select** - Drag mouse to batch select images like in file explorer
- ✅ **Selection Sync** - Auto-update checkbox status when dragging
- ✅ **Batch Selection** - Support drag select in image manager page and recycle bin page

### Advanced Features

#### Reference Management
- ✅ **Image Reference Query** - Auto-find image references in notes (supports precise parsing of multiple references per line)
- ✅ **Multi-format Support** - Markdown, HTML, Wiki links, etc.
- ✅ **Reference Update** - Auto-update image links in notes
- ✅ **Broken Link Detection** - Detect image links pointing to non-existent files (pre-calculated cache)
- ✅ **Reference Info Cache** - Pre-calculate and cache reference info, display immediately when opening detail page
- ✅ **Real-time Reference Update** - Auto-update cache when note references change
- ✅ **Link Format Stats** - Pre-calculate counts of various link formats (Wiki/Markdown/HTML, shortest/relative/absolute path)

#### Log System
- ✅ **Operation Log** - Professional log recording system
- ✅ **Hash Tracking** - Track based on image MD5 hash
- ✅ **Log Levels** - DEBUG, INFO, WARNING, ERROR
- ✅ **Log Viewer** - Support filter, search, export
- ✅ **Real-time Refresh** - Image detail page displays operation records in real-time

#### Recycle Bin Management
- ✅ **Delete Protection** - Support move to system trash
- ✅ **Recycle Bin View** - View deleted images
- ✅ **Batch Restore** - Restore deleted images
- ✅ **Permanent Delete** - Permanently delete files
- ✅ **MD5 Cache** - Auto-calculate and cache MD5 values

#### Deduplication
- ✅ **MD5 Deduplication** - Detect duplicate local images via MD5 hash (cloud images excluded)
- ✅ **Duplicate Detection** - Display local duplicate list, support batch delete
- ✅ **Hash Cache** - Auto-cache calculation results

#### Grouping
- ✅ **Group by Location** - Group by image directory
- ✅ **Group by Type** - Group by image format
- ✅ **Group by Reference** - Group by reference status
- ✅ **Group by Lock** - Group by file protection status
- ✅ **Group by Location Type** - Group by remote/local images
- ✅ **Custom Groups** - Support multiple grouping methods

#### File Protection
- ✅ **Ignore List** - Protect important files from batch operations
- ✅ **Quick Mark** - Quick lock/unlock files
- ✅ **Hash-based Lock** - Protection based on MD5 hash
- ✅ **Duplicate Detection** - Auto-detect and prevent duplicate locks
- ✅ **Unified Management** - Centralized management of all lock operations through LockListManager

### User Interface

#### Main View
- ✅ **Grid Layout** - Beautiful image card display
- ✅ **Toolbar** - Quick access to common functions
- ✅ **Statistics** - Display image library statistics
- ✅ **Search Box** - Real-time search function
- ✅ **Shortcut Hints** - Display shortcut help

#### Detail Page
- ✅ **Image Preview** - High-quality image preview
- ✅ **Zoom Function** - Zoom in/out preview
- ✅ **Rotate Function** - Rotate image preview
- ✅ **Info Display** - Display detailed image information
- ✅ **Edit Function** - Modify filename and path
- ✅ **Reference Info** - Display image reference status
- ✅ **Operation History** - Display image operation history

#### Modals
- ✅ **Search Modal** - Advanced search function
- ✅ **Sort Modal** - Select sort method
- ✅ **Filter Modal** - Select filter conditions
- ✅ **Group Modal** - Select grouping method
- ✅ **Rename Modal** - Batch rename
- ✅ **Statistics Modal** - View statistics
- ✅ **Log Viewer** - View operation logs
- ✅ **Recycle Bin** - Manage deleted files

### Keyboard Shortcuts

#### Image Detail Page
- ✅ **Navigation Shortcuts** - Switch images, first/last, close
- ✅ **Preview Shortcuts** - Zoom, rotate, reset, toggle view
- ✅ **Edit Shortcuts** - Delete, save
- ✅ **Input Shortcuts** - Save, navigation suggestions, select

#### Image Manager View
- ✅ **View Shortcuts** - Search, sort, filter, group
- ✅ **Operation Shortcuts** - Delete, select all
- ✅ **Batch Shortcuts** - Rename, smart rename

#### Recycle Bin
- ✅ **Operation Shortcuts** - Permanent delete, restore, select all, close

#### Custom Shortcuts
- ✅ **Shortcut Settings** - Customize all shortcuts in settings page
- ✅ **Reset to Defaults** - Support reset to default values

### Technical Features

#### Architecture
- ✅ **Modular Architecture** - Clear code organization, easy to maintain and extend
- ✅ **TypeScript Strict Mode** - Strict type checking
- ✅ **Async Processing** - Use async/await for file operations
- ✅ **Event-driven** - Use Obsidian event system to listen for file changes

#### Performance
- ✅ **Lazy Loading** - Delay loading images for better performance
- ✅ **Batch Rendering** - Support processing large image sets
- ✅ **Cache Management** - Smart cache management
- ✅ **Hash Cache** - Cache MD5 calculation results
- ✅ **Image Info Persistence** - Image metadata (name, location, hash, size, references) local storage
- ✅ **Incremental Update** - Only update changed data, avoid duplicate calculations
- ✅ **Link Info Pre-calculation** - Broken links and link format stats pre-calculated and cached during scan

#### Compatibility
- ✅ **Cross-platform Support** - Windows, macOS, Linux
- ✅ **Multi-format Support** - PNG, JPG, GIF, WEBP, SVG, BMP, etc.
- ✅ **Multi-link Format** - Markdown, HTML, Wiki links

> **Status Legend**: ✅ Implemented | 🔄 In Development | 📋 Planned | ❌ Deprecated

## ⚙️ Settings

### 📌 Basic Settings
- **Auto Scan**: Auto-scan images on startup
- **Default Image Folder**: Set default scan path
- **Include Subfolders**: Whether to scan subfolders

### 🏠 Home Layout
- **Images Per Row**: Set number of images per row in gallery mode
- **Card Spacing**: Spacing between image cards
- **Card Radius**: Border radius of image cards
- **Fixed Image Height**: Set fixed image display height
- **Default Sort**: Set default sort when opening
- **Default Sort Order**: Ascending or descending
- **Default Filter Type**: Set default filter type when opening

### 🖼️ Image Card
- **Pure Gallery Mode**: Show images only, hide all info
- **Adaptive Size**: Adaptive display based on image dimensions
- **Uniform Card Height**: All cards use same height
- **Show Name/Size/Dimensions/Index/Lock Icon**: Control info displayed on cards
- **Name Wrap**: Filename auto-wrap
- **Mouse Hover Animation**: Enable elegant floating effect when hovering over image thumbnails

### 🗑️ Delete & Trash
- **Confirm Before Delete**: Show confirmation dialog before deleting files
- **Move to System Trash**: Move files to system trash when deleting
- **Enable Plugin Trash**: Use plugin's built-in trash functionality
- **Restore Path**: Set target path for restoring files

### 🔗 Reference & Preview
- **Keep Detail Open When Going to Note**: Keep detail page open when clicking "Go to Note"
- **Show Reference Time**: Show note file's last modified time in reference info area
- **Default Wheel Mode**: Set default wheel behavior (zoom/scroll)

### 🔄 Rename Settings
- **Auto Generate Filename**: Auto-generate sequence filename based on note title
- **Path Naming Depth**: Path depth used in smart rename
- **Duplicate Handling**: Strategy for handling duplicate files
- **Multi-reference Handling**: Strategy for handling multiple note references
- **Save Batch Rename Log**: Whether to generate rename record file

### ⚡ Performance Optimization
- **Enable Lazy Loading**: Delay loading images for better performance
- **Lazy Load Delay**: Wait time for delayed loading
- **Max Cache Size**: Maximum number of image cache
- **Incremental Scan Cache**: Enable incremental scan, only scan new or modified files

### 🔍 Search Settings
- **Case Sensitive**: Whether search is case sensitive
- **Live Search Delay**: Delay time after input before searching
- **Search in Path**: Whether to search in file paths

### 📦 Batch Operations
- **Max Batch Operations**: Maximum number of files per batch operation (default 100)
- **Batch Confirm Threshold**: Show confirmation dialog when exceeding this number
- **Show Batch Progress**: Show progress bar during batch operations

### 🔒 Locked Files
- **Lock List Management**: Manage list of protected files
- **Show File Path**: Show file path in lock list
- **Batch Unlock**: Support batch unlock files

### 📊 Statistics
- **Show Statistics**: Show statistics in interface
- **Statistics Position**: Display position of statistics (top/bottom)

### 📋 Operation Logs
- **Log Level**: Set minimum log level to record
- **Output to Console**: Whether to output logs to browser console
- **Enable DEBUG Log**: Whether to record DEBUG level logs
- **View/Clear Logs**: View and clear operation logs

### ⌨️ Keyboard Shortcuts
- **Customize All Shortcuts**: Customize all shortcuts in settings page
- **Reset to Defaults**: Support reset to default values

### 🔄 MD5 Deduplication
- **Enable Deduplication**: Calculate and detect **local** duplicate images during scan (cloud images excluded)
- **Hash Cache Management**: Manage MD5 hash cache

### ☁️ Network Images
- **Scan Network Images**: Auto-scan network image links and write to cache
- **Clear Cache**: In settings → Network Images, one-click clear of all cache (images, files, blacklist); next scan will rebuild

### 📱 Mobile Adaptation
- **Mobile Images Per Row**: Number of images per row on mobile (1-5)
- **Enable Compact Toolbar**: More compact toolbar on mobile
- **Hide Non-essential Info**: Hide dimensions, lock icon, etc. on mobile
- **Tablet Images Per Row**: Number of images per row on tablet (default 3)
- **Phone Landscape Images Per Row**: Number of images per row on phone landscape (default 2)
- **Phone Portrait Images Per Row**: Number of images per row on phone portrait (default 1)
- **Android Gallery Hide**: Create `.nomedia` file to prevent Android gallery from scanning images

## ❓ FAQ

<details>
<summary><b>Scanning is slow?</b></summary>

- **First scan**: MD5 deduplication calculates file hashes, first scan may be slow
- **Incremental scan**: Plugin caches scan results, subsequent scans only process new/modified files, 50-80% faster
- **Temporary disable**: You can disable MD5 deduplication in settings temporarily
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

### Requirements
- Node.js 18+ (LTS version recommended)
- npm (project uses npm as package manager)
- Obsidian (for testing plugin)

### Quick Start

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

### Development Workflow
1. Run `npm run dev` to start watch mode
2. Modify code in `src/` directory
3. Files auto-compile on save
4. Press `Ctrl+R` in Obsidian to reload plugin
5. Test if modifications work correctly

### Project Structure

```
src/
├── main.ts                    # Plugin entry, lifecycle management
├── settings.ts                # Settings definition and defaults
├── types.ts                   # TypeScript type definitions
├── constants.ts               # UI/timing/limits constants
├── ui/                        # UI components
│   ├── image-manager-view.ts  # Main image manager view
│   ├── image-detail-modal.ts  # Image detail modal
│   ├── settings-tab.ts        # Settings page
│   ├── trash-modal.ts         # Recycle bin modal
│   ├── link-format-modal.ts   # Link format conversion
│   ├── broken-links-modal.ts  # Broken link detection
│   ├── duplicate-detection-modal.ts  # Duplicate detection
│   ├── log-viewer-modal.ts    # Log viewer
│   ├── sort-modal.ts          # Multi-level sorting
│   ├── filter-modal.ts        # Advanced filtering
│   ├── group-modal.ts         # Group management
│   ├── search-modal.ts        # Search modal
│   ├── stats-modal.ts         # Statistics info
│   ├── rename-modal.ts        # Rename modal
│   ├── confirm-modal.ts       # Confirm dialog
│   ├── reference-select-modal.ts  # Reference selection
│   └── components/            # Reusable components
│       ├── image-preview-panel.ts   # Image preview panel
│       ├── image-controls-panel.ts  # Image controls panel
│       └── image-history-panel.ts   # Operation history panel
└── utils/                     # Utility functions
    ├── logger.ts              # Operation log system
    ├── error-handler.ts       # Error handler
    ├── lock-list-manager.ts   # Lock list management
    ├── reference-manager.ts   # Reference management
    ├── reference-edit-service.ts  # Reference edit service
    ├── trash-manager.ts       # Recycle bin management
    ├── trash-path-parser.ts   # Trash path parser
    ├── trash-formatter.ts     # Trash formatter
    ├── history-manager.ts     # History management
    ├── hash-cache-manager.ts  # Hash cache management
    ├── image-hash.ts          # MD5 hash calculation
    ├── image-scanner.ts       # Image scanner
    ├── image-processor.ts     # Image processing
    ├── image-optimizer.ts     # Image optimization
    ├── file-filter.ts         # File filtering
    ├── file-edit-service.ts   # File edit service
    ├── path-validator.ts      # Path validation
    ├── keyboard-shortcut-manager.ts  # Keyboard shortcuts
    ├── drag-select-manager.ts # Drag selection management
    └── resizable-modal.ts     # Resizable modal
```

### Tech Stack

- **TypeScript** - Type safety, strict mode
- **esbuild** - Fast bundling
- **spark-md5** - MD5 hash calculation
- **HTML5 Canvas** - Image processing
- **Obsidian Plugin API** - Plugin framework

### Core Modules

#### main.ts - Plugin Entry
- Plugin lifecycle management (onload, onunload)
- View and command registration
- Event listener setup (with debounce optimization)
- Settings loading and saving
- Core manager initialization (Logger, ErrorHandler, ReferenceManager, TrashManager, HistoryManager, LockListManager)

#### Utility Modules
- **logger.ts** - Professional log system, tracking based on MD5 hash
- **image-scanner.ts** - Image scanner, supports recursive scan and incremental update
- **reference-manager.ts** - Reference management, supports Markdown/Wiki/HTML formats
- **image-hash.ts** - MD5 hash calculation, supports cache management
- **trash-manager.ts** - Recycle bin management, supports restore and permanent delete
- **lock-list-manager.ts** - Lock list management, supports duplicate detection and batch operations

### Code Standards

- **TypeScript Strict Mode**: Use strict type checking
- **Naming Conventions**: Class names PascalCase, function names camelCase, constants UPPER_SNAKE_CASE
- **Error Handling**: Use ErrorHandler for unified error handling
- **Comment Standards**: Add JSDoc comments for public methods

### Debugging Tips

- Enable DEBUG log level in settings to view detailed debug info
- Press `Ctrl+Shift+I` in Obsidian to open developer tools
- Check browser console output and network requests


## 🤝 Contributing

Issues and Pull Requests are welcome!

1. Fork this repository
2. Create feature branch `git checkout -b feature/xxx`
3. Commit changes `git commit -m 'Add xxx'`
4. Push branch `git push origin feature/xxx`
5. Submit Pull Request

## 📄 License

[MIT License](LICENSE) © 2025 Coeris
