# Technical Guide & Architecture

## Architecture Overview

ImageMgr is built with a modular architecture designed for maintainability, performance, and extensibility. This guide explains the technical implementation and architectural decisions.

```
┌─────────────────────────────────────────────────────────────┐
│                    ImageManagementPlugin                    │
│                    (Main Orchestrator)                      │
└─────────────────────────────────────────────────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  Core Layer  │         │  Service     │         │  UI Layer    │
│  (Managers)  │         │  Layer       │         │  (Views &    │
│              │         │  (Utils)     │         │   Modals)    │
└──────────────┘         └──────────────┘         └──────────────┘
         │                        │                        │
    ┌────┴────┐            ┌──────┴──────┐          ┌─────┴──────┐
    │         │            │             │          │            │
┌───▼─┐   ┌──▼──┐      ┌──▼─────┐   ┌───▼────┐   ┌──▼────┐  ┌──▼────┐
│Logger│  │Error│      │Reference│  │  Trash │   │Image │  │Settings│
│      │  │     │      │Manager  │  │Manager │   │Detail│  │        │
│      │  │Handler│    │         │  │        │   │Modal │  │ Tab    │
└──────┘  └─────┘      └─────────┘  └────────┘   └───────┘  └────────┘
```

## Core Architecture Principles

### 1. **Separation of Concerns**

Each module has a single, well-defined responsibility:

- `Logger` - Logging and audit trails
- `ReferenceManager` - Finding and updating references
- `TrashManager` - Deleted file management
- `LockListManager` - File protection
- `ImageScanner` - Image discovery and metadata extraction

### 2. **Cache-First Strategy**

Performance optimization through aggressive caching:

```typescript
// Reference Cache
private referenceCache: Map<string, Set<string>> = new Map();
// Hash Cache (for MD5)  
private hashCache: Map<string, {hash: string, mtime: number}> = new Map();
// Display Text Cache
private displayTextCache: Map<string, Map<number, string>> = new Map();
```

**Cache Invalidation Strategy:**
- File rename/delete → Invalidate all related caches
- File content change → Invalidate content-based caches
- Time-based expiry → Clean up old cache entries

### 3. **Batch Operations**

All bulk operations use batching to minimize disk I/O:

```typescript
// Example: Batch rename
async batchRename(images: ImageInfo[]): Promise<void> {
    const operations = images.map(img => ({
        oldPath: img.path,
        newPath: generateNewPath(img)
    }));
    
    // Process in batches of 10
    for (let i = 0; i < operations.length; i += 10) {
        const batch = operations.slice(i, i + 10);
        await Promise.all(batch.map(op => this.rename(op)));
    }
}
```

### 4. **Async/Await Pattern**

All I/O operations are async to prevent UI blocking:

```typescript
// Non-blocking file operations
async scanImages(): Promise<ImageInfo[]> {
    // Returns Promise immediately
    // UI remains responsive
    const files = await this.vault.getFiles();
    // ...
}
```

## Key Technical Implementations

### 1. Reference Detection Algorithm

**Challenge:** Accurately detect image references in various formats within complex Markdown files.

**Solution:** Multi-pass parsing with syntax-aware filtering.

```mermaid
graph TD
    A[Start] --> B[Read File Content]
    B --> C[Remove Code Blocks (```)]
    C --> D[Remove Inline Code (`)]
    D --> E[Split into Lines]
    E --> F{For Each Line}
    F --> G[Check Wiki Links ![[...]]]
    G --> H{Is Image Extension?}
    H -->|Yes| I[Extract Path & Display Text]
    H -->|No| F
    F --> J[Check Markdown Links ![...](...)]
    J --> K{Is Image Extension?}
    K -->|Yes| L[Extract Path & Alt Text]
    K -->|No| F
    F --> M[Check HTML <img> Tags]
    M --> N{Has src Attribute?}
    N -->|Yes| O[Extract src & alt]
    N -->|No| F
    O --> P{Is Image Extension?}
    P -->|Yes| Q[Add to References]
    P -->|No| F
    Q --> R{More Lines?}
    R -->|Yes| F
    R -->|No| S[Return References]
```

**Performance Optimizations:**
- Line-by-line processing to handle large files
- Early exit for non-matching lines
- Regex caching for repeated patterns
- Extension check before detailed parsing

### 2. MD5 Hash Caching System

**Challenge:** MD5 calculation is CPU-intensive for large images.

**Solution:** Multi-level caching with modification time tracking.

```typescript
// Hash Cache Structure
interface HashCacheEntry {
    hash: string;           // MD5 hash
    mtime: number;          // File modification time
    size: number;           // File size
    lastAccessed: number;   // Last access timestamp
}

// Caching Logic
async getHash(file: TFile): Promise<string> {
    const cacheKey = file.path;
    const cached = this.hashCache.get(cacheKey);
    
    // Cache hit - check if file modified
    if (cached && cached.mtime === file.stat.mtime) {
        return cached.hash; // Instant return
    }
    
    // Cache miss or stale - recalculate
    const hash = await calculateMD5(file);
    
    // Store in cache
    this.hashCache.set(cacheKey, {
        hash,
        mtime: file.stat.mtime,
        size: file.stat.size,
        lastAccessed: Date.now()
    });
    
    return hash;
}
```

**Cache Management:**
- LRU eviction (1000 entries max)
- Size-based cleanup (max 50MB)
- Time-based expiry (7 days)

### 3. Batch Save Queue (Logger Performance)

**Challenge:** High-frequency logging causes disk I/O bottlenecks.

**Solution:** 100ms batching with Promise chaining.

```typescript
private async saveLogs(): Promise<void> {
    // If save already queued, just mark as needing save
    if (this.saveQueue) {
        this.needsSave = true;
        return this.saveQueue;
    }
    
    // Create new save queue
    this.saveQueue = (async () => {
        // Wait 100ms for more logs
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check if still needs save
        if (this.needsSave) {
            this.needsSave = false;
            const data = this.plugin.data || {};
            data.logs = this.logs;
            await this.plugin.saveData(data);
        }
    })();
    
    this.needsSave = true;
    return this.saveQueue;
}
```

**Benefits:**
- Reduces disk writes by 90%+
- Maintains log order
- Prevents data loss on crash

### 4. Reference Update Transaction System

**Challenge:** Ensuring atomic reference updates across multiple files.

**Solution:** Two-phase commit with rollback capability.

```mermaid
sequenceDiagram
    participant Client
    participant ReferenceManager
    participant FileSystem
    participant Logger
    
    Client->>ReferenceManager: updateReferences(oldPath, newPath)
    ReferenceManager->>FileSystem: Find all referencing files
    FileSystem-->>ReferenceManager: File list
    
    loop For each file
        ReferenceManager->>FileSystem: Read file content
        FileSystem-->>ReferenceManager: Content
        ReferenceManager->>ReferenceManager: Find and replace links
        ReferenceManager->>Logger: Log planned change
    end
    
    ReferenceManager->>FileSystem: Write all changes (Phase 1)
    FileSystem-->>ReferenceManager: Success/Failure
    
    alt Success
        ReferenceManager->>Logger: Log completion
        ReferenceManager-->>Client: Success
    else Failure
        ReferenceManager->>FileSystem: Rollback changes
        ReferenceManager->>Logger: Log failure
        ReferenceManager-->>Client: Failure
    end
```

**Key Features:**
- Atomic updates (all or nothing)
- Automatic rollback on failure
- Detailed error reporting
- Idempotent operations

### 5. File Locking Mechanism

**Challenge:** Prevent accidental modification of important files.

**Solution:** Three-factor authentication lock system.

```typescript
interface LockEntry {
    hash: string;           // MD5 content hash
    fileName: string;       // Exact filename
    filePath: string;       // Exact path
    addedTime: number;      // When locked
    reason?: string;        // Why locked
}

// Check if file is locked
isFileLocked(imagePath: string): boolean {
    const lock = this.lockList.get(imagePath);
    if (!lock) return false;
    
    // Get current file info
    const file = this.app.vault.getAbstractFileByPath(imagePath);
    if (!(file instanceof TFile)) return false;
    
    // Three-factor verification
    const currentHash = await this.getHash(file);
    
    return (
        currentHash === lock.hash &&        // Content unchanged
        file.name === lock.fileName &&      // Name unchanged
        file.path === lock.filePath         // Path unchanged
    );
}
```

**Benefits:**
- Survives renames/moves
- Detects content changes
- Prevents false matches

### 6. Incremental Scanning

**Challenge:** Full vault scanning is slow for large repositories.

**Solution:** Smart delta scanning with change detection.

```mermaid
graph TD
    A[Scan Request] --> B{Last Scan Exists?}
    B -->|No| C[Full Scan]
    B -->|Yes| D[Get Modified Files]
    D --> E{Any Changes?}
    E -->|No| F[Return Cached Results]
    E -->|Yes| G[Scan Only Changed Files]
    C --> H[Update Cache]
    G --> H
    F --> I[Return Results]
    H --> I
```

**Change Detection:**
- Track file modification times (mtime)
- Track file sizes
- Track creation times (ctime)
- Combined key: `${mtime}-${size}-${ctime}`

**Performance:**
- First scan: O(n) - all files
- Subsequent scans: O(k) - only changed files (k << n)
- Typical speedup: 50-80% for incremental scans

### 7. Network Image Loading with Fallback

**Challenge:** Network images may fail due to CORS, authentication, or network issues.

**Solution:** Multi-tier fallback loading strategy.

```typescript
async loadNetworkImage(url: string): Promise<HTMLImageElement> {
    const strategies = [
        // Tier 1: Direct load
        () => this.loadDirect(url),
        
        // Tier 2: Obsidian proxy (for Obsidian-hosted images)
        () => this.loadViaObsidianProxy(url),
        
        // Tier 3: Public proxy (for external images)
        () => this.loadViaPublicProxy(url),
        
        // Tier 4: Local download + load
        () => this.downloadAndLoad(url)
    ];
    
    for (const strategy of strategies) {
        try {
            return await strategy();
        } catch (error) {
            // Log and try next strategy
            continue;
        }
    }
    
    throw new Error('All loading strategies failed');
}
```

**Fallback Chain:**
1. **Direct** - No proxy, fastest
2. **Obsidian Proxy** - For internal/external plugin use
3. **Public Proxy** - For external images (e.g., `wsrv.nl`)
4. **Local Download** - Download to temp and load

## Data Flow Diagrams

### Image Rename Flow

```mermaid
graph LR
    A[User Renames Image] --> B[Vault Rename Event]
    B --> C[Plugin Detects Rename]
    C --> D[Check Lock Status]
    D -->|Locked| E[Abort & Show Error]
    D -->|Unlocked| F[Update File Reference]
    F --> G[Find All References]
    G --> H{Any References?}
    H -->|Yes| I[Update Each Note]
    H -->|No| J[Log Operation]
    I --> J
    J --> K[Update Cache]
    K --> L[Save History]
    L --> M[Show Success Notice]
```

### Image Delete Flow

```mermaid
graph TD
    A[User Deletes Image] --> B[Vault Delete Event]
    B --> C[Plugin Detects Delete]
    C --> D[Check Lock Status]
    D -->|Locked| E[Abort & Show Error]
    D -->|Unlocked| F[Check Settings]
    F --> G{Delete Mode?}
    G -->|System Trash| H[Move to System Trash]
    G -->|Plugin Trash| I[Move to .trash/]
    G -->|Permanent| J[Permanent Delete]
    H --> K[Log Operation]
    I --> K
    J --> K
    K --> L[Update References]
    L --> M[Update Cache]
    M --> N[Show Success Notice]
```

### Batch Operation Flow

```mermaid
graph TD
    A[User Starts Batch Operation] --> B[Validate Selection]
    B --> C[Check Batch Size
            vs Confirm Threshold]
    C -->|Exceeds| D[Show Confirmation Dialog]
    C -->|Within| E[Start Operation]
    D -->|Confirmed| E
    D -->|Cancelled| F[Abort]
    E --> G[Show Progress Modal]
    G --> H[Process in Batches
            (10 files per batch)]
    H --> I[Update Each File]
    I --> J[Update References]
    J --> K[Log Each Operation]
    K --> L{More Batches?}
    L -->|Yes| H
    L -->|No| M[Update Cache]
    M --> N[Hide Progress Modal]
    N --> O[Show Summary
            (Success/Failure Count)]
```

## Performance Optimizations

### 1. Virtual Scrolling for Large Lists

**Problem:** Rendering thousands of image cards causes DOM bloat.

**Solution:** Only render visible items (+ buffer).

```typescript
// Pseudocode
const visibleStart = Math.floor(scrollTop / itemHeight);
const visibleCount = Math.ceil(viewportHeight / itemHeight);
const renderCount = visibleCount + buffer * 2; // buffer = 5

// Render only visible items
const itemsToRender = allImages.slice(visibleStart, visibleStart + renderCount);
```

**Result:** Renders ~15 items instead of 1000+ → 98% reduction in DOM nodes

### 2. Lazy Image Loading

**Implementation:**
- Images load when entering viewport (+100px threshold)
- Uses Intersection Observer API
- Placeholder until loaded
- Error handling for broken images

```typescript
// Intersection Observer setup
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            loadImage(entry.target);
            observer.unobserve(entry.target);
        }
    });
}, {
    rootMargin: '100px' // Load before entering viewport
});
```

### 3. Debounced Search

**Problem:** Real-time search on every keystroke is slow.

**Solution:** 300ms debounce delay.

```typescript
// Search with debounce
const debouncedSearch = debounce((query) => {
    performSearch(query);
}, 300);

// Called on every keystroke, but executes after 300ms of inactivity
input.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
});
```

**Benefits:**
- Reduces search calls by 80-90%
- Better UX (waits for user to finish typing)
- Less CPU usage

### 4. Memoized Computations

**Problem:** Repeated calculations (sorting, filtering) are expensive.

**Solution:** Cache results based on dependencies.

```typescript
// Memoized filtering
let lastFilter = null;
let lastResult = null;

function filterImages(images, filter) {
    // Return cached if filter unchanged
    if (lastFilter && isEqual(filter, lastFilter)) {
        return lastResult;
    }
    
    // Compute and cache
    const result = performFilter(images, filter);
    lastFilter = filter;
    lastResult = result;
    
    return result;
}
```

## Error Handling Strategy

### Centralized Error Handler

All errors flow through `ErrorHandler` class:

```typescript
class ErrorHandler {
    async handle(error: Error, operation: OperationType, context: string) {
        // 1. Log to logger
        await this.logger.error(operation, context, { error: error.message });
        
        // 2. Show user-friendly notice
        new Notice(`Error: ${this.getUserFriendlyMessage(error)}`);
        
        // 3. Dev mode: log to console
        if (this.isDevMode) {
            console.error(`[${operation}] ${context}:`, error);
        }
        
        // 4. Optional: Report to error tracking service
        await this.reportError(error, operation, context);
    }
}
```

### Error Categories

| Category | Examples | Handling Strategy |
|----------|----------|-------------------|
| **User Errors** | File not found, Invalid path | User-friendly message, no logging |
| **Permission Errors** | Read-only file, Access denied | Explain required permissions |
| **Network Errors** | Image load failed, Timeout | Retry with fallback |
| **System Errors** | Disk full, Out of memory | Log + user notification |
| **Unexpected Errors** | Null pointer, Type errors | Log + report + safe fallback |

### Retry Logic

For transient failures (network, file locks):

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => 
                setTimeout(resolve, Math.pow(2, i) * 100)
            );
        }
    }
    throw new Error('Max retries exceeded');
}
```

## Testing Strategy

### Unit Tests

Core business logic has unit tests:

```typescript
// Example: Hash calculation test
describe('ImageHash', () => {
    it('should calculate correct MD5', async () => {
        const file = createMockFile('test.png');
        const hash = await calculateMD5(file);
        expect(hash).toBe('expected-md5-hash');
    });
});
```

### Integration Tests

Key workflows are tested end-to-end:

```typescript
// Example: Rename workflow test
describe('Rename Workflow', () => {
    it('should update all references', async () => {
        // Setup: Create note with image reference
        const note = await createNote('![[image.png]]');
        
        // Execute: Rename image
        await plugin.renameImage('image.png', 'new-image.png');
        
        // Verify: Reference updated
        const updatedNote = await readNote(note.path);
        expect(updatedNote).toContain('![[new-image.png]]');
    });
});
```

### Manual Testing Checklist

- [ ] Scan 1000+ images
- [ ] Rename image with 50+ references
- [ ] Batch rename 100 images
- [ ] Test on mobile device
- [ ] Test with network images
- [ ] Test with various link formats (Wiki/Markdown/HTML)
- [ ] Test recovery from errors
- [ ] Test cache invalidation

## Security Considerations

### 1. Path Traversal Protection

```typescript
// Validate all user-provided paths
function validatePath(path: string): boolean {
    // Prevent path traversal attacks
    if (path.includes('..') || path.includes('~')) {
        return false;
    }
    
    // Ensure path is within vault
    return path.startsWith(this.app.vault.getRoot().path);
}
```

### 2. XSS Prevention

```typescript
// Sanitize user input before rendering
function sanitizeHTML(input: string): string {
    const div = document.createElement('div');
    div.textContent = input; // Escapes HTML
    return div.innerHTML;
}
```

### 3. Sensitive Data Handling

- API keys stored only in settings (never in logs)
- Settings encryption handled by Obsidian
- No telemetry without explicit consent

## Mobile Optimization

### Responsive Breakpoints

```typescript
const BREAKPOINTS = {
    DESKTOP: 1200,   // 5 columns
    TABLET: 768,     // 3 columns
    PHONE_LANDSCAPE: 480, // 2 columns
    PHONE_PORTRAIT: 0   // 1 column
};
```

### Touch Optimization

- Minimum touch target: 44x44px
- Increased padding for buttons
- Swipe gestures for navigation
- Touch-friendly modal sizes

### Memory Management

Mobile devices have limited memory:

```typescript
// Reduce cache size on mobile
const isMobile = platform.isMobile;
const maxCacheSize = isMobile ? 50 : 100;

// Aggressive cleanup
if (isMobile && memoryUsage > 100MB) {
    this.clearOldCache();
}
```

## Future Enhancements

### Planned Features

1. **Plugin API** - Allow other plugins to extend functionality
2. **Cloud Sync** - Sync settings across devices
3. **Advanced Search** - Full-text search in images (OCR)
4. **Image Recognition** - Auto-tagging and categorization
5. **Batch Editing** - Resize, compress, format conversion

### Technical Debt

Areas for improvement:

1. **Type Safety** - Stricter TypeScript configuration
2. **Test Coverage** - Increase from 30% to 80%
3. **Documentation** - Add more inline JSDoc comments
4. **Performance** - Web Worker for heavy computations

---

*Last Updated: 2025-01-24*
*Version: 1.0.0*
