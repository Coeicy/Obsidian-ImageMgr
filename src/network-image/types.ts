/**
 * 网络图片缓存与增量扫描系统 - 类型定义
 * 
 * @file 定义系统中使用的所有接口和类型
 * @version 1.0.0
 * @date 2025-01-25
 */

/**
 * 数据库对象存储（表）枚举
 */
export enum ObjectStore {
    IMAGES = 'network_images',      // 网络图片缓存
    FILES = 'scanned_files',         // 已扫描文件索引
    METADATA = 'metadata',           // 元数据信息
    BLACKLIST = 'blacklist'          // 失效 URL 黑名单
}

/**
 * 网络图片记录接口
 */
export interface NetworkImageRecord {
    /** 主键：URL 的 SHA-256 哈希 */
    id: string;
    
    /** 原始 URL */
    url: string;
    
    /** 来源文件路径 */
    sourceFilePath: string;
    
    /** 来源文件修改时间戳 */
    sourceFileMtime: number;
    
    /** 行号 */
    line: number;
    
    /** 列号 */
    column: number;
    
    /** 原始文本 */
    originalText: string;
    
    /** 图片状态 */
    status: 'active' | 'deleted' | 'broken' | 'pending';
    
    /** 最后验证时间 */
    lastValidated: number;
    
    /** 验证结果 */
    validationResult?: {
        /** HTTP 状态码 */
        statusCode: number;
        /** 内容类型 */
        contentType: string;
        /** 内容长度 */
        contentLength: number;
        /** 错误信息 */
        error?: string;
    };
    
    /** 缓存的元数据 */
    metadata?: {
        /** 图片宽度 */
        width?: number;
        /** 图片高度 */
        height?: number;
        /** 文件大小 */
        size?: number;
        /** 图片格式 */
        format?: string;
    };
    
    /** 创建时间 */
    createdAt: number;
    
    /** 最后更新时间 */
    updatedAt: number;
    
    /** 访问次数 */
    accessCount: number;
    
    /** 最后访问时间 */
    lastAccessed: number;
}

/**
 * 扫描文件记录接口
 */
export interface ScannedFileRecord {
    /** 主键：文件路径 */
    id: string;
    
    /** 文件名称 */
    fileName: string;
    
    /** 文件修改时间戳 */
    mtime: number;
    
    /** 文件大小 */
    size: number;
    
    /** 文件内容的 SHA-256 哈希 */
    contentHash: string;
    
    /** 包含的网络图片数量 */
    imageCount: number;
    
    /** 网络图片 URL 列表（ID 数组） */
    imageIds: string[];
    
    /** 最后扫描时间 */
    lastScanned: number;
    
    /** 扫描状态 */
    status: 'pending' | 'scanned' | 'modified' | 'deleted';
    
    /** 是否需要重新扫描 */
    needsRescan: boolean;
    
    /** 扫描耗时（毫秒） */
    scanDuration?: number;
    
    /** 扫描错误信息 */
    error?: string;
}

/**
 * 元数据记录接口
 */
export interface MetadataRecord {
    /** 主键：元数据键 */
    id: string;
    
    /** 元数据值 */
    value: any;
    
    /** 最后更新时间 */
    updatedAt: number;
}

/**
 * 系统元数据接口
 */
export interface SystemMetadata {
    /** 系统版本 */
    version: string;
    
    /** 最后完整扫描时间 */
    lastFullScan: number;
    
    /** 扫描文件总数 */
    totalFilesScanned: number;
    
    /** 网络图片总数 */
    totalImagesFound: number;
    
    /** 数据库大小（字节） */
    databaseSize: number;
    
    /** 缓存命中率 */
    cacheHitRate: number;
}

/**
 * 黑名单记录接口
 */
export interface BlacklistRecord {
    /** 主键：URL 的 SHA-256 哈希 */
    id: string;
    
    /** 原始 URL */
    url: string;
    
    /** 失效原因 */
    reason: 'timeout' | '404' | '403' | 'network_error' | 'invalid_content';
    
    /** 错误信息 */
    errorMessage: string;
	
	/**
	 * 最近一次检测到该失效链接时的来源信息
	 * 说明：
	 * - 为了避免过度放大存储，仅记录「最后一次」出现位置
	 * - 用于在空链接页面和网络错误列表中展示“该链接出现在哪个笔记的第几行”
	 */
	sourceFilePath?: string;
	
	/** 来源笔记的行号（0-based，显示时需 +1） */
	line?: number;
	
	/** 行内列位置/索引（可选，用于精确定位） */
	column?: number;
    
    /** 检测时间 */
    detectedAt: number;
    
    /** 重试次数 */
    retryCount: number;
    
    /** 最后重试时间 */
    lastRetry?: number;
    
    /** 是否自动移出黑名单 */
    autoRemove: boolean;
}

/**
 * 网络图片引用接口（扫描时的临时结构）
 */
export interface NetworkImageReference {
    /** 图片 URL */
    url: string;
    
    /** 行号 */
    line: number;
    
    /** 列号（索引） */
    index: number;
    
    /** 原始文本 */
    originalText: string;
}

/**
 * 增量扫描结果接口
 */
export interface IncrementalScanResult {
    /** 扫描的文件数量 */
    scannedFiles: number;
    
    /** 新发现的图片数量 */
    newImages: number;
    
    /** 更新的图片数量 */
    updatedImages: number;
    
    /** 缓存命中的图片数量 */
    cachedImages: number;
    
    /** 标记为删除的图片数量 */
    deletedImages: number;
    
    /** 图片总数 */
    totalImages: number;
    
    /** 扫描耗时（毫秒） */
    duration: number;
    
    /** 缓存命中率 */
    cacheHitRate: number;
    
    /** 错误列表 */
    errors: Array<{
        file: string;
        error: any;
    }>;
}

/**
 * 文件状态检查结果接口
 */
export interface FileStatusCheck {
    /** 执行的操作 */
    action: 'scan' | 'skip' | 'cleanup';
    
    /** 文件对象 */
    file: any;
    
    /** 缓存的图片数量 */
    cachedImageCount: number;
}

/**
 * 文件扫描结果接口
 */
export interface FileScanResult {
    /** 新发现的图片数量 */
    newImages: number;
    
    /** 更新的图片数量 */
    updatedImages: number;
}

/**
 * 验证结果接口
 */
export interface ValidationResult {
    /** 图片 ID */
    imageId?: string;
    
    /** 验证状态 */
    status: 'success' | 'error';
    
    /** HTTP 状态码 */
    statusCode?: number;
    
    /** 内容类型 */
    contentType?: string;
    
    /** 内容长度 */
    contentLength?: number;
    
    /** 是否有效 */
    isValid?: boolean;
    
    /** 验证结果详情 */
    validationResult?: any;
    
    /** 错误信息 */
    error?: string;
    
    /** 错误类型（用于黑名单分类） */
    errorType?: 'timeout' | '404' | '403' | 'network_error' | 'invalid_content';
}

/**
 * 缓存统计接口
 */
export interface CacheStats {
    /** 总图片数量 */
    totalImages: number;
    
    /** 总文件数量 */
    totalFiles: number;
    
    /** 黑名单数量 */
    totalBlacklist: number;
    
    /** 活跃图片数量 */
    activeImages: number;
    
    /** 失效图片数量 */
    brokenImages: number;
    
    /** 已删除图片数量 */
    deletedImages: number;
    
    /** 数据库大小（字节） */
    databaseSize: number;
    
    /** 最后清理时间 */
    lastCleanup: number;
    
    /** 缓存命中率 */
    cacheHitRate: number;
}

/**
 * 扫描选项接口
 */
export interface ScanOptions {
    /** 扫描路径 */
    path?: string;
    
    /** 是否启用增量扫描 */
    incremental?: boolean;
    
    /** 是否验证图片 */
    validateImages?: boolean;
    
    /** 最大并发数 */
    maxConcurrency?: number;
    
    /** 静默模式，不输出控制台日志 */
    quiet?: boolean;
}

/**
 * 搜索查询接口
 */
export interface SearchQuery {
    /** URL 关键词 */
    url?: string;
    
    /** 源文件路径关键词 */
    sourceFile?: string;
    
    /** 状态筛选 */
    status?: 'active' | 'deleted' | 'broken' | 'pending';
    
    /** 页码 */
    page?: number;
    
    /** 每页大小 */
    pageSize?: number;
}

/**
 * 搜索结果接口
 */
export interface SearchResult {
    /** 图片列表 */
    images: NetworkImageRecord[];
    
    /** 总数 */
    total: number;
    
    /** 页码 */
    page: number;
    
    /** 每页大小 */
    pageSize: number;
}

/**
 * 清理选项接口
 */
export interface CleanupOptions {
    /** 是否启用 LRU 清理 */
    lru?: boolean;
    
    /** 是否启用 TTL 清理 */
    ttl?: boolean;
    
    /** 是否清理孤立图片 */
    orphaned?: boolean;
    
    /** LRU 批量大小 */
    lruBatchSize?: number;
}

/**
 * 清理结果接口
 */
export interface CleanupResult {
    /** 删除的图片数量 */
    imagesRemoved: number;
    
    /** 删除的文件数量 */
    filesRemoved: number;
    
    /** 删除的黑名单数量 */
    blacklistRemoved: number;
    
    /** 释放的空间（字节） */
    spaceFreed: number;
}

/**
 * 错误类型枚举
 */
export enum ScanErrorType {
    NETWORK_ERROR = 'network_error',
    TIMEOUT_ERROR = 'timeout_error',
    VALIDATION_ERROR = 'validation_error',
    DATABASE_ERROR = 'database_error',
    FILE_READ_ERROR = 'file_read_error',
    UNKNOWN_ERROR = 'unknown_error'
}

/**
 * 扫描错误接口
 */
export interface ScanError {
    /** 错误类型 */
    type: ScanErrorType;
    
    /** 错误信息 */
    message: string;
    
    /** 文件路径 */
    file?: string;
    
    /** URL */
    url?: string;
    
    /** 堆栈跟踪 */
    stack?: string;
    
    /** 是否可重试 */
    retryable: boolean;
}

/**
 * 错误上下文接口
 */
export interface ErrorContext {
    /** 文件路径 */
    file?: string;
    
    /** URL */
    url?: string;
}

/**
 * 重试选项接口
 */
export interface RetryOptions {
    /** 最大重试次数 */
    maxRetries: number;
    
    /** 初始延迟（毫秒） */
    initialDelay: number;
    
    /** 最大延迟（毫秒） */
    maxDelay: number;
    
    /** 退避倍数 */
    backoffMultiplier: number;
}

/**
 * 系统监控指标接口
 */
export interface SystemMetrics {
    /** 扫描耗时 */
    scanDuration?: number;
    
    /** 缓存命中率 */
    cacheHitRate?: number;
    
    /** 验证成功率 */
    validationSuccessRate?: number;
    
    /** 数据库大小 */
    databaseSize?: number;
    
    /** 缓存大小 */
    cacheSize?: number;
    
    /** 内存使用 */
    memoryUsage?: number;
    
    /** 总图片数 */
    totalImages?: number;
    
    /** 总文件数 */
    totalFiles?: number;
    
    /** 每次扫描的新图片数 */
    newImagesPerScan?: number;
    
    /** 失效图片数 */
    brokenImages?: number;
    
    /** 错误数 */
    errorCount?: number;
    
    /** 错误率 */
    errorRate?: number;
    
    /** 主要错误 */
    topErrors?: Array<{type: string; count: number}>;
}

/**
 * 数据库配置接口
 */
export interface DatabaseConfig {
    /** 数据库名称 */
    dbName: string;
    
    /** 数据库版本 */
    dbVersion: number;
    
    /** 最大缓存大小 */
    maxCacheSize: number;
    
    /** 验证 TTL */
    validationTTL: number;
    
    /** 元数据 TTL */
    metadataTTL: number;
    
    /** 黑名单最大大小 */
    blacklistMaxSize: number;
    
    /** 黑名单 TTL */
    blacklistTTL: number;
    
    /** 批量大小 */
    batchSize: number;
    
    /** 验证批量大小 */
    validationBatchSize: number;
}

/**
 * 网络图片扫描器 API 接口
 */
export interface NetworkImageScannerAPI {
    /**
     * 增量扫描
     */
    scan(options?: ScanOptions): Promise<IncrementalScanResult>;
    
    /**
     * 完整扫描（强制重新扫描所有文件）
     */
    fullScan(path?: string): Promise<IncrementalScanResult>;
    
    /**
     * 快速扫描（仅检查修改的文件，不验证图片）
     */
    quickScan(path?: string): Promise<IncrementalScanResult>;
    
    /**
     * 验证图片有效性
     */
    validateImages(imageIds: string[]): Promise<ValidationResult[]>;
    
    /**
     * 获取单张图片
     */
    getImage(imageId: string): Promise<NetworkImageRecord | null>;
    
    /**
     * 搜索图片
     */
    searchImages(query: SearchQuery): Promise<SearchResult>;
    
    /**
     * 清理缓存
     */
    cleanup(options?: CleanupOptions): Promise<CleanupResult>;
    
    /**
     * 执行完整清理
     */
    fullCleanup(): Promise<CleanupResult>;
    
    /**
     * 获取缓存统计
     */
    getStats(): Promise<CacheStats>;
    
    /**
     * 更新图片访问统计
     */
    updateImageAccess(imageId: string): Promise<void>;
}
