import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import ImageManagementPlugin from '../main';
import { TrashManager, TrashItem } from '../utils/trash-manager';
import { ConfirmModal } from './confirm-modal';
import { ImageDetailModal } from './image-detail-modal';
import { ImageInfo } from '../types';
import { calculateBufferHash } from '../utils/image-hash';
import { UI_SIZE } from '../constants';
import { makeModalResizable } from '../utils/resizable-modal';
import { DragSelectManager } from '../utils/drag-select-manager';

/**
 * 回收站模态框类
 * 
 * 显示和管理已删除的图片文件，包括：
 * - 查看已删除的图片列表
 * - 搜索和排序已删除的文件
 * - 恢复单个或多个文件
 * - 永久删除文件
 * - 清空回收站
 */
export class TrashModal extends Modal {
	/** 插件实例引用 */
	private plugin: ImageManagementPlugin;
	/** 回收站管理器实例 */
	private trashManager: TrashManager;
	/** 所有回收站项目列表 */
	private trashItems: TrashItem[] = [];
	/** 经过搜索和排序后的项目列表 */
	private filteredItems: TrashItem[] = [];
	/** 用户选中的项目路径集合 */
	private selectedItems: Set<string> = new Set();
	/** 搜索输入框 DOM 元素引用 */
	private searchInput: HTMLInputElement | null = null;
	/** 排序下拉菜单 DOM 元素引用 */
	private sortSelect: HTMLSelectElement | null = null;
	/** 项目容器 DOM 元素引用 */
	private itemsContainer: HTMLElement | null = null;
	/** 卡片元素缓存：itemPath -> HTMLElement
	 * 用于快速查找和更新卡片，避免重复创建
	 */
	private cardElements: Map<string, HTMLElement> = new Map();
	/** 拖拽框选管理器 */
	private dragSelectManager: DragSelectManager | null = null;

	constructor(app: App, plugin: ImageManagementPlugin) {
		super(app);
		this.plugin = plugin;
		// 使用插件已有的 trashManager 实例，避免重复创建
		this.trashManager = plugin.trashManager;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('trash-modal');
		
		// 设置模态框大小
		this.modalEl.style.width = '90vw';
		this.modalEl.style.maxWidth = '1400px';
		this.modalEl.style.height = '85vh';
		
		// 启用模态框可调整大小
		makeModalResizable(this.modalEl, {
			minWidth: 600,
			minHeight: 400,
			maxWidth: window.innerWidth * 0.95,
			maxHeight: window.innerHeight * 0.95,
		});
		
		// 设置 contentEl 为 flex 布局
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.height = '100%';
		contentEl.style.overflow = 'hidden';

		// 标题
		contentEl.createEl('h2', { text: '🗑️ 回收站' });

		// 创建工具栏
		this.createToolbar(contentEl);

		// 创建文件列表容器
		const container = contentEl.createDiv('trash-items-container');
		container.style.cssText = `
			overflow-y: auto;
			margin-top: 16px;
			flex: 1;
			background: transparent;
		`;
		this.itemsContainer = container;

		// 先尝试同步获取缓存数据，如果有缓存立即显示
		// 这样可以避免闪烁
		this.loadTrashItemsSync();
		
		// 初始化拖拽框选功能
		this.setupDragSelect(container);
		
		// 设置键盘快捷键
		this.setupKeyboardShortcuts();
	}
	
	/**
	 * 设置键盘快捷键
	 */
	private setupKeyboardShortcuts() {
		this.modalEl.addEventListener('keydown', this.handleKeyPress);
		
		// 确保模态框可以接收焦点
		this.modalEl.setAttribute('tabindex', '-1');
		this.modalEl.focus();
	}
	
	/**
	 * 处理键盘按键
	 */
	private handleKeyPress = (e: KeyboardEvent) => {
		// 如果焦点在输入框中，除了 Escape 其他按键不处理
		const target = e.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
			if (e.key !== 'Escape') {
				return;
			}
		}
		
		// Delete 键：删除选中的文件
		if (e.key === 'Delete' && this.selectedItems.size > 0) {
			e.preventDefault();
			this.deleteSelected();
			return;
		}
		
		// R 键：恢复选中的文件
		if (e.key === 'r' || e.key === 'R') {
			if (this.selectedItems.size > 0) {
				e.preventDefault();
				this.restoreSelected();
			}
			return;
		}
		
		// Ctrl+A / Cmd+A：全选/取消全选
		if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
			e.preventDefault();
			this.selectAll();
			return;
		}
		
		// Escape：关闭回收站
		if (e.key === 'Escape') {
			e.preventDefault();
			this.close();
			return;
		}
	}
	
	onClose() {
		// 移除键盘事件监听器
		this.modalEl.removeEventListener('keydown', this.handleKeyPress);
	}
	
	/**
	 * 同步加载回收站文件（优先使用缓存）
	 */
	private loadTrashItemsSync() {
		// 尝试同步获取缓存数据
		const cachedItems = this.trashManager.getCachedItems();
		
		if (cachedItems !== null) {
			// 有有效缓存，立即显示（同步，无延迟）
			this.trashItems = cachedItems;
			this.applyFilters();
			this.updateSelectAllButton();
			
			// 后台刷新数据（如果缓存可能已过期）
			this.loadTrashItems();
			return;
		}
		
		// 没有缓存，异步加载（但不显示加载状态，直接显示空状态）
		this.trashItems = [];
		this.applyFilters();
		this.updateSelectAllButton();
		
		// 后台加载数据
		this.loadTrashItems();
	}

	/**
	 * 创建工具栏
	 */
	private createToolbar(container: HTMLElement) {
		const toolbar = container.createDiv('trash-toolbar');
		toolbar.style.cssText = `
			display: flex;
			gap: 12px;
			margin-bottom: 16px;
			flex-wrap: wrap;
			align-items: center;
			padding: 12px;
			background: var(--background-secondary);
			border-radius: 8px;
			border: 1px solid var(--background-modifier-border);
		`;

		// 搜索框
		const searchContainer = toolbar.createDiv('search-container');
		searchContainer.style.cssText = 'flex: 1; min-width: 200px;';
		const searchSetting = new Setting(searchContainer);
		searchSetting.settingEl.style.border = 'none';
		searchSetting.settingEl.style.padding = '0';
		searchSetting.settingEl.style.margin = '0';
		searchSetting.controlEl.style.width = '100%';
		searchSetting.addText(text => {
			this.searchInput = text.inputEl;
			this.searchInput.placeholder = '🔍 搜索文件名或路径...';
			this.searchInput.style.cssText = 'width: 100%;';
			this.searchInput.addEventListener('input', () => {
				this.applyFilters();
			});
		});

		// 排序选择
		const sortContainer = toolbar.createDiv('sort-container');
		sortContainer.style.cssText = 'min-width: 180px;';
		const sortSetting = new Setting(sortContainer);
		sortSetting.settingEl.style.border = 'none';
		sortSetting.settingEl.style.padding = '0';
		sortSetting.settingEl.style.margin = '0';
		sortSetting.addDropdown(dropdown => {
			this.sortSelect = dropdown.selectEl;
			dropdown
				.addOption('time-desc', '删除时间（新→旧）')
				.addOption('time-asc', '删除时间（旧→新）')
				.addOption('name-asc', '文件名（A→Z）')
				.addOption('name-desc', '文件名（Z→A）')
				.addOption('size-desc', '文件大小（大→小）')
				.addOption('size-asc', '文件大小（小→大）')
				.setValue('time-desc');
			dropdown.onChange(() => {
				this.applyFilters();
			});
		});

		// 操作按钮组
		const buttonGroup = toolbar.createDiv('button-group');
		buttonGroup.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

		// 全选按钮
		const selectAllBtn = buttonGroup.createEl('button', {
			text: '☑️ 全选',
			cls: 'mod-secondary'
		});
		selectAllBtn.style.cssText = 'padding: 6px 12px; font-size: 12px;';
		selectAllBtn.setAttribute('data-select-all-btn', 'true');
		selectAllBtn.addEventListener('click', () => this.selectAll());

		// 恢复选中
		const restoreBtn = buttonGroup.createEl('button', {
			text: '↩️ 恢复选中',
			cls: 'mod-cta'
		});
		restoreBtn.style.cssText = 'padding: 6px 12px; font-size: 12px;';
		restoreBtn.addEventListener('click', () => this.restoreSelected());

		// 删除选中
		const deleteBtn = buttonGroup.createEl('button', {
			text: '🗑️ 删除选中',
			cls: 'mod-warning'
		});
		deleteBtn.style.cssText = 'padding: 6px 12px; font-size: 12px;';
		deleteBtn.addEventListener('click', () => this.deleteSelected());

		// 清空回收站
		const emptyBtn = buttonGroup.createEl('button', {
			text: '🗑️ 清空回收站',
			cls: 'mod-warning'
		});
		emptyBtn.style.cssText = 'padding: 6px 12px; font-size: 12px;';
		emptyBtn.addEventListener('click', () => this.emptyTrash());
		
		// 创建统计信息和快捷键区域（三列布局）
		const statsContainer = container.createDiv('trash-stats-top');
		statsContainer.style.cssText = `
			display: grid;
			grid-template-columns: 1fr auto 1fr;
			align-items: center;
			padding: 10px 16px;
			margin-bottom: 12px;
			background: var(--background-secondary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 6px;
			font-size: 13px;
			color: var(--text-normal);
			gap: 16px;
		`;
		statsContainer.setAttribute('data-stats-container', 'true');
		
		// 左侧：数量信息
		const countInfo = statsContainer.createEl('span', {
			attr: { 'data-count-text': 'true' }
		});
		countInfo.textContent = '总共 0 张，已选中 0 张';
		countInfo.style.cssText = 'text-align: left; white-space: nowrap;';
		
		// 中间：快捷键提示（居中）
		const shortcutHint = statsContainer.createDiv('shortcut-hint');
		shortcutHint.style.cssText = `
			font-size: 11px;
			color: var(--text-muted);
			text-align: center;
			white-space: nowrap;
		`;
		shortcutHint.innerHTML = `
			<span style="opacity: 0.8;">⌨️ 快捷键：</span>
			<code style="padding: 2px 6px; background: var(--background-modifier-border); border-radius: 3px; margin: 0 4px;">Delete</code> 删除
			<code style="padding: 2px 6px; background: var(--background-modifier-border); border-radius: 3px; margin: 0 4px;">R</code> 恢复
			<code style="padding: 2px 6px; background: var(--background-modifier-border); border-radius: 3px; margin: 0 4px;">Ctrl+A</code> 全选
			<code style="padding: 2px 6px; background: var(--background-modifier-border); border-radius: 3px; margin: 0 4px;">Esc</code> 关闭
		`;
		
		// 右侧：大小信息
		const sizeInfo = statsContainer.createEl('span', {
			attr: { 'data-size-text': 'true' }
		});
		sizeInfo.textContent = '总大小 0 B，选中大小 0 B';
		sizeInfo.style.cssText = 'text-align: right; white-space: nowrap;';
	}

	/**
	 * 加载回收站文件（异步）
	 */
	private async loadTrashItems() {
		// 先尝试使用缓存数据（不强制刷新）
		// 如果缓存有效，会立即返回，无需等待
		const items = await this.trashManager.getTrashItems(false);
		
		// 如果当前没有数据，立即显示（避免空白）
		if (this.trashItems.length === 0 && items.length > 0) {
			this.trashItems = items;
			this.applyFilters();
			this.updateSelectAllButton();
		} else if (this.trashItems.length > 0) {
			// 如果已有数据，检查是否需要更新
			const itemsStr = JSON.stringify(items);
			const currentStr = JSON.stringify(this.trashItems);
			if (itemsStr !== currentStr) {
				this.trashItems = items;
				this.applyFilters();
				this.updateSelectAllButton();
			}
		} else {
			// 没有数据，直接显示空状态
			this.trashItems = items;
			this.applyFilters();
			this.updateSelectAllButton();
		}
		
		// 后台刷新数据（如果缓存可能已过期）
		this.trashManager.getTrashItems(true).then(freshItems => {
			// 如果数据有变化，更新显示
			if (JSON.stringify(freshItems) !== JSON.stringify(this.trashItems)) {
				this.trashItems = freshItems;
				this.applyFilters();
				this.updateSelectAllButton();
			}
		}).catch(() => {
			// 刷新失败不影响显示
		});
	}

	/**
	 * 更新全选按钮文本
	 */
	private updateSelectAllButton() {
		const selectAllBtn = this.contentEl.querySelector('[data-select-all-btn]') as HTMLElement;
		if (selectAllBtn) {
			selectAllBtn.textContent = this.selectedItems.size === this.filteredItems.length && this.filteredItems.length > 0
				? '☐ 全不选' 
				: '☑️ 全选';
		}
	}

	/**
	 * 应用筛选和排序
	 */
	private applyFilters() {
		// 搜索筛选（只搜索文件名）
		const searchText = this.searchInput?.value.toLowerCase() || '';
		this.filteredItems = this.trashItems.filter(item => {
			if (!searchText) return true;
			return item.originalName.toLowerCase().includes(searchText);
		});

		// 排序
		const sortValue = this.sortSelect?.value || 'time-desc';
		this.filteredItems.sort((a, b) => {
			switch (sortValue) {
				case 'time-desc':
					return b.deletedAt - a.deletedAt;
				case 'time-asc':
					return a.deletedAt - b.deletedAt;
				case 'name-asc':
					return a.originalName.localeCompare(b.originalName);
				case 'name-desc':
					return b.originalName.localeCompare(a.originalName);
				case 'size-desc':
					return b.size - a.size;
				case 'size-asc':
					return a.size - b.size;
				default:
					return 0;
			}
		});

		this.renderItems();
	}

	/**
	 * 检查文件是否为图片
	 */
	private isImageFile(fileName: string): boolean {
		const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
		const lowerName = fileName.toLowerCase();
		return imageExtensions.some(ext => lowerName.endsWith(ext));
	}

	/**
	 * 切换选中状态（统一处理点击卡片和复选框）
	 */
	private toggleSelection(card: HTMLElement, itemPath: string) {
		// 切换选中状态
		if (this.selectedItems.has(itemPath)) {
			this.selectedItems.delete(itemPath);
		} else {
			this.selectedItems.add(itemPath);
		}
		
		// 更新 UI
		this.updateCardSelection(card, itemPath);
	}

	/**
	 * 更新卡片的选中状态（不重新渲染整个列表）
	 */
	private updateCardSelection(card: HTMLElement, itemPath: string) {
		const isSelected = this.selectedItems.has(itemPath);
		card.style.borderColor = isSelected 
			? 'var(--interactive-accent)' 
			: 'var(--background-modifier-border)';
		
		// 更新复选框状态和样式（使用更精确的选择器）
		const checkbox = card.querySelector('input[data-item-checkbox="true"]') as HTMLInputElement;
		if (checkbox) {
			checkbox.checked = isSelected;
			if (isSelected) {
				checkbox.style.backgroundColor = 'var(--interactive-accent)';
				checkbox.style.borderColor = 'var(--interactive-accent)';
				checkbox.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3E%3Cpath fill=\'white\' d=\'M13.5 3L6 10.5 2.5 7l-1 1L6 12.5 14.5 4z\'/%3E%3C/svg%3E")';
				checkbox.style.backgroundSize = 'contain';
			} else {
				checkbox.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
				checkbox.style.borderColor = 'rgba(255, 255, 255, 0.8)';
				checkbox.style.backgroundImage = 'none';
			}
		}
		
		// 更新全选按钮文本
		this.updateSelectAllButton();
		
		// 更新统计信息
		this.updateStats();
	}

	/**
	 * 渲染文件列表
	 */
	private renderItems() {
		if (!this.itemsContainer) return;

		// 清空缓存
		this.cardElements.clear();
		
		// 直接同步渲染，避免闪烁
		// 只有在数据量很大时才考虑使用 requestAnimationFrame
		this.itemsContainer.empty();
		this.renderItemsContent();
	}

	/**
	 * 实际渲染内容（在 requestAnimationFrame 中调用）
	 */
	private renderItemsContent() {
		if (!this.itemsContainer) return;

		if (this.filteredItems.length === 0) {
			const emptyState = this.itemsContainer.createDiv('trash-empty-state');
			emptyState.style.cssText = `
				text-align: center;
				padding: 60px 20px;
				color: var(--text-muted);
			`;
			emptyState.createEl('div', {
				text: '🗑️',
				attr: { style: 'font-size: 48px; margin-bottom: 16px; opacity: 0.5;' }
			});
			emptyState.createEl('div', {
				text: '回收站为空',
				attr: { style: 'font-size: 16px; font-weight: 500;' }
			});
			return;
		}

		// 创建卡片列表容器（使用 grid 布局，自适应宽高比）
		const cardsContainer = this.itemsContainer.createDiv('trash-cards-container');
		cardsContainer.style.cssText = `
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
			gap: 12px;
			margin-bottom: 16px;
			align-items: start;
		`;

		// 不再固定宽度，使用 grid 自动布局
		const itemWidth = '100%';

		for (const item of this.filteredItems) {
			const card = cardsContainer.createDiv('trash-item-card');
			// 缓存卡片元素
			this.cardElements.set(item.path, card);
			const isSelected = this.selectedItems.has(item.path);
			const isImage = this.isImageFile(item.originalName);
			
			card.style.cssText = `
				background: var(--background-secondary);
				border: 2px solid ${isSelected ? 'var(--interactive-accent)' : 'transparent'};
				border-radius: 8px;
				padding: 0;
				transition: all 0.2s ease;
				cursor: pointer;
				position: relative;
				width: ${itemWidth};
				overflow: hidden;
				display: flex;
				flex-direction: column;
				box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
			`;

			// 点击卡片切换选中状态
			card.addEventListener('click', (e) => {
				// 如果点击的是按钮或复选框，不触发选中
				const target = e.target as HTMLElement;
				if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') {
					return;
				}
				// 切换选中状态
				this.toggleSelection(card, item.path);
			});

			// 预览区域（图片或占位符）- 完全自适应高度
			const previewContainer = card.createDiv('preview-container');
			previewContainer.style.cssText = `
				width: 100%;
				border-radius: 6px 6px 0 0;
				overflow: hidden;
				background: var(--background-primary);
				display: flex;
				align-items: center;
				justify-content: center;
				position: relative;
				transition: transform 0.2s ease, box-shadow 0.2s ease;
			`;
			
			// 复选框（右上角，使用与首页相同的样式）
			const checkbox = previewContainer.createEl('input');
			checkbox.type = 'checkbox';
			checkbox.className = 'image-select-checkbox';
			checkbox.checked = isSelected;
			checkbox.setAttribute('data-item-checkbox', 'true'); // 添加标识
			checkbox.style.position = 'absolute';
			checkbox.style.top = UI_SIZE.CHECKBOX.TOP;
			checkbox.style.right = UI_SIZE.CHECKBOX.RIGHT;
			checkbox.style.zIndex = '10'; // 增加 z-index 确保在最上层
			checkbox.style.width = UI_SIZE.CHECKBOX.SIZE;
			checkbox.style.height = UI_SIZE.CHECKBOX.SIZE;
			checkbox.style.cursor = 'pointer';
			checkbox.style.appearance = 'none';
			checkbox.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
			checkbox.style.border = '2px solid rgba(255, 255, 255, 0.8)';
			checkbox.style.borderRadius = UI_SIZE.BORDER_RADIUS.SM;
			checkbox.style.transition = 'all 0.2s ease';
			checkbox.style.pointerEvents = 'auto'; // 确保可以点击
			
			// 复选框选中状态
			if (isSelected) {
				checkbox.style.backgroundColor = 'var(--interactive-accent)';
				checkbox.style.borderColor = 'var(--interactive-accent)';
				checkbox.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3E%3Cpath fill=\'white\' d=\'M13.5 3L6 10.5 2.5 7l-1 1L6 12.5 14.5 4z\'/%3E%3C/svg%3E")';
				checkbox.style.backgroundSize = 'contain';
			}
			
			// 移除悬停效果，保持颜色始终一致
			
			checkbox.addEventListener('click', (e) => {
				e.stopPropagation(); // 阻止事件冒泡到卡片
				// 切换选中状态（统一处理）
				this.toggleSelection(card, item.path);
			});
			
			// 双击预览容器打开详情
			previewContainer.addEventListener('dblclick', () => {
				this.openImageDetail(item);
			});
			
			if (isImage) {
				// 尝试加载图片
				const loadImage = async () => {
					try {
						// 直接使用原始路径（不解码）
						// 因为文件系统中保存的就是 URL 编码的文件名
						const filePath = item.path;
						
						// 使用 adapter 直接读取文件（因为回收站文件不在 vault 索引中）
						const fileExists = await this.app.vault.adapter.exists(filePath);
						
						if (!fileExists) {
							previewContainer.style.aspectRatio = '1';
							// 创建占位符，不覆盖复选框
							const placeholder = previewContainer.createDiv();
							placeholder.style.cssText = 'text-align: center; font-size: 48px; opacity: 0.5; color: var(--text-muted); pointer-events: none;';
							placeholder.innerHTML = '📷<br><span style="font-size: 12px; opacity: 0.7;">文件不存在</span>';
							return;
						}
						
						// 读取文件为 ArrayBuffer
						const arrayBuffer = await this.app.vault.adapter.readBinary(filePath);
						
						// 转换为 Blob
						const blob = new Blob([arrayBuffer]);
						const imageUrl = URL.createObjectURL(blob);
						
						// 创建临时 Image 对象来预加载
						const img = new Image();
						
						img.onload = () => {
							// 完全根据图片宽高比自适应（不限制最大高度）
							const aspectRatio = img.width / img.height;
							if (aspectRatio > 0) {
								previewContainer.style.aspectRatio = `${aspectRatio}`;
							} else {
								// 默认正方形
								previewContainer.style.aspectRatio = '1';
							}
							
							// 图片加载成功，设置为背景
							previewContainer.style.backgroundImage = `url("${imageUrl}")`;
							previewContainer.style.backgroundSize = 'cover';
							previewContainer.style.backgroundPosition = 'center';
							previewContainer.style.backgroundRepeat = 'no-repeat';
							// 不清空 innerHTML，保留复选框
						};
						
						img.onerror = (error) => {
							// 图片加载失败，使用正方形占位
							console.error('Failed to load trash image:', filePath, error);
							URL.revokeObjectURL(imageUrl); // 清理 URL
							previewContainer.style.aspectRatio = '1';
							// 创建占位符，不覆盖复选框
							const placeholder = previewContainer.createDiv();
							placeholder.style.cssText = 'text-align: center; font-size: 48px; opacity: 0.5; color: var(--text-muted); pointer-events: none;';
							placeholder.innerHTML = '📷<br><span style="font-size: 12px; opacity: 0.7;">加载失败</span>';
						};
						
						// 开始加载
						img.src = imageUrl;
					} catch (error) {
						console.error('Error loading trash image:', item.path, error);
						previewContainer.style.aspectRatio = '1';
						// 创建占位符，不覆盖复选框
						const placeholder = previewContainer.createDiv();
						placeholder.style.cssText = 'text-align: center; font-size: 48px; opacity: 0.5; color: var(--text-muted); pointer-events: none;';
						placeholder.textContent = '📷';
						const placeholderText = placeholder.createSpan();
						placeholderText.style.cssText = 'display: block; font-size: 12px; opacity: 0.7; margin-top: 8px;';
						placeholderText.textContent = '加载错误';
					}
				};
				
				// 异步加载图片
				loadImage();
			} else {
				// 非图片文件显示文件图标（使用正方形）
				previewContainer.style.aspectRatio = '1';
				const fileIcon = previewContainer.createDiv();
				fileIcon.textContent = '📄';
				fileIcon.style.cssText = 'font-size: 64px; opacity: 0.4; pointer-events: none; text-align: center;';
			}
			
			// 悬停效果（卡片级别）
			card.addEventListener('mouseenter', () => {
				if (!isSelected) {
					card.style.transform = 'translateY(-2px)';
					card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
				}
			});
			card.addEventListener('mouseleave', () => {
				if (!isSelected) {
					card.style.transform = 'translateY(0)';
					card.style.boxShadow = 'none';
				}
			});

			// 文件信息
			const infoContainer = card.createDiv('info-container');
			infoContainer.style.cssText = `
				display: flex; 
				flex-direction: column; 
				gap: 2px;
				padding: 6px 12px;
				background: transparent;
				min-height: 0;
				height: auto;
				box-sizing: border-box;
				flex-shrink: 0;
			`;

			// 文件名
			const fileName = infoContainer.createDiv('file-name');
			fileName.style.cssText = `
				font-weight: 600;
				font-size: 13px;
				color: var(--text-normal);
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				line-height: 1.3;
				margin-bottom: 2px;
			`;
			// URL 解码文件名
			const decodedName = decodeURIComponent(item.originalName);
			fileName.textContent = decodedName;
			fileName.title = decodedName;

			// 原始路径（显示在文件名下方，只显示目录部分）
			const filePath = infoContainer.createDiv('file-path');
			filePath.style.cssText = `
				font-size: 10px;
				color: var(--text-muted);
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				line-height: 1.2;
				opacity: 0.8;
			`;
			// 提取目录部分（去掉文件名）
			let displayPath = '根目录';
			if (item.originalFullPath && item.originalFullPath.includes('/')) {
				const lastSlashIndex = item.originalFullPath.lastIndexOf('/');
				const dirPath = item.originalFullPath.substring(0, lastSlashIndex);
				displayPath = decodeURIComponent(dirPath) || '根目录';
			}
			filePath.textContent = displayPath;
			filePath.title = displayPath;

			// 元信息行（时间 + 大小）
			const metaRow = infoContainer.createDiv('meta-row');
			metaRow.style.cssText = `
				display: flex;
				justify-content: space-between;
				align-items: center;
				font-size: 10px;
				color: var(--text-muted);
				margin-top: 6px;
				line-height: 1.3;
			`;

			// 删除时间（显示具体时间）
			const timeInfo = metaRow.createDiv('time-info');
			timeInfo.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
			const deleteTime = this.trashManager.formatDateTime(item.deletedAt);
			timeInfo.textContent = deleteTime;
			timeInfo.title = deleteTime;

			// 文件大小
			const sizeInfo = metaRow.createDiv('size-info');
			sizeInfo.textContent = this.trashManager.formatFileSize(item.size);
			sizeInfo.style.cssText = 'font-weight: 500; margin-left: 8px;';
		}

		// 更新顶部统计信息
		this.updateStats();
		
		// 更新全选按钮文本
		this.updateSelectAllButton();
	}

	/**
	 * 更新统计信息
	 */
	private updateStats() {
		// 计算总大小和选中大小
		const totalSize = this.filteredItems.reduce((sum, item) => sum + item.size, 0);
		const selectedSize = this.filteredItems
			.filter(item => this.selectedItems.has(item.path))
			.reduce((sum, item) => sum + item.size, 0);
		
		// 更新左侧数量信息
		const countText = this.contentEl.querySelector('[data-count-text]');
		if (countText) {
			countText.textContent = `总共 ${this.filteredItems.length} 张，已选中 ${this.selectedItems.size} 张`;
		}
		
		// 更新右侧大小信息
		const sizeText = this.contentEl.querySelector('[data-size-text]');
		if (sizeText) {
			sizeText.textContent = `总大小 ${this.trashManager.formatFileSize(totalSize)}，选中大小 ${this.trashManager.formatFileSize(selectedSize)}`;
		}
	}

	/**
	 * 全选
	 */
	private selectAll() {
		const isSelectAll = this.selectedItems.size === this.filteredItems.length;
		
		if (isSelectAll) {
			// 全不选
			this.selectedItems.clear();
			// 更新所有卡片的选中状态
			this.filteredItems.forEach(item => {
				const card = this.cardElements.get(item.path);
				if (card) {
					this.updateCardSelection(card, item.path);
				}
			});
		} else {
			// 全选
			this.filteredItems.forEach(item => {
				this.selectedItems.add(item.path);
				// 更新卡片的选中状态
				const card = this.cardElements.get(item.path);
				if (card) {
					this.updateCardSelection(card, item.path);
				}
			});
		}
		
		// 更新全选按钮文本
		this.updateSelectAllButton();
	}

	/**
	 * 恢复单个文件
	 */
	private async restoreItem(item: TrashItem) {
		const confirmed = await ConfirmModal.show(
			this.app,
			'确认恢复',
			`确定要恢复 "${item.originalName}" 吗？`,
			['恢复', '取消']
		);

		if (confirmed === 'save') {
			const success = await this.trashManager.restoreFile(item);
			if (success) {
				new Notice(`已恢复: ${item.originalName}`);
				// 从选中列表中移除
				this.selectedItems.delete(item.path);
				// 重新加载数据
				await this.loadTrashItems();
			} else {
				new Notice(`恢复失败: ${item.originalName}`);
			}
		}
	}

	/**
	 * 恢复选中的文件
	 */
	private async restoreSelected() {
		const selectedItems = this.filteredItems.filter(item => 
			this.selectedItems.has(item.path)
		);

		if (selectedItems.length === 0) {
			new Notice('请先选择要恢复的文件');
			return;
		}

		const confirmed = await ConfirmModal.show(
			this.app,
			'确认恢复',
			`确定要恢复 ${selectedItems.length} 个文件吗？`,
			['恢复', '取消']
		);

		if (confirmed === 'save') {
			let successCount = 0;
			let failCount = 0;

			for (const item of selectedItems) {
				const success = await this.trashManager.restoreFile(item);
				if (success) {
					successCount++;
				} else {
					failCount++;
				}
			}

			if (successCount > 0) {
				new Notice(`已恢复 ${successCount} 个文件${failCount > 0 ? `，${failCount} 个失败` : ''}`);
			} else {
				new Notice(`恢复失败：所有文件都未能恢复`);
			}
			// 清空选中列表
			this.selectedItems.clear();
			// 重新加载数据
			await this.loadTrashItems();
		}
	}

	/**
	 * 永久删除单个文件
	 */
	private async deleteItem(item: TrashItem) {
		const confirmed = await ConfirmModal.show(
			this.app,
			'确认删除',
			`确定要永久删除 "${item.originalName}" 吗？\n此操作不可撤销。`,
			['删除', '取消']
		);

		if (confirmed === 'save') {
			const success = await this.trashManager.permanentlyDelete(item);
			if (success) {
				new Notice(`已永久删除: ${item.originalName}`);
				// 从选中列表中移除
				this.selectedItems.delete(item.path);
				// 重新加载数据
				await this.loadTrashItems();
			} else {
				new Notice(`删除失败: ${item.originalName}`);
			}
		}
	}

	/**
	 * 永久删除选中的文件
	 */
	private async deleteSelected() {
		const selectedItems = this.filteredItems.filter(item => 
			this.selectedItems.has(item.path)
		);

		if (selectedItems.length === 0) {
			new Notice('请先选择要删除的文件');
			return;
		}

		const confirmed = await ConfirmModal.show(
			this.app,
			'确认删除',
			`确定要永久删除 ${selectedItems.length} 个文件吗？\n此操作不可撤销。`,
			['删除', '取消']
		);

		if (confirmed === 'save') {
			let successCount = 0;
			let failCount = 0;

			for (const item of selectedItems) {
				const success = await this.trashManager.permanentlyDelete(item);
				if (success) {
					successCount++;
				} else {
					failCount++;
				}
			}

			if (successCount > 0) {
				new Notice(`已永久删除 ${successCount} 个文件${failCount > 0 ? `，${failCount} 个失败` : ''}`);
			}
			// 清空选中列表
			this.selectedItems.clear();
			// 重新加载数据
			await this.loadTrashItems();
		}
	}

	/**
	 * 打开图片详情（双击时显示）
	 */
	private async openImageDetail(item: TrashItem) {
		try {
			// 检查文件是否存在
			const fileExists = await this.app.vault.adapter.exists(item.path);
			if (!fileExists) {
				new Notice('文件不存在或已被删除');
				return;
			}
			
			// 读取文件获取详细信息
			const stat = await this.app.vault.adapter.stat(item.path);
			
			// 确保所有字符串字段都有有效值
			const safePath = item.path || '';
			const safeName = item.originalName || item.originalFullPath?.split('/').pop() || 'unknown';
			
			// 从插件缓存中读取 MD5 哈希值（文件删除前已计算过）
			let md5Hash = '';
			if (this.plugin.data?.hashCache) {
				// 尝试多种方式查找哈希缓存
				const cacheKey1 = item.originalName;
				const cacheKey2 = item.originalFullPath;
				const cacheKey3 = safeName;
				
				// hashCache 中的值是对象 { hash, mtime, size }，需要提取 hash 字段
				const cache1 = this.plugin.data.hashCache[cacheKey1];
				const cache2 = this.plugin.data.hashCache[cacheKey2];
				const cache3 = this.plugin.data.hashCache[cacheKey3];
				
				md5Hash = (typeof cache1 === 'object' ? cache1?.hash : cache1) 
					|| (typeof cache2 === 'object' ? cache2?.hash : cache2)
					|| (typeof cache3 === 'object' ? cache3?.hash : cache3)
					|| '';
			}
			
			// 总是尝试实时计算（确保回收站文件有 MD5）
			if (!md5Hash) {
				try {
					const arrayBuffer = await this.app.vault.adapter.readBinary(item.path);
					md5Hash = calculateBufferHash(arrayBuffer);
					
					// 保存到插件缓存中，使用原始文件名作为键
					if (md5Hash && this.plugin.data && item.originalName) {
						// 初始化 hashCache 如果不存在
						if (!this.plugin.data.hashCache) {
							this.plugin.data.hashCache = {};
						}
						
						// hashCache 存储对象格式 { hash, mtime, size }
						this.plugin.data.hashCache[item.originalName] = {
							hash: md5Hash,
							mtime: Date.now(),
							size: item.size || 0
						};
						await this.plugin.saveData(this.plugin.data);
					}
				} catch (error) {
					console.error('Failed to calculate MD5 for trash file:', error);
					md5Hash = ''; // 明确设置为空字符串
				}
			}
			
			// 将 TrashItem 转换为 ImageInfo 格式
			const imageInfo: ImageInfo = {
				path: safePath,
				name: safeName,
				size: stat?.size || item.size || 0,
				width: 0,
				height: 0,
				modified: stat?.mtime || item.deletedAt || Date.now(),
				mtime: stat?.mtime || item.deletedAt || Date.now(),
				md5: md5Hash,
				group: ''
			};
			
			// 将所有回收站图片转换为 ImageInfo 数组（用于滚轮模式切换）
			const allImages: ImageInfo[] = this.filteredItems.map(trashItem => {
				// 尝试从缓存中读取 MD5
				let cachedMd5 = '';
				if (this.plugin.data?.hashCache) {
					const cache1 = this.plugin.data.hashCache[trashItem.originalName];
					const cache2 = this.plugin.data.hashCache[trashItem.originalFullPath];
					cachedMd5 = (typeof cache1 === 'object' ? cache1?.hash : cache1) 
						|| (typeof cache2 === 'object' ? cache2?.hash : cache2)
						|| '';
				}
				
				return {
					path: trashItem.path || '',
					name: trashItem.originalName || trashItem.originalFullPath?.split('/').pop() || 'unknown',
					size: trashItem.size || 0,
					width: 0,
					height: 0,
					modified: trashItem.deletedAt || Date.now(),
					mtime: trashItem.deletedAt || Date.now(),
					md5: cachedMd5, // 从缓存读取 MD5
					group: ''
				};
			});
			
			// 找到当前图片在数组中的索引
			const currentIndex = this.filteredItems.findIndex(t => t.path === item.path);
			
			// 打开详情模态框，标记为回收站文件
			const detailModal = new ImageDetailModal(
				this.app,
				imageInfo,
				this.app.vault,
				allImages,
				currentIndex >= 0 ? currentIndex : 0,
				this.plugin,
				true // isTrashFile = true，表示这是回收站文件
			);
			detailModal.open();
		} catch (error) {
			console.error('Failed to open image detail:', error);
			new Notice('无法打开图片详情');
		}
	}

	/**
	 * 清空回收站
	 */
	private async emptyTrash() {
		const confirmed = await ConfirmModal.show(
			this.app,
			'确认清空',
			`确定要清空回收站吗？\n此操作不可撤销，所有文件将被永久删除。`,
			['清空', '取消']
		);

		if (confirmed === 'save') {
			const deletedCount = await this.trashManager.emptyTrash();
			if (deletedCount > 0) {
				new Notice(`已清空回收站，删除了 ${deletedCount} 个文件`);
			} else {
				new Notice('回收站已经是空的');
			}
			// 清空选中列表
			this.selectedItems.clear();
			// 重新加载数据
			await this.loadTrashItems();
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
			'.trash-item-card',
			(selectedItems: HTMLElement[]) => {
				// 更新选中状态
				this.selectedItems.clear();
				selectedItems.forEach(item => {
					// 从卡片中获取对应的项目路径
					for (const [path, card] of this.cardElements.entries()) {
						if (card === item) {
							this.selectedItems.add(path);
							break;
						}
					}
				});
				
				// 更新统计信息和按钮
				this.updateSelectAllButton();
				this.updateStats();
			}
		);
	}

	/**
	 * 清理资源
	 */
	onClose() {
		// 清理拖拽框选管理器
		if (this.dragSelectManager) {
			this.dragSelectManager.cleanup();
			this.dragSelectManager = null;
		}
	}
}
