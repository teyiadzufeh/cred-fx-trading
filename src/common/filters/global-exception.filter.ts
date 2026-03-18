import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object') {
        const resObj = res as any;
        message = resObj.message ?? message;
        // class-validator returns an array of messages — surface them
        if (Array.isArray(resObj.message)) {
          errors = resObj.message;
          message = 'Validation failed';
        }
      }
    } else if (exception instanceof QueryFailedError) {
      // PostgreSQL unique violation (23505)
      if ((exception as any).code === '23505') {
        status = HttpStatus.CONFLICT;
        message = 'A record with this value already exists';
      } else {
        this.logger.error('Database error', (exception as any).message);
      }
    } else {
      this.logger.error('Unhandled exception', exception);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(errors && { errors }),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
