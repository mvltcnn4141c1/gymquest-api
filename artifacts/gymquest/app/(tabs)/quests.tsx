import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useGame, apiGet, apiPost } from '@/context/GameContext';
import { COLORS } from '@/constants/colors';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QuestProgressBar } from '@/components/feedback/QuestProgressBar';
import { RewardPopup } from '@/components/feedback/RewardPopup';

interface DailyQuest {
  id: string;
  userId: string;
  questDate: string;
  exerciseType: string;
  title: string;
  description: string;
  targetValue: number;
  currentProgress: number;
  unit: string;
  xpReward: number;
  coinReward?: number;
  gemReward?: number;
  isCompleted: boolean;
  isClaimed: boolean;
  completedAt: string | null;
}

interface DailyQuestsResponse {
  quests: DailyQuest[];
  allCompleted: boolean;
  bonusAlreadyClaimed: boolean;
  bonusXp: number;
  completedCount: number;
  questStreak: number;
  streakActive: boolean;
}

function StreakCard({ streak, streakActive }: { streak: number; streakActive: boolean }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (streakActive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.03, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [streakActive]);

  return (
    <Animated.View style={[
      styles.streakCard,
      streakActive && styles.streakCardActive,
      { transform: [{ scale: pulseAnim }] },
    ]}>
      <View style={styles.streakIconRow}>
        <MaterialCommunityIcons
          name={streakActive ? 'fire' : 'fire-off'}
          size={28}
          color={streakActive ? COLORS.fire : COLORS.textMuted}
        />
        <Text style={[styles.streakCount, streakActive && { color: COLORS.fire }]}>
          {streak} Gun
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.streakTitle}>
          {streakActive ? 'Seri Aktif!' : 'Gunluk Seri'}
        </Text>
        <Text style={styles.streakSub}>
          {streakActive
            ? 'Karakterin bu hafta boyunca parlar!'
            : '7 gun ust uste tum gorevleri tamamla'}
        </Text>
      </View>
      <View style={styles.streakDots}>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <View
            key={d}
            style={[
              styles.streakDot,
              d <= streak % 8 && { backgroundColor: COLORS.fire },
              streak >= 7 && { backgroundColor: COLORS.fire },
            ]}
          />
        ))}
      </View>
    </Animated.View>
  );
}

function DailyQuestCard({
  quest,
  onComplete,
}: {
  quest: DailyQuest;
  onComplete: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const successAnim = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(1)).current;

  const unitLabel: Record<string, string> = {
    reps: 'tekrar',
    km: 'km',
    minutes: 'dakika',
    count: 'adet',
  };

  async function handleComplete() {
    if (quest.isCompleted || quest.isClaimed || completing) return;
    if (quest.currentProgress < quest.targetValue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setCompleting(true);
    try {
      const res = await apiPost<any>(`/daily-quests/${quest.id}/claim`, {});
      if (!res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Hata', res.error || 'Gorev tamamlanamadi');
        return;
      }

      setShowSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.spring(cardScale, { toValue: 1.03, tension: 100, friction: 5, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
      ]).start();
      Animated.timing(successAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();

      onComplete();
    } catch (e) {
      console.error(e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setCompleting(false);
    }
  }

  const isReady = quest.currentProgress >= quest.targetValue && !quest.isCompleted && !quest.isClaimed;
  const isDone = quest.isCompleted || quest.isClaimed || showSuccess;

  const difficultyColor = {
    easy: COLORS.success,
    medium: COLORS.warning,
    hard: COLORS.danger,
  };

  return (
    <Animated.View style={{ transform: [{ scale: cardScale }] }}>
      <View style={[styles.questCard, isDone && styles.questDone, isReady && styles.questReady]}>
        <View style={styles.questTop}>
          <View style={[styles.xpBadge, { backgroundColor: COLORS.gold + '20', borderColor: COLORS.gold + '44' }]}>
            <MaterialCommunityIcons name="lightning-bolt" size={12} color={COLORS.gold} />
            <Text style={styles.xpText}>{quest.xpReward} XP</Text>
          </View>
          <View style={styles.questTopRight}>
            {quest.coinReward ? (
              <View style={styles.currencyMini}>
                <MaterialCommunityIcons name="circle-multiple" size={10} color={COLORS.gold} />
                <Text style={styles.currencyMiniText}>{quest.coinReward}</Text>
              </View>
            ) : null}
            {quest.gemReward ? (
              <View style={styles.currencyMini}>
                <MaterialCommunityIcons name="diamond-stone" size={10} color={COLORS.info} />
                <Text style={[styles.currencyMiniText, { color: COLORS.info }]}>{quest.gemReward}</Text>
              </View>
            ) : null}
            {isDone && (
              <MaterialCommunityIcons name="check-circle" size={22} color={COLORS.success} />
            )}
          </View>
        </View>

        <Text style={styles.questTitle}>{quest.title}</Text>
        <Text style={styles.questDesc}>{quest.description}</Text>

        <QuestProgressBar
          current={quest.currentProgress}
          target={quest.targetValue}
          height={8}
        />

        {isReady && !isDone && (
          <Pressable
            style={[styles.completeBtn, completing && { opacity: 0.6 }]}
            onPress={handleComplete}
            disabled={completing}
          >
            {completing ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <>
                <MaterialCommunityIcons name="check-bold" size={16} color="#000" />
                <Text style={styles.completeBtnText}>Odulu Al</Text>
              </>
            )}
          </Pressable>
        )}

        {!isReady && !isDone && (
          <View style={styles.targetRow}>
            <MaterialCommunityIcons name="flag-checkered" size={14} color={COLORS.textMuted} />
            <Text style={styles.targetText}>
              Hedef: {quest.targetValue} {unitLabel[quest.unit] || quest.unit}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function BonusCard({ completedCount, bonusXp, claimed }: { completedCount: number; bonusXp: number; claimed: boolean }) {
  const allDone = completedCount >= 3;

  return (
    <View style={[styles.bonusCard, allDone && !claimed && styles.bonusCardReady]}>
      <View style={styles.bonusTop}>
        <MaterialCommunityIcons
          name={claimed ? 'gift-open' : allDone ? 'gift' : 'gift-outline'}
          size={24}
          color={claimed ? COLORS.success : allDone ? COLORS.gold : COLORS.textMuted}
        />
        <Text style={[styles.bonusTitle, allDone && !claimed && { color: COLORS.gold }]}>
          {claimed ? 'Gunluk Bonus Alindi!' : allDone ? 'Bonus Hazir!' : 'Gunluk Tamamlama Bonusu'}
        </Text>
        <View style={[styles.bonusXpBadge, { backgroundColor: COLORS.gold + '20' }]}>
          <Text style={styles.bonusXpText}>+{bonusXp} XP</Text>
        </View>
      </View>

      <View style={styles.bonusProgress}>
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            style={[
              styles.bonusStep,
              n <= completedCount && { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
            ]}
          >
            {n <= completedCount && (
              <MaterialCommunityIcons name="check" size={12} color="#000" />
            )}
          </View>
        ))}
      </View>

      <QuestProgressBar current={completedCount} target={3} color={COLORS.gold} height={4} showLabel={false} />

      <Text style={styles.bonusSub}>
        {claimed
          ? 'Yarin yeni gorevler gelecek!'
          : `3 gorevi de tamamla - ${bonusXp} ekstra XP kazan`}
      </Text>
    </View>
  );
}

export default function QuestsScreen() {
  const insets = useSafeAreaInsets();
  const { userId, refreshCharacter } = useGame();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<DailyQuestsResponse>({
    queryKey: ['daily-quests', userId],
    queryFn: () => apiGet(`/daily-quests`),
    enabled: !!userId,
    refetchInterval: 15000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    await refreshCharacter();
    setRefreshing(false);
  }, [refetch, refreshCharacter]);

  const handleComplete = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['daily-quests', userId] });
    await refreshCharacter();
  }, [userId, refreshCharacter]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const quests = data?.quests || [];
  const completedCount = data?.completedCount || 0;
  const bonusClaimed = data?.bonusAlreadyClaimed || false;
  const bonusXp = data?.bonusXp || 200;
  const questStreak = data?.questStreak || 0;
  const streakActive = data?.streakActive || false;

  const activeQuests = quests.filter(q => !q.isCompleted && !q.isClaimed);
  const completedQuests = quests.filter(q => q.isCompleted || q.isClaimed);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.scroll, { paddingTop: topPad + 16, paddingBottom: 120 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
    >
      <Text style={styles.pageTitle}>Gunluk Gorevler</Text>
      <Text style={styles.pageSubtitle}>Her gun 3 yeni gorev -- hepsini tamamla, bonus XP kazan</Text>

      <StreakCard streak={questStreak} streakActive={streakActive} />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.gold} size="large" />
          <Text style={styles.loadingText}>Gorevler yukleniyor...</Text>
        </View>
      ) : (
        <>
          <BonusCard completedCount={completedCount} bonusXp={bonusXp} claimed={bonusClaimed} />

          {activeQuests.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="sword-cross" size={18} color={COLORS.xpBar} />
                <Text style={styles.sectionTitle}>Aktif Gorevler</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{completedCount}/3</Text>
                </View>
              </View>

              {activeQuests.map((q) => (
                <DailyQuestCard key={q.id} quest={q} onComplete={handleComplete} />
              ))}
            </>
          )}

          {completedQuests.length > 0 && (
            <>
              <View style={[styles.sectionHeader, { marginTop: 8 }]}>
                <MaterialCommunityIcons name="check-circle-outline" size={18} color={COLORS.success} />
                <Text style={styles.sectionTitle}>Tamamlanan</Text>
              </View>

              {completedQuests.map((q) => (
                <DailyQuestCard key={q.id} quest={q} onComplete={handleComplete} />
              ))}
            </>
          )}

          {quests.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="map-search" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Gorev Bulunamadi</Text>
              <Text style={styles.emptyText}>Gunluk gorevler yuklenemedi. Yenile.</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20 },
  pageTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, color: COLORS.text },
  pageSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 16 },

  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  streakCardActive: {
    borderColor: COLORS.fire + '60',
    backgroundColor: COLORS.fire + '0D',
  },
  streakIconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakCount: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.textMuted },
  streakTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.text },
  streakSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  streakDots: { flexDirection: 'row', gap: 4, marginTop: 6 },
  streakDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },

  bonusCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
    gap: 10,
  },
  bonusCardReady: {
    borderColor: COLORS.gold + '60',
    backgroundColor: COLORS.gold + '0A',
  },
  bonusTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bonusTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.text, flex: 1 },
  bonusXpBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  bonusXpText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: COLORS.gold },
  bonusProgress: { flexDirection: 'row', gap: 8 },
  bonusStep: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bonusSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: COLORS.text, flex: 1 },
  countBadge: {
    backgroundColor: COLORS.xpBar + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: COLORS.xpBar },

  questCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  questDone: { opacity: 0.65, borderColor: COLORS.success + '40' },
  questReady: { borderColor: COLORS.gold + '55', backgroundColor: COLORS.gold + '05' },
  questTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  questTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currencyMini: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  currencyMiniText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: COLORS.gold },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  xpText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: COLORS.gold },
  questTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: COLORS.text },
  questDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  targetText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.textMuted },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.gold,
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  completeBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#000' },

  loadingContainer: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.textSecondary },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: COLORS.text },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
});
