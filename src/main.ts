import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Validation ─────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // Strip properties not in the DTO
      forbidNonWhitelisted: true,   // Throw on unknown properties
      transform: true,              // Auto-cast query params and body to DTO types
      transformOptions: {
        enableImplicitConversion: true, // Lets @IsNumber() work on query params
      },
    }),
  );

  // ── Global exception filter ─────────────────────────────────────────────────
  // Must be registered after the app is created so the logger is available
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ── Response envelope ───────────────────────────────────────────────────────
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ── Routing ─────────────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── CORS ────────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀  Server running at http://localhost:${port}/api/v1`);
}

bootstrap();