import React from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { FashionColor } from '../constants/fashionColors';

interface Props {
  color: FashionColor;
  rawHex?: string;
}

export const CameraReticle: React.FC<Props> = ({ color, rawHex }) => {
  const reticleColor = rawHex || color.hex;
  return (
    <View style={styles.container} pointerEvents="none">
      {/* Reticle circle: tô màu viền bằng rawHex để đối chiếu trực tiếp với vật thể */}
      <View style={[styles.outerReticle, { borderColor: reticleColor }]}>
        {/* Floating badge positioned absolutely above the outer reticle (không đẩy lệch tâm vòng ngắm) */}
        <View style={styles.badgeWrapper}>
          <View style={styles.badge}>
            <View style={[styles.badgeIndicator, { backgroundColor: color.hex }]} />
            <Text style={styles.badgeText}>{color.name}</Text>
          </View>
        </View>

        {/* Ô vuông ngắm nhỏ cố định ở chính giữa (12x12 dp với chấm tâm mảnh) */}
        <View style={styles.targetSquare}>
          <View style={styles.innerDot} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerReticle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  badgeWrapper: {
    position: 'absolute',
    bottom: 56,
    alignItems: 'center',
    minWidth: 160,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  badgeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  badgeText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  targetSquare: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 2,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  innerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.6)',
  },
});
