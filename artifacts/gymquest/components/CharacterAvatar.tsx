import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { COLORS, CLASS_COLORS, CLASS_GLOW } from '@/constants/colors';
import { CharacterClass } from '@/context/GameContext';

interface CharacterAvatarProps {
  characterClass: CharacterClass;
  level: number;
  size?: 'small' | 'medium' | 'large';
  animated?: boolean;
}

const CLASS_ICONS: Record<CharacterClass, { icon: string; lib: 'mci' | 'ion' }> = {
  warrior: { icon: 'sword', lib: 'mci' },
  mage: { icon: 'auto-fix', lib: 'mci' },
  archer: { icon: 'bow-arrow', lib: 'mci' },
  paladin: { icon: 'shield-cross', lib: 'mci' },
};

function getTierBadge(level: number): string {
  if (level >= 50) return 'crown';
  if (level >= 30) return 'diamond';
  if (level >= 20) return 'star';
  if (level >= 10) return 'shield';
  return 'sword';
}

function getAvatarRing(level: number, charClass: CharacterClass): string {
  if (level >= 30) return CLASS_GLOW[charClass];
  if (level >= 15) return CLASS_COLORS[charClass];
  return COLORS.border;
}

export function CharacterAvatar({ characterClass, level, size = 'medium', animated = false }: CharacterAvatarProps) {
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const sizes = {
    small: { container: 48, icon: 22, ring: 2, fontSize: 10 },
    medium: { container: 80, icon: 36, ring: 3, fontSize: 13 },
    large: { container: 120, icon: 56, ring: 4, fontSize: 16 },
  };

  const s = sizes[size];
  const classColor = CLASS_COLORS[characterClass] || COLORS.gold;
  const glowColor = CLASS_GLOW[characterClass] || COLORS.goldDark;
  const ringColor = getAvatarRing(level, characterClass);

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 1500, useNativeDriver: false }),
      ])
    );
    loop.start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();

    return () => { loop.stop(); pulseLoop.stop(); };
  }, [animated]);

  const iconData = CLASS_ICONS[characterClass];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: s.container,
          height: s.container,
          borderRadius: s.container / 2,
          borderWidth: s.ring,
          borderColor: ringColor,
          transform: [{ scale: scaleAnim }],
          shadowColor: glowColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: animated ? glowAnim : 0.6,
          shadowRadius: size === 'large' ? 20 : 12,
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            width: s.container - s.ring * 2,
            height: s.container - s.ring * 2,
            borderRadius: (s.container - s.ring * 2) / 2,
            backgroundColor: classColor + '22',
          },
        ]}
      >
        <MaterialCommunityIcons
          name={iconData.icon as any}
          size={s.icon}
          color={classColor}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
