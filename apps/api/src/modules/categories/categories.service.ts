import { Injectable } from '@nestjs/common';
import type {
  CategoryListQuerySchema,
  CreateCategorySchema,
  UpdateCategorySchema,
} from '@stockwise/shared';
import type { z } from 'zod';
import { RequestContext } from '../../common/context/request-context';
import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation } from '../../common/errors/prisma-errors';
import type { Category } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
  ) {}

  async list(q: z.output<typeof CategoryListQuerySchema>) {
    const { businessId } = this.ctx.tenant;
    const rows = await this.prisma.category.findMany({
      where: {
        businessId,
        archivedAt: q.archived ? { not: null } : null,
        ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
      },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { products: { where: { archivedAt: null } } } },
      },
      orderBy: { name: 'asc' },
    });
    return {
      data: rows.map(({ _count, ...c }) => ({ ...c, productCount: _count.products })),
    };
  }

  async create(input: z.output<typeof CreateCategorySchema>) {
    const { businessId } = this.ctx.tenant;
    await this.assertParent(input.parentId, null);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const category = await tx.category.create({
          data: {
            businessId,
            name: input.name,
            parentId: input.parentId,
            description: input.description,
          },
        });
        await this.audit.record(tx, {
          action: 'category.create',
          entityType: 'Category',
          entityId: category.id,
          after: category,
        });
        return category;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('NAME_TAKEN', 'Category name already in use');
      throw err;
    }
  }

  async update(id: string, input: z.output<typeof UpdateCategorySchema>) {
    const existing = await this.find(id);
    if (input.parentId !== undefined) await this.assertParent(input.parentId, existing);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const category = await tx.category.update({
          where: { id, businessId: existing.businessId },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
          },
        });
        await this.audit.record(tx, {
          action: 'category.update',
          entityType: 'Category',
          entityId: id,
          before: existing,
          after: category,
        });
        return category;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('NAME_TAKEN', 'Category name already in use');
      throw err;
    }
  }

  /** Archive is blocked while active products use the category (docs/05 §4.6). */
  async setArchived(id: string, archived: boolean) {
    const existing = await this.find(id);
    if (archived) {
      const inUse = await this.prisma.product.count({
        where: { businessId: existing.businessId, categoryId: id, archivedAt: null },
      });
      if (inUse) {
        throw new AppError('CATEGORY_IN_USE', 'Category has active products', {
          productCount: inUse,
        });
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.update({
        where: { id, businessId: existing.businessId },
        data: { archivedAt: archived ? new Date() : null },
      });
      await this.audit.record(tx, {
        action: archived ? 'category.archive' : 'category.restore',
        entityType: 'Category',
        entityId: id,
      });
      return category;
    });
  }

  private async find(id: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { id, businessId: this.ctx.tenant.businessId },
    });
    if (!category) throw AppError.notFound('Category');
    return category;
  }

  /** One-level hierarchy: the parent must be a top-level category of this business. */
  private async assertParent(parentId: string | null | undefined, self: Category | null) {
    if (!parentId) return;
    if (self && parentId === self.id) {
      throw new AppError('VALIDATION_ERROR', 'A category cannot be its own parent');
    }
    const parent = await this.find(parentId);
    if (parent.parentId) {
      throw new AppError('VALIDATION_ERROR', 'Categories can only be nested one level deep');
    }
    if (self) {
      const children = await this.prisma.category.count({
        where: { businessId: self.businessId, parentId: self.id },
      });
      if (children) {
        throw new AppError(
          'VALIDATION_ERROR',
          'A category with sub-categories cannot have a parent',
        );
      }
    }
  }
}
