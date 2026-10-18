import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  // Đứng sau reverse proxy / Next.js rewrite → lấy IP thật từ X-Forwarded-For
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle('HRM Bệnh viện Bạch Mai API')
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, '127.0.0.1');
  console.log(`API: http://127.0.0.1:${port}/api/v1 — Swagger: http://127.0.0.1:${port}/api/docs`);
}

void bootstrap();
