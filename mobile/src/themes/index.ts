import { MD3DarkTheme, MD3LightTheme } from "react-native-paper";

// ── Feminine Theme (Rose/Blush) ───────────────────────────────────────────────
export const feminineTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#E91E8C",
    primaryContainer: "#FFD6EC",
    secondary: "#9C27B0",
    secondaryContainer: "#F3E5F5",
    tertiary: "#F06292",
    tertiaryContainer: "#FCE4EC",
    background: "#FFF8FC",
    surface: "#FFFFFF",
    surfaceVariant: "#FFF0F7",
    outline: "#E8B4D0",
    onPrimary: "#FFFFFF",
    onSecondary: "#FFFFFF",
    onBackground: "#1C1B1F",
    onSurface: "#1C1B1F",
    error: "#B00020",
    success: "#4CAF50",
    warning: "#FF9800",
    // Custom
    cardBackground: "#FFFFFF",
    tabBar: "#FFFFFF",
    tabBarActive: "#E91E8C",
    tabBarInactive: "#9E9E9E",
    headerBackground: "#E91E8C",
    headerText: "#FFFFFF",
    incomeColor: "#4CAF50",
    expenseColor: "#E91E8C",
    chartColors: [
      "#E91E8C",
      "#9C27B0",
      "#F06292",
      "#CE93D8",
      "#F48FB1",
      "#AB47BC",
      "#E040FB",
      "#EA80FC",
    ],
    gradientStart: "#E91E8C",
    gradientEnd: "#9C27B0",
  },
  fonts: MD3LightTheme.fonts,
  roundness: 16,
};

// ── Masculine Theme (Dark Slate/Blue) ─────────────────────────────────────────
export const masculineTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#2196F3",
    primaryContainer: "#1565C0",
    secondary: "#00BCD4",
    secondaryContainer: "#006064",
    tertiary: "#4FC3F7",
    tertiaryContainer: "#01579B",
    background: "#0F1923",
    surface: "#1A2533",
    surfaceVariant: "#243447",
    outline: "#37474F",
    onPrimary: "#FFFFFF",
    onSecondary: "#FFFFFF",
    onBackground: "#E0E0E0",
    onSurface: "#E0E0E0",
    error: "#CF6679",
    success: "#4CAF50",
    warning: "#FFA726",
    // Custom
    cardBackground: "#1A2533",
    tabBar: "#1A2533",
    tabBarActive: "#2196F3",
    tabBarInactive: "#607D8B",
    headerBackground: "#1A2533",
    headerText: "#FFFFFF",
    incomeColor: "#4CAF50",
    expenseColor: "#F44336",
    chartColors: [
      "#2196F3",
      "#00BCD4",
      "#4FC3F7",
      "#29B6F6",
      "#0288D1",
      "#0097A7",
      "#00ACC1",
      "#039BE5",
    ],
    gradientStart: "#1565C0",
    gradientEnd: "#0097A7",
  },
  fonts: MD3DarkTheme.fonts,
  roundness: 8,
};

// ── Professional Light Theme (Indigo/Slate) ───────────────────────────────────
export const professionalLightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#4F46E5",
    primaryContainer: "#E0E7FF",
    secondary: "#6366F1",
    secondaryContainer: "#EEF2FF",
    tertiary: "#818CF8",
    tertiaryContainer: "#E0E7FF",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    surfaceVariant: "#F1F5F9",
    outline: "#CBD5E1",
    onPrimary: "#FFFFFF",
    onSecondary: "#FFFFFF",
    onBackground: "#0F172A",
    onSurface: "#0F172A",
    error: "#EF4444",
    success: "#22C55E",
    warning: "#F59E0B",
    // Custom
    cardBackground: "#FFFFFF",
    tabBar: "#FFFFFF",
    tabBarActive: "#4F46E5",
    tabBarInactive: "#94A3B8",
    headerBackground: "#4F46E5",
    headerText: "#FFFFFF",
    incomeColor: "#22C55E",
    expenseColor: "#EF4444",
    chartColors: [
      "#4F46E5",
      "#6366F1",
      "#818CF8",
      "#A5B4FC",
      "#3730A3",
      "#4338CA",
      "#7C3AED",
      "#8B5CF6",
    ],
    gradientStart: "#4F46E5",
    gradientEnd: "#6366F1",
  },
  fonts: MD3LightTheme.fonts,
  roundness: 12,
};

// ── Professional Dark Theme (Indigo/Slate Dark) ───────────────────────────────
export const professionalDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#818CF8",
    primaryContainer: "#3730A3",
    secondary: "#A5B4FC",
    secondaryContainer: "#312E81",
    tertiary: "#C7D2FE",
    tertiaryContainer: "#4338CA",
    background: "#0F172A",
    surface: "#1E293B",
    surfaceVariant: "#334155",
    outline: "#475569",
    onPrimary: "#1E1B4B",
    onSecondary: "#1E1B4B",
    onBackground: "#F1F5F9",
    onSurface: "#F1F5F9",
    error: "#F87171",
    success: "#4ADE80",
    warning: "#FCD34D",
    // Custom
    cardBackground: "#1E293B",
    tabBar: "#1E293B",
    tabBarActive: "#818CF8",
    tabBarInactive: "#64748B",
    headerBackground: "#1E293B",
    headerText: "#F1F5F9",
    incomeColor: "#4ADE80",
    expenseColor: "#F87171",
    chartColors: [
      "#818CF8",
      "#A5B4FC",
      "#6366F1",
      "#C7D2FE",
      "#4F46E5",
      "#7C3AED",
      "#8B5CF6",
      "#DDD6FE",
    ],
    gradientStart: "#3730A3",
    gradientEnd: "#4F46E5",
  },
  fonts: MD3DarkTheme.fonts,
  roundness: 12,
};

export type AppTheme = typeof feminineTheme;
export type ThemeKey =
  | "feminine"
  | "masculine"
  | "professional-light"
  | "professional-dark";

export const getTheme = (theme: ThemeKey | undefined) => {
  switch (theme) {
    case "masculine":
      return masculineTheme;
    case "professional-light":
      return professionalLightTheme;
    case "professional-dark":
      return professionalDarkTheme;
    default:
      return feminineTheme;
  }
};
