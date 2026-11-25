// src/screens/CompareOutfitsScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  LayoutChangeEvent,
  Modal,
  Pressable,
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
import { ShopRecommendationSheet } from '../components/ShopRecommendationSheet';
import { getGradeFromScore } from '../engine/MatchCheckerEngine';
import {
  getSilhouetteOption,
  hexToHsl,
  shortColorName,
} from '../engine/OutfitEngine';
import {
  getCachedUserUndertone,
  getUndertoneShortLabel,
  loadUserUndertone,
} from '../services/userPreferences';
import {
  computeOutfitQuickScore,
  OutfitQuickScoreResult,
  resolveFashionColorFromItem,
  SAVED_OCCASION_LABELS,
  SavedOutfit,
  SavedOutfitItem,
  UndertoneLabel,
} from '../services/lookbookStorage';
import { AffiliateQuery } from '../services/affiliateService';
import { SilhouetteId, SkinUndertone } from '../types/outfit';
import { RootStackParamList } from '../../App';

type RouteProps = RouteProp<RootStackParamList, 'CompareOutfits'>;
type NavProps = NativeStackNavigationProp<RootStackParamList, 'CompareOutfits'>;
type SyncAnglePreset = 'front' | 'side' | 'back';

const SYNC_ANGLES: { id: SyncAnglePreset; label: string }[] = [
  { id: 'front', label: 'Trước' },
  { id: 'side', label: 'Nghiêng' },
  { id: 'back', label: 'Sau' },
];

const UNDERTONE_RANK: Record<UndertoneLabel, number> = {
  'Tôn da': 2,
  'Trung tính': 1,
  'Cần lưu ý': 0,
};

function getUndertoneChipColors(label: UndertoneLabel): { bg: string; fg: string } {
  if (label === 'Tôn da') return { bg: '#ECFDF5', fg: '#15803D' };
  if (label === 'Cần lưu ý') return { bg: '#FEF3C7', fg: '#B45309' };
  return { bg: '#F3F4F6', fg: '#4B5563' };
}

function build3DConfigFromSaved(
  outfit: SavedOutfit,
  anglePreset: SyncAnglePreset,
  presetNonce: number
): Outfit3DConfig {
  const { items, isLayering, gender } = outfit;
  return {
    topHex: items.top.hex,
    bottomHex: items.bottom.hex,
    outerHex: items.outerwear?.hex || items.top.hex,
    shoesHex: items.shoes.hex,
    topShape: items.top.silhouette as SilhouetteId,
    bottomShape: items.bottom.silhouette as SilhouetteId,
    outerShape: (items.outerwear?.silhouette || 'blazer') as SilhouetteId,
    shoesShape: items.shoes.silhouette as SilhouetteId,
    isLayering: Boolean(isLayering && items.outerwear),
    gender,
    activeSlot: null,
    cameraPreset:
      anglePreset === 'front'
        ? 'front'
        : anglePreset === 'back'
        ? 'back'
        : 'threeQuarter',
    presetNonce,
    autoRotate: false, // Tắt tự xoay 360° mặc định để giữ 60fps trên Android tầm trung
    zoomDirection: 'reset',
    zoomNonce: 0,
  };
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

interface StylistVerdict {
  winner: 'A' | 'B' | 'tie';
  badgeLabel: string;
  summary: string;
}

function buildStylistVerdict(
  evalA: OutfitQuickScoreResult,
  evalB: OutfitQuickScoreResult,
  undertone: SkinUndertone
): StylistVerdict {
  const scoreDiff = evalA.harmonyScore - evalB.harmonyScore;
  const skinDiff =
    UNDERTONE_RANK[evalA.undertoneLabel] - UNDERTONE_RANK[evalB.undertoneLabel];
  const contrastDiff =
    evalA.breakdown.contrastScore - evalB.breakdown.contrastScore;
  const undertoneText = `tông da ${getUndertoneShortLabel(undertone).toLowerCase()}`;

  // Tổng hợp ưu thế: điểm hài hòa là chính, cộng nhẹ ưu thế tôn da & tách sáng-tối
  const weightedDelta = scoreDiff + skinDiff * 3.5 + contrastDiff * 0.12;

  if (Math.abs(weightedDelta) < 2.2) {
    if (Math.abs(contrastDiff) >= 6) {
      const sharper = contrastDiff > 0 ? 'A' : 'B';
      return {
        winner: 'tie',
        badgeLabel: 'Hai phương án ngang tài',
        summary: `Cả 2 bộ đều đạt điểm hài hòa sát nhau (${evalA.harmonyScore}đ vs ${evalB.harmonyScore}đ). Bộ ${sharper} có độ tách sáng – tối gọn mắt hơn, bạn có thể chọn theo cảm giác mặc.`,
      };
    }
    return {
      winner: 'tie',
      badgeLabel: 'Hai phương án ngang tài',
      summary: `Cả Bộ A (${evalA.harmonyScore}đ) và Bộ B (${evalB.harmonyScore}đ) đều phối rất cân bằng và hợp ${undertoneText} — hãy ưu tiên phom dáng bạn thấy tự tin nhất.`,
    };
  }

  const winner: 'A' | 'B' = weightedDelta > 0 ? 'A' : 'B';
  const winEval = winner === 'A' ? evalA : evalB;
  const loseEval = winner === 'A' ? evalB : evalA;

  const reasons: string[] = [];
  if (winEval.harmonyScore - loseEval.harmonyScore >= 2) {
    reasons.push(
      `nhỉnh hơn về điểm hài hòa (${winEval.harmonyScore}đ so với ${loseEval.harmonyScore}đ)`
    );
  }
  if (UNDERTONE_RANK[winEval.undertoneLabel] > UNDERTONE_RANK[loseEval.undertoneLabel]) {
    reasons.push(
      `lớp áo sát mặt "${winEval.undertoneLabel}" hợp ${undertoneText} hơn`
    );
  }
  if (winEval.breakdown.contrastScore - loseEval.breakdown.contrastScore >= 5) {
    reasons.push(
      `tách mảng sáng – tối rõ nét hơn (${winEval.breakdown.contrastScore}đ vs ${loseEval.breakdown.contrastScore}đ)`
    );
  }

  const reasonText =
    reasons.length > 0
      ? reasons.slice(0, 2).join(' và ')
      : `tổng thể màu sắc ổn định, dễ ứng dụng hơn (${winEval.harmonyScore}đ)`;

  return {
    winner,
    badgeLabel: `Phương án ${winner} nhỉnh hơn`,
    summary: `Phương án ${winner} là lựa chọn nổi bật hơn vì ${reasonText}.`,
  };
}

export const CompareOutfitsScreen: React.FC = () => {
  const navigation = useNavigation<NavProps>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();

  const { outfitA, outfitB } = route.params;

  const [undertone, setUndertone] = useState<SkinUndertone>(() =>
    getCachedUserUndertone()
  );
  const [anglePreset, setAnglePreset] = useState<SyncAnglePreset>('side');
  const [presetNonce, setPresetNonce] = useState<number>(0);
  const [isRotating3D, setIsRotating3D] = useState<boolean>(false);

  // Điểm chạm Affiliate #4: Chọn nhanh món của Bộ A hoặc Bộ B để mở ShopRecommendationSheet
  const [shopPickerVisible, setShopPickerVisible] = useState<boolean>(false);
  const [shopPickerTab, setShopPickerTab] = useState<'A' | 'B'>('A');
  const [shopSheetState, setShopSheetState] = useState<{
    query: AffiliateQuery;
    colorHex: string;
    itemDisplayLabel: string;
  } | null>(null);

  // Kích thước mỗi khung 3D 50/50 đo chính xác từ onLayout
  const [paneSizeA, setPaneSizeA] = useState<{ width: number; height: number }>(() => {
    const win = Dimensions.get('window');
    return {
      width: Math.max(130, Math.floor((win.width - 38) / 2)),
      height: 272,
    };
  });
  const [paneSizeB, setPaneSizeB] = useState<{ width: number; height: number }>(() => {
    const win = Dimensions.get('window');
    return {
      width: Math.max(130, Math.floor((win.width - 38) / 2)),
      height: 272,
    };
  });

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

  // Chấm điểm thời gian thực theo tông da hiện tại của người dùng
  const evalA = useMemo(
    () => computeOutfitQuickScore(outfitA.items, undertone, outfitA.isLayering),
    [outfitA, undertone]
  );
  const evalB = useMemo(
    () => computeOutfitQuickScore(outfitB.items, undertone, outfitB.isLayering),
    [outfitB, undertone]
  );

  const gradeA = useMemo(() => getGradeFromScore(evalA.harmonyScore), [evalA.harmonyScore]);
  const gradeB = useMemo(() => getGradeFromScore(evalB.harmonyScore), [evalB.harmonyScore]);

  const verdict = useMemo(
    () => buildStylistVerdict(evalA, evalB, undertone),
    [evalA, evalB, undertone]
  );

  const configA = useMemo(
    () => build3DConfigFromSaved(outfitA, anglePreset, presetNonce),
    [outfitA, anglePreset, presetNonce]
  );
  const configB = useMemo(
    () => build3DConfigFromSaved(outfitB, anglePreset, presetNonce),
    [outfitB, anglePreset, presetNonce]
  );

  const ratiosA = useMemo(() => getRatioSegments(outfitA), [outfitA]);
  const ratiosB = useMemo(() => getRatioSegments(outfitB), [outfitB]);

  const handleSelectAngle = useCallback((next: SyncAnglePreset) => {
    setAnglePreset(next);
    setPresetNonce(n => n + 1);
  }, []);

  const handleLayoutA = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 60 && height > 60) {
      const nw = Math.floor(width);
      const nh = Math.floor(height);
      setPaneSizeA(prev =>
        prev.width === nw && prev.height === nh ? prev : { width: nw, height: nh }
      );
    }
  }, []);

  const handleLayoutB = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 60 && height > 60) {
      const nw = Math.floor(width);
      const nh = Math.floor(height);
      setPaneSizeB(prev =>
        prev.width === nw && prev.height === nh ? prev : { width: nw, height: nh }
      );
    }
  }, []);

  const noopSelectSlot = useCallback(() => {}, []);

  const handleOpenInStudio = useCallback(
    (chosen: SavedOutfit) => {
      const primaryItem =
        chosen.isLayering && chosen.items.outerwear
          ? chosen.items.outerwear
          : chosen.items.top;
      navigation.navigate('OutfitSuggestion', {
        baseColor: resolveFashionColorFromItem(primaryItem),
        baseRole: 'top',
        loadSavedOutfit: chosen,
      });
    },
    [navigation]
  );

  const showOuterwearRow = Boolean(
    (outfitA.isLayering && outfitA.items.outerwear) ||
      (outfitB.isLayering && outfitB.items.outerwear)
  );

  const handleOpenShopPicker = useCallback(() => {
    setShopPickerTab(verdict.winner === 'B' ? 'B' : 'A');
    setShopPickerVisible(true);
  }, [verdict.winner]);

  const handleSelectItemToShop = useCallback(
    (outfit: SavedOutfit, item: SavedOutfitItem) => {
      const resolvedColor = resolveFashionColorFromItem(item);
      const shapeLabel = getSilhouetteOption(item.silhouette as SilhouetteId).label;
      setShopPickerVisible(false);
      setShopSheetState({
        query: {
          gender: outfit.gender,
          slot: item.slot,
          silhouette: item.silhouette,
          colorId: resolvedColor.id,
          colorName: item.colorName,
          colorFamily: resolvedColor.category,
        },
        colorHex: item.hex,
        itemDisplayLabel: shapeLabel,
      });
    },
    []
  );

  const activePickerOutfit = shopPickerTab === 'A' ? outfitA : outfitB;
  const activePickerItems = useMemo<
    { slotLabel: string; item: SavedOutfitItem }[]
  >(() => {
    const list: { slotLabel: string; item: SavedOutfitItem }[] = [];
    if (activePickerOutfit.isLayering && activePickerOutfit.items.outerwear) {
      list.push({
        slotLabel: 'Áo khoác',
        item: activePickerOutfit.items.outerwear,
      });
    }
    list.push({ slotLabel: 'Áo', item: activePickerOutfit.items.top });
    list.push({ slotLabel: 'Quần / Váy', item: activePickerOutfit.items.bottom });
    list.push({ slotLabel: 'Giày', item: activePickerOutfit.items.shoes });
    return list;
  }, [activePickerOutfit]);

  const renderMetricRow = (label: string, valA: number, valB: number) => {
    const aLeads = valA > valB;
    const bLeads = valB > valA;
    return (
      <View style={styles.compareRow} key={label}>
        <Text style={styles.rowMetricTitle}>{label}</Text>
        <View style={styles.rowCols}>
          <View style={styles.colCell}>
            <View style={styles.metricValueRow}>
              <Text style={[styles.metricNum, aLeads && styles.metricNumLeadA]}>
                {valA}
              </Text>
              <Text style={styles.metricUnit}>/100</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.max(10, Math.min(100, valA))}%`,
                    backgroundColor: aLeads ? '#111827' : '#9CA3AF',
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.colDivider} />

          <View style={styles.colCell}>
            <View style={styles.metricValueRow}>
              <Text style={[styles.metricNum, bLeads && styles.metricNumLeadB]}>
                {valB}
              </Text>
              <Text style={styles.metricUnit}>/100</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.max(10, Math.min(100, valB))}%`,
                    backgroundColor: bLeads ? '#0F766E' : '#9CA3AF',
                  },
                ]}
              />
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderSlotItemCell = (item?: SavedOutfitItem) => {
    if (!item) {
      return <Text style={styles.slotEmptyText}>Không khoác ngoài</Text>;
    }
    const isLight = hexToHsl(item.hex).l > 82;
    const shapeLabel = getSilhouetteOption(item.silhouette as SilhouetteId).label;
    return (
      <View style={styles.slotCellContent}>
        <View
          style={[
            styles.slotSwatchDot,
            { backgroundColor: item.hex },
            isLight && styles.lightBorder,
          ]}
        />
        <View style={styles.slotTextCol}>
          <Text style={styles.slotColorText} numberOfLines={1}>
            {shortColorName(item.colorName)}
          </Text>
          <Text style={styles.slotShapeText} numberOfLines={1}>
            {shapeLabel}
          </Text>
        </View>
      </View>
    );
  };

  const undertoneColorsA = getUndertoneChipColors(evalA.undertoneLabel);
  const undertoneColorsB = getUndertoneChipColors(evalB.undertoneLabel);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* 1. HEADER & THANH ĐỒNG BỘ GÓC NHÌN CHUNG */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.78}
            accessibilityLabel="Quay lại"
          >
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            So sánh 2 phương án
          </Text>

          <View style={styles.undertoneHeaderPill}>
            <View
              style={[
                styles.undertoneHeaderDot,
                {
                  backgroundColor:
                    undertone === 'warm'
                      ? '#D9A773'
                      : undertone === 'cool'
                      ? '#E0B9C1'
                      : '#D6B196',
                },
              ]}
            />
            <Text style={styles.undertoneHeaderText} numberOfLines={1}>
              Da: {getUndertoneShortLabel(undertone)}
            </Text>
          </View>
        </View>

        {/* Hàng nút đồng bộ góc nhìn 3D chung: Trước | Nghiêng | Sau */}
        <View style={styles.syncAngleRow}>
          <View style={styles.syncAngleLabelWrap}>
            <Ionicons name="sync-outline" size={13} color="#4B5563" />
            <Text style={styles.syncAngleLabel}>Góc nhìn chung:</Text>
          </View>

          <View style={styles.syncAnglePills}>
            {SYNC_ANGLES.map(opt => {
              const isSelected = anglePreset === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.anglePill,
                    isSelected && styles.anglePillActive,
                  ]}
                  onPress={() => handleSelectAngle(opt.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.anglePillText,
                      isSelected && styles.anglePillTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </SafeAreaView>

      {/* NỘI DUNG CHÍNH CUỘN DỌC */}
      <ScrollView
        style={styles.scrollView}
        scrollEnabled={!isRotating3D}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 86 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. SÂN KHẤU 3D CHIA ĐÔI (SPLIT 50% / 50%) */}
        <View style={styles.splitStageRow}>
          {/* KHUNG TRÁI: PHƯƠNG ÁN A */}
          <View
            style={[
              styles.stagePane,
              verdict.winner === 'A' && styles.stagePaneWinnerA,
            ]}
            onLayout={handleLayoutA}
            onTouchStart={() => setIsRotating3D(true)}
            onTouchEnd={() => setIsRotating3D(false)}
            onTouchCancel={() => setIsRotating3D(false)}
          >
            <Outfit3DViewer
              width={paneSizeA.width}
              height={paneSizeA.height}
              config={configA}
              externalAnglePreset={anglePreset}
              compactMode
              onSelectSlot={noopSelectSlot}
            />

            <View style={styles.paneTopBar} pointerEvents="none">
              <View style={[styles.paneLetterBadge, styles.badgeA]}>
                <Text style={styles.paneLetterText}>A</Text>
              </View>
              <View style={styles.paneScorePill}>
                <Text style={[styles.paneScoreText, { color: gradeA.gradeColor }]}>
                  {evalA.harmonyScore}đ
                </Text>
              </View>
            </View>

            <View style={styles.paneFooterPill} pointerEvents="none">
              <Text style={styles.paneFooterTitle} numberOfLines={1}>
                {outfitA.title}
              </Text>
            </View>
          </View>

          {/* KHUNG PHẢI: PHƯƠNG ÁN B */}
          <View
            style={[
              styles.stagePane,
              verdict.winner === 'B' && styles.stagePaneWinnerB,
            ]}
            onLayout={handleLayoutB}
            onTouchStart={() => setIsRotating3D(true)}
            onTouchEnd={() => setIsRotating3D(false)}
            onTouchCancel={() => setIsRotating3D(false)}
          >
            <Outfit3DViewer
              width={paneSizeB.width}
              height={paneSizeB.height}
              config={configB}
              externalAnglePreset={anglePreset}
              compactMode
              onSelectSlot={noopSelectSlot}
            />

            <View style={styles.paneTopBar} pointerEvents="none">
              <View style={[styles.paneLetterBadge, styles.badgeB]}>
                <Text style={styles.paneLetterText}>B</Text>
              </View>
              <View style={styles.paneScorePill}>
                <Text style={[styles.paneScoreText, { color: gradeB.gradeColor }]}>
                  {evalB.harmonyScore}đ
                </Text>
              </View>
            </View>

            <View style={styles.paneFooterPill} pointerEvents="none">
              <Text style={styles.paneFooterTitle} numberOfLines={1}>
                {outfitB.title}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.dragHintText}>
          Vuốt trực tiếp trên từng mô hình để xoay kiểm tra 360°
        </Text>

        {/* 3. THẺ KẾT LUẬN SO SÁNH NHANH (STYLIST VERDICT) */}
        <View style={styles.verdictCard}>
          <View style={styles.verdictHeaderRow}>
            <View style={styles.verdictIconWrap}>
              <Ionicons name="sparkles" size={14} color="#FFFFFF" />
            </View>
            <Text style={styles.verdictHeading}>Kết luận nhanh</Text>
            <View
              style={[
                styles.verdictWinnerChip,
                verdict.winner === 'A'
                  ? styles.verdictWinnerChipA
                  : verdict.winner === 'B'
                  ? styles.verdictWinnerChipB
                  : styles.verdictWinnerChipTie,
              ]}
            >
              <Text
                style={[
                  styles.verdictWinnerText,
                  verdict.winner === 'tie' && styles.verdictWinnerTextTie,
                ]}
              >
                {verdict.badgeLabel}
              </Text>
            </View>
          </View>
          <Text style={styles.verdictBody}>{verdict.summary}</Text>
        </View>

        {/* ĐIỂM VÀNG AFFILIATE #4: TÌM MUA ĐỒ THEO BỘ A / B */}
        <TouchableOpacity
          style={styles.shopCompareBtn}
          onPress={handleOpenShopPicker}
          activeOpacity={0.84}
          accessibilityLabel="Tìm mua đồ theo bộ A hoặc bộ B"
        >
          <View style={styles.shopCompareLeft}>
            <Text style={styles.shopCompareTitle} numberOfLines={1}>
              🛍️ Tìm mua đồ theo bộ A / B
            </Text>
            <Text style={styles.shopCompareSub} numberOfLines={1}>
              Chọn nhanh từng món đúng màu trên Shopee & TikTok Shop
            </Text>
          </View>
          <View style={styles.shopCompareArrow}>
            <Ionicons name="chevron-forward" size={16} color="#111827" />
          </View>
        </TouchableOpacity>

        {/* 4. BẢNG ĐỐI CHIẾU 2 CỘT */}
        <View style={styles.tableCard}>
          {/* Tiêu đề 2 cột A | B */}
          <View style={styles.tableHeaderRow}>
            <View style={styles.tableHeaderCol}>
              <View style={[styles.smallLetterBadge, styles.badgeA]}>
                <Text style={styles.smallLetterText}>A</Text>
              </View>
              <Text style={styles.tableHeaderName} numberOfLines={1}>
                {outfitA.title}
              </Text>
            </View>

            <View style={styles.colDivider} />

            <View style={styles.tableHeaderCol}>
              <View style={[styles.smallLetterBadge, styles.badgeB]}>
                <Text style={styles.smallLetterText}>B</Text>
              </View>
              <Text style={styles.tableHeaderName} numberOfLines={1}>
                {outfitB.title}
              </Text>
            </View>
          </View>

          {/* Hàng 1: Điểm tổng & Phân hạng */}
          <View style={styles.compareRow}>
            <Text style={styles.rowMetricTitle}>Tổng điểm hài hòa</Text>
            <View style={styles.rowCols}>
              <View style={styles.colCell}>
                <Text style={[styles.bigScoreNum, { color: gradeA.gradeColor }]}>
                  {evalA.harmonyScore}
                  <Text style={styles.bigScoreUnit}>/100</Text>
                </Text>
                <Text style={[styles.gradeMiniText, { color: gradeA.gradeColor }]}>
                  {gradeA.grade}
                </Text>
              </View>

              <View style={styles.colDivider} />

              <View style={styles.colCell}>
                <Text style={[styles.bigScoreNum, { color: gradeB.gradeColor }]}>
                  {evalB.harmonyScore}
                  <Text style={styles.bigScoreUnit}>/100</Text>
                </Text>
                <Text style={[styles.gradeMiniText, { color: gradeB.gradeColor }]}>
                  {gradeB.grade}
                </Text>
              </View>
            </View>
          </View>

          {/* Hàng 2: Độ tôn tông da */}
          <View style={styles.compareRow}>
            <Text style={styles.rowMetricTitle}>
              Độ tôn da ({getUndertoneShortLabel(undertone)})
            </Text>
            <View style={styles.rowCols}>
              <View style={styles.colCell}>
                <View
                  style={[
                    styles.undertonePill,
                    { backgroundColor: undertoneColorsA.bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.undertonePillText,
                      { color: undertoneColorsA.fg },
                    ]}
                  >
                    {evalA.undertoneLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.colDivider} />

              <View style={styles.colCell}>
                <View
                  style={[
                    styles.undertonePill,
                    { backgroundColor: undertoneColorsB.bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.undertonePillText,
                      { color: undertoneColorsB.fg },
                    ]}
                  >
                    {evalB.undertoneLabel}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Hàng 3-5: 3 chỉ số chi tiết */}
          {renderMetricRow(
            'Hòa hợp sắc độ',
            evalA.breakdown.hueScore,
            evalB.breakdown.hueScore
          )}
          {renderMetricRow(
            'Tương phản sáng – tối',
            evalA.breakdown.contrastScore,
            evalB.breakdown.contrastScore
          )}
          {renderMetricRow(
            'Cân bằng độ chói',
            evalA.breakdown.saturationScore,
            evalB.breakdown.saturationScore
          )}

          {/* Hàng 6: Hoàn cảnh & Kết cấu */}
          <View style={styles.compareRow}>
            <Text style={styles.rowMetricTitle}>Hoàn cảnh & Kết cấu</Text>
            <View style={styles.rowCols}>
              <View style={styles.colCell}>
                <Text style={styles.metaText}>
                  {SAVED_OCCASION_LABELS[outfitA.occasion]} •{' '}
                  {outfitA.gender === 'female' ? 'Nữ' : 'Nam'}
                </Text>
                <Text style={styles.metaSubText}>
                  {outfitA.isLayering ? '4 món (Có áo khoác)' : '3 món cơ bản'}
                </Text>
              </View>

              <View style={styles.colDivider} />

              <View style={styles.colCell}>
                <Text style={styles.metaText}>
                  {SAVED_OCCASION_LABELS[outfitB.occasion]} •{' '}
                  {outfitB.gender === 'female' ? 'Nữ' : 'Nam'}
                </Text>
                <Text style={styles.metaSubText}>
                  {outfitB.isLayering ? '4 món (Có áo khoác)' : '3 món cơ bản'}
                </Text>
              </View>
            </View>
          </View>

          {/* Hàng 7: Tỷ lệ màu 60-30-10 */}
          <View style={styles.compareRow}>
            <Text style={styles.rowMetricTitle}>Tỷ lệ màu 60-30-10</Text>
            <View style={styles.rowCols}>
              <View style={styles.colCell}>
                <View style={styles.ratioBar}>
                  {ratiosA.map(seg => (
                    <View
                      key={seg.key}
                      style={[
                        styles.ratioBarSeg,
                        { flex: seg.flex, backgroundColor: seg.hex },
                      ]}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.colDivider} />

              <View style={styles.colCell}>
                <View style={styles.ratioBar}>
                  {ratiosB.map(seg => (
                    <View
                      key={seg.key}
                      style={[
                        styles.ratioBarSeg,
                        { flex: seg.flex, backgroundColor: seg.hex },
                      ]}
                    />
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* Hàng 8..11: Chi tiết từng món */}
          {showOuterwearRow && (
            <View style={styles.compareRow}>
              <Text style={styles.rowMetricTitle}>Áo khoác</Text>
              <View style={styles.rowCols}>
                <View style={styles.colCell}>
                  {renderSlotItemCell(
                    outfitA.isLayering ? outfitA.items.outerwear : undefined
                  )}
                </View>
                <View style={styles.colDivider} />
                <View style={styles.colCell}>
                  {renderSlotItemCell(
                    outfitB.isLayering ? outfitB.items.outerwear : undefined
                  )}
                </View>
              </View>
            </View>
          )}

          <View style={styles.compareRow}>
            <Text style={styles.rowMetricTitle}>Áo</Text>
            <View style={styles.rowCols}>
              <View style={styles.colCell}>
                {renderSlotItemCell(outfitA.items.top)}
              </View>
              <View style={styles.colDivider} />
              <View style={styles.colCell}>
                {renderSlotItemCell(outfitB.items.top)}
              </View>
            </View>
          </View>

          <View style={styles.compareRow}>
            <Text style={styles.rowMetricTitle}>Quần / Váy</Text>
            <View style={styles.rowCols}>
              <View style={styles.colCell}>
                {renderSlotItemCell(outfitA.items.bottom)}
              </View>
              <View style={styles.colDivider} />
              <View style={styles.colCell}>
                {renderSlotItemCell(outfitB.items.bottom)}
              </View>
            </View>
          </View>

          <View style={[styles.compareRow, styles.compareRowLast]}>
            <Text style={styles.rowMetricTitle}>Giày</Text>
            <View style={styles.rowCols}>
              <View style={styles.colCell}>
                {renderSlotItemCell(outfitA.items.shoes)}
              </View>
              <View style={styles.colDivider} />
              <View style={styles.colCell}>
                {renderSlotItemCell(outfitB.items.shoes)}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 5. THANH HÀNH ĐỘNG ĐÁY: CHỌN A HOẶC B MỞ VÀO STUDIO */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 14) },
        ]}
      >
        <TouchableOpacity
          style={styles.ctaBtnA}
          onPress={() => handleOpenInStudio(outfitA)}
          activeOpacity={0.86}
        >
          <View style={styles.ctaBadgeLight}>
            <Text style={styles.ctaBadgeTextA}>A</Text>
          </View>
          <Text style={styles.ctaBtnText} numberOfLines={1}>
            Mở A vào Studio
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.ctaBtnB}
          onPress={() => handleOpenInStudio(outfitB)}
          activeOpacity={0.86}
        >
          <View style={styles.ctaBadgeLight}>
            <Text style={styles.ctaBadgeTextB}>B</Text>
          </View>
          <Text style={styles.ctaBtnText} numberOfLines={1}>
            Mở B vào Studio
          </Text>
        </TouchableOpacity>
      </View>

      {/* MODAL CHỌN NHANH MÓN MUỐN MUA TỪ BỘ A HOẶC BỘ B */}
      <Modal
        visible={shopPickerVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShopPickerVisible(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShopPickerVisible(false)}
          />
          <View
            style={[
              styles.pickerModalSheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.pickerDragHandle} />

            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerModalTitle} numberOfLines={1}>
                Chọn món cần tìm mua
              </Text>
              <TouchableOpacity
                style={styles.pickerCloseBtn}
                onPress={() => setShopPickerVisible(false)}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Đóng chọn món mua sắm"
              >
                <Ionicons name="close" size={18} color="#111827" />
              </TouchableOpacity>
            </View>

            {/* Tab chuyển nhanh Bộ A | Bộ B */}
            <View style={styles.pickerTabRow}>
              <TouchableOpacity
                style={[
                  styles.pickerTabBtn,
                  shopPickerTab === 'A' && styles.pickerTabBtnActiveA,
                ]}
                onPress={() => setShopPickerTab('A')}
                activeOpacity={0.82}
              >
                <View style={[styles.pickerTabBadge, styles.badgeA]}>
                  <Text style={styles.pickerTabBadgeText}>A</Text>
                </View>
                <Text
                  style={[
                    styles.pickerTabText,
                    shopPickerTab === 'A' && styles.pickerTabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {outfitA.title}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.pickerTabBtn,
                  shopPickerTab === 'B' && styles.pickerTabBtnActiveB,
                ]}
                onPress={() => setShopPickerTab('B')}
                activeOpacity={0.82}
              >
                <View style={[styles.pickerTabBadge, styles.badgeB]}>
                  <Text style={styles.pickerTabBadgeText}>B</Text>
                </View>
                <Text
                  style={[
                    styles.pickerTabText,
                    shopPickerTab === 'B' && styles.pickerTabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {outfitB.title}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Danh sách từng món của bộ đang chọn */}
            <View style={styles.pickerItemsList}>
              {activePickerItems.map(({ slotLabel, item }) => {
                const isLight = hexToHsl(item.hex).l > 82;
                const shapeLabel = getSilhouetteOption(
                  item.silhouette as SilhouetteId
                ).label;
                return (
                  <TouchableOpacity
                    key={`${shopPickerTab}-${item.slot}`}
                    style={styles.pickerItemRow}
                    onPress={() =>
                      handleSelectItemToShop(activePickerOutfit, item)
                    }
                    activeOpacity={0.82}
                  >
                    <View
                      style={[
                        styles.pickerItemSwatch,
                        { backgroundColor: item.hex },
                        isLight && styles.lightBorder,
                      ]}
                    />
                    <View style={styles.pickerItemInfo}>
                      <Text style={styles.pickerItemPrimary} numberOfLines={1}>
                        {slotLabel} • {shapeLabel}
                      </Text>
                      <Text style={styles.pickerItemColor} numberOfLines={1}>
                        Màu {shortColorName(item.colorName)}
                      </Text>
                    </View>
                    <View style={styles.pickerItemActionPill}>
                      <Text style={styles.pickerItemActionText}>Tìm ↗</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* BOTTOM SHEET GỢI Ý MUA SẮM SHOPEE & TIKTOK SHOP */}
      <ShopRecommendationSheet
        visible={shopSheetState !== null}
        query={shopSheetState?.query ?? null}
        placement="compare"
        colorHex={shopSheetState?.colorHex}
        itemDisplayLabel={shopSheetState?.itemDisplayLabel}
        onClose={() => setShopSheetState(null)}
      />
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
    paddingBottom: 6,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginHorizontal: 8,
    letterSpacing: -0.2,
  },
  undertoneHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
  },
  undertoneHeaderDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 5,
    borderWidth: 0.8,
    borderColor: 'rgba(17,24,39,0.2)',
  },
  undertoneHeaderText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#374151',
  },

  // SYNC ANGLE BAR
  syncAngleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 9,
    paddingTop: 2,
  },
  syncAngleLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncAngleLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#4B5563',
    marginLeft: 5,
  },
  syncAnglePills: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAEAE6',
    borderRadius: 14,
    padding: 3,
  },
  anglePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 11,
  },
  anglePillActive: {
    backgroundColor: '#111827',
  },
  anglePillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#4B5563',
    includeFontPadding: false,
  },
  anglePillTextActive: {
    color: '#FFFFFF',
  },

  // SCROLL CONTENT
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 11,
  },

  // SPLIT 50/50 3D STAGE
  splitStageRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stagePane: {
    flex: 1,
    minWidth: 0,
    height: 272,
    borderRadius: 18,
    backgroundColor: '#B8B8B4',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'rgba(17, 24, 39, 0.08)',
  },
  stagePaneWinnerA: {
    borderColor: '#111827',
  },
  stagePaneWinnerB: {
    borderColor: '#0F766E',
  },
  paneTopBar: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paneLetterBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeA: {
    backgroundColor: '#111827',
  },
  badgeB: {
    backgroundColor: '#0F766E',
  },
  paneLetterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  paneScorePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  paneScoreText: {
    fontSize: 11.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  paneFooterPill: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    alignItems: 'center',
  },
  paneFooterTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#111827',
  },
  dragHintText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    marginTop: -4,
  },

  // STYLIST VERDICT CARD
  verdictCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  verdictHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  verdictIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  verdictHeading: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#111827',
    flex: 1,
  },
  verdictWinnerChip: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 10,
  },
  verdictWinnerChipA: {
    backgroundColor: '#111827',
  },
  verdictWinnerChipB: {
    backgroundColor: '#0F766E',
  },
  verdictWinnerChipTie: {
    backgroundColor: '#F3F4F6',
  },
  verdictWinnerText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  verdictWinnerTextTie: {
    color: '#374151',
  },
  verdictBody: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
    color: '#374151',
  },

  // AFFILIATE COMPARE ACTION BAR
  shopCompareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1.2,
    borderColor: '#111827',
  },
  shopCompareLeft: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  shopCompareTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  shopCompareSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  shopCompareArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // A/B QUICK ITEM PICKER MODAL
  pickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.44)',
  },
  pickerModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  pickerDragHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 10,
  },
  pickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pickerModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    flex: 1,
    marginRight: 10,
  },
  pickerCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  pickerTabBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  pickerTabBtnActiveA: {
    backgroundColor: '#FFFFFF',
    borderColor: '#111827',
  },
  pickerTabBtnActiveB: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0F766E',
  },
  pickerTabBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pickerTabBadgeText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  pickerTabText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#6B7280',
  },
  pickerTabTextActive: {
    color: '#111827',
    fontWeight: '800',
  },
  pickerItemsList: {
    gap: 8,
    paddingBottom: 4,
  },
  pickerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  pickerItemSwatch: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.14)',
    marginRight: 10,
    flexShrink: 0,
  },
  pickerItemInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  pickerItemPrimary: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#111827',
  },
  pickerItemColor: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 1,
  },
  pickerItemActionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  pickerItemActionText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#111827',
    includeFontPadding: false,
  },

  // 2-COLUMN COMPARISON TABLE
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tableHeaderCol: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallLetterBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  smallLetterText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '900',
  },
  tableHeaderName: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#111827',
  },
  compareRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  compareRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  rowMetricTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 7,
  },
  rowCols: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colCell: {
    flex: 1,
    minWidth: 0,
  },
  colDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#F3F4F6',
    marginHorizontal: 10,
  },
  bigScoreNum: {
    fontSize: 22,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  bigScoreUnit: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  gradeMiniText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  undertonePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
  },
  undertonePillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  metricNum: {
    fontSize: 14,
    fontWeight: '800',
    color: '#374151',
    fontVariant: ['tabular-nums'],
  },
  metricNumLeadA: {
    color: '#111827',
  },
  metricNumLeadB: {
    color: '#0F766E',
  },
  metricUnit: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    marginLeft: 2,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  metaText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#111827',
  },
  metaSubText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  ratioBar: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderWidth: 0.5,
    borderColor: 'rgba(17,24,39,0.1)',
  },
  ratioBarSeg: {
    height: '100%',
  },
  slotCellContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slotSwatchDot: {
    width: 24,
    height: 24,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.12)',
  },
  lightBorder: {
    borderColor: '#D1D5DB',
  },
  slotTextCol: {
    flex: 1,
    minWidth: 0,
  },
  slotColorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  slotShapeText: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 1,
  },
  slotEmptyText: {
    fontSize: 11.5,
    fontStyle: 'italic',
    color: '#9CA3AF',
  },

  // BOTTOM BAR
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(244, 244, 241, 0.96)',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  ctaBtnA: {
    flex: 1,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 7,
  },
  ctaBtnB: {
    flex: 1,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#0F766E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 7,
  },
  ctaBadgeLight: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBadgeTextA: {
    fontSize: 11,
    fontWeight: '900',
    color: '#111827',
  },
  ctaBadgeTextB: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0F766E',
  },
  ctaBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default CompareOutfitsScreen;
