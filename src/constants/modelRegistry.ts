// src/constants/modelRegistry.ts
/**
 * Model Registry - Cổng đăng ký mô hình 3D (.glb) cho 3D Lookbook Studio
 *
 * KIẾN TRÚC HYBRID:
 * - Nếu một tổ hợp (gender, slot, silhouette) có đường dẫn `.glb` hợp lệ tại đây,
 *   `Outfit3DViewer` sẽ tự động tải model đó qua `GLTFLoader`, chuẩn hóa kích thước,
 *   giữ nguyên `normalMap` / `aoMap` gốc và áp màu vải động từ `OutfitEngine`.
 * - Nếu giá trị là `null` hoặc không tải được, `Outfit3DViewer` sẽ tự động sử dụng
 *   mô hình 3D Sculpted Ghost-Mannequin dựng sẵn với PBR Fabric Textures.
 *
 * HƯỚNG DẪN ĐẶT TÊN FILE KHI BỔ SUNG FILE `.glb` SAU NÀY:
 * Đặt file vào thư mục `assets/models/` theo quy ước:
 *   `{gender}_{slot}_{silhouette}.glb`
 *
 * Ví dụ:
 *   - assets/models/male_outerwear_blazer.glb
 *   - assets/models/male_outerwear_shirt.glb
 *   - assets/models/male_outerwear_hoodie.glb
 *   - assets/models/male_top_tshirt.glb
 *   - assets/models/male_bottom_wide_pants.glb
 *   - assets/models/female_bottom_a_line_skirt.glb
 *   - assets/models/female_shoes_boots.glb
 *
 * Lưu ý khi xuất `.glb` từ Blender / CLO3D / Marvelous Designer:
 *   - Chiều cao chuẩn nhân vật (không đầu): ~1.54m (đế giày đặt tại y = 0).
 *   - Để màu baseColor của vải là màu trắng (#FFFFFF) để màu từ OutfitEngine nhân vào chính xác.
 *   - Giữ lại normalMap và aoMap để bề mặt nếp gấp vải sắc nét nhất.
 */

import {
  OutfitSlotId,
  SilhouetteId,
  SilhouetteStyleType,
} from '../types/outfit';

export type ModelRegistryKey = `${SilhouetteStyleType}_${OutfitSlotId}_${SilhouetteId}`;

export interface ModelRegistryEntry {
  /** URL / đường dẫn file `.glb` (để `null` để dùng Sculpted 3D Ghost-Mannequin mặc định) */
  url: string | null;
  /** Tinh chỉnh vị trí Y bổ sung (m) nếu file .glb lệch gốc tọa độ */
  yOffset?: number;
  /** Tinh chỉnh tỉ lệ nếu file .glb không đúng hệ mét chuẩn */
  scale?: number;
}

export const MODEL_REGISTRY: Partial<Record<ModelRegistryKey, ModelRegistryEntry>> = {
  // ================= NAM (MALE) =================
  male_outerwear_blazer: { url: null },
  male_outerwear_shirt: { url: null },
  male_outerwear_hoodie: { url: null },

  male_top_tshirt: { url: null },
  male_top_polo: { url: null },
  male_top_shirt: { url: null },
  male_top_hoodie: { url: null },
  male_top_blazer: { url: null },

  male_bottom_wide_pants: { url: null },
  male_bottom_jeans: { url: null },
  male_bottom_shorts: { url: null },

  male_shoes_sneaker: { url: null },
  male_shoes_loafer: { url: null },
  male_shoes_dress_shoes: { url: null },
  male_shoes_boot: { url: null },

  // ================= NỮ (FEMALE) =================
  female_outerwear_blazer: { url: null },
  female_outerwear_shirt: { url: null },
  female_outerwear_hoodie: { url: null },

  female_top_baby_tee: { url: null },
  female_top_tshirt: { url: null },
  female_top_blouse: { url: null },
  female_top_shirt: { url: null },
  female_top_hoodie: { url: null },
  female_top_blazer: { url: null },

  female_bottom_wide_pants: { url: null },
  female_bottom_jeans: { url: null },
  female_bottom_shorts: { url: null },
  female_bottom_a_line_skirt: { url: null },
  female_bottom_mini_skirt: { url: null },

  female_shoes_sneaker: { url: null },
  female_shoes_loafer: { url: null },
  female_shoes_heels: { url: null },
  female_shoes_boot: { url: null },
};

export function getRegisteredModel(
  gender: SilhouetteStyleType,
  slot: OutfitSlotId,
  silhouette: SilhouetteId
): ModelRegistryEntry | null {
  const key: ModelRegistryKey = `${gender}_${slot}_${silhouette}`;
  const entry = MODEL_REGISTRY[key];
  if (!entry || !entry.url) {
    return null;
  }
  return entry;
}
