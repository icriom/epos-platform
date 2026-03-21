import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'epos_dev_jwt_secret';
const SALT_ROUNDS = 10;

export default async function authRoutes(fastify: FastifyInstance) {

  // POST /auth/staff — create a new staff member
  fastify.post<{
    Body: {
      venueId: string;
      firstName: string;
      lastName: string;
      displayName?: string;
      email?: string;
      pin: string;
      roleId?: string;
      backOfficeAccess?: boolean;
    }
  }>('/staff', async (request, reply) => {
    try {
      const {
        venueId, firstName, lastName, displayName,
        email, pin, roleId, backOfficeAccess
      } = request.body;

      // Hash the PIN
      const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);

      const staff = await prisma.staff.create({
        data: {
          venueId,
          firstName,
          lastName,
          displayName: displayName ?? `${firstName} ${lastName}`,
          email,
          pinHash,
          roleId,
          backOfficeAccess: backOfficeAccess ?? false,
          isActive: true
        },
        select: {
          id: true,
          venueId: true,
          firstName: true,
          lastName: true,
          displayName: true,
          email: true,
          roleId: true,
          isActive: true,
          backOfficeAccess: true,
          createdAt: true
          // pinHash deliberately excluded from response
        }
      });

      reply.status(201);
      return {
        success: true,
        message: 'Staff member created successfully',
        data: staff
      };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Failed to create staff member' };
    }
  });

  // POST /auth/login — PIN login for PoS device
  fastify.post<{
    Body: {
      venueId: string;
      staffId: string;
      pin: string;
    }
  }>('/login', async (request, reply) => {
    try {
      const { venueId, staffId, pin } = request.body;

      // Find the staff member
      const staff = await prisma.staff.findFirst({
        where: {
          id: staffId,
          venueId,
          isActive: true,
          deletedAt: null
        },
        include: { role: true }
      });

      if (!staff) {
        reply.status(401);
        return { success: false, error: 'Staff member not found' };
      }

      // Verify PIN
      const pinValid = await bcrypt.compare(pin, staff.pinHash);

      if (!pinValid) {
        reply.status(401);
        return { success: false, error: 'Invalid PIN' };
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          staffId: staff.id,
          venueId: staff.venueId,
          role: staff.role?.name ?? 'SERVER',
          displayName: staff.displayName
        },
        JWT_SECRET,
        { expiresIn: '8h' }
      );

      return {
        success: true,
        message: 'Login successful',
        data: {
          token,
          staff: {
            id: staff.id,
            displayName: staff.displayName,
            firstName: staff.firstName,
            lastName: staff.lastName,
            role: staff.role?.name ?? 'SERVER',
            backOfficeAccess: staff.backOfficeAccess
          }
        }
      };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Login failed' };
    }
  });

  // GET /auth/staff/:venueId — get all staff for a venue
  fastify.get<{ Params: { venueId: string } }>(
    '/staff/:venueId',
    async (request, reply) => {
      try {
        const staff = await prisma.staff.findMany({
          where: {
            venueId: request.params.venueId,
            isActive: true,
            deletedAt: null
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
            email: true,
            roleId: true,
            isActive: true,
            backOfficeAccess: true,
            photoUrl: true,
            createdAt: true,
            role: true
          },
          orderBy: { firstName: 'asc' }
        });

        return { success: true, data: staff, count: staff.length };
      } catch (error) {
        reply.status(500);
        return { success: false, error: 'Failed to retrieve staff' };
      }
    }
  );

  // POST /auth/roles — create a role
  fastify.post<{
    Body: {
      venueId?: string;
      name: string;
      description?: string;
    }
  }>('/roles', async (request, reply) => {
    try {
      const { venueId, name, description } = request.body;

      const role = await prisma.role.create({
        data: { venueId, name, description, isSystem: false }
      });

      reply.status(201);
      return { success: true, data: role };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Failed to create role' };
    }
  });

  // GET /auth/roles/:venueId — get roles for a venue
  fastify.get<{ Params: { venueId: string } }>(
    '/roles/:venueId',
    async (request, reply) => {
      try {
        const roles = await prisma.role.findMany({
          where: {
            OR: [
              { venueId: request.params.venueId },
              { isSystem: true }
            ]
          },
          orderBy: { name: 'asc' }
        });

        return { success: true, data: roles };
      } catch (error) {
        reply.status(500);
        return { success: false, error: 'Failed to retrieve roles' };
      }
    }
  );
}
