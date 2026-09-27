import React from 'react';
import { View, Text, StyleSheet, useColorScheme, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { theme, pick } from '../theme';

interface EmptyStateProps {
  label: string;
  loading?: boolean;
}

export function EmptyState({ label, loading = false }: EmptyStateProps) {
  const isDark = useColorScheme() === 'dark';

  return (
    <Animated.View entering={FadeIn.duration(400)} style={[styles.container, { backgroundColor: pick(isDark, theme.colors.backgroundLight, theme.colors.backgroundDark) }]}>
      {loading && (
        <ActivityIndicator
          size="small"
          color={theme.colors.secondary}
          style={{ marginBottom: theme.spacing.md }}
        />
      )}
      <Text style={[styles.label, { color: pick(isDark, theme.colors.textMutedLight, theme.colors.textMutedDark) }]}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  label: {
    fontSize: theme.fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
});
