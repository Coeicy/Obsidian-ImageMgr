/**
 * 文件过滤工具模块
 * 
 * 提供文件锁定/忽略列表的解析和检查功能。
 * 用于判断文件是否应该被保护（跳过批量操作）。
 * 
 * 锁定机制支持两种方式：
 * 1. 基于文件名的锁定（精确匹配）
 * 2. 基于 MD5 哈希值的锁定（内容匹配，更可靠）
 * 
 * 哈希值锁定的优先级更高，因为它不受文件重命名影响。
 */

/**
 * 解析忽略文件列表
 * 
 * 将设置中的多行文本解析为文件名数组。
 * 每行一个文件名，自动去除空白行和首尾空格。
 * 
 * @param ignoredFiles - 忽略文件列表字符串（换行分隔）
 * @returns 解析后的文件名数组
 * 
 * @example
 * parseIgnoredFiles("file1.png\nfile2.jpg\n\nfile3.gif")
 * // 返回 ["file1.png", "file2.jpg", "file3.gif"]
 */
export function parseIgnoredFiles(ignoredFiles: string): string[] {
	return (ignoredFiles || '')
		.split('\n')
		.map(f => f.trim())
		.filter(f => f.length > 0);
}

/**
 * 检查文件是否被锁定（忽略）
 * 
 * 检查顺序：
 * 1. 首先检查哈希值锁定（优先级更高，不受重命名影响）
 * 2. 然后检查文件名锁定（精确匹配，不区分大小写）
 * 
 * @param fileName - 要检查的文件名
 * @param fileHash - 文件的 MD5 哈希值（可选）
 * @param ignoredFiles - 忽略文件列表（字符串或数组）
 * @param ignoredHashes - 忽略哈希值列表（字符串或数组）
 * @returns 如果文件被锁定返回 true
 * 
 * @example
 * // 检查文件是否被锁定
 * if (isFileIgnored(image.name, image.md5, settings.ignoredFiles, settings.ignoredHashes)) {
 *   console.log('文件已锁定，跳过操作');
 * }
 */
export function isFileIgnored(
	fileName: string, 
	fileHash: string | undefined,
	ignoredFiles: string | string[],
	ignoredHashes: string | string[] = []
): boolean {
	const ignoredList = Array.isArray(ignoredFiles) 
		? ignoredFiles 
		: parseIgnoredFiles(ignoredFiles);
	
	const ignoredHashList = Array.isArray(ignoredHashes)
		? ignoredHashes
		: parseIgnoredFiles(ignoredHashes);
	
	// 首先检查哈希值锁定（优先级更高）
	if (fileHash && ignoredHashList.length > 0) {
		const isHashLocked = ignoredHashList.some(ignoredHash => 
			ignoredHash.toLowerCase() === fileHash.toLowerCase()
		);
		if (isHashLocked) {
			return true;
		}
	}
	
	// 然后检查文件名锁定（精确匹配）
	if (ignoredList.length === 0) {
		return false;
	}
	
	const lowerFileName = fileName.toLowerCase();
	return ignoredList.some(ignored => {
		const lowerIgnored = ignored.toLowerCase();
		return lowerFileName === lowerIgnored;
	});
}
