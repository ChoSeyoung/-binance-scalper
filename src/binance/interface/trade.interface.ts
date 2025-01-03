import {
  BINANCE_ORDER_TYPE,
  BINANCE_SYMBOL,
  POSITION,
  SIDE,
  TIME_IN_FORCE,
} from '../../common/constants/app.constants';

export interface ConditionState {
  // 이동평균선의 정배열 여부
  isGoldenArrangement: boolean;
  // 이동평균선의 20/50선 하향 돌파 여부
  isFirstDownwardBreakout: boolean;
  isSecondDownwardBreakout: boolean;
  // 윌리엄프랙탈 신호 발생 여부
  isFractalSignal: boolean;
  // 이동평균선의 20/50선 상향 돌파 여부
  isFirstUpwardBreakout: boolean;
  isSecondUpwardBreakout: boolean;
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

export interface PositionRisk {
  // 거래 심볼 (예: ADAUSDT)
  symbol: string;
  // 포지션 방향 (BOTH, LONG, SHORT)
  positionSide: string;
  // 포지션 수량
  positionAmt: number;
  // 진입 가격
  entryPrice: number;
  // 손익분기 가격
  breakEvenPrice: number;
  // 현재 마크 가격
  markPrice: number;
  // 미실현 손익
  unRealizedProfit: number;
  // 청산 가격
  liquidationPrice: number;
  // 격리 마진
  isolatedMargin: number;
  // 명목 가치
  notional: number;
  // 마진 자산 (예: USDT)
  marginAsset: string;
  // 격리 지갑 잔고
  isolatedWallet: number;
  // 초기 마진
  initialMargin: number;
  // 유지 마진
  maintMargin: number;
  // 포지션 초기 마진
  positionInitialMargin: number;
  // 오픈 오더 초기 마진
  openOrderInitialMargin: number;
  // 자동 디레버리징 순위
  adl: number;
  // 매수 명목 가치
  bidNotional: number;
  // 매도 명목 가치
  askNotional: number;
  // 마지막 업데이트 시간 (타임스탬프)
  updateTime: number;
}

export interface EvaluateConditionsResult {
  result: boolean;
  tradePrice: number;
  profitStopPrice: number;
  lossStopPrice: number;
}
