
import { IImageUploader, UploadConfig, UploadResult, UploaderType } from './types';
import { hmacSha1Base64 } from './crypto-utils';

export class AliyunUploader implements IImageUploader {
    configId: string = 'aliyun';
    configName: string = '阿里云 OSS';
    type: UploaderType = 'aliyun';
    
    constructor(private config: UploadConfig['aliyun']) {}

    async validateConfig(): Promise<boolean> {
        if (!this.config || !this.config.accessKeyId || !this.config.accessKeySecret || !this.config.bucket || !this.config.region) {
            return false;
        }
        return true;
    }

    async upload(file: Blob | ArrayBuffer, fileName: string): Promise<UploadResult> {
        try {
            if (!await this.validateConfig()) {
                throw new Error('阿里云 OSS 配置无效');
            }

            const date = new Date().toUTCString();
            const contentType = 'application/octet-stream'; // 简化处理，实际应根据文件后缀判断
            const resource = `/${this.config!.bucket}/${fileName}`;
            
            // 构造签名字符串
            const stringToSign = `PUT\n\n${contentType}\n${date}\n${resource}`;
            
            // 计算签名
            const signature = await hmacSha1Base64(this.config!.accessKeySecret, stringToSign);
            const authorization = `OSS ${this.config!.accessKeyId}:${signature}`;

            // 构造上传 URL
            // https://bucket.region.aliyuncs.com/object
            const host = `${this.config!.bucket}.${this.config!.region}.aliyuncs.com`;
            const url = `https://${host}/${fileName}`;

            // 使用 fetch 上传
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': authorization,
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
            if (this.config!.customDomain) {
                let domain = this.config!.customDomain;
                if (!domain.startsWith('http')) domain = 'http://' + domain;
                if (!domain.endsWith('/')) domain += '/';
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
}
