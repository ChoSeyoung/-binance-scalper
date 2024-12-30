import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { BinanceService } from './binance.service';

@Controller('/binance')
export class BinanceController {
  constructor(private readonly binanceService: BinanceService) {}

  @Get('/ping')
  async getPing() {
    return this.binanceService.ping();
  }

  @Get('/candles')
  async getCandles(
    @Query('symbol') symbol: string,
    @Query('interval') interval: string,
    @Query('limit', ParseIntPipe) limit: number,
  ) {
    return this.binanceService.getCandles(symbol, interval, limit);
  }

  @Get('/candles/williams-fractals')
  async getWilliamsFractals(
    @Query('symbol') symbol: string,
    @Query('interval') interval: string,
    @Query('limit', ParseIntPipe) limit: number,
  ) {
    const candles = await this.binanceService.getCandles(
      symbol,
      interval,
      limit,
    );

    return this.binanceService.calculateWilliamsFractals(candles, 7);
  }

  @Get('/check-long-entry')
  async checkLongEntry() {
    const symbol = 'BTCUSDT'; // 예시로 BTC/USDT 사용
    const isLongEntry = await this.binanceService.checkLongEntry(symbol);

    if (isLongEntry) {
      const { stopLoss, takeProfit } =
        await this.binanceService.calculateExitPrices(symbol);
      return {
        message: '롱 매수 포지션 진입 가능',
        stopLoss,
        takeProfit,
      };
    } else {
      return { message: '롱 매수 조건 불충족' };
    }
  }
}
