export enum BINANCE_CONSTANTS {
  DEFAULT_WILLIAMS_FRACTAL_PERIODS = 2,
  MIN_BTC_TRADE = 0.002,
}

export enum BINANCE_SYMBOL {
  BTCUSDT = 'BTCUSDT',
  XRPUSDT = 'XRPUSDT',
}

export enum POSITION {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

export enum SIDE {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum TIME_IN_FORCE {
  /**
   * Good Til Canceled
   * 주문이 사용자가 직접 취소할 때까지 유효합니다.
   */
  GTC = 'GTC',
  /**
   * Immediate Or Cancel
   * 주문이 즉시 체결 가능한 부분만 실행되고, 나머지 미체결 부분은 즉시 취소 됩니다.
   */
  IOC = 'IOC',
  /**
   * Fill Or Kill
   * 주문이 전량 체결될 수 있으면 실행하고, 그렇지 않으면 전량 취소합니다.
   */
  FOK = 'FOK',
}

export enum BINANCE_ORDER_TYPE {
  // 시장가로 즉시 체결
  MARKET = 'MARKET',
  // 지정가로 체결 (가격 지정 필요)
  LIMIT = 'LIMIT',
  // 특정 가격에서 지정가로 체결
  STOP = 'STOP',
  // 특정 가격에서 시장가로 체결
  STOP_MARKET = 'STOP_MARKET',
  // 이익 실현 지정가 주문
  TAKE_PROFIT = 'TAKE_PROFIT',
  // 이익 실현 시장가 주문
  TAKE_PROFIT_MARKET = 'TAKE_PROFIT_MARKET',
  // 추적 스탑 시장가 주문
  TRAILING_STOP_MARKET = 'TRAILING_STOP_MARKET',
}
