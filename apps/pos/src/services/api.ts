import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";

// ─── Base URL resolution ─────────────────────────────────────────────────────
// Order of precedence:
//   1. Expo `extra.apiBaseUrl` — explicit override (staging, prod, custom LAN)
//   2. Platform auto-detect — emulator vs physical device on Android
//   3. Final fallback for anything unexpected (iOS sim, web, future targets)
//
// Why Constants.isDevice matters: on the Android emulator, "localhost"
// resolves to the emulator itself, not the host PC. 10.0.2.2 is the
// special alias that maps to the host's loopback. On the iMin (a real
// device on LAN), we need the host PC's network IP, which is proxied
// from Windows to WSL on port 3000 via netsh.
//
// To override at build/dev time, set `expo.extra.apiBaseUrl` in app.json,
// or use an env var in app.config.js in future. Leave it null for normal
// daily development — the auto-detect covers emulator + iMin cleanly.

const EMULATOR_URL = "http://10.0.2.2:3000";
const LAN_URL = "http://192.168.199.216:3000";
const FALLBACK_URL = "http://localhost:3000";

function resolveApiBaseUrl(): string {
  const override = Constants.expoConfig?.extra?.apiBaseUrl as
    | string
    | null
    | undefined;

  if (override && typeof override === "string" && override.length > 0) {
    return override;
  }

  if (Platform.OS === "android") {
    // Constants.isDevice is true on physical hardware (iMin), false in emulator.
    return Constants.isDevice ? LAN_URL : EMULATOR_URL;
  }

  return FALLBACK_URL;
}

const API_BASE_URL = resolveApiBaseUrl();

// Surface the resolved URL once at startup so it's obvious which target
// the till is hitting. Helps catch "why is my emulator hitting the iMin
// LAN IP" type confusion at a glance.
// eslint-disable-next-line no-console
console.log(`[api] base URL resolved to ${API_BASE_URL}`);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  return config;
});

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (venueId: string, staffId: string, pin: string) =>
    api.post("/api/auth/login", { venueId, staffId, pin }),
  getStaff: (venueId: string) => api.get(`/api/auth/staff/${venueId}`),
  // Verify a PIN belongs to a manager-role staff at this venue.
  // Used for privileged actions like viewing reports, large discounts,
  // voiding sent items (future), etc.
  verifyManagerPin: (venueId: string, pin: string) =>
    api.post("/api/auth/verify-manager-pin", { venueId, pin }),
};

// ─── Venue ───────────────────────────────────────────────────────────────────
export const venueApi = {
  getVenues: () => api.get("/api/venues"),
  getVenue: (id: string) => api.get(`/api/venues/${id}`),
};

// ─── Menu ────────────────────────────────────────────────────────────────────
export const menuApi = {
  getMenu: (venueId: string) => api.get(`/api/menu/${venueId}`),
};

// ─── Session ─────────────────────────────────────────────────────────────────
export const sessionApi = {
  openSession: (venueId: string, openedBy: string, cashFloat?: number) =>
    api.post("/api/sessions", {
      venueId,
      openedBy,
      cashFloatAmount: cashFloat,
    }),
  getCurrentSession: (venueId: string) =>
    api.get(`/api/sessions/${venueId}/current`),
  closeSession: (
    sessionId: string,
    closedBy: string,
    cashDeclared?: number,
  ) =>
    api.patch(`/api/sessions/${sessionId}/close`, { closedBy, cashDeclared }),
};

// ─── Orders ──────────────────────────────────────────────────────────────────
export const orderApi = {
  createOrder: (data: {
    venueId: string;
    locationId?: string;
    sessionId: string;
    staffId: string;
    tableId?: string;
    covers?: number;
    orderType?: string;
  }) => api.post("/api/orders", data),

  getOrder: (orderId: string) => api.get(`/api/orders/${orderId}`),

  addItem: (
    orderId: string,
    item: {
      menuItemId: string;
      menuItemName: string;
      quantity: number;
      unitPrice: number;
      vatType: string;
      vatRate: number;
      course?: string;
      notes?: string;
    },
  ) => api.post(`/api/orders/${orderId}/items`, item),

  getSessionOrders: (sessionId: string) =>
    api.get(`/api/orders/session/${sessionId}`),

  getOpenOrderForTable: (tableId: string) =>
    api.get(`/api/orders/table/${tableId}/open`),

  getOpenTableOrders: (venueId: string) =>
    api.get(`/api/orders/venue/${venueId}/open-tables`),

  updateStatus: (orderId: string, status: string) =>
    api.patch(`/api/orders/${orderId}/status`, { status }),

  transferOrder: (orderId: string, tableId: string) =>
    api.patch(`/api/orders/${orderId}/transfer`, { tableId }),

  sendToKitchen: (orderId: string, staffId: string) =>
    api.post(`/api/orders/${orderId}/send-to-kitchen`, { staffId }),

  updateItemQuantity: (
    orderId: string,
    itemId: string,
    quantity: number,
    staffId?: string,
  ) =>
    api.patch(`/api/orders/${orderId}/items/${itemId}/quantity`, {
      quantity,
      staffId,
    }),

  voidItem: (orderId: string, itemId: string, staffId?: string, reason?: string) =>
    api.patch(`/api/orders/${orderId}/items/${itemId}/void`, { staffId, reason }),

  recordPayment: (
    orderId: string,
    amount: number,
    method: string,
    amountTendered?: number,
  ) =>
    api.post(`/api/orders/${orderId}/payment`, {
      amount,
      method,
      amountTendered,
    }),

  recordPartialPayment: (
    orderId: string,
    amount: number,
    method: string,
    options?: {
      itemIds?: string[];
      unitSplits?: Array<{ itemId: string; paidQuantity: number }>;
      amountTendered?: number;
    },
  ) =>
    api.post(`/api/orders/${orderId}/partial-payment`, {
      amount,
      method,
      itemIds: options?.itemIds,
      unitSplits: options?.unitSplits,
      amountTendered: options?.amountTendered,
    }),
};

// ─── Tables ──────────────────────────────────────────────────────────────────
export const tableApi = {
  getTablePlan: (venueId: string) => api.get(`/api/tables/plan/${venueId}`),
};

// ─── Reports ─────────────────────────────────────────────────────────────────
// Reports return aggregated read-only data. Every call is scoped to a venue
// and typically a date range. Step 3 fills in the Z-read endpoint.
export const reportsApi = {
  zRead: (
    venueId: string,
    from: string, // ISO date string
    to: string,   // ISO date string
  ) =>
    api.get(`/api/reports/z-read/${venueId}`, {
      params: { from, to },
    }),
};
