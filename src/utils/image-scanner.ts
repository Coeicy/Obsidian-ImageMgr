import { App, Notice, TFile, Vault } from 'obsidian';
import { ImageInfo } from '../types';
import { calculateFileHash } from './image-hash';
import { HashCacheManager } from './hash-cache-manager';
import ImageManagementPlugin from '../main';
import { OperationType } from './logger';

/**
 * 扫描进度回调
 */
export interface ScanProgress {
	current: number;
	total: number;
	currentFile?: string;
	phase: 'scanning' | 'hashing' | 'complete';
}

/**
 * 扫描结果
 */
export interface ScanResult {
	images: ImageInfo[];
	duplicateCount: number;
	uniqueCount: number;
	totalSize: number;
	hashMap: Map<string, ImageInfo[]>;
}

/**
 * 图片扫描器
 * 负责扫描图片文件并计算哈希值，支持进度显示和后台扫描
 */
export class ImageScanner {
	private hashCacheManager: HashCacheManager;
	private readonly BATCH_SIZE = 10; // 每批处理的文件数量
	private readonly HASH_BATCH_SIZE = 5; // 每批计算的哈希值数量

	constructor(
		private app: App,
		private vault: Vault,
		private plugin: ImageManagementPlugin
	) {
		this.hashCacheManager = new HashCacheManager(plugin);
	}

	/**
	 * 扫描图片文件
	 * @param onProgress 进度回调
	 * @param enableDeduplication 是否启用去重
	 */
	async scanImages(
		onProgress?: (progress: ScanProgress) => void,
		enableDeduplication: boolean = true
	): Promise<ScanResult> {
		const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
		const files = this.vault.getFiles();
		
		// 第一阶段：扫描文件
		onProgress?.({ current: 0, total: files.length, phase: 'scanning' });
		
		const imageFiles: TFile[] = [];
		const imageInfos: ImageInfo[] = [];
		
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			// 排除回收站中的文件
			if (file.path.startsWith('.trash')) {
				continue;
			}
			
			if (imageExtensions.some(ext => file.path.toLowerCase().endsWith(ext))) {
				const imageInfo: ImageInfo = {
					path: file.path,
					name: file.name,
					size: file.stat.size,
					modified: file.stat.mtime
				};
				
				// 异步加载图片尺寸（不阻塞扫描流程）
				this.loadImageDimensions(file as TFile, imageInfo).catch(() => {
					// 静默失败，不影响扫描流程
				});
				
				imageFiles.push(file as TFile);
				imageInfos.push(imageInfo);
			}
			
			// 每处理100个文件更新一次进度
			if (i % 100 === 0) {
				onProgress?.({ 
					current: i, 
					total: files.length, 
					phase: 'scanning',
					currentFile: file.name
				});
				// 让出控制权，避免阻塞UI
				await new Promise(resolve => setTimeout(resolve, 0));
			}
		}
		
		onProgress?.({ 
			current: files.length, 
			total: files.length, 
			phase: 'scanning' 
		});
		
		// 第二阶段：计算哈希值（如果启用去重）
		const hashMap = new Map<string, ImageInfo[]>();
		let duplicateCount = 0;
		
		if (enableDeduplication && imageFiles.length > 0) {
			onProgress?.({ 
				current: 0, 
				total: imageFiles.length, 
				phase: 'hashing' 
			});
			
			// 分批计算哈希值，避免阻塞UI
			for (let i = 0; i < imageFiles.length; i += this.HASH_BATCH_SIZE) {
				const batch = imageFiles.slice(i, i + this.HASH_BATCH_SIZE);
				const batchInfos = imageInfos.slice(i, i + this.HASH_BATCH_SIZE);
				
				// 并行计算当前批次的哈希值
				const hashPromises = batch.map(async (file, batchIndex) => {
					const globalIndex = i + batchIndex;
					
					// 检查缓存
					const cachedHash = this.hashCacheManager.getCachedHash(file);
					if (cachedHash) {
						return { hash: cachedHash, index: globalIndex };
					}
					
					// 计算哈希值
					try {
						const hash = await calculateFileHash(file, this.vault);
						// 保存到缓存（不再是 async）
						this.hashCacheManager.setCachedHash(file, hash);
						return { hash, index: globalIndex };
					} catch (error) {
						if (this.plugin?.logger) {
							await this.plugin.logger.error(OperationType.SCAN, '计算哈希失败', {
								error: error as Error,
								imagePath: file.path,
								imageName: file.name
							});
						}
						return { hash: null, index: globalIndex };
					}
				});
				
				const results = await Promise.all(hashPromises);
				
				// 分配哈希值并检查重复
				for (const result of results) {
					if (result.hash) {
						const imageInfo = batchInfos[result.index - i];
						imageInfo.md5 = result.hash;
						
						if (!hashMap.has(result.hash)) {
							hashMap.set(result.hash, []);
						}
						hashMap.get(result.hash)!.push(imageInfo);
					}
				}
				
				// 更新进度
				onProgress?.({ 
					current: Math.min(i + this.HASH_BATCH_SIZE, imageFiles.length), 
					total: imageFiles.length, 
					phase: 'hashing',
					currentFile: batch[batch.length - 1]?.name
				});
				
				// 让出控制权，避免阻塞UI
				await new Promise(resolve => setTimeout(resolve, 10));
			}
			
			// 统计重复项
			for (const [hash, images] of hashMap.entries()) {
				if (images.length > 1) {
					duplicateCount += images.length - 1;
				}
			}
		}
		
		onProgress?.({ 
			current: imageFiles.length, 
			total: imageFiles.length, 
			phase: 'complete' 
		});
		
		// 扫描完成后强制保存哈希缓存
		if (enableDeduplication) {
			await this.hashCacheManager.flushCache();
		}
		
		const uniqueCount = enableDeduplication && hashMap.size > 0 
			? hashMap.size 
			: imageInfos.length;
		const totalSize = imageInfos.reduce((sum, img) => sum + img.size, 0);
		
		return {
			images: imageInfos,
			duplicateCount,
			uniqueCount,
			totalSize,
			hashMap
		};
	}

	/**
	 * 加载图片尺寸信息
	 * @param file 图片文件
	 * @param imageInfo 图片信息对象
	 */
	private async loadImageDimensions(file: TFile, imageInfo: ImageInfo): Promise<void> {
		try {
			const imageUrl = this.vault.getResourcePath(file);
			if (!imageUrl) return;
			
			// 使用 Image 对象加载图片以获取尺寸
			return new Promise((resolve, reject) => {
				const img = new Image();
				img.onload = () => {
					imageInfo.width = img.naturalWidth;
					imageInfo.height = img.naturalHeight;
					resolve();
				};
				img.onerror = () => {
					reject(new Error('Failed to load image'));
				};
				img.src = imageUrl;
			});
		} catch (error) {
			// 静默失败，不影响扫描流程
		}
	}

	/**
	 * 清理无效缓存
	 */
	async cleanupCache(): Promise<number> {
		return await this.hashCacheManager.cleanupCache(this.vault);
	}

	/**
	 * 清除所有缓存
	 */
	async clearCache(): Promise<void> {
		await this.hashCacheManager.clearAllCache();
	}

	/**
	 * 获取缓存统计信息
	 */
	getCacheStats() {
		return this.hashCacheManager.getCacheStats();
	}
}

