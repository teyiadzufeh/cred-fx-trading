import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Unique,
} from 'typeorm';
import { Currency } from '../common/enums';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';

/**
 * The @Unique(['userId', 'currency']) constraint ensures a user can only have
 * one wallet per currency at the database level — this is enforced both here
 * and should be validated at the service layer before attempting an insert.
 */
@Entity('wallets')
@Unique(['userId', 'currency'])
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 4,
    default: 0,
    transformer: {
      // TypeORM returns decimal columns as strings from pg — always parse to float
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  balance: number;

  @Column({
    type: 'enum',
    enum: Currency,
  })
  currency: Currency;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.wallets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions: Transaction[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
