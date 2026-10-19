import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PartnerLogo } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { LandingRefreshService, THE_LOGO_DOI_TAC } from '@/common/landing/landing-refresh.service';
import type {
  CreatePartnerLogoDto, NhomLogo, PartnerLogoDto, ReorderPartnerLogosDto, UpdatePartnerLogoDto,
} from './dto/partner-logo.dto';

/**
 * Logo hai dải đối tác trên trang chủ landing — khách hàng và hiệp hội.
 *
 * Mỗi lần sửa xong là bảo landing làm mới ngay (thẻ `partner-logos`): không
 * có cú gọi đó thì người vừa bật/tắt phải đợi hết cửa sổ cache, và trong lúc
 * chờ họ không phân biệt được "bật hụt" với "chưa tới lượt".
 */
@Injectable()
export class PartnerLogosService {
  private readonly s3Base: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly refresh: LandingRefreshService,
    config: ConfigService,
  ) {
    this.s3Base = (config.get<string>('S3_PUBLIC_URL_BASE') ?? '').replace(/\/+$/, '');
  }

  private static toDto(r: PartnerLogo): PartnerLogoDto {
    return {
      id: r.id,
      group: r.groupKey as NhomLogo,
      name: r.name,
      imageUrl: r.imageUrl,
      ratio: Number(r.ratio),
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    };
  }

  /** Landing: chỉ logo đang bật, đúng thứ tự hiện. */
  async congKhai(): Promise<PartnerLogoDto[]> {
    const rows = await this.prisma.partnerLogo.findMany({
      where: { isActive: true },
      orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map(PartnerLogosService.toDto);
  }

  /** CMS: mọi logo, kể cả đang tắt. */
  async tatCa(): Promise<PartnerLogoDto[]> {
    const rows = await this.prisma.partnerLogo.findMany({
      orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map(PartnerLogosService.toDto);
  }

  /**
   * Chỉ nhận ảnh từ ĐÚNG hai nguồn: kho S3 của BeeOps (CMS vừa tải lên) hoặc
   * thư mục logo có sẵn của landing. Một URL tuỳ ý là một cách cài ảnh của
   * người lạ — hay một điểm theo dõi — lên trang chủ.
   */
  private kiemAnh(url: string): void {
    const sach = url.trim();
    if (sach.startsWith('/img/logos/') && !sach.includes('..')) return;
    if (this.s3Base && sach.startsWith(`${this.s3Base}/`)) return;
    throw new BadRequestException('Ảnh logo phải được tải lên qua CMS');
  }

  async tao(dto: CreatePartnerLogoDto): Promise<PartnerLogoDto> {
    this.kiemAnh(dto.imageUrl);
    // Thêm vào CUỐI dải: người vừa thêm tìm thấy nó ngay ở cuối danh sách.
    const cuoi = await this.prisma.partnerLogo.aggregate({
      where: { groupKey: dto.group },
      _max: { sortOrder: true },
    });
    const row = await this.prisma.partnerLogo.create({
      data: {
        groupKey: dto.group,
        name: dto.name,
        imageUrl: dto.imageUrl.trim(),
        ratio: dto.ratio,
        sortOrder: (cuoi._max.sortOrder ?? 0) + 10,
      },
    });
    await this.refresh.lamMoi(THE_LOGO_DOI_TAC);
    return PartnerLogosService.toDto(row);
  }

  async sua(id: number, dto: UpdatePartnerLogoDto): Promise<PartnerLogoDto> {
    await this.mot(id);
    const row = await this.prisma.partnerLogo.update({
      where: { id },
      data: { name: dto.name, isActive: dto.isActive },
    });
    await this.refresh.lamMoi(THE_LOGO_DOI_TAC);
    return PartnerLogosService.toDto(row);
  }

  /**
   * Đặt lại thứ tự CẢ NHÓM theo đúng mảng id gửi lên.
   *
   * Đòi ĐỦ mọi id của nhóm, không nhận một phần: gửi thiếu là có dòng giữ
   * sort_order cũ chen vào giữa thứ tự mới, và kết quả trên trang chủ không
   * khớp cái người kéo vừa thấy. Hai người cùng sửa thì người sau thấy lỗi và
   * tải lại, thay vì âm thầm ghi đè thứ tự của nhau bằng một danh sách cũ.
   */
  async sapXep(dto: ReorderPartnerLogosDto): Promise<PartnerLogoDto[]> {
    const hienCo = await this.prisma.partnerLogo.findMany({
      where: { groupKey: dto.group },
      select: { id: true },
    });
    const conLai = new Set(hienCo.map((r) => r.id));
    if (dto.ids.length !== conLai.size || dto.ids.some((id) => !conLai.has(id))) {
      throw new BadRequestException('Danh sách logo đã thay đổi — tải lại rồi sắp xếp lại');
    }
    await this.prisma.$transaction(
      dto.ids.map((id, i) =>
        this.prisma.partnerLogo.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } })),
    );
    await this.refresh.lamMoi(THE_LOGO_DOI_TAC);
    return this.tatCa();
  }

  /**
   * Xoá hẳn dòng. Ảnh trên S3 KHÔNG xoá theo: CMS dùng chung kho, và một ảnh
   * lỡ đang được ô nội dung khác trỏ tới thì xoá đi là vỡ chỗ đó.
   */
  async xoa(id: number): Promise<void> {
    await this.mot(id);
    await this.prisma.partnerLogo.delete({ where: { id } });
    await this.refresh.lamMoi(THE_LOGO_DOI_TAC);
  }

  private async mot(id: number): Promise<PartnerLogo> {
    const r = await this.prisma.partnerLogo.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Không tìm thấy logo');
    return r;
  }
}
