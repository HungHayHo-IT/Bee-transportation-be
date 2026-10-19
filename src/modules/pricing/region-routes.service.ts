import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageResult } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { normalizeProvince } from '@/common/reference/provinces';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import {
  PriceRegionDto, RegionRouteDto, SaveRegionDto, SaveRegionRouteDto,
} from './dto/pricing.dto';
import { PriceSessionsService } from './price-sessions.service';
import { KEM, raTuyen } from './region-route.helper';

/** Bộ lọc của danh sách tuyến phẳng. Trống = không lọc. */
export interface LocTuyen {
  /** Phiên giá. Bỏ trống = phiên đang áp dụng, không có thì phiên mới nhất. */
  sessionId?: number;
  regionId?: number;
  originProvince?: string;
  destinationProvince?: string;
  /** Lọc theo ĐÚNG một địa điểm, không phải theo tỉnh: một tỉnh có hàng chục
      kho, cảng và KCN, mà người tra giá thường biết rõ mình đi từ đâu. */
  originLocationId?: number;
  destinationLocationId?: number;
  /** Lọc theo khối giá: FCL hay LCL. */
  kind?: string;
  /** Chỉ tuyến CÓ giá ở đơn vị tính này (vd CBM). */
  unitCode?: string;
  page: number;
  limit: number;
}


/**
 * Khu vực → tuyến → giá theo dịch vụ con và trọng tải xe (061).
 *
 * KHU VỰC THUỘC ĐỊA ĐIỂM. Khu vực của một tuyến là khu vực của địa điểm NHẬN,
 * suy ra bằng phép join chứ không có cột nào trên `region_routes`. Nhờ vậy màn
 * "Địa điểm" và màn "Khu vực và tuyến" không thể nói hai điều khác nhau về
 * cùng một kho: đổi khu vực của kho thì mọi tuyến đi từ đó chuyển theo.
 *
 * Khác `PricingService`: bảng kia là (phiên, cặp địa điểm, đơn vị tính) → một
 * con số, và đang chạy cho giá tham khảo ở màn đơn hàng. Bảng này không theo
 * phiên, còn một mức giá có hai con số (một chiều / hai chiều) kèm số km.
 */
@Injectable()
export class RegionRoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phien: PriceSessionsService,
  ) {}

  /* --------------------------------------------------------------- khu vực */

  /**
   * Khu vực mà người này được thấy: `undefined` = thấy hết.
   *
   * Quản trị và Giám đốc thấy toàn bộ bảng giá — đó là cơ cấu chi phí của cả
   * công ty và họ là người duyệt nó. Trưởng phòng chỉ thấy khu vực mình đứng
   * tên (066): họ cần giá miền mình để báo khách, còn giá hai miền kia là
   * những tuyến họ không chạy.
   *
   * Vai khác không tới được đây — ma trận phân quyền chặn ở cửa.
   */
  private async idKhuVucDuocXem(user: AuthenticatedUser): Promise<number[] | undefined> {
    if (user.roles.includes('admin') || user.roles.includes('leader')) return undefined;
    const cua = await this.prisma.priceRegion.findMany({
      where: { managerId: user.id },
      select: { id: true },
    });
    return cua.map((r) => r.id);
  }

  /**
   * Danh sách khu vực kèm hai con số đếm.
   *
   * Một câu SQL chứ không phải N+1 lần đếm: danh sách này tải mỗi lần mở màn
   * và mỗi lần lưu xong một tuyến.
   */
  async listRegions(user: AuthenticatedUser, sessionId?: number): Promise<PriceRegionDto[]> {
    /* Số tuyến đếm theo PHIÊN đang xem, số địa điểm thì không: địa điểm là
       danh mục dùng chung, nó không thuộc phiên nào cả. */
    const phienId = await this.phien.idPhienDeDoc(sessionId);
    const duocXem = await this.idKhuVucDuocXem(user);
    if (duocXem !== undefined && duocXem.length === 0) return [];
    const rows = await this.prisma.$queryRaw<{
      id: number; name: string; manager_id: number | null; manager_name: string | null;
      route_count: bigint; location_count: bigint;
    }[]>`
      SELECT r.id, r.name, r.manager_id, u.full_name AS manager_name,
             (SELECT count(*) FROM region_routes rr
               JOIN locations l ON l.id = rr.origin_id
               WHERE l.region_id = r.id
                 AND rr.session_id = ${phienId ?? -1}) AS route_count,
             (SELECT count(*) FROM locations l
               WHERE l.region_id = r.id AND l.is_active) AS location_count
        FROM price_regions r
        LEFT JOIN users u ON u.id = r.manager_id
       WHERE ${duocXem === undefined} OR r.id = ANY(${duocXem ?? []}::int[])
       ORDER BY r.sort_order, lower(btrim(r.name))`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      managerId: r.manager_id,
      managerName: r.manager_name,
      routeCount: Number(r.route_count),
      locationCount: Number(r.location_count),
    }));
  }

  /**
   * Trùng tên chưa — hỏi bằng CHÍNH hàm khoá của chỉ số unique trong DB.
   *
   * Cùng lý do như `LocationsService.tenDaCo`: một bản sao luật chuẩn hoá ở
   * tầng ứng dụng sớm muộn lệch với chỉ số, và lúc đó người nhập nhận được tên
   * index thay vì một câu tiếng Việt.
   */
  private async tenKhuVucDaCo(name: string, boQuaId?: number): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ id: number; name: string }[]>`
      SELECT id, name FROM price_regions
       WHERE lower(btrim(name)) = lower(btrim(${name}))
       LIMIT 2`;
    return rows.find((r) => r.id !== boQuaId)?.name ?? null;
  }

  /**
   * Người phụ trách phải là TRƯỞNG PHÒNG đang hoạt động.
   *
   * Giao cho một vai khác thì cái quyền vừa mở ở 066 không áp vào ai cả: màn
   * bảng giá chỉ mở cho `manager`, nên một Sale được giao khu vực vẫn không
   * vào được — và người giao thì tưởng đã giao xong.
   */
  private async kiemNguoiPhuTrach(managerId: number | null | undefined): Promise<void> {
    if (managerId === undefined || managerId === null) return;
    const u = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { roles: true, isActive: true, fullName: true },
    });
    if (!u) throw new BadRequestException('Không tìm thấy nhân viên này');
    if (!u.isActive) throw new BadRequestException(`Tài khoản "${u.fullName}" đang bị khoá`);
    if (!u.roles.includes('manager'))
      throw new BadRequestException(
        `"${u.fullName}" không phải Trưởng phòng — chỉ Trưởng phòng mới phụ trách được khu vực.`,
      );
  }

  async createRegion(dto: SaveRegionDto): Promise<PriceRegionDto> {
    const name = dto.name.trim();
    const daCo = await this.tenKhuVucDaCo(name);
    if (daCo) throw new ConflictException(`Khu vực "${daCo}" đã có rồi`);
    await this.kiemNguoiPhuTrach(dto.managerId);
    /* Khu vực mới xuống CUỐI danh sách. Thứ tự Bắc → Trung → Nam là thứ tự
       người ta đọc bảng giá; chèn vào giữa thì mỗi lần thêm lại đảo chỗ. */
    const cuoi = await this.prisma.priceRegion.aggregate({ _max: { sortOrder: true } });
    const r = await this.prisma.priceRegion.create({
      data: {
        name,
        managerId: dto.managerId ?? null,
        sortOrder: (cuoi._max.sortOrder ?? 0) + 1,
      },
      include: { manager: { select: { fullName: true } } },
    });
    return {
      id: r.id,
      name: r.name,
      managerId: r.managerId,
      managerName: r.manager?.fullName ?? null,
      routeCount: 0,
      locationCount: 0,
    };
  }

  async updateRegion(
    id: number, dto: SaveRegionDto, user: AuthenticatedUser,
  ): Promise<PriceRegionDto> {
    const name = dto.name.trim();
    const daCo = await this.tenKhuVucDaCo(name, id);
    if (daCo) throw new ConflictException(`Khu vực "${daCo}" đã có rồi`);
    await this.kiemNguoiPhuTrach(dto.managerId);
    await this.prisma.priceRegion.update({
      where: { id },
      data: {
        name,
        // Vắng mặt = KHÔNG đụng tới người phụ trách; gửi null = gỡ.
        ...(dto.managerId === undefined ? {} : { managerId: dto.managerId }),
        updatedAt: new Date(),
      },
    });
    const sau = (await this.listRegions(user)).find((r) => r.id === id);
    if (!sau) throw new NotFoundException('Không tìm thấy khu vực');
    return sau;
  }

  /**
   * Xoá một khu vực — CHỈ khi không còn địa điểm nào trong đó.
   *
   * Không tự chuyển địa điểm sang chỗ khác và cũng không xoá chúng: địa điểm
   * còn nằm trong đơn hàng cũ và bảng giá cũ, còn tuyến thì mang giá thật. Bắt
   * dọn trước là ít mã hơn một đường cascade, và không ai mất dữ liệu vì bấm
   * nhầm một cái nút ở thanh bên.
   */
  async deleteRegion(id: number): Promise<void> {
    const con = await this.prisma.location.count({ where: { regionId: id } });
    if (con > 0)
      throw new ConflictException(
        `Khu vực này còn ${con} địa điểm. Chuyển chúng sang khu vực khác rồi xoá.`,
      );
    await this.prisma.priceRegion.delete({ where: { id } });
  }

  /* ----------------------------------------------------------------- tuyến */

  /** Tỉnh đã chuẩn hoá để lọc; tên không nhận ra -> không khớp gì, chứ không bỏ lọc. */
  private tinhLoc(raw: string | undefined): string | undefined {
    if (raw === undefined || raw.trim() === '') return undefined;
    return normalizeProvince(raw) ?? '(khong-phai-mot-ten-tinh)';
  }

  async listRoutes(loc: LocTuyen, user: AuthenticatedUser): Promise<PageResult<RegionRouteDto>> {
    const phienId = await this.phien.idPhienDeDoc(loc.sessionId);
    const duocXem = await this.idKhuVucDuocXem(user);
    if (duocXem !== undefined && duocXem.length === 0)
      return { items: [], total: 0, page: loc.page, limit: loc.limit };
    // Chưa có phiên nào thì chưa có bảng giá nào — trả rỗng, đừng trả tất cả.
    if (phienId === null) return { items: [], total: 0, page: loc.page, limit: loc.limit };
    const tinhDi = this.tinhLoc(loc.originProvince);
    const tinhDen = this.tinhLoc(loc.destinationProvince);
    /* Khu vực và tỉnh đi CÙNG nằm trên `origin`, nên phải gộp vào một điều
       kiện: viết hai khoá `origin` trong một object thì cái sau đè cái trước
       và một trong hai bộ lọc im lặng mất tác dụng. */
    const diaDiemDi = {
      ...(loc.regionId === undefined ? {} : { regionId: loc.regionId }),
      // Trưởng phòng: ép về đúng khu vực mình phụ trách, bất kể bộ lọc gửi lên.
      ...(duocXem === undefined ? {} : { regionId: { in: duocXem } }),
      ...(tinhDi === undefined ? {} : { province: tinhDi }),
      ...(loc.originLocationId === undefined ? {} : { id: loc.originLocationId }),
    };
    const diaDiemDen = {
      ...(tinhDen === undefined ? {} : { province: tinhDen }),
      ...(loc.destinationLocationId === undefined
        ? {} : { id: loc.destinationLocationId }),
    };
    const where: Prisma.RegionRouteWhereInput = {
      sessionId: phienId,
      ...(Object.keys(diaDiemDi).length === 0 ? {} : { origin: diaDiemDi }),
      ...(Object.keys(diaDiemDen).length === 0 ? {} : { destination: diaDiemDen }),
      ...(loc.kind === undefined && loc.unitCode === undefined
        ? {} : { prices: { some: { kind: loc.kind, unitCode: loc.unitCode } } }),
    };

    const [total, rows] = await Promise.all([
      this.prisma.regionRoute.count({ where }),
      this.prisma.regionRoute.findMany({
        where,
        include: KEM,
        orderBy: [{ origin: { name: 'asc' } }, { destination: { name: 'asc' } }],
        skip: (loc.page - 1) * loc.limit,
        take: loc.limit,
      }),
    ]);
    return { items: rows.map(raTuyen), total, page: loc.page, limit: loc.limit };
  }

  /** Tuyến của MỘT khu vực — bảng bên phải của màn hình, không phân trang. */
  async listRoutesOfRegion(
    regionId: number, user: AuthenticatedUser, sessionId?: number,
  ): Promise<RegionRouteDto[]> {
    const phienId = await this.phien.idPhienDeDoc(sessionId);
    if (phienId === null) return [];
    /* Chặn ở ĐÂY chứ không chỉ giấu khu vực trên menu: biết id khu vực là gõ
       thẳng được vào địa chỉ, và bảng giá miền khác hiện ra như thường. */
    const duocXem = await this.idKhuVucDuocXem(user);
    if (duocXem !== undefined && !duocXem.includes(regionId)) return [];
    const rows = await this.prisma.regionRoute.findMany({
      where: { sessionId: phienId, origin: { regionId } },
      include: KEM,
      orderBy: [{ origin: { name: 'asc' } }, { destination: { name: 'asc' } }],
    });
    return rows.map(raTuyen);
  }

  /**
   * Kiểm hai đầu tuyến và bắt trùng NGAY TRONG payload.
   *
   * Chỉ số unique của DB cũng chặn, nhưng nó ném tên constraint ra — thứ người
   * nhập bảng giá không đọc được. Ở đây nói đúng cái đang trùng.
   */
  private async kiemPayload(
    dto: SaveRegionRouteDto, phienId: number, boQuaId?: number,
  ): Promise<void> {
    if (dto.originLocationId === dto.destinationLocationId)
      throw new BadRequestException('Điểm nhận và điểm giao phải là hai địa điểm khác nhau');

    const dd = await this.prisma.location.findMany({
      where: { id: { in: [dto.originLocationId, dto.destinationLocationId] } },
      select: { id: true },
    });
    if (dd.length !== 2) throw new BadRequestException('Địa điểm không tồn tại');

    const loai = dto.services.map((s) => s.kind);
    if (new Set(loai).size !== loai.length)
      throw new BadRequestException('Mỗi tuyến chỉ có một khối FCL và một khối LCL');

    const maDonVi = [...new Set(dto.services.flatMap((s) => s.prices.map((p) => p.unitCode)))];
    const donViCo = await this.prisma.priceUnit.findMany({
      where: { code: { in: maDonVi } },
      select: { code: true },
    });
    if (donViCo.length !== maDonVi.length) {
      const thieu = maDonVi.filter((m) => !donViCo.some((d) => d.code === m));
      throw new BadRequestException(`Đơn vị tính không có trong danh mục: ${thieu.join(', ')}`);
    }

    for (const s of dto.services) {
      const units = s.prices.map((p) => p.unitCode);
      if (new Set(units).size !== units.length)
        throw new BadRequestException('Một đơn vị tính chỉ được khai một mức giá trong cùng khối');
      /* Cùng ràng buộc với `region_route_prices_co_gia_ck` của DB, nhưng trả
         về bằng tiếng Việt trước khi Postgres kịp ném tên constraint. */
      if (s.prices.some((p) => (p.oneWayPrice ?? null) === null && (p.roundTripPrice ?? null) === null))
        throw new BadRequestException('Mỗi mức giá phải có giá ít nhất một chiều');
    }

    /* Trùng tính TRONG MỘT PHIÊN. Cùng một cặp địa điểm ở phiên khác là
       chuyện bình thường — đó đúng là ý nghĩa của phiên: cùng tuyến, giá kỳ
       này khác giá kỳ trước. */
    const trung = await this.prisma.regionRoute.findFirst({
      where: {
        sessionId: phienId,
        originId: dto.originLocationId,
        destinationId: dto.destinationLocationId,
        ...(boQuaId === undefined ? {} : { id: { not: boQuaId } }),
      },
      include: { origin: { select: { name: true } }, destination: { select: { name: true } } },
    });
    if (trung)
      throw new ConflictException(
        `Tuyến ${trung.origin.name} → ${trung.destination.name} đã có rồi — `
        + 'sửa tuyến đó thay vì thêm bản thứ hai.',
      );
  }

  /** Giá của một payload, đã phẳng thành các dòng của `region_route_prices`. */
  private static dongGia(dto: SaveRegionRouteDto): Prisma.RegionRoutePriceCreateManyRouteInput[] {
    return dto.services.flatMap((s) =>
      s.prices.map((p) => ({
        kind: s.kind,
        unitCode: p.unitCode,
        oneWayPrice: p.oneWayPrice ?? null,
        roundTripPrice: p.roundTripPrice ?? null,
      })));
  }

  async createRoute(dto: SaveRegionRouteDto, user: AuthenticatedUser): Promise<RegionRouteDto> {
    const { id: phienId } = await this.phien.idPhienDeGhi(dto.sessionId, user);
    await this.kiemPayload(dto, phienId);
    const r = await this.prisma.regionRoute.create({
      data: {
        sessionId: phienId,
        originId: dto.originLocationId,
        destinationId: dto.destinationLocationId,
        roundTripKm: dto.roundTripKm ?? null,
        createdBy: user.id,
        prices: { createMany: { data: RegionRoutesService.dongGia(dto) } },
      },
      include: KEM,
    });
    return raTuyen(r);
  }

  /**
   * Sửa một tuyến. `services` THAY CẢ danh sách giá.
   *
   * Xoá hết rồi ghi lại trong một giao dịch, chứ không so khớp từng dòng: giao
   * diện gửi lên nguyên trạng những gì đang hiện, nên một mức giá đã bị xoá
   * trên màn hình phải mất thật. So khớp từng dòng chỉ để giữ `created_at` của
   * mấy dòng không đổi là nhiều mã hơn cho một thứ không ai đọc.
   */
  async updateRoute(
    id: number, dto: SaveRegionRouteDto, user: AuthenticatedUser,
  ): Promise<RegionRouteDto> {
    const co = await this.prisma.regionRoute.findUnique({ where: { id } });
    if (!co) throw new NotFoundException('Không tìm thấy tuyến');
    /* Tuyến không đổi phiên được: chuyển một tuyến sang phiên khác là sửa vào
       bảng giá của kỳ khác, mà người bấm Lưu đang nghĩ mình sửa đúng cái đang
       nhìn. Muốn sang phiên khác thì thêm tuyến ở phiên đó. */
    await this.phien.idPhienDeGhi(co.sessionId, user);
    await this.kiemPayload(dto, co.sessionId, id);
    const r = await this.prisma.$transaction(async (tx) => {
      await tx.regionRoutePrice.deleteMany({ where: { routeId: id } });
      return tx.regionRoute.update({
        where: { id },
        data: {
          originId: dto.originLocationId,
          destinationId: dto.destinationLocationId,
          roundTripKm: dto.roundTripKm ?? null,
          updatedAt: new Date(),
          prices: { createMany: { data: RegionRoutesService.dongGia(dto) } },
        },
        include: KEM,
      });
    });
    return raTuyen(r);
  }

  /** Xoá tuyến xoá luôn giá của nó (ON DELETE CASCADE ở DB). */
  async deleteRoute(id: number, user: AuthenticatedUser): Promise<void> {
    const co = await this.prisma.regionRoute.findUnique({ where: { id } });
    if (!co) throw new NotFoundException('Không tìm thấy tuyến');
    // Phiên đã lưu trữ thì không xoá được — xem `idPhienDeGhi`.
    await this.phien.idPhienDeGhi(co.sessionId, user);
    await this.prisma.regionRoute.delete({ where: { id } });
  }
}
