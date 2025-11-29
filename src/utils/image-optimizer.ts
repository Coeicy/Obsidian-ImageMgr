import { Notice } from 'obsidian';

/**
 * 图片编辑选项
 */
export interface EditOptions {
	rotate?: number; // 旋转角度 (90, 180, 270)
	flip?: boolean; // 水平翻转
	flop?: boolean; // 垂直翻转
	resize?: {
		width?: number;
		height?: number;
	};
}

/**
 * 将ArrayBuffer转换为Blob URL
 */
function arrayBufferToImage(arrayBuffer: ArrayBuffer): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const blob = new Blob([arrayBuffer]);
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = reject;
		img.src = url;
	});
}

/**
 * 将Canvas转换为Blob
 */
function canvasToBlob(canvas: HTMLCanvasElement, format: string, quality: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => blob ? resolve(blob) : reject(new Error('转换失败')),
			`image/${format}`,
			quality / 100
		);
	});
}

/**
 * 编辑图片（旋转、翻转等）
 */
export async function editImage(
	input: Buffer | ArrayBuffer,
	options: EditOptions
): Promise<ArrayBuffer> {
	try {
		const img = await arrayBufferToImage(input instanceof Buffer ? input.buffer : input);
		const canvas = document.createElement('canvas');
		canvas.width = img.width;
		canvas.height = img.height;
		
		// 计算新画布尺寸
		let newWidth = img.width;
		let newHeight = img.height;
		
		// 如果旋转 90 或 270 度，交换宽高
		if (options.rotate === 90 || options.rotate === 270) {
			newWidth = img.height;
			newHeight = img.width;
		}
		
		// 如果有 resize，覆盖尺寸
		if (options.resize) {
			newWidth = options.resize.width || newWidth;
			newHeight = options.resize.height || newHeight;
		}
		
		canvas.width = newWidth;
		canvas.height = newHeight;
		
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('无法创建Canvas上下文');
		}
		
		// 移动原点到画布中心
		ctx.translate(newWidth / 2, newHeight / 2);
		
		// 1. 旋转
		if (options.rotate) {
			ctx.rotate((options.rotate * Math.PI) / 180);
		}
		
		// 2. 翻转
		if (options.flip || options.flop) {
			const scaleX = options.flip ? -1 : 1;
			const scaleY = options.flop ? -1 : 1;
			ctx.scale(scaleX, scaleY);
		}
		
		// 3. 绘制图片（居中）
		// 注意：绘制时使用原始图片的宽高，位置为 (-width/2, -height/2)
		ctx.drawImage(img, -img.width / 2, -img.height / 2);
		
		// 转换为Blob
		const blob = await canvasToBlob(canvas, 'png', 100);
		const arrayBuffer = await blob.arrayBuffer();
		return arrayBuffer;
	} catch (error) {
		// 工具函数，无法访问 plugin，错误已抛出，由调用者处理
		new Notice('图片编辑失败');
		throw error;
	}
}

