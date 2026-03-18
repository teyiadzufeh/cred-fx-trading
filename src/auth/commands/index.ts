export class SendVerificationEmailCommand {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly name: string,
  ) {}
}

export class VerifyEmailCommand {
  constructor(
    public readonly email: string,
    public readonly code: string,
  ) {}
}

export class ResendVerificationEmailCommand {
  constructor(
    public readonly email: string,
  ) {}
}