import { App, Modal, Setting, TextComponent } from 'obsidian';
import { Notice } from 'obsidian';
import { makeModalResizable } from '../utils/resizable-modal';

export interface GroupOptions {
    mode: 'folder' | 'type' | 'reference' | 'lock' | 'custom';
    name?: string; // 自定义分组名称（当 mode = custom 时必填）
    scope: 'all' | 'filtered' | 'selected';
    action?: 'apply' | 'reset';
}

export class GroupModal extends Modal {
	onSubmit: (options: GroupOptions) => void;
	selectedCount: number;
	filteredCount: number;
	totalCount: number;
	currentGroupMode: 'folder' | 'type' | 'reference' | 'lock' | 'custom' | null;

    constructor(app: App, counts: { selected: number, filtered: number, total: number }, onSubmit: (options: GroupOptions) => void, currentGroupMode?: 'folder' | 'type' | 'reference' | 'lock' | 'custom') {
		super(app);
		this.selectedCount = counts.selected;
		this.filteredCount = counts.filtered;
		this.totalCount = counts.total;
		this.onSubmit = onSubmit;
		this.currentGroupMode = currentGroupMode || null;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// 启用模态框可调整大小
		makeModalResizable(this.modalEl, {
			minWidth: 450,
			minHeight: 350,
		});

        contentEl.createEl('h2', { text: '创建图片分组' });

        // 默认为 'folder'，如果有当前分组模式则使用当前模式
        let groupMode: 'folder' | 'type' | 'reference' | 'lock' | 'custom' = this.currentGroupMode ? this.currentGroupMode : 'folder';
        let groupName = '';
        let scope: 'all' | 'filtered' | 'selected' = 'filtered';

        // 分组方式选择
        new Setting(contentEl)
            .setName('分组方式')
            .setDesc('选择如何对图片进行分组')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('folder', '按位置（文件夹）')
                    .addOption('type', '按类型（PNG/JPG/…）')
                    .addOption('reference', '按引用状态（被引用/未引用）')
                    .addOption('lock', '按锁定状态（锁定/未锁定）')
                    .addOption('custom', '自定义名称')
                    .setValue(groupMode)
                    .onChange(value => {
                        groupMode = value as any;
                        nameInput.settingEl.style.display = groupMode === 'custom' ? '' : 'none';
                    });
            });

        // 作用范围
        const scopeDesc = contentEl.createDiv();
        scopeDesc.style.cssText = `
            margin: 8px 0;
            padding: 8px;
            background-color: var(--background-secondary);
            border-radius: 4px;
            font-size: 0.9em;
            color: var(--text-muted);
        `;
        const updateScopeDesc = (currentScope: string) => {
            const counts = {
                'all': `所有图片：${this.totalCount} 张`,
                'filtered': `当前筛选结果：${this.filteredCount} 张`,
                'selected': `选中图片：${this.selectedCount} 张`
            };
            scopeDesc.textContent = `📊 ${counts[currentScope as keyof typeof counts] || counts.filtered}`;
        };
        updateScopeDesc(scope);

        new Setting(contentEl)
            .setName('作用范围')
            .setDesc('选择对哪些图片应用分组')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('all', `所有图片 (${this.totalCount}张)`)
                    .addOption('filtered', `当前筛选结果 (${this.filteredCount}张)`)
                    .addOption('selected', `选中图片 (${this.selectedCount}张)`)
                    .setValue(scope)
                    .onChange(value => {
                        scope = value as 'all' | 'filtered' | 'selected';
                        updateScopeDesc(scope);
                    });
            });

        // 分组名称输入（仅自定义）
        let nameTextEl: HTMLInputElement | null = null;
        const nameInput = new Setting(contentEl)
            .setName('分组名称')
            .setDesc('请输入自定义分组名称')
            .addText(text => {
                text.setPlaceholder('例如：产品图片、设计稿')
                    .setValue(groupName)
                    .onChange(value => {
                        groupName = value;
                    });
                nameTextEl = text.inputEl;
            });
        nameInput.settingEl.style.display = 'none';

        // 最近使用的自定义分组（便于快速选择与删除记录）
        const plugin: any = (this.app as any).plugins?.getPlugin?.('imagemgr');
        const recentContainer = contentEl.createDiv();
        recentContainer.style.display = 'none';
        recentContainer.style.marginTop = '6px';
        const renderRecent = () => {
            recentContainer.empty();
            const list: string[] = (plugin?.data?.customGroupNames || []) as string[];
            if (!list || list.length === 0) {
                recentContainer.style.display = 'none';
                return;
            }
            recentContainer.style.display = '';
            const title = recentContainer.createDiv();
            title.textContent = '最近分组';
            title.style.color = 'var(--text-muted)';
            title.style.fontSize = '12px';
            title.style.marginBottom = '4px';
            const pills = recentContainer.createDiv();
            pills.style.display = 'flex';
            pills.style.flexWrap = 'wrap';
            pills.style.gap = '6px';
            list.forEach((name) => {
                const pill = pills.createDiv();
                pill.style.display = 'inline-flex';
                pill.style.alignItems = 'center';
                pill.style.gap = '6px';
                pill.style.padding = '2px 8px';
                pill.style.border = '1px solid var(--background-modifier-border)';
                pill.style.borderRadius = '12px';
                pill.style.cursor = 'pointer';
                pill.style.background = 'var(--background-secondary)';
                const textSpan = pill.createSpan({ text: name });
                const delBtn = pill.createSpan({ text: '✕' });
                delBtn.style.marginLeft = '2px';
                delBtn.style.opacity = '0.7';
                delBtn.style.cursor = 'pointer';
                delBtn.title = '删除记录';
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const arr: string[] = (plugin?.data?.customGroupNames || []) as string[];
                    const idx = arr.indexOf(name);
                    if (idx >= 0) {
                        arr.splice(idx, 1);
                        if (plugin) {
                            plugin.data.customGroupNames = arr;
                            await plugin.saveData(plugin.data);
                        }
                        renderRecent();
                    }
                });
                pill.addEventListener('click', () => {
                    groupName = name;
                    if (nameTextEl) nameTextEl.value = name;
                });
            });
        };
        // 仅在自定义模式显示最近记录
        const updateRecentVisibility = () => {
            recentContainer.style.display = groupMode === 'custom' ? '' : 'none';
            if (groupMode === 'custom') renderRecent();
        };
        updateRecentVisibility();

		const buttonSetting = new Setting(contentEl);
        buttonSetting
            .addButton(button => button
                .setButtonText('清除')
                .setWarning()
                .onClick(() => {
                    // 触发清除：由父视图清除所有分组
                    this.onSubmit({ mode: 'folder', scope: 'filtered', action: 'reset' });
                    this.close();
                }))
			.addButton(button => button
				.setButtonText('取消')
				.onClick(() => this.close()))
            .addButton(button => button
                .setButtonText('确定')
                .setCta()
                .onClick(async () => {
                    if (groupMode === 'custom' && !groupName.trim()) {
                        new Notice('请输入分组名称');
                        return;
                    }
                    
                    // 若为自定义模式，记录到最近使用列表
                    if (groupMode === 'custom' && groupName.trim() && plugin) {
                        const arr: string[] = (plugin.data.customGroupNames || []) as string[];
                        if (!arr.includes(groupName.trim())) {
                            arr.unshift(groupName.trim());
                            // 限制长度，避免无限增长
                            if (arr.length > 20) arr.length = 20;
                            plugin.data.customGroupNames = arr;
                            await plugin.saveData(plugin.data);
                        }
                    }

                    this.onSubmit({
                        mode: groupMode,
                        name: groupMode === 'custom' ? groupName.trim() : undefined,
                        scope,
                        action: 'apply',
                    });
                    this.close();
                }));

		// 添加快捷键处理（仅在模态框内部有效）
		const handleKeyDown = (e: KeyboardEvent) => {
			// Delete 键清除
			if (e.key === 'Delete') {
				e.preventDefault();
				e.stopPropagation();
				const clearBtn = buttonSetting.controlEl.querySelector('button:first-child') as HTMLElement;
				clearBtn?.click();
			} else if (e.key === 'Escape') {
				// Escape 键取消
				e.preventDefault();
				e.stopPropagation();
				const cancelBtn = buttonSetting.controlEl.querySelector('button:nth-child(2)') as HTMLElement;
				cancelBtn?.click();
			} else if (e.key === 'Enter') {
				// Enter 键确定
				e.preventDefault();
				e.stopPropagation();
				const submitBtn = buttonSetting.controlEl.querySelector('button:nth-child(3)') as HTMLElement;
				submitBtn?.click();
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

