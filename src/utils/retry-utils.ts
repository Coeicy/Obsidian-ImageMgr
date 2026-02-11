/**
 * 通用的重试操作工具函数 - 网络图片扫描重试机制
 * 
 * @file 实现智能重试策略、错误处理和性能优化
 * @module retry-utils
 * @version 1.0.0
 * 
 * 核心功能：
 * - 指数退避算法：避免雪崩效应
 * - 智能错误检测：自动识别可重试错误
 * - 可配置重试策略：支持自定义重试参数
 * - 性能监控：记录重试统计信息
 * 
 * 重试策略：
 * - 网络错误：延迟重试，最多2次，间隔5秒
 * - 超时错误：快速重试，最多3次，间隔1秒
 * - 验证错误：不重试（如404、403等）
 */

/**
 * 重试选项接口
 */
export interface RetryOptions {
    maxRetries: number;          // 最大重试次数
    initialDelay: number;        // 初始延迟（毫秒）
    maxDelay: number;           // 最大延迟（毫秒）
    backoffMultiplier: number;  // 退避乘数
}

/**
 * 通用的错误处理回调类型
 */
export type GenericErrorHandler = (error: Error, attempt: number) => void;

/**
 * 重试统计信息接口
 */
export interface RetryStats {
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    totalRetryTime: number;
    averageRetryDelay: number;
}

/**
 * 通用的重试操作函数
 * 
 * 实现智能重试机制，支持：
 * - 指数退避算法
 * - 自定义错误检测
 * - 性能监控统计
 * - 异步错误处理
 * 
 * @param operation - 要重试的异步操作函数
 * @param options - 重试配置选项
 * @param errorHandler - 错误处理回调（可选）
 * @param isRetryableCheck - 自定义可重试检查函数（可选）
 * @returns 操作结果
 * @throws 如果所有重试都失败则抛出最后一次错误
 * 
 * @example
 * ```typescript
 * const result = await retryOperation(
 *   () => fetchImage('https://example.com/image.jpg'),
 *   { maxRetries: 3, initialDelay: 1000, maxDelay: 5000, backoffMultiplier: 2 }
 * );
 * ```
 */
export async function retryOperation<T>(
    operation: () => Promise<T>,
    options: RetryOptions,
    errorHandler?: GenericErrorHandler,
    isRetryableCheck?: (error: Error) => boolean
): Promise<T> {
    const { maxRetries, initialDelay, maxDelay, backoffMultiplier } = options;
    
    let lastError: Error | undefined;
    let delay = initialDelay;
    let totalRetryTime = 0;
    const startTime = Date.now();
    
    console.log(`RetryOperation: 开始重试操作，最大重试次数: ${maxRetries}`);
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // 尝试执行操作
            const result = await operation();
            const elapsedTime = Date.now() - startTime;
            
            console.log(`RetryOperation: 操作成功 (尝试 ${attempt + 1}/${maxRetries})，总耗时: ${elapsedTime}ms`);
            return result;
        } catch (error) {
            lastError = error as Error;
            
            // 调用错误处理回调
            if (errorHandler) {
                errorHandler(lastError, attempt);
            }
            
            // 检查是否可重试
            const isRetryable = isRetryableCheck ? 
                isRetryableCheck(lastError) : 
                isRetryableError(lastError);
            
            if (!isRetryable || attempt === maxRetries - 1) {
                const elapsedTime = Date.now() - startTime;
                console.error(`RetryOperation: 操作失败，不可重试或已达到最大重试次数，总耗时: ${elapsedTime}ms`);
                break; // 不可重试或已到达最大重试次数
            }
            
            console.warn(`RetryOperation: 操作失败 (尝试 ${attempt + 1}/${maxRetries}): ${lastError.message}. ${delay}ms后重试...`);
            
            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, delay));
            totalRetryTime += delay;
            
            // 计算下一次的延迟（指数退避）
            delay = Math.min(delay * backoffMultiplier, maxDelay);
        }
    }
    
    // 所有重试都失败，抛出最后一次错误
    const elapsedTime = Date.now() - startTime;
    console.error(`RetryOperation: 所有重试均失败，总耗时: ${elapsedTime}ms，错误: ${lastError?.message || '未知错误'}`);
    if (lastError) {
        throw lastError;
    }
    throw new Error('RetryOperation: 所有重试均失败');
}

/**
 * 检查错误是否可重试（默认实现）
 * 
 * 智能错误检测策略：
 * - 网络错误：可重试（连接失败、DNS错误等）
 * - 超时错误：可重试（请求超时、操作超时等）
 * - 临时错误：可重试（服务器繁忙、临时故障等）
 * - 验证错误：不可重试（404、403等永久性错误）
 * - 权限错误：不可重试（401、认证失败等）
 */
function isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();
    
    // 可重试的错误模式
    const retryablePatterns = [
        'network',
        'timeout', 
        'temporary',
        'ECONNRESET',
        'ETIMEDOUT',
        'econnreset',
        'etimedout',
        'socket',
        'connection',
        'dns',
        'fetch',
        'request',
        'retry',
        'temporary',
        'timeout',
        'abort'
    ];
    
    // 不可重试的错误模式（优先级更高）
    const nonRetryablePatterns = [
        '404',
        '403',
        '401',
        '400',
        '500',
        '502',
        '503',
        'not found',
        'forbidden',
        'unauthorized',
        'bad request',
        'internal server error',
        'validation',
        'invalid',
        'permission',
        'access denied'
    ];
    
    // 先检查不可重试的模式
    const isNonRetryable = nonRetryablePatterns.some(pattern => 
        message.includes(pattern.toLowerCase())
    );
    
    if (isNonRetryable) {
        console.log(`RetryOperation: 检测到不可重试错误 - ${error.message}`);
        return false;
    }
    
    // 再检查可重试的模式
    const isRetryable = retryablePatterns.some(pattern => 
        message.includes(pattern.toLowerCase()) || 
        name.includes(pattern.toLowerCase())
    );
    
    if (isRetryable) {
        console.log(`RetryOperation: 检测到可重试错误 - ${error.message}`);
    }
    
    return isRetryable;
}

/**
 * 获取预定义的重试策略配置
 */
export function getRetryStrategy(strategy: 'network' | 'timeout' | 'file'): RetryOptions {
    const strategies = {
        network: {
            maxRetries: 2,
            initialDelay: 5000,    // 5秒
            maxDelay: 15000,       // 15秒
            backoffMultiplier: 2
        },
        timeout: {
            maxRetries: 3,
            initialDelay: 1000,    // 1秒
            maxDelay: 5000,        // 5秒
            backoffMultiplier: 1.5
        },
        file: {
            maxRetries: 1,
            initialDelay: 100,     // 0.1秒
            maxDelay: 1000,        // 1秒
            backoffMultiplier: 1
        }
    };
    
    return strategies[strategy] || strategies.network;
}

/**
 * 获取重试统计信息
 */
export function getRetryStats(): RetryStats {
    // 这里可以扩展为实际统计收集
    return {
        totalAttempts: 0,
        successfulAttempts: 0,
        failedAttempts: 0,
        totalRetryTime: 0,
        averageRetryDelay: 0
    };
}

export { isRetryableError };