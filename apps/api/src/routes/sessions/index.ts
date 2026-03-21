import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma";

export default async function sessionRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: {
      venueId: string;
      locationId?: string;
      openedBy: string;
      cashFloatAmount?: number;
    };
  }>("/", async (request, reply) => {
    try {
      const { venueId, locationId, openedBy, cashFloatAmount } = request.body;

      const existing = await prisma.tradingSession.findFirst({
        where: { venueId, status: "OPEN" },
      });

      if (existing) {
        reply.status(409);
        return {
          success: false,
          error: "A trading session is already open",
          data: existing,
        };
      }

      const session = await prisma.tradingSession.create({
        data: {
          venueId,
          locationId,
          openedBy,
          cashFloatAmount,
          status: "OPEN",
        },
      });

      reply.status(201);
      return {
        success: true,
        message: "Trading session opened",
        data: session,
      };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to open trading session" };
    }
  });

  fastify.get<{ Params: { venueId: string } }>(
    "/:venueId/current",
    async (request, reply) => {
      try {
        const session = await prisma.tradingSession.findFirst({
          where: { venueId: request.params.venueId, status: "OPEN" },
          orderBy: { openedAt: "desc" },
        });

        if (!session) {
          reply.status(404);
          return { success: false, error: "No open session found" };
        }

        return { success: true, data: session };
      } catch (error) {
        reply.status(500);
        return { success: false, error: "Failed to retrieve session" };
      }
    },
  );

  fastify.patch<{
    Params: { id: string };
    Body: { closedBy: string; cashDeclared?: number; notes?: string };
  }>("/:id/close", async (request, reply) => {
    try {
      const { closedBy, cashDeclared, notes } = request.body;

      const session = await prisma.tradingSession.findUnique({
        where: { id: request.params.id },
      });

      if (!session) {
        reply.status(404);
        return { success: false, error: "Session not found" };
      }

      if (session.status !== "OPEN") {
        reply.status(409);
        return { success: false, error: "Session is already closed" };
      }

      let cashVariance = null;
      if (cashDeclared !== undefined && session.cashFloatAmount) {
        cashVariance = cashDeclared - Number(session.cashFloatAmount);
      }

      const closed = await prisma.tradingSession.update({
        where: { id: request.params.id },
        data: {
          status: "CLOSED",
          closedBy,
          closedAt: new Date(),
          cashDeclared,
          cashVariance,
          notes,
        },
      });

      return { success: true, message: "Trading session closed", data: closed };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to close session" };
    }
  });

  fastify.get<{ Params: { venueId: string } }>(
    "/:venueId/history",
    async (request, reply) => {
      try {
        const sessions = await prisma.tradingSession.findMany({
          where: { venueId: request.params.venueId },
          orderBy: { openedAt: "desc" },
          take: 30,
        });

        return { success: true, data: sessions, count: sessions.length };
      } catch (error) {
        reply.status(500);
        return { success: false, error: "Failed to retrieve sessions" };
      }
    },
  );
}
