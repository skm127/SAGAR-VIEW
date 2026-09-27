/**
 * SettingsScreen — Application configuration and user preferences.
 */
import React from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, useColorScheme, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../store';
import { theme, pick } from '../theme';

export function SettingsScreen() {
  const isDark = useColorScheme() === 'dark';
  const { alertThreshold, setAlertThreshold, subscribedRegions, toggleRegionSubscription } = useAppStore();

  const bg = pick(isDark, theme.colors.backgroundLight, theme.colors.backgroundDark);
  const text = pick(isDark, theme.colors.textLight, theme.colors.textDark);
  const muted = pick(isDark, theme.colors.textMutedLight, theme.colors.textMutedDark);
  const surface = pick(isDark, theme.colors.surfaceLight, theme.colors.surfaceDark);
  const border = pick(isDark, theme.colors.borderLight, theme.colors.borderDark);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: text }]}>Preferences</Text>
        </View>
        
        <View style={[styles.section, { backgroundColor: surface, borderTopColor: border, borderBottomColor: border, borderTopWidth: 1, borderBottomWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: muted }]}>NOTIFICATIONS</Text>
          <View style={styles.row}>
            <Text style={[styles.rowText, { color: text }]}>Critical Anomalies Only</Text>
            <Switch 
              value={alertThreshold === 'CRITICAL_ANOMALY'}
              onValueChange={(val) => setAlertThreshold(val ? 'CRITICAL_ANOMALY' : 'WARNING')}
              trackColor={{ false: pick(isDark, '#333', '#ccc'), true: theme.colors.secondary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: surface, borderTopColor: border, borderBottomColor: border, borderTopWidth: 1, borderBottomWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: muted }]}>SUBSCRIPTIONS</Text>
          {['bay_of_bengal', 'arabian_sea', 'equatorial_io'].map((region, index) => (
            <View 
              key={region} 
              style={[
                styles.row, 
                index !== 2 && { borderBottomWidth: 1, borderBottomColor: border }
              ]}
            >
              <Text style={[styles.rowText, { color: text }]}>
                {region.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Text>
              <Switch 
                value={subscribedRegions.includes(region)}
                onValueChange={() => toggleRegionSubscription(region)}
                trackColor={{ false: pick(isDark, '#333', '#ccc'), true: theme.colors.secondary }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </View>

        <View style={[styles.section, { backgroundColor: surface, borderTopColor: border, borderBottomColor: border, borderTopWidth: 1, borderBottomWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: muted }]}>LEGAL</Text>
          <TouchableOpacity style={[styles.linkRow, { borderBottomWidth: 1, borderBottomColor: border }]} onPress={() => Linking.openURL('https://sagar-view.antideploy.com/terms')}>
            <Text style={[styles.linkText, { color: text }]}>Terms of Service</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL('https://sagar-view.antideploy.com/privacy')}>
            <Text style={[styles.linkText, { color: text }]}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
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
  section: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
  },
  sectionTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.touchTarget + 10,
  },
  rowText: {
    fontSize: theme.fontSize.md,
  },
  linkRow: {
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.touchTarget + 10,
    justifyContent: 'center',
  },
  linkText: {
    fontSize: theme.fontSize.md,
  },
});
