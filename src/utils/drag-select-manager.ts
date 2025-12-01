/**
 * 拖拽框选管理器
 * 
 * 提供类似文件资源管理器的拖拽框选功能，允许用户通过拖动鼠标
 * 在空白区域创建选择框来批量选择图片卡片。
 * 
 * 功能特点：
 * - 在容器空白区域拖动鼠标创建半透明选择框
 * - 实时检测与选择框相交的图片卡片并更新选中状态
 * - 自动同步复选框的选中状态
 * - 支持选择完成后的回调通知
 * - 智能过滤：不会在点击按钮、复选框或图片卡片时启动框选
 * 
 * 使用方式：
 * ```typescript
 * const dragSelect = new DragSelectManager(
 *   containerEl,
 *   '.image-card',
 *   (selectedItems) => { console.log('选中了', selectedItems.length, '项'); }
 * );
 * ```
 */
export class DragSelectManager {
	/** 是否正在进行框选操作 */
	private isSelecting: boolean = false;
	/** 标记是否真正进行了拖动（用于区分点击和拖动） */
	private hasDragged: boolean = false;
	/** 框选起始点 X 坐标（相对于视口） */
	private startX: number = 0;
	/** 框选起始点 Y 坐标（相对于视口） */
	private startY: number = 0;
	/** 选择框 DOM 元素 */
	private selectionBox: HTMLElement | null = null;
	/** 框选操作的容器元素 */
	private container: HTMLElement;
	/** 可选择项目的 CSS 选择器 */
	private itemSelector: string;
	/** 选择状态变化时的回调函数 */
	private onSelectionChange: (selectedItems: HTMLElement[]) => void;

	/**
	 * 创建拖拽框选管理器实例
	 * @param container - 框选操作的容器元素
	 * @param itemSelector - 可选择项目的 CSS 选择器（如 '.image-card'）
	 * @param onSelectionChange - 选择状态变化时的回调函数
	 */
	constructor(
		container: HTMLElement,
		itemSelector: string,
		onSelectionChange: (selectedItems: HTMLElement[]) => void
	) {
		this.container = container;
		this.itemSelector = itemSelector;
		this.onSelectionChange = onSelectionChange;
		this.setupEventListeners();
	}

	/**
	 * 检查是否刚刚完成了拖动选择
	 * 
	 * 用于在 click 事件处理中判断是否应该阻止取消选中操作。
	 * 当用户完成框选后，click 事件会立即触发，此方法返回 true
	 * 可以用来避免意外取消刚刚选中的项目。
	 * 
	 * @returns 如果刚刚完成了拖动选择返回 true
	 */
	public wasJustDragging(): boolean {
		return this.hasDragged;
	}

	/**
	 * 设置事件监听器
	 * 
	 * 监听以下事件：
	 * - mousedown: 在容器上检测框选开始
	 * - mousemove: 在文档上跟踪鼠标移动（支持拖出容器）
	 * - mouseup: 在文档上检测框选结束
	 */
	private setupEventListeners() {
		this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
		document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
		document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
	}

	/**
	 * 处理鼠标按下事件
	 * 
	 * 检查点击位置是否适合启动框选：
	 * - 不在复选框、按钮、输入框上
	 * - 不在图片卡片上（点击卡片应该是选中单个）
	 * - 在容器内的空白区域
	 * 
	 * @param e - 鼠标事件对象
	 */
	private handleMouseDown(e: MouseEvent) {
		// 如果点击的是复选框或其他交互元素，不启动框选
		const target = e.target as HTMLElement;
		if (
			target.classList.contains('image-select-checkbox') ||
			target.closest('button') ||
			target.closest('input') ||
			target.closest('.toolbar-btn')
		) {
			return;
		}

		// 如果点击的是图片卡片，不启动框选
		if (target.closest(this.itemSelector)) {
			return;
		}

		// 检查是否在容器内（允许在容器空白区域启动框选）
		if (!this.container.contains(target)) {
			return;
		}

		this.isSelecting = true;
		this.hasDragged = false; // 重置拖动标记
		this.startX = e.clientX;
		this.startY = e.clientY;

		// 创建选择框
		this.selectionBox = document.createElement('div');
		this.selectionBox.className = 'drag-select-box';
		this.selectionBox.style.cssText = `
			position: fixed;
			border: 2px solid var(--interactive-accent);
			background-color: rgba(var(--accent-rgb), 0.1);
			pointer-events: none;
			z-index: 1000;
			display: none;
		`;
		document.body.appendChild(this.selectionBox);
	}

	/**
	 * 处理鼠标移动事件
	 * 
	 * 在框选过程中：
	 * 1. 计算选择框的位置和大小
	 * 2. 只有移动距离超过 5px 才显示选择框（避免误触）
	 * 3. 实时更新与选择框相交的项目的选中状态
	 * 
	 * @param e - 鼠标事件对象
	 */
	private handleMouseMove(e: MouseEvent) {
		if (!this.isSelecting || !this.selectionBox) {
			return;
		}

		const currentX = e.clientX;
		const currentY = e.clientY;

		const minX = Math.min(this.startX, currentX);
		const minY = Math.min(this.startY, currentY);
		const maxX = Math.max(this.startX, currentX);
		const maxY = Math.max(this.startY, currentY);

		const width = maxX - minX;
		const height = maxY - minY;

		// 只有移动距离超过 5px 才显示选择框
		if (width > 5 || height > 5) {
			this.hasDragged = true; // 标记已经进行了拖动
			this.selectionBox.style.display = 'block';
			this.selectionBox.style.left = minX + 'px';
			this.selectionBox.style.top = minY + 'px';
			this.selectionBox.style.width = width + 'px';
			this.selectionBox.style.height = height + 'px';

			// 检测与选择框相交的图片卡片
			this.updateSelection(minX, minY, maxX, maxY);
		}
	}

	/**
	 * 处理鼠标释放事件
	 * 
	 * 完成框选操作：
	 * 1. 最终确认选择状态
	 * 2. 触发选择变化回调
	 * 3. 移除选择框 DOM 元素
	 * 4. 延迟重置 hasDragged 标记（让 click 事件能检测到）
	 * 
	 * @param e - 鼠标事件对象
	 */
	private handleMouseUp(e: MouseEvent) {
		if (!this.isSelecting) {
			return;
		}

		// 在移除选择框之前，先计算最终的选择区域并确认选择
		const hadVisibleSelectionBox = this.selectionBox && this.selectionBox.style.display === 'block';
		
		if (hadVisibleSelectionBox) {
			const currentX = e.clientX;
			const currentY = e.clientY;

			const minX = Math.min(this.startX, currentX);
			const minY = Math.min(this.startY, currentY);
			const maxX = Math.max(this.startX, currentX);
			const maxY = Math.max(this.startY, currentY);

			// 最终确认选择状态
			this.finalizeSelection(minX, minY, maxX, maxY);
		}

		this.isSelecting = false;

		// 如果进行了拖动选择，触发回调并延迟重置标记
		if (this.hasDragged) {
			const items = this.container.querySelectorAll(this.itemSelector) as NodeListOf<HTMLElement>;
			const selectedItems = Array.from(items).filter((item) =>
				item.classList.contains('selected')
			);
			this.onSelectionChange(selectedItems);
			
			// 延迟重置 hasDragged，让 click 事件能检测到
			setTimeout(() => {
				this.hasDragged = false;
			}, 50);
		}

		// 移除选择框
		if (this.selectionBox) {
			this.selectionBox.remove();
			this.selectionBox = null;
		}
	}

	/**
	 * 最终确认选择状态（鼠标释放时调用）
	 * 这个方法确保选择状态被正确保留
	 */
	private finalizeSelection(minX: number, minY: number, maxX: number, maxY: number) {
		const items = this.container.querySelectorAll(this.itemSelector) as NodeListOf<HTMLElement>;
		const selectedItems: HTMLElement[] = [];

		items.forEach((item) => {
			const rect = item.getBoundingClientRect();

			// 检测是否与选择框相交
			const isIntersecting =
				rect.left < maxX &&
				rect.right > minX &&
				rect.top < maxY &&
				rect.bottom > minY;

			if (isIntersecting) {
				// 确保选中状态
				item.classList.add('selected');
				const checkbox = item.querySelector('.image-select-checkbox') as HTMLInputElement;
				if (checkbox) {
					checkbox.checked = true;
					checkbox.style.backgroundColor = 'var(--interactive-accent)';
					checkbox.style.borderColor = 'var(--interactive-accent)';
					checkbox.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3E%3Cpath fill=\'white\' d=\'M13.5 3L6 10.5 2.5 7l-1 1L6 12.5 14.5 4z\'/%3E%3C/svg%3E")';
					checkbox.style.backgroundSize = 'contain';
				}
				selectedItems.push(item);
			}
		});

		// 触发最终的选择变化回调
		this.onSelectionChange(selectedItems);
	}

	/**
	 * 更新选择状态（拖动过程中实时调用）
	 * 
	 * 遍历所有可选择项目，检测它们是否与选择框相交，
	 * 并相应地更新选中状态和复选框样式。
	 * 
	 * @param minX - 选择框左边界
	 * @param minY - 选择框上边界
	 * @param maxX - 选择框右边界
	 * @param maxY - 选择框下边界
	 */
	private updateSelection(minX: number, minY: number, maxX: number, maxY: number) {
		const items = this.container.querySelectorAll(this.itemSelector) as NodeListOf<HTMLElement>;

		items.forEach((item) => {
			const rect = item.getBoundingClientRect();

			// 检测是否与选择框相交（矩形碰撞检测）
			const isIntersecting =
				rect.left < maxX &&
				rect.right > minX &&
				rect.top < maxY &&
				rect.bottom > minY;

			if (isIntersecting) {
				item.classList.add('selected');
				// 更新复选框状态
				const checkbox = item.querySelector('.image-select-checkbox') as HTMLInputElement;
				if (checkbox && !checkbox.checked) {
					checkbox.checked = true;
					checkbox.style.backgroundColor = 'var(--interactive-accent)';
					checkbox.style.borderColor = 'var(--interactive-accent)';
					checkbox.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3E%3Cpath fill=\'white\' d=\'M13.5 3L6 10.5 2.5 7l-1 1L6 12.5 14.5 4z\'/%3E%3C/svg%3E")';
					checkbox.style.backgroundSize = 'contain';
				}
			} else {
				item.classList.remove('selected');
				// 更新复选框状态
				const checkbox = item.querySelector('.image-select-checkbox') as HTMLInputElement;
				if (checkbox && checkbox.checked) {
					checkbox.checked = false;
					checkbox.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
					checkbox.style.borderColor = 'rgba(255, 255, 255, 0.8)';
					checkbox.style.backgroundImage = 'none';
				}
			}
		});

		// 触发选择变化回调
		const selectedItems = Array.from(items).filter((item) =>
			item.classList.contains('selected')
		);
		this.onSelectionChange(selectedItems);
	}

	/**
	 * 清理事件监听器
	 */
	cleanup() {
		this.container.removeEventListener('mousedown', (e) => this.handleMouseDown(e));
		document.removeEventListener('mousemove', (e) => this.handleMouseMove(e));
		document.removeEventListener('mouseup', (e) => this.handleMouseUp(e));
	}
}
