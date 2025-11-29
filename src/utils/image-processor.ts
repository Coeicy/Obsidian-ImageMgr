import { TFile, Notice } from 'obsidian';
import { ImageInfo } from '../types';

/**
 * 图片处理工具类
 * 
 * 提供图片相关的工具函数：
 * - 批量重命名
 * - 文件大小格式化
 * - 日期格式化
 */
export class ImageProcessor {
	/**
	 * 批量重命名图片
	 * 
	 * 支持自定义重命名模式，包含占位符：
	 * - {index}: 图片序号（从 1 开始，3 位数字，如 001、002）
	 * - {name}: 原始文件名（不含扩展名）
	 * 
	 * 错误处理：
	 * - 如果图片不存在或无法访问，跳过该文件并继续处理
	 * - 如果重命名失败（如权限问题），记录失败并继续
	 * - 最后显示成功/失败统计
	 * 
	 * @param images - 要重命名的图片列表
	 * @param vault - Obsidian Vault 实例，用于文件操作
	 * @param renamePattern - 重命名模式（默认：'image_{index}'）
	 * 
	 * @example
	 * ```typescript
	 * // 重命名为 photo_001.jpg, photo_002.jpg, ...
	 * await ImageProcessor.batchRename(
	 *   images,
	 *   vault,
	 *   'photo_{index}'
	 * );
	 * ```
	 * 
	 * @throws 不抛出异常，所有错误都被捕获并显示为通知
	 */
	static async batchRename(
		images: ImageInfo[],
		vault: any,
		renamePattern: string = 'image_{index}'
	): Promise<void> {
		// 验证输入：检查是否有选择的图片
		if (images.length === 0) {
			new Notice('没有选择图片');
			return;
		}

		// 初始化统计变量
		let successCount = 0;
		let failCount = 0;
		const failedFiles: string[] = [];

		// 遍历每张图片进行重命名
		for (let i = 0; i < images.length; i++) {
			const image = images[i];
			// 从 vault 获取文件对象
			const oldFile = vault.getAbstractFileByPath(image.path) as TFile;
			
			// 错误处理：检查文件是否存在且有父目录
			if (!oldFile || !oldFile.parent) {
				failCount++;
				failedFiles.push(image.name);
				// 继续处理下一个文件，不中断整个批量操作
				continue;
			}

			// 生成新文件名（保留原始扩展名）
			const extension = oldFile.extension;
			const newName = renamePattern
				.replace('{index}', String(i + 1).padStart(3, '0'))
				.replace('{name}', oldFile.basename)
				+ '.' + extension;

			const newPath = oldFile.parent.path + '/' + newName;

			try {
				// 执行重命名操作
				await vault.rename(oldFile, newPath);
				successCount++;
			} catch (error) {
				// 错误处理：捕获重命名失败（如权限问题、文件被占用等）
				failCount++;
				failedFiles.push(image.name);
				// 继续处理下一个文件，不中断整个批量操作
				// 注：静态工具函数无法访问 plugin，错误日志由调用者处理
			}
		}

		// 显示详细的操作结果
		if (failCount === 0) {
			// 全部成功
			new Notice(`✅ 成功重命名 ${successCount} 张图片`);
		} else if (successCount === 0) {
			// 全部失败
			new Notice(`❌ 全部失败，共 ${failCount} 张图片`);
		} else {
			// 部分成功
			new Notice(`⚠️ 成功 ${successCount}，失败 ${failCount}`);
		}
	}

	/**
	 * 格式化文件大小为可读的字符串
	 * 
	 * 自动选择合适的单位：
	 * - B（字节）：< 1 KB
	 * - KB（千字节）：1 KB - 1 MB
	 * - MB（兆字节）：>= 1 MB
	 * 
	 * @param bytes - 文件大小（字节）
	 * @returns 格式化后的文件大小字符串（如 "2.5 MB"）
	 * 
	 * @example
	 * ```typescript
	 * ImageProcessor.formatFileSize(1024);      // "1.00 KB"
	 * ImageProcessor.formatFileSize(1048576);   // "1.00 MB"
	 * ImageProcessor.formatFileSize(512);       // "512 B"
	 * ```
	 */
	static formatFileSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
	}

	/**
	 * 格式化时间戳为本地化日期字符串
	 * 
	 * 使用中文本地化格式显示日期和时间
	 * 格式：YYYY-MM-DD HH:MM:SS
	 * 
	 * @param timestamp - 时间戳（毫秒）
	 * @returns 格式化后的日期字符串（如 "2025-11-23 01:59:00"）
	 * 
	 * @example
	 * ```typescript
	 * const now = Date.now();
	 * ImageProcessor.formatDate(now);  // "2025-11-23 01:59:00"
	 * ```
	 */
	static formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleString('zh-CN');
	}
}

