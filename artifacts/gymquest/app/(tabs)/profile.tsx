import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useGame, apiGet, apiPost } from '@/context/GameContext';
import { useNetwork } from '@/context/NetworkContext';
import { COLORS, CLASS_COLORS, LEAGUE_COLORS } from '@/constants/colors';
import { XPBar } from '@/components/XPBar';
import { StatBadge } from '@/components/StatBadge';
import { CharacterImage } from '@/components/CharacterImage';
import { LeagueBadge } from '@/components/LeagueBadge';
import { CharacterClass, LeagueTier } from '@/context/GameContext';
import { useQuery } from '@tanstack/react-query';
import { cacheWorkouts, getCachedWorkouts } from '@/lib/offlineCache';
import * as Clipboard from 'expo-clipboard';

interface Workout {
  id: string;
  exerciseName: string;
  exerciseType: string;
  sets: number;
  reps: number;
  duration: number;
  xpEarned: number;
  estimatedCalories: number;
  estimatedDurationMin: number;
  isVerified: boolean;
  isPendingApproval: boolean;
  createdAt: string;
}

const REGION_LABELS: Record<string, string> = {
  global: 'Global', europe: 'Avrupa', americas: 'Amerika',
  asia: 'Asya', 'middle east': 'Orta Doğu', africa: 'Afrika',
};

function WorkoutHistoryItem({ workout }: { workout: Workout }) {
  const date = new Date(workout.createdAt);
  const dateStr = date.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.historyItem}>
      <View style={[
        styles.historyIcon,
        workout.isPendingApproval && { backgroundColor: COLORS.warning + '20' },
      ]}>
        {workout.isPendingApproval ? (
          <MaterialCommunityIcons name="clock-alert" size={18} color={COLORS.warning} />
        ) : workout.isVerified ? (
          <MaterialCommunityIcons name="check-decagram" size={18} color={COLORS.success} />
        ) : (
          <MaterialCommunityIcons name="dumbbell" size={18} color={COLORS.xpBar} />
        )}
      </View>
      <View style={styles.historyInfo}>
        <View style={styles.historyNameRow}>
          <Text style={styles.historyName}>{workout.exerciseName}</Text>
          {workout.isPendingApproval && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>Onay Bekliyor</Text>
            </View>
          )}
        </View>
        <Text style={styles.historyMeta}>
          {workout.reps > 0 ? `${workout.sets} × ${workout.reps} tekrar` : `${workout.duration} dk`}
          {workout.estimatedCalories > 0 ? ` · ${workout.estimatedCalories} kal` : ''}
          {' · '}{dateStr} {timeStr}
        </Text>
      </View>
      <View style={styles.xpBadge}>
        <MaterialCommunityIcons name="lightning-bolt" size={12} color={COLORS.gold} />
        <Text style={styles.xpText}>+{workout.xpEarned}</Text>
      </View>
    </View>
  );
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  rarity: string;
  xpReward: number;
  unlockedAt: string;
}

const RARITY_COLORS: Record<string, string> = {
  common:    COLORS.textSecondary,
  uncommon:  COLORS.success,
  rare:      COLORS.info,
  epic:      COLORS.arcane,
  legendary: COLORS.gold,
};

const RARITY_LABELS: Record<string, string> = {
  common:    'Sıradan',
  uncommon:  'Olağandışı',
  rare:      'Nadir',
  epic:      'Epik',
  legendary: 'Efsanevi',
};

interface ShareCardData {
  shareText: string;
  referralCode: string | null;
  name: string;
  level: number;
  league: string;
  leagueName: string;
  globalRank: number;
  totalPlayers: number;
  totalWorkouts: number;
  streakDays: number;
}

interface ReferralStats {
  referralCode: string;
  referralCount: number;
  maxReferrals: number;
  totalGemsEarned: number;
}

interface NotifResponse {
  unreadCount: number;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { character, refreshCharacter, userId } = useGame();
  const [refreshing, setRefreshing] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [applyingReferral, setApplyingReferral] = useState(false);

  const { isOnline } = useNetwork();

  const { data: workouts } = useQuery<Workout[]>({
    queryKey: ['workouts', userId],
    queryFn: async () => {
      if (!isOnline) {
        const cached = await getCachedWorkouts();
        return cached || [];
      }
      const data = await apiGet<Workout[]>(`/workouts?limit=20`);
      cacheWorkouts(data);
      return data;
    },
    enabled: !!userId,
  });

  const { data: achievements } = useQuery<Achievement[]>({
    queryKey: ['achievements', userId],
    queryFn: () => apiGet(`/achievements`),
    enabled: !!userId && isOnline,
  });

  const { data: notifData } = useQuery<NotifResponse>({
    queryKey: ['notifications-count'],
    queryFn: () => apiGet('/notifications?limit=1'),
    enabled: !!userId && isOnline,
    refetchInterval: isOnline ? 30000 : false,
  });

  const { data: referralStats } = useQuery<ReferralStats>({
    queryKey: ['referral-stats'],
    queryFn: () => apiGet('/referral/stats'),
    enabled: !!userId && isOnline,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshCharacter();
    setRefreshing(false);
  }, [refreshCharacter]);

  const handleShare = async () => {
    try {
      const shareData = await apiGet<ShareCardData>('/share-card');
      await Share.share({ message: shareData.shareText });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyReferral = async () => {
    const code = referralStats?.referralCode || (character as any)?.referralCode;
    if (code) {
      await Clipboard.setStringAsync(code);
      Alert.alert('Kopyalandi', 'Referans kodun panoya kopyalandi!');
    }
  };

  const unreadCount = notifData?.unreadCount || 0;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  if (!character) return (
    <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={COLORS.gold} />
    </View>
  );

  const classColor = CLASS_COLORS[character.class] || COLORS.gold;
  const leagueColor = LEAGUE_COLORS[character.league] || COLORS.textMuted;

  const classLabels: Record<string, string> = {
    warrior: 'Savaşçı', mage: 'Büyücü', archer: 'Okçu', paladin: 'Paladin',
  };

  const pendingCount = workouts?.filter((w) => w.isPendingApproval).length || 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.scroll, { paddingTop: topPad + 16, paddingBottom: 120 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
    >
      <View style={styles.characterShowcase}>
        <View style={styles.showcaseHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{character.name}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.classBadge, { backgroundColor: classColor + '20', borderColor: classColor + '55' }]}>
                <Text style={[styles.classBadgeText, { color: classColor }]}>
                  {(classLabels[character.class] || character.class).toUpperCase()}
                </Text>
              </View>
              <LeagueBadge league={character.league as LeagueTier} size="sm" showName />
            </View>
          </View>
          <View style={styles.regionPill}>
            <MaterialCommunityIcons name="map-marker" size={12} color={COLORS.textMuted} />
            <Text style={styles.regionText}>{REGION_LABELS[character.region] || character.region}</Text>
          </View>
        </View>

        <CharacterImage
          characterClass={character.class as CharacterClass}
          level={character.level}
          league={character.league as LeagueTier}
          streakActive={character.streakActive}
          equippedAura={character.equippedAura}
          size={220}
          showTierLabel
        />

        <View style={styles.xpSection}>
          <XPBar exp={character.exp} expToNextLevel={character.expToNextLevel} level={character.level} />
        </View>
      </View>

      <View style={styles.socialRow}>
        <TouchableOpacity style={styles.socialBtn} onPress={() => router.push('/friends' as any)}>
          <MaterialCommunityIcons name="account-group" size={20} color={COLORS.xpBar} />
          <Text style={styles.socialBtnText}>Arkadaslar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.socialBtn} onPress={() => router.push('/notifications' as any)}>
          <View>
            <MaterialCommunityIcons name="bell" size={20} color={COLORS.gold} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </View>
          <Text style={styles.socialBtnText}>Bildirimler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.socialBtn} onPress={handleShare}>
          <MaterialCommunityIcons name="share-variant" size={20} color={COLORS.success} />
          <Text style={styles.socialBtnText}>Paylas</Text>
        </TouchableOpacity>
      </View>

      {referralStats?.referralCode && (
        <TouchableOpacity style={styles.referralBox} onPress={handleCopyReferral}>
          <View style={styles.referralLeft}>
            <MaterialCommunityIcons name="gift" size={20} color={COLORS.arcane} />
            <View>
              <Text style={styles.referralLabel}>Referans Kodun</Text>
              <Text style={styles.referralCode}>{referralStats.referralCode}</Text>
            </View>
          </View>
          <View style={styles.referralRight}>
            <Text style={styles.referralCount}>{referralStats.referralCount}/{referralStats.maxReferrals}</Text>
            <MaterialCommunityIcons name="content-copy" size={16} color={COLORS.textMuted} />
          </View>
        </TouchableOpacity>
      )}

      {pendingCount > 0 && (
        <View style={styles.pendingAlert}>
          <MaterialCommunityIcons name="clock-alert-outline" size={18} color={COLORS.warning} />
          <Text style={styles.pendingAlertText}>
            {pendingCount} antrenman onay bekliyor. XP'nin yarısı verildi.
          </Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Özellikler</Text>
      <View style={styles.statsRow}>
        <StatBadge label="GÜÇ" value={character.strength} icon="arm-flex" color={COLORS.warrior} />
        <StatBadge label="ÇEV" value={character.agility} icon="run-fast" color={COLORS.archer} />
        <StatBadge label="DAY" value={character.endurance} icon="heart-pulse" color={COLORS.paladin} />
      </View>

      <View style={styles.statsGrid}>
        {[
          { label: 'Seviye', value: character.level, icon: 'star', color: leagueColor },
          { label: 'Toplam XP', value: (character.totalXpEarned || 0).toLocaleString(), icon: 'lightning-bolt', color: COLORS.xpBar },
          { label: 'Antrenman', value: character.totalWorkouts, icon: 'dumbbell', color: COLORS.fire },
          { label: 'Kalori', value: ((character.totalCalories || 0)).toLocaleString(), icon: 'fire', color: COLORS.warning },
        ].map((s) => (
          <View key={s.label} style={styles.statBox}>
            <MaterialCommunityIcons name={s.icon as any} size={20} color={s.color} />
            <Text style={[styles.statBoxValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statBoxLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {achievements && achievements.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>
            Başarımlar ({achievements.length})
          </Text>
          <View style={styles.achievementGrid}>
            {achievements.map((ach) => {
              const rarityColor = RARITY_COLORS[ach.rarity] || COLORS.textSecondary;
              return (
                <View key={ach.id} style={[styles.achCard, { borderColor: rarityColor + '44' }]}>
                  <View style={[styles.achIconBox, { backgroundColor: rarityColor + '18' }]}>
                    <MaterialCommunityIcons name={ach.icon as any} size={22} color={rarityColor} />
                  </View>
                  <Text style={[styles.achName, { color: rarityColor }]} numberOfLines={2}>
                    {ach.name}
                  </Text>
                  <Text style={styles.achDesc} numberOfLines={2}>{ach.description}</Text>
                  <View style={styles.achFooter}>
                    <Text style={[styles.achRarity, { color: rarityColor }]}>
                      {RARITY_LABELS[ach.rarity] || ach.rarity}
                    </Text>
                    <View style={styles.achXp}>
                      <MaterialCommunityIcons name="lightning-bolt" size={10} color={COLORS.gold} />
                      <Text style={styles.achXpText}>+{ach.xpReward}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Son Antrenmanlar</Text>
      {workouts && workouts.length > 0 ? (
        <View style={styles.historyList}>
          {workouts.map((w) => (
            <WorkoutHistoryItem key={w.id} workout={w} />
          ))}
        </View>
      ) : (
        <View style={styles.emptyHistory}>
          <MaterialCommunityIcons name="history" size={40} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>Henüz antrenman yok. Maceraya başla!</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20 },
  characterShowcase: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: 20,
    marginBottom: 20,
  },
  showcaseHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroName: { fontFamily: 'Inter_700Bold', fontSize: 24, color: COLORS.text, marginBottom: 8 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  classBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  classBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5 },
  regionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  regionText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.textMuted },
  xpSection: { width: '100%' },

  pendingAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.warning + '15',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
  },
  pendingAlertText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: COLORS.warning, flex: 1 },

  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statBox: {
    flex: 1,
    minWidth: '40%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statBoxValue: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  statBoxLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' },

  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: COLORS.text, marginBottom: 12 },
  historyList: { gap: 8 },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.xpBar + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  historyInfo: { flex: 1 },
  historyNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.text },
  pendingBadge: {
    backgroundColor: COLORS.warning + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.warning + '50',
  },
  pendingText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: COLORS.warning },
  historyMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  xpBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  xpText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: COLORS.gold },
  emptyHistory: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },

  achievementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  achCard: {
    width: '47%',
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 12,
    borderWidth: 1, gap: 6, alignItems: 'flex-start',
  },
  achIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  achName: { fontFamily: 'Inter_700Bold', fontSize: 12, lineHeight: 16 },
  achDesc: { fontFamily: 'Inter_400Regular', fontSize: 10, color: COLORS.textSecondary, lineHeight: 14 },
  achFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 2 },
  achRarity: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  achXp: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  achXpText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: COLORS.gold },

  socialRow: {
    flexDirection: 'row', gap: 8, marginBottom: 16,
  },
  socialBtn: {
    flex: 1, flexDirection: 'column', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surface, borderRadius: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  socialBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: COLORS.textSecondary },
  notifBadge: {
    position: 'absolute', top: -6, right: -10, minWidth: 16, height: 16,
    borderRadius: 8, backgroundColor: COLORS.danger, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: '#FFF' },
  referralBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.arcane + '30',
  },
  referralLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  referralLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textSecondary },
  referralCode: { fontFamily: 'Inter_700Bold', fontSize: 16, color: COLORS.arcane, letterSpacing: 2 },
  referralRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  referralCount: { fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.textMuted },
});
