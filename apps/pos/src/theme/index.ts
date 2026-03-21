export const theme = {
  colors: {
    // Backgrounds
    background: "#0F1923",
    surface: "#1A2535",
    elevated: "#243040",
    border: "#2D3748",

    // Brand
    primary: "#3B82F6",
    primaryDark: "#1D4ED8",

    // Status
    success: "#22C55E",
    warning: "#F59E0B",
    error: "#EF4444",
    info: "#60A5FA",

    // Table status
    tableAvailable: "#22C55E",
    tableOccupied: "#F59E0B",
    tablePayment: "#EF4444",
    tableReserved: "#60A5FA",

    // Text
    textPrimary: "#F1F5F9",
    textSecondary: "#94A3B8",
    textMuted: "#64748B",

    // Other
    white: "#FFFFFF",
    black: "#000000",
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
    sm: 6,
    md: 10,
    lg: 16,
    xl: 24,
    full: 9999,
  },

  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    xxxl: 40,
  },

  fontWeight: {
    regular: "400" as const,
    medium: "500" as const,
    bold: "700" as const,
  },
};

export type Theme = typeof theme;
