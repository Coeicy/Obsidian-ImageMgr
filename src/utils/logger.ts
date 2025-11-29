import { App } from 'obsidian';
import ImageManagementPlugin from '../main';

/**
 * 日志级别枚举
 * 
 * 用于控制日志的详细程度和过滤
 * 级别从低到高：DEBUG < INFO < WARNING < ERROR
 */
export enum LogLevel {
	/** 调试级别 - 最详细的日志，包含所有调试信息 */
	DEBUG = 'DEBUG',
	/** 信息级别 - 记录正常的操作信息 */
	INFO = 'INFO',
	/** 警告级别 - 记录可能的问题或异常情况 */
	WARNING = 'WARNING',
	/** 错误级别 - 只记录错误信息 */
	ERROR = 'ERROR'
}

/**
 * 操作类型枚举
 * 
 * 定义所有可能的操作类型，用于日志记录和追踪
 * 分为以下几类：
 * - 图片操作：扫描、创建、重命名、移动、删除等
 * - 批量操作：批量重命名、移动、删除
 * - 引用操作：查找、更新、删除引用
 * - 分组操作：创建、删除、合并、更新分组
 * - 文件保护：锁定、解锁文件
 * - 回收站操作：删除、恢复、永久删除
 * - 系统操作：插件加载、错误、设置变更
 */
export enum OperationType {
	// ==================== 图片操作 ====================
	/** 扫描图片 - 扫描指定目录中的所有图片 */
	SCAN = 'SCAN',
	/** 创建/导入图片 - 新增或导入图片文件 */
	CREATE = 'CREATE',
	/** 重命名 - 修改单个图片的文件名 */
	RENAME = 'RENAME',
	/** 移动 - 将图片移动到其他目录 */
	MOVE = 'MOVE',
	/** 删除 - 删除图片文件 */
	DELETE = 'DELETE',
	/** 旋转 - 旋转图片（90°、180°、270°） */
	ROTATE = 'ROTATE',
	/** 翻转 - 水平或垂直翻转图片 */
	FLIP = 'FLIP',
	/** 尺寸调整 - 修改图片的宽度或高度 */
	RESIZE = 'RESIZE',
	
	// ==================== 批量操作 ====================
	/** 批量重命名 - 同时重命名多个图片 */
	BATCH_RENAME = 'BATCH_RENAME',
	/** 批量移动 - 同时移动多个图片到新位置 */
	BATCH_MOVE = 'BATCH_MOVE',
	/** 批量删除 - 同时删除多个图片 */
	BATCH_DELETE = 'BATCH_DELETE',
	
	// ==================== 引用操作 ====================
	/** 引用图片 - 在笔记中引用图片 */
	REFERENCE = 'REFERENCE',
	/** 取消引用 - 移除笔记中的图片引用 */
	UNREFERENCE = 'UNREFERENCE',
	/** 更新引用 - 修改图片引用（如重命名后更新路径） */
	UPDATE_REFERENCE = 'UPDATE_REFERENCE',
	/** 更新显示文本 - 修改 Wiki 链接中的显示文本 */
	UPDATE_DISPLAY_TEXT = 'UPDATE_DISPLAY_TEXT',
	/** 查找引用 - 查询哪些笔记引用了该图片 */
	FIND_REFERENCE = 'FIND_REFERENCE',
	
	// ==================== 分组操作 ====================
	/** 创建分组 - 创建新的图片分组 */
	GROUP_CREATE = 'GROUP_CREATE',
	/** 删除分组 - 删除已有的分组 */
	GROUP_DELETE = 'GROUP_DELETE',
	/** 合并分组 - 将多个分组合并为一个 */
	GROUP_MERGE = 'GROUP_MERGE',
	/** 更新分组 - 修改分组内容（如拖拽图片到分组） */
	GROUP_UPDATE = 'GROUP_UPDATE',
	
	// ==================== 文件保护操作 ====================
	/** 锁定文件 - 防止文件被意外修改或删除 */
	LOCK = 'LOCK',
	/** 解锁文件 - 移除文件的锁定状态 */
	UNLOCK = 'UNLOCK',
	
	// ==================== 回收站操作 ====================
	/** 移动到回收站 - 删除文件到回收站 */
	TRASH = 'TRASH',
	/** 从回收站恢复 - 恢复已删除的文件 */
	RESTORE = 'RESTORE',
	/** 永久删除 - 从回收站永久删除文件 */
	PERMANENT_DELETE = 'PERMANENT_DELETE',
	
	// ==================== 系统操作 ====================
	/** 插件加载 - 插件启动时的初始化操作 */
	PLUGIN_LOAD = 'PLUGIN_LOAD',
	/** 插件错误 - 插件运行中发生的错误 */
	PLUGIN_ERROR = 'PLUGIN_ERROR',
	/** 设置更改 - 用户修改了插件设置 */
	SETTINGS_CHANGE = 'SETTINGS_CHANGE',
	/** 其他插件操作 - 其他杂项操作 */
	PLUGIN_OPERATION = 'PLUGIN_OPERATION'
}

/**
 * 操作类型中文映射
 */
export const OperationTypeLabels: Record<OperationType, string> = {
	// 图片操作
	[OperationType.SCAN]: '扫描图片',
	[OperationType.CREATE]: '导入/添加图片',
	[OperationType.RENAME]: '重命名',
	[OperationType.MOVE]: '移动',
	[OperationType.DELETE]: '删除',
	[OperationType.ROTATE]: '旋转',
	[OperationType.FLIP]: '翻转',
	[OperationType.RESIZE]: '尺寸调整',
	
	// 批量操作
	[OperationType.BATCH_RENAME]: '批量重命名',
	[OperationType.BATCH_MOVE]: '批量移动',
	[OperationType.BATCH_DELETE]: '批量删除',
	
	// 引用操作
	[OperationType.REFERENCE]: '引用图片',
	[OperationType.UNREFERENCE]: '取消引用图片',
	[OperationType.UPDATE_REFERENCE]: '更新引用',
	[OperationType.UPDATE_DISPLAY_TEXT]: '更新显示文本',
	[OperationType.FIND_REFERENCE]: '查找引用',
	
	// 分组操作
	[OperationType.GROUP_CREATE]: '创建分组',
	[OperationType.GROUP_DELETE]: '删除分组',
	[OperationType.GROUP_MERGE]: '合并分组',
	[OperationType.GROUP_UPDATE]: '更新分组',
	
	// 文件保护操作
	[OperationType.LOCK]: '锁定文件',
	[OperationType.UNLOCK]: '解锁文件',
	
	// 回收站操作
	[OperationType.TRASH]: '移动到回收站',
	[OperationType.RESTORE]: '恢复文件',
	[OperationType.PERMANENT_DELETE]: '永久删除',
	
	// 系统操作
	[OperationType.PLUGIN_LOAD]: '插件加载',
	[OperationType.PLUGIN_ERROR]: '插件错误',
	[OperationType.SETTINGS_CHANGE]: '设置更改',
	[OperationType.PLUGIN_OPERATION]: '插件操作'
};

/**
 * 日志条目接口
 */
export interface LogEntry {
	id: string;              // 日志ID（唯一）
	timestamp: number;       // 时间戳
	level: LogLevel;         // 日志级别
	operation: OperationType; // 操作类型
	message: string;         // 日志消息
	filePath?: string;       // 触发日志的文件路径
	imageHash?: string;      // 图片MD5哈希值（如果与图片相关）
	imagePath?: string;      // 图片路径（辅助信息）
	imageName?: string;      // 图片名称（辅助信息）
	details?: any;           // 详细信息（JSON对象）
	error?: string;          // 错误信息（如果有）
	stackTrace?: string;     // 堆栈跟踪（如果有错误）
}

/**
 * 日志过滤器
 */
export interface LogFilter {
	level?: LogLevel[];           // 按级别筛选
	operation?: OperationType[];  // 按操作类型筛选
	imageHash?: string;           // 按图片哈希筛选
	startTime?: number;           // 开始时间
	endTime?: number;             // 结束时间
	keyword?: string;             // 关键词搜索
}

/**
 * 日志级别优先级（用于过滤）
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	[LogLevel.DEBUG]: 0,
	[LogLevel.INFO]: 1,
	[LogLevel.WARNING]: 2,
	[LogLevel.ERROR]: 3
};

/**
 * 判断是否为开发环境
 */
function isDevelopmentMode(): boolean {
	// 检查是否有 .hotreload 文件或开发模式标志
	try {
		// 在 Obsidian 插件中，可以通过检查是否有开发工具来判断
		// 或者通过检查 manifest.json 中的版本号
		return typeof window !== 'undefined' && (window as any).__DEV__ === true;
	} catch {
		return false;
	}
}

/**
 * 日志管理器
 */
export class Logger {
	private logs: LogEntry[] = [];
	private readonly MAX_LOGS = 1000; // 最多保存1000条日志
	private plugin: ImageManagementPlugin;
	private isDevMode: boolean;

	constructor(plugin: ImageManagementPlugin) {
		this.plugin = plugin;
		this.isDevMode = isDevelopmentMode();
		this.loadLogs();
	}

	/**
	 * 设置日志级别（供设置页面调用）
	 */
	setLogLevel(level: LogLevel): void {
		// 设置已保存，下次调用shouldLog时会自动读取
		// 这里可以添加额外的逻辑，如清理不符合新级别的日志
	}

	/**
	 * 设置是否输出到控制台（供设置页面调用）
	 */
	setEnableConsoleLog(enabled: boolean): void {
		// 设置已保存，下次调用shouldOutputToConsole时会自动读取
	}

	/**
	 * 设置是否启用DEBUG日志（供设置页面调用）
	 */
	setEnableDebugLog(enabled: boolean): void {
		// 设置已保存，下次调用shouldLog时会自动读取
	}

	/**
	 * 检查日志级别是否应该被记录
	 */
	private shouldLog(level: LogLevel): boolean {
		const settings = this.plugin.settings;
		const minLevel = settings.logLevel || 'INFO';
		const minPriority = LOG_LEVEL_PRIORITY[minLevel as LogLevel] ?? 1;
		const logPriority = LOG_LEVEL_PRIORITY[level];
		
		// 如果日志级别低于设置的最小级别，不记录
		if (logPriority < minPriority) {
			return false;
		}
		
		// 如果是DEBUG级别且未启用DEBUG日志，不记录
		if (level === LogLevel.DEBUG && !settings.enableDebugLog) {
			return false;
		}
		
		return true;
	}

	/**
	 * 检查是否应该输出到控制台
	 */
	private shouldOutputToConsole(level: LogLevel): boolean {
		const settings = this.plugin.settings;
		
		// 如果明确禁用了控制台输出，不输出
		if (!settings.enableConsoleLog && !this.isDevMode) {
			return false;
		}
		
		// 开发模式下总是输出ERROR和WARNING
		if (this.isDevMode && (level === LogLevel.ERROR || level === LogLevel.WARNING)) {
			return true;
		}
		
		// 如果启用了控制台输出，检查日志级别
		if (settings.enableConsoleLog) {
			return this.shouldLog(level);
		}
		
		// 默认情况下，只在开发模式输出
		return this.isDevMode;
	}

	/**
	 * 加载日志（带错误处理）
	 */
	private async loadLogs(): Promise<void> {
		try {
			const data = this.plugin.data || {};
			this.logs = data.logs || [];
			
			// 验证日志数据格式
			if (Array.isArray(this.logs)) {
				// 过滤掉无效的日志条目
				this.logs = this.logs.filter(log => 
					log && 
					log.id && 
					log.timestamp && 
					log.level && 
					log.operation && 
					log.message
				);
			} else {
				this.logs = [];
			}
		} catch (error) {
			console.error('[ImageMgr] 加载日志失败:', error);
			this.logs = [];
		}
	}

	/**
	 * 保存日志（带错误处理）
	 */
	private async saveLogs(): Promise<void> {
		try {
			const data = this.plugin.data || {};
			data.logs = this.logs;
			await this.plugin.saveData(data);
		} catch (error) {
			// 保存日志失败时，只输出到控制台，避免循环错误
			console.error('[ImageMgr] 保存日志失败:', error);
		}
	}

	/**
	 * 获取调用者文件路径（用于日志上下文）
	 */
	private getCallerFilePath(): string | undefined {
		try {
			const stack = new Error().stack?.split('\n') || [];
			// 跳过前3行（Error对象、logger.log、调用logger的方法）
			if (stack.length > 3) {
				const callerLine = stack[3].trim();
				// 提取文件路径（匹配类似 "at functionName (filePath:line:column)" 的格式）
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
	 * 生成日志ID
	 */
	private generateLogId(): string {
		return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * 格式化控制台输出消息（简洁版本）
	 */
	private formatConsoleMessage(entry: LogEntry): string {
		const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN', { 
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		
		const levelIcon = {
			[LogLevel.DEBUG]: '🔍',
			[LogLevel.INFO]: 'ℹ️',
			[LogLevel.WARNING]: '⚠️',
			[LogLevel.ERROR]: '❌'
		}[entry.level] || '';
		
		let message = `[${time}] ${levelIcon} [${entry.operation}] ${entry.message}`;
		
		// 如果有图片信息，添加到消息中
		if (entry.imageName) {
			message += ` | 图片: ${entry.imageName}`;
		} else if (entry.imagePath) {
			const pathParts = entry.imagePath.split('/');
			message += ` | 路径: ${pathParts[pathParts.length - 1]}`;
		}
		
		return message;
	}

	/**
	 * 记录日志（带错误处理和性能优化）
	 */
	async log(
		level: LogLevel,
		operation: OperationType,
		message: string,
		options?: {
			filePath?: string;     // 触发日志的文件路径
			imageHash?: string;
			imagePath?: string;
			imageName?: string;
			details?: any;
			error?: Error | string;
		}
	): Promise<void> {
		try {
			// 检查是否应该记录此日志
			if (!this.shouldLog(level)) {
				return;
			}

			const entry: LogEntry = {
				id: this.generateLogId(),
				timestamp: Date.now(),
				level,
				operation,
				message,
				filePath: options?.filePath || this.getCallerFilePath(),
				imageHash: options?.imageHash,
				imagePath: options?.imagePath,
				imageName: options?.imageName,
				details: options?.details
			};

			// 处理错误信息
			if (options?.error) {
				if (options.error instanceof Error) {
					entry.error = options.error.message;
					entry.stackTrace = options.error.stack;
				} else {
					entry.error = options.error;
				}
			}

			this.logs.push(entry);

			// 限制日志数量（保持最新的日志）
			if (this.logs.length > this.MAX_LOGS) {
				this.logs = this.logs.slice(-this.MAX_LOGS);
			}

			// 异步保存日志，不阻塞主流程
			this.saveLogs().catch(err => {
				// 保存失败时只输出到控制台
				console.error('[ImageMgr] 保存日志失败:', err);
			});

			// 根据设置决定是否输出到控制台
			if (this.shouldOutputToConsole(level)) {
				// 格式化控制台输出，使其更简洁易读
				const consoleMessage = this.formatConsoleMessage(entry);
				
				if (level === LogLevel.ERROR) {
					console.error(consoleMessage);
					// 错误时输出详细信息（如果有）
					if (entry.error || entry.details) {
						if (entry.error) console.error('  错误:', entry.error);
						if (entry.stackTrace) console.error('  堆栈:', entry.stackTrace);
						if (entry.details && Object.keys(entry.details).length > 0) {
							console.error('  详情:', entry.details);
						}
					}
				} else if (level === LogLevel.WARNING) {
					console.warn(consoleMessage);
					// 警告时输出关键详情
					if (entry.details && Object.keys(entry.details).length > 0) {
						console.warn('  详情:', entry.details);
					}
				} else {
					console.log(consoleMessage);
					// DEBUG级别时输出详细信息
					if (level === LogLevel.DEBUG && entry.details && Object.keys(entry.details).length > 0) {
						console.log('  详情:', entry.details);
					}
				}
			}
		} catch (error) {
			// 记录日志本身出错时，只输出到控制台
			console.error('[ImageMgr] 记录日志失败:', error, {
				level,
				operation,
				message
			});
		}
	}

	/**
	 * 快捷方法 - DEBUG
	 */
	async debug(operation: OperationType, message: string, options?: {
		imageHash?: string;
		imagePath?: string;
		imageName?: string;
		details?: any;
		error?: Error | string;
	}) {
		await this.log(LogLevel.DEBUG, operation, message, options);
	}

	/**
	 * 快捷方法 - INFO
	 */
	async info(operation: OperationType, message: string, options?: {
		imageHash?: string;
		imagePath?: string;
		imageName?: string;
		details?: any;
		error?: Error | string;
	}) {
		await this.log(LogLevel.INFO, operation, message, options);
	}

	/**
	 * 快捷方法 - WARNING
	 */
	async warn(operation: OperationType, message: string, options?: {
		imageHash?: string;
		imagePath?: string;
		imageName?: string;
		details?: any;
		error?: Error | string;
	}) {
		await this.log(LogLevel.WARNING, operation, message, options);
	}

	/**
	 * 快捷方法 - ERROR
	 */
	async error(operation: OperationType, message: string, options?: {
		imageHash?: string;
		imagePath?: string;
		imageName?: string;
		details?: any;
		error?: Error | string;
	}) {
		await this.log(LogLevel.ERROR, operation, message, options);
	}

	/**
	 * 查询日志
	 */
	query(filter?: LogFilter): LogEntry[] {
		let result = [...this.logs];

		if (!filter) {
			return result;
		}

		// 按级别筛选
		if (filter.level && filter.level.length > 0) {
			result = result.filter(log => filter.level!.includes(log.level));
		}

		// 按操作类型筛选
		if (filter.operation && filter.operation.length > 0) {
			result = result.filter(log => filter.operation!.includes(log.operation));
		}

		// 按图片哈希筛选
		if (filter.imageHash) {
			result = result.filter(log => log.imageHash === filter.imageHash);
		}

		// 按时间范围筛选
		if (filter.startTime) {
			result = result.filter(log => log.timestamp >= filter.startTime!);
		}
		if (filter.endTime) {
			result = result.filter(log => log.timestamp <= filter.endTime!);
		}

		// 关键词搜索
		if (filter.keyword) {
			const keyword = filter.keyword.toLowerCase();
			result = result.filter(log =>
				log.message.toLowerCase().includes(keyword) ||
				log.imageName?.toLowerCase().includes(keyword) ||
				log.imagePath?.toLowerCase().includes(keyword) ||
				log.error?.toLowerCase().includes(keyword)
			);
		}

		return result.sort((a, b) => b.timestamp - a.timestamp); // 最新的在前
	}

	/**
	 * 获取图片的所有日志
	 */
	getImageLogs(imageHash: string): LogEntry[] {
		return this.query({ imageHash });
	}

	/**
	 * 获取所有错误日志
	 */
	getErrorLogs(): LogEntry[] {
		return this.query({ level: [LogLevel.ERROR] });
	}

	/**
	 * 清除所有日志
	 */
	async clearAllLogs(): Promise<void> {
		this.logs = [];
		await this.saveLogs();
	}

	/**
	 * 清除指定图片的日志
	 */
	async clearImageLogs(imageHash: string): Promise<void> {
		try {
			this.logs = this.logs.filter(log => log.imageHash !== imageHash);
			await this.saveLogs();
		} catch (error) {
			console.error('[ImageMgr] 清除图片日志失败:', error);
			throw error;
		}
	}
	
	/**
	 * 清除指定时间范围之前的日志
	 */
	async clearLogsBefore(timestamp: number): Promise<number> {
		try {
			const beforeCount = this.logs.length;
			this.logs = this.logs.filter(log => log.timestamp >= timestamp);
			const afterCount = this.logs.length;
			await this.saveLogs();
			return beforeCount - afterCount;
		} catch (error) {
			console.error('[ImageMgr] 清除旧日志失败:', error);
			throw error;
		}
	}
	
	/**
	 * 获取日志数量统计
	 */
	getLogCounts(): {
		total: number;
		byLevel: Record<LogLevel, number>;
		byOperation: Record<OperationType, number>;
		oldestTimestamp: number | null;
		newestTimestamp: number | null;
	} {
		const stats = {
			total: this.logs.length,
			byLevel: {} as Record<LogLevel, number>,
			byOperation: {} as Record<OperationType, number>,
			oldestTimestamp: null as number | null,
			newestTimestamp: null as number | null
		};

		// 初始化计数器
		Object.values(LogLevel).forEach(level => {
			stats.byLevel[level] = 0;
		});
		Object.values(OperationType).forEach(op => {
			stats.byOperation[op] = 0;
		});

		if (this.logs.length > 0) {
			stats.oldestTimestamp = Math.min(...this.logs.map(l => l.timestamp));
			stats.newestTimestamp = Math.max(...this.logs.map(l => l.timestamp));
		}

		for (const log of this.logs) {
			stats.byLevel[log.level]++;
			stats.byOperation[log.operation]++;
		}

		return stats;
	}

	/**
	 * 导出日志为文本
	 */
	exportLogs(logs: LogEntry[]): string {
		let output = '# 图片管理插件日志\n\n';
		output += `导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
		output += `日志数量: ${logs.length}\n\n`;
		output += '---\n\n';

		for (const log of logs) {
			output += this.formatLogEntry(log) + '\n\n';
		}

		return output;
	}

	/**
	 * 格式化单条日志
	 */
	formatLogEntry(log: LogEntry): string {
		const time = new Date(log.timestamp).toLocaleString('zh-CN');
		let output = `[${time}] [${log.level}] [${log.operation}] ${log.message}`;

		if (log.imageName) {
			output += `\n  图片: ${log.imageName}`;
		}
		if (log.imagePath) {
			output += `\n  路径: ${log.imagePath}`;
		}
		if (log.imageHash) {
			output += `\n  哈希: ${log.imageHash}`;
		}
		if (log.details) {
			output += `\n  详情: ${JSON.stringify(log.details, null, 2)}`;
		}
		if (log.error) {
			output += `\n  错误: ${log.error}`;
		}
		if (log.stackTrace) {
			output += `\n  堆栈: ${log.stackTrace}`;
		}

		return output;
	}

	/**
	 * 获取日志统计信息
	 */
	getStatistics(): {
		total: number;
		byLevel: Record<LogLevel, number>;
		byOperation: Record<OperationType, number>;
		errorCount: number;
	} {
		const stats = {
			total: this.logs.length,
			byLevel: {} as Record<LogLevel, number>,
			byOperation: {} as Record<OperationType, number>,
			errorCount: 0
		};

		// 初始化计数器
		Object.values(LogLevel).forEach(level => {
			stats.byLevel[level] = 0;
		});
		Object.values(OperationType).forEach(op => {
			stats.byOperation[op] = 0;
		});

		for (const log of this.logs) {
			stats.byLevel[log.level]++;
			stats.byOperation[log.operation]++;
			
			if (log.level === LogLevel.ERROR) {
				stats.errorCount++;
			}
		}

		return stats;
	}
}

