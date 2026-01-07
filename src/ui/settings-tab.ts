/**
 * 插件设置标签页模块
 * 
 * 提供插件设置界面，包括：
 * - 基础设置（扫描、文件夹、去重等）
 * - 主页设置（布局、卡片样式等）
 * - 性能设置（懒加载、缓存等）
 * - 删除设置（确认、回收站等）
 * - 快捷键设置
 * - 日志设置
 * - 锁定列表管理
 */

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import ImageManagementPlugin from '../main';
import { ImageManagementSettings } from '../settings';
import { LogViewerModal } from './log-viewer-modal';
import { ConfirmModal } from './confirm-modal';
import { SHORTCUT_DEFINITIONS, formatShortcut, parseShortcut } from '../utils/keyboard-shortcut-manager';
import { LogLevel } from '../utils/logger';

/** 视图类型标识符 */
export const VIEW_TYPE = 'image-manager-view';

/**
 * 插件设置标签页类
 * 
 * 功能：
 * - 分组显示所有设置项
 * - 支持折叠/展开设置分组
 * - 实时保存设置更改
 * - 管理锁定文件列表
 * - 自定义快捷键配置
 */
export class ImageManagementSettingTab extends PluginSettingTab {
	plugin: ImageManagementPlugin;

	constructor(app: App, plugin: ImageManagementPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		
		// 注册锁定列表改变的回调
		if (plugin.lockListManager) {
			plugin.lockListManager.setOnLockListChanged(() => {
				// 刷新设置标签页的锁定列表部分
				this.refreshLockListDisplay();
			});
		}
	}
	
	/**
	 * 刷新锁定列表显示
	 */
	private refreshLockListDisplay() {
		// 重新调用 display() 方法来刷新整个设置页面
		// 这会重新渲染锁定列表表格
		this.display();
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// 清空折叠状态集合，确保所有分组默认折叠
		this.collapsedSections.clear();

		// ========== 所有设置（默认全部折叠） ==========

		// 1. 基础设置
		const basicSection = this.createCollapsibleSection(containerEl, '📌 基础设置', 'basic', false);
		
		new Setting(basicSection.contentEl)
			.setName('自动扫描')
			.setDesc('启动时自动扫描整个笔记库中的图片文件')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoScan)
				.onChange(async (value) => {
					this.plugin.settings.autoScan = value;
					await this.plugin.saveSettings();
				}));

		new Setting(basicSection.contentEl)
			.setName('默认图片文件夹')
			.setDesc('设置扫描图片的默认路径（留空则扫描整个笔记库）')
			.addText(text => text
				.setPlaceholder('例如: images/')
				.setValue(this.plugin.settings.defaultImageFolder)
				.onChange(async (value) => {
					this.plugin.settings.defaultImageFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(basicSection.contentEl)
			.setName('包含子文件夹')
			.setDesc('扫描时自动包含所有子文件夹中的图片')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeSubfolders)
				.onChange(async (value) => {
					this.plugin.settings.includeSubfolders = value;
					await this.plugin.saveSettings();
				}));

		new Setting(basicSection.contentEl)
			.setName('MD5去重检测')
			.setDesc('通过计算图片的MD5哈希值自动检测重复的图片文件，节省存储空间')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDeduplication)
				.onChange(async (value) => {
					this.plugin.settings.enableDeduplication = value;
					await this.plugin.saveSettings();
				}));

		// 2. 主页设置（图片管理主页的布局和显示）
		const homeSection = this.createCollapsibleSection(containerEl, '🏠 主页设置', 'home', false);

		// 布局设置（二级标题）
		const layoutTitle = homeSection.contentEl.createEl('h4', { text: '📐 布局' });
		layoutTitle.style.marginBottom = '12px';
		layoutTitle.style.paddingBottom = '8px';
		layoutTitle.style.borderBottom = '1px solid var(--background-modifier-border)';

		new Setting(homeSection.contentEl)
			.setName('每行显示数量')
			.setDesc('图片画廊中每行显示的图片数量（范围：1-10）')
			.addSlider(slider => {
				const currentValue = (typeof this.plugin.settings.imagesPerRow === 'number' && 
					this.plugin.settings.imagesPerRow >= 1 && 
					this.plugin.settings.imagesPerRow <= 10) 
					? this.plugin.settings.imagesPerRow 
					: 5;
				
				slider
					.setLimits(1, 10, 1)
					.setValue(currentValue)
					.setDynamicTooltip()
					.onChange(async (value) => {
						const validValue = Math.max(1, Math.min(10, Math.round(value)));
						this.plugin.settings.imagesPerRow = validValue;
						await this.plugin.saveSettings();
						const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
						if (view) {
							await (view.view as any).scanImages();
						}
					});
			});

		new Setting(homeSection.contentEl)
			.setName('卡片间距')
			.setDesc('图片卡片之间的间距（像素，范围：4-24）')
			.addSlider(slider => slider
				.setLimits(4, 24, 2)
				.setValue(this.plugin.settings.cardSpacing)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.cardSpacing = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		new Setting(homeSection.contentEl)
			.setName('卡片圆角')
			.setDesc('图片卡片的圆角大小（像素，范围：0-20）')
			.addSlider(slider => slider
				.setLimits(0, 20, 1)
				.setValue(this.plugin.settings.cardBorderRadius)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.cardBorderRadius = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		new Setting(homeSection.contentEl)
			.setName('固定图片高度')
			.setDesc('关闭"自适应大小"时的图片高度（像素，范围：100-400）')
			.addSlider(slider => slider
				.setLimits(100, 400, 10)
				.setValue(this.plugin.settings.fixedImageHeight)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.fixedImageHeight = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		new Setting(homeSection.contentEl)
			.setName('统一卡片高度')
			.setDesc('同一行的图片卡片保持相同高度')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.uniformCardHeight)
				.onChange(async (value) => {
					this.plugin.settings.uniformCardHeight = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		new Setting(homeSection.contentEl)
			.setName('启用悬停效果')
			.setDesc('鼠标悬停时显示阴影和缩放动画')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableHoverEffect)
				.onChange(async (value) => {
					this.plugin.settings.enableHoverEffect = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		// 默认值设置（二级标题）
		const defaultsTitle = homeSection.contentEl.createEl('h4', { text: '⚙️ 默认值' });
		defaultsTitle.style.marginTop = '20px';
		defaultsTitle.style.marginBottom = '12px';
		defaultsTitle.style.paddingBottom = '8px';
		defaultsTitle.style.borderBottom = '1px solid var(--background-modifier-border)';

		new Setting(homeSection.contentEl)
			.setName('默认排序方式')
			.setDesc('图片列表的默认排序依据')
			.addDropdown(dropdown => dropdown
				.addOption('name', '文件名')
				.addOption('size', '文件大小')
				.addOption('date', '修改日期')
				.addOption('dimensions', '图片尺寸')
				.setValue(this.plugin.settings.defaultSortBy)
				.onChange(async (value) => {
					this.plugin.settings.defaultSortBy = value as 'name' | 'size' | 'date' | 'dimensions';
					await this.plugin.saveSettings();
				}));

		new Setting(homeSection.contentEl)
			.setName('默认排序顺序')
			.setDesc('升序（A-Z，小到大）或降序（Z-A，大到小）')
			.addDropdown(dropdown => dropdown
				.addOption('asc', '升序')
				.addOption('desc', '降序')
				.setValue(this.plugin.settings.defaultSortOrder)
				.onChange(async (value) => {
					this.plugin.settings.defaultSortOrder = value as 'asc' | 'desc';
					await this.plugin.saveSettings();
				}));

		new Setting(homeSection.contentEl)
			.setName('默认筛选类型')
			.setDesc('默认显示哪种格式的图片')
			.addDropdown(dropdown => dropdown
				.addOption('all', '全部')
				.addOption('png', 'PNG')
				.addOption('jpg', 'JPG')
				.addOption('gif', 'GIF')
				.addOption('webp', 'WebP')
				.addOption('svg', 'SVG')
				.addOption('bmp', 'BMP')
				.setValue(this.plugin.settings.defaultFilterType)
				.onChange(async (value) => {
					this.plugin.settings.defaultFilterType = value as 'all' | 'png' | 'jpg' | 'gif' | 'webp' | 'svg' | 'bmp';
					await this.plugin.saveSettings();
				}));

		// 统计信息设置（二级标题）
		const statsTitle = homeSection.contentEl.createEl('h4', { text: '📊 统计信息' });
		statsTitle.style.marginTop = '20px';
		statsTitle.style.marginBottom = '12px';
		statsTitle.style.paddingBottom = '8px';
		statsTitle.style.borderBottom = '1px solid var(--background-modifier-border)';

		new Setting(homeSection.contentEl)
			.setName('显示统计信息')
			.setDesc('显示图片总数量、总大小等统计数据')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showStatistics)
				.onChange(async (value) => {
					this.plugin.settings.showStatistics = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		new Setting(homeSection.contentEl)
			.setName('统计信息位置')
			.setDesc('统计面板显示在页面顶部还是底部')
			.addDropdown(dropdown => dropdown
				.addOption('top', '顶部')
				.addOption('bottom', '底部')
				.setValue(this.plugin.settings.statisticsPosition)
				.onChange(async (value) => {
					this.plugin.settings.statisticsPosition = value as 'top' | 'bottom';
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		// 3. 图片卡片设置
		const cardSection = this.createCollapsibleSection(containerEl, '🖼️ 图片卡片', 'card', false);

		new Setting(cardSection.contentEl)
			.setName('纯净画廊')
			.setDesc('开启后只显示图片，隐藏所有信息（文件名、大小、尺寸、锁定图标、选择框等）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.pureGallery)
				.onChange(async (value) => {
					this.plugin.settings.pureGallery = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		new Setting(cardSection.contentEl)
			.setName('自适应图片大小')
			.setDesc('图片按原始宽高比自适应显示（类似 Notion 效果），关闭则固定高度显示')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.adaptiveImageSize)
				.onChange(async (value) => {
					this.plugin.settings.adaptiveImageSize = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		new Setting(cardSection.contentEl)
			.setName('显示图片名称')
			.setDesc('在图片卡片上显示文件名')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showImageName)
				.onChange(async (value) => {
					this.plugin.settings.showImageName = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		new Setting(cardSection.contentEl)
			.setName('图片名称换行')
			.setDesc('当图片名称过长时允许换行显示')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.imageNameWrap)
				.onChange(async (value) => {
					this.plugin.settings.imageNameWrap = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		new Setting(cardSection.contentEl)
			.setName('显示锁定图标')
			.setDesc('显示被锁定文件右上角的🔒图标')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showLockIcon)
				.onChange(async (value) => {
					this.plugin.settings.showLockIcon = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		new Setting(cardSection.contentEl)
			.setName('显示图片大小')
			.setDesc('在图片卡片上显示文件大小')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showImageSize)
				.onChange(async (value) => {
					this.plugin.settings.showImageSize = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		new Setting(cardSection.contentEl)
			.setName('显示图片尺寸')
			.setDesc('在图片卡片上显示宽度×高度')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showImageDimensions)
				.onChange(async (value) => {
					this.plugin.settings.showImageDimensions = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		new Setting(cardSection.contentEl)
			.setName('显示图片序号')
			.setDesc('在图片卡片右上角显示序号（例如：1/100, 2/100...），方便快速定位')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showImageIndex)
				.onChange(async (value) => {
					this.plugin.settings.showImageIndex = value;
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				}));

		// 3. 删除设置
		const deleteSection = this.createCollapsibleSection(containerEl, '🗑️ 删除与回收站', 'delete', false);

		// 删除设置说明
		const deleteIntro = deleteSection.contentEl.createDiv();
		deleteIntro.style.color = 'var(--text-muted)';
		deleteIntro.style.marginBottom = '16px';
		deleteIntro.style.padding = '12px';
		deleteIntro.style.backgroundColor = 'var(--background-secondary)';
		deleteIntro.style.borderRadius = '6px';
		deleteIntro.style.fontSize = '0.9em';
		deleteIntro.style.borderLeft = '3px solid var(--interactive-accent)';
		deleteIntro.innerHTML = `
			<p style="margin: 0 0 8px 0; font-weight: 600;">🛡️ 删除保护机制：</p>
			<ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
				<li><strong>删除前确认</strong>：显示确认对话框，防止误删（推荐开启）</li>
				<li><strong>系统回收站</strong>：文件移到操作系统回收站，可通过系统恢复</li>
				<li><strong>插件回收站</strong>：文件移到 .trash 文件夹，保留完整路径信息，可在插件内恢复</li>
			</ul>
			<p style="margin: 8px 0 0 0; font-size: 0.85em;">💡 提示：建议同时启用"插件回收站"和"删除前确认"，双重保护你的文件安全。</p>
		`;

		// 基础设置
		new Setting(deleteSection.contentEl)
			.setName('删除前确认')
			.setDesc('删除文件前显示确认对话框（推荐开启）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.confirmBeforeDelete)
				.onChange(async (value) => {
					this.plugin.settings.confirmBeforeDelete = value;
					await this.plugin.saveSettings();
				}));

		new Setting(deleteSection.contentEl)
			.setName('移到系统回收站')
			.setDesc('删除文件时移到操作系统回收站（Windows/Mac/Linux 回收站），可通过系统恢复')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.moveToSystemTrash)
				.onChange(async (value) => {
					this.plugin.settings.moveToSystemTrash = value;
					await this.plugin.saveSettings();
				}));

		// 插件回收站设置
		const trashDivider = deleteSection.contentEl.createEl('div');
		trashDivider.style.cssText = 'margin: 20px 0 12px 0; padding-top: 12px; border-top: 1px solid var(--background-modifier-border);';
		const trashTitle = trashDivider.createEl('h4', { text: '📦 插件回收站' });
		trashTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 0.95em; font-weight: 600; color: var(--text-normal);';

		new Setting(deleteSection.contentEl)
			.setName('启用插件回收站')
			.setDesc('删除文件时移动到 .trash 文件夹，保留完整路径信息。支持查看、恢复、永久删除。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enablePluginTrash)
				.onChange(async (value) => {
					this.plugin.settings.enablePluginTrash = value;
					await this.plugin.saveSettings();
					// 如果启用，确保回收站文件夹存在
					if (value) {
						await this.plugin.trashManager.ensureTrashFolder();
						new Notice('插件回收站已启用');
					}
				}));

		new Setting(deleteSection.contentEl)
			.setName('恢复文件夹')
			.setDesc('从回收站恢复文件时的目标文件夹。留空或输入"恢复的图片"将恢复到默认文件夹；输入"original"恢复到原始路径。')
			.addText(text => text
				.setPlaceholder('恢复的图片')
				.setValue(this.plugin.settings.trashRestorePath || '恢复的图片')
				.onChange(async (value) => {
					const trimmed = value.trim();
					this.plugin.settings.trashRestorePath = trimmed || '恢复的图片';
					await this.plugin.saveSettings();
				}));

		// 回收站管理
		const manageDivider = deleteSection.contentEl.createEl('div');
		manageDivider.style.cssText = 'margin: 20px 0 12px 0; padding-top: 12px; border-top: 1px solid var(--background-modifier-border);';
		const manageTitle = manageDivider.createEl('h4', { text: '🔧 回收站管理' });
		manageTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 0.95em; font-weight: 600; color: var(--text-normal);';

		new Setting(deleteSection.contentEl)
			.setName('打开回收站')
			.setDesc('查看、搜索、恢复或永久删除回收站中的文件')
			.addButton(button => button
				.setButtonText('🗑️ 打开回收站')
				.setCta()
				.onClick(() => {
					const { TrashModal } = require('./trash-modal');
					new TrashModal(this.app, this.plugin).open();
				}));

		// 功能说明
		const trashFeatures = deleteSection.contentEl.createDiv();
		trashFeatures.style.cssText = 'margin-top: 16px; padding: 10px 12px; background: var(--background-secondary); border-radius: 6px; font-size: 0.85em; color: var(--text-muted);';
		trashFeatures.innerHTML = `
			<p style="margin: 0 0 6px 0; font-weight: 600;">📋 回收站功能：</p>
			<ul style="margin: 0; padding-left: 20px; line-height: 1.5;">
				<li>查看已删除文件的预览、路径、大小、删除时间</li>
				<li>搜索和排序回收站中的文件</li>
				<li>恢复文件到指定文件夹或原始路径</li>
				<li>永久删除选中文件或清空回收站</li>
				<li>支持批量操作（全选、批量恢复、批量删除）</li>
			</ul>
			<p style="margin: 6px 0 0 0; font-size: 0.9em;">⚠️ 注意：只有通过插件删除的文件才会进入回收站。在 Obsidian 文件管理器或文件系统中直接删除的文件无法拦截。</p>
		`;

		// 4. 引用与预览（合并引用设置和预览设置）
		const referenceSection = this.createCollapsibleSection(containerEl, '🔗 引用与预览', 'reference', false);

		// 图片引用格式说明
		const referenceFormatIntro = referenceSection.contentEl.createDiv();
		referenceFormatIntro.style.color = 'var(--text-muted)';
		referenceFormatIntro.style.marginBottom = '12px';
		referenceFormatIntro.style.padding = '10px 12px';
		referenceFormatIntro.style.backgroundColor = 'var(--background-secondary)';
		referenceFormatIntro.style.borderRadius = '6px';
		referenceFormatIntro.style.fontSize = '0.9em';
		referenceFormatIntro.style.borderLeft = '3px solid var(--interactive-accent)';
		referenceFormatIntro.innerHTML = `
			<p style="margin: 0 0 8px 0; font-weight: 600;">📝 图片引用格式支持说明：</p>
			<ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
				<li><strong>Wiki 格式</strong>：<code>![[image.png|显示文本|100x200]]</code> ✅ 支持显示文本和尺寸设置</li>
				<li><strong>HTML 格式</strong>：<code>&lt;img src="image.png" alt="文本" width="100" height="200"&gt;</code> ✅ 支持显示文本和尺寸设置</li>
				<li><strong>Markdown 格式</strong>：<code>![alt](image.png)</code> ⚠️ 仅支持显示文本（alt），<strong>不支持尺寸设置</strong></li>
			</ul>
			<p style="margin: 8px 0 0 0; font-size: 0.85em;">💡 提示：如需设置图片尺寸，建议使用 Wiki 或 HTML 格式。插件会自动检测并更新所有格式的引用链接。</p>
		`;

		new Setting(referenceSection.contentEl)
			.setName('保持详情页打开')
			.setDesc('点击"前往笔记"时，保持图片详情页打开（在右侧面板查看笔记），而非关闭详情页')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.keepModalOpen)
				.onChange(async (value) => {
					this.plugin.settings.keepModalOpen = value;
					await this.plugin.saveSettings();
				}));

		new Setting(referenceSection.contentEl)
			.setName('显示引用时间')
			.setDesc('在引用信息区域显示笔记文件的最后修改时间（显示在文件名的右侧）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showReferenceTime)
				.onChange(async (value) => {
					this.plugin.settings.showReferenceTime = value;
					await this.plugin.saveSettings();
				}));

		new Setting(referenceSection.contentEl)
			.setName('鼠标滚轮模式')
			.setDesc('在图片详情页中，当鼠标位于图片上时，滚轮的默认行为')
			.addDropdown(dropdown => dropdown
				.addOption('zoom', '缩放图片（默认）')
				.addOption('scroll', '切换图片')
				.setValue(this.plugin.settings.defaultWheelMode)
				.onChange(async (value) => {
					this.plugin.settings.defaultWheelMode = value as 'scroll' | 'zoom';
					await this.plugin.saveSettings();
					
					// 更新所有打开的图片详情页
					const leaves = this.app.workspace.getLeavesOfType('modal');
					for (const leaf of leaves) {
						const view = leaf.view as any;
						if (view && view.isImageDetailModal) {
							if (view.isScrollMode !== undefined) {
								if (value === 'scroll') {
									view.isScrollMode = true;
								} else {
									view.isScrollMode = false;
								}
								if (view.updateScrollModeIndicator) {
									view.updateScrollModeIndicator();
								}
							}
						}
					}
				}));

		// 5. 重命名设置
		const pathNamingSection = this.createCollapsibleSection(containerEl, '🔄 重命名设置', 'path-naming', false);

		new Setting(pathNamingSection.contentEl)
			.setName('自动生成文件名')
			.setDesc('根据笔记标题自动生成序列文件名（例如：笔记标题-1.png、笔记标题-2.png）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoGenerateNames)
				.onChange(async (value) => {
					this.plugin.settings.autoGenerateNames = value;
					await this.plugin.saveSettings();
				}));

		new Setting(pathNamingSection.contentEl)
			.setName('笔记路径深度')
			.setDesc('重命名时使用笔记路径的层级数（1-5级，例如：父目录_子目录_笔记_1.png）')
			.addSlider(slider => slider
				.setLimits(1, 5, 1)
				.setValue(this.plugin.settings.pathNamingDepth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.pathNamingDepth = value;
					await this.plugin.saveSettings();
				}));

		new Setting(pathNamingSection.contentEl)
			.setName('重名处理方式')
			.setDesc('当多个图片生成相同的文件名时，如何处理（默认：提示并跳过）')
			.addDropdown(dropdown => dropdown
				.addOption('prompt', '提示并跳过')
				.addOption('skip-silent', '安静跳过（不提示）')
				.addOption('use-newest', '按最新文件命名')
				.addOption('use-oldest', '按最旧文件命名')
				.setValue(this.plugin.settings.duplicateNameHandling)
				.onChange(async (value) => {
					this.plugin.settings.duplicateNameHandling = value as 'prompt' | 'skip-silent' | 'use-newest' | 'use-oldest';
					await this.plugin.saveSettings();
				}));

		new Setting(pathNamingSection.contentEl)
			.setName('多笔记引用处理')
			.setDesc('当图片被多个笔记引用时的处理方式')
			.addDropdown(dropdown => dropdown
				.addOption('first', '使用第一个引用的笔记')
				.addOption('latest', '使用最新修改的笔记')
				.addOption('prompt', '每次提示选择')
				.addOption('all', '为每个笔记创建副本')
				.setValue(this.plugin.settings.multipleReferencesHandling)
				.onChange(async (value) => {
					this.plugin.settings.multipleReferencesHandling = value as 'first' | 'latest' | 'prompt' | 'all';
					await this.plugin.saveSettings();
				}));

		new Setting(pathNamingSection.contentEl)
			.setName('保存批量重命名日志')
			.setDesc('批量重命名后在根目录生成详细的操作记录文件（包含原路径、新路径、引用更新等信息）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.saveBatchRenameLog)
				.onChange(async (value) => {
					this.plugin.settings.saveBatchRenameLog = value;
					await this.plugin.saveSettings();
				}));

		// 6. 性能优化
		const performanceSection = this.createCollapsibleSection(containerEl, '⚡ 性能优化', 'performance', false);

		new Setting(performanceSection.contentEl)
			.setName('启用懒加载')
			.setDesc('图片进入可视区域时才开始加载，提升大量图片时的性能')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableLazyLoading)
				.onChange(async (value) => {
					this.plugin.settings.enableLazyLoading = value;
					await this.plugin.saveSettings();
				}));

		new Setting(performanceSection.contentEl)
			.setName('懒加载延迟')
			.setDesc('图片懒加载的延迟时间（毫秒，范围：0-1000）')
			.addSlider(slider => slider
				.setLimits(0, 1000, 50)
				.setValue(this.plugin.settings.lazyLoadDelay)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.lazyLoadDelay = value;
					await this.plugin.saveSettings();
				}));

		new Setting(performanceSection.contentEl)
			.setName('最大缓存数量')
			.setDesc('最多缓存多少张图片的数据（范围：50-500）')
			.addSlider(slider => slider
				.setLimits(50, 500, 10)
				.setValue(this.plugin.settings.maxCacheSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maxCacheSize = value;
					await this.plugin.saveSettings();
				}));

		// 9. 搜索设置
		const searchSection = this.createCollapsibleSection(containerEl, '🔍 搜索设置', 'search', false);

		new Setting(searchSection.contentEl)
			.setName('大小写敏感')
			.setDesc('搜索时区分大小写（例如："Image"和"image"视为不同）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.searchCaseSensitive)
				.onChange(async (value) => {
					this.plugin.settings.searchCaseSensitive = value;
					await this.plugin.saveSettings();
				}));

		new Setting(searchSection.contentEl)
			.setName('实时搜索延迟')
			.setDesc('输入搜索关键词后延迟多久开始搜索（毫秒，范围：0-1000）')
			.addSlider(slider => slider
				.setLimits(0, 1000, 50)
				.setValue(this.plugin.settings.liveSearchDelay)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.liveSearchDelay = value;
					await this.plugin.saveSettings();
				}));

		new Setting(searchSection.contentEl)
			.setName('搜索包含路径')
			.setDesc('搜索时不仅匹配文件名，也匹配文件路径')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.searchInPath)
				.onChange(async (value) => {
					this.plugin.settings.searchInPath = value;
					await this.plugin.saveSettings();
				}));

		// 10. 批量操作设置
		const batchSection = this.createCollapsibleSection(containerEl, '📦 批量操作设置', 'batch', false);

		new Setting(batchSection.contentEl)
			.setName('批量操作最大数量')
			.setDesc('一次批量操作最多处理多少个文件（范围：100-5000）')
			.addSlider(slider => slider
				.setLimits(100, 5000, 100)
				.setValue(this.plugin.settings.maxBatchOperations)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maxBatchOperations = value;
					await this.plugin.saveSettings();
				}));

		new Setting(batchSection.contentEl)
			.setName('批量确认阈值')
			.setDesc('批量操作超过此数量时需要二次确认（范围：5-100）')
			.addSlider(slider => slider
				.setLimits(5, 100, 5)
				.setValue(this.plugin.settings.batchConfirmThreshold)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.batchConfirmThreshold = value;
					await this.plugin.saveSettings();
				}));

		new Setting(batchSection.contentEl)
			.setName('显示批量操作进度')
			.setDesc('批量操作时显示进度条和当前处理的文件')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showBatchProgress)
				.onChange(async (value) => {
					this.plugin.settings.showBatchProgress = value;
					await this.plugin.saveSettings();
				}));

		// 11. 移动端适配
		const mobileSection = this.createCollapsibleSection(containerEl, '📱 移动端适配', 'mobile', false);

		// 移动端适配说明
		const mobileIntro = mobileSection.contentEl.createDiv();
		mobileIntro.style.color = 'var(--text-muted)';
		mobileIntro.style.marginBottom = '16px';
		mobileIntro.style.padding = '12px';
		mobileIntro.style.backgroundColor = 'var(--background-secondary)';
		mobileIntro.style.borderRadius = '6px';
		mobileIntro.style.fontSize = '0.9em';
		mobileIntro.style.borderLeft = '3px solid var(--interactive-accent)';
		mobileIntro.innerHTML = `
			<p style="margin: 0 0 8px 0; font-weight: 600;">📱 移动端适配说明</p>
			<ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
				<li><strong>响应式布局</strong>：根据屏幕尺寸自动调整每行显示的图片数量</li>
				<li><strong>分设备优化</strong>：为平板、手机横屏、手机竖屏分别设置显示参数</li>
				<li><strong>界面优化</strong>：支持紧凑工具栏、隐藏非必要信息等移动端专属选项</li>
			</ul>
		`;

		new Setting(mobileSection.contentEl)
			.setName('移动端每行图片数量')
			.setDesc('自定义移动端显示的图片列数（1-5），留空则根据屏幕宽度自动调整')
			.addSlider(slider => slider
				.setLimits(1, 5, 1)
				.setValue(this.plugin.settings.mobileImagesPerRow || 3)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.mobileImagesPerRow = value;
					await this.plugin.saveSettings();
				}));

		new Setting(mobileSection.contentEl)
			.setName('启用紧凑工具栏')
			.setDesc('在移动端使用更紧凑的工具栏布局，节省空间')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableCompactToolbar || false)
				.onChange(async (value) => {
					this.plugin.settings.enableCompactToolbar = value;
					await this.plugin.saveSettings();
				}));

		new Setting(mobileSection.contentEl)
			.setName('隐藏非必要信息')
			.setDesc('在移动端隐藏图片尺寸、锁定图标等次要信息，保持界面简洁')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideNonEssentialInfo !== false)
				.onChange(async (value) => {
					this.plugin.settings.hideNonEssentialInfo = value;
					await this.plugin.saveSettings();
				}));

		new Setting(mobileSection.contentEl)
			.setName('平板端每行图片数量')
			.setDesc('平板设备（768-1199px）上每行显示的图片数量')
			.addSlider(slider => slider
				.setLimits(1, 5, 1)
				.setValue(this.plugin.settings.tabletImagesPerRow || 3)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.tabletImagesPerRow = value;
					await this.plugin.saveSettings();
				}));

		new Setting(mobileSection.contentEl)
			.setName('手机横屏每行图片数量')
			.setDesc('手机横屏（480-767px）时每行显示的图片数量')
			.addSlider(slider => slider
				.setLimits(1, 5, 1)
				.setValue(this.plugin.settings.phoneLandscapeImagesPerRow || 2)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.phoneLandscapeImagesPerRow = value;
					await this.plugin.saveSettings();
				}));

		new Setting(mobileSection.contentEl)
			.setName('手机竖屏每行图片数量')
			.setDesc('手机竖屏（< 480px）时每行显示的图片数量')
			.addSlider(slider => slider
				.setLimits(1, 2, 1)
				.setValue(this.plugin.settings.phonePortraitImagesPerRow || 1)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.phonePortraitImagesPerRow = value;
					await this.plugin.saveSettings();
				}));

		// 12. 扩展功能
		const extensionSection = this.createCollapsibleSection(containerEl, '🧩 扩展功能', 'extension', false);

		// 12.1 在Android相册中隐藏Obsidian图片
		new Setting(extensionSection.contentEl)
			.setName('🛡️ 在 Android 相册中隐藏图片')
			.setDesc('开启后在笔记库根目录创建 .nomedia 文件，Android 相册将不再扫描此目录（仅对 Android 有效）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.createNomediaFile || false)
				.onChange(async (value) => {
					this.plugin.settings.createNomediaFile = value;
					await this.plugin.saveSettings();
					
					if (value) {
						// 创建 .nomedia 文件
						const result = await this.plugin.createNomediaFile();
						new Notice(result.message);
					} else {
						// 删除 .nomedia 文件
						const result = await this.plugin.deleteNomediaFile();
						new Notice(result.message);
					}
				}));

		// 10. 锁定文件
		const ignoredFilesSection = this.createCollapsibleSection(containerEl, '🔒 锁定文件', 'ignored-files', false);

		// 锁定文件说明
		const ignoredFilesIntro = ignoredFilesSection.contentEl.createDiv();
		ignoredFilesIntro.style.color = 'var(--text-muted)';
		ignoredFilesIntro.style.marginBottom = '16px';
		ignoredFilesIntro.style.padding = '12px';
		ignoredFilesIntro.style.backgroundColor = 'var(--background-secondary)';
		ignoredFilesIntro.style.borderRadius = '6px';
		ignoredFilesIntro.style.fontSize = '0.9em';
		ignoredFilesIntro.style.borderLeft = '3px solid var(--interactive-accent)';
		ignoredFilesIntro.innerHTML = `
			<p style="margin: 0 0 8px 0; font-weight: 600;">🔒 文件锁定机制</p>
			<ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
				<li><strong>核心功能</strong>：被锁定的文件在批量重命名、移动、删除等操作时将被跳过，防止误操作</li>
				<li><strong>锁定方式</strong>：基于哈希值、文件路径、文件名的组合键唯一标识每个文件，支持独立锁定重复文件</li>
				<li><strong>重复文件处理</strong>：即使多个文件内容相同（哈希值相同），也可以独立锁定或解锁每一个</li>
				<li><strong>元数据追踪</strong>：系统自动记录锁定时的文件名、位置和时间，即使文件被移动或重命名也能准确识别</li>
				<li><strong>智能清理</strong>：解锁文件时，只有当所有重复文件都解锁后，才会从去重列表中移除哈希值</li>
			</ul>
			<p style="margin: 8px 0 0 0; font-size: 0.85em; line-height: 1.6;">
				<strong>💡 快速操作：</strong><br>
				• 在图片卡片上右键 → 选择"锁定"快速锁定<br>
				• 在图片详情页面点击"🔒 锁定"按钮<br>
				• 在此表格中点击"✕"按钮解锁单个文件<br>
				• 使用"清除本页"或"清除所有"批量管理锁定
			</p>
		`;

		// 创建统一的锁定列表表格
		const tableContainer = ignoredFilesSection.contentEl.createDiv();
		tableContainer.style.marginBottom = '16px';
		tableContainer.style.overflowX = 'auto';

		const table = tableContainer.createEl('table');
		table.style.width = '100%';
		table.style.borderCollapse = 'collapse';
		table.style.fontSize = '0.9em';
		table.style.backgroundColor = 'var(--background-secondary)';
		table.style.borderRadius = '6px';
		table.style.overflow = 'hidden';

	// 表头
	const thead = table.createEl('thead');
	const headerRow = thead.createEl('tr');
	headerRow.style.backgroundColor = 'var(--background-modifier-hover)';

	const headers = ['📝 名称', '📍 位置', '🔐 哈希值', '操作'] as const;
	const headerWidths: Record<string, string> = { '📝 名称': '120px', '📍 位置': '150px', '🔐 哈希值': '200px', '操作': '80px' };
	headers.forEach(header => {
		const th = headerRow.createEl('th');
		th.textContent = header;
		th.style.padding = '8px 12px';
		th.style.textAlign = 'left';
		th.style.fontWeight = '600';
		th.style.color = 'var(--text-normal)';
		if (header === '操作') {
			th.style.textAlign = 'center';
		}
		if (headerWidths[header]) {
			th.style.width = headerWidths[header];
		}
	});

		// 表体
	const tbody = table.createEl('tbody');

	// 解析并显示锁定的文件
	const lockKeys = (this.plugin.settings.ignoredFiles || '').split('\n').filter(k => k.trim());
	const ignoredHashList = (this.plugin.settings.ignoredHashes || '').split('\n').filter(k => k.trim());
	let hashMetadata = this.plugin.settings.ignoredHashMetadata || {};
	let needsSave = false;
	let validLockKeys: string[] = [];
	let validHashList: string[] = [];

	// 构建所有锁定项目，同时清理没有元数据的旧数据
	const allItems = lockKeys.map((lockKey, idx) => {
		// 文件名存储在 ignoredFiles 中
		const fileName = lockKey;
		
		// 查找对应的哈希值和元数据
		let hash = '';
		let filePath = '未知位置';
		let metadata = null;
		
		// 策略1：首先尝试按索引匹配（文件名和哈希值顺序一致）
		if (idx < ignoredHashList.length) {
			const potentialHash = ignoredHashList[idx];
			const potentialMeta = hashMetadata[potentialHash];
			if (potentialMeta && potentialMeta.fileName === fileName) {
				hash = potentialHash;
				filePath = potentialMeta.filePath || '未知位置';
				metadata = potentialMeta;
			}
		}
		
		// 策略2：如果按索引匹配失败，遍历元数据查找匹配的文件
		if (!metadata) {
			for (const hashKey in hashMetadata) {
				const meta = hashMetadata[hashKey];
				if (meta && meta.fileName === fileName) {
					hash = hashKey;
					filePath = meta.filePath || '未知位置';
					metadata = meta;
					break;
				}
			}
		}
		
		// 策略3：如果还是没找到，尝试模糊匹配（文件名包含关系）
		if (!metadata) {
			for (const hashKey in hashMetadata) {
				const meta = hashMetadata[hashKey];
				if (meta && meta.fileName && fileName.toLowerCase().includes(meta.fileName.toLowerCase())) {
					hash = hashKey;
					filePath = meta.filePath || '未知位置';
					metadata = meta;
					break;
				}
			}
		}
		
		// 如果找到了有效的元数据，保留这条数据
		if (metadata && hash) {
			validLockKeys.push(fileName);
			validHashList.push(hash);
			return {
				type: 'lock',
				value: lockKey,
				index: idx,
				hash: hash,
				fileName: fileName,
				filePath: filePath
			};
		}
		
		// 如果没有找到元数据，标记为需要删除
		return null;
	}).filter(item => item !== null) as Array<any>;
	
	// 如果有数据被删除，更新设置
	if (validLockKeys.length < lockKeys.length) {
		this.plugin.settings.ignoredFiles = validLockKeys.join('\n');
		this.plugin.settings.ignoredHashes = validHashList.join('\n');
		needsSave = true;
	}
	
	// 保存更新
	if (needsSave) {
		this.plugin.settings.ignoredHashMetadata = hashMetadata;
		this.plugin.saveSettings().catch(err => {
			console.error('保存设置失败:', err);
		});
	}

	// 分页设置
	let currentPage = 1;
	const pageSize = 10;
	const totalPages = Math.ceil(allItems.length / pageSize);

	// 渲染表格行的函数
	const renderTableRows = (page: number) => {
		tbody.empty();
		const startIdx = (page - 1) * pageSize;
		const endIdx = startIdx + pageSize;
		const pageItems = allItems.slice(startIdx, endIdx);

		if (pageItems.length === 0 && allItems.length === 0) {
			const emptyRow = tbody.createEl('tr');
			const emptyCell = emptyRow.createEl('td');
			emptyCell.colSpan = 5;
			emptyCell.textContent = '暂无锁定文件';
			emptyCell.style.padding = '20px 12px';
			emptyCell.style.textAlign = 'center';
			emptyCell.style.color = 'var(--text-muted)';
			return;
		}

		pageItems.forEach((item) => {
			const row = tbody.createEl('tr');
			row.style.borderBottom = '1px solid var(--background-modifier-border)';
			row.style.cursor = 'text';
			row.style.userSelect = 'text';

			// 名称列 - 显示当前文件名
			const nameCell = row.createEl('td');
			nameCell.textContent = item.fileName;
			nameCell.style.padding = '6px 12px';
			nameCell.style.color = 'var(--text-normal)';
			nameCell.style.fontFamily = 'monospace';
			nameCell.style.wordBreak = 'break-all';
			nameCell.style.fontSize = '0.9em';
			nameCell.style.userSelect = 'text';

			// 位置列 - 显示当前文件位置
			const pathCell = row.createEl('td');
			pathCell.textContent = item.filePath;
			pathCell.style.padding = '6px 12px';
			pathCell.style.color = 'var(--text-muted)';
			pathCell.style.fontSize = '0.85em';
			pathCell.style.wordBreak = 'break-all';
			pathCell.style.userSelect = 'text';

			// 哈希值列 - 显示锁定的哈希值
			const hashCell = row.createEl('td');
			// 显示哈希值，如果没有则显示"N/A"
			hashCell.textContent = item.hash || 'N/A';
			hashCell.style.fontFamily = 'monospace';
			hashCell.style.fontSize = '0.85em';
			hashCell.style.padding = '6px 12px';
			hashCell.style.color = item.hash ? 'var(--text-normal)' : 'var(--text-muted)';
			hashCell.style.wordBreak = 'break-all';
			hashCell.style.userSelect = 'text';

			// 操作列
			const actionCell = row.createEl('td');
			actionCell.style.padding = '6px 12px';
			actionCell.style.textAlign = 'center';
			actionCell.style.userSelect = 'none';
		
			const deleteBtn = actionCell.createEl('span');
			deleteBtn.textContent = '✕';
			deleteBtn.style.cursor = 'pointer';
			deleteBtn.style.color = 'var(--text-muted)';
			deleteBtn.style.fontSize = '14px';
			deleteBtn.addEventListener('mouseenter', () => {
				deleteBtn.style.color = 'var(--text-error)';
			});
			deleteBtn.addEventListener('mouseleave', () => {
				deleteBtn.style.color = 'var(--text-muted)';
			});
			deleteBtn.addEventListener('click', async () => {
				const fileName = item.value;
				const hash = item.hash;
			
				// 使用 LockListManager 移除锁定（跳过回调，避免刷新整个页面）
				await this.plugin.lockListManager.removeLockedFile(fileName, hash, undefined, true);
				
				// 只更新表格，不折叠设置页
				lockKeys.splice(item.index, 1);
				allItems.splice(item.index, 1);
				renderTableRows(currentPage);
				
				// 更新统计信息
				statsDiv.innerHTML = `📊 已锁定: ${lockKeys.length} 个`;
				
				// 更新分页信息
				const newTotalPages = Math.ceil(allItems.length / pageSize);
				paginationInfo.textContent = `第 ${Math.min(currentPage, newTotalPages)} / ${newTotalPages} 页`;
				
				// 更新分页按钮状态
				prevBtn.disabled = currentPage <= 1;
				nextBtn.disabled = currentPage >= newTotalPages;
				
				new Notice('🔓 已解锁');
			});
		});
	};

	// 初始化渲染第一页
	renderTableRows(1);

	// 分页控制面板
	const paginationContainer = ignoredFilesSection.contentEl.createDiv();
	paginationContainer.style.marginBottom = '16px';
	paginationContainer.style.display = 'flex';
	paginationContainer.style.justifyContent = 'space-between';
	paginationContainer.style.alignItems = 'center';
	paginationContainer.style.gap = '12px';

	// 左侧：分页信息和按钮
	const leftContainer = paginationContainer.createDiv();
	leftContainer.style.display = 'flex';
	leftContainer.style.alignItems = 'center';
	leftContainer.style.gap = '12px';

	// 分页信息
	const paginationInfo = leftContainer.createEl('span');
	paginationInfo.style.fontSize = '0.9em';
	paginationInfo.style.color = 'var(--text-muted)';
	paginationInfo.textContent = `第 1 / ${totalPages} 页`;

	// 分页按钮容器
	const buttonContainer = leftContainer.createDiv();
	buttonContainer.style.display = 'flex';
	buttonContainer.style.gap = '4px';

	// 声明 pageSizeSelect（稍后在统计信息行中创建）
	let pageSizeSelect: HTMLSelectElement;

	// 上一页按钮
	const prevBtn = buttonContainer.createEl('button');
	prevBtn.textContent = '◀ 上一页';
	prevBtn.style.padding = '6px 12px';
	prevBtn.style.fontSize = '0.85em';
	prevBtn.style.border = '1px solid var(--interactive-accent)';
	prevBtn.style.borderRadius = '4px';
	prevBtn.style.backgroundColor = 'var(--interactive-accent)';
	prevBtn.style.color = 'white';
	prevBtn.style.cursor = 'pointer';
	prevBtn.style.transition = 'all 0.2s ease';
	prevBtn.disabled = true;
	prevBtn.style.opacity = '0.5';
	prevBtn.style.cursor = 'not-allowed';
	prevBtn.addEventListener('mouseenter', () => {
		if (!prevBtn.disabled) {
			prevBtn.style.opacity = '0.8';
			prevBtn.style.transform = 'scale(1.05)';
		}
	});
	prevBtn.addEventListener('mouseleave', () => {
		prevBtn.style.opacity = '1';
		prevBtn.style.transform = 'scale(1)';
	});

	// 下一页按钮
	const nextBtn = buttonContainer.createEl('button');
	nextBtn.textContent = '下一页 ▶';
	nextBtn.style.padding = '6px 12px';
	nextBtn.style.fontSize = '0.85em';
	nextBtn.style.border = '1px solid var(--interactive-accent)';
	nextBtn.style.borderRadius = '4px';
	nextBtn.style.backgroundColor = 'var(--interactive-accent)';
	nextBtn.style.color = 'white';
	nextBtn.style.cursor = 'pointer';
	nextBtn.style.transition = 'all 0.2s ease';
	nextBtn.disabled = totalPages <= 1;
	if (nextBtn.disabled) {
		nextBtn.style.opacity = '0.5';
		nextBtn.style.cursor = 'not-allowed';
	}
	nextBtn.addEventListener('mouseenter', () => {
		if (!nextBtn.disabled) {
			nextBtn.style.opacity = '0.8';
			nextBtn.style.transform = 'scale(1.05)';
		}
	});
	nextBtn.addEventListener('mouseleave', () => {
		nextBtn.style.opacity = '1';
		nextBtn.style.transform = 'scale(1)';
	});

	// 清除本页锁定按钮（添加到分页容器的右侧）
	const clearPageBtn = paginationContainer.createEl('button');
	clearPageBtn.textContent = '清除本页';
	clearPageBtn.style.padding = '6px 12px';
	clearPageBtn.style.fontSize = '0.85em';
	clearPageBtn.style.border = '1px solid var(--background-modifier-border)';
	clearPageBtn.style.borderRadius = '4px';
	clearPageBtn.style.backgroundColor = 'var(--background-secondary)';
	clearPageBtn.style.color = 'var(--text-normal)';
	clearPageBtn.style.cursor = 'pointer';
	clearPageBtn.style.transition = 'all 0.2s ease';
	clearPageBtn.addEventListener('mouseenter', () => {
		clearPageBtn.style.backgroundColor = 'var(--background-modifier-hover)';
		clearPageBtn.style.transform = 'scale(1.05)';
	});
	clearPageBtn.addEventListener('mouseleave', () => {
		clearPageBtn.style.backgroundColor = 'var(--background-secondary)';
		clearPageBtn.style.transform = 'scale(1)';
	});

	// 更新分页显示的函数
	const updatePagination = () => {
		const newPageSize = parseInt(pageSizeSelect.value);
		const newTotalPages = Math.ceil(allItems.length / newPageSize);
		currentPage = Math.min(currentPage, newTotalPages);
		
		renderTableRows(currentPage);
		paginationInfo.textContent = `第 ${currentPage} / ${newTotalPages} 页`;
		prevBtn.disabled = currentPage <= 1;
		nextBtn.disabled = currentPage >= newTotalPages;
	};


	// 清除本页事件
	clearPageBtn.addEventListener('click', async () => {
		const pageItems = allItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
		if (pageItems.length === 0) {
			new Notice('本页没有已锁定的图片');
			return;
		}
		const confirmed = await ConfirmModal.show(
			this.app,
			'确认清除',
			`确定要清除本页的 ${pageItems.length} 个锁定吗？此操作不可撤销。`,
			['清除', '取消']
		);
		if (confirmed === 'save') {
			// 使用 LockListManager 批量移除锁定
			const itemsToRemove = pageItems.map(item => ({
				fileName: item.value,
				md5: item.hash
			}));
			await this.plugin.lockListManager.removeLockedFileBatch(itemsToRemove);
			
			new Notice(`🔓 已解锁本页 ${pageItems.length} 张图片`);
			this.display();
		}
	});

	// 上一页事件
	prevBtn.addEventListener('click', () => {
		if (currentPage > 1) {
			currentPage--;
			updatePagination();
		}
	});

	// 下一页事件
	nextBtn.addEventListener('click', () => {
		const newPageSize = parseInt(pageSizeSelect.value);
		const newTotalPages = Math.ceil(allItems.length / newPageSize);
		if (currentPage < newTotalPages) {
			currentPage++;
			updatePagination();
		}
	});

	// 统计信息和清除按钮容器
	const statsContainer = ignoredFilesSection.contentEl.createDiv();
	statsContainer.style.display = 'flex';
	statsContainer.style.justifyContent = 'space-between';
	statsContainer.style.alignItems = 'center';
	statsContainer.style.marginBottom = '16px';

	// 左侧：统计信息 + 每页显示
	const leftStatsContainer = statsContainer.createDiv();
	leftStatsContainer.style.display = 'flex';
	leftStatsContainer.style.alignItems = 'center';
	leftStatsContainer.style.gap = '16px';

	const statsDiv = leftStatsContainer.createEl('div');
	statsDiv.style.fontSize = '0.85em';
	statsDiv.style.color = 'var(--text-muted)';
	statsDiv.innerHTML = `📊 已锁定: ${lockKeys.length} 个`;

	// 每页显示数量选择
	const pageSizeContainer = leftStatsContainer.createDiv();
	pageSizeContainer.style.display = 'flex';
	pageSizeContainer.style.alignItems = 'center';
	pageSizeContainer.style.gap = '8px';

	const pageSizeLabel = pageSizeContainer.createEl('label');
	pageSizeLabel.textContent = '每页显示:';
	pageSizeLabel.style.fontSize = '0.85em';
	pageSizeLabel.style.color = 'var(--text-normal)';

	pageSizeSelect = pageSizeContainer.createEl('select');
	pageSizeSelect.style.padding = '4px 8px';
	pageSizeSelect.style.border = '1px solid var(--background-modifier-border)';
	pageSizeSelect.style.borderRadius = '4px';
	pageSizeSelect.style.backgroundColor = 'var(--background-secondary)';
	pageSizeSelect.style.color = 'var(--text-normal)';
	pageSizeSelect.style.fontSize = '0.85em';
	pageSizeSelect.style.cursor = 'pointer';

	[5, 10, 20, 50].forEach(size => {
		const option = pageSizeSelect.createEl('option');
		option.value = size.toString();
		option.textContent = size + ' 行';
		if (size === pageSize) {
			option.selected = true;
		}
	});

	// 每页显示数量变化事件
	pageSizeSelect.addEventListener('change', updatePagination);

	// 清除所有锁定事件

	// 右侧：清除所有
	const clearButtonContainer = statsContainer.createEl('div');
	clearButtonContainer.style.display = 'flex';
	clearButtonContainer.style.gap = '8px';
	clearButtonContainer.style.alignItems = 'center';

	// 清除所有锁定按钮
	const clearAllBtn = clearButtonContainer.createEl('button');
	clearAllBtn.textContent = '清除所有';
	clearAllBtn.style.padding = '6px 14px';
	clearAllBtn.style.fontSize = '0.85em';
	clearAllBtn.style.border = '1px solid #ff3333';
	clearAllBtn.style.borderRadius = '4px';
	clearAllBtn.style.backgroundColor = '#ff3333';
	clearAllBtn.style.color = 'white';
	clearAllBtn.style.cursor = 'pointer';
	clearAllBtn.style.marginLeft = 'auto';
	clearAllBtn.style.transition = 'all 0.2s ease';
	clearAllBtn.style.fontWeight = 'bold';
	clearAllBtn.addEventListener('mouseenter', () => {
		clearAllBtn.style.backgroundColor = '#ff1111';
		clearAllBtn.style.transform = 'scale(1.05)';
	});
	clearAllBtn.addEventListener('mouseleave', () => {
		clearAllBtn.style.backgroundColor = '#ff3333';
		clearAllBtn.style.transform = 'scale(1)';
	});
	clearAllBtn.addEventListener('click', async () => {
		const confirmed = await ConfirmModal.show(
			this.app,
			'确认清除',
			'确定要清除所有锁定吗？此操作不可撤销。',
			['清除', '取消']
		);
		if (confirmed === 'save') {
			// 使用 LockListManager 清空所有锁定
			await this.plugin.lockListManager.clearAllLockedFiles();
			new Notice('🔓 已解锁所有图片');
			this.display();
		}
	});

		// 13. 操作日志
		const logsSection = this.createCollapsibleSection(containerEl, '📋 操作日志', 'logs', false);

		// 说明文字
		const logIntro = logsSection.contentEl.createDiv();
		logIntro.style.color = 'var(--text-muted)';
		logIntro.style.marginBottom = '12px';
		logIntro.style.fontSize = '0.9em';
		logIntro.innerHTML = `
			<p>插件日志记录所有操作和错误，包括：</p>
			<ul style="margin: 8px 0; padding-left: 20px;">
				<li>📷 图片操作（重命名、移动、删除、旋转等）</li>
				<li>📦 批量操作记录</li>
				<li>🔗 引用更新和查找</li>
				<li>❌ 错误和警告信息</li>
			</ul>
			<p>日志基于图片哈希值记录，支持分类查看和导出。</p>
		`;

		// 日志级别设置
		new Setting(logsSection.contentEl)
			.setName('日志级别')
			.setDesc('设置记录的最小日志级别，低于此级别的日志不会被记录（DEBUG < INFO < WARNING < ERROR）')
			.addDropdown(dropdown => dropdown
			.addOption('DEBUG', 'DEBUG（所有日志）')
			.addOption('INFO', 'INFO（信息及以上）')
			.addOption('WARNING', 'WARNING（警告及以上）')
			.addOption('ERROR', 'ERROR（仅错误）')
			.setValue(this.plugin.settings.logLevel || 'INFO')
			.onChange(async (value) => {
				this.plugin.settings.logLevel = value as 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
				await this.plugin.saveSettings();
				if (this.plugin.logger) {
					const logLevelEnum = LogLevel[value as keyof typeof LogLevel];
					if (logLevelEnum) {
						this.plugin.logger.setLogLevel(logLevelEnum);
					}
				}
			}));

		// 控制台输出设置
		new Setting(logsSection.contentEl)
			.setName('输出到控制台')
			.setDesc('是否将日志输出到浏览器控制台（生产环境建议关闭，避免控制台日志过多）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableConsoleLog || false)
				.onChange(async (value) => {
					this.plugin.settings.enableConsoleLog = value;
					await this.plugin.saveSettings();
					if (this.plugin.logger) {
						this.plugin.logger.setEnableConsoleLog(value);
					}
				}));

		// DEBUG日志设置
		new Setting(logsSection.contentEl)
			.setName('启用DEBUG日志')
			.setDesc('是否记录DEBUG级别的日志（调试时启用，生产环境建议关闭）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDebugLog || false)
				.onChange(async (value) => {
					this.plugin.settings.enableDebugLog = value;
					await this.plugin.saveSettings();
					if (this.plugin.logger) {
						this.plugin.logger.setEnableDebugLog(value);
					}
				}));
		
		// 查看日志按钮
		new Setting(logsSection.contentEl)
			.setName('查看操作日志')
			.setDesc('打开日志查看器，支持筛选、搜索、复制和导出日志')
			.addButton(button => button
				.setButtonText('📊 打开日志查看器')
				.setCta()
				.onClick(() => {
					new LogViewerModal(this.app, this.plugin).open();
				}));

		// 清除所有日志按钮
		new Setting(logsSection.contentEl)
			.setName('清除所有日志')
			.setDesc('删除所有操作日志记录（不可恢复）')
			.addButton(button => button
				.setButtonText('🗑️ 清除日志')
				.setWarning()
				.onClick(async () => {
					const confirmed = confirm('确定要清除所有日志吗？此操作不可撤销。');
					if (confirmed) {
						await this.plugin.logger?.clearAllLogs();
						new Notice('✅ 已清除所有日志');
					}
				}));

		// 12. 键盘快捷键（放在最后，高级设置）
		const shortcutsSection = this.createCollapsibleSection(containerEl, '⌨️ 键盘快捷键', 'shortcuts', false);

		// 说明文字
		const shortcutsIntro = shortcutsSection.contentEl.createDiv();
		shortcutsIntro.style.color = 'var(--text-muted)';
		shortcutsIntro.style.marginBottom = '16px';
		shortcutsIntro.style.fontSize = '0.9em';
		shortcutsIntro.innerHTML = `
			<p>自定义插件的键盘快捷键。点击输入框后直接按下键盘按键即可设置快捷键。</p>
			<p>支持格式：单个按键（如 <code>r</code>、<code>ArrowLeft</code>）或组合键（如 <code>Ctrl+S</code>、<code>Ctrl+Shift+F</code>）。</p>
			<p><strong>注意：</strong>修改快捷键后需要重新打开对应的视图才能生效。</p>
		`;

		// 快捷键列表容器
		const shortcutsList = shortcutsSection.contentEl.createDiv('shortcuts-list');
		shortcutsList.style.marginBottom = '16px';

		// 按类别分组显示快捷键
		const categories: Array<{ name: string; label: string; shortcuts: string[] }> = [
			{ name: 'navigation', label: '导航', shortcuts: ['image-detail-previous', 'image-detail-next', 'image-detail-first', 'image-detail-last', 'image-detail-close', 'manager-open-detail'] },
			{ name: 'preview', label: '预览操作', shortcuts: ['image-detail-zoom-in', 'image-detail-zoom-out', 'image-detail-reset', 'image-detail-rotate-right', 'image-detail-rotate-left', 'image-detail-toggle-view-mode', 'image-detail-toggle-wheel-mode'] },
			{ name: 'edit', label: '编辑操作', shortcuts: ['image-detail-delete', 'image-detail-save', 'manager-delete'] },
			{ name: 'view', label: '视图操作', shortcuts: ['manager-search', 'manager-sort', 'manager-filter', 'manager-group', 'manager-select-all'] },
			{ name: 'batch', label: '批量操作', shortcuts: ['manager-batch-rename', 'manager-smart-rename', 'manager-toggle-lock'] }
		];

		const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
		const shortcuts = this.plugin.settings.keyboardShortcuts || {};

		categories.forEach(category => {
			const categoryDiv = shortcutsList.createDiv('shortcut-category');
			categoryDiv.style.marginBottom = '20px';
			
			const categoryTitle = categoryDiv.createEl('h4', { text: category.label });
			categoryTitle.style.marginBottom = '8px';
			categoryTitle.style.fontSize = '0.95em';
			categoryTitle.style.fontWeight = '600';
			categoryTitle.style.color = 'var(--text-normal)';

			category.shortcuts.forEach(shortcutId => {
				const def = SHORTCUT_DEFINITIONS[shortcutId];
				if (!def) return;

				const shortcutRow = categoryDiv.createDiv('shortcut-row');
				shortcutRow.style.display = 'flex';
				shortcutRow.style.alignItems = 'center';
				shortcutRow.style.gap = '12px';
				shortcutRow.style.padding = '8px 0';
				shortcutRow.style.borderBottom = '1px solid var(--background-modifier-border)';

				const infoDiv = shortcutRow.createDiv('shortcut-info');
				infoDiv.style.flex = '1';
				infoDiv.style.minWidth = '0';
				
				const nameDiv = infoDiv.createDiv('shortcut-name');
				nameDiv.textContent = def.name;
				nameDiv.style.fontWeight = '500';
				nameDiv.style.fontSize = '0.9em';
				nameDiv.style.marginBottom = '2px';

				const descDiv = infoDiv.createDiv('shortcut-desc');
				descDiv.textContent = def.description;
				descDiv.style.fontSize = '0.8em';
				descDiv.style.color = 'var(--text-muted)';

				const currentKey = shortcuts[shortcutId] || def.defaultKey;
				const formattedKey = formatShortcut(currentKey, isMac);

				const keyInput = shortcutRow.createEl('input', {
					type: 'text',
					value: formattedKey,
					cls: 'shortcut-key-input',
					placeholder: '点击后按下键盘按键...'
				});
				keyInput.style.width = '150px';
				keyInput.style.padding = '4px 8px';
				keyInput.style.border = '1px solid var(--background-modifier-border)';
				keyInput.style.borderRadius = '4px';
				keyInput.style.backgroundColor = 'var(--background-secondary)';
				keyInput.style.color = 'var(--text-normal)';
				keyInput.style.fontFamily = 'monospace';
				keyInput.style.fontSize = '0.85em';
				keyInput.style.textAlign = 'center';
				keyInput.readOnly = true;
				
				let currentShortcut = currentKey;
				const isModified = currentKey !== def.defaultKey;
				let isCapturing = false;

				const resetBtn = shortcutRow.createEl('button', { text: '重置' });
				resetBtn.style.padding = '4px 10px';
				resetBtn.style.fontSize = '0.85em';
				resetBtn.style.flexShrink = '0';
				resetBtn.style.display = isModified ? '' : 'none';
				resetBtn.addEventListener('click', async () => {
					delete shortcuts[shortcutId];
					currentShortcut = def.defaultKey;
					keyInput.value = formatShortcut(def.defaultKey, isMac);
					this.plugin.settings.keyboardShortcuts = shortcuts;
					await this.plugin.saveSettings();
					resetBtn.style.display = 'none';
					new Notice('已重置为默认值');
				});

				const eventToShortcut = (e: KeyboardEvent): string | null => {
					if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
					const parts: string[] = [];
					if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
					if (e.shiftKey) parts.push('Shift');
					if (e.altKey) parts.push('Alt');
					let mainKey = e.key;
					if (mainKey === ' ') mainKey = 'Space';
					else if (mainKey.length === 1) mainKey = mainKey.toLowerCase();
					if (!mainKey || mainKey === 'Unidentified') return null;
					parts.push(mainKey);
					return parts.join('+');
				};

				keyInput.addEventListener('focus', () => {
					isCapturing = true;
					keyInput.style.borderColor = 'var(--interactive-accent)';
					keyInput.style.backgroundColor = 'var(--background-modifier-hover)';
					keyInput.placeholder = '按下键盘按键...';
				});

				keyInput.addEventListener('blur', () => {
					isCapturing = false;
					keyInput.style.borderColor = 'var(--background-modifier-border)';
					keyInput.style.backgroundColor = 'var(--background-secondary)';
					keyInput.placeholder = '点击后按下键盘按键...';
				});

				keyInput.addEventListener('keydown', async (e: KeyboardEvent) => {
					if (!isCapturing) return;
					e.preventDefault();
					e.stopPropagation();
					const shortcut = eventToShortcut(e);
					if (shortcut) {
						currentShortcut = shortcut;
						keyInput.value = formatShortcut(shortcut, isMac);
						shortcuts[shortcutId] = shortcut;
						this.plugin.settings.keyboardShortcuts = shortcuts;
						await this.plugin.saveSettings();
						resetBtn.style.display = shortcut !== def.defaultKey ? '' : 'none';
						setTimeout(() => keyInput.blur(), 300);
					}
				});
			});
		});

		// 重置所有快捷键按钮
		new Setting(shortcutsSection.contentEl)
			.setName('重置所有快捷键')
			.setDesc('将所有快捷键恢复为默认值')
			.addButton(button => button
				.setButtonText('🔄 重置全部')
				.setWarning()
				.onClick(async () => {
					const confirmed = confirm('确定要重置所有快捷键为默认值吗？');
					if (confirmed) {
						this.plugin.settings.keyboardShortcuts = {};
						await this.plugin.saveSettings();
						new Notice('✅ 已重置所有快捷键');
						this.display();
					}
				}));

	}

	private collapsedSections: Set<string> = new Set();

	/**
	 * 创建可折叠的设置区域
	 */
	createCollapsibleSection(container: HTMLElement, title: string, id: string, defaultExpanded: boolean = false): { headerEl: HTMLElement, contentEl: HTMLElement } {
		const sectionContainer = container.createDiv('collapsible-section-container');
		sectionContainer.id = id;
		sectionContainer.style.marginTop = '20px';
		sectionContainer.style.marginBottom = '10px';
		
		// 标题区域（可点击）
		const headerEl = sectionContainer.createDiv('collapsible-section-header');
		headerEl.style.display = 'flex';
		headerEl.style.alignItems = 'center';
		headerEl.style.gap = '8px';
		headerEl.style.padding = '10px 12px';
		headerEl.style.backgroundColor = 'var(--background-secondary)';
		headerEl.style.borderRadius = '6px';
		headerEl.style.cursor = 'pointer';
		headerEl.style.transition = 'all 0.2s ease';
		headerEl.style.border = '1px solid var(--background-modifier-border)';
		
		// 标题文字（包含emoji标签和括号内的折叠图标）
		const titleEl = headerEl.createEl('h3');
		titleEl.style.margin = '0';
		titleEl.style.fontSize = '1.1em';
		titleEl.style.flex = '1';
		titleEl.style.display = 'flex';
		titleEl.style.alignItems = 'center';
		titleEl.style.gap = '8px';
		
		// 标题文本
		const titleText = titleEl.createSpan();
		titleText.textContent = title;
		titleText.style.flex = '1';
		
		// 展开/折叠图标
		const iconEl = titleEl.createSpan('collapse-icon');
		iconEl.textContent = defaultExpanded ? '▼' : '▶';
		iconEl.style.fontSize = '0.85em';
		iconEl.style.color = 'var(--text-muted)';
		iconEl.style.transition = 'all 0.2s ease';
		iconEl.style.flexShrink = '0';
		
		// 内容区域
		const contentEl = sectionContainer.createDiv('collapsible-section-content');
		contentEl.style.marginTop = '10px';
		contentEl.style.paddingLeft = '10px';
		contentEl.style.display = defaultExpanded ? 'block' : 'none';
		contentEl.style.transition = 'all 0.3s ease';
		
		// 如果默认折叠，添加到折叠集合
		if (!defaultExpanded) {
			this.collapsedSections.add(id);
		}
		
		// 悬停效果
		headerEl.addEventListener('mouseenter', () => {
			headerEl.style.backgroundColor = 'var(--background-modifier-hover)';
			headerEl.style.borderColor = 'var(--interactive-accent)';
		});
		
		headerEl.addEventListener('mouseleave', () => {
			headerEl.style.backgroundColor = 'var(--background-secondary)';
			headerEl.style.borderColor = 'var(--background-modifier-border)';
		});
		
		// 点击展开/折叠
		headerEl.addEventListener('click', () => {
			const isCollapsed = this.collapsedSections.has(id);
			
			if (isCollapsed) {
				// 展开
				contentEl.style.display = 'block';
				iconEl.textContent = '▼';
				this.collapsedSections.delete(id);
			} else {
				// 折叠
				contentEl.style.display = 'none';
				iconEl.textContent = '▶';
				this.collapsedSections.add(id);
			}
		});
		
		return { headerEl, contentEl };
	}
}
