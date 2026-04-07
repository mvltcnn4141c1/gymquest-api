import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, LEAGUE_COLORS } from '@/constants/colors';
import { useGame } from '@/context/GameContext';
import { CharacterImage } from '@/components/CharacterImage';
import { LeagueBadge } from '@/components/LeagueBadge';
import { CharacterClass, LeagueTier } from '@/context/GameContext';

export default function LevelUpScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ level?: string; xp?: string }>();
  const { character } = useGame();

  const level = parseInt(params.level || '2');
  const xp = parseInt(params.xp || '0');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const titleScaleAnim = useRef(new Animated.Value(0.3)).current;
  const titleOpacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 8 }),
      ]),
      Animated.parallel([
        Animated.spring(titleScaleAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 6 }),
        Animated.timing(titleOpacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    });
  }, []);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const stage = level >= 50 ? 4 : level >= 25 ? 3 : level >= 10 ? 2 : 1;
  const prevStage = (level - 1) >= 50 ? 4 : (level - 1) >= 25 ? 3 : (level - 1) >= 10 ? 2 : 1;
  const evolvedForm = stage > prevStage;

  const leagueUnlocked = level === 10 ? 'bronz' : level === 25 ? 'gumus' : level === 50 ? 'altin' : null;

  return (
    <View style={[styles.screen, { paddingTop: topPad, paddingBottom: botPad }]}>
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Animated.View
          style={{
            transform: [{ scale: titleScaleAnim }],
            opacity: titleOpacityAnim,
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <Text style={styles.levelUpText}>SEVİYE ATLADI!</Text>
          <Text style={styles.levelNumber}>Seviye {level}</Text>
        </Animated.View>

        {character && (
          <CharacterImage
            characterClass={character.class as CharacterClass}
            level={character.level}
            league={character.league as LeagueTier}
            streakActive={character.streakActive}
            equippedAura={character.equippedAura}
            size={200}
            showTierLabel
          />
        )}

        <View style={styles.rewardsContainer}>
          <View style={styles.rewardRow}>
            <MaterialCommunityIcons name="lightning-bolt" size={18} color={COLORS.gold} />
            <Text style={styles.rewardText}>+{xp} XP Kazanıldı</Text>
          </View>
          <View style={styles.rewardRow}>
            <MaterialCommunityIcons name="arrow-up-bold" size={18} color={COLORS.success} />
            <Text style={[styles.rewardText, { color: COLORS.success }]}>Özellikler arttı!</Text>
          </View>
        </View>

        {evolvedForm && (
          <View style={styles.evolutionBanner}>
            <MaterialCommunityIcons name="auto-fix" size={20} color={COLORS.gold} />
            <Text style={styles.evolutionText}>Yeni karakter formu açıldı!</Text>
            <MaterialCommunityIcons name="auto-fix" size={20} color={COLORS.gold} />
          </View>
        )}

        {leagueUnlocked && (
          <View style={[styles.leagueBanner, { borderColor: LEAGUE_COLORS[leagueUnlocked] + '55', backgroundColor: LEAGUE_COLORS[leagueUnlocked] + '12' }]}>
            <LeagueBadge league={leagueUnlocked as LeagueTier} size="md" showName />
            <Text style={[styles.leagueBannerText, { color: LEAGUE_COLORS[leagueUnlocked] }]}>
              Ligi açıldı!
            </Text>
          </View>
        )}

        {level === 10 && !leagueUnlocked && (
          <View style={[styles.tierBanner, { borderColor: COLORS.info + '55', backgroundColor: COLORS.info + '12' }]}>
            <MaterialCommunityIcons name="shield-star" size={18} color={COLORS.info} />
            <Text style={[styles.tierBannerText, { color: COLORS.info }]}>Deneyimli rütbesi açıldı!</Text>
          </View>
        )}

        <Pressable
          style={styles.continueBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.replace('/(tabs)');
          }}
        >
          <MaterialCommunityIcons name="sword" size={20} color="#000" />
          <Text style={styles.continueBtnText}>Maceraya Devam</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },
  content: {
    alignItems: 'center', gap: 16, paddingHorizontal: 24, width: '100%',
  },
  levelUpText: {
    fontFamily: 'Inter_700Bold', fontSize: 36, color: COLORS.gold, letterSpacing: 3,
  },
  levelNumber: {
    fontFamily: 'Inter_700Bold', fontSize: 22, color: COLORS.text, marginTop: 4,
  },
  rewardsContainer: {
    flexDirection: 'row', gap: 20, backgroundColor: COLORS.surface,
    borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rewardText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.gold },
  evolutionBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.gold + '18', borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 12,
    borderWidth: 1, borderColor: COLORS.gold + '55',
  },
  evolutionText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.gold },
  leagueBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1,
  },
  leagueBannerText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  tierBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  tierBannerText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.gold, paddingVertical: 16, paddingHorizontal: 48,
    borderRadius: 16, gap: 10, marginTop: 8,
  },
  continueBtnText: { fontFamily: 'Inter_700Bold', fontSize: 17, color: '#000' },
});
