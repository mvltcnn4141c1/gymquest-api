import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';

interface RewardItem {
  type: 'xp' | 'coins' | 'gems';
  amount: number;
}

interface RewardPopupProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  rewards: RewardItem[];
  onDismiss: () => void;
  soundFlag?: string;
}

const REWARD_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  xp: { icon: 'lightning-bolt', color: COLORS.gold, label: 'XP' },
  coins: { icon: 'circle-multiple', color: COLORS.gold, label: 'Altin' },
  gems: { icon: 'diamond-stone', color: COLORS.info, label: 'Elmas' },
};

export function RewardPopup({ visible, title, subtitle, rewards, onDismiss }: RewardPopupProps) {
  const backdropFade = useRef(new Animated.Value(0)).current;
  const containerScale = useRef(new Animated.Value(0.3)).current;
  const containerFade = useRef(new Animated.Value(0)).current;
  const rewardAnims = useRef(rewards.map(() => new Animated.Value(0))).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    backdropFade.setValue(0);
    containerScale.setValue(0.3);
    containerFade.setValue(0);
    rewardAnims.forEach(a => a.setValue(0));
    glowAnim.setValue(0);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(backdropFade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(containerScale, { toValue: 1, tension: 65, friction: 7, useNativeDriver: true }),
        Animated.timing(containerFade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.stagger(120, rewardAnims.map(a =>
        Animated.spring(a, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true })
      )),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ])
      ),
    ]).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.backdrop, { opacity: backdropFade }]}>
        <Animated.View
          style={[
            styles.container,
            {
              opacity: containerFade,
              transform: [{ scale: containerScale }],
            },
          ]}
        >
          <Animated.View style={[styles.glowRing, {
            opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
          }]} />

          <MaterialCommunityIcons name="treasure-chest" size={48} color={COLORS.gold} />
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

          <View style={styles.rewardList}>
            {rewards.map((reward, i) => {
              const config = REWARD_CONFIG[reward.type];
              return (
                <Animated.View
                  key={`${reward.type}-${i}`}
                  style={[
                    styles.rewardItem,
                    {
                      opacity: rewardAnims[i] || 1,
                      transform: [{
                        scale: (rewardAnims[i] || new Animated.Value(1)).interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, 1.2, 1],
                        }),
                      }],
                    },
                  ]}
                >
                  <View style={[styles.rewardIconBg, { backgroundColor: config.color + '20' }]}>
                    <MaterialCommunityIcons name={config.icon as any} size={24} color={config.color} />
                  </View>
                  <Text style={[styles.rewardAmount, { color: config.color }]}>+{reward.amount}</Text>
                  <Text style={styles.rewardLabel}>{config.label}</Text>
                </Animated.View>
              );
            })}
          </View>

          <Pressable
            style={({ pressed }) => [styles.claimBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onDismiss();
            }}
          >
            <MaterialCommunityIcons name="check-bold" size={18} color="#000" />
            <Text style={styles.claimBtnText}>Tamam</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: COLORS.gold + '44',
    marginHorizontal: 32,
    width: '85%',
    maxWidth: 340,
  },
  glowRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: COLORS.gold,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  rewardList: {
    flexDirection: 'row',
    gap: 20,
    marginVertical: 12,
  },
  rewardItem: {
    alignItems: 'center',
    gap: 6,
  },
  rewardIconBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  rewardLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: COLORS.textMuted,
  },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gold,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
    gap: 8,
    marginTop: 4,
  },
  claimBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#000',
  },
});
