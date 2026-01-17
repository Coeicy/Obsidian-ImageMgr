
import { IImageUploader, UploadConfig, UploadResult } from './types';
import { base64EncodeUrlSafe, hmacSha1 } from './crypto-utils';

export class QiniuUploader implements IImageUploader {
    constructor(private config: UploadConfig['qiniu']) {}

    async validateConfig(): Promise<boolean> {
        if (!this.config || !this.config.accessKey || !this.config.secretKey || !this.config.bucket || !this.config.domain) {
            return false;
        }
        return true;
    }

    async upload(file: Blob | ArrayBuffer, fileName: string): Promise<UploadResult> {
        try {
            if (!await this.validateConfig()) {
                throw new Error('七牛云配置无效，请检查设置');
            }

            const token = await this.generateUploadToken(fileName);
            
            const form = new FormData();
            form.append('token', token);
            form.append('key', fileName);
            
            let blob: Blob;
            if (file instanceof ArrayBuffer) {
                blob = new Blob([file]);
            } else {
                blob = file;
            }
            form.append('file', blob, fileName);

            const uploadUrl = this.getUploadUrl(this.config!.region);

            // 使用 fetch 上传，因为 requestUrl 构造 multipart/form-data 比较复杂
            // 七牛云支持 CORS
            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: form
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`上传失败: ${response.status} ${text}`);
            }

            const data = await response.json();
            
            let domain = this.config!.domain;
            if (!domain.startsWith('http')) {
                domain = 'http://' + domain;
            }
            if (!domain.endsWith('/')) {
                domain = domain + '/';
            }
            
            const finalUrl = domain + data.key;

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

    private async generateUploadToken(fileName: string): Promise<string> {
        const putPolicy = {
            scope: `${this.config!.bucket}:${fileName}`,
            deadline: Math.floor(Date.now() / 1000) + 3600 // 1小时后过期
        };

        const putPolicyJson = JSON.stringify(putPolicy);
        const encodedPutPolicy = base64EncodeUrlSafe(putPolicyJson);
        const sign = await hmacSha1(this.config!.secretKey, encodedPutPolicy);
        
        return `${this.config!.accessKey}:${sign}:${encodedPutPolicy}`;
    }

    private getUploadUrl(region: string): string {
        switch (region) {
            case 'z0': return 'https://upload.qiniup.com'; // 华东
            case 'z1': return 'https://upload-z1.qiniup.com'; // 华北
            case 'z2': return 'https://upload-z2.qiniup.com'; // 华南
            case 'na0': return 'https://upload-na0.qiniup.com'; // 北美
            case 'as0': return 'https://upload-as0.qiniup.com'; // 东南亚
            default: return 'https://upload.qiniup.com';
        }
    }
}
