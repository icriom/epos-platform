import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { theme } from "../../theme";

export default function ZReadScreen({ route, navigation }: any) {
  const { authorisedByName } = route.params ?? {};

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
          <Text style={styles.headerTitle}>Z-Read / End of Day</Text>
          {authorisedByName && (
            <Text style={styles.headerSub}>
              Authorised by {authorisedByName}
            </Text>
          )}
        </View>
        <View style={{ minWidth: 100 }} />
      </View>

      <View style={styles.placeholder}>
        <Text style={styles.placeholderIcon}>📊</Text>
        <Text style={styles.placeholderTitle}>Z-Read Report</Text>
        <Text style={styles.placeholderText}>
          This is where the full Z-Read report will appear.{"\n\n"}
          Step 2 will build the backend to calculate the data, then Step 3 will render the full report here.
        </Text>
      </View>
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
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  placeholderIcon: {
    fontSize: 72,
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
});
