// src/screens/OutfitSuggestionScreen.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import {
  OutfitSilhouette,
  SilhouetteStyleType,
  OutfitSlotKey,
} from '../components/OutfitSilhouette';
import {
  generateOutfitSuggestions,
  OutfitStyleId,
  hexToHsl,
} from '../services/OutfitEngine';
import { FashionColor, FASHION_COLORS } from '../constants/fashionColors';
import { RootStackParamList } from '../../App';

type RouteProps = RouteProp<RootStackParamList, 'OutfitSuggestion'>;
type NavProps = NativeStackNavigationProp<RootStackParamList, 'OutfitSuggestion'>;

const STYLE_TABS: { id: OutfitStyleId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'neutral', label: 'Trung tính', icon: 'leaf-outline' },
  { id: 'analogous', label: 'Thanh lịch', icon: 'color-filter-outline' },
  { id: 'complementary', label: 'Nổi bật', icon: 'sparkles-outline' },
];

export const OutfitSuggestionScreen: React.FC = () => {
  const navigation = useNavigation<NavProps>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();

  // Màu gốc từ khâu hút màu (fallback màu đầu tiên nếu chưa có)
  const baseColor: FashionColor = route.params?.baseColor || FASHION_COLORS[4]; // Be Cát
  const initialRole: 'top' | 'bottom' = route.params?.baseRole || 'top';

  // State quản lý: Vai trò món đồ gốc, Kiểu dáng hiển thị, Phong cách phối màu, Món đang chọn xem
  const [baseRole, setBaseRole] = useState<'top' | 'bottom'>(initialRole);
  const [styleType, setStyleType] = useState<SilhouetteStyleType>('unisex');
  const [activeTab, setActiveTab] = useState<OutfitStyleId>('neutral');
  const [activeSlot, setActiveSlot] = useState<OutfitSlotKey | null>(null);

  // Tính toán 3 bộ outfit ngay lập tức khi baseColor hoặc baseRole thay đổi
  const outfits = useMemo(() => {
    return generateOutfitSuggestions(baseColor, baseRole);
  }, [baseColor, baseRole]);

  // Bộ outfit của tab hiện tại
  const currentOutfit = useMemo(() => {
    return outfits.find(o => o.id === activeTab) || outfits[0];
  }, [outfits, activeTab]);

  const { slots, proportions } = currentOutfit;

  // Xác định độ tương phản chữ trên thanh tỷ lệ
  const getContrastTextColor = (hex: string) => {
    const hsl = hexToHsl(hex);
    return hsl.l > 62 ? '#1F2937' : '#FFFFFF';
  };

  // Xác định món 60% và 30% theo vai trò hiện tại
  const primaryRole: 'bottom' | 'top' = proportions.bottomPercent >= proportions.topPercent ? 'bottom' : 'top';
  const secondaryRole: 'bottom' | 'top' = primaryRole === 'bottom' ? 'top' : 'bottom';

  const primarySlotColor = slots[primaryRole];
  const primaryPercent = primaryRole === 'bottom' ? proportions.bottomPercent : proportions.topPercent;

  const secondarySlotColor = slots[secondaryRole];
  const secondaryPercent = secondaryRole === 'bottom' ? proportions.bottomPercent : proportions.topPercent;

  const handleCopyPalette = () => {
    const paletteInfo = `Outfit: ${currentOutfit.title}\n• Áo (${proportions.topPercent}%): ${slots.top.name} (${slots.top.hex})\n• Quần/Váy (${proportions.bottomPercent}%): ${slots.bottom.name} (${slots.bottom.hex})\n• Phụ kiện (${proportions.accessoryPercent}%): ${slots.accessory.name} (${slots.accessory.hex})`;
    Alert.alert('📋 Đã sao chép bảng màu', paletteInfo, [{ text: 'Tuyệt vời' }]);
  };

  const handleSaveOutfit = () => {
    Alert.alert(
      '✨ Đã lưu Outfit vào bộ sưu tập',
      `Bộ phối "${currentOutfit.title}" với sắc thái chủ đạo ${baseColor.name} đã được lưu thành công!`,
      [{ text: 'Đóng' }]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* 1. HEADER */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            accessibilityLabel="Quay lại"
          >
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>

          <View style={styles.headerTitleCenter}>
            <Text style={styles.headerTitle}>Gợi ý phối đồ</Text>
            <Text style={styles.headerSubtitle}>Tỷ lệ vàng 60-30-10</Text>
          </View>

          {/* Nút chuyển đổi kiểu dáng Unisex / Nữ */}
          <View style={styles.styleTypeToggle}>
            <TouchableOpacity
              style={[
                styles.styleTypeBtn,
                styleType === 'unisex' && styles.styleTypeBtnActive,
              ]}
              onPress={() => setStyleType('unisex')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.styleTypeText,
                  styleType === 'unisex' && styles.styleTypeTextActive,
                ]}
              >
                Unisex
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.styleTypeBtn,
                styleType === 'feminine' && styles.styleTypeBtnActive,
              ]}
              onPress={() => setStyleType('feminine')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.styleTypeText,
                  styleType === 'feminine' && styles.styleTypeTextActive,
                ]}
              >
                Nữ
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 16 },
        ]}
      >
        {/* 2. THANH XÁC NHẬN MÀU GỐC & VAI TRÒ */}
        <View style={styles.roleBarCard}>
          <View style={styles.roleBarLeft}>
            <View
              style={[
                styles.baseColorSwatch,
                { backgroundColor: baseColor.hex },
              ]}
            />
            <View style={styles.baseColorInfo}>
              <Text style={styles.baseColorLabel}>Màu đã hút</Text>
              <Text style={styles.baseColorName} numberOfLines={1}>
                {baseColor.name}
              </Text>
              <Text style={styles.baseColorHex}>{baseColor.hex.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.roleSwitchCol}>
            <Text style={styles.roleQuestionText}>Màu này là:</Text>
            <View style={styles.roleButtonRow}>
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  baseRole === 'top' && styles.roleButtonActive,
                ]}
                onPress={() => setBaseRole('top')}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleButtonText,
                    baseRole === 'top' && styles.roleButtonTextActive,
                  ]}
                >
                  👕 Áo
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleButton,
                  baseRole === 'bottom' && styles.roleButtonActive,
                ]}
                onPress={() => setBaseRole('bottom')}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleButtonText,
                    baseRole === 'bottom' && styles.roleButtonTextActive,
                  ]}
                >
                  👖 Quần/Váy
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 3. KHU VỰC HIỂN THỊ CHÍNH (CENTER STAGE) */}
        <View style={styles.centerStageCard}>
          {/* Header nhỏ trên sân khấu */}
          <View style={styles.stageTopRow}>
            <View style={styles.outfitTitleBadge}>
              <Ionicons
                name={
                  activeTab === 'neutral'
                    ? 'leaf'
                    : activeTab === 'analogous'
                    ? 'color-filter'
                    : 'sparkles'
                }
                size={14}
                color="#2563EB"
              />
              <Text style={styles.outfitTitleText}>{currentOutfit.title}</Text>
            </View>
            <Text style={styles.stageHint}>Chạm vào món để xem chi tiết</Text>
          </View>

          {/* Minh họa phom dáng SVG */}
          <OutfitSilhouette
            styleType={styleType}
            topColor={slots.top}
            bottomColor={slots.bottom}
            accessoryColor={slots.accessory}
            activeSlot={activeSlot}
            onSelectSlot={slot =>
              setActiveSlot(prev => (prev === slot ? null : slot))
            }
          />
        </View>

        {/* 4. THANH TỶ LỆ 60-30-10 & CHI TIẾT 3 MÓN */}
        <View style={styles.proportionSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Tỷ lệ phối màu trang phục</Text>
            <TouchableOpacity onPress={handleCopyPalette} activeOpacity={0.7}>
              <Text style={styles.copyButtonText}>Sao chép mã</Text>
            </TouchableOpacity>
          </View>

          {/* Thanh ngang chia 3 đoạn theo tỷ lệ 60-30-10 */}
          <View style={styles.proportionBar}>
            {/* Mảng chính 60% */}
            <View
              style={[
                styles.barSegment,
                {
                  flex: primaryPercent,
                  backgroundColor: primarySlotColor.hex,
                },
              ]}
            >
              <Text
                style={[
                  styles.barPercentText,
                  { color: getContrastTextColor(primarySlotColor.hex) },
                ]}
              >
                {primaryPercent}%
              </Text>
            </View>

            {/* Mảng phụ 30% */}
            <View
              style={[
                styles.barSegment,
                {
                  flex: secondaryPercent,
                  backgroundColor: secondarySlotColor.hex,
                },
              ]}
            >
              <Text
                style={[
                  styles.barPercentText,
                  { color: getContrastTextColor(secondarySlotColor.hex) },
                ]}
              >
                {secondaryPercent}%
              </Text>
            </View>

            {/* Điểm nhấn 10% */}
            <View
              style={[
                styles.barSegment,
                {
                  flex: proportions.accessoryPercent,
                  backgroundColor: slots.accessory.hex,
                },
              ]}
            >
              <Text
                style={[
                  styles.barPercentText,
                  { color: getContrastTextColor(slots.accessory.hex) },
                ]}
              >
                {proportions.accessoryPercent}%
              </Text>
            </View>
          </View>

          {/* 3 Thẻ chi tiết món đồ */}
          <View style={styles.itemsGrid}>
            {/* Thẻ Quần / Váy */}
            <TouchableOpacity
              style={[
                styles.itemCard,
                activeSlot === 'bottom' && styles.itemCardActive,
              ]}
              onPress={() =>
                setActiveSlot(prev => (prev === 'bottom' ? null : 'bottom'))
              }
              activeOpacity={0.85}
            >
              <View style={styles.itemHeader}>
                <Text style={styles.itemRoleBadge}>
                  {proportions.bottomPercent}% • {styleType === 'feminine' ? 'Chân váy' : 'Quần'}
                </Text>
                {baseRole === 'bottom' && (
                  <View style={styles.baseTag}>
                    <Text style={styles.baseTagText}>Gốc</Text>
                  </View>
                )}
              </View>
              <View style={styles.itemBody}>
                <View
                  style={[
                    styles.itemSwatch,
                    { backgroundColor: slots.bottom.hex },
                  ]}
                />
                <View style={styles.itemTextCol}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {slots.bottom.name}
                  </Text>
                  <Text style={styles.itemHex}>
                    {slots.bottom.hex.toUpperCase()}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Thẻ Áo */}
            <TouchableOpacity
              style={[
                styles.itemCard,
                activeSlot === 'top' && styles.itemCardActive,
              ]}
              onPress={() =>
                setActiveSlot(prev => (prev === 'top' ? null : 'top'))
              }
              activeOpacity={0.85}
            >
              <View style={styles.itemHeader}>
                <Text style={styles.itemRoleBadge}>
                  {proportions.topPercent}% • Áo
                </Text>
                {baseRole === 'top' && (
                  <View style={styles.baseTag}>
                    <Text style={styles.baseTagText}>Gốc</Text>
                  </View>
                )}
              </View>
              <View style={styles.itemBody}>
                <View
                  style={[
                    styles.itemSwatch,
                    { backgroundColor: slots.top.hex },
                  ]}
                />
                <View style={styles.itemTextCol}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {slots.top.name}
                  </Text>
                  <Text style={styles.itemHex}>
                    {slots.top.hex.toUpperCase()}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Thẻ Giày & Phụ kiện */}
            <TouchableOpacity
              style={[
                styles.itemCard,
                activeSlot === 'accessory' && styles.itemCardActive,
              ]}
              onPress={() =>
                setActiveSlot(prev => (prev === 'accessory' ? null : 'accessory'))
              }
              activeOpacity={0.85}
            >
              <View style={styles.itemHeader}>
                <Text style={styles.itemRoleBadge}>
                  {proportions.accessoryPercent}% • Phụ kiện
                </Text>
              </View>
              <View style={styles.itemBody}>
                <View
                  style={[
                    styles.itemSwatch,
                    { backgroundColor: slots.accessory.hex },
                  ]}
                />
                <View style={styles.itemTextCol}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {slots.accessory.name}
                  </Text>
                  <Text style={styles.itemHex}>
                    {slots.accessory.hex.toUpperCase()}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 5. 3 TAB CHỌN PHONG CÁCH & LÝ DO PHỐI */}
        <View style={styles.styleTabsSection}>
          <Text style={styles.sectionTitle}>Phong cách phối đồ</Text>

          <View style={styles.tabButtonsRow}>
            {STYLE_TABS.map(tab => {
              const isSelected = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tabButton, isSelected && styles.tabButtonActive]}
                  onPress={() => {
                    setActiveTab(tab.id);
                    setActiveSlot(null);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={tab.icon}
                    size={16}
                    color={isSelected ? '#2563EB' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.tabButtonText,
                      isSelected && styles.tabButtonTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Thẻ giải thích lý do phối hợp mắt */}
          <View style={styles.explanationCard}>
            <View style={styles.explanationIconCircle}>
              <Ionicons name="bulb-outline" size={18} color="#D97706" />
            </View>
            <View style={styles.explanationTextCol}>
              <Text style={styles.explanationTitle}>Bí quyết phối màu</Text>
              <Text style={styles.explanationDesc}>
                {currentOutfit.subtitle}
              </Text>
            </View>
          </View>
        </View>

        {/* Nút Lưu / Thao tác cuối */}
        <TouchableOpacity
          style={styles.saveOutfitButton}
          onPress={handleSaveOutfit}
          activeOpacity={0.88}
        >
          <Ionicons name="bookmark-outline" size={18} color="#FFFFFF" />
          <Text style={styles.saveOutfitButtonText}>Lưu bộ phối đồ này</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  headerSafeArea: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  styleTypeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 18,
    padding: 3,
  },
  styleTypeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  styleTypeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  styleTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  styleTypeTextActive: {
    color: '#111827',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  // 2. Base Color & Role
  roleBarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 14,
  },
  roleBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  baseColorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    marginRight: 10,
  },
  baseColorInfo: {
    flex: 1,
  },
  baseColorLabel: {
    fontSize: 10,
    color: '#6B7280',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  baseColorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginTop: 1,
  },
  baseColorHex: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '500',
  },
  roleSwitchCol: {
    alignItems: 'flex-end',
  },
  roleQuestionText: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  roleButtonRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 2,
  },
  roleButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  roleButtonActive: {
    backgroundColor: '#2563EB',
  },
  roleButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  roleButtonTextActive: {
    color: '#FFFFFF',
  },
  // 3. Center Stage
  centerStageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  stageTopRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  outfitTitleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  outfitTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  stageHint: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  // 4. Proportion section
  proportionSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  copyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  proportionBar: {
    height: 32,
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 14,
  },
  barSegment: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  barPercentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  itemsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  itemCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  itemCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemRoleBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
  },
  baseTag: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  baseTagText: {
    fontSize: 8,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  itemBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemSwatch: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    marginRight: 6,
  },
  itemTextCol: {
    flex: 1,
  },
  itemName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  itemHex: {
    fontSize: 9,
    color: '#6B7280',
    marginTop: 1,
  },
  // 5. Tabs
  styleTabsSection: {
    marginBottom: 20,
  },
  tabButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  tabButtonActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  tabButtonTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  explanationCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  explanationIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  explanationTextCol: {
    flex: 1,
  },
  explanationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  explanationDesc: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
  },
  saveOutfitButton: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveOutfitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
