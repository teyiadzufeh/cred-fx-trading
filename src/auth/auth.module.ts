import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { VerificationToken } from './verification-token.entity';
import { AuthHandlers } from './handlers';
import { EmailService } from '../common/providers/email.service';
import { User } from '../users/user.entity';
import { Wallet } from 'src/wallets/wallet.entity';
import ms from 'ms';

@Module({
  imports: [
    CqrsModule,
    UsersModule,
    TypeOrmModule.forFeature([VerificationToken, User, Wallet]),
    PassportModule.register({defaultStrategy: 'jwt'}),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d') as ms.StringValue,
        },
      }),
      inject: [ConfigService],
    }),
    ConfigModule
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    EmailService,
    ...AuthHandlers,
  ],
  exports: [AuthService, EmailService],
})
export class AuthModule {}
