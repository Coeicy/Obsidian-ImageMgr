
import { IImageUploader, UploadConfig, UploadResult, UploaderType } from './types';

/**
 * 又拍云上传器
 * 
 * 又拍云（Upyun）REST API 上传实现
 * 使用 HTTP Basic Auth 进行认证
 */
export class UpyunUploader implements IImageUploader {
    configId: string = 'upyun';
    configName: string = '又拍云';
    type: UploaderType = 'upyun';
    
    constructor(private config: UploadConfig['upyun']) {}

    async validateConfig(): Promise<boolean> {
        if (!this.config || !this.config.bucket || !this.config.operator || !this.config.password) {
            return false;
        }
        return true;
    }

    async upload(file: Blob | ArrayBuffer, fileName: string): Promise<UploadResult> {
        try {
            if (!await this.validateConfig()) {
                throw new Error('又拍云配置无效，请检查设置');
            }

            // 构造上传 URL
            // 格式: https://v0.api.upyun.com/{bucket}/{fileName}
            const uploadUrl = `https://v0.api.upyun.com/${this.config!.bucket}/${fileName}`;

            // 生成认证头
            const authHeader = await this.generateAuthHeader();

            // 使用 fetch 上传
            const response = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/octet-stream'
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
                // 使用又拍云默认域名
                finalUrl = `https://${this.config!.bucket}.b0.upaiyun.com/${fileName}`;
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
     * 生成又拍云 HTTP Basic Auth 认证头
     * 
     * 格式: Basic base64(operator:MD5(password))
     */
    private async generateAuthHeader(): Promise<string> {
        // 计算密码的 MD5
        const passwordMd5 = await this.md5(this.config!.password);
        
        // 构造认证字符串
        const authString = `${this.config!.operator}:${passwordMd5}`;
        
        // Base64 编码
        const authBase64 = this.base64Encode(authString);
        
        return `Basic ${authBase64}`;
    }

    /**
     * 计算字符串的 MD5
     */
    private async md5(str: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await window.crypto.subtle.digest('MD5', data);
        
        // 转换为十六进制字符串
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Base64 编码
     */
    private base64Encode(str: string): string {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        let binary = '';
        const len = data.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(data[i]);
        }
        return window.btoa(binary);
    }
}
