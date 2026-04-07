import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';

interface MotivationalBannerProps {
  hoursInactive: number;
  characterName: string;
  onPress?: () => void;
}

const MESSAGES = [
  { min: 0, max: 24, text: "Bugun harika bir gun antrenman icin!", icon: "arm-flex" },
  { min: 24, max: 48, text: "karakter seni bekliyor, macera devam etsin!", icon: "sword" },
  { min: 48, max: 96, text: "Geri donus odulun hazir! Hemen antrenman yap.", icon: "gift" },
  { min: 96, max: Infinity, text: "Efsaneler geri doner. Simdi senin zamanin!", icon: "shield-star" },
];

export function MotivationalBanner({ hoursInactive, characterName, onPress }: MotivationalBannerProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const msg = useMemo(() => {
    const found = MESSAGES.find(m => hoursInactive >= m.min && hoursInactive < m.max);
    return found || MESSAGES[0];
  }, [hoursInactive]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  const displayText = msg.text.includes("karakter")
    ? msg.text.replace("karakter", characterName)
    : msg.text;

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <Pressable
        style={styles.banner}
        onPress={() => {
          if (onPress) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress();
          }
        }}
      >
        <View style={styles.iconBg}>
          <MaterialCommunityIcons name={msg.icon as any} size={24} color={COLORS.gold} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.message}>{displayText}</Text>
          {hoursInactive >= 48 && (
            <Text style={styles.comeback}>Geri donus bonusu aktif!</Text>
          )}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.gold + '0A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.gold + '33',
  },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gold + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 3,
  },
  message: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  comeback: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: COLORS.success,
  },
});
