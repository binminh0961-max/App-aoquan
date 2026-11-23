// src/components/ColorResultSheet.tsx
import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FashionColor } from '../constants/fashionColors';

interface Props {
  color: FashionColor;
  activeHex?: string;
  rawHex?: string;
  nearbyColors?: FashionColor[];
  onSelectShade?: (hex: string) => void;
  onSelectColor?: (color: FashionColor) => void;
  onConfirm: () => void;
  primaryButtonLabel?: string;
  secondaryButtonLabel?: string;
  secondaryButtonIcon?: keyof typeof Ionicons.glyphMap;
  onSecondaryPress?: () => void;
}

export const ColorResultSheet: React.FC<Props> = ({
  color,
  activeHex,
  rawHex,
  nearbyColors = [],
  onSelectShade,
  onSelectColor,
  onConfirm,
  primaryButtonLabel = 'Phối đồ với màu này →',
  secondaryButtonLabel,
  secondaryButtonIcon = 'git-compare-outline',
  onSecondaryPress,
}) => {
  const currentHex = activeHex || color.hex;

  // Danh sách các màu gợi ý lân cận: màu chuẩn hiện tại + top 3 màu lân cận từ ColorEngine
  const displayShades: { id: string; name: string; hex: string; fullColor?: FashionColor }[] = [
    { id: color.id, name: color.name, hex: color.hex, fullColor: color },
    ...nearbyColors.map(c => ({
      id: c.id,
      name: c.name,
      hex: c.hex,
      fullColor: c,
    })),
  ].slice(0, 4);

  // Nếu không có nearbyColors, fallback sang nearbyHexes của chính màu đó
  if (displayShades.length <= 1 && color.nearbyHexes) {
    color.nearbyHexes.slice(0, 3).forEach((hex, idx) => {
      displayShades.push({
        id: `${color.id}-shade-${idx}`,
        name: `${color.name} (Sắc độ ${idx + 1})`,
        hex,
      });
    });
  }

  const handlePickShade = (item: (typeof displayShades)[0]) => {
    if (item.fullColor && onSelectColor) {
      onSelectColor(item.fullColor);
    }
    if (onSelectShade) {
      onSelectShade(item.hex);
    }
  };

  return (
    <View style={styles.sheetContainer}>
      <View style={styles.grabber} />

      {/* Main Color Info Row */}
      <View style={styles.mainRow}>
        {/* Swatch màu đôi (Split Swatch): Bên trái là Màu thực hút từ sợi vải, Bên phải là Màu chuẩn thời trang */}
        <View style={styles.colorSwatchWrapper}>
          {rawHex && rawHex !== currentHex ? (
            <View style={styles.splitSwatch}>
              <View style={[styles.splitHalf, { backgroundColor: rawHex }]} />
              <View style={[styles.splitHalf, { backgroundColor: currentHex }]} />
            </View>
          ) : (
            <View style={[styles.solidSwatch, { backgroundColor: currentHex }]} />
          )}
          <View style={styles.colorGloss} />
        </View>

        <View style={styles.colorDetails}>
          <Text style={styles.colorTitle} numberOfLines={1}>
            {color.name}
          </Text>
          <View style={styles.hexBadgeRow}>
            <Text style={styles.hexValue}>{currentHex.toUpperCase()}</Text>
            {rawHex && (
              <View style={styles.rawBadge}>
                <Text style={styles.rawText}>Hút: {rawHex.toUpperCase()}</Text>
              </View>
            )}
          </View>
          <Text style={styles.subtext}>
            Đã lọc nhiễu vải & quy chiếu CIEDE2000
          </Text>
        </View>
      </View>

      {/* Nearby Shades / Colors Selector */}
      <View style={styles.shadesSection}>
        <View style={styles.shadesHeader}>
          <Text style={styles.shadesTitle}>Màu chuẩn lân cận</Text>
          <Text style={styles.shadesHint}>Chạm để tinh chỉnh</Text>
        </View>

        <View style={styles.shadesRow}>
          {displayShades.map((shade, idx) => {
            const isSelected = shade.hex.toLowerCase() === currentHex.toLowerCase();
            return (
              <TouchableOpacity
                key={shade.id || idx}
                onPress={() => handlePickShade(shade)}
                style={[
                  styles.shadeCircleWrapper,
                  isSelected && styles.shadeCircleSelected,
                ]}
                activeOpacity={0.7}
              >
                <View style={[styles.shadeCircle, { backgroundColor: shade.hex }]}>
                  {isSelected && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={
                        shade.hex.toLowerCase() === '#ffffff' ||
                        shade.hex.toLowerCase() === '#fff9e6' ||
                        shade.hex.toLowerCase() === '#fef08a'
                          ? '#111827'
                          : '#FFFFFF'
                      }
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Main Action Button */}
      <TouchableOpacity
        style={styles.confirmButton}
        onPress={onConfirm}
        activeOpacity={0.88}
      >
        <Text style={styles.confirmButtonText}>{primaryButtonLabel}</Text>
      </TouchableOpacity>

      {/* Secondary Action Button (e.g. So với món thứ 2) */}
      {secondaryButtonLabel && onSecondaryPress && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onSecondaryPress}
          activeOpacity={0.82}
        >
          <Ionicons
            name={secondaryButtonIcon}
            size={17}
            color="#111827"
            style={styles.secondaryButtonIcon}
          />
          <Text style={styles.secondaryButtonText}>{secondaryButtonLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 16,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  colorSwatchWrapper: {
    width: 58,
    height: 58,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  solidSwatch: {
    width: '100%',
    height: '100%',
  },
  splitSwatch: {
    flexDirection: 'row',
    width: '100%',
    height: '100%',
  },
  splitHalf: {
    flex: 1,
    height: '100%',
  },
  colorGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  colorDetails: {
    marginLeft: 14,
    flex: 1,
  },
  colorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  hexBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  hexValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    fontVariant: ['tabular-nums'],
  },
  rawBadge: {
    marginLeft: 8,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rawText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#6B7280',
    fontVariant: ['tabular-nums'],
  },
  subtext: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 3,
  },
  shadesSection: {
    marginBottom: 18,
  },
  shadesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  shadesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  shadesHint: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  shadesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shadeCircleWrapper: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  shadeCircleSelected: {
    borderColor: '#111827',
  },
  shadeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  confirmButton: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#111827',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#111827',
  },
  secondaryButtonIcon: {
    marginRight: 7,
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
});
