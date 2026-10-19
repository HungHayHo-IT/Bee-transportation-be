import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Đọc một cờ bật/tắt từ cấu hình: Joi ép chuỗi 'true' thành boolean thật, còn
 * `.env` thì luôn đưa vào chuỗi — nhận cả hai, chưa khai thì trả undefined để
 * nơi gọi tự suy đoán.
 */
function boSung(v: string | boolean | undefined): boolean | undefined {
  if (v === undefined || v === '') return undefined;
  return v === true || v === 'true';
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  /** Fallback plain-text cho client không đọc HTML. Tùy chọn. */
  text?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.getOrThrow<string>('SMTP_FROM');
    const port = Number(this.config.get<number>('SMTP_PORT') ?? 587);
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port,
      /* `secure` THEO CỔNG, không viết cứng false.

         465 là TLS NGẦM: máy chủ mong một bắt tay TLS ngay từ byte đầu tiên, nên
         gửi chữ thường vào đó là kết nối treo rồi quá hạn — và tất cả những gì
         người dùng thấy là "không gửi được email". Rất nhiều nhà cung cấp trong
         nước chỉ mở 465. 587 thì ngược lại: mở thường rồi STARTTLS nâng cấp.

         `SMTP_SECURE` là cửa thoát cho nhà cung cấp lệch chuẩn — có nơi chạy TLS
         ngầm trên cổng lạ. Khai tay thì thắng suy đoán. */
      secure: boSung(this.config.get<string | boolean>('SMTP_SECURE')) ?? port === 465,
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASS'),
      },
    });
  }

  async send(mail: MailInput): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...mail });
  }

  /**
   * FRONTEND_ORIGIN có thể là danh sách origin ngăn cách bằng dấu phẩy (QA-13).
   * Link trong e-mail lấy origin đầu tiên; ghép cả chuỗi vào URL sẽ ra "a,b/orders/1".
   */
  get baseUrl(): string {
    return this.config.getOrThrow<string>('FRONTEND_ORIGIN').split(',')[0].trim();
  }

  /** Link về hệ thống — email chỉ là kênh nhắc, nội dung thật nằm trên web. */
  orderLink(orderId: number): string {
    return `${this.baseUrl}/orders/${orderId}`;
  }

  layout(bodyHtml: string): string {
    return [
      '<div style="font-family:system-ui,Segoe UI,sans-serif;font-size:14px;color:#241F16">',
      bodyHtml,
      '<hr style="border:none;border-top:1px solid #DCD3BE;margin:18px 0">',
      '<p style="color:#6E6552;font-size:12px">BeeOps — Bee Transportation Corporation.',
      ' Email này chỉ để nhắc việc, đừng trả lời.</p></div>',
    ].join('');
  }
}
