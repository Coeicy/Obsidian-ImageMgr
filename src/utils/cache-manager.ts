/**
 * 通用缓存管理器
 * 
 * 提供带大小限制的 LRU 缓存机制，用于管理内存中的缓存数据。
 * 
 * 功能：
 * - LRU (Least Recently Used) 淘汰策略
 * - 大小限制，防止内存无限增长
 * - 支持过期时间 (TTL)
 * - 类型安全
 * 
 * @template K 键类型
 * @template V 值类型
 */

export interface CacheEntry<V> {
	value: V;
	lastAccessed: number;
	createdAt: number;
}

export interface CacheOptions {
	/** 最大缓存条目数 */
	maxSize: number;
	/** 条目过期时间（毫秒），0 表示不过期 */
	ttl: number;
	/** 是否启用调试日志 */
	debug: boolean;
}

export const DEFAULT_CACHE_OPTIONS: CacheOptions = {
	maxSize: 1000,
	ttl: 0,
	debug: false
};

export class CacheManager<K, V> {
	private cache: Map<K, CacheEntry<V>>;
	private options: CacheOptions;
	private name: string;

	/**
	 * 创建缓存管理器实例
	 * @param name 缓存名称（用于调试）
	 * @param options 缓存配置选项
	 */
	constructor(name: string, options: Partial<CacheOptions> = {}) {
		this.name = name;
		this.options = { ...DEFAULT_CACHE_OPTIONS, ...options };
		this.cache = new Map();
	}

	/**
	 * 获取缓存值
	 * @param key 缓存键
	 * @returns 缓存值或 undefined
	 */
	get(key: K): V | undefined {
		const entry = this.cache.get(key);
		
		if (!entry) {
			return undefined;
		}

		// 检查是否过期
		if (this.options.ttl > 0) {
			const now = Date.now();
			if (now - entry.createdAt > this.options.ttl) {
				this.cache.delete(key);
				this.log('debug', `Key "${key}" expired and removed`);
				return undefined;
			}
		}

		// 更新访问时间
		entry.lastAccessed = Date.now();
		
		// 移动到 Map 末尾（保持 LRU 顺序）
		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry.value;
	}

	/**
	 * 设置缓存值
	 * @param key 缓存键
	 * @param value 缓存值
	 */
	set(key: K, value: V): void {
		// 如果已存在，先删除旧的
		if (this.cache.has(key)) {
			this.cache.delete(key);
		}

		// 检查是否需要清理
		if (this.cache.size >= this.options.maxSize) {
			this.cleanupLRU();
		}

		const now = Date.now();
		this.cache.set(key, {
			value,
			lastAccessed: now,
			createdAt: now
		});

		this.log('debug', `Key "${key}" set, cache size: ${this.cache.size}`);
	}

	/**
	 * 删除缓存条目
	 * @param key 缓存键
	 * @returns 是否成功删除
	 */
	delete(key: K): boolean {
		const existed = this.cache.delete(key);
		if (existed) {
			this.log('debug', `Key "${key}" deleted`);
		}
		return existed;
	}

	/**
	 * 检查缓存中是否存在键
	 * @param key 缓存键
	 */
	has(key: K): boolean {
		const entry = this.cache.get(key);
		
		if (!entry) {
			return false;
		}

		// 检查是否过期
		if (this.options.ttl > 0) {
			if (Date.now() - entry.createdAt > this.options.ttl) {
				this.cache.delete(key);
				return false;
			}
		}

		return true;
	}

	/**
	 * 获取缓存大小
	 */
	size(): number {
		return this.cache.size;
	}

	/**
	 * 清空缓存
	 */
	clear(): void {
		const oldSize = this.cache.size;
		this.cache.clear();
		this.log('debug', `Cache cleared, removed ${oldSize} entries`);
	}

	/**
	 * 获取所有键
	 */
	keys(): IterableIterator<K> {
		return this.cache.keys();
	}

	/**
	 * 获取所有值（自动清理过期条目）
	 */
	values(): V[] {
		this.cleanupExpired();
		return Array.from(this.cache.values()).map(entry => entry.value);
	}

	/**
	 * 获取缓存统计信息
	 */
	getStats(): {
		size: number;
		maxSize: number;
		hitRate: number;
		accessCount: number;
		hitCount: number;
	} {
		return {
			size: this.cache.size,
			maxSize: this.options.maxSize,
			hitRate: 0, // 需要额外统计
			accessCount: 0,
			hitCount: 0
		};
	}

	/**
	 * LRU 清理：删除最久未访问的条目
	 * @param count 要删除的条目数，默认为 1
	 */
	private cleanupLRU(count: number = 1): void {
		const keysToDelete = Array.from(this.cache.keys()).slice(0, count);
		for (const key of keysToDelete) {
			this.cache.delete(key);
		}
		this.log('debug', `LRU cleanup: removed ${keysToDelete.length} entries`);
	}

	/**
	 * 清理过期条目
	 */
	private cleanupExpired(): void {
		if (this.options.ttl <= 0) {
			return;
		}

		const now = Date.now();
		let cleaned = 0;
		
		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.createdAt > this.options.ttl) {
				this.cache.delete(key);
				cleaned++;
			}
		}

		if (cleaned > 0) {
			this.log('debug', `Expired cleanup: removed ${cleaned} entries`);
		}
	}

	/**
	 * 日志输出
	 */
	private log(level: 'debug' | 'info' | 'warn', message: string): void {
		if (!this.options.debug && level === 'debug') {
			return;
		}
		console[level](`[CacheManager:${this.name}] ${message}`);
	}
}

/**
 * 嵌套缓存管理器
 * 
 * 用于管理嵌套的 Map 结构，如 displayTextCache: Map<filePath, Map<lineNumber, displayText>>
 */
export class NestedCacheManager<K1, K2, V> {
	private cache: Map<K1, CacheManager<K2, V>>;
	private options: CacheOptions;
	private name: string;

	constructor(name: string, options: Partial<CacheOptions> = {}) {
		this.name = name;
		this.options = { ...DEFAULT_CACHE_OPTIONS, ...options };
		this.cache = new Map();
	}

	/**
	 * 获取嵌套缓存值
	 */
	get(key1: K1, key2: K2): V | undefined {
		const innerCache = this.cache.get(key1);
		if (!innerCache) {
			return undefined;
		}
		return innerCache.get(key2);
	}

	/**
	 * 设置嵌套缓存值
	 */
	set(key1: K1, key2: K2, value: V): void {
		let innerCache = this.cache.get(key1);
		if (!innerCache) {
			innerCache = new CacheManager<K2, V>(`${this.name}:${key1}`, this.options);
			
			// 检查外层缓存大小
			if (this.cache.size >= this.options.maxSize) {
				this.cleanupLRU();
			}
			
			this.cache.set(key1, innerCache);
		}
		
		innerCache.set(key2, value);
	}

	/**
	 * 删除外层键（及其所有内层缓存）
	 */
	delete(key1: K1): boolean {
		return this.cache.delete(key1);
	}

	/**
	 * 删除特定嵌套键
	 */
	deleteNested(key1: K1, key2: K2): boolean {
		const innerCache = this.cache.get(key1);
		if (!innerCache) {
			return false;
		}
		return innerCache.delete(key2);
	}

	/**
	 * 清空所有缓存
	 */
	clear(): void {
		for (const innerCache of this.cache.values()) {
			innerCache.clear();
		}
		this.cache.clear();
	}

	/**
	 * 获取总条目数
	 */
	size(): number {
		let total = 0;
		for (const innerCache of this.cache.values()) {
			total += innerCache.size();
		}
		return total;
	}

	/**
	 * LRU 清理
	 */
	private cleanupLRU(count: number = 1): void {
		const keysToDelete = Array.from(this.cache.keys()).slice(0, count);
		for (const key of keysToDelete) {
			this.cache.delete(key);
		}
	}
}
