import {
  CommandHandler,
  ICommandHandler,
  QueryHandler,
  IQueryHandler,
} from '@nestjs/cqrs';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Transaction } from '../transaction.entity';
import { Wallet } from '../../wallets/wallet.entity';
import {
  CreateTransactionCommand,
  UpdateTransactionStatusCommand,
  ReverseTransactionCommand,
} from '../commands';
import {
  GetTransactionByIdQuery,
  GetTransactionByReferenceQuery,
  GetUserTransactionsQuery,
  GetAllTransactionsQuery,
} from '../queries';
import { TransactionStatus, TransactionType } from '../../common/enums';
import { FxRateService } from '../../common/providers/fx-rate.service';

// ─── Command Handlers ────────────────────────────────────────────────────────

@CommandHandler(CreateTransactionCommand)
export class CreateTransactionHandler
  implements ICommandHandler<CreateTransactionCommand>
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly fxRateService: FxRateService,
  ) {}

  async execute({ userId, dto }: CreateTransactionCommand): Promise<Transaction> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the wallet row for the duration of this transaction
      // NOWAIT means it fails immediately if another request has a lock — no queue buildup
      const wallet = await queryRunner.manager
        .getRepository(Wallet)
        .createQueryBuilder('wallet')
        .where('wallet.id = :id AND wallet.user_id = :userId', {
          id: dto.walletId,
          userId,
        })
        .setLock('pessimistic_write_or_fail')
        .getOne();

      if (!wallet) throw new NotFoundException('Wallet not found or access denied');
      if (!wallet.isActive) throw new BadRequestException('Wallet is inactive');

      // Resolve FX rate — use provided rate if given, otherwise fetch live
      const sourceCurrency = dto.sourceCurrency;
      const destinationCurrency = dto.destinationCurrency ?? dto.sourceCurrency;

      const rateUsed =
        dto.rateUsed ?? (await this.fxRateService.getRate(sourceCurrency, destinationCurrency));

      // Guard: sufficient balance for debits
      if (dto.type === TransactionType.DEBIT && wallet.balance < dto.amount) {
        throw new BadRequestException(
          `Insufficient balance. Available: ${wallet.balance} ${wallet.currency}`,
        );
      }

      // Apply balance change atomically inside the transaction
      if (dto.type === TransactionType.CREDIT) {
        wallet.balance = parseFloat((wallet.balance + dto.amount).toFixed(4));
      } else {
        wallet.balance = parseFloat((wallet.balance - dto.amount).toFixed(4));
      }

      await queryRunner.manager.save(Wallet, wallet);

      // Create the transaction record in the same DB transaction
      const transaction = queryRunner.manager.create(Transaction, {
        ...dto,
        userId,
        walletId: wallet.id,
        sourceCurrency,
        destinationCurrency,
        rateUsed,
        status: TransactionStatus.PENDING,
      });

      const saved = await queryRunner.manager.save(Transaction, transaction);
      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}

@CommandHandler(UpdateTransactionStatusCommand)
export class UpdateTransactionStatusHandler
  implements ICommandHandler<UpdateTransactionStatusCommand>
{
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async execute({ id, dto }: UpdateTransactionStatusCommand): Promise<Transaction> {
    const tx = await this.txRepo.findOne({ where: { id } });
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);

    if (tx.status === TransactionStatus.REVERSED) {
      throw new BadRequestException('A reversed transaction cannot be updated');
    }
    if (
      tx.status === TransactionStatus.COMPLETED &&
      dto.status === TransactionStatus.PENDING
    ) {
      throw new BadRequestException(
        'Cannot move a completed transaction back to pending',
      );
    }

    tx.status = dto.status;
    if (dto.metadata) {
      tx.metadata = { ...(tx.metadata ?? {}), ...dto.metadata };
    }

    return this.txRepo.save(tx);
  }
}

@CommandHandler(ReverseTransactionCommand)
export class ReverseTransactionHandler
  implements ICommandHandler<ReverseTransactionCommand>
{
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute({ id }: ReverseTransactionCommand): Promise<Transaction> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tx = await queryRunner.manager.findOne(Transaction, { where: { id } });
      if (!tx) throw new NotFoundException(`Transaction ${id} not found`);
      if (tx.status !== TransactionStatus.COMPLETED) {
        throw new BadRequestException('Only completed transactions can be reversed');
      }

      const wallet = await queryRunner.manager
        .getRepository(Wallet)
        .createQueryBuilder('wallet')
        .where('wallet.id = :id', { id: tx.walletId })
        .setLock('pessimistic_write_or_fail')
        .getOne();

      if (!wallet) throw new NotFoundException('Associated wallet not found');

      // Undo the original balance movement
      if (tx.type === TransactionType.CREDIT) {
        if (wallet.balance < tx.amount) {
          throw new BadRequestException(
            'Insufficient balance to reverse this credit',
          );
        }
        wallet.balance = parseFloat((wallet.balance - tx.amount).toFixed(4));
      } else {
        wallet.balance = parseFloat((wallet.balance + tx.amount).toFixed(4));
      }

      await queryRunner.manager.save(Wallet, wallet);

      tx.status = TransactionStatus.REVERSED;
      tx.metadata = {
        ...(tx.metadata ?? {}),
        reversedAt: new Date().toISOString(),
      };

      const saved = await queryRunner.manager.save(Transaction, tx);
      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}

// ─── Query Handlers ───────────────────────────────────────────────────────────

@QueryHandler(GetTransactionByIdQuery)
export class GetTransactionByIdHandler
  implements IQueryHandler<GetTransactionByIdQuery>
{
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async execute({ id, userId }: GetTransactionByIdQuery): Promise<Transaction> {
    const tx = await this.txRepo.findOne({
      where: { id },
      relations: ['wallet'],
    });
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);
    if (tx.userId !== userId) throw new ForbiddenException('Access denied');
    return tx;
  }
}

@QueryHandler(GetTransactionByReferenceQuery)
export class GetTransactionByReferenceHandler
  implements IQueryHandler<GetTransactionByReferenceQuery>
{
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async execute({ reference }: GetTransactionByReferenceQuery): Promise<Transaction | null> {
    return this.txRepo.findOne({ where: { reference } });
  }
}

@QueryHandler(GetUserTransactionsQuery)
export class GetUserTransactionsHandler
  implements IQueryHandler<GetUserTransactionsQuery>
{
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async execute({ userId, filters }: GetUserTransactionsQuery) {
    const { action, status, type, walletId, page = 1, limit = 20 } = filters;

    const qb = this.txRepo
      .createQueryBuilder('tx')
      .where('tx.user_id = :userId', { userId })
      .orderBy('tx.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (action) qb.andWhere('tx.action = :action', { action });
    if (status) qb.andWhere('tx.status = :status', { status });
    if (type) qb.andWhere('tx.type = :type', { type });
    if (walletId) qb.andWhere('tx.wallet_id = :walletId', { walletId });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

@QueryHandler(GetAllTransactionsQuery)
export class GetAllTransactionsHandler
  implements IQueryHandler<GetAllTransactionsQuery>
{
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async execute({ filters }: GetAllTransactionsQuery) {
    const { action, status, type, walletId, page = 1, limit = 20 } = filters;

    const qb = this.txRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.user', 'user')
      .leftJoinAndSelect('tx.wallet', 'wallet')
      .orderBy('tx.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (action) qb.andWhere('tx.action = :action', { action });
    if (status) qb.andWhere('tx.status = :status', { status });
    if (type) qb.andWhere('tx.type = :type', { type });
    if (walletId) qb.andWhere('tx.wallet_id = :walletId', { walletId });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

export const TransactionHandlers = [
  CreateTransactionHandler,
  UpdateTransactionStatusHandler,
  ReverseTransactionHandler,
  GetTransactionByIdHandler,
  GetTransactionByReferenceHandler,
  GetUserTransactionsHandler,
  GetAllTransactionsHandler,
];