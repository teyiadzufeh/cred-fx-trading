import {
  CommandHandler,
  ICommandHandler,
  QueryHandler,
  IQueryHandler,
} from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Wallet } from '../wallet.entity';
import {
  CreateWalletCommand,
  FundWalletCommand,
  DebitWalletCommand,
} from '../commands';
import { GetWalletByIdQuery, GetUserWalletsQuery } from '../queries';

// ─── Command Handlers ────────────────────────────────────────────────────────

@CommandHandler(CreateWalletCommand)
export class CreateWalletHandler implements ICommandHandler<CreateWalletCommand> {
  constructor(
    @InjectRepository(Wallet) private readonly repo: Repository<Wallet>,
  ) {}

  async execute({ userId, currency }: CreateWalletCommand): Promise<Wallet> {
    // Enforce the unique (user, currency) constraint at the service layer
    // before hitting the DB constraint — gives a cleaner error message.
    const existing = await this.repo.findOne({ where: { userId, currency } });
    if (existing) {
      throw new ConflictException(
        `You already have a ${currency} wallet`,
      );
    }

    const wallet = this.repo.create({ userId, currency, balance: 0 });
    return this.repo.save(wallet);
  }
}

@CommandHandler(FundWalletCommand)
export class FundWalletHandler implements ICommandHandler<FundWalletCommand> {
  constructor(
    @InjectRepository(Wallet) private readonly repo: Repository<Wallet>,
  ) {}

  async execute({ walletId, userId, amount }: FundWalletCommand): Promise<Wallet> {
    const wallet = await this.repo.findOne({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.userId !== userId) throw new ForbiddenException('Not your wallet');

    wallet.balance = Number.parseFloat((wallet.balance + amount).toFixed(4));
    return this.repo.save(wallet);
  }
}

@CommandHandler(DebitWalletCommand)
export class DebitWalletHandler implements ICommandHandler<DebitWalletCommand> {
  constructor(
    @InjectRepository(Wallet) private readonly repo: Repository<Wallet>,
  ) {}

  async execute({ walletId, userId, amount }: DebitWalletCommand): Promise<Wallet> {
    const wallet = await this.repo.findOne({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.userId !== userId) throw new ForbiddenException('Not your wallet');
    if (wallet.balance < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    wallet.balance = Number.parseFloat((wallet.balance - amount).toFixed(4));
    return this.repo.save(wallet);
  }
}

// ─── Query Handlers ───────────────────────────────────────────────────────────

@QueryHandler(GetWalletByIdQuery)
export class GetWalletByIdHandler implements IQueryHandler<GetWalletByIdQuery> {
  constructor(
    @InjectRepository(Wallet) private readonly repo: Repository<Wallet>,
  ) {}

  async execute({ id, userId }: GetWalletByIdQuery): Promise<Wallet> {
    const wallet = await this.repo.findOne({ where: { id } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.userId !== userId) throw new ForbiddenException('Not your wallet');
    return wallet;
  }
}

@QueryHandler(GetUserWalletsQuery)
export class GetUserWalletsHandler implements IQueryHandler<GetUserWalletsQuery> {
  constructor(
    @InjectRepository(Wallet) private readonly repo: Repository<Wallet>,
  ) {}

  async execute({ userId, currency }: GetUserWalletsQuery): Promise<Wallet | Wallet[]> {
    const where: any = { userId, isActive: true };
    if (currency) where.currency = currency;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }
}

export const WalletHandlers = [
  CreateWalletHandler,
  FundWalletHandler,
  DebitWalletHandler,
  GetWalletByIdHandler,
  GetUserWalletsHandler,
];
