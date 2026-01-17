
import { App } from 'obsidian';

export interface UploadConfig {
    type: 'qiniu' | 'aliyun' | 'custom';
    qiniu?: {
        accessKey: string;
        secretKey: string;
        bucket: string;
        domain: string;
        region: string; // e.g. z0, z1, etc.
    };
    aliyun?: {
        accessKeyId: string;
        accessKeySecret: string;
        bucket: string;
        region: string; // e.g. oss-cn-hangzhou
        customDomain?: string;
    };
}

export interface UploadResult {
    success: boolean;
    url?: string;
    error?: string;
    originalUrl?: string; // If replacing network image
}

export interface IImageUploader {
    upload(file: Blob | ArrayBuffer, fileName: string): Promise<UploadResult>;
    validateConfig(): Promise<boolean>;
}
