// src/screens/ImagePickerScreen.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { RootStackParamList } from '../../App';

type ImagePickerRouteProp = RouteProp<RootStackParamList, 'ImagePicker'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ImagePicker'>;

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

  const handleConfirmMatch = () => {
    Alert.alert(
      '👗 Sẵn sàng phối đồ',
      `Bạn đã chọn màu:\n• Tên chuẩn: ${selectedColor.name}\n• Mã HEX: ${activeHex.toUpperCase()}\n• Mã hút thật: ${rawHex.toUpperCase()}\n• Chế độ sáng: ${
        lightingMode === 'warm_light'
          ? 'Đèn vàng'
          : lightingMode === 'outdoor'
          ? 'Ngoài trời'
          : 'Tự động'
      }\n\nHệ thống sẽ chuyển qua module gợi ý bảng phối màu tương phản và liền kề!`,
      [{ text: 'Bắt đầu phối đồ', onPress: () => navigation.goBack() }]
    );
  };

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

        {/* Gợi ý hướng dẫn */}
        {!isLoadingImage && (
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
});
