import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';

interface UrgencyBannerProps {
  type: 'streak_breaking' | 'daily_reward_expiring' | 'quest_expiring';
  message: string;
  hoursLeft?: number;
  onPress?: () => void;
}

const BANNER_CONFIG: Record<string, { icon: string; color: string; bgColor: string }> = {
  streak_breaking: { icon: 'fire-alert', color: COLORS.warning, bgColor: COLORS.warning + '12' },
  daily_reward_expiring: { icon: 'clock-alert', color: COLORS.fire, bgColor: COLORS.fire + '12' },
  quest_expiring: { icon: 'sword-cross', color: COLORS.info, bgColor: COLORS.info + '12' },
};

export function UrgencyBanner({ type, message, hoursLeft, onPress }: UrgencyBannerProps) {
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const config = BANNER_CONFIG[type];

  return (
    <Animated.View style={{ transform: [{ translateY: slideAnim }, { scale: pulseAnim }] }}>
      <Pressable
        style={[styles.banner, { backgroundColor: config.bgColor, borderColor: config.color + '44' }]}
        onPress={() => {
          if (onPress) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress();
          }
        }}
      >
        <MaterialCommunityIcons name={config.icon as any} size={20} color={config.color} />
        <View style={styles.textContainer}>
          <Text style={[styles.message, { color: config.color }]}>{message}</Text>
          {hoursLeft != null && (
            <Text style={styles.timeLeft}>{hoursLeft} saat kaldi</Text>
          )}
        </View>
        {onPress && (
          <MaterialCommunityIcons name="chevron-right" size={20} color={config.color} />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  message: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  timeLeft: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.textMuted,
  },
});
