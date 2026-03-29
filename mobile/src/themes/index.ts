import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

// ── Feminine Theme (Rose/Blush) ───────────────────────────────────────────────
export const feminineTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#E91E8C',
    primaryContainer: '#FFD6EC',
    secondary: '#9C27B0',
    secondaryContainer: '#F3E5F5',
    tertiary: '#F06292',
    tertiaryContainer: '#FCE4EC',
    background: '#FFF8FC',
    surface: '#FFFFFF',
    surfaceVariant: '#FFF0F7',
    outline: '#E8B4D0',
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
    onBackground: '#1C1B1F',
    onSurface: '#1C1B1F',
    error: '#B00020',
    success: '#4CAF50',
    warning: '#FF9800',
    // Custom
    cardBackground: '#FFFFFF',
    tabBar: '#FFFFFF',
    tabBarActive: '#E91E8C',
    tabBarInactive: '#9E9E9E',
    headerBackground: '#E91E8C',
    headerText: '#FFFFFF',
    incomeColor: '#4CAF50',
    expenseColor: '#E91E8C',
    chartColors: ['#E91E8C', '#9C27B0', '#F06292', '#CE93D8', '#F48FB1', '#AB47BC', '#E040FB', '#EA80FC'],
    gradientStart: '#E91E8C',
    gradientEnd: '#9C27B0',
  },
  fonts: MD3LightTheme.fonts,
  roundness: 16,
};

// ── Masculine Theme (Dark Slate/Blue) ─────────────────────────────────────────
export const masculineTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#2196F3',
    primaryContainer: '#1565C0',
    secondary: '#00BCD4',
    secondaryContainer: '#006064',
    tertiary: '#4FC3F7',
    tertiaryContainer: '#01579B',
    background: '#0F1923',
    surface: '#1A2533',
    surfaceVariant: '#243447',
    outline: '#37474F',
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
    onBackground: '#E0E0E0',
    onSurface: '#E0E0E0',
    error: '#CF6679',
    success: '#4CAF50',
    warning: '#FFA726',
    // Custom
    cardBackground: '#1A2533',
    tabBar: '#1A2533',
    tabBarActive: '#2196F3',
    tabBarInactive: '#607D8B',
    headerBackground: '#1A2533',
    headerText: '#FFFFFF',
    incomeColor: '#4CAF50',
    expenseColor: '#F44336',
    chartColors: ['#2196F3', '#00BCD4', '#4FC3F7', '#29B6F6', '#0288D1', '#0097A7', '#00ACC1', '#039BE5'],
    gradientStart: '#1565C0',
    gradientEnd: '#0097A7',
  },
  fonts: MD3DarkTheme.fonts,
  roundness: 8,
};

export type AppTheme = typeof feminineTheme;

export const getTheme = (theme: 'feminine' | 'masculine') =>
  theme === 'masculine' ? masculineTheme : feminineTheme;
