/**
 * 回收站管理模块
 * 
 * 提供插件级别的回收站功能，支持：
 * - 将删除的图片移动到回收站文件夹
 * - 从回收站恢复图片到原始位置或指定位置
 * - 永久删除回收站中的文件
 * - 清空回收站
 * 
 * 回收站路径格式：
 * `.trash/原始文件名__时间戳.扩展名`
 * 
 * 架构设计：
 * - TrashFolderManager: 管理回收站文件夹的创建和访问
 * - TrashItemCollector: 收集回收站中的文件项目
 * - TrashPathParser: 解析回收站文件路径
 * - TrashFormatter: 格式化显示信息
 * - TrashManager: 主管理器，协调各组件
 */

import { App, TFile, TFolder, Vault } from 'obsidian';
import ImageManagementPlugin from '../main';
import { OperationType } from './logger';
import { TrashPathParser } from './trash-path-parser';
import { TrashFormatter } from './trash-formatter';

/**
 * 回收站项目接口
 * 
 * 表示回收站中的一个文件项目
 */
export interface TrashItem {
	/** 回收站中的完整路径 */
	path: string;
	/** 原始路径（用于显示，可能是简化后的） */
	originalPath: string;
	/** 完整原始路径（用于恢复） */
	originalFullPath: string;
	/** 原始文件名 */
	originalName: string;
	/** 删除时间戳（毫秒） */
	deletedAt: number;
	/** 文件大小（字节） */
	size: number;
}

/**
 * 回收站文件夹管理器
 * 负责管理回收站文件夹的创建和访问
 */
class TrashFolderManager {
	private readonly trashFolderPath: string;
	private readonly vault: Vault;
	private readonly plugin: ImageManagementPlugin;

	constructor(vault: Vault, plugin: ImageManagementPlugin, trashFolderPath: string = '.trash') {
		this.vault = vault;
		this.plugin = plugin;
		this.trashFolderPath = trashFolderPath;
	}

	/**
	 * 获取回收站文件夹路径
	 */
	getTrashFolderPath(): string {
		return this.trashFolderPath;
	}

	/**
	 * 确保回收站文件夹存在
	 * @returns 回收站文件夹，如果无法获取则返回 null
	 */
	async ensureTrashFolder(): Promise<TFolder | null> {
		// 先尝试获取现有文件夹（快速路径）
		let trashFolder = this.vault.getAbstractFileByPath(this.trashFolderPath) as TFolder;
		
		if (trashFolder) {
			return trashFolder;
		}

		// 文件夹不存在，尝试创建
		try {
			const created = await this.vault.createFolder(this.trashFolderPath);
			
			if (created instanceof TFolder) {
				return created;
			}
			
			// 创建成功但没有返回文件夹，快速重试一次
			trashFolder = this.vault.getAbstractFileByPath(this.trashFolderPath) as TFolder;
			if (trashFolder) {
				return trashFolder;
			}
		} catch (createError) {
			const errorMsg = createError instanceof Error ? createError.message : String(createError);
			
			// 如果错误是"文件夹已存在"，快速重试获取（最多2次，减少延迟）
			if (errorMsg.includes('already exists') || errorMsg.includes('已存在')) {
				// 快速重试，避免长时间等待
				for (let i = 0; i < 3; i++) {
					trashFolder = this.vault.getAbstractFileByPath(this.trashFolderPath) as TFolder;
					if (trashFolder) {
						return trashFolder;
					}
					// 使用较短的延迟：50ms, 100ms, 150ms
					await new Promise(resolve => setTimeout(resolve, 50 * (i + 1)));
				}
				
				// 如果快速重试失败，检查文件夹是否真的存在
				try {
					const exists = await this.vault.adapter.exists(this.trashFolderPath);
					if (exists) {
						// 文件夹确实存在，但 API 暂时无法访问，返回 null（让调用者使用 adapter 方式）
						return null;
					}
				} catch (adapterError) {
					// adapter 检查失败
				}
				
				// 如果 adapter 也无法确认，返回 null
				return null;
			}
			
			// 如果是其他错误，再次尝试获取
			trashFolder = this.vault.getAbstractFileByPath(this.trashFolderPath) as TFolder;
			if (trashFolder) {
				return trashFolder;
			}
			
			// 其他错误，尝试使用 adapter 创建
			// 尝试使用 adapter 创建回收站文件夹
			try {
				const exists = await this.vault.adapter.exists(this.trashFolderPath);
				if (!exists) {
					await this.vault.adapter.mkdir(this.trashFolderPath);
					// 通过 adapter 成功创建回收站文件夹
					
					// 再次尝试获取文件夹对象
					await new Promise(resolve => setTimeout(resolve, 100));
					trashFolder = this.vault.getAbstractFileByPath(this.trashFolderPath) as TFolder;
					if (trashFolder) {
						return trashFolder;
					}
				}
				
				// 文件夹存在，但无法通过 API 访问，返回 null（让调用者使用 adapter）
				return null;
			} catch (adapterError) {
				// adapter 也失败了，记录错误
				if (this.plugin?.logger) {
					await this.plugin.logger.warn(
						OperationType.PLUGIN_ERROR,
						'创建回收站文件夹失败（包括 adapter）',
						{
							details: { 
								trashFolderPath: this.trashFolderPath,
								apiError: errorMsg,
								adapterError: adapterError instanceof Error ? adapterError.message : String(adapterError)
							}
						}
					);
				}
				return null;
			}
		}

		// 如果最终获取不到，返回 null（让调用者使用 adapter 方式）
		return null;
	}
}

/**
 * 回收站文件收集器
 * 负责从文件夹中收集回收站项目
 */
class TrashItemCollector {
	private readonly pathParser: TrashPathParser;
	private readonly vault: Vault;
	private readonly plugin: ImageManagementPlugin;

	constructor(pathParser: TrashPathParser, vault: Vault, plugin: ImageManagementPlugin) {
		this.pathParser = pathParser;
		this.vault = vault;
		this.plugin = plugin;
	}

	/**
	 * 从文件夹收集回收站项目
	 */
	async collectFromFolder(folder: TFolder): Promise<TrashItem[]> {
		const items: TrashItem[] = [];
		
		if (!folder || !folder.children) {
			return items;
		}

		await this.collectTrashItems(folder, items);
		
		// 按删除时间降序排序
		items.sort((a, b) => b.deletedAt - a.deletedAt);
		
		return items;
	}

	/**
	 * 通过 adapter 收集回收站项目
	 */
	async collectViaAdapter(trashFolderPath: string): Promise<TrashItem[]> {
		const items: TrashItem[] = [];
		
		try {
			await this.collectTrashItemsViaAdapter(trashFolderPath, items);
			items.sort((a, b) => b.deletedAt - a.deletedAt);
			return items;
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.warn(
					OperationType.PLUGIN_ERROR,
					'通过 adapter 读取回收站文件列表失败',
					{
						details: {
							error: error as Error,
							trashFolderPath: trashFolderPath
						}
					}
				);
			}
			return [];
		}
	}

	/**
	 * 递归收集回收站文件
	 */
	private async collectTrashItems(folder: TFolder, items: TrashItem[]): Promise<void> {
		if (!folder || !folder.children) {
			return;
		}

		for (const child of folder.children) {
			try {
				if (child instanceof TFile) {
					const item = this.pathParser.parseFromFile(child);
					if (item) {
						items.push(item);
					}
				} else if (child instanceof TFolder) {
					await this.collectTrashItems(child, items);
				}
			} catch (childError) {
				const itemPath = child?.path || '未知路径';
				if (this.plugin?.logger) {
					await this.plugin.logger.warn(
						OperationType.PLUGIN_ERROR,
						`处理回收站项失败: ${itemPath}`,
						{
							details: {
								error: childError as Error,
								itemPath: itemPath
							}
						}
					);
				}
				continue;
			}
		}
	}

	/**
	 * 通过 adapter 递归收集回收站文件
	 */
	private async collectTrashItemsViaAdapter(folderPath: string, items: TrashItem[]): Promise<void> {
		try {
			const exists = await this.vault.adapter.exists(folderPath);
			if (!exists) {
				return;
			}

			const stat = await this.vault.adapter.stat(folderPath);
			if (!stat) {
				return;
			}

			if (stat.type === 'file') {
				const item = this.pathParser.parse(folderPath, stat);
				if (item) {
					items.push(item);
				}
			} else if (stat.type === 'folder') {
				const list = await this.vault.adapter.list(folderPath);
				if (list && list.files) {
					for (const filePath of list.files) {
						await this.collectTrashItemsViaAdapter(filePath, items);
					}
				}
				if (list && list.folders) {
					for (const subFolderPath of list.folders) {
						await this.collectTrashItemsViaAdapter(subFolderPath, items);
					}
				}
			}
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.warn(
					OperationType.PLUGIN_ERROR,
					`通过 adapter 处理回收站项失败: ${folderPath}`,
					{
						details: {
							error: error as Error,
							itemPath: folderPath
						}
					}
				);
			}
		}
	}
}

/**
 * 回收站管理器
 * 
 * 插件回收站的主管理类，协调各组件完成回收站操作。
 * 
 * 功能：
 * - 移动文件到回收站（保留原始路径信息）
 * - 从回收站恢复文件（支持恢复到原始位置或指定位置）
 * - 永久删除回收站文件
 * - 清空回收站
 * - 获取回收站文件列表（带缓存）
 * 
 * 缓存机制：
 * - 缓存有效期 5 秒
 * - 操作后自动失效缓存
 * - 支持强制刷新
 * 
 * @example
 * ```typescript
 * // 移动文件到回收站
 * await trashManager.moveToTrash(file);
 * 
 * // 获取回收站列表
 * const items = await trashManager.getTrashItems();
 * 
 * // 恢复文件
 * await trashManager.restoreFile(item);
 * ```
 */
export class TrashManager {
	/** 文件夹管理器 */
	private readonly folderManager: TrashFolderManager;
	/** 路径解析器 */
	private readonly pathParser: TrashPathParser;
	/** 格式化工具 */
	private readonly formatter: TrashFormatter;
	/** 文件收集器 */
	private readonly collector: TrashItemCollector;
	/** Vault 实例 */
	private readonly vault: Vault;
	/** 插件实例 */
	private readonly plugin: ImageManagementPlugin;
	
	// ==================== 缓存机制 ====================
	/** 缓存的回收站项目列表 */
	private cachedItems: TrashItem[] | null = null;
	/** 缓存时间戳 */
	private cacheTimestamp: number = 0;
	/** 缓存有效期（毫秒） */
	private readonly CACHE_DURATION = 5000;
	/** 是否正在加载 */
	private isLoading: boolean = false;
	/** 加载 Promise（用于避免重复加载） */
	private loadPromise: Promise<TrashItem[]> | null = null;

	constructor(app: App, plugin: ImageManagementPlugin) {
		this.vault = app.vault;
		this.plugin = plugin;
		
		const trashFolderPath = '.trash';
		this.folderManager = new TrashFolderManager(this.vault, plugin, trashFolderPath);
		this.pathParser = new TrashPathParser(trashFolderPath);
		this.formatter = new TrashFormatter();
		this.collector = new TrashItemCollector(this.pathParser, this.vault, plugin);
	}
	
	/**
	 * 初始化预加载（在设置加载后调用）
	 */
	initializePreload(): void {
		// 如果启用插件回收站，预加载回收站数据（后台加载，不阻塞）
		if (this.plugin.settings?.enablePluginTrash) {
			this.preloadTrashItems();
		}
	}
	
	/**
	 * 预加载回收站数据（后台加载）
	 */
	private async preloadTrashItems(): Promise<void> {
		// 延迟加载，避免阻塞插件启动
		setTimeout(async () => {
			try {
				await this.getTrashItems(true);
			} catch (error) {
				// 预加载失败不影响功能
			}
		}, 1000);
	}
	
	/**
	 * 使缓存失效
	 */
	invalidateCache(): void {
		this.cachedItems = null;
		this.cacheTimestamp = 0;
	}
	
	/**
	 * 检查缓存是否有效
	 */
	isCacheValid(): boolean {
		if (!this.cachedItems) {
			return false;
		}
		const now = Date.now();
		return (now - this.cacheTimestamp) < this.CACHE_DURATION;
	}
	
	/**
	 * 获取缓存的回收站项目（同步方法，用于快速显示）
	 */
	getCachedItems(): TrashItem[] | null {
		if (this.isCacheValid()) {
			return this.cachedItems;
		}
		return null;
	}

	/**
	 * 获取回收站文件夹路径
	 */
	getTrashFolderPath(): string {
		return this.folderManager.getTrashFolderPath();
	}

	/**
	 * 确保回收站文件夹存在
	 */
	async ensureTrashFolder(): Promise<TFolder | null> {
		return await this.folderManager.ensureTrashFolder();
	}

	/**
	 * 移动文件到回收站
	 */
	async moveToTrash(file: TFile): Promise<boolean> {
		try {
			// 如果文件已经在回收站中，不处理
			if (file.path.startsWith(this.getTrashFolderPath() + '/')) {
				return false;
			}

			// 确保回收站文件夹存在
			const trashFolder = await this.ensureTrashFolder();
			
			// 生成回收站路径
			const timestamp = Date.now();
			const trashPath = this.pathParser.generateTrashPath(file.path, timestamp);

			// 先获取图片的 MD5 哈希值（在删除前获取）
			const imageHash = await this.getImageHash(file);

			// 读取文件内容
			const fileContent = await this.vault.readBinary(file);

			if (!trashFolder) {
				// 无法通过 API 访问回收站文件夹，使用 adapter 直接操作
				console.log('[TrashManager] 使用 adapter 直接操作回收站');
				
				// 确保回收站文件夹存在（使用 adapter）
				const trashFolderPath = this.getTrashFolderPath();
				const folderExists = await this.vault.adapter.exists(trashFolderPath);
				if (!folderExists) {
					try {
						await this.vault.adapter.mkdir(trashFolderPath);
						console.log('[TrashManager] 通过 adapter 创建回收站文件夹');
					} catch (mkdirError) {
						console.error('[TrashManager] 创建回收站文件夹失败:', mkdirError);
						if (this.plugin?.logger) {
							await this.plugin.logger.warn(
								OperationType.TRASH,
								`移动到回收站失败: 无法创建回收站文件夹`,
								{
									details: {
										itemPath: file.path,
										imageName: file.name,
										error: mkdirError as Error
									}
								}
							);
						}
						return false;
					}
				}
				
				// 使用 adapter 创建文件
				await this.vault.adapter.writeBinary(trashPath, fileContent);
				console.log('[TrashManager] 通过 adapter 创建回收站文件:', trashPath);
			} else {
				// 使用正常 API 创建文件
				await this.vault.createBinary(trashPath, fileContent);
			}

			// 删除原文件（只有在回收站文件创建成功后才删除）
			await this.vault.delete(file);

			// 记录日志
			if (this.plugin?.logger) {
				await this.plugin.logger.info(
					OperationType.TRASH,
					`移动到回收站: ${file.name}`,
					{
						imageHash: imageHash,
						imagePath: file.path,
						imageName: file.name,
						details: {
							originalPath: file.path,
							trashPath: trashPath,
							deletedAt: timestamp
						}
					}
				);
			}

			// 使缓存失效，下次加载时会刷新
			this.invalidateCache();

			return true;
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.error(
					OperationType.TRASH,
					`移动到回收站失败: ${file.path}`,
					{
						error: error as Error,
						imagePath: file.path,
						imageName: file.name
					}
				);
			}
			return false;
		}
	}

	/**
	 * 获取图片的 MD5 哈希值
	 */
	private async getImageHash(file: TFile): Promise<string | undefined> {
		// 先从已扫描的图片中查找
		if (this.plugin?.data?.images) {
			const image = this.plugin.data.images.find(img => img.path === file.path);
			if (image?.md5) {
				return image.md5;
			}
		}
		
		// 如果找不到，尝试从文件计算
		try {
			const { calculateFileHash } = await import('./image-hash');
			return await calculateFileHash(file, this.vault);
		} catch (error) {
			// 计算失败，返回 undefined
			return undefined;
		}
	}

	/**
	 * 从回收站路径解析原始路径
	 */
	parseTrashItem(trashPath: string): TrashItem | null {
		const file = this.vault.getAbstractFileByPath(trashPath) as TFile;
		if (!file) {
			return null;
		}
		return this.pathParser.parseFromFile(file);
	}

	/**
	 * 获取回收站中的所有文件
	 * @param forceRefresh 是否强制刷新（忽略缓存）
	 */
	async getTrashItems(forceRefresh: boolean = false): Promise<TrashItem[]> {
		// 如果缓存有效且不强制刷新，直接返回缓存
		if (!forceRefresh && this.isCacheValid()) {
			return this.cachedItems!;
		}
		
		// 如果正在加载，返回同一个 Promise（避免重复加载）
		if (this.isLoading && this.loadPromise) {
			return this.loadPromise;
		}
		
		// 开始加载
		this.isLoading = true;
		this.loadPromise = this.loadTrashItemsInternal();
		
		try {
			const items = await this.loadPromise;
			// 更新缓存
			this.cachedItems = items;
			this.cacheTimestamp = Date.now();
			return items;
		} finally {
			this.isLoading = false;
			this.loadPromise = null;
		}
	}
	
	/**
	 * 内部加载方法
	 */
	private async loadTrashItemsInternal(): Promise<TrashItem[]> {
		try {
			// 快速检查：先尝试直接获取文件夹（避免不必要的创建操作）
			let trashFolder = this.vault.getAbstractFileByPath(this.getTrashFolderPath()) as TFolder;
			
			// 如果文件夹存在，快速检查是否为空
			if (trashFolder) {
				if (!trashFolder.children || trashFolder.children.length === 0) {
					return [];
				}
				return await this.collector.collectFromFolder(trashFolder);
			}
			
			// 文件夹不存在，尝试确保文件夹存在（仅在需要时创建）
			const ensuredFolder = await this.ensureTrashFolder();
			
			if (!ensuredFolder) {
				// 回收站文件夹无法通过 Obsidian API 访问，尝试使用 adapter 直接读取
				try {
					const exists = await this.vault.adapter.exists(this.getTrashFolderPath());
					if (exists) {
						return await this.collector.collectViaAdapter(this.getTrashFolderPath());
					}
				} catch (adapterError) {
					// adapter 访问失败，继续返回空数组
				}
				return [];
			}

			// 检查文件夹是否有子项（快速返回空数组）
			if (!ensuredFolder.children || ensuredFolder.children.length === 0) {
				return [];
			}

			return await this.collector.collectFromFolder(ensuredFolder);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;
			
			if (this.plugin?.logger) {
				await this.plugin.logger.error(
					OperationType.PLUGIN_ERROR,
					'获取回收站文件列表失败',
					{
						error: error as Error,
						details: {
							message: errorMessage,
							stack: errorStack,
							errorType: error instanceof Error ? error.constructor.name : typeof error,
							trashFolderPath: this.getTrashFolderPath()
						}
					}
				);
			}
			
			console.error('[ImageMgr] 获取回收站文件列表失败:', {
				error: errorMessage,
				stack: errorStack,
				trashFolderPath: this.getTrashFolderPath()
			});
			
			return [];
		}
	}

	/**
	 * 恢复文件到指定位置
	 */
	async restoreFile(item: TrashItem): Promise<boolean> {
		try {
			// 尝试直接获取文件
			let trashFile = this.vault.getAbstractFileByPath(item.path) as TFile;
			
			// 如果找不到，尝试编码路径
			if (!trashFile) {
				// 分离文件夹和文件名
				const pathParts = item.path.split('/');
				const fileName = pathParts.pop() || '';
				const folder = pathParts.join('/');
				
				// 只对文件名进行编码（文件夹路径通常不需要编码）
				const encodedFileName = encodeURIComponent(fileName).replace(/%2F/g, '/');
				const encodedPath = folder ? `${folder}/${encodedFileName}` : encodedFileName;
				
				trashFile = this.vault.getAbstractFileByPath(encodedPath) as TFile;
			}
			
			// 如果无法获取 TFile 对象，使用 adapter 直接操作
			let actualTrashPath = item.path;
			
			if (!trashFile) {
				// 检查文件是否存在
				const exists = await this.vault.adapter.exists(item.path);
				
				if (!exists) {
					console.error('[TrashManager] 找不到回收站文件:', item.path);
					return false;
				}
				
				actualTrashPath = item.path;
			} else {
				actualTrashPath = trashFile.path;
			}

			// 计算恢复路径
			const restorePath = this.calculateRestorePath(item);

			// 处理文件名冲突
			const finalRestorePath = await this.resolvePathConflict(restorePath, item.originalName);

			// 确保目标目录存在
			await this.ensureTargetDirectory(finalRestorePath);

			// 读取文件内容（优先使用 TFile，否则使用 adapter）
			let fileContent: ArrayBuffer;
			if (trashFile) {
				fileContent = await this.vault.readBinary(trashFile);
			} else {
				fileContent = await this.vault.adapter.readBinary(actualTrashPath);
			}

			// 在目标位置创建文件
			await this.vault.createBinary(finalRestorePath, fileContent);

			// 删除回收站中的文件（优先使用 TFile，否则使用 adapter）
			if (trashFile) {
				await this.vault.delete(trashFile);
			} else {
				await this.vault.adapter.remove(actualTrashPath);
			}

			// 恢复历史记录
			await this.restoreHistory(item, finalRestorePath);

			// 获取图片的 MD5 哈希值
			const imageHash = await this.getImageHashFromRestoredFile(finalRestorePath);

			// 记录日志
			if (this.plugin?.logger) {
				await this.plugin.logger.info(
					OperationType.RESTORE,
					`恢复文件: ${item.originalName}`,
					{
						imageHash: imageHash,
						imagePath: finalRestorePath,
						imageName: item.originalName,
						details: {
							trashPath: item.path,
							restorePath: finalRestorePath,
							originalPath: item.originalFullPath,
							renamed: finalRestorePath !== item.originalFullPath && finalRestorePath !== item.originalName
						}
					}
				);
			}

			// 使缓存失效，下次加载时会刷新
			this.invalidateCache();

			return true;
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.error(
					OperationType.RESTORE,
					`恢复文件失败: ${item.originalPath}`,
					{
						error: error as Error,
						imagePath: item.originalPath,
						imageName: item.originalName
					}
				);
			}
			return false;
		}
	}

	/**
	 * 计算恢复路径
	 */
	private calculateRestorePath(item: TrashItem): string {
		const restorePathSetting = this.plugin?.settings?.trashRestorePath || '';
		const settingValue = restorePathSetting.trim().toLowerCase();
		
		if (settingValue === '' || settingValue === 'original') {
			// 恢复到原始路径
			return item.originalFullPath;
		} else {
			// 恢复到指定路径
			const customPath = restorePathSetting.trim();
			const normalizedPath = customPath.startsWith('/') ? customPath.substring(1) : customPath;
			const basePath = normalizedPath.endsWith('/') ? normalizedPath : `${normalizedPath}/`;
			return `${basePath}${item.originalName}`;
		}
	}

	/**
	 * 处理路径冲突，生成唯一文件名
	 */
	private async resolvePathConflict(restorePath: string, originalName: string): Promise<string> {
		const existingFile = this.vault.getAbstractFileByPath(restorePath);
		if (!existingFile) {
			return restorePath;
		}

		// 如果存在，生成新名称
		const pathParts = restorePath.split('/');
		const fileName = pathParts.pop() || originalName;
		const dir = pathParts.join('/');
		
		// 安全地处理文件名和扩展名
		const lastDotIndex = fileName.lastIndexOf('.');
		let nameWithoutExt: string;
		let ext: string;
		
		if (lastDotIndex > 0 && lastDotIndex < fileName.length - 1) {
			nameWithoutExt = fileName.substring(0, lastDotIndex);
			ext = fileName.substring(lastDotIndex);
		} else {
			nameWithoutExt = fileName;
			ext = '';
		}
		
		let counter = 1;
		let newPath = restorePath;
		while (this.vault.getAbstractFileByPath(newPath)) {
			const newFileName = `${nameWithoutExt}_${counter}${ext}`;
			newPath = dir ? `${dir}/${newFileName}` : newFileName;
			counter++;
			
			if (counter > 1000) {
				throw new Error('无法生成唯一的文件名');
			}
		}
		
		return newPath;
	}

	/**
	 * 确保目标目录存在
	 */
	private async ensureTargetDirectory(restorePath: string): Promise<void> {
		if (restorePath.includes('/')) {
			const targetDir = restorePath.substring(0, restorePath.lastIndexOf('/'));
			if (targetDir) {
				const dir = this.vault.getAbstractFileByPath(targetDir) as TFolder;
				if (!dir) {
					await this.vault.createFolder(targetDir);
				}
			}
		}
	}

	/**
	 * 恢复历史记录
	 */
	private async restoreHistory(item: TrashItem, restorePath: string): Promise<void> {
		if (!this.plugin?.historyManager) {
			return;
		}

		const originalHistory = this.plugin.historyManager.getHistory(item.originalFullPath);
		
		if (originalHistory && originalHistory.length > 0) {
			await this.plugin.historyManager.migrateHistory(
				item.originalFullPath,
				restorePath,
				item.originalName,
				restorePath.split('/').pop() || item.originalName
			);
		}
	}

	/**
	 * 从恢复后的文件获取图片哈希值
	 */
	private async getImageHashFromRestoredFile(restorePath: string): Promise<string | undefined> {
		// 先从已扫描的图片中查找
		if (this.plugin?.data?.images) {
			const image = this.plugin.data.images.find(img => img.path === restorePath);
			if (image?.md5) {
				return image.md5;
			}
		}
		
		// 如果找不到，尝试从文件计算
		try {
			const restoredFile = this.vault.getAbstractFileByPath(restorePath) as TFile;
			if (restoredFile) {
				const { calculateFileHash } = await import('./image-hash');
				return await calculateFileHash(restoredFile, this.vault);
			}
		} catch (error) {
			// 计算失败，返回 undefined
		}
		
		return undefined;
	}

	/**
	 * 永久删除文件
	 */
	async permanentlyDelete(item: TrashItem): Promise<boolean> {
		try {
			// 先尝试通过 Vault API
			const trashFile = this.vault.getAbstractFileByPath(item.path) as TFile;
			
			let imageHash: string | undefined;
			let deleted = false;
			
			if (trashFile) {
				// 获取图片的 MD5 哈希值（在删除前获取）
				imageHash = await this.getImageHash(trashFile);
				await this.vault.delete(trashFile);
				deleted = true;
			} else {
				// 使用 adapter 直接删除
				const fileExists = await this.vault.adapter.exists(item.path);
				if (fileExists) {
					await this.vault.adapter.remove(item.path);
					deleted = true;
				} else {
					return false;
				}
			}

			if (deleted) {
				
				// 记录日志
				if (this.plugin?.logger) {
					await this.plugin.logger.info(
						OperationType.PERMANENT_DELETE,
						`永久删除: ${item.originalName}`,
						{
							imageHash: imageHash,
							imagePath: item.originalPath,
							imageName: item.originalName,
							details: {
								trashPath: item.path
							}
						}
					);
				}

				// 使缓存失效，下次加载时会刷新
				this.invalidateCache();

				return true;
			}
			
			return false;
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.error(
					OperationType.PERMANENT_DELETE,
					`永久删除失败: ${item.originalPath}`,
					{
						error: error as Error,
						imagePath: item.originalPath,
						imageName: item.originalName
					}
				);
			}
			return false;
		}
	}

	/**
	 * 清空回收站
	 */
	async emptyTrash(): Promise<number> {
		try {
			const items = await this.getTrashItems();
			let deletedCount = 0;

			for (const item of items) {
				if (await this.permanentlyDelete(item)) {
					deletedCount++;
				}
			}

			// 记录日志
			if (this.plugin?.logger) {
				await this.plugin.logger.info(
					OperationType.PLUGIN_OPERATION,
					`清空回收站: 删除了 ${deletedCount} 个文件`,
					{
						details: {
							deletedCount: deletedCount,
							totalCount: items.length
						}
					}
				);
			}

			// 使缓存失效，下次加载时会刷新
			this.invalidateCache();

			return deletedCount;
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.error(
					OperationType.PLUGIN_ERROR,
					'清空回收站失败',
					{
						error: error as Error
					}
				);
			}
			return 0;
		}
	}

	// 格式化方法委托给 formatter
	formatDateTime(timestamp: number): string {
		return this.formatter.formatDateTime(timestamp);
	}

	formatRelativeTime(timestamp: number): string {
		return this.formatter.formatRelativeTime(timestamp);
	}

	formatFileSize(bytes: number): string {
		return this.formatter.formatFileSize(bytes);
	}
}

