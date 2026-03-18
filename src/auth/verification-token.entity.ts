import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum VerificationTokenType {
  EMAIL = 'email',
  PHONE = 'phone',
  PASSWORD_RESET = 'password_reset',
}

@Entity('verification_tokens')
export class VerificationToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Stored as a bcrypt hash — never store raw OTPs in the DB.
   * Same principle as passwords: if the table is compromised, raw codes are useless.
   */
  @Column()
  code: string;

  @Column({
    type: 'enum',
    enum: VerificationTokenType,
    default: VerificationTokenType.EMAIL,
  })
  type: VerificationTokenType;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @Column({ name: 'used_at', nullable: true })
  usedAt: Date;

  @Column({ name: 'attempts', default: 0 })
  attempts: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  get isUsed(): boolean {
    // return this.usedAt instanceof Date;
    return !!this.usedAt;
  }
}