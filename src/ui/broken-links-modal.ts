/**
 * 空链接检测模态框模块
 * 
 * 提供检测和修复笔记中空链接（指向不存在图片的链接）的功能。
 * 支持从操作日志中恢复链接。
 * 
 * 功能特性：
 * - 点击跳转：点击空链接跳转到笔记并选中链接
 * - 智能恢复：从操作日志中查找重命名/移动记录，自动修复链接
 */

import { App, Modal, Notice, TFile } from 'obsidian';
import ImageManagementPlugin from '../main';
import { OperationType, LogEntry } from '../utils/logger';
import { parseWikiLink, buildWikiLink, WikiLinkParts } from '../utils/reference-manager';
import { makeModalResizable } from '../utils/resizable-modal';
import { makeModalResizable } from '../utils/resizable-modal';

/**
 * 恢复操作类型
 * - rename: 文件被重命名
 * - move: 文件被移动
 * - rename_and_move: 文件同时被重命名和移动
 */
type RecoveryType = 'rename' | 'move' | 'rename_and_move';

/**
 * 扩展的空链接信息接口
 * 
 * 包含空链接的详细信息和可能的恢复信息
 */
interface BrokenLinkInfo {
	filePath: string;
	lineNumber: number;
	linkText: string;
	/** 从链接中提取的文件名或路径 */
	extractedPath?: string;
	/** 是否为网络链接错误 */
	isRemoteError?: boolean;
	/** 网络链接错误信息（如 ERR_NAME_NOT_RESOLVED） */
	remoteError?: string;
	/** 可恢复的信息（从日志中找到的重命名/移动记录） */
	recoveryInfo?: {
		oldName: string;
		newName: string;
		oldPath: string;
		newPath: string;
		recoveryType: RecoveryType;
		logTimestamp: number;
		logEntry: LogEntry;
	};
}

/**
 * 空链接检测模态框类
 * 
 * 功能：
 * - 显示笔记中指向不存在图片的链接
 * - 从操作日志中查找可能的恢复信息
 * - 支持自动修复链接（基于重命名/移动记录）
 * - 支持手动删除空链接
 */
export class BrokenLinksModal extends Modal {
	/** 空链接列表（可选，如果提供则直接显示，否则需要检测） */
	brokenLinks?: Array<{filePath: string, lineNumber: number, linkText: string, extractedPath?: string, isRemoteError?: boolean, remoteError?: string}>;
	/** 插件实例 */
	plugin?: ImageManagementPlugin;
	/** 视图实例（用于调用检测方法） */
	view?: any;
	/** 增强后的链接信息（包含恢复信息） */
	private enhancedLinks: BrokenLinkInfo[] = [];
	/** 列表容器引用（用于实时添加新检测到的链接） */
	private listContainer?: HTMLElement;
	/** 是否正在检测中 */
	private isDetecting: boolean = false;

	constructor(
		app: App, 
		brokenLinks?: Array<{filePath: string, lineNumber: number, linkText: string, extractedPath?: string, isRemoteError?: boolean, remoteError?: string}>, 
		plugin?: ImageManagementPlugin,
		view?: any
	) {
		super(app);
		this.brokenLinks = brokenLinks;
		this.plugin = plugin;
		this.view = view;
	}

	/**
	 * 从日志中查找重命名/移动记录，匹配空链接
	 */
	private findRecoveryInfo(): void {
		if (!this.brokenLinks) {
			this.enhancedLinks = [];
			return;
		}
		
		if (!this.plugin?.logger) {
			this.enhancedLinks = this.brokenLinks.map(link => ({ ...link }));
			return;
		}

		// 获取所有重命名和移动日志（按时间倒序，最新的在前）
		const renameLogs = this.plugin.logger.query({
			operation: [OperationType.RENAME]
		});
		const moveLogs = this.plugin.logger.query({
			operation: [OperationType.MOVE]
		});
		
		// 合并并按时间排序（最新的在前，优先匹配最近的操作）
		const allLogs = [...renameLogs, ...moveLogs].sort((a, b) => b.timestamp - a.timestamp);

		this.enhancedLinks = this.brokenLinks.map(link => {
			const enhanced: BrokenLinkInfo = { ...link };

			// 从链接文本中提取文件名和完整路径
			const extracted = this.extractPathFromLink(link.linkText);
			if (!extracted) return enhanced;
			
			enhanced.extractedPath = extracted.fullPath;
			const linkFileName = extracted.fileName;
			const linkFullPath = extracted.fullPath;

			// 在日志中查找匹配的旧文件名或旧路径
			for (const log of allLogs) {
				const details = log.details;
				if (!details) continue;

				const oldName = details.oldName || '';
				const newName = details.newName || '';
				const oldPath = details.oldPath || '';
				const newPath = details.newPath || log.imagePath || '';

				// 多种匹配方式：
				// 1. 完整路径匹配（最精确）
				// 2. 文件名匹配（适用于简短链接格式）
				// 3. 相对路径匹配（适用于相对路径链接）
				let isMatch = false;
				
				// 完整路径匹配
				if (linkFullPath === oldPath) {
					isMatch = true;
				}
				// 文件名匹配
				else if (linkFileName === oldName) {
					isMatch = true;
				}
				// 相对路径匹配（链接路径以旧文件名结尾）
				else if (linkFullPath.endsWith('/' + oldName) || linkFullPath.endsWith('../' + oldName)) {
					isMatch = true;
				}

				if (isMatch && newPath) {
					// 检查新文件是否存在
					const newFile = this.app.vault.getAbstractFileByPath(newPath);
					if (newFile) {
						// 判断恢复类型
						let recoveryType: RecoveryType;
						const nameChanged = oldName !== newName;
						const pathChanged = oldPath !== newPath && oldName === newName;
						
						if (nameChanged && pathChanged) {
							recoveryType = 'rename_and_move';
						} else if (nameChanged) {
							recoveryType = 'rename';
						} else {
							recoveryType = 'move';
						}

						enhanced.recoveryInfo = {
							oldName,
							newName,
							oldPath,
							newPath,
							recoveryType,
							logTimestamp: log.timestamp,
							logEntry: log
						};
						break; // 找到最近的匹配就停止
					}
				}
			}

			return enhanced;
		});
	}

	/**
	 * 从链接文本中提取路径信息
	 * @returns 包含完整路径和文件名的对象，或 null
	 */
	private extractPathFromLink(linkText: string): { fullPath: string; fileName: string } | null {
		let fullPath: string | null = null;
		
		// Wiki 格式: ![[path]] 或 ![[path|text]] 或 [[path]]
		const wikiMatch = linkText.match(/!?\[\[([^\]|]+)/);
		if (wikiMatch) {
			fullPath = wikiMatch[1].trim();
		}
		// Markdown 格式: ![alt](path)
		else {
			const mdMatch = linkText.match(/!\[[^\]]*\]\(([^)]+)\)/);
			if (mdMatch) {
				fullPath = mdMatch[1].split('?')[0].trim(); // 去除查询参数
			}
			// HTML 格式: <img src="path">
			else {
				const htmlMatch = linkText.match(/src\s*=\s*["']([^"']+)["']/);
				if (htmlMatch) {
					fullPath = htmlMatch[1].split('?')[0].trim();
				}
			}
		}

		if (!fullPath) return null;

		// 提取文件名（去除路径前缀）
		const fileName = fullPath.split('/').pop() || fullPath;
		
		return { fullPath, fileName };
	}

	/**
	 * 从链接文本中提取文件名（兼容旧方法）
	 */
	private extractFileNameFromLink(linkText: string): string | null {
		const result = this.extractPathFromLink(linkText);
		return result ? result.fileName : null;
	}

	onOpen() {
		const {contentEl, modalEl} = this;

		contentEl.empty();
		modalEl.addClass('broken-links-modal');
		
		// 设置模态框样式 - 根据内容自适应宽度
		modalEl.style.width = 'auto';
		modalEl.style.minWidth = '600px';
		modalEl.style.maxWidth = '90%';
		modalEl.style.maxHeight = '90vh';
		
		// 设置内容区域样式，使其可以滚动
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.height = '100%';
		contentEl.style.overflow = 'hidden';
		contentEl.style.padding = '20px';

		// 启用模态框可调整大小
		makeModalResizable(modalEl, {
			minWidth: 700,
			minHeight: 500,
		});

		// 标题
		const title = contentEl.createEl('h2', { text: '🈳 空链接的图片链接' });
		title.style.flexShrink = '0';
		title.style.marginBottom = '16px';

		// 创建内容区域（包含统计信息和列表）
		const contentArea = contentEl.createDiv();
		contentArea.style.flex = '1';
		contentArea.style.display = 'flex';
		contentArea.style.flexDirection = 'column';
		contentArea.style.overflow = 'hidden';

		// 先加载并显示缓存的空链接
		const cachedLinks = this.plugin?.data.brokenLinks || [];
		if (cachedLinks.length > 0) {
			this.brokenLinks = cachedLinks as any;
			this.displayResults(contentArea, false); // false 表示这是缓存的，不是新检测的
		} else {
			// 如果没有缓存，先显示空状态
			const emptyEl = contentArea.createDiv({ 
				text: '暂无已检测的空链接', 
				attr: { style: 'text-align: center; padding: 40px; color: var(--text-muted);' }
			});
		}

		// 在后台继续检测新的空链接（增量更新）
		this.detectBrokenLinks(contentArea);
	}

	/**
	 * 检测空链接（后台自动检测，不显示提示）
	 */
	async detectBrokenLinks(containerEl: HTMLElement) {
		if (this.isDetecting) return; // 防止重复检测
		this.isDetecting = true;

		try {
			// 调用视图的检测方法（支持增量更新回调）
			if (this.view && typeof this.view.findBrokenImageLinks === 'function') {
				const newLinks = await this.view.findBrokenImageLinks();
				
				// 合并新旧链接（去重）
				const existingLinks = this.brokenLinks || [];
				const existingKeys = new Set(
					existingLinks.map(link => `${link.filePath}:${link.lineNumber}:${link.extractedPath || link.linkText}`)
				);
				
				const uniqueNewLinks = newLinks.filter(link => {
					const key = `${link.filePath}:${link.lineNumber}:${link.extractedPath || link.linkText}`;
					return !existingKeys.has(key);
				});

				// 如果有新链接，静默添加到列表
				if (uniqueNewLinks.length > 0) {
					// 更新 brokenLinks
					this.brokenLinks = [...existingLinks, ...uniqueNewLinks];
					
					// 实时添加到 UI（只添加新的）
					this.addLinksToUI(uniqueNewLinks);
					
					// 更新统计信息
					this.updateStats();
				}

				// 保存到插件数据
				if (this.plugin) {
					this.plugin.data.brokenLinks = this.brokenLinks as any;
					this.plugin.data.brokenLinksUpdatedAt = Date.now();
					await this.plugin.saveData(this.plugin.data);
				}
			} else {
				// 如果没有视图，静默失败（不显示错误，避免打扰用户）
				if (this.plugin?.logger) {
					await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '无法检测空链接：缺少视图实例', {});
				}
				this.isDetecting = false;
				return;
			}
		} catch (error) {
			// 静默处理错误，只记录日志
			if (this.plugin?.logger) {
				await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '检测空链接失败', {
					error: error as Error
				});
			}
		} finally {
			this.isDetecting = false;
		}
	}

	/**
	 * 添加新链接到 UI（增量更新）
	 */
	private addLinksToUI(newLinks: Array<{filePath: string, lineNumber: number, linkText: string, extractedPath?: string, isRemoteError?: boolean, remoteError?: string}>) {
		if (!this.listContainer || newLinks.length === 0) return;

		// 查找恢复信息（只对新链接）
		const tempBrokenLinks = this.brokenLinks;
		this.brokenLinks = newLinks;
		this.findRecoveryInfo();
		const newEnhancedLinks = this.enhancedLinks;
		this.brokenLinks = tempBrokenLinks;
		this.enhancedLinks = [...this.enhancedLinks, ...newEnhancedLinks];

		// 按类型分组新链接
		const remoteErrors: BrokenLinkInfo[] = [];
		const localErrors: BrokenLinkInfo[] = [];
		const recoverableLinks: BrokenLinkInfo[] = [];
		const nonRecoverableLinks: BrokenLinkInfo[] = [];

		for (const link of newEnhancedLinks) {
			if (link.isRemoteError) {
				remoteErrors.push(link);
			} else {
				localErrors.push(link);
			}
			
			if (link.recoveryInfo) {
				recoverableLinks.push(link);
			} else {
				nonRecoverableLinks.push(link);
			}
		}

		// 找到对应的分组容器并添加
		const groups = [
			{ title: '🌐 网络链接错误', links: remoteErrors, icon: '🌐' },
			{ title: '📁 本地链接错误', links: localErrors, icon: '📁' },
			{ title: '✅ 可恢复的链接', links: recoverableLinks, icon: '✅' },
			{ title: '❌ 不可恢复的链接', links: nonRecoverableLinks, icon: '❌' }
		];

		for (const group of groups) {
			if (group.links.length === 0) continue;

			// 查找或创建分组容器
			let groupContainer = this.listContainer.querySelector(`.broken-links-group[data-group="${group.title}"]`) as HTMLElement;
			
			if (!groupContainer) {
				// 创建新分组
				groupContainer = this.listContainer.createDiv('broken-links-group');
				groupContainer.setAttribute('data-group', group.title);
				groupContainer.style.cssText = 'margin-bottom: 16px;';

				// 创建分组标题
				const groupHeader = groupContainer.createDiv('broken-links-group-header');
				groupHeader.style.cssText = `
					display: flex;
					align-items: center;
					justify-content: space-between;
					padding: 8px 12px;
					background: var(--background-secondary);
					border-radius: 6px;
					margin-bottom: 8px;
					cursor: pointer;
					transition: all 0.2s ease;
				`;

				const headerLeft = groupHeader.createDiv();
				headerLeft.style.cssText = 'display: flex; align-items: center; gap: 8px; flex: 1;';

				const groupTitle = headerLeft.createSpan();
				groupTitle.style.cssText = 'font-weight: 600; font-size: 0.95em; color: var(--text-normal);';
				groupTitle.textContent = `${group.title} (${group.links.length})`;

				const collapseIcon = headerLeft.createSpan();
				collapseIcon.textContent = '▼';
				collapseIcon.style.cssText = 'font-size: 0.8em; color: var(--text-muted); transition: transform 0.2s ease;';

				const groupContent = groupContainer.createDiv('broken-links-group-content');
				groupContent.style.cssText = 'display: block;';

				let isExpanded = true;
				groupHeader.addEventListener('click', () => {
					isExpanded = !isExpanded;
					groupContent.style.display = isExpanded ? 'block' : 'none';
					collapseIcon.textContent = isExpanded ? '▼' : '▶';
				});

				groupHeader.addEventListener('mouseenter', () => {
					groupHeader.style.backgroundColor = 'var(--background-modifier-hover)';
				});
				groupHeader.addEventListener('mouseleave', () => {
					groupHeader.style.backgroundColor = 'var(--background-secondary)';
				});
			} else {
				// 更新分组标题中的数量
				const groupTitle = groupContainer.querySelector('.broken-links-group-header span') as HTMLElement;
				if (groupTitle) {
					const currentCount = parseInt(groupTitle.textContent?.match(/\((\d+)\)/)?.[1] || '0');
					groupTitle.textContent = `${group.title} (${currentCount + group.links.length})`;
				}
			}

			// 获取分组内容容器
			const groupContent = groupContainer.querySelector('.broken-links-group-content') as HTMLElement;
			if (!groupContent) continue;

			// 添加新链接到分组
			for (const link of group.links) {
				this.renderLinkItem(groupContent, link);
			}
		}
	}

	/**
	 * 更新统计信息
	 */
	private updateStats() {
		if (!this.listContainer) return;
		
		// 重新查找恢复信息（因为 enhancedLinks 可能已更新）
		this.findRecoveryInfo();
		
		const statsEl = this.listContainer.parentElement?.querySelector('.broken-links-stats') as HTMLElement;
		if (!statsEl) return;

		const recoverableCount = this.enhancedLinks.filter(l => l.recoveryInfo).length;
		const countText = recoverableCount > 0 
			? `共找到 ${this.enhancedLinks.length} 个空链接的图片，其中 ${recoverableCount} 个可恢复`
			: `共找到 ${this.enhancedLinks.length} 个空链接的图片`;
		statsEl.textContent = countText;

		// 更新一键恢复按钮
		const batchRecoverBtn = this.listContainer.parentElement?.querySelector('button.mod-cta') as HTMLElement;
		if (batchRecoverBtn && recoverableCount > 0) {
			batchRecoverBtn.textContent = `🔄 一键恢复全部 (${recoverableCount})`;
		} else if (recoverableCount === 0 && batchRecoverBtn) {
			batchRecoverBtn.remove();
		} else if (recoverableCount > 0 && !batchRecoverBtn) {
			// 创建一键恢复按钮
			const btn = this.listContainer.parentElement?.createEl('button', { 
				text: `🔄 一键恢复全部 (${recoverableCount})`,
				cls: 'mod-cta'
			});
			if (btn) {
				btn.style.cssText = `
					margin-bottom: 16px;
					padding: 8px 16px;
					border-radius: 6px;
					cursor: pointer;
					flex-shrink: 0;
				`;
				btn.addEventListener('click', async () => {
					await this.recoverAllLinks();
				});
				// 插入到统计信息后面
				statsEl.insertAdjacentElement('afterend', btn);
			}
		}
	}

	/**
	 * 显示检测结果
	 */
	displayResults(containerEl: HTMLElement, isNewDetection: boolean = true) {
		if (!this.brokenLinks) return;
		
		// 先查找恢复信息
		this.findRecoveryInfo();
		
		if (this.enhancedLinks.length === 0) {
			containerEl.createDiv({ 
				text: '🎉 恭喜！没有找到空链接的图片', 
				attr: { style: 'text-align: center; padding: 40px; color: var(--text-muted);' }
			});
			return;
		}

		// 统计可恢复的数量
		const recoverableCount = this.enhancedLinks.filter(l => l.recoveryInfo).length;

		// 显示总数和可恢复数量（添加 class 以便后续更新）
		const countText = recoverableCount > 0 
			? `共找到 ${this.enhancedLinks.length} 个空链接的图片，其中 ${recoverableCount} 个可恢复`
			: `共找到 ${this.enhancedLinks.length} 个空链接的图片`;
		
		// 查找或创建统计信息元素（放在内容区域顶部）
		let countEl = containerEl.querySelector('.broken-links-stats') as HTMLElement;
		if (!countEl) {
			countEl = containerEl.createEl('p', { 
				text: countText, 
				attr: { 
					style: 'color: var(--text-muted); margin-bottom: 16px; flex-shrink: 0;',
					class: 'broken-links-stats'
				}
			});
		} else {
			countEl.textContent = countText;
		}

		// 如果有可恢复的链接，显示一键恢复按钮
		let batchRecoverBtn = containerEl.querySelector('button.mod-cta') as HTMLElement;
		if (recoverableCount > 0) {
			if (!batchRecoverBtn) {
				batchRecoverBtn = containerEl.createEl('button', { 
					text: `🔄 一键恢复全部 (${recoverableCount})`,
					cls: 'mod-cta'
				});
				batchRecoverBtn.style.cssText = `
					margin-bottom: 16px;
					padding: 8px 16px;
					border-radius: 6px;
					cursor: pointer;
					flex-shrink: 0;
				`;
				batchRecoverBtn.addEventListener('click', async () => {
					await this.recoverAllLinks();
				});
			} else {
				batchRecoverBtn.textContent = `🔄 一键恢复全部 (${recoverableCount})`;
			}
		} else if (batchRecoverBtn) {
			batchRecoverBtn.remove();
		}

		// 创建可滚动的内容容器（如果不存在）
		let scrollContainer = containerEl.querySelector('div[style*="overflow-y: auto"]') as HTMLElement;
		if (!scrollContainer) {
			scrollContainer = containerEl.createDiv();
			scrollContainer.style.flex = '1';
			scrollContainer.style.overflowY = 'auto';
			scrollContainer.style.overflowX = 'hidden';
		}

		// 创建列表容器（如果不存在，放在滚动容器内）
		let listContainer = scrollContainer.querySelector('.broken-links-list') as HTMLElement;
		if (!listContainer) {
			listContainer = scrollContainer.createDiv('broken-links-list');
			listContainer.style.border = '1px solid var(--background-modifier-border)';
			listContainer.style.borderRadius = '8px';
			listContainer.style.padding = '12px';
			listContainer.style.minHeight = '0';
		}
		this.listContainer = listContainer;

		// 按类型分组链接
		const remoteErrors: BrokenLinkInfo[] = [];
		const localErrors: BrokenLinkInfo[] = [];
		const recoverableLinks: BrokenLinkInfo[] = [];
		const nonRecoverableLinks: BrokenLinkInfo[] = [];

		for (const link of this.enhancedLinks) {
			if (link.isRemoteError) {
				remoteErrors.push(link);
			} else {
				localErrors.push(link);
			}
			
			if (link.recoveryInfo) {
				recoverableLinks.push(link);
			} else {
				nonRecoverableLinks.push(link);
			}
		}

		// 创建分组并渲染（只显示非空分组）
		const groups = [
			{ title: '🌐 网络链接错误', links: remoteErrors, icon: '🌐' },
			{ title: '📁 本地链接错误', links: localErrors, icon: '📁' },
			{ title: '✅ 可恢复的链接', links: recoverableLinks, icon: '✅' },
			{ title: '❌ 不可恢复的链接', links: nonRecoverableLinks, icon: '❌' }
		];

		for (const group of groups) {
			// 只显示非空分组
			if (group.links.length === 0) continue;

			// 创建分组容器（添加 data-group 属性以便后续查找）
			const groupContainer = listContainer.createDiv('broken-links-group');
			groupContainer.setAttribute('data-group', group.title);
			groupContainer.style.cssText = `
				margin-bottom: 16px;
			`;

			// 分组标题
			const groupHeader = groupContainer.createDiv('broken-links-group-header');
			groupHeader.style.cssText = `
				display: flex;
				align-items: center;
				justify-content: space-between;
				padding: 8px 12px;
				background: var(--background-secondary);
				border-radius: 6px;
				margin-bottom: 8px;
				cursor: pointer;
				transition: all 0.2s ease;
			`;

			const headerLeft = groupHeader.createDiv();
			headerLeft.style.cssText = `
				display: flex;
				align-items: center;
				gap: 8px;
				flex: 1;
			`;

			const groupTitle = headerLeft.createSpan();
			groupTitle.style.cssText = `
				font-weight: 600;
				font-size: 0.95em;
				color: var(--text-normal);
			`;
			groupTitle.textContent = `${group.title} (${group.links.length})`;

			const collapseIcon = headerLeft.createSpan();
			collapseIcon.textContent = '▼';
			collapseIcon.style.cssText = `
				font-size: 0.8em;
				color: var(--text-muted);
				transition: transform 0.2s ease;
			`;

			// 分组内容
			const groupContent = groupContainer.createDiv('broken-links-group-content');
			groupContent.style.cssText = `
				display: block;
			`;

			// 折叠/展开功能
			let isExpanded = true;
			groupHeader.addEventListener('click', () => {
				isExpanded = !isExpanded;
				groupContent.style.display = isExpanded ? 'block' : 'none';
				collapseIcon.textContent = isExpanded ? '▼' : '▶';
			});

			// 悬停效果
			groupHeader.addEventListener('mouseenter', () => {
				groupHeader.style.backgroundColor = 'var(--background-modifier-hover)';
			});
			groupHeader.addEventListener('mouseleave', () => {
				groupHeader.style.backgroundColor = 'var(--background-secondary)';
			});

			// 为每个错误链接创建条目
			for (const link of group.links) {
				this.renderLinkItem(groupContent, link);
			}
		}
	}

	/**
	 * 渲染单个链接项
	 */
	private renderLinkItem(containerEl: HTMLElement, link: BrokenLinkInfo) {
		const linkItem = containerEl.createDiv('broken-link-item');
		linkItem.style.padding = '12px';
		linkItem.style.marginBottom = '8px';
		linkItem.style.backgroundColor = 'var(--background-secondary)';
		linkItem.style.borderRadius = '6px';
		linkItem.style.border = '1px solid var(--background-modifier-border)';

		// 主内容区域
		const mainContent = linkItem.createDiv();
		mainContent.style.cursor = 'pointer';

		// 文件信息
		const fileName = link.filePath.split('/').pop() || link.filePath;
		const fileInfo = mainContent.createDiv();
		fileInfo.style.fontWeight = '600';
		fileInfo.style.color = 'var(--text-accent)';
		fileInfo.style.marginBottom = '4px';
		fileInfo.textContent = `📄 ${fileName} (第 ${link.lineNumber} 行)`;

		// 链接内容
		const linkContent = mainContent.createDiv();
		linkContent.style.color = 'var(--text-normal)';
		linkContent.style.fontSize = '0.9em';
		linkContent.style.whiteSpace = 'pre-wrap';
		linkContent.style.wordBreak = 'break-all';
		linkContent.textContent = link.linkText;

		// 如果是网络链接错误，显示错误信息
		if (link.isRemoteError && link.remoteError) {
			const errorInfo = mainContent.createDiv();
			errorInfo.style.cssText = `
				margin-top: 6px;
				padding: 6px 8px;
				background: var(--background-modifier-error);
				color: var(--text-error);
				border-radius: 4px;
				font-size: 0.85em;
				font-family: monospace;
			`;
			errorInfo.textContent = `🌐 网络链接错误: ${link.remoteError}`;
			
			// 显示链接地址
			if (link.extractedPath) {
				const urlInfo = mainContent.createDiv();
				urlInfo.style.cssText = `
					margin-top: 4px;
					font-size: 0.8em;
					color: var(--text-muted);
					word-break: break-all;
				`;
				urlInfo.textContent = `链接: ${link.extractedPath}`;
			}
		}

		// 如果有恢复信息，显示恢复按钮
		if (link.recoveryInfo) {
			const recoverySection = linkItem.createDiv();
			recoverySection.style.cssText = `
				margin-top: 8px;
				padding-top: 8px;
				border-top: 1px dashed var(--background-modifier-border);
			`;

			// 恢复信息提示
			const recoveryInfo = recoverySection.createDiv();
			recoveryInfo.style.cssText = `
				font-size: 0.85em;
				color: var(--text-success);
				margin-bottom: 6px;
			`;
			
			// 根据恢复类型显示不同的提示
			const { recoveryType, oldName, newName, oldPath, newPath, logTimestamp } = link.recoveryInfo;
			const timeStr = new Date(logTimestamp).toLocaleString('zh-CN');
			let recoveryText = '';
			
			if (recoveryType === 'rename') {
				recoveryText = `✅ 可恢复 (重命名): <code>${oldName}</code> → <code>${newName}</code>`;
			} else if (recoveryType === 'move') {
				recoveryText = `✅ 可恢复 (移动): <code>${oldPath}</code> → <code>${newPath}</code>`;
			} else {
				recoveryText = `✅ 可恢复 (重命名+移动): <code>${oldName}</code> → <code>${newName}</code>`;
			}
			recoveryText += `<br><span style="color: var(--text-muted); font-size: 0.8em;">操作时间: ${timeStr}</span>`;
			recoveryInfo.innerHTML = recoveryText;

			// 按钮区域
			const btnSection = recoverySection.createDiv();
			btnSection.style.cssText = `
				display: flex;
				align-items: center;
				justify-content: flex-end;
				gap: 8px;
			`;

			// 恢复按钮
			const recoverBtn = btnSection.createEl('button', { text: '🔄 恢复链接' });
			recoverBtn.style.cssText = `
				padding: 4px 12px;
				border-radius: 4px;
				font-size: 0.85em;
				cursor: pointer;
				background-color: var(--interactive-accent);
				color: var(--text-on-accent);
				border: none;
				flex-shrink: 0;
			`;
			recoverBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				await this.recoverLink(link, linkItem);
			});
		}

		// 点击跳转到对应笔记
		mainContent.addEventListener('click', async () => {
			const file = this.app.vault.getAbstractFileByPath(link.filePath);
			if (file) {
				// 根据设置决定是否保持模态框打开
				const keepOpen = this.plugin?.settings.keepModalOpen || false;
				
				if (keepOpen) {
					// 保持模态框打开：在右侧堆叠面板打开笔记
					const newLeaf = this.app.workspace.splitActiveLeaf('vertical');
					if (newLeaf) {
						await newLeaf.openFile(file as TFile);
						// 滚动到指定行并选中链接
						setTimeout(async () => {
							const view = newLeaf.view;
							if (view && 'editor' in view) {
								const editor = (view as any).editor;
								if (editor && typeof editor.setSelection === 'function') {
									const line = link.lineNumber - 1;
									// 读取行内容，定位链接位置
									const content = await this.app.vault.read(file as TFile);
									const lines = content.split('\n');
									let ch = 0;
									if (line < lines.length && link.linkText) {
										const lineContent = lines[line];
										const linkIndex = lineContent.indexOf(link.linkText);
										if (linkIndex >= 0) ch = linkIndex;
									}
									const pos = { line, ch };
									const endPos = { line, ch: ch + (link.linkText?.length || 0) };
									editor.setSelection(pos, endPos);
								}
							}
						}, 300);
					}
				} else {
					// 关闭模态框：在当前标签页打开笔记
					const newLeaf = this.app.workspace.getLeaf(true);
					if (newLeaf) {
						await newLeaf.openFile(file as TFile);
						// 滚动到指定行并选中链接
						setTimeout(async () => {
							const view = newLeaf.view;
							if (view && 'editor' in view) {
								const editor = (view as any).editor;
								if (editor && typeof editor.setSelection === 'function') {
									const line = link.lineNumber - 1;
									// 读取行内容，定位链接位置
									const content = await this.app.vault.read(file as TFile);
									const lines = content.split('\n');
									let ch = 0;
									if (line < lines.length && link.linkText) {
										const lineContent = lines[line];
										const linkIndex = lineContent.indexOf(link.linkText);
										if (linkIndex >= 0) ch = linkIndex;
									}
									const pos = { line, ch };
									const endPos = { line, ch: ch + (link.linkText?.length || 0) };
									editor.setSelection(pos, endPos);
								}
							}
						}, 300);
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

	/**
	 * 恢复单个链接
	 */
	private async recoverLink(link: BrokenLinkInfo, linkItem: HTMLElement): Promise<boolean> {
		if (!link.recoveryInfo) return false;

		try {
			const file = this.app.vault.getAbstractFileByPath(link.filePath);
			if (!file || !(file instanceof TFile)) {
				new Notice('找不到笔记文件');
				return false;
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const lineIndex = link.lineNumber - 1;

			if (lineIndex < 0 || lineIndex >= lines.length) {
				new Notice('行号无效');
				return false;
			}

			const oldLine = lines[lineIndex];
			let newLine = oldLine;

			// 根据链接格式进行替换
			const { oldName, newName, oldPath, newPath, recoveryType } = link.recoveryInfo;
			let newLinkText = '';

			// Wiki 格式
			if (link.linkText.includes('[[')) {
				const parsed = parseWikiLink(link.linkText);
				const newParts: WikiLinkParts = {
					path: newPath,
					displayText: parsed.displayText,
					width: parsed.width,
					height: parsed.height
				};
				const hasExclam = link.linkText.startsWith('!');
				newLinkText = buildWikiLink(newParts, hasExclam);
				newLine = oldLine.replace(link.linkText, newLinkText);
			}
			// Markdown 格式
			else if (link.linkText.match(/!\[[^\]]*\]\([^)]+\)/)) {
				const altMatch = link.linkText.match(/!\[([^\]]*)\]/);
				const alt = altMatch ? altMatch[1] : '';
				newLinkText = `![${alt}](${newPath})`;
				newLine = oldLine.replace(link.linkText, newLinkText);
			}
			// HTML 格式
			else if (link.linkText.includes('<img')) {
				newLinkText = link.linkText.replace(
					new RegExp(`src\\s*=\\s*["'][^"']*["']`),
					`src="${newPath}"`
				);
				newLine = oldLine.replace(link.linkText, newLinkText);
			}

			if (newLine !== oldLine) {
				lines[lineIndex] = newLine;
				await this.app.vault.modify(file, lines.join('\n'));

				// 构建详细的日志消息
				let logMessage = `恢复链接: ${newName}`;
				
				// 恢复类型说明
				if (recoveryType === 'rename') {
					logMessage += `\n恢复原因: 文件重命名 (${oldName} → ${newName})`;
				} else if (recoveryType === 'move') {
					logMessage += `\n恢复原因: 文件移动 (${oldPath} → ${newPath})`;
				} else {
					logMessage += `\n恢复原因: 文件重命名+移动 (${oldName} → ${newName})`;
				}
				
				logMessage += `\n更新链接: ${link.linkText} → ${newLinkText}`;
				logMessage += `\n更新笔记: ${link.filePath} (第${link.lineNumber}行)`;

				// 记录日志
				if (this.plugin?.logger) {
					await this.plugin.logger.info(
						OperationType.UPDATE_REFERENCE,
						logMessage,
						{
							imagePath: newPath,
							imageName: newName,
							details: {
								recoveryType: recoveryType,
								notePath: link.filePath,
								lineNumber: link.lineNumber,
								oldLink: link.linkText,
								newLink: newLinkText,
								oldImagePath: oldPath,
								newImagePath: newPath,
								oldImageName: oldName,
								newImageName: newName,
								originalLogTimestamp: link.recoveryInfo.logTimestamp
							}
						}
					);
				}

				// 更新 UI
				linkItem.style.opacity = '0.5';
				linkItem.style.pointerEvents = 'none';
				const successBadge = linkItem.createDiv();
				successBadge.style.cssText = `
					position: absolute;
					top: 50%;
					left: 50%;
					transform: translate(-50%, -50%);
					background: var(--background-modifier-success);
					color: var(--text-on-accent);
					padding: 4px 12px;
					border-radius: 4px;
					font-weight: 600;
				`;
				successBadge.textContent = '✓ 已恢复';
				linkItem.style.position = 'relative';

				new Notice(`已恢复链接: ${oldName} → ${newName}`);
				return true;
			} else {
				new Notice('链接内容未变化，可能已被手动修复');
			}
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.error(OperationType.FIX_BROKEN_LINK, '恢复链接失败', {
					error: error instanceof Error ? error : new Error(String(error))
				});
			}
			new Notice(`恢复失败: ${error}`);
		}

		return false;
	}

	/**
	 * 一键恢复所有可恢复的链接
	 */
	private async recoverAllLinks(): Promise<void> {
		const recoverableLinks = this.enhancedLinks.filter(l => l.recoveryInfo);
		if (recoverableLinks.length === 0) {
			new Notice('没有可恢复的链接');
			return;
		}

		let successCount = 0;
		let failCount = 0;
		const recoveredDetails: Array<{
			notePath: string;
			lineNumber: number;
			oldLink: string;
			newLink: string;
			recoveryType: RecoveryType;
		}> = [];

		// 按文件分组，减少文件读写次数
		const linksByFile = new Map<string, BrokenLinkInfo[]>();
		for (const link of recoverableLinks) {
			const existing = linksByFile.get(link.filePath) || [];
			existing.push(link);
			linksByFile.set(link.filePath, existing);
		}

		for (const [filePath, links] of linksByFile) {
			try {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (!file || !(file instanceof TFile)) {
					failCount += links.length;
					continue;
				}

				const content = await this.app.vault.read(file);
				const lines = content.split('\n');
				let modified = false;

				// 按行号从大到小排序，避免行号偏移
				links.sort((a, b) => b.lineNumber - a.lineNumber);

				for (const link of links) {
					if (!link.recoveryInfo) continue;

					const lineIndex = link.lineNumber - 1;
					if (lineIndex < 0 || lineIndex >= lines.length) {
						failCount++;
						continue;
					}

					const oldLine = lines[lineIndex];
					let newLine = oldLine;
					const { oldName, newName, oldPath, newPath, recoveryType } = link.recoveryInfo;
					let newLinkText = '';

					// Wiki 格式
					if (link.linkText.includes('[[')) {
						const parsed = parseWikiLink(link.linkText);
						const newParts: WikiLinkParts = {
							path: newPath,
							displayText: parsed.displayText,
							width: parsed.width,
							height: parsed.height
						};
						const hasExclam = link.linkText.startsWith('!');
						newLinkText = buildWikiLink(newParts, hasExclam);
						newLine = oldLine.replace(link.linkText, newLinkText);
					}
					// Markdown 格式
					else if (link.linkText.match(/!\[[^\]]*\]\([^)]+\)/)) {
						const altMatch = link.linkText.match(/!\[([^\]]*)\]/);
						const alt = altMatch ? altMatch[1] : '';
						newLinkText = `![${alt}](${newPath})`;
						newLine = oldLine.replace(link.linkText, newLinkText);
					}
					// HTML 格式
					else if (link.linkText.includes('<img')) {
						newLinkText = link.linkText.replace(
							new RegExp(`src\\s*=\\s*["'][^"']*["']`),
							`src="${newPath}"`
						);
						newLine = oldLine.replace(link.linkText, newLinkText);
					}

					if (newLine !== oldLine) {
						lines[lineIndex] = newLine;
						modified = true;
						successCount++;
						recoveredDetails.push({
							notePath: filePath,
							lineNumber: link.lineNumber,
							oldLink: link.linkText,
							newLink: newLinkText,
							recoveryType: recoveryType
						});
					} else {
						failCount++;
					}
				}

				if (modified) {
					await this.app.vault.modify(file, lines.join('\n'));
				}
			} catch (error) {
				if (this.plugin?.logger) {
					await this.plugin.logger.error(OperationType.FIX_BROKEN_LINK, `恢复文件 ${filePath} 中的链接失败`, {
						filePath,
						error: error instanceof Error ? error : new Error(String(error))
					});
				}
				failCount += links.length;
			}
		}

		// 构建详细的日志消息
		let logMessage = `批量恢复空链接: 成功 ${successCount} 个，失败 ${failCount} 个`;
		if (recoveredDetails.length > 0) {
			// 按笔记分组显示
			const byNote = new Map<string, typeof recoveredDetails>();
			for (const detail of recoveredDetails) {
				const existing = byNote.get(detail.notePath) || [];
				existing.push(detail);
				byNote.set(detail.notePath, existing);
			}
			
			const noteList = Array.from(byNote.entries()).map(([notePath, details], index) => {
				const lineNumbers = details.map(d => d.lineNumber).join(', ');
				return `${index + 1}. ${notePath} (第${lineNumbers}行)`;
			}).join('\n');
			logMessage += `\n更新笔记:\n${noteList}`;
		}

		// 记录日志
		if (this.plugin?.logger) {
			await this.plugin.logger.info(
				OperationType.UPDATE_REFERENCE,
				logMessage,
				{
					details: {
						successCount,
						failCount,
						totalCount: recoverableLinks.length,
						affectedNotes: Array.from(linksByFile.keys()),
						recoveredLinks: recoveredDetails.map(d => ({
							notePath: d.notePath,
							lineNumber: d.lineNumber,
							oldLink: d.oldLink,
							newLink: d.newLink,
							recoveryType: d.recoveryType
						}))
					}
				}
			);
		}

		new Notice(`恢复完成！成功 ${successCount} 个，失败 ${failCount} 个`);

		// 刷新模态框
		this.close();
	}

	/**
	 * 转义正则表达式特殊字符
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

