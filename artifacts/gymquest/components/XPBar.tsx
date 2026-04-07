import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, LayoutChangeEvent } from 'react-native';
import { COLORS } from '@/constants/colors';

interface XPBarProps {
  exp: number;
  expToNextLevel: number;
  level: number;
  showLabel?: boolean;
}

export function XPBar({ exp, expToNextLevel, level, showLabel = true }: XPBarProps) {
  const progress = Math.min(exp / expToNextLevel, 1);
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    Animated.spring(animatedProgress, {
      toValue: progress,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start();
  }, [progress]);

  const handleLayout = (e: LayoutChangeEvent) => {
    setBarWidth(e.nativeEvent.layout.width);
  };

  const translateX = barWidth > 0
    ? animatedProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [-barWidth, 0],
      })
    : -9999;

  return (
    <View style={styles.container}>
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={styles.levelText}>LVL {level}</Text>
          <Text style={styles.expText}>{exp} / {expToNextLevel} XP</Text>
        </View>
      )}
      <View style={styles.barBackground} onLayout={handleLayout}>
        <Animated.View
          style={[
            styles.barFill,
            {
              width: '100%',
              transform: [{ translateX }],
            },
          ]}
        />
        <View style={styles.barShine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  levelText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: COLORS.xpBar,
    letterSpacing: 1,
  },
  expText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  barBackground: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    backgroundColor: COLORS.xpBar,
    borderRadius: 4,
    shadowColor: COLORS.xpGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  barShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
  },
});
