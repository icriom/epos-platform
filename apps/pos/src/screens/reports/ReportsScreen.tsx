import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { theme } from "../../theme";
import ManagerPinModal from "../../components/ManagerPinModal";

// Each tile in the reports home. `available` toggles whether the tile
// is active or shown as "Coming soon".
interface ReportTile {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  available: boolean;
  route?: string;
}

const REPORT_TILES: ReportTile[] = [
  {
    id: "z-read",
    title: "Z-Read / End of Day",
    subtitle: "Sales totals, payment breakdown, VAT summary",
    icon: "📊",
    available: true,
    route: "ZRead",
  },
  {
    id: "sales-by-staff",
    title: "Sales by Staff",
    subtitle: "Performance breakdown per staff member",
    icon: "👥",
    available: false,
  },
  {
    id: "top-items",
    title: "Top Selling Items",
    subtitle: "Best performers over any date range",
    icon: "🏆",
    available: false,
  },
  {
    id: "hourly",
    title: "Hourly Trade",
    subtitle: "Sales by hour to identify peak times",
    icon: "⏰",
    available: false,
  },
  {
    id: "void-history",
    title: "Void & Refund History",
    subtitle: "All voided items and refunds with reasons",
    icon: "🗑",
    available: false,
  },
  {
    id: "audit-log",
    title: "Audit Log",
    subtitle: "All sensitive actions — discounts, voids, overrides",
    icon: "🔒",
    available: false,
  },
];

export default function ReportsScreen({ navigation }: any) {
  // Manager info captured once on entry — passed to individual reports
  // so they know who authorised. We keep it in state so reports the
  // user opens don't each re-prompt.
  const [authorisedManagerId, setAuthorisedManagerId] = useState<string | null>(
    null,
  );
  const [authorisedManagerName, setAuthorisedManagerName] = useState<
    string | null
  >(null);
  const [pinModalVisible, setPinModalVisible] = useState(true); // open on mount
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  const handleTilePress = (tile: ReportTile) => {
    if (!tile.available || !tile.route) return;
    // Should already be authorised since we prompt on mount.
    // Double-check to be safe.
    if (!authorisedManagerId) {
      setPendingRoute(tile.route);
      setPinModalVisible(true);
      return;
    }
    navigation.navigate(tile.route, {
      authorisedById: authorisedManagerId,
      authorisedByName: authorisedManagerName,
    });
  };

  const handlePinSuccess = (managerId: string, managerName: string) => {
    setAuthorisedManagerId(managerId);
    setAuthorisedManagerName(managerName);
    setPinModalVisible(false);

    // If we were trying to enter a report, continue to it now
    if (pendingRoute) {
      const route = pendingRoute;
      setPendingRoute(null);
      navigation.navigate(route, {
        authorisedById: managerId,
        authorisedByName: managerName,
      });
    }
  };

  const handlePinCancel = () => {
    setPinModalVisible(false);
    // If we never authorised on initial mount, kick the user back
    if (!authorisedManagerId) {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Reports</Text>
          {authorisedManagerName && (
            <Text style={styles.headerSub}>
              Authorised by {authorisedManagerName}
            </Text>
          )}
        </View>
        <View style={{ minWidth: 100 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.tileGrid}>
          {REPORT_TILES.map((tile) => (
            <TouchableOpacity
              key={tile.id}
              style={[
                styles.tile,
                !tile.available && styles.tileDisabled,
              ]}
              onPress={() => handleTilePress(tile)}
              disabled={!tile.available}
              activeOpacity={0.7}
            >
              <Text style={styles.tileIcon}>{tile.icon}</Text>
              <Text style={styles.tileTitle}>{tile.title}</Text>
              <Text style={styles.tileSubtitle}>{tile.subtitle}</Text>
              {!tile.available && (
                <View style={styles.comingSoon}>
                  <Text style={styles.comingSoonText}>Coming soon</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <ManagerPinModal
        visible={pinModalVisible}
        title="Reports Access"
        subtitle="Enter a manager PIN to view reports"
        onSuccess={handlePinSuccess}
        onCancel={handlePinCancel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
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
  content: { flex: 1, padding: 20 },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  tile: {
    width: "48%",
    minHeight: 180,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: "space-between",
  },
  tileDisabled: {
    opacity: 0.5,
  },
  tileIcon: {
    fontSize: 44,
    marginBottom: 8,
  },
  tileTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  tileSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  comingSoon: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: `${theme.colors.warning}25`,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: `${theme.colors.warning}50`,
  },
  comingSoonText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.warning,
    fontWeight: theme.fontWeight.bold,
  },
});
