import { IminPrinterService } from "./IminPrinterService";
import { NoopPrinterService } from "./NoopPrinterService";
import { PrinterService } from "./types";

/**
 * Select and return the correct PrinterService implementation for this
 * device. Called once at app startup.
 *
 * Current selection order (most specific → most general):
 *   1. iMin adapter — use if iMin SDK loads and reports available
 *   2. Noop fallback — emulator, non-iMin hardware, anywhere else
 *
 * When Sunmi support lands, we'll add a SunmiPrinterService check
 * before iMin (or after — whichever is more reliable at distinguishing
 * itself from other Android hardware).
 *
 * Why dynamic selection instead of a build-time flag:
 *   - Keeps a single codebase for all targets
 *   - Emulator testing works without any per-environment tweaks
 *   - Developers can test non-printer flows on any Android device
 *
 * The returned PrinterService is ready to use but not yet initialize()d.
 * Callers should initialize() once after selection and handle the result.
 */
export async function selectPrinterService(): Promise<PrinterService> {
  const imin = new IminPrinterService();
  if (await imin.isAvailable()) {
    return imin;
  }
  return new NoopPrinterService();
}
