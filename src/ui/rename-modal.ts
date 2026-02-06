/**
 * 批量重命名模态框模块
 * 
 * 提供批量重命名图片的用户界面。
 * 支持使用占位符自定义命名格式。
 */

import { App, Modal, Setting, Notice } from 'obsidian';
import { makeModalResizable } from '../utils/resizable-modal';
import { PathValidator } from '../utils/path-validator';

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
					// 验证输入模式
					const trimmedPattern = this.renamePattern.trim();
					if (!trimmedPattern) {
						new Notice('❌ 命名格式不能为空');
						return;
					}
					
					// 验证模式中不包含危险字符（在替换占位符后）
					// 使用示例文件名进行验证
					const testName = trimmedPattern
						.replace('{index}', '001')
						.replace('{name}', 'test');
					
					// 检查是否包含路径分隔符（不允许）
					if (testName.includes('/') || testName.includes('\\')) {
						new Notice('❌ 命名格式不能包含路径分隔符');
						return;
					}
					
					// 验证生成的文件名是否合法
					const testFileName = testName + '.png';
					if (!PathValidator.isValidFileName(testFileName)) {
						new Notice('❌ 命名格式生成的文件名包含非法字符');
						return;
					}
					
					this.onSubmit(trimmedPattern);
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

