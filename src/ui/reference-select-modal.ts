import { Modal, TFile } from 'obsidian';
import { makeModalResizable } from '../utils/resizable-modal';

export interface ReferenceOption {
	file: TFile;
	index: number;
	displayText: string;
}

export class ReferenceSelectModal extends Modal {
	private resolve: (value: TFile | null) => void;
	private references: ReferenceOption[];

	constructor(app: any, references: ReferenceOption[]) { // app类型由Obsidian定义
		super(app);
		this.references = references;
		this.modalEl.addClass('reference-select-modal');
		this.shouldRestoreSelection = false;
		
		if (this.modalEl.parentElement) {
			this.modalEl.parentElement.classList.add('reference-select-modal-container');
		}
		
		this.resolve = () => {};
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		// 启用模态框可调整大小
		makeModalResizable(this.modalEl, {
			minWidth: 400,
			minHeight: 300,
		});
		
		// 标题
		const title = contentEl.createEl('h2', { 
			text: '选择引用笔记',
			cls: 'reference-select-title'
		});
		
		// 说明
		const message = contentEl.createDiv({ cls: 'reference-select-message' });
		message.createSpan({ 
			text: `该图片被 ${this.references.length} 个笔记引用，请选择用于生成文件名的笔记：` 
		});
		
		// 引用列表
		const listContainer = contentEl.createDiv({ cls: 'reference-select-list' });
		
		let selectedIndex = 0;
		
		this.references.forEach((ref, index) => {
			const item = listContainer.createDiv({ cls: 'reference-select-item' });
			
			if (index === 0) {
				item.classList.add('selected');
			}
			
			// 文件名
			const fileName = item.createDiv({ cls: 'reference-file-name' });
			fileName.textContent = ref.file.basename;
			
			// 路径信息
			const pathInfo = item.createDiv({ cls: 'reference-path-info' });
			const pathParts = ref.file.path.split('/').filter(p => p);
			const dirPath = pathParts.slice(0, -1).join('/') || '根目录';
			pathInfo.textContent = `📁 ${dirPath} • 第${ref.index + 1}张图片`;
			
			// 修改时间
			if (ref.file.stat?.mtime) {
				const timeInfo = item.createDiv({ cls: 'reference-time-info' });
				const mtime = new Date(ref.file.stat.mtime);
				timeInfo.textContent = `修改于: ${mtime.toLocaleString('zh-CN')}`;
			}
			
			// 点击选择
			item.addEventListener('click', () => {
				// 移除所有选中状态
				listContainer.querySelectorAll('.reference-select-item').forEach(el => {
					el.classList.remove('selected');
				});
				// 添加选中状态
				item.classList.add('selected');
				selectedIndex = index;
			});
			
			// 键盘导航
			item.setAttribute('tabindex', '0');
			item.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.resolve(this.references[selectedIndex].file);
					this.close();
				} else if (e.key === 'ArrowDown' && index < this.references.length - 1) {
					e.preventDefault();
					(item.nextElementSibling as HTMLElement)?.focus();
					selectedIndex = index + 1;
					listContainer.querySelectorAll('.reference-select-item').forEach(el => {
						el.classList.remove('selected');
					});
					(item.nextElementSibling as HTMLElement)?.classList.add('selected');
				} else if (e.key === 'ArrowUp' && index > 0) {
					e.preventDefault();
					(item.previousElementSibling as HTMLElement)?.focus();
					selectedIndex = index - 1;
					listContainer.querySelectorAll('.reference-select-item').forEach(el => {
						el.classList.remove('selected');
					});
					(item.previousElementSibling as HTMLElement)?.classList.add('selected');
				}
			});
		});
		
		// 按钮区域
		const buttonsContainer = contentEl.createDiv({ cls: 'reference-select-buttons' });
		
		// 取消按钮
		const cancelBtn = buttonsContainer.createEl('button', {
			text: '取消',
			cls: 'mod-secondary cancel-btn'
		});
		cancelBtn.addEventListener('click', () => {
			this.resolve(null);
			this.close();
		});
		
		// 确定按钮
		const confirmBtn = buttonsContainer.createEl('button', {
			text: '确定',
			cls: 'mod-cta confirm-btn'
		});
		confirmBtn.addEventListener('click', () => {
			this.resolve(this.references[selectedIndex].file);
			this.close();
		});
		
		// 恢复关闭按钮功能
		const closeBtn = this.modalEl.querySelector('.modal-close-button') as HTMLElement;
		if (closeBtn) {
			closeBtn.addEventListener('click', () => {
				this.resolve(null);
				this.close();
			});
		}
		
		// 聚焦第一个选项
		const firstItem = listContainer.querySelector('.reference-select-item') as HTMLElement;
		if (firstItem) {
			firstItem.focus();
		}
	}

	async waitForResponse(): Promise<TFile | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
		});
	}

	static async show(app: any, references: ReferenceOption[]): Promise<TFile | null> {
		const modal = new ReferenceSelectModal(app, references);
		modal.open();
		return await modal.waitForResponse();
	}
}

