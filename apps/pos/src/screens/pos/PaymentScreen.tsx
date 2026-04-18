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
  unitPrice: string;
  lineTotal: string;
  status: string;
}

interface Order {
  id: string;
  orderNumber: number;
  subtotal: string;
  vatTotal: string;
  total: string;
  amountPaid: string;
  items: OrderItem[];
}

// A single unit of an item expanded from a multi-quantity order item.
interface SelectableUnit {
  unitKey: string; // unique id for this specific unit — e.g. "itemId-0"
  orderItemId: string; // the original order item ID
  menuItemName: string;
  unitPrice: number; // the per-unit price
  unitIndex: number; // 0, 1, 2... within the quantity
  totalQuantity: number; // total quantity on the order line
}

type Screen =
  | "METHOD_SELECT"
  | "PARTIAL_MODE"
  | "PARTIAL_ITEMS"
  | "PARTIAL_CUSTOM"
  | "CASH"
  | "PARTIAL_CASH"
  | "SPLIT_SETUP"
  | "SPLIT_COLLECT"
  | "SPLIT_PORTION_CASH"
  | "SUCCESS"
  | "PARTIAL_SUCCESS";

export default function PaymentScreen({ route, navigation }: any) {
  const { order, table } = route.params as { order: Order; table?: any };

  const totalAmount = parseFloat(order.total);
  const alreadyPaid = parseFloat(order.amountPaid ?? "0");
  const remainingBalance = Math.max(0, totalAmount - alreadyPaid);

  const unpaidItems = order.items.filter((i) => i.status !== "PAID");

  // Expand multi-quantity items into individual selectable units
  const selectableUnits: SelectableUnit[] = unpaidItems.flatMap((item) => {
    const perUnitPrice = parseFloat(item.lineTotal) / item.quantity;
    return Array.from({ length: item.quantity }, (_, i) => ({
      unitKey: `${item.id}-${i}`,
      orderItemId: item.id,
      menuItemName: item.menuItemName,
      unitPrice: perUnitPrice,
      unitIndex: i,
      totalQuantity: item.quantity,
    }));
  });

  const [screen, setScreen] = useState<Screen>("METHOD_SELECT");
  const [tendered, setTendered] = useState("");
  const [splitWays, setSplitWays] = useState(2);
  const [splitPortionsPaid, setSplitPortionsPaid] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [paidMethod, setPaidMethod] = useState("");
  const [changeAmount, setChangeAmount] = useState(0);

  const [selectedUnitKeys, setSelectedUnitKeys] = useState<Set<string>>(
    new Set(),
  );

  const [customAmount, setCustomAmount] = useState("");

  const tenderedAmount = parseFloat(tendered) || 0;
  const change = tenderedAmount - remainingBalance;
  const portionAmount = remainingBalance / splitWays;
  const currentPortion = splitPortionsPaid + 1;
  const portionChange = tenderedAmount - portionAmount;

  const selectedUnitsTotal = selectableUnits
    .filter((u) => selectedUnitKeys.has(u.unitKey))
    .reduce((sum, u) => sum + u.unitPrice, 0);

  // Build the payload for the API based on which units are selected.
  // Groups units by orderItemId, then decides per line whether to:
  //   - mark it fully PAID (itemIds)
  //   - split it into paid + remaining (unitSplits)
  const buildPaymentPayload = () => {
    const countsByItem = new Map<string, number>();
    selectableUnits.forEach((u) => {
      if (selectedUnitKeys.has(u.unitKey)) {
        countsByItem.set(
          u.orderItemId,
          (countsByItem.get(u.orderItemId) ?? 0) + 1,
        );
      }
    });

    const itemIds: string[] = [];
    const unitSplits: Array<{ itemId: string; paidQuantity: number }> = [];

    countsByItem.forEach((paidCount, itemId) => {
      const totalForItem = selectableUnits.filter(
        (u) => u.orderItemId === itemId,
      ).length;
      if (paidCount >= totalForItem) {
        itemIds.push(itemId);
      } else {
        unitSplits.push({ itemId, paidQuantity: paidCount });
      }
    });

    return { itemIds, unitSplits };
  };

  const customAmountValue = parseFloat(customAmount) || 0;

  const quickAmounts = [
    Math.ceil(remainingBalance),
    Math.ceil(remainingBalance / 5) * 5,
    Math.ceil(remainingBalance / 10) * 10,
    Math.ceil(remainingBalance / 20) * 20,
  ]
    .filter((v, i, a) => a.indexOf(v) === i && v >= remainingBalance)
    .slice(0, 4);

  const portionQuickAmounts = [
    Math.ceil(portionAmount),
    Math.ceil(portionAmount / 5) * 5,
    Math.ceil(portionAmount / 10) * 10,
    Math.ceil(portionAmount / 20) * 20,
  ]
    .filter((v, i, a) => a.indexOf(v) === i && v >= portionAmount)
    .slice(0, 4);

  useEffect(() => {
    if (screen !== "CASH") return;
    if (
      tenderedAmount >= remainingBalance &&
      remainingBalance > 0 &&
      !processing
    ) {
      handleConfirmFullPayment("CASH", remainingBalance, tenderedAmount);
    }
  }, [tenderedAmount, screen]);

  useEffect(() => {
    if (screen !== "PARTIAL_CASH") return;
    const target =
      customAmountValue > 0 ? customAmountValue : selectedUnitsTotal;
    if (tenderedAmount >= target && target > 0 && !processing) {
      handleConfirmPartialPayment("CASH", target, tenderedAmount);
    }
  }, [tenderedAmount, screen]);

  useEffect(() => {
    if (screen !== "SPLIT_PORTION_CASH") return;
    if (tenderedAmount >= portionAmount && portionAmount > 0 && !processing) {
      handleSplitPortionPaid("CASH", tenderedAmount);
    }
  }, [tenderedAmount, screen]);

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

  const handleCustomNumpad = (key: string) => {
    if (key === "⌫") {
      setCustomAmount((prev) => prev.slice(0, -1));
    } else if (key === ".") {
      if (!customAmount.includes(".")) setCustomAmount((prev) => prev + ".");
    } else {
      const parts = customAmount.split(".");
      if (parts[1] && parts[1].length >= 2) return;
      setCustomAmount((prev) => prev + key);
    }
  };

  const toggleUnitSelection = (unitKey: string) => {
    setSelectedUnitKeys((prev) => {
      const next = new Set(prev);
      if (next.has(unitKey)) {
        next.delete(unitKey);
      } else {
        next.add(unitKey);
      }
      return next;
    });
  };

  const handleConfirmFullPayment = async (
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

  const handleConfirmPartialPayment = async (
    method: string,
    amount: number,
    amountTendered?: number,
  ) => {
    if (processing) return;
    setProcessing(true);
    try {
      // Build payload from selected units — handles both full-item and split cases
      const { itemIds, unitSplits } =
        selectedUnitKeys.size > 0
          ? buildPaymentPayload()
          : { itemIds: [], unitSplits: [] };

      const response = await orderApi.recordPartialPayment(
        order.id,
        amount,
        method,
        {
          itemIds: itemIds.length > 0 ? itemIds : undefined,
          unitSplits: unitSplits.length > 0 ? unitSplits : undefined,
          amountTendered,
        },
      );

      if (response.data.isFullyPaid) {
        setPaidMethod(method);
        setChangeAmount(amountTendered ? amountTendered - amount : 0);
        setScreen("SUCCESS");
      } else {
        setScreen("PARTIAL_SUCCESS");
      }
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
        await orderApi.recordPayment(
          order.id,
          remainingBalance,
          `SPLIT_${method}`,
          amountTendered,
        );
        setPaidMethod(`SPLIT (${splitWays} ways)`);
        setChangeAmount(amountTendered ? amountTendered - portionAmount : 0);
        setScreen("SUCCESS");
      } else {
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

  if (screen === "PARTIAL_SUCCESS") {
    const paidAmount =
      customAmountValue > 0 ? customAmountValue : selectedUnitsTotal;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successScreen}>
          <Text style={styles.successTick}>⊞</Text>
          <Text style={styles.successTitle}>Payment Stored</Text>
          <Text style={styles.successMethod}>Table stored with balance</Text>
          <Text style={styles.successAmount}>
            £{(remainingBalance - paidAmount).toFixed(2)} remaining
          </Text>
          <Text style={styles.successCountdown}>
            Returning to floor plan...
          </Text>
          <TouchableOpacity
            style={styles.successButton}
            onPress={() => navigation.navigate("TablePlan")}
          >
            <Text style={styles.successButtonText}>Back to Tables</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "SUCCESS") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successScreen}>
          <Text style={styles.successTick}>✓</Text>
          <Text style={styles.successTitle}>Payment Complete</Text>
          <Text style={styles.successMethod}>{paidMethod}</Text>
          <Text style={styles.successAmount}>£{totalAmount.toFixed(2)}</Text>
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
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Payment — Order #{order.orderNumber}
          {table ? ` · Table ${table.tableNumber}` : ""}
        </Text>
        <View style={{ minWidth: 80 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.summaryPanel}>
          <Text style={styles.panelTitle}>Order Summary</Text>
          <ScrollView style={styles.itemList}>
            {order.items.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.summaryItem,
                  item.status === "PAID" && styles.summaryItemPaid,
                ]}
              >
                <Text style={styles.summaryItemQty}>{item.quantity}x</Text>
                <Text style={styles.summaryItemName}>{item.menuItemName}</Text>
                <Text
                  style={[
                    styles.summaryItemPrice,
                    item.status === "PAID" && styles.summaryItemPricePaid,
                  ]}
                >
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
            {alreadyPaid > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Paid</Text>
                <Text
                  style={[styles.summaryValue, { color: theme.colors.success }]}
                >
                  −£{alreadyPaid.toFixed(2)}
                </Text>
              </View>
            )}
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <Text style={styles.summaryTotalLabel}>
                {alreadyPaid > 0 ? "Remaining" : "Total"}
              </Text>
              <Text style={styles.summaryTotalValue}>
                £{remainingBalance.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.paymentPanel}>
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
                  onPress={() =>
                    handleConfirmFullPayment("CARD", remainingBalance)
                  }
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

              {table && selectableUnits.length > 0 && (
                <TouchableOpacity
                  style={styles.partialButton}
                  onPress={() => setScreen("PARTIAL_MODE")}
                >
                  <Text style={styles.partialButtonIcon}>⊘</Text>
                  <View>
                    <Text style={styles.partialButtonLabel}>
                      Partial Payment
                    </Text>
                    <Text style={styles.partialButtonSub}>
                      Someone leaving early? Take part of the bill.
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

          {screen === "PARTIAL_MODE" && (
            <View style={styles.partialModeSelect}>
              <View style={styles.flowHeader}>
                <TouchableOpacity onPress={() => setScreen("METHOD_SELECT")}>
                  <Text style={styles.changeMethod}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.panelTitle}>Partial Payment</Text>
              </View>
              <Text style={styles.partialModeHint}>
                How would you like to take this payment?
              </Text>
              <TouchableOpacity
                style={styles.partialModeButton}
                onPress={() => {
                  setSelectedUnitKeys(new Set());
                  setScreen("PARTIAL_ITEMS");
                }}
              >
                <Text style={styles.partialModeIcon}>☑</Text>
                <View>
                  <Text style={styles.partialModeLabel}>Pay by Item</Text>
                  <Text style={styles.partialModeSub}>
                    Select which items to pay for now
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.partialModeButton}
                onPress={() => {
                  setCustomAmount("");
                  setScreen("PARTIAL_CUSTOM");
                }}
              >
                <Text style={styles.partialModeIcon}>£</Text>
                <View>
                  <Text style={styles.partialModeLabel}>Custom Amount</Text>
                  <Text style={styles.partialModeSub}>
                    Enter any amount to take off the bill
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {screen === "PARTIAL_ITEMS" && (
            <View style={styles.partialItems}>
              <View style={styles.flowHeader}>
                <TouchableOpacity onPress={() => setScreen("PARTIAL_MODE")}>
                  <Text style={styles.changeMethod}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.panelTitle}>Select Items to Pay</Text>
              </View>
              <ScrollView style={styles.itemSelectList}>
                {selectableUnits.map((unit) => {
                  const selected = selectedUnitKeys.has(unit.unitKey);
                  const showIndex = unit.totalQuantity > 1;
                  return (
                    <TouchableOpacity
                      key={unit.unitKey}
                      style={[
                        styles.itemSelectRow,
                        selected && styles.itemSelectRowSelected,
                      ]}
                      onPress={() => toggleUnitSelection(unit.unitKey)}
                    >
                      <View
                        style={[
                          styles.itemSelectCheck,
                          selected && styles.itemSelectCheckSelected,
                        ]}
                      >
                        {selected && (
                          <Text style={styles.itemSelectCheckMark}>✓</Text>
                        )}
                      </View>
                      <Text style={styles.itemSelectQty}>1x</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemSelectName}>
                          {unit.menuItemName}
                        </Text>
                        {showIndex && (
                          <Text style={styles.itemSelectIndex}>
                            {unit.unitIndex + 1} of {unit.totalQuantity}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.itemSelectPrice}>
                        £{unit.unitPrice.toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {selectedUnitKeys.size > 0 && (
                <View style={styles.partialItemsFooter}>
                  <Text style={styles.partialItemsTotal}>
                    To pay: £{selectedUnitsTotal.toFixed(2)}
                  </Text>
                  <View style={styles.partialItemsButtons}>
                    <TouchableOpacity
                      style={[
                        styles.methodButton,
                        styles.methodCash,
                        { flex: 1, maxHeight: 80 },
                      ]}
                      onPress={() => {
                        setTendered("");
                        setScreen("PARTIAL_CASH");
                      }}
                    >
                      <Text style={styles.methodIcon}>💵</Text>
                      <Text style={styles.methodLabel}>Cash</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.methodButton,
                        styles.methodCard,
                        { flex: 1, maxHeight: 80 },
                      ]}
                      onPress={() =>
                        handleConfirmPartialPayment("CARD", selectedUnitsTotal)
                      }
                    >
                      <Text style={styles.methodIcon}>💳</Text>
                      <Text style={styles.methodLabel}>Card</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {screen === "PARTIAL_CUSTOM" && (
            <View style={styles.cashFlow}>
              <View style={styles.flowHeader}>
                <TouchableOpacity onPress={() => setScreen("PARTIAL_MODE")}>
                  <Text style={styles.changeMethod}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.panelTitle}>Custom Amount</Text>
              </View>
              <Text style={styles.totalDue}>
                £{remainingBalance.toFixed(2)}
              </Text>
              <Text style={styles.totalDueLabel}>Balance remaining</Text>
              <View style={styles.tenderedDisplay}>
                <Text style={styles.tenderedLabel}>Amount to take</Text>
                <Text style={styles.tenderedValue}>
                  £{customAmount || "0.00"}
                </Text>
              </View>
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
                    onPress={() => handleCustomNumpad(key)}
                  >
                    <Text style={styles.numpadKeyText}>{key}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {customAmountValue > 0 &&
                customAmountValue <= remainingBalance && (
                  <View style={styles.partialItemsButtons}>
                    <TouchableOpacity
                      style={[
                        styles.methodButton,
                        styles.methodCash,
                        { flex: 1, maxHeight: 80 },
                      ]}
                      onPress={() => {
                        setTendered("");
                        setScreen("PARTIAL_CASH");
                      }}
                    >
                      <Text style={styles.methodIcon}>💵</Text>
                      <Text style={styles.methodLabel}>Cash</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.methodButton,
                        styles.methodCard,
                        { flex: 1, maxHeight: 80 },
                      ]}
                      onPress={() =>
                        handleConfirmPartialPayment("CARD", customAmountValue)
                      }
                    >
                      <Text style={styles.methodIcon}>💳</Text>
                      <Text style={styles.methodLabel}>Card</Text>
                    </TouchableOpacity>
                  </View>
                )}
            </View>
          )}

          {screen === "PARTIAL_CASH" && (
            <View style={styles.cashFlow}>
              <View style={styles.flowHeader}>
                <TouchableOpacity
                  onPress={() => {
                    setTendered("");
                    setScreen(
                      selectedUnitKeys.size > 0
                        ? "PARTIAL_ITEMS"
                        : "PARTIAL_CUSTOM",
                    );
                  }}
                >
                  <Text style={styles.changeMethod}>← Change</Text>
                </TouchableOpacity>
                <Text style={styles.panelTitle}>Cash — Partial</Text>
              </View>
              {(() => {
                const partialTarget =
                  customAmountValue > 0
                    ? customAmountValue
                    : selectedUnitsTotal;
                const partialChange = tenderedAmount - partialTarget;
                return (
                  <>
                    <Text style={styles.totalDue}>
                      £{partialTarget.toFixed(2)}
                    </Text>
                    <Text style={styles.totalDueLabel}>
                      Tap a quick amount or enter below
                    </Text>
                    <View style={styles.quickAmounts}>
                      {[
                        Math.ceil(partialTarget),
                        Math.ceil(partialTarget / 5) * 5,
                        Math.ceil(partialTarget / 10) * 10,
                        Math.ceil(partialTarget / 20) * 20,
                      ]
                        .filter(
                          (v, i, a) => a.indexOf(v) === i && v >= partialTarget,
                        )
                        .slice(0, 4)
                        .map((a) => (
                          <TouchableOpacity
                            key={a}
                            style={styles.quickAmount}
                            onPress={() => setTendered(a.toFixed(2))}
                          >
                            <Text style={styles.quickAmountText}>
                              £{a.toFixed(2)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                    </View>
                    <View style={styles.tenderedDisplay}>
                      <Text style={styles.tenderedLabel}>Tendered</Text>
                      <Text style={styles.tenderedValue}>
                        £{tendered || "0.00"}
                      </Text>
                    </View>
                    {tenderedAmount > 0 && (
                      <View
                        style={[
                          styles.changeDisplay,
                          partialChange >= 0
                            ? styles.changePositive
                            : styles.changeNegative,
                        ]}
                      >
                        <Text style={styles.changeLabel}>
                          {partialChange >= 0 ? "Change" : "Short by"}
                        </Text>
                        <Text
                          style={[
                            styles.changeValue,
                            partialChange < 0 && { color: theme.colors.error },
                          ]}
                        >
                          £{Math.abs(partialChange).toFixed(2)}
                        </Text>
                      </View>
                    )}
                  </>
                );
              })()}
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
              <Text style={styles.totalDue}>
                £{remainingBalance.toFixed(2)}
              </Text>
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

          {screen === "SPLIT_SETUP" && (
            <View style={styles.splitSetup}>
              <View style={styles.flowHeader}>
                <TouchableOpacity onPress={() => setScreen("METHOD_SELECT")}>
                  <Text style={styles.changeMethod}>← Change</Text>
                </TouchableOpacity>
                <Text style={styles.panelTitle}>Split Payment</Text>
              </View>
              <Text style={styles.totalDue}>
                £{remainingBalance.toFixed(2)}
              </Text>
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
  summaryItemPaid: { opacity: 0.4 },
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
  summaryItemPricePaid: {
    textDecorationLine: "line-through",
    color: theme.colors.textMuted,
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
  partialButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 20,
    padding: 16,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  partialButtonIcon: {
    fontSize: 28,
    color: theme.colors.textSecondary,
  },
  partialButtonLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  partialButtonSub: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  partialModeSelect: { flex: 1 },
  partialModeHint: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginBottom: 20,
  },
  partialModeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginBottom: 12,
  },
  partialModeIcon: {
    fontSize: 32,
    color: theme.colors.primary,
    minWidth: 40,
    textAlign: "center",
  },
  partialModeLabel: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  partialModeSub: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  partialItems: { flex: 1 },
  itemSelectList: { flex: 1 },
  itemSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 10,
    borderRadius: theme.borderRadius.sm,
  },
  itemSelectRowSelected: {
    backgroundColor: `${theme.colors.primary}10`,
  },
  itemSelectCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  itemSelectCheckSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  itemSelectCheckMark: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: theme.fontWeight.bold,
  },
  itemSelectQty: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
    minWidth: 28,
  },
  itemSelectName: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
  },
  itemSelectIndex: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  itemSelectPrice: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  partialItemsFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 10,
  },
  partialItemsTotal: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
    textAlign: "center",
  },
  partialItemsButtons: {
    flexDirection: "row",
    gap: 12,
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
