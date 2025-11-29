/**
 * 锁定列表管理器
 * 
 * 负责：
 * - 管理锁定文件列表的持久化存储
 * - 监控文件系统变化，实时更新锁定列表
 * - 处理文件删除、移动等操作对锁定列表的影响
 * - 提供锁定列表的查询和更新接口
 * 
 * 锁定机制：
 * - 使用三要素精确匹配：MD5 + 文件名 + 路径
 * - 只有三要素都匹配才判定为锁定状态
 * - 防止重复文件被误锁定
 * - 路径作为主键存储（路径是唯一的）
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
	 * 使用路径作为主键（路径是唯一的）
	 */
	private loadLockListFromSettings() {
		this.lockListCache.clear();

		const ignoredFiles = (this.plugin.settings.ignoredFiles || '').split('\n').filter(f => f.trim());
		const ignoredHashes = (this.plugin.settings.ignoredHashes || '').split('\n').filter(f => f.trim());
		const hashMetadata = this.plugin.settings.ignoredHashMetadata || {};

		// 构建锁定列表缓存
		ignoredFiles.forEach((fileName, index) => {
			const hash = index < ignoredHashes.length ? ignoredHashes[index] : undefined;
			const metadata = hash ? hashMetadata[hash] : undefined;
			const filePath = metadata?.filePath || '未知位置';
			
			// 使用路径作为主键（路径是唯一的）
			const key = `path:${filePath}`;
			
			// 跳过重复路径
			if (this.lockListCache.has(key)) {
				return;
			}
			
			this.lockListCache.set(key, {
				fileName,
				filePath,
				md5: hash,
				addedTime: metadata?.addedTime || Date.now(),
				// 从设置加载的文件默认为存在
				exists: true,
				lastModified: undefined
			});
		});
	}

	/**
	 * 更新锁定列表中文件的状态
	 * 只更新 exists 标志，不删除任何文件
	 * 注意：路径为 "未知位置" 的文件保持 exists: true，避免被过滤掉
	 */
	private async updateFileStatus() {
		for (const [key, lockedFile] of this.lockListCache.entries()) {
			// 路径为 "未知位置" 的文件，保持 exists: true，不验证
			if (lockedFile.filePath === '未知位置') {
				lockedFile.exists = true;
				continue;
			}
			
			try {
				// 尝试从 vault 中获取文件
				const file = this.plugin.app.vault.getAbstractFileByPath(lockedFile.filePath);

				if (file && file instanceof TFile) {
					// 文件存在，更新状态
					lockedFile.exists = true;
					lockedFile.lastModified = file.stat.mtime;
				} else {
					// 文件不存在，但仍保留记录（保持 exists: true 避免被过滤）
					// 用户可能移动了文件，保留锁定记录以便手动管理
					lockedFile.exists = true;
				}
			} catch (error) {
				console.error(`[LockListManager] 更新文件状态失败: ${lockedFile.filePath}`, error);
				// 出错时也保持 exists: true，避免数据丢失
				lockedFile.exists = true;
			}
		}
	}

	/**
	 * 验证锁定列表中的文件是否仍然存在
	 * 仅更新状态，不自动删除任何锁定记录
	 * 用户需要手动在设置中管理锁定列表
	 */
	private async validateLockedFiles() {
		for (const [key, lockedFile] of this.lockListCache.entries()) {
			// 路径为 "未知位置" 的文件，跳过验证
			if (lockedFile.filePath === '未知位置') {
				continue;
			}
			
			try {
				// 尝试从 vault 中获取文件
				const file = this.plugin.app.vault.getAbstractFileByPath(lockedFile.filePath);

				if (file && file instanceof TFile) {
					// 文件存在，更新状态
					lockedFile.exists = true;
					lockedFile.lastModified = file.stat.mtime;
				} else {
					// 文件不存在，标记状态但不删除记录
					lockedFile.exists = false;
				}
			} catch (error) {
				console.error(`[LockListManager] 验证文件失败: ${lockedFile.filePath}`, error);
				lockedFile.exists = false;
			}
		}
		// 不再自动删除锁定记录，保留所有记录供用户管理
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
						imagePath: filePath,
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
	 * 保存所有锁定文件，不论文件是否存在
	 * @param skipCallback - 是否跳过回调（用于设置页内部操作）
	 */
	private async saveLockListToSettings(skipCallback: boolean = false) {
		const ignoredFiles: string[] = [];
		const ignoredHashes: string[] = [];
		const hashMetadata: Record<string, any> = {};

		for (const lockedFile of this.lockListCache.values()) {
			// 保存所有锁定文件，不论 exists 状态
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

		// 更新设置
		this.plugin.settings.ignoredFiles = ignoredFiles.join('\n');
		this.plugin.settings.ignoredHashes = ignoredHashes.join('\n');
		this.plugin.settings.ignoredHashMetadata = hashMetadata;

		// 保存到存储
		await this.plugin.saveSettings();
		
		// 触发回调，通知设置标签页刷新（除非跳过）
		if (!skipCallback && this.onLockListChanged) {
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
	 * 检查文件是否被锁定
	 * 三要素必须同时匹配：MD5 + 文件名 + 位置
	 * 这样可以精确识别每一个文件，即使是重复文件也能区分
	 * @param fileName - 文件名
	 * @param md5 - MD5 哈希值（可选）
	 * @param filePath - 文件路径（可选）
	 * @returns 是否被锁定
	 */
	isFileLockedByNameOrHash(fileName: string, md5?: string, filePath?: string): boolean {
		const lowerFileName = fileName.toLowerCase();
		
		for (const lockedFile of this.lockListCache.values()) {
			if (!lockedFile.exists) continue;
			
			// 1. MD5 必须匹配（如果双方都有 MD5）
			if (md5 && lockedFile.md5) {
				if (md5.toLowerCase() !== lockedFile.md5.toLowerCase()) {
					continue; // MD5 不匹配，跳过
				}
			}
			
			// 2. 文件名必须匹配
			const lowerLockedName = lockedFile.fileName.toLowerCase();
			if (lowerFileName !== lowerLockedName) {
				continue; // 文件名不匹配，跳过
			}
			
			// 3. 位置必须匹配（如果提供了路径）
			if (filePath && lockedFile.filePath) {
				if (filePath !== lockedFile.filePath) {
					continue; // 位置不匹配，跳过
				}
			}
			
			// 三要素都匹配，返回锁定
			return true;
		}
		
		return false;
	}

	/**
	 * 添加锁定文件
	 * 三要素唯一性：MD5 + 文件名 + 路径
	 * @param fileName - 文件名
	 * @param filePath - 文件路径
	 * @param md5 - MD5 哈希值（可选）
	 * @returns 是否成功添加（false 表示已存在）
	 */
	async addLockedFile(fileName: string, filePath: string, md5?: string): Promise<boolean> {
		const lowerFileName = fileName.toLowerCase();
		
		// 检查是否已存在完全相同的锁定（三要素都相同）
		for (const lockedFile of this.lockListCache.values()) {
			const sameHash = md5 && lockedFile.md5 && lockedFile.md5.toLowerCase() === md5.toLowerCase();
			const sameName = lockedFile.fileName.toLowerCase() === lowerFileName;
			const samePath = lockedFile.filePath === filePath;
			
			// 三要素都相同才判定为重复
			if (sameHash && sameName && samePath) {
				return false; // 完全相同，不重复添加
			}
		}
		
		// 使用路径作为主键（路径是唯一的）
		const key = `path:${filePath}`;

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
	 * 三要素匹配：MD5 + 文件名 + 位置
	 * @param fileName - 文件名
	 * @param md5 - MD5 哈希值（可选）
	 * @param filePath - 文件路径（可选）
	 * @param skipCallback - 是否跳过回调（用于设置页内部操作）
	 */
	async removeLockedFile(fileName: string, md5?: string, filePath?: string, skipCallback: boolean = false) {
		const lowerFileName = fileName.toLowerCase();
		const keysToRemove: string[] = [];
		
		for (const [key, lockedFile] of this.lockListCache.entries()) {
			// 1. MD5 必须匹配（如果双方都有）
			if (md5 && lockedFile.md5) {
				if (md5.toLowerCase() !== lockedFile.md5.toLowerCase()) {
					continue;
				}
			}
			
			// 2. 文件名必须匹配
			if (lockedFile.fileName.toLowerCase() !== lowerFileName) {
				continue;
			}
			
			// 3. 位置必须匹配（如果提供了路径）
			if (filePath && lockedFile.filePath) {
				if (filePath !== lockedFile.filePath) {
					continue;
				}
			}
			
			// 三要素都匹配，标记删除
			keysToRemove.push(key);
		}
		
		for (const key of keysToRemove) {
			this.lockListCache.delete(key);
		}

		// 保存到设置
		await this.saveLockListToSettings(skipCallback);
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
