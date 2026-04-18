import { FastifyInstance } from 'fastify';
import prisma from '../../lib/prisma';

// Numeric conversion helper — Prisma returns Decimal as strings, this turns
// them into JS numbers for arithmetic. Safe for the kinds of amounts we
// handle (pub-scale sales, not financial institution scale).
const num = (v: any): number => (v == null ? 0 : Number(v));

// Round to 2dp for currency display
const round2 = (n: number): number => Math.round(n * 100) / 100;

export default async function reportsRoutes(fastify: FastifyInstance) {

  // GET /api/reports/z-read/:venueId?from=ISO&to=ISO
  // Full Z-Read aggregation. Caller supplies the date range; the endpoint
  // is neutral on whether that came from a session's openedAt or midnight
  // (so it works for both session-based and trading-day venue profiles).
  fastify.get<{
    Params: { venueId: string };
    Querystring: { from?: string; to?: string };
  }>('/z-read/:venueId', async (request, reply) => {
    try {
      const { venueId } = request.params;
      const { from, to } = request.query;

      // Sensible default: last 24 hours if no range specified
      const rangeTo = to ? new Date(to) : new Date();
      const rangeFrom = from
        ? new Date(from)
        : new Date(rangeTo.getTime() - 24 * 60 * 60 * 1000);

      // ─── Venue header ─────────────────────────────────────────────
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: {
          name: true,
          addressLine1: true,
          city: true,
          postcode: true,
          vatNumber: true,
        },
      });

      if (!venue) {
        reply.status(404);
        return { success: false, error: 'Venue not found' };
      }

      // ─── Sessions in range ────────────────────────────────────────
      const sessions = await prisma.tradingSession.findMany({
        where: {
          venueId,
          OR: [
            { openedAt: { gte: rangeFrom, lte: rangeTo } },
            { closedAt: { gte: rangeFrom, lte: rangeTo } },
            {
              AND: [
                { openedAt: { lte: rangeFrom } },
                {
                  OR: [
                    { closedAt: { gte: rangeTo } },
                    { closedAt: null },
                  ],
                },
              ],
            },
          ],
        },
        orderBy: { openedAt: 'asc' },
      });

      // Look up who opened/closed each session
      const staffIds = new Set<string>();
      sessions.forEach(s => {
        if (s.openedBy) staffIds.add(s.openedBy);
        if (s.closedBy) staffIds.add(s.closedBy);
      });
      const sessionStaff = await prisma.staff.findMany({
        where: { id: { in: Array.from(staffIds) } },
        select: { id: true, displayName: true },
      });
      const staffNameById: Record<string, string> = {};
      sessionStaff.forEach(s => { staffNameById[s.id] = s.displayName; });

      const sessionSummaries = sessions.map(s => ({
        id: s.id,
        status: s.status,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        openedByName: staffNameById[s.openedBy] ?? 'Unknown',
        closedByName: s.closedBy ? (staffNameById[s.closedBy] ?? 'Unknown') : null,
        cashFloat: num(s.cashFloatAmount),
        cashDeclared: s.cashDeclared == null ? null : num(s.cashDeclared),
        cashExpected: s.cashExpected == null ? null : num(s.cashExpected),
        cashVariance: s.cashVariance == null ? null : num(s.cashVariance),
      }));

      // ─── Payments in range ────────────────────────────────────────
      // Payments are the source of truth for sales totals — they capture
      // when money actually moved, including partial payments.
      const payments = await prisma.payment.findMany({
        where: {
          order: { venueId },
          createdAt: { gte: rangeFrom, lte: rangeTo },
          status: 'COMPLETED',
        },
        include: {
          order: {
            select: {
              id: true,
              orderType: true,
              staffId: true,
              subtotal: true,
              vatTotal: true,
              total: true,
              discountTotal: true,
              serviceCharge: true,
              status: true,
            },
          },
        },
      });

      // Payment breakdown by method
      const paymentBreakdown: Record<string, { total: number; count: number }> = {};
      payments.forEach(p => {
        const method = p.method.toUpperCase();
        if (!paymentBreakdown[method]) {
          paymentBreakdown[method] = { total: 0, count: 0 };
        }
        paymentBreakdown[method].total += num(p.amount);
        paymentBreakdown[method].count += 1;
      });

      const grossSales = payments.reduce((sum, p) => sum + num(p.amount), 0);
      const totalTips = payments.reduce((sum, p) => sum + num(p.tipAmount), 0);
      const totalServiceCharge = payments.reduce(
        (sum, p) => sum + num(p.serviceCharge),
        0,
      );

      // ─── Orders paid in range ─────────────────────────────────────
      // For item-level analysis and per-staff sales, we use orders that
      // were fully paid in this range. Partial payments will straddle
      // reads — the payment breakdown above handles the money flow
      // accurately, this handles the "orders served" angle.
      const paidOrders = await prisma.order.findMany({
        where: {
          venueId,
          status: 'PAID',
          paidAt: { gte: rangeFrom, lte: rangeTo },
        },
        include: {
          items: {
            where: { status: { not: 'VOID' } },
            select: {
              menuItemId: true,
              menuItemName: true,
              quantity: true,
              lineTotal: true,
              vatRate: true,
              vatAmount: true,
            },
          },
        },
      });

      // ─── VAT breakdown by rate ────────────────────────────────────
      const vatBreakdown: Record<string, { net: number; vat: number; gross: number }> = {};
      paidOrders.forEach(order => {
        order.items.forEach(item => {
          const rate = num(item.vatRate).toFixed(2);
          if (!vatBreakdown[rate]) {
            vatBreakdown[rate] = { net: 0, vat: 0, gross: 0 };
          }
          const vat = num(item.vatAmount);
          const gross = num(item.lineTotal);
          vatBreakdown[rate].gross += gross;
          vatBreakdown[rate].vat += vat;
          vatBreakdown[rate].net += gross - vat;
        });
      });

      // ─── Order counts ─────────────────────────────────────────────
      // "All orders in range" = orders opened in range, regardless of status.
      // Lets us see void rates and still-open orders for the day.
      const allOrdersInRange = await prisma.order.findMany({
        where: {
          venueId,
          openedAt: { gte: rangeFrom, lte: rangeTo },
        },
        select: {
          id: true,
          status: true,
          orderType: true,
          total: true,
        },
      });

      const orderCounts = {
        total: allOrdersInRange.length,
        paid: allOrdersInRange.filter(o => o.status === 'PAID').length,
        voided: allOrdersInRange.filter(o => o.status === 'VOID').length,
        open: allOrdersInRange.filter(o => o.status === 'OPEN').length,
        walkIn: allOrdersInRange.filter(o => o.orderType === 'WALK_IN').length,
        table: allOrdersInRange.filter(o => o.orderType === 'TABLE').length,
      };

      const averageOrderValue =
        orderCounts.paid > 0
          ? grossSales / orderCounts.paid
          : 0;

      // ─── Top items ────────────────────────────────────────────────
      const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      paidOrders.forEach(order => {
        order.items.forEach(item => {
          const key = item.menuItemId;
          if (!itemMap[key]) {
            itemMap[key] = { name: item.menuItemName, qty: 0, revenue: 0 };
          }
          itemMap[key].qty += item.quantity;
          itemMap[key].revenue += num(item.lineTotal);
        });
      });

      const topItems = Object.entries(itemMap)
        .map(([id, data]) => ({
          menuItemId: id,
          name: data.name,
          quantity: data.qty,
          revenue: round2(data.revenue),
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // ─── Per-staff sales ──────────────────────────────────────────
      const staffMap: Record<string, { orders: number; sales: number }> = {};
      paidOrders.forEach(order => {
        if (!staffMap[order.staffId]) {
          staffMap[order.staffId] = { orders: 0, sales: 0 };
        }
        staffMap[order.staffId].orders += 1;
        staffMap[order.staffId].sales += num(order.total);
      });

      const allStaffIds = Object.keys(staffMap);
      const allStaff = await prisma.staff.findMany({
        where: { id: { in: allStaffIds } },
        select: { id: true, displayName: true, role: { select: { name: true } } },
      });
      const staffInfoById: Record<string, { name: string; role: string }> = {};
      allStaff.forEach(s => {
        staffInfoById[s.id] = {
          name: s.displayName,
          role: s.role?.name ?? 'Unknown',
        };
      });

      const perStaffSales = allStaffIds
        .map(id => ({
          staffId: id,
          name: staffInfoById[id]?.name ?? 'Unknown',
          role: staffInfoById[id]?.role ?? 'Unknown',
          orderCount: staffMap[id].orders,
          salesTotal: round2(staffMap[id].sales),
        }))
        .sort((a, b) => b.salesTotal - a.salesTotal);

      // ─── Voided items in range (count + value lost) ───────────────
      const voidedItems = await prisma.orderItem.findMany({
        where: {
          order: { venueId },
          status: 'VOID',
          voidedAt: { gte: rangeFrom, lte: rangeTo },
        },
        select: {
          lineTotal: true,
          menuItemName: true,
          voidedBy: true,
          voidReason: true,
        },
      });

      const voidsSummary = {
        count: voidedItems.length,
        totalValue: round2(
          voidedItems.reduce((sum, i) => sum + num(i.lineTotal), 0),
        ),
      };

      // ─── Discounts in range ───────────────────────────────────────
      const discountsApplied = await prisma.discount.findMany({
        where: {
          order: { venueId },
          createdAt: { gte: rangeFrom, lte: rangeTo },
        },
        select: { amountSaved: true },
      });

      const totalDiscounts = round2(
        discountsApplied.reduce((sum, d) => sum + num(d.amountSaved), 0),
      );

      // ─── Assemble final report ────────────────────────────────────
      const totalNet = Object.values(vatBreakdown).reduce(
        (sum, v) => sum + v.net,
        0,
      );
      const totalVat = Object.values(vatBreakdown).reduce(
        (sum, v) => sum + v.vat,
        0,
      );

      const report = {
        header: {
          venueName: venue.name,
          venueAddress: `${venue.addressLine1}, ${venue.city}, ${venue.postcode}`,
          venueVatNumber: venue.vatNumber,
          rangeFrom: rangeFrom.toISOString(),
          rangeTo: rangeTo.toISOString(),
          generatedAt: new Date().toISOString(),
        },
        sessions: sessionSummaries,
        salesTotals: {
          grossSales: round2(grossSales),
          discounts: totalDiscounts,
          serviceCharge: round2(totalServiceCharge),
          tips: round2(totalTips),
          net: round2(totalNet),
          vat: round2(totalVat),
        },
        vatBreakdown: Object.entries(vatBreakdown).map(([rate, data]) => ({
          rate: parseFloat(rate),
          net: round2(data.net),
          vat: round2(data.vat),
          gross: round2(data.gross),
        })).sort((a, b) => a.rate - b.rate),
        paymentBreakdown: Object.entries(paymentBreakdown).map(([method, data]) => ({
          method,
          count: data.count,
          total: round2(data.total),
        })).sort((a, b) => b.total - a.total),
        orderCounts: {
          ...orderCounts,
          averageOrderValue: round2(averageOrderValue),
        },
        voids: voidsSummary,
        topItems,
        perStaffSales,
      };

      return {
        success: true,
        data: report,
      };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500);
      return { success: false, error: 'Failed to generate Z-Read report' };
    }
  });
}
