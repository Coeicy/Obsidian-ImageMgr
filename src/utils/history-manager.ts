/**
 * 历史记录管理器模块
 * 
 * 管理图片的操作历史记录，用于追踪图片的变更历史。
 * 历史记录持久化存储在插件数据文件中。
 */

import { ImageChangeHistory } from '../types';
import ImageManagementPlugin from '../main';
import { OperationType, OperationTypeLabels } from './logger';

/**
 * 历史记录管理器
 * 
 * 功能：
 * - 保存图片的操作历史（重命名、移动、删除、引用变更等）
 * - 按图片路径组织历史记录
 * - 支持历史记录的迁移（当图片移动或重命名时）
 * - 限制每张图片的历史记录数量（默认 100 条）
 * - 持久化存储到插件数据文件
 * 
 * 使用场景：
 * - 在图片详情页显示操作历史
 * - 追踪图片的变更轨迹
 * - 支持撤销操作（未来功能）
 */
export class HistoryManager {
	/** 历史记录映射：图片路径 -> 历史记录数组 */
	private histories: Map<string, ImageChangeHistory[]> = new Map();
	/** 每张图片最大历史记录数量 */
	private readonly MAX_HISTORY_PER_IMAGE = 100;

	/**
	 * 创建历史记录管理器实例
	 * @param plugin - 插件实例，用于访问持久化存储
	 */
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
	 * 保存一条历史记录
	 * 
	 * 将新的历史记录添加到对应图片的历史列表中。
	 * 如果历史记录数量超过限制，会自动移除最旧的记录。
	 * 
	 * @param historyItem - 要保存的历史记录项
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
	 * 获取指定图片的历史记录
	 * 
	 * @param imagePath - 图片路径
	 * @returns 该图片的历史记录数组，如果没有则返回空数组
	 */
	getHistory(imagePath: string): ImageChangeHistory[] {
		return this.histories.get(imagePath) || [];
	}

	/**
	 * 迁移历史记录
	 * 
	 * 当图片被移动或重命名时，将历史记录从旧路径迁移到新路径。
	 * 这确保了图片的历史记录不会因为路径变化而丢失。
	 * 
	 * @param oldPath - 旧的图片路径
	 * @param newPath - 新的图片路径
	 * @param fromName - 旧的文件名
	 * @param toName - 新的文件名
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
	 * 删除指定图片的历史记录
	 * 
	 * 当图片被永久删除时调用，清除该图片的所有历史记录。
	 * 
	 * @param imagePath - 要删除历史记录的图片路径
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

