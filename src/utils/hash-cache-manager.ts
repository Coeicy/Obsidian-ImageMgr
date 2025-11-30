import ImageManagementPlugin from '../main';
import { TFile, Vault, debounce } from 'obsidian';

/**
 * 哈希值缓存管理器
 * 负责缓存图片的MD5哈希值，避免重复计算
 */
export class HashCacheManager {
	private cache: Map<string, { hash: string; mtime: number; size: number }> = new Map();
	private isDirty: boolean = false;
	private saveDebounced: () => void;

	constructor(private plugin: ImageManagementPlugin) {
		this.loadCache();
		// 防抖保存，避免频繁写入文件
		this.saveDebounced = debounce(() => this.saveCache(), 2000, true);
	}

	/**
	 * 从插件数据加载缓存
	 */
	private loadCache() {
		const data = this.plugin.data || {};
		const cachedData = data.imageHashCache;
		
		if (cachedData && typeof cachedData === 'object') {
			this.cache = new Map(Object.entries(cachedData));
		}
	}

	/**
	 * 保存缓存到插件数据（内部方法）
	 */
	private async saveCache() {
		if (!this.isDirty) return;
		
		try {
			// 直接更新 plugin.data 中的缓存字段
			this.plugin.data.imageHashCache = Object.fromEntries(this.cache);
			await this.plugin.saveData(this.plugin.data);
			this.isDirty = false;
		} catch (error) {
			// 保存失败不影响功能
		}
	}
	
	/**
	 * 强制保存缓存（扫描完成后调用）
	 */
	async flushCache() {
		this.isDirty = true;
		await this.saveCache();
	}

	/**
	 * 获取缓存的哈希值
	 */
	getCachedHash(file: TFile): string | null {
		const cached = this.cache.get(file.path);
		if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) {
			return cached.hash;
		}
		return null;
	}

	/**
	 * 设置哈希值缓存
	 */
	setCachedHash(file: TFile, hash: string) {
		this.cache.set(file.path, {
			hash,
			mtime: file.stat.mtime,
			size: file.stat.size
		});
		this.isDirty = true;
		// 使用防抖保存，避免频繁写入
		this.saveDebounced();
	}

	/**
	 * 清除指定文件的缓存
	 */
	clearHash(filePath: string) {
		this.cache.delete(filePath);
		this.isDirty = true;
		this.saveDebounced();
	}

	/**
	 * 清除所有缓存
	 */
	async clearAllCache() {
		this.cache.clear();
		this.isDirty = true;
		await this.saveCache();
	}

	/**
	 * 清理无效缓存（文件已不存在或已修改）
	 */
	async cleanupCache(vault: Vault) {
		const filesToRemove: string[] = [];
		
		for (const [path, cached] of this.cache.entries()) {
			const file = vault.getAbstractFileByPath(path) as TFile | null;
			if (!file || file.stat.mtime !== cached.mtime || file.stat.size !== cached.size) {
				filesToRemove.push(path);
			}
		}
		
		for (const path of filesToRemove) {
			this.cache.delete(path);
		}
		
		if (filesToRemove.length > 0) {
			await this.saveCache();
		}
		
		return filesToRemove.length;
	}

	/**
	 * 获取缓存统计信息
	 */
	getCacheStats(): { total: number; valid: number; invalid: number } {
		return {
			total: this.cache.size,
			valid: this.cache.size, // 简化统计，实际应该检查有效性
			invalid: 0
		};
	}
}

