// src/components/OutfitSilhouette.tsx
import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ViewStyle } from 'react-native';
import Svg, { Path, Rect, Circle, G, Line } from 'react-native-svg';
import { FashionColor } from '../constants/fashionColors';
import { hexToHsl } from '../services/OutfitEngine';

export type SilhouetteStyleType = 'unisex' | 'feminine';
export type OutfitSlotKey = 'top' | 'bottom' | 'accessory';

interface Props {
  styleType: SilhouetteStyleType;
  topColor: FashionColor;
  bottomColor: FashionColor;
  accessoryColor: FashionColor;
  activeSlot?: OutfitSlotKey | null;
  onSelectSlot?: (slot: OutfitSlotKey) => void;
  style?: ViewStyle;
}

export const OutfitSilhouette: React.FC<Props> = ({
  styleType,
  topColor,
  bottomColor,
  accessoryColor,
  activeSlot = null,
  onSelectSlot,
  style,
}) => {
  const topHsl = hexToHsl(topColor.hex);
  const bottomHsl = hexToHsl(bottomColor.hex);
  const accHsl = hexToHsl(accessoryColor.hex);

  // Đường viền nếp gấp thích ứng: nếu màu quá tối thì dùng nét sáng nhẹ, ngược lại dùng nét tối
  const topDetailStroke = topHsl.l < 25 ? 'rgba(255, 255, 255, 0.35)' : 'rgba(17, 24, 39, 0.22)';
  const bottomDetailStroke = bottomHsl.l < 25 ? 'rgba(255, 255, 255, 0.35)' : 'rgba(17, 24, 39, 0.22)';
  const accDetailStroke = accHsl.l < 25 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(17, 24, 39, 0.25)';

  const handlePressSlot = (slot: OutfitSlotKey) => {
    if (onSelectSlot) {
      onSelectSlot(slot);
    }
  };

  const isTopActive = activeSlot === 'top';
  const isBottomActive = activeSlot === 'bottom';
  const isAccActive = activeSlot === 'accessory';

  return (
    <View style={[styles.container, style]}>
      {/* SVG Canvas Phom dáng Thời trang */}
      <Svg width={250} height={350} viewBox="0 0 250 350" style={styles.svgCanvas}>
        {/* Nền đổ bóng nhẹ của mannequin */}
        <Circle cx="125" cy="336" r="42" fill="rgba(17, 24, 39, 0.05)" />

        {/* 1. ĐẦU & CỔ MANNEQUIN TỐI GIẢN */}
        <G opacity={0.65}>
          {/* Cổ áo */}
          <Path
            d="M 115 22 C 115 17, 135 17, 135 22 L 138 42 L 112 42 Z"
            fill="#E5E7EB"
            stroke="rgba(17, 24, 39, 0.18)"
            strokeWidth="1"
          />
          {/* Đường vai mannequin */}
          <Line x1="108" y1="42" x2="142" y2="42" stroke="rgba(17, 24, 39, 0.2)" strokeWidth="1.2" />
        </G>

        {/* 2. ÁO (TOP) */}
        <G onPress={() => handlePressSlot('top')}>
          {styleType === 'unisex' ? (
            /* Phom Unisex: Áo thun cổ tròn / Polo sơ mi cộc tay */
            <G>
              {/* Highlight Glow nếu đang chọn */}
              {isTopActive && (
                <Path
                  d="M 108 38 Q 125 48 142 38 L 192 53 L 208 102 L 183 111 L 174 92 L 172 158 Q 125 162 78 158 L 76 92 L 67 111 L 42 102 L 58 53 Z"
                  stroke="#3B82F6"
                  strokeWidth="5"
                  fill="none"
                  strokeLinejoin="round"
                />
              )}
              {/* Thân áo chính */}
              <Path
                d="M 108 38 Q 125 48 142 38 L 192 53 L 208 102 L 183 111 L 174 92 L 172 158 Q 125 162 78 158 L 76 92 L 67 111 L 42 102 L 58 53 Z"
                fill={topColor.hex}
                stroke={isTopActive ? '#2563EB' : 'rgba(17, 24, 39, 0.22)'}
                strokeWidth={isTopActive ? 2 : 1.5}
                strokeLinejoin="round"
              />
              {/* Nếp gấp cổ áo */}
              <Path
                d="M 108 38 Q 125 50 142 38"
                stroke={topDetailStroke}
                strokeWidth="1.5"
                fill="none"
              />
              {/* Nếp gấp tay áo trái & phải */}
              <Line x1="58" y1="53" x2="76" y2="92" stroke={topDetailStroke} strokeWidth="1.2" />
              <Line x1="192" y1="53" x2="174" y2="92" stroke={topDetailStroke} strokeWidth="1.2" />
              <Line x1="48" y1="99" x2="69" y2="108" stroke={topDetailStroke} strokeWidth="1" />
              <Line x1="202" y1="99" x2="181" y2="108" stroke={topDetailStroke} strokeWidth="1" />
              {/* Nếp gấp rủ tự nhiên thân áo */}
              <Path
                d="M 115 88 Q 118 120 114 150"
                stroke={topDetailStroke}
                strokeWidth="1.1"
                fill="none"
              />
              <Path
                d="M 135 92 Q 132 122 136 150"
                stroke={topDetailStroke}
                strokeWidth="1.1"
                fill="none"
              />
            </G>
          ) : (
            /* Phom Nữ: Áo kiểu tay lỡ thanh thoát */
            <G>
              {isTopActive && (
                <Path
                  d="M 106 36 Q 125 48 144 36 L 184 50 L 198 120 L 180 124 L 172 98 L 164 148 Q 125 152 86 148 L 78 98 L 70 124 L 52 120 L 66 50 Z"
                  stroke="#3B82F6"
                  strokeWidth="5"
                  fill="none"
                  strokeLinejoin="round"
                />
              )}
              <Path
                d="M 106 36 Q 125 48 144 36 L 184 50 L 198 120 L 180 124 L 172 98 L 164 148 Q 125 152 86 148 L 78 98 L 70 124 L 52 120 L 66 50 Z"
                fill={topColor.hex}
                stroke={isTopActive ? '#2563EB' : 'rgba(17, 24, 39, 0.22)'}
                strokeWidth={isTopActive ? 2 : 1.5}
                strokeLinejoin="round"
              />
              {/* Nếp cổ áo thuyền / V mềm */}
              <Path
                d="M 106 36 Q 125 48 144 36"
                stroke={topDetailStroke}
                strokeWidth="1.5"
                fill="none"
              />
              {/* Chiết eo nhẹ nhàng */}
              <Path
                d="M 98 105 Q 102 125 96 146"
                stroke={topDetailStroke}
                strokeWidth="1.1"
                fill="none"
              />
              <Path
                d="M 152 105 Q 148 125 154 146"
                stroke={topDetailStroke}
                strokeWidth="1.1"
                fill="none"
              />
              {/* Bo tay áo lỡ */}
              <Line x1="56" y1="118" x2="72" y2="122" stroke={topDetailStroke} strokeWidth="1" />
              <Line x1="194" y1="118" x2="178" y2="122" stroke={topDetailStroke} strokeWidth="1" />
            </G>
          )}
        </G>

        {/* 3. QUẦN / CHÂN VÁY (BOTTOM) */}
        <G onPress={() => handlePressSlot('bottom')}>
          {styleType === 'unisex' ? (
            /* Phom Unisex: Quần âu ống đứng suông hiện đại */
            <G>
              {isBottomActive && (
                <Path
                  d="M 80 158 Q 125 162 170 158 L 178 290 L 140 290 L 125 198 L 110 290 L 72 290 Z"
                  stroke="#3B82F6"
                  strokeWidth="5"
                  fill="none"
                  strokeLinejoin="round"
                />
              )}
              {/* Thân quần chính */}
              <Path
                d="M 80 158 Q 125 162 170 158 L 178 290 L 140 290 L 125 198 L 110 290 L 72 290 Z"
                fill={bottomColor.hex}
                stroke={isBottomActive ? '#2563EB' : 'rgba(17, 24, 39, 0.22)'}
                strokeWidth={isBottomActive ? 2 : 1.5}
                strokeLinejoin="round"
              />
              {/* Đường khóa kéo đũng quần */}
              <Path
                d="M 125 158 L 125 186 C 125 192, 129 194, 129 196"
                stroke={bottomDetailStroke}
                strokeWidth="1.3"
                fill="none"
              />
              {/* Túi xéo hai bên hông */}
              <Line x1="82" y1="168" x2="94" y2="182" stroke={bottomDetailStroke} strokeWidth="1.2" />
              <Line x1="168" y1="168" x2="156" y2="182" stroke={bottomDetailStroke} strokeWidth="1.2" />
              {/* Đường ly quần ống suông */}
              <Line x1="93" y1="188" x2="91" y2="286" stroke={bottomDetailStroke} strokeWidth="1.1" />
              <Line x1="157" y1="188" x2="159" y2="286" stroke={bottomDetailStroke} strokeWidth="1.1" />
              {/* Gấu quần */}
              <Line x1="73" y1="285" x2="109" y2="285" stroke={bottomDetailStroke} strokeWidth="1" />
              <Line x1="141" y1="285" x2="177" y2="285" stroke={bottomDetailStroke} strokeWidth="1" />
            </G>
          ) : (
            /* Phom Nữ: Chân váy chữ A midi xòe nhẹ thanh lịch */
            <G>
              {isBottomActive && (
                <Path
                  d="M 86 148 Q 125 152 164 148 L 194 274 Q 125 284 56 274 Z"
                  stroke="#3B82F6"
                  strokeWidth="5"
                  fill="none"
                  strokeLinejoin="round"
                />
              )}
              {/* Thân váy chữ A */}
              <Path
                d="M 86 148 Q 125 152 164 148 L 194 274 Q 125 284 56 274 Z"
                fill={bottomColor.hex}
                stroke={isBottomActive ? '#2563EB' : 'rgba(17, 24, 39, 0.22)'}
                strokeWidth={isBottomActive ? 2 : 1.5}
                strokeLinejoin="round"
              />
              {/* Cạp váy cao */}
              <Path
                d="M 86 154 Q 125 158 164 154"
                stroke={bottomDetailStroke}
                strokeWidth="1.3"
                fill="none"
              />
              {/* Các đường ly xếp rủ mềm mại */}
              <Path
                d="M 84 156 Q 88 210 82 272"
                stroke={bottomDetailStroke}
                strokeWidth="1.1"
                fill="none"
              />
              <Path
                d="M 106 156 Q 109 212 108 276"
                stroke={bottomDetailStroke}
                strokeWidth="1.2"
                fill="none"
              />
              <Path
                d="M 125 157 L 125 278"
                stroke={bottomDetailStroke}
                strokeWidth="1.2"
                fill="none"
              />
              <Path
                d="M 144 156 Q 141 212 142 276"
                stroke={bottomDetailStroke}
                strokeWidth="1.2"
                fill="none"
              />
              <Path
                d="M 166 156 Q 162 210 168 272"
                stroke={bottomDetailStroke}
                strokeWidth="1.1"
                fill="none"
              />
            </G>
          )}
        </G>

        {/* 4. ĐIỂM NHẤN PHỤ KIỆN (ACCESSORY: GIÀY + THẮT LƯNG / TÚI XÁCH) */}
        <G onPress={() => handlePressSlot('accessory')}>
          {styleType === 'unisex' ? (
            /* Phụ kiện Unisex: Thắt lưng da + Đôi sneaker thời trang */
            <G>
              {/* Thắt lưng nhỏ gọn tại cạp quần */}
              <Rect
                x="80"
                y="157"
                width="90"
                height="7"
                rx="2"
                fill={accessoryColor.hex}
                stroke={isAccActive ? '#2563EB' : 'rgba(17, 24, 39, 0.22)'}
                strokeWidth={isAccActive ? 1.8 : 1}
              />
              {/* Mặt khóa kim loại */}
              <Rect
                x="120"
                y="155"
                width="10"
                height="11"
                rx="2"
                fill="#E5E7EB"
                stroke="rgba(17, 24, 39, 0.3)"
                strokeWidth="1"
              />

              {/* Đôi giày Sneaker */}
              {isAccActive && (
                <G>
                  <Path
                    d="M 70 293 L 84 293 L 95 306 L 114 312 C 117 319, 114 324, 106 324 L 66 324 C 62 324, 62 312, 66 306 Z"
                    stroke="#3B82F6"
                    strokeWidth="4"
                    fill="none"
                  />
                  <Path
                    d="M 180 293 L 166 293 L 155 306 L 136 312 C 133 319, 136 324, 144 324 L 184 324 C 188 324, 188 312, 184 306 Z"
                    stroke="#3B82F6"
                    strokeWidth="4"
                    fill="none"
                  />
                </G>
              )}

              {/* Giày trái */}
              <Path
                d="M 70 293 L 84 293 L 95 306 L 114 312 C 117 319, 114 324, 106 324 L 66 324 C 62 324, 62 312, 66 306 Z"
                fill={accessoryColor.hex}
                stroke={isAccActive ? '#2563EB' : 'rgba(17, 24, 39, 0.22)'}
                strokeWidth={isAccActive ? 1.8 : 1.3}
              />
              {/* Đế giày thể thao trắng */}
              <Path
                d="M 66 320 L 114 320 C 114 324, 108 324, 106 324 L 66 324 Z"
                fill="#F9FAFB"
                stroke="rgba(17, 24, 39, 0.2)"
                strokeWidth="0.8"
              />
              <Line x1="78" y1="301" x2="89" y2="307" stroke={accDetailStroke} strokeWidth="1" />

              {/* Giày phải */}
              <Path
                d="M 180 293 L 166 293 L 155 306 L 136 312 C 133 319, 136 324, 144 324 L 184 324 C 188 324, 188 312, 184 306 Z"
                fill={accessoryColor.hex}
                stroke={isAccActive ? '#2563EB' : 'rgba(17, 24, 39, 0.22)'}
                strokeWidth={isAccActive ? 1.8 : 1.3}
              />
              {/* Đế giày phải */}
              <Path
                d="M 184 320 L 136 320 C 136 324, 142 324, 144 324 L 184 324 Z"
                fill="#F9FAFB"
                stroke="rgba(17, 24, 39, 0.2)"
                strokeWidth="0.8"
              />
              <Line x1="172" y1="301" x2="161" y2="307" stroke={accDetailStroke} strokeWidth="1" />
            </G>
          ) : (
            /* Phụ kiện Nữ: Túi xách đeo vai tối giản + Giày mũi nhọn */
            <G>
              {/* Dây đeo túi vắt qua vai */}
              <Path
                d="M 80 48 Q 125 105 178 178"
                stroke={accessoryColor.hex}
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
              {/* Thân túi xách mini */}
              {isAccActive && (
                <Rect
                  x="172"
                  y="172"
                  width="36"
                  height="44"
                  rx="7"
                  stroke="#3B82F6"
                  strokeWidth="4"
                  fill="none"
                />
              )}
              <Rect
                x="172"
                y="172"
                width="36"
                height="44"
                rx="7"
                fill={accessoryColor.hex}
                stroke={isAccActive ? '#2563EB' : 'rgba(17, 24, 39, 0.22)'}
                strokeWidth={isAccActive ? 1.8 : 1.3}
              />
              {/* Nắp túi & Khóa tròn kim loại */}
              <Path
                d="M 172 188 Q 190 193 208 188"
                stroke={accDetailStroke}
                strokeWidth="1.2"
                fill="none"
              />
              <Circle
                cx="190"
                cy="194"
                r="3"
                fill="#E5E7EB"
                stroke="rgba(17, 24, 39, 0.3)"
                strokeWidth="0.8"
              />

              {/* Đôi giày nữ mũi nhọn / đế thấp */}
              {isAccActive && (
                <G>
                  <Path
                    d="M 86 280 L 96 280 L 100 294 L 116 308 Q 104 314 90 314 L 76 308 Z"
                    stroke="#3B82F6"
                    strokeWidth="4"
                    fill="none"
                  />
                  <Path
                    d="M 164 280 L 154 280 L 150 294 L 134 308 Q 146 314 160 314 L 174 308 Z"
                    stroke="#3B82F6"
                    strokeWidth="4"
                    fill="none"
                  />
                </G>
              )}
              {/* Giày trái */}
              <Path
                d="M 86 280 L 96 280 L 100 294 L 116 308 Q 104 314 90 314 L 76 308 Z"
                fill={accessoryColor.hex}
                stroke={isAccActive ? '#2563EB' : 'rgba(17, 24, 39, 0.22)'}
                strokeWidth={isAccActive ? 1.8 : 1.3}
              />
              {/* Giày phải */}
              <Path
                d="M 164 280 L 154 280 L 150 294 L 134 308 Q 146 314 160 314 L 174 308 Z"
                fill={accessoryColor.hex}
                stroke={isAccActive ? '#2563EB' : 'rgba(17, 24, 39, 0.22)'}
                strokeWidth={isAccActive ? 1.8 : 1.3}
              />
            </G>
          )}
        </G>
      </Svg>

      {/* Các nhãn tương tác nổi trực quan bên cạnh hình */}
      <View style={styles.interactiveTagsOverlay} pointerEvents="box-none">
        {/* Nhãn Áo */}
        <TouchableOpacity
          style={[
            styles.tagPill,
            styles.topTag,
            isTopActive && styles.tagPillActive,
          ]}
          onPress={() => handlePressSlot('top')}
          activeOpacity={0.8}
        >
          <View style={[styles.tagColorDot, { backgroundColor: topColor.hex }]} />
          <Text style={[styles.tagText, isTopActive && styles.tagTextActive]}>
            👕 Áo
          </Text>
        </TouchableOpacity>

        {/* Nhãn Quần/Váy */}
        <TouchableOpacity
          style={[
            styles.tagPill,
            styles.bottomTag,
            isBottomActive && styles.tagPillActive,
          ]}
          onPress={() => handlePressSlot('bottom')}
          activeOpacity={0.8}
        >
          <View style={[styles.tagColorDot, { backgroundColor: bottomColor.hex }]} />
          <Text style={[styles.tagText, isBottomActive && styles.tagTextActive]}>
            {styleType === 'feminine' ? '👗 Chân váy' : '👖 Quần'}
          </Text>
        </TouchableOpacity>

        {/* Nhãn Phụ kiện */}
        <TouchableOpacity
          style={[
            styles.tagPill,
            styles.accTag,
            isAccActive && styles.tagPillActive,
          ]}
          onPress={() => handlePressSlot('accessory')}
          activeOpacity={0.8}
        >
          <View style={[styles.tagColorDot, { backgroundColor: accessoryColor.hex }]} />
          <Text style={[styles.tagText, isAccActive && styles.tagTextActive]}>
            {styleType === 'feminine' ? '👜 Phụ kiện' : '👟 Giày'}
          </Text>
        </TouchableOpacity>
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
  },
  svgCanvas: {
    alignSelf: 'center',
  },
  interactiveTagsOverlay: {
    ...StyleSheet.absoluteFill,
  },
  tagPill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  tagPillActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
    transform: [{ scale: 1.05 }],
  },
  topTag: {
    top: 58,
    right: 8,
  },
  bottomTag: {
    top: 185,
    left: 8,
  },
  accTag: {
    bottom: 24,
    right: 8,
  },
  tagColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  tagTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
});
