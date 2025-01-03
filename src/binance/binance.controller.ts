import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { BinanceApiService } from './binance-api.service';
import { StockUtilService } from '../util/stock-util.service';

@Controller('/binance')
export class BinanceController {
  constructor(
    private readonly binanceApiService: BinanceApiService,
    private readonly stockUtilService: StockUtilService,
  ) {}

  @Get('/ping')
  async getPing() {
    return this.binanceApiService.ping();
  }

  @Get('/balance')
  async getBalance() {
    return this.binanceApiService.getAccount();
  }

  @Get('/candles')
  async getCandles(
    @Query('symbol') symbol: string,
    @Query('interval') interval: string,
    @Query('limit', ParseIntPipe) limit: number,
  ) {
    return this.binanceApiService.getCandles(symbol, interval, limit);
  }

  @Get('/candles/williams-fractals')
  async getWilliamsFractals(
    @Query('symbol') symbol: string,
    @Query('interval') interval: string,
    @Query('limit', ParseIntPipe) limit: number,
  ) {
    const candles = await this.binanceApiService.getCandles(
      symbol,
      interval,
      limit,
    );

    return this.stockUtilService.calculateWilliamsFractals(candles, 2);
  }
}
