import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Alert,
  Modal,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { theme } from "../../theme";
import { menuApi, orderApi, sessionApi } from "../../services/api";
import { useAuthStore } from "../../store/authStore";

interface MenuItem {
  id: string;
  name: string;
  description: string;
  basePrice: string;
  vatType: string;
  vatRate: string;
  course: string;
  kitchenStation: string;
  isAvailable: boolean;
  allergens: Array<{ allergen: string }>;
}

interface MenuCategory {
  id: string;
  name: string;
  colour: string;
  items: MenuItem[];
}

interface OrderItem {
  id: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  course: string;
  notes: string;
  status: string;
}

interface Order {
  id: string;
  orderNumber: number;
  tableId: string | null;
  covers: number;
  status: string;
  subtotal: string;
  vatTotal: string;
  total: string;
  items: OrderItem[];
}

export default function OrderScreen({ route, navigation }: any) {
  const { table, sessionId: paramSessionId } = route.params ?? {};
  const { staff, venueId } = useAuthStore();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [order, setOrder] = useState<Order | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(
    paramSessionId ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [addingItem, setAddingItem] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    initialise();
  }, []);

  const initialise = async () => {
    try {
      const menuResponse = await menuApi.getMenu(venueId!);
      const menus = menuResponse.data.data;
      if (menus.length > 0) {
        const cats = menus[0].categories;
        setCategories(cats);
        if (cats.length > 0) setActiveCategory(cats[0].id);
      }

      let resolvedSessionId = paramSessionId;
      if (!resolvedSessionId) {
        const sessionResponse = await sessionApi.getCurrentSession(venueId!);
        resolvedSessionId = sessionResponse.data.data.id;
        setSessionId(resolvedSessionId);
      }

      const orderPayload = table
        ? {
            venueId: venueId!,
            sessionId: resolvedSessionId,
            staffId: staff!.id,
            tableId: table.id,
            covers: table.covers,
            orderType: "TABLE",
          }
        : {
            venueId: venueId!,
            sessionId: resolvedSessionId,
            staffId: staff!.id,
            orderType: "WALK_IN",
          };

      const orderResponse = await orderApi.createOrder(orderPayload);
      const newOrder = orderResponse.data.data;
      setOrderId(newOrder.id);
      setOrder(newOrder);
    } catch (error) {
      Alert.alert("Error", "Could not initialise order");
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (item: MenuItem) => {
    if (!orderId) return;
    setAddingItem(item.id);
    try {
      const existing = order?.items?.find(
        (i) => i.menuItemId === item.id && i.status !== "VOID",
      );

      if (existing) {
        const response = await orderApi.updateItemQuantity(
          orderId,
          existing.id,
          existing.quantity + 1,
        );
        setOrder(response.data.data);
      } else {
        await orderApi.addItem(orderId, {
          menuItemId: item.id,
          menuItemName: item.name,
          quantity: 1,
          unitPrice: parseFloat(item.basePrice),
          vatType: item.vatType,
          vatRate: parseFloat(item.vatRate),
          course: item.course,
        });
        const orderResponse = await orderApi.getOrder(orderId);
        setOrder(orderResponse.data.data);
      }
    } catch (error) {
      Alert.alert("Error", "Could not add item");
    } finally {
      setAddingItem(null);
    }
  };

  const handleItemPress = (item: OrderItem) => {
    setSelectedItem(item);
    setItemModalVisible(true);
  };

  const handleAddOne = async () => {
    if (!selectedItem || !orderId) return;
    setActionLoading(true);
    try {
      const response = await orderApi.updateItemQuantity(
        orderId,
        selectedItem.id,
        selectedItem.quantity + 1,
      );
      setOrder(response.data.data);
      setItemModalVisible(false);
    } catch (error) {
      Alert.alert("Error", "Could not update item");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveOne = async () => {
    if (!selectedItem || !orderId) return;
    setActionLoading(true);
    try {
      const response = await orderApi.updateItemQuantity(
        orderId,
        selectedItem.id,
        selectedItem.quantity - 1,
      );
      setOrder(response.data.data);
      setItemModalVisible(false);
    } catch (error) {
      Alert.alert("Error", "Could not update item");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVoidItem = async () => {
    if (!selectedItem || !orderId) return;
    setActionLoading(true);
    try {
      const response = await orderApi.voidItem(orderId, selectedItem.id);
      setOrder(response.data.data);
      setItemModalVisible(false);
    } catch (error) {
      Alert.alert("Error", "Could not void item");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSale = () => {
    Alert.alert(
      "Cancel Sale",
      "Are you sure you want to cancel this sale? All items will be removed.",
      [
        { text: "Keep Sale", style: "cancel" },
        {
          text: "Cancel Sale",
          style: "destructive",
          onPress: async () => {
            try {
              await orderApi.updateStatus(orderId!, "VOID");
              navigation.replace("Order");
            } catch (error) {
              Alert.alert("Error", "Could not cancel sale");
            }
          },
        },
      ],
    );
  };

  const handleSendToKitchen = async () => {
    if (!order || !order.items || order.items.length === 0) {
      Alert.alert("No Items", "Add items to the order first");
      return;
    }
    await orderApi.updateStatus(orderId!, "SENT");
    Alert.alert("Sent to Kitchen", `Order #${order.orderNumber} sent`);
    navigation.replace("Order");
  };

  const handleOpenTables = () => {
    navigation.navigate("TablePlan", { sessionId });
  };

  const orderTitle = table ? `Table ${table.tableNumber}` : "Walk-in";
  const orderSubtitle = table ? `${table.covers} covers` : "No table assigned";
  const activeItems =
    categories.find((c) => c.id === activeCategory)?.items ?? [];
  const availableItems = activeItems.filter((i) => i.isAvailable);
  const hasItems = (order?.items ?? []).length > 0;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>
          {table ? "Opening table..." : "Opening till..."}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleOpenTables}
          style={styles.tablesButton}
        >
          <Text style={styles.tablesButtonText}>⊞ Tables</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.tableTitle}>{orderTitle}</Text>
          <Text style={styles.tableCovers}>{orderSubtitle}</Text>
        </View>
        <TouchableOpacity
          style={styles.sendButton}
          onPress={handleSendToKitchen}
        >
          <Text style={styles.sendButtonText}>Send to Kitchen</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* Left — Menu */}
        <View style={styles.menuPanel}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryTabs}
          >
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryTab,
                  activeCategory === cat.id && {
                    borderBottomColor: cat.colour || theme.colors.primary,
                    borderBottomWidth: 3,
                  },
                ]}
                onPress={() => setActiveCategory(cat.id)}
              >
                <Text
                  style={[
                    styles.categoryTabText,
                    activeCategory === cat.id && {
                      color: theme.colors.textPrimary,
                    },
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={availableItems}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={styles.itemsGrid}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleAddItem(item)}
                activeOpacity={0.7}
                disabled={addingItem === item.id}
              >
                {addingItem === item.id ? (
                  <ActivityIndicator color={theme.colors.primary} />
                ) : (
                  <>
                    <Text style={styles.menuItemName}>{item.name}</Text>
                    {item.allergens.length > 0 && (
                      <Text style={styles.menuItemAllergens}>
                        ⚠{" "}
                        {item.allergens
                          .map((a) =>
                            a.allergen.replace(/_/g, " ").toLowerCase(),
                          )
                          .join(", ")}
                      </Text>
                    )}
                    <Text style={styles.menuItemPrice}>
                      £{parseFloat(item.basePrice).toFixed(2)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyCategory}>
                <Text style={styles.emptyCategoryText}>No items available</Text>
              </View>
            }
          />
        </View>

        {/* Right — Order */}
        <View style={styles.orderPanel}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderTitle}>Order #{order?.orderNumber}</Text>
            <Text style={styles.orderItemCount}>
              {(order?.items ?? []).length} items
            </Text>
          </View>

          <ScrollView style={styles.orderItems}>
            {(order?.items ?? []).length === 0 && (
              <Text style={styles.emptyOrder}>No items yet</Text>
            )}
            {(order?.items ?? []).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.orderItem}
                onPress={() => handleItemPress(item)}
                activeOpacity={0.7}
              >
                <View style={styles.orderItemLeft}>
                  <Text style={styles.orderItemQty}>{item.quantity}x</Text>
                  <View>
                    <Text style={styles.orderItemName}>
                      {item.menuItemName}
                    </Text>
                    {item.notes ? (
                      <Text style={styles.orderItemNotes}>{item.notes}</Text>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.orderItemPrice}>
                  £{parseFloat(item.lineTotal).toFixed(2)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Totals */}
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>
                £{parseFloat(order?.subtotal ?? "0").toFixed(2)}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>VAT</Text>
              <Text style={styles.totalValue}>
                £{parseFloat(order?.vatTotal ?? "0").toFixed(2)}
              </Text>
            </View>
            <View style={[styles.totalRow, styles.totalRowFinal]}>
              <Text style={styles.totalLabelFinal}>Total</Text>
              <Text style={styles.totalValueFinal}>
                £{parseFloat(order?.total ?? "0").toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.cancelButton,
                !hasItems && styles.cancelButtonDisabled,
              ]}
              onPress={handleCancelSale}
              disabled={!hasItems}
            >
              <Text style={styles.cancelButtonText}>✕ Cancel Sale</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Item Action Modal */}
      <Modal
        visible={itemModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setItemModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setItemModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedItem?.menuItemName}</Text>
            <Text style={styles.modalSubtitle}>
              {selectedItem?.quantity}x · £
              {parseFloat(selectedItem?.lineTotal ?? "0").toFixed(2)}
            </Text>
            {actionLoading ? (
              <ActivityIndicator
                color={theme.colors.primary}
                style={{ marginVertical: 24 }}
              />
            ) : (
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonAdd]}
                  onPress={handleAddOne}
                >
                  <Text style={styles.modalButtonIcon}>➕</Text>
                  <Text style={styles.modalButtonText}>Add One</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonRemove]}
                  onPress={handleRemoveOne}
                >
                  <Text style={styles.modalButtonIcon}>➖</Text>
                  <Text style={styles.modalButtonText}>Remove One</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonVoid]}
                  onPress={handleVoidItem}
                >
                  <Text style={styles.modalButtonIcon}>🗑</Text>
                  <Text
                    style={[styles.modalButtonText, styles.modalButtonVoidText]}
                  >
                    Void Item
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tablesButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 100,
    alignItems: "center",
  },
  tablesButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  headerCenter: { alignItems: "center" },
  tableTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  tableCovers: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  sendButton: {
    backgroundColor: theme.colors.success,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: theme.borderRadius.md,
    minWidth: 140,
    alignItems: "center",
  },
  sendButtonText: {
    color: theme.colors.white,
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.md,
  },
  body: { flex: 1, flexDirection: "row" },
  menuPanel: {
    flex: 3,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  categoryTabs: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 8,
    maxHeight: 52,
    flexGrow: 0,
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  categoryTabText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.medium,
  },
  itemsGrid: { padding: 12 },
  menuItem: {
    flex: 1,
    margin: 6,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    minHeight: 90,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  menuItemName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  menuItemAllergens: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.warning,
    marginBottom: 4,
  },
  menuItemPrice: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
  },
  emptyCategory: { padding: 40, alignItems: "center" },
  emptyCategoryText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
  },
  orderPanel: {
    flex: 1.2,
    backgroundColor: theme.colors.surface,
    flexDirection: "column",
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  orderTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  orderItemCount: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  orderItems: { flex: 1, padding: 12 },
  emptyOrder: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    textAlign: "center",
    marginTop: 40,
  },
  orderItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  orderItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  orderItemQty: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
    minWidth: 28,
  },
  orderItemName: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
  },
  orderItemNotes: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  orderItemPrice: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  totals: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 8,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalRowFinal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  totalLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  totalValue: { fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  totalLabelFinal: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  totalValueFinal: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.error,
    alignItems: "center",
  },
  cancelButtonDisabled: { borderColor: theme.colors.border, opacity: 0.4 },
  cancelButtonText: {
    color: theme.colors.error,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 24,
    width: 320,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginBottom: 24,
  },
  modalActions: { width: "100%", gap: 10 },
  modalButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  modalButtonAdd: {
    borderColor: theme.colors.success,
    backgroundColor: `${theme.colors.success}15`,
  },
  modalButtonRemove: {
    borderColor: theme.colors.primary,
    backgroundColor: `${theme.colors.primary}15`,
  },
  modalButtonVoid: {
    borderColor: theme.colors.error,
    backgroundColor: `${theme.colors.error}15`,
  },
  modalButtonIcon: { fontSize: 20 },
  modalButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
  modalButtonVoidText: { color: theme.colors.error },
});
