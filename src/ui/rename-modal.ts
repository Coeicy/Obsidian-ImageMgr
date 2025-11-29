import { App, Modal, Setting } from 'obsidian';
import { makeModalResizable } from '../utils/resizable-modal';

export class RenameModal extends Modal {
	renamePattern: string = 'image_{index}';
	onSubmit: (pattern: string) => void;

	constructor(app: App, onSubmit: (pattern: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// 启用模态框可调整大小
		makeModalResizable(this.modalEl, {
			minWidth: 400,
			minHeight: 300,
		});

		contentEl.createEl('h2', { text: '批量重命名' });

		contentEl.createDiv({ 
			text: '使用占位符: {index} = 序号, {name} = 原文件名',
			cls: 'rename-modal-hint'
		});

		new Setting(contentEl)
			.setName('命名格式')
			.setDesc('例如: image_{index} 或 {name}_副本')
			.addText(text => text
				.setPlaceholder('image_{index}')
				.setValue(this.renamePattern)
				.onChange((value) => {
					this.renamePattern = value;
				}));

		new Setting(contentEl)
			.addButton(button => button
				.setButtonText('取消')
				.onClick(() => this.close()))
			.addButton(button => button
				.setButtonText('确定')
				.setCta()
				.onClick(() => {
					this.onSubmit(this.renamePattern);
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

