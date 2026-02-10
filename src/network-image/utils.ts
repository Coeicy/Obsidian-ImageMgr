/**
 * 工具函数模块
 * 
 * @file 提供哈希计算、图片验证、错误处理等通用工具函数
 * @module utils
 */

import { ValidationResult, RetryOptions } from './types';
import { retryOperation } from '../utils/retry-utils';

/**
 * 计算字符串的 SHA-256 哈希值
 * @param str - 要哈希的字符串
 * @returns SHA-256 哈希值（十六进制字符串）
 * @throws 如果浏览器不支持 Web Crypto API 则抛出错误
 */
export async function hashString(str: string): Promise<string> {
    try {
        // 检查浏览器是否支持 Web Crypto API
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('Web Crypto API is not supported in this environment');
        }
        
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return hashHex;
    } catch (error) {
        console.error('Failed to hash string:', error);
        throw new Error(`Hash calculation failed: ${(error as Error).message}`);
    }
}

/**
 * 计算 URL 的 SHA-256 哈希值
 * @param url - 要哈希的 URL
 * @returns URL 的 SHA-256 哈希值
 */
export async function hashUrl(url: string): Promise<string> {
    return hashString(url);
}

/**
 * 从 URL 推导展示用文件名（与 ImageInfo.name 推导方式一致）
 * @param url - 图片 URL
 * @returns 用于组合哈希的 displayName
 */
export function extractNameFromUrl(url: string): string {
    let name = url.split('/').pop() || 'unknown';
    if (name.includes('?')) name = name.split('?')[0];
    if (name.includes('#')) name = name.split('#')[0];
    return name.trim() || 'unknown';
}

/**
 * 云端图片稳定 ID：SHA-256(displayName + "|" + url)
 * 仅改链接或仅改文件名时可承接旧记录；同时改两者则为新图片。
 * @param displayName - 展示名（与 ImageInfo.name 一致）
 * @param url - 图片 URL
 * @returns 用于缓存主键与操作记录的稳定哈希
 */
export async function hashNetworkImageId(displayName: string, url: string): Promise<string> {
    const name = (displayName || '').trim() || extractNameFromUrl(url);
    const combined = `${name}|${url}`;
    return hashString(combined);
}

/**
 * 计算文件内容的 SHA-256 哈希值
 * @param content - 文件内容字符串
 * @returns 文件内容的 SHA-256 哈希值
 */
export async function hashContent(content: string): Promise<string> {
    return hashString(content);
}

/**
 * 验证图片 URL 的有效性
 * @param url - 要验证的图片 URL
 * @param timeout - 超时时间（毫秒），默认为 10000ms
 * @returns 验证结果
 */
export async function validateImage(
    url: string, 
    timeout: number = 10000
): Promise<ValidationResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        // 检查 URL 是否有效
        if (!url || !isValidUrl(url)) {
            return {
                status: 'error',
                imageId: await hashUrl(url),
                error: 'Invalid URL format',
                isValid: false
            };
        }
        
        // 使用 HEAD 请求验证图片（更快，不需要下载内容）
        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            mode: 'cors',
            cache: 'no-cache'
        });
        
        clearTimeout(timeoutId);
        
        // 检查响应状态
        if (!response.ok) {
            return {
                status: 'error',
                imageId: await hashUrl(url),
                statusCode: response.status,
                error: `HTTP ${response.status}: ${response.statusText}`,
                isValid: false
            };
        }
        
        // 检查内容类型是否为图片
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            return {
                status: 'error',
                imageId: await hashUrl(url),
                statusCode: response.status,
                contentType,
                error: `Invalid content type: ${contentType}`,
                isValid: false
            };
        }
        
        // 获取内容长度
        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
        
        return {
            status: 'success',
            imageId: await hashUrl(url),
            statusCode: response.status,
            contentType,
            contentLength,
            isValid: true
        };
        
    } catch (error: any) {
        clearTimeout(timeoutId);
        
        let errorMessage = error.message || 'Unknown error';
        let statusCode = 0;
        let errorType: 'timeout' | '404' | '403' | 'network_error' | 'invalid_content' = 'network_error';
        
        // 处理特定错误类型
        if (error.name === 'AbortError') {
            errorMessage = `Request timeout after ${timeout}ms`;
            errorType = 'timeout';
        } else if (error.name === 'TypeError' && errorMessage.includes('fetch')) {
            errorMessage = 'Network error: Unable to fetch the image';
            errorType = 'network_error';
        } else if (error.name === 'SecurityError') {
            errorMessage = 'CORS error: Cross-origin request blocked';
            errorType = 'network_error';
        } else if (errorMessage.includes('ERR_NAME_NOT_RESOLVED') || errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
            // DNS 解析失败或网络错误
            errorMessage = errorMessage.includes('ERR_NAME_NOT_RESOLVED') 
                ? 'DNS resolution failed (ERR_NAME_NOT_RESOLVED)'
                : errorMessage;
            errorType = 'network_error';
        }
        
        console.warn(`Failed to validate image ${url}:`, errorMessage);
        
        return {
            status: 'error',
            imageId: await hashUrl(url),
            statusCode,
            error: errorMessage,
            isValid: false,
            errorType // 添加错误类型，用于黑名单分类
        };
    }
}

/**
 * 批量验证图片 URL
 * @param urls - 要验证的图片 URL 数组
 * @param batchSize - 每批处理的数量
 * @param timeout - 超时时间（毫秒）
 * @returns 验证结果数组
 */
export async function batchValidateImages(
    urls: string[],
    batchSize: number = 20,
    timeout: number = 10000
): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    
    // 过滤无效的 URL
    const validUrls = urls.filter(url => url && isValidUrl(url));
    const invalidUrls = urls.filter(url => !url || !isValidUrl(url));
    
    // 为无效的 URL 生成错误结果
    for (const url of invalidUrls) {
        results.push({
            status: 'error',
            imageId: await hashUrl(url || ''),
            error: 'Invalid URL format',
            isValid: false
        });
    }
    
    // 分批处理有效的 URL
    for (let i = 0; i < validUrls.length; i += batchSize) {
        const batch = validUrls.slice(i, i + batchSize);
        
        // 并行验证一批图片
        const batchResults = await Promise.allSettled(
            batch.map(url => validateImage(url, timeout))
        );
        
        // 处理结果
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                // 处理验证过程中的异常
                results.push({
                    status: 'error',
                    imageId: '',
                    error: result.reason?.message || 'Validation failed',
                    isValid: false
                });
            }
        }
        
        // 让出控制权，避免阻塞 UI 线程
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    return results;
}

/**
 * 检查 URL 是否有效
 * @param url - 要检查的 URL
 * @returns 是否有效
 */
export function isValidUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
        return false;
    }
    
    try {
        // 尝试创建 URL 对象
        const urlObj = new URL(url);
        
        // 检查协议是否为 http 或 https
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * 检查错误是否可重试
 * @param error - 错误对象
 * @returns 是否可重试
 */
export function isRetryableError(error: Error): boolean {
    if (!error || !error.message) {
        return false;
    }
    
    const message = error.message.toLowerCase();
    const nonRetryablePatterns = [
        'validation',
        'invalid',
        'parse',
        'syntax',
        'not found',
        '404',
        '403',
        'unauthorized',
        'forbidden'
    ];
    
    // 如果错误消息包含不可重试的模式，则返回 false
    const hasNonRetryablePattern = nonRetryablePatterns.some(pattern => 
        message.includes(pattern)
    );
    
    if (hasNonRetryablePattern) {
        return false;
    }
    
    // 网络错误、超时错误、协议错误通常可以重试
    const retryablePatterns = [
        'network',
        'timeout',
        'econnreset',
        'econnrefused',
        'fetch failed',
        'blocked',
        'http2',
        'protocol',
        'cors',
        'ssl',
        'tls'
    ];
    
    return retryablePatterns.some(pattern => message.includes(pattern));
}



/**
 * 格式化文件大小为可读字符串
 * @param bytes - 字节数
 * @returns 格式化后的字符串
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 格式化耗时为可读字符串
 * @param ms - 毫秒数
 * @returns 格式化后的字符串
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    } else if (ms < 60000) {
        return `${(ms / 1000).toFixed(2)}s`;
    } else {
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(0);
        return `${minutes}m ${seconds}s`;
    }
}

/**
 * 节流函数，限制函数的执行频率
 * @param func - 要节流的函数
 * @param wait - 等待时间（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    let previous = 0;
    
    return function executedFunction(...args: Parameters<T>) {
        const now = Date.now();
        const remaining = wait - (now - previous);
        
        if (remaining <= 0 || remaining > wait) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            previous = now;
            func(...args);
        } else if (!timeout) {
            timeout = setTimeout(() => {
                previous = Date.now();
                timeout = null;
                func(...args);
            }, remaining);
        }
    };
}

/**
 * 防抖函数，延迟执行函数直到停止调用一段时间后
 * @param func - 要防抖的函数
 * @param wait - 等待时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    
    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            timeout = null;
            func(...args);
        };
        
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(later, wait);
    };
}

/**
 * 默认重试选项
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
};

export default {
    hashString,
    hashUrl,
    hashContent,
    validateImage,
    batchValidateImages,
    isValidUrl,
    isRetryableError,
    retryOperation,
    formatFileSize,
    formatDuration,
    throttle,
    debounce,
    DEFAULT_RETRY_OPTIONS
};