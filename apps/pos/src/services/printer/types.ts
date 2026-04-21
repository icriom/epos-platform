/**
 * Printer service contract.
 *
 * This file defines the abstraction that decouples the app's receipt-printing
 * needs from any specific vendor SDK. Concrete implementations
 * (IminPrinterService, SunmiPrinterService, NoopPrinterService) all conform
 * to the PrinterService interface below.
 *
 * Design principles:
 * - Domain-driven: methods describe what the app wants, not what the SDK
 *   happens to expose. Buffer/transaction mechanics are implementation detail.
 * - Async and fallible: every print can fail for predictable reasons
 *   (no paper, door open, overheat). Callers handle PrintResult explicitly.
 * - Receipt as data: layout is a property of the adapter, not the caller.
 *   Pass a Receipt; the adapter decides how to render it on 80mm thermal paper.
 * - Minimal surface: only what's needed now. Kitchen receipts, reprints,
 *   logos, cash drawer are future additions.
 *
 * Session 12: define contract + iMin implementation.
 * Session 13+: Sunmi adapter, kitchen receipts, reprint tracking, etc.
 */

// ─── Error / status types ────────────────────────────────────────────────────

/**
 * Known failure modes when attempting to print or check status.
 * Adapters map their vendor-specific error codes onto this union.
 */
export type PrinterErrorCode =
  | "no_paper"
  | "door_open"
  | "overheated"
  | "disconnected"
  | "hardware_fault"
  | "not_supported" // adapter doesn't support this device (e.g. iMin adapter on Sunmi)
  | "unknown";

/**
 * Result of an attempted print operation.
 * Discriminated on `ok` so TypeScript narrows correctly at call sites.
 */
export type PrintResult =
  | { ok: true }
  | { ok: false; code: PrinterErrorCode; message: string };

/**
 * Current state of the printer, without attempting to print.
 * Use before a print to surface "no paper" / "door open" warnings proactively.
 */
export type PrinterStatus =
  | { ready: true }
  | { ready: false; code: PrinterErrorCode; message: string };

// ─── Receipt data model ──────────────────────────────────────────────────────

/**
 * A single line on the receipt body. Quantity/name/total is the minimum;
 * modifiers and notes are printed indented beneath where present.
 * Voided items render with visual strike-through or similar treatment.
 */
export interface ReceiptLineItem {
  quantity: number;
  name: string;
  lineTotal: number; // already quantity × unit, pre-computed
  modifiers?: string[];
  note?: string;
  voided?: boolean;
}

/**
 * VAT totals grouped by rate. A single receipt may mix standard-rate,
 * zero-rate, and exempt items; each gets its own breakdown row.
 */
export interface ReceiptVatBreakdown {
  rateLabel: string; // e.g. "VAT 20%" or "Zero-rated"
  netAmount: number;
  vatAmount: number;
}

/**
 * A payment applied to this order. Orders can have multiple (split bill,
 * partial payments). `change` is populated for cash only.
 */
export interface ReceiptPayment {
  method: string; // "Cash", "Card", "Gift Card", etc.
  amount: number;
  change?: number;
}

/**
 * Full customer receipt, ready to print. Built from an Order + Venue via
 * `buildReceipt`; the printer service doesn't know about domain models.
 */
export interface Receipt {
  // Header
  venueName: string;
  venueAddress?: string[]; // multi-line, each entry is one line
  venueVatNumber?: string;
  venueFooter?: string; // e.g. "Thank you for visiting"

  // Transaction identity
  orderNumber: string;
  tableLabel?: string; // "Table 5" / "Bar" / "Walk-in"
  customerNumber?: number; // for food pickup
  staffName: string;
  timestamp: Date;

  // Body
  items: ReceiptLineItem[];

  // Totals
  subtotal: number;
  vatBreakdown: ReceiptVatBreakdown[];
  discountTotal?: number;
  serviceCharge?: number;
  total: number;

  // Payments (may be multiple for split / partial)
  payments: ReceiptPayment[];

  // Metadata
  isReprint?: boolean; // if true, adapter adds "** REPRINT **" header
}

// ─── Service interface ───────────────────────────────────────────────────────

/**
 * Contract every vendor adapter must satisfy. The rest of the app never
 * imports a concrete adapter — it imports PrinterService and receives
 * whichever implementation was selected at app startup.
 */
export interface PrinterService {
  /**
   * One-time setup. Called at app startup, before any print attempts.
   * May be expensive (e.g. bind to the native SDK, connect to hardware).
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  initialize(): Promise<PrintResult>;

  /**
   * Probe the printer's current state without printing anything.
   * Useful for showing proactive "no paper" warnings before the user
   * initiates a payment flow.
   */
  getStatus(): Promise<PrinterStatus>;

  /**
   * Print a customer receipt. Renders the Receipt according to the
   * adapter's own conventions for the vendor's SDK and paper width.
   * Returns ok: true on physical print success, ok: false with a code
   * and human-readable message otherwise.
   */
  printReceipt(receipt: Receipt): Promise<PrintResult>;

  /**
   * True if this adapter can operate on the current device.
   * Used at app startup to decide which adapter to register.
   * Example: IminPrinterService.isAvailable() returns true on iMin hardware
   * and false on the emulator or on non-iMin hardware (where the SDK
   * would crash on initialize).
   */
  isAvailable(): Promise<boolean>;
}
