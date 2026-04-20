import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma";

export default async function orderRoutes(fastify: FastifyInstance) {
  // ─── Helpers ────────────────────────────────────────────────────────────────

  // Generate the next customer number for a walk-in food order.
  // Resets per day per venue. Counts all orders for this venue
  // today that already have a customer number, then adds 1.
  async function generateCustomerNumber(venueId: string): Promise<number> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const mostRecentToday = await prisma.order.findFirst({
      where: {
        venueId,
        customerNumber: { not: null },
        createdAt: { gte: startOfToday },
      },
      select: { customerNumber: true },
      orderBy: { customerNumber: "desc" },
    });

    return (mostRecentToday?.customerNumber ?? 0) + 1;
  }

  // Check whether a menu item is a food (kitchen) item.
  // Returns true only if kitchenStation is set and looks kitchen-like.
  async function isKitchenItem(menuItemId: string): Promise<boolean> {
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: menuItemId },
      select: { kitchenStation: true },
    });
    if (!menuItem?.kitchenStation) return false;
    const station = menuItem.kitchenStation.toUpperCase();
    // Kitchen-like stations. Bar / DRINKS stations don't need customer numbers.
    return station.includes("KITCHEN") || station.includes("FOOD") ||
           station.includes("GRILL") || station.includes("FRYER") ||
           station.includes("PASS") || station.includes("PREP");
  }

  // Fire any PENDING items on an order: marks them SENT, sets sentAt,
  // sets Order.firstSentAt if not already set, and writes an AuditLog entry.
  // Called automatically by Store Table and Pay flows.
  async function fireOrderItems(
    orderId: string,
    staffId: string,
  ): Promise<{ fired: number }> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { venueId: true, sessionId: true, firstSentAt: true },
    });
    if (!order) return { fired: 0 };

    const pendingItems = await prisma.orderItem.findMany({
      where: { orderId, status: "PENDING" },
      select: { id: true },
    });

    if (pendingItems.length === 0) return { fired: 0 };

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: { orderId, status: "PENDING" },
        data: { status: "SENT", sentAt: now },
      });

      if (!order.firstSentAt) {
        await tx.order.update({
          where: { id: orderId },
          data: { firstSentAt: now },
        });
      }

      await tx.auditLog.create({
        data: {
          venueId: order.venueId,
          staffId,
          sessionId: order.sessionId,
          action: "ITEMS_SENT_TO_KITCHEN",
          entityType: "Order",
          entityId: orderId,
          newValue: { itemCount: pendingItems.length },
        },
      });
    });

    return { fired: pendingItems.length };
  }

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

      // After the item is added, check whether this walk-in order needs
      // a customer number. Only walk-ins that include at least one kitchen
      // item get one, and only once — first matching item triggers it.
      const orderAfter = await prisma.order.findUnique({
        where: { id: request.params.id },
        select: { orderType: true, customerNumber: true, venueId: true },
      });
      if (
        orderAfter &&
        orderAfter.orderType === "WALK_IN" &&
        orderAfter.customerNumber === null
      ) {
        const needsNumber = await isKitchenItem(menuItemId);
        if (needsNumber) {
          const nextNumber = await generateCustomerNumber(orderAfter.venueId);
          await prisma.order.update({
            where: { id: request.params.id },
            data: { customerNumber: nextNumber },
          });
        }
      }

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

        return { success: true, data: order ?? null };
      } catch (error) {
        reply.status(500);
        return { success: false, error: "Failed to check table order" };
      }
    },
  );

  // ─── Get open orders for all tables in a venue ──────────────────────────────
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

  // ─── Send items to kitchen ──────────────────────────────────────────────────
  // Marks all PENDING items on the order as SENT. Writes an AuditLog entry.
  // The Store Table and Pay flows call this automatically, but staff can
  // also fire items explicitly (e.g. "send the starters now").
  fastify.post<{
    Params: { id: string };
    Body: { staffId: string };
  }>("/:id/send-to-kitchen", async (request, reply) => {
    try {
      const { id } = request.params;
      const { staffId } = request.body;

      const result = await fireOrderItems(id, staffId);
      return { success: true, data: result };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to send items to kitchen" };
    }
  });

  // ─── Transfer an order to a different table ────────────────────────────────
  fastify.patch<{
    Params: { id: string };
    Body: { tableId: string };
  }>("/:id/transfer", async (request, reply) => {
    try {
      const { id } = request.params;
      const { tableId } = request.body;

      const sourceOrder = await prisma.order.findUnique({
        where: { id },
        select: { id: true, status: true, tableId: true },
      });

      if (!sourceOrder) {
        reply.status(404);
        return { success: false, error: "Order not found" };
      }
      if (sourceOrder.status !== "OPEN") {
        reply.status(400);
        return { success: false, error: "Only OPEN orders can be transferred" };
      }
      if (sourceOrder.tableId === tableId) {
        reply.status(400);
        return { success: false, error: "Order is already on this table" };
      }

      const existingOnDestination = await prisma.order.findFirst({
        where: { tableId, status: "OPEN" },
        select: { id: true },
      });
      if (existingOnDestination) {
        reply.status(409);
        return {
          success: false,
          error: "Destination table already has an open order",
          code: "TABLE_OCCUPIED",
        };
      }

      const updated = await prisma.order.update({
        where: { id },
        data: { tableId },
      });

      return { success: true, data: updated };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to transfer order" };
    }
  });

  // ─── Update item quantity ───────────────────────────────────────────────────
  // Also writes an AuditLog entry if the item has already been sent to kitchen
  // (so we have a record of late edits).
  fastify.patch<{
    Params: { id: string; itemId: string };
    Body: { quantity: number; staffId?: string };
  }>("/:id/items/:itemId/quantity", async (request, reply) => {
    try {
      const { quantity, staffId } = request.body;
      const { id, itemId } = request.params;

      const existingItem = await prisma.orderItem.findUnique({
        where: { id: itemId },
        select: {
          unitPrice: true,
          vatRate: true,
          status: true,
          quantity: true,
          menuItemName: true,
          order: { select: { venueId: true, sessionId: true } },
        },
      });

      if (!existingItem) {
        reply.status(404);
        return { success: false, error: "Item not found" };
      }

      const wasAlreadySent = existingItem.status === "SENT";

      if (quantity <= 0) {
        await prisma.orderItem.update({
          where: { id: itemId },
          data: { status: "VOID" },
        });
      } else {
        const lineTotal = Number(existingItem.unitPrice) * quantity;
        const vatAmount = (lineTotal * Number(existingItem.vatRate)) / 100;
        await prisma.orderItem.update({
          where: { id: itemId },
          data: { quantity, lineTotal, vatAmount },
        });
      }

      // Audit trail for late edits
      if (wasAlreadySent && staffId) {
        await prisma.auditLog.create({
          data: {
            venueId: existingItem.order.venueId,
            staffId,
            sessionId: existingItem.order.sessionId,
            action: "SENT_ITEM_EDITED",
            entityType: "OrderItem",
            entityId: itemId,
            oldValue: { quantity: existingItem.quantity },
            newValue: { quantity },
          },
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
    Body: { staffId?: string; reason?: string };
  }>("/:id/items/:itemId/void", async (request, reply) => {
    try {
      const { id, itemId } = request.params;
      const { staffId, reason } = request.body ?? {};

      const existingItem = await prisma.orderItem.findUnique({
        where: { id: itemId },
        select: {
          status: true,
          order: { select: { venueId: true, sessionId: true } },
        },
      });

      const wasAlreadySent = existingItem?.status === "SENT";

      await prisma.orderItem.update({
        where: { id: itemId },
        data: {
          status: "VOID",
          voidedBy: staffId,
          voidedAt: new Date(),
          voidReason: reason,
        },
      });

      // Audit trail for late voids on kitchen items
      if (wasAlreadySent && staffId && existingItem) {
        await prisma.auditLog.create({
          data: {
            venueId: existingItem.order.venueId,
            staffId,
            sessionId: existingItem.order.sessionId,
            action: "SENT_ITEM_VOIDED",
            entityType: "OrderItem",
            entityId: itemId,
            reason,
          },
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
  // Also auto-fires any PENDING items to the kitchen before processing.
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

      // Auto-fire any pending items before taking payment
      await fireOrderItems(id, order.staffId);

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
  // Also auto-fires any PENDING items to the kitchen before processing.
  fastify.post<{
    Params: { id: string };
    Body: {
      amount: number;
      method: string;
      amountTendered?: number;
      itemIds?: string[];
      unitSplits?: Array<{ itemId: string; paidQuantity: number }>;
    };
  }>("/:id/partial-payment", async (request, reply) => {
    try {
      const { id } = request.params;
      const { amount, method, amountTendered, itemIds, unitSplits } =
        request.body;

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

      // Auto-fire any pending items before processing
      await fireOrderItems(id, order.staffId);

      const newAmountPaid = Number(order.amountPaid) + amount;
      const orderTotal = Number(order.total);
      const isFullyPaid = newAmountPaid >= orderTotal;

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

      if (itemIds && itemIds.length > 0) {
        await prisma.orderItem.updateMany({
          where: { id: { in: itemIds }, orderId: id },
          data: { status: "PAID" },
        });
      }

      if (unitSplits && unitSplits.length > 0) {
        for (const split of unitSplits) {
          const original = await prisma.orderItem.findUnique({
            where: { id: split.itemId },
          });
          if (!original) continue;
          if (split.paidQuantity <= 0) continue;

          if (split.paidQuantity >= original.quantity) {
            await prisma.orderItem.update({
              where: { id: split.itemId },
              data: { status: "PAID" },
            });
            continue;
          }

          const unitPrice = Number(original.unitPrice);
          const vatRate = Number(original.vatRate);
          const remainingQty = original.quantity - split.paidQuantity;
          const paidLineTotal = unitPrice * split.paidQuantity;
          const paidVatAmount = (paidLineTotal * vatRate) / 100;
          const remainingLineTotal = unitPrice * remainingQty;
          const remainingVatAmount = (remainingLineTotal * vatRate) / 100;

          await prisma.$transaction(async (tx) => {
            await tx.orderItem.update({
              where: { id: split.itemId },
              data: {
                quantity: remainingQty,
                lineTotal: remainingLineTotal,
                vatAmount: remainingVatAmount,
              },
            });
            await tx.orderItem.create({
              data: {
                orderId: id,
                menuItemId: original.menuItemId,
                menuItemName: original.menuItemName,
                course: original.course,
                quantity: split.paidQuantity,
                unitPrice: original.unitPrice,
                vatType: original.vatType,
                vatRate: original.vatRate,
                vatAmount: paidVatAmount,
                lineTotal: paidLineTotal,
                notes: original.notes,
                status: "PAID",
              },
            });
          });
        }
      }

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
