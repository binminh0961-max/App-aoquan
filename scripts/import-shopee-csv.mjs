// scripts/import-shopee-csv.mjs
/**
 * CHẾ ĐỘ 2 — NHẬP FILE CSV HÀNG LOẠT (CHO MỌI TÀI KHOẢN AFFILIATE)
 *
 * Cách dùng:
 *   1. Đặt file CSV đã xuất từ Shopee Affiliate (hoặc tự điền theo mẫu) tại:
 *        scripts/input/shopee_links.csv
 *      (Nếu chưa có file thật, script tự chạy thử trên `scripts/input/shopee_links.sample.csv`).
 *   2. Hoặc truyền đường dẫn file tùy chọn:
 *        node scripts/import-shopee-csv.mjs path/to/your_file.csv
 *   3. Chạy:
 *        npm run affiliate:import-csv
 *
 * Kết quả:
 *   - Xuất `scripts/output/catalog.json` hợp lệ 100% theo `AffiliateProduct[]`.
 *   - Giữ nguyên 100% link rút gọn `https://s.shopee.vn/...` hoặc `https://vt.tiktok.com/...`.
 *   - In bảng thống kê độ phủ Nam/Nữ & 4 nhóm món (slot) trên Terminal.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyProduct,
  isValidDirectShortUrl,
  printCoverageReport,
  stripVietnameseAccents,
} from './affiliateClassifier.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_INPUT_CSV = path.join(__dirname, 'input', 'shopee_links.csv');
const SAMPLE_INPUT_CSV = path.join(__dirname, 'input', 'shopee_links.sample.csv');
const OUTPUT_JSON = path.join(__dirname, 'output', 'catalog.json');

// =============================================================
// 1. PARSER CSV CHUẨN RFC-4180 (HỖ TRỢ BOM, DẤU PHẨY & CHẤM PHẨY EXCEL)
// =============================================================

function detectDelimiter(headerLine) {
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === ',') commas++;
    else if (!inQuotes && ch === ';') semicolons++;
  }
  return semicolons > commas ? ';' : ',';
}

function parseCsvText(rawText) {
  const text = rawText.replace(/^\uFEFF/, ''); // Gỡ UTF-8 BOM nếu xuất từ Excel
  const firstNewline = text.search(/\r?\n/);
  const firstLine = firstNewline >= 0 ? text.slice(0, firstNewline) : text;
  const delimiter = detectDelimiter(firstLine);

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentField.trim());
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentField.trim());
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// =============================================================
// 2. ÁNH XẠ LINH HOẠT TÊN CỘT TIẾNG VIỆT & TIẾNG ANH
// =============================================================

const HEADER_ALIASES = {
  title: [
    'title',
    'ten san pham',
    'ten sp',
    'product name',
    'product_name',
    'item name',
    'name',
    'san pham',
  ],
  shortUrl: [
    'shorturl',
    'short url',
    'short link',
    'short_link',
    'link rut gon',
    'offer link',
    'offerlink',
    'offer_link',
    'affiliate link',
    'link affiliate',
    'url',
    'link',
  ],
  priceLabel: [
    'pricelabel',
    'price label',
    'price',
    'gia',
    'gia ban',
    'gia tham khao',
    'price min',
    'pricemin',
  ],
  imageUrl: [
    'imageurl',
    'image url',
    'image_url',
    'image',
    'hinh anh',
    'anh',
    'thumbnail',
    'thumb',
  ],
  platform: ['platform', 'san', 'kenh', 'channel'],
  shopBadge: ['shopbadge', 'shop badge', 'badge', 'nhan shop', 'tag', 'shop type'],
  id: ['id', 'item id', 'itemid', 'item_id', 'ma san pham'],
};

function normalizeHeader(header) {
  return stripVietnameseAccents(header)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildColumnIndexMap(headers) {
  const map = {};
  const normalizedHeaders = headers.map(normalizeHeader);

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalizedHeaders.findIndex(h => aliases.includes(h));
    if (idx !== -1) {
      map[field] = idx;
    }
  }

  // Fallback nếu header có dạng chứa từ khóa (VD: "Link rút gọn (Shopee)")
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (map[field] !== undefined) continue;
    const idx = normalizedHeaders.findIndex(h =>
      aliases.some(alias => alias.length >= 4 && h.includes(alias))
    );
    if (idx !== -1) {
      map[field] = idx;
    }
  }

  return map;
}

// =============================================================
// 3. CHẠY IMPORT & XUẤT scripts/output/catalog.json
// =============================================================

function resolveInputCsvPath() {
  const cliArg = process.argv[2];
  if (cliArg) {
    const resolved = path.resolve(process.cwd(), cliArg);
    if (!fs.existsSync(resolved)) {
      console.error(`❌ Không tìm thấy file CSV tại: ${resolved}`);
      process.exit(1);
    }
    return { csvPath: resolved, isSample: false };
  }

  if (fs.existsSync(DEFAULT_INPUT_CSV)) {
    return { csvPath: DEFAULT_INPUT_CSV, isSample: false };
  }

  if (fs.existsSync(SAMPLE_INPUT_CSV)) {
    return { csvPath: SAMPLE_INPUT_CSV, isSample: true };
  }

  console.error('❌ Không tìm thấy `scripts/input/shopee_links.csv` hoặc file mẫu.');
  process.exit(1);
}

function main() {
  const { csvPath, isSample } = resolveInputCsvPath();

  if (isSample) {
    console.log('ℹ️  Chưa có `scripts/input/shopee_links.csv` -> đang chạy thử trên file mẫu:');
    console.log(`   ${csvPath}`);
  } else {
    console.log(`📥 Đang nhập danh sách sản phẩm từ: ${csvPath}`);
  }

  const rawText = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsvText(rawText);

  if (rows.length < 2) {
    console.error('❌ File CSV trống hoặc chỉ có dòng tiêu đề.');
    process.exit(1);
  }

  const headers = rows[0];
  const colMap = buildColumnIndexMap(headers);

  if (colMap.title === undefined || colMap.shortUrl === undefined) {
    console.error(
      '❌ Không nhận diện được cột `title` (Tên sản phẩm) hoặc `shortUrl` (Link rút gọn).'
    );
    console.error(`   Các cột tìm thấy: ${headers.join(', ')}`);
    process.exit(1);
  }

  const seenUrls = new Set();
  const catalog = [];
  let skippedInvalidUrl = 0;
  let skippedDuplicate = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = row[colMap.title] || '';
    const shortUrl = (row[colMap.shortUrl] || '').trim();

    if (!title || !isValidDirectShortUrl(shortUrl)) {
      skippedInvalidUrl++;
      continue;
    }

    if (seenUrls.has(shortUrl)) {
      skippedDuplicate++;
      continue;
    }

    const classified = classifyProduct({
      id: colMap.id !== undefined ? row[colMap.id] : undefined,
      title,
      shortUrl, // GIỮ NGUYÊN 100%, TUYỆT ĐỐI KHÔNG CHỈNH SỬA
      priceLabel: colMap.priceLabel !== undefined ? row[colMap.priceLabel] : undefined,
      imageUrl: colMap.imageUrl !== undefined ? row[colMap.imageUrl] : undefined,
      platform: colMap.platform !== undefined ? row[colMap.platform] : undefined,
      shopBadge: colMap.shopBadge !== undefined ? row[colMap.shopBadge] : undefined,
    });

    if (classified) {
      seenUrls.add(shortUrl);
      catalog.push(classified);
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  console.log(`\n✅ Đã sinh file catalog chuẩn AffiliateProduct[]:`);
  console.log(`   ${OUTPUT_JSON}`);
  if (skippedInvalidUrl > 0 || skippedDuplicate > 0) {
    console.log(
      `   (Bỏ qua: ${skippedInvalidUrl} dòng thiếu tên/link rút gọn không hợp lệ, ${skippedDuplicate} dòng trùng link)`
    );
  }

  printCoverageReport(catalog);

  if (isSample) {
    console.log(
      '💡 Bước tiếp theo: Tạo file `scripts/input/shopee_links.csv` chứa link rút gọn thật rồi chạy lại `npm run affiliate:import-csv`.\n'
    );
  }
}

main();
