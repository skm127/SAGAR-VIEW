import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, Switch, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { theme } from '../theme';
import { useAppStore } from '../store';

export function OnboardingScreen() {
  const isDark = useColorScheme() === 'dark';
  const { completeOnboarding, subscribedRegions, toggleRegionSubscription } = useAppStore();
  const [step, setStep] = useState(1);

  const handleNext = () => {
    if (step === 3) {
      completeOnboarding();
      // Fire-and-forget notification permission request (only on native)
      if (Platform.OS !== 'web') {
        try {
          const Notifications = require('expo-notifications');
          Notifications.requestPermissionsAsync().catch(() => {});
        } catch (_) {}
      }
    } else {
      setStep(s => s + 1);
    }
  };

  const colors = {
    bg: isDark ? theme.colors.backgroundDark : theme.colors.backgroundLight,
    text: isDark ? theme.colors.textDark : theme.colors.textLight,
    muted: isDark ? 'rgba(244,241,234,0.5)' : 'rgba(13,48,73,0.5)',
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.progress}>
        {[1, 2, 3].map(i => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i <= step ? theme.colors.secondary : (isDark ? 'rgba(244,241,234,0.2)' : 'rgba(13,48,73,0.15)'),
                width: i === step ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.content}>
        <Animated.View key={step} entering={FadeInRight.duration(300)} exiting={FadeOutLeft.duration(200)}>
          {step === 1 && (
            <View>
              <Text style={[styles.title, { color: colors.text }]}>Welcome to{'\n'}SAGAR-VIEW</Text>
              <Text style={[styles.body, { color: colors.muted }]}>
                Live model-versus-in-situ divergence scoring on Argo floats.
                Data sourced from Argo GDAC and HYCOM/CMEMS reanalysis.
              </Text>
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={[styles.title, { color: colors.text }]}>Choose Regions</Text>
              <Text style={[styles.body, { color: colors.muted }]}>
                Select the ocean basins you want to monitor.
              </Text>
              {['bay_of_bengal', 'arabian_sea', 'equatorial_io'].map(region => (
                <View style={[styles.row, { borderColor: isDark ? theme.colors.borderDark : theme.colors.borderLight }]} key={region}>
                  <Text style={{ color: colors.text, fontSize: 15 }}>
                    {region.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                  <Switch
                    value={subscribedRegions.includes(region)}
                    onValueChange={() => toggleRegionSubscription(region)}
                    trackColor={{ false: isDark ? '#333' : '#ccc', true: theme.colors.secondary }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={[styles.title, { color: colors.text }]}>Enable Notifications</Text>
              <Text style={[styles.body, { color: colors.muted }]}>
                Get alerted when a float crosses into CRITICAL_ANOMALY status in your subscribed regions.
              </Text>
            </View>
          )}
        </Animated.View>
      </View>

      <View style={styles.footer}>
        {step > 1 && (
          <TouchableOpacity
            style={[styles.backButton, { borderColor: isDark ? theme.colors.borderDark : theme.colors.borderLight }]}
            onPress={() => setStep(s => s - 1)}
            accessibilityRole="button"
          >
            <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.colors.secondary, flex: step > 1 ? 1 : undefined }]}
          onPress={handleNext}
          accessibilityRole="button"
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>{step === 3 ? 'Finish Setup' : 'Continue'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  progress: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: theme.spacing.md,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: theme.spacing.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    minHeight: theme.touchTarget,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  backButton: {
    minHeight: theme.touchTarget,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    minHeight: theme.touchTarget,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
