import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Map, AlertTriangle, FileText, Settings as SettingsIcon } from 'lucide-react-native';

import { useAppStore } from './src/store';
import { theme } from './src/theme';

import { MapScreen } from './src/screens/MapScreen';
import { AlertsScreen } from './src/screens/AlertsScreen';
import { BriefingScreen } from './src/screens/BriefingScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { FloatDetailScreen } from './src/screens/FloatDetailScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { useColorScheme } from 'react-native';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const queryClient = new QueryClient();

function MainTabs() {
  const isDark = useColorScheme() === 'dark';
  
  return (
    <Tab.Navigator 
      screenOptions={{ 
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? theme.colors.surfaceDark : theme.colors.surfaceLight,
          borderTopColor: isDark ? theme.colors.borderDark : theme.colors.borderLight,
        },
        tabBarActiveTintColor: isDark ? theme.colors.textDark : theme.colors.textLight,
      }}
    >
      <Tab.Screen 
        name="Map" 
        component={MapScreen} 
        options={{ tabBarIcon: ({ color }) => <Map color={color} size={24} /> }}
      />
      <Tab.Screen 
        name="Alerts" 
        component={AlertsScreen} 
        options={{ tabBarIcon: ({ color }) => <AlertTriangle color={color} size={24} /> }}
      />
      <Tab.Screen 
        name="Briefing" 
        component={BriefingScreen} 
        options={{ tabBarIcon: ({ color }) => <FileText color={color} size={24} /> }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen} 
        options={{ tabBarIcon: ({ color }) => <SettingsIcon color={color} size={24} /> }}
      />
    </Tab.Navigator>
  );
}

import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  const hasCompletedOnboarding = useAppStore(state => state.hasCompletedOnboarding);
  const isDark = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!hasCompletedOnboarding ? (
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            ) : (
              <>
                <Stack.Screen name="MainTabs" component={MainTabs} />
                <Stack.Screen 
                  name="FloatDetail" 
                  component={FloatDetailScreen} 
                  options={{ 
                    headerShown: true, 
                    title: 'Float Detail',
                    headerStyle: {
                      backgroundColor: isDark ? theme.colors.surfaceDark : theme.colors.surfaceLight,
                    },
                    headerTintColor: isDark ? theme.colors.textDark : theme.colors.textLight,
                    headerShadowVisible: false,
                  }}
                />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
