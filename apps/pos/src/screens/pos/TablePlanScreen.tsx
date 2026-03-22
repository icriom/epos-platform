import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from "react-native";
import { theme } from "../../theme";
import { tableApi, sessionApi, orderApi } from "../../services/api";
import { useAuthStore } from "../../store/authStore";

interface Table {
  id: string;
  tableNumber: string;
  covers: number;
  shape: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  isActive: boolean;
}

interface TablePlan {
  id: string;
  name: string;
  tables: Table[];
}

export default function TablePlanScreen({ navigation }: any) {
  const [plans, setPlans] = useState<TablePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlan, setActivePlan] = useState(0);
  const { sessionId: paramSessionId } = route.params ?? {};
  const { staff, venueId, sessionId, setSession, logout } = useAuthStore();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const plansResponse = await tableApi.getTablePlan(venueId!);
      setPlans(plansResponse.data.data);

      // Use passed sessionId first, then try fetching current session
      if (paramSessionId) {
        setSession(paramSessionId);
      } else {
        try {
          const sessionResponse = await sessionApi.getCurrentSession(venueId!);
          setSession(sessionResponse.data.data.id);
        } catch {
          // No open session — handled at table press
        }
      }
    } catch (error) {
      Alert.alert("Error", "Could not load table plan");
    } finally {
      setLoading(false);
    }
  };

  const handleTablePress = async (table: Table) => {
    if (!sessionId) {
      Alert.alert(
        "No Open Session",
        "Would you like to open a trading session?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Session",
            onPress: () => openSession(table),
          },
        ],
      );
      return;
    }

    // Navigate to order screen for this table
    navigation.navigate("Order", { table, sessionId });
  };

  const openSession = async (table?: Table) => {
    try {
      const response = await sessionApi.openSession(venueId!, staff!.id, 150);
      setSession(response.data.data.id);
      if (table) {
        navigation.navigate("Order", {
          table,
          sessionId: response.data.data.id,
        });
      }
    } catch (error) {
      Alert.alert("Error", "Could not open session");
    }
  };

  const getTableStatusColour = (table: Table) => {
    // For now all tables are available — will update with live order data
    return theme.colors.tableAvailable;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading floor plan...</Text>
      </View>
    );
  }

  const currentPlan = plans[activePlan];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.venueName}>The Harbour Inn</Text>
          <Text style={styles.sessionStatus}>
            {sessionId ? "● Session Open" : "○ No Session"}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.staffName}>{staff?.displayName}</Text>
          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Section tabs */}
      {plans.length > 1 && (
        <View style={styles.tabs}>
          {plans.map((plan, index) => (
            <TouchableOpacity
              key={plan.id}
              style={[styles.tab, activePlan === index && styles.tabActive]}
              onPress={() => setActivePlan(index)}
            >
              <Text
                style={[
                  styles.tabText,
                  activePlan === index && styles.tabTextActive,
                ]}
              >
                {plan.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Floor plan */}
      <ScrollView style={styles.floorPlanContainer}>
        <View style={styles.floorPlan}>
          {currentPlan?.tables.map((table) => {
            const statusColour = getTableStatusColour(table);
            return (
              <TouchableOpacity
                key={table.id}
                style={[
                  styles.table,
                  {
                    left: table.posX,
                    top: table.posY,
                    width: table.width,
                    height: table.height,
                    borderRadius:
                      table.shape === "ROUND"
                        ? table.width / 2
                        : theme.borderRadius.md,
                    borderColor: statusColour,
                    backgroundColor: `${statusColour}22`,
                  },
                ]}
                onPress={() => handleTablePress(table)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tableNumber, { color: statusColour }]}>
                  {table.tableNumber}
                </Text>
                <Text style={styles.tableCovers}>{table.covers} cvr</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusLegend}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: theme.colors.tableAvailable },
            ]}
          />
          <Text style={styles.legendText}>Available</Text>
        </View>
        <View style={styles.statusLegend}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: theme.colors.tableOccupied },
            ]}
          />
          <Text style={styles.legendText}>Occupied</Text>
        </View>
        <View style={styles.statusLegend}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: theme.colors.tablePayment },
            ]}
          />
          <Text style={styles.legendText}>Payment</Text>
        </View>
        <View style={styles.statusLegend}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: theme.colors.tableReserved },
            ]}
          />
          <Text style={styles.legendText}>Reserved</Text>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerLeft: {},
  venueName: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  sessionStatus: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.success,
    marginTop: 2,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  staffName: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.medium,
  },
  logoutButton: {
    marginTop: 4,
  },
  logoutText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.bold,
  },
  floorPlanContainer: {
    flex: 1,
  },
  floorPlan: {
    width: 800,
    height: 600,
    position: "relative",
    margin: 16,
  },
  table: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
  tableNumber: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  tableCovers: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  statusBar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  statusLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
});
