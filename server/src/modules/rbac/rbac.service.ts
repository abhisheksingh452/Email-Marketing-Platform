import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  /** Role names + effective permission codes for a user (one query). */
  async getAccess(userId: string): Promise<{ roles: string[]; permissions: string[] }> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { name: true, permissions: { select: { permission: { select: { code: true } } } } } } },
    });
    return {
      roles: rows.map((r) => r.role.name),
      permissions: [...new Set(rows.flatMap((r) => r.role.permissions.map((p) => p.permission.code)))],
    };
  }

  async listRoles(workspaceId: string) {
    const roles = await this.prisma.role.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permission.code).sort(),
    }));
  }
}
