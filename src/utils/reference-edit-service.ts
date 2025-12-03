/**
 * 引用编辑服务模块
 * 
 * 处理图片引用链接的显示文本和尺寸编辑功能。
 * 支持 Wiki 链接、Markdown 链接和 HTML img 标签三种格式。
 */

import { App, Notice, TFile } from 'obsidian';
import { ImageInfo } from '../types';
import { ReferenceManager, parseWikiLink, buildWikiLink, WikiLinkParts, parseHtmlImageSize } from './reference-manager';
import { HistoryManager } from './history-manager';
import ImageManagementPlugin from '../main';
import { OperationType } from './logger';

/**
 * 引用编辑服务类
 * 
 * 功能：
 * - 编辑 Wiki 链接的显示文本（如 `![[image.png|显示文本]]`）
 * - 编辑图片尺寸（如 `![[image.png|100x200]]`）
 * - 编辑 Markdown 链接的 alt 文本（如 `![alt](image.png)`）
 * - 编辑 HTML img 标签的 alt 和尺寸属性
 * 
 * 支持的链接格式：
 * - Wiki 链接（带!）：`![[path|text|size]]`
 * - Wiki 链接（不带!）：`[[path|text]]`
 * - Markdown 链接：`![alt](path)`
 * - HTML 标签：`<img src="path" alt="text" width="100">`
 * 
 * 编辑流程：
 * 1. 读取笔记文件内容
 * 2. 定位到指定行
 * 3. 解析链接格式
 * 4. 更新显示文本/尺寸
 * 5. 保存文件
 * 6. 记录历史和日志
 */
export class ReferenceEditService {
	/**
	 * 创建引用编辑服务实例
	 * @param app - Obsidian App 实例
	 * @param image - 当前操作的图片信息
	 * @param plugin - 插件实例（可选，用于日志记录）
	 * @param historyManager - 历史记录管理器（可选，用于记录操作历史）
	 */
	constructor(
		private app: App,
		private image: ImageInfo,
		private plugin?: ImageManagementPlugin,
		private historyManager?: HistoryManager
	) {}

	/**
	 * 保存显示文本和尺寸到笔记文件
	 * 
	 * 根据链接格式自动解析并更新显示文本和尺寸信息。
	 * 支持 Wiki 链接、Markdown 链接和 HTML img 标签。
	 * 
	 * @param filePath - 笔记文件路径
	 * @param lineNumber - 链接所在行号（1-based）
	 * @param matchType - 匹配类型（用于日志）
	 * @param oldLine - 原始行内容
	 * @param newDisplayText - 新的显示文本
	 * @param newWidth - 新的宽度（可选）
	 * @param newHeight - 新的高度（可选）
	 * @returns 是否保存成功
	 * 
	 * @throws 文件不存在或行号超出范围时抛出错误
	 */
	async saveDisplayText(
		filePath: string,
		lineNumber: number,
		matchType: string,
		oldLine: string,
		newDisplayText: string,
		newWidth?: number,
		newHeight?: number
	): Promise<boolean> {
		try {
			// 调试日志（仅在DEBUG模式下记录）
			if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
				await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, 'saveDisplayText 调用', {
					details: {
						filePath,
						lineNumber,
						matchType,
						oldLine,
						newDisplayText,
						newWidth,
						newHeight,
						oldLineLength: oldLine.length,
						newDisplayTextLength: newDisplayText.length
					},
					imagePath: this.image.path
				});
			}
			
			const file = this.app.vault.getMarkdownFiles().find(f => f.path === filePath);
			if (!file) {
				new Notice('文件不存在');
				throw new Error('文件不存在');
			}
			
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			
			if (lineNumber < 1 || lineNumber > lines.length) {
				new Notice('行号超出范围');
				throw new Error('行号超出范围');
			}
			
			// 验证传入的 oldLine 是否与文件中的实际行内容匹配
			const actualLine = lines[lineNumber - 1];
			
			if (actualLine !== oldLine) {
				const containsNewDisplayText = actualLine.includes(newDisplayText);
				const containsNewSize = (newWidth !== undefined && actualLine.includes(String(newWidth))) ||
				                       (newHeight !== undefined && actualLine.includes(String(newHeight)));
				
				if (containsNewDisplayText || containsNewSize) {
					if (this.plugin?.logger) {
						await this.plugin.logger.warn(OperationType.UPDATE_DISPLAY_TEXT, '检测到重复调用或文件已更新', {
							details: { oldLine, actualLine, newDisplayText },
							imagePath: this.image.path
						});
					}
					oldLine = actualLine;
				} else {
					if (this.plugin?.logger) {
						await this.plugin.logger.warn(OperationType.UPDATE_DISPLAY_TEXT, 'oldLine 与文件内容不匹配，使用实际文件内容作为 oldLine', {
							details: { oldLine, actualLine, filePath, lineNumber },
							imagePath: this.image.path
						});
					}
					oldLine = actualLine;
				}
			}
			
			const lineIndex = lineNumber - 1;
			let newLine = oldLine;
			let oldDisplayText = '';
			let oldWidth: number | undefined;
			let oldHeight: number | undefined;
			
			// 匹配格式
			const wikiWithExclamMatch = oldLine.match(/!\[\[([^|]+)(?:\|([^\]]+))?\]\]/);
			const wikiNoExclamMatch = oldLine.match(/(?:^|[^!])\[\[([^|]+)(?:\|([^\]]+))?\]\]/);
			const markdownMatch = oldLine.match(/!\[([^\]]*)\]\(([^)]+)\)/);
			const htmlMatch = oldLine.match(/<img\s+([^>]*)\s*\/?>/i);
			
			// 调试日志（仅在DEBUG模式下记录）
			if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
				await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, '匹配结果', {
					details: {
						oldLine,
						newDisplayText,
						newWidth,
						newHeight,
						wikiWithExclamMatch: wikiWithExclamMatch ? { path: wikiWithExclamMatch[1], text: wikiWithExclamMatch[2] } : null,
						wikiNoExclamMatch: wikiNoExclamMatch ? { path: wikiNoExclamMatch[1], text: wikiNoExclamMatch[2] } : null,
						markdownMatch: markdownMatch ? { alt: markdownMatch[1], path: markdownMatch[2] } : null,
						htmlMatch: htmlMatch ? 'matched' : null
					},
					imagePath: this.image.path
				});
			}
			
			// 处理不同格式
			if (wikiWithExclamMatch) {
				// Wiki 格式（带!）
				const parsed = parseWikiLink(wikiWithExclamMatch[0]);
				oldDisplayText = parsed.displayText || '';
				oldWidth = parsed.width;
				oldHeight = parsed.height;
				
				const newParts: WikiLinkParts = {
					path: parsed.path,
					displayText: newDisplayText || '',
					width: newWidth !== undefined ? newWidth : parsed.width,
					height: newHeight !== undefined ? newHeight : parsed.height
				};
				
				const newLink = buildWikiLink(newParts, true);
				newLine = oldLine.replace(/!\[\[([^\]]+)\]\]/, newLink);
				
				// 调试日志
				if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
					await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, 'Wiki 格式匹配（带!）', {
						details: { parsed, oldDisplayText, newDisplayText, newParts, oldLine, newLine },
						imagePath: this.image.path
					});
				}
			} else if (wikiNoExclamMatch) {
				// Wiki 格式（不带!）
				const beforeMatch = oldLine.substring(0, wikiNoExclamMatch.index || 0);
				if (!beforeMatch.endsWith('!')) {
					const parsed = parseWikiLink(wikiNoExclamMatch[0]);
					oldDisplayText = parsed.displayText || '';
					oldWidth = parsed.width;
					oldHeight = parsed.height;
					
					const newParts: WikiLinkParts = {
						path: parsed.path,
						displayText: newDisplayText || '',
						width: newWidth !== undefined ? newWidth : parsed.width,
						height: newHeight !== undefined ? newHeight : parsed.height
					};
					
					const newLink = buildWikiLink(newParts, false);
					const beforeLink = beforeMatch;
					const afterLink = oldLine.substring((wikiNoExclamMatch.index || 0) + wikiNoExclamMatch[0].length);
					newLine = beforeLink + newLink + afterLink;
					
					// 调试日志
					if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
						await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, 'Wiki 格式匹配（不带!）', {
							details: { parsed, oldDisplayText, newDisplayText, newParts, oldLine, newLine },
							imagePath: this.image.path
						});
					}
				}
			} else if (markdownMatch) {
				// Markdown 格式
				const oldAlt = markdownMatch[1] || '';
				const path = markdownMatch[2];
				oldDisplayText = oldAlt;
				
				const newAlt = (newDisplayText && newDisplayText.trim() !== '') ? newDisplayText : this.image.name;
				const escapedAlt = newAlt.replace(/\]/g, '\\]').replace(/\(/g, '\\(');
				newLine = oldLine.replace(/!\[([^\]]*)\]\(([^)]+)\)/, `![${escapedAlt}](${path})`);
			} else if (htmlMatch) {
				// HTML 格式
				const attributes = htmlMatch[1];
				const isSelfClosing = oldLine.trim().endsWith('/>');
				
				const srcMatch = attributes.match(/src\s*=\s*(["'])([^"']+)\1/i);
				if (srcMatch) {
					const srcQuote = srcMatch[1];
					const srcPath = srcMatch[2];
					
					const altMatch = attributes.match(/alt\s*=\s*(["'])([^"']*)\1/i);
					oldDisplayText = altMatch ? altMatch[2] : '';
					
					const oldSize = parseHtmlImageSize(oldLine);
					oldWidth = oldSize.width;
					oldHeight = oldSize.height;
					
					const newAlt = (newDisplayText && newDisplayText.trim() !== '') ? newDisplayText : this.image.name;
					const escapedAlt = newAlt
						.replace(/&/g, '&amp;')
						.replace(/</g, '&lt;')
						.replace(/>/g, '&gt;');
					const altQuote = srcQuote;
					const finalAlt = altQuote === '"' 
						? escapedAlt.replace(/"/g, '&quot;')
						: escapedAlt.replace(/'/g, '&#39;');
					
					// 解析其他属性
					const attrPattern = /(\w+)\s*=\s*(["'])([^"']*)\2/gi;
					const otherAttrs: Array<{name: string, value: string, quote: string}> = [];
					let match;
					
					while ((match = attrPattern.exec(attributes)) !== null) {
						const attrName = match[1].toLowerCase();
						if (attrName !== 'src' && attrName !== 'alt' && attrName !== 'width' && attrName !== 'height') {
							otherAttrs.push({
								name: match[1],
								value: match[3],
								quote: match[2]
							});
						}
					}
					
					// 构建新属性
					const attrParts: string[] = [
						`src=${srcQuote}${srcPath}${srcQuote}`,
						`alt=${altQuote}${finalAlt}${altQuote}`
					];
					
					const finalWidth = newWidth !== undefined ? newWidth : oldWidth;
					const finalHeight = newHeight !== undefined ? newHeight : oldHeight;
					
					if (finalWidth !== undefined) {
						attrParts.push(`width=${srcQuote}${finalWidth}${srcQuote}`);
					}
					if (finalHeight !== undefined) {
						attrParts.push(`height=${srcQuote}${finalHeight}${srcQuote}`);
					}
					
					for (const attr of otherAttrs) {
						attrParts.push(`${attr.name}=${attr.quote}${attr.value}${attr.quote}`);
					}
					
					const newAttributes = attrParts.join(' ');
					const closingTag = isSelfClosing ? ' />' : '>';
					
					newLine = oldLine.replace(/<img\s+[^>]*\/?>/i, `<img ${newAttributes}${closingTag}`);
				}
			} else {
				// 未知格式
				if (this.plugin?.logger) {
					await this.plugin.logger.warn(OperationType.UPDATE_DISPLAY_TEXT, '无法匹配链接格式', {
						details: { matchType, oldLine },
						imagePath: this.image.path
					});
				}
				new Notice(`无法识别链接格式: ${matchType}`);
				return false;
			}
			
			// 检查是否有实际变化
			if (newLine === oldLine) {
				if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
					await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, '显示文本没有变化', {
						details: { oldLine, newLine, matchType, newDisplayText },
						imagePath: this.image.path
					});
				}
				new Notice('显示文本没有变化');
				return false;
			}
			
			// 调试日志
			if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
				await this.plugin.logger.debug(OperationType.UPDATE_DISPLAY_TEXT, '显示文本更新（准备保存）', {
					details: { matchType, oldLine, newLine, oldDisplayText, newDisplayText, changed: newLine !== oldLine },
					imagePath: this.image.path
				});
			}
			
			// 更新行内容
			lines[lineIndex] = newLine;
			
			// 保存文件
			await this.app.vault.modify(file, lines.join('\n'));
			
			// 同步更新插件主缓存
			if (this.plugin && typeof (this.plugin as any).updateDisplayTextCache === 'function') {
				(this.plugin as any).updateDisplayTextCache(filePath, lineNumber, newDisplayText || '', newLine);
			}
			
			// 刷新已打开的文件视图
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			for (const leaf of leaves) {
				const view = leaf.view as any;
				if (view && view.file && view.file.path === filePath) {
					try {
						this.app.metadataCache.trigger('changed', file);
						if (typeof view.load === 'function') {
							await view.load();
						}
					} catch (e) {
						if (this.plugin?.logger) {
							await this.plugin.logger.warn(OperationType.UPDATE_DISPLAY_TEXT, '刷新文件视图失败', {
								error: e as Error,
								imagePath: this.image.path
							});
						}
					}
				}
			}
			
			// 记录历史
			if (this.historyManager) {
				await this.historyManager.saveHistory({
					timestamp: Date.now(),
					action: 'reference',
					fromPath: this.image.path,
					toPath: this.image.path,
					referencePath: filePath,
					lineNumber: lineNumber,
					oldDisplayText: oldDisplayText || '(无)',
					newDisplayText: newDisplayText || '(无)'
				});
			}
			
			// 记录日志
			if (this.plugin?.logger) {
				let oldLink = '';
				let newLink = '';
				
				if (wikiWithExclamMatch || wikiNoExclamMatch) {
					const parsed = wikiWithExclamMatch ? parseWikiLink(wikiWithExclamMatch[0]) : parseWikiLink(wikiNoExclamMatch![0]);
					oldLink = buildWikiLink({ path: parsed.path, displayText: oldDisplayText, width: oldWidth, height: oldHeight }, !!wikiWithExclamMatch);
					const newParts: WikiLinkParts = {
						path: parsed.path,
						displayText: newDisplayText || '',
						width: newWidth !== undefined ? newWidth : oldWidth,
						height: newHeight !== undefined ? newHeight : oldHeight
					};
					newLink = buildWikiLink(newParts, !!wikiWithExclamMatch);
				} else if (markdownMatch) {
					oldLink = `![${oldDisplayText}](${markdownMatch[2]})`;
					const newAlt = (newDisplayText && newDisplayText.trim() !== '') ? newDisplayText : this.image.name;
					newLink = `![${newAlt}](${markdownMatch[2]})`;
				} else if (htmlMatch) {
					oldLink = oldLine.match(/<img[^>]+>/i)?.[0] || '';
					newLink = newLine.match(/<img[^>]+>/i)?.[0] || '';
				}
				
				const logMessage = `更新显示文本：${oldDisplayText || '(无)'} → ${newDisplayText || '(无)'}`;
				await this.plugin.logger.info(
					OperationType.UPDATE_DISPLAY_TEXT,
					logMessage,
					{
						imageHash: this.image.md5,
						imagePath: this.image.path,
						imageName: this.image.name,
						details: {
							filePath,
							lineNumber,
							matchType,
							oldDisplayText: oldDisplayText || '',
							newDisplayText: newDisplayText || '',
							oldLink,
							newLink
						}
					}
				);
			}
			
			return true;
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.error(
					OperationType.UPDATE_DISPLAY_TEXT,
					'保存显示文本失败',
					{
						error: error as Error,
						imagePath: this.image.path,
						details: { filePath, lineNumber }
					}
				);
			}
			throw error;
		}
	}
}

