/**
 * 图片控制面板组件模块
 * 
 * 负责图片详情模态框中的操作按钮区域。
 */

import { ImageInfo } from '../../types';

/**
 * 图片控制面板组件
 * 
 * 功能：
 * - 缩放按钮（放大/缩小）
 * - 旋转按钮（顺时针/逆时针）
 * - 滚轮模式切换（缩放/切换图片）
 * - 查看模式切换（适应窗口/原始尺寸）
 * - 前后导航按钮
 * - 删除按钮
 */
export class ImageControlsPanel {
	private container: HTMLElement;
	private controlsContainer: HTMLElement;
	private row: HTMLElement;
	private deleteBtn?: HTMLElement;

	constructor(
		container: HTMLElement,
		private allImages: ImageInfo[],
		private isScrollMode: boolean,
		private viewMode: 'fit' | '1:1',
		private onZoomIn: () => void,
		private onZoomOut: () => void,
		private onRotateLeft: () => void,
		private onRotateRight: () => void,
		private onToggleScrollMode: () => void,
		private onCycleViewMode: () => void,
		private onShowPrevious: () => void,
		private onShowNext: () => void,
		private onDelete: () => void,
		private onUpdateScrollModeIndicator?: () => void,
		private onUpdateViewMode?: () => void,
		private isTrashFile: boolean = false
	) {
		this.container = container;
		this.render();
	}

	private render() {
		this.container.empty();
		
		// 操作按钮容器
		this.controlsContainer = this.container.createDiv('image-controls-container');
		this.controlsContainer.style.cssText = `
			background: var(--background-secondary);
			border-radius: 8px;
			padding: 12px;
			margin-top: 12px;
		`;

		// 图片操作控制
		const imageControls = this.controlsContainer.createDiv('image-controls');
		
		// 所有按钮放在一排
		this.row = imageControls.createDiv('control-row');
		this.row.style.cssText = `
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
			justify-content: center;
		`;

		this.createButtons();
		this.updateIndicators();
	}

	private createButtons() {
		// 1. 放大按钮
		const zoomInBtn = this.row.createEl('button', { 
			text: '+',
			cls: 'control-btn'
		});
		zoomInBtn.title = '放大';
		zoomInBtn.addEventListener('click', () => this.onZoomIn());

		// 2. 缩小按钮
		const zoomOutBtn = this.row.createEl('button', { 
			text: '−',
			cls: 'control-btn'
		});
		zoomOutBtn.title = '缩小';
		zoomOutBtn.addEventListener('click', () => this.onZoomOut());

		// 3. 逆时针旋转按钮
		const rotateLeftBtn = this.row.createEl('button', { 
			text: '↺',
			cls: 'control-btn'
		});
		rotateLeftBtn.title = '预览：逆时针旋转90°';
		rotateLeftBtn.addEventListener('click', () => this.onRotateLeft());

		// 4. 顺时针旋转按钮
		const rotateRightBtn = this.row.createEl('button', { 
			text: '↻',
			cls: 'control-btn'
		});
		rotateRightBtn.title = '预览：顺时针旋转90°';
		rotateRightBtn.addEventListener('click', () => this.onRotateRight());

		// 5. 滚轮模式按钮
		const scrollModeBtn = this.row.createEl('button', { 
			cls: 'control-btn scroll-mode-btn'
		});
		const scrollModeContent = scrollModeBtn.createSpan('scroll-mode-content');
		const scrollModeIcon = scrollModeContent.createSpan('scroll-mode-icon');
		scrollModeIcon.textContent = '🖱️';
		
		scrollModeBtn.addEventListener('click', () => this.onToggleScrollMode());

		// 6. 查看模式切换按钮（适应窗口 <-> 1:1 切换）
		const viewModeBtn = this.row.createEl('button', { 
			text: '⛶',
			cls: 'control-btn view-mode-btn'
		});
		viewModeBtn.title = '切换查看模式（适应窗口 <-> 1:1）';
		viewModeBtn.addEventListener('click', () => this.onCycleViewMode());

		// 7. 左右切换按钮
		if (this.allImages.length > 1) {
			const prevBtn = this.row.createEl('button', { 
				text: '◀',
				cls: 'control-btn'
			});
			prevBtn.title = '上一张';
			prevBtn.addEventListener('click', () => this.onShowPrevious());
			
			const nextBtn = this.row.createEl('button', { 
				text: '▶',
				cls: 'control-btn'
			});
			nextBtn.title = '下一张';
			nextBtn.addEventListener('click', () => this.onShowNext());
		}

		// 8. 删除按钮（回收站文件不创建）
		if (!this.isTrashFile) {
			this.deleteBtn = this.row.createEl('button', { 
				text: '🗑️',
				cls: 'control-btn delete-btn'
			});
			this.deleteBtn.title = '删除图片';
			this.deleteBtn.addEventListener('click', () => this.onDelete());
		}
	}

	/**
	 * 更新指示器
	 */
	updateIndicators() {
		if (this.onUpdateScrollModeIndicator) {
			this.onUpdateScrollModeIndicator();
		}
		if (this.onUpdateViewMode) {
			this.onUpdateViewMode();
		}
	}

	/**
	 * 更新滚轮模式
	 */
	updateScrollMode(isScrollMode: boolean) {
		this.isScrollMode = isScrollMode;
		this.updateIndicators();
	}

	/**
	 * 更新查看模式
	 */
	updateViewMode(viewMode: 'fit' | '1:1') {
		this.viewMode = viewMode;
		this.updateIndicators();
	}

	/**
	 * 静默更新查看模式（不触发回调，避免循环调用）
	 */
	setViewMode(viewMode: 'fit' | '1:1') {
		this.viewMode = viewMode;
		// 不调用 updateIndicators，因为显示状态会通过其他方式更新
	}
}

