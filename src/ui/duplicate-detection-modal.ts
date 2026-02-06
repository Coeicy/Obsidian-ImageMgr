/**
 * 重复图片检测模态框模块
 * 
 * 提供重复图片检测和管理功能的用户界面。
 * 基于 MD5 哈希值识别重复图片。
 */

import { Modal, Notice, TFile, requestUrl } from 'obsidian';
import { ImageInfo } from '../types';
import { calculateFileHash, calculateBufferHash } from '../utils/image-hash';
import { ImageProcessor } from '../utils/image-processor';
import { ConfirmModal } from './confirm-modal';
import ImageManagementPlugin from '../main';
import { OperationType } from '../utils/logger';
import { makeModalResizable } from '../utils/resizable-modal';
import { UI_SIZE } from '../constants';

/**
 * 重复图片分组接口
 */
interface DuplicateGroup {
	/** MD5 哈希值 */
	hash: string;
	/** 具有相同哈希值的图片列表 */
	images: ImageInfo[];
}

/**
 * 重复图片检测模态框类
 * 
 * 功能：
 * - 检测具有相同 MD5 哈希值的重复图片
 * - 显示重复图片分组
 * - 支持删除重复图片（保留一个）
 * - 显示每组重复图片的详细信息
 */
export class DuplicateDetectionModal extends Modal {
	images: ImageInfo[];
	app: any;
	plugin?: ImageManagementPlugin;
	onDelete?: (imagePath: string) => void;
	/** 预扫描的重复图片哈希映射（如果提供，将直接使用，只计算缺失的哈希值） */
	prescannedHashMap?: Map<string, ImageInfo[]>;

	constructor(
		app: any, 
		images: ImageInfo[], 
		onDelete?: (imagePath: string) => void, 
		plugin?: ImageManagementPlugin,
		prescannedHashMap?: Map<string, ImageInfo[]>
	) {
		super(app);
		this.images = images;
		this.app = app;
		this.plugin = plugin;
		this.onDelete = onDelete;
		this.prescannedHashMap = prescannedHashMap;
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass('duplicate-detection-modal');

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
		
		// 启用模态框可调整大小
		makeModalResizable(modalEl, {
			minWidth: 700,
			minHeight: 500,
		});

		// 标题
		const titleEl = contentEl.createEl('h2', { text: '🔍 重复图片' });
		titleEl.style.flexShrink = '0';
		titleEl.style.marginBottom = '16px';

		// 创建可滚动的内容容器
		const scrollContainer = contentEl.createDiv();
		scrollContainer.style.flex = '1';
		scrollContainer.style.overflowY = 'auto';
		scrollContainer.style.overflowX = 'hidden';

		// 检测重复图片
		this.detectDuplicates(scrollContainer);
	}

	async detectDuplicates(containerEl: HTMLElement) {
		// 统计本地和云端图片数量
		const localCount = this.images.filter(img => !img.isRemote).length;
		const remoteCount = this.images.filter(img => img.isRemote).length;
		
		// 检查是否有预扫描的哈希映射
		const hasPrescanned = this.prescannedHashMap && this.prescannedHashMap.size > 0;
		
		// 如果有预扫描结果，先显示已检测的结果
		let initialDuplicateGroups: DuplicateGroup[] = [];
		if (hasPrescanned) {
			const initialHashMap = new Map(this.prescannedHashMap);
			// 确保所有图片（包括已有哈希值的）都在 hashMap 中
			for (const img of this.images) {
				if (img.md5 && !initialHashMap.has(img.md5)) {
					initialHashMap.set(img.md5, []);
				}
				if (img.md5) {
					const group = initialHashMap.get(img.md5)!;
					if (!group.includes(img)) {
						group.push(img);
					}
				}
			}
			
			// 找出重复的组（数量大于1的组）
			for (const [hash, images] of initialHashMap.entries()) {
				if (images.length > 1) {
					initialDuplicateGroups.push({ hash, images });
				}
			}
			
			// 如果有已检测的结果，先显示
			if (initialDuplicateGroups.length > 0) {
				this.displayDuplicateResults(containerEl, initialDuplicateGroups);
			}
		}

		// 检查是否有需要检测的云端图片
		const remoteImagesToCheck = this.images.filter(img => img.isRemote && !img.md5);
		const hasRemoteToCheck = remoteImagesToCheck.length > 0;
		
		// 检查是否关闭了云端图片扫描
		const scanRemoteImagesDisabled = this.plugin?.settings.scanRemoteImages === false;
		
		// 如果有需要检测的云端图片，显示"正在检查重复云端图片"提示
		let loadingEl: HTMLElement | null = null;
		if (hasRemoteToCheck && !scanRemoteImagesDisabled) {
			loadingEl = containerEl.createDiv({ text: '正在检测重复云端图片，重启页面更新结果' });
			loadingEl.style.textAlign = 'center';
			loadingEl.style.padding = '20px';
			loadingEl.style.color = 'var(--text-muted)';
			loadingEl.style.fontSize = '0.9em';
			loadingEl.id = 'duplicate-remote-loading';
		}
		
		// 如果关闭了云端图片扫描，显示提示信息
		if (scanRemoteImagesDisabled && remoteImagesToCheck.length > 0) {
			const disabledInfoEl = containerEl.createDiv({ cls: 'setting-item-description' });
			disabledInfoEl.innerHTML = `
				<p style="margin: 0 0 12px 0; font-size: 0.9em; color: var(--text-muted);">
					💡 当前已关闭云端图片扫描，重复检测将仅针对本地图片
				</p>
			`;
		}

		try {
			// 如果有预扫描的哈希映射，直接使用它作为基础
			const hashMap = hasPrescanned 
				? new Map(this.prescannedHashMap) 
				: new Map<string, ImageInfo[]>();
			
			// 分离本地图片和云端图片
			const localImages: { file: TFile; imageInfo: ImageInfo }[] = [];
			const remoteImages: ImageInfo[] = [];
			
			for (const img of this.images) {
				if (img.isRemote) {
					// 云端图片
					remoteImages.push(img);
				} else {
					// 本地图片
					const file = this.app.vault.getAbstractFileByPath(img.path) as TFile;
					if (file) {
						localImages.push({ file, imageInfo: img });
					}
				}
			}

			// 如果使用预扫描结果，本地图片的哈希值应该已经计算过了
			// 只需要处理没有哈希值的本地图片（可能是新添加的）
			const localHashPromises = localImages
				.filter(({ imageInfo }) => !imageInfo.md5) // 只处理没有哈希值的
				.map(async ({ file, imageInfo }) => {
					try {
						const hash = await calculateFileHash(file, this.app.vault);
						imageInfo.md5 = hash;
						return { hash, imageInfo };
					} catch (error) {
						if (this.plugin?.logger) {
							await this.plugin.logger.error(OperationType.PLUGIN_ERROR, `计算本地图片哈希失败 ${file.path}`, {
								error: error as Error
							});
						}
						return null;
					}
				});

			// 如果关闭了云端图片扫描，跳过云端图片的哈希计算
			const remoteImagesToHash = scanRemoteImagesDisabled ? [] : remoteImages.filter(imageInfo => !imageInfo.md5);
			const REMOTE_BATCH_SIZE = 3; // 减少批次大小，因为需要下载完整图片
			const remoteHashResults: Array<{ hash: string; imageInfo: ImageInfo } | null> = [];

			for (let i = 0; i < remoteImagesToHash.length; i += REMOTE_BATCH_SIZE) {
				const batch = remoteImagesToHash.slice(i, i + REMOTE_BATCH_SIZE);
				const batchPromises = batch.map(async (imageInfo) => {
					try {
						// 下载图片并计算哈希值
						const response = await requestUrl({
							url: imageInfo.path,
							headers: {
								'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
								'Referer': ''
							}
						});
						
						if (response.status >= 400) {
							throw new Error(`HTTP ${response.status}: ${response.statusText}`);
						}
						
						// 计算哈希值
						const hash = calculateBufferHash(response.arrayBuffer);
						imageInfo.md5 = hash;
						
						// 更新图片大小（如果之前未知）
						if (imageInfo.size === 0 && response.arrayBuffer) {
							imageInfo.size = response.arrayBuffer.byteLength;
						}
						
						// 清理响应体引用，帮助垃圾回收（哈希值已计算完成）
						// 注意：response.arrayBuffer 可能无法直接设置为 null，但我们可以避免进一步引用
						
						return { hash, imageInfo };
					} catch (error) {
						if (this.plugin?.logger) {
							await this.plugin.logger.error(OperationType.PLUGIN_ERROR, `计算云端图片哈希失败 ${imageInfo.path}`, {
								error: error as Error
							});
						}
						return null;
					}
				});

				const batchResults = await Promise.all(batchPromises);
				remoteHashResults.push(...batchResults);

				// 每批之间延迟，给垃圾回收器时间清理内存
				if (i + REMOTE_BATCH_SIZE < remoteImagesToHash.length) {
					await new Promise(resolve => setTimeout(resolve, 200)); // 200ms 延迟
				}
			}

			// 等待所有缺失的哈希计算完成
			const localHashResults = await Promise.all(localHashPromises);
			
			const hashResults = [...localHashResults, ...remoteHashResults];
			
			// 将新计算的哈希值添加到 hashMap
			hashResults.forEach(result => {
				if (result && result.hash) {
					if (!hashMap.has(result.hash)) {
						hashMap.set(result.hash, []);
					}
					hashMap.get(result.hash)!.push(result.imageInfo);
				}
			});

			// 确保所有图片（包括已有哈希值的）都在 hashMap 中
			// 对于已有哈希值的图片，如果它们不在 hashMap 中，需要添加
			for (const img of this.images) {
				if (img.md5 && !hashMap.has(img.md5)) {
					hashMap.set(img.md5, []);
				}
				if (img.md5) {
					const group = hashMap.get(img.md5)!;
					if (!group.includes(img)) {
						group.push(img);
					}
				}
			}

			// 找出重复的组（数量大于1的组）
			const duplicateGroups: DuplicateGroup[] = [];
			for (const [hash, images] of hashMap.entries()) {
				if (images.length > 1) {
					duplicateGroups.push({ hash, images });
				}
			}

			// 移除加载提示（如果有）
			if (loadingEl) {
				loadingEl.remove();
			}

			// 如果之前已经显示了初始结果，现在需要更新或合并结果
			if (hasPrescanned && initialDuplicateGroups.length > 0) {
				// 合并新旧结果，更新UI
				this.updateDuplicateResults(containerEl, duplicateGroups);
			} else {
				// 显示完整结果
				this.displayDuplicateResults(containerEl, duplicateGroups);
			}

		} catch (error) {
			if (loadingEl) {
				loadingEl.remove();
			}
			if (this.plugin?.logger) {
				await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '检测重复图片失败', {
					error: error as Error
				});
			}
			const errorEl = containerEl.createDiv({ text: '检测失败: ' + (error instanceof Error ? error.message : String(error)) });
			errorEl.style.color = 'var(--text-error)';
			errorEl.style.padding = '20px';
			errorEl.style.textAlign = 'center';
		}
	}

	/**
	 * 显示重复图片检测结果
	 */
	private displayDuplicateResults(containerEl: HTMLElement, duplicateGroups: DuplicateGroup[]) {
		// 如果已经有结果显示，先清除（除了加载提示）
		const existingStats = containerEl.querySelector('.duplicate-stats');
		const existingContainer = containerEl.querySelector('.duplicate-groups-container');
		const existingNoDuplicates = containerEl.querySelector('.no-duplicates-message');
		if (existingStats) existingStats.remove();
		if (existingContainer) existingContainer.remove();
		if (existingNoDuplicates) existingNoDuplicates.remove();

		// 显示结果
		if (duplicateGroups.length === 0) {
			const noDuplicatesEl = containerEl.createDiv({ text: '✅ 未发现重复图片！' });
			noDuplicatesEl.className = 'no-duplicates-message';
			noDuplicatesEl.style.textAlign = 'center';
			noDuplicatesEl.style.padding = '40px';
			noDuplicatesEl.style.color = 'var(--text-muted)';
			noDuplicatesEl.style.fontSize = '1.2em';
			return;
		}

		// 统计信息
		const statsEl = containerEl.createDiv('duplicate-stats');
		statsEl.style.cssText = `
			margin-bottom: 20px;
			padding: 12px 16px;
			background: var(--background-secondary);
			border-radius: 8px;
			font-size: 0.9em;
			display: flex;
			flex-wrap: wrap;
			gap: 16px 24px;
			align-items: center;
		`;
		
		const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + group.images.length - 1, 0);
		const totalRemoteDuplicates = duplicateGroups.reduce((sum, group) => 
			sum + group.images.filter(img => img.isRemote).length - (group.images[0]?.isRemote ? 1 : 0), 0
		);
		const totalLocalDuplicates = totalDuplicates - totalRemoteDuplicates;
		const totalWastedSpace = duplicateGroups.reduce((sum, group) => {
			// 计算浪费的空间（所有重复图片的总大小，减去一张作为保留，只计算本地图片）
			const groupWasted = group.images.slice(1)
				.filter(img => !img.isRemote)
				.reduce((groupSum, img) => groupSum + img.size, 0);
			return sum + groupWasted;
		}, 0);

		// 创建统计项，使用 flex 布局减少留白
		const createStatItem = (label: string, value: string) => {
			const item = statsEl.createDiv('stat-item');
			item.style.cssText = `
				display: flex;
				align-items: baseline;
				gap: 4px;
				flex-shrink: 0;
			`;
			const labelSpan = item.createSpan();
			labelSpan.textContent = label;
			labelSpan.style.cssText = 'color: var(--text-muted);';
			const valueSpan = item.createSpan();
			valueSpan.innerHTML = value;
			valueSpan.style.cssText = 'font-weight: 600; color: var(--text-normal);';
			return item;
		};

		createStatItem('发现', `<strong>${duplicateGroups.length}</strong>组`);
		createStatItem('共', `<strong>${totalDuplicates}</strong>张图片`);
		createStatItem('云端', `<strong>${totalRemoteDuplicates}</strong>张`);
		createStatItem('本地', `<strong>${totalLocalDuplicates}</strong>张`);
		
		if (totalWastedSpace > 0) {
			createStatItem('可节省空间：', `<strong>${ImageProcessor.formatFileSize(totalWastedSpace)}</strong>`);
		}

		// 创建滚动容器
		const scrollContainer = containerEl.createDiv('duplicate-groups-container');
		scrollContainer.style.cssText = `
			max-height: calc(90vh - 250px);
			overflow-y: auto;
			padding-right: 8px;
		`;

		// 显示每个重复组
		duplicateGroups.forEach((group, groupIndex) => {
			this.renderDuplicateGroup(scrollContainer, group, groupIndex);
		});
	}

	/**
	 * 更新重复图片检测结果（合并新旧结果）
	 */
	private updateDuplicateResults(containerEl: HTMLElement, duplicateGroups: DuplicateGroup[]) {
		// 重新显示完整结果（包括新检测的云端图片）
		this.displayDuplicateResults(containerEl, duplicateGroups);
	}

	renderDuplicateGroup(containerEl: HTMLElement, group: DuplicateGroup, groupIndex: number) {
		const groupEl = containerEl.createDiv('duplicate-group');
		groupEl.style.cssText = `
			margin-bottom: 24px;
			padding: 16px;
			background: var(--background-secondary);
			border-radius: 8px;
			border: 1px solid var(--background-modifier-border);
		`;

		// 组标题
		const groupHeader = groupEl.createDiv('group-header');
		groupHeader.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 12px;
			padding-bottom: 8px;
			border-bottom: 1px solid var(--background-modifier-border);
		`;

		const groupTitle = groupHeader.createDiv('group-title');
		const localCount = group.images.filter(img => !img.isRemote).length;
		const remoteCount = group.images.filter(img => img.isRemote).length;
		let countText = `${group.images.length} 张相同图片`;
		// 只有当组内同时存在本地和云端图片时，才显示分类信息
		if (localCount > 0 && remoteCount > 0) {
			countText += `（${localCount} 张本地，${remoteCount} 张云端）`;
		}
		groupTitle.innerHTML = `
			<strong>重复组 #${groupIndex + 1}</strong>
			<span style="color: var(--text-muted); font-size: 0.9em; margin-left: 8px;">
				(${countText})
			</span>
		`;


		// 哈希值显示
		const hashEl = groupEl.createDiv('group-hash');
		hashEl.style.cssText = `
			font-family: monospace;
			font-size: 0.8em;
			color: var(--text-muted);
			margin-bottom: 12px;
			word-break: break-all;
		`;
		hashEl.textContent = `MD5: ${group.hash}`;

		// 如果组内存在云端图片，显示提示信息
		if (remoteCount > 0) {
			const remoteNotice = groupEl.createDiv('remote-notice');
			remoteNotice.style.cssText = `
				margin-bottom: 12px;
				padding: 6px 10px;
				background: var(--background-modifier-border);
				border-radius: 4px;
				font-size: 0.85em;
				color: var(--text-muted);
				display: inline-flex;
				align-items: center;
				gap: 6px;
				width: fit-content;
			`;
			const icon = remoteNotice.createSpan({ text: '⚠️' });
			icon.style.cssText = 'font-size: 1em;';
			const text = remoteNotice.createSpan({ text: '该组包含云端图片，云端图片无法删除' });
			text.style.cssText = 'line-height: 1.4;';
		}

		// 图片列表
		const imagesContainer = groupEl.createDiv('group-images');
		imagesContainer.style.cssText = `
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
			gap: 12px;
			align-items: stretch; /* 确保所有卡片高度一致 */
		`;

		group.images.forEach((image) => {
			this.renderImageItem(imagesContainer, image, group);
		});
	}

		renderImageItem(containerEl: HTMLElement, image: ImageInfo, group: DuplicateGroup) {
		const imageItem = containerEl.createDiv('image-item');
		imageItem.style.cssText = `
			position: relative;
			border: 2px solid var(--background-modifier-border);
			border-radius: 8px;
			overflow: hidden;
			background: var(--background-primary);
			display: flex;
			flex-direction: column;
			height: 100%; /* 确保所有卡片高度一致 */
			transition: transform 0.2s ease, box-shadow 0.2s ease;
		`;

		// 添加悬停效果 - 根据设置决定是否启用
		if (this.plugin?.settings.enableHoverEffect) {
			imageItem.addEventListener('mouseenter', () => {
				imageItem.style.transform = 'translateY(-2px)';
				imageItem.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
			});
			imageItem.addEventListener('mouseleave', () => {
				imageItem.style.transform = 'translateY(0)';
				imageItem.style.boxShadow = 'none';
			});
		}

		// 图片预览
		const imagePreview = imageItem.createEl('img', {
			attr: {
				src: image.isRemote ? image.path : this.app.vault.adapter.getResourcePath(image.path)
			}
		});
		
		// 根据主页设置统一图片高度
		if (this.plugin?.settings.adaptiveImageSize) {
			// 自适应模式：图片按原始宽高比显示
			imagePreview.style.cssText = `
				width: 100%;
				height: auto;
				min-height: 0;
				max-height: ${UI_SIZE.IMAGE_PREVIEW.ADAPTIVE_MAX_HEIGHT};
				object-fit: contain;
				background: var(--background-secondary);
			`;
		} else {
			// 固定高度模式：使用设置中的固定高度，如果没有则使用常量
			const fixedHeight = this.plugin?.settings.fixedImageHeight 
				? `${this.plugin.settings.fixedImageHeight}px` 
				: UI_SIZE.IMAGE_PREVIEW.FIXED_HEIGHT;
			imagePreview.style.cssText = `
				width: 100%;
				height: ${fixedHeight};
				object-fit: contain;
				background: var(--background-secondary);
			`;
		}
		// 云端图片添加 referrerPolicy
		if (image.isRemote) {
			imagePreview.referrerPolicy = 'no-referrer';
		}

		// 图片信息容器 - 使用 flexbox 确保删除按钮始终在底部对齐
		const imageInfo = imageItem.createDiv('image-info');
		imageInfo.style.cssText = `
			padding: 8px;
			font-size: 0.85em;
			display: flex;
			flex-direction: column;
			height: 100%;
			min-height: 120px; /* 确保最小高度一致 */
		`;

		// 信息内容区域（文件名、路径、大小）- 使用 flex-grow 占据剩余空间
		const infoContent = imageInfo.createDiv('info-content');
		infoContent.style.cssText = `
			flex: 1 1 auto;
			display: flex;
			flex-direction: column;
		`;

		// 文件名
		const fileName = infoContent.createDiv('file-name');
		fileName.textContent = image.name;
		fileName.style.cssText = `
			font-weight: bold;
			margin-bottom: 4px;
			word-break: break-all;
			flex-shrink: 0;
		`;

		// 文件路径
		const filePath = infoContent.createDiv('file-path');
		// 云端图片显示完整 URL，本地图片显示目录路径
		let displayPath: string;
		if (image.isRemote) {
			displayPath = image.path; // 云端图片显示完整 URL
		} else {
			// 如果路径中没有"/"，说明在根目录
			displayPath = image.path.includes('/') ? image.path.substring(0, image.path.lastIndexOf('/')) : '根目录';
		}
		filePath.textContent = displayPath;
		filePath.style.cssText = `
			color: var(--text-muted);
			font-size: 0.8em;
			margin-bottom: 4px;
			word-break: break-all;
			flex-shrink: 0;
		`;
		// 云端图片添加标识 - 只有当组内同时存在本地和云端图片时才显示
		const hasLocalInGroup = group.images.some(img => !img.isRemote);
		const hasRemoteInGroup = group.images.some(img => img.isRemote);
		if (image.isRemote && hasLocalInGroup && hasRemoteInGroup) {
			const remoteBadge = filePath.createSpan({ text: ' 🌩️ 云端', cls: 'remote-badge' });
			remoteBadge.style.cssText = `
				color: var(--text-accent);
				font-weight: bold;
				margin-left: 4px;
			`;
		}

		// 文件大小
		const fileSize = infoContent.createDiv('file-size');
		fileSize.textContent = ImageProcessor.formatFileSize(image.size);
		fileSize.style.cssText = `
			color: var(--text-muted);
			font-size: 0.8em;
			margin-bottom: 8px;
			flex-shrink: 0;
		`;

		// 删除按钮 - 云端图片不显示删除按钮
		if (!image.isRemote) {
			const deleteBtn = imageInfo.createEl('button', {
				text: '删除',
				cls: 'mod-danger'
			});
			deleteBtn.style.cssText = `
				width: 100%;
				margin-top: auto; /* 使用 auto margin 推到底部 */
				padding: 6px;
				font-size: 0.85em;
				flex-shrink: 0;
			`;
			deleteBtn.addEventListener('click', async (e) => {
				e.stopPropagation(); // 阻止事件冒泡，避免触发图片点击
				await this.deleteImage(image, group);
			});
		}

		// 为图片卡片添加点击事件，点击后查看笔记位置
		imageItem.style.cursor = 'pointer';
		imageItem.addEventListener('click', async (e) => {
			// 如果点击的是按钮，不触发跳转
			if ((e.target as HTMLElement).tagName === 'BUTTON') {
				return;
			}
			await this.navigateToImageReferences(image);
		});
	}

	async deleteImage(image: ImageInfo, group: DuplicateGroup) {
		const confirmMessage = `确定要删除以下图片吗？\n\n${image.path}\n\n此操作不可撤销。`;

		const confirmed = await ConfirmModal.show(
			this.app,
			'确认删除',
			confirmMessage
		);

		if (confirmed === 'save') {
			try {
				const file = this.app.vault.getAbstractFileByPath(image.path) as TFile;
				if (file) {
					// 根据设置选择删除方式
					if (this.plugin?.settings.enablePluginTrash) {
						// 使用插件回收站（moveToTrash 内部已记录日志）
						const success = await this.plugin.trashManager.moveToTrash(file);
						if (success) {
							new Notice(`已移动到回收站: ${image.name}`);
						} else {
							new Notice(`移动到回收站失败: ${image.name}`);
							// 记录失败日志
							if (this.plugin?.logger) {
								await this.plugin.logger.error(
									OperationType.DELETE,
									`删除图片失败: ${image.name}`,
									{
										imageHash: image.md5,
										imagePath: image.path,
										imageName: image.name,
										details: {
											reason: '移动到回收站失败',
											useTrash: true
										}
									}
								);
							}
						}
					} else if (this.plugin?.settings.moveToSystemTrash) {
						// 移到系统回收站
						await this.app.vault.delete(file);
						new Notice(`已删除: ${image.name}`);
						
						// 记录删除日志
						if (this.plugin?.logger) {
							await this.plugin.logger.info(
								OperationType.DELETE,
								`删除图片: ${image.name}`,
								{
									imageHash: image.md5,
									imagePath: image.path,
									imageName: image.name,
									details: {
										path: image.path,
										size: image.size,
										useSystemTrash: true
									}
								}
							);
						}
					} else {
						// 永久删除
						await this.app.vault.delete(file);
						new Notice(`已永久删除: ${image.name}`);
						
						// 记录删除日志
						if (this.plugin?.logger) {
							await this.plugin.logger.info(
								OperationType.DELETE,
								`永久删除图片: ${image.name}`,
								{
									imageHash: image.md5,
									imagePath: image.path,
									imageName: image.name,
									details: {
										path: image.path,
										size: image.size,
										permanent: true
									}
								}
							);
						}
					}
					
					// 从组中移除
					const index = group.images.indexOf(image);
					if (index > -1) {
						group.images.splice(index, 1);
					}

					// 从图片列表中移除
					const imageIndex = this.images.indexOf(image);
					if (imageIndex > -1) {
						this.images.splice(imageIndex, 1);
					}

					// 重新渲染整个模态框
					this.onOpen();

					// 触发删除回调
					if (this.onDelete) {
						this.onDelete(image.path);
					}
				}
			} catch (error) {
				if (this.plugin?.logger) {
					await this.plugin.logger.error(
						OperationType.DELETE,
						`删除图片失败: ${image.name}`,
						{
							error: error as Error,
							imageHash: image.md5,
							imagePath: image.path,
							imageName: image.name
						}
					);
				}
				new Notice('删除失败: ' + (error instanceof Error ? error.message : String(error)));
			}
		}
	}

	async deleteDuplicates(group: DuplicateGroup) {
		// 删除除第一张外的所有重复图片（只删除本地图片，跳过云端图片）
		const duplicates = group.images.slice(1).filter(img => !img.isRemote);
		const remoteDuplicates = group.images.slice(1).filter(img => img.isRemote);
		
		if (duplicates.length === 0) {
			if (remoteDuplicates.length > 0) {
				new Notice('该组重复图片均为云端图片，无法删除');
			} else {
				new Notice('没有可删除的重复图片');
			}
			return;
		}
		
		const totalSize = duplicates.reduce((sum, img) => sum + img.size, 0);
		
		let confirmMessage = `确定要删除以下 ${duplicates.length} 张重复图片吗？\n\n这将释放 ${ImageProcessor.formatFileSize(totalSize)} 空间。\n\n此操作不可撤销。`;
		if (remoteDuplicates.length > 0) {
			confirmMessage += `\n\n注意：该组还有 ${remoteDuplicates.length} 张云端图片无法删除。`;
		}
		
		const confirmed = await ConfirmModal.show(
			this.app,
			'确认删除重复图片',
			confirmMessage
		);

		if (confirmed === 'save') {
			try {
				let deletedCount = 0;
				let failCount = 0;
				
				for (const image of duplicates) {
					try {
						const file = this.app.vault.getAbstractFileByPath(image.path) as TFile;
						if (file) {
							// 根据设置选择删除方式
							if (this.plugin?.settings.enablePluginTrash) {
								// 使用插件回收站（moveToTrash 内部已记录日志）
								const success = await this.plugin.trashManager.moveToTrash(file);
								if (success) {
									deletedCount++;
								} else {
									failCount++;
									if (this.plugin?.logger) {
										await this.plugin.logger.error(
											OperationType.DELETE,
											`删除重复图片失败: ${image.name}`,
											{
												imageHash: image.md5,
												imagePath: image.path,
												imageName: image.name,
												details: {
													reason: '移动到回收站失败',
													useTrash: true
												}
											}
										);
									}
								}
							} else {
								// 直接删除（不使用回收站）
								await this.app.vault.delete(file);
								
								// 记录删除日志
								if (this.plugin?.logger) {
									await this.plugin.logger.info(
										OperationType.DELETE,
										`删除重复图片: ${image.name}`,
										{
											imageHash: image.md5,
											imagePath: image.path,
											imageName: image.name,
											details: {
												path: image.path,
												size: image.size,
												permanent: true,
												fromDuplicateDetection: true
											}
										}
									);
								}
								
								deletedCount++;
							}
							
							// 从图片列表中移除
							const imageIndex = this.images.indexOf(image);
							if (imageIndex > -1) {
								this.images.splice(imageIndex, 1);
							}
						}
					} catch (error) {
						failCount++;
						if (this.plugin?.logger) {
							await this.plugin.logger.error(
								OperationType.DELETE,
								`删除重复图片失败: ${image.name}`,
								{
									error: error as Error,
									imageHash: image.md5,
									imagePath: image.path,
									imageName: image.name
								}
							);
						}
					}
				}

				// 从组中移除已删除的图片，只保留第一张
				group.images = [group.images[0]];

				const message = `已删除 ${deletedCount} 张重复图片${failCount > 0 ? `，${failCount} 张失败` : ''}`;
				new Notice(message);
				
				// 重新渲染模态框
				this.onOpen();

				// 触发删除回调
				if (this.onDelete) {
					duplicates.forEach(img => this.onDelete!(img.path));
				}
			} catch (error) {
				if (this.plugin?.logger) {
					await this.plugin.logger.error(OperationType.DELETE, '批量删除失败', {
						error: error as Error
					});
				}
				new Notice('批量删除失败: ' + (error instanceof Error ? error.message : String(error)));
			}
		}
	}

	/**
	 * 跳转到图片的引用笔记位置
	 */
	async navigateToImageReferences(image: ImageInfo) {
		// 检查是否有缓存的引用信息
		if (image.references && image.references.length > 0) {
			// 使用第一个引用
			const ref = image.references[0];
			const file = this.app.vault.getAbstractFileByPath(ref.filePath) as TFile;
			if (file) {
				// 关闭模态框
				this.close();
				
				// 在新标签页打开笔记
				const leaf = this.app.workspace.getLeaf(true);
				if (leaf) {
					await leaf.openFile(file);
					// 滚动到指定行
					setTimeout(async () => {
						const view = leaf.view;
						if (view && 'editor' in view && ref.lineNumber && ref.lineNumber > 0) {
							const editor = (view as any).editor;
							if (editor && typeof editor.setCursor === 'function') {
								const line = ref.lineNumber - 1;
								let ch = 0;
								
								// 如果提供了完整行内容，尝试定位到图片引用的位置
								if (ref.fullLine) {
									try {
										const content = await this.app.vault.read(file);
										const lines = content.split('\n');
										if (line < lines.length) {
											const lineContent = lines[line];
											// 尝试查找图片路径或文件名
											const imageName = image.name;
											const imagePath = image.path;
											const patterns = [
												new RegExp(`!\\[\\[[^\\]]*${imageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\]]*\\]\\]`),
												new RegExp(`!\\[[^\\]]*\\]\\([^)]*${imageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^)]*\\)`),
												new RegExp(`<img[^>]*${imageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>`, 'i'),
												new RegExp(imagePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
											];
											for (const pattern of patterns) {
												const match = lineContent.match(pattern);
												if (match && match.index !== undefined) {
													ch = match.index;
													break;
												}
											}
										}
									} catch (e) {
										// 定位失败，使用行首
									}
								}
								
								const pos = { line, ch };
								editor.setCursor(pos);
							}
						}
					}, 300);
				}
			} else {
				new Notice(`找不到文件: ${ref.filePath}`);
			}
		} else {
			// 如果没有缓存的引用信息，尝试查找引用
			if (this.plugin?.referenceManager) {
				try {
					const references = await this.plugin.referenceManager.findImageReferences(image.path, image.name);
					if (references.length > 0) {
						// 更新缓存的引用信息
						image.references = references;
						image.referenceCount = references.length;
						// 递归调用，使用更新后的引用信息
						await this.navigateToImageReferences(image);
					} else {
						new Notice('该图片未被任何笔记引用');
					}
				} catch (error) {
					if (this.plugin?.logger) {
						await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '查找图片引用失败', {
							error: error as Error,
							imagePath: image.path
						});
					}
					new Notice('查找引用失败');
				}
			} else {
				new Notice('该图片未被任何笔记引用');
			}
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

