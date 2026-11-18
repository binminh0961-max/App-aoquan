// src/utils/imagePixelReader.ts
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import { Buffer } from 'buffer';
import {
  analyzeRgbaPatch,
  ColorMatchResult,
  LightingMode,
} from '../services/ColorEngine';
import { FashionColor } from '../constants/fashionColors';

export interface DecodedImageData {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface ImageInfo {
  uri: string; // URI của ảnh sau khi manipulate (đã chuẩn hóa EXIF và resize 500px)
  width: number; // Chiều rộng gốc chuẩn
  height: number; // Chiều cao gốc chuẩn
  aspectRatio: number;
}

let activeImage: DecodedImageData | null = null;
let activeImageUri: string | null = null;
let activeManipulatedUri: string | null = null;

/**
 * Tải ảnh từ URI, resize về 500px chiều rộng và giải mã mảng RGBA vào RAM
 * Trả về URI ảnh đã chuẩn hóa (manipulatedResult.uri) cùng width/height chuẩn
 */
export async function loadAndDecodeImage(imageUri: string): Promise<ImageInfo> {
  // Nếu ảnh này đã được giải mã và đang lưu trong RAM, tái sử dụng luôn
  if (activeImage && activeImageUri === imageUri && activeManipulatedUri) {
    return {
      uri: activeManipulatedUri,
      width: activeImage.width,
      height: activeImage.height,
      aspectRatio: activeImage.width / activeImage.height,
    };
  }

  // Giải phóng ảnh cũ trước khi nạp ảnh mới để tiết kiệm RAM
  releaseImageBuffer();

  try {
    // 1. Dùng expo-image-manipulator nén và resize ảnh về chiều rộng 500px chuẩn
    // Thao tác này cũng đồng thời tự động chuẩn hóa xoay ảnh theo EXIF orientation
    const manipResult = await manipulateAsync(
      imageUri,
      [{ resize: { width: 500 } }],
      {
        format: SaveFormat.JPEG,
        compress: 0.9,
        base64: true,
      }
    );

    if (!manipResult.base64) {
      throw new Error('Không thể trích xuất chuỗi base64 từ hình ảnh');
    }

    // 2. Chuyển base64 sang Buffer nhị phân
    const buffer = Buffer.from(manipResult.base64, 'base64');

    // 3. Giải mã JPEG thuần JavaScript sang mảng byte RGBA (Uint8Array)
    const decoded = jpeg.decode(buffer, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: true,
    } as any);

    if (!decoded || !decoded.data || decoded.width <= 0 || decoded.height <= 0) {
      throw new Error('Giải mã ảnh thất bại');
    }

    activeImage = {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data as Uint8Array,
    };
    activeImageUri = imageUri;
    activeManipulatedUri = manipResult.uri;

    return {
      uri: manipResult.uri,
      width: decoded.width,
      height: decoded.height,
      aspectRatio: decoded.width / decoded.height,
    };
  } catch (error) {
    console.error('[imagePixelReader] Lỗi khi giải mã ảnh:', error);
    throw error;
  }
}

/**
 * Lấy mẫu màu tại tọa độ chuẩn hóa [0..1] với pixel tâm thật và lưới lọc nhiễu 11x11
 */
export function sampleColorAtNormalizedPoint(
  normX: number,
  normY: number,
  lightingMode: LightingMode = 'auto'
): ColorMatchResult<FashionColor> | null {
  if (!activeImage) {
    return null;
  }

  const { width, height, data } = activeImage;

  // Giới hạn tọa độ chuẩn hóa trong khoảng [0, 1]
  const clampedNormX = Math.max(0, Math.min(1, normX));
  const clampedNormY = Math.max(0, Math.min(1, normY));

  // Quy đổi ra tọa độ pixel trên buffer ảnh
  const px = Math.round(clampedNormX * (width - 1));
  const py = Math.round(clampedNormY * (height - 1));

  // Trích xuất lưới 11x11 pixel (121 pixels = 484 bytes RGBA, tâm ngắm tại bán kính 5)
  const radius = 5;
  const patchData = new Uint8Array(121 * 4);
  let patchOffset = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    const curY = Math.max(0, Math.min(height - 1, py + dy));
    for (let dx = -radius; dx <= radius; dx++) {
      const curX = Math.max(0, Math.min(width - 1, px + dx));
      const pixelIndex = (curY * width + curX) * 4;

      patchData[patchOffset] = data[pixelIndex];
      patchData[patchOffset + 1] = data[pixelIndex + 1];
      patchData[patchOffset + 2] = data[pixelIndex + 2];
      patchData[patchOffset + 3] = data[pixelIndex + 3];
      patchOffset += 4;
    }
  }

  // Dùng chung lõi phân tích analyzeRgbaPatch của ColorEngine
  return analyzeRgbaPatch<FashionColor>(patchData, 121, lightingMode);
}

/**
 * Giải phóng mảng byte hình ảnh khỏi bộ nhớ RAM
 */
export function releaseImageBuffer(): void {
  activeImage = null;
  activeImageUri = null;
  activeManipulatedUri = null;
}

/**
 * Kiểm tra xem ảnh đã được giải mã sẵn sàng hay chưa
 */
export function isImageLoaded(): boolean {
  return activeImage !== null;
}

/**
 * Lấy kích thước và tỷ lệ ảnh hiện tại trong buffer
 */
export function getActiveImageInfo(): ImageInfo | null {
  if (!activeImage || !activeManipulatedUri) return null;
  return {
    uri: activeManipulatedUri,
    width: activeImage.width,
    height: activeImage.height,
    aspectRatio: activeImage.width / activeImage.height,
  };
}
