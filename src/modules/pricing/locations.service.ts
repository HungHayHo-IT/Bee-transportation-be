import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Location, Prisma } from '@prisma/client';
import { PageResult } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { normalizeProvince } from '@/common/reference/provinces';
import { khuVucCuaTinh } from './khu-vuc-theo-tinh';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import {
  CreateLocationDto, LocationResponseDto, UpdateLocationDto,
} from './dto/pricing.dto';

/**
 * Tên địa điểm đã gọn: bỏ khoảng trắng hai đầu và GỘP khoảng trắng bên trong.
 *
 * Ô Excel của bảng giá hay xuống dòng giữa tên — "KCN ĐIỆN NAM ĐIỆN\n NGỌC" —
 * và cái xuống dòng đó đi thẳng vào danh mục rồi hiện ra giữa màn hình. Hàm
 * khoá của CSDL (`loc_name_key`) vốn đã gộp mọi khoảng trắng khi SO SÁNH, nên
 * giữ nguyên bản gốc chỉ để lại một cái tên xấu chứ không thêm thông tin gì.
 */
const gonTen = (ten: string): string => ten.replace(/\s+/g, ' ').trim();

/** Một địa điểm kèm tên khu vực — hình dạng mà mọi endpoint địa điểm trả về. */
function dto(
  l: Location & { region?: { name: string } | null },
): LocationResponseDto {
  return {
    id: l.id,
    name: l.name,
    province: l.province,
    /* Chưa khai địa chỉ riêng thì TÊN chính là địa chỉ: bảng giá nhập vào
       phần lớn chỉ có một ô "330 QL1A, Quận Bình Tân" — vừa là tên vừa là
       chỗ giao hàng thật. Để cột Địa chỉ trống là bắt người đọc tự suy ra
       điều mà dữ liệu đã nói rồi.

       Suy ra lúc đọc chứ KHÔNG chép xuống CSDL: chép là có hai bản của cùng
       một chuỗi, và hôm nào ai đó sửa tên thì địa chỉ vẫn giữ bản cũ. */
    address: l.address ?? l.name,
    officeCode: l.officeCode,
    of1Id: l.of1Id,
    regionId: l.regionId,
    regionName: l.region?.name ?? null,
    isActive: l.isActive,
  };
}

/** Danh mục địa điểm — hai đầu của mọi tuyến giá. */
@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tỉnh/thành đã CHUẨN HOÁ, hoặc ném lỗi nếu không nhận ra.
   *
   * Để text tự do thì 'Quảng Nam' và 'Đà Nẵng' là hai tỉnh khác nhau trong khi
   * chúng đã nhập làm một từ 2025 — và màn "chọn tỉnh rồi chọn địa điểm" sẽ
   * chia đôi danh sách địa điểm của cùng một tỉnh mà không ai hiểu vì sao.
   */
  private tinhChuan(raw: string | undefined): string | null | undefined {
    const ra = normalizeProvince(raw);
    if (ra === null && (raw ?? '').trim() !== '')
      throw new BadRequestException(
        `Không nhận ra tỉnh/thành "${raw}". Dùng tên trong danh mục 34 đơn vị ` +
        'sau sáp nhập 2025 — xem GET /reference/provinces.',
      );
    return ra;
  }

  /**
   * Địa điểm đã có trùng tên chưa — hỏi bằng CHÍNH hàm khoá của CSDL.
   *
   * Không viết lại luật chuẩn hoá bằng TypeScript: chỉ số unique trong DB dùng
   * `loc_name_key()`, và một bản sao ở tầng ứng dụng sớm muộn lệch với nó. Lúc
   * đó tầng ứng dụng nói "chưa có" rồi Postgres ném lỗi unique kèm tên index —
   * thứ người nhập không đọc được.
   */
  private async tenDaCo(ten: string, tinh: string | null, boQuaId?: number) {
    const rows = await this.prisma.$queryRaw<{ id: number; name: string }[]>`
      SELECT id, name FROM locations
       WHERE loc_name_key(name) = loc_name_key(${ten})
         AND coalesce(province, '') = coalesce(${tinh}::text, '')
       LIMIT 2`;
    return rows.find((r) => r.id !== boQuaId) ?? null;
  }

  /**
   * @param province Lọc theo tỉnh/thành. Màn chọn tuyến đi hai bước — chọn
   * tỉnh rồi chọn địa điểm TRONG tỉnh đó — nên bước hai phải hỏi được đúng
   * một tỉnh, không tải cả danh mục về rồi lọc ở trình duyệt.
   *
   * Chuẩn hoá trước khi lọc: gõ 'Quảng Nam' phải ra địa điểm của Đà Nẵng, nếu
   * không thì dữ liệu cũ tìm mãi không thấy. Tên không nhận ra -> danh sách
   * RỖNG, không phải cả danh mục: trả hết là người dùng tưởng tỉnh đó có từng
   * ấy địa điểm.
   */
  async listLocations(
    q?: string,
    includeInactive = false,
    province?: string,
    regionId?: number,
  ): Promise<PageResult<LocationResponseDto>> {
    /* Tỉnh không nhận ra -> lọc theo một chuỗi KHÔNG THỂ là tên tỉnh, tức là trả
       về rỗng. Trả cả danh mục thay vì rỗng sẽ là âm thầm bỏ qua bộ lọc: người
       dùng thấy một danh sách đầy và tưởng nó đã lọc.

       Trước đây sentinel là một byte NUL thật trong mã nguồn. Nó chạy đúng,
       nhưng git và grep coi cả tệp này là NHỊ PHÂN — nên tệp tàng hình với mọi
       lần tìm nội dung, và diff không đọc được. */
    const KHONG_CO_TINH_NAO = '(khong-phai-mot-ten-tinh)';
    const tinh =
      province === undefined ? undefined : (normalizeProvince(province) ?? KHONG_CO_TINH_NAO);
    const where: Prisma.LocationWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      ...(tinh === undefined ? {} : { province: tinh }),
      ...(regionId === undefined ? {} : { regionId }),
    };
    const items = await this.prisma.location.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { region: { select: { name: true } } },
      take: 500,
    });
    return {
      items: items.map((l) => dto(l)),
      total: items.length,
      page: 1,
      limit: items.length,
    };
  }

  async createLocation(body: CreateLocationDto, user: AuthenticatedUser): Promise<LocationResponseDto> {
    const ten = gonTen(body.name);
    const tinh = this.tinhChuan(body.province) ?? null;
    // Bắt trùng TRƯỚC khi ghi để trả về câu tiếng Việt, thay vì để Prisma ném
    // lỗi unique với tên index — người nhập không đọc được tên index.
    const daCo = await this.tenDaCo(ten, tinh);
    if (daCo)
      throw new ConflictException(
        `Địa điểm "${daCo.name}" đã có rồi — dùng lại nó thay vì tạo bản thứ hai.`,
      );

    const l = await this.prisma.location.create({
      data: {
        name: ten,
        province: tinh,
        address: body.address?.trim() || null,
        officeCode: body.officeCode?.trim() || null,
        of1Id: body.of1Id ?? null,
        regionId: body.regionId ?? (await this.khuVucTheoTinh(tinh)),
        createdBy: user.id,
      },
      include: { region: { select: { name: true } } },
    });
    return dto(l);
  }

  /**
   * Khu vực suy ra từ TỈNH/THÀNH, theo bảng chia ba miền.
   *
   * Trước đây hàm này hỏi "địa điểm nào khác cùng tỉnh đã có khu vực" rồi lấy
   * theo nó, cốt để không chép bảng chia vào mã nguồn. Ý tốt, nhưng dữ liệu
   * thật cho thấy hai cách hỏng:
   *
   * * Tỉnh chưa có địa điểm nào mang khu vực thì địa điểm mới nằm NGOÀI mọi
   *   khu vực — 346 trên 486 địa điểm rơi vào đó, và tuyến đi từ chúng không
   *   hiện ở bảng tuyến của bất kỳ khu vực nào.
   * * Kế thừa trúng một hàng xóm sai thì sai lan ra: sáu địa điểm TP.HCM nằm
   *   trong Miền Trung.
   *
   * Tra theo TÊN khu vực chứ không theo id viết cứng: ba khu vực là dữ liệu,
   * admin đổi tên hay thêm bớt được. Không tìm thấy khu vực mang tên đó thì
   * trả null — địa điểm hiện "Chưa có khu vực", một thiếu sót NHÌN THẤY được,
   * hơn là lặng lẽ gán bừa vào một khu vực nào đó.
   */
  private async khuVucTheoTinh(tinh: string | null): Promise<number | null> {
    const ten = khuVucCuaTinh(tinh);
    if (ten === null) return null;
    const kv = await this.prisma.priceRegion.findFirst({
      where: { name: { equals: ten, mode: 'insensitive' } },
      select: { id: true },
    });
    return kv?.id ?? null;
  }

  async updateLocation(id: number, body: UpdateLocationDto): Promise<LocationResponseDto> {
    const tinh = this.tinhChuan(body.province);

    /* Đổi tên hoặc đổi tỉnh thì phải kiểm trùng LẠI. Trước đây không kiểm, nên
       sửa một địa điểm thành trùng tên cái khác sẽ ăn lỗi unique thô của
       Postgres kèm tên index. */
    if (body.name !== undefined || tinh !== undefined) {
      const cu = await this.prisma.location.findUnique({
        where: { id },
        select: { name: true, province: true },
      });
      if (cu) {
        const daCo = await this.tenDaCo(
          body.name === undefined ? cu.name : gonTen(body.name),
          tinh === undefined ? cu.province : tinh,
          id,
        );
        if (daCo) throw new ConflictException(`Địa điểm "${daCo.name}" đã có rồi`);
      }
    }

    const l = await this.prisma.location.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: gonTen(body.name) } : {}),
        ...(tinh !== undefined ? { province: tinh } : {}),
        ...(body.address !== undefined ? { address: body.address.trim() || null } : {}),
        ...(body.officeCode !== undefined ? { officeCode: body.officeCode.trim() || null } : {}),
        ...(body.of1Id !== undefined ? { of1Id: body.of1Id } : {}),
        ...(body.regionId !== undefined ? { regionId: body.regionId } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        updatedAt: new Date(),
      },
      include: { region: { select: { name: true } } },
    });
    return dto(l);
  }

}
