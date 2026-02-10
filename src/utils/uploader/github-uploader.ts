
import { IImageUploader, UploadConfig, UploadResult, UploaderType } from './types';

/**
 * GitHub 图床上传器
 * 
 * 使用 GitHub API 上传图片到仓库
 * 图片以 base64 编码形式存储
 */
export class GithubUploader implements IImageUploader {
    configId: string = 'github';
    configName: string = 'GitHub';
    type: UploaderType = 'github';

    constructor(private config: UploadConfig['github']) {}

    async validateConfig(): Promise<boolean> {
        if (!this.config || !this.config.token || !this.config.owner || !this.config.repo || !this.config.branch) {
            return false;
        }
        return true;
    }

    async upload(file: Blob | ArrayBuffer, fileName: string): Promise<UploadResult> {
        try {
            if (!await this.validateConfig()) {
                throw new Error('GitHub 配置无效');
            }

            // 将文件转为 base64
            let arrayBuffer: ArrayBuffer;
            if (file instanceof Blob) {
                arrayBuffer = await file.arrayBuffer();
            } else {
                arrayBuffer = file;
            }
            const base64Content = this.arrayBufferToBase64(arrayBuffer);

            // 构建路径
            const path = this.config!.path ? `${this.config!.path}/${fileName}` : fileName;

            // 构建 API URL
            const apiUrl = `https://api.github.com/repos/${this.config!.owner}/${this.config!.repo}/contents/${path}`;

            // 构建请求体
            const body = {
                message: `Upload image: ${fileName}`,
                content: base64Content,
                branch: this.config!.branch
            };

            // 上传图片
            const response = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.config!.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json();
                // 处理文件已存在的情况
                if (errorData.message && errorData.message.includes('already exists')) {
                    throw new Error(`文件已存在: ${path}`);
                }
                throw new Error(`上传失败: ${errorData.message || response.statusText}`);
            }

            const data = await response.json();

            // 构造返回链接
            let finalUrl = '';
            if (this.config!.customDomain) {
                // 使用自定义 CDN 域名（如 jsDelivr）
                let domain = this.config!.customDomain;
                if (!domain.startsWith('http')) {
                    domain = 'https://' + domain;
                }
                if (!domain.endsWith('/')) {
                    domain = domain + '/';
                }
                finalUrl = domain + path;
            } else {
                // 使用 GitHub raw URL
                finalUrl = `https://raw.githubusercontent.com/${this.config!.owner}/${this.config!.repo}/${this.config!.branch}/${path}`;
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
     * ArrayBuffer 转 Base64
     */
    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}
