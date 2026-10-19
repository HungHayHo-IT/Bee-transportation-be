import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PHIEN_DANG_AP_DUNG } from './phien-cho-doi-tac.helper';
import { PageResult } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import {
  CreatePriceSessionDto, PriceSessionResponseDto, UpdatePriceSessionDto,
} from './dto/pricing.dto';
import { PHIEN_INCLUDE, PhienRow } from './pricing.include';
import { PriceSessionStatus, assertChuyenPhien } from './price-session.helper';

/** Phiên bảng giá: soạn → công bố → lưu trữ. */
@Injectable()
export class PriceSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Số dòng giá THẬT của từng phiên.
   *
   * `_count.prices` chỉ đếm bảng giá CŨ (`route_prices`). Bảng giá khu vực
   * treo giá dưới `region_routes`, cách phiên hai bậc, mà `_count` của Prisma
   * không đi xuyên quan hệ được — nên một phiên có 355 dòng giá vẫn hiện số 0
   * và nút "Công bố" nằm im vì màn hình tưởng phiên rỗng.
   */
  private async demGiaKhuVuc(idPhien: readonly number[]): Promise<Map<number, number>> {
    if (idPhien.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ session_id: number; n: bigint }[]>`
      SELECT r.session_id, count(*) AS n
        FROM region_route_prices g
        JOIN region_routes r ON r.id = g.route_id
       WHERE r.session_id IN (${Prisma.join([...idPhien])})
       GROUP BY r.session_id`;
    return new Map(rows.map((r) => [r.session_id, Number(r.n)]));
  }

  private phienToDto(p: PhienRow, giaKhuVuc = 0): PriceSessionResponseDto {
    return {
      id: p.id,
      name: p.name,
      effectiveFrom: p.effectiveFrom.toISOString().slice(0, 10),
      status: p.status,
      note: p.note,
      priceCount: p._count.prices + giaKhuVuc,
      routeCount: p._count.regionRoutes,
      createdByName: p.creator?.fullName ?? null,
      activatedAt: p.activatedAt?.toISOString() ?? null,
    };
  }

  /**
   * @param chiPhienDangApDung Đối tác truyền true — họ không được thấy phiên
   * nháp, đó là giá kỳ sau chưa công bố.
   */
  async listSessions(chiPhienDangApDung = false): Promise<PageResult<PriceSessionResponseDto>> {
    const items = await this.prisma.priceSession.findMany({
      ...(chiPhienDangApDung ? { where: { status: PHIEN_DANG_AP_DUNG } } : {}),
      include: PHIEN_INCLUDE,
      // Phiên đang áp dụng lên đầu: đó là thứ người mở màn này cần trước tiên.
      orderBy: [{ status: 'asc' }, { effectiveFrom: 'desc' }],
      take: 200,
    });
    const gia = await this.demGiaKhuVuc(items.map((p) => p.id));
    return {
      items: items.map((p) => this.phienToDto(p, gia.get(p.id) ?? 0)),
      total: items.length,
      page: 1,
      limit: items.length,
    };
  }

  /**
   * Phiên để ĐỌC bảng giá: phiên được chỉ định, hoặc phiên đang áp dụng, hoặc
   * phiên mới nhất. null = chưa có phiên nào.
   *
   * Mở màn bảng giá mà chưa chọn gì thì thứ người ta cần thấy là giá ĐANG báo
   * cho khách. Chưa công bố phiên nào thì xem phiên mới nhất còn hơn một màn
   * trống không giải thích gì.
   */
  async idPhienDeDoc(sessionId?: number): Promise<number | null> {
    if (sessionId !== undefined) return sessionId;
    const p = await this.prisma.priceSession.findFirst({
      orderBy: [{ status: 'asc' }, { effectiveFrom: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    return p?.id ?? null;
  }

  /**
   * Phiên để GHI vào. Chưa có phiên nào thì TẠO phiên đầu tiên.
   *
   * Phiên đã lưu trữ thì từ chối: nó là bản giá của một thời điểm đã qua, sửa
   * vào đó là sửa lại lịch sử — và người sửa tưởng mình đang đổi giá hiện hành.
   */
  async idPhienDeGhi(
    sessionId: number | undefined, user: AuthenticatedUser,
  ): Promise<{ id: number; vuaTao: string | null }> {
    const id = await this.idPhienDeDoc(sessionId);
    if (id === null) {
      const homNay = new Date();
      const ten = `Bảng giá ${homNay.getDate()}/${homNay.getMonth() + 1}/${homNay.getFullYear()}`;
      const p = await this.createSession(
        { name: ten, effectiveFrom: homNay.toISOString().slice(0, 10) }, user,
      );
      return { id: p.id, vuaTao: ten };
    }
    const p = await this.prisma.priceSession.findUnique({ where: { id }, select: { status: true, name: true } });
    if (!p) throw new NotFoundException('Không tìm thấy phiên giá');
    if (p.status === 'archived')
      throw new BadRequestException(
        `Phiên "${p.name}" đã lưu trữ nên không sửa được. Chọn phiên khác hoặc tạo phiên mới.`,
      );
    return { id, vuaTao: null };
  }

  /** Phiên đang áp dụng, hoặc null khi chưa ai công bố phiên nào. */
  async activeSession(): Promise<PriceSessionResponseDto | null> {
    const p = await this.prisma.priceSession.findFirst({
      where: { status: 'active' },
      include: PHIEN_INCLUDE,
    });
    return p ? this.phienToDto(p) : null;
  }

  async createSession(dto: CreatePriceSessionDto, user: AuthenticatedUser): Promise<PriceSessionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.priceSession.create({
        data: {
          name: dto.name.trim(),
          effectiveFrom: new Date(dto.effectiveFrom),
          note: dto.note?.trim() || null,
          createdBy: user.id,
        },
      });

      /* Chép dòng giá từ phiên cũ — xem giải thích ở CreatePriceSessionDto.
         Chép CẢ HAI bảng: bảng giá cũ (route_prices) và bảng giá khu vực
         (region_routes + giá treo dưới nó). Chỉ chép bảng cũ thì phiên mới ra
         đời trống trơn — đúng thứ vừa xảy ra: "chép từ phiên 355 dòng" mà
         được một phiên 0 tuyến, và không câu lỗi nào nói vì sao. */
      if (dto.copyFromSessionId !== undefined) {
        const nguon = await tx.routePrice.findMany({
          where: { sessionId: dto.copyFromSessionId },
          select: {
            originId: true, destinationId: true, unitCode: true, price: true, note: true,
          },
        });
        if (nguon.length)
          await tx.routePrice.createMany({
            data: nguon.map((r) => ({ ...r, sessionId: p.id })),
          });

        const tuyen = await tx.regionRoute.findMany({
          where: { sessionId: dto.copyFromSessionId },
          select: {
            originId: true,
            destinationId: true,
            roundTripKm: true,
            prices: {
              select: {
                kind: true, unitCode: true, oneWayPrice: true, roundTripPrice: true,
              },
            },
          },
        });
        if (tuyen.length) {
          /* Ba câu cho cả bảng giá, không phải một câu cho mỗi tuyến: một
             phiên thật là vài trăm tuyến, và vài trăm lượt `create` nối tiếp
             trong một giao dịch sẽ chạm trần thời gian rồi cuộn ngược sạch —
             người dùng thấy "lỗi hệ thống" sau mười giây chờ.

             `createMany` không trả id nên phải đọc lại; khoá ghép là chính
             ràng buộc duy nhất của bảng (phiên + điểm đi + điểm đến), nên
             không có chuyện ghép nhầm. */
          await tx.regionRoute.createMany({
            data: tuyen.map((t) => ({
              sessionId: p.id,
              originId: t.originId,
              destinationId: t.destinationId,
              roundTripKm: t.roundTripKm,
              createdBy: user.id,
            })),
          });
          const moi = await tx.regionRoute.findMany({
            where: { sessionId: p.id },
            select: { id: true, originId: true, destinationId: true },
          });
          const theoCap = new Map(moi.map((r) => [`${r.originId}:${r.destinationId}`, r.id]));
          const gia = tuyen.flatMap((t) => {
            const routeId = theoCap.get(`${t.originId}:${t.destinationId}`);
            return routeId === undefined ? [] : t.prices.map((g) => ({ ...g, routeId }));
          });
          if (gia.length) await tx.regionRoutePrice.createMany({ data: gia });
        }
      }

      const day = await tx.priceSession.findUniqueOrThrow({
        where: { id: p.id },
        include: PHIEN_INCLUDE,
      });
      return this.phienToDto(day);
    });
  }

  async updateSession(id: number, dto: UpdatePriceSessionDto): Promise<PriceSessionResponseDto> {
    const p = await this.prisma.priceSession.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.effectiveFrom !== undefined ? { effectiveFrom: new Date(dto.effectiveFrom) } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
      },
      include: PHIEN_INCLUDE,
    });
    return this.phienToDto(p);
  }

  /**
   * Công bố một phiên.
   *
   * Phiên đang áp dụng bị đẩy sang 'archived' TRONG CÙNG một giao dịch: chỉ
   * số một-phiên-active của DB sẽ từ chối bước thứ hai nếu bước một chưa
   * xong, nên hai lệnh phải đi liền nhau hoặc không lệnh nào chạy.
   */
  async activateSession(id: number, user: AuthenticatedUser): Promise<PriceSessionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.priceSession.findUnique({ where: { id } });
      if (!p) throw new NotFoundException('Không tìm thấy phiên giá');
      assertChuyenPhien(p.status as PriceSessionStatus, 'active');

      /* Đếm CẢ HAI bảng giá: bảng cũ theo đơn vị tính (route_prices) và bảng
         khu vực (region_routes, 063). Chỉ đếm bảng cũ thì mọi phiên của bảng
         giá mới đều bị coi là rỗng và không công bố được. */
      const [soDongCu, soTuyen] = await Promise.all([
        tx.routePrice.count({ where: { sessionId: id } }),
        tx.regionRoute.count({ where: { sessionId: id } }),
      ]);
      // Công bố một bảng giá rỗng là tắt bảng giá mà không ai biết: màn giá
      // niêm yết trống trơn, và người tra tưởng hệ thống hỏng.
      if (soDongCu === 0 && soTuyen === 0)
        throw new BadRequestException('Phiên này chưa có dòng giá nào — thêm giá trước khi áp dụng');

      await tx.priceSession.updateMany({
        where: { status: 'active' },
        data: { status: 'archived' },
      });
      await tx.priceSession.update({
        where: { id },
        data: { status: 'active', activatedBy: user.id, activatedAt: new Date() },
      });

      const day = await tx.priceSession.findUniqueOrThrow({ where: { id }, include: PHIEN_INCLUDE });
      return this.phienToDto(day);
    });
  }

  async deleteSession(id: number): Promise<void> {
    const p = await this.prisma.priceSession.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Không tìm thấy phiên giá');
    // Xoá phiên đã từng áp dụng là xoá mất câu trả lời cho "hồi đó báo khách
    // bao nhiêu". Chỉ bản nháp mới xoá được.
    if (p.status !== 'draft')
      throw new BadRequestException('Chỉ xoá được phiên đang soạn — phiên đã công bố thì lưu trữ');
    /* Không xoá phiên CUỐI CÙNG. Hết phiên là hết bảng giá: màn giá trống
       trơn, tra giá không ra gì, và lần ghi tiếp theo lặng lẽ dựng một phiên
       mới rỗng — người xoá không hề biết mình vừa làm điều đó. */
    if (await this.prisma.priceSession.count() <= 1)
      throw new BadRequestException(
        'Đây là phiên giá duy nhất nên không xoá được. Tạo phiên khác trước rồi hãy xoá phiên này.',
      );
    await this.prisma.priceSession.delete({ where: { id } });
  }

}
