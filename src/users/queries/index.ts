export class GetUserByIdQuery {
  constructor(public readonly id: string) {}
}

export class GetUserByEmailQuery {
  constructor(public readonly email: string) {}
}

export class GetAllUsersQuery {
  constructor(
    public readonly page: number = 1,
    public readonly limit: number = 20,
  ) {}
}
