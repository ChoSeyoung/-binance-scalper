import { Injectable } from '@nestjs/common';
import { DateUtilService } from '../util/date-util.service';
import { StockUtilService } from '../util/stock-util.service';
import axios, { AxiosInstance } from 'axios';
import { Kline } from './interface/kline.interface';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  BINANCE_SYMBOL,
  POSITION,
  SIDE,
} from '../common/constants/app.constants';

@Injectable()
export class BinanceApiService {
  private readonly axiosInstance: AxiosInstance;
  private readonly apiKey: string;
  private readonly secretKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly dateUtilService: DateUtilService,
    private readonly stockUtilService: StockUtilService,
  ) {
    const baseUrl =
      this.configService.get<string>('NODE_ENV') === 'production'
        ? 'https://fapi.binance.com/fapi'
        : 'https://testnet.binancefuture.com/fapi';

    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    this.apiKey = this.configService.get<string>('BINANCE_API_KEY');
    this.secretKey = this.configService.get<string>('BINANCE_SECRET_KEY');
  }

  /**
   * 바이낸스 서버 시간 조회
   * @private
   */
  private async getServerTime(): Promise<number> {
    const response = await this.axiosInstance.get('/time');
    return response.data.serverTime;
  }

  /**
   * signature 파라미터 생성
   * @param params
   * @private
   */
  private generateSignature(params: Record<string, any>): string {
    const queryString = new URLSearchParams(params).toString();
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(queryString)
      .digest('hex');
  }

  /**
   * 바이낸스 ping
   */
  async ping(): Promise<any> {
    try {
      const response = await this.axiosInstance.get('/ping');
      return response.data;
    } catch (error) {
      console.error('Error fetching ping data from Binance:', error.message);
      throw error;
    }
  }

  /**
   * 바이낸스 계좌조회
   */
  async getAccount(): Promise<any> {
    try {
      const serverTime = await this.getServerTime();
      const params = { timestamp: serverTime };
      const signature = this.generateSignature(params);

      const response = await this.axiosInstance.get(`/v2/account`, {
        params: { ...params, signature },
        headers: { 'X-MBX-APIKEY': this.apiKey },
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching balance data from Binance:', error.message);
      throw error;
    }
  }

  /**
   * 바이낸스 캔들 조회
   *
   * @param symbol
   * @param interval
   * @param limit
   */
  async getCandles(
    symbol: string,
    interval: string,
    limit: number = 100,
  ): Promise<Kline[]> {
    try {
      const response = await this.axiosInstance.get('/v1/klines', {
        params: { symbol, interval, limit },
      });

      const candles: Kline[] = response.data.map((candle: any[]) => {
        const { utc: utcOpenTime, kst: kstOpenTime } =
          this.dateUtilService.formatTimestampMillis(candle[0]);

        return {
          openTime: candle[0],
          utcOpenTime,
          kstOpenTime,
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
      });

      const williamsFractals =
        this.stockUtilService.calculateWilliamsFractals(candles);

      williamsFractals.forEach((williamsFractal, index) => {
        candles[index].williamsFractalType = williamsFractal.type;
      });

      return candles;
    } catch (error) {
      console.error('Error fetching candle data from Binance:', error.message);
      throw error;
    }
  }

  /**
   * 신규 주문 요청
   *
   * @param symbol
   * @param side
   * @param positionSide
   * @param type
   * @param quantity
   * @param stopPrice
   */
  async newOrder(
    symbol: BINANCE_SYMBOL,
    side: SIDE,
    positionSide: POSITION,
    type: string,
    quantity: number,
    stopPrice?: number,
  ): Promise<any> {
    try {
      const serverTime = await this.getServerTime();
      const params: Record<string, any> = {
        symbol,
        side,
        positionSide,
        type,
        quantity,
        timestamp: serverTime,
        ...(stopPrice && { stopPrice }),
      };

      const signature = this.generateSignature(params);

      const response = await this.axiosInstance.post(`/order`, null, {
        params: { ...params, signature },
        headers: { 'X-MBX-APIKEY': this.apiKey },
      });

      return response.data;
    } catch (error) {
      console.error(
        'Error creating a new order on Binance:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }
}
