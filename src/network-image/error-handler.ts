/**
 * 错误处理模块
 * 
 * @file 实现错误分类、错误日志和重试机制
 * @module error-handler
 */

import { ScanError, ScanErrorType, ErrorContext, RetryOptions } from './types';
import { retryOperation as genericRetryOperation, GenericErrorHandler } from '../utils/retry-utils';

/**
 * 扫描错误处理器
 * 提供错误分类、错误日志和错误报告功能
 */
export class ScanErrorHandler {
    private errorLog: ScanError[] = [];
    private readonly maxErrorLogSize: number;
    private readonly enableLogging: boolean;
    
    /**
     * 创建错误处理器实例
     * @param maxErrorLogSize - 错误日志最大大小（默认 100）
     * @param enableLogging - 是否启用控制台日志（默认 true）
     */
    constructor(maxErrorLogSize: number = 100, enableLogging: boolean = true) {
        this.maxErrorLogSize = maxErrorLogSize;
        this.enableLogging = enableLogging;
    }
    
    /**
     * 处理错误
     * @param error - 错误对象
     * @param context - 错误上下文
     * @returns 扫描错误对象
     */
    handleError(error: Error, context: ErrorContext): ScanError {
        const scanError: ScanError = {
            type: this.classifyError(error),
            message: error.message || 'Unknown error',
            file: context.file,
            url: context.url,
            stack: error.stack,
            retryable: this.isRetryable(error)
        };
        
        // 记录错误到日志
        this.logError(scanError);
        
        // 控制台日志
        if (this.enableLogging) {
            this.logToConsole(scanError);
        }
        
        return scanError;
    }
    
    /**
     * 分类错误类型
     * @param error - 错误对象
     * @returns 错误类型
     */
    private classifyError(error: Error): ScanErrorType {
        if (!error) {
            return ScanErrorType.UNKNOWN_ERROR;
        }
        
        const message = error.message?.toLowerCase() || '';
        const name = error.name?.toLowerCase() || '';
        
        // 网络错误
        if (
            name.includes('network') ||
            message.includes('network') ||
            message.includes('failed to fetch') ||
            message.includes('econnreset') ||
            message.includes('econnrefused') ||
            message.includes('dns') ||
            message.includes('internet') ||
            message.includes('http2') ||
            message.includes('protocol') ||
            message.includes('ssl') ||
            message.includes('tls')
        ) {
            return ScanErrorType.NETWORK_ERROR;
        }
        
        // 超时错误
        if (
            name.includes('timeout') ||
            message.includes('timeout') ||
            message.includes('timed out') ||
            message.includes('abort')
        ) {
            return ScanErrorType.TIMEOUT_ERROR;
        }
        
        // 验证错误
        if (
            message.includes('validation') ||
            message.includes('invalid') ||
            message.includes('not found') ||
            message.includes('404') ||
            message.includes('403') ||
            message.includes('401') ||
            message.includes('forbidden') ||
            message.includes('unauthorized')
        ) {
            return ScanErrorType.VALIDATION_ERROR;
        }
        
        // 数据库错误
        if (
            name.includes('database') ||
            message.includes('database') ||
            message.includes('indexeddb') ||
            message.includes('transaction')
        ) {
            return ScanErrorType.DATABASE_ERROR;
        }
        
        // 文件读取错误
        if (
            name.includes('filereader') ||
            message.includes('file') ||
            message.includes('read') ||
            message.includes('eacces') ||
            message.includes('eperm')
        ) {
            return ScanErrorType.FILE_READ_ERROR;
        }
        
        return ScanErrorType.UNKNOWN_ERROR;
    }
    
    /**
     * 检查错误是否可重试
     * @param error - 错误对象
     * @returns 是否可重试
     */
    private isRetryable(error: Error): boolean {
        return isRetryableError(error);
    }
    
    /**
     * 记录错误到日志
     * @param error - 扫描错误对象
     */
    private logError(error: ScanError): void {
        // 添加到日志开头（最新的在前）
        this.errorLog.unshift(error);
        
        // 限制日志大小
        if (this.errorLog.length > this.maxErrorLogSize) {
            this.errorLog = this.errorLog.slice(0, this.maxErrorLogSize);
        }
    }
    
    /**
     * 输出错误到控制台
     * @param error - 扫描错误对象
     */
    private logToConsole(error: ScanError): void {
        const context = [];
        if (error.file) context.push(`file: ${error.file}`);
        if (error.url) context.push(`url: ${error.url}`);
        
        const contextStr = context.length > 0 ? ` [${context.join(', ')}]` : '';
        const retryStr = error.retryable ? ' (retryable)' : '';
        
        console.error(`[ScanError] ${error.type}${contextStr}${retryStr}: ${error.message}`);
        
        // 对于可重试的错误，使用 warn 级别
        if (error.retryable) {
            console.warn(`[ScanError] This error is retryable: ${error.message}`);
        }
    }
    
    /**
     * 获取错误日志
     * @returns 错误日志副本
     */
    getErrorLog(): ScanError[] {
        return [...this.errorLog];
    }
    
    /**
     * 获取特定类型的错误
     * @param type - 错误类型
     * @returns 该类型的错误列表
     */
    getErrorsByType(type: ScanErrorType): ScanError[] {
        return this.errorLog.filter(error => error.type === type);
    }
    
    /**
     * 获取可重试的错误
     * @returns 可重试的错误列表
     */
    getRetryableErrors(): ScanError[] {
        return this.errorLog.filter(error => error.retryable);
    }
    
    /**
     * 清空错误日志
     */
    clearErrorLog(): void {
        this.errorLog = [];
        console.log('Error log cleared');
    }
    
    /**
     * 获取错误统计
     * @returns 错误统计信息
     */
    getErrorStats(): {
        total: number;
        byType: Record<string, number>;
        retryable: number;
        topErrors: Array<{ type: string; count: number }>;
    } {
        const stats = {
            total: this.errorLog.length,
            byType: {} as Record<string, number>,
            retryable: 0,
            topErrors: [] as Array<{ type: string; count: number }>
        };
        
        // 统计每种类型的错误数量
        for (const error of this.errorLog) {
            stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
            
            if (error.retryable) {
                stats.retryable++;
            }
        }
        
        // 找出最常见的错误类型
        stats.topErrors = Object.entries(stats.byType)
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // 取前 5 个
        
        return stats;
    }
    
    /**
     * 生成错误报告
     * @returns 错误报告字符串
     */
    generateErrorReport(): string {
        const stats = this.getErrorStats();
        const timestamp = new Date().toISOString();
        
        let report = `Scan Error Report\n`;
        report += `================\n`;
        report += `Generated: ${timestamp}\n\n`;
        
        report += `Summary:\n`;
        report += `  Total Errors: ${stats.total}\n`;
        report += `  Retryable: ${stats.retryable}\n`;
        report += `  Success Rate: ${((1 - stats.total / Math.max(1, stats.total + 100)) * 100).toFixed(1)}%\n\n`;
        
        report += `Error Types:\n`;
        for (const [type, count] of Object.entries(stats.byType)) {
            report += `  ${type}: ${count}\n`;
        }
        
        if (stats.topErrors.length > 0) {
            report += `\nTop Errors:\n`;
            for (const { type, count } of stats.topErrors) {
                report += `  ${type}: ${count} occurrences\n`;
            }
        }
        
        if (this.errorLog.length > 0) {
            report += `\nRecent Errors:\n`;
            const recent = this.errorLog.slice(0, 10); // 最近 10 个错误
            for (const error of recent) {
                const context = [];
                if (error.file) context.push(`file: ${error.file}`);
                if (error.url) context.push(`url: ${error.url}`);
                
                report += `  [${error.type}]${context.length > 0 ? ' (' + context.join(', ') + ')' : ''}: ${error.message}\n`;
            }
        }
        
        return report;
    }
}

/**
 * 带重试机制执行异步操作（使用通用版本）
 * @param operation - 要执行的操作函数
 * @param options - 重试选项
 * @param errorHandler - 错误处理器实例（可选）
 * @returns 操作结果
 */
export async function retryOperation<T>(
    operation: () => Promise<T>,
    options: RetryOptions,
    errorHandler?: ScanErrorHandler
): Promise<T> {
    // 创建适配器函数，将 ScanErrorHandler 转换为通用错误处理回调
    const genericErrorHandler: GenericErrorHandler | undefined = errorHandler ? 
        (error: Error, attempt: number) => {
            errorHandler.handleError(error, {});
        } : undefined;
    
    // 创建可重试检查函数，优先使用错误处理器的检查方法
    const isRetryableCheck = errorHandler ? 
        (error: Error) => errorHandler['isRetryable'](error) : 
        undefined;
    
    return await genericRetryOperation(operation, options, genericErrorHandler, isRetryableCheck);
}

export default ScanErrorHandler;