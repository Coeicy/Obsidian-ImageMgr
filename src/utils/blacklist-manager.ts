/**
 * 智能黑名单管理器
 * 
 * 功能特性：
 * - 自动检测网络连接错误
 * - 智能域名识别和统计
 * - 自动添加频繁失败的域名到黑名单
 * - 支持手动管理和自动清理
 * - 本地持久化缓存，避免每次重新加载
 * 
 * @version 1.1.0
 * @author ImageMgr Plugin
 */

export interface BlacklistItem {
    domain: string;
    reason: 'connection_error' | 'dns_error' | 'http_error' | 'manual';
    errorCount: number;
    firstFailure: number;
    lastFailure: number;
    addedTime: number;
    errorMessages: string[];
}

export interface DomainStats {
    failures: number;
    successes: number;
    firstFailure: number;
    lastFailure: number;
    errorTypes: Set<string>;
}

export class BlacklistManager {
    private domainStats = new Map<string, DomainStats>();
    private blacklist = new Set<string>();
    private archivedRecords = new Map<string, { domain: string; stats: DomainStats; archiveTime: number }>();
    private isInitialized = false;
    private enableLogging = true;
    
    // 本地存储键名
    private readonly STORAGE_KEY_BLACKLIST = 'imagemgr_blacklist_cache';
    private readonly STORAGE_KEY_STATS = 'imagemgr_domain_stats_cache';
    private readonly STORAGE_KEY_ARCHIVED = 'imagemgr_archived_records';
    
    // 配置参数 - 容量无限优化
    private readonly config = {
        maxFailures: 2,           // 连续失败2次即加入黑名单
        timeWindow: 1 * 60 * 60 * 1000, // 统计时间窗口：1小时
        autoAddThreshold: 0.6,    // 失败率60%即加入黑名单
        cleanupInterval: 10 * 60 * 1000, // 清理间隔：10分钟
        maxBlacklistSize: 0,      // 容量无限：0表示无限制
        cacheExpiry: 7 * 24 * 60 * 60 * 1000, // 缓存过期时间（7天）
        bulkDomainThreshold: 10,  // 批量域名阈值：同域名下10个链接错误即批量处理
        fastTrackDomains: ['ax1x.com', 'imgur.com', 'github.com'], // 快速通道域名
        maxMemorySize: 10000,     // 内存最大域名数（避免内存溢出）
        autoArchiveThreshold: 1000, // 自动归档阈值
        archiveExpiry: 30 * 24 * 60 * 60 * 1000 // 归档记录保存30天
    };
    
    constructor(private plugin?: any) {
        // 初始化时加载缓存
        this.initializeCache();
        // 定期清理过期记录
        setInterval(() => this.cleanupOldRecords(), this.config.cleanupInterval);
    }
    
    /**
     * 初始化缓存
     */
    private async initializeCache(): Promise<void> {
        if (this.isInitialized) return;
        
        try {
            // 从本地存储加载缓存数据
            const cachedBlacklist = this.loadFromStorage(this.STORAGE_KEY_BLACKLIST);
            const cachedStats = this.loadFromStorage(this.STORAGE_KEY_STATS);
            const cachedArchived = this.loadFromStorage(this.STORAGE_KEY_ARCHIVED);
            
            if (cachedBlacklist && cachedBlacklist.expiry > Date.now()) {
                this.blacklist = new Set(cachedBlacklist.domains || []);
                console.log(`[BlacklistManager] Loaded ${this.blacklist.size} domains from cache`);
            } else {
                // 缓存过期或不存在，从插件设置加载
                await this.loadFromPluginSettings();
                // 保存到缓存
                this.saveToCache();
            }
            
            if (cachedStats && cachedStats.expiry > Date.now()) {
                this.domainStats = new Map(Object.entries(cachedStats.stats || {}));
                console.log(`[BlacklistManager] Loaded ${this.domainStats.size} domain stats from cache`);
            }
            
            if (cachedArchived && cachedArchived.expiry > Date.now()) {
                this.archivedRecords = new Map(Object.entries(cachedArchived.records || {}));
                console.log(`[BlacklistManager] Loaded ${this.archivedRecords.size} archived records from cache`);
            }
            
            this.isInitialized = true;
            console.log('[BlacklistManager] Cache initialization completed');
        } catch (error) {
            console.warn('[BlacklistManager] Cache initialization failed:', error);
            // 降级处理：从插件设置加载
            await this.loadFromPluginSettings();
            this.isInitialized = true;
        }
    }
    
    /**
     * 从插件设置加载黑名单
     */
    private async loadFromPluginSettings(): Promise<void> {
        try {
            if (this.plugin?.settings?.remoteImageBlacklist) {
                const blacklist = this.plugin.settings.remoteImageBlacklist;
                this.blacklist = new Set(blacklist);
                console.log(`[BlacklistManager] Loaded ${blacklist.length} domains from plugin settings`);
            }
        } catch (error) {
            console.warn('[BlacklistManager] Failed to load from plugin settings:', error);
        }
    }
    
    /**
     * 保存到本地缓存
     */
    private saveToCache(): void {
        try {
            const blacklistData = {
                domains: Array.from(this.blacklist),
                expiry: Date.now() + this.config.cacheExpiry,
                timestamp: Date.now()
            };
            
            const statsData = {
                stats: Object.fromEntries(this.domainStats),
                expiry: Date.now() + this.config.cacheExpiry,
                timestamp: Date.now()
            };
            
            const archivedData = {
                records: Object.fromEntries(this.archivedRecords),
                expiry: Date.now() + this.config.cacheExpiry,
                timestamp: Date.now()
            };
            
            this.saveToStorage(this.STORAGE_KEY_BLACKLIST, blacklistData);
            this.saveToStorage(this.STORAGE_KEY_STATS, statsData);
            this.saveToStorage(this.STORAGE_KEY_ARCHIVED, archivedData);
            
            console.log('[BlacklistManager] Cache saved successfully');
        } catch (error) {
            console.warn('[BlacklistManager] Failed to save cache:', error);
        }
    }
    
    /**
     * 保存到本地存储
     */
    private saveToStorage(key: string, data: any): void {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.warn(`[BlacklistManager] Failed to save to localStorage (${key}):`, error);
        }
    }
    
    /**
     * 从本地存储加载
     */
    private loadFromStorage(key: string): any {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.warn(`[BlacklistManager] Failed to load from localStorage (${key}):`, error);
            return null;
        }
    }
    
    /**
     * 记录域名访问结果
     * @param url - 访问的 URL
     * @param success - 是否成功
     * @param error - 错误信息（可选）
     */
    recordDomainAccess(url: string, success: boolean, error?: string): void {
        try {
            const domain = this.extractDomain(url);
            if (!domain) return;
            
            const now = Date.now();
            const stats = this.domainStats.get(domain) || {
                failures: 0,
                successes: 0,
                firstFailure: 0,
                lastFailure: 0,
                errorTypes: new Set<string>()
            };
            
            const beforeFailures = stats.failures;
            
            if (success) {
                stats.successes++;
                if (this.enableLogging && stats.successes % 50 === 0) {
                    console.log(`[BlacklistManager] ${domain} 成功访问 ${stats.successes} 次`);
                }
            } else {
                stats.failures++;
                stats.lastFailure = now;
                if (!stats.firstFailure) {
                    stats.firstFailure = now;
                }
                if (error) {
                    const errorType = this.classifyError(error);
                    stats.errorTypes.add(errorType);
                    
                    // 记录重要错误
                    if (errorType === 'connection_error' && stats.failures <= 3) {
                        console.warn(`[BlacklistManager] ${domain} 连接错误: ${error}`);
                    }
                }
            }
            
            this.domainStats.set(domain, stats);
            
            // 检查是否需要自动添加到黑名单
            if (!success && this.shouldAutoBlacklist(domain, stats)) {
                this.autoAddToBlacklist(domain, error || 'Unknown error');
            }
            
            // 智能内存管理：检查是否需要归档
            if (this.domainStats.size > this.config.maxMemorySize) {
                this.autoArchiveOldRecords();
            }
            
            // 定期保存统计信息到缓存（避免频繁写入）
            const shouldSave = 
                (stats.failures > 0 && stats.failures % 3 === 0) || 
                (stats.successes > 0 && stats.successes % 20 === 0) ||
                (beforeFailures !== stats.failures && this.blacklist.has(domain));
            
            if (shouldSave) {
                setTimeout(() => this.saveToCache(), 100); // 延迟保存，避免阻塞
            }
            
            // 每100次记录输出一次统计信息
            if ((stats.failures + stats.successes) % 100 === 0) {
                console.log(`[BlacklistManager] ${domain} 统计: ${stats.failures} 失败 / ${stats.successes} 成功`);
            }
            
        } catch (error) {
            // 静默处理错误
            if (this.enableLogging) {
                console.warn(`[BlacklistManager] 记录域名访问失败:`, error);
            }
        }
    }
    
    /**
     * 检查域名是否应该自动添加到黑名单
     * @param domain - 域名
     * @param stats - 统计信息
     * @returns 是否应该添加到黑名单
     */
    private shouldAutoBlacklist(domain: string, stats: DomainStats): boolean {
        // 快速通道域名：优先处理
        const isFastTrack = this.config.fastTrackDomains.some(fastDomain => 
            domain.includes(fastDomain)
        );
        
        if (isFastTrack) {
            // 快速通道域名：立即处理
            return stats.failures >= 1;
        }
        
        // 批量域名处理：同域名下大量链接错误
        if (stats.failures >= this.config.bulkDomainThreshold) {
            console.log(`[BlacklistManager] 检测到批量域名错误: ${domain}, 失败次数: ${stats.failures}`);
            return true;
        }
        
        // 检查失败次数
        if (stats.failures >= this.config.maxFailures) {
            return true;
        }
        
        // 检查失败率
        const totalAttempts = stats.failures + stats.successes;
        if (totalAttempts >= 2) { // 降低尝试次数阈值
            const failureRate = stats.failures / totalAttempts;
            if (failureRate >= this.config.autoAddThreshold) {
                return true;
            }
        }
        
        // 检查是否为连接类错误
        const hasConnectionError = Array.from(stats.errorTypes).some(type => 
            type === 'connection_error' || type === 'dns_error'
        );
        
        return hasConnectionError && stats.failures >= 1;
    }
    
    /**
     * 自动添加域名到黑名单
     * @param domain - 域名
     * @param error - 错误信息
     */
    private autoAddToBlacklist(domain: string, error: string): void {
        if (this.blacklist.has(domain)) return;
        
        // 添加到内存黑名单
        this.blacklist.add(domain);
        
        // 添加到插件设置的黑名单
        this.addToPluginBlacklist(domain, error);
        
        console.log(`[BlacklistManager] 自动添加域名到黑名单: ${domain}`, { error });
    }
    
    /**
     * 添加到插件设置的黑名单
     * @param domain - 域名
     * @param errorMessage - 错误信息
     */
    private addToPluginBlacklist(domain: string, errorMessage: string): void {
        try {
            if (this.plugin?.settings?.remoteImageBlacklist) {
                const blacklist = this.plugin.settings.remoteImageBlacklist;
                if (!blacklist.includes(domain)) {
                    blacklist.push(domain);
                    this.plugin.saveSettings?.();
                }
            }
        } catch {
            // 静默处理插件设置保存失败
        }
    }
    
    /**
     * 检查域名是否在黑名单中（支持归档记录检查）
     * @param url - 要检查的 URL
     * @returns 是否在黑名单中
     */
    isBlacklisted(url: string): boolean {
        const domain = this.extractDomain(url);
        if (!domain) return false;
        
        // 检查活跃黑名单
        if (this.blacklist.has(domain)) return true;
        
        // 检查归档记录（如果域名在归档中且有黑名单记录）
        const archivedRecord = this.archivedRecords.get(domain);
        if (archivedRecord && archivedRecord.stats.failures >= this.config.maxFailures) {
            // 自动恢复归档记录
            this.restoreFromArchive(domain);
            return true;
        }
        
        return false;
    }
    
    /**
     * 从归档恢复记录
     * @param domain - 域名
     */
    private restoreFromArchive(domain: string): void {
        const archivedRecord = this.archivedRecords.get(domain);
        if (!archivedRecord) return;
        
        // 恢复统计信息
        this.domainStats.set(domain, { ...archivedRecord.stats });
        
        // 恢复黑名单状态
        if (archivedRecord.stats.failures >= this.config.maxFailures) {
            this.blacklist.add(domain);
        }
        
        // 从归档中移除
        this.archivedRecords.delete(domain);
        
        console.log(`[BlacklistManager] 恢复归档记录: ${domain}`);
    }
    
    /**
     * 手动添加域名到黑名单
     * @param domain - 域名
     * @param reason - 原因
     */
    addToBlacklist(domain: string, reason: 'manual' | 'connection_error' = 'manual'): void {
        this.blacklist.add(domain);
        this.addToPluginBlacklist(domain, `手动添加: ${reason}`);
        this.saveToCache(); // 更新缓存
    }
    
    /**
     * 从黑名单中移除域名
     * @param domain - 域名
     */
    removeFromBlacklist(domain: string): void {
        this.blacklist.delete(domain);
        
        // 从插件设置中移除
        try {
            if (this.plugin?.settings?.remoteImageBlacklist) {
                const blacklist = this.plugin.settings.remoteImageBlacklist;
                const index = blacklist.indexOf(domain);
                if (index > -1) {
                    blacklist.splice(index, 1);
                    this.plugin.saveSettings?.();
                }
            }
        } catch (error) {
            // 静默处理插件设置保存失败
        }
        
        this.saveToCache(); // 更新缓存
    }
    
    /**
     * 智能内存管理：自动归档旧记录
     */
    private autoArchiveOldRecords(): void {
        const now = Date.now();
        const archiveCutoffTime = now - this.config.archiveExpiry;
        const memoryCutoffTime = now - (24 * 60 * 60 * 1000); // 24小时前
        
        // 归档非常旧的记录
        for (const [domain, stats] of this.domainStats.entries()) {
            if (stats.lastFailure < archiveCutoffTime && stats.failures < 2) {
                this.archivedRecords.set(domain, {
                    domain,
                    stats: { ...stats },
                    archiveTime: now
                });
                this.domainStats.delete(domain);
            }
        }
        
        // 当内存记录过多时，归档较旧的记录
        if (this.domainStats.size > this.config.maxMemorySize) {
            const sortedDomains = Array.from(this.domainStats.entries())
                .sort(([,a], [,b]) => (a.lastFailure || 0) - (b.lastFailure || 0));
            
            const domainsToArchive = sortedDomains
                .filter(([,stats]) => stats.lastFailure < memoryCutoffTime)
                .slice(0, Math.max(10, this.domainStats.size - this.config.maxMemorySize));
            
            for (const [domain, stats] of domainsToArchive) {
                this.archivedRecords.set(domain, {
                    domain,
                    stats: { ...stats },
                    archiveTime: now
                });
                this.domainStats.delete(domain);
            }
        }
        
        // 清理过期归档记录
        for (const [domain, record] of this.archivedRecords.entries()) {
            if (record.archiveTime < archiveCutoffTime) {
                this.archivedRecords.delete(domain);
            }
        }
        
        if (this.archivedRecords.size > 0) {
            console.log(`[BlacklistManager] 归档管理: ${this.domainStats.size} 活跃记录, ${this.archivedRecords.size} 归档记录`);
        }
    }
    
    /**
     * 清理过期记录
     */
    private cleanupOldRecords(): void {
        const now = Date.now();
        const cutoffTime = now - this.config.timeWindow;
        
        // 清理统计记录
        for (const [domain, stats] of this.domainStats.entries()) {
            if (stats.lastFailure < cutoffTime && stats.failures < this.config.maxFailures) {
                this.domainStats.delete(domain);
            }
        }
        
        // 容量无限：不限制黑名单大小
        // 但会定期清理归档记录
        this.autoArchiveOldRecords();
    }
    
    /**
     * 提取域名
     * @param url - URL
     * @returns 域名
     */
    private extractDomain(url: string): string | null {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * 分类错误类型
     * @param error - 错误信息
     * @returns 错误类型
     */
    private classifyError(error: string): string {
        const errorLower = error.toLowerCase();
        
        // 优先处理连接关闭错误
        if (errorLower.includes('err_connection_closed') ||
            errorLower.includes('connection_closed') ||
            errorLower.includes('net::err_connection_closed')) {
            console.log(`[BlacklistManager] 检测到连接关闭错误: ${error}`);
            return 'connection_error';
        }
        
        if (errorLower.includes('econnrefused') ||
            errorLower.includes('econnreset') ||
            errorLower.includes('net::err_') ||
            errorLower.includes('network_error') ||
            errorLower.includes('fetch failed') ||
            errorLower.includes('failed to fetch')) {
            return 'connection_error';
        }
        
        if (errorLower.includes('err_name_not_resolved') ||
            errorLower.includes('enotfound') ||
            errorLower.includes('getaddrinfo') ||
            errorLower.includes('dns') ||
            errorLower.includes('host not found') ||
            errorLower.includes('name resolution')) {
            return 'dns_error';
        }
        
        if (errorLower.includes('404') ||
            errorLower.includes('403') ||
            errorLower.includes('401') ||
            errorLower.includes('http') ||
            errorLower.includes('status code') ||
            errorLower.includes('response status')) {
            return 'http_error';
        }
        
        if (errorLower.includes('timeout') ||
            errorLower.includes('timed out') ||
            errorLower.includes('operation timed out')) {
            return 'timeout_error';
        }
        
        return 'unknown_error';
    }
    
    /**
     * 获取黑名单统计信息
     * @returns 统计信息
     */
    getStats() {
        return {
            totalBlacklisted: this.blacklist.size,
            totalMonitored: this.domainStats.size,
            domainStats: Array.from(this.domainStats.entries()).map(([domain, stats]) => ({
                domain,
                failures: stats.failures,
                successes: stats.successes,
                failureRate: (stats.failures / (stats.failures + stats.successes)) || 0,
                lastFailure: new Date(stats.lastFailure),
                errorTypes: Array.from(stats.errorTypes)
            }))
        };
    }
    
    /**
     * 获取黑名单域名列表
     * @returns 黑名单域名数组
     */
    getBlacklist(): string[] {
        return Array.from(this.blacklist);
    }
    
    /**
     * 清空所有记录
     */
    clearAll(): void {
        this.domainStats.clear();
        this.blacklist.clear();
        
        // 清空插件设置中的黑名单
        try {
            if (this.plugin?.settings?.remoteImageBlacklist) {
                this.plugin.settings.remoteImageBlacklist = [];
                this.plugin.saveSettings?.();
            }
        } catch (error) {
            // 静默处理插件设置保存失败
        }
        
        // 清空本地缓存
        this.saveToCache();
    }
    
    /**
     * 强制刷新缓存（从插件设置重新加载）
     */
    async refreshCache(): Promise<void> {
        console.log('[BlacklistManager] Refreshing cache from plugin settings');
        this.isInitialized = false;
        await this.initializeCache();
    }
    
    /**
     * 手动保存缓存（用于插件设置保存后同步）
     */
    saveCache(): void {
        this.saveToCache();
    }
}