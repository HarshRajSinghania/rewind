import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/context/AppContext';
import { FontProvider } from '@/context/FontContext';
import { Colors, Fonts } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error('[ErrorBoundary]', error); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.title}>Something went wrong</Text>
          <Text style={ebStyles.subtitle}>Please restart the app</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
const ebStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPage, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontFamily: Fonts.mono.regular, fontSize: 16, color: Colors.textPrimary },
  subtitle: { fontFamily: Fonts.mono.regular, fontSize: 13, color: Colors.textSecondary },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    CommitMono_Light: require('../assets/fonts/CommitMono-Light.otf'),
    CommitMono_Regular: require('../assets/fonts/CommitMono-Regular.otf'),
    CommitMono_Medium: require('../assets/fonts/CommitMono-Medium.otf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  // The boundary wraps the providers too: an error in one (e.g. loading app data) used to
  // unmount the whole tree and leave a blank screen.
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppProvider>
            <FontProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: Colors.bgPage },
                  animation: 'fade_from_bottom',
                  gestureEnabled: true,
                  navigationBarColor: Colors.bgPage,
                }}
              />
            </FontProvider>
          </AppProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
