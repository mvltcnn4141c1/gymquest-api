import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GameProvider, OfflineError } from "@/context/GameContext";
import { NetworkProvider } from "@/context/NetworkContext";
import { OfflineBanner } from "@/components/OfflineBanner";
import { COLORS } from "@/constants/colors";
import { onlineManager } from "@tanstack/react-query";
import { getIsOnline } from "@/context/NetworkContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof OfflineError) return false;
        return failureCount < 2;
      },
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});

onlineManager.setEventListener((setOnline) => {
  const interval = setInterval(() => {
    setOnline(getIsOnline());
  }, 2000);
  return () => clearInterval(interval);
});

function BootLoading({ message }: { message: string }) {
  return (
    <View style={bootStyles.container}>
      <ActivityIndicator size="large" color={COLORS.gold} />
      <Text style={bootStyles.text}>{message}</Text>
    </View>
  );
}

const bootStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  text: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="log-workout" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="level-up" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
    if (fontError) {
      if (__DEV__) console.warn('[GymQuest] Font loading error:', fontError.message);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return <BootLoading message="Yaztipler yukleniyor..." />;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <NetworkProvider>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <GameProvider>
                <OfflineBanner />
                <RootLayoutNav />
              </GameProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </NetworkProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
