import axios from "axios";

// Your PC's network IP — iMin connects over LAN
const API_BASE_URL = "http://192.168.199.216:3000";

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

  // Returns the open order for a table, or null if the table is empty.
  // Used when tapping a table on the floor plan.
  getOpenOrderForTable: (tableId: string) =>
    api.get(`/api/orders/table/${tableId}/open`),

  // Returns all open orders that have a tableId set, for floor plan colouring.
  getOpenTableOrders: (venueId: string) =>
    api.get(`/api/orders/venue/${venueId}/open-tables`),

  updateStatus: (orderId: string, status: string) =>
    api.patch(`/api/orders/${orderId}/status`, { status }),

  updateItemQuantity: (orderId: string, itemId: string, quantity: number) =>
    api.patch(`/api/orders/${orderId}/items/${itemId}/quantity`, { quantity }),

  voidItem: (orderId: string, itemId: string) =>
    api.patch(`/api/orders/${orderId}/items/${itemId}/void`),

  // Full payment — closes the order
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

  // Partial payment — order stays OPEN, amountPaid is updated.
  // itemIds is optional: pass item IDs to mark specific items as paid.
  recordPartialPayment: (
    orderId: string,
    amount: number,
    method: string,
    itemIds?: string[],
    amountTendered?: number,
  ) =>
    api.post(`/api/orders/${orderId}/partial-payment`, {
      amount,
      method,
      itemIds,
      amountTendered,
    }),
};

// ─── Tables ──────────────────────────────────────────────────────────────────
export const tableApi = {
  getTablePlan: (venueId: string) => api.get(`/api/tables/plan/${venueId}`),
};
