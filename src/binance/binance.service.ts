import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { KlineInterface } from './interface/kline.interface';
import { WilliamsFractals } from './interface/Fractal.interface';

@Injectable()
export class BinanceService {
  private readonly baseUrl = 'https://fapi.binance.com/fapi/v1';

  private isEMAOrdered: boolean = false; // EMA 정배열 상태
  private isPriceBelowEMA20: boolean = false; // 가격이 20일선 아래로 내려갔는지
  private isPriceBelowEMA50: boolean = false; // 가격이 50일선 아래로 내려갔는지
  private isFractalBuy: boolean = false; // 윌리엄 프랙탈지수 매수 신호 상태
  private isEMA20Cross: boolean = false; // 20일선 상향 돌파 상태
  private isEMA50Cross: boolean = false; // 50일선 상향 돌파 상태

  /**
   * 핑
   */
  async ping() {
    try {
      const response = await axios.get(`${this.baseUrl}/ping`);

      return response.data;
    } catch (error) {
      console.error('Error fetching ping data from Binance:', error);
      throw error;
    }
  }

  /**
   * 캔들 데이터 조회
   * @param symbol
   * @param interval
   * @param limit
   */
  async getCandles(symbol: string, interval: string, limit: number = 100) {
    try {
      const response = await axios.get(`${this.baseUrl}/klines`, {
        params: {
          symbol,
          interval,
          limit: limit.toString(),
        },
      });

      // 데이터 변환
      const candles: KlineInterface[] = response.data.map(
        (candle: any[], index: number) => {
          // 마지막 인덱스는 현재 종결처리 되지 않은 가격으로 무시
          if (index === response.data.length - 1) return null;

          return {
            openTime: candle[0],
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            volume: parseFloat(candle[5]),
            closeTime: candle[6],
            quoteAssetVolume: parseFloat(candle[7]),
            numberOfTrades: candle[8],
            takerBuyBaseAssetVolume: parseFloat(candle[9]),
            takerBuyQuoteAssetVolume: parseFloat(candle[10]),
          };
        },
      );

      return candles;
    } catch (error) {
      console.error('Error fetching candle data from Binance:', error);
      throw error;
    }
  }

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
    data: KlineInterface[],
    period: number = 7,
  ): WilliamsFractals[] {
    const fractals: WilliamsFractals[] = [];

    for (let i = period; i < data.length - period; i++) {
      const slice = data.slice(i - period, i + period);
      console.log(slice);
      const currentHigh = data[i].high;
      const currentLow = data[i].low;

      const max = Math.max(...slice.map((kline) => kline.high));
      const min = Math.min(...slice.map((kline) => kline.low));

      // Check for Up Fractal
      if (
        currentHigh === max &&
        slice.findIndex((kline) => kline.high === max) === period
      ) {
        fractals.push({ type: 'up', index: i, value: data[i].high });
      }

      // Check for Down Fractal
      if (
        currentLow === min &&
        slice.findIndex((kline) => kline.low === min) === period
      ) {
        fractals.push({ type: 'down', index: i, value: data[i].low });
      }
    }

    return fractals;
  }

  /**
   * 롱 매수 조건 확인
   * @param symbol
   */
  async checkLongEntry(symbol: string) {
    const candles = await this.getCandles(symbol, '1m', 100);
    const closes = candles.map((candle: KlineInterface) => candle.close); // 종가 가져오기
    const ema20 = this.calculateEMA(closes, 20);
    const ema50 = this.calculateEMA(closes, 50);
    const ema100 = this.calculateEMA(closes, 100);

    // 종가가 100 이하로 내려간 경우 하락세 전환으로 판단 후 조건 초기화
    if (closes[closes.length - 1] <= ema100[ema100.length - 1]) {
      this.isEMAOrdered = false;
      this.isPriceBelowEMA20 = false;
      this.isPriceBelowEMA50 = false;
      this.isFractalBuy = false;
      this.isEMA20Cross = false;
      this.isEMA50Cross = false;
      return false;
    }

    // 조건 1: 지수이동평균선 20, 50, 100 순으로 정배열
    if (
      ema20[ema20.length - 1] > ema50[ema50.length - 1] &&
      ema50[ema50.length - 1] > ema100[ema100.length - 1]
    ) {
      this.isEMAOrdered = true;
    }

    // 조건 2: 가격이 20일 EMA 아래로 내려갈 때까지 기다린다
    if (this.isEMAOrdered && !this.isPriceBelowEMA20) {
      // 현재 가격과 현재 EMA20 값을 비교
      if (closes[closes.length - 1] < ema20[ema20.length - 1]) {
        this.isPriceBelowEMA20 = true; // 현재 가격이 20일 EMA 아래로 내려갔으면 상태를 갱신
      } else {
        if (closes[closes.length - 1] < ema20[ema20.length - 1]) {
          this.isPriceBelowEMA50 = true;
        } else {
          return false;
        }
      }
    }

    // 조건 3: 윌리엄 프랙탈지수 매수 신호
    if (
      (this.isPriceBelowEMA20 || this.isPriceBelowEMA50) &&
      !this.isFractalBuy
    ) {
      const williamsFractalsPeriods = 7;
      const williamsFractals = this.calculateWilliamsFractals(
        candles,
        williamsFractalsPeriods,
      );

      const latestWilliamsFractals =
        williamsFractals[williamsFractals.length - 1];

      if (
        latestWilliamsFractals.index ===
          candles.length - williamsFractalsPeriods &&
        latestWilliamsFractals.type === 'down'
      ) {
        this.isFractalBuy = true;
      } else {
        return false;
      }
    }

    // 조건 4: 20일 EMA 상향 돌파를 기다린다
    if (this.isFractalBuy && (!this.isEMA20Cross || !this.isEMA50Cross)) {
      if (closes[closes.length] <= ema20[ema20.length]) {
        return false; // 가격이 20일 EMA를 상향 돌파하지 않으면 대기
      }

      this.isEMA20Cross = true; // EMA20 돌파 시 상태 업데이트
    }

    // 모든 조건을 만족하면 매수 신호 발생
    return true; // 매수 신호 발생
  }

  /**
   * 롱 매수 포지션 진입 후 손절, 익절가 계산
   * @param symbol
   */
  async calculateExitPrices(symbol: string) {
    const candles = await this.getCandles(symbol, '1m', 100);
    const closes = candles.map((candle) => parseFloat(candle[4])); // 종가 가져오기
    const ema50 = this.calculateEMA(closes, 50);
    const currentPrice = closes[closes.length - 1];
    const stopLoss = ema50[ema50.length - 1]; // 손절가는 50 EMA
    const takeProfit = currentPrice + (currentPrice - stopLoss); // 익절가는 현재가에서 50 EMA 차이를 더한 값
    return { stopLoss, takeProfit };
  }
}
