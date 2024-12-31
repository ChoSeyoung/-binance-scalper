import { Injectable } from '@nestjs/common';
import { Kline } from '../binance/interface/kline.interface';
import { WilliamsFractals } from '../binance/interface/fractal.interface';
import { BINANCE_CONSTANTS } from '../common/constants/app.constants';

@Injectable()
export class StockUtilService {
  /**
   * 지수이동평균선 계산 (EMA)
   * @param closePrices
   * @param period
   */
  calculateEMA(closePrices: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema = [closePrices[0]]; // 첫 번째 값은 단순이동평균으로 설정 (초기값)
    for (let i = 1; i < closePrices.length; i++) {
      const prevEMA = ema[i - 1];
      const newEMA = closePrices[i] * k + prevEMA * (1 - k);
      ema.push(newEMA);
    }
    return ema;
  }

  /**
   * 윌리엄 프랙탈 지수 계산 (예시로 간단한 매수 신호 체크)
   * 매수 신호는 간단히 최근 5개의 캔들의 종가가 이전 5개 종가보다 높을 때 발생한다고 가정
   * @param data
   * @param period
   */
  calculateWilliamsFractals(
    data: Kline[],
    period: number = BINANCE_CONSTANTS.DEFAULT_WILLIAMS_FRACTAL_PERIODS,
  ): WilliamsFractals[] {
    if (data.length < 2 * period + 1) {
      throw new Error(
        `Insufficient data: at least ${2 * period + 1} items are required.`,
      );
    }

    // 마지막 진행 중인 데이터 제거
    const validData = data.slice(0, -1);
    const fractals: WilliamsFractals[] = [];

    for (let i = period; i < validData.length - period; i++) {
      const slice = validData.slice(i - period, i + period + 1);
      const currentHigh = validData[i].high;
      const currentLow = validData[i].low;

      const max = Math.max(...slice.map((kline) => kline.high));
      const min = Math.min(...slice.map((kline) => kline.low));

      if (currentHigh === max && slice[period].high === max) {
        fractals.push({ type: 'up', index: i, value: currentHigh });
      }

      if (currentLow === min && slice[period].low === min) {
        fractals.push({ type: 'down', index: i, value: currentLow });
      }
    }

    return fractals;
  }
}
