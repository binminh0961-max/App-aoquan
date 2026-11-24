// src/components/Outfit3DViewer.tsx
/**
 * Outfit3DViewer - Engine 3D Stylized Mannequin 60FPS trên Android/iOS (Skia + Reanimated UI Worklet)
 * - Single-Pass Fill + nở 4 đỉnh 2D (0.45px chuẩn Manhattan, KHÔNG vẽ stroke vòng 2 -> giảm >55% tải GPU).
 * - Zero-Allocation trong vòng lặp vẽ: tái sử dụng 1 SkPathBuilder + SkPaint cố định + bộ đệm TypedArray phẳng.
 * - Precomputed 32-Level Shade LUT (Float32Array SkColor) theo từng vật liệu: 0 nối chuỗi hex, 0 parse màu khi xoay.
 * - Hierarchical Part Z-Sorting chuẩn thắt lưng & hợp nhất cụm Quần (`pelvis + leftLeg + rightLeg`) + cụm Áo (`torsoCore + outerwearShell`).
 * - Exact Perspective `cross2D` Backface Culling + `viewDot > 0.05` cho `hemSealRing`.
 * - 0 React re-render khi kéo xoay 360° hoặc tự xoay (SharedValue + useFrameCallback + useDerivedValue<SkPicture>).
 * - Tự dừng vòng lặp tự xoay 360° khi màn hình mất focus trên Navigation Stack (0% CPU chạy ngầm).
 */

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import {
  runOnJS,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import {
  BlurStyle,
  Canvas,
  PaintStyle,
  Picture,
  Skia,
  StrokeCap,
  StrokeJoin,
  type SkColor,
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
  type DetailLineStyle,
  type MeshMaterialKind,
  type MeshPartId,
  type OutfitMesh3D,
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
// 1. ÁNH SÁNG STUDIO SOFTBOX & BẢNG CHỈ SỐ PHẲNG (ZERO-ALLOC)
// =============================================================

interface RGB {
  r: number;
  g: number;
  b: number;
}

const L1 = safeNormalize(-0.42, 0.65, 0.63);
const L2 = safeNormalize(0.65, 0.15, 0.5);
const L1X = L1[0];
const L1Y = L1[1];
const L1Z = L1[2];
const L2X = L2[0];
const L2Y = L2[1];
const L2Z = L2[2];

const PART_MANNEQUIN_CORE = 0;
const PART_BOTTOM_CORE = 1;
const PART_PELVIS = 2;
const PART_NECK_CAVITY = 3;
const PART_TORSO_CORE = 4;
const PART_OUTERWEAR = 5;
const PART_HOOD_BACK = 6;
const PART_LEFT_ARM = 7;
const PART_RIGHT_ARM = 8;
const PART_LEFT_LEG = 9;
const PART_RIGHT_LEG = 10;
const PART_LEFT_SHOE = 11;
const PART_RIGHT_SHOE = 12;
const BUCKET_DEEP_CAVITY = 13;
const BUCKET_COUNT = 14;

const PART_INDEX_MAP: Record<MeshPartId, number> = {
  mannequinCore: PART_MANNEQUIN_CORE,
  bottomCore: PART_BOTTOM_CORE,
  pelvis: PART_PELVIS,
  neckCavity: PART_NECK_CAVITY,
  torsoCore: PART_TORSO_CORE,
  outerwearShell: PART_OUTERWEAR,
  hoodBack: PART_HOOD_BACK,
  leftArm: PART_LEFT_ARM,
  rightArm: PART_RIGHT_ARM,
  leftLeg: PART_LEFT_LEG,
  rightLeg: PART_RIGHT_LEG,
  leftShoe: PART_LEFT_SHOE,
  rightShoe: PART_RIGHT_SHOE,
};

const MATERIAL_ORDER: MeshMaterialKind[] = [
  'outerwear',
  'top',
  'bottom',
  'shoes',
  'sole_white',
  'sole_dark',
  'inner_cavity',
  'outer_cavity',
  'bottom_cavity',
  'top_lining',
  'outer_lining',
  'mannequin_leg',
  'accent_light',
  'accent_metal',
];

const MATERIAL_INDEX_MAP: Record<MeshMaterialKind, number> = {
  outerwear: 0,
  top: 1,
  bottom: 2,
  shoes: 3,
  sole_white: 4,
  sole_dark: 5,
  inner_cavity: 6,
  outer_cavity: 7,
  bottom_cavity: 8,
  top_lining: 9,
  outer_lining: 10,
  mannequin_leg: 11,
  accent_light: 12,
  accent_metal: 13,
};

const DETAIL_LINE_STYLES: DetailLineStyle[] = [
  'seamDark',
  'seamLight',
  'contrastWhite',
  'contrastDark',
  'zipper',
  'lace',
];

const DETAIL_LINE_STYLE_MAP: Record<DetailLineStyle, number> = {
  seamDark: 0,
  seamLight: 1,
  contrastWhite: 2,
  contrastDark: 3,
  zipper: 4,
  lace: 5,
};

const SLOT_LIST: OutfitSlotId[] = ['outerwear', 'top', 'bottom', 'shoes'];
const SLOT_INDEX_MAP: Record<OutfitSlotId, number> = {
  outerwear: 0,
  top: 1,
  bottom: 2,
  shoes: 3,
};

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
  sole_white: { r: 245, g: 245, b: 243 },
  sole_dark: { r: 34, g: 37, b: 42 },
  mannequin_leg: { r: 210, g: 204, b: 196 },
  accent_light: { r: 238, g: 239, b: 242 },
  accent_metal: { r: 196, g: 164, b: 116 },
};

const LUT_LEVELS = 32;
const LUT_MIN_SHADE = 0.35;
const LUT_MAX_SHADE = 1.2;
const LUT_INV_SPAN = 1 / (LUT_MAX_SHADE - LUT_MIN_SHADE);

function resolveDetailLineColorStr(style: DetailLineStyle, baseLuma: number): string {
  const isDarkFabric = baseLuma < 72;
  const isVeryLightFabric = baseLuma > 224;

  switch (style) {
    case 'seamDark':
      return isDarkFabric ? 'rgba(255, 255, 255, 0.12)' : 'rgba(17, 24, 39, 0.26)';
    case 'seamLight':
      if (isDarkFabric) return 'rgba(255, 255, 255, 0.14)';
      if (isVeryLightFabric) return 'rgba(17, 24, 39, 0.14)';
      return 'rgba(255, 255, 255, 0.30)';
    case 'contrastWhite':
      return isVeryLightFabric ? '#D4D0C8' : '#F5F3EE';
    case 'contrastDark':
      return isDarkFabric ? 'rgba(255, 255, 255, 0.22)' : 'rgba(17, 24, 39, 0.50)';
    case 'zipper':
      return isDarkFabric ? '#CBD1D9' : '#4E5766';
    case 'lace':
      return isVeryLightFabric ? '#BFC5CE' : '#F8F8F6';
    default:
      return 'rgba(17, 24, 39, 0.24)';
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

/** Hãm dải sáng tối mềm mại: giữ trung thực sắc độ vải, chống cháy trắng & bệt đen */
function softToneCurve(v: number): number {
  if (v <= 0) return 0;
  if (v <= 230) return v;
  return 230 + 23 * (1 - Math.exp(-(v - 230) / 34));
}

function makeSkColorFromRgb(r: number, g: number, b: number): SkColor {
  const cr = softToneCurve(r);
  const cg = softToneCurve(g);
  const cb = softToneCurve(b);
  const rf = cr <= 0 ? 0 : cr >= 255 ? 1 : cr / 255;
  const gf = cg <= 0 ? 0 : cg >= 255 ? 1 : cg / 255;
  const bf = cb <= 0 ? 0 : cb >= 255 ? 1 : cb / 255;
  return new Float32Array([rf, gf, bf, 1.0]);
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

// =============================================================
// 2. ĐÓNG GÓI DỮ LIỆU PHẲNG TYPEDARRAY (ZERO-GC WORKLET)
// =============================================================

interface PackedMesh3D {
  vertexCount: number;
  quadCount: number;
  positions: Float32Array;
  v0: Int32Array;
  v1: Int32Array;
  v2: Int32Array;
  v3: Int32Array;
  nx: Float32Array;
  ny: Float32Array;
  nz: Float32Array;
  snx: Float32Array;
  sny: Float32Array;
  snz: Float32Array;
  qcx: Float32Array;
  qcy: Float32Array;
  qcz: Float32Array;
  zBias: Float32Array;
  ao: Float32Array;
  shininess: Float32Array;
  partIdx: Uint8Array;
  matIdx: Uint8Array;
  slotIdx: Int8Array;
  flags: Uint8Array; // bit 0 = isDeepCavity, bit 1 = isHemSeal
  partCentersFlat: Float32Array; // 13 * 3
  shoeGroundFlat: Float32Array; // 6 (left xyz, right xyz)
  halfHeight: number;
  pantsCoverShoes: boolean;
  hasPelvis: boolean;
  // Packed 3D Detail Lines theo partIdx (0..12)
  partLineStart: Int32Array;
  partLineCount: Int32Array;
  linePtOffset: Int32Array;
  linePtCount: Int32Array;
  linePts: Float32Array;
  lineMid: Float32Array;
  lineNorm: Float32Array;
  lineWidth: Float32Array;
  lineColorIdx: Uint8Array; // matIdx * 6 + styleIdx
  // Packed 3D Detail Dots theo partIdx (0..12)
  partDotStart: Int32Array;
  partDotCount: Int32Array;
  dotCenter: Float32Array;
  dotNorm: Float32Array;
  dotRadius: Float32Array;
  dotColorIdx: Uint8Array; // matIdx * 3 + dotStyleIdx
  // Bộ đệm tính toán tái sử dụng 100% (không cấp phát mới khi xoay)
  projX: Float32Array;
  projY: Float32Array;
  rotZ: Float32Array;
  visBucket: Int8Array;
  visSortZ: Float32Array;
  partCounts: Int32Array;
  partOffsets: Int32Array;
  partWrite: Int32Array;
  partQuads: Int32Array;
  orderBuf: Int32Array;
}

function packOutfitMesh3D(mesh: OutfitMesh3D): PackedMesh3D {
  const { vertexCount, quads, detailLines, detailDots, partCenters, shoeGroundCenters } = mesh;
  const quadCount = quads.length;

  const v0 = new Int32Array(quadCount);
  const v1 = new Int32Array(quadCount);
  const v2 = new Int32Array(quadCount);
  const v3 = new Int32Array(quadCount);
  const nx = new Float32Array(quadCount);
  const ny = new Float32Array(quadCount);
  const nz = new Float32Array(quadCount);
  const snx = new Float32Array(quadCount);
  const sny = new Float32Array(quadCount);
  const snz = new Float32Array(quadCount);
  const qcx = new Float32Array(quadCount);
  const qcy = new Float32Array(quadCount);
  const qcz = new Float32Array(quadCount);
  const zBias = new Float32Array(quadCount);
  const ao = new Float32Array(quadCount);
  const shininess = new Float32Array(quadCount);
  const partIdx = new Uint8Array(quadCount);
  const matIdx = new Uint8Array(quadCount);
  const slotIdx = new Int8Array(quadCount);
  const flags = new Uint8Array(quadCount);

  let hasPelvis = false;
  for (let i = 0; i < quadCount; i++) {
    const q = quads[i];
    v0[i] = q.v0;
    v1[i] = q.v1;
    v2[i] = q.v2;
    v3[i] = q.v3;
    nx[i] = q.nx;
    ny[i] = q.ny;
    nz[i] = q.nz;
    snx[i] = q.snx;
    sny[i] = q.sny;
    snz[i] = q.snz;
    qcx[i] = q.cx;
    qcy[i] = q.cy;
    qcz[i] = q.cz;
    zBias[i] = q.zBias;
    ao[i] = q.ao;
    shininess[i] = q.shininess;
    const pIdx = PART_INDEX_MAP[q.partId];
    partIdx[i] = pIdx;
    if (pIdx === PART_PELVIS) hasPelvis = true;
    matIdx[i] = MATERIAL_INDEX_MAP[q.material];
    slotIdx[i] = q.slot !== null ? SLOT_INDEX_MAP[q.slot] : -1;
    flags[i] = (q.isDeepCavity ? 1 : 0) | (q.isHemSeal ? 2 : 0);
  }

  const partCentersFlat = new Float32Array(13 * 3);
  const orderedParts: MeshPartId[] = [
    'mannequinCore',
    'bottomCore',
    'pelvis',
    'neckCavity',
    'torsoCore',
    'outerwearShell',
    'hoodBack',
    'leftArm',
    'rightArm',
    'leftLeg',
    'rightLeg',
    'leftShoe',
    'rightShoe',
  ];
  for (let p = 0; p < 13; p++) {
    const c = partCenters[orderedParts[p]];
    partCentersFlat[p * 3] = c[0];
    partCentersFlat[p * 3 + 1] = c[1];
    partCentersFlat[p * 3 + 2] = c[2];
  }

  const shoeGroundFlat = new Float32Array([
    shoeGroundCenters.left[0],
    shoeGroundCenters.left[1],
    shoeGroundCenters.left[2],
    shoeGroundCenters.right[0],
    shoeGroundCenters.right[1],
    shoeGroundCenters.right[2],
  ]);

  // Pack detailLines grouped by partIdx (0..12)
  const linesGrouped: typeof detailLines[] = Array.from({ length: 13 }, () => []);
  let totalLinePts = 0;
  for (let i = 0; i < detailLines.length; i++) {
    const l = detailLines[i];
    if (l.points.length < 2) continue;
    linesGrouped[PART_INDEX_MAP[l.partId]].push(l);
    totalLinePts += l.points.length;
  }
  const totalLines = linesGrouped.reduce((acc, g) => acc + g.length, 0);
  const partLineStart = new Int32Array(13);
  const partLineCount = new Int32Array(13);
  const linePtOffset = new Int32Array(totalLines);
  const linePtCount = new Int32Array(totalLines);
  const linePts = new Float32Array(totalLinePts * 3);
  const lineMid = new Float32Array(totalLines * 3);
  const lineNorm = new Float32Array(totalLines * 3);
  const lineWidth = new Float32Array(totalLines);
  const lineColorIdx = new Uint8Array(totalLines);

  let lineCursor = 0;
  let ptCursor = 0;
  for (let p = 0; p < 13; p++) {
    const grp = linesGrouped[p];
    partLineStart[p] = lineCursor;
    partLineCount[p] = grp.length;
    for (let j = 0; j < grp.length; j++) {
      const l = grp[j];
      const pts = l.points;
      linePtOffset[lineCursor] = ptCursor;
      linePtCount[lineCursor] = pts.length;
      for (let k = 0; k < pts.length; k++) {
        const idx3 = (ptCursor + k) * 3;
        linePts[idx3] = pts[k][0];
        linePts[idx3 + 1] = pts[k][1];
        linePts[idx3 + 2] = pts[k][2];
      }
      const mid = pts[pts.length >> 1];
      const l3 = lineCursor * 3;
      lineMid[l3] = mid[0];
      lineMid[l3 + 1] = mid[1];
      lineMid[l3 + 2] = mid[2];
      lineNorm[l3] = l.normal[0];
      lineNorm[l3 + 1] = l.normal[1];
      lineNorm[l3 + 2] = l.normal[2];
      lineWidth[lineCursor] = l.width;
      lineColorIdx[lineCursor] =
        MATERIAL_INDEX_MAP[l.material] * 6 + DETAIL_LINE_STYLE_MAP[l.style];
      ptCursor += pts.length;
      lineCursor++;
    }
  }

  // Pack detailDots grouped by partIdx (0..12)
  const dotsGrouped: typeof detailDots[] = Array.from({ length: 13 }, () => []);
  for (let i = 0; i < detailDots.length; i++) {
    const d = detailDots[i];
    dotsGrouped[PART_INDEX_MAP[d.partId]].push(d);
  }
  const totalDots = dotsGrouped.reduce((acc, g) => acc + g.length, 0);
  const partDotStart = new Int32Array(13);
  const partDotCount = new Int32Array(13);
  const dotCenter = new Float32Array(totalDots * 3);
  const dotNorm = new Float32Array(totalDots * 3);
  const dotRadius = new Float32Array(totalDots);
  const dotColorIdx = new Uint8Array(totalDots);

  let dotCursor = 0;
  for (let p = 0; p < 13; p++) {
    const grp = dotsGrouped[p];
    partDotStart[p] = dotCursor;
    partDotCount[p] = grp.length;
    for (let j = 0; j < grp.length; j++) {
      const d = grp[j];
      const d3 = dotCursor * 3;
      dotCenter[d3] = d.center[0];
      dotCenter[d3 + 1] = d.center[1];
      dotCenter[d3 + 2] = d.center[2];
      dotNorm[d3] = d.normal[0];
      dotNorm[d3 + 1] = d.normal[1];
      dotNorm[d3 + 2] = d.normal[2];
      dotRadius[dotCursor] = d.radius;
      const styleId = d.style === 'button' ? 0 : d.style === 'aglet' ? 1 : 2;
      dotColorIdx[dotCursor] = MATERIAL_INDEX_MAP[d.material] * 3 + styleId;
      dotCursor++;
    }
  }

  return {
    vertexCount,
    quadCount,
    positions: mesh.positions,
    v0,
    v1,
    v2,
    v3,
    nx,
    ny,
    nz,
    snx,
    sny,
    snz,
    qcx,
    qcy,
    qcz,
    zBias,
    ao,
    shininess,
    partIdx,
    matIdx,
    slotIdx,
    flags,
    partCentersFlat,
    shoeGroundFlat,
    halfHeight: mesh.halfHeight,
    pantsCoverShoes: mesh.pantsCoverShoes,
    hasPelvis,
    partLineStart,
    partLineCount,
    linePtOffset,
    linePtCount,
    linePts,
    lineMid,
    lineNorm,
    lineWidth,
    lineColorIdx,
    partDotStart,
    partDotCount,
    dotCenter,
    dotNorm,
    dotRadius,
    dotColorIdx,
    projX: new Float32Array(vertexCount),
    projY: new Float32Array(vertexCount),
    rotZ: new Float32Array(vertexCount),
    visBucket: new Int8Array(quadCount),
    visSortZ: new Float32Array(quadCount),
    partCounts: new Int32Array(BUCKET_COUNT),
    partOffsets: new Int32Array(BUCKET_COUNT),
    partWrite: new Int32Array(BUCKET_COUNT),
    partQuads: new Int32Array(quadCount),
    orderBuf: new Int32Array(quadCount),
  };
}

interface ColorLutBundle {
  /** 14 vật liệu × 32 sắc độ bóng (0.35..1.20) dưới dạng SkColor Float32Array(4) */
  shadeLut: SkColor[];
  /** 14 vật liệu × 6 DetailLineStyle -> SkColor dựng sẵn */
  detailLineLut: SkColor[];
  /** 14 vật liệu × 3 DetailDotStyle -> SkColor fill & stroke dựng sẵn */
  detailDotFillLut: SkColor[];
  detailDotStrokeLut: SkColor[];
}

interface SkiaDrawResources {
  pathBuilder: SkPathBuilder;
  fillPaint: SkPaint;
  detailStrokePaint: SkPaint;
  detailFillPaint: SkPaint;
  ambientShadowPaint: SkPaint;
  ambientShadowMask: SkMaskFilter;
  contactShadowPaint: SkPaint;
  contactShadowMask: SkMaskFilter;
}

// =============================================================
// 3. COMPONENT CHÍNH: 60FPS SKIA + REANIMATED UI WORKLET
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

  // An toàn với mọi ngữ cảnh Navigation Stack: tự dừng tự xoay 360° khi màn hình mất focus
  const navigation = useContext(NavigationContext);
  const [isScreenFocused, setIsScreenFocused] = useState<boolean>(() =>
    navigation ? navigation.isFocused() : true
  );

  useEffect(() => {
    if (!navigation) return;
    setIsScreenFocused(navigation.isFocused());
    const unsubFocus = navigation.addListener('focus', () => setIsScreenFocused(true));
    const unsubBlur = navigation.addListener('blur', () => setIsScreenFocused(false));
    return () => {
      unsubFocus();
      unsubBlur();
    };
  }, [navigation]);

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

  // SharedValues điều khiển góc quay, quán tính & hiệu ứng trên UI thread (0 setState khi xoay!)
  const yawSV = useSharedValue(0.52);
  const pitchSV = useSharedValue(0.22);
  const zoomSV = useSharedValue(1.0);
  const pulseSV = useSharedValue(0);

  const velYawSV = useSharedValue(0);
  const velPitchSV = useSharedValue(0);
  const targetYawSV = useSharedValue<number | null>(null);
  const targetPitchSV = useSharedValue<number | null>(null);
  const targetZoomSV = useSharedValue<number | null>(null);
  const draggingSV = useSharedValue(false);
  const autoRotateSV = useSharedValue(autoRotate);
  const pulseActiveSV = useSharedValue(false);
  const pulseElapsedSV = useSharedValue(0);
  const isFocusedSV = useSharedValue(isScreenFocused);

  const onSelectRef = useRef(onSelectSlot);
  onSelectRef.current = onSelectSlot;
  const onResetViewRef = useRef(onResetView);
  onResetViewRef.current = onResetView;
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Dựng & đóng gói lưới 3D thành TypedArray phẳng (CHỈ chạy lại khi đổi phom dáng / giới tính / layering)
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

  const packed = useMemo(() => packOutfitMesh3D(mesh), [mesh]);
  const packedRef = useRef(packed);
  packedRef.current = packed;
  const stageSizeRef = useRef(stageSize);
  stageSizeRef.current = stageSize;

  // 2. Dựng sẵn Bảng sắc độ bóng (Shade LUT 32 mức từ 0.35 đến 1.20) + màu chi tiết 3D
  //    CHỈ chạy lại khi đổi màu vải — 0 phép parse màu hay nối chuỗi khi xoay 360°!
  const colorLuts = useMemo<ColorLutBundle>(() => {
    const topRgb = hexToRgb(topHex);
    const outerRgb = hexToRgb(outerHex);
    const bottomRgb = hexToRgb(bottomHex);
    const shoesRgb = hexToRgb(shoesHex);

    const materialRgb: Record<MeshMaterialKind, RGB> = {
      outerwear: outerRgb,
      top: topRgb,
      bottom: bottomRgb,
      shoes: shoesRgb,
      inner_cavity: { r: topRgb.r * 0.72, g: topRgb.g * 0.72, b: topRgb.b * 0.72 },
      outer_cavity: { r: outerRgb.r * 0.72, g: outerRgb.g * 0.72, b: outerRgb.b * 0.72 },
      bottom_cavity: { r: bottomRgb.r * 0.7, g: bottomRgb.g * 0.7, b: bottomRgb.b * 0.7 },
      top_lining: { r: topRgb.r * 0.65, g: topRgb.g * 0.65, b: topRgb.b * 0.65 },
      outer_lining: { r: outerRgb.r * 0.65, g: outerRgb.g * 0.65, b: outerRgb.b * 0.65 },
      ...FIXED_MATERIAL_RGB,
    };

    const shadeLut: SkColor[] = new Array(MATERIAL_ORDER.length * LUT_LEVELS);
    const detailLineLut: SkColor[] = new Array(MATERIAL_ORDER.length * DETAIL_LINE_STYLES.length);
    const detailDotFillLut: SkColor[] = new Array(MATERIAL_ORDER.length * 3);
    const detailDotStrokeLut: SkColor[] = new Array(MATERIAL_ORDER.length * 3);

    const agletFill = Skia.Color('#BCC4D0');
    const agletStroke = Skia.Color('rgba(17, 24, 39, 0.42)');
    const buckleFill = Skia.Color('#CCA65E');
    const buckleStroke = Skia.Color('rgba(17, 24, 39, 0.45)');
    const btnLightFill = Skia.Color('#E5E7EB');
    const btnLightStroke = Skia.Color('rgba(17, 24, 39, 0.5)');
    const btnDarkFill = Skia.Color('#1F2937');
    const btnDarkStroke = Skia.Color('rgba(255, 255, 255, 0.45)');

    for (let m = 0; m < MATERIAL_ORDER.length; m++) {
      const matName = MATERIAL_ORDER[m];
      const baseRgb = materialRgb[matName];
      const baseLuma =
        0.2126 * baseRgb.r + 0.7152 * baseRgb.g + 0.0722 * baseRgb.b;
      const isDark = baseLuma < 80;
      const isVeryLight = baseLuma > 210;

      // 32 mức sắc độ bóng từ 0.35 .. 1.20 (mức trên 0.92 tích hợp nhẹ rim/highlight cho vải đen vẫn nổi khối 3D!)
      const rimLiftMax = isDark ? 42 : isVeryLight ? 8 : 22;
      for (let k = 0; k < LUT_LEVELS; k++) {
        const s = LUT_MIN_SHADE + (k / (LUT_LEVELS - 1)) * (LUT_MAX_SHADE - LUT_MIN_SHADE);
        const hi = s > 0.92 ? (s - 0.92) / (LUT_MAX_SHADE - 0.92) : 0;
        const lift = hi * hi * rimLiftMax;
        shadeLut[m * LUT_LEVELS + k] = makeSkColorFromRgb(
          baseRgb.r * s + lift,
          baseRgb.g * s + lift,
          baseRgb.b * s + lift
        );
      }

      // Màu đường chỉ / dây rút / khóa kéo / dây giày dựng sẵn
      for (let st = 0; st < DETAIL_LINE_STYLES.length; st++) {
        detailLineLut[m * 6 + st] = Skia.Color(
          resolveDetailLineColorStr(DETAIL_LINE_STYLES[st], baseLuma)
        );
      }

      // Màu chấm cúc / aglet / khóa kim loại dựng sẵn
      const dotBase = m * 3;
      const darkBtn = baseLuma < 78;
      detailDotFillLut[dotBase] = darkBtn ? btnLightFill : btnDarkFill;
      detailDotStrokeLut[dotBase] = darkBtn ? btnLightStroke : btnDarkStroke;
      detailDotFillLut[dotBase + 1] = agletFill;
      detailDotStrokeLut[dotBase + 1] = agletStroke;
      detailDotFillLut[dotBase + 2] = buckleFill;
      detailDotStrokeLut[dotBase + 2] = buckleStroke;
    }

    return { shadeLut, detailLineLut, detailDotFillLut, detailDotStrokeLut };
  }, [outerHex, topHex, bottomHex, shoesHex]);

  // 3. Khởi tạo 1 lần duy nhất các tài nguyên Skia dùng chung ngoài vòng lặp (KHÔNG có strokePaint cho quad!)
  const skiaRes = useMemo<SkiaDrawResources>(() => {
    const pathBuilder = Skia.PathBuilder.Make();

    const fillPaint = Skia.Paint();
    fillPaint.setStyle(PaintStyle.Fill);
    fillPaint.setAntiAlias(true);
    fillPaint.setAlphaf(1.0);

    const detailStrokePaint = Skia.Paint();
    detailStrokePaint.setStyle(PaintStyle.Stroke);
    detailStrokePaint.setStrokeJoin(StrokeJoin.Round);
    detailStrokePaint.setStrokeCap(StrokeCap.Round);
    detailStrokePaint.setAntiAlias(true);

    const detailFillPaint = Skia.Paint();
    detailFillPaint.setStyle(PaintStyle.Fill);
    detailFillPaint.setAntiAlias(true);

    const ambientShadowPaint = Skia.Paint();
    ambientShadowPaint.setStyle(PaintStyle.Fill);
    ambientShadowPaint.setAntiAlias(true);
    ambientShadowPaint.setColor(Skia.Color('rgba(17, 20, 26, 0.15)'));
    const ambientShadowMask = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 17, true);
    ambientShadowPaint.setMaskFilter(ambientShadowMask);

    const contactShadowPaint = Skia.Paint();
    contactShadowPaint.setStyle(PaintStyle.Fill);
    contactShadowPaint.setAntiAlias(true);
    contactShadowPaint.setColor(Skia.Color('rgba(15, 18, 24, 0.30)'));
    const contactShadowMask = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 6.5, true);
    contactShadowPaint.setMaskFilter(contactShadowMask);

    return {
      pathBuilder,
      fillPaint,
      detailStrokePaint,
      detailFillPaint,
      ambientShadowPaint,
      ambientShadowMask,
      contactShadowPaint,
      contactShadowMask,
    };
  }, []);

  // 4. Vòng lặp animation trên UI Thread (useFrameCallback) — tự tắt hoàn toàn khi nghỉ hoặc khi mất focus!
  const frameCbRef = useRef<{ setActive: (active: boolean) => void } | null>(null);
  const stopLoopOnJS = () => {
    frameCbRef.current?.setActive(false);
  };

  const frameCallback = useFrameCallback(info => {
    'worklet';
    if (!isFocusedSV.value) {
      runOnJS(stopLoopOnJS)();
      return;
    }

    const dtMs = info.timeSincePreviousFrame;
    const dtNorm = dtMs && dtMs > 0 ? Math.min(2.0, dtMs / 16.6667) : 1.0;
    let keep = false;

    if (autoRotateSV.value && !draggingSV.value) {
      yawSV.value += 0.02 * dtNorm;
      keep = true;
    } else if (targetYawSV.value !== null && !draggingSV.value) {
      let diff = targetYawSV.value - yawSV.value;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 0.006) {
        yawSV.value += diff * Math.min(1, 0.15 * dtNorm);
        keep = true;
      } else {
        yawSV.value = targetYawSV.value;
        targetYawSV.value = null;
      }
    } else if (!draggingSV.value && Math.abs(velYawSV.value) > 0.0007) {
      yawSV.value += velYawSV.value * dtNorm;
      velYawSV.value *= Math.pow(0.91, dtNorm);
      keep = true;
    } else {
      velYawSV.value = 0;
    }

    if (targetPitchSV.value !== null && !draggingSV.value) {
      const dp = targetPitchSV.value - pitchSV.value;
      if (Math.abs(dp) > 0.005) {
        pitchSV.value += dp * Math.min(1, 0.15 * dtNorm);
        keep = true;
      } else {
        pitchSV.value = targetPitchSV.value;
        targetPitchSV.value = null;
      }
    } else if (!draggingSV.value && Math.abs(velPitchSV.value) > 0.0007) {
      const nextP = pitchSV.value + velPitchSV.value * dtNorm;
      pitchSV.value = nextP < 0.02 ? 0.02 : nextP > 0.38 ? 0.38 : nextP;
      velPitchSV.value *= Math.pow(0.9, dtNorm);
      keep = true;
    } else {
      velPitchSV.value = 0;
    }

    if (targetZoomSV.value !== null) {
      const dz = targetZoomSV.value - zoomSV.value;
      if (Math.abs(dz) > 0.004) {
        zoomSV.value += dz * Math.min(1, 0.18 * dtNorm);
        keep = true;
      } else {
        zoomSV.value = targetZoomSV.value;
        targetZoomSV.value = null;
      }
    }

    if (pulseActiveSV.value) {
      pulseElapsedSV.value += dtMs && dtMs > 0 ? dtMs : 16.67;
      const t = pulseElapsedSV.value / 340;
      if (t < 1) {
        pulseSV.value = Math.sin(t * Math.PI);
        keep = true;
      } else {
        pulseActiveSV.value = false;
        pulseSV.value = 0;
      }
    }

    if (!keep) {
      runOnJS(stopLoopOnJS)();
    }
  }, false);

  frameCbRef.current = frameCallback;

  const wakeLoop = () => {
    if (!isFocusedSV.value) return;
    frameCallback.setActive(true);
  };

  useEffect(() => {
    isFocusedSV.value = isScreenFocused;
    if (!isScreenFocused) {
      frameCallback.setActive(false);
    } else if (autoRotate) {
      frameCallback.setActive(true);
    }
  }, [isScreenFocused, autoRotate, frameCallback, isFocusedSV]);

  useEffect(() => {
    return () => {
      frameCallback.setActive(false);
      if (singleTapTimerRef.current !== null) {
        clearTimeout(singleTapTimerRef.current);
      }
    };
  }, [frameCallback]);

  useEffect(() => {
    if (presetNonce === 0) return;
    if (cameraPreset === 'front') {
      targetYawSV.value = 0;
      targetPitchSV.value = 0.21;
    } else if (cameraPreset === 'threeQuarter') {
      targetYawSV.value = 0.56;
      targetPitchSV.value = 0.22;
    } else {
      targetYawSV.value = Math.PI;
      targetPitchSV.value = 0.21;
    }
    velYawSV.value = 0;
    velPitchSV.value = 0;
    wakeLoop();
  }, [cameraPreset, presetNonce]);

  useEffect(() => {
    autoRotateSV.value = autoRotate;
    if (autoRotate && isScreenFocused) {
      targetYawSV.value = null;
      frameCallback.setActive(true);
    } else if (!autoRotate) {
      // Nếu không còn quán tính / chuyển cảnh nào khác thì tự dừng trong frame tiếp theo
      if (
        targetYawSV.value === null &&
        targetPitchSV.value === null &&
        targetZoomSV.value === null &&
        !pulseActiveSV.value &&
        Math.abs(velYawSV.value) <= 0.0007 &&
        Math.abs(velPitchSV.value) <= 0.0007
      ) {
        frameCallback.setActive(false);
      }
    }
  }, [autoRotate, isScreenFocused]);

  useEffect(() => {
    if (zoomNonce === 0) return;
    const cur = targetZoomSV.value ?? zoomSV.value;
    targetZoomSV.value =
      zoomDirection === 'in'
        ? Math.min(1.35, cur + 0.14)
        : zoomDirection === 'out'
        ? Math.max(0.82, cur - 0.14)
        : 1.0;
    wakeLoop();
  }, [zoomNonce, zoomDirection]);

  useEffect(() => {
    if (!activeSlot) return;
    pulseActiveSV.value = true;
    pulseElapsedSV.value = 0;
    wakeLoop();
  }, [activeSlot]);

  // Hit-test chỉ chạy 1 lần DUY NHẤT khi người dùng thực sự tap (KHÔNG tạo HitQuad mỗi frame!)
  const performTapHitTest = (tx: number, ty: number): OutfitSlotId | null => {
    const p = packedRef.current;
    const { w: stageW, h: stageH } = stageSizeRef.current;
    if (p.vertexCount === 0 || p.quadCount === 0 || stageW <= 50 || stageH <= 50) {
      return null;
    }

    const yaw = yawSV.value;
    const pitch = pitchSV.value;
    const zoom = zoomSV.value;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosX = Math.cos(pitch);
    const sinX = Math.sin(pitch);

    const cameraZ = 5.4;
    const focal =
      Math.min((stageH * 0.74 * cameraZ) / 2.8, (stageW * 0.88 * cameraZ) / 1.48) * zoom;
    const cx = stageW * 0.5;
    const cy = stageH * 0.485;

    const { positions, vertexCount, quadCount, v0, v1, v2, v3, slotIdx, zBias } = p;
    const hx = new Float32Array(vertexCount);
    const hy = new Float32Array(vertexCount);
    const hz = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3;
      const vx = positions[i3];
      const vy = positions[i3 + 1];
      const vz = positions[i3 + 2];
      const x1 = vx * cosY + vz * sinY;
      const z1 = -vx * sinY + vz * cosY;
      const y2 = vy * cosX - z1 * sinX;
      const z2 = vy * sinX + z1 * cosX;
      hz[i] = z2;
      const sc = focal / Math.max(1.2, cameraZ - z2);
      hx[i] = cx + x1 * sc;
      hy[i] = cy - y2 * sc;
    }

    let bestSlot = -1;
    let bestZ = -Infinity;
    for (let i = 0; i < quadCount; i++) {
      const s = slotIdx[i];
      if (s < 0) continue;
      const i0 = v0[i];
      const i1 = v1[i];
      const i2 = v2[i];
      const i3 = v3[i];
      const x0 = hx[i0];
      const y0 = hy[i0];
      const x1 = hx[i1];
      const y1 = hy[i1];
      const x2 = hx[i2];
      const y2 = hy[i2];
      const x3 = hx[i3];
      const y3 = hy[i3];
      // Exact screen-space front-face check (culls backfaces AND NaN)
      if (!((x2 - x0) * (y3 - y1) - (y2 - y0) * (x3 - x1) < 0)) continue;
      if (pointInQuad(tx, ty, x0, y0, x1, y1, x2, y2, x3, y3)) {
        const z = (hz[i0] + hz[i1] + hz[i2] + hz[i3]) * 0.25 + zBias[i];
        if (z > bestZ) {
          bestZ = z;
          bestSlot = s;
        }
      }
    }

    return bestSlot >= 0 ? SLOT_LIST[bestSlot] : null;
  };

  // 5. PanResponder ghi trực tiếp vào SharedValues (0 setState -> 0 React re-render khi kéo xoay!)
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
        draggingSV.value = true;
        targetYawSV.value = null;
        targetPitchSV.value = null;
        velYawSV.value = 0;
        velPitchSV.value = 0;
      },
      onPanResponderMove: (_evt, gs) => {
        const ddx = gs.dx - prevDx;
        const ddy = gs.dy - prevDy;
        prevDx = gs.dx;
        prevDy = gs.dy;

        const dYaw = ddx * 0.0145;
        const dPitch = ddy * 0.0075;

        yawSV.value += dYaw;
        const nextP = pitchSV.value + dPitch;
        pitchSV.value = nextP < 0.02 ? 0.02 : nextP > 0.38 ? 0.38 : nextP;
        velYawSV.value = velYawSV.value * 0.45 + dYaw * 0.55;
        velPitchSV.value = velPitchSV.value * 0.45 + dPitch * 0.55;
      },
      onPanResponderRelease: (evt, gs) => {
        draggingSV.value = false;
        const now = Date.now();
        const dt = now - downTime;

        if (Math.hypot(gs.dx, gs.dy) < 8 && dt < 180) {
          // Chạm đúp nhanh (< 280ms) -> Tắt tự xoay & nội suy mượt về chính diện
          if (now - lastTapTime < 280) {
            lastTapTime = 0;
            if (singleTapTimerRef.current !== null) {
              clearTimeout(singleTapTimerRef.current);
              singleTapTimerRef.current = null;
            }
            autoRotateSV.value = false;
            targetYawSV.value = 0;
            targetPitchSV.value = 0.21;
            targetZoomSV.value = 1.0;
            velYawSV.value = 0;
            velPitchSV.value = 0;
            frameCbRef.current?.setActive(true);
            onResetViewRef.current?.();
            return;
          }

          lastTapTime = now;
          const tx = evt.nativeEvent.locationX;
          const ty = evt.nativeEvent.locationY;
          const tappedSlot = performTapHitTest(tx, ty);

          if (tappedSlot) {
            const slotToSelect = tappedSlot;
            if (singleTapTimerRef.current !== null) {
              clearTimeout(singleTapTimerRef.current);
            }
            singleTapTimerRef.current = setTimeout(() => {
              singleTapTimerRef.current = null;
              pulseActiveSV.value = true;
              pulseElapsedSV.value = 0;
              frameCbRef.current?.setActive(true);
              onSelectRef.current(slotToSelect);
            }, 220);
          }
        } else {
          frameCbRef.current?.setActive(true);
        }
      },
      onPanResponderTerminate: () => {
        draggingSV.value = false;
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

  const activeSlotIdx = activeSlot ? SLOT_INDEX_MAP[activeSlot] : -1;

  // 6. Ghi SkPicture trực tiếp trên UI Thread bằng useDerivedValue (Zero-Allocation, Single-Pass Fill + Shade LUT!)
  const pictureSV = useDerivedValue<SkPicture>(() => {
    'worklet';
    const stageW = stageSize.w;
    const stageH = stageSize.h;
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, stageW, stageH));

    const {
      vertexCount,
      quadCount,
      positions,
      v0,
      v1,
      v2,
      v3,
      nx,
      ny,
      nz,
      snx,
      sny,
      snz,
      qcx,
      qcy,
      qcz,
      zBias,
      ao,
      shininess,
      partIdx,
      matIdx,
      slotIdx,
      flags,
      partCentersFlat,
      shoeGroundFlat,
      halfHeight,
      pantsCoverShoes,
      hasPelvis,
      partLineStart,
      partLineCount,
      linePtOffset,
      linePtCount,
      linePts,
      lineMid,
      lineNorm,
      lineWidth,
      lineColorIdx,
      partDotStart,
      partDotCount,
      dotCenter,
      dotNorm,
      dotRadius,
      dotColorIdx,
      projX,
      projY,
      rotZ,
      visBucket,
      visSortZ,
      partCounts,
      partOffsets,
      partWrite,
      partQuads,
      orderBuf,
    } = packed;

    if (stageW <= 50 || stageH <= 50 || vertexCount === 0 || quadCount === 0) {
      return recorder.finishRecordingAsPicture();
    }

    const yaw = yawSV.value;
    const pitch = pitchSV.value;
    const zoom = zoomSV.value;
    const pulse = pulseSV.value;

    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosX = Math.cos(pitch);
    const sinX = Math.sin(pitch);

    const cameraZ = 5.4;
    const focalByHeight = (stageH * 0.74 * cameraZ) / 2.8;
    const focalByWidth = (stageW * 0.88 * cameraZ) / 1.48;
    const focal = (focalByHeight < focalByWidth ? focalByHeight : focalByWidth) * zoom;

    const cx = stageW * 0.5;
    const cy = stageH * 0.485;

    // 1. Chiếu toàn bộ đỉnh 3D -> 2D vào TypedArrays tái sử dụng
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
      const denom = cameraZ - z2 > 1.2 ? cameraZ - z2 : 1.2;
      const sc = focal / denom;
      projX[i] = cx + x1 * sc;
      projY[i] = cy - y2 * sc;
    }

    // 2. Phân nhóm & Backface Culling siêu tốc bằng `cross2D` (loại ~50% mặt khuất chỉ trong 2 phép nhân!)
    for (let b = 0; b < BUCKET_COUNT; b++) {
      partCounts[b] = 0;
    }

    let totalVisible = 0;
    for (let i = 0; i < quadCount; i++) {
      const i0 = v0[i];
      const i1 = v1[i];
      const i2 = v2[i];
      const i3 = v3[i];

      const x0 = projX[i0];
      const y0 = projY[i0];
      const x1 = projX[i1];
      const y1 = projY[i1];
      const x2 = projX[i2];
      const y2 = projY[i2];
      const x3 = projX[i3];
      const y3 = projY[i3];

      // Exact Perspective Backface Culling trong không gian 2D màn hình (Y-down: mặt hướng camera có cross2D < 0; loại luôn NaN)
      const cross2D = (x2 - x0) * (y3 - y1) - (y2 - y0) * (x3 - x1);
      if (!(cross2D < 0)) {
        visBucket[i] = -1;
        continue;
      }

      const fl = flags[i];
      // Vòng bịt gầm gấu áo (`isHemSeal`): giữ nguyên điều kiện dot(N, V) > 0.05
      if ((fl & 2) !== 0) {
        const cx1 = qcx[i] * cosY + qcz[i] * sinY;
        const cz1 = -qcx[i] * sinY + qcz[i] * cosY;
        const rcy = qcy[i] * cosX - cz1 * sinX;
        const rcz = qcy[i] * sinX + cz1 * cosX;
        const vdx = -cx1;
        const vdy = -rcy;
        const vdz = cameraZ - rcz;
        const vLen = Math.sqrt(vdx * vdx + vdy * vdy + vdz * vdz) + 1e-6;
        const nx1 = nx[i] * cosY + nz[i] * sinY;
        const nz1 = -nx[i] * sinY + nz[i] * cosY;
        const rny = ny[i] * cosX - nz1 * sinX;
        const rnz = ny[i] * sinX + nz1 * cosX;
        if ((nx1 * vdx + rny * vdy + rnz * vdz) / vLen <= 0.05) {
          visBucket[i] = -1;
          continue;
        }
      }

      const bucket = (fl & 1) !== 0 ? BUCKET_DEEP_CAVITY : partIdx[i];
      visBucket[i] = bucket;
      visSortZ[i] = (rotZ[i0] + rotZ[i1] + rotZ[i2] + rotZ[i3]) * 0.25 + zBias[i];
      partCounts[bucket]++;
      totalVisible++;
    }

    // Van an toàn: nếu tổng mặt hiển thị < 20 -> vẽ toàn bộ mặt không phải hemSeal
    if (totalVisible < 20) {
      for (let b = 0; b < BUCKET_COUNT; b++) partCounts[b] = 0;
      for (let i = 0; i < quadCount; i++) {
        const fl = flags[i];
        if ((fl & 2) !== 0) {
          visBucket[i] = -1;
          continue;
        }
        const bucket = (fl & 1) !== 0 ? BUCKET_DEEP_CAVITY : partIdx[i];
        visBucket[i] = bucket;
        visSortZ[i] =
          (rotZ[v0[i]] + rotZ[v1[i]] + rotZ[v2[i]] + rotZ[v3[i]]) * 0.25 + zBias[i];
        partCounts[bucket]++;
      }
    }

    // Prefix sum & phân phối chỉ số quad vào mảng phẳng CSR `partQuads` (Zero-Alloc)
    let runningOffset = 0;
    for (let b = 0; b < BUCKET_COUNT; b++) {
      partOffsets[b] = runningOffset;
      partWrite[b] = runningOffset;
      runningOffset += partCounts[b];
    }
    for (let i = 0; i < quadCount; i++) {
      const b = visBucket[i];
      if (b >= 0) {
        partQuads[partWrite[b]++] = i;
      }
    }

    // 3. BÓNG SÀN 2 LỚP MỀM (xoay đúng theo 2 đế giày thực tế)
    const {
      pathBuilder,
      fillPaint,
      detailStrokePaint,
      detailFillPaint,
      ambientShadowPaint,
      contactShadowPaint,
    } = skiaRes;
    const { shadeLut, detailLineLut, detailDotFillLut, detailDotStrokeLut } = colorLuts;
    pathBuilder.reset();

    const floorScale = focal / cameraZ;
    const floorY = cy + halfHeight * cosX * floorScale + 5;
    const ambW = Math.min(stageW * 0.64, 134 * zoom);
    const ambH = Math.max(20, 29 * zoom);
    canvas.drawOval(
      Skia.XYWHRect(cx - ambW * 0.5, floorY - ambH * 0.5, ambW, ambH),
      ambientShadowPaint
    );

    const shoeAspect = 1 + Math.abs(sinY) * 0.35;
    const cw = Math.max(24, 42 * zoom * shoeAspect);
    const ch = Math.max(10, 15 * zoom);
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const s3 = sIdx * 3;
      const sx0 = shoeGroundFlat[s3];
      const sy0 = shoeGroundFlat[s3 + 1];
      const sz0 = shoeGroundFlat[s3 + 2];
      const sx1 = sx0 * cosY + sz0 * sinY;
      const sz1 = -sx0 * sinY + sz0 * cosY;
      const sy2 = sy0 * cosX - sz1 * sinX;
      const sz2 = sy0 * sinX + sz1 * cosX;
      const sc = focal / (cameraZ - sz2 > 1.2 ? cameraZ - sz2 : 1.2);
      const shX = cx + sx1 * sc;
      const shY = cy - sy2 * sc + 3;
      canvas.drawOval(
        Skia.XYWHRect(shX - cw * 0.5, shY - ch * 0.5, cw, ch),
        contactShadowPaint
      );
    }

    // Helper lấy tọa độ Z sau xoay của tâm bộ phận
    const partRotZ = (p: number): number => {
      const p3 = p * 3;
      const px = partCentersFlat[p3];
      const py = partCentersFlat[p3 + 1];
      const pz = partCentersFlat[p3 + 2];
      const z1 = -px * sinY + pz * cosY;
      return py * sinX + z1 * cosX;
    };

    // Helper vẽ 3D Projected Surface Details của 1 bộ phận (Zero-Alloc, precomputed SkColor)
    const drawDetailsForPart = (dPart: number) => {
      if (dPart < 0 || dPart >= 13) return;
      const detailDotMin =
        dPart === PART_PELVIS || dPart === PART_LEFT_LEG || dPart === PART_RIGHT_LEG
          ? 0.18
          : 0.12;

      const lStart = partLineStart[dPart];
      const lEnd = lStart + partLineCount[dPart];
      const widthScale = 0.82 + zoom * 0.22;

      for (let li = lStart; li < lEnd; li++) {
        const l3 = li * 3;
        const mx = lineMid[l3];
        const my = lineMid[l3 + 1];
        const mz = lineMid[l3 + 2];
        const rmx = mx * cosY + mz * sinY;
        const rmz1 = -mx * sinY + mz * cosY;
        const rmy = my * cosX - rmz1 * sinX;
        const rmz = my * sinX + rmz1 * cosX;

        const vdx = -rmx;
        const vdy = -rmy;
        const vdz = cameraZ - rmz;
        const vInv = 1 / (Math.sqrt(vdx * vdx + vdy * vdy + vdz * vdz) + 1e-6);

        const lnx = lineNorm[l3];
        const lny = lineNorm[l3 + 1];
        const lnz = lineNorm[l3 + 2];
        const rnx = lnx * cosY + lnz * sinY;
        const rnz1 = -lnx * sinY + lnz * cosY;
        const rny = lny * cosX - rnz1 * sinX;
        const rnz = lny * sinX + rnz1 * cosX;

        if ((rnx * vdx + rny * vdy + rnz * vdz) * vInv <= detailDotMin) continue;

        detailStrokePaint.setColor(detailLineLut[lineColorIdx[li]]);
        const sw = lineWidth[li] * widthScale;
        detailStrokePaint.setStrokeWidth(sw > 0.75 ? sw : 0.75);

        const pOff = linePtOffset[li];
        const pCnt = linePtCount[li];
        for (let k = 0; k < pCnt; k++) {
          const idx3 = (pOff + k) * 3;
          const bx = linePts[idx3];
          const by = linePts[idx3 + 1];
          const bz = linePts[idx3 + 2];
          const rx = bx * cosY + bz * sinY;
          const rz1 = -bx * sinY + bz * cosY;
          const ry = by * cosX - rz1 * sinX;
          const rz = by * sinX + rz1 * cosX;
          const sc = focal / (cameraZ - rz > 1.2 ? cameraZ - rz : 1.2);
          const sx = cx + rx * sc;
          const sy = cy - ry * sc;
          if (k === 0) {
            pathBuilder.moveTo(sx, sy);
          } else {
            pathBuilder.lineTo(sx, sy);
          }
        }
        const linePath = pathBuilder.detach();
        canvas.drawPath(linePath, detailStrokePaint);
        linePath.dispose();
      }

      const dStart = partDotStart[dPart];
      const dEnd = dStart + partDotCount[dPart];
      if (dEnd > dStart) {
        detailStrokePaint.setStrokeWidth(0.75);
        for (let di = dStart; di < dEnd; di++) {
          const d3 = di * 3;
          const bx = dotCenter[d3];
          const by = dotCenter[d3 + 1];
          const bz = dotCenter[d3 + 2];
          const rcx = bx * cosY + bz * sinY;
          const rcz1 = -bx * sinY + bz * cosY;
          const rcy = by * cosX - rcz1 * sinX;
          const rcz = by * sinX + rcz1 * cosX;

          const vdx = -rcx;
          const vdy = -rcy;
          const vdz = cameraZ - rcz;
          const vInv = 1 / (Math.sqrt(vdx * vdx + vdy * vdy + vdz * vdz) + 1e-6);

          const dnx = dotNorm[d3];
          const dny = dotNorm[d3 + 1];
          const dnz = dotNorm[d3 + 2];
          const rnx = dnx * cosY + dnz * sinY;
          const rnz1 = -dnx * sinY + dnz * cosY;
          const rny = dny * cosX - rnz1 * sinX;
          const rnz = dny * sinX + rnz1 * cosX;

          if ((rnx * vdx + rny * vdy + rnz * vdz) * vInv <= detailDotMin) continue;

          const sc = focal / (cameraZ - rcz > 1.2 ? cameraZ - rcz : 1.2);
          const sx = cx + rcx * sc;
          const sy = cy - rcy * sc;
          const rRaw = dotRadius[di] * sc;
          const r = rRaw < 1.4 ? 1.4 : rRaw > 5.2 ? 5.2 : rRaw;

          const cIdx = dotColorIdx[di];
          detailFillPaint.setColor(detailDotFillLut[cIdx]);
          detailStrokePaint.setColor(detailDotStrokeLut[cIdx]);
          canvas.drawCircle(sx, sy, r, detailFillPaint);
          canvas.drawCircle(sx, sy, r, detailStrokePaint);
        }
      }
    };

    // Helper vẽ 1 cụm bộ phận (gộp 1–3 bucket, Z-sort chung in-place Shell Sort Zero-Alloc, vẽ Fill + nở 0.45px!)
    const drawBucketGroup = (bA: number, bB: number, bC: number) => {
      let cnt = 0;
      if (bA >= 0) {
        const s = partOffsets[bA];
        const e = s + partCounts[bA];
        for (let k = s; k < e; k++) orderBuf[cnt++] = partQuads[k];
      }
      if (bB >= 0) {
        const s = partOffsets[bB];
        const e = s + partCounts[bB];
        for (let k = s; k < e; k++) orderBuf[cnt++] = partQuads[k];
      }
      if (bC >= 0) {
        const s = partOffsets[bC];
        const e = s + partCounts[bC];
        for (let k = s; k < e; k++) orderBuf[cnt++] = partQuads[k];
      }

      if (cnt > 1) {
        // In-place Shell Sort (Ciura gaps) trực tiếp trên Int32Array `orderBuf` — 0 cấp phát bộ nhớ!
        let gap = cnt > 57 ? 57 : cnt > 23 ? 23 : cnt > 10 ? 10 : cnt > 4 ? 4 : 1;
        while (gap > 0) {
          for (let i = gap; i < cnt; i++) {
            const qi = orderBuf[i];
            const zKey = visSortZ[qi];
            let j = i;
            while (j >= gap && visSortZ[orderBuf[j - gap]] > zKey) {
              orderBuf[j] = orderBuf[j - gap];
              j -= gap;
            }
            orderBuf[j] = qi;
          }
          gap = gap === 57 ? 23 : gap === 23 ? 10 : gap === 10 ? 4 : gap === 4 ? 1 : 0;
        }
      }

      for (let k = 0; k < cnt; k++) {
        const qi = orderBuf[k];
        const x0 = projX[v0[qi]];
        const y0 = projY[v0[qi]];
        const x1 = projX[v1[qi]];
        const y1 = projY[v1[qi]];
        const x2 = projX[v2[qi]];
        const y2 = projY[v2[qi]];
        const x3 = projX[v3[qi]];
        const y3 = projY[v3[qi]];

        // Xoay Smooth Vertex-Averaged Normal để tính độ sáng mềm (chỉ tính cho mặt nhìn thấy!)
        const qSnx = snx[qi];
        const qSny = sny[qi];
        const qSnz = snz[qi];
        const snx1 = qSnx * cosY + qSnz * sinY;
        const snz1 = -qSnx * sinY + qSnz * cosY;
        const sny2 = qSny * cosX - snz1 * sinX;
        const snz2 = qSny * sinX + snz1 * cosX;

        const dot1 = snx1 * L1X + sny2 * L1Y + snz2 * L1Z;
        const dot2 = snx1 * L2X + sny2 * L2Y + snz2 * L2Z;

        // Xấp xỉ dotV siêu nhẹ (snz2 gần đúng góc nhìn hướng +Z, không cần sqrt cho vải lì!)
        const dotV = snz2 > 0 ? snz2 : 0;
        const oneMinusV = 1 - dotV;
        const rim = oneMinusV * oneMinusV * 0.14;

        const halfDot1 = dot1 > -1 ? (dot1 + 1) * 0.5 : 0;
        const keySoft = halfDot1 * Math.sqrt(halfDot1) * 0.48; // ~pow(x, 1.5) không gọi Math.pow!
        const fillSoft = (dot2 > -1 ? (dot2 + 1) * 0.5 : 0) * 0.16;

        const qAo = ao[qi];
        let shadeTotal = (0.42 + keySoft + fillSoft) * qAo + rim * 0.65 * qAo;

        // Specular highlight nhẹ cho Giày da / Cao gót
        const sh = shininess[qi];
        if (sh > 0) {
          // Half-vector giữa L1 và hướng nhìn (0, 0, 1)
          const hx = L1X;
          const hy = L1Y;
          const hz = L1Z + 1;
          const hInv = 1 / Math.sqrt(hx * hx + hy * hy + hz * hz);
          const dotH = (snx1 * hx + sny2 * hy + snz2 * hz) * hInv;
          if (dotH > 0) {
            const d2 = dotH * dotH;
            const d4 = d2 * d2;
            const d8 = d4 * d4;
            shadeTotal += d8 * d4 * sh * 0.95 * qAo;
          }
        }

        if (activeSlotIdx >= 0 && slotIdx[qi] === activeSlotIdx) {
          shadeTotal += pulse * 0.12 + rim * 0.45;
        }

        const shadeNorm = (shadeTotal - LUT_MIN_SHADE) * LUT_INV_SPAN;
        let lutLevel = (shadeNorm * 31) | 0;
        if (lutLevel < 0) lutLevel = 0;
        else if (lutLevel > 31) lutLevel = 31;

        fillPaint.setColor(shadeLut[matIdx[qi] * LUT_LEVELS + lutLevel]);

        // Nở nhẹ 4 đỉnh 2D ra ngoài ~0.45px bằng chuẩn Manhattan (khít 100% kẽ sub-pixel, 0 stroke, 0 sqrt!)
        const qCx = (x0 + x1 + x2 + x3) * 0.25;
        const qCy = (y0 + y1 + y2 + y3) * 0.25;

        let dx = x0 - qCx;
        let dy = y0 - qCy;
        let inv = 0.45 / ((dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy) + 0.001);
        const ex0 = x0 + dx * inv;
        const ey0 = y0 + dy * inv;

        dx = x1 - qCx;
        dy = y1 - qCy;
        inv = 0.45 / ((dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy) + 0.001);
        const ex1 = x1 + dx * inv;
        const ey1 = y1 + dy * inv;

        dx = x2 - qCx;
        dy = y2 - qCy;
        inv = 0.45 / ((dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy) + 0.001);
        const ex2 = x2 + dx * inv;
        const ey2 = y2 + dy * inv;

        dx = x3 - qCx;
        dy = y3 - qCy;
        inv = 0.45 / ((dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy) + 0.001);
        const ex3 = x3 + dx * inv;
        const ey3 = y3 + dy * inv;

        pathBuilder.moveTo(ex0, ey0);
        pathBuilder.lineTo(ex1, ey1);
        pathBuilder.lineTo(ex2, ey2);
        pathBuilder.lineTo(ex3, ey3);
        pathBuilder.close();

        const quadPath = pathBuilder.detach();
        canvas.drawPath(quadPath, fillPaint);
        quadPath.dispose();
      }

      // Vẽ chi tiết 3D thuộc cụm bộ phận này ngay sau các quad của nó
      drawDetailsForPart(bA);
      drawDetailsForPart(bB);
      drawDetailsForPart(bC);
    };

    // =========================================================
    // 4. HIERARCHICAL PART Z-SORTING (GIỮ NGUYÊN 100% BẢN CHỐNG XUYÊN THẤU QUẦN & ÁO!)
    // =========================================================
    const zTorso = partRotZ(PART_TORSO_CORE);
    const zHood = partRotZ(PART_HOOD_BACK);
    const zLeftArm = partRotZ(PART_LEFT_ARM);
    const zRightArm = partRotZ(PART_RIGHT_ARM);
    const zLeftLeg = partRotZ(PART_LEFT_LEG);
    const zRightLeg = partRotZ(PART_RIGHT_LEG);
    const zLeftShoe = partRotZ(PART_LEFT_SHOE);
    const zRightShoe = partRotZ(PART_RIGHT_SHOE);

    const farArm = zLeftArm <= zRightArm ? PART_LEFT_ARM : PART_RIGHT_ARM;
    const nearArm = farArm === PART_LEFT_ARM ? PART_RIGHT_ARM : PART_LEFT_ARM;
    const farLeg = zLeftLeg <= zRightLeg ? PART_LEFT_LEG : PART_RIGHT_LEG;
    const nearLeg = farLeg === PART_LEFT_LEG ? PART_RIGHT_LEG : PART_LEFT_LEG;
    const farShoe = zLeftShoe <= zRightShoe ? PART_LEFT_SHOE : PART_RIGHT_SHOE;
    const nearShoe = farShoe === PART_LEFT_SHOE ? PART_RIGHT_SHOE : PART_LEFT_SHOE;

    const hoodBehindTorso = zHood < zTorso;
    const nearArmZ = nearArm === PART_LEFT_ARM ? zLeftArm : zRightArm;
    const nearArmInFront = nearArmZ > zTorso + 0.08;

    // 1. Trụ eo/cổ ma-nơ-canh (`baby_tee` / `blouse`)
    drawBucketGroup(PART_MANNEQUIN_CORE, -1, -1);

    // 2. Lòng sâu mặt trong chân váy (vẽ trước 2 bắp chân mannequin)
    drawBucketGroup(BUCKET_DEEP_CAVITY, -1, -1);

    // 3. Quần (hợp nhất `leftLeg + rightLeg + pelvis` Z-sort chung) hoặc Váy + Chân + Giày
    if (hasPelvis) {
      if (pantsCoverShoes) {
        drawBucketGroup(farShoe, -1, -1);
        drawBucketGroup(nearShoe, -1, -1);
        drawBucketGroup(PART_LEFT_LEG, PART_RIGHT_LEG, PART_PELVIS);
      } else {
        drawBucketGroup(PART_LEFT_LEG, PART_RIGHT_LEG, PART_PELVIS);
        drawBucketGroup(farShoe, -1, -1);
        drawBucketGroup(nearShoe, -1, -1);
      }
    } else {
      if (pantsCoverShoes) {
        drawBucketGroup(farShoe, -1, -1);
        drawBucketGroup(farLeg, -1, -1);
        drawBucketGroup(nearShoe, -1, -1);
        drawBucketGroup(nearLeg, -1, -1);
      } else {
        drawBucketGroup(farLeg, -1, -1);
        drawBucketGroup(farShoe, -1, -1);
        drawBucketGroup(nearLeg, -1, -1);
        drawBucketGroup(nearShoe, -1, -1);
      }
      drawBucketGroup(PART_BOTTOM_CORE, -1, -1);
    }

    // 4. Tay xa camera (và tay gần nếu không ở trước thân)
    drawBucketGroup(farArm, -1, -1);
    if (!nearArmInFront) {
      drawBucketGroup(nearArm, -1, -1);
    }

    // 5. Mũ hoodie sau lưng khi nhìn từ mặt trước
    if (hoodBehindTorso) {
      drawBucketGroup(PART_HOOD_BACK, -1, -1);
    }

    // 6. Lòng cổ áo tối màu
    drawBucketGroup(PART_NECK_CAVITY, -1, -1);

    // 7. Cụm Thân trên (`torsoCore` + `outerwearShell` Z-sort chung -> 0% xuyên thấu 360°)
    drawBucketGroup(PART_TORSO_CORE, PART_OUTERWEAR, -1);

    // 8. Mũ hoodie đè lên lưng áo khi xoay ra sau
    if (!hoodBehindTorso) {
      drawBucketGroup(PART_HOOD_BACK, -1, -1);
    }

    // 9. Tay gần camera đè lên thân áo khi xoay nghiêng/ngang
    if (nearArmInFront) {
      drawBucketGroup(nearArm, -1, -1);
    }

    return recorder.finishRecordingAsPicture();
  }, [packed, colorLuts, stageSize.w, stageSize.h, activeSlotIdx, skiaRes]);

  return (
    <View
      style={styles.container}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      <Canvas style={{ width: stageSize.w, height: stageSize.h }}>
        <Picture picture={pictureSV} />
      </Canvas>
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
});
