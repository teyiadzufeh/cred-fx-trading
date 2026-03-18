import {
  Controller,
  Post,
  Body,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CreateUserDto } from '../users/dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import {
  VerifyEmailCommand,
  ResendVerificationEmailCommand,
} from './commands';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly commandBus: CommandBus,
  ) {}

  // POST /api/v1/auth/register
  @Post('register')
  register(@Body() dto: CreateUserDto) {
    return this.authService.register(dto);
  }

  // POST /api/v1/auth/login
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // POST /api/v1/auth/verify
  // User submits the 6-digit code from their email
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto, @Request() req) {
    return this.commandBus.execute(
      new VerifyEmailCommand(dto.email, dto.code),
    );
  }

  // POST /api/v1/auth/resend-verification
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.commandBus.execute(
      new ResendVerificationEmailCommand(dto.email),
    );
  }
}