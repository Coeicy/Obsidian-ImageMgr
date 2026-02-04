/**
 * DOM 缓存管理器
 * 
 * 用于减少重复的 DOM 查询，提高性能
 * 
 * 使用方式：
 * ```typescript
 * const domCache = new DOMCache();
 * const container = domCache.get('container', () => document.getElementById('container'));
 * ```
 */

/**
 * DOM 缓存管理器类
 */
export class DOMCache {
	/** 缓存存储：key -> DOM 元素 */
	private cache: Map<string, Element> = new Map();

	/**
	 * 构造函数
	 * @param _ttl 缓存有效期（毫秒），默认为 0（永久缓存）
	 */
	constructor(_ttl: number = 0) {
		// TTL 预留参数，未来可能用于自动过期清理
	}

	/**
	 * 获取或创建缓存的 DOM 元素
	 * @param key 缓存键
	 * @param factory 元素获取函数（仅在缓存不存在时调用）
	 * @returns DOM 元素
	 */
	public get(key: string, factory: () => Element | null): Element | null {
		// 检查缓存是否存在
		if (this.cache.has(key)) {
			const element = this.cache.get(key)!;
			// 检查元素是否仍在 DOM 中
			if (document.body.contains(element)) {
				return element;
			} else {
				// 元素已从 DOM 中移除，清除缓存
				this.cache.delete(key);
			}
		}

		// 调用工厂函数获取元素
		const element = factory();
		if (element) {
			this.cache.set(key, element);
		}

		return element;
	}

	/**
	 * 设置缓存的 DOM 元素
	 * @param key 缓存键
	 * @param element DOM 元素
	 */
	public set(key: string, element: Element): void {
		this.cache.set(key, element);
	}

	/**
	 * 检查缓存中是否存在某个键
	 * @param key 缓存键
	 * @returns 是否存在
	 */
	public has(key: string): boolean {
		return this.cache.has(key);
	}

	/**
	 * 删除指定键的缓存
	 * @param key 缓存键
	 */
	public delete(key: string): void {
		this.cache.delete(key);
	}

	/**
	 * 清空所有缓存
	 */
	public clear(): void {
		this.cache.clear();
	}

	/**
	 * 清除已失效的缓存（元素已从 DOM 中移除）
	 */
	public clean(): void {
		for (const [key, element] of this.cache.entries()) {
			if (!document.body.contains(element)) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * 批量删除指定前缀的缓存
	 * @param prefix 缓存键前缀
	 */
	public deleteByPrefix(prefix: string): void {
		for (const key of this.cache.keys()) {
			if (key.startsWith(prefix)) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * 获取缓存大小
	 */
	public size(): number {
		return this.cache.size;
	}
}

/**
 * DOM 元素引用容器
 * 
 * 用于存储组件的 DOM 元素引用，避免重复查询
 */
export class DOMReferences {
	/** 元素引用存储 */
	private refs: Map<string, Element> = new Map();

	/**
	 * 设置元素引用
	 * @param key 引用键
	 * @param element DOM 元素
	 */
	public set(key: string, element: Element): void {
		this.refs.set(key, element);
	}

	/**
	 * 获取元素引用
	 * @param key 引用键
	 * @returns DOM 元素或 null
	 */
	public get(key: string): Element | null {
		return this.refs.get(key) || null;
	}

	/**
	 * 检查是否存在引用
	 * @param key 引用键
	 * @returns 是否存在
	 */
	public has(key: string): boolean {
		return this.refs.has(key);
	}

	/**
	 * 删除引用
	 * @param key 引用键
	 */
	public delete(key: string): void {
		this.refs.delete(key);
	}

	/**
	 * 清空所有引用
	 */
	public clear(): void {
		this.refs.clear();
	}

	/**
	 * 批量设置引用
	 * @param refs 引用对象
	 */
	public setAll(refs: Record<string, Element>): void {
		for (const [key, element] of Object.entries(refs)) {
			this.refs.set(key, element);
		}
	}

	/**
	 * 获取所有引用键
	 */
	public keys(): string[] {
		return Array.from(this.refs.keys());
	}
}
