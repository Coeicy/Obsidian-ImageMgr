/**
 * 排序模态框模块
 * 
 * 提供图片列表排序功能的用户界面。
 * 支持多重排序（多个规则按优先级应用）。
 */

import { App, Modal, Setting } from 'obsidian';
import { makeModalResizable } from '../utils/resizable-modal';

/** 排序字段类型 - 支持按文件名、大小、日期、尺寸、锁定状态排序 */
export type SortBy = 'name' | 'size' | 'date' | 'dimensions' | 'locked';
/** 排序顺序 - 升序或降序 */
export type SortOrder = 'asc' | 'desc';

/**
 * 单个排序规则
 * 定义一个排序条件（字段和顺序）
 */
export interface SortRule {
	/** 排序字段 */
	sortBy: SortBy;
	/** 排序顺序 */
	sortOrder: SortOrder;
}

/**
 * 排序选项
 * 支持多重排序（多个规则按优先级应用）
 */
export interface SortOptions {
	/** 排序规则数组，支持多重排序 */
	rules: SortRule[];
}

/**
 * 排序模态框类
 * 
 * 允许用户设置图片列表的排序规则
 * 支持多重排序（先按规则1排序，再按规则2排序等）
 */
export class SortModal extends Modal {
	/** 当前排序选项 */
	options: SortOptions;
	/** 提交回调函数 */
	onSubmit: (options: SortOptions) => void;
	/** 清除回调函数 */
	onClear?: () => void;
	/** 默认排序字段 */
	defaultSortBy?: string;
	/** 默认排序顺序 */
	defaultSortOrder?: string;

	constructor(app: App, currentOptions: SortOptions, onSubmit: (options: SortOptions) => void, defaultSortBy?: string, defaultSortOrder?: string, onClear?: () => void) {
		super(app);
		// 如果已经包含 rules 数组，使用它；否则创建一个默认规则（向后兼容）
		if (currentOptions.rules && Array.isArray(currentOptions.rules)) {
			this.options = currentOptions;
		} else {
			// 旧格式兼容
			const oldOptions = currentOptions as any;
			this.options = { rules: [{ sortBy: oldOptions.sortBy || 'name', sortOrder: oldOptions.sortOrder || 'asc' }] };
		}
		this.onSubmit = onSubmit;
		this.onClear = onClear;
		this.defaultSortBy = defaultSortBy;
		this.defaultSortOrder = defaultSortOrder;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// 启用模态框可调整大小
		makeModalResizable(this.modalEl, {
			minWidth: 450,
			minHeight: 350,
		});

		// Notion风格标题
		const title = contentEl.createEl('h2', { text: '排序规则' });
		title.style.cssText = `
			margin-bottom: 4px;
			font-size: 1.3em;
			font-weight: 600;
			color: var(--text-normal);
		`;

		// 排序规则列表容器
		const rulesContainer = contentEl.createDiv('sort-rules-container');
		rulesContainer.style.cssText = `
			margin-bottom: 12px;
			display: flex;
			flex-direction: column;
			gap: 4px;
		`;

		// 渲染排序规则列表
		this.renderRules(rulesContainer);

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
			if (this.onClear) {
				this.onClear();
				this.close();
			}
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

		// 添加快捷键处理（仅在模态框内部有效，使用冒泡阶段以便规则行的捕获阶段优先处理）
		const handleKeyDown = (e: KeyboardEvent) => {
			// 检查是否焦点在规则行上（规则行会在捕获阶段处理这些键）
			const focusedElement = document.activeElement;
			const isInRuleRow = focusedElement?.closest('.sort-rule-row');
		
			// Delete 键：焦点在卡片上删除规则，否则清除排序
			if (e.key === 'Delete') {
				if (isInRuleRow) {
					// 焦点在规则行上，触发删除规则（由规则行的快捷键处理器处理）
					return;
				} else {
					// 焦点不在规则行上，清除排序
					e.preventDefault();
					e.stopPropagation();
					clearBtn.click();
				}
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

	addRule() {
		this.options.rules.push({ sortBy: 'name', sortOrder: 'asc' });
	}

	removeRule(index: number) {
		this.options.rules.splice(index, 1);
	}

	moveRuleUp(index: number) {
		if (index > 0) {
			const temp = this.options.rules[index];
			this.options.rules[index] = this.options.rules[index - 1];
			this.options.rules[index - 1] = temp;
		}
	}

	moveRuleDown(index: number) {
		if (index < this.options.rules.length - 1) {
			const temp = this.options.rules[index];
			this.options.rules[index] = this.options.rules[index + 1];
			this.options.rules[index + 1] = temp;
		}
	}

	renderRules(container: HTMLElement) {
		container.empty();

		// Notion风格：为每个规则创建一行
		this.options.rules.forEach((rule, index) => {
			// 创建规则行容器
			const ruleRow = container.createDiv('sort-rule-row');
			ruleRow.tabIndex = 0; // 使规则行可获得焦点
			ruleRow.style.cssText = `
				display: flex;
				align-items: center;
				gap: 8px;
				padding: 8px 12px;
				border-radius: 6px;
				background: var(--background-secondary);
				border: 1px solid var(--background-modifier-border);
				transition: all 0.2s ease;
				width: 100%;
				box-sizing: border-box;
				outline: none;
			`;
			
			// 焦点效果
			ruleRow.addEventListener('focus', () => {
				ruleRow.style.borderColor = 'var(--interactive-accent)';
				ruleRow.style.boxShadow = '0 0 0 2px rgba(var(--interactive-accent-rgb), 0.1)';
			});
			
			ruleRow.addEventListener('blur', () => {
				ruleRow.style.borderColor = 'var(--background-modifier-border)';
				ruleRow.style.boxShadow = 'none';
			});
			
			// Tab 键处理：在规则行之间循环切换
			ruleRow.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Tab') {
					e.preventDefault();
					const allRuleRows = container.querySelectorAll('.sort-rule-row');
					const currentIndex = Array.from(allRuleRows).indexOf(ruleRow);
					
					if (e.shiftKey) {
						// Shift+Tab：焦点回到上一个规则行，最后一个循环到第一个
						if (currentIndex > 0) {
							(allRuleRows[currentIndex - 1] as HTMLElement).focus();
						} else {
							// 第一个规则行，Shift+Tab 循环到最后一个
							(allRuleRows[allRuleRows.length - 1] as HTMLElement).focus();
						}
					} else {
						// Tab：焦点到下一个规则行，最后一个循环到第一个
						if (currentIndex < allRuleRows.length - 1) {
							(allRuleRows[currentIndex + 1] as HTMLElement).focus();
						} else {
							// 最后一个规则行，Tab 循环到第一个
							(allRuleRows[0] as HTMLElement).focus();
						}
					}
				}
			});
			
			// Hover效果
			ruleRow.addEventListener('mouseenter', () => {
				ruleRow.style.background = 'var(--background-modifier-hover)';
				ruleRow.style.borderColor = 'var(--interactive-accent)';
			});
			
			ruleRow.addEventListener('mouseleave', () => {
				ruleRow.style.background = 'var(--background-secondary)';
				ruleRow.style.borderColor = 'var(--background-modifier-border)';
			});
			
			// 为规则行添加键盘快捷键支持（使用捕获阶段确保优先级）
			const ruleKeydownHandler = (e: KeyboardEvent) => {
				// 上箭头键：上移规则
				if (e.key === 'ArrowUp' && index > 0) {
					e.preventDefault();
					e.stopPropagation();
					this.moveRuleUp(index);
					this.renderRules(container);
					// 重新获得焦点（上移后焦点在上一个规则行）
					setTimeout(() => {
						const allRuleRows = container.querySelectorAll('.sort-rule-row');
						if (allRuleRows.length > index - 1) {
							(allRuleRows[index - 1] as HTMLElement).focus();
						}
					}, 0);
					return;
				}
				// 下箭头键：下移规则
				if (e.key === 'ArrowDown' && index < this.options.rules.length - 1) {
					e.preventDefault();
					e.stopPropagation();
					this.moveRuleDown(index);
					this.renderRules(container);
					// 重新获得焦点（下移后焦点在下一个规则行）
					setTimeout(() => {
						const allRuleRows = container.querySelectorAll('.sort-rule-row');
						if (allRuleRows.length > index + 1) {
							(allRuleRows[index + 1] as HTMLElement).focus();
						}
					}, 0);
					return;
				}
				// Delete键或X键：删除规则（需要至少保留一个规则）
				if ((e.key === 'Delete' || e.key === 'x' || e.key === 'X') && this.options.rules.length > 1) {
					e.preventDefault();
					e.stopPropagation();
					this.removeRule(index);
					this.renderRules(container);
					// 删除后焦点跳到最上面的规则行
					setTimeout(() => {
						const allRuleRows = container.querySelectorAll('.sort-rule-row');
						if (allRuleRows.length > 0) {
							(allRuleRows[0] as HTMLElement).focus();
						}
					}, 0);
					return;
				}
				// Space键：切换排序顺序（asc <-> desc）
				if (e.key === ' ') {
					const newOrder = rule.sortOrder === 'asc' ? 'desc' : 'asc';
					e.preventDefault();
					e.stopPropagation();
					rule.sortOrder = newOrder;
					this.renderRules(container);
					// 重新获得焦点（保持在当前规则行）
					setTimeout(() => {
						const allRuleRows = container.querySelectorAll('.sort-rule-row');
						if (allRuleRows.length > index) {
							(allRuleRows[index] as HTMLElement).focus();
						}
					}, 0);
					return;
				}
			};
			ruleRow.addEventListener('keydown', ruleKeydownHandler, true);
			
			// 序号（左侧）
			const orderNumber = ruleRow.createDiv('order-number');
			orderNumber.textContent = String(index + 1);
			orderNumber.style.cssText = `
				display: flex;
				align-items: center;
				justify-content: center;
				width: 24px;
				height: 24px;
				color: var(--text-normal);
				font-size: 0.85em;
				font-weight: 600;
				user-select: none;
				flex-shrink: 0;
				background: var(--background-modifier-border);
				border-radius: 4px;
			`;
			
			// 排序字段下拉框（中间，占据剩余空间）
			const sortByDropdown = ruleRow.createEl('select', { cls: 'notion-sort-select' });
			sortByDropdown.tabIndex = -1; // 不通过 Tab 键获得焦点
			sortByDropdown.style.cssText = `
				flex: 1;
				min-width: 0;
				padding: 6px 10px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-primary);
				color: var(--text-normal);
				font-size: 0.9em;
				cursor: pointer;
				transition: all 0.2s ease;
				appearance: none;
				background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
				background-repeat: no-repeat;
				background-position: right 8px center;
				background-size: 10px;
				padding-right: 28px;
			`;
			
			sortByDropdown.innerHTML = `
				<option value="name" ${rule.sortBy === 'name' ? 'selected' : ''}>文件名</option>
				<option value="size" ${rule.sortBy === 'size' ? 'selected' : ''}>文件大小</option>
				<option value="date" ${rule.sortBy === 'date' ? 'selected' : ''}>修改日期</option>
				<option value="dimensions" ${rule.sortBy === 'dimensions' ? 'selected' : ''}>图片尺寸</option>
				<option value="locked" ${rule.sortBy === 'locked' ? 'selected' : ''}>🔒 锁定</option>
			`;
			
			sortByDropdown.addEventListener('change', (e) => {
				rule.sortBy = (e.target as HTMLSelectElement).value as SortBy;
				// 选择完成后将焦点返回给规则行
				ruleRow.focus();
			});
			
			sortByDropdown.addEventListener('focus', () => {
				sortByDropdown.style.borderColor = 'var(--interactive-accent)';
				sortByDropdown.style.boxShadow = '0 0 0 2px rgba(var(--interactive-accent-rgb), 0.1)';
			});
			
			sortByDropdown.addEventListener('blur', () => {
				sortByDropdown.style.borderColor = 'var(--background-modifier-border)';
				sortByDropdown.style.boxShadow = 'none';
			});
			
			// 排序方向下拉框
			const orderDropdown = ruleRow.createEl('select', { cls: 'notion-sort-order' });
			orderDropdown.tabIndex = -1; // 不通过 Tab 键获得焦点
			orderDropdown.style.cssText = `
				width: 80px;
				padding: 6px 24px 6px 10px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-primary);
				color: var(--text-normal);
				font-size: 0.9em;
				cursor: pointer;
				transition: all 0.2s ease;
				appearance: none;
				background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
				background-repeat: no-repeat;
				background-position: right 8px center;
				background-size: 10px;
				flex-shrink: 0;
			`;
			
			orderDropdown.innerHTML = `
				<option value="asc" ${rule.sortOrder === 'asc' ? 'selected' : ''}>升序</option>
				<option value="desc" ${rule.sortOrder === 'desc' ? 'selected' : ''}>降序</option>
			`;
			
			orderDropdown.addEventListener('change', (e) => {
				rule.sortOrder = (e.target as HTMLSelectElement).value as SortOrder;
				// 选择完成后将焦点返回给规则行
				ruleRow.focus();
			});
			
			orderDropdown.addEventListener('focus', () => {
				orderDropdown.style.borderColor = 'var(--interactive-accent)';
				orderDropdown.style.boxShadow = '0 0 0 2px rgba(var(--interactive-accent-rgb), 0.1)';
			});
			
			orderDropdown.addEventListener('blur', () => {
				orderDropdown.style.borderColor = 'var(--background-modifier-border)';
				orderDropdown.style.boxShadow = 'none';
			});
			
			// 上移按钮
			const moveUpBtn = ruleRow.createEl('button', { cls: 'move-btn', title: '上移' });
			moveUpBtn.tabIndex = -1; // 不通过 Tab 键获得焦点
			moveUpBtn.innerHTML = '↑';
			moveUpBtn.style.cssText = `
				width: 28px;
				height: 28px;
				padding: 0;
				display: flex;
				align-items: center;
				justify-content: center;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-primary);
				color: var(--text-normal);
				cursor: pointer;
				font-size: 14px;
				font-weight: 600;
				flex-shrink: 0;
				transition: all 0.2s ease;
				opacity: ${index === 0 ? '0.3' : '1'};
			`;
			moveUpBtn.disabled = index === 0;
			
			moveUpBtn.addEventListener('mouseenter', () => {
				if (!moveUpBtn.disabled) {
					moveUpBtn.style.borderColor = 'var(--interactive-accent)';
					moveUpBtn.style.color = 'var(--interactive-accent)';
					moveUpBtn.style.background = 'rgba(var(--interactive-accent-rgb), 0.1)';
				}
			});
			
			moveUpBtn.addEventListener('mouseleave', () => {
				if (!moveUpBtn.disabled) {
					moveUpBtn.style.borderColor = 'var(--background-modifier-border)';
					moveUpBtn.style.color = 'var(--text-normal)';
					moveUpBtn.style.background = 'var(--background-primary)';
				}
			});
			
			moveUpBtn.addEventListener('click', () => {
				if (index > 0) {
					this.moveRuleUp(index);
					this.renderRules(container);
					// 点击后将焦点返回给规则行
					setTimeout(() => {
						const allRuleRows = container.querySelectorAll('.sort-rule-row');
						if (allRuleRows.length > index - 1) {
							(allRuleRows[index - 1] as HTMLElement).focus();
						}
					}, 0);
				}
			});
			
			// 下移按钮
			const moveDownBtn = ruleRow.createEl('button', { cls: 'move-btn', title: '下移' });
			moveDownBtn.tabIndex = -1; // 不通过 Tab 键获得焦点
			moveDownBtn.innerHTML = '↓';
			moveDownBtn.style.cssText = `
				width: 28px;
				height: 28px;
				padding: 0;
				display: flex;
				align-items: center;
				justify-content: center;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-primary);
				color: var(--text-normal);
				cursor: pointer;
				font-size: 14px;
				font-weight: 600;
				flex-shrink: 0;
				transition: all 0.2s ease;
				opacity: ${index === this.options.rules.length - 1 ? '0.3' : '1'};
			`;
			moveDownBtn.disabled = index === this.options.rules.length - 1;
			
			moveDownBtn.addEventListener('mouseenter', () => {
				if (!moveDownBtn.disabled) {
					moveDownBtn.style.borderColor = 'var(--interactive-accent)';
					moveDownBtn.style.color = 'var(--interactive-accent)';
					moveDownBtn.style.background = 'rgba(var(--interactive-accent-rgb), 0.1)';
				}
			});
			
			moveDownBtn.addEventListener('mouseleave', () => {
				if (!moveDownBtn.disabled) {
					moveDownBtn.style.borderColor = 'var(--background-modifier-border)';
					moveDownBtn.style.color = 'var(--text-normal)';
					moveDownBtn.style.background = 'var(--background-primary)';
				}
			});
			
			moveDownBtn.addEventListener('click', () => {
				if (index < this.options.rules.length - 1) {
					this.moveRuleDown(index);
					this.renderRules(container);
					// 点击后将焦点返回给规则行
					setTimeout(() => {
						const allRuleRows = container.querySelectorAll('.sort-rule-row');
						if (allRuleRows.length > index + 1) {
							(allRuleRows[index + 1] as HTMLElement).focus();
						}
					}, 0);
				}
			});
			
			// 删除按钮（右侧）
			const deleteBtn = ruleRow.createEl('button', { cls: 'notion-delete-btn', title: '删除' });
			deleteBtn.tabIndex = -1; // 不通过 Tab 键获得焦点
			deleteBtn.innerHTML = '✕';
			deleteBtn.style.cssText = `
				width: 24px;
				height: 24px;
				padding: 0;
				display: flex;
				align-items: center;
				justify-content: center;
				border: none;
				border-radius: 4px;
				background: transparent;
				color: var(--text-faint);
				cursor: pointer;
				font-size: 16px;
				font-weight: 300;
				flex-shrink: 0;
				transition: all 0.2s ease;
				opacity: 0.5;
			`;
			
			deleteBtn.addEventListener('mouseenter', () => {
				deleteBtn.style.opacity = '1';
				deleteBtn.style.color = 'var(--text-error)';
				deleteBtn.style.background = 'rgba(var(--text-error-rgb), 0.1)';
			});
			
			deleteBtn.addEventListener('mouseleave', () => {
				deleteBtn.style.opacity = '0.5';
				deleteBtn.style.color = 'var(--text-faint)';
				deleteBtn.style.background = 'transparent';
			});
			
			deleteBtn.addEventListener('click', () => {
				this.removeRule(index);
				this.renderRules(container);
				// 删除后将焦点返回给规则行
				setTimeout(() => {
					const allRuleRows = container.querySelectorAll('.sort-rule-row');
					if (allRuleRows.length > 0) {
						(allRuleRows[0] as HTMLElement).focus();
					}
				}, 0);
			});
		});
		
		// 添加排序条件按钮（Notion风格）
		const addButton = container.createEl('button', { cls: 'notion-add-button' });
		addButton.textContent = '+ 添加排序条件';
		addButton.style.cssText = `
			width: 100%;
			padding: 8px 12px;
			margin-top: 4px;
			text-align: left;
			border: 1px dashed var(--background-modifier-border);
			border-radius: 6px;
			background: transparent;
			color: var(--text-muted);
			cursor: pointer;
			font-size: 0.9em;
			transition: all 0.2s ease;
		`;
		
		addButton.addEventListener('mouseenter', () => {
			addButton.style.borderColor = 'var(--interactive-accent)';
			addButton.style.color = 'var(--interactive-accent)';
			addButton.style.background = 'rgba(var(--interactive-accent-rgb), 0.05)';
		});
		
		addButton.addEventListener('mouseleave', () => {
			addButton.style.borderColor = 'var(--background-modifier-border)';
			addButton.style.color = 'var(--text-muted)';
			addButton.style.background = 'transparent';
		});
		
		addButton.addEventListener('click', () => {
			this.addRule();
			this.renderRules(container);
			// 添加后将焦点返回给新添加的规则行
			setTimeout(() => {
				const allRuleRows = container.querySelectorAll('.sort-rule-row');
				if (allRuleRows.length > 0) {
					(allRuleRows[allRuleRows.length - 1] as HTMLElement).focus();
				}
			}, 0);
		});

		// 添加提示信息（在添加排序条件按钮下面）
		const getSortByText = (sortBy: string): string => {
			const map: Record<string, string> = {
				'name': '文件名',
				'size': '文件大小',
				'date': '修改日期',
				'dimensions': '图片尺寸',
				'locked': '锁定状态'
			};
			return map[sortBy] || sortBy;
		};

		const getSortOrderText = (order: string): string => {
			return order === 'asc' ? '升序' : '降序';
		};

		const hintDiv = container.createDiv({ cls: 'sort-hint' });
		hintDiv.style.cssText = `
			margin-top: 12px;
			padding: 10px 12px;
			background: var(--background-secondary);
			border-radius: 6px;
			border-left: 3px solid var(--interactive-accent);
			font-size: 0.9em;
			color: var(--text-muted);
			line-height: 1.6;
		`;
		
		let hintText = '💡 提示：\n';
		
		if (this.defaultSortBy && this.defaultSortOrder) {
			hintText += `• 默认排序：${getSortByText(this.defaultSortBy)} (${getSortOrderText(this.defaultSortOrder)})\n`;
		}
		
		hintText += '• 支持多级排序：可以添加多个排序条件，按顺序应用\n';
		hintText += '• 使用 ↑↓ 按钮可以调整排序规则的顺序';
		
		hintDiv.createEl('div', {
			text: hintText,
			attr: { style: 'white-space: pre-line;' }
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

