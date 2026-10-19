import { readFileSync } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { docKhoa, giaiMa, TIEN_TO_MA_HOA } from './bi-mat.helper';

/**
 * Đọc biến môi trường, tự giải mã giá trị mang tiền tố `enc:`.
 *
 * Khoá ưu tiên đọc từ FILE (`APP_SECRET_KEY_FILE`) chứ không từ biến môi
 * trường. Đây là điểm mấu chốt: để khoá ngay trong .env thì mã hoá chỉ là
 * khoá cửa rồi treo chìa lên nắm cửa — ai đọc được file đó đã có cả hai. Để
 * ngoài thì .env lỡ lọt ra (gửi nhầm, sao chép nhầm, lên git) token vẫn vô
 * dụng.
 *
 * `APP_SECRET_KEY` vẫn nhận, cho máy phát triển và cho lúc chưa kịp dựng file.
 */
@Injectable()
export class BiMatService {
  private readonly logger = new Logger(BiMatService.name);
  private khoa: Buffer | null | undefined;

  constructor(private readonly config: ConfigService) {}

  private docKhoaMotLan(): Buffer | null {
    if (this.khoa !== undefined) return this.khoa;
    const duongDan = this.config.get<string>('APP_SECRET_KEY_FILE');
    const thoKhoa = duongDan
      ? readFileSync(duongDan, 'utf8')
      : (this.config.get<string>('APP_SECRET_KEY') ?? '');
    this.khoa = thoKhoa.trim() ? docKhoa(thoKhoa) : null;
    if (this.khoa && !duongDan) {
      this.logger.warn(
        'APP_SECRET_KEY nằm ngay trong biến môi trường. Ai đọc được .env là có cả '
        + 'khoá lẫn giá trị — dùng APP_SECRET_KEY_FILE để tách khoá ra ngoài.',
      );
    }
    return this.khoa;
  }

  /**
   * Thiếu khoá mà giá trị lại đang mã hoá thì NÉM LỖI. Trả chuỗi `enc:...`
   * nguyên văn ra ngoài là tệ nhất: BeeOps sẽ đem nó đi gọi OF1 như thể đó là
   * token, nhận 401, và không ai đoán ra vì sao.
   */
  doc(ten: string): string {
    const v = this.config.get<string>(ten) ?? '';
    if (!v.startsWith(TIEN_TO_MA_HOA)) return v;
    const khoa = this.docKhoaMotLan();
    if (!khoa) {
      throw new Error(
        `${ten} đang mã hoá nhưng chưa có khoá — đặt APP_SECRET_KEY_FILE hoặc APP_SECRET_KEY`,
      );
    }
    return giaiMa(v, khoa);
  }
}
