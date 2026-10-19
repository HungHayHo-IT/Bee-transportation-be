import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

/**
 * Cấu hình GIẢ chứ không phải ConfigService thật.
 *
 * ConfigService ưu tiên `process.env` HƠN đối tượng truyền vào. CI đặt sẵn
 * SMTP_PORT=587 cho cả job, nên bài thử cổng 465 không bao giờ nhận được 465 —
 * nó xanh ở máy (máy không có biến đó) và đỏ trên CI. Đã dính thật.
 */
const cauHinh = (them: Record<string, string | number> = {}): ConfigService => {
  const bang: Record<string, string | number> = {
    SMTP_HOST: 'smtp.vd.vn',
    SMTP_USER: 'u',
    SMTP_PASS: 'p',
    SMTP_FROM: 'BeeOps <no-reply@vd.vn>',
    FRONTEND_ORIGIN: 'https://vd.vn',
    ...them,
  };
  return {
    get: (k: string) => bang[k],
    getOrThrow: (k: string) => {
      const v = bang[k];
      if (v === undefined) throw new Error(`thiếu ${k}`);
      return v;
    },
  } as unknown as ConfigService;
};

/** Cấu hình thật mà nodemailer đang giữ, để kiểm chứ không đoán. */
const optCua = (s: MailService): Record<string, unknown> =>
  (s as unknown as { transporter: { options: Record<string, unknown> } }).transporter.options;

describe('MailService — bắt tay TLS', () => {
  /**
   * `secure` PHẢI theo cổng.
   *
   * Trước đây nó bị viết cứng là false. Cổng 465 là TLS NGẦM — máy chủ mong một
   * bắt tay TLS ngay từ byte đầu tiên; gửi chữ thường vào đó thì kết nối treo
   * rồi quá hạn, và tất cả những gì người dùng thấy là "không gửi được email".
   * Rất nhiều nhà cung cấp trong nước chỉ mở 465.
   */
  it('cổng 465 thì bật TLS ngầm', () => {
    expect(optCua(new MailService(cauHinh({ SMTP_PORT: 465 }))).secure).toBe(true);
  });

  /* 587 là STARTTLS: mở bằng kết nối thường rồi mới nâng cấp. Bật secure ở đây
     là hỏng theo chiều ngược lại. */
  it('cổng 587 thì dùng STARTTLS, không bật TLS ngầm', () => {
    expect(optCua(new MailService(cauHinh({ SMTP_PORT: 587 }))).secure).toBe(false);
  });

  it('không khai cổng thì mặc định 587', () => {
    const o = optCua(new MailService(cauHinh()));
    expect(o.port).toBe(587);
    expect(o.secure).toBe(false);
  });

  /* Cửa thoát cho nhà cung cấp lệch chuẩn — có nơi chạy TLS ngầm trên cổng lạ.
     Khai tay thì phải thắng suy đoán theo cổng. */
  it('SMTP_SECURE khai tay thì thắng suy đoán theo cổng', () => {
    expect(optCua(new MailService(cauHinh({ SMTP_PORT: 587, SMTP_SECURE: 'true' }))).secure).toBe(true);
    expect(optCua(new MailService(cauHinh({ SMTP_PORT: 465, SMTP_SECURE: 'false' }))).secure).toBe(false);
  });
});
