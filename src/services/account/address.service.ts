import 'server-only'
import { prisma } from '@/db/client'
import { AppError, NotFoundError } from '@/lib/errors'
import type { AddressData } from '@/schemas/address'

/**
 * Customer address book. Every query is scoped by `userId` — a customer can
 * never read, change or delete another customer's address, even with a valid
 * address id (IDOR protection). A missing or foreign id both return 404 so
 * existence is not revealed.
 */

export const MAX_ADDRESSES_PER_USER = 20

const addressSelect = {
  id: true,
  label: true,
  fullName: true,
  phone: true,
  city: true,
  district: true,
  street: true,
  buildingNumber: true,
  postalCode: true,
  additionalNumber: true,
  shortAddress: true,
  instructions: true,
  country: true,
  isDefault: true,
  createdAt: true,
} as const

export type AddressDto = Awaited<ReturnType<typeof listAddresses>>[number]

export async function listAddresses(userId: string) {
  return prisma.address.findMany({
    where: { userId },
    select: addressSelect,
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function getAddress(userId: string, addressId: string) {
  const address = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: addressSelect,
  })
  if (!address) throw new NotFoundError('ADDRESS_NOT_FOUND', 'Address not found')
  return address
}

export async function createAddress(userId: string, data: AddressData) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { userId } })
    if (count >= MAX_ADDRESSES_PER_USER) {
      throw new AppError('QUANTITY_LIMIT_EXCEEDED', 'Address book is full', { status: 409 })
    }
    const makeDefault = data.isDefault || count === 0
    if (makeDefault)
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      })
    return tx.address.create({
      data: { ...data, userId, isDefault: makeDefault },
      select: addressSelect,
    })
  })
}

export async function updateAddress(userId: string, addressId: string, data: AddressData) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({
      where: { id: addressId, userId },
      select: { id: true, isDefault: true },
    })
    if (!existing) throw new NotFoundError('ADDRESS_NOT_FOUND', 'Address not found')
    if (data.isDefault && !existing.isDefault) {
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      })
    }
    // Un-defaulting is only possible by choosing another default address.
    return tx.address.update({
      where: { id: existing.id },
      data: { ...data, isDefault: existing.isDefault || data.isDefault },
      select: addressSelect,
    })
  })
}

export async function deleteAddress(userId: string, addressId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({
      where: { id: addressId, userId },
      select: { id: true, isDefault: true },
    })
    if (!existing) throw new NotFoundError('ADDRESS_NOT_FOUND', 'Address not found')
    await tx.address.delete({ where: { id: existing.id } })
    if (existing.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } })
    }
  })
}

export async function setDefaultAddress(userId: string, addressId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({
      where: { id: addressId, userId },
      select: { id: true },
    })
    if (!existing) throw new NotFoundError('ADDRESS_NOT_FOUND', 'Address not found')
    await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } })
    return tx.address.update({
      where: { id: existing.id },
      data: { isDefault: true },
      select: addressSelect,
    })
  })
}
