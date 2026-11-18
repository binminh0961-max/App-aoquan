import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  useFrameProcessor,
  runAtTargetFps,
} from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { Worklets, useSharedValue } from 'react-native-worklets-core';
import {
  analyzeRgbColor,
  ColorMatchResult,
  LightingMode,
} from '../services/ColorEngine';
import {
  FashionColor,
  FASHION_COLORS,
} from '../constants/fashionColors';

export interface UseCameraColorSamplerOptions {
  lightingMode: LightingMode;
  initialColor?: FashionColor;
}

export function useCameraColorSampler({
  lightingMode = 'auto',
  initialColor = FASHION_COLORS[0],
}: UseCameraColorSamplerOptions) {
  const [isFrozen, setIsFrozen] = useState(false);
  const [isRgbSwapped, setIsRgbSwapped] = useState(false);

  const [colorResult, setColorResult] = useState<ColorMatchResult<FashionColor>>({
    rawHex: initialColor.hex,
    trimmedHex: initialColor.hex,
    calibratedRgb: { r: 255, g: 255, b: 255 },
    calibratedHex: initialColor.hex,
    lab: initialColor.lab,
    matchedColor: initialColor,
    deltaE: 0,
    nearbyColors: FASHION_COLORS.slice(1, 4),
  });

  const isFrozenRef = useRef(false);
  const lightingModeRef = useRef<LightingMode>(lightingMode);
  const lastRgbRef = useRef<{ r: number; g: number; b: number } | null>(null);

  // Shared values for zero-delay worklet thread control
  const isFrozenShared = useSharedValue(false);
  const isRgbSwappedShared = useSharedValue(false);

  useEffect(() => {
    isFrozenRef.current = isFrozen;
    isFrozenShared.value = isFrozen;
  }, [isFrozen, isFrozenShared]);

  useEffect(() => {
    lightingModeRef.current = lightingMode;
  }, [lightingMode]);

  // Vision Camera Resize Plugin (C++/JSI 16x16 crop & YUV->RGB converter)
  const { resize } = useResizePlugin();

  // JS callback called from Worklet via Worklets.createRunOnJS
  // Only updates state if color difference > 10 to avoid redundant re-renders
  const handleSampledRgb = useMemo(() => {
    return Worklets.createRunOnJS((r: number, g: number, b: number) => {
      if (isFrozenRef.current) return;

      const last = lastRgbRef.current;
      if (
        last &&
        Math.abs(r - last.r) + Math.abs(g - last.g) + Math.abs(b - last.b) <= 10
      ) {
        return;
      }

      lastRgbRef.current = { r, g, b };
      const result = analyzeRgbColor<FashionColor>(r, g, b, lightingModeRef.current);
      if (result) {
        setColorResult(result);
      }
    });
  }, []);

  // Frame Processor chạy ở mức 4 FPS (tiết kiệm pin & giảm nhiệt máy)
  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      runAtTargetFps(4, () => {
        'worklet';
        if (isFrozenShared.value) return;
        if (frame.width < 6 || frame.height < 6) return;

        // Crop vùng 6x6 pixel (36 điểm ảnh) ngay tại tâm khung hình
        const x = Math.max(0, Math.floor(frame.width / 2) - 3);
        const y = Math.max(0, Math.floor(frame.height / 2) - 3);

        const rgbData = resize(frame, {
          crop: { x, y, width: 6, height: 6 },
          scale: { width: 6, height: 6 },
          pixelFormat: 'rgb',
          dataType: 'uint8',
        });

        if (!rgbData || rgbData.length < 108) return;

        const isSwapped = isRgbSwappedShared.value;
        const pixels: { r: number; g: number; b: number; luma: number }[] = [];

        // Đọc 36 pixels và tính Luma chuẩn Rec. 709
        for (let i = 0; i < 36; i++) {
          const offset = i * 3;
          const r = isSwapped ? rgbData[offset + 2] : rgbData[offset];
          const g = rgbData[offset + 1];
          const b = isSwapped ? rgbData[offset] : rgbData[offset + 2];
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          pixels.push({ r, g, b, luma });
        }

        // Sắp xếp theo độ sáng luma
        pixels.sort((p1, p2) => p1.luma - p2.luma);

        // Trimmed Mean: Loại bỏ 6 pixel tối nhất và 6 pixel sáng nhất, lấy 24 pixel giữa
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        const startIndex = 6;
        const endIndex = 30; // 24 pixels ở giữa (indices 6 đến 29)
        for (let i = startIndex; i < endIndex; i++) {
          sumR += pixels[i].r;
          sumG += pixels[i].g;
          sumB += pixels[i].b;
        }

        const count = endIndex - startIndex; // 24
        const avgR = Math.round(sumR / count);
        const avgG = Math.round(sumG / count);
        const avgB = Math.round(sumB / count);

        // Chỉ truyền 3 số nguyên về JS qua JSI bridge
        handleSampledRgb(avgR, avgG, avgB);
      });
    },
    [resize, handleSampledRgb, isFrozenShared, isRgbSwappedShared]
  );

  const freeze = useCallback(() => {
    setIsFrozen(true);
    isFrozenRef.current = true;
    isFrozenShared.value = true;
  }, [isFrozenShared]);

  const unfreeze = useCallback(() => {
    setIsFrozen(false);
    isFrozenRef.current = false;
    isFrozenShared.value = false;
  }, [isFrozenShared]);

  const toggleRgbSwap = useCallback(() => {
    setIsRgbSwapped((prev) => {
      const next = !prev;
      isRgbSwappedShared.value = next;
      if (lastRgbRef.current) {
        const swapped = {
          r: lastRgbRef.current.b,
          g: lastRgbRef.current.g,
          b: lastRgbRef.current.r,
        };
        lastRgbRef.current = swapped;
        const result = analyzeRgbColor<FashionColor>(
          swapped.r,
          swapped.g,
          swapped.b,
          lightingModeRef.current
        );
        if (result) {
          setColorResult(result);
        }
      }
      return next;
    });
  }, [isRgbSwappedShared]);

  const calibrateWithMode = useCallback((mode: LightingMode) => {
    lightingModeRef.current = mode;
    if (lastRgbRef.current) {
      const result = analyzeRgbColor<FashionColor>(
        lastRgbRef.current.r,
        lastRgbRef.current.g,
        lastRgbRef.current.b,
        mode
      );
      if (result) {
        setColorResult(result);
        return result;
      }
    }
    return null;
  }, []);

  return {
    colorResult,
    isFrozen,
    freeze,
    unfreeze,
    frameProcessor,
    calibrateWithMode,
    isRgbSwapped,
    toggleRgbSwap,
  };
}
