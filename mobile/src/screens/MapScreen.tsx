/**
 * MapScreen — Ocean Fleet Tracker (mobile).
 */
import React from 'react';
import { View, Text, StyleSheet, useColorScheme, Platform, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { theme, pick } from '../theme';
import { getAnomalySummary } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import Animated, { FadeIn } from 'react-native-reanimated';

// Default region: Bay of Bengal / Indian Ocean
const INITIAL_REGION = {
  latitude: 14.0,
  longitude: 85.0,
  latitudeDelta: 30.0,
  longitudeDelta: 30.0,
};

export function MapScreen({ navigation }: any) {
  const isDark = useColorScheme() === 'dark';
  const bg = pick(isDark, theme.colors.backgroundLight, theme.colors.backgroundDark);
  const text = pick(isDark, theme.colors.textLight, theme.colors.textDark);
  const muted = pick(isDark, theme.colors.textMutedLight, theme.colors.textMutedDark);
  const surface = pick(isDark, theme.colors.surfaceLight, theme.colors.surfaceDark);
  const border = pick(isDark, theme.colors.borderLight, theme.colors.borderDark);

  const { data, isLoading } = useQuery({
    queryKey: ['fleetSummary'],
    queryFn: getAnomalySummary,
    refetchInterval: 60000,
  });

  const fleet = data?.fleet || [];

  if (isLoading && !data) {
    return <EmptyState label="Loading Fleet Topology…" loading />;
  }

  // Fallback for Web where react-native-maps requires extra setup
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: text }]}>Fleet Map (Web)</Text>
          <Text style={[styles.subtitle, { color: muted }]}>Coordinates view</Text>
        </View>
        <View style={{ flex: 1, paddingHorizontal: theme.spacing.md }}>
          <FlashList
            data={fleet}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.webCard, { backgroundColor: surface, borderColor: border }]}
                onPress={() => navigation.navigate('FloatDetail', { floatId: item.id })}
              >
                <Text style={[styles.webCardTitle, { color: text }]}>Float {item.platform_id}</Text>
                <Text style={{ color: muted }}>
                  {item.latitude.toFixed(4)}°N, {item.longitude.toFixed(4)}°E
                </Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={INITIAL_REGION}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        showsUserLocation={false}
      >
        {fleet.map((item) => {
          const isCritical = item.status === 'CRITICAL_ANOMALY';
          const isWarning = item.status === 'WARNING';
          const pinColor = isCritical ? theme.colors.critical : (isWarning ? theme.colors.warning : theme.colors.nominal);
          
          return (
            <Marker
              key={item.id}
              coordinate={{ latitude: item.latitude, longitude: item.longitude }}
              title={`Float ${item.platform_id}`}
              description={isCritical ? 'Critical Divergence Detected' : isWarning ? 'Warning Issued' : 'Nominal'}
              pinColor={pinColor}
              onCalloutPress={() => navigation.navigate('FloatDetail', { floatId: item.id })}
            />
          );
        })}
      </MapView>

      <SafeAreaView style={styles.overlaySafe} edges={['top']}>
        <Animated.View entering={FadeIn.duration(400)} style={[styles.floatingHeader, { backgroundColor: surface, borderColor: border }]}>
          <View>
            <Text style={[styles.headerTitle, { color: text }]}>Live Network</Text>
            <Text style={[styles.headerSubtitle, { color: muted }]}>{fleet.length} active autonomous platforms</Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
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
  },
  overlaySafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: theme.spacing.md,
  },
  floatingHeader: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  webCard: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
  },
  webCardTitle: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 4,
  },
});
