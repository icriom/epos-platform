import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Alert,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { theme } from "../../theme";
import { menuApi, orderApi } from "../../services/api";
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
  tableId: string;
  covers: number;
  status: string;
  subtotal: string;
  vatTotal: string;
  total: string;
  items: OrderItem[];
}

export default function OrderScreen({ route, navigation }: any) {
  const { table, sessionId } = route.params;
  const { staff, venueId } = useAuthStore();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [order, setOrder] = useState<Order | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingItem, setAddingItem] = useState<string | null>(null);

  useEffect(() => {
    initialise();
  }, []);

  const initialise = async () => {
    try {
      // Load menu
      const menuResponse = await menuApi.getMenu(venueId!);
      const menus = menuResponse.data.data;
      if (menus.length > 0) {
        const cats = menus[0].categories;
        setCategories(cats);
        if (cats.length > 0) setActiveCategory(cats[0].id);
      }

      // Create order for this table
      const orderResponse = await orderApi.createOrder({
        venueId: venueId!,
        locationId: table.tablePlanId,
        sessionId,
        staffId: staff!.id,
        tableId: table.id,
        covers: table.covers,
        orderType: "TABLE",
      });

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
      await orderApi.addItem(orderId, {
        menuItemId: item.id,
        menuItemName: item.name,
        quantity: 1,
        unitPrice: parseFloat(item.basePrice),
        vatType: item.vatType,
        vatRate: parseFloat(item.vatRate),
        course: item.course,
      });

      // Refresh order
      const orderResponse = await orderApi.getOrder(orderId);
      setOrder(orderResponse.data.data);
    } catch (error) {
      Alert.alert("Error", "Could not add item");
    } finally {
      setAddingItem(null);
    }
  };

  const handleSendToKitchen = async () => {
    if (!order || order.items.length === 0) {
      Alert.alert("No Items", "Add items to the order first");
      return;
    }
    await orderApi.updateStatus(orderId!, "SENT");
    Alert.alert("Sent to Kitchen", `Order #${order.orderNumber} sent`);
    navigation.goBack();
  };

  const activeItems =
    categories.find((c) => c.id === activeCategory)?.items ?? [];
  const availableItems = activeItems.filter((i) => i.isAvailable);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Opening table...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Floor</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.tableTitle}>Table {table.tableNumber}</Text>
          <Text style={styles.tableCovers}>{table.covers} covers</Text>
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
          {/* Category tabs */}
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

          {/* Menu items grid */}
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
            {order?.items.map((item) => (
              <View key={item.id} style={styles.orderItem}>
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
              </View>
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
          </View>
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 80,
  },
  backText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.md,
  },
  headerCenter: {
    alignItems: "center",
  },
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
  body: {
    flex: 1,
    flexDirection: "row",
  },
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
  itemsGrid: {
    padding: 12,
  },
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
  emptyCategory: {
    padding: 40,
    alignItems: "center",
  },
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
  orderItems: {
    flex: 1,
    padding: 12,
  },
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
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
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
  totalValue: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
  },
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
});
