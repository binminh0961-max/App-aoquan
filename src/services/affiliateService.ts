// src/services/affiliateService.ts
/**
 * Affiliate Engine 2 tầng gắn Shopee Affiliate ID 17358150039 qua `https://s.shopee.vn/an_redir`:
 *   - Tầng 1 (`curatedProducts`): Tối đa 3 món tuyển chọn khớp nhất, nút `Xem ↗` mở link đã bọc `an_redir`.
 *   - Tầng 2 (`smartSearchLinks`): Luôn có nút `Tìm trên Shopee ↗` ghép từ khóa tiếng Việt theo phom/màu
 *     bọc qua `an_redir`; chỉ thêm nút TikTok Shop khi `TIKTOK_SHOP_CONFIG.showcaseUrl` khác rỗng.
 *
 * Lưu cache Remote JSON (TTL 24h) và thống kê lượt click bằng đúng pattern 3 tầng
 * (`requireOptionalNativeModule` -> FileSystem / ExponentFileSystem / localStorage + memory).
 */

import { Linking } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import {
  AffiliatePlatform,
  AffiliateProduct,
  LOCAL_SEED_CATALOG,
  REMOTE_AFFILIATE_CATALOG_URL,
  SHOPEE_AFFILIATE_CONFIG,
  TIKTOK_SHOP_CONFIG,
} from '../config/affiliateConfig';
import { FashionCategory, FASHION_COLORS } from '../constants/fashionColors';
import { shortColorName } from '../engine/OutfitEngine';
import { Gender, OutfitSlot } from './lookbookStorage';

export type AffiliatePlacement = 'bridge' | 'studio' | 'compare' | 'lookbook' | 'general';

export interface AffiliateQuery {
  gender: Gender;
  slot: OutfitSlot;
  silhouette?: string;
  colorId: string;
  colorName: string;
  colorFamily?: string;
  placement?: AffiliatePlacement;
}

export interface ShopeeAffiliateContext {
  placement?: AffiliatePlacement;
  slot?: OutfitSlot;
  colorId?: string;
  gender?: Gender;
}

export interface SmartSearchLink {
  platform: AffiliatePlatform;
  label: string;
  url: string;
  keyword: string;
}

export interface AffiliateRecommendationResult {
  keyword: string;
  curatedProducts: AffiliateProduct[];
  smartSearchLinks: {
    shopee: SmartSearchLink;
    /** Chỉ trả về khi TIKTOK_SHOP_CONFIG.showcaseUrl khác rỗng và hợp lệ https:// */
    tiktok: SmartSearchLink | null;
  };
}

export interface AffiliateClickMeta {
  platform: AffiliatePlatform;
  slot: OutfitSlot;
  colorId: string;
  placement?: AffiliatePlacement;
  source?: string;
}

export interface AffiliateStatsPayload {
  version: 1;
  totalClicks: number;
  byPlatform: Record<AffiliatePlatform, number>;
  bySlot: Record<OutfitSlot, number>;
  byColorId: Record<string, number>;
  updatedAt: number;
}

interface CatalogCachePayload {
  version: 1;
  fetchedAt: number;
  products: AffiliateProduct[];
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

const CATALOG_CACHE_FILE = 'affiliate_catalog_cache_v1.json';
const CATALOG_CACHE_WEB_KEY = 'app_aoquan_affiliate_catalog_cache_v1';
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000; // 24 giờ

const STATS_FILE = 'affiliate_stats_v1.json';
const STATS_WEB_KEY = 'app_aoquan_affiliate_stats_v1';

let memoryCatalog: AffiliateProduct[] = [...LOCAL_SEED_CATALOG];
let memoryCatalogFetchedAt = 0;
let memoryStats: AffiliateStatsPayload | null = null;
let inflightSync: Promise<AffiliateProduct[]> | null = null;

// =============================================================
// 1. HELPER LƯU TRỮ 3 TẦNG (ĐÚNG PATTERN lookbookStorage.ts)
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

async function readTextStorage(fileName: string, webKey: string): Promise<string | null> {
  try {
    const modernFs = getModernNativeFS();
    if (modernFs?.documentDirectory && modernFs.FileSystemFile) {
      const fileUri = `${normalizeDirUri(modernFs.documentDirectory)}${fileName}`;
      const file = new modernFs.FileSystemFile(fileUri);
      if (file.exists) {
        return await file.text();
      }
      return null;
    }
  } catch {
    // Fallback xuống legacy
  }

  try {
    const legacyFs = getLegacyNativeFS();
    if (legacyFs?.documentDirectory && legacyFs.readAsStringAsync) {
      const fileUri = `${normalizeDirUri(legacyFs.documentDirectory)}${fileName}`;
      return await legacyFs.readAsStringAsync(fileUri, {});
    }
  } catch {
    // Fallback xuống Web localStorage
  }

  try {
    const storage = getWebLocalStorage();
    if (storage) {
      return storage.getItem(webKey);
    }
  } catch {
    // Bỏ qua an toàn
  }

  return null;
}

async function writeTextStorage(
  fileName: string,
  webKey: string,
  serialized: string
): Promise<void> {
  try {
    const modernFs = getModernNativeFS();
    if (modernFs?.documentDirectory && modernFs.FileSystemFile) {
      const fileUri = `${normalizeDirUri(modernFs.documentDirectory)}${fileName}`;
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
      const fileUri = `${normalizeDirUri(legacyFs.documentDirectory)}${fileName}`;
      await legacyFs.writeAsStringAsync(fileUri, serialized, {});
      return;
    }
  } catch {
    // Fallback xuống Web localStorage
  }

  try {
    const storage = getWebLocalStorage();
    if (storage) {
      storage.setItem(webKey, serialized);
    }
  } catch {
    // Đã giữ sẵn trong memory, không crash
  }
}

// =============================================================
// 2. XÁC THỰC, ÁNH XẠ ALIAS MÀU & CACHE REMOTE JSON (TTL 24 GIỜ)
// =============================================================

const COLOR_ID_ALIAS_MAP: Record<string, string> = {
  pure_white: 'wb-1',
  white: 'wb-1',
  milk_white: 'wb-2',
  soft_white: 'wb-2',
  cream_white: 'wb-3',
  off_white: 'wb-3',
  cream: 'wb-3',
  ivory: 'wb-4',
  ivory_white: 'wb-4',
  sand_beige: 'wb-5',
  beige: 'wb-5',
  light_beige: 'wb-6',
  charcoal_black: 'gb-1',
  carbon_black: 'gb-1',
  black: 'gb-1',
  jet_black: 'gb-2',
  matte_black: 'gb-2',
  charcoal: 'gb-3',
  charcoal_gray: 'gb-3',
  dark_gray: 'gb-3',
  slate_gray: 'gb-4',
  gray: 'gb-4',
  grey: 'gb-4',
  silver: 'gb-5',
  silver_gray: 'gb-5',
  smoke_gray: 'gb-6',
  light_gray: 'gb-6',
  dark_navy: 'bn-1',
  navy: 'bn-1',
  navy_blue: 'bn-1',
  classic_navy: 'bn-2',
  dark_denim: 'bn-3',
  indigo: 'bn-3',
  dark_blue: 'bn-3',
  denim_blue: 'bn-4',
  basic_denim: 'bn-4',
  blue: 'bn-4',
  royal_blue: 'bn-5',
  cobalt_blue: 'bn-5',
  sky_blue: 'bn-6',
  light_blue: 'bn-6',
  baby_blue: 'bn-7',
  pastel_blue: 'bn-7',
  olive: 'gr-1',
  olive_green: 'gr-1',
  moss_green: 'gr-2',
  dark_green: 'gr-2',
  teal: 'gr-3',
  dark_teal: 'gr-4',
  sage_green: 'gr-5',
  sage: 'gr-5',
  mint: 'gr-6',
  mint_green: 'gr-6',
  emerald: 'gr-7',
  emerald_green: 'gr-7',
  burgundy: 'rp-1',
  dark_red: 'rp-1',
  maroon: 'rp-1',
  wine_red: 'rp-2',
  wine: 'rp-2',
  coral_red: 'rp-3',
  coral: 'rp-3',
  red: 'rp-3',
  terracotta: 'rp-4',
  rust_orange: 'rp-5',
  rust: 'rp-5',
  burnt_orange: 'rp-6',
  orange: 'rp-6',
  pastel_pink: 'rp-7',
  light_pink: 'rp-7',
  pink: 'rp-7',
  dusty_rose: 'rp-8',
  rose: 'rp-8',
  hot_pink: 'rp-9',
  magenta: 'rp-9',
  dark_brown: 'bc-1',
  chocolate_brown: 'bc-1',
  chocolate: 'bc-1',
  brown: 'bc-1',
  mocha_brown: 'bc-2',
  coffee_brown: 'bc-2',
  mocha: 'bc-2',
  espresso: 'bc-2',
  camel: 'bc-3',
  camel_brown: 'bc-3',
  tan: 'bc-4',
  tan_brown: 'bc-4',
  taupe: 'bc-5',
  taupe_brown: 'bc-5',
  chestnut: 'bc-6',
  chestnut_brown: 'bc-6',
  mustard: 'yp-1',
  mustard_yellow: 'yp-1',
  yellow: 'yp-1',
  butter_yellow: 'yp-2',
  pastel_yellow: 'yp-2',
  light_yellow: 'yp-2',
  lavender: 'yp-3',
  purple: 'yp-3',
  plum: 'yp-4',
  dark_purple: 'yp-4',
  lilac: 'yp-5',
  pastel_purple: 'yp-5',
};

function normalizeColorId(rawId: string): string {
  const key = rawId.trim().toLowerCase();
  if (!key) return '';
  if (FASHION_COLORS.some(c => c.id === key)) {
    return key;
  }
  return COLOR_ID_ALIAS_MAP[key] ?? key;
}

function isSafeHttpsUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https:\/\/[^\s]+$/i.test(url.trim());
}

function isPreShortenedShopeeUrl(url: string): boolean {
  return /^https:\/\/(s\.shopee\.vn|shope\.ee|shp\.ee)\//i.test(url.trim());
}

interface RawRemoteAffiliateProduct
  extends Omit<Partial<AffiliateProduct>, 'colorIds' | 'silhouettes'> {
  shortUrl?: unknown;
  swatchHex?: unknown;
  shopBadge?: unknown;
  colorIds?: unknown;
  silhouettes?: unknown;
}

function sanitizeAffiliateProduct(raw: unknown): AffiliateProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as RawRemoteAffiliateProduct;

  const rawUrl =
    typeof obj.url === 'string' && obj.url.trim()
      ? obj.url.trim()
      : typeof obj.shortUrl === 'string' && obj.shortUrl.trim()
      ? obj.shortUrl.trim()
      : '';

  const rawColorList: string[] = [];
  if (typeof obj.colorId === 'string' && obj.colorId.trim()) {
    rawColorList.push(obj.colorId);
  }
  if (Array.isArray(obj.colorIds)) {
    for (const c of obj.colorIds) {
      if (typeof c === 'string' && c.trim()) {
        rawColorList.push(c);
      }
    }
  }
  const normalizedColorIds = Array.from(
    new Set(rawColorList.map(normalizeColorId).filter(Boolean))
  );

  const rawSilhouettes: string[] = [];
  if (typeof obj.silhouette === 'string' && obj.silhouette.trim()) {
    rawSilhouettes.push(obj.silhouette.trim());
  }
  if (Array.isArray(obj.silhouettes)) {
    for (const s of obj.silhouettes) {
      if (typeof s === 'string' && s.trim()) {
        rawSilhouettes.push(s.trim());
      }
    }
  }
  const normalizedSilhouettes = Array.from(new Set(rawSilhouettes));

  if (
    typeof obj.id !== 'string' ||
    typeof obj.title !== 'string' ||
    (obj.gender !== 'male' && obj.gender !== 'female' && obj.gender !== 'unisex') ||
    (obj.slot !== 'top' &&
      obj.slot !== 'outerwear' &&
      obj.slot !== 'bottom' &&
      obj.slot !== 'shoes') ||
    normalizedColorIds.length === 0 ||
    (obj.platform !== 'shopee' && obj.platform !== 'tiktok') ||
    !isSafeHttpsUrl(rawUrl)
  ) {
    return null;
  }

  const primaryColorId = normalizedColorIds[0];
  const matchedColor =
    normalizedColorIds
      .map(id => FASHION_COLORS.find(c => c.id === id))
      .find(Boolean) ?? null;

  const colorHex =
    typeof obj.colorHex === 'string' && obj.colorHex.startsWith('#')
      ? obj.colorHex
      : typeof obj.swatchHex === 'string' && obj.swatchHex.startsWith('#')
      ? obj.swatchHex
      : matchedColor?.hex ?? '#111827';

  const colorFamily: FashionCategory =
    (obj.colorFamily as FashionCategory | undefined) ??
    matchedColor?.category ??
    'gray_black';

  const tag =
    typeof obj.tag === 'string' && obj.tag.trim()
      ? obj.tag.trim()
      : typeof obj.shopBadge === 'string' && obj.shopBadge.trim()
      ? obj.shopBadge.trim()
      : '';

  const imageUrl = isSafeHttpsUrl(obj.imageUrl) ? obj.imageUrl.trim() : undefined;

  return {
    id: obj.id.trim(),
    title: obj.title.trim(),
    gender: obj.gender,
    slot: obj.slot,
    silhouette: normalizedSilhouettes[0],
    ...(normalizedSilhouettes.length > 0
      ? { silhouettes: normalizedSilhouettes }
      : {}),
    colorId: primaryColorId,
    colorIds: normalizedColorIds,
    colorHex,
    colorFamily,
    platform: obj.platform,
    priceLabel: typeof obj.priceLabel === 'string' ? obj.priceLabel.trim() : '',
    tag,
    ...(imageUrl ? { imageUrl } : {}),
    url: rawUrl,
  };
}

function parseCatalogCache(raw: string): CatalogCachePayload | null {
  try {
    const parsed = JSON.parse(raw) as
      | Partial<CatalogCachePayload>
      | AffiliateProduct[]
      | null;
    if (Array.isArray(parsed)) {
      const products = parsed
        .map(sanitizeAffiliateProduct)
        .filter((p): p is AffiliateProduct => p !== null);
      if (products.length === 0) return null;
      return { version: 1, fetchedAt: Date.now(), products };
    }
    if (parsed && Array.isArray(parsed.products)) {
      const products = parsed.products
        .map(sanitizeAffiliateProduct)
        .filter((p): p is AffiliateProduct => p !== null);
      if (products.length === 0) return null;
      return {
        version: 1,
        fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0,
        products,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function syncAffiliateCatalog(
  force = false
): Promise<AffiliateProduct[]> {
  if (inflightSync && !force) {
    return inflightSync;
  }

  const run = async (): Promise<AffiliateProduct[]> => {
    if (memoryCatalogFetchedAt === 0) {
      const rawCache = await readTextStorage(
        CATALOG_CACHE_FILE,
        CATALOG_CACHE_WEB_KEY
      );
      if (rawCache) {
        const parsed = parseCatalogCache(rawCache);
        if (parsed && parsed.products.length > 0) {
          memoryCatalog = parsed.products;
          memoryCatalogFetchedAt = parsed.fetchedAt;
        }
      }
    }

    const remoteUrl = REMOTE_AFFILIATE_CATALOG_URL.trim();
    if (!isSafeHttpsUrl(remoteUrl)) {
      return memoryCatalog;
    }

    const isFresh =
      !force &&
      memoryCatalogFetchedAt > 0 &&
      Date.now() - memoryCatalogFetchedAt < CATALOG_TTL_MS;
    if (isFresh) {
      return memoryCatalog;
    }

    try {
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 7000) : null;

      try {
        const response = await fetch(remoteUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          ...(controller ? { signal: controller.signal } : {}),
        });
        if (!response.ok) {
          return memoryCatalog;
        }
        const rawText = await response.text();
        const parsed = parseCatalogCache(rawText);
        if (parsed && parsed.products.length > 0) {
          const payload: CatalogCachePayload = {
            version: 1,
            fetchedAt: Date.now(),
            products: parsed.products,
          };
          memoryCatalog = payload.products;
          memoryCatalogFetchedAt = payload.fetchedAt;
          await writeTextStorage(
            CATALOG_CACHE_FILE,
            CATALOG_CACHE_WEB_KEY,
            JSON.stringify(payload)
          );
        }
      } finally {
        if (timer !== null) {
          clearTimeout(timer);
        }
      }
    } catch {
      // Offline hoặc lỗi mạng -> giữ nguyên cache cũ / LOCAL_SEED_CATALOG
    }

    return memoryCatalog;
  };

  inflightSync = run().finally(() => {
    inflightSync = null;
  });

  return inflightSync;
}

export function getActiveAffiliateCatalog(): AffiliateProduct[] {
  return memoryCatalog;
}

// =============================================================
// 3. TẠO TỪ KHÓA TIẾNG VIỆT & BỌC LINK SHOPEE `an_redir`
// =============================================================

const SILHOUETTE_VIETNAMESE_NOUNS: Record<string, string> = {
  tshirt: 'áo thun',
  polo: 'áo polo',
  baby_tee: 'áo baby tee',
  blouse: 'áo kiểu',
  shirt: 'áo sơ mi',
  hoodie: 'áo hoodie',
  blazer: 'áo blazer',
  wide_pants: 'quần ống suông',
  jeans: 'quần jean',
  shorts: 'quần short',
  a_line_skirt: 'chân váy chữ a',
  mini_skirt: 'chân váy ngắn',
  sneaker: 'giày sneaker',
  loafer: 'giày loafer',
  dress_shoes: 'giày da tây',
  heels: 'giày cao gót',
  boot: 'giày boot',
};

function getGarmentNounVietnamese(
  slot: OutfitSlot,
  gender: Gender,
  silhouette?: string
): string {
  if (silhouette) {
    if (slot === 'outerwear') {
      if (silhouette === 'blazer') return 'áo khoác blazer';
      if (silhouette === 'shirt') return 'áo sơ mi khoác';
      if (silhouette === 'hoodie') return 'áo khoác hoodie';
    }
    const mapped = SILHOUETTE_VIETNAMESE_NOUNS[silhouette];
    if (mapped) return mapped;
  }

  switch (slot) {
    case 'outerwear':
      return 'áo khoác';
    case 'top':
      return 'áo';
    case 'bottom':
      return gender === 'female' ? 'quần ống suông' : 'quần';
    case 'shoes':
      return 'giày';
    default:
      return 'trang phục';
  }
}

export function getDisplayGarmentLabel(
  slot: OutfitSlot,
  gender: Gender,
  silhouette?: string
): string {
  const noun = getGarmentNounVietnamese(slot, gender, silhouette);
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

/**
 * Ghép từ khóa tìm kiếm tiếng Việt tự nhiên từ món đồ + giới tính + màu sắc.
 * VD: "giày loafer nam nâu cà phê", "áo baby tee nữ trắng kem", "quần ống suông nữ be cát".
 */
export function buildVietnameseFashionKeyword(query: AffiliateQuery): string {
  const garmentNoun = getGarmentNounVietnamese(
    query.slot,
    query.gender,
    query.silhouette
  );
  const genderWord = query.gender === 'female' ? 'nữ' : 'nam';
  const cleanColor = shortColorName(query.colorName).trim().toLowerCase();

  return [garmentNoun, genderWord, cleanColor].filter(Boolean).join(' ').trim();
}

/**
 * Làm sạch từng thành phần của `sub_id` Shopee Affiliate (chỉ giữ a-z, 0-9, tuyệt đối không chứa dấu '-').
 */
export function sanitizeSubIdPart(value?: string): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);
}

/**
 * Bọc mọi URL `https://shopee.vn/...` sang chuẩn Shopee Affiliate Universal Link:
 * `https://s.shopee.vn/an_redir?origin_link=${encodeURIComponent(originLink)}&affiliate_id=17358150039&sub_id=${encodeURIComponent(subId)}`
 * với `subId` gồm `[subIdAppTag, placement, slot, colorId, gender]` nối bằng dấu `-`.
 * Nếu URL đã là link rút gọn `s.shopee.vn` hoặc `shope.ee` thì giữ nguyên 100%.
 */
export function buildShopeeAffiliateUrl(
  originLink: string,
  context?: ShopeeAffiliateContext
): string {
  const safeOrigin = isSafeHttpsUrl(originLink)
    ? originLink.trim()
    : SHOPEE_AFFILIATE_CONFIG.baseSearchUrl;

  if (isPreShortenedShopeeUrl(safeOrigin)) {
    return safeOrigin;
  }

  const subId = [
    sanitizeSubIdPart(SHOPEE_AFFILIATE_CONFIG.subIdAppTag) || 'appphoido',
    sanitizeSubIdPart(context?.placement || 'general'),
    sanitizeSubIdPart(context?.slot),
    sanitizeSubIdPart(context?.colorId),
    sanitizeSubIdPart(context?.gender),
  ]
    .filter(Boolean)
    .slice(0, 5)
    .join('-');

  // Ưu tiên template mạng trung gian (AccessTrade / Ecomobi) nếu chủ app có cấu hình
  const networkTemplate = SHOPEE_AFFILIATE_CONFIG.networkDeeplinkTemplate.trim();
  if (networkTemplate && isSafeHttpsUrl(networkTemplate)) {
    if (networkTemplate.includes('{{ENCODED_URL}}')) {
      return networkTemplate
        .replace(/\{\{ENCODED_URL\}\}/g, encodeURIComponent(safeOrigin))
        .replace(/\{\{RAW_URL\}\}/g, safeOrigin)
        .replace(/\{\{SUB_ID\}\}/g, encodeURIComponent(subId));
    }
    const sep = networkTemplate.includes('?') ? '&' : '?';
    return `${networkTemplate}${sep}url=${encodeURIComponent(safeOrigin)}`;
  }

  const affiliateId = SHOPEE_AFFILIATE_CONFIG.affiliateId.trim();
  const redirEndpoint = SHOPEE_AFFILIATE_CONFIG.redirEndpoint.trim();
  if (affiliateId && isSafeHttpsUrl(redirEndpoint)) {
    return `${redirEndpoint}?origin_link=${encodeURIComponent(
      safeOrigin
    )}&affiliate_id=${encodeURIComponent(affiliateId)}&sub_id=${encodeURIComponent(
      subId
    )}`;
  }

  return safeOrigin;
}

export function buildShopeeSearchUrl(
  keyword: string,
  context?: ShopeeAffiliateContext
): string {
  const rawSearchUrl = `${SHOPEE_AFFILIATE_CONFIG.baseSearchUrl}?keyword=${encodeURIComponent(
    keyword
  )}`;
  return buildShopeeAffiliateUrl(rawSearchUrl, context);
}

export function buildTikTokShopShowcaseUrl(): string | null {
  const showcase = TIKTOK_SHOP_CONFIG.showcaseUrl.trim();
  return isSafeHttpsUrl(showcase) ? showcase : null;
}

// =============================================================
// 4. ĐỀ XUẤT 2 TẦNG (TẦNG 1: CURATED + TẦNG 2: SMART SEARCH)
// =============================================================

function resolveQueryColorFamily(query: AffiliateQuery): string | undefined {
  if (query.colorFamily) return query.colorFamily;
  return FASHION_COLORS.find(c => c.id === query.colorId)?.category;
}

function getProductColorIds(product: AffiliateProduct): string[] {
  const raw = [
    product.colorId,
    ...(Array.isArray(product.colorIds) ? product.colorIds : []),
  ];
  return Array.from(new Set(raw.map(normalizeColorId).filter(Boolean)));
}

function getProductColorFamilies(product: AffiliateProduct): Set<string> {
  const families = new Set<string>();
  if (product.colorFamily) {
    families.add(product.colorFamily);
  }
  for (const id of getProductColorIds(product)) {
    const found = FASHION_COLORS.find(c => c.id === id);
    if (found) families.add(found.category);
  }
  return families;
}

function getProductSilhouettes(product: AffiliateProduct): string[] {
  const raw = [
    ...(product.silhouette ? [product.silhouette] : []),
    ...(Array.isArray(product.silhouettes) ? product.silhouettes : []),
  ];
  return Array.from(new Set(raw.filter(Boolean)));
}

export function getAffiliateRecommendations(
  query: AffiliateQuery
): AffiliateRecommendationResult {
  const keyword = buildVietnameseFashionKeyword(query);
  const normalizedQueryColorId = normalizeColorId(query.colorId);
  const queryFamily = resolveQueryColorFamily({
    ...query,
    colorId: normalizedQueryColorId,
  });

  const shopeeCtx: ShopeeAffiliateContext = {
    placement: query.placement,
    slot: query.slot,
    colorId: normalizedQueryColorId,
    gender: query.gender,
  };

  const curatedProducts = memoryCatalog
    .filter(product => {
      if (product.slot !== query.slot) return false;
      return product.gender === query.gender || product.gender === 'unisex';
    })
    .map(product => {
      const prodColorIds = getProductColorIds(product);
      const prodFamilies = getProductColorFamilies(product);
      const prodSilhouettes = getProductSilhouettes(product);

      let colorScore = 0;
      if (prodColorIds.includes(normalizedQueryColorId)) {
        colorScore = 5;
      } else if (queryFamily && prodFamilies.has(queryFamily)) {
        colorScore = 2;
      }

      const silhouetteScore =
        query.silhouette && prodSilhouettes.includes(query.silhouette) ? 3 : 0;
      const exactGenderTieBreak = product.gender === query.gender ? 0.5 : 0;

      const totalScore = colorScore + silhouetteScore + exactGenderTieBreak;
      return { product, colorScore, totalScore };
    })
    .filter(entry => entry.colorScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 3)
    .map(entry => ({
      ...entry.product,
      url:
        entry.product.platform === 'shopee'
          ? buildShopeeAffiliateUrl(entry.product.url, shopeeCtx)
          : entry.product.url,
    }));

  const shopeeUrl = buildShopeeSearchUrl(keyword, shopeeCtx);
  const tiktokShowcaseUrl = buildTikTokShopShowcaseUrl();

  return {
    keyword,
    curatedProducts,
    smartSearchLinks: {
      shopee: {
        platform: 'shopee',
        label: 'Tìm trên Shopee ↗',
        url: shopeeUrl,
        keyword,
      },
      tiktok: tiktokShowcaseUrl
        ? {
            platform: 'tiktok',
            label: 'TikTok Shop ↗',
            url: tiktokShowcaseUrl,
            keyword,
          }
        : null,
    },
  };
}

// =============================================================
// 5. MỞ LINK AN TOÀN & ĐẾM CLICK CỤC BỘ (`affiliate_stats_v1.json`)
// =============================================================

function createEmptyStats(): AffiliateStatsPayload {
  return {
    version: 1,
    totalClicks: 0,
    byPlatform: { shopee: 0, tiktok: 0 },
    bySlot: { top: 0, outerwear: 0, bottom: 0, shoes: 0 },
    byColorId: {},
    updatedAt: Date.now(),
  };
}

function parseStats(raw: string): AffiliateStatsPayload {
  try {
    const parsed = JSON.parse(raw) as Partial<AffiliateStatsPayload> | null;
    if (!parsed || typeof parsed !== 'object') return createEmptyStats();
    return {
      version: 1,
      totalClicks: typeof parsed.totalClicks === 'number' ? parsed.totalClicks : 0,
      byPlatform: {
        shopee: parsed.byPlatform?.shopee ?? 0,
        tiktok: parsed.byPlatform?.tiktok ?? 0,
      },
      bySlot: {
        top: parsed.bySlot?.top ?? 0,
        outerwear: parsed.bySlot?.outerwear ?? 0,
        bottom: parsed.bySlot?.bottom ?? 0,
        shoes: parsed.bySlot?.shoes ?? 0,
      },
      byColorId:
        parsed.byColorId && typeof parsed.byColorId === 'object'
          ? { ...parsed.byColorId }
          : {},
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return createEmptyStats();
  }
}

export async function loadAffiliateStats(): Promise<AffiliateStatsPayload> {
  if (memoryStats) return memoryStats;
  const raw = await readTextStorage(STATS_FILE, STATS_WEB_KEY);
  memoryStats = raw ? parseStats(raw) : createEmptyStats();
  return memoryStats;
}

async function recordAffiliateClick(meta?: AffiliateClickMeta): Promise<void> {
  try {
    const current = await loadAffiliateStats();
    const next: AffiliateStatsPayload = {
      version: 1,
      totalClicks: current.totalClicks + 1,
      byPlatform: {
        ...current.byPlatform,
        ...(meta?.platform
          ? { [meta.platform]: (current.byPlatform[meta.platform] ?? 0) + 1 }
          : {}),
      },
      bySlot: {
        ...current.bySlot,
        ...(meta?.slot
          ? { [meta.slot]: (current.bySlot[meta.slot] ?? 0) + 1 }
          : {}),
      },
      byColorId: {
        ...current.byColorId,
        ...(meta?.colorId
          ? { [meta.colorId]: (current.byColorId[meta.colorId] ?? 0) + 1 }
          : {}),
      },
      updatedAt: Date.now(),
    };
    memoryStats = next;
    await writeTextStorage(STATS_FILE, STATS_WEB_KEY, JSON.stringify(next));
  } catch {
    // Không bao giờ chặn trải nghiệm mở link vì lỗi ghi thống kê
  }
}

export async function openAffiliateUrl(
  url: string,
  meta?: AffiliateClickMeta
): Promise<boolean> {
  const trimmed = url.trim();
  if (!isSafeHttpsUrl(trimmed)) {
    return false;
  }

  void recordAffiliateClick(meta);

  try {
    await Linking.openURL(trimmed);
    return true;
  } catch {
    return false;
  }
}
