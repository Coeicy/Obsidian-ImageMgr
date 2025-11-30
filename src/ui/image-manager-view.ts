import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import ImageManagementPlugin from '../main';
import { ImageInfo } from '../types';
import { ImageProcessor } from '../utils/image-processor';
import { RenameModal } from './rename-modal';
import { SortModal, type SortOptions } from './sort-modal';
import { FilterModal, type FilterOptions } from './filter-modal';
import { SearchModal } from './search-modal';
import { StatsModal } from './stats-modal';
import { ImageDetailModal } from './image-detail-modal';
import { BrokenLinksModal } from './broken-links-modal';
// import { calculateFileHash } from '../utils/image-hash'; // 已迁移到 ImageScanner
import { ConfirmModal } from './confirm-modal';
import { GroupModal } from './group-modal';
import { DuplicateDetectionModal } from './duplicate-detection-modal';
import { ReferenceManager } from '../utils/reference-manager';
import { OperationType } from '../utils/logger';
import { UI_SIZE, TIMING, LIMITS, STYLES, calculateItemWidth, shouldLoadMore } from '../constants';
import { isFileIgnored } from '../utils/file-filter';
import { PathValidator } from '../utils/path-validator';
import { matchesShortcut, isInputElement, SHORTCUT_DEFINITIONS } from '../utils/keyboard-shortcut-manager';
import { DragSelectManager } from '../utils/drag-select-manager';
import { LinkFormatModal } from './link-format-modal';

/** 图片管理视图的类型标识符 */
export const IMAGE_MANAGER_VIEW_TYPE = 'image-manager-view';

/**
 * 图片管理视图类
 * 
 * 这是插件的主视图，负责：
 * - 显示所有扫描到的图片网格
 * - 提供搜索、排序、筛选功能
 * - 处理用户交互（点击、键盘、滚轮）
 * - 管理虚拟滚动以优化性能
 * - 与其他模态框交互
 */
export class ImageManagerView extends ItemView {
	/** 插件实例引用 */
	plugin: ImageManagementPlugin;
	/** 所有扫描到的图片列表 */
	images: ImageInfo[] = [];
	/** 经过搜索、排序、筛选后的图片列表 */
	filteredImages: ImageInfo[] = [];
	/** 已渲染的图片数量（用于虚拟滚动） */
	private renderedCount: number = 0;
	/** 排序选项（排序规则、顺序等） */
	private sortOptions: SortOptions;
	/** 筛选选项（文件类型、引用状态等） */
	private filterOptions: FilterOptions;
	/** 当前搜索查询字符串 */
	private searchQuery: string = '';
	/** 滚动事件监听器引用（用于虚拟滚动） */
	private scrollHandler: EventListener | null = null;
	/** 文件创建/修改/删除事件监听器 */
	private fileEventListener: ((file: TFile) => void) | null = null;
	/** 文件重命名事件监听器 */
	private renameEventListener: ((file: TFile, oldPath: string) => void) | null = null;
	/** 引用状态缓存：imagePath -> isReferenced */
	private referenceCache: Map<string, boolean> = new Map();
	/** 是否正在扫描图片的标志 */
	private isScanning: boolean = false;
	/** 键盘事件处理器引用（用于快捷键） */
	private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
	/** 滚轮事件处理器引用（用于缩放或切换） */
	private wheelHandler: ((e: WheelEvent) => void) | null = null;
	/** 当前聚焦的图片索引（用于键盘导航） */
	private focusedImageIndex: number = -1;
	/** 临时的每行显示数量（不保存到设置，用于临时调整） */
	private tempImagesPerRow: number | null = null;
	/** 拖拽框选管理器 */
	private dragSelectManager: DragSelectManager | null = null;
	/** 操作历史栈：记录搜索、排序、筛选、分组的操作顺序，用于倒序清除 */
	private operationHistory: Array<'search' | 'sort' | 'filter' | 'group'> = [];
	/** 清除按钮元素引用 */
	private clearBtnElement: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: ImageManagementPlugin) {
		super(leaf);
		this.plugin = plugin;
		
		// 从设置中加载默认值
		this.sortOptions = {
			rules: [{ sortBy: plugin.settings.defaultSortBy, sortOrder: plugin.settings.defaultSortOrder }]
		};
		this.filterOptions = {
			filterType: plugin.settings.defaultFilterType
		};
	}

	getViewType(): string {
		return IMAGE_MANAGER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '图片管理';
	}

	getIcon(): string {
		return 'image';
	}

	async onOpen() {
		const { containerEl } = this;
		containerEl.empty();
		
		// 重置临时显示数量（恢复为设置中的默认值）
		this.tempImagesPerRow = null;

		// 创建标题栏
		const headerEl = containerEl.createDiv('image-manager-header');
		headerEl.createEl('h2', { text: '图片管理' });

		// 创建工具栏
		const toolbarEl = containerEl.createDiv('image-manager-toolbar');
		
		// 搜索按钮
		const searchBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
		searchBtn.setAttribute('id', 'search-btn');
		this.updateButtonIndicator(searchBtn, 'search');
		searchBtn.addEventListener('click', () => this.openSearch());

		// 排序按钮
		const sortBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
		sortBtn.setAttribute('id', 'sort-btn');
		this.updateButtonIndicator(sortBtn, 'sort');
		sortBtn.addEventListener('click', () => this.openSort());

		// 筛选按钮
		const filterBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
		filterBtn.setAttribute('id', 'filter-btn');
		this.updateButtonIndicator(filterBtn, 'filter');
		filterBtn.addEventListener('click', () => this.openFilter());

		// 分组按钮
		const groupBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
		groupBtn.setAttribute('id', 'group-btn');
		this.updateButtonIndicator(groupBtn, 'group');
		groupBtn.addEventListener('click', () => this.groupImages());

		// 智能重命名按钮
		const pathRenameBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
		pathRenameBtn.setAttribute('id', 'path-rename-btn');
		this.updateButtonIndicator(pathRenameBtn, 'path-rename');
		pathRenameBtn.addEventListener('click', () => this.batchPathRename());

		// 重复检测按钮
		const duplicateBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
		duplicateBtn.setAttribute('id', 'duplicate-btn');
		this.updateButtonIndicator(duplicateBtn, 'duplicate');
		duplicateBtn.addEventListener('click', () => this.showDuplicates());

		// 空链接按钮
		const brokenLinksBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
		brokenLinksBtn.setAttribute('id', 'broken-links-btn');
		this.updateButtonIndicator(brokenLinksBtn, 'broken-links');
		brokenLinksBtn.addEventListener('click', () => this.showBrokenLinks());

		// 链接转换按钮
		const linkFormatBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
		linkFormatBtn.setAttribute('id', 'link-format-btn');
		this.updateButtonIndicator(linkFormatBtn, 'link-format');
		linkFormatBtn.addEventListener('click', () => this.showLinkFormatModal());

		// 库统计按钮
		const statsBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
		statsBtn.setAttribute('id', 'stats-btn');
		this.updateButtonIndicator(statsBtn, 'stats');
		statsBtn.addEventListener('click', () => this.showImageInfo());

		// 回收站按钮（仅在启用插件回收站时显示）
		if (this.plugin.settings.enablePluginTrash) {
			const trashBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
			trashBtn.setAttribute('id', 'trash-btn');
			trashBtn.innerHTML = '<span class="icon">🗑️</span><span class="btn-text">回收站</span>';
			trashBtn.addEventListener('click', () => this.showTrash());
		}

		// 设置按钮
		const settingsBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
		settingsBtn.setAttribute('id', 'settings-btn');
		this.updateButtonIndicator(settingsBtn, 'settings');
		settingsBtn.addEventListener('click', () => this.openSettings());

		// 刷新按钮（刷新分组、筛选、搜索等）
		const refreshBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
		refreshBtn.setAttribute('id', 'refresh-btn');
		refreshBtn.innerHTML = '<span class="icon">🔄</span><span class="btn-text">刷新</span>';
		refreshBtn.title = '刷新显示（重新应用分组、筛选、搜索等）';
		const view = this;
		refreshBtn.addEventListener('click', async () => {
			
			// 重新扫描图片（会重新加载所有元数据，包括锁定状态、引用状态等）
			await view.scanImages();
			
			// 清理无效的分组数据
			view.cleanupInvalidGroupPaths();
			
			// 重新应用分组到图片
			view.images.forEach(img => { img.group = undefined; });
			Object.entries(view.plugin.data.imageGroups || {}).forEach(([name, paths]: [string, any]) => {
				(paths as string[]).forEach(p => {
					const img = view.images.find(i => i.path === p);
					if (img) img.group = name;
				});
			});
			
			// 应用锁定分组（如果启用）
			if (view.plugin.data.groupMeta?.['_lock_group']?.type === 'lock') {
				view.images.forEach(img => {
					const isLocked = view.isIgnoredFile(img.name, img.md5, img.path);
					img.group = isLocked ? '已锁定' : '未锁定';
				});
			}
			
			
			// 重新渲染UI（保留分组、筛选、搜索等状态）
			view.renderImageList();
			
			new Notice('已刷新');
		});

		// 合并的清除按钮（初始隐藏）
		const clearBtn = toolbarEl.createEl('button', { cls: 'toolbar-btn' });
		clearBtn.setAttribute('id', 'clear-btn');
		clearBtn.style.display = 'none';
		clearBtn.addEventListener('click', () => this.handleClearButtonClick());
		this.clearBtnElement = clearBtn;

		// 创建图片列表容器
		const listContainer = containerEl.createDiv('image-manager-list');
		this.contentEl = listContainer;

		// 初始化时扫描图片
		await this.scanImages();
		
		// 注册文件变化监听器，自动刷新
		this.setupFileWatcher();
		
		// 注册键盘快捷键
		this.setupKeyboardShortcuts();
		
		// 注册 Ctrl+滚轮调整每行显示数量
		this.setupWheelToChangeImagesPerRow();
		
		// 初始化拖拽框选功能
		this.setupDragSelect(listContainer);
		
		// 更新按钮提示状态
		const buttonIds = ['search-btn', 'sort-btn', 'filter-btn', 'group-btn', 'path-rename-btn', 'duplicate-btn', 'broken-links-btn', 'stats-btn', 'settings-btn'];
		const buttonTypes: Array<'search' | 'sort' | 'filter' | 'group' | 'path-rename' | 'duplicate' | 'broken-links' | 'stats' | 'settings'> = ['search', 'sort', 'filter', 'group', 'path-rename', 'duplicate', 'broken-links', 'stats', 'settings'];
		
		buttonIds.forEach((id, index) => {
			const btnEl = document.getElementById(id);
			if (btnEl) {
				this.updateButtonIndicator(btnEl as HTMLElement, buttonTypes[index]);
			}
		});
		
		// 更新清除按钮状态（检查是否有分组、筛选、排序等）
		this.updateClearButtonState();
	}
	
	// 设置文件监听器
	setupFileWatcher() {
		// 确保清理旧的监听器（如果存在）
		if (this.fileEventListener) {
			this.app.vault.off('create', this.fileEventListener);
			this.app.vault.off('modify', this.fileEventListener);
			this.app.vault.off('delete', this.fileEventListener);
		}
		if (this.renameEventListener) {
			this.app.vault.off('rename', this.renameEventListener);
		}
		
		// 注册 vault 文件变化事件（create, modify, delete）
		this.fileEventListener = (file: TFile) => {
			// 检查是否是图片文件
			const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
			if (imageExtensions.some(ext => file.path.toLowerCase().endsWith(ext))) {
				// 延迟刷新，避免频繁触发
				this.debouncedRefresh(TIMING.DEBOUNCE.FILE_CHANGE);
			}
		};
		
		// 注册文件重命名/移动事件（使用更长的延迟，因为rename通常是一系列操作的开始）
		this.renameEventListener = (file: TFile, oldPath: string) => {
			// 检查是否是图片文件
			const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
			if (imageExtensions.some(ext => file.path.toLowerCase().endsWith(ext))) {
				// 使用更长的延迟，避免在文件移动/重命名后立即扫描
				this.debouncedRefresh(TIMING.DEBOUNCE.FILE_RENAME);
			}
		};
		
		// 监听文件创建、修改、删除
		this.app.vault.on('create', this.fileEventListener);
		this.app.vault.on('modify', this.fileEventListener);
		this.app.vault.on('delete', this.fileEventListener);
		// 监听文件重命名/移动（使用单独的监听器，延迟更长）
		this.app.vault.on('rename', this.renameEventListener);
	}

	// 更新按钮提示
	updateButtonIndicator(btn: HTMLElement, type: 'search' | 'sort' | 'filter' | 'rename' | 'group' | 'path-rename' | 'duplicate' | 'broken-links' | 'link-format' | 'stats' | 'settings' | 'clear-selection' | 'clear-search') {
		let hasActiveFilter = false;
		
        if (type === 'search') {
			// 搜索按钮：有搜索关键词
			hasActiveFilter = this.searchQuery.trim() !== '';
		} else if (type === 'sort') {
			// 检查是否有非默认排序（多重排序）
			const defaultSortBy = this.plugin.settings.defaultSortBy;
			const defaultSortOrder = this.plugin.settings.defaultSortOrder;
			
			// 检查是否为默认排序（只有一个规则且与默认值一致）
			const isDefault = this.sortOptions.rules.length === 1 && 
							  this.sortOptions.rules[0].sortBy === defaultSortBy && 
							  this.sortOptions.rules[0].sortOrder === defaultSortOrder;
			
			hasActiveFilter = !isDefault;
		} else if (type === 'filter') {
			// 检查是否有非默认筛选
			const defaultFilterType = this.plugin.settings.defaultFilterType;
			
			// 检查大小筛选是否有值
			const hasSizeFilter = this.filterOptions.sizeFilter && 
								  (this.filterOptions.sizeFilter.min !== undefined || 
								   this.filterOptions.sizeFilter.max !== undefined);
			
			hasActiveFilter = this.filterOptions.filterType !== defaultFilterType ||
							  this.filterOptions.lockFilter !== undefined ||
							  this.filterOptions.referenceFilter !== undefined ||
							  hasSizeFilter ||
							  (this.filterOptions.nameFilter !== undefined && this.filterOptions.nameFilter.trim() !== '') ||
							  (this.filterOptions.folderFilter !== undefined && this.filterOptions.folderFilter.trim() !== '');
        } else if (type === 'group') {
            // 分组按钮：当存在任意分组时亮点
            const hasGroupsInData = !!(this.plugin.data && this.plugin.data.imageGroups && Object.keys(this.plugin.data.imageGroups).length > 0);
            const hasGroupsInMemory = this.images.some(img => !!img.group);
            hasActiveFilter = hasGroupsInData || hasGroupsInMemory;
        } else {
			// 其他按钮不需要显示绿点
			hasActiveFilter = false;
		}
		
		// 按钮配置
		const buttonConfigs: Record<string, { icon: string; text: string }> = {
			'search': { icon: '🔍', text: '搜索' },
			'sort': { icon: '↕️', text: '排序' },
			'filter': { icon: '🎯', text: '筛选' },
			'rename': { icon: '✏️', text: '重命名' },
			'group': { icon: '📂', text: '分组' },
			'path-rename': { icon: '🔠', text: '智能重命名' },
			'duplicate': { icon: '🔍', text: '重复检测' },
			'broken-links': { icon: '🈳', text: '空链接' },
			'link-format': { icon: '🔗', text: '链接转换' },
			'stats': { icon: '📊', text: '库统计' },
			'settings': { icon: '⚙️', text: '设置' },
			'clear-selection': { icon: '🧹', text: '清除选择' },
			'clear-search': { icon: '🧹', text: '清除搜索' }
		};
		
		const config = buttonConfigs[type];
		const indicator = hasActiveFilter ? '<span class="indicator">●</span>' : '';
		btn.innerHTML = `${indicator}<span class="icon">${config.icon}</span><span class="btn-text">${config.text}</span>`;
	}
	
	// 防抖的刷新函数
	private refreshTimeout: ReturnType<typeof setTimeout> | null = null;
	private debouncedRefresh = (delay: number = TIMING.DEBOUNCE.FILE_CHANGE) => {
		// 如果正在扫描，不触发新的扫描
		if (this.isScanning) {
			return;
		}
		
		if (this.refreshTimeout) {
			clearTimeout(this.refreshTimeout);
		}
		this.refreshTimeout = setTimeout(() => {
			// 再次检查是否正在扫描（可能在延迟期间已经开始扫描）
			if (!this.isScanning) {
				this.scanImages();
			}
		}, delay);
	}

	async scanImages() {
		// 如果正在扫描，直接返回
		if (this.isScanning) {
			return;
		}
		
		// 设置扫描标志
		this.isScanning = true;
		
		// 重置临时显示数量（每次扫描时恢复为默认值）
		// 这样即使视图没有关闭，重新扫描时也会恢复默认值
		this.tempImagesPerRow = null;
		
		this.images = [];
		this.renderedCount = 0;
		this.contentEl.empty();

		// 创建进度显示容器
		const progressContainer = this.contentEl.createDiv('scan-progress-container');
		progressContainer.style.cssText = `
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			padding: 40px 20px;
			gap: 16px;
		`;

		const statusText = progressContainer.createDiv('scan-status-text');
		statusText.style.cssText = `
			font-size: 1.1em;
			color: var(--text-normal);
			margin-bottom: 8px;
		`;

		const progressBarContainer = progressContainer.createDiv('scan-progress-bar-container');
		progressBarContainer.style.cssText = `
			width: 100%;
			max-width: 400px;
			height: 8px;
			background-color: var(--background-modifier-border);
			border-radius: 4px;
			overflow: hidden;
		`;

		const progressBar = progressBarContainer.createDiv('scan-progress-bar');
		progressBar.style.cssText = `
			height: 100%;
			background-color: var(--interactive-accent);
			width: 0%;
			transition: width 0.3s ease;
		`;

		const progressText = progressContainer.createDiv('scan-progress-text');
		progressText.style.cssText = `
			font-size: 0.9em;
			color: var(--text-muted);
			margin-top: 8px;
		`;

		try {
			// 使用新的扫描器
			const { ImageScanner } = await import('../utils/image-scanner');
			const scanner = new ImageScanner(this.app, this.app.vault, this.plugin);

			// 更新进度显示
			const updateProgress = (progress: { current: number; total: number; currentFile?: string; phase: 'scanning' | 'hashing' | 'complete' }) => {
				const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
				progressBar.style.width = `${percentage}%`;
				
				if (progress.phase === 'scanning') {
					statusText.textContent = '正在扫描图片文件...';
					progressText.textContent = `${progress.current} / ${progress.total} 个文件${progress.currentFile ? ` (${progress.currentFile})` : ''}`;
				} else if (progress.phase === 'hashing') {
					statusText.textContent = '正在计算哈希值...';
					progressText.textContent = `${progress.current} / ${progress.total} 张图片${progress.currentFile ? ` (${progress.currentFile})` : ''}`;
				} else {
					statusText.textContent = '扫描完成';
					progressText.textContent = '';
				}
			};

			// 执行扫描
			const result = await scanner.scanImages(
				updateProgress,
				this.plugin.settings.enableDeduplication
			);

			this.images = result.images;

			// 恢复分组信息并应用分组逻辑
			if (this.plugin.data.imageGroups) {
				Object.entries(this.plugin.data.imageGroups).forEach(([groupName, imagePaths]: [string, any]) => {
					imagePaths.forEach((imagePath: string) => {
						const image = this.images.find(img => img.path === imagePath);
						if (image) {
							image.group = groupName;
						}
					});
				});
			}
			
			// 应用完整的分组逻辑（包括排除回收站、处理锁定分组等）
			this.applyGroupsToImages();

			// 使用新日志系统记录扫描结果
			if (this.plugin?.logger) {
				await this.plugin.logger.info(
					OperationType.SCAN,
					`扫描图片完成: 共 ${result.images.length} 张${this.plugin.settings.enableDeduplication && result.duplicateCount > 0 ? `，发现 ${result.duplicateCount} 张重复` : ''}，唯一 ${result.uniqueCount} 张`,
					{
						details: {
							totalCount: result.images.length,
							uniqueCount: result.uniqueCount,
							duplicateCount: result.duplicateCount,
							totalSize: result.totalSize,
							enableDeduplication: this.plugin.settings.enableDeduplication || false
						}
					}
				);
			}

			// 清理无效缓存（后台执行，不阻塞）
			scanner.cleanupCache().catch(() => {
				// 清理失败不影响功能
			});

			progressContainer.remove();
			this.applySortAndFilter();
		} catch (error) {
			statusText.textContent = '扫描失败';
			progressText.textContent = String(error);
			
			// 记录错误日志
			if (this.plugin?.logger) {
				await this.plugin.logger.error(
					OperationType.SCAN,
					'扫描图片失败',
					{
						error: error as Error
					}
				);
			}
		} finally {
			// 重置扫描标志
			this.isScanning = false;
		}
	}

	applySortAndFilter() {
		// 先搜索
		let result = this.images;
		
		// 搜索（优先使用筛选项中的名称过滤）
		const nameQuery = this.filterOptions.nameFilter || this.searchQuery;
		if (nameQuery && nameQuery.trim()) {
			const query = nameQuery.toLowerCase().trim();
			result = result.filter(image => {
				// 文件名搜索
				const nameMatch = image.name.toLowerCase().includes(query);
				
				// MD5哈希值搜索
				const md5Match = image.md5 && image.md5.toLowerCase().includes(query);
				
				// 路径搜索（包含目录路径）
				const pathMatch = image.path.toLowerCase().includes(query);
				
				return nameMatch || md5Match || pathMatch;
			});
		}

		// 再筛选
		this.filteredImages = result.filter(image => {
			// 按文件类型筛选
			if (this.filterOptions.filterType !== 'all') {
				const ext = image.name.split('.').pop()?.toLowerCase();
				if (ext !== this.filterOptions.filterType && ext !== 'jpeg') {
					return false;
				}
				// jpeg也匹配jpg筛选
				if (this.filterOptions.filterType === 'jpg' && ext !== 'jpg' && ext !== 'jpeg') {
					return false;
				}
			}
			
			// 按锁定状态筛选
			if (this.filterOptions.lockFilter && this.filterOptions.lockFilter !== 'all') {
				const isIgnored = this.isIgnoredFile(image.name, image.md5, image.path);
				if (this.filterOptions.lockFilter === 'locked' && !isIgnored) {
					return false;
				}
				if (this.filterOptions.lockFilter === 'unlocked' && isIgnored) {
					return false;
				}
			}
			
			// 按引用状态筛选
			if (this.filterOptions.referenceFilter && this.filterOptions.referenceFilter !== 'all') {
				const isReferenced = this.isImageReferenced(image);
				if (this.filterOptions.referenceFilter === 'referenced' && !isReferenced) {
					return false;
				}
				if (this.filterOptions.referenceFilter === 'unreferenced' && isReferenced) {
					return false;
				}
			}
			
			// 按大小筛选（范围）
			if (this.filterOptions.sizeFilter) {
				const sizeMB = image.size / 1024 / 1024;
				const { min, max } = this.filterOptions.sizeFilter;
				
				// 检查最小值
				if (min !== undefined && sizeMB < min) {
					return false;
				}
				
				// 检查最大值
				if (max !== undefined && sizeMB > max) {
					return false;
				}
			}
			
			// 按文件夹筛选（支持多个文件夹，逗号分隔）
			if (this.filterOptions.folderFilter && this.filterOptions.folderFilter.trim()) {
				const folderFilterStr = this.filterOptions.folderFilter.trim();
				// 分割多个文件夹路径（支持逗号分隔）
				const folderPaths = folderFilterStr
					.split(',')
					.map(path => path.trim())
					.filter(path => path.length > 0);
				
				if (folderPaths.length > 0) {
					// 获取图片所在的文件夹路径（去掉文件名，只保留目录部分）
					const lastSlashIndex = image.path.lastIndexOf('/');
					const imageFolderPath = lastSlashIndex >= 0 ? image.path.substring(0, lastSlashIndex) : '';
					
					// 检查图片是否匹配任何一个文件夹
					let matched = false;
					
					for (const folderPath of folderPaths) {
						// 根目录筛选：只显示直接在根目录下的图片
						if (folderPath === '' || folderPath === '/') {
							if (imageFolderPath === '' || imageFolderPath === '/') {
								matched = true;
								break;
							}
						} else {
							// 文件夹筛选：匹配文件夹及其所有子文件夹
							// 精确匹配当前文件夹，或路径以该文件夹开头（子文件夹）
							if (imageFolderPath === folderPath || imageFolderPath.startsWith(folderPath + '/')) {
								matched = true;
								break;
							}
						}
					}
					
					if (!matched) {
						return false;
					}
				}
			}
			
			return true;
		});

		// 最后排序（支持多重排序）
		this.filteredImages.sort((a, b) => {
			for (const rule of this.sortOptions.rules) {
				let comparison = 0;

				switch (rule.sortBy) {
					case 'name':
						comparison = a.name.localeCompare(b.name);
						break;
					case 'size':
						comparison = a.size - b.size;
						break;
					case 'date':
						comparison = a.modified - b.modified;
						break;
					case 'dimensions':
						const areaA = (a.width || 0) * (a.height || 0);
						const areaB = (b.width || 0) * (b.height || 0);
						comparison = areaA - areaB;
						break;
					case 'locked':
						const aIgnored = this.isIgnoredFile(a.name, a.md5, a.path);
			const bIgnored = this.isIgnoredFile(b.name, b.md5, b.path);
						// 锁定的排在前面（true > false）
						comparison = (aIgnored ? 1 : 0) - (bIgnored ? 1 : 0);
						break;
				}

				const result = rule.sortOrder === 'asc' ? comparison : -comparison;
				
				// 如果当前排序规则已经有差异，返回结果
				if (result !== 0) {
					return result;
				}
				
				// 如果当前排序规则没有差异，继续使用下一个排序规则
			}
			
			return 0;
		});

		this.renderImageList();
	}

	openSearch() {
		const modal = new SearchModal(
			this.app, 
			this.searchQuery, 
			(query) => {
				this.searchQuery = query;
				this.addToOperationHistory('search');
				this.applySortAndFilter();
				this.updateButtonIndicator(document.getElementById('search-btn') as HTMLElement, 'search');
				
				// 更新清除按钮的显示状态和文本
				this.updateClearButtonState();
			},
			() => {
				// 清除搜索的回调
				this.clearSearch();
			}
		);
		modal.open();
	}

	openSort() {
		const modal = new SortModal(
			this.app, 
			this.sortOptions, 
			(options) => {
				this.sortOptions = options;
				this.addToOperationHistory('sort');
				this.applySortAndFilter();
				this.updateButtonIndicator(document.getElementById('sort-btn') as HTMLElement, 'sort');
				
				// 更新清除按钮的显示状态和文本
				this.updateClearButtonState();
			},
			this.plugin.settings.defaultSortBy,
			this.plugin.settings.defaultSortOrder,
			() => {
				// 清除排序的回调
				this.clearSort();
			}
		);
		modal.open();
	}

	openFilter() {
		const modal = new FilterModal(this.app, this.filterOptions, (options) => {
			this.filterOptions = options;
			this.addToOperationHistory('filter');
			this.applySortAndFilter();
			this.updateButtonIndicator(document.getElementById('filter-btn') as HTMLElement, 'filter');
			
			// 更新清除按钮的显示状态和文本
			this.updateClearButtonState();
		});
		modal.open();
	}

	renderImageList() {
		// 保存滚动位置
		const listContainer = this.contentEl.parentElement;
		const savedScrollTop = listContainer ? listContainer.scrollTop : 0;
		
		this.contentEl.empty();

		if (this.filteredImages.length === 0) {
			this.contentEl.createDiv({ text: '未找到图片文件' });
			return;
		}

		// 检查是否有分组的图片
		const groupedImages = this.filteredImages.filter(img => img.group);
		const ungroupedImages = this.filteredImages.filter(img => !img.group);
		const hasGroups = groupedImages.length > 0;

		// 首页不再显示统计文字

		// 如果有分组，按分组显示
		if (hasGroups) {
			// 获取所有分组
			const groups = Array.from(new Set(groupedImages.map(img => img.group!))).sort();

			// 重新组织图片列表：先显示分组图片，再显示未分组图片
			const reorganizedImages: ImageInfo[] = [];
			let currentIndex = 0;

			// 为每个分组渲染图片（保持 imageGroups 中的顺序）
			groups.forEach(groupName => {
				// 从 imageGroups 中获取该分组的图片路径列表（保持顺序）
				const groupPaths = (this.plugin.data.imageGroups?.[groupName] as string[]) || [];
				// 按照 imageGroups 中的顺序排序图片
				let groupImages = groupPaths
					.map(path => groupedImages.find(img => img.path === path && img.group === groupName))
					.filter((img): img is ImageInfo => img !== undefined);
				
				// 如果 imageGroups 中没有该分组或顺序不完整，则使用默认顺序补充
				const defaultGroupImages = groupedImages.filter(img => img.group === groupName);
				if (groupImages.length < defaultGroupImages.length) {
					// 添加未在 imageGroups 中的图片（保持原有顺序）
					const existingPaths = new Set(groupImages.map(img => img.path));
					const missingImages = defaultGroupImages.filter(img => !existingPaths.has(img.path));
					groupImages = groupImages.concat(missingImages);
				}
				
				// 添加到重组列表
				reorganizedImages.push(...groupImages);
				const startIndex = currentIndex;
				const endIndex = currentIndex + groupImages.length;
				
				// 创建分组容器
				const groupContainer = this.contentEl.createDiv('image-group-container');
				groupContainer.style.cssText = `
					margin-bottom: 24px;
					padding-bottom: 16px;
					border-bottom: 2px solid var(--background-modifier-border);
				`;

				// 分组标题
				const groupHeader = groupContainer.createDiv('image-group-header');
				groupHeader.style.cssText = `
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 8px;
					margin-bottom: 12px;
					padding: 8px 12px;
					background: var(--background-secondary);
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.2s ease;
				`;
				
                // 添加点击折叠/展开功能（持久化状态）
                if (!this.plugin.data.groupMeta) this.plugin.data.groupMeta = {};
                const storedCollapsed = this.plugin.data.groupMeta[groupName]?.collapsed === true;
                let isExpanded = !storedCollapsed;
				const galleryEl = groupContainer.createDiv('image-gallery');
				galleryEl.style.transition = 'all 0.3s ease';
                galleryEl.style.display = isExpanded ? 'flex' : 'none';
				// 根据设置决定是否统一卡片高度
				galleryEl.style.alignItems = this.plugin.settings.uniformCardHeight ? 'stretch' : 'flex-start';
				
				const groupLeft = groupHeader.createDiv('group-left');
				groupLeft.style.cssText = `
					display: flex;
					align-items: center;
					gap: 8px;
					flex: 1;
				`;
				
				const folderIcon = groupLeft.createSpan('group-folder-icon');
				folderIcon.innerHTML = '📂';
				folderIcon.style.fontSize = UI_SIZE.FOLDER_ICON.SIZE;
				
				// 展开/折叠图标
				const expandIcon = groupLeft.createSpan('expand-icon');
				expandIcon.innerHTML = '▼';
				expandIcon.style.cssText = `
					font-size: 12px;
					color: var(--text-muted);
					margin-right: 4px;
					transition: transform 0.2s ease;
				`;
				
				// 如果初始状态是折叠的，设置图标旋转
                if (!isExpanded) {
                    expandIcon.style.transform = 'rotate(-90deg)';
                }
				
				const groupTitle = groupLeft.createEl('h3', { text: groupName });
				groupTitle.style.cssText = `
					margin: 0;
					font-size: 1.1em;
					font-weight: 600;
				`;
				
				const groupCount = groupLeft.createSpan({ text: `${groupImages.length} 张` });
				groupCount.style.cssText = `
					color: var(--text-muted);
					font-size: 0.9em;
				`;
				
				// 分组操作按钮
				const groupActions = groupHeader.createDiv('group-actions');
				groupActions.style.cssText = `
					display: flex;
					gap: 4px;
					align-items: center;
				`;
				
                // 取消分组按钮（对所有分组都显示，包括动态分组）
				const ungroupBtn = groupActions.createEl('button', { cls: 'group-action-btn', title: '取消分组' });
				ungroupBtn.innerHTML = '✕';
				ungroupBtn.style.cssText = `
					padding: 4px 8px;
					border: none;
					border-radius: 4px;
					background: transparent;
					color: var(--text-muted);
					cursor: pointer;
					font-size: 16px;
					line-height: 1;
					transition: all 0.2s ease;
				`;
				ungroupBtn.addEventListener('mouseenter', () => {
					ungroupBtn.style.background = 'var(--background-modifier-hover)';
					ungroupBtn.style.color = 'var(--text-error)';
				});
				ungroupBtn.addEventListener('mouseleave', () => {
					ungroupBtn.style.background = 'transparent';
					ungroupBtn.style.color = 'var(--text-muted)';
				});
				ungroupBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					// 取消该分组
					await this.ungroupImages(groupName);
				});
				
				// 点击标题折叠/展开
                groupHeader.addEventListener('click', async () => {
					isExpanded = !isExpanded;
					if (isExpanded) {
						galleryEl.style.display = 'flex';
						expandIcon.style.transform = 'rotate(0deg)';
					} else {
						galleryEl.style.display = 'none';
						expandIcon.style.transform = 'rotate(-90deg)';
					}
                    // 保存折叠状态
                    if (!this.plugin.data.groupMeta) this.plugin.data.groupMeta = {};
                    if (!this.plugin.data.groupMeta[groupName]) this.plugin.data.groupMeta[groupName] = {};
                    this.plugin.data.groupMeta[groupName].collapsed = !isExpanded;
                    await this.plugin.saveData(this.plugin.data);
				});

				// 创建该分组的图片画廊（已经在上面创建）
				const itemsPerRow = this.getCurrentImagesPerRow();
				const itemWidth = calculateItemWidth(itemsPerRow, LIMITS.DEFAULTS.IMAGE_GAP);
				
				// 使用临时数组渲染
				const tempFiltered = [...reorganizedImages];
			// 标记分组元信息用于拖拽
			// 锁定分组（已锁定/未锁定）的类型从 _lock_group 获取
			let groupType = (this.plugin.data.groupMeta && this.plugin.data.groupMeta[groupName]?.type) || 'custom';
			if ((groupName === '已锁定' || groupName === '未锁定') && this.plugin.data.groupMeta?.['_lock_group']?.type === 'lock') {
				groupType = 'lock';
			}
			galleryEl.setAttribute('data-group-name', groupName);
			galleryEl.setAttribute('data-group-type', groupType);
			this.enableGroupDrop(galleryEl);
			this.renderBatch(galleryEl, startIndex, endIndex, itemWidth, tempFiltered);
				
				currentIndex = endIndex;
			});

			// 如果有未分组的图片，显示在最后
			if (ungroupedImages.length > 0) {
			const ungroupedContainer = this.contentEl.createDiv('image-group-container');
			const galleryEl = ungroupedContainer.createDiv('image-gallery');
			// 根据设置决定是否统一卡片高度
			galleryEl.style.alignItems = this.plugin.settings.uniformCardHeight ? 'stretch' : 'flex-start';
			galleryEl.setAttribute('data-group-name', '未分组');
			galleryEl.setAttribute('data-group-type', 'ungrouped');
			const itemsPerRow = this.getCurrentImagesPerRow();
			const itemWidth = calculateItemWidth(itemsPerRow, LIMITS.DEFAULTS.IMAGE_GAP);
				
				const startIndex = currentIndex;
				reorganizedImages.push(...ungroupedImages);
				this.renderBatch(galleryEl, startIndex, reorganizedImages.length, itemWidth, reorganizedImages);
				// 启用未分组区域的拖拽支持
				this.enableUngroupedDrop(galleryEl);
			}
		} else {
			// 没有分组，按原来的方式显示
			const galleryEl = this.contentEl.createDiv('image-gallery');
			// 根据设置决定是否统一卡片高度
			galleryEl.style.alignItems = this.plugin.settings.uniformCardHeight ? 'stretch' : 'flex-start';
			const itemsPerRow = this.getCurrentImagesPerRow();
			const itemWidth = calculateItemWidth(itemsPerRow, LIMITS.DEFAULTS.IMAGE_GAP);
			
			// 一次性渲染所有图片（取消懒加载限制）
			this.renderedCount = this.filteredImages.length;
			this.renderBatch(galleryEl, 0, this.renderedCount, itemWidth);
		}
		
		// 恢复滚动位置
		if (listContainer && savedScrollTop > 0) {
			// 使用 requestAnimationFrame 确保 DOM 已更新
			requestAnimationFrame(() => {
				if (listContainer) {
					listContainer.scrollTop = savedScrollTop;
				}
			});
		}
	}

    private isIgnoredFile(filename: string, md5?: string, filePath?: string): boolean {
        // 使用 LockListManager 进行检查（三要素匹配：文件名、哈希值、路径）
        if (this.plugin.lockListManager) {
            return this.plugin.lockListManager.isFileLockedByNameOrHash(filename, md5, filePath);
        }
        // 降级到直接检查 settings（兼容性）
        return isFileIgnored(filename, md5, this.plugin.settings.ignoredFiles, this.plugin.settings.ignoredHashes);
    }

	private getImageReferenceCount(image: ImageInfo): number {
		// 获取图片的引用数量
		const metadataCache = this.app.metadataCache;
		const allFiles = this.app.vault.getMarkdownFiles();
		
		let referenceCount = 0;
		
		for (const file of allFiles) {
			const cache = metadataCache.getFileCache(file);
			if (!cache) continue;
			
			// 检查 embeds
			if (cache.embeds) {
				for (const embed of cache.embeds) {
					const linkPath = metadataCache.getFirstLinkpathDest(embed.link, file.path)?.path;
					if (linkPath === image.path) {
						referenceCount++;
					}
				}
			}
			
			// 检查 links
			if (cache.links) {
				for (const link of cache.links) {
					const linkPath = metadataCache.getFirstLinkpathDest(link.link, file.path)?.path;
					if (linkPath === image.path) {
						referenceCount++;
					}
				}
			}
		}
		
		return referenceCount;
	}

	private isImageReferenced(image: ImageInfo): boolean {
		// 从缓存中获取
		if (this.referenceCache.has(image.path)) {
			return this.referenceCache.get(image.path)!;
		}
		
		// 同步检查引用（简化版，检查metadata cache）
		const metadataCache = this.app.metadataCache;
		const allFiles = this.app.vault.getMarkdownFiles();
		
		let isReferenced = false;
		
		for (const file of allFiles) {
			const cache = metadataCache.getFileCache(file);
			if (!cache) continue;
			
			// 检查 embeds
			if (cache.embeds) {
				for (const embed of cache.embeds) {
					const linkPath = metadataCache.getFirstLinkpathDest(embed.link, file.path)?.path;
					if (linkPath === image.path) {
						isReferenced = true;
						break;
					}
				}
			}
			
			// 检查 links
			if (!isReferenced && cache.links) {
				for (const link of cache.links) {
					const linkPath = metadataCache.getFirstLinkpathDest(link.link, file.path)?.path;
					if (linkPath === image.path) {
						isReferenced = true;
						break;
					}
				}
			}
			
			if (isReferenced) break;
		}
		
		// 存入缓存
		this.referenceCache.set(image.path, isReferenced);
		
		return isReferenced;
	}

	private renderBatch(container: HTMLElement, start: number, end: number, itemWidth: string, images?: ImageInfo[]) {
		const imageList = images || this.filteredImages;
		
		// 使用 DocumentFragment 批量创建 DOM 元素，提升性能
		const fragment = document.createDocumentFragment();
		
		for (let i = start; i < end; i++) {
			const image = imageList[i];
			const itemEl = document.createElement('div');
			itemEl.className = 'image-gallery-item';
			itemEl.style.width = itemWidth;
			// 存储图片路径，用于选择功能
			itemEl.setAttribute('data-image-path', image.path);
			// 启用拖拽
			itemEl.draggable = true;
			itemEl.addEventListener('dragstart', (e) => {
				const dragEvent = e as DragEvent;
				if (dragEvent.dataTransfer) {
					dragEvent.dataTransfer.setData('text/plain', image.path);
					dragEvent.dataTransfer.effectAllowed = 'move';
				}
				// 添加拖拽样式
				itemEl.classList.add('dragging');
				itemEl.style.opacity = '0.5';
				itemEl.style.cursor = 'grabbing';
			});
			itemEl.addEventListener('dragend', () => {
				// 移除拖拽样式
				itemEl.classList.remove('dragging');
				itemEl.style.opacity = '1';
				itemEl.style.cursor = '';
			});
			
			// 检查是否为锁定文件（不再显示红色边框）
			const isIgnored = this.isIgnoredFile(image.name, image.md5, image.path);
			
			// 图片预览 - 使用延迟加载
			const previewEl = itemEl.createDiv('image-preview');
			previewEl.style.width = '100%';
			previewEl.style.backgroundColor = 'var(--background-secondary)';
			// 纯净画廊模式下，预览区域覆盖整个卡片（包括底部圆角）
			previewEl.style.borderRadius = this.plugin.settings.pureGallery ? '6px' : '6px 6px 0 0';
			previewEl.style.position = 'relative';
			previewEl.style.overflow = 'hidden';
			previewEl.style.cursor = 'pointer';
			previewEl.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
			previewEl.style.marginBottom = '0';
			
			// 添加悬停效果（Notion 风格）
			itemEl.addEventListener('mouseenter', () => {
				previewEl.style.transform = 'translateY(-2px)';
				previewEl.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
			});
			itemEl.addEventListener('mouseleave', () => {
				previewEl.style.transform = 'translateY(0)';
				previewEl.style.boxShadow = 'none';
			});

			// 选择复选框（右上角）
			const selectCheckbox = previewEl.createEl('input');
			selectCheckbox.type = 'checkbox';
			selectCheckbox.className = 'image-select-checkbox';
			// 纯净画廊模式下隐藏选择框
			if (!this.plugin.settings.pureGallery) {
				selectCheckbox.style.position = 'absolute';
				selectCheckbox.style.top = UI_SIZE.CHECKBOX.TOP;
				selectCheckbox.style.right = UI_SIZE.CHECKBOX.RIGHT;
				selectCheckbox.style.zIndex = '2';
				selectCheckbox.style.width = UI_SIZE.CHECKBOX.SIZE;
				selectCheckbox.style.height = UI_SIZE.CHECKBOX.SIZE;
				selectCheckbox.style.cursor = 'pointer';
				selectCheckbox.style.appearance = 'none';
				selectCheckbox.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
				selectCheckbox.style.border = '2px solid rgba(255, 255, 255, 0.8)';
				selectCheckbox.style.borderRadius = UI_SIZE.BORDER_RADIUS.SM;
				selectCheckbox.style.transition = 'all 0.2s ease';
			} else {
				selectCheckbox.style.display = 'none';
			}
			
			// 移除悬停效果，保持颜色始终一致
			
			selectCheckbox.addEventListener('click', (e) => {
				e.stopPropagation();
				if (selectCheckbox.checked) {
					itemEl.classList.add('selected');
					// 选中状态样式（仅在非纯净画廊模式下更新）
					if (!this.plugin.settings.pureGallery) {
						selectCheckbox.style.backgroundColor = 'var(--interactive-accent)';
						selectCheckbox.style.borderColor = 'var(--interactive-accent)';
						// 添加对勾
						selectCheckbox.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3E%3Cpath fill=\'white\' d=\'M13.5 3L6 10.5 2.5 7l-1 1L6 12.5 14.5 4z\'/%3E%3C/svg%3E")';
						selectCheckbox.style.backgroundSize = 'contain';
					}
				} else {
					itemEl.classList.remove('selected');
					// 未选中状态样式（仅在非纯净画廊模式下更新）
					if (!this.plugin.settings.pureGallery) {
						selectCheckbox.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
						selectCheckbox.style.borderColor = 'rgba(255, 255, 255, 0.8)';
						selectCheckbox.style.backgroundImage = 'none';
					}
				}
				// 更新清除选择按钮
				this.updateClearSelectionButton();
			});
			
			// 根据设置决定是固定高度还是自适应
			if (this.plugin.settings.adaptiveImageSize) {
				// 自适应模式：图片按原始宽高比显示
				// 不设置默认宽高比，等待图片加载后根据实际尺寸设置
				previewEl.style.height = 'auto';
				previewEl.style.minHeight = '0'; // 移除最小高度限制，完全自适应
				previewEl.style.maxHeight = UI_SIZE.IMAGE_PREVIEW.ADAPTIVE_MAX_HEIGHT;
			} else {
				// 固定高度模式
				previewEl.style.height = UI_SIZE.IMAGE_PREVIEW.FIXED_HEIGHT;
			}
			
			// 延迟加载图片
			const abstractFile = this.app.vault.getAbstractFileByPath(image.path);
			const imgFile = abstractFile instanceof TFile ? abstractFile : null;
			if (imgFile) {
				const imageUrl = this.app.vault.getResourcePath(imgFile);
				if (imageUrl) {
					const img = new Image();
					img.onload = () => {
						if (this.plugin.settings.adaptiveImageSize) {
							// 自适应模式：使用 contain 保持完整图片
							previewEl.style.backgroundImage = `url(${imageUrl})`;
							previewEl.style.backgroundSize = 'contain';
							previewEl.style.backgroundPosition = 'center';
							previewEl.style.backgroundRepeat = 'no-repeat';
							
							// 根据实际图片尺寸计算合适的宽高比
							if (image.width && image.height) {
								const aspectRatio = image.width / image.height;
								previewEl.style.setProperty('aspect-ratio', `${aspectRatio}`);
								previewEl.style.minHeight = '0'; // 移除最小高度限制，完全根据宽高比自适应
							} else {
								// 如果没有尺寸信息，使用默认宽高比，但保持 minHeight 为 0
								previewEl.style.minHeight = '0';
							}
						} else {
							// 固定高度模式：使用 cover 填充
							previewEl.style.backgroundImage = `url(${imageUrl})`;
							previewEl.style.backgroundSize = 'cover';
							previewEl.style.backgroundPosition = 'center';
						}
					};
					img.onerror = () => {
						// 图片加载失败时显示错误提示
						previewEl.style.backgroundImage = 'none';
						previewEl.style.display = 'flex';
						previewEl.style.alignItems = 'center';
						previewEl.style.justifyContent = 'center';
						previewEl.style.color = 'var(--text-muted)';
						previewEl.style.fontSize = '0.9em';
						previewEl.textContent = '图片加载失败';
						previewEl.title = `无法加载图片: ${image.name}`;
					};
					img.src = imageUrl;
				}
			}

			// 图片信息区域（放在图片下方，两行布局）- 纯净画廊模式下隐藏
			const infoEl = itemEl.createDiv('image-info');
			// 检查是否有任何内容需要显示
			const hasContent = !this.plugin.settings.pureGallery && (
				this.plugin.settings.showImageName ||
				this.plugin.settings.showImageSize ||
				this.plugin.settings.showImageDimensions ||
				(isIgnored && this.plugin.settings.showLockIcon) ||
				image.group
			);
			
			if (hasContent) {
				infoEl.style.padding = '6px 12px'; // 进一步减小上下padding，减少空白
				infoEl.style.background = STYLES.VARS.BACKGROUND_SECONDARY;
				infoEl.style.borderRadius = `0 0 ${UI_SIZE.BORDER_RADIUS.MD} ${UI_SIZE.BORDER_RADIUS.MD}`;
				infoEl.style.borderTop = `1px solid ${STYLES.VARS.BACKGROUND_MODIFIER_BORDER}`;
				infoEl.style.display = 'inline-flex'; // 改为 inline-flex，宽度和高度都自适应内容
				infoEl.style.flexDirection = 'column';
				infoEl.style.gap = '2px'; // 进一步减小间距，减少空白
				infoEl.style.width = '100%'; // 宽度占满
				infoEl.style.boxSizing = 'border-box'; // 确保padding包含在高度内
			} else {
				infoEl.style.display = 'none'; // 没有内容时完全隐藏，不留占位
			}
			
			// 第一行：文件名
			if (!this.plugin.settings.pureGallery && this.plugin.settings.showImageName) {
				const nameRow = infoEl.createDiv('name-row');
				nameRow.style.display = 'flex';
				nameRow.style.alignItems = 'center';
				nameRow.style.gap = '6px';
				nameRow.style.margin = '0'; // 移除默认margin
				nameRow.style.padding = '0'; // 移除默认padding
				nameRow.style.minHeight = '0'; // 移除最小高度

				// 文件名
				const nameEl = nameRow.createSpan('image-name');
				nameEl.textContent = image.name;
				nameEl.style.color = 'var(--text-normal)';
				nameEl.style.fontWeight = '500';
				nameEl.style.flex = '1';
				nameEl.style.margin = '0'; // 移除默认margin
				nameEl.style.padding = '0'; // 移除默认padding
				nameEl.style.lineHeight = '1.2'; // 减小行高，减少空白
				// 根据设置决定是否换行
				if (this.plugin.settings.imageNameWrap) {
					nameEl.style.wordBreak = 'break-word';
					nameEl.style.whiteSpace = 'normal';
				} else {
					nameEl.style.overflow = 'hidden';
					nameEl.style.textOverflow = 'ellipsis';
					nameEl.style.whiteSpace = 'nowrap';
				}
			}
			
			// 第二行：锁定图标 文件大小 尺寸 分组
			if (!this.plugin.settings.pureGallery && (this.plugin.settings.showImageSize || this.plugin.settings.showImageDimensions || (isIgnored && this.plugin.settings.showLockIcon) || image.group)) {
				const metaRow = infoEl.createDiv('meta-row');
				metaRow.style.display = 'flex';
				metaRow.style.alignItems = 'center';
				metaRow.style.flexWrap = 'wrap'; // 允许换行
				metaRow.style.gap = '6px';
				metaRow.style.fontSize = '0.85em'; // 使用相对单位，稍微小一点
				metaRow.style.color = 'var(--text-muted)';
				metaRow.style.marginTop = '2px'; 
				metaRow.style.minHeight = '0'; // 移除最小高度
				metaRow.style.lineHeight = '1.2'; // 减小行高
				
				// 锁定图标（放在最前面）
				// 只有锁定的图片才显示🔒，未锁定的不显示任何图标
				if (isIgnored && this.plugin.settings.showLockIcon) {
					const lockIcon = metaRow.createSpan('lock-icon');
					lockIcon.textContent = '🔒';
					lockIcon.style.fontSize = '12px';
					lockIcon.style.cursor = 'pointer';
					lockIcon.style.opacity = '0.7';
					lockIcon.style.flexShrink = '0';
					lockIcon.style.transition = 'all 0.2s ease';
					lockIcon.title = '点击解锁';
					
					// 添加悬停效果
					lockIcon.addEventListener('mouseenter', () => {
						lockIcon.style.opacity = '1';
						lockIcon.style.transform = 'scale(1.1)';
					});
					lockIcon.addEventListener('mouseleave', () => {
						lockIcon.style.opacity = '0.7';
						lockIcon.style.transform = 'scale(1)';
					});
					
					// 阻止点击事件冒泡
					lockIcon.addEventListener('click', async (e) => {
						e.stopPropagation();
						await this.removeFromIgnoredList(image.name);
					});
				}
				
				// 分组标签不再显示（分组标题已经显示了分组名称）

				// 文件大小
				if (this.plugin.settings.showImageSize) {
					const sizeEl = metaRow.createSpan('image-size');
					sizeEl.textContent = ImageProcessor.formatFileSize(image.size);
				}
				
				// 图片尺寸（完善显示）
				if (this.plugin.settings.showImageDimensions) {
					if (image.width && image.height) {
						const dimEl = metaRow.createSpan('image-dimensions');
						// 显示格式：宽度×高度（像素）
						dimEl.textContent = `${image.width}×${image.height}`;
						dimEl.title = `图片尺寸: ${image.width} × ${image.height} 像素`;
					} else {
						// 尺寸信息缺失时显示提示
						const dimEl = metaRow.createSpan('image-dimensions');
						dimEl.textContent = '尺寸未知';
						dimEl.style.opacity = '0.6';
						dimEl.style.fontStyle = 'italic';
						dimEl.title = '图片尺寸信息不可用';
					}
				}
			}
			
			// 单击仅选择/反选
			itemEl.addEventListener('click', (e) => {
				if ((e.target as HTMLElement).classList.contains('lock-icon')) return;
				const nowSelected = !itemEl.classList.contains('selected');
				if (nowSelected) {
					itemEl.classList.add('selected');
					selectCheckbox.checked = true;
					// 更新复选框样式（仅在非纯净画廊模式下）
					if (!this.plugin.settings.pureGallery) {
						selectCheckbox.style.backgroundColor = 'var(--interactive-accent)';
						selectCheckbox.style.borderColor = 'var(--interactive-accent)';
						selectCheckbox.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3E%3Cpath fill=\'white\' d=\'M13.5 3L6 10.5 2.5 7l-1 1L6 12.5 14.5 4z\'/%3E%3C/svg%3E")';
						selectCheckbox.style.backgroundSize = 'contain';
					}
				} else {
					itemEl.classList.remove('selected');
					selectCheckbox.checked = false;
					// 恢复复选框样式（仅在非纯净画廊模式下）
					if (!this.plugin.settings.pureGallery) {
						selectCheckbox.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
						selectCheckbox.style.borderColor = 'rgba(255, 255, 255, 0.8)';
						selectCheckbox.style.backgroundImage = 'none';
					}
				}
				// 更新清除选择按钮
				this.updateClearSelectionButton();
			});

			// 双击打开详情
			itemEl.addEventListener('dblclick', () => {
				this.openImageDetail(image);
			});
			
			// 将创建的元素添加到 fragment
			fragment.appendChild(itemEl);
		}
		
		// 一次性将所有元素添加到容器（大幅提升性能）
		container.appendChild(fragment);
	}

	/**
	 * 更新单个图片卡片的锁定状态显示
	 */
	updateImageCardLockStatus(imagePath: string) {
		// 查找对应的图片卡片
		const imageItems = this.contentEl.querySelectorAll('.image-gallery-item');
		for (const itemEl of Array.from(imageItems)) {
			const item = itemEl as HTMLElement;
			// 通过点击事件找到对应的图片（需要从事件或数据属性中获取路径）
			// 由于没有直接存储路径，我们需要通过图片信息区域来匹配
			const nameEl = item.querySelector('.image-name');
			if (nameEl) {
				const image = this.images.find(img => img.path === imagePath);
				if (image && nameEl.textContent === image.name) {
					// 找到对应的卡片，更新锁定状态
					const isIgnored = this.isIgnoredFile(image.name, image.md5, image.path);
					const metaRow = item.querySelector('.meta-row');
					
					if (metaRow) {
						// 查找现有的锁定图标
						const existingLockIcon = metaRow.querySelector('.lock-icon');
						
						// 如果应该显示锁定图标但不存在，则添加
						if (isIgnored && this.plugin.settings.showLockIcon && !existingLockIcon) {
							// 在 metaRow 的最前面插入锁定图标
							const lockIcon = document.createElement('span');
							lockIcon.className = 'lock-icon';
							lockIcon.textContent = '🔒';
							lockIcon.style.fontSize = '14px';
							lockIcon.style.cursor = 'pointer';
							lockIcon.style.opacity = '0.7';
							lockIcon.style.flexShrink = '0';
							lockIcon.style.transition = 'all 0.2s ease';
							lockIcon.title = '点击解锁';
							
							// 添加悬停效果
							lockIcon.addEventListener('mouseenter', () => {
								lockIcon.style.opacity = '1';
								lockIcon.style.transform = 'scale(1.1)';
							});
							lockIcon.addEventListener('mouseleave', () => {
								lockIcon.style.opacity = '0.7';
								lockIcon.style.transform = 'scale(1)';
							});
							
							// 阻止点击事件冒泡
							lockIcon.addEventListener('click', async (e) => {
								e.stopPropagation();
								await this.removeFromIgnoredList(image.name);
							});
							
							// 插入到 metaRow 的最前面
							metaRow.insertBefore(lockIcon, metaRow.firstChild);
						}
						// 如果不应该显示锁定图标但存在，则移除
						else if ((!isIgnored || !this.plugin.settings.showLockIcon) && existingLockIcon) {
							existingLockIcon.remove();
						}
						// 如果锁定图标已存在，更新其状态
						else if (existingLockIcon) {
							// 图标已存在，状态正确，无需更新
						}
					}
					// 如果没有 metaRow 但需要显示锁定图标，需要重新渲染信息区域
					else if (isIgnored && this.plugin.settings.showLockIcon) {
						// 这种情况比较复杂，需要重新渲染整个信息区域
						// 为了简化，我们只更新 metaRow 部分
						const infoEl = item.querySelector('.image-info');
						if (infoEl) {
							// 检查是否有其他内容需要显示
							const hasOtherContent = this.plugin.settings.showImageSize || this.plugin.settings.showImageDimensions || image.group;
							if (hasOtherContent) {
								// 创建 metaRow
								const metaRow = document.createElement('div');
								metaRow.className = 'meta-row';
								metaRow.style.display = 'flex';
								metaRow.style.alignItems = 'center';
								metaRow.style.flexWrap = 'wrap'; // 允许换行
								metaRow.style.gap = '6px';
								metaRow.style.fontSize = '0.85em';
								metaRow.style.color = 'var(--text-muted)';
								metaRow.style.marginTop = '2px';
								metaRow.style.minHeight = '0';
								metaRow.style.lineHeight = '1.2';
								
								// 添加锁定图标
								const lockIcon = document.createElement('span');
								lockIcon.className = 'lock-icon';
								lockIcon.textContent = '🔒';
								lockIcon.style.fontSize = '12px';
								lockIcon.style.cursor = 'pointer';
								lockIcon.style.opacity = '0.7';
								lockIcon.style.flexShrink = '0';
								lockIcon.style.transition = 'all 0.2s ease';
								lockIcon.title = '点击解锁';
								
								lockIcon.addEventListener('mouseenter', () => {
									lockIcon.style.opacity = '1';
									lockIcon.style.transform = 'scale(1.1)';
								});
								lockIcon.addEventListener('mouseleave', () => {
									lockIcon.style.opacity = '0.7';
									lockIcon.style.transform = 'scale(1)';
								});
								
								lockIcon.addEventListener('click', async (e) => {
									e.stopPropagation();
									await this.removeFromIgnoredList(image.name);
								});
								
								metaRow.appendChild(lockIcon);
								
								// 分组标签不再显示（分组标题已经显示了分组名称）

								// 添加其他内容（文件大小、尺寸等）
								if (this.plugin.settings.showImageSize) {
									const sizeEl = document.createElement('span');
									sizeEl.className = 'image-size';
									sizeEl.textContent = ImageProcessor.formatFileSize(image.size);
									metaRow.appendChild(sizeEl);
								}
								
								if (this.plugin.settings.showImageDimensions) {
									if (image.width && image.height) {
										const dimEl = document.createElement('span');
										dimEl.className = 'image-dimensions';
										dimEl.textContent = `${image.width}×${image.height}`;
										dimEl.title = `图片尺寸: ${image.width} × ${image.height} 像素`;
										metaRow.appendChild(dimEl);
									}
								}
								
								// 插入到 infoEl 中（在 name-row 之后）
								const nameRow = infoEl.querySelector('.name-row');
								if (nameRow) {
									nameRow.insertAdjacentElement('afterend', metaRow);
								} else {
									infoEl.insertBefore(metaRow, infoEl.firstChild);
								}
							}
						}
					}
					
					break; // 找到后退出循环
				}
			}
		}
	}

	private debounce(func: Function, wait: number): EventListener {
		let timeout: NodeJS.Timeout;
		return function(this: any, ...args: any[]) {
			clearTimeout(timeout);
			timeout = setTimeout(() => func.apply(this, args), wait);
		};
	}

	async batchRename() {
		// 使用 containerEl 查询所有选中的图片（包括分组中的）
		const selectedImages = this.getSelectedImages();
		if (selectedImages.length === 0) {
			new Notice('请先选择要重命名的图片');
			return;
		}

		const modal = new RenameModal(this.app, async (pattern: string) => {
			await ImageProcessor.batchRename(selectedImages, this.app.vault, pattern);
			// 重新扫描图片
			await this.scanImages();
		});
		modal.open();
	}

    async groupImages() {
        const counts = {
            selected: this.getSelectedImages().length,
            filtered: this.filteredImages.length,
            total: this.images.length
        };
        
        // 获取当前的分组模式
        let currentGroupMode: 'folder' | 'type' | 'reference' | 'lock' | 'custom' | null = null;
        
        // 优先检查是否有其他分组（静态分组）
        if (this.plugin.data.imageGroups && Object.keys(this.plugin.data.imageGroups).length > 0) {
            // 从第一个分组的元数据获取类型
            const firstGroupName = Object.keys(this.plugin.data.imageGroups)[0];
            const groupType = this.plugin.data.groupMeta?.[firstGroupName]?.type;
            if (groupType === 'folder' || groupType === 'type' || groupType === 'reference' || groupType === 'custom') {
                currentGroupMode = groupType;
            }
        } else if (this.plugin.data.groupMeta?.['_lock_group']?.type === 'lock') {
            // 只有当没有其他分组时，才检查锁定分组
            currentGroupMode = 'lock';
        }
        
        const modal = new GroupModal(this.app, counts, async (options: any) => {
            // 重置：清除所有分组并刷新
            if (options.action === 'reset') {
                this.images.forEach(img => { img.group = undefined; });
                this.filteredImages.forEach(img => { img.group = undefined; });
                // 清除分组数据
                if (this.plugin.data.imageGroups) this.plugin.data.imageGroups = {};
                // 清除分组元数据（包括 _lock_group 等动态分组标记）
                if (this.plugin.data.groupMeta) this.plugin.data.groupMeta = {};
                await this.plugin.saveData(this.plugin.data);
                this.renderImageList();
                // 更新分组按钮绿点
                const groupBtn = document.getElementById('group-btn') as HTMLElement;
                if (groupBtn) this.updateButtonIndicator(groupBtn, 'group');
                // 更新清除按钮状态
                this.updateClearButtonState();
                new Notice('已清除所有分组');
                return;
            }
            const targetImages: ImageInfo[] = 
                options.scope === 'selected' ? this.getSelectedImages() :
                options.scope === 'all' ? this.images :
                this.filteredImages;
            if (!targetImages || targetImages.length === 0) {
                new Notice('没有可分组的图片');
                return;
            }

            if (!this.plugin.data.imageGroups) this.plugin.data.imageGroups = {};
            if (!this.plugin.data.groupMeta) this.plugin.data.groupMeta = {};

            const writeGroups = (groupMap: Map<string, string[]>, noticeText: string, type: string) => {
                groupMap.forEach((paths, name) => {
                    if (this.plugin.data.imageGroups) {
                        this.plugin.data.imageGroups[name] = paths;
                    }
                    if (!this.plugin.data.groupMeta) this.plugin.data.groupMeta = {};
                    if (!this.plugin.data.groupMeta[name]) this.plugin.data.groupMeta[name] = {};
                    this.plugin.data.groupMeta[name].type = type;
                });
                return noticeText;
            }

            let notice = '';
            if (options.mode === 'folder') {
                // 清空旧的分组数据
                this.plugin.data.imageGroups = {};
                const map = new Map<string, string[]>();
                targetImages.forEach(img => {
                    const folderPath = img.path.substring(0, img.path.lastIndexOf('/'));
                    let display = folderPath || '根目录';
                    if (display.startsWith('/')) display = display.substring(1);
                    if (!map.has(display)) map.set(display, []);
                    const displayPaths = map.get(display);
                    if (displayPaths) {
                        displayPaths.push(img.path);
                    }
                });
                notice = writeGroups(map, `已按位置创建 ${map.size} 个分组`, 'folder');
            } else if (options.mode === 'type') {
                // 清空旧的分组数据
                this.plugin.data.imageGroups = {};
                const map = new Map<string, string[]>();
                targetImages.forEach(img => {
                    const ext = (img.name.split('.').pop() || '').toUpperCase() || '未知类型';
                    if (!map.has(ext)) map.set(ext, []);
                    const extPaths = map.get(ext);
                    if (extPaths) {
                        extPaths.push(img.path);
                    }
                });
                notice = writeGroups(map, '已按类型创建分组', 'type');
            } else if (options.mode === 'reference') {
                // 清空旧的分组数据
                this.plugin.data.imageGroups = {};
                const map = new Map<string, string[]>();
                targetImages.forEach(img => {
                    // 按引用数量分组
                    const refCount = this.getImageReferenceCount(img);
                    const key = refCount === 0 ? '未被引用' : `被引用 (${refCount}次)`;
                    if (!map.has(key)) map.set(key, []);
                    const refPaths = map.get(key);
                    if (refPaths) {
                        refPaths.push(img.path);
                    }
                });
                notice = writeGroups(map, `已按引用数量创建 ${map.size} 个分组`, 'reference');
            } else if (options.mode === 'lock') {
                // 锁定分组不保存到 imageGroups，只标记为 'lock' 类型
                // 在渲染时动态从锁定列表获取
                // 清空 imageGroups，因为锁定分组是动态的
                this.plugin.data.imageGroups = {};
                if (!this.plugin.data.groupMeta) this.plugin.data.groupMeta = {};
                this.plugin.data.groupMeta['_lock_group'] = { type: 'lock' };
                notice = '已启用按锁定状态分组（动态）';
            } else if (options.mode === 'custom') {
                const name = options.name as string;
                // 仅添加未分组的图片
                const ungrouped = targetImages.filter(i => !i.group);
                if (ungrouped.length === 0) {
                    notice = `没有可添加到 "${name}" 的未分组图片`;
                } else {
                    const existing = new Set<string>((this.plugin.data.imageGroups[name] || []) as string[]);
                    const merged = [...existing];
                    ungrouped.forEach(i => { if (!existing.has(i.path)) merged.push(i.path); });
                    this.plugin.data.imageGroups[name] = merged;
                    if (!this.plugin.data.groupMeta) this.plugin.data.groupMeta = {};
                    if (!this.plugin.data.groupMeta[name]) this.plugin.data.groupMeta[name] = {};
                    this.plugin.data.groupMeta[name].type = 'custom';
                    notice = `已将 ${ungrouped.length} 张未分组图片添加到 "${name}"`;
                }
            }

            await this.plugin.saveData(this.plugin.data);
            this.applyGroupsToImages();
            this.addToOperationHistory('group');
            this.renderImageList();
            if (notice) new Notice(notice);
            // 更新分组按钮绿点
            const groupBtn = document.getElementById('group-btn') as HTMLElement;
            if (groupBtn) this.updateButtonIndicator(groupBtn, 'group');
            // 更新清除按钮状态
            this.updateClearButtonState();
        }, currentGroupMode || undefined);
        modal.open();
    }

    private applyGroupsToImages() {
        // 清理无效的分组数据
        this.cleanupInvalidGroupPaths();
        
        // 应用分组到图片（排除回收站中的图片）
        this.images.forEach(img => { img.group = undefined; });
        
        // 检查是否有其他分组（不包括锁定分组）
        const hasOtherGroups = this.plugin.data.imageGroups && Object.keys(this.plugin.data.imageGroups).length > 0;
        
        // 如果有其他分组，应用它们
        if (hasOtherGroups) {
            Object.entries(this.plugin.data.imageGroups || {}).forEach(([name, paths]: [string, any]) => {
                (paths as string[]).forEach(p => {
                    const img = this.images.find(i => i.path === p);
                    // 不对回收站中的图片应用分组
                    if (img && !img.path.startsWith('.trash')) {
                        img.group = name;
                    }
                });
            });
        } else if (this.plugin.data.groupMeta?.['_lock_group']?.type === 'lock') {
            // 只有当没有其他分组时，才应用锁定分组（动态分组）
            // 使用 LockListManager 检查锁定状态
            this.images.forEach(img => {
                // 不对回收站中的图片应用分组
                if (img.path.startsWith('.trash')) {
                    return;
                }
                
                // 使用 LockListManager 检查锁定状态（支持哈希值、文件名和路径）
                const isLocked = this.plugin.lockListManager 
                    ? this.plugin.lockListManager.isFileLockedByNameOrHash(img.name, img.md5, img.path)
                    : this.isIgnoredFile(img.name, img.md5, img.path);
                img.group = isLocked ? '已锁定' : '未锁定';
            });
        }
    }

	/**
	 * 清理无效的分组路径（已删除或移动的图片）
	 */
	private cleanupInvalidGroupPaths() {
		if (!this.plugin.data.imageGroups) return;
		
		const allImagePaths = new Set(this.images.map(img => img.path));
		let hasChanges = false;
		
		// 清理每个分组中的无效路径
		Object.keys(this.plugin.data.imageGroups).forEach(groupName => {
			const paths = this.plugin.data.imageGroups?.[groupName] as string[] | undefined;
			if (!paths) return;
			
			const validPaths = paths.filter(path => allImagePaths.has(path));
			
			if (validPaths.length !== paths.length) {
				hasChanges = true;
				if (validPaths.length === 0) {
					// 如果分组为空，删除该分组
					if (this.plugin.data.imageGroups) {
						delete this.plugin.data.imageGroups[groupName];
					}
					if (this.plugin.data.groupMeta && this.plugin.data.groupMeta[groupName]) {
						delete this.plugin.data.groupMeta[groupName];
					}
				} else {
					if (this.plugin.data.imageGroups) {
						this.plugin.data.imageGroups[groupName] = validPaths;
					}
				}
			}
		});
		
		// 如果有变化，保存数据
		if (hasChanges) {
			this.plugin.saveData(this.plugin.data).catch(async err => {
				await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '清理分组数据失败', {
					error: err as Error
				});
			});
		}
	}

	/**
	 * 更新分组数据（当图片移动或重命名时）
	 */
	private async updateGroupDataOnMove(oldPath: string, newPath: string) {
		if (!this.plugin.data.imageGroups) return;
		
		let hasChanges = false;
		
		// 遍历所有分组，更新路径
		Object.keys(this.plugin.data.imageGroups).forEach(groupName => {
			const paths = this.plugin.data.imageGroups?.[groupName] as string[] | undefined;
			if (!paths || !this.plugin.data.imageGroups) return;
			
			const index = paths.indexOf(oldPath);
			if (index !== -1) {
				paths[index] = newPath;
				hasChanges = true;
			}
		});
		
		// 如果有变化，保存数据
		if (hasChanges) {
			await this.plugin.saveData(this.plugin.data);
		}
	}

	async ungroupImages(groupName: string) {
		// 取消指定分组的所有图片的分组
		let ungroupedCount = 0;
		
		this.images.forEach(image => {
			if (image.group === groupName) {
				image.group = undefined;
				ungroupedCount++;
			}
		});

		// 从 imageGroups 中删除该分组（如果存在）
		if (this.plugin.data.imageGroups && this.plugin.data.imageGroups[groupName]) {
			delete this.plugin.data.imageGroups[groupName];
		}
		
		// 从 groupMeta 中删除该分组的元信息（包括动态分组如 _lock_group）
		if (this.plugin.data.groupMeta && this.plugin.data.groupMeta[groupName]) {
			delete this.plugin.data.groupMeta[groupName];
		}
		
		// 特殊处理：如果取消的是锁定分组，需要删除 _lock_group 标记
		if (groupName === '已锁定' || groupName === '未锁定') {
			if (this.plugin.data.groupMeta && this.plugin.data.groupMeta['_lock_group']) {
				delete this.plugin.data.groupMeta['_lock_group'];
			}
		}
		
		// 保存数据到插件存储
		await this.plugin.saveData(this.plugin.data);
		
		// 更新分组按钮绿点
		const groupBtn = document.getElementById('group-btn') as HTMLElement;
		if (groupBtn) this.updateButtonIndicator(groupBtn, 'group');
		
		new Notice(`已取消 ${ungroupedCount} 张图片的分组`);
		this.renderImageList();
	}

	/**
	 * 启用未分组区域的拖拽支持
	 */
	private enableUngroupedDrop(galleryEl: HTMLElement) {
		galleryEl.addEventListener('dragover', (e) => {
			e.preventDefault();
			const dragEvent = e as DragEvent;
			galleryEl.style.background = 'var(--background-modifier-hover)';
			if (dragEvent.dataTransfer) {
				dragEvent.dataTransfer.dropEffect = 'move';
			}
		});

		galleryEl.addEventListener('dragleave', (e) => {
			const relatedTarget = e.relatedTarget as HTMLElement;
			if (!galleryEl.contains(relatedTarget)) {
				galleryEl.style.background = '';
			}
		});

		galleryEl.addEventListener('drop', async (e) => {
			e.preventDefault();
			galleryEl.style.background = '';
			const dragEvent = e as DragEvent;
			const imagePath = dragEvent.dataTransfer?.getData('text/plain') || '';
			if (!imagePath) return;

			try {
				// 从所有分组中移除该图片
				if (this.plugin.data.imageGroups) {
					Object.keys(this.plugin.data.imageGroups).forEach(groupName => {
						const paths = this.plugin.data.imageGroups?.[groupName] as string[] | undefined;
						if (paths && this.plugin.data.imageGroups) {
							const filteredPaths = paths.filter(p => p !== imagePath);
							this.plugin.data.imageGroups[groupName] = filteredPaths;
							// 如果分组为空，删除该分组
							if (filteredPaths.length === 0) {
								delete this.plugin.data.imageGroups[groupName];
								if (this.plugin.data.groupMeta && this.plugin.data.groupMeta[groupName]) {
									delete this.plugin.data.groupMeta[groupName];
								}
							}
						}
					});
				}

				// 刷新界面
				await this.plugin.saveData(this.plugin.data);
				this.applyGroupsToImages();
				this.renderImageList();
				const groupBtn = document.getElementById('group-btn') as HTMLElement;
				if (groupBtn) this.updateButtonIndicator(groupBtn, 'group');
				new Notice('已移除分组');
			} catch (err) {
				await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '拖放到未分组区域失败', {
					error: err as Error
				});
			}
		});
	}

	private enableGroupDrop(galleryEl: HTMLElement) {
		let dragOverItem: HTMLElement | null = null;
		let insertIndicator: HTMLElement | null = null;

		// 创建插入指示器
		const createInsertIndicator = () => {
			if (insertIndicator) return insertIndicator;
			insertIndicator = document.createElement('div');
			insertIndicator.className = 'drag-insert-indicator';
			insertIndicator.style.cssText = `
				position: absolute;
				height: 2px;
				background: var(--interactive-accent);
				width: 100%;
				z-index: 1000;
				pointer-events: none;
				opacity: 0;
				transition: opacity 0.2s ease;
			`;
			return insertIndicator;
		};

		// 移除插入指示器
		const removeInsertIndicator = () => {
			if (insertIndicator && insertIndicator.parentElement) {
				insertIndicator.parentElement.removeChild(insertIndicator);
			}
			insertIndicator = null;
		};

		galleryEl.addEventListener('dragover', (e) => {
			e.preventDefault();
			const type = galleryEl.getAttribute('data-group-type') || 'custom';
			const dragEvent = e as DragEvent;
			
			// 支持 folder/custom/lock 类型
			if (type === 'folder' || type === 'custom' || type === 'lock') {
				galleryEl.style.background = 'var(--background-modifier-hover)';
				if (dragEvent.dataTransfer) {
					dragEvent.dataTransfer.dropEffect = 'move';
				}

				// 查找拖拽悬停的图片项（用于排序）
				const items = galleryEl.querySelectorAll('.image-gallery-item:not(.dragging)');
				let closestItem: HTMLElement | null = null;
				let closestOffset = Infinity;

				items.forEach((item) => {
					const rect = (item as HTMLElement).getBoundingClientRect();
					const itemMiddle = rect.top + rect.height / 2;
					const distance = Math.abs(dragEvent.clientY - itemMiddle);
					
					if (distance < closestOffset) {
						closestOffset = distance;
						closestItem = item as HTMLElement;
					}
				});

				// 显示插入指示器
				if (closestItem !== null && type !== 'lock') {
					// 锁定分组不需要排序，只显示背景高亮
					if (dragOverItem !== closestItem) {
						removeInsertIndicator();
						const indicator = createInsertIndicator();
						const rect = (closestItem as HTMLElement).getBoundingClientRect();
						const galleryRect = galleryEl.getBoundingClientRect();
						
						// 判断插入位置（上方或下方）
						const itemMiddle = rect.top + rect.height / 2;
						const insertBefore = dragEvent.clientY < itemMiddle;
						
						indicator.style.top = insertBefore 
							? `${rect.top - galleryRect.top - 1}px`
							: `${rect.bottom - galleryRect.top - 1}px`;
						
						galleryEl.appendChild(indicator);
						indicator.style.opacity = '1';
						dragOverItem = closestItem;
					}
				}
			} else {
				if (dragEvent.dataTransfer) {
					dragEvent.dataTransfer.dropEffect = 'none';
				}
			}
		});

		galleryEl.addEventListener('dragleave', (e) => {
			// 检查是否真的离开了容器
			const relatedTarget = e.relatedTarget as HTMLElement;
			if (!galleryEl.contains(relatedTarget)) {
				galleryEl.style.background = '';
				removeInsertIndicator();
				dragOverItem = null;
			}
		});

		galleryEl.addEventListener('drop', async (e) => {
			e.preventDefault();
			galleryEl.style.background = '';
			removeInsertIndicator();
			dragOverItem = null;

			const dragEvent = e as DragEvent;
			const imagePath = dragEvent.dataTransfer?.getData('text/plain') || '';
			if (!imagePath) return;

			const groupName = galleryEl.getAttribute('data-group-name') || '';
			const groupType = galleryEl.getAttribute('data-group-type') || 'custom';

			try {
				if (groupType === 'folder') {
					await this.moveImageToFolder(imagePath, groupName);
				} else if (groupType === 'custom') {
					// 检查是否需要排序
					const items = galleryEl.querySelectorAll('.image-gallery-item:not(.dragging)');
					let insertIndex = -1;
					
					// 查找插入位置
					items.forEach((item, index) => {
						const rect = (item as HTMLElement).getBoundingClientRect();
						const itemMiddle = rect.top + rect.height / 2;
						if (dragEvent.clientY < itemMiddle && insertIndex === -1) {
							insertIndex = index;
						}
					});

					await this.addImageToCustomGroup(imagePath, groupName, insertIndex);
				} else if (groupType === 'lock') {
					// 锁定/解锁功能
					await this.toggleImageLock(imagePath, groupName);
				}

				// 刷新界面和按钮指示
				await this.plugin.saveData(this.plugin.data);
				this.applyGroupsToImages();
				this.renderImageList();
				const groupBtn = document.getElementById('group-btn') as HTMLElement;
				if (groupBtn) this.updateButtonIndicator(groupBtn, 'group');
			} catch (err) {
				await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '拖放分组失败', {
					error: err as Error
				});
			}
		});
	}

	private normalizeFolderFromGroupName(groupName: string): string {
		if (groupName === '根目录') return '';
		return groupName || '';
	}

	private async moveImageToFolder(imagePath: string, targetGroupName: string) {
		const folderPath = this.normalizeFolderFromGroupName(targetGroupName);
		const abstractFile = this.app.vault.getAbstractFileByPath(imagePath);
		const file = abstractFile instanceof TFile ? abstractFile : null;
		if (!file) return;
		const fileName = file.name;
		const newDir = folderPath;
		const newPath = newDir ? `${newDir}/${fileName}` : fileName;
		// 已在目标路径则跳过
		const currentDir = imagePath.includes('/') ? imagePath.substring(0, imagePath.lastIndexOf('/')) : '';
		if ((currentDir || '') === (newDir || '')) return;
		// 确保目录存在
		if (newDir) {
			try { await this.app.vault.createFolder(newDir); } catch {}
		}
		// 先查找图片信息（用于日志记录）
		const image = this.images.find(img => img.path === imagePath);
		
		try {
			await this.app.vault.rename(file, newPath);
			// 使用新日志系统记录
			if (this.plugin?.logger && image) {
				await this.plugin.logger.info(
					OperationType.MOVE,
					`移动文件: ${imagePath} → ${newPath}`,
					{
						imageHash: image.md5,
						imagePath: newPath,
						imageName: fileName,
						details: { fromPath: imagePath, toPath: newPath }
					}
				);
			}
		} catch (e) {
			new Notice('移动文件失败，可能目标已存在');
			throw e;
		}
		
		// 更新 this.images 数组中图片的路径
		if (image) {
			image.path = newPath;
		}
		
		// 迁移历史记录（如果有）
		if (this.plugin.historyManager) {
			// 迁移旧路径的历史记录到新路径
			const oldHistory = this.plugin.historyManager.getHistory(imagePath);
			if (oldHistory.length > 0) {
				// 如果有历史记录，需要迁移
				await this.plugin.historyManager.migrateHistory(imagePath, newPath, fileName, fileName);
			}
			
			// 记录本次移动操作到历史
			await this.plugin.historyManager.saveHistory({
				timestamp: Date.now(),
				action: 'move',
				fromPath: imagePath,
				toPath: newPath,
				fromName: fileName,
				toName: fileName
			});
		}
		
		// 更新 imageGroups（从旧组移除，加入新组）
		if (!this.plugin.data.imageGroups) this.plugin.data.imageGroups = {};
		
		// 从所有分组中移除旧路径
		Object.keys(this.plugin.data.imageGroups).forEach(name => {
			const paths = this.plugin.data.imageGroups?.[name] as string[] | undefined;
			if (paths && this.plugin.data.imageGroups) {
				this.plugin.data.imageGroups[name] = paths.filter(p => p !== imagePath);
			}
		});
		
		// 添加到新分组
		if (!this.plugin.data.imageGroups[targetGroupName]) {
			this.plugin.data.imageGroups[targetGroupName] = [];
		}
		const targetPaths = this.plugin.data.imageGroups[targetGroupName] as string[];
		if (!targetPaths.includes(newPath)) {
			targetPaths.push(newPath);
		}
	}

	private async addImageToCustomGroup(imagePath: string, groupName: string, insertIndex?: number) {
		if (!this.plugin.data.imageGroups) this.plugin.data.imageGroups = {};
		let arr = (this.plugin.data.imageGroups[groupName] as string[]) || [];
		
		// 查找图片信息用于日志
		const image = this.images.find(img => img.path === imagePath);
		
		// 如果图片已在分组中，先移除
		const wasInGroup = arr.includes(imagePath);
		const oldIndex = wasInGroup ? arr.indexOf(imagePath) : -1;
		arr = arr.filter(p => p !== imagePath);
		
		// 如果指定了插入位置，在指定位置插入；否则添加到末尾
		if (insertIndex !== undefined && insertIndex >= 0 && insertIndex < arr.length) {
			arr.splice(insertIndex, 0, imagePath);
		} else {
			arr.push(imagePath);
		}
		
		this.plugin.data.imageGroups[groupName] = arr;
		if (!this.plugin.data.groupMeta) this.plugin.data.groupMeta = {};
		if (!this.plugin.data.groupMeta[groupName]) this.plugin.data.groupMeta[groupName] = {};
		this.plugin.data.groupMeta[groupName].type = 'custom';
        // 记录到最近自定义分组
        if (!this.plugin.data.customGroupNames) {
            this.plugin.data.customGroupNames = [];
        }
        const list = this.plugin.data.customGroupNames;
        if (groupName && !list.includes(groupName)) {
            list.unshift(groupName);
            if (list.length > LIMITS.HISTORY.MAX_CUSTOM_GROUPS) {
                list.length = LIMITS.HISTORY.MAX_CUSTOM_GROUPS;
            }
            await this.plugin.saveData(this.plugin.data);
        }
		
		// 记录日志
		if (this.plugin.logger && image) {
			await this.plugin.logger.info(
				OperationType.GROUP_UPDATE,
				`${wasInGroup ? '移动' : '添加'}图片到分组: ${groupName}`,
				{
					imageHash: image.md5,
					imagePath: imagePath,
					imageName: image.name,
					details: {
						groupName: groupName,
						action: wasInGroup ? 'moved' : 'added',
						oldIndex: wasInGroup ? oldIndex : undefined,
						newIndex: insertIndex !== undefined ? insertIndex : arr.length - 1,
						method: 'drag-drop'
					}
				}
			);
		}
	}

	/**
	 * 切换图片锁定状态（通过拖放到锁定分组）
	 */
	private async toggleImageLock(imagePath: string, groupName: string) {
		const image = this.images.find(img => img.path === imagePath);
		if (!image) {
			new Notice('找不到图片');
			return;
		}

		const isLocked = this.isIgnoredFile(image.name, image.md5, image.path);
		const shouldLock = groupName === '已锁定';

		// 如果状态相同，无需操作
		if (isLocked === shouldLock) {
			// 记录日志（即使状态相同，也记录操作尝试）
			if (this.plugin.logger) {
				await this.plugin.logger.debug(
					OperationType.LOCK,
					`图片已处于${shouldLock ? '锁定' : '解锁'}状态: ${image.name}`,
					{
						imageHash: image.md5,
						imagePath: imagePath,
						imageName: image.name,
						details: {
							currentState: isLocked ? 'locked' : 'unlocked',
							requestedState: shouldLock ? 'locked' : 'unlocked',
							action: 'no-op'
						}
					}
				);
			}
			return;
		}

		// 使用 LockListManager 统一管理锁定操作
		if (shouldLock) {
			// 锁定：通过 LockListManager 添加
			await this.plugin.lockListManager.addLockedFile(image.name, image.path, image.md5);
			
			// 记录日志
			if (this.plugin.logger) {
				await this.plugin.logger.info(
					OperationType.LOCK,
					`通过拖拽锁定文件: ${image.name}`,
					{
						imageHash: image.md5,
						imagePath: imagePath,
						imageName: image.name,
						details: {
							method: 'drag-drop',
							previousState: 'unlocked',
							newState: 'locked'
						}
					}
				);
			}
			
			new Notice(`🔒 已锁定: ${image.name}`);
		} else {
			// 解锁：通过 LockListManager 移除
			await this.plugin.lockListManager.removeLockedFile(image.name, image.md5, image.path);
			
			// 记录日志
			if (this.plugin.logger) {
				await this.plugin.logger.info(
					OperationType.UNLOCK,
					`通过拖拽解锁文件: ${image.name}`,
					{
						imageHash: image.md5,
						imagePath: imagePath,
						imageName: image.name,
						details: {
							method: 'drag-drop',
							previousState: 'locked',
							newState: 'unlocked'
						}
					}
				);
			}
			
			new Notice(`🔓 已解锁: ${image.name}`);
		}
	}

	showImageInfo() {
		// 显示整个笔记库的统计信息
		const modal = new StatsModal(this.app, this.images);
		modal.open();
	}

	showTrash() {
		// 打开回收站模态框
		const { TrashModal } = require('./trash-modal');
		const modal = new TrashModal(this.app, this.plugin);
		modal.open();
	}

	async showDuplicates() {
		// 打开重复图片检测模态框
		const modal = new DuplicateDetectionModal(
			this.app,
			this.images,
			(imagePath: string) => {
				// 删除后刷新图片列表
				this.scanImages();
			},
			this.plugin
		);
		modal.open();
	}

	async showBrokenLinks() {
		// 查找所有找不到链接的图片链接
		const brokenLinks = await this.findBrokenImageLinks();
		
		// 创建模态框显示错误链接
		const modal = new BrokenLinksModal(this.app, brokenLinks, this.plugin);
		modal.open();
	}


	openSettings() {
		// 使用 Obsidian 官方 API 打开插件的设置页面
		// @ts-ignore
		this.app.setting.open();
		// @ts-ignore
		this.app.setting.openTabById('imagemgr');
	}

	async findBrokenImageLinks(): Promise<Array<{filePath: string, lineNumber: number, linkText: string}>> {
		const brokenLinks: Array<{filePath: string, lineNumber: number, linkText: string}> = [];
		const allFiles = this.app.vault.getMarkdownFiles();
		const metadataCache = this.app.metadataCache;
		
		for (const file of allFiles) {
			try {
				const cache = metadataCache.getFileCache(file);
				if (!cache) continue;
				
				// 检查 embeds（图片嵌入）
				if (cache.embeds) {
					for (const embed of cache.embeds) {
						// 尝试解析链接目标
						const destFile = metadataCache.getFirstLinkpathDest(embed.link, file.path);
						if (!destFile) {
							// 找不到目标文件，记录错误链接
							const content = await this.app.vault.read(file);
							const lines = content.split('\n');
							const lineIndex = embed.position.start.line;
							const fullLine = lines[lineIndex];
							
							brokenLinks.push({
								filePath: file.path,
								lineNumber: lineIndex + 1,
								linkText: fullLine
							});
						}
					}
				}
				
				// 检查 links（普通链接，可能包含图片引用）
				if (cache.links) {
					for (const link of cache.links) {
						// 尝试解析链接目标
						const destFile = metadataCache.getFirstLinkpathDest(link.link, file.path);
						if (!destFile) {
							// 只检查图片文件扩展名的链接
							const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
							const linkLower = link.link.toLowerCase();
							
							if (imageExtensions.some(ext => linkLower.endsWith(ext))) {
								const content = await this.app.vault.read(file);
								const lines = content.split('\n');
								const lineIndex = link.position.start.line;
								const fullLine = lines[lineIndex];
								
								brokenLinks.push({
									filePath: file.path,
									lineNumber: lineIndex + 1,
									linkText: fullLine
								});
							}
						}
					}
				}
			} catch (error) {
				await this.plugin.logger.error(OperationType.PLUGIN_ERROR, `检查文件失败: ${file.path}`, {
					error: error as Error
				});
			}
		}
		
		return brokenLinks;
	}

	openImageDetail(image: ImageInfo) {
		const modal = new ImageDetailModal(this.app, image, this.app.vault, this.filteredImages, this.filteredImages.indexOf(image), this.plugin);
		modal.open();
	}

	getSelectedImages(): ImageInfo[] {
		// 获取所有选中的图片（包括分组中的）
		const selectedImages: ImageInfo[] = [];
		const selectedItems = this.containerEl.querySelectorAll('.image-gallery-item.selected');
		
		selectedItems.forEach((itemEl) => {
			// 优先使用 data-image-path 属性（更可靠）
			const imagePath = itemEl.getAttribute('data-image-path');
			if (imagePath) {
				const image = this.filteredImages.find(img => img.path === imagePath);
				if (image) {
					selectedImages.push(image);
					return;
				}
			}
			
			// 降级：使用 .image-name 元素的文本内容
			const imageName = itemEl.querySelector('.image-name')?.textContent;
			if (imageName) {
				const image = this.filteredImages.find(img => img.name === imageName);
				if (image) {
					selectedImages.push(image);
				}
			}
		});
		return selectedImages;
	}

	clearSelection() {
		// 取消所有选中的图片（包括分组中的）
		const selectedItems = this.containerEl.querySelectorAll('.image-gallery-item.selected');
		selectedItems.forEach((itemEl) => {
			itemEl.classList.remove('selected');
			const checkbox = itemEl.querySelector('.image-select-checkbox') as HTMLInputElement;
			if (checkbox) {
				checkbox.checked = false;
				// 恢复复选框样式
				checkbox.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
				checkbox.style.borderColor = 'rgba(255, 255, 255, 0.8)';
				checkbox.style.backgroundImage = 'none';
			}
		});
		
		// 隐藏清除选择按钮
		this.updateClearSelectionButton();
		
		new Notice('已清除选择');
	}

	// 更新清除选择按钮的显示状态
	updateClearSelectionButton() {
		const clearBtn = document.getElementById('clear-selection-btn');
		if (clearBtn) {
			const selectedCount = this.containerEl.querySelectorAll('.image-gallery-item.selected').length;
			if (selectedCount > 0) {
				clearBtn.style.display = '';
				clearBtn.title = `清除 ${selectedCount} 个选中项`;
			} else {
				clearBtn.style.display = 'none';
			}
		}
	}

	// 批量智能重命名
	async batchPathRename() {
		if (this.images.length === 0) {
			new Notice('没有可重命名的图片');
			return;
		}

		// 过滤掉忽略的文件
        const filteredImages = this.images.filter(img => !this.isIgnoredFile(img.name, img.md5, img.path));

		if (filteredImages.length === 0) {
			new Notice('🔒 所有图片都已锁定');
			return;
		}

		// 询问用户是否确认批量智能重命名
		const ignoredCount = this.images.length - filteredImages.length;
		const ignoredText = ignoredCount > 0 ? `\n\n已跳过 ${ignoredCount} 个锁定的文件。` : '';
		
		const shouldProceed = await ConfirmModal.show(
			this.app,
			'批量智能重命名',
			`将为 ${filteredImages.length} 张图片根据引用笔记进行智能重命名。\n\n此操作会修改所有图片的文件名，且会自动更新所有笔记中的引用链接。${ignoredText}\n\n是否继续？`,
			['继续', '取消']
		);

		if (shouldProceed !== 'save') {
			return;
		}

		// 预计算所有文件名，检查重名
		const nameMap = await this.precomputeFileNameMap(filteredImages);
		const duplicates = Array.from(nameMap.entries()).filter(([name, files]) => files.length > 1);
		
		// 处理重名冲突
		if (!await this.handleDuplicateNameConflicts(duplicates)) {
			return;
		}

		// 创建进度显示（如果启用）
		let progressContainer: HTMLElement | null = null;
		let progressBar: HTMLElement | null = null;
		let progressText: HTMLElement | null = null;
		let statusText: HTMLElement | null = null;
		
		if (this.plugin.settings.showBatchProgress) {
			progressContainer = this.contentEl.createDiv('batch-progress-container');
			progressContainer.style.cssText = `
				position: fixed;
				top: 50%;
				left: 50%;
				transform: translate(-50%, -50%);
				z-index: 10000;
				background: var(--background-primary);
				border: 2px solid var(--interactive-accent);
				border-radius: 8px;
				padding: 24px;
				min-width: 400px;
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
			`;
			
			statusText = progressContainer.createDiv('batch-status-text');
			statusText.style.cssText = `
				font-size: 1.1em;
				color: var(--text-normal);
				margin-bottom: 12px;
				font-weight: 500;
			`;
			statusText.textContent = '正在执行批量智能重命名...';
			
			const progressBarContainer = progressContainer.createDiv('batch-progress-bar-container');
			progressBarContainer.style.cssText = `
				width: 100%;
				height: 8px;
				background-color: var(--background-modifier-border);
				border-radius: 4px;
				overflow: hidden;
				margin-bottom: 8px;
			`;
			
			progressBar = progressBarContainer.createDiv('batch-progress-bar');
			progressBar.style.cssText = `
				height: 100%;
				background-color: var(--interactive-accent);
				width: 0%;
				transition: width 0.3s ease;
			`;
			
			progressText = progressContainer.createDiv('batch-progress-text');
			progressText.style.cssText = `
				font-size: 0.9em;
				color: var(--text-muted);
				text-align: center;
			`;
			progressText.textContent = `0 / ${filteredImages.length}`;
		}

		// 执行批量重命名
		const result = await this.executeBatchRename(
			filteredImages, 
			nameMap,
			(current: number, total: number, currentFile?: string) => {
				if (this.plugin.settings.showBatchProgress && progressBar && progressText && statusText) {
					const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
					progressBar.style.width = `${percentage}%`;
					progressText.textContent = `${current} / ${total}${currentFile ? ` (${currentFile})` : ''}`;
					if (current === total) {
						statusText.textContent = '批量重命名完成！';
					}
				}
			}
		);
		
		// 移除进度显示
		if (progressContainer) {
			setTimeout(() => {
				progressContainer?.remove();
			}, 1000);
		}
		
		// 生成批量重命名日志文件
		if (result.renameLog.length > 0 && this.plugin.settings.saveBatchRenameLog) {
			await this.saveBatchRenameLog(result.renameLog);
		}

		// 使用新日志系统记录批量操作
		if (this.plugin?.logger) {
			await this.plugin.logger.info(
				OperationType.BATCH_RENAME,
				`批量智能重命名完成: 成功${result.successCount}，失败${result.errorCount}，跳过${result.skipCount}`,
				{
					details: {
						total: this.images.length,
						successCount: result.successCount,
						skipCount: result.skipCount,
						errorCount: result.errorCount,
						updateCount: result.updateCount,
						logFile: this.plugin.settings.saveBatchRenameLog ? 'batch_rename_log.md' : null
					}
				}
			);
		}

		const skipText = result.skipCount > 0 ? `，跳过: ${result.skipCount}` : '';
		new Notice(
			`批量智能重命名完成！\n成功: ${result.successCount}，失败: ${result.errorCount}${skipText}，更新引用: ${result.updateCount} 个笔记`
		);

		// 刷新列表
		await this.scanImages();
	}

	/**
	 * 预计算文件名映射（用于检测重名）
	 */
	private async precomputeFileNameMap(images: ImageInfo[]): Promise<Map<string, ImageInfo[]>> {
		const nameMap = new Map<string, ImageInfo[]>();
		for (const image of images) {
			const newName = await this.calculateNewFileName(image);
			if (!newName) continue;
			
			if (!nameMap.has(newName)) {
				nameMap.set(newName, []);
			}
			nameMap.get(newName)!.push(image);
		}
		return nameMap;
	}

	/**
	 * 处理重名冲突
	 * @returns 是否继续执行重命名
	 */
	private async handleDuplicateNameConflicts(duplicates: Array<[string, ImageInfo[]]>): Promise<boolean> {
		if (duplicates.length === 0) {
			return true;
		}

		const handling = this.plugin.settings.duplicateNameHandling || 'prompt';
		
		if (handling === 'prompt') {
			const result = await ConfirmModal.show(
				this.app,
				'发现重名文件',
				`有 ${duplicates.length} 组文件会产生相同的文件名。是否继续重命名其他文件？`,
				['继续', '取消']
			);
			return result === 'save';
		}

		return true;
	}

	/**
	 * 执行批量重命名
	 */
	private async executeBatchRename(
		images: ImageInfo[],
		nameMap: Map<string, ImageInfo[]>,
		progressCallback?: (current: number, total: number, currentFile?: string) => void
	): Promise<{
		successCount: number;
		errorCount: number;
		skipCount: number;
		updateCount: number;
		renameLog: Array<{oldPath: string, newPath: string, oldName: string, newName: string, updatedRefs: number}>;
	}> {
		let successCount = 0;
		let errorCount = 0;
		let skipCount = 0;
		let updateCount = 0;
		const renameLog: Array<{oldPath: string, newPath: string, oldName: string, newName: string, updatedRefs: number}> = [];
		const processedFiles = new Set<string>();
		const total = images.length;
		let current = 0;
		
		for (const image of images) {
			current++;
			
			// 更新进度
			if (progressCallback) {
				progressCallback(current, total, image.name);
			}
			try {
				// 检查是否已处理（重名之一已处理）
				if (processedFiles.has(image.path)) {
					continue;
				}

				const newName = await this.calculateNewFileName(image);
				if (!newName) {
					skipCount++;
					continue;
				}

				// 处理重名：根据设置选择要处理的文件
				const targetImage = this.selectTargetImageForDuplicate(image, nameMap.get(newName));
				if (!targetImage) {
					skipCount++;
					continue;
				}

				// 如果选择了其他文件，跳过当前文件
				if (targetImage.path !== image.path) {
					skipCount++;
					// 标记重名组中的其他文件为已处理
					const duplicateFiles = nameMap.get(newName);
					if (duplicateFiles) {
						duplicateFiles.forEach(f => {
							if (f.path !== targetImage.path) {
								processedFiles.add(f.path);
							}
						});
					}
					continue;
				}

				// 应用智能重命名（在批量操作中禁用单个日志记录）
				const result = await this.applyPathNamingForImage(targetImage, true);
				if (result) {
					successCount++;
					updateCount += result.updatedRefs;
					if (result.logEntry) {
						renameLog.push(result.logEntry);
					}
				}
				
				processedFiles.add(image.path);
			} catch (error) {
				await this.plugin.logger.error(OperationType.RENAME, `智能重命名失败: ${image.path}`, {
					error: error as Error
				});
				errorCount++;
			}
		}

		return { successCount, errorCount, skipCount, updateCount, renameLog };
	}

	/**
	 * 从重名文件中选择目标文件（根据设置）
	 */
	private selectTargetImageForDuplicate(
		image: ImageInfo,
		duplicateFiles?: ImageInfo[]
	): ImageInfo | null {
		if (!duplicateFiles || duplicateFiles.length <= 1) {
			return image;
		}

		const handling = this.plugin.settings.duplicateNameHandling || 'prompt';
		
		if (handling === 'skip-silent') {
			return null; // 跳过所有重名文件
		}
		
		if (handling === 'use-newest') {
			return duplicateFiles.reduce((newest, current) => {
				return current.modified > newest.modified ? current : newest;
			});
		}
		
		if (handling === 'use-oldest') {
			return duplicateFiles.reduce((oldest, current) => {
				return current.modified < oldest.modified ? current : oldest;
			});
		}
		
		// 'prompt' 或其他情况：使用第一个（已经在 handleDuplicateNameConflicts 中处理）
		return image;
	}

	// 计算新的文件名（不执行重命名）
	async calculateNewFileName(image: ImageInfo): Promise<string | null> {
		const pathDepth = this.plugin.settings.pathNamingDepth || 3;
		const imagePath = image.path;
		const pathParts = imagePath.split('/').filter(p => p);
		const depth = Math.min(pathDepth, pathParts.length - 1);
		const pathSections = pathParts.slice(-depth - 1, -1);
		const pathPrefix = pathSections.join('_');
		
		const abstractFile = this.app.vault.getAbstractFileByPath(image.path);
		const file = abstractFile instanceof TFile ? abstractFile : null;
		if (!file) return null;
		
		const fileNameParts = image.name.split('.');
		const fileExtension = fileNameParts.length > 1 ? '.' + fileNameParts[fileNameParts.length - 1] : '';
		
		const directory = pathParts.slice(0, -1).join('/');
		const dir = this.app.vault.getAbstractFileByPath(directory);
		if (!dir || !('children' in dir)) return null;
		
		const baseName = pathPrefix || 'image';
		// dir 有 children 属性，说明是 TFolder
		const folder = dir as { children: Array<{ name: string }> };
		const existingFiles = Array.from(folder.children || []).filter((child) => {
			return child.name.startsWith(baseName + '_') && child.name.endsWith(fileExtension);
		});
		
		const nextNumber = this.getNextSequenceNumber(existingFiles.map((f: any) => f.name), baseName, fileExtension);
		return `${baseName}_${nextNumber}${fileExtension}`;
	}

	// 保存批量命名日志
	async saveBatchRenameLog(renameLog: Array<{oldPath: string, newPath: string, oldName: string, newName: string, updatedRefs: number}>) {
		try {
			const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
			let content = `# 批量智能重命名记录\n\n**时间**: ${timestamp}\n\n**共重命名**: ${renameLog.length} 张图片\n\n`;
			
			content += '## 重命名详情\n\n';
			
			for (const entry of renameLog) {
				content += `### ${entry.oldName}\n\n`;
				content += `- **原路径**: \`${entry.oldPath}\`\n`;
				content += `- **新路径**: \`${entry.newPath}\`\n`;
				content += `- **原名称**: \`${entry.oldName}\`\n`;
				content += `- **新名称**: \`${entry.newName}\`\n`;
				content += `- **更新引用**: ${entry.updatedRefs} 个笔记\n\n`;
			}
			
			// 生成文件名
			const filename = `批量智能重命名_${Date.now()}.md`;
			
			// 在根目录创建文件
			await this.app.vault.adapter.write(filename, content);
			
			await this.plugin.logger.info(OperationType.RENAME, `批量智能重命名日志已保存: ${filename}`);
			new Notice(`批量智能重命名日志已保存: ${filename}`);
		} catch (error) {
			await this.plugin.logger.error(OperationType.RENAME, '保存批量重命名日志失败', {
				error: error as Error
			});
			new Notice('保存批量重命名日志失败');
		}
	}

	// 为单张图片应用智能重命名（基于引用笔记的路径）
	async applyPathNamingForImage(image: ImageInfo, suppressLogging: boolean = false): Promise<{updatedRefs: number, logEntry?: {oldPath: string, newPath: string, oldName: string, newName: string, updatedRefs: number}} | null> {
		// 检查是否为锁定文件
		if (this.isIgnoredFile(image.name, image.md5, image.path)) {
			if (!suppressLogging) {
				await this.plugin.logger.debug(OperationType.RENAME, `图片 ${image.name} 已被锁定，跳过重命名`);
			}
			return null;
		}
		
		// 查找引用该图片的笔记
		const references = await this.findImageReferences(image.path);
		
		if (references.length === 0) {
			if (!suppressLogging) {
				await this.plugin.logger.debug(OperationType.RENAME, `图片 ${image.name} 未被引用，跳过`);
			}
			return null;
		}
		
		// 根据设置选择使用哪个笔记
		let selectedNote = references[0];
		
		if (references.length > 1) {
			const handling = this.plugin.settings.multipleReferencesHandling;
			
			if (handling === 'latest') {
				selectedNote = references.reduce((latest, current) => 
					current.file.stat.mtime > latest.file.stat.mtime ? current : latest
				);
			}
			// 'first'、'prompt' 或 'all'：批量操作中使用第一个
		}
		
		const pathDepth = this.plugin.settings.pathNamingDepth || 3;
		
		// 获取笔记的路径
		const notePath = selectedNote.file.path;
		const pathParts = notePath.split('/').filter(p => p);
		
		// 取最后N级路径（排除文件名）
		const depth = Math.min(pathDepth, pathParts.length - 1);
		const pathSections = pathParts.slice(-depth - 1, -1);
		
		// 拼接路径作为文件名前缀
		const pathPrefix = pathSections.join('_');
		
		// 获取图片在笔记中的序号
		const imageIndex = selectedNote.index + 1;
		
		// 获取文件扩展名
		const fileNameParts = image.name.split('.');
		const fileExtension = fileNameParts.length > 1 ? '.' + fileNameParts[fileNameParts.length - 1] : '';
		
		// 生成新文件名：笔记路径前缀_序号.扩展名
		const baseName = pathPrefix || selectedNote.file.basename;
		const newFileName = `${baseName}_${imageIndex}${fileExtension}`;
		
		// 获取文件对象
		const abstractFile = this.app.vault.getAbstractFileByPath(image.path);
		const file = abstractFile instanceof TFile ? abstractFile : null;
		if (!file) {
			return null;
		}
		
		// 获取目录
		const imagePath = image.path;
		const imagePathParts = imagePath.split('/').filter(p => p);
		const directory = imagePathParts.slice(0, -1).join('/');
		
		// 构建新路径
		const newPath = directory + '/' + newFileName;
		
		// 如果文件名不变，直接返回
		if (newPath === image.path) {
			return { updatedRefs: 0 };
		}

		// 保存旧值
		const oldPath = image.path;
		const oldName = image.name;
		
		// 执行重命名
		await this.app.vault.rename(file, newPath);
		
		// 更新图片对象的路径和名称信息
		image.path = newPath;
		image.name = newFileName;
		
		// 更新分组数据（如果图片在某个分组中）
		await this.updateGroupDataOnMove(oldPath, newPath);
		
		// 提取所有引用该图片的文件，并去重
		const referenceFiles = Array.from(new Set(references.map(r => r.file)));
		
		// 更新笔记中的引用链接
		// 传入 referenceFiles 参数，避免在 updateReferencesInNotes 中进行全库扫描
		const result = await this.updateReferencesInNotes(oldPath, newPath, oldName, newFileName, 'auto', referenceFiles);
		
		const updatedRefs = result.updatedCount || 0;
		
		// 返回日志条目（如果启用了日志记录）
		if (!suppressLogging) {
			return { 
				updatedRefs,
				logEntry: {
					oldPath,
					newPath,
					oldName,
					newName: newFileName,
					updatedRefs
				}
			};
		} else {
			return { updatedRefs };
		}
	}
	
	// 查找引用该图片的笔记及其序号（使用统一的 ReferenceManager）
	async findImageReferences(imagePath: string): Promise<Array<{file: TFile, index: number}>> {
		// 使用 ReferenceManager 的简化版方法
		const referenceManager = new ReferenceManager(this.app, this.plugin);
		return await referenceManager.findImageReferencesSimple(imagePath);
	}

	// 获取下一个序号
	getNextSequenceNumber(existingNames: string[], baseName: string, extension: string): number {
		const pattern = new RegExp(`^${baseName}_(\\d+)\\${extension}$`);
		const numbers: number[] = [];
		
		for (const name of existingNames) {
			const match = name.match(pattern);
			if (match) {
				numbers.push(parseInt(match[1], 10));
			}
		}
		
		return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
	}

	// 更新笔记中的引用链接
	async updateReferencesInNotes(oldPath: string, newPath: string, oldName: string, newName: string, mode: string, targetFiles?: TFile[]): Promise<{updatedCount: number, referencedFiles: string[]}> {
		try {
			let filesToScan: TFile[];
			const referencedFiles: string[] = [];
			let updatedCount = 0;

			// 如果提供了目标文件，直接使用（去重）
			if (targetFiles) {
				filesToScan = targetFiles;
				// 记录引用文件路径
				targetFiles.forEach(f => referencedFiles.push(f.path));
			} else {
				// 否则全库扫描（仅在未提供目标文件时）
				filesToScan = this.app.vault.getMarkdownFiles();
				
				// 先统计引用数量（仅全库扫描模式下需要）
				for (const file of filesToScan) {
					try {
						const content = await this.app.vault.read(file);
						// 简单快速检查是否包含关键词
						if (content.includes(oldPath) || content.includes(oldName)) {
							referencedFiles.push(file.path);
						}
					} catch (error) {
						// 忽略读取错误
					}
				}
				
				// 更新 filesToScan 为仅包含引用的文件，减少后续处理
				filesToScan = filesToScan.filter(f => referencedFiles.includes(f.path));
			}
			
			// 根据设置决定是否继续更新
			if (mode === 'skip') {
				return { updatedCount: 0, referencedFiles };
			}
			
			if (mode === 'prompt' && referencedFiles.length > 1) {
				const result = await ConfirmModal.show(
					this.app,
					'确认更新引用',
					`该图片在 ${referencedFiles.length} 个笔记中被引用。\n\n是否更新所有这些引用？`,
					['更新', '跳过']
				);
				
				if (result !== 'save') {
					return { updatedCount: 0, referencedFiles };
				}
			}
			
			// 执行更新
			for (const file of filesToScan) {
				try {
					const content = await this.app.vault.read(file);
					const lines = content.split('\n');
					let modified = false;
					
					// 准备正则表达式
					// 匹配路径分隔符、左括号、左方括号作为前缀
					const prefixPattern = '([/(\\[])';
					// 匹配右括号、右方括号、竖线作为后缀
					const suffixPattern = '([)\\]|])';
					
					// 构建带边界检查的正则
					const pathRegex = new RegExp(`${prefixPattern}${PathValidator.escapeRegex(oldPath)}${suffixPattern}`, 'g');
					const nameRegex = new RegExp(`${prefixPattern}${PathValidator.escapeRegex(oldName)}${suffixPattern}`, 'g');
					
					for (let i = 0; i < lines.length; i++) {
						const line = lines[i];
						let newLine = line;
						
						// 快速检查行是否包含旧名称或路径
						if (!line.includes(oldPath) && !line.includes(oldName)) {
							continue;
						}
						
						// 尝试替换完整路径
						if (line.includes(oldPath)) {
							newLine = newLine.replace(pathRegex, `$1${newPath}$2`);
						}
						
						// 尝试替换文件名（仅当路径未被替换或仍有文件名残留时）
						if (newLine.includes(oldName)) {
							newLine = newLine.replace(nameRegex, `$1${newName}$2`);
						}
						
						if (newLine !== line) {
							lines[i] = newLine;
							modified = true;
						}
					}
					
					if (modified) {
						await this.app.vault.modify(file, lines.join('\n'));
						updatedCount++;
					}
				} catch (error) {
					await this.plugin.logger.error(OperationType.UPDATE_REFERENCE, `更新文件失败: ${file.path}`, {
						error: error as Error
					});
				}
			}
			
			return { updatedCount, referencedFiles };
		} catch (error) {
			await this.plugin.logger.error(OperationType.UPDATE_REFERENCE, '更新引用失败', {
				error: error as Error
			});
			return { updatedCount: 0, referencedFiles: [] };
		}
	}


	async onClose() {
		// 清理键盘事件监听器
		if (this.keyboardHandler) {
			window.removeEventListener('keydown', this.keyboardHandler);
			this.keyboardHandler = null;
		}
		
		// 清理资源
		const listContainer = this.contentEl?.parentElement;
		if (listContainer && this.scrollHandler) {
			listContainer.removeEventListener('scroll', this.scrollHandler);
			this.scrollHandler = null;
		}
		
		// 移除文件监听器
		if (this.fileEventListener) {
			this.app.vault.off('create', this.fileEventListener);
			this.app.vault.off('modify', this.fileEventListener);
			this.app.vault.off('delete', this.fileEventListener);
			this.fileEventListener = null;
		}
		if (this.renameEventListener) {
			this.app.vault.off('rename', this.renameEventListener);
			this.renameEventListener = null;
		}
		
		// 清理防抖定时器
		if (this.refreshTimeout) {
			clearTimeout(this.refreshTimeout);
			this.refreshTimeout = null;
		}

		// 清理滚轮事件监听器
		if (this.wheelHandler) {
			this.containerEl.removeEventListener('wheel', this.wheelHandler);
			this.wheelHandler = null;
		}
		
		// 清理拖拽框选管理器
		if (this.dragSelectManager) {
			this.dragSelectManager.cleanup();
			this.dragSelectManager = null;
		}
		
		// 重置临时显示数量
		this.tempImagesPerRow = null;
	}

	async removeFromIgnoredList(filename: string) {
		// 找到对应的图片
		const image = this.images.find(img => img.name === filename);
		if (!image) {
			new Notice('找不到图片');
			return;
		}

		const imagePath = image.path;
		const md5 = image.md5;
		
		// 检查当前锁定状态
		const isLocked = this.isIgnoredFile(image.name, image.md5, image.path);
		
		if (isLocked) {
			// 已锁定，执行解锁
			await this.plugin.lockListManager.removeLockedFile(image.name, image.md5, image.path);
			
			// 记录日志
			if (this.plugin.logger) {
				await this.plugin.logger.info(
					OperationType.UNLOCK,
					`通过点击图标解锁文件: ${filename}`,
					{
						imageHash: md5,
						imagePath: imagePath,
						imageName: filename,
						details: {
							method: 'click-icon',
							previousState: 'locked',
							newState: 'unlocked'
						}
					}
				);
			}
			
			new Notice(`🔓 已解锁: ${filename}`);
		} else {
			// 未锁定，执行锁定
			await this.plugin.lockListManager.addLockedFile(image.name, image.path, image.md5);
			
			// 记录日志
			if (this.plugin.logger) {
				await this.plugin.logger.info(
					OperationType.LOCK,
					`通过点击图标锁定文件: ${filename}`,
					{
						imageHash: md5,
						imagePath: imagePath,
						imageName: filename,
						details: {
							method: 'click-icon',
							previousState: 'unlocked',
							newState: 'locked'
						}
					}
				);
			}
			
			new Notice(`🔒 已锁定: ${filename}`);
		}
		
		// 更新单个图片卡片
		this.updateImageCardLockStatus(imagePath);
	}

	/**
	 * 设置键盘快捷键
	 */
	private setupKeyboardShortcuts() {
		// 先移除旧的监听器（如果存在）
		if (this.keyboardHandler) {
			window.removeEventListener('keydown', this.keyboardHandler);
			this.keyboardHandler = null;
		}
		
		// 创建新的键盘事件处理器，每次事件触发时都从最新设置中读取快捷键配置
		this.keyboardHandler = async (e: KeyboardEvent) => {
			// 动态从设置中获取最新的快捷键配置
			const shortcuts = this.plugin.settings.keyboardShortcuts || {};
			
			// 检查是否在输入框中
			const inInputElement = isInputElement(e.target);
			
			// 对于Delete键和Ctrl+L：如果有选中的图片，允许执行，即使焦点在输入框
			// 对于其他键：如果焦点在输入框中，只允许 Escape
			if (inInputElement) {
				const deleteKey = shortcuts['manager-delete'] || SHORTCUT_DEFINITIONS['manager-delete'].defaultKey;
				const toggleLockKey = shortcuts['manager-toggle-lock'] || SHORTCUT_DEFINITIONS['manager-toggle-lock'].defaultKey;
				const isDeleteKey = matchesShortcut(e, deleteKey);
				const isToggleLockKey = matchesShortcut(e, toggleLockKey);
				
				if (isDeleteKey || isToggleLockKey) {
					// Delete键或Ctrl+L：检查是否有选中的图片
					const selectedItems = this.containerEl.querySelectorAll('.image-gallery-item.selected');
					if (selectedItems.length > 0) {
						// 继续处理
					} else {
						return; // 没有选中的图片，让输入框正常处理
					}
				} else if (e.key !== 'Escape') {
					return;
				}
			}

			// 图片管理视图 - 操作
			const searchKey = shortcuts['manager-search'] || SHORTCUT_DEFINITIONS['manager-search'].defaultKey;
			if (matchesShortcut(e, searchKey)) {
				e.preventDefault();
				this.openSearch();
				return;
			}

			const sortKey = shortcuts['manager-sort'] || SHORTCUT_DEFINITIONS['manager-sort'].defaultKey;
			if (matchesShortcut(e, sortKey)) {
				e.preventDefault();
				this.openSort();
				return;
			}

			const filterKey = shortcuts['manager-filter'] || SHORTCUT_DEFINITIONS['manager-filter'].defaultKey;
			if (matchesShortcut(e, filterKey)) {
				e.preventDefault();
				this.openFilter();
				return;
			}

			const groupKey = shortcuts['manager-group'] || SHORTCUT_DEFINITIONS['manager-group'].defaultKey;
			if (matchesShortcut(e, groupKey)) {
				e.preventDefault();
				this.groupImages();
				return;
			}

			const openDetailKey = shortcuts['manager-open-detail'] || SHORTCUT_DEFINITIONS['manager-open-detail'].defaultKey;
			if (matchesShortcut(e, openDetailKey)) {
				e.preventDefault();
				const selectedImages = this.getSelectedImages();
				if (selectedImages.length > 0) {
					this.openImageDetail(selectedImages[0]);
				} else if (this.filteredImages.length > 0) {
					// 如果没有选中的，打开第一张
					this.openImageDetail(this.filteredImages[0]);
				}
				return;
			}

			const deleteKey = shortcuts['manager-delete'] || SHORTCUT_DEFINITIONS['manager-delete'].defaultKey;
			if (matchesShortcut(e, deleteKey)) {
				e.preventDefault();
				const selectedImages = this.getSelectedImages();
				if (selectedImages.length > 0) {
					await this.deleteSelectedImages(selectedImages);
				} else {
					// 没有选中的图片，触发清除按钮功能
					this.handleClearButtonClick();
				}
				return;
			}

			const selectAllKey = shortcuts['manager-select-all'] || SHORTCUT_DEFINITIONS['manager-select-all'].defaultKey;
			if (matchesShortcut(e, selectAllKey)) {
				e.preventDefault();
				const selectedImages = this.getSelectedImages();
				if (selectedImages.length === this.filteredImages.length) {
					// 全部选中时，取消全选
					this.clearSelection();
				} else {
					// 否则全选
					this.selectAllImages();
				}
				return;
			}

			// 批量操作
			const batchRenameKey = shortcuts['manager-batch-rename'] || SHORTCUT_DEFINITIONS['manager-batch-rename'].defaultKey;
			if (matchesShortcut(e, batchRenameKey)) {
				e.preventDefault();
				const selectedImages = this.getSelectedImages();
				if (selectedImages.length > 0) {
					this.openRenameModal(selectedImages);
				}
				return;
			}

			const smartRenameKey = shortcuts['manager-smart-rename'] || SHORTCUT_DEFINITIONS['manager-smart-rename'].defaultKey;
			if (matchesShortcut(e, smartRenameKey)) {
				e.preventDefault();
				const selectedImages = this.getSelectedImages();
				if (selectedImages.length > 0) {
					this.batchPathRename();
				}
				return;
			}

			// 切换锁定
			const toggleLockKey = shortcuts['manager-toggle-lock'] || SHORTCUT_DEFINITIONS['manager-toggle-lock'].defaultKey;
			if (matchesShortcut(e, toggleLockKey)) {
				e.preventDefault();
				const selectedImages = this.getSelectedImages();
				if (selectedImages.length > 0) {
					await this.toggleSelectedImagesLock(selectedImages);
				} else {
					new Notice('请先选中要锁定/解锁的图片');
				}
				return;
			}

			// 键盘导航（仅当没有选中图片时）
			const selectedImages = this.getSelectedImages();
			if (selectedImages.length === 0 && this.filteredImages.length > 0) {
				if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
					e.preventDefault();
					this.focusedImageIndex = Math.max(0, this.focusedImageIndex - 1);
					this.scrollToImage(this.focusedImageIndex);
				} else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
					e.preventDefault();
					this.focusedImageIndex = Math.min(this.filteredImages.length - 1, this.focusedImageIndex + 1);
					this.scrollToImage(this.focusedImageIndex);
				} else if (e.key === 'Home') {
					e.preventDefault();
					this.focusedImageIndex = 0;
					this.scrollToImage(0);
				} else if (e.key === 'End') {
					e.preventDefault();
					this.focusedImageIndex = this.filteredImages.length - 1;
					this.scrollToImage(this.focusedImageIndex);
				} else if (e.key === 'Enter' && this.focusedImageIndex >= 0) {
					e.preventDefault();
					this.openImageDetail(this.filteredImages[this.focusedImageIndex]);
				}
			}
		};

		window.addEventListener('keydown', this.keyboardHandler);
	}

	/**
	 * 获取当前每行显示数量（优先使用临时值）
	 */
	private getCurrentImagesPerRow(): number {
		// 优先使用临时值，否则使用设置值，最后使用默认值 5
		return this.tempImagesPerRow ?? (this.plugin.settings.imagesPerRow ?? 5);
	}

	/**
	 * 设置 Ctrl+滚轮调整每行显示数量（临时改变，不保存到设置）
	 */
	private setupWheelToChangeImagesPerRow() {
		// 清理旧的监听器（如果存在）
		if (this.wheelHandler) {
			this.containerEl.removeEventListener('wheel', this.wheelHandler);
		}

		this.wheelHandler = (e: WheelEvent) => {
			// 检查是否按下了 Ctrl 键（Windows/Linux）或 Cmd 键（Mac）
			const isCtrlPressed = e.ctrlKey || e.metaKey;
			
			if (!isCtrlPressed) {
				return;
			}

			// 阻止默认行为（页面缩放）
			e.preventDefault();
			e.stopPropagation();

			// 获取当前每行显示数量（使用临时值或设置值）
			let currentValue = this.getCurrentImagesPerRow();
			const minValue = 1;
			const maxValue = 10;

			// 根据滚轮方向调整
			if (e.deltaY < 0) {
				// 向上滚动，增加每行数量
				currentValue = Math.min(maxValue, currentValue + 1);
			} else {
				// 向下滚动，减少每行数量
				currentValue = Math.max(minValue, currentValue - 1);
			}

			// 如果值没有变化，不执行操作
			if (currentValue === this.getCurrentImagesPerRow()) {
				return;
			}

			// 只更新临时值，不保存到设置
			this.tempImagesPerRow = currentValue;

			// 重新渲染图片列表
			this.renderImageList();
		};

		// 注册滚轮事件监听器
		this.containerEl.addEventListener('wheel', this.wheelHandler, { passive: false });
	}

	/**
	 * 选中所有图片（包括分组中的）
	 */
	private selectAllImages() {
		const imageItems = this.containerEl.querySelectorAll('.image-gallery-item');
		imageItems.forEach(itemEl => {
			itemEl.classList.add('selected');
			const checkbox = itemEl.querySelector('.image-select-checkbox') as HTMLInputElement;
			if (checkbox) {
				checkbox.checked = true;
				checkbox.style.backgroundColor = 'var(--interactive-accent)';
				checkbox.style.borderColor = 'var(--interactive-accent)';
				checkbox.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3E%3Cpath fill=\'white\' d=\'M13.5 3L6 10.5 2.5 7l-1 1L6 12.5 14.5 4z\'/%3E%3C/svg%3E")';
				checkbox.style.backgroundSize = 'contain';
			}
		});
		
		// 显示清除选择按钮
		const clearSelectionBtn = document.getElementById('clear-selection-btn');
		if (clearSelectionBtn) {
			clearSelectionBtn.style.display = '';
		}
	}

	/**
	 * 切换选中图片的锁定状态
	 */
	private async toggleSelectedImagesLock(selectedImages: ImageInfo[]) {
		if (selectedImages.length === 0) return;

		let lockedCount = 0;
		let unlockedCount = 0;
		
		// 保存选中的图片名称，用于操作后恢复选中状态
		const selectedImageNames = new Set(selectedImages.map(img => img.name));

		for (const image of selectedImages) {
			const isLocked = this.isIgnoredFile(image.name, image.md5, image.path);
			
			if (isLocked) {
				// 解锁
				await this.plugin.lockListManager.removeLockedFile(image.name, image.md5, image.path);
				unlockedCount++;
				
				// 记录日志
				if (this.plugin.logger) {
					await this.plugin.logger.info(
						OperationType.UNLOCK,
						`通过快捷键解锁文件: ${image.name}`,
						{
							imageHash: image.md5,
							imagePath: image.path,
							imageName: image.name,
							details: {
								method: 'shortcut',
								previousState: 'locked',
								newState: 'unlocked'
							}
						}
					);
				}
			} else {
				// 锁定
				await this.plugin.lockListManager.addLockedFile(image.name, image.path, image.md5);
				lockedCount++;
				
				// 记录日志
				if (this.plugin.logger) {
					await this.plugin.logger.info(
						OperationType.LOCK,
						`通过快捷键锁定文件: ${image.name}`,
						{
							imageHash: image.md5,
							imagePath: image.path,
							imageName: image.name,
							details: {
								method: 'shortcut',
								previousState: 'unlocked',
								newState: 'locked'
							}
						}
					);
				}
			}
		}

		// 更新每个选中图片的卡片，而不是重新渲染整个列表
		for (const image of selectedImages) {
			this.updateImageCardLockStatus(image.path);
		}
		
		// 恢复选中状态
		this.containerEl.querySelectorAll('.image-gallery-item').forEach(itemEl => {
			const nameEl = itemEl.querySelector('.image-name');
			if (nameEl && nameEl.textContent && selectedImageNames.has(nameEl.textContent)) {
				itemEl.classList.add('selected');
				const checkbox = itemEl.querySelector('.image-select-checkbox') as HTMLInputElement;
				if (checkbox) {
					checkbox.checked = true;
					checkbox.style.backgroundColor = 'var(--interactive-accent)';
					checkbox.style.borderColor = 'var(--interactive-accent)';
					checkbox.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3E%3Cpath fill=\'white\' d=\'M13.5 3L6 10.5 2.5 7l-1 1L6 12.5 14.5 4z\'/%3E%3C/svg%3E")';
					checkbox.style.backgroundSize = 'contain';
				}
			}
		});

		// 显示提示
		if (lockedCount > 0 && unlockedCount === 0) {
			new Notice(`🔒 已锁定 ${lockedCount} 张图片`);
		} else if (unlockedCount > 0 && lockedCount === 0) {
			new Notice(`🔓 已解锁 ${unlockedCount} 张图片`);
		} else if (lockedCount > 0 && unlockedCount > 0) {
			new Notice(`🔒 已锁定 ${lockedCount} 张，🔓 已解锁 ${unlockedCount} 张`);
		}
	}

	/**
	 * 删除选中的图片
	 */
	private async deleteSelectedImages(selectedImages: ImageInfo[]) {
		if (selectedImages.length === 0) return;

		const confirmMessage = `确定要删除 ${selectedImages.length} 张图片吗？\n此操作不可撤销。`;

		const choice = await ConfirmModal.show(
			this.app,
			'确认删除',
			confirmMessage,
			['删除', '取消']
		);

		if (choice === 'save') {
			let successCount = 0;
			let failCount = 0;

			for (const image of selectedImages) {
				const abstractFile = this.app.vault.getAbstractFileByPath(image.path);
				const file = abstractFile instanceof TFile ? abstractFile : null;
				if (file) {
					try {
						// 根据设置选择删除方式
						if (this.plugin.settings.enablePluginTrash) {
							// 使用插件回收站（moveToTrash 内部已记录日志 OperationType.TRASH）
							const success = await this.plugin.trashManager.moveToTrash(file);
							if (success) {
								successCount++;
							} else {
								failCount++;
								new Notice(`移动到回收站失败: ${image.name}`);
								// 记录失败日志
								if (this.plugin.logger) {
									await this.plugin.logger.error(
										OperationType.DELETE,
										`批量删除失败: ${image.name}`,
										{
											imageHash: image.md5,
											imagePath: image.path,
											imageName: image.name,
											details: {
												reason: '移动到回收站失败',
												useTrash: true
											}
										}
									);
								}
							}
						} else if (this.plugin.settings.moveToSystemTrash) {
							// 移到系统回收站
							await this.app.vault.delete(file);
							successCount++;
							
							// 记录删除日志
							if (this.plugin.logger) {
								await this.plugin.logger.info(
									OperationType.DELETE,
									`批量删除: ${image.name}`,
									{
										imageHash: image.md5,
										imagePath: image.path,
										imageName: image.name,
										details: {
											path: image.path,
											size: image.size,
											useSystemTrash: true
										}
									}
								);
							}
						} else {
							// 永久删除
							await this.app.vault.delete(file);
							successCount++;
							
							// 记录删除日志
							if (this.plugin.logger) {
								await this.plugin.logger.info(
									OperationType.DELETE,
									`批量永久删除: ${image.name}`,
									{
										imageHash: image.md5,
										imagePath: image.path,
										imageName: image.name,
										details: {
											path: image.path,
											size: image.size,
											permanent: true
										}
									}
								);
							}
						}
						
						// 记录删除历史
						if (this.plugin.historyManager) {
							await this.plugin.historyManager.saveHistory({
								timestamp: Date.now(),
								action: 'delete',
								fromName: image.name,
								fromPath: image.path
							});
						}
					} catch (error) {
						failCount++;
						new Notice(`删除失败: ${image.name}`);
						
						if (this.plugin.logger) {
							await this.plugin.logger.error(
								OperationType.DELETE,
								`批量删除失败: ${image.name}`,
								{
									error: error as Error,
									imagePath: image.path,
									imageName: image.name
								}
							);
						}
					}
				}
			}

			if (successCount > 0) {
				const message = this.plugin.settings.enablePluginTrash
					? `已移动到回收站 ${successCount} 张图片${failCount > 0 ? `，${failCount} 张失败` : ''}`
					: `已删除 ${successCount} 张图片${failCount > 0 ? `，${failCount} 张失败` : ''}`;
				new Notice(message);
			}
			
			this.clearSelection();
			await this.scanImages();
		}
	}

	/**
	 * 打开重命名模态框
	 */
	private openRenameModal(images: ImageInfo[]) {
		const modal = new RenameModal(this.app, async (pattern: string) => {
			// 批量重命名后刷新图片列表
			await this.scanImages();
		});
		modal.open();
	}

	/**
	 * 滚动到指定图片
	 */
	private scrollToImage(index: number) {
		const imageItems = this.contentEl.querySelectorAll('.image-gallery-item');
		if (imageItems[index]) {
			imageItems[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			// 高亮显示
			imageItems.forEach((item, i) => {
				if (i === index) {
					item.classList.add('focused');
				} else {
					item.classList.remove('focused');
				}
			});
		}
	}

	/**
	 * 设置拖拽框选功能
	 */
	private setupDragSelect(container: HTMLElement) {
		// 清理旧的拖拽框选管理器
		if (this.dragSelectManager) {
			this.dragSelectManager.cleanup();
		}

		// 创建新的拖拽框选管理器
		this.dragSelectManager = new DragSelectManager(
			container,
			'.image-gallery-item',
			(selectedItems: HTMLElement[]) => {
				// 更新清除选择按钮
				this.updateClearSelectionButton();
			}
		);
		
		// 点击空白区域取消选中（像文件夹那样）
		container.addEventListener('click', (e) => {
			// 如果刚刚完成了拖动选择，不取消选中
			if (this.dragSelectManager?.wasJustDragging()) {
				return;
			}
			
			const target = e.target as HTMLElement;
			// 检查是否点击的是空白区域（不是图片卡片或其子元素）
			const clickedOnItem = target.closest('.image-gallery-item');
			const clickedOnGroupHeader = target.closest('.group-header');
			const clickedOnToolbar = target.closest('.toolbar-btn');
			
			if (!clickedOnItem && !clickedOnGroupHeader && !clickedOnToolbar) {
				// 点击了空白区域，取消所有选中
				const selectedItems = container.querySelectorAll('.image-gallery-item.selected');
				if (selectedItems.length > 0) {
					selectedItems.forEach((itemEl) => {
						itemEl.classList.remove('selected');
						const checkbox = itemEl.querySelector('.image-select-checkbox') as HTMLInputElement;
						if (checkbox) {
							checkbox.checked = false;
							checkbox.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
							checkbox.style.borderColor = 'rgba(255, 255, 255, 0.8)';
							checkbox.style.backgroundImage = 'none';
						}
					});
					this.updateClearSelectionButton();
				}
			}
		});
	}

	/**
	 * 添加操作到历史栈
	 * 如果该操作已存在，先移除再添加到栈顶
	 */
	private addToOperationHistory(operation: 'search' | 'sort' | 'filter' | 'group') {
		// 移除已存在的相同操作
		this.operationHistory = this.operationHistory.filter(op => op !== operation);
		// 添加到栈顶
		this.operationHistory.push(operation);
	}

	/**
	 * 从历史栈移除操作
	 */
	private removeFromOperationHistory(operation: 'search' | 'sort' | 'filter' | 'group') {
		this.operationHistory = this.operationHistory.filter(op => op !== operation);
	}

	/**
	 * 获取栈顶的有效操作（该操作当前仍有条件）
	 */
	private getTopValidOperation(): 'search' | 'sort' | 'filter' | 'group' | null {
		const hasSearch = this.searchQuery.trim() !== '';
		const hasSort = this.sortOptions.rules.length > 1 || 
						this.sortOptions.rules[0].sortBy !== this.plugin.settings.defaultSortBy ||
						this.sortOptions.rules[0].sortOrder !== this.plugin.settings.defaultSortOrder;
		const hasFilter = this.filterOptions.filterType !== this.plugin.settings.defaultFilterType ||
						  this.filterOptions.lockFilter !== undefined ||
						  this.filterOptions.referenceFilter !== undefined ||
						  (this.filterOptions.sizeFilter && 
						   (this.filterOptions.sizeFilter.min !== undefined || 
							this.filterOptions.sizeFilter.max !== undefined)) ||
						  (this.filterOptions.nameFilter !== undefined && this.filterOptions.nameFilter.trim() !== '') ||
						  (this.filterOptions.folderFilter !== undefined && this.filterOptions.folderFilter.trim() !== '');
		const hasGroup = !!(this.plugin.data && this.plugin.data.imageGroups && Object.keys(this.plugin.data.imageGroups).length > 0);

		// 从栈顶向下遍历，找到第一个有效的操作
		for (let i = this.operationHistory.length - 1; i >= 0; i--) {
			const op = this.operationHistory[i];
			if (op === 'search' && hasSearch) return 'search';
			if (op === 'sort' && hasSort) return 'sort';
			if (op === 'filter' && hasFilter) return 'filter';
			if (op === 'group' && hasGroup) return 'group';
		}
		return null;
	}

	/**
	 * 处理清除按钮点击
	 * 按操作顺序倒序清除（后操作的先清除）
	 */
	private handleClearButtonClick() {
		const topOperation = this.getTopValidOperation();
		if (topOperation === 'search') {
			this.clearSearch();
		} else if (topOperation === 'sort') {
			this.clearSort();
		} else if (topOperation === 'filter') {
			this.clearFilter();
		} else if (topOperation === 'group') {
			this.clearGroup();
		}
	}

	/**
	 * 更新清除按钮的状态和文本
	 */
	private updateClearButtonState() {
		if (!this.clearBtnElement) return;
		
		const topOperation = this.getTopValidOperation();
		
		if (topOperation) {
			this.clearBtnElement.style.display = '';
			
			if (topOperation === 'search') {
				this.clearBtnElement.innerHTML = '<span class="icon">🧹</span><span class="btn-text">清除搜索</span>';
				this.clearBtnElement.title = '清除搜索条件';
			} else if (topOperation === 'sort') {
				this.clearBtnElement.innerHTML = '<span class="icon">🧹</span><span class="btn-text">清除排序</span>';
				this.clearBtnElement.title = '清除排序条件';
			} else if (topOperation === 'filter') {
				this.clearBtnElement.innerHTML = '<span class="icon">🧹</span><span class="btn-text">清除筛选</span>';
				this.clearBtnElement.title = '清除筛选条件';
			} else if (topOperation === 'group') {
				this.clearBtnElement.innerHTML = '<span class="icon">🧹</span><span class="btn-text">清除分组</span>';
				this.clearBtnElement.title = '清除所有分组';
			}
		} else {
			this.clearBtnElement.style.display = 'none';
		}
	}

	/**
	 * 清除搜索
	 */
	private clearSearch() {
		this.searchQuery = '';
		this.removeFromOperationHistory('search');
		this.applySortAndFilter();
		this.updateButtonIndicator(document.getElementById('search-btn') as HTMLElement, 'search');
		
		// 更新清除按钮状态
		this.updateClearButtonState();
		
		new Notice('已清除搜索');
	}

	/**
	 * 清除排序
	 */
	private clearSort() {
		this.sortOptions = {
			rules: [{ sortBy: this.plugin.settings.defaultSortBy, sortOrder: this.plugin.settings.defaultSortOrder }]
		};
		this.removeFromOperationHistory('sort');
		this.applySortAndFilter();
		this.updateButtonIndicator(document.getElementById('sort-btn') as HTMLElement, 'sort');
		
		// 更新清除按钮状态
		this.updateClearButtonState();
		
		new Notice('已清除排序');
	}

	/**
	 * 清除筛选
	 */
	private clearFilter() {
		this.filterOptions = {
			filterType: this.plugin.settings.defaultFilterType
		};
		this.removeFromOperationHistory('filter');
		this.applySortAndFilter();
		this.updateButtonIndicator(document.getElementById('filter-btn') as HTMLElement, 'filter');
		
		// 更新清除按钮状态
		this.updateClearButtonState();
		
		new Notice('已清除筛选');
	}

	/**
	 * 清除分组
	 */
	private async clearGroup() {
		// 清除所有分组
		this.images.forEach(img => { img.group = undefined; });
		this.filteredImages.forEach(img => { img.group = undefined; });
		if (this.plugin.data.imageGroups) this.plugin.data.imageGroups = {};
		
		// 清除锁定分组标记
		if (this.plugin.data.groupMeta && this.plugin.data.groupMeta['_lock_group']) {
			delete this.plugin.data.groupMeta['_lock_group'];
		}
		
		await this.plugin.saveData(this.plugin.data);
		
		this.removeFromOperationHistory('group');
		this.renderImageList();
		
		// 更新分组按钮绿点
		const groupBtn = document.getElementById('group-btn') as HTMLElement;
		if (groupBtn) this.updateButtonIndicator(groupBtn, 'group');
		
		// 更新清除按钮状态
		this.updateClearButtonState();
		
		new Notice('已清除所有分组');
	}

	/**
	 * 显示链接格式转换模态框
	 */
	showLinkFormatModal() {
		const modal = new LinkFormatModal(this.app, this.plugin);
		modal.open();
	}
}
