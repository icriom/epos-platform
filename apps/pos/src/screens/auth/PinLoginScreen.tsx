import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { theme } from "../../theme";
import { authApi } from "../../services/api";
import { useAuthStore } from "../../store/authStore";

// Hardcoded for now — will come from device config in production
const VENUE_ID = "07c60d82-a7dd-4331-8ae8-8d5dd2ff51ee";

interface StaffProfile {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: { name: string } | null;
}

export default function PinLoginScreen({ navigation }: any) {
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffProfile | null>(null);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const { setAuth } = useAuthStore();

  useEffect(() => {
    loadStaff();
  }, []);

  const loadStaff = async () => {
    try {
      const response = await authApi.getStaff(VENUE_ID);
      setStaff(response.data.data);
    } catch (error) {
      Alert.alert("Error", "Could not load staff profiles");
    } finally {
      setLoading(false);
    }
  };

  const handlePinPress = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        handleLogin(newPin);
      }
    }
  };

  const handleLogin = async (enteredPin: string) => {
    if (!selectedStaff) return;
    setLoggingIn(true);
    try {
      const response = await authApi.login(
        VENUE_ID,
        selectedStaff.id,
        enteredPin,
      );
      const { token, staff: staffData } = response.data.data;
      setAuth(token, staffData, VENUE_ID);
      navigation.replace("TablePlan");
    } catch (error) {
      setPin("");
      Alert.alert("Invalid PIN", "Please try again");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleStaffSelect = (member: StaffProfile) => {
    setSelectedStaff(member);
    setPin("");
  };

  const handleBack = () => {
    setSelectedStaff(null);
    setPin("");
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Staff selection screen
  if (!selectedStaff) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Who are you?</Text>
          <Text style={styles.subtitle}>Select your profile to continue</Text>
        </View>
        <FlatList
          data={staff}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.staffGrid}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.staffCard}
              onPress={() => handleStaffSelect(item)}
              activeOpacity={0.7}
            >
              <View style={styles.staffAvatar}>
                <Text style={styles.staffInitial}>
                  {item.firstName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.staffName}>{item.displayName}</Text>
              <Text style={styles.staffRole}>{item.role?.name ?? "Staff"}</Text>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    );
  }

  // PIN entry screen
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.pinContainer}>
        {/* Header */}
        <View style={styles.pinHeader}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.pinAvatar}>
            <Text style={styles.pinAvatarText}>
              {selectedStaff.firstName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.pinName}>{selectedStaff.displayName}</Text>
          <Text style={styles.pinPrompt}>Enter your PIN</Text>
        </View>

        {/* PIN dots */}
        <View style={styles.pinDots}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[styles.pinDot, i < pin.length && styles.pinDotFilled]}
            />
          ))}
        </View>

        {/* Loading indicator */}
        {loggingIn && (
          <ActivityIndicator
            size="small"
            color={theme.colors.primary}
            style={{ marginBottom: 16 }}
          />
        )}

        {/* PIN keypad */}
        <View style={styles.keypad}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map(
            (key, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.keypadButton,
                  key === "" && styles.keypadButtonEmpty,
                ]}
                onPress={() => {
                  if (key === "⌫") handleDelete();
                  else if (key !== "") handlePinPress(key);
                }}
                activeOpacity={0.6}
                disabled={key === ""}
              >
                <Text style={styles.keypadText}>{key}</Text>
              </TouchableOpacity>
            ),
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    marginTop: 12,
    fontSize: theme.fontSize.md,
  },
  header: {
    paddingTop: 48,
    paddingBottom: 32,
    alignItems: "center",
  },
  title: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  staffGrid: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  staffCard: {
    flex: 1,
    margin: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  staffAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  staffInitial: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  staffName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  staffRole: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  pinContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  pinHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  backButtonText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.md,
  },
  pinAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  pinAvatarText: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  pinName: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  pinPrompt: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  pinDots: {
    flexDirection: "row",
    marginBottom: 32,
    gap: 16,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.textSecondary,
    backgroundColor: "transparent",
  },
  pinDotFilled: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 280,
    justifyContent: "center",
    gap: 12,
  },
  keypadButton: {
    width: 80,
    height: 80,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  keypadButtonEmpty: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  keypadText: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
});
