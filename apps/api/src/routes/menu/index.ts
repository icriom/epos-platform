import { FastifyInstance } from 'fastify';
import prisma from '../../lib/prisma';

export default async function menuRoutes(fastify: FastifyInstance) {

  // GET /menu/:venueId — get all menus for a venue
  fastify.get<{ Params: { venueId: string } }>('/:venueId', async (request, reply) => {
    try {
      const menus = await prisma.menu.findMany({
        where: { venueId: request.params.venueId, deletedAt: null },
        include: {
          categories: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            include: {
              items: {
                where: { deletedAt: null, isArchived: false },
                orderBy: { sortOrder: 'asc' },
                include: {
                  allergens: true,
                  modifierGroups: {
                    include: {
                      modifierGroup: {
                        include: { options: true }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { sortOrder: 'asc' }
      });
      return { success: true, data: menus, count: menus.length };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Failed to retrieve menus' };
    }
  });

  // POST /menu — create a new menu
  fastify.post<{
    Body: {
      venueId: string;
      name: string;
      description?: string;
      isDefault?: boolean;
    }
  }>('/', async (request, reply) => {
    try {
      const { venueId, name, description, isDefault } = request.body;

      const menu = await prisma.menu.create({
        data: {
          venueId,
          name,
          description,
          isDefault: isDefault ?? false,
          isActive: true,
          sortOrder: 0
        }
      });

      reply.status(201);
      return { success: true, message: 'Menu created successfully', data: menu };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Failed to create menu' };
    }
  });

  // POST /menu/:menuId/categories — add a category to a menu
  fastify.post<{
    Params: { menuId: string };
    Body: {
      name: string;
      description?: string;
      colour?: string;
      defaultCourse?: string;
      sortOrder?: number;
    }
  }>('/:menuId/categories', async (request, reply) => {
    try {
      const { name, description, colour, defaultCourse, sortOrder } = request.body;

      const category = await prisma.menuCategory.create({
        data: {
          menuId: request.params.menuId,
          name,
          description,
          colour,
          defaultCourse,
          sortOrder: sortOrder ?? 0
        }
      });

      reply.status(201);
      return { success: true, message: 'Category created successfully', data: category };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Failed to create category' };
    }
  });

  // POST /menu/items — create a new menu item
  fastify.post<{
    Body: {
      venueId: string;
      categoryId: string;
      name: string;
      description?: string;
      pluCode: string;
      basePrice: number;
      costPrice?: number;
      vatType?: string;
      vatRate?: number;
      course?: string;
      kitchenStation?: string;
      allergens?: string[];
    }
  }>('/items', async (request, reply) => {
    try {
      const {
        venueId, categoryId, name, description,
        pluCode, basePrice, costPrice, vatType,
        vatRate, course, kitchenStation, allergens
      } = request.body;

      const item = await prisma.$transaction(async (tx) => {
        const menuItem = await tx.menuItem.create({
          data: {
            venueId,
            categoryId,
            name,
            description,
            pluCode,
            basePrice,
            costPrice,
            vatType: vatType ?? 'EAT_IN',
            vatRate: vatRate ?? 20,
            course,
            kitchenStation,
            isAvailable: true,
            isArchived: false,
            sortOrder: 0
          }
        });

        if (allergens && allergens.length > 0) {
          await tx.menuItemAllergen.createMany({
            data: allergens.map(allergen => ({
              menuItemId: menuItem.id,
              allergen
            }))
          });
        }

        return await tx.menuItem.findUnique({
          where: { id: menuItem.id },
          include: { allergens: true, category: true }
        });
      });

      reply.status(201);
      return { success: true, message: 'Menu item created successfully', data: item };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Failed to create menu item' };
    }
  });

  // PATCH /menu/items/:id/availability — toggle item availability (86)
  fastify.patch<{
    Params: { id: string };
    Body: { isAvailable: boolean }
  }>('/items/:id/availability', async (request, reply) => {
    try {
      const item = await prisma.menuItem.update({
        where: { id: request.params.id },
        data: { isAvailable: request.body.isAvailable }
      });

      return {
        success: true,
        message: `Item ${request.body.isAvailable ? 'made available' : '86\'d — marked unavailable'}`,
        data: item
      };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Failed to update item availability' };
    }
  });
}
