/**
 * 重复图片检测模态框模块
 * 
 * 提供重复图片检测和管理功能的用户界面。
 * 基于 MD5 哈希值识别重复图片。
 */

import { Modal, Notice, TFile } from 'obsidian';
import { ImageInfo } from '../types';
import { calculateFileHash } from '../utils/image-hash';
import { ImageProcessor } from '../utils/image-processor';
import { ConfirmModal } from './confirm-modal';
import ImageManagementPlugin from '../main';
import { OperationType } from '../utils/logger';
import { makeModalResizable } from '../utils/resizable-modal';

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

	constructor(app: any, images: ImageInfo[], onDelete?: (imagePath: string) => void, plugin?: ImageManagementPlugin) {
		super(app);
		this.images = images;
		this.app = app;
		this.plugin = plugin;
		this.onDelete = onDelete;
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass('duplicate-detection-modal');

		// 设置模态框样式
		modalEl.style.width = '90%';
		modalEl.style.maxWidth = '1200px';
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
		const titleEl = contentEl.createEl('h2', { text: '🔍 重复图片检测' });
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
		// 显示加载提示
		const loadingEl = containerEl.createDiv({ text: '正在计算哈希值并检测重复图片...' });
		loadingEl.style.textAlign = 'center';
		loadingEl.style.padding = '20px';
		loadingEl.style.color = 'var(--text-muted)';

		try {
			// 计算所有图片的哈希值
			const hashMap = new Map<string, ImageInfo[]>();
			const imageFiles = this.images.map(img => {
				const file = this.app.vault.getAbstractFileByPath(img.path) as TFile;
				return { file, imageInfo: img };
			}).filter(item => item.file !== null);

			// 并行计算哈希值
			const hashPromises = imageFiles.map(async ({ file, imageInfo }) => {
				try {
					// 如果已经有哈希值，直接使用
					if (imageInfo.md5) {
						return { hash: imageInfo.md5, imageInfo };
					}
					// 否则计算哈希值
					const hash = await calculateFileHash(file, this.app.vault);
					imageInfo.md5 = hash;
					return { hash, imageInfo };
				} catch (error) {
					if (this.plugin?.logger) {
						await this.plugin.logger.error(OperationType.PLUGIN_ERROR, `计算哈希失败 ${file.path}`, {
							error: error as Error
						});
					}
					return null;
				}
			});

			const hashResults = await Promise.all(hashPromises);
			
			// 按哈希值分组
			hashResults.forEach(result => {
				if (result && result.hash) {
					if (!hashMap.has(result.hash)) {
						hashMap.set(result.hash, []);
					}
					hashMap.get(result.hash)!.push(result.imageInfo);
				}
			});

			// 找出重复的组（数量大于1的组）
			const duplicateGroups: DuplicateGroup[] = [];
			for (const [hash, images] of hashMap.entries()) {
				if (images.length > 1) {
					duplicateGroups.push({ hash, images });
				}
			}

			// 移除加载提示
			loadingEl.remove();

			// 显示结果
			if (duplicateGroups.length === 0) {
				const noDuplicatesEl = containerEl.createDiv({ text: '✅ 未发现重复图片！' });
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
				padding: 12px;
				background: var(--background-secondary);
				border-radius: 8px;
				font-size: 0.9em;
			`;
			
			const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + group.images.length - 1, 0);
			const totalWastedSpace = duplicateGroups.reduce((sum, group) => {
				// 计算浪费的空间（所有重复图片的总大小，减去一张作为保留）
				const groupWasted = group.images.slice(1).reduce((groupSum, img) => groupSum + img.size, 0);
				return sum + groupWasted;
			}, 0);

			statsEl.innerHTML = `
				<strong>检测结果：</strong><br>
				发现 <strong>${duplicateGroups.length}</strong> 组重复图片<br>
				共 <strong>${totalDuplicates}</strong> 张重复图片<br>
				可节省空间：<strong>${ImageProcessor.formatFileSize(totalWastedSpace)}</strong>
			`;

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

		} catch (error) {
			loadingEl.remove();
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
		groupTitle.innerHTML = `
			<strong>重复组 #${groupIndex + 1}</strong>
			<span style="color: var(--text-muted); font-size: 0.9em; margin-left: 8px;">
				(${group.images.length} 张相同图片)
			</span>
		`;

		const groupActions = groupHeader.createDiv('group-actions');
		groupActions.style.cssText = `
			display: flex;
			gap: 8px;
		`;

		// 删除所有重复按钮（保留第一个）
		const deleteDuplicatesBtn = groupActions.createEl('button', {
			text: '删除重复',
			cls: 'mod-cta'
		});
		deleteDuplicatesBtn.style.cssText = `
			padding: 4px 12px;
			font-size: 0.85em;
		`;
		deleteDuplicatesBtn.addEventListener('click', async () => {
			await this.deleteDuplicates(group);
		});

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
		`;

		// 图片预览
		const imagePreview = imageItem.createEl('img', {
			attr: {
				src: this.app.vault.adapter.getResourcePath(image.path)
			}
		});
		imagePreview.style.cssText = `
			width: 100%;
			height: 150px;
			object-fit: contain;
			background: var(--background-secondary);
		`;

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
		// 如果路径中没有"/"，说明在根目录
		const displayPath = image.path.includes('/') ? image.path.substring(0, image.path.lastIndexOf('/')) : '根目录';
		filePath.textContent = displayPath;
		filePath.style.cssText = `
			color: var(--text-muted);
			font-size: 0.8em;
			margin-bottom: 4px;
			word-break: break-all;
			flex-shrink: 0;
		`;

		// 文件大小
		const fileSize = infoContent.createDiv('file-size');
		fileSize.textContent = ImageProcessor.formatFileSize(image.size);
		fileSize.style.cssText = `
			color: var(--text-muted);
			font-size: 0.8em;
			margin-bottom: 8px;
			flex-shrink: 0;
		`;

		// 所有图片都显示删除按钮 - 固定在底部
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
		deleteBtn.addEventListener('click', async () => {
			await this.deleteImage(image, group);
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
		// 删除除第一张外的所有重复图片
		const duplicates = group.images.slice(1);
		const totalSize = duplicates.reduce((sum, img) => sum + img.size, 0);
		
		const confirmMessage = `确定要删除以下 ${duplicates.length} 张重复图片吗？\n\n这将释放 ${ImageProcessor.formatFileSize(totalSize)} 空间。\n\n此操作不可撤销。`;
		
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

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

