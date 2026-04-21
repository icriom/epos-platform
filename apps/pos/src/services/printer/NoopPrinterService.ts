import {
  PrintResult,
  PrinterService,
  PrinterStatus,
  Receipt,
} from "./types";

/**
 * Printer service that does nothing.
 *
 * Used as a fallback on devices without a physical printer:
 * - Android emulator (developer laptop testing)
 * - Any device where IminPrinterService.isAvailable() returns false
 * - Future: tablets / handhelds that don't have built-in printers
 *
 * Every method returns a well-formed but unsuccessful result. The app
 * continues to function; payments still complete; only the physical
 * receipt is skipped. UI should treat `not_supported` as "no printer
 * attached" and surface a gentle informational notice rather than a
 * hard error.
 *
 * This also means unit tests and storybook can run without any native
 * modules — just import NoopPrinterService and go.
 */
export class NoopPrinterService implements PrinterService {
  async initialize(): Promise<PrintResult> {
    return { ok: true };
  }

  async getStatus(): Promise<PrinterStatus> {
    return {
      ready: false,
      code: "not_supported",
      message: "No printer available on this device.",
    };
  }

  async printReceipt(_receipt: Receipt): Promise<PrintResult> {
    // Deliberately accept the Receipt and discard it. The underscore
    // prefix signals to TypeScript and to future readers that the
    // parameter is intentionally unused.
    return {
      ok: false,
      code: "not_supported",
      message: "No printer available on this device.",
    };
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
