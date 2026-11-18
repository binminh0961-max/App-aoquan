// src/services/ColorEngine.ts
/**
 * ColorEngine - Lõi xử lý màu thời trang & lọc nhiễu sợi vải cho React Native Expo
 * - Lọc nhiễu bề mặt vải (Trimmed Mean Sampling 11x11)
 * - Bù trừ môi trường ánh sáng (Tự động / Đèn vàng phòng thử đồ / Ngoài trời)
 * - Chuyển đổi sRGB -> XYZ (D65) -> CIELAB
 * - Tính khoảng cách màu CIEDE2000 & CIE76 chuẩn xác
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

export interface Lab {
  l: number;
  a: number;
  b: number;
}

export type LightingMode = 'auto' | 'warm_light' | 'outdoor';

export interface ColorMatchResult<T> {
  rawHex: string; // Mã màu thật 100% tại đúng tâm điểm chạm
  trimmedHex: string; // Mã màu sau khi lọc nhiễu sợi vải (Trimmed Mean)
  calibratedRgb: RGB; // RGB sau khi bù trừ ánh sáng
  calibratedHex: string; // HEX sau khi bù trừ ánh sáng
  lab: Lab; // Tọa độ CIELAB
  matchedColor: T; // Màu chuẩn thời trang gần nhất (Delta E nhỏ nhất)
  deltaE: number; // Khoảng cách màu CIEDE2000
  nearbyColors: T[]; // Top 3 màu chuẩn lân cận
}

export interface ColorItemWithLab {
  id: string;
  name: string;
  hex: string;
  category?: string;
  lab: Lab;
}

// -------------------------------------------------------------
// 1. CHUYỂN ĐỔI MÃ MÀU: HEX <-> RGB <-> XYZ <-> LAB
// -------------------------------------------------------------

export function hexToRgb(hex: string): RGB {
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split('')
      .map(c => c + c)
      .join('');
  }
  const num = parseInt(cleaned, 16);
  if (isNaN(num)) {
    return { r: 128, g: 128, b: 128 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  const toHex = (val: number) => clamp(val).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Chuyển sRGB -> XYZ (Chuẩn D65, 2° Standard Observer)
 */
export function rgbToXyz(rgb: RGB): XYZ {
  const toLinear = (c: number): number => {
    const v = c / 255;
    return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
  };

  const rLinear = toLinear(rgb.r);
  const gLinear = toLinear(rgb.g);
  const bLinear = toLinear(rgb.b);

  const x = (rLinear * 0.4124564 + gLinear * 0.3575761 + bLinear * 0.1804375) * 100;
  const y = (rLinear * 0.2126729 + gLinear * 0.7151522 + bLinear * 0.072175) * 100;
  const z = (rLinear * 0.0193339 + gLinear * 0.119192 + bLinear * 0.9503041) * 100;

  return { x, y, z };
}

/**
 * Chuyển XYZ -> CIELAB (D65: Xn=95.047, Yn=100.0, Zn=108.883)
 */
export function xyzToLab(xyz: XYZ): Lab {
  const Xn = 95.047;
  const Yn = 100.0;
  const Zn = 108.883;

  const f = (t: number): number => {
    return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  };

  const fx = f(xyz.x / Xn);
  const fy = f(xyz.y / Yn);
  const fz = f(xyz.z / Zn);

  const l = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);

  return { l, a, b };
}

export function rgbToLab(rgb: RGB): Lab {
  return xyzToLab(rgbToXyz(rgb));
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}

// -------------------------------------------------------------
// 2. TÍNH TOÁN KHOẢNG CÁCH MÀU (DELTA E)
// -------------------------------------------------------------

export function deltaE76(lab1: Lab, lab2: Lab): number {
  const dl = lab1.l - lab2.l;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const deg2Rad = (deg: number) => (deg * Math.PI) / 180;
  const rad2Deg = (rad: number) => (rad * 180) / Math.PI;

  const L1 = lab1.l;
  const a1 = lab1.a;
  const b1 = lab1.b;

  const L2 = lab2.l;
  const a2 = lab2.a;
  const b2 = lab2.b;

  const avgL = (L1 + L2) / 2;
  const c1 = Math.sqrt(a1 * a1 + b1 * b1);
  const c2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (c1 + c2) / 2;

  const avgC7 = Math.pow(avgC, 7);
  const G = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + 6103515625)));

  const a1Prime = (1 + G) * a1;
  const a2Prime = (1 + G) * a2;

  const c1Prime = Math.sqrt(a1Prime * a1Prime + b1 * b1);
  const c2Prime = Math.sqrt(a2Prime * a2Prime + b2 * b2);
  const avgCPrime = (c1Prime + c2Prime) / 2;

  let h1Prime = rad2Deg(Math.atan2(b1, a1Prime));
  if (h1Prime < 0) h1Prime += 360;

  let h2Prime = rad2Deg(Math.atan2(b2, a2Prime));
  if (h2Prime < 0) h2Prime += 360;

  let deltaHPrimeAngle: number;
  if (Math.abs(h1Prime - h2Prime) <= 180) {
    deltaHPrimeAngle = h2Prime - h1Prime;
  } else if (h2Prime <= h1Prime) {
    deltaHPrimeAngle = h2Prime - h1Prime + 360;
  } else {
    deltaHPrimeAngle = h2Prime - h1Prime - 360;
  }

  const deltaLPrime = L2 - L1;
  const deltaCPrime = c2Prime - c1Prime;
  const deltaHPrime =
    2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(deg2Rad(deltaHPrimeAngle / 2));

  let avgHPrime: number;
  if (c1Prime === 0 || c2Prime === 0) {
    avgHPrime = h1Prime + h2Prime;
  } else if (Math.abs(h1Prime - h2Prime) <= 180) {
    avgHPrime = (h1Prime + h2Prime) / 2;
  } else if (h1Prime + h2Prime < 360) {
    avgHPrime = (h1Prime + h2Prime + 360) / 2;
  } else {
    avgHPrime = (h1Prime + h2Prime - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(deg2Rad(avgHPrime - 30)) +
    0.24 * Math.cos(deg2Rad(2 * avgHPrime)) +
    0.32 * Math.cos(deg2Rad(3 * avgHPrime + 6)) -
    0.2 * Math.cos(deg2Rad(4 * avgHPrime - 63));

  const deltaTheta = 30 * Math.exp(-Math.pow((avgHPrime - 275) / 25, 2));

  const avgCPrime7 = Math.pow(avgCPrime, 7);
  const RC = 2 * Math.sqrt(avgCPrime7 / (avgCPrime7 + 6103515625));

  const SL =
    1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const SC = 1 + 0.045 * avgCPrime;
  const SH = 1 + 0.015 * avgCPrime * T;

  const RT = -Math.sin(deg2Rad(2 * deltaTheta)) * RC;

  const kL = 1;
  const kC = 1;
  const kH = 1;

  const vL = deltaLPrime / (kL * SL);
  const vC = deltaCPrime / (kC * SC);
  const vH = deltaHPrime / (kH * SH);

  const deltaE = Math.sqrt(
    vL * vL + vC * vC + vH * vH + RT * vC * vH
  );

  return deltaE;
}

// -------------------------------------------------------------
// 3. LỌC NHIỄU BỀ MẶT VẢI (TRIMMED MEAN SAMPLING)
// -------------------------------------------------------------

export function trimmedMeanSampling(pixels: RGB[]): RGB {
  if (pixels.length === 0) {
    return { r: 128, g: 128, b: 128 };
  }

  if (pixels.length < 5) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (const p of pixels) {
      sumR += p.r;
      sumG += p.g;
      sumB += p.b;
    }
    return {
      r: Math.round(sumR / pixels.length),
      g: Math.round(sumG / pixels.length),
      b: Math.round(sumB / pixels.length),
    };
  }

  const withLuma = pixels.map(p => ({
    ...p,
    y: 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b,
  }));

  withLuma.sort((a, b) => a.y - b.y);

  const trimCount = Math.floor(withLuma.length * 0.2);
  const startIdx = trimCount;
  const endIdx = withLuma.length - trimCount;
  const validPixels = withLuma.slice(startIdx, endIdx);

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (const p of validPixels) {
    sumR += p.r;
    sumG += p.g;
    sumB += p.b;
  }

  const count = validPixels.length || 1;
  return {
    r: Math.round(sumR / count),
    g: Math.round(sumG / count),
    b: Math.round(sumB / count),
  };
}

// -------------------------------------------------------------
// 4. BÙ TRỪ MÔI TRƯỜNG ÁNH SÁNG
// -------------------------------------------------------------

export function calibrateLighting(rgb: RGB, mode: LightingMode): RGB {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));

  if (mode === 'warm_light') {
    return {
      r: clamp(rgb.r * 0.92),
      g: rgb.g,
      b: clamp(rgb.b * 1.08),
    };
  }

  if (mode === 'outdoor') {
    return {
      r: clamp(rgb.r),
      g: clamp(rgb.g),
      b: clamp(rgb.b),
    };
  }

  return rgb;
}

// -------------------------------------------------------------
// 5. SO KHỚP VÀ TÌM MÀU CHUẨN THỜI TRANG GẦN NHẤT
// -------------------------------------------------------------

/**
 * Xử lý tập pixel lấy mẫu -> Lọc nhiễu -> Bù sáng -> Quy chiếu CIELAB & Delta E
 * @param pixels Mảng pixel vùng lấy mẫu (ví dụ 11x11 = 121 pixel)
 * @param centerPixel Pixel chính xác tại tâm chữ thập
 * @param colorDictionary Danh sách màu thời trang đối chiếu
 * @param lightingMode Chế độ bù trừ ánh sáng
 */
export function matchFabricColor<T extends ColorItemWithLab>(
  pixels: RGB[],
  centerPixel: RGB | null,
  colorDictionary: T[],
  lightingMode: LightingMode = 'auto'
): ColorMatchResult<T> {
  // 1. Mã màu thực tế tại đúng điểm chạm ngón tay
  const exactRgb = centerPixel || (pixels.length > 0 ? pixels[Math.floor(pixels.length / 2)] : { r: 128, g: 128, b: 128 });
  const rawHex = rgbToHex(exactRgb.r, exactRgb.g, exactRgb.b);

  // 2. Lọc nhiễu bề mặt sợi dệt & nếp nhăn
  const trimmedRgb = trimmedMeanSampling(pixels);
  const trimmedHex = rgbToHex(trimmedRgb.r, trimmedRgb.g, trimmedRgb.b);

  // 3. Bù trừ môi trường ánh sáng cho màu trimmed
  const calibratedRgb = calibrateLighting(trimmedRgb, lightingMode);
  const calibratedHex = rgbToHex(calibratedRgb.r, calibratedRgb.g, calibratedRgb.b);

  // 4. Chuyển sang CIELAB
  const targetLab = rgbToLab(calibratedRgb);

  // 5. Tính khoảng cách CIEDE2000 tới tất cả màu trong từ điển
  const scored = colorDictionary.map(item => {
    const dE = deltaE2000(targetLab, item.lab);
    return { item, dE };
  });

  scored.sort((a, b) => a.dE - b.dE);

  const matched = scored[0];
  const nearby = scored.slice(1, 4).map(s => s.item);

  return {
    rawHex,
    trimmedHex,
    calibratedRgb,
    calibratedHex,
    lab: targetLab,
    matchedColor: matched ? matched.item : colorDictionary[0],
    deltaE: matched ? matched.dE : 0,
    nearbyColors: nearby,
  };
}

// -------------------------------------------------------------
// 6. PHÂN TÍCH VÙNG LẤY MẪU RGBA (11x11 PATCH) DÙNG CHUNG
// -------------------------------------------------------------

/**
 * Phân tích mảng byte RGBA (ví dụ 11x11 = 121 pixel từ camera hoặc ảnh tải lên)
 * Quy trình:
 * 1. Lấy mã màu thật tại tâm
 * 2. Lọc 20% sáng nhất & 20% tối nhất bằng Trimmed Mean Sampling
 * 3. Bù trừ môi trường ánh sáng (auto | warm_light | outdoor)
 * 4. Chuyển sang không gian CIELAB
 * 5. Tính CIEDE2000 so khớp tìm màu thời trang gần nhất & 3 sắc độ lân cận
 */
export function analyzeRgbaPatch<T extends ColorItemWithLab = any>(
  rgbaData: Uint8Array,
  pixelCount: number = 121,
  lightingMode: LightingMode = 'auto',
  colorDictionary?: T[]
): ColorMatchResult<T> {
  const count = pixelCount > 0 ? pixelCount : Math.floor(rgbaData.length / 4);
  const centerIndex = Math.floor(count / 2) * 4;
  const centerPixel: RGB = {
    r: rgbaData[centerIndex] ?? 128,
    g: rgbaData[centerIndex + 1] ?? 128,
    b: rgbaData[centerIndex + 2] ?? 128,
  };

  const pixels: RGB[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i * 4;
    pixels.push({
      r: rgbaData[offset],
      g: rgbaData[offset + 1],
      b: rgbaData[offset + 2],
    });
  }

  const dict = (colorDictionary || require('../constants/fashionColors').FASHION_COLORS) as T[];
  return matchFabricColor(pixels, centerPixel, dict, lightingMode);
}

// -------------------------------------------------------------
// 7. PHÂN TÍCH TRỰC TIẾP GIÁ TRỊ RGB (TỐI ƯU CHO WORKLET CAMERA)
// -------------------------------------------------------------

/**
 * Phân tích trực tiếp 3 kênh màu RGB (đã tính trung bình qua Trimmed Mean trực tiếp từ Worklet)
 * Quy trình:
 * 1. Mã màu thực tế sensor đọc được: rgbToHex(r, g, b)
 * 2. Bù trừ môi trường ánh sáng: calibrateLighting({ r, g, b }, lightingMode)
 * 3. Chuyển sang không gian CIELAB
 * 4. Tính khoảng cách màu CIEDE2000 so khớp tìm màu thời trang gần nhất & 3 sắc độ lân cận
 */
export function analyzeRgbColor<T extends ColorItemWithLab = any>(
  r: number,
  g: number,
  b: number,
  lightingMode: LightingMode = 'auto',
  colorDictionary?: T[]
): ColorMatchResult<T> {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  const exactRgb: RGB = { r: clamp(r), g: clamp(g), b: clamp(b) };
  const rawHex = rgbToHex(exactRgb.r, exactRgb.g, exactRgb.b);
  const trimmedHex = rawHex;

  // 1. Bù trừ môi trường ánh sáng
  const calibratedRgb = calibrateLighting(exactRgb, lightingMode);
  const calibratedHex = rgbToHex(calibratedRgb.r, calibratedRgb.g, calibratedRgb.b);

  // 2. Chuyển sang CIELAB
  const targetLab = rgbToLab(calibratedRgb);

  // 3. So khớp CIEDE2000 với từ điển màu thời trang
  const dict = (colorDictionary || require('../constants/fashionColors').FASHION_COLORS) as T[];
  const scored = dict.map((item) => ({
    item,
    dE: deltaE2000(targetLab, item.lab),
  }));

  scored.sort((a, b) => a.dE - b.dE);

  const matched = scored[0];
  const nearby = scored.slice(1, 4).map((s) => s.item);

  return {
    rawHex,
    trimmedHex,
    calibratedRgb,
    calibratedHex,
    lab: targetLab,
    matchedColor: matched ? matched.item : dict[0],
    deltaE: matched ? matched.dE : 0,
    nearbyColors: nearby,
  };
}

