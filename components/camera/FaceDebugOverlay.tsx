import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

interface FaceDebugOverlayProps {
  containerWidth: number;
  containerHeight: number;
  sharedValues: {
    faceX: SharedValue<number>;
    faceY: SharedValue<number>;
    faceWidth: SharedValue<number>;
    faceHeight: SharedValue<number>;
    leftEyeX: SharedValue<number>;
    leftEyeY: SharedValue<number>;
    rightEyeX: SharedValue<number>;
    rightEyeY: SharedValue<number>;
    noseX: SharedValue<number>;
    noseY: SharedValue<number>;
    mouthLeftX: SharedValue<number>;
    mouthLeftY: SharedValue<number>;
    mouthRightX: SharedValue<number>;
    mouthRightY: SharedValue<number>;
    rollAngle: SharedValue<number>;
    yawAngle: SharedValue<number>;
    hasFace: SharedValue<boolean>;
  };
}

const DOT_SIZE = 10;

function useDotStyle(
  normX: SharedValue<number>,
  normY: SharedValue<number>,
  hasFace: SharedValue<boolean>,
  screenW: number,
  screenH: number,
) {
  return useAnimatedStyle(() => {
    'worklet';
    if (!hasFace.value) {
      return { opacity: 0 };
    }
    return {
      opacity: 1,
      left: normX.value * screenW - DOT_SIZE / 2,
      top: normY.value * screenH - DOT_SIZE / 2,
    };
  });
}

function useBoxStyle(
  fX: SharedValue<number>,
  fY: SharedValue<number>,
  fW: SharedValue<number>,
  fH: SharedValue<number>,
  hasFace: SharedValue<boolean>,
  screenW: number,
  screenH: number,
) {
  return useAnimatedStyle(() => {
    'worklet';
    if (!hasFace.value) {
      return { opacity: 0 };
    }
    return {
      opacity: 1,
      left: fX.value * screenW,
      top: fY.value * screenH,
      width: fW.value * screenW,
      height: fH.value * screenH,
    };
  });
}

export default function FaceDebugOverlay({ sharedValues, containerWidth, containerHeight }: FaceDebugOverlayProps) {
  const width = containerWidth || 1;
  const height = containerHeight || 1;
  const sv = sharedValues;

  const boxStyle = useBoxStyle(sv.faceX, sv.faceY, sv.faceWidth, sv.faceHeight, sv.hasFace, width, height);
  const leftEyeStyle = useDotStyle(sv.leftEyeX, sv.leftEyeY, sv.hasFace, width, height);
  const rightEyeStyle = useDotStyle(sv.rightEyeX, sv.rightEyeY, sv.hasFace, width, height);
  const noseStyle = useDotStyle(sv.noseX, sv.noseY, sv.hasFace, width, height);
  const mouthLeftStyle = useDotStyle(sv.mouthLeftX, sv.mouthLeftY, sv.hasFace, width, height);
  const mouthRightStyle = useDotStyle(sv.mouthRightX, sv.mouthRightY, sv.hasFace, width, height);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.box, boxStyle]} />
      <Animated.View style={[styles.dot, styles.eyeDot, leftEyeStyle]} />
      <Animated.View style={[styles.dot, styles.eyeDot, rightEyeStyle]} />
      <Animated.View style={[styles.dot, styles.noseDot, noseStyle]} />
      <Animated.View style={[styles.dot, styles.mouthDot, mouthLeftStyle]} />
      <Animated.View style={[styles.dot, styles.mouthDot, mouthRightStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: Colors.accent,
    borderStyle: 'solid',
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  eyeDot: {
    backgroundColor: Colors.accent,
  },
  noseDot: {
    backgroundColor: Colors.streak,
  },
  mouthDot: {
    backgroundColor: Colors.danger,
  },
});
