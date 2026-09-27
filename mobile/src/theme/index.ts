/**
 * SAGAR-VIEW Mobile — Production Design System
 * Flat, no-gradient, 6px max radius, 44pt touch targets.
 * Navy + Teal + Amber palette from the original web platform.
 */
export const theme = {
  colors: {
    // Core brand
    primary: '#0D3049',
    secondary: '#2F6F6B',
    accent: '#3D8B87',

    // Status — matches backend anomaly status colors exactly
    critical: '#C04030',
    warning: '#C9862F',
    nominal: '#2F6F6B',

    // Surfaces
    backgroundLight: '#F4F1EA',
    backgroundDark: '#0A141C',
    surfaceLight: '#FFFFFF',
    surfaceDark: '#142028',
    surfaceElevatedLight: '#FAFAF7',
    surfaceElevatedDark: '#1A2A35',

    // Text
    textLight: '#0D3049',
    textDark: '#E8E4DC',
    textMutedLight: 'rgba(13, 48, 73, 0.55)',
    textMutedDark: 'rgba(232, 228, 220, 0.55)',

    // Borders
    borderLight: 'rgba(13, 48, 73, 0.12)',
    borderDark: 'rgba(232, 228, 220, 0.12)',

    // Tab bar
    tabBarLight: '#FFFFFF',
    tabBarDark: '#0F1A22',
    tabBarBorderLight: 'rgba(13, 48, 73, 0.08)',
    tabBarBorderDark: 'rgba(232, 228, 220, 0.08)',
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  borderRadius: {
    sm: 3,
    md: 6,
    lg: 6, // max 6px per PRD
  },

  touchTarget: 44,

  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 22,
    xxl: 28,
    hero: 34,
  },

  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

/** Helper to pick light/dark value */
export function pick<T>(isDark: boolean, light: T, dark: T): T {
  return isDark ? dark : light;
}
