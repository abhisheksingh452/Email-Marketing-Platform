import { Module } from '@nestjs/common';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, SessionService, SessionAuthGuard],
  exports: [AuthService, SessionService, SessionAuthGuard],
})
export class AuthModule {}
