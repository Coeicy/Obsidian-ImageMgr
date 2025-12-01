/**
 * 日志管理模块
 * 
 * 提供插件的日志记录和管理功能。
 * 
 * 功能：
 * - 多级别日志记录（DEBUG、INFO、WARNING、ERROR）
 * - 按操作类型分类日志
 * - 日志持久化存储
 * - 日志查询和过滤
 * - 日志导出
 * - 控制台输出控制
 */

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
	/** 复制图片 - 复制图片到剪贴板或其他位置 */
	COPY = 'COPY',
	/** 查看图片 - 打开图片详情 */
	VIEW = 'VIEW',
	
	// ==================== 批量操作 ====================
	/** 批量重命名 - 同时重命名多个图片 */
	BATCH_RENAME = 'BATCH_RENAME',
	/** 批量移动 - 同时移动多个图片到新位置 */
	BATCH_MOVE = 'BATCH_MOVE',
	/** 批量删除 - 同时删除多个图片 */
	BATCH_DELETE = 'BATCH_DELETE',
	/** 批量锁定 - 同时锁定多个图片 */
	BATCH_LOCK = 'BATCH_LOCK',
	/** 批量解锁 - 同时解锁多个图片 */
	BATCH_UNLOCK = 'BATCH_UNLOCK',
	
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
	/** 修复空链接 - 修复指向不存在图片的链接 */
	FIX_BROKEN_LINK = 'FIX_BROKEN_LINK',
	/** 转换链接格式 - 转换链接路径格式（绝对/相对/最短） */
	CONVERT_LINK_FORMAT = 'CONVERT_LINK_FORMAT',
	
	// ==================== 分组操作 ====================
	/** 创建分组 - 创建新的图片分组 */
	GROUP_CREATE = 'GROUP_CREATE',
	/** 删除分组 - 删除已有的分组 */
	GROUP_DELETE = 'GROUP_DELETE',
	/** 合并分组 - 将多个分组合并为一个 */
	GROUP_MERGE = 'GROUP_MERGE',
	/** 更新分组 - 修改分组内容（如拖拽图片到分组） */
	GROUP_UPDATE = 'GROUP_UPDATE',
	/** 重置分组 - 清除所有分组 */
	GROUP_RESET = 'GROUP_RESET',
	
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
	/** 清空回收站 - 永久删除回收站中的所有文件 */
	EMPTY_TRASH = 'EMPTY_TRASH',
	
	// ==================== 重复检测操作 ====================
	/** 检测重复 - 检测重复的图片文件 */
	DETECT_DUPLICATE = 'DETECT_DUPLICATE',
	/** 删除重复 - 删除重复的图片文件 */
	DELETE_DUPLICATE = 'DELETE_DUPLICATE',
	
	// ==================== 搜索筛选操作 ====================
	/** 搜索图片 - 按关键词搜索图片 */
	SEARCH = 'SEARCH',
	/** 筛选图片 - 按条件筛选图片 */
	FILTER = 'FILTER',
	/** 排序图片 - 按条件排序图片 */
	SORT = 'SORT',
	
	// ==================== 缓存操作 ====================
	/** 缓存更新 - 更新哈希缓存 */
	CACHE_UPDATE = 'CACHE_UPDATE',
	/** 缓存清理 - 清理过期缓存 */
	CACHE_CLEAR = 'CACHE_CLEAR',
	
	// ==================== 系统操作 ====================
	/** 插件加载 - 插件启动时的初始化操作 */
	PLUGIN_LOAD = 'PLUGIN_LOAD',
	/** 插件卸载 - 插件关闭时的清理操作 */
	PLUGIN_UNLOAD = 'PLUGIN_UNLOAD',
	/** 插件错误 - 插件运行中发生的错误 */
	PLUGIN_ERROR = 'PLUGIN_ERROR',
	/** 设置更改 - 用户修改了插件设置 */
	SETTINGS_CHANGE = 'SETTINGS_CHANGE',
	/** 其他插件操作 - 其他杂项操作 */
	PLUGIN_OPERATION = 'PLUGIN_OPERATION',
	/** 日志导出 - 导出日志文件 */
	LOG_EXPORT = 'LOG_EXPORT',
	/** 日志清理 - 清理日志记录 */
	LOG_CLEAR = 'LOG_CLEAR'
}

/**
 * 操作类型中文映射
 * 
 * 用于在 UI 中显示操作类型的中文名称
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
	[OperationType.COPY]: '复制图片',
	[OperationType.VIEW]: '查看图片',
	
	// 批量操作
	[OperationType.BATCH_RENAME]: '批量重命名',
	[OperationType.BATCH_MOVE]: '批量移动',
	[OperationType.BATCH_DELETE]: '批量删除',
	[OperationType.BATCH_LOCK]: '批量锁定',
	[OperationType.BATCH_UNLOCK]: '批量解锁',
	
	// 引用操作
	[OperationType.REFERENCE]: '引用图片',
	[OperationType.UNREFERENCE]: '取消引用图片',
	[OperationType.UPDATE_REFERENCE]: '更新引用',
	[OperationType.UPDATE_DISPLAY_TEXT]: '更新显示文本',
	[OperationType.FIND_REFERENCE]: '查找引用',
	[OperationType.FIX_BROKEN_LINK]: '修复空链接',
	[OperationType.CONVERT_LINK_FORMAT]: '转换链接格式',
	
	// 分组操作
	[OperationType.GROUP_CREATE]: '创建分组',
	[OperationType.GROUP_DELETE]: '删除分组',
	[OperationType.GROUP_MERGE]: '合并分组',
	[OperationType.GROUP_UPDATE]: '更新分组',
	[OperationType.GROUP_RESET]: '重置分组',
	
	// 文件保护操作
	[OperationType.LOCK]: '锁定文件',
	[OperationType.UNLOCK]: '解锁文件',
	
	// 回收站操作
	[OperationType.TRASH]: '移动到回收站',
	[OperationType.RESTORE]: '恢复文件',
	[OperationType.PERMANENT_DELETE]: '永久删除',
	[OperationType.EMPTY_TRASH]: '清空回收站',
	
	// 重复检测操作
	[OperationType.DETECT_DUPLICATE]: '检测重复',
	[OperationType.DELETE_DUPLICATE]: '删除重复',
	
	// 搜索筛选操作
	[OperationType.SEARCH]: '搜索图片',
	[OperationType.FILTER]: '筛选图片',
	[OperationType.SORT]: '排序图片',
	
	// 缓存操作
	[OperationType.CACHE_UPDATE]: '更新缓存',
	[OperationType.CACHE_CLEAR]: '清理缓存',
	
	// 系统操作
	[OperationType.PLUGIN_LOAD]: '插件加载',
	[OperationType.PLUGIN_UNLOAD]: '插件卸载',
	[OperationType.PLUGIN_ERROR]: '插件错误',
	[OperationType.SETTINGS_CHANGE]: '设置更改',
	[OperationType.PLUGIN_OPERATION]: '插件操作',
	[OperationType.LOG_EXPORT]: '导出日志',
	[OperationType.LOG_CLEAR]: '清理日志'
};

/**
 * 日志条目接口
 * 
 * 记录单条操作日志的完整信息
 */
export interface LogEntry {
	/** 日志唯一标识符 */
	id: string;
	/** 日志时间戳（毫秒） */
	timestamp: number;
	/** 日志级别 */
	level: LogLevel;
	/** 操作类型 */
	operation: OperationType;
	/** 日志消息（简短描述） */
	message: string;
	/** 触发日志的源文件路径（用于调试） */
	filePath?: string;
	/** 图片 MD5 哈希值（用于追踪同一图片的操作） */
	imageHash?: string;
	/** 图片路径 */
	imagePath?: string;
	/** 图片名称 */
	imageName?: string;
	/** 详细信息（JSON 对象，包含操作的具体参数） */
	details?: {
		/** 旧文件名（重命名操作） */
		oldName?: string;
		/** 新文件名（重命名操作） */
		newName?: string;
		/** 旧路径（移动操作） */
		oldPath?: string;
		/** 新路径（移动操作） */
		newPath?: string;
		/** 操作数量（批量操作） */
		count?: number;
		/** 成功数量（批量操作） */
		successCount?: number;
		/** 失败数量（批量操作） */
		failedCount?: number;
		/** 操作耗时（毫秒） */
		duration?: number;
		/** 文件大小（字节） */
		fileSize?: number;
		/** 引用的笔记列表 */
		referencedNotes?: string[];
		/** 分组名称 */
		groupName?: string;
		/** 搜索关键词 */
		searchQuery?: string;
		/** 筛选条件 */
		filterOptions?: any;
		/** 排序条件 */
		sortOptions?: any;
		/** 其他自定义信息 */
		[key: string]: any;
	};
	/** 错误信息（如果有） */
	error?: string;
	/** 堆栈跟踪（如果有错误） */
	stackTrace?: string;
}

/**
 * 日志过滤器接口
 * 
 * 用于查询和筛选日志
 */
export interface LogFilter {
	/** 按日志级别筛选（多选） */
	level?: LogLevel[];
	/** 按操作类型筛选（多选） */
	operation?: OperationType[];
	/** 按图片哈希筛选（精确匹配） */
	imageHash?: string;
	/** 按图片路径筛选（模糊匹配） */
	imagePath?: string;
	/** 开始时间（时间戳） */
	startTime?: number;
	/** 结束时间（时间戳） */
	endTime?: number;
	/** 关键词搜索（搜索消息和详情） */
	keyword?: string;
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
 * 日志管理器类
 * 
 * 负责插件的日志记录、存储、查询和导出。
 * 
 * 功能：
 * - 多级别日志记录（DEBUG、INFO、WARNING、ERROR）
 * - 按操作类型分类日志
 * - 日志持久化存储（保存到插件数据）
 * - 日志查询和过滤
 * - 日志导出（JSON 格式）
 * - 控制台输出控制
 * - 自动清理过期日志
 * 
 * 使用示例：
 * ```typescript
 * // 记录信息日志
 * await logger.info(OperationType.RENAME, '重命名成功', {
 *   imageHash: 'abc123',
 *   imagePath: 'images/photo.png',
 *   details: { oldName: 'old.png', newName: 'new.png' }
 * });
 * 
 * // 记录错误日志
 * await logger.error(OperationType.DELETE, '删除失败', {
 *   error: new Error('文件不存在')
 * });
 * 
 * // 查询日志
 * const logs = logger.query({
 *   operation: [OperationType.RENAME, OperationType.MOVE],
 *   startTime: Date.now() - 86400000 // 最近24小时
 * });
 * ```
 */
export class Logger {
	/** 日志存储数组 */
	private logs: LogEntry[] = [];
	/** 最大日志条数 */
	private readonly MAX_LOGS = 1000;
	/** 插件实例引用 */
	private plugin: ImageManagementPlugin;
	/** 是否为开发模式 */
	private isDevMode: boolean;

	/**
	 * 创建日志管理器实例
	 * @param plugin - 插件实例
	 */
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
	 * 记录调试日志
	 * 
	 * 用于记录详细的调试信息，仅在启用 DEBUG 日志时记录。
	 * 
	 * @param operation - 操作类型
	 * @param message - 日志消息
	 * @param options - 可选参数（图片信息、详情等）
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
	 * 记录信息日志
	 * 
	 * 用于记录正常的操作信息，如成功的操作。
	 * 
	 * @param operation - 操作类型
	 * @param message - 日志消息
	 * @param options - 可选参数（图片信息、详情等）
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
	 * 记录警告日志
	 * 
	 * 用于记录可能的问题或异常情况，但不影响功能。
	 * 
	 * @param operation - 操作类型
	 * @param message - 日志消息
	 * @param options - 可选参数（图片信息、详情等）
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
	 * 记录错误日志
	 * 
	 * 用于记录错误信息，包括异常和失败的操作。
	 * 
	 * @param operation - 操作类型
	 * @param message - 日志消息
	 * @param options - 可选参数（图片信息、详情、错误对象等）
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

