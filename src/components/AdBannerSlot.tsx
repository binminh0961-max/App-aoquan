// src/components/AdBannerSlot.tsx
/**
 * Vị trí dành riêng cho AdMob Adaptive Banner ở đáy màn hình LookbookScreen.
 * Tách biệt hoàn toàn khỏi vùng nút tương tác để tuân thủ chính sách AdMob.
 * - Khi IS_REAL_ADMOB_ENABLED === false:
 *   - Trong __DEV__: hiển thị khung mỏng cao 52px để kiểm tra căn chỉnh layout.
 *   - Trong bản build Production: trả về null (không chiếm diện tích thừa).
 * - Ở Nhịp 5B: chỉ cần gắn <BannerAd /> vào nhánh IS_REAL_ADMOB_ENABLED === true.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { IS_REAL_ADMOB_ENABLED } from '../services/monetizationService';

export interface AdBannerSlotProps {
  /** Có chèn thêm paddingBottom theo safe-area đáy màn hình hay không (mặc định true) */
  respectBottomInset?: boolean;
}

export const AdBannerSlot: React.FC<AdBannerSlotProps> = ({
  respectBottomInset = true,
}) => {
  const insets = useSafeAreaInsets();
  const bottomPad = respectBottomInset ? Math.max(insets.bottom, 0) : 0;

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

  // [NHỊP 5B]: Render <BannerAd size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} ... /> tại đây
  return (
    <View style={[styles.realWrapper, { paddingBottom: bottomPad }]}>
      <View style={styles.realBannerInner} />
    </View>
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
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'center',
  },
  realBannerInner: {
    minHeight: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AdBannerSlot;
