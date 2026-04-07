import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, useGame } from '@/context/GameContext';
import { COLORS } from '@/constants/colors';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  data: any;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  referral_used: { icon: 'gift', color: COLORS.arcane },
  referral_bonus: { icon: 'gift-open', color: COLORS.gold },
  friend_added: { icon: 'account-plus', color: COLORS.xpBar },
  challenge_received: { icon: 'sword-cross', color: COLORS.fire },
  challenge_won: { icon: 'trophy', color: COLORS.gold },
  challenge_lost: { icon: 'sword-cross', color: COLORS.danger },
  challenge_draw: { icon: 'scale-balance', color: COLORS.textSecondary },
  leaderboard_passed: { icon: 'arrow-up-bold', color: COLORS.warning },
  streak_warning: { icon: 'fire', color: COLORS.fire },
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { character } = useGame();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: () => apiGet('/notifications'),
    enabled: !!character,
    refetchInterval: 30000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setRefreshing(false);
  }, [queryClient]);

  const markAllRead = async () => {
    try {
      const res = await apiPost('/notifications/read', {});
      if (!res.ok) {
        if (__DEV__) console.warn('Mark read failed:', res.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (e) {
      console.error(e);
    }
  };

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bildirimler</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Tumunu Oku</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
      >
        {isLoading ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginTop: 40 }} />
        ) : notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="bell-off-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Bildirim yok</Text>
          </View>
        ) : (
          notifications.map((n) => {
            const typeInfo = TYPE_ICONS[n.type] || { icon: 'bell', color: COLORS.textSecondary };
            const date = new Date(n.createdAt);
            const timeAgo = getTimeAgo(date);

            return (
              <View
                key={n.id}
                style={[styles.notifCard, !n.isRead && styles.notifUnread]}
              >
                <View style={[styles.notifIcon, { backgroundColor: typeInfo.color + '18' }]}>
                  <MaterialCommunityIcons name={typeInfo.icon as any} size={20} color={typeInfo.color} />
                </View>
                <View style={styles.notifContent}>
                  <Text style={styles.notifTitle}>{n.title}</Text>
                  <Text style={styles.notifMessage}>{n.message}</Text>
                  <Text style={styles.notifTime}>{timeAgo}</Text>
                </View>
                {!n.isRead && <View style={styles.unreadDot} />}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function getTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Az once';
  if (minutes < 60) return `${minutes} dk once`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat once`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gun once`;
  return date.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.text },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.gold + '15' },
  markAllText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: COLORS.gold },
  content: { flex: 1, paddingHorizontal: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: COLORS.textSecondary },
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.surface,
    borderRadius: 14, padding: 14, marginBottom: 8, gap: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  notifUnread: { borderColor: COLORS.gold + '30', backgroundColor: COLORS.gold + '05' },
  notifIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  notifContent: { flex: 1 },
  notifTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.text, marginBottom: 2 },
  notifMessage: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  notifTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.gold,
    marginTop: 6,
  },
});
