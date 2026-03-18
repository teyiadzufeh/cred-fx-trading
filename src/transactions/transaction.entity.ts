import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  TransactionAction,
  TransactionStatus,
  TransactionType,
  Currency,
} from '../common/enums';
import { User } from '../users/user.entity';
import { Wallet } from '../wallets/wallet.entity';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * action: what the user did        (deposit, withdrawal, transfer, conversion, payment)
   * type:   direction of fund movement (credit = money in, debit = money out)
   * status: lifecycle state           (pending → completed | failed | reversed)
   */
  @Column({
    type: 'enum',
    enum: TransactionAction,
  })
  action: TransactionAction;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 4,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  amount: number;

  /**
   * rate_used: the FX rate at the time of the transaction.
   * Always store this even for same-currency transactions (store 1.0000).
   * Critical for audit trails and dispute resolution.
   */
  @Column({
    name: 'rate_used',
    type: 'decimal',
    precision: 20,
    scale: 6,
    default: 1,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  rateUsed: number;

  @Column({
    type: 'enum',
    enum: Currency,
    name: 'source_currency',
  })
  sourceCurrency: Currency;

  @Column({
    type: 'enum',
    enum: Currency,
    name: 'destination_currency',
    nullable: true,
  })
  destinationCurrency: Currency;

  /** Optional reference for idempotency — e.g. from a payment provider */
  @Column({ nullable: true, unique: true })
  reference: string;

  /** Free-form metadata (provider response, failure reason, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.transactions)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'wallet_id' })
  walletId: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
