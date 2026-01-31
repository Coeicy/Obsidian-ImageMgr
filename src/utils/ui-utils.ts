/**
 * UI组件工具函数库
 * 提供通用的UI组件创建工厂函数
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
        contentEl.innerHTML = config.content;
        contentEl.style.padding = '20px 0';
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