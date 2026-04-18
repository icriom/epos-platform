import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from "react-native";
import { theme } from "../theme";
import { authApi } from "../services/api";
import { useAuthStore } from "../store/authStore";

interface ManagerPinModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onSuccess: (managerStaffId: string, managerName: string) => void;
  onCancel: () => void;
}

// Numpad-driven PIN entry modal. Calls the manager PIN verification
// endpoint on the backend. On success, hands back the manager's staff
// ID and display name so the caller can log who authorised the action.
export default function ManagerPinModal({
  visible,
  title = "Manager Authorisation",
  subtitle = "Enter a manager PIN to continue",
  onSuccess,
  onCancel,
}: ManagerPinModalProps) {
  const { venueId } = useAuthStore();
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the modal opens or closes
  useEffect(() => {
    if (!visible) {
      setPin("");
      setError(null);
      setVerifying(false);
    }
  }, [visible]);

  // Auto-verify once 4 digits are entered
  useEffect(() => {
    if (pin.length === 4 && !verifying) {
      verify();
    }
  }, [pin]);

  const verify = async () => {
    if (!venueId) return;
    setVerifying(true);
    setError(null);
    try {
      const response = await authApi.verifyManagerPin(venueId, pin);
      if (response.data?.success) {
        const manager = response.data.data;
        onSuccess(manager.id, manager.displayName);
        setPin("");
      } else {
        setError("Invalid PIN or not a manager");
        setPin("");
      }
    } catch {
      setError("Invalid PIN or not a manager");
      setPin("");
    } finally {
      setVerifying(false);
    }
  };

  const handleKey = (key: string) => {
    if (verifying) return;
    setError(null);
    if (key === "⌫") {
      setPin((prev) => prev.slice(0, -1));
    } else if (pin.length < 4) {
      setPin((prev) => prev + key);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.pinDisplay}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.pinDot,
                  i < pin.length && styles.pinDotFilled,
                  error !== null && styles.pinDotError,
                ]}
              />
            ))}
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}
          {verifying && (
            <View style={styles.verifyingRow}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={styles.verifyingText}>Verifying...</Text>
            </View>
          )}

          <View style={styles.numpad}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
              <TouchableOpacity
                key={k}
                style={styles.key}
                onPress={() => handleKey(k)}
                disabled={verifying}
              >
                <Text style={styles.keyText}>{k}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.keyEmpty} />
            <TouchableOpacity
              style={styles.key}
              onPress={() => handleKey("0")}
              disabled={verifying}
            >
              <Text style={styles.keyText}>0</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.key}
              onPress={() => handleKey("⌫")}
              disabled={verifying}
            >
              <Text style={styles.keyText}>⌫</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={verifying}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 24,
    width: 360,
    alignItems: "center",
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginBottom: 20,
    textAlign: "center",
  },
  pinDisplay: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: "transparent",
  },
  pinDotFilled: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  pinDotError: {
    borderColor: theme.colors.error,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.fontSize.sm,
    marginBottom: 12,
    textAlign: "center",
  },
  verifyingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  verifyingText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  numpad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    width: 240,
    marginBottom: 20,
  },
  key: {
    width: 72,
    height: 56,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  keyEmpty: {
    width: 72,
    height: 56,
  },
  keyText: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
});
