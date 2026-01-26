/**
 * 空链接检测模态框模块
 * 
 * 提供检测和显示笔记中空链接（指向不存在图片的链接）的功能。
 * 
 * 功能特性：
 * - 点击跳转：点击空链接跳转到笔记并选中链接
 * - 搜索过滤：支持搜索文件路径、链接文本
 * - 分类显示：区分网络链接错误和本地链接错误
 */

import { App, Modal, Notice, TFile } from 'obsidian';
import ImageManagementPlugin from '../main';
import { OperationType, LogEntry } from '../utils/logger';
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
 * - 支持搜索和过滤链接
 * - 点击链接跳转到对应笔记
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
	/** 当前搜索查询 */
	private searchQuery: string = '';
	/** 当前激活的过滤器ID */
	private activeFilterId: string | null = null;
	/** DOM元素缓存 */
	private cachedElements: Map<string, HTMLElement | null> = new Map();

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
		modalEl.style.minWidth = '500px';
		modalEl.style.maxWidth = '85%';
		modalEl.style.maxHeight = '90vh';
		
		// 设置内容区域样式，使其可以滚动
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.height = '100%';
		contentEl.style.overflow = 'hidden';
		contentEl.style.padding = '20px';
		contentEl.style.maxWidth = '100%';
		contentEl.style.boxSizing = 'border-box';

		// 启用模态框可调整大小
		makeModalResizable(modalEl, {
			minWidth: 500,
			minHeight: 500,
		});

		// 标题和工具栏
		const headerContainer = contentEl.createDiv();
		headerContainer.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-shrink: 0; gap: 12px;';
		
		const title = headerContainer.createEl('h2', { text: '🈳 空链接的图片链接' });
		title.style.margin = '0';
		title.style.flex = '1';
		
		// 工具栏按钮组
		const toolbar = headerContainer.createDiv();
		toolbar.style.cssText = 'display: flex; gap: 8px; align-items: center;';
		
		// 刷新按钮
		const refreshBtn = toolbar.createEl('button', { text: '🔄 刷新' });
		refreshBtn.style.cssText = `
			padding: 6px 12px;
			border-radius: 4px;
			border: 1px solid var(--background-modifier-border);
			background: var(--background-secondary);
			color: var(--text-normal);
			cursor: pointer;
			font-size: 0.85em;
			transition: all 0.2s ease;
		`;
		refreshBtn.addEventListener('click', async () => {
			if (this.isDetecting) {
				new Notice('正在检测中，请稍候...');
				return;
			}
			// 清空缓存和列表
			this.brokenLinks = [];
			this.enhancedLinks = [];
			this.searchQuery = '';
			// 重新检测
			const contentArea = contentEl.querySelector('div[style*="flex-direction: column"]') as HTMLElement;
			if (contentArea) {
				contentArea.empty();
				await this.detectBrokenLinks(contentArea);
			}
		});
		refreshBtn.addEventListener('mouseenter', () => {
			refreshBtn.style.background = 'var(--background-modifier-hover)';
		});
		refreshBtn.addEventListener('mouseleave', () => {
			refreshBtn.style.background = 'var(--background-secondary)';
		});
		

		// 创建内容区域（包含统计信息和列表）
		const contentArea = contentEl.createDiv();
		contentArea.style.flex = '1';
		contentArea.style.display = 'flex';
		contentArea.style.flexDirection = 'column';
		contentArea.style.overflow = 'hidden';
		
		// 添加搜索框
		const searchContainer = contentArea.createDiv();
		searchContainer.style.cssText = 'margin-bottom: 12px; flex-shrink: 0;';
		
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: '🔍 搜索文件路径、链接文本...',
			cls: 'broken-links-search-input'
		});
		searchInput.style.cssText = `
			width: 100%;
			padding: 8px 12px;
			border: 1px solid var(--background-modifier-border);
			border-radius: 6px;
			background: var(--background-secondary);
			color: var(--text-normal);
			font-size: 0.9em;
			box-sizing: border-box;
		`;
		
		// 搜索防抖
		let searchTimeout: NodeJS.Timeout | null = null;
		searchInput.addEventListener('input', (e) => {
			const query = (e.target as HTMLInputElement).value.trim();
			this.searchQuery = query;
			
			if (searchTimeout) {
				clearTimeout(searchTimeout);
			}
			
			searchTimeout = setTimeout(() => {
				this.filterAndRenderLinks();
			}, 300);
		});
		

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

		for (const link of newEnhancedLinks) {
			if (link.isRemoteError) {
				remoteErrors.push(link);
			} else {
				localErrors.push(link);
			}
		}

		// 更新按钮计数
		const filterGroups = [
			{ id: 'remote', title: '🌐 网络链接错误', links: remoteErrors },
			{ id: 'local', title: '📁 本地链接错误', links: localErrors }
		];

		for (const group of filterGroups) {
			if (group.links.length === 0) continue;

			// 查找对应的按钮并更新计数
			const button = this.listContainer.querySelector(`[data-filter-id="${group.id}"]`) as HTMLElement;
			if (button) {
				const currentCount = parseInt(button.textContent?.match(/\((\d+)\)/)?.[1] || '0');
				button.textContent = `${group.title} (${currentCount + group.links.length})`;
			}
		}

		// 如果当前显示的是对应的分类，直接添加到内容容器
		const contentContainer = this.listContainer.querySelector('.broken-links-content-container') as HTMLElement;
		if (contentContainer) {
			// 获取当前激活的过滤器ID
			const activeButton = this.listContainer.querySelector('.broken-links-filter-btn[style*="interactive-accent"]') as HTMLElement;
			const activeFilterId = activeButton?.getAttribute('data-filter-id');

			// 根据当前激活的过滤器添加对应的链接
			if (activeFilterId === 'remote' && remoteErrors.length > 0) {
				for (const link of remoteErrors) {
					this.renderLinkItem(contentContainer, link);
				}
			} else if (activeFilterId === 'local' && localErrors.length > 0) {
				for (const link of localErrors) {
					this.renderLinkItem(contentContainer, link);
				}
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

		const countText = `共找到 ${this.enhancedLinks.length} 个空链接的图片`;
		statsEl.textContent = countText;
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

		// 显示总数（添加 class 以便后续更新）
		const countText = `共找到 ${this.enhancedLinks.length} 个空链接的图片`;
		
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

		// 创建可滚动的内容容器（如果不存在）
		let scrollContainer = containerEl.querySelector('div[style*="overflow-y: auto"]') as HTMLElement;
		if (!scrollContainer) {
			scrollContainer = containerEl.createDiv();
			scrollContainer.style.flex = '1';
			scrollContainer.style.overflowY = 'auto';
			scrollContainer.style.overflowX = 'hidden';
			scrollContainer.style.width = '100%';
			scrollContainer.style.boxSizing = 'border-box';
		}

		// 创建列表容器（如果不存在，放在滚动容器内）
		let listContainer = scrollContainer.querySelector('.broken-links-list') as HTMLElement;
		if (!listContainer) {
			listContainer = scrollContainer.createDiv('broken-links-list');
			listContainer.style.border = '1px solid var(--background-modifier-border)';
			listContainer.style.borderRadius = '8px';
			listContainer.style.padding = '12px';
			listContainer.style.minHeight = '0';
			listContainer.style.width = 'fit-content';
			listContainer.style.minWidth = '100%';
			listContainer.style.maxWidth = '100%';
			listContainer.style.boxSizing = 'border-box';
		}
		this.listContainer = listContainer;

		// 按类型分组链接
		const remoteErrors: BrokenLinkInfo[] = [];
		const localErrors: BrokenLinkInfo[] = [];

		for (const link of this.enhancedLinks) {
			if (link.isRemoteError) {
				remoteErrors.push(link);
			} else {
				localErrors.push(link);
			}
		}

		// 定义分类组（只包含网络和本地两类）
		const filterGroups = [
			{ id: 'remote', title: '🌐 网络链接错误', links: remoteErrors, icon: '🌐' },
			{ id: 'local', title: '📁 本地链接错误', links: localErrors, icon: '📁' }
		];

		// 创建按钮组容器
		const buttonContainer = listContainer.createDiv('broken-links-filter-buttons');
		buttonContainer.style.cssText = `
			display: flex;
			gap: 8px;
			margin-bottom: 16px;
			flex-wrap: wrap;
			width: fit-content;
			max-width: 100%;
		`;

		// 创建内容容器（用于显示当前选中的分类）
		const contentContainer = listContainer.createDiv('broken-links-content-container');
		contentContainer.style.cssText = `
			min-height: 200px;
			width: fit-content;
			min-width: 100%;
			max-width: 100%;
			box-sizing: border-box;
		`;

		// 当前选中的分类ID（使用实例变量）
		this.activeFilterId = null;

		// 渲染分类内容（已改为在filterAndRenderLinks中处理）

		// 创建按钮并绑定点击事件
		for (const group of filterGroups) {
			// 如果没有链接，隐藏该按钮
			if (group.links.length === 0) continue;

			const button = buttonContainer.createEl('button', {
				text: `${group.title} (${group.links.length})`,
				cls: 'broken-links-filter-btn'
			});
			button.setAttribute('data-filter-id', group.id);
			button.style.cssText = `
				padding: 8px 16px;
				border-radius: 6px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-secondary);
				color: var(--text-normal);
				cursor: pointer;
				font-size: 0.9em;
				transition: all 0.2s ease;
				flex: 0 0 auto;
			`;

			// 点击切换
			button.addEventListener('click', () => {
				// 如果点击的是当前激活的按钮，不做任何操作
				if (this.activeFilterId === group.id) return;

				// 更新所有按钮状态
				const allButtons = buttonContainer.querySelectorAll('.broken-links-filter-btn');
				allButtons.forEach(btn => {
					(btn as HTMLElement).style.background = 'var(--background-secondary)';
					(btn as HTMLElement).style.borderColor = 'var(--background-modifier-border)';
					(btn as HTMLElement).style.color = 'var(--text-normal)';
				});

				// 激活当前按钮
				button.style.background = 'var(--interactive-accent)';
				button.style.borderColor = 'var(--interactive-accent)';
				button.style.color = 'var(--text-on-accent)';

				// 更新激活状态
				this.activeFilterId = group.id;

				// 渲染内容（应用搜索和排序）
				this.filterAndRenderLinks();
			});

			// 悬停效果
			button.addEventListener('mouseenter', () => {
				if (this.activeFilterId !== group.id) {
					button.style.background = 'var(--background-modifier-hover)';
				}
			});
			button.addEventListener('mouseleave', () => {
				if (this.activeFilterId !== group.id) {
					button.style.background = 'var(--background-secondary)';
				}
			});
		}

		// 默认激活第一个有内容的按钮
		const firstGroup = filterGroups.find(g => g.links.length > 0);
		if (firstGroup) {
			const firstButton = buttonContainer.querySelector(`[data-filter-id="${firstGroup.id}"]`) as HTMLElement;
			if (firstButton) {
				this.activeFilterId = firstGroup.id;
				firstButton.style.background = 'var(--interactive-accent)';
				firstButton.style.borderColor = 'var(--interactive-accent)';
				firstButton.style.color = 'var(--text-on-accent)';
				this.filterAndRenderLinks();
			}
		}

	}

	/**
	 * 渲染单个链接项
	 */
	private renderLinkItem(containerEl: HTMLElement, link: BrokenLinkInfo) {
		const linkItem = containerEl.createDiv('broken-link-item');
		linkItem.setAttribute('data-link-key', `${link.filePath}:${link.lineNumber}:${link.linkText}`);
		linkItem.style.padding = '12px';
		linkItem.style.marginBottom = '8px';
		linkItem.style.backgroundColor = 'var(--background-secondary)';
		linkItem.style.borderRadius = '6px';
		linkItem.style.border = '1px solid var(--background-modifier-border)';
		linkItem.style.width = 'fit-content';
		linkItem.style.minWidth = '100%';
		linkItem.style.maxWidth = '100%';
		linkItem.style.boxSizing = 'border-box';

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
				margin-top: 8px;
				padding: 8px 10px;
				background: var(--background-secondary-alt);
				border-left: 3px solid var(--text-error);
				border-radius: 4px;
				font-size: 0.85em;
			`;
			
			// 错误图标和文字
			const errorText = errorInfo.createSpan();
			errorText.style.cssText = `
				color: var(--text-error);
				font-weight: 500;
			`;
			errorText.textContent = `🌐 网络链接错误: `;
			
			const errorDetail = errorInfo.createSpan();
			errorDetail.style.cssText = `
				color: var(--text-muted);
			`;
			errorDetail.textContent = link.remoteError;
			
			// 显示链接地址
			if (link.extractedPath) {
				const urlInfo = mainContent.createDiv();
				urlInfo.style.cssText = `
					margin-top: 6px;
					padding-left: 10px;
					font-size: 0.8em;
					color: var(--text-muted);
					word-break: break-all;
					opacity: 0.8;
				`;
				urlInfo.textContent = `🔗 ${link.extractedPath}`;
			}
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
	 * 转义正则表达式特殊字符
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}


	/**
	 * 过滤和渲染链接（根据搜索查询和排序）
	 */
	private filterAndRenderLinks(): void {
		if (!this.listContainer) return;
		
		// 获取当前激活的过滤器对应的链接
		let baseLinks: BrokenLinkInfo[] = [];
		
		if (this.activeFilterId) {
			// 按类型分组链接
			const remoteErrors: BrokenLinkInfo[] = [];
			const localErrors: BrokenLinkInfo[] = [];
			
			for (const link of this.enhancedLinks) {
				if (link.isRemoteError) {
					remoteErrors.push(link);
				} else {
					localErrors.push(link);
				}
			}
			
			// 根据激活的过滤器选择对应的链接
			switch (this.activeFilterId) {
				case 'remote':
					baseLinks = remoteErrors;
					break;
				case 'local':
					baseLinks = localErrors;
					break;
				default:
					baseLinks = this.enhancedLinks;
			}
		} else {
			baseLinks = this.enhancedLinks;
		}
		
		// 应用搜索过滤
		let filteredLinks = baseLinks;
		if (this.searchQuery) {
			const query = this.searchQuery.toLowerCase();
			filteredLinks = baseLinks.filter(link => {
				const filePath = link.filePath.toLowerCase();
				const linkText = link.linkText.toLowerCase();
				const extractedPath = (link.extractedPath || '').toLowerCase();
				return filePath.includes(query) || linkText.includes(query) || extractedPath.includes(query);
			});
		}
		
		// 应用默认排序（按文件路径升序，然后按行号升序）
		filteredLinks.sort((a, b) => {
			// 先按文件路径排序
			const pathComparison = a.filePath.localeCompare(b.filePath);
			if (pathComparison !== 0) {
				return pathComparison;
			}
			// 如果文件路径相同，按行号排序
			return a.lineNumber - b.lineNumber;
		});
		
		// 重新渲染内容容器
		const contentContainer = this.listContainer.querySelector('.broken-links-content-container') as HTMLElement;
		if (contentContainer) {
			contentContainer.empty();
			
			if (filteredLinks.length === 0) {
				const emptyMsg = contentContainer.createDiv({
					text: this.searchQuery ? '没有找到匹配的链接' : '暂无链接',
					attr: { style: 'text-align: center; padding: 40px; color: var(--text-muted);' }
				});
			} else {
				for (const link of filteredLinks) {
					this.renderLinkItem(contentContainer, link);
				}
			}
		}
	}

	/**
	 * 获取缓存的DOM元素（避免重复查询）
	 */
	private getCachedElement(key: string, queryFn: () => HTMLElement | null): HTMLElement | null {
		if (this.cachedElements.has(key)) {
			const cached = this.cachedElements.get(key);
			if (cached && document.body.contains(cached)) {
				return cached;
			}
			this.cachedElements.delete(key);
		}
		
		const element = queryFn();
		this.cachedElements.set(key, element);
		return element;
	}

	/**
	 * 清除DOM缓存
	 */
	private clearCache(): void {
		this.cachedElements.clear();
	}

	onClose() {
		this.clearCache();
		const {contentEl} = this;
		contentEl.empty();
	}
}

