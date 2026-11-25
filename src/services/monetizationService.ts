// src/services/monetizationService.ts
/**
 * Lớp trừu tượng Monetization tách biệt hoàn toàn UI với SDK quảng cáo.
 * - Nhịp 5A: Lưu trạng thái quyền lợi Tủ đồ cục bộ (`monetization_state_v1.json`)
 *   bằng pattern 3 tầng (`FileSystem` -> `ExponentFileSystem` -> `localStorage` + memory)
 *   và mô phỏng Rewarded Ad qua Promise + Modal để kiểm thử đủ 2 nhánh (nhận thưởng / hủy sớm).
 * - Nhịp 5B: Chỉ cần bật `IS_REAL_ADMOB_ENABLED = true` và thay phần ruột gọi SDK
 *   `react-native-google-mobile-ads` bên trong file này (UI 4 màn hình giữ nguyên 100%).
 */

import { requireOptionalNativeModule } from 'expo';

// =============================================================
// 1. CẤU HÌNH HẰNG SỐ MONETIZATION (DỄ ĐIỀU CHỈNH TẠI 1 CHỖ)
// =============================================================

/** Số ô Tủ đồ miễn phí mặc định cho người dùng mới */
export const FREE_WARDROBE_SLOTS = 5;

/** Số ô Tủ đồ cộng thêm vĩnh viễn sau mỗi lần xem xong 1 quảng cáo có thưởng */
export const REWARDED_BONUS_SLOTS = 3;

/** Tắt hoàn toàn quảng cáo chen ngang trong 3 phút đầu mới cài app */
export const NEW_USER_GRACE_MS = 3 * 60 * 1000;

/** Giãn cách tối thiểu 5 phút giữa 2 lần quảng cáo toàn màn hình */
export const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000;

/** Công tắc bật SDK AdMob thật (đặt true ở Nhịp 5B sau khi cài react-native-google-mobile-ads) */
export const IS_REAL_ADMOB_ENABLED = false;

export type RewardedAdPlacement = 'unlock_wardrobe_slots';

export interface MonetizationState {
  maxWardrobeSlots: number;
  firstLaunchAt: number;
  lastInterstitialAt: number;
  totalRewardedCount: number;
}

export interface RewardedAdResult {
  rewarded: boolean;
}

export interface MockRewardedAdSession {
  placement: RewardedAdPlacement;
  durationSeconds: number;
  complete: () => void;
  cancel: () => void;
}

export type MockRewardedAdPresenter = (session: MockRewardedAdSession) => void;

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

const MONETIZATION_FILE_NAME = 'monetization_state_v1.json';
const MONETIZATION_WEB_KEY = 'app_aoquan_monetization_state_v1';

let memoryState: MonetizationState | null = null;
let registeredMockPresenter: MockRewardedAdPresenter | null = null;

// =============================================================
// 2. STORAGE 3 TẦNG (`requireOptionalNativeModule`)
// =============================================================

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

function createDefaultState(): MonetizationState {
  return {
    maxWardrobeSlots: FREE_WARDROBE_SLOTS,
    firstLaunchAt: Date.now(),
    lastInterstitialAt: 0,
    totalRewardedCount: 0,
  };
}

function parseMonetizationState(raw: string): MonetizationState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MonetizationState> | null;
    if (!parsed || typeof parsed !== 'object') return null;

    const maxWardrobeSlots =
      typeof parsed.maxWardrobeSlots === 'number' &&
      !Number.isNaN(parsed.maxWardrobeSlots) &&
      parsed.maxWardrobeSlots >= FREE_WARDROBE_SLOTS
        ? Math.floor(parsed.maxWardrobeSlots)
        : FREE_WARDROBE_SLOTS;

    const firstLaunchAt =
      typeof parsed.firstLaunchAt === 'number' && parsed.firstLaunchAt > 0
        ? parsed.firstLaunchAt
        : Date.now();

    const lastInterstitialAt =
      typeof parsed.lastInterstitialAt === 'number' && parsed.lastInterstitialAt >= 0
        ? parsed.lastInterstitialAt
        : 0;

    const totalRewardedCount =
      typeof parsed.totalRewardedCount === 'number' && parsed.totalRewardedCount >= 0
        ? Math.floor(parsed.totalRewardedCount)
        : 0;

    return {
      maxWardrobeSlots,
      firstLaunchAt,
      lastInterstitialAt,
      totalRewardedCount,
    };
  } catch {
    return null;
  }
}

async function persistMonetizationState(state: MonetizationState): Promise<void> {
  memoryState = { ...state };
  const serialized = JSON.stringify(memoryState);

  // Tầng 1: Modern Expo SDK 58 NativeModule ('FileSystem')
  try {
    const modernFs = getModernNativeFS();
    if (modernFs?.documentDirectory && modernFs.FileSystemFile) {
      const fileUri = `${normalizeDirUri(modernFs.documentDirectory)}${MONETIZATION_FILE_NAME}`;
      const file = new modernFs.FileSystemFile(fileUri);
      await file.write(serialized);
      return;
    }
  } catch {
    // Fallback xuống legacy
  }

  // Tầng 2: Legacy NativeModule ('ExponentFileSystem')
  try {
    const legacyFs = getLegacyNativeFS();
    if (legacyFs?.documentDirectory && legacyFs.writeAsStringAsync) {
      const fileUri = `${normalizeDirUri(legacyFs.documentDirectory)}${MONETIZATION_FILE_NAME}`;
      await legacyFs.writeAsStringAsync(fileUri, serialized, {});
      return;
    }
  } catch {
    // Fallback xuống Web localStorage
  }

  // Tầng 3: Web localStorage
  try {
    const storage = getWebLocalStorage();
    if (storage) {
      storage.setItem(MONETIZATION_WEB_KEY, serialized);
    }
  } catch {
    // Đã giữ sẵn trong memoryState, không bao giờ crash
  }
}

// =============================================================
// 3. QUẢN LÝ QUYỀN LỢI TỦ ĐỒ & TẦN SUẤT QUẢNG CÁO
// =============================================================

export function getCachedMonetizationState(): MonetizationState {
  if (!memoryState) {
    memoryState = createDefaultState();
  }
  return { ...memoryState };
}

/**
 * Nạp trạng thái Monetization từ `monetization_state_v1.json`.
 * Lần đầu mở app sẽ tự khởi tạo & lưu `firstLaunchAt` để bảo vệ 3 phút đầu không quảng cáo.
 */
export async function loadMonetizationState(): Promise<MonetizationState> {
  // Tầng 1: Modern NativeModule ('FileSystem')
  try {
    const modernFs = getModernNativeFS();
    if (modernFs?.documentDirectory && modernFs.FileSystemFile) {
      const fileUri = `${normalizeDirUri(modernFs.documentDirectory)}${MONETIZATION_FILE_NAME}`;
      const file = new modernFs.FileSystemFile(fileUri);
      if (file.exists) {
        const raw = await file.text();
        const parsed = parseMonetizationState(raw);
        if (parsed) {
          memoryState = parsed;
          return { ...parsed };
        }
      }
      const initial = memoryState ?? createDefaultState();
      await persistMonetizationState(initial);
      return { ...initial };
    }
  } catch {
    // Fallback xuống legacy
  }

  // Tầng 2: Legacy NativeModule ('ExponentFileSystem')
  try {
    const legacyFs = getLegacyNativeFS();
    if (legacyFs?.documentDirectory && legacyFs.readAsStringAsync) {
      const fileUri = `${normalizeDirUri(legacyFs.documentDirectory)}${MONETIZATION_FILE_NAME}`;
      const raw = await legacyFs.readAsStringAsync(fileUri, {});
      const parsed = parseMonetizationState(raw);
      if (parsed) {
        memoryState = parsed;
        return { ...parsed };
      }
    }
  } catch {
    // File chưa tồn tại hoặc không hỗ trợ -> thử tầng 3
  }

  // Tầng 3: Web localStorage
  try {
    const storage = getWebLocalStorage();
    if (storage) {
      const raw = storage.getItem(MONETIZATION_WEB_KEY);
      if (raw) {
        const parsed = parseMonetizationState(raw);
        if (parsed) {
          memoryState = parsed;
          return { ...parsed };
        }
      }
    }
  } catch {
    // Bỏ qua an toàn
  }

  const initial = memoryState ?? createDefaultState();
  await persistMonetizationState(initial);
  return { ...initial };
}

/** Kiểm tra xem người dùng còn ô trống để lưu thêm bộ đồ mới hay không. */
export async function canSaveMoreOutfits(currentCount: number): Promise<boolean> {
  const state = await loadMonetizationState();
  return currentCount < state.maxWardrobeSlots;
}

/** Cộng thêm ô Tủ đồ vĩnh viễn sau khi người dùng hoàn tất xem quảng cáo có thưởng. */
export async function grantWardrobeBonusSlots(
  bonus: number = REWARDED_BONUS_SLOTS
): Promise<MonetizationState> {
  const current = await loadMonetizationState();
  const safeBonus = Math.max(1, Math.floor(bonus));
  const next: MonetizationState = {
    ...current,
    maxWardrobeSlots: current.maxWardrobeSlots + safeBonus,
    totalRewardedCount: current.totalRewardedCount + 1,
  };
  await persistMonetizationState(next);
  return next;
}

/**
 * Kiểm tra điều kiện được phép hiển thị quảng cáo toàn màn hình (Interstitial):
 * - Tắt hoàn toàn trong `NEW_USER_GRACE_MS` (3 phút đầu mới cài app).
 * - Giãn cách tối thiểu `INTERSTITIAL_COOLDOWN_MS` (5 phút giữa 2 lần hiện).
 */
export async function canShowInterstitial(): Promise<boolean> {
  const state = await loadMonetizationState();
  const now = Date.now();

  if (now - state.firstLaunchAt < NEW_USER_GRACE_MS) {
    return false;
  }

  if (
    state.lastInterstitialAt > 0 &&
    now - state.lastInterstitialAt < INTERSTITIAL_COOLDOWN_MS
  ) {
    return false;
  }

  return true;
}

/** Ghi dấu thời điểm vừa hiển thị Interstitial gần nhất. */
export async function markInterstitialShown(): Promise<MonetizationState> {
  const current = await loadMonetizationState();
  const next: MonetizationState = {
    ...current,
    lastInterstitialAt: Date.now(),
  };
  await persistMonetizationState(next);
  return next;
}

// =============================================================
// 4. REWARDED AD ABSTRACTION (SẴN SÀNG THAY SDK THẬT Ở NHỊP 5B)
// =============================================================

export function registerMockRewardedAdPresenter(
  presenter: MockRewardedAdPresenter | null
): void {
  registeredMockPresenter = presenter;
}

/**
 * Yêu cầu phát quảng cáo có thưởng cho một vị trí cụ thể (`unlock_wardrobe_slots`).
 * - Nhịp 5A (`IS_REAL_ADMOB_ENABLED === false`): ủy quyền cho Modal mô phỏng (có nút Hủy sớm & đếm ngược 2s)
 *   thông qua `mockPresenter` để test đủ cả 2 nhánh `rewarded: true` và `rewarded: false`.
 * - Nhịp 5B (`IS_REAL_ADMOB_ENABLED === true`): thay nhánh `if (IS_REAL_ADMOB_ENABLED)` bằng SDK AdMob thật.
 */
export function requestRewardedAd(
  placement: RewardedAdPlacement,
  mockPresenter?: MockRewardedAdPresenter
): Promise<RewardedAdResult> {
  if (IS_REAL_ADMOB_ENABLED) {
    // [NHỊP 5B]: Tích hợp RewardedAd từ react-native-google-mobile-ads tại đây
    return Promise.resolve({ rewarded: false });
  }

  const presenter = mockPresenter ?? registeredMockPresenter;

  return new Promise<RewardedAdResult>(resolve => {
    let settled = false;
    const finish = (rewarded: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ rewarded });
    };

    if (presenter) {
      presenter({
        placement,
        durationSeconds: 2,
        complete: () => finish(true),
        cancel: () => finish(false),
      });
      return;
    }

    // Fallback nếu gọi trực tiếp không có presenter UI
    setTimeout(() => finish(true), 2000);
  });
}
