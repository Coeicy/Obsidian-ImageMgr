# Technical Guide & Architecture

## Architecture Overview

Modular architecture designed for maintainability and performance.

```
┌─────────────────────────────────┐
│    ImageManagementPlugin         │
│    (Main Orchestrator)          │
└─────────────────────────────────┘
         │           │           │
         ▼           ▼           ▼
┌─────────┐    ┌─────────┐    ┌─────────┐
│  Core   │    │ Service │    │   UI    │
│Managers │    │ Utils   │    │ Views   │
└─────────┘    └─────────┘    └─────────┘
```

## Core Principles

### Separation of Concerns

Each module has single responsibility:
- `Logger` - Logging and audit trails
- `ReferenceManager` - Reference management
- `TrashManager` - Deleted file handling
- `LockListManager` - File protection

### Cache-First Strategy

Aggressive caching for performance:
- Reference cache
- Hash cache (MD5)
- Display text cache

### Batch Operations

Process operations in batches (10 files) to minimize I/O.

## Key Technical Features

### Reference Detection

Multi-pass parsing with syntax-aware filtering:
1. Remove code blocks and inline code
2. Line-by-line processing
3. Support for Wiki, Markdown, and HTML links

### MD5 Hash Caching

Three-level caching with modification time tracking:
- Cache hit: Instant return
- Cache miss: Recalculate and store
- LRU eviction (1000 entries max)

### File Locking

Three-factor authentication:
- MD5 content hash
- Exact filename
- Exact path

### Performance Optimizations

- Virtual scrolling for large lists
- Lazy image loading
- Debounced search (300ms)
- Memoized computations

## Error Handling

Centralized error handler with retry logic:
- User-friendly error messages
- Automatic retry for transient failures
- Detailed logging

## Security

- Path traversal protection
- XSS prevention
- Sensitive data handling

## Mobile Optimization

- Responsive breakpoints
- Touch-friendly interfaces
- Memory management for mobile devices

*Version: 1.0.0*
