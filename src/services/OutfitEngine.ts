// src/services/OutfitEngine.ts
/**
 * OutfitEngine - Thuật toán phối màu thời trang theo nguyên tắc 60-30-10
 * 60% Mảng chính (thường là Quần/Váy hoặc Lớp nền)
 * 30% Mảng phụ (thường là Áo)
 * 10% Điểm nhấn (Giày & Phụ kiện)
 */

import { FashionColor, FASHION_COLORS } from '../constants/fashionColors';
import { deltaE2000, hexToRgb, rgbToLab, rgbToHex, RGB } from './ColorEngine';

export interface HSL {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
}

export interface OutfitProportions {
  topPercent: number;
  bottomPercent: number;
  accessoryPercent: number;
}

export interface OutfitSlots {
  top: FashionColor;
  bottom: FashionColor;
  accessory: FashionColor;
}

export type OutfitStyleId = 'neutral' | 'analogous' | 'complementary';

export interface OutfitSuggestion {
  id: OutfitStyleId;
  title: string;
  subtitle: string;
  slots: OutfitSlots;
  proportions: OutfitProportions;
}

// -------------------------------------------------------------
// 1. CÁC HÀM TIỆN ÍCH CHUYỂN ĐỔI HEX <-> HSL <-> RGB
// -------------------------------------------------------------

/**
 * Chuyển đổi HEX sang HSL chuẩn (H: 0..360, S: 0..100, L: 0..100)
 */
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

/**
 * Chuyển đổi HSL sang RGB
 */
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

/**
 * Nhận diện màu trung tính trong thời trang (Đen, Trắng, Xám, Kem, Be, Nâu khói...)
 * Tiêu chí: s < 16 hoặc l < 16 hoặc l > 88 hoặc thuộc nhóm white_beige / gray_black
 */
export function isNeutralColor(hsl: HSL, category?: string): boolean {
  if (hsl.s < 16 || hsl.l < 16 || hsl.l > 88) {
    return true;
  }
  if (category === 'white_beige' || category === 'gray_black') {
    return true;
  }
  return false;
}

/**
 * Tìm màu vải chuẩn gần nhất trong danh sách thời trang bằng CIELAB & Delta E 2000
 * @param targetHsl Tọa độ HSL mục tiêu
 * @param excludeIds Danh sách ID cần loại trừ để tránh lặp màu
 */
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

/**
 * Lấy danh sách màu trung tính từ FASHION_COLORS theo độ sáng ưu tiên
 */
function getNeutralColorOptions(
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

// -------------------------------------------------------------
// 2. BA CÔNG THỨC PHỐI MÀU THỜI TRANG 60-30-10
// -------------------------------------------------------------

/**
 * Công thức 1: Trung tính & Dễ mặc (Casual Chic / Minimalist)
 * Kết hợp baseColor với 2 màu trung tính có độ tương phản sáng-tối rõ rệt
 */
function createNeutralOutfit(
  baseColor: FashionColor,
  baseHsl: HSL,
  baseRole: 'top' | 'bottom'
): OutfitSuggestion {
  const isBaseDark = baseHsl.l < 50;
  const partnerLightPref: 'light' | 'dark' = isBaseDark ? 'light' : 'dark';

  // 1. Chọn màu phối đối lập độ sáng (cho mảng 60% hoặc 30%)
  const partnerCandidates = getNeutralColorOptions(partnerLightPref, [baseColor.id]);

  // Ưu tiên các màu kinh điển theo đề xuất:
  // Nếu base tối -> Trắng Kem (wb-3), Be Cát (wb-5), Xám Khói (gb-6)
  // Nếu base sáng -> Xanh Navy (bn-1 / bn-2), Đen Than (gb-1), Nâu Socola (bc-1), Xám Chì (gb-3)
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

  // 2. Chọn mảng 10% Giày & Phụ kiện: Trắng Tinh (wb-1), Đen Than (gb-1) hoặc Nâu Da Bò (bc-4)
  const excludeForAcc = [baseColor.id, partnerColor.id];
  let accessoryColor: FashionColor | undefined;

  if (isBaseDark) {
    // Tổng thể có màu tối, giày trắng tinh hoặc nâu da tạo điểm sáng sạch sẽ
    accessoryColor = FASHION_COLORS.find(c => c.id === 'wb-1' && !excludeForAcc.includes(c.id));
    if (!accessoryColor) {
      accessoryColor = FASHION_COLORS.find(c => c.id === 'bc-4' && !excludeForAcc.includes(c.id));
    }
  } else {
    // Tổng thể có màu sáng, phụ kiện đen than hoặc nâu bò giúp neo giữ phom dáng
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

/**
 * Công thức 2: Thanh lịch / Tương đồng (Analogous / Monochrome Ton-sur-ton)
 * - Nếu có sắc độ: lệch hue 28 độ + giảm nhẹ độ bão hòa (10-15%)
 * - Nếu màu trung tính: Monochrome đậm nhạt cùng tông
 */
function createAnalogousOutfit(
  baseColor: FashionColor,
  baseHsl: HSL,
  baseRole: 'top' | 'bottom'
): OutfitSuggestion {
  const isNeutral = isNeutralColor(baseHsl, baseColor.category);
  let partnerColor: FashionColor;
  let accessoryColor: FashionColor;

  if (!isNeutral) {
    // Sắc độ lệch h + 28 độ, bão hòa giảm nhẹ 12%
    const targetH = (baseHsl.h + 28) % 360;
    const targetS = Math.max(12, Math.round(baseHsl.s * 0.88));
    const targetL = Math.max(20, Math.min(80, baseHsl.l + (baseHsl.l > 50 ? -8 : 8)));

    partnerColor = findClosestFashionColor(
      { h: targetH, s: targetS, l: targetL },
      [baseColor.id]
    );

    // Mảnh 10% Giày/Phụ kiện: màu trung tính cân bằng sáng/tối
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
    // Phong cách Monochrome: chọn bảng sắc độ Đậm - Nhạt cùng tông
    const isWarm =
      baseColor.category === 'white_beige' ||
      baseColor.category === 'brown_camel' ||
      (baseHsl.h >= 25 && baseHsl.h <= 75);

    // Bảng warm: Trắng Kem -> Be Cát -> Nâu Camel -> Nâu Socola
    // Bảng cool: Trắng Tinh -> Xám Khói -> Xám Chì -> Đen Than
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

/**
 * Công thức 3: Nổi bật / Tương phản (Split-Complementary / Statement Pop)
 * - Nếu có sắc độ: Split-Complementary (h + 155°) + nền trung tính 60%
 * - Nếu màu trung tính: biến base thành nền 60% + 1 màu thời trang nổi bật 30%
 */
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
    // 1. Màu bổ túc lệch Split-Complementary (h + 155°)
    const targetH = (baseHsl.h + 155) % 360;
    const targetS = Math.max(28, Math.min(80, Math.round(baseHsl.s * 0.9)));
    const targetL = Math.max(30, Math.min(68, baseHsl.l));

    const popColor = findClosestFashionColor(
      { h: targetH, s: targetS, l: targetL },
      [baseColor.id]
    );

    // 2. Mảng nền trung tính làm lớp cân bằng 60%
    const isDarkCombo = (baseHsl.l + hexToHsl(popColor.hex).l) / 2 < 50;
    const neutralBasePref: 'light' | 'dark' = isDarkCombo ? 'light' : 'dark';
    const neutralBases = getNeutralColorOptions(neutralBasePref, [baseColor.id, popColor.id]);

    const preferredBaseId = isDarkCombo ? 'wb-5' : 'bn-2'; // Be Cát hoặc Xanh Navy
    const neutralColor =
      neutralBases.find(c => c.id === preferredBaseId) ||
      neutralBases[0] ||
      FASHION_COLORS.find(c => c.id === (isDarkCombo ? 'wb-3' : 'gb-1')) ||
      FASHION_COLORS[0];

    if (baseRole === 'top') {
      // Áo là baseColor, Quần là nền trung tính 60%, Phụ kiện là màu bổ túc 10%
      topColor = baseColor;
      bottomColor = neutralColor;
      accessoryColor = popColor;
    } else {
      // Quần là baseColor (60%), Áo là màu bổ túc (30%), Phụ kiện là trung tính sạch (10%)
      bottomColor = baseColor;
      topColor = popColor;
      accessoryColor = neutralColor;
    }
  } else {
    // BaseColor là màu trung tính:
    // Biến baseColor làm nền trang phục, chọn 1 màu điểm nhấn thời trang ấn tượng (Xanh Olive, Đỏ Đô, Xanh Cổ Vịt, Vàng Mù Tạt)
    const statementColorIds = ['gr-1', 'rp-1', 'gr-3', 'yp-1', 'rp-5', 'bn-4'];
    const popCandidates = FASHION_COLORS.filter(
      c => statementColorIds.includes(c.id) && c.id !== baseColor.id
    );

    // Chọn màu pop có độ tương phản sáng/tối tốt với baseColor
    const popColor =
      popCandidates.find(c => {
        const cL = hexToHsl(c.hex).l;
        return baseHsl.l < 50 ? cL > 45 : cL < 45;
      }) || popCandidates[0] || FASHION_COLORS.find(c => c.id === 'rp-1')!;

    // Phụ kiện 10% là màu trung tính sạch đối chiếu
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

// -------------------------------------------------------------
// 3. HÀM CHÍNH TẠO 3 GỢI Ý OUTFIT 60-30-10
// -------------------------------------------------------------

/**
 * Tạo 3 bộ outfit chuẩn thời trang 60-30-10 từ màu gốc và vị trí món đồ
 * @param baseColor Màu thời trang đã xác định từ khâu hút màu
 * @param baseRole Vai trò của màu: 'top' (Áo) hoặc 'bottom' (Quần/Váy)
 */
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
