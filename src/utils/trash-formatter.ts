/**
 * 回收站格式化工具
 * 负责格式化时间、文件大小等显示内容
 */
export class TrashFormatter {
	/**
	 * 格式化日期时间
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
	 */
	formatFileSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
	}
}

