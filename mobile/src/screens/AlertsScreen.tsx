/**
 * AlertsScreen — Fleet Sidebar equivalent (mobile).
 * Lists all Argo platforms sorted by anomaly severity.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { getAnomalySummary } from '../services/api';
import type { AnomalyFleetSummary, AnomalyFleetMember } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { theme, pick } from '../theme';

export function AlertsScreen({ navigation }: any) {
  const isDark = useColorScheme() === 'dark';
  const bg = pick(isDark, theme.colors.backgroundLight, theme.colors.backgroundDark);
  const text = pick(isDark, theme.colors.textLight, theme.colors.textDark);
  const muted = pick(isDark, theme.colors.textMutedLight, theme.colors.textMutedDark);
  const surface = pick(isDark, theme.colors.surfaceLight, theme.colors.surfaceDark);
  const border = pick(isDark, theme.colors.borderLight, theme.colors.borderDark);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<AnomalyFleetSummary>({
    queryKey: ['fleetSummary'],
    queryFn: getAnomalySummary,
    refetchInterval: 60000,
  });

  const alerts = useMemo(() => {
    if (!data?.fleet) return [];
    // Sort critical -> warning -> nominal, then by score
    return [...data.fleet].sort((a, b) => {
      const wA = a.status === 'CRITICAL_ANOMALY' ? 2 : a.status === 'WARNING' ? 1 : 0;
      const wB = b.status === 'CRITICAL_ANOMALY' ? 2 : b.status === 'WARNING' ? 1 : 0;
      if (wA !== wB) return wB - wA;
      return b.anomaly_score - a.anomaly_score;
    });
  }, [data]);

  if (isLoading && !data) {
    return <EmptyState label="Scanning fleet telemetry…" loading />;
  }
  if (isError && !data) {
    return <EmptyState label="Error loading fleet data." />;
  }

  const renderItem = ({ item }: { item: AnomalyFleetMember }) => {
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: surface, borderColor: border }]}
        onPress={() => navigation.navigate('FloatDetail', { floatId: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.platformId, { color: text }]}>Float {item.platform_id}</Text>
          <StatusBadge status={item.status} size="sm" />
        </View>
        
        <View style={styles.statsRow}>
          <View style={styles.statBlock}>
            <Text style={[styles.statLabel, { color: muted }]}>SCORE</Text>
            <Text style={[styles.statValue, { color: text }]}>{item.anomaly_score.toFixed(2)}</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={[styles.statLabel, { color: muted }]}>MAX Δ</Text>
            <Text style={[styles.statValue, { color: text }]}>
              {item.max_delta >= 0 ? '+' : ''}{item.max_delta.toFixed(2)}°C
            </Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={[styles.statLabel, { color: muted }]}>DEPTH</Text>
            <Text style={[styles.statValue, { color: text }]}>{Math.round(item.max_depth)}m</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: text }]}>Fleet Intel</Text>
        <Text style={[styles.subtitle, { color: muted }]}>
          {alerts.length} platforms reporting
        </Text>
      </View>
      <View style={styles.listContainer}>
        <FlashList
          data={alerts}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
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
  listContainer: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  card: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  platformId: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: theme.spacing.xl,
  },
  statBlock: {},
  statLabel: {
    fontSize: 10,
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
});
