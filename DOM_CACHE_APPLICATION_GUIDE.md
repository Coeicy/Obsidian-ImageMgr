# DOM 缓存应用指南

## 概述

`DOMCache` 和 `DOMReferences` 工具类已创建在 `src/utils/dom-cache.ts` 中。本文档展示如何在组件中应用这些工具类。

## 工具类说明

### DOMCache
适用于需要重复查询同一DOM元素的场景。

```typescript
import { DOMCache } from '../utils/dom-cache';

// 创建缓存实例
const domCache = new DOMCache();

// 使用缓存获取元素
const container = domCache.get('image-container', () => 
    document.getElementById('image-container')
);
```

### DOMReferences
适用于需要存储组件内部元素引用的场景。

```typescript
import { DOMReferences } from '../utils/dom-cache';

// 创建引用容器
const domRefs = new DOMReferences();

// 存储元素引用
domRefs.set('searchInput', searchInputElement);

// 获取元素引用
const searchInput = domRefs.get('searchInput');
```

## 应用示例

### 示例1: image-manager-view.ts

```typescript
export class ImageManagerView extends ItemView {
    private domCache: DOMCache = new DOMCache();
    
    private renderToolbar() {
        // 使用缓存获取工具栏容器
        const toolbar = this.domCache.get('toolbar', () =>
            this.contentEl.querySelector('.toolbar')
        );
        
        if (!toolbar) return;
        
        // 使用缓存获取搜索框
        const searchInput = this.domCache.get('search-input', () =>
            toolbar.querySelector('#search-input')
        ) as HTMLInputElement;
        
        // 使用缓存获取清除按钮
        const clearBtn = this.domCache.get('clear-button', () =>
            toolbar.querySelector('#clear-button')
        );
    }
    
    onClose() {
        // 关闭时清理缓存
        this.domCache.clear();
        super.onClose();
    }
}
```

### 示例2: image-detail-modal.ts

```typescript
export class ImageDetailModal extends Modal {
    private domRefs: DOMReferences = new DOMReferences();
    
    onOpen() {
        const { contentEl } = this;
        
        // 存储关键元素引用
        this.domRefs.set('title', contentEl.createEl('h2'));
        this.domRefs.set('image-container', contentEl.createDiv('image-container'));
        this.domRefs.set('info-panel', contentEl.createDiv('info-panel'));
    }
    
    private updateImageInfo() {
        // 获取缓存的元素引用
        const title = this.domRefs.get('title') as HTMLElement;
        const infoPanel = this.domRefs.get('info-panel') as HTMLElement;
        
        if (title && infoPanel) {
            title.textContent = this.image.name;
            infoPanel.innerHTML = `<p>${this.generateInfoHtml()}</p>`;
        }
    }
    
    onClose() {
        this.domRefs.clear();
        super.onClose();
    }
}
```

### 示例3: settings-tab.ts

```typescript
export class ImageManagementSettingTab extends PluginSettingTab {
    private domCache: DOMCache = new DOMCache();
    
    display() {
        const { containerEl } = this;
        
        // 使用缓存获取设置容器
        const settingsContainer = this.domCache.get('settings', () =>
            containerEl.querySelector('.settings-container')
        );
        
        if (!settingsContainer) {
            return;
        }
        
        // 渲染各个设置选项
        this.renderGeneralSettings(settingsContainer);
        this.renderDisplaySettings(settingsContainer);
        this.renderAdvancedSettings(settingsContainer);
    }
    
    private renderGeneralSettings(container: HTMLElement) {
        // 使用缓存获取通用设置部分
        const generalSection = this.domCache.get('general-section', () =>
            container.querySelector('#general-section')
        );
        
        if (generalSection) {
            // 更新通用设置
            this.updateGeneralSettings(generalSection);
        }
    }
}
```

## 最佳实践

### 1. 选择合适的工具

| 场景 | 推荐工具 | 原因 |
|--------|-----------|------|
| 重复查询同一元素 | DOMCache | 自动验证元素是否存在 |
| 存储组件内部引用 | DOMReferences | 手动控制，适合生命周期管理 |
| 短暂缓存 | DOMCache (ttl) | 自动过期清理 |

### 2. 缓存清理

```typescript
// 在组件卸载时清理
onClose() {
    this.domCache.clear();
    this.domRefs.clear();
}

// 按需清理特定前缀的缓存
this.domCache.deleteByPrefix('image-');
```

### 3. 缓存失效检测

```typescript
// DOMCache 会自动检测元素是否仍在 DOM 中
const element = domCache.get('my-element', () => 
    document.getElementById('my-element')
);

// 如果元素已被移除，get() 会重新查询
```

## 性能优化效果

### 优化前
```typescript
// 每次都查询 DOM
function handleClick() {
    const btn1 = document.getElementById('btn1');
    const btn2 = document.getElementById('btn2');
    const btn3 = document.getElementById('btn3');
    // ... 重复查询导致性能下降
}
```

### 优化后
```typescript
// 使用缓存
function handleClick() {
    const btn1 = domCache.get('btn1', () => 
        document.getElementById('btn1')
    );
    const btn2 = domCache.get('btn2', () => 
        document.getElementById('btn2')
    );
    const btn3 = domCache.get('btn3', () => 
        document.getElementById('btn3')
    );
    // ... 缓存命中，性能提升
}
```

## 实施计划

### 阶段1: 高优先级组件
- [ ] `src/ui/image-manager-view.ts` - 主视图（79处查询）
- [ ] `src/ui/image-detail-modal.ts` - 详情页
- [ ] `src/ui/settings-tab.ts` - 设置页

### 阶段2: 中优先级组件
- [ ] `src/ui/broken-links-modal.ts` - 空链接检测
- [ ] `src/ui/duplicate-detection-modal.ts` - 重复检测
- [ ] `src/ui/group-modal.ts` - 分组模态框

### 阶段3: 其他组件
- [ ] 其他模态框和工具类
- [ ] 性能测试和验证

## 注意事项

1. **内存管理**
   - 及时清理缓存，避免内存泄漏
   - 在组件卸载时调用 `clear()`

2. **元素生命周期**
   - DOMCache 会自动检测元素是否在 DOM 中
   - 如果元素被移除，缓存会自动失效

3. **线程安全**
   - DOMCache 和 DOMReferences 都是线程安全的
   - 可以在多个异步操作中同时使用

4. **调试建议**
   - 使用 `domCache.size()` 监控缓存大小
   - 定期调用 `domCache.clean()` 清理失效缓存

---

**文档版本：** v1.0.0  
**最后更新：** 2026-02-03
