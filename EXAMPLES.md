# ImageMgr 使用示例与教程

**版本:** v0.4.0  
**难度级别:** 初级 → 高级  
**预计学习时间:** 30-60分钟

---

## 📚 目录

1. [快速入门](#快速入门)
2. [基础示例](#基础示例)
3. [进阶示例](#进阶示例)
4. [高级技巧](#高级技巧)
5. [完整项目](#完整项目)

### 示例列表

| 示例 | 难度 | 描述 |
|------|------|------|
| [示例 1: 列出所有图片](#示例-1-列出所有图片) | 初级 | 获取仓库中所有图片的基本信息 |
| [示例 2: 查找图片引用](#示例-2-查找图片引用) | 初级 | 查看某张图片被哪些笔记引用 |
| [示例 3: 搜索和筛选](#示例-3-搜索和筛选) | 初级 | 使用多种条件搜索图片 |
| [示例 4: 批量重命名](#示例-4-批量重命名带编号) | 中级 | 批量重命名图片，使用序号命名 |
| [示例 5: 智能重命名](#示例-5-智能重命名根据引用笔记) | 中级 | 根据引用笔记自动命名图片 |
| [示例 6: 图片库存统计](#示例-6-生成图片库存报告) | 中级 | 生成详细的图片库存报告 |
| [示例 7: 检测和修复空链接](#示例-7-检测和修复空链接) | 中级 | 检测失效图片链接并批量修复 |
| [示例 8: 自定义事件监听](#示例-8-自定义事件监听) | 高级 | 监听图片操作事件并自动记录 |

---

## 快速入门

### 环境准备

确保 ImageMgr 插件已安装并启用：

1. 打开 Obsidian 设置
2. 进入「社区插件」
3. 搜索并安装「ImageMgr」
4. 启用插件

### 获取插件实例

```typescript
// 在任何 Obsidian 插件或脚本中获取 ImageMgr 实例
const imageMgr = app.plugins.plugins['imagemgr'];

if (!imageMgr) {
    new Notice('请先安装并启用 ImageMgr 插件');
    throw new Error('ImageMgr 插件未找到');
}
```

---

## 基础示例

### 示例 1: 列出所有图片

**目标:** 获取仓库中所有图片的基本信息

```typescript
async function listAllImages() {
    const plugin = app.plugins.plugins['imagemgr'];
    
    // 扫描所有图片
    const images = await plugin.scanImages();
    
    console.log(`找到 ${images.length} 张图片：`);
    
    for (const image of images) {
        console.log(`- ${image.name} (${formatSize(image.size)})`);
    }
}

// 辅助函数：格式化文件大小
function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 运行
listAllImages();
```

**预期输出:**
```
找到 15 张图片：
- screenshot-001.png (245.3 KB)
- diagram.png (89.1 KB)
- logo.svg (12.4 KB)
...
```

---

### 示例 2: 查找图片引用

**目标:** 查看某张图片被哪些笔记引用

```typescript
async function checkImageReferences(imagePath: string) {
    const plugin = app.plugins.plugins['imagemgr'];
    
    // 查找引用
    const references = await plugin.referenceManager.findAllReferences(imagePath);
    
    if (references.length === 0) {
        console.log(`❌ 图片 "${imagePath}" 未被任何笔记引用`);
        return;
    }
    
    console.log(`✅ 图片 "${imagePath}" 被 ${references.length} 个笔记引用：`);
    
    for (const ref of references) {
        console.log(`  📄 ${ref.filePath}:${ref.lineNumber}`);
        if (ref.displayText) {
            console.log(`     显示文本: "${ref.displayText}"`);
        }
    }
}

// 使用示例
checkImageReferences('assets/images/screenshot.png');
```

---

### 示例 3: 重命名单个图片

**目标:** 重命名图片并自动更新所有引用

```typescript
async function renameSingleImage() {
    const plugin = app.plugins.plugins['imagemgr'];
    
    const oldName = 'old-image.png';
    const newName = 'new-image.png';
    
    try {
        // 检查文件是否被锁定
        if (plugin.lockListManager.isLocked(oldName)) {
            new Notice('⚠️ 该文件已被锁定，无法重命名');
            return;
        }
        
        // 执行重命名
        const success = await plugin.renameImage(oldName, newName);
        
        if (success) {
            new Notice(`✅ 重命名成功: ${oldName} → ${newName}`);
        } else {
            new Notice('❌ 重命名失败');
        }
    } catch (error) {
        new Notice(`❌ 错误: ${error.message}`);
        console.error(error);
    }
}

renameSingleImage();
```

---

## 进阶示例

### 示例 4: 批量重命名（带编号）

**目标:** 批量重命名图片，使用序号命名

```typescript
/**
 * 批量重命名图片
 * @param folderPath 目标文件夹
 * @param pattern 命名模式，如 "screenshot_{index}"
 * @param startIndex 起始编号（默认1）
 */
async function batchRenameImages(
    folderPath: string,
    pattern: string,
    startIndex: number = 1
) {
    const plugin = app.plugins.plugins['imagemgr'];
    
    // 扫描文件夹中的图片
    const images = await plugin.scanImages(folderPath);
    
    if (images.length === 0) {
        new Notice('文件夹中没有图片');
        return;
    }
    
    console.log(`准备重命名 ${images.length} 张图片...`);
    
    let successCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < images.length; i++) {
        const image = images[i];
        
        // 跳过锁定的文件
        if (plugin.lockListManager.isLocked(image.path)) {
            console.log(`⏭️ 跳过锁定文件: ${image.name}`);
            skipCount++;
            continue;
        }
        
        // 生成新文件名
        const extension = image.name.split('.').pop();
        const index = String(startIndex + i).padStart(3, '0');
        const newName = pattern.replace('{index}', index) + '.' + extension;
        
        try {
            await plugin.renameImage(image.path, newName);
            console.log(`✅ ${image.name} → ${newName}`);
            successCount++;
        } catch (error) {
            console.error(`❌ ${image.name} 重命名失败:`, error);
        }
        
        // 每处理10个文件让出控制权
        if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    
    new Notice(`重命名完成: ${successCount} 成功, ${skipCount} 跳过`);
}

// 使用示例：将 assets/screenshots 中的图片重命名为 screenshot_001.png, screenshot_002.png...
batchRenameImages('assets/screenshots', 'screenshot_{index}');
```

---

### 示例 5: 智能重命名（基于引用笔记）

**目标:** 根据引用图片的笔记名称来重命名图片

```typescript
/**
 * 智能重命名图片
 * 根据引用该图片的笔记名称生成新文件名
 */
async function smartRenameImages() {
    const plugin = app.plugins.plugins['imagemgr'];
    const images = await plugin.scanImages();
    
    for (const image of images) {
        // 获取引用信息
        const references = await plugin.referenceManager.findAllReferences(image.path);
        
        if (references.length === 0) {
            console.log(`⏭️ ${image.name} - 未被引用，跳过`);
            continue;
        }
        
        // 使用第一个引用的笔记名称
        const firstRef = references[0];
        const noteName = firstRef.filePath.replace('.md', '');
        const extension = image.name.split('.').pop();
        
        // 生成新名称：笔记名_序号.扩展名
        const newName = `${noteName}_001.${extension}`;
        
        try {
            await plugin.renameImage(image.path, newName);
            console.log(`✅ ${image.name} → ${newName}`);
        } catch (error) {
            console.error(`❌ ${image.name} 失败:`, error);
        }
    }
}

smartRenameImages();
```

---

### 示例 6: 查找并删除未使用图片

**目标:** 找出未被任何笔记引用的图片，并安全删除

```typescript
/**
 * 清理未使用的图片
 * @param dryRun 是否为试运行模式（只显示不删除）
 */
async function cleanupUnusedImages(dryRun: boolean = true) {
    const plugin = app.plugins.plugins['imagemgr'];
    
    console.log('🔍 扫描所有图片...');
    const images = await plugin.scanImages();
    
    const unusedImages: typeof images = [];
    
    console.log('🔍 检查引用关系...');
    for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const references = await plugin.referenceManager.findAllReferences(image.path);
        
        if (references.length === 0) {
            unusedImages.push(image);
        }
        
        // 显示进度
        if (i % 10 === 0) {
            console.log(`  进度: ${i + 1}/${images.length}`);
        }
    }
    
    console.log(`\n📊 发现 ${unusedImages.length} 张未使用的图片：`);
    let totalSize = 0;
    
    for (const image of unusedImages) {
        console.log(`  - ${image.name} (${formatSize(image.size)})`);
        totalSize += image.size;
    }
    
    console.log(`\n💾 可回收空间: ${formatSize(totalSize)}`);
    
    if (dryRun) {
        console.log('\n⚠️ 试运行模式，未执行删除操作');
        console.log('   将 dryRun 设为 false 以实际删除');
        return;
    }
    
    // 过滤掉锁定的文件
    const deletable = unusedImages.filter(img => 
        !plugin.lockListManager.isLocked(img.path)
    );
    
    if (deletable.length === 0) {
        console.log('\n⚠️ 所有未使用图片都已被锁定');
        return;
    }
    
    // 确认删除
    const confirmed = confirm(
        `确定要删除 ${deletable.length} 张未使用的图片吗？\n` +
        `将移至回收站，可恢复。`
    );
    
    if (!confirmed) {
        console.log('❌ 用户取消操作');
        return;
    }
    
    // 执行删除
    let deletedCount = 0;
    for (const image of deletable) {
        try {
            await plugin.deleteImage(image.path, false); // false = 移至回收站
            console.log(`🗑️ 已删除: ${image.name}`);
            deletedCount++;
        } catch (error) {
            console.error(`❌ 删除失败: ${image.name}`, error);
        }
    }
    
    new Notice(`🎉 清理完成！已删除 ${deletedCount} 张图片`);
}

// 试运行（只查看不删除）
cleanupUnusedImages(true);

// 实际删除（取消注释以执行）
// cleanupUnusedImages(false);
```

---

### 示例 7: 导出图片清单

**目标:** 生成包含所有图片信息的 Markdown 报告

```typescript
/**
 * 生成图片清单报告
 * @param outputPath 输出文件路径
 */
async function generateImageInventory(outputPath: string = '图片清单.md') {
    const plugin = app.plugins.plugins['imagemgr'];
    
    console.log('📊 正在收集数据...');
    const images = await plugin.scanImages();
    
    let report = '# 📷 图片资产清单\n\n';
    report += `> 生成时间: ${new Date().toLocaleString()}\n\n`;
    report += `## 📈 统计概览\n\n`;
    report += `- **图片总数**: ${images.length} 张\n`;
    report += `- **总大小**: ${formatSize(images.reduce((sum, img) => sum + img.size, 0))}\n`;
    
    // 按类型统计
    const typeStats: Record<string, number> = {};
    for (const img of images) {
        const ext = img.name.split('.').pop()?.toLowerCase() || 'unknown';
        typeStats[ext] = (typeStats[ext] || 0) + 1;
    }
    
    report += `- **类型分布**: \n`;
    for (const [type, count] of Object.entries(typeStats)) {
        report += `  - ${type.toUpperCase()}: ${count} 张\n`;
    }
    
    // 详细列表
    report += `\n## 📋 详细列表\n\n`;
    report += '| 文件名 | 大小 | 尺寸 | 引用数 | 路径 |\n';
    report += '|--------|------|------|--------|------|\n';
    
    for (const image of images) {
        const refs = await plugin.referenceManager.findAllReferences(image.path);
        const dimensions = image.width && image.height 
            ? `${image.width}x${image.height}` 
            : '-';
        
        report += `| ${image.name} | ${formatSize(image.size)} | ${dimensions} | ${refs.length} | \`${image.path}\` |\n`;
    }
    
    // 未使用图片列表
    const unusedImages = [];
    for (const image of images) {
        const refs = await plugin.referenceManager.findAllReferences(image.path);
        if (refs.length === 0) {
            unusedImages.push(image);
        }
    }
    
    if (unusedImages.length > 0) {
        report += `\n## ⚠️ 未使用图片 (${unusedImages.length} 张)\n\n`;
        for (const img of unusedImages) {
            report += `- ${img.name} (${formatSize(img.size)})\n`;
        }
    }
    
    // 保存报告
    await app.vault.create(outputPath, report);
    console.log(`✅ 报告已保存: ${outputPath}`);
    new Notice('图片清单已生成');
}

generateImageInventory();
```

---

### 示例 7: 检测和修复空链接

**目标:** 检测笔记中指向不存在文件的图片链接，并批量修复

```typescript
/**
 * 检测空链接图片
 * 返回所有指向不存在文件的图片链接
 */
async function detectBrokenLinks() {
    const plugin = app.plugins.plugins['imagemgr'];
    
    // 扫描所有笔记中的图片链接
    const brokenLinks = await plugin.detectBrokenImageLinks();
    
    if (brokenLinks.length === 0) {
        new Notice('🎉 没有发现空链接的图片！');
        return [];
    }
    
    // 分类统计
    const localErrors = brokenLinks.filter(link => !link.isRemoteError);
    const remoteErrors = brokenLinks.filter(link => link.isRemoteError);
    
    console.log(`发现 ${brokenLinks.length} 个空链接：`);
    console.log(`  - 本地链接失效: ${localErrors.length} 个`);
    console.log(`  - 网络链接失效: ${remoteErrors.length} 个`);
    
    // 显示详细信息
    for (const link of brokenLinks.slice(0, 10)) {
        const type = link.isRemoteError ? '🌐' : '📄';
        console.log(`${type} ${link.filePath}:${link.lineNumber} - ${link.linkText}`);
    }
    
    if (brokenLinks.length > 10) {
        console.log(`... 还有 ${brokenLinks.length - 10} 个链接`);
    }
    
    return brokenLinks;
}

/**
 * 打开空链接检测界面
 * 使用插件内置的模态框展示空链接
 */
function openBrokenLinksModal() {
    const plugin = app.plugins.plugins['imagemgr'];
    
    // 打开空链接检测模态框
    plugin.openBrokenLinksModal();
}

/**
 * 从黑名单中移除域名并重新尝试缓存
 * @param url 网络图片URL
 */
async function retryCacheNetworkImage(url: string) {
    const plugin = app.plugins.plugins['imagemgr'];
    
    try {
        // 1. 尝试验证图片链接是否可用
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            mode: 'no-cors'
        });
        
        clearTimeout(timeoutId);
        
        new Notice('✅ 图片链接可用，下次扫描时将自动缓存（黑名单由网络图片系统自动维护）');
        return true;
    } catch (error) {
        new Notice('❌ 图片链接仍然不可用：' + error.message);
        return false;
    }
}

// 运行检测
detectBrokenLinks();

// 或者打开可视化界面
// openBrokenLinksModal();
```

**功能说明:**

1. **本地链接检测** - 检测笔记中引用不存在的本地图片文件
2. **网络链接检测** - 检测失效的网络图片链接（404、DNS错误等）
3. **可视化界面** - 双标签页设计，清晰区分本地和网络链接
4. **一键跳转** - 点击行号直接跳转到对应笔记位置
5. **重新缓存** - 网络链接支持🔄按钮重新尝试下载

**使用场景:**
- 定期清理笔记中的失效图片链接
- 批量修复因文件移动导致的链接失效
- 重新尝试下载之前缓存失败的网络图片

---

## 高级技巧

### 示例 8: 自定义事件监听

**目标:** 监听图片操作事件并自动记录

```typescript
/**
 * 设置事件监听器
 */
function setupEventListeners() {
    const plugin = app.plugins.plugins['imagemgr'];
    
    // 监听图片重命名
    plugin.on('image-renamed', async (data) => {
        console.log(`📝 图片重命名: ${data.oldPath} → ${data.newPath}`);
        
        // 记录到日志
        await plugin.logger.info(
            'IMAGE_RENAME',
            `重命名: ${data.oldPath} → ${data.newPath}`,
            data
        );
    });
    
    // 监听图片删除
    plugin.on('image-deleted', async (data) => {
        const action = data.permanent ? '永久删除' : '移至回收站';
        console.log(`🗑️ ${action}: ${data.path}`);
        
        await plugin.logger.info(
            'IMAGE_DELETE',
            `${action}: ${data.path}`,
            data
        );
    });
    
    // 监听扫描完成
    plugin.on('image-scanned', (data) => {
        new Notice(`✅ 扫描完成: ${data.count} 张图片`);
    });
    
    console.log('✅ 事件监听器已设置');
}

// 在插件加载时调用
setupEventListeners();
```

---

### 示例 9: 批量锁定重要图片

**目标:** 根据规则自动锁定重要图片

```typescript
/**
 * 批量锁定图片
 * @param patterns 文件名匹配模式数组
 */
async function batchLockImages(patterns: string[]) {
    const plugin = app.plugins.plugins['imagemgr'];
    const images = await plugin.scanImages();
    
    let lockedCount = 0;
    
    for (const image of images) {
        // 检查是否匹配任一模式
        const shouldLock = patterns.some(pattern => {
            const regex = new RegExp(pattern.replace('*', '.*'));
            return regex.test(image.name);
        });
        
        if (shouldLock) {
            // 计算 MD5（如果还没有）
            let md5 = image.md5;
            if (!md5) {
                // 这里简化处理，实际应该调用 MD5 计算
                md5 = 'calculated-md5-hash';
            }
            
            await plugin.lockListManager.addToLockList(image.path, md5);
            console.log(`🔒 已锁定: ${image.name}`);
            lockedCount++;
        }
    }
    
    new Notice(`已锁定 ${lockedCount} 张图片`);
}

// 使用示例：锁定所有 logo 和 banner 图片
batchLockImages(['*logo*', '*banner*', '*important*']);
```

---

### 示例 10: 图片引用分析

**目标:** 分析图片引用情况，找出高频使用图片

```typescript
/**
 * 分析图片引用情况
 */
async function analyzeImageReferences() {
    const plugin = app.plugins.plugins['imagemgr'];
    const images = await plugin.scanImages();
    
    // 收集引用数据
    const analysis = [];
    
    for (const image of images) {
        const refs = await plugin.referenceManager.findAllReferences(image.path);
        
        analysis.push({
            name: image.name,
            path: image.path,
            size: image.size,
            refCount: refs.length,
            refs: refs
        });
    }
    
    // 按引用数排序
    analysis.sort((a, b) => b.refCount - a.refCount);
    
    console.log('📊 图片引用分析结果\n');
    console.log('=== 高频使用图片（Top 10）===');
    analysis.slice(0, 10).forEach((item, index) => {
        console.log(`${index + 1}. ${item.name}`);
        console.log(`   引用数: ${item.refCount}`);
        console.log(`   大小: ${formatSize(item.size)}`);
        console.log('');
    });
    
    console.log('=== 未被使用的图片 ===');
    const unused = analysis.filter(item => item.refCount === 0);
    console.log(`共 ${unused.length} 张`);
    unused.forEach(item => {
        console.log(`  - ${item.name} (${formatSize(item.size)})`);
    });
}

analyzeImageReferences();
```

---

## 完整项目

### 项目: 图片管理助手

一个完整的脚本，整合多种图片管理功能：

```typescript
/**
 * ImageMgr 图片管理助手
 * 整合多种常用图片管理功能
 */
class ImageManagerHelper {
    private plugin: any;
    
    constructor() {
        this.plugin = app.plugins.plugins['imagemgr'];
        if (!this.plugin) {
            throw new Error('ImageMgr 插件未找到');
        }
    }
    
    /**
     * 显示主菜单
     */
    async showMenu() {
        const options = [
            '1. 列出所有图片',
            '2. 查找未使用图片',
            '3. 批量重命名',
            '4. 生成图片报告',
            '5. 清理未使用图片',
            '0. 退出'
        ];
        
        const choice = await this.promptSelection(
            '请选择操作：\n' + options.join('\n')
        );
        
        switch (choice) {
            case '1': await this.listImages(); break;
            case '2': await this.findUnused(); break;
            case '3': await this.batchRename(); break;
            case '4': await this.generateReport(); break;
            case '5': await this.cleanup(); break;
            case '0': return;
            default: 
                new Notice('无效选择');
                await this.showMenu();
        }
    }
    
    /**
     * 列出所有图片
     */
    async listImages() {
        const images = await this.plugin.scanImages();
        console.log(`\n📷 共 ${images.length} 张图片\n`);
        
        images.forEach((img, i) => {
            console.log(`${i + 1}. ${img.name} (${formatSize(img.size)})`);
        });
        
        await this.showMenu();
    }
    
    /**
     * 查找未使用图片
     */
    async findUnused() {
        new Notice('🔍 正在分析...');
        
        const images = await this.plugin.scanImages();
        const unused = [];
        
        for (const image of images) {
            const refs = await this.plugin.referenceManager.findAllReferences(image.path);
            if (refs.length === 0) {
                unused.push(image);
            }
        }
        
        console.log(`\n⚠️ 发现 ${unused.length} 张未使用图片：\n`);
        unused.forEach(img => {
            console.log(`  - ${img.name} (${formatSize(img.size)})`);
        });
        
        await this.showMenu();
    }
    
    /**
     * 批量重命名
     */
    async batchRename() {
        const folder = await this.promptInput('请输入文件夹路径（留空为全部）：');
        const pattern = await this.promptInput('请输入命名模式（如 screenshot_{index}）：');
        
        if (!pattern) {
            new Notice('命名模式不能为空');
            return;
        }
        
        const images = await this.plugin.scanImages(folder || undefined);
        let count = 0;
        
        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            if (this.plugin.lockListManager.isLocked(img.path)) continue;
            
            const ext = img.name.split('.').pop();
            const newName = pattern.replace('{index}', String(i + 1).padStart(3, '0')) + '.' + ext;
            
            try {
                await this.plugin.renameImage(img.path, newName);
                count++;
            } catch (e) {
                console.error(`重命名失败: ${img.name}`);
            }
        }
        
        new Notice(`✅ 已重命名 ${count} 张图片`);
        await this.showMenu();
    }
    
    /**
     * 生成报告
     */
    async generateReport() {
        new Notice('📊 正在生成报告...');
        
        const images = await this.plugin.scanImages();
        let report = '# 图片管理报告\n\n';
        report += `生成时间: ${new Date().toLocaleString()}\n\n`;
        report += `## 概览\n\n`;
        report += `- 图片总数: ${images.length}\n`;
        report += `- 总大小: ${formatSize(images.reduce((s, i) => s + i.size, 0))}\n\n`;
        report += '## 图片列表\n\n';
        report += '| 名称 | 大小 | 引用数 |\n';
        report += '|------|------|--------|\n';
        
        for (const img of images) {
            const refs = await this.plugin.referenceManager.findAllReferences(img.path);
            report += `| ${img.name} | ${formatSize(img.size)} | ${refs.length} |\n`;
        }
        
        const path = '图片管理报告.md';
        await app.vault.create(path, report);
        new Notice(`✅ 报告已保存: ${path}`);
        
        await this.showMenu();
    }
    
    /**
     * 清理未使用图片
     */
    async cleanup() {
        const confirmed = confirm('确定要删除未使用的图片吗？将移至回收站。');
        if (!confirmed) return;
        
        new Notice('🧹 正在清理...');
        
        const images = await this.plugin.scanImages();
        let count = 0;
        
        for (const image of images) {
            const refs = await this.plugin.referenceManager.findAllReferences(image.path);
            if (refs.length === 0 && !this.plugin.lockListManager.isLocked(image.path)) {
                try {
                    await this.plugin.deleteImage(image.path, false);
                    count++;
                } catch (e) {
                    console.error(`删除失败: ${image.name}`);
                }
            }
        }
        
        new Notice(`🎉 已清理 ${count} 张图片`);
        await this.showMenu();
    }
    
    /**
     * 提示输入
     */
    async promptInput(message: string): Promise<string> {
        // 简化实现，实际可以使用 Obsidian 的 Modal
        return prompt(message) || '';
    }
    
    /**
     * 提示选择
     */
    async promptSelection(message: string): Promise<string> {
        return prompt(message) || '';
    }
}

// 启动助手
const helper = new ImageManagerHelper();
helper.showMenu();
```

---

## 故障排除

### 常见问题

#### 1. 插件实例获取失败

```typescript
const plugin = app.plugins.plugins['imagemgr'];
if (!plugin) {
    console.error('❌ ImageMgr 插件未启用');
    console.log('请检查：');
    console.log('1. 插件是否已安装');
    console.log('2. 插件是否已在设置中启用');
    return;
}
```

#### 2. 扫描结果为空

```typescript
// 检查文件夹是否存在
const folder = app.vault.getAbstractFileByPath('assets/images');
if (!folder) {
    console.error('❌ 文件夹不存在');
    return;
}

// 扫描
const images = await plugin.scanImages('assets/images');
if (images.length === 0) {
    console.log('⚠️ 文件夹中没有图片文件');
    console.log('支持的格式: PNG, JPG, GIF, WEBP, SVG, BMP');
}
```

#### 3. 重命名失败

```typescript
try {
    // 检查是否被锁定
    if (plugin.lockListManager.isLocked(imagePath)) {
        console.error('❌ 文件已被锁定');
        return;
    }
    
    // 检查目标文件是否已存在
    const existing = app.vault.getAbstractFileByPath(newPath);
    if (existing) {
        console.error('❌ 目标文件已存在');
        return;
    }
    
    await plugin.renameImage(oldPath, newPath);
} catch (error) {
    console.error('❌ 重命名失败:', error.message);
}
```

---

## 总结

通过本教程，您已经学习了：

- ✅ 基础 API 使用方法
- ✅ 批量操作技巧
- ✅ 事件监听和处理
- ✅ 实际项目应用

### 下一步

1. 探索更多 API 功能
2. 创建自定义脚本
3. 贡献代码到项目

### 资源

- [完整 API 文档](./API_DOCUMENTATION.md)
- [GitHub 仓库](https://github.com/Coeris/Obsidian-ImageMgr)
- [问题反馈](https://github.com/Coeris/Obsidian-ImageMgr/issues)

---

**Happy Coding! 🎉**
