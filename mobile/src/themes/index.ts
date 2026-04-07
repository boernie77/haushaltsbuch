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

// ── Professional Light (Slate + Amber) ───────────────────────────────────────
export const professionalLightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#B45309",
    primaryContainer: "#FEF3C7",
    secondary: "#475569",
    secondaryContainer: "#F1F5F9",
    tertiary: "#D97706",
    tertiaryContainer: "#FEF3C7",
    background: "#F1F5F9",
    surface: "#FFFFFF",
    surfaceVariant: "#E2E8F0",
    outline: "#94A3B8",
    onPrimary: "#FFFFFF",
    onSecondary: "#FFFFFF",
    onBackground: "#0F172A",
    onSurface: "#0F172A",
    error: "#DC2626",
    success: "#16A34A",
    warning: "#D97706",
    // Custom
    cardBackground: "#FFFFFF",
    tabBar: "#FFFFFF",
    tabBarActive: "#B45309",
    tabBarInactive: "#94A3B8",
    headerBackground: "#1E293B",
    headerText: "#FFFFFF",
    incomeColor: "#16A34A",
    expenseColor: "#DC2626",
    chartColors: [
      "#B45309",
      "#D97706",
      "#F59E0B",
      "#FBBF24",
      "#475569",
      "#64748B",
      "#94A3B8",
      "#CBD5E1",
    ],
    gradientStart: "#1E293B",
    gradientEnd: "#334155",
  },
  fonts: MD3LightTheme.fonts,
  roundness: 4,
};

// ── Professional Dark (Gray + Amber) ─────────────────────────────────────────
export const professionalDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#FBBF24",
    primaryContainer: "#92400E",
    secondary: "#94A3B8",
    secondaryContainer: "#1F2937",
    tertiary: "#FCD34D",
    tertiaryContainer: "#78350F",
    background: "#111827",
    surface: "#1F2937",
    surfaceVariant: "#374151",
    outline: "#4B5563",
    onPrimary: "#111827",
    onSecondary: "#F9FAFB",
    onBackground: "#F9FAFB",
    onSurface: "#F9FAFB",
    error: "#F87171",
    success: "#4ADE80",
    warning: "#FCD34D",
    // Custom
    cardBackground: "#1F2937",
    tabBar: "#1F2937",
    tabBarActive: "#FBBF24",
    tabBarInactive: "#6B7280",
    headerBackground: "#111827",
    headerText: "#F9FAFB",
    incomeColor: "#4ADE80",
    expenseColor: "#F87171",
    chartColors: [
      "#FBBF24",
      "#F59E0B",
      "#D97706",
      "#FCD34D",
      "#94A3B8",
      "#6B7280",
      "#4B5563",
      "#374151",
    ],
    gradientStart: "#111827",
    gradientEnd: "#1F2937",
  },
  fonts: MD3DarkTheme.fonts,
  roundness: 4,
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
