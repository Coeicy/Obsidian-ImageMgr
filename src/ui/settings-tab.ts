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
import { LogViewerModal } from './log-viewer-modal';
import { ConfirmModal } from './confirm-modal';
import { SHORTCUT_DEFINITIONS, formatShortcut } from '../utils/keyboard-shortcut-manager';
import { LogLevel, OperationType } from '../utils/logger';
import { SettingsIOPanel } from './settings-io-panel';

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
/** 设置页标签定义 */
const SETTINGS_TAB_DEFS: { id: string; title: string }[] = [
	{ id: 'basic', title: '📌 基础设置' },
	{ id: 'display', title: '🖼️ 显示设置' },
	{ id: 'image-operations', title: '🛠️ 图片操作' },
	{ id: 'mobile', title: '📱 移动端适配' },
	{ id: 'upload', title: '☁️ 网络图片' },
	{ id: 'extension', title: '🧩 扩展功能' },
	{ id: 'ignored-files', title: '🔒 锁定文件' },
	{ id: 'logs', title: '📋 操作日志' },
	{ id: 'shortcuts', title: '⌨️ 快捷键' },
	{ id: 'delete', title: '🗑️ 回收站' },
	{ id: 'reference', title: '📖 插件说明' },
];

export class ImageManagementSettingTab extends PluginSettingTab {
	plugin: ImageManagementPlugin;
	private tabPanels: Map<string, HTMLElement> = new Map();
	private activeTabId: string = 'basic';

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

	/**
	 * 刷新视图工具栏按钮显示
	 * 根据设置显示/隐藏重复检测和空链接检测按钮
	 */
	private refreshViewToolbar() {
		const leaf = this.app.workspace.getLeavesOfType('image-manager-view')[0];
		if (!leaf || !leaf.view) {
			return;
		}

		const view = leaf.view as any;
		const containerEl = view.containerEl;
		if (!containerEl) {
			return;
		}

		// 查找工具栏
		const toolbarEl = containerEl.querySelector('.image-manager-toolbar') as HTMLElement;
		if (!toolbarEl) {
			return;
		}

		// 查找重复检测按钮
		const duplicateBtn = toolbarEl.querySelector('#duplicate-btn') as HTMLElement;
		if (duplicateBtn) {
			if (this.plugin.settings.enableDuplicateDetection !== false) {
				duplicateBtn.style.display = '';
			} else {
				duplicateBtn.style.display = 'none';
			}
		} else if (this.plugin.settings.enableDuplicateDetection !== false) {
			// 如果按钮不存在但应该显示，需要重新构建工具栏
			// 这里简化处理：如果按钮不存在，说明视图可能还没完全加载，不处理
		}

		// 查找空链接检测按钮
		const brokenLinksBtn = toolbarEl.querySelector('#broken-links-btn') as HTMLElement;
		if (brokenLinksBtn) {
			if (this.plugin.settings.enableBrokenLinksDetection !== false) {
				brokenLinksBtn.style.display = '';
			} else {
				brokenLinksBtn.style.display = 'none';
			}
		} else if (this.plugin.settings.enableBrokenLinksDetection !== false) {
			// 如果按钮不存在但应该显示，需要重新构建工具栏
			// 这里简化处理：如果按钮不存在，说明视图可能还没完全加载，不处理
		}

		// 查找库统计按钮
		const statsBtn = toolbarEl.querySelector('#stats-btn') as HTMLElement;
		if (statsBtn) {
			if (this.plugin.settings.showStatistics !== false) {
				statsBtn.style.display = '';
			} else {
				statsBtn.style.display = 'none';
			}
		} else if (this.plugin.settings.showStatistics !== false) {
			// 如果按钮不存在但应该显示，需要重新构建工具栏
			// 这里简化处理：如果按钮不存在，说明视图可能还没完全加载，不处理
		}
	}

	display(): void {
		const containerEl = this.containerEl;
		containerEl.empty();

		// ========== 标签页栏 ==========
		const tabBar = containerEl.createDiv('settings-tab-bar');
		const contentWrapper = containerEl.createDiv('settings-tab-content');
		this.tabPanels.clear();
		for (const t of SETTINGS_TAB_DEFS) {
			const tabBtn = tabBar.createEl('button', { cls: 'settings-tab-btn' });
			tabBtn.textContent = t.title;
			tabBtn.dataset.tabId = t.id;
			tabBtn.addEventListener('click', () => this.showTab(t.id));
			const panel = contentWrapper.createDiv('settings-tab-panel');
			panel.dataset.tabId = t.id;
			// 默认所有面板都隐藏，只有当前激活的会显示
			panel.style.display = 'none';
			this.tabPanels.set(t.id, panel);
		}
		// 显示默认标签页
		this.showTab(this.activeTabId || 'basic');

		// ========== 各标签页内容 ==========

		// 1. 基础设置
		const basicSection = { contentEl: this.tabPanels.get('basic')! };
		
		// 添加一级标题
		const basicTitle = basicSection.contentEl.createEl('h2', { text: '📌 基础设置' });
		basicTitle.style.marginTop = '24px';
		basicTitle.style.marginBottom = '20px';
		basicTitle.style.fontSize = '1.6em';
		
		new Setting(basicSection.contentEl)
			.setName('扫描文件夹')
			.setDesc('设置扫描图片的文件夹路径，如：images/ （留空则扫描整个笔记库）')
			.addText(text => text
				.setPlaceholder('例如: images/')
				.setValue(this.plugin.settings.defaultImageFolder)
				.onChange(async (value) => {
					// 验证路径格式
					const trimmedValue = value.trim();
					if (trimmedValue && !/^[^\/].*[^\/]$/.test(trimmedValue) && trimmedValue !== trimmedValue.replace(/\/$/, '')) {
						// 路径格式可能有问题，但允许用户输入
					}
					this.plugin.settings.defaultImageFolder = trimmedValue;
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

		// 性能优化设置（整合到基础设置中）
		const performanceSubTitle = basicSection.contentEl.createEl('h4', { text: '⚡ 性能优化' });
		performanceSubTitle.style.marginTop = '20px';
		performanceSubTitle.style.marginBottom = '12px';
		performanceSubTitle.style.paddingBottom = '8px';
		performanceSubTitle.style.borderBottom = '1px solid var(--background-modifier-border)';
		performanceSubTitle.style.fontSize = '1.2em';

		// 懒加载说明文本（默认启用，无需开关）
		const lazyLoadDescEl = basicSection.contentEl.createDiv({ cls: 'setting-item-description' });
		lazyLoadDescEl.innerHTML = `
			<p style="margin: 0 0 12px 0;">
				<strong>📸 懒加载功能</strong>：图片进入可视区域时自动加载，提升大量图片时的性能
			</p>
		`;

		const lazyLoadDelaySetting = new Setting(basicSection.contentEl)
			.setName('懒加载延迟')
			.setDesc('图片懒加载的延迟时间（毫秒，范围：0-1000）');
		
		let lazyLoadDelayText: any;
		let lazyLoadDelaySlider: any;
		
		lazyLoadDelaySetting.addSlider(slider => {
			lazyLoadDelaySlider = slider;
			slider
				.setLimits(0, 1000, 50)
				.setValue(this.plugin.settings.lazyLoadDelay)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.lazyLoadDelay = value;
					if (lazyLoadDelayText) {
						lazyLoadDelayText.setValue(value.toString());
					}
					await this.plugin.saveSettings();
				});
		});
		
		lazyLoadDelaySetting.addText(text => {
			lazyLoadDelayText = text;
			text
				.setValue(this.plugin.settings.lazyLoadDelay.toString())
				.setPlaceholder('0-1000')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 0 && numValue <= 1000) {
					this.plugin.settings.lazyLoadDelay = numValue;
					if (lazyLoadDelaySlider) {
						lazyLoadDelaySlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});

		const maxCacheSizeSetting = new Setting(basicSection.contentEl)
			.setName('最大缓存数量')
			.setDesc('最多缓存多少张图片的数据（范围：50-500）');
		
		let maxCacheSizeText: any;
		let maxCacheSizeSlider: any;
		
		maxCacheSizeSetting.addSlider(slider => {
			maxCacheSizeSlider = slider;
			slider
				.setLimits(50, 500, 10)
				.setValue(this.plugin.settings.maxCacheSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maxCacheSize = value;
					if (maxCacheSizeText) {
						maxCacheSizeText.setValue(value.toString());
					}
					await this.plugin.saveSettings();
				});
		});
		
		maxCacheSizeSetting.addText(text => {
			maxCacheSizeText = text;
			text
				.setValue(this.plugin.settings.maxCacheSize.toString())
				.setPlaceholder('50-500')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 50 && numValue <= 500) {
					this.plugin.settings.maxCacheSize = numValue;
					if (maxCacheSizeSlider) {
						maxCacheSizeSlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});

	// 2. 显示设置（合并主页设置和图片卡片设置）
		const displaySection = { contentEl: this.tabPanels.get('display')! };
		
		// 添加一级标题
		const displayTitle = displaySection.contentEl.createEl('h2', { text: '🖼️ 显示设置' });
		displayTitle.style.marginTop = '24px';
		displayTitle.style.marginBottom = '20px';
		displayTitle.style.fontSize = '1.6em';

		// 鼠标悬停动画设置 - 放在显示设置第一个
		new Setting(displaySection.contentEl)
			.setName('鼠标悬停动画')
			.setDesc('启用后，鼠标悬停在图片缩略图上时显示优雅的浮动效果')
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

		// 主页设置（二级标题）
		const layoutTitle = displaySection.contentEl.createEl('h4', { text: '🏠 主页设置' });
		layoutTitle.style.marginBottom = '12px';
		layoutTitle.style.paddingBottom = '8px';
		layoutTitle.style.borderBottom = '1px solid var(--background-modifier-border)';
		layoutTitle.style.fontSize = '1.2em';

		const imagesPerRowSetting = new Setting(displaySection.contentEl)
			.setName('每行显示数量')
			.setDesc('图片画廊中每行显示的图片数量（范围：1-10）');
		
		let imagesPerRowText: any;
		let imagesPerRowSlider: any;
		
		imagesPerRowSetting.addSlider(slider => {
			imagesPerRowSlider = slider;
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
					if (imagesPerRowText) {
						imagesPerRowText.setValue(validValue.toString());
					}
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				});
		});
		
		imagesPerRowSetting.addText(text => {
			imagesPerRowText = text;
			const currentValue = (typeof this.plugin.settings.imagesPerRow === 'number' && 
				this.plugin.settings.imagesPerRow >= 1 && 
				this.plugin.settings.imagesPerRow <= 10) 
				? this.plugin.settings.imagesPerRow 
				: 5;
			
			text
				.setValue(currentValue.toString())
				.setPlaceholder('1-10')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 1 && numValue <= 10) {
					this.plugin.settings.imagesPerRow = numValue;
					if (imagesPerRowSlider) {
						imagesPerRowSlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});



		const cardBorderRadiusSetting = new Setting(displaySection.contentEl)
			.setName('卡片圆角')
			.setDesc('图片卡片的圆角大小（像素，范围：0-20）');
		
		let cardBorderRadiusText: any;
		let cardBorderRadiusSlider: any;
		
		cardBorderRadiusSetting.addSlider(slider => {
			cardBorderRadiusSlider = slider;
			slider
				.setLimits(0, 20, 1)
				.setValue(this.plugin.settings.cardBorderRadius)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.cardBorderRadius = value;
					if (cardBorderRadiusText) {
						cardBorderRadiusText.setValue(value.toString());
					}
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				});
		});
		
		cardBorderRadiusSetting.addText(text => {
			cardBorderRadiusText = text;
			text
				.setValue(this.plugin.settings.cardBorderRadius.toString())
				.setPlaceholder('0-20')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 0 && numValue <= 20) {
					this.plugin.settings.cardBorderRadius = numValue;
					if (cardBorderRadiusSlider) {
						cardBorderRadiusSlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});

		const fixedImageHeightSetting = new Setting(displaySection.contentEl)
			.setName('固定图片高度')
			.setDesc('关闭"自适应大小"时的图片高度（像素，范围：100-400）');
		
		let fixedImageHeightText: any;
		let fixedImageHeightSlider: any;
		
		fixedImageHeightSetting.addSlider(slider => {
			fixedImageHeightSlider = slider;
			slider
				.setLimits(100, 400, 10)
				.setValue(this.plugin.settings.fixedImageHeight)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.fixedImageHeight = value;
					if (fixedImageHeightText) {
						fixedImageHeightText.setValue(value.toString());
					}
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
				});
		});
		
		fixedImageHeightSetting.addText(text => {
			fixedImageHeightText = text;
			text
				.setValue(this.plugin.settings.fixedImageHeight.toString())
				.setPlaceholder('100-400')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 100 && numValue <= 400) {
					this.plugin.settings.fixedImageHeight = numValue;
					if (fixedImageHeightSlider) {
						fixedImageHeightSlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					const view = this.app.workspace.getLeavesOfType('image-manager-view')[0];
					if (view) {
						await (view.view as any).scanImages();
					}
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});

		new Setting(displaySection.contentEl)
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



	// 图片显示设置（二级标题）
	const displaySubTitle = displaySection.contentEl.createEl('h4', { text: '🖼️ 图片显示' });
	displaySubTitle.style.marginTop = '20px';
	displaySubTitle.style.marginBottom = '12px';
	displaySubTitle.style.paddingBottom = '8px';
	displaySubTitle.style.borderBottom = '1px solid var(--background-modifier-border)';
	displaySubTitle.style.fontSize = '1.2em';

		new Setting(displaySection.contentEl)
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

		new Setting(displaySection.contentEl)
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

		new Setting(displaySection.contentEl)
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

		new Setting(displaySection.contentEl)
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

		new Setting(displaySection.contentEl)
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

		new Setting(displaySection.contentEl)
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

		new Setting(displaySection.contentEl)
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

		new Setting(displaySection.contentEl)
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

		// 默认值设置（二级标题）
		const defaultsTitle = displaySection.contentEl.createEl('h4', { text: '⚙️ 默认值' });
		defaultsTitle.style.marginTop = '20px';
		defaultsTitle.style.marginBottom = '12px';
		defaultsTitle.style.paddingBottom = '8px';
		defaultsTitle.style.borderBottom = '1px solid var(--background-modifier-border)';
		defaultsTitle.style.fontSize = '1.2em';

		new Setting(displaySection.contentEl)
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

		new Setting(displaySection.contentEl)
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

		new Setting(displaySection.contentEl)
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

			// 图片详情页设置（二级标题）
			const detailTitle = displaySection.contentEl.createEl('h4', { text: '🔍 图片详情页' });
			detailTitle.style.marginTop = '20px';
			detailTitle.style.marginBottom = '12px';
			detailTitle.style.paddingBottom = '8px';
			detailTitle.style.borderBottom = '1px solid var(--background-modifier-border)';
			detailTitle.style.fontSize = '1.2em';

			new Setting(displaySection.contentEl)
				.setName('滚轮行为')
				.setDesc('设置鼠标滚轮在图片详情页的默认行为：缩放图片 或 切换图片')
				.addDropdown(dropdown => dropdown
					.addOption('zoom', '缩放图片')
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
								}
							}
						}
					}));

		// 3. 图片操作
		const imageOperationsSection = { contentEl: this.tabPanels.get('image-operations')! };
		
		// 添加一级标题
		const imageOperationsTitle = imageOperationsSection.contentEl.createEl('h2', { text: '🛠️ 图片操作' });
		imageOperationsTitle.style.marginTop = '24px';
		imageOperationsTitle.style.marginBottom = '20px';
		imageOperationsTitle.style.fontSize = '1.6em';

	// 重命名设置部分
	const renameSectionTitle = imageOperationsSection.contentEl.createEl('h3', { text: '🔄 重命名设置' });
	renameSectionTitle.style.marginTop = '32px';
	renameSectionTitle.style.marginBottom = '16px';
	renameSectionTitle.style.fontSize = '1.4em';
	renameSectionTitle.style.borderBottom = '2px solid var(--interactive-accent)';
	renameSectionTitle.style.paddingBottom = '8px';

		new Setting(imageOperationsSection.contentEl)
			.setName('自动生成文件名')
			.setDesc('根据笔记标题自动生成序列文件名（例如：笔记标题-1.png、笔记标题-2.png）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoGenerateNames)
				.onChange(async (value) => {
					this.plugin.settings.autoGenerateNames = value;
					await this.plugin.saveSettings();
				}));

		const pathNamingDepthSetting = new Setting(imageOperationsSection.contentEl)
			.setName('笔记路径深度')
			.setDesc('重命名时使用笔记路径的层级数（1-5级，例如：父目录_子目录_笔记_1.png）');
		
		let pathNamingDepthText: any;
		let pathNamingDepthSlider: any;
		
		pathNamingDepthSetting.addSlider(slider => {
			pathNamingDepthSlider = slider;
			slider
				.setLimits(1, 5, 1)
				.setValue(this.plugin.settings.pathNamingDepth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.pathNamingDepth = value;
					if (pathNamingDepthText) {
						pathNamingDepthText.setValue(value.toString());
					}
					await this.plugin.saveSettings();
				});
		});
		
		pathNamingDepthSetting.addText(text => {
			pathNamingDepthText = text;
			text
				.setValue(this.plugin.settings.pathNamingDepth.toString())
				.setPlaceholder('1-5')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 1 && numValue <= 5) {
					this.plugin.settings.pathNamingDepth = numValue;
					if (pathNamingDepthSlider) {
						pathNamingDepthSlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});

		new Setting(imageOperationsSection.contentEl)
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

		new Setting(imageOperationsSection.contentEl)
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

		// 批量操作设置部分
	const batchSectionTitle = imageOperationsSection.contentEl.createEl('h3', { text: '📦 批量操作设置' });
	batchSectionTitle.style.marginTop = '32px';
	batchSectionTitle.style.marginBottom = '16px';
	batchSectionTitle.style.fontSize = '1.4em';
	batchSectionTitle.style.borderBottom = '2px solid var(--interactive-accent)';
	batchSectionTitle.style.paddingBottom = '8px';

		const maxBatchOperationsSetting = new Setting(imageOperationsSection.contentEl)
			.setName('批量操作最大数量')
			.setDesc('一次批量操作最多处理多少个文件（范围：100-5000）');
		
		let maxBatchOperationsText: any;
		let maxBatchOperationsSlider: any;
		
		maxBatchOperationsSetting.addSlider(slider => {
			maxBatchOperationsSlider = slider;
			slider
				.setLimits(100, 5000, 100)
				.setValue(this.plugin.settings.maxBatchOperations)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maxBatchOperations = value;
					if (maxBatchOperationsText) {
						maxBatchOperationsText.setValue(value.toString());
					}
					await this.plugin.saveSettings();
				});
		});
		
		maxBatchOperationsSetting.addText(text => {
			maxBatchOperationsText = text;
			text
				.setValue(this.plugin.settings.maxBatchOperations.toString())
				.setPlaceholder('100-5000')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 100 && numValue <= 5000) {
					this.plugin.settings.maxBatchOperations = numValue;
					if (maxBatchOperationsSlider) {
						maxBatchOperationsSlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});

		const batchConfirmThresholdSetting = new Setting(imageOperationsSection.contentEl)
			.setName('批量确认阈值')
			.setDesc('批量操作超过此数量时需要二次确认（范围：5-100）');
		
		let batchConfirmThresholdText: any;
		let batchConfirmThresholdSlider: any;
		
		batchConfirmThresholdSetting.addSlider(slider => {
			batchConfirmThresholdSlider = slider;
			slider
				.setLimits(5, 100, 5)
				.setValue(this.plugin.settings.batchConfirmThreshold)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.batchConfirmThreshold = value;
					if (batchConfirmThresholdText) {
						batchConfirmThresholdText.setValue(value.toString());
					}
					await this.plugin.saveSettings();
				});
		});
		
		batchConfirmThresholdSetting.addText(text => {
			batchConfirmThresholdText = text;
			text
				.setValue(this.plugin.settings.batchConfirmThreshold.toString())
				.setPlaceholder('5-100')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 5 && numValue <= 100) {
					this.plugin.settings.batchConfirmThreshold = numValue;
					if (batchConfirmThresholdSlider) {
						batchConfirmThresholdSlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});

		new Setting(imageOperationsSection.contentEl)
			.setName('显示批量操作进度')
			.setDesc('批量操作时显示进度条和当前处理的文件')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showBatchProgress)
				.onChange(async (value) => {
					this.plugin.settings.showBatchProgress = value;
					await this.plugin.saveSettings();
				}));

		// 4. 性能优化
		const referencePanel = this.tabPanels.get('reference');
		if (!referencePanel) {
			console.warn('Reference tab panel not found');
			return;
		}
		const referenceSection = { contentEl: referencePanel };

		// 页面标题
		const pageTitle = referenceSection.contentEl.createEl('h2', { text: '📖 插件使用说明' });
		pageTitle.style.marginBottom = '16px';
		pageTitle.style.fontSize = '1.2em';
		pageTitle.style.fontWeight = '600';

		// 简介
		const introText = referenceSection.contentEl.createDiv();
		introText.style.marginBottom = '24px';
		introText.style.color = 'var(--text-muted)';
		introText.style.fontSize = '0.9em';
		introText.textContent = '本插件提供完整的图片管理解决方案，包括图片扫描、去重、重命名、引用管理等功能。';

		// 功能分类容器
		const featuresContainer = referenceSection.contentEl.createDiv('features-container');
		featuresContainer.style.display = 'flex';
		featuresContainer.style.flexDirection = 'column';
		featuresContainer.style.gap = '16px';

		// 图片引用格式说明
		const referenceFormatIntro = featuresContainer.createDiv();
		referenceFormatIntro.style.color = 'var(--text-muted)';
		referenceFormatIntro.style.padding = '12px 16px';
		referenceFormatIntro.style.backgroundColor = 'var(--background-secondary)';
		referenceFormatIntro.style.borderRadius = '6px';
		referenceFormatIntro.style.borderLeft = '3px solid var(--interactive-accent)';
		referenceFormatIntro.innerHTML = `
			<p style="margin: 0 0 10px 0; font-weight: 600; font-size: 0.95em;">📝 图片引用格式</p>
			<ul style="margin: 0; padding-left: 20px; line-height: 1.6; font-size: 0.95em;">
				<li><strong>Wiki 格式</strong>：<code>![[image.png|显示文本|100x200]]</code> ✅ 支持显示文本和尺寸设置</li>
				<li><strong>HTML 格式</strong>：<code>&lt;img src="image.png" alt="文本" width="100" height="200"&gt;</code> ✅ 支持显示文本和尺寸设置</li>
				<li><strong>Markdown 格式</strong>：<code>![alt](image.png)</code> ⚠️ 仅支持显示文本（alt），<strong>不支持尺寸设置</strong></li>
			</ul>
			<p style="margin: 10px 0 0 0; font-size: 0.9em;">💡 提示：建议使用 Wiki 或 HTML 格式以支持尺寸设置。插件会自动更新所有格式的引用链接。</p>
		`;

		// 搜索功能说明
		const searchFeatureIntro = featuresContainer.createDiv();
		searchFeatureIntro.style.color = 'var(--text-muted)';
		searchFeatureIntro.style.padding = '12px 16px';
		searchFeatureIntro.style.backgroundColor = 'var(--background-secondary)';
		searchFeatureIntro.style.borderRadius = '6px';
		searchFeatureIntro.style.borderLeft = '3px solid var(--interactive-accent)';
		searchFeatureIntro.innerHTML = `
			<p style="margin: 0 0 10px 0; font-weight: 600; font-size: 0.95em;">🔍 搜索功能</p>
			<ul style="margin: 0; padding-left: 20px; line-height: 1.6; font-size: 0.95em;">
				<li><strong>搜索范围</strong>：文件名、文件路径、引用笔记名</li>
				<li><strong>大小写敏感</strong>：默认区分大小写（"Image" ≠ "image"）</li>
				<li><strong>实时搜索</strong>：输入后自动延迟搜索（300ms）</li>
				<li><strong>快捷键</strong>：<code>Ctrl+Shift+F</code> 快速聚焦搜索框</li>
				<li><strong>搜索结果</strong>：显示匹配图片及引用信息</li>
			</ul>
			<p style="margin: 10px 0 0 0; font-size: 0.9em;">💡 提示：支持模糊匹配，可通过路径快速定位图片。</p>
		`;

		// 图片查看功能说明
		const viewFeatureIntro = featuresContainer.createDiv();
		viewFeatureIntro.style.color = 'var(--text-muted)';
		viewFeatureIntro.style.padding = '12px 16px';
		viewFeatureIntro.style.backgroundColor = 'var(--background-secondary)';
		viewFeatureIntro.style.borderRadius = '6px';
		viewFeatureIntro.style.borderLeft = '3px solid var(--interactive-accent)';
		viewFeatureIntro.innerHTML = `
			<p style="margin: 0 0 10px 0; font-weight: 600; font-size: 0.95em;">👁️ 图片查看</p>
			<ul style="margin: 0; padding-left: 20px; line-height: 1.6; font-size: 0.95em;">
				<li><strong>缩放</strong>：鼠标滚轮、触摸板双指缩放</li>
				<li><strong>切换</strong>：滚轮、方向键、点击左右区域</li>
				<li><strong>旋转</strong>：支持90°旋转图片</li>
				<li><strong>保存</strong>：可保存旋转后的图片</li>
				<li><strong>信息</strong>：显示图片名称、尺寸、大小、引用列表</li>
			</ul>
			<p style="margin: 10px 0 0 0; font-size: 0.9em;">💡 提示：滚轮模式可在查看时切换（缩放/切换图片）。</p>
		`;

		// 批量操作说明
		const batchFeatureIntro = featuresContainer.createDiv();
		batchFeatureIntro.style.color = 'var(--text-muted)';
		batchFeatureIntro.style.padding = '12px 16px';
		batchFeatureIntro.style.backgroundColor = 'var(--background-secondary)';
		batchFeatureIntro.style.borderRadius = '6px';
		batchFeatureIntro.style.borderLeft = '3px solid var(--interactive-accent)';
		batchFeatureIntro.innerHTML = `
			<p style="margin: 0 0 10px 0; font-weight: 600; font-size: 0.95em;">📦 批量操作</p>
			<ul style="margin: 0; padding-left: 20px; line-height: 1.6; font-size: 0.95em;">
				<li><strong>批量选择</strong>：多选图片进行操作</li>
				<li><strong>批量重命名</strong>：按规则批量重命名图片</li>
				<li><strong>智能重命名</strong>：按引用笔记自动命名</li>
				<li><strong>批量锁定</strong>：防止重要图片被修改</li>
				<li><strong>确认阈值</strong>：超过数量需二次确认（默认10个）</li>
			</ul>
			<p style="margin: 10px 0 0 0; font-size: 0.9em;">💡 提示：批量操作会生成详细日志，可追踪所有变更。</p>
		`;

		// 去重功能说明
		const dedupFeatureIntro = featuresContainer.createDiv();
		 dedupFeatureIntro.style.color = 'var(--text-muted)';
		 dedupFeatureIntro.style.padding = '12px 16px';
		 dedupFeatureIntro.style.backgroundColor = 'var(--background-secondary)';
		 dedupFeatureIntro.style.borderRadius = '6px';
		 dedupFeatureIntro.style.borderLeft = '3px solid var(--interactive-accent)';
		 dedupFeatureIntro.innerHTML = `
			<p style="margin: 0 0 10px 0; font-weight: 600; font-size: 0.95em;">🔄 重复检测</p>
			<ul style="margin: 0; padding-left: 20px; line-height: 1.6; font-size: 0.95em;">
				<li><strong>MD5 检测</strong>：精确检测内容相同的图片</li>
				<li><strong>快速检测</strong>：基于文件名和大小检测</li>
				<li><strong>重复标记</strong>：在图片卡片显示重复标识</li>
				<li><strong>批量处理</strong>：一键删除或移动重复图片</li>
			</ul>
			<p style="margin: 10px 0 0 0; font-size: 0.9em;">💡 提示：MD5 检测可节省存储空间，避免重复保存相同图片。</p>
		`;

		// 空链接检测说明
		const brokenLinkIntro = featuresContainer.createDiv();
		brokenLinkIntro.style.color = 'var(--text-muted)';
		brokenLinkIntro.style.padding = '12px 16px';
		brokenLinkIntro.style.backgroundColor = 'var(--background-secondary)';
		brokenLinkIntro.style.borderRadius = '6px';
		brokenLinkIntro.style.borderLeft = '3px solid var(--interactive-accent)';
		brokenLinkIntro.innerHTML = `
			<p style="margin: 0 0 10px 0; font-weight: 600; font-size: 0.95em;">🔗 空链接检测</p>
			<ul style="margin: 0; padding-left: 20px; line-height: 1.6; font-size: 0.95em;">
				<li><strong>自动扫描</strong>：检测笔记中的失效图片链接</li>
				<li><strong>网络链接</strong>：验证网络图片是否可访问</li>
				<li><strong>快速修复</strong>：一键删除或替换失效链接</li>
				<li><strong>批量处理</strong>：批量清理多个空链接</li>
			</ul>
			<p style="margin: 10px 0 0 0; font-size: 0.9em;">💡 提示：定期检测可保持笔记整洁，避免遗留无效链接。</p>
		`;

		// 回收站功能说明
		const trashFeatureIntro = featuresContainer.createDiv();
		trashFeatureIntro.style.color = 'var(--text-muted)';
		trashFeatureIntro.style.padding = '12px 16px';
		trashFeatureIntro.style.backgroundColor = 'var(--background-secondary)';
		trashFeatureIntro.style.borderRadius = '6px';
		trashFeatureIntro.style.borderLeft = '3px solid var(--interactive-accent)';
		trashFeatureIntro.innerHTML = `
			<p style="margin: 0 0 10px 0; font-weight: 600; font-size: 0.95em;">🗑️ 回收站功能</p>
			<ul style="margin: 0; padding-left: 20px; line-height: 1.6; font-size: 0.95em;">
				<li><strong>安全删除</strong>：删除图片时自动移入回收站</li>
				<li><strong>预览恢复</strong>：查看已删除图片的预览和详情</li>
				<li><strong>批量操作</strong>：批量恢复或永久删除</li>
				<li><strong>路径恢复</strong>：可恢复到原始路径或指定目录</li>
			</ul>
			<p style="margin: 10px 0 0 0; font-size: 0.9em;">💡 提示：仅通过插件删除的文件会进入回收站，直接删除无法拦截。</p>
		`;

		// 快速开始指南
		const quickStartTitle = referenceSection.contentEl.createEl('h3', { text: '🚀 快速开始' });
		quickStartTitle.style.marginTop = '24px';
		quickStartTitle.style.marginBottom = '12px';
		quickStartTitle.style.fontSize = '1em';
		quickStartTitle.style.fontWeight = '600';

		const quickStartGuide = referenceSection.contentEl.createDiv();
		quickStartGuide.style.color = 'var(--text-muted)';
		quickStartGuide.style.marginBottom = '24px';
		quickStartGuide.style.padding = '12px 16px';
		quickStartGuide.style.backgroundColor = 'var(--background-secondary)';
		quickStartGuide.style.borderRadius = '6px';
		quickStartGuide.style.borderLeft = '3px solid var(--interactive-success)';
		quickStartGuide.innerHTML = `
			<ol style="margin: 0; padding-left: 20px; line-height: 1.8; font-size: 0.95em;">
				<li><strong>首次使用</strong>：点击左侧菜单"图片管理"打开主界面</li>
				<li><strong>扫描图片</strong>：点击"扫描图片"按钮，插件会自动发现所有图片</li>
				<li><strong>查看详情</strong>：点击图片卡片查看大图和引用信息</li>
				<li><strong>搜索定位</strong>：使用搜索框快速找到需要的图片</li>
				<li><strong>管理引用</strong>：在详情页查看和跳转到引用笔记</li>
				<li><strong>批量操作</strong>：多选图片进行重命名、删除等操作</li>
			</ol>
		`;

		// 常用快捷键说明
		const shortcutsTitle = referenceSection.contentEl.createEl('h3', { text: '⌨️ 常用快捷键' });
		shortcutsTitle.style.marginBottom = '12px';
		shortcutsTitle.style.fontSize = '1em';
		shortcutsTitle.style.fontWeight = '600';

		const shortcutsGuide = referenceSection.contentEl.createDiv();
		shortcutsGuide.style.color = 'var(--text-muted)';
		shortcutsGuide.style.marginBottom = '24px';
		shortcutsGuide.style.padding = '12px 16px';
		shortcutsGuide.style.backgroundColor = 'var(--background-secondary)';
		shortcutsGuide.style.borderRadius = '6px';
		shortcutsGuide.style.borderLeft = '3px solid var(--interactive-accent)';
		shortcutsGuide.innerHTML = `
			<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.95em;">
				<div><strong>Ctrl+Shift+F</strong><br/><span style="color: var(--text-faint);">聚焦搜索框</span></div>
				<div><strong>← →</strong><br/><span style="color: var(--text-faint);">切换图片</span></div>
				<div><strong>+ -</strong><br/><span style="color: var(--text-faint);">缩放图片</span></div>
				<div><strong>R</strong><br/><span style="color: var(--text-faint);">旋转图片</span></div>
				<div><strong>Delete</strong><br/><span style="color: var(--text-faint);">删除图片</span></div>
				<div><strong>Esc</strong><br/><span style="color: var(--text-faint);">关闭详情页</span></div>
			</div>
			<p style="margin: 12px 0 0 0; font-size: 0.9em;">💡 提示：可在"键盘快捷键"设置页自定义所有快捷键。</p>
		`;









		// 11. 移动端适配
		const mobileSection = { contentEl: this.tabPanels.get('mobile')! };
		
		// 添加一级标题
		const mobileTitle = mobileSection.contentEl.createEl('h2', { text: '📱 移动端适配' });
		mobileTitle.style.marginTop = '24px';
		mobileTitle.style.marginBottom = '20px';
		mobileTitle.style.fontSize = '1.6em';

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

		const mobileImagesPerRowSetting = new Setting(mobileSection.contentEl)
			.setName('移动端每行图片数量')
			.setDesc('自定义移动端显示的图片列数（1-5），留空则根据屏幕宽度自动调整');
		
		let mobileImagesPerRowText: any;
		let mobileImagesPerRowSlider: any;
		
		mobileImagesPerRowSetting.addSlider(slider => {
			mobileImagesPerRowSlider = slider;
			slider
				.setLimits(1, 5, 1)
				.setValue(this.plugin.settings.mobileImagesPerRow || 3)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.mobileImagesPerRow = value;
					if (mobileImagesPerRowText) {
						mobileImagesPerRowText.setValue(value.toString());
					}
					await this.plugin.saveSettings();
				});
		});
		
		mobileImagesPerRowSetting.addText(text => {
			mobileImagesPerRowText = text;
			text
				.setValue((this.plugin.settings.mobileImagesPerRow || 3).toString())
				.setPlaceholder('1-5')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 1 && numValue <= 5) {
					this.plugin.settings.mobileImagesPerRow = numValue;
					if (mobileImagesPerRowSlider) {
						mobileImagesPerRowSlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});

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

		const tabletImagesPerRowSetting = new Setting(mobileSection.contentEl)
			.setName('平板端每行图片数量')
			.setDesc('平板设备（768-1199px）上每行显示的图片数量');
		
		let tabletImagesPerRowText: any;
		let tabletImagesPerRowSlider: any;
		
		tabletImagesPerRowSetting.addSlider(slider => {
			tabletImagesPerRowSlider = slider;
			slider
				.setLimits(1, 5, 1)
				.setValue(this.plugin.settings.tabletImagesPerRow || 3)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.tabletImagesPerRow = value;
					if (tabletImagesPerRowText) {
						tabletImagesPerRowText.setValue(value.toString());
					}
					await this.plugin.saveSettings();
				});
		});
		
		tabletImagesPerRowSetting.addText(text => {
			tabletImagesPerRowText = text;
			text
				.setValue((this.plugin.settings.tabletImagesPerRow || 3).toString())
				.setPlaceholder('1-5')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 1 && numValue <= 5) {
					this.plugin.settings.tabletImagesPerRow = numValue;
					if (tabletImagesPerRowSlider) {
						tabletImagesPerRowSlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});

		const phoneLandscapeImagesPerRowSetting = new Setting(mobileSection.contentEl)
			.setName('手机横屏每行图片数量')
			.setDesc('手机横屏（480-767px）时每行显示的图片数量');
		
		let phoneLandscapeImagesPerRowText: any;
		let phoneLandscapeImagesPerRowSlider: any;
		
		phoneLandscapeImagesPerRowSetting.addSlider(slider => {
			phoneLandscapeImagesPerRowSlider = slider;
			slider
				.setLimits(1, 5, 1)
				.setValue(this.plugin.settings.phoneLandscapeImagesPerRow || 2)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.phoneLandscapeImagesPerRow = value;
					if (phoneLandscapeImagesPerRowText) {
						phoneLandscapeImagesPerRowText.setValue(value.toString());
					}
					await this.plugin.saveSettings();
				});
		});
		
		phoneLandscapeImagesPerRowSetting.addText(text => {
			phoneLandscapeImagesPerRowText = text;
			text
				.setValue((this.plugin.settings.phoneLandscapeImagesPerRow || 2).toString())
				.setPlaceholder('1-5')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 1 && numValue <= 5) {
					this.plugin.settings.phoneLandscapeImagesPerRow = numValue;
					if (phoneLandscapeImagesPerRowSlider) {
						phoneLandscapeImagesPerRowSlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});

		const phonePortraitImagesPerRowSetting = new Setting(mobileSection.contentEl)
			.setName('手机竖屏每行图片数量')
			.setDesc('手机竖屏（< 480px）时每行显示的图片数量');
		
		let phonePortraitImagesPerRowText: any;
		let phonePortraitImagesPerRowSlider: any;
		
		phonePortraitImagesPerRowSetting.addSlider(slider => {
			phonePortraitImagesPerRowSlider = slider;
			slider
				.setLimits(1, 2, 1)
				.setValue(this.plugin.settings.phonePortraitImagesPerRow || 1)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.phonePortraitImagesPerRow = value;
					if (phonePortraitImagesPerRowText) {
						phonePortraitImagesPerRowText.setValue(value.toString());
					}
					await this.plugin.saveSettings();
				});
		});
		
		phonePortraitImagesPerRowSetting.addText(text => {
			phonePortraitImagesPerRowText = text;
			text
				.setValue((this.plugin.settings.phonePortraitImagesPerRow || 1).toString())
				.setPlaceholder('1-2')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 1 && numValue <= 2) {
					this.plugin.settings.phonePortraitImagesPerRow = numValue;
					if (phonePortraitImagesPerRowSlider) {
						phonePortraitImagesPerRowSlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});

		// 12. 扩展
		const extensionSection = { contentEl: this.tabPanels.get('extension')! };
		
		// 添加一级标题
		const extensionTitle = extensionSection.contentEl.createEl('h2', { text: '🧩 扩展功能' });
		extensionTitle.style.marginTop = '24px';
		extensionTitle.style.marginBottom = '20px';
		extensionTitle.style.fontSize = '1.6em';

		// 12.1 库统计
		new Setting(extensionSection.contentEl)
			.setName('📊 库统计')
			.setDesc('开启后在图片管理主页显示库统计信息（图片总数量、总大小、分类统计等）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showStatistics)
				.onChange(async (value) => {
					this.plugin.settings.showStatistics = value;
					await this.plugin.saveSettings();
					// 刷新视图以更新按钮显示
					this.refreshViewToolbar();
				}));

		// 12.2 重复图片检测
		new Setting(extensionSection.contentEl)
			.setName('🔍 重复图片检测')
			.setDesc('开启后可以检测并管理重复图片（在图片管理主页显示重复检测按钮）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDuplicateDetection !== false) // 默认 true
				.onChange(async (value) => {
					this.plugin.settings.enableDuplicateDetection = value;
					await this.plugin.saveSettings();
					// 刷新视图以更新按钮显示
					this.refreshViewToolbar();
				}));

		// 添加云端图片扫描状态提示
		if (!this.plugin.settings.scanRemoteImages) {
			const duplicateDescEl = extensionSection.contentEl.createDiv({ cls: 'setting-item-description' });
			duplicateDescEl.innerHTML = `
				<p style="margin: 8px 0 0 0; font-size: 0.9em; color: var(--text-muted);">
					💡 当前已关闭云端图片扫描，重复检测将仅针对本地图片
				</p>
			`;
		}

		// 12.3 MD5去重检测（作为重复检测的子功能）
		const md5Setting = new Setting(extensionSection.contentEl)
			.setName('MD5 去重检测')
			.setDesc('自动计算图片的 MD5 哈希值，精确检测内容完全相同的重复图片（节省存储空间）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDeduplication)
				.onChange(async (value) => {
					this.plugin.settings.enableDeduplication = value;
					await this.plugin.saveSettings();
				}));
		// 添加缩进，表示这是重复检测的子功能
		md5Setting.settingEl.style.marginLeft = '24px';

		// 12.4 空链接检测
		new Setting(extensionSection.contentEl)
			.setName('🈳 空链接检测')
			.setDesc('开启后可以检测并管理笔记中的空链接')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableBrokenLinksDetection !== false) // 默认 true
				.onChange(async (value) => {
					this.plugin.settings.enableBrokenLinksDetection = value;
					await this.plugin.saveSettings();
					// 刷新视图以更新按钮显示
					this.refreshViewToolbar();
				}));

		// 添加云端图片扫描状态提示
		if (!this.plugin.settings.scanRemoteImages) {
			const brokenLinksDescEl = extensionSection.contentEl.createDiv({ cls: 'setting-item-description' });
			brokenLinksDescEl.innerHTML = `
				<p style="margin: 8px 0 0 0; font-size: 0.9em; color: var(--text-muted);">
					💡 当前已关闭云端图片扫描，空链接检测将仅针对本地图片
				</p>
			`;
		}

		// 12.5 在Android相册中隐藏Obsidian图片
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
		const ignoredFilesSection = { contentEl: this.tabPanels.get('ignored-files')! };
		
		// 添加一级标题
		const ignoredFilesTitle = ignoredFilesSection.contentEl.createEl('h2', { text: '🔒 锁定文件' });
		ignoredFilesTitle.style.marginTop = '24px';
		ignoredFilesTitle.style.marginBottom = '20px';
		ignoredFilesTitle.style.fontSize = '1.6em';

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
			<p style="margin: 8px 0 0 0; font-size: 0.9em; line-height: 1.6;">
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
		this.plugin.saveSettings().catch(async (err) => {
			if (this.plugin?.logger) {
				this.plugin.logger.error(OperationType.SETTINGS_CHANGE, '保存设置失败', {
					error: err instanceof Error ? err : new Error(String(err))
				});
			}
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

	// 12. 图床上传设置
	const uploadSection = { contentEl: this.tabPanels.get('upload')! };
	
	// 添加一级标题
	const uploadTitle = uploadSection.contentEl.createEl('h2', { text: '☁️ 网络图片' });
	uploadTitle.style.marginTop = '24px';
	uploadTitle.style.marginBottom = '20px';
	uploadTitle.style.fontSize = '1.6em';

	// 网图设置说明
	const remoteImageIntro = uploadSection.contentEl.createDiv();
	remoteImageIntro.style.color = 'var(--text-muted)';
	remoteImageIntro.style.marginBottom = '16px';
	remoteImageIntro.style.padding = '12px';
	remoteImageIntro.style.backgroundColor = 'var(--background-secondary)';
	remoteImageIntro.style.borderRadius = '6px';
	remoteImageIntro.style.fontSize = '0.9em';
	remoteImageIntro.style.borderLeft = '3px solid var(--interactive-accent)';
	remoteImageIntro.innerHTML = `
		<p style="margin: 0 0 8px 0; font-weight: 600;">🌩️ 云端图片功能说明</p>
		<ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
			<li><strong>网络图片扫描</strong>：自动扫描 Markdown 文件中的网络图片链接（http://、https://）</li>
			<li><strong>代理加载</strong>：当直接加载失败时，自动尝试通过代理服务加载图片</li>
			<li><strong>云端标识</strong>：在图片列表中显示云端图片标识，便于区分本地和云端图片</li>
		</ul>
		<p style="margin: 8px 0 0 0; font-size: 0.9em;">💡 提示：云端图片无法进行重命名、移动、删除等文件操作，但可以查看和复制链接。</p>
	`;

	// 扫描网络图片开关 - 移动到第一个位置
	new Setting(uploadSection.contentEl)
		.setName('扫描网络图片')
		.setDesc('扫描 Markdown 文件中的网络图片链接（http://、https://），并在列表中显示。关闭后将停止所有自动扫描。')
		.addToggle(toggle => toggle
			.setValue(this.plugin.settings.scanRemoteImages ?? false)
			.onChange(async (value) => {
				this.plugin.settings.scanRemoteImages = value;
				await this.plugin.saveSettings();
				
				// 根据开关状态初始化或清理网络图片缓存系统
				if (value) {
					// 启用：初始化网络图片缓存系统
					if (!this.plugin.networkImageAPI) {
						await this.plugin.initializeNetworkImageCache();
					}
					new Notice('✅ 已启用网络图片扫描，请重新扫描以查看网络图片');
				} else {
					// 禁用：清理网络图片缓存系统（可选，保留数据以便将来重新启用）
					new Notice('❌ 已禁用网络图片扫描，将停止所有自动扫描');
				}
			}));

	// 先创建所有网络图片相关设置（但不显示，稍后统一控制）
	// 网络图片代理服务
	new Setting(uploadSection.contentEl)
		.setName('网络图片代理服务')
		.setDesc('当直接加载失败时使用的代理服务（Obsidian 代理、公共代理或两者都尝试）')
		.addDropdown(dropdown => dropdown
			.addOption('none', '不使用代理')
			.addOption('obsidian', '仅 Obsidian 代理')
			.addOption('weserv', '仅公共代理（weserv.nl）')
			.addOption('both', '两者都尝试（推荐）')
			.setValue(this.plugin.settings.remoteImageProxy ?? 'both')
			.onChange(async (value) => {
				this.plugin.settings.remoteImageProxy = value as 'none' | 'obsidian' | 'weserv' | 'both';
				await this.plugin.saveSettings();
			}));

	// 云端图片加载超时
		const timeoutSetting = new Setting(uploadSection.contentEl)
			.setName('云端图片加载超时')
			.setDesc('云端图片加载的超时时间（毫秒，范围：3000-30000）');
		
		let remoteImageTimeoutText: any;
		let remoteImageTimeoutSlider: any;
		
		timeoutSetting.addSlider(slider => {
			remoteImageTimeoutSlider = slider;
			slider
				.setLimits(3000, 30000, 1000)
				.setValue(this.plugin.settings.remoteImageTimeout ?? 10000)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.remoteImageTimeout = value;
					if (remoteImageTimeoutText) {
						remoteImageTimeoutText.setValue(value.toString());
					}
					await this.plugin.saveSettings();
				});
		});
		
		timeoutSetting.addText(text => {
			remoteImageTimeoutText = text;
			text
				.setValue((this.plugin.settings.remoteImageTimeout ?? 10000).toString())
				.setPlaceholder('3000-30000')
				.setDisabled(false);
			
			if (text.inputEl) {
				text.inputEl.style.width = '45px';
				text.inputEl.style.textAlign = 'center';
			}
			
			text.onChange(async (value) => {
				const numValue = parseInt(value);
				if (!isNaN(numValue) && numValue >= 3000 && numValue <= 30000) {
					this.plugin.settings.remoteImageTimeout = numValue;
					if (remoteImageTimeoutSlider) {
						remoteImageTimeoutSlider.setValue(numValue);
					}
					await this.plugin.saveSettings();
					if (text.inputEl) {
						text.inputEl.classList.remove('error');
					}
				} else {
					if (text.inputEl) {
						text.inputEl.classList.add('error');
					}
				}
			});
		});

	// 自动重试代理加载
	new Setting(uploadSection.contentEl)
		.setName('自动重试代理加载')
		.setDesc('当直接加载失败时，自动尝试通过代理服务加载图片')
		.addToggle(toggle => toggle
			.setValue(this.plugin.settings.autoRetryRemoteImage ?? true)
			.onChange(async (value) => {
				this.plugin.settings.autoRetryRemoteImage = value;
				await this.plugin.saveSettings();
			}));

	// 网络链接
	new Setting(uploadSection.contentEl)
		.setName('网络链接')
		.setDesc('失效网络图片 URL 列表（每行一个）')
		.addTextArea(text => {
			text.setValue((this.plugin.settings.remoteImageBlacklist || []).join('\n'));
			text.setPlaceholder('http://example.com/broken-image.png');
			text.inputEl.setAttribute('style', 'width: 100%; height: 200px; min-height: 200px; resize: vertical; font-family: monospace; font-size: 0.9em;');
			text.onChange(async (value) => {
				this.plugin.settings.remoteImageBlacklist = value.split('\n').filter(line => line.trim());
				await this.plugin.saveSettings();
			});
		});

	// 扫描网络图片开关
	new Setting(uploadSection.contentEl)
		.setName('扫描网络图片')
		.setDesc('扫描 Markdown 文件中的网络图片链接（http://、https://），并在列表中显示。关闭后将停止所有自动扫描。')
		.addToggle(toggle => toggle
			.setValue(this.plugin.settings.scanRemoteImages ?? false)
			.onChange(async (value) => {
				this.plugin.settings.scanRemoteImages = value;
				await this.plugin.saveSettings();
				
				// 根据开关状态初始化或清理网络图片缓存系统
				if (value) {
					// 启用：初始化网络图片缓存系统
					if (!this.plugin.networkImageAPI) {
						await this.plugin.initializeNetworkImageCache();
					}
					new Notice('✅ 已启用网络图片扫描，请重新扫描以查看网络图片');
				} else {
					// 禁用：清理网络图片缓存系统（可选，保留数据以便将来重新启用）
					new Notice('❌ 已禁用网络图片扫描，将停止所有自动扫描');
				}
			}));


	// 图床设置分割线
	const uploadDivider = uploadSection.contentEl.createEl('div');
	uploadDivider.style.cssText = 'margin: 24px 0 12px 0; padding-top: 12px; border-top: 1px solid var(--background-modifier-border);';
	const uploadSubTitle = uploadDivider.createEl('h4', { text: '☁️ 图床上传配置' });
	uploadSubTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 0.95em; font-weight: 600; color: var(--text-normal);';

	new Setting(uploadSection.contentEl)
			.setName('图床类型')
			.setDesc('选择要使用的图床服务')
			.addDropdown(dropdown => dropdown
				.addOption('qiniu', '七牛云')
				.addOption('aliyun', '阿里云 OSS')
				.setValue(this.plugin.settings.uploadConfig?.type || 'qiniu')
				.onChange(async (value) => {
					if (!this.plugin.settings.uploadConfig) {
						this.plugin.settings.uploadConfig = { type: 'qiniu' };
					}
					this.plugin.settings.uploadConfig.type = value as any;
					await this.plugin.saveSettings();
					this.display(); // 刷新以显示对应配置
				}));

		if (this.plugin.settings.uploadConfig?.type === 'qiniu') {
			const qiniu = this.plugin.settings.uploadConfig.qiniu || { accessKey: '', secretKey: '', bucket: '', domain: '', region: 'z0' };
			this.plugin.settings.uploadConfig.qiniu = qiniu;

			new Setting(uploadSection.contentEl)
				.setName('Access Key')
				.setDesc('七牛云 Access Key')
				.addText(text => text
					.setValue(qiniu.accessKey)
					.onChange(async (value) => {
						qiniu.accessKey = value;
						await this.plugin.saveSettings();
					}));

			new Setting(uploadSection.contentEl)
				.setName('Secret Key')
				.setDesc('七牛云 Secret Key')
				.addText(text => text
					.setValue(qiniu.secretKey)
					.setPlaceholder('不会明文显示')
					.onChange(async (value) => {
						qiniu.secretKey = value;
						await this.plugin.saveSettings();
					}));

			new Setting(uploadSection.contentEl)
				.setName('存储空间 (Bucket)')
				.setDesc('七牛云存储空间名称')
				.addText(text => text
					.setValue(qiniu.bucket)
					.onChange(async (value) => {
						qiniu.bucket = value;
						await this.plugin.saveSettings();
					}));

			new Setting(uploadSection.contentEl)
				.setName('访问域名')
				.setDesc('七牛云存储空间绑定的域名 (包含 http/https)')
				.addText(text => text
					.setValue(qiniu.domain)
					.setPlaceholder('http://your-domain.com')
					.onChange(async (value) => {
						qiniu.domain = value;
						await this.plugin.saveSettings();
					}));

			new Setting(uploadSection.contentEl)
				.setName('区域')
				.setDesc('存储区域 (z0: 华东, z1: 华北, z2: 华南, na0: 北美, as0: 东南亚)')
				.addDropdown(dropdown => dropdown
					.addOption('z0', '华东')
					.addOption('z1', '华北')
					.addOption('z2', '华南')
					.addOption('na0', '北美')
					.addOption('as0', '东南亚')
					.setValue(qiniu.region)
					.onChange(async (value) => {
						qiniu.region = value;
						await this.plugin.saveSettings();
					}));
		} else if (this.plugin.settings.uploadConfig?.type === 'aliyun') {
			const aliyun = this.plugin.settings.uploadConfig.aliyun || { accessKeyId: '', accessKeySecret: '', bucket: '', region: 'oss-cn-hangzhou' };
			this.plugin.settings.uploadConfig.aliyun = aliyun;

			new Setting(uploadSection.contentEl)
				.setName('Access Key ID')
				.setDesc('阿里云 Access Key ID')
				.addText(text => text
					.setValue(aliyun.accessKeyId)
					.onChange(async (value) => {
						aliyun.accessKeyId = value;
						await this.plugin.saveSettings();
					}));

			new Setting(uploadSection.contentEl)
				.setName('Access Key Secret')
				.setDesc('阿里云 Access Key Secret')
				.addText(text => text
					.setValue(aliyun.accessKeySecret)
					.setPlaceholder('不会明文显示')
					.onChange(async (value) => {
						aliyun.accessKeySecret = value;
						await this.plugin.saveSettings();
					}));

			new Setting(uploadSection.contentEl)
				.setName('存储空间 (Bucket)')
				.setDesc('阿里云 OSS Bucket 名称')
				.addText(text => text
					.setValue(aliyun.bucket)
					.onChange(async (value) => {
						aliyun.bucket = value;
						await this.plugin.saveSettings();
					}));

			new Setting(uploadSection.contentEl)
				.setName('区域 (Region)')
				.setDesc('OSS 区域 (例如 oss-cn-hangzhou)')
				.addText(text => text
					.setValue(aliyun.region)
					.setPlaceholder('oss-cn-hangzhou')
					.onChange(async (value) => {
						aliyun.region = value;
						await this.plugin.saveSettings();
					}));

			new Setting(uploadSection.contentEl)
				.setName('自定义域名 (可选)')
				.setDesc('如果绑定了自定义域名')
				.addText(text => text
					.setValue(aliyun.customDomain || '')
					.setPlaceholder('http://oss.example.com')
					.onChange(async (value) => {
						aliyun.customDomain = value;
						await this.plugin.saveSettings();
					}));
		}

		// 13. 操作日志
		const logsSection = { contentEl: this.tabPanels.get('logs')! };
		
		// 添加一级标题
		const logsTitle = logsSection.contentEl.createEl('h2', { text: '📋 操作日志' });
		logsTitle.style.marginTop = '24px';
		logsTitle.style.marginBottom = '20px';
		logsTitle.style.fontSize = '1.6em';

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
		const shortcutsSection = { contentEl: this.tabPanels.get('shortcuts')! };
		
		// 添加一级标题
		const shortcutsMainTitle = shortcutsSection.contentEl.createEl('h2', { text: '⌨️ 键盘快捷键' });
		shortcutsMainTitle.style.marginTop = '24px';
		shortcutsMainTitle.style.marginBottom = '20px';
		shortcutsMainTitle.style.fontSize = '1.6em';

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

		const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
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

		// 在基础设置部分添加导入导出功能
		const importExportSubTitle = basicSection.contentEl.createEl('h4', { text: '⚙️备份设置' });
		importExportSubTitle.style.marginTop = '20px';
		importExportSubTitle.style.marginBottom = '12px';
		importExportSubTitle.style.paddingBottom = '8px';
		importExportSubTitle.style.borderBottom = '1px solid var(--background-modifier-border)';
		importExportSubTitle.style.fontSize = '1.2em';

		// 创建导入导出设置容器
		const importExportContainer = basicSection.contentEl.createDiv();
		importExportContainer.style.marginBottom = '16px';
		
		// 使用SettingsIOPanel渲染导入导出界面
		const settingsIoPanel = new SettingsIOPanel(this.app, this.plugin, importExportContainer);
		settingsIoPanel.render();

	}

	/**
	 * 切换到指定标签页
	 */
	private showTab(id: string): void {
		this.activeTabId = id;
		this.containerEl.querySelectorAll('.settings-tab-btn').forEach((btn) => {
			btn.classList.toggle('is-active', (btn as HTMLElement).dataset.tabId === id);
		});
		// 正确切换标签页显示状态
		for (const [pid, panel] of this.tabPanels) {
			panel.style.display = pid === id ? 'block' : 'none';
		}
	}

	/**
	 * 导出设置到 JSON 文件
	 */
	private async exportSettings() {
		try {
			const settingsJson = JSON.stringify(this.plugin.settings, null, 2);
			const blob = new Blob([settingsJson], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `imagemgr-settings-${new Date().toISOString().split('T')[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			new Notice('✅ 设置已导出');
		} catch (error) {
			new Notice('❌ 导出设置失败');
				if (this.plugin?.logger) {
					this.plugin.logger.error(OperationType.SETTINGS_CHANGE, '导出设置失败', {
						error: error instanceof Error ? error : new Error(String(error))
					});
				}
		}
	}

	/**
	 * 从 JSON 文件导入设置
	 */
	private async importSettings() {
		try {
			// 创建文件输入元素
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = '.json';
			input.style.display = 'none';

			input.onchange = async (e) => {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (!file) return;

				try {
					const text = await file.text();
					const importedSettings = JSON.parse(text);

					// 验证设置格式
					if (typeof importedSettings !== 'object' || importedSettings === null) {
						new Notice('❌ 无效的设置文件格式');
						return;
					}

					// 确认导入
					const confirmed = await ConfirmModal.show(
						this.app,
						'导入设置',
						'导入设置将覆盖当前所有设置，是否继续？',
						['导入', '取消']
					);

					if (confirmed === 'save') {
						// 合并导入的设置（保留一些关键数据）
						const currentSettings = { ...this.plugin.settings };
						this.plugin.settings = { ...currentSettings, ...importedSettings };
						
						// 确保关键字段存在
						if (!this.plugin.settings.uploadConfig) {
							this.plugin.settings.uploadConfig = currentSettings.uploadConfig || { type: 'qiniu' };
						}
						
						await this.plugin.saveSettings();
						new Notice('✅ 设置已导入，请刷新页面');
						this.display(); // 刷新设置页面
					}
				} catch (error) {
					new Notice('❌ 导入设置失败：文件格式错误');
				if (this.plugin?.logger) {
					this.plugin.logger.error(OperationType.SETTINGS_CHANGE, '导入设置失败', {
						error: error instanceof Error ? error : new Error(String(error))
					});
				}
				}

				document.body.removeChild(input);
			};

			document.body.appendChild(input);
			input.click();
		} catch (error) {
			new Notice('❌ 导入设置失败');
		if (this.plugin?.logger) {
			this.plugin.logger.error(OperationType.SETTINGS_CHANGE, '导入设置失败', {
				error: error instanceof Error ? error : new Error(String(error))
			});
		}
		}
	}
}
