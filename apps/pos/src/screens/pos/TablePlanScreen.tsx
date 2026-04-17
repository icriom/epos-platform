import React, { useState, useEffect, useCallback } from "react";
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
import { useFocusEffect } from "@react-navigation/native";
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

// Minimal shape for an open order on the floor plan
interface OpenTableOrder {
  id: string;
  tableId: string;
  amountPaid: string;
  total: string;
  orderNumber: number;
}

export default function TablePlanScreen({ route, navigation }: any) {
  const { sessionId: paramSessionId } = route.params ?? {};
  const [plans, setPlans] = useState<TablePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlan, setActivePlan] = useState(0);
  // Map of tableId → OpenTableOrder for quick lookup
  const [openTableOrders, setOpenTableOrders] = useState<
    Record<string, OpenTableOrder>
  >({});
  const { staff, venueId, sessionId, setSession, logout } = useAuthStore();

  // Load the floor plan once on mount
  useEffect(() => {
    loadFloorPlan();
  }, []);

  // Refresh table statuses every time the screen comes into focus
  // (e.g. returning from OrderScreen after storing or paying a table)
  useFocusEffect(
    useCallback(() => {
      refreshTableStatuses();
    }, [venueId]),
  );

  const loadFloorPlan = async () => {
    try {
      const plansResponse = await tableApi.getTablePlan(venueId!);
      setPlans(plansResponse.data.data);

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

  // Fetch all open orders that have a tableId, build a lookup map
  const refreshTableStatuses = async () => {
    if (!venueId) return;
    try {
      const response = await orderApi.getOpenTableOrders(venueId);
      const orders: OpenTableOrder[] = response.data.data ?? [];
      const map: Record<string, OpenTableOrder> = {};
      orders.forEach((o) => {
        if (o.tableId) map[o.tableId] = o;
      });
      setOpenTableOrders(map);
    } catch {
      // Non-fatal — floor plan still shows, just without live status
    }
  };

  const handleTablePress = async (table: Table) => {
    if (!sessionId) {
      Alert.alert(
        "No Open Session",
        "Would you like to open a trading session?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Session", onPress: () => openSession(table) },
        ],
      );
      return;
    }

    const existingOrder = openTableOrders[table.id];

    if (existingOrder) {
      // Table is occupied — reopen the existing order
      navigation.navigate("Order", {
        table,
        sessionId,
        existingOrderId: existingOrder.id,
      });
    } else {
      // Table is empty — open a new order
      navigation.navigate("Order", { table, sessionId });
    }
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

  // Determine the border/fill colour for a table tile
  const getTableStatusColour = (table: Table): string => {
    const openOrder = openTableOrders[table.id];
    if (!openOrder) return theme.colors.tableAvailable;

    const amountPaid = parseFloat(openOrder.amountPaid);
    if (amountPaid > 0) {
      // Partial payment has been taken — show payment colour
      return theme.colors.tablePayment;
    }
    // Order open, nothing paid yet — occupied
    return theme.colors.tableOccupied;
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
          <TouchableOpacity
            onPress={() => navigation.navigate("Order")}
            style={styles.backToTillButton}
          >
            <Text style={styles.backToTillText}>← Till</Text>
          </TouchableOpacity>
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
            const openOrder = openTableOrders[table.id];
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
                {openOrder && (
                  <Text style={[styles.tableOrderBadge, { color: statusColour }]}>
                    #{openOrder.orderNumber}
                  </Text>
                )}
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
          <Text style={styles.legendText}>Part Paid</Text>
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
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  backToTillButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  backToTillText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  staffName: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.medium,
  },
  logoutButton: {},
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
  tableOrderBadge: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
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
