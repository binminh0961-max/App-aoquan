// src/components/ColorPaletteSheet.tsx
import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FashionColor, FASHION_COLORS } from '../constants/fashionColors';
import { OutfitSlotId, SkinUndertone } from '../types/outfit';
import {
  evaluateColorForUndertone,
  getGroupedFashionColors,
  getUndertoneLabel,
  hexToHsl,
  shortColorName,
} from '../engine/OutfitEngine';

export interface ColorPaletteSheetProps {
  visible: boolean;
  slotLabel: string;
  slotId?: OutfitSlotId;
  undertone?: SkinUndertone;
  selectedColorId: string;
  onSelectColor: (color: FashionColor) => void;
  onClose: () => void;
}

export const ColorPaletteSheet: React.FC<ColorPaletteSheetProps> = ({
  visible,
  slotLabel,
  slotId,
  undertone = 'neutral',
  selectedColorId,
  onSelectColor,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const sections = useMemo(() => getGroupedFashionColors(), []);

  // Chỉ đánh dấu "Tôn da" cho các món nằm sát khuôn mặt (Áo / Áo khoác) khi chọn Da ấm hoặc Da lạnh
  const showUndertoneHints =
    (slotId === 'top' || slotId === 'outerwear') &&
    (undertone === 'warm' || undertone === 'cool');
  const undertoneLabel = getUndertoneLabel(undertone);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Chạm vùng nền mờ bên ngoài để đóng */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          {/* Thanh kéo trang trí trên đỉnh sheet */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTextCol}>
              <Text style={styles.title} numberOfLines={1}>
                Chọn màu cho {slotLabel}
              </Text>
              <Text style={styles.subtitle}>
                {FASHION_COLORS.length} màu vải chuẩn • Tự động khóa món khi chọn
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Đóng bảng màu"
            >
              <Ionicons name="close" size={19} color="#111827" />
            </TouchableOpacity>
          </View>

          {/* Ghi chú đánh dấu màu tôn da cho món sát khuôn mặt */}
          {showUndertoneHints && (
            <View style={styles.undertoneBanner}>
              <Ionicons name="sparkles" size={12} color="#B45309" />
              <Text style={styles.undertoneBannerText}>
                Đang đánh dấu màu tôn {undertoneLabel}
              </Text>
            </View>
          )}

          {/* Danh sách 4 nhóm màu dạng lưới 5 cột */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {sections.map(section => (
              <View key={section.id} style={styles.sectionBlock}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>{section.label}</Text>
                  <Text style={styles.sectionCount}>
                    {section.colors.length} màu
                  </Text>
                </View>

                <View style={styles.grid}>
                  {section.colors.map(color => {
                    const isSelected = color.id === selectedColorId;
                    const hsl = hexToHsl(color.hex);
                    const tickColor = hsl.l > 64 ? '#111827' : '#FFFFFF';
                    const isVeryLight = hsl.l > 88;
                    const isFlattering =
                      showUndertoneHints &&
                      evaluateColorForUndertone(color, undertone) === 'flattering';

                    return (
                      <TouchableOpacity
                        key={color.id}
                        style={styles.swatchCell}
                        onPress={() => onSelectColor(color)}
                        activeOpacity={0.78}
                        accessibilityLabel={`Chọn màu ${color.name}${
                          isFlattering ? `, tôn ${undertoneLabel}` : ''
                        }`}
                      >
                        <View
                          style={[
                            styles.swatchRing,
                            isSelected && styles.swatchRingSelected,
                          ]}
                        >
                          <View
                            style={[
                              styles.swatchCircle,
                              { backgroundColor: color.hex },
                              isVeryLight && styles.swatchCircleLightBorder,
                            ]}
                          >
                            {isSelected && (
                              <Ionicons
                                name="checkmark"
                                size={17}
                                color={tickColor}
                              />
                            )}
                          </View>

                          {isFlattering && (
                            <View style={styles.flatteringStarDot}>
                              <Ionicons name="star" size={8} color="#FFFFFF" />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.swatchLabel,
                            isSelected && styles.swatchLabelSelected,
                          ]}
                          numberOfLines={2}
                        >
                          {shortColorName(color.name)}
                        </Text>
                        {isFlattering && (
                          <View style={styles.flatteringBadge}>
                            <Text style={styles.flatteringBadgeText}>Tôn da</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '76%',
    paddingTop: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 16,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTextCol: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  undertoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1,
    borderBottomColor: '#FEF3C7',
    paddingHorizontal: 18,
    paddingVertical: 7,
  },
  undertoneBannerText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
    marginLeft: 6,
  },
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionBlock: {
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1F2937',
    letterSpacing: 0.2,
  },
  sectionCount: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  swatchCell: {
    width: '20%',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  swatchRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  swatchRingSelected: {
    borderColor: '#111827',
  },
  flatteringStarDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F59E0B',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.12)',
  },
  swatchCircleLightBorder: {
    borderColor: '#D1D5DB',
  },
  swatchLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#4B5563',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 12,
  },
  swatchLabelSelected: {
    color: '#111827',
    fontWeight: '800',
  },
  flatteringBadge: {
    marginTop: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
  },
  flatteringBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#B45309',
    includeFontPadding: false,
  },
});

export default ColorPaletteSheet;
