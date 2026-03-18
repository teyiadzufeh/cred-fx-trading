import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateUserCommand } from '../users/commands';
import { GetUserByEmailQuery } from '../users/queries';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { SendVerificationEmailCommand } from './commands';

@Injectable()
export class AuthService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: CreateUserDto) {
    const user = await this.commandBus.execute(new CreateUserCommand(dto));

    // Fire verification email after registration — non-blocking
    // If email sending fails, registration still succeeds; user can resend
    this.commandBus
      .execute(
        new SendVerificationEmailCommand(
          user.id,
          user.email,
          user.firstName,
        ),
      )
      .catch((err) => console.error('Failed to send verification email', err));

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified,
      },
      accessToken: this.generateToken(user),
      message: 'Registration successful. Please check your email to verify your account',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.queryBus.execute(new GetUserByEmailQuery(dto.email));

    if (!user?.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await user.validatePassword(dto.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified,
      },
      accessToken: this.generateToken(user),
    };
  }

  private generateToken(user: { id: string; email: string; role: string }): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }
}