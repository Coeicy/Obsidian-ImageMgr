/**
 * 图片信息接口
 * 
 * 代表一张图片的基本信息，包括路径、尺寸、哈希值等
 * 用于在插件内部存储和管理图片元数据
 */
export interface ImageInfo {
	/** 图片的完整路径（相对于 vault 根目录） */
	path: string;
	/** 图片的文件名（不包含路径） */
	name: string;
	/** 图片文件大小（字节） */
	size: number;
	/** 图片宽度（像素，可选） */
	width?: number;
	/** 图片高度（像素，可选） */
	height?: number;
	/** 图片修改时间戳（毫秒） */
	modified: number;
	/** 文件修改时间戳（毫秒，可选，用于缓存验证） */
	mtime?: number;
	/** MD5 哈希值（可选，用于去重和追踪） */
	md5?: string;
	/** 分组名称（可选，用于自定义分组） */
	group?: string;
}

/**
 * 图片变更历史接口
 * 
 * 记录对图片的各种操作（重命名、移动、删除、引用等）
 * 用于日志系统和操作追踪
 */
export interface ImageChangeHistory {
	/** 操作发生的时间戳（毫秒） */
	timestamp: number;
	/** 操作类型
	 * - 'rename': 文件重命名
	 * - 'move': 文件移动
	 * - 'delete': 文件删除
	 * - 'reference': 引用变更
	 */
	action: 'rename' | 'move' | 'delete' | 'reference';
	/** 重命名前的文件名（rename 操作时使用） */
	fromName?: string;
	/** 重命名后的文件名（rename 操作时使用） */
	toName?: string;
	/** 移动前的路径（move 操作时使用） */
	fromPath?: string;
	/** 移动后的路径（move 操作时使用） */
	toPath?: string;
	/** 引用该图片的文件路径（reference 操作时使用） */
	referencePath?: string;
	/** 引用所在的行号（reference 操作时使用） */
	lineNumber?: number;
	/** Wiki 链接中的旧显示文本（reference 操作时使用） */
	oldDisplayText?: string;
	/** Wiki 链接中的新显示文本（reference 操作时使用） */
	newDisplayText?: string;
}

/**
 * 插件持久化数据结构
 * 
 * 存储插件的所有持久化数据，包括日志、历史记录、分组、缓存等
 * 这些数据会被保存到 Obsidian 的插件数据文件中
 */
export interface PluginData {
	/** 操作日志条目数组
	 * 包含所有记录的操作日志（重命名、删除、引用等）
	 */
	logs?: any[];
	
	/** 图片变更历史记录
	 * 结构：{ 图片路径: [变更记录数组] }
	 * 用于追踪每张图片的操作历史
	 */
	histories?: { [path: string]: ImageChangeHistory[] };
	
	/** 图片分组信息
	 * 结构：{ 分组名称: [图片路径数组] }
	 * 用于自定义分组功能
	 */
	imageGroups?: { [groupName: string]: string[] };
	
	/** 分组元数据
	 * 存储分组的详细信息（创建时间、描述、颜色等）
	 */
	groupMeta?: {
		[groupName: string]: {
			/** 分组创建时间戳 */
			createdAt?: number;
			/** 分组描述 */
			description?: string;
			/** 分组颜色（用于 UI 显示） */
			color?: string;
			/** 分组是否折叠（UI 状态） */
			collapsed?: boolean;
			/** 分组类型（自定义、系统等） */
			type?: string;
		};
	};
	
	/** 自定义分组名称列表
	 * 用户创建的所有自定义分组的名称
	 */
	customGroupNames?: string[];
	
	/** 插件设置备份
	 * 保存当前的设置配置，用于恢复和迁移
	 */
	settings?: Partial<ImageManagerSettings>;
	
	/** 数据版本号
	 * 用于数据迁移和兼容性检查
	 */
	version?: number;
	
	/** 图片哈希值缓存
	 * 结构：{ 图片路径: { hash: MD5值, mtime: 修改时间, size: 文件大小 } }
	 * 用于快速去重和缓存验证
	 */
	imageHashCache?: { [path: string]: { hash: string; mtime: number; size: number } };
	
	/** 哈希值缓存（别名）
	 * 与 imageHashCache 相同，用于兼容性
	 */
	hashCache?: { [path: string]: { hash: string; mtime: number; size: number } };
	
	/** 图片列表缓存
	 * 扫描到的所有图片信息数组
	 */
	images?: any[];
}

export interface ImageManagerSettings {
	autoScan: boolean;
	defaultImageFolder: string;
	includeSubfolders: boolean;
	imagesPerRow: number; // 每行显示的图片数量
	defaultSortBy: 'name' | 'size' | 'date' | 'dimensions'; // 默认排序方式
	defaultSortOrder: 'asc' | 'desc'; // 默认排序顺序
	defaultFilterType: 'all' | 'png' | 'jpg' | 'gif' | 'webp' | 'svg' | 'bmp'; // 默认筛选类型
	enableDeduplication: boolean; // 启用MD5去重
	autoGenerateNames: boolean; // 自动生成文件名
	keepModalOpen: boolean; // 前往笔记时是否保持详情页打开
	showReferenceTime: boolean; // 是否显示引用时间
	pathNamingDepth: number; // 路径命名深度（1-5级）
	duplicateNameHandling: 'prompt' | 'skip-silent' | 'use-newest' | 'use-oldest'; // 重名处理方式：提示并跳过、安静跳过、使用最新、使用最旧
	multipleReferencesHandling: 'first' | 'latest' | 'prompt' | 'all'; // 多笔记引用处理：使用第一个、使用最新修改、提示选择、全部重命名
	saveBatchRenameLog: boolean; // 保存批量命名日志
	ignoredFiles: string; // 忽略的文件列表（按行分隔）
	ignoredHashes: string; // 忽略的哈希值列表（按行分隔）
	showIgnoredFilePath?: boolean; // 在锁定列表中显示文件位置信息
	ignoredHashMetadata?: Record<string, { fileName: string; filePath: string; addedTime: number }>; // 哈希值锁定的元数据（文件名和位置）
	defaultWheelMode: 'scroll' | 'zoom'; // 鼠标滚轮默认模式：scroll-切换图片、zoom-缩放图片
	showImageName: boolean; // 显示图片名称
	showImageSize: boolean; // 显示图片大小
	showImageDimensions: boolean; // 显示图片尺寸
	showLockIcon: boolean; // 显示锁定图标
	imageNameWrap: boolean; // 图片名称是否换行
	adaptiveImageSize: boolean; // 自适应图片大小（类似 Notion 效果）
	pureGallery: boolean; // 纯净画廊模式（只显示图片，隐藏所有信息）
	
	// 性能设置
	enableLazyLoading: boolean; // 启用懒加载
	lazyLoadDelay: number; // 懒加载延迟（毫秒）
	maxCacheSize: number; // 最大缓存数量
	
	// UI/主题设置
	cardBorderRadius: number; // 卡片圆角大小（像素）
	cardSpacing: number; // 卡片间距（像素）
	fixedImageHeight: number; // 固定图片高度（像素，当不使用自适应时）
	enableHoverEffect: boolean; // 启用悬停效果
	showImageIndex: boolean; // 显示图片序号
	uniformCardHeight: boolean; // 统一卡片高度（同一行的卡片高度一致）
	
	// 删除设置
	confirmBeforeDelete: boolean; // 删除前确认
	moveToSystemTrash: boolean; // 移到系统回收站（否则永久删除）
	enablePluginTrash: boolean; // 启用插件回收站（移动到 .trash 文件夹）
	trashRestorePath: string; // 恢复路径（空字符串表示根目录，否则使用指定路径）
	
	// 搜索设置
	searchCaseSensitive: boolean; // 搜索大小写敏感
	liveSearchDelay: number; // 实时搜索延迟（毫秒）
	searchInPath: boolean; // 搜索时包含路径
	
	// 批量操作设置
	maxBatchOperations: number; // 批量操作最大数量限制
	batchConfirmThreshold: number; // 批量操作确认阈值（超过此数量需要确认）
	showBatchProgress: boolean; // 显示批量操作进度
	
	// 统计信息
	showStatistics: boolean; // 显示统计信息面板
	statisticsPosition: 'top' | 'bottom'; // 统计信息位置
	
	// 日志设置
	logLevel?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'; // 日志级别
	enableConsoleLog?: boolean; // 是否输出到控制台
	enableDebugLog?: boolean; // 是否启用DEBUG日志
	
	// 快捷键设置
	keyboardShortcuts?: Record<string, string>; // 快捷键自定义配置（key: 快捷键ID, value: 快捷键字符串）
}

