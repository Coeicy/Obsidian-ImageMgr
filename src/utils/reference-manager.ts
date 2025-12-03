/**
 * 引用管理模块
 * 
 * 负责图片引用的查询、解析和更新功能。
 * 
 * 功能：
 * - 查找图片在笔记中的所有引用
 * - 解析 Wiki 链接、Markdown 链接和 HTML img 标签
 * - 更新笔记中的图片引用（重命名后自动更新）
 * - 监听文件重命名事件
 * 
 * 智能识别特性：
 * - 自动排除代码块（```）和行内代码（`）中的链接
 * - 只识别图片链接，排除笔记链接（检查图片扩展名）
 * - 实时更新：直接读取文件内容，确保识别最新添加的链接
 * 
 * 支持的链接格式：
 * - Wiki 链接：`![[image.png]]`、`![[image.png|显示文本]]`、`![[image.png|100x200]]`
 * - Markdown 链接：`![alt](image.png)`
 * - HTML 标签：`<img src="image.png">`
 */

import { App, TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { PathValidator } from './path-validator';
import ImageManagementPlugin from '../main';
import { OperationType } from './logger';

/**
 * Wiki 链接解析结果接口
 * 
 * 解析 Wiki 链接中的路径、显示文本和尺寸信息。
 * 
 * 支持的格式：
 * - `![[path]]` - 无显示文本和尺寸
 * - `![[path|100]]` - 仅尺寸（宽度）
 * - `![[path|100x200]]` - 仅尺寸（宽x高）
 * - `![[path|显示文本]]` - 仅显示文本
 * - `![[path|显示文本|100x200]]` - 显示文本和尺寸
 */
export interface WikiLinkParts {
	/** 图片路径 */
	path: string;
	/** 显示文本（可选） */
	displayText: string;
	/** 宽度（像素，可选） */
	width?: number;
	/** 高度（像素，可选） */
	height?: number;
}

/**
 * 解析 Wiki 链接字符串
 * 
 * @param linkContent - Wiki 链接字符串（如 `![[path|text|size]]`）
 * @returns 解析后的链接部分
 * 
 * @example
 * ```typescript
 * parseWikiLink('![[image.png|标题|100x200]]');
 * // { path: 'image.png', displayText: '标题', width: 100, height: 200 }
 * ```
 */
export function parseWikiLink(linkContent: string): WikiLinkParts {
	const parts: WikiLinkParts = {
		path: '',
		displayText: ''
	};

	// 匹配格式：![[path|...]] 或 [[path|...]]
	const match = linkContent.match(/!?\[\[([^\]]+)\]\]/);
	if (!match) {
		return parts;
	}

	const fullContent = match[1]; // path|text|size 或 path|text 或 path|size 或 path
	const segments = fullContent.split('|');

	if (segments.length === 0) {
		return parts;
	}

	parts.path = segments[0].trim();

	// 尺寸格式检测：纯数字（如 "100"）或 数字x数字（如 "100x200"）
	const sizePattern = /^(\d+)(?:x(\d+))?$/;

	// 处理后面的部分
	if (segments.length === 1) {
		// 只有路径，没有显示文本和尺寸
		return parts;
	} else if (segments.length === 2) {
		// 可能是：path|text 或 path|size
		const secondPart = segments[1].trim();
		const sizeMatch = secondPart.match(sizePattern);
		if (sizeMatch) {
			// 是尺寸格式
			parts.width = parseInt(sizeMatch[1], 10);
			if (sizeMatch[2]) {
				parts.height = parseInt(sizeMatch[2], 10);
			}
		} else {
			// 是显示文本
			parts.displayText = secondPart;
		}
	} else {
		// 多个部分：path|text|size 或 path|size|text（优先假设是 text|size）
		// 检查哪个是尺寸，哪个是文本
		for (let i = 1; i < segments.length; i++) {
			const part = segments[i].trim();
			const sizeMatch = part.match(sizePattern);
			if (sizeMatch && !parts.width) {
				// 找到尺寸（只取第一个匹配的尺寸）
				parts.width = parseInt(sizeMatch[1], 10);
				if (sizeMatch[2]) {
					parts.height = parseInt(sizeMatch[2], 10);
				}
			} else if (!parts.displayText) {
				// 不是尺寸，且还没有显示文本，则作为显示文本
				parts.displayText = part;
			}
		}
	}

	return parts;
}

/**
 * 构建 Wiki 链接字符串
 * 
 * 根据提供的部分构建完整的 Wiki 链接。
 * 
 * @param parts - Wiki 链接的各个部分
 * @param withExclam - 是否添加感叹号前缀（图片嵌入需要）
 * @returns 构建的 Wiki 链接字符串
 * 
 * @example
 * ```typescript
 * buildWikiLink({ path: 'image.png', displayText: '标题', width: 100 }, true);
 * // '![[image.png|标题|100]]'
 * ```
 */
export function buildWikiLink(parts: WikiLinkParts, withExclam: boolean = true): string {
	const prefix = withExclam ? '!' : '';
	let content = parts.path;

	// 如果有显示文本，先添加显示文本
	if (parts.displayText) {
		content += `|${parts.displayText}`;
	}

	// 如果有尺寸，添加尺寸
	if (parts.width) {
		if (parts.height) {
			content += `|${parts.width}x${parts.height}`;
		} else {
			content += `|${parts.width}`;
		}
	}

	return `${prefix}[[${content}]]`;
}

/**
 * 解析 HTML img 标签中的尺寸信息
 * @param htmlTag - HTML img 标签字符串
 * @returns 包含 width 和 height 的对象
 */
export function parseHtmlImageSize(htmlTag: string): { width?: number; height?: number } {
	// 匹配 width="100" 或 width='100' 或 width=100（支持大小写不敏感和空格）
	const widthMatch = htmlTag.match(/width\s*=\s*["']?(\d+)["']?/i);
	// 匹配 height="200" 或 height='200' 或 height=200（支持大小写不敏感和空格）
	const heightMatch = htmlTag.match(/height\s*=\s*["']?(\d+)["']?/i);
	
	return {
		width: widthMatch ? parseInt(widthMatch[1], 10) : undefined,
		height: heightMatch ? parseInt(heightMatch[1], 10) : undefined
	};
}

export class ReferenceManager {
	private fileRenameListeners: Set<(oldPath: string, newPath: string) => Promise<void>> = new Set();
	/** 用于防止重复处理同一个重命名事件（使用时间戳防止短时间内重复处理） */
	private static recentRenames: Map<string, number> = new Map();
	/** rename 事件处理函数引用，用于清理 */
	private renameHandler: ((file: any, oldPath: string) => Promise<void>) | null = null;

	constructor(private app: App, private plugin?: ImageManagementPlugin) {
		// 创建事件处理函数
		this.renameHandler = async (file: any, oldPath: string) => {
			try {
				if (file && file instanceof TFile && file.extension && file.extension.match(/png|jpg|jpeg|gif|webp/i)) {
					await this.handleFileRename(oldPath, file.path);
				}
			} catch (err) {
				console.error('[ReferenceManager] 文件重命名处理错误:', err);
			}
		};
		
		// 监听文件重命名事件
		this.app.vault.on('rename', this.renameHandler);
	}
	
	/**
	 * 清理事件监听器（插件卸载时调用）
	 */
	cleanup() {
		if (this.renameHandler) {
			this.app.vault.off('rename', this.renameHandler);
			this.renameHandler = null;
		}
	}

	/**
	 * 解析链接路径（支持相对路径）
	 */
	resolveLinkPath(linkPath: string, sourcePath: string): string {
		// 使用官方 API 解析链接
		const destFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
		return destFile ? destFile.path : '';
	}

	/**
	 * 计算从笔记到图片的相对路径
	 * @param notePath - 笔记文件路径
	 * @param imagePath - 图片文件路径
	 * @returns 相对路径
	 */
	calculateRelativePath(notePath: string, imagePath: string): string {
		const noteDir = notePath.includes('/') 
			? notePath.substring(0, notePath.lastIndexOf('/'))
			: '';
		const imageDir = imagePath.includes('/')
			? imagePath.substring(0, imagePath.lastIndexOf('/'))
			: '';
		const imageName = imagePath.split('/').pop() || imagePath;

		if (noteDir === imageDir) {
			// 同一目录，使用文件名
			return imageName;
		}

		// 计算相对路径
		const noteParts = noteDir ? noteDir.split('/') : [];
		const imageParts = imageDir ? imageDir.split('/') : [];

		// 找到共同前缀
		let commonLength = 0;
		while (commonLength < noteParts.length && 
			   commonLength < imageParts.length && 
			   noteParts[commonLength] === imageParts[commonLength]) {
			commonLength++;
		}

		// 构建相对路径
		const upCount = noteParts.length - commonLength;
		const downParts = imageParts.slice(commonLength);

		let relativePath = '';
		for (let i = 0; i < upCount; i++) {
			relativePath += '../';
		}
		if (downParts.length > 0) {
			relativePath += downParts.join('/') + '/';
		}
		relativePath += imageName;

		return relativePath;
	}

	/**
	 * 检查指定行号是否在代码块内（包括代码块和行内代码）
	 * @param file - 文件对象
	 * @param lineIndex - 行号（0-based）
	 * @param lineContent - 行内容（用于检查行内代码）
	 * @param allLines - 所有行内容（可选，用于手动解析代码块）
	 * @returns 是否在代码块内
	 */
	async isInCodeBlock(file: any, lineIndex: number, lineContent: string, allLines?: string[]): Promise<boolean> {
		try {
			// 首先检查行内代码（使用反引号包裹的内容）
			// 这个检查很快，不需要依赖 metadataCache
			if (this.isInlineCode(lineContent)) {
				return true;
			}

			const cache = this.app.metadataCache.getFileCache(file);
			
			// 检查是否在代码块 section 中（使用 metadataCache，性能最好）
			if (cache && cache.sections) {
				for (const section of cache.sections) {
					// section.position 是 { start: { line, col }, end: { line, col } }
					const startLine = section.position.start.line;
					const endLine = section.position.end.line;
					
					// 如果行号在代码块 section 的范围内
					if (lineIndex >= startLine && lineIndex <= endLine) {
						// 检查 section 类型是否为代码块
						if (section.type === 'code') {
							return true;
						}
					}
				}
				// 如果 metadataCache 可用且已检查完毕，直接返回 false
				return false;
			}

			// 如果无法使用 metadataCache，且有所有行内容，使用手动解析作为后备方案
			if (allLines && allLines.length > 0) {
				return this.isInCodeBlockManualSync(lineIndex, allLines);
			}

			// 如果既没有 metadataCache 也没有行内容，返回 false（保守处理）
			return false;
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '检查代码块失败', {
					error: error as Error
				});
			}
			return false;
		}
	}

	/**
	 * 同步手动解析代码块（用于后备方案）
	 * 通过扫描行内容来检测代码块
	 */
	private isInCodeBlockManualSync(lineIndex: number, allLines: string[]): boolean {
		try {
			if (!allLines || lineIndex < 0 || lineIndex >= allLines.length) {
				return false;
			}

			// 从文件开头扫描到当前行，检查代码块标记
			let inCodeBlock = false;
			let codeBlockMarker = '';

			for (let i = 0; i <= lineIndex; i++) {
				const line = allLines[i];
				const trimmed = line.trim();

				// 检查代码块开始标记 ``` 或 ~~~
				if (trimmed.startsWith('```')) {
					const marker = trimmed.match(/^`{3,}/)?.[0] || '';
					if (marker.length >= 3) {
						if (!inCodeBlock) {
							// 开始代码块
							inCodeBlock = true;
							codeBlockMarker = marker;
						} else if (marker === codeBlockMarker) {
							// 结束代码块
							inCodeBlock = false;
							codeBlockMarker = '';
						}
					}
				} else if (trimmed.startsWith('~~~')) {
					const marker = trimmed.match(/^~{3,}/)?.[0] || '';
					if (marker.length >= 3) {
						if (!inCodeBlock) {
							// 开始代码块
							inCodeBlock = true;
							codeBlockMarker = marker;
						} else if (marker === codeBlockMarker) {
							// 结束代码块
							inCodeBlock = false;
							codeBlockMarker = '';
						}
					}
				}
			}

			return inCodeBlock;
		} catch (error) {
			// 同步方法中不能使用 await，使用非阻塞方式记录日志
			if (this.plugin?.logger) {
				this.plugin.logger.error(OperationType.PLUGIN_ERROR, '同步手动解析代码块失败', {
					error: error as Error
				}).catch(() => {
					// 忽略日志记录错误
				});
			}
			return false;
		}
	}

	/**
	 * 检查行内容是否包含行内代码
	 * 检查图片引用是否被行内代码反引号包裹
	 */
	private isInlineCode(lineContent: string): boolean {
		// 检查整行是否被反引号包裹（行内代码）
		// 例如：`![[image.png]]` 或 `![alt](image.png)`
		
		// 移除首尾空白
		const trimmed = lineContent.trim();
		
		// 检查是否以反引号开始和结束（单个反引号对，行内代码）
		if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
			const backtickCount = trimmed.match(/^`+/)?.[0].length || 0;
			// 单个反引号表示行内代码
			if (backtickCount === 1) {
				return true;
			}
			// 三个反引号表示代码块标记（但这种情况通常由 section 检测处理）
			if (backtickCount === 3) {
				return true;
			}
		}

		// 检查图片引用模式是否被行内代码包裹
		// 匹配：`...![[...]]...` 或 `...![...](...)...` 或 `...<img...>...`
		// 注意：需要确保反引号成对出现，且图片引用在反引号内部
		const patterns = [
			// Wiki 格式：`![[...]]` 或 `[[...]]`
			/`[^`]*!?\[\[[^\]]*\]\][^`]*`/,
			// Markdown 格式：`![...](...)`
			/`[^`]*!\[[^\]]*\]\([^)]*\)[^`]*`/,
			// HTML 格式：`<img...>`
			/`[^`]*<img[^>]*>[^`]*`/
		];
		
		for (const pattern of patterns) {
			if (pattern.test(lineContent)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * 更新笔记中的图片引用链接
	 */
	async updateReferencesInNotes(
		oldPath: string,
		newPath: string,
		oldName: string,
		newName: string
	): Promise<{ updatedCount: number; referencedFiles: string[] }> {
		try {
			const allFiles = this.app.vault.getMarkdownFiles();
			let updatedCount = 0;
			let debugInfo: string[] = [];
			const referencedFiles: string[] = [];

			// 调试日志（仅在DEBUG模式下记录）
			if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
				await this.plugin.logger.debug(OperationType.UPDATE_REFERENCE, '更新引用链接', {
					details: { oldPath, newPath, oldName, newName }
				});
			}

			// 先统计引用数量（不进行实际更新）
			// 使用更精确的匹配方式，避免误匹配
			const escapedOldPath = PathValidator.escapeRegex(oldPath);
			const escapedOldName = PathValidator.escapeRegex(oldName);
			
			for (const file of allFiles) {
				try {
					const content = await this.app.vault.read(file);
					const lines = content.split('\n');

					for (let i = 0; i < lines.length; i++) {
						const line = lines[i];
						
						// 检查是否在代码块内，如果是则跳过
						if (await this.isInCodeBlock(file, i, line, lines)) {
							continue;
						}
						
						// 使用正则表达式精确匹配，避免误匹配
						// 匹配 Wiki 格式: [[path]] 或 ![[path]]
						const wikiPattern = new RegExp(`\\[\\[.*?(?:${escapedOldPath}|${escapedOldName}).*?\\]\\]`, 'i');
						// 匹配 Markdown 格式: ![alt](path)
						const markdownPattern = new RegExp(`!\\[.*?\\]\\((?:${escapedOldPath}|${escapedOldName})(?:\\?[^)]*)?\\)`, 'i');
						// 匹配 HTML 格式: <img src="path">
						const htmlPattern = new RegExp(`<img[^>]+src\\s*=\\s*["'](?:${escapedOldPath}|${escapedOldName})(?:\\?[^"']*)?["']`, 'i');
						
						if (wikiPattern.test(line) || markdownPattern.test(line) || htmlPattern.test(line)) {
							referencedFiles.push(file.path);
							break; // 每个文件只记录一次
						}
					}
				} catch (error) {
					if (this.plugin?.logger) {
						await this.plugin.logger.error(OperationType.UPDATE_REFERENCE, `统计引用失败: ${file.path}`, {
							error: error as Error
						});
					}
				}
			}

			// 始终自动更新所有引用

			for (const file of allFiles) {
				try {
					const content = await this.app.vault.read(file);
					const lines = content.split('\n');
					let modified = false;

					for (let i = 0; i < lines.length; i++) {
						const line = lines[i];
						
						// 检查是否在代码块内，如果是则跳过
						if (await this.isInCodeBlock(file, i, line, lines)) {
							continue;
						}
						
						let newLine = line;

						// 使用正则表达式精确匹配，避免误匹配
						const escapedOldPath = PathValidator.escapeRegex(oldPath);
						const escapedOldName = PathValidator.escapeRegex(oldName);
						
						// 检查是否包含旧路径或旧文件名（使用精确匹配）
						const wikiPattern = new RegExp(`\\[\\[.*?(?:${escapedOldPath}|${escapedOldName}).*?\\]\\]`, 'i');
						const markdownPattern = new RegExp(`!\\[.*?\\]\\((?:${escapedOldPath}|${escapedOldName})(?:\\?[^)]*)?\\)`, 'i');
						const htmlPattern = new RegExp(`<img[^>]+src\\s*=\\s*["'](?:${escapedOldPath}|${escapedOldName})(?:\\?[^"']*)?["']`, 'i');
						
						const hasMatch = wikiPattern.test(line) || markdownPattern.test(line) || htmlPattern.test(line);

						if (hasMatch) {
							// 调试日志（仅在DEBUG模式下记录）
							if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
								await this.plugin.logger.debug(OperationType.UPDATE_REFERENCE, `检查文件 ${file.path} 第 ${i + 1} 行`, {
									details: { line }
								});
							}

							// 更新各种格式的图片引用
							// 1. Wiki 格式（带!）: ![[path]] 或 ![[path|text]] 或 ![[path|text|size]]
							// 使用 parseWikiLink 和 buildWikiLink 正确保留显示文本和尺寸
							const wikiWithExclamPattern = /!\[\[([^\]]+)\]\]/g;
							let wikiMatch;
							while ((wikiMatch = wikiWithExclamPattern.exec(newLine)) !== null) {
								const fullMatch = wikiMatch[0];
								const parsed = parseWikiLink(fullMatch);
								
								// 检查路径是否匹配（支持完整路径、仅文件名、相对路径）
								// 使用 metadataCache 解析链接实际指向的文件
								const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(parsed.path, file.path);
								const resolvedPath = resolvedFile?.path || '';
								
								// 匹配条件：解析后的路径等于旧路径，或者链接路径直接匹配旧路径/旧文件名
								const isMatch = resolvedPath === oldPath || 
									parsed.path === oldPath || 
									parsed.path === oldName ||
									parsed.path.endsWith('/' + oldName) ||
									parsed.path.endsWith('../' + oldName);
								
								if (isMatch) {
									// 重建链接，保留显示文本和尺寸
									// 保持原有的路径格式（相对/绝对/简短）
									let newLinkPath = newPath;
									
									// 如果原链接使用相对路径，保持相对路径格式
									if (parsed.path.startsWith('../') || parsed.path.startsWith('./')) {
										// 计算新的相对路径
										newLinkPath = this.calculateRelativePath(file.path, newPath);
									} else if (!parsed.path.includes('/')) {
										// 原链接只有文件名，新链接也只用文件名
										newLinkPath = newName;
									}
									
									const newParts: WikiLinkParts = {
										path: newLinkPath,
										displayText: parsed.displayText,
										width: parsed.width,
										height: parsed.height
									};
									const newLink = buildWikiLink(newParts, true);
									newLine = newLine.replace(fullMatch, newLink);
									// 重置正则表达式索引，因为字符串已改变
									wikiWithExclamPattern.lastIndex = 0;
								}
							}

							// 2. Wiki 格式（不带!）: [[path]] 或 [[path|text]] 或 [[path|text|size]]
							// 需要确保前面没有 !
							const wikiNoExclamPattern = /(?:^|[^!])\[\[([^\]]+)\]\]/g;
							while ((wikiMatch = wikiNoExclamPattern.exec(newLine)) !== null) {
								// 提取实际的 [[...]] 部分
								const fullMatchWithPrefix = wikiMatch[0];
								const prefix = fullMatchWithPrefix.startsWith('[[') ? '' : fullMatchWithPrefix[0];
								const linkPart = prefix ? fullMatchWithPrefix.slice(1) : fullMatchWithPrefix;
								
								const parsed = parseWikiLink(linkPart);
								
								// 检查路径是否匹配（支持完整路径、仅文件名、相对路径）
								const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(parsed.path, file.path);
								const resolvedPath = resolvedFile?.path || '';
								
								const isMatch = resolvedPath === oldPath || 
									parsed.path === oldPath || 
									parsed.path === oldName ||
									parsed.path.endsWith('/' + oldName) ||
									parsed.path.endsWith('../' + oldName);
								
								if (isMatch) {
									// 重建链接，保留显示文本和尺寸
									let newLinkPath = newPath;
									
									// 如果原链接使用相对路径，保持相对路径格式
									if (parsed.path.startsWith('../') || parsed.path.startsWith('./')) {
										newLinkPath = this.calculateRelativePath(file.path, newPath);
									} else if (!parsed.path.includes('/')) {
										newLinkPath = newName;
									}
									
									const newParts: WikiLinkParts = {
										path: newLinkPath,
										displayText: parsed.displayText,
										width: parsed.width,
										height: parsed.height
									};
									const newLink = buildWikiLink(newParts, false);
									newLine = newLine.replace(linkPart, newLink);
									// 重置正则表达式索引
									wikiNoExclamPattern.lastIndex = 0;
								}
							}

							// 5. ![alt](oldPath) 或 ![alt](oldName) - Markdown格式
							if (newLine.match(/!\[.*\]\(.*\)/)) {
								// 匹配完整的Markdown图片格式，处理查询参数
								newLine = newLine.replace(
									new RegExp(
										`!\\[[^\\]]*\\]\\((?:${PathValidator.escapeRegex(oldPath)}|${PathValidator.escapeRegex(oldName)})(?:\\?[^)]*)?\\)`,
										'g'
									),
									(match) => {
										// 保留alt文本，只替换路径部分
										const altMatch = match.match(/!\[([^\]]*)\]/);
										const altText = altMatch ? altMatch[1] : '图片';
										return `![${altText}](${newPath})`;
									}
								);
							}

							// 6. <img src="oldPath"> 或 <img src="oldName"> - HTML格式（处理查询参数和属性）
							// 同时处理双引号和单引号格式
							if (newLine.match(/<img[^>]+src\s*=\s*["'][^"']*["']/i)) {
								// 匹配HTML img标签，处理各种属性格式和查询参数
								// 双引号格式: <img ... src="path?query">
								const imgPatternDouble = new RegExp(
									`<img([^>]*?)src\\s*=\\s*["'](?:${PathValidator.escapeRegex(oldPath)}|${PathValidator.escapeRegex(oldName)})(?:\\?[^"']*)?["']([^>]*)>`,
									'gi'
								);
								newLine = newLine.replace(imgPatternDouble, (match, beforeSrc, afterSrc) => {
									// 保留其他属性，只替换src路径（移除查询参数）
									const quote = match.includes('src="') ? '"' : "'";
									return `<img${beforeSrc}src=${quote}${newPath}${quote}${afterSrc}>`;
								});
							}

							if (newLine !== line) {
								// 调试日志（仅在DEBUG模式下记录）
								if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
									await this.plugin.logger.debug(OperationType.UPDATE_REFERENCE, `更新文件 ${file.path} 第 ${i + 1} 行`, {
										details: { oldLine: line, newLine }
									});
								}
								lines[i] = newLine;
								modified = true;
								debugInfo.push(`${file.path}:${i + 1}`);
							}
						}
					}

					if (modified) {
						await this.app.vault.modify(file, lines.join('\n'));
						updatedCount++;
					}
				} catch (error) {
					if (this.plugin?.logger) {
						await this.plugin.logger.error(OperationType.UPDATE_REFERENCE, `更新文件失败: ${file.path}`, {
							error: error as Error
						});
					}
				}
			}

			if (updatedCount > 0) {
				// 调试日志（仅在DEBUG模式下记录）
				if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
					await this.plugin.logger.debug(OperationType.UPDATE_REFERENCE, '更新了以下文件', {
						details: { updatedFiles: debugInfo }
					});
				}
				new Notice(`已更新 ${updatedCount} 个笔记中的图片引用`);
			} else {
				// 调试日志（仅在DEBUG模式下记录）
				if (this.plugin?.logger && this.plugin.settings.enableDebugLog) {
					await this.plugin.logger.debug(OperationType.UPDATE_REFERENCE, '没有找到需要更新的引用');
				}
			}

			return { updatedCount, referencedFiles };
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.error(OperationType.UPDATE_REFERENCE, '更新引用失败', {
					error: error as Error
				});
			}
			new Notice('更新引用失败: ' + error);
			return { updatedCount: 0, referencedFiles: [] };
		}
	}

	/**
	 * 查找图片引用（使用 Obsidian 官方 MetadataCache API 和直接扫描）
	 * 优化：优先使用 metadataCache，减少文件读取
	 */
	async findImageReferences(imagePath: string, imageName: string): Promise<
		Array<{
			filePath: string;
			context: string;
			lineNumber: number;
			displayText: string;
			matchType: string;
			fullLine: string;
		}>
	> {
		const references: Array<{
			filePath: string;
			context: string;
			lineNumber: number;
			displayText: string;
			matchType: string;
			fullLine: string;
		}> = [];
		const metadataCache = this.app.metadataCache;

		// 使用 Set 存储已处理的引用位置，避免重复
		const processedPositions = new Set<string>();
		
		// 使用 Map 缓存文件内容，避免重复读取
		const fileContentCache = new Map<string, string[]>();

		// 使用官方 API 获取所有包含此图片引用的文件
		const allFiles = this.app.vault.getMarkdownFiles();

		// 不使用延迟，直接读取文件内容以确保实时性
		// metadataCache 可能有缓存延迟，直接读取文件更可靠

		// 首先收集所有需要读取的文件（基于 metadataCache）
		const filesToRead = new Set<string>();
		
		for (const file of allFiles) {
			try {
				const cache = metadataCache.getFileCache(file);
				if (!cache) continue;

				// 检查 embeds 和 links，收集需要读取的文件
				if (cache.embeds || cache.links) {
					filesToRead.add(file.path);
				}
			} catch (error) {
				if (this.plugin?.logger) {
					await this.plugin.logger.error(OperationType.PLUGIN_ERROR, `获取文件缓存失败: ${file.path}`, {
						error: error as Error
					});
				}
			}
		}

		// 批量读取文件内容（如果需要）
		if (filesToRead.size > 0) {
			// 并行读取文件（限制并发数，避免资源耗尽）
			const readPromises = Array.from(filesToRead).slice(0, 50).map(async (filePath) => {
				try {
					const file = this.app.vault.getMarkdownFiles().find(f => f.path === filePath);
					if (file) {
						const content = await this.app.vault.read(file);
						fileContentCache.set(filePath, content.split('\n'));
					}
				} catch (error) {
					if (this.plugin?.logger) {
						await this.plugin.logger.error(OperationType.PLUGIN_ERROR, `读取文件失败: ${filePath}`, {
							error: error as Error
						});
					}
				}
			});
			
			await Promise.all(readPromises);
		}

		// 处理引用
		for (const file of allFiles) {
			try {
				const cache = metadataCache.getFileCache(file);
				if (!cache) continue;

				// 从缓存获取文件内容
				let lines = fileContentCache.get(file.path);
				if (!lines) {
					try {
						const content = await this.app.vault.read(file);
						lines = content.split('\n');
						fileContentCache.set(file.path, lines);
					} catch (error) {
						if (this.plugin?.logger) {
							await this.plugin.logger.error(OperationType.PLUGIN_ERROR, `读取文件失败: ${file.path}`, {
								error: error as Error
							});
						}
						continue;
					}
				}

				// 检查 embeds（图片嵌入）- 只处理带!的图片链接
				if (cache.embeds) {
					for (const embed of cache.embeds) {
						// 解析链接目标
						const destPath = this.resolveLinkPath(embed.link, file.path);
						if (destPath === imagePath) {
							// 生成唯一标识（使用行号和偏移量，确保同一行的多个引用都能被记录）
							const positionKey = `${file.path}:${embed.position.start.line}:${embed.position.start.offset || 0}:${embed.position.end.offset || 0}`;
							if (!processedPositions.has(positionKey)) {
								processedPositions.add(positionKey);
								
								const lineIndex = embed.position.start.line;
								const fullLine = lines[lineIndex] || '';
								
								// 检查是否在代码块内，如果是则跳过
								if (await this.isInCodeBlock(file, lineIndex, fullLine, lines)) {
									continue;
								}
								
								// 提取显示文本和尺寸：Wiki 格式中，| 后面可能是显示文本或尺寸
								// ![[小图.png]] - 没有显示文本和尺寸
								// ![[小图.png|100]] - 仅尺寸（宽度100px）
								// ![[小图.png|100x200]] - 仅尺寸（宽100px，高200px）
								// ![[小图.png|小图.png]] - 仅显示文本
								// ![[小图.png|显示文本|100x200]] - 显示文本和尺寸（如果支持）
								let displayText = '';
								const wikiMatch = fullLine.match(/!\[\[([^\]]+)\]\]/);
								if (wikiMatch) {
									const parsed = parseWikiLink(wikiMatch[0]);
									displayText = parsed.displayText || '';
								} else {
									// 如果正则匹配失败，使用 API 返回的值（但通常不应该发生）
									displayText = embed.displayText || '';
								}

								references.push({
									filePath: file.path,
									context: fullLine,
									lineNumber: lineIndex + 1,
									displayText: displayText,
									matchType: displayText ? 'wiki-with-text' : 'wiki',
									fullLine: fullLine,
								});
							}
						}
					}
				}

				// 检查 links（普通链接，包括不带!的图片引用）
				if (cache.links) {
					for (const link of cache.links) {
						// 解析链接目标
						const destPath = this.resolveLinkPath(link.link, file.path);
						if (destPath === imagePath) {
							// 生成唯一标识（使用行号和偏移量，确保同一行的多个引用都能被记录）
							const positionKey = `${file.path}:${link.position.start.line}:${link.position.start.offset || 0}:${link.position.end.offset || 0}`;
							if (!processedPositions.has(positionKey)) {
								processedPositions.add(positionKey);
								
								const lineIndex = link.position.start.line;
								const fullLine = lines[lineIndex] || '';

								// 检查是否在代码块内，如果是则跳过
								if (await this.isInCodeBlock(file, lineIndex, fullLine, lines)) {
									continue;
								}

								// 检查是否是图片引用（包含 [[ 和 ]]）
								const isImageLink = fullLine.includes('[[') && fullLine.includes(']]');

								if (isImageLink) {
									// 提取显示文本和尺寸：Wiki 格式中，| 后面可能是显示文本或尺寸
									let displayText = '';
									
									const startCol = link.position.start.col;
									const endCol = link.position.end.col;
									
									// 确定是否是带!的图片链接
									// 检查链接前面的字符是否是 '!'
									// 注意：link.position 通常包含 [[...]]，但不包含前面的 !
									const hasExclamation = startCol > 0 && fullLine.charAt(startCol - 1) === '!';
									
									// 使用 position 精确截取链接文本
									if (startCol >= 0 && endCol <= fullLine.length && startCol < endCol) {
										const linkText = fullLine.substring(startCol, endCol);
										const parsed = parseWikiLink(linkText);
										displayText = parsed.displayText || '';
									} else {
										// 回退方案
										// 检查是否是带!的格式
										const wikiWithExclamMatch = fullLine.match(/!\[\[([^\]]+)\]\]/);
										// 检查是否是不带!的格式
										const wikiNoExclamMatch = fullLine.match(/(?:^|[^!])\[\[([^\]]+)\]\]/);
										
										if (wikiWithExclamMatch) {
											const parsed = parseWikiLink(wikiWithExclamMatch[0]);
											displayText = parsed.displayText || '';
										} else if (wikiNoExclamMatch) {
											// 确保前面没有 !
											const beforeMatch = fullLine.substring(0, wikiNoExclamMatch.index || 0);
											if (!beforeMatch.endsWith('!')) {
												const parsed = parseWikiLink(wikiNoExclamMatch[0]);
												displayText = parsed.displayText || '';
											}
										} else {
											// 如果正则匹配失败，使用 API 返回的值（但通常不应该发生）
											displayText = link.displayText || '';
										}
									}

									references.push({
										filePath: file.path,
										context: fullLine,
										lineNumber: lineIndex + 1,
										displayText: displayText,
										matchType: hasExclamation
											? displayText
												? 'wiki-with-text'
												: 'wiki'
											: displayText
												? 'wiki-no-exclam-with-text'
												: 'wiki-no-exclam',
										fullLine: fullLine,
									});
								}
							}
						}
					}
				}

				// 直接扫描文件内容，查找 Markdown 和 HTML 格式的图片引用
				// metadataCache 可能不包含这些格式，所以需要直接扫描
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					const positionKey = `${file.path}:${i}`;
					
					// 如果已经处理过，跳过
					if (processedPositions.has(positionKey)) {
						continue;
					}

					// 检查是否在代码块内，如果是则跳过
					if (await this.isInCodeBlock(file, i, line, lines)) {
						continue;
					}

					// 检查 Markdown 格式: ![alt](path)
					const markdownPattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
					let markdownMatch;
					let markdownFound = false;
					while ((markdownMatch = markdownPattern.exec(line)) !== null) {
						const refPath = markdownMatch[2].split('?')[0]; // 移除查询参数
						const resolvedPath = this.resolveLinkPath(refPath, file.path);
						if (resolvedPath === imagePath) {
							// 为同一行中的多个引用生成唯一标识
							const matchPositionKey = `${file.path}:${i}:markdown:${markdownMatch.index}`;
							if (!processedPositions.has(matchPositionKey)) {
								processedPositions.add(matchPositionKey);
								
								// 提取显示文本（Markdown 格式的 alt 文本就是显示文本）
								// 注意：Markdown 格式中，alt 文本即使等于文件名，也应该显示为文件名
								// 只有 Wiki 格式在 | 后面没有内容时才留空
								const displayText = (markdownMatch[1] || '').trim();
								
								references.push({
									filePath: file.path,
									context: line,
									lineNumber: i + 1,
									displayText: displayText,
									matchType: 'markdown',
									fullLine: line,
								});
								markdownFound = true;
							}
						}
					}
					// 如果找到了 Markdown 格式的引用，标记该行已处理（避免 HTML 格式重复处理）
					if (markdownFound) {
						processedPositions.add(positionKey);
					}

					// 检查 HTML 格式: <img src="path" alt="显示文本">
					// 只有在没有找到 Markdown 格式引用时才检查 HTML 格式（避免重复）
					if (!processedPositions.has(positionKey)) {
						const htmlPattern = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
						let htmlMatch;
						let htmlFound = false;
						while ((htmlMatch = htmlPattern.exec(line)) !== null) {
							const refPath = htmlMatch[1].split('?')[0]; // 移除查询参数
							const resolvedPath = this.resolveLinkPath(refPath, file.path);
							if (resolvedPath === imagePath) {
								// 为同一行中的多个引用生成唯一标识
								const matchPositionKey = `${file.path}:${i}:html:${htmlMatch.index}`;
								if (!processedPositions.has(matchPositionKey)) {
									processedPositions.add(matchPositionKey);
									
									// 提取 alt 属性作为显示文本
									// 注意：HTML 格式中，alt 属性即使等于文件名，也应该显示为文件名
									// 只有 Wiki 格式在 | 后面没有内容时才留空
									const altMatch = htmlMatch[0].match(/alt\s*=\s*["']([^"']*)["']/i);
									const displayText = altMatch ? altMatch[1].trim() : '';
									
									references.push({
										filePath: file.path,
										context: line,
										lineNumber: i + 1,
										displayText: displayText,
										matchType: 'html',
										fullLine: line,
									});
									htmlFound = true;
								}
							}
						}
						// 如果找到了 HTML 格式的引用，标记该行已处理
						if (htmlFound) {
							processedPositions.add(positionKey);
						}
					}
				}
			} catch (error) {
				if (this.plugin?.logger) {
					await this.plugin.logger.error(OperationType.PLUGIN_ERROR, `获取文件缓存失败: ${file.path}`, {
						error: error as Error
					});
				}
			}
		}

		return references;
	}
	
	/**
	 * 处理文件重命名事件
	 * 注意：此方法由 vault.on('rename') 事件触发
	 * 使用时间戳防止短时间内重复处理同一个重命名操作
	 */
	private async handleFileRename(oldPath: string, newPath: string): Promise<void> {
		// 防止重复处理同一个重命名事件（2秒内的相同操作视为重复）
		const renameKey = `${oldPath}->${newPath}`;
		const now = Date.now();
		const lastProcessed = ReferenceManager.recentRenames.get(renameKey);
		
		if (lastProcessed && (now - lastProcessed) < 2000) {
			// 2秒内已处理过，跳过
			return;
		}
		
		// 记录处理时间
		ReferenceManager.recentRenames.set(renameKey, now);
		
		// 清理过期的记录（超过5秒的）
		for (const [key, time] of ReferenceManager.recentRenames.entries()) {
			if (now - time > 5000) {
				ReferenceManager.recentRenames.delete(key);
			}
		}
		
		try {
			const fileName = oldPath.split('/').pop() || '';
			const newName = newPath.split('/').pop() || '';

			// 更新引用
			await this.updateReferencesInNotes(oldPath, newPath, fileName, newName);

			// 触发所有监听器
			for (const listener of this.fileRenameListeners) {
				await listener(oldPath, newPath);
			}
		} catch (error) {
			if (this.plugin?.logger) {
				await this.plugin.logger.error(OperationType.PLUGIN_ERROR, '处理文件重命名失败', {
					error: error as Error,
					details: { oldPath, newPath }
				});
			}
			new Notice('处理文件重命名失败，请检查日志');
		}
	}

	/**
	 * 添加文件重命名监听器
	 */
	addFileRenameListener(listener: (oldPath: string, newPath: string) => Promise<void>): void {
		this.fileRenameListeners.add(listener);
	}

	/**
	 * 移除文件重命名监听器
	 */
	removeFileRenameListener(listener: (oldPath: string, newPath: string) => Promise<void>): void {
		this.fileRenameListeners.delete(listener);
	}

	/**
	 * 查找引用该图片的笔记及其序号（简化版）
	 * 用于智能重命名等场景，仅返回文件和序号
	 * @param imagePath - 图片路径
	 * @returns 引用列表 [{file: TFile, index: number}]
	 */
	async findImageReferencesSimple(imagePath: string): Promise<Array<{file: any, index: number}>> {
		const allFiles = this.app.vault.getMarkdownFiles();
		const references: Array<{file: any, index: number}> = [];
		
		// 规范化图片路径（移除前导斜杠）
		const normalizedPath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
		const fileName = imagePath.split('/').pop() || '';
		
		// 使用 metadataCache 获取引用文件，提高性能
		const metadataCache = this.app.metadataCache;
		
		for (const file of allFiles) {
			try {
				const cache = metadataCache.getFileCache(file);
				if (!cache) continue;

				// 检查 embeds 和 links
				let hasReference = false;
				if (cache.embeds) {
					for (const embed of cache.embeds) {
						const destPath = this.resolveLinkPath(embed.link, file.path);
						if (destPath === imagePath) {
							hasReference = true;
							break;
						}
					}
				}
				
				if (!hasReference && cache.links) {
					for (const link of cache.links) {
						const destPath = this.resolveLinkPath(link.link, file.path);
						if (destPath === imagePath) {
							hasReference = true;
							break;
						}
					}
				}

				// 如果 metadataCache 中没有找到，直接扫描文件内容
				if (!hasReference) {
					const content = await this.app.vault.read(file);
					
					// 检查是否包含图片路径或文件名（精确匹配）
					const normalizedContent = content.replace(/\r\n/g, '\n');
					const pathPattern = new RegExp(`(?:${PathValidator.escapeRegex(imagePath)}|${PathValidator.escapeRegex(normalizedPath)}|${PathValidator.escapeRegex(fileName)})`);
					hasReference = pathPattern.test(normalizedContent);
				}

				if (hasReference) {
					// 读取文件内容，计算图片序号
					const content = await this.app.vault.read(file);
					
					// 首先收集所有图片引用的位置，按行号排序
					const allImageRefs: Array<{line: number, path: string, type: string}> = [];
					
					// 图片扩展名列表
					const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
					
					// Wiki 格式: ![[path]] - 只匹配带!的图片嵌入
					const wikiPattern = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
					let match;
					const lines = content.split('\n');
					
					// 跟踪代码块状态
					let inCodeBlock = false;
					
					for (let i = 0; i < lines.length; i++) {
						const line = lines[i];
						
						// 检测代码块边界
						if (line.trim().startsWith('```')) {
							inCodeBlock = !inCodeBlock;
							continue;
						}
						
						// 跳过代码块内容
						if (inCodeBlock) continue;
						
						wikiPattern.lastIndex = 0;
						
						while ((match = wikiPattern.exec(line)) !== null) {
							// 检查是否在行内代码中
							const beforeMatch = line.substring(0, match.index);
							const backtickCount = (beforeMatch.match(/`/g) || []).length;
							if (backtickCount % 2 === 1) continue; // 在行内代码中
							
							const refPath = match[1].split('|')[0]; // 移除显示文本
							if (refPath) {
								// 检查是否是图片文件
								const ext = refPath.split('.').pop()?.toLowerCase() || '';
								if (imageExtensions.includes(ext)) {
									allImageRefs.push({ line: i, path: refPath, type: 'wiki' });
								}
							}
						}
						
						// Markdown 格式: ![alt](path)
						const markdownPattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
						markdownPattern.lastIndex = 0;
						while ((match = markdownPattern.exec(line)) !== null) {
							// 检查是否在行内代码中
							const beforeMatch = line.substring(0, match.index);
							const backtickCount = (beforeMatch.match(/`/g) || []).length;
							if (backtickCount % 2 === 1) continue;
							
							const refPath = match[2].split('?')[0]; // 移除查询参数
							if (refPath) {
								const ext = refPath.split('.').pop()?.toLowerCase() || '';
								if (imageExtensions.includes(ext)) {
									allImageRefs.push({ line: i, path: refPath, type: 'markdown' });
								}
							}
						}
						
						// HTML 格式: <img src="path">
						const htmlPattern = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
						htmlPattern.lastIndex = 0;
						while ((match = htmlPattern.exec(line)) !== null) {
							// 检查是否在行内代码中
							const beforeMatch = line.substring(0, match.index);
							const backtickCount = (beforeMatch.match(/`/g) || []).length;
							if (backtickCount % 2 === 1) continue;
							
							const refPath = match[1].split('?')[0]; // 移除查询参数
							if (refPath) {
								const ext = refPath.split('.').pop()?.toLowerCase() || '';
								if (imageExtensions.includes(ext)) {
									allImageRefs.push({ line: i, path: refPath, type: 'html' });
								}
							}
						}
					}
					
					// 按行号排序，然后查找匹配的引用
					allImageRefs.sort((a, b) => a.line - b.line);
					
					for (let imageIndex = 0; imageIndex < allImageRefs.length; imageIndex++) {
						const ref = allImageRefs[imageIndex];
						const refPath = ref.path;
						
						// 规范化引用路径
						const normalizedRef = refPath.startsWith('/') ? refPath.slice(1) : refPath;
						
						// 解析引用路径（支持相对路径）
						const resolvedPath = this.resolveLinkPath(refPath, file.path);
						
						// 精确匹配：完整路径匹配或文件名完全匹配
						const isMatch = resolvedPath === imagePath ||
						              normalizedRef === normalizedPath || 
						              refPath === imagePath ||
						              (normalizedRef === fileName && fileName.length > 0);
						
						if (isMatch) {
							references.push({ file, index: imageIndex });
							break; // 找到后跳出，避免重复
						}
					}
				}
			} catch (error) {
				if (this.plugin?.logger) {
					await this.plugin.logger.error(OperationType.PLUGIN_ERROR, `读取文件失败 ${file.path}`, {
						error: error as Error
					});
				}
			}
		}
		
		return references;
	}
}

