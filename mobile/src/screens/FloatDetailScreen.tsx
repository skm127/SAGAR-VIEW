/**
 * FloatDetailScreen — Deep Dive Comparison (mobile).
 * Mirrors the ComparisonPanel from the web platform.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, useColorScheme, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { detectAnomaly } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { theme, pick } from '../theme';
import Animated, { FadeInUp } from 'react-native-reanimated';

export function FloatDetailScreen({ route }: any) {
  const isDark = useColorScheme() === 'dark';
  const floatId = route.params.floatId;

  const bg = pick(isDark, theme.colors.backgroundLight, theme.colors.backgroundDark);
  const text = pick(isDark, theme.colors.textLight, theme.colors.textDark);
  const muted = pick(isDark, theme.colors.textMutedLight, theme.colors.textMutedDark);
  const surface = pick(isDark, theme.colors.surfaceLight, theme.colors.surfaceDark);
  const border = pick(isDark, theme.colors.borderLight, theme.colors.borderDark);

  const { data, isLoading, isError, isRefetching } = useQuery({
    queryKey: ['anomaly', floatId],
    queryFn: () => detectAnomaly(floatId),
    refetchInterval: 60000,
  });

  if (isLoading && !data) {
    return <EmptyState label="Analyzing Float Telemetry…" loading />;
  }
  if (isError || !data) {
    return <EmptyState label="Error loading float data." />;
  }

  const {
    profile_id,
    status,
    anomaly_score,
    features,
    hypothesis,
    advisories = [],
  } = data;

  return (
    <ScrollView style={[styles.screen, { backgroundColor: bg }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: text }]}>Float {profile_id}</Text>
          <Text style={[styles.subtitle, { color: muted }]}>Machine Learning Diagnostics</Text>
        </View>
        <StatusBadge status={status} />
      </View>

      {/* Intelligence Summary */}
      <Animated.View entering={FadeInUp.duration(400)}>
        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardLabel, { color: muted }]}>ML CONFIDENCE SCORE</Text>
            <Text style={[styles.score, { color: theme.colors.critical }]}>
              {anomaly_score.toFixed(2)} / 1.00
            </Text>
          </View>
          <Text style={[styles.hypothesis, { color: text }]}>{hypothesis}</Text>
        </View>
      </Animated.View>

      {/* Sensor Divergence Metrics */}
      <Animated.View entering={FadeInUp.delay(100).duration(400)}>
        <Text style={[styles.sectionTitle, { color: text }]}>Feature Drivers</Text>
        <View style={[styles.card, { backgroundColor: surface, borderColor: border, padding: 0, overflow: 'hidden' }]}>
          <View style={[styles.row, { borderBottomColor: border, borderBottomWidth: 1 }]}>
            <Text style={[styles.rowLabel, { color: text }]}>Max Thermal Divergence</Text>
            <Text style={[styles.rowValue, { color: theme.colors.critical }]}>
              {features.max_delta >= 0 ? '+' : ''}{features.max_delta.toFixed(2)}°C
            </Text>
          </View>
          <View style={[styles.row, { borderBottomColor: border, borderBottomWidth: 1 }]}>
            <Text style={[styles.rowLabel, { color: text }]}>Anomaly Depth Level</Text>
            <Text style={[styles.rowValue, { color: text }]}>{Math.round(features.max_layer_depth)}m</Text>
          </View>
          <View style={[styles.row, { borderBottomColor: border, borderBottomWidth: 1 }]}>
            <Text style={[styles.rowLabel, { color: text }]}>Mean Offset</Text>
            <Text style={[styles.rowValue, { color: text }]}>{features.mean_delta.toFixed(2)}°C</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: text }]}>Upper 200m Heat Bias</Text>
            <Text style={[styles.rowValue, { color: text }]}>{features.upper_200m_heat_delta.toFixed(2)}°C</Text>
          </View>
        </View>
      </Animated.View>

      {/* Auto-Generated Advisories for this Float */}
      {advisories.length > 0 && (
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <Text style={[styles.sectionTitle, { color: text, marginTop: theme.spacing.lg }]}>Tactical Directives</Text>
          {advisories.map((adv, i) => (
            <View key={i} style={[styles.advisoryCard, { backgroundColor: pick(isDark, '#FCE8E6', '#2A1A1A') }]}>
              <Text style={[styles.advisoryText, { color: pick(isDark, '#A3402F', '#FF8A65') }]}>
                {adv}
              </Text>
            </View>
          ))}
        </Animated.View>
      )}

      {isRefetching && (
        <View style={styles.refreshBanner}>
          <ActivityIndicator size="small" color={theme.colors.secondary} />
          <Text style={[styles.refreshText, { color: muted }]}>Syncing telemetry…</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingBottom: theme.spacing.xxl,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  cardLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  score: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
  },
  hypothesis: {
    fontSize: theme.fontSize.md,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  rowLabel: {
    fontSize: theme.fontSize.md,
  },
  rowValue: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  advisoryCard: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.critical,
  },
  advisoryText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 20,
  },
  refreshBanner: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  refreshText: {
    fontSize: theme.fontSize.sm,
  },
});
