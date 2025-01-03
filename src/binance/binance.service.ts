import { Injectable } from '@nestjs/common';
import { Kline } from './interface/kline.interface';
import { StockUtilService } from '../util/stock-util.service';
import {
  BINANCE_CONSTANTS,
  SIDE,
  POSITION,
  BINANCE_SYMBOL,
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
    const symbol = BINANCE_SYMBOL.BTCUSDT;

    const longCondition = await this.evaluateConditions(POSITION.LONG, symbol);
    if (longCondition.result) {
      const result = await this.binanceApiService.newOrder(
        symbol,
        SIDE.BUY,
        POSITION.LONG,
        'MARKET',
        0.001,
      );
      console.log('롱 매수 주문 결과:', result);

      // 추가 로직: 손절/익절가 설정 (API 호출 또는 저장)
      await this.setProfitAndLoss(
        symbol,
        POSITION.LONG,
        longCondition.profitStopPrice,
        longCondition.lossStopPrice,
      );
    }

    const shortCondition = await this.evaluateConditions(
      POSITION.SHORT,
      symbol,
    );
    if (shortCondition) {
      const result = await this.binanceApiService.newOrder(
        symbol,
        SIDE.SELL,
        POSITION.SHORT,
        'MARKET',
        0.001,
      );
      console.log('숏 매수 주문 결과:', result);

      // 추가 로직: 손절/익절가 설정 (API 호출 또는 저장)
      await this.setProfitAndLoss(
        symbol,
        POSITION.SHORT,
        longCondition.profitStopPrice,
        longCondition.lossStopPrice,
      );
    }
  }

  /**
   * 롱/숏 매수 조건 확인
   * @param position
   * @param symbol
   */
  async evaluateConditions(
    position: POSITION,
    symbol: string,
  ): Promise<{
    result: boolean;
    profitStopPrice: number;
    lossStopPrice: number;
  }> {
    const result = {
      result: false,
      profitStopPrice: 0,
      lossStopPrice: 0,
    };

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

    const latestEma20 = ema20[ema20.length - 1];
    const latestEma50 = ema50[ema50.length - 1];

    // 현재 가격이 EMA 100 선 아래로/ 하락했다면 조건 초기화
    // EMA 20/50/100 선 정배열 되었는지 확인
    const isLongConditionReady = this.isConditionReady(
      position,
      closes,
      ema20,
      ema100,
    );
    if (isLongConditionReady) {
      this.verifyEMAOrder(position, ema20, ema50, ema100);
    } else {
      this.resetCondition(position);
      return result;
    }

    // 현재 가격이 EMA 20/50 선 아래로 하락하는지 확인
    if (this.longConditionState.wasEMAOrdered) {
      this.verifyPriceEMA20(position, closes, ema20);
    }
    if (this.longConditionState.wasEMAOrdered) {
      this.verifyPriceEMA50(position, closes, ema50);
    }

    // 현재 가격이 EMA 20/50 선 아래로 하락했다면 윌리엄스 프랙탈 지표에서 down 표식 노출 확인
    if (
      this.longConditionState.wasPriceEMA20 ||
      this.longConditionState.wasPriceEMA50
    ) {
      this.detectWilliamsFractal(position, candles);
    }

    // 윌리엄스 프랙탈 지표에서 down 표식 노출 됐다면 현재 가격이 EMA 20/50 선 상향 돌파하는지 확인
    if (this.longConditionState.wasFractalDetected) {
      this.verifyPriceCrossEMA(position, candles, ema20, ema50);
    }

    if (position === POSITION.LONG) {
      console.log(this.longConditionState);
      result.result =
        this.longConditionState.wasEMAOrdered &&
        (this.longConditionState.wasPriceEMA20 ||
          this.longConditionState.wasPriceEMA50) &&
        this.longConditionState.wasFractalDetected &&
        (this.longConditionState.wasEMA20Crossed ||
          this.longConditionState.wasEMA50Crossed);
      console.log(result.result);
      if (this.longConditionState.wasPriceEMA50) {
        result.profitStopPrice = latestEma50 * 1.01;
        result.lossStopPrice = latestEma50 * 0.98;
      } else {
        result.profitStopPrice = latestEma20 * 1.01;
        result.lossStopPrice = latestEma20 * 0.98;
      }
    } else if (position === POSITION.SHORT) {
      console.log(this.shortConditionState);
      result.result =
        this.shortConditionState.wasEMAOrdered &&
        (this.shortConditionState.wasPriceEMA20 ||
          this.shortConditionState.wasPriceEMA50) &&
        this.shortConditionState.wasFractalDetected &&
        (this.shortConditionState.wasEMA20Crossed ||
          this.shortConditionState.wasEMA50Crossed);
      console.log(result.result);
      if (this.shortConditionState.wasPriceEMA50) {
        result.profitStopPrice = latestEma50 * 0.95;
        result.lossStopPrice = latestEma50 * 1.01;
      } else {
        result.profitStopPrice = latestEma20 * 0.95;
        result.lossStopPrice = latestEma20 * 1.01;
      }
    }

    return result;
  }

  /**
   * 롱 매수 진행 조건 확인 전 사전점검
   * 현재가가 EMA 100 선 아래로 내려갈 경우 조건 초기화 후 매수중지 처리
   * @param position
   * @param closes
   * @param ema20
   * @param ema100
   */
  private isConditionReady(
    position: POSITION,
    closes: number[],
    ema20: number[],
    ema100: number[],
  ): boolean {
    if (position === POSITION.LONG) {
      return closes[closes.length - 1] > ema100[ema100.length - 1];
    } else if (position === POSITION.SHORT) {
      return closes[closes.length - 1] < ema20[ema100.length - 1];
    }
  }

  /**
   * 조건 1: 지수이동평균선 20, 50, 100 순으로 정배열 확인
   */
  private verifyEMAOrder(
    position: POSITION,
    ema20: number[],
    ema50: number[],
    ema100: number[],
  ): void {
    if (position === POSITION.LONG) {
      if (
        ema20[ema20.length - 1] > ema50[ema50.length - 1] &&
        ema50[ema50.length - 1] > ema100[ema100.length - 1]
      ) {
        this.longConditionState.wasEMAOrdered = true;
      }
    } else if (position === POSITION.SHORT) {
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
   * @param position
   * @param closes
   * @param ema20
   * @private
   */
  private verifyPriceEMA20(
    position: POSITION,
    closes: number[],
    ema20: number[],
  ): void {
    if (position === POSITION.LONG) {
      if (closes[closes.length - 1] < ema20[ema20.length - 1]) {
        this.longConditionState.wasPriceEMA20 = true;
      }
    } else if (position === POSITION.SHORT) {
      if (closes[closes.length - 1] > ema20[ema20.length - 1]) {
        this.shortConditionState.wasPriceEMA20 = true;
      }
    }
  }

  /**
   * 조건 2-B. 현재 가격이 EMA 50 선 아래로 내려왔는지 확인
   * @param position
   * @param closes
   * @param ema50
   * @private
   */
  private verifyPriceEMA50(
    position: POSITION,
    closes: number[],
    ema50: number[],
  ): void {
    if (position === POSITION.LONG) {
      if (closes[closes.length - 1] < ema50[ema50.length - 1]) {
        this.longConditionState.wasPriceEMA50 = true;
      }
    } else if (position === POSITION.SHORT) {
      if (closes[closes.length - 1] < ema50[ema50.length - 1]) {
        this.shortConditionState.wasPriceEMA50 = true;
      }
    }
  }

  /**
   * 조건 3. 윌리엄스 프랙탈 지표에 down 표시 확인
   * @param position
   * @param candles
   * @private
   */
  private detectWilliamsFractal(position: POSITION, candles: Kline[]): void {
    if (position === POSITION.LONG) {
      if (
        candles[
          candles.length -
            (1 + BINANCE_CONSTANTS.DEFAULT_WILLIAMS_FRACTAL_PERIODS)
        ].williamsFractalType === 'down'
      ) {
        this.longConditionState.wasFractalDetected = true;
      }
    } else if (position === POSITION.SHORT) {
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
   * @param position
   * @param candles
   * @param ema20
   * @param ema50
   * @private
   */
  private verifyPriceCrossEMA(
    position: POSITION,
    candles: Kline[],
    ema20: number[],
    ema50: number[],
  ): void {
    if (position === POSITION.LONG) {
      if (this.longConditionState.wasPriceEMA20) {
        if (candles[candles.length - 1].close > ema20[ema20.length - 1]) {
          this.longConditionState.wasEMA20Crossed = true;
        }
      } else if (this.longConditionState.wasPriceEMA50) {
        if (candles[candles.length - 1].close > ema50[ema50.length - 1]) {
          this.longConditionState.wasEMA50Crossed = true;
        }
      }
    } else if (position === POSITION.SHORT) {
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
  private resetCondition(position: POSITION): void {
    if (position === POSITION.LONG) {
      for (const key in this.longConditionState) {
        this.longConditionState[key] = false;
      }
      console.log('롱 매수 조건 초기화 완료');
    } else if (position === POSITION.SHORT) {
      for (const key in this.shortConditionState) {
        this.shortConditionState[key] = false;
      }
      console.log('숏 매수 조건 초기화 완료');
    }
  }

  async setProfitAndLoss(
    symbol: BINANCE_SYMBOL,
    position: POSITION,
    profitStopPrice: number,
    lossStopPrice: number,
  ) {
    // 바이낸스 API 를 사용하여 손절/익절 설정
    const side = position === POSITION.LONG ? SIDE.SELL : SIDE.BUY;

    const stopLossOrder = await this.binanceApiService.newOrder(
      symbol,
      side,
      position,
      'STOP_MARKET',
      0.001,
      lossStopPrice,
    );

    const takeProfitOrder = await this.binanceApiService.newOrder(
      symbol,
      side,
      position,
      'TAKE_PROFIT_MARKET',
      0.001,
      profitStopPrice,
    );
    console.log('손절/익절 설정 결과:', { stopLossOrder, takeProfitOrder });
  }
}
