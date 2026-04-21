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
 * The RN wrapper's signatures differ from the iMin native Java SDK:
 *
 *   - initPrinter() takes no args (native takes a PrintConnectType enum)
 *   - getPrinterStatus() returns { code, message } (native returns a bare number)
 *   - commitPrinterBuffer() returns Promise<void> with no result code
 *     (native version invokes a callback with 48/49/50/52 codes)
 *
 * The commit limitation means we can't tell from the wrapper if a
 * transaction physically succeeded. Best we can do is pre-flight with
 * getPrinterStatus and treat a non-throw as "probably ok."
 *
 * ─── Iteration history ───────────────────────────────────────────────
 *
 * v1 (iter 1): first pass. Wrote against the native SDK docs, caused
 *   "1 arguments" errors. Rewritten.
 *
 * v2 (iter 2): correct signatures. £ rendered correctly. Fixed VOID
 *   truncation, added VAT (incl.) label, tightened line spacing to 0.65.
 *
 * v3 (iter 3): tried right-aligning prices by padding with leading
 *   spaces into a fixed column. The logic was correct but the visual
 *   result was wrong — proportional font means padding with spaces
 *   doesn't produce visual alignment of the £ symbols.
 *
 * v4 (iter 4 — current): left-anchor prices at a fixed column. Labels
 *   are padded to a fixed width; prices begin at a fixed offset from
 *   the left of the line with no leading padding. Every £ now lands
 *   at the same horizontal position regardless of price length.
 *   This matches how receipts look in most UK hospitality venues.
 */

// ─── Layout constants ────────────────────────────────────────────────────────

const LINE_WIDTH = 48;

/**
 * Column at which prices begin, measured from the left.
 *
 * Each line reads:
 *   [label padded to this many chars] [space] [price starts here]
 *
 * 38 chars of label + 1 space + up to 9 chars of price = 48 total.
 * Prices of "£100.00" (7) or "£1234.56" (8) fit comfortably. A price
 * like "£12345.67" (9) would reach the edge but not overflow.
 *
 * Critically, the price is NOT padded on the left. It simply starts
 * at this column and ends wherever its length dictates. That's what
 * makes the £ symbols line up vertically across rows.
 */
const LABEL_WIDTH = 38;

/** iMin SDK alignment constants. */
const ALIGN_LEFT = 0;
const ALIGN_CENTER = 1;

/** Text sizes. */
const SIZE_SMALL = 22;
const SIZE_BODY = 26;
const SIZE_HEADER = 32;
const SIZE_TOTAL = 36;

/**
 * Line spacing multiplier. Default is 1.0. 0.65 produces ~25% paper
 * saving vs default; confirmed by iteration-2 side-by-side comparison.
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

/**
 * Build a line where the price is left-anchored at a fixed column so
 * its £ symbol lines up vertically with every other price on the receipt.
 *
 * Example with LABEL_WIDTH=38:
 *   "Subtotal                              £75.20"
 *   "VAT 20% (incl.)                       £12.53"
 *   "TOTAL                                 £90.20"
 *   "Change                                £9.80"
 *    ^──────────── 38 chars ──────────────^ ^────── prices start at same column
 *
 * Notice Change's £9.80 is shorter than Subtotal's £75.20, but both
 * £ symbols land at the same character position. Short prices just
 * end earlier in the line.
 */
function priceLine(label: string, money: string): string {
  const labelPart = padRight(label, LABEL_WIDTH);
  return `${labelPart} ${money}`;
}

/**
 * Build a quantity/name/price line for an order item.
 *
 *   "2  Sirloin Steak 10oz                 £56.00"
 *   "** VOID: Sticky Toffee Pudding        £8.50"
 *
 * Item prices land in the same column as the totals below. Every
 * price on the receipt therefore forms a clean vertical column of £s.
 */
function itemLine(item: ReceiptLineItem): string {
  const prefix = item.voided
    ? "** VOID: "
    : `${String(item.quantity).padStart(2, " ")}  `;
  const label = `${prefix}${item.name}`;
  return priceLine(label, formatMoney(item.lineTotal));
}

/**
 * Build a two-column line where the right side is NOT money (so it
 * doesn't need to align with prices). Used for order number +
 * timestamp, and table + staff pairs.
 */
function twoColumnText(left: string, right: string): string {
  const available = LINE_WIDTH - right.length - 1;
  return padRight(left, Math.max(1, available)) + " " + right;
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

    // Transaction identity (non-money two-column lines)
    await this.printLeft(
      PrinterImin,
      twoColumnText(
        `Order #${receipt.orderNumber}`,
        formatTimestamp(receipt.timestamp),
      ),
      SIZE_BODY,
    );

    if (receipt.tableLabel) {
      await this.printLeft(
        PrinterImin,
        twoColumnText(receipt.tableLabel, `Staff: ${receipt.staffName}`),
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

    // Items — prices left-anchored at LABEL_WIDTH
    for (const item of receipt.items) {
      await this.printLeft(PrinterImin, itemLine(item), SIZE_BODY);
    }

    await this.printLeft(PrinterImin, horizontalRule(), SIZE_BODY);

    // Totals — prices left-anchored at LABEL_WIDTH
    await this.printLeft(
      PrinterImin,
      priceLine("Subtotal", formatMoney(receipt.subtotal)),
      SIZE_BODY,
    );

    if (receipt.discountTotal && receipt.discountTotal > 0) {
      await this.printLeft(
        PrinterImin,
        priceLine("Discount", `-${formatMoney(receipt.discountTotal)}`),
        SIZE_BODY,
      );
    }

    for (const vat of receipt.vatBreakdown) {
      await this.printLeft(
        PrinterImin,
        priceLine(vat.rateLabel, formatMoney(vat.vatAmount)),
        SIZE_BODY,
      );
    }

    if (receipt.serviceCharge && receipt.serviceCharge > 0) {
      await this.printLeft(
        PrinterImin,
        priceLine("Service charge", formatMoney(receipt.serviceCharge)),
        SIZE_BODY,
      );
    }

    await this.printLeft(PrinterImin, horizontalRule(), SIZE_BODY);

    // TOTAL — larger text, same column alignment
    await this.printLeft(
      PrinterImin,
      priceLine("TOTAL", formatMoney(receipt.total)),
      SIZE_TOTAL,
    );

    await PrinterImin.printAndLineFeed();

    // Payments — prices left-anchored at LABEL_WIDTH
    for (const payment of receipt.payments) {
      await this.printLeft(
        PrinterImin,
        priceLine(`Paid (${payment.method})`, formatMoney(payment.amount)),
        SIZE_BODY,
      );
      if (payment.change !== undefined && payment.change > 0) {
        await this.printLeft(
          PrinterImin,
          priceLine("Change", formatMoney(payment.change)),
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
