import { TFile, TFolder, Vault } from 'obsidian';
import { TrashItem } from './trash-manager';

/**
 * 回收站路径解析器
 * 负责解析回收站文件路径，提取原始路径信息
 */
export class TrashPathParser {
	private readonly trashFolderPath: string;

	constructor(trashFolderPath: string = '.trash') {
		this.trashFolderPath = trashFolderPath;
	}

	/**
	 * 从回收站路径解析原始路径信息
	 * @param trashPath 回收站中的完整路径
	 * @param stat 文件统计信息（可选，用于 adapter 方式）
	 * @returns 解析后的 TrashItem，如果解析失败返回 null
	 */
	parse(trashPath: string, stat?: { size: number; mtime: number }): TrashItem | null {
		try {
			// 检查路径是否在回收站中
			if (!trashPath.startsWith(this.trashFolderPath + '/')) {
				return null;
			}

			// 解析相对路径：.trash/时间戳_路径$文件名 或 .trash/时间戳_文件名
			const relativePath = trashPath.substring(this.trashFolderPath.length + 1);
			
			// 解析时间戳和路径/文件名：时间戳_路径$文件名 或 时间戳_文件名
			const underscoreIndex = relativePath.indexOf('_');
			if (underscoreIndex < 0) {
				return null;
			}

			const timestampStr = relativePath.substring(0, underscoreIndex);
			const timestamp = parseInt(timestampStr, 10);
			
			// 验证时间戳是否有效
			if (isNaN(timestamp) || timestamp <= 0) {
				return null;
			}

			// 解析路径和文件名
			const afterTimestamp = relativePath.substring(underscoreIndex + 1);
			// 分离路径和文件名（使用 $ 作为分隔符）
			let originalDir = '';
			let originalName = '';
			if (afterTimestamp.includes('$')) {
				const parts = afterTimestamp.split('$');
				originalDir = parts[0];
				originalName = parts.slice(1).join('$'); // 文件名中可能也包含 $
				
				// 将 @ 还原为 / （路径分隔符）
				originalDir = originalDir.replace(/@/g, '/');
			} else {
				// 没有路径，直接就是文件名
				originalName = afterTimestamp;
			}
			
			// 构建完整的原始路径
			let originalFullPath = '';
			if (originalDir) {
				originalFullPath = `${originalDir}/${originalName}`;
			} else {
				originalName = afterTimestamp;
				originalFullPath = originalName;
			}
			
			// 验证文件名不为空
			if (!originalName || originalName.trim() === '') {
				return null;
			}

			// 用于显示的原始路径（简化显示）
			const originalPath = originalDir ? `${originalDir}/${originalName}` : originalName;

			// 获取文件大小
			let size = 0;
			if (stat) {
				size = stat.size || 0;
			}

			return {
				path: trashPath,
				originalPath: originalPath,
				originalFullPath: originalFullPath,
				originalName: originalName,
				deletedAt: timestamp,
				size: size
			};
		} catch (error) {
			// 解析失败，返回 null（不记录错误，因为可能是格式不正确的文件）
			return null;
		}
	}

	/**
	 * 从 TFile 解析回收站项目
	 * @param file 回收站中的文件
	 * @returns 解析后的 TrashItem，如果解析失败返回 null
	 */
	parseFromFile(file: TFile): TrashItem | null {
		if (!file.stat) {
			return null;
		}

		const stat = {
			size: file.stat.size || 0,
			mtime: file.stat.mtime
		};

		return this.parse(file.path, stat);
	}

	/**
	 * 生成回收站中的文件路径
	 * @param originalPath 原始文件路径
	 * @param timestamp 删除时间戳（可选，默认使用当前时间）
	 * @returns 回收站中的完整路径
	 */
	generateTrashPath(originalPath: string, timestamp?: number): string {
		const deleteTime = timestamp || Date.now();
		const pathParts = originalPath.split('/');
		const fileName = pathParts.pop() || '';
		const originalDir = pathParts.join('/');

		// 使用特殊分隔符编码路径信息：时间戳_路径$文件名
		// 将路径中的 / 替换为 @ 避免被误认为是目录分隔符
		// 使用 $ 而不是 | 因为 | 在 Windows 中是非法字符
		// 如果路径为空，格式为：时间戳_文件名
		const escapedDir = originalDir.replace(/\//g, '@');
		const pathPrefix = escapedDir ? `${deleteTime}_${escapedDir}$` : `${deleteTime}_`;
		const newFileName = `${pathPrefix}${fileName}`;
		
		return `${this.trashFolderPath}/${newFileName}`;
	}
}

