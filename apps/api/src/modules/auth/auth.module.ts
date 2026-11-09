import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MeController } from './me.controller';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, PasswordService, RefreshTokenService],
  exports: [AuthService, PasswordService, RefreshTokenService],
})
export class AuthModule {}
