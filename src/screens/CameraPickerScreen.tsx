import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Platform,
  Alert,
  ScrollView,
  Pressable,
  GestureResponderEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
} from 'react-native-vision-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute, useIsFocused } from '@react-navigation/native';

import { CameraReticle } from '../components/CameraReticle';
import { LivePreviewCard } from '../components/LivePreviewCard';
import { LightingMode } from '../services/ColorEngine';
import {
  FashionColor,
  FASHION_COLORS,
  SAMPLE_FABRIC_IMAGES,
} from '../constants/fashionColors';
import { useCameraColorSampler } from '../hooks/useCameraColorSampler';
import { shortColorName } from '../engine/OutfitEngine';
import { CompareContext, MatchItemSelection, OutfitSlotId } from '../types/outfit';
import { RootStackParamList } from '../../App';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'CameraPicker'>;
type CameraRouteProp = RouteProp<RootStackParamList, 'CameraPicker'>;

const SLOT_SHORT_LABELS: Record<OutfitSlotId, string> = {
  top: 'Áo',
  outerwear: 'Áo khoác',
  bottom: 'Quần/Váy',
  shoes: 'Giày',
};

const LIGHT_ENVIRONMENTS = [
  { label: 'Tự động', mode: 'auto' as LightingMode, icon: 'sunny-outline' as const },
  { label: 'Đèn vàng', mode: 'warm_light' as LightingMode, icon: 'bulb-outline' as const },
  { label: 'Ngoài trời', mode: 'outdoor' as LightingMode, icon: 'partly-sunny-outline' as const },
];

export const CameraPickerScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CameraRouteProp>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);

  // Chế độ so sánh 2 món (Bước 2/2 hoặc Hút lại Món 1 / Món 2)
  const [compareContext, setCompareContext] = useState<CompareContext | null>(
    route.params?.compareContext ?? null
  );

  // 1. Quản lý quyền Camera & Thiết bị Camera
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  // Zoom 1x / 2x cho vật thể nhỏ
  const [isZoomed, setIsZoomed] = useState(false);
  const neutralZoom = device?.neutralZoom ?? 1;
  const maxZoom = device?.maxZoom ?? 1;
  const zoom = isZoomed ? Math.min(maxZoom, neutralZoom * 2) : neutralZoom;

  // Điểm chạm lấy nét & đo sáng
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  // Định dạng camera 720p (1280x720) sắc nét, kết hợp vùng crop 6x6 ở 4fps không làm nóng máy
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { fps: 30 },
  ]);

  // Flashlight & Lighting environment states
  const [torchOn, setTorchOn] = useState(false);
  const [lightEnvIndex, setLightEnvIndex] = useState(0);
  const currentEnv = LIGHT_ENVIRONMENTS[lightEnvIndex];

  // Hook độc lập quản lý Frame Processor và Color Engine (Trimmed Mean trực tiếp trong Worklet)
  const {
    colorResult: currentColorResult,
    isFrozen,
    freeze,
    unfreeze,
    frameProcessor,
    calibrateWithMode,
    isRgbSwapped,
    toggleRgbSwap,
  } = useCameraColorSampler({
    lightingMode: currentEnv.mode,
    initialColor: FASHION_COLORS[0],
  });

  // Chạm lấy nét & đo sáng điểm tại vị trí bấm
  const handleTouchCamera = useCallback(
    async (event: GestureResponderEvent) => {
      if (isFrozen) return;
      const { locationX, locationY } = event.nativeEvent;

      // Hiển thị vòng phản hồi lấy nét ngắn tại vị trí chạm
      setFocusPoint({ x: locationX, y: locationY });
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
      focusTimeoutRef.current = setTimeout(() => {
        setFocusPoint(null);
      }, 1200);

      if (device?.supportsFocus) {
        try {
          await cameraRef.current?.focus({ x: locationX, y: locationY });
        } catch {
          // Bỏ qua nếu thiết bị đang bận hoặc không hỗ trợ
        }
      }
    },
    [device?.supportsFocus, isFrozen]
  );

  // Selected shade when fine-tuning in frozen mode
  const [selectedColor, setSelectedColor] = useState<FashionColor>(FASHION_COLORS[0]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync compareContext khi điều hướng truyền vào (VD: Hút lại từ MatchChecker hoặc chuyển từ ImagePicker)
  useEffect(() => {
    if (route.params?.compareContext) {
      setCompareContext(route.params.compareContext);
      unfreeze();
    }
  }, [route.params?.compareContext, unfreeze]);

  // Sync selectedColor when currentColorResult updates while active
  useEffect(() => {
    if (!isFrozen) {
      setSelectedColor(currentColorResult.matchedColor);
    }
  }, [currentColorResult, isFrozen]);

  // Request camera permission on mount if needed
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // 3. Tính năng hỗ trợ thực tế
  // Bật/tắt đèn flash
  const toggleTorch = useCallback(() => {
    if (!device?.hasTorch) {
      showToast('Thiết bị không hỗ trợ đèn Flash');
      return;
    }
    setTorchOn((prev) => !prev);
  }, [device?.hasTorch]);

  // Đổi chế độ ánh sáng (Tự động / Đèn vàng / Ngoài trời)
  const cycleLightEnv = useCallback(() => {
    const nextIndex = (lightEnvIndex + 1) % LIGHT_ENVIRONMENTS.length;
    setLightEnvIndex(nextIndex);
    const nextEnv = LIGHT_ENVIRONMENTS[nextIndex];
    const updated = calibrateWithMode(nextEnv.mode);
    if (updated) {
      setSelectedColor(updated.matchedColor);
    }
  }, [lightEnvIndex, calibrateWithMode]);

  // Chốt màu (Freeze)
  const handleShutter = useCallback(() => {
    freeze();
    setSelectedColor(currentColorResult.matchedColor);
  }, [freeze, currentColorResult.matchedColor]);

  // Chụp lại (Hủy Freeze và mở lại camera)
  const handleRetake = useCallback(() => {
    unfreeze();
  }, [unfreeze]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  };

  const handleWardrobe = () => {
    navigation.navigate('Lookbook');
  };

  const openImagePicker = async () => {
    const activeCtx = compareContext || undefined;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        navigation.navigate('ImagePicker', {
          imageUri: result.assets[0].uri,
          compareContext: activeCtx,
        });
      }
    } catch {
      navigation.navigate('ImagePicker', {
        imageUri: SAMPLE_FABRIC_IMAGES[0],
        compareContext: activeCtx,
      });
    }
  };

  const handleStartCompareSecond = useCallback(() => {
    const firstItem: MatchItemSelection = {
      slot: 'top',
      color: selectedColor,
    };
    const nextCtx: CompareContext = {
      mode: 'pick_second',
      item1: firstItem,
    };
    setCompareContext(nextCtx);
    unfreeze();
    showToast(`Đã giữ Món 1 (${shortColorName(selectedColor.name)}) • Hãy soi Món 2`);
  }, [selectedColor, unfreeze]);

  const handleCancelCompare = useCallback(() => {
    if (
      (compareContext?.mode === 'rescan_item1' ||
        compareContext?.mode === 'rescan_item2') &&
      navigation.canGoBack()
    ) {
      navigation.goBack();
      return;
    }
    setCompareContext(null);
    navigation.setParams({ compareContext: undefined });
    unfreeze();
  }, [compareContext?.mode, navigation, unfreeze]);

  const handleConfirmMatch = () => {
    if (compareContext) {
      let finalItem1: MatchItemSelection;
      let finalItem2: MatchItemSelection;

      if (compareContext.mode === 'rescan_item1' && compareContext.item2) {
        const slot1: OutfitSlotId =
          compareContext.item1?.slot ||
          (compareContext.item2.slot === 'top' ? 'bottom' : 'top');
        finalItem1 = { slot: slot1, color: selectedColor };
        finalItem2 = compareContext.item2;
      } else if (compareContext.mode === 'rescan_item2' && compareContext.item1) {
        const slot2: OutfitSlotId =
          compareContext.item2?.slot ||
          (compareContext.item1.slot === 'bottom' ? 'top' : 'bottom');
        finalItem1 = compareContext.item1;
        finalItem2 = { slot: slot2, color: selectedColor };
      } else {
        // pick_second
        const item1 = compareContext.item1 || {
          slot: 'top' as OutfitSlotId,
          color: FASHION_COLORS[0],
        };
        const slot2: OutfitSlotId = item1.slot === 'bottom' ? 'top' : 'bottom';
        finalItem1 = item1;
        finalItem2 = { slot: slot2, color: selectedColor };
      }

      const wasPickSecond = compareContext.mode === 'pick_second';
      unfreeze();
      if (wasPickSecond) {
        setCompareContext(null);
        navigation.setParams({ compareContext: undefined });
      }
      navigation.navigate('MatchChecker', {
        item1: finalItem1,
        item2: finalItem2,
      });
      return;
    }

    navigation.navigate('OutfitSuggestion', {
      baseColor: selectedColor,
      baseRole: 'top',
    });
  };

  // Thông tin hiển thị trên thanh banner kính mờ khi đang so sánh 2 món
  const compareBannerInfo = useMemo(() => {
    if (!compareContext) return null;

    if (compareContext.mode === 'rescan_item1') {
      const targetSlot = compareContext.item1?.slot || 'top';
      const kept = compareContext.item2;
      return {
        badge: 'Hút lại Món 1',
        swatchHex: kept?.color.hex || '#111827',
        heldText: kept
          ? `Món 2 (${SLOT_SHORT_LABELS[kept.slot]}): ${shortColorName(kept.color.name)}`
          : 'Đang cập nhật Món 1',
        guideText: `Chĩa camera vào Món 1 (${SLOT_SHORT_LABELS[targetSlot]}) để cập nhật màu`,
        ctaLabel: 'Cập nhật',
      };
    }

    if (compareContext.mode === 'rescan_item2') {
      const targetSlot = compareContext.item2?.slot || 'bottom';
      const kept = compareContext.item1;
      return {
        badge: 'Hút lại Món 2',
        swatchHex: kept?.color.hex || '#111827',
        heldText: kept
          ? `Món 1 (${SLOT_SHORT_LABELS[kept.slot]}): ${shortColorName(kept.color.name)}`
          : 'Đang cập nhật Món 2',
        guideText: `Chĩa camera vào Món 2 (${SLOT_SHORT_LABELS[targetSlot]}) để cập nhật màu`,
        ctaLabel: 'Cập nhật',
      };
    }

    const kept = compareContext.item1;
    const nextSlot: OutfitSlotId = kept?.slot === 'bottom' ? 'top' : 'bottom';
    return {
      badge: 'Bước 2/2',
      swatchHex: kept?.color.hex || '#111827',
      heldText: kept
        ? `Món 1 (${SLOT_SHORT_LABELS[kept.slot]}): ${shortColorName(kept.color.name)}`
        : 'Đã chọn Món 1',
      guideText: `Chĩa camera vào Món 2 (${SLOT_SHORT_LABELS[nextSlot]}) để chấm điểm`,
      ctaLabel: 'Chấm điểm',
    };
  }, [compareContext]);

  // Danh sách các sắc độ lân cận cho người dùng tinh chỉnh trong chế độ Freeze
  const shadeOptions = useMemo(() => {
    const list: FashionColor[] = [currentColorResult.matchedColor];
    if (currentColorResult.nearbyColors && currentColorResult.nearbyColors.length > 0) {
      currentColorResult.nearbyColors.forEach((c) => {
        if (!list.some((existing) => existing.id === c.id)) {
          list.push(c);
        }
      });
    }
    return list;
  }, [currentColorResult]);

  // Giao diện khi chưa được cấp quyền Camera
  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.permissionBox}>
          <View style={styles.permissionIconCircle}>
            <Ionicons name="camera" size={40} color="#FFFFFF" />
          </View>
          <Text style={styles.permissionTitle}>Cần quyền truy cập Camera</Text>
          <Text style={styles.permissionDesc}>
            Ứng dụng cần quyền truy cập Camera để nhận diện màu sắc trang phục thực tế từ sợi vải.
          </Text>
          <TouchableOpacity
            style={styles.permissionBtn}
            onPress={requestPermission}
            activeOpacity={0.85}
          >
            <Text style={styles.permissionBtnText}>Cấp quyền Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Vision Camera Preview (Tối ưu YUV, hạ phân giải 480p, buffer compression, zoom 1x/2x, cover đồng trục) */}
      {device != null ? (
        <>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            format={format}
            fps={30}
            pixelFormat="yuv"
            enableBufferCompression={true}
            isActive={isFocused && !isFrozen}
            torch={device.hasTorch && torchOn ? 'on' : 'off'}
            frameProcessor={frameProcessor}
            zoom={zoom}
            resizeMode="cover"
          />
          {/* Lớp bắt cử chỉ chạm lấy nét & đo sáng điểm */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleTouchCamera}
            disabled={isFrozen}
          />

          {/* Vòng phản hồi lấy nét & đo sáng điểm khi chạm */}
          {focusPoint != null && !isFrozen && (
            <View
              pointerEvents="none"
              style={[
                styles.focusRing,
                {
                  left: focusPoint.x - 28,
                  top: focusPoint.y - 28,
                },
              ]}
            >
              <View style={styles.focusCenterDot} />
            </View>
          )}
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.permissionBox]}>
          <Ionicons name="camera-reverse-outline" size={48} color="#6B7280" />
          <Text style={styles.permissionDesc}>Không tìm thấy thiết bị Camera phù hợp.</Text>
        </View>
      )}

      {/* Lớp nền mờ khi đóng băng (Freeze mode) */}
      {isFrozen && <View style={styles.frozenBackdrop} />}

      {/* Floating Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <View style={styles.headerLeftGroup}>
            {/* Flash Toggle */}
            <TouchableOpacity
              style={[styles.headerPillBtn, torchOn && styles.headerPillBtnActive]}
              onPress={toggleTorch}
              activeOpacity={0.8}
              accessibilityLabel="Bật tắt đèn flash soi vải"
            >
              <Ionicons
                name={torchOn ? 'flash' : 'flash-off-outline'}
                size={18}
                color={torchOn ? '#111827' : '#FFFFFF'}
              />
            </TouchableOpacity>

            {/* R-B Channel Swap Toggle (hỗ trợ các dòng Android sensor BGR) */}
            <TouchableOpacity
              style={[styles.headerPillBtn, isRgbSwapped && styles.headerPillBtnActive]}
              onPress={() => {
                toggleRgbSwap();
                showToast(!isRgbSwapped ? 'Đã bật đảo kênh R-B (BGR)' : 'Đã về kênh chuẩn RGB');
              }}
              activeOpacity={0.8}
              accessibilityLabel="Đảo kênh màu R-B"
            >
              <Ionicons
                name="swap-horizontal"
                size={18}
                color={isRgbSwapped ? '#111827' : '#FFFFFF'}
              />
            </TouchableOpacity>
          </View>

          {/* Environment Lighting Pill */}
          <TouchableOpacity
            style={styles.envPill}
            onPress={cycleLightEnv}
            activeOpacity={0.8}
            accessibilityLabel="Thay đổi môi trường ánh sáng"
          >
            <Ionicons
              name={currentEnv.icon}
              size={14}
              color="#F59E0B"
              style={styles.envIcon}
            />
            <Text style={styles.envText}>{currentEnv.label}</Text>
            <Ionicons name="chevron-down" size={12} color="#6B7280" />
          </TouchableOpacity>

          {/* Frozen Indicator / Status Pill */}
          {isFrozen ? (
            <TouchableOpacity
              style={styles.retakeTopBtn}
              onPress={handleRetake}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={16} color="#111827" />
              <Text style={styles.retakeTopText}>Chụp lại</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerRightPlaceholder} />
          )}
        </View>

        {/* Thanh banner kính mờ khi đang ở chế độ So sánh Bước 2/2 hoặc Hút lại */}
        {compareBannerInfo && (
          <View style={styles.compareBanner}>
            <View style={styles.compareBannerTopRow}>
              <View style={styles.compareHeldLeft}>
                <View style={styles.compareStepBadge}>
                  <Text style={styles.compareStepBadgeText}>
                    {compareBannerInfo.badge}
                  </Text>
                </View>
                <View
                  style={[
                    styles.compareSwatchDot,
                    { backgroundColor: compareBannerInfo.swatchHex },
                  ]}
                />
                <Text style={styles.compareHeldText} numberOfLines={1}>
                  {compareBannerInfo.heldText}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.compareCancelBtn}
                onPress={handleCancelCompare}
                activeOpacity={0.78}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="close" size={13} color="#FFFFFF" />
                <Text style={styles.compareCancelText}>Hủy</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.compareGuideText} numberOfLines={1}>
              {compareBannerInfo.guideText}
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* Tâm ngắm Reticle (Đồng trục tuyệt đối với tâm cảm biến camera 100%) */}
      {!isFrozen && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.reticleOverlay]}
        >
          <CameraReticle
            color={currentColorResult.matchedColor}
            rawHex={currentColorResult.rawHex}
          />
        </View>
      )}

      {/* Thumb Zone - Khu vực tương tác phía dưới */}
      <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* Live Preview Card khi đang soi màu */}
        {!isFrozen && (
          <LivePreviewCard
            color={currentColorResult.matchedColor}
          />
        )}

        {/* Thanh công cụ chụp hoặc Thẻ xác nhận & chọn sắc độ lân cận */}
        {!isFrozen ? (
          <View style={styles.bottomDock}>
            {/* Nút Thư viện ảnh */}
            <TouchableOpacity
              style={styles.dockIconBtn}
              onPress={openImagePicker}
              activeOpacity={0.75}
              accessibilityLabel="Mở ảnh từ thư viện"
            >
              <View style={styles.iconCircle}>
                <Ionicons name="images-outline" size={24} color="#111827" />
              </View>
              <Text style={styles.dockLabel}>Thư viện</Text>
            </TouchableOpacity>

            {/* Cột giữa: Nút chuyển nhanh Zoom 1x / 2x và Nút Chốt màu (Shutter) */}
            <View style={styles.centerShutterCol}>
              {/* Nút chuyển nhanh Zoom 1x / 2x cho vật thể nhỏ */}
              <TouchableOpacity
                style={[styles.zoomToggleBtn, isZoomed && styles.zoomToggleBtnActive]}
                onPress={() => setIsZoomed((prev) => !prev)}
                activeOpacity={0.8}
                accessibilityLabel="Chuyển chế độ zoom 1x / 2x"
              >
                <Text style={[styles.zoomToggleText, isZoomed && styles.zoomToggleTextActive]}>
                  {isZoomed ? '2x' : '1x'}
                </Text>
              </TouchableOpacity>

              {/* Nút Chốt màu (Shutter) */}
              <TouchableOpacity
                style={styles.shutterOuter}
                onPress={handleShutter}
                activeOpacity={0.85}
                accessibilityLabel="Chốt mã màu vải"
              >
                <View
                  style={[
                    styles.shutterInner,
                    { backgroundColor: currentColorResult.matchedColor.hex },
                  ]}
                >
                  <View style={styles.shutterCenterDot} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Nút Tủ đồ */}
            <TouchableOpacity
              style={styles.dockIconBtn}
              onPress={handleWardrobe}
              activeOpacity={0.75}
              accessibilityLabel="Mở tủ đồ"
            >
              <View style={styles.iconCircle}>
                <Ionicons name="shirt-outline" size={24} color="#111827" />
              </View>
              <Text style={styles.dockLabel}>Tủ đồ</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Thẻ xác nhận & chọn sắc độ lân cận (Freeze Card) */
          <View style={styles.frozenCard}>
            {/* Tiêu đề & Swatch màu đang chọn */}
            <View style={styles.frozenHeaderRow}>
              <View
                style={[
                  styles.frozenColorSwatch,
                  { backgroundColor: selectedColor.hex },
                ]}
              />
              <View style={styles.frozenTextCol}>
                <View style={styles.frozenTitleRow}>
                  <Text style={styles.frozenColorTitle} numberOfLines={1}>
                    {selectedColor.name}
                  </Text>
                  <View style={styles.deltaEBadge}>
                    <Text style={styles.deltaEText}>
                      ΔE {currentColorResult.deltaE.toFixed(1)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.frozenHex}>
                  HEX: {selectedColor.hex.toUpperCase()} • Chuẩn hóa ánh sáng ({currentEnv.label})
                </Text>
              </View>
            </View>

            {/* Danh sách 3 sắc độ lân cận để người dùng tinh chỉnh */}
            <View style={styles.shadesSection}>
              <Text style={styles.shadesLabel}>Sắc độ lân cận đối chiếu:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.shadesRow}
              >
                {shadeOptions.map((shade, idx) => {
                  const isSelected = selectedColor.id === shade.id;
                  return (
                    <TouchableOpacity
                      key={shade.id}
                      style={[
                        styles.shadePill,
                        isSelected && styles.shadePillSelected,
                      ]}
                      onPress={() => setSelectedColor(shade)}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.shadeDot,
                          { backgroundColor: shade.hex },
                        ]}
                      />
                      <Text
                        style={[
                          styles.shadeName,
                          isSelected && styles.shadeNameSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {shade.name}
                      </Text>
                      {idx === 0 && (
                        <View style={styles.matchedTag}>
                          <Text style={styles.matchedTagText}>Chuẩn</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Các nút hành động */}
            <View style={styles.frozenActionRow}>
              <TouchableOpacity
                style={styles.retakeCardBtn}
                onPress={handleRetake}
                activeOpacity={0.85}
              >
                <Ionicons name="refresh-outline" size={18} color="#374151" />
                <Text
                  style={styles.retakeCardBtnText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  Chụp lại
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={handleConfirmMatch}
                activeOpacity={0.88}
              >
                <Text
                  style={styles.primaryActionText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {compareBannerInfo
                    ? compareBannerInfo.ctaLabel
                    : 'Phối đồ với màu này →'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Nút phụ nổi bật: So với món thứ 2 (chỉ hiện ở bước chọn Món 1) */}
            {!compareContext && (
              <TouchableOpacity
                style={styles.compareSecondBtn}
                onPress={handleStartCompareSecond}
                activeOpacity={0.82}
              >
                <Ionicons
                  name="git-compare-outline"
                  size={17}
                  color="#111827"
                  style={styles.compareSecondIcon}
                />
                <Text style={styles.compareSecondBtnText}>
                  So với món thứ 2
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Toast thông báo */}
      {toastMessage && (
        <View style={[styles.toastContainer, { bottom: insets.bottom + 120 }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  permissionBox: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 300,
  },
  permissionBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  permissionBtnText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
  frozenBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  headerSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerPillBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  headerPillBtnActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  headerRightPlaceholder: {
    width: 92,
    height: 42,
  },
  headerPillBtnPlaceholder: {
    width: 42,
    height: 42,
  },
  envPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  envIcon: {
    marginRight: 6,
  },
  envText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginRight: 4,
  },
  retakeTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  retakeTopText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  reticleOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
  },
  focusCenterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  bottomDock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  dockIconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    marginBottom: 6,
  },
  centerShutterCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  zoomToggleBtnActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#FFFFFF',
  },
  zoomToggleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  zoomToggleTextActive: {
    color: '#111827',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 4,
  },
  dockLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  shutterCenterDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  frozenCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  frozenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  frozenColorSwatch: {
    width: 50,
    height: 50,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  frozenTextCol: {
    marginLeft: 12,
    flex: 1,
  },
  frozenTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  frozenColorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  deltaEBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  deltaEText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  frozenHex: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 3,
  },
  shadesSection: {
    marginBottom: 16,
  },
  shadesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 8,
  },
  shadesRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    gap: 8,
  },
  shadePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  shadePillSelected: {
    borderColor: '#111827',
    backgroundColor: '#F3F4F6',
  },
  shadeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    marginRight: 6,
  },
  shadeName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  shadeNameSelected: {
    color: '#111827',
    fontWeight: '700',
  },
  matchedTag: {
    marginLeft: 6,
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  matchedTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4338CA',
  },
  frozenActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  retakeCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  retakeCardBtnText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
    includeFontPadding: false,
  },
  primaryActionButton: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#111827',
    borderRadius: 14,
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
  compareSecondBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    minHeight: 46,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#111827',
  },
  compareSecondIcon: {
    marginRight: 7,
  },
  compareSecondBtnText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  compareBanner: {
    marginHorizontal: 14,
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(17, 24, 39, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  compareBannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compareHeldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  compareStepBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 7,
  },
  compareStepBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  compareSwatchDot: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    marginRight: 6,
  },
  compareHeldText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  compareCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  compareCancelText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 2,
  },
  compareGuideText: {
    color: '#E5E7EB',
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 5,
  },
  toastContainer: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 100,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
});
