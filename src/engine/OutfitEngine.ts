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
    id: 'tshirt',
    label: 'Áo thun cơ bản',
    slotId: 'top',
    areaFactor: 1.0,
    iconName: 'shirt-outline',
    description: 'Cổ tròn đơn giản, độ rủ tự nhiên, dễ kết hợp mọi phong cách',
  },
  {
    id: 'shirt',
    label: 'Sơ mi thanh lịch',
    slotId: 'top',
    areaFactor: 1.05,
    iconName: 'business-outline',
    description: 'Cổ bẻ sắc sảo, hàng cúc chỉn chu, phù hợp công sở & dạo phố',
  },
  {
    id: 'hoodie',
    label: 'Hoodie / Sweater',
    slotId: 'top',
    areaFactor: 1.22,
    iconName: 'snow-outline',
    description: 'Mũ trùm rộng & túi kangaroo ấm áp, phom dáng oversize trẻ trung',
  },
  {
    id: 'blazer',
    label: 'Blazer hiện đại',
    slotId: 'top',
    areaFactor: 1.22,
    iconName: 'file-tray-full-outline',
    description: 'Ve áo chữ V sang trọng, tôn dáng vai và tạo lớp phủ đĩnh đạc',
  },
];

export const OUTERWEAR_SILHOUETTES: SilhouetteOption[] = [
  {
    id: 'blazer',
    label: 'Blazer khoác ngoài',
    slotId: 'outerwear',
    areaFactor: 1.22,
    iconName: 'file-tray-full-outline',
    description: 'Vai đứng, ve áo chữ V nhọn, vạt mở thẳng để lộ 20% áo trong',
  },
  {
    id: 'shirt',
    label: 'Sơ mi khoác ngoài',
    slotId: 'outerwear',
    areaFactor: 1.05,
    iconName: 'business-outline',
    description: 'Cổ bẻ mềm, vạt suông thả buông, nẹp cúc dọc mép và cổ tay măng-séc',
  },
  {
    id: 'hoodie',
    label: 'Hoodie khoác (Zip-up)',
    slotId: 'outerwear',
    areaFactor: 1.2,
    iconName: 'snow-outline',
    description: 'Mũ trùm phía sau cổ, 2 dây rút trước ngực, khóa kéo mở & túi kangaroo chia đôi',
  },
];

export const BOTTOM_SILHOUETTES: SilhouetteOption[] = [
  {
    id: 'wide_pants',
    label: 'Quần ống suông',
    slotId: 'bottom',
    areaFactor: 1.15,
    iconName: 'male-outline',
    description: 'Ống suông dài chạm gót, che khuyết điểm và tôn chiều cao',
  },
  {
    id: 'jeans',
    label: 'Quần Jean',
    slotId: 'bottom',
    areaFactor: 1.0,
    iconName: 'grid-outline',
    description: 'Ống đứng gọn gàng, đường may nổi kinh điển, bền bỉ',
  },
  {
    id: 'shorts',
    label: 'Quần Short',
    slotId: 'bottom',
    areaFactor: 0.58,
    iconName: 'cut-outline',
    description: 'Ngang gối năng động, để lộ chân tạo cảm giác thoải mái mùa hè',
  },
  {
    id: 'a_line_skirt',
    label: 'Chân váy chữ A',
    slotId: 'bottom',
    areaFactor: 0.68,
    iconName: 'woman-outline',
    description: 'Dáng xòe nữ tính ngang gối, thắt eo duyên dáng (Dành riêng cho Nữ)',
  },
];

export const SHOES_SILHOUETTES: SilhouetteOption[] = [
  {
    id: 'sneakers',
    label: 'Sneaker',
    slotId: 'shoes',
    areaFactor: 1.0,
    iconName: 'footsteps-outline',
    description: 'Giày thể thao đế trắng năng động, êm ái cho mọi hoạt động hàng ngày',
  },
  {
    id: 'loafers',
    label: 'Loafer / Giày Tây',
    slotId: 'shoes',
    areaFactor: 0.92,
    iconName: 'ribbon-outline',
    description: 'Mũi thuôn thanh lịch, đế mỏng tối màu sang trọng',
  },
  {
    id: 'boots',
    label: 'Boot / Cao gót',
    slotId: 'shoes',
    areaFactor: 1.15,
    iconName: 'flash-outline',
    description: 'Cổ cao / gót tôn dáng sang trọng, phong cách thời thượng',
  },
];

export function getShoesSilhouettes(styleType: SilhouetteStyleType = 'male'): SilhouetteOption[] {
  return [
    {
      id: 'sneakers',
      label: 'Sneaker',
      slotId: 'shoes',
      areaFactor: 1.0,
      iconName: 'footsteps-outline',
      description: 'Giày thể thao đế trắng năng động, êm ái cho mọi hoạt động hàng ngày',
    },
    {
      id: 'loafers',
      label: 'Loafer / Giày Tây',
      slotId: 'shoes',
      areaFactor: 0.92,
      iconName: 'ribbon-outline',
      description: 'Mũi thuôn thanh lịch, đế mỏng tối màu sang trọng',
    },
    {
      id: 'boots',
      label: styleType === 'female' ? 'Boot / Cao gót' : 'Boot cổ cao',
      slotId: 'shoes',
      areaFactor: 1.15,
      iconName: 'flash-outline',
      description:
        styleType === 'female'
          ? 'Gót thanh mảnh tôn dáng nữ tính, sang trọng'
          : 'Cổ cao thời thượng, phom dáng mạnh mẽ và cá tính',
    },
  ];
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

/**
 * Sinh lời khuyên Stylist ngắn gọn bằng tiếng Việt tự nhiên giải thích lý do bộ màu hài hòa
 * hoặc cảnh báo nhẹ khi người dùng chấm 2 màu quá chói cạnh tranh / trùng độ sáng.
 */
export function generateOutfitAdvice(outfit: StudioOutfitState): OutfitAdvice {
  const { isLayering, slots } = outfit;
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
    };
  });

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
  const ls = items.map(it => it.hsl.l);
  const minL = Math.min(...ls);
  const maxL = Math.max(...ls);
  if (maxL - minL < 14 && minL >= 20 && maxL <= 84) {
    return {
      title: 'Thiếu điểm nhấn sáng-tối',
      reason:
        'Các món đang trùng độ sáng nên tổng thể hơi phẳng, thử đổi áo hoặc giày sang tông sáng/tối hơn để nổi bật.',
      isWarning: true,
    };
  }

  // 3. Phân tích tích cực theo bộ màu thực tế
  const shoes = items.find(it => it.key === 'shoes')!;
  const bottom = items.find(it => it.key === 'bottom')!;
  const top = items.find(it => it.key === 'top')!;
  const outer = isLayering ? items.find(it => it.key === 'outerwear') : undefined;

  const nonNeutrals = items.filter(it => !it.neutral);
  const toneWord = (l: number) => (l < 34 ? 'trầm' : l > 70 ? 'sáng' : 'ấm dịu');

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
    const contrastItem = outer ? top : top;
    return {
      title: 'Trung tính Thanh lịch',
      reason: `${main.name} ${toneWord(main.hsl.l)} cân bằng tốt với ${contrastItem.name} và giày ${shoes.name} gọn gàng, dễ mặc.`,
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
  styleType: SilhouetteStyleType = 'male'
): StudioOutfitState {
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
      silhouette: 'sneakers',
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
      silhouette: 'sneakers',
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
    bottom: { ...currentState.slots.bottom },
    shoes: { ...currentState.slots.shoes },
  };

  if (newGender === 'male') {
    // Nếu đang chọn Chân váy chữ A, tự động chuyển về Quần ống suông
    if (nextSlots.bottom.silhouette === 'a_line_skirt') {
      nextSlots.bottom.silhouette = 'wide_pants';
      nextSlots.bottom.label = 'Quần';
    } else {
      nextSlots.bottom.label = 'Quần';
    }
  } else {
    // Nữ: nếu đang là quần thì giữ nguyên hoặc đổi label
    if (nextSlots.bottom.silhouette === 'a_line_skirt') {
      nextSlots.bottom.label = 'Chân váy';
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

    if (topIsBase && topIsLocked) {
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

      // Áo thun mặc trong: trung tính tương phản nhẹ
      const innerColorCandidates = getNeutralColorOptions(
        baseTopHsl.l < 50 ? 'light' : 'dark',
        [baseTopColor.id]
      );
      const innerColor =
        innerColorCandidates[0] ||
        FASHION_COLORS.find(c => (baseTopHsl.l < 50 ? c.id === 'wb-1' : c.id === 'gb-1')) ||
        FASHION_COLORS[0];

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

function pickColorByIds(
  preferredIds: string[],
  excludeIds: string[],
  fallbackPool: FashionColor[] = FASHION_COLORS
): FashionColor {
  for (const id of preferredIds) {
    if (excludeIds.includes(id)) continue;
    const found = FASHION_COLORS.find(c => c.id === id);
    if (found) return found;
  }
  const safe = fallbackPool.find(c => !excludeIds.includes(c.id));
  return safe || FASHION_COLORS.find(c => !excludeIds.includes(c.id)) || FASHION_COLORS[0];
}

/**
 * Chuyển màu vừa hút/chụp từ Camera sang món bất kỳ (outerwear / top / bottom / shoes)
 * và tự động phối lại màu hài hòa cho các món còn lại quanh món gốc mới.
 */
export function applyScannedColorToSlot(
  current: StudioOutfitState,
  scannedColor: FashionColor,
  targetSlot: OutfitSlotId,
  palette: FashionColor[] = FASHION_COLORS
): StudioOutfitState {
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

  let harmonyTitle = 'Phối màu Cân bằng Thời trang';
  let harmonyDescription = `Tôn vinh sắc ${scannedColor.name} làm tâm điểm hài hòa cùng các mảng màu còn lại.`;

  if (targetSlot === 'shoes') {
    // Giày (10% điểm nhấn): Cho phép màu nổi (Tím Mận, Đỏ Đô, Cam Đất...) không bao giờ bị lọc rỗng!
    // Tự động phối Quần và Áo bằng cặp trung tính / trầm sạch sẽ (60-30) để tôn đôi giày làm điểm nhấn 10%.
    const cleanTop = pickColorByIds(
      isScannedDark ? ['wb-1', 'wb-3', 'wb-2', 'wb-5'] : ['gb-1', 'bn-2', 'gb-3', 'wb-3'],
      [scannedColor.id],
      palette
    );
    const cleanBottom = pickColorByIds(
      isScannedDark ? ['bn-2', 'gb-1', 'gb-3', 'wb-5'] : ['gb-1', 'gb-3', 'bn-2', 'bc-1'],
      [scannedColor.id, cleanTop.id],
      palette
    );
    const cleanOuter = pickColorByIds(
      ['gb-3', 'wb-5', 'bn-2', 'bc-1'],
      [scannedColor.id, cleanTop.id, cleanBottom.id],
      palette
    );

    if (!nextSlots.top.locked) nextSlots.top.color = cleanTop;
    if (!nextSlots.bottom.locked) nextSlots.bottom.color = cleanBottom;
    if (!nextSlots.outerwear.locked) nextSlots.outerwear.color = cleanOuter;

    harmonyTitle = 'Điểm nhấn Giày 10% Nổi bật';
    harmonyDescription = `Cặp nền trung tính ${cleanBottom.name} & ${cleanTop.name} giữ tổng thể sạch sẽ, tôn đôi giày ${scannedColor.name} làm điểm nhấn thu hút.`;
  } else if (targetSlot === 'bottom') {
    // Quần/Váy là màu gốc: ưu tiên phối Áo trên & Giày có độ tương phản sáng-tối rõ ràng, dễ mặc
    const topContrast = pickColorByIds(
      isScannedDark ? ['wb-3', 'wb-1', 'wb-5', 'wb-6', 'gb-6'] : ['gb-1', 'bn-2', 'gb-3', 'bc-1'],
      [scannedColor.id],
      palette
    );
    const shoesPartner = pickColorByIds(
      isScannedDark ? ['wb-1', 'bc-4', 'gb-1'] : ['gb-1', 'bc-4', 'wb-1'],
      [scannedColor.id, topContrast.id],
      palette
    );
    const outerPartner = pickColorByIds(
      isScannedDark ? ['wb-5', 'gb-3', 'bc-3'] : ['gb-1', 'bn-2', 'bc-1'],
      [scannedColor.id, topContrast.id, shoesPartner.id],
      palette
    );

    if (!nextSlots.top.locked) nextSlots.top.color = topContrast;
    if (!nextSlots.shoes.locked) nextSlots.shoes.color = shoesPartner;
    if (!nextSlots.outerwear.locked) nextSlots.outerwear.color = outerPartner;

    harmonyTitle = 'Tương phản Sáng-Tối Thanh lịch';
    harmonyDescription = `Quần/Váy ${scannedColor.name} phối tương phản sắc nét cùng áo ${topContrast.name} và giày ${shoesPartner.name} cực kỳ dễ mặc.`;
  } else if (targetSlot === 'outerwear') {
    // Áo khoác 40% là màu gốc: lót áo thun 20% trung tính sáng/tối đối lập + quần 30% cân bằng
    const innerTop = pickColorByIds(
      isScannedDark ? ['wb-1', 'wb-2', 'wb-3'] : ['gb-1', 'gb-2', 'wb-1'],
      [scannedColor.id],
      palette
    );
    const bottomMatch = pickColorByIds(
      isScannedNeutral
        ? ['bn-2', 'gb-1', 'wb-5', 'bc-1']
        : isScannedDark
        ? ['wb-5', 'gb-3', 'gb-1', 'wb-3']
        : ['gb-1', 'bn-2', 'gb-3', 'bc-1'],
      [scannedColor.id, innerTop.id],
      palette
    );
    const shoesMatch = pickColorByIds(
      isScannedDark ? ['wb-1', 'gb-1', 'bc-4'] : ['gb-1', 'bc-4', 'wb-1'],
      [scannedColor.id, innerTop.id, bottomMatch.id],
      palette
    );

    if (!nextSlots.top.locked) nextSlots.top.color = innerTop;
    if (!nextSlots.bottom.locked) nextSlots.bottom.color = bottomMatch;
    if (!nextSlots.shoes.locked) nextSlots.shoes.color = shoesMatch;

    harmonyTitle = 'Phối lớp Layering 40-20-30-10';
    harmonyDescription = `Áo khoác ${scannedColor.name} làm mảng chủ đạo 40%, lót áo trong ${innerTop.name} sạch sẽ cùng quần ${bottomMatch.name} hài hòa.`;
  } else {
    // Áo chính là màu gốc
    const bottomPartner = pickColorByIds(
      isScannedDark ? ['wb-5', 'wb-3', 'gb-6', 'wb-6'] : ['bn-2', 'gb-1', 'gb-3', 'bc-1'],
      [scannedColor.id],
      palette
    );
    const shoesPartner = pickColorByIds(
      isScannedDark ? ['wb-1', 'bc-4', 'gb-1'] : ['gb-1', 'wb-1', 'bc-4'],
      [scannedColor.id, bottomPartner.id],
      palette
    );

    if (!nextSlots.bottom.locked) nextSlots.bottom.color = bottomPartner;
    if (!nextSlots.shoes.locked) nextSlots.shoes.color = shoesPartner;

    harmonyTitle = 'Phối màu Trung tính Dễ mặc';
    harmonyDescription = `Áo ${scannedColor.name} nổi bật hài hòa cùng quần ${bottomPartner.name} và giày ${shoesPartner.name}.`;
  }

  const visualRatios = calculateVisualRatios(nextSlots, nextIsLayering);

  return {
    ...current,
    isLayering: nextIsLayering,
    sourceSlot: targetSlot,
    scannedColor,
    slots: nextSlots,
    visualRatios,
    harmonyTitle,
    harmonyDescription,
    harmonyType: 'neutral',
  };
}

// =============================================================
// 7. KHÓA MÓN & XOAY VÒNG BIẾN THỂ TRÊN ĐỦ BẢNG MÀU VẢI (LOCK & SHUFFLE)
// =============================================================

function pickRandomFrom<T>(list: T[], fallback: T): T {
  if (list.length === 0) return fallback;
  return list[Math.floor(Math.random() * list.length)];
}

export function shuffleOutfitColors(
  currentState: StudioOutfitState,
  harmonyMode: StyleHarmonyMode = 'all'
): StudioOutfitState {
  const { isLayering, slots } = currentState;

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

  type CandidatePalette = {
    type: 'neutral' | 'analogous' | 'complementary';
    colors: Record<OutfitSlotId, FashionColor>;
  };

  const candidatePalettes: CandidatePalette[] = [];

  // --- NHÓM 1: TRUNG TÍNH ('neutral') — 4 biến thể đa dạng từ toàn bộ nhóm trung tính + navy/nâu trầm ---
  const buildNeutralCandidates = () => {
    const prefPool = isAnchorDark ? lightNeutrals : darkNeutrals;
    const altPool = isAnchorDark ? darkNeutrals : lightNeutrals;

    for (let v = 0; v < 4; v++) {
      const p1 = pickRandomFrom(prefPool, FASHION_COLORS[0]);
      const p2 = pickRandomFrom(
        altPool.filter(c => c.id !== p1.id),
        pickRandomFrom(allNeutrals, FASHION_COLORS[6])
      );
      const p3 = pickRandomFrom(
        allNeutrals.filter(c => c.id !== p1.id && c.id !== p2.id),
        p1
      );
      const shoe = pickRandomFrom(
        shoeClassics.filter(c => c.id !== p1.id),
        FASHION_COLORS[0]
      );

      if (anchorSlotKey === 'shoes') {
        // Giữ nền trung tính cực sạch để tôn đôi giày (kể cả khi giày là màu nổi đậm!)
        const topC = v % 2 === 0 ? pickRandomFrom(lightNeutrals, p1) : pickRandomFrom(darkNeutrals, p2);
        const botC = v % 2 === 0 ? pickRandomFrom(darkNeutrals, p2) : pickRandomFrom(lightNeutrals, p1);
        const outC = pickRandomFrom(allNeutrals.filter(c => c.id !== topC.id), p3);
        candidatePalettes.push({
          type: 'neutral',
          colors: { outerwear: outC, top: topC, bottom: botC, shoes: anchorColor },
        });
      } else {
        candidatePalettes.push({
          type: 'neutral',
          colors: {
            outerwear: anchorSlotKey === 'outerwear' ? anchorColor : (v % 2 === 0 ? p2 : p3),
            top: anchorSlotKey === 'top' ? anchorColor : (isLayering ? pickRandomFrom(lightNeutrals, p1) : p1),
            bottom: anchorSlotKey === 'bottom' ? anchorColor : (v % 2 === 0 ? p1 : p2),
            shoes: shoe,
          },
        });
      }
    }
  };

  // --- NHÓM 2: THANH LỊCH / TƯƠNG ĐỒNG ('analogous') — 4 biến thể Ton-sur-ton / Monochrome / Earth ---
  const buildAnalogousCandidates = () => {
    const hueOffsets = [22, 34, -24, -38];
    for (let v = 0; v < 4; v++) {
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

        partnerA =
          v < 2 && analogousMatches.length > 0
            ? pickRandomFrom(analogousMatches, FASHION_COLORS[4])
            : findClosestFashionColor(
                {
                  h: targetH,
                  s: Math.max(18, Math.round(anchorHsl.s * (0.72 + (v % 2) * 0.18))),
                  l: Math.max(20, Math.min(82, anchorHsl.l + (isAnchorDark ? 16 : -16))),
                },
                [anchorColor.id]
              );

        partnerB = pickRandomFrom(
          (isAnchorDark ? lightNeutrals : darkNeutrals).filter(c => c.id !== partnerA.id),
          pickRandomFrom(allNeutrals, FASHION_COLORS[2])
        );
      } else {
        // Với màu gốc trung tính: chuyển tông ấm (Be - Camel - Nâu Đất) hoặc lạnh (Xám - Navy - Xanh)
        const isWarmAnchor =
          anchorColor.category === 'white_beige' ||
          anchorColor.category === 'brown_camel';
        const familyPool =
          v % 2 === 0
            ? isWarmAnchor
              ? [...earthAndWarm, ...lightNeutrals]
              : [...coolPalette.filter(c => hexToHsl(c.hex).s < 55), ...allNeutrals]
            : [...earthAndWarm, ...allNeutrals];
        partnerA = pickRandomFrom(familyPool, FASHION_COLORS[4]);
        partnerB = pickRandomFrom(
          familyPool.filter(c => c.id !== partnerA.id),
          FASHION_COLORS[8]
        );
      }

      const shoe = pickRandomFrom(
        shoeClassics.filter(c => c.id !== partnerA.id),
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

  // --- NHÓM 3: NỔI BẬT / TƯƠNG PHẢN ('complementary') — 4 biến thể Bổ túc / Điểm nhấn từ đủ 46 màu ---
  const buildComplementaryCandidates = () => {
    const compOffsets = [150, 175, 205, 130];
    for (let v = 0; v < 4; v++) {
      let popColor: FashionColor;
      if (!isAnchorNeutral) {
        const targetH = (anchorHsl.h + compOffsets[v]) % 360;
        const compPool = STUDIO_FABRIC_CATALOG.filter(
          e =>
            e.color.id !== anchorColor.id &&
            e.fabricGroup !== 'neutral' &&
            hueDistance(e.hsl.h, anchorHsl.h) >= 105
        ).map(e => e.color);

        popColor =
          v % 2 === 0 && compPool.length > 0
            ? pickRandomFrom(compPool, FASHION_COLORS[20])
            : findClosestFashionColor(
                {
                  h: targetH,
                  s: Math.max(30, Math.min(72, anchorHsl.s)),
                  l: isAnchorDark ? 56 : 36,
                },
                [anchorColor.id]
              );
      } else {
        popColor = pickRandomFrom(statementColors, FASHION_COLORS[20]);
      }

      const balancePool = isAnchorDark ? lightNeutrals : darkNeutrals;
      const balance = pickRandomFrom(
        balancePool.filter(c => c.id !== popColor.id),
        FASHION_COLORS[1]
      );
      const shoe = pickRandomFrom(
        shoeClassics.filter(c => c.id !== balance.id),
        FASHION_COLORS[0]
      );

      if (anchorSlotKey === 'shoes') {
        candidatePalettes.push({
          type: 'complementary',
          colors: {
            outerwear: popColor,
            top: pickRandomFrom(lightNeutrals, balance),
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

  if (harmonyMode === 'neutral') {
    buildNeutralCandidates();
  } else if (harmonyMode === 'analogous') {
    buildAnalogousCandidates();
  } else if (harmonyMode === 'complementary') {
    buildComplementaryCandidates();
  } else {
    buildNeutralCandidates();
    buildAnalogousCandidates();
    buildComplementaryCandidates();
  }

  const isDuplicate = (candidate: CandidatePalette) =>
    unlockedSlots.every(key => candidate.colors[key].id === slots[key].color.id);

  let pool = candidatePalettes.filter(p => !isDuplicate(p));

  // Đảm bảo KHÔNG BAO GIỜ rỗng (ngay cả khi người dùng khóa 2–3 món và chỉ còn 1 món mở)
  if (pool.length === 0) {
    const fallbackColors: Record<OutfitSlotId, FashionColor> = {
      outerwear: slots.outerwear.color,
      top: slots.top.color,
      bottom: slots.bottom.color,
      shoes: slots.shoes.color,
    };
    for (const key of unlockedSlots) {
      const curId = slots[key].color.id;
      const modePool =
        harmonyMode === 'neutral'
          ? allNeutrals
          : harmonyMode === 'analogous'
          ? [...earthAndWarm, ...coolPalette, ...allNeutrals]
          : harmonyMode === 'complementary'
          ? [...statementColors, ...allNeutrals]
          : FASHION_COLORS;
      const filtered = modePool.filter(c => c.id !== curId && c.id !== anchorColor.id);
      fallbackColors[key] = pickRandomFrom(
        filtered,
        FASHION_COLORS.find(c => c.id !== curId) || FASHION_COLORS[0]
      );
    }
    pool = [
      {
        type: harmonyMode === 'all' ? 'neutral' : harmonyMode,
        colors: fallbackColors,
      },
    ];
  }

  const chosen = pool[Math.floor(Math.random() * pool.length)];

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
    harmonyType: chosen.type,
  };
  const advice = generateOutfitAdvice(nextState);

  return {
    ...nextState,
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

  const updatedSlots: OutfitSlotsMap = {
    ...currentState.slots,
    [slotId]: {
      ...currentItem,
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
