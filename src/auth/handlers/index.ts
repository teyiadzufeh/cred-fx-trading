import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { VerificationToken, VerificationTokenType } from '../verification-token.entity';
import { User } from '../../users/user.entity';
import { Wallet } from '../../wallets/wallet.entity';
import {
  SendVerificationEmailCommand,
  VerifyEmailCommand,
  ResendVerificationEmailCommand,
} from '../commands';
import { EmailService } from '../../common/providers/email.service';
import { Currency } from '../../common/enums';

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── Send Verification Email ──────────────────────────────────────────────────

@CommandHandler(SendVerificationEmailCommand)
export class SendVerificationEmailHandler
  implements ICommandHandler<SendVerificationEmailCommand>
{
  private readonly logger = new Logger(SendVerificationEmailHandler.name);

  constructor(
    @InjectRepository(VerificationToken)
    private readonly tokenRepo: Repository<VerificationToken>,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async execute({ userId, email, name }: SendVerificationEmailCommand): Promise<void> {
    await this.tokenRepo.delete({ userId, type: VerificationTokenType.EMAIL });

    const rawOtp = generateOtp();
    const hashedOtp = await bcrypt.hash(rawOtp, 10);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await this.tokenRepo.save(
      this.tokenRepo.create({
        code: hashedOtp,
        userId,
        type: VerificationTokenType.EMAIL,
        expiresAt,
        attempts: 0,
      }),
    );

    await this.emailService.sendMail({
      to: email,
      subject: 'Your verification code',
      html: this.emailService.buildOtpEmail(name, rawOtp),
    });

    this.logger.log(`Verification OTP sent to ${email}`);
  }
}

// ─── Verify Email ─────────────────────────────────────────────────────────────

@CommandHandler(VerifyEmailCommand)
export class VerifyEmailHandler implements ICommandHandler<VerifyEmailCommand> {
  private readonly MAX_ATTEMPTS = 5;
  private readonly logger = new Logger(VerifyEmailHandler.name);

  constructor(
    @InjectRepository(VerificationToken)
    private readonly tokenRepo: Repository<VerificationToken>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
  ) {}

  async execute({ email, code }: VerifyEmailCommand): Promise<{ message: string }> {
    // Look up user by email — no JWT required for this endpoint
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('No account found with this email address');
 
    if (user.emailVerified) {
      return { message: 'Email is already verified' };
    }
 
    const verificationToken = await this.tokenRepo.findOne({
      where: { userId: user.id, type: VerificationTokenType.EMAIL },
      order: { createdAt: 'DESC' },
    });
 
    if (!verificationToken) {
      throw new BadRequestException(
        'No verification code found. Please request a new one',
      );
    }
 
    if (verificationToken.isUsed) {
      throw new BadRequestException(
        'This code has already been used. Please request a new one',
      );
    }
 
    if (verificationToken.isExpired) {
      throw new BadRequestException(
        'This code has expired. Please request a new one',
      );
    }
 
    if (verificationToken.attempts >= this.MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Too many incorrect attempts. Please request a new code',
      );
    }
 
    const isMatch = await bcrypt.compare(code, verificationToken.code);
 
    if (!isMatch) {
      verificationToken.attempts += 1;
      await this.tokenRepo.save(verificationToken);
 
      const remaining = this.MAX_ATTEMPTS - verificationToken.attempts;
      let errorMessage: string;
      if (remaining > 0) {
        errorMessage = `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining`;
      } else {
        errorMessage = 'Too many incorrect attempts. Please request a new code';
      }
      throw new BadRequestException(errorMessage);
    }
 
    // Mark user verified and consume the token
    user.emailVerified = true;
    verificationToken.usedAt = new Date();
 
    await this.userRepo.save(user);
    await this.tokenRepo.save(verificationToken);
 
    // Auto-create a default NGN wallet for the user if they don't have one already
    const existingNgnWallet = await this.walletRepo.findOne({
      where: { userId: user.id, currency: Currency.NGN },
    });
    if (!existingNgnWallet) {
        const ngnWallet = this.walletRepo.create({
        userId: user.id,
        currency: Currency.NGN,
        balance: 0,
        });
    
        await this.walletRepo.save(ngnWallet);
        this.logger.log(`Default NGN wallet created for user ${user.id}`);
    }
    return { message: 'Email verified successfully.' };
  }
}

// ─── Resend Verification Email ────────────────────────────────────────────────

@CommandHandler(ResendVerificationEmailCommand)
export class ResendVerificationEmailHandler
  implements ICommandHandler<ResendVerificationEmailCommand>
{
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(VerificationToken)
    private readonly tokenRepo: Repository<VerificationToken>,
    private readonly emailService: EmailService,
  ) {}
 
  async execute({ email }: ResendVerificationEmailCommand): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('No account found with this email address');
    if (user.emailVerified) throw new BadRequestException('Email is already verified');
 
    const recentToken = await this.tokenRepo.findOne({
      where: { userId: user.id, type: VerificationTokenType.EMAIL },
      order: { createdAt: 'DESC' },
    });
 
    if (recentToken) {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      if (recentToken.createdAt > twoMinutesAgo) {
        throw new BadRequestException(
          'Please wait at least 2 minutes before requesting a new code',
        );
      }
    }
 
    await this.tokenRepo.delete({ userId: user.id, type: VerificationTokenType.EMAIL });
 
    const rawOtp = generateOtp();
    const hashedOtp = await bcrypt.hash(rawOtp, 10);
 
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);
 
    await this.tokenRepo.save(
      this.tokenRepo.create({
        code: hashedOtp,
        userId: user.id,
        type: VerificationTokenType.EMAIL,
        expiresAt,
        attempts: 0,
      }),
    );
 
    await this.emailService.sendMail({
      to: email,
      subject: 'Your new verification code',
      html: this.emailService.buildOtpEmail(user.firstName, rawOtp),
    });
 
    return { message: 'A new verification code has been sent to your email' };
  }
}

export const AuthHandlers = [
  SendVerificationEmailHandler,
  VerifyEmailHandler,
  ResendVerificationEmailHandler,
];