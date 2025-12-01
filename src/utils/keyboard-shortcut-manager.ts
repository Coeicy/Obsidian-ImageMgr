/**
 * 快捷键管理器
 * 
 * 统一管理插件的键盘快捷键，提供：
 * - 快捷键定义和默认值
 * - 快捷键解析和匹配
 * - 快捷键格式化显示（支持 Mac 符号）
 * - 输入框检测（避免在输入时触发快捷键）
 * 
 * 快捷键分类：
 * - navigation: 导航类（切换图片、关闭等）
 * - preview: 预览类（缩放、旋转等）
 * - edit: 编辑类（删除、保存等）
 * - view: 视图类（搜索、排序、筛选等）
 * - batch: 批量操作类（批量重命名、移动等）
 */

/**
 * 快捷键定义接口
 */
export interface ShortcutDefinition {
	/** 快捷键唯一标识符 */
	id: string;
	/** 快捷键名称（用于显示） */
	name: string;
	/** 快捷键描述（用于帮助提示） */
	description: string;
	/** 默认快捷键（如 'Ctrl+S', 'ArrowLeft'） */
	defaultKey: string;
	/** 快捷键分类 */
	category: 'navigation' | 'preview' | 'edit' | 'view' | 'batch';
}

/**
 * 所有快捷键的定义
 * 
 * 包含图片详情页和图片管理视图的所有快捷键。
 * 用户可以在设置中自定义这些快捷键。
 */
export const SHORTCUT_DEFINITIONS: Record<string, ShortcutDefinition> = {
	// 图片详情页 - 导航
	'image-detail-previous': {
		id: 'image-detail-previous',
		name: '上一张图片',
		description: '切换到上一张图片',
		defaultKey: 'ArrowLeft',
		category: 'navigation'
	},
	'image-detail-next': {
		id: 'image-detail-next',
		name: '下一张图片',
		description: '切换到下一张图片',
		defaultKey: 'ArrowRight',
		category: 'navigation'
	},
	'image-detail-first': {
		id: 'image-detail-first',
		name: '第一张图片',
		description: '切换到第一张图片',
		defaultKey: 'Home',
		category: 'navigation'
	},
	'image-detail-last': {
		id: 'image-detail-last',
		name: '最后一张图片',
		description: '切换到最后一张图片',
		defaultKey: 'End',
		category: 'navigation'
	},
	'image-detail-close': {
		id: 'image-detail-close',
		name: '关闭详情页',
		description: '关闭图片详情页（会检查未保存更改）',
		defaultKey: 'Escape',
		category: 'navigation'
	},
	'image-detail-delete': {
		id: 'image-detail-delete',
		name: '删除图片',
		description: '删除当前图片',
		defaultKey: 'Delete',
		category: 'edit'
	},
	
	// 图片详情页 - 预览操作
	'image-detail-zoom-in': {
		id: 'image-detail-zoom-in',
		name: '放大图片',
		description: '放大图片显示',
		defaultKey: '+',
		category: 'preview'
	},
	'image-detail-zoom-out': {
		id: 'image-detail-zoom-out',
		name: '缩小图片',
		description: '缩小图片显示',
		defaultKey: '-',
		category: 'preview'
	},
	'image-detail-reset': {
		id: 'image-detail-reset',
		name: '重置视图',
		description: '重置缩放和旋转',
		defaultKey: '0',
		category: 'preview'
	},
	'image-detail-rotate-right': {
		id: 'image-detail-rotate-right',
		name: '顺时针旋转',
		description: '顺时针旋转90度',
		defaultKey: 'r',
		category: 'preview'
	},
	'image-detail-rotate-left': {
		id: 'image-detail-rotate-left',
		name: '逆时针旋转',
		description: '逆时针旋转90度',
		defaultKey: 'l',
		category: 'preview'
	},
	'image-detail-toggle-view-mode': {
		id: 'image-detail-toggle-view-mode',
		name: '切换视图模式',
		description: '在适应窗口和1:1显示间切换',
		defaultKey: 'f',
		category: 'preview'
	},
	'image-detail-toggle-wheel-mode': {
		id: 'image-detail-toggle-wheel-mode',
		name: '切换滚轮模式',
		description: '在缩放和切换图片模式间切换',
		defaultKey: 'w',
		category: 'preview'
	},
	'image-detail-save': {
		id: 'image-detail-save',
		name: '保存更改',
		description: '保存所有更改',
		defaultKey: 'Ctrl+S',
		category: 'edit'
	},
	
	// 图片管理视图 - 操作
	'manager-search': {
		id: 'manager-search',
		name: '打开搜索',
		description: '打开搜索对话框',
		defaultKey: 'Ctrl+F',
		category: 'view'
	},
	'manager-sort': {
		id: 'manager-sort',
		name: '打开排序',
		description: '打开排序对话框',
		defaultKey: 'Ctrl+Shift+S',
		category: 'view'
	},
	'manager-filter': {
		id: 'manager-filter',
		name: '打开筛选',
		description: '打开筛选对话框',
		defaultKey: 'Ctrl+Shift+E',
		category: 'view'
	},
	'manager-group': {
		id: 'manager-group',
		name: '打开分组',
		description: '打开分组对话框',
		defaultKey: 'Ctrl+Shift+G',
		category: 'view'
	},
	'manager-open-detail': {
		id: 'manager-open-detail',
		name: '打开详情',
		description: '打开选中图片的详情页',
		defaultKey: '',
		category: 'navigation'
	},
	'manager-delete': {
		id: 'manager-delete',
		name: '删除选中',
		description: '删除选中的图片',
		defaultKey: 'Delete',
		category: 'edit'
	},
	'manager-select-all': {
		id: 'manager-select-all',
		name: '全选/取消全选',
		description: '全选或取消全选所有图片',
		defaultKey: 'Ctrl+A',
		category: 'view'
	},
	
	// 图片管理视图 - 批量操作
	'manager-batch-rename': {
		id: 'manager-batch-rename',
		name: '批量重命名',
		description: '批量重命名选中的图片',
		defaultKey: 'Ctrl+R',
		category: 'batch'
	},
	'manager-batch-move': {
		id: 'manager-batch-move',
		name: '批量移动',
		description: '批量移动选中的图片',
		defaultKey: 'Ctrl+M',
		category: 'batch'
	},
	'manager-batch-copy': {
		id: 'manager-batch-copy',
		name: '批量复制',
		description: '批量复制选中的图片',
		defaultKey: 'Ctrl+Shift+C',
		category: 'batch'
	},
	'manager-smart-rename': {
		id: 'manager-smart-rename',
		name: '批量智能重命名',
		description: '批量智能重命名选中的图片',
		defaultKey: 'Ctrl+Shift+D',
		category: 'batch'
	},
	'manager-toggle-lock': {
		id: 'manager-toggle-lock',
		name: '切换锁定',
		description: '锁定或解锁选中的图片',
		defaultKey: 'Ctrl+Shift+L',
		category: 'batch'
	}
};

/**
 * 解析快捷键字符串为结构化对象
 * 
 * 支持的格式：
 * - 单键：'ArrowLeft', 'Delete', 'F1'
 * - 组合键：'Ctrl+S', 'Ctrl+Shift+F', 'Alt+Enter'
 * - Mac 风格：'Cmd+S'（会被解析为 meta）
 * 
 * @param shortcut - 快捷键字符串
 * @returns 包含主键和修饰键状态的对象
 * 
 * @example
 * parseShortcut('Ctrl+Shift+S')
 * // 返回 { key: 's', ctrl: true, shift: true, alt: false, meta: false }
 */
export function parseShortcut(shortcut: string): {
	key: string;
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
	meta: boolean;
} {
	const parts = shortcut.toLowerCase().split('+').map(s => s.trim());
	
	const result = {
		key: '',
		ctrl: false,
		shift: false,
		alt: false,
		meta: false
	};
	
	for (const part of parts) {
		if (part === 'ctrl' || part === 'control') {
			result.ctrl = true;
		} else if (part === 'shift') {
			result.shift = true;
		} else if (part === 'alt' || part === 'option') {
			result.alt = true;
		} else if (part === 'meta' || part === 'cmd') {
			result.meta = true;
		} else {
			result.key = part;
		}
	}
	
	return result;
}

/**
 * 格式化快捷键为用户友好的显示字符串
 * 
 * 将快捷键字符串转换为适合显示的格式：
 * - Windows/Linux：'Ctrl+Shift+S'
 * - Mac：'⌃⇧S'（使用 Mac 专用符号）
 * 
 * 特殊键会被转换为符号：
 * - ArrowLeft → ←
 * - ArrowRight → →
 * - ArrowUp → ↑
 * - ArrowDown → ↓
 * 
 * @param shortcut - 快捷键字符串
 * @param isMac - 是否使用 Mac 风格符号
 * @returns 格式化后的显示字符串
 * 
 * @example
 * formatShortcut('Ctrl+Shift+S', false) // 返回 'Ctrl+Shift+S'
 * formatShortcut('Ctrl+Shift+S', true)  // 返回 '⌃⇧S'
 */
export function formatShortcut(shortcut: string, isMac: boolean = false): string {
	const parts = shortcut.split('+').map(s => s.trim());
	const formatted: string[] = [];
	
	for (const part of parts) {
		if (part.toLowerCase() === 'ctrl' || part.toLowerCase() === 'control') {
			formatted.push(isMac ? '⌃' : 'Ctrl');
		} else if (part.toLowerCase() === 'shift') {
			formatted.push(isMac ? '⇧' : 'Shift');
		} else if (part.toLowerCase() === 'alt' || part.toLowerCase() === 'option') {
			formatted.push(isMac ? '⌥' : 'Alt');
		} else if (part.toLowerCase() === 'meta' || part.toLowerCase() === 'cmd') {
			formatted.push(isMac ? '⌘' : 'Ctrl');
		} else if (part === 'ArrowLeft') {
			formatted.push('←');
		} else if (part === 'ArrowRight') {
			formatted.push('→');
		} else if (part === 'ArrowUp') {
			formatted.push('↑');
		} else if (part === 'ArrowDown') {
			formatted.push('↓');
		} else {
			formatted.push(part.toUpperCase());
		}
	}
	
	return formatted.join(isMac ? '' : '+');
}

/**
 * 检查键盘事件是否匹配指定的快捷键
 * 
 * 匹配规则：
 * 1. 空快捷键不匹配任何按键
 * 2. 修饰键必须精确匹配（如果快捷键要求 Ctrl，则必须按下 Ctrl）
 * 3. 如果快捷键有修饰键，则不允许额外的修饰键
 * 4. 如果快捷键是纯按键（无修饰键），则允许任意修饰键组合
 * 5. 支持特殊键别名（如 Delete/Del, Escape/Esc）
 * 
 * @param e - 键盘事件对象
 * @param shortcut - 快捷键字符串
 * @returns 如果事件匹配快捷键返回 true
 * 
 * @example
 * // 在键盘事件处理中使用
 * if (matchesShortcut(e, 'Ctrl+S')) {
 *   e.preventDefault();
 *   saveChanges();
 * }
 */
export function matchesShortcut(
	e: KeyboardEvent,
	shortcut: string
): boolean {
	// 空快捷键不匹配任何按键
	if (!shortcut || shortcut.trim() === '') {
		return false;
	}
	
	const parsed = parseShortcut(shortcut);
	
	// 检查修饰键
	const ctrlPressed = e.ctrlKey || e.metaKey;
	const shiftPressed = e.shiftKey;
	const altPressed = e.altKey;
	
	// 如果快捷键要求某个修饰键，但实际没按，则不匹配
	if (parsed.ctrl && !ctrlPressed) return false;
	if (parsed.shift && !shiftPressed) return false;
	if (parsed.alt && !altPressed) return false;
	
	// 如果快捷键有任何修饰键要求，则必须严格匹配（不允许额外的修饰键）
	if (parsed.ctrl || parsed.shift || parsed.alt) {
		if (!parsed.ctrl && ctrlPressed) return false;
		if (!parsed.shift && shiftPressed) return false;
		if (!parsed.alt && altPressed) return false;
	}
	// 如果快捷键没有修饰键要求（纯按键），则允许用户按任意修饰键组合
	
	// 检查主键
	const key = e.key.toLowerCase();
	const parsedKey = parsed.key.toLowerCase();
	
	// 直接匹配
	if (parsedKey === key) return true;
	
	// 特殊键别名匹配
	const keyAliases: Record<string, string[]> = {
		'delete': ['delete', 'del'],
		'escape': ['escape', 'esc'],
		'arrowleft': ['arrowleft', 'left'],
		'arrowright': ['arrowright', 'right'],
		'arrowup': ['arrowup', 'up'],
		'arrowdown': ['arrowdown', 'down'],
		'+': ['+', '='],
		'=': ['=', '+']
	};
	
	for (const [alias, keys] of Object.entries(keyAliases)) {
		if (parsedKey === alias && keys.includes(key)) {
			return true;
		}
	}
	
	return false;
}

/**
 * 检查事件目标是否为输入元素
 * 
 * 用于判断是否应该触发快捷键。当用户在输入框中输入时，
 * 通常不应该触发快捷键（如按 Delete 应该删除文字而不是删除图片）。
 * 
 * 检测的元素类型：
 * - input 元素
 * - textarea 元素
 * - contentEditable 元素
 * 
 * @param target - 事件目标
 * @returns 如果目标是输入元素返回 true
 * 
 * @example
 * document.addEventListener('keydown', (e) => {
 *   if (isInputElement(e.target)) return; // 在输入框中，不处理快捷键
 *   // 处理快捷键...
 * });
 */
export function isInputElement(target: EventTarget | null): boolean {
	if (!target) return false;
	const element = target as HTMLElement;
	const tagName = element.tagName.toLowerCase();
	return tagName === 'input' || tagName === 'textarea' || element.isContentEditable;
}

