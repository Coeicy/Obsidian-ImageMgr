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
 * 文件编辑服务
 * 负责处理文件名和路径的编辑、保存、撤销逻辑
 */
export class FileEditService {
	constructor(
		private app: App,
		private vault: Vault,
		private image: ImageInfo,
		private plugin?: ImageManagementPlugin,
		private referenceManager?: ReferenceManager,
		private historyManager?: HistoryManager
	) {}

	/**
	 * 创建目录
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
	 * 保存文件更改（重命名/移动）
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

