/**
 * UI组件工具函数库
 * 
 * 核心功能：
 * - 提供通用的UI组件创建工厂函数
 * - 统一样式和行为的一致性
 * - 简化UI组件的创建过程
 * - 安全的HTML处理（防止XSS攻击）
 * 
 * 主要功能：
 * 1. **设置项创建**（createStyledSetting）：
 *    - 文本输入框
 *    - 开关切换
 *    - 下拉选择
 *    - 滑块
 *    - 按钮
 *    - 统一样式和事件处理
 * 
 * 2. **模态框创建**（createStyledModal）：
 *    - 自定义标题和内容
 *    - 多种按钮类型
 *    - 自定义尺寸
 *    - HTML转义防护（XSS防护）
 * 
 * 3. **标题创建**（createStyledTitle）：
 *    - 多级标题（H1/H2/H3）
 *    - 统一字体样式
 *    - 自动边距和间距
 * 
 * 4. **分隔线创建**（createSeparator）：
 *    - 统一样式
 *    - 适当间距
 * 
 * 安全机制：
 * - HTML转义（escapeHtml）
 * - 防止XSS攻击
 * - 默认转义用户输入
 * - 可选的innerHTML（仅内部使用）
 * 
 * 使用示例：
 * ```typescript
 * // 创建文本输入框
 * const setting = createStyledSetting(containerEl, {
 *     name: 'API密钥',
 *     desc: '输入你的API密钥',
 *     type: 'text',
 *     defaultValue: '',
 *     placeholder: 'sk-xxxxxxxx',
 *     onChange: async (value) => {
 *         console.log('新值:', value);
 *     }
 * });
 * 
 * // 创建开关
 * const toggle = createStyledSetting(containerEl, {
 *     name: '启用功能',
 *     desc: '是否启用此功能',
 *     type: 'toggle',
 *     defaultValue: false,
 *     onChange: async (value) => {
 *         console.log('状态:', value);
 *     }
 * });
 * 
 * // 创建下拉选择
 * const dropdown = createStyledSetting(containerEl, {
 *     name: '排序方式',
 *     desc: '选择图片排序方式',
 *     type: 'dropdown',
 *     defaultValue: 'name',
 *     options: {
 *         'name': '按名称',
 *         'date': '按日期',
 *         'size': '按大小'
 *     },
 *     onChange: async (value) => {
 *         console.log('选择:', value);
 *     }
 * });
 * 
 * // 创建滑块
 * const slider = createStyledSetting(containerEl, {
 *     name: '缩放比例',
 *     desc: '设置图片缩放比例',
 *     type: 'slider',
 *     min: 10,
 *     max: 200,
 *     step: 10,
 *     defaultValue: 100,
 *     onChange: async (value) => {
 *         console.log('缩放:', value);
 *     }
 * });
 * 
 * // 创建按钮
 * const button = createStyledSetting(containerEl, {
 *     name: '扫描图片',
 *     desc: '点击开始扫描',
 *     type: 'button',
 *     onClick: async () => {
 *         console.log('开始扫描...');
 *         await scanImages();
 *     }
 * });
 * 
 * // 创建模态框
 * const modal = createStyledModal(app, {
 *     title: '确认删除',
 *     content: '确定要删除这个图片吗？',
 *     width: '400px',
 *     height: 'auto',
 *     buttons: [
 *         {
 *             text: '取消',
 *             type: 'secondary',
 *             onClick: () => {
 *                 console.log('取消删除');
 *             }
 *         },
 *         {
 *             text: '删除',
 *             type: 'danger',
 *             onClick: async () => {
 *                 console.log('确认删除');
 *                 await deleteImage();
 *             }
 *         }
 *     ]
 * });
 * modal.open();
 * 
 * // 创建标题
 * const title = createStyledTitle(containerEl, '图片设置', 2);
 * 
 * // 创建副标题
 * const subtitle = createStyledTitle(containerEl, '显示选项', 3);
 * 
 * // 创建分隔线
 * const separator = createSeparator(containerEl);
 * 
 * // HTML转义示例
 * const unsafe = '<script>alert("XSS")</script>';
 * const safe = escapeHtml(unsafe); 
 * console.log(safe); // &lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;
 * ```
 * 
 * 样式特性：
 * - 统一字体大小和颜色
 * - 适当的间距和边距
 * - 响应式布局
 * - 与Obsidian主题一致
 * 
 * 按钮类型：
 * - primary: 主要操作（高亮显示）
 * - secondary: 次要操作（默认样式）
 * - danger: 危险操作（红色警告）
 * 
 * 标题级别：
 * - H1: 2em，24px上边距，16px下边距
 * - H2: 1.6em，32px上边距，20px下边距
 * - H3: 1.3em，16px上边距，16px下边距，带底部边框
 * 
 * 安全建议：
 * 1. 始终使用escapeHtml处理用户输入
 * 2. 仅对可信内容使用innerHTML
 * 3. 验证所有外部数据
 * 4. 使用textContent而非innerHTML
 * 
 * 扩展建议：
 * - 可以添加更多组件类型（如颜色选择器）
 * - 支持自定义样式覆盖
 * - 添加主题感知功能
 * - 支持多语言
 */

import { App, Modal, Setting } from 'obsidian';

/**
 * 创建通用的设置项
 */
export interface SettingConfig {
    name: string;
    desc: string;
    type: 'text' | 'toggle' | 'dropdown' | 'slider' | 'button';
    defaultValue?: any;
    placeholder?: string;
    options?: Record<string, string>;
    min?: number;
    max?: number;
    step?: number;
    onChange?: (value: any) => void | Promise<void>;
    onClick?: () => void | Promise<void>;
}

/**
 * 创建样式化的设置项
 */
export function createStyledSetting(containerEl: HTMLElement, config: SettingConfig): Setting {
    const setting = new Setting(containerEl)
        .setName(config.name)
        .setDesc(config.desc);
    
    switch (config.type) {
        case 'text':
            setting.addText(text => {
                text.setValue(config.defaultValue || '')
                    .setPlaceholder(config.placeholder || '')
                    .onChange(async (value) => {
                        if (config.onChange) await config.onChange(value);
                    });
                
                // 统一的文本框样式
                if (text.inputEl) {
                    text.inputEl.style.width = '200px';
                    text.inputEl.style.maxWidth = '100%';
                }
            });
            break;
            
        case 'toggle':
            setting.addToggle(toggle => {
                toggle.setValue(config.defaultValue || false)
                    .onChange(async (value) => {
                        if (config.onChange) await config.onChange(value);
                    });
            });
            break;
            
        case 'dropdown':
            setting.addDropdown(dropdown => {
                Object.entries(config.options || {}).forEach(([key, value]) => {
                    dropdown.addOption(key, value);
                });
                dropdown.setValue(config.defaultValue || '')
                    .onChange(async (value) => {
                        if (config.onChange) await config.onChange(value);
                    });
            });
            break;
            
        case 'slider':
            setting.addSlider(slider => {
                slider.setLimits(config.min || 0, config.max || 100, config.step || 1)
                    .setValue(config.defaultValue || 0)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        if (config.onChange) await config.onChange(value);
                    });
            });
            break;
            
        case 'button':
            setting.addButton(button => {
                button.setButtonText(config.name)
                    .onClick(async () => {
                        if (config.onClick) await config.onClick();
                    });
            });
            break;
    }
    
    return setting;
}

/**
 * 转义HTML特殊字符，防止XSS攻击
 * @param unsafe - 不安全的字符串
 * @returns 转义后的安全字符串
 */
function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * 创建模态框的通用配置
 */
export interface ModalConfig {
    title: string;
    content?: string;
    buttons?: Array<{
        text: string;
        type: 'primary' | 'secondary' | 'danger';
        onClick: () => void | Promise<void>;
    }>;
    width?: string;
    height?: string;
    /**
     * 是否转义HTML内容（默认true）
     * 当设置为false时，使用innerHTML（仅对可信内容使用）
     */
    escapeContent?: boolean;
}

/**
 * 创建通用的模态框
 */
export function createStyledModal(app: App, config: ModalConfig): Modal {
    const modal = new Modal(app);
    
    // 设置标题
    modal.titleEl.textContent = config.title;
    modal.titleEl.style.fontSize = '1.4em';
    modal.titleEl.style.fontWeight = 'bold';
    
    // 设置内容
    if (config.content) {
        const contentEl = modal.contentEl.createDiv();
        contentEl.style.padding = '20px 0';
        
        // 安全处理：默认转义HTML，防止XSS攻击
        if (config.escapeContent !== false) {
            contentEl.innerHTML = escapeHtml(config.content);
        } else {
            // 仅对可信内容使用innerHTML（内部使用）
            contentEl.innerHTML = config.content;
        }
    }
    
    // 设置按钮
    if (config.buttons && config.buttons.length > 0) {
        const buttonContainer = modal.contentEl.createDiv();
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginTop = '20px';
        
        config.buttons.forEach(buttonConfig => {
            const button = buttonContainer.createEl('button', { text: buttonConfig.text });
            button.style.padding = '8px 16px';
            button.style.borderRadius = '4px';
            button.style.border = 'none';
            button.style.cursor = 'pointer';
            
            // 设置按钮样式
            switch (buttonConfig.type) {
                case 'primary':
                    button.style.backgroundColor = 'var(--interactive-accent)';
                    button.style.color = 'var(--text-on-accent)';
                    break;
                case 'danger':
                    button.style.backgroundColor = 'var(--text-error)';
                    button.style.color = 'white';
                    break;
                default:
                    button.style.backgroundColor = 'var(--interactive-normal)';
                    button.style.color = 'var(--text-normal)';
            }
            
            button.addEventListener('click', async () => {
                await buttonConfig.onClick();
                modal.close();
            });
        });
    }
    
    // 设置尺寸
    if (config.width) {
        modal.modalEl.style.width = config.width;
    }
    if (config.height) {
        modal.modalEl.style.height = config.height;
    }
    
    return modal;
}

/**
 * 创建样式化的标题
 */
export function createStyledTitle(containerEl: HTMLElement, text: string, level: 1 | 2 | 3 = 2): HTMLElement {
    const title = containerEl.createEl(`h${level}`, { text });
    
    // 统一的标题样式
    title.style.marginTop = level === 2 ? '24px' : level === 3 ? '32px' : '16px';
    title.style.marginBottom = level === 2 ? '20px' : level === 3 ? '16px' : '12px';
    title.style.fontSize = level === 2 ? '1.6em' : level === 3 ? '1.3em' : '2em';
    title.style.fontWeight = 'bold';
    
    if (level === 3) {
        title.style.borderBottom = '2px solid var(--interactive-accent)';
        title.style.paddingBottom = '8px';
    }
    
    return title;
}

/**
 * 创建分隔线
 */
export function createSeparator(containerEl: HTMLElement): HTMLElement {
    const separator = containerEl.createEl('hr');
    separator.style.margin = '20px 0';
    separator.style.border = 'none';
    separator.style.borderTop = '1px solid var(--background-modifier-border)';
    return separator;
}