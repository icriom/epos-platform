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

interface OpenTableOrder {
  id: string;
  tableId: string;
  amountPaid: string;
  total: string;
  orderNumber: number;
}

export default function TablePlanScreen({ route, navigation }: any) {
  const {
    sessionId: paramSessionId,
    transferOrderId,
    transferFromTableNumber,
  } = route.params ?? {};

  const isTransferMode = !!transferOrderId;

  const [plans, setPlans] = useState<TablePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlan, setActivePlan] = useState(0);
  const [openTableOrders, setOpenTableOrders] = useState<
    Record<string, OpenTableOrder>
  >({});
  const [transferring, setTransferring] = useState(false);
  const { staff, venueId, sessionId, setSession, logout } = useAuthStore();

  useEffect(() => {
    loadFloorPlan();
  }, []);

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
      // Non-fatal
    }
  };

  const handleNormalTablePress = async (table: Table) => {
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
      navigation.navigate("Order", {
        table,
        sessionId,
        existingOrderId: existingOrder.id,
      });
    } else {
      navigation.navigate("Order", { table, sessionId });
    }
  };

  const handleTransferTablePress = async (table: Table) => {
    if (openTableOrders[table.id]) {
      Alert.alert(
        "Table Occupied",
        `Table ${table.tableNumber} already has an open order. Merge tables is coming in a future update.`,
      );
      return;
    }

    Alert.alert(
      "Transfer Order",
      `Transfer from Table ${transferFromTableNumber} to Table ${table.tableNumber}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          onPress: async () => {
            setTransferring(true);
            try {
              await orderApi.transferOrder(transferOrderId, table.id);
              await refreshTableStatuses();
              navigation.navigate("Order", {
                table,
                sessionId,
                existingOrderId: transferOrderId,
              });
            } catch (error: any) {
              const apiError = error?.response?.data;
              if (apiError?.code === "TABLE_OCCUPIED") {
                Alert.alert(
                  "Table Occupied",
                  "Another device just opened an order on that table. Try a different one.",
                );
              } else {
                Alert.alert("Error", "Could not transfer order");
              }
            } finally {
              setTransferring(false);
            }
          },
        },
      ],
    );
  };

  const handleTablePress = (table: Table) => {
    if (isTransferMode) {
      handleTransferTablePress(table);
    } else {
      handleNormalTablePress(table);
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

  const getTableStatusColour = (table: Table): string => {
    const openOrder = openTableOrders[table.id];
    if (!openOrder) return theme.colors.tableAvailable;

    const amountPaid = parseFloat(openOrder.amountPaid);
    if (amountPaid > 0) {
      return theme.colors.tablePayment;
    }
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
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.venueName}>
            {isTransferMode
              ? `Transfer Table ${transferFromTableNumber}`
              : "The Harbour Inn"}
          </Text>
          <Text
            style={[
              styles.sessionStatus,
              isTransferMode && { color: theme.colors.warning },
            ]}
          >
            {isTransferMode
              ? "Select an empty table"
              : sessionId
              ? "● Session Open"
              : "○ No Session"}
          </Text>
        </View>

        <View style={styles.headerRight}>
          {isTransferMode ? (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.cancelTransferButton}
            >
              <Text style={styles.cancelTransferText}>Cancel Transfer</Text>
            </TouchableOpacity>
          ) : (
            <>
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
            </>
          )}
        </View>
      </View>

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

      {isTransferMode && (
        <View style={styles.transferBanner}>
          <Text style={styles.transferBannerText}>
            Tap an empty (green) table to transfer the order. Occupied tables
            are shown but cannot be selected.
          </Text>
        </View>
      )}

      <ScrollView style={styles.floorPlanContainer}>
        <View style={styles.floorPlan}>
          {currentPlan?.tables.map((table) => {
            const statusColour = getTableStatusColour(table);
            const openOrder = openTableOrders[table.id];
            const isOccupied = !!openOrder;
            const dimmed = isTransferMode && isOccupied;
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
                    opacity: dimmed ? 0.35 : 1,
                  },
                ]}
                onPress={() => handleTablePress(table)}
                activeOpacity={0.7}
                disabled={transferring}
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

      {transferring && (
        <View style={styles.transferOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.transferOverlayText}>Transferring...</Text>
        </View>
      )}

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
  cancelTransferButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.error,
    backgroundColor: `${theme.colors.error}15`,
  },
  cancelTransferText: {
    color: theme.colors.error,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
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
  transferBanner: {
    padding: 12,
    backgroundColor: `${theme.colors.warning}20`,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.warning,
  },
  transferBannerText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
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
  transferOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  transferOverlayText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
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
