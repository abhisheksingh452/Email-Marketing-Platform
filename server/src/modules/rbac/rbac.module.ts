import { Global, Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RolesController } from './roles.controller';

@Global()
@Module({ controllers: [RolesController], providers: [RbacService], exports: [RbacService] })
export class RbacModule {}
