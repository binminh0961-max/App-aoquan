// src/components/RewardedUnlockModal.tsx
/**
 * Modal mở khóa thêm +3 ô Tủ đồ bằng quảng cáo có thưởng (Rewarded Ad thật từ AdMob ở Nhịp 5B).
 * Dùng chung cho InteractiveMixStudio, MatchCheckerScreen và LookbookScreen.
 *
 * Chống treo UI & mất mạng:
 * - Hiển thị trạng thái đang tải (ActivityIndicator) trong lúc gọi `requestRewardedAd`.
 * - Nếu xem xong nhận thưởng -> gọi `grantWardrobeBonusSlots(+3)` -> gọi `onUnlocked`.
 * - Nếu đóng sớm hoặc mất mạng / không tải được quảng cáo -> hiện thông báo gọn và mở khóa lại nút bấm.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  grantWardrobeBonusSlots,
  MockRewardedAdSession,
  MonetizationState,
  REWARDED_BONUS_SLOTS,
  requestRewardedAd,
} from '../services/monetizationService';

export interface RewardedUnlockModalProps {
  visible: boolean;
  savedCount: number;
  maxWardrobeSlots: number;
  /** 'full_gate' khi người dùng bấm Lưu lúc Tủ đồ đã đầy; 'expand' khi chủ động bấm "+3 ô" ở Lookbook */
  mode?: 'full_gate' | 'expand';
  onClose: () => void;
  onUnlocked: (nextState: MonetizationState) => void;
}

export const RewardedUnlockModal: React.FC<RewardedUnlockModalProps> = ({
  visible,
  savedCount,
  maxWardrobeSlots,
  mode = 'full_gate',
  onClose,
  onUnlocked,
}) => {
  const [watchingSecondsLeft, setWatchingSecondsLeft] = useState<number | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const activeSessionRef = useRef<MockRewardedAdSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef<boolean>(true);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, []);

  // Dọn dẹp sạch khi Modal đóng
  useEffect(() => {
    if (!visible) {
      clearTimer();
      if (activeSessionRef.current) {
        activeSessionRef.current.cancel();
        activeSessionRef.current = null;
      }
      setWatchingSecondsLeft(null);
      setNoticeMessage(null);
      setIsBusy(false);
    }
  }, [visible]);

  const isWatchingMock = watchingSecondsLeft !== null;

  const handleStartRewardedAd = async () => {
    if (isBusy || isWatchingMock) return;
    setIsBusy(true);
    setNoticeMessage(null);

    try {
      const result = await requestRewardedAd('unlock_wardrobe_slots', session => {
        activeSessionRef.current = session;
        let remaining = session.durationSeconds;
        setWatchingSecondsLeft(remaining);

        clearTimer();
        timerRef.current = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearTimer();
            activeSessionRef.current = null;
            if (mountedRef.current) {
              setWatchingSecondsLeft(null);
            }
            session.complete();
          } else if (mountedRef.current) {
            setWatchingSecondsLeft(remaining);
          }
        }, 1000);
      });

      if (!mountedRef.current) return;

      if (result.rewarded) {
        const nextState = await grantWardrobeBonusSlots(REWARDED_BONUS_SLOTS);
        if (!mountedRef.current) return;
        setIsBusy(false);
        onUnlocked(nextState);
      } else {
        setWatchingSecondsLeft(null);
        setIsBusy(false);
        if (result.errorMessage) {
          setNoticeMessage(result.errorMessage);
        } else {
          setNoticeMessage(
            `Bạn đã đóng quảng cáo sớm nên chưa nhận thêm ô. Hãy xem hết video để nhận +${REWARDED_BONUS_SLOTS} ô nhé!`
          );
        }
      }
    } catch {
      clearTimer();
      activeSessionRef.current = null;
      if (mountedRef.current) {
        setWatchingSecondsLeft(null);
        setIsBusy(false);
        setNoticeMessage(
          'Không tải được quảng cáo lúc này. Vui lòng kiểm tra kết nối mạng và thử lại.'
        );
      }
    }
  };

  const handleCancelEarly = () => {
    clearTimer();
    if (activeSessionRef.current) {
      const session = activeSessionRef.current;
      activeSessionRef.current = null;
      session.cancel();
    } else {
      setWatchingSecondsLeft(null);
      setNoticeMessage(
        `Bạn đã đóng quảng cáo sớm nên chưa nhận thêm ô. Hãy xem hết để nhận +${REWARDED_BONUS_SLOTS} ô nhé!`
      );
      setIsBusy(false);
    }
  };

  const handleDismiss = () => {
    if (isWatchingMock) {
      handleCancelEarly();
      return;
    }
    if (isBusy) {
      return;
    }
    onClose();
  };

  const isFull = savedCount >= maxWardrobeSlots || mode === 'full_gate';
  const titleText = isFull
    ? `Tủ đồ đã đầy (${savedCount}/${maxWardrobeSlots} bộ)`
    : `Mở rộng Tủ đồ (${savedCount}/${maxWardrobeSlots} bộ)`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />

        <View style={styles.card}>
          {!isWatchingMock ? (
            <>
              <View style={styles.iconCircle}>
                <Ionicons name="sparkles-outline" size={24} color="#111827" />
              </View>

              <Text style={styles.title}>{titleText}</Text>

              <Text style={styles.description}>
                Xem 1 video quảng cáo ngắn để mở khóa thêm +{REWARDED_BONUS_SLOTS} ô Tủ đồ vĩnh viễn.
              </Text>

              {!!noticeMessage && (
                <View style={styles.noticeBox}>
                  <Ionicons
                    name="information-circle-outline"
                    size={15}
                    color="#B45309"
                    style={{ marginTop: 1 }}
                  />
                  <Text style={styles.noticeText}>{noticeMessage}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, isBusy && styles.primaryBtnLoading]}
                onPress={handleStartRewardedAd}
                disabled={isBusy}
                activeOpacity={0.86}
              >
                {isBusy ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.primaryBtnText}>
                      Đang tải quảng cáo...
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name="play-circle-outline"
                      size={19}
                      color="#FFFFFF"
                    />
                    <Text style={styles.primaryBtnText}>
                      Xem quảng cáo (+{REWARDED_BONUS_SLOTS} ô)
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, isBusy && styles.secondaryBtnDisabled]}
                onPress={onClose}
                disabled={isBusy}
                activeOpacity={0.78}
              >
                <Text style={styles.secondaryBtnText}>Để sau</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.simAdWrap}>
              <View style={styles.simAdBadgeRow}>
                <View style={styles.simAdBadge}>
                  <Text style={styles.simAdBadgeText}>QUẢNG CÁO MÔ PHỎNG</Text>
                </View>
                <View style={styles.countdownPill}>
                  <Text style={styles.countdownText}>{watchingSecondsLeft}s</Text>
                </View>
              </View>

              <View style={styles.simAdStage}>
                <Ionicons name="videocam-outline" size={32} color="#FFFFFF" />
                <Text style={styles.simAdHeading}>
                  Đang mở khóa +{REWARDED_BONUS_SLOTS} ô Tủ đồ...
                </Text>
                <Text style={styles.simAdSub}>
                  Tự động nhận thưởng sau {watchingSecondsLeft} giây
                </Text>
              </View>

              <TouchableOpacity
                style={styles.cancelEarlyBtn}
                onPress={handleCancelEarly}
                activeOpacity={0.8}
              >
                <Ionicons name="close-circle-outline" size={16} color="#B91C1C" />
                <Text style={styles.cancelEarlyText}>Hủy sớm (không nhận thưởng)</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 356,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 16,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 14,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 14,
    width: '100%',
    gap: 6,
  },
  noticeText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
    color: '#92400E',
  },
  primaryBtn: {
    width: '100%',
    height: 46,
    borderRadius: 14,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 8,
  },
  primaryBtnLoading: {
    backgroundColor: '#374151',
  },
  primaryBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryBtn: {
    width: '100%',
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnDisabled: {
    opacity: 0.45,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },

  // SIMULATED AD VIEW (FALLBACK)
  simAdWrap: {
    width: '100%',
    gap: 12,
  },
  simAdBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  simAdBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  simAdBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 0.4,
  },
  countdownPill: {
    minWidth: 34,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countdownText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  simAdStage: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 26,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  simAdHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 4,
  },
  simAdSub: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#D1D5DB',
    textAlign: 'center',
  },
  cancelEarlyBtn: {
    width: '100%',
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cancelEarlyText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#B91C1C',
  },
});

export default RewardedUnlockModal;
