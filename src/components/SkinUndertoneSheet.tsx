// src/components/SkinUndertoneSheet.tsx
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SkinUndertone } from '../types/outfit';

export interface SkinUndertoneSheetProps {
  visible: boolean;
  selectedUndertone: SkinUndertone;
  onSelectUndertone: (undertone: SkinUndertone) => void;
  onClose: () => void;
}

interface UndertoneOptionMeta {
  id: SkinUndertone;
  title: string;
  englishTag: string;
  description: string;
  skinSwatches: [string, string, string];
  fabricSwatches: [string, string, string];
  fabricHint: string;
}

const UNDERTONE_OPTIONS: UndertoneOptionMeta[] = [
  {
    id: 'warm',
    title: 'Da ấm',
    englishTag: 'Warm',
    description:
      'Mạch máu cổ tay hơi xanh lá • Hợp trang sức vàng • Tôn da với Kem, Be, Nâu, Olive.',
    skinSwatches: ['#F2D2B1', '#D9A773', '#B47B48'],
    fabricSwatches: ['#FFF9E6', '#D8C3A5', '#556B2F'],
    fabricHint: 'Kem • Be • Olive',
  },
  {
    id: 'cool',
    title: 'Da lạnh',
    englishTag: 'Cool',
    description:
      'Mạch máu cổ tay xanh dương/tím • Hợp trang sức bạc • Tôn da với Navy, Trắng tinh, Xám, Đỏ đô.',
    skinSwatches: ['#F7DFE3', '#E0B9C1', '#B2848F'],
    fabricSwatches: ['#1B2A4A', '#FFFFFF', '#6A1A24'],
    fabricHint: 'Navy • Trắng • Đỏ đô',
  },
  {
    id: 'neutral',
    title: 'Trung tính',
    englishTag: 'Neutral',
    description:
      'Mạch máu pha cả hai • Hợp cả vàng và bạc • Dễ mặc hầu hết mọi tông màu.',
    skinSwatches: ['#F3DAC5', '#D6B196', '#AC8468'],
    fabricSwatches: ['#E8DCB8', '#374151', '#0A3641'],
    fabricHint: 'Cân bằng mọi tông',
  },
];

export const SkinUndertoneSheet: React.FC<SkinUndertoneSheetProps> = ({
  visible,
  selectedUndertone,
  onSelectUndertone,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          {/* Thanh kéo trang trí đồng bộ với ColorPaletteSheet */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTextCol}>
              <Text style={styles.title}>Chọn tông da của bạn</Text>
              <Text style={styles.subtitle}>
                Thuật toán sẽ ưu tiên sắc độ tôn da cho vùng Áo &amp; Áo khoác sát mặt
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Đóng chọn tông da"
            >
              <Ionicons name="close" size={19} color="#111827" />
            </TouchableOpacity>
          </View>

          {/* 3 thẻ chọn Tông da */}
          <View style={styles.cardsList}>
            {UNDERTONE_OPTIONS.map(opt => {
              const isSelected = selectedUndertone === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.card, isSelected && styles.cardSelected]}
                  onPress={() => onSelectUndertone(opt.id)}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel={`Chọn ${opt.title} (${opt.englishTag})`}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardTitleGroup}>
                      {/* 3 chấm mẫu tông da */}
                      <View style={styles.skinSwatchStack}>
                        {opt.skinSwatches.map((hex, idx) => (
                          <View
                            key={hex}
                            style={[
                              styles.skinDot,
                              { backgroundColor: hex },
                              idx > 0 && styles.skinDotOverlap,
                            ]}
                          />
                        ))}
                      </View>

                      <Text style={styles.cardTitle}>{opt.title}</Text>
                      <View style={styles.tagPill}>
                        <Text style={styles.tagPillText}>{opt.englishTag}</Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.checkCircle,
                        isSelected && styles.checkCircleSelected,
                      ]}
                    >
                      {isSelected && (
                        <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                      )}
                    </View>
                  </View>

                  <Text style={styles.cardDesc}>{opt.description}</Text>

                  {/* Hàng 3 chấm nhóm màu vải hợp */}
                  <View style={styles.fabricPreviewRow}>
                    <View style={styles.fabricDotsGroup}>
                      {opt.fabricSwatches.map(hex => (
                        <View
                          key={hex}
                          style={[
                            styles.fabricMiniDot,
                            { backgroundColor: hex },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={styles.fabricHintText}>{opt.fabricHint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.footerNote}>
            Quần &amp; Giày ở xa khuôn mặt vẫn được phối tự do theo hoàn cảnh • Tự động lưu trên máy
          </Text>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTextCol: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 15.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardsList: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  cardSelected: {
    borderColor: '#111827',
    backgroundColor: '#F9FAFB',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skinSwatchStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 9,
  },
  skinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  skinDotOverlap: {
    marginLeft: -5,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  tagPill: {
    marginLeft: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  tagPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
  },
  checkCircle: {
    width: 21,
    height: 21,
    borderRadius: 10.5,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  cardDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    color: '#4B5563',
    fontWeight: '500',
    marginBottom: 7,
  },
  fabricPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fabricDotsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 7,
  },
  fabricMiniDot: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    marginRight: 4,
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.16)',
  },
  fabricHintText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#6B7280',
  },
  footerNote: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 18,
    marginTop: 12,
  },
});

export default SkinUndertoneSheet;
