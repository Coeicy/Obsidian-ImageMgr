import { App, Modal, Setting } from 'obsidian';
import { makeModalResizable } from '../utils/resizable-modal';

/** 文件类型筛选 - 支持多种图片格式 */
export type FilterType = 'all' | 'png' | 'jpg' | 'gif' | 'webp' | 'svg' | 'bmp';
/** 锁定状态筛选 - 显示所有、仅锁定或仅未锁定的文件 */
export type LockFilter = 'all' | 'locked' | 'unlocked';
/** 引用状态筛选 - 显示所有、仅被引用或仅未被引用的文件 */
export type ReferenceFilter = 'all' | 'referenced' | 'unreferenced';

/**
 * 文件大小范围
 * 用于按大小范围筛选图片
 */
export interface SizeRange {
	/** 最小文件大小（MB） */
	min?: number;
	/** 最大文件大小（MB） */
	max?: number;
}

/**
 * 筛选选项
 * 定义多维度的筛选条件
 */
export interface FilterOptions {
	/** 文件类型筛选 */
	filterType: FilterType;
	/** 锁定状态筛选 */
	lockFilter?: LockFilter;
	/** 引用状态筛选 */
	referenceFilter?: ReferenceFilter;
	/** 文件大小范围筛选 */
	sizeFilter?: SizeRange;
	/** 文件名搜索筛选 */
	nameFilter?: string;
	/** 文件夹路径筛选 */
	folderFilter?: string;
}

/**
 * 筛选模态框类
 * 
 * 允许用户设置多维度的筛选条件：
 * - 文件类型（PNG、JPG 等）
 * - 锁定状态（已锁定、未锁定）
 * - 引用状态（已引用、未引用）
 * - 文件大小范围
 * - 文件名搜索
 * - 文件夹路径
 */
export class FilterModal extends Modal {
	/** 当前筛选选项 */
	options: FilterOptions;
	/** 提交回调函数 */
	onSubmit: (options: FilterOptions) => void;

	constructor(app: App, currentOptions: FilterOptions, onSubmit: (options: FilterOptions) => void) {
		super(app);
		this.options = { ...currentOptions };
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// 启用模态框可调整大小
		makeModalResizable(this.modalEl, {
			minWidth: 450,
			minHeight: 400,
		});

		contentEl.createEl('h2', { text: '筛选设置' });

		new Setting(contentEl)
			.setName('📄 文件类型')
			.setDesc('选择要显示的文件类型')
			.addDropdown(dropdown => dropdown
				.addOption('all', '全部')
				.addOption('png', 'PNG')
				.addOption('jpg', 'JPG')
				.addOption('gif', 'GIF')
				.addOption('webp', 'WebP')
				.addOption('svg', 'SVG')
				.addOption('bmp', 'BMP')
				.setValue(this.options.filterType)
				.onChange((value: FilterType) => {
					this.options.filterType = value;
				}));

		new Setting(contentEl)
			.setName('🔒 锁定状态')
			.setDesc('选择要显示的文件状态')
			.addDropdown(dropdown => dropdown
				.addOption('all', '全部')
				.addOption('locked', '🔒 已锁定')
				.addOption('unlocked', '🔓 未锁定')
				.setValue(this.options.lockFilter || 'all')
				.onChange((value: LockFilter) => {
					this.options.lockFilter = value;
				}));

		new Setting(contentEl)
			.setName('🔗 引用状态')
			.setDesc('选择是否显示被引用的图片')
			.addDropdown(dropdown => dropdown
				.addOption('all', '全部')
				.addOption('referenced', '🔗 被引用')
				.addOption('unreferenced', '🔗 未被引用')
				.setValue(this.options.referenceFilter || 'all')
				.onChange((value: ReferenceFilter) => {
					this.options.referenceFilter = value;
				}));

		// 图片大小筛选 - 使用两个输入框
		const sizeSetting = new Setting(contentEl)
			.setName('📏 图片大小范围')
			.setDesc('设置文件大小范围（单位：MB）');
		
		// 最小值输入框
		sizeSetting.addText(text => {
			const input = text
				.setPlaceholder('最小值')
				.setValue(`${this.options.sizeFilter?.min || ''}`)
				.inputEl;
			
			input.type = 'number';
			input.min = '0';
			input.step = '0.1';
			input.style.width = '80px';
			
			input.addEventListener('input', (e) => {
				const value = (e.target as HTMLInputElement).value;
				const numValue = value ? parseFloat(value) : undefined;
				if (!this.options.sizeFilter) {
					this.options.sizeFilter = {};
				}
				this.options.sizeFilter!.min = numValue;
			});
		});
		
		// 添加分隔符 - 在 controlEl 中添加
		const separator = sizeSetting.controlEl.createSpan();
		separator.textContent = ' ~ ';
		separator.style.padding = '0 4px';
		
		// 最大值输入框
		sizeSetting.addText(text => {
			const input = text
				.setPlaceholder('最大值')
				.setValue(this.options.sizeFilter?.max?.toString() || '')
				.inputEl;
			
			input.type = 'number';
			input.min = '0';
			input.step = '0.1';
			input.style.width = '80px';
			
			input.addEventListener('input', (e) => {
				const value = (e.target as HTMLInputElement).value;
				const numValue = value ? parseFloat(value) : undefined;
				if (!this.options.sizeFilter) {
					this.options.sizeFilter = {};
				}
				this.options.sizeFilter!.max = numValue;
			});
		});
		
		new Setting(contentEl)
			.setName('🔍 名称搜索')
			.setDesc('输入关键词搜索文件名')
			.addText(text => text
				.setPlaceholder('输入文件名关键词')
				.setValue(this.options.nameFilter || '')
				.onChange((value) => {
					this.options.nameFilter = value;
				}));

		// 文件夹筛选 - 支持输入和多个文件夹（逗号分隔）
		const folderSetting = new Setting(contentEl)
			.setName('📁 文件夹筛选')
			.setDesc('输入文件夹路径，多个文件夹用逗号分隔');
		
		// 获取所有文件夹用于自动补全
		const allFolders = this.app.vault.getAllFolders();
		const folderPaths = allFolders.map(f => f.path).sort();
		
		// 创建输入框，带自动补全功能
		const folderInputContainer = folderSetting.controlEl;
		folderInputContainer.style.minWidth = '300px';
		
		const folderInput = folderSetting.controlEl.createEl('input', {
			type: 'text',
			cls: 'folder-filter-input',
			placeholder: '例如: images/, documents/photos, assets'
		});
		
		folderInput.value = this.options.folderFilter || '';
		folderInput.style.width = '100%';
		folderInput.style.padding = '6px 8px';
		folderInput.style.border = '1px solid var(--background-modifier-border)';
		folderInput.style.borderRadius = '4px';
		folderInput.style.backgroundColor = 'var(--background-primary)';
		folderInput.style.color = 'var(--text-normal)';
		folderInput.style.fontSize = '14px';
		
		// 自动补全容器 - 相对于 controlEl 定位
		folderInputContainer.style.position = 'relative';
		const suggestionsContainer = folderInputContainer.createDiv('folder-suggestions');
		suggestionsContainer.style.display = 'none';
		suggestionsContainer.style.position = 'absolute';
		suggestionsContainer.style.top = '100%';
		suggestionsContainer.style.left = '0';
		suggestionsContainer.style.right = '0';
		suggestionsContainer.style.backgroundColor = 'var(--background-primary)';
		suggestionsContainer.style.border = '1px solid var(--background-modifier-border)';
		suggestionsContainer.style.borderRadius = '4px';
		suggestionsContainer.style.maxHeight = '200px';
		suggestionsContainer.style.overflowY = 'auto';
		suggestionsContainer.style.zIndex = '1000';
		suggestionsContainer.style.marginTop = '4px';
		suggestionsContainer.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
		
		let selectedIndex = -1;
		let currentSuggestions: HTMLElement[] = [];
		
		// 显示建议
		const showSuggestions = (query: string) => {
			if (!query || query.trim() === '') {
				suggestionsContainer.style.display = 'none';
				return;
			}
			
			// 获取当前输入位置前的最后一个逗号后的部分
			const cursorPos = folderInput.selectionStart || 0;
			const textBeforeCursor = query.substring(0, cursorPos);
			const lastCommaIndex = textBeforeCursor.lastIndexOf(',');
			const currentQuery = lastCommaIndex >= 0 
				? textBeforeCursor.substring(lastCommaIndex + 1).trim()
				: textBeforeCursor.trim();
			
			if (!currentQuery) {
				suggestionsContainer.style.display = 'none';
				return;
			}
			
			// 获取已经输入的文件夹列表
			const beforeLastComma = lastCommaIndex >= 0 ? query.substring(0, lastCommaIndex) : '';
			const alreadySelected = beforeLastComma.split(',').map(f => f.trim()).filter(f => f);
			
			// 过滤匹配的文件夹，排除已经输入过的
			const matches = folderPaths.filter(path => {
				const displayPath = path || '(根目录)';
				// 检查是否已经在已选择列表中
				if (alreadySelected.includes(path)) {
					return false;
				}
				return displayPath.toLowerCase().includes(currentQuery.toLowerCase());
			}).slice(0, 8); // 最多显示8个建议
			
			if (matches.length === 0) {
				suggestionsContainer.style.display = 'none';
				return;
			}
			
			suggestionsContainer.empty();
			currentSuggestions = [];
			
			matches.forEach((path, index) => {
				const suggestion = suggestionsContainer.createDiv('suggestion-item');
				suggestion.style.padding = '6px 12px';
				suggestion.style.cursor = 'pointer';
				suggestion.style.borderBottom = index < matches.length - 1 
					? '1px solid var(--background-modifier-border)' 
					: 'none';
				suggestion.textContent = path || '(根目录)';
				
				suggestion.addEventListener('mouseenter', () => {
					currentSuggestions.forEach(s => {
						s.style.backgroundColor = 'transparent';
					});
					suggestion.style.backgroundColor = 'var(--background-modifier-hover)';
					selectedIndex = index;
				});
				
				suggestion.addEventListener('click', () => {
					const beforeComma = lastCommaIndex >= 0 ? query.substring(0, lastCommaIndex + 1) + ' ' : '';
					const afterCursor = query.substring(cursorPos);
					const newValue = beforeComma + path + ', ' + (afterCursor ? afterCursor : '');
					folderInput.value = newValue;
					this.options.folderFilter = newValue.trim() || undefined;
					suggestionsContainer.style.display = 'none';
					folderInput.focus();
					// 设置光标位置到路径后的分隔符后面
					const newCursorPos = beforeComma.length + path.length + 2; // +2 for ', '
					setTimeout(() => {
						folderInput.setSelectionRange(newCursorPos, newCursorPos);
					}, 0);
				});
				
				currentSuggestions.push(suggestion);
			});
			
			suggestionsContainer.style.display = 'block';
			selectedIndex = -1;
		};
		
		// 输入事件
		folderInput.addEventListener('input', (e) => {
			const value = (e.target as HTMLInputElement).value;
			this.options.folderFilter = value.trim() || undefined;
			showSuggestions(value);
		});
		
		// 键盘导航
		folderInput.addEventListener('keydown', (e) => {
			// Delete 键：从后往前依次删除整个文件夹
			if (e.key === 'Delete') {
				const cursorPos = folderInput.selectionStart || 0;
				const value = folderInput.value;
				
				// 检查光标是否在末尾且输入框以分隔符结尾
				if (cursorPos === value.length && value.endsWith(', ')) {
					e.preventDefault();
					e.stopPropagation();
					// 移除末尾的分隔符后查找前一个逗号
					const withoutTrailingSeparator = value.substring(0, value.length - 2); // 移除末尾的 ', '
					const lastCommaIndex = withoutTrailingSeparator.lastIndexOf(',');
					
					if (lastCommaIndex >= 0) {
						// 保留到前一个逗号，并添加分隔符
						const newValue = withoutTrailingSeparator.substring(0, lastCommaIndex + 1) + ' ';
						folderInput.value = newValue;
						this.options.folderFilter = newValue.trim() || undefined;
						folderInput.setSelectionRange(newValue.length, newValue.length);
					} else {
						// 没有其他文件夹，清空
						folderInput.value = '';
						this.options.folderFilter = undefined;
					}
					showSuggestions(folderInput.value);
					return;
				}
				// 其他情况也要 stopPropagation，防止被全局 Delete 键处理器拦截
				e.stopPropagation();
			}
			
			if (suggestionsContainer.style.display === 'none') {
				if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
					showSuggestions(folderInput.value);
				}
				return;
			}
			
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
				currentSuggestions[selectedIndex]?.scrollIntoView({ block: 'nearest' });
				currentSuggestions.forEach((s, i) => {
					s.style.backgroundColor = i === selectedIndex ? 'var(--background-modifier-hover)' : 'transparent';
				});
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				if (selectedIndex >= 0) {
					currentSuggestions[selectedIndex]?.scrollIntoView({ block: 'nearest' });
					currentSuggestions.forEach((s, i) => {
						s.style.backgroundColor = i === selectedIndex ? 'var(--background-modifier-hover)' : 'transparent';
					});
				}
			} else if (e.key === 'Enter') {
				if (selectedIndex >= 0) {
					// 选中了建议项，只确认文件夹选择，不确认筛选
					e.preventDefault();
					e.stopPropagation();
					currentSuggestions[selectedIndex].click();
					return;
				} else if (suggestionsContainer.style.display !== 'none') {
					// 建议框显示但没有选中项，不处理
					return;
				} else {
					// 焦点在输入框但建议框不显示，确认筛选
					e.preventDefault();
					e.stopPropagation();
					submitBtn.click();
				}
			} else if (e.key === 'Escape') {
				suggestionsContainer.style.display = 'none';
			}
		});
		
		// 点击外部关闭建议 - 使用 Obsidian 的事件注册系统
		this.modalEl.addEventListener('click', (e: MouseEvent) => {
			if (!folderSetting.settingEl.contains(e.target as Node)) {
				suggestionsContainer.style.display = 'none';
			}
		});
		
		// 聚焦时显示建议
		folderInput.addEventListener('focus', () => {
			if (folderInput.value) {
				showSuggestions(folderInput.value);
			}
		});

		// 创建按钮容器
		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.cssText = `
			display: flex;
			gap: 8px;
			justify-content: flex-end;
			margin-top: 16px;
		`;

		// 清除按钮
		const clearBtn = buttonContainer.createEl('button');
		clearBtn.textContent = '清除';
		clearBtn.style.cssText = `
			padding: 6px 12px;
			border: 1px solid var(--text-error);
			border-radius: 4px;
			background: var(--text-error);
			color: white;
			cursor: pointer;
			font-size: 0.9em;
		`;
		clearBtn.addEventListener('click', () => {
			// 清除所有筛选选项为默认值
			this.options = {
				filterType: 'all',
				lockFilter: undefined,
				referenceFilter: undefined,
				sizeFilter: undefined,
				nameFilter: undefined,
				folderFilter: undefined
			};
			// 立即通知父视图应用变更，刷新列表与按钮指示点
			this.onSubmit(this.options);
			// 重新渲染UI以反映清除后的状态
			this.onOpen();
		});
		clearBtn.addEventListener('mouseenter', () => {
			clearBtn.style.opacity = '0.8';
		});
		clearBtn.addEventListener('mouseleave', () => {
			clearBtn.style.opacity = '1';
		});

		// 取消按钮
		const cancelBtn = buttonContainer.createEl('button');
		cancelBtn.textContent = '取消';
		cancelBtn.style.cssText = `
			padding: 6px 12px;
			border: 1px solid var(--background-modifier-border);
			border-radius: 4px;
			background: var(--background-secondary);
			color: var(--text-normal);
			cursor: pointer;
			font-size: 0.9em;
		`;
		cancelBtn.addEventListener('click', () => this.close());
		cancelBtn.addEventListener('mouseenter', () => {
			cancelBtn.style.background = 'var(--background-modifier-hover)';
		});
		cancelBtn.addEventListener('mouseleave', () => {
			cancelBtn.style.background = 'var(--background-secondary)';
		});

		// 确定按钮
		const submitBtn = buttonContainer.createEl('button');
		submitBtn.textContent = '确定';
		submitBtn.style.cssText = `
			padding: 6px 12px;
			border: 1px solid var(--interactive-accent);
			border-radius: 4px;
			background: var(--interactive-accent);
			color: var(--text-on-accent);
			cursor: pointer;
			font-size: 0.9em;
		`;
		submitBtn.addEventListener('click', () => {
			this.onSubmit(this.options);
			this.close();
		});
		submitBtn.addEventListener('mouseenter', () => {
			submitBtn.style.opacity = '0.8';
		});
		submitBtn.addEventListener('mouseleave', () => {
			submitBtn.style.opacity = '1';
		});

		// 添加快捷键处理（仅在模态框内部有效）
		const handleKeyDown = (e: KeyboardEvent) => {
			// Delete 键清除
			if (e.key === 'Delete') {
				e.preventDefault();
				e.stopPropagation();
				clearBtn.click();
			} else if (e.key === 'Escape') {
				// Escape 键取消
				e.preventDefault();
				e.stopPropagation();
				cancelBtn.click();
			} else if (e.key === 'Enter') {
				// Enter 键确定
				e.preventDefault();
				e.stopPropagation();
				submitBtn.click();
			}
		};
		contentEl.addEventListener('keydown', handleKeyDown, false);
		
		// 在模态框关闭时移除事件监听
		const originalOnClose = this.onClose.bind(this);
		this.onClose = () => {
			contentEl.removeEventListener('keydown', handleKeyDown, false);
			originalOnClose();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

