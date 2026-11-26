// src/components/AdBannerSlot.tsx
/**
 * Vị trí dành riêng cho AdMob Adaptive Banner ở đáy màn hình LookbookScreen.
 * Tách biệt hoàn toàn khỏi vùng nút tương tác để tuân thủ chính sách AdMob.
 * - Khi IS_REAL_ADMOB_ENABLED === true (Nhịp 5B): render `<BannerAd />` thật với
 *   `getBannerAdUnitId()` (tự động dùng `TestIds.ADAPTIVE_BANNER` khi `__DEV__` hoặc chưa điền ID thật).
 * - Bọc ErrorBoundary + xử lý `onAdFailedToLoad` an toàn: khi mất mạng hoặc chưa link native,
 *   tự ẩn gọn (`null`) và tuyệt đối không làm crash UI.
 */

import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import {
  getBannerAdUnitId,
  IS_REAL_ADMOB_ENABLED,
  isNativeAdsSupported,
} from '../services/monetizationService';

export interface AdBannerSlotProps {
  /** Có chèn thêm paddingBottom theo safe-area đáy màn hình hay không (mặc định true) */
  respectBottomInset?: boolean;
}

interface BannerErrorBoundaryState {
  hasError: boolean;
}

class BannerErrorBoundary extends React.Component<
  { children: React.ReactNode },
  BannerErrorBoundaryState
> {
  state: BannerErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): BannerErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // Im lặng bỏ qua nếu native view chưa link (VD: chạy thử Expo Go / Web)
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export const AdBannerSlot: React.FC<AdBannerSlotProps> = ({
  respectBottomInset = true,
}) => {
  const insets = useSafeAreaInsets();
  const bottomPad = respectBottomInset ? Math.max(insets.bottom, 0) : 0;
  const [adLoaded, setAdLoaded] = useState<boolean>(false);
  const [adFailed, setAdFailed] = useState<boolean>(false);

  const unitId = useMemo(() => {
    try {
      return getBannerAdUnitId();
    } catch {
      return '';
    }
  }, []);

  if (!IS_REAL_ADMOB_ENABLED) {
    if (!__DEV__) {
      return null;
    }

    return (
      <View style={[styles.devWrapper, { paddingBottom: bottomPad }]}>
        <View style={styles.devBannerBox}>
          <Ionicons name="megaphone-outline" size={13} color="#6B7280" />
          <Text style={styles.devBannerText} numberOfLines={1}>
            Vị trí AdMob Adaptive Banner (Nhịp 5B)
          </Text>
        </View>
      </View>
    );
  }

  // Trên Web hoặc khi mất mạng / không tải được banner -> ẩn sạch không chiếm diện tích thừa
  if (!isNativeAdsSupported() || Platform.OS === 'web' || !unitId || adFailed) {
    return null;
  }

  return (
    <BannerErrorBoundary>
      <View
        style={[
          styles.realWrapper,
          adLoaded ? styles.realWrapperVisible : styles.realWrapperHidden,
          { paddingBottom: adLoaded ? bottomPad : 0 },
        ]}
      >
        <BannerAd
          unitId={unitId}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
          onAdLoaded={() => {
            setAdFailed(false);
            setAdLoaded(true);
          }}
          onAdFailedToLoad={() => {
            setAdLoaded(false);
            setAdFailed(true);
          }}
        />
      </View>
    </BannerErrorBoundary>
  );
};

const styles = StyleSheet.create({
  devWrapper: {
    width: '100%',
    backgroundColor: '#EAEAE6',
    borderTopWidth: 1,
    borderTopColor: '#D1D5DB',
  },
  devBannerBox: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 6,
  },
  devBannerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.1,
  },
  realWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  realWrapperVisible: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 4,
  },
  realWrapperHidden: {
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
});

export default AdBannerSlot;
