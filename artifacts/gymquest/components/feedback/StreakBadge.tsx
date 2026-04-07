import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';

interface StreakBadgeProps {
  streakDays: number;
  isActive: boolean;
  isAtRisk?: boolean;
  hoursUntilBreak?: number;
}

export function StreakBadge({ streakDays, isActive, isAtRisk, hoursUntilBreak }: StreakBadgeProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isAtRisk) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isAtRisk]);

  if (!isActive && streakDays === 0) return null;

  const borderColor = isAtRisk ? COLORS.warning : isActive ? COLORS.fire : COLORS.border;
  const bgColor = isAtRisk ? COLORS.warning + '12' : isActive ? COLORS.fire + '12' : COLORS.surface;

  return (
    <Animated.View
      style={[
        styles.container,
        { borderColor: borderColor + '66', backgroundColor: bgColor },
        { transform: [{ scale: pulseAnim }] },
      ]}
    >
      <View style={styles.mainRow}>
        <MaterialCommunityIcons
          name={isAtRisk ? 'fire-alert' : isActive ? 'fire' : 'fire-off'}
          size={22}
          color={isAtRisk ? COLORS.warning : isActive ? COLORS.fire : COLORS.textMuted}
        />
        <View style={styles.info}>
          <Text style={[styles.count, { color: isAtRisk ? COLORS.warning : isActive ? COLORS.fire : COLORS.textMuted }]}>
            {streakDays} Gun Seri
          </Text>
          {isAtRisk && hoursUntilBreak != null && (
            <Text style={styles.riskText}>
              {hoursUntilBreak}s icinde kirilacak!
            </Text>
          )}
          {isActive && !isAtRisk && (
            <Text style={styles.activeText}>Seri aktif, devam et!</Text>
          )}
        </View>
      </View>

      <View style={styles.dots}>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <View
            key={d}
            style={[
              styles.dot,
              d <= (streakDays % 7 || (streakDays >= 7 ? 7 : 0)) && {
                backgroundColor: isAtRisk ? COLORS.warning : COLORS.fire,
              },
            ]}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  count: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  riskText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: COLORS.warning,
  },
  activeText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.border,
  },
});
