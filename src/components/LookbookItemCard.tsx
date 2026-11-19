// src/components/LookbookItemCard.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  OutfitSlotId,
  OutfitSlotsMap,
  VisualRatiosMap,
  SilhouetteId,
} from '../types/outfit';
import { getSilhouetteOption, hexToHsl } from '../engine/OutfitEngine';

interface LookbookItemCardProps {
  slots: OutfitSlotsMap;
  isLayering: boolean;
  visualRatios: VisualRatiosMap;
  activeSlot: OutfitSlotId;
  lockedCount?: number;
  onSelectSlot: (slot: OutfitSlotId) => void;
  onToggleLock: (slot: OutfitSlotId) => void;
  onUnlockAll?: () => void;
}

function getSlotIcon(slot: OutfitSlotId, silhouette: SilhouetteId): keyof typeof Ionicons.glyphMap {
  if (slot === 'outerwear') return 'layers-outline';
  if (slot === 'top') return 'shirt-outline';
  if (slot === 'bottom') {
    return silhouette === 'a_line_skirt' ? 'woman-outline' : 'resize-outline';
  }
  return 'footsteps-outline';
}

function shortColorName(name: string): string {
  // Bỏ phần ghi chú tiếng Anh trong ngoặc để tên màu Việt hiển thị gọn, không bị cắt cụt
  const idx = name.indexOf('(');
  return idx > 0 ? name.slice(0, idx).trim() : name;
}

function shortSilhouetteLabel(id: SilhouetteId, rawLabel: string): string {
  switch (id) {
    case 'tshirt':
      return 'Áo thun';
    case 'shirt':
      return 'Sơ mi';
    case 'hoodie':
      return 'Hoodie';
    case 'blazer':
      return 'Blazer';
    case 'wide_pants':
      return 'Ống suông';
    case 'jeans':
      return 'Quần Jean';
    case 'shorts':
      return 'Quần Short';
    case 'a_line_skirt':
      return 'Váy chữ A';
    case 'sneakers':
      return 'Sneaker';
    case 'loafers':
      return 'Loafer';
    case 'boots':
      return 'Boot';
    default:
      return rawLabel;
  }
}

export const LookbookItemCard: React.FC<LookbookItemCardProps> = ({
  slots,
  isLayering,
  visualRatios,
  activeSlot,
  lockedCount = 0,
  onSelectSlot,
  onToggleLock,
  onUnlockAll,
}) => {
  const orderedSlots: OutfitSlotId[] = isLayering
    ? ['outerwear', 'top', 'bottom', 'shoes']
    : ['top', 'bottom', 'shoes'];

  return (
    <View style={styles.glassContainer}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderTopRow}>
          <Text style={styles.cardHeaderTitle}>BẢNG MÀU</Text>
          {lockedCount >= 2 && onUnlockAll && (
            <TouchableOpacity
              style={styles.unlockBtn}
              onPress={onUnlockAll}
              activeOpacity={0.75}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Mở khóa nhanh các món phụ"
            >
              <Text style={styles.unlockBtnText}>Mở khóa</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.cardHeaderSub}>Chạm chấm để khóa</Text>
      </View>

      <View style={styles.listWrapper}>
        {/* Đường trục dọc mảnh nối các chấm màu */}
        <View style={styles.swatchRailLine} pointerEvents="none" />

        {orderedSlots.map(slotId => {
          const item = slots[slotId];
          const isActive = activeSlot === slotId;
          const ratio = visualRatios[slotId];
          const silhouetteMeta = getSilhouetteOption(item.silhouette);
          const hsl = hexToHsl(item.color.hex);
          const iconOnSwatchColor = hsl.l > 62 ? '#111827' : '#FFFFFF';
          const displayLabel =
            slotId === 'bottom' && item.silhouette === 'a_line_skirt'
              ? 'Chân váy'
              : slotId === 'top'
              ? isLayering
                ? 'Áo trong'
                : 'Áo chính'
              : item.label;

          return (
            <View
              key={slotId}
              style={[
                styles.rowContainer,
                isActive && styles.rowContainerActive,
              ]}
            >
              {/* CỘT CHẤM TRÒN MÀU BÊN TRÁI (CHẠM ĐỂ KHÓA / MỞ KHÓA) */}
              <TouchableOpacity
                style={styles.swatchTouchArea}
                onPress={() => onToggleLock(slotId)}
                activeOpacity={0.78}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel={
                  item.locked ? `Mở khóa ${displayLabel}` : `Khóa ${displayLabel}`
                }
              >
                <View
                  style={[
                    styles.largeColorDot,
                    { backgroundColor: item.color.hex },
                    item.locked && styles.largeColorDotLocked,
                  ]}
                >
                  {item.locked ? (
                    <Ionicons
                      name="lock-closed"
                      size={11}
                      color={iconOnSwatchColor}
                    />
                  ) : (
                    <Ionicons
                      name="lock-open-outline"
                      size={11}
                      color={iconOnSwatchColor}
                      style={{ opacity: 0.72 }}
                    />
                  )}
                </View>
              </TouchableOpacity>

              {/* THÔNG TIN MÓN BÊN PHẢI (CHẠM ĐỂ CHỌN ĐỔI PHOM DÁNG) */}
              <TouchableOpacity
                style={styles.itemContentTouch}
                onPress={() => onSelectSlot(slotId)}
                activeOpacity={0.78}
              >
                <View style={styles.itemTopLine}>
                  <Ionicons
                    name={getSlotIcon(slotId, item.silhouette)}
                    size={11}
                    color={isActive ? '#111827' : '#374151'}
                  />
                  <Text
                    style={[
                      styles.itemLabel,
                      isActive && styles.itemLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {displayLabel}
                  </Text>
                </View>

                <Text style={styles.colorNameText} numberOfLines={1}>
                  {shortColorName(item.color.name)}
                </Text>

                <View style={styles.itemMetaRow}>
                  <Text style={styles.silhouetteMiniText} numberOfLines={1}>
                    {shortSilhouetteLabel(item.silhouette, silhouetteMeta.label)}
                  </Text>
                  <Text style={styles.ratioPillText}>{ratio}%</Text>
                </View>

                {item.isBase && (
                  <View style={styles.baseDotBadge}>
                    <Text style={styles.baseDotBadgeText}>Màu gốc</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  glassContainer: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    paddingVertical: 8,
    paddingHorizontal: 6,
    justifyContent: 'space-between',
  },
  cardHeader: {
    paddingHorizontal: 3,
    marginBottom: 4,
  },
  cardHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: '#1F2937',
  },
  unlockBtn: {
    backgroundColor: 'rgba(17, 24, 39, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  unlockBtnText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#111827',
    includeFontPadding: false,
  },
  cardHeaderSub: {
    fontSize: 9,
    fontWeight: '500',
    color: '#4B5563',
    marginTop: 1,
  },
  listWrapper: {
    flex: 1,
    justifyContent: 'space-evenly',
    position: 'relative',
  },
  swatchRailLine: {
    position: 'absolute',
    left: 15,
    top: 20,
    bottom: 20,
    width: 1.5,
    backgroundColor: 'rgba(17, 24, 39, 0.14)',
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 3,
    borderWidth: 1.2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginVertical: 2,
  },
  rowContainerActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderColor: '#111827',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  swatchTouchArea: {
    marginRight: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeColorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.8,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  largeColorDotLocked: {
    borderColor: '#111827',
  },
  itemContentTouch: {
    flex: 1,
    minWidth: 0,
  },
  itemTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#374151',
    marginLeft: 3,
    flexShrink: 1,
  },
  itemLabelActive: {
    color: '#111827',
  },
  colorNameText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#111827',
    marginTop: 1,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  silhouetteMiniText: {
    fontSize: 9,
    fontWeight: '500',
    color: '#4B5563',
    flex: 1,
    marginRight: 2,
  },
  ratioPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#111827',
  },
  baseDotBadge: {
    alignSelf: 'flex-start',
    marginTop: 2,
    backgroundColor: 'rgba(17, 24, 39, 0.1)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  baseDotBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#111827',
  },
});
