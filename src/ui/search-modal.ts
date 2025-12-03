/**
 * 搜索模态框模块
 * 
 * 提供图片搜索功能的用户界面。
 */

import { App, Modal, Setting } from 'obsidian';
import { makeModalResizable } from '../utils/resizable-modal';

/**
 * 搜索模态框类
 * 
 * 功能：
 * - 输入搜索关键词（支持文件名和 MD5 哈希值）
 * - 实时搜索反馈
 * - 清除搜索条件
 * - 键盘快捷键支持（Enter 确认、Escape 取消、Delete 清除）
 * 
 * 使用方式：
 * ```typescript
 * const modal = new SearchModal(
 *   app,
 *   currentQuery,
 *   (query) => { console.log('搜索:', query); },
 *   () => { console.log('清除搜索'); }
 * );
 * modal.open();
 * ```
 */
export class SearchModal extends Modal {
	/** 当前搜索关键词 */
	searchQuery: string = '';
	/** 搜索提交回调函数 */
	onSubmit: (query: string) => void;
	/** 清除搜索回调函数（可选） */
	onClear?: () => void;

	/**
	 * 创建搜索模态框实例
	 * @param app - Obsidian App 实例
	 * @param currentQuery - 当前的搜索关键词
	 * @param onSubmit - 搜索提交时的回调函数
	 * @param onClear - 清除搜索时的回调函数（可选）
	 */
	constructor(app: App, currentQuery: string, onSubmit: (query: string) => void, onClear?: () => void) {
		super(app);
		this.searchQuery = currentQuery;
		this.onSubmit = onSubmit;
		this.onClear = onClear;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// 启用模态框可调整大小
		makeModalResizable(this.modalEl, {
			minWidth: 400,
			minHeight: 300,
		});

		contentEl.createEl('h2', { text: '搜索图片' });

		// 创建输入框容器
		const inputContainer = contentEl.createDiv();
		inputContainer.style.marginBottom = '16px';
		inputContainer.style.display = 'flex';
		inputContainer.style.alignItems = 'center';
		inputContainer.style.gap = '8px';
		
		// 添加搜索图标
		const iconSpan = inputContainer.createSpan({ text: '🔍' });
		iconSpan.style.fontSize = '1.2em';
		iconSpan.style.flexShrink = '0';
		
		// 创建输入框包装器，使其占满剩余空间
		const inputWrapper = inputContainer.createDiv();
		inputWrapper.style.flex = '1';
		inputWrapper.style.borderBottom = '1px solid #999';
		
		const inputEl = inputWrapper.createEl('input');
		inputEl.type = 'text';
		inputEl.placeholder = '输入文件名或MD5哈希值...';
		inputEl.value = this.searchQuery;
		
		// 自定义输入框样式：只显示下边框
		inputEl.style.cssText = `
			width: 100%;
			border: none;
			padding: 8px 0;
			font-size: 1em;
			background: transparent;
			outline: none;
			border-radius: 0;
			font-family: inherit;
			color: inherit;
		`;
		
		// 输入时也只显示下边框
		inputEl.addEventListener('focus', () => {
			inputEl.style.borderBottom = '1px solid #999';
			inputEl.style.boxShadow = 'none';
		});
		
		inputEl.addEventListener('change', (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
		});
		
		inputEl.addEventListener('input', (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
		});

		// 回车键确认搜索
		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.onSubmit(this.searchQuery);
				this.close();
			}
			// Escape 键取消
			if (e.key === 'Escape') {
				e.preventDefault();
				this.close();
			}
		});

		const hintDiv = contentEl.createDiv({ 
			cls: 'search-modal-hint'
		});
		hintDiv.style.cssText = `
			margin-top: 16px;
			padding: 10px 12px;
			background: var(--background-secondary);
			border-radius: 6px;
			border-left: 3px solid var(--interactive-accent);
			font-size: 0.9em;
			color: var(--text-muted);
			line-height: 1.6;
		`;
		hintDiv.innerHTML = `
			<div>💡 提示：支持模糊查找，输入文件名、MD5哈希值进行搜索</div>
		`;

		// 创建按钮容器
		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.cssText = `
			display: flex;
			gap: 8px;
			justify-content: flex-end;
			margin-top: 16px;
		`;

		// 清除按钮
		const clearBtn = buttonContainer.createEl('button');
		clearBtn.textContent = '清除';
		clearBtn.style.cssText = `
			padding: 6px 12px;
			border: 1px solid var(--text-error);
			border-radius: 4px;
			background: var(--text-error);
			color: white;
			cursor: pointer;
			font-size: 0.9em;
		`;
		clearBtn.addEventListener('click', () => {
			if (this.onClear) {
				this.onClear();
				this.close();
			}
		});
		clearBtn.addEventListener('mouseenter', () => {
			clearBtn.style.opacity = '0.8';
		});
		clearBtn.addEventListener('mouseleave', () => {
			clearBtn.style.opacity = '1';
		});

		// 取消按钮
		const cancelBtn = buttonContainer.createEl('button');
		cancelBtn.textContent = '取消';
		cancelBtn.style.cssText = `
			padding: 6px 12px;
			border: 1px solid var(--background-modifier-border);
			border-radius: 4px;
			background: var(--background-secondary);
			color: var(--text-normal);
			cursor: pointer;
			font-size: 0.9em;
		`;
		cancelBtn.addEventListener('click', () => this.close());
		cancelBtn.addEventListener('mouseenter', () => {
			cancelBtn.style.background = 'var(--background-modifier-hover)';
		});
		cancelBtn.addEventListener('mouseleave', () => {
			cancelBtn.style.background = 'var(--background-secondary)';
		});

		// 搜索按钮
		const searchBtn = buttonContainer.createEl('button');
		searchBtn.textContent = '搜索';
		searchBtn.style.cssText = `
			padding: 6px 12px;
			border: 1px solid var(--interactive-accent);
			border-radius: 4px;
			background: var(--interactive-accent);
			color: var(--text-on-accent);
			cursor: pointer;
			font-size: 0.9em;
		`;
		searchBtn.addEventListener('click', () => {
			this.onSubmit(this.searchQuery);
			this.close();
		});
		searchBtn.addEventListener('mouseenter', () => {
			searchBtn.style.opacity = '0.8';
		});
		searchBtn.addEventListener('mouseleave', () => {
			searchBtn.style.opacity = '1';
		});

		// 添加快捷键处理（仅在模态框内部有效）
		const handleKeyDown = (e: KeyboardEvent) => {
			// Delete 键清除
			if (e.key === 'Delete') {
				e.preventDefault();
				e.stopPropagation();
				clearBtn.click();
			} else if (e.key === 'Escape') {
				// Escape 键取消
				e.preventDefault();
				e.stopPropagation();
				cancelBtn.click();
			} else if (e.key === 'Enter') {
				// Enter 键确定
				e.preventDefault();
				e.stopPropagation();
				searchBtn.click();
			}
		};
		contentEl.addEventListener('keydown', handleKeyDown, true);
		
		// 在模态框关闭时移除事件监听
		const originalOnClose = this.onClose.bind(this);
		this.onClose = () => {
			contentEl.removeEventListener('keydown', handleKeyDown, true);
			originalOnClose();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

