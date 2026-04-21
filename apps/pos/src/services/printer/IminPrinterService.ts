import {
  PrintResult,
  PrinterService,
  PrinterStatus,
  Receipt,
  ReceiptLineItem,
} from "./types";

/**
 * iMin printer adapter.
 *
 * Wraps react-native-printer-imin to implement the PrinterService
 * contract. Targets the iMin D4-503 (80mm thermal, 48 chars per line
 * at default text size, USB-connected internal printer).
 *
 * ─── Signature note ──────────────────────────────────────────────────
 *
 * The wrapper signatures differ from the iMin *native Java SDK* docs:
 *
 *   - initPrinter() takes no args (native takes a PrintConnectType enum)
 *   - getPrinterStatus() takes no args and returns { code, message }
 *     (native takes a connect type and returns a bare number)
 *   - commitPrinterBuffer() returns Promise<void> with no result code
 *     (native version invokes a callback with 48/49/50/52 codes)
 *
 * The commitPrinterBuffer limitation is real: once we commit a
 * transaction, we can't know from the wrapper whether it physically
 * succeeded or failed partway. Best we can do is pre-flight with
 * getPrinterStatus and treat a void return as "probably ok."
 */

// ─── Layout constants ────────────────────────────────────────────────────────

/**
 * Characters per line at the iMin D4-503's default text size on 80mm paper.
 * Measured on Session 12 iteration 1 print — the receipt came out clean
 * at this width with no wrapping or overruns.
 */
const LINE_WIDTH = 48;

/** iMin SDK alignment constants. */
const ALIGN_LEFT = 0;
const ALIGN_CENTER = 1;

/**
 * Text size. iMin's default is 28. Body uses 26; headers/totals larger
 * for emphasis; small (22) for address/VAT lines.
 */
const SIZE_SMALL = 22;
const SIZE_BODY = 26;
const SIZE_HEADER = 32;
const SIZE_TOTAL = 36;

/**
 * Line spacing multiplier. Default is 1.0. 0.65 makes receipts more
 * compact without being cramped — reduces paper use by ~30% vs default
 * on a typical 15-line receipt.
 */
const LINE_SPACING = 0.65;

/** Page format: 0 = 80mm, 1 = 58mm. D4-503 is 80mm. */
const PAGE_FORMAT_80MM = 0;

// ─── Money and text formatting ───────────────────────────────────────────────

function formatMoney(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, Math.max(0, width - 1)) + "…";
  return text + " ".repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return " ".repeat(width - text.length) + text;
}

/**
 * Build a line with left content and right content, padded to LINE_WIDTH.
 */
function twoColumn(left: string, right: string): string {
  const available = LINE_WIDTH - right.length - 1;
  return padRight(left, Math.max(1, available)) + " " + right;
}

/**
 * Build a quantity/name/price line.
 *
 * Normal:  "2  Sirloin Steak 10oz                    £56.00"
 * Voided:  "** VOID: Sticky Toffee Pudding            £8.50"
 *
 * Fixed in iteration 2: previously the void branch sliced the already-
 * built base string, which clipped the first few chars of the item
 * name. Now both branches compose from scratch with the correct prefix.
 */
function itemLine(item: ReceiptLineItem): string {
  const qtyPart = padLeft(String(item.quantity), 2);
  const pricePart = formatMoney(item.lineTotal);
  const prefix = item.voided ? "** VOID: " : `${qtyPart}  `;
  const nameWidth = LINE_WIDTH - prefix.length - 1 - pricePart.length;
  const name = padRight(item.name, Math.max(1, nameWidth));
  return `${prefix}${name} ${pricePart}`;
}

function horizontalRule(): string {
  return "-".repeat(LINE_WIDTH);
}

function formatTimestamp(date: Date): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

// ─── Status translation ──────────────────────────────────────────────────────

/**
 * The wrapper returns { code, message } from getPrinterStatus. Codes
 * come from the iMin SDK:
 *   -1 / 1 => disconnected
 *    0     => normal (ready)
 *    3     => print head open
 *    7 / 8 => no paper
 *   99+    => other
 */
function translateStatus(raw: {
  code: number;
  message: string;
}): PrinterStatus {
  switch (raw.code) {
    case 0:
      return { ready: true };
    case -1:
    case 1:
      return {
        ready: false,
        code: "disconnected",
        message: raw.message || "Printer is not connected or powered on.",
      };
    case 3:
      return {
        ready: false,
        code: "door_open",
        message: raw.message || "Print head is open.",
      };
    case 7:
    case 8:
      return {
        ready: false,
        code: "no_paper",
        message: raw.message || "Printer is out of paper.",
      };
    default:
      return {
        ready: false,
        code: "hardware_fault",
        message: raw.message || `Printer reported fault code ${raw.code}.`,
      };
  }
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class IminPrinterService implements PrinterService {
  private initialized = false;

  async isAvailable(): Promise<boolean> {
    try {
      const mod = await this.loadModule();
      return mod !== null;
    } catch {
      return false;
    }
  }

  async initialize(): Promise<PrintResult> {
    if (this.initialized) return { ok: true };
    try {
      const PrinterImin = await this.loadModule();
      if (!PrinterImin) {
        return {
          ok: false,
          code: "not_supported",
          message: "iMin printer module is not available on this device.",
        };
      }
      await PrinterImin.initPrinter();
      await PrinterImin.setPageFormat(PAGE_FORMAT_80MM);
      this.initialized = true;
      return { ok: true };
    } catch (err: unknown) {
      return {
        ok: false,
        code: "hardware_fault",
        message: `Failed to initialize printer: ${String(err)}`,
      };
    }
  }

  async getStatus(): Promise<PrinterStatus> {
    try {
      const PrinterImin = await this.loadModule();
      if (!PrinterImin) {
        return {
          ready: false,
          code: "not_supported",
          message: "iMin printer module is not available.",
        };
      }
      const raw = await PrinterImin.getPrinterStatus();
      if (typeof raw === "number") {
        return translateStatus({ code: raw, message: "" });
      }
      if (raw && typeof raw === "object" && "code" in raw) {
        return translateStatus({
          code: Number(raw.code),
          message: String(raw.message ?? ""),
        });
      }
      return {
        ready: false,
        code: "unknown",
        message: `Unexpected status shape: ${JSON.stringify(raw)}`,
      };
    } catch (err) {
      return {
        ready: false,
        code: "unknown",
        message: `Status check failed: ${String(err)}`,
      };
    }
  }

  async printReceipt(receipt: Receipt): Promise<PrintResult> {
    const init = await this.initialize();
    if (!init.ok) return init;

    const status = await this.getStatus();
    if (!status.ready) {
      return {
        ok: false,
        code: status.code,
        message: status.message,
      };
    }

    try {
      const PrinterImin = await this.loadModule();
      if (!PrinterImin) {
        return {
          ok: false,
          code: "not_supported",
          message: "iMin printer module is not available.",
        };
      }

      // Tighten the line spacing for the whole transaction. Setting
      // this once at the start of the buffer applies to every
      // printText call that follows.
      await PrinterImin.setTextLineSpacing(LINE_SPACING);

      await PrinterImin.enterPrinterBuffer(true);

      await this.emitReceipt(PrinterImin, receipt);

      await PrinterImin.commitPrinterBuffer();
      await PrinterImin.exitPrinterBuffer(false);

      return { ok: true };
    } catch (err) {
      try {
        const PrinterImin = await this.loadModule();
        await PrinterImin?.exitPrinterBuffer(false);
      } catch {
        /* best effort */
      }
      return {
        ok: false,
        code: "unknown",
        message: `Print failed: ${String(err)}`,
      };
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private async loadModule(): Promise<any | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require("react-native-printer-imin");
      return mod?.default ?? mod;
    } catch {
      return null;
    }
  }

  private async emitReceipt(PrinterImin: any, receipt: Receipt): Promise<void> {
    if (receipt.isReprint) {
      await this.printCentered(PrinterImin, "** REPRINT **", SIZE_HEADER);
      await PrinterImin.printAndLineFeed();
    }

    // Venue header
    await this.printCentered(PrinterImin, receipt.venueName, SIZE_HEADER);

    if (receipt.venueAddress && receipt.venueAddress.length > 0) {
      for (const line of receipt.venueAddress) {
        await this.printCentered(PrinterImin, line, SIZE_SMALL);
      }
    }

    if (receipt.venueVatNumber) {
      await this.printCentered(
        PrinterImin,
        `VAT: ${receipt.venueVatNumber}`,
        SIZE_SMALL,
      );
    }

    await PrinterImin.printAndLineFeed();

    // Transaction identity
    await this.printLeft(
      PrinterImin,
      twoColumn(
        `Order #${receipt.orderNumber}`,
        formatTimestamp(receipt.timestamp),
      ),
      SIZE_BODY,
    );

    if (receipt.tableLabel) {
      await this.printLeft(
        PrinterImin,
        twoColumn(receipt.tableLabel, `Staff: ${receipt.staffName}`),
        SIZE_BODY,
      );
    } else {
      await this.printLeft(
        PrinterImin,
        `Staff: ${receipt.staffName}`,
        SIZE_BODY,
      );
    }

    if (receipt.customerNumber !== undefined) {
      await this.printLeft(
        PrinterImin,
        `Customer #${receipt.customerNumber}`,
        SIZE_BODY,
      );
    }

    await this.printLeft(PrinterImin, horizontalRule(), SIZE_BODY);

    // Items
    for (const item of receipt.items) {
      await this.printLeft(PrinterImin, itemLine(item), SIZE_BODY);
    }

    await this.printLeft(PrinterImin, horizontalRule(), SIZE_BODY);

    // Totals
    await this.printLeft(
      PrinterImin,
      twoColumn("Subtotal", formatMoney(receipt.subtotal)),
      SIZE_BODY,
    );

    if (receipt.discountTotal && receipt.discountTotal > 0) {
      await this.printLeft(
        PrinterImin,
        twoColumn("Discount", `-${formatMoney(receipt.discountTotal)}`),
        SIZE_BODY,
      );
    }

    for (const vat of receipt.vatBreakdown) {
      await this.printLeft(
        PrinterImin,
        twoColumn(vat.rateLabel, formatMoney(vat.vatAmount)),
        SIZE_BODY,
      );
    }

    if (receipt.serviceCharge && receipt.serviceCharge > 0) {
      await this.printLeft(
        PrinterImin,
        twoColumn("Service charge", formatMoney(receipt.serviceCharge)),
        SIZE_BODY,
      );
    }

    await this.printLeft(PrinterImin, horizontalRule(), SIZE_BODY);

    await this.printLeft(
      PrinterImin,
      twoColumn("TOTAL", formatMoney(receipt.total)),
      SIZE_TOTAL,
    );

    await PrinterImin.printAndLineFeed();

    // Payments
    for (const payment of receipt.payments) {
      await this.printLeft(
        PrinterImin,
        twoColumn(`Paid (${payment.method})`, formatMoney(payment.amount)),
        SIZE_BODY,
      );
      if (payment.change !== undefined && payment.change > 0) {
        await this.printLeft(
          PrinterImin,
          twoColumn("Change", formatMoney(payment.change)),
          SIZE_BODY,
        );
      }
    }

    await PrinterImin.printAndLineFeed();

    // Footer
    if (receipt.venueFooter) {
      await this.printCentered(PrinterImin, receipt.venueFooter, SIZE_BODY);
    }

    // Feed past the cutter, then partial cut
    await PrinterImin.printAndFeedPaper(80);
    await PrinterImin.partialCut();
  }

  private async printCentered(
    PrinterImin: any,
    text: string,
    size: number,
  ): Promise<void> {
    await PrinterImin.setAlignment(ALIGN_CENTER);
    await PrinterImin.setTextSize(size);
    await PrinterImin.printText(text + "\n");
  }

  private async printLeft(
    PrinterImin: any,
    text: string,
    size: number,
  ): Promise<void> {
    await PrinterImin.setAlignment(ALIGN_LEFT);
    await PrinterImin.setTextSize(size);
    await PrinterImin.printText(text + "\n");
  }
}
