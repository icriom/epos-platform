import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma";

export default async function orderRoutes(fastify: FastifyInstance) {
  // ─── Create order ───────────────────────────────────────────────────────────
  fastify.post<{
    Body: {
      venueId: string;
      locationId?: string;
      sessionId: string;
      staffId: string;
      tableId?: string;
      orderType?: string;
      covers?: number;
      tabName?: string;
    };
  }>("/", async (request, reply) => {
    try {
      const {
        venueId,
        locationId,
        sessionId,
        staffId,
        tableId,
        orderType,
        covers,
        tabName,
      } = request.body;

      const orderCount = await prisma.order.count({ where: { sessionId } });

      const order = await prisma.order.create({
        data: {
          venueId,
          ...(locationId ? { locationId } : {}),
          sessionId,
          staffId,
          tableId,
          orderNumber: orderCount + 1,
          orderType: orderType ?? "TABLE",
          status: "OPEN",
          covers,
          tabName,
        },
      });

      reply.status(201);
      return { success: true, message: "Order created", data: order };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to create order" };
    }
  });

  // ─── Add item to order ──────────────────────────────────────────────────────
  fastify.post<{
    Params: { id: string };
    Body: {
      menuItemId: string;
      menuItemName: string;
      quantity: number;
      unitPrice: number;
      vatType: string;
      vatRate: number;
      course?: string;
      notes?: string;
      modifiers?: Array<{
        modifierOptionId: string;
        optionName: string;
        priceAdjustment: number;
      }>;
    };
  }>("/:id/items", async (request, reply) => {
    try {
      const {
        menuItemId,
        menuItemName,
        quantity,
        unitPrice,
        vatType,
        vatRate,
        course,
        notes,
        modifiers,
      } = request.body;

      const vatAmount = (unitPrice * quantity * vatRate) / 100;
      const lineTotal = unitPrice * quantity;

      const item = await prisma.$transaction(async (tx) => {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: request.params.id,
            menuItemId,
            menuItemName,
            quantity,
            unitPrice,
            vatType,
            vatRate,
            vatAmount,
            lineTotal,
            course,
            notes,
            status: "PENDING",
          },
        });

        if (modifiers && modifiers.length > 0) {
          await tx.orderItemModifier.createMany({
            data: modifiers.map((m) => ({
              orderItemId: orderItem.id,
              modifierOptionId: m.modifierOptionId,
              optionName: m.optionName,
              priceAdjustment: m.priceAdjustment,
            })),
          });
        }

        const allItems = await tx.orderItem.findMany({
          where: { orderId: request.params.id, status: { not: "VOID" } },
        });

        const subtotal = allItems.reduce(
          (sum, i) => sum + Number(i.lineTotal),
          0,
        );
        const vatTotal = allItems.reduce(
          (sum, i) => sum + Number(i.vatAmount),
          0,
        );

        await tx.order.update({
          where: { id: request.params.id },
          data: { subtotal, vatTotal, total: subtotal },
        });

        return orderItem;
      });

      reply.status(201);
      return { success: true, message: "Item added to order", data: item };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to add item to order" };
    }
  });

  // ─── Get order by ID ────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: request.params.id },
        include: {
          items: {
            where: { status: { not: "VOID" } },
            include: { modifiers: true },
            orderBy: { createdAt: "asc" },
          },
          payments: true,
          discounts: true,
        },
      });

      if (!order) {
        reply.status(404);
        return { success: false, error: "Order not found" };
      }

      return { success: true, data: order };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to retrieve order" };
    }
  });

  // ─── Get orders by session ──────────────────────────────────────────────────
  fastify.get<{ Params: { sessionId: string } }>(
    "/session/:sessionId",
    async (request, reply) => {
      try {
        const orders = await prisma.order.findMany({
          where: {
            sessionId: request.params.sessionId,
            status: { not: "VOID" },
          },
          include: { items: { where: { status: { not: "VOID" } } } },
          orderBy: { openedAt: "desc" },
        });

        return { success: true, data: orders, count: orders.length };
      } catch (error) {
        reply.status(500);
        return { success: false, error: "Failed to retrieve orders" };
      }
    },
  );

  // ─── Get open order for a table ─────────────────────────────────────────────
  // Returns the current OPEN order for a given tableId, or null if none exists.
  // Used by TablePlanScreen to colour tables and by OrderScreen to reopen them.
  fastify.get<{ Params: { tableId: string } }>(
    "/table/:tableId/open",
    async (request, reply) => {
      try {
        const order = await prisma.order.findFirst({
          where: {
            tableId: request.params.tableId,
            status: "OPEN",
          },
          include: {
            items: {
              where: { status: { not: "VOID" } },
              include: { modifiers: true },
              orderBy: { createdAt: "asc" },
            },
            payments: true,
            discounts: true,
          },
          orderBy: { openedAt: "desc" },
        });

        // Return null data (not 404) so the client can distinguish
        // "no open order" from a real error
        return { success: true, data: order ?? null };
      } catch (error) {
        reply.status(500);
        return { success: false, error: "Failed to check table order" };
      }
    },
  );

  // ─── Get open orders for all tables in a venue (for floor plan colouring) ──
  // Returns an array of { tableId, orderId, amountPaid, total } for all
  // currently OPEN orders that have a tableId set.
  fastify.get<{ Params: { venueId: string } }>(
    "/venue/:venueId/open-tables",
    async (request, reply) => {
      try {
        const orders = await prisma.order.findMany({
          where: {
            venueId: request.params.venueId,
            status: "OPEN",
            tableId: { not: null },
          },
          select: {
            id: true,
            tableId: true,
            amountPaid: true,
            total: true,
            orderNumber: true,
          },
        });

        return { success: true, data: orders };
      } catch (error) {
        reply.status(500);
        return { success: false, error: "Failed to retrieve open tables" };
      }
    },
  );

  // ─── Update order status ────────────────────────────────────────────────────
  fastify.patch<{
    Params: { id: string };
    Body: { status: string };
  }>("/:id/status", async (request, reply) => {
    try {
      const order = await prisma.order.update({
        where: { id: request.params.id },
        data: { status: request.body.status },
      });

      return { success: true, data: order };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to update order status" };
    }
  });

  // ─── Update item quantity ───────────────────────────────────────────────────
  fastify.patch<{
    Params: { id: string; itemId: string };
    Body: { quantity: number };
  }>("/:id/items/:itemId/quantity", async (request, reply) => {
    try {
      const { quantity } = request.body;
      const { id, itemId } = request.params;

      if (quantity <= 0) {
        await prisma.orderItem.update({
          where: { id: itemId },
          data: { status: "VOID" },
        });
      } else {
        const existing = await prisma.orderItem.findUnique({
          where: { id: itemId },
          select: { unitPrice: true, vatRate: true },
        });
        const lineTotal = Number(existing!.unitPrice) * quantity;
        const vatAmount = (lineTotal * Number(existing!.vatRate)) / 100;
        await prisma.orderItem.update({
          where: { id: itemId },
          data: { quantity, lineTotal, vatAmount },
        });
      }

      const allItems = await prisma.orderItem.findMany({
        where: { orderId: id, status: { not: "VOID" } },
      });
      const subtotal = allItems.reduce(
        (sum, i) => sum + Number(i.lineTotal),
        0,
      );
      const vatTotal = allItems.reduce(
        (sum, i) => sum + Number(i.vatAmount),
        0,
      );
      await prisma.order.update({
        where: { id },
        data: { subtotal, vatTotal, total: subtotal },
      });

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          items: {
            where: { status: { not: "VOID" } },
            include: { modifiers: true },
            orderBy: { createdAt: "asc" },
          },
          payments: true,
          discounts: true,
        },
      });

      return { success: true, data: order };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to update item quantity" };
    }
  });

  // ─── Void item ──────────────────────────────────────────────────────────────
  fastify.patch<{
    Params: { id: string; itemId: string };
  }>("/:id/items/:itemId/void", async (request, reply) => {
    try {
      const { id, itemId } = request.params;

      await prisma.orderItem.update({
        where: { id: itemId },
        data: { status: "VOID" },
      });

      const allItems = await prisma.orderItem.findMany({
        where: { orderId: id, status: { not: "VOID" } },
      });
      const subtotal = allItems.reduce(
        (sum, i) => sum + Number(i.lineTotal),
        0,
      );
      const vatTotal = allItems.reduce(
        (sum, i) => sum + Number(i.vatAmount),
        0,
      );

      await prisma.order.update({
        where: { id },
        data: { subtotal, vatTotal, total: subtotal },
      });

      const fullOrder = await prisma.order.findUnique({
        where: { id },
        include: {
          items: {
            where: { status: { not: "VOID" } },
            include: { modifiers: true },
            orderBy: { createdAt: "asc" },
          },
          payments: true,
          discounts: true,
        },
      });

      return { success: true, data: fullOrder };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to void item" };
    }
  });

  // ─── Record full payment ────────────────────────────────────────────────────
  fastify.post<{
    Params: { id: string };
    Body: {
      amount: number;
      method: string;
      amountTendered?: number;
    };
  }>("/:id/payment", async (request, reply) => {
    try {
      const { id } = request.params;
      const { amount, method, amountTendered } = request.body;

      const order = await prisma.order.findUnique({
        where: { id },
        select: { sessionId: true, staffId: true },
      });

      if (!order) {
        reply.status(404);
        return { success: false, error: "Order not found" };
      }

      await prisma.payment.create({
        data: {
          orderId: id,
          sessionId: order.sessionId,
          staffId: order.staffId,
          amount,
          method,
          status: "COMPLETED",
          currency: "GBP",
        },
      });

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: {
          status: "PAID",
          amountPaid: amount,
          paidAt: new Date(),
        },
      });

      return { success: true, data: updatedOrder };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to record payment" };
    }
  });

  // ─── Record partial payment ─────────────────────────────────────────────────
  // Takes a payment against an open order without closing it.
  // The order stays OPEN with amountPaid updated.
  // When amountPaid >= total the order is automatically closed.
  fastify.post<{
    Params: { id: string };
    Body: {
      amount: number;
      method: string;
      amountTendered?: number;
      itemIds?: string[]; // optional — which items this payment covers
    };
  }>("/:id/partial-payment", async (request, reply) => {
    try {
      const { id } = request.params;
      const { amount, method, amountTendered, itemIds } = request.body;

      const order = await prisma.order.findUnique({
        where: { id },
        select: {
          sessionId: true,
          staffId: true,
          total: true,
          amountPaid: true,
        },
      });

      if (!order) {
        reply.status(404);
        return { success: false, error: "Order not found" };
      }

      const newAmountPaid = Number(order.amountPaid) + amount;
      const orderTotal = Number(order.total);
      const isFullyPaid = newAmountPaid >= orderTotal;

      // Record the payment transaction
      await prisma.payment.create({
        data: {
          orderId: id,
          sessionId: order.sessionId,
          staffId: order.staffId,
          amount,
          method,
          status: "COMPLETED",
          currency: "GBP",
        },
      });

      // Mark specific items as PAID if itemIds provided
      if (itemIds && itemIds.length > 0) {
        await prisma.orderItem.updateMany({
          where: { id: { in: itemIds }, orderId: id },
          data: { status: "PAID" },
        });
      }

      // Update the order — close it if fully paid, otherwise keep OPEN
      const updatedOrder = await prisma.order.update({
        where: { id },
        data: {
          amountPaid: newAmountPaid,
          ...(isFullyPaid
            ? { status: "PAID", paidAt: new Date() }
            : {}),
        },
        include: {
          items: {
            where: { status: { not: "VOID" } },
            include: { modifiers: true },
            orderBy: { createdAt: "asc" },
          },
          payments: true,
          discounts: true,
        },
      });

      return {
        success: true,
        data: updatedOrder,
        isFullyPaid,
        remainingBalance: Math.max(0, orderTotal - newAmountPaid),
      };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to record partial payment" };
    }
  });
}
