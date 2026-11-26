// src/screens/LookbookScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { FASHION_COLORS } from '../constants/fashionColors';
import {
  getSilhouetteOption,
  hexToHsl,
  shortColorName,
} from '../engine/OutfitEngine';
import { getGradeFromScore } from '../engine/MatchCheckerEngine';
import {
  deleteSavedOutfit,
  getCachedSavedOutfits,
  loadSavedOutfits,
  Occasion,
  renameSavedOutfit,
  resolveFashionColorFromItem,
  SAVED_OCCASION_LABELS,
  SavedOutfit,
} from '../services/lookbookStorage';
import {
  getCachedMonetizationState,
  IS_REAL_ADMOB_ENABLED,
  loadMonetizationState,
  MonetizationState,
  REWARDED_BONUS_SLOTS,
} from '../services/monetizationService';
import { AdBannerSlot } from '../components/AdBannerSlot';
import { RewardedUnlockModal } from '../components/RewardedUnlockModal';
import { SettingsPrivacyModal } from '../components/SettingsPrivacyModal';
import { SilhouetteId } from '../types/outfit';
import { RootStackParamList } from '../../App';

type NavProps = NativeStackNavigationProp<RootStackParamList, 'Lookbook'>;
type FilterOccasion = 'all' | Occasion;

const FILTER_CHIPS: {
  id: FilterOccasion;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'all', label: 'Tất cả', icon: 'apps-outline' },
  { id: 'study', label: 'Đi học', icon: 'school-outline' },
  { id: 'work', label: 'Đi làm', icon: 'briefcase-outline' },
  { id: 'casual', label: 'Đi chơi', icon: 'cafe-outline' },
  { id: 'party', label: 'Tiệc tối', icon: 'sparkles-outline' },
];

function isLightHex(hex: string): boolean {
  return hexToHsl(hex).l > 80;
}

function getRatioSegments(outfit: SavedOutfit): { key: string; hex: string; flex: number }[] {
  const { items, isLayering } = outfit;
  const topFactor = getSilhouetteOption(items.top.silhouette as SilhouetteId).areaFactor;
  const bottomFactor = getSilhouetteOption(items.bottom.silhouette as SilhouetteId).areaFactor;
  const shoesFactor = getSilhouetteOption(items.shoes.silhouette as SilhouetteId).areaFactor;

  if (isLayering && items.outerwear) {
    const outerFactor = getSilhouetteOption(
      items.outerwear.silhouette as SilhouetteId
    ).areaFactor;
    return [
      { key: 'outer', hex: items.outerwear.hex, flex: Math.max(15, Math.round(40 * outerFactor)) },
      { key: 'top', hex: items.top.hex, flex: Math.max(10, Math.round(20 * topFactor)) },
      { key: 'bottom', hex: items.bottom.hex, flex: Math.max(15, Math.round(30 * bottomFactor)) },
      { key: 'shoes', hex: items.shoes.hex, flex: Math.max(6, Math.round(10 * shoesFactor)) },
    ];
  }

  return [
    { key: 'bottom', hex: items.bottom.hex, flex: Math.max(20, Math.round(60 * bottomFactor)) },
    { key: 'top', hex: items.top.hex, flex: Math.max(15, Math.round(30 * topFactor)) },
    { key: 'shoes', hex: items.shoes.hex, flex: Math.max(6, Math.round(10 * shoesFactor)) },
  ];
}

function getUndertoneBadgeStyle(label?: string): { bg: string; fg: string } {
  if (label === 'Tôn da') return { bg: '#ECFDF5', fg: '#15803D' };
  if (label === 'Cần lưu ý') return { bg: '#FEF3C7', fg: '#B45309' };
  return { bg: '#F3F4F6', fg: '#4B5563' };
}

interface Outfit2DPreviewProps {
  outfit: SavedOutfit;
  compareSlot: 'A' | 'B' | null;
}

/**
 * Thẻ preview 2D siêu nhẹ (0 Skia, 0 WebGL) giữ 60fps mượt mà cho FlatList.
 * Mô phỏng trực quan cấu trúc tầng trang phục: Áo (+ Áo khoác nếu layering) -> Quần/Váy -> 2 chấm Giày.
 */
const Outfit2DPreview: React.FC<Outfit2DPreviewProps> = React.memo(
  ({ outfit, compareSlot }) => {
    const { items, isLayering, gender, harmonyScore } = outfit;
    const { gradeColor } = getGradeFromScore(harmonyScore);

    const topHex = items.top.hex;
    const outerHex = items.outerwear?.hex;
    const bottomHex = items.bottom.hex;
    const shoesHex = items.shoes.hex;

    const isSkirt =
      items.bottom.silhouette === 'a_line_skirt' ||
      items.bottom.silhouette === 'mini_skirt';
    const isShortBottom =
      items.bottom.silhouette === 'shorts' ||
      items.bottom.silhouette === 'mini_skirt';
    const isCroppedTop = items.top.silhouette === 'baby_tee';

    const topLight = isLightHex(topHex);
    const outerLight = outerHex ? isLightHex(outerHex) : false;
    const bottomLight = isLightHex(bottomHex);
    const shoesLight = isLightHex(shoesHex);

    return (
      <View style={styles.previewBox}>
        {/* Badge Nam / Nữ góc trên trái */}
        <View style={styles.genderBadge}>
          <Text style={styles.genderBadgeText}>
            {gender === 'female' ? 'Nữ' : 'Nam'}
          </Text>
        </View>

        {/* Badge điểm hài hòa góc trên phải */}
        <View style={[styles.scoreBadge, { backgroundColor: '#FFFFFFEE' }]}>
          <View style={[styles.scoreDot, { backgroundColor: gradeColor }]} />
          <Text style={[styles.scoreBadgeText, { color: gradeColor }]}>
            {harmonyScore}đ
          </Text>
        </View>

        {/* Khối mô phỏng trang phục 2D theo tầng dọc */}
        <View style={styles.garmentStack}>
          {/* Tầng 1: Áo (+ dải Áo khoác 2 bên nếu Layering) */}
          <View style={styles.topRowWrap}>
            {isLayering && outerHex ? (
              <View style={styles.layeredTopRow}>
                <View
                  style={[
                    styles.outerFlankLeft,
                    { backgroundColor: outerHex },
                    outerLight && styles.lightFabricStroke,
                  ]}
                />
                <View
                  style={[
                    styles.innerTopCore,
                    { backgroundColor: topHex },
                    topLight && styles.lightFabricStroke,
                  ]}
                >
                  <View style={styles.collarCutout} />
                </View>
                <View
                  style={[
                    styles.outerFlankRight,
                    { backgroundColor: outerHex },
                    outerLight && styles.lightFabricStroke,
                  ]}
                />
              </View>
            ) : (
              <View style={styles.singleTopRow}>
                <View
                  style={[
                    styles.sleeveLeft,
                    { backgroundColor: topHex },
                    topLight && styles.lightFabricStroke,
                  ]}
                />
                <View
                  style={[
                    styles.singleTopTorso,
                    isCroppedTop && styles.singleTopTorsoCropped,
                    { backgroundColor: topHex },
                    topLight && styles.lightFabricStroke,
                  ]}
                >
                  <View style={styles.collarCutout} />
                </View>
                <View
                  style={[
                    styles.sleeveRight,
                    { backgroundColor: topHex },
                    topLight && styles.lightFabricStroke,
                  ]}
                />
              </View>
            )}
          </View>

          {/* Tầng 2: Quần hoặc Chân váy */}
          {isSkirt ? (
            <View
              style={[
                styles.skirtBlock,
                isShortBottom && styles.skirtBlockMini,
                { backgroundColor: bottomHex },
                bottomLight && styles.lightFabricStroke,
              ]}
            />
          ) : (
            <View style={styles.pantsRow}>
              <View
                style={[
                  styles.pantLeg,
                  isShortBottom && styles.pantLegShort,
                  { backgroundColor: bottomHex },
                  bottomLight && styles.lightFabricStroke,
                ]}
              />
              <View
                style={[
                  styles.pantLeg,
                  isShortBottom && styles.pantLegShort,
                  { backgroundColor: bottomHex },
                  bottomLight && styles.lightFabricStroke,
                ]}
              />
            </View>
          )}

          {/* Tầng 3: 2 chấm đế Giày */}
          <View style={styles.shoesRow}>
            <View
              style={[
                styles.shoePill,
                { backgroundColor: shoesHex },
                shoesLight && styles.lightFabricStroke,
              ]}
            />
            <View
              style={[
                styles.shoePill,
                { backgroundColor: shoesHex },
                shoesLight && styles.lightFabricStroke,
              ]}
            />
          </View>
        </View>

        {/* Badge nổi A / B khi ở chế độ chọn So sánh */}
        {compareSlot && (
          <View
            style={[
              styles.compareCornerBadge,
              compareSlot === 'A'
                ? styles.compareCornerBadgeA
                : styles.compareCornerBadgeB,
            ]}
          >
            <Text style={styles.compareCornerBadgeText}>{compareSlot}</Text>
          </View>
        )}
      </View>
    );
  }
);

export const LookbookScreen: React.FC = () => {
  const navigation = useNavigation<NavProps>();
  const insets = useSafeAreaInsets();

  const [outfits, setOutfits] = useState<SavedOutfit[]>(() => getCachedSavedOutfits());
  const [selectedOccasion, setSelectedOccasion] = useState<FilterOccasion>('all');
  const [maxWardrobeSlots, setMaxWardrobeSlots] = useState<number>(
    () => getCachedMonetizationState().maxWardrobeSlots
  );
  const [unlockModalVisible, setUnlockModalVisible] = useState<boolean>(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState<boolean>(false);

  // Chế độ chọn So sánh 2 phương án
  const [isCompareMode, setIsCompareMode] = useState<boolean>(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  // Modal đổi tên bộ đồ
  const [renamingOutfit, setRenamingOutfit] = useState<SavedOutfit | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');

  // Toast nhẹ
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Nạp lại danh sách & hạn mức ô Tủ đồ mỗi khi quay lại màn hình Tủ đồ
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadSavedOutfits(), loadMonetizationState()]).then(
        ([list, monetState]) => {
          if (!active) return;
          setOutfits(list);
          setMaxWardrobeSlots(monetState.maxWardrobeSlots);
          setCompareIds(prev => prev.filter(id => list.some(o => o.id === id)));
          if (list.length < 2) {
            setIsCompareMode(false);
          }
        }
      );
      return () => {
        active = false;
      };
    }, [])
  );

  const handleWardrobeUnlocked = useCallback(
    (nextState: MonetizationState) => {
      setMaxWardrobeSlots(nextState.maxWardrobeSlots);
      setUnlockModalVisible(false);
      showToast(`Đã mở khóa thêm +${REWARDED_BONUS_SLOTS} ô Tủ đồ!`);
    },
    [showToast]
  );

  const isNearSlotLimit = outfits.length >= Math.max(1, maxWardrobeSlots - 1);
  const isBannerRendered = IS_REAL_ADMOB_ENABLED || __DEV__;

  const filteredOutfits = useMemo(() => {
    if (selectedOccasion === 'all') return outfits;
    return outfits.filter(item => item.occasion === selectedOccasion);
  }, [outfits, selectedOccasion]);

  const outfitA = useMemo(
    () => (compareIds[0] ? outfits.find(o => o.id === compareIds[0]) ?? null : null),
    [compareIds, outfits]
  );
  const outfitB = useMemo(
    () => (compareIds[1] ? outfits.find(o => o.id === compareIds[1]) ?? null : null),
    [compareIds, outfits]
  );

  const canEnterCompare = outfits.length >= 2;
  const canLaunchCompare = Boolean(outfitA && outfitB);

  const handleToggleCompareMode = useCallback(() => {
    if (!canEnterCompare) {
      showToast('Hãy lưu ít nhất 2 bộ đồ để so sánh');
      return;
    }
    setIsCompareMode(prev => {
      const next = !prev;
      if (!next) {
        setCompareIds([]);
      }
      return next;
    });
  }, [canEnterCompare, showToast]);

  const handlePressCard = useCallback(
    (outfit: SavedOutfit) => {
      if (isCompareMode) {
        setCompareIds(prev => {
          if (prev.includes(outfit.id)) {
            return prev.filter(id => id !== outfit.id);
          }
          if (prev.length >= 2) {
            showToast('Đã chọn đủ Bộ A và Bộ B — chạm lại để bỏ chọn');
            return prev;
          }
          return [...prev, outfit.id];
        });
        return;
      }

      const primaryItem =
        outfit.isLayering && outfit.items.outerwear
          ? outfit.items.outerwear
          : outfit.items.top;
      navigation.navigate('OutfitSuggestion', {
        baseColor: resolveFashionColorFromItem(primaryItem),
        baseRole: 'top',
        loadSavedOutfit: outfit,
      });
    },
    [isCompareMode, navigation, showToast]
  );

  const handleLaunchCompare = useCallback(() => {
    if (!outfitA || !outfitB) return;
    navigation.navigate('CompareOutfits', {
      outfitA,
      outfitB,
    });
  }, [navigation, outfitA, outfitB]);

  const handleOpenRename = useCallback((outfit: SavedOutfit) => {
    setRenamingOutfit(outfit);
    setRenameDraft(outfit.title);
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (!renamingOutfit) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      showToast('Tên bộ đồ không được để trống');
      return;
    }
    const updated = await renameSavedOutfit(renamingOutfit.id, trimmed);
    setOutfits(updated);
    setRenamingOutfit(null);
    showToast('Đã cập nhật tên bộ đồ');
  }, [renameDraft, renamingOutfit, showToast]);

  const handleConfirmDelete = useCallback(
    (outfit: SavedOutfit) => {
      Alert.alert(
        'Xóa bộ đồ?',
        `Bạn có chắc muốn xóa "${outfit.title}" khỏi Tủ đồ cá nhân không?`,
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Xóa',
            style: 'destructive',
            onPress: async () => {
              const updated = await deleteSavedOutfit(outfit.id);
              setOutfits(updated);
              setCompareIds(prev => prev.filter(id => id !== outfit.id));
              if (updated.length < 2) {
                setIsCompareMode(false);
              }
              showToast('Đã xóa khỏi Tủ đồ');
            },
          },
        ]
      );
    },
    [showToast]
  );

  const handleOpenStudioFromEmpty = useCallback(() => {
    navigation.navigate('OutfitSuggestion', {
      baseColor: FASHION_COLORS[4], // Be Cát
      baseRole: 'top',
    });
  }, [navigation]);

  const renderOutfitCard = useCallback(
    ({ item }: { item: SavedOutfit }) => {
      const compareIdx = compareIds.indexOf(item.id);
      const compareSlot: 'A' | 'B' | null =
        compareIdx === 0 ? 'A' : compareIdx === 1 ? 'B' : null;
      const ratioSegments = getRatioSegments(item);
      const topShapeLabel = getSilhouetteOption(item.items.top.silhouette as SilhouetteId).label;
      const bottomShapeLabel = getSilhouetteOption(
        item.items.bottom.silhouette as SilhouetteId
      ).label;
      const shapeSummary =
        item.isLayering && item.items.outerwear
          ? `${getSilhouetteOption(item.items.outerwear.silhouette as SilhouetteId).label} • ${bottomShapeLabel}`
          : `${topShapeLabel} • ${bottomShapeLabel}`;
      const undertoneBadge = getUndertoneBadgeStyle(item.undertoneLabel);

      return (
        <TouchableOpacity
          style={[
            styles.card,
            compareSlot === 'A' && styles.cardSelectedA,
            compareSlot === 'B' && styles.cardSelectedB,
          ]}
          onPress={() => handlePressCard(item)}
          activeOpacity={0.86}
        >
          <Outfit2DPreview outfit={item} compareSlot={compareSlot} />

          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>

            <View style={styles.cardMetaRow}>
              <View style={styles.occasionTag}>
                <Text style={styles.occasionTagText} numberOfLines={1}>
                  {SAVED_OCCASION_LABELS[item.occasion]}
                </Text>
              </View>
              <Text style={styles.shapeSummaryText} numberOfLines={1}>
                {shapeSummary}
              </Text>
            </View>

            {/* Dải tỷ lệ màu 60-30-10 nhỏ gọn */}
            <View style={styles.miniRatioBar}>
              {ratioSegments.map(seg => (
                <View
                  key={seg.key}
                  style={[
                    styles.miniRatioSegment,
                    { flex: seg.flex, backgroundColor: seg.hex },
                  ]}
                />
              ))}
            </View>

            {/* Hàng đáy thẻ: Nhãn tôn da + 2 nút mini Sửa tên & Xóa */}
            <View style={styles.cardFooterRow}>
              {item.undertoneLabel ? (
                <View
                  style={[
                    styles.undertoneMiniPill,
                    { backgroundColor: undertoneBadge.bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.undertoneMiniText,
                      { color: undertoneBadge.fg },
                    ]}
                    numberOfLines={1}
                  >
                    {item.undertoneLabel}
                  </Text>
                </View>
              ) : (
                <View />
              )}

              {!isCompareMode ? (
                <View style={styles.cardMiniActions}>
                  <TouchableOpacity
                    style={styles.miniIconBtn}
                    onPress={() => handleOpenRename(item)}
                    activeOpacity={0.75}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 4 }}
                    accessibilityLabel={`Sửa tên ${item.title}`}
                  >
                    <Ionicons name="pencil-outline" size={14} color="#374151" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.miniIconBtn}
                    onPress={() => handleConfirmDelete(item)}
                    activeOpacity={0.75}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
                    accessibilityLabel={`Xóa ${item.title}`}
                  >
                    <Ionicons name="trash-outline" size={14} color="#B91C1C" />
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.comparePickHint}>
                  {compareSlot ? `Đã chọn ${compareSlot}` : 'Chạm chọn'}
                </Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [
      compareIds,
      handleConfirmDelete,
      handleOpenRename,
      handlePressCard,
      isCompareMode,
    ]
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* 1. HEADER GỌN GÀNG */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.78}
              accessibilityLabel="Quay lại"
            >
              <Ionicons name="arrow-back" size={20} color="#111827" />
            </TouchableOpacity>

            <View style={styles.headerTitleCol}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                Tủ đồ của tôi
              </Text>
              <View style={styles.quotaSubtitleRow}>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {outfits.length} / {maxWardrobeSlots} ô đã dùng
                </Text>
                <TouchableOpacity
                  style={[
                    styles.addSlotsPill,
                    isNearSlotLimit && styles.addSlotsPillHighlight,
                  ]}
                  onPress={() => setUnlockModalVisible(true)}
                  activeOpacity={0.8}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
                  accessibilityLabel={`Mở thêm ${REWARDED_BONUS_SLOTS} ô Tủ đồ`}
                >
                  <Text
                    style={[
                      styles.addSlotsPillText,
                      isNearSlotLimit && styles.addSlotsPillTextHighlight,
                    ]}
                    numberOfLines={1}
                  >
                    +{REWARDED_BONUS_SLOTS} ô
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.headerRightGroup}>
            <TouchableOpacity
              style={[
                styles.compareToggleBtn,
                canEnterCompare && !isCompareMode && styles.compareToggleBtnReady,
                isCompareMode && styles.compareToggleBtnCancel,
                !canEnterCompare && styles.compareToggleBtnDisabled,
              ]}
              onPress={handleToggleCompareMode}
              activeOpacity={0.82}
              accessibilityLabel={isCompareMode ? 'Hủy chế độ so sánh' : 'Bật chế độ so sánh'}
            >
              <Ionicons
                name={isCompareMode ? 'close' : 'git-compare-outline'}
                size={15}
                color={
                  isCompareMode
                    ? '#111827'
                    : canEnterCompare
                    ? '#FFFFFF'
                    : '#9CA3AF'
                }
              />
              <Text
                style={[
                  styles.compareToggleText,
                  canEnterCompare && !isCompareMode && styles.compareToggleTextReady,
                  isCompareMode && styles.compareToggleTextCancel,
                  !canEnterCompare && styles.compareToggleTextDisabled,
                ]}
              >
                {isCompareMode ? 'Hủy' : 'So sánh'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsHeaderBtn}
              onPress={() => setSettingsModalVisible(true)}
              activeOpacity={0.78}
              accessibilityLabel="Cài đặt và Chính sách bảo mật"
            >
              <Ionicons name="settings-outline" size={18} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Thanh hướng dẫn gọn khi bật chế độ So sánh */}
        {isCompareMode && (
          <View style={styles.compareGuideBar}>
            <Ionicons name="sparkles-outline" size={14} color="#0F766E" />
            <Text style={styles.compareGuideText}>
              Chạm chọn 2 bộ đồ bất kỳ để đặt cạnh nhau 3D (Bộ A & Bộ B)
            </Text>
          </View>
        )}

        {/* 2. THANH LỌC 4 HOÀN CẢNH */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {FILTER_CHIPS.map(chip => {
            const isSelected = selectedOccasion === chip.id;
            const count =
              chip.id === 'all'
                ? outfits.length
                : outfits.filter(o => o.occasion === chip.id).length;

            return (
              <TouchableOpacity
                key={chip.id}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => setSelectedOccasion(chip.id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={chip.icon}
                  size={13}
                  color={isSelected ? '#FFFFFF' : '#4B5563'}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextActive,
                  ]}
                >
                  {chip.label}
                </Text>
                {count > 0 && (
                  <View
                    style={[
                      styles.filterCountPill,
                      isSelected && styles.filterCountPillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterCountText,
                        isSelected && styles.filterCountTextActive,
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {/* 3. LƯỚI 2 CỘT HOẶC EMPTY STATE (NẰM SẠCH PHÍA TRÊN COMPARE BAR & BANNER ĐÁY) */}
      <View style={styles.mainContentArea}>
        {filteredOutfits.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconCircle}>
              <Ionicons
                name={outfits.length === 0 ? 'shirt-outline' : 'funnel-outline'}
                size={34}
                color="#111827"
              />
            </View>
            <Text style={styles.emptyTitle}>
              {outfits.length === 0
                ? 'Tủ đồ của bạn đang trống'
                : `Chưa có bộ đồ cho dịp ${
                    selectedOccasion === 'all'
                      ? 'này'
                      : SAVED_OCCASION_LABELS[selectedOccasion]
                  }`}
            </Text>
            <Text style={styles.emptySubtitle}>
              {outfits.length === 0
                ? 'Lưu những công thức phối màu ưng ý từ Studio hoặc Chấm điểm 2 món để xem lại và so sánh 3D cạnh nhau.'
                : 'Thử chuyển sang mục Tất cả hoặc mở Studio để lưu thêm một phương án mới.'}
            </Text>

            {outfits.length === 0 ? (
              <TouchableOpacity
                style={styles.emptyCtaBtn}
                onPress={handleOpenStudioFromEmpty}
                activeOpacity={0.86}
              >
                <Ionicons name="layers-outline" size={18} color="#FFFFFF" />
                <Text style={styles.emptyCtaText}>Mở Studio phối đồ</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.emptyCtaBtn}
                onPress={() => setSelectedOccasion('all')}
                activeOpacity={0.86}
              >
                <Text style={styles.emptyCtaText}>Xem tất cả ({outfits.length})</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredOutfits}
            keyExtractor={item => item.id}
            numColumns={2}
            renderItem={renderOutfitCard}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={[
              styles.gridContent,
              {
                paddingBottom:
                  isBannerRendered || isCompareMode
                    ? 16
                    : Math.max(insets.bottom, 20) + 12,
              },
            ]}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            initialNumToRender={8}
            windowSize={7}
          />
        )}
      </View>

      {/* 4. THANH NỔI CHỌN SO SÁNH A vs B (LUÔN NẰM PHÍA TRÊN BANNER, KHÔNG ĐÈ NHAU) */}
      {isCompareMode && (
        <View
          style={[
            styles.compareBottomBar,
            {
              paddingBottom: isBannerRendered
                ? 12
                : Math.max(insets.bottom, 14),
            },
          ]}
        >
          <View style={styles.compareSlotsSummaryRow}>
            {/* Tóm tắt Bộ A */}
            <View style={[styles.compareSummaryPill, outfitA && styles.compareSummaryPillA]}>
              <View style={[styles.summaryLetterBadge, styles.compareCornerBadgeA]}>
                <Text style={styles.summaryLetterText}>A</Text>
              </View>
              {outfitA ? (
                <>
                  <View
                    style={[
                      styles.summaryColorDot,
                      { backgroundColor: outfitA.items.top.hex },
                    ]}
                  />
                  <Text style={styles.summaryTitleText} numberOfLines={1}>
                    {shortColorName(outfitA.title)}
                  </Text>
                </>
              ) : (
                <Text style={styles.summaryPlaceholderText} numberOfLines={1}>
                  Chọn Bộ A
                </Text>
              )}
            </View>

            <Text style={styles.vsDividerText}>vs</Text>

            {/* Tóm tắt Bộ B */}
            <View style={[styles.compareSummaryPill, outfitB && styles.compareSummaryPillB]}>
              <View style={[styles.summaryLetterBadge, styles.compareCornerBadgeB]}>
                <Text style={styles.summaryLetterText}>B</Text>
              </View>
              {outfitB ? (
                <>
                  <View
                    style={[
                      styles.summaryColorDot,
                      { backgroundColor: outfitB.items.top.hex },
                    ]}
                  />
                  <Text style={styles.summaryTitleText} numberOfLines={1}>
                    {shortColorName(outfitB.title)}
                  </Text>
                </>
              ) : (
                <Text style={styles.summaryPlaceholderText} numberOfLines={1}>
                  Chọn Bộ B
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.compareLaunchBtn,
              !canLaunchCompare && styles.compareLaunchBtnDisabled,
            ]}
            disabled={!canLaunchCompare}
            onPress={handleLaunchCompare}
            activeOpacity={0.86}
          >
            <Ionicons
              name="git-compare-outline"
              size={18}
              color={canLaunchCompare ? '#FFFFFF' : '#9CA3AF'}
            />
            <Text
              style={[
                styles.compareLaunchBtnText,
                !canLaunchCompare && styles.compareLaunchBtnTextDisabled,
              ]}
            >
              So sánh A vs B →
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 5. VỊ TRÍ ADMOB ADAPTIVE BANNER CỐ ĐỊNH Ở ĐÁY MÀN HÌNH */}
      <AdBannerSlot respectBottomInset />

      {/* MODAL MỞ KHÓA THÊM +3 Ô TỦ ĐỒ (REWARDED AD) */}
      <RewardedUnlockModal
        visible={unlockModalVisible}
        savedCount={outfits.length}
        maxWardrobeSlots={maxWardrobeSlots}
        mode={outfits.length >= maxWardrobeSlots ? 'full_gate' : 'expand'}
        onClose={() => setUnlockModalVisible(false)}
        onUnlocked={handleWardrobeUnlocked}
      />

      {/* MODAL CÀI ĐẶT & CHÍNH SÁCH BẢO MẬT */}
      <SettingsPrivacyModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
      />

      {/* MODAL ĐỔI TÊN BỘ ĐỒ */}
      <Modal
        visible={renamingOutfit !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRenamingOutfit(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setRenamingOutfit(null)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Đổi tên bộ đồ</Text>
            <Text style={styles.modalHint}>
              Đặt tên dễ nhớ theo dịp mặc hoặc tông màu chủ đạo
            </Text>
            <TextInput
              style={styles.modalInput}
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder="VD: Đi làm • Navy & Be Cát"
              placeholderTextColor="#9CA3AF"
              maxLength={48}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleConfirmRename}
            />
            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRenamingOutfit(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleConfirmRename}
                activeOpacity={0.85}
              >
                <Text style={styles.modalSaveText}>Lưu tên</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* TOAST NHẸ */}
      {toastMessage && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toastPill}>
            <Ionicons name="checkmark-circle-outline" size={15} color="#FFFFFF" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F4F1',
  },
  headerSafe: {
    backgroundColor: '#F4F4F1',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  settingsHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#6B7280',
    flexShrink: 1,
  },
  quotaSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  addSlotsPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    flexShrink: 0,
  },
  addSlotsPillHighlight: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  addSlotsPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#111827',
    includeFontPadding: false,
  },
  addSlotsPillTextHighlight: {
    color: '#FFFFFF',
  },
  mainContentArea: {
    flex: 1,
    minHeight: 0,
  },
  compareToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  compareToggleBtnReady: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  compareToggleBtnCancel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#111827',
  },
  compareToggleBtnDisabled: {
    backgroundColor: '#EAEAE6',
    borderColor: '#E5E7EB',
  },
  compareToggleText: {
    fontSize: 12.5,
    fontWeight: '700',
    marginLeft: 5,
    includeFontPadding: false,
  },
  compareToggleTextReady: {
    color: '#FFFFFF',
  },
  compareToggleTextCancel: {
    color: '#111827',
  },
  compareToggleTextDisabled: {
    color: '#9CA3AF',
  },
  compareGuideBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  compareGuideText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#065F46',
    marginLeft: 6,
  },
  filterScrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 7,
  },
  filterChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 5,
    includeFontPadding: false,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterCountPill: {
    marginLeft: 5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountPillActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
    fontVariant: ['tabular-nums'],
  },
  filterCountTextActive: {
    color: '#FFFFFF',
  },

  // GRID
  gridContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  card: {
    width: '48.4%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 9,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardSelectedA: {
    borderColor: '#111827',
    borderWidth: 2,
    shadowOpacity: 0.14,
  },
  cardSelectedB: {
    borderColor: '#0F766E',
    borderWidth: 2,
    shadowOpacity: 0.14,
  },

  // 2D PREVIEW BLOCK (~118px)
  previewBox: {
    height: 118,
    backgroundColor: '#E8E8E4',
    borderRadius: 12,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  genderBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  genderBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#111827',
  },
  scoreBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  scoreDot: {
    width: 5.5,
    height: 5.5,
    borderRadius: 3,
    marginRight: 4,
  },
  scoreBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  compareCornerBadge: {
    position: 'absolute',
    bottom: 7,
    right: 7,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  compareCornerBadgeA: {
    backgroundColor: '#111827',
  },
  compareCornerBadgeB: {
    backgroundColor: '#0F766E',
  },
  compareCornerBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  // 2D GARMENT LAYERS
  garmentStack: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  topRowWrap: {
    marginBottom: 3,
    alignItems: 'center',
  },
  singleTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sleeveLeft: {
    width: 10,
    height: 18,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 4,
    marginRight: -1,
    marginTop: 1,
    transform: [{ rotate: '10deg' }],
  },
  sleeveRight: {
    width: 10,
    height: 18,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 4,
    marginLeft: -1,
    marginTop: 1,
    transform: [{ rotate: '-10deg' }],
  },
  singleTopTorso: {
    width: 38,
    height: 35,
    borderRadius: 6,
    alignItems: 'center',
  },
  singleTopTorsoCropped: {
    height: 28,
  },
  layeredTopRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  outerFlankLeft: {
    width: 15,
    height: 38,
    borderTopLeftRadius: 7,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  innerTopCore: {
    width: 22,
    height: 36,
    borderRadius: 3,
    marginHorizontal: 1.5,
    alignItems: 'center',
  },
  outerFlankRight: {
    width: 15,
    height: 38,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 4,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  collarCutout: {
    width: 12,
    height: 5,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: '#E8E8E4',
  },
  pantsRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 4,
  },
  pantLeg: {
    width: 17,
    height: 38,
    borderRadius: 4,
  },
  pantLegShort: {
    height: 23,
  },
  skirtBlock: {
    width: 44,
    height: 34,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    marginBottom: 4,
  },
  skirtBlockMini: {
    width: 40,
    height: 23,
  },
  shoesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shoePill: {
    width: 16,
    height: 8,
    borderRadius: 4,
  },
  lightFabricStroke: {
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.16)',
  },

  // CARD BODY
  cardBody: {
    paddingTop: 8,
    paddingHorizontal: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 5,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  occasionTag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6.5,
    paddingVertical: 2.5,
    borderRadius: 7,
    marginRight: 5,
    flexShrink: 0,
  },
  occasionTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#374151',
  },
  shapeSummaryText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  miniRatioBar: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(17,24,39,0.08)',
  },
  miniRatioSegment: {
    height: '100%',
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  undertoneMiniPill: {
    paddingHorizontal: 6.5,
    paddingVertical: 2.5,
    borderRadius: 7,
    maxWidth: '58%',
  },
  undertoneMiniText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  cardMiniActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  comparePickHint: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
  },

  // EMPTY STATE
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 22,
  },
  emptyCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  emptyCtaText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // COMPARE BOTTOM BAR (INLINE ABOVE AD BANNER SLOT TO PREVENT OVERLAP)
  compareBottomBar: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingTop: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
  },
  compareSlotsSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  compareSummaryPill: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  compareSummaryPillA: {
    borderColor: '#111827',
    backgroundColor: '#F9FAFB',
  },
  compareSummaryPillB: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  summaryLetterBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  summaryLetterText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  summaryColorDot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.2)',
    marginRight: 5,
  },
  summaryTitleText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#111827',
  },
  summaryPlaceholderText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  vsDividerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    marginHorizontal: 8,
    textTransform: 'uppercase',
  },
  compareLaunchBtn: {
    height: 48,
    borderRadius: 15,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  compareLaunchBtnDisabled: {
    backgroundColor: '#E5E7EB',
  },
  compareLaunchBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  compareLaunchBtnTextDisabled: {
    color: '#9CA3AF',
  },

  // RENAME MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  modalHint: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
  },
  modalInput: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 14,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#374151',
  },
  modalSaveBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // TOAST
  toastWrap: {
    position: 'absolute',
    top: 96,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 50,
  },
  toastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default LookbookScreen;
