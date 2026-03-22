import axios from "axios";

const API_BASE_URL = "http://10.0.2.2:3000";
// 10.0.2.2 is the Android emulator's address for localhost
// When testing on real iMin hardware, change to your PC's IP address

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add token to every request if available
api.interceptors.request.use((config) => {
  return config;
});

// Auth endpoints
export const authApi = {
  login: (venueId: string, staffId: string, pin: string) =>
    api.post("/api/auth/login", { venueId, staffId, pin }),

  getStaff: (venueId: string) => api.get(`/api/auth/staff/${venueId}`),
};

// Venue endpoints
export const venueApi = {
  getVenues: () => api.get("/api/venues"),
  getVenue: (id: string) => api.get(`/api/venues/${id}`),
};

// Menu endpoints
export const menuApi = {
  getMenu: (venueId: string) => api.get(`/api/menu/${venueId}`),
};

// Session endpoints
export const sessionApi = {
  openSession: (venueId: string, openedBy: string, cashFloat?: number) =>
    api.post("/api/sessions", {
      venueId,
      openedBy,
      cashFloatAmount: cashFloat,
    }),

  getCurrentSession: (venueId: string) =>
    api.get(`/api/sessions/${venueId}/current`),

  closeSession: (sessionId: string, closedBy: string, cashDeclared?: number) =>
    api.patch(`/api/sessions/${sessionId}/close`, { closedBy, cashDeclared }),
};

// Order endpoints
export const orderApi = {
  createOrder: (data: {
    venueId: string;
    locationId: string;
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
  updateStatus: (orderId: string, status: string) =>
    api.patch(`/api/orders/${orderId}/status`, { status }),
  updateItemQuantity: (orderId: string, itemId: string, quantity: number) =>
    api.patch(`/api/orders/${orderId}/items/${itemId}/quantity`, { quantity }),
  voidItem: (orderId: string, itemId: string) =>
    api.patch(`/api/orders/${orderId}/items/${itemId}/void`),
};

// Table endpoints
export const tableApi = {
  getTablePlan: (venueId: string) => api.get(`/api/tables/plan/${venueId}`),
};
