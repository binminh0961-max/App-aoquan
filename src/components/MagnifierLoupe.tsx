// src/components/MagnifierLoupe.tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, LayoutChangeEvent, Image } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

interface Props {
  imageUri: string; // manipulatedUri từ ImageManipulator
  pickedColorHex: string;
  imageNaturalW: number; // Chiều rộng gốc chuẩn
  imageNaturalH: number; // Chiều cao gốc chuẩn
  onPositionChange: (normX: number, normY: number, isFinal?: boolean) => void;
}

const LOUPE_SIZE = 100;
const R = LOUPE_SIZE / 2; // Bán kính kính lúp = 50px
const EXTRA_ZOOM = 2.5; // Hệ số phóng đại quang học thêm của kính lúp

export const MagnifierLoupe: React.FC<Props> = ({
  imageUri,
  pickedColorHex,
  imageNaturalW,
  imageNaturalH,
  onPositionChange,
}) => {
  const [containerSize, setContainerSize] = useState({ width: 360, height: 480 });

  // 1. Tính toán khung hiển thị thực tế của ảnh (resizeMode="contain", loại bỏ viền letterbox)
  const cWidth = containerSize.width;
  const cHeight = containerSize.height;
  const boxAspect = cWidth > 0 && cHeight > 0 ? cWidth / cHeight : 1;
  const imgAspect =
    imageNaturalW > 0 && imageNaturalH > 0
      ? imageNaturalW / imageNaturalH
      : boxAspect;

  let fittedW = cWidth;
  let fittedH = cHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (imgAspect > boxAspect) {
    fittedH = cWidth / imgAspect;
    offsetY = (cHeight - fittedH) / 2;
  } else {
    fittedW = cHeight * imgAspect;
    offsetX = (cWidth - fittedW) / 2;
  }

  // SharedValues lưu thông số hình học cho Reanimated worklet
  const containerWShared = useSharedValue(cWidth);
  const containerHShared = useSharedValue(cHeight);
  const fittedWShared = useSharedValue(fittedW);
  const fittedHShared = useSharedValue(fittedH);
  const offsetXShared = useSharedValue(offsetX);
  const offsetYShared = useSharedValue(offsetY);

  useEffect(() => {
    containerWShared.value = cWidth;
    containerHShared.value = cHeight;
    fittedWShared.value = fittedW;
    fittedHShared.value = fittedH;
    offsetXShared.value = offsetX;
    offsetYShared.value = offsetY;
  }, [cWidth, cHeight, fittedW, fittedH, offsetX, offsetY]);

  // Tọa độ ngón tay
  const touchX = useSharedValue(cWidth / 2);
  const touchY = useSharedValue(cHeight / 2);
  const isTouching = useSharedValue(false);
  const isInsideShared = useSharedValue(false);

  // Tọa độ chuẩn hóa [0..1] trên ảnh
  const normXShared = useSharedValue(0.5);
  const normYShared = useSharedValue(0.5);

  // Zoom và Pan của ảnh nền
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const savedPanX = useSharedValue(0);
  const savedPanY = useSharedValue(0);

  // Throttle lấy mẫu màu (35ms ~30fps)
  const lastSampleTime = useSharedValue(0);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerSize({ width, height });
    }
  };

  /**
   * Hàm 'worklet' tính toán tọa độ nghịch đảo chuẩn xác:
   * 1. Khử transform của container để về tọa độ chưa zoom.
   * 2. Kiểm tra xem điểm chạm có nằm trong vùng ảnh (loại trừ letterbox).
   * 3. Quy đổi ra tọa độ chuẩn hóa [0..1] trên ảnh gốc.
   */
  const getNormalizedCoordinates = (screenX: number, screenY: number) => {
    'worklet';
    const cW = containerWShared.value || 360;
    const cH = containerHShared.value || 480;
    const fW = fittedWShared.value || cW;
    const fH = fittedHShared.value || cH;
    const oX = offsetXShared.value || 0;
    const oY = offsetYShared.value || 0;

    const curScale = scale.value || 1;
    const curPanX = panX.value || 0;
    const curPanY = panY.value || 0;

    // 1. Khử transform để về tọa độ trên container chưa zoom
    const unscaledX = (screenX - cW / 2 - curPanX) / curScale + cW / 2;
    const unscaledY = (screenY - cH / 2 - curPanY) / curScale + cH / 2;

    // 2. Kiểm tra xem điểm chạm có nằm trong vùng ảnh thực không
    const isInside =
      unscaledX >= oX &&
      unscaledX <= oX + fW &&
      unscaledY >= oY &&
      unscaledY <= oY + fH;

    // 3. Quy đổi ra tọa độ chuẩn hóa [0..1] trên ảnh gốc
    const normX = Math.max(0, Math.min(1, (unscaledX - oX) / fW));
    const normY = Math.max(0, Math.min(1, (unscaledY - oY) / fH));

    return { normX, normY, isInside };
  };

  const handleTouchSample = (screenX: number, screenY: number, isFinal: boolean) => {
    'worklet';
    touchX.value = screenX;
    touchY.value = screenY;

    const { normX, normY, isInside } = getNormalizedCoordinates(screenX, screenY);
    isInsideShared.value = isInside;
    normXShared.value = normX;
    normYShared.value = normY;

    // Chỉ cho phép hút màu khi điểm chạm nằm trong vùng ảnh
    if (isInside) {
      const now = Date.now();
      if (isFinal || now - lastSampleTime.value >= 35) {
        lastSampleTime.value = now;
        runOnJS(onPositionChange)(normX, normY, isFinal);
      }
    }
  };

  // 1. Gesture Pan 1 ngón: Chạm & kéo kính lúp soi màu
  const panGesture = Gesture.Pan()
    .minDistance(0)
    .maxPointers(1)
    .onBegin((e) => {
      isTouching.value = true;
      handleTouchSample(e.x, e.y, false);
    })
    .onUpdate((e) => {
      handleTouchSample(e.x, e.y, false);
    })
    .onFinalize((e) => {
      isTouching.value = false;
      handleTouchSample(e.x, e.y, true);
    });

  // 2. Gesture Pinch 2 ngón: Phóng to thu nhỏ ảnh
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        panX.value = withSpring(0);
        panY.value = withSpring(0);
        savedPanX.value = 0;
        savedPanY.value = 0;
      }
    });

  // 3. Gesture Pan 2 ngón: Kéo di chuyển ảnh khi đã zoom
  const twoFingerPanGesture = Gesture.Pan()
    .minPointers(2)
    .onStart(() => {
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
    })
    .onUpdate((e) => {
      if (scale.value > 1) {
        panX.value = savedPanX.value + e.translationX;
        panY.value = savedPanY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
    });

  const composedGestures = Gesture.Simultaneous(
    panGesture,
    Gesture.Simultaneous(pinchGesture, twoFingerPanGesture)
  );

  // Style transform của Canvas ảnh chính
  const animatedMainCanvasStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: panX.value },
        { translateY: panY.value },
        { scale: scale.value },
      ],
    };
  });

  // Style khung tròn kính lúp:
  // Đặt nổi phía trên 80px, tự động lật xuống dưới nếu touchY < 130 để không tràn mép trên
  const animatedLoupeStyle = useAnimatedStyle(() => {
    const isVisible = isTouching.value && isInsideShared.value;
    const topOffset = touchY.value < 130 ? 80 : -80;

    return {
      opacity: withTiming(isVisible ? 1 : 0, { duration: 100 }),
      transform: [
        { translateX: touchX.value - R },
        { translateY: touchY.value - R + topOffset },
        { scale: withSpring(isVisible ? 1 : 0.6, { damping: 15 }) },
      ],
    };
  });

  // Style ảnh phóng đại bên trong kính lúp:
  // Đặt width = fittedW * totalScale, height = fittedH * totalScale
  // Dịch chuyển translateX/translateY sao cho điểm (normX, normY) nằm chính xác tại tâm (R, R)
  const animatedMagnifiedImageStyle = useAnimatedStyle(() => {
    const curScale = scale.value || 1;
    const totalScale = curScale * EXTRA_ZOOM;

    const magW = fittedWShared.value * totalScale;
    const magH = fittedHShared.value * totalScale;

    const innerLeft = R - normXShared.value * magW;
    const innerTop = R - normYShared.value * magH;

    return {
      width: magW,
      height: magH,
      transform: [
        { translateX: innerLeft },
        { translateY: innerTop },
      ],
    };
  });

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <GestureDetector gesture={composedGestures}>
        <Animated.View style={styles.canvasContainer}>
          {/* Canvas ảnh chính (chứa ảnh có tỉ lệ đúng 100% không letterbox ẩn bên trong thẻ Image) */}
          <Animated.View style={[styles.mainCanvas, animatedMainCanvasStyle]}>
            <Image
              source={{ uri: imageUri }}
              style={{
                position: 'absolute',
                left: offsetX,
                top: offsetY,
                width: fittedW,
                height: fittedH,
              }}
              resizeMode="cover"
            />
          </Animated.View>

          {/* Khung tròn kính lúp */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.loupe,
              { borderColor: pickedColorHex || '#FFFFFF' },
              animatedLoupeStyle,
            ]}
          >
            {/* Viewport tròn overflow: 'hidden' */}
            <View style={styles.loupeViewport}>
              <Animated.Image
                source={{ uri: imageUri }}
                style={[
                  {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                  },
                  animatedMagnifiedImageStyle,
                ]}
                resizeMode="cover"
              />
            </View>

            {/* Dấu thập soi tâm chính xác từng pixel */}
            <View style={styles.crosshairHorizontal} />
            <View style={styles.crosshairVertical} />
            <View
              style={[
                styles.centerPoint,
                { backgroundColor: pickedColorHex || '#FFFFFF' },
              ]}
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#0F1115',
  },
  canvasContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  mainCanvas: {
    width: '100%',
    height: '100%',
  },
  loupe: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: LOUPE_SIZE,
    height: LOUPE_SIZE,
    borderRadius: R,
    borderWidth: 3.5,
    backgroundColor: '#1E1E1E',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  loupeViewport: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  crosshairHorizontal: {
    position: 'absolute',
    width: 24,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 1,
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 3,
  },
  crosshairVertical: {
    position: 'absolute',
    width: 1.5,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 1,
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 3,
  },
  centerPoint: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 2,
    elevation: 3,
  },
});
