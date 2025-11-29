/**
 * 拖拽框选管理器
 * 提供类似文件夹的拖拽框选功能
 */
export class DragSelectManager {
	private isSelecting: boolean = false;
	private startX: number = 0;
	private startY: number = 0;
	private selectionBox: HTMLElement | null = null;
	private container: HTMLElement;
	private itemSelector: string;
	private onSelectionChange: (selectedItems: HTMLElement[]) => void;

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

	private setupEventListeners() {
		this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
		document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
		document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
	}

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
			this.selectionBox.style.display = 'block';
			this.selectionBox.style.left = minX + 'px';
			this.selectionBox.style.top = minY + 'px';
			this.selectionBox.style.width = width + 'px';
			this.selectionBox.style.height = height + 'px';

			// 检测与选择框相交的图片卡片
			this.updateSelection(minX, minY, maxX, maxY);
		}
	}

	private handleMouseUp(e: MouseEvent) {
		if (!this.isSelecting) {
			return;
		}

		this.isSelecting = false;

		// 移除选择框
		if (this.selectionBox) {
			this.selectionBox.remove();
			this.selectionBox = null;
		}
	}

	private updateSelection(minX: number, minY: number, maxX: number, maxY: number) {
		const items = this.container.querySelectorAll(this.itemSelector) as NodeListOf<HTMLElement>;

		items.forEach((item) => {
			const rect = item.getBoundingClientRect();

			// 检测是否与选择框相交
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
