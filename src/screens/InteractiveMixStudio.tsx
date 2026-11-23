// src/screens/InteractiveMixStudio.tsx
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
  LayoutChangeEvent,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import Outfit3DViewer, {
  CameraPreset,
  Outfit3DConfig,
} from '../components/Outfit3DViewer';
import { LookbookItemCard } from '../components/LookbookItemCard';
import { ColorPaletteSheet } from '../components/ColorPaletteSheet';
import {
  initStudioOutfit,
  initStudioOutfitFromPreset,
  toggleLayeringMode,
  shuffleOutfitColors,
  updateSlotSilhouette,
  updateSlotColor,
  toggleSlotLock,
  unlockNonBaseSlots,
  switchGender,
  applyScannedColorToSlot,
  generateOutfitAdvice,
  TOP_SILHOUETTES,
  OUTERWEAR_SILHOUETTES,
  BOTTOM_SILHOUETTES,
  getShoesSilhouettes,
  hexToHsl,
} from '../engine/OutfitEngine';
import {
  OutfitSlotId,
  SilhouetteId,
  StudioOutfitState,
  SilhouetteStyleType,
  StyleHarmonyMode,
} from '../types/outfit';
import { FashionColor, FASHION_COLORS } from '../constants/fashionColors';
import { RootStackParamList } from '../../App';

type RouteProps = RouteProp<RootStackParamList, 'OutfitSuggestion'>;
type NavProps = NativeStackNavigationProp<RootStackParamList, 'OutfitSuggestion'>;

const CAMERA_PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'front', label: 'Trước' },
  { id: 'threeQuarter', label: 'Nghiêng' },
  { id: 'back', label: 'Sau' },
];

const SOURCE_SLOT_OPTIONS: { id: OutfitSlotId; label: string }[] = [
  { id: 'top', label: 'Áo' },
  { id: 'outerwear', label: 'Khoác' },
  { id: 'bottom', label: 'Quần' },
  { id: 'shoes', label: 'Giày' },
];

const HARMONY_MODES: { id: StyleHarmonyMode; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'neutral', label: 'Trung tính' },
  { id: 'analogous', label: 'Thanh lịch' },
  { id: 'complementary', label: 'Nổi bật' },
];

export const InteractiveMixStudio: React.FC = () => {
  const navigation = useNavigation<NavProps>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();

  // Màu gốc từ khâu hút màu Camera / Ảnh (fallback Be Cát nếu mở trực tiếp)
  const baseColor: FashionColor = route.params?.baseColor || FASHION_COLORS[4];
  const initialRole: 'top' | 'bottom' = route.params?.baseRole || 'top';
  const initialPresetOutfit = route.params?.initialPresetOutfit;

  // State chính của Studio (khởi tạo từ preset 2 món nếu có, giữ nguyên luồng 1 màu như cũ)
  const [studioState, setStudioState] = useState<StudioOutfitState>(() =>
    initialPresetOutfit
      ? initStudioOutfitFromPreset(initialPresetOutfit, baseColor)
      : initStudioOutfit(baseColor, initialRole, 'male')
  );
  const studioStateRef = useRef<StudioOutfitState>(studioState);
  studioStateRef.current = studioState;

  // Lịch sử Hoàn tác (Undo Stack, tối đa 15 bước gần nhất)
  const [history, setHistory] = useState<StudioOutfitState[]>([]);

  // Gu phối màu (Tất cả / Trung tính / Thanh lịch / Nổi bật)
  const [harmonyMode, setHarmonyMode] = useState<StyleHarmonyMode>('all');

  // Modal bảng chọn đủ 46 màu vải chuẩn
  const [paletteVisible, setPaletteVisible] = useState<boolean>(false);

  // Toast gọn nhẹ tự ẩn sau 2 giây
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
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Món đang chọn để chỉnh phom dáng / màu sắc
  const [activeSlot, setActiveSlot] = useState<OutfitSlotId>(
    initialPresetOutfit?.sourceSlot || initialRole
  );

  // Điều khiển góc nhìn 3D
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('threeQuarter');
  const [presetNonce, setPresetNonce] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [zoomState, setZoomState] = useState<{ dir: 'in' | 'out' | 'reset'; nonce: number }>({
    dir: 'reset',
    nonce: 0,
  });

  // Tính sẵn kích thước khởi tạo từ Dimensions.get('window') để hiển thị 3D ngay lập tức
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>(() => {
    const win = Dimensions.get('window');
    return {
      width: Math.max(200, Math.round((win.width - 20) * 0.62)),
      height: Math.max(360, Math.round(win.height * 0.52)),
    };
  });

  const handleStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      const nextW = Math.floor(width);
      const nextH = Math.floor(height);
      setStageSize(prev =>
        prev.width === nextW && prev.height === nextH
          ? prev
          : { width: nextW, height: nextH }
      );
    }
  }, []);

  const { slots, isLayering, visualRatios, styleType, sourceSlot, scannedColor } = studioState;

  // Lời khuyên Stylist động theo bộ màu hiện tại
  const advice = useMemo(() => generateOutfitAdvice(studioState), [studioState]);

  const getContrastTextColor = useCallback((hex: string) => {
    const hsl = hexToHsl(hex);
    return hsl.l > 62 ? '#111827' : '#FFFFFF';
  }, []);

  // Helper cập nhật state kèm ghi nhận Undo Stack (tối đa 15 bước)
  const applyStudioChange = useCallback(
    (updater: (prev: StudioOutfitState) => StudioOutfitState): StudioOutfitState => {
      const prev = studioStateRef.current;
      const next = updater(prev);
      if (next !== prev) {
        setHistory(h => [...h.slice(-14), prev]);
        setStudioState(next);
      }
      return next;
    },
    []
  );

  // -------------------------------------------------------------
  // CÁC HÀM XỬ LÝ TƯƠNG TÁC
  // -------------------------------------------------------------

  const handleToggleLock = useCallback((slotId: OutfitSlotId) => {
    setStudioState(prev => toggleSlotLock(prev, slotId));
  }, []);

  const handleUnlockAll = useCallback(() => {
    applyStudioChange(prev => unlockNonBaseSlots(prev));
    showToast('Đã mở khóa các món phụ');
  }, [applyStudioChange, showToast]);

  const handleShuffle = useCallback(() => {
    const prev = studioStateRef.current;
    const next = shuffleOutfitColors(prev, harmonyMode);
    if (next === prev) {
      showToast('Tất cả món đang khóa — hãy mở khóa bớt để đổi màu');
      return;
    }
    setHistory(h => [...h.slice(-14), prev]);
    setStudioState(next);
  }, [harmonyMode, showToast]);

  const handleUndo = useCallback(() => {
    setHistory(prevHistory => {
      if (prevHistory.length === 0) return prevHistory;
      const lastState = prevHistory[prevHistory.length - 1];
      setStudioState(lastState);
      if (!lastState.isLayering && activeSlot === 'outerwear') {
        setActiveSlot('top');
      }
      return prevHistory.slice(0, -1);
    });
  }, [activeSlot]);

  const handleToggleLayering = useCallback(() => {
    const next = applyStudioChange(prev => toggleLayeringMode(prev, !prev.isLayering));
    if (next.isLayering && next.slots.outerwear.isBase) {
      setActiveSlot('outerwear');
    } else if (!next.isLayering && activeSlot === 'outerwear') {
      setActiveSlot('top');
    }
  }, [activeSlot, applyStudioChange]);

  // Chuyển vị trí áp dụng màu gốc chụp từ Camera (Áo / Khoác / Quần / Giày)
  const handleSelectSourceSlot = useCallback(
    (targetSlot: OutfitSlotId) => {
      applyStudioChange(prev =>
        applyScannedColorToSlot(prev, prev.scannedColor, targetSlot, FASHION_COLORS)
      );
      setActiveSlot(targetSlot);
    },
    [applyStudioChange]
  );

  const handleSelectSilhouette = useCallback(
    (silhouetteId: SilhouetteId) => {
      applyStudioChange(prev => updateSlotSilhouette(prev, activeSlot, silhouetteId));
    },
    [activeSlot, applyStudioChange]
  );

  // Chấm màu nhanh (5 chấm tròn) -> ghi Undo & khóa món đã chọn
  const handleSelectColor = useCallback(
    (color: FashionColor) => {
      applyStudioChange(prev => updateSlotColor(prev, activeSlot, color, true));
    },
    [activeSlot, applyStudioChange]
  );

  // Chọn màu thủ công từ bảng 46 màu -> ghi Undo, tự động khóa món & đóng sheet ngay
  const handleSelectColorFromPalette = useCallback(
    (color: FashionColor) => {
      applyStudioChange(prev => updateSlotColor(prev, activeSlot, color, true));
      setPaletteVisible(false);
    },
    [activeSlot, applyStudioChange]
  );

  const handleToggleGender = useCallback((gender: SilhouetteStyleType) => {
    setStudioState(prev => switchGender(prev, gender));
  }, []);

  const handleSelectSlotFrom3D = useCallback((slot: OutfitSlotId) => {
    setActiveSlot(slot);
  }, []);

  const handleReset3DView = useCallback(() => {
    setAutoRotate(false);
    setCameraPreset('front');
  }, []);

  const viewerConfig: Outfit3DConfig = useMemo(
    () => ({
      topHex: slots.top.color.hex,
      bottomHex: slots.bottom.color.hex,
      outerHex: slots.outerwear.color.hex,
      shoesHex: slots.shoes.color.hex,
      topShape: slots.top.silhouette,
      bottomShape: slots.bottom.silhouette,
      outerShape: slots.outerwear.silhouette,
      shoesShape: slots.shoes.silhouette,
      isLayering,
      gender: styleType,
      activeSlot,
      cameraPreset,
      presetNonce,
      autoRotate,
      zoomDirection: zoomState.dir,
      zoomNonce: zoomState.nonce,
    }),
    [
      slots,
      isLayering,
      styleType,
      activeSlot,
      cameraPreset,
      presetNonce,
      autoRotate,
      zoomState,
    ]
  );

  const handleSelectPreset = useCallback((preset: CameraPreset) => {
    setAutoRotate(false);
    setCameraPreset(preset);
    setPresetNonce(n => n + 1);
  }, []);

  const handleZoom = useCallback((dir: 'in' | 'out') => {
    setZoomState(prev => ({ dir, nonce: prev.nonce + 1 }));
  }, []);

  const handleSaveOutfit = useCallback(() => {
    showToast('Tính năng Lưu tủ đồ đang được hoàn thiện ở bước tiếp theo');
  }, [showToast]);

  const activeSlotDisplayLabel = useMemo(() => {
    const item = slots[activeSlot];
    if (activeSlot === 'bottom' && item.silhouette === 'a_line_skirt') {
      return 'Chân váy';
    }
    if (activeSlot === 'top') {
      return isLayering ? 'Áo trong' : 'Áo chính';
    }
    return item.label;
  }, [slots, activeSlot, isLayering]);

  // Danh sách phom dáng theo món đang chọn & giới tính (Nam ẩn Chân váy chữ A)
  const availableSilhouettes = useMemo(() => {
    if (activeSlot === 'outerwear') return OUTERWEAR_SILHOUETTES;
    if (activeSlot === 'top') return TOP_SILHOUETTES;
    if (activeSlot === 'bottom') {
      return styleType === 'male'
        ? BOTTOM_SILHOUETTES.filter(s => s.id !== 'a_line_skirt')
        : BOTTOM_SILHOUETTES;
    }
    return getShoesSilhouettes(styleType);
  }, [activeSlot, styleType]);

  // Sắc độ lân cận để tinh chỉnh nhanh màu món đang chọn
  const quickPaletteColors = useMemo(() => {
    const current = slots[activeSlot].color;
    const sameCategory = FASHION_COLORS.filter(
      c => c.category === current.category && c.id !== current.id
    ).slice(0, 4);
    return [current, ...sameCategory];
  }, [slots, activeSlot]);

  const lockedCount = useMemo(() => {
    const keys: OutfitSlotId[] = isLayering
      ? ['outerwear', 'top', 'bottom', 'shoes']
      : ['top', 'bottom', 'shoes'];
    return keys.filter(k => slots[k].locked).length;
  }, [slots, isLayering]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* PHÔNG NỀN STUDIO XÁM ĐÁ TRUNG TÍNH (#C2C2BE -> #A2A29E) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="studioBackdrop" cx="36%" cy="42%" r="66%">
              <Stop offset="0%" stopColor="#C4C4C0" stopOpacity="1" />
              <Stop offset="55%" stopColor="#B4B4B0" stopOpacity="1" />
              <Stop offset="100%" stopColor="#A2A29E" stopOpacity="1" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#studioBackdrop)" />
        </Svg>
      </View>

      {/* 1. TOP BAR GỌN NHẸ */}
      <SafeAreaView edges={['top']} style={styles.topBarSafe}>
        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.iconCircleBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.75}
            accessibilityLabel="Quay lại"
          >
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>

          {/* Segmented Control Giới tính: Nam | Nữ */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segmentBtn, styleType === 'male' && styles.segmentBtnActive]}
              onPress={() => handleToggleGender('male')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  styleType === 'male' && styles.segmentBtnTextActive,
                ]}
              >
                Nam
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentBtn, styleType === 'female' && styles.segmentBtnActive]}
              onPress={() => handleToggleGender('female')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  styleType === 'female' && styles.segmentBtnTextActive,
                ]}
              >
                Nữ
              </Text>
            </TouchableOpacity>
          </View>

          {/* Nút gạt + Áo khoác dạng pill tối giản */}
          <TouchableOpacity
            style={[styles.layerPillBtn, isLayering && styles.layerPillBtnActive]}
            onPress={handleToggleLayering}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isLayering ? 'layers' : 'layers-outline'}
              size={14}
              color={isLayering ? '#FFFFFF' : '#111827'}
            />
            <Text
              style={[styles.layerPillText, isLayering && styles.layerPillTextActive]}
            >
              + Áo khoác
            </Text>
          </TouchableOpacity>
        </View>

        {/* Hàng điều khiển góc nhìn 3D: Trước | Nghiêng | Sau | 360° & Zoom */}
        <View style={styles.cameraToolbar}>
          <View style={styles.presetGroup}>
            {CAMERA_PRESETS.map(p => {
              const isSelected = !autoRotate && cameraPreset === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.presetChip, isSelected && styles.presetChipActive]}
                  onPress={() => handleSelectPreset(p.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      isSelected && styles.presetChipTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.presetChip, autoRotate && styles.presetChipActive]}
              onPress={() => setAutoRotate(v => !v)}
              activeOpacity={0.8}
            >
              <Ionicons
                name="sync-outline"
                size={12}
                color={autoRotate ? '#FFFFFF' : '#1F2937'}
              />
              <Text
                style={[
                  styles.presetChipText,
                  { marginLeft: 3 },
                  autoRotate && styles.presetChipTextActive,
                ]}
              >
                360°
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.zoomGroup}>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => handleZoom('in')}
              activeOpacity={0.75}
              accessibilityLabel="Phóng to"
            >
              <Ionicons name="add" size={16} color="#111827" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => handleZoom('out')}
              activeOpacity={0.75}
              accessibilityLabel="Thu nhỏ"
            >
              <Ionicons name="remove" size={16} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* 2. SÂN KHẤU CHÍNH CHIA 2 CỘT (TRÁI 62% 3D SKIA / PHẢI 38% BẢNG MÀU) */}
      <View style={styles.splitStage}>
        <View style={styles.stageLeft3D} onLayout={handleStageLayout}>
          <Outfit3DViewer
            width={stageSize.width}
            height={stageSize.height}
            config={viewerConfig}
            onSelectSlot={handleSelectSlotFrom3D}
            onResetView={handleReset3DView}
          />

          <View style={styles.stageOverlayFooter} pointerEvents="none">
            <View style={styles.stageHintPill}>
              <Ionicons name="cube-outline" size={11} color="#1F2937" />
              <Text style={styles.stageHintPillText}>Vuốt 360° • Chạm món • Đúp đặt lại</Text>
            </View>
          </View>
        </View>

        <View style={styles.stageRightCard}>
          <LookbookItemCard
            slots={slots}
            isLayering={isLayering}
            visualRatios={visualRatios}
            activeSlot={activeSlot}
            lockedCount={lockedCount}
            onSelectSlot={setActiveSlot}
            onToggleLock={handleToggleLock}
            onUnlockAll={handleUnlockAll}
          />
        </View>
      </View>

      {/* 3. BOTTOM SHEET / DOCK TRẮNG BO GÓC TRÊN */}
      <View
        style={[
          styles.bottomDock,
          { paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        {/* HÀNG CHỌN MÓN ÁP DỤNG "MÀU GỐC" CHỤP TỪ CAMERA */}
        <View style={styles.sourceSlotRow}>
          <View style={styles.sourceLabelGroup}>
            <View
              style={[
                styles.scannedColorDot,
                { backgroundColor: scannedColor.hex },
              ]}
            />
            <Text style={styles.sourceLabelText}>Màu chụp:</Text>
          </View>

          <View style={styles.sourcePillsRow}>
            {SOURCE_SLOT_OPTIONS.map(opt => {
              const isSelected = sourceSlot === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.sourcePillBtn,
                    isSelected && styles.sourcePillBtnActive,
                  ]}
                  onPress={() => handleSelectSourceSlot(opt.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.sourcePillText,
                      isSelected && styles.sourcePillTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* HÀNG TIÊU ĐỀ GU PHỐI + 4 CHIP CHỌN GU NHANH */}
        <View style={styles.ratioRowHeader}>
          <Text
            style={[
              styles.harmonyLabelText,
              advice.isWarning && styles.harmonyLabelWarning,
            ]}
            numberOfLines={1}
          >
            {advice.title}
          </Text>

          <View style={styles.harmonyChipRow}>
            {HARMONY_MODES.map(mode => {
              const isSelected = harmonyMode === mode.id;
              return (
                <TouchableOpacity
                  key={mode.id}
                  style={[
                    styles.harmonyChip,
                    isSelected && styles.harmonyChipActive,
                  ]}
                  onPress={() => setHarmonyMode(mode.id)}
                  activeOpacity={0.78}
                >
                  <Text
                    style={[
                      styles.harmonyChipText,
                      isSelected && styles.harmonyChipTextActive,
                    ]}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Câu giải thích Stylist (tối đa 2 dòng, nổi nhẹ nếu có cảnh báo cân bằng) */}
        <View
          style={[
            styles.adviceRow,
            advice.isWarning && styles.adviceRowWarning,
          ]}
        >
          {advice.isWarning && (
            <Ionicons
              name="alert-circle-outline"
              size={13}
              color="#B45309"
              style={styles.adviceWarningIcon}
            />
          )}
          <Text
            style={[
              styles.adviceText,
              advice.isWarning && styles.adviceTextWarning,
            ]}
            numberOfLines={2}
          >
            {advice.reason}
          </Text>
        </View>

        <View style={styles.visualRatioBar}>
          {isLayering && (
            <TouchableOpacity
              style={[
                styles.ratioSegment,
                {
                  flex: visualRatios.outerwear,
                  backgroundColor: slots.outerwear.color.hex,
                },
              ]}
              onPress={() => setActiveSlot('outerwear')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.ratioSegmentText,
                  { color: getContrastTextColor(slots.outerwear.color.hex) },
                ]}
                numberOfLines={1}
              >
                {visualRatios.outerwear}%
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.ratioSegment,
              { flex: visualRatios.top, backgroundColor: slots.top.color.hex },
            ]}
            onPress={() => setActiveSlot('top')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.ratioSegmentText,
                { color: getContrastTextColor(slots.top.color.hex) },
              ]}
              numberOfLines={1}
            >
              {visualRatios.top}%
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.ratioSegment,
              { flex: visualRatios.bottom, backgroundColor: slots.bottom.color.hex },
            ]}
            onPress={() => setActiveSlot('bottom')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.ratioSegmentText,
                { color: getContrastTextColor(slots.bottom.color.hex) },
              ]}
              numberOfLines={1}
            >
              {visualRatios.bottom}%
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.ratioSegment,
              { flex: visualRatios.shoes, backgroundColor: slots.shoes.color.hex },
            ]}
            onPress={() => setActiveSlot('shoes')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.ratioSegmentText,
                { color: getContrastTextColor(slots.shoes.color.hex) },
              ]}
              numberOfLines={1}
            >
              {visualRatios.shoes}%
            </Text>
          </TouchableOpacity>
        </View>

        {/* Thanh chọn phom dáng (Silhouette Picker) + Tinh chỉnh sắc độ nhanh + Nút '+' mở đủ 46 màu */}
        <View style={styles.pickerHeaderRow}>
          <View style={styles.activeSlotTitleRow}>
            <View
              style={[
                styles.activeSlotMiniDot,
                { backgroundColor: slots[activeSlot].color.hex },
              ]}
            />
            <Text style={styles.activeSlotHeading}>
              {activeSlotDisplayLabel}
            </Text>
          </View>

          <View style={styles.quickSwatchRow}>
            {quickPaletteColors.map(c => {
              const isCur = slots[activeSlot].color.id === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.quickSwatchDot,
                    { backgroundColor: c.hex },
                    isCur && styles.quickSwatchDotActive,
                  ]}
                  onPress={() => handleSelectColor(c)}
                  activeOpacity={0.8}
                />
              );
            })}

            {/* Nút tròn dấu '+' mở Modal bảng đủ màu vải chuẩn */}
            <TouchableOpacity
              style={styles.quickSwatchMoreBtn}
              onPress={() => setPaletteVisible(true)}
              activeOpacity={0.78}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel={`Mở bảng màu đầy đủ cho ${activeSlotDisplayLabel}`}
            >
              <Ionicons name="add" size={14} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.silhouetteScroll}
        >
          {availableSilhouettes.map(item => {
            const isSelected = slots[activeSlot].silhouette === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.silhouetteChip,
                  isSelected && styles.silhouetteChipSelected,
                ]}
                onPress={() => handleSelectSilhouette(item.id)}
                activeOpacity={0.82}
              >
                <Ionicons
                  name={item.iconName as keyof typeof Ionicons.glyphMap}
                  size={15}
                  color={isSelected ? '#FFFFFF' : '#374151'}
                />
                <Text
                  style={[
                    styles.silhouetteChipText,
                    isSelected && styles.silhouetteChipTextSelected,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Hàng nút thao tác chính ở đáy màn hình: Hoàn tác (Undo) | Đổi biến thể | Lưu tủ đồ */}
        <View style={styles.dockActionsRow}>
          <TouchableOpacity
            style={[
              styles.dockSecondaryBtn,
              history.length === 0 && styles.dockSecondaryBtnDisabled,
            ]}
            onPress={handleUndo}
            disabled={history.length === 0}
            activeOpacity={0.78}
            accessibilityLabel="Hoàn tác bước trước"
          >
            <Ionicons name="arrow-undo-outline" size={19} color="#111827" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shufflePrimaryBtn}
            onPress={handleShuffle}
            activeOpacity={0.85}
          >
            <Ionicons name="shuffle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.shufflePrimaryBtnText}>Đổi biến thể</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dockSecondaryBtn}
            onPress={handleSaveOutfit}
            activeOpacity={0.78}
            accessibilityLabel="Lưu tủ đồ"
          >
            <Ionicons name="bookmark-outline" size={18} color="#111827" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Thông báo Toast nổi tự ẩn sau 2 giây */}
      {toastMessage && (
        <View style={styles.toastOverlay} pointerEvents="none">
          <View style={styles.toastPill}>
            <Ionicons name="information-circle-outline" size={15} color="#FFFFFF" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      )}

      {/* Modal Bottom Sheet chọn thủ công đủ 46 màu vải chuẩn */}
      <ColorPaletteSheet
        visible={paletteVisible}
        slotLabel={activeSlotDisplayLabel}
        selectedColorId={slots[activeSlot].color.id}
        onSelectColor={handleSelectColorFromPalette}
        onClose={() => setPaletteVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#A8A8A5',
  },
  // 1. TOP BAR
  topBarSafe: {
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.44)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    height: 36,
    padding: 3,
    width: 128,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  segmentBtnActive: {
    backgroundColor: '#111827',
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
    includeFontPadding: false,
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  layerPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.56)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.75)',
  },
  layerPillBtnActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  layerPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 5,
    includeFontPadding: false,
  },
  layerPillTextActive: {
    color: '#FFFFFF',
  },
  cameraToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  presetGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
    marginRight: 6,
  },
  presetChipActive: {
    backgroundColor: '#111827',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1F2937',
    includeFontPadding: false,
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  zoomGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  zoomBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },

  // 2. SPLIT STAGE (TRÁI 62% 3D / PHẢI 38% BẢNG MÀU)
  splitStage: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  stageLeft3D: {
    flex: 0.62,
    minHeight: 360,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageOverlayFooter: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  stageHintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.44)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
  },
  stageHintPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 4,
  },
  stageRightCard: {
    flex: 0.38,
    paddingLeft: 5,
    paddingVertical: 4,
  },

  // 3. BOTTOM DOCK TRẮNG BO GÓC TRÊN
  bottomDock: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  // HÀNG CHỌN VỊ TRÍ ÁP DỤNG MÀU GỐC CHỤP TỪ CAMERA
  sourceSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sourceLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scannedColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(17, 24, 39, 0.25)',
    marginRight: 6,
  },
  sourceLabelText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#374151',
  },
  sourcePillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourcePillBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginLeft: 5,
  },
  sourcePillBtnActive: {
    backgroundColor: '#111827',
  },
  sourcePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
    includeFontPadding: false,
  },
  sourcePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  ratioRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  harmonyLabelText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 6,
  },
  harmonyLabelWarning: {
    color: '#B45309',
  },
  harmonyChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  harmonyChip: {
    paddingHorizontal: 6.5,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    marginLeft: 3,
  },
  harmonyChipActive: {
    backgroundColor: '#111827',
  },
  harmonyChipText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#4B5563',
    includeFontPadding: false,
  },
  harmonyChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  adviceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  adviceRowWarning: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  adviceWarningIcon: {
    marginRight: 4,
    marginTop: 1,
  },
  adviceText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14.5,
    fontWeight: '500',
    color: '#4B5563',
  },
  adviceTextWarning: {
    color: '#92400E',
    fontWeight: '600',
  },
  visualRatioBar: {
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    marginBottom: 8,
  },
  ratioSegment: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  ratioSegmentText: {
    fontSize: 9,
    fontWeight: '800',
  },
  pickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  activeSlotTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeSlotMiniDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
  },
  activeSlotHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  quickSwatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickSwatchDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.16)',
  },
  quickSwatchDotActive: {
    borderWidth: 2,
    borderColor: '#111827',
    transform: [{ scale: 1.12 }],
  },
  quickSwatchMoreBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginLeft: 7,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  silhouetteScroll: {
    paddingVertical: 2,
    marginBottom: 8,
  },
  silhouetteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 11,
    paddingVertical: 6.5,
    borderRadius: 15,
    marginRight: 7,
  },
  silhouetteChipSelected: {
    backgroundColor: '#111827',
  },
  silhouetteChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 5,
    includeFontPadding: false,
  },
  silhouetteChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dockActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dockSecondaryBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockSecondaryBtnDisabled: {
    opacity: 0.35,
  },
  shufflePrimaryBtn: {
    flex: 1,
    height: 44,
    marginHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  shufflePrimaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  toastOverlay: {
    position: 'absolute',
    top: 98,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 40,
  },
  toastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
});

export default InteractiveMixStudio;
