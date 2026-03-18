import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    if (isProduction) {
      this.transporter = nodemailer.createTransport({
        host: this.configService.get<string>('SMTP_HOST'),
        port: this.configService.get<number>('SMTP_PORT', 587),
        secure: false,
        auth: {
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.configService.get<string>('SMTP_PASS'),
        },
      });
    } else {
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      this.logger.log(`Ethereal test account: ${testAccount.user}`);
    }
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    const from = this.configService.get<string>('MAIL_FROM', 'no-reply@nestjs-app.com');

    try {
      const info = await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      if (this.configService.get('NODE_ENV') !== 'production') {
        this.logger.log(`Email preview: ${nodemailer.getTestMessageUrl(info)}`);
      }
    } catch (err) {
      this.logger.error(`Failed to send email to ${options.to}`, err);
      throw err;
    }
  }

  buildOtpEmail(name: string, otp: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Verify your email address</h2>
        <p>Hi ${name},</p>
        <p>Use the code below to verify your email. It expires in <strong>10 minutes</strong>.</p>
        <div style="text-align: center; margin: 32px 0;">
          <span style="display: inline-block; font-size: 36px; font-weight: bold;
                       letter-spacing: 12px; padding: 16px 32px; background: #F3F4F6;
                       border-radius: 8px; color: #111827;">
            ${otp}
          </span>
        </div>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `;
  }
}