/**
 * 图片统计信息模态框模块
 * 
 * 提供图片库的统计信息展示。
 */

import { App, Modal } from 'obsidian';
import { ImageInfo, LinkFormatStats } from '../types';
import { ImageProcessor } from '../utils/image-processor';
import { makeModalResizable } from '../utils/resizable-modal';

/**
 * 图片统计信息模态框类
 * 
 * 功能：
 * - 显示图片总数、总大小、平均大小
 * - 显示最大/最小文件
 * - 按文件类型统计（PNG、JPG 等）
 * - 按文件夹统计
 */
export class StatsModal extends Modal {
	/** 图片列表 */
	images: ImageInfo[];
	/** 链接统计信息 */
	linkStats?: LinkFormatStats;

	constructor(app: App, images: ImageInfo[], linkStats?: LinkFormatStats) {
		super(app);
		this.images = images;
		this.linkStats = linkStats;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		// 设置内容区域样式，使其可以滚动
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.height = '100%';
		contentEl.style.overflow = 'hidden';
		
		// 启用模态框可调整大小
		makeModalResizable(this.modalEl, {
			minWidth: 500,
			minHeight: 400,
		});

		const title = contentEl.createEl('h2', { text: '📊 图片统计信息' });
		title.style.flexShrink = '0';
		title.style.marginBottom = '16px';
		title.style.fontSize = '20px';
		title.style.fontWeight = '600';
		title.style.color = 'var(--text-normal)';
		title.style.fontFamily = 'inherit';
		title.style.lineHeight = '1.4';
		
		// 创建可滚动的内容容器
		const scrollContainer = contentEl.createDiv();
		scrollContainer.style.flex = '1';
		scrollContainer.style.overflowY = 'auto';
		scrollContainer.style.overflowX = 'hidden';

		if (this.images.length === 0) {
			scrollContainer.createDiv({ text: '📭 库中暂无图片' });
			return;
		}

		// 计算统计信息
		const stats = this.calculateStats();

		// 显示基本统计信息
		const basicEl = scrollContainer.createDiv('stats-section');
		basicEl.createEl('h3', { text: '📊 基本统计' });
		const basicList = basicEl.createEl('ul', { cls: 'stats-list' });
		basicList.createEl('li', { 
			text: `图片总数: ${stats.totalCount} 张` 
		});
		basicList.createEl('li', { 
			text: `总大小: ${ImageProcessor.formatFileSize(stats.totalSize)}` 
		});
		basicList.createEl('li', { 
			text: `平均大小: ${ImageProcessor.formatFileSize(stats.averageSize)}` 
		});
		if (stats.largestFile) {
			basicList.createEl('li', { 
				text: `最大文件: ${stats.largestFile.name} (${ImageProcessor.formatFileSize(stats.largestFile.size)})` 
			});
		}
		if (stats.smallestFile) {
			basicList.createEl('li', { 
				text: `最小文件: ${stats.smallestFile.name} (${ImageProcessor.formatFileSize(stats.smallestFile.size)})` 
			});
		}

		// 显示分布统计信息
		const distributionEl = scrollContainer.createDiv('stats-section');
		distributionEl.createEl('h3', { text: '📈 分布统计' });
		
		// 文件类型分布
		const typeGroup = distributionEl.createDiv();
		typeGroup.createEl('h4', { text: '📁 文件类型分布' });
		const typeList = typeGroup.createEl('ul', { cls: 'stats-list' });
		
		for (const [type, count] of Object.entries(stats.typeCount).sort((a, b) => b[1] - a[1])) {
			const size = stats.typeSize[type] || 0;
			const percentage = ((count / stats.totalCount) * 100).toFixed(1);
			typeList.createEl('li', { 
				text: `${type.toUpperCase()}: ${count} 张 (${percentage}%) - ${ImageProcessor.formatFileSize(size)}` 
			});
		}

		// 文件夹分布
		const folderGroup = distributionEl.createDiv();
		folderGroup.style.marginTop = '16px';
		folderGroup.createEl('h4', { text: '📂 文件夹分布' });
		const folderList = folderGroup.createEl('ul', { cls: 'stats-list' });
		
		// 按文件数量排序，显示前10个文件夹
		const sortedFolders = Object.entries(stats.folderCount)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10);
		
		for (const [folder, count] of sortedFolders) {
			const size = stats.folderSize[folder] || 0;
			const percentage = ((count / stats.totalCount) * 100).toFixed(1);
			folderList.createEl('li', { 
				text: `${folder}: ${count} 张 (${percentage}%) - ${ImageProcessor.formatFileSize(size)}` 
			});
		}

		// 显示更多文件夹链接（如果有更多）
		if (Object.keys(stats.folderCount).length > 10) {
			const moreLink = folderGroup.createDiv();
			moreLink.style.textAlign = 'center';
			moreLink.style.marginTop = '12px';
			moreLink.style.padding = '8px';
			moreLink.style.color = 'var(--text-muted)';
			moreLink.style.fontSize = '0.9em';
			moreLink.textContent = `... 还有 ${Object.keys(stats.folderCount).length - 10} 个文件夹`;
		}

		// 尺寸统计（如果有尺寸信息）
		if (stats.hasDimensions) {
			const dimGroup = distributionEl.createDiv();
			dimGroup.style.marginTop = '16px';
			dimGroup.createEl('h4', { text: '📐 尺寸分布' });
			const dimList = dimGroup.createEl('ul', { cls: 'stats-list' });
			dimList.createEl('li', { 
				text: `平均尺寸: ${stats.averageWidth} × ${stats.averageHeight} 像素` 
			});
			dimList.createEl('li', { 
				text: `最大尺寸: ${stats.maxWidth} × ${stats.maxHeight} 像素` 
			});
			dimList.createEl('li', { 
				text: `最小尺寸: ${stats.minWidth} × ${stats.minHeight} 像素` 
			});
		}

		// 显示链接统计
		if (this.linkStats) {
			const linkEl = scrollContainer.createDiv('stats-section');
			linkEl.createEl('h3', { text: '🔗 链接统计' });
			const linkList = linkEl.createEl('ul', { cls: 'stats-list' });
			
			linkList.createEl('li', { text: `链接总数: ${this.linkStats.total}` });
			linkList.createEl('li', { text: `Wiki 链接: ${this.linkStats.wiki}` });
			linkList.createEl('li', { text: `Markdown 链接: ${this.linkStats.markdown}` });
			linkList.createEl('li', { text: `HTML 链接: ${this.linkStats.html}` });
			
			if (this.linkStats.remote > 0) {
				const remoteLi = linkList.createEl('li');
				remoteLi.createSpan({ text: `🌐 网络图片: ` });
				const remoteCountSpan = remoteLi.createSpan({ text: `${this.linkStats.remote} 张` });
				
				// 显示去重后的网络链接数量
				if (this.linkStats.remoteLinks && this.linkStats.remoteLinks.length > 0) {
					const uniqueLinks = [...new Set(this.linkStats.remoteLinks)];
					if (uniqueLinks.length < this.linkStats.remote) {
						remoteLi.createSpan({ text: ` (去重后: ${uniqueLinks.length} 张)` });
					}
				}
			}
		}
	}

	calculateStats() {
		const stats = {
			totalCount: this.images.length,
			totalSize: 0,
			averageSize: 0,
			typeCount: {} as Record<string, number>,
			typeSize: {} as Record<string, number>,
			folderCount: {} as Record<string, number>,
			folderSize: {} as Record<string, number>,
			hasDimensions: false,
			totalWidth: 0,
			totalHeight: 0,
			countWithDimensions: 0,
			maxWidth: 0,
			maxHeight: 0,
			minWidth: Infinity,
			minHeight: Infinity,
			averageWidth: 0,
			averageHeight: 0,
			largestFile: null as ImageInfo | null,
			smallestFile: null as ImageInfo | null
		};

		for (const image of this.images) {
			// 统计大小
			stats.totalSize += image.size;

			// 统计最大最小文件
			if (!stats.largestFile || image.size > stats.largestFile.size) {
				stats.largestFile = image;
			}
			if (!stats.smallestFile || image.size < stats.smallestFile.size) {
				stats.smallestFile = image;
			}

		// 统计类型
		const ext = image.name.split('.').pop()?.toLowerCase() || 'unknown';
		stats.typeCount[ext] = (stats.typeCount[ext] || 0) + 1;
		stats.typeSize[ext] = (stats.typeSize[ext] || 0) + image.size;

		// 统计文件夹分布
		const folder = image.path.split('/').slice(0, -1).join('/') || '根目录';
		stats.folderCount[folder] = (stats.folderCount[folder] || 0) + 1;
		stats.folderSize[folder] = (stats.folderSize[folder] || 0) + image.size;

			// 统计尺寸
			if (image.width && image.height) {
				stats.hasDimensions = true;
				stats.totalWidth += image.width;
				stats.totalHeight += image.height;
				stats.countWithDimensions++;

				if (image.width > stats.maxWidth) stats.maxWidth = image.width;
				if (image.height > stats.maxHeight) stats.maxHeight = image.height;
				if (image.width < stats.minWidth) stats.minWidth = image.width;
				if (image.height < stats.minHeight) stats.minHeight = image.height;
			}
		}

		// 计算平均值
		stats.averageSize = stats.totalCount > 0 ? stats.totalSize / stats.totalCount : 0;
		stats.averageWidth = stats.countWithDimensions > 0 ? Math.round(stats.totalWidth / stats.countWithDimensions) : 0;
		stats.averageHeight = stats.countWithDimensions > 0 ? Math.round(stats.totalHeight / stats.countWithDimensions) : 0;

		// 确保有值
		if (stats.minWidth === Infinity) stats.minWidth = 0;
		if (stats.minHeight === Infinity) stats.minHeight = 0;

		return stats;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

