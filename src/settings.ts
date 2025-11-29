import { ImageManagerSettings } from './types';

/**
 * 图片管理设置接口
 * 扩展自 ImageManagerSettings，定义所有可配置的设置项
 */
export interface ImageManagementSettings extends ImageManagerSettings {
	// 此接口扩展自 ImageManagerSettings
}

/**
 * 默认设置对象
 * 包含所有设置项的默认值，用户可在设置面板中修改这些值
 */
export const DEFAULT_SETTINGS: ImageManagementSettings = {
	// ==================== 基础扫描设置 ====================
	/** 是否启用自动扫描 - 插件启动时自动扫描图片 */
	autoScan: true,
	/** 默认图片文件夹 - 优先扫描的文件夹路径 */
	defaultImageFolder: '',
	/** 是否包含子文件夹 - 扫描时是否递归扫描子目录 */
	includeSubfolders: true,

	// ==================== 显示设置 ====================
	/** 每行显示的图片数量 - 网格布局中每行的列数 */
	imagesPerRow: 5,
	/** 默认排序方式 - 'name'(名称) | 'size'(大小) | 'date'(日期) | 'modified'(修改时间) */
	defaultSortBy: 'name',
	/** 默认排序顺序 - 'asc'(升序) | 'desc'(降序) */
	defaultSortOrder: 'asc',
	/** 默认筛选类型 - 'all'(全部) | 'referenced'(已引用) | 'unreferenced'(未引用) */
	defaultFilterType: 'all',

	// ==================== 功能开关 ====================
	/** 是否启用去重功能 - 检测并标记重复的图片（基于 MD5 哈希） */
	enableDeduplication: true,
	/** 是否自动生成图片名称 - 根据路径和时间戳自动生成有意义的名称 */
	autoGenerateNames: true,
	/** 前往笔记时是否保持详情页打开 - 点击引用时的行为 */
	keepModalOpen: false,
	/** 是否显示引用时间 - 显示引用该图片的笔记的最后修改时间 */
	showReferenceTime: true,

	// ==================== 重命名设置 ====================
	/** 路径命名深度 - 自动命名时包含的路径级数（1-5） */
	pathNamingDepth: 3,
	/** 重名处理方式 - 批量重命名时遇到重名文件的处理策略
	 * 'prompt'(提示) | 'skip-silent'(静默跳过) | 'use-newest'(使用最新) | 'use-oldest'(使用最旧)
	 */
	duplicateNameHandling: 'prompt',
	/** 多笔记引用处理 - 图片被多个笔记引用时的处理方式
	 * 'first'(使用第一个) | 'latest'(使用最新修改) | 'prompt'(提示选择) | 'all'(全部重命名)
	 */
	multipleReferencesHandling: 'first',
	/** 是否保存批量重命名日志 - 记录每次批量操作的详细信息 */
	saveBatchRenameLog: true,

	// ==================== 文件锁定设置 ====================
	/** 忽略的文件列表 - 不参与重命名的文件（按行分隔） */
	ignoredFiles: '',
	/** 忽略的哈希值列表 - 基于 MD5 哈希锁定文件（按行分隔） */
	ignoredHashes: '',
	/** 在锁定列表中显示文件位置 - 显示被锁定文件的完整路径 */
	showIgnoredFilePath: true,
	/** 哈希值锁定的元数据 - 存储被锁定文件的名称和位置信息 */
	ignoredHashMetadata: {},

	// ==================== 图片详情页设置 ====================
	/** 鼠标滚轮默认模式 - 'scroll'(切换图片) | 'zoom'(缩放图片) */
	defaultWheelMode: 'zoom',
	/** 是否显示图片名称 - 在卡片下方显示文件名 */
	showImageName: true,
	/** 是否显示图片大小 - 显示文件大小（KB/MB） */
	showImageSize: true,
	/** 是否显示图片尺寸 - 显示图片的像素尺寸（宽x高） */
	showImageDimensions: true,
	/** 是否显示锁定图标 - 在被锁定的图片上显示锁定标记 */
	showLockIcon: true,
	/** 图片名称是否换行 - 长文件名的显示方式 */
	imageNameWrap: true,
	/** 自适应图片大小 - 类似 Notion 的自适应高度效果 */
	adaptiveImageSize: false,
	/** 纯净画廊模式 - 只显示图片，隐藏所有文字信息 */
	pureGallery: false,

	// ==================== 性能设置 ====================
	/** 是否启用懒加载 - 只加载可见区域的图片，提高性能 */
	enableLazyLoading: true,
	/** 懒加载延迟（毫秒） - 延迟多久后加载图片 */
	lazyLoadDelay: 200,
	/** 最大缓存图片数 - 内存中保留的最大缓存图片数量 */
	maxCacheSize: 100,

	// ==================== UI/主题设置 ====================
	/** 卡片圆角（像素） - 图片卡片的边框圆角大小 */
	cardBorderRadius: 6,
	/** 卡片间距（像素） - 相邻卡片之间的距离 */
	cardSpacing: 12,
	/** 固定图片高度（像素） - 卡片中图片的固定高度 */
	fixedImageHeight: 200,
	/** 是否启用悬停效果 - 鼠标悬停时的动画效果 */
	enableHoverEffect: true,
	/** 是否显示图片序号 - 在卡片上显示图片的索引号 */
	showImageIndex: false,
	/** 是否统一卡片高度 - 所有卡片保持相同高度 */
	uniformCardHeight: false,

	// ==================== 删除设置 ====================
	/** 删除前确认 - 删除图片时是否弹出确认对话框 */
	confirmBeforeDelete: true,
	/** 移到系统回收站 - 删除时同时移到系统回收站 */
	moveToSystemTrash: true,
	/** 启用插件回收站 - 在插件内部维护一个回收站 */
	enablePluginTrash: true,
	/** 恢复路径 - 从回收站恢复文件时的默认目标文件夹 */
	trashRestorePath: '恢复的图片',

	// ==================== 搜索设置 ====================
	/** 搜索是否区分大小写 - 搜索时的大小写敏感性 */
	searchCaseSensitive: false,
	/** 实时搜索延迟（毫秒） - 输入时的防抖延迟 */
	liveSearchDelay: 300,
	/** 搜索是否包含路径 - 是否在文件路径中搜索 */
	searchInPath: true,

	// ==================== 批量操作设置 ====================
	/** 批量操作最大数量 - 单次批量操作的最大文件数 */
	maxBatchOperations: 1000,
	/** 批量确认阈值 - 超过此数量时需要用户确认 */
	batchConfirmThreshold: 10,
	/** 是否显示批量操作进度 - 显示进度条和实时统计 */
	showBatchProgress: true,

	// ==================== 统计信息设置 ====================
	/** 是否显示统计信息 - 显示图片总数、大小等统计数据 */
	showStatistics: true,
	/** 统计信息位置 - 'top'(顶部) | 'bottom'(底部) | 'sidebar'(侧边栏) */
	statisticsPosition: 'top',

	// ==================== 日志设置 ====================
	/** 日志级别 - 'DEBUG'(调试) | 'INFO'(信息) | 'WARNING'(警告) | 'ERROR'(错误) */
	logLevel: 'INFO',
	/** 是否输出到控制台 - 将日志同时输出到浏览器控制台（生产环境建议关闭） */
	enableConsoleLog: false,
	/** 是否启用调试日志 - 记录详细的调试信息（生产环境建议关闭） */
	enableDebugLog: false,

	// ==================== 快捷键设置 ====================
	/** 快捷键自定义配置 - 存储用户自定义的快捷键映射
	 * 格式：{ 快捷键ID: 快捷键字符串 }
	 * 例如：{ 'open-image-manager': 'Ctrl+Shift+I' }
	 */
	keyboardShortcuts: {}
}
