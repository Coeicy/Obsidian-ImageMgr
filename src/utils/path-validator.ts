/**
 * 路径验证器模块
 * 
 * 提供路径和文件名的安全验证和清理功能，用于防止：
 * - 目录遍历攻击（如 ../../../etc/passwd）
 * - 文件名注入（如包含特殊字符的文件名）
 * - 跨平台兼容性问题（Windows/Unix 路径差异）
 */

import { normalizePath } from 'obsidian';

/**
 * 路径验证工具类
 * 
 * 提供静态方法用于：
 * - 验证路径安全性（isSafePath）
 * - 清理危险字符（sanitizePath, sanitizeFileName）
 * - 验证文件名合法性（isValidFileName）
 * - 安全组合路径（combinePath）
 * 
 * 安全考虑：
 * - 阻止目录遍历（..）
 * - 阻止绝对路径
 * - 过滤 Windows/Unix 非法字符
 * - 检查 Windows 保留名称（CON, PRN, AUX 等）
 * - 限制文件名长度
 * 
 * @example
 * ```typescript
 * // 验证路径
 * if (!PathValidator.isSafePath(userInput)) {
 *   throw new Error('不安全的路径');
 * }
 * 
 * // 清理文件名
 * const safeName = PathValidator.sanitizeFileName(userInput);
 * ```
 */
export class PathValidator {
	/**
	 * 验证路径是否安全（防止目录遍历攻击）
	 * @param path - 要验证的路径
	 * @returns 是否安全
	 */
	static isSafePath(path: string): boolean {
		// 规范化路径
		const normalized = normalizePath(path);
		
		// 不允许绝对路径（Windows和Unix风格）
		if (normalized.startsWith('/') || /^[A-Z]:/i.test(normalized)) {
			return false;
		}
		
		// 不允许父目录引用（防止目录遍历）
		if (normalized.includes('..')) {
			return false;
		}
		
		// 不允许包含空字节（安全漏洞）
		if (normalized.includes('\0')) {
			return false;
		}
		
		return true;
	}
	
	/**
	 * 清理路径，移除危险字符
	 * @param path - 原始路径
	 * @returns 清理后的路径
	 */
	static sanitizePath(path: string): string {
		return normalizePath(path)
			.replace(/\\/g, '/') // 统一使用正斜杠
			.replace(/\/+/g, '/') // 移除重复斜杠
			.replace(/^\//, '') // 移除开头斜杠
			.replace(/\/$/, '') // 移除结尾斜杠
			.replace(/\.\./g, ''); // 移除父目录引用
	}
	
	/**
	 * 验证文件名是否合法
	 * @param fileName - 文件名
	 * @returns 是否合法
	 */
	static isValidFileName(fileName: string): boolean {
		// 不允许的字符（Windows + Unix）
		// < > : " / \ | ? * 以及控制字符（\x00-\x1F）
		const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
		
		// 文件名不能为空或只包含空格
		if (!fileName || fileName.trim().length === 0) {
			return false;
		}
		
		// 文件名不能只包含点号（. 或 ..）
		if (/^\.+$/.test(fileName)) {
			return false;
		}
		
		// 检查是否包含非法字符
		if (invalidChars.test(fileName)) {
			return false;
		}
		
		// Windows 保留名称检查
		const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
		const nameWithoutExt = fileName.split('.')[0];
		if (reservedNames.test(nameWithoutExt)) {
			return false;
		}
		
		// 文件名长度限制（Windows: 255, 保守起见使用 200）
		if (fileName.length > 200) {
			return false;
		}
		
		return true;
	}
	
	/**
	 * 清理文件名，移除非法字符
	 * @param fileName - 原始文件名
	 * @returns 清理后的文件名
	 */
	static sanitizeFileName(fileName: string): string {
		return fileName
			.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // 替换非法字符为下划线
			.replace(/^\.+/, '') // 移除开头的点
			.replace(/\.+$/, '') // 移除结尾的点（但保留扩展名的点）
			.trim()
			.substring(0, 200); // 限制长度
	}
	
	/**
	 * 组合路径和文件名（确保安全）
	 * @param directory - 目录路径
	 * @param fileName - 文件名
	 * @returns 完整路径
	 */
	static combinePath(directory: string, fileName: string): string {
		const cleanDir = this.sanitizePath(directory);
		const cleanName = this.sanitizeFileName(fileName);
		
		if (!cleanDir) {
			return cleanName;
		}
		
		return `${cleanDir}/${cleanName}`;
	}
	
	/**
	 * 验证并清理完整路径（包括文件名）
	 * @param fullPath - 完整路径
	 * @returns 清理后的路径，如果不安全则返回 null
	 */
	static validateAndSanitize(fullPath: string): string | null {
		// 先清理
		const sanitized = this.sanitizePath(fullPath);
		
		// 再验证
		if (!this.isSafePath(sanitized)) {
			return null;
		}
		
		// 提取文件名部分并验证
		const parts = sanitized.split('/');
		const fileName = parts[parts.length - 1];
		
		if (fileName && !this.isValidFileName(fileName)) {
			return null;
		}
		
		return sanitized;
	}
	
	/**
	 * 转义正则表达式特殊字符
	 * @param str - 要转义的字符串
	 * @returns 转义后的字符串
	 */
	static escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
