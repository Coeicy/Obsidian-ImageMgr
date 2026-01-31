/**
 * 通用的重试操作工具函数
 */

/**
 * 重试选项接口
 */
export interface RetryOptions {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
}

/**
 * 通用的错误处理回调类型
 */
export type GenericErrorHandler = (error: Error, attempt: number) => void;

/**
 * 通用的重试操作函数
 * @param operation - 要重试的操作
 * @param options - 重试选项
 * @param errorHandler - 错误处理回调（可选）
 * @param isRetryableCheck - 自定义可重试检查函数（可选）
 * @returns 操作结果
 * @throws 如果所有重试都失败则抛出最后一次错误
 */
export async function retryOperation<T>(
    operation: () => Promise<T>,
    options: RetryOptions,
    errorHandler?: GenericErrorHandler,
    isRetryableCheck?: (error: Error) => boolean
): Promise<T> {
    const { maxRetries, initialDelay, maxDelay, backoffMultiplier } = options;
    
    let lastError: Error;
    let delay = initialDelay;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // 尝试执行操作
            return await operation();
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
                break; // 不可重试或已到达最大重试次数
            }
            
            console.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries}): ${lastError.message}. Retrying in ${delay}ms...`);
            
            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // 计算下一次的延迟（指数退避）
            delay = Math.min(delay * backoffMultiplier, maxDelay);
        }
    }
    
    // 所有重试都失败，抛出最后一次错误
    throw lastError!;
}

/**
 * 检查错误是否可重试（默认实现）
 */
function isRetryableError(error: Error): boolean {
    // 网络错误、超时错误等通常可重试
    const retryablePatterns = [
        'network',
        'timeout', 
        'temporary',
        'ECONNRESET',
        'ETIMEDOUT'
    ];
    
    return retryablePatterns.some(pattern => 
        error.message.toLowerCase().includes(pattern.toLowerCase())
    );
}

export { isRetryableError };