import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageManipulator, FlipType } from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Colors, Fonts } from '@/constants/theme';
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
import { computeAlignmentScore } from '@/utils/alignment';
import { UserFocus, CaretLeft } from 'phosphor-react-native';
import type { PhotoEntry, FaceLandmarks } from '@/types';

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const { albums, settings } = useAppContext();
  const { mostRecentPhoto, todayPhoto, addPhoto } = usePhotos(albumId);
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

  // Reference target: captured from live video so we can bootstrap
  // auto-capture even when no photo has faceLandmarks yet.
  const [referenceTarget, setReferenceTarget] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [referenceJustSet, setReferenceJustSet] = useState(false);

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
  // 2. Most recent photo's face landmarks
  // 3. Default center position (for bootstrapping)
  const alignmentTarget = referenceTarget ?? mostRecentPhoto?.faceLandmarks?.faceBounds ?? null;
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Viewfinder
        ref={cameraRef}
        ghostImageUri={mostRecentPhoto?.imageUri ?? null}
        ghostLandmarks={mostRecentPhoto?.faceLandmarks ?? null}
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
          <Text style={[styles.albumLabel, { fontFamily: fonts.regular }]}>{albumName}</Text>
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
        <Text style={[typography.sectionLabel, styles.dateLabel]}>{dateLabel}</Text>

        {showFaceGuide && faceDetectionAvailable ? (
          <Text style={[typography.sectionLabel, styles.faceStatus, { fontFamily: fonts.regular }]}>
            {faceSilence
              ? 'face detection stalled'
              : !faceState.hasFace
              ? 'no face detected'
              : alignmentScore >= alignmentThreshold
              ? 'aligned'
              : alignmentScore >= alignmentThreshold - 0.15
              ? 'hold still'
              : faceState.faceWidth * faceState.faceHeight < 0.04
              ? 'move closer'
              : 'center your face'}
          </Text>
        ) : null}

        {!hasAlignmentTarget && showFaceGuide && faceDetectionAvailable && !referenceJustSet ? (
          <Text style={[typography.sectionLabel, styles.longPressHint, { fontFamily: fonts.regular }]}>
            hold shutter to set reference
          </Text>
        ) : null}

        {referenceJustSet ? (
          <Text style={[typography.sectionLabel, styles.referenceConfirm, { fontFamily: fonts.regular }]}>
            reference set
          </Text>
        ) : null}

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
  content: {
    paddingVertical: 16,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 12,
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
    letterSpacing: 2,
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
  faceStatus: {
    color: Colors.textTertiary,
    textAlign: 'center',
    letterSpacing: 1,
  },
  longPressHint: {
    color: Colors.textTertiary,
    textAlign: 'center',
    letterSpacing: 1,
  },
  referenceConfirm: {
    color: Colors.accent,
    textAlign: 'center',
    letterSpacing: 1,
  },
});
