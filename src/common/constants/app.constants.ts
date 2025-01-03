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

export enum WILLIAMS_FRACTAL_TYPE {
  UP = 'UP',
  DOWN = 'DOWN',
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
  // 지정가 주문 (timeInForce, quantity, price)
  LIMIT = 'LIMIT',
  // 시장가 주문 (quantity)
  MARKET = 'MARKET',

  // 손절 (price, stopPrice)
  STOP = 'STOP',
  // 익절 (price, stopPrice)
  TAKE_PROFIT = 'TAKE_PROFIT',

  // 시장가 손절 (stopPrice)
  STOP_MARKET = 'STOP_MARKET',
  // 시장가 익절 (stopPrice)
  TAKE_PROFIT_MARKET = 'TAKE_PROFIT_MARKET',

  // (callbackRate)
  TRAILING_STOP_MARKET = 'TRAILING_STOP_MARKET',
}
