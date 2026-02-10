
import { IImageUploader, UploadConfig, UploadResult, UploaderType } from './types';

/**
 * SM.MS 图床上传器
 * 
 * 使用 SM.MS API 上传图片
 * 免费版有上传限制，付费版支持更多功能
 */
export class SmmsUploader implements IImageUploader {
    configId: string = 'smms';
    configName: string = 'SM.MS';
    type: UploaderType = 'smms';

    constructor(private config: UploadConfig['smms']) {}

    async validateConfig(): Promise<boolean> {
        if (!this.config || !this.config.apiToken) {
            return false;
        }
        return true;
    }

    async upload(file: Blob | ArrayBuffer, fileName: string): Promise<UploadResult> {
        try {
            if (!await this.validateConfig()) {
                throw new Error('SM.MS 配置无效，请检查 API Token');
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
            formData.append('smfile', blob, fileName);

            // 上传图片
            const response = await fetch('https://sm.ms/api/v2/upload', {
                method: 'POST',
                headers: {
                    'Authorization': this.config!.apiToken
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok || data.success === false) {
                // 处理重复上传的情况
                if (data.code === 'image_repeated' && data.images) {
                    return {
                        success: true,
                        url: data.images
                    };
                }
                throw new Error(`上传失败: ${data.message || response.statusText}`);
            }

            // 返回图片链接
            const url = data.data?.url;
            if (!url) {
                throw new Error('上传成功但未返回图片链接');
            }

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
