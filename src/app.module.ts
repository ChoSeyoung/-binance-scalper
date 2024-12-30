import { Module } from '@nestjs/common';
import { BinanceModule } from './binance/binance.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [BinanceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
