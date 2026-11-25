// src/components/RewardedUnlockModal.tsx
/**
 * Modal mở khóa thêm +3 ô Tủ đồ bằng quảng cáo có thưởng (Rewarded Ad).
 * Dùng chung cho InteractiveMixStudio, MatchCheckerScreen và LookbookScreen.
 *
 * Luồng Nhịp 5A:
 * - Bấm "Xem quảng cáo (+3 ô)" -> gọi `requestRewardedAd('unlock_wardrobe_slots', ...)`.
 * - Hiện đếm ngược mô phỏng 2 giây kèm nút "Hủy sớm" để test đủ 2 nhánh:
 *   1. Xem hết 2 giây -> gọi `grantWardrobeBonusSlots(+3)` -> gọi `onUnlocked(updatedState)`.
 *   2. Bấm "Hủy sớm" -> không cộng ô, báo nhẹ để người dùng thử lại hoặc chọn "Để sau".
 * - Khi lên Nhịp 5B (IS_REAL_ADMOB_ENABLED = true), `requestRewardedAd` sẽ tự phát SDK AdMob thật.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
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
  const [earlyCancelNotice, setEarlyCancelNotice] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const activeSessionRef = useRef<MockRewardedAdSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Dọn dẹp sạch khi Modal đóng hoặc unmount
  useEffect(() => {
    if (!visible) {
      clearTimer();
      if (activeSessionRef.current) {
        activeSessionRef.current.cancel();
        activeSessionRef.current = null;
      }
      setWatchingSecondsLeft(null);
      setEarlyCancelNotice(false);
      setIsBusy(false);
    }
    return () => {
      clearTimer();
    };
  }, [visible]);

  const isWatching = watchingSecondsLeft !== null;

  const handleStartRewardedAd = async () => {
    if (isBusy || isWatching) return;
    setIsBusy(true);
    setEarlyCancelNotice(false);

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
            setWatchingSecondsLeft(null);
            session.complete();
          } else {
            setWatchingSecondsLeft(remaining);
          }
        }, 1000);
      });

      if (result.rewarded) {
        const nextState = await grantWardrobeBonusSlots(REWARDED_BONUS_SLOTS);
        setIsBusy(false);
        onUnlocked(nextState);
      } else {
        setWatchingSecondsLeft(null);
        setEarlyCancelNotice(true);
        setIsBusy(false);
      }
    } catch {
      clearTimer();
      activeSessionRef.current = null;
      setWatchingSecondsLeft(null);
      setIsBusy(false);
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
      setEarlyCancelNotice(true);
      setIsBusy(false);
    }
  };

  const handleDismiss = () => {
    if (isWatching) {
      handleCancelEarly();
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
          {!isWatching ? (
            <>
              <View style={styles.iconCircle}>
                <Ionicons name="sparkles-outline" size={24} color="#111827" />
              </View>

              <Text style={styles.title}>{titleText}</Text>

              <Text style={styles.description}>
                Xem 1 video quảng cáo ngắn để mở khóa thêm +{REWARDED_BONUS_SLOTS} ô Tủ đồ vĩnh viễn.
              </Text>

              {earlyCancelNotice && (
                <View style={styles.cancelNoticeBox}>
                  <Ionicons name="information-circle-outline" size={14} color="#B45309" />
                  <Text style={styles.cancelNoticeText}>
                    Bạn đã đóng quảng cáo sớm nên chưa nhận thêm ô. Hãy xem hết để nhận +{REWARDED_BONUS_SLOTS} ô nhé!
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleStartRewardedAd}
                disabled={isBusy}
                activeOpacity={0.86}
              >
                <Ionicons name="play-circle-outline" size={19} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>
                  Xem quảng cáo (+{REWARDED_BONUS_SLOTS} ô)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={onClose}
                activeOpacity={0.78}
              >
                <Text style={styles.secondaryBtnText}>Để sau</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.simAdWrap}>
              <View style={styles.simAdBadgeRow}>
                <View style={styles.simAdBadge}>
                  <Text style={styles.simAdBadgeText}>QUẢNG CÁO MÔ PHỎNG • NHỊP 5A</Text>
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
  cancelNoticeBox: {
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
  cancelNoticeText: {
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
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },

  // SIMULATED AD VIEW
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
