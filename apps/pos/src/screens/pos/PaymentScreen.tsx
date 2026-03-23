import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { theme } from "../../theme";
import { orderApi } from "../../services/api";

interface OrderItem {
  id: string;
  menuItemName: string;
  quantity: number;
  lineTotal: string;
}

interface Order {
  id: string;
  orderNumber: number;
  subtotal: string;
  vatTotal: string;
  total: string;
  items: OrderItem[];
}

type Screen =
  | "METHOD_SELECT" // Choose Cash / Card / Split
  | "CASH" // Cash numpad
  | "SPLIT_SETUP" // Choose number of ways
  | "SPLIT_COLLECT" // Collect each portion (Cash or Card sub-screen)
  | "SPLIT_PORTION_CASH" // Cash numpad for a split portion
  | "SUCCESS"; // Payment complete

export default function PaymentScreen({ route, navigation }: any) {
  const { order } = route.params as { order: Order };
  const total = parseFloat(order.total);

  const [screen, setScreen] = useState<Screen>("METHOD_SELECT");
  const [tendered, setTendered] = useState("");
  const [splitWays, setSplitWays] = useState(2);
  const [splitPortionsPaid, setSplitPortionsPaid] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [paidMethod, setPaidMethod] = useState("");
  const [changeAmount, setChangeAmount] = useState(0);

  const tenderedAmount = parseFloat(tendered) || 0;
  const change = tenderedAmount - total;
  const portionAmount = total / splitWays;
  const currentPortion = splitPortionsPaid + 1;
  const portionChange = tenderedAmount - portionAmount;

  // Quick amounts for full cash payment
  const quickAmounts = [
    Math.ceil(total),
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
  ]
    .filter((v, i, a) => a.indexOf(v) === i && v >= total)
    .slice(0, 4);

  // Quick amounts for split portion
  const portionQuickAmounts = [
    Math.ceil(portionAmount),
    Math.ceil(portionAmount / 5) * 5,
    Math.ceil(portionAmount / 10) * 10,
    Math.ceil(portionAmount / 20) * 20,
  ]
    .filter((v, i, a) => a.indexOf(v) === i && v >= portionAmount)
    .slice(0, 4);

  // Auto-confirm cash when tendered >= total (full payment)
  useEffect(() => {
    if (screen !== "CASH") return;
    if (tenderedAmount >= total && total > 0 && !processing) {
      handleConfirmPayment("CASH", total, tenderedAmount);
    }
  }, [tenderedAmount, screen]);

  // Auto-confirm split portion cash when tendered >= portionAmount
  useEffect(() => {
    if (screen !== "SPLIT_PORTION_CASH") return;
    if (tenderedAmount >= portionAmount && portionAmount > 0 && !processing) {
      handleSplitPortionPaid("CASH", tenderedAmount);
    }
  }, [tenderedAmount, screen]);

  // Countdown after full payment
  useEffect(() => {
    if (screen !== "SUCCESS") return;
    if (countdown <= 0) {
      navigation.replace("Order");
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [screen, countdown]);

  const handleNumpad = (key: string) => {
    if (key === "⌫") {
      setTendered((prev) => prev.slice(0, -1));
    } else if (key === ".") {
      if (!tendered.includes(".")) setTendered((prev) => prev + ".");
    } else {
      const parts = tendered.split(".");
      if (parts[1] && parts[1].length >= 2) return;
      setTendered((prev) => prev + key);
    }
  };

  const handleConfirmPayment = async (
    method: string,
    amount: number,
    amountTendered?: number,
  ) => {
    if (processing) return;
    setProcessing(true);
    try {
      await orderApi.recordPayment(order.id, amount, method, amountTendered);
      setPaidMethod(method);
      setChangeAmount(amountTendered ? amountTendered - amount : 0);
      setScreen("SUCCESS");
    } catch (error) {
      Alert.alert("Error", "Could not process payment");
    } finally {
      setProcessing(false);
    }
  };

  const handleSplitPortionPaid = async (
    method: string,
    amountTendered?: number,
  ) => {
    if (processing) return;
    setProcessing(true);
    try {
      const newPortionsPaid = splitPortionsPaid + 1;

      if (newPortionsPaid >= splitWays) {
        // Last portion — record full payment and go to success
        await orderApi.recordPayment(
          order.id,
          total,
          `SPLIT_${method}`,
          amountTendered,
        );
        setPaidMethod(`SPLIT (${splitWays} ways)`);
        setChangeAmount(amountTendered ? amountTendered - portionAmount : 0);
        setScreen("SUCCESS");
      } else {
        // More portions to collect
        setSplitPortionsPaid(newPortionsPaid);
        setTendered("");
        setScreen("SPLIT_COLLECT");
      }
    } catch (error) {
      Alert.alert("Error", "Could not process payment");
    } finally {
      setProcessing(false);
    }
  };

  // ── Success screen ──
  if (screen === "SUCCESS") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successScreen}>
          <Text style={styles.successTick}>✓</Text>
          <Text style={styles.successTitle}>Payment Complete</Text>
          <Text style={styles.successMethod}>{paidMethod}</Text>
          <Text style={styles.successAmount}>£{total.toFixed(2)}</Text>
          {(paidMethod === "CASH" || paidMethod.startsWith("SPLIT")) &&
            changeAmount > 0 && (
              <View style={styles.successChange}>
                <Text style={styles.successChangeLabel}>Change Due</Text>
                <Text style={styles.successChangeAmount}>
                  £{changeAmount.toFixed(2)}
                </Text>
              </View>
            )}
          <Text style={styles.successCountdown}>
            Returning to till in {countdown}s...
          </Text>
          <TouchableOpacity
            style={styles.successButton}
            onPress={() => navigation.replace("Order")}
          >
            <Text style={styles.successButtonText}>New Sale Now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (processing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Processing payment...</Text>
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
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Payment — Order #{order.orderNumber}
        </Text>
        <View style={{ minWidth: 80 }} />
      </View>

      <View style={styles.body}>
        {/* Left — Order summary */}
        <View style={styles.summaryPanel}>
          <Text style={styles.panelTitle}>Order Summary</Text>
          <ScrollView style={styles.itemList}>
            {order.items.map((item) => (
              <View key={item.id} style={styles.summaryItem}>
                <Text style={styles.summaryItemQty}>{item.quantity}x</Text>
                <Text style={styles.summaryItemName}>{item.menuItemName}</Text>
                <Text style={styles.summaryItemPrice}>
                  £{parseFloat(item.lineTotal).toFixed(2)}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.summaryTotals}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>
                £{parseFloat(order.subtotal).toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>VAT</Text>
              <Text style={styles.summaryValue}>
                £{parseFloat(order.vatTotal).toFixed(2)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <Text style={styles.summaryTotalLabel}>Total</Text>
              <Text style={styles.summaryTotalValue}>£{total.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Right — Payment flow */}
        <View style={styles.paymentPanel}>
          {/* ── Method selector ── */}
          {screen === "METHOD_SELECT" && (
            <View style={styles.methodSelect}>
              <Text style={styles.panelTitle}>Select Payment Method</Text>
              <View style={styles.methodButtons}>
                <TouchableOpacity
                  style={[styles.methodButton, styles.methodCash]}
                  onPress={() => {
                    setTendered("");
                    setScreen("CASH");
                  }}
                >
                  <Text style={styles.methodIcon}>💵</Text>
                  <Text style={styles.methodLabel}>Cash</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodButton, styles.methodCard]}
                  onPress={() => handleConfirmPayment("CARD", total)}
                >
                  <Text style={styles.methodIcon}>💳</Text>
                  <Text style={styles.methodLabel}>Card</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodButton, styles.methodSplit]}
                  onPress={() => setScreen("SPLIT_SETUP")}
                >
                  <Text style={styles.methodIcon}>✂️</Text>
                  <Text style={styles.methodLabel}>Split</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Cash flow ── */}
          {screen === "CASH" && (
            <View style={styles.cashFlow}>
              <View style={styles.flowHeader}>
                <TouchableOpacity
                  onPress={() => {
                    setScreen("METHOD_SELECT");
                    setTendered("");
                  }}
                >
                  <Text style={styles.changeMethod}>← Change</Text>
                </TouchableOpacity>
                <Text style={styles.panelTitle}>Cash Payment</Text>
              </View>
              <Text style={styles.totalDue}>£{total.toFixed(2)}</Text>
              <Text style={styles.totalDueLabel}>
                Tap a quick amount or enter below
              </Text>
              <View style={styles.quickAmounts}>
                {quickAmounts.map((a) => (
                  <TouchableOpacity
                    key={a}
                    style={styles.quickAmount}
                    onPress={() => setTendered(a.toFixed(2))}
                  >
                    <Text style={styles.quickAmountText}>£{a.toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.tenderedDisplay}>
                <Text style={styles.tenderedLabel}>Tendered</Text>
                <Text style={styles.tenderedValue}>£{tendered || "0.00"}</Text>
              </View>
              {tenderedAmount > 0 && (
                <View
                  style={[
                    styles.changeDisplay,
                    change >= 0 ? styles.changePositive : styles.changeNegative,
                  ]}
                >
                  <Text style={styles.changeLabel}>
                    {change >= 0 ? "Change" : "Short by"}
                  </Text>
                  <Text
                    style={[
                      styles.changeValue,
                      change < 0 && { color: theme.colors.error },
                    ]}
                  >
                    £{Math.abs(change).toFixed(2)}
                  </Text>
                </View>
              )}
              <View style={styles.numpad}>
                {[
                  "1",
                  "2",
                  "3",
                  "4",
                  "5",
                  "6",
                  "7",
                  "8",
                  "9",
                  ".",
                  "0",
                  "⌫",
                ].map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={styles.numpadKey}
                    onPress={() => handleNumpad(key)}
                  >
                    <Text style={styles.numpadKeyText}>{key}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── Split setup ── */}
          {screen === "SPLIT_SETUP" && (
            <View style={styles.splitSetup}>
              <View style={styles.flowHeader}>
                <TouchableOpacity onPress={() => setScreen("METHOD_SELECT")}>
                  <Text style={styles.changeMethod}>← Change</Text>
                </TouchableOpacity>
                <Text style={styles.panelTitle}>Split Payment</Text>
              </View>
              <Text style={styles.totalDue}>£{total.toFixed(2)}</Text>
              <Text style={styles.totalDueLabel}>Split equally between</Text>
              <View style={styles.splitControls}>
                <TouchableOpacity
                  style={styles.splitButton}
                  onPress={() => setSplitWays((prev) => Math.max(2, prev - 1))}
                >
                  <Text style={styles.splitButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.splitWaysText}>{splitWays}</Text>
                <TouchableOpacity
                  style={styles.splitButton}
                  onPress={() => setSplitWays((prev) => prev + 1)}
                >
                  <Text style={styles.splitButtonText}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.splitPerPerson}>
                £{portionAmount.toFixed(2)} per person
              </Text>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => {
                  setSplitPortionsPaid(0);
                  setTendered("");
                  setScreen("SPLIT_COLLECT");
                }}
              >
                <Text style={styles.confirmButtonText}>Start Collecting</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Split collect — choose method for this portion ── */}
          {screen === "SPLIT_COLLECT" && (
            <View style={styles.splitCollect}>
              <View style={styles.portionBadge}>
                <Text style={styles.portionBadgeText}>
                  {currentPortion} of {splitWays}
                </Text>
              </View>
              <Text style={styles.totalDue}>£{portionAmount.toFixed(2)}</Text>
              <Text style={styles.totalDueLabel}>
                How is person {currentPortion} paying?
              </Text>
              <View style={styles.methodButtons}>
                <TouchableOpacity
                  style={[styles.methodButton, styles.methodCash]}
                  onPress={() => {
                    setTendered("");
                    setScreen("SPLIT_PORTION_CASH");
                  }}
                >
                  <Text style={styles.methodIcon}>💵</Text>
                  <Text style={styles.methodLabel}>Cash</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodButton, styles.methodCard]}
                  onPress={() => handleSplitPortionPaid("CARD")}
                >
                  <Text style={styles.methodIcon}>💳</Text>
                  <Text style={styles.methodLabel}>Card</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Split portion cash ── */}
          {screen === "SPLIT_PORTION_CASH" && (
            <View style={styles.cashFlow}>
              <View style={styles.flowHeader}>
                <TouchableOpacity
                  onPress={() => {
                    setScreen("SPLIT_COLLECT");
                    setTendered("");
                  }}
                >
                  <Text style={styles.changeMethod}>← Change</Text>
                </TouchableOpacity>
                <Text style={styles.panelTitle}>
                  Cash — {currentPortion} of {splitWays}
                </Text>
              </View>
              <Text style={styles.totalDue}>£{portionAmount.toFixed(2)}</Text>
              <Text style={styles.totalDueLabel}>
                Amount due for person {currentPortion}
              </Text>
              <View style={styles.quickAmounts}>
                {portionQuickAmounts.map((a) => (
                  <TouchableOpacity
                    key={a}
                    style={styles.quickAmount}
                    onPress={() => setTendered(a.toFixed(2))}
                  >
                    <Text style={styles.quickAmountText}>£{a.toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.tenderedDisplay}>
                <Text style={styles.tenderedLabel}>Tendered</Text>
                <Text style={styles.tenderedValue}>£{tendered || "0.00"}</Text>
              </View>
              {tenderedAmount > 0 && (
                <View
                  style={[
                    styles.changeDisplay,
                    portionChange >= 0
                      ? styles.changePositive
                      : styles.changeNegative,
                  ]}
                >
                  <Text style={styles.changeLabel}>
                    {portionChange >= 0 ? "Change" : "Short by"}
                  </Text>
                  <Text
                    style={[
                      styles.changeValue,
                      portionChange < 0 && { color: theme.colors.error },
                    ]}
                  >
                    £{Math.abs(portionChange).toFixed(2)}
                  </Text>
                </View>
              )}
              <View style={styles.numpad}>
                {[
                  "1",
                  "2",
                  "3",
                  "4",
                  "5",
                  "6",
                  "7",
                  "8",
                  "9",
                  ".",
                  "0",
                  "⌫",
                ].map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={styles.numpadKey}
                    onPress={() => handleNumpad(key)}
                  >
                    <Text style={styles.numpadKeyText}>{key}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>
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
  successScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  successTick: { fontSize: 80, color: theme.colors.success },
  successTitle: {
    fontSize: 32,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  successMethod: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  successAmount: {
    fontSize: 48,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
    marginTop: 8,
  },
  successChange: {
    marginTop: 16,
    padding: 16,
    backgroundColor: `${theme.colors.success}20`,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    width: "100%",
    maxWidth: 300,
  },
  successChangeLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  successChangeAmount: {
    fontSize: 36,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.success,
  },
  successCountdown: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textMuted,
    marginTop: 24,
  },
  successButton: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  successButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
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
  backButton: { minWidth: 80 },
  backText: { color: theme.colors.primary, fontSize: theme.fontSize.md },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  body: { flex: 1, flexDirection: "row" },
  summaryPanel: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    padding: 16,
    flexDirection: "column",
  },
  panelTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: 16,
  },
  itemList: { flex: 1 },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  summaryItemQty: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
    minWidth: 28,
  },
  summaryItemName: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
  },
  summaryItemPrice: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  summaryTotals: {
    paddingTop: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: 8,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  summaryValue: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
  },
  summaryTotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  summaryTotalLabel: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  summaryTotalValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
  },
  paymentPanel: { flex: 1.4, padding: 16 },
  methodSelect: { flex: 1, justifyContent: "center" },
  methodButtons: { flexDirection: "row", gap: 16, marginTop: 8 },
  methodButton: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: theme.borderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    maxHeight: 140,
  },
  methodCash: {
    borderColor: theme.colors.success,
    backgroundColor: `${theme.colors.success}15`,
  },
  methodCard: {
    borderColor: theme.colors.primary,
    backgroundColor: `${theme.colors.primary}15`,
  },
  methodSplit: {
    borderColor: theme.colors.warning,
    backgroundColor: `${theme.colors.warning}15`,
  },
  methodIcon: { fontSize: 36, marginBottom: 8 },
  methodLabel: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  cashFlow: { flex: 1 },
  splitSetup: { flex: 1, alignItems: "center" },
  splitCollect: { flex: 1, alignItems: "center", justifyContent: "center" },
  flowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  changeMethod: { color: theme.colors.primary, fontSize: theme.fontSize.md },
  totalDue: {
    fontSize: 48,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
    textAlign: "center",
    marginBottom: 4,
  },
  totalDueLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: 16,
  },
  quickAmounts: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  quickAmount: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  quickAmountText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.medium,
  },
  tenderedDisplay: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
  },
  tenderedLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  tenderedValue: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  changeDisplay: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: theme.borderRadius.md,
    marginBottom: 8,
  },
  changePositive: { backgroundColor: `${theme.colors.success}20` },
  changeNegative: { backgroundColor: `${theme.colors.error}20` },
  changeLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  changeValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.success,
  },
  numpad: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  numpadKey: {
    width: "30%",
    aspectRatio: 2,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  numpadKeyText: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  splitControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    marginVertical: 24,
  },
  splitButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  splitButtonText: {
    fontSize: 28,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.bold,
  },
  splitWaysText: {
    fontSize: 64,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
    minWidth: 80,
    textAlign: "center",
  },
  splitPerPerson: {
    fontSize: theme.fontSize.xl,
    color: theme.colors.textSecondary,
    marginBottom: 24,
  },
  confirmButton: {
    backgroundColor: theme.colors.success,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    marginTop: 8,
    width: "100%",
  },
  confirmButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  portionBadge: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: theme.borderRadius.xl,
    marginBottom: 16,
  },
  portionBadgeText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
});
