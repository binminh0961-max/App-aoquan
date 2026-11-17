import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FashionColor } from '../constants/fashionColors';

interface Props {
  color: FashionColor;
  onPressNextColor?: () => void;
}

export const LivePreviewCard: React.FC<Props> = ({ color, onPressNextColor }) => {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPressNextColor}
      activeOpacity={0.85}
      accessibilityLabel="Xem trước màu sắc trực tiếp"
    >
      <View style={[styles.colorCircle, { backgroundColor: color.hex }]}>
        <View style={styles.circleGloss} />
      </View>

      <View style={styles.textContainer}>
        <View style={styles.titleRow}>
          <Text style={styles.colorName} numberOfLines={1}>
            {color.name}
          </Text>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>TRỰC TIẾP</Text>
          </View>
        </View>
        <Text style={styles.hexCode}>{color.hex.toUpperCase()}</Text>
      </View>

      <TouchableOpacity
        style={styles.cycleBtn}
        onPress={onPressNextColor}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="shuffle-outline" size={18} color="#6B7280" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  colorCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  circleGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginRight: 6,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.3,
  },
  hexCode: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  cycleBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
});
