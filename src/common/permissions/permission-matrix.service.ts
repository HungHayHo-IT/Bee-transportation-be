import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_ROLES, Role } from '../enums';
import { khoaO, mucCaoNhat } from './permission-matrix.helper';
import {
  KHOA_TRANG, MAC_DINH, MUC_QUYEN_HOP_LE, MucQuyen, TRANG_PHAN_QUYEN, VAI_TRO_KHONG_MAT_QUYEN,
} from './pages';

export interface ODat {
  role: string;
  pageKey: string;
  level: MucQuyen;
}

/**
 * Ma trận phân quyền theo trang, đọc từ cơ sở dữ liệu.
 *
 * Nhớ tạm trong bộ nhớ vì guard tra nó trên MỌI request — đi xuống DB mỗi lần
 * là thêm một round-trip vào đường đi của từng cú bấm. Bản nhớ bị xoá ngay khi
 * có người lưu ma trận, nên không có cửa sổ "đã lưu mà chưa có hiệu lực".
 *
 * Nhiều tiến trình API chạy song song thì mỗi tiến trình giữ bản nhớ riêng, và
 * chỉ tiến trình nhận cú lưu mới xoá bản của mình. Vì vậy vẫn có TTL: quá hạn
 * là đọc lại, nên các tiến trình còn lại chậm nhất một nhịp chứ không kẹt mãi.
 */
@Injectable()
export class PermissionMatrixService {
  private readonly logger = new Logger(PermissionMatrixService.name);
  private nhoTam: Map<string, MucQuyen> | null = null;
  private nhoLuc = 0;
  /** Giây. Ngắn vì đây là quyền: chậm cập nhật lâu hơn thế là rủi ro thật. */
  private static readonly TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  private async bang(): Promise<Map<string, MucQuyen>> {
    if (this.nhoTam && Date.now() - this.nhoLuc < PermissionMatrixService.TTL_MS) {
      return this.nhoTam;
    }
    const rows = await this.prisma.rolePagePermission.findMany({
      select: { role: true, pageKey: true, level: true },
    });
    const m = new Map<string, MucQuyen>();
    for (const r of rows) {
      // Giá trị lạ (ai đó sửa thẳng DB) coi như KHÔNG có quyền, không phải bỏ
      // qua: bỏ qua là rơi về mặc định của trang, mà mặc định đó cũng là đóng —
      // ghi rõ ra đây để lần sau đọc log biết có dòng hỏng.
      if (!MUC_QUYEN_HOP_LE.includes(r.level)) {
        this.logger.warn(`Mức quyền lạ trong DB: ${r.role}/${r.pageKey} = ${r.level}`);
        continue;
      }
      m.set(khoaO(r.role, r.pageKey), r.level as MucQuyen);
    }
    this.nhoTam = m;
    this.nhoLuc = Date.now();
    return m;
  }

  /** Xoá bản nhớ — gọi ngay sau khi lưu ma trận. */
  quen(): void {
    this.nhoTam = null;
  }

  /** Mức quyền của một người trên một trang. */
  async mucCua(roles: readonly string[], pageKey: string): Promise<MucQuyen> {
    /* Admin không bao giờ mất quyền trên chính màn ma trận: một lần bấm nhầm
       sẽ khoá cả công ty khỏi màn duy nhất mở lại được quyền, và đường sửa còn
       lại là vào thẳng cơ sở dữ liệu. */
    if (pageKey === TRANG_PHAN_QUYEN && roles.includes(VAI_TRO_KHONG_MAT_QUYEN)) {
      return MucQuyen.DAY_DU;
    }
    return mucCaoNhat(await this.bang(), roles, pageKey);
  }

  /** Toàn bộ ma trận cho màn quản trị: đủ mọi ô, thiếu thì trả `none`. */
  async toanBo(): Promise<ODat[]> {
    const b = await this.bang();
    return KHOA_TRANG.flatMap((pageKey) =>
      ALL_ROLES.map((role) => ({
        role,
        pageKey,
        level: b.get(khoaO(role, pageKey)) ?? MucQuyen.KHONG,
      })),
    );
  }

  /**
   * Lưu một loạt ô.
   *
   * Từ chối cả mẻ nếu có một ô sai, thay vì lưu phần hợp lệ: nửa vời ở đây
   * nghĩa là ma trận trên màn hình và ma trận thật khác nhau, mà người vừa bấm
   * Lưu lại tưởng mọi thứ đã xong.
   */
  async luu(o: readonly ODat[], actorId: number): Promise<number> {
    for (const x of o) {
      if (!KHOA_TRANG.includes(x.pageKey))
        throw new BadRequestException(`Trang không hợp lệ: ${x.pageKey}`);
      if (!(ALL_ROLES as string[]).includes(x.role))
        throw new BadRequestException(`Vai trò không hợp lệ: ${x.role}`);
      if (!MUC_QUYEN_HOP_LE.includes(x.level))
        throw new BadRequestException(`Mức quyền không hợp lệ: ${x.level}`);
      if (x.pageKey === TRANG_PHAN_QUYEN && x.role === VAI_TRO_KHONG_MAT_QUYEN
        && x.level !== MucQuyen.DAY_DU) {
        throw new BadRequestException(
          'Không thể bỏ quyền của Quản trị viên trên chính màn phân quyền',
        );
      }
    }

    await this.prisma.$transaction(
      o.map((x) =>
        this.prisma.rolePagePermission.upsert({
          where: { role_pageKey: { role: x.role, pageKey: x.pageKey } },
          create: { role: x.role, pageKey: x.pageKey, level: x.level, updatedBy: actorId },
          update: { level: x.level, updatedBy: actorId, updatedAt: new Date() },
        }),
      ),
    );
    this.quen();
    return o.length;
  }

  /**
   * Đặt lại toàn bộ ma trận về bản mặc định.
   *
   * Ghi đè TẤT CẢ các ô, kể cả ô chưa ai đụng tới: "đặt lại" mà chỉ đụng phần
   * đã sửa thì kết quả phụ thuộc vào lịch sử, và hai hệ thống cùng bấm nút này
   * sẽ ra hai bộ quyền khác nhau.
   */
  async datLaiMacDinh(actorId: number): Promise<number> {
    const o: ODat[] = [];
    for (const [pageKey, m] of Object.entries(MAC_DINH)) {
      for (const [role, level] of Object.entries(m)) o.push({ role, pageKey, level });
    }
    return this.luu(o, actorId);
  }

  /** Dùng trong test và lúc khởi động: các vai trò hệ thống biết tới. */
  static vaiTro(): readonly string[] {
    return Object.values(Role);
  }
}
