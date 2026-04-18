import React, { useEffect, useState, useCallback } from "react";
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
import { reportsApi, sessionApi } from "../../services/api";
import { useAuthStore } from "../../store/authStore";

// ─── Types ──────────────────────────────────────────────────────────────────
// These mirror the structure the backend returns. Keeping them here keeps
// the screen self-documenting and lets TypeScript catch shape changes.

interface SessionSummary {
  id: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  openedByName: string;
  closedByName: string | null;
  cashFloat: number;
  cashDeclared: number | null;
  cashExpected: number | null;
  cashVariance: number | null;
}

interface VatLine {
  rate: number;
  net: number;
  vat: number;
  gross: number;
}

interface PaymentLine {
  method: string;
  count: number;
  total: number;
}

interface TopItem {
  menuItemId: string;
  name: string;
  quantity: number;
  revenue: number;
}

interface StaffSales {
  staffId: string;
  name: string;
  role: string;
  orderCount: number;
  salesTotal: number;
}

interface ZReadReport {
  header: {
    venueName: string;
    venueAddress: string;
    venueVatNumber: string | null;
    rangeFrom: string;
    rangeTo: string;
    generatedAt: string;
  };
  sessions: SessionSummary[];
  salesTotals: {
    grossSales: number;
    discounts: number;
    serviceCharge: number;
    tips: number;
    net: number;
    vat: number;
  };
  vatBreakdown: VatLine[];
  paymentBreakdown: PaymentLine[];
  orderCounts: {
    total: number;
    paid: number;
    voided: number;
    open: number;
    walkIn: number;
    table: number;
    averageOrderValue: number;
  };
  voids: { count: number; totalValue: number };
  topItems: TopItem[];
  perStaffSales: StaffSales[];
}

// ─── Date range options ─────────────────────────────────────────────────────
// Session-based option is included here so the UI supports both venue
// models. When we build the feature flag system, venues that run in
// "trading day" mode can have the Session option hidden.

type RangePresetId =
  | "today"
  | "yesterday"
  | "last7days"
  | "thisSession";

interface RangePreset {
  id: RangePresetId;
  label: string;
}

const PRESETS: RangePreset[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7days", label: "Last 7 days" },
  { id: "thisSession", label: "This Session" },
];

// Convert a preset id + optional session open time into concrete from/to
// ISO strings for the backend call.
async function resolveRange(
  preset: RangePresetId,
  venueId: string,
): Promise<{ from: string; to: string; label: string }> {
  const now = new Date();
  const endOfNow = now.toISOString();

  if (preset === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return {
      from: start.toISOString(),
      to: endOfNow,
      label: "Today",
    };
  }

  if (preset === "yesterday") {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      label: "Yesterday",
    };
  }

  if (preset === "last7days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return {
      from: start.toISOString(),
      to: endOfNow,
      label: "Last 7 days",
    };
  }

  // thisSession — look up the current session and use its openedAt
  try {
    const response = await sessionApi.getCurrentSession(venueId);
    const session = response.data?.data;
    if (session?.openedAt) {
      return {
        from: session.openedAt,
        to: endOfNow,
        label: "This Session",
      };
    }
  } catch {
    // No open session — fall through
  }
  // If we can't resolve a session, default to today
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return {
    from: start.toISOString(),
    to: endOfNow,
    label: "Today (no open session)",
  };
}

// ─── Formatters ─────────────────────────────────────────────────────────────
const money = (n: number): string =>
  `£${Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, "0");
  const mins = d.getMinutes().toString().padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${mins}`;
};

// ─── Component ──────────────────────────────────────────────────────────────
export default function ZReadScreen({ route, navigation }: any) {
  const { authorisedByName } = route.params ?? {};
  const { venueId } = useAuthStore();

  const [preset, setPreset] = useState<RangePresetId>("today");
  const [rangeLabel, setRangeLabel] = useState<string>("Today");
  const [report, setReport] = useState<ZReadReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(
    async (selectedPreset: RangePresetId) => {
      if (!venueId) return;
      setLoading(true);
      setError(null);
      try {
        const range = await resolveRange(selectedPreset, venueId);
        setRangeLabel(range.label);
        const response = await reportsApi.zRead(venueId, range.from, range.to);
        if (response.data?.success) {
          setReport(response.data.data);
        } else {
          setError("Could not load report");
        }
      } catch {
        setError("Could not load report — is the API running?");
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  useEffect(() => {
    loadReport(preset);
  }, [preset, loadReport]);

  const handlePrint = () => {
    Alert.alert(
      "Printing Coming Soon",
      "Receipt printing will be added when we integrate with the iMin's built-in thermal printer. For now, you can view the report on screen.",
    );
  };

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
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Z-Read / End of Day</Text>
          {authorisedByName && (
            <Text style={styles.headerSub}>
              Authorised by {authorisedByName}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.printButton} onPress={handlePrint}>
          <Text style={styles.printButtonText}>🖨 Print</Text>
        </TouchableOpacity>
      </View>

      {/* Range toggle */}
      <View style={styles.rangeBar}>
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[
              styles.rangeChip,
              preset === p.id && styles.rangeChipActive,
            ]}
            onPress={() => setPreset(p.id)}
          >
            <Text
              style={[
                styles.rangeChipText,
                preset === p.id && styles.rangeChipTextActive,
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Generating report...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadReport(preset)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : report ? (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {/* Report header / receipt-style */}
          <View style={styles.receiptHeader}>
            <Text style={styles.venueName}>{report.header.venueName}</Text>
            <Text style={styles.venueAddress}>{report.header.venueAddress}</Text>
            {report.header.venueVatNumber && (
              <Text style={styles.venueVat}>
                VAT No: {report.header.venueVatNumber}
              </Text>
            )}
            <View style={styles.divider} />
            <Text style={styles.rangeLabel}>{rangeLabel}</Text>
            <Text style={styles.rangeDates}>
              {formatDate(report.header.rangeFrom)} —{" "}
              {formatDate(report.header.rangeTo)}
            </Text>
            <Text style={styles.generatedAt}>
              Generated {formatDate(report.header.generatedAt)}
            </Text>
            <View style={styles.divider} />
          </View>

          {/* Sales Totals */}
          <Section title="Sales Totals">
            <BigRow label="Gross Sales" value={money(report.salesTotals.grossSales)} highlight />
            <Row label="Less Discounts" value={`- ${money(report.salesTotals.discounts)}`} />
            <Row label="Service Charge" value={money(report.salesTotals.serviceCharge)} />
            <Row label="Tips" value={money(report.salesTotals.tips)} />
            <View style={styles.subDivider} />
            <Row label="Net Sales (ex VAT)" value={money(report.salesTotals.net)} />
            <Row label="VAT Total" value={money(report.salesTotals.vat)} />
          </Section>

          {/* VAT Breakdown */}
          {report.vatBreakdown.length > 0 && (
            <Section title="VAT Breakdown">
              <View style={styles.tableHeader}>
                <Text style={[styles.tableCell, { flex: 1 }]}>Rate</Text>
                <Text style={[styles.tableCell, { flex: 2, textAlign: "right" }]}>Net</Text>
                <Text style={[styles.tableCell, { flex: 2, textAlign: "right" }]}>VAT</Text>
                <Text style={[styles.tableCell, { flex: 2, textAlign: "right" }]}>Gross</Text>
              </View>
              {report.vatBreakdown.map((v) => (
                <View style={styles.tableRow} key={v.rate}>
                  <Text style={[styles.tableCellValue, { flex: 1 }]}>{v.rate}%</Text>
                  <Text style={[styles.tableCellValue, { flex: 2, textAlign: "right" }]}>
                    {money(v.net)}
                  </Text>
                  <Text style={[styles.tableCellValue, { flex: 2, textAlign: "right" }]}>
                    {money(v.vat)}
                  </Text>
                  <Text style={[styles.tableCellValue, { flex: 2, textAlign: "right" }]}>
                    {money(v.gross)}
                  </Text>
                </View>
              ))}
            </Section>
          )}

          {/* Payment Breakdown */}
          <Section title="Payment Breakdown">
            {report.paymentBreakdown.length === 0 ? (
              <Text style={styles.emptyText}>No payments in this period</Text>
            ) : (
              report.paymentBreakdown.map((p) => (
                <Row
                  key={p.method}
                  label={`${p.method.replace(/_/g, " ")} (${p.count})`}
                  value={money(p.total)}
                />
              ))
            )}
          </Section>

          {/* Orders */}
          <Section title="Orders">
            <Row label="Total Orders" value={String(report.orderCounts.total)} />
            <Row label="Paid" value={String(report.orderCounts.paid)} />
            <Row label="Voided" value={String(report.orderCounts.voided)} />
            <Row label="Still Open" value={String(report.orderCounts.open)} />
            <View style={styles.subDivider} />
            <Row label="Walk-in" value={String(report.orderCounts.walkIn)} />
            <Row label="Table" value={String(report.orderCounts.table)} />
            <View style={styles.subDivider} />
            <Row
              label="Avg Order Value"
              value={money(report.orderCounts.averageOrderValue)}
            />
          </Section>

          {/* Voids */}
          {report.voids.count > 0 && (
            <Section title="Voids">
              <Row label="Items Voided" value={String(report.voids.count)} />
              <Row
                label="Value of Voids"
                value={money(report.voids.totalValue)}
              />
            </Section>
          )}

          {/* Top Items */}
          {report.topItems.length > 0 && (
            <Section title="Top Selling Items">
              {report.topItems.map((item, index) => (
                <View style={styles.topItemRow} key={item.menuItemId}>
                  <View style={styles.topItemLeft}>
                    <Text style={styles.topItemRank}>{index + 1}.</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.topItemName}>{item.name}</Text>
                      <Text style={styles.topItemQty}>
                        {item.quantity} sold
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.topItemRevenue}>{money(item.revenue)}</Text>
                </View>
              ))}
            </Section>
          )}

          {/* Per-Staff Sales */}
          {report.perStaffSales.length > 0 && (
            <Section title="Sales by Staff">
              {report.perStaffSales.map((s) => (
                <View style={styles.staffRow} key={s.staffId}>
                  <View style={styles.staffLeft}>
                    <Text style={styles.staffName}>{s.name}</Text>
                    <Text style={styles.staffRole}>
                      {s.role} · {s.orderCount} orders
                    </Text>
                  </View>
                  <Text style={styles.staffSales}>{money(s.salesTotal)}</Text>
                </View>
              ))}
            </Section>
          )}

          {/* Sessions */}
          {report.sessions.length > 0 && (
            <Section title="Sessions">
              {report.sessions.map((s) => (
                <View style={styles.sessionBox} key={s.id}>
                  <View style={styles.sessionHeader}>
                    <Text style={styles.sessionStatus}>
                      {s.status === "OPEN" ? "● OPEN" : "✓ CLOSED"}
                    </Text>
                    <Text style={styles.sessionOpenedBy}>
                      by {s.openedByName}
                    </Text>
                  </View>
                  <Row
                    label="Opened"
                    value={formatDate(s.openedAt)}
                    subtle
                  />
                  {s.closedAt && (
                    <Row
                      label="Closed"
                      value={`${formatDate(s.closedAt)} (${s.closedByName ?? "?"})`}
                      subtle
                    />
                  )}
                  <View style={styles.subDivider} />
                  <Row label="Float" value={money(s.cashFloat)} subtle />
                  {s.cashExpected != null && (
                    <Row
                      label="Expected Cash"
                      value={money(s.cashExpected)}
                      subtle
                    />
                  )}
                  {s.cashDeclared != null && (
                    <Row
                      label="Declared Cash"
                      value={money(s.cashDeclared)}
                      subtle
                    />
                  )}
                  {s.cashVariance != null && (
                    <Row
                      label="Variance"
                      value={money(s.cashVariance)}
                      subtle
                      warning={s.cashVariance !== 0}
                    />
                  )}
                </View>
              ))}
            </Section>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>— End of Report —</Text>
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

// ─── Small helpers for consistent row/section formatting ────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  subtle,
  warning,
}: {
  label: string;
  value: string;
  subtle?: boolean;
  warning?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, subtle && styles.rowLabelSubtle]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          subtle && styles.rowValueSubtle,
          warning && styles.rowValueWarning,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function BigRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.bigRow}>
      <Text style={styles.bigRowLabel}>{label}</Text>
      <Text style={[styles.bigRowValue, highlight && styles.bigRowValueHighlight]}>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  // Header
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
  backButton: { minWidth: 100 },
  backText: { color: theme.colors.primary, fontSize: theme.fontSize.md },
  headerCenter: { alignItems: "center" },
  headerTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  headerSub: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  printButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: `${theme.colors.primary}15`,
    minWidth: 100,
    alignItems: "center",
  },
  printButtonText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
  },

  // Range toggle
  rangeBar: {
    flexDirection: "row",
    justifyContent: "center",
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  rangeChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  rangeChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  rangeChipText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  rangeChipTextActive: {
    color: theme.colors.white,
    fontWeight: theme.fontWeight.bold,
  },

  // Body
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    maxWidth: 700,
    width: "100%",
    alignSelf: "center",
  },

  // Loading / error
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.fontSize.md,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
  },
  retryButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },

  // Receipt header
  receiptHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  venueName: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  venueAddress: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  venueVat: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    width: "80%",
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 12,
  },
  rangeLabel: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
  },
  rangeDates: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  generatedAt: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
    marginTop: 4,
  },

  // Section
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    padding: 8,
  },

  // Rows
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  rowLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
  },
  rowLabelSubtle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  rowValue: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.medium,
  },
  rowValueSubtle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  rowValueWarning: {
    color: theme.colors.warning,
    fontWeight: theme.fontWeight.bold,
  },
  subDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 6,
  },

  // BigRow (headline values)
  bigRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 4,
  },
  bigRowLabel: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  bigRowValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  bigRowValueHighlight: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.xxl,
  },

  // Table (VAT breakdown)
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: 4,
  },
  tableCell: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
  },
  tableCellValue: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
  },

  // Top items
  topItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  topItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  topItemRank: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
    minWidth: 24,
  },
  topItemName: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.medium,
  },
  topItemQty: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  topItemRevenue: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.bold,
  },

  // Staff
  staffRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  staffLeft: { flex: 1 },
  staffName: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.medium,
  },
  staffRole: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  staffSales: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.bold,
  },

  // Sessions
  sessionBox: {
    padding: 12,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sessionStatus: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.success,
  },
  sessionOpenedBy: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },

  // Footer
  footer: {
    alignItems: "center",
    paddingVertical: 24,
  },
  footerText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    letterSpacing: 2,
  },
});
