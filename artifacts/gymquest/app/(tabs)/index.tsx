import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';
import { COLORS, CLASS_COLORS, LEAGUE_COLORS } from '@/constants/colors';
import { CharacterImage } from '@/components/CharacterImage';
import { LeagueBadge } from '@/components/LeagueBadge';
import { XPBar } from '@/components/XPBar';
import { CharacterClass, LeagueTier } from '@/context/GameContext';
import { DailyRewardCalendar } from '@/components/feedback/DailyRewardCalendar';
import { StreakBadge } from '@/components/feedback/StreakBadge';
import { UrgencyBanner } from '@/components/feedback/UrgencyBanner';
import { MotivationalBanner } from '@/components/feedback/MotivationalBanner';
import { RewardPopup } from '@/components/feedback/RewardPopup';

const EXERCISES = [
  { id: 'push_up',        name: 'Sinav',          icon: 'arm-flex',               xpNote: '~15 XP/set'  },
  { id: 'pull_up',        name: 'Pull-Up',        icon: 'human-handsup',          xpNote: '~20 XP/set'  },
  { id: 'squat',          name: 'Squat',          icon: 'human-male',             xpNote: '~12 XP/set'  },
  { id: 'running',        name: 'Kosu',           icon: 'run',                    xpNote: '~2 XP/dk'    },
  { id: 'burpee',         name: 'Burpee',         icon: 'human-greeting-variant', xpNote: '~20 XP/set'  },
  { id: 'plank',          name: 'Plank',          icon: 'human-male-board',       xpNote: '~10 XP/dk'   },
  { id: 'deadlift',       name: 'Deadlift',       icon: 'weight-lifter',          xpNote: '~25 XP/set'  },
  { id: 'cycling',        name: 'Bisiklet',       icon: 'bike',                   xpNote: '~1 XP/dk'    },
];

function ExerciseCard({ exercise }: { exercise: typeof EXERCISES[0] }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.95, tension: 100, friction: 8, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }).start();
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/log-workout', params: { exerciseType: exercise.id, exerciseName: exercise.name } });
  };

  return (
    <Animated.View style={{ width: '47%', transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={styles.exerciseCard}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View style={styles.exerciseIcon}>
          <MaterialCommunityIcons name={exercise.icon as any} size={28} color={COLORS.gold} />
        </View>
        <Text style={styles.exerciseName}>{exercise.name}</Text>
        <Text style={styles.exerciseXp}>{exercise.xpNote}</Text>
      </Pressable>
    </Animated.View>
  );
}

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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { character, isLoading, initError, refreshCharacter } = useGame();
  const [refreshing, setRefreshing] = React.useState(false);
  const [retentionStatus, setRetentionStatus] = useState<RetentionStatus | null>(null);
  const [rewardPopup, setRewardPopup] = useState<{ visible: boolean; xp: number; coins: number; gems: number }>({
    visible: false, xp: 0, coins: 0, gems: 0,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshCharacter();
    setRefreshing(false);
  }, [refreshCharacter]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  if (isLoading || !character) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        {initError ? (
          <>
            <MaterialCommunityIcons name="alert-circle-outline" size={48} color={COLORS.error || '#FF6B6B'} />
            <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
              {initError}
            </Text>
            <Pressable onPress={refreshCharacter} style={{ marginTop: 12, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: COLORS.gold, borderRadius: 8 }}>
              <Text style={{ color: '#000', fontWeight: '600' }}>Tekrar Dene</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={COLORS.gold} />
            <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>Karakter yukleniyor...</Text>
          </>
        )}
      </View>
    );
  }

  const classColor = CLASS_COLORS[character.class] || COLORS.gold;
  const leagueColor = LEAGUE_COLORS[character.league] || COLORS.textMuted;

  const classLabels: Record<string, string> = {
    warrior: 'Savasci', mage: 'Buyucu', archer: 'Okcu', paladin: 'Paladin',
    barbarian: 'Barbar', fighter: 'Dovuscu', monk: 'Kesin', rogue: 'Haydut',
    ranger: 'Koruyucu', wizard: 'Sihirbaz', cleric: 'Rahip', druid: 'Druid',
    sorcerer: 'Buyucu', warlock: 'Karanlik Buyucu', bard: 'Ozan',
  };

  const hoursInactive = retentionStatus?.inactiveHours ?? 0;
  const isStreakAtRisk = retentionStatus?.notifications?.streakBreaking ?? false;
  const missedWorkout = retentionStatus?.notifications?.missedWorkout ?? false;

  const hoursUntilStreakBreak = character.lastWorkoutAt
    ? Math.max(0, 48 - Math.floor((Date.now() - new Date(character.lastWorkoutAt).getTime()) / (60 * 60 * 1000)))
    : undefined;

  function handleRewardClaimed(xp: number, coins: number, gems: number) {
    setRewardPopup({ visible: true, xp, coins, gems });
    refreshCharacter();
  }

  return (
    <View style={styles.screenContainer}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 16, paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
      >
        {isStreakAtRisk && (
          <UrgencyBanner
            type="streak_breaking"
            message="Serin kirilmak uzere!"
            hoursLeft={hoursUntilStreakBreak}
            onPress={() => router.push('/log-workout')}
          />
        )}

        {missedWorkout && !isStreakAtRisk && hoursInactive >= 24 && (
          <View style={{ marginBottom: 12 }}>
            <MotivationalBanner
              hoursInactive={hoursInactive}
              characterName={character.name}
              onPress={() => router.push('/log-workout')}
            />
          </View>
        )}

        <View style={styles.characterCard}>
          <View style={styles.cardRow}>
            <View style={styles.characterInfo}>
              <Text style={styles.characterName}>{character.name}</Text>

              <View style={styles.badgeRow}>
                <View style={[styles.classTag, { backgroundColor: classColor + '20', borderColor: classColor + '44' }]}>
                  <Text style={[styles.classTagText, { color: classColor }]}>
                    {(classLabels[character.class] || character.class).toUpperCase()}
                  </Text>
                </View>
                <LeagueBadge league={character.league as LeagueTier} size="xs" showName />
              </View>

              <View style={styles.statsCompact}>
                <View style={styles.statChip}>
                  <MaterialCommunityIcons name="arm-flex" size={12} color={COLORS.warrior} />
                  <Text style={[styles.statChipText, { color: COLORS.warrior }]}>{character.strength}</Text>
                </View>
                <View style={styles.statChip}>
                  <MaterialCommunityIcons name="run-fast" size={12} color={COLORS.archer} />
                  <Text style={[styles.statChipText, { color: COLORS.archer }]}>{character.agility}</Text>
                </View>
                <View style={styles.statChip}>
                  <MaterialCommunityIcons name="heart-pulse" size={12} color={COLORS.paladin} />
                  <Text style={[styles.statChipText, { color: COLORS.paladin }]}>{character.endurance}</Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Text style={[styles.metaValue, { color: leagueColor }]}>{character.totalWorkouts}</Text>
                  <Text style={styles.metaLabel}>Antrenman</Text>
                </View>
                <View style={styles.metaDivider} />
                <View style={styles.metaItem}>
                  <Text style={styles.metaValue}>{(character.totalXpEarned || 0).toLocaleString()}</Text>
                  <Text style={styles.metaLabel}>Toplam XP</Text>
                </View>
              </View>
            </View>

            <CharacterImage
              characterClass={character.class as CharacterClass}
              level={character.level}
              league={character.league as LeagueTier}
              streakActive={character.streakActive}
              equippedAura={character.equippedAura}
              size={130}
              showTierLabel={false}
            />
          </View>

          <XPBar exp={character.exp} expToNextLevel={character.expToNextLevel} level={character.level} />
        </View>

        {(character.streakDays > 0 || character.streakActive) && (
          <View style={{ marginBottom: 12 }}>
            <StreakBadge
              streakDays={character.streakDays}
              isActive={character.streakActive}
              isAtRisk={isStreakAtRisk}
              hoursUntilBreak={hoursUntilStreakBreak}
            />
          </View>
        )}

        <View style={{ marginBottom: 16 }}>
          <DailyRewardCalendar
            onRewardClaimed={handleRewardClaimed}
            onStatusLoaded={setRetentionStatus}
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.logWorkoutBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            router.push('/log-workout');
          }}
        >
          <MaterialCommunityIcons name="plus-circle" size={24} color="#000" />
          <Text style={styles.logWorkoutBtnText}>Antrenman Kaydet</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Hizli Baslat</Text>
        <View style={styles.exerciseGrid}>
          {EXERCISES.map((ex) => (
            <ExerciseCard key={ex.id} exercise={ex} />
          ))}
        </View>
      </ScrollView>

      <RewardPopup
        visible={rewardPopup.visible}
        title="Gunluk Odul!"
        subtitle="Her gun gir, odul kazan"
        rewards={[
          ...(rewardPopup.xp > 0 ? [{ type: 'xp' as const, amount: rewardPopup.xp }] : []),
          ...(rewardPopup.coins > 0 ? [{ type: 'coins' as const, amount: rewardPopup.coins }] : []),
          ...(rewardPopup.gems > 0 ? [{ type: 'gems' as const, amount: rewardPopup.gems }] : []),
        ]}
        onDismiss={() => setRewardPopup(p => ({ ...p, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: COLORS.background },
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20 },
  characterCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
    marginBottom: 16,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  characterInfo: { flex: 1, gap: 6 },
  characterName: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.text },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  classTag: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start',
  },
  classTagText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5 },
  statsCompact: { flexDirection: 'row', gap: 6, marginTop: 4 },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  statChipText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  metaRow: { flexDirection: 'row', gap: 16, marginTop: 6 },
  metaItem: { alignItems: 'center' },
  metaValue: { fontFamily: 'Inter_700Bold', fontSize: 16, color: COLORS.text },
  metaLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted },
  metaDivider: { width: 1, height: 30, backgroundColor: COLORS.border },
  logWorkoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.gold, padding: 18, borderRadius: 16, gap: 10,
    marginBottom: 24,
  },
  logWorkoutBtnText: { fontFamily: 'Inter_700Bold', fontSize: 17, color: '#000' },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: COLORS.text, marginBottom: 12 },
  exerciseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  exerciseCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border,
    gap: 6, minHeight: 100,
  },
  exerciseIcon: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: COLORS.gold + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  exerciseName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.text },
  exerciseXp: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.xpBar },
});
