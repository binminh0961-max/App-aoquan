// src/components/OutfitSilhouette.tsx
import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ViewStyle } from 'react-native';
import Svg, {
  Path,
  Rect,
  Circle,
  G,
  Line,
  Defs,
  LinearGradient,
  Stop,
  Ellipse,
} from 'react-native-svg';
import { FashionColor } from '../constants/fashionColors';
import { hexToHsl } from '../engine/OutfitEngine';
import {
  OutfitSlotId,
  OutfitSlotsMap,
  VisualRatiosMap,
  SilhouetteStyleType,
} from '../types/outfit';

interface Props {
  slots: OutfitSlotsMap;
  isLayering: boolean;
  visualRatios: VisualRatiosMap;
  activeSlot: OutfitSlotId | null;
  onSelectSlot: (slot: OutfitSlotId) => void;
  onToggleLock: (slot: OutfitSlotId) => void;
  styleType?: SilhouetteStyleType;
  style?: ViewStyle;
}

export const OutfitSilhouette: React.FC<Props> = ({
  slots,
  isLayering,
  visualRatios,
  activeSlot,
  onSelectSlot,
  onToggleLock,
  styleType = 'male',
  style,
}) => {
  const { outerwear, top, bottom, shoes } = slots;

  const topHsl = hexToHsl(top.color.hex);
  const bottomHsl = hexToHsl(bottom.color.hex);
  const shoesHsl = hexToHsl(shoes.color.hex);
  const outerHsl = hexToHsl(outerwear.color.hex);

  // Đường viền nếp gấp thích ứng sáng/tối
  const getDetailStroke = (l: number) =>
    l < 26 ? 'rgba(255, 255, 255, 0.35)' : 'rgba(17, 24, 39, 0.22)';

  const topDetailStroke = getDetailStroke(topHsl.l);
  const bottomDetailStroke = getDetailStroke(bottomHsl.l);
  const shoesDetailStroke = getDetailStroke(shoesHsl.l);
  const outerDetailStroke = getDetailStroke(outerHsl.l);

  // Màu da tự nhiên cho các phom dáng lộ chân (Quần short & Chân váy chữ A)
  const skinFill = '#EED2BC';
  const skinShadow = '#DEC0A8';
  const skinStroke = 'rgba(17, 24, 39, 0.16)';

  const isOuterActive = activeSlot === 'outerwear';
  const isTopActive = activeSlot === 'top';
  const isBottomActive = activeSlot === 'bottom';
  const isShoesActive = activeSlot === 'shoes';

  const isFemale = styleType === 'female';

  // =============================================================
  // 1. RENDER ÁO CHÍNH / ÁO MẶC TRONG (TOP)
  // =============================================================

  const renderTopSilhouette = () => {
    const silhouette = top.silhouette;

    if (isLayering) {
      // Khi bật Áo khoác ngoài (Layering), áo thun mặc trong lộ ra ở khoảng giữa ngực (20%)
      return (
        <G>
          {isTopActive && (
            <Path
              d="M 112 40 Q 130 50 148 40 L 152 158 Q 130 162 108 158 Z"
              stroke="#2563EB"
              strokeWidth="5"
              fill="none"
              strokeLinejoin="round"
            />
          )}
          {/* Thân áo mặc trong */}
          <Path
            d="M 112 40 Q 130 50 148 40 L 152 158 Q 130 162 108 158 Z"
            fill={top.color.hex}
            stroke={isTopActive ? '#2563EB' : 'rgba(17, 24, 39, 0.22)'}
            strokeWidth={isTopActive ? 2 : 1.4}
          />
          {/* Cổ áo trong */}
          <Path
            d="M 112 40 Q 130 52 148 40"
            stroke={topDetailStroke}
            strokeWidth="1.6"
            fill="none"
          />
          {/* Nếp gấp rủ nhẹ */}
          <Line
            x1="130"
            y1="65"
            x2="130"
            y2="152"
            stroke={topDetailStroke}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        </G>
      );
    }

    switch (silhouette) {
      case 'shirt':
        // SƠ MI: Cổ bẻ, nẹp cúc, túi ngực & cúc áo
        return (
          <G>
            {isTopActive && (
              <Path
                d="M 110 38 L 130 48 L 150 38 L 194 54 L 208 106 L 183 113 L 175 92 L 173 158 Q 130 163 87 158 L 85 92 L 77 113 L 52 106 L 66 54 Z"
                stroke="#2563EB"
                strokeWidth="5"
                fill="none"
                strokeLinejoin="round"
              />
            )}
            <Path
              d="M 110 38 L 130 48 L 150 38 L 194 54 L 208 106 L 183 113 L 175 92 L 173 158 Q 130 163 87 158 L 85 92 L 77 113 L 52 106 L 66 54 Z"
              fill={top.color.hex}
              stroke={isTopActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isTopActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            {/* Nẹp cúc dọc chính giữa */}
            <Line x1="130" y1="48" x2="130" y2="158" stroke={topDetailStroke} strokeWidth="1.8" />
            <Line x1="125" y1="48" x2="125" y2="158" stroke={topDetailStroke} strokeWidth="0.8" />
            <Line x1="135" y1="48" x2="135" y2="158" stroke={topDetailStroke} strokeWidth="0.8" />
            {/* Hàng cúc áo */}
            <Circle cx="130" cy="64" r="1.8" fill={topHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            <Circle cx="130" cy="85" r="1.8" fill={topHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            <Circle cx="130" cy="106" r="1.8" fill={topHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            <Circle cx="130" cy="127" r="1.8" fill={topHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            <Circle cx="130" cy="146" r="1.8" fill={topHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            {/* Cổ bẻ 2 bên */}
            <Path
              d="M 130 48 L 112 36 L 102 54 L 126 50 Z"
              fill={top.color.hex}
              stroke={topDetailStroke}
              strokeWidth="1.2"
            />
            <Path
              d="M 130 48 L 148 36 L 158 54 L 134 50 Z"
              fill={top.color.hex}
              stroke={topDetailStroke}
              strokeWidth="1.2"
            />
            {/* Túi ngực sơ mi */}
            <Path
              d="M 98 80 L 114 80 L 114 98 L 106 103 L 98 98 Z"
              fill="none"
              stroke={topDetailStroke}
              strokeWidth="1.1"
            />
            {/* Bo tay áo */}
            <Line x1="56" y1="102" x2="74" y2="108" stroke={topDetailStroke} strokeWidth="1.2" />
            <Line x1="204" y1="102" x2="186" y2="108" stroke={topDetailStroke} strokeWidth="1.2" />
          </G>
        );

      case 'hoodie':
        // HOODIE / SWEATER: Mũ trùm sau gáy, dây rút mũ, túi kangaroo
        return (
          <G>
            {isTopActive && (
              <Path
                d="M 104 38 C 100 20, 160 20, 156 38 L 198 56 L 214 116 L 188 123 L 179 98 L 177 160 Q 130 165 83 160 L 81 98 L 72 123 L 46 116 L 62 56 Z"
                stroke="#2563EB"
                strokeWidth="5"
                fill="none"
                strokeLinejoin="round"
              />
            )}
            {/* Vành mũ trùm đầu */}
            <Path
              d="M 104 38 C 98 16, 162 16, 156 38 Q 130 46 104 38 Z"
              fill={top.color.hex}
              stroke={topDetailStroke}
              strokeWidth="1.4"
            />
            {/* Thân hoodie */}
            <Path
              d="M 104 38 Q 130 50 156 38 L 198 56 L 214 116 L 188 123 L 179 98 L 177 160 Q 130 165 83 160 L 81 98 L 72 123 L 46 116 L 62 56 Z"
              fill={top.color.hex}
              stroke={isTopActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isTopActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            {/* Túi Kangaroo */}
            <Path
              d="M 102 118 L 158 118 L 168 152 L 92 152 Z"
              fill={top.color.hex}
              stroke={topDetailStroke}
              strokeWidth="1.3"
            />
            <Line x1="102" y1="118" x2="92" y2="152" stroke={topDetailStroke} strokeWidth="1.4" />
            <Line x1="158" y1="118" x2="168" y2="152" stroke={topDetailStroke} strokeWidth="1.4" />
            {/* Dây rút mũ */}
            <Path d="M 122 46 Q 120 72 122 92" stroke={topDetailStroke} strokeWidth="1.6" fill="none" />
            <Circle cx="122" cy="93" r="1.8" fill={topHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            <Path d="M 138 46 Q 140 72 138 92" stroke={topDetailStroke} strokeWidth="1.6" fill="none" />
            <Circle cx="138" cy="93" r="1.8" fill={topHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            <Line x1="83" y1="154" x2="177" y2="154" stroke={topDetailStroke} strokeWidth="1.2" />
          </G>
        );

      case 'blazer':
        // BLAZER RIÊNG LẺ
        return (
          <G>
            {isTopActive && (
              <Path
                d="M 108 38 L 194 52 L 208 114 L 184 120 L 175 94 L 175 160 Q 130 164 85 160 L 85 94 L 76 120 L 52 114 L 66 52 Z"
                stroke="#2563EB"
                strokeWidth="5"
                fill="none"
                strokeLinejoin="round"
              />
            )}
            <Path
              d="M 108 38 L 194 52 L 208 114 L 184 120 L 175 94 L 175 160 Q 130 164 85 160 L 85 94 L 76 120 L 52 114 L 66 52 Z"
              fill={top.color.hex}
              stroke={isTopActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isTopActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            <Path
              d="M 112 38 L 122 84 L 130 118 L 138 84 L 148 38"
              stroke={topDetailStroke}
              strokeWidth="1.5"
              fill="none"
            />
            <Path d="M 112 56 L 102 66 L 118 78" stroke={topDetailStroke} strokeWidth="1.3" fill="none" />
            <Path d="M 148 56 L 158 66 L 142 78" stroke={topDetailStroke} strokeWidth="1.3" fill="none" />
            <Rect x="90" y="128" width="26" height="5" rx="1.5" stroke={topDetailStroke} strokeWidth="1" fill="none" />
            <Rect x="144" y="128" width="26" height="5" rx="1.5" stroke={topDetailStroke} strokeWidth="1" fill="none" />
            <Circle cx="130" cy="124" r="2.2" fill={topHsl.l > 50 ? '#1F2937' : '#E5E7EB'} />
          </G>
        );

      case 'tshirt':
      default:
        // ÁO THUN CƠ BẢN
        return (
          <G>
            {isTopActive && (
              <Path
                d="M 110 38 Q 130 48 150 38 L 194 53 L 208 102 L 183 111 L 174 92 L 172 158 Q 130 162 88 158 L 86 92 L 77 111 L 52 102 L 66 53 Z"
                stroke="#2563EB"
                strokeWidth="5"
                fill="none"
                strokeLinejoin="round"
              />
            )}
            <Path
              d="M 110 38 Q 130 48 150 38 L 194 53 L 208 102 L 183 111 L 174 92 L 172 158 Q 130 162 88 158 L 86 92 L 77 111 L 52 102 L 66 53 Z"
              fill={top.color.hex}
              stroke={isTopActive ? '#2563EB' : 'rgba(17, 24, 39, 0.22)'}
              strokeWidth={isTopActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            <Path
              d="M 110 38 Q 130 50 150 38"
              stroke={topDetailStroke}
              strokeWidth="1.6"
              fill="none"
            />
            <Line x1="66" y1="53" x2="86" y2="92" stroke={topDetailStroke} strokeWidth="1.2" />
            <Line x1="194" y1="53" x2="174" y2="92" stroke={topDetailStroke} strokeWidth="1.2" />
            <Path d="M 118 90 Q 120 120 117 150" stroke={topDetailStroke} strokeWidth="1.1" fill="none" />
            <Path d="M 142 92 Q 140 122 143 150" stroke={topDetailStroke} strokeWidth="1.1" fill="none" />
          </G>
        );
    }
  };

  // =============================================================
  // 2. RENDER ÁO KHOÁC NGOÀI (OUTERWEAR - VẼ ĐỦ 3 PHOM DÁNG)
  // =============================================================

  const renderOuterwear = () => {
    if (!isLayering) return null;

    const silhouette = outerwear.silhouette;

    return (
      <G onPress={() => onSelectSlot('outerwear')}>
        {/* VÙNG CHẠM RỘNG TRONG SUỐT CHO ÁO KHOÁC ĐỂ TRÁNH BỊ HỤT TAY */}
        <Rect x="35" y="36" width="190" height="135" fill="transparent" />

        {/* GLOW HIGHLIGHT KHI OUTERWEAR ĐANG ĐƯỢC CHỌN */}
        {isOuterActive && (
          <G>
            <Path
              d="M 108 38 L 56 53 L 40 114 L 68 122 L 76 96 L 80 164 L 114 164 L 124 90 Z"
              stroke="#2563EB"
              strokeWidth="5"
              fill="none"
              strokeLinejoin="round"
            />
            <Path
              d="M 152 38 L 204 53 L 220 114 L 192 122 L 184 96 L 180 164 L 146 164 L 136 90 Z"
              stroke="#2563EB"
              strokeWidth="5"
              fill="none"
              strokeLinejoin="round"
            />
          </G>
        )}

        {/* PHÂN NHÁNH 3 PHOM DÁNG ÁO KHOÁC NGOÀI */}
        {silhouette === 'shirt' ? (
          // ================= 1. SƠ MI KHOÁC NGOÀI (OVERSHIRT) =================
          // Cổ bẻ mềm, vạt suông thả buông, nẹp cúc dọc mép và cổ tay măng-séc
          <G>
            {/* Vạt sơ mi trái */}
            <Path
              d="M 108 38 L 58 53 L 44 114 L 70 121 L 78 95 L 82 163 L 112 163 L 120 90 Z"
              fill={outerwear.color.hex}
              stroke={isOuterActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isOuterActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            {/* Vạt sơ mi phải */}
            <Path
              d="M 152 38 L 202 53 L 216 114 L 190 121 L 182 95 L 178 163 L 148 163 L 140 90 Z"
              fill={outerwear.color.hex}
              stroke={isOuterActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isOuterActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            {/* Cổ áo sơ mi bẻ mềm hai bên */}
            <Path
              d="M 108 38 L 120 54 L 106 60 L 98 46 Z"
              fill={outerwear.color.hex}
              stroke={outerDetailStroke}
              strokeWidth="1.2"
            />
            <Path
              d="M 152 38 L 140 54 L 154 60 L 162 46 Z"
              fill={outerwear.color.hex}
              stroke={outerDetailStroke}
              strokeWidth="1.2"
            />
            {/* Nẹp cúc dọc mép mở bên phải */}
            <Line x1="144" y1="56" x2="148" y2="163" stroke={outerDetailStroke} strokeWidth="1.5" />
            <Circle cx="145" cy="78" r="1.6" fill={outerHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            <Circle cx="146" cy="104" r="1.6" fill={outerHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            <Circle cx="147" cy="130" r="1.6" fill={outerHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            <Circle cx="148" cy="154" r="1.6" fill={outerHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            {/* Nẹp viền mép vạt trái */}
            <Line x1="116" y1="56" x2="112" y2="163" stroke={outerDetailStroke} strokeWidth="1" />
            {/* Măng-séc cổ tay áo sơ mi */}
            <Line x1="46" y1="110" x2="70" y2="118" stroke={outerDetailStroke} strokeWidth="1.3" />
            <Line x1="214" y1="110" x2="190" y2="118" stroke={outerDetailStroke} strokeWidth="1.3" />
          </G>
        ) : silhouette === 'hoodie' ? (
          // ================= 2. HOODIE KHOÁC (ZIP-UP) =================
          // Mũ trùm phía sau cổ, 2 dây rút, khóa kéo mở ở giữa, túi kangaroo chia đôi hai bên
          <G>
            {/* Vòm mũ trùm phía sau cổ */}
            <Path
              d="M 104 36 C 96 14, 164 14, 156 36 Q 130 46 104 36 Z"
              fill={outerwear.color.hex}
              stroke={outerDetailStroke}
              strokeWidth="1.4"
            />
            {/* Vạt hoodie trái */}
            <Path
              d="M 108 38 L 56 54 L 40 115 L 68 122 L 76 96 L 80 164 L 115 164 L 123 90 Z"
              fill={outerwear.color.hex}
              stroke={isOuterActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isOuterActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            {/* Vạt hoodie phải */}
            <Path
              d="M 152 38 L 204 54 L 220 115 L 192 122 L 184 96 L 180 164 L 145 164 L 137 90 Z"
              fill={outerwear.color.hex}
              stroke={isOuterActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isOuterActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            {/* Túi Kangaroo chia đôi: bên trái */}
            <Path
              d="M 94 128 L 115 128 L 115 158 L 88 158 Z"
              fill="none"
              stroke={outerDetailStroke}
              strokeWidth="1.2"
            />
            {/* Túi Kangaroo chia đôi: bên phải */}
            <Path
              d="M 166 128 L 145 128 L 145 158 L 172 158 Z"
              fill="none"
              stroke={outerDetailStroke}
              strokeWidth="1.2"
            />
            {/* Răng khóa kéo mở hai bên mép vạt */}
            <Line
              x1="123"
              y1="82"
              x2="115"
              y2="164"
              stroke={outerDetailStroke}
              strokeWidth="1.4"
              strokeDasharray="2 2"
            />
            <Line
              x1="137"
              y1="82"
              x2="145"
              y2="164"
              stroke={outerDetailStroke}
              strokeWidth="1.4"
              strokeDasharray="2 2"
            />
            {/* Hai dây rút mũ hoodie rủ trước ngực */}
            <Path d="M 112 44 Q 108 72 110 92" stroke={outerDetailStroke} strokeWidth="1.6" fill="none" />
            <Circle cx="110" cy="93" r="1.8" fill={outerHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            <Path d="M 148 44 Q 152 72 150 92" stroke={outerDetailStroke} strokeWidth="1.6" fill="none" />
            <Circle cx="150" cy="93" r="1.8" fill={outerHsl.l > 50 ? '#374151' : '#FFFFFF'} />
            {/* Bo gấu áo và bo tay áo dệt gân */}
            <Line x1="80" y1="158" x2="115" y2="158" stroke={outerDetailStroke} strokeWidth="1.2" />
            <Line x1="145" y1="158" x2="180" y2="158" stroke={outerDetailStroke} strokeWidth="1.2" />
          </G>
        ) : (
          // ================= 3. BLAZER KHOÁC NGOÀI (DEFAULT) =================
          // Vai đứng, ve áo chữ V nhọn, nắp túi xéo hai bên, vạt mở thẳng
          <G>
            {/* Vạt blazer trái */}
            <Path
              d="M 108 38 L 58 53 L 42 112 L 68 120 L 76 96 L 80 164 L 114 164 L 124 90 Z"
              fill={outerwear.color.hex}
              stroke={isOuterActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isOuterActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            {/* Vạt blazer phải */}
            <Path
              d="M 152 38 L 202 53 L 218 112 L 192 120 L 184 96 L 180 164 L 146 164 L 136 90 Z"
              fill={outerwear.color.hex}
              stroke={isOuterActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isOuterActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            {/* Ve áo chữ V nhọn bên trái */}
            <Path
              d="M 108 38 L 122 72 L 112 80 L 122 92 L 116 164"
              stroke={outerDetailStroke}
              strokeWidth="1.4"
              fill="none"
            />
            {/* Ve áo chữ V nhọn bên phải */}
            <Path
              d="M 152 38 L 138 72 L 148 80 L 138 92 L 144 164"
              stroke={outerDetailStroke}
              strokeWidth="1.4"
              fill="none"
            />
            {/* Nắp túi xéo blazer */}
            <Rect x="84" y="132" width="24" height="5" rx="1.5" stroke={outerDetailStroke} strokeWidth="1.1" fill="none" />
            <Rect x="152" y="132" width="24" height="5" rx="1.5" stroke={outerDetailStroke} strokeWidth="1.1" fill="none" />
            <Line x1="44" y1="110" x2="68" y2="118" stroke={outerDetailStroke} strokeWidth="1.2" />
            <Line x1="216" y1="110" x2="192" y2="118" stroke={outerDetailStroke} strokeWidth="1.2" />
          </G>
        )}
      </G>
    );
  };

  // =============================================================
  // 3. RENDER QUẦN / CHÂN VÁY (BOTTOM)
  // =============================================================

  const renderBottomSilhouette = () => {
    const silhouette = bottom.silhouette;

    switch (silhouette) {
      case 'shorts':
        // QUẦN SHORT: Lộ da chân dưới gấu quần
        return (
          <G>
            {/* Phần da chân lộ ra */}
            <G>
              <Path
                d="M 90 226 L 90 292 C 90 298, 100 298, 103 292 L 114 226 Z"
                fill={skinFill}
                stroke={skinStroke}
                strokeWidth="1"
              />
              <Ellipse cx="102" cy="245" rx="4.5" ry="3" fill={skinShadow} opacity={0.6} />
              <Line x1="97" y1="243" x2="107" y2="243" stroke="rgba(17, 24, 39, 0.15)" strokeWidth="1" />

              <Path
                d="M 146 226 L 157 292 C 160 298, 170 298, 170 292 L 170 226 Z"
                fill={skinFill}
                stroke={skinStroke}
                strokeWidth="1"
              />
              <Ellipse cx="158" cy="245" rx="4.5" ry="3" fill={skinShadow} opacity={0.6} />
              <Line x1="153" y1="243" x2="163" y2="243" stroke="rgba(17, 24, 39, 0.15)" strokeWidth="1" />
            </G>

            {/* Thân Quần Short */}
            {isBottomActive && (
              <Path
                d="M 82 158 Q 130 162 178 158 L 180 226 L 140 226 L 130 190 L 120 226 L 80 226 Z"
                stroke="#2563EB"
                strokeWidth="5"
                fill="none"
                strokeLinejoin="round"
              />
            )}
            <Path
              d="M 82 158 Q 130 162 178 158 L 180 226 L 140 226 L 130 190 L 120 226 L 80 226 Z"
              fill={bottom.color.hex}
              stroke={isBottomActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isBottomActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            <Path d="M 130 158 L 130 186" stroke={bottomDetailStroke} strokeWidth="1.3" fill="none" />
            <Line x1="86" y1="168" x2="98" y2="182" stroke={bottomDetailStroke} strokeWidth="1.2" />
            <Line x1="174" y1="168" x2="162" y2="182" stroke={bottomDetailStroke} strokeWidth="1.2" />
            <Line x1="80" y1="222" x2="120" y2="222" stroke={bottomDetailStroke} strokeWidth="1.2" />
            <Line x1="140" y1="222" x2="180" y2="222" stroke={bottomDetailStroke} strokeWidth="1.2" />
          </G>
        );

      case 'a_line_skirt':
        // CHÂN VÁY CHỮ A: Dáng xòe nữ tính + Da chân dưới váy
        return (
          <G>
            {/* Da chân lộ dưới váy */}
            <G>
              <Path
                d="M 104 234 L 102 292 C 102 298, 114 298, 114 292 L 118 234 Z"
                fill={skinFill}
                stroke={skinStroke}
                strokeWidth="1"
              />
              <Ellipse cx="108" cy="256" rx="4" ry="2.8" fill={skinShadow} opacity={0.6} />

              <Path
                d="M 142 234 L 146 292 C 146 298, 158 298, 158 292 L 156 234 Z"
                fill={skinFill}
                stroke={skinStroke}
                strokeWidth="1"
              />
              <Ellipse cx="152" cy="256" rx="4" ry="2.8" fill={skinShadow} opacity={0.6} />
            </G>

            {/* Thân váy chữ A */}
            {isBottomActive && (
              <Path
                d="M 88 150 Q 130 154 172 150 L 196 234 Q 130 242 64 234 Z"
                stroke="#2563EB"
                strokeWidth="5"
                fill="none"
                strokeLinejoin="round"
              />
            )}
            <Path
              d="M 88 150 Q 130 154 172 150 L 196 234 Q 130 242 64 234 Z"
              fill={bottom.color.hex}
              stroke={isBottomActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isBottomActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            <Path d="M 88 156 Q 130 160 172 156" stroke={bottomDetailStroke} strokeWidth="1.3" fill="none" />
            <Path d="M 94 158 Q 96 195 90 234" stroke={bottomDetailStroke} strokeWidth="1.1" fill="none" />
            <Path d="M 116 158 Q 118 196 116 236" stroke={bottomDetailStroke} strokeWidth="1.2" fill="none" />
            <Path d="M 130 158 L 130 237" stroke={bottomDetailStroke} strokeWidth="1.2" fill="none" />
            <Path d="M 144 158 Q 142 196 144 236" stroke={bottomDetailStroke} strokeWidth="1.2" fill="none" />
            <Path d="M 166 158 Q 164 195 170 234" stroke={bottomDetailStroke} strokeWidth="1.1" fill="none" />
          </G>
        );

      case 'jeans':
        // QUẦN JEAN: Túi cong, đinh tán, chỉ may
        return (
          <G>
            {isBottomActive && (
              <Path
                d="M 82 158 Q 130 162 178 158 L 180 292 L 144 292 L 130 198 L 116 292 L 80 292 Z"
                stroke="#2563EB"
                strokeWidth="5"
                fill="none"
                strokeLinejoin="round"
              />
            )}
            <Path
              d="M 82 158 Q 130 162 178 158 L 180 292 L 144 292 L 130 198 L 116 292 L 80 292 Z"
              fill={bottom.color.hex}
              stroke={isBottomActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isBottomActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            <Path d="M 130 158 L 130 186 C 130 192, 134 194, 134 196" stroke={bottomDetailStroke} strokeWidth="1.4" fill="none" />
            <Path d="M 84 166 Q 96 170 96 182" stroke={bottomDetailStroke} strokeWidth="1.3" fill="none" />
            <Path d="M 176 166 Q 164 170 164 182" stroke={bottomDetailStroke} strokeWidth="1.3" fill="none" />
            <Circle cx="96" cy="182" r="1.3" fill="#D97706" />
            <Circle cx="164" cy="182" r="1.3" fill="#D97706" />
            <Line x1="88" y1="240" x2="108" y2="242" stroke={bottomDetailStroke} strokeWidth="1" />
            <Line x1="152" y1="242" x2="172" y2="240" stroke={bottomDetailStroke} strokeWidth="1" />
            <Line x1="80" y1="288" x2="116" y2="288" stroke={bottomDetailStroke} strokeWidth="1.2" />
            <Line x1="144" y1="288" x2="180" y2="288" stroke={bottomDetailStroke} strokeWidth="1.2" />
          </G>
        );

      case 'wide_pants':
      default:
        // QUẦN ỐNG SUÔNG: Rộng rãi, ly quần thẳng tắp
        return (
          <G>
            {isBottomActive && (
              <Path
                d="M 80 158 Q 130 162 180 158 L 188 292 L 144 292 L 130 198 L 116 292 L 72 292 Z"
                stroke="#2563EB"
                strokeWidth="5"
                fill="none"
                strokeLinejoin="round"
              />
            )}
            <Path
              d="M 80 158 Q 130 162 180 158 L 188 292 L 144 292 L 130 198 L 116 292 L 72 292 Z"
              fill={bottom.color.hex}
              stroke={isBottomActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isBottomActive ? 2 : 1.5}
              strokeLinejoin="round"
            />
            <Path d="M 130 158 L 130 186 C 130 192, 134 194, 134 196" stroke={bottomDetailStroke} strokeWidth="1.3" fill="none" />
            <Line x1="84" y1="168" x2="96" y2="182" stroke={bottomDetailStroke} strokeWidth="1.2" />
            <Line x1="176" y1="168" x2="164" y2="182" stroke={bottomDetailStroke} strokeWidth="1.2" />
            <Line x1="94" y1="188" x2="92" y2="288" stroke={bottomDetailStroke} strokeWidth="1.2" />
            <Line x1="166" y1="188" x2="168" y2="288" stroke={bottomDetailStroke} strokeWidth="1.2" />
            <Line x1="73" y1="288" x2="115" y2="288" stroke={bottomDetailStroke} strokeWidth="1.1" />
            <Line x1="145" y1="288" x2="187" y2="288" stroke={bottomDetailStroke} strokeWidth="1.1" />
          </G>
        );
    }
  };

  // =============================================================
  // 4. RENDER GIÀY (SHOES - VẼ ĐỦ 3 KIỂU DÁNG THỰC TẾ)
  // =============================================================

  const renderShoes = () => {
    const silhouette = shoes.silhouette;

    return (
      <G onPress={() => onSelectSlot('shoes')}>
        {/* VÙNG CHẠM TRONG SUỐT RỘNG CHO GIÀY ĐỂ BẮT CHẠM CỰC NHẠY */}
        <Rect x="50" y="278" width="160" height="55" fill="transparent" />

        {/* GLOW HIGHLIGHT KHI GIÀY ĐANG ĐƯỢC CHỌN */}
        {isShoesActive && (
          <G>
            <Path
              d="M 66 292 L 86 292 L 96 307 L 116 313 C 119 320, 116 326, 106 326 L 64 326 C 59 326, 59 313, 63 307 Z"
              stroke="#2563EB"
              strokeWidth="5"
              fill="none"
            />
            <Path
              d="M 194 292 L 174 292 L 164 307 L 144 313 C 141 320, 144 326, 154 326 L 196 326 C 201 326, 201 313, 197 307 Z"
              stroke="#2563EB"
              strokeWidth="5"
              fill="none"
            />
          </G>
        )}

        {/* PHÂN NHÁNH PHOM DÁNG GIÀY */}
        {silhouette === 'loafer' || silhouette === 'dress_shoes' ? (
          // ================= 1. LOAFER / GIÀY TÂY =================
          // Mũi thuôn thanh lịch, đế mỏng tối màu, đai da ngang mui giày
          <G>
            {/* Giày Tây trái */}
            <Path
              d="M 70 296 L 86 296 L 98 306 L 118 312 C 120 318, 116 323, 108 323 L 68 323 C 63 323, 63 312, 66 306 Z"
              fill={shoes.color.hex}
              stroke={isShoesActive ? '#2563EB' : 'rgba(17, 24, 39, 0.28)'}
              strokeWidth={isShoesActive ? 1.8 : 1.3}
            />
            {/* Đế mỏng tối màu sang trọng */}
            <Path
              d="M 68 320 L 118 320 C 118 323, 112 323, 108 323 L 68 323 Z"
              fill="#1E293B"
            />
            {/* Đai da ngang mui giày (Penny strap) */}
            <Rect x="80" y="302" width="14" height="4" rx="1" fill="rgba(0,0,0,0.2)" />
            <Line x1="87" y1="302" x2="87" y2="306" stroke={shoesDetailStroke} strokeWidth="1" />

            {/* Giày Tây phải */}
            <Path
              d="M 190 296 L 174 296 L 162 306 L 142 312 C 140 318, 144 323, 152 323 L 192 323 C 197 323, 197 312, 194 306 Z"
              fill={shoes.color.hex}
              stroke={isShoesActive ? '#2563EB' : 'rgba(17, 24, 39, 0.28)'}
              strokeWidth={isShoesActive ? 1.8 : 1.3}
            />
            <Path
              d="M 192 320 L 142 320 C 142 323, 148 323, 152 323 L 192 323 Z"
              fill="#1E293B"
            />
            <Rect x="166" y="302" width="14" height="4" rx="1" fill="rgba(0,0,0,0.2)" />
            <Line x1="173" y1="302" x2="173" y2="306" stroke={shoesDetailStroke} strokeWidth="1" />
          </G>
        ) : silhouette === 'boot' || silhouette === 'heels' ? (
          // ================= 2. BOOT / CAO GÓT =================
          // Nam: Boot da cổ cao ôm mắt cá chân, đế dày gồ ghề
          // Nữ: Boot gót mảnh / Giày cao gót thanh mảnh tôn dáng
          !isFemale ? (
            // Dáng Boot Nam cổ cao
            <G>
              {/* Boot cổ cao trái */}
              <Path
                d="M 68 284 L 84 284 L 88 296 L 98 308 L 116 313 C 119 320, 116 325, 108 325 L 66 325 C 62 325, 62 312, 64 305 L 68 284 Z"
                fill={shoes.color.hex}
                stroke={isShoesActive ? '#2563EB' : 'rgba(17, 24, 39, 0.28)'}
                strokeWidth={isShoesActive ? 1.8 : 1.3}
              />
              <Path
                d="M 66 320 L 116 320 C 116 325, 110 325, 108 325 L 66 325 Z"
                fill="#111827"
              />
              <Line x1="74" y1="288" x2="74" y2="300" stroke={shoesDetailStroke} strokeWidth="1.2" />

              {/* Boot cổ cao phải */}
              <Path
                d="M 192 284 L 176 284 L 172 296 L 162 308 L 144 313 C 141 320, 144 325, 152 325 L 194 325 C 198 325, 198 312, 196 305 L 192 284 Z"
                fill={shoes.color.hex}
                stroke={isShoesActive ? '#2563EB' : 'rgba(17, 24, 39, 0.28)'}
                strokeWidth={isShoesActive ? 1.8 : 1.3}
              />
              <Path
                d="M 194 320 L 144 320 C 144 325, 150 325, 152 325 L 194 325 Z"
                fill="#111827"
              />
              <Line x1="186" y1="288" x2="186" y2="300" stroke={shoesDetailStroke} strokeWidth="1.2" />
            </G>
          ) : (
            // Dáng Boot gót mảnh / Giày cao gót Nữ thanh mảnh
            <G>
              {/* Cao gót trái */}
              <Path
                d="M 72 292 L 84 292 L 92 304 L 116 312 C 117 318, 114 320, 106 320 L 86 320 L 76 327 L 72 327 Z"
                fill={shoes.color.hex}
                stroke={isShoesActive ? '#2563EB' : 'rgba(17, 24, 39, 0.28)'}
                strokeWidth={isShoesActive ? 1.8 : 1.3}
              />
              {/* Gót nhọn thanh mảnh */}
              <Line x1="74" y1="308" x2="74" y2="327" stroke={shoes.color.hex} strokeWidth="2.5" />
              <Line x1="74" y1="308" x2="74" y2="327" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />

              {/* Cao gót phải */}
              <Path
                d="M 188 292 L 176 292 L 168 304 L 144 312 C 143 318, 146 320, 154 320 L 174 320 L 184 327 L 188 327 Z"
                fill={shoes.color.hex}
                stroke={isShoesActive ? '#2563EB' : 'rgba(17, 24, 39, 0.28)'}
                strokeWidth={isShoesActive ? 1.8 : 1.3}
              />
              <Line x1="186" y1="308" x2="186" y2="327" stroke={shoes.color.hex} strokeWidth="2.5" />
              <Line x1="186" y1="308" x2="186" y2="327" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
            </G>
          )
        ) : (
          // ================= 3. SNEAKER THỂ THAO (DEFAULT) =================
          // Giày thể thao đế trắng năng động
          <G>
            {/* Sneaker Trái */}
            <Path
              d="M 68 294 L 84 294 L 95 307 L 115 313 C 118 320, 115 325, 106 325 L 65 325 C 60 325, 60 313, 64 307 Z"
              fill={shoes.color.hex}
              stroke={isShoesActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isShoesActive ? 1.8 : 1.3}
            />
            {/* Đế giày thể thao trắng */}
            <Path
              d="M 65 320 L 115 320 C 115 325, 108 325, 106 325 L 65 325 Z"
              fill="#F9FAFB"
              stroke="rgba(17, 24, 39, 0.2)"
              strokeWidth="0.8"
            />
            <Line x1="77" y1="302" x2="88" y2="308" stroke={shoesDetailStroke} strokeWidth="1" />

            {/* Sneaker Phải */}
            <Path
              d="M 192 294 L 176 294 L 165 307 L 145 313 C 142 320, 145 325, 154 325 L 195 325 C 200 325, 200 313, 196 307 Z"
              fill={shoes.color.hex}
              stroke={isShoesActive ? '#2563EB' : 'rgba(17, 24, 39, 0.25)'}
              strokeWidth={isShoesActive ? 1.8 : 1.3}
            />
            <Path
              d="M 195 320 L 145 320 C 145 325, 152 325, 154 325 L 195 325 Z"
              fill="#F9FAFB"
              stroke="rgba(17, 24, 39, 0.2)"
              strokeWidth="0.8"
            />
            <Line x1="183" y1="302" x2="172" y2="308" stroke={shoesDetailStroke} strokeWidth="1" />
          </G>
        )}
      </G>
    );
  };

  return (
    <View style={[styles.container, style]}>
      {/* KHUNG VẼ SVG CHÍNH */}
      <Svg width={260} height={355} viewBox="0 0 260 355" style={styles.svgCanvas}>
        <Defs>
          <LinearGradient id="mannequinShade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#E5E7EB" stopOpacity="0.8" />
            <Stop offset="50%" stopColor="#F3F4F6" stopOpacity="1" />
            <Stop offset="100%" stopColor="#D1D5DB" stopOpacity="0.8" />
          </LinearGradient>
        </Defs>

        {/* Đổ bóng nhẹ dưới chân */}
        <Ellipse cx="130" cy="336" rx="55" ry="9" fill="rgba(17, 24, 39, 0.06)" />

        {/* ĐẦU & CỔ MANNEQUIN TỐI GIẢN */}
        <G opacity={0.75}>
          <Path
            d="M 120 22 C 120 17, 140 17, 140 22 L 144 42 L 116 42 Z"
            fill="url(#mannequinShade)"
            stroke="rgba(17, 24, 39, 0.18)"
            strokeWidth="1"
          />
          <Line
            x1={isFemale ? '114' : '112'}
            y1="42"
            x2={isFemale ? '146' : '148'}
            y2="42"
            stroke="rgba(17, 24, 39, 0.2)"
            strokeWidth="1.2"
          />
        </G>

        {/* 1. ÁO CHÍNH / ÁO MẶC TRONG (TOP) */}
        <G onPress={() => onSelectSlot('top')}>
          {renderTopSilhouette()}
        </G>

        {/* 2. ÁO KHOÁC NGOÀI (OUTERWEAR - VẼ ĐỦ 3 PHOM DÁNG THỰC TẾ) */}
        {renderOuterwear()}

        {/* 3. QUẦN / CHÂN VÁY (BOTTOM) */}
        <G onPress={() => onSelectSlot('bottom')}>
          {renderBottomSilhouette()}
        </G>

        {/* 4. GIÀY (SHOES - VẼ ĐỦ 3 KIỂU DÁNG THỰC TẾ) */}
        {renderShoes()}
      </Svg>

      {/* CÁC GHIM Ổ KHÓA NỔI (LOCK & SHUFFLE TAGS) QUANH NGƯỜI MẪU SVG */}
      <View style={styles.interactiveTagsOverlay} pointerEvents="box-none">
        {/* Ghim Áo khoác ngoài (chỉ hiện khi isLayering === true) */}
        {isLayering && (
          <View
            style={[
              styles.lockPin,
              styles.outerPin,
              isOuterActive && styles.lockPinActive,
            ]}
          >
            <TouchableOpacity
              style={styles.lockButton}
              onPress={() => onToggleLock('outerwear')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.lockIconText}>
                {outerwear.locked ? '🔒' : '🔓'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pinContentRow}
              onPress={() => onSelectSlot('outerwear')}
              activeOpacity={0.8}
            >
              <View style={[styles.colorDot, { backgroundColor: outerwear.color.hex }]} />
              <View style={styles.pinTextCol}>
                <Text style={styles.pinTitle} numberOfLines={1}>
                  Áo khoác
                </Text>
                <Text style={styles.pinRatioText}>{visualRatios.outerwear}%</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Ghim Áo chính / Áo trong */}
        <View
          style={[
            styles.lockPin,
            styles.topPin,
            isTopActive && styles.lockPinActive,
          ]}
        >
          <TouchableOpacity
            style={styles.lockButton}
            onPress={() => onToggleLock('top')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.lockIconText}>
              {top.locked ? '🔒' : '🔓'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pinContentRow}
            onPress={() => onSelectSlot('top')}
            activeOpacity={0.8}
          >
            <View style={[styles.colorDot, { backgroundColor: top.color.hex }]} />
            <View style={styles.pinTextCol}>
              <Text style={styles.pinTitle} numberOfLines={1}>
                {isLayering ? 'Áo trong' : 'Áo'}
              </Text>
              <Text style={styles.pinRatioText}>{visualRatios.top}%</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Ghim Quần / Chân váy */}
        <View
          style={[
            styles.lockPin,
            styles.bottomPin,
            isBottomActive && styles.lockPinActive,
          ]}
        >
          <TouchableOpacity
            style={styles.lockButton}
            onPress={() => onToggleLock('bottom')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.lockIconText}>
              {bottom.locked ? '🔒' : '🔓'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pinContentRow}
            onPress={() => onSelectSlot('bottom')}
            activeOpacity={0.8}
          >
            <View style={[styles.colorDot, { backgroundColor: bottom.color.hex }]} />
            <View style={styles.pinTextCol}>
              <Text style={styles.pinTitle} numberOfLines={1}>
                {bottom.silhouette === 'a_line_skirt' || bottom.silhouette === 'mini_skirt'
                  ? 'Chân váy'
                  : 'Quần'}
              </Text>
              <Text style={styles.pinRatioText}>{visualRatios.bottom}%</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Ghim Giày */}
        <View
          style={[
            styles.lockPin,
            styles.shoesPin,
            isShoesActive && styles.lockPinActive,
          ]}
        >
          <TouchableOpacity
            style={styles.lockButton}
            onPress={() => onToggleLock('shoes')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.lockIconText}>
              {shoes.locked ? '🔒' : '🔓'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pinContentRow}
            onPress={() => onSelectSlot('shoes')}
            activeOpacity={0.8}
          >
            <View style={[styles.colorDot, { backgroundColor: shoes.color.hex }]} />
            <View style={styles.pinTextCol}>
              <Text style={styles.pinTitle} numberOfLines={1}>
                Giày
              </Text>
              <Text style={styles.pinRatioText}>{visualRatios.shoes}%</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 4,
  },
  svgCanvas: {
    alignSelf: 'center',
  },
  interactiveTagsOverlay: {
    ...StyleSheet.absoluteFill,
  },
  lockPin: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 4,
  },
  lockPinActive: {
    borderColor: '#2563EB',
    backgroundColor: '#F0F7FF',
    transform: [{ scale: 1.05 }],
  },
  lockButton: {
    paddingRight: 6,
    paddingVertical: 2,
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    marginRight: 6,
  },
  lockIconText: {
    fontSize: 14,
  },
  pinContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  pinTextCol: {
    flexDirection: 'column',
  },
  pinTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1F2937',
    maxWidth: 65,
  },
  pinRatioText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  outerPin: {
    top: 45,
    left: 4,
  },
  topPin: {
    top: 55,
    right: 4,
  },
  bottomPin: {
    top: 190,
    left: 4,
  },
  shoesPin: {
    bottom: 22,
    right: 4,
  },
});
