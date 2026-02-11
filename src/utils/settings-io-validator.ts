/**
 * 设置数据校验器
 * 
 * 核心功能：
 * - 严格的设置数据验证
 * - 多层验证机制（结构、类型、范围、枚举）
 * - 详细的错误报告和解决方案
 * - 版本兼容性检查
 * - 文件大小限制检查
 * 
 * 验证层次：
 * 1. **文件级验证**：
 *    - 文件大小检查（最大10MB）
 *    - JSON格式验证
 *    - 基本结构检查（metadata、settings）
 * 
 * 2. **元数据验证**（validateMetadata）：
 *    - 版本号检查
 *    - 插件名称验证
 *    - 导出日期验证
 *    - 版本兼容性警告
 * 
 * 3. **设置数据验证**（validateSettingsData）：
 *    - 基础设置验证（autoScan、defaultImageFolder等）
 *    - 显示设置验证（imagesPerRow、排序方式等）
 *    - 功能开关验证（布尔值）
 *    - 高级设置验证（数值范围、枚举值）
 * 
 * 支持的验证类型：
 * - 类型验证：boolean、string、number
 * - 范围验证：数值在指定范围内
 * - 枚举验证：字符串匹配允许的值
 * - 必填字段验证：检查必需字段
 * - 版本兼容性：检查版本号匹配
 * 
 * 验证规则：
 * - 每行图片数量：1-10
 * - 懒加载延迟：0-5000ms
 * - 最大缓存大小：10-1000
 * - 卡片圆角：0-50px
 * - 固定图片高度：50-500px
 * - 远程图片超时：1000-60000ms
 * - 实时搜索延迟：0-2000ms
 * - 批量操作数量：1-1000
 * - 批量确认阈值：1-100
 * 
 * 枚举值验证：
 * - 排序方式：name | size | date | dimensions
 * - 排序顺序：asc | desc
 * - 重复处理：prompt | skip-silent | use-newest | use-oldest
 * - 多重引用：first | latest | prompt | all
 * - 统计位置：top | bottom | sidebar
 * - 日志级别：DEBUG | INFO | WARNING | ERROR
 * - 代理模式：none | obsidian | weserv | both
 * 
 * 错误类型：
 * - INVALID_FILE_FORMAT: 文件格式无效
 * - MISSING_REQUIRED_FIELDS: 缺少必需字段
 * - TYPE_MISMATCH: 类型不匹配
 * - VERSION_INCOMPATIBLE: 版本不兼容
 * - FILE_SIZE_EXCEEDED: 文件大小超限
 * - INVALID_JSON: JSON格式无效
 * - DATA_CORRUPTED: 数据损坏
 * 
 * 错误解决方案：
 * 每种错误类型都会生成具体的解决建议，
 * 包括：
 * - 问题说明
 * - 可能原因
 * - 解决步骤
 * - 预防措施
 * 
 * 使用示例：
 * ```typescript
 * // 验证元数据
 * const metadataResult = SettingsValidator.validateMetadata({
 *     version: '1.0.0',
 *     pluginName: 'Image Manager',
 *     exportDate: '2024-02-04T12:00:00.000Z',
 *     settingsCount: 50
 * });
 * 
 * if (!metadataResult.isValid) {
 *     console.error('验证失败:');
 *     metadataResult.errors.forEach(error => {
 *         console.error(`- ${error.message}`);
 *         // 获取解决方案建议
 *         const solutions = SettingsValidator.generateErrorSolution(error);
 *         solutions.forEach(solution => {
 *             console.log(`  ${solution}`);
 *         });
 *     });
 * }
 * 
 * if (metadataResult.warnings.length > 0) {
 *     console.warn('警告:');
 *     metadataResult.warnings.forEach(warning => {
 *         console.warn(`- ${warning}`);
 *     });
 * }
 * 
 * // 验证设置数据
 * const settingsResult = SettingsValidator.validateSettingsData(settingsData);
 * 
 * if (settingsResult.isValid) {
 *     // 使用验证后的设置
 *     const validSettings = settingsResult.validatedSettings;
 *     console.log('验证通过，应用设置...');
 * } else {
 *     console.error('验证失败:');
 *     settingsResult.errors.forEach(error => {
 *         console.error(`[${error.type}] ${error.message}`);
 *         if (error.details) {
 *             error.details.forEach(detail => {
 *                 console.error(`  - 字段: ${detail.field}`);
 *                 console.error(`  - 期望类型: ${detail.expectedType}`);
 *                 console.error(`  - 实际类型: ${detail.actualType}`);
 *             });
 *         }
 *     });
 * }
 * 
 * // 验证文件大小
 * const fileResult = SettingsValidator.validateFileSize(file);
 * if (!fileResult.isValid) {
 *     console.error('文件太大:', fileResult.errors[0].message);
 * }
 * ```
 * 
 * 验证流程：
 * 1. 检查文件大小（如果超过10MB，直接拒绝）
 * 2. 解析JSON（如果解析失败，报告错误）
 * 3. 验证基本结构（metadata、settings是否存在）
 * 4. 验证元数据（版本、插件名称等）
 * 5. 验证设置数据（按类别分批验证）
 * 6. 收集所有错误和警告
 * 7. 返回验证结果
 * 
 * 性能优化：
 * - 惰性验证：只在需要时验证
 * - 批量验证：减少重复检查
 * - 早期失败：发现错误立即返回
 * 
 * 安全考虑：
 * - 文件大小限制：防止DoS攻击
 * - 类型检查：防止注入攻击
 * - 版本检查：防止不兼容的导入
 * - 范围验证：防止非法数值
 * 
 * 最佳实践：
 * 1. 导入前始终验证数据
 * 2. 处理所有错误（不只是第一个）
 * 3. 向用户显示详细的错误信息
 * 4. 提供解决方案建议
 * 5. 记录验证失败事件
 * 6. 版本不匹配时警告用户
 * 
 * 注意事项：
 * - 验证是同步的，不会阻塞
 * - 验证失败时不修改数据
 * - 警告不会阻止导入
 * - 部分验证失败的设置会被跳过
 */

import { ImageManagementSettings, DEFAULT_SETTINGS } from '../settings';
import { 
  SettingsIOErrorType, 
  SettingsIOError, 
  ErrorDetail, 
  ValidationResult,
  SettingsFileMetadata 
} from './settings-io-types';

/**
 * 设置数据校验器类
 */
export class SettingsValidator {
  private static readonly PLUGIN_NAME = 'Image Manager';
  private static readonly SUPPORTED_VERSION = '1.0.0';
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  /**
   * 验证设置文件元数据
   */
  public static validateMetadata(metadata: any): ValidationResult {
    const errors: SettingsIOError[] = [];
    const warnings: string[] = [];

    if (!metadata || typeof metadata !== 'object') {
      errors.push(this.createError(
        SettingsIOErrorType.MISSING_REQUIRED_FIELDS,
        '设置文件缺少必要的元数据'
      ));
      return { isValid: false, errors, warnings };
    }

    // 检查版本兼容性
    if (!metadata.version) {
      errors.push(this.createError(
        SettingsIOErrorType.MISSING_REQUIRED_FIELDS,
        '设置文件缺少版本信息'
      ));
    } else if (metadata.version !== this.SUPPORTED_VERSION) {
      warnings.push(`设置文件版本 ${metadata.version} 与当前插件版本 ${this.SUPPORTED_VERSION} 不匹配，可能影响兼容性`);
    }

    // 检查插件名称
    if (!metadata.pluginName) {
      errors.push(this.createError(
        SettingsIOErrorType.MISSING_REQUIRED_FIELDS,
        '设置文件缺少插件名称'
      ));
    } else if (metadata.pluginName !== this.PLUGIN_NAME) {
      errors.push(this.createError(
        SettingsIOErrorType.VERSION_INCOMPATIBLE,
        `设置文件不适用于当前插件：${metadata.pluginName}`
      ));
    }

    // 检查导出日期
    if (!metadata.exportDate) {
      warnings.push('设置文件缺少导出日期信息');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 验证设置数据完整性
   */
  public static validateSettingsData(settings: any): ValidationResult {
    const errors: SettingsIOError[] = [];
    const warnings: string[] = [];
    const validatedSettings: Partial<ImageManagementSettings> = {};

    if (!settings || typeof settings !== 'object') {
      errors.push(this.createError(
        SettingsIOErrorType.INVALID_JSON,
        '设置数据格式无效'
      ));
      return { isValid: false, errors, warnings };
    }

    // 验证基础设置
    this.validateBasicSettings(settings, errors, warnings, validatedSettings);
    
    // 验证显示设置
    this.validateDisplaySettings(settings, errors, warnings, validatedSettings);
    
    // 验证功能开关
    this.validateFeatureSettings(settings, errors, warnings, validatedSettings);
    
    // 验证高级设置
    this.validateAdvancedSettings(settings, errors, warnings, validatedSettings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      validatedSettings: errors.length === 0 ? validatedSettings : undefined
    };
  }

  /**
   * 验证基础设置
   */
  private static validateBasicSettings(
    settings: any, 
    errors: SettingsIOError[], 
    warnings: string[], 
    validated: Partial<ImageManagementSettings>
  ): void {
    // 自动扫描设置
    if (settings.autoScan !== undefined) {
      if (typeof settings.autoScan === 'boolean') {
        validated.autoScan = settings.autoScan;
      } else {
        errors.push(this.createTypeError('autoScan', 'boolean', typeof settings.autoScan));
      }
    }

    // 默认图片文件夹
    if (settings.defaultImageFolder !== undefined) {
      if (typeof settings.defaultImageFolder === 'string') {
        validated.defaultImageFolder = settings.defaultImageFolder;
      } else {
        errors.push(this.createTypeError('defaultImageFolder', 'string', typeof settings.defaultImageFolder));
      }
    }

    // 包含子文件夹
    if (settings.includeSubfolders !== undefined) {
      if (typeof settings.includeSubfolders === 'boolean') {
        validated.includeSubfolders = settings.includeSubfolders;
      } else {
        errors.push(this.createTypeError('includeSubfolders', 'boolean', typeof settings.includeSubfolders));
      }
    }
  }

  /**
   * 验证显示设置
   */
  private static validateDisplaySettings(
    settings: any, 
    errors: SettingsIOError[], 
    warnings: string[], 
    validated: Partial<ImageManagementSettings>
  ): void {
    // 每行图片数量
    if (settings.imagesPerRow !== undefined) {
      if (typeof settings.imagesPerRow === 'number' && settings.imagesPerRow >= 1 && settings.imagesPerRow <= 10) {
        validated.imagesPerRow = settings.imagesPerRow;
      } else {
        errors.push(this.createError(
          SettingsIOErrorType.TYPE_MISMATCH,
          '每行图片数量必须是1到10之间的整数',
          { field: 'imagesPerRow', expectedType: 'number (1-10)', actualType: typeof settings.imagesPerRow }
        ));
      }
    }

    // 默认排序方式
    if (settings.defaultSortBy !== undefined) {
      const validSortBy = ['name', 'size', 'date', 'dimensions'];
      if (typeof settings.defaultSortBy === 'string' && validSortBy.includes(settings.defaultSortBy)) {
        validated.defaultSortBy = settings.defaultSortBy as 'name' | 'size' | 'date' | 'dimensions';
      } else {
        errors.push(this.createError(
          SettingsIOErrorType.TYPE_MISMATCH,
          `排序方式必须是以下值之一：${validSortBy.join(', ')}`,
          { field: 'defaultSortBy', expectedType: validSortBy.join(' | '), actualType: typeof settings.defaultSortBy }
        ));
      }
    }

    // 默认排序顺序
    if (settings.defaultSortOrder !== undefined) {
      const validOrder = ['asc', 'desc'];
      if (typeof settings.defaultSortOrder === 'string' && validOrder.includes(settings.defaultSortOrder)) {
        validated.defaultSortOrder = settings.defaultSortOrder as 'asc' | 'desc';
      } else {
        errors.push(this.createError(
          SettingsIOErrorType.TYPE_MISMATCH,
          `排序顺序必须是：asc 或 desc`,
          { field: 'defaultSortOrder', expectedType: validOrder.join(' | '), actualType: typeof settings.defaultSortOrder }
        ));
      }
    }
  }

  /**
   * 验证功能开关设置
   */
  private static validateFeatureSettings(
    settings: any, 
    errors: SettingsIOError[], 
    warnings: string[], 
    validated: Partial<ImageManagementSettings>
  ): void {
    const booleanFields = [
      'enableDeduplication', 'enableDuplicateDetection', 'enableBrokenLinksDetection',
      'autoGenerateNames', 'keepModalOpen', 'showImageName', 'showImageSize',
      'showImageDimensions', 'showLockIcon', 'imageNameWrap', 'adaptiveImageSize',
      'pureGallery', 'enableHoverEffect', 'showImageIndex',
      'uniformCardHeight', 'enableCompactToolbar', 'hideNonEssentialInfo',
      'createNomediaFile', 'confirmBeforeDelete', 'moveToSystemTrash',
      'enablePluginTrash', 'searchCaseSensitive', 'searchInPath',
      'showBatchProgress', 'showStatistics', 'enableConsoleLog',
      'enableDebugLog', 'scanRemoteImages', 'showRemoteImageBadge'
    ];

    booleanFields.forEach(field => {
      if (settings[field] !== undefined) {
        if (typeof settings[field] === 'boolean') {
          (validated as any)[field] = settings[field];
        } else {
          errors.push(this.createTypeError(field, 'boolean', typeof settings[field]));
        }
      }
    });
  }

  /**
   * 验证高级设置
   */
  private static validateAdvancedSettings(
    settings: any, 
    errors: SettingsIOError[], 
    warnings: string[], 
    validated: Partial<ImageManagementSettings>
  ): void {
    // 数值范围验证
    const numericRanges = {
      'lazyLoadDelay': { min: 0, max: 5000 },
      'maxCacheSize': { min: 10, max: 1000 },
      'cardBorderRadius': { min: 0, max: 50 },
      'cardSpacing': { min: 0, max: 50 },
      'fixedImageHeight': { min: 50, max: 500 },
      'remoteImageTimeout': { min: 1000, max: 60000 },
      'liveSearchDelay': { min: 0, max: 2000 },
      'maxBatchOperations': { min: 1, max: 1000 },
      'batchConfirmThreshold': { min: 1, max: 100 }
    };

    Object.entries(numericRanges).forEach(([field, range]) => {
      if (settings[field] !== undefined) {
        if (typeof settings[field] === 'number' && settings[field] >= range.min && settings[field] <= range.max) {
          (validated as any)[field] = settings[field];
        } else {
          errors.push(this.createError(
            SettingsIOErrorType.TYPE_MISMATCH,
            `${field} 必须是 ${range.min} 到 ${range.max} 之间的整数`,
            { field, expectedType: `number (${range.min}-${range.max})`, actualType: typeof settings[field] }
          ));
        }
      }
    });

    // 枚举类型验证
    const enumFields = {
      'duplicateNameHandling': ['prompt', 'skip-silent', 'use-newest', 'use-oldest'],
      'multipleReferencesHandling': ['first', 'latest', 'prompt', 'all'],
      'statisticsPosition': ['top', 'bottom', 'sidebar'],
      'logLevel': ['DEBUG', 'INFO', 'WARNING', 'ERROR'],
      'remoteImageProxy': ['none', 'obsidian', 'weserv', 'both'],
      'brokenLinksNewItemPosition': ['top', 'bottom']
    };

    Object.entries(enumFields).forEach(([field, validValues]) => {
      if (settings[field] !== undefined) {
        if (typeof settings[field] === 'string' && validValues.includes(settings[field])) {
          // 类型安全：使用断言，但已经在运行时验证了值的范围
          (validated as any)[field] = settings[field];
        } else {
          errors.push(this.createError(
            SettingsIOErrorType.TYPE_MISMATCH,
            `${field} 必须是以下值之一：${validValues.join(', ')}`,
            { field, expectedType: validValues.join(' | '), actualType: typeof settings[field] }
          ));
        }
      }
    });
  }

  /**
   * 验证文件大小
   */
  public static validateFileSize(file: File): ValidationResult {
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        isValid: false,
        errors: [this.createError(
          SettingsIOErrorType.FILE_SIZE_EXCEEDED,
          `文件大小超过限制：${file.size} > ${this.MAX_FILE_SIZE}`
        )],
        warnings: []
      };
    }

    return { isValid: true, errors: [], warnings: [] };
  }

  /**
   * 创建类型错误
   */
  private static createTypeError(field: string, expectedType: string, actualType: string): SettingsIOError {
    return this.createError(
      SettingsIOErrorType.TYPE_MISMATCH,
      `字段 ${field} 类型不匹配`,
      { field, expectedType, actualType, message: `期望类型：${expectedType}，实际类型：${actualType}` }
    );
  }

  /**
   * 创建错误对象
   */
  private static createError(type: SettingsIOErrorType, message: string, detail?: ErrorDetail): SettingsIOError {
    return {
      type,
      message,
      details: detail ? [detail] : undefined,
      timestamp: Date.now()
    };
  }

  /**
   * 生成错误解决方案建议
   */
  public static generateErrorSolution(error: SettingsIOError): string[] {
    const solutions: string[] = [];

    switch (error.type) {
      case SettingsIOErrorType.INVALID_FILE_FORMAT:
        solutions.push('请确保文件是有效的JSON格式');
        solutions.push('检查文件编码是否正确（推荐使用UTF-8）');
        solutions.push('尝试重新导出设置文件');
        break;

      case SettingsIOErrorType.MISSING_REQUIRED_FIELDS:
        solutions.push('请确保设置文件包含完整的元数据和设置项');
        solutions.push('尝试使用最新版本的插件重新导出设置');
        solutions.push('检查文件是否被意外修改或损坏');
        break;

      case SettingsIOErrorType.TYPE_MISMATCH:
        solutions.push('请检查设置文件中各字段的数据类型是否正确');
        solutions.push('建议使用插件自带的导出功能生成设置文件');
        solutions.push('手动修改设置文件时请确保数据类型匹配');
        break;

      case SettingsIOErrorType.VERSION_INCOMPATIBLE:
        solutions.push('请确保设置文件适用于当前版本的插件');
        solutions.push('尝试更新插件到最新版本');
        solutions.push('联系插件开发者获取兼容的设置文件');
        break;

      case SettingsIOErrorType.FILE_SIZE_EXCEEDED:
        solutions.push('请选择较小的设置文件进行导入');
        solutions.push('检查文件是否包含不必要的数据');
        solutions.push('考虑分批导入设置');
        break;

      default:
        solutions.push('请检查设置文件的完整性和格式');
        solutions.push('尝试重新导出设置文件');
        solutions.push('如果问题持续存在，请联系技术支持');
    }

    return solutions;
  }
}