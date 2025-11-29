/**
 * 插件常量配置
 * 
 * 集中管理所有魔法数字和配置值，提高代码可维护性和一致性。
 * 所有常量都使用 `as const` 确保类型安全。
 * 
 * 常量分类：
 * - UI_SIZE: UI 尺寸和布局相关
 * - TIMING: 时间相关配置（防抖、延迟等）
 * - LIMITS: 数量限制和阈值
 * - STYLES: CSS 样式常量
 */

// ==================== UI 尺寸常量 ====================

/**
 * UI 尺寸配置
 * 用于保持整个应用的视觉一致性
 */
export const UI_SIZE = {
	/** 字体大小配置 - 用于不同层级的文本 */
	FONT: {
		/** 小号字体 - 用于辅助文本、标签等 */
		SMALL: '14px',
		/** 中号字体 - 用于正文内容 */
		MEDIUM: '16px',
		/** 大号字体 - 用于标题、重要信息 */
		LARGE: '18px',
	},
	
	/** 间距配置 - 用于元素之间的距离 */
	SPACING: {
		/** 超小间距 - 4px，用于紧凑布局 */
		XS: '4px',
		/** 小间距 - 6px */
		SM: '6px',
		/** 中间距 - 8px，最常用 */
		MD: '8px',
		/** 大间距 - 12px */
		LG: '12px',
		/** 超大间距 - 16px，用于分隔不同区域 */
		XL: '16px',
	},
	
	/** 边框圆角配置 - 用于卡片和按钮 */
	BORDER_RADIUS: {
		/** 小圆角 - 4px，用于微妙的圆角 */
		SM: '4px',
		/** 中等圆角 - 6px，标准圆角 */
		MD: '6px',
	},
	
	/** 图片预览容器尺寸 - 用于详情页的图片显示 */
	IMAGE_PREVIEW: {
		/** 最大高度 - 70% 视口高度，正常方向 */
		MAX_HEIGHT: '70vh',
		/** 旋转后的最大高度 - 60% 视口高度（旋转后需要更小的高度） */
		MAX_HEIGHT_ROTATED: '60vh',
		/** 旋转后的最大宽度 - 90% 视口宽度 */
		MAX_WIDTH_ROTATED: '90vw',
		/** 正常显示的最大高度 - 65% 视口高度 */
		NORMAL_MAX_HEIGHT: '65vh',
		/** 最小高度 - 120px，防止过小 */
		MIN_HEIGHT: '120px',
		/** 固定高度 - 150px，用于缩略图显示 */
		FIXED_HEIGHT: '150px',
		/** 自适应模式的最大高度 - 300px */
		ADAPTIVE_MAX_HEIGHT: '300px',
	},
	
	/** 复选框尺寸 - 用于批量选择功能 */
	CHECKBOX: {
		/** 复选框大小 - 18px */
		SIZE: '18px',
		/** 距离顶部的距离 - 6px */
		TOP: '6px',
		/** 距离右边的距离 - 6px */
		RIGHT: '6px',
	},
	
	/** 锁定按钮尺寸 - 用于文件锁定功能 */
	LOCK_BUTTON: {
		/** 距离顶部的距离 - 8px */
		TOP: '8px',
		/** 距离右边的距离 - 8px */
		RIGHT: '8px',
	},
	
	/** 文件夹图标尺寸 - 用于路径显示 */
	FOLDER_ICON: {
		/** 图标大小 - 18px */
		SIZE: '18px',
	},
} as const;

// ==================== 时间常量 ====================

/**
 * 时间相关配置
 * 单位：毫秒（ms）
 * 用于防抖、节流、延迟等时间控制
 */
export const TIMING = {
	/** 防抖延迟 - 用于减少频繁事件的处理次数 */
	DEBOUNCE: {
		/** 搜索/筛选防抖 - 500ms，用户输入时等待 500ms 后才执行搜索 */
		DEFAULT: 500,
		/** 文件变化防抖 - 1000ms，文件创建/修改/删除事件的防抖延迟 */
		FILE_CHANGE: 1000,
		/** 文件重命名防抖 - 2000ms，重命名操作通常是一系列操作的开始，需要更长延迟 */
		FILE_RENAME: 2000,
		/** 滚动防抖 - 100ms，滚动事件的防抖延迟 */
		SCROLL: 100,
	},
	
	/** 刷新间隔 - 定期刷新的时间间隔 */
	REFRESH: {
		/** 历史记录自动刷新 - 3000ms，每 3 秒刷新一次历史记录显示 */
		HISTORY: 3000,
	},
	
	/** 等待时间 - 操作之间的等待延迟 */
	WAIT: {
		/** 缓存刷新等待 - 300ms，刷新缓存前的等待时间 */
		CACHE_REFRESH: 300,
	},
} as const;

// ==================== 数量限制常量 ====================

/**
 * 数量限制和阈值配置
 * 用于控制性能、内存占用和用户体验
 */
export const LIMITS = {
	/** 批量渲染配置 - 用于虚拟滚动和性能优化 */
	BATCH: {
		/** 每批渲染的图片数量 - 20 张，一次渲染 20 张图片以平衡性能和体验 */
		SIZE: 20,
	},
	
	/** 历史记录限制 - 用于日志和操作记录 */
	HISTORY: {
		/** 自定义分组名称列表最大长度 - 20 个，防止过多的分组选项 */
		MAX_CUSTOM_GROUPS: 20,
	},
	
	/** 默认值 - 用于布局计算 */
	DEFAULTS: {
		/** 图片之间的间距 - 12px，用于计算网格布局的卡片宽度 */
		IMAGE_GAP: 12,
	},
	
	/** 滚动加载配置 - 用于无限滚动功能 */
	SCROLL: {
		/** 滚动触发比例 - 0.8，当滚动到 80% 时触发加载更多 */
		TRIGGER_RATIO: 0.8,
	},
} as const;

// ==================== 样式常量 ====================

/**
 * CSS 样式常量
 * 用于保持样式的一致性和便于主题切换
 */
export const STYLES = {
	/** 宽度相关样式 */
	WIDTH: {
		/** 全宽 - 100%，用于占满容器宽度 */
		FULL: '100%',
	},
	
	/** 字体粗细 */
	FONT_WEIGHT: {
		/** 中等粗细 - 500，用于强调文本 */
		MEDIUM: '500',
	},
	
	/** Obsidian 主题变量引用
	 * 这些变量会根据用户选择的主题自动调整
	 * 使用 CSS 变量确保与主题的一致性
	 */
	VARS: {
		/** 次级背景色 - 用于卡片、面板等次级元素 */
		BACKGROUND_SECONDARY: 'var(--background-secondary)',
		/** 正常文本色 - 用于主要文本内容 */
		TEXT_NORMAL: 'var(--text-normal)',
		/** 淡化文本色 - 用于辅助文本、提示等 */
		TEXT_MUTED: 'var(--text-muted)',
		/** 交互强调色 - 用于按钮、链接等交互元素 */
		INTERACTIVE_ACCENT: 'var(--interactive-accent)',
		/** 边框修饰色 - 用于分隔线、边框等 */
		BACKGROUND_MODIFIER_BORDER: 'var(--background-modifier-border)',
	},
} as const;

// ==================== 工具函数 ====================

/**
 * 计算图片卡片宽度
 * @param imagesPerRow 每行图片数量
 * @param gap 图片间距（px）
 * @returns CSS calc 表达式
 */
export function calculateItemWidth(
	imagesPerRow: number = 5,
	gap: number = LIMITS.DEFAULTS.IMAGE_GAP
): string {
	return `calc((100% - ${(imagesPerRow - 1) * gap}px) / ${imagesPerRow})`;
}

/**
 * 检查是否需要加载更多（滚动加载）
 * @param scrollTop 当前滚动位置
 * @param scrollHeight 总滚动高度
 * @param clientHeight 可见高度
 * @param ratio 触发比例（默认 0.8）
 * @returns 是否应该加载更多
 */
export function shouldLoadMore(
	scrollTop: number,
	scrollHeight: number,
	clientHeight: number,
	ratio: number = LIMITS.SCROLL.TRIGGER_RATIO
): boolean {
	return scrollTop + clientHeight >= scrollHeight * ratio;
}

