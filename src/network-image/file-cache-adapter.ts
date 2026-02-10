/**
 * 基于插件文件夹的文件缓存适配器
 *
 * 将网络图片缓存的元数据存储在插件目录下，替代 IndexedDB。
 * 路径：{vault}/.obsidian/plugins/imagemgr/network-image-cache/
 *
 * @file 提供与 IDBDatabase 兼容的接口，供 NetworkImageCacheManager / API / IncrementalScanner 使用
 */

import { ObjectStore } from './types';

const CACHE_DIR = 'network-image-cache';
const FILES = {
	[ObjectStore.IMAGES]: 'images.json',
	[ObjectStore.FILES]: 'files.json',
	[ObjectStore.METADATA]: 'metadata.json',
	[ObjectStore.BLACKLIST]: 'blacklist.json'
} as const;

/** 兼容 IDBRequest 的异步结果，支持 onsuccess/onerror 与 await */
function makeRequest<T>(run: () => Promise<T>): IDBRequest<T> {
	const req = {
		readyState: 'pending' as IDBRequest['readyState'],
		result: undefined as T | undefined,
		error: undefined as DOMException | undefined,
		onsuccess: null as (() => void) | null,
		onerror: null as (() => void) | null,
		then(onFulfilled?: (value: T) => any, onRejected?: (reason: any) => any) {
			return run()
				.then((v) => {
					(req as any).result = v;
					(req as any).readyState = 'done';
					req.onsuccess?.();
					return v;
				})
				.then(onFulfilled, onRejected);
		},
		catch(onRejected?: (reason: any) => any) {
			return run().catch((e) => {
				(req as any).error = e;
				(req as any).readyState = 'done';
				req.onerror?.();
				throw e;
			}).catch(onRejected);
		}
	};
	run()
		.then((v) => {
			(req as any).result = v;
			(req as any).readyState = 'done';
			req.onsuccess?.();
		})
		.catch((e) => {
			(req as any).error = e;
			(req as any).readyState = 'done';
			req.onerror?.();
		});
	return req as unknown as IDBRequest<T>;
}

/** 索引字段与 IMAGES 的索引名对应 */
const IMAGE_INDEX_FIELDS: Record<string, string> = {
	'by-url': 'url',
	'by-source-file': 'sourceFilePath',
	'by-status': 'status',
	'by-last-validated': 'lastValidated',
	'by-created-at': 'createdAt',
	'by-last-accessed': 'lastAccessed'
};

const FILE_INDEX_FIELDS: Record<string, string> = {
	'by-mtime': 'mtime',
	'by-status': 'status',
	'by-needs-rescan': 'needsRescan',
	'by-last-scanned': 'lastScanned'
};

const BLACKLIST_INDEX_FIELDS: Record<string, string> = {
	'by-detected-at': 'detectedAt',
	'by-reason': 'reason',
	'by-auto-remove': 'autoRemove'
};

export type VaultAdapter = {
	read: (path: string) => Promise<string>;
	write: (path: string, data: string) => Promise<void>;
	exists: (path: string) => Promise<boolean>;
	mkdir?: (path: string) => Promise<void>;
};

/**
 * 基于插件文件夹的缓存适配器
 * 在内存中维护四张表，从/向插件目录下的 JSON 文件读写
 */
export class FileCacheAdapter {
	private basePath: string;
	private adapter: VaultAdapter;
	private data: {
		[ObjectStore.IMAGES]: Record<string, any>;
		[ObjectStore.FILES]: Record<string, any>;
		[ObjectStore.METADATA]: Record<string, any>;
		[ObjectStore.BLACKLIST]: Record<string, any>;
	} = {
		[ObjectStore.IMAGES]: {},
		[ObjectStore.FILES]: {},
		[ObjectStore.METADATA]: {},
		[ObjectStore.BLACKLIST]: {}
	};
	private saveScheduled = false;

	constructor(adapter: VaultAdapter, pluginConfigDir: string) {
		this.adapter = adapter;
		this.basePath = `${pluginConfigDir}/plugins/imagemgr/${CACHE_DIR}`;
	}

	/** 缓存目录路径（供外部查看） */
	getCacheDir(): string {
		return this.basePath;
	}

	/** 从磁盘加载四张表 */
	async init(): Promise<IDBDatabase> {
		try {
			const exists = await this.adapter.exists(this.basePath);
			if (!exists && this.adapter.mkdir) {
				await this.adapter.mkdir(this.basePath);
			}
		} catch {
			// 目录可能已存在或 write 时会自动创建父目录
		}

		for (const [storeName, fileName] of Object.entries(FILES)) {
			const path = `${this.basePath}/${fileName}`;
			try {
				const raw = await this.adapter.read(path);
				const arr = JSON.parse(raw || '[]');
				const map: Record<string, any> = {};
				for (const item of Array.isArray(arr) ? arr : []) {
					const id = item?.id;
					if (id != null) map[id] = item;
				}
				this.data[storeName as keyof typeof this.data] = map;
			} catch (e) {
				console.warn(`[FileCacheAdapter] Failed to load ${fileName}:`, e instanceof Error ? e.message : e);
				this.data[storeName as keyof typeof this.data] = {};
			}
		}

		console.debug(`FileCacheAdapter: loaded cache from ${this.basePath}`);
		return this.getDB();
	}

	/** 延迟批量写盘 */
	private scheduleSave(): void {
		if (this.saveScheduled) return;
		this.saveScheduled = true;
		queueMicrotask(() => this.flush());
	}

	private async flush(): Promise<void> {
		this.saveScheduled = false;
		try {
			const exists = await this.adapter.exists(this.basePath);
			if (!exists && this.adapter.mkdir) {
				await this.adapter.mkdir(this.basePath);
			}
		} catch {}

		for (const [storeName, fileName] of Object.entries(FILES)) {
			const path = `${this.basePath}/${fileName}`;
			const map = this.data[storeName as keyof typeof this.data];
			const arr = Object.values(map);
			try {
				await this.adapter.write(path, JSON.stringify(arr, null, 2));
			} catch (e) {
				console.error(`[FileCacheAdapter] Failed to save ${fileName}:`, e instanceof Error ? e.message : e);
			}
		}
	}

	/** 返回与 IDBDatabase 兼容的 db 对象 */
	getDB(): IDBDatabase {
		const self = this;
		const data = this.data;

		function getStore(name: string): any {
			const storeData = data[name as keyof typeof data];
			if (!storeData) throw new Error(`Unknown object store: ${name}`);

			const index = (indexName: string) => {
				const field = name === ObjectStore.IMAGES ? IMAGE_INDEX_FIELDS[indexName]
					: name === ObjectStore.FILES ? FILE_INDEX_FIELDS[indexName]
						: name === ObjectStore.BLACKLIST ? BLACKLIST_INDEX_FIELDS[indexName]
							: undefined;
				const list = Object.values(storeData) as any[];
				return {
					getAll(key?: string): IDBRequest<any[]> {
						if (key !== undefined && field) {
							const filtered = list.filter((x) => x[field] === key);
							return makeRequest(() => Promise.resolve(filtered));
						}
						// 无 key：返回全部，按索引字段排序
						const sorted = field
							? [...list].sort((a, b) => (a[field] ?? 0) - (b[field] ?? 0))
							: list;
						return makeRequest(() => Promise.resolve(sorted));
					}
				};
			};

			return {
				get(key: string): IDBRequest<any> {
					return makeRequest(() => Promise.resolve(storeData[key] ?? undefined));
				},
				put(value: any): IDBRequest<IDBValidKey> {
					const id = value?.id ?? value;
					if (id == null) return makeRequest(() => Promise.reject(new Error('Missing id')));
					storeData[id] = value;
					self.scheduleSave();
					return makeRequest(() => Promise.resolve(id));
				},
				delete(key: string): IDBRequest<undefined> {
					delete storeData[key];
					self.scheduleSave();
					return makeRequest(() => Promise.resolve(undefined));
				},
				getAll(): IDBRequest<any[]> {
					return makeRequest(() => Promise.resolve(Object.values(storeData)));
				},
				index
			};
		}

		const db = {
			transaction(storeNames: string[] | DOMStringList, _mode: IDBTransactionMode = 'readonly') {
				const names = Array.from(storeNames);
				return {
					objectStore(name: string) {
						if (!names.includes(name)) throw new Error(`Store ${name} not in transaction`);
						return getStore(name);
					}
				};
			},
			close() {
				// no-op; flush 由 scheduleSave 触发
			},
			get readyState() {
				return 'open';
			},
			name: 'FileCache',
			version: 1,
			objectStoreNames: { contains: (n: string) => Object.keys(FILES).includes(n), length: 4 }
		};

		return db as unknown as IDBDatabase;
	}

	/** 关闭前可主动刷盘 */
	async close(): Promise<void> {
		await this.flush();
	}

	/** 清空所有缓存数据（图片、文件索引、元数据、黑名单） */
	async clearAll(): Promise<void> {
		this.data[ObjectStore.IMAGES] = {};
		this.data[ObjectStore.FILES] = {};
		this.data[ObjectStore.METADATA] = {};
		this.data[ObjectStore.BLACKLIST] = {};
		await this.flush();
	}
}

export default FileCacheAdapter;
