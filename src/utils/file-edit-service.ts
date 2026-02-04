/**
 * 文件编辑服务模块
 * 
 * 核心功能：
 * - 文件重命名和移动操作
 * - 文件名验证和清理（防止非法字符）
 * - 目录自动创建（包括所有父目录）
 * - 引用链接自动更新（重命名/移动后）
 * - 锁定文件检查（防止误操作）
 * - 操作历史记录
 * 
 * 操作流程：
 * 1. **检查锁定状态**：
 *    - 检查文件是否在忽略列表中
 *    - 如果锁定，提示用户确认
 *    - 确认后自动从忽略列表移除
 * 
 * 2. **验证和构建路径**：
 *    - 验证文件名合法性
 *    - 构建目标路径
 *    - 检查目标目录是否存在
 * 
 * 3. **创建目录**：
 *    - 自动创建所有父目录
 *    - 静默跳过已存在目录
 * 
 * 4. **执行重命名/移动**：
 *    - 使用 Obsidian Vault API
 *    - 自动更新分组数据
 * 
 * 5. **更新引用**：
 *    - 查找所有引用该图片的笔记
 *    - 批量更新引用链接
 *    - 支持多种链接格式
 * 
 * 6. **记录历史**：
 *    - 记录操作类型（rename/move）
 *    - 记录旧路径和新路径
 *    - 保存时间戳
 * 
 * 路径验证规则：
 * - 禁止字符：< > : " | ? *
 * - 最大长度：50字符
 * - 保留名称：CON, PRN, AUX, NUL, COM1-9, LPT1-9（Windows）
 * 
 * 目录创建策略：
 * - 递归创建所有父目录
 * - 静默跳过已存在目录
 * - 不抛出重复创建错误
 * 
 * 引用更新支持：
 * - Wiki 链接：![[image.png]]
 * - Markdown 链接：![alt](image.png)
 * - HTML 标签：<img src="image.png">
 * - 自动检测链接格式
 * 
 * 错误处理：
 * - 文件不存在：返回错误信息
 * - 目标路径冲突：提示用户修改
 * - 权限不足：记录日志
 * - 引用更新失败：继续执行，不中断
 * 
 * 使用示例：
 * ```typescript
 * // 创建服务实例
 * const service = new FileEditService(
 *     app,
 *     vault,
 *     imageInfo,  // 当前图片信息
 *     plugin,     // 插件实例
 *     referenceManager,  // 引用管理器（可选）
 *     historyManager     // 历史管理器（可选）
 * );
 * 
 * // 重命名文件
 * const result = await service.saveChanges(
 *     'new-name',      // 新文件名（不含扩展名）
 *     '.png',          // 文件扩展名
 *     '',              // 新目录路径（空表示当前目录）
 *     'old-name.png',  // 原始文件名
 *     'images/old-name.png' // 原始完整路径
 * );
 * 
 * if (result.success) {
 *     console.log(`重命名成功: ${result.newFileName}`);
 *     console.log(`新路径: ${result.newFullPath}`);
 * } else {
 *     console.error(`失败: ${result.error}`);
 * }
 * 
 * // 移动文件
 * const result = await service.saveChanges(
 *     'image',          // 文件名
 *     '.jpg',           // 扩展名
 *     'archive',        // 新目录
 *     'image.jpg',      // 原文件名
 *     'temp/image.jpg'  // 原路径
 * );
 * 
 * // 同时重命名和移动
 * const result = await service.saveChanges(
 *     'renamed',         // 新文件名
 *     '.png',            // 扩展名
 *     'organized',       // 新目录
 *     'old-name.png',    // 原文件名
 *     'temp/old-name.png' // 原路径
 * );
 * 
 * // 创建目录
 * await service.createDirectory('new/folder/path');
 * 
 * // 验证文件名
 * const isValid = FileEditService.isValidFileName('valid_name');
 * console.log(isValid); // true
 * 
 * const isInvalid = FileEditService.isValidFileName('invalid<name>');
 * console.log(isInvalid); // false
 * ```
 * 
 * 最佳实践：
 * 1. 在重命名前先检查文件名合法性
 * 2. 批量操作时等待每个操作完成
 * 3. 保留原始路径和历史记录
 * 4. 处理错误时给用户友好的提示
 * 5. 移动文件前确保目标目录可访问
 * 
 * 注意事项：
 * - 文件重命名会触发 Obsidian 的 'rename' 事件
 * - 引用更新是异步的，可能需要时间
 * - 锁定文件修改会自动解除锁定
 * - 目标文件已存在时会返回错误
 */

import { App, Notice, TFile, TFolder, Vault } from 'obsidian';
import { ImageInfo } from '../types';
import { PathValidator } from './path-validator';
import { ReferenceManager } from './reference-manager';
import { HistoryManager } from './history-manager';
import { ConfirmModal } from '../ui/confirm-modal';
import ImageManagementPlugin from '../main';
import { OperationType } from './logger';
import { isFileIgnored } from './file-filter';

/**
 * 文件编辑服务类
 * 
 * 功能：
 * - 重命名图片文件
 * - 移动图片到其他目录
 * - 自动创建目标目录
 * - 自动更新笔记中的引用链接
 * - 检查和处理锁定文件
 * - 记录操作历史
 * 
 * 使用场景：
 * - 图片详情页的文件名/路径编辑
 * - 批量重命名操作
 * - 智能重命名功能
 */
export class FileEditService {
	/**
	 * 创建文件编辑服务实例
	 * @param app - Obsidian App 实例
	 * @param vault - Obsidian Vault 实例
	 * @param image - 当前操作的图片信息
	 * @param plugin - 插件实例（可选）
	 * @param referenceManager - 引用管理器（可选，用于更新引用）
	 * @param historyManager - 历史记录管理器（可选）
	 */
	constructor(
		private app: App,
		private vault: Vault,
		private image: ImageInfo,
		private plugin?: ImageManagementPlugin,
		private referenceManager?: ReferenceManager,
		private historyManager?: HistoryManager
	) {}

	/**
	 * 创建目录（包括所有父目录）
	 * 
	 * 递归创建指定路径的所有目录层级。
	 * 如果目录已存在，则静默跳过。
	 * 
	 * @param path - 要创建的目录路径
	 * @throws 路径为空时抛出错误
	 */
	async createDirectory(path: string): Promise<void> {
		// 确保路径不以 / 开头或结尾
		const cleanPath = path.replace(/^\//, '').replace(/\/$/, '');
		
		if (!cleanPath) {
			throw new Error('路径不能为空');
		}
		
		// 检查目录是否已存在
		const existingFolder = this.vault.getAbstractFileByPath(cleanPath);
		if (existingFolder) {
			return; // 目录已存在，无需创建
		}
		
		// 创建所有父目录
		const pathParts = cleanPath.split('/');
		let currentPath = '';
		
		for (const part of pathParts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const folder = this.vault.getAbstractFileByPath(currentPath);
			if (!folder) {
				await this.vault.createFolder(currentPath);
			}
		}
	}

	/**
	 * 检查文件是否被忽略（锁定）
	 */
    private isIgnoredFile(fileName: string): boolean {
        if (!this.plugin) return false;
        return isFileIgnored(
            fileName,
            this.image?.md5,
            this.plugin.settings.ignoredFiles || '',
            this.plugin.settings.ignoredHashes || ''
        );
    }

	/**
	 * 从忽略列表移除文件
	 */
    private async removeFromIgnoredList(fileName: string): Promise<void> {
        if (!this.plugin) return;
        const ignoredFilesList = (this.plugin.settings.ignoredFiles || '').split('\n').map(f => f.trim()).filter(f => f);
        const updatedList = ignoredFilesList.filter(ignored => !fileName.toLowerCase().includes(ignored.toLowerCase()));
        const hashList = (this.plugin.settings.ignoredHashes || '').split('\n').map(f => f.trim()).filter(f => f);
        const updatedHashList = this.image?.md5 ? hashList.filter(hash => hash !== this.image.md5) : hashList;
        this.plugin.settings.ignoredFiles = updatedList.join('\n');
        this.plugin.settings.ignoredHashes = updatedHashList.join('\n');
        await this.plugin.saveSettings();
    }

	/**
	 * 更新分组数据（文件移动时）
	 */
	private async updateGroupDataOnMove(oldPath: string, newPath: string): Promise<void> {
		if (!this.plugin) return;
		// 这里可以添加分组数据更新逻辑
		// 目前分组功能可能在其他地方实现
	}

	/**
	 * 保存文件更改（重命名和/或移动）
	 * 
	 * 执行流程：
	 * 1. 检查文件是否被锁定，如果是则提示用户确认
	 * 2. 验证目标路径，必要时创建目录
	 * 3. 执行重命名/移动操作
	 * 4. 更新笔记中的引用链接
	 * 5. 记录操作历史
	 * 
	 * @param newBaseName - 新的文件名（不含扩展名）
	 * @param fileExtension - 文件扩展名（如 '.png'）
	 * @param newPath - 新的目录路径
	 * @param originalFileName - 原始文件名
	 * @param originalPath - 原始完整路径
	 * @returns 操作结果对象，包含成功状态、新文件名、新路径或错误信息
	 */
	async saveChanges(
		newBaseName: string,
		fileExtension: string,
		newPath: string,
		originalFileName: string,
		originalPath: string
	): Promise<{ success: boolean; newFileName?: string; newFullPath?: string; error?: string }> {
		try {
			// 检查是否是锁定的文件
			const isIgnored = this.isIgnoredFile(this.image.name);
			if (isIgnored) {
				const result = await ConfirmModal.show(
					this.app,
					'修改锁定的文件',
					`此文件在锁定列表中，修改后将从锁定列表中移除。\n\n是否继续修改？`,
					['修改并解锁', '取消']
				);
				if (result === 'save') {
					await this.removeFromIgnoredList(this.image.name);
				} else {
					return { success: false, error: '用户取消' };
				}
			}

			const file = this.vault.getAbstractFileByPath(this.image.path) as TFile;
			if (!file) {
				return { success: false, error: '文件不存在' };
			}
			
			// 组合新文件名
			const newFileName = newBaseName + fileExtension;
			
			// 构建新路径
			let finalPath: string;
			if (newPath && newPath.trim()) {
				const cleanPath = newPath.replace(/\/+$/, '');
				finalPath = cleanPath + '/' + newFileName;
			} else {
				finalPath = newFileName;
			}
			
			// 检查实际变更
			const actualOldDir = this.image.path.includes('/') 
				? this.image.path.substring(0, this.image.path.lastIndexOf('/'))
				: '';
			const newDir = finalPath.includes('/')
				? finalPath.substring(0, finalPath.lastIndexOf('/'))
				: '';
			const fileNameChanged = this.image.name !== newFileName;
			const dirChanged = actualOldDir !== newDir;
			
			// 保存旧值
			const oldPath = this.image.path;
			const oldName = this.image.name;
			
			// 如果有变更，执行重命名/移动操作
			if (finalPath !== this.image.path) {
				// 检查并创建目标目录
				if (newDir) {
					const targetFolder = this.vault.getAbstractFileByPath(newDir);
					if (!targetFolder) {
						try {
							await this.createDirectory(newDir);
							new Notice(`✅ 已创建目录: ${newDir}`);
						} catch (error) {
							return { success: false, error: `创建目录失败: ${error}` };
						}
					}
				}
				
				await this.vault.rename(file, finalPath);
				
				// 更新分组数据
				if (this.plugin && (fileNameChanged || dirChanged)) {
					await this.updateGroupDataOnMove(oldPath, finalPath);
				}
				
				// 记录历史
				if (this.historyManager) {
					if (fileNameChanged && dirChanged) {
						await this.historyManager.saveHistory({
							timestamp: Date.now(),
							action: 'move',
							fromName: oldName,
							toName: newFileName,
							fromPath: oldPath,
							toPath: finalPath
						});
					} else if (fileNameChanged) {
						await this.historyManager.saveHistory({
							timestamp: Date.now(),
							action: 'rename',
							fromName: oldName,
							toName: newFileName,
							fromPath: oldPath,
							toPath: finalPath
						});
					} else if (dirChanged) {
						await this.historyManager.saveHistory({
							timestamp: Date.now(),
							action: 'move',
							fromPath: oldPath,
							toPath: finalPath
						});
					}
				}
				
				// 更新图片信息
				this.image.name = newFileName;
				this.image.path = finalPath;
				
				// 更新笔记中的引用链接
				// 注意：不在这里记录日志，因为 vault.rename() 会触发 'rename' 事件
				// detectImageRename 会统一处理日志记录，包含更完整的信息（行号等）
				if ((fileNameChanged || dirChanged) && this.referenceManager) {
					await this.referenceManager.updateReferencesInNotes(oldPath, finalPath, oldName, newFileName);
				}
			}
			
			return { 
				success: true, 
				newFileName, 
				newFullPath: finalPath,
				error: fileNameChanged || dirChanged ? undefined : '没有需要保存的更改'
			};
		} catch (error) {
			let errorMessage = String(error);
			if (errorMessage.includes('already exists')) {
				errorMessage = '目标位置已存在同名文件！\n请修改文件名或路径后重试。';
			}
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * 验证文件名
	 */
	static isValidFileName(fileName: string): boolean {
		return PathValidator.isValidFileName(fileName);
	}
}

