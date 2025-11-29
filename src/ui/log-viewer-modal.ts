import { App, Modal, Notice, Setting } from 'obsidian';
import ImageManagementPlugin from '../main';
import { Logger, LogEntry, LogLevel, OperationType, OperationTypeLabels, LogFilter } from '../utils/logger';
import { makeModalResizable } from '../utils/resizable-modal';

/**
 * 日志查看器模态框
 */
export class LogViewerModal extends Modal {
	private plugin: ImageManagementPlugin;
	private logger: Logger;
	private currentFilter: LogFilter = {};
	private filteredLogs: LogEntry[] = [];
	private imageHash?: string; // 如果指定，只显示该图片的日志
	private levelCheckboxes: HTMLInputElement[] = [];
	private operationSelect: HTMLSelectElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private searchTimeout: number | null = null;
	private statsDiv: HTMLElement | null = null;
	private logContainerRef: HTMLElement | null = null;

	constructor(app: App, plugin: ImageManagementPlugin, imageHash?: string) {
		super(app);
		this.plugin = plugin;
		this.logger = plugin.logger;
		this.imageHash = imageHash;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('log-viewer-modal');
		
		// 设置内容区域样式，使其可以滚动
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.height = '100%';
		contentEl.style.overflow = 'hidden';
		
		// 启用模态框可调整大小
		makeModalResizable(this.modalEl, {
			minWidth: 600,
			minHeight: 500,
		});

		// 标题
		const title = contentEl.createEl('h2', {
			text: this.imageHash ? '图片操作日志' : '插件操作日志'
		});
		title.style.flexShrink = '0';
		title.style.marginBottom = '12px';

		// 如果是图片日志，设置过滤器
		if (this.imageHash) {
			this.currentFilter.imageHash = this.imageHash;
		}

		// 创建可滚动的内容容器
		const scrollContainer = contentEl.createDiv();
		scrollContainer.style.flex = '1';
		scrollContainer.style.overflowY = 'auto';
		scrollContainer.style.overflowX = 'hidden';
		scrollContainer.style.display = 'flex';
		scrollContainer.style.flexDirection = 'column';

		// 创建筛选区域
		this.createFilterSection(scrollContainer);

		// 创建日志列表容器
		const logContainer = scrollContainer.createDiv('log-container');
		logContainer.style.cssText = `
			flex: 1;
			overflow-y: auto;
			border: 1px solid var(--background-modifier-border);
			border-radius: 6px;
			padding: 12px;
			margin-top: 16px;
			background-color: var(--background-secondary);
			user-select: text;
			min-height: 0;
		`;
		this.logContainerRef = logContainer;

		// 刷新日志显示
		this.refreshLogs(logContainer);

		// 操作按钮区
		const buttonContainer = contentEl.createDiv('button-container');
		buttonContainer.style.cssText = `
			display: flex;
			gap: 8px;
			margin-top: 12px;
			justify-content: flex-end;
			flex-shrink: 0;
		`;

		// 复制按钮
		const copyBtn = buttonContainer.createEl('button', {
			text: '📋 复制日志',
			cls: 'mod-cta'
		});
		copyBtn.addEventListener('click', () => this.copyLogs());

		// 导出按钮
		const exportBtn = buttonContainer.createEl('button', {
			text: '💾 导出日志'
		});
		exportBtn.addEventListener('click', () => this.exportLogs());

		// 清除按钮（只有在非图片日志时显示）
		if (!this.imageHash) {
			const clearBtn = buttonContainer.createEl('button', {
				text: '🗑️ 清除日志',
				cls: 'mod-warning'
			});
			clearBtn.addEventListener('click', () => this.clearLogs());
		}
	}

	/**
	 * 创建筛选区域
	 */
	private createFilterSection(container: HTMLElement) {
		const filterSection = container.createDiv('filter-section');
		filterSection.style.cssText = `
			padding: 12px;
			background-color: var(--background-primary-alt);
			border-radius: 6px;
			margin-bottom: 8px;
		`;

		// 级别筛选
		const levelDiv = filterSection.createDiv();
		levelDiv.style.marginBottom = '8px';
		
		const levelLabel = levelDiv.createEl('label', { text: '级别: ' });
		levelLabel.style.marginRight = '8px';
		levelLabel.style.fontWeight = 'bold';

		const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARNING, LogLevel.ERROR];
		const levelCheckboxes: HTMLInputElement[] = [];
		
		levels.forEach(level => {
			const label = levelDiv.createEl('label');
			label.style.marginRight = '12px';
			label.style.cursor = 'pointer';
			
			const checkbox = label.createEl('input', { type: 'checkbox' });
			checkbox.checked = true;
			checkbox.style.marginRight = '4px';
			checkbox.addEventListener('change', () => this.updateFilter());
			levelCheckboxes.push(checkbox);
			
			const levelText = label.createSpan({ text: level });
			levelText.style.color = this.getLevelColor(level);
			
			// 将 level 存储在 checkbox 的 dataset 中
			checkbox.dataset.level = level;
		});

		this.levelCheckboxes = levelCheckboxes;

		// 操作类型筛选（下拉选择）
		if (!this.imageHash) {
			const operationDiv = filterSection.createDiv();
			operationDiv.style.marginBottom = '8px';
			
			const opLabel = operationDiv.createEl('label', { text: '操作类型: ' });
			opLabel.style.marginRight = '8px';
			opLabel.style.fontWeight = 'bold';
			
			const opSelect = operationDiv.createEl('select');
			opSelect.style.padding = '4px 8px';
			opSelect.style.borderRadius = '4px';
			
			opSelect.createEl('option', { text: '全部', value: '' });
			Object.values(OperationType).forEach(op => {
				const label = `${op} (${OperationTypeLabels[op]})`;
				opSelect.createEl('option', { text: label, value: op });
			});
			
			opSelect.addEventListener('change', () => this.updateFilter());
			this.operationSelect = opSelect;
		}

		// 关键词搜索
		const searchDiv = filterSection.createDiv();
		searchDiv.style.display = 'flex';
		searchDiv.style.gap = '8px';
		searchDiv.style.alignItems = 'center';
		
		const searchLabel = searchDiv.createEl('label', { text: '搜索: ' });
		searchLabel.style.fontWeight = 'bold';
		
		const searchInput = searchDiv.createEl('input', { type: 'text', placeholder: '输入关键词...' });
		searchInput.style.flex = '1';
		searchInput.style.padding = '6px 12px';
		searchInput.style.borderRadius = '4px';
		searchInput.addEventListener('input', () => {
			if (this.searchTimeout !== null) {
				clearTimeout(this.searchTimeout);
			}
			this.searchTimeout = window.setTimeout(() => this.updateFilter(), 300);
		});
		this.searchInput = searchInput;

		// 统计信息
		const statsDiv = filterSection.createDiv();
		statsDiv.style.marginTop = '8px';
		statsDiv.style.fontSize = '0.9em';
		statsDiv.style.color = 'var(--text-muted)';
		this.statsDiv = statsDiv;
		this.updateStats();
	}

	/**
	 * 更新筛选器
	 */
	private updateFilter() {
		const filter: LogFilter = {};

		// 图片哈希（如果有）
		if (this.imageHash) {
			filter.imageHash = this.imageHash;
		}

		// 级别筛选
		const selectedLevels: LogLevel[] = [];
		this.levelCheckboxes.forEach((checkbox) => {
			if (checkbox.checked && checkbox.dataset.level) {
				selectedLevels.push(checkbox.dataset.level as LogLevel);
			}
		});
		if (selectedLevels.length > 0 && selectedLevels.length < 4) {
			filter.level = selectedLevels;
		}

		// 操作类型筛选
		if (this.operationSelect) {
			const selected = this.operationSelect.value;
			if (selected) {
				filter.operation = [selected as OperationType];
			}
		}

		// 关键词搜索
		const keyword = this.searchInput?.value.trim() || '';
		if (keyword) {
			filter.keyword = keyword;
		}

		this.currentFilter = filter;
		this.refreshLogs(this.logContainerRef);
	}

	/**
	 * 刷新日志显示
	 */
	private refreshLogs(container: HTMLElement) {
		container.empty();
		this.logContainerRef = container;

		this.filteredLogs = this.logger.query(this.currentFilter);

		if (this.filteredLogs.length === 0) {
			const emptyMsg = container.createDiv();
			emptyMsg.textContent = '📭 暂无日志记录';
			emptyMsg.style.cssText = `
				text-align: center;
				padding: 40px;
				color: var(--text-muted);
				font-size: 1.1em;
			`;
			return;
		}

		// 显示日志条目
		this.filteredLogs.forEach(log => {
			const logItem = container.createDiv('log-item');
			logItem.style.cssText = `
				padding: 12px;
				margin-bottom: 8px;
				border-left: 4px solid ${this.getLevelColor(log.level)};
				background-color: var(--background-primary);
				border-radius: 4px;
				font-family: 'Courier New', monospace;
				font-size: 0.9em;
				line-height: 1.5;
				user-select: text;
				cursor: text;
			`;

			// 时间和级别
			const header = logItem.createDiv();
			header.style.cssText = `
				display: flex;
				justify-content: space-between;
				margin-bottom: 4px;
				font-weight: bold;
			`;

			const timeText = header.createSpan({
				text: new Date(log.timestamp).toLocaleString('zh-CN')
			});
			timeText.style.color = 'var(--text-muted)';

			const levelBadge = header.createSpan({ text: log.level });
			levelBadge.style.cssText = `
				padding: 2px 8px;
				border-radius: 4px;
				background-color: ${this.getLevelColor(log.level)};
				color: white;
				font-size: 0.85em;
			`;

			// 消息（保留换行格式）
			const message = logItem.createDiv();
			message.textContent = log.message;
			message.style.cssText = `
				margin-bottom: 4px;
				white-space: pre-wrap;
				word-break: break-word;
				line-height: 1.6;
			`;

			// 图片信息
			if (log.imageName || log.imagePath) {
				const imageInfo = logItem.createDiv();
				imageInfo.style.cssText = `
					margin-top: 4px;
					padding-left: 12px;
					color: var(--text-muted);
					font-size: 0.9em;
					user-select: text;
					cursor: text;
				`;
				
				if (log.imageName) {
					const nameDiv = imageInfo.createDiv({ text: `📷 ${log.imageName}` });
					nameDiv.style.userSelect = 'text';
				}
				if (log.imagePath && log.imagePath !== log.imageName) {
					const pathDiv = imageInfo.createDiv({ text: `📁 ${log.imagePath}` });
					pathDiv.style.userSelect = 'text';
				}
				if (log.imageHash) {
					const hashDiv = imageInfo.createDiv({ text: `🔑 ${log.imageHash}` });
					hashDiv.style.userSelect = 'text';
					hashDiv.style.wordBreak = 'break-all';
				}
			}

			// 更新的笔记列表（如果有，且消息中未包含更新笔记信息）
			if (log.details && log.details.referencedFiles && Array.isArray(log.details.referencedFiles) && log.details.referencedFiles.length > 0) {
				// 检查日志消息中是否已经包含了引用更新信息或更新笔记信息
				const hasRefsInMessage = log.message.includes('更新链接:') || log.message.includes('更新笔记:');
				
				// 如果消息中已经包含了更新笔记信息，就不单独显示了
				if (!hasRefsInMessage) {
					const refsDiv = logItem.createDiv('referenced-files-container');
					refsDiv.style.cssText = `
						margin-top: 8px;
						padding: 10px 12px;
						background: linear-gradient(135deg, var(--background-secondary-alt) 0%, var(--background-secondary) 100%);
						border-radius: 6px;
						box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
					`;
					const refsTitle = refsDiv.createDiv('referenced-files-title');
					refsTitle.style.cssText = `
						font-weight: 600;
						margin-bottom: 8px;
						font-size: 1em;
						color: var(--text-accent);
					`;
					refsTitle.textContent = '📝 更新笔记链接';
					
					const refsList = refsDiv.createDiv('referenced-files-list');
					refsList.style.cssText = `
						display: flex;
						flex-direction: column;
						gap: 6px;
					`;
					log.details.referencedFiles.forEach((filePath: string, index: number) => {
						const refItem = refsList.createDiv('referenced-file-item');
						refItem.style.cssText = `
							padding: 8px 10px;
							background: var(--background-primary);
							border-radius: 4px;
							border: 1px solid var(--background-modifier-border);
							font-family: var(--font-monospace);
							font-size: 0.95em;
							color: var(--text-normal);
							word-break: break-all;
							transition: all 0.15s ease;
						`;
						// 简化序号样式，使用简单文本
						refItem.textContent = `${index + 1}. ${filePath}`;
						refItem.style.userSelect = 'text';
						refItem.style.cursor = 'text';
					});
				}
			}
			
			// 详情（过滤掉已在日志消息中包含的信息，避免重复显示）
			if (log.details) {
				// 创建一个过滤后的详情对象，排除已在消息中包含的字段
				const filteredDetails: Record<string, unknown> = {};
				
				// 检查消息是否包含重命名信息
				const hasRenameInMessage = log.details.fromName && log.details.toName && 
					log.message.includes(`${log.details.fromName} → ${log.details.toName}`);
				
				// 检查消息是否包含引用更新信息
				const hasRefsInMessage = log.details.updatedRefs !== undefined && 
					log.message.includes(`更新引用: ${log.details.updatedRefs}`);
				
				// 只保留未在消息中显示的字段（排除 referencedFiles，因为它已在上面单独显示）
				Object.keys(log.details).forEach(key => {
					if (key === 'fromName' && hasRenameInMessage) return;
					if (key === 'toName' && hasRenameInMessage) return;
					if (key === 'updatedRefs' && hasRefsInMessage) return;
					if (key === 'referencedFiles') return; // 已在上面单独显示
					
					// 保留其他字段
					filteredDetails[key] = (log.details as any)[key];
				});
				
				// 只有在有过滤后的详情时才显示
				if (Object.keys(filteredDetails).length > 0) {
					const details = logItem.createDiv();
					details.style.cssText = `
						margin-top: 6px;
						padding: 6px;
						background-color: var(--background-secondary);
						border-radius: 3px;
						font-size: 0.85em;
						overflow-x: auto;
						user-select: text;
					`;
					const pre = details.createEl('pre', {
						text: JSON.stringify(filteredDetails, null, 2)
					});
					pre.style.userSelect = 'text';
					pre.style.cursor = 'text';
				}
			}

			// 错误信息
			if (log.error) {
				const error = logItem.createDiv();
				error.style.cssText = `
					margin-top: 6px;
					padding: 8px;
					background-color: rgba(255, 0, 0, 0.1);
					border: 1px solid rgba(255, 0, 0, 0.3);
					border-radius: 3px;
					color: var(--text-error);
					user-select: text;
				`;
				const errorMsg = error.createDiv({ text: `❌ ${log.error}` });
				errorMsg.style.userSelect = 'text';
				errorMsg.style.cursor = 'text';
				
				if (log.stackTrace) {
					const stack = error.createEl('pre');
					stack.style.cssText = `
						margin-top: 4px;
						font-size: 0.8em;
						overflow-x: auto;
						user-select: text;
						cursor: text;
					`;
					stack.textContent = log.stackTrace;
				}
			}
		});

		this.updateStats();
	}

	/**
	 * 更新统计信息
	 */
	private updateStats() {
		if (!this.statsDiv) return;
		
		const total = this.filteredLogs.length;
		const errorCount = this.filteredLogs.filter(l => l.level === LogLevel.ERROR).length;
		const warnCount = this.filteredLogs.filter(l => l.level === LogLevel.WARNING).length;
		const infoCount = this.filteredLogs.filter(l => l.level === LogLevel.INFO).length;
		const debugCount = this.filteredLogs.filter(l => l.level === LogLevel.DEBUG).length;
		
		// 按操作类型统计
		const operationStats: Record<string, number> = {};
		this.filteredLogs.forEach(log => {
			operationStats[log.operation] = (operationStats[log.operation] || 0) + 1;
		});
		const topOperations = Object.entries(operationStats)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3)
			.map(([op, count]) => `${OperationTypeLabels[op as OperationType] || op}: ${count}`)
			.join(', ');
		
		let statsText = `显示 ${total} 条日志`;
		if (errorCount > 0) statsText += ` | ❌ 错误: ${errorCount}`;
		if (warnCount > 0) statsText += ` | ⚠️ 警告: ${warnCount}`;
		if (infoCount > 0) statsText += ` | ℹ️ 信息: ${infoCount}`;
		if (debugCount > 0) statsText += ` | 🔍 调试: ${debugCount}`;
		if (topOperations) statsText += ` | 主要操作: ${topOperations}`;
		
		this.statsDiv.textContent = statsText;
	}

	/**
	 * 获取级别颜色
	 */
	private getLevelColor(level: LogLevel): string {
		switch (level) {
			case LogLevel.DEBUG: return '#6c757d';
			case LogLevel.INFO: return '#0d6efd';
			case LogLevel.WARNING: return '#ffc107';
			case LogLevel.ERROR: return '#dc3545';
			default: return '#6c757d';
		}
	}

	/**
	 * 复制日志
	 */
	private async copyLogs() {
		const text = this.logger.exportLogs(this.filteredLogs);
		await navigator.clipboard.writeText(text);
		new Notice(`已复制 ${this.filteredLogs.length} 条日志到剪贴板`);
	}

	/**
	 * 导出日志
	 */
	private async exportLogs() {
		const text = this.logger.exportLogs(this.filteredLogs);
		const filename = `日志导出_${Date.now()}.md`;
		
		try {
			await this.app.vault.create(filename, text);
			new Notice(`日志已导出: ${filename}`);
		} catch (error) {
			new Notice('导出失败');
			await this.logger.error(OperationType.PLUGIN_ERROR, '导出日志失败', {
				error: error as Error
			});
		}
	}

	/**
	 * 清除日志
	 */
	private async clearLogs() {
		const confirmed = confirm('确定要清除所有日志吗？此操作不可撤销。');
		if (confirmed) {
			await this.logger.clearAllLogs();
			new Notice('已清除所有日志');
			this.close();
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

