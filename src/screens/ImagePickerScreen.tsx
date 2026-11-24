// src/screens/ImagePickerScreen.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { MagnifierLoupe } from '../components/MagnifierLoupe';
import { ColorResultSheet } from '../components/ColorResultSheet';
import {
  FashionColor,
  FASHION_COLORS,
  SAMPLE_FABRIC_IMAGES,
} from '../constants/fashionColors';
import {
  loadAndDecodeImage,
  sampleColorAtNormalizedPoint,
  releaseImageBuffer,
} from '../utils/imagePixelReader';
import { LightingMode } from '../services/ColorEngine';
import { shortColorName } from '../engine/OutfitEngine';
import { CompareContext, MatchItemSelection, OutfitSlotId } from '../types/outfit';
import { RootStackParamList } from '../../App';

type ImagePickerRouteProp = RouteProp<RootStackParamList, 'ImagePicker'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ImagePicker'>;

const SLOT_SHORT_LABELS: Record<OutfitSlotId, string> = {
  top: 'Áo',
  outerwear: 'Áo khoác',
  bottom: 'Quần/Váy',
  shoes: 'Giày',
};

const LIGHTING_MODES: { key: LightingMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'auto', label: 'Tự động', icon: 'sparkles' },
  { key: 'warm_light', label: 'Đèn vàng', icon: 'bulb' },
  { key: 'outdoor', label: 'Ngoài trời', icon: 'sunny' },
];

export const ImagePickerScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ImagePickerRouteProp>();

  // URI ảnh gốc ban đầu
  const [currentImageUri, setCurrentImageUri] = useState<string>(
    route.params?.imageUri || SAMPLE_FABRIC_IMAGES[0]
  );

  // Chế độ so sánh 2 món (giữ nguyên khi chuyển qua lại giữa Camera và Thư viện ảnh)
  const [compareContext, setCompareContext] = useState<CompareContext | null>(
    route.params?.compareContext ?? null
  );

  useEffect(() => {
    if (route.params?.compareContext) {
      setCompareContext(route.params.compareContext);
    }
  }, [route.params?.compareContext]);

  // URI và kích thước ảnh đã qua ImageManipulator (đã chuẩn hóa xoay EXIF và resize 500px)
  const [manipulatedUri, setManipulatedUri] = useState<string | null>(null);
  const [imageNaturalW, setImageNaturalW] = useState<number>(500);
  const [imageNaturalH, setImageNaturalH] = useState<number>(500);

  // Key để reset zoom/pan
  const [resetKey, setResetKey] = useState(0);

  // Trạng thái giải mã ảnh
  const [isLoadingImage, setIsLoadingImage] = useState<boolean>(true);

  // Chế độ ánh sáng: Tự động | Đèn vàng | Ngoài trời
  const [lightingMode, setLightingMode] = useState<LightingMode>('auto');

  // Lưu tọa độ lấy mẫu gần nhất [0..1]
  const lastCoords = useRef<{ normX: number; normY: number }>({
    normX: 0.5,
    normY: 0.5,
  });

  // Dữ liệu màu sắc thời gian thực
  const [selectedColor, setSelectedColor] = useState<FashionColor>(FASHION_COLORS[0]);
  const [activeHex, setActiveHex] = useState<string>(FASHION_COLORS[0].hex);
  const [rawHex, setRawHex] = useState<string>(FASHION_COLORS[0].hex);
  const [nearbyColors, setNearbyColors] = useState<FashionColor[]>([]);

  /**
   * Lấy mẫu màu thực tế từ ảnh bằng ColorEngine
   */
  const performColorSampling = useCallback(
    (normX: number, normY: number, mode: LightingMode = lightingMode) => {
      lastCoords.current = { normX, normY };
      const result = sampleColorAtNormalizedPoint(normX, normY, mode);
      if (result) {
        setRawHex(result.rawHex);
        setSelectedColor(result.matchedColor);
        setActiveHex(result.calibratedHex);
        setNearbyColors(result.nearbyColors);
      }
    },
    [lightingMode]
  );

  /**
   * Tải, resize 500px chuẩn hóa xoay EXIF và giải mã pixel vào RAM
   */
  useEffect(() => {
    let isMounted = true;
    setIsLoadingImage(true);

    loadAndDecodeImage(currentImageUri)
      .then(info => {
        if (!isMounted) return;
        // Đồng bộ 100% URI ảnh hiển thị và kích thước gốc với buffer pixel
        setManipulatedUri(info.uri);
        setImageNaturalW(info.width);
        setImageNaturalH(info.height);
        setIsLoadingImage(false);

        // Lấy mẫu tại tâm ảnh ngay sau khi load xong
        performColorSampling(0.5, 0.5, lightingMode);
      })
      .catch(err => {
        if (!isMounted) return;
        setIsLoadingImage(false);
        console.warn('Lỗi tải ảnh:', err);
        Alert.alert(
          'Không thể đọc ảnh',
          'Vui lòng thử chọn một hình ảnh khác từ thư viện máy.',
          [{ text: 'Đồng ý' }]
        );
      });

    return () => {
      isMounted = false;
    };
  }, [currentImageUri, performColorSampling, lightingMode]);

  /**
   * Giải phóng bộ nhớ buffer ảnh khi unmount màn hình
   */
  useEffect(() => {
    return () => {
      releaseImageBuffer();
    };
  }, []);

  // Thay đổi chế độ ánh sáng
  const handleChangeLightingMode = (mode: LightingMode) => {
    setLightingMode(mode);
    performColorSampling(lastCoords.current.normX, lastCoords.current.normY, mode);
  };

  // Di chuyển ngón tay trên ảnh
  const handlePositionChange = (normX: number, normY: number) => {
    performColorSampling(normX, normY, lightingMode);
  };

  const handleSelectShade = (hex: string) => {
    setActiveHex(hex);
  };

  const handleSelectColor = (color: FashionColor) => {
    setSelectedColor(color);
    setActiveHex(color.hex);
  };

  const handleReset = () => {
    setResetKey(prev => prev + 1);
    performColorSampling(0.5, 0.5, lightingMode);
  };

  const handlePickAnotherImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setCurrentImageUri(result.assets[0].uri);
        setManipulatedUri(null);
        handleReset();
      }
    } catch {
      // Đổi luân phiên ảnh mẫu fabric
      const currentIndex = SAMPLE_FABRIC_IMAGES.indexOf(currentImageUri);
      const nextIndex = (currentIndex + 1) % SAMPLE_FABRIC_IMAGES.length;
      setCurrentImageUri(SAMPLE_FABRIC_IMAGES[nextIndex]);
      setManipulatedUri(null);
      handleReset();
    }
  };

  const handleStartCompareSecond = useCallback(() => {
    const firstItem: MatchItemSelection = {
      slot: 'top',
      color: selectedColor,
    };
    setCompareContext({
      mode: 'pick_second',
      item1: firstItem,
    });
  }, [selectedColor]);

  const handleCancelCompare = useCallback(() => {
    setCompareContext(null);
    navigation.setParams({ compareContext: undefined });
  }, [navigation]);

  const handleSwitchToCameraCompare = useCallback(() => {
    if (!compareContext) return;
    navigation.navigate('CameraPicker', { compareContext });
  }, [compareContext, navigation]);

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
        const item1 = compareContext.item1 || {
          slot: 'top' as OutfitSlotId,
          color: FASHION_COLORS[0],
        };
        const slot2: OutfitSlotId = item1.slot === 'bottom' ? 'top' : 'bottom';
        finalItem1 = item1;
        finalItem2 = { slot: slot2, color: selectedColor };
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
        guideText: `Di ngón tay chọn màu Món 1 (${SLOT_SHORT_LABELS[targetSlot]}) trên ảnh`,
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
        guideText: `Di ngón tay chọn màu Món 2 (${SLOT_SHORT_LABELS[targetSlot]}) trên ảnh`,
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
      guideText: `Chấm vùng vải Món 2 (${SLOT_SHORT_LABELS[nextSlot]}), đổi ảnh hoặc mở Camera`,
      ctaLabel: 'Chấm điểm',
    };
  }, [compareContext]);

  const activeDisplayUri = manipulatedUri || currentImageUri;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Header chính */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          {/* Nút quay lại */}
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            accessibilityLabel="Quay lại"
          >
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>

          {/* Tiêu đề */}
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Chọn vùng vải</Text>
            <Text style={styles.headerSubtitle}>Lọc nhiễu sợi & đọc pixel thật</Text>
          </View>

          {/* Nút tác vụ header */}
          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handlePickAnotherImage}
              activeOpacity={0.7}
              accessibilityLabel="Đổi ảnh khác"
            >
              <Ionicons name="image-outline" size={20} color="#111827" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerBtn, { marginLeft: 8 }]}
              onPress={handleReset}
              activeOpacity={0.7}
              accessibilityLabel="Đặt lại vị trí"
            >
              <Ionicons name="refresh-outline" size={20} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Thanh chọn nhanh chế độ ánh sáng (Lighting Mode Selector) */}
        <View style={styles.lightingBar}>
          {LIGHTING_MODES.map(item => {
            const isActive = lightingMode === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.lightingPill,
                  isActive && styles.lightingPillActive,
                ]}
                onPress={() => handleChangeLightingMode(item.key)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={item.icon}
                  size={14}
                  color={isActive ? '#111827' : '#6B7280'}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[
                    styles.lightingText,
                    isActive && styles.lightingTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      {/* Canvas kính lúp & hình ảnh */}
      <View style={styles.canvasContainer}>
        {isLoadingImage && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.loadingText}>Đang đọc ma trận pixel vải...</Text>
          </View>
        )}

        <MagnifierLoupe
          key={resetKey}
          imageUri={activeDisplayUri}
          pickedColorHex={rawHex}
          imageNaturalW={imageNaturalW}
          imageNaturalH={imageNaturalH}
          onPositionChange={handlePositionChange}
        />

        {/* Banner chế độ So sánh 2 món hoặc Gợi ý hướng dẫn */}
        {compareBannerInfo ? (
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

              <View style={styles.compareBannerActions}>
                <TouchableOpacity
                  style={styles.compareCameraBtn}
                  onPress={handleSwitchToCameraCompare}
                  activeOpacity={0.78}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                >
                  <Ionicons name="camera-outline" size={13} color="#FFFFFF" />
                  <Text style={styles.compareActionBtnText}>Camera</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.compareCancelBtn}
                  onPress={handleCancelCompare}
                  activeOpacity={0.78}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
                >
                  <Ionicons name="close" size={13} color="#FFFFFF" />
                  <Text style={styles.compareActionBtnText}>Hủy</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.compareGuideText} numberOfLines={1}>
              {compareBannerInfo.guideText}
            </Text>
          </View>
        ) : (
          !isLoadingImage && (
            <View style={styles.hintPill} pointerEvents="none">
              <Ionicons
                name="scan-outline"
                size={13}
                color="#FFFFFF"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.hintText}>
                Di 1 ngón để soi pixel • Kẹp 2 ngón để phóng to/kéo
              </Text>
            </View>
          )
        )}
      </View>

      {/* Sheet kết quả màu cố định phía dưới */}
      <ColorResultSheet
        color={selectedColor}
        activeHex={activeHex}
        rawHex={rawHex}
        nearbyColors={nearbyColors}
        onSelectShade={handleSelectShade}
        onSelectColor={handleSelectColor}
        onConfirm={handleConfirmMatch}
        primaryButtonLabel={
          compareBannerInfo ? compareBannerInfo.ctaLabel : 'Phối đồ với màu này →'
        }
        secondaryButtonLabel={!compareContext ? 'So với món thứ 2' : undefined}
        onSecondaryPress={!compareContext ? handleStartCompareSecond : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
  },
  headerSafeArea: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
    zIndex: 10,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lightingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 4,
    gap: 8,
  },
  lightingPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  lightingPillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#111827',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  lightingText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  lightingTextActive: {
    color: '#111827',
    fontWeight: '700',
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#0F1115',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 17, 21, 0.85)',
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 12,
  },
  hintPill: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.82)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  hintText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '500',
  },
  compareBanner: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 15,
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
    marginRight: 6,
  },
  compareStepBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  compareSwatchDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    marginRight: 6,
  },
  compareHeldText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  compareBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compareCameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
  },
  compareCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
  },
  compareActionBtnText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
    marginLeft: 3,
  },
  compareGuideText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 5,
  },
});
