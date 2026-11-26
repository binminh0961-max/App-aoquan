// src/services/monetizationService.ts
/**
 * Lớp trừu tượng Monetization tích hợp SDK thật `react-native-google-mobile-ads` (Nhịp 5B).
 *
 * AN TOÀN ADMOB TUYỆT ĐỐI:
 * - Khi `__DEV__ === true` HOẶC khi ID production bên dưới để trống `''`,
 *   tất cả Banner / Rewarded / Interstitial BẮT BUỘC dùng Google Official `TestIds`.
 * - Mọi thao tác nạp/hiển thị quảng cáo đều bọc `try/catch` + timeout an toàn:
 *   không bao giờ crash hay treo UI khi mất mạng, chưa tải kịp hoặc chạy trên môi trường Web.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import mobileAds, {
  AdEventType,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

// =============================================================
// 1. CẤU HÌNH HẰNG SỐ & AD UNIT IDS (ĐIỀN ID THẬT TRƯỚC KHI BUILD .AAB)
// =============================================================

/** Số ô Tủ đồ miễn phí mặc định cho người dùng mới */
export const FREE_WARDROBE_SLOTS = 5;

/** Số ô Tủ đồ cộng thêm vĩnh viễn sau mỗi lần xem xong 1 quảng cáo có thưởng */
export const REWARDED_BONUS_SLOTS = 3;

/** Tắt hoàn toàn quảng cáo chen ngang trong 3 phút đầu mới cài app */
export const NEW_USER_GRACE_MS = 3 * 60 * 1000;

/** Giãn cách tối thiểu 5 phút giữa 2 lần quảng cáo toàn màn hình */
export const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000;

/** Công tắc bật SDK AdMob thật (đã bật true ở Nhịp 5B) */
export const IS_REAL_ADMOB_ENABLED = true;

/**
 * [TRƯỚC KHI BUILD PRODUCTION .AAB LÊN GOOGLE PLAY]:
 * 1. Thay `androidAppId` trong `app.json` bằng App ID thật của bạn.
 * 2. Điền 3 Ad Unit ID thật bên dưới.
 * - Khi `__DEV__ === true` hoặc khi chuỗi còn trống `''`, hệ thống BẮT BUỘC dùng `TestIds.*`.
 */
export const ADMOB_PROD_UNIT_IDS = {
  banner: 'ca-app-pub-9785592508637778/1700222642',       // Lookbook_Banner
  rewarded: 'ca-app-pub-9785592508637778/4901101057',     // Unlock_Wardrobe_Slots
  interstitial: 'ca-app-pub-9785592508637778/4709529360', // Compare_Exit_Interstitial
} as const;

const AD_LOAD_TIMEOUT_MS = 12000;

export type RewardedAdPlacement = 'unlock_wardrobe_slots';
export type InterstitialPlacement = 'exit_compare' | 'lookbook_transition';

export interface MonetizationState {
  maxWardrobeSlots: number;
  firstLaunchAt: number;
  lastInterstitialAt: number;
  totalRewardedCount: number;
}

export interface RewardedAdResult {
  rewarded: boolean;
  reason?: 'earned' | 'closed_early' | 'load_failed' | 'timeout' | 'unavailable';
  errorMessage?: string;
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
let adsInitialized = false;
let initPromise: Promise<boolean> | null = null;

// Bộ nhớ đệm Ad đã tải sẵn để hiển thị mượt tức thì
let preloadedInterstitial: InterstitialAd | null = null;
let isInterstitialLoaded = false;
let isInterstitialLoading = false;

let preloadedRewarded: RewardedAd | null = null;
let isRewardedPreloaded = false;
let isRewardedPreloading = false;

// =============================================================
// 2. GIẢI MÃ AD UNIT ID AN TOÀN (LUÔN DÙNG TestIds TRONG __DEV__)
// =============================================================

export function isNativeAdsSupported(): boolean {
  return IS_REAL_ADMOB_ENABLED && (Platform.OS === 'android' || Platform.OS === 'ios');
}

export function getBannerAdUnitId(): string {
  if (__DEV__ || !ADMOB_PROD_UNIT_IDS.banner.trim()) {
    return TestIds.ADAPTIVE_BANNER;
  }
  return ADMOB_PROD_UNIT_IDS.banner.trim();
}

export function getRewardedAdUnitId(): string {
  if (__DEV__ || !ADMOB_PROD_UNIT_IDS.rewarded.trim()) {
    return TestIds.REWARDED;
  }
  return ADMOB_PROD_UNIT_IDS.rewarded.trim();
}

export function getInterstitialAdUnitId(): string {
  if (__DEV__ || !ADMOB_PROD_UNIT_IDS.interstitial.trim()) {
    return TestIds.INTERSTITIAL;
  }
  return ADMOB_PROD_UNIT_IDS.interstitial.trim();
}

// =============================================================
// 3. STORAGE 3 TẦNG (`requireOptionalNativeModule`)
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
// 4. QUẢN LÝ QUYỀN LỢI TỦ ĐỒ & TẦN SUẤT QUẢNG CÁO
// =============================================================

export function getCachedMonetizationState(): MonetizationState {
  if (!memoryState) {
    memoryState = createDefaultState();
  }
  return { ...memoryState };
}

export async function loadMonetizationState(): Promise<MonetizationState> {
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

export async function canSaveMoreOutfits(currentCount: number): Promise<boolean> {
  const state = await loadMonetizationState();
  return currentCount < state.maxWardrobeSlots;
}

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
// 5. KHỞI TẠO & TẢI TRƯỚC GOOGLE MOBILE ADS SDK (AN TOÀN TUYỆT ĐỐI)
// =============================================================

/**
 * Khởi tạo SDK Google Mobile Ads một lần duy nhất lúc mở app.
 * Bọc try/catch toàn diện để không bao giờ gây crash khi offline hoặc chưa link native.
 */
export function initializeMobileAds(): Promise<boolean> {
  if (adsInitialized) {
    return Promise.resolve(true);
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      await loadMonetizationState();

      if (!isNativeAdsSupported()) {
        return false;
      }

      await mobileAds().initialize();
      adsInitialized = true;

      // Nạp sẵn ngầm Rewarded & Interstitial để giảm thời gian chờ của người dùng
      preloadRewardedAd();
      preloadInterstitialAd();
      return true;
    } catch {
      return false;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/** Tải trước 1 RewardedAd trong nền (im lặng bỏ qua nếu mất mạng). */
export function preloadRewardedAd(): void {
  if (!isNativeAdsSupported() || isRewardedPreloaded || isRewardedPreloading) {
    return;
  }

  try {
    isRewardedPreloading = true;
    const ad = RewardedAd.createForAdRequest(getRewardedAdUnitId(), {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      preloadedRewarded = ad;
      isRewardedPreloaded = true;
      isRewardedPreloading = false;
      unsubLoaded();
      unsubError();
    });

    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      preloadedRewarded = null;
      isRewardedPreloaded = false;
      isRewardedPreloading = false;
      unsubLoaded();
      unsubError();
    });

    ad.load();
  } catch {
    preloadedRewarded = null;
    isRewardedPreloaded = false;
    isRewardedPreloading = false;
  }
}

/** Tải trước 1 InterstitialAd trong nền (im lặng bỏ qua nếu mất mạng). */
export function preloadInterstitialAd(): void {
  if (!isNativeAdsSupported() || isInterstitialLoaded || isInterstitialLoading) {
    return;
  }

  try {
    isInterstitialLoading = true;
    const ad = InterstitialAd.createForAdRequest(getInterstitialAdUnitId(), {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      preloadedInterstitial = ad;
      isInterstitialLoaded = true;
      isInterstitialLoading = false;
      unsubLoaded();
      unsubError();
    });

    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      preloadedInterstitial = null;
      isInterstitialLoaded = false;
      isInterstitialLoading = false;
      unsubLoaded();
      unsubError();
    });

    ad.load();
  } catch {
    preloadedInterstitial = null;
    isInterstitialLoaded = false;
    isInterstitialLoading = false;
  }
}

/**
 * Hiển thị quảng cáo toàn màn hình (Interstitial) chỉ khi:
 * 1. Đã qua 3 phút đầu mới cài app (`NEW_USER_GRACE_MS`)
 * 2. Đã qua ít nhất 5 phút từ lần hiện trước (`INTERSTITIAL_COOLDOWN_MS`)
 * 3. Quảng cáo đã được tải sẵn trong bộ nhớ (không làm người dùng phải chờ màn hình trắng).
 */
export async function maybeShowInterstitial(
  _placement: InterstitialPlacement
): Promise<boolean> {
  if (!isNativeAdsSupported()) {
    return false;
  }

  try {
    const eligible = await canShowInterstitial();
    if (!eligible) {
      return false;
    }

    if (!isInterstitialLoaded || !preloadedInterstitial) {
      preloadInterstitialAd();
      return false;
    }

    const ad = preloadedInterstitial;
    preloadedInterstitial = null;
    isInterstitialLoaded = false;

    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      unsubClosed();
      preloadInterstitialAd();
    });

    await markInterstitialShown();
    await ad.show();
    return true;
  } catch {
    preloadedInterstitial = null;
    isInterstitialLoaded = false;
    return false;
  }
}

// =============================================================
// 6. REWARDED AD THẬT (MỞ KHÓA +3 Ô TỦ ĐỒ — CHỐNG CRASH & TIMEOUT)
// =============================================================

export function registerMockRewardedAdPresenter(
  presenter: MockRewardedAdPresenter | null
): void {
  registeredMockPresenter = presenter;
}

function showRealRewardedAdInstance(
  ad: RewardedAd,
  alreadyLoaded: boolean
): Promise<RewardedAdResult> {
  return new Promise<RewardedAdResult>(resolve => {
    let settled = false;
    let earnedReward = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const unsubscribers: (() => void)[] = [];

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      while (unsubscribers.length > 0) {
        const unsub = unsubscribers.pop();
        try {
          unsub?.();
        } catch {
          // Bỏ qua an toàn
        }
      }
    };

    const finish = (result: RewardedAdResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      // Chuẩn bị sẵn quảng cáo tiếp theo trong nền
      preloadRewardedAd();
      resolve(result);
    };

    try {
      const unsubEarned = ad.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => {
          earnedReward = true;
        }
      );
      unsubscribers.push(unsubEarned);

      const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
        finish({
          rewarded: earnedReward,
          reason: earnedReward ? 'earned' : 'closed_early',
        });
      });
      unsubscribers.push(unsubClosed);

      const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
        finish({
          rewarded: false,
          reason: 'load_failed',
          errorMessage:
            'Không tải được quảng cáo lúc này. Vui lòng kiểm tra kết nối mạng và thử lại sau.',
        });
      });
      unsubscribers.push(unsubError);

      if (alreadyLoaded) {
        ad.show().catch(() => {
          finish({
            rewarded: false,
            reason: 'load_failed',
            errorMessage:
              'Không thể phát quảng cáo lúc này. Vui lòng thử lại sau ít giây.',
          });
        });
        return;
      }

      const unsubLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        ad.show().catch(() => {
          finish({
            rewarded: false,
            reason: 'load_failed',
            errorMessage:
              'Không thể phát quảng cáo lúc này. Vui lòng thử lại sau ít giây.',
          });
        });
      });
      unsubscribers.push(unsubLoaded);

      timeoutId = setTimeout(() => {
        finish({
          rewarded: false,
          reason: 'timeout',
          errorMessage:
            'Quảng cáo tải quá lâu do mạng chậm. Vui lòng kiểm tra kết nối và thử lại.',
        });
      }, AD_LOAD_TIMEOUT_MS);

      ad.load();
    } catch {
      finish({
        rewarded: false,
        reason: 'unavailable',
        errorMessage:
          'Quảng cáo tạm thời chưa sẵn sàng trên thiết bị này. Vui lòng thử lại sau.',
      });
    }
  });
}

/**
 * Yêu cầu phát quảng cáo có thưởng (`unlock_wardrobe_slots`).
 * - Trên Android/iOS (`IS_REAL_ADMOB_ENABLED === true`): gọi SDK thật `react-native-google-mobile-ads`.
 * - Khi mất mạng / lỗi tải / quá thời gian: trả về `{ rewarded: false, reason, errorMessage }` an toàn.
 */
export async function requestRewardedAd(
  placement: RewardedAdPlacement,
  mockPresenter?: MockRewardedAdPresenter
): Promise<RewardedAdResult> {
  if (IS_REAL_ADMOB_ENABLED) {
    if (!isNativeAdsSupported()) {
      return {
        rewarded: false,
        reason: 'unavailable',
        errorMessage:
          'Quảng cáo có thưởng chỉ hoạt động trên bản dựng Android / iOS.',
      };
    }

    try {
      if (!adsInitialized) {
        await initializeMobileAds();
      }

      if (isRewardedPreloaded && preloadedRewarded) {
        const readyAd = preloadedRewarded;
        preloadedRewarded = null;
        isRewardedPreloaded = false;
        return await showRealRewardedAdInstance(readyAd, true);
      }

      const freshAd = RewardedAd.createForAdRequest(getRewardedAdUnitId(), {
        requestNonPersonalizedAdsOnly: true,
      });
      return await showRealRewardedAdInstance(freshAd, false);
    } catch {
      return {
        rewarded: false,
        reason: 'load_failed',
        errorMessage:
          'Không tải được quảng cáo lúc này. Vui lòng kiểm tra kết nối mạng và thử lại.',
      };
    }
  }

  // Fallback mô phỏng (chỉ dùng nếu chủ động tắt IS_REAL_ADMOB_ENABLED = false)
  const presenter = mockPresenter ?? registeredMockPresenter;
  return new Promise<RewardedAdResult>(resolve => {
    let settled = false;
    const finish = (rewarded: boolean) => {
      if (settled) return;
      settled = true;
      resolve({
        rewarded,
        reason: rewarded ? 'earned' : 'closed_early',
      });
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

    setTimeout(() => finish(true), 2000);
  });
}
