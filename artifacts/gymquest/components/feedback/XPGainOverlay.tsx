import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';

interface XPBreakdown {
  base?: number;
  streak?: number;
  boost?: number;
  classBonus?: number;
}

interface XPGainOverlayProps {
  visible: boolean;
  xpAmount: number;
  breakdown?: XPBreakdown;
  coinsEarned?: number;
  gemsEarned?: number;
  onDismiss: () => void;
  duration?: number;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function XPGainOverlay({
  visible,
  xpAmount,
  breakdown,
  coinsEarned = 0,
  gemsEarned = 0,
  onDismiss,
  duration = 2800,
}: XPGainOverlayProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const breakdownFade = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    scaleAnim.setValue(0.5);
    breakdownFade.setValue(0);
    floatAnim.setValue(0);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 8, useNativeDriver: true }),
      ]),
      Animated.timing(breakdownFade, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(duration - 1200),
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: -40, duration: 400, useNativeDriver: true }),
      ]),
    ]).start(() => {
      onDismiss();
    });
  }, [visible]);

  if (!visible) return null;

  const hasBreakdown = breakdown && (breakdown.base || breakdown.streak || breakdown.boost || breakdown.classBonus);

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: fadeAnim,
        },
      ]}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          styles.container,
          {
            transform: [
              { translateY: Animated.add(slideAnim, floatAnim) },
              { scale: scaleAnim },
            ],
          },
        ]}
      >
        <View style={styles.mainXP}>
          <MaterialCommunityIcons name="lightning-bolt" size={32} color={COLORS.gold} />
          <Text style={styles.xpText}>+{xpAmount} XP</Text>
        </View>

        {hasBreakdown && (
          <Animated.View style={[styles.breakdownContainer, { opacity: breakdownFade }]}>
            {breakdown.base ? (
              <View style={styles.breakdownRow}>
                <MaterialCommunityIcons name="dumbbell" size={14} color={COLORS.textSecondary} />
                <Text style={styles.breakdownLabel}>Temel</Text>
                <Text style={styles.breakdownValue}>+{breakdown.base}</Text>
              </View>
            ) : null}
            {breakdown.streak ? (
              <View style={styles.breakdownRow}>
                <MaterialCommunityIcons name="fire" size={14} color={COLORS.fire} />
                <Text style={styles.breakdownLabel}>Seri Bonusu</Text>
                <Text style={[styles.breakdownValue, { color: COLORS.fire }]}>+{breakdown.streak}</Text>
              </View>
            ) : null}
            {breakdown.boost ? (
              <View style={styles.breakdownRow}>
                <MaterialCommunityIcons name="rocket-launch" size={14} color={COLORS.arcane} />
                <Text style={styles.breakdownLabel}>Boost</Text>
                <Text style={[styles.breakdownValue, { color: COLORS.arcane }]}>+{breakdown.boost}</Text>
              </View>
            ) : null}
            {breakdown.classBonus ? (
              <View style={styles.breakdownRow}>
                <MaterialCommunityIcons name="shield-star" size={14} color={COLORS.info} />
                <Text style={styles.breakdownLabel}>Sinif Bonusu</Text>
                <Text style={[styles.breakdownValue, { color: COLORS.info }]}>+{breakdown.classBonus}</Text>
              </View>
            ) : null}
          </Animated.View>
        )}

        {(coinsEarned > 0 || gemsEarned > 0) && (
          <Animated.View style={[styles.currencyRow, { opacity: breakdownFade }]}>
            {coinsEarned > 0 && (
              <View style={styles.currencyItem}>
                <MaterialCommunityIcons name="circle-multiple" size={14} color={COLORS.gold} />
                <Text style={styles.currencyText}>+{coinsEarned}</Text>
              </View>
            )}
            {gemsEarned > 0 && (
              <View style={styles.currencyItem}>
                <MaterialCommunityIcons name="diamond-stone" size={14} color={COLORS.info} />
                <Text style={[styles.currencyText, { color: COLORS.info }]}>+{gemsEarned}</Text>
              </View>
            )}
          </Animated.View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    alignItems: 'center',
    gap: 12,
    padding: 28,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.gold + '55',
    minWidth: 220,
  },
  mainXP: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  xpText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 38,
    color: COLORS.gold,
    letterSpacing: 1,
  },
  breakdownContainer: {
    gap: 6,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
  },
  breakdownValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: COLORS.gold,
  },
  currencyRow: {
    flexDirection: 'row',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    width: '100%',
    justifyContent: 'center',
  },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  currencyText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: COLORS.gold,
  },
});
