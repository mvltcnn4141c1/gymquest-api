import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, CLASS_COLORS, LEAGUE_COLORS } from '@/constants/colors';
import { CharacterClass, LeagueTier } from '@/context/GameContext';

interface AuraConfig {
  color: string;
  name: string;
  icon: string;
}

export const AURA_CONFIGS: Record<string, AuraConfig> = {
  aura_gri:         { color: '#C0C0C0', name: 'Gümüş Aura',       icon: 'shimmer'          },
  aura_alev:        { color: '#FF6B35', name: 'Alev Aurası',       icon: 'fire'             },
  aura_buz:         { color: '#7EC8E3', name: 'Buz Aurası',        icon: 'snowflake'        },
  aura_firtina:     { color: '#9B59B6', name: 'Fırtına Aurası',    icon: 'lightning-bolt'   },
  aura_altin:       { color: '#FFD700', name: 'Altın Aurası',      icon: 'star-four-points' },
  aura_elmas:       { color: '#B9F2FF', name: 'Elmas Aurası',      icon: 'diamond-stone'    },
  aura_sampiyonluk: { color: '#FF4DFF', name: 'Şampiyonluk Aurası',icon: 'crown'            },
};

interface CharacterImageProps {
  characterClass: CharacterClass;
  level: number;
  league?: LeagueTier;
  streakActive?: boolean;
  equippedAura?: string | null;
  size?: number;
  showTierLabel?: boolean;
}

function getStage(level: number): 1 | 2 | 3 | 4 {
  if (level >= 50) return 4;
  if (level >= 25) return 3;
  if (level >= 10) return 2;
  return 1;
}

function getTierName(level: number): string {
  if (level >= 50) return 'Efsanevi';
  if (level >= 25) return 'Şampiyon';
  if (level >= 10) return 'Deneyimli';
  return 'Çırak';
}

function getTierColor(level: number): string {
  if (level >= 50) return COLORS.gold;
  if (level >= 25) return COLORS.arcane;
  if (level >= 10) return COLORS.info;
  return COLORS.textSecondary;
}

const CHARACTER_IMAGES: Record<CharacterClass, Record<1 | 2 | 3 | 4, any>> = {
  warrior: {
    1: require('@/assets/images/characters/warrior_1.png'),
    2: require('@/assets/images/characters/warrior_2.png'),
    3: require('@/assets/images/characters/warrior_3.png'),
    4: require('@/assets/images/characters/warrior_4.png'),
  },
  mage: {
    1: require('@/assets/images/characters/mage_1.png'),
    2: require('@/assets/images/characters/mage_2.png'),
    3: require('@/assets/images/characters/mage_3.png'),
    4: require('@/assets/images/characters/mage_4.png'),
  },
  archer: {
    1: require('@/assets/images/characters/archer_1.png'),
    2: require('@/assets/images/characters/archer_2.png'),
    3: require('@/assets/images/characters/archer_2.png'),
    4: require('@/assets/images/characters/archer_2.png'),
  },
  paladin: {
    1: require('@/assets/images/characters/warrior_1.png'),
    2: require('@/assets/images/characters/warrior_2.png'),
    3: require('@/assets/images/characters/warrior_3.png'),
    4: require('@/assets/images/characters/warrior_4.png'),
  },
};

interface AuraRingsProps {
  color: string;
  size: number;
}

function AuraRings({ color, size }: AuraRingsProps) {
  const ring1Opacity = useRef(new Animated.Value(0.15)).current;
  const ring1Scale  = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.08)).current;
  const ring2Scale  = useRef(new Animated.Value(1)).current;
  const ring3Opacity = useRef(new Animated.Value(0.05)).current;
  const ring3Scale  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop1 = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ring1Opacity, { toValue: 0.65, duration: 900, useNativeDriver: true }),
          Animated.timing(ring1Scale,   { toValue: 1.12, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ring1Opacity, { toValue: 0.15, duration: 900, useNativeDriver: true }),
          Animated.timing(ring1Scale,   { toValue: 1.0,  duration: 900, useNativeDriver: true }),
        ]),
      ])
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.parallel([
          Animated.timing(ring2Opacity, { toValue: 0.40, duration: 1100, useNativeDriver: true }),
          Animated.timing(ring2Scale,   { toValue: 1.22, duration: 1100, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ring2Opacity, { toValue: 0.08, duration: 1100, useNativeDriver: true }),
          Animated.timing(ring2Scale,   { toValue: 1.0,  duration: 1100, useNativeDriver: true }),
        ]),
      ])
    );
    const loop3 = Animated.loop(
      Animated.sequence([
        Animated.delay(800),
        Animated.parallel([
          Animated.timing(ring3Opacity, { toValue: 0.22, duration: 1300, useNativeDriver: true }),
          Animated.timing(ring3Scale,   { toValue: 1.35, duration: 1300, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ring3Opacity, { toValue: 0.05, duration: 1300, useNativeDriver: true }),
          Animated.timing(ring3Scale,   { toValue: 1.0,  duration: 1300, useNativeDriver: true }),
        ]),
      ])
    );

    loop1.start();
    loop2.start();
    loop3.start();
    return () => { loop1.stop(); loop2.stop(); loop3.stop(); };
  }, [color]);

  const cardH = size * 1.33;
  const cx = size / 2;
  const cy = cardH / 2;

  const ringStyle = (scale: Animated.Value, opacity: Animated.Value, spread: number) => ({
    position: 'absolute' as const,
    width: size + spread,
    height: cardH + spread,
    top: -spread / 2,
    left: -spread / 2,
    borderRadius: 20 + spread / 2,
    borderWidth: 2.5,
    borderColor: color,
    opacity,
    transform: [{ scale }],
  });

  return (
    <>
      <Animated.View style={ringStyle(ring1Scale, ring1Opacity, 12)} pointerEvents="none" />
      <Animated.View style={ringStyle(ring2Scale, ring2Opacity, 28)} pointerEvents="none" />
      <Animated.View style={ringStyle(ring3Scale, ring3Opacity, 48)} pointerEvents="none" />
    </>
  );
}

export function CharacterImage({
  characterClass,
  level,
  league,
  streakActive = false,
  equippedAura,
  size = 240,
  showTierLabel = true,
}: CharacterImageProps) {
  const stage = getStage(level);
  const tierName = getTierName(level);
  const tierColor = getTierColor(level);
  const classColor = CLASS_COLORS[characterClass] || COLORS.gold;

  const auraCfg = equippedAura ? AURA_CONFIGS[equippedAura] : null;
  const auraColor = auraCfg?.color ?? null;

  const glowColor = auraColor
    ? auraColor
    : league
      ? LEAGUE_COLORS[league] || classColor
      : classColor;

  const borderColor = auraColor ?? (streakActive && league
    ? LEAGUE_COLORS[league] || classColor
    : classColor);

  const glowOpacity = useRef(new Animated.Value(0.4)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const streakGlowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.4, duration: 2000, useNativeDriver: true }),
      ])
    );
    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.02, duration: 2500, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 2500, useNativeDriver: true }),
      ])
    );
    glowLoop.start();
    scaleLoop.start();
    return () => { glowLoop.stop(); scaleLoop.stop(); };
  }, []);

  useEffect(() => {
    if (streakActive) {
      const streakLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(streakGlowOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(streakGlowOpacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        ])
      );
      streakLoop.start();
      return () => streakLoop.stop();
    } else {
      streakGlowOpacity.setValue(0);
    }
  }, [streakActive]);

  const imageSource = CHARACTER_IMAGES[characterClass]?.[stage];

  return (
    <View style={styles.container}>
      <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
        {auraColor && <AuraRings color={auraColor} size={size} />}

        <Animated.View
          style={[
            styles.imageWrapper,
            {
              width: size,
              height: size * 1.33,
              borderRadius: 20,
              borderColor,
              borderWidth: auraColor ? 2.5 : 2,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {(streakActive || auraColor) && (
            <Animated.View
              style={[
                styles.glowOverlay,
                {
                  borderRadius: 20,
                  opacity: auraColor ? glowOpacity : streakGlowOpacity,
                  borderColor: auraColor ?? glowColor,
                  borderWidth: auraColor ? 3 : 3,
                  backgroundColor: (auraColor ?? glowColor) + '18',
                },
              ]}
            />
          )}

          {imageSource ? (
            <Image
              source={imageSource}
              style={[styles.characterImage, { width: size, height: size * 1.33, borderRadius: 18 }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.fallback, { width: size, height: size * 1.33 }]}>
              <MaterialCommunityIcons name="sword" size={64} color={borderColor} />
            </View>
          )}

          <View style={[styles.levelBadge, { backgroundColor: COLORS.background, borderColor }]}>
            <Text style={[styles.levelBadgeText, { color: borderColor }]}>LVL {level}</Text>
          </View>

          <View style={styles.stageOverlay}>
            {[1, 2, 3, 4].map((s) => (
              <View
                key={s}
                style={[
                  styles.stageDot,
                  { backgroundColor: s <= stage ? borderColor : COLORS.border },
                ]}
              />
            ))}
          </View>
        </Animated.View>
      </View>

      {auraCfg && (
        <View style={[styles.auraBadge, { borderColor: auraColor + '55', backgroundColor: auraColor + '15' }]}>
          <MaterialCommunityIcons name={auraCfg.icon as any} size={12} color={auraColor!} />
          <Text style={[styles.auraBadgeText, { color: auraColor! }]}>{auraCfg.name}</Text>
        </View>
      )}

      {showTierLabel && (
        <View style={[styles.tierLabel, { borderColor: tierColor + '55', backgroundColor: tierColor + '15' }]}>
          <MaterialCommunityIcons
            name={stage === 4 ? 'crown' : stage === 3 ? 'diamond' : stage === 2 ? 'shield-star' : 'sword'}
            size={14}
            color={tierColor}
          />
          <Text style={[styles.tierLabelText, { color: tierColor }]}>{tierName}</Text>
        </View>
      )}

      {streakActive && (
        <View style={styles.streakBadge}>
          <MaterialCommunityIcons name="fire" size={14} color={COLORS.fire} />
          <Text style={styles.streakBadgeText}>7 Gün Serisi Aktif!</Text>
        </View>
      )}

      {stage < 4 && (
        <Text style={styles.nextEvoText}>
          Sonraki form: Seviye {stage === 1 ? 10 : stage === 2 ? 25 : 50}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 10 },
  imageWrapper: { overflow: 'hidden', position: 'relative' },
  glowOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
  },
  characterImage: { borderWidth: 0 },
  fallback: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface, borderRadius: 18,
  },
  levelBadge: {
    position: 'absolute', top: 10, right: 10,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1.5,
  },
  levelBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1 },
  stageOverlay: {
    position: 'absolute', bottom: 10, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  auraBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  auraBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.3 },
  tierLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  tierLabelText: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 0.5 },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.fire + '20', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.fire + '55',
  },
  streakBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: COLORS.fire },
  nextEvoText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted },
});
