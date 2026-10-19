import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PHIEN_DANG_AP_DUNG } from './phien-cho-doi-tac.helper';
import { Prisma } from '@prisma/client';
import { PageResult } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  CreateRoutePriceDto, RoutePriceResponseDto, UpdateRoutePriceDto,
} from './dto/pricing.dto';
import { GIA_INCLUDE, GiaRow } from './pricing.include';

/** Giá của từng tuyến trong một phiên bảng giá. */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  private giaToDto(r: GiaRow): RoutePriceResponseDto {
    return {
      id: r.id,
      sessionId: r.sessionId,
      originId: r.originId,
      originName: r.origin.name,
      destinationId: r.destinationId,
      destinationName: r.destination.name,
      unitCode: r.unitCode,
      unitLabel: r.unit.label,
      unitKind: r.unit.kind,
      price: Number(r.price),
      note: r.note,
    };
  }

  /**
   * @param sessionId Bỏ trống = phiên ĐANG ÁP DỤNG.
   *
   * Mặc định này là thứ màn "Giá niêm yết" cần: nó hỏi "giá hiện hành là bao
   * nhiêu", không phải "giá trong phiên số 7". Chưa công bố phiên nào thì trả
   * danh sách rỗng chứ không ném lỗi — bảng giá trống là một trạng thái hợp
   * lệ của một hệ thống vừa dựng.
   */
  /** Id phiên đang áp dụng, null khi chưa công bố phiên nào. */
  async idPhienDangApDung(): Promise<number | null> {
    const p = await this.prisma.priceSession.findFirst({
      where: { status: PHIEN_DANG_AP_DUNG },
      select: { id: true },
    });
    return p?.id ?? null;
  }

  /**
   * @param unitCode Lọc theo đơn vị tính. Một tuyến có 6-11 dòng giá, khác
   * nhau đúng ở đơn vị tính — nhìn cả bảng thì mỗi tuyến lặp lại chừng ấy lần
   * và không đọc được gì. Lọc một đơn vị thì bảng trở về đúng hình dạng của
   * file gốc: một dòng một tuyến.
   */
  async listPrices(
    sessionId?: number,
    q?: string,
    serviceId?: number,
    page = 1,
    limit = 50,
    unitCode?: string,
  ): Promise<PageResult<RoutePriceResponseDto>> {
    let phienId = sessionId;
    if (phienId === undefined) {
      const active = await this.prisma.priceSession.findFirst({
        where: { status: 'active' },
        select: { id: true },
      });
      if (!active) return { items: [], total: 0, page, limit };
      phienId = active.id;
    }

    const where: Prisma.RoutePriceWhereInput = {
      sessionId: phienId,
      ...(unitCode ? { unitCode } : {}),
      ...(q
        ? {
            OR: [
              { origin: { name: { contains: q, mode: 'insensitive' as const } } },
              { destination: { name: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.routePrice.findMany({
        where,
        include: GIA_INCLUDE,
        orderBy: [{ origin: { name: 'asc' } }, { destination: { name: 'asc' } }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.routePrice.count({ where }),
    ]);
    return { items: items.map((r) => this.giaToDto(r)), total, page, limit };
  }

  /**
   * Danh mục đơn vị tính đang bật, theo thứ tự hiện ra.
   *
   * Màn "Tuyến & giá" cần nó để dựng ô chọn: `unit_code` là một phần của khoá,
   * nên không có danh mục thì không thêm được dòng giá nào.
   */
  /** `sessionId`: chỉ đơn vị CÓ giá trong bảng giá khu vực của phiên đó. */
  async donViTinh(sessionId?: number): Promise<{ code: string; label: string; kind: string }[]> {
    return this.prisma.priceUnit.findMany({
      where: {
        isActive: true,
        ...(sessionId === undefined ? {} : { regionPrices: { some: { route: { sessionId } } } }),
      },
      select: { code: true, label: true, kind: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createPrice(dto: CreateRoutePriceDto): Promise<RoutePriceResponseDto> {
    if (dto.originId === dto.destinationId)
      throw new BadRequestException('Điểm đi và điểm đến phải khác nhau');
    await this.assertPhienSuaDuoc(dto.sessionId);

    try {
      const r = await this.prisma.routePrice.create({
        data: {
          sessionId: dto.sessionId,
          originId: dto.originId,
          destinationId: dto.destinationId,
          unitCode: dto.unitCode,
          price: dto.price,
          note: dto.note?.trim() || null,
        },
        include: GIA_INCLUDE,
      });
      return this.giaToDto(r);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException(
          'Tuyến này đã có giá cho dịch vụ và đơn vị tính đó trong phiên này',
        );
      throw e;
    }
  }

  async updatePrice(id: number, dto: UpdateRoutePriceDto): Promise<RoutePriceResponseDto> {
    const cu = await this.prisma.routePrice.findUnique({ where: { id } });
    if (!cu) throw new NotFoundException('Không tìm thấy dòng giá');
    await this.assertPhienSuaDuoc(cu.sessionId);

    const r = await this.prisma.routePrice.update({
      where: { id },
      data: {
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
        updatedAt: new Date(),
      },
      include: GIA_INCLUDE,
    });
    return this.giaToDto(r);
  }

  async deletePrice(id: number): Promise<void> {
    const cu = await this.prisma.routePrice.findUnique({ where: { id } });
    if (!cu) throw new NotFoundException('Không tìm thấy dòng giá');
    await this.assertPhienSuaDuoc(cu.sessionId);
    await this.prisma.routePrice.delete({ where: { id } });
  }

  /**
   * Giá niêm yết cho một tuyến + dịch vụ, theo phiên ĐANG ÁP DỤNG.
   *
   * Trả null khi: chưa công bố phiên nào, đơn chưa khai địa điểm, hoặc bảng
   * giá không có dòng nào cho tuyến đó. Cả ba đều là "bảng giá không nói gì
   * về tuyến này", và màn báo giá phải nói đúng như thế chứ không điền bừa
   * một con số — xem chonGiaNiemYet.
   */
  /**
   * Giá niêm yết của một tuyến, lấy từ BẢNG GIÁ KHU VỰC của phiên đang áp dụng.
   *
   * Khớp theo FCL/LCL chứ không theo dịch vụ con: một tuyến chở một cái 20DC
   * thì giá như nhau, bất kể đơn được xếp vào "Nội địa nguyên container" hay
   * "Xuất khẩu nguyên container" — cả hai đều là FCL.
   *
   * Đơn có dịch vụ con KHÔNG mang đuôi FCL/LCL (hàng không, hàng rời, hàng dự
   * án) thì KHÔNG có giá niêm yết: những thứ đó báo giá riêng từng đơn, và trả
   * bừa bảng giá xe tải cho một đơn hàng không là mời người ta lấy nhầm.
   */
  /**
   * Phiên bảng giá ĐANG HIỆU LỰC tại một thời điểm.
   *
   * Không khai mốc thì lấy phiên đang áp dụng. Có mốc — thường là lúc tạo đơn
   * — thì lấy phiên đã công bố gần nhất TRƯỚC mốc đó, kể cả phiên nay đã lưu
   * trữ: đơn tạo hôm qua được báo giá theo bảng giá hôm qua, và công bố phiên
   * mới hôm nay không được làm con số ấy biến mất khỏi màn hình.
   *
   * null = chưa từng công bố phiên nào.
   */
  private async phienTaiThoiDiem(moc?: Date | null) {
    if (moc) {
      const p = await this.prisma.priceSession.findFirst({
        where: { activatedAt: { not: null, lte: moc } },
        orderBy: { activatedAt: 'desc' },
        select: { id: true, name: true },
      });
      if (p) return p;
    }
    return this.prisma.priceSession.findFirst({
      where: { status: 'active' },
      select: { id: true, name: true },
    });
  }

  async giaNiemYet(
    originId: number | null,
    destinationId: number | null,
    serviceChildId?: number | null,
    /** Mốc thời gian để chọn phiên — lúc tạo đơn. Bỏ trống = phiên đang áp dụng. */
    moc?: Date | null,
  ): Promise<{
    units: { unitCode: string; unitLabel: string; unitKind: string; price: number }[];
    sessionId: number;
    sessionName: string;
  } | null> {
    // ĐỦ CẶP mới tra. Thiếu một đầu thì không có tuyến nào để nói tới, và trả
    // về giá của nửa tuyến là bịa.
    if (originId === null || destinationId === null) return null;

    const loai = await this.loaiHangCuaDon(serviceChildId);
    if (loai === null) return null;

    const phien = await this.phienTaiThoiDiem(moc);
    if (!phien) return null;

    /* MỘT tuyến có nhiều mức giá, mỗi đơn vị tính một mức — 8 với container,
       6 với xe tải. Trả về cả danh sách chứ không chọn hộ một con số: chọn hộ
       là giấu đi chuyện bảng giá đang nói nhiều mức, mà người báo giá mới là
       người biết lô hàng này đi loại xe nào. */
    const docGia = (sessionId: number) => this.prisma.regionRoutePrice.findMany({
      where: {
        kind: loai,
        route: { sessionId, originId, destinationId },
      },
      select: {
        unitCode: true,
        oneWayPrice: true,
        roundTripPrice: true,
        unit: { select: { label: true, kind: true, sortOrder: true } },
      },
      orderBy: { unit: { sortOrder: 'asc' } },
    });

    let dungPhien = phien;
    let dong = await docGia(phien.id);
    /* Phiên hồi đó không có tuyến này thì thử phiên ĐANG ÁP DỤNG: tuyến mới
       mở sau ngày tạo đơn vẫn giúp được người báo giá. Trả kèm tên phiên nên
       màn hình luôn nói rõ con số đang xem lấy từ bảng giá nào. */
    if (!dong.length) {
      const nay = await this.phienTaiThoiDiem();
      if (nay && nay.id !== phien.id) {
        dong = await docGia(nay.id);
        if (dong.length) dungPhien = nay;
      }
    }
    if (!dong.length) return null;

    /* Mỗi mức giá ra HAI dòng: một chiều và hai chiều. Gộp thành một con số thì
       người báo giá phải tự nhân chia, mà đó đúng là chỗ sai được. Chiều nào
       không có giá thì không có dòng — khác hẳn giá 0. */
    const units = dong.flatMap((d) => [
      ...(d.oneWayPrice === null ? [] : [{
        unitCode: d.unitCode,
        unitLabel: `${d.unit.label} · 1 chiều`,
        unitKind: d.unit.kind,
        price: Number(d.oneWayPrice),
      }]),
      ...(d.roundTripPrice === null ? [] : [{
        unitCode: d.unitCode,
        unitLabel: `${d.unit.label} · 2 chiều`,
        unitKind: d.unit.kind,
        price: Number(d.roundTripPrice),
      }]),
    ]);
    if (!units.length) return null;

    return { units, sessionId: dungPhien.id, sessionName: dungPhien.name };
  }

  /**
   * FCL hay LCL của một đơn, đọc từ dịch vụ con. null = không tra giá được.
   *
   * Đọc mã TMS trước rồi mới tới tên: mã là thứ hệ thống khác dùng, tên chỉ để
   * người đọc. Không có dịch vụ con thì cũng null — đơn chưa chọn dịch vụ con
   * thì chưa biết nó là hàng nguyên container hay hàng lẻ.
   */
  private async loaiHangCuaDon(serviceChildId?: number | null): Promise<'FCL' | 'LCL' | null> {
    if (serviceChildId === undefined || serviceChildId === null) return null;
    const con = await this.prisma.serviceChild.findUnique({
      where: { id: serviceChildId },
      select: { name: true, tmsMode: true },
    });
    if (!con) return null;
    const ma = (con.tmsMode ?? '').toUpperCase();
    if (ma.endsWith('_FCL')) return 'FCL';
    if (ma.endsWith('_LCL')) return 'LCL';
    const ten = con.name.toUpperCase();
    if (ten.includes('(FCL)')) return 'FCL';
    if (ten.includes('(LCL)')) return 'LCL';
    return null;
  }


  /**
   * Phiên đã lưu trữ thì KHÔNG sửa được dòng giá nữa.
   *
   * Nó là bản ghi của một khoảng thời gian đã qua — sửa nó là sửa lại quá
   * khứ, và mọi đơn đã báo theo phiên đó bỗng không khớp với thứ đang lưu.
   * Phiên đang áp dụng vẫn sửa được: bảng giá sống thì có lúc phải vá.
   */
  private async assertPhienSuaDuoc(sessionId: number): Promise<void> {
    const p = await this.prisma.priceSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });
    if (!p) throw new NotFoundException('Không tìm thấy phiên giá');
    if (p.status === 'archived')
      throw new BadRequestException('Phiên đã lưu trữ không sửa được — hãy chép ra một phiên mới');
  }
}
