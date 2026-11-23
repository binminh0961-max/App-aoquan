// src/services/userPreferences.ts
/**
 * Lưu trữ và đánh giá Tông da (Skin Undertone) người dùng.
 * Thuần TypeScript (không thêm thư viện native để giữ nguyên .apk Dev Client hiện tại).
 */

import { FashionColor } from '../constants/fashionColors';
import { hexToHsl, isNeutralColor, shortColorName } from '../engine/OutfitEngine';

export type SkinUndertone = 'warm' | 'cool' | 'neutral';

export interface SkinUndertoneOption {
  id: SkinUndertone;
  label: string;
  shortLabel: string;
  description: string;
}

export interface UndertoneEvaluation {
  score: number; // 0..100
  level: 'ideal' | 'good' | 'neutral' | 'caution';
  note: string;
}

export const SKIN_UNDERTONE_OPTIONS: SkinUndertoneOption[] = [
  {
    id: 'warm',
    label: 'Da tông ấm',
    shortLabel: 'Ấm',
    description: 'Ánh vàng / mật ong, rất hợp đất ấm, kem, olive và nâu camel.',
  },
  {
    id: 'neutral',
    label: 'Da trung tính',
    shortLabel: 'Trung tính',
    description: 'Cân bằng giữa ấm và lạnh, mặc đẹp hầu hết các sắc độ vải.',
  },
  {
    id: 'cool',
    label: 'Da tông lạnh',
    shortLabel: 'Lạnh',
    description: 'Ánh hồng / sáng lạnh, nổi bật với trắng tinh, navy, xám và tím mận.',
  },
];

const STORAGE_KEY = 'app_aoquan_user_undertone_v1';

// Bộ nhớ trong phiên làm việc (giữ đồng bộ xuyên suốt các màn hình không cần native storage mới)
let cachedUndertone: SkinUndertone = 'neutral';

function getWebStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | null {
  try {
    const g = globalThis as unknown as {
      localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void };
    };
    if (g && g.localStorage && typeof g.localStorage.getItem === 'function') {
      return g.localStorage;
    }
  } catch {
    // Bỏ qua trên môi trường không có localStorage
  }
  return null;
}

export function getCachedUserUndertone(): SkinUndertone {
  return cachedUndertone;
}

export async function loadUserUndertone(): Promise<SkinUndertone> {
  try {
    const storage = getWebStorage();
    if (storage) {
      const saved = storage.getItem(STORAGE_KEY);
      if (saved === 'warm' || saved === 'cool' || saved === 'neutral') {
        cachedUndertone = saved;
      }
    }
  } catch {
    // Fallback an toàn về giá trị cached
  }
  return cachedUndertone;
}

export async function saveUserUndertone(undertone: SkinUndertone): Promise<void> {
  cachedUndertone = undertone;
  try {
    const storage = getWebStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY, undertone);
    }
  } catch {
    // Không làm gián đoạn trải nghiệm nếu storage không khả dụng
  }
}

export function getUndertoneLabel(undertone: SkinUndertone): string {
  return SKIN_UNDERTONE_OPTIONS.find(opt => opt.id === undertone)?.label || 'Da trung tính';
}

export function getUndertoneShortLabel(undertone: SkinUndertone): string {
  return SKIN_UNDERTONE_OPTIONS.find(opt => opt.id === undertone)?.shortLabel || 'Trung tính';
}

// Phân loại nhiệt độ màu cho bảng 46 màu vải chuẩn
const WARM_FAVORED_IDS = new Set([
  'wb-3', // Trắng Kem
  'wb-4', // Ngà Voi
  'wb-5', // Be Cát
  'wb-6', // Be Sáng
  'gr-1', // Xanh Olive
  'gr-2', // Xanh Rêu
  'gr-5', // Xanh Bơ
  'rp-1', // Đỏ Đô
  'rp-2', // Đỏ Rượu Vang
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

const COOL_FAVORED_IDS = new Set([
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
  'rp-7', // Hồng Pastel
  'rp-8', // Hồng Đất
  'rp-9', // Hồng Cánh Sen
  'yp-3', // Tím Lavender
  'yp-4', // Tím Mận
  'yp-5', // Tím Pastel
]);

const WARM_CAUTION_FOR_COOL_IDS = new Set([
  'yp-1', // Vàng Mù Tạt
  'yp-2', // Vàng Bơ
  'rp-5', // Cam Đất
  'rp-6', // Cam Cháy
  'rp-4', // Đỏ Đất
  'bc-3', // Nâu Camel
  'bc-4', // Nâu Bò
  'bc-6', // Nâu Hạt Dẻ
  'gr-1', // Xanh Olive
  'gr-2', // Xanh Rêu
  'wb-5', // Be Cát
  'wb-6', // Be Sáng
]);

const COOL_CAUTION_FOR_WARM_IDS = new Set([
  'bn-5', // Xanh Coban
  'bn-6', // Xanh Lam Nhạt
  'bn-7', // Xanh Baby Pastel
  'gb-5', // Xám Bạc
  'gb-6', // Xám Khói
  'gr-6', // Xanh Mint
  'rp-7', // Hồng Pastel
  'rp-9', // Hồng Cánh Sen
  'yp-3', // Tím Lavender
  'yp-5', // Tím Pastel
]);

/**
 * Đánh giá độ tôn da của một màu vải nằm sát khuôn mặt (Áo / Áo khoác)
 * dựa trên SkinUndertone đã lưu.
 */
export function evaluateColorForUndertone(
  color: FashionColor,
  undertone: SkinUndertone
): UndertoneEvaluation {
  const hsl = hexToHsl(color.hex);
  const neutral = isNeutralColor(hsl, color.category);
  const name = shortColorName(color.name);

  if (undertone === 'warm') {
    if (WARM_FAVORED_IDS.has(color.id)) {
      return {
        score: 94,
        level: 'ideal',
        note: `Sắc ${name} ấm áp rất tôn da tông ấm, giúp gương mặt rạng rỡ hơn.`,
      };
    }
    if (COOL_CAUTION_FOR_WARM_IDS.has(color.id)) {
      return {
        score: 70,
        level: 'caution',
        note: `Sắc ${name} hơi lạnh so với da tông ấm, nên cân bằng thêm bằng tông kem hoặc nâu ấm.`,
      };
    }
    if (neutral || color.id === 'bn-1' || color.id === 'bn-2' || color.id === 'gr-4') {
      return {
        score: 86,
        level: 'good',
        note: `${name} là gam nền dễ mặc, hài hòa tự nhiên với da tông ấm.`,
      };
    }
    return {
      score: 82,
      level: 'good',
      note: `${name} khá ổn với da tông ấm khi kết hợp cùng sắc độ trầm ấm.`,
    };
  }

  if (undertone === 'cool') {
    if (COOL_FAVORED_IDS.has(color.id)) {
      return {
        score: 94,
        level: 'ideal',
        note: `Sắc ${name} giúp bật sáng nước da tông lạnh rất thanh thoát.`,
      };
    }
    if (WARM_CAUTION_FOR_COOL_IDS.has(color.id)) {
      return {
        score: 68,
        level: 'caution',
        note: `${name} thiên vàng ấm, có thể làm da tông lạnh hơi xỉn nếu mặc sát mặt.`,
      };
    }
    return {
      score: 84,
      level: 'good',
      note: `${name} dung hòa ổn định với da tông lạnh, dễ phối tổng thể.`,
    };
  }

  // Da trung tính: linh hoạt với đa số sắc độ, chỉ lưu ý nhẹ các màu quá gắt
  if (neutral) {
    return {
      score: 92,
      level: 'ideal',
      note: `Da tông trung tính mặc ${name} rất gọn sáng và tự nhiên.`,
    };
  }
  if (hsl.s >= 72 && hsl.l >= 38 && hsl.l <= 64) {
    return {
      score: 82,
      level: 'good',
      note: `Da trung tính cân được sắc nổi ${name}, nên giữ phần còn lại dịu mắt.`,
    };
  }
  return {
    score: 90,
    level: 'ideal',
    note: `${name} rất hợp da tông trung tính, tạo tổng thể hài hòa dễ nhìn.`,
  };
}
