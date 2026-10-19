import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Thẻ cache bên landing. Phải khớp danh sách trắng ở app/api/revalidate. */
export const THE_NOI_DUNG = 'landing-content';
export const THE_NGUOI_DAI_DIEN = 'representatives';
export const THE_DICH_VU_THEM = 'services-them';
export const THE_LOGO_DOI_TAC = 'partner-logos';

/**
 * Bảo landing vứt bản đang nhớ trong cache của một thẻ.
 *
 * Không có cú gọi này thì người vừa sửa phải ngồi đợi hết cửa sổ 60 giây mới
 * thấy — và trong lúc chờ họ không phân biệt được "lưu hụt" với "chưa tới lượt
 * làm mới".
 *
 * Một chỗ dùng chung cho CMS và người đại diện: hai nơi tự gọi tự viết thì
 * sớm muộn một nơi quên cắt dấu gạch cuối hoặc quên nuốt lỗi.
 */
@Injectable()
export class LandingRefreshService {
  private readonly logger = new Logger(LandingRefreshService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * KHÔNG để lỗi ở đây làm hỏng lượt lưu: dữ liệu đã nằm trong cơ sở dữ liệu
   * rồi, cùng lắm là hiện chậm. Ném lỗi ra là người dùng bấm Lưu lần nữa và
   * tưởng lần đầu thất bại.
   */
  async lamMoi(the: string): Promise<void> {
    const goc = (this.config.get<string>('LANDING_URL') ?? '').replace(/\/+$/, '');
    const biMat = this.config.get<string>('REVALIDATE_SECRET') ?? '';
    if (!goc || !biMat) return;
    try {
      const res = await fetch(`${goc}/api/revalidate`, {
        method: 'POST',
        headers: { 'x-revalidate-secret': biMat, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: the }),
      });
      if (!res.ok) this.logger.warn(`Landing từ chối làm mới ${the}: HTTP ${res.status}`);
    } catch (e) {
      this.logger.warn(`Không gọi được làm mới landing (${the}): ${String(e)}`);
    }
  }
}
