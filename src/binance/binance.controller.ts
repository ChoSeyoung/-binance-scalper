import { Controller, Get, ParseIntPipe, Post, Query } from '@nestjs/common';
import { BinanceApiService } from './binance-api.service';
import { StockUtilService } from '../util/stock-util.service';
import {
  BINANCE_ORDER_TYPE,
  BINANCE_SYMBOL,
  POSITION,
  SIDE,
  TIME_IN_FORCE,
} from '../common/constants/app.constants';
import { BinanceService } from './binance.service';

@Controller('/binance')
export class BinanceController {
  constructor(
    private readonly binanceService: BinanceService,
    private readonly binanceApiService: BinanceApiService,
    private readonly stockUtilService: StockUtilService,
  ) {}

  @Get('/ping')
  async getPing() {
    return this.binanceApiService.ping();
  }

  @Get('/account')
  async getAccount() {
    return this.binanceApiService.getAccount();
  }

  @Get('/balance')
  async getBalance() {
    return this.binanceApiService.getBalances();
  }

  @Get('/position-risk')
  async getPositionRisk() {
    return this.binanceApiService.getPositionRisk(BINANCE_SYMBOL.XRPUSDT);
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

  @Post('/order')
  async order() {
    const symbol = BINANCE_SYMBOL.XRPUSDT;
    const position = POSITION.LONG;
    const profitStopPrice = 10;
    const lossStopPrice = 1;

    await this.binanceApiService.newOrder({
      symbol: symbol,
      side: SIDE.BUY,
      quantity: 5,
      type: BINANCE_ORDER_TYPE.MARKET,
    });

    await this.binanceService.setProfitAndLoss(
      symbol,
      position,
      profitStopPrice,
      lossStopPrice,
    );
  }
}
