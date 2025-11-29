import { App, Modal } from 'obsidian';
import { ImageInfo } from '../types';
import { ImageProcessor } from '../utils/image-processor';
import { makeModalResizable } from '../utils/resizable-modal';

export class StatsModal extends Modal {
	images: ImageInfo[];

	constructor(app: App, images: ImageInfo[]) {
		super(app);
		this.images = images;
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

		// 显示总体统计
		const totalEl = scrollContainer.createDiv('stats-section');
		totalEl.createEl('h3', { text: '📦 总体统计' });
		const totalList = totalEl.createEl('ul', { cls: 'stats-list' });
		totalList.createEl('li', { 
			text: `图片总数: ${stats.totalCount} 张` 
		});
		totalList.createEl('li', { 
			text: `总大小: ${ImageProcessor.formatFileSize(stats.totalSize)}` 
		});
		totalList.createEl('li', { 
			text: `平均大小: ${ImageProcessor.formatFileSize(stats.averageSize)}` 
		});
		if (stats.largestFile) {
			totalList.createEl('li', { 
				text: `最大文件: ${stats.largestFile.name} (${ImageProcessor.formatFileSize(stats.largestFile.size)})` 
			});
		}
		if (stats.smallestFile) {
			totalList.createEl('li', { 
				text: `最小文件: ${stats.smallestFile.name} (${ImageProcessor.formatFileSize(stats.smallestFile.size)})` 
			});
		}

		// 显示类型统计
		const typeEl = scrollContainer.createDiv('stats-section');
		typeEl.createEl('h3', { text: '📁 文件类型统计' });
		const typeList = typeEl.createEl('ul', { cls: 'stats-list' });
		
		for (const [type, count] of Object.entries(stats.typeCount).sort((a, b) => b[1] - a[1])) {
			const size = stats.typeSize[type] || 0;
			const percentage = ((count / stats.totalCount) * 100).toFixed(1);
			typeList.createEl('li', { 
				text: `${type.toUpperCase()}: ${count} 张 (${percentage}%) - ${ImageProcessor.formatFileSize(size)}` 
			});
		}

		// 显示尺寸统计
		if (stats.hasDimensions) {
			const dimEl = scrollContainer.createDiv('stats-section');
			dimEl.createEl('h3', { text: '📐 尺寸统计' });
			const dimList = dimEl.createEl('ul', { cls: 'stats-list' });
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
	}

	calculateStats() {
		const stats = {
			totalCount: this.images.length,
			totalSize: 0,
			averageSize: 0,
			typeCount: {} as Record<string, number>,
			typeSize: {} as Record<string, number>,
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

