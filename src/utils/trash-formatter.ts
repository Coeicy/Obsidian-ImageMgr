/**
 * 回收站格式化工具模块
 * 
 * 提供回收站界面显示所需的格式化功能。
 */

/**
 * 回收站格式化工具类
 * 
 * 功能：
 * - 格式化日期时间（本地化显示）
 * - 格式化相对时间（如"3 天前"）
 * - 格式化文件大小（自动选择单位）
 */
export class TrashFormatter {
	/**
	 * 格式化日期时间
	 * 
	 * @param timestamp - 时间戳（毫秒）
	 * @returns 本地化的日期时间字符串（如 "2025/12/01 22:30:00"）
	 */
	formatDateTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleString('zh-CN', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	/**
	 * 格式化相对时间
	 * 
	 * 将时间戳转换为人类可读的相对时间描述。
	 * 
	 * @param timestamp - 时间戳（毫秒）
	 * @returns 相对时间字符串（如 "3 天前"、"2 小时前"、"刚刚"）
	 */
	formatRelativeTime(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) {
			return `${days} 天前`;
		} else if (hours > 0) {
			return `${hours} 小时前`;
		} else if (minutes > 0) {
			return `${minutes} 分钟前`;
		} else {
			return '刚刚';
		}
	}

	/**
	 * 格式化文件大小
	 * 
	 * 自动选择合适的单位（B、KB、MB）显示文件大小。
	 * 
	 * @param bytes - 文件大小（字节）
	 * @returns 格式化的文件大小字符串（如 "1.50 MB"）
	 */
	formatFileSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
	}
}

