import { PrismaClient, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { SUPER_ADMIN_ROLE, createDefaultRoles } from '../src/modules/rbac/default-roles';

const prisma = new PrismaClient();

async function main() {
  const workspaceName = process.env.SEED_WORKSPACE_NAME ?? 'Default Workspace';
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').trim().toLowerCase();
  const name = process.env.SEED_ADMIN_NAME ?? 'Super Admin';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('Set SEED_ADMIN_PASSWORD (min 12 chars) in apps/api/.env before seeding');
  }

  const workspace =
    (await prisma.workspace.findFirst({ where: { name: workspaceName } })) ??
    (await prisma.workspace.create({ data: { name: workspaceName } }));

  const roleIds = await createDefaultRoles(prisma, workspace.id);

  const user = await prisma.user.upsert({
    where: { workspaceId_email: { workspaceId: workspace.id, email } },
    update: {},
    create: {
      workspaceId: workspace.id,
      email,
      name,
      status: UserStatus.ACTIVE,
      passwordHash: await argon2.hash(password),
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: roleIds.get(SUPER_ADMIN_ROLE)! } },
    update: {},
    create: { userId: user.id, roleId: roleIds.get(SUPER_ADMIN_ROLE)! },
  });

  console.log(`Seeded workspace "${workspace.name}" with Super Admin ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
