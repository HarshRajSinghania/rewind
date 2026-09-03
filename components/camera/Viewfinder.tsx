import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, Linking, type LayoutChangeEvent } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { useSharedValue } from 'react-native-reanimated';
import { useRunOnJS, useSharedValue as useWorkletsSharedValue } from 'react-native-worklets-core';
import { Colors } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { shouldPropagateFaceUpdate } from '@/utils/alignment';
import GridOverlay from '@/components/camera/GridOverlay';
import GhostOverlay from '@/components/camera/GhostOverlay';
import FaceGuide from '@/components/camera/FaceGuide';
import FaceDebugOverlay from '@/components/camera/FaceDebugOverlay';
import type { FaceLandmarks } from '@/types';

export interface FaceState {
  hasFace: boolean;
  faceX: number;
  faceY: number;
  faceWidth: number;
  faceHeight: number;
  yawAngle: number;
  rollAngle: number;
}

interface ViewfinderProps {
  ghostImageUri: string | null;
  ghostLandmarks?: FaceLandmarks | null;
  facing: 'front' | 'back';
  ghostOpacity: number;
  onGhostOpacityChange: (value: number) => void;
  isMirrored: boolean;
  showFaceGuide: boolean;
  onFaceState?: (state: FaceState) => void;
  onAvailabilityChange?: (available: boolean) => void;
  onSilence?: (silent: boolean) => void;
  showDebug?: boolean;
  photoQuality?: 'low' | 'medium' | 'high';
}

export interface ViewfinderRef {
  takePhoto: () => Promise<{ uri: string } | undefined>;
  getCurrentLandmarks: () => FaceLandmarks | null;
}

const Viewfinder = forwardRef<ViewfinderRef, ViewfinderProps>(
  ({ ghostImageUri, ghostLandmarks, facing, ghostOpacity, onGhostOpacityChange, isMirrored, showFaceGuide, onFaceState, onAvailabilityChange, onSilence, showDebug = false, photoQuality = 'medium' }, ref) => {
    const { typography } = useFont();
    const { hasPermission, requestPermission } = useCameraPermission();
    const device = useCameraDevice(facing);
    const cameraRef = useRef<Camera>(null);
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastPropagatedAtRef = useRef(0);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const contourData = useSharedValue<number[]>([]);
    // Worklets-runtime counter for frame skipping (see frameProcessor below).
    // Must use worklets-core's shared value — the frame processor runs on the
    // worklets runtime, not Reanimated's, so Reanimated values aren't writable there.
    const frameTick = useWorkletsSharedValue(0);
    const { detectFaces, getCurrentLandmarks, isAvailable: faceDetectionAvailable, sharedValues } = useFaceDetection();

    useEffect(() => {
      onAvailabilityChange?.(faceDetectionAvailable);
    }, [faceDetectionAvailable, onAvailabilityChange]);

    useEffect(() => {
      return () => {
        if (silenceTimerRef.current !== null) {
          clearTimeout(silenceTimerRef.current);
        }
      };
    }, []);

    // Reset face state when the guide (and frame processor) turns off so the
    // camera screen doesn't act on stale landmarks.
    useEffect(() => {
      if (!showFaceGuide) {
        sharedValues.hasFace.value = false;
        contourData.value = [];
        lastPropagatedAtRef.current = 0;
        onFaceState?.({ hasFace: false, faceX: 0, faceY: 0, faceWidth: 0, faceHeight: 0, yawAngle: 0, rollAngle: 0 });
      }
    }, [showFaceGuide, sharedValues, contourData, onFaceState]);

    // Single bridge call from frame processor worklet → JS thread.
    // VisionCamera (worklets-core) and Reanimated 4 use different worklet runtimes,
    // so shared values written in the frame processor don't propagate to Reanimated's
    // UI thread. useRunOnJS bridges the gap. We use ONE callback to minimize
    // worklet↔JS thread overhead (was 2-3 per frame, now 1).
    //
    // Energy note: shared values (FaceGuide dots) update every frame, but React
    // state propagation is throttled via shouldPropagateFaceUpdate — a camera
    // screen re-render costs far more than a native MLKit pass.
    const previewFlipped = facing === 'front' && isMirrored;
    const onFaceResult = useRunOnJS((data: {
      hasFace: boolean;
      faceX?: number; faceY?: number;
      faceWidth?: number; faceHeight?: number;
      leftEyeX?: number; leftEyeY?: number;
      rightEyeX?: number; rightEyeY?: number;
      noseX?: number; noseY?: number;
      mouthLeftX?: number; mouthLeftY?: number;
      mouthRightX?: number; mouthRightY?: number;
      rollAngle?: number; yawAngle?: number;
      contour?: number[];
    }) => {
      const prevHasFace = sharedValues.hasFace.value;
      const propagate = shouldPropagateFaceUpdate(
        data.hasFace,
        prevHasFace,
        Date.now(),
        lastPropagatedAtRef.current,
      );
      if (propagate) lastPropagatedAtRef.current = Date.now();

      if (!data.hasFace) {
        sharedValues.hasFace.value = false;
        contourData.value = [];
        if (propagate) {
          onFaceState?.({ hasFace: false, faceX: 0, faceY: 0, faceWidth: 0, faceHeight: 0, yawAngle: 0, rollAngle: 0 });
        }
        if (silenceTimerRef.current === null) {
          silenceTimerRef.current = setTimeout(() => {
            onSilence?.(true);
          }, 5000);
        }
        return;
      }

      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      onSilence?.(false);

      if (previewFlipped) {
        data.faceX = 1 - data.faceX! - data.faceWidth!;
        data.leftEyeX = 1 - data.leftEyeX!;
        data.rightEyeX = 1 - data.rightEyeX!;
        data.noseX = 1 - data.noseX!;
        data.mouthLeftX = 1 - data.mouthLeftX!;
        data.mouthRightX = 1 - data.mouthRightX!;
        if (data.contour) {
          for (let i = 0; i < data.contour.length; i += 2) {
            data.contour[i] = 1 - data.contour[i];
          }
        }
      }

      const sv = sharedValues;
      sv.faceX.value = data.faceX!;
      sv.faceY.value = data.faceY!;
      sv.faceWidth.value = data.faceWidth!;
      sv.faceHeight.value = data.faceHeight!;
      sv.leftEyeX.value = data.leftEyeX!;
      sv.leftEyeY.value = data.leftEyeY!;
      sv.rightEyeX.value = data.rightEyeX!;
      sv.rightEyeY.value = data.rightEyeY!;
      sv.noseX.value = data.noseX!;
      sv.noseY.value = data.noseY!;
      sv.mouthLeftX.value = data.mouthLeftX!;
      sv.mouthLeftY.value = data.mouthLeftY!;
      sv.mouthRightX.value = data.mouthRightX!;
      sv.mouthRightY.value = data.mouthRightY!;
      sv.rollAngle.value = data.rollAngle!;
      sv.yawAngle.value = data.yawAngle!;
      sv.hasFace.value = true;

      if (data.contour) contourData.value = data.contour;

      if (propagate) {
        onFaceState?.({
          hasFace: true,
          faceX: data.faceX!,
          faceY: data.faceY!,
          faceWidth: data.faceWidth!,
          faceHeight: data.faceHeight!,
          yawAngle: data.yawAngle!,
          rollAngle: data.rollAngle!,
        });
      }
    }, [sharedValues, previewFlipped, contourData, onFaceState]);

    const frameProcessor = useFrameProcessor(
      (frame) => {
        'worklet';
        // Run detection on every 2nd frame (~15Hz on a 30fps stream). Face
        // alignment changes slowly; full-rate MLKit passes just burn battery.
        frameTick.value += 1;
        if (frameTick.value % 2 !== 0) return;
        try {
          const faces = detectFaces(frame);
          if (!faces || faces.length === 0) {
            onFaceResult({ hasFace: false });
            return;
          }

          let largest = faces[0];
          let largestArea = 0;
          for (const face of faces) {
            const area = (face.bounds?.width ?? 0) * (face.bounds?.height ?? 0);
            if (area > largestArea) {
              largestArea = area;
              largest = face;
            }
          }

          const bounds = largest.bounds;
          if (!bounds) {
            onFaceResult({ hasFace: false });
            return;
          }

          const frameW = frame.width || 1;
          const frameH = frame.height || 1;
          const lm = largest.landmarks;

          const isSensorLandscape = frame.orientation === 'portrait' || frame.orientation === 'portrait-upside-down';
          const normW = isSensorLandscape ? frameH : frameW;
          const normH = isSensorLandscape ? frameW : frameH;

          const result: any = {
            hasFace: true,
            faceX: bounds.x / normW,
            faceY: bounds.y / normH,
            faceWidth: bounds.width / normW,
            faceHeight: bounds.height / normH,
            leftEyeX: lm?.LEFT_EYE ? lm.LEFT_EYE.x / normW : 0,
            leftEyeY: lm?.LEFT_EYE ? lm.LEFT_EYE.y / normH : 0,
            rightEyeX: lm?.RIGHT_EYE ? lm.RIGHT_EYE.x / normW : 0,
            rightEyeY: lm?.RIGHT_EYE ? lm.RIGHT_EYE.y / normH : 0,
            noseX: lm?.NOSE_BASE ? lm.NOSE_BASE.x / normW : 0,
            noseY: lm?.NOSE_BASE ? lm.NOSE_BASE.y / normH : 0,
            mouthLeftX: lm?.MOUTH_LEFT ? lm.MOUTH_LEFT.x / normW : 0,
            mouthLeftY: lm?.MOUTH_LEFT ? lm.MOUTH_LEFT.y / normH : 0,
            mouthRightX: lm?.MOUTH_RIGHT ? lm.MOUTH_RIGHT.x / normW : 0,
            mouthRightY: lm?.MOUTH_RIGHT ? lm.MOUTH_RIGHT.y / normH : 0,
            rollAngle: largest.rollAngle ?? 0,
            yawAngle: largest.yawAngle ?? 0,
          };

          // Pass face contour points as flat [x1,y1,x2,y2,...] array
          const faceContour = (largest as any).contours?.FACE;
          if (faceContour && faceContour.length > 0) {
            const flat: number[] = [];
            for (const p of faceContour) {
              flat.push(p.x / normW, p.y / normH);
            }
            result.contour = flat;
          }

          onFaceResult(result);
        } catch (e: any) {
          console.log('[FrameProcessor] error:', e?.message || e);
        }
      },
      [detectFaces, onFaceResult, frameTick],
    );

    useImperativeHandle(ref, () => ({
      takePhoto: async () => {
        if (!cameraRef.current) return undefined;
        const photo = await cameraRef.current.takePhoto();
        return { uri: `file://${photo.path}` };
      },
      getCurrentLandmarks,
    }));

    if (!hasPermission) {
      return (
        <View style={[styles.container, styles.permissionContainer]}>
          <Text style={[typography.small, styles.permissionText]}>
            Camera access is required to take photos.
          </Text>
          <Text
            style={[typography.small, styles.permissionLink]}
            onPress={async () => {
              const granted = await requestPermission();
              if (!granted) {
                Linking.openSettings();
              }
            }}
          >
            Open Settings to enable camera access
          </Text>
        </View>
      );
    }

    if (!device) {
      return (
        <View style={[styles.container, styles.permissionContainer]}>
          <Text style={[typography.small, styles.permissionText]}>
            No camera available.
          </Text>
        </View>
      );
    }

    const qualityBalanceMap: Record<'low' | 'medium' | 'high', 'speed' | 'balanced' | 'quality'> = {
      low: 'speed',
      medium: 'balanced',
      high: 'quality',
    };

    const onLayout = (e: LayoutChangeEvent) => {
      const { width: w, height: h } = e.nativeEvent.layout;
      setContainerSize({ width: w, height: h });
    };

    // The MLKit frame processor only runs while the face guide is visible.
    // When the guide is off this is a plain preview: no native detection work,
    // no worklet↔JS bridge traffic, no re-renders.
    const facePipelineActive = faceDetectionAvailable && showFaceGuide;
    return (
      <View style={styles.container} onLayout={onLayout}>
        <Camera
          ref={cameraRef}
          style={[StyleSheet.absoluteFill, { transform: [{ scaleX: previewFlipped ? -1 : 1 }] }]}
          device={device}
          isActive={true}
          photo={true}
          video={facePipelineActive}
          frameProcessor={facePipelineActive ? frameProcessor : undefined}
          photoQualityBalance={qualityBalanceMap[photoQuality]}
        />
        {ghostImageUri ? (
          <GhostOverlay
            imageUri={ghostImageUri}
            opacity={ghostOpacity}
            onOpacityChange={onGhostOpacityChange}
            ghostLandmarks={faceDetectionAvailable ? ghostLandmarks : null}
            currentIsMirrored={isMirrored}
            liveValues={sharedValues}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
          />
        ) : null}
        <GridOverlay />
        {showFaceGuide ? (
          <FaceGuide
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            contourData={contourData}
          />
        ) : null}
        {showDebug ? (
          <FaceDebugOverlay
            sharedValues={sharedValues}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
          />
        ) : null}
      </View>
    );
  }
);

Viewfinder.displayName = 'Viewfinder';

export default Viewfinder;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: Colors.bgSurface,
    overflow: 'hidden',
  },
  permissionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  permissionText: {
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  permissionLink: {
    color: Colors.accent,
    textAlign: 'center',
  },
});
