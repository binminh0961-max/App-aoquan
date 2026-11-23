// src/engine/OutfitEngine.ts
/**
 * OutfitEngine - Lõi xử lý phối màu & tính toán tỷ lệ thị giác trang phục
 * Hỗ trợ 2 chế độ:
 * 1. Cơ bản 60-30-10: Quần/Váy (60%) – Áo (30%) – Giày (10%)
 * 2. Phối nhiều lớp 40-20-30-10: Áo khoác (40%) – Áo trong (20%) – Quần/Váy (30%) – Giày (10%)
 * Tính toán bù trừ diện tích thị giác (visualRatio) dựa trên phom dáng thực tế (Silhouette)
 * Xoay vòng biến thể (Lock & Shuffle) giữ nguyên món đã khóa và hòa hợp màu HSL/Delta E
 */

import { FashionColor, FASHION_COLORS } from '../constants/fashionColors';
import { deltaE2000, hexToRgb, rgbToLab, RGB } from '../services/ColorEngine';
import {
  OutfitSlotId,
  SilhouetteId,
  SilhouetteOption,
  OutfitItemState,
  OutfitSlotsMap,
  VisualRatiosMap,
  StudioOutfitState,
  SilhouetteStyleType,
  OutfitSuggestion,
  OutfitStyleId,
  OutfitProportions,
  OutfitSlots,
  StyleHarmonyMode,
  OccasionMode,
  SkinUndertone,
  UndertoneFitLevel,
  OutfitFilterContext,
  FabricColorGroup,
  PaletteDisplayGroupId,
  OutfitAdvice,
  StudioPresetOutfit,
} from '../types/outfit';

export interface HSL {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
}

export interface FabricCatalogEntry {
  color: FashionColor;
  hsl: HSL;
  fabricGroup: FabricColorGroup;
  displayGroup: PaletteDisplayGroupId;
}

export interface PaletteGroupSection {
  id: PaletteDisplayGroupId;
  label: string;
  colors: FashionColor[];
}

export function shortColorName(name: string): string {
  const idx = name.indexOf('(');
  return idx > 0 ? name.slice(0, idx).trim() : name;
}

// =============================================================
// 1. DANH SÁCH PHOM DÁNG & HỆ SỐ DIỆN TÍCH (AREA FACTOR)
// =============================================================

export const TOP_SILHOUETTES: SilhouetteOption[] = [
  {
    id: 'baby_tee',
    label: 'Baby Tee',
    slotId: 'top',
    areaFactor: 0.72,
    iconName: 'shirt-outline',
    description: 'Phom ôm dáng, tay cực ngắn, gấu cắt trên rốn trẻ trung (Dành cho Nữ)',
  },
  {
    id: 'tshirt',
    label: 'Áo thun',
    slotId: 'top',
    areaFactor: 1.0,
    iconName: 'shirt-outline',
    description: 'Cổ tròn cơ bản, độ rủ tự nhiên, dễ kết hợp mọi phong cách',
  },
  {
    id: 'polo',
    label: 'Áo Polo',
    slotId: 'top',
    areaFactor: 1.02,
    iconName: 'ribbon-outline',
    description: 'Cổ bẻ gập gọn kèm trụ 3 cúc thanh lịch, tay ôm bắp tay (Dành cho Nam)',
  },
  {
    id: 'blouse',
    label: 'Áo kiểu',
    slotId: 'top',
    areaFactor: 1.06,
    iconName: 'sparkles-outline',
    description: 'Cổ vuông thanh thoát khoe quai xanh, tay lỡ phồng nhẹ chiết eo (Dành cho Nữ)',
  },
  {
    id: 'shirt',
    label: 'Sơ mi',
    slotId: 'top',
    areaFactor: 1.12,
    iconName: 'business-outline',
    description: 'Cổ bẻ sắc sảo, hàng cúc dọc chỉn chu, tay dài măng-séc gọn gàng',
  },
  {
    id: 'hoodie',
    label: 'Hoodie',
    slotId: 'top',
    areaFactor: 1.24,
    iconName: 'snow-outline',
    description: 'Vai xuôi rộng, mũ rũ tự nhiên sau lưng, dây rút & túi kangaroo, bo gấu gọn',
  },
  {
    id: 'blazer',
    label: 'Blazer',
    slotId: 'top',
    areaFactor: 1.25,
    iconName: 'file-tray-full-outline',
    description: 'Cầu vai vuông đứng, ve áo chữ V có khía sang trọng và xẻ tà sau lưng',
  },
];

export function getTopSilhouettes(styleType: SilhouetteStyleType = 'male'): SilhouetteOption[] {
  const order: SilhouetteId[] =
    styleType === 'female'
      ? ['baby_tee', 'tshirt', 'blouse', 'shirt', 'hoodie', 'blazer']
      : ['tshirt', 'polo', 'shirt', 'hoodie', 'blazer'];
  return order
    .map(id => TOP_SILHOUETTES.find(item => item.id === id))
    .filter((item): item is SilhouetteOption => Boolean(item));
}

export const OUTERWEAR_SILHOUETTES: SilhouetteOption[] = [
  {
    id: 'blazer',
    label: 'Blazer',
    slotId: 'outerwear',
    areaFactor: 1.25,
    iconName: 'file-tray-full-outline',
    description: 'Vai đứng, ve áo chữ V có khía, vạt mở thẳng để lộ 20% áo trong',
  },
  {
    id: 'shirt',
    label: 'Sơ mi khoác',
    slotId: 'outerwear',
    areaFactor: 1.12,
    iconName: 'business-outline',
    description: 'Cổ bẻ mềm, vạt suông thả buông, hàng cúc dọc mép và cổ tay măng-séc',
  },
  {
    id: 'hoodie',
    label: 'Hoodie khoác',
    slotId: 'outerwear',
    areaFactor: 1.24,
    iconName: 'snow-outline',
    description: 'Mũ trùm rũ sau lưng, 2 dây rút, khóa kéo kim loại mở giữa & túi kangaroo chia đôi',
  },
];

export const BOTTOM_SILHOUETTES: SilhouetteOption[] = [
  {
    id: 'wide_pants',
    label: 'Quần suông',
    slotId: 'bottom',
    areaFactor: 1.15,
    iconName: 'male-outline',
    description: 'Ống suông thẳng phủ nhẹ mu giày kèm đường ly đứng thanh lịch',
  },
  {
    id: 'jeans',
    label: 'Quần Jean',
    slotId: 'bottom',
    areaFactor: 1.0,
    iconName: 'grid-outline',
    description: 'Ống đứng ôm gọn trên cổ giày, đủ túi trước/sau, đường may nổi denim',
  },
  {
    id: 'shorts',
    label: 'Quần Short',
    slotId: 'bottom',
    areaFactor: 0.58,
    iconName: 'cut-outline',
    description: 'Cắt gọn trên đầu gối năng động, thoáng mát cho ngày dạo phố',
  },
  {
    id: 'a_line_skirt',
    label: 'Váy chữ A',
    slotId: 'bottom',
    areaFactor: 0.68,
    iconName: 'woman-outline',
    description: 'Dáng xòe mềm ngang gối 360°, thắt eo duyên dáng (Dành cho Nữ)',
  },
  {
    id: 'mini_skirt',
    label: 'Váy ngắn',
    slotId: 'bottom',
    areaFactor: 0.48,
    iconName: 'sparkles-outline',
    description: 'Cạp cao ngắn ngang giữa đùi, ôm hông trẻ trung tôn đôi chân (Dành cho Nữ)',
  },
];

export function getBottomSilhouettes(styleType: SilhouetteStyleType = 'male'): SilhouetteOption[] {
  const order: SilhouetteId[] =
    styleType === 'female'
      ? ['wide_pants', 'jeans', 'shorts', 'a_line_skirt', 'mini_skirt']
      : ['wide_pants', 'jeans', 'shorts'];
  return order
    .map(id => BOTTOM_SILHOUETTES.find(item => item.id === id))
    .filter((item): item is SilhouetteOption => Boolean(item));
}

export const SHOES_SILHOUETTES: SilhouetteOption[] = [
  {
    id: 'sneaker',
    label: 'Sneaker',
    slotId: 'shoes',
    areaFactor: 1.0,
    iconName: 'footsteps-outline',
    description: 'Giày thể thao đế trắng dày năng động cùng dây buộc đan chéo',
  },
  {
    id: 'loafer',
    label: 'Loafer',
    slotId: 'shoes',
    areaFactor: 0.92,
    iconName: 'ribbon-outline',
    description: 'Giày lười cổ thấp thanh lịch, đế tối màu cùng đai ngang mu giày',
  },
  {
    id: 'dress_shoes',
    label: 'Giày da',
    slotId: 'shoes',
    areaFactor: 0.95,
    iconName: 'briefcase-outline',
    description: 'Giày tây mũi thuôn dài bóng nhẹ, đường chỉ ngang mũi & gót tách biệt (Dành cho Nam)',
  },
  {
    id: 'heels',
    label: 'Cao gót',
    slotId: 'shoes',
    areaFactor: 0.82,
    iconName: 'sparkles-outline',
    description: 'Mũi nhọn khoét mu sâu thanh thoát, gót cao mảnh tôn dáng (Dành cho Nữ)',
  },
  {
    id: 'boot',
    label: 'Boot',
    slotId: 'shoes',
    areaFactor: 1.18,
    iconName: 'flash-outline',
    description: 'Cổ cao ôm mắt cá chân, đế dày cá tính kiểu Chelsea Boot',
  },
];

export function getShoesSilhouettes(styleType: SilhouetteStyleType = 'male'): SilhouetteOption[] {
  const order: SilhouetteId[] =
    styleType === 'female'
      ? ['sneaker', 'loafer', 'heels', 'boot']
      : ['sneaker', 'loafer', 'dress_shoes', 'boot'];
  return order
    .map(id => SHOES_SILHOUETTES.find(item => item.id === id))
    .filter((item): item is SilhouetteOption => Boolean(item));
}

export const ALL_SILHOUETTES: SilhouetteOption[] = [
  ...TOP_SILHOUETTES,
  ...OUTERWEAR_SILHOUETTES,
  ...BOTTOM_SILHOUETTES,
  ...SHOES_SILHOUETTES,
];

export function getSilhouetteOption(id: SilhouetteId): SilhouetteOption {
  const found = ALL_SILHOUETTES.find(item => item.id === id);
  if (found) return found;
  return TOP_SILHOUETTES[0];
}

// =============================================================
// 2. CHUYỂN ĐỔI MÀU HEX <-> HSL <-> RGB & TÌM MÀU
// =============================================================

export function hexToHsl(hex: string): HSL {
  const { r, g, b } = hexToRgb(hex);
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const lNorm = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = lNorm > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h = h * 60;
  }

  return {
    h: Math.round((h + 360) % 360),
    s: Math.round(s * 100),
    l: Math.round(lNorm * 100),
  };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;
  const hNorm = ((h % 360) + 360) % 360;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hNorm < 60) {
    rPrime = c;
    gPrime = x;
    bPrime = 0;
  } else if (hNorm < 120) {
    rPrime = x;
    gPrime = c;
    bPrime = 0;
  } else if (hNorm < 180) {
    rPrime = 0;
    gPrime = c;
    bPrime = x;
  } else if (hNorm < 240) {
    rPrime = 0;
    gPrime = x;
    bPrime = c;
  } else if (hNorm < 300) {
    rPrime = x;
    gPrime = 0;
    bPrime = c;
  } else {
    rPrime = c;
    gPrime = 0;
    bPrime = x;
  }

  return {
    r: Math.max(0, Math.min(255, Math.round((rPrime + m) * 255))),
    g: Math.max(0, Math.min(255, Math.round((gPrime + m) * 255))),
    b: Math.max(0, Math.min(255, Math.round((bPrime + m) * 255))),
  };
}

export function isNeutralColor(hsl: HSL, category?: string): boolean {
  if (hsl.s < 16 || hsl.l < 16 || hsl.l > 88) {
    return true;
  }
  if (category === 'white_beige' || category === 'gray_black') {
    return true;
  }
  return false;
}

export function findClosestFashionColor(
  targetHsl: HSL,
  excludeIds: string[] = []
): FashionColor {
  const rgb = hslToRgb(targetHsl.h, targetHsl.s, targetHsl.l);
  const targetLab = rgbToLab(rgb);

  const available = FASHION_COLORS.filter(item => !excludeIds.includes(item.id));
  const pool = available.length > 0 ? available : FASHION_COLORS;

  let best = pool[0];
  let minDeltaE = Number.POSITIVE_INFINITY;

  for (const item of pool) {
    const dE = deltaE2000(targetLab, item.lab);
    if (dE < minDeltaE) {
      minDeltaE = dE;
      best = item;
    }
  }

  return best;
}

export function getNeutralColorOptions(
  lightPreference: 'light' | 'dark',
  excludeIds: string[] = []
): FashionColor[] {
  return FASHION_COLORS.filter(c => {
    if (excludeIds.includes(c.id)) return false;
    const hsl = hexToHsl(c.hex);
    const neutral = isNeutralColor(hsl, c.category);
    if (!neutral) return false;
    return lightPreference === 'light' ? hsl.l >= 50 : hsl.l < 50;
  });
}

// =============================================================
// 2B. NẠP TOÀN BỘ BẢNG MÀU VẢI TỪ fashionColors.ts + PHÂN NHÓM CHUẨN
// =============================================================

const EARTH_WARM_IDS = new Set([
  'rp-4', // Đỏ Đất
  'rp-5', // Cam Đất
  'rp-6', // Cam Cháy
  'yp-1', // Vàng Mù Tạt
  'yp-2', // Vàng Bơ
]);

function classifyFabricGroup(color: FashionColor, hsl: HSL): FabricColorGroup {
  if (color.category === 'white_beige' || color.category === 'gray_black') {
    return 'neutral';
  }
  if (
    color.category === 'brown_camel' ||
    color.id === 'gr-1' ||
    color.id === 'gr-2' ||
    color.id === 'rp-4' ||
    color.id === 'rp-5'
  ) {
    return 'earth';
  }
  if (color.category === 'blue_navy' || color.category === 'green') {
    return 'cool';
  }
  if (color.id === 'rp-6' || color.id === 'yp-1' || color.id === 'yp-2') {
    return 'warm';
  }
  if (hsl.s < 16) return 'neutral';
  return 'accent';
}

function classifyDisplayGroup(color: FashionColor): PaletteDisplayGroupId {
  if (color.category === 'white_beige' || color.category === 'gray_black') {
    return 'neutral';
  }
  if (color.category === 'brown_camel' || EARTH_WARM_IDS.has(color.id)) {
    return 'earth_warm';
  }
  if (color.category === 'blue_navy' || color.category === 'green') {
    return 'cool';
  }
  return 'accent';
}

/** Toàn bộ bảng màu vải chuẩn từ fashionColors.ts đã ánh xạ sẵn HSL và nhóm sắc độ */
export const STUDIO_FABRIC_CATALOG: FabricCatalogEntry[] = FASHION_COLORS.map(
  color => {
    const hsl = hexToHsl(color.hex);
    return {
      color,
      hsl,
      fabricGroup: classifyFabricGroup(color, hsl),
      displayGroup: classifyDisplayGroup(color),
    };
  }
);

const PALETTE_GROUP_LABELS: { id: PaletteDisplayGroupId; label: string }[] = [
  { id: 'neutral', label: 'Trung tính' },
  { id: 'earth_warm', label: 'Đất & Ấm' },
  { id: 'cool', label: 'Xanh & Lạnh' },
  { id: 'accent', label: 'Điểm nhấn' },
];

export function getGroupedFashionColors(): PaletteGroupSection[] {
  return PALETTE_GROUP_LABELS.map(group => ({
    id: group.id,
    label: group.label,
    colors: STUDIO_FABRIC_CATALOG.filter(e => e.displayGroup === group.id).map(
      e => e.color
    ),
  }));
}

function hueDistance(h1: number, h2: number): number {
  const diff = Math.abs(((h1 - h2) % 360 + 360) % 360);
  return diff > 180 ? 360 - diff : diff;
}

const CLASSIC_BASE_IDS = new Set(['bn-1', 'bn-2', 'bn-3', 'gr-1', 'gr-2', 'gr-4', 'bc-1', 'bc-2']);

// =============================================================
// 2C. ĐÁNH GIÁ MÀU THEO TÔNG DA (UNDERTONE) & HOÀN CẢNH (OCCASION)
// =============================================================

const WARM_FLATTERING_IDS = new Set([
  'wb-3', // Trắng Kem
  'wb-4', // Ngà Voi
  'wb-5', // Be Cát
  'wb-6', // Be Sáng
  'gr-1', // Xanh Olive
  'gr-2', // Xanh Rêu
  'gr-4', // Xanh Cổ Vịt Đậm (ấm sâu)
  'gr-5', // Xanh Bơ
  'rp-1', // Đỏ Đô ấm
  'rp-3', // Đỏ San Hô
  'rp-4', // Đỏ Đất
  'rp-5', // Cam Đất
  'rp-6', // Cam Cháy
  'bc-1', // Nâu Socola
  'bc-2', // Nâu Cà Phê
  'bc-3', // Nâu Camel
  'bc-4', // Nâu Bò
  'bc-5', // Nâu Khói
  'bc-6', // Nâu Hạt Dẻ
  'yp-1', // Vàng Mù Tạt
  'yp-2', // Vàng Bơ
]);

const WARM_CAUTION_IDS = new Set([
  'wb-1', // Trắng Tinh lạnh gắt
  'gb-4', // Xám Ghi lạnh
  'gb-5', // Xám Bạc lạnh
  'gb-6', // Xám Khói lạnh
  'bn-4', // Xanh Denim sáng lạnh
  'bn-5', // Xanh Coban lạnh gắt
  'bn-6', // Xanh Lam Nhạt băng giá
  'bn-7', // Xanh Baby Pastel lạnh
  'gr-6', // Xanh Mint lạnh
  'rp-7', // Hồng Pastel lạnh
  'rp-9', // Hồng Cánh Sen lạnh
  'yp-3', // Tím Lavender lạnh
  'yp-4', // Tím Mận lạnh
  'yp-5', // Tím Pastel lạnh
]);

const COOL_FLATTERING_IDS = new Set([
  'wb-1', // Trắng Tinh
  'wb-2', // Trắng Sữa
  'gb-1', // Đen Than
  'gb-2', // Đen Nhám
  'gb-3', // Xám Chì
  'gb-4', // Xám Ghi
  'gb-5', // Xám Bạc
  'gb-6', // Xám Khói
  'bn-1', // Xanh Navy Đậm
  'bn-2', // Xanh Navy Cổ Điển
  'bn-3', // Xanh Denim Đậm
  'bn-4', // Xanh Denim Cơ Bản
  'bn-5', // Xanh Coban
  'bn-6', // Xanh Lam Nhạt
  'bn-7', // Xanh Baby Pastel
  'gr-3', // Xanh Cổ Vịt
  'gr-4', // Xanh Cổ Vịt Đậm
  'gr-6', // Xanh Mint
  'gr-7', // Xanh Lục Bảo
  'rp-1', // Đỏ Đô
  'rp-2', // Đỏ Rượu Vang
  'rp-7', // Hồng Pastel lạnh
  'rp-9', // Hồng Cánh Sen
  'yp-3', // Tím Lavender
  'yp-4', // Tím Mận
  'yp-5', // Tím Pastel
]);

const COOL_CAUTION_IDS = new Set([
  'wb-5', // Be Cát ánh vàng
  'wb-6', // Be Sáng ánh vàng
  'gr-1', // Xanh Olive vàng
  'gr-2', // Xanh Rêu ấm
  'rp-4', // Đỏ Đất
  'rp-5', // Cam Đất
  'rp-6', // Cam Cháy
  'bc-3', // Nâu Camel ánh vàng
  'bc-4', // Nâu Bò vàng
  'bc-6', // Nâu Hạt Dẻ ấm
  'yp-1', // Vàng Mù Tạt
  'yp-2', // Vàng Bơ
]);

const STUDY_FAVORITES = new Set([
  'wb-1', 'wb-2', 'wb-3', 'wb-5', 'wb-6',
  'gb-5', 'gb-6',
  'bn-3', 'bn-4', 'bn-6', 'bn-7',
  'gr-1', 'gr-2', 'gr-5', 'gr-6',
  'rp-7', 'yp-2', 'yp-5',
]);

const WORK_STAPLES = new Set([
  'wb-1', 'wb-2', 'wb-3', 'wb-4', 'wb-5', 'wb-6',
  'gb-1', 'gb-2', 'gb-3', 'gb-4', 'gb-6',
  'bn-1', 'bn-2', 'bn-7',
  'bc-1', 'bc-2', 'bc-3', 'bc-5',
  'gr-5',
]);

const WORK_SECONDARY = new Set(['bn-3', 'gr-1', 'gr-2', 'gr-4', 'rp-2', 'rp-8', 'gb-5']);

const CASUAL_FAVORITES = new Set([
  'yp-1', 'yp-2',
  'gr-1', 'gr-2', 'gr-5', 'gr-6',
  'rp-4', 'rp-5', 'rp-8',
  'bn-3', 'bn-4', 'bn-6',
  'wb-1', 'wb-3', 'wb-5', 'wb-6',
  'bc-3', 'bc-4', 'bc-5',
]);

const PARTY_DARK_LUXE = new Set([
  'gb-1', 'gb-2', 'gb-3',
  'bn-1', 'bn-2',
  'bc-1', 'bc-2',
  'rp-1', 'rp-2',
  'gr-4', 'gr-7',
  'yp-4',
]);

const PARTY_CLEAN_HIGHLIGHT = new Set(['wb-1', 'wb-2', 'wb-3', 'wb-4', 'bc-3']);

const PARTY_AVOID = new Set(['bn-7', 'yp-5', 'yp-2', 'gr-6', 'rp-7', 'bn-6', 'bn-4', 'yp-1', 'rp-6']);

export function getOccasionLabel(occasion: OccasionMode): string {
  switch (occasion) {
    case 'study':
      return 'Đi học';
    case 'work':
      return 'Đi làm';
    case 'casual':
      return 'Đi chơi';
    case 'party':
      return 'Tiệc tối';
    default:
      return 'Tự do';
  }
}

export function getOccasionShortLabel(occasion: OccasionMode): string {
  switch (occasion) {
    case 'study':
      return 'Đi học';
    case 'work':
      return 'Đi làm';
    case 'casual':
      return 'Đi chơi';
    case 'party':
      return 'Tiệc tối';
    default:
      return 'Tự do';
  }
}

export function getUndertoneLabel(undertone: SkinUndertone): string {
  switch (undertone) {
    case 'warm':
      return 'Da ấm';
    case 'cool':
      return 'Da lạnh';
    default:
      return 'Da trung tính';
  }
}

/**
 * Đánh giá mức độ tôn da của một màu vải đối với tông da người dùng.
 * Áp dụng chuẩn khoa học màu sắc cho vùng sát khuôn mặt (Áo / Áo khoác).
 */
export function evaluateColorForUndertone(
  color: FashionColor,
  undertone: SkinUndertone
): UndertoneFitLevel {
  const hsl = hexToHsl(color.hex);

  if (undertone === 'neutral') {
    if (hsl.s <= 75 || isNeutralColor(hsl, color.category)) {
      return 'flattering';
    }
    return 'neutral';
  }

  if (undertone === 'warm') {
    if (WARM_FLATTERING_IDS.has(color.id)) return 'flattering';
    if (WARM_CAUTION_IDS.has(color.id)) return 'caution';

    // Fallback theo HSL cho màu chụp tùy chỉnh ngoài bảng 46 màu
    if (hsl.l >= 92 && hsl.s <= 12) return 'caution'; // Trắng tinh lạnh gắt
    if (hsl.s <= 14 && hsl.l >= 38 && hsl.l <= 88) return 'caution'; // Xám lạnh
    if (hsl.h >= 15 && hsl.h <= 110 && hsl.s >= 14) return 'flattering';
    if ((hsl.h >= 195 && hsl.h <= 335) && hsl.s >= 28 && hsl.l >= 30) return 'caution';
    return 'neutral';
  }

  // undertone === 'cool'
  if (COOL_FLATTERING_IDS.has(color.id)) return 'flattering';
  if (COOL_CAUTION_IDS.has(color.id)) return 'caution';

  // Fallback theo HSL cho màu chụp tùy chỉnh
  if (hsl.s <= 15 && (hsl.l <= 30 || hsl.l >= 92)) return 'flattering';
  if (hsl.h >= 195 && hsl.h <= 345) return 'flattering';
  if (hsl.h >= 22 && hsl.h <= 95 && hsl.s >= 30) return 'caution';
  return 'neutral';
}

/**
 * Chấm điểm một màu sắc cho vị trí slot cụ thể theo Hoàn cảnh (OccasionMode) & Tông da (SkinUndertone).
 * Lưu ý: Trọng số Tông da CHỈ áp dụng cho vùng sát khuôn mặt (`top`, và `outerwear` khi `isLayering === true`).
 * Quần & Giày nằm xa mặt nên không bị gò bó bởi tông da.
 */
export function scoreColorForContext(
  color: FashionColor,
  slotId: OutfitSlotId,
  isLayering: boolean,
  context: OutfitFilterContext
): number {
  const hsl = hexToHsl(color.hex);
  const { occasion, undertone } = context;
  let score = 0;

  // 1. CHẤM ĐIỂM THEO 4 HOÀN CẢNH (OCCASION)
  if (occasion === 'study') {
    // Đi học: tươi trẻ, gọn gàng, năng động (Trắng, Be, Denim, Xanh Rêu, Xám nhạt, Pastel)
    if (STUDY_FAVORITES.has(color.id)) {
      score += 24;
    } else if (hsl.l >= 40 && hsl.s <= 58) {
      score += 12;
    }
    if (slotId === 'bottom' && (color.id === 'bn-3' || color.id === 'bn-4' || color.id === 'wb-5' || color.id === 'gb-3')) {
      score += 12;
    }
    if (slotId === 'shoes' && (color.id === 'wb-1' || color.id === 'wb-2' || color.id === 'wb-3' || color.id === 'gb-6')) {
      score += 14;
    }
    // Hạn chế tông tiệc tối quá nặng nề hoặc chói gắt
    if ((color.id === 'rp-1' || color.id === 'rp-2' || color.id === 'yp-4') && slotId !== 'shoes') {
      score -= 18;
    }
    if (hsl.s > 78 && hsl.l > 25 && hsl.l < 72) {
      score -= 18;
    }
  } else if (occasion === 'work') {
    // Đi làm: chỉn chu, lịch sự, độ bão hòa thấp (Navy, Trắng Kem, Xám Khói, Be Cát, Đen Than)
    if (WORK_STAPLES.has(color.id)) {
      score += 24;
    } else if (WORK_SECONDARY.has(color.id)) {
      score += 11;
    } else if (hsl.s <= 48) {
      score += 18;
    }

    // Phạt mạnh màu quá chói ở mảng lớn (Áo / Khoác / Quần)
    if (hsl.s > 62 && hsl.l > 24 && hsl.l < 84) {
      score -= slotId === 'shoes' ? 16 : 36;
    }
  } else if (occasion === 'casual') {
    // Đi chơi: phóng khoáng, cá tính, mở khóa tông đất & tương phản năng động
    if (CASUAL_FAVORITES.has(color.id)) {
      score += 22;
    } else if (!isNeutralColor(hsl, color.category) && hsl.l >= 28 && hsl.l <= 82) {
      score += 10;
    }

    // Cho phép sắc độ trẻ trung ở mảng 30% và giày điểm nhấn 10%
    if ((slotId === 'shoes' || slotId === 'top') && !isNeutralColor(hsl, color.category) && hsl.s >= 35) {
      score += 8;
    }
    // Giảm nhẹ cảm giác quá cứng nhắc nếu dùng toàn đen/navy đậm ở mảng lớn
    if ((color.id === 'bn-1' || color.id === 'gb-2') && slotId !== 'shoes') {
      score -= 6;
    }
  } else if (occasion === 'party') {
    // Tiệc tối: sang trọng, monochrome tối sâu hoặc tương phản mạnh
    if (PARTY_DARK_LUXE.has(color.id) || hsl.l <= 38) {
      score += 26;
    } else if (PARTY_CLEAN_HIGHLIGHT.has(color.id)) {
      // Mảng sáng sạch để tạo tương phản sang trọng cùng nền tối 60%
      score += slotId === 'top' ? 22 : 12;
    }

    if (PARTY_AVOID.has(color.id)) {
      score -= 30;
    } else if (hsl.l > 78 && hsl.s > 35 && !PARTY_CLEAN_HIGHLIGHT.has(color.id)) {
      score -= 22;
    }
  }

  // 2. CHẤM ĐIỂM THEO TÔNG DA — CHỈ TẬP TRUNG VÀO VÙNG SÁT KHUÔN MẶT
  const isNearFace = slotId === 'top' || (slotId === 'outerwear' && isLayering);
  if (isNearFace) {
    const fit = evaluateColorForUndertone(color, undertone);
    if (undertone === 'warm' || undertone === 'cool') {
      if (fit === 'flattering') score += 32;
      else if (fit === 'neutral') score += 4;
      else score -= 38;
    } else {
      // Da trung tính: ưu tiên sắc độ cân bằng không quá chói gắt
      if (fit === 'flattering') score += 6;
    }
  }

  return score;
}

/**
 * Sinh lời khuyên Stylist ngắn gọn bằng tiếng Việt tự nhiên giải thích lý do bộ màu hài hòa
 * (lồng ghép 4 Hoàn cảnh + Tông da) hoặc đưa ra Mẹo xử lý thực tế (Rescue Tip) khi áo sát mặt kén tông da.
 */
export function generateOutfitAdvice(
  outfit: StudioOutfitState,
  contextOverride?: Partial<OutfitFilterContext>
): OutfitAdvice {
  const { isLayering, slots } = outfit;
  const occasion: OccasionMode = contextOverride?.occasion ?? outfit.occasion ?? 'all';
  const undertone: SkinUndertone = contextOverride?.undertone ?? outfit.undertone ?? 'neutral';

  const activeKeys: OutfitSlotId[] = isLayering
    ? ['outerwear', 'top', 'bottom', 'shoes']
    : ['top', 'bottom', 'shoes'];

  const items = activeKeys.map(key => {
    const color = slots[key].color;
    const hsl = hexToHsl(color.hex);
    const neutral = isNeutralColor(hsl, color.category);
    return {
      key,
      color,
      name: shortColorName(color.name),
      hsl,
      neutral,
      locked: slots[key].locked,
      isBase: Boolean(slots[key].isBase),
    };
  });

  const shoes = items.find(it => it.key === 'shoes')!;
  const bottom = items.find(it => it.key === 'bottom')!;
  const top = items.find(it => it.key === 'top')!;
  const outer = isLayering ? items.find(it => it.key === 'outerwear') : undefined;

  // 0. KIỂM TRA MẸO XỬ LÝ TÔNG DA (RESCUE TIP) KHI MÓN SÁT MẶT KÉN DA ẤM / DA LẠNH
  if (undertone === 'warm' || undertone === 'cool') {
    const undertoneLabel = getUndertoneLabel(undertone);
    const topFit = evaluateColorForUndertone(top.color, undertone);
    const outerFit = outer ? evaluateColorForUndertone(outer.color, undertone) : null;
    const recommendedHint = undertone === 'warm' ? 'tông ấm (Kem, Be, Nâu)' : 'tông lạnh (Navy, Trắng, Xám)';

    if (!isLayering && topFit === 'caution') {
      return {
        title: `Mẹo tôn ${undertoneLabel}`,
        reason: top.isBase
          ? `Màu áo ${top.name} hơi kén ${undertoneLabel} — thử bấm chuyển 'Màu chụp' xuống Quần/Giày, hoặc bật '+ Áo khoác' ${recommendedHint} để sáng mặt nhé.`
          : `Áo ${top.name} hơi kén ${undertoneLabel} — thử chọn màu có dấu 'Tôn da' trong bảng màu, hoặc bật '+ Áo khoác' ${recommendedHint} nhé.`,
        isWarning: true,
      };
    }

    if (isLayering && outer && outerFit === 'caution') {
      return {
        title: `Mẹo tôn ${undertoneLabel}`,
        reason: outer.isBase
          ? `Áo khoác ${outer.name} sát mặt hơi kén ${undertoneLabel} — bạn thử chuyển 'Màu chụp' xuống Quần/Giày để gương mặt rạng rỡ hơn nhé.`
          : `Áo khoác ${outer.name} hơi kén ${undertoneLabel} — thử đổi khoác sang ${recommendedHint} để tạo khung sáng tôn mặt nhé.`,
        isWarning: true,
      };
    }
  }

  // 1. Kiểm tra cảnh báo: 2 màu bão hòa cao cạnh tranh nhau (gây chói mắt)
  const vividItems = items.filter(
    it =>
      !it.neutral &&
      !CLASSIC_BASE_IDS.has(it.color.id) &&
      it.hsl.s >= 56 &&
      it.hsl.l >= 24 &&
      it.hsl.l <= 76
  );
  if (vividItems.length >= 2) {
    for (let i = 0; i < vividItems.length; i++) {
      for (let j = i + 1; j < vividItems.length; j++) {
        const a = vividItems[i];
        const b = vividItems[j];
        const hDiff = hueDistance(a.hsl.h, b.hsl.h);
        const dE = deltaE2000(a.color.lab, b.color.lab);
        if (hDiff >= 38 && dE >= 24) {
          return {
            title: 'Cần tiết chế độ nổi',
            reason: `${a.name} và ${b.name} đang có độ nổi ngang nhau, thử đổi giày sang Trắng Tinh hoặc Đen Than để cân bằng lại.`,
            isWarning: true,
          };
        }
      }
    }
  }

  // 2. Kiểm tra cảnh báo: tất cả các món trùng độ sáng (thiếu điểm nhấn chiều sâu)
  // (Trừ trường hợp Monochrome tối sang trọng khi đi Tiệc tối)
  const ls = items.map(it => it.hsl.l);
  const minL = Math.min(...ls);
  const maxL = Math.max(...ls);
  const isPartyMonochromeDark = occasion === 'party' && maxL <= 36;
  if (!isPartyMonochromeDark && maxL - minL < 14 && minL >= 20 && maxL <= 84) {
    return {
      title: 'Thiếu điểm nhấn sáng-tối',
      reason:
        'Các món đang trùng độ sáng nên tổng thể hơi phẳng, thử đổi áo hoặc giày sang tông sáng/tối hơn để nổi bật.',
      isWarning: true,
    };
  }

  // 3. Phân tích tích cực có lồng ghép 4 Hoàn cảnh + Tông da sát khuôn mặt
  const faceAnchor = isLayering && outer ? outer : top;
  const faceFit = evaluateColorForUndertone(faceAnchor.color, undertone);
  const hasSpecificUndertone = undertone === 'warm' || undertone === 'cool';
  const undertoneLabel = getUndertoneLabel(undertone);
  const isFaceFlattering = hasSpecificUndertone && faceFit === 'flattering';

  const nonNeutrals = items.filter(it => !it.neutral);
  const toneWord = (l: number) => (l < 34 ? 'trầm' : l > 70 ? 'sáng' : 'ấm dịu');

  // Nếu đang chọn Hoàn cảnh cụ thể -> câu nhận xét chuẩn tinh thần từng trong 4 hoàn cảnh
  if (occasion !== 'all') {
    const occasionTag = getOccasionShortLabel(occasion);

    if (occasion === 'study') {
      if (isFaceFlattering) {
        return {
          title: `Chuẩn ${occasionTag} • Tôn ${undertoneLabel}`,
          reason: `Phom gọn năng động chuẩn đi học — sắc ${faceAnchor.name} sát mặt tôn ${undertoneLabel} tươi tắn, trẻ trung hơn.`,
        };
      }
      return {
        title: `Năng động • Chuẩn ${occasionTag}`,
        reason: `${top.name} phối cùng ${bottom.name} và giày ${shoes.name} gọn gàng, thoải mái, rất hợp không khí giảng đường.`,
      };
    }

    if (occasion === 'work') {
      if (isFaceFlattering) {
        return {
          title: `Chuẩn ${occasionTag} • Tôn ${undertoneLabel}`,
          reason: `Phom chỉn chu thanh lịch chuẩn công sở — sắc ${faceAnchor.name} sát mặt giúp tôn nền ${undertoneLabel} sáng và gọn mắt.`,
        };
      }
      return {
        title: `Chỉn chu • Chuẩn ${occasionTag}`,
        reason: `${top.name} kết hợp ${bottom.name} và giày ${shoes.name} giữ sắc độ trầm dịu, lịch sự, chuyên nghiệp nơi làm việc.`,
      };
    }

    if (occasion === 'casual') {
      if (isFaceFlattering) {
        return {
          title: `${occasionTag} Phóng khoáng • Tôn ${undertoneLabel}`,
          reason: `Tổ hợp trẻ trung chuẩn dạo phố — sắc ${faceAnchor.name} sát mặt giúp ${undertoneLabel} trông nổi bật, tự nhiên hơn.`,
        };
      }
      return {
        title: `Cá tính • Chuẩn ${occasionTag}`,
        reason: `${top.name} phối cùng ${bottom.name} và giày ${shoes.name} mang lại nhịp màu phóng khoáng, thoải mái khi đi chơi.`,
      };
    }

    // occasion === 'party'
    if (isPartyMonochromeDark) {
      return {
        title: isFaceFlattering ? `${occasionTag} Trầm sâu • Tôn ${undertoneLabel}` : `${occasionTag} Trầm sang`,
        reason: isFaceFlattering
          ? `Công thức monochrome trầm sâu đầy cuốn hút cho tiệc tối — sắc ${faceAnchor.name} sát mặt tôn ${undertoneLabel} sắc nét.`
          : `Công thức monochrome tối màu giữa ${top.name} và ${bottom.name} tạo khí chất sang trọng, cuốn hút cho tiệc tối.`,
      };
    }
    if (isFaceFlattering) {
      return {
        title: `${occasionTag} Sang trọng • Tôn ${undertoneLabel}`,
        reason: `Tương phản nổi bật chuẩn tiệc tối — sắc ${faceAnchor.name} sát mặt giúp ${undertoneLabel} rạng rỡ và sang trọng hơn.`,
      };
    }
    return {
      title: `Sang trọng • Chuẩn ${occasionTag}`,
      reason: `${bottom.name} kết hợp tương phản cùng ${top.name} và giày ${shoes.name} tạo điểm nhấn lịch lãm cho buổi hẹn tối.`,
    };
  }

  // Trường hợp Hoàn cảnh = 'all' nhưng đã chọn Da ấm / Da lạnh và màu sát mặt rất tôn da
  if (isFaceFlattering) {
    if (!shoes.neutral && bottom.neutral && top.neutral && (!outer || outer.neutral)) {
      return {
        title: `Điểm nhấn Giày • Tôn ${undertoneLabel}`,
        reason: `Sắc ${faceAnchor.name} sát mặt tôn ${undertoneLabel} sáng mịn, trên nền trung tính làm nổi đôi giày ${shoes.name}.`,
      };
    }
    if (nonNeutrals.length === 0) {
      return {
        title: `Trung tính • Tôn ${undertoneLabel}`,
        reason: `Sắc ${faceAnchor.name} sát mặt rất hợp ${undertoneLabel}, cân bằng gọn gàng cùng ${bottom.name} và giày ${shoes.name}.`,
      };
    }
    const partner = faceAnchor.key === 'bottom' ? top : bottom;
    return {
      title: isLayering ? `Layering • Tôn ${undertoneLabel}` : `Hài hòa • Tôn ${undertoneLabel}`,
      reason: `Sắc ${faceAnchor.name} sát mặt giúp tôn nền ${undertoneLabel} sáng hơn, cân bằng hài hòa cùng ${partner.name} và giày ${shoes.name}.`,
    };
  }

  // Trường hợp giày làm điểm nhấn 10% trên nền trung tính
  if (!shoes.neutral && bottom.neutral && top.neutral && (!outer || outer.neutral)) {
    return {
      title: 'Điểm nhấn Giày 10%',
      reason: `Nền ${bottom.name} và ${top.name} sạch mắt giúp đôi giày ${shoes.name} trở thành điểm nhấn thu hút.`,
    };
  }

  // Trường hợp phối hoàn toàn trung tính (Minimalist / Old Money)
  if (nonNeutrals.length === 0) {
    const main = outer || bottom;
    return {
      title: 'Trung tính Thanh lịch',
      reason: `${main.name} ${toneWord(main.hsl.l)} cân bằng tốt với ${top.name} và giày ${shoes.name} gọn gàng, dễ mặc.`,
    };
  }

  // Trường hợp có 2 màu sắc chủ đạo
  if (nonNeutrals.length >= 2) {
    const a = nonNeutrals[0];
    const b = nonNeutrals[1];
    const hDiff = hueDistance(a.hsl.h, b.hsl.h);
    const shoeIsOneOfThem = a.key === 'shoes' || b.key === 'shoes';
    if (hDiff <= 45) {
      return {
        title: 'Thanh lịch Ton-sur-ton',
        reason: shoeIsOneOfThem
          ? `Chuyển tông êm mắt giữa ${a.name} và ${b.name} tạo cảm giác liền mạch, sang trọng.`
          : `Chuyển tông êm mắt giữa ${a.name} và ${b.name}, chốt gọn bằng giày ${shoes.name} rất sang trọng.`,
      };
    }
    return {
      title: 'Nổi bật Tương phản',
      reason: shoeIsOneOfThem
        ? `${a.name} ${toneWord(a.hsl.l)} tương phản ăn ý cùng ${b.name} tạo điểm nhấn hiện đại.`
        : `${a.name} ${toneWord(a.hsl.l)} tương phản ăn ý cùng ${b.name} và giày ${shoes.name} tạo sức hút hiện đại.`,
    };
  }

  // Trường hợp 1 màu chủ đạo + các mảng trung tính cân bằng
  const hero = nonNeutrals[0];
  const partner =
    items.find(it => it.key !== hero.key && it.key !== 'shoes') || bottom;
  return {
    title: isLayering ? 'Layering Cân bằng' : 'Trung tính Hài hòa',
    reason:
      hero.key === 'shoes'
        ? `Nền ${partner.name} ${toneWord(partner.hsl.l)} sạch mắt giúp đôi giày ${hero.name} nổi bật tự nhiên.`
        : `${hero.name} ${toneWord(hero.hsl.l)} cân bằng tốt với ${partner.name} ${toneWord(partner.hsl.l)} và giày ${shoes.name} sạch mắt.`,
  };
}

// =============================================================
// 3. TÍNH TOÁN BÙ TRỪ DIỆN TÍCH THỊ GIÁC (VISUAL RATIO)
// =============================================================

/**
 * Tính lại tỷ lệ phần trăm diện tích thị giác thực tế dựa vào phom dáng (areaFactor)
 * Chuẩn hóa tổng chính xác về 100%
 */
export function calculateVisualRatios(
  slots: OutfitSlotsMap,
  isLayering: boolean
): VisualRatiosMap {
  if (isLayering) {
    // Tỷ lệ cơ bản chuẩn 40-20-30-10
    const baseOuter = 40;
    const baseTop = 20;
    const baseBottom = 30;
    const baseShoes = 10;

    const factorOuter = getSilhouetteOption(slots.outerwear.silhouette).areaFactor;
    // Khi mặc lót bên trong áo khoác, diện tích nhìn thấy của áo trong bị thu gọn ~ 0.8
    const factorTop = getSilhouetteOption(slots.top.silhouette).areaFactor * 0.8;
    const factorBottom = getSilhouetteOption(slots.bottom.silhouette).areaFactor;
    const factorShoes = getSilhouetteOption(slots.shoes.silhouette).areaFactor;

    const rawOuter = baseOuter * factorOuter;
    const rawTop = baseTop * factorTop;
    const rawBottom = baseBottom * factorBottom;
    const rawShoes = baseShoes * factorShoes;

    const totalRaw = rawOuter + rawTop + rawBottom + rawShoes;

    const outerRatio = Math.round((rawOuter / totalRaw) * 100);
    const topRatio = Math.round((rawTop / totalRaw) * 100);
    const bottomRatio = Math.round((rawBottom / totalRaw) * 100);
    const shoesRatio = 100 - (outerRatio + topRatio + bottomRatio);

    return {
      outerwear: Math.max(15, outerRatio),
      top: Math.max(10, topRatio),
      bottom: Math.max(15, bottomRatio),
      shoes: Math.max(5, shoesRatio),
    };
  } else {
    // Tỷ lệ cơ bản 60-30-10 (Quần 60% – Áo 30% – Giày 10%)
    const baseTop = 30;
    const baseBottom = 60;
    const baseShoes = 10;

    const factorTop = getSilhouetteOption(slots.top.silhouette).areaFactor;
    const factorBottom = getSilhouetteOption(slots.bottom.silhouette).areaFactor;
    const factorShoes = getSilhouetteOption(slots.shoes.silhouette).areaFactor;

    const rawTop = baseTop * factorTop;
    const rawBottom = baseBottom * factorBottom;
    const rawShoes = baseShoes * factorShoes;

    const totalRaw = rawTop + rawBottom + rawShoes;

    const topRatio = Math.round((rawTop / totalRaw) * 100);
    const bottomRatio = Math.round((rawBottom / totalRaw) * 100);
    const shoesRatio = 100 - (topRatio + bottomRatio);

    return {
      outerwear: 0,
      top: Math.max(15, topRatio),
      bottom: Math.max(20, bottomRatio),
      shoes: Math.max(5, shoesRatio),
    };
  }
}

// =============================================================
// 4. KHỞI TẠO STUDIO OUTFIT STATE BAN ĐẦU
// =============================================================

export function initStudioOutfit(
  baseColor: FashionColor,
  baseRole: 'top' | 'bottom' = 'top',
  styleType: SilhouetteStyleType = 'male',
  initialContext?: Partial<OutfitFilterContext>
): StudioOutfitState {
  const occasion: OccasionMode = initialContext?.occasion ?? 'all';
  const undertone: SkinUndertone = initialContext?.undertone ?? 'neutral';
  const baseHsl = hexToHsl(baseColor.hex);
  const isBaseDark = baseHsl.l < 50;

  // Chọn màu phối ban đầu đẹp mắt
  const partnerCandidates = getNeutralColorOptions(isBaseDark ? 'light' : 'dark', [baseColor.id]);
  const defaultPartner =
    partnerCandidates[0] ||
    FASHION_COLORS.find(c => (isBaseDark ? c.id === 'wb-3' : c.id === 'bn-2')) ||
    FASHION_COLORS[0];

  const defaultShoes =
    FASHION_COLORS.find(c => (isBaseDark ? c.id === 'wb-1' : c.id === 'gb-1')) ||
    FASHION_COLORS[1];

  const defaultOuterwear =
    FASHION_COLORS.find(c => c.id === (isBaseDark ? 'gb-1' : 'bc-1')) ||
    FASHION_COLORS[0];

  const topColor = baseRole === 'top' ? baseColor : defaultPartner;
  const bottomColor = baseRole === 'bottom' ? baseColor : defaultPartner;

  const slots: OutfitSlotsMap = {
    outerwear: {
      id: 'outerwear',
      label: 'Áo khoác',
      color: defaultOuterwear,
      silhouette: 'blazer',
      locked: false,
      isBase: false,
    },
    top: {
      id: 'top',
      label: 'Áo chính',
      color: topColor,
      silhouette: 'tshirt',
      locked: baseRole === 'top',
      isBase: baseRole === 'top',
    },
    bottom: {
      id: 'bottom',
      label: styleType === 'female' ? 'Chân váy' : 'Quần',
      color: bottomColor,
      silhouette: styleType === 'female' ? 'a_line_skirt' : 'wide_pants',
      locked: baseRole === 'bottom',
      isBase: baseRole === 'bottom',
    },
    shoes: {
      id: 'shoes',
      label: 'Giày',
      color: defaultShoes,
      silhouette: 'sneaker',
      locked: false,
      isBase: false,
    },
  };

  const visualRatios = calculateVisualRatios(slots, false);

  return {
    isLayering: false,
    sourceSlot: baseRole,
    scannedColor: baseColor,
    slots,
    styleType,
    visualRatios,
    occasion,
    undertone,
    harmonyTitle: 'Phối màu Trung tính Cơ bản',
    harmonyDescription: `Màu chủ đạo ${baseColor.name} được khóa làm tâm điểm, phối cùng các sắc độ trung tính tạo chiều sâu trang nhã.`,
    harmonyType: 'neutral',
  };
}

/**
 * Khởi tạo StudioOutfitState trực tiếp từ preset 2 món + màu cầu nối (từ MatchCheckerScreen).
 * Khóa sẵn đúng 2 món vừa chấm điểm, áp màu cầu nối cho món còn lại, giữ đúng giới tính & isLayering.
 */
export function initStudioOutfitFromPreset(
  preset: StudioPresetOutfit,
  fallbackBaseColor: FashionColor
): StudioOutfitState {
  const { isLayering, gender, lockedSlots, colors, sourceSlot } = preset;
  const scannedColor = colors[sourceSlot] || fallbackBaseColor;
  const baseHsl = hexToHsl(scannedColor.hex);
  const isBaseDark = baseHsl.l < 50;

  const fallbackLight =
    FASHION_COLORS.find(c => c.id === 'wb-1') || FASHION_COLORS[0];
  const fallbackDark =
    FASHION_COLORS.find(c => c.id === 'gb-1') || FASHION_COLORS[6];
  const fallbackMid =
    FASHION_COLORS.find(c => c.id === 'wb-5') || FASHION_COLORS[4];

  const lockedSet = new Set<OutfitSlotId>(lockedSlots);

  const outerColor =
    colors.outerwear || (isBaseDark ? fallbackDark : FASHION_COLORS.find(c => c.id === 'bc-1') || fallbackDark);
  const topColor =
    colors.top || (isLayering ? (hexToHsl(outerColor.hex).l < 48 ? fallbackLight : fallbackDark) : isBaseDark ? fallbackLight : fallbackDark);
  const bottomColor =
    colors.bottom || (hexToHsl(topColor.hex).l < 48 ? fallbackMid : fallbackDark);
  const shoesColor =
    colors.shoes || (isBaseDark ? fallbackLight : fallbackDark);

  const slots: OutfitSlotsMap = {
    outerwear: {
      id: 'outerwear',
      label: 'Áo khoác',
      color: outerColor,
      silhouette: 'blazer',
      locked: lockedSet.has('outerwear'),
      isBase: sourceSlot === 'outerwear',
    },
    top: {
      id: 'top',
      label: isLayering ? 'Áo trong' : 'Áo chính',
      color: topColor,
      silhouette: 'tshirt',
      locked: lockedSet.has('top'),
      isBase: sourceSlot === 'top',
    },
    bottom: {
      id: 'bottom',
      label: gender === 'female' ? 'Chân váy' : 'Quần',
      color: bottomColor,
      silhouette: gender === 'female' ? 'a_line_skirt' : 'wide_pants',
      locked: lockedSet.has('bottom'),
      isBase: sourceSlot === 'bottom',
    },
    shoes: {
      id: 'shoes',
      label: 'Giày',
      color: shoesColor,
      silhouette: 'sneaker',
      locked: lockedSet.has('shoes'),
      isBase: sourceSlot === 'shoes',
    },
  };

  const visualRatios = calculateVisualRatios(slots, isLayering);

  const draft: StudioOutfitState = {
    isLayering,
    sourceSlot,
    scannedColor,
    slots,
    styleType: gender,
    visualRatios,
    occasion: 'all',
    undertone: preset.undertone ?? 'neutral',
    harmonyTitle: 'Phối màu Từ Chấm điểm 2 món',
    harmonyDescription: '',
    harmonyType: 'custom',
  };

  const advice = generateOutfitAdvice(draft);

  return {
    ...draft,
    harmonyTitle: advice.title,
    harmonyDescription: advice.reason,
  };
}

// =============================================================
// 5. CHUYỂN ĐỔI GIỚI TÍNH (MALE / FEMALE) & ĐỒNG BỘ PHOM DÁNG
// =============================================================

export function switchGender(
  currentState: StudioOutfitState,
  newGender: SilhouetteStyleType
): StudioOutfitState {
  if (currentState.styleType === newGender) return currentState;

  const nextSlots: OutfitSlotsMap = {
    ...currentState.slots,
    top: { ...currentState.slots.top },
    bottom: { ...currentState.slots.bottom },
    shoes: { ...currentState.slots.shoes },
  };

  if (newGender === 'male') {
    // Tự động quy đổi an toàn khi chuyển sang Nam
    if (nextSlots.top.silhouette === 'baby_tee') {
      nextSlots.top.silhouette = 'tshirt';
    } else if (nextSlots.top.silhouette === 'blouse') {
      nextSlots.top.silhouette = 'shirt';
    }

    if (nextSlots.bottom.silhouette === 'a_line_skirt') {
      nextSlots.bottom.silhouette = 'wide_pants';
    } else if (nextSlots.bottom.silhouette === 'mini_skirt') {
      nextSlots.bottom.silhouette = 'shorts';
    }
    nextSlots.bottom.label = 'Quần';

    if (nextSlots.shoes.silhouette === 'heels') {
      nextSlots.shoes.silhouette = 'dress_shoes';
    }
  } else {
    // Tự động quy đổi an toàn khi chuyển sang Nữ
    if (nextSlots.top.silhouette === 'polo') {
      nextSlots.top.silhouette = 'baby_tee';
    }

    if (nextSlots.shoes.silhouette === 'dress_shoes') {
      nextSlots.shoes.silhouette = 'heels';
    }

    if (
      nextSlots.bottom.silhouette === 'a_line_skirt' ||
      nextSlots.bottom.silhouette === 'mini_skirt'
    ) {
      nextSlots.bottom.label = 'Chân váy';
    } else {
      nextSlots.bottom.label = 'Quần';
    }
  }

  const visualRatios = calculateVisualRatios(nextSlots, currentState.isLayering);

  return {
    ...currentState,
    styleType: newGender,
    slots: nextSlots,
    visualRatios,
  };
}

// =============================================================
// 6. CHẾ ĐỘ PHỐI NHIỀU LỚP (LAYERING TOGGLE: + ÁO KHOÁC)
// =============================================================

/**
 * Xử lý bật/tắt Layering (+ Thêm áo khoác) với logic thông minh:
 * - Khi bật: Nếu top đang là màu gốc từ Camera và có khóa, đẩy màu đó lên outerwear (40%) và khóa lại.
 *   Lót bên trong một chiếc áo thun trung tính (20%) mở khóa.
 * - Khi tắt: Nếu outerwear đang mang màu gốc, trả màu gốc về lại top và khóa lại.
 */
export function toggleLayeringMode(
  currentState: StudioOutfitState,
  enableLayering: boolean
): StudioOutfitState {
  if (currentState.isLayering === enableLayering) {
    return currentState;
  }

  const newSlots: OutfitSlotsMap = {
    ...currentState.slots,
    outerwear: { ...currentState.slots.outerwear },
    top: { ...currentState.slots.top },
    bottom: { ...currentState.slots.bottom },
    shoes: { ...currentState.slots.shoes },
  };

  if (enableLayering) {
    // Chuyển sang có Áo khoác: 40 - 20 - 30 - 10
    const topIsBase = newSlots.top.isBase;
    const topIsLocked = newSlots.top.locked;
    const context: OutfitFilterContext = {
      occasion: currentState.occasion ?? 'all',
      undertone: currentState.undertone ?? 'neutral',
    };
    const isTopCautionForSkin =
      (context.undertone === 'warm' || context.undertone === 'cool') &&
      evaluateColorForUndertone(newSlots.top.color, context.undertone) === 'caution';

    if (topIsBase && topIsLocked && isTopCautionForSkin) {
      // Mẹo cứu màu (Rescue Layering): giữ áo màu chụp ở lớp trong (20%) và khoác ngoài sắc độ tôn da (40%)
      const flatteringOuter = pickBestColorForSlot(
        context.undertone === 'warm'
          ? ['wb-5', 'bc-3', 'bc-1', 'gr-1', 'wb-3', 'bc-5']
          : ['bn-2', 'gb-1', 'gb-3', 'bn-1', 'gr-4', 'rp-2'],
        'outerwear',
        true,
        context,
        [newSlots.top.color.id, newSlots.bottom.color.id]
      );
      newSlots.outerwear = {
        ...newSlots.outerwear,
        color: flatteringOuter,
        locked: false,
        isBase: false,
        silhouette: 'blazer',
        label: 'Áo khoác',
      };
      newSlots.top = {
        ...newSlots.top,
        label: 'Áo mặc trong',
      };
    } else if (topIsBase && topIsLocked) {
      // Đẩy màu từ top lên outerwear
      const baseTopColor = newSlots.top.color;
      const baseTopHsl = hexToHsl(baseTopColor.hex);

      newSlots.outerwear = {
        ...newSlots.outerwear,
        color: baseTopColor,
        locked: true,
        isBase: true,
        silhouette: 'blazer',
        label: 'Áo khoác',
      };

      // Áo thun mặc trong: trung tính tương phản nhẹ, ưu tiên tôn tông da
      const innerColor = pickBestColorForSlot(
        baseTopHsl.l < 50 ? ['wb-3', 'wb-1', 'wb-2', 'wb-4', 'wb-5'] : ['gb-1', 'gb-2', 'bn-2', 'bc-1', 'gb-3'],
        'top',
        true,
        context,
        [baseTopColor.id]
      );

      newSlots.top = {
        ...newSlots.top,
        color: innerColor,
        locked: false,
        isBase: false,
        silhouette: 'tshirt',
        label: 'Áo mặc trong',
      };
    } else {
      newSlots.top.label = 'Áo mặc trong';
      newSlots.outerwear.label = 'Áo khoác';
    }
  } else {
    // Tắt Áo khoác, trở về 60-30-10
    const outerIsBase = newSlots.outerwear.isBase;

    if (outerIsBase) {
      // Trả màu gốc về lại top
      newSlots.top = {
        ...newSlots.top,
        color: newSlots.outerwear.color,
        locked: true,
        isBase: true,
        label: 'Áo chính',
      };
      newSlots.outerwear = {
        ...newSlots.outerwear,
        locked: false,
        isBase: false,
      };
    } else {
      newSlots.top.label = 'Áo chính';
    }
  }

  const visualRatios = calculateVisualRatios(newSlots, enableLayering);
  const nextSourceSlot: OutfitSlotId = enableLayering
    ? newSlots.outerwear.isBase
      ? 'outerwear'
      : currentState.sourceSlot
    : currentState.sourceSlot === 'outerwear'
    ? 'top'
    : currentState.sourceSlot;

  return {
    ...currentState,
    isLayering: enableLayering,
    sourceSlot: nextSourceSlot,
    slots: newSlots,
    visualRatios,
  };
}

// =============================================================
// 6B. GÁN "MÀU GỐC" CHỤP TỪ CAMERA SANG BẤT KỲ MÓN NÀO
// =============================================================

function pickBestColorForSlot(
  preferredIds: string[],
  slotId: OutfitSlotId,
  isLayering: boolean,
  context: OutfitFilterContext,
  excludeIds: string[],
  fallbackPool: FashionColor[] = FASHION_COLORS
): FashionColor {
  const pool = fallbackPool.length > 0 ? fallbackPool : FASHION_COLORS;
  const candidates = pool.filter(c => !excludeIds.includes(c.id));
  const safeCandidates = candidates.length > 0 ? candidates : FASHION_COLORS;

  let bestColor = safeCandidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const color of safeCandidates) {
    const prefIdx = preferredIds.indexOf(color.id);
    // Ưu tiên nhóm màu hợp vai trò/tương phản sáng tối, đồng thời cộng điểm Hoàn cảnh + Tông da
    const roleBonus = prefIdx >= 0 ? 34 - prefIdx * 3 : 0;
    const ctxScore = scoreColorForContext(color, slotId, isLayering, context);
    const total = roleBonus + ctxScore;
    if (total > bestScore) {
      bestScore = total;
      bestColor = color;
    }
  }

  return bestColor;
}

/**
 * Chuyển màu vừa hút/chụp từ Camera sang món bất kỳ (outerwear / top / bottom / shoes)
 * và tự động phối lại màu hài hòa cho các món còn lại quanh món gốc mới,
 * có tính đến Hoàn cảnh (OccasionMode) & Tông da (SkinUndertone).
 */
export function applyScannedColorToSlot(
  current: StudioOutfitState,
  scannedColor: FashionColor,
  targetSlot: OutfitSlotId,
  palette: FashionColor[] = FASHION_COLORS,
  contextOverride?: Partial<OutfitFilterContext>
): StudioOutfitState {
  const context: OutfitFilterContext = {
    occasion: contextOverride?.occasion ?? current.occasion ?? 'all',
    undertone: contextOverride?.undertone ?? current.undertone ?? 'neutral',
  };

  // Nếu chọn gán cho Áo khoác mà chưa bật Layering -> tự động bật Layering (40-20-30-10)
  const nextIsLayering = targetSlot === 'outerwear' ? true : current.isLayering;

  const prevSource = current.sourceSlot;
  const nextSlots: OutfitSlotsMap = {
    outerwear: { ...current.slots.outerwear, isBase: false },
    top: {
      ...current.slots.top,
      isBase: false,
      label: nextIsLayering ? 'Áo trong' : 'Áo chính',
    },
    bottom: { ...current.slots.bottom, isBase: false },
    shoes: { ...current.slots.shoes, isBase: false },
  };

  // Mở khóa slot gốc cũ (nếu khác targetSlot) để thuật toán phối lại màu mới tự nhiên
  if (prevSource !== targetSlot) {
    nextSlots[prevSource].locked = false;
  }

  // Gán màu chụp vào targetSlot và khóa lại
  nextSlots[targetSlot] = {
    ...nextSlots[targetSlot],
    color: scannedColor,
    locked: true,
    isBase: true,
  };

  const scannedHsl = hexToHsl(scannedColor.hex);
  const isScannedDark = scannedHsl.l < 50;
  const isScannedNeutral = isNeutralColor(scannedHsl, scannedColor.category);

  if (targetSlot === 'shoes') {
    // Giày (10% điểm nhấn): Cho phép màu nổi không bao giờ bị lọc rỗng!
    // Tự động phối Quần và Áo bằng cặp nền sạch sẽ + tôn tông da sát mặt.
    const cleanTop = pickBestColorForSlot(
      isScannedDark
        ? ['wb-3', 'wb-1', 'wb-2', 'wb-5', 'wb-4', 'gb-6']
        : ['gb-1', 'bn-2', 'gb-3', 'wb-3', 'bc-1', 'wb-5'],
      'top',
      nextIsLayering,
      context,
      [scannedColor.id],
      palette
    );
    const cleanBottom = pickBestColorForSlot(
      isScannedDark
        ? ['bn-2', 'gb-1', 'gb-3', 'wb-5', 'bc-1']
        : ['gb-1', 'gb-3', 'bn-2', 'bc-1', 'wb-5'],
      'bottom',
      nextIsLayering,
      context,
      [scannedColor.id, cleanTop.id],
      palette
    );
    const cleanOuter = pickBestColorForSlot(
      ['gb-3', 'wb-5', 'bn-2', 'bc-1', 'bc-3', 'gb-1'],
      'outerwear',
      nextIsLayering,
      context,
      [scannedColor.id, cleanTop.id, cleanBottom.id],
      palette
    );

    if (!nextSlots.top.locked) nextSlots.top.color = cleanTop;
    if (!nextSlots.bottom.locked) nextSlots.bottom.color = cleanBottom;
    if (!nextSlots.outerwear.locked) nextSlots.outerwear.color = cleanOuter;
  } else if (targetSlot === 'bottom') {
    // Quần/Váy là màu gốc: ưu tiên phối Áo trên tôn da + tương phản sáng-tối rõ ràng
    const topContrast = pickBestColorForSlot(
      isScannedDark
        ? ['wb-3', 'wb-1', 'wb-4', 'wb-5', 'wb-6', 'gb-6', 'gr-5']
        : ['gb-1', 'bn-2', 'gb-3', 'bc-1', 'gr-1', 'gr-4', 'rp-2'],
      'top',
      nextIsLayering,
      context,
      [scannedColor.id],
      palette
    );
    const shoesPartner = pickBestColorForSlot(
      isScannedDark ? ['wb-1', 'wb-3', 'bc-4', 'gb-1'] : ['gb-1', 'bc-4', 'wb-1', 'bc-1'],
      'shoes',
      nextIsLayering,
      context,
      [scannedColor.id, topContrast.id],
      palette
    );
    const outerPartner = pickBestColorForSlot(
      isScannedDark ? ['wb-5', 'gb-3', 'bc-3', 'bn-2'] : ['gb-1', 'bn-2', 'bc-1', 'gr-1'],
      'outerwear',
      nextIsLayering,
      context,
      [scannedColor.id, topContrast.id, shoesPartner.id],
      palette
    );

    if (!nextSlots.top.locked) nextSlots.top.color = topContrast;
    if (!nextSlots.shoes.locked) nextSlots.shoes.color = shoesPartner;
    if (!nextSlots.outerwear.locked) nextSlots.outerwear.color = outerPartner;
  } else if (targetSlot === 'outerwear') {
    // Áo khoác 40% là màu gốc: lót áo thun 20% trung tính đối lập + tôn da & quần 30% cân bằng
    const innerTop = pickBestColorForSlot(
      isScannedDark ? ['wb-3', 'wb-1', 'wb-2', 'wb-4'] : ['gb-1', 'gb-2', 'bn-2', 'wb-3', 'wb-1'],
      'top',
      nextIsLayering,
      context,
      [scannedColor.id],
      palette
    );
    const bottomMatch = pickBestColorForSlot(
      isScannedNeutral
        ? ['bn-2', 'gb-1', 'wb-5', 'bc-1', 'gb-3']
        : isScannedDark
        ? ['wb-5', 'gb-3', 'gb-1', 'wb-3', 'bn-2']
        : ['gb-1', 'bn-2', 'gb-3', 'bc-1'],
      'bottom',
      nextIsLayering,
      context,
      [scannedColor.id, innerTop.id],
      palette
    );
    const shoesMatch = pickBestColorForSlot(
      isScannedDark ? ['wb-1', 'gb-1', 'bc-4', 'wb-3'] : ['gb-1', 'bc-4', 'wb-1', 'bc-1'],
      'shoes',
      nextIsLayering,
      context,
      [scannedColor.id, innerTop.id, bottomMatch.id],
      palette
    );

    if (!nextSlots.top.locked) nextSlots.top.color = innerTop;
    if (!nextSlots.bottom.locked) nextSlots.bottom.color = bottomMatch;
    if (!nextSlots.shoes.locked) nextSlots.shoes.color = shoesMatch;
  } else {
    // Áo chính là màu gốc
    const bottomPartner = pickBestColorForSlot(
      isScannedDark
        ? ['wb-5', 'wb-3', 'gb-6', 'wb-6', 'gb-1', 'bn-2']
        : ['bn-2', 'gb-1', 'gb-3', 'bc-1', 'bn-1'],
      'bottom',
      nextIsLayering,
      context,
      [scannedColor.id],
      palette
    );
    const shoesPartner = pickBestColorForSlot(
      isScannedDark ? ['wb-1', 'bc-4', 'gb-1', 'wb-3'] : ['gb-1', 'wb-1', 'bc-4', 'bc-1'],
      'shoes',
      nextIsLayering,
      context,
      [scannedColor.id, bottomPartner.id],
      palette
    );

    if (!nextSlots.bottom.locked) nextSlots.bottom.color = bottomPartner;
    if (!nextSlots.shoes.locked) nextSlots.shoes.color = shoesPartner;
  }

  const visualRatios = calculateVisualRatios(nextSlots, nextIsLayering);
  const nextState: StudioOutfitState = {
    ...current,
    isLayering: nextIsLayering,
    sourceSlot: targetSlot,
    scannedColor,
    slots: nextSlots,
    visualRatios,
    occasion: context.occasion,
    undertone: context.undertone,
    harmonyType: 'neutral',
  };
  const advice = generateOutfitAdvice(nextState);

  return {
    ...nextState,
    harmonyTitle: advice.title,
    harmonyDescription: advice.reason,
  };
}

// =============================================================
// 7. KHÓA MÓN & XOAY VÒNG BIẾN THỂ THÔNG MINH THEO HOÀN CẢNH & TÔNG DA
// =============================================================

function pickRandomFrom<T>(list: T[], fallback: T): T {
  if (list.length === 0) return fallback;
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Chấm điểm tổng thể một tổ hợp màu ứng viên:
 * totalScore = harmonyScore + occasionScore + undertoneScore
 */
function scoreOutfitCandidate(
  colors: Record<OutfitSlotId, FashionColor>,
  activeSlotKeys: OutfitSlotId[],
  isLayering: boolean,
  context: OutfitFilterContext
): number {
  let contextTotal = 0;
  let harmonyScore = 0;

  const activeItems = activeSlotKeys.map(key => {
    const color = colors[key];
    const hsl = hexToHsl(color.hex);
    const neutral = isNeutralColor(hsl, color.category);
    contextTotal += scoreColorForContext(color, key, isLayering, context);
    return { key, color, hsl, neutral };
  });

  // 1. Điểm hài hòa ánh sáng (tránh toàn bộ trùng độ sáng phẳng)
  const ls = activeItems.map(it => it.hsl.l);
  const minL = Math.min(...ls);
  const maxL = Math.max(...ls);
  const contrastSpan = maxL - minL;

  if (contrastSpan >= 24 && contrastSpan <= 88) {
    harmonyScore += 18;
  } else if (contrastSpan >= 14) {
    harmonyScore += 8;
  } else if (!(context.occasion === 'party' && maxL <= 36)) {
    harmonyScore -= 18;
  }

  // 2. Phạt 2 màu rực rỡ cạnh tranh chói mắt
  const vividItems = activeItems.filter(
    it =>
      !it.neutral &&
      !CLASSIC_BASE_IDS.has(it.color.id) &&
      it.hsl.s >= 56 &&
      it.hsl.l >= 24 &&
      it.hsl.l <= 76
  );
  if (vividItems.length >= 2) {
    for (let i = 0; i < vividItems.length; i++) {
      for (let j = i + 1; j < vividItems.length; j++) {
        const hDiff = hueDistance(vividItems[i].hsl.h, vividItems[j].hsl.h);
        if (hDiff >= 38) {
          harmonyScore -= 30;
        }
      }
    }
  }

  // 3. Điểm thưởng tránh trùng chính xác màu giữa Áo và Quần (trừ Monochrome Tiệc tối)
  if (colors.top.id === colors.bottom.id) {
    harmonyScore += context.occasion === 'party' && hexToHsl(colors.top.hex).l <= 26 ? 6 : -16;
  }
  if (isLayering && colors.outerwear.id === colors.top.id) {
    harmonyScore -= 14;
  }

  // 4. Điểm cộng tổng thể theo 4 Hoàn cảnh (Holistic Occasion Rules)
  if (context.occasion === 'study') {
    const freshCount = activeItems.filter(
      it => STUDY_FAVORITES.has(it.color.id) || (it.hsl.l >= 38 && it.hsl.s <= 60)
    ).length;
    if (freshCount >= activeItems.length - 1) {
      harmonyScore += 20;
    }
    if (maxL <= 30) {
      harmonyScore -= 16;
    }
  } else if (context.occasion === 'work') {
    const lowSatCount = activeItems.filter(
      it => it.hsl.s <= 48 || WORK_STAPLES.has(it.color.id)
    ).length;
    if (lowSatCount === activeItems.length) {
      harmonyScore += 22;
    } else if (lowSatCount >= activeItems.length - 1) {
      harmonyScore += 10;
    }
    if (contrastSpan >= 22 && contrastSpan <= 78) {
      harmonyScore += 10;
    }
  } else if (context.occasion === 'casual') {
    const expressiveCount = activeItems.filter(
      it => !it.neutral || CASUAL_FAVORITES.has(it.color.id)
    ).length;
    if (expressiveCount >= 1 && expressiveCount <= 2) {
      harmonyScore += 16;
    }
    // Tránh toàn bộ quá tối nghiêm nghị khi đi chơi
    if (maxL <= 30) {
      harmonyScore -= 18;
    }
  } else if (context.occasion === 'party') {
    const avgL = ls.reduce((sum, v) => sum + v, 0) / ls.length;
    const darkBase =
      hexToHsl(colors.bottom.hex).l <= 34 ||
      (isLayering && hexToHsl(colors.outerwear.hex).l <= 34);
    const hasCleanHighlight = activeItems.some(it =>
      PARTY_CLEAN_HIGHLIGHT.has(it.color.id)
    );
    const hasBurgundyOrLuxe = activeItems.some(
      it => it.color.id === 'rp-1' || it.color.id === 'rp-2'
    );

    // Công thức (a): Monochrome tối màu / trầm sâu
    if (avgL <= 34 && maxL <= 46) {
      harmonyScore += 30;
    }
    // Công thức (b): Tương phản mạnh sang trọng (nền tối + 1 mảng sáng sạch hoặc đỏ đô)
    else if (darkBase && (hasCleanHighlight || hasBurgundyOrLuxe)) {
      harmonyScore += 32;
    }
  }

  return harmonyScore + contextTotal;
}

export function shuffleOutfitColors(
  currentState: StudioOutfitState,
  harmonyMode: StyleHarmonyMode = 'all',
  contextOverride?: Partial<OutfitFilterContext>
): StudioOutfitState {
  const { isLayering, slots } = currentState;
  const context: OutfitFilterContext = {
    occasion: contextOverride?.occasion ?? currentState.occasion ?? 'all',
    undertone: contextOverride?.undertone ?? currentState.undertone ?? 'neutral',
  };

  const activeSlotKeys: OutfitSlotId[] = isLayering
    ? ['outerwear', 'top', 'bottom', 'shoes']
    : ['top', 'bottom', 'shoes'];

  const unlockedSlots = activeSlotKeys.filter(key => !slots[key].locked);
  if (unlockedSlots.length === 0) {
    return currentState;
  }

  // Tìm món neo (Anchor Item)
  const lockedKeys = activeSlotKeys.filter(key => slots[key].locked);
  let anchorSlotKey: OutfitSlotId = 'top';
  if (lockedKeys.length > 0) {
    const baseKey = lockedKeys.find(k => slots[k].isBase);
    anchorSlotKey = baseKey || lockedKeys[0];
  } else {
    anchorSlotKey = isLayering ? 'outerwear' : 'top';
  }

  const anchorColor = slots[anchorSlotKey].color;
  const anchorHsl = hexToHsl(anchorColor.hex);
  const isAnchorNeutral = isNeutralColor(anchorHsl, anchorColor.category);
  const isAnchorDark = anchorHsl.l < 50;

  // Helper sắp xếp & lọc pool ưu tiên theo điểm Hoàn cảnh + Tông da
  const rankPoolForSlot = (
    sourcePool: FashionColor[],
    slotId: OutfitSlotId,
    limit = 10
  ): FashionColor[] => {
    const base = sourcePool.length > 0 ? sourcePool : FASHION_COLORS;
    const scored = base
      .map(c => ({
        color: c,
        score: scoreColorForContext(c, slotId, isLayering, context),
      }))
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(4, Math.min(limit, scored.length))).map(s => s.color);
  };

  // Các nhóm màu lấy trực tiếp từ toàn bộ bảng màu STUDIO_FABRIC_CATALOG (46 màu)
  const lightNeutrals = STUDIO_FABRIC_CATALOG.filter(
    e => e.fabricGroup === 'neutral' && e.hsl.l >= 55 && e.color.id !== anchorColor.id
  ).map(e => e.color);
  const darkNeutrals = STUDIO_FABRIC_CATALOG.filter(
    e =>
      (e.fabricGroup === 'neutral' || e.color.id === 'bn-1' || e.color.id === 'bn-2' || e.color.id === 'bc-1' || e.color.id === 'bc-2') &&
      e.hsl.l < 48 &&
      e.color.id !== anchorColor.id
  ).map(e => e.color);
  const allNeutrals = [...lightNeutrals, ...darkNeutrals];

  const earthAndWarm = STUDIO_FABRIC_CATALOG.filter(
    e => (e.fabricGroup === 'earth' || e.fabricGroup === 'warm') && e.color.id !== anchorColor.id
  ).map(e => e.color);

  const coolPalette = STUDIO_FABRIC_CATALOG.filter(
    e => e.fabricGroup === 'cool' && e.color.id !== anchorColor.id
  ).map(e => e.color);

  const statementColors = STUDIO_FABRIC_CATALOG.filter(
    e => e.fabricGroup !== 'neutral' && e.color.id !== anchorColor.id
  ).map(e => e.color);

  const shoeClassics = STUDIO_FABRIC_CATALOG.filter(
    e =>
      (e.fabricGroup === 'neutral' || e.color.category === 'brown_camel' || e.color.id === 'bn-1' || e.color.id === 'bn-2') &&
      e.color.id !== anchorColor.id
  ).map(e => e.color);

  // Pool ứng viên đã ưu tiên theo Hoàn cảnh & Tông da cho từng slot
  const topContextPool = rankPoolForSlot(FASHION_COLORS, 'top', 14);
  const outerContextPool = rankPoolForSlot(FASHION_COLORS, 'outerwear', 12);
  const bottomContextPool = rankPoolForSlot(FASHION_COLORS, 'bottom', 14);
  const shoesContextPool = rankPoolForSlot(FASHION_COLORS, 'shoes', 12);

  type CandidatePalette = {
    type: 'neutral' | 'analogous' | 'complementary';
    colors: Record<OutfitSlotId, FashionColor>;
  };

  const candidatePalettes: CandidatePalette[] = [];

  // --- NHÓM 1: TRUNG TÍNH ('neutral') ---
  const buildNeutralCandidates = () => {
    const prefPool = isAnchorDark ? lightNeutrals : darkNeutrals;
    const altPool = isAnchorDark ? darkNeutrals : lightNeutrals;
    const topPref = rankPoolForSlot(prefPool, 'top', 8);
    const botPref = rankPoolForSlot(prefPool, 'bottom', 8);
    const botAlt = rankPoolForSlot(altPool, 'bottom', 8);
    const outAlt = rankPoolForSlot(allNeutrals, 'outerwear', 8);
    const shoePref = rankPoolForSlot(shoeClassics, 'shoes', 8);

    for (let v = 0; v < 6; v++) {
      const p1Top = pickRandomFrom(topPref, FASHION_COLORS[0]);
      const p1Bot = pickRandomFrom(botPref, FASHION_COLORS[0]);
      const p2 = pickRandomFrom(
        botAlt.filter(c => c.id !== p1Top.id),
        pickRandomFrom(allNeutrals, FASHION_COLORS[6])
      );
      const p3 = pickRandomFrom(
        outAlt.filter(c => c.id !== p1Top.id && c.id !== p2.id),
        p1Top
      );
      const shoe = pickRandomFrom(
        shoePref.filter(c => c.id !== p1Bot.id),
        FASHION_COLORS[0]
      );

      if (anchorSlotKey === 'shoes') {
        const topC =
          v % 2 === 0
            ? pickRandomFrom(rankPoolForSlot(lightNeutrals, 'top', 6), p1Top)
            : pickRandomFrom(rankPoolForSlot(darkNeutrals, 'top', 6), p2);
        const botC = v % 2 === 0 ? pickRandomFrom(darkNeutrals, p2) : pickRandomFrom(lightNeutrals, p1Bot);
        const outC = pickRandomFrom(outAlt.filter(c => c.id !== topC.id), p3);
        candidatePalettes.push({
          type: 'neutral',
          colors: { outerwear: outC, top: topC, bottom: botC, shoes: anchorColor },
        });
      } else {
        candidatePalettes.push({
          type: 'neutral',
          colors: {
            outerwear: anchorSlotKey === 'outerwear' ? anchorColor : (v % 2 === 0 ? p3 : p2),
            top: anchorSlotKey === 'top' ? anchorColor : (isLayering ? pickRandomFrom(rankPoolForSlot(lightNeutrals, 'top', 6), p1Top) : p1Top),
            bottom: anchorSlotKey === 'bottom' ? anchorColor : (v % 2 === 0 ? p1Bot : p2),
            shoes: shoe,
          },
        });
      }
    }
  };

  // --- NHÓM 2: THANH LỊCH / TƯƠNG ĐỒNG ('analogous') ---
  const buildAnalogousCandidates = () => {
    const hueOffsets = [22, 34, -24, -38, 16, -18];
    const shoePref = rankPoolForSlot(shoeClassics, 'shoes', 8);

    for (let v = 0; v < 6; v++) {
      let partnerA: FashionColor;
      let partnerB: FashionColor;

      if (!isAnchorNeutral) {
        const targetH = (anchorHsl.h + hueOffsets[v] + 360) % 360;
        const analogousMatches = STUDIO_FABRIC_CATALOG.filter(
          e =>
            e.color.id !== anchorColor.id &&
            !isNeutralColor(e.hsl, e.color.category) &&
            hueDistance(e.hsl.h, anchorHsl.h) <= 48
        ).map(e => e.color);

        const rankedAnalogous = rankPoolForSlot(analogousMatches, anchorSlotKey === 'top' ? 'bottom' : 'top', 6);

        partnerA =
          v < 3 && rankedAnalogous.length > 0
            ? pickRandomFrom(rankedAnalogous, FASHION_COLORS[4])
            : findClosestFashionColor(
                {
                  h: targetH,
                  s: Math.max(18, Math.round(anchorHsl.s * (0.72 + (v % 2) * 0.18))),
                  l: Math.max(20, Math.min(82, anchorHsl.l + (isAnchorDark ? 16 : -16))),
                },
                [anchorColor.id]
              );

        const neutralRank = rankPoolForSlot(
          (isAnchorDark ? lightNeutrals : darkNeutrals).filter(c => c.id !== partnerA.id),
          anchorSlotKey === 'top' ? 'bottom' : 'top',
          6
        );
        partnerB = pickRandomFrom(neutralRank, pickRandomFrom(allNeutrals, FASHION_COLORS[2]));
      } else {
        const isWarmPref =
          context.undertone === 'warm' ||
          (context.undertone === 'neutral' &&
            (anchorColor.category === 'white_beige' || anchorColor.category === 'brown_camel'));
        const familyPool =
          isWarmPref
            ? [...earthAndWarm, ...lightNeutrals]
            : [...coolPalette.filter(c => hexToHsl(c.hex).s < 58), ...allNeutrals];
        const rankedTopFamily = rankPoolForSlot(familyPool, 'top', 10);
        const rankedBotFamily = rankPoolForSlot(familyPool, 'bottom', 10);
        partnerA = pickRandomFrom(rankedTopFamily, FASHION_COLORS[4]);
        partnerB = pickRandomFrom(
          rankedBotFamily.filter(c => c.id !== partnerA.id),
          FASHION_COLORS[8]
        );
      }

      const shoe = pickRandomFrom(
        shoePref.filter(c => c.id !== partnerA.id),
        FASHION_COLORS[0]
      );

      candidatePalettes.push({
        type: 'analogous',
        colors: {
          outerwear: anchorSlotKey === 'outerwear' ? anchorColor : partnerA,
          top: anchorSlotKey === 'top' ? anchorColor : (isLayering ? partnerB : partnerA),
          bottom: anchorSlotKey === 'bottom' ? anchorColor : (anchorSlotKey === 'top' ? partnerA : partnerB),
          shoes: anchorSlotKey === 'shoes' ? anchorColor : shoe,
        },
      });
    }
  };

  // --- NHÓM 3: NỔI BẬT / TƯƠNG PHẢN ('complementary') ---
  const buildComplementaryCandidates = () => {
    const compOffsets = [150, 175, 205, 130, 165, 190];
    const shoePref = rankPoolForSlot(shoeClassics, 'shoes', 8);

    for (let v = 0; v < 6; v++) {
      let popColor: FashionColor;
      if (!isAnchorNeutral) {
        const targetH = (anchorHsl.h + compOffsets[v]) % 360;
        const compPool = STUDIO_FABRIC_CATALOG.filter(
          e =>
            e.color.id !== anchorColor.id &&
            e.fabricGroup !== 'neutral' &&
            hueDistance(e.hsl.h, anchorHsl.h) >= 105
        ).map(e => e.color);

        const rankedComp = rankPoolForSlot(compPool, anchorSlotKey === 'top' ? 'bottom' : 'top', 8);
        popColor =
          v % 2 === 0 && rankedComp.length > 0
            ? pickRandomFrom(rankedComp, FASHION_COLORS[20])
            : findClosestFashionColor(
                {
                  h: targetH,
                  s: Math.max(30, Math.min(72, anchorHsl.s)),
                  l: isAnchorDark ? 56 : 36,
                },
                [anchorColor.id]
              );
      } else {
        const rankedStatement = rankPoolForSlot(
          statementColors,
          anchorSlotKey === 'top' ? 'bottom' : 'top',
          10
        );
        popColor = pickRandomFrom(rankedStatement, FASHION_COLORS[20]);
      }

      const balancePool = rankPoolForSlot(
        isAnchorDark ? lightNeutrals : darkNeutrals,
        anchorSlotKey === 'top' ? 'bottom' : 'top',
        6
      );
      const balance = pickRandomFrom(
        balancePool.filter(c => c.id !== popColor.id),
        FASHION_COLORS[1]
      );
      const shoe = pickRandomFrom(
        shoePref.filter(c => c.id !== balance.id),
        FASHION_COLORS[0]
      );

      if (anchorSlotKey === 'shoes') {
        candidatePalettes.push({
          type: 'complementary',
          colors: {
            outerwear: popColor,
            top: pickRandomFrom(rankPoolForSlot(lightNeutrals, 'top', 6), balance),
            bottom: pickRandomFrom(darkNeutrals, balance),
            shoes: anchorColor,
          },
        });
      } else {
        candidatePalettes.push({
          type: 'complementary',
          colors: {
            outerwear: anchorSlotKey === 'outerwear' ? anchorColor : (v % 2 === 0 ? popColor : balance),
            top: anchorSlotKey === 'top' ? anchorColor : (anchorSlotKey === 'bottom' ? popColor : balance),
            bottom: anchorSlotKey === 'bottom' ? anchorColor : (anchorSlotKey === 'top' ? (v % 2 === 0 ? balance : popColor) : balance),
            shoes: v === 3 && !isAnchorNeutral ? popColor : shoe,
          },
        });
      }
    }
  };

  // --- NHÓM 4: ỨNG VIÊN CHUYÊN BIỆT THEO HOÀN CẢNH + TÔNG DA ---
  const buildContextCuratedCandidates = () => {
    const modeType: 'neutral' | 'analogous' | 'complementary' =
      harmonyMode === 'all' ? 'neutral' : harmonyMode;

    if (context.occasion === 'party') {
      const darkLuxeTop = rankPoolForSlot(
        FASHION_COLORS.filter(c => PARTY_DARK_LUXE.has(c.id)),
        'top',
        8
      );
      const darkLuxeBot = rankPoolForSlot(
        FASHION_COLORS.filter(c => PARTY_DARK_LUXE.has(c.id)),
        'bottom',
        8
      );
      const crispTop = rankPoolForSlot(
        FASHION_COLORS.filter(c => PARTY_CLEAN_HIGHLIGHT.has(c.id) || c.id === 'rp-1' || c.id === 'rp-2'),
        'top',
        6
      );
      const partyShoes = rankPoolForSlot(
        FASHION_COLORS.filter(c => c.id === 'gb-1' || c.id === 'gb-2' || c.id === 'bc-1' || c.id === 'rp-1' || c.id === 'wb-1' || c.id === 'wb-3'),
        'shoes',
        6
      );

      for (let v = 0; v < 8; v++) {
        // Nửa đầu: Monochrome trầm sâu; nửa sau: Tương phản mạnh sang trọng (nền tối + sáng sạch / đỏ đô)
        const isMonochromeFormula = v < 4;
        const botC = pickRandomFrom(darkLuxeBot, FASHION_COLORS[6]);
        const topC = isMonochromeFormula
          ? pickRandomFrom(darkLuxeTop.filter(c => c.id !== botC.id), darkLuxeTop[0] || FASHION_COLORS[6])
          : pickRandomFrom(crispTop, FASHION_COLORS[0]);
        const outC = pickRandomFrom(
          rankPoolForSlot(FASHION_COLORS.filter(c => PARTY_DARK_LUXE.has(c.id)), 'outerwear', 6),
          FASHION_COLORS[6]
        );
        const shoeC = pickRandomFrom(partyShoes, FASHION_COLORS[6]);

        candidatePalettes.push({
          type: isMonochromeFormula ? 'analogous' : modeType,
          colors: {
            outerwear: outC,
            top: topC,
            bottom: botC,
            shoes: shoeC,
          },
        });
      }
      return;
    }

    // Cho work_study, casual_cafe hoặc all + undertone cụ thể: tạo 8 biến thể kết hợp từ top ứng viên theo ngữ cảnh
    for (let v = 0; v < 8; v++) {
      const topC = pickRandomFrom(topContextPool, FASHION_COLORS[2]);
      const topL = hexToHsl(topC.hex).l;
      const contrastingBotPool = bottomContextPool.filter(c => {
        if (c.id === topC.id) return false;
        const lDiff = Math.abs(hexToHsl(c.hex).l - topL);
        return lDiff >= 18;
      });
      const botC = pickRandomFrom(
        contrastingBotPool.length > 0 ? contrastingBotPool : bottomContextPool,
        FASHION_COLORS[6]
      );
      const outC = pickRandomFrom(
        outerContextPool.filter(c => c.id !== topC.id),
        outerContextPool[0] || FASHION_COLORS[8]
      );
      const shoeC = pickRandomFrom(
        shoesContextPool.filter(c => c.id !== botC.id),
        shoesContextPool[0] || FASHION_COLORS[0]
      );

      candidatePalettes.push({
        type: modeType,
        colors: {
          outerwear: outC,
          top: topC,
          bottom: botC,
          shoes: shoeC,
        },
      });
    }
  };

  if (harmonyMode === 'neutral') {
    buildNeutralCandidates();
    buildContextCuratedCandidates();
  } else if (harmonyMode === 'analogous') {
    buildAnalogousCandidates();
    buildContextCuratedCandidates();
  } else if (harmonyMode === 'complementary') {
    buildComplementaryCandidates();
    buildContextCuratedCandidates();
  } else {
    buildNeutralCandidates();
    buildAnalogousCandidates();
    buildComplementaryCandidates();
    buildContextCuratedCandidates();
  }

  // Gắn chặt màu các món ĐANG KHÓA vào từng ứng viên trước khi chấm điểm tổng thể
  // (Tuyệt đối không bao giờ tự ý đổi món đang khóa!)
  const resolvedCandidates = candidatePalettes.map(cand => {
    const finalColors: Record<OutfitSlotId, FashionColor> = {
      outerwear: slots.outerwear.locked ? slots.outerwear.color : cand.colors.outerwear,
      top: slots.top.locked ? slots.top.color : cand.colors.top,
      bottom: slots.bottom.locked ? slots.bottom.color : cand.colors.bottom,
      shoes: slots.shoes.locked ? slots.shoes.color : cand.colors.shoes,
    };
    const score = scoreOutfitCandidate(finalColors, activeSlotKeys, isLayering, context);
    return {
      type: cand.type,
      colors: finalColors,
      score,
    };
  });

  const isDuplicate = (colors: Record<OutfitSlotId, FashionColor>) =>
    unlockedSlots.every(key => colors[key].id === slots[key].color.id);

  // Loại bỏ ứng viên trùng hệt bộ hiện tại & loại bỏ trùng lặp nội bộ
  const seenKeys = new Set<string>();
  let rankedPool = resolvedCandidates
    .filter(c => {
      if (isDuplicate(c.colors)) return false;
      const sig = activeSlotKeys.map(k => c.colors[k].id).join('|');
      if (seenKeys.has(sig)) return false;
      seenKeys.add(sig);
      return true;
    })
    .sort((a, b) => b.score - a.score);

  // Van an toàn KHÔNG BAO GIỜ RỖNG: chấm điểm đủ 46 màu cho từng món mở khóa & lấy Top tốt nhất
  if (rankedPool.length === 0) {
    const fallbackColors: Record<OutfitSlotId, FashionColor> = {
      outerwear: slots.outerwear.color,
      top: slots.top.color,
      bottom: slots.bottom.color,
      shoes: slots.shoes.color,
    };
    for (const key of unlockedSlots) {
      const curId = slots[key].color.id;
      const rankedSlotColors = FASHION_COLORS.filter(c => c.id !== curId)
        .map(c => ({
          color: c,
          score: scoreColorForContext(c, key, isLayering, context),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(item => item.color);
      fallbackColors[key] = pickRandomFrom(rankedSlotColors, FASHION_COLORS[0]);
    }
    rankedPool = [
      {
        type: harmonyMode === 'all' ? 'neutral' : harmonyMode,
        colors: fallbackColors,
        score: scoreOutfitCandidate(fallbackColors, activeSlotKeys, isLayering, context),
      },
    ];
  }

  // Lấy Top ứng viên điểm cao nhất (trong biên độ gần nhất với ứng viên #1) để xoay vòng mượt mà
  const bestScore = rankedPool[0].score;
  const nearTop = rankedPool.filter(item => item.score >= bestScore - 18).slice(0, 6);
  const topBand = nearTop.length >= 2 ? nearTop : rankedPool.slice(0, Math.min(4, rankedPool.length));
  const chosen = topBand[Math.floor(Math.random() * topBand.length)];

  const nextSlots: OutfitSlotsMap = {
    outerwear: {
      ...slots.outerwear,
      color: slots.outerwear.locked ? slots.outerwear.color : chosen.colors.outerwear,
    },
    top: {
      ...slots.top,
      color: slots.top.locked ? slots.top.color : chosen.colors.top,
    },
    bottom: {
      ...slots.bottom,
      color: slots.bottom.locked ? slots.bottom.color : chosen.colors.bottom,
    },
    shoes: {
      ...slots.shoes,
      color: slots.shoes.locked ? slots.shoes.color : chosen.colors.shoes,
    },
  };

  const visualRatios = calculateVisualRatios(nextSlots, isLayering);
  const nextState: StudioOutfitState = {
    ...currentState,
    slots: nextSlots,
    visualRatios,
    occasion: context.occasion,
    undertone: context.undertone,
    harmonyType: chosen.type,
  };
  const advice = generateOutfitAdvice(nextState);

  return {
    ...nextState,
    harmonyTitle: advice.title,
    harmonyDescription: advice.reason,
  };
}

/** Alias chuẩn hóa cho thuật toán Lock & Shuffle hỗ trợ Hoàn cảnh + Tông da */
export const shuffleWithLocks = shuffleOutfitColors;

interface OccasionSilhouettePreset {
  isLayering: boolean;
  outerwear?: SilhouetteId;
  top: SilhouetteId;
  bottom: SilhouetteId;
  shoes: SilhouetteId;
}

const OCCASION_SILHOUETTE_PRESETS: Record<
  Exclude<OccasionMode, 'all'>,
  Record<SilhouetteStyleType, OccasionSilhouettePreset[]>
> = {
  study: {
    male: [
      { isLayering: false, top: 'tshirt', bottom: 'jeans', shoes: 'sneaker' },
      { isLayering: false, top: 'polo', bottom: 'jeans', shoes: 'sneaker' },
      { isLayering: false, top: 'hoodie', bottom: 'jeans', shoes: 'sneaker' },
    ],
    female: [
      { isLayering: false, top: 'baby_tee', bottom: 'jeans', shoes: 'sneaker' },
      { isLayering: false, top: 'tshirt', bottom: 'mini_skirt', shoes: 'sneaker' },
      { isLayering: false, top: 'baby_tee', bottom: 'mini_skirt', shoes: 'sneaker' },
    ],
  },
  work: {
    male: [
      { isLayering: false, top: 'shirt', bottom: 'wide_pants', shoes: 'dress_shoes' },
      { isLayering: false, top: 'polo', bottom: 'wide_pants', shoes: 'loafer' },
      { isLayering: false, top: 'shirt', bottom: 'wide_pants', shoes: 'loafer' },
    ],
    female: [
      { isLayering: false, top: 'blouse', bottom: 'wide_pants', shoes: 'heels' },
      { isLayering: false, top: 'shirt', bottom: 'a_line_skirt', shoes: 'loafer' },
      { isLayering: false, top: 'blouse', bottom: 'a_line_skirt', shoes: 'heels' },
    ],
  },
  casual: {
    male: [
      { isLayering: false, top: 'polo', bottom: 'shorts', shoes: 'sneaker' },
      { isLayering: true, outerwear: 'shirt', top: 'tshirt', bottom: 'jeans', shoes: 'sneaker' },
      { isLayering: false, top: 'tshirt', bottom: 'shorts', shoes: 'loafer' },
    ],
    female: [
      { isLayering: false, top: 'baby_tee', bottom: 'mini_skirt', shoes: 'sneaker' },
      { isLayering: false, top: 'tshirt', bottom: 'shorts', shoes: 'sneaker' },
      { isLayering: false, top: 'baby_tee', bottom: 'shorts', shoes: 'boot' },
    ],
  },
  party: {
    male: [
      { isLayering: true, outerwear: 'blazer', top: 'tshirt', bottom: 'wide_pants', shoes: 'dress_shoes' },
      { isLayering: true, outerwear: 'blazer', top: 'shirt', bottom: 'wide_pants', shoes: 'dress_shoes' },
      { isLayering: true, outerwear: 'blazer', top: 'tshirt', bottom: 'wide_pants', shoes: 'boot' },
    ],
    female: [
      { isLayering: false, top: 'blouse', bottom: 'mini_skirt', shoes: 'heels' },
      { isLayering: true, outerwear: 'blazer', top: 'baby_tee', bottom: 'mini_skirt', shoes: 'heels' },
      { isLayering: false, top: 'blouse', bottom: 'a_line_skirt', shoes: 'boot' },
    ],
  },
};

function applyOccasionSilhouettePreset(
  state: StudioOutfitState,
  occasion: Exclude<OccasionMode, 'all'>
): StudioOutfitState {
  const presets = OCCASION_SILHOUETTE_PRESETS[occasion][state.styleType];
  if (!presets || presets.length === 0) return state;

  // Ưu tiên chọn preset khác phom hiện tại để tạo cảm giác chuyển cảnh rõ ràng ngay lập tức
  const distinct = presets.filter(
    p =>
      p.top !== state.slots.top.silhouette ||
      p.bottom !== state.slots.bottom.silhouette ||
      p.shoes !== state.slots.shoes.silhouette ||
      p.isLayering !== state.isLayering
  );
  const chosen = pickRandomFrom(distinct.length > 0 ? distinct : presets, presets[0]);

  // Nếu màu gốc đang gắn vào outerwear thì giữ isLayering = true để không làm mất màu chụp của user
  const nextIsLayering =
    state.sourceSlot === 'outerwear' ? true : chosen.isLayering;

  const nextSlots: OutfitSlotsMap = {
    outerwear: {
      ...state.slots.outerwear,
      silhouette: chosen.outerwear ?? state.slots.outerwear.silhouette,
    },
    top: {
      ...state.slots.top,
      silhouette: chosen.top,
      label: nextIsLayering ? 'Áo trong' : 'Áo chính',
    },
    bottom: {
      ...state.slots.bottom,
      silhouette: chosen.bottom,
      label:
        chosen.bottom === 'a_line_skirt' || chosen.bottom === 'mini_skirt'
          ? 'Chân váy'
          : 'Quần',
    },
    shoes: {
      ...state.slots.shoes,
      silhouette: chosen.shoes,
    },
  };

  // Nếu preset bật Layering và trước đó chưa bật, đảm bảo màu khoác ngoài chưa bị khóa sẽ được remix
  if (nextIsLayering && !state.isLayering && !nextSlots.outerwear.isBase) {
    nextSlots.outerwear.locked = false;
  }

  const visualRatios = calculateVisualRatios(nextSlots, nextIsLayering);
  return {
    ...state,
    isLayering: nextIsLayering,
    slots: nextSlots,
    visualRatios,
  };
}

/**
 * Cập nhật Hoàn cảnh (OccasionMode) và/hoặc Tông da (SkinUndertone):
 * - Nếu đổi sang một trong 4 Hoàn cảnh (`study` / `work` / `casual` / `party`), tự động đồng bộ
 *   cả PHOM DÁNG (theo giới tính) lẫn MÀU SẮC các món chưa khóa (tuyệt đối giữ nguyên món đang khóa).
 * - Nếu chỉ đổi Tông da hoặc tắt về `all`, giữ nguyên phom dáng và phối lại màu các món chưa khóa.
 */
export function remixOutfitForContext(
  currentState: StudioOutfitState,
  nextContext: Partial<OutfitFilterContext>,
  harmonyMode: StyleHarmonyMode = 'all'
): StudioOutfitState {
  const occasion: OccasionMode = nextContext.occasion ?? currentState.occasion ?? 'all';
  const undertone: SkinUndertone = nextContext.undertone ?? currentState.undertone ?? 'neutral';
  const occasionChanged =
    nextContext.occasion !== undefined && nextContext.occasion !== currentState.occasion;

  let workingState: StudioOutfitState = {
    ...currentState,
    occasion,
    undertone,
  };

  if (occasionChanged && occasion !== 'all') {
    workingState = applyOccasionSilhouettePreset(workingState, occasion);
  }

  const activeSlotKeys: OutfitSlotId[] = workingState.isLayering
    ? ['outerwear', 'top', 'bottom', 'shoes']
    : ['top', 'bottom', 'shoes'];
  const hasUnlocked = activeSlotKeys.some(key => !workingState.slots[key].locked);

  if (hasUnlocked) {
    return shuffleOutfitColors(workingState, harmonyMode, { occasion, undertone });
  }

  // Tất cả món đều đang khóa: giữ nguyên màu các món khóa nhưng cập nhật phom & lời khuyên Stylist mới
  const advice = generateOutfitAdvice(workingState);
  return {
    ...workingState,
    harmonyTitle: advice.title,
    harmonyDescription: advice.reason,
  };
}

// =============================================================
// 8. CẬP NHẬT PHOM DÁNG, MÀU SẮC, KHÓA & MỞ KHÓA NHANH
// =============================================================

export function updateSlotSilhouette(
  currentState: StudioOutfitState,
  slotId: OutfitSlotId,
  silhouetteId: SilhouetteId
): StudioOutfitState {
  const currentItem = currentState.slots[slotId];
  if (currentItem.silhouette === silhouetteId) {
    return currentState;
  }

  const nextLabel =
    slotId === 'bottom'
      ? silhouetteId === 'a_line_skirt' || silhouetteId === 'mini_skirt'
        ? 'Chân váy'
        : 'Quần'
      : currentItem.label;

  const updatedSlots: OutfitSlotsMap = {
    ...currentState.slots,
    [slotId]: {
      ...currentItem,
      label: nextLabel,
      silhouette: silhouetteId,
    },
  };

  const visualRatios = calculateVisualRatios(updatedSlots, currentState.isLayering);

  return {
    ...currentState,
    slots: updatedSlots,
    visualRatios,
  };
}

export function updateSlotColor(
  currentState: StudioOutfitState,
  slotId: OutfitSlotId,
  color: FashionColor,
  autoLock = false
): StudioOutfitState {
  const currentItem = currentState.slots[slotId];
  if (currentItem.color.id === color.id && (!autoLock || currentItem.locked)) {
    return currentState;
  }

  const updatedSlots: OutfitSlotsMap = {
    ...currentState.slots,
    [slotId]: {
      ...currentItem,
      color,
      locked: autoLock ? true : currentItem.locked,
    },
  };

  const nextState: StudioOutfitState = {
    ...currentState,
    slots: updatedSlots,
    harmonyType: 'custom',
  };
  const advice = generateOutfitAdvice(nextState);

  return {
    ...nextState,
    harmonyTitle: advice.title,
    harmonyDescription: advice.reason,
  };
}

export function unlockNonBaseSlots(
  currentState: StudioOutfitState
): StudioOutfitState {
  const nextSlots: OutfitSlotsMap = {
    outerwear: {
      ...currentState.slots.outerwear,
      locked: currentState.slots.outerwear.isBase ? true : false,
    },
    top: {
      ...currentState.slots.top,
      locked: currentState.slots.top.isBase ? true : false,
    },
    bottom: {
      ...currentState.slots.bottom,
      locked: currentState.slots.bottom.isBase ? true : false,
    },
    shoes: {
      ...currentState.slots.shoes,
      locked: currentState.slots.shoes.isBase ? true : false,
    },
  };

  return {
    ...currentState,
    slots: nextSlots,
  };
}

export function toggleSlotLock(
  currentState: StudioOutfitState,
  slotId: OutfitSlotId
): StudioOutfitState {
  const currentItem = currentState.slots[slotId];
  const updatedSlots: OutfitSlotsMap = {
    ...currentState.slots,
    [slotId]: {
      ...currentItem,
      locked: !currentItem.locked,
    },
  };

  return {
    ...currentState,
    slots: updatedSlots,
  };
}

// =============================================================
// 9. TƯƠNG THÍCH NGƯỢC
// =============================================================

function createNeutralOutfit(
  baseColor: FashionColor,
  baseHsl: HSL,
  baseRole: 'top' | 'bottom'
): OutfitSuggestion {
  const isBaseDark = baseHsl.l < 50;
  const partnerCandidates = getNeutralColorOptions(isBaseDark ? 'light' : 'dark', [baseColor.id]);

  const preferredPartnerIds = isBaseDark
    ? ['wb-3', 'wb-5', 'wb-6', 'gb-6', 'wb-2', 'wb-4']
    : ['bn-2', 'gb-1', 'bc-1', 'gb-3', 'bn-1', 'bc-2'];

  let partnerColor = partnerCandidates.find(c => preferredPartnerIds.includes(c.id));
  if (!partnerColor && partnerCandidates.length > 0) {
    partnerColor = partnerCandidates[0];
  }
  if (!partnerColor) {
    partnerColor = FASHION_COLORS.find(c => preferredPartnerIds.includes(c.id) && c.id !== baseColor.id) || FASHION_COLORS[0];
  }

  const excludeForAcc = [baseColor.id, partnerColor.id];
  let accessoryColor: FashionColor | undefined;

  if (isBaseDark) {
    accessoryColor = FASHION_COLORS.find(c => c.id === 'wb-1' && !excludeForAcc.includes(c.id));
    if (!accessoryColor) {
      accessoryColor = FASHION_COLORS.find(c => c.id === 'bc-4' && !excludeForAcc.includes(c.id));
    }
  } else {
    accessoryColor = FASHION_COLORS.find(c => c.id === 'gb-1' && !excludeForAcc.includes(c.id));
    if (!accessoryColor) {
      accessoryColor = FASHION_COLORS.find(c => c.id === 'bc-4' && !excludeForAcc.includes(c.id));
    }
  }

  if (!accessoryColor) {
    const backupAccs = getNeutralColorOptions(isBaseDark ? 'light' : 'dark', excludeForAcc);
    accessoryColor = backupAccs[0] || FASHION_COLORS.find(c => !excludeForAcc.includes(c.id)) || FASHION_COLORS[1];
  }

  const topColor = baseRole === 'top' ? baseColor : partnerColor;
  const bottomColor = baseRole === 'bottom' ? baseColor : partnerColor;

  return {
    id: 'neutral',
    title: 'Trung tính • Dễ mặc',
    subtitle: `Sắc ${partnerColor.name} tạo độ tương phản sáng tối tinh tế cùng ${baseColor.name}, phụ kiện ${accessoryColor.name} giúp phom dáng gọn gàng, thanh lịch.`,
    slots: {
      top: topColor,
      bottom: bottomColor,
      accessory: accessoryColor,
    },
    proportions: {
      topPercent: baseRole === 'top' ? 30 : 60,
      bottomPercent: baseRole === 'top' ? 60 : 30,
      accessoryPercent: 10,
    },
  };
}

function createAnalogousOutfit(
  baseColor: FashionColor,
  baseHsl: HSL,
  baseRole: 'top' | 'bottom'
): OutfitSuggestion {
  const isNeutral = isNeutralColor(baseHsl, baseColor.category);
  let partnerColor: FashionColor;
  let accessoryColor: FashionColor;

  if (!isNeutral) {
    const targetH = (baseHsl.h + 28) % 360;
    const targetS = Math.max(12, Math.round(baseHsl.s * 0.88));
    const targetL = Math.max(20, Math.min(80, baseHsl.l + (baseHsl.l > 50 ? -8 : 8)));

    partnerColor = findClosestFashionColor(
      { h: targetH, s: targetS, l: targetL },
      [baseColor.id]
    );

    const avgL = (baseHsl.l + hexToHsl(partnerColor.hex).l) / 2;
    const neutralPref: 'light' | 'dark' = avgL >= 50 ? 'dark' : 'light';
    const accOptions = getNeutralColorOptions(neutralPref, [baseColor.id, partnerColor.id]);

    const preferredAccId = neutralPref === 'dark' ? 'gb-1' : 'wb-1';
    accessoryColor =
      accOptions.find(c => c.id === preferredAccId) ||
      accOptions[0] ||
      FASHION_COLORS.find(c => c.id === (neutralPref === 'dark' ? 'gb-1' : 'wb-1')) ||
      FASHION_COLORS[0];
  } else {
    const isWarm =
      baseColor.category === 'white_beige' ||
      baseColor.category === 'brown_camel' ||
      (baseHsl.h >= 25 && baseHsl.h <= 75);

    const warmPaletteIds = ['wb-3', 'wb-5', 'bc-3', 'bc-1'];
    const coolPaletteIds = ['wb-1', 'gb-6', 'gb-3', 'gb-1'];
    const paletteIds = isWarm ? warmPaletteIds : coolPaletteIds;

    const availableFromPalette = paletteIds
      .filter(id => id !== baseColor.id)
      .map(id => FASHION_COLORS.find(c => c.id === id))
      .filter((c): c is FashionColor => !!c);

    partnerColor = availableFromPalette[0] || FASHION_COLORS[1];
    accessoryColor = availableFromPalette[1] || availableFromPalette[0] || FASHION_COLORS[0];
  }

  const topColor = baseRole === 'top' ? baseColor : partnerColor;
  const bottomColor = baseRole === 'bottom' ? baseColor : partnerColor;

  return {
    id: 'analogous',
    title: 'Thanh lịch • Tương đồng',
    subtitle: isNeutral
      ? `Phối sắc độ Monochrome chuyển tông dịu mắt giữa ${baseColor.name} và ${partnerColor.name}, nhấn nhẹ bằng ${accessoryColor.name}.`
      : `Hiệu ứng Ton-sur-ton liền mạch giữa ${baseColor.name} và ${partnerColor.name}, điểm nhấn trung tính ${accessoryColor.name} tạo cảm giác sang trọng.`,
    slots: {
      top: topColor,
      bottom: bottomColor,
      accessory: accessoryColor,
    },
    proportions: {
      topPercent: baseRole === 'top' ? 30 : 60,
      bottomPercent: baseRole === 'top' ? 60 : 30,
      accessoryPercent: 10,
    },
  };
}

function createComplementaryOutfit(
  baseColor: FashionColor,
  baseHsl: HSL,
  baseRole: 'top' | 'bottom'
): OutfitSuggestion {
  const isNeutral = isNeutralColor(baseHsl, baseColor.category);
  let topColor: FashionColor;
  let bottomColor: FashionColor;
  let accessoryColor: FashionColor;

  if (!isNeutral) {
    const targetH = (baseHsl.h + 155) % 360;
    const targetS = Math.max(28, Math.min(80, Math.round(baseHsl.s * 0.9)));
    const targetL = Math.max(30, Math.min(68, baseHsl.l));

    const popColor = findClosestFashionColor(
      { h: targetH, s: targetS, l: targetL },
      [baseColor.id]
    );

    const isDarkCombo = (baseHsl.l + hexToHsl(popColor.hex).l) / 2 < 50;
    const neutralBasePref: 'light' | 'dark' = isDarkCombo ? 'light' : 'dark';
    const neutralBases = getNeutralColorOptions(neutralBasePref, [baseColor.id, popColor.id]);

    const preferredBaseId = isDarkCombo ? 'wb-5' : 'bn-2';
    const neutralColor =
      neutralBases.find(c => c.id === preferredBaseId) ||
      neutralBases[0] ||
      FASHION_COLORS.find(c => c.id === (isDarkCombo ? 'wb-3' : 'gb-1')) ||
      FASHION_COLORS[0];

    if (baseRole === 'top') {
      topColor = baseColor;
      bottomColor = neutralColor;
      accessoryColor = popColor;
    } else {
      bottomColor = baseColor;
      topColor = popColor;
      accessoryColor = neutralColor;
    }
  } else {
    const statementColorIds = ['gr-1', 'rp-1', 'gr-3', 'yp-1', 'rp-5', 'bn-4'];
    const popCandidates = FASHION_COLORS.filter(
      c => statementColorIds.includes(c.id) && c.id !== baseColor.id
    );

    const popColor =
      popCandidates.find(c => {
        const cL = hexToHsl(c.hex).l;
        return baseHsl.l < 50 ? cL > 45 : cL < 45;
      }) || popCandidates[0] || FASHION_COLORS.find(c => c.id === 'rp-1')!;

    const accOptions = getNeutralColorOptions(baseHsl.l < 50 ? 'light' : 'dark', [
      baseColor.id,
      popColor.id,
    ]);
    accessoryColor =
      accOptions.find(c => c.id === 'wb-1' || c.id === 'gb-1') ||
      accOptions[0] ||
      FASHION_COLORS[0];

    if (baseRole === 'top') {
      topColor = baseColor;
      bottomColor = popColor;
    } else {
      bottomColor = baseColor;
      topColor = popColor;
    }
  }

  return {
    id: 'complementary',
    title: 'Nổi bật • Tương phản',
    subtitle: isNeutral
      ? `Nền trung tính ${baseColor.name} làm bừng sáng mảng màu nổi bật ${baseRole === 'top' ? bottomColor.name : topColor.name}, điểm xuyết hài hòa cùng ${accessoryColor.name}.`
      : `Phối bổ túc Split-Complementary giữa ${baseColor.name} và ${baseRole === 'top' ? accessoryColor.name : topColor.name} trên nền cân bằng ${baseRole === 'top' ? bottomColor.name : accessoryColor.name} đầy thu hút.`,
    slots: {
      top: topColor,
      bottom: bottomColor,
      accessory: accessoryColor,
    },
    proportions: {
      topPercent: baseRole === 'top' ? 30 : 60,
      bottomPercent: baseRole === 'top' ? 60 : 30,
      accessoryPercent: 10,
    },
  };
}

export function generateOutfitSuggestions(
  baseColor: FashionColor,
  baseRole: 'top' | 'bottom' = 'top'
): OutfitSuggestion[] {
  const baseHsl = hexToHsl(baseColor.hex);

  const neutralOutfit = createNeutralOutfit(baseColor, baseHsl, baseRole);
  const analogousOutfit = createAnalogousOutfit(baseColor, baseHsl, baseRole);
  const complementaryOutfit = createComplementaryOutfit(baseColor, baseHsl, baseRole);

  return [neutralOutfit, analogousOutfit, complementaryOutfit];
}
