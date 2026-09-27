import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { theme, pick } from '../theme';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const isDark = useColorScheme() === 'dark';
  const normalized = status?.toUpperCase() ?? 'NOMINAL';

  let bg = theme.colors.nominal;
  let label = 'NOMINAL';

  if (normalized.includes('CRITICAL')) {
    bg = theme.colors.critical;
    label = 'CRITICAL';
  } else if (normalized.includes('WARNING')) {
    bg = theme.colors.warning;
    label = 'WARNING';
  } else if (normalized.includes('NOMINAL')) {
    bg = theme.colors.nominal;
    label = 'NOMINAL';
  } else if (normalized.includes('HIGH')) {
    bg = theme.colors.critical;
    label = 'HIGH';
  } else if (normalized.includes('MEDIUM')) {
    bg = theme.colors.warning;
    label = 'MEDIUM';
  } else if (normalized.includes('LOW')) {
    bg = theme.colors.nominal;
    label = 'LOW';
  } else {
    label = normalized;
  }

  const isSmall = size === 'sm';

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <View style={[styles.badge, { backgroundColor: bg }, isSmall && styles.badgeSm]}>
        <View style={[styles.dot, { backgroundColor: '#fff' }]} />
        <Text style={[styles.label, isSmall && styles.labelSm]}>{label}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    gap: 5,
  },
  badgeSm: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    color: '#fff',
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 0.5,
  },
  labelSm: {
    fontSize: 9,
  },
});
