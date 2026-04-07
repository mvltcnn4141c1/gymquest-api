import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetwork } from '@/context/NetworkContext';
import { COLORS } from '@/constants/colors';

const CONTENT_HEIGHT = 32;
const PADDING_BOTTOM = 8;

export function OfflineBanner() {
  const { isOnline } = useNetwork();
  const insets = useSafeAreaInsets();
  const totalHeight = insets.top + 4 + CONTENT_HEIGHT + PADDING_BOTTOM;
  const slideAnim = useRef(new Animated.Value(-totalHeight)).current;

  useEffect(() => {
    const hideY = -(insets.top + 4 + CONTENT_HEIGHT + PADDING_BOTTOM);
    Animated.timing(slideAnim, {
      toValue: isOnline ? hideY : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOnline, insets.top]);

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingTop: insets.top + 4, transform: [{ translateY: slideAnim }] },
      ]}
      pointerEvents={isOnline ? 'none' : 'auto'}
    >
      <View style={styles.content}>
        <MaterialCommunityIcons name="wifi-off" size={18} color={COLORS.text} />
        <Text style={styles.text}>Internet baglantisi yok</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: COLORS.danger,
    paddingBottom: PADDING_BOTTOM,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: CONTENT_HEIGHT,
    gap: 8,
  },
  text: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
