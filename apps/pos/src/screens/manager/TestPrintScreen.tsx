import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { theme } from "../../theme";
import { selectPrinterService } from "../../services/printer/selectPrinterService";
import { buildTestReceipt } from "../../services/printer/buildReceipt";
import { PrinterService, PrinterStatus } from "../../services/printer/types";

/**
 * Manager-only screen for exercising the printer hardware directly,
 * independent of any real order flow. Used during Session 12 to validate
 * that the iMin printer SDK is wired up end-to-end and that receipts
 * render acceptably.
 *
 * What it does:
 *   - Selects a PrinterService (iMin on iMin hardware, Noop elsewhere)
 *   - Initialises once on mount
 *   - Offers buttons to: check status, print the demo test receipt
 *   - Surfaces all results (ok/error) in a simple text log so every
 *     iteration of layout-tweaking is observable
 *
 * This screen does NOT need to ship to production. Once the real
 * receipt flow is wired into PaymentScreen, this can move behind a
 * dev-only flag or be removed entirely.
 */
export default function TestPrintScreen({ navigation }: any) {
  const [service, setService] = useState<PrinterService | null>(null);
  const [initMessage, setInitMessage] = useState<string>("Selecting adapter…");
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState<boolean>(false);

  // Initialise once on mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const selected = await selectPrinterService();
        if (cancelled) return;
        setService(selected);
        const initResult = await selected.initialize();
        if (cancelled) return;
        if (initResult.ok) {
          setInitMessage("Printer initialised.");
        } else {
          setInitMessage(`Init failed: ${initResult.message}`);
        }
      } catch (err) {
        if (!cancelled) setInitMessage(`Init threw: ${String(err)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const appendLog = (line: string) => {
    const ts = new Date().toLocaleTimeString();
    setLog((prev) => [`[${ts}] ${line}`, ...prev].slice(0, 40));
  };

  const onCheckStatus = async () => {
    if (!service || busy) return;
    setBusy(true);
    try {
      const result = await service.getStatus();
      setStatus(result);
      if (result.ready) {
        appendLog("Status: READY");
      } else {
        appendLog(`Status: NOT READY — ${result.code} (${result.message})`);
      }
    } catch (err) {
      appendLog(`Status threw: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const onPrintTest = async () => {
    if (!service || busy) return;
    setBusy(true);
    try {
      appendLog("Printing test receipt…");
      const receipt = buildTestReceipt();
      const result = await service.printReceipt(receipt);
      if (result.ok) {
        appendLog("Print OK");
      } else {
        appendLog(`Print FAILED — ${result.code} (${result.message})`);
      }
    } catch (err) {
      appendLog(`Print threw: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const statusText = status
    ? status.ready
      ? "Ready"
      : `Not ready: ${status.message}`
    : "Unknown (tap Check Status)";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Printer Test</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.label}>Adapter</Text>
          <Text style={styles.value}>
            {service ? service.constructor.name : "—"}
          </Text>
          <Text style={styles.subtle}>{initMessage}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Status</Text>
          <Text style={styles.value}>{statusText}</Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={onCheckStatus}
            disabled={busy || !service}
          >
            <Text style={styles.buttonText}>Check Status</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonPrimary, busy && styles.buttonDisabled]}
            onPress={onPrintTest}
            disabled={busy || !service}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonPrimaryText}>Print Test Receipt</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Log</Text>
          <View style={styles.logBox}>
            {log.length === 0 ? (
              <Text style={styles.subtle}>No events yet.</Text>
            ) : (
              log.map((line, i) => (
                <Text key={i} style={styles.logLine}>
                  {line}
                </Text>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    width: 80,
  },
  backText: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: "500",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  content: {
    padding: 16,
    gap: 20,
  },
  section: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: "500",
  },
  subtle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "500",
  },
  buttonPrimary: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimaryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  logBox: {
    backgroundColor: theme.colors.surface ?? "#1a1a1a",
    padding: 12,
    borderRadius: 6,
    minHeight: 160,
  },
  logLine: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontFamily: "monospace",
    marginBottom: 2,
  },
});
