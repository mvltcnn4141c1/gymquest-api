import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LEAGUE_COLORS } from '@/constants/colors';
import { getLeagueFromXp, LeagueTier } from '@/constants/leagues';

interface LeagueBadgeProps {
  league: LeagueTier;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showName?: boolean;
  totalXp?: number;
}

const SIZE_CONFIG = {
  xs: { icon: 10, font: 9, pad: 3, gap: 2 },
  sm: { icon: 14, font: 11, pad: 5, gap: 4 },
  md: { icon: 18, font: 13, pad: 7, gap: 6 },
  lg: { icon: 24, font: 16, pad: 10, gap: 8 },
};

const LEAGUE_ICONS: Record<string, string> = {
  demir:       'shield-outline',
  bronz:       'shield-half-full',
  gumus:       'shield',
  altin:       'shield-star',
  platin:      'shield-crown',
  sampiyonluk: 'crown',
};

const LEAGUE_NAMES: Record<string, string> = {
  demir:       'Demir',
  bronz:       'Bronz',
  gumus:       'Gümüş',
  altin:       'Altın',
  platin:      'Platin',
  sampiyonluk: 'Şampiyonluk',
};

export function LeagueBadge({ league, size = 'sm', showName = true }: LeagueBadgeProps) {
  const color = LEAGUE_COLORS[league] || LEAGUE_COLORS.demir;
  const cfg = SIZE_CONFIG[size];
  const icon = LEAGUE_ICONS[league] || 'shield-outline';
  const name = LEAGUE_NAMES[league] || 'Demir';

  return (
    <View style={[
      styles.badge,
      {
        backgroundColor: color + '1A',
        borderColor: color + '55',
        paddingHorizontal: cfg.pad,
        paddingVertical: cfg.pad - 1,
        gap: cfg.gap,
        borderRadius: cfg.icon,
      },
    ]}>
      <MaterialCommunityIcons name={icon as any} size={cfg.icon} color={color} />
      {showName && (
        <Text style={[styles.name, { color, fontSize: cfg.font }]}>{name}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  name: {
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
});
