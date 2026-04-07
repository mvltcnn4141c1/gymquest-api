import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useGame } from '@/context/GameContext';
import { COLORS } from '@/constants/colors';

export default function IndexScreen() {
  const { isLoading, isOnboarded } = useGame();

  useEffect(() => {
    if (!isLoading) {
      if (isOnboarded) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
    }
  }, [isLoading, isOnboarded]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={COLORS.gold} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
