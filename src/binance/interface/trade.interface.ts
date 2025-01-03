import {
  BINANCE_ORDER_TYPE,
  BINANCE_SYMBOL,
  POSITION,
  SIDE,
  TIME_IN_FORCE,
} from '../../common/constants/app.constants';

export interface ConditionState {
  // 이동평균선의 정배열 여부
  wasEMAOrdered: boolean;
  // 이동평균선의 20/50선 하향 돌파 여부
  wasPriceEMA20: boolean;
  wasPriceEMA50: boolean;
  // 윌리엄프랙탈 지표에서 down 신호 발생 여부
  wasFractalDetected: boolean;
  // 이동평균선의 20/50선 상향 돌파 여부
  wasEMA20Crossed: boolean;
  wasEMA50Crossed: boolean;
}

export interface Order {
  symbol: BINANCE_SYMBOL;
  side: SIDE;
  positionSide: POSITION;
  quantity: number;
  type: BINANCE_ORDER_TYPE;
  price?: number;
  stopPrice?: number;

  timeInForce?: TIME_IN_FORCE;
}
