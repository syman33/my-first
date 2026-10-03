import 'server-only'
import { prisma, type DbClient } from '@/db/client'
import { isUniqueViolation } from '@/db/errors'
import { AppError, NotFoundError, ValidationError } from '@/lib/errors'
import type { BrandInput, CategoryInput } from '@/schemas/admin-catalog'
import { type AuditContext, diffFields, recordAudit } from '@/services/audit/audit.service'

/** Category tree and brands. Changes are audited; deletions refuse to orphan products. */

function slugTaken(error: unknown): never {
  if (isUniqueViolation(error, 'slug'))
    throw new AppError('SLUG_TAKEN', 'Slug already in use', {
      status: 409,
      fieldErrors: { slug: 'slugTaken' },
    })
  throw error
}

export async function listCategoriesForAdmin() {
  return prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    include: { _count: { select: { products: true, children: true } } },
  })
}

/** A category may not become its own ancestor. */
async function assertParent(tx: DbClient, categoryId: string | null, parentId: string | null) {
  if (!parentId) return
  let cursor: string | null = parentId
  for (let depth = 0; cursor && depth < 20; depth++) {
    if (cursor === categoryId)
      throw new ValidationError({ parentId: 'invalid' }, 'A category cannot be inside itself')
    const parent: { kind: string; parentId: string | null } | null = await tx.category.findUnique({
      where: { id: cursor },
      select: { kind: true, parentId: true },
    })
    if (!parent) throw new ValidationError({ parentId: 'invalid' })
    if (depth === 0 && parent.kind !== 'STANDARD')
      throw new ValidationError({ parentId: 'invalid' })
    cursor = parent.parentId
  }
}

export async function saveCategory(
  categoryId: string | null,
  input: CategoryInput,
  audit: AuditContext,
): Promise<{ id: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      await assertParent(tx, categoryId, input.parentId)
      // Rule-based collections have no parent and hold no products directly.
      const data = input.kind === 'STANDARD' ? input : { ...input, parentId: null }
      if (!categoryId) {
        const created = await tx.category.create({ data, select: { id: true } })
        await recordAudit(tx, audit, {
          action: 'category.created',
          entityType: 'category',
          entityId: created.id,
          metadata: { slug: input.slug },
        })
        return created
      }
      const before = await tx.category.findUnique({ where: { id: categoryId } })
      if (!before) throw new NotFoundError()
      if (before.kind === 'STANDARD' && input.kind !== 'STANDARD') {
        const products = await tx.product.count({ where: { categoryId } })
        if (products > 0)
          throw new ValidationError(
            { kind: 'invalid' },
            'Move its products before changing the type',
          )
      }
      await tx.category.update({ where: { id: categoryId }, data })
      await recordAudit(tx, audit, {
        action: 'category.updated',
        entityType: 'category',
        entityId: categoryId,
        metadata: { slug: input.slug, changes: diffFields(before, data) },
      })
      return { id: categoryId }
    })
  } catch (error) {
    slugTaken(error)
  }
}

export async function deleteCategory(categoryId: string, audit: AuditContext): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const category = await tx.category.findUnique({
      where: { id: categoryId },
      select: { slug: true, _count: { select: { products: true, children: true } } },
    })
    if (!category) throw new NotFoundError()
    if (category._count.products > 0 || category._count.children > 0) {
      throw new AppError(
        'CONFLICT',
        'Move its products and sub-categories first, or deactivate it',
        {
          status: 409,
          details: { reason: 'NOT_EMPTY' },
        },
      )
    }
    await tx.category.delete({ where: { id: categoryId } })
    await recordAudit(tx, audit, {
      action: 'category.deleted',
      entityType: 'category',
      entityId: categoryId,
      metadata: { slug: category.slug },
    })
  })
}

export async function listBrandsForAdmin() {
  return prisma.brand.findMany({
    orderBy: { nameEn: 'asc' },
    include: { _count: { select: { products: true } } },
  })
}

export async function saveBrand(
  brandId: string | null,
  input: BrandInput,
  audit: AuditContext,
): Promise<{ id: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      if (!brandId) {
        const created = await tx.brand.create({ data: input, select: { id: true } })
        await recordAudit(tx, audit, {
          action: 'brand.created',
          entityType: 'brand',
          entityId: created.id,
          metadata: { slug: input.slug },
        })
        return created
      }
      const before = await tx.brand.findUnique({ where: { id: brandId } })
      if (!before) throw new NotFoundError()
      await tx.brand.update({ where: { id: brandId }, data: input })
      await recordAudit(tx, audit, {
        action: 'brand.updated',
        entityType: 'brand',
        entityId: brandId,
        metadata: { slug: input.slug, changes: diffFields(before, input) },
      })
      return { id: brandId }
    })
  } catch (error) {
    slugTaken(error)
  }
}

export async function deleteBrand(brandId: string, audit: AuditContext): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const brand = await tx.brand.findUnique({
      where: { id: brandId },
      select: { slug: true, _count: { select: { products: true } } },
    })
    if (!brand) throw new NotFoundError()
    if (brand._count.products > 0) {
      throw new AppError('CONFLICT', 'Reassign its products first, or deactivate it', {
        status: 409,
        details: { reason: 'NOT_EMPTY' },
      })
    }
    await tx.brand.delete({ where: { id: brandId } })
    await recordAudit(tx, audit, {
      action: 'brand.deleted',
      entityType: 'brand',
      entityId: brandId,
      metadata: { slug: brand.slug },
    })
  })
}
