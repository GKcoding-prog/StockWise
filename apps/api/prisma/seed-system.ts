import {
  PERMISSIONS,
  PERMISSION_KEYS,
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  SYSTEM_ROLES,
} from '@stockwise/shared';
import type { PrismaClient } from '../src/generated/prisma/client';

/**
 * Permission rows and the three system roles with their permission sets (docs/03 §2).
 * Idempotent: safe to run on every deploy; it also removes permissions dropped from a role.
 */
export async function seedSystemRoles(prisma: PrismaClient): Promise<Record<string, string>> {
  for (const key of PERMISSION_KEYS) {
    const { group, description } = PERMISSIONS[key];
    await prisma.permission.upsert({
      where: { key },
      create: { key, group, description },
      update: { group, description },
    });
  }

  const roleIds: Record<string, string> = {};
  for (const key of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({ where: { businessId: null, key } });
    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { name: ROLE_NAMES[key], isSystem: true },
        })
      : await prisma.role.create({ data: { key, name: ROLE_NAMES[key], isSystem: true } });
    roleIds[key] = role.id;

    const wanted = ROLE_PERMISSIONS[key];
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionKey: { notIn: wanted } },
    });
    await prisma.rolePermission.createMany({
      data: wanted.map((permissionKey) => ({ roleId: role.id, permissionKey })),
      skipDuplicates: true,
    });
  }
  return roleIds;
}
