export interface KlineInterface {
  openTime: number; // 시작 시간 (타임스탬프)
  open: number; // 시작 가격
  high: number; // 최고 가격
  low: number; // 최저 가격
  close: number; // 종가
  volume: number; // 거래량
  closeTime: number; // 종료 시간 (타임스탬프)
  quoteAssetVolume: number; // 견적 자산 거래량
  numberOfTrades: number; // 거래 횟수
  takerBuyBaseAssetVolume: number; // 테이커 매수 기본 자산 거래량
  takerBuyQuoteAssetVolume: number; // 테이커 매수 견적 자산 거래량
}
