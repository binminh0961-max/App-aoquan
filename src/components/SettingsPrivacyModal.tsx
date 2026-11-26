// src/components/SettingsPrivacyModal.tsx
/**
 * Modal Cài đặt & Chính sách bảo mật (phục vụ duyệt Google Play):
 * - Giải thích minh bạch Camera & ảnh vải chỉ xử lý màu cục bộ trên thiết bị, không tải ảnh lên máy chủ.
 * - Cho phép đổi nhanh Giới tính mặc định (Nam / Nữ) và Tông da mặc định (Trung tính / Ấm / Lạnh).
 * - Cung cấp nút mở trang Chính sách bảo mật (Privacy Policy).
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
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
import { SilhouetteStyleType, SkinUndertone } from '../types/outfit';
import {
  getCachedUserGender,
  getCachedUserUndertone,
  loadUserPreferences,
  saveUserGender,
  saveUserUndertone,
  UserPreferences,
} from '../services/userPreferences';

/**
 * URL trang Chính sách bảo mật công khai (trùng khớp với Google Play Console).
 */
export const PRIVACY_POLICY_URL =
    'https://binminh0961-max.github.io/privacy.html';

const APP_VERSION_LABEL = 'v1.0.0';

const UNDERTONE_OPTIONS: {
  id: SkinUndertone;
  label: string;
  dotHex: string;
}[] = [
  { id: 'neutral', label: 'Trung tính', dotHex: '#D6B196' },
  { id: 'warm', label: 'Da ấm', dotHex: '#D9A773' },
  { id: 'cool', label: 'Da lạnh', dotHex: '#E0B9C1' },
];

export interface SettingsPrivacyModalProps {
  visible: boolean;
  onClose: () => void;
  onPreferencesChanged?: (prefs: UserPreferences) => void;
}

export const SettingsPrivacyModal: React.FC<SettingsPrivacyModalProps> = ({
                                                                            visible,
                                                                            onClose,
                                                                            onPreferencesChanged,
                                                                          }) => {
  const insets = useSafeAreaInsets();
  const [gender, setGender] = useState<SilhouetteStyleType>(() =>
      getCachedUserGender()
  );
  const [undertone, setUndertone] = useState<SkinUndertone>(() =>
      getCachedUserUndertone()
  );

  useEffect(() => {
    if (!visible) return;
    let active = true;
    loadUserPreferences().then(prefs => {
      if (!active) return;
      setGender(prefs.gender);
      setUndertone(prefs.undertone);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  const handleSelectGender = async (nextGender: SilhouetteStyleType) => {
    setGender(nextGender);
    await saveUserGender(nextGender);
    onPreferencesChanged?.({ gender: nextGender, undertone });
  };

  const handleSelectUndertone = async (nextUndertone: SkinUndertone) => {
    setUndertone(nextUndertone);
    await saveUserUndertone(nextUndertone);
    onPreferencesChanged?.({ gender, undertone: nextUndertone });
  };

  const handleOpenPrivacyPolicy = async () => {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      Alert.alert(
          'Không thể mở liên kết',
          `Bạn có thể xem Chính sách bảo mật tại:\n${PRIVACY_POLICY_URL}`
      );
    }
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
            <View style={styles.dragHandle} />

            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerTextCol}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  Cài đặt & Bảo mật
                </Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  Tùy chọn mặc định & Minh bạch quyền riêng tư
                </Text>
              </View>

              <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  activeOpacity={0.75}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Đóng cài đặt"
              >
                <Ionicons name="close" size={18} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollBody}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
              {/* 1. TÙY CHỌN MẶC ĐỊNH */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Tùy chọn phối đồ mặc định</Text>

                {/* Giới tính mặc định */}
                <View style={styles.prefBlock}>
                  <Text style={styles.prefLabel}>Phom dáng giới tính mặc định</Text>
                  <View style={styles.segmentRow}>
                    <TouchableOpacity
                        style={[
                          styles.segmentOption,
                          gender === 'male' && styles.segmentOptionActive,
                        ]}
                        onPress={() => void handleSelectGender('male')}
                        activeOpacity={0.82}
                    >
                      <Ionicons
                          name="male-outline"
                          size={15}
                          color={gender === 'male' ? '#FFFFFF' : '#374151'}
                      />
                      <Text
                          style={[
                            styles.segmentOptionText,
                            gender === 'male' && styles.segmentOptionTextActive,
                          ]}
                      >
                        Nam
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                          styles.segmentOption,
                          gender === 'female' && styles.segmentOptionActive,
                        ]}
                        onPress={() => void handleSelectGender('female')}
                        activeOpacity={0.82}
                    >
                      <Ionicons
                          name="female-outline"
                          size={15}
                          color={gender === 'female' ? '#FFFFFF' : '#374151'}
                      />
                      <Text
                          style={[
                            styles.segmentOptionText,
                            gender === 'female' && styles.segmentOptionTextActive,
                          ]}
                      >
                        Nữ
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Tông da mặc định */}
                <View style={styles.prefBlock}>
                  <Text style={styles.prefLabel}>Tông da mặc định (Skin Undertone)</Text>
                  <View style={styles.undertoneRow}>
                    {UNDERTONE_OPTIONS.map(opt => {
                      const isSelected = undertone === opt.id;
                      return (
                          <TouchableOpacity
                              key={opt.id}
                              style={[
                                styles.undertonePill,
                                isSelected && styles.undertonePillActive,
                              ]}
                              onPress={() => void handleSelectUndertone(opt.id)}
                              activeOpacity={0.82}
                          >
                            <View
                                style={[
                                  styles.undertoneDot,
                                  { backgroundColor: opt.dotHex },
                                ]}
                            />
                            <Text
                                style={[
                                  styles.undertonePillText,
                                  isSelected && styles.undertonePillTextActive,
                                ]}
                                numberOfLines={1}
                            >
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* 2. MINH BẠCH QUYỀN CAMERA & BẢO MẬT (CHUẨN DUYỆT GOOGLE PLAY) */}
              <View style={styles.privacyCard}>
                <View style={styles.privacyHeaderRow}>
                  <View style={styles.privacyIconBox}>
                    <Ionicons name="shield-checkmark-outline" size={16} color="#15803D" />
                  </View>
                  <Text style={styles.privacyTitle}>Cam kết Quyền riêng tư & Camera</Text>
                </View>

                <View style={styles.privacyBulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.privacyBodyText}>
                    <Text style={styles.privacyStrong}>Xử lý màu cục bộ 100%: </Text>
                    Camera và ảnh bạn chọn chỉ được đọc mã màu trực tiếp ngay trên điện thoại. Ứng dụng <Text style={styles.privacyStrong}>không tải ảnh lên máy chủ</Text> và không thu thập hình ảnh cá nhân.
                  </Text>
                </View>

                <View style={styles.privacyBulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.privacyBodyText}>
                    <Text style={styles.privacyStrong}>Dữ liệu Tủ đồ nội bộ: </Text>
                    Các bộ đồ đã lưu và tùy chọn cá nhân chỉ lưu trong bộ nhớ máy của bạn, không yêu cầu đăng nhập tài khoản.
                  </Text>
                </View>

                <View style={styles.privacyBulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.privacyBodyText}>
                    <Text style={styles.privacyStrong}>Quảng cáo & Liên kết: </Text>
                    Ứng dụng hiển thị quảng cáo Google AdMob (chế độ không cá nhân hóa mặc định) và gợi ý sản phẩm liên kết để duy trì miễn phí.
                  </Text>
                </View>
              </View>

              {/* 3. NÚT MỞ CHÍNH SÁCH BẢO MẬT */}
              <TouchableOpacity
                  style={styles.policyLinkBtn}
                  onPress={() => void handleOpenPrivacyPolicy()}
                  activeOpacity={0.82}
                  accessibilityLabel="Mở trang Chính sách bảo mật"
              >
                <View style={styles.policyLinkLeft}>
                  <Ionicons name="document-text-outline" size={18} color="#111827" />
                  <View style={styles.policyTextCol}>
                    <Text style={styles.policyLinkTitle}>
                      Chính sách bảo mật (Privacy Policy)
                    </Text>
                    <Text style={styles.policyLinkSub} numberOfLines={1}>
                      Xem chi tiết điều khoản dữ liệu & quyền thiết bị
                    </Text>
                  </View>
                </View>
                <Ionicons name="open-outline" size={16} color="#4B5563" />
              </TouchableOpacity>

              <Text style={styles.footerVersion}>
                Máy hút mã màu & Phối đồ 3D • {APP_VERSION_LABEL}
              </Text>
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
    backgroundColor: 'rgba(17, 24, 39, 0.48)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: '84%',
    paddingTop: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
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
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 12,
  },

  // PREFERENCES CARD
  sectionCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  prefBlock: {
    gap: 7,
  },
  prefLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentOption: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentOptionActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  segmentOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  segmentOptionTextActive: {
    color: '#FFFFFF',
  },
  undertoneRow: {
    flexDirection: 'row',
    gap: 7,
  },
  undertonePill: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 5,
  },
  undertonePillActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  undertoneDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.2)',
  },
  undertonePillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#374151',
    flexShrink: 1,
  },
  undertonePillTextActive: {
    color: '#FFFFFF',
  },

  // PRIVACY CARD
  privacyCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 8,
  },
  privacyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  privacyIconBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#14532D',
    flex: 1,
  },
  privacyBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#15803D',
    marginTop: 6,
    flexShrink: 0,
  },
  privacyBodyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17.5,
    fontWeight: '500',
    color: '#166534',
  },
  privacyStrong: {
    fontWeight: '800',
    color: '#14532D',
  },

  // POLICY LINK BUTTON
  policyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  policyLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 10,
    marginRight: 8,
  },
  policyTextCol: {
    flex: 1,
    minWidth: 0,
  },
  policyLinkTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  policyLinkSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 1,
  },
  footerVersion: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 4,
  },
});

export default SettingsPrivacyModal;