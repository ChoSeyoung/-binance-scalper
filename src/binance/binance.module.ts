import { Module } from '@nestjs/common';
import { BinanceController } from './binance.controller';
import { BinanceService } from './binance.service';
import { UtilModule } from '../util/util.module';
import { BinanceApiService } from './binance-api.service';

@Module({
  imports: [UtilModule],
  controllers: [BinanceController],
  providers: [BinanceService, BinanceApiService],
})
export class BinanceModule {}
