import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete, useGame } from '@/context/GameContext';
import { COLORS } from '@/constants/colors';

interface Friend {
  friendshipId: string;
  userId: string;
  name: string;
  class: string;
  race: string;
  level: number;
  totalXpEarned: number;
  league: string;
  streakActive: boolean;
  questStreak: number;
}

interface FriendsResponse {
  friends: Friend[];
  friendCode: string | null;
}

interface Challenge {
  id: string;
  type: string;
  status: string;
  myScore: number;
  opponentScore: number;
  opponentName: string;
  opponentClass: string;
  opponentLevel: number;
  winnerId: string | null;
  isWinner: boolean;
  startsAt: string;
  endsAt: string;
}

interface ChallengesResponse {
  active: Challenge[];
  completed: Challenge[];
}

const CLASS_ICONS: Record<string, string> = {
  warrior: 'sword-cross', mage: 'auto-fix', archer: 'bow-arrow',
  paladin: 'shield-cross', barbarian: 'axe', fighter: 'fencing',
  monk: 'meditation', rogue: 'knife-military', ranger: 'compass',
  wizard: 'wizard-hat', cleric: 'cross', druid: 'leaf',
  sorcerer: 'fire', warlock: 'skull', bard: 'music',
};

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { character } = useGame();
  const [friendCode, setFriendCode] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);
  const [challengingId, setChallengingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'friends' | 'challenges'>('friends');

  const { data: friendsData, isLoading: loadingFriends } = useQuery<FriendsResponse>({
    queryKey: ['friends'],
    queryFn: () => apiGet('/friends'),
    enabled: !!character,
  });

  const { data: challengesData, isLoading: loadingChallenges } = useQuery<ChallengesResponse>({
    queryKey: ['challenges'],
    queryFn: () => apiGet('/challenges'),
    enabled: !!character,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['friends'] });
    await queryClient.invalidateQueries({ queryKey: ['challenges'] });
    setRefreshing(false);
  }, [queryClient]);

  const handleAddFriend = async () => {
    if (!friendCode.trim()) return;
    setAddingFriend(true);
    try {
      const res = await apiPost('/friends/add', { friendCode: friendCode.trim() });
      if (!res.ok) {
        Alert.alert('Hata', res.error || 'Arkadas eklenemedi');
        return;
      }
      setFriendCode('');
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      Alert.alert('Basarili', 'Arkadas eklendi!');
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Arkadas eklenemedi');
    } finally {
      setAddingFriend(false);
    }
  };

  const handleRemoveFriend = (friendshipId: string, name: string) => {
    Alert.alert(
      'Arkadasi Kaldir',
      `${name} arkadas listenizden kaldirilsin mi?`,
      [
        { text: 'Iptal', style: 'cancel' },
        {
          text: 'Kaldir', style: 'destructive',
          onPress: async () => {
            try {
              await apiDelete(`/friends/${friendshipId}`);
              queryClient.invalidateQueries({ queryKey: ['friends'] });
            } catch (e: any) {
              Alert.alert('Hata', e.message);
            }
          },
        },
      ],
    );
  };

  const handleChallenge = async (friendUserId: string) => {
    setChallengingId(friendUserId);
    try {
      const res = await apiPost('/challenges/create', { friendUserId, type: 'weekly_xp' });
      if (!res.ok) {
        Alert.alert('Hata', res.error || 'Duello gonderilemedi');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      Alert.alert('Duello Gonderildi!', '7 gunluk XP duellosuna davet gonderildi.');
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Duello gonderilemedi');
    } finally {
      setChallengingId(null);
    }
  };

  const handleResolve = async (challengeId: string) => {
    try {
      const res = await apiPost<any>('/challenges/resolve', { challengeId });
      if (!res.ok) {
        Alert.alert('Hata', res.error || 'Duello sonuclandirilamadi');
        return;
      }
      const result = res.data;
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      if (result.isDraw) {
        Alert.alert('Berabere!', 'Duello berabere bitti.');
      } else if (result.winnerId) {
        Alert.alert('Sonuc', result.rewards ? `Kazandiniz! +${result.rewards.gems} Gem, +${result.rewards.coins} Altin` : 'Rakip kazandi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    }
  };

  const friends = friendsData?.friends || [];
  const myFriendCode = friendsData?.friendCode || character?.friendCode || '';
  const activeChallenges = challengesData?.active || [];
  const completedChallenges = challengesData?.completed || [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sosyal</Text>
        <View style={{ width: 40 }} />
      </View>

      {myFriendCode ? (
        <View style={styles.codeBox}>
          <MaterialCommunityIcons name="card-account-details" size={18} color={COLORS.xpBar} />
          <Text style={styles.codeLabel}>Arkadas Kodun:</Text>
          <Text style={styles.codeValue}>{myFriendCode}</Text>
        </View>
      ) : null}

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'friends' && styles.tabActive]}
          onPress={() => setTab('friends')}
        >
          <MaterialCommunityIcons name="account-group" size={18} color={tab === 'friends' ? COLORS.gold : COLORS.textMuted} />
          <Text style={[styles.tabText, tab === 'friends' && styles.tabTextActive]}>
            Arkadaslar ({friends.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'challenges' && styles.tabActive]}
          onPress={() => setTab('challenges')}
        >
          <MaterialCommunityIcons name="sword-cross" size={18} color={tab === 'challenges' ? COLORS.gold : COLORS.textMuted} />
          <Text style={[styles.tabText, tab === 'challenges' && styles.tabTextActive]}>
            Duellolar ({activeChallenges.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
      >
        {tab === 'friends' ? (
          <>
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                placeholder="Arkadas kodu gir (F...)"
                placeholderTextColor={COLORS.textMuted}
                value={friendCode}
                onChangeText={setFriendCode}
                autoCapitalize="characters"
                maxLength={7}
              />
              <TouchableOpacity
                style={[styles.addBtn, !friendCode.trim() && styles.addBtnDisabled]}
                onPress={handleAddFriend}
                disabled={!friendCode.trim() || addingFriend}
              >
                {addingFriend ? (
                  <ActivityIndicator size="small" color={COLORS.background} />
                ) : (
                  <MaterialCommunityIcons name="account-plus" size={20} color={COLORS.background} />
                )}
              </TouchableOpacity>
            </View>

            {loadingFriends ? (
              <ActivityIndicator color={COLORS.gold} style={{ marginTop: 40 }} />
            ) : friends.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="account-group-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>Henuz arkadasin yok</Text>
                <Text style={styles.emptySubText}>Arkadas kodunu paylas veya bir kod gir!</Text>
              </View>
            ) : (
              friends.map((f) => (
                <View key={f.friendshipId} style={styles.friendCard}>
                  <View style={styles.friendIcon}>
                    <MaterialCommunityIcons
                      name={(CLASS_ICONS[f.class] || 'account') as any}
                      size={24}
                      color={COLORS.gold}
                    />
                  </View>
                  <View style={styles.friendInfo}>
                    <View style={styles.friendNameRow}>
                      <Text style={styles.friendName}>{f.name}</Text>
                      {f.streakActive && (
                        <MaterialCommunityIcons name="fire" size={14} color={COLORS.fire} />
                      )}
                    </View>
                    <Text style={styles.friendMeta}>
                      Lv.{f.level} {f.class} | {(f.totalXpEarned || 0).toLocaleString()} XP
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.challengeBtn}
                    onPress={() => handleChallenge(f.userId)}
                    disabled={challengingId === f.userId}
                  >
                    {challengingId === f.userId ? (
                      <ActivityIndicator size="small" color={COLORS.fire} />
                    ) : (
                      <MaterialCommunityIcons name="sword-cross" size={18} color={COLORS.fire} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleRemoveFriend(f.friendshipId, f.name)}
                  >
                    <MaterialCommunityIcons name="close" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        ) : (
          <>
            {activeChallenges.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Aktif Duellolar</Text>
                {activeChallenges.map((c) => {
                  const now = Date.now();
                  const endsAt = new Date(c.endsAt).getTime();
                  const remaining = Math.max(0, endsAt - now);
                  const daysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000));
                  const canResolve = remaining <= 0;
                  const winning = c.myScore > c.opponentScore;

                  return (
                    <View key={c.id} style={styles.challengeCard}>
                      <View style={styles.challengeHeader}>
                        <Text style={styles.challengeType}>XP Dellosu</Text>
                        <Text style={[styles.challengeTimer, canResolve && { color: COLORS.success }]}>
                          {canResolve ? 'Sonuclandir' : `${daysLeft} gun kaldi`}
                        </Text>
                      </View>
                      <View style={styles.scoreRow}>
                        <View style={styles.scoreBox}>
                          <Text style={styles.scoreName}>Sen</Text>
                          <Text style={[styles.scoreValue, winning && { color: COLORS.success }]}>
                            {c.myScore.toLocaleString()}
                          </Text>
                        </View>
                        <MaterialCommunityIcons name="sword-cross" size={24} color={COLORS.gold} />
                        <View style={styles.scoreBox}>
                          <Text style={styles.scoreName}>{c.opponentName}</Text>
                          <Text style={[styles.scoreValue, !winning && c.opponentScore > c.myScore && { color: COLORS.danger }]}>
                            {c.opponentScore.toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      {canResolve && (
                        <TouchableOpacity
                          style={styles.resolveBtn}
                          onPress={() => handleResolve(c.id)}
                        >
                          <Text style={styles.resolveBtnText}>Sonuclandir</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </>
            )}

            {completedChallenges.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Gecmis Duellolar</Text>
                {completedChallenges.map((c) => (
                  <View key={c.id} style={[styles.challengeCard, { opacity: 0.7 }]}>
                    <View style={styles.challengeHeader}>
                      <Text style={styles.challengeType}>XP Dellosu</Text>
                      <View style={[styles.resultBadge, { backgroundColor: c.isWinner ? COLORS.success + '20' : COLORS.danger + '20' }]}>
                        <Text style={[styles.resultText, { color: c.isWinner ? COLORS.success : COLORS.danger }]}>
                          {c.winnerId === null ? 'Berabere' : c.isWinner ? 'Kazandin' : 'Kaybettin'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.scoreRow}>
                      <View style={styles.scoreBox}>
                        <Text style={styles.scoreName}>Sen</Text>
                        <Text style={styles.scoreValue}>{c.myScore.toLocaleString()}</Text>
                      </View>
                      <MaterialCommunityIcons name="sword-cross" size={20} color={COLORS.textMuted} />
                      <View style={styles.scoreBox}>
                        <Text style={styles.scoreName}>{c.opponentName}</Text>
                        <Text style={styles.scoreValue}>{c.opponentScore.toLocaleString()}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}

            {activeChallenges.length === 0 && completedChallenges.length === 0 && (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="sword-cross" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>Henuz duellon yok</Text>
                <Text style={styles.emptySubText}>Bir arkadasini duelloya davet et!</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.text },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: COLORS.xpBar + '30',
  },
  codeLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: COLORS.textSecondary },
  codeValue: { fontFamily: 'Inter_700Bold', fontSize: 15, color: COLORS.xpBar, letterSpacing: 2 },
  tabRow: { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 12 },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  tabActive: { borderColor: COLORS.gold + '60', backgroundColor: COLORS.gold + '10' },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: COLORS.textMuted },
  tabTextActive: { color: COLORS.gold },
  content: { flex: 1, paddingHorizontal: 16 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  input: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
  },
  addBtn: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.xpBar,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: COLORS.textSecondary },
  emptySubText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  friendCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: 14, padding: 14, marginBottom: 8, gap: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  friendIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.gold + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  friendInfo: { flex: 1 },
  friendNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  friendName: { fontFamily: 'Inter_700Bold', fontSize: 15, color: COLORS.text },
  friendMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  challengeBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.fire + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  removeBtn: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: COLORS.text, marginBottom: 12, marginTop: 4 },
  challengeCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: COLORS.border,
  },
  challengeHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  challengeType: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.gold },
  challengeTimer: { fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.textSecondary },
  scoreRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
  },
  scoreBox: { alignItems: 'center', gap: 4 },
  scoreName: { fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.textSecondary },
  scoreValue: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.text },
  resolveBtn: {
    marginTop: 12, backgroundColor: COLORS.success, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  resolveBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.background },
  resultBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  resultText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
});
