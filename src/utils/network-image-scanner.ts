
import { App, TFile } from 'obsidian';
import { NetworkImageReference } from '../network-image/types';

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

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // 1. Markdown 格式: ![alt](http://...)
                const mdRegex = /!\[(.*?)\]\(\s*(https?:\/\/[^)]+)\s*\)/g;
                let match;
                while ((match = mdRegex.exec(line)) !== null) {
                    let url = match[2];
                    if (url.includes(' ')) {
                        url = url.split(/\s+/)[0];
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
}
