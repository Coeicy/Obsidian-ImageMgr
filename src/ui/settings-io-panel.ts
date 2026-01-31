/**
 * 设置导入导出面板组件
 * 提供用户友好的设置导入导出界面
 */

import { App, Setting, Notice } from 'obsidian';
import { SettingsIOManager } from '../utils/settings-io-manager';
import { ImportOptions, ExportOptions } from '../utils/settings-io-types';

/**
 * 设置导入导出面板类
 */
export class SettingsIOPanel {
  private app: App;
  private plugin: any;
  private containerEl: HTMLElement;
  private ioManager: SettingsIOManager;

  // 默认选项
  private exportOptions: ExportOptions = {
    includeSensitiveData: false,
    compressData: false,
    format: 'json',
    includeMetadata: true,
    batchMode: false
  };

  private importOptions: ImportOptions = {
    overwriteExisting: true,
    skipInvalidSettings: true,
    createBackup: true,
    validateIntegrity: true,
    batchMode: false
  };

  constructor(app: App, plugin: any, containerEl: HTMLElement) {
    this.containerEl = containerEl;
    this.ioManager = new SettingsIOManager(app, plugin);
  }

  /**
   * 渲染设置导入导出面板
   */
  public render(): void {
    // 创建说明文本
    const descriptionEl = this.containerEl.createEl('div', { cls: 'setting-item-description' });
    descriptionEl.innerHTML = `
      <p style="margin-bottom: 12px;">
        备份、恢复或迁移插件设置。支持JSON格式的配置文件导入导出，包含完整的数据校验和错误处理机制。
      </p>
    `;

    // 直接渲染导出和导入功能，不使用选项卡
    this.renderExportSection();
    this.renderImportSection();
  }

  /**
   * 渲染导出部分
   */
  private renderExportSection(): void {
    // 导出部分标题
    const exportTitle = this.containerEl.createEl('h4', { text: '📤 导出设置' });
    exportTitle.style.marginTop = '20px';
    exportTitle.style.marginBottom = '12px';

    // 导出选项设置
    new Setting(this.containerEl)
      .setName('包含敏感信息')
      .setDesc('导出时是否包含API密钥等敏感信息（不推荐）')
      .addToggle(toggle => toggle
        .setValue(false) // 默认不包含敏感信息
        .onChange(value => {
          this.exportOptions.includeSensitiveData = value;
        }));



    // 导出按钮
    const exportButton = this.containerEl.createEl('button', { 
      text: '📤 导出设置文件',
      cls: 'mod-cta'
    });
    exportButton.style.marginTop = '12px';
    exportButton.style.padding = '8px 16px';
    exportButton.style.fontSize = '0.9em';
    exportButton.dataset.action = 'export';

    exportButton.addEventListener('click', async () => {
      await this.handleExport();
    });

    // 导出说明
    const exportInfo = this.containerEl.createDiv({ cls: 'setting-item-description' });
    exportInfo.innerHTML = `
      <p style="margin-top: 8px; font-size: 0.85em; color: var(--text-muted);">
        💡 导出的设置文件包含所有插件配置，可用于备份或迁移到其他设备。
      </p>
    `;

    // 添加分隔线
    const divider = this.containerEl.createEl('hr');
    divider.style.margin = '20px 0';
    divider.style.borderColor = 'var(--background-modifier-border)';
  }

  /**
   * 渲染导入部分
   */
  private renderImportSection(): void {
    // 导入部分标题
    const importTitle = this.containerEl.createEl('h4', { text: '📥 导入设置' });
    importTitle.style.marginTop = '0';
    importTitle.style.marginBottom = '12px';

    // 导入选项设置
    new Setting(this.containerEl)
      .setName('覆盖现有设置')
      .setDesc('导入时是否覆盖当前设置（推荐开启）')
      .addToggle(toggle => toggle
        .setValue(true)
        .onChange(value => {
          this.importOptions.overwriteExisting = value;
        }));

    new Setting(this.containerEl)
      .setName('创建备份')
      .setDesc('导入前自动创建当前设置的备份')
      .addToggle(toggle => toggle
        .setValue(true)
        .onChange(value => {
          this.importOptions.createBackup = value;
        }));



    // 导入文件选择区域
    const fileSection = this.containerEl.createDiv({ cls: 'settings-io-file-section' });
    fileSection.style.marginTop = '16px';
    fileSection.style.padding = '16px';
    fileSection.style.border = '1px solid var(--background-modifier-border)';
    fileSection.style.borderRadius = '8px';
    fileSection.style.textAlign = 'center';
    fileSection.style.background = 'var(--background-secondary)';

    const fileInput = fileSection.createEl('input', { 
      attr: { 
        type: 'file',
        accept: '.json',
        style: 'display: none;'
      }
    });

    const fileArea = fileSection.createDiv();
    fileArea.innerHTML = `
      <div style="font-size: 1.8em; margin-bottom: 8px;">📁</div>
      <p style="margin-bottom: 8px; font-weight: 600;">选择设置文件</p>
      <p style="margin-bottom: 12px; font-size: 0.9em; color: var(--text-muted);">
        点击选择JSON设置文件
      </p>
      <button class="mod-ghost" style="padding: 8px 16px;">选择文件</button>
    `;

    const selectButton = fileArea.querySelector('button');
    selectButton?.addEventListener('click', () => {
      fileInput.click();
    });

    // 文件选择事件
    fileInput.addEventListener('change', (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this.handleFileSelection(files, fileArea);
      }
    });

    // 导入按钮容器
    const importButtonContainer = this.containerEl.createDiv();
    importButtonContainer.style.marginTop = '12px';
    importButtonContainer.style.textAlign = 'center';

    // 导入按钮
    const importButton = importButtonContainer.createEl('button', { 
      text: '📥 导入设置',
      cls: 'mod-cta'
    });
    importButton.style.padding = '8px 16px';
    importButton.style.fontSize = '0.9em';
    importButton.disabled = true;
    importButton.dataset.action = 'import';

    importButton.addEventListener('click', async () => {
      await this.handleImport(fileInput);
    });

    // 导入说明
    const importInfo = this.containerEl.createDiv({ cls: 'setting-item-description' });
    importInfo.innerHTML = `
      <p style="margin-top: 8px; font-size: 0.85em; color: var(--text-muted);">
        💡 导入前会自动验证文件格式和完整性，确保设置数据安全可靠。
      </p>
    `;
  }



  /**
   * 处理文件选择
   */
  private handleFileSelection(files: FileList, dropArea: HTMLElement): void {
    const file = files[0]; // 只取第一个文件
    
    if (!file || !file.name.endsWith('.json')) {
      new Notice('❌ 请选择有效的JSON设置文件');
      return;
    }

    // 更新UI显示选中的文件
    dropArea.innerHTML = `
      <div style="font-size: 2em; margin-bottom: 8px;">✅</div>
      <p style="margin-bottom: 8px; font-weight: 600;">已选择文件</p>
      <p style="margin-bottom: 12px; font-size: 0.85em; color: var(--text-muted);">
        ${file.name}
      </p>
      <button class="mod-ghost" style="padding: 6px 12px; font-size: 0.85em;">重新选择</button>
    `;

    const reselectButton = dropArea.querySelector('button');
    reselectButton?.addEventListener('click', () => {
      const fileInput = dropArea.closest('.settings-io-file-section')?.querySelector('input[type="file"]') as HTMLInputElement;
      fileInput?.click();
    });

    // 启用导入按钮
    const importButton = this.containerEl.querySelector('button[data-action="import"]') as HTMLButtonElement;
    if (importButton) {
      importButton.disabled = false;
    }
  }

  /**
   * 处理导出操作
   */
  private async handleExport(): Promise<void> {
    const exportButton = this.containerEl.querySelector('button[data-action="export"]') as HTMLButtonElement;
    if (!exportButton) return;
    
    const originalText = exportButton.textContent;
    
    try {
      exportButton.textContent = '⏳ 导出中...';
      exportButton.disabled = true;

      await this.ioManager.exportSettings(this.exportOptions);
      
    } finally {
      exportButton.textContent = originalText;
      exportButton.disabled = false;
    }
  }

  /**
   * 处理导入操作
   */
  private async handleImport(fileInput: HTMLInputElement): Promise<void> {
    const files = fileInput.files;
    if (!files || files.length === 0) {
      new Notice('❌ 请先选择要导入的设置文件');
      return;
    }

    const importButton = this.containerEl.querySelector('button[data-action="import"]') as HTMLButtonElement;
    if (!importButton) return;
    
    const originalText = importButton.textContent;
    
    try {
      importButton.textContent = '⏳ 导入中...';
      importButton.disabled = true;

      await this.ioManager.importSettings(files[0], this.importOptions);
      
    } finally {
      importButton.textContent = originalText;
      importButton.disabled = true; // 导入后需要重新选择文件
      fileInput.value = ''; // 清空文件选择
      
      // 重置文件选择区域
      const fileArea = this.containerEl.querySelector('.settings-io-file-section div');
      if (fileArea) {
        fileArea.innerHTML = `
          <div style="font-size: 1.8em; margin-bottom: 8px;">📁</div>
          <p style="margin-bottom: 8px; font-weight: 600;">选择设置文件</p>
          <p style="margin-bottom: 12px; font-size: 0.9em; color: var(--text-muted);">
            点击选择JSON设置文件
          </p>
          <button class="mod-ghost" style="padding: 8px 16px;">选择文件</button>
        `;
        
        // 重新绑定选择文件按钮事件
        const selectButton = fileArea.querySelector('button');
        selectButton?.addEventListener('click', () => {
          fileInput.click();
        });
      }
    }
  }


}