import { ImageChangeHistory } from '../types';
import ImageManagementPlugin from '../main';
import { OperationType, OperationTypeLabels } from './logger';

/**
 * 历史记录管理器
 * 负责图片修改历史的保存、加载和查询
 */
export class HistoryManager {
	private histories: Map<string, ImageChangeHistory[]> = new Map();
	private readonly MAX_HISTORY_PER_IMAGE = 100;

	constructor(private plugin: ImageManagementPlugin) {
		// 从插件数据中加载历史记录
		this.loadHistories();
	}

	/**
	 * 加载所有图片的历史记录
	 */
	private loadHistories() {
		const data = this.plugin.data;
		if (data && data.histories) {
			// 将数组转换为 Map
			for (const [path, history] of Object.entries(data.histories)) {
				this.histories.set(path, history as ImageChangeHistory[]);
			}
		}
	}

	/**
	 * 保存历史记录到插件数据
	 */
	private async saveHistories() {
		const data = this.plugin.data || {};
		const historiesObj: { [key: string]: ImageChangeHistory[] } = {};

		// 将 Map 转换为对象
		for (const [path, history] of this.histories.entries()) {
			historiesObj[path] = history;
		}

		data.histories = historiesObj;
		await this.plugin.saveData(data);
	}

	/**
	 * 保存历史记录
	 */
	async saveHistory(historyItem: ImageChangeHistory): Promise<void> {
		// 确定图片的标识（在 try 块外定义，以便 catch 块可以访问）
		// 使用图片的最终路径作为键（如果有toPath，使用它，否则使用fromPath）
		const imageKey = historyItem.toPath || historyItem.fromPath || '';
		
		try {
			if (!imageKey) {
				await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '无法保存历史：缺少图片路径');
				return;
			}

			// 获取或创建该图片的历史记录数组
			const history = this.histories.get(imageKey) || [];

			// 添加新的历史记录
			history.push(historyItem);

			// 限制历史记录数量
			if (history.length > this.MAX_HISTORY_PER_IMAGE) {
				history.shift(); // 移除最旧的记录
			}

			// 更新 Map
			this.histories.set(imageKey, history);

			// 保存到插件数据
			await this.saveHistories();
		} catch (error) {
			await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '保存历史失败', {
				error: error as Error,
				imagePath: imageKey
			});
			await this.plugin.errorHandler?.handle(
				error as Error,
				OperationType.PLUGIN_ERROR,
				'保存历史记录失败',
				{ imagePath: imageKey }
			);
		}
	}

	/**
	 * 获取图片的历史记录
	 */
	getHistory(imagePath: string): ImageChangeHistory[] {
		return this.histories.get(imagePath) || [];
	}

	/**
	 * 迁移历史记录（当图片移动或重命名时）
	 */
	async migrateHistory(
		oldPath: string,
		newPath: string,
		fromName: string,
		toName: string
	): Promise<void> {
		try {
			// 获取旧路径的历史记录
			const oldHistory = this.histories.get(oldPath) || [];

			// 如果有历史记录，迁移到新路径
			if (oldHistory.length > 0) {
				this.histories.set(newPath, oldHistory);
				this.histories.delete(oldPath);
			}

			// 保存更改
			await this.saveHistories();
		} catch (error) {
			await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '迁移历史失败', {
				error: error as Error,
				details: { oldPath, newPath }
			});
			await this.plugin.errorHandler?.handle(
				error as Error,
				OperationType.PLUGIN_ERROR,
				'迁移历史记录失败',
				{ oldPath, newPath }
			);
		}
	}

	/**
	 * 删除图片的历史记录
	 */
	async deleteHistory(imagePath: string): Promise<void> {
		try {
			this.histories.delete(imagePath);
			await this.saveHistories();
		} catch (error) {
			await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '删除历史失败', {
				error: error as Error,
				imagePath
			});
			await this.plugin.errorHandler?.handle(
				error as Error,
				OperationType.PLUGIN_ERROR,
				'删除历史记录失败',
				{ imagePath }
			);
		}
	}

	/**
	 * 清除所有历史记录
	 */
	async clearAllHistories(): Promise<void> {
		try {
			this.histories.clear();
			await this.saveHistories();
		} catch (error) {
			await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '清除历史失败', {
				error: error as Error
			});
			await this.plugin.errorHandler?.handle(
				error as Error,
				OperationType.PLUGIN_ERROR,
				'清除所有历史记录失败'
			);
		}
	}
}

