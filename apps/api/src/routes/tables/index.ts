import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma";

export default async function tableRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: {
      venueId: string;
      locationId: string;
      name: string;
    };
  }>("/plan", async (request, reply) => {
    try {
      const { venueId, locationId, name } = request.body;

      const plan = await prisma.tablePlan.create({
        data: { venueId, locationId, name, isActive: true },
      });

      reply.status(201);
      return { success: true, data: plan };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to create table plan" };
    }
  });

  fastify.post<{
    Body: {
      tablePlanId: string;
      tableNumber: string;
      covers: number;
      shape?: string;
      posX: number;
      posY: number;
      width: number;
      height: number;
    };
  }>("/", async (request, reply) => {
    try {
      const {
        tablePlanId,
        tableNumber,
        covers,
        shape,
        posX,
        posY,
        width,
        height,
      } = request.body;

      const table = await prisma.tableLayout.create({
        data: {
          tablePlanId,
          tableNumber,
          covers,
          shape: shape ?? "SQUARE",
          posX,
          posY,
          width,
          height,
          isActive: true,
        },
      });

      reply.status(201);
      return { success: true, data: table };
    } catch (error) {
      reply.status(500);
      return { success: false, error: "Failed to create table" };
    }
  });

  fastify.get<{ Params: { venueId: string } }>(
    "/plan/:venueId",
    async (request, reply) => {
      try {
        const plans = await prisma.tablePlan.findMany({
          where: { venueId: request.params.venueId, isActive: true },
          include: {
            tables: {
              where: { isActive: true },
              orderBy: { tableNumber: "asc" },
            },
          },
        });

        return { success: true, data: plans };
      } catch (error) {
        reply.status(500);
        return { success: false, error: "Failed to retrieve table plan" };
      }
    },
  );
}
