/**
 * 错误处理模块
 * 
 * 提供统一的错误处理和用户通知功能。
 */

import { Notice } from 'obsidian';
import ImageManagementPlugin from '../main';
import { OperationType, LogLevel } from './logger';

/**
 * 统一错误处理工具
 * 
 * 负责处理插件中的所有错误，包括：
 * - 转换各种错误格式为标准 Error 对象
 * - 记录详细的错误日志（包含堆栈跟踪）
 * - 显示用户友好的错误提示
 * - 提取错误发生的文件和行号
 * 
 * 使用示例：
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   await this.errorHandler.handle(
 *     error,
 *     OperationType.RENAME,
 *     '重命名图片失败，请检查文件权限',
 *     { filePath: image.path }
 *   );
 * }
 * ```
 */
export class ErrorHandler {
	constructor(private plugin: ImageManagementPlugin) {}

	/**
	 * 处理错误：记录日志并显示通知
	 * 
	 * 执行流程：
	 * 1. 将错误转换为标准 Error 对象
	 * 2. 获取错误堆栈信息和调用者文件路径
	 * 3. 记录详细的错误日志（用于调试）
	 * 4. 显示简化的用户友好提示
	 * 
	 * @param error - 错误对象（可以是 Error、字符串或其他类型）
	 * @param operation - 操作类型（用于日志分类）
	 * @param userMessage - 显示给用户的消息（支持多行，仅显示第一行）
	 * @param details - 额外的错误上下文信息（可选）
	 * 
	 * @example
	 * ```typescript
	 * await errorHandler.handle(
	 *   new Error('File not found'),
	 *   OperationType.DELETE,
	 *   '删除文件失败：文件不存在'
	 * );
	 * ```
	 */
	async handle(
		error: Error | unknown,
		operation: OperationType,
		userMessage: string,
		details?: any
	): Promise<void> {
		// 转换为标准 Error 对象（处理各种错误类型）
		const err = error instanceof Error 
			? error 
			: new Error(String(error));

		// 获取错误堆栈信息（用于调试）
		const stack = err.stack || new Error().stack || '';

		// 记录到日志系统（包含完整的错误上下文）
		await this.plugin.logger.error(operation, userMessage, {
			error: err,
			details: {
				...details,
				filePath: this.getCallerFilePath(),
				stackTrace: stack
			}
		});

		// 显示用户友好的通知（仅显示第一行，避免过长）
		const shortMessage = userMessage.split('\n')[0];
		new Notice(`❌ ${shortMessage}`);
	}

	/**
	 * 获取调用者文件路径（用于错误上下文定位）
	 * 
	 * 通过分析堆栈跟踪来提取错误发生的源文件路径
	 * 这有助于快速定位错误发生的位置
	 * 
	 * @returns 调用者文件路径，如果无法提取则返回 undefined
	 * 
	 * @private
	 */
	private getCallerFilePath(): string | undefined {
		try {
			const stack = new Error().stack?.split('\n') || [];
			// 跳过前 3 行：
			// 0: Error 对象本身
			// 1: getCallerFilePath 方法
			// 2: handle 方法
			// 3: 实际调用 handle 的方法（我们要找的）
			if (stack.length > 3) {
				const callerLine = stack[3].trim();
				// 提取文件路径（格式：(path/to/file.ts:line:column)）
				const match = callerLine.match(/\((.+):\d+:\d+\)/);
				if (match && match[1]) {
					return match[1];
				}
			}
		} catch (error) {
			// 忽略错误
		}
		return undefined;
	}

	/**
	 * 处理警告：记录日志并显示警告通知
	 * @param operation - 操作类型
	 * @param userMessage - 显示给用户的消息
	 * @param details - 额外详情
	 */
	async warning(
		operation: OperationType,
		userMessage: string,
		details?: any
	): Promise<void> {
		// 记录警告日志（使用 logger 的 log 方法）
		await this.plugin.logger.log(
			LogLevel.WARNING,
			operation,
			userMessage,
			{ details }
		);

		// 显示警告通知
		new Notice(`⚠️ ${userMessage}`);

		// 日志已通过 logger.warn 记录，logger 会根据设置决定是否输出到控制台
	}

	/**
	 * 记录信息：记录日志并显示成功通知
	 * @param operation - 操作类型
	 * @param userMessage - 显示给用户的消息
	 * @param details - 额外详情
	 */
	async success(
		operation: OperationType,
		userMessage: string,
		details?: any
	): Promise<void> {
		// 记录信息日志
		await this.plugin.logger.info(operation, userMessage, {
			details
		});

		// 显示成功通知
		new Notice(`✅ ${userMessage}`);
	}
}

