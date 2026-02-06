/**
 * 设置导入导出面板组件
 * 提供用户友好的设置导入导出界面，支持JSON配置文件导出和导入
 * 
 * @version 1.0.0
 * @author ImageMgr Plugin
 */

import { App, Setting, Notice } from 'obsidian';
import { SettingsIOManager } from '../utils/settings-io-manager';
import { ImportOptions, ExportOptions } from '../utils/settings-io-types';

/**
 * 设置导入导出面板类
 * 
 * 功能特性：
 * - 导出JSON配置文件
 * - 导入JSON配置文件
 * - 敏感信息控制
 * - 导入前备份功能
 * - 覆盖现有配置选项
 */
export class SettingsIOPanel {
  private containerEl: HTMLElement;
  private ioManager: SettingsIOManager;

  /**
   * 导出选项配置
   */
  private exportOptions: ExportOptions = {
    includeSensitiveData: false,
    compressData: false,
    format: 'json',
    includeMetadata: true,
    batchMode: false
  };

  /**
   * 导入选项配置
   */
  private importOptions: ImportOptions = {
    overwriteExisting: true,
    skipInvalidSettings: true,
    createBackup: true,
    validateIntegrity: true,
    batchMode: false
  };

  /**
   * 构造函数
   * 
   * @param app Obsidian应用实例
   * @param plugin 插件实例
   * @param containerEl 容器元素
   */
  constructor(app: App, plugin: any, containerEl: HTMLElement) {
    this.containerEl = containerEl;
    this.ioManager = new SettingsIOManager(app, plugin);
  }

  /**
   * 渲染设置导入导出面板
   * 
   * 创建用户界面，包含说明文本、操作按钮和设置选项
   */
  public render(): void {
    this.renderCompactLayout();
  }

  /**
   * 渲染紧凑式布局
   * 
   * 创建顶部说明文本和按钮区域，下方为设置选项
   */
  private renderCompactLayout(): void {
    // 创建顶部容器：说明文本和操作按钮
    this.renderTopSection();
    
    // 渲染设置选项区域
    this.renderSettingsSection();
  }

  /**
   * 渲染顶部区域 - 说明文本和操作按钮
   */
  private renderTopSection(): void {
    const topContainer = this.containerEl.createDiv();
    topContainer.style.display = 'flex';
    topContainer.style.alignItems = 'center';
    topContainer.style.justifyContent = 'space-between';
    topContainer.style.marginBottom = '16px';

    // 功能说明文本
    this.renderDescription(topContainer);
    
    // 操作按钮区域
    this.renderActionButtons(topContainer);
  }

  /**
   * 渲染功能说明文本
   */
  private renderDescription(container: HTMLElement): void {
    const descriptionEl = container.createEl('div', { cls: 'setting-item-description' });
    descriptionEl.innerHTML = `
      <p style="margin: 0;">
        <strong>导出JSON配置文件，备份插件配置。</strong>
      </p>
    `;
  }

  /**
   * 渲染操作按钮区域
   */
  private renderActionButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv();
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '12px';

    // 导出按钮
    this.createExportButton(buttonContainer);
    
    // 导入按钮
    this.createImportButton(buttonContainer);
  }

  /**
   * 创建导出按钮
   */
  private createExportButton(container: HTMLElement): void {
    const exportButton = container.createEl('button', { 
      text: '📤 导出配置',
      cls: 'mod-cta'
    });
    exportButton.style.padding = '8px 16px';
    exportButton.style.fontSize = '0.9em';
    exportButton.dataset.action = 'export';

    exportButton.addEventListener('click', async () => {
      await this.handleExport();
    });
  }

  /**
   * 创建导入按钮
   */
  private createImportButton(container: HTMLElement): void {
    const importButton = container.createEl('button', { 
      text: '📥 导入配置',
      cls: 'mod-cta'
    });
    importButton.style.padding = '8px 16px';
    importButton.style.fontSize = '0.9em';
    importButton.dataset.action = 'import';

    importButton.addEventListener('click', async () => {
      this.handleImportButtonClick();
    });
  }

  /**
   * 处理导入按钮点击事件
   */
  private handleImportButtonClick(): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    
    fileInput.click();
    
    fileInput.addEventListener('change', async (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        await this.handleImportDirect(files[0]);
      }
    });
  }

  /**
   * 渲染设置选项区域
   */
  private renderSettingsSection(): void {
    // 敏感信息控制设置
    this.renderSensitiveInfoSetting();
    
    // 导入选项设置
    this.renderImportOptions();
  }

  /**
   * 渲染敏感信息控制设置
   */
  private renderSensitiveInfoSetting(): void {
    new Setting(this.containerEl)
      .setName('包含敏感信息')
      .setDesc('控制导出/导入时是否处理API密钥等敏感信息')
      .addToggle(toggle => toggle
        .setValue(false)
        .onChange(value => {
          this.exportOptions.includeSensitiveData = value;
          this.importOptions.skipInvalidSettings = !value;
        }));
  }

  /**
   * 渲染导入选项设置
   * 
   * 包含覆盖配置和导入前备份两个选项
   */
  private renderImportOptions(): void {
    // 覆盖现有配置选项
    this.renderOverwriteSetting();
    
    // 导入前备份选项
    this.renderBackupSetting();
  }

  /**
   * 渲染覆盖现有配置选项
   */
  private renderOverwriteSetting(): void {
    new Setting(this.containerEl)
      .setName('覆盖现有配置')
      .setDesc('导入时是否覆盖当前所有配置项（推荐开启）')
      .addToggle(toggle => toggle
        .setValue(true)
        .onChange(value => {
          this.importOptions.overwriteExisting = value;
        }));
  }

  /**
   * 渲染导入前备份选项
   */
  private renderBackupSetting(): void {
    new Setting(this.containerEl)
      .setName('导入前备份')
      .setDesc('导入前自动备份当前配置到下载文件夹（推荐开启）')
      .addToggle(toggle => toggle
        .setValue(true)
        .onChange(value => {
          this.importOptions.createBackup = value;
        }));
  }







  /**
   * 处理导出操作
   * 
   * 异步执行导出操作，包含按钮状态管理和错误处理
   */
  private async handleExport(): Promise<void> {
    const exportButton = this.containerEl.querySelector('button[data-action="export"]') as HTMLButtonElement;
    if (!exportButton) return;
    
    const originalText = exportButton.textContent;
    
    try {
      // 更新按钮状态为加载中
      exportButton.textContent = '⏳ 导出中...';
      exportButton.disabled = true;

      // 执行导出操作
      await this.ioManager.exportSettings(this.exportOptions);
      
    } finally {
      // 恢复按钮状态
      exportButton.textContent = originalText;
      exportButton.disabled = false;
    }
  }

  /**
   * 直接处理导入操作
   * 
   * 处理用户选择的JSON文件导入
   * 
   * @param file 用户选择的文件对象
   */
  private async handleImportDirect(file: File): Promise<void> {
    // 验证文件格式
    if (!file || !file.name.endsWith('.json')) {
      new Notice('❌ 请选择有效的JSON设置文件');
      return;
    }

    const importButton = this.containerEl.querySelector('button[data-action="import"]') as HTMLButtonElement;
    if (!importButton) return;
    
    const originalText = importButton.textContent;
    
    try {
      // 更新按钮状态为加载中
      importButton.textContent = '⏳ 导入中...';
      importButton.disabled = true;

      // 执行导入操作
      await this.ioManager.importSettings(file, this.importOptions);
      
    } finally {
      // 恢复按钮状态
      importButton.textContent = originalText;
      importButton.disabled = false;
    }
  }




}