import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { CameraReticle } from '../components/CameraReticle';
import { LivePreviewCard } from '../components/LivePreviewCard';
import { getRandomColor, getNextColor } from '../utils/mockColor';
import { FashionColor, SAMPLE_FABRIC_IMAGES } from '../constants/fashionColors';
import { RootStackParamList } from '../../App';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'CameraPicker'>;

const LIGHT_ENVIRONMENTS = ['Tự động', 'Đèn vàng', 'Ngoài trời'] as const;
type LightEnv = (typeof LIGHT_ENVIRONMENTS)[number];

export const CameraPickerScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [lightEnv, setLightEnv] = useState<LightEnv>('Tự động');
  const [currentColor, setCurrentColor] = useState<FashionColor>(getRandomColor());
  const [isFrozen, setIsFrozen] = useState(false);
  const [selectedShade, setSelectedShade] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Interval mock color cycling when not frozen
  useEffect(() => {
    if (isFrozen) return;
    const interval = setInterval(() => {
      setCurrentColor(getRandomColor());
    }, 2500);
    return () => clearInterval(interval);
  }, [isFrozen]);

  const toggleTorch = () => {
    setTorchOn(prev => !prev);
  };

  const cycleLightEnv = () => {
    const currentIndex = LIGHT_ENVIRONMENTS.indexOf(lightEnv);
    const nextIndex = (currentIndex + 1) % LIGHT_ENVIRONMENTS.length;
    setLightEnv(LIGHT_ENVIRONMENTS[nextIndex]);
  };

  const handleNextMockColor = () => {
    setCurrentColor(prev => getNextColor(prev.id));
  };

  const handleShutter = () => {
    setIsFrozen(true);
    setSelectedShade(currentColor.hex);
  };

  const handleRetake = () => {
    setIsFrozen(false);
    setSelectedShade(null);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  };

  const handleWardrobe = () => {
    showToast('Tính năng Tủ đồ sẽ mở ở giai đoạn 2');
  };

  const openImagePicker = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        navigation.navigate('ImagePicker', { imageUri: result.assets[0].uri });
      }
    } catch {
      // Fallback to sample fabric image if permission or library has issue
      navigation.navigate('ImagePicker', { imageUri: SAMPLE_FABRIC_IMAGES[0] });
    }
  };

  const handleConfirmMatch = () => {
    const finalHex = selectedShade || currentColor.hex;
    Alert.alert(
      '🎉 Đã chốt mã màu',
      `Màu thời trang: ${currentColor.name}\nMã HEX: ${finalHex.toUpperCase()}\n\nChuyển sang module Gợi ý Phối đồ ở bước kế tiếp!`,
      [{ text: 'Hoàn tất', onPress: () => setIsFrozen(false) }]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Camera Preview or Dark Fallback */}
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.cameraPlaceholder]}>
          <Ionicons name="camera-outline" size={48} color="#4B5563" />
          <Text style={styles.permissionText}>
            {permission ? 'Chưa cấp quyền truy cập Camera' : 'Đang kiểm tra quyền Camera...'}
          </Text>
          {permission && !permission.granted && (
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Cấp quyền Camera</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Dark overlay when frozen */}
      {isFrozen && <View style={styles.frozenBackdrop} />}

      {/* Floating Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          {/* Flash Toggle */}
          <TouchableOpacity
            style={[styles.headerPillBtn, torchOn && styles.headerPillBtnActive]}
            onPress={toggleTorch}
            activeOpacity={0.8}
            accessibilityLabel="Bật tắt đèn flash"
          >
            <Ionicons
              name={torchOn ? 'flash' : 'flash-off-outline'}
              size={18}
              color={torchOn ? '#111827' : '#FFFFFF'}
            />
          </TouchableOpacity>

          {/* Environment Lighting Pill */}
          <TouchableOpacity
            style={styles.envPill}
            onPress={cycleLightEnv}
            activeOpacity={0.8}
          >
            <Ionicons name="sunny-outline" size={14} color="#FBBF24" style={styles.envIcon} />
            <Text style={styles.envText}>{lightEnv}</Text>
            <Ionicons name="chevron-down" size={12} color="#6B7280" />
          </TouchableOpacity>

          {/* Test color cycle button */}
          <TouchableOpacity
            style={styles.headerPillBtn}
            onPress={handleNextMockColor}
            activeOpacity={0.8}
          >
            <Ionicons name="color-wand-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Center Reticle (hidden when frozen) */}
      {!isFrozen && <CameraReticle color={currentColor} />}

      {/* Floating Retake Button in Frozen Mode */}
      {isFrozen && (
        <View style={[styles.retakeHeader, { top: insets.top + 60 }]}>
          <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake} activeOpacity={0.8}>
            <Ionicons name="refresh-outline" size={18} color="#111827" />
            <Text style={styles.retakeText}>Chụp lại</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Thumb Zone - Bottom Area (1/3 of screen) */}
      <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* Live Preview Card */}
        <LivePreviewCard
          color={currentColor}
          onPressNextColor={handleNextMockColor}
        />

        {/* Regular Shutter Dock OR Frozen Confirmation Card */}
        {!isFrozen ? (
          <View style={styles.bottomDock}>
            {/* Gallery Button */}
            <TouchableOpacity
              style={styles.dockIconBtn}
              onPress={openImagePicker}
              activeOpacity={0.75}
              accessibilityLabel="Mở thư viện ảnh"
            >
              <View style={styles.iconCircle}>
                <Ionicons name="images-outline" size={24} color="#111827" />
              </View>
              <Text style={styles.dockLabel}>Thư viện</Text>
            </TouchableOpacity>

            {/* Shutter Button (Chốt màu) */}
            <TouchableOpacity
              style={styles.shutterOuter}
              onPress={handleShutter}
              activeOpacity={0.85}
              accessibilityLabel="Chốt mã màu"
            >
              <View style={[styles.shutterInner, { backgroundColor: currentColor.hex }]}>
                <View style={styles.shutterCenterDot} />
              </View>
            </TouchableOpacity>

            {/* Wardrobe Button (Tủ đồ) */}
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
          /* Frozen Confirmation Card */
          <View style={styles.frozenCard}>
            <View style={styles.frozenRow}>
              <View style={[styles.frozenColorSwatch, { backgroundColor: selectedShade || currentColor.hex }]} />
              <View style={styles.frozenTextCol}>
                <Text style={styles.frozenColorTitle}>{currentColor.name}</Text>
                <Text style={styles.frozenHex}>{(selectedShade || currentColor.hex).toUpperCase()}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryActionButton}
              onPress={handleConfirmMatch}
              activeOpacity={0.88}
            >
              <Text style={styles.primaryActionText}>Phối đồ với màu này →</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Lightweight Toast Notification */}
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
  cameraPlaceholder: {
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  permissionBtn: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  permissionBtnText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  frozenBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
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
  retakeHeader: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  retakeText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
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
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  dockIconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
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
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  frozenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  frozenColorSwatch: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  frozenTextCol: {
    marginLeft: 12,
    flex: 1,
  },
  frozenColorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  frozenHex: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 2,
  },
  primaryActionButton: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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
