/**
 * 文件编辑服务模块
 * 
 * 处理图片文件的重命名和移动操作，包括：
 * - 文件名验证和清理
 * - 目录创建
 * - 引用链接自动更新
 * - 锁定文件检查
 * - 操作历史记录
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

