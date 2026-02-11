/**
 * 设置导入导出相关类型定义
 */

import { ImageManagementSettings } from '../settings';

/**
 * 设置导入导出错误类型
 */
export enum SettingsIOErrorType {
  INVALID_FILE_FORMAT = 'INVALID_FILE_FORMAT',
  INVALID_JSON = 'INVALID_JSON',
  MISSING_REQUIRED_FIELDS = 'MISSING_REQUIRED_FIELDS',
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  VERSION_INCOMPATIBLE = 'VERSION_INCOMPATIBLE',
  DATA_CORRUPTED = 'DATA_CORRUPTED',
  FILE_SIZE_EXCEEDED = 'FILE_SIZE_EXCEEDED',
  MULTIPLE_FILES_ERROR = 'MULTIPLE_FILES_ERROR'
}

/**
 * 错误详情信息
 */
export interface ErrorDetail {
  field?: string;
  expectedType?: string;
  actualType?: string;
  value?: any;
  message?: string;
}

/**
 * 设置导入导出错误信息
 */
export interface SettingsIOError {
  type: SettingsIOErrorType;
  message: string;
  details?: ErrorDetail[];
  timestamp: number;
  fileName?: string;
}

/**
 * 设置文件元数据
 */
export interface SettingsFileMetadata {
  version: string;
  pluginName: string;
  exportDate: string;
  settingsCount: number;
  description?: string;
}

/**
 * 完整的设置导出数据结构
 */
export interface SettingsExportData {
  metadata: SettingsFileMetadata;
  settings: ImageManagementSettings;
  checksum: string;
}

/**
 * 批量导入导出结果
 */
export interface BatchIOResult {
  success: boolean;
  processedFiles: number;
  successfulFiles: number;
  failedFiles: number;
  errors: SettingsIOError[];
  summary: {
    totalSettings: number;
    importedSettings: number;
    skippedSettings: number;
  };
}

/**
 * 导入选项配置
 */
export interface ImportOptions {
  /** 是否覆盖现有设置 */
  overwriteExisting: boolean;
  /** 是否跳过无效设置项 */
  skipInvalidSettings: boolean;
  /** 是否创建备份 */
  createBackup: boolean;
  /** 是否验证数据完整性 */
  validateIntegrity: boolean;
  /** 批量导入模式 */
  batchMode: boolean;
}

/**
 * 导出选项配置
 */
export interface ExportOptions {
  /** 是否包含敏感信息（如API密钥） */
  includeSensitiveData: boolean;
  /** 是否压缩数据 */
  compressData: boolean;
  /** 导出文件格式 */
  format: 'json' | 'json-compressed';
  /** 是否包含元数据 */
  includeMetadata: boolean;
  /** 批量导出模式 */
  batchMode: boolean;
}

/**
 * 设置验证结果
 */
export interface ValidationResult {
  isValid: boolean;
  errors: SettingsIOError[];
  warnings: string[];
  validatedSettings?: Partial<ImageManagementSettings>;
}

/**
 * 文件处理结果
 */
export interface FileProcessResult {
  fileName: string;
  success: boolean;
  error?: SettingsIOError;
  settings?: Partial<ImageManagementSettings>;
}

/**
 * 进度回调函数类型
 */
export type ProgressCallback = (progress: number, message: string) => void;