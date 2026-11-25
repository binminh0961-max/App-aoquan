// src/components/ShopRecommendationSheet.tsx
/**
 * Bottom Sheet gợi ý mua sắm 2 tầng phong cách Editorial tối giản:
 * - Tầng 1: Danh sách tối đa 3 sản phẩm tuyển chọn khớp món + phom + màu (nút `Xem ↗`).
 * - Tầng 2: Tìm nhanh đúng phom & màu với từ khóa tiếng Việt tự động (luôn có `Tìm trên Shopee ↗`
 *   gắn tracking `an_redir`, chỉ hiện thêm nút `TikTok Shop ↗` khi có `showcaseUrl`).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FASHION_COLORS } from '../constants/fashionColors';
import { hexToHsl, shortColorName } from '../engine/OutfitEngine';
import {
  AffiliatePlacement,
  AffiliateQuery,
  getAffiliateRecommendations,
  getDisplayGarmentLabel,
  openAffiliateUrl,
  syncAffiliateCatalog,
} from '../services/affiliateService';
import { AffiliateProduct } from '../config/affiliateConfig';

export interface ShopRecommendationSheetProps {
  visible: boolean;
  query: AffiliateQuery | null;
  /** Vị trí màn hình mở gợi ý ('bridge' | 'studio' | 'compare') để gắn vào sub_id Shopee Affiliate */
  placement?: AffiliatePlacement;
  /** Mã màu hex hiển thị ở chấm tròn header (tự suy ra từ colorId nếu bỏ trống) */
  colorHex?: string;
  /** Nhãn món/phom tùy chỉnh ở header (VD: "Giày Loafer", "Quần ống suông") */
  itemDisplayLabel?: string;
  onClose: () => void;
}

const SLOT_ICONS: Record<AffiliateQuery['slot'], keyof typeof Ionicons.glyphMap> = {
  top: 'shirt-outline',
  outerwear: 'layers-outline',
  bottom: 'resize-outline',
  shoes: 'footsteps-outline',
};

export const ShopRecommendationSheet: React.FC<ShopRecommendationSheetProps> = ({
  visible,
  query,
  placement,
  colorHex,
  itemDisplayLabel,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Đồng bộ nền remote catalog (cache 24h) nếu chủ app đã cấu hình URL JSON từ xa
  useEffect(() => {
    if (!visible) return;
    let active = true;
    syncAffiliateCatalog().then(() => {
      if (active) {
        setCatalogVersion(v => v + 1);
      }
    });
    return () => {
      active = false;
    };
  }, [visible]);

  const effectiveQuery = useMemo<AffiliateQuery | null>(() => {
    if (!query) return null;
    if (query.placement || !placement) return query;
    return { ...query, placement };
  }, [placement, query]);

  const resolvedHex = useMemo(() => {
    if (colorHex) return colorHex;
    if (!effectiveQuery) return '#111827';
    return FASHION_COLORS.find(c => c.id === effectiveQuery.colorId)?.hex ?? '#111827';
  }, [colorHex, effectiveQuery]);

  const isLightHeaderDot = useMemo(() => hexToHsl(resolvedHex).l > 82, [resolvedHex]);

  const recommendations = useMemo(() => {
    if (!effectiveQuery) return null;
    void catalogVersion;
    return getAffiliateRecommendations(effectiveQuery);
  }, [effectiveQuery, catalogVersion]);

  if (!effectiveQuery || !recommendations) {
    return null;
  }

  const headerGarmentLabel =
    itemDisplayLabel?.trim() ||
    getDisplayGarmentLabel(
      effectiveQuery.slot,
      effectiveQuery.gender,
      effectiveQuery.silhouette
    );
  const headerColorLabel = shortColorName(effectiveQuery.colorName);
  const { curatedProducts, smartSearchLinks, keyword } = recommendations;

  const hasTikTokOption =
    Boolean(smartSearchLinks.tiktok) ||
    curatedProducts.some(p => p.platform === 'tiktok');

  const handleOpenProduct = (product: AffiliateProduct) => {
    void openAffiliateUrl(product.url, {
      platform: product.platform,
      slot: effectiveQuery.slot,
      colorId: effectiveQuery.colorId,
      placement: effectiveQuery.placement,
      source: 'curated_card',
    });
  };

  const handleOpenSmartSearch = (platform: 'shopee' | 'tiktok') => {
    const link = smartSearchLinks[platform];
    if (!link) return;
    void openAffiliateUrl(link.url, {
      platform: link.platform,
      slot: effectiveQuery.slot,
      colorId: effectiveQuery.colorId,
      placement: effectiveQuery.placement,
      source: 'smart_search',
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          {/* Thanh kéo đầu Sheet */}
          <View style={styles.dragHandle} />

          {/* 1. HEADER: Chấm màu vải + Tiêu đề + Nhãn minh bạch + Nút đóng ✕ */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleGroup}>
              <View
                style={[
                  styles.headerColorDot,
                  { backgroundColor: resolvedHex },
                  isLightHeaderDot && styles.lightBorder,
                ]}
              />
              <View style={styles.headerTextCol}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  Tìm mẫu {headerGarmentLabel} • {headerColorLabel}
                </Text>
                <Text style={styles.disclosureText} numberOfLines={1}>
                  {hasTikTokOption
                    ? 'Gợi ý sản phẩm liên kết (Shopee & TikTok Shop)'
                    : 'Gợi ý sản phẩm liên kết (Shopee)'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Đóng gợi ý mua sắm"
            >
              <Ionicons name="close" size={18} color="#111827" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 2. TẦNG 1: SẢN PHẨM TUYỂN CHỌN KHỚP MÀU (TỐI ĐA 3 MÓN) */}
            {curatedProducts.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Gợi ý tuyển chọn khớp màu</Text>
                  <Text style={styles.sectionCount}>{curatedProducts.length} mẫu</Text>
                </View>

                <View style={styles.curatedList}>
                  {curatedProducts.map(product => {
                    const isShopee = product.platform === 'shopee';
                    const isLightDot = hexToHsl(product.colorHex).l > 82;
                    const hasValidImage =
                      Boolean(product.imageUrl) && !failedImages[product.id];

                    return (
                      <TouchableOpacity
                        key={product.id}
                        style={styles.productCard}
                        onPress={() => handleOpenProduct(product)}
                        activeOpacity={0.82}
                      >
                        {hasValidImage && product.imageUrl ? (
                          <Image
                            source={{ uri: product.imageUrl }}
                            style={styles.productThumbImage}
                            resizeMode="cover"
                            onError={() =>
                              setFailedImages(prev => ({
                                ...prev,
                                [product.id]: true,
                              }))
                            }
                          />
                        ) : (
                          <View
                            style={[
                              styles.productThumb,
                              { backgroundColor: product.colorHex },
                              isLightDot && styles.lightBorder,
                            ]}
                          >
                            <Ionicons
                              name={SLOT_ICONS[product.slot]}
                              size={18}
                              color={
                                hexToHsl(product.colorHex).l > 62
                                  ? '#111827'
                                  : '#FFFFFF'
                              }
                            />
                          </View>
                        )}

                        <View style={styles.productInfo}>
                          <Text style={styles.productTitle} numberOfLines={2}>
                            {product.title}
                          </Text>

                          <View style={styles.productMetaRow}>
                            {!!product.priceLabel && (
                              <Text style={styles.productPrice}>
                                {product.priceLabel}
                              </Text>
                            )}
                            <View
                              style={[
                                styles.platformBadge,
                                isShopee
                                  ? styles.platformBadgeShopee
                                  : styles.platformBadgeTikTok,
                              ]}
                            >
                              <Text style={styles.platformBadgeText}>
                                {isShopee ? 'Shopee' : 'TikTok Shop'}
                              </Text>
                            </View>
                            {!!product.tag && (
                              <Text style={styles.productTagText} numberOfLines={1}>
                                • {product.tag}
                              </Text>
                            )}
                          </View>
                        </View>

                        <View style={styles.viewBtn}>
                          <Text style={styles.viewBtnText}>Xem ↗</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 3. TẦNG 2: TÌM NHANH ĐÚNG PHOM & MÀU (LUÔN CÓ SHOPEE `an_redir`) */}
            <View style={styles.smartSearchBox}>
              <Text style={styles.smartSearchTitle}>Tìm nhanh đúng phom & màu</Text>

              <View style={styles.keywordChip}>
                <Ionicons name="search-outline" size={13} color="#4B5563" />
                <Text style={styles.keywordChipText} numberOfLines={2}>
                  Từ khóa: &quot;{keyword}&quot;
                </Text>
              </View>

              <View style={styles.ctaRow}>
                <TouchableOpacity
                  style={styles.shopeeCtaBtn}
                  onPress={() => handleOpenSmartSearch('shopee')}
                  activeOpacity={0.85}
                  accessibilityLabel={`Tìm ${keyword} trên Shopee`}
                >
                  <Ionicons name="bag-handle-outline" size={15} color="#FFFFFF" />
                  <Text style={styles.ctaBtnText} numberOfLines={1}>
                    {smartSearchLinks.shopee.label}
                  </Text>
                </TouchableOpacity>

                {smartSearchLinks.tiktok && (
                  <TouchableOpacity
                    style={styles.tiktokCtaBtn}
                    onPress={() => handleOpenSmartSearch('tiktok')}
                    activeOpacity={0.85}
                    accessibilityLabel="Mở Showcase TikTok Shop"
                  >
                    <Ionicons name="sparkles-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.ctaBtnText} numberOfLines={1}>
                      {smartSearchLinks.tiktok.label}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.42)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: '80%',
    paddingTop: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 16,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  headerColorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.16)',
    marginRight: 10,
    flexShrink: 0,
  },
  lightBorder: {
    borderColor: '#D1D5DB',
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.2,
  },
  disclosureText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scrollBody: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 14,
  },

  // TIER 1: CURATED PRODUCTS
  sectionBlock: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  curatedList: {
    gap: 8,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  productThumb: {
    width: 42,
    height: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.14)',
    marginRight: 10,
    flexShrink: 0,
  },
  productThumbImage: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: '#E5E7EB',
    marginRight: 10,
    flexShrink: 0,
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  productTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 16.5,
  },
  productMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 5,
  },
  productPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  platformBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  platformBadgeShopee: {
    backgroundColor: '#EE4D2D',
  },
  platformBadgeTikTok: {
    backgroundColor: '#111827',
  },
  platformBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  productTagText: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#6B7280',
    flexShrink: 1,
  },
  viewBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    flexShrink: 0,
  },
  viewBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#111827',
    includeFontPadding: false,
  },

  // TIER 2: SMART SEARCH
  smartSearchBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  smartSearchTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  keywordChipText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    lineHeight: 16.5,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  shopeeCtaBtn: {
    flex: 1,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#EE4D2D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  tiktokCtaBtn: {
    flex: 1,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  ctaBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
});

export default ShopRecommendationSheet;
