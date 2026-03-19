import { FastifyInstance } from 'fastify';
import prisma from '../../lib/prisma';

export default async function venueRoutes(fastify: FastifyInstance) {

  fastify.get('/', async (request, reply) => {
    try {
      const venues = await prisma.venue.findMany({
        where: { deletedAt: null },
        include: {
          organisation: true,
          locations: { where: { deletedAt: null } }
        },
        orderBy: { createdAt: 'desc' }
      });
      return { success: true, data: venues, count: venues.length };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Failed to retrieve venues' };
    }
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const venue = await prisma.venue.findFirst({
        where: { id: request.params.id, deletedAt: null },
        include: {
          organisation: true,
          locations: { where: { deletedAt: null } },
          devices: true
        }
      });
      if (!venue) {
        reply.status(404);
        return { success: false, error: 'Venue not found' };
      }
      return { success: true, data: venue };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Failed to retrieve venue' };
    }
  });

  fastify.post<{
    Body: {
      organisationName: string;
      venueName: string;
      addressLine1: string;
      city: string;
      postcode: string;
      email: string;
      phone?: string;
      vatNumber?: string;
    }
  }>('/', async (request, reply) => {
    try {
      const {
        organisationName, venueName, addressLine1,
        city, postcode, email, phone, vatNumber
      } = request.body;

      const result = await prisma.$transaction(async (tx) => {
        const organisation = await tx.organisation.create({
          data: {
            name: organisationName,
            legalName: organisationName,
            addressLine1, city, postcode,
            email, phone, vatNumber,
            subscriptionTier: 'TRIAL',
            subscriptionStatus: 'ACTIVE'
          }
        });

        const venue = await tx.venue.create({
          data: {
            organisationId: organisation.id,
            name: venueName,
            addressLine1, city, postcode,
            email, phone, vatNumber,
            defaultCurrency: 'GBP',
            timezone: 'Europe/London'
          }
        });

        const location = await tx.location.create({
          data: {
            venueId: venue.id,
            name: 'Main',
            defaultVatType: 'EAT_IN',
            isActive: true,
            sortOrder: 0
          }
        });

        return { organisation, venue, location };
      });

      reply.status(201);
      return { success: true, message: 'Venue created successfully', data: result };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Failed to create venue' };
    }
  });
}
