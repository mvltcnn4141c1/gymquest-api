import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';

interface StatBadgeProps {
  label: string;
  value: number;
  icon: string;
  color: string;
}

export function StatBadge({ label, value, icon, color }: StatBadgeProps) {
  return (
    <View style={[styles.container, { borderColor: color + '44', backgroundColor: color + '11' }]}>
      <MaterialCommunityIcons name={icon as any} size={18} color={color} />
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    flex: 1,
  },
  value: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
