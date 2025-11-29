import * as SparkMD5 from 'spark-md5';
import { TFile, Vault } from 'obsidian';

/**
 * 计算文件的 MD5 哈希值
 * 
 * 用于：
 * - 图片去重检测
 * - 文件完整性验证
 * - 图片追踪和识别
 * 
 * @param file - 要计算哈希的文件对象
 * @param vault - Obsidian Vault 实例，用于读取文件内容
 * @returns 文件的 MD5 哈希值（32 位十六进制字符串）
 * @throws 如果文件读取失败会抛出错误
 * 
 * @example
 * ```typescript
 * const hash = await calculateFileHash(imageFile, vault);
 * console.log(hash); // "5d41402abc4b2a76b9719d911017c592"
 * ```
 */
export async function calculateFileHash(file: TFile, vault: Vault): Promise<string> {
	const arrayBuffer = await vault.adapter.readBinary(file.path);
	return SparkMD5.ArrayBuffer.hash(arrayBuffer);
}

/**
 * 计算字节数组的 MD5 哈希值
 * 
 * 用于：
 * - 计算内存中数据的哈希值
 * - 比较文件内容是否相同
 * - 生成文件的唯一标识
 * 
 * @param buffer - 要计算哈希的字节数组
 * @returns 字节数组的 MD5 哈希值（32 位十六进制字符串）
 * 
 * @example
 * ```typescript
 * const buffer = new ArrayBuffer(1024);
 * const hash = calculateBufferHash(buffer);
 * console.log(hash); // "5d41402abc4b2a76b9719d911017c592"
 * ```
 */
export function calculateBufferHash(buffer: ArrayBuffer): string {
	return SparkMD5.ArrayBuffer.hash(buffer);
}
