
/**
 * 加密工具类
 * 提供 HMAC-SHA1 签名和 Base64 编码功能
 */

export async function hmacSha1(key: string, data: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const dataData = encoder.encode(data);

    const cryptoKey = await window.crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, dataData);
    // 这里的签名是二进制数据，需要转换为 Base64
    // 注意：七牛云使用的是 URL 安全的 Base64
    return arrayBufferToBase64UrlSafe(signature);
}

export function arrayBufferToBase64UrlSafe(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = window.btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_');
}

export function base64EncodeUrlSafe(str: string): string {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    let binary = '';
    const len = data.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(data[i]);
    }
    const base64 = window.btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_');
}

export async function hmacSha1Base64(key: string, data: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const dataData = encoder.encode(data);

    const cryptoKey = await window.crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, dataData);
    // 标准 Base64 (阿里云使用)
    let binary = '';
    const bytes = new Uint8Array(signature);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}
