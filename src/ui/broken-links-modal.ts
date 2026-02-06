/**
 * 空链接检测模态框模块 - 网络图片错误显示系统
 * 
 * 提供完整的错误检测和显示功能，包括：
 * - 智能错误分类：网络错误、本地链接错误等
 * - 错误聚合显示：避免重复提示，提高信息密度
 * - 错误上下文信息：详细错误诊断和修复建议
 * - 实时错误更新：支持增量检测和动态更新
 * 
 * 技术特性：
 * - 错误缓存机制：避免重复检测相同错误
 * - 智能错误恢复：自动识别重命名/移动导致的链接错误
 * - 用户体验优化：清晰的错误分类和直观的交互设计
 * 
 * @version 1.0.0
 * @module broken-links-modal
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
	/** 黑名单缓存，避免重复从IndexedDB加载 */
	private blacklistCache: any[] | null = null;
	/** 是否已经渲染过主 UI（避免异步刷新时重复初始化布局） */
	private hasRenderedUI: boolean = false;

	/** 禁用默认的自动聚焦行为 */
	shouldRestoreSelection = false;

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
	 * 快速构建基础链接信息（不做日志匹配与黑名单读取）
	 * 目的：首次打开时立刻渲染完整 UI，避免出现“只有标题+搜索框”的空壳画面。
	 */
	private buildEnhancedLinksFast(): void {
		if (!this.brokenLinks) {
			this.enhancedLinks = [];
			return;
		}
		this.enhancedLinks = this.brokenLinks.map(link => ({ ...link }));
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
		
		// 设置模态框样式 - 固定宽度
		modalEl.style.width = '700px';
		modalEl.style.minWidth = '700px';
		modalEl.style.maxWidth = '700px';
		modalEl.style.maxHeight = '85vh';
		
		// 先查找恢复信息
		this.findRecoveryInfo();
		
		// 设置内容区域样式，使其可以滚动
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.height = '100%';
		contentEl.style.overflow = 'hidden';
		contentEl.style.padding = '24px';
		contentEl.style.maxWidth = '100%';
		contentEl.style.boxSizing = 'border-box';

		// 启用模态框可调整大小
		makeModalResizable(modalEl, {
			minWidth: 600,
			minHeight: 500,
		});

		// ========== 头部区域 ==========
		const headerContainer = contentEl.createDiv('broken-links-header');
		headerContainer.style.cssText = `
			margin-bottom: 20px;
			flex-shrink: 0;
		`;
		
		const title = headerContainer.createEl('h2', { text: '🈳 空链接的图片链接' });
		title.style.cssText = `
			margin: 0 0 6px 0;
			font-size: 1.4em;
			font-weight: 600;
			color: var(--text-normal);
		`;
		
		const subtitle = headerContainer.createEl('p', { text: '检测笔记中引用不存在的本地图片，以及失效的网络图片链接' });
		subtitle.style.cssText = `
			margin: 0;
			font-size: 0.85em;
			color: var(--text-muted);
		`;

		// ========== 搜索框区域 ==========
		const searchContainer = contentEl.createDiv('broken-links-search-container');
		searchContainer.style.cssText = `
			margin: 10px 0;
			flex-shrink: 0;
			position: relative;
			padding: 0 6px;
		`;
		
		const searchWrapper = searchContainer.createDiv();
		searchWrapper.style.cssText = `
			position: relative;
			display: flex;
			align-items: center;
		`;
		
		// 搜索图标
		const searchIcon = searchWrapper.createEl('span', { text: '🔍' });
		searchIcon.style.cssText = `
			position: absolute;
			left: 12px;
			font-size: 0.9em;
			opacity: 0.6;
			pointer-events: none;
		`;
		
		const searchInput = searchWrapper.createEl('input', {
			type: 'text',
			placeholder: '搜索文件路径、链接文本...',
			cls: 'broken-links-search-input'
		});
		searchInput.style.cssText = `
			width: 100%;
			padding: 6px 8px 6px 32px;
			border: none;
			border-bottom: 2px solid var(--background-modifier-border);
			border-radius: 6px;
			background: var(--background-primary);
			color: var(--text-normal);
			font-size: 0.95em;
			box-sizing: border-box;
			transition: all 0.2s ease;
		`;
		
		// 搜索框聚焦效果（不自动聚焦）
		searchInput.addEventListener('focus', () => {
			searchInput.style.borderBottomColor = 'var(--interactive-accent)';
		});
		searchInput.addEventListener('blur', () => {
			searchInput.style.borderBottomColor = 'var(--background-modifier-border)';
		});
		
		// 移除自动聚焦
		searchInput.autofocus = false;
		
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

		// ========== 内容区域 ==========
		const contentArea = contentEl.createDiv('broken-links-content-area');
		contentArea.style.cssText = `
			flex: 1;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		`;

		// 标签容器（固定不滚动）
		const tabsContainer = contentArea.createDiv('broken-links-tabs-container');
		tabsContainer.style.cssText = `
			flex-shrink: 0;
			margin-bottom: 12px;
			padding: 0 6px;
		`;

		// 可滚动内容区域
		const scrollContainer = contentArea.createDiv('broken-links-scroll-container');
		scrollContainer.style.cssText = `
			flex: 1;
			overflow-y: scroll;
			overflow-x: hidden;
			width: 100%;
			box-sizing: border-box;
		`;

		// 保存引用供后续使用
		(this as any).tabsContainer = tabsContainer;
		(this as any).scrollContainer = scrollContainer;
		
		// 优先使用缓存数据：如果已经有缓存的空链接，直接渲染列表，避免多余的“加载中”画面
		const cachedLinks = this.plugin?.data.brokenLinks || [];
		if (cachedLinks.length > 0) {
			this.brokenLinks = cachedLinks as any;
			// 不必等待异步部分完成即可开始渲染，减少首屏空白时间
			void this.displayResults(contentArea, false);
		} else {
			// 只有在没有任何缓存时才显示加载状态
			this.displayLoadingState(contentArea);
		}
		
		// 在后台继续检测新的空链接（增量更新）
		this.detectBrokenLinks(contentArea);
	}

	/**
	 * 显示加载状态
	 */
	private displayLoadingState(containerEl: HTMLElement): void {
		const loadingEl = containerEl.createDiv('broken-links-loading');
		loadingEl.style.cssText = `
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			padding: 60px 40px;
			color: var(--text-muted);
			gap: 16px;
		`;
		
		const spinner = loadingEl.createEl('div');
		spinner.style.cssText = `
			width: 32px;
			height: 32px;
			border: 3px solid var(--background-modifier-border);
			border-top-color: var(--interactive-accent);
			border-radius: 50%;
			animation: broken-links-spin 1s linear infinite;
		`;
		
		// 添加动画样式
		const style = document.createElement('style');
		style.textContent = `
			@keyframes broken-links-spin {
				to { transform: rotate(360deg); }
			}
		`;
		document.head.appendChild(style);
		
		loadingEl.createEl('p', { text: '正在扫描笔记中的图片链接...' });
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
				
				const uniqueNewLinks = newLinks.filter((link: {filePath: string, lineNumber: number, extractedPath?: string, linkText: string}) => {
					const key = `${link.filePath}:${link.lineNumber}:${link.extractedPath || link.linkText}`;
					return !existingKeys.has(key);
				});

				// 如果有新链接，静默添加到列表
				if (uniqueNewLinks.length > 0) {
					// 给新增条目打上“进入列表时间”，用于顶部/底部插入策略 & 展示排序
					const baseDetectedAt = Date.now();
					const uniqueNewLinksWithDetectedAt = uniqueNewLinks.map((link: any, idx: number) => ({
						...link,
						detectedAt: typeof link.detectedAt === 'number' ? link.detectedAt : (baseDetectedAt + idx)
					}));

					const newItemPosition = (this.plugin?.settings?.brokenLinksNewItemPosition === 'top') ? 'top' : 'bottom';

					// 更新 brokenLinks
					this.brokenLinks = (newItemPosition === 'top')
						? [...uniqueNewLinksWithDetectedAt, ...existingLinks]
						: [...existingLinks, ...uniqueNewLinksWithDetectedAt];
					
					// 实时添加到 UI（只添加新的）
					this.addLinksToUI(uniqueNewLinksWithDetectedAt);
					
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
	 * 添加新链接到 UI（增量更新）- 选项卡布局
	 */
	private addLinksToUI(newLinks: Array<{filePath: string, lineNumber: number, linkText: string, extractedPath?: string, isRemoteError?: boolean, remoteError?: string, detectedAt?: number}>) {
		if (!this.listContainer || newLinks.length === 0) return;

		// 查找恢复信息（只对新链接）
		const tempBrokenLinks = this.brokenLinks;
		this.brokenLinks = newLinks;
		this.findRecoveryInfo();
		const newEnhancedLinks = this.enhancedLinks;
		this.brokenLinks = tempBrokenLinks;
		const newItemPosition = (this.plugin?.settings?.brokenLinksNewItemPosition === 'top') ? 'top' : 'bottom';
		this.enhancedLinks = (newItemPosition === 'top')
			? [...newEnhancedLinks, ...this.enhancedLinks]
			: [...this.enhancedLinks, ...newEnhancedLinks];

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

		// 更新选项卡计数
		const tabs = [
			{ id: 'local', links: localErrors },
			{ id: 'remote', links: remoteErrors }
		];

		for (const tab of tabs) {
			if (tab.links.length === 0) continue;

			const tabsContainer = (this as any).tabsContainer as HTMLElement;
			const tabEl = tabsContainer?.querySelector(`[data-tab-id="${tab.id}"]`) as HTMLElement;
			if (tabEl) {
				// 更新计数徽章
				const badge = tabEl.querySelector('.broken-link-count') as HTMLElement;
				if (badge) {
					const currentCount = parseInt(badge.textContent || '0');
					badge.textContent = String(currentCount + tab.links.length);
				}
				
				// 如果当前选项卡已激活，刷新内容
				if (this.activeFilterId === tab.id) {
					this.filterAndRenderLinks();
				}
			}
		}
	}

	/**
	 * 更新统计信息
	 */
	private updateStats() {
		if (!this.listContainer) return;
		
		// 重新查找恢复信息
		this.findRecoveryInfo();
	}

	/**
	 * 显示检测结果
	 */
	async displayResults(containerEl: HTMLElement, isNewDetection: boolean = true) {
		if (!this.brokenLinks) return;

		// 第一阶段：快速构建基础数据并立刻渲染 UI（不等待黑名单/日志匹配）
		this.buildEnhancedLinksFast();
		const blacklist = this.blacklistCache || [];
		
		if (this.enhancedLinks.length === 0 && blacklist.length === 0) {
			this.displayEmptyState(containerEl);
			return;
		}

		// 使用预先创建的容器
		const scrollContainer = (this as any).scrollContainer as HTMLElement;
		const tabsContainer = (this as any).tabsContainer as HTMLElement;
		
		if (!scrollContainer || !tabsContainer) return;

		// 清空旧内容（仅首次渲染或明确刷新时清空，避免异步更新导致闪烁）
		if (!this.hasRenderedUI || isNewDetection) {
			scrollContainer.empty();
			tabsContainer.empty();
		}

		// 创建列表容器（放在滚动容器内）
		if (!this.listContainer || !this.hasRenderedUI || isNewDetection) {
			const listContainer = scrollContainer.createDiv('broken-links-list');
			listContainer.style.cssText = `
				display: flex;
				flex-direction: column;
				gap: 12px;
				width: 100%;
				box-sizing: border-box;
			`;
			this.listContainer = listContainer;
		}

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

		// 定义分类组
		const filterGroups = [
			{ 
				id: 'local', 
				title: '本地链接', 
				links: localErrors, 
				icon: '📄',
				color: 'var(--text-accent)',
				disabled: false
			},
			{
				id: 'blacklist',
				title: '网络链接',
				// 即使黑名单数据尚未加载完成，也先创建分组，后续再用后台加载结果刷新
				links: blacklist as any,
				icon: '🌐',
				color: 'var(--text-accent)',
				// 当 blacklistCache 为空时视为“正在加载中”，按钮展示但禁用
				disabled: this.blacklistCache === null
			}
		];

		// 创建分类选项卡（并排显示，固定在顶部）
		let tabsInnerContainer = tabsContainer.querySelector('.broken-links-tabs') as HTMLElement | null;
		if (!tabsInnerContainer || !this.hasRenderedUI || isNewDetection) {
			tabsInnerContainer = tabsContainer.createDiv('broken-links-tabs');
			tabsInnerContainer.style.cssText = `
				display: flex;
				gap: 12px;
			`;
		}
		if (!tabsInnerContainer) return;
		const tabsInnerEl = tabsInnerContainer;

		// 创建内容区域
		let contentContainer = this.listContainer!.querySelector('.broken-links-tab-content') as HTMLElement | null;
		if (!contentContainer || !this.hasRenderedUI || isNewDetection) {
			contentContainer = this.listContainer!.createDiv('broken-links-tab-content');
			contentContainer.style.cssText = `
				min-height: 200px;
			`;
		}
		if (!contentContainer) return;
		const contentEl = contentContainer;

		// 当前选中的分类ID
		this.activeFilterId = null;

		// 创建分类选项卡（首次创建；之后只更新计数与内容，避免反复重建导致闪烁）
		for (const group of filterGroups) {

			const existingTab = tabsInnerContainer.querySelector(`[data-tab-id="${group.id}"]`) as HTMLElement | null;
			const tabCard = existingTab || tabsInnerContainer.createDiv('broken-links-tab');
			tabCard.setAttribute('data-tab-id', group.id);
			if (!existingTab) {
				tabCard.style.cssText = `
					flex: 1;
					background: var(--background-secondary);
					border: 1px solid var(--background-modifier-border);
					border-radius: 8px;
					padding: 10px 12px;
					cursor: pointer;
					transition: all 0.2s ease;
					display: flex;
					align-items: center;
					gap: 10px;
				`;
			}

			// 图标
			if (!existingTab) {
				const iconEl = tabCard.createEl('span', { text: group.icon });
				iconEl.style.fontSize = '1.2em';
			}

			// 标题
			if (!existingTab) {
				const titleText = tabCard.createEl('span', { text: group.title });
				titleText.style.cssText = `
					flex: 1;
					font-weight: 600;
					font-size: 0.9em;
					color: var(--text-normal);
				`;
			}

			// 数量徽章
			const countBadge = (tabCard.querySelector('.broken-link-count') as HTMLElement) || tabCard.createEl('span', { 
				text: String(group.links.length),
				cls: 'broken-link-count'
			});
			// 黑名单尚未加载完成时，用“…”提示，并禁用点击
			const isBlacklistTabLoading = group.id === 'blacklist' && this.blacklistCache === null;
			if (isBlacklistTabLoading) {
				countBadge.textContent = '…';
				tabCard.style.opacity = '0.6';
				tabCard.style.cursor = 'default';
			} else {
				countBadge.textContent = String(group.links.length);
				tabCard.style.opacity = '1';
				tabCard.style.cursor = 'pointer';
			}

			// 点击切换
			tabCard.addEventListener('click', () => {
				// 黑名单数据尚未加载完成时，按钮可见但不响应点击
				if (group.id === 'blacklist' && this.blacklistCache === null) return;
				if (this.activeFilterId === group.id) return;

				// 更新所有选项卡样式和徽章
				tabsInnerEl.querySelectorAll('.broken-links-tab').forEach((tabEl) => {
					const t = tabEl as HTMLElement;
					t.style.background = 'var(--background-secondary)';
					t.style.borderColor = 'var(--background-modifier-border)';
					// 重置所有徽章为无背景
					const badge = t.querySelector('.broken-link-count') as HTMLElement;
					if (badge) {
						badge.style.background = 'transparent';
						badge.style.color = 'var(--text-muted)';
					}
				});

				// 激活当前选项卡
				tabCard.style.background = 'var(--background-primary)';
				tabCard.style.borderColor = group.color;

				// 激活当前徽章
				countBadge.style.background = group.color;
				countBadge.style.color = 'white';

				// 更新激活状态
				this.activeFilterId = group.id;

				// 渲染内容
				if (group.id === 'blacklist') {
					// 始终使用最新的黑名单缓存作为数据源，避免使用初始化时的空 snapshot
					this.renderTabContent(contentEl, this.blacklistCache || [], 'blacklist');
				} else {
					this.renderTabContent(contentEl, group.links, group.id);
				}
			});

			// 悬停效果
			tabCard.addEventListener('mouseenter', () => {
				if (this.activeFilterId !== group.id) {
					tabCard.style.background = 'var(--background-modifier-hover)';
				}
			});
			tabCard.addEventListener('mouseleave', () => {
				if (this.activeFilterId !== group.id) {
					tabCard.style.background = 'var(--background-secondary)';
				}
			});

			// 默认激活第一个有内容的分类
			const firstGroup = filterGroups.find(g => g.links.length > 0);
			if (firstGroup && firstGroup.id === group.id) {
				this.activeFilterId = group.id;
				tabCard.style.background = 'var(--background-primary)';
				tabCard.style.borderColor = group.color;
				// 激活的徽章有背景色
				countBadge.style.background = group.color;
				countBadge.style.color = 'white';
				countBadge.style.fontSize = '0.7em';
				countBadge.style.padding = '2px 8px';
				countBadge.style.borderRadius = '10px';
				countBadge.style.flexShrink = '0';
				this.renderTabContent(contentEl, group.links, group.id);
			} else {
				// 未激活的徽章无背景色
				countBadge.style.background = 'transparent';
				countBadge.style.color = 'var(--text-muted)';
				countBadge.style.fontSize = '0.7em';
				countBadge.style.padding = '2px 8px';
				countBadge.style.borderRadius = '10px';
				countBadge.style.flexShrink = '0';
			}
		}

		this.hasRenderedUI = true;

		// 第二阶段（后台）：补齐恢复信息与黑名单数据，然后增量刷新 UI
		// 1) 补齐恢复信息（日志匹配）
		if (this.plugin?.logger) {
			setTimeout(() => {
				// 更新 enhancedLinks 中的 recoveryInfo
				this.findRecoveryInfo();
				// 仅在当前处于本地 tab 时刷新内容
				if (this.activeFilterId === 'local' && contentContainer) {
					this.renderTabContent(contentContainer, this.enhancedLinks.filter(l => !l.isRemoteError), 'local');
				}
			}, 0);
		}

		// 2) 补齐黑名单（IndexedDB）
		if (this.blacklistCache === null && this.plugin?.networkImageAPI) {
			(async () => {
				try {
					const loaded = await this.plugin!.networkImageAPI!.getBlacklist();
					this.blacklistCache = loaded || [];

					// 更新“网络链接”选项卡计数（如果存在）
					const tabsEl = tabsContainer.querySelector(`[data-tab-id="blacklist"]`) as HTMLElement | null;
					const badgeEl = tabsEl?.querySelector('.broken-link-count') as HTMLElement | null;
					if (tabsEl) {
						tabsEl.style.opacity = '1';
						tabsEl.style.cursor = 'pointer';
					}
					if (badgeEl) {
						badgeEl.textContent = String(this.blacklistCache.length);
					}

					// 如果当前正在看网络链接 tab，刷新内容
					if (this.activeFilterId === 'blacklist' && contentContainer) {
						this.renderTabContent(contentContainer, this.blacklistCache, 'blacklist');
					}
				} catch {
					// 静默失败
				}
			})();
		}
	}

	/**
	 * 渲染选项卡内容
	 */
	private renderTabContent(containerEl: HTMLElement, links: BrokenLinkInfo[] | any[], tabId: string): void {
		containerEl.empty();
		
		// 处理黑名单选项卡
		if (tabId === 'blacklist') {
			this.renderBlacklistContent(containerEl, links as any[]);
			return;
		}
		
		if (links.length === 0) {
			containerEl.createDiv({
				text: '暂无链接',
				attr: { style: 'text-align: center; padding: 40px; color: var(--text-muted);' }
			});
			return;
		}

		// 应用搜索过滤
		let filteredLinks = links as BrokenLinkInfo[];
		if (this.searchQuery) {
			const query = this.searchQuery.toLowerCase();
			filteredLinks = filteredLinks.filter(link => {
				const filePath = link.filePath.toLowerCase();
				const linkText = link.linkText.toLowerCase();
				const extractedPath = (link.extractedPath || '').toLowerCase();
				return filePath.includes(query) || linkText.includes(query) || extractedPath.includes(query);
			});
		}

		// 排序策略：
		// - 如果存在 detectedAt：按“新增链接位置”来决定新条目在顶部/底部
		// - 兼容旧数据（没有 detectedAt）：保持原来的按路径/行号排序
		const newItemPosition = (this.plugin?.settings?.brokenLinksNewItemPosition === 'top') ? 'top' : 'bottom';
		const hasDetectedAt = filteredLinks.some(l => typeof (l as any).detectedAt === 'number');
		filteredLinks.sort((a, b) => {
			if (hasDetectedAt) {
				const atA = (typeof (a as any).detectedAt === 'number') ? (a as any).detectedAt : 0;
				const atB = (typeof (b as any).detectedAt === 'number') ? (b as any).detectedAt : 0;
				if (atA !== atB) {
					return newItemPosition === 'top' ? (atB - atA) : (atA - atB);
				}
			}
			const pathComparison = a.filePath.localeCompare(b.filePath);
			if (pathComparison !== 0) return pathComparison;
			return a.lineNumber - b.lineNumber;
		});

		// 创建链接列表容器
		const linksContainer = containerEl.createDiv();
		linksContainer.style.cssText = `
			background: var(--background-primary);
			border-radius: 10px;
			padding: 6px 6px 0 6px;
		`;

		if (filteredLinks.length === 0) {
			linksContainer.createDiv({
				text: '没有找到匹配的链接',
				attr: { style: 'text-align: center; padding: 30px; color: var(--text-muted);' }
			});
		} else {
			for (const link of filteredLinks) {
				this.renderLinkItem(linksContainer, link);
			}
		}
	}

	/**
	 * 渲染网络链接内容
	 */
	private renderBlacklistContent(containerEl: HTMLElement, blacklist: any[]): void {
		if (blacklist.length === 0) {
			containerEl.createDiv({
				text: '暂无网络链接',
				attr: { style: 'text-align: center; padding: 40px; color: var(--text-muted);' }
			});
			return;
		}

		// 应用搜索过滤
		let filteredBlacklist = blacklist;
		if (this.searchQuery) {
			const query = this.searchQuery.toLowerCase();
			filteredBlacklist = blacklist.filter(item => {
				const url = (item.url || item.id || '').toLowerCase();
				const error = (item.errorMessage || item.reason || '').toLowerCase();
				return url.includes(query) || error.includes(query);
			});
		}

		// 排序：按 detectedAt 控制新条目在顶部/底部（没有 detectedAt 的视为 0）
		const newItemPosition = (this.plugin?.settings?.brokenLinksNewItemPosition === 'top') ? 'top' : 'bottom';
		filteredBlacklist = [...filteredBlacklist].sort((a, b) => {
			const atA = (typeof a?.detectedAt === 'number') ? a.detectedAt : 0;
			const atB = (typeof b?.detectedAt === 'number') ? b.detectedAt : 0;
			if (atA !== atB) {
				return newItemPosition === 'top' ? (atB - atA) : (atA - atB);
			}
			return String(a?.url || a?.id || '').localeCompare(String(b?.url || b?.id || ''));
		});

		// 创建链接列表容器
		const linksContainer = containerEl.createDiv();
		linksContainer.style.cssText = `
			background: var(--background-primary);
			border-radius: 10px;
			padding: 6px 6px 0 6px;
		`;

		if (filteredBlacklist.length === 0) {
			linksContainer.createDiv({
				text: '没有找到匹配的网络链接',
				attr: { style: 'text-align: center; padding: 30px; color: var(--text-muted);' }
			});
		} else {
			// 添加说明提示
			const infoTip = linksContainer.createDiv();
			infoTip.style.cssText = `
				padding: 8px 10px;
				margin-bottom: 8px;
				background: var(--background-secondary);
				border-radius: 6px;
				font-size: 0.8em;
				color: var(--text-muted);
				display: flex;
				align-items: center;
				gap: 6px;
			`;
			infoTip.innerHTML = `<span>插件通过缓存网络图片提高性能，当遇到链接失效时（404、DNS错误、连接超时等），会将该URL记录在此，点击🔄重新下载。</span>`;

			for (const item of filteredBlacklist) {
				this.renderBlacklistItem(linksContainer, item);
			}
		}
	}

	/**
	 * 渲染单个网络链接错误项
	 */
	private renderBlacklistItem(containerEl: HTMLElement, item: any) {
		const linkItem = containerEl.createDiv('blacklist-link-item');
		linkItem.setAttribute('data-url', item.url || item.id || '');
		linkItem.style.cssText = `
			padding: 6px;
			margin-bottom: 4px;
			background: var(--background-primary);
			border-radius: 8px;
			border: 1px solid var(--background-modifier-border);
			transition: all 0.2s ease;
			position: relative;
			width: 100%;
			box-sizing: border-box;
			overflow: hidden;
		`;

		// 主内容区域
		const mainContent = linkItem.createDiv();

		// 顶部行：错误类型和🔄按钮
		const headerRow = mainContent.createDiv();
		headerRow.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 8px;
		`;

		const iconEl = headerRow.createEl('span', { text: '🌐' });
		iconEl.style.fontSize = '0.9em';

		// URL
		const url = item.url || item.id || '';

		// 错误类型文字（普通文字显示）
		const errorType = item.errorMessage || item.reason || '链接失效';
		const errorText = headerRow.createEl('span', { text: errorType });
		errorText.style.cssText = `
			color: var(--text-muted);
			font-size: 0.85em;
			flex: 1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		`;

		// 🔄 重新缓存按钮
		const refreshBtn = headerRow.createEl('span', { text: '🔄' });
		refreshBtn.style.cssText = `
			font-size: 0.9em;
			cursor: pointer;
			padding: 4px 8px;
			border-radius: 4px;
			flex-shrink: 0;
			transition: all 0.15s ease;
		`;
		refreshBtn.title = '重新尝试缓存';

		refreshBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			refreshBtn.style.opacity = '0.5';
			refreshBtn.style.pointerEvents = 'none';
			refreshBtn.textContent = '⏳';
			
			try {
				// 1. 刷新网络图片扫描器的失效链接缓存，允许重新扫描该链接
				if (this.plugin?.networkImageScanner) {
					this.plugin.networkImageScanner.refreshBrokenUrlsCache();
				}
				
				// 2. 尝试验证图片链接是否可用
				const isValid = await this.validateImageUrl(url);
				
				if (isValid) {
					// 缓存成功，从列表中删除链接
					new Notice('图片缓存成功');

					// 尝试从 IndexedDB 黑名单中移除该 URL（统一黑名单：以 IndexedDB 为准）
					try {
						if (this.plugin?.networkImageAPI && url) {
							const { hashUrl } = await import('../network-image/utils');
							const urlId = await hashUrl(url);
							const cacheManager = (this.plugin.networkImageAPI as any).getCacheManager?.();
							const db = cacheManager?.['db'];
							if (db) {
								const tx = db.transaction(['blacklist'], 'readwrite');
								tx.objectStore('blacklist').delete(urlId);
							}
						}
					} catch {
						// 静默失败：不影响 UI 操作
					}
					
					linkItem.style.transition = 'all 0.3s ease';
					linkItem.style.opacity = '0';
					linkItem.style.transform = 'translateX(-20px)';
					setTimeout(() => {
						linkItem.remove();
						// 检查是否为空
						const remaining = containerEl.querySelectorAll('.blacklist-link-item');
						if (remaining.length === 0) {
							// 显示空状态
							containerEl.empty();
							containerEl.createDiv({
								text: '暂无网络链接',
								attr: { style: 'text-align: center; padding: 40px; color: var(--text-muted);' }
							});
						}
					}, 300);
				} else {
					// 缓存失败，提示错误
					new Notice('图片缓存失败：链接仍然不可用', 3000);
					
					// 恢复按钮状态
					refreshBtn.style.opacity = '1';
					refreshBtn.style.pointerEvents = 'auto';
					refreshBtn.textContent = '🔄';
				}
			} catch (error) {
				// 缓存失败，提示错误
				new Notice('图片缓存失败：' + (error instanceof Error ? error.message : '未知错误'), 3000);
				
				// 恢复按钮状态
				refreshBtn.style.opacity = '1';
				refreshBtn.style.pointerEvents = 'auto';
				refreshBtn.textContent = '🔄';
			}
		});

		refreshBtn.addEventListener('mouseenter', () => {
			refreshBtn.style.background = 'var(--background-secondary)';
			refreshBtn.style.transform = 'scale(1.1)';
		});
		refreshBtn.addEventListener('mouseleave', () => {
			refreshBtn.style.background = 'transparent';
			refreshBtn.style.transform = 'scale(1)';
		});

		// 链接内容（可选择复制）
		const linkContentWrapper = mainContent.createDiv();
		linkContentWrapper.style.cssText = `
			background: var(--background-secondary);
			border-radius: 6px;
			padding: 8px 10px;
			margin-top: 4px;
		`;

		const linkContent = linkContentWrapper.createEl('code');
		linkContent.style.cssText = `
			color: var(--text-normal);
			font-size: 0.85em;
			white-space: pre-wrap;
			word-break: break-all;
			font-family: var(--font-monospace);
			background: transparent;
			padding: 0;
			user-select: text;
			font-weight: normal;
		`;
		linkContent.textContent = url || '';

		// 如果黑名单记录中提供了来源信息，在网络错误列表中直接展示“出现位置”
		if (item.sourceFilePath) {
			const locationRow = mainContent.createDiv();
			locationRow.style.cssText = `
				margin-top: 6px;
				font-size: 0.8em;
				color: var(--text-muted);
				display: flex;
				flex-wrap: wrap;
				gap: 4px;
			`;

			const locationLabel = locationRow.createEl('span', { text: '出现位置：' });
			locationLabel.style.fontWeight = '500';

			const locationTextParts: string[] = [item.sourceFilePath];
			if (typeof item.line === 'number') {
				locationTextParts.push(`第 ${item.line + 1} 行`);
			}
			const locationText = locationRow.createEl('span', { text: locationTextParts.join(' · ') });
			locationText.style.wordBreak = 'break-all';
		}

		// 链接项悬停效果
		linkItem.addEventListener('mouseenter', () => {
			linkItem.style.borderColor = 'var(--interactive-accent)';
			linkItem.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
		});

		linkItem.addEventListener('mouseleave', () => {
			linkItem.style.borderColor = 'var(--background-modifier-border)';
			linkItem.style.boxShadow = 'none';
		});
	}

	/**
	 * 显示空状态
	 */
	private displayEmptyState(containerEl: HTMLElement): void {
		// 清除加载状态
		const loadingEl = containerEl.querySelector('.broken-links-loading');
		if (loadingEl) loadingEl.remove();

		let emptyEl = containerEl.querySelector('.broken-links-empty') as HTMLElement;
		if (!emptyEl) {
			emptyEl = containerEl.createDiv('broken-links-empty');
			emptyEl.style.cssText = `
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				padding: 60px 40px;
				gap: 16px;
			`;
			
			const iconEl = emptyEl.createEl('div', { text: '🎉' });
			iconEl.style.fontSize = '3em';
			
			const titleEl = emptyEl.createEl('h3', { text: '太棒了！' });
			titleEl.style.cssText = `
				margin: 0;
				color: var(--text-normal);
				font-size: 1.2em;
			`;
			
			const descEl = emptyEl.createEl('p', { text: '没有找到空链接的图片，所有图片链接都正常' });
			descEl.style.cssText = `
				margin: 0;
				color: var(--text-muted);
				text-align: center;
			`;
		}
	}

	/**
	 * 渲染单个链接项
	 */
	private renderLinkItem(containerEl: HTMLElement, link: BrokenLinkInfo) {
		const linkItem = containerEl.createDiv('broken-link-item');
		linkItem.setAttribute('data-link-key', `${link.filePath}:${link.lineNumber}:${link.linkText}`);
		linkItem.style.cssText = `
			padding: 6px;
			margin-bottom: 4px;
			background: var(--background-primary);
			border-radius: 8px;
			border: 1px solid var(--background-modifier-border);
			transition: all 0.2s ease;
			position: relative;
			width: 100%;
			box-sizing: border-box;
			overflow: hidden;
		`;

		// 主内容区域
		const mainContent = linkItem.createDiv();

		// 顶部行：完整文件路径和行号
		const headerRow = mainContent.createDiv();
		headerRow.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 10px;
		`;

		const fileIcon = headerRow.createEl('span', { text: '📄' });
		fileIcon.style.fontSize = '0.9em';

		// 分离路径和文件名
		const filePath = link.filePath;
		const fileName = filePath.split('/').pop() || filePath;
		const folderPath = filePath.substring(0, filePath.length - fileName.length);

		// 路径容器
		const pathContainer = headerRow.createDiv();
		pathContainer.style.cssText = `
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0;
			flex: 1;
		`;

		// 路径部分（普通颜色）
		if (folderPath) {
			const folderEl = pathContainer.createEl('span', { text: folderPath });
			folderEl.style.cssText = `
				font-size: 0.9em;
				color: var(--text-muted);
				word-break: break-all;
			`;
		}

		// 文件名部分（突出显示）
		const fileNameEl = pathContainer.createEl('span', { text: fileName });
		fileNameEl.style.cssText = `
			font-weight: 600;
			font-size: 0.9em;
			color: var(--text-accent);
			word-break: break-all;
		`;

		const lineBadge = headerRow.createEl('span', { text: `第 ${link.lineNumber} 行` });
		lineBadge.style.cssText = `
			background: var(--background-secondary);
			color: var(--text-muted);
			font-size: 0.75em;
			padding: 2px 8px;
			border-radius: 4px;
			margin-left: 8px;
			flex-shrink: 0;
			cursor: pointer;
			transition: all 0.15s ease;
		`;

		// 点击行号跳转到对应笔记
		lineBadge.addEventListener('click', async (e) => {
			e.stopPropagation();
			const file = this.app.vault.getAbstractFileByPath(link.filePath);
			if (file) {
				const keepOpen = this.plugin?.settings.keepModalOpen || false;
				
				if (keepOpen) {
					const newLeaf = this.app.workspace.splitActiveLeaf('vertical');
					if (newLeaf) {
						await newLeaf.openFile(file as TFile);
						setTimeout(async () => {
							const view = newLeaf.view;
							if (view && 'editor' in view) {
								const editor = (view as any).editor;
								if (editor && typeof editor.setSelection === 'function') {
									const line = link.lineNumber - 1;
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
					const newLeaf = this.app.workspace.getLeaf(true);
					if (newLeaf) {
						await newLeaf.openFile(file as TFile);
						setTimeout(async () => {
							const view = newLeaf.view;
							if (view && 'editor' in view) {
								const editor = (view as any).editor;
								if (editor && typeof editor.setSelection === 'function') {
									const line = link.lineNumber - 1;
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
						this.close();
					}
				}
			}
		});

		// 行号悬停效果
		lineBadge.addEventListener('mouseenter', () => {
			lineBadge.style.background = 'var(--interactive-accent)';
			lineBadge.style.color = 'var(--text-on-accent)';
		});
		lineBadge.addEventListener('mouseleave', () => {
			lineBadge.style.background = 'var(--background-secondary)';
			lineBadge.style.color = 'var(--text-muted)';
		});

		// 链接内容（可选择复制）
		const linkContentWrapper = mainContent.createDiv();
		linkContentWrapper.style.cssText = `
			background: var(--background-secondary);
			border-radius: 6px;
			padding: 10px 12px;
			margin-top: 4px;
		`;

		const linkContent = linkContentWrapper.createEl('code');
		linkContent.style.cssText = `
			color: var(--text-normal);
			font-size: 0.85em;
			white-space: pre-wrap;
			word-break: break-all;
			font-family: var(--font-monospace);
			background: transparent;
			padding: 0;
			user-select: text;
			font-weight: normal;
		`;
		linkContent.textContent = link.linkText;

		// 如果是网络链接错误，显示错误信息
		if (link.isRemoteError && link.remoteError) {
			const errorInfo = mainContent.createDiv();
			errorInfo.style.cssText = `
				margin-top: 10px;
				padding: 10px 12px;
				background: rgba(var(--text-error-rgb), 0.08);
				border: 1px solid rgba(var(--text-error-rgb), 0.2);
				border-radius: 6px;
				font-size: 0.85em;
			`;
			
			const errorHeader = errorInfo.createDiv();
			errorHeader.style.cssText = `
				display: flex;
				align-items: center;
				gap: 6px;
				margin-bottom: 4px;
			`;

			const errorIcon = errorHeader.createEl('span', { text: '⚠️' });
			errorIcon.style.fontSize = '0.9em';
			
			const errorText = errorHeader.createEl('span', { text: '网络错误' });
			errorText.style.cssText = `
				color: var(--text-error);
				font-weight: 500;
			`;
			
			const errorDetail = errorInfo.createEl('div', { text: link.remoteError });
			errorDetail.style.cssText = `
				color: var(--text-muted);
				font-size: 0.9em;
				padding-left: 22px;
			`;
			
			// 显示链接地址
			if (link.extractedPath) {
				const urlInfo = errorInfo.createEl('div', { text: link.extractedPath });
				urlInfo.style.cssText = `
					margin-top: 6px;
					padding: 6px 10px;
					background: var(--background-primary);
					border-radius: 4px;
					font-size: 0.85em;
					color: var(--text-muted);
					word-break: break-all;
					font-family: var(--font-monospace);
				`;
			}
		}

		// 链接项悬停效果
		linkItem.addEventListener('mouseenter', () => {
			linkItem.style.borderColor = 'var(--interactive-accent)';
			linkItem.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
		});

		linkItem.addEventListener('mouseleave', () => {
			linkItem.style.borderColor = 'var(--background-modifier-border)';
			linkItem.style.boxShadow = 'none';
		});
	}


	/**
	 * 转义正则表达式特殊字符
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}


	/**
	 * 过滤和渲染链接（根据搜索查询）- 选项卡布局
	 */
	private filterAndRenderLinks(): void {
		if (!this.listContainer || !this.activeFilterId) return;
		
		const contentContainer = this.listContainer.querySelector('.broken-links-tab-content') as HTMLElement;
		if (!contentContainer) return;
		
		// 处理黑名单选项卡
		if (this.activeFilterId === 'blacklist') {
			this.renderTabContent(contentContainer, this.blacklistCache || [], 'blacklist');
			return;
		}
		
		// 按类型分组并应用搜索过滤
		const localLinks = this.enhancedLinks.filter(l => !l.isRemoteError);
		
		let filteredLinks: BrokenLinkInfo[] = [];
		
		if (this.searchQuery) {
			const query = this.searchQuery.toLowerCase();
			const filterFn = (link: BrokenLinkInfo) => {
				const filePath = link.filePath.toLowerCase();
				const linkText = link.linkText.toLowerCase();
				const extractedPath = (link.extractedPath || '').toLowerCase();
				return filePath.includes(query) || linkText.includes(query) || extractedPath.includes(query);
			};
			filteredLinks = localLinks.filter(filterFn);
		} else {
			filteredLinks = localLinks;
		}
		
		// 重新渲染当前选项卡内容
		this.renderTabContent(contentContainer, filteredLinks, this.activeFilterId);
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
	 * 显示网络链接错误内容区域
	 */
	private async displayBlacklistSection(containerEl: HTMLElement): Promise<void> {
		try {
			let blacklist: any[] = [];
			
			if (this.blacklistCache !== null) {
				blacklist = this.blacklistCache;
			} else {
				if (this.plugin?.networkImageAPI) {
					blacklist = await this.plugin.networkImageAPI.getBlacklist();
				} else if ((this.plugin as any)?.cacheManager) {
					const cacheManager = (this.plugin as any).cacheManager;
					if (cacheManager?.db) {
						const tx = cacheManager.db.transaction(['blacklist'], 'readonly');
						const store = tx.objectStore('blacklist');
						blacklist = await new Promise((resolve, reject) => {
							const request = store.getAll();
							request.onsuccess = () => resolve(request.result || []);
							request.onerror = () => reject(request.error);
						});
					}
				}
				this.blacklistCache = blacklist;
			}
			
			if (!blacklist || blacklist.length === 0) {
				return;
			}
			
			// 创建网络链接错误区域 - 可折叠卡片样式
			const blacklistSection = containerEl.createDiv('blacklist-section');
			blacklistSection.style.cssText = `
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 10px;
				overflow: hidden;
				margin-bottom: 16px;
			`;
			
			// 头部（可点击折叠）
			const headerEl = blacklistSection.createDiv('blacklist-header');
			headerEl.style.cssText = `
				display: flex;
				align-items: center;
				padding: 14px 16px;
				background: var(--background-secondary);
				cursor: pointer;
				gap: 12px;
				transition: background 0.2s ease;
			`;
			
			const expandIcon = headerEl.createEl('span', { text: '▶' });
			expandIcon.style.cssText = `
				font-size: 0.7em;
				color: var(--text-muted);
				transition: transform 0.2s ease;
				width: 16px;
				text-align: center;
			`;
			
			const iconEl = headerEl.createEl('span', { text: '🌐' });
			iconEl.style.fontSize = '1.1em';
			
			const titleText = headerEl.createEl('span', { text: '网络链接' });
			titleText.style.cssText = `
				flex: 1;
				font-weight: 600;
				font-size: 0.9em;
				color: var(--text-normal);
			`;
			
			const countBadge = headerEl.createEl('span', { text: String(blacklist.length) });
			countBadge.style.cssText = `
				background: var(--text-error);
				color: white;
				font-size: 0.7em;
				padding: 2px 8px;
				border-radius: 10px;
				flex-shrink: 0;
			`;
			
			// 内容区域（默认折叠）
			const contentEl = blacklistSection.createDiv('blacklist-content');
			contentEl.style.cssText = `
				display: none;
				max-height: 200px;
				overflow-y: auto;
				border-top: 1px solid var(--background-modifier-border);
			`;
			
			// 显示黑名单条目（简化显示）
			const itemsList = contentEl.createDiv();
			itemsList.style.cssText = `
				padding: 12px;
				display: flex;
				flex-direction: column;
				gap: 8px;
			`;
			
			// 只显示前5条，如果有更多显示提示
			const displayCount = Math.min(blacklist.length, 5);
			for (let i = 0; i < displayCount; i++) {
				const item = blacklist[i];
				const itemEl = itemsList.createDiv('blacklist-item');
				itemEl.style.cssText = `
					padding: 10px 12px;
					background: var(--background-secondary);
					border-radius: 6px;
					border-left: 3px solid var(--text-error);
				`;
				
				const url = item.url || item.id || '';
				if (url) {
					const urlEl = itemEl.createEl('div', { text: url });
					urlEl.style.cssText = `
						font-family: var(--font-monospace);
						font-size: 0.8em;
						color: var(--text-normal);
						word-break: break-all;
					`;
				}
				
				if (item.errorMessage || item.reason) {
					const errorEl = itemEl.createEl('div', { 
						text: item.errorMessage || item.reason 
					});
					errorEl.style.cssText = `
						margin-top: 4px;
						font-size: 0.8em;
						color: var(--text-muted);
					`;
				}
			}
			
			// 如果有更多条目，显示提示
			if (blacklist.length > 5) {
				const moreEl = itemsList.createEl('div', { 
					text: `还有 ${blacklist.length - 5} 个网络链接错误...` 
				});
				moreEl.style.cssText = `
					text-align: center;
					padding: 8px;
					font-size: 0.85em;
					color: var(--text-muted);
					font-style: italic;
				`;
			}
			
			// 点击头部展开/折叠
			let isExpanded = false;
			headerEl.addEventListener('click', () => {
				isExpanded = !isExpanded;
				contentEl.style.display = isExpanded ? 'block' : 'none';
				expandIcon.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
				headerEl.style.background = isExpanded ? 'var(--background-modifier-hover)' : 'var(--background-secondary)';
			});
			
			// 悬停效果
			headerEl.addEventListener('mouseenter', () => {
				headerEl.style.background = 'var(--background-modifier-hover)';
			});
			headerEl.addEventListener('mouseleave', () => {
				if (!isExpanded) {
					headerEl.style.background = 'var(--background-secondary)';
				}
			});
			
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.warn(OperationType.VIEW, '显示网络链接错误部分失败', {
					error: error instanceof Error ? error : new Error(String(error))
				});
			}
		}
	}

	/**
	 * 清除网络链接错误缓存（用于网络链接错误数据变化时刷新）
	 */
	public clearBlacklistCache(): void {
		this.blacklistCache = null;
	}

	/**
	 * 清除DOM缓存
	 */
	private clearCache(): void {
		this.cachedElements.clear();
	}

	/**
	 * 验证图片 URL 是否可用
	 * @param url - 图片 URL
	 * @returns 是否可用
	 */
	private async validateImageUrl(url: string): Promise<boolean> {
		if (!url) return false;
		
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000);
			
			await fetch(url, {
				method: 'HEAD',
				signal: controller.signal,
				mode: 'no-cors'
			});
			
			clearTimeout(timeoutId);
			
			// no-cors 模式下无法获取状态码，只要能请求就认为是可用的
			return true;
		} catch (error) {
			// 请求失败，链接不可用
			return false;
		}
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
			console.error('恢复链接失败:', error);
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
				console.error(`恢复文件 ${filePath} 中的链接失败:`, error);
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
		this.clearCache();
		const {contentEl} = this;
		contentEl.empty();
	}
}

