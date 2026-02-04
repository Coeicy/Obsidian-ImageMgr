
import { App, TFile } from 'obsidian';
import { NetworkImageReference } from '../network-image/types';
import { WindowWithImageMgrPlugin } from '../types';

// 保持向后兼容的接口
export interface LegacyNetworkImageReference {
    url: string;
    sourceFile: TFile;
    line: number;
    originalText: string;
    index: number;
    length: number;
}

export class NetworkImageScanner {
    private logger?: (message: string, error?: any) => void;
    
    // 需要忽略的域名列表（代码块中的示例域名）
    private readonly ignoredDomains = new Set([
        'static.runoob.com',
        'example.com',
        'placeholder.com',
        'localhost',
        '127.0.0.1'
    ]);
    
    // 自动检测失败域名统计
    private failedDomains = new Map<string, { failures: number; lastFailure: number }>();
    private readonly maxFailureCount = 3; // 超过此次数自动添加到黑名单
    private readonly failureTimeWindow = 24 * 60 * 60 * 1000; // 24小时内的失败统计

    constructor(private app: App, logger?: (message: string, error?: any) => void) {
        this.logger = logger;
    }

    /**
     * 扫描单个文件中的网络图片引用（符合 NetworkImageScannerInterface）
     * @param filePath 文件路径
     */
    async scan(filePath: string): Promise<NetworkImageReference[]> {
        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) {
                return [];
            }

            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const results: NetworkImageReference[] = [];

            // 检测代码块状态
            let inCodeBlock = false;
            let codeBlockMarker = '';

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();

                // 检查代码块开始/结束标记
                if (trimmed.startsWith('```')) {
                    const marker = trimmed.match(/^`{3,}/)?.[0] || '';
                    if (marker.length >= 3) {
                        if (!inCodeBlock) {
                            // 开始代码块
                            inCodeBlock = true;
                            codeBlockMarker = marker;
                        } else if (marker === codeBlockMarker) {
                            // 结束代码块
                            inCodeBlock = false;
                            codeBlockMarker = '';
                        }
                    }
                } else if (trimmed.startsWith('~~~')) {
                    const marker = trimmed.match(/^~{3,}/)?.[0] || '';
                    if (marker.length >= 3) {
                        if (!inCodeBlock) {
                            // 开始代码块
                            inCodeBlock = true;
                            codeBlockMarker = marker;
                        } else if (marker === codeBlockMarker) {
                            // 结束代码块
                            inCodeBlock = false;
                            codeBlockMarker = '';
                        }
                    }
                } else if (trimmed.startsWith('<!--') && trimmed.includes('code')) {
                    // 检查 HTML 注释中的代码块标记
                    if (trimmed.includes('code') && !trimmed.includes('end')) {
                        inCodeBlock = true;
                    } else if (trimmed.includes('end') && trimmed.includes('code')) {
                        inCodeBlock = false;
                    }
                }

                // 跳过代码块内的内容
                if (inCodeBlock) continue;
                
                // 检查是否为内联代码块（反引号包围的内容）
                const inlineCodeRegex = /`[^`]+`/g;
                let inlineCodeMatch;
                const inlineCodeSpans: [number, number][] = [];
                
                while ((inlineCodeMatch = inlineCodeRegex.exec(line)) !== null) {
                    inlineCodeSpans.push([inlineCodeMatch.index, inlineCodeMatch.index + inlineCodeMatch[0].length]);
                }
                
                // 1. Markdown 格式: ![alt](http://...)
                const mdRegex = /!\[(.*?)\]\(\s*(https?:\/\/[^)]+)\s*\)/g;
                let match: RegExpExecArray | null;
                while ((match = mdRegex.exec(line)) !== null) {
                    // 检查是否在内联代码块内
                    const isInInlineCode = inlineCodeSpans.some(([start, end]) =>
                        match!.index >= start && match!.index <= end
                    );
                    
                    if (isInInlineCode) continue;
                    
                    let url = match[2];
                    if (url.includes(' ')) {
                        url = url.split(/\s+/)[0];
                    }

                    // 检查是否在忽略的域名列表中
                    if (this.isIgnoredDomain(url)) {
                        continue;
                    }

                    if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
                        results.push({
                            url: url,
                            line: i,
                            index: match.index,
                            originalText: match[0]
                        });
                    }
                }

                // 2. HTML 格式: <img src="http://...">
                const htmlRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/g;
                while ((match = htmlRegex.exec(line)) !== null) {
                    // 检查是否在内联代码块内
                    const isInInlineCode = inlineCodeSpans.some(([start, end]) =>
                        match!.index >= start && match!.index <= end
                    );
                    
                    if (isInInlineCode) continue;
                    
                    // 检查是否在忽略的域名列表中
                    if (this.isIgnoredDomain(match[1])) {
                        continue;
                    }
                    
                    if (!match[1].includes('localhost') && !match[1].includes('127.0.0.1')) {
                        results.push({
                            url: match[1],
                            line: i,
                            index: match.index,
                            originalText: match[0]
                        });
                    }
                }
            }
            
            return results;
        } catch (error) {
            if (this.logger) {
                this.logger(`Failed to scan file ${filePath}:`, error);
            } else {
                console.error(`Failed to scan file ${filePath}:`, error);
            }
            return [];
        }
    }

    /**
     * 扫描指定路径下的所有 Markdown 文件中的网络图片引用
     * @param path 可选，扫描的文件夹路径
     * @deprecated 使用 scan(filePath) 配合缓存系统
     */
    async scanAll(path?: string): Promise<LegacyNetworkImageReference[]> {
        const files = this.app.vault.getMarkdownFiles();
        const results: LegacyNetworkImageReference[] = [];
        
        // 过滤文件
        const targetFiles = path 
            ? files.filter(f => f.path.startsWith(path))
            : files;

        for (const file of targetFiles) {
            try {
                // 使用新的 scan 方法
                const networkImages = await this.scan(file.path);
                
                // 转换为旧版格式
                for (const img of networkImages) {
                    results.push({
                        url: img.url,
                        sourceFile: file,
                        line: img.line,
                        originalText: img.originalText,
                        index: img.index,
                        length: img.originalText.length
                    });
                }
            } catch (error) {
                if (this.logger) {
                    this.logger(`Failed to scan file ${file.path}:`, error);
                } else {
                    console.error(`Failed to scan file ${file.path}:`, error);
                }
            }
        }
        return results;
    }
    
    /**
     * 检查 URL 是否在忽略的域名列表中
     * @param url - 要检查的 URL
     * @returns 是否应该忽略此 URL
     */
    private isIgnoredDomain(url: string): boolean {
        try {
            const urlObj = new URL(url);
            return this.ignoredDomains.has(urlObj.hostname);
        } catch (error) {
            // URL 解析失败，返回 false
            return false;
        }
    }
    
    /**
     * 记录域名失败次数
     * @param url - 失败的 URL
     * @param error - 错误信息
     */
    private recordDomainFailure(url: string, error: string): void {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            const now = Date.now();
            
            // 清理过期的失败记录
            this.cleanupOldFailures(now);
            
            // 更新失败统计
            const stats = this.failedDomains.get(domain) || { failures: 0, lastFailure: 0 };
            stats.failures++;
            stats.lastFailure = now;
            this.failedDomains.set(domain, stats);
            
            // 检查是否需要自动添加到黑名单
            if (stats.failures >= this.maxFailureCount) {
                this.autoAddToBlacklist(domain, error);
            }
            
            if (this.logger) {
                this.logger(`域名失败统计: ${domain} - 失败次数: ${stats.failures}`, { error });
            }
        } catch (error) {
            // 静默处理 URL 解析错误
        }
    }
    
    /**
     * 清理过期的失败记录
     * @param now - 当前时间戳
     */
    private cleanupOldFailures(now: number): void {
        for (const [domain, stats] of this.failedDomains.entries()) {
            if (now - stats.lastFailure > this.failureTimeWindow) {
                this.failedDomains.delete(domain);
            }
        }
    }
    
    /**
     * 自动添加域名到黑名单
     * @param domain - 要添加的域名
     * @param error - 错误信息
     */
    private async autoAddToBlacklist(domain: string, error: string): Promise<void> {
        try {
            // 添加到忽略域名列表
            this.ignoredDomains.add(domain);

            // 优先使用新的黑名单管理器（带本地缓存）
            const windowWithPlugin = window as WindowWithImageMgrPlugin;
            if (windowWithPlugin.ImageMgrPlugin && windowWithPlugin.ImageMgrPlugin.blacklistManager) {
                const plugin = windowWithPlugin.ImageMgrPlugin;
                await plugin.blacklistManager?.addToBlacklist(domain, 'connection_error');
                console.log(`[NetworkImageScanner] 域名已添加到黑名单（带缓存）: ${domain}`);
            }
            // 兼容旧方式：添加到插件的黑名单设置
            else if (windowWithPlugin.ImageMgrPlugin) {
                const plugin = windowWithPlugin.ImageMgrPlugin;
                if (plugin.settings && plugin.settings.remoteImageBlacklist) {
                    const blacklist = plugin.settings.remoteImageBlacklist;
                    if (!blacklist.includes(domain)) {
                        blacklist.push(domain);
                        if (plugin.saveSettings) {
                            await plugin.saveSettings();
                        }
                        console.log(`[NetworkImageScanner] 域名已添加到黑名单（旧方式）: ${domain}`);
                    }
                }
            }

            if (this.logger) {
                this.logger(`自动添加域名到黑名单: ${domain}`, {
                    reason: `连续失败超过 ${this.maxFailureCount} 次`,
                    error
                });
            }
        } catch (error) {
            // 静默处理黑名单添加失败
        }
    }
    
    /**
     * 验证网络图片链接（带错误检测）
     * @param url - 要验证的 URL
     * @returns 验证结果
     */
    async validateImageUrl(url: string): Promise<{ valid: boolean; error?: string }> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                mode: 'cors',
                cache: 'no-cache'
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const error = `HTTP ${response.status}: ${response.statusText}`;
                this.recordDomainFailure(url, error);
                return { valid: false, error };
            }
            
            return { valid: true };
            
        } catch (error: any) {
            const errorMsg = error?.message || String(error);
            this.recordDomainFailure(url, errorMsg);
            
            // 检查是否为连接错误
            const isConnectionError = errorMsg.includes('ERR_CONNECTION_CLOSED') ||
                                     errorMsg.includes('ECONNREFUSED') ||
                                     errorMsg.includes('ECONNRESET') ||
                                     errorMsg.includes('net::ERR_');
            
            return { 
                valid: false, 
                error: isConnectionError ? '网络连接失败' : errorMsg 
            };
        }
    }
    
    /**
     * 获取失败域名统计
     * @returns 失败域名统计信息
     */
    getFailedDomainStats(): Array<{ domain: string; failures: number; lastFailure: Date }> {
        const now = Date.now();
        this.cleanupOldFailures(now);
        
        return Array.from(this.failedDomains.entries()).map(([domain, stats]) => ({
            domain,
            failures: stats.failures,
            lastFailure: new Date(stats.lastFailure)
        }));
    }
}
