import { UnauthorizedException } from '@nestjs/common';
import { hashRefreshToken, newRefreshToken, refreshExpiresAt } from './refresh-token.helper';

/** Thông điệp DUY NHẤT cho mọi ca hỏng: hết hạn, bịa ra, của người khác, bị
 * trộm — đều như nhau. Phân biệt giúp kẻ tấn công biết nó đang tới gần đâu. */
const TU_CHOI = 'Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại';

/** Cột chủ sở hữu. Nhân viên và khách là hai bảng tách rời nên tên cột khác nhau. */
export type OwnerField = 'userId' | 'customerId';

interface RefreshRow {
  id: number;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Phần giao của hai Prisma delegate (refreshToken / customerRefreshToken). Khai
 * bằng structural type thay vì import kiểu Prisma: hai delegate đó khác nhau về
 * kiểu nên không có một kiểu Prisma chung nào ghép được cả hai.
 */
export interface RefreshDelegate {
  findUnique(args: { where: { tokenHash: string } }): Promise<RefreshRow | null>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

/**
 * Kho refresh token, dùng chung cho cả nhân viên lẫn khách hàng.
 *
 * KHÔNG phải @Injectable: hai module auth khác nhau, mà module của khách thì
 * không được sửa để đăng ký thêm provider. Đây là lớp thuần, service tự dựng
 * lấy từ delegate của mình — và nhờ vậy test cũng không cần DI.
 */
export class RefreshTokenStore {
  constructor(
    private readonly rows: RefreshDelegate,
    private readonly ownerField: OwnerField,
  ) {}

  /** Cấp token mới cho một chủ thể. Trả token THÔ — lần duy nhất nó tồn tại ngoài client. */
  async issue(ownerId: number, now: Date = new Date()): Promise<string> {
    const raw = newRefreshToken();
    await this.rows.create({
      data: {
        [this.ownerField]: ownerId,
        tokenHash: hashRefreshToken(raw),
        expiresAt: refreshExpiresAt(now),
      },
    });
    return raw;
  }

  /**
   * Xoay vòng: đổi refresh cũ lấy refresh mới, cũ bị thu hồi ngay.
   *
   * Việc "thu hồi cái cũ" làm bằng updateMany có điều kiện `revokedAt: null` rồi
   * đếm số dòng, thay vì đọc-rồi-ghi. Lý do là chạy đua: app mobile hay bắn hai
   * request refresh song song khi nhiều màn cùng gặp 401. Với đọc-rồi-ghi thì cả
   * hai đều thấy "chưa thu hồi" và cùng đi tiếp; với điều kiện ở mệnh đề WHERE
   * thì đúng một cái thắng, cái thua đếm được 0 và rơi vào nhánh tái sử dụng.
   *
   * count = 0 nghĩa là token này đã được dùng rồi. Không phân biệt được "kẻ trộm
   * dùng lại" với "chính chủ bấm hai lần", nên chọn phía an toàn: cắt sạch mọi
   * phiên của tài khoản. Chính chủ phải đăng nhập lại — phiền, nhưng rẻ hơn
   * nhiều so với để một phiên bị đánh cắp sống thêm 30 ngày.
   */
  async rotate(raw: string, now: Date = new Date()): Promise<{ ownerId: number; refreshToken: string }> {
    const row = await this.rows.findUnique({ where: { tokenHash: hashRefreshToken(raw) } });
    if (!row) throw new UnauthorizedException(TU_CHOI);

    const ownerId = (row as unknown as Record<string, number>)[this.ownerField];

    // Hết hạn là chuyện bình thường (máy để lâu không mở), KHÔNG phải dấu hiệu
    // bị trộm — chỉ đóng đúng dòng này, không đụng các phiên khác.
    if (row.expiresAt.getTime() <= now.getTime()) {
      await this.revokeRow(row.id, now);
      throw new UnauthorizedException(TU_CHOI);
    }

    const claimed = await this.rows.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (claimed.count !== 1) {
      await this.revokeAll(ownerId, now);
      throw new UnauthorizedException(TU_CHOI);
    }

    return { ownerId, refreshToken: await this.issue(ownerId, now) };
  }

  /**
   * Xoay vòng CỘNG kiểm chủ thể còn hoạt động. Tách ra đây vì cả hai phía đều
   * cần đúng một luật: refresh sống 30 ngày, nên nếu không hỏi lại DB thì một
   * tài khoản vừa bị khoá vẫn tự gia hạn phiên được suốt 30 ngày đó.
   *
   * Đã khoá thì cắt sạch mọi phiên, không chỉ cái vừa xoay: người bị khoá không
   * còn lý do giữ phiên nào, và để lại thì lần refresh sau lại tốn một vòng tra.
   */
  async rotateForActiveOwner(
    raw: string,
    isActive: (ownerId: number) => Promise<boolean>,
  ): Promise<{ ownerId: number; refreshToken: string }> {
    const out = await this.rotate(raw);
    if (!(await isActive(out.ownerId))) {
      await this.revokeAll(out.ownerId);
      throw RefreshTokenStore.reject();
    }
    return out;
  }

  /**
   * Logout. Token rác / thiếu thì im lặng: người dùng đã bấm đăng xuất, báo lỗi
   * ở đây chỉ làm họ kẹt lại trong một phiên mà chính họ muốn bỏ.
   */
  async revoke(raw: string | undefined | null, now: Date = new Date()): Promise<void> {
    if (!raw) return;
    await this.rows.updateMany({
      where: { tokenHash: hashRefreshToken(raw), revokedAt: null },
      data: { revokedAt: now },
    });
  }

  /** Thu hồi mọi phiên còn sống của một chủ thể (nghi bị đánh cắp). */
  async revokeAll(ownerId: number, now: Date = new Date()): Promise<void> {
    await this.rows.updateMany({
      where: { [this.ownerField]: ownerId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async revokeRow(id: number, now: Date): Promise<void> {
    await this.rows.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now } });
  }

  /** Lỗi chuẩn để service bên ngoài ném cùng một thông điệp, không tự chế câu khác. */
  static reject(): UnauthorizedException {
    return new UnauthorizedException(TU_CHOI);
  }
}
