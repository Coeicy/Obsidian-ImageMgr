
import { UploadConfig, IImageUploader, UploadResult } from './types';
import { QiniuUploader } from './qiniu-uploader';
import { AliyunUploader } from './aliyun-uploader';

export class UploaderManager {
    private uploader: IImageUploader | null = null;

    constructor(private config: UploadConfig) {
        this.initializeUploader();
    }

    private initializeUploader() {
        if (this.config.type === 'qiniu' && this.config.qiniu) {
            this.uploader = new QiniuUploader(this.config.qiniu);
        } else if (this.config.type === 'aliyun' && this.config.aliyun) {
            this.uploader = new AliyunUploader(this.config.aliyun);
        }
    }

    updateConfig(config: UploadConfig) {
        this.config = config;
        this.initializeUploader();
    }

    async upload(file: Blob | ArrayBuffer, fileName: string): Promise<UploadResult> {
        if (!this.uploader) {
            return {
                success: false,
                error: '未配置图床或配置无效'
            };
        }
        return await this.uploader.upload(file, fileName);
    }
    
    async validateConfig(): Promise<boolean> {
         if (!this.uploader) return false;
         return await this.uploader.validateConfig();
    }
}
