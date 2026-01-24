# API Documentation

## Table of Contents

- [Core Plugin API](#core-plugin-api)
- [Logger API](#logger-api)
- [Reference Manager API](#reference-manager-api)
- [Trash Manager API](#trash-manager-api)
- [Lock List Manager API](#lock-list-manager-api)
- [History Manager API](#history-manager-api)
- [Image Scanner API](#image-scanner-api)
- [Event System](#event-system)

---

## Core Plugin API

### Class: `ImageManagementPlugin`

The main plugin class that orchestrates all functionality.

#### Properties

```typescript
// Core Managers
settings: ImageManagementSettings          // Plugin settings
logger: Logger                            // Log manager
errorHandler: ErrorHandler                // Error handler
data: PluginData                         // Plugin persistent data
referenceManager: ReferenceManager       // Reference relationship manager
trashManager: TrashManager               // Trash management
historyManager: HistoryManager           // Operation history
lockListManager: LockListManager         // File lock management

// Cache Systems
displayTextCache: Map<string, Map<number, string>>  // Wiki link display text cache
fullLineCache: Map<string, Map<number, string>>     // Full line content cache
deletedFiles: Map<string, {file: TFile, content: ArrayBuffer}>  // Deleted files for undo
referenceCache: Map<string, Set<string>>           // Image reference cache
recentlyRenamedImages: Map<string, {timestamp: number, referencedFiles: string[]}>  // Recent rename tracking
```

#### Methods

##### `async onload(): Promise<void>`

Plugin lifecycle method - called when plugin loads.

**Flow Diagram:**
```
Plugin Load
    ↓
Load Data & Settings
    ↓
Initialize Managers (Logger, ErrorHandler, Reference, Trash, Lock, History)
    ↓
Register Views & Commands
    ↓
Setup Event Listeners (file create/rename/delete/metadata changes)
    ↓
Delayed Initialization (Reference Cache after 5s, Mark as initialized after 3s)
```

**Event Listeners Registered:**
- `metadataCache.on('changed')` - Detect display text and reference changes
- `vault.on('create')` - Detect new image files
- `vault.on('rename')` - Detect renamed image files
- `vault.on('delete')` - Detect deleted image files
- `workspace.on('file-menu')` - Add context menu items

##### `async activateView(): Promise<void>`

Activate the image manager view in the workspace.

**Returns:** `Promise<void>`

##### `async scanImages(folderPath?: string): Promise<ImageInfo[]>`

Scan for images in the specified folder.

**Parameters:**
- `folderPath?: string` - Optional folder path to scan. If not provided, uses default image folder.

**Returns:** `Promise<ImageInfo[]>` - Array of scanned image information

**Algorithm:**
1. Validate folder path using `PathValidator`
2. Use `ImageScanner` to scan directory recursively
3. Apply file filters (ignore patterns, extensions)
4. Calculate MD5 hashes if deduplication enabled
5. Cache results and update data
6. Log operation

##### `async renameImage(oldPath: string, newPath: string): Promise<boolean>`

Rename an image file and update all references.

**Parameters:**
- `oldPath: string` - Current image path
- `newPath: string` - New image path

**Returns:** `Promise<boolean>` - Success status

**Flow:**
```
Validate Paths → Check Lock Status → Rename File → Update References → Log Operation → Save History
```

##### `async deleteImage(imagePath: string, permanent: boolean = false): Promise<boolean>`

Delete an image file.

**Parameters:**
- `imagePath: string` - Image path to delete
- `permanent: boolean` - Whether to permanently delete (skip trash)

**Returns:** `Promise<boolean>` - Success status

**Features:**
- Respects lock status (locked files cannot be deleted)
- Supports system trash and plugin trash
- Records operation in history
- Updates reference cache

---

## Logger API

### Class: `Logger`

Comprehensive logging system for tracking all plugin operations.

#### Properties

```typescript
plugin: ImageManagementPlugin           // Plugin instance
logs: any[]                            // In-memory log storage
isDevMode: boolean                     // Development mode flag
saveQueue: Promise<void> | null       // Batch save queue
needsSave: boolean                    // Flag indicating save needed
```

#### Methods

##### `async log(level: LogLevel, operation: OperationType, message: string, context?: LogContext): Promise<void>`

Main logging method.

**Parameters:**
- `level: LogLevel` - Log level (DEBUG, INFO, WARNING, ERROR)
- `operation: OperationType` - Operation type from enum
- `message: string` - Log message
- `context?: LogContext` - Additional context data

**Context Data Structure:**
```typescript
interface LogContext {
    imagePath?: string;           // Image path
    oldPath?: string;             // Old path (for rename/move)
    newPath?: string;             // New path (for rename/move)
    referencedFiles?: string[];   // Affected note files
    lineNumber?: number;          // Line number in note
    oldDisplayText?: string;      // Old display text (Wiki links)
    newDisplayText?: string;      // New display text (Wiki links)
    details?: Record<string, any>; // Additional details
}
```

**Batch Save Mechanism:**
- Logs are queued for 100ms before saving
- Multiple logs within 100ms are batched together
- Reduces disk I/O for high-frequency operations

##### `async getLogs(filter?: LogFilter): Promise<LogEntry[]>`

Retrieve logs with optional filtering.

**Parameters:**
- `filter?: LogFilter` - Filter options

**Filter Options:**
```typescript
interface LogFilter {
    level?: LogLevel;              // Minimum log level
    operation?: OperationType;     // Specific operation type
    imagePath?: string;            // Filter by image path
    startTime?: number;            // Start timestamp
    endTime?: number;              // End timestamp
    maxCount?: number;             // Maximum number of logs
}
```

##### `async exportLogs(format: 'json' | 'csv' = 'json'): Promise<string>`

Export logs in specified format.

**Parameters:**
- `format: 'json' | 'csv'` - Export format

**Returns:** `Promise<string>` - Exported data as string

---

## Reference Manager API

### Class: `ReferenceManager`

Manages image reference relationships across notes.

#### Methods

##### `async findAllReferences(imagePath: string, forceRefresh: boolean = false): Promise<ImageReferenceInfo[]>`

Find all references to an image.

**Parameters:**
- `imagePath: string` - Image path to search for
- `forceRefresh: boolean` - Force cache refresh

**Returns:** `Promise<ImageReferenceInfo[]>` - Array of reference information

**Algorithm:**
```
1. Check cache first (if not forceRefresh)
2. Scan all markdown files in vault
3. Parse each file content line by line
4. Detect image links (Wiki/Markdown/HTML)
5. Match against target image path
6. Cache results
7. Return reference info array
```

**Supported Link Formats:**
- Wiki: `![[image.png]]`, `![[image.png|text]]`, `![[image.png|100x200]]`
- Markdown: `![alt](image.png)`
- HTML: `<img src="image.png">`, `<img src="image.png" width="100">`

##### `async updateReferences(oldPath: string, newPath: string, displayText?: string): Promise<UpdateReferenceResult>`

Update all references when an image is renamed.

**Parameters:**
- `oldPath: string` - Old image path
- `newPath: string` - New image path
- `displayText?: string` - Optional new display text

**Returns:** `Promise<UpdateReferenceResult>`

**Result Structure:**
```typescript
interface UpdateReferenceResult {
    success: boolean;                    // Overall success
    updatedFiles: string[];              // Successfully updated files
    failedFiles: string[];               // Failed to update files
    totalReferences: number;             // Total references found
    updatedReferences: number;           // Successfully updated references
}
```

**Update Process:**
```
For each referencing file:
  1. Read file content
  2. Find all links to oldPath
  3. Replace with newPath
  4. Preserve display text and dimensions
  5. Write updated content
  6. Log each update
```

##### `async detectDisplayTextChanges(file: TFile): Promise<void>`

Detect and log changes to Wiki link display text.

**Parameters:**
- `file: TFile` - File to check

**Process:**
1. Read current file content
2. Compare with cached version
3. Detect display text changes
4. Update cache
5. Log changes

---

## Trash Manager API

### Class: `TrashManager`

Manages deleted images with restore capability.

#### Methods

##### `async moveToTrash(imagePath: string, options?: TrashOptions): Promise<boolean>`

Move an image to trash.

**Parameters:**
- `imagePath: string` - Image path to trash
- `options?: TrashOptions` - Trash options

**Options:**
```typescript
interface TrashOptions {
    permanent?: boolean;      // Skip trash, permanently delete
    moveToSystemTrash?: boolean; // Use system trash
    metadata?: Record<string, any>; // Additional metadata
}
```

**Returns:** `Promise<boolean>` - Success status

##### `async restoreFromTrash(imagePath: string, restorePath?: string): Promise<boolean>`

Restore an image from trash.

**Parameters:**
- `imagePath: string` - Image path in trash
- `restorePath?: string` - Optional custom restore path

**Returns:** `Promise<boolean>` - Success status

##### `async getTrashedImages(): Promise<TrashedImageInfo[]>`

Get list of all trashed images.

**Returns:** `Promise<TrashedImageInfo[]>` - Array of trashed image info

**Trashed Image Structure:**
```typescript
interface TrashedImageInfo {
    path: string;              // Original path
    trashPath: string;         // Path in trash
    size: number;              // File size
    deletedAt: number;         // Deletion timestamp
    metadata?: Record<string, any>; // Additional metadata
}
```

---

## Lock List Manager API

### Class: `LockListManager`

Manages file locking to prevent accidental modifications.

#### Locking Mechanism

Locks are based on **three-factor authentication:**
1. **MD5 Hash** - File content hash
2. **File Name** - Exact filename match
3. **File Path** - Exact path match

This ensures that even if a file is renamed or moved, the lock won't accidentally apply to a different file.

#### Methods

##### `async lockFile(imagePath: string): Promise<boolean>`

Lock a file to prevent modifications.

**Parameters:**
- `imagePath: string` - Image path to lock

**Returns:** `Promise<boolean>` - Success status

**Process:**
1. Calculate MD5 hash of file
2. Store hash, filename, and path
3. Add to lock list
4. Log operation
5. Save to persistent storage

##### `async unlockFile(imagePath: string): Promise<boolean>`

Unlock a previously locked file.

**Parameters:**
- `imagePath: string` - Image path to unlock

**Returns:** `Promise<boolean>` - Success status

##### `isFileLocked(imagePath: string): boolean`

Check if a file is locked.

**Parameters:**
- `imagePath: string` - Image path to check

**Returns:** `boolean` - Locked status

**Validation:**
```
1. Check if path exists in lock list
2. Verify current file MD5 matches stored MD5
3. Verify filename matches
4. If any check fails, file is NOT locked
```

##### `async getLockedFiles(): Promise<LockedFileInfo[]>`

Get list of all locked files.

**Returns:** `Promise<LockedFileInfo[]>` - Array of locked file information

---

## History Manager API

### Class: `HistoryManager`

Manages operation history for undo/redo functionality.

#### Methods

##### `async recordOperation(operation: OperationRecord): Promise<void>`

Record an operation in history.

**Parameters:**
- `operation: OperationRecord` - Operation to record

**Record Structure:**
```typescript
interface OperationRecord {
    id: string;                   // Unique operation ID
    type: OperationType;          // Operation type
    timestamp: number;            // Operation timestamp
    imagePath: string;            // Affected image path
    oldValue?: any;               // Old value (for undo)
    newValue?: any;               // New value
    metadata?: Record<string, any>; // Additional metadata
}
```

##### `async getHistory(imagePath?: string): Promise<OperationRecord[]>`

Get operation history.

**Parameters:**
- `imagePath?: string` - Optional filter by image path

**Returns:** `Promise<OperationRecord[]>` - Array of operation records

##### `async undo(operationId: string): Promise<boolean>`

Undo a specific operation.

**Parameters:**
- `operationId: string` - Operation ID to undo

**Returns:** `Promise<boolean>` - Success status

---

## Image Scanner API

### Class: `ImageScanner`

Scans and indexes images in the vault.

#### Methods

##### `async scanDirectory(folderPath: string, options?: ScanOptions): Promise<ImageInfo[]>`

Scan a directory for images.

**Parameters:**
- `folderPath: string` - Directory to scan
- `options?: ScanOptions` - Scan options

**Options:**
```typescript
interface ScanOptions {
    recursive?: boolean;          // Scan subdirectories
    includeRemote?: boolean;      // Include remote images
    calculateHashes?: boolean;    // Calculate MD5 hashes
    maxFileSize?: number;         // Max file size to scan
    extensions?: string[];        // File extensions to include
}
```

**Returns:** `Promise<ImageInfo[]>` - Array of scanned images

**Scanning Algorithm:**
```
1. Validate folder path
2. Read directory contents
3. For each file:
   a. Check if it's an image (extension check)
   b. Check file size limits
   c. Check ignore patterns
   d. Calculate MD5 if enabled (with cache check)
   e. Extract metadata (dimensions if possible)
   f. Add to results
4. For each subdirectory (if recursive):
   a. Recursively scan
5. Return all results
6. Cache scan results
```

##### `async getImageInfo(imagePath: string): Promise<ImageInfo | null>`

Get detailed information about a specific image.

**Parameters:**
- `imagePath: string` - Image path

**Returns:** `Promise<ImageInfo | null>` - Image information or null if not found

**Image Info Structure:**
```typescript
interface ImageInfo {
    path: string;                 // Full path
    name: string;                 // Filename
    size: number;                 // File size in bytes
    width?: number;               // Image width
    height?: number;              // Image height
    modified: number;             // Last modified timestamp
    md5?: string;                 // MD5 hash
    group?: string;               // Group name
    references?: ImageReferenceInfo[]; // References
    referenceCount?: number;      // Number of references
    isRemote?: boolean;           // Is remote image
}
```

---

## Event System

The plugin emits events for various operations. Subscribe to these events to extend functionality.

### Event Types

```typescript
enum PluginEvent {
    IMAGE_SCANNED = 'image-scanned',              // Image scanned
    IMAGE_RENAMED = 'image-renamed',              // Image renamed
    IMAGE_DELETED = 'image-deleted',              // Image deleted
    REFERENCE_UPDATED = 'reference-updated',      // Reference updated
    SETTINGS_CHANGED = 'settings-changed',        // Settings changed
    LOG_ENTRY_ADDED = 'log-entry-added',          // New log entry
    FILE_LOCKED = 'file-locked',                  // File locked
    FILE_UNLOCKED = 'file-unlocked',              // File unlocked
    BATCH_OPERATION_STARTED = 'batch-started',    // Batch operation started
    BATCH_OPERATION_COMPLETED = 'batch-completed' // Batch operation completed
}
```

### Subscribing to Events

```typescript
// Subscribe to an event
plugin.on(PluginEvent.IMAGE_RENAMED, (data) => {
    console.log('Image renamed:', data);
});

// Event data structure for IMAGE_RENAMED
interface ImageRenameEventData {
    oldPath: string;
    newPath: string;
    updatedReferences: number;
    timestamp: number;
}
```

---

## Error Handling

### Class: `ErrorHandler`

Centralized error handling and reporting.

#### Methods

##### `async handle(error: Error, operation: OperationType, context?: string): Promise<void>`

Handle an error.

**Parameters:**
- `error: Error` - Error object
- `operation: OperationType` - Operation that caused the error
- `context?: string` - Additional context

**Features:**
- Logs error to logger
- Shows user-friendly error notice
- In dev mode, logs to console
- Sends error reports (if configured)

---

## Usage Examples

### Example 1: Scan Images

```typescript
// Get plugin instance
const plugin = app.plugins.plugins['imagemgr'];

// Scan default folder
const images = await plugin.scanImages();
console.log(`Found ${images.length} images`);

// Scan specific folder
const folderImages = await plugin.scanImages('Assets/Images');
```

### Example 2: Rename Image with Reference Updates

```typescript
const plugin = app.plugins.plugins['imagemgr'];

// Rename and update all references
const result = await plugin.renameImage(
    'old-image.png',
    'new-image.png'
);

if (result) {
    console.log('Rename successful');
} else {
    console.log('Rename failed');
}
```

### Example 3: Log Custom Operation

```typescript
const plugin = app.plugins.plugins['imagemgr'];

// Log a custom operation
await plugin.logger.info(
    OperationType.CUSTOM,
    'Custom operation completed',
    {
        imagePath: 'image.png',
        details: { customData: 'value' }
    }
);
```

### Example 4: Subscribe to Events

```typescript
const plugin = app.plugins.plugins['imagemgr'];

// Listen for image deletions
plugin.on('image-deleted', (data) => {
    console.log(`Image deleted: ${data.imagePath}`);
    
    // Perform custom cleanup
    cleanupRelatedData(data.imagePath);
});
```

---

## Best Practices

### 1. Always Check Lock Status

Before modifying images, check if they're locked:

```typescript
if (plugin.lockListManager.isFileLocked(imagePath)) {
    console.log('File is locked, cannot modify');
    return;
}
```

### 2. Use Batch Operations for Multiple Files

For operations on multiple files, use batch operations:

```typescript
// Good - batch operation
await plugin.performBatchOperation('rename', selectedImages);

// Avoid - individual operations in loop
for (const image of selectedImages) {
    await plugin.renameImage(image.oldPath, image.newPath); // Slow!
}
```

### 3. Handle Errors Gracefully

Always wrap operations in try-catch:

```typescript
try {
    await plugin.renameImage(oldPath, newPath);
} catch (error) {
    await plugin.errorHandler.handle(
        error,
        OperationType.RENAME,
        'Failed to rename image'
    );
}
```

### 4. Respect User Settings

Check user settings before performing operations:

```typescript
if (plugin.settings.confirmBeforeDelete) {
    const confirmed = await showConfirmationDialog();
    if (!confirmed) return;
}
```

### 5. Use Logger for Important Operations

Log all significant operations:

```typescript
await plugin.logger.info(
    OperationType.CUSTOM_BATCH,
    'Batch processing completed',
    {
        imageCount: processedImages.length,
        successCount: successCount,
        failedCount: failedCount
    }
);
```

---

## Performance Considerations

### 1. Cache Utilization

The plugin uses extensive caching. Use cache when possible:

```typescript
// Check cache first
const cached = plugin.referenceCache.get(imagePath);
if (cached) {
    return cached;
}

// Fetch and cache
const references = await plugin.referenceManager.findAllReferences(imagePath);
plugin.referenceCache.set(imagePath, new Set(references.map(r => r.filePath)));
```

### 2. Debounce Frequent Operations

For operations that may be called frequently, use debouncing:

```typescript
const debouncedScan = debounce(() => {
    plugin.scanImages();
}, 1000);

// Call multiple times - only executes once after 1s
debouncedScan();
debouncedScan();
debouncedScan();
```

### 3. Lazy Loading

Enable lazy loading for better performance with many images:

```typescript
// In settings
plugin.settings.enableLazyLoading = true;
plugin.settings.lazyLoadDelay = 200; // ms
```

---

## Troubleshooting

### Issue: "File is locked" error

**Cause:** File is protected by lock list

**Solution:**
```typescript
// Check lock status
if (plugin.lockListManager.isFileLocked(imagePath)) {
    // Unlock first
    await plugin.lockListManager.unlockFile(imagePath);
}
// Then perform operation
```

### Issue: References not updating after rename

**Cause:** Cache may be stale

**Solution:**
```typescript
// Force refresh cache
const references = await plugin.referenceManager.findAllReferences(
    imagePath,
    true // forceRefresh = true
);
```

### Issue: High memory usage

**Cause:** Large image library with full caching

**Solution:**
```typescript
// Reduce cache size
plugin.settings.maxCacheSize = 50; // Default is 100

// Enable lazy loading
plugin.settings.enableLazyLoading = true;
```

---

## API Version History

### v1.0.0 (Current)

- Initial API release
- Core functionality: scanning, renaming, references, trash, locks
- Logger system with batch save
- Event system
- Error handling

---

## Support

For API questions or issues:

1. Check the [README](./README.md) for usage examples
2. Review the [Development Review](./DEVELOPMENT_REVIEW.md) for architecture details
3. Open an issue on GitHub
4. Check existing issues for similar questions

---

*Generated for ImageMgr Plugin v1.0.0*
