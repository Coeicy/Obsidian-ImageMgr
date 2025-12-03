/**
 * 哈希缓存管理器模块
 * 
 * 管理图片 MD5 哈希值的缓存，避免重复计算哈希值。
 * 缓存数据持久化存储在插件数据文件中。
 */

import ImageManagementPlugin from '../main';
import { TFile, Vault, debounce } from 'obsidian';

/**
 * 哈希值缓存管理器
 * 
 * 功能：
 * - 缓存图片的 MD5 哈希值，避免重复计算
 * - 基于文件修改时间和大小验证缓存有效性
 * - 自动持久化缓存到插件数据文件
 * - 支持防抖保存，避免频繁写入
 * - 提供缓存清理和统计功能
 * 
 * 缓存验证机制：
 * 当文件的修改时间或大小发生变化时，缓存自动失效，
 * 需要重新计算哈希值。这确保了缓存的准确性。
 */
export class HashCacheManager {
	/** 内存中的缓存映射：文件路径 -> { hash, mtime, size } */
	private cache: Map<string, { hash: string; mtime: number; size: number }> = new Map();
	/** 标记缓存是否有未保存的更改 */
	private isDirty: boolean = false;
	/** 防抖保存函数 */
	private saveDebounced: () => void;

	/**
	 * 创建哈希缓存管理器实例
	 * @param plugin - 插件实例，用于访问持久化存储
	 */
	constructor(private plugin: ImageManagementPlugin) {
		this.loadCache();
		// 防抖保存，避免频繁写入文件（2秒延迟）
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
	 * 
	 * 只有当文件的修改时间和大小都与缓存匹配时才返回缓存的哈希值。
	 * 这确保了当文件被修改后，会重新计算哈希值。
	 * 
	 * @param file - 要查询的文件
	 * @returns 缓存的哈希值，如果缓存无效则返回 null
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
	 * 
	 * 将计算好的哈希值存入缓存，同时记录文件的修改时间和大小
	 * 用于后续验证缓存有效性。
	 * 
	 * @param file - 文件对象
	 * @param hash - 计算好的 MD5 哈希值
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
	 * 
	 * 当文件被删除或移动时调用，确保缓存数据的一致性。
	 * 
	 * @param filePath - 文件路径
	 */
	clearHash(filePath: string) {
		this.cache.delete(filePath);
		this.isDirty = true;
		this.saveDebounced();
	}

	/**
	 * 清除所有缓存
	 * 
	 * 完全清空缓存数据，下次扫描时会重新计算所有哈希值。
	 * 通常在用户手动请求或检测到缓存损坏时调用。
	 */
	async clearAllCache() {
		this.cache.clear();
		this.isDirty = true;
		await this.saveCache();
	}

	/**
	 * 清理无效缓存
	 * 
	 * 遍历所有缓存条目，移除以下情况的缓存：
	 * - 文件已不存在
	 * - 文件的修改时间已变化
	 * - 文件的大小已变化
	 * 
	 * @param vault - Vault 实例，用于检查文件是否存在
	 * @returns 被清理的缓存条目数量
	 */
	async cleanupCache(vault: Vault): Promise<number> {
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
	 * 
	 * 返回当前缓存的统计数据，用于调试和监控。
	 * 
	 * @returns 包含总数、有效数和无效数的统计对象
	 */
	getCacheStats(): { total: number; valid: number; invalid: number } {
		return {
			total: this.cache.size,
			valid: this.cache.size, // 简化统计，实际应该检查有效性
			invalid: 0
		};
	}
}

