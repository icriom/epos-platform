import { create } from "zustand";

interface StaffMember {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: string;
  backOfficeAccess: boolean;
}

interface AuthState {
  token: string | null;
  staff: StaffMember | null;
  venueId: string | null;
  sessionId: string | null;
  isAuthenticated: boolean;

  setAuth: (token: string, staff: StaffMember, venueId: string) => void;
  setSession: (sessionId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  staff: null,
  venueId: null,
  sessionId: null,
  isAuthenticated: false,

  setAuth: (token, staff, venueId) =>
    set({ token, staff, venueId, isAuthenticated: true }),

  setSession: (sessionId) => set({ sessionId }),

  logout: () =>
    set({
      token: null,
      staff: null,
      venueId: null,
      sessionId: null,
      isAuthenticated: false,
    }),
}));
