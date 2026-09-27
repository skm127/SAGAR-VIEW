/**
 * BriefingScreen — Operational Situation Room (mobile).
 * Mirrors the web OperationalSituationRoom + MissionBriefingModal.
 * Every tile is driven by live backend data; nothing is hardcoded.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, useColorScheme, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { getAnomalySummary, getAdvisories, getHealth } from '../services/api';
import type { AdvisoriesResponse } from '../services/api';
import type { AnomalyFleetSummary } from '../types';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { theme, pick } from '../theme';

export function BriefingScreen({ navigation }: any) {
  const isDark = useColorScheme() === 'dark';
  const bg = pick(isDark, theme.colors.backgroundLight, theme.colors.backgroundDark);
  const text = pick(isDark, theme.colors.textLight, theme.colors.textDark);
  const muted = pick(isDark, theme.colors.textMutedLight, theme.colors.textMutedDark);
  const surface = pick(isDark, theme.colors.surfaceLight, theme.colors.surfaceDark);
  const border = pick(isDark, theme.colors.borderLight, theme.colors.borderDark);

  // Fleet anomaly summary
  const fleet = useQuery<AnomalyFleetSummary>({
    queryKey: ['fleetSummary'],
    queryFn: getAnomalySummary,
    refetchInterval: 60000,
  });

  // Advisories from the backend
  const advisories = useQuery<AdvisoriesResponse>({
    queryKey: ['advisories'],
    queryFn: getAdvisories,
    refetchInterval: 60000,
  });

  // Backend health
  const health = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 120000,
  });

  const isLoading = fleet.isLoading && !fleet.data;
  const isRefreshing = fleet.isRefetching || advisories.isRefetching;

  const handleRefresh = () => {
    fleet.refetch();
    advisories.refetch();
  };

  if (isLoading) {
    return <EmptyState label="Connecting to SAGAR-VIEW…" loading />;
  }

  const f = fleet.data;
  const topFloat = f?.highest_anomaly_float;
  const advList = advisories.data?.advisories ?? [];
  const anomalyLevel = (f?.critical_count ?? 0) > 0 ? 'CRITICAL_ANOMALY' : (f?.warning_count ?? 0) > 0 ? 'WARNING' : 'NOMINAL';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.colors.secondary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInUp.duration(400)}>
          <View style={styles.header}>
            <Text style={[styles.heroTitle, { color: text }]}>SAGAR VIEW</Text>
            <Text style={[styles.headerSub, { color: muted }]}>
              Operational Situation Room
            </Text>
          </View>
        </Animated.View>

        {/* Status Banner */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <View style={[styles.statusBanner, {
            backgroundColor: anomalyLevel === 'CRITICAL_ANOMALY' ? theme.colors.critical
              : anomalyLevel === 'WARNING' ? theme.colors.warning
              : theme.colors.nominal,
          }]}>
            <View style={styles.statusBannerLeft}>
              <View style={styles.pulseDot} />
              <Text style={styles.statusBannerText}>
                {anomalyLevel === 'CRITICAL_ANOMALY' ? 'CRITICAL ANOMALIES DETECTED'
                  : anomalyLevel === 'WARNING' ? 'WARNINGS ACTIVE'
                  : 'ALL SYSTEMS NOMINAL'}
              </Text>
            </View>
            <Text style={styles.statusBannerCount}>
              {f?.total_floats ?? 0} floats monitored
            </Text>
          </View>
        </Animated.View>

        {/* KPI Cards Row */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}>
              <Text style={[styles.kpiValue, { color: theme.colors.critical }]}>
                {f?.critical_count ?? 0}
              </Text>
              <Text style={[styles.kpiLabel, { color: muted }]}>Critical</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}>
              <Text style={[styles.kpiValue, { color: theme.colors.warning }]}>
                {f?.warning_count ?? 0}
              </Text>
              <Text style={[styles.kpiLabel, { color: muted }]}>Warning</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}>
              <Text style={[styles.kpiValue, { color: theme.colors.nominal }]}>
                {f?.nominal_count ?? 0}
              </Text>
              <Text style={[styles.kpiLabel, { color: muted }]}>Nominal</Text>
            </View>
          </View>
        </Animated.View>

        {/* Top Anomaly Float Card */}
        {topFloat && (
          <Animated.View entering={FadeInUp.delay(300).duration(400)}>
            <TouchableOpacity
              style={[styles.card, { backgroundColor: surface, borderColor: border }]}
              onPress={() => navigation.navigate('FloatDetail', { floatId: topFloat.id })}
              activeOpacity={0.7}
            >
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardLabel, { color: muted }]}>HIGHEST ANOMALY FLOAT</Text>
                  <Text style={[styles.cardTitle, { color: text }]}>
                    Float {topFloat.platform_id}
                  </Text>
                  <Text style={[styles.cardMeta, { color: muted }]}>
                    Score: {topFloat.anomaly_score.toFixed(2)} · Max Δ: {topFloat.max_delta >= 0 ? '+' : ''}{topFloat.max_delta.toFixed(2)}°C @ {Math.round(topFloat.max_depth)}m
                  </Text>
                </View>
                <StatusBadge status={topFloat.status} />
              </View>
              <Text style={[styles.cardHypothesis, { color: text }]} numberOfLines={3}>
                {topFloat.hypothesis}
              </Text>
              <Text style={[styles.tapHint, { color: theme.colors.secondary }]}>
                Tap to investigate →
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Advisories Section */}
        <Animated.View entering={FadeInUp.delay(400).duration(400)}>
          <Text style={[styles.sectionTitle, { color: text }]}>
            Advisories
          </Text>
          {advisories.data?.valid_time && (
            <Text style={[styles.sectionSub, { color: muted }]}>
              Valid: {new Date(advisories.data.valid_time).toUTCString().slice(5, 22)} UTC
            </Text>
          )}
        </Animated.View>

        {advList.length === 0 ? (
          <Animated.View entering={FadeInUp.delay(500).duration(400)}>
            <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
              <Text style={[styles.nominalText, { color: muted }]}>
                Conditions are nominal. No active advisories.
              </Text>
            </View>
          </Animated.View>
        ) : (
          advList.map((adv, i) => {
            const advBorder = adv.level === 'warning' ? theme.colors.critical
              : adv.level === 'watch' ? theme.colors.warning
              : theme.colors.nominal;
            return (
              <Animated.View key={i} entering={FadeInUp.delay(500 + i * 80).duration(400)}>
                <View style={[styles.card, { backgroundColor: surface, borderColor: advBorder, borderLeftWidth: 3 }]}>
                  <View style={styles.cardRow}>
                    <Text style={[styles.cardTitle, { color: text, flex: 1, marginRight: 8 }]}>
                      {adv.title}
                    </Text>
                    <View style={[styles.advBadge, { backgroundColor: advBorder }]}>
                      <Text style={styles.advBadgeText}>{adv.level.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardBody, { color: text }]}>{adv.message}</Text>
                </View>
              </Animated.View>
            );
          })
        )}

        {/* Backend Connection Status */}
        <Animated.View entering={FadeInUp.delay(600).duration(400)}>
          <View style={[styles.footerCard, { backgroundColor: surface, borderColor: border }]}>
            <View style={[styles.connectionDot, { backgroundColor: health.data ? '#4CAF50' : '#F44336' }]} />
            <Text style={[styles.footerText, { color: muted }]}>
              {health.data ? 'Connected to sagar-view.antideploy.com' : 'Connecting…'}
            </Text>
          </View>
        </Animated.View>

        <View style={{ height: theme.spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: theme.spacing.xxl },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  heroTitle: {
    fontSize: theme.fontSize.hero,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: theme.fontSize.sm,
    marginTop: 2,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  statusBanner: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  statusBannerText: {
    color: '#fff',
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 0.5,
  },
  statusBannerCount: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: theme.fontSize.xs,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  kpiCard: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
  },
  kpiLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    textTransform: 'uppercase',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  card: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  cardMeta: {
    fontSize: theme.fontSize.sm,
    marginTop: 4,
  },
  cardHypothesis: {
    fontSize: theme.fontSize.md,
    lineHeight: 22,
    marginTop: theme.spacing.sm,
  },
  tapHint: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    marginTop: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
  },
  sectionSub: {
    fontSize: theme.fontSize.xs,
    paddingHorizontal: theme.spacing.lg,
    marginTop: 2,
  },
  advBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
  },
  advBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 0.3,
  },
  cardBody: {
    fontSize: theme.fontSize.md,
    lineHeight: 22,
    marginTop: theme.spacing.sm,
  },
  nominalText: {
    fontSize: theme.fontSize.md,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: theme.spacing.md,
  },
  footerCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerText: {
    fontSize: theme.fontSize.sm,
  },
});
