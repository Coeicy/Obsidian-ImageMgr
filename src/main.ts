import { Plugin, TFile, debounce, TFolder, Notice } from 'obsidian';
import { ImageManagementSettings, DEFAULT_SETTINGS } from './settings';
import { ImageManagementSettingTab } from './ui/settings-tab';
import { ImageManagerView, IMAGE_MANAGER_VIEW_TYPE } from './ui/image-manager-view';
import { NetworkImageModal } from './ui/network-image-modal';
import { Logger, LogLevel, OperationType } from './utils/logger';
import { ErrorHandler } from './utils/error-handler';
import { PluginData } from './types';
import { ReferenceManager, parseWikiLink, parseHtmlImageSize } from './utils/reference-manager';
import { TrashManager } from './utils/trash-manager';
import { LockListManager } from './utils/lock-list-manager';
import { HistoryManager } from './utils/history-manager';

// ==================== 网络图片缓存系统导入 ====================
import {
    FileCacheAdapter,
    NetworkImageScannerAPI,
    NetworkImageCacheManager,
    ScanErrorHandler
} from './network-image';
import { NetworkImageScanner } from './utils/network-image-scanner';

/**
 * ImageManagement 插件主类
 * 
 * 核心职责：
 * - 插件生命周期管理（加载、卸载）
 * - 视图和命令注册
 * - 事件监听和处理
 * - 核心管理器初始化
 * - 缓存管理和数据持久化
 * 
 * 初始化流程（onload）：
 * 1. 加载持久化数据和设置
 * 2. 初始化核心管理器：
 *    - Logger: 日志记录
 *    - ErrorHandler: 错误处理
 *    - ReferenceManager: 引用管理
 *    - TrashManager: 回收站
 *    - HistoryManager: 历史记录
 *    - LockListManager: 锁定列表
 * 3. 初始化网络图片系统：
 *    - FileCacheAdapter: 插件文件夹缓存
 *    - NetworkImageScannerAPI: 扫描API（含黑名单管理）
 *    - NetworkImageCacheManager: 缓存管理
 *    - NetworkImageScanner: 扫描器
 * 4. 注册视图（IMAGE_MANAGER_VIEW_TYPE）
 * 5. 注册命令（各种快捷命令）
 * 6. 注册事件监听器：
 *    - metadataCache.on('changed'): 监听元数据变化
 *    - vault.on('create'): 监听文件创建
 *    - vault.on('rename'): 监听文件重命名
 *    - vault.on('delete'): 监听文件删除
 *    - workspace.on('file-menu'): 添加右键菜单
 * 7. 延迟初始化（提升启动速度）
 * 8. 标记初始化完成
 * 
 * 核心管理器说明：
 * 
 * **Logger（日志管理器）**：
 * - 多级别日志（DEBUG、INFO、WARNING、ERROR）
 * - 按操作类型分类
 * - 日志持久化和查询
 * - 错误聚合和去重
 * - 控制台输出控制
 * 
 * **ErrorHandler（错误处理器）**：
 * - 统一错误处理
 * - 用户友好的错误提示
 * - 自动重试逻辑
 * - 详细错误日志
 * 
 * **ReferenceManager（引用管理器）**：
 * - 查找图片引用
 * - 更新引用（重命名后）
 * - 支持多种链接格式
 * - 引用缓存优化
 * 
 * **TrashManager（回收站管理器）**：
 * - 文件删除到回收站
 * - 从回收站恢复
 * - 清空回收站
 * - 回收站元数据管理
 * 
 * **HistoryManager（历史记录管理器）**：
 * - 记录操作历史
 * - 历史查询和恢复
 * - 操作统计和分析
 * 
 * **LockListManager（锁定列表管理器）**：
 * - 文件锁定管理
 * - MD5哈希验证
 * - 三要素验证（MD5、文件名、路径）
 * 
 * **NetworkImageScannerAPI（网络图片扫描API）**：
 * - 网络图片扫描
 * - 增量扫描算法
 * - 图片验证
 * - 黑名单管理（统一使用 IndexedDB 存储 URL 与域名）
 * - 缓存清理
 * 
 * 缓存机制：
 * 
 * **displayTextCache**：
 * - 用途：缓存Wiki链接的显示文本
 * - 结构：Map<filePath, Map<lineNumber, displayText>>
 * - 优势：避免重复解析，提升查询速度
 * 
 * **fullLineCache**：
 * - 用途：缓存笔记中的完整行内容
 * - 结构：Map<filePath, Map<lineNumber, fullLine>>
 * - 优势：快速定位引用，避免重复读取文件
 * 
 * **referenceCache**：
 * - 用途：缓存图片引用关系
 * - 结构：Map<imagePath, Set<referencingFilePaths>>
 * - 优势：快速查询哪些笔记引用了某张图片
 * - 延迟初始化：启动5秒后初始化，提升启动速度
 * 
 * **recentlyRenamedImages**：
 * - 用途：追踪最近重命名的图片
 * - 结构：Map<imagePath, { timestamp, referencedFiles }>
 * - 优势：智能处理重命名后的引用更新
 * 
 * **deletedFiles**：
 * - 用途：临时存储被删除的文件
 * - 结构：Map<imagePath, { file, content }>
 * - 优势：支持撤销删除操作
 * 
 * 延迟初始化策略：
 * 
 * **引用缓存延迟（5秒）**：
 * - 原因：避免启动时扫描所有文件
 * - 效果：提升启动速度2-3倍
 * - 实现：setTimeout延迟初始化
 * 
 * **初始化标记延迟（3秒）**：
 * - 原因：避免启动扫描时产生大量日志
 * - 效果：减少日志噪音，提升性能
 * - 实现：setTimeout设置isInitializing = false
 * 
 * 事件监听器：
 * 
 * **metadataCache.on('changed')**：
 * - 监听：元数据变化
 * - 处理：检测显示文本变化和引用变化
 * - 优化：仅更新变化的部分，避免全量刷新
 * 
 * **vault.on('create')**：
 * - 监听：文件创建
 * - 处理：检测新图片，自动扫描
 * - 优化：延迟扫描，避免频繁触发
 * 
 * **vault.on('rename')**：
 * - 监听：文件重命名
 * - 处理：更新引用关系，记录历史
 * - 优化：使用ReferenceManager批量更新
 * 
 * **vault.on('delete')**：
 * - 监听：文件删除
 * - 处理：移动到回收站，清理引用
 * - 优化：异步操作，不阻塞主线程
 * 
 * **workspace.on('file-menu')**：
 * - 监听：右键菜单
 * - 处理：添加自定义菜单项
 * - 菜单项：打开详情页、批量操作等
 * 
 * 使用示例：
 * ```typescript
 * // 插件自动初始化，无需手动调用
 * // Obsidian会调用onload()和onunload()
 * 
 * // 访问核心管理器
 * const plugin = app.plugins.plugins['imagemgr'];
 * 
 * // 使用日志管理器
 * await plugin.logger.info(OperationType.SCAN, '开始扫描');
 * 
 * // 使用引用管理器
 * const references = await plugin.referenceManager.findImageReferences(
 *     'images/photo.png',
 *     'photo.png'
 * );
 * 
 * // 使用回收站管理器
 * await plugin.trashManager.moveToTrash(file);
 * 
 * // 访问缓存
 * const cachedText = plugin.displayTextCache.get(filePath)?.get(lineNumber);
 * 
 * // 检查初始化状态
 * if (plugin.isInitializing) {
 *     console.log('插件正在初始化...');
 * }
 * ```
 * 
 * 错误处理：
 * - 初始化失败：记录错误，但不阻止插件加载
 * - 管理器初始化失败：降级处理，其他功能继续可用
 * - 事件监听器错误：捕获并记录，不影响其他监听器
 * - 数据加载失败：使用默认值，记录警告
 * 
 * 性能优化：
 * - 延迟初始化：提升启动速度
 * - 缓存机制：减少重复计算和IO操作
 * - 防抖和节流：优化频繁操作
 * - 批量处理：减少操作次数
 * - 异步操作：不阻塞主线程
 * 
 * 安全机制：
 * - 路径验证：防止路径遍历
 * - 类型检查：防止类型错误
 * - 错误边界：捕获异常，防止崩溃
 * - 数据验证：导入导出前验证数据
 * 
 * 最佳实践：
 * 1. 核心功能通过管理器实现，不在主类中直接实现
 * 2. 初始化顺序要合理，避免依赖问题
 * 3. 使用缓存提升性能
 * 4. 错误处理要完善，不丢失错误信息
 * 5. 延迟非关键初始化，提升启动速度
 * 6. 事件监听器要轻量，避免阻塞
 * 7. 清理资源时按反序初始化
 * 
 * 注意事项：
 * - 插件实例是单例
 * - 初始化完成后才能使用所有功能
 * - 缓存需要定期清理
 * - 事件监听器要正确注册和取消注册
 * - 卸载时要清理所有资源
 */
export default class ImageManagementPlugin extends Plugin {
	// ==================== 核心管理器 ====================
	/** 插件设置对象 */
	settings!: ImageManagementSettings;
	/** 日志管理器 - 负责记录所有操作日志 */
	logger!: Logger;
	/** 错误处理器 - 统一处理和记录错误 */
	errorHandler!: ErrorHandler;
	/** 插件数据存储 - 包含扫描的图片列表、缓存等 */
	data: PluginData = {};
	/** 引用管理器 - 查找和管理图片的引用关系 */
	referenceManager!: ReferenceManager;
	/** 回收站管理器 - 管理已删除的文件 */
	trashManager!: TrashManager;
	/** 历史记录管理器 - 管理图片修改历史 */
	historyManager!: HistoryManager;
	/** 锁定列表管理器 - 管理和监控锁定文件列表 */
	lockListManager!: LockListManager;

// ==================== 网络图片缓存系统 ====================
/** 网络图片缓存适配器（插件文件夹存储） */
networkImageCacheAdapter: FileCacheAdapter | null = null;
/** 网络图片缓存 API */
networkImageAPI!: NetworkImageScannerAPI;
/** 网络图片缓存管理器 */
networkImageCacheManager!: NetworkImageCacheManager;
/** 网络图片错误处理器 */
networkImageErrorHandler!: ScanErrorHandler;
/** 网络图片扫描器 */
networkImageScanner!: NetworkImageScanner;

	// ==================== 缓存机制 ====================
	/** 显示文本缓存：filePath -> lineNumber -> displayText
	 * 用于快速查询 Wiki 链接中的显示文本，避免重复解析
	 */
	private displayTextCache: Map<string, Map<number, string>> = new Map();
	
	/** 完整行内容缓存：filePath -> lineNumber -> fullLine
	 * 缓存笔记中的完整行内容，用于快速定位引用
	 */
	private fullLineCache: Map<string, Map<number, string>> = new Map();
	
	/** 临时存储被删除的文件，用于撤销操作
	 * imagePath -> { file: TFile, content: ArrayBuffer }
	 */
	private deletedFiles: Map<string, { file: TFile; content: ArrayBuffer }> = new Map();
	
	/** 引用关系缓存：imagePath -> Set<referencingFilePaths>
	 * 快速查询哪些笔记引用了某张图片
	 */
	private referenceCache: Map<string, Set<string>> = new Map();
	
	/** 引用缓存是否已初始化标志
	 * 初始化后才能使用引用缓存功能
	 */
	private referenceCacheInitialized: boolean = false;
	
	/** 最近重命名的图片记录：imagePath -> { timestamp, referencedFiles }
	 * 用于追踪最近的重命名操作和相关的引用文件
	 */
	private recentlyRenamedImages: Map<string, { timestamp: number; referencedFiles: string[] }> = new Map();
	
	/** 插件初始化状态标志
	 * 初始化期间不记录日志，避免启动时产生大量日志
	 */
	private isInitializing: boolean = true;
	
	/** 延迟保存数据的防抖函数 */
	private debouncedSaveData = debounce(async () => {
		await this.saveData(this.data);
	}, 2000, true);

	/**
	 * 插件加载生命周期方法 - 核心初始化流程
	 * 
	 * 执行流程：
	 * 1. 加载持久化数据和设置 (loadData → loadSettings)
	 * 2. 初始化核心管理器（日志、错误处理、引用、回收站、锁定列表）
	 * 3. 注册视图、命令和事件监听器
	 * 4. 延迟初始化缓存和标记初始化完成
	 * 
	 * 延迟初始化说明：
	 * - 引用缓存延迟5秒：避免启动时扫描所有文件，提升启动速度
	 * - 初始化标记延迟3秒：避免在启动扫描时记录大量日志
	 * 
	 * 事件监听器注册：
	 * - metadataCache.on('changed'): 检测显示文本变化和引用变化
	 * - vault.on('create'): 检测新图片文件创建
	 * - vault.on('rename'): 检测图片文件重命名
	 * - vault.on('delete'): 检测图片文件删除
	 * - workspace.on('file-menu'): 添加右键菜单项
	 * 
	 * 错误处理：
	 * - 使用 try-catch 包裹整个初始化过程
	 * - 初始化失败时通过 ErrorHandler 记录错误
	 * - 即使部分初始化失败，插件仍可继续使用
	 * 
	 * @returns {Promise<void>}
	 * 
	 * @example
	 * ```typescript
	 * // 插件自动调用，无需手动调用
	 * await plugin.onload();
	 * ```
	 */
	async onload() {
		try {
			// 加载插件数据（包含设置和数据）
			const loadedData = await this.loadData() || {};
			await this.loadSettings(loadedData);
			// 从加载的数据中提取插件数据（排除设置）
			this.data = { ...loadedData };
			// 如果 loadedData 中有 settings，需要排除它（因为 settings 已经单独存储）
			if ('settings' in this.data) {
				delete (this.data as any).settings;
			}
			
			// 初始化日志管理器 - 用于记录所有操作日志
			this.logger = new Logger(this);
			
			// 初始化错误处理器 - 统一处理和记录错误
			this.errorHandler = new ErrorHandler(this);
			
			// 初始化引用管理器 - 查找和管理图片的引用关系
			this.referenceManager = new ReferenceManager(this.app, this);
			
			// 初始化回收站管理器 - 管理已删除的文件
			this.trashManager = new TrashManager(this.app, this);
			
		// 初始化回收站预加载（在设置加载后）- 提升回收站打开速度
		this.trashManager.initializePreload();
		
	// 初始化锁定列表管理器 - 管理和监控锁定文件列表
	this.lockListManager = new LockListManager(this);
	await this.lockListManager.initialize();
	
	// 初始化网络图片缓存系统（仅在启用扫描网络图片时）
	if (this.settings.scanRemoteImages) {
		await this.initializeNetworkImageCache();
	} else {
		if (this.logger) {
			await this.logger.info(OperationType.PLUGIN_OPERATION, 'Network image scanning is disabled, skipping cache system initialization');
		}
	}
		
		// 延迟初始化引用缓存，避免在启动时扫描所有文件
			// 5秒后初始化，让插件先完成核心启动流程
			setTimeout(() => {
				this.initializeReferenceCache();
			}, 5000);
			
			// 标记插件初始化完成（3秒后，避免在启动扫描时记录大量日志）
			setTimeout(() => {
				this.isInitializing = false;
			}, 3000);
			
			// 记录插件加载成功日志
			await this.logger.info(OperationType.PLUGIN_LOAD, '插件加载成功', {
				details: { version: this.manifest.version }
			});

		// 注册图片管理视图
		this.registerView(
			IMAGE_MANAGER_VIEW_TYPE,
			(leaf) => new ImageManagerView(leaf, this)
		);

		// 添加快捷命令打开图片管理视图
		this.addCommand({
			id: 'open-image-manager',
			name: '打开图片管理',
			callback: () => {
				this.activateView();
			}
		});

		// 添加扫描网络图片命令（仅在启用网络图片扫描时显示）
		this.addCommand({
			id: 'scan-network-images',
			name: '扫描网络图片',
			callback: () => {
				// 检查是否启用网络图片扫描
				if (!this.settings.scanRemoteImages) {
					new Notice('❌ 网络图片扫描功能未启用\n请在设置中开启"扫描网络图片"选项');
					return;
				}
				new NetworkImageModal(this.app, this).open();
			}
		});

		// 添加完整扫描网络图片命令
		this.addCommand({
			id: 'full-scan-network-images',
			name: '完整扫描网络图片',
			callback: () => {
				// 检查是否启用网络图片扫描
				if (!this.settings.scanRemoteImages) {
					new Notice('❌ 网络图片扫描功能未启用\n请在设置中开启"扫描网络图片"选项');
					return;
				}
				// 执行完整扫描
				this.performFullNetworkImageScan();
			}
		});

		// 添加清理网络图片缓存命令
		this.addCommand({
			id: 'cleanup-network-image-cache',
			name: '清理网络图片缓存',
			callback: () => {
				// 检查是否启用网络图片扫描
				if (!this.settings.scanRemoteImages) {
					new Notice('❌ 网络图片扫描功能未启用\n请在设置中开启"扫描网络图片"选项');
					return;
				}
				// 执行缓存清理
				this.cleanupNetworkImageCache();
			}
		});

		// 添加网络图片缓存统计命令
		this.addCommand({
			id: 'network-image-cache-stats',
			name: '网络图片缓存统计',
			callback: async () => {
				// 检查是否启用网络图片扫描
				if (!this.settings.scanRemoteImages) {
					new Notice('❌ 网络图片扫描功能未启用\n请在设置中开启"扫描网络图片"选项');
					return;
				}
				// 获取并显示统计
				const stats = await this.getNetworkImageCacheStats();
				if (stats) {
					const message = `缓存统计\n` +
						`总图片数: ${stats.totalImages}\n` +
						`活跃图片: ${stats.activeImages}\n` +
						`失效图片: ${stats.brokenImages}\n` +
						`缓存命中率: ${stats.cacheHitRate.toFixed(2)}%\n` +
						`数据库大小: ${(stats.databaseSize / 1024 / 1024).toFixed(2)} MB`;
					new Notice(message, 5000);
				} else {
					new Notice('无法获取缓存统计', 3000);
				}
			}
		});

		// 添加侧边栏图标
		this.addRibbonIcon('images', '图片管理', async () => {
			await this.activateView();
		});

			// 添加设置标签页
			this.addSettingTab(new ImageManagementSettingTab(this.app, this));
			
			// 注册文件修改监听器，检测显示文本变化
			// 使用防抖（debounce）避免频繁扫描文件，延迟 2 秒执行
			this.registerEvent(
				this.app.metadataCache.on('changed', debounce(async (file, data, cache) => {
					// 确保 file 有效且有 name 属性
					if (file && file.name) {
						await this.detectDisplayTextChanges(file);
					}
				}, 2000, false))
			);

			// 注册文件创建监听器，检测图片文件导入/添加
			this.registerEvent(
				this.app.vault.on('create', async (file) => {
					// 确保 file 有效且有 name 属性
					if (file instanceof TFile && file.name) {
						await this.detectImageCreate(file);
						
						// 如果是 Markdown 文件且启用了网络图片扫描，自动更新缓存
						if (file.extension === 'md' && this.settings.scanRemoteImages && this.networkImageAPI) {
							try {
								// 延迟扫描，避免在文件创建时立即扫描（文件可能还未完全写入）
								setTimeout(async () => {
									// 自动扫描时使用静默模式，不输出控制台日志
									await this.networkImageAPI.scan({
										path: file.path,
										incremental: true,
										validateImages: false,
										quiet: true // 静默模式，不输出控制台日志
									});
								}, 1000);
							} catch (error) {
								// 静默失败，不影响主流程
								if (this.logger) {
									await this.logger.warn(OperationType.SCAN, `Failed to auto-scan network images for new file: ${file.path}`, { error });
								}
							}
						}
					}
				})
			);

			// 注册文件重命名监听器，检测图片文件重命名
			this.registerEvent(
				this.app.vault.on('rename', async (file, oldPath) => {
					// 确保 file 有效且有 name 属性
					if (file instanceof TFile && file.name) {
						await this.detectImageRename(file, oldPath);
						
						// 如果是 Markdown 文件且启用了网络图片扫描，更新缓存中的文件路径
						if (file.extension === 'md' && this.settings.scanRemoteImages && this.networkImageAPI) {
							try {
								// 更新缓存中的文件路径
								await this.updateNetworkImageCachePath(oldPath, file.path);
							} catch (error) {
								// 静默失败，不影响主流程
								if (this.logger) {
									await this.logger.warn(OperationType.SCAN, `Failed to update network image cache path: ${oldPath} -> ${file.path}`, { error });
								}
							}
						}
					}
				})
			);

			// 注册文件删除监听器，检测图片文件删除
			this.registerEvent(
				this.app.vault.on('delete', async (file) => {
					// 确保 file 有效且有 name 属性
					if (file instanceof TFile && file.name) {
						await this.handleFileDelete(file);
						
						// 如果是 Markdown 文件且启用了网络图片扫描，清理缓存
						if (file.extension === 'md' && this.settings.scanRemoteImages && this.networkImageAPI) {
							try {
								// 标记该文件的网络图片为删除状态
								await this.markNetworkImagesAsDeleted(file.path);
							} catch (error) {
								// 静默失败，不影响主流程
								if (this.logger) {
									await this.logger.warn(OperationType.SCAN, `Failed to mark network images as deleted: ${file.path}`, { error });
								}
							}
						}
					}
				})
			);

			// 注册文件菜单事件（右键菜单）
			this.registerEvent(
				this.app.workspace.on('file-menu', (menu, file) => {
					// 只在文件夹或 Markdown 文件上显示
					const isFolder = file instanceof TFolder;
					const isMarkdown = file instanceof TFile && file.extension === 'md';

					if (isFolder || isMarkdown) {
						menu.addItem((item) => {
							item
								.setTitle('扫描网络图片')
								.setIcon('search')
								.onClick(() => {
									// 检查是否启用网络图片扫描
									if (!this.settings.scanRemoteImages) {
										new Notice('❌ 网络图片扫描功能未启用\n请在设置中开启"扫描网络图片"选项');
										return;
									}
									new NetworkImageModal(this.app, this).open();
								});
						});
					}
				})
			);

			// 注册metadataCache变化监听器，检测引用/取消引用
			this.registerEvent(
				this.app.metadataCache.on('changed', async (file, data, cache) => {
					// 确保 file 有效且有 name 属性
					if (file && file.name) {
						await this.detectReferenceChanges(file, cache);
						
						// 如果是 Markdown 文件且启用了网络图片扫描，自动更新缓存
						if (file instanceof TFile && file.extension === 'md' && 
							this.settings.scanRemoteImages && this.networkImageAPI) {
							try {
								// 延迟扫描，避免频繁触发
								setTimeout(async () => {
									// 自动扫描时使用静默模式，不输出控制台日志
									await this.networkImageAPI.scan({
										path: file.path,
										incremental: true,
										validateImages: false,
										quiet: true // 静默模式，不输出控制台日志
									});
								}, 2000);
							} catch (error) {
								// 静默失败，不影响主流程
								if (this.logger) {
									await this.logger.warn(OperationType.SCAN, `Failed to auto-scan network images for changed file: ${file.path}`, { error });
								}
							}
						}
					}
				})
			);
		} catch (error) {
			// 即使初始化失败，也尝试记录错误
			if (this.errorHandler) {
				await this.errorHandler.handle(
					error as Error,
					OperationType.PLUGIN_ERROR,
					'插件加载失败'
				);
			} else if (this.logger) {
				await this.logger.error(OperationType.PLUGIN_ERROR, '插件加载失败', {
					error: error as Error
				});
			} else {
				// 如果日志系统都未初始化，使用控制台输出（仅作为最后手段）
				console.error('[ImageMgr] 插件加载失败:', error);
			}
		}
	}

	// ==================== 网络图片缓存系统方法 ====================
	
	/**
	 * 初始化网络图片缓存系统
	 * 注意：此方法应在确认 scanRemoteImages 为 true 时调用
	 * 公开方法，允许从设置页面调用
	 */
	async initializeNetworkImageCache(): Promise<void> {
		// 双重检查：如果设置已禁用，不初始化
		if (!this.settings.scanRemoteImages) {
			if (this.logger) {
				await this.logger.info(OperationType.PLUGIN_OPERATION, 'Network image scanning is disabled, skipping cache system initialization');
			}
			return;
		}
		
		try {
			if (this.logger) {
				await this.logger.info(OperationType.PLUGIN_OPERATION, 'Initializing network image cache system...');
			}
			
			// 1. 创建基于插件文件夹的缓存适配器
			this.networkImageCacheAdapter = new FileCacheAdapter(
				this.app.vault.adapter,
				this.app.vault.configDir
			);
			
			// 2. 初始化缓存（从插件目录加载/创建）
			const db = await this.networkImageCacheAdapter.init();
			if (this.logger) {
				await this.logger.info(OperationType.PLUGIN_OPERATION, 'Network image database initialized successfully');
			}
		
		// 3. 创建网络图片扫描器
		this.networkImageScanner = new NetworkImageScanner(
			this.app,
			async (msg, error) => {
				if (this.logger) {
					await this.logger.error(OperationType.SCAN, msg, { error });
				}
			}
		);
		
		// 4. 创建错误处理器
		this.networkImageErrorHandler = new ScanErrorHandler(200, true);
		if (this.logger) {
			// 仅记录到插件日志，不在控制台刷屏
			await this.logger.info(
				OperationType.PLUGIN_OPERATION,
				`网络图片错误记录功能已启用（最多保留最近 ${this.networkImageErrorHandler.getMaxErrorLogSize()} 条错误记录用于排查）`
			);
		}
		
		// 5. 创建缓存管理器
		this.networkImageCacheManager = new NetworkImageCacheManager(db);
		
		// 6. 创建 API 实例
		this.networkImageAPI = new NetworkImageScannerAPI(
			this.app,
			db,
			this.networkImageScanner,
			this.networkImageErrorHandler
		);
		
		if (this.logger) {
			await this.logger.info(OperationType.PLUGIN_OPERATION, 'Network image cache system initialized successfully');
		}
		} catch (error) {
			if (this.logger) {
				await this.logger.error(OperationType.PLUGIN_OPERATION, 'Failed to initialize network image cache system', { error });
			}
			
			// 初始化失败时，回退到不使用缓存的模式
			this.networkImageAPI = null as any;
			this.networkImageCacheAdapter = null;
		}
	}

	/**
	 * 扫描网络图片（使用缓存系统）
	 */
	async scanNetworkImages(path?: string, options?: { quiet?: boolean }): Promise<any[]> {
		// 检查是否启用网络图片扫描
		if (!this.settings.scanRemoteImages) {
			new Notice('❌ 网络图片扫描功能未启用\n请在设置中开启"扫描网络图片"选项');
			return [];
		}

		// 检查缓存系统是否可用
		if (!this.networkImageAPI) {
			if (this.logger) {
				await this.logger.warn(OperationType.SCAN, 'Network image cache system not available, using legacy scanner');
			}
			return await this.scanNetworkImagesLegacy(path);
		}

			try {
				// 显示进度提示（仅非静默模式）
				const notice = new Notice('正在扫描网络图片...', 0);
				
				// 执行增量扫描（支持静默模式）
				const quiet = options?.quiet || false;
				const result = await this.networkImageAPI.scan({
					path,
					incremental: true,
					validateImages: false,
					quiet: quiet
				});
				
				// 更新通知
				notice.hide();
				
				// 仅非静默模式显示通知
				if (!quiet) {
					const message = `扫描完成！\n` +
					              `共发现 ${result.totalImages} 张图片\n` +
					              `新增: ${result.newImages} 张\n` +
					              `更新: ${result.updatedImages} 张\n` +
					              `缓存: ${result.cachedImages} 张\n` +
					              `耗时: ${(result.duration / 1000).toFixed(2)} 秒\n` +
					              `缓存命中率: ${result.cacheHitRate.toFixed(1)}%`;
					
					new Notice(message, 5000);
				}
				
		// 记录性能指标（仅非静默模式）
		if (this.logger && !quiet) {
			await this.logger.info(OperationType.SCAN, `Network image scan completed: ${JSON.stringify(result)}`);
		}
		
		// 获取扫描的图片数据
		const images = await this.getNetworkImagesFromCache(path);
		
		return images;
	} catch (error) {
		if (this.logger) {
			await this.logger.error(OperationType.SCAN, 'Network image scan failed', { error });
		}
		new Notice(`网络图片扫描失败: ${error.message}`, 5000);
		
		// 回退到旧版扫描器
		return await this.scanNetworkImagesLegacy(path);
	}
}

/**
 * 从缓存获取网络图片数据
 */
private async getNetworkImagesFromCache(path?: string): Promise<any[]> {
	try {
		// 搜索活跃的网络图片
		const searchResult = await this.networkImageAPI.searchImages({
			status: 'active',
			page: 1,
			pageSize: 10000
		});
		
		// 转换格式以适配现有代码
		return searchResult.images.map(img => ({
			url: img.url,
			sourceFile: this.app.vault.getAbstractFileByPath(img.sourceFilePath),
			line: img.line,
			originalText: img.originalText,
			index: img.column,
			length: img.originalText.length
		}));
	} catch (error) {
		if (this.logger) {
			await this.logger.error(OperationType.SCAN, 'Failed to get images from cache', { error });
		}
		return [];
	}
}

/**
 * 旧版网络图片扫描（不使用缓存）
 */
private async scanNetworkImagesLegacy(path?: string): Promise<any[]> {
	const scanner = new NetworkImageScanner(this.app, async (msg, error) => {
		if (this.logger) {
			await this.logger.error(OperationType.SCAN, msg, { error });
		}
	});
	return await scanner.scanAll(path);
}

	/**
	 * 执行完整扫描（用于定期维护）
	 */
	async performFullNetworkImageScan(): Promise<void> {
		if (!this.settings.scanRemoteImages || !this.networkImageAPI) {
			return;
		}

		try {
			if (this.logger) {
				await this.logger.info(OperationType.SCAN, 'Performing full network image scan...');
			}
			
			const result = await this.networkImageAPI.fullScan();
			
			if (this.logger) {
				await this.logger.info(OperationType.SCAN, `Full scan completed: ${JSON.stringify(result)}`);
			}
			
			// 显示通知
			if (result.totalImages > 0) {
				new Notice(`网络图片完整扫描完成！\n共处理 ${result.totalImages} 张图片`, 3000);
			}
		} catch (error) {
			if (this.logger) {
				await this.logger.error(OperationType.SCAN, 'Full network image scan failed', { error });
			}
		}
	}

	/**
	 * 清理网络图片缓存
	 */
	async cleanupNetworkImageCache(): Promise<void> {
		if (!this.networkImageAPI) {
			return;
		}

		try {
			if (this.logger) {
				await this.logger.info(OperationType.PLUGIN_OPERATION, 'Cleaning up network image cache...');
			}
			
			const result = await this.networkImageAPI.fullCleanup();
			
			if (this.logger) {
				await this.logger.info(OperationType.PLUGIN_OPERATION, `Cache cleanup completed: ${JSON.stringify(result)}`);
			}
			
			new Notice(`缓存清理完成！\n移除 ${result.imagesRemoved} 张图片\n释放 ${(result.spaceFreed / 1024 / 1024).toFixed(2)} MB 空间`, 3000);
		} catch (error) {
			if (this.logger) {
				await this.logger.error(OperationType.PLUGIN_OPERATION, 'Cache cleanup failed', { error });
			}
			new Notice('缓存清理失败', 3000);
		}
	}

	/**
	 * 清空网络图片缓存（完全删除所有缓存数据，需重新扫描）
	 */
	async clearNetworkImageCache(): Promise<void> {
		if (!this.networkImageCacheAdapter) {
			new Notice('缓存未初始化，无需清空', 3000);
			return;
		}
		try {
			await this.networkImageCacheAdapter.clearAll();
			if (this.logger) {
				await this.logger.info(OperationType.PLUGIN_OPERATION, 'Network image cache cleared');
			}
			new Notice('✅ 网络图片缓存已清空，下次扫描将重新建立', 3000);
		} catch (error) {
			if (this.logger) {
				await this.logger.error(OperationType.PLUGIN_OPERATION, 'Failed to clear network image cache', { error });
			}
			new Notice('清空缓存失败', 3000);
		}
	}

	/**
	 * 获取网络图片缓存统计
	 */
	async getNetworkImageCacheStats(): Promise<any> {
		if (!this.networkImageAPI) {
			return null;
		}

		try {
			const stats = await this.networkImageAPI.getStats();
			
			return {
				totalImages: stats.totalImages,
				activeImages: stats.activeImages,
				brokenImages: stats.brokenImages,
				cacheHitRate: stats.cacheHitRate,
				databaseSize: stats.databaseSize
			};
		} catch (error) {
			if (this.logger) {
				await this.logger.error(OperationType.PLUGIN_OPERATION, 'Failed to get cache stats', { error });
			}
			return null;
		}
	}

	/**
	 * 更新网络图片缓存中的文件路径（文件重命名时调用）
	 * @param oldPath - 旧文件路径
	 * @param newPath - 新文件路径
	 */
	private async updateNetworkImageCachePath(oldPath: string, newPath: string): Promise<void> {
		if (!this.networkImageAPI || !this.networkImageCacheAdapter) {
			return;
		}

		try {
			const db = this.networkImageCacheAdapter.getDB();
			const tx = db.transaction(['network_images', 'scanned_files'], 'readwrite');
			const imageStore = tx.objectStore('network_images');
			const fileStore = tx.objectStore('scanned_files');
			const imageIndex = imageStore.index('by-source-file');
			const fileIndex = fileStore.index('by-mtime');

			// 更新图片记录中的文件路径
			const images = await new Promise<any[]>((resolve, reject) => {
				const request = imageIndex.getAll(oldPath);
				request.onsuccess = () => resolve(request.result || []);
				request.onerror = () => reject(request.error);
			});

			for (const image of images) {
				image.sourceFilePath = newPath;
				image.updatedAt = Date.now();
				await new Promise<void>((resolve, reject) => {
					const request = imageStore.put(image);
					request.onsuccess = () => resolve();
					request.onerror = () => reject(request.error);
				});
			}

			// 更新文件记录
			const fileRecord = await new Promise<any>((resolve, reject) => {
				const request = fileStore.get(oldPath);
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});

			if (fileRecord) {
				// 删除旧记录
				await new Promise<void>((resolve, reject) => {
					const request = fileStore.delete(oldPath);
					request.onsuccess = () => resolve();
					request.onerror = () => reject(request.error);
				});

				// 创建新记录
				fileRecord.id = newPath;
				fileRecord.lastScanned = Date.now();
				await new Promise<void>((resolve, reject) => {
					const request = fileStore.put(fileRecord);
					request.onsuccess = () => resolve();
					request.onerror = () => reject(request.error);
				});
			}

			if (this.logger && images.length > 0) {
				await this.logger.info(OperationType.PLUGIN_OPERATION, `Updated ${images.length} network image cache records: ${oldPath} -> ${newPath}`);
			}
		} catch (error) {
			if (this.logger) {
				await this.logger.warn(OperationType.PLUGIN_OPERATION, `Failed to update network image cache path: ${oldPath} -> ${newPath}`, { error });
			}
		}
	}

	/**
	 * 标记网络图片为删除状态（文件删除时调用）
	 * @param filePath - 已删除的文件路径
	 */
	private async markNetworkImagesAsDeleted(filePath: string): Promise<void> {
		if (!this.networkImageAPI || !this.networkImageCacheAdapter) {
			return;
		}

		try {
			const db = this.networkImageCacheAdapter.getDB();
			const tx = db.transaction(['network_images', 'scanned_files'], 'readwrite');
			const imageStore = tx.objectStore('network_images');
			const fileStore = tx.objectStore('scanned_files');
			const imageIndex = imageStore.index('by-source-file');

			// 获取该文件的所有图片
			const images = await new Promise<any[]>((resolve, reject) => {
				const request = imageIndex.getAll(filePath);
				request.onsuccess = () => resolve(request.result || []);
				request.onerror = () => reject(request.error);
			});

			// 标记图片为删除状态
			for (const image of images) {
				image.status = 'deleted';
				image.updatedAt = Date.now();
				await new Promise<void>((resolve, reject) => {
					const request = imageStore.put(image);
					request.onsuccess = () => resolve();
					request.onerror = () => reject(request.error);
				});
			}

			// 标记文件记录为删除状态
			const fileRecord = await new Promise<any>((resolve, reject) => {
				const request = fileStore.get(filePath);
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});

			if (fileRecord) {
				fileRecord.status = 'deleted';
				fileRecord.lastScanned = Date.now();
				await new Promise<void>((resolve, reject) => {
					const request = fileStore.put(fileRecord);
					request.onsuccess = () => resolve();
					request.onerror = () => reject(request.error);
				});
			}

			if (this.logger && images.length > 0) {
				await this.logger.info(OperationType.PLUGIN_OPERATION, `Marked ${images.length} network images as deleted: ${filePath}`);
			}
		} catch (error) {
			if (this.logger) {
				await this.logger.warn(OperationType.PLUGIN_OPERATION, `Failed to mark network images as deleted: ${filePath}`, { error });
			}
		}
	}

	// ==================== 生命周期方法 ====================

	onunload() {
		// 清理视图
		this.app.workspace.detachLeavesOfType(IMAGE_MANAGER_VIEW_TYPE);
		
		// 关闭网络图片缓存并刷盘
		if (this.networkImageCacheAdapter) {
			this.networkImageCacheAdapter.close().catch(() => {});
			if (this.logger) {
				this.logger.info(OperationType.PLUGIN_OPERATION, 'Network image cache closed');
			}
		}
		
		// 清理 ReferenceManager 的事件监听器
		if (this.referenceManager) {
			this.referenceManager.cleanup();
		}
		
		// 清理 LockListManager 的资源
		if (this.lockListManager) {
			this.lockListManager.cleanup();
		}
		
		// 清理 TrashManager 的缓存
		if (this.trashManager) {
			this.trashManager.invalidateCache();
		}
		
		// 记录插件卸载日志
		if (this.logger) {
			this.logger.info(OperationType.PLUGIN_UNLOAD, '插件已卸载');
		}
	}

	async activateView() {
		const { workspace } = this.app;

		// 查找是否已经有该视图打开
		let leaf = workspace.getLeavesOfType(IMAGE_MANAGER_VIEW_TYPE)[0];

		if (!leaf) {
			// 如果没有打开，则在主工作区创建新标签页
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: IMAGE_MANAGER_VIEW_TYPE, active: true });
		}

		// 显示该标签页
		workspace.revealLeaf(leaf);
	}

	async loadSettings(loadedData?: any) {
		// 如果没有传入数据，从存储加载
		if (!loadedData) {
			loadedData = await this.loadData();
		}
		
		// 合并默认设置和已保存的设置
		// Obsidian 的 loadData() 可能返回 settings 对象，或者包含 settings 属性的对象
		// 如果 loadedData 是对象且包含 settings 属性，使用它；否则直接使用 loadedData
		let savedSettings: any = null;
		
		if (loadedData && typeof loadedData === 'object') {
			// 检查是否是设置对象（有 imagesPerRow 等设置属性，但没有数据属性）
			const hasSettingsProps = 'imagesPerRow' in loadedData || 'autoScan' in loadedData;
			const hasDataProps = 'logs' in loadedData || 'histories' in loadedData || 'imageGroups' in loadedData;
			
			if (hasSettingsProps && !hasDataProps) {
				// 纯设置对象
				savedSettings = loadedData;
			} else if (hasSettingsProps && hasDataProps) {
				// 混合对象，提取设置部分
				savedSettings = {};
				// 提取所有设置属性（包括锁定列表相关属性）
				const settingsKeys = ['imagesPerRow', 'autoScan', 'defaultImageFolder', 'includeSubfolders', 
					'defaultSortBy', 'defaultSortOrder', 'defaultFilterType', 'enableDeduplication', 
					'enableDuplicateDetection', 'enableBrokenLinksDetection', 'brokenLinksNewItemPosition',
					'autoGenerateNames', 'keepModalOpen', 'pathNamingDepth',
					'duplicateNameHandling', 'multipleReferencesHandling', 'saveBatchRenameLog', 
					'defaultWheelMode', 'showImageName', 'showImageSize', 
					'showImageDimensions', 'showLockIcon', 'imageNameWrap', 'adaptiveImageSize',
					'lazyLoadDelay', 'maxCacheSize', 'cardBorderRadius',
					'cardSpacing', 'fixedImageHeight', 'enableHoverEffect', 'showImageIndex',
					'confirmBeforeDelete', 'moveToSystemTrash', 'enablePluginTrash', 'trashRestorePath',
					'logLevel', 'enableConsoleLog', 'enableDebugLog', 'keyboardShortcuts',
					'ignoredFiles', 'ignoredHashes', 'ignoredHashMetadata', 'showIgnoredFilePath',
					'pureGallery', 'uniformCardHeight', 'searchCaseSensitive', 'liveSearchDelay',
					'searchInPath', 'maxBatchOperations', 'batchConfirmThreshold', 'showBatchProgress',
					'showStatistics', 'statisticsPosition',
					'scanRemoteImages', 'remoteImageProxy', 'showRemoteImageBadge', 'remoteImageTimeout', 'autoRetryRemoteImage'];
				
				for (const key of settingsKeys) {
					if (key in loadedData) {
						savedSettings[key] = loadedData[key];
					}
				}
			} else if ('settings' in loadedData) {
				savedSettings = (loadedData as any).settings;
			}
		}
		
		this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings || {});
		
		// 迁移旧的恢复位置设置到新的恢复路径设置
		if ('trashRestoreLocation' in this.settings || 'trashRestoreCustomPath' in this.settings) {
			const oldLocation = (this.settings as any).trashRestoreLocation;
			const oldCustomPath = (this.settings as any).trashRestoreCustomPath;
			
			if (oldLocation === 'custom' && oldCustomPath) {
				// 迁移自定义路径
				this.settings.trashRestorePath = oldCustomPath;
			} else if (oldLocation === 'root') {
				// 迁移根目录设置（空字符串）
				this.settings.trashRestorePath = '';
			} else {
				// 原始位置或其他情况，默认使用根目录
				this.settings.trashRestorePath = '';
			}
			
			// 删除旧字段
			delete (this.settings as any).trashRestoreLocation;
			delete (this.settings as any).trashRestoreCustomPath;
			
			// 保存迁移后的设置
			await this.saveSettings();
		}
		
		// 确保 imagesPerRow 是有效数字
		if (typeof this.settings.imagesPerRow !== 'number' || this.settings.imagesPerRow < 1 || this.settings.imagesPerRow > 10) {
			this.settings.imagesPerRow = DEFAULT_SETTINGS.imagesPerRow;
		}
	}

	async saveSettings() {
		// 保存设置时，需要合并现有的数据，避免覆盖
		const currentData = await this.loadData() || {};
		
		// 判断 currentData 是设置对象还是数据对象
		const isSettingsObject = currentData && typeof currentData === 'object' && 
			('imagesPerRow' in currentData || 'autoScan' in currentData) &&
			!('logs' in currentData) && !('histories' in currentData) && !('imageGroups' in currentData);
		
		if (isSettingsObject) {
			// currentData 本身就是设置对象，直接替换
			await super.saveData(this.settings);
		} else {
			// currentData 是数据对象，需要合并设置
			const mergedData = { ...currentData, ...this.settings };
			await super.saveData(mergedData);
		}
	}

	/**
	 * 保存插件数据（统一方法，确保不会覆盖设置）
	 */
	async saveData(data: any): Promise<void> {
		// 加载当前所有数据（包括设置）
		const currentData = await this.loadData() || {};
		
		// 判断 currentData 是设置对象还是数据对象
		const isSettingsObject = currentData && typeof currentData === 'object' && 
			('imagesPerRow' in currentData || 'autoScan' in currentData) &&
			!('logs' in currentData) && !('histories' in currentData) && !('imageGroups' in currentData);
		
		// 从 data 中排除设置相关的属性，避免覆盖设置
		// 注意：ignoredFiles, ignoredHashes, ignoredHashMetadata 是锁定列表数据，需要通过 saveSettings 保存
		let dataWithoutSettings: any = {};
		if (data && typeof data === 'object') {
			// 排除所有设置属性（不包括锁定列表，因为它们通过 saveSettings 单独管理）
			const settingsKeys = ['imagesPerRow', 'autoScan', 'defaultImageFolder', 'includeSubfolders', 
				'defaultSortBy', 'defaultSortOrder', 'defaultFilterType', 'enableDeduplication', 
				'enableDuplicateDetection', 'enableBrokenLinksDetection', 'brokenLinksNewItemPosition',
				'autoGenerateNames', 'keepModalOpen', 'pathNamingDepth',
				'duplicateNameHandling', 'multipleReferencesHandling', 'saveBatchRenameLog', 
				'defaultWheelMode', 'showImageName', 'showImageSize', 
				'showImageDimensions', 'showLockIcon', 'imageNameWrap', 'adaptiveImageSize',
				'lazyLoadDelay', 'maxCacheSize', 'cardBorderRadius',
				'cardSpacing', 'fixedImageHeight', 'enableHoverEffect', 'showImageIndex',
				'confirmBeforeDelete', 'moveToSystemTrash', 'enablePluginTrash', 'trashRestorePath',
				'logLevel', 'enableConsoleLog', 'enableDebugLog', 'keyboardShortcuts',
				'ignoredFiles', 'ignoredHashes', 'ignoredHashMetadata', 'showIgnoredFilePath',
				'pureGallery', 'uniformCardHeight', 'searchCaseSensitive', 'liveSearchDelay',
				'searchInPath', 'maxBatchOperations', 'batchConfirmThreshold', 'showBatchProgress',
				'showStatistics', 'statisticsPosition'];
			
			for (const key in data) {
				if (!settingsKeys.includes(key)) {
					dataWithoutSettings[key] = data[key];
				}
			}
		} else {
			dataWithoutSettings = data;
		}
		
		if (isSettingsObject) {
			// 当前存储的是设置对象，需要合并数据（但不覆盖设置）
			const merged = { ...this.settings, ...dataWithoutSettings };
			await super.saveData(merged);
		} else {
			// 当前存储的是数据对象，合并设置和数据（设置优先）
			// 顺序：currentData（数据部分） -> this.settings（设置，优先） -> dataWithoutSettings（新数据）
			const merged = { ...currentData, ...dataWithoutSettings, ...this.settings };
			await super.saveData(merged);
		}
	}

	/**
	 * 更新显示文本缓存（用于插件内部保存时同步缓存，避免文件监听器重复记录）
	 */
	updateDisplayTextCache(filePath: string, lineNumber: number, displayText: string, fullLine: string) {
		// 获取该文件的缓存
		let fileCache = this.displayTextCache.get(filePath);
		if (!fileCache) {
			fileCache = new Map();
			this.displayTextCache.set(filePath, fileCache);
		}

		// 获取该文件的完整行内容缓存
		let fileLineCache = this.fullLineCache.get(filePath);
		if (!fileLineCache) {
			fileLineCache = new Map();
			this.fullLineCache.set(filePath, fileLineCache);
		}

		// 更新缓存（行号是 0-based，传入的是 1-based）
		const lineIndex = lineNumber - 1;
		fileCache.set(lineIndex, displayText);
		fileLineCache.set(lineIndex, fullLine);
	}

	/**
	 * 检测文件中的图片引用显示文本变化
	 */
	private async detectDisplayTextChanges(file: TFile) {
		// 如果插件正在初始化，不检测变化
		if (this.isInitializing) {
			return;
		}
		
		// 只处理 Markdown 文件
		if (!file || file.extension !== 'md') {
			return;
		}

		try {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) {
				return;
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');

			// 获取该文件的缓存
			let fileCache = this.displayTextCache.get(file.path);
			if (!fileCache) {
				fileCache = new Map();
				this.displayTextCache.set(file.path, fileCache);
			}

			// 获取该文件的完整行内容缓存
			let fileLineCache = this.fullLineCache.get(file.path);
			if (!fileLineCache) {
				fileLineCache = new Map();
				this.fullLineCache.set(file.path, fileLineCache);
			}

			// 检查 embeds（图片嵌入）
			if (cache.embeds) {
				for (const embed of cache.embeds) {
					const lineIndex = embed.position.start.line;
					const fullLine = lines[lineIndex] || '';

					// 检查是否在代码块内
					if (await this.referenceManager.isInCodeBlock(file, lineIndex, fullLine, lines)) {
						continue;
					}

					// 提取显示文本（支持 Wiki、Markdown、HTML 格式）
					// 注意：Wiki 格式中，| 后面可能是显示文本或尺寸，需要使用 parseWikiLink 解析
					let displayText = '';
					const wikiMatch = fullLine.match(/!\[\[([^\]]+)\]\]/);
					const markdownMatch = fullLine.match(/!\[([^\]]*)\]\(([^)]+)\)/);
					const htmlMatch = fullLine.match(/<img[^>]+alt\s*=\s*["']([^"']*)["']/i);

					if (wikiMatch) {
						const parsed = parseWikiLink(wikiMatch[0]);
						displayText = parsed.displayText || '';
					} else if (markdownMatch) {
						displayText = markdownMatch[1] || '';
					} else if (htmlMatch) {
						displayText = htmlMatch[1] || '';
					}

					// 获取之前的显示文本和旧行内容
					const oldDisplayText = fileCache.get(lineIndex);
					const oldFullLine = fileLineCache.get(lineIndex) || fullLine; // 如果没有旧行，使用当前行

					// 检测显示文本或尺寸变化（对于 Wiki 格式，检查整行内容是否变化）
					const displayTextChanged = oldDisplayText !== undefined && oldDisplayText !== displayText && oldDisplayText !== '';
					
					// 对于 Wiki 和 HTML 格式，检查整行内容是否变化（可能只修改了尺寸）
					let sizeChanged = false;
					const htmlMatchInLine = fullLine.match(/<img[^>]+>/i);
					if (wikiMatch && oldFullLine !== fullLine) {
						// 解析旧行和新行的尺寸（Wiki 格式）
						const oldParsed = parseWikiLink(oldFullLine.match(/!\[\[([^\]]+)\]\]/)?.[0] || '');
						const newParsed = parseWikiLink(wikiMatch[0]);
						sizeChanged = (oldParsed.width !== newParsed.width) || (oldParsed.height !== newParsed.height);
					} else if (htmlMatchInLine && oldFullLine !== fullLine) {
						// 解析旧行和新行的尺寸（HTML 格式）
						const oldHtmlMatchInLine = oldFullLine.match(/<img[^>]+>/i);
						if (oldHtmlMatchInLine) {
							const oldSize = parseHtmlImageSize(oldHtmlMatchInLine[0]);
							const newSize = parseHtmlImageSize(htmlMatchInLine[0]);
							sizeChanged = (oldSize.width !== newSize.width) || (oldSize.height !== newSize.height);
						}
					}
					
					// 如果显示文本或尺寸发生变化，且之前有缓存值（避免初始化时误判），记录日志
					// 注意：如果 oldDisplayText 和 displayText 相同，说明可能是插件内部保存后的刷新，不需要记录
					if (displayTextChanged || (sizeChanged && oldDisplayText !== undefined)) {
						// 解析图片路径
						const imagePath = this.referenceManager.resolveLinkPath(embed.link, file.path);
						if (imagePath) {
							// 获取图片信息
							const imageFile = this.app.vault.getAbstractFileByPath(imagePath) as TFile;
							// 检查是否是图片文件
							if (imageFile && imageFile.extension) {
								const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
								if (imageExtensions.includes(imageFile.extension.toLowerCase())) {
									// 如果显示文本没有变化，使用旧的显示文本（可能为空）
									const effectiveOldDisplayText = displayTextChanged ? (oldDisplayText || '') : displayText;
									const effectiveNewDisplayText = displayTextChanged ? displayText : (oldDisplayText || '');
									
									await this.logDisplayTextChange(
										imageFile.path,
										imageFile.name,
										file.path,
										lineIndex + 1,
										effectiveOldDisplayText,
										effectiveNewDisplayText,
										oldFullLine, // 传入旧的行内容
										fullLine // 传入新的行内容
									);
								}
							}
						}
					}

					// 更新缓存
					fileCache.set(lineIndex, displayText);
					fileLineCache.set(lineIndex, fullLine); // 保存当前行内容
				}
			}

			// 检查 links（普通链接，包括不带!的图片引用）
			if (cache.links) {
				for (const link of cache.links) {
					const lineIndex = link.position.start.line;
					const fullLine = lines[lineIndex] || '';

					// 检查是否在代码块内
					if (await this.referenceManager.isInCodeBlock(file, lineIndex, fullLine, lines)) {
						continue;
					}

					// 检查是否是图片引用（包括 Wiki、Markdown、HTML 格式）
					const isImageReference = fullLine.match(/!?\[\[.*\]\]|!\[.*\]\(.*\)|<img[^>]+>/i);
					if (isImageReference) {
						// 提取显示文本（支持 Wiki、Markdown、HTML 格式）
						// 注意：Wiki 格式中，| 后面可能是显示文本或尺寸，需要使用 parseWikiLink 解析
						let displayText = '';
						const wikiWithExclamMatch = fullLine.match(/!\[\[([^\]]+)\]\]/);
						const wikiNoExclamMatch = fullLine.match(/(?:^|[^!])\[\[([^\]]+)\]\]/);
						const markdownMatch = fullLine.match(/!\[([^\]]*)\]\(([^)]+)\)/);
						const htmlMatch = fullLine.match(/<img[^>]+alt\s*=\s*["']([^"']*)["']/i);

						if (wikiWithExclamMatch) {
							const parsed = parseWikiLink(wikiWithExclamMatch[0]);
							displayText = parsed.displayText || '';
						} else if (wikiNoExclamMatch) {
							const beforeMatch = fullLine.substring(0, wikiNoExclamMatch.index || 0);
							if (!beforeMatch.endsWith('!')) {
								const parsed = parseWikiLink(wikiNoExclamMatch[0]);
								displayText = parsed.displayText || '';
							}
						} else if (markdownMatch) {
							displayText = markdownMatch[1] || '';
						} else if (htmlMatch) {
							displayText = htmlMatch[1] || '';
						}

						// 获取之前的显示文本和旧行内容
						const oldDisplayText = fileCache.get(lineIndex);
						const oldFullLine = fileLineCache.get(lineIndex) || fullLine; // 如果没有旧行，使用当前行

						// 检测显示文本或尺寸变化（对于 Wiki 格式，检查整行内容是否变化）
						const displayTextChanged = oldDisplayText !== undefined && oldDisplayText !== displayText && oldDisplayText !== '';
						
						// 对于 Wiki 和 HTML 格式，检查整行内容是否变化（可能只修改了尺寸）
						let sizeChanged = false;
						const htmlMatchInLine = fullLine.match(/<img[^>]+>/i);
						if ((wikiWithExclamMatch || wikiNoExclamMatch) && oldFullLine !== fullLine) {
							// 解析旧行和新行的尺寸（Wiki 格式）
							const oldWikiMatch = oldFullLine.match(/!?\[\[([^\]]+)\]\]/);
							const newWikiMatch = wikiWithExclamMatch || wikiNoExclamMatch;
							if (oldWikiMatch && newWikiMatch) {
								const oldParsed = parseWikiLink(oldWikiMatch[0]);
								const newParsed = parseWikiLink(newWikiMatch[0]);
								sizeChanged = (oldParsed.width !== newParsed.width) || (oldParsed.height !== newParsed.height);
							}
						} else if (htmlMatchInLine && oldFullLine !== fullLine) {
							// 解析旧行和新行的尺寸（HTML 格式）
							const oldHtmlMatchInLine = oldFullLine.match(/<img[^>]+>/i);
							if (oldHtmlMatchInLine) {
								const oldSize = parseHtmlImageSize(oldHtmlMatchInLine[0]);
								const newSize = parseHtmlImageSize(htmlMatchInLine[0]);
								sizeChanged = (oldSize.width !== newSize.width) || (oldSize.height !== newSize.height);
							}
						}
						
						// 如果显示文本或尺寸发生变化，且之前有缓存值（避免初始化时误判），记录日志
						// 注意：如果 oldDisplayText 和 displayText 相同，说明可能是插件内部保存后的刷新，不需要记录
						if (displayTextChanged || (sizeChanged && oldDisplayText !== undefined)) {
							// 解析图片路径
							const imagePath = this.referenceManager.resolveLinkPath(link.link, file.path);
							if (imagePath) {
								// 获取图片信息
								const imageFile = this.app.vault.getAbstractFileByPath(imagePath) as TFile;
								// 检查是否是图片文件
								if (imageFile && imageFile.extension) {
									const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
									if (imageExtensions.includes(imageFile.extension.toLowerCase())) {
										// 如果显示文本没有变化，使用旧的显示文本（可能为空）
										const effectiveOldDisplayText = displayTextChanged ? (oldDisplayText || '') : displayText;
										const effectiveNewDisplayText = displayTextChanged ? displayText : (oldDisplayText || '');
										
										await this.logDisplayTextChange(
											imageFile.path,
											imageFile.name,
											file.path,
											lineIndex + 1,
											effectiveOldDisplayText,
											effectiveNewDisplayText,
											oldFullLine, // 传入旧的行内容
											fullLine // 传入新的行内容
										);
									}
								}
							}
						}

						// 更新缓存
						fileCache.set(lineIndex, displayText);
						fileLineCache.set(lineIndex, fullLine); // 保存当前行内容
					}
				}
			}

			// 清理不再存在的行的缓存
			for (const [lineIndex] of fileCache) {
				if (lineIndex >= lines.length) {
					fileCache.delete(lineIndex);
					fileLineCache.delete(lineIndex);
				}
			}
		} catch (error) {
			if (this.logger) {
				await this.logger.error(OperationType.PLUGIN_ERROR, '检测显示文本变化失败', {
					error: error as Error
				});
			}
		}
	}

	/**
	 * 获取图片的 MD5 哈希值
	 */
	private async getImageHash(imagePath: string): Promise<string | undefined> {
		// 先从已扫描的图片中查找
		if (this.data.images) {
			const image = this.data.images.find(img => img.path === imagePath);
			if (image?.md5) {
				return image.md5;
			}
		}
		
		// 如果找不到，尝试从文件计算（异步，可能较慢）
		try {
			const file = this.app.vault.getAbstractFileByPath(imagePath) as TFile;
			if (file) {
				const { calculateFileHash } = await import('./utils/image-hash');
				return await calculateFileHash(file, this.app.vault);
			}
		} catch (error) {
			// 计算失败，返回 undefined
		}
		
		return undefined;
	}

	/**
	 * 记录显示文本变化到日志
	 */
	private async logDisplayTextChange(
		imagePath: string,
		imageName: string,
		referencePath: string,
		lineNumber: number,
		oldDisplayText: string,
		newDisplayText: string,
		oldFullLine: string,
		newFullLine: string
	) {
		if (!this.logger) {
			return;
		}

		try {
			// 获取图片的 MD5 哈希值
			const imageHash = await this.getImageHash(imagePath);
			
			// 构建日志消息
			let logMessage = '';
			if (oldDisplayText && newDisplayText) {
				logMessage = `修改显示文本："${oldDisplayText}" → "${newDisplayText}"`;
			} else if (oldDisplayText) {
				logMessage = `移除显示文本："${oldDisplayText}"`;
			} else {
				logMessage = `添加显示文本："${newDisplayText}"`;
			}

			// 构建旧链接和新链接，并检测尺寸变化（仅 Wiki 格式）
			let oldLink = '';
			let newLink = '';
			let oldWidth: number | undefined;
			let oldHeight: number | undefined;
			let newWidth: number | undefined;
			let newHeight: number | undefined;
			
			const oldWikiWithExclamMatch = oldFullLine.match(/!\[\[([^\]]+)\]\]/);
			const oldWikiNoExclamMatch = oldFullLine.match(/\[\[([^\]]+)\]\]/);
			const oldMarkdownMatch = oldFullLine.match(/!\[([^\]]*)\]\(([^)]+)\)/);
			const oldHtmlMatch = oldFullLine.match(/<img[^>]+>/i);

			const newWikiWithExclamMatch = newFullLine.match(/!\[\[([^\]]+)\]\]/);
			const newWikiNoExclamMatch = newFullLine.match(/\[\[([^\]]+)\]\]/);
			const newMarkdownMatch = newFullLine.match(/!\[([^\]]*)\]\(([^)]+)\)/);
			const newHtmlMatch = newFullLine.match(/<img[^>]+>/i);

			// 处理 Wiki 格式（使用 parseWikiLink 来正确提取显示文本和尺寸）
			if (oldWikiWithExclamMatch || oldWikiNoExclamMatch) {
				const isWithExclam = !!oldWikiWithExclamMatch;
				const oldMatch = oldWikiWithExclamMatch || oldWikiNoExclamMatch;
				if (oldMatch) {
					const oldParsed = parseWikiLink(oldMatch[0]);
					oldLink = oldMatch[0]; // 使用完整匹配
					oldWidth = oldParsed.width;
					oldHeight = oldParsed.height;
				}
			} else if (oldMarkdownMatch) {
				// Markdown 格式
				oldLink = `![${oldMarkdownMatch[1] || ''}](${oldMarkdownMatch[2]})`;
			} else if (oldHtmlMatch) {
				// HTML 格式
				oldLink = oldHtmlMatch[0];
				// 提取旧的尺寸
				const oldSize = parseHtmlImageSize(oldLink);
				oldWidth = oldSize.width;
				oldHeight = oldSize.height;
			}

			// 从新行中提取新链接和尺寸
			if (newWikiWithExclamMatch || newWikiNoExclamMatch) {
				const isWithExclam = !!newWikiWithExclamMatch;
				const newMatch = newWikiWithExclamMatch || newWikiNoExclamMatch;
				if (newMatch) {
					const newParsed = parseWikiLink(newMatch[0]);
					newLink = newMatch[0]; // 使用完整匹配
					newWidth = newParsed.width;
					newHeight = newParsed.height;
				}
			} else if (newMarkdownMatch) {
				// Markdown 格式
				newLink = `![${newMarkdownMatch[1] || ''}](${newMarkdownMatch[2]})`;
			} else if (newHtmlMatch) {
				// HTML 格式
				newLink = newHtmlMatch[0];
				// 提取新的尺寸
				const newSize = parseHtmlImageSize(newLink);
				newWidth = newSize.width;
				newHeight = newSize.height;
			}

			// 检测尺寸变化（Wiki 和 HTML 格式）
			const sizeChanged = (oldWidth !== newWidth) || (oldHeight !== newHeight);
			if (sizeChanged && ((oldWikiWithExclamMatch || oldWikiNoExclamMatch) || oldHtmlMatch)) {
				const formatSize = (w?: number, h?: number) => {
					if (!w) return '(无)';
					return h ? `${w}x${h}` : `${w}`;
				};
				const oldSizeStr = formatSize(oldWidth, oldHeight);
				const newSizeStr = formatSize(newWidth, newHeight);
				const sizePart = oldWidth !== undefined && newWidth !== undefined
					? `修改显示尺寸：${oldSizeStr} → ${newSizeStr}`
					: oldWidth !== undefined
					? `移除显示尺寸：${oldSizeStr}`
					: `添加显示尺寸：${newSizeStr}`;
				logMessage += `\n${sizePart}`;
			}

			// 添加链接更新信息
			if (oldLink && newLink && oldLink !== newLink) {
				logMessage += `\n更新链接：${oldLink} → ${newLink}`;
			}

			// 添加笔记信息
			logMessage += `\n更新笔记：1. ${referencePath}`;

			// 记录日志
			await this.logger.info(
				OperationType.UPDATE_DISPLAY_TEXT,
				logMessage,
				{
					imageHash: imageHash,
					imagePath: imagePath,
					imageName: imageName,
					details: {
						referencePath: referencePath,
						lineNumber: lineNumber,
						oldDisplayText: oldDisplayText || '(无)',
						newDisplayText: newDisplayText || '(无)',
						oldWidth: oldWidth,
						oldHeight: oldHeight,
						newWidth: newWidth,
						newHeight: newHeight,
						oldLink: oldLink || undefined,
						newLink: newLink || undefined,
						referencedFiles: [referencePath]
					}
				}
			);
		} catch (error) {
			if (this.logger) {
				await this.logger.error(OperationType.PLUGIN_ERROR, '记录显示文本变化日志失败', {
					error: error as Error
				});
			}
		}
	}

	/**
	 * 检测图片文件创建（导入/添加）
	 */
	private async detectImageCreate(file: TFile) {
		// 如果插件正在初始化，不记录日志（避免启动时记录所有现有文件）
		if (this.isInitializing) {
			return;
		}
		
		// 只处理图片文件，确保 file.name 存在
		if (!file || !file.extension || !file.name) {
			return;
		}

		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
		if (!imageExtensions.includes(file.extension.toLowerCase())) {
			return;
		}

		// 如果文件在回收站中，不处理
		if (file.path.startsWith('.trash/')) {
			return;
		}
		
		// 保存文件信息（防止异步操作期间文件被删除）
		const filePath = file.path;
		const fileName = file.name;
		const fileSize = file.stat?.size;
		const fileCtime = file.stat?.ctime;
		const fileMtime = file.stat?.mtime;

		try {
			// 获取图片的 MD5 哈希值
			const imageHash = await this.getImageHash(filePath);

			// 查找引用（等待一小段时间，确保metadataCache已更新）
			await new Promise(resolve => setTimeout(resolve, 300));
			const references = await this.referenceManager.findImageReferences(filePath, fileName);
			const referencedFiles = references.map(ref => ref.filePath);

			// 构建日志消息
			let logMessage = `导入/添加图片: ${fileName}`;
			if (fileSize) {
				const sizeKB = (fileSize / 1024).toFixed(2);
				logMessage += ` (${sizeKB} KB)`;
			}

			if (referencedFiles.length > 0) {
				const fileList = referencedFiles.map((f, i) => `${i + 1}. ${f}`).join('\n');
				logMessage += `\n引用笔记：${fileList}`;
			}

			// 记录日志
			if (this.logger) {
				await this.logger.info(
					OperationType.CREATE,
					logMessage,
					{
						imageHash: imageHash,
						imagePath: filePath,
						imageName: fileName,
						details: {
							size: fileSize,
							created: fileCtime,
							modified: fileMtime,
							referencedFiles: referencedFiles
						}
					}
				);
			}

			// 更新引用缓存
			if (referencedFiles.length > 0) {
				this.referenceCache.set(filePath, new Set(referencedFiles));
			} else {
				// 如果没有引用，确保缓存中没有该图片的记录
				this.referenceCache.delete(filePath);
			}
		} catch (error) {
			if (this.logger) {
				await this.logger.error(OperationType.PLUGIN_ERROR, '检测图片创建失败', {
					error: error as Error,
					imagePath: filePath
				});
			}
		}
	}

	/**
	 * 检测图片文件重命名
	 */
	private async detectImageRename(file: TFile, oldPath: string) {
		// 只处理图片文件，确保 file.name 存在
		if (!file || !file.extension || !file.name) {
			return;
		}

		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
		if (!imageExtensions.includes(file.extension.toLowerCase())) {
			return;
		}
		
		// 保存文件信息（防止异步操作期间文件被删除）
		const newFileName = file.name;
		const newPath = file.path;

		try {
			// 提取旧文件名
			const oldFileName = oldPath.split('/').pop() || oldPath;

			// 在操作开始时就设置标记，确保引用检测能正确过滤（即使引用检测在操作完成前触发）
			// 这样即使引用检测在重命名操作完成之前触发，也能被过滤掉
			this.recentlyRenamedImages.set(newPath, {
				timestamp: Date.now(),
				referencedFiles: [] // 初始为空，后续会更新
			});

			// 如果文件名相同，说明只是路径改变（移动），不是重命名
			if (oldFileName === newFileName) {
				// 查找引用并更新（Obsidian 通常会自动更新引用链接，但我们需要记录日志）
				const referencedFiles: string[] = [];
				
				// 注意：移动后，Obsidian 会自动更新引用链接，所以使用新路径查找引用
				// 但我们需要等待一小段时间，确保 metadataCache 已经更新
				await new Promise(resolve => setTimeout(resolve, 200));
				
				// 使用引用管理器查找所有引用（使用新路径）
				const references = await this.referenceManager.findImageReferences(newPath, newFileName);
				
				// 按文件分组引用，收集所有引用文件路径和行号
				const refFileMap = new Map<string, number[]>(); // filePath -> lineNumbers[]
				for (const ref of references) {
					if (!refFileMap.has(ref.filePath)) {
						refFileMap.set(ref.filePath, []);
					}
					refFileMap.get(ref.filePath)!.push(ref.lineNumber);
				}
				
				// 收集所有引用文件路径（用于缓存）
				referencedFiles.push(...Array.from(refFileMap.keys()));

				// 更新重命名标记中的引用文件列表（在操作开始时已设置标记）
				if (this.recentlyRenamedImages.has(newPath)) {
					this.recentlyRenamedImages.set(newPath, {
						timestamp: this.recentlyRenamedImages.get(newPath)!.timestamp,
						referencedFiles: referencedFiles.length > 0 ? referencedFiles : []
					});
				}
				// 5秒后清理记录（移动操作应该在这之前完成）
				setTimeout(() => {
					this.recentlyRenamedImages.delete(newPath);
				}, 5000);

				// 记录移动日志
				if (this.logger) {
					// 获取图片的 MD5 哈希值（使用新路径，因为文件已移动）
					const imageHash = await this.getImageHash(newPath);

					// 构建日志消息
					let logMessage = `移动：${oldPath} → ${newPath}`;

					// 如果有关联的引用更新，添加链接更新信息
					if (referencedFiles.length > 0) {
						// 构建旧链接和新链接（使用 Wiki 格式作为示例）
						const oldLink = `![[${oldPath}]]`;
						const newLink = `![[${newPath}]]`;

						// 构建文件列表，包含行号信息
						// 同一文件的多条引用显示为 "文件名（第X行，第Y行）"
						const fileList = Array.from(refFileMap.entries()).map(([filePath, lineNumbers], index) => {
							// 去重并排序行号
							const uniqueLineNumbers = Array.from(new Set(lineNumbers)).sort((a, b) => a - b);
							const lineNumbersStr = uniqueLineNumbers.length > 1 
								? `（第${uniqueLineNumbers.join('行，第')}行）`
								: `（第${uniqueLineNumbers[0]}行）`;
							return `${index + 1}. ${filePath}${lineNumbersStr}`;
						}).join('\n');
						
						logMessage += `\n更新链接：${oldLink} → ${newLink}`;
						logMessage += `\n更新笔记：${fileList}`;
					}

					// 记录日志
					await this.logger.info(
						OperationType.MOVE,
						logMessage,
						{
							imageHash: imageHash,
							imagePath: newPath,
							imageName: newFileName,
							details: {
								oldPath: oldPath,
								oldName: oldFileName,
								newPath: newPath,
								newName: newFileName,
								referencedFiles: referencedFiles
							}
						}
					);
				}

				// 更新引用缓存（从旧路径迁移到新路径）
				const oldRefSet = this.referenceCache.get(oldPath);
				if (oldRefSet) {
					this.referenceCache.set(newPath, oldRefSet);
					this.referenceCache.delete(oldPath);
				} else if (referencedFiles.length > 0) {
					this.referenceCache.set(newPath, new Set(referencedFiles));
				}

				// 更新扫描缓存（从旧路径迁移到新路径）
				if (this.data.imageScanCache && this.data.imageScanCache[oldPath]) {
					const cachedData = this.data.imageScanCache[oldPath];
					// 更新文件修改时间（移动可能改变 mtime）
					const newFile = this.app.vault.getAbstractFileByPath(newPath) as TFile;
					if (newFile) {
						cachedData.mtime = newFile.stat.mtime;
						cachedData.size = newFile.stat.size;
					}
					// 迁移到新路径
					this.data.imageScanCache[newPath] = cachedData;
					delete this.data.imageScanCache[oldPath];
					// 延迟保存，避免频繁写入
					this.debouncedSaveData();
				}

				return;
			}

			// 提取文件扩展名
			const oldNameParts = oldFileName.split('.');
			const newNameParts = newFileName.split('.');
			const oldExtension = oldNameParts.length > 1 ? '.' + oldNameParts[oldNameParts.length - 1] : '';
			const newExtension = newNameParts.length > 1 ? '.' + newNameParts[newNameParts.length - 1] : '';

			// 如果扩展名不同，可能是格式转换，也算重命名
			const oldBaseName = oldNameParts.length > 1 ? oldNameParts.slice(0, -1).join('.') : oldFileName;
			const newBaseName = newNameParts.length > 1 ? newNameParts.slice(0, -1).join('.') : newFileName;

			// 查找引用并更新（Obsidian 通常会自动更新引用链接，但我们需要记录日志）
			const referencedFiles: string[] = [];
			
			// 注意：重命名后，Obsidian 会自动更新引用链接，所以使用新路径查找引用
			// 但我们需要等待一小段时间，确保 metadataCache 已经更新
			await new Promise(resolve => setTimeout(resolve, 200));
			
			// 使用引用管理器查找所有引用（使用新路径）
			const references = await this.referenceManager.findImageReferences(newPath, newFileName);
			
			// 按文件分组引用，收集所有引用文件路径和行号
			const refFileMap = new Map<string, number[]>(); // filePath -> lineNumbers[]
			for (const ref of references) {
				if (!refFileMap.has(ref.filePath)) {
					refFileMap.set(ref.filePath, []);
				}
				refFileMap.get(ref.filePath)!.push(ref.lineNumber);
			}
			
			// 收集所有引用文件路径（用于缓存）
			referencedFiles.push(...Array.from(refFileMap.keys()));

			// 更新重命名标记中的引用文件列表（在操作开始时已设置标记）
			if (this.recentlyRenamedImages.has(newPath)) {
				this.recentlyRenamedImages.set(newPath, {
					timestamp: this.recentlyRenamedImages.get(newPath)!.timestamp,
					referencedFiles: referencedFiles.length > 0 ? referencedFiles : []
				});
			}
			// 5秒后清理记录（重命名操作应该在这之前完成）
			setTimeout(() => {
				this.recentlyRenamedImages.delete(newPath);
			}, 5000);

			// 记录重命名日志
			if (this.logger) {
				// 获取图片的 MD5 哈希值（使用新路径，因为文件已重命名）
				const imageHash = await this.getImageHash(newPath);

				// 构建日志消息
				let logMessage = `重命名：${oldFileName} → ${newFileName}`;

				// 如果有关联的引用更新，添加链接更新信息
				if (referencedFiles.length > 0) {
					// 构建旧链接和新链接（使用 Wiki 格式作为示例）
					const oldLink = `![[${oldPath}]]`;
					const newLink = `![[${newPath}]]`;

					// 构建文件列表，包含行号信息
					// 同一文件的多条引用显示为 "文件名（第X行，第Y行）"
					const fileList = Array.from(refFileMap.entries()).map(([filePath, lineNumbers], index) => {
						// 去重并排序行号
						const uniqueLineNumbers = Array.from(new Set(lineNumbers)).sort((a, b) => a - b);
						const lineNumbersStr = uniqueLineNumbers.length > 1 
							? `（第${uniqueLineNumbers.join('行，第')}行）`
							: `（第${uniqueLineNumbers[0]}行）`;
						return `${index + 1}. ${filePath}${lineNumbersStr}`;
					}).join('\n');
					
					logMessage += `\n更新链接：${oldLink} → ${newLink}`;
					logMessage += `\n更新笔记：${fileList}`;
				}

				// 记录日志
				await this.logger.info(
					OperationType.RENAME,
					logMessage,
					{
						imageHash: imageHash,
						imagePath: newPath,
						imageName: newFileName,
						details: {
							oldPath: oldPath,
							oldName: oldFileName,
							newPath: newPath,
							newName: newFileName,
							referencedFiles: referencedFiles,
							references: references.map(ref => ({
								filePath: ref.filePath,
								lineNumber: ref.lineNumber,
								displayText: ref.displayText
							}))
						}
					}
				);
			}

			// 更新引用缓存（从旧路径迁移到新路径）
			const oldRefSet = this.referenceCache.get(oldPath);
			if (oldRefSet) {
				this.referenceCache.set(newPath, oldRefSet);
				this.referenceCache.delete(oldPath);
			} else if (referencedFiles.length > 0) {
				this.referenceCache.set(newPath, new Set(referencedFiles));
			}

			// 更新扫描缓存（从旧路径迁移到新路径）
			if (this.data.imageScanCache && this.data.imageScanCache[oldPath]) {
				const cachedData = this.data.imageScanCache[oldPath];
				// 更新文件修改时间（重命名/移动可能改变 mtime）
				const newFile = this.app.vault.getAbstractFileByPath(newPath) as TFile;
				if (newFile) {
					cachedData.mtime = newFile.stat.mtime;
					cachedData.size = newFile.stat.size;
				}
				// 迁移到新路径
				this.data.imageScanCache[newPath] = cachedData;
				delete this.data.imageScanCache[oldPath];
				// 延迟保存，避免频繁写入
				this.debouncedSaveData();
			}
		} catch (error) {
			if (this.logger) {
				await this.logger.error(OperationType.PLUGIN_ERROR, '检测图片重命名失败', {
					error: error as Error
				});
			}
		}
	}

	/**
	 * 处理文件删除事件
	 * 注意：Obsidian 的 delete 事件在文件删除后触发，此时文件已经不存在
	 * 由于 Obsidian API 的限制，我们无法在文件管理器删除操作前拦截
	 * 因此，在文件管理器中删除的图片无法自动移动到插件回收站
	 * 建议用户使用插件内的删除功能（图片详情页或批量删除）来利用回收站功能
	 */
	private async handleFileDelete(file: TFile) {
		// 只处理图片文件，确保 file.name 存在
		if (!file || !file.extension || !file.name) {
			return;
		}

		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
		if (!imageExtensions.includes(file.extension.toLowerCase())) {
			return;
		}

		// 如果文件已经在回收站中，不处理
		if (file.path.startsWith('.trash/')) {
			return;
		}
		
		// 保存文件信息（防止异步操作期间文件状态变化）
		const filePath = file.path;
		const fileName = file.name;
		const fileSize = file.stat?.size;

		// 获取图片的 MD5 哈希值（在文件删除前尝试获取）
		let imageHash: string | undefined;
		try {
			imageHash = await this.getImageHash(filePath);
		} catch (error) {
			// 如果获取失败，尝试从已扫描的图片中查找
			if (this.data.images) {
				const image = this.data.images.find(img => img.path === filePath);
				if (image?.md5) {
					imageHash = image.md5;
				}
			}
		}

		// 记录日志（文件已被删除，无法移动到回收站）
		// 注意：由于 Obsidian API 限制，在文件管理器中删除的文件无法拦截
		// 只有通过插件内部删除操作（图片详情页、批量删除等）才能使用回收站功能
		if (this.logger) {
			await this.logger.warn(
				OperationType.DELETE,
				`文件已被删除: ${fileName}（在文件管理器中删除，无法移动到回收站）`,
				{
					imageHash: imageHash,
					imagePath: filePath,
					imageName: fileName,
					details: {
						size: fileSize,
						note: '文件已在删除事件触发前被删除。提示：使用插件内的删除功能（图片详情页或批量删除）可以自动移动到回收站。'
					}
				}
			);
		}

		// 清理引用缓存
		this.referenceCache.delete(filePath);
		
		// 清理扫描缓存
		if (this.data.imageScanCache && this.data.imageScanCache[filePath]) {
			delete this.data.imageScanCache[filePath];
			// 延迟保存，避免频繁写入
			this.debouncedSaveData();
		}
	}

	/**
	 * 初始化引用缓存（在插件启动后延迟执行，避免记录所有现有引用）
	 */
	private async initializeReferenceCache() {
		try {
			// 遍历所有 Markdown 文件，初始化引用缓存
			const allFiles = this.app.vault.getMarkdownFiles();
			for (const file of allFiles) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (!cache || !cache.embeds) continue;

				for (const embed of cache.embeds) {
					try {
						const resolvedPath = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
						if (resolvedPath) {
							const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
							if (imageExtensions.includes(resolvedPath.extension?.toLowerCase() || '')) {
								const imagePath = resolvedPath.path;
								let refSet = this.referenceCache.get(imagePath);
								if (!refSet) {
									refSet = new Set();
									this.referenceCache.set(imagePath, refSet);
								}
								refSet.add(file.path);
							}
						}
					} catch (error) {
						// 忽略解析错误
					}
				}
			}
			
			// 标记缓存已初始化
			this.referenceCacheInitialized = true;
		} catch (error) {
			// 初始化失败不影响功能，标记为已初始化以避免无限等待
			this.referenceCacheInitialized = true;
		}
	}

	/**
	 * 检测引用/取消引用变化
	 * 
	 * 当笔记文件的元数据缓存更新时调用，用于：
	 * 1. 检测新增的图片引用
	 * 2. 检测取消的图片引用
	 * 3. 更新引用缓存（referenceCache）
	 * 4. 更新图片信息缓存（data.images 和 imageScanCache）
	 * 5. 记录引用变化日志
	 * 
	 * @param file 发生变化的笔记文件
	 * @param cache 笔记的元数据缓存
	 */
	private async detectReferenceChanges(file: TFile, cache: any) {
		// 如果插件正在初始化，不检测变化
		if (this.isInitializing) {
			return;
		}
		
		// 只处理 Markdown 文件，并确保 file.name 存在
		if (!file || !file.name || file.extension !== 'md') {
			return;
		}

		// 如果引用缓存尚未初始化，不记录变化（避免在启动时记录所有现有引用）
		if (!this.referenceCacheInitialized) {
			return;
		}
		
		// 保存文件信息（防止异步操作期间文件被删除）
		const filePath = file.path;
		const fileName = file.name;

		try {
			// 获取当前缓存中的 embeds
			const currentEmbeds = cache?.embeds || [];
			const currentImagePaths = new Set<string>();

			// 收集当前引用的所有图片路径
			for (const embed of currentEmbeds) {
				try {
					const resolvedPath = this.app.metadataCache.getFirstLinkpathDest(embed.link, filePath);
					if (resolvedPath) {
						const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
						if (imageExtensions.includes(resolvedPath.extension?.toLowerCase() || '')) {
							currentImagePaths.add(resolvedPath.path);
						}
					}
				} catch (error) {
					// 忽略解析错误
				}
			}

			// 获取之前的引用状态（从缓存中查找该文件引用的所有图片）
			const previouslyReferencedImages = new Set<string>();
			for (const [imagePath, refSet] of this.referenceCache.entries()) {
				if (refSet.has(filePath)) {
					previouslyReferencedImages.add(imagePath);
				}
			}

			// 检测新增的引用
			for (const imagePath of currentImagePaths) {
				if (!previouslyReferencedImages.has(imagePath)) {
					// 检查这个图片是否最近被重命名，如果是，则跳过记录（重命名后的所有引用都是已存在的，不是新增）
					const recentRename = this.recentlyRenamedImages.get(imagePath);
					if (recentRename) {
						const timeSinceRename = Date.now() - recentRename.timestamp;
						// 如果重命名在5秒内，跳过所有引用检测（这是重命名导致的引用更新，不是新增引用）
						if (timeSinceRename < 5000) {
							// 更新缓存但不记录日志（这是重命名导致的引用更新）
							let refSet = this.referenceCache.get(imagePath);
							if (!refSet) {
								refSet = new Set();
								this.referenceCache.set(imagePath, refSet);
							}
							refSet.add(filePath);
							continue; // 跳过记录日志
						}
					}

					// 新增引用
					const imageFile = this.app.vault.getAbstractFileByPath(imagePath) as TFile;
					// 确保文件存在且有 name 属性
					if (imageFile && imageFile.name) {
						const imageHash = await this.getImageHash(imagePath);
						if (this.logger) {
							// 查找引用位置和显示文本
							await new Promise(resolve => setTimeout(resolve, 200)); // 等待metadataCache更新
							// 再次检查文件是否存在（异步操作期间可能被删除）
							const currentImageFile = this.app.vault.getAbstractFileByPath(imagePath) as TFile;
							if (!currentImageFile || !currentImageFile.name) {
								continue; // 文件已被删除，跳过
							}
							const references = await this.referenceManager.findImageReferences(imagePath, currentImageFile.name);
							const ref = references.find(r => r.filePath === filePath);
							const displayText = ref?.displayText || '';
							const lineNumber = ref?.lineNumber;

							// 构建美化的日志消息
							let logMessage = `新增引用: ${currentImageFile.name}`;
							logMessage += `\n引用笔记: ${filePath}`;
							if (lineNumber) {
								logMessage += ` (第${lineNumber}行)`;
							}
							if (displayText) {
								logMessage += `\n显示文本: "${displayText}"`;
							}
							// 从 fullLine 中提取链接格式
							const linkMatch = ref?.fullLine?.match(/!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)|<img[^>]+>/);
							const linkFormat = linkMatch ? linkMatch[0] : '';
							if (linkFormat) {
								logMessage += `\n链接格式: ${linkFormat}`;
							}

							await this.logger.info(
								OperationType.REFERENCE,
								logMessage,
								{
									imageHash: imageHash,
									imagePath: imagePath,
									imageName: currentImageFile.name,
									details: {
										referencingFile: filePath,
										referencingFileName: fileName,
										displayText: displayText,
										lineNumber: lineNumber,
										linkFormat: linkFormat,
										fullLine: ref?.fullLine
									}
								}
							);
						}

						// 更新缓存
						let refSet = this.referenceCache.get(imagePath);
						if (!refSet) {
							refSet = new Set();
							this.referenceCache.set(imagePath, refSet);
						}
						refSet.add(filePath);
						
						// 更新 data.images 中的引用信息
						await this.updateImageReferences(imagePath);
					}
				}
			}

			// 检测取消的引用
			for (const imagePath of previouslyReferencedImages) {
				if (!currentImagePaths.has(imagePath)) {
					// 取消引用
					const imageFile = this.app.vault.getAbstractFileByPath(imagePath) as TFile;
					// 确保文件存在且有 name 属性
					if (imageFile && imageFile.name) {
						const imageHash = await this.getImageHash(imagePath);
						if (this.logger) {
							// 构建美化的日志消息
							const logMessage = `移除引用: ${imageFile.name}\n来源笔记: ${filePath}`;

							await this.logger.info(
								OperationType.UNREFERENCE,
								logMessage,
								{
									imageHash: imageHash,
									imagePath: imagePath,
									imageName: imageFile.name,
									details: {
										referencingFile: filePath,
										referencingFileName: fileName
									}
								}
							);
						}

						// 更新缓存
						const refSet = this.referenceCache.get(imagePath);
						if (refSet) {
							refSet.delete(filePath);
							if (refSet.size === 0) {
								this.referenceCache.delete(imagePath);
							}
						}
						
						// 更新 data.images 中的引用信息
						await this.updateImageReferences(imagePath);
					} else {
						// 文件已被删除，仅更新缓存
						const refSet = this.referenceCache.get(imagePath);
						if (refSet) {
							refSet.delete(filePath);
							if (refSet.size === 0) {
								this.referenceCache.delete(imagePath);
							}
						}
					}
				}
			}
			
			// 延迟保存数据（避免频繁写入）
			this.debouncedSaveData();
		} catch (error) {
			if (this.logger) {
				await this.logger.error(OperationType.PLUGIN_ERROR, '检测引用变化失败', {
					error: error as Error,
					details: {
						filePath: filePath
					}
				});
			}
		}
	}
	
	/**
	 * 更新指定图片的引用信息
	 * 
	 * 当图片的引用关系发生变化时调用，用于：
	 * 1. 使用 referenceManager 获取最新的引用信息
	 * 2. 更新 data.images 中对应图片的引用数据
	 * 3. 更新 imageScanCache 中的缓存数据
	 * 
	 * 更新后的数据会通过 debouncedSaveData 延迟保存到本地，
	 * 确保下次打开图片详情页时可以立即显示引用信息。
	 * 
	 * @param imagePath 图片路径
	 */
	private async updateImageReferences(imagePath: string): Promise<void> {
		try {
			// 获取图片文件
			const imageFile = this.app.vault.getAbstractFileByPath(imagePath) as TFile;
			if (!imageFile || !imageFile.name) return;
			
			// 使用 referenceManager 获取最新的引用信息
			const references = await this.referenceManager.findImageReferences(imagePath, imageFile.name);
			
			// 更新 data.images 中的引用信息
			if (this.data.images) {
				const imageInfo = this.data.images.find((img: any) => img.path === imagePath);
				if (imageInfo) {
					imageInfo.references = references;
					imageInfo.referenceCount = references.length;
					imageInfo.referencesUpdatedAt = Date.now();
				}
			}
			
			// 更新 imageScanCache 中的引用信息
			if (this.data.imageScanCache && this.data.imageScanCache[imagePath]) {
				this.data.imageScanCache[imagePath].references = references;
				this.data.imageScanCache[imagePath].referenceCount = references.length;
				this.data.imageScanCache[imagePath].referencesUpdatedAt = Date.now();
			}
		} catch (error) {
			// 静默失败，不影响主流程
		}
	}

	/**
	 * 创建 .nomedia 文件
	 * 
	 * .nomedia 文件用于防止 Android 媒体扫描器扫描该目录下的图片，
	 * 从而避免这些图片出现在手机相册中。
	 * 
	 * 功能说明：
	 * - 直接在笔记库根目录创建 .nomedia 文件
	 * - 文件为空文件，仅用于指示媒体扫描器忽略该目录
	 * - 创建后，Android 相册应用将不会显示此目录下的图片
	 * - 此功能仅对 Android 设备有效，iOS 不使用 .nomedia 机制
	 * 
	 * @returns 操作结果 { success: boolean, message: string }
	 */
	async createNomediaFile(): Promise<{ success: boolean; message: string }> {
		try {
			const fullPath = '.nomedia';

			// 记录操作开始
			if (this.logger) {
				await this.logger.info(
					OperationType.PLUGIN_LOAD,
					`开始创建 .nomedia 文件：${fullPath}`,
					{
						details: {
							action: '创建 .nomedia 文件',
							path: fullPath,
							purpose: '防止 Android 相册扫描该目录下的图片'
						}
					}
				);
			}

			// 检查文件是否已存在
			const existingFile = this.app.vault.getAbstractFileByPath(fullPath) as TFile;
			if (existingFile) {
				if (this.logger) {
					await this.logger.info(
						OperationType.PLUGIN_LOAD,
						`Android 相册隐藏已开启`,
						{ details: { path: fullPath } }
					);
				}

				return {
					success: true,
					message: `✅ 已开启`
				};
			}

			// 创建 .nomedia 文件（空文件）
			await this.app.vault.create(fullPath, '');
			
			// 记录创建成功
			if (this.logger) {
				await this.logger.info(
					OperationType.PLUGIN_LOAD,
					`Android 相册隐藏已开启`,
					{ details: { path: fullPath } }
				);
			}

			return {
				success: true,
				message: `✅ 已开启`
			};
		} catch (error) {
			const errorMsg = (error as Error).message;
			
			// 如果错误是"文件已存在"，返回成功
			if (errorMsg.includes('already exists') || errorMsg.includes('已存在')) {
				if (this.logger) {
					await this.logger.info(
						OperationType.PLUGIN_LOAD,
						`Android 相册隐藏已开启`,
						{ details: { path: '.nomedia' } }
					);
				}

				return {
					success: true,
					message: `✅ 已开启`
				};
			}
			
			const errorMessage = `❌ 开启失败：${errorMsg}`;
			
			// 记录错误
			if (this.logger) {
				await this.logger.error(
					OperationType.PLUGIN_ERROR,
					errorMessage,
					{
						error: error as Error,
						details: {
							action: '创建 .nomedia 文件',
							path: '.nomedia',
							platform: 'Android 仅支持',
							suggestion: '请检查文件权限或磁盘空间'
						}
					}
				);
			}

			return {
				success: false,
				message: errorMessage
			};
		}
	}

	/**
	 * 删除 .nomedia 文件
	 * 
	 * 删除后，Android 相册将能够扫描并显示该目录下的图片。
	 * 
	 * 功能说明：
	 * - 直接删除笔记库根目录的 .nomedia 文件
	 * - 删除后，Android 相册应用将重新扫描并显示此目录下的图片
	 * - 此功能仅对 Android 设备有效，iOS 不使用 .nomedia 机制
	 * 
	 * @returns 操作结果 { success: boolean; message: string }
	 */
	async deleteNomediaFile(): Promise<{ success: boolean; message: string }> {
		try {
			const fullPath = '.nomedia';

			// 先尝试通过 vault API 删除
			const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
			if (existingFile && existingFile instanceof TFile) {
				await this.app.vault.delete(existingFile);
				
				if (this.logger) {
					await this.logger.info(
						OperationType.PLUGIN_LOAD,
						`Android 相册隐藏已关闭`,
						{ details: { path: fullPath } }
					);
				}

				return {
					success: true,
					message: `✅ 已关闭`
				};
			}

			// 如果 vault API 找不到，尝试用 adapter 直接删除
			const fileExists = await this.app.vault.adapter.exists(fullPath);
			if (fileExists) {
				await this.app.vault.adapter.remove(fullPath);
				
				if (this.logger) {
					await this.logger.info(
						OperationType.PLUGIN_LOAD,
						`Android 相册隐藏已关闭`,
						{ details: { path: fullPath } }
					);
				}

				return {
					success: true,
					message: `✅ 已关闭`
				};
			}

			// 文件不存在，也算关闭成功
			return {
				success: true,
				message: `✅ 已关闭`
			};
		} catch (error) {
			const errorMessage = `❌ 关闭失败：${(error as Error).message}`;
			
			// 记录错误
			if (this.logger) {
				await this.logger.error(
					OperationType.PLUGIN_ERROR,
					errorMessage,
					{
						error: error as Error,
						details: {
							action: '删除 .nomedia 文件',
							path: '.nomedia',
							errorDetails: (error as Error).stack,
							platform: 'Android 仅支持',
							suggestion: '请检查文件权限或文件是否被其他程序占用'
						}
					}
				);
			}

			return {
				success: false,
				message: errorMessage
			};
		}
	}
}
