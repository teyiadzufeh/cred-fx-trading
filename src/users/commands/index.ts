import { CreateUserDto, UpdateUserDto, UpdateUserRoleDto } from '../dto';

export class CreateUserCommand {
  constructor(public readonly dto: CreateUserDto) {}
}

export class UpdateUserCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateUserDto,
    public readonly requesterId: string,
  ) {}
}

export class UpdateUserRoleCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateUserRoleDto,
  ) {}
}

export class DeactivateUserCommand {
  constructor(public readonly id: string) {}
}
