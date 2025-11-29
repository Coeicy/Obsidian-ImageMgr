import { Vault, TFile } from 'obsidian';
import { ImageInfo } from '../../types';

/**
 * 图片预览板块组件
 * 负责显示图片和锁定按钮
 */
export class ImagePreviewPanel {
	private container: HTMLElement;
	private imageElement: HTMLImageElement | null = null;
	private wheelHandler: ((e: WheelEvent) => void) | null = null;
	private dragHandler: ((e: MouseEvent) => void) | null = null;
	private dragStartHandler: ((e: MouseEvent) => void) | null = null;
	private dragEndHandler: ((e: MouseEvent) => void) | null = null;
	private isDragging: boolean = false;
	private dragStartX: number = 0;
	private dragStartY: number = 0;
	private dragStartTranslateX: number = 0;
	private dragStartTranslateY: number = 0;
	public lockBtn?: HTMLElement; // 锁定按钮引用（public以便外部控制显示/隐藏）

	constructor(
		container: HTMLElement,
		private image: ImageInfo,
		private vault: Vault,
		private isIgnored: boolean,
		private onToggleLock: () => void,
		private onWheel: (e: WheelEvent) => void,
		private onDragStart?: () => void,
		private onDragMove?: (translateX: number, translateY: number) => void,
		private onDragEnd?: () => void,
		private getTranslate?: () => { x: number; y: number },
		private getScale?: () => number,
		private isTrashFile: boolean = false,
		private onImageLoaded?: (img: HTMLImageElement) => void
	) {
		this.container = container;
		this.render();
	}

	private render() {
		this.container.empty();
		
		// 设置容器样式，确保旋转时不溢出
		this.container.style.position = 'relative';
		this.container.style.display = 'flex';
		this.container.style.alignItems = 'center';
		this.container.style.justifyContent = 'center';
		// 移除固定高度限制，由父容器控制，使用flex: 1自动填充
		this.container.style.overflow = 'auto'; // 允许滚动，特别是对于长条形图片
		this.container.style.flex = '1';
		this.container.style.minHeight = '200px';
		// 优化长条形图片的滚动体验
		this.container.style.scrollBehavior = 'smooth';

		// 锁定/解锁按钮（回收站文件不显示）
		if (!this.isTrashFile) {
			const lockBtn = this.container.createEl('button', {
				text: this.isIgnored ? '🔒' : '🔓',
				cls: 'lock-btn'
			});
			lockBtn.title = this.isIgnored ? '已锁定（点击解锁）' : '点击锁定文件';
			lockBtn.style.position = 'absolute';
			lockBtn.style.top = '8px';
			lockBtn.style.right = '8px';
			lockBtn.style.padding = '6px 8px';
			lockBtn.style.border = '1px solid var(--background-modifier-border)';
			lockBtn.style.borderRadius = '4px';
			lockBtn.style.backgroundColor = this.isIgnored ? 'rgba(255, 0, 0, 0.12)' : 'var(--background-secondary)';
			lockBtn.style.borderColor = this.isIgnored ? 'var(--text-error)' : 'var(--background-modifier-border)';
			lockBtn.style.cursor = 'pointer';
			lockBtn.style.fontSize = '16px';
			lockBtn.style.zIndex = '10';
			(lockBtn.style as any).backdropFilter = 'blur(4px)';
			lockBtn.addEventListener('click', () => this.onToggleLock());
			// 保存锁定按钮引用，以便外部控制显示/隐藏
			this.lockBtn = lockBtn;
		}

		// 加载图片
		if (this.isTrashFile) {
			// 回收站文件：使用 adapter 直接读取
			(async () => {
				try {
					const arrayBuffer = await this.vault.adapter.readBinary(this.image.path);
					const blob = new Blob([arrayBuffer]);
					const imageUrl = URL.createObjectURL(blob);
					
					const imgEl = this.container.createEl('img', {
						attr: { src: imageUrl }
					});
					imgEl.classList.add('detail-image');
					this.imageElement = imgEl;
					
					// 添加滚轮事件处理
					this.wheelHandler = (e: WheelEvent) => {
						e.preventDefault();
						this.onWheel(e);
					};
					imgEl.addEventListener('wheel', this.wheelHandler);

					// 添加拖拽事件处理
					this.setupDragHandlers(imgEl);
					
					// 通知外部图片已加载
					if (this.onImageLoaded) {
						this.onImageLoaded(imgEl);
					}
				} catch (error) {
					console.error('Failed to load trash image:', this.image.path, error);
					// 显示错误占位符
					const placeholder = this.container.createDiv();
					placeholder.style.cssText = 'text-align: center; font-size: 48px; opacity: 0.5; color: var(--text-muted);';
					placeholder.innerHTML = '📷<br><span style="font-size: 12px;">加载失败</span>';
				}
			})();
		} else {
			// 普通文件：使用 vault.getResourcePath
			const imgFile = this.vault.getAbstractFileByPath(this.image.path) as TFile;
			if (imgFile) {
				const imageUrl = this.vault.getResourcePath(imgFile);
				if (imageUrl) {
					const imgEl = this.container.createEl('img', {
						attr: { src: imageUrl }
					});
					imgEl.classList.add('detail-image');
					this.imageElement = imgEl;
					
					// 添加滚轮事件处理
					this.wheelHandler = (e: WheelEvent) => {
						e.preventDefault();
						this.onWheel(e);
					};
					imgEl.addEventListener('wheel', this.wheelHandler);

					// 添加拖拽事件处理
					this.setupDragHandlers(imgEl);
				}
			}
		}
	}

	/**
	 * 设置拖拽事件处理器
	 */
	private setupDragHandlers(imgEl: HTMLImageElement) {
		// 鼠标按下开始拖拽
		this.dragStartHandler = (e: MouseEvent) => {
			// 只在鼠标左键按下时开始拖拽
			if (e.button !== 0) return;
			
			// 如果正在缩放（scale > 1）或旋转后，才允许拖拽
			const scale = this.getScale ? this.getScale() : 1;
			if (scale <= 1) return;

			this.isDragging = true;
			this.dragStartX = e.clientX;
			this.dragStartY = e.clientY;
			
			const translate = this.getTranslate ? this.getTranslate() : { x: 0, y: 0 };
			this.dragStartTranslateX = translate.x;
			this.dragStartTranslateY = translate.y;

			// 改变鼠标样式
			imgEl.style.cursor = 'grabbing';
			document.body.style.cursor = 'grabbing';
			document.body.style.userSelect = 'none'; // 防止拖拽时选中文本

			// 通知外部开始拖拽
			if (this.onDragStart) {
				this.onDragStart();
			}

			// 添加全局事件监听
			this.dragHandler = (e: MouseEvent) => {
				if (!this.isDragging) return;
				e.preventDefault();
				e.stopPropagation(); // 阻止事件冒泡

				const deltaX = e.clientX - this.dragStartX;
				const deltaY = e.clientY - this.dragStartY;

				const newTranslateX = this.dragStartTranslateX + deltaX;
				const newTranslateY = this.dragStartTranslateY + deltaY;

				// 通知外部更新位置
				if (this.onDragMove) {
					this.onDragMove(newTranslateX, newTranslateY);
				}

			};

			const dragEndHandler = (e: MouseEvent) => {
				if (!this.isDragging) return;

				this.isDragging = false;
				imgEl.style.cursor = 'grab';
				document.body.style.cursor = '';
				document.body.style.userSelect = '';

				// 通知外部结束拖拽
				if (this.onDragEnd) {
					this.onDragEnd();
				}

				// 移除全局事件监听
				if (this.dragHandler) {
					document.removeEventListener('mousemove', this.dragHandler);
					document.removeEventListener('mouseup', dragEndHandler);
					this.dragHandler = null;
				}
			};

			this.dragEndHandler = dragEndHandler;
			document.addEventListener('mousemove', this.dragHandler);
			document.addEventListener('mouseup', dragEndHandler);
		};

		imgEl.addEventListener('mousedown', this.dragStartHandler);

		// 鼠标悬停时显示抓取图标
		imgEl.addEventListener('mouseenter', () => {
			const scale = this.getScale ? this.getScale() : 1;
			if (scale > 1 && !this.isDragging) {
				imgEl.style.cursor = 'grab';
			}
		});

		imgEl.addEventListener('mouseleave', () => {
			if (!this.isDragging) {
				imgEl.style.cursor = '';
			}
		});
	}


	/**
	 * 获取图片元素
	 */
	getImageElement(): HTMLImageElement | null {
		return this.imageElement;
	}

	/**
	 * 更新图片
	 */
	updateImage(image: ImageInfo, isIgnored: boolean) {
		this.image = image;
		this.isIgnored = isIgnored;
		// 更新锁定按钮显示而不重建DOM，避免闪烁
		if (this.lockBtn) {
			this.lockBtn.textContent = this.isIgnored ? '🔒' : '🔓';
			this.lockBtn.title = this.isIgnored ? '已锁定（点击解锁）' : '点击锁定文件';
		}

		// 预加载新图片，加载完成后再切换，避免闪烁
		if (this.isTrashFile) {
			// 回收站文件：使用 adapter 加载
			(async () => {
				try {
					const arrayBuffer = await this.vault.adapter.readBinary(this.image.path);
					const blob = new Blob([arrayBuffer]);
					const imageUrl = URL.createObjectURL(blob);
					
					if (this.imageElement) {
						const preloader = new Image();
						preloader.onload = () => {
							this.imageElement!.src = imageUrl;
							// 通知外部图片已更新
							if (this.onImageLoaded && this.imageElement) {
								this.onImageLoaded(this.imageElement);
							}
						};
						preloader.src = imageUrl;
					} else {
						const preloader = new Image();
						preloader.onload = () => {
							const imgEl = this.container.createEl('img', { attr: { src: imageUrl } });
							imgEl.classList.add('detail-image');
							this.imageElement = imgEl;
							this.wheelHandler = (e: WheelEvent) => { e.preventDefault(); this.onWheel(e); };
							imgEl.addEventListener('wheel', this.wheelHandler);
							this.setupDragHandlers(imgEl);
							// 通知外部图片已加载
							if (this.onImageLoaded) {
								this.onImageLoaded(imgEl);
							}
						};
						preloader.src = imageUrl;
					}
				} catch (error) {
					console.error('Failed to update trash image:', this.image.path, error);
				}
			})();
		} else {
			// 普通文件：使用 vault.getResourcePath
			const imgFile = this.vault.getAbstractFileByPath(this.image.path) as TFile;
			if (imgFile) {
				const imageUrl = this.vault.getResourcePath(imgFile);
				if (imageUrl) {
					// 如果已有图片元素，则预加载后再切换src
					if (this.imageElement) {
						const preloader = new Image();
						preloader.onload = () => {
							// 切换到新图片源（已在缓存中），避免白屏闪烁
							this.imageElement!.src = imageUrl;
						};
						preloader.src = imageUrl;
					} else {
						// 首次无元素时，按初始渲染逻辑创建，但等加载后再显示
						const preloader = new Image();
						preloader.onload = () => {
							const imgEl = this.container.createEl('img', { attr: { src: imageUrl } });
							imgEl.classList.add('detail-image');
							this.imageElement = imgEl;
							// 绑定事件处理
							this.wheelHandler = (e: WheelEvent) => { e.preventDefault(); this.onWheel(e); };
							imgEl.addEventListener('wheel', this.wheelHandler);
							this.setupDragHandlers(imgEl);
						};
						preloader.src = imageUrl;
					}
				}
			}
		}
	}

	/**
	 * 更新滚轮模式
	 */
	updateWheelMode(isScrollMode: boolean) {
		// 滚轮模式由外部控制，这里不需要特殊处理
	}

	/**
	 * 清理资源
	 */
	cleanup() {
		if (this.imageElement) {
			if (this.wheelHandler) {
				this.imageElement.removeEventListener('wheel', this.wheelHandler);
			}
			if (this.dragStartHandler) {
				this.imageElement.removeEventListener('mousedown', this.dragStartHandler);
			}
		}
		if (this.dragHandler) {
			document.removeEventListener('mousemove', this.dragHandler);
			document.removeEventListener('mouseup', this.dragHandler);
		}
		this.wheelHandler = null;
		this.dragHandler = null;
		this.dragStartHandler = null;
		this.dragEndHandler = null;
	}
}

