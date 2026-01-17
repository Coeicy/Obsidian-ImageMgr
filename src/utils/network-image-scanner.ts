
import { App, TFile } from 'obsidian';

export interface NetworkImageReference {
    url: string;
    sourceFile: TFile;
    line: number;
    originalText: string; // 原始链接文本，如 "![alt](http://...)"
    index: number;
    length: number;
}

export class NetworkImageScanner {
    private logger?: (message: string, error?: any) => void;

    constructor(private app: App, logger?: (message: string, error?: any) => void) {
        this.logger = logger;
    }

    /**
     * 扫描指定路径下的所有 Markdown 文件中的网络图片引用
     * @param path 可选，扫描的文件夹路径
     */
    async scan(path?: string): Promise<NetworkImageReference[]> {
        const files = this.app.vault.getMarkdownFiles();
        const results: NetworkImageReference[] = [];
        
        // 过滤文件
        const targetFiles = path 
            ? files.filter(f => f.path.startsWith(path))
            : files;

        for (const file of targetFiles) {
            try {
                const content = await this.app.vault.read(file);
                const lines = content.split('\n');

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    
                    // 1. Markdown 格式: ![alt](http://...)
                    // 使用正则提取 URL
                    // 允许 URL 前后有空格: ![alt](  http://...  )
                    const mdRegex = /!\[(.*?)\]\(\s*(https?:\/\/[^)]+)\s*\)/g;
                    let match;
                    while ((match = mdRegex.exec(line)) !== null) {
                        // 清理 URL，去除可能的标题部分 (例如: "http://example.com/img.png 'Title'")
                        let url = match[2];
                        if (url.includes(' ')) {
                            url = url.split(/\s+/)[0];
                        }

                        // 排除本地 localhost (可选)
                        if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
                            results.push({
                                url: url,
                                sourceFile: file,
                                line: i,
                                originalText: match[0],
                                index: match.index,
                                length: match[0].length
                            });
                        }
                    }

                    // 2. HTML 格式: <img src="http://...">
                    const htmlRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/g;
                    while ((match = htmlRegex.exec(line)) !== null) {
                        if (!match[1].includes('localhost') && !match[1].includes('127.0.0.1')) {
                            results.push({
                                url: match[1],
                                sourceFile: file,
                                line: i,
                                originalText: match[0],
                                index: match.index,
                                length: match[0].length
                            });
                        }
                    }
                }
            } catch (error) {
                if (this.logger) {
                    this.logger(`Failed to scan file ${file.path}:`, error);
                } else {
                    // 兜底：如果没有 logger，使用 console（开发时有用）
                    console.error(`Failed to scan file ${file.path}:`, error);
                }
            }
        }
        return results;
    }
}
