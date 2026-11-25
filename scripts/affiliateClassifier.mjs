// scripts/affiliateClassifier.mjs
/**
 * Bộ phân loại sản phẩm thời trang tiếng Việt thuần Node.js (0 npm package ngoài).
 * Đọc tên sản phẩm (VD: "Áo Polo Nam Dệt Kim Xanh Navy Form Regular") và tự suy ra:
 *   - gender: 'male' | 'female' | 'unisex'
 *   - slot: 'top' | 'outerwear' | 'bottom' | 'shoes'
 *   - silhouettes: khớp chính xác key trong src/types/outfit.ts
 *   - colorIds, colorFamilies, swatchHex: khớp chính xác src/constants/fashionColors.ts & src/config/affiliateConfig.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// =============================================================
// 1. BẢNG MÀU CHUẨN ĐỒNG BỘ 100% VỚI src/constants/fashionColors.ts
// =============================================================

export const FASHION_COLOR_TABLE = {
  // White / Cream
  'wb-1': { hex: '#FFFFFF', family: 'white_cream' },
  'wb-2': { hex: '#F8F9FA', family: 'white_cream' },
  'wb-3': { hex: '#FFF9E6', family: 'white_cream' },
  'wb-4': { hex: '#FFFFF0', family: 'white_cream' },
  // Beige / Khaki
  'wb-5': { hex: '#D8C3A5', family: 'beige_khaki' },
  'wb-6': { hex: '#E8DCB8', family: 'beige_khaki' },
  // Black / Charcoal
  'gb-1': { hex: '#111827', family: 'black_charcoal' },
  'gb-2': { hex: '#1E1E1E', family: 'black_charcoal' },
  'gb-3': { hex: '#374151', family: 'black_charcoal' },
  // Grey / Silver
  'gb-4': { hex: '#6B7280', family: 'grey_silver' },
  'gb-5': { hex: '#9CA3AF', family: 'grey_silver' },
  'gb-6': { hex: '#D1D5DB', family: 'grey_silver' },
  // Navy / Blue / Denim / Sky
  'bn-1': { hex: '#0B192C', family: 'navy_blue' },
  'bn-2': { hex: '#1B2A4A', family: 'navy_blue' },
  'bn-3': { hex: '#1E3A8A', family: 'denim_sky' },
  'bn-4': { hex: '#3B82F6', family: 'denim_sky' },
  'bn-5': { hex: '#0047AB', family: 'navy_blue' },
  'bn-6': { hex: '#7DD3FC', family: 'denim_sky' },
  'bn-7': { hex: '#BAE6FD', family: 'denim_sky' },
  // Green / Olive
  'gr-1': { hex: '#556B2F', family: 'green_olive' },
  'gr-2': { hex: '#4A5D23', family: 'green_olive' },
  'gr-3': { hex: '#0F4C81', family: 'green_olive' },
  'gr-4': { hex: '#0A3641', family: 'green_olive' },
  'gr-5': { hex: '#9CAF88', family: 'green_olive' },
  'gr-6': { hex: '#6EE7B7', family: 'green_olive' },
  'gr-7': { hex: '#047857', family: 'green_olive' },
  // Red / Burgundy / Earth Warm / Pastel
  'rp-1': { hex: '#8B0000', family: 'red_burgundy' },
  'rp-2': { hex: '#6A1A24', family: 'red_burgundy' },
  'rp-3': { hex: '#F43F5E', family: 'red_burgundy' },
  'rp-4': { hex: '#A04030', family: 'earth_warm' },
  'rp-5': { hex: '#C25E34', family: 'earth_warm' },
  'rp-6': { hex: '#D97706', family: 'earth_warm' },
  'rp-7': { hex: '#F9A8D4', family: 'pastel_soft' },
  'rp-8': { hex: '#C08081', family: 'pastel_soft' },
  'rp-9': { hex: '#E11D48', family: 'red_burgundy' },
  // Brown / Mocha / Camel
  'bc-1': { hex: '#4A2C1A', family: 'brown_mocha' },
  'bc-2': { hex: '#362B28', family: 'brown_mocha' },
  'bc-3': { hex: '#C19A6B', family: 'earth_warm' },
  'bc-4': { hex: '#B87333', family: 'earth_warm' },
  'bc-5': { hex: '#8C7D70', family: 'brown_mocha' },
  'bc-6': { hex: '#7B3F00', family: 'brown_mocha' },
  // Yellow / Purple
  'yp-1': { hex: '#EAB308', family: 'earth_warm' },
  'yp-2': { hex: '#FEF08A', family: 'pastel_soft' },
  'yp-3': { hex: '#A78BFA', family: 'pastel_soft' },
  'yp-4': { hex: '#581C87', family: 'red_burgundy' },
  'yp-5': { hex: '#DDD6FE', family: 'pastel_soft' },
};

export const ALL_COLOR_FAMILIES = [
  'white_cream',
  'black_charcoal',
  'grey_silver',
  'beige_khaki',
  'brown_mocha',
  'navy_blue',
  'denim_sky',
  'green_olive',
  'red_burgundy',
  'earth_warm',
  'pastel_soft',
];

export const ALL_SLOTS = ['top', 'outerwear', 'bottom', 'shoes'];

// =============================================================
// 2. CHUẨN HÓA VĂN BẢN TIẾNG VIỆT & HELPER CHUNG
// =============================================================

export function stripVietnameseAccents(input = '') {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function padTokens(text) {
  return ` ${String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u1ef9]+/g, ' ')
    .trim()} `;
}

function hasAnyKeyword(text, keywords) {
  const paddedAccented = padTokens(text);
  const paddedPlain = padTokens(stripVietnameseAccents(text));

  for (const kw of keywords) {
    const cleanAccented = padTokens(kw);
    if (cleanAccented.trim() && paddedAccented.includes(cleanAccented)) {
      return true;
    }
    const cleanPlain = padTokens(stripVietnameseAccents(kw));
    if (cleanPlain.trim() && paddedPlain.includes(cleanPlain)) {
      return true;
    }
  }
  return false;
}

/**
 * Kiểm tra link rút gọn chính chủ hợp lệ (Shopee hoặc TikTok Shop).
 * Tuyệt đối giữ nguyên 100% URL, không gắn thêm query string hay bọc lại.
 */
export function isValidDirectShortUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  return /^https:\/\/(s\.shopee\.vn|shp\.ee|shope\.ee|vt\.tiktok\.com|vm\.tiktok\.com|shop\.tiktok\.com)\/[^\s]+$/i.test(
    trimmed
  );
}

export function detectPlatformFromUrl(url, fallback = 'shopee') {
  if (typeof url === 'string' && /tiktok\.com/i.test(url)) {
    return 'tiktok';
  }
  if (typeof url === 'string' && /(shopee\.vn|shp\.ee|shope\.ee)/i.test(url)) {
    return 'shopee';
  }
  return fallback === 'tiktok' ? 'tiktok' : 'shopee';
}

export function formatVndPrice(rawPrice) {
  if (rawPrice === undefined || rawPrice === null || rawPrice === '') {
    return undefined;
  }
  if (typeof rawPrice === 'number' && Number.isFinite(rawPrice) && rawPrice > 0) {
    return `${Math.round(rawPrice).toLocaleString('vi-VN').replace(/,/g, '.')}đ`;
  }
  const str = String(rawPrice).trim();
  if (!str) return undefined;
  if (/đ|₫|vnd/i.test(str)) {
    return str.replace(/₫/g, 'đ').replace(/\s*vnd/i, 'đ');
  }
  const numeric = Number(str.replace(/[^\d.]/g, '').replace(/\.(?=\d{3}\b)/g, ''));
  if (Number.isFinite(numeric) && numeric >= 1000) {
    return `${Math.round(numeric).toLocaleString('vi-VN').replace(/,/g, '.')}đ`;
  }
  return str;
}

export function buildStableProductId(platform, title, shortUrl) {
  const prefix = platform === 'tiktok' ? 'tt' : 'sp';
  const slug = stripVietnameseAccents(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 4)
    .join('-');
  const hash = crypto
    .createHash('sha1')
    .update(shortUrl.trim())
    .digest('hex')
    .slice(0, 6);
  return `${prefix}-${slug || 'item'}-${hash}`;
}

// =============================================================
// 3. PHÂN LOẠI GIỚI TÍNH (gender)
// =============================================================

const UNISEX_KEYWORDS = [
  'unisex',
  'nam nu',
  'nam và nữ',
  'nam va nu',
  'couple',
  'áo đôi',
  'ao doi',
];

const FEMALE_KEYWORDS = [
  'nữ',
  'women',
  'woman',
  'ladies',
  'lady',
  'girl',
  'chân váy',
  'chan vay',
  'váy chữ a',
  'vay chu a',
  'váy ngắn',
  'vay ngan',
  'váy midi',
  'vay midi',
  'mini skirt',
  'baby tee',
  'babytee',
  'crop top',
  'croptop',
  'áo kiểu',
  'ao kieu',
  'blouse',
  'cao gót',
  'cao got',
  'giày gót',
  'guốc',
  'búp bê',
  'mary jane',
  'trễ vai',
  'hai dây',
  'cổ vuông',
  'nữ tính',
];

const MALE_KEYWORDS = [
  'nam',
  'men',
  'mens',
  'man',
  'boy',
  'quý ông',
  'giày tây',
  'giay tay',
  'oxford',
  'derby',
  'polo nam',
  'sơ mi nam',
  'loafer nam',
  'quần âu nam',
  'quần tây nam',
];

export function classifyGender(title, contextHint = '') {
  const combined = `${title} ${contextHint}`;

  if (hasAnyKeyword(combined, UNISEX_KEYWORDS)) {
    return 'unisex';
  }

  const isFemale = hasAnyKeyword(combined, FEMALE_KEYWORDS);
  // Kiểm tra 'nam' cẩn thận để không bắt nhầm 'việt nam'
  const cleanedForMale = combined.replace(/việt\s*nam|viet\s*nam/gi, ' ');
  const isMale = hasAnyKeyword(cleanedForMale, MALE_KEYWORDS);

  if (isFemale && isMale) return 'unisex';
  if (isFemale) return 'female';
  if (isMale) return 'male';
  return 'unisex';
}

// =============================================================
// 4. PHÂN LOẠI SLOT & PHOM DÁNG (silhouettes khớp src/types/outfit.ts)
// =============================================================

export function classifySlotAndSilhouettes(title, gender = 'unisex', contextHint = '') {
  const combined = `${title} ${contextHint}`;

  // --- 1. GIÀY (SHOES) ---
  if (
    hasAnyKeyword(combined, [
      'giày',
      'giay',
      'sneaker',
      'loafer',
      'oxford',
      'derby',
      'boot',
      'bốt',
      'cao gót',
      'cao got',
      'mule',
      'sandal',
      'guốc',
      'giày lười',
      'giay luoi',
      'giày tây',
      'giay tay',
      'giày da',
      'giay da',
      'búp bê',
      'mary jane',
      'slip on',
      'trainer',
    ])
  ) {
    const silhouettes = [];
    if (hasAnyKeyword(combined, ['cao gót', 'cao got', 'mule', 'sandal', 'guốc', 'búp bê', 'mary jane', 'heels', 'gót nhọn', 'gót vuông'])) {
      silhouettes.push('heels');
    }
    if (hasAnyKeyword(combined, ['loafer', 'giày lười', 'giay luoi', 'mọi'])) {
      silhouettes.push('loafer', 'dress_shoes');
    }
    if (hasAnyKeyword(combined, ['giày tây', 'giay tay', 'oxford', 'derby', 'giày da', 'giay da', 'dress shoes', 'công sở'])) {
      silhouettes.push('dress_shoes', 'loafer');
    }
    if (hasAnyKeyword(combined, ['boot', 'bốt', 'chelsea', 'cổ cao'])) {
      silhouettes.push('boot');
    }
    if (hasAnyKeyword(combined, ['sneaker', 'thể thao', 'the thao', 'chạy bộ', 'đế bằng', 'vải canvas', 'trainer'])) {
      silhouettes.push('sneaker');
    }
    const unique = Array.from(new Set(silhouettes));
    return {
      slot: 'shoes',
      silhouettes:
        unique.length > 0
          ? unique
          : [gender === 'female' ? 'heels' : 'sneaker'],
    };
  }

  // --- 2. QUẦN & VÁY (BOTTOM) ---
  const isDenimJacket = hasAnyKeyword(combined, ['áo khoác jean', 'ao khoac jean', 'áo khoác denim', 'ao khoac denim', 'jacket denim']);
  if (
    !isDenimJacket &&
    hasAnyKeyword(combined, [
      'quần',
      'quan',
      'chân váy',
      'chan vay',
      'váy chữ a',
      'vay chu a',
      'váy ngắn',
      'vay ngan',
      'váy xếp ly',
      'vay xep ly',
      'váy midi',
      'vay midi',
      'skirt',
      'jean',
      'jeans',
      'short',
      'sooc',
      'culottes',
      'baggy',
      'trouser',
      'pants',
      'kaki ống',
      'tây ống',
    ])
  ) {
    const silhouettes = [];
    if (hasAnyKeyword(combined, ['váy ngắn', 'vay ngan', 'mini skirt', 'váy tennis', 'vay tennis', 'chân váy ngắn', 'chan vay ngan'])) {
      silhouettes.push('mini_skirt', 'a_line_skirt');
    } else if (hasAnyKeyword(combined, ['chân váy', 'chan vay', 'váy chữ a', 'vay chu a', 'váy xếp ly', 'váy midi', 'skirt'])) {
      silhouettes.push('a_line_skirt');
    }
    if (hasAnyKeyword(combined, ['jean', 'jeans', 'denim'])) {
      silhouettes.push('jeans');
    }
    if (hasAnyKeyword(combined, ['short', 'sooc', 'quần đùi', 'quan dui', 'quần lửng'])) {
      silhouettes.push('shorts');
    }
    if (
      hasAnyKeyword(combined, [
        'ống suông',
        'ong suong',
        'ống rộng',
        'ong rong',
        'wide',
        'baggy',
        'quần tây',
        'quan tay',
        'quần âu',
        'quan au',
        'quần kaki',
        'quan kaki',
        'culottes',
        'tuyết mưa',
      ])
    ) {
      silhouettes.push('wide_pants');
    }
    const unique = Array.from(new Set(silhouettes));
    return {
      slot: 'bottom',
      silhouettes:
        unique.length > 0
          ? unique
          : [gender === 'female' ? 'wide_pants' : 'wide_pants'],
    };
  }

  // --- 3. ÁO KHOÁC (OUTERWEAR) ---
  if (
    hasAnyKeyword(combined, [
      'áo khoác',
      'ao khoac',
      'blazer',
      'vest',
      'jacket',
      'cardigan',
      'bomber',
      'trench',
      'măng tô',
      'mang to',
      'khoác ngoài',
      'khoác dù',
      'khoác gió',
      'khoác jean',
      'khoác denim',
      'khoác kaki',
      'sơ mi khoác',
      'hoodie zip',
      'hoodie khóa kéo',
      'khoác nỉ',
      'overshirt',
    ])
  ) {
    const silhouettes = [];
    if (hasAnyKeyword(combined, ['blazer', 'vest', 'trench', 'măng tô', 'mang to'])) {
      silhouettes.push('blazer');
    }
    if (hasAnyKeyword(combined, ['hoodie', 'bomber', 'jacket', 'khoác gió', 'khoác dù', 'khoác nỉ'])) {
      silhouettes.push('hoodie');
    }
    if (hasAnyKeyword(combined, ['sơ mi khoác', 'khoác kaki', 'khoác jean', 'khoác denim', 'cardigan', 'overshirt'])) {
      silhouettes.push('shirt');
    }
    const unique = Array.from(new Set(silhouettes));
    return {
      slot: 'outerwear',
      silhouettes: unique.length > 0 ? unique : ['blazer'],
    };
  }

  // --- 4. ÁO (TOP) ---
  const silhouettes = [];
  if (hasAnyKeyword(combined, ['baby tee', 'babytee', 'crop top', 'croptop', 'áo croptop'])) {
    silhouettes.push('baby_tee');
  }
  if (hasAnyKeyword(combined, ['polo', 'cá sấu'])) {
    silhouettes.push('polo');
  }
  if (hasAnyKeyword(combined, ['áo kiểu', 'ao kieu', 'blouse', 'cổ vuông', 'tay phồng', 'tay bồng', 'trễ vai', 'hai dây', 'bánh bèo'])) {
    silhouettes.push('blouse');
  }
  if (hasAnyKeyword(combined, ['sơ mi', 'so mi', 'oxford', 'flannel', 'linen', 'shirt'])) {
    if (!hasAnyKeyword(combined, ['t-shirt', 'tshirt'])) {
      silhouettes.push('shirt');
    }
  }
  if (hasAnyKeyword(combined, ['hoodie', 'sweater', 'nỉ bông', 'chui đầu'])) {
    silhouettes.push('hoodie');
  }
  if (hasAnyKeyword(combined, ['áo thun', 'ao thun', 't-shirt', 'tshirt', 'áo phông', 'ao phong', 'tee', 'cổ tròn'])) {
    silhouettes.push('tshirt');
  }

  const unique = Array.from(new Set(silhouettes));
  return {
    slot: 'top',
    silhouettes: unique.length > 0 ? unique : ['tshirt'],
  };
}

// =============================================================
// 5. PHÂN LOẠI MÀU TIẾNG VIỆT -> colorIds, colorFamilies & swatchHex
// =============================================================

/**
 * Thứ tự ưu tiên từ cụm từ cụ thể đến tổng quát để không bị khớp nhầm
 * (VD: "trắng kem" trước "trắng", "xanh navy" trước "xanh", "nâu mocha" trước "nâu").
 */
const COLOR_KEYWORD_RULES = [
  // Trắng / Kem
  { keywords: ['trắng kem', 'trang kem', 'off white', 'off-white', 'màu kem', 'kem sữa', 'kem'], colorIds: ['wb-3', 'wb-4'] },
  { keywords: ['ngà voi', 'nga voi', 'ivory'], colorIds: ['wb-4', 'wb-3'] },
  { keywords: ['trắng sữa', 'trang sua'], colorIds: ['wb-2', 'wb-1'] },
  { keywords: ['trắng tinh', 'trắng', 'trang', 'white'], colorIds: ['wb-1', 'wb-2'] },

  // Be / Kaki
  { keywords: ['be cát', 'be cat', 'sand beige', 'kaki be', 'kaki', 'khaki'], colorIds: ['wb-5', 'wb-6'] },
  { keywords: ['be sáng', 'be sang', 'light beige', 'màu be', 'be'], colorIds: ['wb-6', 'wb-5'] },

  // Nâu / Mocha / Camel / Tan
  { keywords: ['nâu mocha', 'nau mocha', 'mocha', 'nâu cà phê', 'nau ca phe', 'cà phê', 'coffee', 'espresso'], colorIds: ['bc-2', 'bc-1'] },
  { keywords: ['nâu socola', 'nau socola', 'socola', 'chocolate', 'nâu đậm', 'nau dam', 'dark brown'], colorIds: ['bc-1', 'bc-2'] },
  { keywords: ['nâu camel', 'camel', 'lạc đà', 'nâu tây', 'nau tay'], colorIds: ['bc-3', 'bc-4'] },
  { keywords: ['nâu bò', 'nau bo', 'da bò', 'tan'], colorIds: ['bc-4', 'bc-3'] },
  { keywords: ['nâu khói', 'nau khoi', 'taupe', 'nâu xám'], colorIds: ['bc-5', 'bc-2'] },
  { keywords: ['nâu hạt dẻ', 'hat de', 'chestnut'], colorIds: ['bc-6', 'bc-1'] },
  { keywords: ['màu nâu', 'nâu', 'nau', 'brown'], colorIds: ['bc-2', 'bc-1'] },

  // Xanh Navy / Denim / Lam
  { keywords: ['xanh navy', 'navy', 'xanh than', 'xanh đen', 'xanh den', 'tím than', 'tim than'], colorIds: ['bn-1', 'bn-2'] },
  { keywords: ['xanh coban', 'coban', 'royal blue', 'xanh dương đậm'], colorIds: ['bn-5', 'bn-1'] },
  { keywords: ['xanh denim', 'xanh jean', 'xanh jeans', 'indigo', 'chàm'], colorIds: ['bn-3', 'bn-4'] },
  { keywords: ['xanh baby', 'xanh pastel', 'baby blue'], colorIds: ['bn-7', 'bn-6'] },
  { keywords: ['xanh lam', 'xanh da trời', 'xanh dương nhạt', 'sky blue', 'xanh biển nhạt', 'xanh nhạt'], colorIds: ['bn-6', 'bn-7'] },
  { keywords: ['xanh dương', 'xanh duong', 'blue'], colorIds: ['bn-4', 'bn-3'] },

  // Xanh lá / Olive / Rêu / Mint / Cổ vịt
  { keywords: ['xanh olive', 'olive', 'ô liu'], colorIds: ['gr-1', 'gr-2'] },
  { keywords: ['xanh rêu', 'xanh reu', 'rêu', 'moss'], colorIds: ['gr-2', 'gr-1'] },
  { keywords: ['xanh cổ vịt', 'co vit', 'teal'], colorIds: ['gr-3', 'gr-4'] },
  { keywords: ['xanh bơ', 'xanh bo', 'sage'], colorIds: ['gr-5', 'gr-1'] },
  { keywords: ['xanh mint', 'bạc hà', 'bac ha', 'mint'], colorIds: ['gr-6', 'gr-5'] },
  { keywords: ['lục bảo', 'emerald', 'xanh lá', 'xanh la', 'green'], colorIds: ['gr-7', 'gr-1'] },

  // Đỏ / Hồng / Cam đất
  { keywords: ['đỏ đô', 'do do', 'burgundy', 'đỏ mận', 'do man', 'maroon'], colorIds: ['rp-1', 'rp-2'] },
  { keywords: ['đỏ rượu', 'do ruou', 'wine', 'rượu vang'], colorIds: ['rp-2', 'rp-1'] },
  { keywords: ['đỏ san hô', 'san hô', 'coral'], colorIds: ['rp-3', 'rp-1'] },
  { keywords: ['đỏ đất', 'do dat', 'terracotta', 'gạch'], colorIds: ['rp-4', 'rp-5'] },
  { keywords: ['cam đất', 'cam dat', 'rust'], colorIds: ['rp-5', 'rp-4'] },
  { keywords: ['cam cháy', 'cam chay', 'màu cam', 'orange'], colorIds: ['rp-6', 'rp-5'] },
  { keywords: ['hồng đất', 'hong dat', 'dusty rose', 'hồng vỏ đỗ'], colorIds: ['rp-8', 'rp-7'] },
  { keywords: ['hồng phấn', 'hong phan', 'hồng pastel', 'hong pastel', 'hồng nhạt', 'pastel pink', 'pink', 'hồng'], colorIds: ['rp-7', 'rp-8'] },
  { keywords: ['hồng cánh sen', 'cánh sen', 'magenta'], colorIds: ['rp-9', 'rp-3'] },
  { keywords: ['màu đỏ', 'đỏ', 'red'], colorIds: ['rp-1', 'rp-3'] },

  // Vàng / Tím
  { keywords: ['vàng mù tạt', 'mu tat', 'mustard', 'vàng bò'], colorIds: ['yp-1', 'bc-4'] },
  { keywords: ['vàng bơ', 'vang bo', 'vàng kem', 'vàng nhạt', 'butter yellow', 'vàng pastel'], colorIds: ['yp-2', 'wb-3'] },
  { keywords: ['tím mận', 'tim man', 'plum'], colorIds: ['yp-4', 'rp-1'] },
  { keywords: ['tím pastel', 'lilac', 'tím nhạt'], colorIds: ['yp-5', 'yp-3'] },
  { keywords: ['tím lavender', 'lavender', 'màu tím', 'tím'], colorIds: ['yp-3', 'yp-5'] },

  // Đen / Xám / Ghi
  { keywords: ['xám chì', 'xam chi', 'charcoal', 'xám tiêu đậm', 'xám đậm'], colorIds: ['gb-3', 'gb-1'] },
  { keywords: ['xám ghi', 'xam ghi', 'màu ghi', 'ghi sáng', 'ghi', 'slate'], colorIds: ['gb-4', 'gb-5'] },
  { keywords: ['xám bạc', 'màu bạc', 'silver'], colorIds: ['gb-5', 'gb-6'] },
  { keywords: ['xám khói', 'xám nhạt', 'xam nhat', 'smoke gray', 'màu xám', 'xám', 'gray', 'grey'], colorIds: ['gb-6', 'gb-4'] },
  { keywords: ['đen nhám', 'den nham', 'jet black'], colorIds: ['gb-2', 'gb-1'] },
  { keywords: ['đen than', 'màu đen', 'đen', 'den', 'black'], colorIds: ['gb-1', 'gb-2'] },
];

export function classifyColors(title, silhouettes = [], contextHint = '') {
  const combined = `${title} ${contextHint}`;
  const foundIds = [];

  for (const rule of COLOR_KEYWORD_RULES) {
    if (hasAnyKeyword(combined, rule.keywords)) {
      for (const id of rule.colorIds) {
        if (!foundIds.includes(id)) {
          foundIds.push(id);
        }
      }
      // Lấy tối đa 3 sắc độ gần nhất để giữ độ chính xác cao
      if (foundIds.length >= 3) break;
    }
  }

  // Fallback hợp ngữ cảnh nếu tên sản phẩm không ghi màu rõ ràng
  if (foundIds.length === 0) {
    if (silhouettes.includes('jeans')) {
      foundIds.push('bn-3', 'bn-4');
    } else if (silhouettes.includes('sneaker')) {
      foundIds.push('wb-1', 'wb-2');
    } else {
      foundIds.push('gb-1', 'gb-2');
    }
  }

  const colorFamilies = Array.from(
    new Set(
      foundIds
        .map(id => FASHION_COLOR_TABLE[id]?.family)
        .filter(Boolean)
    )
  );

  const primaryMeta = FASHION_COLOR_TABLE[foundIds[0]] ?? {
    hex: '#111827',
    family: 'black_charcoal',
  };

  return {
    colorIds: foundIds,
    colorFamilies: colorFamilies.length > 0 ? colorFamilies : [primaryMeta.family],
    swatchHex: primaryMeta.hex,
  };
}

// =============================================================
// 6. TỔNG HỢP THÀNH OBJECT AffiliateProduct CHUẨN 100%
// =============================================================

export function classifyProduct(input) {
  const title = String(input.title || '').trim();
  const shortUrl = String(input.shortUrl || '').trim();
  const contextHint = String(input.contextHint || '').trim();

  if (!title || !isValidDirectShortUrl(shortUrl)) {
    return null;
  }

  const platform = detectPlatformFromUrl(shortUrl, input.platform);
  const gender =
    input.gender === 'male' || input.gender === 'female' || input.gender === 'unisex'
      ? input.gender
      : classifyGender(title, contextHint);

  const { slot, silhouettes } = classifySlotAndSilhouettes(
    title,
    gender,
    contextHint
  );
  const { colorIds, colorFamilies, swatchHex } = classifyColors(
    title,
    silhouettes,
    contextHint
  );

  const priceLabel = formatVndPrice(input.priceLabel);
  const imageUrl =
    typeof input.imageUrl === 'string' && /^https:\/\/[^\s]+$/i.test(input.imageUrl.trim())
      ? input.imageUrl.trim()
      : undefined;
  const shopBadge =
    typeof input.shopBadge === 'string' && input.shopBadge.trim()
      ? input.shopBadge.trim()
      : undefined;

  return {
    id: input.id?.trim() || buildStableProductId(platform, title, shortUrl),
    title,
    platform,
    shortUrl, // GIỮ NGUYÊN 100%, TUYỆT ĐỐI KHÔNG CHỈNH SỬA
    ...(imageUrl ? { imageUrl } : {}),
    ...(priceLabel ? { priceLabel } : {}),
    ...(shopBadge ? { shopBadge } : {}),
    gender,
    slot,
    silhouettes,
    colorIds,
    colorFamilies,
    swatchHex,
    isPlaceholder: false,
  };
}

// =============================================================
// 7. ĐỌC .env.local (KHÔNG CẦN dotenv) & IN BẢNG THỐNG KÊ ĐỘ PHỦ
// =============================================================

export function loadDotEnvLocal(projectRoot) {
  const envPath = path.join(projectRoot, '.env.local');
  const vars = {};
  if (!fs.existsSync(envPath)) {
    return vars;
  }
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

export function printCoverageReport(products) {
  const byGender = { male: 0, female: 0, unisex: 0 };
  const bySlot = { top: 0, outerwear: 0, bottom: 0, shoes: 0 };
  const byPlatform = { shopee: 0, tiktok: 0 };
  const coveredFamilies = new Set();

  for (const p of products) {
    byGender[p.gender] = (byGender[p.gender] || 0) + 1;
    bySlot[p.slot] = (bySlot[p.slot] || 0) + 1;
    byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1;
    for (const fam of p.colorFamilies || []) {
      coveredFamilies.add(fam);
    }
  }

  const missingSlots = ALL_SLOTS.filter(s => bySlot[s] === 0);
  const missingFamilies = ALL_COLOR_FAMILIES.filter(f => !coveredFamilies.has(f));

  console.log('\n================ BÁO CÁO ĐỘ PHỦ CATALOG ================');
  console.log(`Tổng sản phẩm hợp lệ : ${products.length}`);
  console.log(
    `Sàn                  : Shopee (${byPlatform.shopee}) | TikTok Shop (${byPlatform.tiktok})`
  );
  console.log(
    `Giới tính            : Nam (${byGender.male}) | Nữ (${byGender.female}) | Unisex (${byGender.unisex})`
  );
  console.log(
    `Theo nhóm món (slot) : top=${bySlot.top} | outerwear=${bySlot.outerwear} | bottom=${bySlot.bottom} | shoes=${bySlot.shoes}`
  );
  console.log(
    `Nhóm màu đã phủ      : ${coveredFamilies.size}/${ALL_COLOR_FAMILIES.length} ColorFamily`
  );
  if (missingSlots.length > 0) {
    console.log(`⚠️  Slot còn trống    : ${missingSlots.join(', ')}`);
  } else {
    console.log('✅ Đã phủ đủ cả 4 nhóm món (top, outerwear, bottom, shoes).');
  }
  if (missingFamilies.length > 0) {
    console.log(`ℹ️  Nhóm màu chưa có  : ${missingFamilies.join(', ')}`);
  }
  console.log('========================================================\n');
}
