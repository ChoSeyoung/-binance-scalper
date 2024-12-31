import { Injectable } from '@nestjs/common';

@Injectable()
export class DateUtilService {
  getTimestamps(): { kst: number; utc: number } {
    const now = new Date();
    const kstTimestamp = now.getTime(); // KST 기준 timestamp
    const utcTimestamp = kstTimestamp - 9 * 60 * 60 * 1000; // UTC로 변환
    return { kst: kstTimestamp, utc: utcTimestamp };
  }

  formatTimestampMillis(timestampMillis: number): { utc: string; kst: string } {
    const date = new Date(timestampMillis);

    // UTC 시간
    const utc = this.formatDate(date);

    // KST 시간 (UTC + 9시간)
    const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const kst = this.formatDate(kstDate);

    return { utc, kst };
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 월은 0부터 시작하므로 +1
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}
