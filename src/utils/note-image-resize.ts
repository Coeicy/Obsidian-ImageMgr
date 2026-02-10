/**
 * 笔记内图片拖拽调整尺寸模块
 *
 * 功能：在阅读视图与编辑视图（即时预览）中为图片添加右下角拖拽手柄，拖拽后写回笔记并实时同步。
 *
 * 核心特性：
 * - 支持本地图片和网络图片（HTTP/HTTPS）的统一处理
 * - 智能图片匹配：通过 URL 解析和文件名匹配处理 Obsidian 的代理/缓存 URL
 * - 可配置的最小尺寸限制和宽高比保持
 * - 实时预览：编辑视图中拖拽时即时更新图片尺寸
 *
 * 支持视图：
 * - 阅读视图：通过 registerMarkdownPostProcessor 挂载，传入 context 以便 addChild 管理生命周期（重渲染时清理监听）
 * - 编辑视图：main 中对当前 Markdown 源码视图的 .cm-editor 子树扫描，避免分栏时混入右侧预览区图片
 *   - 支持编辑器滚动时动态挂载（用于长文档）
 *   - vault.on('modify') 防抖再次扫描，使新插入的图片也能挂上手柄
 *
 * 写回与同步：
 * - 写回格式：
 *   - Wiki：![[image.png|显示文本|100x200]] 保持 |widthxheight 格式
 *   - HTML：<img src="..." width="100" height="200"> 更新 width/height 属性
 *   - Markdown：转为带尺寸的 HTML <img> 以支持尺寸（Markdown 标准不支持链接内尺寸）
 * - 编辑视图写回后通过 editorLineUpdater 调用 setLine 实时更新该行，避免与磁盘内容不同步
 * - 写回成功后调用 plugin.notifyNoteImageSizeUpdated，详情页刷新引用列表以显示最新显示尺寸
 *
 * 网络图片处理：
 * - isImagePath 包含 http(s) 链接，与本地图片使用同一套写回逻辑
 * - isImageSrcMatching 函数处理 Obsidian 可能的代理/缓存 URL 转换
 * - 详情页对 Markdown 引用保存尺寸时会转为 HTML
 *
 * @module note-image-resize
 * @since 0.3.0
 */

import { App, Notice, MarkdownRenderChild, MarkdownPostProcessorContext } from 'obsidian';
import { parseWikiLink, buildWikiLink, parseHtmlImageSize, WikiLinkParts, ReferenceManager } from './reference-manager';
import ImageManagementPlugin from '../main';

/** 支持的图片扩展名列表 */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];

/**
 * 图片在笔记中的出现位置信息
 * 
 * 用于记录图片在笔记中的精确位置，以便进行拖拽调整尺寸后的精准替换
 */
export interface ImageOccurrence {
	/** 图片所在行号（1-based） */
	lineNumber: number;
	/** 该行内图片的索引（0-based，同一行多个图片时使用） */
	indexInLine: number;
	/** 图片所在行的完整内容 */
	lineContent: string;
	/** 匹配类型：Wiki 链接、无前缀 Wiki、Markdown、HTML */
	matchType: 'wiki' | 'wiki-no-exclam' | 'markdown' | 'html';
	/** 图片路径或 URL */
	path: string;
	/** 显示文本（Wiki 链接中的 |displayText） */
	displayText?: string;
	/** 替代文本（Markdown 中的 ![alt] 或 HTML 中的 alt 属性） */
	alt?: string;
	/** 当前宽度（如果已设置） */
	width?: number;
	/** 当前高度（如果已设置） */
	height?: number;
	/** 原始匹配的完整字符串，用于替换 */
	raw: string;
}

/**
 * 从路径或 URL 中取扩展名（小写，不含点）
 */
function getExtension(pathOrUrl: string): string {
	const path = pathOrUrl.split('?')[0].split('#')[0];
	const ext = path.split('.').pop() || '';
	return ext.toLowerCase();
}

/**
 * 判断路径是否为图片路径
 * 
 * 支持：
 * - 本地图片：通过扩展名判断（png, jpg, jpeg, gif, bmp, webp, svg）
 * - 网络图片：以 http:// 或 https:// 开头的 URL
 * 
 * @param path - 文件路径或 URL
 * @returns 是否为图片路径
 */
function isImagePath(path: string): boolean {
	const ext = getExtension(path);
	return IMAGE_EXTENSIONS.includes(ext) || path.startsWith('http://') || path.startsWith('https://');
}

/**
 * 检查图片元素的 src 是否与 occurrence 的 path 匹配
 * 
 * 支持网络图片和本地图片的灵活匹配，处理以下特殊情况：
 * - Obsidian 对网络图片的代理/缓存 URL 转换
 * - 查询参数和锚点的差异
 * - URL 编码差异
 * 
 * 匹配策略（网络图片）：
 * 1. 直接字符串包含匹配
 * 2. URL 对象解析匹配（比较主机名和路径，忽略查询参数）
 * 3. 清理后的 URL 字符串匹配
 * 4. 文件名匹配（用于 CDN 或代理情况）
 * 
 * 匹配策略（本地图片）：
 * - 比较文件名（忽略路径差异）
 * 
 * @param img - 图片 DOM 元素
 * @param occ - 图片出现位置信息
 * @returns 是否匹配
 */
function isImageSrcMatching(img: HTMLImageElement, occ: ImageOccurrence): boolean {
	const imgSrc = img.src || '';
	const occPath = occ.path;
	
	// 网络图片匹配
	if (occPath.startsWith('http://') || occPath.startsWith('https://')) {
		// 直接包含匹配
		if (imgSrc.includes(occPath) || occPath.includes(imgSrc)) {
			return true;
		}
		// 处理 Obsidian 可能的代理/缓存 URL
		// 尝试匹配 URL 的关键部分（域名+路径）
		try {
			const occUrl = new URL(occPath);
			const imgUrl = new URL(imgSrc);
			// 比较主机名和路径（忽略查询参数）
			const occKey = `${occUrl.hostname}${occUrl.pathname}`;
			const imgKey = `${imgUrl.hostname}${imgUrl.pathname}`;
			if (occKey === imgKey || imgKey.includes(occKey) || occKey.includes(imgKey)) {
				return true;
			}
		} catch {
			// URL 解析失败，回退到简单字符串匹配
			const occKey = occPath.replace(/^https?:\/\//, '').split('?')[0];
			const imgKey = imgSrc.replace(/^https?:\/\//, '').split('?')[0];
			if (occKey && imgKey && (imgKey.includes(occKey) || occKey.includes(imgKey))) {
				return true;
			}
		}
		// 尝试匹配文件名（用于某些 CDN 或代理情况）
		const occFileName = occPath.split('/').pop()?.split('?')[0];
		const imgFileName = imgSrc.split('/').pop()?.split('?')[0];
		if (occFileName && imgFileName && occFileName === imgFileName) {
			return true;
		}
		return false;
	}
	
	// 本地图片匹配
	const imgFileName = imgSrc.split('/').pop()?.split('?')[0];
	const occFileName = occPath.split('/').pop();
	return imgFileName === occFileName;
}

/**
 * 将笔记内链接路径解析为 vault 路径
 * 
 * 用于与详情页 this.image.path 匹配，支持：
 * - 网络图片：直接返回 URL
 * - 绝对路径：检查是否存在于 vault 中
 * - 相对路径：基于笔记所在目录解析
 * 
 * @param app - Obsidian App 实例
 * @param notePath - 当前笔记路径
 * @param linkPath - 图片链接路径
 * @returns 解析后的路径
 */
function resolveImagePathForNotify(app: App, notePath: string, linkPath: string): string {
	if (linkPath.startsWith('http://') || linkPath.startsWith('https://')) return linkPath;
	if (app.vault.getAbstractFileByPath(linkPath)) return linkPath;
	const noteDir = notePath.includes('/') ? notePath.replace(/\/[^/]+$/, '') : '';
	const candidate = noteDir ? `${noteDir}/${linkPath}` : linkPath;
	return app.vault.getAbstractFileByPath(candidate) ? candidate : linkPath;
}

/**
 * 扫描笔记内容，按出现顺序返回所有图片链接
 * 
 * 支持的图片链接格式：
 * - Wiki 链接：![[image.png]] 或 [[image.png|显示文本]] 或 [[image.png|显示文本|100x200]]
 * - 无前缀 Wiki：[image.png]（Obsidian 兼容格式）
 * - Markdown 链接：![alt](path/to/image.png) 或 ![alt](http://example.com/image.png)
 * - HTML 标签：<img src="..." width="100" height="200">
 * 
 * 扫描顺序：按行扫描，每行内按 Wiki → Markdown → HTML 的顺序匹配，
 * 然后按在文本中出现的索引排序。确保与 Reading 视图 DOM 中 img 顺序一致。
 * 
 * @param fileContent - 笔记完整内容
 * @returns 图片出现位置信息数组
 */
export function getImageOccurrences(fileContent: string): ImageOccurrence[] {
	const occurrences: ImageOccurrence[] = [];
	const lines = fileContent.split('\n');

	const wikiRe = ReferenceManager.WIKI_LINK_REGEX;
	const markdownRe = ReferenceManager.MARKDOWN_LINK_REGEX;
	const htmlRe = ReferenceManager.HTML_IMAGE_REGEX;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		const lineNum = lineIndex + 1;
		const matches: { index: number; raw: string; type: 'wiki' | 'wiki-no-exclam' | 'markdown' | 'html'; path?: string; displayText?: string; alt?: string; width?: number; height?: number }[] = [];

		let m: RegExpExecArray | null;
		wikiRe.lastIndex = 0;
		while ((m = wikiRe.exec(line)) !== null) {
			const full = m[0];
			const inner = m[1];
			const path = inner.split('|')[0].trim();
			if (!isImagePath(path)) continue;
			const parsed = parseWikiLink(full);
			const withExclam = full.startsWith('!');
			matches.push({
				index: m.index,
				raw: full,
				type: withExclam ? 'wiki' : 'wiki-no-exclam',
				path: parsed.path,
				displayText: parsed.displayText || undefined,
				width: parsed.width,
				height: parsed.height
			});
		}

		markdownRe.lastIndex = 0;
		while ((m = markdownRe.exec(line)) !== null) {
			const path = m[2].trim();
			if (!isImagePath(path)) continue;
			matches.push({
				index: m.index,
				raw: m[0],
				type: 'markdown',
				path,
				alt: m[1] || undefined
			});
		}

		htmlRe.lastIndex = 0;
		while ((m = htmlRe.exec(line)) !== null) {
			const full = m[0];
			const srcMatch = full.match(/src\s*=\s*["']([^"']+)["']/i);
			const path = srcMatch ? srcMatch[1].trim() : '';
			if (!path || !isImagePath(path)) continue;
			const size = parseHtmlImageSize(full);
			const altMatch = full.match(/alt\s*=\s*["']([^"']*)["']/i);
			matches.push({
				index: m.index,
				raw: full,
				type: 'html',
				path,
				displayText: altMatch ? altMatch[1] : undefined,
				alt: altMatch ? altMatch[1] : undefined,
				width: size.width,
				height: size.height
			});
		}

		matches.sort((a, b) => a.index - b.index);
		matches.forEach((match, idx) => {
			occurrences.push({
				lineNumber: lineNum,
				indexInLine: idx,
				lineContent: line,
				matchType: match.type,
				path: match.path || '',
				displayText: match.displayText,
				alt: match.alt,
				width: match.width,
				height: match.height,
				raw: match.raw
			});
		});
	}

	return occurrences;
}

/**
 * 将行内容中第 n 个图片链接替换为新链接字符串
 * 
 * 只计算图片链接（与 getImageOccurrences 一致），非图片链接（如普通 Wiki 链接）会被跳过。
 * 保持其他文本内容不变，仅替换指定索引的图片链接。
 * 
 * @param lineContent - 行内容
 * @param n - 行内图片索引（0-based）
 * @param newLink - 新链接字符串
 * @returns 替换后的行内容
 */
export function replaceNthImageInLine(
	lineContent: string,
	n: number,
	newLink: string
): string {
	const wikiRe = ReferenceManager.WIKI_LINK_REGEX;
	const markdownRe = ReferenceManager.MARKDOWN_LINK_REGEX;
	const htmlRe = ReferenceManager.HTML_IMAGE_REGEX;

	const all: { index: number; length: number; raw: string }[] = [];
	let m: RegExpExecArray | null;

	wikiRe.lastIndex = 0;
	while ((m = wikiRe.exec(lineContent)) !== null) {
		const path = m[1].split('|')[0].trim();
		if (isImagePath(path)) all.push({ index: m.index, length: m[0].length, raw: m[0] });
	}
	markdownRe.lastIndex = 0;
	while ((m = markdownRe.exec(lineContent)) !== null) {
		if (isImagePath(m[1].trim())) all.push({ index: m.index, length: m[0].length, raw: m[0] });
	}
	htmlRe.lastIndex = 0;
	while ((m = htmlRe.exec(lineContent)) !== null) {
		const srcMatch = m[0].match(/src\s*=\s*["']([^"']+)["']/i);
		if (srcMatch && isImagePath(srcMatch[1].trim())) all.push({ index: m.index, length: m[0].length, raw: m[0] });
	}
	all.sort((a, b) => a.index - b.index);
	if (n < 0 || n >= all.length) return lineContent;
	const target = all[n];
	return lineContent.substring(0, target.index) + newLink + lineContent.substring(target.index + target.length);
}

/**
 * 根据 occurrence 和新的尺寸构建新链接字符串
 * 
 * 根据原始链接类型选择不同的输出格式：
 * - Wiki 链接：保持 ![[path|displayText|widthxheight]] 格式
 * - HTML 链接：更新 width/height 属性
 * - Markdown 链接：转为 HTML <img> 以支持尺寸（Markdown 标准不支持链接内尺寸）
 * 
 * @param occ - 图片出现位置信息
 * @param newWidth - 新宽度
 * @param newHeight - 新高度
 * @returns 新链接字符串
 */
function buildNewLink(occ: ImageOccurrence, newWidth: number, newHeight: number): string {
	if (occ.matchType === 'wiki' || occ.matchType === 'wiki-no-exclam') {
		const parts: WikiLinkParts = {
			path: occ.path,
			displayText: occ.displayText || ''
		};
		parts.width = newWidth;
		parts.height = newHeight;
		return buildWikiLink(parts, occ.matchType === 'wiki');
	}
	if (occ.matchType === 'html') {
		const alt = (occ.displayText ?? occ.alt ?? '').replace(/"/g, '&quot;');
		const parts = [`src="${occ.path}"`, `alt="${alt}"`, `width="${newWidth}"`, `height="${newHeight}"`];
		return `<img ${parts.join(' ')}>`;
	}
	// markdown: 转为 HTML 以支持尺寸
	const alt = (occ.alt ?? occ.displayText ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return `<img src="${occ.path}" alt="${alt}" width="${newWidth}" height="${newHeight}">`;
}

export interface UpdateImageSizeResult {
	success: boolean;
	/** 更新后的该行完整内容，用于编辑视图实时同步 */
	newLineContent?: string;
}

/**
 * 更新笔记中指定图片的尺寸
 *
 * 工作流程：
 * 1. 重新读取文件获取当前内容（避免与其他修改冲突）
 * 2. 查找指定行和索引的图片 occurrence
 * 3. 构建新链接字符串（根据原始格式）
 * 4. 替换行内指定索引的图片链接
 * 5. 写回文件
 *
 * 注意：会重新读取文件以获取当前行内容，避免与磁盘内容不同步
 *
 * @param app - Obsidian App 实例
 * @param filePath - 笔记文件路径
 * @param lineNumber - 行号（1-based）
 * @param indexInLine - 行内图片索引（0-based）
 * @param newWidth - 新宽度
 * @param newHeight - 新高度
 * @returns 更新结果，包含是否成功和更新后的行内容
 */
export async function updateImageSizeInNote(
	app: App,
	filePath: string,
	lineNumber: number,
	indexInLine: number,
	newWidth: number,
	newHeight: number
): Promise<UpdateImageSizeResult> {
	const file = app.vault.getMarkdownFiles().find(f => f.path === filePath);
	if (!file) return { success: false };

	const content = await app.vault.read(file);
	const occurrences = getImageOccurrences(content);
	const occ = occurrences.find(
		o => o.lineNumber === lineNumber && o.indexInLine === indexInLine
	);
	if (!occ) return { success: false };

	const newLink = buildNewLink(occ, newWidth, newHeight);
	const lines = content.split('\n');
	if (lineNumber < 1 || lineNumber > lines.length) return { success: false };
	const fullLine = lines[lineNumber - 1];
	const newLine = replaceNthImageInLine(fullLine, indexInLine, newLink);
	lines[lineNumber - 1] = newLine;
	await app.vault.modify(file, lines.join('\n'));
	return { success: true, newLineContent: newLine };
}

/** 拖拽手柄的 CSS 类名 */
const HANDLE_CLASS = 'imagemgr-resize-handle';
/** 图片包裹容器的 CSS 类名 */
const WRAPPER_CLASS = 'imagemgr-resize-wrapper';

/**
 * 阅读视图中由 context.addChild 管理的子组件
 *
 * 用于在节点移除（如重渲染）时自动清理手柄监听，避免内存泄漏。
 * 这是 Obsidian 插件开发中管理动态添加元素生命周期的最佳实践。
 */
class ResizeHandleChild extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private handleEl: HTMLElement,
		private boundOnMouseDown: (e: MouseEvent) => void
	) {
		super(containerEl);
	}
	onunload() {
		this.handleEl.removeEventListener('mousedown', this.boundOnMouseDown);
	}
}

/**
 * 为单个图片元素挂载拖拽调整尺寸功能
 *
 * 工作流程：
 * 1. 创建包裹容器和拖拽手柄元素
 * 2. 绑定鼠标事件处理（mousedown → mousemove → mouseup）
 * 3. 拖拽时实时更新图片尺寸样式
 * 4. 拖拽结束后调用 onUpdate 写回笔记
 * 5. 编辑视图下通过 onEditorLineUpdate 实时更新编辑器内容
 *
 * 配置选项（来自 plugin.settings）：
 * - dragResizeMinSize: 最小尺寸限制（默认 50px）
 * - dragResizeKeepAspectRatio: 是否保持宽高比（默认 false）
 *
 * @param img - 图片 DOM 元素
 * @param occurrence - 图片在笔记中的位置信息
 * @param sourcePath - 笔记文件路径
 * @param app - Obsidian App 实例
 * @param plugin - 插件实例（用于获取设置）
 * @param onUpdate - 尺寸更新回调，写回笔记并返回结果
 * @param onEditorLineUpdate - 编辑器行更新回调（编辑视图专用）
 * @param context - MarkdownPostProcessorContext（阅读视图专用，用于生命周期管理）
 */
/**
 * 为单个图片元素挂载拖拽调整尺寸功能
 *
 * 工作流程：
 * 1. 创建包裹容器和拖拽手柄元素（阅读视图）或直接添加手柄（编辑视图）
 * 2. 绑定鼠标事件处理（mousedown → mousemove → mouseup）
 * 3. 拖拽时实时更新图片尺寸样式
 * 4. 拖拽结束后调用 onUpdate 写回笔记
 * 5. 编辑视图下通过 onEditorLineUpdate 实时更新编辑器内容
 *
 * 视图差异处理：
 * - 阅读视图：创建 wrapper span 包裹图片，手柄作为子元素，使用 context.addChild 管理生命周期
 * - 编辑视图：不创建 wrapper（避免干扰 CodeMirror DOM），使用 fixed 定位手柄跟随图片
 *
 * 配置选项（来自 plugin.settings）：
 * - dragResizeMinSize: 最小尺寸限制（默认 50px）
 * - dragResizeKeepAspectRatio: 是否保持宽高比（默认 false）
 *
 * @param img - 图片 DOM 元素
 * @param occurrence - 图片在笔记中的位置信息
 * @param sourcePath - 笔记文件路径
 * @param app - Obsidian App 实例
 * @param plugin - 插件实例（用于获取设置）
 * @param onUpdate - 尺寸更新回调，写回笔记并返回结果
 * @param onEditorLineUpdate - 编辑器行更新回调（编辑视图专用）
 * @param context - MarkdownPostProcessorContext（阅读视图专用，用于生命周期管理）
 */
export function attachResizeToImage(
	img: HTMLImageElement,
	occurrence: ImageOccurrence,
	_sourcePath: string,
	_app: App,
	plugin: ImageManagementPlugin | undefined,
	onUpdate: (lineNumber: number, indexInLine: number, newWidth: number, newHeight: number) => Promise<UpdateImageSizeResult>,
	onEditorLineUpdate?: (lineNumber: number, newLineContent: string) => void,
	context?: MarkdownPostProcessorContext
): void {
	// 判断当前视图类型：有 context 表示阅读视图，无 context 表示编辑视图
	const isReadingView = !!context;
	
	// 避免重复挂载
	if (isReadingView) {
		if (img.closest(`.${WRAPPER_CLASS}`)) return;
	} else {
		if (img.hasAttribute('data-imagemgr-resize-attached')) return;
		img.setAttribute('data-imagemgr-resize-attached', 'true');
	}

	let wrapper: HTMLElement;

	if (isReadingView) {
		// 阅读视图：创建 wrapper span 包裹图片
		wrapper = document.createElement('span');
		wrapper.className = WRAPPER_CLASS;
		wrapper.style.display = 'inline-block';
		wrapper.style.position = 'relative';
		wrapper.style.verticalAlign = 'middle';

		const parent = img.parentElement;
		if (!parent) return;
		parent.insertBefore(wrapper, img);
		wrapper.appendChild(img);
	} else {
		// 编辑视图：不使用 wrapper，直接使用图片元素
		// 避免干扰 CodeMirror 的 DOM 结构
		wrapper = img;
	}

	const handle = document.createElement('span');
	handle.className = HANDLE_CLASS;
	handle.setAttribute('aria-label', '拖拽调整尺寸');
	handle.title = '拖拽调整图片显示尺寸';
	
	if (isReadingView) {
		wrapper.appendChild(handle);
	} else {
		// 编辑视图：使用 fixed 定位，添加到 body
		handle.classList.add('imagemgr-fixed-handle');
		handle.style.position = 'fixed';
		handle.style.zIndex = '9999';
		document.body.appendChild(handle);
	}

	let startX = 0;
	let startY = 0;
	let startWidth = 0;
	let startHeight = 0;
	let startAspectRatio = 1;
	let isDragging = false;

	// 最小尺寸限制（固定值）
	const MIN_SIZE = 50;
	// 获取设置值
	const keepAspectRatio = plugin?.settings?.dragResizeKeepAspectRatio ?? false;

	// 编辑视图：更新手柄位置
	function updateHandlePosition() {
		if (isReadingView) return;
		const rect = img.getBoundingClientRect();
		handle.style.left = `${rect.right - 10}px`;
		handle.style.top = `${rect.bottom - 10}px`;
		handle.style.display = rect.width > 0 && rect.height > 0 ? 'block' : 'none';
	}

	function onMouseDown(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		startX = e.clientX;
		startY = e.clientY;
		const rect = img.getBoundingClientRect();
		startWidth = rect.width;
		startHeight = rect.height;
		startAspectRatio = startWidth / startHeight;
		img.style.width = `${startWidth}px`;
		img.style.height = `${startHeight}px`;
		img.style.maxWidth = 'none';
		img.style.maxHeight = 'none';
		isDragging = true;
		
		if (isReadingView) {
			wrapper.classList.add('resizing');
		} else {
			img.classList.add('imagemgr-resizing');
		}
		
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	}

	function onMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		
		let newWidth = Math.max(MIN_SIZE, Math.round(startWidth + dx));
		let newHeight = Math.max(MIN_SIZE, Math.round(startHeight + dy));
		
		// 如果保持宽高比，根据变化较大的边计算另一边
		if (keepAspectRatio && startAspectRatio > 0) {
			const widthChange = Math.abs(dx);
			const heightChange = Math.abs(dy);
			
			if (widthChange >= heightChange) {
				// 以宽度变化为准
				newHeight = Math.max(MIN_SIZE, Math.round(newWidth / startAspectRatio));
			} else {
				// 以高度变化为准
				newWidth = Math.max(MIN_SIZE, Math.round(newHeight * startAspectRatio));
			}
		}
		
		img.style.width = `${newWidth}px`;
		img.style.height = `${newHeight}px`;
		
		// 编辑视图：拖拽时更新手柄位置
		if (!isReadingView) {
			updateHandlePosition();
		}
	}

	async function onMouseUp() {
		if (!isDragging) return;
		isDragging = false;
		
		document.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('mouseup', onMouseUp);
		
		if (isReadingView) {
			wrapper.classList.remove('resizing');
		} else {
			img.classList.remove('imagemgr-resizing');
		}
		
		const w = parseInt(img.style.width || '0', 10);
		const h = parseInt(img.style.height || '0', 10);
		if (w >= MIN_SIZE && h >= MIN_SIZE) {
			const result = await onUpdate(occurrence.lineNumber, occurrence.indexInLine, w, h);
			if (result.success) {
				new Notice('已更新图片显示尺寸');
				if (result.newLineContent && onEditorLineUpdate) {
					onEditorLineUpdate(occurrence.lineNumber, result.newLineContent);
				}
			}
		}
		img.style.maxWidth = '';
		img.style.maxHeight = '';
		img.style.width = '';
		img.style.height = '';
	}

	handle.addEventListener('mousedown', onMouseDown);

	if (isReadingView) {
		// 阅读视图：使用 context 管理生命周期
		context!.addChild(new ResizeHandleChild(wrapper as HTMLElement, handle, onMouseDown));
	} else {
		// 编辑视图：监听滚动和 resize 更新手柄位置
		const scrollHandler = () => updateHandlePosition();
		const resizeHandler = () => updateHandlePosition();
		
		// 使用 requestAnimationFrame 定期更新位置（处理编辑器滚动）
		let rafId: number;
		const startPositionTracking = () => {
			updateHandlePosition();
			rafId = requestAnimationFrame(startPositionTracking);
		};
		startPositionTracking();
		
		// 监听编辑器滚动
		const editorEl = img.closest('.cm-editor');
		if (editorEl) {
			editorEl.addEventListener('scroll', scrollHandler, { passive: true });
		}
		window.addEventListener('resize', resizeHandler);
		
		// 图片加载完成后更新位置
		if (!img.complete) {
			img.addEventListener('load', updateHandlePosition);
		}
		
		// 清理函数
		const cleanup = () => {
			cancelAnimationFrame(rafId);
			if (editorEl) {
				editorEl.removeEventListener('scroll', scrollHandler);
			}
			window.removeEventListener('resize', resizeHandler);
			handle.removeEventListener('mousedown', onMouseDown);
			if (handle.parentNode) {
				handle.parentNode.removeChild(handle);
			}
			img.removeAttribute('data-imagemgr-resize-attached');
		};
		
		// 当图片从 DOM 中移除时清理
		const observer = new MutationObserver((_mutations) => {
			if (!document.body.contains(img)) {
				cleanup();
				observer.disconnect();
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
		
		// 初始显示手柄
		updateHandlePosition();
	}
}

/**
 * processNoteImages 的选项接口
 */
export interface ProcessNoteImagesOptions {
	/**
	 * 写回成功后回调，用于编辑视图实时更新该行
	 * 避免编辑器内容与磁盘内容不同步
	 */
	editorLineUpdater?: (sourcePath: string, lineNumber: number, newLineContent: string) => void;
	/**
	 * 阅读视图 post processor 传入
	 * 用于注册 MarkdownRenderChild 以在重渲染时清理手柄监听
	 */
	context?: MarkdownPostProcessorContext;
}

/**
 * 处理笔记中所有图片的拖拽调整尺寸功能
 *
 * 工作流程：
 * 1. 读取笔记文件内容
 * 2. 扫描内容获取所有图片出现位置（getImageOccurrences）
 * 3. 查找 DOM 中所有图片元素
 * 4. 过滤掉已挂载手柄或非笔记图片（图标、表情等）
 * 5. 使用 isImageSrcMatching 智能匹配 occurrence 与 DOM 图片
 * 6. 为每个匹配的图片挂载拖拽手柄（attachResizeToImage）
 *
 * 使用场景：
 * - 阅读视图：由 registerMarkdownPostProcessor 调用，传入 context 管理生命周期
 * - 编辑视图：由 scheduleEditorImageResize 调用，扫描 .cm-editor 子树
 *
 * 注意：会过滤掉 data URI 图片（如图标、表情）和已挂载手柄的图片
 *
 * @param element - 要扫描的 DOM 根元素
 * @param sourcePath - 笔记文件路径（.md）
 * @param app - Obsidian App 实例
 * @param plugin - 插件实例（用于获取设置）
 * @param options - 可选配置（editorLineUpdater, context）
 */
export function processNoteImages(
	element: HTMLElement,
	sourcePath: string,
	app: App,
	plugin: ImageManagementPlugin | undefined,
	options?: ProcessNoteImagesOptions
): void {
	if (!plugin?.settings?.enableDragResizeImageInNote) return;

	const file = app.vault.getMarkdownFiles().find(f => f.path === sourcePath);
	if (!file) return;

	const editorLineUpdater = options?.editorLineUpdater;
	const context = options?.context;

	app.vault.read(file).then(content => {
		const occurrences = getImageOccurrences(content);
		if (occurrences.length === 0) return;

		const imgs = element.findAll('img') as HTMLImageElement[];
		// 过滤掉已经挂载过手柄的图片和不符合条件的图片
		const availableImgs = imgs.filter(img => {
			if (img.tagName !== 'IMG') return false;
			return !img.closest('.imagemgr-resize-wrapper') &&
				img.src && // 确保图片有 src
				!img.src.startsWith('data:'); // 排除 data URI 图片（如图标、表情等）
		});
		
		// 为每个 occurrence 查找匹配的图片
		// 注意：availableImgs 可能少于 occurrences（如页面包含表情、图标等非笔记图片）
		occurrences.forEach((occ) => {
			// 查找与当前 occurrence 匹配的图片
			const img = availableImgs.find(availableImg => isImageSrcMatching(availableImg, occ));
			
			if (!img) return;
			
			attachResizeToImage(
				img,
				occ,
				sourcePath,
				app,
				plugin,
				async (lineNum, indexInLine, newWidth, newHeight) => {
					const result = await updateImageSizeInNote(app, sourcePath, lineNum, indexInLine, newWidth, newHeight);
					if (result.success && plugin?.notifyNoteImageSizeUpdated) {
						const imagePath = resolveImagePathForNotify(app, sourcePath, occ.path);
						plugin.notifyNoteImageSizeUpdated(imagePath, sourcePath, lineNum, newWidth, newHeight);
					}
					return result;
				},
				editorLineUpdater ? (lineNum, newLineContent) => editorLineUpdater(sourcePath, lineNum, newLineContent) : undefined,
				context
			);
		});
	}).catch(() => {});
}
