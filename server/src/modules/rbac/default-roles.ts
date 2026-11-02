import type { PrismaClient } from '@prisma/client';
import { ALL_PERMISSION_CODES, PERMISSION_CATALOG, PermissionCode } from './permissions';

export const SUPER_ADMIN_ROLE = 'Super Admin';

interface RoleTemplate {
  name: string;
  description: string;
  permissions: PermissionCode[];
}

const without = (...excluded: PermissionCode[]) => ALL_PERMISSION_CODES.filter((c) => !excluded.includes(c));

/** Defaults derived from SRS section 3. Tune freely; re-running the seed re-syncs system roles. */
export const DEFAULT_ROLES: RoleTemplate[] = [
  {
    name: SUPER_ADMIN_ROLE,
    description: 'Platform setup, security, providers, domains, users',
    permissions: ALL_PERMISSION_CODES,
  },
  {
    name: 'Admin',
    description: 'Operations and campaign governance',
    permissions: without('providers.manage', 'deliverability.manage', 'users.manage', 'settings.manage'),
  },
  {
    name: 'Marketing Manager',
    description: 'Campaign creation and analysis',
    permissions: [
      'contacts.read', 'contacts.write', 'contacts.export',
      'campaigns.read', 'campaigns.create', 'campaigns.edit', 'campaigns.send', 'campaigns.pause', 'campaigns.cancel',
      'templates.read', 'templates.write', 'templates.publish',
      'segments.read', 'segments.write',
      'analytics.read', 'analytics.export',
      'deliverability.read',
    ],
  },
  {
    name: 'Campaign Operator',
    description: 'Day-to-day campaign execution',
    permissions: [
      'contacts.read', 'contacts.write', 'contacts.import',
      'campaigns.read', 'campaigns.create', 'campaigns.edit', 'campaigns.send',
      'templates.read', 'templates.write',
      'segments.read',
    ],
  },
  {
    name: 'Analyst / Viewer',
    description: 'Read-only reporting',
    permissions: ['analytics.read', 'analytics.export', 'campaigns.read'],
  },
];

/** Upserts the permission catalog. Returns code -> id. */
export async function ensurePermissionCatalog(prisma: PrismaClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const { code, description } of PERMISSION_CATALOG) {
    const p = await prisma.permission.upsert({ where: { code }, update: { description }, create: { code, description } });
    map.set(code, p.id);
  }
  return map;
}

/** Creates (or re-syncs) the standard system roles for a workspace. Returns name -> id. */
export async function createDefaultRoles(prisma: PrismaClient, workspaceId: string): Promise<Map<string, string>> {
  const permissionIds = await ensurePermissionCatalog(prisma);
  const roleIds = new Map<string, string>();
  for (const tpl of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { workspaceId_name: { workspaceId, name: tpl.name } },
      update: { description: tpl.description },
      create: { workspaceId, name: tpl.name, description: tpl.description, isSystem: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: tpl.permissions.map((code) => ({ roleId: role.id, permissionId: permissionIds.get(code)! })),
      skipDuplicates: true,
    });
    roleIds.set(tpl.name, role.id);
  }
  return roleIds;
}
