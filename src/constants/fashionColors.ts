// src/constants/fashionColors.ts
import { hexToLab, Lab } from '../services/ColorEngine';

export type FashionCategory =
  | 'white_beige'
  | 'gray_black'
  | 'blue_navy'
  | 'green'
  | 'red_pink'
  | 'brown_camel'
  | 'yellow_purple';

export interface FashionColor {
  id: string;
  name: string;
  hex: string;
  category: FashionCategory;
  lab: Lab;
  nearbyHexes: string[]; // 3 nearby shades for lighting calibration / fine-tuning
}

interface RawFashionColor {
  id: string;
  name: string;
  hex: string;
  category: FashionCategory;
  nearbyHexes: string[];
}

const RAW_FASHION_COLORS: RawFashionColor[] = [
  // ================= 1. TRẮNG / KEM / BE =================
  {
    id: 'wb-1',
    name: 'Trắng Tinh',
    hex: '#FFFFFF',
    category: 'white_beige',
    nearbyHexes: ['#F9FAFB', '#F3F4F6', '#E5E7EB'],
  },
  {
    id: 'wb-2',
    name: 'Trắng Sữa',
    hex: '#F8F9FA',
    category: 'white_beige',
    nearbyHexes: ['#FFFFFF', '#F1F3F5', '#E9ECEF'],
  },
  {
    id: 'wb-3',
    name: 'Trắng Kem (Off-White)',
    hex: '#FFF9E6',
    category: 'white_beige',
    nearbyHexes: ['#FDF4DB', '#F8EAC3', '#EFE0B1'],
  },
  {
    id: 'wb-4',
    name: 'Ngà Voi (Ivory)',
    hex: '#FFFFF0',
    category: 'white_beige',
    nearbyHexes: ['#FDFDF5', '#F5F5E6', '#EBEBD8'],
  },
  {
    id: 'wb-5',
    name: 'Be Cát (Sand Beige)',
    hex: '#D8C3A5',
    category: 'white_beige',
    nearbyHexes: ['#E6D6BD', '#C9B18F', '#BBA27E'],
  },
  {
    id: 'wb-6',
    name: 'Be Sáng (Light Beige)',
    hex: '#E8DCB8',
    category: 'white_beige',
    nearbyHexes: ['#F2E8CD', '#DBCDA4', '#CEBD8D'],
  },

  // ================= 2. XÁM / ĐEN =================
  {
    id: 'gb-1',
    name: 'Đen Than',
    hex: '#111827',
    category: 'gray_black',
    nearbyHexes: ['#1F2937', '#0F172A', '#030712'],
  },
  {
    id: 'gb-2',
    name: 'Đen Nhám (Jet Black)',
    hex: '#1E1E1E',
    category: 'gray_black',
    nearbyHexes: ['#2A2A2A', '#141414', '#0A0A0A'],
  },
  {
    id: 'gb-3',
    name: 'Xám Chì (Charcoal)',
    hex: '#374151',
    category: 'gray_black',
    nearbyHexes: ['#4B5563', '#2D3748', '#1F2937'],
  },
  {
    id: 'gb-4',
    name: 'Xám Ghi (Slate Gray)',
    hex: '#6B7280',
    category: 'gray_black',
    nearbyHexes: ['#9CA3AF', '#4B5563', '#374151'],
  },
  {
    id: 'gb-5',
    name: 'Xám Bạc (Silver)',
    hex: '#9CA3AF',
    category: 'gray_black',
    nearbyHexes: ['#D1D5DB', '#6B7280', '#4B5563'],
  },
  {
    id: 'gb-6',
    name: 'Xám Khói (Smoke Gray)',
    hex: '#D1D5DB',
    category: 'gray_black',
    nearbyHexes: ['#E5E7EB', '#9CA3AF', '#6B7280'],
  },

  // ================= 3. XANH DƯƠNG / NAVY / DENIM =================
  {
    id: 'bn-1',
    name: 'Xanh Navy Đậm',
    hex: '#0B192C',
    category: 'blue_navy',
    nearbyHexes: ['#1E3E62', '#1B2A4A', '#060E18'],
  },
  {
    id: 'bn-2',
    name: 'Xanh Navy Cổ Điển',
    hex: '#1B2A4A',
    category: 'blue_navy',
    nearbyHexes: ['#283D69', '#15213A', '#0F182A'],
  },
  {
    id: 'bn-3',
    name: 'Xanh Denim Đậm',
    hex: '#1E3A8A',
    category: 'blue_navy',
    nearbyHexes: ['#2563EB', '#172554', '#1E40AF'],
  },
  {
    id: 'bn-4',
    name: 'Xanh Denim Cơ Bản',
    hex: '#3B82F6',
    category: 'blue_navy',
    nearbyHexes: ['#60A5FA', '#2563EB', '#1D4ED8'],
  },
  {
    id: 'bn-5',
    name: 'Xanh Coban (Royal Blue)',
    hex: '#0047AB',
    category: 'blue_navy',
    nearbyHexes: ['#1D4ED8', '#003380', '#2563EB'],
  },
  {
    id: 'bn-6',
    name: 'Xanh Lam Nhạt (Sky Blue)',
    hex: '#7DD3FC',
    category: 'blue_navy',
    nearbyHexes: ['#BAE6FD', '#38BDF8', '#0284C7'],
  },
  {
    id: 'bn-7',
    name: 'Xanh Baby Pastel',
    hex: '#BAE6FD',
    category: 'blue_navy',
    nearbyHexes: ['#E0F2FE', '#7DD3FC', '#38BDF8'],
  },

  // ================= 4. XANH LÁ / OLIVE / RÊU / CỔ VỊT =================
  {
    id: 'gr-1',
    name: 'Xanh Olive',
    hex: '#556B2F',
    category: 'green',
    nearbyHexes: ['#6B863B', '#485C27', '#3D4F1F'],
  },
  {
    id: 'gr-2',
    name: 'Xanh Rêu (Moss Green)',
    hex: '#4A5D23',
    category: 'green',
    nearbyHexes: ['#5E752D', '#3B4A1C', '#2E3B15'],
  },
  {
    id: 'gr-3',
    name: 'Xanh Cổ Vịt (Teal)',
    hex: '#0F4C81',
    category: 'green',
    nearbyHexes: ['#165E9E', '#0A3B66', '#062B4C'],
  },
  {
    id: 'gr-4',
    name: 'Xanh Cổ Vịt Đậm (Dark Teal)',
    hex: '#0A3641',
    category: 'green',
    nearbyHexes: ['#114D5C', '#07262E', '#041B21'],
  },
  {
    id: 'gr-5',
    name: 'Xanh Bơ (Sage Green)',
    hex: '#9CAF88',
    category: 'green',
    nearbyHexes: ['#B3C3A1', '#859871', '#70835D'],
  },
  {
    id: 'gr-6',
    name: 'Xanh Mint (Bạc Hà)',
    hex: '#6EE7B7',
    category: 'green',
    nearbyHexes: ['#A7F3D0', '#34D399', '#10B981'],
  },
  {
    id: 'gr-7',
    name: 'Xanh Lục Bảo (Emerald)',
    hex: '#047857',
    category: 'green',
    nearbyHexes: ['#059669', '#065F46', '#064E3B'],
  },

  // ================= 5. ĐỎ / HỒNG / CAM ĐẤT =================
  {
    id: 'rp-1',
    name: 'Đỏ Đô (Burgundy)',
    hex: '#8B0000',
    category: 'red_pink',
    nearbyHexes: ['#A51D1D', '#730000', '#590000'],
  },
  {
    id: 'rp-2',
    name: 'Đỏ Rượu Vang (Wine Red)',
    hex: '#6A1A24',
    category: 'red_pink',
    nearbyHexes: ['#7F212D', '#54131B', '#3E0D13'],
  },
  {
    id: 'rp-3',
    name: 'Đỏ San Hô (Coral Red)',
    hex: '#F43F5E',
    category: 'red_pink',
    nearbyHexes: ['#FB7185', '#E11D48', '#BE123C'],
  },
  {
    id: 'rp-4',
    name: 'Đỏ Đất (Terracotta)',
    hex: '#A04030',
    category: 'red_pink',
    nearbyHexes: ['#B8503E', '#893425', '#6E281C'],
  },
  {
    id: 'rp-5',
    name: 'Cam Đất (Rust Orange)',
    hex: '#C25E34',
    category: 'red_pink',
    nearbyHexes: ['#D67349', '#A84E29', '#8E3F1F'],
  },
  {
    id: 'rp-6',
    name: 'Cam Cháy (Burnt Orange)',
    hex: '#D97706',
    category: 'red_pink',
    nearbyHexes: ['#F59E0B', '#B45309', '#92400E'],
  },
  {
    id: 'rp-7',
    name: 'Hồng Pastel',
    hex: '#F9A8D4',
    category: 'red_pink',
    nearbyHexes: ['#FBCFE8', '#F472B6', '#EC4899'],
  },
  {
    id: 'rp-8',
    name: 'Hồng Đất (Dusty Rose)',
    hex: '#C08081',
    category: 'red_pink',
    nearbyHexes: ['#D29798', '#AE6B6C', '#975657'],
  },
  {
    id: 'rp-9',
    name: 'Hồng Cánh Sen',
    hex: '#E11D48',
    category: 'red_pink',
    nearbyHexes: ['#F43F5E', '#BE123C', '#9F1239'],
  },

  // ================= 6. NÂU / CAMEL =================
  {
    id: 'bc-1',
    name: 'Nâu Socola',
    hex: '#4A2C1A',
    category: 'brown_camel',
    nearbyHexes: ['#5E3821', '#3B2214', '#2C180E'],
  },
  {
    id: 'bc-2',
    name: 'Nâu Cà Phê',
    hex: '#362B28',
    category: 'brown_camel',
    nearbyHexes: ['#473A36', '#28201E', '#1C1615'],
  },
  {
    id: 'bc-3',
    name: 'Nâu Camel (Lạc Đà)',
    hex: '#C19A6B',
    category: 'brown_camel',
    nearbyHexes: ['#D4B084', '#AD8454', '#997141'],
  },
  {
    id: 'bc-4',
    name: 'Nâu Bò (Tan)',
    hex: '#B87333',
    category: 'brown_camel',
    nearbyHexes: ['#CC8746', '#A16024', '#8A501C'],
  },
  {
    id: 'bc-5',
    name: 'Nâu Khói (Taupe)',
    hex: '#8C7D70',
    category: 'brown_camel',
    nearbyHexes: ['#A39486', '#75675B', '#5F5247'],
  },
  {
    id: 'bc-6',
    name: 'Nâu Hạt Dẻ (Chestnut)',
    hex: '#7B3F00',
    category: 'brown_camel',
    nearbyHexes: ['#944D03', '#643300', '#4F2700'],
  },

  // ================= 7. VÀNG / TÍM PASTEL =================
  {
    id: 'yp-1',
    name: 'Vàng Mù Tạt (Mustard)',
    hex: '#EAB308',
    category: 'yellow_purple',
    nearbyHexes: ['#FACC15', '#CA8A04', '#A16207'],
  },
  {
    id: 'yp-2',
    name: 'Vàng Bơ (Butter Yellow)',
    hex: '#FEF08A',
    category: 'yellow_purple',
    nearbyHexes: ['#FEF9C3', '#FDE047', '#EAB308'],
  },
  {
    id: 'yp-3',
    name: 'Tím Lavender',
    hex: '#A78BFA',
    category: 'yellow_purple',
    nearbyHexes: ['#C4B5FD', '#8B5CF6', '#7C3AED'],
  },
  {
    id: 'yp-4',
    name: 'Tím Mận (Plum)',
    hex: '#581C87',
    category: 'yellow_purple',
    nearbyHexes: ['#6B21A8', '#4C1D95', '#3B0764'],
  },
  {
    id: 'yp-5',
    name: 'Tím Pastel (Lilac)',
    hex: '#DDD6FE',
    category: 'yellow_purple',
    nearbyHexes: ['#EDE9FE', '#C4B5FD', '#A78BFA'],
  },
];

// Khởi tạo danh sách màu đầy đủ tọa độ CIELAB (L*, a*, b*) chuẩn xác
export const FASHION_COLORS: FashionColor[] = RAW_FASHION_COLORS.map(item => ({
  ...item,
  lab: hexToLab(item.hex),
}));

export const SAMPLE_FABRIC_IMAGES = [
  'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80', // Áo sơ mi trắng be
  'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=800&q=80', // Vải denim jean
  'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=800&q=80', // Quần áo nhiều màu
];
