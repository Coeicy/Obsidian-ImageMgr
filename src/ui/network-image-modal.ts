
import { App, Modal, Setting, Notice, requestUrl, TFile, ButtonComponent } from 'obsidian';
import ImageManagementPlugin from '../main';
import { NetworkImageScanner, NetworkImageReference } from '../utils/network-image-scanner';
import { UploaderManager } from '../utils/uploader/uploader-manager';
import { OperationType } from '../utils/logger';

export class NetworkImageModal extends Modal {
    private scanner: NetworkImageScanner;
    private uploaderManager: UploaderManager;
    private images: NetworkImageReference[] = [];
    private selectedImages: Set<number> = new Set(); // index in this.images
    private listContainer: HTMLElement;
    private uploadBtnComponent: ButtonComponent;

    constructor(app: App, private plugin: ImageManagementPlugin) {
        super(app);
        // 传递 logger 回调给 NetworkImageScanner
        this.scanner = new NetworkImageScanner(app, async (message: string, error?: any) => {
            if (this.plugin?.logger) {
                await this.plugin.logger.error(OperationType.SCAN, message, {
                    error: error instanceof Error ? error : new Error(String(error))
                });
            }
        });
        // 确保配置存在
        const config = this.plugin.settings.uploadConfig || { type: 'qiniu' };
        this.uploaderManager = new UploaderManager(config);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: '网络图片扫描与上传' });

        // 顶部控制栏
        const controls = contentEl.createDiv({ cls: 'network-image-controls' });
        controls.style.marginBottom = '10px';
        controls.style.display = 'flex';
        controls.style.gap = '10px';
        controls.style.alignItems = 'center';

        new Setting(controls)
            .setName('扫描全库')
            .setDesc('查找所有网络图片引用')
            .addButton(btn => btn
                .setButtonText('开始扫描')
                .setCta()
                .onClick(async () => {
                    await this.scanImages();
                }));

        // 列表容器
        this.listContainer = contentEl.createDiv({ cls: 'network-image-list' });
        this.listContainer.style.maxHeight = '400px';
        this.listContainer.style.overflowY = 'auto';
        this.listContainer.style.border = '1px solid var(--background-modifier-border)';
        this.listContainer.style.padding = '10px';
        this.listContainer.style.marginBottom = '10px';
        this.listContainer.createDiv({ text: '请点击"开始扫描"查找网络图片...' });

        // 底部操作栏
        const footer = contentEl.createDiv({ cls: 'network-image-footer' });
        footer.style.display = 'flex';
        footer.style.justifyContent = 'flex-end';
        footer.style.gap = '10px';

        // 刷新按钮 (靠左)
        const refreshBtn = new ButtonComponent(footer)
            .setButtonText('刷新')
            .setIcon('reset')
            .onClick(async () => {
                await this.scanImages();
            });
        refreshBtn.buttonEl.style.marginRight = 'auto';

        const selectAllBtn = new ButtonComponent(footer)
            .setButtonText('全选')
            .onClick(() => {
                this.images.forEach((_, i) => this.selectedImages.add(i));
                this.renderList();
                this.updateUploadButton();
            });

        this.uploadBtnComponent = new ButtonComponent(footer)
            .setButtonText('上传并替换链接')
            .setCta()
            .setDisabled(true)
            .onClick(async () => {
                await this.uploadImages();
            });

        // 自动开始扫描
        this.scanImages();
    }

    async scanImages() {
        this.listContainer.empty();
        this.listContainer.createDiv({ text: '正在自动扫描全库网络图片...' });
        
        // 强制扫描全库
        this.images = await this.scanner.scan();
        this.selectedImages.clear();
        
        if (this.images.length === 0) {
            this.listContainer.empty();
            this.listContainer.createDiv({ text: '未发现网络图片引用。' });
        } else {
            this.renderList();
        }
        this.updateUploadButton();
    }

    renderList() {
        this.listContainer.empty();
        
        const table = this.listContainer.createEl('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: '选择' }).style.textAlign = 'left';
        headerRow.createEl('th', { text: '图片预览' }).style.textAlign = 'left';
        headerRow.createEl('th', { text: '来源文件' }).style.textAlign = 'left';
        headerRow.createEl('th', { text: 'URL' }).style.textAlign = 'left';

        const tbody = table.createEl('tbody');

        this.images.forEach((img, index) => {
            const row = tbody.createEl('tr');
            row.style.borderBottom = '1px solid var(--background-modifier-border)';

            // Checkbox
            const checkCell = row.createEl('td');
            const checkbox = checkCell.createEl('input', { type: 'checkbox' });
            checkbox.checked = this.selectedImages.has(index);
            checkbox.onchange = (e) => {
                if ((e.target as HTMLInputElement).checked) {
                    this.selectedImages.add(index);
                } else {
                    this.selectedImages.delete(index);
                }
                this.updateUploadButton();
            };

            // Preview
            const previewCell = row.createEl('td');
            const imgEl = previewCell.createEl('img');
            // 尝试直接加载
            imgEl.src = img.url;
            imgEl.referrerPolicy = 'no-referrer';
            imgEl.style.maxHeight = '50px';
            imgEl.style.maxWidth = '50px';
            imgEl.style.objectFit = 'contain';
            
            // 错误处理与重试机制
            imgEl.onerror = async () => {
                const currentRetry = parseInt(imgEl.getAttribute('data-retry') || '0');
                const isRetried = imgEl.getAttribute('data-retried') === 'true';
                
                // Level 1: 尝试通过 Obsidian 后端代理加载 (绕过 Referrer/CORB/Mixed Content 限制)
                if (currentRetry === 0 && !isRetried) {
                    imgEl.setAttribute('data-retry', '1');
                    if (this.plugin?.logger) {
                        await this.plugin.logger.debug(OperationType.VIEW, `Level 1 - 代理加载: ${img.url}`, {
                            imagePath: img.url
                        });
                    }
                    
                    try {
                        const response = await requestUrl({ 
                            url: img.url,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Referer': '' // 尝试清空 Referer
                            }
                        });
                        
                        if (response.status >= 400) throw new Error(`HTTP ${response.status}`);

                        const base64 = arrayBufferToBase64(response.arrayBuffer);
                        const contentType = response.headers['content-type'] || 'image/jpeg';
                        imgEl.src = `data:${contentType};base64,${base64}`;
                        return; // 成功加载，退出
                    } catch (err: any) {
                        const errorMsg = err?.message || String(err);
                        const isDnsError = errorMsg.includes('ERR_NAME_NOT_RESOLVED') || 
                                           errorMsg.includes('ENOTFOUND') ||
                                           errorMsg.includes('getaddrinfo');
                        
                        if (this.plugin?.logger) {
                            await this.plugin.logger.warn(OperationType.VIEW, `Level 1 失败: ${img.url}`, {
                                imagePath: img.url,
                                error: err,
                                details: { isDnsError }
                            });
                            
                            if (isDnsError) {
                                await this.plugin.logger.warn(OperationType.VIEW, `DNS 解析失败，域名可能无法访问: ${img.url}`, {
                                    imagePath: img.url
                                });
                            }
                        }
                        
                        // 直接进入 Level 2，不触发 onerror
                        imgEl.setAttribute('data-retry', '2');
                        imgEl.setAttribute('data-retried', 'true');
                        if (this.plugin?.logger) {
                            await this.plugin.logger.debug(OperationType.VIEW, `Level 2 - 公共代理加载: ${img.url}`, {
                                imagePath: img.url
                            });
                        }
                        const cleanUrl = img.url.replace(/^https?:\/\//, '');
                        // 移除 default=error 参数，避免产生错误 URL
                        imgEl.src = `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl)}`;
                        return;
                    }
                } 
                // Level 2: 尝试使用公共图片代理服务 (images.weserv.nl)
                else if (currentRetry === 1 && !isRetried) {
                    imgEl.setAttribute('data-retry', '2');
                    imgEl.setAttribute('data-retried', 'true');
                    if (this.plugin?.logger) {
                        await this.plugin.logger.debug(OperationType.VIEW, `Level 2 - 公共代理加载: ${img.url}`, {
                            imagePath: img.url
                        });
                    }
                    // weserv.nl 支持处理跨域、HTTPS 升级等问题
                    const cleanUrl = img.url.replace(/^https?:\/\//, '');
                    // 移除 default=error 参数，避免产生错误 URL
                    imgEl.src = `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl)}`;
                    return;
                }
                // Level 3: 彻底失败
                else {
                    if (this.plugin?.logger) {
                        await this.plugin.logger.warn(OperationType.VIEW, `图片加载最终失败: ${img.url}`, {
                            imagePath: img.url
                        });
                    }
                    imgEl.style.display = 'none';
                    imgEl.setAttribute('data-retried', 'true'); // 确保标记为已重试，避免无限循环
                    if (!previewCell.querySelector('.network-image-error')) {
                        const errorSpan = previewCell.createSpan({ text: '❌', cls: 'network-image-error' });
                        errorSpan.style.cursor = 'help';
                        errorSpan.title = `图片加载失败\nURL: ${img.url}\n已尝试: 直接加载 -> 本地代理 -> 公共代理`;
                        
                        // 点击复制 URL
                        errorSpan.onclick = () => {
                            navigator.clipboard.writeText(img.url);
                            new Notice('已复制图片 URL');
                        };
                    }
                }
            };

            // Source File
            const fileCell = row.createEl('td');
            fileCell.createEl('span', { text: img.sourceFile.path });
            fileCell.createEl('div', { text: `行: ${img.line + 1}`, cls: 'text-muted' }).style.fontSize = '0.8em';

            // URL
            const urlCell = row.createEl('td');
            urlCell.createEl('div', { text: img.url }).style.wordBreak = 'break-all';
            urlCell.style.maxWidth = '200px';
        });
    }

    updateUploadButton() {
        this.uploadBtnComponent.setDisabled(this.selectedImages.size === 0);
        this.uploadBtnComponent.setButtonText(
            this.selectedImages.size > 0 
            ? `上传选中图片 (${this.selectedImages.size})` 
            : '上传并替换链接'
        );
    }

    async uploadImages() {
        if (!await this.uploaderManager.validateConfig()) {
            new Notice('图床配置无效，请先在设置中配置七牛云或阿里云 OSS。');
            return;
        }

        const indices = Array.from(this.selectedImages).sort((a, b) => a - b);
        let successCount = 0;
        let failCount = 0;

        // 清除旧的进度条
        this.contentEl.findAll('.upload-progress').forEach(el => el.remove());

        const progressDiv = this.contentEl.createDiv({ cls: 'upload-progress' });
        progressDiv.style.marginTop = '10px';
        progressDiv.style.padding = '10px';
        progressDiv.style.backgroundColor = 'var(--background-secondary)';

        // Map<FilePath, Array<{img: NetworkImageReference, newUrl: string}>>
        const pendingReplacements = new Map<string, Array<{
            img: NetworkImageReference,
            newUrl: string
        }>>();

        for (let i = 0; i < indices.length; i++) {
            const index = indices[i];
            const img = this.images[index];
            
            progressDiv.innerText = `正在处理 (${i + 1}/${indices.length}): ${img.url}`;

            try {
                // 1. 下载图片
                const response = await requestUrl({ url: img.url });
                const arrayBuffer = response.arrayBuffer;
                const contentType = response.headers['content-type'] || 'image/png';
                let ext = 'png';
                if (contentType.includes('jpeg')) ext = 'jpg';
                else if (contentType.includes('gif')) ext = 'gif';
                else if (contentType.includes('webp')) ext = 'webp';
                else if (contentType.includes('svg')) ext = 'svg';
                
                // 生成文件名: timestamp_hash.ext
                const timestamp = Date.now();
                const fileName = `upload_${timestamp}_${i}.${ext}`;

                // 2. 上传图片
                const uploadResult = await this.uploaderManager.upload(arrayBuffer, fileName);

                if (uploadResult.success && uploadResult.url) {
                    // 3. 记录需要替换的信息
                    const path = img.sourceFile.path;
                    if (!pendingReplacements.has(path)) {
                        pendingReplacements.set(path, []);
                    }
                    pendingReplacements.get(path)?.push({
                        img: img,
                        newUrl: uploadResult.url
                    });
                    successCount++;
                } else {
                    failCount++;
                    if (this.plugin?.logger) {
                        await this.plugin.logger.error(OperationType.CREATE, `上传失败: ${img.url}`, {
                            imagePath: img.url,
                            error: uploadResult.error instanceof Error ? uploadResult.error : new Error(String(uploadResult.error))
                        });
                    }
                }

            } catch (error) {
                failCount++;
                if (this.plugin?.logger) {
                    await this.plugin.logger.error(OperationType.CREATE, `处理失败: ${img.url}`, {
                        imagePath: img.url,
                        error: error instanceof Error ? error : new Error(String(error))
                    });
                }
            }
        }

        // 4. 批量执行替换
        if (pendingReplacements.size > 0) {
            progressDiv.innerText = `正在更新链接...`;
            
            for (const [path, replacements] of pendingReplacements) {
                try {
                    const file = replacements[0].img.sourceFile;
                    let content = await this.plugin.app.vault.read(file);
                    const lines = content.split('\n');

                    // 按行号降序，然后按行内索引降序排序，确保替换不影响前面的索引
                    replacements.sort((a, b) => {
                        if (a.img.line !== b.img.line) {
                            return b.img.line - a.img.line;
                        }
                        return b.img.index - a.img.index;
                    });

                    for (const {img, newUrl} of replacements) {
                        const lineContent = lines[img.line];
                        
                        let newText = img.originalText;
                        // 尝试智能替换 URL
                        if (newText.startsWith('![')) {
                            // Markdown: ![alt](url) -> ![alt](newUrl)
                            // 使用正则更精确地替换，避免因空格导致匹配失败
                            // 原始: ![alt](  url  ) -> ![alt](newUrl)
                            // 同时也支持保留 Title: ![alt](url "title") -> ![alt](newUrl "title")
                            
                            // 查找 URL 在 originalText 中的位置
                            const urlIndex = newText.indexOf(img.url);
                            if (urlIndex !== -1) {
                                // 简单替换：直接替换 URL 部分
                                // 这能保留 URL 前后的空格和 Title
                                newText = newText.substring(0, urlIndex) + newUrl + newText.substring(urlIndex + img.url.length);
                            } else {
                                // 兜底：如果 indexOf 找不到（极少见），尝试重组
                                const match = newText.match(/!\[(.*?)\]/);
                                if (match) {
                                    newText = `![${match[1]}](${newUrl})`;
                                }
                            }
                        } else if (newText.startsWith('<img')) {
                            // HTML: src="url" -> src="newUrl"
                            newText = newText.replace(img.url, newUrl);
                        }

                        // 验证并执行替换
                        const currentText = lineContent.substring(img.index, img.index + img.length);
                        if (currentText === img.originalText) {
                             lines[img.line] = lineContent.substring(0, img.index) + newText + lineContent.substring(img.index + img.length);
                        } else {
                            if (this.plugin?.logger) {
                                await this.plugin.logger.warn(OperationType.UPDATE_REFERENCE, `文件内容已变更，跳过替换: ${path}:${img.line}`, {
                                    filePath: path,
                                    details: { line: img.line }
                                });
                            }
                        }
                    }

                    await this.plugin.app.vault.modify(file, lines.join('\n'));

                } catch (err) {
                    if (this.plugin?.logger) {
                        await this.plugin.logger.error(OperationType.UPDATE_REFERENCE, `更新文件失败: ${path}`, {
                            filePath: path,
                            error: err instanceof Error ? err : new Error(String(err))
                        });
                    }
                    new Notice(`更新文件失败: ${path}`);
                    // 标记为失败（虽然图片上传成功了）
                    // 这里的 failCount 统计的是上传失败，链接替换失败暂不计入或单独提示
                }
            }
        }

        progressDiv.innerText = `处理完成。成功: ${successCount}, 失败: ${failCount}`;
        new Notice(`处理完成。成功: ${successCount}, 失败: ${failCount}`);
        
        // 重新扫描以更新列表
        await this.scanImages();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
