
import { IImageUploader, UploadConfig, UploadResult, UploaderType } from './types';

/**
 * 腾讯云 COS 上传器
 * 
 * 使用腾讯云 COS PUT Object API 上传图片
 * 通过临时密钥或永久密钥进行身份验证
 */
export class TencentUploader implements IImageUploader {
    configId: string = 'tencent';
    configName: string = '腾讯云 COS';
    type: UploaderType = 'tencent';

    constructor(private config: UploadConfig['tencent']) {}

    async validateConfig(): Promise<boolean> {
        if (!this.config || !this.config.secretId || !this.config.secretKey || !this.config.bucket || !this.config.region) {
            return false;
        }
        return true;
    }

    async upload(file: Blob | ArrayBuffer, fileName: string): Promise<UploadResult> {
        try {
            if (!await this.validateConfig()) {
                throw new Error('腾讯云 COS 配置无效');
            }

            const date = new Date().toUTCString();
            const contentType = 'application/octet-stream';
            const host = `${this.config!.bucket}.cos.${this.config!.region}.myqcloud.com`;
            const url = `https://${host}/${fileName}`;

            // 构造签名字符串 (COS 使用 HMAC-SHA1 签名)
            const httpMethod = 'PUT';
            const contentMd5 = '';
            const canonicalHeaders = `host:${host}\n`;
            const canonicalRequest = `${httpMethod}\n${contentMd5}\n${contentType}\n${date}\n${canonicalHeaders}/${this.config!.bucket}/${fileName}`;

            // 计算签名
            const signature = await this.hmacSha1(this.config!.secretKey, canonicalRequest);
            const authorization = `q-sign-algorithm=sha1&q-ak=${this.config!.secretId}&q-sign-time=${Math.floor(Date.now() / 1000)};${Math.floor(Date.now() / 1000) + 3600}&q-key-time=${Math.floor(Date.now() / 1000)};${Math.floor(Date.now() / 1000) + 3600}&q-header-list=host&q-url-param-list=&q-signature=${signature}`;

            // 使用 fetch 上传
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': authorization,
                    'Host': host,
                    'Date': date,
                    'Content-Type': contentType
                },
                body: file
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`上传失败: ${response.status} ${text}`);
            }

            // 构造返回链接
            let finalUrl = '';
            if (this.config!.domain) {
                let domain = this.config!.domain;
                if (!domain.startsWith('http')) {
                    domain = 'https://' + domain;
                }
                if (!domain.endsWith('/')) {
                    domain = domain + '/';
                }
                finalUrl = domain + fileName;
            } else {
                finalUrl = url;
            }

            return {
                success: true,
                url: finalUrl
            };

        } catch (error) {
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    /**
     * HMAC-SHA1 签名
     */
    private async hmacSha1(key: string, data: string): Promise<string> {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(key);
        const dataData = encoder.encode(data);

        const cryptoKey = await window.crypto.subtle.importKey(
            'raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
        );

        const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, dataData);
        
        // 转为十六进制
        const hashArray = Array.from(new Uint8Array(signature));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
}
