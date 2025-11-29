/**
 * 文件过滤工具函数
 * 统一处理忽略文件列表的解析和检查
 * 支持基于文件名和哈希值的锁定检查
 */

/**
 * 解析忽略文件列表（从设置字符串中提取）
 * @param ignoredFiles - 忽略文件列表字符串（每行一个，支持换行分隔）
 * @returns 解析后的文件列表数组
 */
export function parseIgnoredFiles(ignoredFiles: string): string[] {
	return (ignoredFiles || '')
		.split('\n')
		.map(f => f.trim())
		.filter(f => f.length > 0);
}

/**
 * 检查文件是否在忽略列表中（基于文件名或哈希值）
 * @param fileName - 要检查的文件名
 * @param fileHash - 要检查的文件哈希值（MD5）
 * @param ignoredFiles - 忽略文件列表字符串或数组
 * @param ignoredHashes - 忽略哈希值列表字符串或数组
 * @returns 是否被忽略（锁定）
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
