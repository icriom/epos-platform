import {
  Receipt,
  ReceiptLineItem,
  ReceiptPayment,
  ReceiptVatBreakdown,
} from "./types";

/**
 * Transforms the app's domain Order (plus contextual Venue/Staff info)
 * into a minimal Receipt ready for the printer service.
 *
 * Centralises the domain-to-presentation mapping. The printer adapter
 * never sees an Order; it only sees a Receipt.
 *
 * Type note: the POS app's domain types (Order, OrderItem, Venue, etc.)
 * are currently declared inline in each screen file. There is no shared
 * types file yet. To avoid coupling this helper to any one screen, we
 * define the minimal subset of fields we need here. When a shared
 * `types/domain.ts` lands, this helper can be updated to import from it.
 */

// ─── Minimal input shapes ────────────────────────────────────────────────────

export interface OrderForReceipt {
  id: string;
  orderNumber: number;
  subtotal: string;
  vatTotal: string;
  total: string;
  amountPaid: string;
  items: OrderItemForReceipt[];
  tableId?: string;
  customerNumber?: number;
  vatBreakdown?: Array<{
    rateLabel: string;
    netAmount: string;
    vatAmount: string;
  }>;
}

export interface OrderItemForReceipt {
  id: string;
  menuItemName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  status: string;
}

export interface VenueForReceipt {
  name: string;
  addressLines?: string[];
  vatNumber?: string;
  receiptFooter?: string;
}

export interface PaymentForReceipt {
  method: string;
  amount: string;
  change?: string;
}

export interface StaffForReceipt {
  displayName: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNumber(value: string | undefined): number {
  if (value === undefined || value === null) return 0;
  const n = parseFloat(value);
  return isNaN(n) ? 0 : n;
}

// ─── Main transformation ─────────────────────────────────────────────────────

export interface BuildReceiptArgs {
  order: OrderForReceipt;
  venue: VenueForReceipt;
  staff: StaffForReceipt;
  payments: PaymentForReceipt[];
  tableLabel?: string;
  timestamp?: Date;
  isReprint?: boolean;
}

export function buildReceipt(args: BuildReceiptArgs): Receipt {
  const { order, venue, staff, payments, tableLabel, timestamp, isReprint } =
    args;

  const items: ReceiptLineItem[] = order.items.map((item) => ({
    quantity: item.quantity,
    name: item.menuItemName,
    lineTotal: toNumber(item.lineTotal),
    voided: item.status === "VOID" || item.status === "VOIDED",
  }));

  // VAT breakdown. If the order includes an explicit breakdown, use it;
  // otherwise synthesise a single "VAT 20% (incl.)" line from the
  // vatTotal field.
  //
  // The "(incl.)" suffix makes it unambiguous that VAT is already
  // included in the subtotal shown above — not added on top. UK
  // hospitality pricing is almost always VAT-inclusive, and customers
  // reasonably ask "is that extra or already in there?" if left bare.
  let vatBreakdown: ReceiptVatBreakdown[];
  if (order.vatBreakdown && order.vatBreakdown.length > 0) {
    vatBreakdown = order.vatBreakdown.map((b) => ({
      rateLabel: b.rateLabel.includes("incl")
        ? b.rateLabel
        : `${b.rateLabel} (incl.)`,
      netAmount: toNumber(b.netAmount),
      vatAmount: toNumber(b.vatAmount),
    }));
  } else {
    vatBreakdown = [
      {
        rateLabel: "VAT 20% (incl.)",
        netAmount: toNumber(order.subtotal),
        vatAmount: toNumber(order.vatTotal),
      },
    ];
  }

  const receiptPayments: ReceiptPayment[] = payments.map((p) => ({
    method: p.method,
    amount: toNumber(p.amount),
    change: p.change !== undefined ? toNumber(p.change) : undefined,
  }));

  return {
    venueName: venue.name,
    venueAddress: venue.addressLines,
    venueVatNumber: venue.vatNumber,
    venueFooter: venue.receiptFooter,

    orderNumber: String(order.orderNumber),
    tableLabel: tableLabel,
    customerNumber: order.customerNumber,
    staffName: staff.displayName,
    timestamp: timestamp ?? new Date(),

    items,

    subtotal: toNumber(order.subtotal),
    vatBreakdown,
    total: toNumber(order.total),

    payments: receiptPayments,

    isReprint: isReprint ?? false,
  };
}

/**
 * Demo receipt for the manager Test Print button. Exercises every
 * rendering path (header, voided items, VAT breakdown, payment, cut).
 */
export function buildTestReceipt(): Receipt {
  return {
    venueName: "The Harbour Inn",
    venueAddress: ["North Quay", "Douglas", "Isle of Man", "IM1 4LB"],
    venueVatNumber: "GB 123 4567 89",
    venueFooter: "Thank you — see you again soon",

    orderNumber: "TEST-0001",
    tableLabel: "Table 7",
    staffName: "Sean (Manager)",
    timestamp: new Date(),

    items: [
      { quantity: 2, name: "Sirloin Steak 10oz", lineTotal: 56.0 },
      { quantity: 1, name: "Fish & Chips", lineTotal: 16.5 },
      { quantity: 3, name: "Guinness Pint", lineTotal: 17.7 },
      {
        quantity: 1,
        name: "Sticky Toffee Pudding",
        lineTotal: 8.5,
        voided: true,
      },
    ],

    subtotal: 75.2,
    vatBreakdown: [
      { rateLabel: "VAT 20% (incl.)", netAmount: 62.67, vatAmount: 12.53 },
    ],
    total: 90.2,

    payments: [
      { method: "Cash", amount: 100.0, change: 9.8 },
    ],
  };
}
