/**
 * 批量重命名模态框模块
 * 
 * 提供批量重命名图片的用户界面。
 * 支持使用占位符自定义命名格式。
 */

import { App, Modal, Setting } from 'obsidian';
import { makeModalResizable } from '../utils/resizable-modal';

/**
 * 批量重命名模态框类
 * 
 * 功能：
 * - 自定义命名格式
 * - 支持占位符：{index}（序号）、{name}（原文件名）
 * 
 * 使用示例：
 * - `image_{index}` → image_001.png, image_002.png, ...
 * - `{name}_副本` → 原文件名_副本.png
 */
export class RenameModal extends Modal {
	/** 重命名格式模板 */
	renamePattern: string = 'image_{index}';
	/** 提交回调函数 */
	onSubmit: (pattern: string) => void;

	/**
	 * 创建批量重命名模态框
	 * @param app - Obsidian App 实例
	 * @param onSubmit - 确认时的回调函数，接收命名格式
	 */
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

