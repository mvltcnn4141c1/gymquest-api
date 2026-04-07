import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, LayoutChangeEvent } from 'react-native';
import { COLORS } from '@/constants/colors';

interface QuestProgressBarProps {
  current: number;
  target: number;
  color?: string;
  height?: number;
  showLabel?: boolean;
}

export function QuestProgressBar({
  current,
  target,
  color = COLORS.xpBar,
  height = 6,
  showLabel = true,
}: QuestProgressBarProps) {
  const progress = Math.min(current / Math.max(target, 1), 1);
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const prevProgress = useRef(0);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    const isNewProgress = progress > prevProgress.current;
    prevProgress.current = progress;

    Animated.spring(animatedProgress, {
      toValue: progress,
      tension: 40,
      friction: 8,
      useNativeDriver: true,
    }).start();

    if (isNewProgress && progress > 0 && progress < 1) {
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start();
    }

    if (progress >= 1) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(flashAnim, { toValue: 0.5, duration: 800, useNativeDriver: true }),
          Animated.timing(flashAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]),
        { iterations: 3 }
      ).start();
    }
  }, [progress]);

  const handleLayout = (e: LayoutChangeEvent) => {
    setBarWidth(e.nativeEvent.layout.width);
  };

  const isComplete = current >= target;

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
          <Text style={[styles.progressText, isComplete && { color: COLORS.success }]}>
            {current}/{target}
          </Text>
          <Text style={[styles.percentText, isComplete && { color: COLORS.success }]}>
            {Math.round(progress * 100)}%
          </Text>
        </View>
      )}
      <View style={[styles.barBg, { height }]} onLayout={handleLayout}>
        <Animated.View
          style={[
            styles.barFill,
            {
              height,
              width: '100%',
              backgroundColor: isComplete ? COLORS.success : color,
              transform: [{ translateX }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.flash,
            {
              height,
              width: '100%',
              opacity: flashAnim,
              transform: [{ translateX }],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 4,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  percentText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: COLORS.textMuted,
  },
  barBg: {
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    borderRadius: 4,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  flash: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 4,
  },
});
