import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma";

export default async function orderRoutes(fastify: FastifyInstance) {
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

  // Update item quantity
  fastify.patch<{
    Params: { id: string; itemId: string };
    Body: { quantity: number };
  }>("/:id/items/:itemId/quantity", async (request, reply) => {
    try {
      const { quantity } = request.body;
      const { id, itemId } = request.params;

      if (quantity <= 0) {
        // Void the item if quantity reaches 0
        await prisma.orderItem.update({
          where: { id: itemId },
          data: { status: "VOID" },
        });
      } else {
        const unitPrice = await prisma.orderItem.findUnique({
          where: { id: itemId },
          select: { unitPrice: true, vatRate: true },
        });
        const lineTotal = Number(unitPrice!.unitPrice) * quantity;
        const vatAmount = (lineTotal * Number(unitPrice!.vatRate)) / 100;
        await prisma.orderItem.update({
          where: { id: itemId },
          data: { quantity, lineTotal, vatAmount },
        });
      }

      // Recalculate order totals
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

  // Void item
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

      const order = await prisma.order.update({
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
}
