import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenService } from './auth/access-token.service';
import { RequestContext } from './context/request-context';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [AccessTokenService, RequestContext],
  exports: [AccessTokenService, RequestContext],
})
export class CommonModule {}
