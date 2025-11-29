/**
 * 锁定列表管理器
 * 
 * 负责：
 * - 管理锁定文件列表的持久化存储
 * - 监控文件系统变化，实时更新锁定列表
 * - 处理文件删除、移动等操作对锁定列表的影响
 * - 提供锁定列表的查询和更新接口
 */

import { TFile, TAbstractFile } from 'obsidian';
import ImageManagementPlugin from '../main';
import { OperationType } from './logger';

export interface LockedFileInfo {
	/** 文件名 */
	fileName: string;
	/** 文件路径 */
	filePath: string;
	/** MD5 哈希值 */
	md5?: string;
	/** 添加到锁定列表的时间戳 */
	addedTime: number;
	/** 文件是否存在 */
	exists: boolean;
	/** 文件最后修改时间 */
	lastModified?: number;
}

export class LockListManager {
	private plugin: ImageManagementPlugin;
	private lockListCache: Map<string, LockedFileInfo> = new Map();
	private isInitialized: boolean = false;
	private onLockListChanged: (() => void) | null = null;

	constructor(plugin: ImageManagementPlugin) {
		this.plugin = plugin;
	}

	/**
	 * 注册锁定列表改变的回调
	 */
	setOnLockListChanged(callback: () => void) {
		this.onLockListChanged = callback;
	}

	/**
	 * 初始化锁定列表管理器
	 * 从设置中加载锁定列表，并建立文件系统监控
	 */
	async initialize() {
		if (this.isInitialized) return;

		// 加载现有的锁定列表
		this.loadLockListFromSettings();

		// 更新文件状态（检查文件是否存在，但不删除）
		await this.updateFileStatus();

		// 建立文件系统监控
		this.setupFileSystemMonitoring();

		this.isInitialized = true;
	}

	/**
	 * 从设置中加载锁定列表
	 * 使用哈希值+文件名组合作为主键，自动去重
	 */
	private loadLockListFromSettings() {
		this.lockListCache.clear();

		const ignoredFiles = (this.plugin.settings.ignoredFiles || '').split('\n').filter(f => f.trim());
		const ignoredHashes = (this.plugin.settings.ignoredHashes || '').split('\n').filter(f => f.trim());
		const hashMetadata = this.plugin.settings.ignoredHashMetadata || {};

		// 用于检测重复的集合（哈希值+文件名组合）
		const seenKeys = new Set<string>();

		// 构建锁定列表缓存（自动去重）
		ignoredFiles.forEach((fileName, index) => {
			const hash = index < ignoredHashes.length ? ignoredHashes[index] : undefined;
			const metadata = hash ? hashMetadata[hash] : undefined;
			const lowerFileName = fileName.toLowerCase();
			
			// 使用哈希值+文件名组合作为主键，确保唯一性
			const key = hash ? `hash:${hash}:${lowerFileName}` : `name:${lowerFileName}`;
			
			// 检查组合键是否重复
			if (seenKeys.has(key)) {
				return; // 跳过重复
			}
			seenKeys.add(key);
			this.lockListCache.set(key, {
				fileName,
				filePath: metadata?.filePath || '未知位置',
				md5: hash,
				addedTime: metadata?.addedTime || Date.now(),
				// 从设置加载的文件默认为存在（因为只有存在的文件才会被保存）
				// updateFileStatus 会验证并更新实际状态
				exists: true,
				lastModified: undefined
			});
		});
	}

	/**
	 * 更新锁定列表中文件的状态
	 * 只更新 exists 标志，不删除任何文件
	 */
	private async updateFileStatus() {
		for (const [key, lockedFile] of this.lockListCache.entries()) {
			try {
				// 尝试从 vault 中获取文件
				const file = this.plugin.app.vault.getAbstractFileByPath(lockedFile.filePath);

				if (file && file instanceof TFile) {
					// 文件存在，更新状态
					lockedFile.exists = true;
					lockedFile.lastModified = file.stat.mtime;
				} else {
					// 文件不存在，标记为不存在但保留记录
					lockedFile.exists = false;
				}
			} catch (error) {
				console.error(`[LockListManager] 更新文件状态失败: ${lockedFile.filePath}`, error);
				lockedFile.exists = false;
			}
		}
	}

	/**
	 * 验证锁定列表中的文件是否仍然存在
	 * 删除不存在的文件，但在日志中记录
	 * 仅在文件系统事件时调用
	 */
	private async validateLockedFiles() {
		const filesToRemove: string[] = [];

		for (const [key, lockedFile] of this.lockListCache.entries()) {
			try {
				// 尝试从 vault 中获取文件
				const file = this.plugin.app.vault.getAbstractFileByPath(lockedFile.filePath);

				if (file && file instanceof TFile) {
					// 文件存在，更新状态
					lockedFile.exists = true;
					lockedFile.lastModified = file.stat.mtime;
				} else {
					// 文件不存在，标记为删除
					filesToRemove.push(key);
					lockedFile.exists = false;
				}
			} catch (error) {
				console.error(`[LockListManager] 验证文件失败: ${lockedFile.filePath}`, error);
				filesToRemove.push(key);
			}
		}

		// 移除不存在的文件
		if (filesToRemove.length > 0) {
			await this.removeLockedFiles(filesToRemove);
		}
	}

	/**
	 * 建立文件系统监控
	 */
	private setupFileSystemMonitoring() {
		// 监听文件删除事件
		this.plugin.registerEvent(
			this.plugin.app.vault.on('delete', (file: TAbstractFile) => {
				this.handleFileDeleted(file);
			})
		);

		// 监听文件重命名/移动事件
		this.plugin.registerEvent(
			this.plugin.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
				this.handleFileRenamed(file, oldPath);
			})
		);

		// 监听文件修改事件（用于更新 lastModified）
		this.plugin.registerEvent(
			this.plugin.app.vault.on('modify', (file: TAbstractFile) => {
				this.handleFileModified(file);
			})
		);
	}

	/**
	 * 处理文件删除事件
	 * 从锁定列表中移除已删除的文件，但在日志中记录
	 */
	private async handleFileDeleted(file: TAbstractFile) {
		const filePath = file.path;
		const keysToRemove: string[] = [];
		const removedFiles: string[] = [];

		// 查找所有与该文件相关的锁定项
		for (const [key, lockedFile] of this.lockListCache.entries()) {
			if (lockedFile.filePath === filePath) {
				keysToRemove.push(key);
				removedFiles.push(lockedFile.fileName);
			}
		}

		// 移除锁定项
		if (keysToRemove.length > 0) {
			await this.removeLockedFiles(keysToRemove);
			
			// 记录到日志
			if (this.plugin.logger) {
				await this.plugin.logger.info(
					OperationType.UNLOCK,
					`文件已删除，已从锁定列表移除: ${removedFiles.join(', ')}`,
					{
						filePath: filePath,
						details: {
							removedFiles: removedFiles,
							reason: 'file_deleted'
						}
					}
				);
			}
		}
	}

	/**
	 * 处理文件重命名/移动事件
	 */
	private async handleFileRenamed(file: TAbstractFile, oldPath: string) {
		if (!(file instanceof TFile)) return;

		const keysToUpdate: Array<[string, LockedFileInfo]> = [];

		// 查找所有与旧路径相关的锁定项
		for (const [key, lockedFile] of this.lockListCache.entries()) {
			if (lockedFile.filePath === oldPath) {
				keysToUpdate.push([key, lockedFile]);
			}
		}

		if (keysToUpdate.length > 0) {
			// 更新锁定列表中的文件路径
			for (const [key, lockedFile] of keysToUpdate) {
				lockedFile.filePath = file.path;
				lockedFile.lastModified = file.stat.mtime;
			}

			// 保存更新到设置
			await this.saveLockListToSettings();
		}
	}

	/**
	 * 处理文件修改事件
	 */
	private handleFileModified(file: TAbstractFile) {
		if (!(file instanceof TFile)) return;

		// 更新文件的最后修改时间
		for (const lockedFile of this.lockListCache.values()) {
			if (lockedFile.filePath === file.path) {
				lockedFile.lastModified = file.stat.mtime;
				break;
			}
		}
	}

	/**
	 * 将锁定列表保存到设置
	 * 只保存存在的文件，已删除的文件会从锁定列表中移除
	 */
	private async saveLockListToSettings() {
		const ignoredFiles: string[] = [];
		const ignoredHashes: string[] = [];
		const hashMetadata: Record<string, any> = {};

		for (const lockedFile of this.lockListCache.values()) {
			// 只保存存在的文件
			if (lockedFile.exists) {
				ignoredFiles.push(lockedFile.fileName);

				if (lockedFile.md5) {
					ignoredHashes.push(lockedFile.md5);
					hashMetadata[lockedFile.md5] = {
						fileName: lockedFile.fileName,
						filePath: lockedFile.filePath,
						addedTime: lockedFile.addedTime
					};
				}
			}
		}

		// 更新设置
		this.plugin.settings.ignoredFiles = ignoredFiles.join('\n');
		this.plugin.settings.ignoredHashes = ignoredHashes.join('\n');
		this.plugin.settings.ignoredHashMetadata = hashMetadata;

		// 保存到存储
		await this.plugin.saveSettings();
		
		// 触发回调，通知设置标签页刷新
		if (this.onLockListChanged) {
			this.onLockListChanged();
		}
	}

	/**
	 * 移除锁定文件
	 */
	private async removeLockedFiles(keys: string[]) {
		for (const key of keys) {
			this.lockListCache.delete(key);
		}

		// 保存更新
		await this.saveLockListToSettings();
	}

	/**
	 * 获取所有锁定文件
	 */
	getLockedFiles(): LockedFileInfo[] {
		return Array.from(this.lockListCache.values());
	}

	/**
	 * 获取锁定文件数量
	 */
	getLockedFileCount(): number {
		return this.lockListCache.size;
	}

	/**
	 * 检查文件是否被锁定（通过路径）
	 */
	isFileLocked(filePath: string): boolean {
		for (const lockedFile of this.lockListCache.values()) {
			if (lockedFile.filePath === filePath) {
				return true;
			}
		}
		return false;
	}

	/**
	 * 检查文件是否被锁定（通过文件名和哈希值）
	 * 这是主要的检查方法，支持哈希值优先检查
	 * @param fileName - 文件名
	 * @param md5 - MD5 哈希值（可选）
	 * @returns 是否被锁定
	 */
	isFileLockedByNameOrHash(fileName: string, md5?: string): boolean {
		// 首先检查哈希值锁定（优先级更高）
		if (md5) {
			for (const lockedFile of this.lockListCache.values()) {
				// 只检查存在的文件（与保存逻辑一致）
				if (lockedFile.exists && lockedFile.md5 && lockedFile.md5.toLowerCase() === md5.toLowerCase()) {
					return true;
				}
			}
		}
		
		// 然后检查文件名锁定（精确匹配）
		const lowerFileName = fileName.toLowerCase();
		for (const lockedFile of this.lockListCache.values()) {
			// 只检查存在的文件（与保存逻辑一致）
			if (!lockedFile.exists) continue;
			const lowerLockedName = lockedFile.fileName.toLowerCase();
			if (lowerFileName === lowerLockedName) {
				return true;
			}
		}
		
		return false;
	}

	/**
	 * 添加锁定文件
	 * 重复检测规则：MD5 哈希值作为主键，文件名作为辅键
	 * 只有当哈希值和文件名都相同时才判定为重复，不会重复添加
	 * @param fileName - 文件名
	 * @param filePath - 文件路径
	 * @param md5 - MD5 哈希值（可选）
	 * @returns 是否成功添加（false 表示已存在）
	 */
	async addLockedFile(fileName: string, filePath: string, md5?: string): Promise<boolean> {
		const lowerFileName = fileName.toLowerCase();
		
		// 检查是否已存在完全相同的锁定（哈希值和文件名都相同）
		for (const lockedFile of this.lockListCache.values()) {
			const sameHash = md5 && lockedFile.md5 && lockedFile.md5.toLowerCase() === md5.toLowerCase();
			const sameName = lockedFile.fileName.toLowerCase() === lowerFileName;
			
			// 只有哈希值和文件名都相同才判定为重复
			if (sameHash && sameName) {
				return false; // 完全相同，不重复添加
			}
		}
		
		// 使用哈希值+文件名组合作为主键，确保唯一性
		const key = md5 ? `hash:${md5}:${lowerFileName}` : `name:${lowerFileName}`;

		this.lockListCache.set(key, {
			fileName,
			filePath,
			md5,
			addedTime: Date.now(),
			exists: true,
			lastModified: Date.now()
		});

		// 保存到设置
		await this.saveLockListToSettings();
		return true;
	}

	/**
	 * 移除锁定文件
	 * 支持通过哈希值或文件名查找并删除
	 * @param fileName - 文件名
	 * @param md5 - MD5 哈希值（可选）
	 */
	async removeLockedFile(fileName: string, md5?: string) {
		const lowerFileName = fileName.toLowerCase();
		
		// 尝试精确匹配的 key（哈希值+文件名组合）
		const combinedKey = md5 ? `hash:${md5}:${lowerFileName}` : `name:${lowerFileName}`;
		
		let removed = false;
		
		// 优先通过组合键删除
		if (this.lockListCache.has(combinedKey)) {
			this.lockListCache.delete(combinedKey);
			removed = true;
		}
		
		// 如果精确匹配失败，尝试模糊匹配（兼容旧数据）
		if (!removed) {
			const keysToRemove: string[] = [];
			for (const [k, lockedFile] of this.lockListCache.entries()) {
				const sameHash = md5 && lockedFile.md5 && lockedFile.md5.toLowerCase() === md5.toLowerCase();
				const sameName = lockedFile.fileName.toLowerCase() === lowerFileName;
				
				// 哈希值和文件名都匹配才删除
				if (sameHash && sameName) {
					keysToRemove.push(k);
				}
			}
			for (const k of keysToRemove) {
				this.lockListCache.delete(k);
			}
		}

		// 保存到设置
		await this.saveLockListToSettings();
	}

	/**
	 * 清空所有锁定文件
	 */
	async clearAllLockedFiles() {
		this.lockListCache.clear();

		// 保存到设置
		this.plugin.settings.ignoredFiles = '';
		this.plugin.settings.ignoredHashes = '';
		this.plugin.settings.ignoredHashMetadata = {};

		await this.plugin.saveSettings();
	}

	/**
	 * 获取锁定列表统计信息
	 */
	getStatistics() {
		const total = this.lockListCache.size;
		let existing = 0;
		let missing = 0;

		for (const lockedFile of this.lockListCache.values()) {
			if (lockedFile.exists) {
				existing++;
			} else {
				missing++;
			}
		}

		return {
			total,
			existing,
			missing,
			percentage: total > 0 ? Math.round((existing / total) * 100) : 0
		};
	}

	/**
	 * 重新加载锁定列表（当外部直接修改 settings 后调用）
	 */
	reloadFromSettings() {
		this.loadLockListFromSettings();
	}

	/**
	 * 批量移除锁定文件（用于清除本页等操作）
	 * @param items - 要移除的文件列表，每项包含 fileName 和可选的 md5
	 */
	async removeLockedFileBatch(items: Array<{ fileName: string; md5?: string }>) {
		for (const item of items) {
			const lowerFileName = item.fileName.toLowerCase();
			
			// 尝试精确匹配的 key（哈希值+文件名组合）
			const combinedKey = item.md5 ? `hash:${item.md5}:${lowerFileName}` : `name:${lowerFileName}`;
			
			let removed = false;
			
			// 优先通过组合键删除
			if (this.lockListCache.has(combinedKey)) {
				this.lockListCache.delete(combinedKey);
				removed = true;
			}
			
			// 如果精确匹配失败，尝试模糊匹配（兼容旧数据）
			if (!removed) {
				for (const [k, lockedFile] of this.lockListCache.entries()) {
					const sameHash = item.md5 && lockedFile.md5 && lockedFile.md5.toLowerCase() === item.md5.toLowerCase();
					const sameName = lockedFile.fileName.toLowerCase() === lowerFileName;
					
					// 哈希值和文件名都匹配才删除
					if (sameHash && sameName) {
						this.lockListCache.delete(k);
						break;
					}
				}
			}
		}

		// 保存到设置
		await this.saveLockListToSettings();
	}
}
