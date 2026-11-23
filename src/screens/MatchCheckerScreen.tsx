// src/screens/MatchCheckerScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import Outfit3DViewer, { Outfit3DConfig } from '../components/Outfit3DViewer';
import { ColorPaletteSheet } from '../components/ColorPaletteSheet';
import { FashionColor, FASHION_COLORS } from '../constants/fashionColors';
import { hexToHsl, shortColorName } from '../engine/OutfitEngine';
import {
  evaluateTwoItemMatch,
  getBridgeSectionTitle,
} from '../engine/MatchCheckerEngine';
import {
  getCachedUserUndertone,
  getUndertoneShortLabel,
  loadUserUndertone,
  saveUserUndertone,
} from '../services/userPreferences';
import {
  MatchItemSelection,
  OutfitSlotId,
  SilhouetteStyleType,
  SkinUndertone,
  StudioPresetOutfit,
} from '../types/outfit';
import { RootStackParamList } from '../../App';

type RouteProps = RouteProp<RootStackParamList, 'MatchChecker'>;
type NavProps = NativeStackNavigationProp<RootStackParamList, 'MatchChecker'>;

const SLOT_CYCLE_ORDER: OutfitSlotId[] = ['top', 'outerwear', 'bottom', 'shoes'];

const SLOT_PILL_LABELS: Record<OutfitSlotId, string> = {
  top: 'Áo',
  outerwear: 'Khoác',
  bottom: 'Quần',
  shoes: 'Giày',
};

const UNDERTONE_CYCLE: SkinUndertone[] = ['neutral', 'warm', 'cool'];

function getBarColor(score: number): string {
  if (score >= 85) return '#15803D';
  if (score >= 70) return '#0F766E';
  if (score >= 58) return '#D97706';
  return '#DC2626';
}

export const MatchCheckerScreen: React.FC = () => {
  const navigation = useNavigation<NavProps>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();

  const defaultItem1: MatchItemSelection = route.params?.item1 || {
    slot: 'top',
    color: FASHION_COLORS[12], // Xanh Navy Đậm
  };
  const defaultItem2: MatchItemSelection = route.params?.item2 || {
    slot: 'bottom',
    color: FASHION_COLORS[4], // Be Cát
  };

  const [item1, setItem1] = useState<MatchItemSelection>(defaultItem1);
  const [item2, setItem2] = useState<MatchItemSelection>(defaultItem2);
  const [gender, setGender] = useState<SilhouetteStyleType>('male');
  const [undertone, setUndertone] = useState<SkinUndertone>(() =>
    getCachedUserUndertone()
  );
  const [selectedBridgeIndex, setSelectedBridgeIndex] = useState<number>(0);

  // Modal chọn 46 màu vải chuẩn cho Item 1 hoặc Item 2
  const [editingTarget, setEditingTarget] = useState<'item1' | 'item2' | null>(
    null
  );

  // Tạm khóa cuộn dọc của ScrollView khi người dùng đang vuốt xoay mô hình 3D 360°
  const [isRotating3D, setIsRotating3D] = useState<boolean>(false);

  // Kích thước khung sân khấu 3D bên trái Hero Card
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>(
    () => {
      const win = Dimensions.get('window');
      return {
        width: Math.max(150, Math.floor((win.width - 48) * 0.52)),
        height: 276,
      };
    }
  );

  // Nạp tông da đã lưu khi mở màn hình (expo-file-system)
  useEffect(() => {
    let mounted = true;
    loadUserUndertone().then(saved => {
      if (mounted && saved) {
        setUndertone(saved);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Đồng bộ lại state khi quay về từ luồng Hút lại (rescan_item1 / rescan_item2)
  useEffect(() => {
    if (route.params?.item1 && route.params?.item2) {
      setItem1(route.params.item1);
      setItem2(route.params.item2);
      setSelectedBridgeIndex(0);
    }
  }, [route.params?.item1, route.params?.item2]);

  // Chấm điểm hài hòa + Top 3 màu cầu nối theo thời gian thực
  const evaluation = useMemo(
    () => evaluateTwoItemMatch(item1, item2, undertone),
    [item1, item2, undertone]
  );

  const safeBridgeIndex = Math.min(
    selectedBridgeIndex,
    Math.max(0, evaluation.bridgeSuggestions.length - 1)
  );
  const activeBridge = evaluation.bridgeSuggestions[safeBridgeIndex];

  const isLayering = item1.slot === 'outerwear' || item2.slot === 'outerwear';

  // Gán đầy đủ màu lên 4 slot của mô hình 3D (2 món đang chấm + màu cầu nối + trung tính bổ trợ nếu layering)
  const resolvedColors = useMemo<Record<OutfitSlotId, FashionColor>>(() => {
    const fallbackLight =
      FASHION_COLORS.find(c => c.id === 'wb-1') || FASHION_COLORS[0];
    const fallbackDark =
      FASHION_COLORS.find(c => c.id === 'gb-1') || FASHION_COLORS[6];
    const fallbackBeige =
      FASHION_COLORS.find(c => c.id === 'wb-5') || FASHION_COLORS[4];

    const map: Partial<Record<OutfitSlotId, FashionColor>> = {
      [item1.slot]: item1.color,
      [item2.slot]: item2.color,
    };

    if (activeBridge && !map[evaluation.bridgeSlot]) {
      map[evaluation.bridgeSlot] = activeBridge.color;
    }

    const outerRef = map.outerwear || fallbackDark;
    const outerIsDark = hexToHsl(outerRef.hex).l < 48;

    const topColor =
      map.top || (isLayering ? (outerIsDark ? fallbackLight : fallbackDark) : fallbackLight);
    const bottomColor = map.bottom || fallbackBeige;
    const shoesColor =
      map.shoes ||
      (hexToHsl(bottomColor.hex).l < 45 ? fallbackLight : fallbackDark);
    const outerColor = map.outerwear || fallbackDark;

    return {
      outerwear: outerColor,
      top: topColor,
      bottom: bottomColor,
      shoes: shoesColor,
    };
  }, [item1, item2, activeBridge, evaluation.bridgeSlot, isLayering]);

  const viewerConfig = useMemo<Outfit3DConfig>(
    () => ({
      topHex: resolvedColors.top.hex,
      bottomHex: resolvedColors.bottom.hex,
      outerHex: resolvedColors.outerwear.hex,
      shoesHex: resolvedColors.shoes.hex,
      topShape: 'tshirt',
      bottomShape: gender === 'female' ? 'a_line_skirt' : 'wide_pants',
      outerShape: 'blazer',
      shoesShape: 'sneaker',
      isLayering,
      gender,
      activeSlot: null,
      cameraPreset: 'threeQuarter',
      presetNonce: 0,
      autoRotate: false,
      zoomDirection: 'reset',
      zoomNonce: 0,
    }),
    [resolvedColors, gender, isLayering]
  );

  const handleStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 60 && height > 60) {
      const nw = Math.floor(width);
      const nh = Math.floor(height);
      setStageSize(prev =>
        prev.width === nw && prev.height === nh ? prev : { width: nw, height: nh }
      );
    }
  }, []);

  // Chuyển vòng vai trò (Áo -> Khoác -> Quần -> Giày); nếu trùng thẻ kia thì tự hoán đổi
  const handleCycleSlot = useCallback(
    (which: 'item1' | 'item2') => {
      const current = which === 'item1' ? item1 : item2;
      const other = which === 'item1' ? item2 : item1;

      const curIdx = SLOT_CYCLE_ORDER.indexOf(current.slot);
      const nextSlot = SLOT_CYCLE_ORDER[(curIdx + 1) % SLOT_CYCLE_ORDER.length];

      if (nextSlot === other.slot) {
        // Tự hoán đổi 2 vai trò cho nhau để không bao giờ bị trùng slot
        if (which === 'item1') {
          setItem1({ ...item1, slot: other.slot });
          setItem2({ ...item2, slot: current.slot });
        } else {
          setItem2({ ...item2, slot: other.slot });
          setItem1({ ...item1, slot: current.slot });
        }
      } else {
        if (which === 'item1') {
          setItem1({ ...item1, slot: nextSlot });
        } else {
          setItem2({ ...item2, slot: nextSlot });
        }
      }
      setSelectedBridgeIndex(0);
    },
    [item1, item2]
  );

  // Hút lại màu bằng Camera cho Món 1 hoặc Món 2
  const handleRescanItem = useCallback(
    (which: 'item1' | 'item2') => {
      navigation.push('CameraPicker', {
        compareContext: {
          mode: which === 'item1' ? 'rescan_item1' : 'rescan_item2',
          item1,
          item2,
        },
      });
    },
    [navigation, item1, item2]
  );

  // Chọn màu từ ColorPaletteSheet 46 màu vải chuẩn
  const handleSelectColorFromSheet = useCallback(
    (color: FashionColor) => {
      if (editingTarget === 'item1') {
        setItem1(prev => ({ ...prev, color }));
        setSelectedBridgeIndex(0);
      } else if (editingTarget === 'item2') {
        setItem2(prev => ({ ...prev, color }));
        setSelectedBridgeIndex(0);
      }
      setEditingTarget(null);
    },
    [editingTarget]
  );

  // Đổi nhanh tông da (lưu vào userPreferences để đồng bộ toàn app)
  const handleCycleUndertone = useCallback(() => {
    const idx = UNDERTONE_CYCLE.indexOf(undertone);
    const next = UNDERTONE_CYCLE[(idx + 1) % UNDERTONE_CYCLE.length];
    setUndertone(next);
    saveUserUndertone(next);
  }, [undertone]);

  // Chạm trực tiếp vào món trên mô hình 3D để đổi màu nhanh nếu là item1 / item2
  const handleTapSlot3D = useCallback(
    (slot: OutfitSlotId) => {
      if (slot === item1.slot) {
        setEditingTarget('item1');
      } else if (slot === item2.slot) {
        setEditingTarget('item2');
      }
    },
    [item1.slot, item2.slot]
  );

  // Mở trong Studio Tự tay mix đồ với preset khóa sẵn 2 món + áp màu cầu nối vừa chọn
  const handleOpenInStudio = useCallback(() => {
    const preset: StudioPresetOutfit = {
      isLayering,
      gender,
      lockedSlots: [item1.slot, item2.slot],
      colors: {
        outerwear: resolvedColors.outerwear,
        top: resolvedColors.top,
        bottom: resolvedColors.bottom,
        shoes: resolvedColors.shoes,
      },
      sourceSlot: item1.slot,
      undertone,
    };

    navigation.navigate('OutfitSuggestion', {
      baseColor: item1.color,
      baseRole: item1.slot === 'bottom' ? 'bottom' : 'top',
      initialPresetOutfit: preset,
    });
  }, [gender, isLayering, item1, item2, navigation, resolvedColors, undertone]);

  const editingSlotId: OutfitSlotId =
    editingTarget === 'item1'
      ? item1.slot
      : editingTarget === 'item2'
      ? item2.slot
      : item1.slot;

  const editingColorId =
    editingTarget === 'item1'
      ? item1.color.id
      : editingTarget === 'item2'
      ? item2.color.id
      : item1.color.id;

  const editingSlotLabel =
    editingTarget === 'item1'
      ? `Món 1 (${SLOT_PILL_LABELS[item1.slot]})`
      : `Món 2 (${SLOT_PILL_LABELS[item2.slot]})`;

  const renderProgressRow = (label: string, value: number) => (
    <View style={styles.metricRow} key={label}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
      </View>
      <View style={styles.metricTrack}>
        <View
          style={[
            styles.metricFill,
            {
              width: `${Math.max(8, Math.min(100, value))}%`,
              backgroundColor: getBarColor(value),
            },
          ]}
        />
      </View>
    </View>
  );

  const renderItemCard = (
    which: 'item1' | 'item2',
    item: MatchItemSelection,
    orderLabel: string
  ) => {
    const hsl = hexToHsl(item.color.hex);
    const isVeryLight = hsl.l > 86;
    const roleLabel =
      item.slot === 'bottom' && gender === 'female'
        ? 'Váy'
        : SLOT_PILL_LABELS[item.slot];

    return (
      <View style={styles.itemCard}>
        <View style={styles.itemCardTopRow}>
          <Text style={styles.itemOrderLabel}>{orderLabel}</Text>
          <TouchableOpacity
            style={styles.rolePill}
            onPress={() => handleCycleSlot(which)}
            activeOpacity={0.78}
            accessibilityLabel={`Đổi vai trò ${orderLabel}`}
          >
            <Text style={styles.rolePillText}>{roleLabel}</Text>
            <Ionicons
              name="swap-vertical-outline"
              size={11}
              color="#111827"
              style={{ marginLeft: 3 }}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.itemSwatchRow}>
          <View
            style={[
              styles.itemColorBox,
              { backgroundColor: item.color.hex },
              isVeryLight && styles.lightBorder,
            ]}
          />
          <View style={styles.itemNameCol}>
            <Text style={styles.itemColorName} numberOfLines={2}>
              {shortColorName(item.color.name)}
            </Text>
            <Text style={styles.itemHexText}>{item.color.hex.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.itemMiniActionsRow}>
          <TouchableOpacity
            style={styles.miniActionBtn}
            onPress={() => handleRescanItem(which)}
            activeOpacity={0.78}
          >
            <Ionicons name="camera-outline" size={13} color="#111827" />
            <Text style={styles.miniActionText}>Hút lại</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.miniActionBtn}
            onPress={() => setEditingTarget(which)}
            activeOpacity={0.78}
          >
            <Ionicons name="color-palette-outline" size={13} color="#111827" />
            <Text style={styles.miniActionText}>Đổi màu</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* 1. HEADER GỌN GÀNG */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.75}
            accessibilityLabel="Quay lại"
          >
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Chấm điểm 2 món</Text>

          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                gender === 'male' && styles.segmentBtnActive,
              ]}
              onPress={() => setGender('male')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.segmentText,
                  gender === 'male' && styles.segmentTextActive,
                ]}
              >
                Nam
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                gender === 'female' && styles.segmentBtnActive,
              ]}
              onPress={() => setGender('female')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.segmentText,
                  gender === 'female' && styles.segmentTextActive,
                ]}
              >
                Nữ
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* NỘI DUNG CHÍNH CUỘN MƯỢT */}
      <ScrollView
        style={styles.scrollView}
        scrollEnabled={!isRotating3D}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 84 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. HERO CARD: SÂN KHẤU 3D XOAY 360° (52%) + BẢNG ĐIỂM HÀI HÒA (48%) */}
        <View style={styles.heroCard}>
          {/* Cột trái 52%: Outfit3DViewer */}
          <View
            style={styles.heroLeft3D}
            onLayout={handleStageLayout}
            onTouchStart={() => setIsRotating3D(true)}
            onTouchEnd={() => setIsRotating3D(false)}
            onTouchCancel={() => setIsRotating3D(false)}
          >
            <Outfit3DViewer
              width={stageSize.width}
              height={stageSize.height}
              config={viewerConfig}
              onSelectSlot={handleTapSlot3D}
            />
            <View style={styles.rotateHintPill} pointerEvents="none">
              <Ionicons name="sync-outline" size={10} color="#374151" />
              <Text style={styles.rotateHintText}>Xoay 360°</Text>
            </View>
          </View>

          {/* Cột phải 48%: Điểm số + Nhận xét + 3 thanh tiêu chí */}
          <View style={styles.heroRightScore}>
            <View style={styles.scoreTopLine}>
              <View style={styles.scoreNumberWrap}>
                <Text
                  style={[styles.scoreBigNumber, { color: evaluation.gradeColor }]}
                >
                  {evaluation.score}
                </Text>
                <Text style={styles.scoreOutOf}>/100</Text>
              </View>

              <TouchableOpacity
                style={styles.undertoneChip}
                onPress={handleCycleUndertone}
                activeOpacity={0.75}
                accessibilityLabel="Đổi tông da"
              >
                <Text style={styles.undertoneChipText}>
                  Da: {getUndertoneShortLabel(undertone)}
                </Text>
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.gradeBadge,
                { backgroundColor: `${evaluation.gradeColor}16` },
              ]}
            >
              <View
                style={[
                  styles.gradeDot,
                  { backgroundColor: evaluation.gradeColor },
                ]}
              />
              <Text
                style={[styles.gradeText, { color: evaluation.gradeColor }]}
                numberOfLines={1}
              >
                {evaluation.grade}
              </Text>
            </View>

            <Text style={styles.headlineText} numberOfLines={4}>
              {evaluation.headline}
            </Text>

            <View style={styles.metricsGroup}>
              {renderProgressRow('Sắc độ', evaluation.breakdown.hueScore)}
              {renderProgressRow('Sáng - tối', evaluation.breakdown.contrastScore)}
              {renderProgressRow('Độ chói', evaluation.breakdown.saturationScore)}
            </View>
          </View>
        </View>

        {/* 3. CẶP THẺ 2 MÓN ĐANG SO SÁNH (ITEM 1 + ITEM 2) */}
        <View style={styles.pairSection}>
          <View style={styles.pairRow}>
            {renderItemCard('item1', item1, 'Món 1')}
            <View style={styles.plusConnector}>
              <Ionicons name="add" size={16} color="#111827" />
            </View>
            {renderItemCard('item2', item2, 'Món 2')}
          </View>
        </View>

        {/* 4. KHU VỰC "MÀU CẦU NỐI 10% CÂN BẰNG BỘ ĐỒ" */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              {getBridgeSectionTitle(evaluation.bridgeSlot)}
            </Text>
            <Text style={styles.sectionHint}>Chạm thử lên 3D</Text>
          </View>

          <View style={styles.bridgeRow}>
            {evaluation.bridgeSuggestions.map((suggestion, idx) => {
              const isSelected = idx === safeBridgeIndex;
              const bHsl = hexToHsl(suggestion.color.hex);
              const isLightDot = bHsl.l > 84;
              const checkColor = bHsl.l > 64 ? '#111827' : '#FFFFFF';

              return (
                <TouchableOpacity
                  key={suggestion.color.id}
                  style={[
                    styles.bridgeCard,
                    isSelected && styles.bridgeCardSelected,
                  ]}
                  onPress={() => setSelectedBridgeIndex(idx)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.bridgeDot,
                      { backgroundColor: suggestion.color.hex },
                      isLightDot && styles.lightBorder,
                    ]}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={16} color={checkColor} />
                    )}
                  </View>

                  <Text
                    style={[
                      styles.bridgeColorName,
                      isSelected && styles.bridgeColorNameSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {shortColorName(suggestion.color.name)}
                  </Text>

                  <Text style={styles.bridgeTag} numberOfLines={1}>
                    {suggestion.shortTag}
                  </Text>

                  <View
                    style={[
                      styles.boostPill,
                      isSelected && styles.boostPillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.boostPillText,
                        isSelected && styles.boostPillTextSelected,
                      ]}
                    >
                      → {suggestion.boostedScore}đ
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {activeBridge && (
            <View style={styles.bridgeReasonBox}>
              <Ionicons
                name="sparkles-outline"
                size={14}
                color="#111827"
                style={{ marginRight: 6, marginTop: 1 }}
              />
              <Text style={styles.bridgeReasonText}>
                <Text style={styles.bridgeReasonTag}>{activeBridge.tag}: </Text>
                {activeBridge.reason}
              </Text>
            </View>
          )}
        </View>

        {/* 5. PHÂN TÍCH NGẮN (2–3 GẠCH ĐẦU DÒNG) */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Phân tích nhanh</Text>
          <View style={styles.detailsList}>
            {evaluation.details.map((line, index) => (
              <View key={index} style={styles.detailRow}>
                <View style={styles.detailBullet} />
                <Text style={styles.detailText}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* NÚT CTA LỚN CỐ ĐỊNH Ở ĐÁY MÀN HÌNH */}
      <View
        style={[
          styles.bottomCtaBar,
          { paddingBottom: Math.max(insets.bottom, 14) },
        ]}
      >
        <TouchableOpacity
          style={styles.studioCtaBtn}
          onPress={handleOpenInStudio}
          activeOpacity={0.88}
        >
          <Ionicons
            name="layers-outline"
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.studioCtaText}>
            Mở trong Studio Tự tay mix đồ →
          </Text>
        </TouchableOpacity>
      </View>

      {/* MODAL CHỌN MÀU VẢI CHUẨN ĐỂ THỬ ĐỔI NGAY TẠI CHỖ (KÈM NHÃN TÔN DA) */}
      <ColorPaletteSheet
        visible={editingTarget !== null}
        slotLabel={editingSlotLabel}
        slotId={editingSlotId}
        undertone={undertone}
        selectedColorId={editingColorId}
        onSelectColor={handleSelectColorFromSheet}
        onClose={() => setEditingTarget(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F3',
  },
  headerSafe: {
    backgroundColor: '#F5F5F3',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
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
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.2,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 17,
    padding: 3,
    width: 108,
    height: 34,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  segmentBtnActive: {
    backgroundColor: '#111827',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    includeFontPadding: false,
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 6,
    gap: 12,
  },

  // HERO CARD
  heroCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  heroLeft3D: {
    flex: 0.52,
    height: 276,
    borderRadius: 16,
    backgroundColor: '#CECECA',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  rotateHintPill: {
    position: 'absolute',
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  rotateHintText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#374151',
    marginLeft: 3,
  },
  heroRightScore: {
    flex: 0.48,
    paddingLeft: 12,
    paddingVertical: 4,
    justifyContent: 'space-between',
  },
  scoreTopLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  scoreNumberWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreBigNumber: {
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 44,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  scoreOutOf: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    marginLeft: 2,
  },
  undertoneChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 4,
  },
  undertoneChipText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#4B5563',
  },
  gradeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 2,
  },
  gradeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  gradeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  headlineText: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '500',
    color: '#374151',
    marginVertical: 6,
  },
  metricsGroup: {
    gap: 7,
  },
  metricRow: {
    gap: 3,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#6B7280',
  },
  metricValue: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  metricTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  metricFill: {
    height: '100%',
    borderRadius: 3,
  },

  // PAIR ITEM CARDS
  pairSection: {
    position: 'relative',
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 11,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  plusConnector: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -6,
    zIndex: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  itemCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  itemOrderLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  itemSwatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  itemColorBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.12)',
    marginRight: 9,
  },
  lightBorder: {
    borderColor: '#D1D5DB',
  },
  itemNameCol: {
    flex: 1,
    minWidth: 0,
  },
  itemColorName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 16,
  },
  itemHexText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  itemMiniActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  miniActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 7,
  },
  miniActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 4,
  },

  // BRIDGE & ANALYSIS CARDS
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  sectionHint: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#6B7280',
  },
  bridgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bridgeCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  bridgeCardSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#111827',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  bridgeDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  bridgeColorName: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
  },
  bridgeColorNameSelected: {
    color: '#111827',
    fontWeight: '800',
  },
  bridgeTag: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 2,
    textAlign: 'center',
  },
  boostPill: {
    marginTop: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  boostPillSelected: {
    backgroundColor: '#111827',
  },
  boostPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#15803D',
    fontVariant: ['tabular-nums'],
  },
  boostPillTextSelected: {
    color: '#FFFFFF',
  },
  bridgeReasonBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F5F5F3',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bridgeReasonText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16.5,
    color: '#374151',
    fontWeight: '500',
  },
  bridgeReasonTag: {
    fontWeight: '800',
    color: '#111827',
  },

  // DETAILS LIST
  detailsList: {
    marginTop: 8,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detailBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#111827',
    marginTop: 6,
    marginRight: 8,
  },
  detailText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17.5,
    color: '#374151',
    fontWeight: '500',
  },

  // BOTTOM CTA BAR
  bottomCtaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(245, 245, 243, 0.96)',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  studioCtaBtn: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  studioCtaText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

export default MatchCheckerScreen;
