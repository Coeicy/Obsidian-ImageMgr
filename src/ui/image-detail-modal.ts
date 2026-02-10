import { App, Modal, Notice, TFile, TFolder, Vault } from 'obsidian';
import { ImageInfo, ImageChangeHistory } from '../types';
import { ImageProcessor } from '../utils/image-processor';
import { ConfirmModal, ConfirmResult } from './confirm-modal';
import { ReferenceSelectModal, ReferenceOption } from './reference-select-modal';
import ImageManagementPlugin from '../main';
import { editImage } from '../utils/image-optimizer';
import { ReferenceManager, parseWikiLink, buildWikiLink, WikiLinkParts, parseHtmlImageSize } from '../utils/reference-manager';
import { PathValidator } from '../utils/path-validator';
import { HistoryManager } from '../utils/history-manager';
import { LogViewerModal } from './log-viewer-modal';
import { LogLevel, OperationType, OperationTypeLabels } from '../utils/logger';
import { isFileIgnored } from '../utils/file-filter';
import { ImagePreviewPanel } from './components/image-preview-panel';
import { ImageControlsPanel } from './components/image-controls-panel';
import { ImageHistoryPanel } from './components/image-history-panel';
import { matchesShortcut, isInputElement, formatShortcut, SHORTCUT_DEFINITIONS } from '../utils/keyboard-shortcut-manager';
import { makeModalResizable } from '../utils/resizable-modal';

/**
 * 图片详情模态框类
 * 
 * 核心功能：
 * - 图片预览和交互（旋转、缩放、平移）
 * - 文件名和路径编辑（支持多行和自动调整高度）
 * - 引用查询和批量修改（支持多种链接格式）
 * - 操作历史查看和恢复（时间线展示）
 * - 图片锁定/解锁（防止误操作）
 * - 删除和恢复（支持回收站）
 * - 快捷键支持（完整的键盘导航和操作）
 * 
 * 图片预览交互：
 * - 滚轮：切换图片（scroll模式）或缩放（默认模式）
 * - 拖拽：平移图片
 * - 双击：切换视图模式（适应窗口/原始尺寸）
 * - 键盘方向键：前后导航
 * - Ctrl/Cmd + 0：重置视图
 * 
 * 视图模式：
 * - fit: 适应窗口大小（默认）
 * - 1:1: 原始尺寸（100%）
 * 
 * 状态管理：
 * - scale: 缩放比例（1.0 = 100%）
 * - rotate: 旋转角度（度数）
 * - translateX/Y: 平移距离（像素）
 * - viewMode: 查看模式（fit/1:1）
 * 
 * 组件架构：
 * - ImagePreviewPanel: 图片预览区域
 * - ImageControlsPanel: 控制按钮区域
 * - ImageHistoryPanel: 操作历史区域
 * 
 * 引用管理：
 * - 查找所有引用该图片的笔记
 * - 支持多种链接格式（Wiki、Markdown、HTML）
 * - 批量修改引用（重命名后自动更新）
 * - 显示引用位置和上下文
 * 
 * 操作历史：
 * - 记录所有修改操作（重命名、移动、编辑）
 * - 显示时间线（时间、操作类型、详情）
 * - 支持恢复到历史状态
 * - 关联历史记录管理器
 * 
 * 文件编辑：
 * - 文件名编辑（自动调整高度）
 * - 路径编辑（支持多行和路径建议）
 * - 路径冲突检测（自动生成唯一文件名）
 * - 路径验证（检查非法字符和路径）
 * 
 * 安全机制：
 * - 图片锁定（防止意外修改）
 * - 修改检测（提示未保存的更改）
 * - 路径验证（防止非法路径）
 * - 引用更新（重命名后自动更新引用）
 * 
 * 性能优化：
 * - 图片懒加载（仅在显示时加载）
 * - DOM 元素复用（减少重绘）
 * - 事件委托（优化事件处理）
 * - 防抖和节流（优化频繁操作）
 * 
 * 使用示例：
 * ```typescript
 * // 打开图片详情
 * const modal = new ImageDetailModal(app, imageInfo, allImages, plugin);
 * modal.open();
 * 
 * // 关闭模态框
 * modal.close();
 * 
 * // 刷新引用列表
 * await modal.refreshReferences();
 * ```
 */
export class ImageDetailModal extends Modal {
	/** 当前显示的图片信息 */
	image: ImageInfo;
	/** Vault 实例（用于文件操作） */
	vault: Vault;
	/** 所有图片列表（用于前后导航） */
	private allImages: ImageInfo[];
	/** 当前图片在列表中的索引 */
	private currentIndex: number;
	/** 图片缩放比例（1.0 = 100%） */
	private scale: number = 1;
	/** 图片旋转角度（度数） */
	private rotate: number = 0;
	/** 图片 X 轴平移距离（像素） */
	private translateX: number = 0;
	/** 图片 Y 轴平移距离（像素） */
	private translateY: number = 0;
	/** 图片 HTML 元素引用 */
	private imgElement: HTMLImageElement | null = null;
	/** 是否处于滚动模式（true=滚轮切换图片，false=滚轮缩放） */
	isScrollMode: boolean = false;
	/** 查看模式：'fit'=适应窗口，'1:1'=原始尺寸 */
	private viewMode: 'fit' | '1:1' = 'fit';
	/** 滚轮事件处理器引用 */
	private wheelHandler: ((e: WheelEvent) => void) | null = null;
	/** 全局滚轮处理器（用于切换图片模式） */
	private modalWheelHandler: ((e: WheelEvent) => void) | null = null;
	/** 是否正在拖拽图片 */
	private isDragging: boolean = false;
	/** 拖拽起始的 X 坐标 */
	private dragStartX: number = 0;
	/** 拖拽起始的 Y 坐标 */
	private dragStartY: number = 0;
	/** 拖拽起始时的 translateX 值 */
	private dragStartTranslateX: number = 0;
	/** 拖拽起始时的 translateY 值 */
	private dragStartTranslateY: number = 0;
	/** 原始文件名（用于检测修改） */
	private originalFileName: string = '';
	/** 原始文件路径（用于检测修改） */
	private originalPath: string = '';
	/** 文件名输入框 DOM 元素引用 */
	private fileNameInput: HTMLTextAreaElement | null = null;
	/** 调整文件名输入框高度的函数引用 */
	private adjustTextareaHeightFunc: (() => void) | null = null;
	/** 窗口大小变化事件监听器 */
	private resizeHandler: ((e: Event) => void) | null = null;
	/** 路径输入框 DOM 元素引用 */
	private pathInput: HTMLTextAreaElement | null = null;
	/** 路径输入框窗口大小变化监听器 */
	private pathResizeHandler: ((e: Event) => void) | null = null;
	/** 调整路径输入框高度的函数引用 */
	private adjustPathInputHeightFunc: (() => void) | null = null;
	/** 定位按钮 DOM 元素引用 */
	private locateBtn: HTMLButtonElement | null = null;
	/** 插件实例引用 */
	private plugin?: ImageManagementPlugin;
	/** 建议列表关闭处理器 */
	private closeSuggestionsHandler?: (e: MouseEvent) => void;
	/** 上次保存的路径（用于检测修改） */
	private lastSavedPath: string = '';
	private lastSavedDir: string = ''; // 上次保存的目录（用于比较）
	private beforeSavePath: string = ''; // 保存前的路径
	private keyboardHandler: ((e: KeyboardEvent) => void) | null = null; // 键盘事件处理器
	private createdDir: string = ''; // 保存时创建的目录
	private lastSavedFileName: string = ''; // 上次保存的文件名
	private beforeSaveFileName: string = ''; // 保存前的文件名
	private fileNameActionBtn?: HTMLButtonElement; // 文件名保存/撤销按钮
	private referenceManager?: ReferenceManager; // 引用管理器
	private historyManager?: HistoryManager; // 操作记录管理器
	private historyRefreshInterval?: number; // 操作记录自动刷新定时器
	
	// 信息显示元素引用（用于切换图片时更新）
	private formatValue?: HTMLElement; // 格式值
	private sizeValue?: HTMLElement; // 大小值
	private dimensionValue?: HTMLElement; // 尺寸值
	private dimensionLi?: HTMLElement; // 尺寸列表项（用于显示/隐藏）
	private importValue?: HTMLElement; // 导入时间值
	private hashValue?: HTMLElement; // 哈希值（URL哈希或MD5）
	private hashLabel?: HTMLElement; // 哈希标签（用于切换图片时更新）
	private mdInput?: HTMLInputElement; // Markdown链接输入框
	private htmlInput?: HTMLInputElement; // HTML链接输入框
	private linkTitle?: HTMLElement; // 链接标题
	private refListContainer?: HTMLElement; // 引用列表容器
	/** 笔记内拖拽改尺寸监听注销函数 */
	private noteImageSizeUpdatedUnregister: (() => void) | null = null;
	
	// 组件引用
	private previewPanel?: ImagePreviewPanel;
	private controlsPanel?: ImageControlsPanel;
	private historyPanel?: ImageHistoryPanel;
	private infoSection?: HTMLElement; // 右侧信息面板引用
	
	// 标记为图片详情模态框
	public readonly isImageDetailModal = true;
	
	// 是否是回收站文件（回收站文件禁用某些功能）
	private isTrashFile: boolean = false;
	
	// 是否是云端/网络图片（云端图片禁用文件操作和编辑功能）
	private isRemoteImage: boolean = false;

	constructor(app: App, image: ImageInfo, vault: Vault, allImages: ImageInfo[] = [], currentIndex: number = 0, plugin?: ImageManagementPlugin, isTrashFile: boolean = false) {
		super(app);
		this.image = image;
		this.vault = vault;
		this.allImages = allImages;
		this.currentIndex = currentIndex;
		this.plugin = plugin;
		this.isTrashFile = isTrashFile;
		// 判断是否为云端图片
		// 如果关闭了云端图片扫描，所有图片都视为本地图片
		const scanRemoteImagesDisabled = plugin?.settings.scanRemoteImages === false;
		this.isRemoteImage = scanRemoteImagesDisabled ? false : (image.isRemote === true || image.path.startsWith('http://') || image.path.startsWith('https://'));
		
		// 初始化管理器 - 使用 plugin 中已有的实例，避免重复注册事件监听器
		if (plugin) {
			this.referenceManager = plugin.referenceManager;
			this.historyManager = new HistoryManager(plugin);
		}
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		
		// 检查图片信息是否有效
		if (!this.image || !this.image.name || !this.image.path) {
			new Notice('图片信息无效，无法打开详情页');
			this.close();
			return;
		}
		
		// 根据设置初始化滚轮模式（默认缩放模式）
		// 确保默认是缩放模式：只有当设置明确为 'scroll' 时才切换，否则默认缩放
		if (this.plugin?.settings?.defaultWheelMode === 'scroll') {
			this.isScrollMode = true; // 切换图片模式
		} else {
			this.isScrollMode = false; // 缩放图片模式（默认）
		}
		
		// 记录原始值
		this.originalFileName = this.image.name;
		this.originalPath = this.image.path;
		
		// 初始化保存的文件名（在后续代码中会重新计算，这里只是初始化）
		// 对于云端图片，name 已经从 URL 中提取好了，直接使用即可
		const initFileNameParts = this.image.name.split('.');
		const initBaseFileName = initFileNameParts.length > 1 ? initFileNameParts.slice(0, -1).join('.') : this.image.name;
		this.lastSavedFileName = initBaseFileName;
		
		// 设置模态框的类名以便应用样式
		modalEl.classList.add('image-detail-modal');
		
		// 启用模态框可调整大小
		makeModalResizable(modalEl, {
			minWidth: 800,
			minHeight: 600,
			maxWidth: window.innerWidth * 0.98,
			maxHeight: window.innerHeight * 0.98,
		});
		
		// 移除默认的padding，缩短间距
		contentEl.style.padding = '8px';

		// 创建主容器，左右布局（响应式）
		const mainContainer = contentEl.createDiv('image-detail-container');

		// 注册模态层面的滚轮监听：在“切换图片模式”时，全局滚轮皆可切换
		this.modalWheelHandler = (e: WheelEvent) => {
			// 如果鼠标位于右侧信息区域（信息/引用/历史等），不进行切换或缩放，允许正常滚动
			const target = e.target as HTMLElement | null;
			if (target && target.closest('.image-detail-info')) {
				return;
			}

			const forceZoom = e.ctrlKey || e.metaKey;
			if (forceZoom) {
				// Ctrl/Cmd 强制缩放
				e.preventDefault();
				if (e.deltaY < 0) {
					this.zoomIn();
				} else {
					this.zoomOut();
				}
				return;
			}

			if (this.isScrollMode) {
				// 切换模式下：全局滚轮切图
				e.preventDefault();
				e.stopPropagation();
				if (e.deltaY < 0) {
					this.showPreviousImage();
				} else {
					this.showNextImage();
				}
			}
		};
		// capture 阶段并设为非被动，以便调用 preventDefault
		this.modalEl.addEventListener('wheel', this.modalWheelHandler as EventListener, { capture: true, passive: false });

		// 注册键盘快捷键
		this.setupKeyboardShortcuts();

		// 左侧：图片预览区域
		const previewSection = mainContainer.createDiv('image-detail-preview');
		
		// 第一个板块：图片预览容器（使用组件）
		const imagePreviewContainer = previewSection.createDiv('image-preview-container');
		const isIgnored = this.isIgnoredFile(this.image.name);
		this.previewPanel = new ImagePreviewPanel(
			imagePreviewContainer,
			this.image,
			this.vault,
			isIgnored,
			() => this.toggleIgnoreFile(),
			(e: WheelEvent) => {
				// 按住Ctrl键时强制使用缩放模式，忽略当前isScrollMode状态
				const forceZoom = e.ctrlKey || e.metaKey; // 支持Mac的Cmd键
				
				if (forceZoom || !this.isScrollMode) {
					// 缩放模式：向上滚动放大，向下滚动缩小
						const delta = e.deltaY;
						if (delta < 0) {
						this.zoomIn();
						} else {
						this.zoomOut();
						}
					} else {
					// 切换图片模式：向上滚动上一张，向下滚动下一张
						const delta = e.deltaY;
						if (delta < 0) {
						this.showPreviousImage();
						} else {
						this.showNextImage();
						}
					}
				},
				() => {
					// 拖拽开始
					this.isDragging = true;
				},
				(translateX: number, translateY: number) => {
					// 拖拽移动
					// 计算边界限制，防止图片被拖拽出可视区域
					if (this.imgElement && this.scale > 1) {
						const imgRect = this.imgElement.getBoundingClientRect();
						const containerRect = this.imgElement.parentElement?.getBoundingClientRect();
						
						if (containerRect) {
							// 计算图片缩放后的尺寸
							const scaledWidth = imgRect.width;
							const scaledHeight = imgRect.height;
							const containerWidth = containerRect.width;
							const containerHeight = containerRect.height;
							
							// 计算允许的最大偏移量（图片边缘不能超出容器中心）
							const maxTranslateX = Math.max(0, (scaledWidth - containerWidth / 2) / 2);
							const maxTranslateY = Math.max(0, (scaledHeight - containerHeight / 2) / 2);
							const minTranslateX = -maxTranslateX;
							const minTranslateY = -maxTranslateY;
							
							// 限制平移范围
							this.translateX = Math.max(minTranslateX, Math.min(maxTranslateX, translateX));
							this.translateY = Math.max(minTranslateY, Math.min(maxTranslateY, translateY));
						} else {
							this.translateX = translateX;
							this.translateY = translateY;
						}
					} else {
						this.translateX = translateX;
						this.translateY = translateY;
					}
					
					this.updateTransform();
				},
				() => {
					// 拖拽结束
					this.isDragging = false;
				},
				() => {
					// 获取当前平移
					return { x: this.translateX, y: this.translateY };
				},
				() => {
					// 获取当前缩放
					return this.scale;
				},
				this.isTrashFile, // 传递 isTrashFile 参数
				(imgEl: HTMLImageElement) => {
					// 图片加载完成后的回调（用于云端/回收站等异步创建的图片）
					this.imgElement = imgEl;
					this.updateTransform(); // 确保缩放/平移状态应用到该元素
				},
				async (message: string, error?: any) => {
					// Logger 回调
					if (this.plugin?.logger) {
						await this.plugin.logger.error(OperationType.PLUGIN_OPERATION, message, {
							imagePath: this.image.path,
							error: error instanceof Error ? error : new Error(String(error))
						});
					}
				},
				this.plugin // 传递插件实例
			);
		
		// 更新图片元素引用
		this.imgElement = this.previewPanel.getImageElement();
		
		// 第二个板块：操作按钮容器（使用组件）
		const imageControlsContainer = previewSection.createDiv('image-controls-container');
		this.controlsPanel = new ImageControlsPanel(
			imageControlsContainer,
			this.allImages,
			this.isScrollMode,
			this.viewMode,
			() => this.zoomIn(),
			() => this.zoomOut(),
			() => this.rotateLeft(),
			() => this.rotateRight(),
			() => this.toggleScrollMode(),
			() => this.cycleViewMode(),
			() => this.showPreviousImage(),
			() => this.showNextImage(),
			() => this.deleteImage(),
			() => this.updateScrollModeIndicator(),
			() => this.updateViewMode(),
			this.isTrashFile, // 传递 isTrashFile 参数
			this.isRemoteImage // 传递 isRemoteImage 参数
		);
		
		// 确保按钮初始状态正确显示（默认缩放模式）
		setTimeout(() => {
		this.updateScrollModeIndicator();
		}, 50);
		
		// 右侧：图片信息区域
		const infoSection = mainContainer.createDiv('image-detail-info');
		this.infoSection = infoSection; // 保存引用以便控制显示/隐藏
		
		// 文件信息内容（直接显示，不使用标签页）
		const basicInfoContent = infoSection.createDiv();
		basicInfoContent.style.cssText = `
			flex: 1;
			overflow-y: visible;
			display: flex;
			flex-direction: column;
			gap: 16px; /* 模块之间的间距 */
			min-height: 0;
		`;
		
		// 文件信息
		const basicInfo = basicInfoContent.createDiv('info-group');
		
		// 文件信息标题（移到info-group内部）
		const infoTitle = basicInfo.createDiv('info-section-title');
		infoTitle.style.cssText = `
			font-size: 1.2em;
			font-weight: 700;
			color: var(--text-normal);
			margin: 0 0 12px 0;
			padding: 0;
			line-height: 1.5;
		`;
		infoTitle.textContent = '📋 文件信息';
		
		const basicList = basicInfo.createEl('ul', { cls: 'info-list' });
		// 设置列表样式，减少间距
		basicList.style.cssText = `
			margin: 0;
			padding: 0;
			list-style: none;
		`;
		
		// 分离文件名和扩展名
		// 对于云端图片，name 已经从 URL 中提取好了，直接使用即可
		const fileNameParts = this.image.name.split('.');
		const fileExtension = fileNameParts.length > 1 ? '.' + fileNameParts[fileNameParts.length - 1] : '';
		const baseFileName = fileNameParts.length > 1 ? fileNameParts.slice(0, -1).join('.') : this.image.name;
		
		// 文件名 - 可编辑
		const fileNameLi = basicList.createEl('li', { cls: 'editable-item' });
		fileNameLi.style.cssText = `
			display: flex;
			align-items: center;
			gap: 0;
			line-height: 1.2;
			flex-wrap: wrap;
			margin-bottom: 6px;
			padding: 6px 8px;
			background-color: var(--background-secondary);
			border-radius: 6px;
			border: 1px solid var(--background-modifier-border);
		`;
		
		// 文件名标签
		const fileNameLabel = fileNameLi.createSpan('info-label');
		fileNameLabel.textContent = '文件名：';
		fileNameLabel.style.fontWeight = 'bold';
		fileNameLabel.style.fontSize = '0.9em'; /* 统一字体大小 */
		fileNameLabel.style.display = 'inline-block';
		fileNameLabel.style.flexShrink = '0';
		fileNameLabel.style.whiteSpace = 'nowrap';
		fileNameLabel.style.paddingTop = '0'; /* 移除上边距，使用居中对齐 */
		/* 宽度自适应，不设置固定宽度 */
		
		// 回收站文件或云端图片：使用纯文本显示
		if (this.isTrashFile || this.isRemoteImage) {
			const fileNameValue = fileNameLi.createSpan('info-value');
			// 显示文件名（云端图片的 name 已从 URL 中提取）
			fileNameValue.textContent = this.image.name;
			fileNameValue.style.fontSize = '0.9em';
			fileNameValue.style.wordBreak = 'break-word';
			fileNameValue.style.flex = '1';
			// 如果是云端图片，添加标识
			if (this.isRemoteImage) {
				const cloudBadge = fileNameLi.createSpan('cloud-badge');
				cloudBadge.textContent = '🌩️ 云端图片';
				cloudBadge.style.cssText = `
					font-size: 0.85em;
					color: var(--text-accent);
					margin-left: 8px;
					padding: 2px 6px;
					background-color: var(--background-modifier-border);
					border-radius: 4px;
					flex-shrink: 0;
				`;
			}
			// 保存引用（用于切换图片时更新）
			this.fileNameInput = null;
		} else {
			// 普通文件：使用输入框
			// 输入框和按钮的容器（按钮始终在输入框右侧）
			const fileNameInputButtonContainer = fileNameLi.createDiv('fileNameInputButtonContainer');
			fileNameInputButtonContainer.style.cssText = `
				display: flex;
				align-items: center;
				flex: 1 1 auto;
				min-width: 0;
				gap: 4px;
				flex-wrap: nowrap;
			`;
			
			// 使用 textarea 支持多行和自适应高度
			const fileNameInput = fileNameInputButtonContainer.createEl('textarea', {
				cls: 'editable-input editable-input-textarea'
			});
			fileNameInput.value = baseFileName;
			fileNameInput.rows = 1; /* 初始单行 */
			this.fileNameInput = fileNameInput;
			
			// 设置样式：支持换行和自适应高度
			fileNameInput.style.resize = 'none';
		fileNameInput.style.overflow = 'hidden';
		fileNameInput.style.wordWrap = 'break-word';
		fileNameInput.style.wordBreak = 'break-word'; /* 允许在任意字符处换行 */
		fileNameInput.style.whiteSpace = 'pre-wrap';
		fileNameInput.style.flex = '0 1 auto'; /* 输入框宽度自适应内容 */
		fileNameInput.style.minWidth = '100px';
		fileNameInput.style.width = 'auto'; /* 根据内容自适应 */
		fileNameInput.style.maxWidth = '100%'; /* 确保不超过容器宽度 */
		fileNameInput.style.boxSizing = 'border-box'; /* 确保 padding 和 border 包含在宽度内 */
		fileNameInput.style.padding = '4px 8px'; /* 减少内边距 */
		
		// 按钮容器（始终在输入框右侧）
		const fileNameButtons = fileNameInputButtonContainer.createDiv('fileNameButtons');
		fileNameButtons.style.cssText = `
			display: flex;
			flex-direction: row;
			gap: 6px;
			flex-shrink: 0;
			align-items: center;
			align-self: center;
		`;
		
		// 自动调整高度的函数（宽度由 flex 自动填充）
		const adjustTextareaSize = () => {
			// 调整高度
			fileNameInput.style.height = 'auto';
			const scrollHeight = fileNameInput.scrollHeight;
			const minHeight = 32; /* 最小高度（约等于单行输入框） */
			const maxHeight = 200; /* 最大高度 */
			const finalHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
			fileNameInput.style.height = finalHeight + 'px';
			
			// 宽度由 flex: 1 1 auto 自动填充，不需要手动计算
			// 输入框会自动填充可用空间，直到按钮位置
			
			// 根据输入框高度决定按钮排列方式
			// 如果高度接近最小高度（单行），按钮水平排列；否则垂直排列
			const isSingleLine = finalHeight <= minHeight + 5; // 允许5px的误差
			if (isSingleLine) {
				fileNameButtons.style.flexDirection = 'row'; /* 水平排列 */
				fileNameButtons.style.gap = '6px';
			} else {
				fileNameButtons.style.flexDirection = 'column'; /* 垂直排列 */
				fileNameButtons.style.gap = '6px';
			}
		};
		
		// 初始调整高度和宽度
		adjustTextareaSize();
		
		// 保存 adjustTextareaSize 函数的引用，以便在其他地方调用
		this.adjustTextareaHeightFunc = adjustTextareaSize;
		
		// 监听窗口大小变化（会在 onClose 中清理）
		const resizeHandler = adjustTextareaSize;
		this.resizeHandler = resizeHandler;
		window.addEventListener('resize', resizeHandler);
		
		// 智能重命名按钮（回收站文件和云端图片不创建）
		if (!this.isTrashFile && !this.isRemoteImage) {
			const pathRenameBtn = fileNameButtons.createEl('button', {
				text: '🔠',
				cls: 'path-rename-btn'
			});
			pathRenameBtn.title = '智能重命名（基于引用笔记）';
			pathRenameBtn.style.padding = '4px 8px';
			pathRenameBtn.style.border = '1px solid var(--background-modifier-border)';
			pathRenameBtn.style.borderRadius = '6px';
			pathRenameBtn.style.backgroundColor = 'var(--background-secondary)';
			pathRenameBtn.style.cursor = 'pointer';
			pathRenameBtn.style.fontSize = '1em';
			pathRenameBtn.style.width = '30px';
			pathRenameBtn.style.minWidth = '30px';
			pathRenameBtn.style.maxWidth = '30px';
			pathRenameBtn.style.height = '30px';
			pathRenameBtn.style.minHeight = '30px';
			pathRenameBtn.style.display = 'flex';
			pathRenameBtn.style.alignItems = 'center';
			pathRenameBtn.style.justifyContent = 'center';
			pathRenameBtn.addEventListener('click', () => this.applyPathNaming());
		}
		
		// 保存/撤销按钮（文件名）
		const fileNameActionBtn = fileNameButtons.createEl('button', {
			cls: 'path-action-btn'
		});
		this.fileNameActionBtn = fileNameActionBtn;
		
		// 初始化：完全隐藏按钮
		const hideFileNameButton = () => {
			fileNameActionBtn.style.display = 'none';
			fileNameActionBtn.style.width = '0';
			fileNameActionBtn.style.height = '0';
			fileNameActionBtn.style.padding = '0';
			fileNameActionBtn.style.margin = '0';
			fileNameActionBtn.style.border = 'none';
			fileNameActionBtn.style.opacity = '0';
			
			// 如果没有可见的按钮，隐藏按钮容器（但保留重命名按钮）
			// 重命名按钮始终显示，所以按钮容器始终显示
		};
		
		// 显示按钮的样式
		const showFileNameButton = () => {
			fileNameActionBtn.style.display = 'flex';
			fileNameActionBtn.style.width = '30px';
			fileNameActionBtn.style.height = '30px';
			fileNameActionBtn.style.padding = '4px 8px';
			fileNameActionBtn.style.margin = '0';
			fileNameActionBtn.style.border = '1px solid var(--background-modifier-border)';
			fileNameActionBtn.style.opacity = '1';
		};
		
		hideFileNameButton(); // 初始完全隐藏
		fileNameActionBtn.style.flexShrink = '0';
		fileNameActionBtn.style.borderRadius = '6px';
		fileNameActionBtn.style.backgroundColor = 'var(--background-secondary)';
		fileNameActionBtn.style.cursor = 'pointer';
		fileNameActionBtn.style.fontSize = '1em';
		fileNameActionBtn.style.minWidth = '30px';
		fileNameActionBtn.style.maxWidth = '30px';
		fileNameActionBtn.style.minHeight = '30px';
		// display 由 hideFileNameButton/showFileNameButton 控制，不在这里设置
		fileNameActionBtn.style.alignItems = 'center';
		fileNameActionBtn.style.justifyContent = 'center';
		
		// 初始化保存的文件名
		this.lastSavedFileName = baseFileName;
		
		// 文件名输入框变化监听（合并高度调整和保存按钮显示）
		let isFileNameInitializing = true; // 标记是否在初始化
		fileNameInput.addEventListener('input', () => {
			// 自动调整高度
			if (this.adjustTextareaHeightFunc) {
				this.adjustTextareaHeightFunc();
			}
			
			const currentValue = fileNameInput.value.trim();
			
			// 如果还在初始化，标记为已完成（在检查之前）
			if (isFileNameInitializing) {
				isFileNameInitializing = false;
			}
			
			// 检查是否有文件名修改（用于显示/隐藏保存按钮）
			const fileNameChanged = currentValue !== this.lastSavedFileName;
			if (fileNameChanged) {
				// 显示保存按钮
				fileNameActionBtn.textContent = '✅';
				fileNameActionBtn.title = '保存：保存文件名修改';
				showFileNameButton();
			} else {
				// 如果没有变化，隐藏按钮
				hideFileNameButton();
			}
		});
		
		// 文件名保存/撤销按钮点击事件
		fileNameActionBtn.addEventListener('click', async () => {
			// 检查图片信息是否有效
			if (!this.image || !this.image.name || !this.image.path) {
				new Notice('❌ 图片信息无效');
				return;
			}
			
			if (fileNameActionBtn.textContent === '✅') {
				// 保存文件名（只保存文件名，不改变路径）
				const newBaseName = fileNameInput.value.trim();
				
				// 验证文件名
				if (!newBaseName) {
					new Notice('❌ 文件名不能为空');
					return;
				}
				
				if (!PathValidator.isValidFileName(newBaseName + fileExtension)) {
					new Notice('❌ 文件名包含非法字符或格式不正确');
					return;
				}
				
				try {
					// 先保存当前文件名作为 beforeSaveFileName，用于撤销
					this.beforeSaveFileName = this.image.name;
					
					// 获取当前路径（不修改路径）
					const currentPath = this.image.path.includes('/')
						? this.image.path.substring(0, this.image.path.lastIndexOf('/'))
						: '';
					
					// 保存，但不重新加载视图（只保存文件名，路径保持不变）
					await this.saveChanges(newBaseName, fileExtension, currentPath, false);
					
					// 只有保存成功后才更新状态
					fileNameInput.value = newBaseName;
					if (this.adjustTextareaHeightFunc) {
						this.adjustTextareaHeightFunc();
					}
					this.lastSavedFileName = newBaseName;
					fileNameActionBtn.textContent = '↪️';
					fileNameActionBtn.title = '撤销：撤销刚才的文件名修改';
					showFileNameButton();
				} catch (error) {
					// 保存失败，不更新按钮状态
					if (this.plugin?.logger) {
						await this.plugin.logger.error(OperationType.RENAME, '保存文件名失败', {
							error: error as Error,
							imagePath: this.image.path,
							imageName: this.image.name
						});
					}
					// 错误提示由 saveChanges 内部处理
				}
			} else if (fileNameActionBtn.textContent === '↪️') {
				// 撤销：恢复到保存前的文件名
				if (!this.beforeSaveFileName) {
					new Notice('没有可撤销的更改');
					return;
				}
				
				try {
					// 从 beforeSaveFileName 中提取文件名（不包含路径）
					const undoToName = this.beforeSaveFileName.split('/').pop() || '';
					const undoToNameParts = undoToName.split('.');
					const undoToExtension = undoToNameParts.length > 1 ? '.' + undoToNameParts[undoToNameParts.length - 1] : '';
					const undoToBaseName = undoToNameParts.length > 1 ? undoToNameParts.slice(0, -1).join('.') : undoToName;
					
					// 恢复文件名输入框
					fileNameInput.value = undoToBaseName;
					if (this.adjustTextareaHeightFunc) {
						this.adjustTextareaHeightFunc();
					}
					
					// 使用保存时的路径
					let undoPath = '';
					const pathParts = this.beforeSaveFileName.split('/');
					if (pathParts.length > 1) {
						pathParts.pop(); // 移除文件名部分
						undoPath = pathParts.join('/');
					}
					
					// 保存撤销后的文件名
					await this.saveChanges(undoToBaseName, undoToExtension, undoPath, false);
					
					// 更新保存的文件名
					this.lastSavedFileName = undoToBaseName;
					
					// 清除撤销标记
					this.beforeSaveFileName = '';
					hideFileNameButton();
					
					new Notice('✅ 已撤销文件名修改');
				} catch (error) {
					if (this.plugin?.logger) {
						await this.plugin.logger.error(OperationType.RENAME, '撤销文件名失败', {
							error: error as Error,
							imagePath: this.image.path,
							imageName: this.image.name
						});
					}
					new Notice('❌ 撤销文件名失败');
				}
			}
		});
		
		// 文件名输入框快捷键：Enter 键保存（确认）
		fileNameInput.addEventListener('keydown', async (e) => {
			if (e.key === 'Enter') {
				// 如果按住 Ctrl 或 Cmd，允许换行（用于输入多行文件名）
				if (e.ctrlKey || e.metaKey) {
					// 允许换行
					return;
				}
				
				// 普通 Enter 键：触发保存（确认）
				e.preventDefault();
				// 如果保存按钮可见，触发保存
				if (fileNameActionBtn.textContent === '✅') {
					fileNameActionBtn.click();
				}
			}
		});
		} // else 块结束（普通文件的文件名输入框）
		
		// 路径 - 可编辑
		const pathLi = basicList.createEl('li', { cls: 'editable-item path-input-container' });
		pathLi.style.cssText = `
			display: flex;
			align-items: center;
			gap: 0;
			line-height: 1.2;
			flex-wrap: wrap;
			margin-bottom: 6px;
			padding: 6px 8px;
			background-color: var(--background-secondary);
			border-radius: 6px;
			border: 1px solid var(--background-modifier-border);
		`;
		
		// 路径标签
		const pathLabel = pathLi.createSpan('info-label');
		pathLabel.textContent = '位置：';
		pathLabel.style.fontWeight = 'bold';
		pathLabel.style.fontSize = '0.9em'; /* 统一字体大小 */
		pathLabel.style.display = 'inline-block';
		pathLabel.style.flexShrink = '0';
		pathLabel.style.whiteSpace = 'nowrap';
		pathLabel.style.paddingTop = '0'; /* 移除上边距，使用居中对齐 */
		/* 宽度自适应，不设置固定宽度 */
		
		// 提取文件夹路径（不包含文件名）
		// 对于云端图片，路径就是完整的 URL
		let initialDir: string;
		let displayPath: string;
		
		if (this.isRemoteImage) {
			// 云端图片：显示完整 URL
			initialDir = this.image.path;
			displayPath = this.image.path;
		} else {
			// 本地图片：提取文件夹路径
			initialDir = this.image.path.includes('/')
				? this.image.path.substring(0, this.image.path.lastIndexOf('/'))
				: '';
			// 如果在根目录，显示"根目录"
			displayPath = initialDir || '.trash';
		}
		
		// 回收站文件或云端图片：使用纯文本显示
		if (this.isTrashFile || this.isRemoteImage) {
			const pathValue = pathLi.createSpan('info-value');
			pathValue.textContent = displayPath;
			pathValue.style.fontSize = '0.9em';
			pathValue.style.wordBreak = 'break-all';
			pathValue.style.flex = '1';
			// 保存引用（用于切换图片时更新）
			this.pathInput = null;
			// 云端图片：显示元数据缓存位置
			if (this.isRemoteImage && this.plugin?.networkImageCacheAdapter) {
				pathLi.style.flexDirection = 'column';
				pathLi.style.alignItems = 'stretch';
				const cacheLocationWrap = pathLi.createDiv();
				cacheLocationWrap.style.marginTop = '6px';
				cacheLocationWrap.style.paddingTop = '6px';
				cacheLocationWrap.style.borderTop = '1px solid var(--background-modifier-border)';
				cacheLocationWrap.style.fontSize = '0.8em';
				cacheLocationWrap.style.color = 'var(--text-muted)';
				const cacheLabel = cacheLocationWrap.createSpan({ text: '缓存位置：' });
				cacheLabel.style.fontWeight = 'bold';
				const cachePath = this.plugin.networkImageCacheAdapter.getCacheDir();
				const cachePathEl = cacheLocationWrap.createSpan({ text: cachePath });
				cachePathEl.style.wordBreak = 'break-all';
			}
		} else {
			// 普通文件：使用输入框
			// 输入框和按钮的容器（按钮始终在输入框右侧）
			const pathInputButtonContainer = pathLi.createDiv('pathInputButtonContainer');
			pathInputButtonContainer.style.cssText = `
				display: flex;
				align-items: center;
				flex: 1 1 auto;
				min-width: 0;
				gap: 4px;
				flex-wrap: nowrap;
			`;
			
			// 使用 textarea 支持多行和自适应高度
			const pathInput = pathInputButtonContainer.createEl('textarea', {
				cls: 'editable-input editable-input-textarea'
			});
			pathInput.value = displayPath;
			pathInput.rows = 1; /* 初始单行 */
			this.pathInput = pathInput;
			
			// 设置样式：支持换行和自适应高度
			pathInput.style.resize = 'none';
		pathInput.style.overflow = 'hidden';
		pathInput.style.wordWrap = 'break-word';
		pathInput.style.wordBreak = 'break-all'; /* 路径可以在任意字符处换行 */
		pathInput.style.whiteSpace = 'normal'; /* 路径输入框使用 normal，自动换行但不保留换行符 */
		pathInput.style.flex = '1 1 auto'; /* 输入框填充可用空间 */
		pathInput.style.minWidth = '100px';
		pathInput.style.width = '100%'; /* 填充可用宽度 */
		pathInput.style.maxWidth = '100%'; /* 确保不超过容器宽度 */
		pathInput.style.padding = '4px 8px'; /* 减少内边距 */
		pathInput.style.boxSizing = 'border-box'; /* 确保 padding 和 border 包含在宽度内 */
		
		// 按钮容器（始终在输入框右侧）
		const pathButtons = pathInputButtonContainer.createDiv('pathButtons');
		pathButtons.style.cssText = `
			display: flex;
			flex-direction: row;
			gap: 6px;
			flex-shrink: 0;
			align-items: center;
			align-self: center;
		`;
		
		// 自动调整高度的函数（宽度由 flex 自动填充）
		const adjustPathInputSize = () => {
			// 调整高度
			pathInput.style.height = 'auto';
			const scrollHeight = pathInput.scrollHeight;
			const minHeight = 32; /* 最小高度（约等于单行输入框） */
			const maxHeight = 200; /* 最大高度 */
			const finalHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
			pathInput.style.height = finalHeight + 'px';
			
			// 宽度由 flex: 1 1 auto 自动填充，不需要手动计算
			// 输入框会自动填充可用空间，直到按钮位置
			
			// 根据输入框高度决定按钮排列方式
			// 如果高度接近最小高度（单行），按钮水平排列；否则垂直排列
			const isSingleLine = finalHeight <= minHeight + 5; // 允许5px的误差
			if (isSingleLine) {
				pathButtons.style.flexDirection = 'row'; /* 水平排列 */
				pathButtons.style.gap = '6px';
			} else {
				pathButtons.style.flexDirection = 'column'; /* 垂直排列 */
				pathButtons.style.gap = '6px';
			}
		};
		
		// 初始调整高度和宽度
		adjustPathInputSize();
		
		// 保存函数引用以便后续调用
		this.adjustPathInputHeightFunc = adjustPathInputSize;
		
		// 监听输入变化，自动调整高度和宽度
		pathInput.addEventListener('input', () => {
			adjustPathInputSize();
		});
		
		// 监听窗口大小变化
		const pathResizeHandler = adjustPathInputSize;
		window.addEventListener('resize', pathResizeHandler);
		
		// 保存 resize handler 和 adjust 函数以便清理和使用
		this.pathResizeHandler = pathResizeHandler;
		this.adjustPathInputHeightFunc = adjustPathInputSize;
		
		// 创建路径自动完成下拉列表 - 附加到 modal 内容区以避免被遮挡
		const suggestionsList = this.contentEl.createDiv('path-suggestions');
		suggestionsList.style.display = 'none';
		
		// 添加定位按钮 📍 - 放在按钮容器中（回收站文件和云端图片不创建）
		if (!this.isTrashFile && !this.isRemoteImage) {
			// 如果按钮已存在，先移除
			if (this.locateBtn && this.locateBtn.parentElement) {
				this.locateBtn.remove();
			}
			
			this.locateBtn = pathButtons.createEl('button', {
				cls: 'path-locate-btn',
				text: '📍'
			}) as HTMLButtonElement;
			this.locateBtn.style.cssText = `
				padding: 4px 8px;
				font-size: 16px;
				line-height: 1;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-secondary);
				border-radius: 6px;
				cursor: pointer;
				flex-shrink: 0;
				height: 30px;
				min-width: 30px;
				width: 30px;
				max-width: 30px;
				display: flex;
				align-items: center;
				justify-content: center;
				box-sizing: border-box;
				transition: background-color 0.2s ease;
			`;
			this.locateBtn.title = '📍 定位到图片：关闭详情页，在新标签页打开图片并定位到文件列表';
			this.locateBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				e.preventDefault();
				await this.locateImage();
			});
			
			this.locateBtn.addEventListener('mouseenter', () => {
				if (this.locateBtn) {
					this.locateBtn.style.backgroundColor = 'var(--background-modifier-hover)';
					this.locateBtn.style.borderColor = 'var(--interactive-accent)';
				}
			});
			this.locateBtn.addEventListener('mouseleave', () => {
				if (this.locateBtn) {
					this.locateBtn.style.backgroundColor = 'var(--background-secondary)';
					this.locateBtn.style.borderColor = 'var(--background-modifier-border)';
				}
			});
		}
		
		// 添加保存/撤销按钮（位置）
		const pathActionBtn = pathButtons.createEl('button', {
			cls: 'path-action-btn'
		});
		
		// 初始化：完全隐藏按钮
		const hideButton = () => {
			pathActionBtn.style.display = 'none';
			pathActionBtn.style.width = '0';
			pathActionBtn.style.padding = '0';
			pathActionBtn.style.margin = '0';
			pathActionBtn.style.border = 'none';
			pathActionBtn.style.opacity = '0';
		};
		
		// 显示按钮的样式
		const showButton = () => {
			pathActionBtn.style.display = 'flex'; /* 使用flex布局 */
			pathActionBtn.style.width = '30px';
			pathActionBtn.style.padding = '4px 8px'; /* 减少内边距 */
			pathActionBtn.style.margin = '0';
			pathActionBtn.style.border = '1px solid var(--background-modifier-border)';
			pathActionBtn.style.opacity = '1';
			pathActionBtn.style.alignItems = 'center';
			pathActionBtn.style.justifyContent = 'center';
			pathActionBtn.style.minWidth = '30px'; /* 最小宽度（缩小） */
			pathActionBtn.style.maxWidth = '30px';
			pathActionBtn.style.minHeight = '30px'; /* 最小高度（缩小） */
		};
		
		hideButton(); // 初始完全隐藏
		pathActionBtn.style.flexShrink = '0';
		pathActionBtn.style.borderRadius = '6px';
		pathActionBtn.style.backgroundColor = 'var(--background-secondary)';
		pathActionBtn.style.cursor = 'pointer';
		pathActionBtn.style.fontSize = '1em'; /* 图标大小（缩小） */
		pathActionBtn.style.minWidth = '30px'; /* 最小宽度（缩小） */
		pathActionBtn.style.maxWidth = '30px';
		pathActionBtn.style.minHeight = '30px'; /* 最小高度（缩小） */
		pathActionBtn.style.display = 'flex'; /* 使用flex布局 */
		pathActionBtn.style.alignItems = 'center'; /* 垂直居中 */
		pathActionBtn.style.justifyContent = 'center'; /* 水平居中 */
		
		// 清理原始路径，确保不会包含重复的文件名
		const cleanedOriginalPath = this.sanitizePath(this.originalPath);
		if (cleanedOriginalPath !== this.originalPath) {
			if (this.plugin?.logger) {
				this.plugin.logger.warn(OperationType.MOVE, '检测到错误的路径，已清理', {
					details: {
				original: this.originalPath,
				cleaned: cleanedOriginalPath
					},
					imagePath: this.image.path
			});
			}
			this.originalPath = cleanedOriginalPath;
		}
		
		// 初始化保存的路径
		this.lastSavedPath = this.originalPath;
		// 初始化保存的目录（用于比较）
		this.lastSavedDir = this.originalPath.includes('/')
			? this.originalPath.substring(0, this.originalPath.lastIndexOf('/'))
			: '';
		
		// 保存按钮点击事件
		pathActionBtn.addEventListener('click', async () => {
			// 检查图片信息是否有效
			if (!this.image || !this.image.name || !this.image.path) {
				new Notice('❌ 图片信息无效');
				return;
			}
			
			if (pathActionBtn.textContent === '✅') {
				// 保存路径（只保存路径，不改变文件名）
				let newPath = pathInput.value.trim();
				
				// 如果路径是"根目录"，转换为空字符串
				if (newPath === '根目录') {
					newPath = '';
				}
				
				// 验证和清理路径
				if (newPath && !PathValidator.isSafePath(newPath)) {
					new Notice('❌ 路径不安全或包含非法字符');
					return;
				}
				
				// 清理路径
				newPath = PathValidator.sanitizePath(newPath);
				
				// 清理路径：移除尾部的文件名（如果用户输入了完整路径）
				// 使用 PathValidator 严格验证是否为文件名
				const pathParts = newPath.split('/');
				const lastPart = pathParts[pathParts.length - 1];
				if (lastPart && PathValidator.isValidFileName(lastPart)) {
					// 确认是文件名，移除它
					pathParts.pop();
					newPath = pathParts.join('/');
				}
				
				// 先保存当前路径作为 beforeSavePath，用于撤销
				const currentFilePath = this.image.path;
				this.beforeSavePath = currentFilePath;
				
				// 调试日志（仅在DEBUG模式下记录）
				if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
					await this.plugin.logger.debug(OperationType.MOVE, '保存操作 - 记录原始路径', {
						details: {
					originalPath: this.beforeSavePath,
					userInput: pathInput.value,
					cleanedPath: newPath,
					imagePath: this.image.path,
					imageName: this.image.name
						}
				});
				}
				
				try {
				// 记录要创建的目录
				this.createdDir = newPath.trim() || '';
				
					// 获取当前文件名（不修改文件名）
					// 对于云端图片，name 已经从 URL 中提取好了，直接使用即可
					const currentFileNameParts = this.image.name.split('.');
					const currentBaseName = currentFileNameParts.length > 1 
						? currentFileNameParts.slice(0, -1).join('.') 
						: this.image.name;
					const currentFileExtension = currentFileNameParts.length > 1 
						? '.' + currentFileNameParts[currentFileNameParts.length - 1] 
						: '';
					
					// 保存，但不重新加载视图（只保存路径，文件名保持不变）
					await this.saveChanges(currentBaseName, currentFileExtension, newPath, false);
					
					// 只有保存成功后才更新状态
				// 保存成功后，更新this.image.path
				// saveChanges方法会更新this.image.path，但可能在不同调用中有所不同
				// 调试日志（仅在DEBUG模式下记录）
				if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
					await this.plugin.logger.debug(OperationType.MOVE, '保存成功后 - 图片信息', {
						details: {
					imagePath: this.image.path,
					imageName: this.image.name,
					beforeSavePath: this.beforeSavePath
						}
				});
				}
				
				// 更新输入框显示新路径（只显示文件夹路径）
				const currentDir = this.image.path.includes('/')
					? this.image.path.substring(0, this.image.path.lastIndexOf('/'))
					: '';
					pathInput.value = currentDir || '根目录';
					if (this.adjustPathInputHeightFunc) {
						this.adjustPathInputHeightFunc();
					}
				this.lastSavedPath = this.image.path;
				this.lastSavedDir = currentDir; // 更新保存的目录
				
				// 按钮变为撤销
				pathActionBtn.textContent = '↪️';
				pathActionBtn.title = '撤销：撤销刚才的修改，文件位置恢复上次，路径恢复上次，删除创建的文件夹';
				showButton();
				} catch (error) {
					// 保存失败，不更新按钮状态
					if (this.plugin?.logger) {
						await this.plugin.logger.error(OperationType.MOVE, '保存路径失败', {
							error: error as Error,
							imagePath: this.image.path,
							imageName: this.image.name
						});
					}
					// 错误提示由 saveChanges 内部处理
				}
			} else if (pathActionBtn.textContent === '↪️') {
				// 撤销：恢复到保存前的路径，删除创建的文件夹
				if (!this.beforeSavePath) {
					new Notice('没有可撤销的更改');
					return;
				}
				
				try {
					// 调试日志（仅在DEBUG模式下记录）
					if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
						await this.plugin.logger.debug(OperationType.MOVE, '开始撤销操作', {
							details: {
						beforeSavePath: this.beforeSavePath,
						currentPath: this.image.path,
						currentName: this.image.name
							}
					});
					}
					
					// 记录当前路径（撤销前的路径）
					const undoFromPath = this.image.path;
					const undoFromName = this.image.name;
					
					// 使用beforeSavePath作为撤销后的目标路径
					const undoToPath = this.beforeSavePath;
					
					// 调试日志（仅在DEBUG模式下记录）
					if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
						await this.plugin.logger.debug(OperationType.MOVE, '撤销路径', {
							details: {
						undoFromPath,
						undoFromName,
						undoToPath,
						beforeSavePath: this.beforeSavePath
							}
					});
					}
					
					// 从 beforeSavePath 中提取文件名
					const pathParts = this.beforeSavePath.split('/');
					const undoToName = pathParts[pathParts.length - 1];
					
					// 调试日志（仅在DEBUG模式下记录）
					if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
						await this.plugin.logger.debug(OperationType.MOVE, '撤销信息', {
							details: {
						undoFromPath,
						undoToPath,
						undoFromName,
						undoToName
							}
					});
					}
					
					// 直接移动文件到撤销后的路径
					const file = this.vault.getAbstractFileByPath(undoFromPath) as TFile;
					if (file) {
					// 检查目标位置是否已存在文件
					const existingFile = this.vault.getAbstractFileByPath(undoToPath);
					if (existingFile) {
						if (this.plugin?.logger) {
							await this.plugin.logger.warn(OperationType.MOVE, '无法撤销：目标位置已存在文件', {
								details: {
							undoToPath,
							undoFromPath,
							existingFile: existingFile.path
								},
								imagePath: this.image.path
						});
						}
						new Notice(`❌ 无法撤销：目标位置已存在文件\n\ntarget: ${undoToPath}\ncurrent: ${undoFromPath}`);
						// 即使失败也清除标记
						this.beforeSavePath = '';
						this.createdDir = '';
						hideButton();
						return;
					}
						
						await this.vault.rename(file, undoToPath);
						
						// 更新图片信息
						this.image.path = undoToPath;
						this.image.name = undoToName;
						
						// 注意：不需要在这里调用 updateReferencesInNotes
						// 因为 vault.rename() 会触发 'rename' 事件
						// ReferenceManager 的事件监听器会自动处理引用更新
						
						// 记录撤销历史
						if (this.historyManager) {
							await this.historyManager.saveHistory({
								timestamp: Date.now(),
								action: 'move',
								fromPath: undoFromPath,
								toPath: undoToPath,
								fromName: undoFromName,
								toName: undoToName
							});
						}
					}
					
					// 更新 originalPath 和 originalFileName，使其与当前实际路径一致
					this.originalPath = this.image.path;
					this.originalFileName = this.image.name;
					
					// 更新输入框和lastSavedPath（只显示文件夹路径）
					const currentDir = this.image.path.includes('/')
						? this.image.path.substring(0, this.image.path.lastIndexOf('/'))
						: '';
					pathInput.value = currentDir || '根目录';
					if (this.adjustPathInputHeightFunc) {
						this.adjustPathInputHeightFunc();
					}
					this.lastSavedPath = this.image.path;
					this.lastSavedDir = currentDir; // 更新保存的目录
					
					// 删除创建的文件夹（如果是空的）
					if (this.createdDir) {
						try {
							// 检查目录是否存在
							const createdDir = this.vault.getAbstractFileByPath(this.createdDir);
							if (createdDir instanceof TFolder && createdDir.children.length === 0) {
								// 目录为空，删除它
								await this.vault.delete(createdDir);
								new Notice(`✅ 已删除创建的文件夹: ${this.createdDir}`);
							}
						} catch (error) {
							if (this.plugin?.logger) {
								await this.plugin.logger.error(OperationType.MOVE, '删除文件夹失败', {
									error: error as Error,
									imagePath: this.image.path
								});
							}
						}
					}
					
					// 清除撤销标记
					this.beforeSavePath = '';
					this.createdDir = '';
					hideButton();
				} catch (error) {
					if (this.plugin?.logger) {
						await this.plugin.logger.error(OperationType.MOVE, '撤销失败', {
							error: error as Error,
							imagePath: this.image.path,
							imageName: this.image.name
						});
					}
					new Notice(`❌ 撤销失败: ${error}`);
					// 失败时也清除标记
					this.beforeSavePath = '';
					this.createdDir = '';
					hideButton();
				}
			}
		});
		
		// 监听输入变化，提供自动完成
		let selectedIndex = -1;
		let suggestions: string[] = [];
		let isInitializing = true; // 标记是否在初始化
		
		pathInput.addEventListener('input', async (e) => {
			const value = (e.target as HTMLTextAreaElement).value;
			
			// 如果还在初始化，标记为已完成（在检查之前）
			if (isInitializing) {
				isInitializing = false;
			}
			
			// 检查是否有路径修改（用于显示/隐藏保存按钮）
			// 比较目录路径而不是完整路径
			const pathChanged = value.trim() !== this.lastSavedDir;
			if (pathChanged) {
				// 显示保存按钮
				pathActionBtn.textContent = '✅';
				pathActionBtn.title = '保存更改';
				showButton();
			} else {
				hideButton();
			}
			
			// 提供自动完成
			const dirName = value.split('/').pop() || '';
			
			if (dirName.length > 0) {
				suggestions = await this.getDirectorySuggestions(value, dirName);
				this.renderPathSuggestions(suggestionsList, suggestions, pathInput, dirName, value);
				selectedIndex = -1;
			} else {
				suggestionsList.style.display = 'none';
			}
		});
		
		// 键盘导航
		pathInput.addEventListener('keydown', async (e) => {
			// 检查是否有"创建新目录"选项（当suggestions.length === 0 且有输入时）
			const currentValue = (e.target as HTMLTextAreaElement).value;
			const dirName = currentValue.split('/').pop() || '';
			// 实际显示的行数：最多4行匹配
			const totalDisplayLines = Math.min(suggestions.length, 4);
			
			// Ctrl+Enter 或 Cmd+Enter 保存
			if ((e.key === 'Enter') && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				const newBaseName = this.fileNameInput?.value.trim() || '';
				const newPath = this.pathInput?.value.trim() || '';
				
				if (!newBaseName || !newPath) {
					new Notice('文件名和路径不能为空');
					return;
				}
				
				await this.saveChanges(newBaseName, fileExtension, newPath);
				return;
			}
			
			if (totalDisplayLines === 0) {
				// 没有建议时，普通 Enter 允许换行（textarea 默认行为）
				return;
			}
			
			// 有建议时的导航
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, totalDisplayLines - 1);
				this.updateSuggestionSelection(suggestionsList, selectedIndex);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				this.updateSuggestionSelection(suggestionsList, selectedIndex);
			} else if (e.key === 'Enter' && selectedIndex >= 0) {
				e.preventDefault();
				const displayedLines = suggestionsList.querySelectorAll('.path-suggestion-line');
				const selectedLine = displayedLines[selectedIndex] as HTMLElement;
				
				if (selectedLine) {
					pathInput.value = selectedLine.textContent || '';
					if (this.adjustPathInputHeightFunc) {
						this.adjustPathInputHeightFunc();
					}
				}
				suggestionsList.style.display = 'none';
			} else if (e.key === 'Escape') {
				suggestionsList.style.display = 'none';
			}
			// 普通 Enter 键允许换行（textarea 默认行为）
		});
		
		// 点击外部关闭建议列表
		this.closeSuggestionsHandler = (e: MouseEvent) => {
			if (!pathInput.contains(e.target as Node) && 
			    !suggestionsList.contains(e.target as Node)) {
				suggestionsList.style.display = 'none';
			}
		};
		document.addEventListener('click', this.closeSuggestionsHandler);
		} // else 块结束（普通文件的路径输入框）
		
		// 格式（单独一行）
		const formatLi = basicList.createEl('li');
		formatLi.style.cssText = `
			display: flex;
			align-items: center;
			line-height: 1.2;
			margin-bottom: 6px;
			padding: 6px 8px;
			background-color: var(--background-secondary);
			border-radius: 6px;
			border: 1px solid var(--background-modifier-border);
		`;
		const formatLabel = formatLi.createSpan('info-label');
		formatLabel.textContent = '格式：';
		formatLabel.style.fontWeight = 'bold';
		formatLabel.style.fontSize = '0.9em'; /* 统一字体大小 */
		/* 宽度自适应，不设置固定宽度 */
		const formatValue = formatLi.createSpan('info-value');
		formatValue.textContent = fileExtension || '无扩展名';
		// 样式由 .info-value CSS 类统一管理
		this.formatValue = formatValue; // 保存引用
		
		// 大小（单独一行）
		const sizeLi = basicList.createEl('li');
		sizeLi.style.cssText = `
			display: flex;
			align-items: center;
			line-height: 1.2;
			margin-bottom: 6px;
			padding: 6px 8px;
			background-color: var(--background-secondary);
			border-radius: 6px;
			border: 1px solid var(--background-modifier-border);
		`;
		const sizeLabel = sizeLi.createSpan('info-label');
		sizeLabel.textContent = '大小：';
		sizeLabel.style.fontWeight = 'bold';
		sizeLabel.style.fontSize = '0.9em'; /* 统一字体大小 */
		/* 宽度自适应，不设置固定宽度 */
		const sizeValue = sizeLi.createSpan('info-value');
		sizeValue.textContent = ImageProcessor.formatFileSize(this.image.size);
		// 样式由 .info-value CSS 类统一管理
		this.sizeValue = sizeValue; // 保存引用
		
		// 尺寸（单独一行，放在大小下面）
		// 始终创建尺寸项，即使没有尺寸信息也创建（隐藏），以便切换图片时能正确显示/隐藏
		const dimensionLi = basicList.createEl('li');
		dimensionLi.style.cssText = `
			display: flex;
			align-items: center;
			line-height: 1.2;
			margin-bottom: 6px;
			padding: 6px 8px;
			background-color: var(--background-secondary);
			border-radius: 6px;
			border: 1px solid var(--background-modifier-border);
		`;
		const dimensionLabel = dimensionLi.createSpan('info-label');
		dimensionLabel.textContent = '尺寸：';
		dimensionLabel.style.fontWeight = 'bold';
		dimensionLabel.style.fontSize = '0.9em'; /* 统一字体大小 */
		/* 宽度自适应，不设置固定宽度 */
		const dimensionValue = dimensionLi.createSpan('info-value');
		this.dimensionValue = dimensionValue; // 保存引用
		this.dimensionLi = dimensionLi; // 保存引用（用于显示/隐藏）
		
		if (this.image.width && this.image.height) {
			dimensionValue.textContent = `${this.image.width} × ${this.image.height} 像素`;
			dimensionLi.style.display = ''; // 显示
		} else {
			dimensionValue.textContent = '未知';
			dimensionLi.style.display = 'none'; // 隐藏
		}
		// 样式由 .info-value CSS 类统一管理
		
		// 导入时间/删除时间（单独一行）
		const importLi = basicList.createEl('li');
		importLi.style.cssText = `
			display: flex;
			align-items: center;
			line-height: 1.2;
			margin-bottom: 6px;
			padding: 6px 8px;
			background-color: var(--background-secondary);
			border-radius: 6px;
			border: 1px solid var(--background-modifier-border);
		`;
		const importLabel = importLi.createSpan('info-label');
		// 回收站文件显示删除时间，普通文件显示导入时间
		importLabel.textContent = this.isTrashFile ? '删除时间：' : '导入时间：';
		importLabel.style.fontWeight = 'bold';
		importLabel.style.fontSize = '0.9em'; /* 统一字体大小 */
		/* 宽度自适应，不设置固定宽度 */
		const importValue = importLi.createSpan('info-value');
		// 样式由 .info-value CSS 类统一管理
		this.importValue = importValue; // 保存引用
		
		// 回收站文件显示删除时间，普通文件显示导入时间
		if (this.isTrashFile) {
			// 回收站文件：显示删除时间（mtime 是 deletedAt）
			importValue.textContent = ImageProcessor.formatDate(this.image.mtime || Date.now());
		} else {
			// 普通文件：获取文件创建时间（导入时间）
			const file = this.vault.getAbstractFileByPath(this.image.path) as TFile;
			if (file && file.stat) {
				// ctime 在某些系统中是状态变更时间，可能晚于修改时间
				// 如果 ctime 晚于 mtime，说明文件可能是被移动/复制过来的，使用 mtime 作为导入时间
				// 否则使用 ctime（更可能是真正的创建时间）
				const ctime = file.stat.ctime;
				const mtime = file.stat.mtime;
				const importTime = ctime > mtime ? mtime : ctime;
				importValue.textContent = ImageProcessor.formatDate(importTime);
			} else {
				importValue.textContent = '未知';
			}
		}
		
		// 哈希值（单独一行）：云端图片显示 URL 哈希，本地/回收站显示 MD5 哈希
		const hashLi = basicList.createEl('li');
		hashLi.style.cssText = `
			display: flex;
			align-items: center;
			line-height: 1.2;
			margin-bottom: 0;
			padding: 6px 8px;
			background-color: var(--background-secondary);
			border-radius: 6px;
			border: 1px solid var(--background-modifier-border);
		`;
		const hashLabel = hashLi.createSpan('info-label');
		this.hashLabel = hashLabel;
		hashLabel.textContent = this.isRemoteImage ? 'URL哈希：' : 'MD5哈希：';
		hashLabel.style.fontWeight = 'bold';
		hashLabel.style.fontSize = '0.9em'; /* 统一字体大小 */
		/* 宽度自适应，不设置固定宽度 */
		const hashValue = hashLi.createSpan('info-value');
		// 设置初始显示
		if (this.isRemoteImage) {
			hashValue.textContent = this.image.urlHash || '计算中...';
			if (!this.image.urlHash) {
				hashValue.style.color = 'var(--text-muted)';
				(async () => {
					try {
						const { hashNetworkImageId } = await import('../network-image/utils');
						const id = await hashNetworkImageId(this.image.name, this.image.path);
						this.image.urlHash = id;
						hashValue.textContent = id;
						hashValue.style.color = '';
					} catch {
						hashValue.textContent = '获取失败';
					}
				})();
			}
		} else {
			hashValue.textContent = this.image.md5 || '计算中...';
			if (!this.image.md5 && this.isTrashFile) {
				hashValue.style.color = 'var(--text-muted)';
			}
		}
		hashValue.style.fontSize = '0.9em';
		hashValue.style.wordBreak = 'break-all'; /* 允许换行 */
		hashValue.style.maxWidth = '100%'; /* 最大宽度 */
		// 其他样式由 .info-value CSS 类统一管理
		this.hashValue = hashValue; // 保存引用
		
		// 异步计算MD5哈希值（仅本地/回收站）
		if (!this.isRemoteImage && !this.image.md5 && this.isTrashFile) {
			// 回收站文件：使用 adapter 读取并计算
			(async () => {
				try {
					const { calculateBufferHash } = await import('../utils/image-hash');
					const arrayBuffer = await this.vault.adapter.readBinary(this.image.path);
					const hash = calculateBufferHash(arrayBuffer);
					
					if (hashValue) {
						hashValue.textContent = hash;
						hashValue.style.color = ''; // 重置颜色
						this.image.md5 = hash;
						
						// 保存到插件缓存
						if (this.plugin?.data && hash) {
							if (!this.plugin.data.hashCache) {
								this.plugin.data.hashCache = {};
							}
							this.plugin.data.hashCache[this.image.name] = {
								hash: hash,
								mtime: this.image.mtime || Date.now(),
								size: this.image.size
							};
							await this.plugin.saveData(this.plugin.data);
						}
					}
				} catch (error) {
					if (this.plugin?.logger) {
						await this.plugin.logger.error(OperationType.PLUGIN_OPERATION, 'Failed to calculate MD5 for trash file', {
							imagePath: this.image.path,
							error: error instanceof Error ? error : new Error(String(error))
						});
					}
					if (hashValue) {
						hashValue.textContent = '计算失败';
						hashValue.style.color = 'var(--text-error)';
					}
				}
			})();
		} else if (!this.isRemoteImage && !this.image.md5 && !this.isTrashFile) {
			// 普通本地文件：使用 vault API 计算 MD5
			(async () => {
				try {
					const { calculateFileHash } = await import('../utils/image-hash');
					const fileForHash = this.vault.getAbstractFileByPath(this.image.path) as TFile;
					if (fileForHash) {
						const hash = await calculateFileHash(fileForHash, this.vault);
						hashValue.textContent = hash;
						this.image.md5 = hash;
						// 确保更新后的哈希值也可以选中和换行
						hashValue.style.wordBreak = 'break-all';
						hashValue.style.maxWidth = '100%';
						// 其他样式由 .info-value CSS 类统一管理
					}
				} catch (error) {
					if (this.plugin?.logger) {
						await this.plugin.logger.error(OperationType.SCAN, '计算MD5失败', {
							error: error as Error,
							imagePath: this.image.path
						});
					}
					hashValue.textContent = '计算失败';
				}
			})();
		} else if (!this.isRemoteImage && !this.image.md5 && this.isTrashFile) {
			// 回收站文件如果没有 MD5，显示"无哈希信息"
			hashValue.textContent = '无哈希信息';
		}

		// 链接信息（移到文件信息板块）
		const linkInfo = basicInfoContent.createDiv('info-group');
		// 模块间距由 basicInfoContent 的 gap 统一管理
		const linkTitle = linkInfo.createEl('h3');
		this.linkTitle = linkTitle; // 保存引用
		
		// 优先使用缓存的引用信息，避免每次都重新统计
		if (this.isTrashFile) {
			linkTitle.textContent = '🔗 回收站文件无引用信息';
			linkTitle.style.opacity = '0.6';
		} else if (this.image.referenceCount !== undefined) {
			// 使用缓存的引用数量（立即显示）
			linkTitle.textContent = `🔗 共${this.image.referenceCount}条引用`;
		} else {
			// 没有缓存，显示统计中并异步获取
			linkTitle.textContent = '🔗 统计中...';
			(async () => {
				if (this.referenceManager) {
					const references = await this.referenceManager.findImageReferences(this.image.path, this.image.name);
					// 更新缓存
					this.image.references = references;
					this.image.referenceCount = references.length;
					this.image.referencesUpdatedAt = Date.now();
					linkTitle.textContent = `🔗 共${references.length}条引用`;
				} else {
					linkTitle.textContent = '🔗 共0条引用';
				}
			})();
		}
		
		// 代码引用区域
		const linkContainer = linkInfo.createDiv('link-container');
		linkContainer.style.position = 'relative'; // 为 tooltip 定位提供参考
		
		// Markdown链接
		const mdLinkRow = linkContainer.createDiv('link-row');
		mdLinkRow.style.display = 'flex';
		mdLinkRow.style.alignItems = 'center';
		mdLinkRow.style.gap = '8px';
		mdLinkRow.style.marginBottom = '6px';
		
		const mdLink = `![${this.image.name}](${this.image.path})`;
		const mdInput = mdLinkRow.createEl('input', {
			type: 'text',
			value: mdLink,
			cls: 'link-input'
		});
		mdInput.style.flex = '1 1 auto';
		mdInput.style.minWidth = '0';
		mdInput.readOnly = true;
		mdInput.style.cursor = 'pointer';
		this.mdInput = mdInput; // 保存引用
		
		// 创建自定义悬浮提示
		const mdTooltip = mdLinkRow.createDiv('link-tooltip');
		mdTooltip.textContent = '点击复制Markdown链接';
		mdTooltip.style.cssText = `
			position: absolute;
			background: var(--background-primary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 6px;
			padding: 8px 12px;
			font-size: 12px;
			color: var(--text-normal);
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
			z-index: 1000;
			opacity: 0;
			pointer-events: none;
			transition: opacity 0.2s ease;
			max-width: 400px;
			word-break: break-all;
			white-space: normal;
			line-height: 1.5;
			display: none;
		`;
		
		// 悬浮显示提示
		mdInput.addEventListener('mouseenter', (e) => {
			const inputRect = mdInput.getBoundingClientRect();
			const containerRect = linkContainer.getBoundingClientRect();
			mdTooltip.style.display = 'block';
			// 相对于容器的位置
			mdTooltip.style.left = `${inputRect.left - containerRect.left}px`;
			mdTooltip.style.top = `${inputRect.bottom - containerRect.top + 8}px`;
			setTimeout(() => {
				mdTooltip.style.opacity = '1';
			}, 10);
		});
		
		mdInput.addEventListener('mouseleave', () => {
			mdTooltip.style.opacity = '0';
			setTimeout(() => {
				mdTooltip.style.display = 'none';
			}, 200);
		});
		
		mdInput.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(mdLink);
				// 不再显示 Notice，仅通过悬浮提示
			} catch (error) {
				if (this.plugin?.logger) {
					await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '复制Markdown链接失败', {
						error: error as Error
					});
				}
				// 降级到旧方法
				mdInput.select();
				document.execCommand('copy');
			}
		});

		// HTML链接
		const htmlLinkRow = linkContainer.createDiv('link-row');
		htmlLinkRow.style.display = 'flex';
		htmlLinkRow.style.alignItems = 'center';
		htmlLinkRow.style.gap = '8px';
		
		const htmlLink = `<img src="${this.image.path}" alt="${this.image.name}">`;
		const htmlInput = htmlLinkRow.createEl('input', {
			type: 'text',
			value: htmlLink,
			cls: 'link-input'
		});
		htmlInput.style.flex = '1 1 auto';
		htmlInput.style.minWidth = '0';
		htmlInput.readOnly = true;
		htmlInput.style.cursor = 'pointer';
		this.htmlInput = htmlInput; // 保存引用
		
		// 创建自定义悬浮提示
		const htmlTooltip = htmlLinkRow.createDiv('link-tooltip');
		htmlTooltip.textContent = '点击复制HTML链接';
		htmlTooltip.style.cssText = `
			position: absolute;
			background: var(--background-primary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 6px;
			padding: 8px 12px;
			font-size: 12px;
			color: var(--text-normal);
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
			z-index: 1000;
			opacity: 0;
			pointer-events: none;
			transition: opacity 0.2s ease;
			max-width: 400px;
			word-break: break-all;
			white-space: normal;
			line-height: 1.5;
			display: none;
		`;
		
		// 悬浮显示提示
		htmlInput.addEventListener('mouseenter', (e) => {
			const inputRect = htmlInput.getBoundingClientRect();
			const containerRect = linkContainer.getBoundingClientRect();
			htmlTooltip.style.display = 'block';
			// 相对于容器的位置
			htmlTooltip.style.left = `${inputRect.left - containerRect.left}px`;
			htmlTooltip.style.top = `${inputRect.bottom - containerRect.top + 8}px`;
			setTimeout(() => {
				htmlTooltip.style.opacity = '1';
			}, 10);
		});
		
		htmlInput.addEventListener('mouseleave', () => {
			htmlTooltip.style.opacity = '0';
			setTimeout(() => {
				htmlTooltip.style.display = 'none';
			}, 200);
		});
		
		htmlInput.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(htmlLink);
				// 不再显示 Notice，仅通过悬浮提示
			} catch (error) {
				if (this.plugin?.logger) {
					await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '复制HTML链接失败', {
						error: error as Error
					});
				}
				// 降级到旧方法
				htmlInput.select();
				document.execCommand('copy');
			}
		});

		// 当前图片在笔记中的引用
		const refListContainer = linkInfo.createDiv('reference-list-container');
		this.refListContainer = refListContainer; // 保存引用
		
		// 延迟渲染引用列表，等待图片加载完成以获取尺寸信息
		// 如果图片已有尺寸信息，立即渲染；否则等待图片加载完成
		// 回收站文件不渲染引用列表
		if (this.isTrashFile) {
			// 不渲染引用列表
		} else if (this.image.width && this.image.height) {
		this.renderImageReferences(refListContainer);
		} else {
			// 如果图片没有尺寸信息，等待图片加载完成后再渲染
			setTimeout(() => {
				// 再次检查是否是回收站文件
				if (this.isTrashFile) return;
				
				// 检查图片元素是否已加载
				if (this.imgElement && this.imgElement.complete && this.imgElement.naturalWidth > 0) {
					// 图片已加载，更新尺寸信息
					if (!this.image.width || !this.image.height) {
						this.image.width = this.imgElement.naturalWidth;
						this.image.height = this.imgElement.naturalHeight;
						// 更新尺寸显示
						if (this.dimensionValue && this.dimensionLi) {
							this.dimensionValue.textContent = `${this.image.width} × ${this.image.height} 像素`;
							this.dimensionLi.style.display = ''; // 显示尺寸项
						}
					}
					// 渲染引用列表
					this.renderImageReferences(refListContainer);
				} else if (this.imgElement) {
					// 图片未加载，等待加载完成
					const onImageLoad = () => {
						// 再次检查是否是回收站文件
						if (this.isTrashFile) {
							this.imgElement?.removeEventListener('load', onImageLoad);
							return;
						}
						
						if (!this.image.width || !this.image.height) {
							this.image.width = this.imgElement!.naturalWidth;
							this.image.height = this.imgElement!.naturalHeight;
							// 更新尺寸显示
							if (this.dimensionValue && this.dimensionLi) {
								this.dimensionValue.textContent = `${this.image.width} × ${this.image.height} 像素`;
								this.dimensionLi.style.display = ''; // 显示尺寸项
							}
						}
						// 渲染引用列表
						this.renderImageReferences(refListContainer);
						this.imgElement?.removeEventListener('load', onImageLoad);
					};
					this.imgElement.addEventListener('load', onImageLoad);
				} else {
					// 如果图片元素还不存在，直接渲染（尺寸信息可能在后续更新）
					// 回收站文件不渲染
					if (!this.isTrashFile) {
						this.renderImageReferences(refListContainer);
					}
				}
			}, 100);
		}

		// 操作记录容器（移到文件信息板块，放在链接后面）
		const historyContainer = basicInfoContent.createDiv('image-history-container');
		// 显示标题（因为不再有标签页按钮）
		this.historyPanel = new ImageHistoryPanel(
			historyContainer,
			this.image,
			this.app,
			this.plugin,
			true // 显示标题
		);

		// 监听笔记内拖拽改尺寸，刷新引用列表以同步显示尺寸
		if (this.plugin && typeof this.plugin.registerNoteImageSizeUpdated === 'function') {
			const cb = (imagePath: string) => {
				if (this.image && imagePath === this.image.path && this.refListContainer) {
					this.refreshReferencesForNoteSizeUpdate();
				}
			};
			this.plugin.registerNoteImageSizeUpdated(cb);
			this.noteImageSizeUpdatedUnregister = () => {
				if (this.plugin && typeof this.plugin.unregisterNoteImageSizeUpdated === 'function') {
					this.plugin.unregisterNoteImageSizeUpdated(cb);
				}
			};
		}
	}

	zoomIn() {
		this.scale = Math.min(this.scale + 0.1, 3);
		this.updateZoom();
	}

	zoomOut() {
		this.scale = Math.max(this.scale - 0.1, 0.3);
		this.updateZoom();
	}

	zoomReset() {
		this.scale = 1;
		this.updateZoom();
	}

	async rotateLeft() {
		this.rotate -= 90;
		this.updateTransform();
		// 仅预览旋转效果，不保存到文件
	}

	async rotateRight() {
		this.rotate += 90;
		this.updateTransform();
		// 仅预览旋转效果，不保存到文件
	}

	// 保存旋转后的图片
	async saveRotatedImage(degrees: number) {
		try {
			const file = this.vault.getAbstractFileByPath(this.image.path) as TFile;
			if (!file) {
				new Notice('文件不存在');
				return;
			}

			const arrayBuffer = await this.vault.adapter.readBinary(file.path);
			const editedBuffer = await editImage(arrayBuffer, { rotate: degrees });
			await this.vault.adapter.writeBinary(file.path, editedBuffer);

			// 更新图片尺寸
			if (degrees === 90 || degrees === -90) {
				const tempWidth = this.image.width;
				this.image.width = this.image.height;
				this.image.height = tempWidth;
			}

			// 使用新日志系统记录
			if (this.plugin?.logger) {
				await this.plugin.logger.info(
					OperationType.ROTATE,
					`旋转图片: ${this.image.name} (${degrees > 0 ? '+' : ''}${degrees}°)`,
					{
						imageHash: this.image.md5,
						imagePath: this.image.path,
						imageName: this.image.name,
						details: {
							degrees: degrees,
							originalWidth: degrees === 90 || degrees === -90 ? this.image.height : this.image.width,
							originalHeight: degrees === 90 || degrees === -90 ? this.image.width : this.image.height,
							newWidth: this.image.width,
							newHeight: this.image.height
						}
					}
				);
			}

			new Notice('旋转已保存');
		} catch (error) {
			new Notice('旋转保存失败');
			
			// 记录错误日志
			if (this.plugin?.logger) {
				await this.plugin.logger.error(
					OperationType.ROTATE,
					`旋转图片失败: ${this.image.name}`,
					{
						imageHash: this.image.md5,
						imagePath: this.image.path,
						imageName: this.image.name,
						error: error as Error
					}
				);
			}
		}
	}

	rotateReset() {
		this.rotate = 0;
		this.updateTransform();
	}

	resetTransform() {
		this.scale = 1;
		this.rotate = 0;
		this.viewMode = 'fit'; // 重置为适应窗口模式
		this.updateTransform();
		this.updateViewMode();
	}

	updateZoom() {
		this.updateTransform();
	}

	toggleScrollMode() {
		this.isScrollMode = !this.isScrollMode;
		this.updateScrollModeIndicator();
		
		// 更新预览面板
		if (this.previewPanel) {
			this.previewPanel.updateWheelMode(this.isScrollMode);
		}
	}

	updateScrollModeIndicator() {
		const btn = this.modalEl.querySelector('.scroll-mode-btn');
		
		if (btn) {
			if (this.isScrollMode) {
				btn.classList.add('active');
				btn.setAttribute('title', '切换图片');
			} else {
				btn.classList.remove('active');
				btn.setAttribute('title', '缩放图片');
			}
		}
	}

	/**
	 * 切换查看模式：适应窗口 <-> 1:1 切换（并还原图片位置）
	 */
	cycleViewMode() {
		// 还原图片缩放和旋转
		this.scale = 1;
		this.rotate = 0;
		this.translateX = 0;
		this.translateY = 0;
		this.updateTransform();
		
		// 切换模式
		if (this.viewMode === 'fit') {
			this.viewMode = '1:1';
		} else {
			this.viewMode = 'fit';
		}
		this.updateViewMode();
	}

	/**
	 * 更新查看模式的显示
	 */
	updateViewMode() {
		// 使用 updateTransform 来统一更新图片样式（避免代码重复）
		this.updateTransform();
		
		// 更新按钮状态和提示
		const btn = this.modalEl.querySelector('.view-mode-btn');
		if (btn) {
			if (this.viewMode === 'fit') {
				btn.classList.add('active');
				btn.textContent = '⛶';
				btn.setAttribute('title', '适应窗口 (点击切换到1:1并还原位置)');
			} else if (this.viewMode === '1:1') {
				btn.classList.remove('active');
				btn.textContent = '1:1';
				btn.setAttribute('title', '1:1显示 (点击切换到适应窗口并还原位置)');
			}
		}
		
		// 静默更新 controlsPanel 的内部状态，避免触发回调导致循环调用
		if (this.controlsPanel) {
			this.controlsPanel.setViewMode(this.viewMode);
		}
	}

	showPreviousImage() {
		if (this.currentIndex > 0 && this.allImages.length > 0) {
			this.currentIndex--;
			const newImage = this.allImages[this.currentIndex];
			if (newImage && newImage.name && newImage.path) {
				this.image = newImage;
				this.updateImageInComponents();
			}
		}
	}

	showNextImage() {
		if (this.currentIndex < this.allImages.length - 1 && this.allImages.length > 0) {
			this.currentIndex++;
			const newImage = this.allImages[this.currentIndex];
			if (newImage && newImage.name && newImage.path) {
				this.image = newImage;
				this.updateImageInComponents();
			}
		}
	}

	showFirstImage() {
		if (this.allImages.length > 0) {
			this.currentIndex = 0;
			const newImage = this.allImages[this.currentIndex];
			if (newImage && newImage.name && newImage.path) {
				this.image = newImage;
				this.updateImageInComponents();
			}
		}
	}

	showLastImage() {
		if (this.allImages.length > 0) {
			this.currentIndex = this.allImages.length - 1;
			const newImage = this.allImages[this.currentIndex];
			if (newImage && newImage.name && newImage.path) {
				this.image = newImage;
				this.updateImageInComponents();
			}
		}
	}
	
	/**
	 * 更新组件中的图片（切换图片时使用）
	 */
	private updateImageInComponents() {
		// 检查图片信息是否有效
		if (!this.image || !this.image.name || !this.image.path) {
			return;
		}
		
		const isIgnored = this.isIgnoredFile(this.image.name);
		
		// 更新预览面板
		if (this.previewPanel) {
			this.previewPanel.updateImage(this.image, isIgnored);
			this.imgElement = this.previewPanel.getImageElement();
			
				// 等待图片加载完成后，优化长条形图片的显示，并更新尺寸信息
			if (this.imgElement) {
				const onImageLoad = () => {
						// 如果图片没有尺寸信息，从图片元素中获取
						if (!this.image.width || !this.image.height) {
							const naturalWidth = this.imgElement!.naturalWidth;
							const naturalHeight = this.imgElement!.naturalHeight;
							if (naturalWidth > 0 && naturalHeight > 0) {
								this.image.width = naturalWidth;
								this.image.height = naturalHeight;
								// 更新尺寸显示
								if (this.dimensionValue && this.dimensionLi) {
									this.dimensionValue.textContent = `${this.image.width} × ${this.image.height} 像素`;
									this.dimensionLi.style.display = ''; // 显示尺寸项
								}
								// 如果引用列表已经渲染，需要重新渲染以显示智能尺寸建议（回收站文件除外）
								if (this.refListContainer && !this.isTrashFile) {
									this.renderImageReferences(this.refListContainer);
								}
							}
						}
						
					// 如果是长条形图片，优化显示
					if (this.isLongImage()) {
						this.updateTransform();
					}
					this.imgElement?.removeEventListener('load', onImageLoad);
					this.imgElement?.removeEventListener('error', onImageError);
				};
				
				const onImageError = () => {
					// 图片加载失败时也清理监听器
					this.imgElement?.removeEventListener('load', onImageLoad);
					this.imgElement?.removeEventListener('error', onImageError);
				};
				
				if (this.imgElement.complete && this.imgElement.naturalWidth > 0) {
					// 图片已加载，立即执行
					setTimeout(onImageLoad, 50);
				} else {
					// 图片未加载，等待加载完成
					this.imgElement.addEventListener('load', onImageLoad);
					this.imgElement.addEventListener('error', onImageError);
				}
			}
		}
		
		// 更新操作记录面板
		if (this.historyPanel) {
			this.historyPanel.updateImage(this.image);
		}
		
		// 更新文件名和路径输入框（仅对本地图片，云端图片的输入框是只读的）
		if (this.fileNameInput && !this.isRemoteImage) {
			const fileNameParts = this.image.name.split('.');
			const baseFileName = fileNameParts.length > 1 
				? fileNameParts.slice(0, -1).join('.') 
				: this.image.name;
			this.fileNameInput.value = baseFileName;
			if (this.adjustTextareaHeightFunc) {
				this.adjustTextareaHeightFunc();
			}
			this.lastSavedFileName = baseFileName;
			
			// 隐藏文件名保存按钮
			if (this.fileNameActionBtn) {
				this.fileNameActionBtn.style.display = 'none';
				this.fileNameActionBtn.style.width = '0';
				this.fileNameActionBtn.style.padding = '0';
				this.fileNameActionBtn.style.margin = '0';
				this.fileNameActionBtn.style.border = 'none';
				this.fileNameActionBtn.style.opacity = '0';
				this.beforeSaveFileName = '';
			}
		}
		
		if (this.pathInput) {
			const initialDir = this.image.path.includes('/')
				? this.image.path.substring(0, this.image.path.lastIndexOf('/'))
				: '';
			this.pathInput.value = initialDir || '根目录';
			if (this.adjustPathInputHeightFunc) {
				this.adjustPathInputHeightFunc();
			}
		}
		
		// 更新基本信息显示
		// 更新格式（对于云端图片，name 已经从 URL 中提取好了，直接使用即可）
		if (this.formatValue) {
			const fileNameParts = this.image.name.split('.');
			const fileExtension = fileNameParts.length > 1 ? '.' + fileNameParts[fileNameParts.length - 1] : '';
			this.formatValue.textContent = fileExtension || '无扩展名';
		}
		
		// 更新大小
		if (this.sizeValue) {
			this.sizeValue.textContent = ImageProcessor.formatFileSize(this.image.size);
		}
		
		// 更新尺寸
		if (this.dimensionValue && this.dimensionLi) {
			if (this.image.width && this.image.height) {
				this.dimensionValue.textContent = `${this.image.width} × ${this.image.height} 像素`;
				this.dimensionLi.style.display = ''; // 显示尺寸项
			} else {
				this.dimensionValue.textContent = '未知';
				this.dimensionLi.style.display = 'none'; // 隐藏尺寸项
			}
		}
		
		// 更新导入时间/删除时间
		if (this.importValue) {
			if (this.isTrashFile) {
				// 回收站文件：显示删除时间（mtime 是 deletedAt）
				this.importValue.textContent = ImageProcessor.formatDate(this.image.mtime || Date.now());
			} else {
				// 普通文件：显示导入时间
				const file = this.vault.getAbstractFileByPath(this.image.path) as TFile;
				if (file && file.stat) {
					const ctime = file.stat.ctime;
					const mtime = file.stat.mtime;
					const importTime = ctime > mtime ? mtime : ctime;
					this.importValue.textContent = ImageProcessor.formatDate(importTime);
				} else {
					this.importValue.textContent = '未知';
				}
			}
		}
		
		// 更新哈希（云端为 URL 哈希，本地/回收站为 MD5）
		if (this.hashLabel) {
			this.hashLabel.textContent = this.isRemoteImage ? 'URL哈希：' : 'MD5哈希：';
		}
		if (this.hashValue) {
			if (this.isRemoteImage) {
				this.hashValue.textContent = this.image.urlHash || '计算中...';
				this.hashValue.style.color = this.image.urlHash ? '' : 'var(--text-muted)';
				if (!this.image.urlHash) {
					(async () => {
						try {
							const { hashNetworkImageId } = await import('../network-image/utils');
							const id = await hashNetworkImageId(this.image.name, this.image.path);
							this.image.urlHash = id;
							if (this.hashValue) {
								this.hashValue.textContent = id;
								this.hashValue.style.color = '';
							}
						} catch {
							if (this.hashValue) this.hashValue.textContent = '获取失败';
						}
					})();
				}
			} else {
				// 回收站文件如果没有 MD5，显示"计算中..."并异步计算
				if (this.isTrashFile && !this.image.md5) {
					this.hashValue.textContent = '计算中...';
					this.hashValue.style.color = 'var(--text-muted)';
					(async () => {
						try {
							const { calculateBufferHash } = await import('../utils/image-hash');
							const arrayBuffer = await this.vault.adapter.readBinary(this.image.path);
							const hash = calculateBufferHash(arrayBuffer);
							if (this.hashValue) {
								this.hashValue.textContent = hash;
								this.hashValue.style.color = '';
								this.image.md5 = hash;
								if (this.plugin?.data && hash) {
									if (!this.plugin.data.hashCache) this.plugin.data.hashCache = {};
									this.plugin.data.hashCache[this.image.name] = { hash, mtime: this.image.mtime || Date.now(), size: this.image.size };
									await this.plugin.saveData(this.plugin.data);
								}
							}
						} catch (error) {
							if (this.plugin?.logger) await this.plugin.logger.error(OperationType.PLUGIN_OPERATION, 'Failed to calculate MD5 for trash file', { imagePath: this.image.path, error: error instanceof Error ? error : new Error(String(error)) });
							if (this.hashValue) { this.hashValue.textContent = '计算失败'; this.hashValue.style.color = 'var(--text-error)'; }
						}
					})();
				} else {
					this.hashValue.textContent = this.image.md5 || '计算中...';
					this.hashValue.style.color = '';
				}
				// 如果还没有MD5，异步计算（普通本地文件）
				if (!this.image.md5 && !this.isTrashFile) {
					(async () => {
						try {
							const { calculateFileHash } = await import('../utils/image-hash');
							const fileForHash = this.vault.getAbstractFileByPath(this.image.path) as TFile;
							if (fileForHash && this.hashValue) {
								const hash = await calculateFileHash(fileForHash, this.vault);
								this.hashValue.textContent = hash;
								this.image.md5 = hash;
								this.hashValue.style.wordBreak = 'break-all';
								this.hashValue.style.maxWidth = '100%';
							}
						} catch (error) {
							if (this.plugin?.logger) await this.plugin.logger.error(OperationType.SCAN, '计算MD5失败', { error: error as Error, imagePath: this.image.path });
							if (this.hashValue) this.hashValue.textContent = '计算失败';
						}
					})();
				}
			}
		}
		
		// 更新链接信息
		// 更新Markdown链接
		if (this.mdInput) {
			const mdLink = `![${this.image.name}](${this.image.path})`;
			this.mdInput.value = mdLink;
		}
		
		// 更新HTML链接
		if (this.htmlInput) {
			const htmlLink = `<img src="${this.image.path}" alt="${this.image.name}">`;
			this.htmlInput.value = htmlLink;
		}
		
		// 更新链接标题（引用数量）
		if (this.linkTitle) {
			// 回收站文件显示特殊信息
			if (this.isTrashFile) {
				this.linkTitle.textContent = '🔗 回收站文件无引用信息';
				this.linkTitle.style.opacity = '0.6';
			} else if (this.image.referenceCount !== undefined) {
				// 优先使用缓存的引用数量（立即显示）
				this.linkTitle.textContent = `🔗 共${this.image.referenceCount}条引用`;
				this.linkTitle.style.opacity = '1';
			} else {
				// 没有缓存，显示统计中并异步获取
				this.linkTitle.textContent = '🔗 统计中...';
				this.linkTitle.style.opacity = '1';
				(async () => {
					if (this.referenceManager && this.linkTitle) {
						const references = await this.referenceManager.findImageReferences(this.image.path, this.image.name);
						// 更新缓存
						this.image.references = references;
						this.image.referenceCount = references.length;
						this.image.referencesUpdatedAt = Date.now();
						this.linkTitle.textContent = `🔗 共${references.length}条引用`;
					} else if (this.linkTitle) {
						this.linkTitle.textContent = '🔗 共0条引用';
					}
				})();
			}
		}
		
		// 更新引用列表（回收站文件不渲染）
		if (this.refListContainer) {
			this.refListContainer.empty();
			if (!this.isTrashFile) {
				this.renderImageReferences(this.refListContainer);
			}
		}
		
		// 重置缩放和旋转
		this.scale = 1;
		this.rotate = 0;
		this.translateX = 0;
		this.translateY = 0;
		this.viewMode = 'fit';
		
		// 延迟更新，确保图片已加载
		setTimeout(() => {
			this.updateTransform();
			this.updateViewMode();
		}, 100);
		
		// 记录原始值
		this.originalFileName = this.image.name;
		this.originalPath = this.image.path;
		this.lastSavedPath = this.image.path;
		this.lastSavedDir = this.image.path.includes('/')
			? this.image.path.substring(0, this.image.path.lastIndexOf('/'))
			: '';
	}

	// 智能重命名（基于引用笔记的路径）
	async applyPathNaming() {
		// 检查是否为云端图片
		if (this.isRemoteImage) {
			new Notice('🌩️ 云端图片无法使用智能重命名\n云端图片不在本地文件系统中');
			return;
		}
		
		if (!this.plugin) {
			new Notice('插件实例不存在');
			return;
		}

		// 检查是否为锁定文件
		if (this.isIgnoredFile(this.image.name)) {
			new Notice('🔒 此文件已被锁定，无法重命名\n请先解除锁定后重试');
			return;
		}

		// 查找引用该图片的笔记
		const references = await this.findImageReferences(this.image.path);
		
		if (references.length === 0) {
			new Notice('⚠️ 未找到引用此图片的笔记\n无法使用智能重命名');
			return;
		}
		
		// 根据设置选择使用哪个笔记
		let selectedNote = references[0];
		
		if (references.length > 1) {
			const handling = this.plugin.settings.multipleReferencesHandling;
			
			if (handling === 'latest') {
				// 使用最新修改的笔记
				selectedNote = references.reduce((latest, current) => 
					current.file.stat.mtime > latest.file.stat.mtime ? current : latest
				);
			} else if (handling === 'prompt') {
				// 显示选择对话框，让用户选择使用哪个笔记
				const referenceOptions: ReferenceOption[] = references.map(ref => ({
					file: ref.file,
					index: ref.index,
					displayText: ref.file.basename
				}));
				
				const selectedFile = await ReferenceSelectModal.show(this.app, referenceOptions);
				
				if (!selectedFile) {
					// 用户取消了选择
					return;
				}
				
				// 找到选中的引用
				const selectedRef = references.find(ref => ref.file.path === selectedFile.path);
				if (selectedRef) {
					selectedNote = selectedRef;
				} else {
					// 如果找不到，使用第一个（兜底）
					new Notice('⚠️ 未找到选中的引用，使用第一个引用');
					selectedNote = references[0];
				}
			} else if (handling === 'all') {
				new Notice('⚠️ "为每个笔记创建副本" 模式仅在批量操作中支持\n当前使用第一个引用');
			}
			// 'first' 或默认：使用第一个
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
		const imageIndex = selectedNote.index + 1; // 从1开始
		
		// 获取文件扩展名（本地图片，不需要处理云端图片，因为方法开头已检查）
		const fileNameParts = this.image.name.split('.');
		const fileExtension = fileNameParts.length > 1 ? '.' + fileNameParts[fileNameParts.length - 1] : '';
		
		// 生成新文件名：笔记路径前缀_序号.扩展名
		const baseName = pathPrefix || selectedNote.file.basename;
		const newFileName = `${baseName}_${imageIndex}${fileExtension}`;
		
		// 更新输入框
		if (this.fileNameInput) {
			const newBaseName = newFileName.replace(fileExtension, '');
			this.fileNameInput.value = newBaseName;
			if (this.adjustTextareaHeightFunc) {
				this.adjustTextareaHeightFunc();
			}
			
			// 触发 input 事件，让保存按钮显示
			this.fileNameInput.dispatchEvent(new Event('input', { bubbles: true }));
			
			// 如果文件名有变化，显示保存按钮
			if (this.fileNameActionBtn && newBaseName !== this.lastSavedFileName) {
				this.fileNameActionBtn.textContent = '✅';
				this.fileNameActionBtn.title = '保存：保存文件名修改';
				this.fileNameActionBtn.style.display = 'flex';
				this.fileNameActionBtn.style.width = '30px';
				this.fileNameActionBtn.style.height = '30px';
				this.fileNameActionBtn.style.padding = '4px 8px';
				this.fileNameActionBtn.style.margin = '0';
				this.fileNameActionBtn.style.border = '1px solid var(--background-modifier-border)';
				this.fileNameActionBtn.style.opacity = '1';
			}
		}
		
		new Notice(`✅ 已生成文件名: ${newFileName}\n基于笔记: ${selectedNote.file.basename} (第${imageIndex}张图片)`);
	}
	
	// 查找引用该图片的笔记及其序号（使用统一的 ReferenceManager）
	async findImageReferences(imagePath: string): Promise<Array<{file: TFile, index: number}>> {
		// 使用 ReferenceManager 的简化版方法
		if (!this.referenceManager) {
			this.referenceManager = new ReferenceManager(this.app, this.plugin);
		}
		return await this.referenceManager.findImageReferencesSimple(imagePath);
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

	async handleClose() {
		// 检查是否有实际的更改
		const hasChanges = this.hasActualChanges();
		
		if (hasChanges) {
			const choice = await ConfirmModal.show(
				this.app,
				'有未保存的更改',
				'是否保存？\n\n保存：保存后关闭\n放弃：丢弃更改并关闭',
				['保存', '放弃']
			);
			
			if (choice === 'save') {
				// 保存更改
				if (this.fileNameInput && this.pathInput) {
					const fileNameParts = this.image.name.split('.');
					const fileExtension = fileNameParts.length > 1 ? '.' + fileNameParts[fileNameParts.length - 1] : '';
					const newBaseName = this.fileNameInput.value.trim();
					let newPath = this.pathInput.value.trim();
					
					// 处理根目录
					if (newPath === '根目录') {
						newPath = '';
					}
					
					if (newBaseName) {
						await this.saveChanges(newBaseName, fileExtension, newPath);
						this.close();
					} else {
						new Notice('❌ 文件名不能为空');
					}
				}
			} else if (choice === 'discard') {
				// 放弃修改，关闭页面
				this.close();
			}
			// 如果用户点击右上角的X或背景，返回 'cancel'，继续编辑
		} else {
			this.close();
		}
	}
	
	// 清理路径，移除重复的文件名
	sanitizePath(path: string): string {
		if (!path || !path.includes('/')) {
			return path;
		}
		
		const parts = path.split('/');
		if (parts.length < 2) {
			return path;
		}
		
		// 检查最后一个部分是否是文件名（包含扩展名）
		const lastPart = parts[parts.length - 1];
		if (!lastPart.includes('.') || lastPart.startsWith('.')) {
			return path;
		}
		
		// 获取文件名（不含扩展名）
		const fileNameParts = lastPart.split('.');
		const baseFileName = fileNameParts.slice(0, -1).join('.');
		const extension = fileNameParts[fileNameParts.length - 1];
		
		// 检查倒数第二个部分是否与文件名相同
		const secondLastPart = parts[parts.length - 2];
		if (secondLastPart === baseFileName || secondLastPart === lastPart) {
			// 移除重复的目录部分
			const cleanedParts = [...parts];
			cleanedParts.splice(parts.length - 2, 1); // 移除倒数第二个部分
			return cleanedParts.join('/');
		}
		
		return path;
	}
	
	// 检查是否有实际的更改
	hasActualChanges(): boolean {
		if (!this.fileNameInput || !this.pathInput) {
			return false;
		}
		
		const currentFileName = this.fileNameInput.value.trim();
		const currentPath = this.pathInput.value.trim();
		
		// 分离文件名和扩展名进行比较
		const originalParts = this.originalFileName.split('.');
		const originalExtension = originalParts.length > 1 ? '.' + originalParts[originalParts.length - 1] : '';
		const originalBaseName = originalParts.length > 1 ? originalParts.slice(0, -1).join('.') : this.originalFileName;
		
		// 比较文件名
		const fileNameChanged = originalBaseName !== currentFileName;
		
		// 比较路径
		const pathChanged = this.originalPath !== currentPath;
		
		return fileNameChanged || pathChanged;
	}

	async saveChanges(newBaseName: string, fileExtension: string, newPath: string, reloadView: boolean = true) {
		try {
			// 检查是否为云端图片
			if (this.isRemoteImage) {
				new Notice('🌩️ 云端图片无法保存\n云端图片不在本地文件系统中，无法进行重命名或移动操作');
				return;
			}
			
			// 检查是否是锁定的文件
			const isIgnored = this.isIgnoredFile(this.image.name);
			if (isIgnored) {
				const result = await ConfirmModal.show(
					this.app,
					'修改锁定的文件',
					`此文件在锁定列表中，修改后将从锁定列表中移除。\n\n是否继续修改？`,
					['修改并解锁', '取消']
				);
				if (result === 'save') {
					await this.removeFromIgnoredList(this.image.name);
				} else {
					return;
				}
			}

			const file = this.vault.getAbstractFileByPath(this.image.path) as TFile;
			if (!file) {
				new Notice('文件不存在');
				return;
			}
			
			// 组合新文件名
			const newFileName = newBaseName + fileExtension;
			
			// 构建新路径
			// newPath 是用户输入的文件夹路径，需要拼接文件名
			let finalPath: string;
			if (newPath && newPath.trim()) {
				// 移除尾部的 /，然后拼接文件名
				const cleanPath = newPath.replace(/\/+$/, '');
				finalPath = cleanPath + '/' + newFileName;
			} else {
				finalPath = newFileName;
			}

			// 安全检查：使用 PathValidator 验证并清理路径
			const sanitizedPath = PathValidator.validateAndSanitize(finalPath);
			if (!sanitizedPath) {
				new Notice('❌ 包含非法路径字符，请检查输入');
				return;
			}
			finalPath = sanitizedPath;

			// 检查实际变更（比较目录和文件名）
			// 使用实际文件路径进行比较，而不是originalPath（因为它可能已过时）
			const actualOldDir = this.image.path.includes('/') 
				? this.image.path.substring(0, this.image.path.lastIndexOf('/'))
				: '';
			const newDir = finalPath.includes('/')
				? finalPath.substring(0, finalPath.lastIndexOf('/'))
				: '';
			const fileNameChanged = this.image.name !== newFileName;
			const dirChanged = actualOldDir !== newDir;
			
			// 保存旧值，用于更新引用链接和提示信息
			const oldPath = this.image.path;
			const oldName = this.image.name;
			
			// 记录变更信息（只记录实际有变更的）
			const changes: string[] = [];
			if (fileNameChanged) {
				changes.push(`文件名：${this.image.name} → ${newFileName}`);
			}
			if (dirChanged) {
				changes.push(`文件位置：${actualOldDir} → ${newDir}`);
			}
			
			// 如果有变更，执行重命名/移动操作
			if (finalPath !== this.image.path) {
				
				// 检查并创建目标目录（如果不存在）
				if (newDir) {
					const targetFolder = this.vault.getAbstractFileByPath(newDir);
					if (!targetFolder) {
						// 目录不存在，创建它
						try {
							await this.createDirectory(newDir);
							new Notice(`✅ 已创建目录: ${newDir}`);
						} catch (error) {
							new Notice(`❌ 创建目录失败: ${error}`);
							return;
						}
					}
				}
				
				await this.vault.rename(file, finalPath);
				
				// 更新分组数据（如果图片在某个分组中）
				if (this.plugin && (fileNameChanged || dirChanged)) {
					await this.updateGroupDataOnMove(oldPath, finalPath);
				}
				
				// 记录历史（根据实际变更类型）
				if (this.historyManager) {
				if (fileNameChanged && dirChanged) {
					// 既改名又移动
						await this.historyManager.saveHistory({
						timestamp: Date.now(),
						action: 'move',
						fromName: oldName,
						toName: newFileName,
						fromPath: oldPath,
						toPath: finalPath
					});
				} else if (fileNameChanged) {
					// 只改名 - 需要传入路径信息以迁移操作记录
						await this.historyManager.saveHistory({
						timestamp: Date.now(),
						action: 'rename',
						fromName: oldName,
						toName: newFileName,
						fromPath: oldPath,
						toPath: finalPath
					});
				} else if (dirChanged) {
					// 只移动
						await this.historyManager.saveHistory({
						timestamp: Date.now(),
						action: 'move',
						fromPath: oldPath,
						toPath: finalPath
					});
					}
				}
				
				// 更新图片信息
				this.image.name = newFileName;
				this.image.path = finalPath;
				
				// 更新原始值，防止重复提示
				this.originalFileName = newFileName;
				this.originalPath = finalPath;
				
					// 注意：不需要在这里调用 updateReferencesInNotes
				// 因为 vault.rename() 会触发 'rename' 事件
				// ReferenceManager 的事件监听器会自动处理引用更新
			}
			
			// 显示成功信息（只显示实际有变更的）
			if (changes.length > 0) {
				// 构建保存成功的提示信息
				let noticeMessage: string;
				if (fileNameChanged && dirChanged) {
					// 同时修改文件名和位置，显示完整路径变化
					noticeMessage = `移动成功\n${oldPath}\n↓\n${finalPath}`;
				} else if (fileNameChanged) {
					// 只修改文件名
					noticeMessage = `重命名成功\n${oldName}\n↓\n${newFileName}`;
				} else if (dirChanged) {
					// 只修改位置
					noticeMessage = `移动成功\n${oldPath}\n↓\n${finalPath}`;
				} else {
					// 默认（理论上不会到这里）
					noticeMessage = `操作成功`;
				}
				
				new Notice(noticeMessage);
				
				// 重新加载视图（这会更新引用链接和操作记录）
				if (reloadView) {
				this.onOpen();
				}
			} else {
				new Notice('没有需要保存的更改');
			}
		} catch (error) {
			// 保存失败，提供选择：返回修改或恢复原值
			let errorMessage = String(error);
			if (errorMessage.includes('already exists')) {
				errorMessage = '目标位置已存在同名文件！\n请修改文件名或路径后重试。';
			}
			
			const choice = await ConfirmModal.show(
				this.app,
				'保存失败',
				`${errorMessage}\n\n返回：回到编辑界面\n恢复：放弃更改并恢复原始值`,
				['返回', '恢复']
			);
			if (choice === 'discard') {
				// 放弃更改，恢复原始值
				this.onOpen();
			}
			// 否则继续编辑
		}
	}

	async renameFile(newFileName: string) {
		try {
			// 验证文件名合法性
			if (!PathValidator.isValidFileName(newFileName)) {
				new Notice('❌ 文件名包含非法字符');
				return;
			}
			
			// 清理文件名
			const sanitizedFileName = PathValidator.sanitizeFileName(newFileName);
			if (sanitizedFileName !== newFileName) {
				new Notice('⚠️ 文件名已清理，请检查');
			}
			
			const file = this.vault.getAbstractFileByPath(this.image.path) as TFile;
			if (!file) {
				new Notice('❌ 文件不存在');
				return;
			}
			
			// 构建新路径
			const oldPath = this.image.path;
			const pathParts = oldPath.split('/');
			pathParts[pathParts.length - 1] = sanitizedFileName;
			const newPath = pathParts.join('/');
			
			// 验证完整路径安全性
			if (!PathValidator.isSafePath(newPath)) {
				new Notice('❌ 路径不安全');
				return;
			}
			
			// 重命名文件
			await this.vault.rename(file, newPath);
			
			// 更新图片信息
			this.image.name = sanitizedFileName;
			this.image.path = newPath;
			
			new Notice('✅ 文件名已更新');
			
			// 重新加载视图
			this.onOpen();
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice('❌ 重命名失败: ' + errorMsg);
			
			// 记录错误日志
			if (this.plugin?.logger) {
				await this.plugin.logger.error(
					OperationType.RENAME,
					`重命名文件失败: ${this.image.name} -> ${newFileName}`,
					{
						error: error instanceof Error ? error : new Error(errorMsg),
						imagePath: this.image.path,
						imageName: this.image.name,
						details: {
							newFileName: newFileName
						}
					}
				);
			}
		}
	}

	async deleteImage() {
		// 检查是否为云端图片
		if (this.isRemoteImage) {
			new Notice('🌩️ 云端图片无法删除\n云端图片不在本地文件系统中');
			return;
		}
		
		// 检查是否为锁定文件
		if (this.isIgnoredFile(this.image.name)) {
			new Notice('🔒 此文件已被锁定，无法删除\n请先解除锁定后重试');
			return;
		}
		
		// 使用自定义确认对话框
		const confirmMessage = `确定要删除 "${this.image.name}" 吗？\n此操作不可撤销。`;
		
		const choice = await ConfirmModal.show(
			this.app,
			'确认删除',
			confirmMessage
		);
		
		if (choice === 'save') {
			const file = this.vault.getAbstractFileByPath(this.image.path);
			if (!file) {
				new Notice('❌ 文件不存在');
				return;
			}
			
			try {
				// 验证路径安全性（防御性检查）
				if (!PathValidator.isSafePath(this.image.path)) {
					new Notice('❌ 路径不安全，无法删除');
					if (this.plugin?.logger) {
						await this.plugin.logger.error(
							OperationType.DELETE,
							`删除图片失败: 路径不安全`,
							{
								imagePath: this.image.path,
								imageName: this.image.name
							}
						);
					}
					return;
				}
				
				// 记录删除历史
				if (this.historyManager) {
					await this.historyManager.saveHistory({
						timestamp: Date.now(),
						action: 'delete',
						fromName: this.image.name,
						fromPath: this.image.path
					});
				}
				
				// 删除文件
				if (this.plugin?.settings.enablePluginTrash) {
					// 使用插件回收站（moveToTrash 内部已记录日志 OperationType.TRASH）
					const success = await this.plugin.trashManager.moveToTrash(file as TFile);
					if (success) {
						new Notice('✅ 图片已移动到回收站');
					} else {
						new Notice('❌ 移动到回收站失败');
						// 记录失败日志
						if (this.plugin?.logger) {
							await this.plugin.logger.error(
								OperationType.DELETE,
								`删除图片失败: ${this.image.name}`,
								{
									imageHash: this.image.md5,
									imagePath: this.image.path,
									imageName: this.image.name,
									details: {
										reason: '移动到回收站失败',
										useTrash: true
									}
								}
							);
						}
					}
				} else if (this.plugin?.settings.moveToSystemTrash) {
					// Obsidian API 的 delete 方法默认会移到系统回收站（如果支持）
					await this.vault.delete(file);
					new Notice('✅ 图片已删除');
					
					// 记录删除日志
					if (this.plugin?.logger) {
						await this.plugin.logger.info(
							OperationType.DELETE,
							`删除图片: ${this.image.name}`,
							{
								imageHash: this.image.md5,
								imagePath: this.image.path,
								imageName: this.image.name,
								details: {
									path: this.image.path,
									size: this.image.size,
									useSystemTrash: true
								}
							}
						);
					}
				} else {
					// 永久删除
					await this.vault.delete(file);
					new Notice('✅ 图片已永久删除');
					
					// 记录删除日志
					if (this.plugin?.logger) {
						await this.plugin.logger.info(
							OperationType.DELETE,
							`永久删除图片: ${this.image.name}`,
							{
								imageHash: this.image.md5,
								imagePath: this.image.path,
								imageName: this.image.name,
								details: {
									path: this.image.path,
									size: this.image.size,
									permanent: true
								}
							}
						);
					}
				}
				
				this.close();
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				new Notice(`❌ 删除失败: ${errorMsg}`);
				
				// 记录错误
				if (this.plugin?.logger) {
					await this.plugin.logger.error(
						OperationType.DELETE,
						`删除图片失败: ${this.image.name}`,
						{
							error: error instanceof Error ? error : new Error(errorMsg),
							imageHash: this.image.md5,
							imagePath: this.image.path,
							imageName: this.image.name
						}
					);
				}
			}
		}
	}

	/**
	 * 定位到图片文件：关闭详情页，在新标签页打开图片并定位到文件列表
	 */
	async locateImage() {
		try {
			const file = this.vault.getAbstractFileByPath(this.image.path) as TFile;
			if (!file) {
				new Notice('文件不存在');
				return;
			}

			// 关闭详情页
			this.close();

			// 延迟一下确保详情页已关闭
			await new Promise(resolve => setTimeout(resolve, 100));

			// 在新标签页打开图片
			const leaf = this.app.workspace.getLeaf('tab');
			await leaf.openFile(file);

			// 定位到文件列表（图片管理视图）
			try {
				// 尝试获取图片管理视图
				const imageManagerLeaves = this.app.workspace.getLeavesOfType('image-manager-view');
				if (imageManagerLeaves.length > 0) {
					const imageManagerLeaf = imageManagerLeaves[0];
					// @ts-ignore - 访问视图的定位方法
					const view = imageManagerLeaf.view as any;
					if (view && typeof view.locateImage === 'function') {
						view.locateImage(this.image);
						return;
					}
					// 如果视图有定位方法，尝试调用
					if (view && typeof view.scrollToImage === 'function') {
						view.scrollToImage(this.image);
						return;
					}
				}
			} catch (e) {
				// 如果定位失败，继续尝试其他方法
			}

			// 尝试在文件浏览器中定位文件
			try {
				// @ts-ignore - 访问文件浏览器视图类型
				const leaves = this.app.workspace.getLeavesOfType('file-explorer');
				if (leaves.length > 0) {
					const leaf = leaves[0];
					// @ts-ignore - 访问视图的 revealInFolder 方法
					const view = leaf.view as any;
					if (view) {
						if (typeof view.revealInFolder === 'function') {
							view.revealInFolder(file);
							return;
						}
						if (typeof view.revealFile === 'function') {
							view.revealFile(file);
							return;
						}
					}
				}
			} catch (e2) {
				// 如果获取文件浏览器视图失败，继续使用备用方法
			}
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '定位图片失败', {
					error: error as Error,
					imagePath: this.image.path
				});
			}
			// 静默失败，不显示提示
		}
	}

	/**
	 * 检测是否为长条形图片
	 */
	private isLongImage(): boolean {
		if (!this.image.width || !this.image.height) return false;
		
		// 考虑旋转后的尺寸
		const isRotated90or270 = Math.abs(this.rotate % 180) === 90;
		const effectiveWidth = isRotated90or270 ? this.image.height : this.image.width;
		const effectiveHeight = isRotated90or270 ? this.image.width : this.image.height;
		
		// 宽高比 > 3:1 或高宽比 > 3:1 认为是长条形图片
		const aspectRatio = effectiveWidth / effectiveHeight;
		return aspectRatio > 3 || aspectRatio < 1/3;
	}

	/**
	 * 检测是横向长条形还是纵向长条形
	 */
	private isWideImage(): boolean {
		if (!this.image.width || !this.image.height) return false;
		
		const isRotated90or270 = Math.abs(this.rotate % 180) === 90;
		const effectiveWidth = isRotated90or270 ? this.image.height : this.image.width;
		const effectiveHeight = isRotated90or270 ? this.image.width : this.image.height;
		
		return effectiveWidth > effectiveHeight;
	}

	updateTransform() {
		if (this.imgElement) {
			this.imgElement.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale}) rotate(${this.rotate}deg)`;
			// 拖拽时不需要过渡动画，否则会卡顿
			if (!this.isDragging) {
			this.imgElement.style.transition = 'transform 0.3s ease';
			} else {
				this.imgElement.style.transition = 'none';
			}
			
			// 根据查看模式调整图片尺寸限制
			if (this.viewMode === 'fit') {
			// 旋转后调整图片尺寸限制，防止遮挡按钮
			const isRotated90or270 = Math.abs(this.rotate % 180) === 90;
				const isLongImg = this.isLongImage();
				const isWideImg = this.isWideImage();
			
				if (isRotated90or270) {
					// 旋转90度或270度时，宽高限制需要更保守
					this.imgElement.style.maxWidth = '60vh'; // 使用视口高度作为参考
					this.imgElement.style.maxHeight = '90vw'; // 使用视口宽度作为参考
				} else if (isLongImg) {
					// 长条形图片：针对性地优化显示
					if (isWideImg) {
						// 横向长条形：优先适应宽度，高度允许超出（可滚动）
						this.imgElement.style.maxWidth = '100%';
						this.imgElement.style.maxHeight = '90vh'; // 允许更高度，支持滚动
					} else {
						// 纵向长条形：优先适应高度，宽度允许超出（可滚动）
						this.imgElement.style.maxWidth = '95vw'; // 增加宽度限制（从90vw增加到95vw）
						this.imgElement.style.maxHeight = '90vh'; // 进一步增加高度限制（从75vh增加到90vh）
					}
				} else {
					// 正常状态或旋转180度
					this.imgElement.style.maxWidth = '100%';
					this.imgElement.style.maxHeight = '90vh'; // 进一步增加高度限制（从75vh增加到90vh）
				}
				this.imgElement.style.width = 'auto';
				this.imgElement.style.height = 'auto';
			} else if (this.viewMode === '1:1') {
				// 1:1模式下，不限制尺寸，使用原始尺寸
				this.imgElement.style.maxWidth = 'none';
				this.imgElement.style.maxHeight = 'none';
				this.imgElement.style.width = 'auto';
				this.imgElement.style.height = 'auto';
			}
			
			// 优化长条形图片的拖拽边界
			this.constrainDragForLongImage();
		}
	}

	/**
	 * 限制长条形图片的拖拽范围，防止拖拽过远
	 */
	private constrainDragForLongImage() {
		if (!this.imgElement || !this.isLongImage() || this.scale <= 1) return;
		
		// 获取图片容器的实际尺寸
		const container = this.imgElement.parentElement;
		if (!container) return;
		
		// 等待布局稳定后再计算
		requestAnimationFrame(() => {
			const containerRect = container.getBoundingClientRect();
			const imgRect = this.imgElement!.getBoundingClientRect();
			
			// 计算图片在缩放后的实际显示尺寸
			const scaledWidth = imgRect.width;
			const scaledHeight = imgRect.height;
			const containerWidth = containerRect.width;
			const containerHeight = containerRect.height;
			
			// 计算可拖拽的最大范围（图片超出容器的部分的一半）
			const maxTranslateX = Math.max(0, (scaledWidth - containerWidth) / 2);
			const maxTranslateY = Math.max(0, (scaledHeight - containerHeight) / 2);
			
			// 限制拖拽范围
			this.translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, this.translateX));
			this.translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, this.translateY));
			
			// 应用限制后的位置（不触发动画）
			if (this.imgElement) {
				const wasTransition = this.imgElement.style.transition;
				this.imgElement.style.transition = 'none';
				this.imgElement.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale}) rotate(${this.rotate}deg)`;
				// 恢复过渡动画
				setTimeout(() => {
					if (this.imgElement) {
						this.imgElement.style.transition = wasTransition || 'transform 0.3s ease';
					}
				}, 0);
			}
		});
	}

	/**
	 * 根据缩放状态切换信息面板和锁定按钮的显示
	 */
	// 渲染操作记录（使用新日志系统）
	async renderHistory(historyList: HTMLElement) {
		historyList.empty();
		
		// 如果没有图片哈希值，显示提示
		if (!this.image.md5) {
			const emptyLi = historyList.createEl('li', { cls: 'history-item empty' });
			emptyLi.textContent = '需要扫描图片以生成哈希值';
			return;
		}
		
		// 从新日志系统获取该图片的日志
		if (!this.plugin?.logger) {
			const emptyLi = historyList.createEl('li', { cls: 'history-item empty' });
			emptyLi.textContent = '日志系统未初始化';
			return;
		}
		
		// 云端图片用 urlHash（组合 id）查操作记录，本地/回收站用 md5
		const hashForLogs = this.isRemoteImage ? (this.image.urlHash ?? '') : (this.image.md5 ?? '');
		const logs = this.plugin.logger.getImageLogs(hashForLogs);
		
		if (logs.length === 0) {
			const emptyLi = historyList.createEl('li', { cls: 'history-item empty' });
			emptyLi.textContent = '暂无操作记录';
			return;
		}
		
		// 最多显示最近10条
		const recentLogs = logs.slice(0, 10);
		
		for (const log of recentLogs) {
			const historyLi = historyList.createEl('li', { cls: 'history-item' });
			historyLi.style.cssText = `
				padding: 8px;
				margin-bottom: 6px;
				border-left: 3px solid ${this.getLogLevelColor(log.level)};
				background-color: var(--background-primary-alt);
				border-radius: 4px;
				user-select: text;
				cursor: text;
			`;
			
			// 时间
			const timeDiv = historyLi.createDiv('history-time');
			timeDiv.style.cssText = `
				font-size: 0.85em;
				color: var(--text-muted);
				margin-bottom: 4px;
			`;
			timeDiv.textContent = new Date(log.timestamp).toLocaleString('zh-CN');
			
			// 操作类型和级别
			const headerDiv = historyLi.createDiv();
			headerDiv.style.cssText = `
				display: flex;
				align-items: center;
				gap: 8px;
				margin-bottom: 4px;
			`;
			
			const levelBadge = headerDiv.createSpan();
			levelBadge.textContent = log.level;
			levelBadge.style.cssText = `
				padding: 2px 6px;
				border-radius: 3px;
				background-color: ${this.getLogLevelColor(log.level)};
				color: white;
				font-size: 0.75em;
				font-weight: bold;
			`;
			
			const operationType = headerDiv.createSpan();
			operationType.textContent = OperationTypeLabels[log.operation] || log.operation;
			operationType.style.cssText = `
				font-weight: bold;
				color: var(--text-accent);
			`;
			
			// 消息
			const messageDiv = historyLi.createDiv('history-desc');
			messageDiv.style.cssText = `
				font-size: 0.9em;
				color: var(--text-normal);
				line-height: 1.4;
			`;
			messageDiv.textContent = log.message;
			
			// 更新的笔记列表（如果有）
			if (log.details && log.details.referencedFiles && Array.isArray(log.details.referencedFiles) && log.details.referencedFiles.length > 0) {
				// 检查日志消息中是否已经包含了引用更新信息
				const hasRefsInMessage = log.message.includes('更新引用:');
				
				const refsDiv = historyLi.createDiv('referenced-files-container');
				refsDiv.style.cssText = `
					margin-top: 6px;
					padding: 8px 10px;
					background: linear-gradient(135deg, var(--background-secondary-alt) 0%, var(--background-secondary) 100%);
					border-radius: 5px;
					box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
				`;
				const refsHeader = refsDiv.createDiv();
				refsHeader.style.cssText = `
					display: flex;
					align-items: center;
					gap: 6px;
					margin-bottom: 6px;
				`;
				const refsTitle = refsHeader.createSpan();
				refsTitle.style.cssText = `
					font-weight: 600;
					color: var(--text-accent);
					font-size: 0.95em;
				`;
				refsTitle.textContent = '📝 更新笔记链接';
				
				const refsListContainer = refsDiv.createDiv();
				refsListContainer.style.cssText = `
					display: flex;
					flex-direction: column;
					gap: 4px;
				`;
				log.details.referencedFiles.forEach((filePath: string, index: number) => {
					const refItem = refsListContainer.createDiv();
					refItem.style.cssText = `
						padding: 6px 8px;
						background: var(--background-primary);
						border-radius: 4px;
						border: 1px solid var(--background-modifier-border);
						font-size: 0.9em;
						color: var(--text-normal);
						font-family: var(--font-monospace);
						word-break: break-all;
						user-select: text;
						cursor: text;
					`;
					// 简化序号样式，使用简单文本
					refItem.textContent = `${index + 1}. ${filePath}`;
				});
			}
			
			// 详情（如果有）
			if (log.details && Object.keys(log.details).length > 0) {
				const detailsDiv = historyLi.createDiv();
				detailsDiv.style.cssText = `
					margin-top: 4px;
					padding: 4px 8px;
					background-color: var(--background-secondary);
					border-radius: 3px;
					font-size: 0.8em;
					color: var(--text-muted);
					font-family: monospace;
					white-space: pre-wrap;
					user-select: text;
				`;
				
				// 格式化关键信息（避免与日志消息重复）
				const details: string[] = [];
				
				// 检查日志消息是否已经包含了 fromName → toName 的信息
				const hasRenameInMessage = log.details.fromName && log.details.toName && 
					log.message.includes(`${log.details.fromName} → ${log.details.toName}`);
				
				// 只有在消息中没有包含重命名信息时才显示
				if (log.details.fromName && log.details.toName && !hasRenameInMessage) {
					details.push(`${log.details.fromName} → ${log.details.toName}`);
				}
				
				// 引用更新信息已包含在日志消息中，不需要在详情中重复显示
				// referencedFiles 已在上面单独显示
				if (log.details.reduction) {
					details.push(`压缩率: ${log.details.reduction}`);
				}
				if (log.details.quality) {
					details.push(`质量: ${log.details.quality}`);
				}
				
				// 只有在有非重复信息时才显示详情
				if (details.length > 0) {
				detailsDiv.textContent = details.join(' | ');
				} else {
					// 没有额外信息，隐藏详情区域
					detailsDiv.remove();
				}
			}
			
			// 错误信息（如果有）
			if (log.error) {
				const errorDiv = historyLi.createDiv();
				errorDiv.style.cssText = `
					margin-top: 4px;
					padding: 4px 8px;
					background-color: rgba(255, 0, 0, 0.1);
					border: 1px solid rgba(255, 0, 0, 0.3);
					border-radius: 3px;
					font-size: 0.8em;
					color: var(--text-error);
				`;
				errorDiv.textContent = `❌ ${log.error}`;
			}
		}
		
		// 如果日志超过10条，显示"查看更多"按钮
		if (logs.length > 10) {
			const moreBtn = historyList.createEl('li', { cls: 'history-item view-more' });
			moreBtn.style.cssText = `
				text-align: center;
				padding: 8px;
				color: var(--text-accent);
				cursor: pointer;
				font-weight: bold;
				border-radius: 4px;
				background-color: var(--background-primary-alt);
				transition: all 0.2s ease;
			`;
			moreBtn.textContent = `查看全部 ${logs.length} 条记录 →`;
			
			moreBtn.addEventListener('mouseenter', () => {
				moreBtn.style.backgroundColor = 'var(--background-modifier-hover)';
			});
			moreBtn.addEventListener('mouseleave', () => {
				moreBtn.style.backgroundColor = 'var(--background-primary-alt)';
			});
			moreBtn.addEventListener('click', () => {
				// 打开日志查看器，过滤当前图片
				new LogViewerModal(this.app, this.plugin!, this.image.md5).open();
			});
		}
	}
	
	// 获取日志级别颜色
	private getLogLevelColor(level: string): string {
		switch (level) {
			case 'DEBUG': return '#6c757d';
			case 'INFO': return '#0d6efd';
			case 'WARNING': return '#ffc107';
			case 'ERROR': return '#dc3545';
			default: return '#6c757d';
		}
	}

	// 获取操作记录
	async getHistory(): Promise<ImageChangeHistory[]> {
		if (!this.plugin) {
			return [];
		}
		
		try {
			const data = await this.plugin.loadData();
			const history = data.imageHistory || {};
			
			// 尝试使用当前路径获取操作记录
			let historyRecords = history[this.image.path] || [];
			
			// 如果没有找到，尝试使用原始路径（可能是刚重命名完）
			if (historyRecords.length === 0 && this.originalPath && this.originalPath !== this.image.path) {
				historyRecords = history[this.originalPath] || [];
			}
			
			return historyRecords;
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '获取操作记录失败', {
					error: error as Error,
					imagePath: this.image.path
				});
			}
			return [];
		}
	}


	/** 笔记内拖拽改尺寸后刷新引用列表，使详情页显示最新显示尺寸 */
	async refreshReferencesForNoteSizeUpdate(): Promise<void> {
		if (!this.refListContainer || !this.referenceManager) return;
		this.image.references = undefined;
		this.refListContainer.empty();
		const references = await this.referenceManager.findImageReferences(this.image.path, this.image.name);
		this.image.references = references;
		this.image.referenceCount = references.length;
		this.image.referencesUpdatedAt = Date.now();
		await this.renderImageReferences(this.refListContainer);
	}

	// 渲染图片引用
	async renderImageReferences(container: HTMLElement) {
		// 优先使用缓存的引用信息
		let references = this.image.references;
		
		// 如果没有缓存或缓存为空，尝试从 referenceManager 获取
		if (!references || references.length === 0) {
			if (!this.referenceManager) {
				return;
			}
			references = await this.referenceManager.findImageReferences(this.image.path, this.image.name);
			// 更新缓存
			this.image.references = references;
			this.image.referenceCount = references.length;
			this.image.referencesUpdatedAt = Date.now();
		}
		
		if (references.length === 0) {
			const emptyMsg = container.createDiv({ cls: 'reference-empty' });
			emptyMsg.textContent = '暂无笔记引用';
			return;
		}

		// 获取文件修改时间作为引用时间并排序
		const referencesWithTime = await Promise.all(references.map(async (ref) => {
			const file = this.app.vault.getAbstractFileByPath(ref.filePath) as TFile;
			const refTime = file && 'stat' in file ? (file as TFile).stat.mtime : 0;
			return { ...ref, refTime };
		}));

		// 按引用时间倒序排序（最新的在前面）
		referencesWithTime.sort((a, b) => b.refTime - a.refTime);

		const refList = container.createEl('ul', { cls: 'reference-list' });
		
		for (const ref of referencesWithTime) {
			const refItem = refList.createEl('li', { cls: 'reference-item' });
			
			// 根据设置显示不同的提示信息
			const keepOpen = this.plugin?.settings.keepModalOpen || false;
			if (keepOpen) {
				refItem.title = '双击前往该笔记（在新面板打开，保持当前窗口打开）';
			} else {
				refItem.title = '双击前往该笔记（在当前标签页打开，关闭当前窗口）';
			}
			
			// 添加鼠标悬停效果（样式由 CSS 控制，这里不需要设置背景色）
			refItem.style.cursor = 'pointer';
			
			// 双击卡片导航到笔记
			refItem.addEventListener('dblclick', async (e) => {
				// 如果点击的是输入框或按钮，不触发导航
				const target = e.target as HTMLElement;
				if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('input') || target.closest('button')) {
					return;
				}
				
				// 打开笔记
				const file = this.app.vault.getAbstractFileByPath(ref.filePath);
				if (file) {
					// 根据设置决定是否保持模态框打开
					const keepOpen = this.plugin?.settings.keepModalOpen || false;
					
					if (keepOpen) {
						// 保持模态框打开：在右侧堆叠面板打开笔记
						const newLeaf = this.app.workspace.splitActiveLeaf('vertical');
						if (newLeaf) {
							await newLeaf.openFile(file as TFile);
							// 滚动到指定行并选中引用
							setTimeout(async () => {
								const view = newLeaf.view;
								if (view && 'editor' in view && ref.lineNumber && ref.lineNumber > 0) {
									const editor = (view as any).editor;
									if (editor && typeof editor.setSelection === 'function') {
										const line = ref.lineNumber - 1;
										let ch = 0;
										let linkLength = 0;
										
										// 使用 fullLine 定位引用位置
										if (ref.fullLine) {
											// 查找图片引用的位置（支持 Wiki/Markdown/HTML 格式）
											const patterns = [
												new RegExp(`!\\[\\[[^\\]]*${this.image.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\]]*\\]\\]`),
												new RegExp(`!\\[[^\\]]*\\]\\([^)]*${this.image.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^)]*\\)`),
												new RegExp(`<img[^>]*${this.image.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>`, 'i')
											];
											for (const pattern of patterns) {
												const match = ref.fullLine.match(pattern);
												if (match && match.index !== undefined) {
													ch = match.index;
													linkLength = match[0].length;
													break;
												}
											}
										}
										
										const pos = { line, ch };
										const endPos = { line, ch: ch + linkLength };
										if (linkLength > 0) {
											editor.setSelection(pos, endPos);
										} else {
											editor.setCursor(pos);
										}
									}
								}
							}, 300);
						}
					} else {
						// 关闭模态框：在当前标签页打开笔记
						const newLeaf = this.app.workspace.getLeaf(true);
						if (newLeaf) {
							await newLeaf.openFile(file as TFile);
							// 滚动到指定行并选中引用
							setTimeout(async () => {
								const view = newLeaf.view;
								if (view && 'editor' in view && ref.lineNumber && ref.lineNumber > 0) {
									const editor = (view as any).editor;
									if (editor && typeof editor.setSelection === 'function') {
										const line = ref.lineNumber - 1;
										let ch = 0;
										let linkLength = 0;
										
										// 使用 fullLine 定位引用位置
										if (ref.fullLine) {
											// 查找图片引用的位置（支持 Wiki/Markdown/HTML 格式）
											const patterns = [
												new RegExp(`!\\[\\[[^\\]]*${this.image.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\]]*\\]\\]`),
												new RegExp(`!\\[[^\\]]*\\]\\([^)]*${this.image.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^)]*\\)`),
												new RegExp(`<img[^>]*${this.image.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>`, 'i')
											];
											for (const pattern of patterns) {
												const match = ref.fullLine.match(pattern);
												if (match && match.index !== undefined) {
													ch = match.index;
													linkLength = match[0].length;
													break;
												}
											}
										}
										
										const pos = { line, ch };
										const endPos = { line, ch: ch + linkLength };
										if (linkLength > 0) {
											editor.setSelection(pos, endPos);
										} else {
											editor.setCursor(pos);
										}
									}
								}
							}, 300);
							// 关闭模态框
							this.close();
						}
					}
				}
			});
			
			// 文件头：移除header，时间将放在右下角
			
			// 引用路径编辑区域（显示路径和行号）- 改为和位置字段一样的样式
			const pathLi = refItem.createEl('li');
			pathLi.style.cssText = `
				display: flex;
				align-items: center;
				line-height: 1.2;
				margin-bottom: 4px;
				padding: 0;
			`;
			
			const pathLabelInputContainer = pathLi.createDiv('path-label-input-container');
			pathLabelInputContainer.style.cssText = `
				display: flex;
				align-items: center;
				gap: 0;
				flex: 1 1 auto;
				min-width: 0;
				flex-wrap: nowrap;
			`;
			
			const pathLabel = pathLabelInputContainer.createSpan('info-label');
			pathLabel.textContent = '引用路径：';
			pathLabel.style.fontWeight = '600'; // 与显示文本、显示尺寸标签一致
			pathLabel.style.fontSize = '0.9em'; // 统一字体大小
			pathLabel.style.flexShrink = '0';
			pathLabel.style.display = 'inline-block';
			pathLabel.style.paddingTop = '0';
			pathLabel.style.color = 'var(--text-normal)'; // 统一颜色
			/* 宽度自适应，不设置固定宽度 */
			
			const pathValue = pathLabelInputContainer.createSpan();
			pathValue.textContent = `${ref.filePath} (第 ${ref.lineNumber} 行)`;
			pathValue.style.wordBreak = 'break-all'; /* 允许换行 */
			pathValue.style.flex = '1 1 auto'; /* 占据剩余空间，与输入框对齐 */
			pathValue.style.minWidth = '0'; // 允许缩小到0，确保自适应
			pathValue.style.maxWidth = '100%'; /* 最大宽度不超过容器 */
			pathValue.style.fontSize = '0.9em'; // 统一字体大小
			pathValue.style.color = 'var(--text-normal)'; // 文本颜色
			pathValue.style.fontFamily = 'monospace'; // 等宽字体
			pathValue.style.padding = '6px 10px'; /* 与输入框一致的内边距 */
			pathValue.style.border = '1px solid var(--background-modifier-border)';
			pathValue.style.borderRadius = '6px';
			pathValue.style.background = 'var(--background-secondary)'; /* 与输入框一致的背景 */
			pathValue.style.display = 'block'; /* 块级元素，占据整行 */
			
			// 显示文本编辑区域
			const displayDiv = refItem.createDiv('reference-content');
			displayDiv.style.display = 'flex';
			displayDiv.style.flexDirection = 'column';
			displayDiv.style.gap = '8px';
			displayDiv.style.marginBottom = '0';
			
			// 显示文本行
			const displayTextRow = displayDiv.createDiv('display-text-row');
			displayTextRow.style.cssText = `
				display: flex;
				align-items: center;
				gap: 0;
			`;
			
			const displayLabel = displayTextRow.createEl('label', { 
				text: '显示文本：',
				attr: { style: 'font-weight: 600; color: var(--text-normal); flex-shrink: 0; font-size: 0.9em;' }
			});
			
			// 输入框和按钮容器
			const displayInputButtonContainer = displayTextRow.createDiv('display-input-button-container');
			displayInputButtonContainer.style.cssText = `
				display: flex;
				align-items: center;
				flex: 1 1 auto;
				min-width: 0;
				gap: 4px;
				flex-wrap: nowrap;
			`;
			
			// 显示文本处理：所有格式都直接显示显示文本，不进行文件名过滤
			// Wiki 格式：![[小图.png]] 没有显示文本，![[小图.png|小图.png]] 显示文本为"小图.png"
			// Markdown/HTML 格式：显示 alt 文本，即使等于文件名也显示
			const displayTextValue = (ref.displayText || '').trim();
			
			// 解析图片尺寸（支持 Wiki 和 HTML 格式）
			let imageWidth: number | undefined;
			let imageHeight: number | undefined;
			const isWikiFormat = ref.matchType?.startsWith('wiki');
			const isHtmlFormat = ref.matchType === 'html';
			
			if (isWikiFormat && ref.fullLine) {
				const parsed = parseWikiLink(ref.fullLine);
				imageWidth = parsed.width;
				imageHeight = parsed.height;
			} else if (isHtmlFormat && ref.fullLine) {
				const parsed = parseHtmlImageSize(ref.fullLine);
				imageWidth = parsed.width;
				imageHeight = parsed.height;
			}
			
			const displayInput = displayInputButtonContainer.createEl('input', {
				type: 'text',
				cls: 'reference-display-input',
				value: displayTextValue // 如果显示文本为空或等于文件名，输入框也为空
			});
			displayInput.setAttribute('placeholder', '自定义显示文本');
			displayInput.title = '可修改显示文本';
			displayInput.style.flex = '1 1 auto';
			displayInput.style.minWidth = '0';
			displayInput.style.width = '100%';
			displayInput.style.padding = '4px 8px';
			displayInput.style.border = '1px solid var(--background-modifier-border)';
			displayInput.style.borderRadius = '6px';
			displayInput.style.backgroundColor = 'var(--background-primary)';
			displayInput.style.fontSize = '0.9em';
			
			// 保存/撤销按钮
			const displayButtons = displayInputButtonContainer.createDiv('display-buttons');
			displayButtons.style.cssText = `
				display: flex;
				flex-direction: row;
				gap: 6px;
				flex-shrink: 0;
				align-items: center;
				align-self: center;
			`;
			
			const displayActionBtn = displayButtons.createEl('button', {
				cls: 'path-action-btn'
			});
			
			// 初始化：完全隐藏按钮
			const hideDisplayButton = () => {
				displayActionBtn.style.display = 'none';
				displayActionBtn.style.width = '0';
				displayActionBtn.style.height = '0';
				displayActionBtn.style.padding = '0';
				displayActionBtn.style.margin = '0';
				displayActionBtn.style.border = 'none';
				displayActionBtn.style.opacity = '0';
			};
			
			// 显示按钮的样式
			const showDisplayButton = () => {
				displayActionBtn.style.display = 'flex';
				displayActionBtn.style.width = '30px';
				displayActionBtn.style.height = '30px';
				displayActionBtn.style.padding = '4px 8px';
				displayActionBtn.style.margin = '0';
				displayActionBtn.style.border = '1px solid var(--background-modifier-border)';
				displayActionBtn.style.opacity = '1';
			};
			
			hideDisplayButton(); // 初始完全隐藏
			displayActionBtn.style.flexShrink = '0';
			displayActionBtn.style.borderRadius = '6px';
			displayActionBtn.style.backgroundColor = 'var(--background-secondary)';
			displayActionBtn.style.cursor = 'pointer';
			displayActionBtn.style.fontSize = '1em';
			displayActionBtn.style.minWidth = '30px';
			displayActionBtn.style.maxWidth = '30px';
			displayActionBtn.style.minHeight = '30px';
			displayActionBtn.style.display = 'flex';
			displayActionBtn.style.alignItems = 'center';
			displayActionBtn.style.justifyContent = 'center';
			
			// 图片尺寸输入框（对 Wiki 和 HTML 格式显示，放在显示文本下面）
			let sizeInput: HTMLInputElement | null = null;
			let sizeInputContainer: HTMLElement | null = null;
			let sizeActionBtn: HTMLButtonElement | null = null; // 尺寸按钮，需要在外部访问
			let sizeValidationHint: HTMLElement | null = null; // 尺寸验证提示元素，需要在外部访问
			
			// 尺寸按钮的显示/隐藏函数（在外部作用域定义，与文件名、路径、显示文本按钮保持一致）
			// 使用函数声明，确保在定义之前可以被调用（函数提升）
			function hideSizeButton() {
				if (!sizeActionBtn) return;
				sizeActionBtn.style.display = 'none';
				sizeActionBtn.style.width = '0';
				sizeActionBtn.style.height = '0';
				sizeActionBtn.style.padding = '0';
				sizeActionBtn.style.margin = '0';
				sizeActionBtn.style.border = 'none';
				sizeActionBtn.style.opacity = '0';
			}
			
			function showSizeButton() {
				if (!sizeActionBtn) return;
				sizeActionBtn.style.display = 'flex';
				sizeActionBtn.style.width = '30px';
				sizeActionBtn.style.height = '30px';
				sizeActionBtn.style.padding = '4px 8px';
				sizeActionBtn.style.margin = '0';
				sizeActionBtn.style.border = '1px solid var(--background-modifier-border)';
				sizeActionBtn.style.opacity = '1';
			}
			
			// 尺寸验证函数（需要在外部作用域定义，以便事件监听器访问）
			const validateSize = (value: string): { valid: boolean; message?: string } => {
				const trimmed = value.trim();
				
				// 如果为空，认为是有效的（允许清空）
				if (!trimmed) {
					return { valid: true };
				}
				
				// 检查格式：纯数字或 数字x数字
				const match = trimmed.match(/^(\d+)(?:x(\d+))?$/);
				if (!match) {
					return { 
						valid: false, 
						message: '格式错误：请输入数字（如 100）或 宽度x高度（如 100x200）' 
					};
				}
				
				const width = parseInt(match[1], 10);
				const height = match[2] ? parseInt(match[2], 10) : undefined;
				
				// 验证宽度
				if (width <= 0) {
					return { 
						valid: false, 
						message: '宽度必须大于 0' 
					};
				}
				
				if (width > 10000) {
					return { 
						valid: false, 
						message: '宽度过大（建议不超过 10000 像素）' 
					};
				}
				
				// 验证高度（如果提供了）
				if (height !== undefined) {
					if (height <= 0) {
						return { 
							valid: false, 
							message: '高度必须大于 0' 
						};
					}
					
					if (height > 10000) {
						return { 
							valid: false, 
							message: '高度过大（建议不超过 10000 像素）' 
						};
					}
				}
				
				// 建议范围提示
				if (width < 10 || (height !== undefined && height < 10)) {
					return { 
						valid: true, 
						message: '提示：尺寸过小（建议至少 10 像素）' 
					};
				}
				
				if (width > 5000 || (height !== undefined && height > 5000)) {
					return { 
						valid: true, 
						message: '提示：尺寸较大（建议不超过 5000 像素）' 
					};
				}
				
				return { valid: true };
			};
			
			// Wiki/HTML 显示尺寸；Markdown 引用也显示尺寸（保存时转为 HTML 以生效）
			if (isWikiFormat || isHtmlFormat || ref.matchType === 'markdown') {
				const sizeRow = displayDiv.createDiv('size-row');
				sizeRow.style.cssText = `
					display: flex;
					align-items: center;
					gap: 0;
				`;
				
				const sizeLabel = sizeRow.createEl('label', {
					text: '显示尺寸：',
					attr: { style: 'font-weight: 600; color: var(--text-normal); flex-shrink: 0; font-size: 0.9em;' }
				});
				
				// 创建一个与显示文本行结构一致的容器
				sizeInputContainer = sizeRow.createDiv('size-input-container');
				sizeInputContainer.style.cssText = `
					display: flex;
					align-items: center;
					flex: 1 1 auto;
					min-width: 0;
					gap: 4px;
				`;
				
				sizeInput = sizeInputContainer.createEl('input', {
					type: 'text',
					cls: 'reference-size-input'
				});
				// 构建尺寸显示：100 或 100x200
				if (imageWidth) {
					sizeInput.value = imageHeight ? `${imageWidth}x${imageHeight}` : `${imageWidth}`;
				}
				sizeInput.setAttribute('placeholder', '宽度x高度');
				sizeInput.title = '图片尺寸：宽度（如 100）或 宽度x高度（如 100x200），建议范围：1-5000像素';
				sizeInput.style.width = '100%';
				sizeInput.style.flex = '1 1 auto';
				sizeInput.style.minWidth = '0';
				sizeInput.style.padding = '4px 8px';
				sizeInput.style.border = '1px solid var(--background-modifier-border)';
				sizeInput.style.borderRadius = '6px';
				sizeInput.style.backgroundColor = 'var(--background-primary)';
				sizeInput.style.fontSize = '0.9em';
				sizeInput.style.fontFamily = 'monospace';
				
				// 尺寸验证提示元素（放在尺寸输入框下方）
				// 注意：不放在 sizeRow 中，而是放在 displayDiv 中，以便显示在输入框下方
				sizeValidationHint = displayDiv.createDiv('size-validation-hint');
				// 提示显示在输入框下方，与 sizeSuggestionsRow 使用相同的对齐方式
				// 使用 padding-left 来与输入框对齐（标签宽度是自适应的，所以使用与建议行相同的对齐方式）
				sizeValidationHint.style.cssText = `
					width: 100%;
					font-size: 0.8em;
					color: var(--text-error);
					margin-top: 4px;
					margin-left: 0;
					padding-left: 84px; /* 与 sizeSuggestionsRow 对齐，与输入框左边缘对齐 */
					display: none;
					min-height: 18px;
					box-sizing: border-box;
				`;
				
				// 智能尺寸建议区域（在尺寸输入框下方）
				if (this.image.width && this.image.height) {
					const sizeSuggestionsRow = displayDiv.createDiv('size-suggestions-row');
					sizeSuggestionsRow.style.cssText = `
						display: flex;
						align-items: center;
						gap: 6px;
						flex-wrap: wrap;
						margin-top: 4px;
						padding-left: 84px; /* 对齐到尺寸输入框位置 */
					`;
					
					// 生成建议尺寸按钮
					const suggestions = [
						{ label: '25%', ratio: 0.25 },
						{ label: '50%', ratio: 0.5 },
						{ label: '75%', ratio: 0.75 },
						{ label: '原始', ratio: 1.0 }
					];
					
					suggestions.forEach(suggestion => {
						const btn = sizeSuggestionsRow.createEl('button');
						btn.textContent = suggestion.label;
						btn.style.cssText = `
							padding: 2px 6px;
							font-size: 0.75em;
							border: 1px solid var(--background-modifier-border);
							border-radius: 3px;
							background-color: var(--background-secondary);
							color: var(--text-normal);
							cursor: pointer;
							transition: all 0.15s ease;
							box-shadow: none;
						`;
						
						btn.title = `设置为原始尺寸的${suggestion.label === '原始' ? '100%' : suggestion.label}`;
						
						btn.addEventListener('mouseenter', () => {
							btn.style.backgroundColor = 'var(--background-modifier-hover)';
							btn.style.borderColor = 'var(--interactive-accent)';
						});
						
						btn.addEventListener('mouseleave', () => {
							btn.style.backgroundColor = 'var(--background-secondary)';
							btn.style.borderColor = 'var(--background-modifier-border)';
						});
						
					btn.addEventListener('click', (e) => {
						e.stopPropagation();
						const newWidth = Math.round(this.image.width! * suggestion.ratio);
						const newHeight = Math.round(this.image.height! * suggestion.ratio);
						sizeInput!.value = `${newWidth}x${newHeight}`;
						// 直接触发尺寸变化检测（函数声明会被提升）
						checkSizeChanges();
					});
					});
					
					// 保持宽高比选项
					const aspectRatioContainer = sizeSuggestionsRow.createDiv('aspect-ratio-container');
					aspectRatioContainer.style.cssText = `
						display: flex;
						align-items: center;
						gap: 4px;
						margin-left: 8px;
					`;
					
					const aspectRatioCheckbox = aspectRatioContainer.createEl('input', {
						type: 'checkbox',
						attr: { id: `aspect-ratio-${ref.filePath}-${ref.lineNumber}` }
					});
					aspectRatioCheckbox.style.cssText = `
						cursor: pointer;
					`;
					
					const aspectRatioLabel = aspectRatioContainer.createEl('label', {
						attr: { for: `aspect-ratio-${ref.filePath}-${ref.lineNumber}` }
					});
					aspectRatioLabel.textContent = '保持宽高比';
					aspectRatioLabel.style.cssText = `
						font-size: 0.85em;
						color: var(--text-muted);
						cursor: pointer;
					`;
					
					// 计算原始宽高比
					const originalAspectRatio = this.image.width! / this.image.height!;
					
					// 监听尺寸输入框变化，自动计算高度或宽度（如果启用保持宽高比）
					// 注意：这个监听器需要在主监听器之前注册，使用 { once: false, passive: true } 优化性能
					let isInternalUpdate = false; // 标记是否是内部更新（避免重复触发）
					let lastValue = sizeInput.value; // 记录上次的值，用于判断是修改了宽度还是高度
					
					sizeInput.addEventListener('input', () => {
						if (!sizeInput || isInternalUpdate) return;
						
							const value = sizeInput.value.trim();
						
						if (aspectRatioCheckbox.checked) {
							// 尝试匹配格式：纯数字或 数字x数字
							const match = value.match(/^(\d+)(?:x(\d+))?$/);
							if (match) {
								const inputWidth = parseInt(match[1], 10);
								const inputHeight = match[2] ? parseInt(match[2], 10) : undefined;
								
								if (inputWidth > 0) {
									// 解析上次的值，用于判断是修改了宽度还是高度
									const lastMatch = lastValue.match(/^(\d+)(?:x(\d+))?$/);
									const lastWidth = lastMatch ? parseInt(lastMatch[1], 10) : 0;
									const lastHeight = lastMatch && lastMatch[2] ? parseInt(lastMatch[2], 10) : undefined;
									
									let calculatedValue = '';
									
									if (!inputHeight) {
									// 只有宽度，自动计算高度
									const calculatedHeight = Math.round(inputWidth / originalAspectRatio);
										calculatedValue = `${inputWidth}x${calculatedHeight}`;
									} else if (lastValue && lastMatch) {
										// 有宽度和高度，判断是修改了宽度还是高度
										// 如果宽度变化且高度没变化，说明修改了宽度，需要更新高度
										// 如果高度变化且宽度没变化，说明修改了高度，需要更新宽度
										// 如果都变化，根据变化幅度判断（通常用户只会修改一个值）
										const widthChanged = inputWidth !== lastWidth;
										const heightChanged = inputHeight !== lastHeight;
										
										if (widthChanged && !heightChanged) {
											// 修改了宽度，更新高度
											const calculatedHeight = Math.round(inputWidth / originalAspectRatio);
											calculatedValue = `${inputWidth}x${calculatedHeight}`;
										} else if (heightChanged && !widthChanged) {
											// 修改了高度，更新宽度
											const calculatedWidth = Math.round(inputHeight * originalAspectRatio);
											calculatedValue = `${calculatedWidth}x${inputHeight}`;
										} else if (widthChanged && heightChanged) {
											// 都变化了，判断哪个变化幅度更大，保持变化幅度大的那个
											const widthChangeRatio = Math.abs(inputWidth - lastWidth) / lastWidth;
											const heightChangeRatio = Math.abs(inputHeight - lastHeight!) / lastHeight!;
											
											if (widthChangeRatio > heightChangeRatio) {
												// 宽度变化更大，以宽度为准更新高度
												const calculatedHeight = Math.round(inputWidth / originalAspectRatio);
												calculatedValue = `${inputWidth}x${calculatedHeight}`;
											} else {
												// 高度变化更大，以高度为准更新宽度
												const calculatedWidth = Math.round(inputHeight * originalAspectRatio);
												calculatedValue = `${calculatedWidth}x${inputHeight}`;
											}
										}
									}
									
									if (calculatedValue && calculatedValue !== value) {
										isInternalUpdate = true; // 标记为内部更新
										lastValue = calculatedValue; // 更新记录值
										sizeInput.value = calculatedValue;
									// 使用 setTimeout 重置标记，确保主监听器能检测到变化
									setTimeout(() => {
										isInternalUpdate = false;
										// 在主监听器处理完后，再调用一次 checkSizeChanges 确保按钮状态正确
										checkSizeChanges();
									}, 10);
										return; // 提前返回，避免更新 lastValue
								}
							}
						}
						}
						
						// 更新记录值
						lastValue = value;
					}, { passive: true });
					
					// 当启用保持宽高比时，如果当前只有宽度，自动计算高度
					aspectRatioCheckbox.addEventListener('change', () => {
						if (!sizeInput) return;
						if (aspectRatioCheckbox.checked) {
							const value = sizeInput.value.trim();
							const match = value.match(/^(\d+)(?:x(\d+))?$/);
							if (match) {
								const inputWidth = parseInt(match[1], 10);
								const inputHeight = match[2] ? parseInt(match[2], 10) : undefined;
								
								if (inputWidth > 0) {
									let newValue = '';
									if (!inputHeight) {
										// 只有宽度，自动计算高度
									const calculatedHeight = Math.round(inputWidth / originalAspectRatio);
										newValue = `${inputWidth}x${calculatedHeight}`;
									} else {
										// 有宽度和高度，以宽度为准重新计算高度
										const calculatedHeight = Math.round(inputWidth / originalAspectRatio);
										newValue = `${inputWidth}x${calculatedHeight}`;
									}
									
									if (newValue && newValue !== value) {
										isInternalUpdate = true;
										lastValue = newValue;
										sizeInput.value = newValue;
										setTimeout(() => {
											isInternalUpdate = false;
									checkSizeChanges();
										}, 10);
									}
								}
							}
						}
					});
				}
				
				// 尺寸保存/撤销按钮（独立的按钮）
				const sizeButtons = sizeInputContainer.createDiv('size-buttons');
				sizeButtons.style.cssText = `
					display: flex;
					flex-direction: row;
					gap: 6px;
					flex-shrink: 0;
					align-items: center;
					align-self: center;
				`;
				
				sizeActionBtn = sizeButtons.createEl('button', {
					cls: 'path-action-btn'
				});
				
				hideSizeButton(); // 初始完全隐藏
				
				// 初始化按钮样式（与文件名、路径、显示文本按钮保持一致）
				if (sizeActionBtn) {
					sizeActionBtn.style.flexShrink = '0';
					sizeActionBtn.style.borderRadius = '6px';
					sizeActionBtn.style.backgroundColor = 'var(--background-secondary)';
					sizeActionBtn.style.cursor = 'pointer';
					sizeActionBtn.style.fontSize = '1em';
					sizeActionBtn.style.minWidth = '30px';
					sizeActionBtn.style.maxWidth = '30px';
					sizeActionBtn.style.minHeight = '30px';
					// display 由 hideSizeButton/showSizeButton 控制，不在这里设置
					sizeActionBtn.style.alignItems = 'center';
					sizeActionBtn.style.justifyContent = 'center';
				}
			}
			
			// 初始隐藏尺寸按钮（如果已创建）
			if (sizeActionBtn) {
				hideSizeButton();
			}
			
			// 保存原始显示文本和尺寸：所有格式都直接使用显示文本，不进行文件名过滤
			// Wiki 格式：![[小图.png]] 没有显示文本，![[小图.png|小图.png]] 显示文本为"小图.png"
			// Markdown/HTML 格式：直接使用 alt 文本
			const originalDisplayText = (ref.displayText || '').trim();
			const originalWidth = imageWidth;
			const originalHeight = imageHeight;
			
			let lastSavedDisplayText = originalDisplayText;
			let lastSavedWidth = originalWidth;
			let lastSavedHeight = originalHeight;
			let beforeSaveDisplayText = originalDisplayText;
			let beforeSaveWidth = originalWidth;
			let beforeSaveHeight = originalHeight;
			let beforeSaveFullLine = ref.fullLine; // 保存前的完整行内容
			let beforeSaveMatchType = ref.matchType; // 保存前的 matchType
			
			// 尺寸独立的保存状态（用于独立的撤销功能）
			let lastSavedSizeWidth = originalWidth;
			let lastSavedSizeHeight = originalHeight;
			let beforeSaveSizeWidth = originalWidth;
			let beforeSaveSizeHeight = originalHeight;
			let beforeSaveSizeFullLine = ref.fullLine; // 保存尺寸前的完整行内容
			
			// 提取当前尺寸值（辅助函数）
			const getCurrentSize = (): { width?: number; height?: number } => {
				if (!sizeInput) return { width: undefined, height: undefined };
				const sizeValue = sizeInput.value.trim();
				if (!sizeValue) return { width: undefined, height: undefined };
				const sizeMatch = sizeValue.match(/^(\d+)(?:x(\d+))?$/);
				if (sizeMatch) {
					const width = parseInt(sizeMatch[1], 10);
					const height = sizeMatch[2] ? parseInt(sizeMatch[2], 10) : undefined;
					return { width, height };
				}
				return { width: undefined, height: undefined };
			};
			
			// 检查显示文本变化（独立）
			const checkDisplayTextChanges = () => {
				const currentDisplayText = displayInput.value.trim();
				const savedDisplayText = (lastSavedDisplayText || '').trim();
				const displayTextChanged = currentDisplayText !== savedDisplayText;
				
				if (displayTextChanged) {
					// 显示保存按钮
					displayActionBtn.textContent = '✅';
					displayActionBtn.title = '保存：保存显示文本修改';
					showDisplayButton();
				} else {
					// 检查是否有撤销数据
					if (beforeSaveDisplayText !== undefined && beforeSaveDisplayText !== lastSavedDisplayText) {
						// 有撤销数据，显示撤销按钮
						displayActionBtn.textContent = '↪️';
						displayActionBtn.title = '撤销：撤销刚才的显示文本修改';
					showDisplayButton();
				} else {
					// 隐藏按钮
					hideDisplayButton();
				}
				}
			};
			
			// 检查尺寸变化（独立）
			// 使用函数声明，确保在定义之前可以被调用（函数提升）
			function checkSizeChanges() {
				if (!sizeInput || !sizeActionBtn) return;
				
				const currentSize = getCurrentSize();
				// 比较逻辑：如果当前输入框有值，就与保存的值比较
				// 如果输入框为空，则认为没有变化（除非之前有值）
				const sizeValue = sizeInput.value.trim();
				const hasInput = sizeValue.length > 0;
				
				let sizeChanged = false;
				if (hasInput) {
					// 有输入，比较当前值与保存的值
					const widthChanged = currentSize.width !== lastSavedSizeWidth;
					const heightChanged = currentSize.height !== lastSavedSizeHeight;
					sizeChanged = widthChanged || heightChanged;
				} else {
					// 输入框为空，如果之前有保存的值，则认为有变化（清空尺寸）
					sizeChanged = lastSavedSizeWidth !== undefined || lastSavedSizeHeight !== undefined;
				}
				
				if (sizeChanged) {
					// 显示保存按钮
					sizeActionBtn.textContent = '✅';
					sizeActionBtn.title = '保存：保存尺寸修改';
					showSizeButton();
				} else {
					// 检查是否有撤销数据
					if ((beforeSaveSizeWidth !== undefined && beforeSaveSizeWidth !== lastSavedSizeWidth) ||
						(beforeSaveSizeHeight !== undefined && beforeSaveSizeHeight !== lastSavedSizeHeight)) {
						// 有撤销数据，显示撤销按钮
						sizeActionBtn.textContent = '↪️';
						sizeActionBtn.title = '撤销：撤销刚才的尺寸修改';
						showSizeButton();
					} else {
						// 隐藏按钮
						hideSizeButton();
					}
				}
			}
			
			// 显示文本输入框监听（只检测显示文本变化）
			displayInput.addEventListener('input', () => {
				checkDisplayTextChanges();
			});
			
			if (sizeInput) {
				// 尺寸输入框的实时验证和变化检测（使用防抖避免重复调用）
				let sizeCheckTimeout: NodeJS.Timeout | null = null;
				sizeInput.addEventListener('input', () => {
					if (!sizeInput) return;
					const value = sizeInput.value;
					const validation = validateSize(value);
					
					// 更新验证提示
					if (sizeValidationHint) {
						if (validation.message) {
							sizeValidationHint.textContent = validation.message;
							sizeValidationHint.style.display = 'block';
							// 根据验证结果设置颜色
							if (validation.valid) {
								sizeValidationHint.style.color = 'var(--text-muted)';
								sizeInput.style.borderColor = 'var(--background-modifier-border)';
							} else {
								sizeValidationHint.style.color = 'var(--text-error)';
								sizeInput.style.borderColor = 'var(--text-error)';
							}
						} else {
							sizeValidationHint.style.display = 'none';
							sizeInput.style.borderColor = 'var(--background-modifier-border)';
						}
					}
					
					// 使用防抖避免重复调用 checkSizeChanges
					if (sizeCheckTimeout) {
						clearTimeout(sizeCheckTimeout);
					}
					sizeCheckTimeout = setTimeout(() => {
						checkSizeChanges();
						sizeCheckTimeout = null;
					}, 50); // 50ms 防抖延迟
				}, { passive: true });
				
				// 失焦时验证
				sizeInput.addEventListener('blur', () => {
					const value = sizeInput!.value.trim();
					if (value) {
						const validation = validateSize(value);
						if (!validation.valid && validation.message) {
							// 显示错误提示
							new Notice(validation.message);
						}
					}
				});
			}
			
			// 输入框失焦时的处理（如果输入框为空，显示占位符）
			displayInput.addEventListener('blur', () => {
				// 失焦时不需要特殊处理，保持当前状态
			});
			
			// 按钮点击事件
			displayActionBtn.addEventListener('click', async (e) => {
				// 阻止事件冒泡，避免触发父元素的事件
				e.stopPropagation();
				// 阻止事件冒泡，避免触发父元素的双击事件
				e.stopPropagation();
				
				if (displayActionBtn.textContent === '✅') {
					// 保存显示文本操作（不包含尺寸）
					const newDisplayText = displayInput.value.trim();
					
					// 提取当前尺寸值（用于保持尺寸不变）
					let keepWidth: number | undefined;
					let keepHeight: number | undefined;
					if (sizeInput) {
						const sizeValue = sizeInput.value.trim();
						if (sizeValue) {
							const sizeMatch = sizeValue.match(/^(\d+)(?:x(\d+))?$/);
							if (sizeMatch) {
								keepWidth = parseInt(sizeMatch[1], 10);
								if (sizeMatch[2]) {
									keepHeight = parseInt(sizeMatch[2], 10);
								}
							}
						}
					} else {
						// 如果没有尺寸输入框，使用已保存的尺寸
						keepWidth = lastSavedWidth;
						keepHeight = lastSavedHeight;
					}
					
					// 调试信息（仅在DEBUG模式下记录）
					if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
						await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, '保存显示文本', {
							details: {
						filePath: ref.filePath,
						lineNumber: ref.lineNumber,
						matchType: ref.matchType,
						oldLine: ref.fullLine,
						newDisplayText: newDisplayText,
						keepWidth: keepWidth,
						keepHeight: keepHeight
							},
							imagePath: this.image.path
					});
					}
					
					// 在保存前记录当前值（用于撤销）
					beforeSaveDisplayText = lastSavedDisplayText;
					beforeSaveWidth = lastSavedWidth;
					beforeSaveHeight = lastSavedHeight;
					beforeSaveFullLine = ref.fullLine; // 保存前的完整行内容
					beforeSaveMatchType = ref.matchType; // 保存前的 matchType
					
					// 显示加载状态
					displayActionBtn.textContent = '⏳';
					displayActionBtn.title = '保存中...';
					displayActionBtn.disabled = true;
					displayInput.disabled = true;
					if (sizeInput) {
						sizeInput.disabled = true;
					}
					
					try {
						const success = await this.saveDisplayText(ref.filePath, ref.lineNumber, ref.matchType || 'wiki', ref.fullLine || '', newDisplayText, keepWidth, keepHeight);
						
						// 调试日志（仅在DEBUG模式下记录）
						if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
							await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, '保存结果', {
								details: { success },
								imagePath: this.image.path
							});
						}
						
						if (success) {
							// 保存成功（只更新显示文本的保存状态，不更新尺寸）
							// 重要：先更新 lastSavedDisplayText，确保后续的 input 事件不会误判为有变化
							lastSavedDisplayText = newDisplayText || '';
							// 注意：尺寸的保存状态由尺寸按钮独立管理，这里不更新 lastSavedSizeWidth/Height
							
							// 更新 ref 对象中的显示文本
							ref.displayText = newDisplayText || '';
							
							// 更新尺寸输入框（如果存在）- 使用 keepWidth/keepHeight（保持当前尺寸）
							if (sizeInput) {
								if (keepWidth) {
									sizeInput.value = keepHeight ? `${keepWidth}x${keepHeight}` : `${keepWidth}`;
								} else {
									sizeInput.value = '';
								}
							}
							
							// 更新 fullLine 和 matchType（用于后续撤销和显示）
							// 注意：保存后立即读取文件可能读取到旧内容，需要等待一小段时间
							await new Promise(resolve => setTimeout(resolve, 100));
							
							const file = this.app.vault.getMarkdownFiles().find(f => f.path === ref.filePath);
							if (file) {
								try {
									const content = await this.app.vault.read(file);
									const lines = content.split('\n');
									if (ref.lineNumber >= 1 && ref.lineNumber <= lines.length) {
										ref.fullLine = lines[ref.lineNumber - 1];
										
										// 重新解析 matchType 和 displayText 以反映新的行内容
										// 检查是否是 Wiki 格式
										const wikiWithExclamMatch = ref.fullLine.match(/!\[\[([^|]+)(?:\|([^\]]+))?\]\]/);
										const wikiNoExclamMatch = ref.fullLine.match(/(?:^|[^!])\[\[([^|]+)(?:\|([^\]]+))?\]\]/);
										
										// 重新解析 matchType（用于后续显示）
										// 但不要更新 ref.displayText，因为我们刚刚保存的值是正确的
										if (wikiWithExclamMatch) {
											// Wiki 格式（带!）
											const displayText = wikiWithExclamMatch[2] || '';
											ref.matchType = displayText ? 'wiki-with-text' : 'wiki';
										} else if (wikiNoExclamMatch) {
											// Wiki 格式（不带!）
											const beforeMatch = ref.fullLine.substring(0, wikiNoExclamMatch.index || 0);
											if (!beforeMatch.endsWith('!')) {
												const displayText = wikiNoExclamMatch[2] || '';
												ref.matchType = displayText ? 'wiki-no-exclam-with-text' : 'wiki-no-exclam';
											}
										} else {
											// 检查是否是 Markdown 格式
											const markdownMatch = ref.fullLine.match(/!\[([^\]]*)\]\(([^)]+)\)/);
											if (markdownMatch) {
												ref.matchType = 'markdown';
											} else {
												// 检查是否是 HTML 格式
												const htmlMatch = ref.fullLine.match(/<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/i);
												if (htmlMatch) {
													ref.matchType = 'html';
												}
											}
										}
										
										// 重要：保持 ref.displayText 为保存的值，不要用文件解析的值覆盖
										// 因为文件可能还没有完全更新，或者解析可能有问题
										// ref.displayText 已经在上面设置为 newDisplayText 了
									}
								} catch (error) {
									if (this.plugin?.logger) {
										await this.plugin.logger.error(OperationType.UPDATE_DISPLAY_TEXT, '读取文件失败', {
											error: error as Error,
											imagePath: this.image.path,
											details: { filePath: ref.filePath }
										});
									}
								}
							}
							
							// 更新输入框的值以反映保存后的显示文本
							// 注意：在更新输入框时，需要同步更新 lastSavedDisplayText，避免触发 input 事件时误判为有变化
							// 使用 requestAnimationFrame 确保在下一个事件循环中更新，避免触发 input 事件
							requestAnimationFrame(() => {
								displayInput.value = newDisplayText || '';
								// 确保 lastSavedDisplayText 与输入框值一致，避免误判为有变化
								lastSavedDisplayText = newDisplayText || '';
							});
							
							// 显示撤销按钮（不刷新整个引用列表，保持按钮状态）
							displayActionBtn.textContent = '↪️';
							displayActionBtn.title = '撤销：撤销刚才的显示文本修改';
							displayActionBtn.disabled = false;
							displayInput.disabled = false;
							showDisplayButton();
						} else {
							// 没有变化，隐藏按钮
							displayActionBtn.disabled = false;
							displayInput.disabled = false;
							if (sizeInput) {
								sizeInput.disabled = false;
							}
							hideDisplayButton();
						}
					} catch (error) {
						// 保存失败，恢复按钮状态
						if (this.plugin?.logger) {
							await this.plugin.logger.error(OperationType.UPDATE_DISPLAY_TEXT, '保存显示文本失败', {
								error: error as Error,
								imagePath: this.image.path
							});
						}
						new Notice('保存显示文本失败: ' + (error instanceof Error ? error.message : String(error)));
						displayActionBtn.textContent = '✅';
						displayActionBtn.title = '保存：保存显示文本和尺寸修改';
						displayActionBtn.disabled = false;
						displayInput.disabled = false;
						if (sizeInput) {
							sizeInput.disabled = false;
						}
						showDisplayButton();
					}
				} else if (displayActionBtn.textContent === '↪️') {
					// 撤销操作：撤销刚才的保存，恢复文件内容
					// 检查是否有有效的撤销数据
					if (beforeSaveDisplayText === undefined && beforeSaveFullLine === undefined) {
						if (this.plugin?.logger) {
							await this.plugin.logger.warn(OperationType.UPDATE_DISPLAY_TEXT, '撤销操作：没有有效的撤销数据', {
								details: {
							beforeSaveDisplayText,
							beforeSaveFullLine,
							beforeSaveMatchType
								},
								imagePath: this.image.path
						});
						}
						new Notice('没有可撤销的更改');
						return;
					}
					
					// 显示加载状态
					displayActionBtn.textContent = '⏳';
					displayActionBtn.title = '撤销中...';
					displayActionBtn.disabled = true;
					displayInput.disabled = true;
					if (sizeInput) {
						sizeInput.disabled = true;
					}
					
					try {
						// 撤销操作：读取文件的当前内容，然后恢复到保存前的状态
						// 注意：撤销时，oldLine 应该是文件的当前内容，newDisplayText 应该是 beforeSaveDisplayText
						const file = this.app.vault.getMarkdownFiles().find(f => f.path === ref.filePath);
						if (!file) {
							new Notice('文件不存在');
							return;
						}
						
						// 读取文件的当前内容
						const content = await this.app.vault.read(file);
						const lines = content.split('\n');
						const currentLine = lines[ref.lineNumber - 1] || '';
						
						// 调试日志（仅在DEBUG模式下记录）
						if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
							await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, '执行撤销操作', {
								details: {
							beforeSaveDisplayText,
							beforeSaveFullLine,
							beforeSaveMatchType,
							currentDisplayText: displayInput.value,
							currentLine: currentLine
								},
								imagePath: this.image.path
						});
						}
						
						// 撤销时，oldLine 是文件的当前内容，newDisplayText 是要恢复到的值（beforeSaveDisplayText）
						const undoSuccess = await this.saveDisplayText(ref.filePath, ref.lineNumber, beforeSaveMatchType || 'wiki', currentLine, beforeSaveDisplayText, beforeSaveWidth, beforeSaveHeight);
						
						if (undoSuccess) {
							// 撤销成功（只恢复显示文本，不影响尺寸）
							displayInput.value = beforeSaveDisplayText || '';
							lastSavedDisplayText = beforeSaveDisplayText;
							// 注意：尺寸的保存状态由尺寸按钮独立管理，这里不更新 lastSavedSizeWidth/Height
							ref.displayText = beforeSaveDisplayText || '';
							
							// 更新尺寸输入框（如果存在）- 使用当前保存的尺寸（lastSavedSizeWidth/Height）
							if (sizeInput) {
								if (lastSavedSizeWidth) {
									sizeInput.value = lastSavedSizeHeight ? `${lastSavedSizeWidth}x${lastSavedSizeHeight}` : `${lastSavedSizeWidth}`;
								} else {
									sizeInput.value = '';
								}
							}
							
							// 同步更新插件主缓存，避免文件监听器重复记录日志
							if (this.plugin && typeof (this.plugin as any).updateDisplayTextCache === 'function') {
								// 读取撤销后的文件内容
								const undoContent = await this.app.vault.read(file);
								const undoLines = undoContent.split('\n');
								const undoLine = undoLines[ref.lineNumber - 1] || '';
								(this.plugin as any).updateDisplayTextCache(ref.filePath, ref.lineNumber, beforeSaveDisplayText || '', undoLine);
							}
							
							// 恢复 matchType
							ref.matchType = beforeSaveMatchType;
							
							// 更新 fullLine 和 displayText（用于后续撤销和显示）
							// 注意：file 已经在上面定义过了，这里直接使用
							if (file) {
								try {
									// 重新读取文件内容（因为已经撤销了）
									const content = await this.app.vault.read(file);
									const lines = content.split('\n');
									if (ref.lineNumber >= 1 && ref.lineNumber <= lines.length) {
										ref.fullLine = lines[ref.lineNumber - 1];
										
										// 重新解析 displayText 以反映撤销后的行内容
										// 检查是否是 Wiki 格式
										const wikiWithExclamMatch = ref.fullLine.match(/!\[\[([^|]+)(?:\|([^\]]+))?\]\]/);
										const wikiNoExclamMatch = ref.fullLine.match(/(?:^|[^!])\[\[([^|]+)(?:\|([^\]]+))?\]\]/);
										
										if (wikiWithExclamMatch) {
											// Wiki 格式（带!）
											const displayText = wikiWithExclamMatch[2] || '';
											ref.displayText = displayText;
										} else if (wikiNoExclamMatch) {
											// Wiki 格式（不带!）
											const beforeMatch = ref.fullLine.substring(0, wikiNoExclamMatch.index || 0);
											if (!beforeMatch.endsWith('!')) {
												const displayText = wikiNoExclamMatch[2] || '';
												ref.displayText = displayText;
											}
										} else {
											// 检查是否是 Markdown 格式
											const markdownMatch = ref.fullLine.match(/!\[([^\]]*)\]\(([^)]+)\)/);
											if (markdownMatch) {
												const altText = markdownMatch[1] || '';
												ref.displayText = altText;
											} else {
												// 检查是否是 HTML 格式
												const htmlMatch = ref.fullLine.match(/<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/i);
												if (htmlMatch) {
													const altMatch = ref.fullLine.match(/alt\s*=\s*["']([^"']*)["']/i);
													const altText = altMatch ? altMatch[1] : '';
													ref.displayText = altText;
												}
											}
										}
									}
								} catch (error) {
									if (this.plugin?.logger) {
										await this.plugin.logger.error(OperationType.UPDATE_DISPLAY_TEXT, '读取文件失败', {
											error: error as Error,
											imagePath: this.image.path,
											details: { filePath: ref.filePath }
										});
									}
								}
							}
							
							// 更新输入框的值以反映撤销后的显示文本
							displayInput.value = beforeSaveDisplayText || '';
							
							// 隐藏撤销按钮（撤销完成）
							displayActionBtn.disabled = false;
							displayInput.disabled = false;
							if (sizeInput) {
								sizeInput.disabled = false;
							}
							hideDisplayButton();
						} else {
							// 撤销失败（没有变化）
							displayActionBtn.disabled = false;
							displayInput.disabled = false;
							if (sizeInput) {
								sizeInput.disabled = false;
							}
							hideDisplayButton();
						}
					} catch (error) {
						if (this.plugin?.logger) {
							await this.plugin.logger.error(OperationType.UPDATE_DISPLAY_TEXT, '撤销失败', {
								error: error as Error,
								imagePath: this.image.path
							});
						}
						new Notice('撤销失败: ' + (error instanceof Error ? error.message : String(error)));
						displayActionBtn.textContent = '↪️';
						displayActionBtn.title = '撤销：撤销刚才的显示文本和尺寸修改';
						displayActionBtn.disabled = false;
						displayInput.disabled = false;
						if (sizeInput) {
							sizeInput.disabled = false;
						}
						showDisplayButton();
					}
				}
			});
			
			// 尺寸按钮点击事件（独立的保存和撤销）
			if (sizeInput && sizeActionBtn) {
				sizeActionBtn.addEventListener('click', async (e) => {
					// 阻止事件冒泡
					e.stopPropagation();
					
					if (sizeActionBtn && sizeActionBtn.textContent === '✅') {
						// 保存尺寸操作（不影响显示文本）
						const sizeValue = sizeInput ? sizeInput.value.trim() : '';
						
						// 验证尺寸值
						if (sizeValue) {
							const validation = validateSize(sizeValue);
							if (!validation.valid) {
								// 验证失败，显示错误提示并阻止保存
								new Notice(validation.message || '尺寸格式无效');
								if (sizeActionBtn) {
									sizeActionBtn.textContent = '✅';
									sizeActionBtn.title = '保存：保存尺寸修改';
									sizeActionBtn.disabled = false;
								}
								if (sizeInput) sizeInput.disabled = false;
								showSizeButton();
								return; // 阻止保存
							}
						}
						
						// 提取尺寸值
						let newWidth: number | undefined;
						let newHeight: number | undefined;
						if (sizeValue) {
							const sizeMatch = sizeValue.match(/^(\d+)(?:x(\d+))?$/);
							if (sizeMatch) {
								newWidth = parseInt(sizeMatch[1], 10);
								if (sizeMatch[2]) {
									newHeight = parseInt(sizeMatch[2], 10);
								}
							}
						}
						
						// 获取当前的显示文本（保持不变）
						const keepDisplayText = displayInput.value.trim();
						
						// 在保存前记录当前值（用于撤销）
						beforeSaveSizeWidth = lastSavedSizeWidth;
						beforeSaveSizeHeight = lastSavedSizeHeight;
						beforeSaveSizeFullLine = ref.fullLine; // 保存前的完整行内容
						
						// 显示加载状态
						if (sizeActionBtn) {
							sizeActionBtn.textContent = '⏳';
							sizeActionBtn.title = '保存中...';
							sizeActionBtn.disabled = true;
						}
						if (sizeInput) sizeInput.disabled = true;
						
						try {
							const success = await this.saveDisplayText(ref.filePath, ref.lineNumber, ref.matchType || 'wiki', ref.fullLine || '', keepDisplayText, newWidth, newHeight);
							
							if (success) {
								// 保存成功
								lastSavedSizeWidth = newWidth;
								lastSavedSizeHeight = newHeight;
								
								// 更新尺寸输入框
								if (sizeInput) {
									if (newWidth) {
										sizeInput.value = newHeight ? `${newWidth}x${newHeight}` : `${newWidth}`;
									} else {
										sizeInput.value = '';
									}
								}
								
								// 等待文件系统更新
								await new Promise(resolve => setTimeout(resolve, 100));
								
								// 重新读取文件以更新 ref.fullLine
								const file = this.app.vault.getMarkdownFiles().find(f => f.path === ref.filePath);
								if (file) {
									try {
										const content = await this.app.vault.read(file);
										const lines = content.split('\n');
										if (ref.lineNumber >= 1 && ref.lineNumber <= lines.length) {
											ref.fullLine = lines[ref.lineNumber - 1];
										}
									} catch (error) {
										if (this.plugin?.logger) {
											await this.plugin.logger.error(OperationType.UPDATE_DISPLAY_TEXT, '读取文件失败', {
												error: error as Error,
												imagePath: this.image.path,
												details: { filePath: ref.filePath }
											});
										}
									}
								}
								
								// 更新缓存
								if (this.plugin && typeof (this.plugin as any).updateDisplayTextCache === 'function') {
									const file = this.app.vault.getMarkdownFiles().find(f => f.path === ref.filePath);
									if (file) {
										const content = await this.app.vault.read(file);
										const lines = content.split('\n');
										const updatedLine = lines[ref.lineNumber - 1] || '';
										(this.plugin as any).updateDisplayTextCache(ref.filePath, ref.lineNumber, keepDisplayText || '', updatedLine);
									}
								}
								
								// 显示撤销按钮
								sizeActionBtn.textContent = '↪️';
								sizeActionBtn.title = '撤销：撤销刚才的尺寸修改';
								sizeActionBtn.disabled = false;
								sizeInput!.disabled = false;
								showSizeButton();
								
								// 触发变化检测
								checkSizeChanges();
							} else {
								// 没有变化，隐藏按钮
								sizeActionBtn.disabled = false;
								sizeInput!.disabled = false;
								hideSizeButton();
							}
						} catch (error) {
							// 保存失败，恢复按钮状态
							if (this.plugin?.logger) {
								await this.plugin.logger.error(OperationType.UPDATE_DISPLAY_TEXT, '保存尺寸失败', {
									error: error as Error,
									imagePath: this.image.path
								});
							}
							new Notice('保存尺寸失败: ' + (error instanceof Error ? error.message : String(error)));
							if (sizeActionBtn) {
								sizeActionBtn.textContent = '✅';
								sizeActionBtn.title = '保存：保存尺寸修改';
								sizeActionBtn.disabled = false;
							}
							if (sizeInput) sizeInput.disabled = false;
							showSizeButton();
						}
					} else if (sizeActionBtn && sizeActionBtn.textContent === '↪️') {
						// 撤销尺寸操作
						// 检查是否有有效的撤销数据
						if (beforeSaveSizeWidth === undefined && beforeSaveSizeHeight === undefined && beforeSaveSizeFullLine === undefined) {
							new Notice('没有可撤销的更改');
							return;
						}
						
						// 显示加载状态
						if (sizeActionBtn) {
							sizeActionBtn.textContent = '⏳';
							sizeActionBtn.title = '撤销中...';
							sizeActionBtn.disabled = true;
						}
						if (sizeInput) sizeInput.disabled = true;
						
						try {
							// 读取文件的当前内容
							const file = this.app.vault.getMarkdownFiles().find(f => f.path === ref.filePath);
							if (!file) {
								new Notice('文件不存在');
								return;
							}
							
							const content = await this.app.vault.read(file);
							const lines = content.split('\n');
							const currentLine = lines[ref.lineNumber - 1] || '';
							
							// 获取当前的显示文本（保持不变）
							const keepDisplayText = displayInput.value.trim();
							
							// 撤销尺寸：恢复到保存前的尺寸
							const undoSuccess = await this.saveDisplayText(ref.filePath, ref.lineNumber, ref.matchType || 'wiki', currentLine, keepDisplayText, beforeSaveSizeWidth, beforeSaveSizeHeight);
							
							if (undoSuccess) {
								// 撤销成功
								lastSavedSizeWidth = beforeSaveSizeWidth;
								lastSavedSizeHeight = beforeSaveSizeHeight;
								
								// 更新尺寸输入框
								if (sizeInput) {
									if (beforeSaveSizeWidth) {
										sizeInput.value = beforeSaveSizeHeight ? `${beforeSaveSizeWidth}x${beforeSaveSizeHeight}` : `${beforeSaveSizeWidth}`;
									} else {
										sizeInput.value = '';
									}
								}
								
								// 隐藏撤销按钮
								if (sizeActionBtn) sizeActionBtn.disabled = false;
								if (sizeInput) sizeInput.disabled = false;
								hideSizeButton();
								
								// 触发变化检测
								checkSizeChanges();
							} else {
								// 撤销失败（没有变化）
								if (sizeActionBtn) sizeActionBtn.disabled = false;
								if (sizeInput) sizeInput.disabled = false;
								hideSizeButton();
							}
						} catch (error) {
							if (this.plugin?.logger) {
								await this.plugin.logger.error(OperationType.UPDATE_DISPLAY_TEXT, '撤销尺寸失败', {
									error: error as Error,
									imagePath: this.image.path
								});
							}
							new Notice('撤销尺寸失败: ' + (error instanceof Error ? error.message : String(error)));
							if (sizeActionBtn) {
								sizeActionBtn.textContent = '↪️';
								sizeActionBtn.title = '撤销：撤销刚才的尺寸修改';
								sizeActionBtn.disabled = false;
							}
							if (sizeInput) sizeInput.disabled = false;
							showSizeButton();
						}
					}
				});
			}
			
			// 回车键保存，Esc键取消
			displayInput.addEventListener('keydown', async (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					e.stopPropagation(); // 阻止事件冒泡
					if (displayActionBtn.textContent === '✅' && !displayActionBtn.disabled) {
						// 触发保存按钮点击
						displayActionBtn.click();
					}
				} else if (e.key === 'Escape') {
					e.stopPropagation(); // 阻止事件冒泡
					// Esc键：如果输入框有未保存的更改，恢复为上次保存的值
					const currentValue = displayInput.value.trim();
					const savedValue = (lastSavedDisplayText || '').trim();
					if (currentValue !== savedValue) {
						displayInput.value = savedValue || '';
						hideDisplayButton();
					}
				}
			});
			
			// 引用时间（放在右下角）
			const refTimeSpan = refItem.createSpan('reference-time');
			refTimeSpan.textContent = ImageProcessor.formatDate(ref.refTime);
			refTimeSpan.title = '文件最后修改时间';
			refTimeSpan.style.cssText = `
				font-size: 0.85em;
				color: var(--text-muted);
				font-family: monospace;
				opacity: 0.7;
				margin-top: auto;
				text-align: right;
				align-self: flex-end;
			`;
			
		}
	}


	// 检查是否是被锁定的文件
    private isIgnoredFile(filename: string): boolean {
        if (!this.plugin) {
            return false;
        }
        // 使用 LockListManager 进行检查（三要素匹配：文件名、哈希值、路径）
        if (this.plugin.lockListManager) {
            return this.plugin.lockListManager.isFileLockedByNameOrHash(filename, this.image.md5, this.image.path);
        }
        // 降级到直接检查 settings（兼容性）
        return isFileIgnored(filename, this.image.md5, this.plugin.settings.ignoredFiles, this.plugin.settings.ignoredHashes);
    }

	// 从锁定列表中移除
    private async removeFromIgnoredList(filename: string) {
        if (!this.plugin) return;
        
        // 使用 LockListManager 移除锁定（三要素匹配）
        const md5 = this.image?.md5;
        const filePath = this.image?.path;
        await this.plugin.lockListManager.removeLockedFile(filename, md5, filePath);
        
        new Notice('🔓 已解锁');
    }

	// 切换锁定状态
	async toggleIgnoreFile() {
		if (!this.plugin) return;
		
		const filename = this.image.name;
		const isIgnored = this.isIgnoredFile(filename);
		
        if (isIgnored) {
            // 从锁定列表移除（解锁）- 使用 LockListManager（三要素匹配）
            await this.plugin.lockListManager.removeLockedFile(filename, this.image.md5, this.image.path);
			
			// 记录日志
			if (this.plugin.logger) {
				await this.plugin.logger.info(
					OperationType.UNLOCK,
					`解锁文件: ${filename}`,
					{
						imageHash: this.image.md5,
						imagePath: this.image.path,
						imageName: filename,
						details: {
							previousState: 'locked',
							newState: 'unlocked'
						}
					}
				);
			}
			
			new Notice('🔓 已解锁');
        } else {
            // 添加到锁定列表（锁定）- 使用 LockListManager
            await this.plugin.lockListManager.addLockedFile(filename, this.image.path, this.image.md5);
			
			// 记录日志
			if (this.plugin.logger) {
				await this.plugin.logger.info(
					OperationType.LOCK,
					`锁定文件: ${filename}`,
					{
						imageHash: this.image.md5,
						imagePath: this.image.path,
						imageName: filename,
						details: {
							previousState: 'unlocked',
							newState: 'locked'
						}
					}
				);
			}
			
			new Notice('🔒 已锁定');
		}
		
		// 重新加载视图
		this.onOpen();
		
		// 刷新首页视图，更新锁定状态和分组
		try {
			const imageManagerLeaves = this.app.workspace.getLeavesOfType('image-manager-view');
			if (imageManagerLeaves.length > 0) {
				const imageManagerLeaf = imageManagerLeaves[0];
				const view = imageManagerLeaf.view as any;
				
				// 如果启用了锁定分组，需要重新渲染整个列表以更新分组
				const hasLockGrouping = view.plugin?.data?.groupMeta?.['_lock_group']?.type === 'lock';
				
				if (hasLockGrouping) {
					// 锁定状态变化会影响分组，需要重新渲染整个列表
					if (view && typeof view.renderImageList === 'function') {
						view.renderImageList();
					} else if (view && typeof view.scanImages === 'function') {
						await view.scanImages();
					}
				} else {
					// 没有锁定分组，只更新单个图片卡片
					if (view && typeof view.updateImageCardLockStatus === 'function') {
						view.updateImageCardLockStatus(this.image.path);
					} else if (view && typeof view.renderImageList === 'function') {
						view.renderImageList();
					} else if (view && typeof view.scanImages === 'function') {
						await view.scanImages();
					}
				}
			}
		} catch (e) {
			// 如果刷新失败，静默处理
			if (this.plugin?.logger) {
				await this.plugin.logger.error(OperationType.PLUGIN_OPERATION, '刷新首页视图失败', {
					error: e instanceof Error ? e : new Error(String(e))
				});
			}
		}
	}

	// 获取目录建议
	async getDirectorySuggestions(currentPath: string, dirName: string): Promise<string[]> {
		const allDirs = new Set<string>();
		const vaultFiles = this.vault.getAllFolders();
		
		// 获取所有目录
		for (const folder of vaultFiles) {
			allDirs.add(folder.path);
		}
		
		// 提取当前输入的路径部分（可能是部分路径）
		const pathParts = currentPath.split('/');
		const lastPart = pathParts[pathParts.length - 1];
		const parentPath = pathParts.slice(0, -1).filter(p => p).join('/');
		
		// 过滤匹配的目录
		const suggestions: string[] = [];
		
		for (const dir of allDirs) {
			// 如果用户已经输入了父路径，只在该父路径下搜索
			if (parentPath && !dir.startsWith(parentPath + '/')) {
				continue;
			}
			
			// 获取相对于父目录的路径
			let relativePath = dir;
			if (parentPath) {
				relativePath = dir.substring(parentPath.length + 1);
			}
			
			// 检查是否匹配
			if (relativePath.toLowerCase().includes(lastPart.toLowerCase())) {
				// 如果父目录存在，返回完整路径
				if (parentPath) {
					suggestions.push(dir);
				} else {
					suggestions.push(dir);
				}
			}
		}
		
		// 按路径长度排序，短路径优先
		return Array.from(new Set(suggestions))
			.sort((a, b) => a.length - b.length)
			.slice(0, 15);
	}

	// 渲染路径建议
	renderPathSuggestions(container: HTMLElement, suggestions: string[], pathInput: HTMLTextAreaElement, dirName: string, currentValue: string) {
		container.empty();
		
		// 计算输入框的位置
		const inputRect = pathInput.getBoundingClientRect();
		
		// 如果没有匹配，不显示建议列表
		if (suggestions.length === 0) {
			container.style.display = 'none';
			return;
		}
		
		// 设置容器位置
		container.style.display = 'block';
		container.style.position = 'fixed';
		container.style.top = (inputRect.bottom + 4) + 'px';
		container.style.left = inputRect.left + 'px';
		container.style.width = inputRect.width + 'px';
		container.style.maxWidth = '400px';
		
		// 显示最匹配的4个文件夹（按匹配程度降序排序）
		const displayCount = Math.min(suggestions.length, 4);
		for (let i = 0; i < displayCount; i++) {
			const suggestionLine = container.createDiv('path-suggestion-line');
			suggestionLine.textContent = suggestions[i];
			suggestionLine.setAttribute('data-index', i.toString());
			
			suggestionLine.addEventListener('click', () => {
				pathInput.value = suggestions[i];
				if (this.adjustPathInputHeightFunc) {
					this.adjustPathInputHeightFunc();
				}
				container.style.display = 'none';
				pathInput.focus();
			});
			
			suggestionLine.addEventListener('mouseenter', () => {
				this.updateSuggestionSelection(container, i);
			});
		}
	}

	// 更新建议选择
	updateSuggestionSelection(container: HTMLElement, selectedIndex: number) {
		const items = container.querySelectorAll('.path-suggestion-line');
		items.forEach((item, index) => {
			const htmlItem = item as HTMLElement;
			if (index === selectedIndex) {
				htmlItem.style.backgroundColor = 'var(--interactive-accent)';
				htmlItem.style.color = 'var(--text-on-accent)';
			} else {
				htmlItem.style.backgroundColor = '';
				htmlItem.style.color = '';
			}
		});
	}
	
	// 创建目录
	async createDirectory(path: string): Promise<void> {
		// 确保路径不以 / 开头或结尾
		const cleanPath = path.replace(/^\//, '').replace(/\/$/, '');
		
		if (!cleanPath) {
			throw new Error('路径不能为空');
		}
		
		// 检查目录是否已存在
		const existingFolder = this.vault.getAbstractFileByPath(cleanPath);
		if (existingFolder) {
			return; // 目录已存在，无需创建
		}
		
		// 创建所有父目录
		const pathParts = cleanPath.split('/');
		let currentPath = '';
		
		for (const part of pathParts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const folder = this.vault.getAbstractFileByPath(currentPath);
			if (!folder) {
				await this.vault.createFolder(currentPath);
			}
		}
	}


	// 保存显示文本和尺寸到笔记文件
	async saveDisplayText(filePath: string, lineNumber: number, matchType: string, oldLine: string, newDisplayText: string, newWidth?: number, newHeight?: number): Promise<boolean> {
		try {
			// 调试：记录函数调用参数（仅在DEBUG模式下记录）
			if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
				await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, 'saveDisplayText 调用', {
					details: {
				filePath,
				lineNumber,
				matchType,
				oldLine,
				newDisplayText,
				newWidth,
				newHeight,
				oldLineLength: oldLine.length,
				newDisplayTextLength: newDisplayText.length
					},
					imagePath: this.image.path
			});
			}
			
			const file = this.app.vault.getMarkdownFiles().find(f => f.path === filePath);
			if (!file) {
				new Notice('文件不存在');
				throw new Error('文件不存在');
			}
			
			// 重要：使用传入的 oldLine，而不是重新读取文件
			// 因为如果文件已经被修改过，重新读取会得到新值
			// const content = await this.app.vault.read(file);
			// const currentLine = content.split('\n')[lineNumber - 1];
			// 但是为了确保行号有效，我们还是需要读取文件来检查行数
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			
			if (lineNumber < 1 || lineNumber > lines.length) {
				new Notice('行号超出范围');
				throw new Error('行号超出范围');
			}
			
			// 验证传入的 oldLine 是否与文件中的实际行内容匹配
			// 注意：如果文件已经被修改过（比如之前的保存操作），actualLine 可能已经是新值了
			// 这种情况下，我们需要判断：
			// 1. 如果 actualLine 和 oldLine 不同，且 actualLine 包含了 newDisplayText，说明文件已经被我们修改了
			// 2. 如果 actualLine 和 oldLine 不同，但 actualLine 不包含 newDisplayText，说明文件被其他操作修改了
			const actualLine = lines[lineNumber - 1];
			
			if (actualLine !== oldLine) {
				// 检查 actualLine 是否包含 newDisplayText（说明已经被我们修改了）
				const containsNewDisplayText = actualLine.includes(newDisplayText);
				
				// 检查 actualLine 是否包含 newWidth 或 newHeight（如果提供了尺寸参数）
				const containsNewSize = (newWidth !== undefined && actualLine.includes(String(newWidth))) ||
				                       (newHeight !== undefined && actualLine.includes(String(newHeight)));
				
				if (containsNewDisplayText || containsNewSize) {
					// 文件已经被我们修改了，说明这是重复调用或者文件已经包含了我们要保存的内容
					// 使用实际文件内容作为 oldLine，这样 oldLine 和 newLine 会相同，返回 false
					if (this.plugin?.logger) {
						await this.plugin.logger.warn(OperationType.UPDATE_DISPLAY_TEXT, '检测到重复调用或文件已更新', {
							details: {
								oldLine,
								actualLine,
								newDisplayText
							},
							imagePath: this.image.path
						});
					}
					oldLine = actualLine;
					
					// 如果文件内容已经包含了我们要保存的内容，直接返回 false（无需保存）
					// 检查 newLine 是否与 actualLine 相同（在构建 newLine 之前无法检查，所以先继续执行）
				} else {
					// 文件被其他操作修改了，使用实际文件内容作为 oldLine
					// 这样可以确保基于最新的文件内容进行修改，避免使用过时的 oldLine
					if (this.plugin?.logger) {
						await this.plugin.logger.warn(OperationType.UPDATE_DISPLAY_TEXT, 'oldLine 与文件内容不匹配，使用实际文件内容作为 oldLine', {
							details: {
						oldLine,
						actualLine,
						filePath,
						lineNumber,
						note: '使用实际文件内容作为 oldLine，确保基于最新内容进行修改'
							},
							imagePath: this.image.path
					});
					}
					oldLine = actualLine;
				}
			}
			
			const lineIndex = lineNumber - 1;
			let newLine = oldLine;
			let oldDisplayText = '';
			let oldWidth: number | undefined;
			let oldHeight: number | undefined;
			
			// 先尝试基于实际行内容匹配格式，而不是仅依赖 matchType
			// 这样可以处理 matchType 与实际内容不一致的情况
			const wikiWithExclamMatch = oldLine.match(/!\[\[([^|]+)(?:\|([^\]]+))?\]\]/);
			const wikiNoExclamMatch = oldLine.match(/(?:^|[^!])\[\[([^|]+)(?:\|([^\]]+))?\]\]/);
			const markdownMatch = oldLine.match(/!\[([^\]]*)\]\(([^)]+)\)/);
			const htmlMatch = oldLine.match(/<img\s+([^>]*)\s*\/?>/i);
			
			// 调试日志（仅在DEBUG模式下记录）
			if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
				await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, '匹配结果', {
					details: {
				oldLine,
				newDisplayText,
				newWidth,
				newHeight,
				wikiWithExclamMatch: wikiWithExclamMatch ? { path: wikiWithExclamMatch[1], text: wikiWithExclamMatch[2] } : null,
				wikiNoExclamMatch: wikiNoExclamMatch ? { path: wikiNoExclamMatch[1], text: wikiNoExclamMatch[2] } : null,
				markdownMatch: markdownMatch ? { alt: markdownMatch[1], path: markdownMatch[2] } : null,
				htmlMatch: htmlMatch ? 'matched' : null
					},
					imagePath: this.image.path
			});
			}
			
			// 提取旧的显示文本和尺寸并更新
			if (wikiWithExclamMatch) {
				// Wiki 格式（带!）
				// 使用 parseWikiLink 解析，这样可以正确处理显示文本和尺寸
				const parsed = parseWikiLink(wikiWithExclamMatch[0]);
				oldDisplayText = parsed.displayText || '';
				oldWidth = parsed.width;
				oldHeight = parsed.height;
				
				// 构建新的链接部分（更新显示文本和尺寸）
				const newParts: WikiLinkParts = {
					path: parsed.path,
					displayText: newDisplayText || '',
					width: newWidth !== undefined ? newWidth : parsed.width, // 使用新尺寸，如果未提供则保留原尺寸
					height: newHeight !== undefined ? newHeight : parsed.height
				};
				
				// 使用 buildWikiLink 构建新链接
				const newLink = buildWikiLink(newParts, true);
				
				// 替换 oldLine 中的链接部分
				// 需要找到 oldLine 中的完整链接并替换
				newLine = oldLine.replace(/!\[\[([^\]]+)\]\]/, newLink);
				
				// 调试日志（仅在DEBUG模式下记录）
				if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
					await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, 'Wiki 格式匹配（带!）', {
						details: { 
					parsed, 
					oldDisplayText, 
					newDisplayText, 
					newParts,
					oldLine, 
					newLine 
						},
						imagePath: this.image.path
				});
				}
			} else if (wikiNoExclamMatch) {
				// Wiki 格式（不带!）
				const beforeMatch = oldLine.substring(0, wikiNoExclamMatch.index || 0);
				if (!beforeMatch.endsWith('!')) {
					// 使用 parseWikiLink 解析
					const parsed = parseWikiLink(wikiNoExclamMatch[0]);
					oldDisplayText = parsed.displayText || '';
					oldWidth = parsed.width;
					oldHeight = parsed.height;
					
					// 构建新的链接部分（更新显示文本和尺寸）
					const newParts: WikiLinkParts = {
						path: parsed.path,
						displayText: newDisplayText || '',
						width: newWidth !== undefined ? newWidth : parsed.width, // 使用新尺寸，如果未提供则保留原尺寸
						height: newHeight !== undefined ? newHeight : parsed.height
					};
					
					// 使用 buildWikiLink 构建新链接（不带!）
					const newLink = buildWikiLink(newParts, false);
					
					// 替换 oldLine 中的链接部分
					const beforeLink = beforeMatch;
					const afterLink = oldLine.substring((wikiNoExclamMatch.index || 0) + wikiNoExclamMatch[0].length);
					newLine = beforeLink + newLink + afterLink;
					
					// 调试日志（仅在DEBUG模式下记录）
					if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
						await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, 'Wiki 格式匹配（不带!）', {
							details: { 
						parsed, 
						oldDisplayText, 
						newDisplayText, 
						newParts,
						oldLine, 
						newLine 
							},
							imagePath: this.image.path
					});
					}
				}
			} else if (markdownMatch) {
				// Markdown 格式: ![alt](path)
				const oldAlt = markdownMatch[1] || '';
				const path = markdownMatch[2]; // 保留查询参数（如果有）
				oldDisplayText = oldAlt;
				
				// 设置了尺寸：转为 HTML <img> 以便在 Obsidian 中生效（Markdown 不支持链接内尺寸）
				if (newWidth !== undefined || newHeight !== undefined) {
					const newAlt = (newDisplayText && newDisplayText.trim() !== '') ? newDisplayText : this.image.name;
					const escapedAlt = newAlt.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
					const parts = [`src="${path}"`, `alt="${escapedAlt}"`];
					if (newWidth !== undefined) parts.push(`width="${newWidth}"`);
					if (newHeight !== undefined) parts.push(`height="${newHeight}"`);
					const newImg = `<img ${parts.join(' ')}>`;
					newLine = oldLine.replace(/!\[([^\]]*)\]\(([^)]+)\)/, newImg);
				} else {
					// 无尺寸：保持 Markdown 格式
					const newAlt = (newDisplayText && newDisplayText.trim() !== '') ? newDisplayText : this.image.name;
					const escapedAlt = newAlt.replace(/\]/g, '\\]').replace(/\(/g, '\\(');
					newLine = oldLine.replace(/!\[([^\]]*)\]\(([^)]+)\)/, `![${escapedAlt}](${path})`);
				}
			} else if (htmlMatch) {
				// HTML 格式: <img src="path" alt="显示文本" width="100" height="200" ...>
				const attributes = htmlMatch[1];
				const isSelfClosing = oldLine.trim().endsWith('/>');
				
				// 提取 src 属性（支持单引号和双引号）
				const srcMatch = attributes.match(/src\s*=\s*(["'])([^"']+)\1/i);
				if (srcMatch) {
					const srcQuote = srcMatch[1]; // 引号类型
					const srcPath = srcMatch[2]; // 路径（保留查询参数）
					
					// 提取旧的 alt 属性（支持单引号和双引号）
					const altMatch = attributes.match(/alt\s*=\s*(["'])([^"']*)\1/i);
					oldDisplayText = altMatch ? altMatch[2] : '';
					
					// 提取旧的尺寸属性
					const oldSize = parseHtmlImageSize(oldLine);
					oldWidth = oldSize.width;
					oldHeight = oldSize.height;
					
					// 如果新显示文本为空，使用文件名作为 alt，否则使用新显示文本
					const newAlt = (newDisplayText && newDisplayText.trim() !== '') ? newDisplayText : this.image.name;
					
					// 转义 alt 文本中的 HTML 特殊字符（但保留引号，因为我们会用引号包裹）
					const escapedAlt = newAlt
						.replace(/&/g, '&amp;')
						.replace(/</g, '&lt;')
						.replace(/>/g, '&gt;');
					// 根据 src 使用的引号类型选择 alt 的引号
					const altQuote = srcQuote; // 使用与 src 相同的引号类型
					// 转义引号（如果使用双引号，转义双引号；如果使用单引号，转义单引号）
					const finalAlt = altQuote === '"' 
						? escapedAlt.replace(/"/g, '&quot;')
						: escapedAlt.replace(/'/g, '&#39;');
					
					// 解析所有属性，保留其他属性（跳过 src、alt、width、height，我们会重新添加）
					const attrPattern = /(\w+)\s*=\s*(["'])([^"']*)\2/gi;
					const otherAttrs: Array<{name: string, value: string, quote: string}> = [];
					let match;
					
					while ((match = attrPattern.exec(attributes)) !== null) {
						const attrName = match[1].toLowerCase();
						// 跳过 src、alt、width、height（我们会重新添加）
						if (attrName !== 'src' && attrName !== 'alt' && attrName !== 'width' && attrName !== 'height') {
							otherAttrs.push({
								name: match[1], // 保留原始大小写
								value: match[3],
								quote: match[2]
							});
						}
					}
					
					// 构建新的属性字符串
					// 格式：src="..." alt="..." width="..." height="..." 其他属性
					const attrParts: string[] = [
						`src=${srcQuote}${srcPath}${srcQuote}`,
						`alt=${altQuote}${finalAlt}${altQuote}`
					];
					
					// 添加尺寸属性（如果提供了新尺寸）
					const finalWidth = newWidth !== undefined ? newWidth : oldWidth;
					const finalHeight = newHeight !== undefined ? newHeight : oldHeight;
					
					if (finalWidth !== undefined) {
						attrParts.push(`width=${srcQuote}${finalWidth}${srcQuote}`);
					}
					if (finalHeight !== undefined) {
						attrParts.push(`height=${srcQuote}${finalHeight}${srcQuote}`);
					}
					
					// 添加其他属性
					for (const attr of otherAttrs) {
						attrParts.push(`${attr.name}=${attr.quote}${attr.value}${attr.quote}`);
					}
					
					const newAttributes = attrParts.join(' ');
					const closingTag = isSelfClosing ? ' />' : '>';
					
					newLine = oldLine.replace(/<img\s+[^>]*\/?>/i, `<img ${newAttributes}${closingTag}`);
				}
			} else {
				// 未知格式，记录日志
				if (this.plugin?.logger) {
					await this.plugin.logger.warn(OperationType.UPDATE_DISPLAY_TEXT, '无法匹配链接格式', {
						details: {
							matchType,
							oldLine
						},
						imagePath: this.image.path
					});
				}
				new Notice(`无法识别链接格式: ${matchType}`);
			}
			
			// 检查是否有实际变化
			if (newLine === oldLine) {
				// 没有变化，不需要保存
				// 调试日志（仅在DEBUG模式下记录）
				if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
					await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, '显示文本没有变化', {
						details: {
							oldLine,
							newLine,
							matchType,
							newDisplayText
						},
						imagePath: this.image.path
					});
				}
				new Notice('显示文本没有变化');
				return false;
			}
			
			// 调试日志（仅在DEBUG模式下记录）
			if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
				await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, '显示文本更新（准备保存）', {
					details: {
				matchType: matchType,
				oldLine: oldLine,
				newLine: newLine,
				oldDisplayText: oldDisplayText,
				newDisplayText: newDisplayText,
				changed: newLine !== oldLine
					},
					imagePath: this.image.path
			});
			}
			
			// 更新行内容
			lines[lineIndex] = newLine;
			
			// 保存文件
			await this.app.vault.modify(file, lines.join('\n'));
			
			// 同步更新插件主缓存，避免文件监听器重复记录日志
			if (this.plugin && typeof (this.plugin as any).updateDisplayTextCache === 'function') {
				(this.plugin as any).updateDisplayTextCache(filePath, lineNumber, newDisplayText || '', newLine);
			}
			
			// 刷新已打开的文件视图（如果文件已打开）
			// 使用 Obsidian 的 workspace API 刷新所有打开的文件
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			for (const leaf of leaves) {
				const view = leaf.view as any;
				if (view && view.file && view.file.path === filePath) {
					// 文件已打开，需要刷新视图
					try {
						// 使用 Obsidian 的 metadataCache 触发更新
						this.app.metadataCache.trigger('changed', file);
						// 如果视图有 requestSave 方法，调用它来刷新
						if (typeof view.requestSave === 'function') {
							// 不需要保存，但可以触发刷新
						}
						// 如果视图有 load 方法，重新加载
						if (typeof view.load === 'function') {
							await view.load();
						}
					} catch (e) {
						if (this.plugin?.logger) {
							await this.plugin.logger.warn(OperationType.UPDATE_DISPLAY_TEXT, '刷新文件视图失败', {
								error: e as Error,
								imagePath: this.image.path
							});
						}
					}
				}
			}
			
			// 记录历史
			if (this.historyManager) {
				// 使用当前图片路径作为 fromPath 和 toPath（因为只是修改引用，不是移动图片）
				await this.historyManager.saveHistory({
					timestamp: Date.now(),
					action: 'reference',
					fromPath: this.image.path, // 图片路径
					toPath: this.image.path, // 图片路径（未改变）
					referencePath: filePath, // 引用文件的路径
					lineNumber: lineNumber,
					oldDisplayText: oldDisplayText || '(无)',
					newDisplayText: newDisplayText || '(无)'
				});
			}
			
			// 记录日志
			if (this.plugin?.logger) {
				// 从 oldLine 和 newLine 中提取实际的链接格式（使用 parseWikiLink 和 buildWikiLink）
				let oldLink = '';
				let newLink = '';
				
				// 对于 Wiki 格式，使用 parseWikiLink 和 buildWikiLink 来确保正确提取和构建链接
				if (matchType === 'wiki' || matchType === 'wiki-with-text' || matchType === 'wiki-no-exclam' || matchType === 'wiki-no-exclam-with-text') {
					const isWithExclam = matchType.startsWith('wiki') && !matchType.includes('no-exclam');
					
					// 从 oldLine 中提取链接
					const oldMatch = oldLine.match(isWithExclam ? /!\[\[([^\]]+)\]\]/ : /\[\[([^\]]+)\]\]/);
					if (oldMatch) {
						const oldParsed = parseWikiLink(oldMatch[0]);
						oldLink = buildWikiLink(oldParsed, isWithExclam);
					}
					
					// 从 newLine 中构建链接（使用新的显示文本和尺寸）
					const newParts: WikiLinkParts = {
						path: this.image.path,
						displayText: newDisplayText || '',
						width: newWidth !== undefined ? newWidth : oldWidth,
						height: newHeight !== undefined ? newHeight : oldHeight
					};
					newLink = buildWikiLink(newParts, isWithExclam);
				} else if (matchType === 'markdown') {
					// 提取 ![alt](path)
					const match = oldLine.match(/!\[([^\]]*)\]\(([^)]+)\)/);
					if (match) {
						oldLink = match[0]; // 完整的 ![alt](path) 格式
					}
					// 构造新链接（如果显示文本为空，使用文件名）
					const newAlt = newDisplayText || this.image.name;
					newLink = `![${newAlt}](${this.image.path})`;
				} else if (matchType === 'html') {
					// 提取 <img src="path" alt="显示文本" width="100" height="200">
					const oldMatch = oldLine.match(/<img[^>]+>/i);
					if (oldMatch) {
						oldLink = oldMatch[0]; // 完整的 <img ...> 格式
					}
					// 构造新链接（包含显示文本和尺寸）
					const newAlt = newDisplayText || this.image.name;
					const finalWidth = newWidth !== undefined ? newWidth : oldWidth;
					const finalHeight = newHeight !== undefined ? newHeight : oldHeight;
					
					let newLinkParts = [`src="${this.image.path}"`, `alt="${newAlt}"`];
					if (finalWidth !== undefined) {
						newLinkParts.push(`width="${finalWidth}"`);
					}
					if (finalHeight !== undefined) {
						newLinkParts.push(`height="${finalHeight}"`);
					}
					newLink = `<img ${newLinkParts.join(' ')}>`;
				}
				
				// 检查是否有变化（显示文本、尺寸或链接）
				const displayTextChanged = oldDisplayText !== newDisplayText;
				const sizeChanged = (oldWidth !== newWidth) || (oldHeight !== newHeight);
				const linkChanged = oldLink && newLink && oldLink !== newLink;
				
				// 合并显示文本修改、尺寸修改和链接更新为一条日志（类似重命名/移动的格式）
				if (displayTextChanged || sizeChanged || linkChanged) {
					// 构建基础消息
					let logMessage = '';
					
					// 1. 显示文本修改部分
					if (displayTextChanged) {
						const displayTextPart = oldDisplayText && newDisplayText
							? `修改显示文本："${oldDisplayText}" → "${newDisplayText}"`
							: oldDisplayText
							? `移除显示文本："${oldDisplayText}"`
							: `添加显示文本："${newDisplayText}"`;
						logMessage = displayTextPart;
					}
					
					// 2. 尺寸修改部分（Wiki、HTML，或云端图片 Markdown 转 HTML）
					if (sizeChanged && (matchType.startsWith('wiki') || matchType === 'html' || matchType === 'markdown')) {
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
						if (logMessage) {
							logMessage += `\n${sizePart}`;
						} else {
							logMessage = sizePart;
						}
					}
					
					// 3. 更新链接部分
					if (linkChanged) {
						if (logMessage) {
							logMessage += `\n更新链接：${oldLink} → ${newLink}`;
						} else {
							logMessage = `更新链接：${oldLink} → ${newLink}`;
						}
					}
					
					// 4. 更新笔记部分（引用文件路径）
					logMessage += `\n更新笔记：1. ${filePath}`;
					
					// 记录合并后的日志
					await this.plugin.logger.info(
						OperationType.UPDATE_DISPLAY_TEXT,
						logMessage,
						{
							imageHash: this.image.md5,
							imagePath: this.image.path,
							imageName: this.image.name,
							details: {
								referencePath: filePath,
								lineNumber: lineNumber,
								oldDisplayText: oldDisplayText || '(无)',
								newDisplayText: newDisplayText || '(无)',
								oldWidth: oldWidth,
								oldHeight: oldHeight,
								newWidth: newWidth,
								newHeight: newHeight,
								matchType: matchType,
								oldLink: oldLink || undefined,
								newLink: newLink || undefined,
								referencedFiles: [filePath] // 添加引用文件列表
							}
						}
					);
				}
			}
			
			// 构建通知消息
			let noticeMessage = '显示文本已更新';
			if (newWidth !== undefined || newHeight !== undefined) {
				if (newDisplayText) {
					noticeMessage = '显示文本和尺寸已更新';
				} else {
					noticeMessage = '显示尺寸已更新';
				}
			}
			new Notice(noticeMessage);
			return true;
		} catch (error) {
			// 记录错误日志
			if (this.plugin?.logger) {
				await this.plugin.logger.error(
					OperationType.UPDATE_DISPLAY_TEXT,
					'保存显示文本失败',
					{
						imageHash: this.image.md5,
						imagePath: this.image.path,
						imageName: this.image.name,
						error: error as Error,
						details: {
							referencePath: filePath,
							lineNumber: lineNumber,
							matchType: matchType
						}
					}
				);
			}
			
			new Notice('保存失败: ' + (error instanceof Error ? error.message : String(error)));
			throw error; // 重新抛出错误，让调用者处理
		}
	}

	/**
	 * 更新分组数据（当图片移动或重命名时）
	 */
	private async updateGroupDataOnMove(oldPath: string, newPath: string) {
		if (!this.plugin || !this.plugin.data.imageGroups) return;
		
		let hasChanges = false;
		
		// 遍历所有分组，更新路径
		if (!this.plugin.data.imageGroups) return;
		const imageGroups = this.plugin.data.imageGroups;
		Object.keys(imageGroups).forEach(groupName => {
			const paths = imageGroups[groupName] as string[] | undefined;
			if (!paths) return;
			
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

	onClose() {
		// 注销笔记内图片尺寸更新监听
		if (this.noteImageSizeUpdatedUnregister) {
			this.noteImageSizeUpdatedUnregister();
			this.noteImageSizeUpdatedUnregister = null;
		}

		// 清理组件
		if (this.previewPanel) {
			this.previewPanel.cleanup();
		}
		if (this.historyPanel) {
			this.historyPanel.cleanup();
		}
		
		// 清除自动刷新定时器（如果组件未处理）
		if (this.historyRefreshInterval) {
			clearInterval(this.historyRefreshInterval);
			this.historyRefreshInterval = undefined;
		}
		
		// 清理窗口大小变化监听器
		if (this.resizeHandler) {
			window.removeEventListener('resize', this.resizeHandler);
			this.resizeHandler = null;
		}
		
		// 清理路径输入框窗口大小变化监听器
		if (this.pathResizeHandler) {
			window.removeEventListener('resize', this.pathResizeHandler);
			this.pathResizeHandler = null;
		}
		
		const { contentEl } = this;
		// 清理事件监听器
		if (this.imgElement && this.wheelHandler) {
			this.imgElement.removeEventListener('wheel', this.wheelHandler);
		}
		// 清理图片加载监听器（防止内存泄漏）
		if (this.imgElement) {
			this.imgElement.removeEventListener('load', this.onImageLoadBound || (() => {}));
			this.imgElement.removeEventListener('error', this.onImageErrorBound || (() => {}));
		}
		if (this.closeSuggestionsHandler) {
			document.removeEventListener('click', this.closeSuggestionsHandler);
		}
		// 清理全局滚轮监听
		if (this.modalWheelHandler) {
			this.modalEl.removeEventListener('wheel', this.modalWheelHandler as EventListener, { capture: true } as any);
			this.modalWheelHandler = null;
		}
		
		// 清理键盘事件监听器
		if (this.keyboardHandler) {
			window.removeEventListener('keydown', this.keyboardHandler);
			this.keyboardHandler = null;
		}
		
		contentEl.empty();
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
		this.keyboardHandler = (e: KeyboardEvent) => {
			// 动态从设置中获取最新的快捷键配置
			const shortcuts = this.plugin?.settings.keyboardShortcuts || {};
			
			// 检查是否在路径输入框中且建议列表显示
			const pathSuggestionsList = this.contentEl.querySelector('.path-suggestions') as HTMLElement;
			const isPathInputFocused = e.target === this.pathInput;
			const isSuggestionsVisible = pathSuggestionsList && pathSuggestionsList.style.display !== 'none';
			
			// 如果焦点在路径输入框中且建议列表显示，ArrowUp/ArrowDown 用于导航建议，不切换图片
			if (isPathInputFocused && isSuggestionsVisible && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
				return; // 让路径输入框的 keydown 事件处理
			}

			// 如果焦点在输入框中，不触发快捷键（某些快捷键除外，如 Escape、ArrowUp、ArrowDown）
			if (isInputElement(e.target) && e.key !== 'Escape' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
				return;
			}

			// 图片详情页 - 导航
			// ArrowUp 切换到上一张，ArrowDown 切换到下一张
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				this.showPreviousImage();
				return;
			}

			if (e.key === 'ArrowDown') {
				e.preventDefault();
				this.showNextImage();
				return;
			}

			const prevKey = shortcuts['image-detail-previous'] || SHORTCUT_DEFINITIONS['image-detail-previous'].defaultKey;
			if (matchesShortcut(e, prevKey)) {
				e.preventDefault();
				this.showPreviousImage();
				return;
			}

			const nextKey = shortcuts['image-detail-next'] || SHORTCUT_DEFINITIONS['image-detail-next'].defaultKey;
			if (matchesShortcut(e, nextKey)) {
				e.preventDefault();
				this.showNextImage();
				return;
			}

			const firstKey = shortcuts['image-detail-first'] || SHORTCUT_DEFINITIONS['image-detail-first'].defaultKey;
			if (matchesShortcut(e, firstKey)) {
				e.preventDefault();
				this.showFirstImage();
				return;
			}

			const lastKey = shortcuts['image-detail-last'] || SHORTCUT_DEFINITIONS['image-detail-last'].defaultKey;
			if (matchesShortcut(e, lastKey)) {
				e.preventDefault();
				this.showLastImage();
				return;
			}

			const closeKey = shortcuts['image-detail-close'] || SHORTCUT_DEFINITIONS['image-detail-close'].defaultKey;
			if (matchesShortcut(e, closeKey)) {
				e.preventDefault();
				this.handleClose();
				return;
			}

			// 图片详情页 - 编辑操作
			const deleteKey = shortcuts['image-detail-delete'] || SHORTCUT_DEFINITIONS['image-detail-delete'].defaultKey;
			if (matchesShortcut(e, deleteKey)) {
				e.preventDefault();
				this.deleteImage();
				return;
			}

			const saveKey = shortcuts['image-detail-save'] || SHORTCUT_DEFINITIONS['image-detail-save'].defaultKey;
			if (matchesShortcut(e, saveKey)) {
				e.preventDefault();
				// 保存所有更改
				this.saveAllChanges();
				return;
			}

			// 图片详情页 - 切换锁定（优先检查带修饰键的快捷键）
			const toggleLockKey = shortcuts['manager-toggle-lock'] || SHORTCUT_DEFINITIONS['manager-toggle-lock'].defaultKey;
			if (matchesShortcut(e, toggleLockKey)) {
				e.preventDefault();
				this.toggleIgnoreFile();
				return;
			}

			// 以下单键快捷键只在没有修饰键时触发，避免与 Ctrl+X 等组合键冲突
			const hasModifier = e.ctrlKey || e.metaKey || e.altKey;

			// 图片详情页 - 预览操作
			const zoomInKey = shortcuts['image-detail-zoom-in'] || SHORTCUT_DEFINITIONS['image-detail-zoom-in'].defaultKey;
			if (matchesShortcut(e, zoomInKey) || (!hasModifier && (e.key === '+' || e.key === '='))) {
				e.preventDefault();
				this.zoomIn();
				return;
			}

			const zoomOutKey = shortcuts['image-detail-zoom-out'] || SHORTCUT_DEFINITIONS['image-detail-zoom-out'].defaultKey;
			if (matchesShortcut(e, zoomOutKey) || (!hasModifier && e.key === '-')) {
				e.preventDefault();
				this.zoomOut();
				return;
			}

			const resetKey = shortcuts['image-detail-reset'] || SHORTCUT_DEFINITIONS['image-detail-reset'].defaultKey;
			if (matchesShortcut(e, resetKey) || (!hasModifier && e.key === '0')) {
				e.preventDefault();
				this.resetTransform();
				return;
			}

			const rotateRightKey = shortcuts['image-detail-rotate-right'] || SHORTCUT_DEFINITIONS['image-detail-rotate-right'].defaultKey;
			if (matchesShortcut(e, rotateRightKey) || (!hasModifier && e.key.toLowerCase() === 'r')) {
				e.preventDefault();
				this.rotateRight();
				return;
			}

			const rotateLeftKey = shortcuts['image-detail-rotate-left'] || SHORTCUT_DEFINITIONS['image-detail-rotate-left'].defaultKey;
			if (matchesShortcut(e, rotateLeftKey) || (!hasModifier && e.key.toLowerCase() === 'l')) {
				e.preventDefault();
				this.rotateLeft();
				return;
			}

			const toggleViewModeKey = shortcuts['image-detail-toggle-view-mode'] || SHORTCUT_DEFINITIONS['image-detail-toggle-view-mode'].defaultKey;
			if (matchesShortcut(e, toggleViewModeKey) || (!hasModifier && e.key.toLowerCase() === 'f')) {
				e.preventDefault();
				this.cycleViewMode();
				return;
			}

			const toggleWheelModeKey = shortcuts['image-detail-toggle-wheel-mode'] || SHORTCUT_DEFINITIONS['image-detail-toggle-wheel-mode'].defaultKey;
			if (matchesShortcut(e, toggleWheelModeKey) || (!hasModifier && e.key.toLowerCase() === 'w')) {
				e.preventDefault();
				this.toggleScrollMode();
				return;
			}
		};

		window.addEventListener('keydown', this.keyboardHandler);
	}

	/**
	 * 保存所有更改（文件名和路径）
	 */
	async saveAllChanges() {
		if (!this.fileNameInput || !this.pathInput) {
			return;
		}

		const newBaseName = this.fileNameInput.value.trim();
		const newPath = this.pathInput.value.trim();
		const fileNameParts = this.image.name.split('.');
		const fileExtension = fileNameParts.length > 1 ? '.' + fileNameParts[fileNameParts.length - 1] : '';

		if (!newBaseName) {
			new Notice('❌ 文件名不能为空');
			return;
		}

		try {
			await this.saveChanges(newBaseName, fileExtension, newPath);
			new Notice('✅ 已保存所有更改');
		} catch (error) {
			new Notice(`❌ 保存失败: ${error}`);
		}
	}
}
