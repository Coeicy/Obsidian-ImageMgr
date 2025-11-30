import { App, Modal, Notice, TFile } from 'obsidian';
import { makeModalResizable } from '../utils/resizable-modal';
import ImageManagementPlugin from '../main';
import { OperationType } from '../utils/logger';
import { parseWikiLink, buildWikiLink, WikiLinkParts } from '../utils/reference-manager';

/**
 * 链接格式类型
 * - 'shortest': 尽可能简短的形式（仅文件名）
 * - 'relative': 基于当前笔记的相对路径
 * - 'absolute': 基于仓库根目录的绝对路径
 */
export type LinkFormatType = 'shortest' | 'relative' | 'absolute';

/**
 * Obsidian 新链接格式设置
 * - 'shortest': 尽可能简短的形式
 * - 'relative': 当前文件的相对路径
 * - 'absolute': 仓库的绝对路径
 */
type ObsidianNewLinkFormat = 'shortest' | 'relative' | 'absolute';

/**
 * 单个链接转换详情
 */
interface LinkConvertDetail {
	/** 笔记路径 */
	notePath: string;
	/** 行号 */
	lineNumber: number;
	/** 图片路径 */
	imagePath: string;
	/** 图片名称 */
	imageName: string;
	/** 旧链接 */
	oldLink: string;
	/** 新链接 */
	newLink: string;
}

/**
 * 链接格式转换结果
 */
export interface LinkFormatConvertResult {
	/** 转换的文件数量 */
	fileCount: number;
	/** 转换的链接数量 */
	linkCount: number;
	/** 转换失败的数量 */
	failedCount: number;
	/** 转换详情列表 */
	details: LinkConvertDetail[];
}

/**
 * 链接格式转换模态框
 * 
 * 用于将图片链接转换为不同格式：
 * - 尽可能简短的形式
 * - 基于当前笔记的相对路径
 * - 基于仓库根目录的绝对路径
 */
export class LinkFormatModal extends Modal {
	private plugin: ImageManagementPlugin;
	private selectedFormat: LinkFormatType = 'shortest';
	private previewContainer: HTMLElement | null = null;

	constructor(app: App, plugin: ImageManagementPlugin) {
		super(app);
		this.plugin = plugin;
		this.modalEl.addClass('link-format-modal');
		
		// 移除模态框默认的底部 padding
		const style = document.createElement('style');
		style.textContent = `
			.link-format-modal .modal-content {
				padding-bottom: 0 !important;
			}
		`;
		this.modalEl.appendChild(style);
	}

	/**
	 * 获取 Obsidian 的链接格式设置
	 */
	private getObsidianLinkFormat(): { format: ObsidianNewLinkFormat; label: string } {
		// 读取 Obsidian 的设置
		// @ts-ignore - 访问 Obsidian 内部 API
		const vaultConfig = this.app.vault.config;
		const newLinkFormat = vaultConfig?.newLinkFormat as ObsidianNewLinkFormat || 'shortest';
		
		const formatLabels: Record<ObsidianNewLinkFormat, string> = {
			'shortest': '尽可能简短的形式',
			'relative': '当前文件的相对路径',
			'absolute': '仓库的绝对路径'
		};
		
		return {
			format: newLinkFormat,
			label: formatLabels[newLinkFormat] || newLinkFormat
		};
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// 启用模态框可调整大小
		makeModalResizable(this.modalEl, {
			minWidth: 450,
			minHeight: 300,
		});
		
		// 设置 contentEl 为 flex 布局
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.overflow = 'hidden';

		// 获取 Obsidian 的链接格式设置
		const obsidianFormat = this.getObsidianLinkFormat();
		this.selectedFormat = obsidianFormat.format;

		// 标题
		const titleEl = contentEl.createEl('h2', { text: '链接格式转换' });
		titleEl.style.flexShrink = '0';

		// 说明
		const descEl = contentEl.createDiv('link-format-desc');
		descEl.style.cssText = `
			margin-bottom: 16px;
			color: var(--text-muted);
			font-size: 0.9em;
			line-height: 1.5;
			flex-shrink: 0;
		`;
		descEl.innerHTML = `
			将所有笔记中的图片链接转换为 Obsidian 设置的格式。<br>
			<strong>注意：</strong>此操作会修改笔记文件，建议先备份。
		`;

		// 当前 Obsidian 设置显示
		const settingsSection = contentEl.createDiv('settings-section');
		settingsSection.style.cssText = `
			margin-bottom: 20px;
			padding: 16px;
			background-color: var(--background-secondary);
			border-radius: 8px;
			border-left: 4px solid var(--interactive-accent);
			flex-shrink: 0;
		`;

		// 标题行（包含标题和转换全部按钮）
		const settingsHeader = settingsSection.createEl('div');
		settingsHeader.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 8px;
		`;

		const settingsTitle = settingsHeader.createEl('div');
		settingsTitle.style.cssText = `
			font-weight: 600;
			color: var(--text-normal);
		`;
		settingsTitle.textContent = '📋 当前 Obsidian 设置';

		// 转换全部按钮
		const convertBtn = settingsHeader.createEl('button', { text: '转换全部' });
		convertBtn.addClass('mod-cta');
		convertBtn.style.cssText = `
			padding: 6px 14px;
			border-radius: 6px;
			cursor: pointer;
			font-size: 0.9em;
		`;
		convertBtn.addEventListener('click', () => this.convertLinks());

		const settingsInfo = settingsSection.createEl('div');
		settingsInfo.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 6px;
		`;

		const formatRow = settingsInfo.createEl('div');
		formatRow.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
		`;
		formatRow.innerHTML = `
			<span>新链接格式:</span>
			<span style="font-weight: 500; color: var(--text-accent);">${obsidianFormat.label}</span>
		`;
		
		let exampleOld = '';
		let exampleNew = '';
		switch (obsidianFormat.format) {
			case 'shortest':
				exampleOld = '![[attachments/images/photo.png]]';
				exampleNew = '![[photo.png]]';
				break;
			case 'relative':
				exampleOld = '![[photo.png]]';
				exampleNew = '![[../images/photo.png]]';
				break;
			case 'absolute':
				exampleOld = '![[photo.png]]';
				exampleNew = '![[attachments/images/photo.png]]';
				break;
		}

		// 示例
		const exampleSection = settingsInfo.createEl('div');
		exampleSection.style.cssText = `
			margin-top: 8px;
			padding: 8px 12px;
			background-color: var(--background-primary);
			border-radius: 6px;
			font-size: 0.85em;
			display: flex;
			align-items: center;
			gap: 8px;
			flex-wrap: wrap;
		`;
		exampleSection.innerHTML = `
			<span style="color: var(--text-muted);">转换示例:</span>
			<code style="color: var(--text-error); background: var(--background-secondary); padding: 2px 6px; border-radius: 4px;">${exampleOld}</code>
			<span style="color: var(--text-muted);">→</span>
			<code style="color: var(--text-success); background: var(--background-secondary); padding: 2px 6px; border-radius: 4px;">${exampleNew}</code>
		`;

		// 预览区域
		this.previewContainer = contentEl.createDiv('preview-container');
		this.previewContainer.style.cssText = `
			padding: 12px 12px 0 12px;
			background-color: var(--background-secondary);
			border-radius: 8px;
			display: none;
			overflow-y: auto;
			max-height: 50vh;
		`;

		// 自动加载预览
		this.previewChanges();
	}

	/**
	 * 预览变更
	 */
	async previewChanges() {
		if (!this.previewContainer) return;

		this.previewContainer.empty();
		this.previewContainer.style.display = 'block';

		const loadingText = this.previewContainer.createDiv();
		loadingText.textContent = '正在分析链接...';
		loadingText.style.color = 'var(--text-muted)';

		try {
			const changes = await this.analyzeLinks();
			
			this.previewContainer.empty();
			this.previewContainer.style.display = 'block';

			if (changes.length === 0) {
				const noChanges = this.previewContainer.createDiv();
				noChanges.textContent = '没有需要转换的链接';
				noChanges.style.color = 'var(--text-muted)';
				return;
			}

			const summaryText = this.previewContainer.createDiv();
			summaryText.innerHTML = `将转换 <strong>${changes.length}</strong> 个链接 <span style="color: var(--text-muted); font-size: 0.85em;">(点击单个链接可单独转换)</span>`;
			summaryText.style.marginBottom = '10px';

			// 显示所有变更
			const exampleList = this.previewContainer.createDiv();
			exampleList.style.cssText = `
				font-size: 0.85em;
			`;

			for (let i = 0; i < changes.length; i++) {
				const change = changes[i];
				const changeItem = exampleList.createDiv();
				// 最后一个不加底部边框
				const isLast = i === changes.length - 1;
				changeItem.style.cssText = `
					padding: 8px;
					${isLast ? '' : 'border-bottom: 1px solid var(--background-modifier-border);'}
					cursor: pointer;
					transition: background-color 0.15s ease;
					border-radius: 4px;
				`;
				changeItem.innerHTML = `
					<div style="color: var(--text-muted); font-size: 0.9em;">${change.filePath} (第${change.lineNumber}行)</div>
					<div><code style="color: var(--text-error);">${this.escapeHtml(change.oldLink)}</code></div>
					<div>→ <code style="color: var(--text-success);">${this.escapeHtml(change.newLink)}</code></div>
				`;

				// 悬停效果
				changeItem.addEventListener('mouseenter', () => {
					changeItem.style.backgroundColor = 'var(--background-modifier-hover)';
				});
				changeItem.addEventListener('mouseleave', () => {
					changeItem.style.backgroundColor = 'transparent';
				});

				// 点击单独转换
				changeItem.addEventListener('click', async () => {
					await this.convertSingleLink(change, changeItem);
				});
			}
		} catch (error) {
			this.previewContainer.empty();
			const errorText = this.previewContainer.createDiv();
			errorText.textContent = `分析失败: ${error}`;
			errorText.style.color = 'var(--text-error)';
		}
	}

	/**
	 * 转换单个链接
	 */
	async convertSingleLink(
		change: { filePath: string; lineNumber: number; oldLink: string; newLink: string },
		itemEl: HTMLElement
	) {
		try {
			const file = this.app.vault.getAbstractFileByPath(change.filePath) as TFile;
			if (!file) {
				new Notice(`找不到文件: ${change.filePath}`);
				return;
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const lineIndex = change.lineNumber - 1;

			if (lineIndex < 0 || lineIndex >= lines.length) {
				new Notice('行号无效');
				return;
			}

			const oldLine = lines[lineIndex];
			const newLine = oldLine.replace(change.oldLink, change.newLink);

			if (newLine !== oldLine) {
				lines[lineIndex] = newLine;
				await this.app.vault.modify(file, lines.join('\n'));

				// 更新 UI
				itemEl.style.opacity = '0.5';
				itemEl.style.pointerEvents = 'none';
				itemEl.style.backgroundColor = 'var(--background-modifier-success)';
				
				// 添加成功标记
				const successBadge = itemEl.createDiv();
				successBadge.style.cssText = `
					color: var(--text-success);
					font-weight: 600;
					margin-top: 4px;
				`;
				successBadge.textContent = '✓ 已转换';

				// 记录日志
				if (this.plugin.logger) {
					// 获取图片信息
					const linkMatch = change.newLink.match(/!\[\[([^\]|]+)/);
					const imagePath = linkMatch ? linkMatch[1] : '';
					const imageName = imagePath.split('/').pop() || imagePath;

					const formatLabels: Record<LinkFormatType, string> = {
						'shortest': '尽可能简短',
						'relative': '相对路径',
						'absolute': '绝对路径'
					};

					await this.plugin.logger.info(
						OperationType.UPDATE_REFERENCE,
						`链接格式转换 (${formatLabels[this.selectedFormat]}): ${imageName}\n更新链接: ${change.oldLink} → ${change.newLink}\n更新笔记: ${change.filePath} (第${change.lineNumber}行)`,
						{
							imagePath: imagePath,
							imageName: imageName,
							details: {
								format: this.selectedFormat,
								notePath: change.filePath,
								lineNumber: change.lineNumber,
								oldLink: change.oldLink,
								newLink: change.newLink
							}
						}
					);
				}

				new Notice(`已转换: ${change.oldLink}`);
			} else {
				new Notice('链接内容未变化');
			}
		} catch (error) {
			new Notice(`转换失败: ${error}`);
		}
	}

	/**
	 * 分析需要转换的链接
	 */
	async analyzeLinks(): Promise<Array<{ filePath: string; lineNumber: number; oldLink: string; newLink: string }>> {
		const changes: Array<{ filePath: string; lineNumber: number; oldLink: string; newLink: string }> = [];
		const allFiles = this.app.vault.getMarkdownFiles();
		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];

		for (const file of allFiles) {
			try {
				const content = await this.app.vault.read(file);
				const lines = content.split('\n');

				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];

					// 匹配 Wiki 格式: ![[path]] 或 ![[path|text]]
					const wikiPattern = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
					let match;

					while ((match = wikiPattern.exec(line)) !== null) {
						const linkPath = match[1];
						
						// 检查是否是图片链接
						const ext = linkPath.split('.').pop()?.toLowerCase() || '';
						if (!imageExtensions.includes(ext)) continue;

						// 解析目标文件
						const targetFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, file.path);
						if (!targetFile) continue;

						// 计算新路径
						const newPath = this.calculateNewPath(targetFile.path, file.path, this.selectedFormat);
						
						if (newPath !== linkPath) {
							// 保留显示文本和尺寸
							const parsed = parseWikiLink(match[0]);
							const newParts: WikiLinkParts = {
								path: newPath,
								displayText: parsed.displayText,
								width: parsed.width,
								height: parsed.height
							};
							const newLink = buildWikiLink(newParts, true);

							changes.push({
								filePath: file.path,
								lineNumber: i + 1,
								oldLink: match[0],
								newLink: newLink
							});
						}
					}
				}
			} catch (error) {
				// 跳过读取失败的文件
			}
		}

		return changes;
	}

	/**
	 * 计算新的链接路径
	 */
	calculateNewPath(imagePath: string, notePath: string, format: LinkFormatType): string {
		const imageFile = this.app.vault.getAbstractFileByPath(imagePath);
		if (!imageFile) return imagePath;

		switch (format) {
			case 'shortest': {
				// 尽可能简短：仅文件名
				const fileName = imagePath.split('/').pop() || imagePath;
				
				// 检查是否有同名文件
				const allFiles = this.app.vault.getFiles();
				const sameNameFiles = allFiles.filter(f => f.name === fileName);
				
				if (sameNameFiles.length === 1) {
					// 唯一文件名，使用简短形式
					return fileName;
				} else {
					// 有同名文件，需要使用更长的路径来区分
					// 返回完整路径
					return imagePath;
				}
			}

			case 'relative': {
				// 相对路径：基于当前笔记的位置
				const noteDir = notePath.includes('/') 
					? notePath.substring(0, notePath.lastIndexOf('/'))
					: '';
				const imageDir = imagePath.includes('/')
					? imagePath.substring(0, imagePath.lastIndexOf('/'))
					: '';
				const imageName = imagePath.split('/').pop() || imagePath;

				if (noteDir === imageDir) {
					// 同一目录，使用文件名
					return imageName;
				}

				// 计算相对路径
				const noteParts = noteDir ? noteDir.split('/') : [];
				const imageParts = imageDir ? imageDir.split('/') : [];

				// 找到共同前缀
				let commonLength = 0;
				while (commonLength < noteParts.length && 
					   commonLength < imageParts.length && 
					   noteParts[commonLength] === imageParts[commonLength]) {
					commonLength++;
				}

				// 构建相对路径
				const upCount = noteParts.length - commonLength;
				const downParts = imageParts.slice(commonLength);

				let relativePath = '';
				for (let i = 0; i < upCount; i++) {
					relativePath += '../';
				}
				if (downParts.length > 0) {
					relativePath += downParts.join('/') + '/';
				}
				relativePath += imageName;

				return relativePath;
			}

			case 'absolute': {
				// 绝对路径：从仓库根目录开始
				return imagePath;
			}

			default:
				return imagePath;
		}
	}

	/**
	 * 执行链接转换
	 */
	async convertLinks() {
		const confirmResult = await this.showConfirm(
			'确认转换',
			'此操作将修改笔记文件中的图片链接。\n\n建议先备份重要笔记。\n\n是否继续？'
		);

		if (!confirmResult) return;

		new Notice('正在转换链接...');

		try {
			const result = await this.performConversion();

			// 构建详细的日志消息
			const formatLabels: Record<LinkFormatType, string> = {
				'shortest': '尽可能简短',
				'relative': '相对路径',
				'absolute': '绝对路径'
			};

			// 记录日志
			if (this.plugin.logger) {
				// 1. 为每个图片单独记录一条日志（这样在图片详情页可以查询到）
				// 按图片分组
				const byImage = new Map<string, typeof result.details>();
				for (const detail of result.details) {
					const existing = byImage.get(detail.imagePath) || [];
					existing.push(detail);
					byImage.set(detail.imagePath, existing);
				}

				// 为每个图片记录日志
				for (const [imagePath, imageDetails] of byImage) {
					const imageName = imageDetails[0].imageName;
					
					// 获取图片的 MD5 哈希值
					let imageHash: string | undefined;
					try {
						const imageFile = this.app.vault.getAbstractFileByPath(imagePath);
						if (imageFile && this.plugin.data?.images) {
							const imageInfo = this.plugin.data.images.find(img => img.path === imagePath);
							imageHash = imageInfo?.md5;
						}
					} catch (e) {
						// 忽略获取哈希值失败
					}

					// 构建该图片的日志消息
					const noteList = imageDetails.map((d, i) => 
						`${i + 1}. ${d.notePath} (第${d.lineNumber}行)`
					).join('\n');
					const linkChangeList = imageDetails.map(d => 
						`   ${d.oldLink} → ${d.newLink}`
					).join('\n');
					
					const imageLogMessage = `链接格式转换 (${formatLabels[this.selectedFormat]}): ${imageName}\n更新链接:\n${linkChangeList}\n更新笔记:\n${noteList}`;

					await this.plugin.logger.info(
						OperationType.UPDATE_REFERENCE,
						imageLogMessage,
						{
							imageHash: imageHash,
							imagePath: imagePath,
							imageName: imageName,
							details: {
								format: this.selectedFormat,
								formatLabel: formatLabels[this.selectedFormat],
								conversions: imageDetails.map(d => ({
									notePath: d.notePath,
									lineNumber: d.lineNumber,
									oldLink: d.oldLink,
									newLink: d.newLink
								}))
							}
						}
					);
				}

				// 2. 记录一条总结日志
				let summaryMessage = `链接格式转换完成 (${formatLabels[this.selectedFormat]}): 转换了 ${result.fileCount} 个文件中的 ${result.linkCount} 个链接`;
				
				if (result.details.length > 0) {
					// 按笔记分组显示
					const byNote = new Map<string, typeof result.details>();
					for (const detail of result.details) {
						const existing = byNote.get(detail.notePath) || [];
						existing.push(detail);
						byNote.set(detail.notePath, existing);
					}
					
					// 构建笔记列表
					const noteList = Array.from(byNote.entries()).map(([notePath, noteDetails], index) => {
						const linkList = noteDetails.map(d => 
							`   - 第${d.lineNumber}行: ${d.oldLink} → ${d.newLink}`
						).join('\n');
						return `${index + 1}. ${notePath}\n${linkList}`;
					}).join('\n');
					
					summaryMessage += `\n更新笔记:\n${noteList}`;
				}

				await this.plugin.logger.info(
					OperationType.UPDATE_REFERENCE,
					summaryMessage,
					{
						details: {
							isSummary: true,
							format: this.selectedFormat,
							formatLabel: formatLabels[this.selectedFormat],
							fileCount: result.fileCount,
							linkCount: result.linkCount,
							failedCount: result.failedCount,
							affectedNotes: Array.from(new Set(result.details.map(d => d.notePath))),
							affectedImages: Array.from(new Set(result.details.map(d => d.imagePath))),
							conversions: result.details.map(d => ({
								notePath: d.notePath,
								lineNumber: d.lineNumber,
								imagePath: d.imagePath,
								imageName: d.imageName,
								oldLink: d.oldLink,
								newLink: d.newLink
							}))
						}
					}
				);
			}

			new Notice(`转换完成！\n修改了 ${result.fileCount} 个文件\n转换了 ${result.linkCount} 个链接`);
			this.close();
		} catch (error) {
			new Notice(`转换失败: ${error}`);
			if (this.plugin.logger) {
				await this.plugin.logger.error(
					OperationType.UPDATE_REFERENCE,
					'链接格式转换失败',
					{ error: error as Error }
				);
			}
		}
	}

	/**
	 * 执行实际的转换操作
	 */
	async performConversion(): Promise<LinkFormatConvertResult> {
		const allFiles = this.app.vault.getMarkdownFiles();
		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
		
		let fileCount = 0;
		let linkCount = 0;
		let failedCount = 0;
		const details: LinkConvertDetail[] = [];

		for (const file of allFiles) {
			try {
				const content = await this.app.vault.read(file);
				const lines = content.split('\n');
				let modified = false;

				for (let i = 0; i < lines.length; i++) {
					let line = lines[i];
					let lineModified = false;

					// 匹配 Wiki 格式: ![[path]] 或 ![[path|text|size]]
					const wikiPattern = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
					const matches: Array<{ match: string; index: number; linkPath: string }> = [];
					let match;

					while ((match = wikiPattern.exec(line)) !== null) {
						matches.push({
							match: match[0],
							index: match.index,
							linkPath: match[1]
						});
					}

					// 从后往前替换，避免索引偏移
					for (let j = matches.length - 1; j >= 0; j--) {
						const m = matches[j];
						const linkPath = m.linkPath;

						// 检查是否是图片链接
						const ext = linkPath.split('.').pop()?.toLowerCase() || '';
						if (!imageExtensions.includes(ext)) continue;

						// 解析目标文件
						const targetFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, file.path);
						if (!targetFile) continue;

						// 计算新路径
						const newPath = this.calculateNewPath(targetFile.path, file.path, this.selectedFormat);

						if (newPath !== linkPath) {
							// 保留显示文本和尺寸
							const parsed = parseWikiLink(m.match);
							const newParts: WikiLinkParts = {
								path: newPath,
								displayText: parsed.displayText,
								width: parsed.width,
								height: parsed.height
							};
							const newLink = buildWikiLink(newParts, true);

							// 记录转换详情
							details.push({
								notePath: file.path,
								lineNumber: i + 1,
								imagePath: targetFile.path,
								imageName: targetFile.name,
								oldLink: m.match,
								newLink: newLink
							});

							// 替换
							line = line.substring(0, m.index) + newLink + line.substring(m.index + m.match.length);
							lineModified = true;
							linkCount++;
						}
					}

					if (lineModified) {
						lines[i] = line;
						modified = true;
					}
				}

				if (modified) {
					await this.app.vault.modify(file, lines.join('\n'));
					fileCount++;
				}
			} catch (error) {
				failedCount++;
			}
		}

		return { fileCount, linkCount, failedCount, details };
	}

	/**
	 * 显示确认对话框
	 */
	async showConfirm(title: string, message: string): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.contentEl.createEl('h3', { text: title });
			modal.contentEl.createEl('p', { text: message });
			modal.contentEl.style.whiteSpace = 'pre-wrap';

			const buttonContainer = modal.contentEl.createDiv();
			buttonContainer.style.cssText = `
				display: flex;
				justify-content: flex-end;
				gap: 10px;
				margin-top: 16px;
			`;

			const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
			cancelBtn.addEventListener('click', () => {
				modal.close();
				resolve(false);
			});

			const confirmBtn = buttonContainer.createEl('button', { text: '确认' });
			confirmBtn.addClass('mod-cta');
			confirmBtn.addEventListener('click', () => {
				modal.close();
				resolve(true);
			});

			modal.open();
		});
	}

	/**
	 * HTML 转义
	 */
	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
