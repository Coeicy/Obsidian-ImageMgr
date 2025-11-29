import { App, Modal, Notice, TFile } from 'obsidian';
import ImageManagementPlugin from '../main';

export class BrokenLinksModal extends Modal {
	brokenLinks: Array<{filePath: string, lineNumber: number, linkText: string}>;
	plugin?: ImageManagementPlugin;

	constructor(app: App, brokenLinks: Array<{filePath: string, lineNumber: number, linkText: string}>, plugin?: ImageManagementPlugin) {
		super(app);
		this.brokenLinks = brokenLinks;
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;

		contentEl.empty();
		
		// 设置内容区域样式，使其可以滚动
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.height = '100%';
		contentEl.style.overflow = 'hidden';
		contentEl.style.padding = '20px';

		// 标题
		const title = contentEl.createEl('h2', { text: '🈳 空链接的图片链接' });
		title.style.flexShrink = '0';
		title.style.marginBottom = '16px';

		if (this.brokenLinks.length === 0) {
			contentEl.createDiv({ 
				text: '🎉 恭喜！没有找到空链接的图片', 
				attr: { style: 'text-align: center; padding: 40px; color: var(--text-muted);' }
			});
			return;
		}

		// 显示总数
		const countEl = contentEl.createEl('p', { 
			text: `共找到 ${this.brokenLinks.length} 个空链接的图片`, 
			attr: { style: 'color: var(--text-muted); margin-bottom: 16px; flex-shrink: 0;' }
		});

		// 创建列表容器
		const listContainer = contentEl.createDiv('broken-links-list');
		listContainer.style.flex = '1';
		listContainer.style.overflowY = 'auto';
		listContainer.style.overflowX = 'hidden';
		listContainer.style.border = '1px solid var(--background-modifier-border)';
		listContainer.style.borderRadius = '8px';
		listContainer.style.padding = '12px';
		listContainer.style.minHeight = '0';

		// 为每个错误链接创建条目
		for (const link of this.brokenLinks) {
			const linkItem = listContainer.createDiv('broken-link-item');
			linkItem.style.padding = '12px';
			linkItem.style.marginBottom = '8px';
			linkItem.style.backgroundColor = 'var(--background-secondary)';
			linkItem.style.borderRadius = '6px';
			linkItem.style.cursor = 'pointer';
			linkItem.style.border = '1px solid var(--background-modifier-border)';

			// 文件信息
			const fileName = link.filePath.split('/').pop() || link.filePath;
			const fileInfo = linkItem.createDiv();
			fileInfo.style.fontWeight = '600';
			fileInfo.style.color = 'var(--text-accent)';
			fileInfo.style.marginBottom = '4px';
			fileInfo.textContent = `📄 ${fileName} (第 ${link.lineNumber} 行)`;

			// 链接内容
			const linkContent = linkItem.createDiv();
			linkContent.style.color = 'var(--text-normal)';
			linkContent.style.fontSize = '0.9em';
			linkContent.style.whiteSpace = 'pre-wrap';
			linkContent.style.wordBreak = 'break-all';
			linkContent.textContent = link.linkText;

			// 点击跳转到对应笔记
			linkItem.addEventListener('click', async () => {
				const file = this.app.vault.getAbstractFileByPath(link.filePath);
				if (file) {
					// 根据设置决定是否保持模态框打开
					const keepOpen = this.plugin?.settings.keepModalOpen || false;
					
					if (keepOpen) {
						// 保持模态框打开：在右侧堆叠面板打开笔记
						const newLeaf = this.app.workspace.splitActiveLeaf('vertical');
						if (newLeaf) {
							await newLeaf.openFile(file as TFile);
							// 滚动到指定行
							setTimeout(() => {
								const view = newLeaf.view;
								if (view && 'editor' in view) {
									const editor = (view as any).editor;
									if (editor && typeof editor.setCursor === 'function') {
										editor.setCursor({ line: link.lineNumber - 1, ch: 0 });
										editor.scrollIntoView({ from: { line: link.lineNumber - 1, ch: 0 } });
									}
								}
							}, 100);
						}
					} else {
						// 关闭模态框：在当前标签页打开笔记
						const newLeaf = this.app.workspace.getLeaf(true);
						if (newLeaf) {
							await newLeaf.openFile(file as TFile);
							// 滚动到指定行
							setTimeout(() => {
								const view = newLeaf.view;
								if (view && 'editor' in view) {
									const editor = (view as any).editor;
									if (editor && typeof editor.setCursor === 'function') {
										editor.setCursor({ line: link.lineNumber - 1, ch: 0 });
										editor.scrollIntoView({ from: { line: link.lineNumber - 1, ch: 0 } });
									}
								}
							}, 100);
							// 关闭模态框
							this.close();
						}
					}
				}
			});

			// 悬停效果
			linkItem.addEventListener('mouseenter', () => {
				linkItem.style.backgroundColor = 'var(--background-modifier-hover)';
				linkItem.style.borderColor = 'var(--interactive-accent)';
			});

			linkItem.addEventListener('mouseleave', () => {
				linkItem.style.backgroundColor = 'var(--background-secondary)';
				linkItem.style.borderColor = 'var(--background-modifier-border)';
			});
		}
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

