import { Injectable } from '@nestjs/common';
import { Kline } from './interface/kline.interface';
import { StockUtilService } from '../util/stock-util.service';
import { BINANCE_CONSTANTS } from '../common/constants/app.constants';
import { BinanceApiService } from './binance-api.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class BinanceService {
  private longConditionState: LongConditionState = {
    wasEMAOrdered: false,
    wasPriceBelowEMA20: false,
    wasPriceBelowEMA50: false,
    wasFractalDownDetected: false,
    wasEMA20Crossed: false,
    wasEMA50Crossed: false,
  };

  constructor(
    private readonly binanceApiService: BinanceApiService,
    private readonly stockUtilService: StockUtilService,
  ) {}

  @Cron('*/1 * * * *')
  async handleTradeCheck(): Promise<void> {
    const symbol = 'BTCUSDT';
    const isPurchasable = await this.evaluateLongConditions(symbol);
    if (isPurchasable) {
      await this.binanceApiService.newOrder(symbol, 'BUY', 'MARKET', 0.001);
    }
  }

  /**
   * 롱 매수 조건 확인
   * @param symbol
   */
  async evaluateLongConditions(symbol: string) {
    const candles = await this.binanceApiService.getCandles(symbol, '1m', 100);
    const closes = candles.map((candle: Kline) => candle.close); // 종가 가져오기
    const ema20 = this.stockUtilService.calculateEMA(closes, 20);
    const ema50 = this.stockUtilService.calculateEMA(closes, 50);
    const ema100 = this.stockUtilService.calculateEMA(closes, 100);

    // 매수 진행 조건 확인 전 사전점검
    const isLongConditionReady = this.isLongConditionReady(closes, ema100);
    if (isLongConditionReady) {
      this.checkLongFirstCondition(ema20, ema50, ema100);
    } else {
      this.resetLongCondition();
      return false;
    }

    if (this.longConditionState.wasEMAOrdered) {
      this.checkLongSecondCondition(closes, ema20);
    }
    if (this.longConditionState.wasEMAOrdered) {
      this.checkLongThirdCondition(closes, ema50);
    }

    if (
      this.longConditionState.wasPriceBelowEMA20 ||
      this.longConditionState.wasPriceBelowEMA50
    ) {
      this.checkLongFourCondition(candles);
    }

    if (this.longConditionState.wasFractalDownDetected) {
      this.checkLongFiveCondition(candles, ema20, ema50);
    }

    return true;
  }

  /**
   * 매수 진행 조건 확인 전 사전점검
   * 현재가가 EMA 100 선 아래로 내려갈 경우 조건 초기화 후 매수중지 처리
   * @param closes
   * @param ema100
   */
  private isLongConditionReady(closes: number[], ema100: number[]): boolean {
    return closes[closes.length - 1] > ema100[ema100.length - 1];
  }

  /**
   * 조건 1: 지수이동평균선 20, 50, 100 순으로 정배열 확인
   */
  private checkLongFirstCondition(
    ema20: number[],
    ema50: number[],
    ema100: number[],
  ): void {
    if (
      ema20[ema20.length - 1] > ema50[ema50.length - 1] &&
      ema50[ema50.length - 1] > ema100[ema100.length - 1]
    ) {
      this.longConditionState.wasEMAOrdered = true;
    }
  }

  private checkLongSecondCondition(closes: number[], ema20: number[]): void {
    // 현재 가격과 현재 EMA20 값을 비교
    if (closes[closes.length - 1] < ema20[ema20.length - 1]) {
      this.longConditionState.wasPriceBelowEMA20 = true; // 현재 가격이 20일 EMA 아래로 내려갔으면 상태를 갱신
    }
  }

  private checkLongThirdCondition(closes: number[], ema50: number[]): void {
    // 현재 가격과 현재 EMA50 값을 비교
    if (closes[closes.length - 1] < ema50[ema50.length - 1]) {
      this.longConditionState.wasPriceBelowEMA50 = true; // 현재 가격이 50일 EMA 아래로 내려갔으면 상태를 갱신
    }
  }

  private checkLongFourCondition(candles: Kline[]): void {
    if (
      candles[
        candles.length -
          (1 + BINANCE_CONSTANTS.DEFAULT_WILLIAMS_FRACTAL_PERIODS)
      ].williamsFractalType === 'down'
    ) {
      this.longConditionState.wasFractalDownDetected = true;
    }
  }

  private checkLongFiveCondition(
    candles: Kline[],
    ema20: number[],
    ema50: number[],
  ): void {
    if (this.longConditionState.wasPriceBelowEMA20) {
      if (candles[candles.length - 1].close > ema20[ema20.length - 1]) {
        this.longConditionState.wasEMA20Crossed = true;
      }
    } else if (this.longConditionState.wasPriceBelowEMA50) {
      if (candles[candles.length - 1].close > ema50[ema50.length - 1]) {
        this.longConditionState.wasEMA50Crossed = true;
      }
    }
  }

  /**
   * 매수 조건 초기화
   */
  private resetLongCondition(): void {
    for (const key in this.longConditionState) {
      this.longConditionState[key] = false;
    }
  }

  /**
   * 롱 매수 포지션 진입 후 손절, 익절가 계산
   * @param symbol
   */
  async calculateExitPrices(symbol: string) {
    const candles = await this.binanceApiService.getCandles(symbol, '1m', 100);
    const closes = candles.map((candle) => parseFloat(candle[4])); // 종가 가져오기
    const ema50 = this.stockUtilService.calculateEMA(closes, 50);
    const currentPrice = closes[closes.length - 1];
    const stopLoss = ema50[ema50.length - 1]; // 손절가는 50 EMA
    const takeProfit = currentPrice + (currentPrice - stopLoss); // 익절가는 현재가에서 50 EMA 차이를 더한 값
    return { stopLoss, takeProfit };
  }
}
