import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PermissionMatrixService } from '@/common/permissions/permission-matrix.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';

/** Khoá trong app_settings — sửa được ở màn Cấu hình hệ thống. */
export const KHOA_GIOI_HAN = 'pricing_lookup_per_hour';

/** Dùng khi chưa có dòng cấu hình, hoặc giá trị trong đó hỏng. */
const MAC_DINH = 60;

const MOT_GIO = 60 * 60 * 1000;

/**
 * Giới hạn số lần tra giá một tuyến, mỗi người một giờ.
 *
 * VÌ SAO CẦN. Từ 057, Sale và Pricing không duyệt được cả bảng giá nữa — nhưng
 * vẫn tra được từng tuyến, vì màn báo giá cần con số đó. Không có trần thì ngồi
 * tra lần lượt từng cặp địa điểm là dựng lại cả bảng giá, chỉ lâu hơn.
 *
 * AI BỊ TÍNH. Chỉ người KHÔNG mở được cả bảng giá. Với người mở được, cái trần
 * này không bảo vệ gì cả — họ đọc trọn bảng trong một lần bấm, nên chặn họ ở
 * đường tra từng tuyến chỉ là làm phiền.
 *
 * ponytail: đếm trong BỘ NHỚ của một tiến trình. Đủ cho hiện tại — BeeOps chạy
 * một instance Fastify, và đây là cái trần chống dò bảng chứ không phải hàng
 * rào chống tấn công. Chạy nhiều instance thì trần nhân lên theo số instance;
 * lúc đó chuyển sang đếm bằng một bảng Postgres (hoặc Redis nếu đã có).
 */
@Injectable()
export class GioiHanTraGia {
  /** userId -> các mốc thời gian đã tra, chỉ giữ phần trong một giờ gần nhất. */
  private readonly lanTra = new Map<number, number[]>();

  /** Giá trị cấu hình + lúc đọc. Đọc lại mỗi phút, không phải mỗi request. */
  private cache: { tran: number; luc: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly matrix: PermissionMatrixService,
  ) {}

  private async tran(): Promise<number> {
    const nay = Date.now();
    if (this.cache && nay - this.cache.luc < 60_000) return this.cache.tran;

    const row = await this.prisma.appSetting.findUnique({ where: { key: KHOA_GIOI_HAN } });
    const so = Number(row?.value);
    // Số hỏng (ai đó gõ chữ vào ô cấu hình) rơi về mặc định chứ KHÔNG thành 0:
    // 0 nghĩa là chặn mọi lần tra, tức là một lỗi gõ làm hỏng màn báo giá của
    // cả công ty.
    const tran = Number.isFinite(so) && so > 0 ? Math.floor(so) : MAC_DINH;
    this.cache = { tran, luc: nay };
    return tran;
  }

  /** Gọi TRƯỚC khi tra. Ném 429 khi đã chạm trần. */
  async ghiNhan(user: AuthenticatedUser): Promise<void> {
    const mucBangGia = await this.matrix.mucCua(user.roles, 'priceList');
    if (mucBangGia !== 'none') return;

    const tran = await this.tran();
    const nay = Date.now();
    const con = (this.lanTra.get(user.id) ?? []).filter((t) => nay - t < MOT_GIO);

    if (con.length >= tran) {
      this.lanTra.set(user.id, con);
      throw new HttpException(
        `Đã tra giá ${tran} lần trong một giờ — đợi ít phút rồi tra tiếp. ` +
        'Cần tra nhiều hơn thì nhờ quản trị viên nâng giới hạn ở màn Cấu hình hệ thống.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    con.push(nay);
    this.lanTra.set(user.id, con);
  }
}
