// src/config/affiliateConfig.ts
/**
 * Cấu hình tập trung cho Affiliate Engine 2 tầng (Shopee Affiliate `an_redir` & TikTok Shop).
 *
 * LƯU Ý ANDROID 11+:
 * Toàn bộ đường dẫn sử dụng chuẩn HTTPS Universal Link (`https://...`),
 * KHÔNG dùng custom scheme (`shopee://`, `snssdk://`) để mở thẳng app Shopee/TikTok mượt mà.
 */

import { FashionCategory } from '../constants/fashionColors';
import { Gender, OutfitSlot } from '../services/lookbookStorage';
import { SilhouetteId } from '../types/outfit';

export type AffiliatePlatform = 'shopee' | 'tiktok';
export type AffiliateGender = Gender | 'unisex';

export interface AffiliateProduct {
  id: string;
  title: string;
  gender: AffiliateGender;
  slot: OutfitSlot;
  silhouette?: SilhouetteId | string;
  silhouettes?: (SilhouetteId | string)[];
  colorId: string; // Khớp chính xác id trong src/constants/fashionColors.ts
  colorIds?: string[];
  colorHex: string;
  colorFamily: FashionCategory;
  platform: AffiliatePlatform;
  priceLabel: string;
  tag?: string;
  imageUrl?: string;
  url: string; // URL https://shopee.vn/... (tự bọc qua an_redir) hoặc link rút gọn https://s.shopee.vn/... / https://vt.tiktok.com/...
}

/**
 * URL JSON danh mục sản phẩm từ xa (VD: link GitHub Raw JSON).
 * - Để trống '' mặc định -> dùng LOCAL_SEED_CATALOG ngay lập tức (hoạt động 100% offline).
 * - Khi điền URL https://... -> app tự động tải nền & lưu cache 24 giờ.
 */
export const REMOTE_AFFILIATE_CATALOG_URL = '';

/**
 * Cấu hình Shopee Affiliate chính thức qua endpoint `https://s.shopee.vn/an_redir`.
 * Tự động gắn `affiliate_id` và `sub_id` (`appphoido-<placement>-<slot>-<colorId>-<gender>`)
 * cho mọi đường dẫn `https://shopee.vn/...`.
 */
export const SHOPEE_AFFILIATE_CONFIG = {
  redirEndpoint: 'https://s.shopee.vn/an_redir',
  baseSearchUrl: 'https://shopee.vn/search',
  /** Affiliate ID chính thức từ affiliate.shopee.vn */
  affiliateId: '17358150039',
  /** Tiền tố sub_id để theo dõi trong Báo cáo Shopee Affiliate (không dùng dấu '-') */
  subIdAppTag: 'appphoido',
  /** Tùy chọn: Nếu dùng mạng trung gian (AccessTrade/Ecomobi), dán template chứa {{ENCODED_URL}} */
  networkDeeplinkTemplate: '',
} as const;

/**
 * Cấu hình TikTok Shop.
 * - showcaseUrl: Dán link trang Showcase / Giỏ hàng TikTok Shop cá nhân (https://...) nếu muốn hiện thêm nút TikTok Shop ở Tầng 2.
 * - Để trống '' -> ẩn nút TikTok Shop ở Tầng 2, dồn 100% lưu lượng tìm nhanh về Shopee đã gắn affiliate_id.
 */
export const TIKTOK_SHOP_CONFIG = {
  showcaseUrl: '',
} as const;

/**
 * Danh mục hạt giống 16 món cơ bản (Nam, Nữ & Unisex) dùng đúng colorId trong fashionColors.ts
 * và đúng key silhouette trong src/types/outfit.ts.
 * Mọi link `https://shopee.vn/search?keyword=...` sẽ tự động bọc qua `https://s.shopee.vn/an_redir`
 * kèm `affiliate_id=17358150039` khi trả về cho UI.
 */
export const LOCAL_SEED_CATALOG: AffiliateProduct[] = [
  // ================= ÁO (TOP) =================
  {
    id: 'seed-top-tshirt-white',
    title: 'Áo thun cotton cổ tròn Trắng Tinh form basic',
    gender: 'unisex',
    slot: 'top',
    silhouette: 'tshirt',
    colorId: 'wb-1',
    colorHex: '#FFFFFF',
    colorFamily: 'white_beige',
    platform: 'shopee',
    priceLabel: '149.000đ',
    tag: 'Basic bán chạy',
    url: 'https://shopee.vn/search?keyword=%C3%A1o%20thun%20tr%E1%BA%AFng%20cotton%20basic',
  },
  {
    id: 'seed-top-tshirt-black',
    title: 'Áo thun cotton Đen Than cổ tròn đứng form',
    gender: 'unisex',
    slot: 'top',
    silhouette: 'tshirt',
    colorId: 'gb-1',
    colorHex: '#111827',
    colorFamily: 'gray_black',
    platform: 'shopee',
    priceLabel: '159.000đ',
    tag: 'Dễ phối mọi quần',
    url: 'https://shopee.vn/search?keyword=%C3%A1o%20thun%20%C4%91en%20cotton%20basic',
  },
  {
    id: 'seed-top-polo-navy-male',
    title: 'Áo Polo nam Xanh Navy cổ điển vải cá sấu',
    gender: 'male',
    slot: 'top',
    silhouette: 'polo',
    colorId: 'bn-2',
    colorHex: '#1B2A4A',
    colorFamily: 'blue_navy',
    platform: 'shopee',
    priceLabel: '249.000đ',
    tag: 'Đi làm & dạo phố',
    url: 'https://shopee.vn/search?keyword=%C3%A1o%20polo%20nam%20xanh%20navy',
  },
  {
    id: 'seed-top-babytee-cream-female',
    title: 'Áo Baby Tee nữ Trắng Kem tôn dáng trẻ trung',
    gender: 'female',
    slot: 'top',
    silhouette: 'baby_tee',
    colorId: 'wb-3',
    colorHex: '#FFF9E6',
    colorFamily: 'white_beige',
    platform: 'shopee',
    priceLabel: '129.000đ',
    tag: 'Tôn dáng trẻ trung',
    url: 'https://shopee.vn/search?keyword=%C3%A1o%20baby%20tee%20n%E1%BB%AF%20tr%E1%BA%AFng%20kem',
  },

  // ================= ÁO KHOÁC (OUTERWEAR) =================
  {
    id: 'seed-outer-blazer-beige',
    title: 'Áo khoác Blazer Be Cát 2 lớp chuẩn form đứng',
    gender: 'unisex',
    slot: 'outerwear',
    silhouette: 'blazer',
    colorId: 'wb-5',
    colorHex: '#D8C3A5',
    colorFamily: 'white_beige',
    platform: 'shopee',
    priceLabel: '459.000đ',
    tag: 'Layering thanh lịch',
    url: 'https://shopee.vn/search?keyword=%C3%A1o%20kho%C3%A1c%20blazer%20m%C3%A0u%20be',
  },
  {
    id: 'seed-outer-blazer-black',
    title: 'Áo khoác Blazer Đen Than vai vuông sang trọng',
    gender: 'unisex',
    slot: 'outerwear',
    silhouette: 'blazer',
    colorId: 'gb-1',
    colorHex: '#111827',
    colorFamily: 'gray_black',
    platform: 'shopee',
    priceLabel: '489.000đ',
    tag: 'Tối giản công sở',
    url: 'https://shopee.vn/search?keyword=%C3%A1o%20kho%C3%A1c%20blazer%20%C4%91en',
  },

  // ================= QUẦN & VÁY (BOTTOM) =================
  {
    id: 'seed-bottom-wide-beige-male',
    title: 'Quần ống suông nam Be Cát cạp cao ly trước',
    gender: 'male',
    slot: 'bottom',
    silhouette: 'wide_pants',
    colorId: 'wb-5',
    colorHex: '#D8C3A5',
    colorFamily: 'white_beige',
    platform: 'shopee',
    priceLabel: '289.000đ',
    tag: 'Hack dáng nam',
    url: 'https://shopee.vn/search?keyword=qu%E1%BA%A7n%20%E1%BB%91ng%20su%C3%B4ng%20nam%20be%20c%C3%A1t',
  },
  {
    id: 'seed-bottom-wide-beige-female',
    title: 'Quần ống suông nữ Be Cát vải tuyết mưa rủ đẹp',
    gender: 'female',
    slot: 'bottom',
    silhouette: 'wide_pants',
    colorId: 'wb-5',
    colorHex: '#D8C3A5',
    colorFamily: 'white_beige',
    platform: 'shopee',
    priceLabel: '249.000đ',
    tag: 'Tôn eo hack chân',
    url: 'https://shopee.vn/search?keyword=qu%E1%BA%A7n%20%E1%BB%91ng%20su%C3%B4ng%20n%E1%BB%AF%20be%20c%C3%A1t',
  },
  {
    id: 'seed-bottom-wide-navy-male',
    title: 'Quần tây ống suông nam Xanh Navy Đậm lịch lãm',
    gender: 'male',
    slot: 'bottom',
    silhouette: 'wide_pants',
    colorId: 'bn-1',
    colorHex: '#0B192C',
    colorFamily: 'blue_navy',
    platform: 'shopee',
    priceLabel: '319.000đ',
    tag: 'Chuẩn smart-casual',
    url: 'https://shopee.vn/search?keyword=qu%E1%BA%A7n%20t%C3%A2y%20%E1%BB%91ng%20su%C3%B4ng%20nam%20xanh%20navy',
  },
  {
    id: 'seed-bottom-wide-black',
    title: 'Quần ống suông Đen Than cạp cao không nhăn',
    gender: 'unisex',
    slot: 'bottom',
    silhouette: 'wide_pants',
    colorId: 'gb-1',
    colorHex: '#111827',
    colorFamily: 'gray_black',
    platform: 'shopee',
    priceLabel: '259.000đ',
    tag: 'Quốc dân dễ mặc',
    url: 'https://shopee.vn/search?keyword=qu%E1%BA%A7n%20%E1%BB%91ng%20su%C3%B4ng%20%C4%91en',
  },
  {
    id: 'seed-bottom-jeans-blue-male',
    title: 'Quần Jean nam Xanh Denim Đậm ống đứng cổ điển',
    gender: 'male',
    slot: 'bottom',
    silhouette: 'jeans',
    colorId: 'bn-3',
    colorHex: '#1E3A8A',
    colorFamily: 'blue_navy',
    platform: 'shopee',
    priceLabel: '349.000đ',
    tag: 'Denim bền màu',
    url: 'https://shopee.vn/search?keyword=qu%E1%BA%A7n%20jean%20nam%20xanh%20denim%20%C4%91%E1%BA%ADm',
  },
  {
    id: 'seed-bottom-jeans-blue-female',
    title: 'Quần Jean nữ Xanh Denim Cơ Bản cạp cao ống suông',
    gender: 'female',
    slot: 'bottom',
    silhouette: 'jeans',
    colorId: 'bn-4',
    colorHex: '#3B82F6',
    colorFamily: 'blue_navy',
    platform: 'shopee',
    priceLabel: '299.000đ',
    tag: 'Form đứng hack dáng',
    url: 'https://shopee.vn/search?keyword=qu%E1%BA%A7n%20jean%20n%E1%BB%AF%20xanh%20denim%20c%E1%BA%A1p%20cao',
  },
  {
    id: 'seed-bottom-skirt-beige-female',
    title: 'Chân váy chữ A nữ Be Sáng cạp cao thanh lịch',
    gender: 'female',
    slot: 'bottom',
    silhouette: 'a_line_skirt',
    colorId: 'wb-6',
    colorHex: '#E8DCB8',
    colorFamily: 'white_beige',
    platform: 'shopee',
    priceLabel: '229.000đ',
    tag: 'Nữ tính công sở',
    url: 'https://shopee.vn/search?keyword=ch%C3%A2n%20v%C3%A1y%20ch%E1%BB%AF%20a%20n%E1%BB%AF%20m%C3%A0u%20be',
  },

  // ================= GIÀY (SHOES) =================
  {
    id: 'seed-shoes-sneaker-white',
    title: 'Giày Sneaker Trắng Tinh đế bằng tối giản',
    gender: 'unisex',
    slot: 'shoes',
    silhouette: 'sneaker',
    colorId: 'wb-1',
    colorHex: '#FFFFFF',
    colorFamily: 'white_beige',
    platform: 'shopee',
    priceLabel: '399.000đ',
    tag: 'Cân mọi outfit',
    url: 'https://shopee.vn/search?keyword=gi%C3%A0y%20sneaker%20tr%E1%BA%AFng%20basic',
  },
  {
    id: 'seed-shoes-loafer-brown-male',
    title: 'Giày Loafer da nam Nâu Cà Phê / Mocha đế êm',
    gender: 'male',
    slot: 'shoes',
    silhouette: 'loafer',
    silhouettes: ['loafer', 'dress_shoes'],
    colorId: 'bc-2',
    colorHex: '#362B28',
    colorFamily: 'brown_camel',
    platform: 'shopee',
    priceLabel: '520.000đ',
    tag: 'Điểm nhấn 10%',
    url: 'https://shopee.vn/search?keyword=gi%C3%A0y%20loafer%20nam%20n%C3%A2u%20mocha',
  },
  {
    id: 'seed-shoes-heels-black-female',
    title: 'Giày cao gót mũi nhọn nữ Đen Than 5cm tôn dáng',
    gender: 'female',
    slot: 'shoes',
    silhouette: 'heels',
    colorId: 'gb-1',
    colorHex: '#111827',
    colorFamily: 'gray_black',
    platform: 'shopee',
    priceLabel: '349.000đ',
    tag: 'Đi làm & tiệc tối',
    url: 'https://shopee.vn/search?keyword=gi%C3%A0y%20cao%20g%C3%B3t%20n%E1%BB%AF%20m%C3%A0u%20%C4%91en',
  },
];
