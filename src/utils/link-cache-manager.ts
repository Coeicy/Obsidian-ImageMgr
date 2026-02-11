import { App } from 'obsidian';

/**
 * 扫描错误对象（本地定义）
 */
interface ScanError {
    url: string;
    file?: string;
    type: string;
}

/**
 * 缓存链接数据结构
 * 
 * 存储扫描过程中发现的错误链接信息，用于避免重复扫描和错误提示
 */
interface CachedLink {
    url: string;           // 链接地址
    sourceFile: string;    // 来源文件路径
    errorType: string;     // 错误类型（ScanErrorType）
    lastChecked: string;   // 最后检查时间（ISO格式）
    ttl?: number;          // 生存时间（毫秒），可选，默认24小时
}

/**
 * 缓存管理器 - 网络图片错误链接缓存系统
 * 
 * 核心功能：
 * - 自动缓存加载和保存
 * - 智能过期清理（TTL机制）
 * - 文件级缓存组织
 * - 缓存命中优化
 * 
 * 性能优化：
 * - 异步文件操作，避免阻塞UI
 * - 自动过期清理，防止缓存膨胀
 * - 文件级缓存组织，提高查询效率
 * 
 * @example
 * ```typescript
 * const cacheManager = new LinkCacheManager(app);
 * await cacheManager.updateCache(error);
 * const shouldSkip = cacheManager.shouldSkipLink(error.url, error.file);
 * ```
 */
export class LinkCacheManager {
    /** 缓存数据存储，按文件路径分组 */
    private cache: Record<string, CachedLink[]> = {};
    /** 缓存文件路径 */
    private cachePath: string;
    /** 默认缓存生存时间（24小时） */
    private readonly defaultTTL = 24 * 60 * 60 * 1000;

    constructor(private app: App) {
        this.cachePath = `${this.app.vault.configDir}/plugins/imagemgr/link-cache.json`;
        this.loadCache();
    }

    /**
     * 加载缓存文件
     * 自动清理过期缓存条目
     */
    async loadCache() {
        try {
            const data = await this.app.vault.adapter.read(this.cachePath);
            const rawCache = JSON.parse(data);
            
            // 清理过期缓存
            this.cache = this.cleanExpiredCache(rawCache);
            
            console.log(`LinkCacheManager: 缓存加载成功，共 ${Object.keys(this.cache).length} 个文件组的缓存`);
        } catch (error) {
            this.cache = {};
            console.log('LinkCacheManager: 缓存文件不存在或读取失败，创建新缓存');
        }
    }

    /**
     * 保存缓存到文件
     * 自动清理过期缓存后再保存
     */
    async saveCache() {
        try {
            // 保存前清理过期缓存
            this.cache = this.cleanExpiredCache(this.cache);
            await this.app.vault.adapter.write(this.cachePath, JSON.stringify(this.cache, null, 2));
            console.log('LinkCacheManager: 缓存保存成功');
        } catch (error) {
            console.error('LinkCacheManager: 缓存保存失败', error);
        }
    }

    /**
     * 更新缓存
     * @param error - 扫描错误对象
     */
    async updateCache(error: ScanError) {
        const key = error.file || 'global';
        if (!this.cache[key]) this.cache[key] = [];
        
        const existing = this.cache[key].find(x => x.url === error.url);
        const now = new Date().toISOString();
        
        if (existing) {
            // 更新现有记录
            existing.lastChecked = now;
            existing.errorType = error.type;
            console.log(`LinkCacheManager: 更新缓存记录 - ${error.url}`);
        } else {
            // 添加新记录
            this.cache[key].push({
                url: error.url,
                sourceFile: error.file || '',
                errorType: error.type,
                lastChecked: now,
                ttl: this.defaultTTL
            });
            console.log(`LinkCacheManager: 添加新缓存记录 - ${error.url}`);
        }
        
        await this.saveCache();
    }

    /**
     * 从缓存中移除记录
     * @param error - 扫描错误对象
     */
    async removeFromCache(error: ScanError) {
        const key = error.file || 'global';
        if (this.cache[key]) {
            const beforeCount = this.cache[key].length;
            this.cache[key] = this.cache[key].filter(x => x.url !== error.url);
            const afterCount = this.cache[key].length;
            
            if (beforeCount !== afterCount) {
                console.log(`LinkCacheManager: 移除缓存记录 - ${error.url}`);
                await this.saveCache();
            }
        }
    }

    /**
     * 检查是否应该跳过链接扫描
     * @param url - 链接地址
     * @param sourceFile - 来源文件
     * @returns 是否应该跳过扫描
     */
    shouldSkipLink(url: string, sourceFile?: string): boolean {
        const key = sourceFile || 'global';
        if (!this.cache[key]) return false;
        
        const cachedLink = this.cache[key].find(x => x.url === url);
        if (!cachedLink) return false;
        
        // 检查是否过期
        const lastChecked = new Date(cachedLink.lastChecked).getTime();
        const ttl = cachedLink.ttl || this.defaultTTL;
        const isExpired = Date.now() - lastChecked > ttl;
        
        if (isExpired) {
            console.log(`LinkCacheManager: 缓存记录已过期 - ${url}`);
            return false;
        }
        
        console.log(`LinkCacheManager: 跳过扫描（缓存命中） - ${url}`);
        return true;
    }

    /**
     * 清理过期缓存
     * @param cache - 原始缓存数据
     * @returns 清理后的缓存数据
     */
    private cleanExpiredCache(cache: Record<string, CachedLink[]>): Record<string, CachedLink[]> {
        const cleanedCache: Record<string, CachedLink[]> = {};
        const now = Date.now();
        let expiredCount = 0;
        
        for (const [key, links] of Object.entries(cache)) {
            const validLinks = links.filter(link => {
                const lastChecked = new Date(link.lastChecked).getTime();
                const ttl = link.ttl || this.defaultTTL;
                const isValid = now - lastChecked <= ttl;
                
                if (!isValid) {
                    expiredCount++;
                }
                
                return isValid;
            });
            
            if (validLinks.length > 0) {
                cleanedCache[key] = validLinks;
            }
        }
        
        if (expiredCount > 0) {
            console.log(`LinkCacheManager: 清理了 ${expiredCount} 个过期缓存记录`);
        }
        
        return cleanedCache;
    }

    /**
     * 获取缓存统计信息
     */
    getCacheStats(): { totalFiles: number; totalLinks: number; expiredLinks: number } {
        const now = Date.now();
        let totalLinks = 0;
        let expiredLinks = 0;
        
        for (const links of Object.values(this.cache)) {
            totalLinks += links.length;
            expiredLinks += links.filter(link => {
                const lastChecked = new Date(link.lastChecked).getTime();
                const ttl = link.ttl || this.defaultTTL;
                return now - lastChecked > ttl;
            }).length;
        }
        
        return {
            totalFiles: Object.keys(this.cache).length,
            totalLinks,
            expiredLinks
        };
    }

    /**
     * 手动清理所有过期缓存
     */
    async cleanExpiredCacheManually() {
        const beforeStats = this.getCacheStats();
        this.cache = this.cleanExpiredCache(this.cache);
        const afterStats = this.getCacheStats();
        
        console.log(`LinkCacheManager: 手动清理完成，清理了 ${beforeStats.totalLinks - afterStats.totalLinks} 个过期记录`);
        await this.saveCache();
    }

    /**
     * 清空所有缓存
     */
    async clearAllCache() {
        this.cache = {};
        console.log('LinkCacheManager: 清空所有缓存');
        await this.saveCache();
    }
}