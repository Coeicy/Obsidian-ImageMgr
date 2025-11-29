import ImageManagementPlugin from '../main';
import { TFile, Vault } from 'obsidian';

/**
 * 哈希值缓存管理器
 * 负责缓存图片的MD5哈希值，避免重复计算
 */
export class HashCacheManager {
	private cache: Map<string, { hash: string; mtime: number; size: number }> = new Map();

	constructor(private plugin: ImageManagementPlugin) {
		this.loadCache();
	}

	/**
	 * 从插件数据加载缓存
	 */
	private loadCache() {
		const data = this.plugin.data || {};
		const cachedData = data.imageHashCache;
		
		if (cachedData) {
			this.cache = new Map(Object.entries(cachedData));
		}
	}

	/**
	 * 保存缓存到插件数据
	 */
	private async saveCache() {
		const data = this.plugin.data || {};
		data.imageHashCache = Object.fromEntries(this.cache);
		await this.plugin.saveData(data);
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
	async setCachedHash(file: TFile, hash: string) {
		this.cache.set(file.path, {
			hash,
			mtime: file.stat.mtime,
			size: file.stat.size
		});
		// 异步保存，不阻塞
		this.saveCache().catch(() => {
			// 保存失败不影响功能
		});
	}

	/**
	 * 清除指定文件的缓存
	 */
	async clearHash(filePath: string) {
		this.cache.delete(filePath);
		await this.saveCache();
	}

	/**
	 * 清除所有缓存
	 */
	async clearAllCache() {
		this.cache.clear();
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

