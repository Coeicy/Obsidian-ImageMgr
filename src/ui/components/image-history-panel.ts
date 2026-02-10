/**
 * 图片历史记录面板组件模块
 * 
 * 负责图片详情模态框中的操作记录区域。
 */

import { App, Notice } from 'obsidian';
import { ImageInfo } from '../../types';
import ImageManagementPlugin from '../../main';
import { LogViewerModal } from '../log-viewer-modal';
import { LogLevel, OperationTypeLabels, OperationType } from '../../utils/logger';

/**
 * 图片历史记录面板组件
 * 
 * 功能：
 * - 显示图片的操作历史记录
 * - 支持自动刷新
 * - 点击查看详细日志
 * - 显示操作类型、时间和详情
 */
export class ImageHistoryPanel {
	private container: HTMLElement;
	private historyList!: HTMLElement;
	private refreshInterval?: number;
	private showTitle: boolean; // 是否显示标题
	private eventListeners: Array<{element: HTMLElement, event: string, handler: EventListener}> = []; // 事件监听器引用

	constructor(
		container: HTMLElement,
		private image: ImageInfo,
		private app: App,
		private plugin?: ImageManagementPlugin,
		showTitle: boolean = true // 默认显示标题（保持向后兼容）
	) {
		this.container = container;
		this.showTitle = showTitle;
		this.render();
		this.startAutoRefresh();
	}

	private render() {
		this.container.empty();
		
		// 创建 info-group 容器，与其他模块样式一致
		const historyGroup = this.container.createDiv('info-group');
		
		// 标题行（仅在需要时显示）
		if (this.showTitle) {
			const historyTitle = historyGroup.createEl('h3');
			historyTitle.textContent = '📝 操作记录';
		}
		
		// 操作记录列表
		this.historyList = historyGroup.createEl('ul', { cls: 'history-list' });
		this.historyList.style.cssText = `
			max-height: none; /* 不限制高度，依次展示 */
			overflow-y: visible; /* 不需要滚动条 */
			padding: 0;
			margin: 0;
			flex: 1;
		`;
		
		// 首次渲染
		this.renderHistory();
	}

	/**
	 * 渲染操作记录
	 */
	async renderHistory() {
		// 清理旧的事件监听器
		for (const { element, event, handler } of this.eventListeners) {
			element.removeEventListener(event, handler);
		}
		this.eventListeners = [];
		
		this.historyList.empty();
		
		// 如果没有图片哈希值，显示提示
		if (!this.image.md5) {
			const emptyLi = this.historyList.createEl('li', { cls: 'history-item empty' });
			emptyLi.textContent = '需要扫描图片以生成哈希值';
			emptyLi.style.color = 'var(--text-muted)';
			return;
		}
		
		// 从新日志系统获取该图片的日志
		if (!this.plugin?.logger) {
			const emptyLi = this.historyList.createEl('li', { cls: 'history-item empty' });
			emptyLi.textContent = '日志系统未初始化';
			emptyLi.style.color = 'var(--text-muted)';
			return;
		}
		
		// 使用图片的 MD5 哈希值查询日志
		// 注意：即使文件移动了，MD5 哈希值不会改变，所以可以正确找到所有相关日志
		const logs = this.plugin.logger.getImageLogs(this.image.md5);
		
		// 如果没有找到日志，尝试通过路径查询（兼容旧数据或缺少 imageHash 的情况）
		if (logs.length === 0) {
			// 尝试通过路径查询（如果日志中没有 imageHash，但记录了 imagePath）
			const allLogs = this.plugin.logger.query({});
			const pathLogs = allLogs.filter(log => {
				// 检查当前路径
				if (log.imagePath === this.image.path) return true;
				// 检查 details 中的路径（移动操作会记录 fromPath 和 toPath）
				if (log.details && typeof log.details === 'object') {
					const details = log.details as any;
					// 检查 fromPath 或 toPath 是否匹配当前路径
					if (details.fromPath === this.image.path || details.toPath === this.image.path) {
						return true;
					}
				}
				// 检查 imageName 是否匹配（文件名相同）
				if (log.imageName === this.image.name) {
					return true;
				}
				return false;
			});
			
			if (pathLogs.length > 0) {
				// 使用路径匹配的日志，按时间倒序排列
				const sortedLogs = pathLogs.sort((a, b) => b.timestamp - a.timestamp);
				const recentLogs = sortedLogs.slice(0, 10);
				for (const log of recentLogs) {
					const historyLi = this.historyList.createEl('li', { cls: 'history-item' });
					this.renderSingleLogItem(historyLi, log);
				}
				return;
			}
			
			const emptyLi = this.historyList.createEl('li', { cls: 'history-item empty' });
			emptyLi.textContent = '暂无操作记录';
			emptyLi.style.color = 'var(--text-muted)';
			return;
		}
		
		// 最多显示最近10条
		const recentLogs = logs.slice(0, 10);
		
		for (const log of recentLogs) {
			const historyLi = this.historyList.createEl('li', { cls: 'history-item' });
			this.renderSingleLogItem(historyLi, log);
		}
		
		// 如果日志超过10条，显示"查看更多"按钮
		const totalLogs = this.plugin.logger.getImageLogs(this.image.md5).length;
		if (totalLogs > 10) {
			const moreBtn = this.historyList.createEl('li', { cls: 'history-item view-more' });
			moreBtn.style.cssText = `
				text-align: center;
				padding: 12px;
				color: var(--text-accent);
				cursor: pointer;
				border: 1px solid var(--background-modifier-border);
				border-radius: 6px;
				background: var(--background-secondary);
				transition: all 0.2s ease;
			`;
			moreBtn.textContent = `查看更多 (共 ${totalLogs} 条)`;
			moreBtn.title = '点击查看完整日志';
			
			const clickHandler = () => {
				if (this.plugin && this.image.md5) {
					new LogViewerModal(this.app, this.plugin, this.image.md5).open();
				}
			};
			moreBtn.addEventListener('click', clickHandler);
			this.eventListeners.push({ element: moreBtn, event: 'click', handler: clickHandler });
		}
	}

	/**
	 * 渲染单条日志记录
	 */
	private renderSingleLogItem(historyLi: HTMLElement, log: any) {
		// 构建文本内容（按三行格式）
		const lines: string[] = [];
		const timeStr = new Date(log.timestamp).toLocaleString('zh-CN');
		const operationTypeStr = OperationTypeLabels[log.operation as OperationType] || log.operation;
			
			// 行1：时间
			lines.push(`${timeStr}`);
			
			// 检查消息中是否已经包含操作类型标签（如"重命名："、"移动："、"修改显示文本"等）
			// 注意：显示文本操作的消息格式是 "修改显示文本："..."，所以检查时包含冒号
			// 但实际消息格式可能是 "修改显示文本"（无冒号），所以也检查无冒号版本
			const hasOperationPrefix = log.message.includes('重命名：') || 
				log.message.includes('移动：') || 
				log.message.startsWith('修改显示文本') ||
				log.message.startsWith('添加显示文本') ||
				log.message.startsWith('移除显示文本');
			
			// 检查消息中是否已经包含更新链接和更新笔记信息
			const hasUpdateInfoInMessage = log.message.includes('更新链接：') || log.message.includes('更新笔记：');
			
			if (hasUpdateInfoInMessage) {
				// 如果消息中已经包含更新信息，直接显示完整消息（保留换行）
				if (hasOperationPrefix) {
					// 消息已经包含操作类型，直接显示
					lines.push(log.message);
				} else {
					// 消息没有操作类型，添加操作类型标签
					lines.push(`${operationTypeStr}：${log.message}`);
				}
			} else {
				// 如果消息中没有更新信息，只显示基础消息
				const baseMsg = (log.message || '').trim();
				if (baseMsg) {
					if (hasOperationPrefix) {
						// 消息已经包含操作类型，直接显示
						lines.push(baseMsg);
					} else {
						// 消息没有操作类型，添加操作类型标签
						lines.push(`${operationTypeStr}：${baseMsg}`);
					}
				}
				
				// 行3：更新笔记链接：1. A， 2. B（如果有，且消息中未包含）
				if (log.details && typeof log.details === 'object') {
					const details = log.details as Record<string, unknown>;
					if (Array.isArray(details.referencedFiles) && details.referencedFiles.length > 0) {
						const refs = details.referencedFiles as string[];
						const refsJoined = refs.map((p, i) => `${i + 1}. ${p}`).join('， ');
						lines.push(`更新笔记链接：${refsJoined}`);
					}
				}
			}
			
			// 简化结构：直接在 historyLi 上设置样式，不再嵌套额外的框
			const recordText = lines.join('\n');
			historyLi.style.cssText = `
				padding: 12px;
				margin-bottom: 0;
				font-size: 0.9em;
				color: var(--text-normal);
				line-height: 1.6;
				white-space: pre-wrap;
				word-break: break-word;
				user-select: text;
				cursor: pointer;
				background: var(--background-secondary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 6px;
				font-family: var(--font-text);
				transition: all 0.2s ease;
			`;
			historyLi.textContent = recordText;
			historyLi.title = '双击复制该条记录';
			
			// 添加 hover 效果
			const mouseenterHandler = () => {
				historyLi.style.backgroundColor = 'var(--background-modifier-hover)';
				historyLi.style.borderColor = 'var(--interactive-accent)';
			};
			const mouseleaveHandler = () => {
				historyLi.style.backgroundColor = 'var(--background-secondary)';
				historyLi.style.borderColor = 'var(--background-modifier-border)';
			};
			historyLi.addEventListener('mouseenter', mouseenterHandler);
			historyLi.addEventListener('mouseleave', mouseleaveHandler);
			this.eventListeners.push(
				{ element: historyLi, event: 'mouseenter', handler: mouseenterHandler },
				{ element: historyLi, event: 'mouseleave', handler: mouseleaveHandler }
			);
			
			// 添加双击复制功能
			const dblclickHandler = async () => {
				try {
					await navigator.clipboard.writeText(recordText);
					// 显示复制成功提示
					new Notice('已复制操作记录到剪贴板');
					
					// 临时显示复制成功视觉反馈
					const originalBg = historyLi.style.backgroundColor;
					const originalBorder = historyLi.style.borderColor;
					historyLi.style.backgroundColor = 'var(--interactive-accent)';
					historyLi.style.borderColor = 'var(--interactive-accent)';
					
					setTimeout(() => {
						historyLi.style.backgroundColor = originalBg;
						historyLi.style.borderColor = originalBorder;
					}, 500);
				} catch (error) {
					// 记录复制失败的错误
					if (this.plugin?.logger) {
						await this.plugin.logger.warn(OperationType.PLUGIN_ERROR, '复制操作记录到剪贴板失败', {
							error: error as Error
						});
					}
					// 如果 clipboard API 不可用，使用传统方法
					const textArea = document.createElement('textarea');
					textArea.value = recordText;
					textArea.style.position = 'fixed';
					textArea.style.opacity = '0';
					document.body.appendChild(textArea);
					textArea.select();
					try {
						document.execCommand('copy');
						new Notice('已复制操作记录到剪贴板');
					} catch (err) {
						// 记录传统复制方法也失败
						if (this.plugin?.logger) {
							await this.plugin.logger.warn(OperationType.PLUGIN_ERROR, '使用传统方法复制操作记录失败', {
								error: err as Error
							});
						}
						new Notice('复制失败，请重试');
					}
					document.body.removeChild(textArea);
				}
			};
			historyLi.addEventListener('dblclick', dblclickHandler);
			this.eventListeners.push({ element: historyLi, event: 'dblclick', handler: dblclickHandler });
	}

	/**
	 * 获取日志级别颜色
	 */
	private getLogLevelColor(level: string): string {
		switch (level) {
			case 'DEBUG': return '#6c757d';
			case 'INFO': return '#0d6efd';
			case 'WARNING': return '#ffc107';
			case 'ERROR': return '#dc3545';
			default: return '#6c757d';
		}
	}

	/**
	 * 启动自动刷新
	 */
	private startAutoRefresh() {
		// 启动自动刷新（每3秒）
		this.refreshInterval = window.setInterval(() => {
			this.renderHistory();
		}, 3000);
	}

	/**
	 * 更新图片
	 */
	updateImage(image: ImageInfo) {
		this.image = image;
		this.renderHistory();
	}

	/**
	 * 清理资源
	 */
	cleanup() {
		// 清理自动刷新定时器
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
			this.refreshInterval = undefined;
		}
		
		// 清理所有事件监听器
		for (const { element, event, handler } of this.eventListeners) {
			element.removeEventListener(event, handler);
		}
		this.eventListeners = [];
	}
}

