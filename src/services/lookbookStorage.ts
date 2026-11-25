// src/services/lookbookStorage.ts
/**
 * Lưu trữ cục bộ Tủ đồ cá nhân (Local Lookbook) trên thiết bị bằng module native
 * `expo-file-system` theo đúng pattern 3 tầng của `userPreferences.ts`:
 *   1. Modern Expo SDK 58 NativeModule ('FileSystem')
 *   2. Legacy NativeModule ('ExponentFileSystem')
 *   3. Fallback Web localStorage + bộ nhớ đệm trong phiên làm việc
 * Tuyệt đối không cần cài thêm thư viện native nào.
 */

import { requireOptionalNativeModule } from 'expo';
import { FashionColor, FASHION_COLORS } from '../constants/fashionColors';
import { hexToLab } from './ColorEngine';
import {
  evaluateColorForUndertone,
  getSilhouetteOption,
  shortColorName,
} from '../engine/OutfitEngine';
import { evaluateTwoItemMatch } from '../engine/MatchCheckerEngine';
import {
  OccasionMode,
  OutfitSlotId,
  SilhouetteId,
  SilhouetteStyleType,
  SkinUndertone,
  StudioOutfitState,
} from '../types/outfit';

export type OutfitSlot = OutfitSlotId;
export type Gender = SilhouetteStyleType;
export type Occasion = Exclude<OccasionMode, 'all'>; // 'study' | 'work' | 'casual' | 'party'
export type UndertoneLabel = 'Tôn da' | 'Trung tính' | 'Cần lưu ý';

export interface SavedOutfitItem {
  slot: OutfitSlot; // 'top' | 'outerwear' | 'bottom' | 'shoes'
  colorId: string; // id trong fashionColors.ts
  hex: string;
  colorName: string;
  silhouette: string; // đúng key phom dáng hiện có (tshirt, polo, wide_pants, ...)
}

export interface SavedOutfit {
  id: string;
  title: string; // VD: "Đi làm • Navy + Be Cát"
  createdAt: number;
  gender: Gender;
  occasion: Occasion; // 'study' | 'work' | 'casual' | 'party'
  isLayering: boolean;
  items: {
    top: SavedOutfitItem;
    outerwear?: SavedOutfitItem;
    bottom: SavedOutfitItem;
    shoes: SavedOutfitItem;
  };
  harmonyScore: number; // 0-100 tính tự động khi lưu
  undertoneLabel?: string; // 'Tôn da' | 'Trung tính' | 'Cần lưu ý'
  signature: string; // chuỗi định danh tổ hợp để phát hiện trùng lặp
}

export interface OutfitQuickScoreResult {
  harmonyScore: number;
  undertoneLabel: UndertoneLabel;
  breakdown: {
    hueScore: number;
    contrastScore: number;
    saturationScore: number;
    undertoneScore: number;
  };
}

export interface SaveOutfitResult {
  saved: SavedOutfit;
  list: SavedOutfit[];
  isDuplicate: boolean;
}

export const SAVED_OCCASION_LABELS: Record<Occasion, string> = {
  study: 'Đi học',
  work: 'Đi làm',
  casual: 'Đi chơi',
  party: 'Tiệc tối',
};

const LOOKBOOK_FILE_NAME = 'saved_outfits_v1.json';
const WEB_STORAGE_KEY = 'app_aoquan_saved_outfits_v1';

interface LookbookFilePayload {
  version: 1;
  updatedAt: number;
  outfits: SavedOutfit[];
}

interface NativeFileSystemFileInstance {
  exists: boolean;
  text(): Promise<string>;
  write(content: string): Promise<void>;
}

interface NativeFileSystemModule {
  documentDirectory?: string | null;
  FileSystemFile?: new (uri: string) => NativeFileSystemFileInstance;
}

interface LegacyFileSystemModule {
  documentDirectory?: string | null;
  readAsStringAsync?: (fileUri: string, options?: Record<string, unknown>) => Promise<string>;
  writeAsStringAsync?: (
    fileUri: string,
    contents: string,
    options?: Record<string, unknown>
  ) => Promise<void>;
}

// Bộ nhớ đệm trong phiên làm việc
let memoryOutfits: SavedOutfit[] | null = null;

function normalizeDirUri(dir: string): string {
  return dir.endsWith('/') ? dir : `${dir}/`;
}

function getModernNativeFS(): NativeFileSystemModule | null {
  try {
    return requireOptionalNativeModule<NativeFileSystemModule>('FileSystem');
  } catch {
    return null;
  }
}

function getLegacyNativeFS(): LegacyFileSystemModule | null {
  try {
    return requireOptionalNativeModule<LegacyFileSystemModule>('ExponentFileSystem');
  } catch {
    return null;
  }
}

function getWebLocalStorage(): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
} | null {
  try {
    const g = globalThis as unknown as {
      localStorage?: {
        getItem(k: string): string | null;
        setItem(k: string, v: string): void;
      };
    };
    return g?.localStorage ?? null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeSavedOccasion(occasion?: OccasionMode | string): Occasion {
  if (
    occasion === 'study' ||
    occasion === 'work' ||
    occasion === 'casual' ||
    occasion === 'party'
  ) {
    return occasion;
  }
  return 'casual';
}

function isValidSavedOutfitItem(item: unknown): item is SavedOutfitItem {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Partial<SavedOutfitItem>;
  return (
    typeof obj.slot === 'string' &&
    typeof obj.colorId === 'string' &&
    typeof obj.hex === 'string' &&
    typeof obj.colorName === 'string' &&
    typeof obj.silhouette === 'string'
  );
}

function sanitizeSavedOutfit(raw: unknown): SavedOutfit | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<SavedOutfit>;
  if (
    typeof obj.id !== 'string' ||
    typeof obj.title !== 'string' ||
    typeof obj.createdAt !== 'number' ||
    (obj.gender !== 'male' && obj.gender !== 'female') ||
    typeof obj.isLayering !== 'boolean' ||
    !obj.items ||
    !isValidSavedOutfitItem(obj.items.top) ||
    !isValidSavedOutfitItem(obj.items.bottom) ||
    !isValidSavedOutfitItem(obj.items.shoes)
  ) {
    return null;
  }

  const outerwear =
    obj.items.outerwear && isValidSavedOutfitItem(obj.items.outerwear)
      ? obj.items.outerwear
      : undefined;

  const normalizedItems: SavedOutfit['items'] = {
    top: obj.items.top,
    ...(outerwear ? { outerwear } : {}),
    bottom: obj.items.bottom,
    shoes: obj.items.shoes,
  };

  const signature =
    typeof obj.signature === 'string' && obj.signature.length > 0
      ? obj.signature
      : buildOutfitSignature({
          gender: obj.gender,
          isLayering: obj.isLayering,
          items: normalizedItems,
        });

  return {
    id: obj.id,
    title: obj.title.trim() || 'Bộ phối đã lưu',
    createdAt: obj.createdAt,
    gender: obj.gender,
    occasion: normalizeSavedOccasion(obj.occasion),
    isLayering: obj.isLayering,
    items: normalizedItems,
    harmonyScore:
      typeof obj.harmonyScore === 'number' && !Number.isNaN(obj.harmonyScore)
        ? clamp(Math.round(obj.harmonyScore), 0, 100)
        : 80,
    undertoneLabel:
      typeof obj.undertoneLabel === 'string' ? obj.undertoneLabel : undefined,
    signature,
  };
}

function parseOutfitsFromJson(raw: string): SavedOutfit[] {
  try {
    const parsed = JSON.parse(raw) as Partial<LookbookFilePayload> | SavedOutfit[] | null;
    const rawList = Array.isArray(parsed)
      ? parsed
      : parsed && Array.isArray(parsed.outfits)
      ? parsed.outfits
      : [];

    const valid = rawList
      .map(sanitizeSavedOutfit)
      .filter((item): item is SavedOutfit => item !== null);

    return valid.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

async function persistOutfitsList(list: SavedOutfit[]): Promise<void> {
  const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
  memoryOutfits = sorted;

  const payload: LookbookFilePayload = {
    version: 1,
    updatedAt: Date.now(),
    outfits: sorted,
  };
  const serialized = JSON.stringify(payload);

  // 1. Ưu tiên API mới của expo-file-system (Expo SDK 58: NativeModule 'FileSystem')
  try {
    const modernFs = getModernNativeFS();
    if (modernFs?.documentDirectory && modernFs.FileSystemFile) {
      const fileUri = `${normalizeDirUri(modernFs.documentDirectory)}${LOOKBOOK_FILE_NAME}`;
      const file = new modernFs.FileSystemFile(fileUri);
      await file.write(serialized);
      return;
    }
  } catch {
    // Fallback xuống legacy hoặc web/memory
  }

  // 2. Fallback API legacy của expo-file-system ('ExponentFileSystem')
  try {
    const legacyFs = getLegacyNativeFS();
    if (legacyFs?.documentDirectory && legacyFs.writeAsStringAsync) {
      const fileUri = `${normalizeDirUri(legacyFs.documentDirectory)}${LOOKBOOK_FILE_NAME}`;
      await legacyFs.writeAsStringAsync(fileUri, serialized, {});
      return;
    }
  } catch {
    // Fallback xuống web/memory
  }

  // 3. Fallback cho môi trường Web preview (localStorage)
  try {
    const storage = getWebLocalStorage();
    if (storage) {
      storage.setItem(WEB_STORAGE_KEY, serialized);
    }
  } catch {
    // Đã giữ sẵn trong memoryOutfits, không bao giờ crash
  }
}

// =============================================================
// 1. HELPERS ÁNH XẠ MÀU, PHOM DÁNG, CHỮ KÝ & TÊN GỢI Ý
// =============================================================

export function resolveFashionColorFromItem(item: SavedOutfitItem): FashionColor {
  const byId = FASHION_COLORS.find(c => c.id === item.colorId);
  if (byId) return byId;

  const normalizedHex = item.hex.toUpperCase();
  const byHex = FASHION_COLORS.find(c => c.hex.toUpperCase() === normalizedHex);
  if (byHex) return byHex;

  return {
    id: item.colorId || `custom-${normalizedHex.replace('#', '')}`,
    name: item.colorName || normalizedHex,
    hex: item.hex,
    category: 'gray_black',
    lab: hexToLab(item.hex),
    nearbyHexes: [item.hex, item.hex, item.hex],
  };
}

export function getSavedSilhouetteLabel(silhouette: string): string {
  return getSilhouetteOption(silhouette as SilhouetteId).label;
}

export interface OutfitSignatureInput {
  gender: Gender;
  isLayering: boolean;
  items: {
    top: Pick<SavedOutfitItem, 'colorId' | 'silhouette'>;
    outerwear?: Pick<SavedOutfitItem, 'colorId' | 'silhouette'>;
    bottom: Pick<SavedOutfitItem, 'colorId' | 'silhouette'>;
    shoes: Pick<SavedOutfitItem, 'colorId' | 'silhouette'>;
  };
}

/**
 * Tạo chuỗi định danh duy nhất theo gender + isLayering + colorId & silhouette của từng món
 * để phát hiện chính xác bộ đang mặc đã có trong Tủ đồ hay chưa.
 */
export function buildOutfitSignature(input: OutfitSignatureInput): string {
  const { gender, isLayering, items } = input;
  const outerPart =
    isLayering && items.outerwear
      ? `${items.outerwear.colorId}:${items.outerwear.silhouette}`
      : 'none';
  return [
    'v1',
    gender,
    isLayering ? 'L1' : 'L0',
    `top:${items.top.colorId}:${items.top.silhouette}`,
    `out:${outerPart}`,
    `bot:${items.bottom.colorId}:${items.bottom.silhouette}`,
    `sho:${items.shoes.colorId}:${items.shoes.silhouette}`,
  ].join('|');
}

export function generateDefaultOutfitTitle(
  occasion: Occasion,
  items: SavedOutfit['items'],
  isLayering: boolean
): string {
  const occLabel = SAVED_OCCASION_LABELS[occasion];
  const primaryItem =
    isLayering && items.outerwear ? items.outerwear : items.top;
  const firstColor = shortColorName(primaryItem.colorName);
  const secondColor = shortColorName(items.bottom.colorName);

  if (firstColor.toLowerCase() === secondColor.toLowerCase()) {
    return `${occLabel} • Tone ${firstColor}`;
  }
  return `${occLabel} • ${firstColor} & ${secondColor}`;
}

// =============================================================
// 2. CHẤM ĐIỂM HÀI HÒA & NHÃN TÔN DA (TẬN DỤNG MatchCheckerEngine)
// =============================================================

export function computeOutfitQuickScore(
  items: SavedOutfit['items'],
  undertone: SkinUndertone = 'neutral',
  isLayering?: boolean
): OutfitQuickScoreResult {
  const topColor = resolveFashionColorFromItem(items.top);
  const bottomColor = resolveFashionColorFromItem(items.bottom);
  const shoesColor = resolveFashionColorFromItem(items.shoes);
  const hasOuter = Boolean((isLayering ?? Boolean(items.outerwear)) && items.outerwear);
  const outerColor =
    hasOuter && items.outerwear
      ? resolveFashionColorFromItem(items.outerwear)
      : null;

  const topBottomEval = evaluateTwoItemMatch(
    { slot: 'top', color: topColor },
    { slot: 'bottom', color: bottomColor },
    undertone
  );
  const bottomShoesEval = evaluateTwoItemMatch(
    { slot: 'bottom', color: bottomColor },
    { slot: 'shoes', color: shoesColor },
    undertone
  );

  let harmonyScore: number;
  let hueScore: number;
  let contrastScore: number;
  let saturationScore: number;
  let undertoneScore: number;

  if (outerColor) {
    const outerBottomEval = evaluateTwoItemMatch(
      { slot: 'outerwear', color: outerColor },
      { slot: 'bottom', color: bottomColor },
      undertone
    );
    const outerTopEval = evaluateTwoItemMatch(
      { slot: 'outerwear', color: outerColor },
      { slot: 'top', color: topColor },
      undertone
    );

    harmonyScore = clamp(
      Math.round(
        outerBottomEval.score * 0.36 +
          outerTopEval.score * 0.24 +
          topBottomEval.score * 0.22 +
          bottomShoesEval.score * 0.18
      ),
      0,
      100
    );
    hueScore = clamp(
      Math.round(
        outerBottomEval.breakdown.hueScore * 0.36 +
          outerTopEval.breakdown.hueScore * 0.24 +
          topBottomEval.breakdown.hueScore * 0.22 +
          bottomShoesEval.breakdown.hueScore * 0.18
      ),
      0,
      100
    );
    contrastScore = clamp(
      Math.round(
        outerBottomEval.breakdown.contrastScore * 0.36 +
          outerTopEval.breakdown.contrastScore * 0.24 +
          topBottomEval.breakdown.contrastScore * 0.22 +
          bottomShoesEval.breakdown.contrastScore * 0.18
      ),
      0,
      100
    );
    saturationScore = clamp(
      Math.round(
        outerBottomEval.breakdown.saturationScore * 0.36 +
          outerTopEval.breakdown.saturationScore * 0.24 +
          topBottomEval.breakdown.saturationScore * 0.22 +
          bottomShoesEval.breakdown.saturationScore * 0.18
      ),
      0,
      100
    );
    undertoneScore = clamp(
      Math.round(
        outerTopEval.breakdown.undertoneScore * 0.55 +
          outerBottomEval.breakdown.undertoneScore * 0.45
      ),
      0,
      100
    );
  } else {
    harmonyScore = clamp(
      Math.round(topBottomEval.score * 0.72 + bottomShoesEval.score * 0.28),
      0,
      100
    );
    hueScore = clamp(
      Math.round(
        topBottomEval.breakdown.hueScore * 0.72 +
          bottomShoesEval.breakdown.hueScore * 0.28
      ),
      0,
      100
    );
    contrastScore = clamp(
      Math.round(
        topBottomEval.breakdown.contrastScore * 0.72 +
          bottomShoesEval.breakdown.contrastScore * 0.28
      ),
      0,
      100
    );
    saturationScore = clamp(
      Math.round(
        topBottomEval.breakdown.saturationScore * 0.72 +
          bottomShoesEval.breakdown.saturationScore * 0.28
      ),
      0,
      100
    );
    undertoneScore = topBottomEval.breakdown.undertoneScore;
  }

  // Đánh giá nhãn tôn da dựa trên lớp áo sát khuôn mặt
  const topFit = evaluateColorForUndertone(topColor, undertone);
  let undertoneLabel: UndertoneLabel =
    topFit === 'flattering'
      ? 'Tôn da'
      : topFit === 'caution'
      ? 'Cần lưu ý'
      : 'Trung tính';

  if (outerColor) {
    const outerFit = evaluateColorForUndertone(outerColor, undertone);
    if (outerFit === 'flattering' && topFit !== 'caution') {
      undertoneLabel = 'Tôn da';
    } else if (outerFit === 'flattering' && topFit === 'caution') {
      // Rescue Layering: áo khoác tôn da làm dịu áo trong kén da
      undertoneLabel = 'Trung tính';
    } else if (outerFit === 'caution' && topFit === 'caution') {
      undertoneLabel = 'Cần lưu ý';
    } else if (outerFit === 'caution' && topFit === 'neutral') {
      undertoneLabel = 'Cần lưu ý';
    }
  }

  return {
    harmonyScore,
    undertoneLabel,
    breakdown: {
      hueScore,
      contrastScore,
      saturationScore,
      undertoneScore,
    },
  };
}

/**
 * Đóng gói trạng thái hiện tại của Studio thành payload chuẩn để lưu Tủ đồ.
 */
export function buildSavedOutfitDraftFromStudio(
  state: StudioOutfitState
): Omit<SavedOutfit, 'id' | 'createdAt'> {
  const occasion = normalizeSavedOccasion(state.occasion);
  const { slots, isLayering, styleType, undertone } = state;

  const items: SavedOutfit['items'] = {
    top: {
      slot: 'top',
      colorId: slots.top.color.id,
      hex: slots.top.color.hex,
      colorName: slots.top.color.name,
      silhouette: slots.top.silhouette,
    },
    ...(isLayering
      ? {
          outerwear: {
            slot: 'outerwear' as const,
            colorId: slots.outerwear.color.id,
            hex: slots.outerwear.color.hex,
            colorName: slots.outerwear.color.name,
            silhouette: slots.outerwear.silhouette,
          },
        }
      : {}),
    bottom: {
      slot: 'bottom',
      colorId: slots.bottom.color.id,
      hex: slots.bottom.color.hex,
      colorName: slots.bottom.color.name,
      silhouette: slots.bottom.silhouette,
    },
    shoes: {
      slot: 'shoes',
      colorId: slots.shoes.color.id,
      hex: slots.shoes.color.hex,
      colorName: slots.shoes.color.name,
      silhouette: slots.shoes.silhouette,
    },
  };

  const quickScore = computeOutfitQuickScore(items, undertone, isLayering);
  const signature = buildOutfitSignature({
    gender: styleType,
    isLayering,
    items,
  });
  const title = generateDefaultOutfitTitle(occasion, items, isLayering);

  return {
    title,
    gender: styleType,
    occasion,
    isLayering,
    items,
    harmonyScore: quickScore.harmonyScore,
    undertoneLabel: quickScore.undertoneLabel,
    signature,
  };
}

// =============================================================
// 3. CÁC HÀM CRUD LƯU TRỮ TỦ ĐỒ CỤC BỘ
// =============================================================

export function getCachedSavedOutfits(): SavedOutfit[] {
  return memoryOutfits ? [...memoryOutfits] : [];
}

/**
 * Đọc danh sách bộ đồ đã lưu từ file `saved_outfits_v1.json`,
 * xếp mới nhất lên đầu (`createdAt` giảm dần). Trả `[]` an toàn nếu chưa có dữ liệu.
 */
export async function loadSavedOutfits(): Promise<SavedOutfit[]> {
  // 1. Ưu tiên API mới của expo-file-system (Expo SDK 58: NativeModule 'FileSystem')
  try {
    const modernFs = getModernNativeFS();
    if (modernFs?.documentDirectory && modernFs.FileSystemFile) {
      const fileUri = `${normalizeDirUri(modernFs.documentDirectory)}${LOOKBOOK_FILE_NAME}`;
      const file = new modernFs.FileSystemFile(fileUri);
      if (file.exists) {
        const raw = await file.text();
        const parsed = parseOutfitsFromJson(raw);
        memoryOutfits = parsed;
        return parsed;
      }
      memoryOutfits = memoryOutfits ?? [];
      return [...memoryOutfits];
    }
  } catch {
    // Fallback xuống legacy hoặc web/memory
  }

  // 2. Fallback API legacy của expo-file-system ('ExponentFileSystem')
  try {
    const legacyFs = getLegacyNativeFS();
    if (legacyFs?.documentDirectory && legacyFs.readAsStringAsync) {
      const fileUri = `${normalizeDirUri(legacyFs.documentDirectory)}${LOOKBOOK_FILE_NAME}`;
      const raw = await legacyFs.readAsStringAsync(fileUri, {});
      const parsed = parseOutfitsFromJson(raw);
      memoryOutfits = parsed;
      return parsed;
    }
  } catch {
    // File chưa tồn tại hoặc không hỗ trợ -> bỏ qua an toàn
  }

  // 3. Fallback cho môi trường Web preview (localStorage)
  try {
    const storage = getWebLocalStorage();
    if (storage) {
      const raw = storage.getItem(WEB_STORAGE_KEY);
      if (raw) {
        const parsed = parseOutfitsFromJson(raw);
        memoryOutfits = parsed;
        return parsed;
      }
    }
  } catch {
    // Bỏ qua an toàn
  }

  return memoryOutfits ? [...memoryOutfits] : [];
}

/**
 * Lưu một bộ đồ mới vào Tủ đồ cục bộ.
 * Nếu `signature` đã tồn tại thì không nhân bản, trả về `isDuplicate: true` kèm bản ghi cũ.
 */
export async function saveOutfitToLookbook(
  outfit: Omit<SavedOutfit, 'id' | 'createdAt'>
): Promise<SaveOutfitResult> {
  const currentList = await loadSavedOutfits();
  const normalizedSignature =
    outfit.signature ||
    buildOutfitSignature({
      gender: outfit.gender,
      isLayering: outfit.isLayering,
      items: outfit.items,
    });

  const existing = currentList.find(item => item.signature === normalizedSignature);
  if (existing) {
    return {
      saved: existing,
      list: currentList,
      isDuplicate: true,
    };
  }

  const now = Date.now();
  const newOutfit: SavedOutfit = {
    ...outfit,
    id: `outfit_${now}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    occasion: normalizeSavedOccasion(outfit.occasion),
    title:
      outfit.title.trim() ||
      generateDefaultOutfitTitle(
        normalizeSavedOccasion(outfit.occasion),
        outfit.items,
        outfit.isLayering
      ),
    harmonyScore: clamp(Math.round(outfit.harmonyScore), 0, 100),
    signature: normalizedSignature,
  };

  const nextList = [newOutfit, ...currentList];
  await persistOutfitsList(nextList);

  return {
    saved: newOutfit,
    list: nextList,
    isDuplicate: false,
  };
}

/**
 * Xóa một bộ đồ khỏi Tủ đồ theo `id` và trả về danh sách còn lại.
 */
export async function deleteSavedOutfit(id: string): Promise<SavedOutfit[]> {
  const currentList = await loadSavedOutfits();
  const nextList = currentList.filter(item => item.id !== id);
  await persistOutfitsList(nextList);
  return nextList;
}

/**
 * Đổi tên một bộ đồ đã lưu trong Tủ đồ theo `id` và trả về danh sách mới.
 */
export async function renameSavedOutfit(
  id: string,
  newTitle: string
): Promise<SavedOutfit[]> {
  const trimmed = newTitle.trim();
  const currentList = await loadSavedOutfits();
  if (!trimmed) return currentList;

  const nextList = currentList.map(item =>
    item.id === id ? { ...item, title: trimmed } : item
  );
  await persistOutfitsList(nextList);
  return nextList;
}
