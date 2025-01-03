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
    if (shortCondition.result) {
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

    const latestClosePrice = closes[closes.length - 1];
    const latestEMA20Price = ema20[ema20.length - 1];
    const latestEMA50Price = ema50[ema50.length - 1];
    const latestEMA100Price = ema100[ema100.length - 1];

    // 현재 가격을 기준으로 롱/숏 거래 조건 확인
    const isLongConditionReady = this.isConditionReady(
      position,
      latestClosePrice,
      latestEMA20Price,
      latestEMA100Price,
    );
    // EMA 20/50/100 선 정배열 되었는지 확인
    if (isLongConditionReady) {
      this.verifyEMAOrder(
        position,
        latestEMA20Price,
        latestEMA50Price,
        latestEMA100Price,
      );
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
      this.verifyPriceCrossEMA(
        position,
        latestClosePrice,
        latestEMA20Price,
        latestEMA50Price,
      );
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
        result.profitStopPrice = latestEMA50Price * 1.01;
        result.lossStopPrice = latestEMA50Price * 0.98;
      } else {
        result.profitStopPrice = latestEMA20Price * 1.01;
        result.lossStopPrice = latestEMA20Price * 0.98;
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
        result.profitStopPrice = latestEMA50Price * 0.95;
        result.lossStopPrice = latestEMA50Price * 1.01;
      } else {
        result.profitStopPrice = latestEMA20Price * 0.95;
        result.lossStopPrice = latestEMA20Price * 1.01;
      }
    }

    return result;
  }

  /**
   * 거래 진행 조건 확인 전 사전점검
   *
   * @param position
   * @param latestClosePrice
   * @param latestEma20Price
   * @param latestEma100Price
   */
  private isConditionReady(
    position: POSITION,
    latestClosePrice: number,
    latestEma20Price: number,
    latestEma100Price: number,
  ): boolean {
    if (position === POSITION.LONG) {
      // 롱 거래 시 현재가가 EMA 100 선 가격보다 아래로 떨어지는 경우 거래금지
      console.log(
        `[LONG] 현재가: ${latestClosePrice}, EMA100: ${latestEma100Price}`,
      );
      return latestClosePrice > latestEma100Price;
    } else if (position === POSITION.SHORT) {
      // 숏 거래 시 현재가가 EMA 20 선 가격보다 위로 올라가는 경우 거래금지
      console.log(
        `[SHORT] 현재가: ${latestClosePrice}, EMA20: ${latestEma20Price}`,
      );
      return latestClosePrice < latestEma20Price;
    }
  }

  /**
   * 조건 1: EMA 정배열 확인
   */
  private verifyEMAOrder(
    position: POSITION,
    latestEMA20Price: number,
    latestEMA50Price: number,
    latestEMA100Price: number,
  ): void {
    if (position === POSITION.LONG) {
      console.log(
        `[LONG] EMA20: ${latestEMA20Price}, EMA50: ${latestEMA50Price}, EMA100: ${latestEMA100Price}`,
      );
      if (
        latestEMA20Price > latestEMA50Price &&
        latestEMA50Price > latestEMA100Price
      ) {
        this.longConditionState.wasEMAOrdered = true;
      }
    } else if (position === POSITION.SHORT) {
      console.log(
        `[SHORT] EMA100: ${latestEMA100Price}, EMA50: ${latestEMA50Price}, EMA20: ${latestEMA20Price}`,
      );
      if (
        latestEMA100Price > latestEMA50Price &&
        latestEMA50Price > latestEMA20Price
      ) {
        this.shortConditionState.wasEMAOrdered = true;
      }
    }
  }

  /**
   * 조건 2-A. 현재 가격이 EMA 20 선 아래로 내려왔는지 확인
   * @param position
   * @param latestClosePrice
   * @param latestEMA20Price
   * @private
   */
  private verifyPriceEMA20(
    position: POSITION,
    latestClosePrice: number[],
    latestEMA20Price: number[],
  ): void {
    if (position === POSITION.LONG) {
      if (latestClosePrice < latestEMA20Price) {
        this.longConditionState.wasPriceEMA20 = true;
      }
    } else if (position === POSITION.SHORT) {
      if (latestClosePrice > latestEMA20Price) {
        this.shortConditionState.wasPriceEMA20 = true;
      }
    }
  }

  /**
   * 조건 2-B. 현재 가격이 EMA 50 선 아래로 내려왔는지 확인
   * @param position
   * @param latestClosePrice
   * @param latestEMA50Price
   * @private
   */
  private verifyPriceEMA50(
    position: POSITION,
    latestClosePrice: number[],
    latestEMA50Price: number[],
  ): void {
    if (position === POSITION.LONG) {
      if (latestClosePrice < latestEMA50Price) {
        this.longConditionState.wasPriceEMA50 = true;
      }
    } else if (position === POSITION.SHORT) {
      if (latestClosePrice < latestEMA50Price) {
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
   * @param latestClosePrice
   * @param latestEMA20Price
   * @param latestEMA50Price
   * @private
   */
  private verifyPriceCrossEMA(
    position: POSITION,
    latestClosePrice: number,
    latestEMA20Price: number,
    latestEMA50Price: number,
  ): void {
    if (position === POSITION.LONG) {
      if (this.longConditionState.wasPriceEMA20) {
        if (latestClosePrice > latestEMA20Price) {
          this.longConditionState.wasEMA20Crossed = true;
        }
      } else if (this.longConditionState.wasPriceEMA50) {
        if (latestClosePrice > latestEMA50Price) {
          this.longConditionState.wasEMA50Crossed = true;
        }
      }
    } else if (position === POSITION.SHORT) {
      if (this.shortConditionState.wasPriceEMA20) {
        if (latestClosePrice < latestEMA20Price) {
          this.shortConditionState.wasEMA20Crossed = true;
        }
      } else if (this.shortConditionState.wasPriceEMA50) {
        if (latestClosePrice < latestEMA50Price) {
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
      console.log('RESET LONG CONDITION');
    } else if (position === POSITION.SHORT) {
      for (const key in this.shortConditionState) {
        this.shortConditionState[key] = false;
      }
      console.log('RESET SHORT CONDITION');
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
