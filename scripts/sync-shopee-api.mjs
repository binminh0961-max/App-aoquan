// scripts/sync-shopee-api.mjs
/**
 * CHẾ ĐỘ 1 — ĐỒNG BỘ TỰ ĐỘNG 100% QUA SHOPEE AFFILIATE OPEN API (GraphQL)
 *
 * Bảo mật bắt buộc:
 * - Đọc `SHOPEE_APP_ID` và `SHOPEE_APP_SECRET` từ file `.env.local` ở máy tính
 *   (hoặc biến môi trường). TUYỆT ĐỐI KHÔNG đưa khóa vào mã nguồn app mobile.
 * - Dùng API chính thức `https://open-api.affiliate.shopee.vn/graphql` với chữ ký:
 *   `SHA256(AppId + Timestamp + Payload + Secret)`.
 * - Giữ nguyên 100% `offerLink` (`https://s.shopee.vn/...`) trả về từ Shopee.
 *
 * Chạy: npm run affiliate:sync-api
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  classifyProduct,
  isValidDirectShortUrl,
  loadDotEnvLocal,
  printCoverageReport,
} from './affiliateClassifier.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(__dirname, 'output', 'catalog.json');

const SHOPEE_GRAPHQL_ENDPOINT = 'https://open-api.affiliate.shopee.vn/graphql';

/**
 * 24 từ khóa cốt lõi phủ đủ Nam/Nữ × Áo/Khoác/Quần/Váy/Giày × 6 nhóm màu basic bán chạy nhất.
 */
const CORE_SEARCH_SEEDS = [
  // Áo Nam & Nữ
  { keyword: 'áo thun nam trắng', genderHint: 'male' },
  { keyword: 'áo thun nam đen', genderHint: 'male' },
  { keyword: 'áo polo nam xanh navy', genderHint: 'male' },
  { keyword: 'áo sơ mi nam xanh lam', genderHint: 'male' },
  { keyword: 'áo baby tee nữ trắng kem', genderHint: 'female' },
  { keyword: 'áo thun nữ đen', genderHint: 'female' },
  { keyword: 'áo kiểu nữ đỏ đô', genderHint: 'female' },
  { keyword: 'áo sơ mi nữ xanh bơ', genderHint: 'female' },

  // Áo khoác Nam & Nữ
  { keyword: 'áo khoác blazer nam đen', genderHint: 'male' },
  { keyword: 'áo khoác kaki nam xanh rêu', genderHint: 'male' },
  { keyword: 'áo khoác blazer nữ be', genderHint: 'female' },
  { keyword: 'áo khoác blazer nữ đen', genderHint: 'female' },

  // Quần & Váy Nam & Nữ
  { keyword: 'quần ống suông nam be', genderHint: 'male' },
  { keyword: 'quần tây ống suông nam đen', genderHint: 'male' },
  { keyword: 'quần jean nam xanh đậm', genderHint: 'male' },
  { keyword: 'quần short nam kaki be', genderHint: 'male' },
  { keyword: 'quần ống suông nữ be cát', genderHint: 'female' },
  { keyword: 'quần ống suông nữ đen', genderHint: 'female' },
  { keyword: 'quần jean nữ xanh cạp cao', genderHint: 'female' },
  { keyword: 'chân váy chữ a nữ đen', genderHint: 'female' },

  // Giày Nam & Nữ
  { keyword: 'giày sneaker trắng', genderHint: 'unisex' },
  { keyword: 'giày loafer nam nâu', genderHint: 'male' },
  { keyword: 'giày cao gót nữ kem', genderHint: 'female' },
  { keyword: 'giày cao gót nữ đen', genderHint: 'female' },
];

const PRODUCT_OFFER_V2_QUERY = `
query ProductOfferV2($keyword: String!, $limit: Int!, $sortType: Int!) {
  productOfferV2(
    keyword: $keyword
    listType: 0
    sortType: $sortType
    page: 1
    limit: $limit
  ) {
    nodes {
      itemId
      productName
      commissionRate
      priceMin
      priceMax
      ratingStar
      sales
      imageUrl
      shopName
      shopType
      offerLink
    }
  }
}
`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function deriveShopBadge(node) {
  const shopTypes = Array.isArray(node.shopType) ? node.shopType : [];
  if (shopTypes.includes(1) || /mall/i.test(String(node.shopName || ''))) {
    return 'Shopee Mall';
  }
  if (shopTypes.includes(2) || shopTypes.includes(4)) {
    return 'Yêu thích+';
  }
  const commRate = Number(node.commissionRate || 0);
  if (commRate >= 0.08) {
    return 'Hoa hồng Xtra';
  }
  return 'Yêu thích+';
}

async function queryShopeeProductOffer({ appId, appSecret, keyword, limit = 6 }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    query: PRODUCT_OFFER_V2_QUERY,
    variables: {
      keyword,
      limit,
      sortType: 2, // 2 = Item Sold Desc (ưu tiên sản phẩm bán chạy)
    },
  });

  const signature = crypto
    .createHash('sha256')
    .update(`${appId}${timestamp}${payload}${appSecret}`)
    .digest('hex');

  const response = await fetch(SHOPEE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    const firstMsg = json.errors[0]?.message || 'GraphQL error';
    throw new Error(firstMsg);
  }

  return json?.data?.productOfferV2?.nodes || [];
}

function printSetupGuide() {
  console.log('\n⚠️  Chưa tìm thấy SHOPEE_APP_ID hoặc SHOPEE_APP_SECRET trong file `.env.local`.');
  console.log('\nHướng dẫn kích hoạt Shopee Affiliate Open API:');
  console.log('  1. Đăng nhập https://affiliate.shopee.vn -> vào mục "Open API" (hoặc "Công cụ" -> "Open API").');
  console.log('  2. Lấy cặp khóa AppId và Secret.');
  console.log('  3. Tạo file `.env.local` ngay tại thư mục gốc D:\\App-aoquan với nội dung:');
  console.log('       SHOPEE_APP_ID=your_app_id');
  console.log('       SHOPEE_APP_SECRET=your_app_secret');
  console.log('  4. Chạy lại lệnh: npm run affiliate:sync-api');
  console.log('\n💡 Mẹo: Nếu tài khoản chưa mở Open API, hãy dùng Chế độ 2 (CSV) ngay lập tức:');
  console.log('       npm run affiliate:import-csv\n');
}

async function main() {
  const envLocal = loadDotEnvLocal(PROJECT_ROOT);
  const appId = (process.env.SHOPEE_APP_ID || envLocal.SHOPEE_APP_ID || '').trim();
  const appSecret = (process.env.SHOPEE_APP_SECRET || envLocal.SHOPEE_APP_SECRET || '').trim();

  if (!appId || !appSecret) {
    printSetupGuide();
    process.exit(0);
  }

  console.log(`🚀 Bắt đầu đồng bộ Shopee Affiliate Open API (${CORE_SEARCH_SEEDS.length} từ khóa cốt lõi)...`);

  const seenItemIds = new Set();
  const seenUrls = new Set();
  const catalog = [];

  for (let i = 0; i < CORE_SEARCH_SEEDS.length; i++) {
    const seed = CORE_SEARCH_SEEDS[i];
    process.stdout.write(`  [${i + 1}/${CORE_SEARCH_SEEDS.length}] "${seed.keyword}"... `);

    try {
      const nodes = await queryShopeeProductOffer({
        appId,
        appSecret,
        keyword: seed.keyword,
        limit: 6,
      });

      // Ưu tiên sản phẩm có đánh giá tốt (>= 4.5), có offerLink rút gọn hợp lệ & hoa hồng cao
      const rankedNodes = nodes
        .filter(n => n && n.itemId && isValidDirectShortUrl(n.offerLink))
        .filter(n => {
          const rating = Number(n.ratingStar || 0);
          return rating === 0 || rating >= 4.5;
        })
        .sort((a, b) => {
          const scoreA = Number(a.commissionRate || 0) * 1000 + Math.log10(Number(a.sales || 1) + 1);
          const scoreB = Number(b.commissionRate || 0) * 1000 + Math.log10(Number(b.sales || 1) + 1);
          return scoreB - scoreA;
        });

      let added = 0;
      for (const node of rankedNodes) {
        if (added >= 2) break; // Tối đa 2 sản phẩm tốt nhất cho mỗi từ khóa
        const itemKey = String(node.itemId);
        const offerLink = String(node.offerLink).trim();
        if (seenItemIds.has(itemKey) || seenUrls.has(offerLink)) {
          continue;
        }

        const classified = classifyProduct({
          id: `sp-${itemKey}`,
          title: node.productName,
          platform: 'shopee',
          shortUrl: offerLink, // GIỮ NGUYÊN 100% offerLink chính chủ
          imageUrl: node.imageUrl,
          priceLabel: node.priceMin ? Number(node.priceMin) : undefined,
          shopBadge: deriveShopBadge(node),
          contextHint: seed.keyword,
        });

        if (classified) {
          seenItemIds.add(itemKey);
          seenUrls.add(offerLink);
          catalog.push(classified);
          added += 1;
        }
      }

      console.log(`+${added} sản phẩm`);
    } catch (err) {
      console.log(`lỗi (${err instanceof Error ? err.message : String(err)})`);
    }

    if (i < CORE_SEARCH_SEEDS.length - 1) {
      await sleep(350);
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  console.log(`\n✅ Đã xuất ${catalog.length} sản phẩm chuẩn AffiliateProduct[] ra:`);
  console.log(`   ${OUTPUT_PATH}`);
  printCoverageReport(catalog);
}

main().catch(err => {
  console.error('❌ Lỗi khi chạy sync-shopee-api:', err instanceof Error ? err.message : err);
  process.exit(1);
});
