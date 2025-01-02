import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as process from 'node:process';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);

  console.log(process.env.BINANCE_API_KEY);
  console.log(process.env.BINANCE_SECRET_KEY);
}
bootstrap();
