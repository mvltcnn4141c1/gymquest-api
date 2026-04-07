import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  RefreshControl, ActivityIndicator, TextInput, Alert,
  Platform, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGame, apiGet, apiPost } from '@/context/GameContext';
import { COLORS, CLASS_COLORS, LEAGUE_COLORS } from '@/constants/colors';
import { LeagueBadge } from '@/components/LeagueBadge';
import { LeagueTier } from '@/constants/leagues';

const BOSS_ELEMENT_COLORS: Record<string, string> = {
  ateş:        '#FF4500',
  buz:         '#7EC8E3',
  gölge:       '#9B59B6',
  nekromantik: '#8B4513',
  toprak:      '#8B8B6D',
  şimşek:      '#FFD700',
};

const CLASS_LABELS: Record<string, string> = {
  warrior: 'Savaşçı', mage: 'Büyücü', archer: 'Okçu', paladin: 'Paladin',
};

const ROLE_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  warrior: { icon: 'shield', color: COLORS.warrior, label: 'Tank/DPS' },
  mage:    { icon: 'auto-fix', color: COLORS.mage, label: 'Büyü DPS' },
  archer:  { icon: 'bow-arrow', color: COLORS.archer, label: 'Uzak DPS' },
  paladin: { icon: 'heart-pulse', color: COLORS.paladin, label: 'Tank/İyileştirici' },
};

function HPBar({ current, max, color }: { current: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(1, current / max));
  return (
    <View style={hpStyles.track}>
      <View style={[hpStyles.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

const hpStyles = StyleSheet.create({
  track: { height: 10, backgroundColor: COLORS.border, borderRadius: 5, overflow: 'hidden', width: '100%' },
  fill: { height: '100%', borderRadius: 5 },
});

export default function PartyScreen() {
  const insets = useSafeAreaInsets();
  const { userId } = useGame();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [partyName, setPartyName] = useState('');
  const [partyDesc, setPartyDesc] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const { data: partyData, isLoading, refetch } = useQuery<any>({
    queryKey: ['party', userId],
    queryFn: () => apiGet(`/party/my`),
    enabled: !!userId,
  });

  const { data: bossData, refetch: refetchBoss } = useQuery<any>({
    queryKey: ['boss-current', partyData?.party?.id],
    queryFn: () => apiGet(`/boss-events/current?partyId=${partyData?.party?.id}`),
    enabled: !!partyData?.party?.id,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    await refetchBoss();
    setRefreshing(false);
  }, [refetch, refetchBoss]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiPost('/party', { name: partyName.trim(), description: partyDesc.trim() });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['party'] });
      setShowCreateModal(false);
      setPartyName('');
      setPartyDesc('');
    },
    onError: (e: any) => Alert.alert('Hata', e.message || 'Grup olusturulamadi'),
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiPost('/party/join', { inviteCode: inviteCode.trim().toUpperCase() });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['party'] });
      setShowJoinModal(false);
      setInviteCode('');
    },
    onError: (e: any) => Alert.alert('Hata', e.message || 'Gruba katilanamadi'),
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiPost('/party/leave', {});
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['party'] }),
    onError: (e: any) => Alert.alert('Hata', e.message || 'Gruptan cikilamadi'),
  });

  const startBossMutation = useMutation({
    mutationFn: async () => {
      const res = await apiPost('/boss-events/start', { partyId: partyData?.party?.id });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boss-current'] });
      refetchBoss();
    },
    onError: (e: any) => Alert.alert('Hata', e.message || 'Etkinlik baslatilamadi'),
  });

  if (isLoading) {
    return (
      <View style={[styles.screen, { paddingTop: topPad, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  const party = partyData?.party;
  const members = partyData?.members || [];
  const warnings = partyData?.warnings || [];
  const myMembership = partyData?.myMembership;
  const isLeader = myMembership?.role === 'leader';

  const boss = bossData?.event;
  const bossInfo = bossData?.bossInfo;
  const canStart = bossData?.canStart && !boss;

  const bossColor = bossInfo ? BOSS_ELEMENT_COLORS[bossInfo.element] || COLORS.gold : COLORS.gold;

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
      >
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Maceracı Grubu</Text>
          <Text style={styles.pageSubtitle}>
            {party ? `${party.name} — ${members.length}/5 üye` : 'Bir gruba katıl veya kur'}
          </Text>
        </View>

        {!party ? (
          <View style={styles.noParty}>
            <MaterialCommunityIcons name="account-group-outline" size={64} color={COLORS.textMuted} />
            <Text style={styles.noPartyTitle}>Henüz Bir Grubun Yok</Text>
            <Text style={styles.noPartyText}>
              Maceracı grubu kurarak boss etkinliklerine katılabilir, grup ligi sıralamasında yer alabilirsin.
            </Text>

            <View style={styles.noPartyBtns}>
              <Pressable style={styles.createBtn} onPress={() => setShowCreateModal(true)}>
                <MaterialCommunityIcons name="plus" size={20} color="#000" />
                <Text style={styles.createBtnText}>Grup Kur</Text>
              </Pressable>
              <Pressable style={styles.joinBtn} onPress={() => setShowJoinModal(true)}>
                <MaterialCommunityIcons name="login" size={20} color={COLORS.gold} />
                <Text style={styles.joinBtnText}>Gruba Katıl</Text>
              </Pressable>
            </View>

            <View style={styles.roleGuide}>
              <Text style={styles.roleGuideTitle}>Ideal Grup Dengesi</Text>
              <View style={styles.roleGuideGrid}>
                {[
                  { role: 'Tank', icon: 'shield', color: COLORS.warrior, classes: 'Savaşçı / Paladin', desc: 'Hasarı emer' },
                  { role: 'İyileştirici', icon: 'heart-pulse', color: COLORS.paladin, classes: 'Paladin', desc: 'Grubu destekler' },
                  { role: 'Büyü DPS', icon: 'auto-fix', color: COLORS.mage, classes: 'Büyücü', desc: 'Boss zayıflığını söker' },
                  { role: 'Uzak DPS', icon: 'bow-arrow', color: COLORS.archer, classes: 'Okçu', desc: 'Sürekli hasar' },
                ].map((r) => (
                  <View key={r.role} style={[styles.roleCard, { borderColor: r.color + '44' }]}>
                    <MaterialCommunityIcons name={r.icon as any} size={20} color={r.color} />
                    <Text style={[styles.roleLabel, { color: r.color }]}>{r.role}</Text>
                    <Text style={styles.roleClasses}>{r.classes}</Text>
                    <Text style={styles.roleDesc}>{r.desc}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.partyCard}>
              <View style={styles.partyHeader}>
                <View style={styles.partyNameRow}>
                  <MaterialCommunityIcons name="account-group" size={20} color={COLORS.gold} />
                  <Text style={styles.partyName}>{party.name}</Text>
                  {party.league && (
                    <LeagueBadge league={party.league as LeagueTier} size="xs" showName />
                  )}
                </View>
                <View style={styles.partyMeta}>
                  <Text style={styles.partyXp}>{(party.totalXp || 0).toLocaleString()} Grup XP</Text>
                  {isLeader && (
                    <View style={styles.leaderBadge}>
                      <MaterialCommunityIcons name="crown" size={11} color={COLORS.gold} />
                      <Text style={styles.leaderBadgeText}>Lider</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.inviteRow}>
                <MaterialCommunityIcons name="key-variant" size={14} color={COLORS.textSecondary} />
                <Text style={styles.inviteLabel}>Davet Kodu:</Text>
                <Text style={styles.inviteCode}>{party.inviteCode}</Text>
                <Pressable
                  onPress={async () => {
                    await Clipboard.setStringAsync(party.inviteCode);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                  style={styles.copyBtn}
                >
                  <MaterialCommunityIcons name="content-copy" size={14} color={COLORS.gold} />
                </Pressable>
              </View>
            </View>

            {warnings.length > 0 && (
              <View style={styles.warningsBox}>
                <View style={styles.warningsHeader}>
                  <MaterialCommunityIcons name="alert-circle" size={16} color={COLORS.warning} />
                  <Text style={styles.warningsTitle}>Denge Uyarıları</Text>
                </View>
                {warnings.map((w: string, i: number) => (
                  <View key={i} style={styles.warningItem}>
                    <MaterialCommunityIcons name="alert-outline" size={13} color={COLORS.warning} />
                    <Text style={styles.warningText}>{w}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.sectionTitle}>Üyeler ({members.length}/5)</Text>
            <View style={styles.memberList}>
              {members.map((m: any) => {
                const char = m.character;
                if (!char) return null;
                const roleInfo = ROLE_ICONS[char.class] || ROLE_ICONS.warrior;
                const classColor = CLASS_COLORS[char.class] || COLORS.gold;
                return (
                  <View key={m.id} style={styles.memberRow}>
                    <View style={[styles.memberClassIcon, { backgroundColor: classColor + '20', borderColor: classColor + '44' }]}>
                      <MaterialCommunityIcons name={roleInfo.icon as any} size={18} color={classColor} />
                    </View>
                    <View style={styles.memberInfo}>
                      <View style={styles.memberNameRow}>
                        <Text style={styles.memberName}>{char.name}</Text>
                        {m.role === 'leader' && (
                          <MaterialCommunityIcons name="crown" size={12} color={COLORS.gold} />
                        )}
                      </View>
                      <Text style={[styles.memberClass, { color: classColor }]}>
                        {CLASS_LABELS[char.class]} · {roleInfo.label}
                      </Text>
                    </View>
                    <View style={styles.memberStats}>
                      <Text style={styles.memberLevel}>LVL {char.level}</Text>
                      <Text style={styles.memberXp}>{(char.totalXpEarned || 0).toLocaleString()} XP</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {bossInfo && (
              <View style={styles.bossSection}>
                <Text style={styles.sectionTitle}>Boss Etkinliği</Text>

                {boss ? (
                  <View style={[styles.bossCard, { borderColor: bossColor + '55' }]}>
                    <View style={[styles.bossHeader, { backgroundColor: bossColor + '15' }]}>
                      <MaterialCommunityIcons name={bossInfo.icon as any} size={32} color={bossColor} />
                      <View style={styles.bossNameBox}>
                        <Text style={[styles.bossName, { color: bossColor }]}>{bossInfo.name}</Text>
                        <Text style={styles.bossTitle}>{bossInfo.title}</Text>
                        <View style={[styles.elementTag, { backgroundColor: bossColor + '25', borderColor: bossColor + '60' }]}>
                          <Text style={[styles.elementText, { color: bossColor }]}>{bossInfo.element.toUpperCase()}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.bossHpSection}>
                      <View style={styles.bossHpLabelRow}>
                        <MaterialCommunityIcons name="heart" size={14} color={bossColor} />
                        <Text style={styles.bossHpLabel}>
                          {boss.bossHpCurrent.toLocaleString()} / {boss.bossHpMax.toLocaleString()} HP
                        </Text>
                        <Text style={[styles.bossHpPct, { color: bossColor }]}>
                          {Math.round(((boss.bossHpMax - boss.bossHpCurrent) / boss.bossHpMax) * 100)}% hasar verildi
                        </Text>
                      </View>
                      <HPBar current={boss.bossHpCurrent} max={boss.bossHpMax} color={bossColor} />
                    </View>

                    <View style={styles.bossTimer}>
                      <MaterialCommunityIcons name="timer-outline" size={13} color={COLORS.textSecondary} />
                      <Text style={styles.bossTimerText}>
                        Bitiş: {new Date(boss.endsAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                      </Text>
                    </View>

                    <View style={styles.bossMechanic}>
                      <MaterialCommunityIcons name="lightning-bolt" size={13} color={COLORS.info} />
                      <Text style={styles.bossMechanicText}>{bossInfo.specialMechanic}</Text>
                    </View>

                    <View style={styles.bossRewards}>
                      <Text style={styles.bossRewardsTitle}>Zafer Ödülleri (Tüm Üyeler)</Text>
                      <View style={styles.bossRewardRow}>
                        <MaterialCommunityIcons name="lightning-bolt" size={14} color={COLORS.xpBar} />
                        <Text style={styles.bossRewardText}>+{bossInfo.rewardXp.toLocaleString()} XP</Text>
                        <MaterialCommunityIcons name="gold" size={14} color={COLORS.gold} />
                        <Text style={styles.bossRewardText}>+{bossInfo.rewardCoins} Gym Coin</Text>
                        <MaterialCommunityIcons name="diamond-stone" size={14} color={COLORS.arcane} />
                        <Text style={styles.bossRewardText}>+{bossInfo.rewardGems} Gem</Text>
                      </View>
                    </View>

                    <View style={styles.bossContribNote}>
                      <MaterialCommunityIcons name="information-outline" size={13} color={COLORS.textMuted} />
                      <Text style={styles.bossContribNoteText}>
                        Her antrenman otomatik olarak boss'a hasar verir. {bossInfo.weakClass.map((c: string) => CLASS_LABELS[c]).join(' ve ')} sınıfları +30% hasar verir.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.bossCard, { borderColor: bossColor + '40' }]}>
                    <View style={[styles.bossHeader, { backgroundColor: bossColor + '10' }]}>
                      <MaterialCommunityIcons name={bossInfo.icon as any} size={36} color={bossColor} />
                      <View style={styles.bossNameBox}>
                        <Text style={styles.weeklyBossLabel}>Bu Haftanın Bossu</Text>
                        <Text style={[styles.bossName, { color: bossColor }]}>{bossInfo.name}</Text>
                        <Text style={styles.bossTitle}>{bossInfo.title}</Text>
                      </View>
                    </View>
                    <Text style={styles.bossLore}>{bossInfo.lore}</Text>
                    <View style={styles.bossMechanic}>
                      <MaterialCommunityIcons name="lightning-bolt" size={13} color={COLORS.info} />
                      <Text style={styles.bossMechanicText}>{bossInfo.specialMechanic}</Text>
                    </View>

                    {bossData?.estimatedHp && (
                      <View style={styles.bossHpPreview}>
                        <MaterialCommunityIcons name="heart" size={13} color={bossColor} />
                        <Text style={[styles.bossHpPreviewText, { color: bossColor }]}>
                          Tahmini HP: ~{Math.round(bossData.estimatedHp / 1000)}K
                        </Text>
                        <Text style={styles.bossHpPreviewSub}>
                          ({bossData.memberCount} üye, Ort. LVL {bossData.avgLevel})
                        </Text>
                      </View>
                    )}

                    {isLeader && canStart ? (
                      <Pressable
                        style={[styles.startBossBtn, { backgroundColor: bossColor }]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                          startBossMutation.mutate();
                        }}
                        disabled={startBossMutation.isPending}
                      >
                        {startBossMutation.isPending ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <MaterialCommunityIcons name="sword-cross" size={18} color="#fff" />
                            <Text style={styles.startBossBtnText}>Boss Savaşını Başlat</Text>
                          </>
                        )}
                      </Pressable>
                    ) : !isLeader ? (
                      <Text style={styles.waitLeaderText}>Lider boss savaşını başlatacak...</Text>
                    ) : (
                      <Text style={styles.waitLeaderText}>En az 2 üye gereklidir.</Text>
                    )}
                  </View>
                )}
              </View>
            )}

            <Pressable
              style={styles.leaveBtn}
              onPress={() => {
                Alert.alert(
                  'Gruptan Ayrıl',
                  'Gruptan ayrılmak istediğine emin misin?',
                  [
                    { text: 'İptal', style: 'cancel' },
                    { text: 'Ayrıl', style: 'destructive', onPress: () => leaveMutation.mutate() },
                  ]
                );
              }}
            >
              <MaterialCommunityIcons name="exit-to-app" size={16} color={COLORS.error} />
              <Text style={styles.leaveBtnText}>Gruptan Ayrıl</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Grup Kur</Text>
              <Pressable onPress={() => setShowCreateModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={COLORS.textSecondary} />
              </Pressable>
            </View>
            <TextInput
              style={styles.modalInput}
              value={partyName}
              onChangeText={setPartyName}
              placeholder="Grup adı..."
              placeholderTextColor={COLORS.textMuted}
              maxLength={30}
            />
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
              value={partyDesc}
              onChangeText={setPartyDesc}
              placeholder="Açıklama (isteğe bağlı)..."
              placeholderTextColor={COLORS.textMuted}
              maxLength={100}
              multiline
            />
            <Pressable
              style={[styles.modalSubmit, !partyName.trim() && styles.btnDisabled]}
              onPress={() => partyName.trim() && createMutation.mutate()}
              disabled={createMutation.isPending || !partyName.trim()}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.modalSubmitText}>Grubu Kur</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showJoinModal} animationType="slide" transparent onRequestClose={() => setShowJoinModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Gruba Katıl</Text>
              <Pressable onPress={() => setShowJoinModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={COLORS.textSecondary} />
              </Pressable>
            </View>
            <TextInput
              style={[styles.modalInput, { letterSpacing: 4, fontSize: 20, textAlign: 'center' }]}
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              placeholder="ABC123"
              placeholderTextColor={COLORS.textMuted}
              maxLength={6}
              autoCapitalize="characters"
            />
            <Text style={styles.modalHint}>6 karakterli davet kodunu gir</Text>
            <Pressable
              style={[styles.modalSubmit, inviteCode.length < 6 && styles.btnDisabled]}
              onPress={() => inviteCode.length >= 6 && joinMutation.mutate()}
              disabled={joinMutation.isPending || inviteCode.length < 6}
            >
              {joinMutation.isPending ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.modalSubmitText}>Katıl</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: { marginBottom: 20 },
  pageTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, color: COLORS.text },
  pageSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, color: COLORS.text, marginBottom: 10, marginTop: 16 },

  noParty: { alignItems: 'center', gap: 16, paddingTop: 20 },
  noPartyTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: COLORS.text },
  noPartyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
  noPartyBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  createBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: COLORS.gold, padding: 16, borderRadius: 14,
  },
  createBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#000' },
  joinBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: COLORS.surface, padding: 16, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.gold,
  },
  joinBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: COLORS.gold },

  roleGuide: {
    width: '100%', backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  roleGuideTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.text, marginBottom: 12 },
  roleGuideGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleCard: {
    width: '47%', backgroundColor: COLORS.background, borderRadius: 10,
    padding: 10, borderWidth: 1, gap: 3,
  },
  roleLabel: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  roleClasses: { fontFamily: 'Inter_500Medium', fontSize: 11, color: COLORS.textSecondary },
  roleDesc: { fontFamily: 'Inter_400Regular', fontSize: 10, color: COLORS.textMuted },

  partyCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1,
    borderColor: COLORS.gold + '40', padding: 16, gap: 12,
  },
  partyHeader: { gap: 6 },
  partyNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  partyName: { fontFamily: 'Inter_700Bold', fontSize: 18, color: COLORS.text, flex: 1 },
  partyMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partyXp: { fontFamily: 'Inter_500Medium', fontSize: 13, color: COLORS.xpBar },
  leaderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.gold + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.gold + '40',
  },
  leaderBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: COLORS.gold },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.background, padding: 10, borderRadius: 10 },
  inviteLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary },
  inviteCode: { fontFamily: 'Inter_700Bold', fontSize: 16, color: COLORS.text, letterSpacing: 2, flex: 1 },
  copyBtn: { padding: 4 },

  warningsBox: {
    backgroundColor: COLORS.warning + '12', borderWidth: 1, borderColor: COLORS.warning + '40',
    borderRadius: 12, padding: 14, gap: 8, marginTop: 16,
  },
  warningsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warningsTitle: { fontFamily: 'Inter_700Bold', fontSize: 13, color: COLORS.warning },
  warningItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  warningText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, flex: 1, lineHeight: 18 },

  memberList: { gap: 8 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  memberClassIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.text },
  memberClass: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 2 },
  memberStats: { alignItems: 'flex-end' },
  memberLevel: { fontFamily: 'Inter_700Bold', fontSize: 13, color: COLORS.gold },
  memberXp: { fontFamily: 'Inter_400Regular', fontSize: 10, color: COLORS.textSecondary },

  bossSection: { marginTop: 4 },
  bossCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 14,
  },
  bossHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 12 },
  bossNameBox: { flex: 1, gap: 2 },
  weeklyBossLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, color: COLORS.textSecondary },
  bossName: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  bossTitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary },
  elementTag: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1, marginTop: 4,
  },
  elementText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  bossHpSection: { gap: 6 },
  bossHpLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bossHpLabel: { fontFamily: 'Inter_700Bold', fontSize: 13, color: COLORS.text, flex: 1 },
  bossHpPct: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  bossTimer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bossTimerText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary },
  bossMechanic: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: COLORS.info + '10', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: COLORS.info + '30',
  },
  bossMechanicText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.info, flex: 1, lineHeight: 18 },
  bossRewards: { gap: 6 },
  bossRewardsTitle: { fontFamily: 'Inter_700Bold', fontSize: 12, color: COLORS.textSecondary },
  bossRewardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  bossRewardText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: COLORS.text },
  bossContribNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2,
  },
  bossContribNoteText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted, flex: 1, lineHeight: 16 },
  bossLore: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  bossHpPreview: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bossHpPreviewText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  bossHpPreviewSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted },
  startBossBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 16, borderRadius: 12,
  },
  startBossBtnText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#fff' },
  waitLeaderText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 8 },

  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, padding: 14, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.error + '40', backgroundColor: COLORS.error + '10', marginTop: 20,
  },
  leaveBtnText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.error },

  btnDisabled: { opacity: 0.45 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 14,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.text },
  modalInput: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 16, color: COLORS.text, fontFamily: 'Inter_500Medium', fontSize: 16,
  },
  modalHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  modalSubmit: {
    backgroundColor: COLORS.gold, padding: 16, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  modalSubmitText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#000' },
});
