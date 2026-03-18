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
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { User } from '../user.entity';
import {
  CreateUserCommand,
  UpdateUserCommand,
  UpdateUserRoleCommand,
  DeactivateUserCommand,
} from '../commands';
import {
  GetUserByIdQuery,
  GetUserByEmailQuery,
  GetAllUsersQuery,
} from '../queries';
import { UserRole } from '../../common/enums';

// ─── Command Handlers ────────────────────────────────────────────────────────

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  async execute({ dto }: CreateUserCommand): Promise<User> {
    const existing = await this.repo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const user = this.repo.create(dto);
    return this.repo.save(user);
  }
}

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand> {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  async execute({ id, dto, requesterId }: UpdateUserCommand): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    // Users can only update themselves; admins can update anyone
    if (user.id !== requesterId && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own profile');
    }

    Object.assign(user, dto);
    return this.repo.save(user);
  }
}

@CommandHandler(UpdateUserRoleCommand)
export class UpdateUserRoleHandler
  implements ICommandHandler<UpdateUserRoleCommand>
{
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  async execute({ id, dto }: UpdateUserRoleCommand): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    user.role = dto.role;
    return this.repo.save(user);
  }
}

@CommandHandler(DeactivateUserCommand)
export class DeactivateUserHandler
  implements ICommandHandler<DeactivateUserCommand>
{
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  async execute({ id }: DeactivateUserCommand): Promise<void> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    user.isActive = false;
    await this.repo.save(user);
  }
}

// ─── Query Handlers ───────────────────────────────────────────────────────────

@QueryHandler(GetUserByIdQuery)
export class GetUserByIdHandler implements IQueryHandler<GetUserByIdQuery> {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  async execute({ id }: GetUserByIdQuery): Promise<User> {
    const user = await this.repo.findOne({
      where: { id },
      relations: ['wallets'],
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }
}

@QueryHandler(GetUserByEmailQuery)
export class GetUserByEmailHandler
  implements IQueryHandler<GetUserByEmailQuery>
{
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  async execute({ email }: GetUserByEmailQuery): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }
}

@QueryHandler(GetAllUsersQuery)
export class GetAllUsersHandler implements IQueryHandler<GetAllUsersQuery> {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  async execute({ page, limit }: GetAllUsersQuery) {
    const [data, total] = await this.repo.findAndCount({
      where: { isActive: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

export const UserHandlers = [
  CreateUserHandler,
  UpdateUserHandler,
  UpdateUserRoleHandler,
  DeactivateUserHandler,
  GetUserByIdHandler,
  GetUserByEmailHandler,
  GetAllUsersHandler,
];
