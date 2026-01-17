
import { UploaderManager } from './uploader-manager';
import { UploadConfig } from './types';

describe('UploaderManager', () => {
    const mockConfig: UploadConfig = {
        type: 'qiniu',
        qiniu: {
            accessKey: 'ak',
            secretKey: 'sk',
            bucket: 'bucket',
            domain: 'domain',
            region: 'z0'
        },
        aliyun: {
            accessKeyId: '',
            accessKeySecret: '',
            bucket: '',
            region: ''
        }
    };

    test('should initialize with qiniu config', async () => {
        const manager = new UploaderManager(mockConfig);
        expect(await manager.validateConfig()).toBe(true);
    });

    test('should fail validation when qiniu config is missing fields', async () => {
        const badConfig = JSON.parse(JSON.stringify(mockConfig));
        badConfig.qiniu.accessKey = '';
        const manager = new UploaderManager(badConfig);
        expect(await manager.validateConfig()).toBe(false);
    });

    test('should initialize with aliyun config', async () => {
        const aliyunConfig: UploadConfig = {
            type: 'aliyun',
            qiniu: mockConfig.qiniu,
            aliyun: {
                accessKeyId: 'ak',
                accessKeySecret: 'sk',
                bucket: 'bucket',
                region: 'oss-cn-hangzhou'
            }
        };
        const manager = new UploaderManager(aliyunConfig);
        expect(await manager.validateConfig()).toBe(true);
    });

    test('should fail validation when aliyun config is missing fields', async () => {
        const aliyunConfig: UploadConfig = {
            type: 'aliyun',
            qiniu: mockConfig.qiniu,
            aliyun: {
                accessKeyId: '',
                accessKeySecret: 'sk',
                bucket: 'bucket',
                region: 'oss-cn-hangzhou'
            }
        };
        const manager = new UploaderManager(aliyunConfig);
        expect(await manager.validateConfig()).toBe(false);
    });
});
