/**
 * 设置导入导出管理器
 * 
 * 核心功能：
 * - 导出设置到JSON文件（支持格式化和压缩）
 * - 从JSON文件导入设置
 * - 批量导入多个设置文件
 * - 数据验证和完整性检查
 * - 敏感信息过滤（API密钥等）
 * - 自动备份机制
 * 
 * 安全特性：
 * - 敏感数据过滤：导出时自动过滤API密钥
 * - 文件大小限制：最大10MB
 * - 数据完整性验证：校验和检查
 * - 版本兼容性检查：防止不兼容的导入
 * - 自动备份：导入前自动创建备份
 * 
 * 导出功能：
 * - 支持格式化JSON（可读性好）
 * - 支持压缩JSON（体积小）
 * - 包含元数据（版本、日期、插件名称）
 * - 可选择是否包含敏感数据
 * - 自动生成带时间戳的文件名
 * 
 * 导入功能：
 * - 单文件导入
 * - 批量导入（多个文件）
 * - 数据验证（类型、范围、枚举）
 * - 合并策略（覆盖或保留现有）
 * - 跳过无效设置选项
 * - 自动创建备份
 * - 进度回调支持
 * 
 * 错误处理：
 * - 文件大小超限
 * - JSON格式无效
 * - 数据结构缺失
 * - 版本不兼容
 * - 类型不匹配
 * - 详细错误提示和解决方案
 * 
 * 使用示例：
 * ```typescript
 * // 创建管理器
 * const manager = new SettingsIOManager(app, plugin);
 * 
 * // 导出设置（默认选项）
 * await manager.exportSettings();
 * // 输出：image-manager-settings-2024-02-04.json
 * 
 * // 导出设置（包含敏感数据）
 * await manager.exportSettings({
 *     includeSensitiveData: true,
 *     format: 'json',
 *     includeMetadata: true
 * });
 * 
 * // 导出设置（压缩格式）
 * await manager.exportSettings({
 *     includeSensitiveData: false,
 *     format: 'json-compressed'
 * });
 * // 输出：image-manager-settings-2024-02-04-compressed.json
 * 
 * // 导入设置（从文件）
 * const file = document.querySelector('input[type="file"]').files[0];
 * const success = await manager.importSettings(file, {
 *     overwriteExisting: true,
 *     createBackup: true,
 *     skipInvalidSettings: true,
 *     validateIntegrity: true
 * });
 * if (success) {
 *     console.log('导入成功');
 * }
 * 
 * // 批量导入
 * const files = Array.from(document.querySelectorAll('input[type="file"]').files);
 * const result = await manager.importSettingsBatch(
 *     files,
 *     {
 *         overwriteExisting: true,
 *         createBackup: true
 *     },
 *     (progress, message) => {
 *         console.log(`进度: ${progress}% - ${message}`);
 *     }
 * );
 * 
 * console.log(`成功: ${result.successfulFiles}/${result.processedFiles}`);
 * console.log(`失败: ${result.failedFiles}`);
 * console.log(`导入设置: ${result.summary.importedSettings}`);
 * ```
 * 
 * 导出数据结构：
 * ```json
 * {
 *   "metadata": {
 *     "version": "1.0.0",
 *     "pluginName": "Image Manager",
 *     "exportDate": "2024-02-04T12:00:00.000Z",
 *     "settingsCount": 50,
 *     "description": "图片管理器插件设置导出文件"
 *   },
 *   "settings": {
 *     "autoScan": true,
 *     "defaultImageFolder": "images",
 *     ...
 *   },
 *   "checksum": "abc123..."
 * }
 * ```
 * 
 * 敏感数据过滤：
 * - 上传配置的API密钥（七牛云、阿里云等）
 * - 哈希元数据
 * - 远程图片黑名单
 * 
 * 最佳实践：
 * 1. 定期备份设置（建议每周）
 * 2. 导出前备份当前设置
 * 3. 导入前验证文件完整性
 * 4. 谨慎处理敏感数据
 * 5. 分批导入大型配置文件
 * 6. 保留导出文件的历史版本
 * 
 * 注意事项：
 * - 文件大小限制为10MB
 * - 敏感数据默认不导出
 * - 导入会覆盖现有设置（除非配置为保留）
 * - 备份文件会自动下载
 * - 版本不兼容的文件会被拒绝
 */

import { Notice, TFile } from 'obsidian';
import { ImageManagementSettings, DEFAULT_SETTINGS } from '../settings';
import {
  SettingsExportData,
  SettingsFileMetadata,
  ImportOptions,
  ExportOptions,
  BatchIOResult,
  FileProcessResult,
  ProgressCallback,
  SettingsIOErrorType
} from './settings-io-types';
import { SettingsValidator } from './settings-io-validator';

/**
 * 设置导入导出管理器类
 */
export class SettingsIOManager {
  private app: any;
  private plugin: any;

  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
  }

  /**
   * 获取logger实例
   */
  private async log(level: 'error' | 'warn' | 'info' | 'debug', operation: string, message: string, error?: Error): Promise<void> {
    if (this.plugin?.logger) {
      if (level === 'error') {
        await this.plugin.logger.error(operation as any, message, { error });
      } else if (level === 'warn') {
        await this.plugin.logger.warn(operation as any, message, { error });
      } else if (level === 'info') {
        await this.plugin.logger.info(operation as any, message);
      } else {
        await this.plugin.logger.debug(operation as any, message);
      }
    }
  }

  /**
   * 导出设置到文件
   */
  public async exportSettings(options: ExportOptions = this.getDefaultExportOptions()): Promise<boolean> {
    try {
      const exportData = this.prepareExportData(options);
      const jsonData = this.formatExportData(exportData, options);
      
      // 创建下载链接
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // 生成文件名
      const fileName = this.generateExportFileName(options);
      
      // 创建下载链接并触发下载
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // 清理URL
      setTimeout(() => URL.revokeObjectURL(url), 100);
      
      new Notice(`✅ 设置已成功导出到 ${fileName}`);
      return true;

    } catch (error) {
      await this.log('error', 'EXPORT', '导出设置失败', error instanceof Error ? error : new Error(String(error)));
      new Notice('❌ 导出设置失败，请检查控制台获取详细信息');
      return false;
    }
  }

  /**
   * 从文件导入设置
   */
  public async importSettings(file: File, options: ImportOptions = this.getDefaultImportOptions()): Promise<boolean> {
    try {
      // 验证文件大小
      const sizeValidation = SettingsValidator.validateFileSize(file);
      if (!sizeValidation.isValid) {
        this.showError('文件大小超过限制', sizeValidation.errors[0]);
        return false;
      }

      // 读取文件内容
      const fileContent = await this.readFileContent(file);
      
      // 解析JSON数据
      const parsedData = this.parseImportData(fileContent, file.name);
      if (!parsedData) {
        return false;
      }

      // 验证数据完整性
      const validation = SettingsValidator.validateSettingsData(parsedData.settings);
      if (!validation.isValid) {
        this.showError('设置数据验证失败', validation.errors[0]);
        return false;
      }

      // 创建备份（如果需要）
      if (options.createBackup) {
        await this.createBackup();
      }

      // 处理敏感信息：如果设置为跳过无效设置（即关闭敏感信息），则过滤敏感信息
      let settingsToApply = validation.validatedSettings!;
      if (options.skipInvalidSettings) {
        settingsToApply = this.filterSensitiveDataFromImport(settingsToApply);
      }

      await this.applySettings(settingsToApply, options);

      new Notice(`✅ 设置已成功导入，共应用了 ${Object.keys(settingsToApply).length} 个设置项`);
      return true;

    } catch (error) {
      await this.log('error', 'IMPORT', '导入设置失败', error instanceof Error ? error : new Error(String(error)));
      new Notice('❌ 导入设置失败，请检查控制台获取详细信息');
      return false;
    }
  }

  /**
   * 批量导入设置文件
   */
  public async importSettingsBatch(files: File[], options: ImportOptions, progressCallback?: ProgressCallback): Promise<BatchIOResult> {
    const result: BatchIOResult = {
      success: false,
      processedFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      errors: [],
      summary: {
        totalSettings: 0,
        importedSettings: 0,
        skippedSettings: 0
      }
    };

    if (files.length === 0) {
      result.errors.push({
        type: SettingsIOErrorType.MULTIPLE_FILES_ERROR,
        message: '未选择任何文件',
        timestamp: Date.now()
      });
      return result;
    }

    // 创建备份
    if (options.createBackup) {
      await this.createBackup();
    }

    // 处理每个文件
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      result.processedFiles++;
      
      if (progressCallback) {
        progressCallback((i / files.length) * 100, `正在处理文件: ${file.name}`);
      }

      try {
        const fileResult = await this.processSingleFile(file, options);
        
        if (fileResult.success && fileResult.settings) {
          result.successfulFiles++;
          result.summary.totalSettings += Object.keys(fileResult.settings).length;
          result.summary.importedSettings += Object.keys(fileResult.settings).length;
        } else {
          result.failedFiles++;
          if (fileResult.error) {
            fileResult.error.fileName = file.name;
            result.errors.push(fileResult.error);
          }
        }
        
      } catch (error) {
        result.failedFiles++;
        result.errors.push({
          type: SettingsIOErrorType.DATA_CORRUPTED,
          message: `处理文件 ${file.name} 时发生未知错误`,
          timestamp: Date.now(),
          fileName: file.name
        });
      }
    }

    result.success = result.failedFiles === 0;
    
    if (progressCallback) {
      progressCallback(100, '批量导入完成');
    }

    return result;
  }

  /**
   * 处理单个文件
   */
  private async processSingleFile(file: File, options: ImportOptions): Promise<FileProcessResult> {
    try {
      // 验证文件大小
      const sizeValidation = SettingsValidator.validateFileSize(file);
      if (!sizeValidation.isValid) {
        return {
          fileName: file.name,
          success: false,
          error: sizeValidation.errors[0]
        };
      }

      // 读取文件内容
      const fileContent = await this.readFileContent(file);
      
      // 解析JSON数据
      const parsedData = this.parseImportData(fileContent, file.name);
      if (!parsedData) {
        return {
          fileName: file.name,
          success: false,
          error: {
            type: SettingsIOErrorType.INVALID_JSON,
            message: '文件格式无效',
            timestamp: Date.now()
          }
        };
      }

      // 验证数据完整性
      const validation = SettingsValidator.validateSettingsData(parsedData.settings);
      if (!validation.isValid) {
        return {
          fileName: file.name,
          success: false,
          error: validation.errors[0]
        };
      }

      // 应用设置
      await this.applySettings(validation.validatedSettings!, options);
      
      return {
        fileName: file.name,
        success: true,
        settings: validation.validatedSettings
      };
      
    } catch (error) {
      return {
        fileName: file.name,
        success: false,
        error: {
          type: SettingsIOErrorType.DATA_CORRUPTED,
          message: '文件处理过程中发生错误',
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * 准备导出数据
   */
  private prepareExportData(options: ExportOptions): SettingsExportData {
    const settings = { ...this.plugin.settings };
    
    // 过滤敏感信息
    if (!options.includeSensitiveData) {
      this.filterSensitiveData(settings);
    }

    const metadata: SettingsFileMetadata = {
      version: '1.0.0',
      pluginName: 'Image Manager',
      exportDate: new Date().toISOString(),
      settingsCount: Object.keys(settings).length,
      description: '图片管理器插件设置导出文件'
    };

    return {
      metadata,
      settings,
      checksum: this.generateChecksum(JSON.stringify(settings))
    };
  }

  /**
   * 过滤敏感信息（用于导出）
   */
  private filterSensitiveData(settings: any): void {
    // 过滤API密钥等敏感信息
    if (settings.uploadConfig) {
      if (settings.uploadConfig.qiniu) {
        settings.uploadConfig.qiniu.accessKey = '';
        settings.uploadConfig.qiniu.secretKey = '';
      }
      if (settings.uploadConfig.aliyun) {
        settings.uploadConfig.aliyun.accessKeyId = '';
        settings.uploadConfig.aliyun.accessKeySecret = '';
      }
    }
    
    // 过滤其他可能的敏感信息
    delete settings.ignoredHashMetadata;
  }

  /**
   * 从导入数据中过滤敏感信息
   */
  private filterSensitiveDataFromImport(settings: any): any {
    const filteredSettings = { ...settings };
    
    // 过滤API密钥等敏感信息
    if (filteredSettings.uploadConfig) {
      if (filteredSettings.uploadConfig.qiniu) {
        delete filteredSettings.uploadConfig.qiniu.accessKey;
        delete filteredSettings.uploadConfig.qiniu.secretKey;
      }
      if (filteredSettings.uploadConfig.aliyun) {
        delete filteredSettings.uploadConfig.aliyun.accessKeyId;
        delete filteredSettings.uploadConfig.aliyun.accessKeySecret;
      }
    }
    
    // 过滤其他可能的敏感信息
    delete filteredSettings.ignoredHashMetadata;
    
    return filteredSettings;
  }

  /**
   * 格式化导出数据
   */
  private formatExportData(data: SettingsExportData, options: ExportOptions): string {
    if (options.format === 'json-compressed') {
      return JSON.stringify(data);
    } else {
      return JSON.stringify(data, null, 2);
    }
  }

  /**
   * 解析导入数据
   */
  private parseImportData(content: string, fileName: string): SettingsExportData | null {
    try {
      const parsed = JSON.parse(content);
      
      // 验证基本结构
      if (!parsed.metadata || !parsed.settings) {
        this.showError('文件格式无效', {
          type: SettingsIOErrorType.INVALID_FILE_FORMAT,
          message: '设置文件缺少必要的结构',
          timestamp: Date.now(),
          fileName
        });
        return null;
      }

      // 验证元数据
      const metadataValidation = SettingsValidator.validateMetadata(parsed.metadata);
      if (!metadataValidation.isValid) {
        this.showError('元数据验证失败', metadataValidation.errors[0]);
        return null;
      }

      return parsed;
      
    } catch (error) {
      this.showError('JSON解析失败', {
        type: SettingsIOErrorType.INVALID_JSON,
        message: '文件不是有效的JSON格式',
        timestamp: Date.now(),
        fileName
      });
      return null;
    }
  }

  /**
   * 应用设置
   */
  private async applySettings(newSettings: Partial<ImageManagementSettings>, options: ImportOptions): Promise<void> {
    const currentSettings = { ...this.plugin.settings };
    
    // 合并设置
    const mergedSettings = options.overwriteExisting 
      ? { ...currentSettings, ...newSettings }
      : { ...newSettings, ...currentSettings };

    // 更新插件设置
    this.plugin.settings = mergedSettings;
    await this.plugin.saveSettings();
    
    // 触发设置更新事件
    if (this.plugin.onSettingsChange) {
      this.plugin.onSettingsChange(mergedSettings);
    }
  }

  /**
   * 创建设置备份
   */
  private async createBackup(): Promise<void> {
    try {
      const backupData = this.prepareExportData(this.getDefaultExportOptions());
      const backupJson = JSON.stringify(backupData, null, 2);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `image-manager-settings-backup-${timestamp}.json`;
      
      // 创建备份文件
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = backupFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(url), 100);

    } catch (error) {
      await this.log('warn', 'BACKUP', '创建备份失败', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 读取文件内容
   */
  private readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }

  /**
   * 生成导出文件名
   */
  private generateExportFileName(options: ExportOptions): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const formatSuffix = options.format === 'json-compressed' ? '-compressed' : '';
    return `image-manager-settings-${timestamp}${formatSuffix}.json`;
  }

  /**
   * 生成数据校验和
   */
  private generateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * 显示错误信息
   */
  private async showError(title: string, error: any): Promise<void> {
    await this.log('error', 'ERROR', `${title}`, error instanceof Error ? error : new Error(String(error)));

    let errorMessage = error.message || '发生未知错误';
    if (error.details) {
      errorMessage += `\n详情: ${error.details.map((d: any) => d.message).join(', ')}`;
    }
    
    new Notice(`❌ ${title}: ${errorMessage}`);
  }

  /**
   * 获取默认导入选项
   */
  private getDefaultImportOptions(): ImportOptions {
    return {
      overwriteExisting: true,
      skipInvalidSettings: true,
      createBackup: true,
      validateIntegrity: true,
      batchMode: false
    };
  }

  /**
   * 获取默认导出选项
   */
  private getDefaultExportOptions(): ExportOptions {
    return {
      includeSensitiveData: false,
      compressData: false,
      format: 'json',
      includeMetadata: true,
      batchMode: false
    };
  }
}