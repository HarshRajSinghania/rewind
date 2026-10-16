import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageManipulator, FlipType } from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { usePhotos } from '@/hooks/usePhotos';
import { useGreeting } from '@/hooks/useGreeting';
import { useAppContext } from '@/context/AppContext';
import { getToday, formatDateLabel } from '@/utils/dates';
import { haptics } from '@/utils/haptics';
import Viewfinder, { type FaceState } from '@/components/camera/Viewfinder';
import CameraControls from '@/components/camera/CameraControls';
import TimerSelector from '@/components/camera/TimerSelector';
import CapturePreview from '@/components/camera/CapturePreview';
import type { ViewfinderRef } from '@/components/camera/Viewfinder';
import { useAutoCapture } from '@/hooks/useAutoCapture';
import { computeAlignmentScore, alignmentStatus } from '@/utils/alignment';
import { previewMirroring } from '@/utils/cameraPreview';
import { placeGhost } from '@/utils/ghost';
import type { Size } from '@/utils/faceAlign';
import { useFaceScanBackfill } from '@/hooks/useFaceScanBackfill';
import { UserFocus, CaretLeft } from 'phosphor-react-native';
import type { PhotoEntry, FaceLandmarks } from '@/types';

/** Room the top row and shutter row need under the viewfinder. */
const CONTROLS_MIN_HEIGHT = 200;

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // Photos are 4:3 (the whole sensor), so the viewfinder is too: it shows exactly what gets
  // saved, instead of a cropped slice stretched to fill a taller box.
  const viewfinderWidth = Math.min(
    windowWidth,
    ((windowHeight - insets.top - insets.bottom - CONTROLS_MIN_HEIGHT) * 3) / 4,
  );
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const { albums, settings } = useAppContext();
  const { photos: albumPhotos, mostRecentPhoto, todayPhoto, addPhoto } = usePhotos(albumId);
  const { dayNumber } = useGreeting();
  const albumName = albums.find(a => a.id === albumId)?.name ?? albumId;

  useEffect(() => {
    if (!albumId) router.replace('/');
  }, [albumId, router]);

  const { fonts, typography } = useFont();
  const cameraRef = useRef<ViewfinderRef>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCapturingRef = useRef(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [faceDetectionAvailable, setFaceDetectionAvailable] = useState(true);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [isMirrored, setIsMirrored] = useState(settings.mirrorSelfies);
  const [ghostOpacity, setGhostOpacity] = useState(0.3);
  const [showTimer, setShowTimer] = useState(false);
  const [timerDuration, setTimerDuration] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [capturedUri, setCapturedUri] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showFaceGuide, setShowFaceGuide] = useState(false);
  const [capturedLandmarks, setCapturedLandmarks] = useState<FaceLandmarks | null>(null);
  const [faceState, setFaceState] = useState<FaceState>({ hasFace: false, faceX: 0, faceY: 0, faceWidth: 0, faceHeight: 0, yawAngle: 0, rollAngle: 0 });
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [faceSilence, setFaceSilence] = useState(false);
  const [viewfinderSize, setViewfinderSize] = useState<Size | null>(null);

  // Reference target: captured from live video so we can bootstrap
  // auto-capture even when no photo has faceLandmarks yet.
  const [referenceTarget, setReferenceTarget] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [referenceJustSet, setReferenceJustSet] = useState(false);

  // The ghost needs the last photo's face scan: a fresh capture, or an album never played
  // aligned, hasn't got one yet. One photo, scanned in the background and saved.
  const ghostScanQueue = useMemo(() => (mostRecentPhoto ? [mostRecentPhoto] : []), [mostRecentPhoto]);
  useFaceScanBackfill(ghostScanQueue, true);

  const albumScans = useMemo(() => albumPhotos.map((p) => p.faceScan), [albumPhotos]);
  const ghostPlacement = useMemo(
    () => (viewfinderSize ? placeGhost(mostRecentPhoto?.faceScan, albumScans, viewfinderSize) : null),
    [viewfinderSize, mostRecentPhoto?.faceScan, albumScans],
  );
  // Show the ghost the way the preview is mirrored. Only captures record their mirroring;
  // imported photos are drawn as they are.
  const { shownMirrored } = previewMirroring(facing, isMirrored);
  const ghostLandmarks = mostRecentPhoto?.faceLandmarks;
  const ghostFlip = !!ghostLandmarks
    && (mostRecentPhoto!.cameraDirection === 'front' && ghostLandmarks.isMirrored) !== shownMirrored;

  const handleViewfinderLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewfinderSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);

  const today = getToday();
  const dateLabel = `${formatDateLabel(today)} — day ${dayNumber}`;

  const doCapture = useCallback(async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    setIsCapturing(true);
    try {
      const landmarks = cameraRef.current?.getCurrentLandmarks() ?? null;
      const photo = await cameraRef.current?.takePhoto();
      if (photo?.uri) {
        let uri = photo.uri;
        if (facing === 'front' && !isMirrored) {
          try {
            const imageRef = await ImageManipulator.manipulate(uri)
              .flip(FlipType.Horizontal)
              .renderAsync();
            const saved = await imageRef.saveAsync();
            uri = saved.uri;
          } catch (e) {
            console.warn('Image flip failed, using original:', e);
          }
        }
        setCapturedUri(uri);
        setCapturedLandmarks(landmarks ? { ...landmarks, isMirrored } : null);
        setShowPreview(true);
      }
    } catch (e) {
      haptics.error();
      Alert.alert('Capture Failed', 'Could not take photo. Please try again.');
    } finally {
      isCapturingRef.current = false;
      setIsCapturing(false);
    }
  }, [facing, isMirrored]);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const cancelCountdown = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCountdown(null);
    haptics.tap();
  }, []);

  const handleCapture = useCallback(async () => {
    if (intervalRef.current !== null) {
      cancelCountdown();
      return;
    }
    if (timerDuration > 0) {
      setCountdown(timerDuration);
      let remaining = timerDuration;
      intervalRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setCountdown(null);
          doCapture().catch(() => {});
        } else {
          setCountdown(remaining);
        }
      }, 1000);
    } else {
      await doCapture();
    }
  }, [cancelCountdown, timerDuration, doCapture]);

  const handleFlip = () => {
    setFacing(prev => prev === 'front' ? 'back' : 'front');
    setIsMirrored(settings.mirrorSelfies);
    setReferenceTarget(null);
  };
  const handleMirrorToggle = () => {
    setIsMirrored(prev => !prev);
    setReferenceTarget(null);
  };
  const handleTimerToggle = () => setShowTimer(prev => !prev);
  const handleFaceGuideToggle = () => {
    if (!faceDetectionAvailable) return;
    setFaceSilence(false);
    setShowFaceGuide(prev => !prev);
  };
  const handleAvailabilityChange = useCallback((available: boolean) => {
    setFaceDetectionAvailable(available);
    if (!available) setShowFaceGuide(false);
  }, []);

  const handleFaceState = useCallback((state: FaceState) => {
    setFaceState(state);
  }, []);

  const handleDebugToggle = useCallback(() => {
    setShowDebugOverlay(prev => !prev);
    haptics.tap();
  }, []);

  const handleSilence = useCallback((silent: boolean) => {
    setFaceSilence(silent);
  }, []);

  // Auto-capture alignment target priority:
  // 1. Reference target (user manually set via long-press)
  // 2. The ghost's eyes (the last photo, eye-anchored like timelapse playback)
  // 3. Most recent photo's face landmarks (no face scan available)
  // 4. Default center position (for bootstrapping)
  const alignmentTarget = referenceTarget ?? ghostPlacement?.eyes ?? mostRecentPhoto?.faceLandmarks?.faceBounds ?? null;
  const hasAlignmentTarget = alignmentTarget !== null;

  const alignmentScore = computeAlignmentScore(faceState, alignmentTarget);

  // Lower threshold when bootstrapping (no target yet) so first capture is easier
  const alignmentThreshold = hasAlignmentTarget ? 0.75 : 0.65;

  // Note: face-state ticks arrive throttled at ~10Hz (see Viewfinder), so
  // requiredFrames doubles as a hold duration: 15 ≈ 1.5s, 10 ≈ 1s.
  const { progress: autoCaptureProgress, isInCooldown: autoCaptureCooldown } = useAutoCapture({
    enabled: showFaceGuide && faceState.hasFace,
    alignmentScore,
    alignmentThreshold,
    requiredFrames: hasAlignmentTarget ? 15 : 10,
    cooldownMs: 3000,
    onCapture: doCapture,
  });

  // Long-press shutter to capture current face position as a reference target
  // (doesn't take a photo — just remembers where your face is for alignment)
  const handleCaptureReference = useCallback(() => {
    if (!faceState.hasFace) {
      haptics.error();
      return;
    }
    setReferenceTarget({
      x: faceState.faceX,
      y: faceState.faceY,
      width: faceState.faceWidth,
      height: faceState.faceHeight,
    });
    haptics.success();
    setReferenceJustSet(true);
    setTimeout(() => setReferenceJustSet(false), 1800);
  }, [faceState]);

  const handleGhostOpacity = useCallback((value: number) => {
    setGhostOpacity(value);
  }, []);

  const handleSave = (caption: string, savedUri: string) => {
    const doSave = () => {
      const newPhoto: PhotoEntry = {
        id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        albumId: albumId,
        date: today,
        imageUri: savedUri,
        caption,
        capturedAt: new Date().toISOString(),
        cameraDirection: facing,
        ...(capturedLandmarks ? { faceLandmarks: capturedLandmarks } : {}),
      };
      addPhoto(newPhoto);
      setShowPreview(false);
      setCapturedUri('');
      router.replace({ pathname: '/album/[id]', params: { id: albumId } });
    };

    if (todayPhoto) {
      Alert.alert(
        'Replace Photo',
        "You've already captured today. Replace it with this one?",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: doSave },
        ],
      );
    } else {
      doSave();
    }
  };

  const handleRetake = () => {
    setShowPreview(false);
    setCapturedUri('');
    setCapturedLandmarks(null);
  };

  const guideOn = showFaceGuide && faceDetectionAvailable;
  const status = guideOn
    ? alignmentStatus({ silent: faceSilence, face: faceState, score: alignmentScore, threshold: alignmentThreshold, target: alignmentTarget })
    : null;
  const hint = referenceJustSet
    ? 'reference set'
    : guideOn && !hasAlignmentTarget
    ? 'hold shutter to set reference'
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View
        style={[styles.viewfinderSlot, { width: viewfinderWidth, height: (viewfinderWidth * 4) / 3 }]}
        onLayout={handleViewfinderLayout}
      >
        <Viewfinder
          ref={cameraRef}
          ghostImageUri={mostRecentPhoto?.imageUri ?? null}
          ghostPlacement={ghostPlacement}
          ghostFlip={ghostFlip}
          facing={facing}
          ghostOpacity={ghostOpacity}
          onGhostOpacityChange={handleGhostOpacity}
          isMirrored={isMirrored}
          showFaceGuide={showFaceGuide}
          onFaceState={handleFaceState}
          onAvailabilityChange={handleAvailabilityChange}
          onSilence={handleSilence}
          showDebug={showDebugOverlay}
          photoQuality={settings.photoQuality}
        />
        {status || hint ? (
          // Over the viewfinder rather than below it, so the preview keeps the space.
          <View style={styles.statusPill} pointerEvents="none" accessibilityLiveRegion="polite">
            {status ? (
              <Text style={[styles.statusText, { fontFamily: fonts.regular }]}>{status}</Text>
            ) : null}
            {hint ? (
              <Text style={[styles.hintText, { fontFamily: fonts.regular }, referenceJustSet && styles.hintConfirm]}>
                {hint}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.topRow}>
          <Pressable
            onPress={() => { haptics.tap(); canGoBack ? router.back() : router.replace('/'); }}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            hitSlop={12}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <CaretLeft size={20} color={Colors.textPrimary} weight="regular" />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={[styles.albumLabel, { fontFamily: fonts.regular }]} numberOfLines={1}>{albumName}</Text>
            <Text style={[typography.sectionLabel, styles.dateLabel]} numberOfLines={1}>{dateLabel}</Text>
          </View>
          <Pressable
            onPress={handleFaceGuideToggle}
            onLongPress={handleDebugToggle}
            style={({ pressed }) => [styles.backBtn, pressed && faceDetectionAvailable && { opacity: 0.7 }, !faceDetectionAvailable && { opacity: 0.4 }]}
            hitSlop={12}
            accessibilityLabel={!faceDetectionAvailable ? 'Face guide unavailable' : showFaceGuide ? 'Hide face guide' : 'Show face guide'}
            accessibilityRole="button"
            disabled={!faceDetectionAvailable}
          >
            <UserFocus
              size={20}
              color={showFaceGuide && faceDetectionAvailable ? Colors.accent : Colors.textSecondary}
              weight="light"
            />
          </Pressable>
        </View>
        {countdown !== null ? (
          <Pressable
            onPress={cancelCountdown}
            accessibilityRole="button"
            accessibilityLabel={`Timer: ${countdown} seconds. Tap to cancel.`}
            hitSlop={12}
          >
            <Text style={[typography.bigNumber, styles.countdown]}>
              {countdown}
            </Text>
            <Text style={[styles.cancelHint, { fontFamily: fonts.regular }]}>
              tap to cancel
            </Text>
          </Pressable>
        ) : null}

        <CameraControls
          onCapture={handleCapture}
          onCaptureReference={handleCaptureReference}
          onFlip={handleFlip}
          onTimerToggle={handleTimerToggle}
          onMirrorToggle={handleMirrorToggle}
          isMirrored={isMirrored}
          isFrontCamera={facing === 'front'}
          autoCaptureProgress={autoCaptureProgress}
          isInCooldown={autoCaptureCooldown}
          hasAlignmentTarget={hasAlignmentTarget}
          isCapturing={isCapturing}
          timerDuration={timerDuration}
        />

        {showTimer && (
          <TimerSelector
            selectedDuration={timerDuration}
            onSelect={setTimerDuration}
            visible={showTimer}
          />
        )}
      </View>

      <CapturePreview
        visible={showPreview}
        imageUri={capturedUri}
        onSave={handleSave}
        onRetake={handleRetake}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPage,
  },
  viewfinderSlot: {
    alignSelf: 'center',
  },
  statusPill: {
    position: 'absolute',
    top: Spacing.md,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.bgPageTranslucent,
  },
  statusText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 11,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  hintText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 10,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  hintConfirm: {
    color: Colors.accent,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: Spacing.sm,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumLabel: {
    fontFamily: Fonts.mono.regular,
    fontSize: 13,
    color: Colors.accent,
    textAlign: 'center',
    letterSpacing: 2,
    textTransform: 'lowercase',
  },
  dateLabel: {
    color: Colors.textTertiary,
    textAlign: 'center',
    letterSpacing: 1,
  },
  countdown: {
    color: Colors.streak,
    textAlign: 'center',
  },
  cancelHint: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: 4,
  },
});
