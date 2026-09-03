import React, { useState } from 'react';
import { View, Text, TextInput, Modal, StyleSheet, useWindowDimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { File, Paths } from 'expo-file-system';
import { Colors, Fonts } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import PillButton from '@/components/ui/PillButton';
import { haptics } from '@/utils/haptics';

interface CapturePreviewProps {
  visible: boolean;
  imageUri: string;
  onSave: (caption: string, savedUri: string) => void;
  onRetake: () => void;
}

export default function CapturePreview({
  visible,
  imageUri,
  onSave,
  onRetake,
}: CapturePreviewProps) {
  const { fonts } = useFont();
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const { width } = useWindowDimensions();
  const photoHeight = (width - 48) * (4 / 3);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const filename = `rewind_${Date.now()}.jpg`;
      const src = new File(imageUri);
      const dest = new File(Paths.document, filename);
      await src.copy(dest);
      haptics.success();
      onSave(caption, dest.uri);
      setCaption('');
    } catch {
      haptics.error();
      Alert.alert('Save failed', "Couldn't save photo, please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleRetake = () => {
    if (caption.trim().length > 0) {
      Alert.alert(
        'Discard caption?',
        'You have an unsaved caption. Retaking will discard it.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Retake',
            style: 'destructive',
            onPress: () => {
              setCaption('');
              onRetake();
            },
          },
        ],
      );
    } else {
      setCaption('');
      onRetake();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <Image
          source={{ uri: imageUri }}
          style={[styles.photo, { width: width - 48, height: photoHeight }]}
          contentFit="cover"
        />

        <TextInput
          value={caption}
          onChangeText={(text) => setCaption(text.slice(0, 140))}
          placeholder="add a caption..."
          placeholderTextColor={Colors.textTertiary}
          style={[styles.captionInput, { fontFamily: fonts.regular }]}
          multiline
        />
        <View style={styles.buttonRow}>
          <PillButton
            label={saving ? 'Saving…' : 'Save'}
            onPress={handleSave}
            variant="filled"
            style={styles.buttonFlex}
          />
          <PillButton label="Retake" onPress={handleRetake} variant="outlined" style={styles.buttonFlex} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPage,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  photo: {
    borderRadius: 0,
    marginTop: 16,
  },
  captionInput: {
    width: '100%',
    color: Colors.textPrimary,
    borderBottomWidth: 1,
    borderColor: Colors.borderPrimary,
    fontFamily: Fonts.mono.regular,
    fontSize: 14,
    padding: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  buttonFlex: {
    flex: 1,
  },
});
