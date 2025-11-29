import { Modal } from 'obsidian';
import { makeModalResizable } from '../utils/resizable-modal';

/**
 * 确认对话框的结果类型
 * - 'save': 用户点击保存/确定按钮
 * - 'discard': 用户点击放弃/取消按钮
 * - 'cancel': 用户关闭对话框或按 ESC
 */
export type ConfirmResult = 'save' | 'discard' | 'cancel';

/**
 * 确认对话框类
 * 
 * 用于显示确认对话框，支持：
 * - 单按钮模式（仅确定）
 * - 双按钮模式（保存/放弃）
 * - 自定义按钮文本
 * - Promise 风格的异步调用
 * 
 * 使用示例：
 * ```typescript
 * const result = await new ConfirmModal(
 *   app,
 *   '确认删除',
 *   '确定要删除这张图片吗？',
 *   ['删除', '取消']
 * ).show();
 * ```
 */
export class ConfirmModal extends Modal {
	/** Promise resolve 函数，用于返回用户的选择 */
	private resolve: (value: ConfirmResult) => void;
	
	constructor(app: any, title: string, message: string, options?: string[]) { // app类型由Obsidian定义
		super(app);
		this.modalEl.addClass('confirm-modal');
		
		// 禁用 ESC 键关闭和点击背景关闭
		this.shouldRestoreSelection = false;
		
		// 设置模态框层叠样式，确保背景正确显示
		if (this.modalEl.parentElement) {
			this.modalEl.parentElement.classList.add('confirm-modal-container');
		}
		
		const button1Text = options?.[0] || '确定';
		const button2Text = options?.[1];
		
		let buttonsHTML = '';
		if (button2Text) {
			// 两个按钮的情况：保存、放弃
			buttonsHTML = `
				<div class="confirm-modal-buttons">
					<button class="mod-secondary discard-btn">${button2Text}</button>
					<button class="mod-cta save-btn">${button1Text}</button>
				</div>
			`;
		} else {
			// 一个按钮的情况
			buttonsHTML = `
				<div class="confirm-modal-buttons">
					<button class="mod-cta confirm-btn">${button1Text}</button>
				</div>
			`;
		}
		
		this.contentEl.innerHTML = `
			<h2 class="confirm-modal-title">${title}</h2>
			<div class="confirm-modal-message">${message}</div>
			${buttonsHTML}
		`;
		
		this.resolve = () => {};
	}
	
	onOpen() {
		// 启用模态框可调整大小
		makeModalResizable(this.modalEl, {
			minWidth: 350,
			minHeight: 200,
		});

		// 恢复关闭按钮功能（右上角X）
		const closeBtn = this.modalEl.querySelector('.modal-close-button') as HTMLElement;
		if (closeBtn) {
			closeBtn.addEventListener('click', () => {
				this.resolve('cancel');
				this.close();
			});
		}
		
		const confirmBtn = this.contentEl.querySelector('.confirm-btn');
		const saveBtn = this.contentEl.querySelector('.save-btn');
		const discardBtn = this.contentEl.querySelector('.discard-btn');
		
		confirmBtn?.addEventListener('click', () => {
			this.resolve('save');
			this.close();
		});
		
		saveBtn?.addEventListener('click', () => {
			this.resolve('save');
			this.close();
		});
		
		discardBtn?.addEventListener('click', () => {
			this.resolve('discard');
			this.close();
		});
		
		// 添加键盘快捷键支持
		const keyHandler = (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				// 回车 = 确认（点击主要按钮）
				this.resolve('save');
				this.close();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				// ESC = 取消（点击次要按钮或关闭）
				this.resolve(discardBtn ? 'discard' : 'cancel');
				this.close();
			}
		};
		
		// 添加键盘事件监听
		this.modalEl.addEventListener('keydown', keyHandler);
		
		// 确保对话框可以接收焦点
		this.modalEl.setAttribute('tabindex', '-1');
		this.modalEl.focus();
	}
	
	async waitForResponse(): Promise<ConfirmResult> {
		return new Promise((resolve) => {
			this.resolve = resolve;
		});
	}
	
	static async show(app: any, title: string, message: string, options?: string[]): Promise<ConfirmResult> {
		const modal = new ConfirmModal(app, title, message, options);
		modal.open();
		return await modal.waitForResponse();
	}
}

