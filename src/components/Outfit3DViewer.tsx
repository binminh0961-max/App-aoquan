// src/components/Outfit3DViewer.tsx
/**
 * Outfit3DViewer - Engine 3D Stylized Mannequin mượt mà trên GPU Skia (Skia.PictureRecorder + canvas.drawPath)
 * - Hierarchical Part Z-Sorting chuẩn thắt lưng & hợp nhất cụm Thân trên (`torsoLayerGroup`: `top` + `outerwear`).
 * - Perspective View-Vector Culling chuẩn: dot(N, V) > -0.06 cho bề mặt ngoài & dot(N, V) > 0.05 cho vòng gầm gấu áo (`hemSealRing`).
 * - Smooth Vertex-Averaged Shading + Softbox Studio Wrap Lighting + Seam Sealing (stroke 1.4px Round, alpha = 1.0).
 * - Bóng sàn 2 lớp mềm (bóng tỏa studio + 2 bóng tiếp xúc xoay theo vị trí 2 đế giày thực tế).
 * - Zero-GC 60fps: tái sử dụng 1 SkPathBuilder + 2 SkPaint + 2 ShadowPaint ngoài vòng lặp.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BlurStyle,
  Canvas,
  PaintStyle,
  Picture,
  Skia,
  StrokeCap,
  StrokeJoin,
  type SkMaskFilter,
  type SkPaint,
  type SkPathBuilder,
  type SkPicture,
} from '@shopify/react-native-skia';
import type {
  OutfitSlotId,
  SilhouetteId,
  SilhouetteStyleType,
} from '../types/outfit';
import {
  buildOutfitMesh3D,
  safeNormalize,
  type DetailDot3D,
  type DetailLine3D,
  type DetailLineStyle,
  type MeshMaterialKind,
  type MeshPartId,
  type Quad3D,
} from '../engine/outfitMesh3D';

export type CameraPreset = 'front' | 'threeQuarter' | 'back';

export interface Outfit3DConfig {
  topHex: string;
  bottomHex: string;
  outerHex: string;
  shoesHex: string;
  topShape: SilhouetteId;
  bottomShape: SilhouetteId;
  outerShape: SilhouetteId;
  shoesShape: SilhouetteId;
  isLayering: boolean;
  gender: SilhouetteStyleType;
  activeSlot: OutfitSlotId | null;
  cameraPreset: CameraPreset;
  presetNonce: number;
  autoRotate: boolean;
  zoomDirection: 'in' | 'out' | 'reset';
  zoomNonce: number;
}

export interface Outfit3DViewerProps {
  width?: number;
  height?: number;
  config: Outfit3DConfig;
  onSelectSlot: (slot: OutfitSlotId) => void;
  onResetView?: () => void;
}

// =============================================================
// 1. ÁNH SÁNG STUDIO SOFTBOX MƯỢT & TIỆN ÍCH MÀU
// =============================================================

interface RGB {
  r: number;
  g: number;
  b: number;
}

const L1 = safeNormalize(-0.42, 0.65, 0.63);
const L2 = safeNormalize(0.65, 0.15, 0.5);

const FIXED_MATERIAL_RGB: Record<
  Exclude<
    MeshMaterialKind,
    | OutfitSlotId
    | 'inner_cavity'
    | 'outer_cavity'
    | 'bottom_cavity'
    | 'top_lining'
    | 'outer_lining'
  >,
  RGB
> = {
  sole_white: { r: 245, g: 245, b: 243 }, // #F5F5F3
  sole_dark: { r: 34, g: 37, b: 42 }, // #22252A
  mannequin_leg: { r: 210, g: 204, b: 196 }, // #D2CCC4
  accent_light: { r: 238, g: 239, b: 242 },
  accent_metal: { r: 196, g: 164, b: 116 },
};

/** Tự thích nghi màu nét chi tiết 3D theo độ sáng của nền vải (nổi rõ cả trên Đen Than lẫn Trắng Tinh) */
function resolveDetailLineColor(style: DetailLineStyle, baseLuma: number): string {
  const isDarkFabric = baseLuma < 72; // tương đương l < ~28%
  const isVeryLightFabric = baseLuma > 224;

  switch (style) {
    case 'seamDark':
      return isDarkFabric ? 'rgba(255, 255, 255, 0.24)' : 'rgba(17, 24, 39, 0.30)';
    case 'seamLight':
      if (isDarkFabric) return 'rgba(255, 255, 255, 0.32)';
      if (isVeryLightFabric) return 'rgba(17, 24, 39, 0.16)';
      return 'rgba(255, 255, 255, 0.38)';
    case 'contrastWhite':
      return isVeryLightFabric ? '#D4D0C8' : '#F5F3EE';
    case 'contrastDark':
      return isDarkFabric ? 'rgba(255, 255, 255, 0.34)' : 'rgba(17, 24, 39, 0.56)';
    case 'zipper':
      return isDarkFabric ? '#CBD1D9' : '#4E5766';
    case 'lace':
      return isVeryLightFabric ? '#BFC5CE' : '#F8F8F6';
    default:
      return 'rgba(17, 24, 39, 0.28)';
  }
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map(c => c + c)
          .join('')
      : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 148, g: 148, b: 148 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const HEX_LUT: string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0')
);

/** Hãm dải sáng tối mềm mại: giữ trung thực sắc độ vải, chống cháy trắng & bệt đen */
function softToneCurve(v: number): number {
  if (v <= 0) return 0;
  if (v <= 230) return v;
  return 230 + 23 * (1 - Math.exp(-(v - 230) / 34));
}

function rgbToHexFast(r: number, g: number, b: number): string {
  const cr = softToneCurve(r);
  const cg = softToneCurve(g);
  const cb = softToneCurve(b);
  const ri = cr <= 0 ? 0 : cr >= 255 ? 255 : Math.round(cr);
  const gi = cg <= 0 ? 0 : cg >= 255 ? 255 : Math.round(cg);
  const bi = cb <= 0 ? 0 : cb >= 255 ? 255 : Math.round(cb);
  return '#' + HEX_LUT[ri] + HEX_LUT[gi] + HEX_LUT[bi];
}

function pointInTriangle(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): boolean {
  const d1 = (px - x1) * (y0 - y1) - (x0 - x1) * (py - y1);
  const d2 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d3 = (px - x0) * (y2 - y0) - (x2 - x0) * (py - y0);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function pointInQuad(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number
): boolean {
  return (
    pointInTriangle(px, py, x0, y0, x1, y1, x2, y2) ||
    pointInTriangle(px, py, x0, y0, x2, y2, x3, y3)
  );
}

interface HitQuad {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  slot: OutfitSlotId;
}

interface ProjectedQuadEntry {
  quad: Quad3D;
  avgZ: number;
  snx: number;
  sny: number;
  snz: number;
  vx: number;
  vy: number;
  vz: number;
}

interface SkiaResources {
  pathBuilder: SkPathBuilder;
  fillPaint: SkPaint;
  strokePaint: SkPaint;
  detailStrokePaint: SkPaint;
  detailFillPaint: SkPaint;
  ambientShadowPaint: SkPaint;
  ambientShadowMask: SkMaskFilter;
  contactShadowPaint: SkPaint;
  contactShadowMask: SkMaskFilter;
}

// =============================================================
// 2. COMPONENT CHÍNH: SKIA PICTURE RECORDER 3D RENDERER (60FPS)
// =============================================================

export default function Outfit3DViewer({
  width: propWidth,
  height: propHeight,
  config,
  onSelectSlot,
  onResetView,
}: Outfit3DViewerProps) {
  const {
    gender,
    isLayering,
    outerHex,
    outerShape,
    topHex,
    topShape,
    bottomHex,
    bottomShape,
    shoesHex,
    shoesShape,
    activeSlot,
    cameraPreset,
    presetNonce,
    autoRotate,
    zoomDirection,
    zoomNonce,
  } = config;

  // Khóa kích thước khởi tạo an toàn ngay từ Dimensions.get('window')
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>(() => {
    const win = Dimensions.get('window');
    const fallbackW = Math.max(200, Math.round(win.width * 0.62));
    const fallbackH = Math.max(360, Math.round(win.height * 0.54));
    return {
      w: propWidth && propWidth > 50 ? Math.floor(propWidth) : fallbackW,
      h: propHeight && propHeight > 50 ? Math.floor(propHeight) : fallbackH,
    };
  });

  useEffect(() => {
    if (propWidth && propWidth > 50 && propHeight && propHeight > 50) {
      const nw = Math.floor(propWidth);
      const nh = Math.floor(propHeight);
      setStageSize(prev => (prev.w === nw && prev.h === nh ? prev : { w: nw, h: nh }));
    }
  }, [propWidth, propHeight]);

  const [view, setView] = useState({
    yaw: 0.52,
    pitch: 0.05,
    zoom: 1.0,
    pulse: 0,
  });

  const onSelectRef = useRef(onSelectSlot);
  onSelectRef.current = onSelectSlot;
  const onResetViewRef = useRef(onResetView);
  onResetViewRef.current = onResetView;
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animRef = useRef({
    yaw: 0.52,
    pitch: 0.05,
    zoom: 1.0,
    velYaw: 0,
    velPitch: 0,
    targetYaw: null as number | null,
    targetPitch: null as number | null,
    targetZoom: null as number | null,
    dragging: false,
    autoRotate: false,
    pulseStart: 0,
    pulsing: false,
  });

  const hitQuadsRef = useRef<HitQuad[]>([]);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  // Tái sử dụng tài nguyên Skia ngoài vòng lặp (Zero-GC 60fps)
  const skiaResRef = useRef<SkiaResources | null>(null);
  if (skiaResRef.current === null) {
    const pathBuilder = Skia.PathBuilder.Make();

    const fillPaint = Skia.Paint();
    fillPaint.setStyle(PaintStyle.Fill);
    fillPaint.setAntiAlias(true);
    fillPaint.setAlphaf(1.0);

    // Seam Sealing: stroke 1.4px trùng mã màu shadedHex (độ đục 100%, alpha = 1.0) khít mọi kẽ sub-pixel
    const strokePaint = Skia.Paint();
    strokePaint.setStyle(PaintStyle.Stroke);
    strokePaint.setStrokeWidth(1.4);
    strokePaint.setStrokeJoin(StrokeJoin.Round);
    strokePaint.setStrokeCap(StrokeCap.Round);
    strokePaint.setAntiAlias(true);
    strokePaint.setAlphaf(1.0);

    // Paint tái sử dụng cho 3D Projected Surface Details (đường chỉ, dây rút, cúc, khóa kéo)
    const detailStrokePaint = Skia.Paint();
    detailStrokePaint.setStyle(PaintStyle.Stroke);
    detailStrokePaint.setStrokeJoin(StrokeJoin.Round);
    detailStrokePaint.setStrokeCap(StrokeCap.Round);
    detailStrokePaint.setAntiAlias(true);

    const detailFillPaint = Skia.Paint();
    detailFillPaint.setStyle(PaintStyle.Fill);
    detailFillPaint.setAntiAlias(true);

    // Bóng sàn lớp 1: bóng tỏa mềm rộng dưới sàn studio
    const ambientShadowPaint = Skia.Paint();
    ambientShadowPaint.setStyle(PaintStyle.Fill);
    ambientShadowPaint.setAntiAlias(true);
    ambientShadowPaint.setColor(Skia.Color('rgba(17, 20, 26, 0.15)'));
    const ambientShadowMask = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 17, true);
    ambientShadowPaint.setMaskFilter(ambientShadowMask);

    // Bóng sàn lớp 2: 2 bóng tiếp xúc đậm gọn ngay sát dưới 2 đế giày (xoay theo giày 360°)
    const contactShadowPaint = Skia.Paint();
    contactShadowPaint.setStyle(PaintStyle.Fill);
    contactShadowPaint.setAntiAlias(true);
    contactShadowPaint.setColor(Skia.Color('rgba(15, 18, 24, 0.30)'));
    const contactShadowMask = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 6.5, true);
    contactShadowPaint.setMaskFilter(contactShadowMask);

    skiaResRef.current = {
      pathBuilder,
      fillPaint,
      strokePaint,
      detailStrokePaint,
      detailFillPaint,
      ambientShadowPaint,
      ambientShadowMask,
      contactShadowPaint,
      contactShadowMask,
    };
  }

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (singleTapTimerRef.current !== null) {
        clearTimeout(singleTapTimerRef.current);
      }
      const res = skiaResRef.current;
      if (res) {
        res.pathBuilder.dispose();
        res.fillPaint.dispose();
        res.strokePaint.dispose();
        res.detailStrokePaint.dispose();
        res.detailFillPaint.dispose();
        res.ambientShadowPaint.dispose();
        res.ambientShadowMask.dispose();
        res.contactShadowPaint.dispose();
        res.contactShadowMask.dispose();
        skiaResRef.current = null;
      }
    };
  }, []);

  // 1. Dựng lưới 3D Quad phân tầng bộ phận (chỉ tính lại khi đổi phom dáng / giới tính / layering)
  const mesh = useMemo(
    () =>
      buildOutfitMesh3D(
        gender,
        isLayering,
        outerShape,
        topShape,
        bottomShape,
        shoesShape
      ),
    [gender, isLayering, outerShape, topShape, bottomShape, shoesShape]
  );

  // Gom sẵn DetailLine3D & DetailDot3D theo từng partId (Zero-GC trong vòng lặp render 60fps)
  const detailsByPart = useMemo(() => {
    const makeRecord = <T,>(): Record<MeshPartId, T[]> => ({
      mannequinCore: [],
      bottomCore: [],
      neckCavity: [],
      torsoCore: [],
      outerwearShell: [],
      hoodBack: [],
      leftArm: [],
      rightArm: [],
      leftLeg: [],
      rightLeg: [],
      leftShoe: [],
      rightShoe: [],
    });
    const lines = makeRecord<DetailLine3D>();
    const dots = makeRecord<DetailDot3D>();
    for (let i = 0; i < mesh.detailLines.length; i++) {
      const l = mesh.detailLines[i];
      lines[l.partId].push(l);
    }
    for (let i = 0; i < mesh.detailDots.length; i++) {
      const d = mesh.detailDots[i];
      dots[d.partId].push(d);
    }
    return { lines, dots };
  }, [mesh]);

  // Bảng màu gốc RGB cho từng loại vật liệu:
  // - Nắp đóng / khoang lòng sâu (`*_cavity`): tối hơn vải chính 50% (45-55%) tạo chiều sâu bóng tự nhiên
  // - Lớp lót mặt trong (`*_lining`): tối hơn vải ngoài 35%
  const materialRgbMap = useMemo<Record<MeshMaterialKind, RGB>>(() => {
    const topRgb = hexToRgb(topHex);
    const outerRgb = hexToRgb(outerHex);
    const bottomRgb = hexToRgb(bottomHex);
    return {
      outerwear: outerRgb,
      top: topRgb,
      bottom: bottomRgb,
      shoes: hexToRgb(shoesHex),
      inner_cavity: {
        r: topRgb.r * 0.5,
        g: topRgb.g * 0.5,
        b: topRgb.b * 0.5,
      },
      outer_cavity: {
        r: outerRgb.r * 0.5,
        g: outerRgb.g * 0.5,
        b: outerRgb.b * 0.5,
      },
      bottom_cavity: {
        r: bottomRgb.r * 0.5,
        g: bottomRgb.g * 0.5,
        b: bottomRgb.b * 0.5,
      },
      top_lining: {
        r: topRgb.r * 0.65,
        g: topRgb.g * 0.65,
        b: topRgb.b * 0.65,
      },
      outer_lining: {
        r: outerRgb.r * 0.65,
        g: outerRgb.g * 0.65,
        b: outerRgb.b * 0.65,
      },
      ...FIXED_MATERIAL_RGB,
    };
  }, [outerHex, topHex, bottomHex, shoesHex]);

  // 2. Vòng lặp Animation mượt có độ đầm tay, tự dừng rAF khi nghỉ
  const wakeLoop = () => {
    if (runningRef.current) return;
    runningRef.current = true;

    const tick = () => {
      const a = animRef.current;
      let keep = false;

      if (a.autoRotate && !a.dragging) {
        a.yaw += 0.02;
        keep = true;
      } else if (a.targetYaw !== null && !a.dragging) {
        let diff = a.targetYaw - a.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) > 0.006) {
          a.yaw += diff * 0.15;
          keep = true;
        } else {
          a.yaw = a.targetYaw;
          a.targetYaw = null;
        }
      } else if (!a.dragging && Math.abs(a.velYaw) > 0.0007) {
        a.yaw += a.velYaw;
        a.velYaw *= 0.91;
        keep = true;
      } else {
        a.velYaw = 0;
      }

      if (a.targetPitch !== null && !a.dragging) {
        const dp = a.targetPitch - a.pitch;
        if (Math.abs(dp) > 0.005) {
          a.pitch += dp * 0.15;
          keep = true;
        } else {
          a.pitch = a.targetPitch;
          a.targetPitch = null;
        }
      } else if (!a.dragging && Math.abs(a.velPitch) > 0.0007) {
        a.pitch = Math.max(-0.32, Math.min(0.3, a.pitch + a.velPitch));
        a.velPitch *= 0.9;
        keep = true;
      } else {
        a.velPitch = 0;
      }

      if (a.targetZoom !== null) {
        const dz = a.targetZoom - a.zoom;
        if (Math.abs(dz) > 0.004) {
          a.zoom += dz * 0.18;
          keep = true;
        } else {
          a.zoom = a.targetZoom;
          a.targetZoom = null;
        }
      }

      let pulse = 0;
      if (a.pulsing) {
        const t = (Date.now() - a.pulseStart) / 340;
        if (t < 1) {
          pulse = Math.sin(t * Math.PI);
          keep = true;
        } else {
          a.pulsing = false;
        }
      }

      setView({
        yaw: a.yaw,
        pitch: a.pitch,
        zoom: a.zoom,
        pulse,
      });

      if (keep) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        runningRef.current = false;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (presetNonce === 0) return;
    if (cameraPreset === 'front') {
      animRef.current.targetYaw = 0;
      animRef.current.targetPitch = 0.04;
    } else if (cameraPreset === 'threeQuarter') {
      animRef.current.targetYaw = 0.56;
      animRef.current.targetPitch = 0.05;
    } else {
      animRef.current.targetYaw = Math.PI;
      animRef.current.targetPitch = 0.04;
    }
    animRef.current.velYaw = 0;
    animRef.current.velPitch = 0;
    wakeLoop();
  }, [cameraPreset, presetNonce]);

  useEffect(() => {
    animRef.current.autoRotate = autoRotate;
    if (autoRotate) {
      animRef.current.targetYaw = null;
      wakeLoop();
    }
  }, [autoRotate]);

  useEffect(() => {
    if (zoomNonce === 0) return;
    const cur = animRef.current.targetZoom ?? animRef.current.zoom;
    animRef.current.targetZoom =
      zoomDirection === 'in'
        ? Math.min(1.35, cur + 0.14)
        : zoomDirection === 'out'
        ? Math.max(0.82, cur - 0.14)
        : 1.0;
    wakeLoop();
  }, [zoomNonce, zoomDirection]);

  useEffect(() => {
    if (!activeSlot) return;
    animRef.current.pulsing = true;
    animRef.current.pulseStart = Date.now();
    wakeLoop();
  }, [activeSlot]);

  // 3. PanResponder: vuốt xoay 360° + nghiêng pitch + tap chọn món + chạm đúp (< 280ms) đặt lại góc nhìn
  const panResponder = useMemo(() => {
    let prevDx = 0;
    let prevDy = 0;
    let downTime = 0;
    let lastTapTime = 0;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        prevDx = 0;
        prevDy = 0;
        downTime = Date.now();
        animRef.current.dragging = true;
        animRef.current.targetYaw = null;
        animRef.current.targetPitch = null;
        animRef.current.velYaw = 0;
        animRef.current.velPitch = 0;
      },
      onPanResponderMove: (_evt, gs) => {
        const ddx = gs.dx - prevDx;
        const ddy = gs.dy - prevDy;
        prevDx = gs.dx;
        prevDy = gs.dy;

        const dYaw = ddx * 0.0145;
        const dPitch = ddy * 0.0075;

        animRef.current.yaw += dYaw;
        animRef.current.pitch = Math.max(
          -0.32,
          Math.min(0.3, animRef.current.pitch + dPitch)
        );
        // Lọc mượt vận tốc quán tính (EMA) để thả tay không bị giật
        animRef.current.velYaw = animRef.current.velYaw * 0.45 + dYaw * 0.55;
        animRef.current.velPitch = animRef.current.velPitch * 0.45 + dPitch * 0.55;

        setView(prev => ({
          ...prev,
          yaw: animRef.current.yaw,
          pitch: animRef.current.pitch,
        }));
      },
      onPanResponderRelease: (evt, gs) => {
        animRef.current.dragging = false;
        const now = Date.now();
        const dt = now - downTime;

        if (Math.hypot(gs.dx, gs.dy) < 8 && dt < 180) {
          // Chạm đúp nhanh (< 280ms) -> Tắt tự xoay 360° & nội suy mượt về góc chính diện (Trước)
          if (now - lastTapTime < 280) {
            lastTapTime = 0;
            if (singleTapTimerRef.current !== null) {
              clearTimeout(singleTapTimerRef.current);
              singleTapTimerRef.current = null;
            }
            animRef.current.autoRotate = false;
            animRef.current.targetYaw = 0;
            animRef.current.targetPitch = 0.04;
            animRef.current.targetZoom = 1.0;
            animRef.current.velYaw = 0;
            animRef.current.velPitch = 0;
            wakeLoop();
            onResetViewRef.current?.();
            return;
          }

          lastTapTime = now;
          const tx = evt.nativeEvent.locationX;
          const ty = evt.nativeEvent.locationY;
          const quads = hitQuadsRef.current;

          let tappedSlot: OutfitSlotId | null = null;
          for (let i = quads.length - 1; i >= 0; i--) {
            const hq = quads[i];
            if (
              pointInQuad(
                tx,
                ty,
                hq.x0,
                hq.y0,
                hq.x1,
                hq.y1,
                hq.x2,
                hq.y2,
                hq.x3,
                hq.y3
              )
            ) {
              tappedSlot = hq.slot;
              break;
            }
          }

          if (tappedSlot) {
            const slotToSelect = tappedSlot;
            if (singleTapTimerRef.current !== null) {
              clearTimeout(singleTapTimerRef.current);
            }
            singleTapTimerRef.current = setTimeout(() => {
              singleTapTimerRef.current = null;
              animRef.current.pulsing = true;
              animRef.current.pulseStart = Date.now();
              wakeLoop();
              onSelectRef.current(slotToSelect);
            }, 220);
          }
        } else {
          wakeLoop();
        }
      },
      onPanResponderTerminate: () => {
        animRef.current.dragging = false;
      },
    });
  }, []);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width: lw, height: lh } = e.nativeEvent.layout;
    if (lw > 50 && lh > 50) {
      const nw = Math.floor(lw);
      const nh = Math.floor(lh);
      setStageSize(prev => (prev.w === nw && prev.h === nh ? prev : { w: nw, h: nh }));
    }
  };

  // 4. Ghi Bóng sàn 2 lớp + Toàn bộ 3D phân tầng vào đúng 1 SkPicture
  const renderFrame = useMemo<{
    picture: SkPicture | null;
    renderedQuadCount: number;
    debugReason: string;
  }>(() => {
    const stageW = stageSize.w;
    const stageH = stageSize.h;
    const res = skiaResRef.current;

    if (!res) {
      return {
        picture: null,
        renderedQuadCount: 0,
        debugReason: 'Skia resources not initialized',
      };
    }

    if (stageW <= 50 || stageH <= 50) {
      return {
        picture: null,
        renderedQuadCount: 0,
        debugReason: `Invalid stage size ${stageW}x${stageH}`,
      };
    }

    const {
      vertexCount,
      positions,
      quads,
      partCenters,
      shoeGroundCenters,
      halfHeight,
      pantsCoverShoes,
    } = mesh;

    if (vertexCount === 0 || quads.length === 0) {
      return {
        picture: null,
        renderedQuadCount: 0,
        debugReason: `Empty mesh (v=${vertexCount}, q=${quads.length})`,
      };
    }

    const cosY = Math.cos(view.yaw);
    const sinY = Math.sin(view.yaw);
    const cosX = Math.cos(view.pitch);
    const sinX = Math.sin(view.pitch);

    const cameraZ = 5.4;
    const focalByHeight = (stageH * 0.74 * cameraZ) / 2.8;
    const focalByWidth = (stageW * 0.88 * cameraZ) / 1.48;
    const focal = Math.min(focalByHeight, focalByWidth) * view.zoom;

    const cx = stageW * 0.5;
    const cy = stageH * 0.485;

    // Chiếu toàn bộ đỉnh 3D -> 2D (typed arrays, không cấp phát object trung gian)
    const projX = new Float32Array(vertexCount);
    const projY = new Float32Array(vertexCount);
    const rotZ = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3;
      const vx = positions[i3];
      const vy = positions[i3 + 1];
      const vz = positions[i3 + 2];

      const x1 = vx * cosY + vz * sinY;
      const z1 = -vx * sinY + vz * cosY;
      const y2 = vy * cosX - z1 * sinX;
      const z2 = vy * sinX + z1 * cosX;

      rotZ[i] = z2;
      const denom = Math.max(1.2, cameraZ - z2);
      const scale = focal / denom;
      projX[i] = cx + x1 * scale;
      projY[i] = cy - y2 * scale;
    }

    // Helper xoay điểm 3D để lấy tọa độ Z sau xoay của tâm bộ phận / đáy giày
    const rotPoint = (pt: [number, number, number]): [number, number, number] => {
      const x1 = pt[0] * cosY + pt[2] * sinY;
      const z1 = -pt[0] * sinY + pt[2] * cosY;
      const y2 = pt[1] * cosX - z1 * sinX;
      const z2 = pt[1] * sinX + z1 * cosX;
      return [x1, y2, z2];
    };

    // Phân nhóm mặt hiển thị theo từng bộ phận bằng Perspective View-Vector Culling
    const partBuckets: Record<MeshPartId, ProjectedQuadEntry[]> = {
      mannequinCore: [],
      bottomCore: [],
      neckCavity: [],
      torsoCore: [],
      outerwearShell: [],
      hoodBack: [],
      leftArm: [],
      rightArm: [],
      leftLeg: [],
      rightLeg: [],
      leftShoe: [],
      rightShoe: [],
    };
    // Lòng sâu mặt trong & trần tối màu của chân váy (vẽ trước 2 bắp chân mannequin)
    const torsoCavityBucket: ProjectedQuadEntry[] = [];

    let totalVisible = 0;

    for (let i = 0; i < quads.length; i++) {
      const q = quads[i];

      // Xoay tâm mặt 3D để dựng tia nhìn phối cảnh V = normalize(-rcx, -rcy, cameraZ - rcz)
      const cx1 = q.cx * cosY + q.cz * sinY;
      const cz1 = -q.cx * sinY + q.cz * cosY;
      const rcy = q.cy * cosX - cz1 * sinX;
      const rcz = q.cy * sinX + cz1 * cosX;
      const [vx, vy, vz] = safeNormalize(-cx1, -rcy, cameraZ - rcz);

      // Xoay pháp tuyến hình học thực tế để Culling chuẩn theo tia nhìn phối cảnh
      const nx1 = q.nx * cosY + q.nz * sinY;
      const nz1 = -q.nx * sinY + q.nz * cosY;
      const rny = q.ny * cosX - nz1 * sinX;
      const rnz = q.ny * sinX + nz1 * cosX;

      const viewDot = nx1 * vx + rny * vy + rnz * vz;
      // - Bề mặt ngoài: dot(N, V) > -0.06 (chuẩn, không giữ lại mặt lưng đảo chiều gần mép)
      // - Vòng gầm gấu áo (`hemSealRing`): CHỈ hiện khi dot(N, V) > 0.05 (góc nhìn hất từ dưới lên)
      if (q.isHemSeal ? viewDot <= 0.05 : viewDot <= -0.06) continue;

      // Xoay pháp tuyến mượt (Smooth Vertex-Averaged Normal) để tính ánh sáng trơn mịn
      const snx1 = q.snx * cosY + q.snz * sinY;
      const snz1 = -q.snx * sinY + q.snz * cosY;
      const sny2 = q.sny * cosX - snz1 * sinX;
      const snz2 = q.sny * sinX + snz1 * cosX;

      const avgZ = (rotZ[q.v0] + rotZ[q.v1] + rotZ[q.v2] + rotZ[q.v3]) * 0.25;
      const entry: ProjectedQuadEntry = {
        quad: q,
        avgZ,
        snx: snx1,
        sny: sny2,
        snz: snz2,
        vx,
        vy,
        vz,
      };

      if (q.isDeepCavity) {
        torsoCavityBucket.push(entry);
      } else {
        partBuckets[q.partId].push(entry);
      }
      totalVisible++;
    }

    // Van an toàn bắt buộc: nếu tổng số mặt sau culling < 20 -> vẽ toàn bộ mặt (tuyệt đối không tàng hình)
    if (totalVisible < 20) {
      torsoCavityBucket.length = 0;
      (Object.keys(partBuckets) as MeshPartId[]).forEach(k => {
        partBuckets[k].length = 0;
      });
      for (let i = 0; i < quads.length; i++) {
        const q = quads[i];
        if (q.isHemSeal) continue;
        const snx1 = q.snx * cosY + q.snz * sinY;
        const snz1 = -q.snx * sinY + q.snz * cosY;
        const sny2 = q.sny * cosX - snz1 * sinX;
        const snz2 = q.sny * sinX + snz1 * cosX;
        const avgZ = (rotZ[q.v0] + rotZ[q.v1] + rotZ[q.v2] + rotZ[q.v3]) * 0.25;
        const entry: ProjectedQuadEntry = {
          quad: q,
          avgZ,
          snx: snx1,
          sny: sny2,
          snz: snz2,
          vx: 0,
          vy: 0,
          vz: 1,
        };
        if (q.isDeepCavity) {
          torsoCavityBucket.push(entry);
        } else {
          partBuckets[q.partId].push(entry);
        }
      }
    }

    // =========================================================
    // HIERARCHICAL PART Z-SORTING TẦNG 1: SẮP XẾP THỨ TỰ BỘ PHẬN
    // =========================================================
    const zTorso = rotPoint(partCenters.torsoCore)[2];
    const zHood = rotPoint(partCenters.hoodBack)[2];
    const zLeftArm = rotPoint(partCenters.leftArm)[2];
    const zRightArm = rotPoint(partCenters.rightArm)[2];
    const zLeftLeg = rotPoint(partCenters.leftLeg)[2];
    const zRightLeg = rotPoint(partCenters.rightLeg)[2];
    const zLeftShoe = rotPoint(partCenters.leftShoe)[2];
    const zRightShoe = rotPoint(partCenters.rightShoe)[2];

    const farArm: MeshPartId = zLeftArm <= zRightArm ? 'leftArm' : 'rightArm';
    const nearArm: MeshPartId = farArm === 'leftArm' ? 'rightArm' : 'leftArm';
    const farLeg: MeshPartId = zLeftLeg <= zRightLeg ? 'leftLeg' : 'rightLeg';
    const nearLeg: MeshPartId = farLeg === 'leftLeg' ? 'rightLeg' : 'leftLeg';
    const farShoe: MeshPartId = zLeftShoe <= zRightShoe ? 'leftShoe' : 'rightShoe';
    const nearShoe: MeshPartId = farShoe === 'leftShoe' ? 'rightShoe' : 'leftShoe';

    const hoodBehindTorso = zHood < zTorso;
    // Khi xoay nghiêng/ngang (> ~14°), tay gần camera ở phía trước thân áo -> vẽ cuối cùng đè sạch lên thân!
    const nearArmZ = nearArm === 'leftArm' ? zLeftArm : zRightArm;
    const nearArmInFront = nearArmZ > zTorso + 0.08;

    const orderedBuckets: {
      partId: MeshPartId | null;
      entries: ProjectedQuadEntry[];
      detailParts?: MeshPartId[];
    }[] = [];

    // STRICT WAIST RENDER ORDER:
    // 1. `mannequinWaistCore` (trụ eo/cổ ma-nơ-canh cho `baby_tee` / `blouse`)
    orderedBuckets.push({ partId: 'mannequinCore', entries: partBuckets.mannequinCore });

    // 2. `bottom`: lòng trong váy -> chân & giày xa/gần -> khối `pelvis` cắm sâu lên trong áo
    orderedBuckets.push({ partId: null, entries: torsoCavityBucket });
    if (pantsCoverShoes) {
      orderedBuckets.push({ partId: farShoe, entries: partBuckets[farShoe] });
      orderedBuckets.push({ partId: farLeg, entries: partBuckets[farLeg] });
      orderedBuckets.push({ partId: nearShoe, entries: partBuckets[nearShoe] });
      orderedBuckets.push({ partId: nearLeg, entries: partBuckets[nearLeg] });
    } else {
      orderedBuckets.push({ partId: farLeg, entries: partBuckets[farLeg] });
      orderedBuckets.push({ partId: farShoe, entries: partBuckets[farShoe] });
      orderedBuckets.push({ partId: nearLeg, entries: partBuckets[nearLeg] });
      orderedBuckets.push({ partId: nearShoe, entries: partBuckets[nearShoe] });
    }
    orderedBuckets.push({ partId: 'bottomCore', entries: partBuckets.bottomCore });

    // Tay xa camera vẽ trước cụm thân trên
    orderedBuckets.push({ partId: farArm, entries: partBuckets[farArm] });
    if (!nearArmInFront) {
      orderedBuckets.push({ partId: nearArm, entries: partBuckets[nearArm] });
    }

    // Mũ hoodie phía sau gáy vẽ trước thân khi nhìn mặt trước
    if (hoodBehindTorso) {
      orderedBuckets.push({ partId: 'hoodBack', entries: partBuckets.hoodBack });
    }

    // 3. `neckCavity`: lòng cổ áo tối màu (cổ áo trước sẽ tự che gọn phần dưới lòng cổ)
    orderedBuckets.push({ partId: 'neckCavity', entries: partBuckets.neckCavity });

    // 4. `torsoLayerGroup`: `top` + `outerwear` sắp xếp CHUNG từng mặt theo avgZ từ xa tới gần
    //    (vạt xa -> áo trong -> vạt gần ở góc nghiêng; vạt áo khoác luôn trước áo trong ở góc 0°)
    orderedBuckets.push({
      partId: null,
      entries: partBuckets.torsoCore.concat(partBuckets.outerwearShell),
      detailParts: ['torsoCore', 'outerwearShell'],
    });

    // Mũ hoodie vẽ đè lên lưng áo khi nhìn từ phía sau
    if (!hoodBehindTorso) {
      orderedBuckets.push({ partId: 'hoodBack', entries: partBuckets.hoodBack });
    }

    // Tay gần camera vẽ sau cùng đè sạch lên thân áo / áo khoác khi ở góc nghiêng/ngang
    if (nearArmInFront) {
      orderedBuckets.push({ partId: nearArm, entries: partBuckets[nearArm] });
    }

    // =========================================================
    // BẮT ĐẦU GHI SKIA PICTURE (BÓNG SÀN 2 LỚP + 3D PHÂN TẦNG + SURFACE DETAILS)
    // =========================================================
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, stageW, stageH));

    // A. BÓNG SÀN 2 LỚP MỀM (1 bóng tỏa rộng + 2 bóng tiếp xúc xoay đúng theo 2 đế giày!)
    const floorScale = focal / cameraZ;
    const floorY = cy + halfHeight * Math.cos(view.pitch) * floorScale + 5;
    const ambW = Math.min(stageW * 0.64, 134 * view.zoom);
    const ambH = Math.max(20, 29 * view.zoom);
    if (Number.isFinite(floorY) && Number.isFinite(ambW) && Number.isFinite(ambH)) {
      canvas.drawOval(
        Skia.XYWHRect(cx - ambW * 0.5, floorY - ambH * 0.5, ambW, ambH),
        res.ambientShadowPaint
      );
    }

    // 2 bóng tiếp xúc nhỏ đậm di chuyển chính xác theo đáy giày trái & phải khi xoay 360°
    const shoeGroundPts = [shoeGroundCenters.left, shoeGroundCenters.right];
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const [sx3, sy3, sz3] = rotPoint(shoeGroundPts[sIdx]);
      const denom = Math.max(1.2, cameraZ - sz3);
      const sc = focal / denom;
      const shX = cx + sx3 * sc;
      const shY = cy - sy3 * sc + 3;
      const aspect = 1 + Math.abs(sinY) * 0.35;
      const cw = Math.max(24, 42 * view.zoom * aspect);
      const ch = Math.max(10, 15 * view.zoom);
      if (Number.isFinite(shX) && Number.isFinite(shY)) {
        canvas.drawOval(
          Skia.XYWHRect(shX - cw * 0.5, shY - ch * 0.5, cw, ch),
          res.contactShadowPaint
        );
      }
    }

    // B. VẼ TOÀN BỘ MẶT TỨ GIÁC + CHI TIẾT BỀ MẶT 3D THEO THỨ TỰ PHÂN TẦNG
    const {
      pathBuilder,
      fillPaint,
      strokePaint,
      detailStrokePaint,
      detailFillPaint,
    } = res;
    const nextHitQuads: HitQuad[] = [];
    let renderedCount = 0;

    for (let b = 0; b < orderedBuckets.length; b++) {
      const { partId, entries: bucket } = orderedBuckets[b];
      if (bucket.length === 0) continue;

      // Sắp xếp tầng 2 trong nội bộ bộ phận: theo (avgZ + zBias) từ xa đến gần
      bucket.sort(
        (a, bItem) => a.avgZ + a.quad.zBias - (bItem.avgZ + bItem.quad.zBias)
      );

      for (let i = 0; i < bucket.length; i++) {
        const entry = bucket[i];
        const q = entry.quad;

        const x0 = projX[q.v0];
        const y0 = projY[q.v0];
        const x1 = projX[q.v1];
        const y1 = projY[q.v1];
        const x2 = projX[q.v2];
        const y2 = projY[q.v2];
        const x3 = projX[q.v3];
        const y3 = projY[q.v3];

        if (
          !Number.isFinite(x0) ||
          !Number.isFinite(y0) ||
          !Number.isFinite(x1) ||
          !Number.isFinite(y1) ||
          !Number.isFinite(x2) ||
          !Number.isFinite(y2) ||
          !Number.isFinite(x3) ||
          !Number.isFinite(y3)
        ) {
          continue;
        }

        // Hệ ánh sáng Softbox Studio mượt trên Smooth Vertex-Averaged Normal
        const dot1 = entry.snx * L1[0] + entry.sny * L1[1] + entry.snz * L1[2];
        const dot2 = entry.snx * L2[0] + entry.sny * L2[1] + entry.snz * L2[2];
        const dotV = Math.max(
          0,
          entry.snx * entry.vx + entry.sny * entry.vy + entry.snz * entry.vz
        );

        const ambient = 0.42;
        const keySoft = Math.pow(Math.max(0, (dot1 + 1) * 0.5), 1.35) * 0.48;
        const fillSoft = Math.max(0, (dot2 + 1) * 0.5) * 0.16;
        const rim = Math.pow(Math.max(0, 1 - dotV), 2.8) * 0.14;

        const baseRgb = materialRgbMap[q.material];
        const baseLuma =
          0.2126 * baseRgb.r + 0.7152 * baseRgb.g + 0.0722 * baseRgb.b;

        const shade = (ambient + keySoft + fillSoft) * q.ao;
        // Viền Rim êm giúp màu Đen Than vẫn nổi khối 3D mịn, màu Trắng Tinh giữ nguyên độ trong trẻo
        const rimStrength = baseLuma < 80 ? 195 : baseLuma > 210 ? 28 : 96;
        const rimAdd = rim * rimStrength * q.ao;

        // Độ bóng da nhẹ (Specular Highlight +25% cho Giày da / Cao gót)
        let specAdd = 0;
        if (q.shininess > 0) {
          const [hx, hy, hz] = safeNormalize(
            L1[0] + entry.vx,
            L1[1] + entry.vy,
            L1[2] + entry.vz
          );
          const dotH = Math.max(0, entry.snx * hx + entry.sny * hy + entry.snz * hz);
          specAdd = Math.pow(dotH, 12) * q.shininess * 245 * q.ao;
        }

        const pulseAdd =
          activeSlot && q.slot === activeSlot
            ? view.pulse * 26 + rim * 38
            : 0;

        const hex = rgbToHexFast(
          baseRgb.r * shade + rimAdd + specAdd + pulseAdd,
          baseRgb.g * shade + rimAdd + specAdd + pulseAdd,
          baseRgb.b * shade + rimAdd + specAdd + pulseAdd
        );

        const skColor = Skia.Color(hex);
        fillPaint.setColor(skColor);
        strokePaint.setColor(skColor);

        pathBuilder.reset();
        pathBuilder.moveTo(x0, y0);
        pathBuilder.lineTo(x1, y1);
        pathBuilder.lineTo(x2, y2);
        pathBuilder.lineTo(x3, y3);
        pathBuilder.close();

        const quadPath = pathBuilder.detach();
        canvas.drawPath(quadPath, fillPaint);
        canvas.drawPath(quadPath, strokePaint);
        quadPath.dispose();

        renderedCount++;

        if (q.slot) {
          nextHitQuads.push({
            x0,
            y0,
            x1,
            y1,
            x2,
            y2,
            x3,
            y3,
            slot: q.slot,
          });
        }
      }

      // C. VẼ 3D PROJECTED SURFACE DETAILS THUỘC BỘ PHẬN NÀY NGAY SAU KHI VẼ QUADS CỦA NÓ
      // (Chỉ vẽ khi pháp tuyến hướng về camera: dot(rotNormal, viewDir) > 0.12 -> KHÔNG BAO GIỜ XUYÊN THẤU!)
      const targetDetailParts: MeshPartId[] =
        orderedBuckets[b].detailParts ?? (partId !== null ? [partId] : []);
      for (let dpi = 0; dpi < targetDetailParts.length; dpi++) {
        const dPart = targetDetailParts[dpi];
        const partLines = detailsByPart.lines[dPart];
        for (let li = 0; li < partLines.length; li++) {
          const line = partLines[li];
          const pts = line.points;
          if (pts.length < 2) continue;

          // Kiểm tra hướng pháp tuyến tại trung điểm đường chỉ so với tia nhìn phối cảnh
          const midPt = pts[pts.length >> 1];
          const [rmx, rmy, rmz] = rotPoint(midPt);
          const [vx, vy, vz] = safeNormalize(-rmx, -rmy, cameraZ - rmz);
          const [rnx, rny, rnz] = rotPoint(line.normal);
          if (rnx * vx + rny * vy + rnz * vz <= 0.12) continue;

          const baseRgb = materialRgbMap[line.material];
          const baseLuma =
            0.2126 * baseRgb.r + 0.7152 * baseRgb.g + 0.0722 * baseRgb.b;
          detailStrokePaint.setColor(
            Skia.Color(resolveDetailLineColor(line.style, baseLuma))
          );
          detailStrokePaint.setStrokeWidth(
            Math.max(0.75, line.width * (0.82 + view.zoom * 0.22))
          );

          pathBuilder.reset();
          let started = false;
          for (let pi = 0; pi < pts.length; pi++) {
            const [rx, ry, rz] = rotPoint(pts[pi]);
            const denom = Math.max(1.2, cameraZ - rz);
            const sc = focal / denom;
            const px = cx + rx * sc;
            const py = cy - ry * sc;
            if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
            if (!started) {
              pathBuilder.moveTo(px, py);
              started = true;
            } else {
              pathBuilder.lineTo(px, py);
            }
          }
          if (started) {
            const linePath = pathBuilder.detach();
            canvas.drawPath(linePath, detailStrokePaint);
            linePath.dispose();
          }
        }

        const partDots = detailsByPart.dots[dPart];
        for (let di = 0; di < partDots.length; di++) {
          const dot = partDots[di];
          const [rcx, rcy, rcz] = rotPoint(dot.center);
          const [vx, vy, vz] = safeNormalize(-rcx, -rcy, cameraZ - rcz);
          const [rnx, rny, rnz] = rotPoint(dot.normal);
          if (rnx * vx + rny * vy + rnz * vz <= 0.12) continue;

          const denom = Math.max(1.2, cameraZ - rcz);
          const sc = focal / denom;
          const sx = cx + rcx * sc;
          const sy = cy - rcy * sc;
          const r = Math.max(1.4, Math.min(5.2, dot.radius * sc));
          if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(r)) {
            continue;
          }

          const baseRgb = materialRgbMap[dot.material];
          const baseLuma =
            0.2126 * baseRgb.r + 0.7152 * baseRgb.g + 0.0722 * baseRgb.b;
          const isDark = baseLuma < 78;

          if (dot.style === 'button') {
            detailFillPaint.setColor(Skia.Color(isDark ? '#E5E7EB' : '#1F2937'));
            detailStrokePaint.setColor(
              Skia.Color(isDark ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.45)')
            );
          } else if (dot.style === 'aglet') {
            detailFillPaint.setColor(Skia.Color('#BCC4D0'));
            detailStrokePaint.setColor(Skia.Color('rgba(17, 24, 39, 0.42)'));
          } else {
            // buckle / metal rivet
            detailFillPaint.setColor(Skia.Color('#CCA65E'));
            detailStrokePaint.setColor(Skia.Color('rgba(17, 24, 39, 0.45)'));
          }
          detailStrokePaint.setStrokeWidth(0.75);

          canvas.drawCircle(sx, sy, r, detailFillPaint);
          canvas.drawCircle(sx, sy, r, detailStrokePaint);
        }
      }
    }

    hitQuadsRef.current = nextHitQuads;
    const picture = recorder.finishRecordingAsPicture();

    return {
      picture,
      renderedQuadCount: renderedCount,
      debugReason: renderedCount === 0 ? 'All quads failed finite check' : '',
    };
  }, [mesh, detailsByPart, stageSize, view, materialRgbMap, activeSlot]);

  return (
    <View
      style={styles.container}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      <Canvas style={{ width: stageSize.w, height: stageSize.h }}>
        {renderFrame.picture && <Picture picture={renderFrame.picture} />}
      </Canvas>

      {/* Cờ bảo vệ debug: đảm bảo không bao giờ gặp lỗi tàng hình im lặng */}
      {renderFrame.renderedQuadCount === 0 && (
        <View style={styles.debugBadge} pointerEvents="none">
          <Text style={styles.debugText}>
            3D Debug: 0 quads ({stageSize.w}x{stageSize.h}) • {renderFrame.debugReason}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 360,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  debugBadge: {
    position: 'absolute',
    top: 12,
    left: 8,
    right: 8,
    alignItems: 'center',
  },
  debugText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
});
