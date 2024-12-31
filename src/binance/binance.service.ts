import { Injectable } from '@nestjs/common';
import { Kline } from './interface/kline.interface';
import { StockUtilService } from '../util/stock-util.service';
import {
  BINANCE_CONSTANTS,
  BINANCE_SIDE,
  FUTURE_TRADE_TYPE,
} from '../common/constants/app.constants';
import { BinanceApiService } from './binance-api.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class BinanceService {
  private longConditionState: ConditionState = {
    wasEMAOrdered: false,
    wasPriceEMA20: false,
    wasPriceEMA50: false,
    wasFractalDetected: false,
    wasEMA20Crossed: false,
    wasEMA50Crossed: false,
  };
  private shortConditionState: ConditionState = {
    wasEMAOrdered: false,
    wasPriceEMA20: false,
    wasPriceEMA50: false,
    wasFractalDetected: false,
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
    const isLongPurchasable = await this.evaluateConditions(
      FUTURE_TRADE_TYPE.LONG,
      symbol,
    );
    if (isLongPurchasable) {
      await this.binanceApiService.newOrder(
        symbol,
        BINANCE_SIDE.BUY,
        'MARKET',
        0.001,
      );
    }
    const isShortPurchasable = await this.evaluateConditions(
      FUTURE_TRADE_TYPE.SHORT,
      symbol,
    );
    if (isShortPurchasable) {
      await this.binanceApiService.newOrder(
        symbol,
        BINANCE_SIDE.SELL,
        'MARKET',
        0.001,
      );
    }
  }

  /**
   * 롱 매수 조건 확인
   * @param type
   * @param symbol
   */
  async evaluateConditions(type: FUTURE_TRADE_TYPE, symbol: string) {
    // 캔들 배열
    const candles = await this.binanceApiService.getCandles(symbol, '1m', 100);
    // 종가 배열
    const closes = candles.map((candle: Kline) => candle.close);
    // EMA 20 배열
    const ema20 = this.stockUtilService.calculateEMA(closes, 20);
    // EMA 50 배열
    const ema50 = this.stockUtilService.calculateEMA(closes, 50);
    // EMA 100 배열
    const ema100 = this.stockUtilService.calculateEMA(closes, 100);

    // 현재 가격이 EMA 100 선 아래로 하락했다면 조건 초기화
    // EMA 20/50/100 선 정배열 되었는지 확인
    const isLongConditionReady = this.isLongConditionReady(closes, ema100);
    if (isLongConditionReady) {
      this.verifyEMAOrder(type, ema20, ema50, ema100);
    } else {
      this.resetCondition(type);
      return false;
    }

    // 현재 가격이 EMA 20/50 선 아래로 하락하는지 확인
    if (this.longConditionState.wasEMAOrdered) {
      this.verifyPriceEMA20(type, closes, ema20);
    }
    if (this.longConditionState.wasEMAOrdered) {
      this.verifyPriceEMA50(type, closes, ema50);
    }

    // 현재 가격이 EMA 20/50 선 아래로 하락했다면 윌리엄스 프랙탈 지표에서 down 표식 노출 확인
    if (
      this.longConditionState.wasPriceEMA20 ||
      this.longConditionState.wasPriceEMA50
    ) {
      this.detectWilliamsFractal(type, candles);
    }

    // 윌리엄스 프랙탈 지표에서 down 표식 노출 됐다면 현재 가격이 EMA 20/50 선 상향 돌파하는지 확인
    if (this.longConditionState.wasFractalDetected) {
      this.verifyPriceCrossEMA(type, candles, ema20, ema50);
    }

    if (type === FUTURE_TRADE_TYPE.LONG) {
      console.log(this.longConditionState);
      return (
        this.longConditionState.wasEMAOrdered &&
        (this.longConditionState.wasPriceEMA20 ||
          this.longConditionState.wasPriceEMA50) &&
        this.longConditionState.wasFractalDetected &&
        (this.longConditionState.wasEMA20Crossed ||
          this.longConditionState.wasEMA50Crossed)
      );
    } else if (type === FUTURE_TRADE_TYPE.SHORT) {
      console.log(this.shortConditionState);
      return (
        this.shortConditionState.wasEMAOrdered &&
        (this.shortConditionState.wasPriceEMA20 ||
          this.shortConditionState.wasPriceEMA50) &&
        this.shortConditionState.wasFractalDetected &&
        (this.shortConditionState.wasEMA20Crossed ||
          this.shortConditionState.wasEMA50Crossed)
      );
    }
  }

  /**
   * 롱 매수 진행 조건 확인 전 사전점검
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
  private verifyEMAOrder(
    type: FUTURE_TRADE_TYPE,
    ema20: number[],
    ema50: number[],
    ema100: number[],
  ): void {
    if (type === FUTURE_TRADE_TYPE.LONG) {
      if (
        ema20[ema20.length - 1] > ema50[ema50.length - 1] &&
        ema50[ema50.length - 1] > ema100[ema100.length - 1]
      ) {
        this.longConditionState.wasEMAOrdered = true;
      }
    } else if (type === FUTURE_TRADE_TYPE.SHORT) {
      if (
        ema100[ema100.length - 1] > ema50[ema50.length - 1] &&
        ema50[ema50.length - 1] > ema20[ema20.length - 1]
      ) {
        this.shortConditionState.wasEMAOrdered = true;
      }
    }
  }

  /**
   * 조건 2-A. 현재 가격이 EMA 20 선 아래로 내려왔는지 확인
   * @param type
   * @param closes
   * @param ema20
   * @private
   */
  private verifyPriceEMA20(
    type: FUTURE_TRADE_TYPE,
    closes: number[],
    ema20: number[],
  ): void {
    if (type === FUTURE_TRADE_TYPE.LONG) {
      if (closes[closes.length - 1] < ema20[ema20.length - 1]) {
        this.longConditionState.wasPriceEMA20 = true;
      }
    } else if (type === FUTURE_TRADE_TYPE.SHORT) {
      if (closes[closes.length - 1] > ema20[ema20.length - 1]) {
        this.shortConditionState.wasPriceEMA20 = true;
      }
    }
  }

  /**
   * 조건 2-B. 현재 가격이 EMA 50 선 아래로 내려왔는지 확인
   * @param type
   * @param closes
   * @param ema50
   * @private
   */
  private verifyPriceEMA50(
    type: FUTURE_TRADE_TYPE,
    closes: number[],
    ema50: number[],
  ): void {
    if (type === FUTURE_TRADE_TYPE.LONG) {
      if (closes[closes.length - 1] < ema50[ema50.length - 1]) {
        this.longConditionState.wasPriceEMA50 = true;
      }
    } else if (type === FUTURE_TRADE_TYPE.SHORT) {
      if (closes[closes.length - 1] < ema50[ema50.length - 1]) {
        this.shortConditionState.wasPriceEMA50 = true;
      }
    }
  }

  /**
   * 조건 3. 윌리엄스 프랙탈 지표에 down 표시 확인
   * @param type
   * @param candles
   * @private
   */
  private detectWilliamsFractal(
    type: FUTURE_TRADE_TYPE,
    candles: Kline[],
  ): void {
    if (type === FUTURE_TRADE_TYPE.LONG) {
      if (
        candles[
          candles.length -
            (1 + BINANCE_CONSTANTS.DEFAULT_WILLIAMS_FRACTAL_PERIODS)
        ].williamsFractalType === 'down'
      ) {
        this.longConditionState.wasFractalDetected = true;
      }
    } else if (type === FUTURE_TRADE_TYPE.SHORT) {
      if (
        candles[
          candles.length -
            (1 + BINANCE_CONSTANTS.DEFAULT_WILLIAMS_FRACTAL_PERIODS)
        ].williamsFractalType === 'up'
      ) {
        this.shortConditionState.wasFractalDetected = true;
      }
    }
  }

  /**
   * 조건 4. 현재 가격이 EMA 20선 혹은 50선 이상/이하로 상향/하향 돌파하는지 확인
   * @param type
   * @param candles
   * @param ema20
   * @param ema50
   * @private
   */
  private verifyPriceCrossEMA(
    type: FUTURE_TRADE_TYPE,
    candles: Kline[],
    ema20: number[],
    ema50: number[],
  ): void {
    if (type === FUTURE_TRADE_TYPE.LONG) {
      if (this.longConditionState.wasPriceEMA20) {
        if (candles[candles.length - 1].close > ema20[ema20.length - 1]) {
          this.longConditionState.wasEMA20Crossed = true;
        }
      } else if (this.longConditionState.wasPriceEMA50) {
        if (candles[candles.length - 1].close > ema50[ema50.length - 1]) {
          this.longConditionState.wasEMA50Crossed = true;
        }
      }
    } else if (type === FUTURE_TRADE_TYPE.SHORT) {
      if (this.shortConditionState.wasPriceEMA20) {
        if (candles[candles.length - 1].close < ema20[ema20.length - 1]) {
          this.shortConditionState.wasEMA20Crossed = true;
        }
      } else if (this.shortConditionState.wasPriceEMA50) {
        if (candles[candles.length - 1].close < ema50[ema50.length - 1]) {
          this.shortConditionState.wasEMA50Crossed = true;
        }
      }
    }
  }

  /**
   * 매수 조건 초기화
   */
  private resetCondition(type: FUTURE_TRADE_TYPE): void {
    if (type === FUTURE_TRADE_TYPE.LONG) {
      for (const key in this.longConditionState) {
        this.longConditionState[key] = false;
      }
      console.log('롱 매수 조건 초기화 완료');
    } else if (type === FUTURE_TRADE_TYPE.SHORT) {
      for (const key in this.shortConditionState) {
        this.shortConditionState[key] = false;
      }
      console.log('숏 매수 조건 초기화 완료');
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
