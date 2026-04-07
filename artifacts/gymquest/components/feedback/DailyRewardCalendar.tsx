import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, ActivityIndicator, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';
import { apiGet, apiPost } from '@/context/GameContext';

interface DailyRewardDay {
  day: number;
  xp: number;
  coins: number;
  gems: number;
  state: 'locked' | 'claimed' | 'available';
}

const REWARD_SCHEDULE: Omit<DailyRewardDay, 'state'>[] = [
  { day: 1, xp: 50, coins: 100, gems: 0 },
  { day: 2, xp: 75, coins: 150, gems: 0 },
  { day: 3, xp: 100, coins: 200, gems: 1 },
  { day: 4, xp: 125, coins: 250, gems: 0 },
  { day: 5, xp: 150, coins: 300, gems: 2 },
  { day: 6, xp: 200, coins: 400, gems: 0 },
  { day: 7, xp: 350, coins: 750, gems: 5 },
];

interface RetentionStatus {
  canClaimDailyReward: boolean;
  dailyRewardStreak: number;
  lastDailyRewardDate: string | null;
  weeklyChestAvailable: boolean;
  comebackAvailable: boolean;
  weeklyDaysActive: number;
  inactiveHours: number;
  notifications: {
    missedWorkout: boolean;
    streakBreaking: boolean;
  };
}

interface DailyRewardCalendarProps {
  onRewardClaimed?: (xp: number, coins: number, gems: number) => void;
  onStatusLoaded?: (status: RetentionStatus) => void;
}

export function DailyRewardCalendar({ onRewardClaimed, onStatusLoaded }: DailyRewardCalendarProps) {
  const [status, setStatus] = useState<RetentionStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);
  const [loading, setLoading] = useState(true);
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (status?.canClaimDailyReward && !justClaimed) {
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ])
      );
      glow.start();
      return () => glow.stop();
    }
  }, [status?.canClaimDailyReward, justClaimed]);

  async function loadStatus() {
    try {
      const s = await apiGet<RetentionStatus>('/retention/status');
      setStatus(s);
      onStatusLoaded?.(s);
    } catch (e) {
      console.error('retention status error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleClaim() {
    if (claiming || !status?.canClaimDailyReward || justClaimed) return;
    setClaiming(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const res = await apiPost<any>('/retention/claim-daily', {});
      if (!res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Hata', res.error || 'Odul alinamadi');
        return;
      }
      setJustClaimed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Animated.sequence([
        Animated.spring(bounceAnim, { toValue: 1.1, tension: 100, friction: 5, useNativeDriver: true }),
        Animated.spring(bounceAnim, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
      ]).start();

      const reward = REWARD_SCHEDULE[(status.dailyRewardStreak) % 7];
      onRewardClaimed?.(reward.xp, reward.coins, reward.gems);

      await loadStatus();
    } catch (e) {
      console.error('claim error:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={COLORS.gold} size="small" />
      </View>
    );
  }

  if (!status) return null;

  const currentStreak = status.dailyRewardStreak;
  const canClaim = status.canClaimDailyReward && !justClaimed;

  const days: DailyRewardDay[] = REWARD_SCHEDULE.map((r, i) => {
    let state: 'locked' | 'claimed' | 'available' = 'locked';
    if (i < currentStreak) {
      state = 'claimed';
    } else if (i === currentStreak && canClaim) {
      state = 'available';
    }
    return { ...r, state };
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="calendar-star" size={20} color={COLORS.gold} />
        <Text style={styles.title}>Gunluk Odul</Text>
        <View style={styles.streakBadge}>
          <MaterialCommunityIcons name="fire" size={12} color={COLORS.fire} />
          <Text style={styles.streakText}>{currentStreak}/7</Text>
        </View>
      </View>

      <View style={styles.calendarRow}>
        {days.map((day) => (
          <DayCell
            key={day.day}
            day={day}
            isCurrent={day.state === 'available'}
            glowAnim={glowAnim}
          />
        ))}
      </View>

      {canClaim && (
        <Animated.View style={{ transform: [{ scale: bounceAnim }] }}>
          <Pressable
            style={({ pressed }) => [styles.claimBtn, pressed && { opacity: 0.85 }]}
            onPress={handleClaim}
            disabled={claiming}
          >
            {claiming ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="gift" size={18} color="#000" />
                <Text style={styles.claimBtnText}>Odulu Al</Text>
              </>
            )}
          </Pressable>
        </Animated.View>
      )}

      {justClaimed && (
        <View style={styles.claimedBanner}>
          <MaterialCommunityIcons name="check-circle" size={18} color={COLORS.success} />
          <Text style={styles.claimedText}>Bugunun odulu alindi!</Text>
        </View>
      )}
    </View>
  );
}

function DayCell({ day, isCurrent, glowAnim }: { day: DailyRewardDay; isCurrent: boolean; glowAnim: Animated.Value }) {
  const getCellStyle = () => {
    switch (day.state) {
      case 'claimed':
        return [styles.dayCell, styles.dayCellClaimed];
      case 'available':
        return [styles.dayCell, styles.dayCellAvailable];
      default:
        return [styles.dayCell, styles.dayCellLocked];
    }
  };

  const icon = day.state === 'claimed' ? 'check-circle' : day.gems > 0 ? 'diamond-stone' : 'gift-outline';
  const iconColor = day.state === 'claimed' ? COLORS.success : day.state === 'available' ? COLORS.gold : COLORS.textMuted;

  return (
    <Animated.View style={[
      ...getCellStyle(),
      isCurrent && { transform: [{ scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }] },
    ]}>
      <Text style={[styles.dayNum, day.state === 'claimed' && { color: COLORS.success }]}>
        {day.day}
      </Text>
      <MaterialCommunityIcons name={icon as any} size={16} color={iconColor} />
      <Text style={[styles.dayReward, day.state === 'available' && { color: COLORS.gold }]}>
        {day.xp} XP
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
  },
  loadingBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: COLORS.text,
    flex: 1,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.fire + '18',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  streakText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: COLORS.fire,
  },
  calendarRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  dayCellLocked: {
    backgroundColor: COLORS.surfaceElevated,
    borderColor: COLORS.border,
    opacity: 0.6,
  },
  dayCellClaimed: {
    backgroundColor: COLORS.success + '12',
    borderColor: COLORS.success + '44',
  },
  dayCellAvailable: {
    backgroundColor: COLORS.gold + '15',
    borderColor: COLORS.gold + '55',
  },
  dayNum: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: COLORS.textMuted,
  },
  dayReward: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    color: COLORS.textMuted,
  },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gold,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  claimBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#000',
  },
  claimedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.success + '12',
    paddingVertical: 10,
    borderRadius: 10,
  },
  claimedText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: COLORS.success,
  },
});
