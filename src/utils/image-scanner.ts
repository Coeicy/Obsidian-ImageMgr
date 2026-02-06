/**
 * 图片扫描器模块
 * 
 * 核心功能：
 * - 扫描 Obsidian 仓库中的所有图片文件
 * - 可选地计算 MD5 哈希值用于去重
 * - 检测图片引用关系（支持多种链接格式）
 * - 支持增量扫描（仅处理修改的文件）
 * - 检测和统计空链接（指向不存在图片的链接）
 * - 统计链接格式（Wiki/Markdown/HTML）
 * 
 * 支持的图片格式：
 * - PNG (.png)
 * - JPEG (.jpg, .jpeg)
 * - GIF (.gif)
 * - WebP (.webp)
 * - SVG (.svg)
 * - BMP (.bmp)
 * 
 * 扫描流程：
 * 1. **文件扫描阶段**（scanning）：
 *    - 获取所有图片文件
 *    - 检查文件修改状态（mtime/size）
 *    - 使用缓存加速重复扫描
 *    - 异步加载图片尺寸信息
 * 
 * 2. **哈希计算阶段**（hashing）：
 *    - 批量计算 MD5 哈希值
 *    - 使用哈希缓存避免重复计算
 *    - 检测重复图片
 * 
 * 3. **引用统计阶段**（references）：
 *    - 扫描所有 Markdown 文件
 *    - 查找图片引用关系
 *    - 支持多种链接格式
 *    - 智能代码块过滤
 * 
 * 4. **链接统计阶段**（links）：
 *    - 统计各种链接格式数量
 *    - 检测空链接
 *    - 收集网络图片信息
 * 
 * 性能优化：
 * - 批量处理文件（每批10个）避免阻塞UI
 * - 增量扫描缓存（基于mtime/size）
 * - 哈希值缓存（避免重复计算）
 * - 异步图片加载（不阻塞扫描流程）
 * - 定期让出控制权（setTimeout 0）
 * 
 * 使用示例：
 * ```typescript
 * // 创建扫描器
 * const scanner = new ImageScanner(app, vault, plugin);
 * 
 * // 执行扫描（带进度回调）
 * const result = await scanner.scanImages(
 *     (progress) => {
 *         console.log(`${progress.phase}: ${progress.current}/${progress.total}`);
 *         console.log(`缓存命中: ${progress.cacheHits}, 新扫描: ${progress.newScans}`);
 *     },
 *     true,  // 启用去重
 *     false // 不强制全量扫描（使用缓存）
 * );
 * 
 * console.log(`扫描完成：`);
 * console.log(`- 总图片数: ${result.images.length}`);
 * console.log(`- 重复图片: ${result.duplicateCount}`);
 * console.log(`- 唯一图片: ${result.uniqueCount}`);
 * console.log(`- 总大小: ${(result.totalSize / 1024 / 1024).toFixed(2)} MB`);
 * console.log(`- 空链接: ${result.brokenLinks?.length || 0}`);
 * 
 * // 查看链接格式统计
 * if (result.linkFormatStats) {
 *     console.log(`- Wiki链接: ${result.linkFormatStats.wiki}`);
 *     console.log(`- Markdown链接: ${result.linkFormatStats.markdown}`);
 *     console.log(`- HTML链接: ${result.linkFormatStats.html}`);
 *     console.log(`- 网络图片: ${result.linkFormatStats.remote}`);
 * }
 * 
 * // 查看重复图片
 * for (const [hash, images] of result.hashMap.entries()) {
 *     if (images.length > 1) {
 *         console.log(`重复图片 ${hash}: ${images.map(i => i.path).join(', ')}`);
 *     }
 * }
 * 
 * // 清理缓存
 * await scanner.clearCache();
 * 
 * // 获取缓存统计
 * const stats = scanner.getCacheStats();
 * console.log(`哈希缓存: ${stats.hashCacheSize}`);
 * console.log(`扫描缓存: ${stats.scanCacheSize}`);
 * ```
 * 
 * 增量扫描说明：
 * - 首次扫描：扫描所有文件，建立缓存
 * - 后续扫描：仅扫描修改的文件（mtime/size变化）
 * - 强制全量扫描：设置 forceFullScan = true
 * - 引用信息不使用缓存：因为引用关系取决于Markdown文件内容
 * 
 * 注意事项：
 * - 扫描过程会占用大量内存（所有图片信息）
 * - 哈希计算会消耗CPU资源（大文件）
 * - 引用统计需要遍历所有Markdown文件
 * - 网络图片仅收集信息，不下载文件
 */

import { App, Notice, TFile, Vault } from 'obsidian';
import { ImageInfo, ImageReferenceInfo, BrokenLinkInfo, LinkFormatStats } from '../types';
import { calculateFileHash } from './image-hash';
import { HashCacheManager } from './hash-cache-manager';
import ImageManagementPlugin from '../main';
import { OperationType } from './logger';

/**
 * 扫描进度信息接口
 * 
 * 用于向 UI 报告扫描进度，支持多个阶段：
 * - scanning: 扫描文件阶段
 * - hashing: 计算哈希值阶段
 * - references: 统计引用信息阶段
 * - links: 统计链接格式和空链接阶段
 * - complete: 扫描完成
 */
export interface ScanProgress {
	/** 当前已处理的文件数 */
	current: number;
	/** 总文件数 */
	total: number;
	/** 当前正在处理的文件名（可选） */
	currentFile?: string;
	/** 当前扫描阶段 */
	phase: 'scanning' | 'hashing' | 'references' | 'links' | 'complete';
	/** 是否使用了缓存（增量扫描） */
	usedCache?: boolean;
	/** 缓存命中数量 */
	cacheHits?: number;
	/** 新扫描数量 */
	newScans?: number;
}

/**
 * 扫描结果接口
 * 
 * 包含扫描完成后的所有统计信息和图片数据
 */
export interface ScanResult {
	/** 所有扫描到的图片信息数组 */
	images: ImageInfo[];
	/** 重复图片数量（基于 MD5 哈希） */
	duplicateCount: number;
	/** 唯一图片数量 */
	uniqueCount: number;
	/** 所有图片的总大小（字节） */
	totalSize: number;
	/** 哈希值到图片列表的映射（用于快速查找重复） */
	hashMap: Map<string, ImageInfo[]>;
	/** 空链接列表（指向不存在图片的链接） */
	brokenLinks?: BrokenLinkInfo[];
	/** 链接格式统计 */
	linkFormatStats?: LinkFormatStats;
}

/**
 * 图片扫描器类
 * 
 * 核心功能：
 * - 扫描仓库中所有图片文件（PNG、JPG、GIF、WEBP、SVG、BMP）
 * - 自动排除回收站中的文件
 * - 异步加载图片尺寸信息
 * - 分批计算 MD5 哈希值（避免阻塞 UI）
 * - 使用缓存加速重复扫描
 * - 检测重复图片
 * 
 * 性能优化：
 * - 批量处理文件，定期让出控制权
 * - 哈希值缓存，避免重复计算
 * - 并行计算哈希值
 */
export class ImageScanner {
	/** 哈希缓存管理器 */
	private hashCacheManager: HashCacheManager;
	/** 每批处理的文件数量（用于扫描阶段） */
	private readonly BATCH_SIZE = 10;
	/** 每批计算的哈希值数量（用于哈希阶段） */
	private readonly HASH_BATCH_SIZE = 5;

	/**
	 * 创建图片扫描器实例
	 * @param app - Obsidian App 实例
	 * @param vault - Obsidian Vault 实例
	 * @param plugin - 插件实例
	 */
	constructor(
		private app: App,
		private vault: Vault,
		private plugin: ImageManagementPlugin
	) {
		this.hashCacheManager = new HashCacheManager(plugin);
	}

	/**
	 * 扫描图片文件（支持增量扫描）
	 * @param onProgress 进度回调
	 * @param enableDeduplication 是否启用去重
	 * @param forceFullScan 是否强制全量扫描（忽略缓存）
	 */
	async scanImages(
		onProgress?: (progress: ScanProgress) => void,
		enableDeduplication: boolean = true,
		forceFullScan: boolean = false
	): Promise<ScanResult> {
		const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
		const files = this.vault.getFiles();
		
		// 获取扫描缓存
		const scanCache = this.plugin.data?.imageScanCache || {};
		const useCachedData = !forceFullScan && Object.keys(scanCache).length > 0;

		// 第一阶段：扫描文件（增量扫描）
		onProgress?.({ current: 0, total: files.length, phase: 'scanning', usedCache: useCachedData });
		
		const imageFiles: TFile[] = [];
		const imageInfos: ImageInfo[] = [];
		let cacheHits = 0;
		let newScans = 0;
		
		// 记录当前存在的文件路径（用于清理已删除文件的缓存）
		const currentFilePaths = new Set<string>();
		
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			// 排除回收站中的文件
			if (file.path.startsWith('.trash')) {
				continue;
			}
			
			if (imageExtensions.some(ext => file.path.toLowerCase().endsWith(ext))) {
				currentFilePaths.add(file.path);
				
				// 检查缓存：如果文件未修改，使用缓存数据
				const cached = scanCache[file.path];
				const fileUnchanged = cached && 
					cached.mtime === file.stat.mtime && 
					cached.size === file.stat.size;
				
				let imageInfo: ImageInfo;
				
				if (useCachedData && fileUnchanged) {
					// 使用缓存数据
					// 注意：引用信息不使用缓存，因为引用关系取决于 Markdown 文件内容，
					// 即使图片文件未修改，引用也可能发生变化。
					// 引用信息将在后续步骤中重新计算。
					imageInfo = {
						path: file.path,
						name: file.name,
						size: cached.size,
						modified: cached.mtime,
						width: cached.width,
						height: cached.height,
						md5: cached.md5
					};
					cacheHits++;
				} else {
					// 新文件或已修改，需要重新扫描
					imageInfo = {
						path: file.path,
						name: file.name,
						size: file.stat.size,
						modified: file.stat.mtime
					};
					
					// 异步加载图片尺寸（不阻塞扫描流程）
					this.loadImageDimensions(file as TFile, imageInfo).catch(() => {
						// 静默失败，不影响扫描流程
					});
					newScans++;
				}
				
				imageFiles.push(file as TFile);
				imageInfos.push(imageInfo);
			}
			
			// 每处理100个文件更新一次进度
			if (i % 100 === 0) {
				onProgress?.({ 
					current: i, 
					total: files.length, 
					phase: 'scanning',
					currentFile: file.name,
					usedCache: useCachedData,
					cacheHits,
					newScans
				});
				// 让出控制权，避免阻塞UI
				await new Promise(resolve => setTimeout(resolve, 0));
			}
		}
		
		onProgress?.({ 
			current: files.length, 
			total: files.length, 
			phase: 'scanning',
			usedCache: useCachedData,
			cacheHits,
			newScans
		});

		// 第二阶段：计算哈希值（如果启用去重）
		const hashMap = new Map<string, ImageInfo[]>();
		let duplicateCount = 0;
		
		// 需要计算哈希的文件（没有缓存的 MD5 或文件已修改）
		const filesToHash: { file: TFile; info: ImageInfo; index: number }[] = [];
		
		if (enableDeduplication && imageFiles.length > 0) {
			// 先处理已有 MD5 的图片（从缓存中获取）
			for (let i = 0; i < imageInfos.length; i++) {
				const imageInfo = imageInfos[i];
				if (imageInfo.md5) {
					// 已有 MD5，直接添加到 hashMap
					if (!hashMap.has(imageInfo.md5)) {
						hashMap.set(imageInfo.md5, []);
					}
					hashMap.get(imageInfo.md5)!.push(imageInfo);
				} else {
					// 需要计算哈希
					filesToHash.push({ file: imageFiles[i], info: imageInfo, index: i });
				}
			}
			
			// 只对需要计算的文件进行哈希计算
			if (filesToHash.length > 0) {
				onProgress?.({ 
					current: 0, 
					total: filesToHash.length, 
					phase: 'hashing',
					usedCache: useCachedData,
					cacheHits: imageInfos.length - filesToHash.length,
					newScans: filesToHash.length
				});
				
				// 分批计算哈希值，避免阻塞UI
				for (let i = 0; i < filesToHash.length; i += this.HASH_BATCH_SIZE) {
					const batch = filesToHash.slice(i, i + this.HASH_BATCH_SIZE);
					
					// 并行计算当前批次的哈希值
					const hashPromises = batch.map(async ({ file, info }) => {
						// 检查哈希缓存管理器
						const cachedHash = this.hashCacheManager.getCachedHash(file);
						if (cachedHash) {
							return { hash: cachedHash, info };
						}
						
						// 计算哈希值
						try {
							const hash = await calculateFileHash(file, this.vault);
							// 保存到缓存
							this.hashCacheManager.setCachedHash(file, hash);
							return { hash, info };
						} catch (error) {
							if (this.plugin?.logger) {
								await this.plugin.logger.error(OperationType.SCAN, '计算哈希失败', {
									error: error as Error,
									imagePath: file.path,
									imageName: file.name
								});
							}
							return { hash: null, info };
						}
					});
					
					const results = await Promise.all(hashPromises);
					
					// 分配哈希值并检查重复
					for (const result of results) {
						if (result.hash) {
							result.info.md5 = result.hash;
							
							if (!hashMap.has(result.hash)) {
								hashMap.set(result.hash, []);
							}
							hashMap.get(result.hash)!.push(result.info);
						}
					}
					
					// 更新进度
					onProgress?.({ 
						current: Math.min(i + this.HASH_BATCH_SIZE, filesToHash.length), 
						total: filesToHash.length, 
						phase: 'hashing',
						currentFile: batch[batch.length - 1]?.file.name,
						usedCache: useCachedData,
						cacheHits: imageInfos.length - filesToHash.length,
						newScans: filesToHash.length
					});
					
					// 让出控制权，避免阻塞UI
					await new Promise(resolve => setTimeout(resolve, 10));
				}
			}
			
			// 统计重复项
			for (const [hash, images] of hashMap.entries()) {
				if (images.length > 1) {
					duplicateCount += images.length - 1;
				}
			}
		}
		
		// 第三阶段：统计引用信息
		onProgress?.({ 
			current: 0, 
			total: imageInfos.length, 
			phase: 'references',
			usedCache: useCachedData,
			cacheHits,
			newScans
		});
		
		// 批量统计引用信息
		await this.calculateReferences(imageInfos, onProgress, useCachedData, cacheHits, newScans);
		
		// 第四阶段：统计链接格式和空链接
		onProgress?.({ 
			current: 0, 
			total: 100, 
			phase: 'links',
			usedCache: useCachedData,
			cacheHits,
			newScans
		});
		
		// 计算链接格式统计和空链接
		const { brokenLinks, linkFormatStats, remoteImages } = await this.calculateLinkStats(imageInfos, onProgress, useCachedData, cacheHits, newScans);
		
		// 合并网络图片到主列表
		if (remoteImages && remoteImages.length > 0) {
			imageInfos.push(...remoteImages);
		}

		onProgress?.({ 
			current: imageFiles.length, 
			total: imageFiles.length, 
			phase: 'complete',
			usedCache: useCachedData,
			cacheHits,
			newScans
		});
		
		// 扫描完成后保存扫描缓存（包含引用信息）
		await this.saveScanCache(imageInfos, currentFilePaths);
		
		// 保存空链接和链接格式统计到插件数据
		if (this.plugin) {
			this.plugin.data.brokenLinks = brokenLinks;
			this.plugin.data.brokenLinksUpdatedAt = Date.now();
			this.plugin.data.linkFormatStats = linkFormatStats;
			this.plugin.data.linkFormatStatsUpdatedAt = Date.now();
		}
		
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
			hashMap,
			brokenLinks,
			linkFormatStats
		};
	}
	
	/**
	 * 批量计算引用信息
	 * 
	 * 扫描所有 Markdown 文件，查找图片引用并填充到 ImageInfo 中。
	 * 支持的链接格式：
	 * - Wiki 格式：![[image.png]] 或 ![[image.png|显示文本]]
	 * - Wiki 无感叹号格式：[[image.png]]
	 * - Markdown 格式：![alt](image.png)
	 * - HTML 格式：<img src="image.png">
	 * 
	 * 计算结果会存储在 ImageInfo 的以下字段：
	 * - references: 引用信息数组
	 * - referenceCount: 引用数量
	 * - referencesUpdatedAt: 更新时间戳
	 * 
	 * @param imageInfos 图片信息数组
	 * @param onProgress 进度回调
	 * @param useCachedData 是否使用缓存数据
	 * @param cacheHits 缓存命中数
	 * @param newScans 新扫描数
	 */
	private async calculateReferences(
		imageInfos: ImageInfo[], 
		onProgress?: (progress: ScanProgress) => void,
		useCachedData?: boolean,
		cacheHits?: number,
		newScans?: number
	): Promise<void> {
		// 构建图片路径到 ImageInfo 的映射，方便快速查找
		const imagePathMap = new Map<string, ImageInfo>();
		for (const info of imageInfos) {
			imagePathMap.set(info.path, info);
			// 初始化引用信息
			info.references = [];
			info.referenceCount = 0;
		}
		
		// 获取所有 Markdown 文件
		const mdFiles = this.app.vault.getMarkdownFiles();
		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
		
		// 遍历所有 Markdown 文件，查找图片引用
		for (let i = 0; i < mdFiles.length; i++) {
			const mdFile = mdFiles[i];
			
			try {
				const cache = this.app.metadataCache.getFileCache(mdFile);
				if (!cache || !cache.embeds) continue;
				
				// 读取文件内容以获取完整行
				const content = await this.vault.cachedRead(mdFile);
				const lines = content.split('\n');
				
				for (const embed of cache.embeds) {
					// 解析链接目标
					const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, mdFile.path);
					if (!resolvedFile) continue;
					
					// 检查是否是图片文件
					const ext = resolvedFile.extension?.toLowerCase();
					if (!ext || !imageExtensions.includes(ext)) continue;
					
					// 查找对应的 ImageInfo
					const imageInfo = imagePathMap.get(resolvedFile.path);
					if (!imageInfo) continue;
					
					// 获取行号和行内容
					const lineNumber = embed.position.start.line + 1;
					const fullLine = lines[embed.position.start.line] || '';
					
					// 提取显示文本和链接格式类型
					let displayText = '';
					let matchType = 'wiki'; // 默认类型
					
					// 检测 Wiki 格式 ![[...]]
					const wikiMatch = fullLine.match(/!\[\[([^\]]+)\]\]/);
					if (wikiMatch) {
						const parts = wikiMatch[1].split('|');
						if (parts.length > 1) {
							// 最后一个非数字部分可能是显示文本
							for (let j = parts.length - 1; j > 0; j--) {
								const part = parts[j].trim();
								if (!/^\d+x?\d*$/.test(part)) {
									displayText = part;
									matchType = 'wiki-with-text';
									break;
								}
							}
						}
					} else {
						// 检测无感叹号的 Wiki 格式 [[...]]
						const wikiNoExclamMatch = fullLine.match(/\[\[([^\]]+)\]\]/);
						if (wikiNoExclamMatch) {
							matchType = 'wiki-no-exclam';
							const parts = wikiNoExclamMatch[1].split('|');
							if (parts.length > 1) {
								for (let j = parts.length - 1; j > 0; j--) {
									const part = parts[j].trim();
									if (!/^\d+x?\d*$/.test(part)) {
										displayText = part;
										matchType = 'wiki-no-exclam-with-text';
										break;
									}
								}
							}
						} else {
							// 检测 Markdown 格式 ![...](...)
							const mdMatch = fullLine.match(/!\[([^\]]*)\]\([^)]+\)/);
							if (mdMatch) {
								matchType = 'markdown';
								displayText = mdMatch[1] || '';
							} else {
								// 检测 HTML 格式 <img ...>
								const htmlMatch = fullLine.match(/<img[^>]+>/i);
								if (htmlMatch) {
									matchType = 'html';
									// 尝试提取 alt 属性
									const altMatch = htmlMatch[0].match(/alt=["']([^"']*)["']/i);
									if (altMatch) {
										displayText = altMatch[1];
									}
								}
							}
						}
					}
					
					// 添加引用信息
					const refInfo: ImageReferenceInfo = {
						filePath: mdFile.path,
						lineNumber,
						displayText: displayText || undefined,
						fullLine,
						matchType
					};
					
					imageInfo.references!.push(refInfo);
				}
			} catch (error) {
				// 静默失败，继续处理其他文件
			}
			
			// 每处理 50 个文件更新一次进度
			if (i % 50 === 0) {
				onProgress?.({ 
					current: i, 
					total: mdFiles.length, 
					phase: 'references',
					currentFile: mdFile.name,
					usedCache: useCachedData,
					cacheHits,
					newScans
				});
				// 让出控制权
				await new Promise(resolve => setTimeout(resolve, 0));
			}
		}
		
		// 更新引用数量和时间戳
		const now = Date.now();
		for (const info of imageInfos) {
			info.referenceCount = info.references?.length || 0;
			info.referencesUpdatedAt = now;
		}
	}
	
	/**
	 * 保存扫描缓存
	 * @param imageInfos 图片信息数组
	 * @param currentFilePaths 当前存在的文件路径集合
	 */
	private async saveScanCache(imageInfos: ImageInfo[], currentFilePaths: Set<string>): Promise<void> {
		try {
			// 获取旧的扫描缓存
			const oldCache = this.plugin.data?.imageScanCache || {};
			
			// 构建新的扫描缓存（仅保存文件元数据，不保存引用信息）
			// 引用信息变化频繁且不依赖于图片文件本身，不适合缓存
			const newCache: { [path: string]: { 
				mtime: number; 
				size: number; 
				width?: number; 
				height?: number; 
				md5?: string;
			} } = {};
			
			// 保存当前扫描到的图片信息
			for (const info of imageInfos) {
				newCache[info.path] = {
					mtime: info.modified,
					size: info.size,
					width: info.width,
					height: info.height,
					md5: info.md5
				};
			}
			
			// 清理已删除文件的缓存项
			// 遍历旧缓存，统计需要清理的项（实际清理通过替换 newCache 实现）
			let cleanedCount = 0;
			for (const cachedPath in oldCache) {
				if (!currentFilePaths.has(cachedPath)) {
					// 文件已删除，统计清理数量
					cleanedCount++;
				}
			}
			
			// 更新插件数据
			if (!this.plugin.data) {
				this.plugin.data = {};
			}
			this.plugin.data.imageScanCache = newCache;
			this.plugin.data.lastScanTime = Date.now();
			
			// 保存到磁盘
			await this.plugin.saveData(this.plugin.data);
			
			// 记录清理日志（仅在清理了缓存项时）
			if (cleanedCount > 0 && this.plugin?.logger) {
				await this.plugin.logger.debug(
					OperationType.SCAN,
					`扫描缓存清理完成：已清理 ${cleanedCount} 个已删除文件的缓存项`,
					{
						details: {
							cleanedCount,
							totalCached: Object.keys(oldCache).length,
							remainingCached: Object.keys(newCache).length
						}
					}
				);
			}
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.error(OperationType.SCAN, '保存扫描缓存失败', {
					error: error as Error
				});
			}
		}
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
	 * 清除所有缓存（包括扫描缓存和哈希缓存）
	 */
	async clearCache(): Promise<void> {
		// 清除哈希缓存
		await this.hashCacheManager.clearAllCache();
		
		// 清除扫描缓存
		await this.clearScanCache();
	}
	
	/**
	 * 清除扫描缓存
	 */
	async clearScanCache(): Promise<void> {
		if (this.plugin.data) {
			this.plugin.data.imageScanCache = {};
			this.plugin.data.lastScanTime = undefined;
			await this.plugin.saveData(this.plugin.data);
		}
	}

	/**
	 * 获取缓存统计信息
	 */
	getCacheStats() {
		const hashStats = this.hashCacheManager.getCacheStats();
		const scanCacheSize = Object.keys(this.plugin.data?.imageScanCache || {}).length;
		const lastScanTime = this.plugin.data?.lastScanTime;
		
		return {
			...hashStats,
			scanCacheSize,
			lastScanTime,
			lastScanTimeFormatted: lastScanTime 
				? new Date(lastScanTime).toLocaleString() 
				: '从未扫描'
		};
	}
	
	/**
	 * 收集网络图片信息并添加到统计中
	 */
	private collectRemoteImageInfo(
		linkPath: string,
		mdFile: TFile,
		lineNum: number,
		line: string,
		matchType: 'markdown' | 'html',
		displayText: string | undefined,
		remoteImageMap: Map<string, ImageInfo>,
		linkFormatStats: LinkFormatStats
	) {
		linkFormatStats.remote++;
		linkFormatStats.total++;
		
		// 收集网络图片信息
		if (!remoteImageMap.has(linkPath)) {
			// 从 URL 中提取文件名
			let name = linkPath.split('/').pop() || 'unknown';
			if (name.includes('?')) name = name.split('?')[0];
			if (name.includes('#')) name = name.split('#')[0];
			
			remoteImageMap.set(linkPath, {
				path: linkPath,
				name: name,
				size: 0, // 网络图片大小未知
				modified: 0, // 网络图片修改时间未知
				references: [],
				referenceCount: 0,
				isRemote: true
			});
		}
		
		// 添加引用信息
		const imgInfo = remoteImageMap.get(linkPath)!;
		imgInfo.references!.push({
			filePath: mdFile.path,
			lineNumber: lineNum + 1,
			displayText: displayText,
			fullLine: line,
			matchType: matchType,
			linkPathFormat: 'absolute' // 网络链接视为绝对路径
		});
		imgInfo.referenceCount = imgInfo.references!.length;
		imgInfo.referencesUpdatedAt = Date.now();
	}

	/**
	 * 计算链接格式统计和空链接
	 *
	 * 扫描所有 Markdown 文件，统计：
	 * 1. 各种链接格式的数量（Wiki/Markdown/HTML）
	 * 2. 链接路径格式的数量（最短/相对/绝对）
	 * 3. 空链接（指向不存在图片的链接）
	 * 
	 * @param imageInfos 图片信息数组
	 * @param onProgress 进度回调
	 * @returns 空链接列表和链接格式统计
	 */
	private async calculateLinkStats(
		imageInfos: ImageInfo[],
		onProgress?: (progress: ScanProgress) => void,
		useCachedData?: boolean,
		cacheHits?: number,
		newScans?: number
	): Promise<{ brokenLinks: BrokenLinkInfo[]; linkFormatStats: LinkFormatStats; remoteImages: ImageInfo[] }> {
		const brokenLinks: BrokenLinkInfo[] = [];
		const linkFormatStats: LinkFormatStats = {
			wiki: 0,
			markdown: 0,
			html: 0,
			shortest: 0,
			relative: 0,
			absolute: 0,
			remote: 0,
			remoteLinks: [],
			total: 0
		};
		
		// 使用 Map 存储网络图片信息 (URL -> ImageInfo)
		const remoteImageMap = new Map<string, ImageInfo>();
		
		// 构建图片路径集合，用于快速检查图片是否存在
		const imagePathSet = new Set<string>();
		const imageNameSet = new Set<string>();
		for (const info of imageInfos) {
			imagePathSet.add(info.path);
			imageNameSet.add(info.name.toLowerCase());
		}
		
		// 获取所有 Markdown 文件
		const mdFiles = this.app.vault.getMarkdownFiles();
		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
		
		// 辅助函数：检查是否为网络链接
		const isRemoteLink = (path: string) => path.startsWith('http://') || path.startsWith('https://');

		// 遍历所有 Markdown 文件
		for (let i = 0; i < mdFiles.length; i++) {
			const mdFile = mdFiles[i];
			
			try {
				// 读取文件内容
				const content = await this.vault.cachedRead(mdFile);
				const lines = content.split('\n');
				
				// 检测是否在代码块中
				let inCodeBlock = false;
				
				for (let lineNum = 0; lineNum < lines.length; lineNum++) {
					const line = lines[lineNum];
					
					// 检测代码块开始/结束
					if (line.trim().startsWith('```')) {
						inCodeBlock = !inCodeBlock;
						continue;
					}
					
					// 跳过代码块内的内容
					if (inCodeBlock) continue;
					
					// 检测 Wiki 格式链接 ![[...]]
					const wikiMatches = line.matchAll(/!\[\[([^\]]+)\]\]/g);
					for (const match of wikiMatches) {
						const linkContent = match[1];
						const linkParts = linkContent.split('|');
						const linkPath = linkParts[0].trim();
						
						// 检查是否是图片链接
						const ext = linkPath.split('.').pop()?.toLowerCase();
						if (!ext || !imageExtensions.includes(ext)) continue;
						
						linkFormatStats.wiki++;
						linkFormatStats.total++;
						
						// 检查链接路径格式
						this.classifyLinkPathFormat(linkPath, mdFile.path, linkFormatStats);
						
						// 检查是否是空链接
						const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, mdFile.path);
						if (!resolvedFile) {
							brokenLinks.push({
								filePath: mdFile.path,
								lineNumber: lineNum + 1,
								linkText: match[0],
								extractedPath: linkPath
							});
						}
					}
					
					// 检测 Markdown 格式链接 ![...](...) - 排除行内代码
					const mdMatches = line.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g);
					for (const match of mdMatches) {
						let linkPath = match[2].trim();
						// 处理 Markdown 链接中的 Title 部分：[alt](url "title")
						if (linkPath.includes(' ')) {
							linkPath = linkPath.split(' ')[0];
						}
						
						// 处理网络图片链接
						if (isRemoteLink(linkPath)) {
							linkFormatStats.remote++;
							linkFormatStats.total++;
							
							// 收集网络图片信息
							if (!remoteImageMap.has(linkPath)) {
								// 从 URL 中提取文件名
								let name = linkPath.split('/').pop() || 'unknown';
								if (name.includes('?')) name = name.split('?')[0];
								if (name.includes('#')) name = name.split('#')[0];
								
								remoteImageMap.set(linkPath, {
									path: linkPath,
									name: name,
									size: 0, // 网络图片大小未知
									modified: 0, // 网络图片修改时间未知
									references: [],
									referenceCount: 0,
									isRemote: true
								});
							}
							
							// 添加引用信息
							const imgInfo = remoteImageMap.get(linkPath)!;
							imgInfo.references!.push({
								filePath: mdFile.path,
								lineNumber: lineNum + 1,
								displayText: match[1] || undefined,
								fullLine: line,
								matchType: 'markdown',
								linkPathFormat: 'absolute' // 网络链接视为绝对路径
							});
							imgInfo.referenceCount = imgInfo.references!.length;
							imgInfo.referencesUpdatedAt = Date.now();
							
							continue;
						}
						
						// 检查是否是图片链接
						const ext = linkPath.split('.').pop()?.toLowerCase();
						if (!ext || !imageExtensions.includes(ext)) continue;
						
						linkFormatStats.markdown++;
						linkFormatStats.total++;
						
						// 检查链接路径格式
						this.classifyLinkPathFormat(linkPath, mdFile.path, linkFormatStats);
						
						// 检查是否是空链接
						const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, mdFile.path);
						if (!resolvedFile) {
							brokenLinks.push({
								filePath: mdFile.path,
								lineNumber: lineNum + 1,
								linkText: match[0],
								extractedPath: linkPath
							});
						}
					}
					
					// 检测 HTML 格式链接 <img ...>
					const htmlMatches = line.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
					for (const match of htmlMatches) {
						const linkPath = match[1].trim();
						
						// 处理网络图片链接
						if (isRemoteLink(linkPath)) {
							this.collectRemoteImageInfo(
								linkPath,
								mdFile,
								lineNum,
								line,
								'html',
								undefined, // HTML 链接通常没有显示文本，或者是 alt 属性
								remoteImageMap,
								linkFormatStats
							);
							continue;
						}
						
						// 检查是否是图片链接
						const ext = linkPath.split('.').pop()?.toLowerCase();
						if (!ext || !imageExtensions.includes(ext)) continue;
						
						linkFormatStats.html++;
						linkFormatStats.total++;
						
						// 检查链接路径格式
						this.classifyLinkPathFormat(linkPath, mdFile.path, linkFormatStats);
						
						// 检查是否是空链接
						const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, mdFile.path);
						if (!resolvedFile) {
							brokenLinks.push({
								filePath: mdFile.path,
								lineNumber: lineNum + 1,
								linkText: match[0],
								extractedPath: linkPath
							});
						}
					}
				}
			} catch (error) {
				// 静默失败，继续处理其他文件
			}
			
			// 每处理 50 个文件更新一次进度
			if (i % 50 === 0) {
				onProgress?.({
					current: Math.round((i / mdFiles.length) * 100),
					total: 100,
					phase: 'links',
					usedCache: useCachedData,
					cacheHits,
					newScans
				});
				// 让出控制权
				await new Promise(resolve => setTimeout(resolve, 0));
			}
		}
		
		// 将 Map 转换为数组
		linkFormatStats.remoteLinks = Array.from(remoteImageMap.keys());
		const remoteImages = Array.from(remoteImageMap.values());
		
		return { brokenLinks, linkFormatStats, remoteImages };
	}
	
	/**
	 * 分类链接路径格式
	 * 
	 * @param linkPath 链接路径
	 * @param notePath 笔记路径
	 * @param stats 统计对象
	 */
	private classifyLinkPathFormat(linkPath: string, notePath: string, stats: LinkFormatStats): void {
		// 判断路径格式
		if (linkPath.includes('/')) {
			// 包含路径分隔符
			if (linkPath.startsWith('./') || linkPath.startsWith('../')) {
				// 相对路径
				stats.relative++;
			} else {
				// 绝对路径（从仓库根目录开始）
				stats.absolute++;
			}
		} else {
			// 仅文件名，最短格式
			stats.shortest++;
		}
	}
}

