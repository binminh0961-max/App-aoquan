import React from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { FashionColor } from '../constants/fashionColors';

interface Props {
  color: FashionColor;
}

export const CameraReticle: React.FC<Props> = ({ color }) => {
  return (
    <View style={styles.container} pointerEvents="none">
      {/* Floating badge above the reticle */}
      <View style={styles.badgeWrapper}>
        <View style={styles.badge}>
          <View style={[styles.badgeIndicator, { backgroundColor: color.hex }]} />
          <Text style={styles.badgeText}>{color.name}</Text>
        </View>
      </View>

      {/* Reticle circle */}
      <View style={[styles.outerReticle, { borderColor: color.hex }]}>
        <View style={styles.innerDot} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrapper: {
    marginBottom: 12,
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
  outerReticle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 4,
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
  innerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.4)',
  },
});
