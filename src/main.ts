import { Plugin, TFile, debounce } from 'obsidian';
import { ImageManagementSettings, DEFAULT_SETTINGS } from './settings';
import { ImageManagementSettingTab } from './ui/settings-tab';
import { ImageManagerView, IMAGE_MANAGER_VIEW_TYPE } from './ui/image-manager-view';
import { Logger, LogLevel, OperationType } from './utils/logger';
import { ErrorHandler } from './utils/error-handler';
import { PluginData } from './types';
import { ReferenceManager, parseWikiLink, parseHtmlImageSize } from './utils/reference-manager';
import { TrashManager } from './utils/trash-manager';
import { LockListManager } from './utils/lock-list-manager';
import { HistoryManager } from './utils/history-manager';

/**
 * ImageManagement 插件主类
 * 
 * 负责：
 * - 插件生命周期管理（加载、卸载）
 * - 视图和命令注册
 * - 事件监听和处理
 * - 核心管理器初始化（日志、错误、引用、回收站）
 * - 缓存管理和数据持久化
 */
export default class ImageManagementPlugin extends Plugin {
	// ==================== 核心管理器 ====================
	/** 插件设置对象 */
	settings: ImageManagementSettings;
	/** 日志管理器 - 负责记录所有操作日志 */
	logger: Logger;
	/** 错误处理器 - 统一处理和记录错误 */
	errorHandler: ErrorHandler;
	/** 插件数据存储 - 包含扫描的图片列表、缓存等 */
	data: PluginData = {};
	/** 引用管理器 - 查找和管理图片的引用关系 */
	referenceManager: ReferenceManager;
	/** 回收站管理器 - 管理已删除的文件 */
	trashManager: TrashManager;
	/** 历史记录管理器 - 管理图片修改历史 */
	historyManager: HistoryManager;
	/** 锁定列表管理器 - 管理和监控锁定文件列表 */
	lockListManager: LockListManager;

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

	/**
	 * 插件加载生命周期方法
	 * 
	 * 执行流程：
	 * 1. 加载持久化数据和设置
	 * 2. 初始化核心管理器（日志、错误处理、引用、回收站）
	 * 3. 注册视图、命令和事件监听器
	 * 4. 延迟初始化缓存和标记初始化完成
	 * 
	 * 注意：某些初始化操作延迟执行，避免阻塞插件启动
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
			
			// 初始化日志管理器
			this.logger = new Logger(this);
			
			// 初始化错误处理器
			this.errorHandler = new ErrorHandler(this);
			
			// 初始化引用管理器
			this.referenceManager = new ReferenceManager(this.app, this);
			
			// 初始化回收站管理器
			this.trashManager = new TrashManager(this.app, this);
			
			// 初始化回收站预加载（在设置加载后）
			this.trashManager.initializePreload();
			
			// 初始化锁定列表管理器
			this.lockListManager = new LockListManager(this);
			await this.lockListManager.initialize();
			
			// 延迟初始化引用缓存，避免在启动时记录所有现有引用
			setTimeout(() => {
				this.initializeReferenceCache();
			}, 5000); // 5秒后初始化引用缓存
			
			// 标记插件初始化完成（3秒后，避免在启动扫描时记录大量日志）
			setTimeout(() => {
				this.isInitializing = false;
			}, 3000);
			
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
					await this.detectDisplayTextChanges(file);
				}, 2000, false))
			);

			// 注册文件创建监听器，检测图片文件导入/添加
			this.registerEvent(
				this.app.vault.on('create', async (file) => {
					if (file instanceof TFile) {
						await this.detectImageCreate(file);
					}
				})
			);

			// 注册文件重命名监听器，检测图片文件重命名
			this.registerEvent(
				this.app.vault.on('rename', async (file, oldPath) => {
					if (file instanceof TFile) {
						await this.detectImageRename(file, oldPath);
					}
				})
			);

			// 注册文件删除监听器，检测图片文件删除
			this.registerEvent(
				this.app.vault.on('delete', async (file) => {
					if (file instanceof TFile) {
						await this.handleFileDelete(file);
					}
				})
			);

			// 注册metadataCache变化监听器，检测引用/取消引用
			this.registerEvent(
				this.app.metadataCache.on('changed', async (file, data, cache) => {
					await this.detectReferenceChanges(file, cache);
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

	onunload() {
		// 清理视图
		this.app.workspace.detachLeavesOfType(IMAGE_MANAGER_VIEW_TYPE);
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
					'autoGenerateNames', 'keepModalOpen', 'showReferenceTime', 'pathNamingDepth',
					'duplicateNameHandling', 'multipleReferencesHandling', 'saveBatchRenameLog', 
					'defaultWheelMode', 'showImageName', 'showImageSize', 
					'showImageDimensions', 'showLockIcon', 'imageNameWrap', 'adaptiveImageSize',
					'enableLazyLoading', 'lazyLoadDelay', 'maxCacheSize', 'cardBorderRadius',
					'cardSpacing', 'fixedImageHeight', 'enableHoverEffect', 'showImageIndex',
					'confirmBeforeDelete', 'moveToSystemTrash', 'enablePluginTrash', 'trashRestorePath',
					'logLevel', 'enableConsoleLog', 'enableDebugLog', 'keyboardShortcuts',
					'ignoredFiles', 'ignoredHashes', 'ignoredHashMetadata', 'showIgnoredFilePath',
					'pureGallery', 'uniformCardHeight', 'searchCaseSensitive', 'liveSearchDelay',
					'searchInPath', 'maxBatchOperations', 'batchConfirmThreshold', 'showBatchProgress',
					'showStatistics', 'statisticsPosition'];
				
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
				'autoGenerateNames', 'keepModalOpen', 'showReferenceTime', 'pathNamingDepth',
				'duplicateNameHandling', 'multipleReferencesHandling', 'saveBatchRenameLog', 
				'defaultWheelMode', 'showImageName', 'showImageSize', 
				'showImageDimensions', 'showLockIcon', 'imageNameWrap', 'adaptiveImageSize',
				'enableLazyLoading', 'lazyLoadDelay', 'maxCacheSize', 'cardBorderRadius',
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
		
		// 只处理图片文件
		if (!file || !file.extension) {
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

		try {
			// 获取图片的 MD5 哈希值
			const imageHash = await this.getImageHash(file.path);

			// 查找引用（等待一小段时间，确保metadataCache已更新）
			await new Promise(resolve => setTimeout(resolve, 300));
			const references = await this.referenceManager.findImageReferences(file.path, file.name);
			const referencedFiles = references.map(ref => ref.filePath);

			// 构建日志消息
			let logMessage = `导入/添加图片: ${file.name}`;
			if (file.stat.size) {
				const sizeKB = (file.stat.size / 1024).toFixed(2);
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
						imagePath: file.path,
						imageName: file.name,
						details: {
							size: file.stat.size,
							created: file.stat.ctime,
							modified: file.stat.mtime,
							referencedFiles: referencedFiles
						}
					}
				);
			}

			// 更新引用缓存
			if (referencedFiles.length > 0) {
				this.referenceCache.set(file.path, new Set(referencedFiles));
			} else {
				// 如果没有引用，确保缓存中没有该图片的记录
				this.referenceCache.delete(file.path);
			}
		} catch (error) {
			if (this.logger) {
				await this.logger.error(OperationType.PLUGIN_ERROR, '检测图片创建失败', {
					error: error as Error,
					imagePath: file.path
				});
			}
		}
	}

	/**
	 * 检测图片文件重命名
	 */
	private async detectImageRename(file: TFile, oldPath: string) {
		// 只处理图片文件
		if (!file || !file.extension) {
			return;
		}

		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
		if (!imageExtensions.includes(file.extension.toLowerCase())) {
			return;
		}

		try {
			// 提取旧文件名和新文件名
			const oldFileName = oldPath.split('/').pop() || oldPath;
			const newFileName = file.name;
			const newPath = file.path;

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
		// 只处理图片文件
		if (!file || !file.extension) {
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

		// 获取图片的 MD5 哈希值（在文件删除前尝试获取）
		let imageHash: string | undefined;
		try {
			imageHash = await this.getImageHash(file.path);
		} catch (error) {
			// 如果获取失败，尝试从已扫描的图片中查找
			if (this.data.images) {
				const image = this.data.images.find(img => img.path === file.path);
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
				`文件已被删除: ${file.name}（在文件管理器中删除，无法移动到回收站）`,
				{
					imageHash: imageHash,
					imagePath: file.path,
					imageName: file.name,
					details: {
						size: file.stat.size,
						note: '文件已在删除事件触发前被删除。提示：使用插件内的删除功能（图片详情页或批量删除）可以自动移动到回收站。'
					}
				}
			);
		}

		// 清理引用缓存
		this.referenceCache.delete(file.path);
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
	 */
	private async detectReferenceChanges(file: TFile, cache: any) {
		// 如果插件正在初始化，不检测变化
		if (this.isInitializing) {
			return;
		}
		
		// 只处理 Markdown 文件
		if (!file || file.extension !== 'md') {
			return;
		}

		// 如果引用缓存尚未初始化，不记录变化（避免在启动时记录所有现有引用）
		if (!this.referenceCacheInitialized) {
			return;
		}

		try {
			// 获取当前缓存中的 embeds
			const currentEmbeds = cache?.embeds || [];
			const currentImagePaths = new Set<string>();

			// 收集当前引用的所有图片路径
			for (const embed of currentEmbeds) {
				try {
					const resolvedPath = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
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
				if (refSet.has(file.path)) {
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
							refSet.add(file.path);
							continue; // 跳过记录日志
						}
					}

					// 新增引用
					const imageFile = this.app.vault.getAbstractFileByPath(imagePath) as TFile;
					if (imageFile) {
						const imageHash = await this.getImageHash(imagePath);
						if (this.logger) {
							// 查找引用位置和显示文本
							await new Promise(resolve => setTimeout(resolve, 200)); // 等待metadataCache更新
							const references = await this.referenceManager.findImageReferences(imagePath, imageFile.name);
							const ref = references.find(r => r.filePath === file.path);
							const displayText = ref?.displayText || '';

							let logMessage = `引用图片: ${imageFile.name}\n引用笔记: ${file.path}`;
							if (displayText) {
								logMessage += `\n显示文本: "${displayText}"`;
							}

							await this.logger.info(
								OperationType.REFERENCE,
								logMessage,
								{
									imageHash: imageHash,
									imagePath: imagePath,
									imageName: imageFile.name,
									details: {
										referencingFile: file.path,
										referencingFileName: file.name,
										displayText: displayText,
										lineNumber: ref?.lineNumber
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
						refSet.add(file.path);
					}
				}
			}

			// 检测取消的引用
			for (const imagePath of previouslyReferencedImages) {
				if (!currentImagePaths.has(imagePath)) {
					// 取消引用
					const imageFile = this.app.vault.getAbstractFileByPath(imagePath) as TFile;
					if (imageFile) {
						const imageHash = await this.getImageHash(imagePath);
						if (this.logger) {
							await this.logger.info(
								OperationType.UNREFERENCE,
								`取消引用: ${imageFile.name}\n引用笔记: ${file.path}`,
								{
									imageHash: imageHash,
									imagePath: imagePath,
									imageName: imageFile.name,
									details: {
										referencingFile: file.path,
										referencingFileName: file.name
									}
								}
							);
						}

						// 更新缓存
						const refSet = this.referenceCache.get(imagePath);
						if (refSet) {
							refSet.delete(file.path);
							if (refSet.size === 0) {
								this.referenceCache.delete(imagePath);
							}
						}
					}
				}
			}
		} catch (error) {
			if (this.logger) {
				await this.logger.error(OperationType.PLUGIN_ERROR, '检测引用变化失败', {
					error: error as Error,
					details: {
						filePath: file.path
					}
				});
			}
		}
	}
}
