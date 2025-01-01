import { Injectable } from '@nestjs/common';
import { DateUtilService } from '../util/date-util.service';
import { StockUtilService } from '../util/stock-util.service';
import axios from 'axios';
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
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly dateUtilService: DateUtilService,
    private readonly stockUtilService: StockUtilService,
  ) {
    this.baseUrl =
      this.configService.get<string>('NODE_ENV') === 'production'
        ? 'https://fapi.binance.com/fapi/v1'
        : 'https://testnet.binancefuture.com/fapi/v1';
  }

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
      // 캔들 조회
      const response = await axios.get(`${this.baseUrl}/klines`, {
        params: {
          symbol,
          interval,
          limit: limit.toString(),
        },
      });

      // 데이터 변환
      const candles: Kline[] = response.data.map(
        (candle: any[], index: number) => {
          // 시간 참조를 위한 utc, kst 기준 시간 조회
          const { utc: utcOpenTime, kst: kstOpenTime } =
            this.dateUtilService.formatTimestampMillis(candle[0]);

          return {
            openTime: candle[0],
            utcOpenTime: utcOpenTime,
            kstOpenTime: kstOpenTime,
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

      // 윌리엄 프랙탈 지수 조회
      const williamsFractals =
        this.stockUtilService.calculateWilliamsFractals(candles);
      williamsFractals.forEach((williamsFractal, index) => {
        candles[index].williamsFractalType = williamsFractal.type;
      });

      return candles;
    } catch (error) {
      console.error('Error fetching candle data from Binance:', error);
      throw error;
    }
  }

  /**
   * 신규주문
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
  ) {
    try {
      // 바이낸스 API 키와 시크릿 키 가져오기
      const apiKey = this.configService.get<string>('BINANCE_API_KEY');
      const secretKey = this.configService.get<string>('BINANCE_SECRET_KEY');

      // 요청 시간 조회
      const { utc: utcTimestamp } = this.dateUtilService.getTimestamps();

      // 요청 파라미터 구성
      const params = {
        symbol,
        side,
        positionSide,
        type,
        quantity,
        utcTimestamp,
        stopPrice,
      };

      // QueryString 생성 및 서명
      const queryString = Object.keys(params)
        .map((key) => `${key}=${encodeURIComponent(params[key])}`)
        .join('&');

      const signature = crypto
        .createHmac('sha256', secretKey)
        .update(queryString)
        .digest('hex');

      // API 호출
      const response = await axios.post(
        `${this.baseUrl}/order?${queryString}&signature=${signature}`,
        {},
        {
          headers: {
            'X-MBX-APIKEY': apiKey,
          },
        },
      );

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
