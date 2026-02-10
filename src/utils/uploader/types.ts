
import { App } from 'obsidian';

/** 图床类型 */
export type UploaderType = 'smms' | 'qiniu' | 'tencent' | 'upyun' | 'github' | 'aliyun' | 'imgur';

/** 图床配置基类 */
export interface UploaderConfigBase {
    /** 配置唯一ID */
    id: string;
    /** 显示名称 */
    name: string;
    /** 是否启用 */
    enabled: boolean;
    /** 是否为默认配置 */
    isDefault?: boolean;
}

/** SM.MS 图床配置 */
export interface SMMSConfig extends UploaderConfigBase {
    type: 'smms';
    /** API Token */
    apiToken: string;
}

/** 七牛云图床配置 */
export interface QiniuConfig extends UploaderConfigBase {
    type: 'qiniu';
    /** Access Key */
    accessKey: string;
    /** Secret Key */
    secretKey: string;
    /** 存储空间 */
    bucket: string;
    /** 访问域名 */
    domain: string;
    /** 存储区域 */
    region: 'z0' | 'z1' | 'z2' | 'na0' | 'as0';
}

/** 腾讯云 COS 配置 */
export interface TencentConfig extends UploaderConfigBase {
    type: 'tencent';
    /** SecretId */
    secretId: string;
    /** SecretKey */
    secretKey: string;
    /** 存储桶名称 */
    bucket: string;
    /** 存储桶地域 */
    region: string;
    /** 访问域名（可选，不填使用默认域名） */
    domain?: string;
}

/** 又拍云配置 */
export interface UpyunConfig extends UploaderConfigBase {
    type: 'upyun';
    /** 服务名称（存储空间名） */
    bucket: string;
    /** 操作员账号 */
    operator: string;
    /** 操作员密码 */
    password: string;
    /** 访问域名（可选） */
    domain?: string;
}

/** Github 图床配置 */
export interface GithubConfig extends UploaderConfigBase {
    type: 'github';
    /** GitHub Token */
    token: string;
    /** 用户名/组织名 */
    owner: string;
    /** 仓库名 */
    repo: string;
    /** 分支 */
    branch: string;
    /** 存储路径 */
    path: string;
    /** 自定义域名（可选，使用 jsDelivr 等 CDN） */
    customDomain?: string;
}

/** 阿里云 OSS 配置 */
export interface AliyunConfig extends UploaderConfigBase {
    type: 'aliyun';
    /** Access Key ID */
    accessKeyId: string;
    /** Access Key Secret */
    accessKeySecret: string;
    /** 存储空间 */
    bucket: string;
    /** 地域 */
    region: string;
    /** 自定义域名（可选） */
    customDomain?: string;
}

/** Imgur 图床配置 */
export interface ImgurConfig extends UploaderConfigBase {
    type: 'imgur';
    /** Client ID */
    clientId: string;
    /** 使用代理（国内访问需要） */
    useProxy?: boolean;
    /** 代理地址（可选） */
    proxyUrl?: string;
}

/** 图床配置联合类型 */
export type UploaderConfig = 
    | SMMSConfig 
    | QiniuConfig 
    | TencentConfig 
    | UpyunConfig 
    | GithubConfig 
    | AliyunConfig 
    | ImgurConfig;

/** 所有图床配置 - 简化为单一配置模式 */
export interface UploadConfig {
    /** Imgur 图床配置 */
    imgur?: {
        enabled: boolean;
        clientId: string;
        useProxy?: boolean;
        proxyUrl?: string;
    };
    /** SM.MS 图床配置 */
    smms?: {
        enabled: boolean;
        apiToken: string;
    };
    /** 七牛云配置 */
    qiniu?: {
        enabled: boolean;
        accessKey: string;
        secretKey: string;
        bucket: string;
        domain: string;
        region: string;
    };
    /** 腾讯云 COS 配置 */
    tencent?: {
        enabled: boolean;
        secretId: string;
        secretKey: string;
        bucket: string;
        region: string;
        domain?: string;
    };
    /** 又拍云配置 */
    upyun?: {
        enabled: boolean;
        bucket: string;
        operator: string;
        password: string;
        domain?: string;
    };
    /** GitHub 图床配置 */
    github?: {
        enabled: boolean;
        token: string;
        owner: string;
        repo: string;
        branch: string;
        path: string;
        customDomain?: string;
    };
    /** 阿里云 OSS 配置 */
    aliyun?: {
        enabled: boolean;
        accessKeyId: string;
        accessKeySecret: string;
        bucket: string;
        region: string;
        customDomain?: string;
    };
}

/** 上传结果 */
export interface UploadResult {
    success: boolean;
    url?: string;
    error?: string;
    originalUrl?: string; // If replacing network image
    /** 使用的配置ID */
    configId?: string;
    /** 图床类型 */
    uploaderType?: UploaderType;
}

/** 上传器接口 */
export interface IImageUploader {
    /** 配置ID */
    configId: string;
    /** 配置名称 */
    configName: string;
    /** 图床类型 */
    type: UploaderType;
    upload(file: Blob | ArrayBuffer, fileName: string): Promise<UploadResult>;
    validateConfig(): Promise<boolean>;
}

/** 上传器构造函数 */
export interface IUploaderConstructor {
    new (config: any): IImageUploader;
}
