// src/engine/MatchCheckerEngine.ts
/**
 * MatchCheckerEngine - Chấm điểm độ hài hòa 2 món đồ có sẵn (0–100)
 * và tìm Top 3 "Màu cầu nối" từ bảng màu vải chuẩn trong fashionColors.ts.
 */

import { FashionColor, FASHION_COLORS } from '../constants/fashionColors';
import {
  evaluateColorForUndertone,
  FabricCatalogEntry,
  getUndertoneLabel,
  hexToHsl,
  HSL,
  isNeutralColor,
  shortColorName,
  STUDIO_FABRIC_CATALOG,
} from './OutfitEngine';
import {
  FabricColorGroup,
  OutfitSlotId,
  SkinUndertone,
  UndertoneFitLevel,
} from '../types/outfit';

interface UndertoneEvaluation {
  score: number;
  level: UndertoneFitLevel;
  note: string;
}

function evaluateFaceUndertone(
  color: FabricColor,
  undertone: SkinUndertone
): UndertoneEvaluation {
  const fit = evaluateColorForUndertone(color, undertone);
  const name = shortColorName(color.name);
  const label = getUndertoneLabel(undertone);

  if (fit === 'flattering') {
    const score = undertone === 'neutral' ? 92 : 94;
    return {
      score,
      level: fit,
      note:
        undertone === 'neutral'
          ? `Sắc ${name} rất hợp ${label}, tạo tổng thể hài hòa và sáng gọn.`
          : `Sắc ${name} rất tôn ${label}, giúp gương mặt rạng rỡ hơn.`,
    };
  }

  if (fit === 'caution') {
    return {
      score: 69,
      level: fit,
      note: `Sắc ${name} hơi kén ${label} khi mặc sát mặt, nên cân bằng thêm bằng tông trung tính dịu.`,
    };
  }

  return {
    score: 84,
    level: fit,
    note: `${name} là gam dễ mặc, dung hòa ổn định với ${label}.`,
  };
}

export type OutfitSlot = OutfitSlotId;
export type FabricColor = FashionColor;

export interface MatchItemInput {
  slot: OutfitSlot;
  color: FabricColor;
}

export interface MatchScoreBreakdown {
  hueScore: number; // Trọng số 40%
  contrastScore: number; // Trọng số 25%
  saturationScore: number; // Trọng số 20%
  undertoneScore: number; // Trọng số 15%
  hasSaturationClash: boolean;
  saturationWarning?: string;
}

export interface BridgeColorSuggestion {
  color: FabricColor;
  tag: string;
  shortTag: string;
  reason: string;
  boostedScore: number;
}

export interface MatchEvaluationResult {
  score: number;
  breakdown: MatchScoreBreakdown;
  grade: string;
  gradeColor: string;
  headline: string;
  details: string[];
  bridgeSlot: OutfitSlot;
  bridgeSuggestions: BridgeColorSuggestion[];
}

interface ColorMeta {
  color: FabricColor;
  name: string;
  hsl: HSL;
  neutral: boolean;
  group: FabricColorGroup;
  temperature: 'warm' | 'cool' | 'neutral';
}

const SLOT_LABELS: Record<OutfitSlot, string> = {
  top: 'Áo',
  outerwear: 'Áo khoác',
  bottom: 'Quần / Váy',
  shoes: 'Giày',
};

export function getMatchSlotLabel(slot: OutfitSlot): string {
  return SLOT_LABELS[slot];
}

export function getBridgeSectionTitle(bridgeSlot: OutfitSlot): string {
  switch (bridgeSlot) {
    case 'shoes':
      return 'Gợi ý màu cầu nối 10% (Giày / Phụ kiện)';
    case 'bottom':
      return 'Gợi ý màu cầu nối (Quần / Váy)';
    case 'top':
      return 'Gợi ý màu cầu nối (Áo)';
    case 'outerwear':
      return 'Gợi ý màu cầu nối (Áo khoác)';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hueDistance(h1: number, h2: number): number {
  const diff = Math.abs(((h1 - h2) % 360 + 360) % 360);
  return diff > 180 ? 360 - diff : diff;
}

function inferTemperature(color: FabricColor, hsl: HSL, group: FabricColorGroup): 'warm' | 'cool' | 'neutral' {
  if (color.category === 'gray_black' || color.id === 'wb-1' || color.id === 'wb-2') {
    return 'neutral';
  }
  if (
    group === 'earth' ||
    group === 'warm' ||
    color.id === 'wb-3' ||
    color.id === 'wb-4' ||
    color.id === 'wb-5' ||
    color.id === 'wb-6' ||
    color.id === 'rp-3' ||
    color.id === 'rp-4' ||
    color.id === 'rp-5' ||
    color.id === 'rp-6'
  ) {
    return 'warm';
  }
  if (group === 'cool' || color.category === 'blue_navy' || color.category === 'green') {
    return 'cool';
  }
  if (hsl.h >= 180 && hsl.h <= 315) return 'cool';
  if (hsl.h <= 65 || hsl.h >= 340) return 'warm';
  return 'neutral';
}

function getColorMeta(color: FabricColor): ColorMeta {
  const entry: FabricCatalogEntry | undefined = STUDIO_FABRIC_CATALOG.find(
    e => e.color.id === color.id
  );
  const hsl = entry ? entry.hsl : hexToHsl(color.hex);
  const group: FabricColorGroup = entry
    ? entry.fabricGroup
    : isNeutralColor(hsl, color.category)
    ? 'neutral'
    : 'accent';
  const neutral = group === 'neutral' || isNeutralColor(hsl, color.category);
  return {
    color,
    name: shortColorName(color.name),
    hsl,
    neutral,
    group,
    temperature: inferTemperature(color, hsl, group),
  };
}

// =============================================================
// 1. CHẤM ĐIỂM 4 TIÊU CHÍ (HUE / CONTRAST / SATURATION / UNDERTONE)
// =============================================================

interface PairScoreInternal {
  hueScore: number;
  huePattern:
    | 'neutral_pair'
    | 'earth_pair'
    | 'monochrome'
    | 'analogous'
    | 'complementary'
    | 'clash'
    | 'moderate';
  contrastScore: number;
  contrastPattern: 'ideal' | 'all_dark' | 'all_light' | 'high_crisp' | 'flat' | 'mild';
  saturationScore: number;
  hasSaturationClash: boolean;
  saturationWarning?: string;
}

function scoreColorPair(m1: ColorMeta, m2: ColorMeta): PairScoreInternal {
  const hDiff = hueDistance(m1.hsl.h, m2.hsl.h);
  const lightDiff = Math.abs(m1.hsl.l - m2.hsl.l);

  // --- A. Hòa hợp sắc độ (40%) ---
  let hueScore = 76;
  let huePattern: PairScoreInternal['huePattern'] = 'moderate';

  if (m1.neutral || m2.neutral) {
    huePattern = 'neutral_pair';
    if (m1.neutral && m2.neutral) {
      // Hai màu trung tính: cùng nhiệt độ hoặc tách sáng tối tốt đạt rất cao
      const sameTemp =
        m1.temperature === m2.temperature ||
        m1.temperature === 'neutral' ||
        m2.temperature === 'neutral';
      hueScore = sameTemp ? 95 : 90;
    } else {
      const sameTemp =
        m1.temperature === m2.temperature ||
        m1.temperature === 'neutral' ||
        m2.temperature === 'neutral';
      hueScore = sameTemp ? 94 : 89;
    }
    hueScore = clamp(hueScore, 88, 96);
  } else if (m1.group === 'earth' && m2.group === 'earth') {
    huePattern = 'earth_pair';
    hueScore = clamp(Math.round(93 - Math.min(6, hDiff * 0.05)), 86, 94);
  } else if (hDiff <= 20 && lightDiff >= 16) {
    huePattern = 'monochrome';
    hueScore = clamp(Math.round(92 - hDiff * 0.2), 86, 94);
  } else if (hDiff <= 35) {
    huePattern = 'analogous';
    hueScore = clamp(Math.round(90 - hDiff * 0.2), 82, 92);
  } else if (hDiff >= 145 && hDiff <= 180) {
    huePattern = 'complementary';
    // Bổ túc / bổ túc tách đẹp nhất khi không cùng lúc quá chói
    const bothVeryVivid = m1.hsl.s >= 65 && m2.hsl.s >= 65;
    hueScore = bothVeryVivid ? 83 : 90;
  } else if (m1.hsl.s > 45 && m2.hsl.s > 45 && hDiff >= 55 && hDiff <= 125) {
    huePattern = 'clash';
    // Vùng lệch sắc độ khó chịu quanh 90° khi cả 2 đều đậm sắc
    const closenessTo90 = 1 - Math.abs(hDiff - 90) / 35; // 0..1
    const satFactor = ((m1.hsl.s + m2.hsl.s) / 2 - 45) / 55; // 0..1
    const raw = 60 - closenessTo90 * 10 - satFactor * 6;
    hueScore = clamp(Math.round(raw), 45, 62);
  } else {
    huePattern = 'moderate';
    // Các cặp dịu (ít nhất 1 màu trầm/dịu) ở góc trung gian
    const avgSat = (m1.hsl.s + m2.hsl.s) / 2;
    hueScore = clamp(Math.round(80 - Math.max(0, avgSat - 35) * 0.22), 68, 82);
  }

  // --- B. Tương phản sáng - tối (25%) ---
  let contrastScore = 80;
  let contrastPattern: PairScoreInternal['contrastPattern'] = 'mild';

  if (m1.hsl.l < 25 && m2.hsl.l < 25) {
    // Ngoại lệ thông minh: phối toàn tối sang trọng (All-dark)
    contrastPattern = 'all_dark';
    contrastScore = lightDiff >= 6 ? 89 : 86;
  } else if (m1.hsl.l > 82 && m2.hsl.l > 82) {
    // Ngoại lệ thông minh: phối toàn sáng sạch mắt (All-light)
    contrastPattern = 'all_light';
    contrastScore = lightDiff >= 4 ? 89 : 85;
  } else if (lightDiff >= 22 && lightDiff <= 65) {
    // Tách mảng gọn mắt lý tưởng
    contrastPattern = 'ideal';
    const distFromOptimum = Math.abs(lightDiff - 44);
    contrastScore = clamp(Math.round(97 - distFromOptimum * 0.35), 88, 98);
  } else if (lightDiff > 65) {
    // Tương phản mạnh kinh điển (VD: Đen + Trắng)
    contrastPattern = 'high_crisp';
    contrastScore = m1.neutral || m2.neutral ? 91 : 85;
  } else if (lightDiff < 12) {
    // Trùng độ sáng ở dải trung bình -> phẳng, thiếu tách lớp
    contrastPattern = 'flat';
    contrastScore = clamp(Math.round(56 + lightDiff * 1.0), 55, 68);
  } else {
    // 12..21: tách lớp nhẹ
    contrastPattern = 'mild';
    contrastScore = clamp(Math.round(72 + (lightDiff - 12) * 1.3), 72, 84);
  }

  // --- C. Cân bằng độ chói (20%) ---
  let saturationScore = 82;
  let hasSaturationClash = false;
  let saturationWarning: string | undefined;

  if (!m1.neutral && !m2.neutral && m1.hsl.s >= 52 && m2.hsl.s >= 52) {
    // Cả 2 món đều bão hòa cao -> cạnh tranh thị giác
    hasSaturationClash = true;
    saturationWarning = 'Hai màu đang có độ chói ngang nhau, dễ gây rối mắt';
    const avgSat = (m1.hsl.s + m2.hsl.s) / 2;
    const raw = 58 - ((avgSat - 52) / 48) * 16;
    saturationScore = clamp(Math.round(raw), 42, 58);
  } else if (m1.neutral || m2.neutral || m1.hsl.s <= 35 || m2.hsl.s <= 35) {
    // Có ít nhất 1 món dịu/trầm hoặc trung tính làm nền
    const maxS = Math.max(m1.neutral ? 0 : m1.hsl.s, m2.neutral ? 0 : m2.hsl.s);
    saturationScore = clamp(Math.round(96 - Math.max(0, maxS - 55) * 0.16), 88, 96);
  } else {
    const avgSat = (m1.hsl.s + m2.hsl.s) / 2;
    saturationScore = clamp(Math.round(86 - Math.max(0, avgSat - 36) * 0.5), 76, 86);
  }

  return {
    hueScore,
    huePattern,
    contrastScore,
    contrastPattern,
    saturationScore,
    hasSaturationClash,
    saturationWarning,
  };
}

// =============================================================
// 2. XÁC ĐỊNH MÓN CẦU NỐI & PHÂN HẠNG
// =============================================================

export function determineBridgeSlot(slot1: OutfitSlot, slot2: OutfitSlot): OutfitSlot {
  const pair = new Set<OutfitSlot>([slot1, slot2]);

  if (pair.has('top') && pair.has('bottom')) return 'shoes';
  if (pair.has('outerwear') && pair.has('bottom')) return 'shoes';
  if (pair.has('top') && pair.has('shoes')) return 'bottom';
  if (pair.has('bottom') && pair.has('shoes')) return 'top';
  if (pair.has('outerwear') && pair.has('top')) return 'bottom';
  if (pair.has('outerwear') && pair.has('shoes')) return 'bottom';

  return 'shoes';
}

function getGradeMeta(score: number): { grade: string; gradeColor: string } {
  if (score >= 88) {
    return { grade: 'Phối cực chuẩn', gradeColor: '#15803D' };
  }
  if (score >= 75) {
    return { grade: 'Rất hài hòa', gradeColor: '#0F766E' };
  }
  if (score >= 60) {
    return { grade: 'Khá ổn, dễ mặc', gradeColor: '#B45309' };
  }
  return { grade: 'Cần màu cầu nối', gradeColor: '#B91C1C' };
}

// =============================================================
// 3. TÍNH ĐIỂM BỘ 3 MÓN (BOOSTED SCORE) & CHỌN TOP 3 MÀU CẦU NỐI
// =============================================================

function computeThreeItemScore(
  m1: ColorMeta,
  m2: ColorMeta,
  bridge: ColorMeta,
  baseScore: number,
  basePair: PairScoreInternal,
  bridgeSlot: OutfitSlot,
  undertone: SkinUndertone,
  baseUndertoneScore: number
): number {
  const p1 = scoreColorPair(m1, bridge);
  const p2 = scoreColorPair(m2, bridge);

  const bridgeHueAvg = (p1.hueScore + p2.hueScore) * 0.5;
  const bridgeContrastAvg = (p1.contrastScore + p2.contrastScore) * 0.5;
  const bridgeSatAvg = (p1.saturationScore + p2.saturationScore) * 0.5;

  // Hiệu quả bù trừ thực tế của màu cầu nối lên toàn bộ set 3 món:
  // 1) Hạ nhiệt nếu 2 món gốc đang chói ngang nhau
  let calmingBonus = 0;
  if (basePair.hasSaturationClash && (bridge.neutral || bridge.hsl.s <= 30)) {
    calmingBonus = 9;
  } else if (basePair.huePattern === 'clash' && bridge.neutral) {
    calmingBonus = 8;
  }

  // 2) Tách độ sáng nếu 2 món gốc đang bị phẳng sáng-tối
  const avgL = (m1.hsl.l + m2.hsl.l) * 0.5;
  const bridgeLightSpread = Math.abs(bridge.hsl.l - avgL);
  let lightBalanceBonus = 0;
  if (basePair.contrastPattern === 'flat' && bridgeLightSpread >= 24) {
    lightBalanceBonus = 7;
  } else if (bridgeLightSpread >= 18) {
    lightBalanceBonus = 3;
  }

  // 3) Nếu món cầu nối nằm sát mặt (top/outerwear), cộng hưởng điểm tông da
  const effectiveUndertone =
    bridgeSlot === 'top' || bridgeSlot === 'outerwear'
      ? Math.round(
          baseUndertoneScore * 0.4 +
            evaluateFaceUndertone(bridge.color, undertone).score * 0.6
        )
      : baseUndertoneScore;

  const bridgeComposite =
    bridgeHueAvg * 0.4 +
    bridgeContrastAvg * 0.25 +
    bridgeSatAvg * 0.2 +
    effectiveUndertone * 0.15;

  // Tổng hợp bộ 3 món: giữ 58% nền cặp 2 món gốc + 42% độ liên kết của món cầu nối + bonus giải cứu
  const combined = Math.round(
    baseScore * 0.58 + bridgeComposite * 0.42 + calmingBonus + lightBalanceBonus
  );

  return clamp(combined, 50, 99);
}

const ACCENT_CANDIDATE_IDS = new Set([
  'rp-1', // Đỏ Đô
  'rp-2', // Đỏ Rượu Vang
  'bn-2', // Xanh Navy Cổ Điển
  'bn-1', // Xanh Navy Đậm
  'bc-3', // Nâu Camel
  'bc-4', // Nâu Bò
  'gr-1', // Xanh Olive
  'gr-3', // Xanh Cổ Vịt
  'gr-4', // Xanh Cổ Vịt Đậm
  'rp-4', // Đỏ Đất
  'yp-4', // Tím Mận
]);

function selectBridgeSuggestions(
  m1: ColorMeta,
  m2: ColorMeta,
  baseScore: number,
  basePair: PairScoreInternal,
  bridgeSlot: OutfitSlot,
  undertone: SkinUndertone,
  baseUndertoneScore: number
): BridgeColorSuggestion[] {
  const excludedIds = new Set<string>([m1.color.id, m2.color.id]);
  const avgL = (m1.hsl.l + m2.hsl.l) * 0.5;
  const bothDark = m1.hsl.l < 38 && m2.hsl.l < 38;
  const bothLight = m1.hsl.l > 68 && m2.hsl.l > 68;
  const warmCount =
    (m1.temperature === 'warm' ? 1 : 0) + (m2.temperature === 'warm' ? 1 : 0);
  const coolCount =
    (m1.temperature === 'cool' ? 1 : 0) + (m2.temperature === 'cool' ? 1 : 0);
  const dominantTemp: 'warm' | 'cool' | 'neutral' =
    warmCount > coolCount ? 'warm' : coolCount > warmCount ? 'cool' : 'neutral';

  const allMetas = FASHION_COLORS.filter(c => !excludedIds.has(c.id)).map(getColorMeta);
  const slotNoun =
    bridgeSlot === 'shoes'
      ? 'giày'
      : bridgeSlot === 'bottom'
      ? 'quần/váy'
      : bridgeSlot === 'top'
      ? 'áo'
      : 'áo khoác';

  // --- PHƯƠNG ÁN 1: "An toàn • Sạch mắt" (Trung tính đối trọng sáng/tối) ---
  const safePool = allMetas.filter(c => c.neutral);
  const scoredSafe = safePool
    .map(cand => {
      const boosted = computeThreeItemScore(
        m1,
        m2,
        cand,
        baseScore,
        basePair,
        bridgeSlot,
        undertone,
        baseUndertoneScore
      );
      let fit = boosted;
      if (bothDark) {
        // 2 món tối -> ưu tiên Trắng Tinh / Trắng Kem / Trắng Sữa
        fit += cand.hsl.l >= 85 ? 18 : cand.hsl.l >= 65 ? 8 : -12;
        if (dominantTemp === 'warm' && (cand.color.id === 'wb-3' || cand.color.id === 'wb-4')) {
          fit += 5;
        }
        if (dominantTemp !== 'warm' && (cand.color.id === 'wb-1' || cand.color.id === 'wb-2')) {
          fit += 5;
        }
      } else if (bothLight) {
        // 2 món sáng -> ưu tiên Đen Than / Xám Chì / Nâu Cà Phê
        fit += cand.hsl.l <= 25 ? 18 : cand.hsl.l <= 45 ? 10 : -12;
      } else {
        // 1 sáng 1 tối -> ưu tiên trắng sạch hoặc đen than cân gọn
        const isCleanAnchor =
          cand.color.id === 'wb-1' ||
          cand.color.id === 'wb-3' ||
          cand.color.id === 'gb-1' ||
          cand.color.id === 'wb-5';
        fit += isCleanAnchor ? 12 : 4;
        // Tạo độ tách sáng rõ so với trung bình
        fit += Math.min(8, Math.abs(cand.hsl.l - avgL) * 0.18);
      }
      return { cand, boosted, fit };
    })
    .sort((a, b) => b.fit - a.fit);

  const pick1 = scoredSafe[0] || {
    cand: allMetas[0],
    boosted: clamp(baseScore + 4, 65, 96),
    fit: 0,
  };
  const usedIds = new Set<string>([pick1.cand.color.id]);

  // --- PHƯƠNG ÁN 2: "Trầm gọn • Dễ phối" (Trung tính trầm hoặc tông đất dịu mắt) ---
  const calmPool = allMetas.filter(
    c =>
      !usedIds.has(c.color.id) &&
      ((c.neutral && c.hsl.l <= 62) ||
        (c.group === 'earth' && c.hsl.s <= 45) ||
        c.color.id === 'bn-1' ||
        c.color.id === 'bn-2')
  );
  const scoredCalm = (calmPool.length > 0 ? calmPool : allMetas.filter(c => !usedIds.has(c.color.id)))
    .map(cand => {
      const boosted = computeThreeItemScore(
        m1,
        m2,
        cand,
        baseScore,
        basePair,
        bridgeSlot,
        undertone,
        baseUndertoneScore
      );
      let fit = boosted;
      // Đặc biệt ưu tiên trung tính trầm / nâu cà phê / xám chì khi 2 món đang chói
      if (basePair.hasSaturationClash) {
        fit += cand.neutral && cand.hsl.l <= 42 ? 16 : cand.hsl.s <= 28 ? 10 : 0;
      } else if (dominantTemp === 'warm') {
        fit += cand.group === 'earth' || cand.color.category === 'brown_camel' ? 12 : 4;
      } else {
        fit +=
          cand.color.id === 'gb-3' ||
          cand.color.id === 'gb-1' ||
          cand.color.id === 'bc-2' ||
          cand.color.id === 'bc-5' ||
          cand.color.id === 'bn-2'
            ? 12
            : 4;
      }
      // Tránh quá giống độ sáng với phương án 1 để 3 gợi ý thực sự đa dạng
      if (Math.abs(cand.hsl.l - pick1.cand.hsl.l) >= 18) {
        fit += 6;
      }
      return { cand, boosted, fit };
    })
    .sort((a, b) => b.fit - a.fit);

  const pick2 = scoredCalm[0] || {
    cand: allMetas.find(c => !usedIds.has(c.color.id)) || allMetas[1],
    boosted: clamp(baseScore + 3, 64, 95),
    fit: 0,
  };
  usedIds.add(pick2.cand.color.id);

  // --- PHƯƠNG ÁN 3: "Nâng tầm • Điểm nhấn" (Đồng điệu nhiệt màu hoặc điểm nhấn 10% tinh tế) ---
  const accentPool = allMetas.filter(
    c => !usedIds.has(c.color.id) && (ACCENT_CANDIDATE_IDS.has(c.color.id) || !c.neutral)
  );
  const scoredAccent = (
    accentPool.length > 0 ? accentPool : allMetas.filter(c => !usedIds.has(c.color.id))
  )
    .map(cand => {
      const boosted = computeThreeItemScore(
        m1,
        m2,
        cand,
        baseScore,
        basePair,
        bridgeSlot,
        undertone,
        baseUndertoneScore
      );
      let fit = boosted;
      if (ACCENT_CANDIDATE_IDS.has(cand.color.id)) {
        fit += 12;
      }
      if (
        dominantTemp !== 'neutral' &&
        cand.temperature === dominantTemp
      ) {
        fit += 7;
      }
      // Ưu tiên điểm nhấn thực sự giữ hoặc nâng điểm tổng thể của bộ 3 món
      if (boosted >= baseScore) {
        fit += 8;
      }
      // Nếu 2 món gốc đã có màu chói -> chọn điểm nhấn trầm sang (Đỏ Đô, Navy, Nâu Bò/Camel)
      if (basePair.hasSaturationClash && cand.hsl.l <= 45) {
        fit += 8;
      }
      // Nếu cả 2 món gốc là trung tính -> điểm nhấn 10% như Đỏ Đô, Xanh Olive, Nâu Camel cực đắt giá
      if (m1.neutral && m2.neutral && !cand.neutral) {
        fit += 10;
      }
      return { cand, boosted, fit };
    })
    .sort((a, b) => b.fit - a.fit);

  const pick3 = scoredAccent[0] || {
    cand: allMetas.find(c => !usedIds.has(c.color.id)) || allMetas[2],
    boosted: clamp(baseScore + 2, 62, 94),
    fit: 0,
  };

  // Diễn giải tự nhiên lý do chọn từng màu cầu nối
  const reason1 = bothDark
    ? `Thêm ${slotNoun} ${pick1.cand.name} giúp bật sáng tổng thể, phá vỡ cảm giác nặng nề của hai mảng tối.`
    : bothLight
    ? `Thêm ${slotNoun} ${pick1.cand.name} tạo điểm neo vững chắc, giúp bộ đồ sáng màu gọn mắt và có chiều sâu hơn.`
    : `Gam trung tính ${pick1.cand.name} giữ khoảng nghỉ sạch mắt, liên kết mượt ${m1.name} và ${m2.name}.`;

  const reason2 = basePair.hasSaturationClash
    ? `Sắc trầm ${pick2.cand.name} hạ nhiệt độ chói của cặp màu gốc, giúp tổng thể êm mắt và dễ ứng dụng hơn.`
    : `Sắc ${pick2.cand.name} trầm gọn, dễ phối hằng ngày và giữ nhịp chuyển tông tự nhiên cho cả bộ đồ.`;

  const reason3 =
    m1.neutral && m2.neutral
      ? `Nền trung tính sạch sẽ giúp ${slotNoun} ${pick3.cand.name} trở thành điểm nhấn 10% tinh tế, đắt giá.`
      : `Sắc ${pick3.cand.name} đồng điệu sắc độ tổng thể, nâng tầm gu ăn mặc mà không gây rối mắt.`;

  return [
    {
      color: pick1.cand.color,
      tag: 'An toàn • Sạch mắt',
      shortTag: 'Sạch mắt',
      reason: reason1,
      boostedScore: pick1.boosted,
    },
    {
      color: pick2.cand.color,
      tag: 'Trầm gọn • Dễ phối',
      shortTag: 'Trầm gọn',
      reason: reason2,
      boostedScore: pick2.boosted,
    },
    {
      color: pick3.cand.color,
      tag: 'Nâng tầm • Điểm nhấn',
      shortTag: 'Điểm nhấn',
      reason: reason3,
      boostedScore: pick3.boosted,
    },
  ];
}

// =============================================================
// 4. SINH NHẬN XÉT TIẾNG VIỆT TỰ NHIÊN (HEADLINE + DETAILS)
// =============================================================

function buildEditorialFeedback(
  item1: MatchItemInput,
  item2: MatchItemInput,
  m1: ColorMeta,
  m2: ColorMeta,
  pair: PairScoreInternal,
  bridgeSlot: OutfitSlot,
  undertone: SkinUndertone,
  faceEval: { slot: OutfitSlot; evalResult: UndertoneEvaluation } | null
): { headline: string; details: string[] } {
  const bridgeNoun =
    bridgeSlot === 'shoes'
      ? 'giày trung tính'
      : bridgeSlot === 'bottom'
      ? 'quần/váy trung tính'
      : 'áo trung tính';

  // Headline 1 câu ngắn gọn đánh giá trực diện
  let headline = '';
  if (pair.hasSaturationClash) {
    headline = `Hai màu đang có độ chói ngang nhau, nên thêm ${bridgeNoun} để hạ nhiệt.`;
  } else if (pair.huePattern === 'clash') {
    headline = `${m1.name} và ${m2.name} hơi lệch sắc độ, cần một món trung tính làm cầu nối cân bằng.`;
  } else if (pair.contrastPattern === 'flat') {
    headline = `${m1.name} và ${m2.name} đang khá ngang độ sáng, thêm điểm nhấn sáng/tối sẽ gọn mắt hơn.`;
  } else if (pair.contrastPattern === 'all_dark') {
    headline = `Phối toàn tối giữa ${m1.name} và ${m2.name} tạo vẻ sang trọng, thêm điểm sáng nhẹ sẽ rất cuốn.`;
  } else if (pair.contrastPattern === 'all_light') {
    headline = `Cặp tông sáng ${m1.name} – ${m2.name} mang lại cảm giác thanh sạch, nhẹ nhàng và tinh tế.`;
  } else if (pair.huePattern === 'earth_pair') {
    headline = `Hai tông đất ấm có độ chênh sáng tối rõ ràng, mặc cùng rất gọn mắt và hiện đại.`;
  } else if (pair.huePattern === 'neutral_pair') {
    headline = `${m1.name} và ${m2.name} tạo độ tách mảng sạch sẽ, cực kỳ dễ mặc trong nhiều dịp.`;
  } else if (pair.huePattern === 'monochrome' || pair.huePattern === 'analogous') {
    headline = `Chuyển tông liền mạch giữa ${m1.name} và ${m2.name}, tạo tổng thể thanh lịch, có chiều sâu.`;
  } else if (pair.huePattern === 'complementary') {
    headline = `Cặp bổ túc ${m1.name} và ${m2.name} tạo sức hút nổi bật, chốt gọn bằng phụ kiện dịu là chuẩn.`;
  } else {
    headline = `${m1.name} kết hợp cùng ${m2.name} khá ổn, thêm màu cầu nối phù hợp sẽ nâng điểm ngay.`;
  }

  const details: string[] = [];

  // Gạch đầu dòng 1: Điểm cộng nổi bật
  if (pair.huePattern === 'neutral_pair') {
    details.push(
      `Điểm cộng: Có gam trung tính làm nền giúp ${m1.name} và ${m2.name} tách mảng rõ ràng, không kén bối cảnh.`
    );
  } else if (pair.huePattern === 'earth_pair') {
    details.push(
      `Điểm cộng: Cùng nhóm màu Đất tự nhiên giúp ${m1.name} và ${m2.name} ăn rơ ấm áp, sang mắt.`
    );
  } else if (pair.huePattern === 'monochrome' || pair.huePattern === 'analogous') {
    details.push(
      `Điểm cộng: Hai sắc độ nằm gần nhau trên vòng màu tạo hiệu ứng ton-sur-ton mượt mà.`
    );
  } else if (pair.huePattern === 'complementary') {
    details.push(
      `Điểm cộng: Độ tương phản sắc độ bổ túc giúp bộ đồ nổi bật và cá tính hơn.`
    );
  } else if (pair.contrastScore >= 85) {
    details.push(
      `Điểm cộng: Độ chênh sáng - tối rõ ràng giúp phân tách phom dáng giữa ${getMatchSlotLabel(item1.slot).toLowerCase()} và ${getMatchSlotLabel(item2.slot).toLowerCase()}.`
    );
  } else {
    details.push(
      `Điểm cộng: ${m1.name} và ${m2.name} vẫn có thể dung hòa tốt khi có mảng trung tính làm điểm tựa.`
    );
  }

  // Gạch đầu dòng 2: Điểm cần chú ý
  if (pair.hasSaturationClash) {
    details.push(
      `Lưu ý: Hai màu đang có độ chói ngang nhau, dễ gây rối mắt — nên chọn ${bridgeNoun} trầm/sáng để giảm tải thị giác.`
    );
  } else if (pair.huePattern === 'clash') {
    details.push(
      `Lưu ý: Sắc độ hai món hơi đối chọi ở dải màu đậm, ưu tiên dùng màu cầu nối trung tính để gắn kết.`
    );
  } else if (pair.contrastPattern === 'flat') {
    details.push(
      `Lưu ý: Hai món có độ sáng gần ngang nhau khiến tổng thể hơi phẳng; thêm ${bridgeNoun} chênh sáng sẽ sắc nét hơn.`
    );
  } else if (pair.contrastPattern === 'all_dark') {
    details.push(
      `Gợi ý nhỏ: Set đồ toàn tối rất gọn dáng, bạn có thể nhấn thêm ${bridgeSlot === 'shoes' ? 'giày sáng màu' : 'chi tiết sáng màu'} để tạo điểm thở.`
    );
  } else {
    details.push(
      `Cân bằng tốt: Độ chói và sáng - tối đều dễ chịu, bạn chỉ cần chọn ${getMatchSlotLabel(bridgeSlot).toLowerCase()} phù hợp bên dưới để hoàn thiện set đồ.`
    );
  }

  // Gạch đầu dòng 3: Nhận xét tông da (nếu có Áo hoặc Áo khoác)
  if (faceEval) {
    const faceSlotName = faceEval.slot === 'outerwear' ? 'Áo khoác' : 'Áo';
    details.push(
      `Tông da (${getUndertoneLabel(undertone)}): ${faceSlotName} sát khuôn mặt — ${faceEval.evalResult.note}`
    );
  }

  return { headline, details };
}

// =============================================================
// 5. HÀM CHÍNH: evaluateTwoItemMatch
// =============================================================

export function evaluateTwoItemMatch(
  item1: MatchItemInput,
  item2: MatchItemInput,
  undertone: SkinUndertone = 'neutral'
): MatchEvaluationResult {
  const m1 = getColorMeta(item1.color);
  const m2 = getColorMeta(item2.color);

  const pair = scoreColorPair(m1, m2);

  // Đánh giá tông da cho món nằm sát khuôn mặt (ưu tiên 'top', sau đó 'outerwear')
  let faceEval: { slot: OutfitSlot; evalResult: UndertoneEvaluation } | null = null;
  let undertoneScore = 88; // Mặc định 88 nếu so Quần + Giày

  const topItem =
    item1.slot === 'top' ? item1 : item2.slot === 'top' ? item2 : null;
  const outerItem =
    item1.slot === 'outerwear'
      ? item1
      : item2.slot === 'outerwear'
      ? item2
      : null;

  if (topItem && outerItem) {
    const topEval = evaluateFaceUndertone(topItem.color, undertone);
    const outerEval = evaluateFaceUndertone(outerItem.color, undertone);
    undertoneScore = Math.round(topEval.score * 0.65 + outerEval.score * 0.35);
    faceEval = { slot: 'top', evalResult: topEval };
  } else if (topItem) {
    const topEval = evaluateFaceUndertone(topItem.color, undertone);
    undertoneScore = topEval.score;
    faceEval = { slot: 'top', evalResult: topEval };
  } else if (outerItem) {
    const outerEval = evaluateFaceUndertone(outerItem.color, undertone);
    undertoneScore = outerEval.score;
    faceEval = { slot: 'outerwear', evalResult: outerEval };
  }

  const totalScore = clamp(
    Math.round(
      pair.hueScore * 0.4 +
        pair.contrastScore * 0.25 +
        pair.saturationScore * 0.2 +
        undertoneScore * 0.15
    ),
    0,
    100
  );

  const { grade, gradeColor } = getGradeMeta(totalScore);
  const bridgeSlot = determineBridgeSlot(item1.slot, item2.slot);

  const { headline, details } = buildEditorialFeedback(
    item1,
    item2,
    m1,
    m2,
    pair,
    bridgeSlot,
    undertone,
    faceEval
  );

  const bridgeSuggestions = selectBridgeSuggestions(
    m1,
    m2,
    totalScore,
    pair,
    bridgeSlot,
    undertone,
    undertoneScore
  );

  return {
    score: totalScore,
    breakdown: {
      hueScore: pair.hueScore,
      contrastScore: pair.contrastScore,
      saturationScore: pair.saturationScore,
      undertoneScore,
      hasSaturationClash: pair.hasSaturationClash,
      saturationWarning: pair.saturationWarning,
    },
    grade,
    gradeColor,
    headline,
    details,
    bridgeSlot,
    bridgeSuggestions,
  };
}
