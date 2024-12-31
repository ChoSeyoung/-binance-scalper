import { Module } from '@nestjs/common';
import { DateUtilService } from './date-util.service';
import { StockUtilService } from './stock-util.service';

@Module({
  providers: [DateUtilService, StockUtilService],
  exports: [DateUtilService, StockUtilService],
})
export class UtilModule {}
