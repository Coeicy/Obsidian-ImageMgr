/**
 * 让 Obsidian 模态框支持拖动调整大小
 * 
 * 使用方法：
 * ```typescript
 * class MyModal extends Modal {
 *     onOpen() {
 *         makeModalResizable(this.modalEl);
 *     }
 * }
 * ```
 */

/** 调整大小的配置选项 */
export interface ResizableOptions {
	/** 最小宽度 (px) */
	minWidth?: number;
	/** 最小高度 (px) */
	minHeight?: number;
	/** 最大宽度 (px) */
	maxWidth?: number;
	/** 最大高度 (px) */
	maxHeight?: number;
	/** 是否启用右侧调整 */
	enableRight?: boolean;
	/** 是否启用底部调整 */
	enableBottom?: boolean;
	/** 是否启用左侧调整 */
	enableLeft?: boolean;
	/** 是否启用顶部调整 */
	enableTop?: boolean;
	/** 是否启用右下角调整 */
	enableCorner?: boolean;
	/** 是否启用拖动移动（点击标题栏拖动整个窗口） */
	enableDrag?: boolean;
}

/** 默认配置 */
const DEFAULT_OPTIONS: Required<ResizableOptions> = {
	minWidth: 400,
	minHeight: 300,
	maxWidth: window.innerWidth,
	maxHeight: window.innerHeight,
	enableRight: true,
	enableBottom: true,
	enableLeft: true,
	enableTop: false, // 顶部用于拖动移动，不用于调整大小
	enableCorner: true,
	enableDrag: true,
};

/**
 * 使模态框可调整大小
 * @param modalEl 模态框元素
 * @param options 配置选项
 */
export function makeModalResizable(
	modalEl: HTMLElement,
	options: ResizableOptions = {}
): void {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	
	// 确保模态框有定位（使用fixed以支持拖动）
	if (!modalEl.style.position || modalEl.style.position === 'static') {
		modalEl.style.position = 'fixed';
	}
	
	// 防止出现多余的滚动条
	modalEl.style.overflow = 'visible';
	
	// 启用拖动移动功能（延迟执行以确保DOM已加载）
	if (opts.enableDrag) {
		setTimeout(() => makeModalDraggable(modalEl), 0);
	}
	
	// 创建调整手柄
	if (opts.enableRight) {
		createResizeHandle(modalEl, 'right', opts);
	}
	if (opts.enableBottom) {
		createResizeHandle(modalEl, 'bottom', opts);
	}
	if (opts.enableLeft) {
		createResizeHandle(modalEl, 'left', opts);
	}
	if (opts.enableTop) {
		createResizeHandle(modalEl, 'top', opts);
	}
	if (opts.enableCorner) {
		createResizeHandle(modalEl, 'corner', opts);
	}
}

/**
 * 创建调整大小的手柄
 */
function createResizeHandle(
	modalEl: HTMLElement,
	type: 'right' | 'bottom' | 'left' | 'top' | 'corner',
	opts: Required<ResizableOptions>
): void {
	const handle = document.createElement('div');
	handle.className = `modal-resize-handle modal-resize-${type}`;
	
	// 设置手柄样式 - 完全透明，只提供交互区域
	Object.assign(handle.style, {
		position: 'absolute',
		zIndex: '1000',
		backgroundColor: 'transparent',
		pointerEvents: 'auto',
	});
	
	if (type === 'right') {
		Object.assign(handle.style, {
			top: '0',
			right: '-4px', // 向外延伸，更容易触发
			width: '8px',
			height: '100%',
			cursor: 'ew-resize',
		});
	} else if (type === 'left') {
		Object.assign(handle.style, {
			top: '0',
			left: '-4px',
			width: '8px',
			height: '100%',
			cursor: 'ew-resize',
		});
	} else if (type === 'bottom') {
		Object.assign(handle.style, {
			left: '0',
			bottom: '-4px', // 向外延伸，更容易触发
			width: '100%',
			height: '8px',
			cursor: 'ns-resize',
		});
	} else if (type === 'top') {
		Object.assign(handle.style, {
			left: '0',
			top: '-4px',
			width: '100%',
			height: '8px',
			cursor: 'ns-resize',
		});
	} else if (type === 'corner') {
		Object.assign(handle.style, {
			right: '-4px',
			bottom: '-4px',
			width: '12px',
			height: '12px',
			cursor: 'nwse-resize',
		});
	}
	
	// 添加拖动逻辑
	let isResizing = false;
	let startX = 0;
	let startY = 0;
	let startWidth = 0;
	let startHeight = 0;
	let startLeft = 0;
	let startTop = 0;
	
	handle.addEventListener('mousedown', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		
		isResizing = true;
		startX = e.clientX;
		startY = e.clientY;
		
		const rect = modalEl.getBoundingClientRect();
		startWidth = rect.width;
		startHeight = rect.height;
		startLeft = rect.left;
		startTop = rect.top;
		
		// 添加全局样式，防止选择文本
		document.body.style.cursor = handle.style.cursor;
		document.body.style.userSelect = 'none';
		
		const handleMouseMove = (e: MouseEvent) => {
			if (!isResizing) return;
			
			const deltaX = e.clientX - startX;
			const deltaY = e.clientY - startY;
			
			let newWidth = startWidth;
			let newHeight = startHeight;
			let newLeft = startLeft;
			let newTop = startTop;
			
			if (type === 'right' || type === 'corner') {
				newWidth = startWidth + deltaX;
				newWidth = Math.max(opts.minWidth, Math.min(opts.maxWidth, newWidth));
			}
			
			if (type === 'left') {
				newWidth = startWidth - deltaX;
				newWidth = Math.max(opts.minWidth, Math.min(opts.maxWidth, newWidth));
				// 只有在宽度真正改变时才调整左侧位置
				if (newWidth !== startWidth) {
					newLeft = startLeft + (startWidth - newWidth);
				}
			}
			
			if (type === 'bottom' || type === 'corner') {
				newHeight = startHeight + deltaY;
				newHeight = Math.max(opts.minHeight, Math.min(opts.maxHeight, newHeight));
			}
			
			if (type === 'top') {
				newHeight = startHeight - deltaY;
				newHeight = Math.max(opts.minHeight, Math.min(opts.maxHeight, newHeight));
				// 只有在高度真正改变时才调整顶部位置
				if (newHeight !== startHeight) {
					newTop = startTop + (startHeight - newHeight);
				}
			}
			
			modalEl.style.width = `${newWidth}px`;
			modalEl.style.height = `${newHeight}px`;
			modalEl.style.maxWidth = `${newWidth}px`;
			modalEl.style.maxHeight = `${newHeight}px`;
			
			// 调整左侧或顶部位置
			if (type === 'left') {
				modalEl.style.left = `${newLeft}px`;
			}
			if (type === 'top') {
				modalEl.style.top = `${newTop}px`;
			}
		};
		
		const handleMouseUp = () => {
			isResizing = false;
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
		
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	});
	
	modalEl.appendChild(handle);
}

/**
 * 使模态框可拖动移动（像Windows窗口一样拖动标题栏移动整个窗口）
 */
function makeModalDraggable(modalEl: HTMLElement): void {
	// 查找关闭按钮（用于确定避让区域）
	const closeButton = modalEl.querySelector('.modal-close-button') as HTMLElement;
	
	// 创建一个透明的拖动区域，覆盖模态框顶部（避开关闭按钮）
	const dragArea = document.createElement('div');
	dragArea.className = 'modal-drag-handle';
	dragArea.style.cssText = `
		position: absolute;
		top: 0;
		left: 0;
		right: ${closeButton ? '45px' : '10px'};
		height: 40px;
		cursor: move;
		z-index: 10;
		user-select: none;
		pointer-events: auto;
	`;
	
	// 将拖动区域添加到模态框中（在最前面）
	modalEl.insertBefore(dragArea, modalEl.firstChild);
	
	// 在拖动区域上启用拖动功能
	enableDragOnElement(modalEl, dragArea);
}

/**
 * 在指定元素上启用拖动功能
 */
function enableDragOnElement(modalEl: HTMLElement, dragElement: HTMLElement): void {
	let isDragging = false;
	let startX = 0;
	let startY = 0;
	let startLeft = 0;
	let startTop = 0;
	
	dragElement.addEventListener('mousedown', (e: MouseEvent) => {
		// 只响应左键
		if (e.button !== 0) return;
		
		// 如果点击的是按钮或输入框，不触发拖动
		const target = e.target as HTMLElement;
		if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
			return;
		}
		
		e.preventDefault();
		e.stopPropagation();
		
		isDragging = true;
		startX = e.clientX;
		startY = e.clientY;
		
		// 禁用文本选择
		dragElement.style.userSelect = 'none';
		
		const rect = modalEl.getBoundingClientRect();
		startLeft = rect.left;
		startTop = rect.top;
		
		// 添加全局样式
		document.body.style.cursor = 'move';
		document.body.style.userSelect = 'none';
		
		// 确保模态框使用固定定位
		if (!modalEl.style.position || modalEl.style.position === 'relative') {
			modalEl.style.position = 'fixed';
		}
		
		const handleMouseMove = (e: MouseEvent) => {
			if (!isDragging) return;
			
			const deltaX = e.clientX - startX;
			const deltaY = e.clientY - startY;
			
			let newLeft = startLeft + deltaX;
			let newTop = startTop + deltaY;
			
			// 获取模态框尺寸
			const modalRect = modalEl.getBoundingClientRect();
			
			// 限制在视口内，但允许部分拖出
			const minVisibleWidth = Math.min(200, modalRect.width * 0.3); // 至少30%或200px可见
			const minVisibleHeight = 50; // 顶部至少50px可见
			
			// 左侧限制
			const minLeft = -modalRect.width + minVisibleWidth;
			const maxLeft = window.innerWidth - minVisibleWidth;
			newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
			
			// 顶部限制（不允许拖到上方看不见）
			const maxTop = window.innerHeight - minVisibleHeight;
			newTop = Math.max(0, Math.min(newTop, maxTop));
			
			modalEl.style.left = `${newLeft}px`;
			modalEl.style.top = `${newTop}px`;
			modalEl.style.transform = 'none'; // 移除Obsidian默认的居中transform
		};
		
		const handleMouseUp = () => {
			isDragging = false;
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			dragElement.style.userSelect = '';
			
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
		
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	});
}
