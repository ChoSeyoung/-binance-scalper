import { Injectable } from '@nestjs/common';
import { Kline } from './interface/kline.interface';
import { StockUtilService } from '../util/stock-util.service';
import {
  BINANCE_CONSTANTS,
  BINANCE_ORDER_TYPE,
  BINANCE_SYMBOL,
  POSITION,
  SIDE,
  TIME_IN_FORCE,
} from '../common/constants/app.constants';
import { BinanceApiService } from './binance-api.service';
import { Cron } from '@nestjs/schedule';
import {
  ConditionState,
  EvaluateConditionsResult,
} from './interface/trade.interface';

@Injectable()
export class BinanceService {
  private longConditionState: ConditionState = {
    isGoldenArrangement: false,
    isFirstDownwardBreakout: false,
    isSecondDownwardBreakout: false,
    isFractalSignal: false,
    isFirstUpwardBreakout: false,
    isSecondUpwardBreakout: false,
  };
  private shortConditionState: ConditionState = {
    isGoldenArrangement: false,
    isFirstDownwardBreakout: false,
    isSecondDownwardBreakout: false,
    isFractalSignal: false,
    isFirstUpwardBreakout: false,
    isSecondUpwardBreakout: false,
  };

  constructor(
    private readonly binanceApiService: BinanceApiService,
    private readonly stockUtilService: StockUtilService,
  ) {}

  @Cron('*/5 * * * * *')
  async handleTradeCheck(): Promise<void> {
    const symbol = BINANCE_SYMBOL.XRPUSDT;

    // 현재 열려있는 포지션 확인
    const currentPosition =
      await this.binanceApiService.getPositionRisk(symbol);

    // 포지션 종료까지 대기
    if (currentPosition) {
      console.log('[SYSTEM] 포지션 종료 대기중');
      return;
    }

    // 롱 매수 조건 평가
    const longCondition = await this.evaluateConditions(POSITION.LONG, symbol);
    if (longCondition.result) {
      const result = await this.binanceApiService.newOrder({
        symbol: symbol,
        side: SIDE.BUY,
        positionSide: POSITION.LONG,
        quantity: BINANCE_CONSTANTS.MIN_BTC_TRADE,
        type: BINANCE_ORDER_TYPE.LIMIT,
        price: longCondition.tradePrice,
        timeInForce: TIME_IN_FORCE.GTC,
      });
      console.log('롱 매수 주문 결과:', result);

      // 손절/익절 설정
      await this.setProfitAndLoss(
        symbol,
        POSITION.LONG,
        longCondition.profitStopPrice,
        longCondition.lossStopPrice,
      );

      return; // 롱 매수 처리 후 종료
    }

    // 숏 매수 조건 평가
    const shortCondition = await this.evaluateConditions(
      POSITION.SHORT,
      symbol,
    );
    if (shortCondition.result) {
      const result = await this.binanceApiService.newOrder({
        symbol: symbol,
        side: SIDE.SELL,
        positionSide: POSITION.SHORT,
        quantity: BINANCE_CONSTANTS.MIN_BTC_TRADE,
        type: BINANCE_ORDER_TYPE.LIMIT,
        price: shortCondition.tradePrice,
        timeInForce: TIME_IN_FORCE.GTC,
      });
      console.log('숏 매수 주문 결과:', result);

      // 손절/익절 설정
      await this.setProfitAndLoss(
        symbol,
        POSITION.SHORT,
        shortCondition.profitStopPrice,
        shortCondition.lossStopPrice,
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
  ): Promise<EvaluateConditionsResult> {
    const result: EvaluateConditionsResult = {
      result: false,
      tradePrice: 0,
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
    }

    if (this.longConditionState.isGoldenArrangement) {
      this.checkFirstDownwardBreakoutCondition(
        position,
        latestClosePrice,
        latestEMA20Price,
        latestEMA100Price,
      );
    }
    if (this.longConditionState.isGoldenArrangement) {
      this.checkSecondDownwardBreakoutCondition(
        position,
        latestClosePrice,
        latestEMA50Price,
      );
    }

    if (
      this.longConditionState.isFirstDownwardBreakout ||
      this.longConditionState.isSecondDownwardBreakout
    ) {
      this.checkWilliamsFractalType(position, candles);
    }

    if (this.longConditionState.isFractalSignal) {
      this.verifyPriceCrossEMA(
        position,
        latestClosePrice,
        latestEMA20Price,
        latestEMA50Price,
      );
    }

    if (position === POSITION.LONG) {
      result.result =
        this.longConditionState.isGoldenArrangement &&
        (this.longConditionState.isFirstDownwardBreakout ||
          this.longConditionState.isSecondDownwardBreakout) &&
        this.longConditionState.isFractalSignal &&
        (this.longConditionState.isFirstUpwardBreakout ||
          this.longConditionState.isSecondUpwardBreakout);

      if (this.longConditionState.isSecondDownwardBreakout) {
        result.tradePrice = latestClosePrice;
        result.profitStopPrice = latestEMA50Price * 1.01;
        result.lossStopPrice = latestEMA50Price * 0.98;
      } else {
        result.tradePrice = latestClosePrice;
        result.profitStopPrice = latestEMA20Price * 1.01;
        result.lossStopPrice = latestEMA20Price * 0.98;
      }
    } else if (position === POSITION.SHORT) {
      result.result =
        this.shortConditionState.isGoldenArrangement &&
        (this.shortConditionState.isFirstDownwardBreakout ||
          this.shortConditionState.isSecondDownwardBreakout) &&
        this.shortConditionState.isFractalSignal &&
        (this.shortConditionState.isFirstUpwardBreakout ||
          this.shortConditionState.isSecondUpwardBreakout);

      if (this.shortConditionState.isSecondDownwardBreakout) {
        result.tradePrice = latestClosePrice;
        result.profitStopPrice = latestEMA50Price * 0.95;
        result.lossStopPrice = latestEMA50Price * 1.01;
      } else {
        result.tradePrice = latestClosePrice;
        result.profitStopPrice = latestEMA20Price * 0.95;
        result.lossStopPrice = latestEMA20Price * 1.01;
      }
    }

    console.log('============================================================');

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
      console.log('[LONG] 현재가가 EMA 100 선 아래로 내려갔는지 확인');
      console.log(
        `[LONG] 현재가: ${latestClosePrice}, EMA100: ${latestEma100Price}`,
      );
      return latestClosePrice > latestEma100Price;
    } else if (position === POSITION.SHORT) {
      console.log('[SHORT] 현재가가 EMA 20 선 위로 올라갔는지 확인');
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
        this.longConditionState.isGoldenArrangement = true;
      }
    } else if (position === POSITION.SHORT) {
      console.log(
        `[SHORT] EMA100: ${latestEMA100Price}, EMA50: ${latestEMA50Price}, EMA20: ${latestEMA20Price}`,
      );
      if (
        latestEMA100Price > latestEMA50Price &&
        latestEMA50Price > latestEMA20Price
      ) {
        this.shortConditionState.isGoldenArrangement = true;
      }
    }
  }

  /**
   * 조건 2-A. 현재 가격이 EMA 20 선 아래로 내려왔는지 확인
   * @param position
   * @param latestClosePrice
   * @param latestEMA20Price
   * @param latestEMA100Price
   * @private
   */
  private checkFirstDownwardBreakoutCondition(
    position: POSITION,
    latestClosePrice: number,
    latestEMA20Price: number,
    latestEMA100Price: number,
  ): void {
    if (position === POSITION.LONG) {
      console.log(
        `[LONG] 현재가: ${latestClosePrice}, EMA20: ${latestEMA20Price}`,
      );
      if (latestClosePrice < latestEMA20Price) {
        this.longConditionState.isFirstDownwardBreakout = true;
      }
    } else if (position === POSITION.SHORT) {
      console.log(
        `[SHORT] 현재가: ${latestClosePrice}, EMA100: ${latestEMA100Price}`,
      );
      if (latestClosePrice > latestEMA100Price) {
        this.shortConditionState.isFirstDownwardBreakout = true;
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
  private checkSecondDownwardBreakoutCondition(
    position: POSITION,
    latestClosePrice: number,
    latestEMA50Price: number,
  ): void {
    if (position === POSITION.LONG) {
      console.log(
        `[LONG] 현재가: ${latestClosePrice}, EMA50: ${latestEMA50Price}`,
      );
      if (latestClosePrice < latestEMA50Price) {
        this.longConditionState.isSecondDownwardBreakout = true;
      }
    } else if (position === POSITION.SHORT) {
      console.log(
        `[SHORT] 현재가: ${latestClosePrice}, EMA50: ${latestEMA50Price}`,
      );
      if (latestClosePrice > latestEMA50Price) {
        this.shortConditionState.isSecondDownwardBreakout = true;
      }
    }
  }

  /**
   * 조건 3. 윌리엄스 프랙탈 지표에 down 표시 확인
   * @param position
   * @param candles
   * @private
   */
  private checkWilliamsFractalType(position: POSITION, candles: Kline[]): void {
    const fractal =
      candles[
        candles.length -
          (1 + BINANCE_CONSTANTS.DEFAULT_WILLIAMS_FRACTAL_PERIODS)
      ].williamsFractalType;

    if (position === POSITION.LONG) {
      console.log(`[LONG] 윌리엄스 프랙탈 인디케이터: ${fractal}`);
      if (fractal === 'down') {
        this.longConditionState.isFractalSignal = true;
      }
    } else if (position === POSITION.SHORT) {
      console.log(`[SHORT] 윌리엄스 프랙탈 인디케이터: ${fractal}`);
      if (fractal === 'up') {
        this.shortConditionState.isFractalSignal = true;
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
      if (this.longConditionState.isFirstDownwardBreakout) {
        console.log(
          `[LONG] 현재가: ${latestClosePrice}, EMA20: ${latestEMA20Price}`,
        );
        if (latestClosePrice > latestEMA20Price) {
          this.longConditionState.isFirstUpwardBreakout = true;
        }
      } else if (this.longConditionState.isSecondDownwardBreakout) {
        console.log(
          `[LONG] 현재가: ${latestClosePrice}, EMA50: ${latestEMA50Price}`,
        );
        if (latestClosePrice > latestEMA50Price) {
          this.longConditionState.isSecondUpwardBreakout = true;
        }
      }
    } else if (position === POSITION.SHORT) {
      if (this.shortConditionState.isFirstDownwardBreakout) {
        console.log(
          `[SHORT] 현재가: ${latestClosePrice}, EMA20: ${latestEMA20Price}`,
        );
        if (latestClosePrice < latestEMA20Price) {
          this.shortConditionState.isFirstUpwardBreakout = true;
        }
      } else if (this.shortConditionState.isSecondDownwardBreakout) {
        console.log(
          `[SHORT] 현재가: ${latestClosePrice}, EMA50: ${latestEMA50Price}`,
        );
        if (latestClosePrice < latestEMA50Price) {
          this.shortConditionState.isSecondUpwardBreakout = true;
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
      console.log('[LONG] RESET CONDITION');
    } else if (position === POSITION.SHORT) {
      for (const key in this.shortConditionState) {
        this.shortConditionState[key] = false;
      }
      console.log('[SHORT] RESET CONDITION');
    }
  }

  async setProfitAndLoss(
    symbol: BINANCE_SYMBOL,
    position: POSITION,
    profitStopPrice: number,
    lossStopPrice: number,
  ) {
    const balances = await this.binanceApiService.getBalances();
    const balance = parseFloat(
      balances.find((b) => b.asset === symbol)?.balance || 0,
    );

    // 롱 주문이면 매도를 설정하고, 숏 주문이면 매수를 설정함
    const takeProfitSide = position === POSITION.LONG ? SIDE.SELL : SIDE.BUY;

    const takeProfitOrder = await this.binanceApiService.newOrder({
      symbol: symbol,
      side: takeProfitSide,
      positionSide: position,
      quantity: balance,
      type: BINANCE_ORDER_TYPE.TAKE_PROFIT,
      price: profitStopPrice,
      stopPrice: profitStopPrice,
      timeInForce: TIME_IN_FORCE.GTC,
    });

    const stopLossOrder = await this.binanceApiService.newOrder({
      symbol: symbol,
      side: takeProfitSide,
      positionSide: position,
      quantity: balance,
      type: BINANCE_ORDER_TYPE.STOP,
      price: lossStopPrice,
      stopPrice: lossStopPrice,
      timeInForce: TIME_IN_FORCE.GTC,
    });

    console.log('손절/익절 설정 결과:', { takeProfitOrder, stopLossOrder });
  }
}
