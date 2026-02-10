
import { UploadConfig, IImageUploader, UploadResult } from './types';
import { ImgurUploader } from './imgur-uploader';
import { SmmsUploader } from './smms-uploader';
import { QiniuUploader } from './qiniu-uploader';
import { TencentUploader } from './tencent-uploader';
import { UpyunUploader } from './upyun-uploader';
import { GithubUploader } from './github-uploader';
import { AliyunUploader } from './aliyun-uploader';

export class UploaderManager {
    private uploader: IImageUploader | null = null;

    constructor(private config: UploadConfig) {
        this.initializeUploader();
    }

    private initializeUploader() {
        // 按易用性优先级选择启用的图床
        // 顺序：SM.MS > Imgur > GitHub > 七牛云 > 阿里云 > 腾讯云 > 又拍云
        if (this.config.smms?.enabled) {
            this.uploader = new SmmsUploader(this.config.smms);
        } else if (this.config.imgur?.enabled) {
            this.uploader = new ImgurUploader(this.config.imgur);
        } else if (this.config.github?.enabled) {
            this.uploader = new GithubUploader(this.config.github);
        } else if (this.config.qiniu?.enabled) {
            this.uploader = new QiniuUploader(this.config.qiniu);
        } else if (this.config.aliyun?.enabled) {
            this.uploader = new AliyunUploader(this.config.aliyun);
        } else if (this.config.tencent?.enabled) {
            this.uploader = new TencentUploader(this.config.tencent);
        } else if (this.config.upyun?.enabled) {
            this.uploader = new UpyunUploader(this.config.upyun);
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
                error: '未启用任何图床或配置无效，请先在设置中启用并配置图床'
            };
        }
        return await this.uploader.upload(file, fileName);
    }
    
    async validateConfig(): Promise<boolean> {
         if (!this.uploader) return false;
         return await this.uploader.validateConfig();
    }
}
