import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { ghepDieuKhoan } from './dieu-khoan.helper';
import {
  DieuKhoanResponseDto, TaoDieuKhoanDto, SuaDieuKhoanDto,
} from './dto/dieu-khoan.dto';

/** Khoá cấu hình cũ — đường lui khi chưa soạn điều nào. Xem `toanVan()`. */
const KHOA_CU = 'dieu_khoan_ky';

@Injectable()
export class DieuKhoanService {
  constructor(private readonly prisma: PrismaService) {}

  private static toDto(c: {
    id: number; title: string; body: string; sortOrder: number; isActive: boolean;
    updatedAt: Date; editor?: { fullName: string } | null;
  }): DieuKhoanResponseDto {
    return {
      id: c.id,
      title: c.title,
      body: c.body,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      updatedAt: c.updatedAt.toISOString(),
      updatedByName: c.editor?.fullName ?? null,
    };
  }

  /** Cả danh sách, KỂ CẢ điều đã tắt — màn quản trị cần thấy để bật lại. */
  async danhSach(): Promise<DieuKhoanResponseDto[]> {
    const rows = await this.prisma.termsClause.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { editor: { select: { fullName: true } } },
    });
    return rows.map((r) => DieuKhoanService.toDto(r));
  }

  /**
   * Toàn văn gửi khách ký — các điều ĐANG BẬT ghép lại.
   *
   * Chưa soạn điều nào thì rơi về `app_settings.dieu_khoan_ky`, giá trị dùng
   * trước migration 053. Không có đường lui này thì giữa lúc chuyển đổi, một
   * cơ sở dữ liệu chưa có điều nào sẽ gửi cho khách một tờ giấy trắng.
   */
  async toanVan(): Promise<string> {
    const dieu = await this.prisma.termsClause.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { title: true, body: true },
    });
    if (dieu.length > 0) return ghepDieuKhoan(dieu);

    const cu = await this.prisma.appSetting.findUnique({ where: { key: KHOA_CU } });
    return cu?.value ?? '';
  }

  /** Điều mới xuống CUỐI danh sách: thêm vào giữa là việc của nút đổi thứ tự. */
  async tao(dto: TaoDieuKhoanDto, user: AuthenticatedUser): Promise<DieuKhoanResponseDto> {
    const cuoi = await this.prisma.termsClause.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.termsClause.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        sortOrder: (cuoi._max.sortOrder ?? 0) + 1,
        updatedBy: user.id,
      },
      include: { editor: { select: { fullName: true } } },
    });
    return DieuKhoanService.toDto(row);
  }

  async sua(
    id: number,
    dto: SuaDieuKhoanDto,
    user: AuthenticatedUser,
  ): Promise<DieuKhoanResponseDto> {
    if (!(await this.prisma.termsClause.count({ where: { id } })))
      throw new NotFoundException('Không tìm thấy điều khoản');
    const row = await this.prisma.termsClause.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedBy: user.id,
        updatedAt: new Date(),
      },
      include: { editor: { select: { fullName: true } } },
    });
    return DieuKhoanService.toDto(row);
  }

  /**
   * Xoá hẳn một điều.
   *
   * An toàn vì mỗi chữ ký đã chụp lại TOÀN VĂN điều khoản tại thời điểm ký
   * (order_signatures.dieu_khoan) — xoá hôm nay không làm sai chữ ký hôm qua.
   */
  async xoa(id: number): Promise<void> {
    if (!(await this.prisma.termsClause.count({ where: { id } })))
      throw new NotFoundException('Không tìm thấy điều khoản');
    await this.prisma.termsClause.delete({ where: { id } });
  }
}
