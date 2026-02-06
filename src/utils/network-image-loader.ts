/**
 * 网络图片加载优化器
 * 
 * 专门处理网络图片加载错误，特别是HTTP2协议错误
 * 提供重试机制、备用方案和错误处理
 */

export interface NetworkImageLoadOptions {
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
    useProxy?: boolean;
    proxyUrl?: string;
}

export interface NetworkImageLoadResult {
    success: boolean;
    image?: HTMLImageElement;
    error?: string;
    retryCount?: number;
    usedFallback?: boolean;
}

export class NetworkImageLoader {
    private static readonly DEFAULT_OPTIONS: Required<NetworkImageLoadOptions> = {
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 10000,
        useProxy: true,
        proxyUrl: 'https://wsrv.nl/?url='
    };

    /**
     * 加载网络图片，具有重试和备用方案
     */
    static async loadImage(
        url: string, 
        options: NetworkImageLoadOptions = {}
    ): Promise<NetworkImageLoadResult> {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        
        // 尝试直接加载
        let result = await this.tryDirectLoad(url, opts);
        
        if (result.success) {
            return result;
        }

        // 如果失败且允许使用代理，尝试代理加载
        if (opts.useProxy) {
            result = await this.tryProxyLoad(url, opts);
            if (result.success) {
                result.usedFallback = true;
                return result;
            }
        }

        return result;
    }

    /**
     * 直接加载图片
     */
    private static async tryDirectLoad(
        url: string, 
        opts: Required<NetworkImageLoadOptions>
    ): Promise<NetworkImageLoadResult> {
        for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
            try {
                const image = await this.loadImageWithTimeout(url, opts.timeout);
                return {
                    success: true,
                    image,
                    retryCount: attempt
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                // 如果是不可重试的错误，直接返回
                if (!this.isRetryableError(errorMessage)) {
                    return {
                        success: false,
                        error: errorMessage,
                        retryCount: attempt
                    };
                }

                // 最后一次尝试失败
                if (attempt === opts.maxRetries) {
                    return {
                        success: false,
                        error: errorMessage,
                        retryCount: attempt
                    };
                }

                // 等待后重试
                await this.delay(opts.retryDelay * Math.pow(2, attempt));
            }
        }

        return {
            success: false,
            error: 'Maximum retry attempts exceeded'
        };
    }

    /**
     * 通过代理加载图片
     */
    private static async tryProxyLoad(
        url: string, 
        opts: Required<NetworkImageLoadOptions>
    ): Promise<NetworkImageLoadResult> {
        try {
            const proxyUrl = opts.proxyUrl + encodeURIComponent(url);
            const image = await this.loadImageWithTimeout(proxyUrl, opts.timeout);
            
            return {
                success: true,
                image
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 带超时的图片加载
     */
    private static loadImageWithTimeout(url: string, timeout: number): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            let timer: NodeJS.Timeout;

            img.onload = () => {
                clearTimeout(timer);
                resolve(img);
            };

            img.onerror = (error) => {
                clearTimeout(timer);
                reject(new Error(`Failed to load image: ${error.toString()}`));
            };

            timer = setTimeout(() => {
                img.onload = null;
                img.onerror = null;
                reject(new Error(`Image load timeout after ${timeout}ms`));
            }, timeout);

            img.src = url;
        });
    }

    /**
     * 检查错误是否可重试
     */
    private static isRetryableError(errorMessage: string): boolean {
        const retryablePatterns = [
            'network',
            'timeout',
            'http2',
            'protocol',
            'cors',
            'ssl',
            'tls',
            'fetch',
            'connection',
            'reset',
            'refused'
        ];

        const nonRetryablePatterns = [
            '404',
            'not found',
            '403',
            'forbidden',
            '401',
            'unauthorized',
            'invalid',
            'parse',
            'syntax'
        ];

        const message = errorMessage.toLowerCase();

        // 如果是不可重试的错误
        if (nonRetryablePatterns.some(pattern => message.includes(pattern))) {
            return false;
        }

        // 如果是可重试的错误
        return retryablePatterns.some(pattern => message.includes(pattern));
    }

    /**
     * HTTP2协议错误专用处理
     */
    static isHTTP2ProtocolError(error: Error | string): boolean {
        const message = error instanceof Error ? error.message : error;
        return message.toLowerCase().includes('http2') && message.toLowerCase().includes('protocol');
    }

    /**
     * 获取HTTP2协议错误的建议解决方案
     */
    static getHTTP2ProtocolErrorSuggestions(): string[] {
        return [
            '服务器可能暂时不可用，请稍后重试',
            '尝试使用代理服务器加载图片',
            '检查网络连接是否稳定',
            '可能是服务器端HTTP2协议配置问题',
            '尝试刷新页面或重启应用'
        ];
    }

    /**
     * 延迟函数
     */
    private static delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 批量验证图片URL的可用性
     */
    static async validateUrls(urls: string[], options?: NetworkImageLoadOptions): Promise<{
        url: string;
        valid: boolean;
        error?: string;
    }[]> {
        const results = await Promise.all(
            urls.map(async (url) => {
                try {
                    const result = await this.loadImage(url, { ...options, maxRetries: 1 });
                    return {
                        url,
                        valid: result.success,
                        error: result.error
                    };
                } catch (error) {
                    return {
                        url,
                        valid: false,
                        error: error instanceof Error ? error.message : String(error)
                    };
                }
            })
        );

        return results;
    }
}