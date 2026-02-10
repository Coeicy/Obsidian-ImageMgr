
import { IImageUploader, UploadConfig, UploadResult, UploaderType } from './types';

/**
 * Imgur 图床上传器
 * 
 * 使用 Imgur API v3 上传图片
 * 国内访问可能需要代理
 */
export class ImgurUploader implements IImageUploader {
    configId: string = 'imgur';
    configName: string = 'Imgur';
    type: UploaderType = 'imgur';

    constructor(private config: UploadConfig['imgur']) {}

    async validateConfig(): Promise<boolean> {
        if (!this.config || !this.config.clientId) {
            return false;
        }
        return true;
    }

    async upload(file: Blob | ArrayBuffer, fileName: string): Promise<UploadResult> {
        try {
            if (!await this.validateConfig()) {
                throw new Error('Imgur 配置无效，请检查 Client ID');
            }

            // 将 ArrayBuffer 转为 Blob
            let blob: Blob;
            if (file instanceof ArrayBuffer) {
                blob = new Blob([file]);
            } else {
                blob = file;
            }

            // 构建 FormData
            const formData = new FormData();
            formData.append('image', blob, fileName);

            // 使用代理（国内访问需要）
            let uploadUrl = 'https://api.imgur.com/3/image';
            if (this.config!.useProxy && this.config!.proxyUrl) {
                uploadUrl = this.config!.proxyUrl + uploadUrl;
            }

            // 上传图片
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Client-ID ${this.config!.clientId}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`上传失败: ${errorData.data?.error || response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(`上传失败: ${data.data?.error || '未知错误'}`);
            }

            // 返回图片链接（优先使用 https）
            const url = data.data.link;

            return {
                success: true,
                url: url
            };

        } catch (error) {
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }
}
