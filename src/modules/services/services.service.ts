import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Service } from '@prisma/client';
import { laDoiTac } from '@/common/scope/la-doi-tac';
import { dungFormCongKhai } from './public-form.helper';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import {
  CreateLandingServiceDto, CreateServiceDto, LandingServiceDto, PublicServiceResponseDto,
  ServiceResponseDto, SetMilestonesDto, UpdateServiceDto,
} from './dto/service.dto';
import {
  LandingRefreshService, THE_DICH_VU_THEM,
} from '@/common/landing/landing-refresh.service';
import { CmsService } from '../cms/cms.service';
import { khoaTuTen, maTuTen } from './landing-service.helper';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly landing: LandingRefreshService,
    private readonly cms: CmsService,
  ) {}

  /** Phòng nào phụ trách dịch vụ nào — đọc ngược từ departments.serviceIds. */
  private async routingMap(): Promise<Map<number, number[]>> {
    const depts = await this.prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, serviceIds: true },
    });
    const map = new Map<number, number[]>();
    for (const d of depts)
      for (const sid of d.serviceIds) map.set(sid, [...(map.get(sid) ?? []), d.id]);
    return map;
  }

  private toDto(s: Service, routing: Map<number, number[]>): ServiceResponseDto {
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      slaHours: s.slaHours,
      milestones: s.milestones,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
      departmentIds: routing.get(s.id) ?? [],
      cargoFields: s.cargoFields,
      landingKey: s.showOnLanding ? s.landingKey : null,
    };
  }

  /**
   * Người này có phải NHÂN VIÊN Bee không? Vai trò `partner` là người của công
   * ty đối tác — họ có token hợp lệ của hệ nhân viên, nhưng không phải nhân
   * viên, và bản đầy đủ của danh mục dịch vụ có SLA, bộ mốc và sơ đồ phòng ban
   * phụ trách: dữ liệu vận hành nội bộ.
   *
   * Phải đọc cơ sở dữ liệu vì token chỉ mang `sub`, không mang vai trò. Một
   * lượt đọc theo khoá chính, và chỉ chạy ở nhánh đã có token hợp lệ.
   */
  async laNhanVien(userId: number): Promise<boolean> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId }, select: { roles: true },
    });
    return u !== null && !laDoiTac(u);
  }

  async list(): Promise<ServiceResponseDto[]> {
    const [rows, routing] = await Promise.all([
      this.prisma.service.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.routingMap(),
    ]);
    return rows.map((r) => this.toDto(r, routing));
  }

  /**
   * Danh mục cho khách vãng lai. Không dùng lại list() rồi lọc trường: đi thẳng
   * từ bảng service ra DTO rút gọn thì không có đường nào để trường nội bộ lọt
   * ra, kể cả khi ai đó thêm trường mới vào ServiceResponseDto sau này. Cũng vì
   * thế mà bỏ luôn routingMap() — khách không cần biết phòng nào phụ trách.
   * Lọc isActive ngay dưới DB: dịch vụ đã tắt là thứ công ty không nhận nữa,
   * để khách chọn rồi mới báo không nhận là mất công cả hai bên.
   */
  async listPublic(): Promise<PublicServiceResponseDto[]> {
    const rows = await this.prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true, tmsMode: true },
        },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      sortOrder: s.sortOrder,
      cargoFields: s.cargoFields,
      children: s.children,
      formFields: dungFormCongKhai(s, s.children),
    }));
  }

  /* ------------------------------------------------- Dịch vụ hiện trên landing */

  /**
   * Bộ mốc tiến độ mặc định cho dịch vụ tự thêm.
   *
   * Người viết nội dung không biết mốc tiến độ là gì, mà cột `milestones`
   * không được rỗng — đơn chốt xong copy bộ mốc này sang, rỗng là đơn không có
   * việc nào để làm. Ba mốc chung nhất, phòng vận hành sửa sau ở màn Dịch vụ.
   */
  private static readonly MOC_MAC_DINH = ['Tiếp nhận', 'Thực hiện', 'Nghiệm thu'];

  /** Danh sách cho landing dựng trang. Chỉ dịch vụ đang bật VÀ đang cho hiện. */
  async landingList(): Promise<LandingServiceDto[]> {
    const rows = await this.prisma.service.findMany({
      where: { isActive: true, showOnLanding: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows
      // Ràng buộc dưới DB đã chặn thiếu khoá/đường dẫn, lọc lần nữa ở đây chỉ
      // để TypeScript thu hẹp kiểu — không phải vì nghi ngờ dữ liệu.
      .filter((s) => s.landingKey && s.landingSlugVi && s.landingSlugEn)
      .map((s) => ({
        id: s.id,
        key: s.landingKey as string,
        code: s.code,
        name: s.name,
        slugVi: s.landingSlugVi as string,
        slugEn: s.landingSlugEn as string,
        sortOrder: s.sortOrder,
        summary: null,
      }));
  }

  /**
   * Thêm một dịch vụ vừa có trong danh mục BeeOps vừa hiện trên landing.
   *
   * Một dòng DUY NHẤT cho cả hai việc: hai bảng là hai đường ghi cho cùng một
   * dịch vụ, và một ngày nào đó hai đường đó nói hai thứ khác nhau — khách
   * chọn "Dịch vụ X" ở form báo giá trong khi trang giới thiệu đã đổi tên.
   *
   * Mã và khoá tự đoán từ tên nếu không truyền: người viết nội dung không có
   * lý do gì phải nghĩ ra một mã ba chữ.
   */
  async createForLanding(
    dto: CreateLandingServiceDto,
    actor: AuthenticatedUser,
  ): Promise<ServiceResponseDto> {
    const khoa = khoaTuTen(dto.name);
    if (!khoa) throw new ConflictException('Tên dịch vụ phải có ít nhất một chữ cái');

    const daCo = new Set(
      (await this.prisma.service.findMany({ select: { code: true } })).map((s) => s.code),
    );
    const ma = dto.code ?? maTuTen(dto.name, daCo);
    if (!ma) throw new ConflictException('Không đoán được mã dịch vụ, hãy tự nhập mã 3 chữ');
    if (daCo.has(ma)) throw new ConflictException(`Mã dịch vụ ${ma} đã tồn tại`);

    // Kiểm trước để báo lỗi ĐỌC ĐƯỢC. Chỉ mục duy nhất dưới DB vẫn là chốt
    // chặn thật khi hai người bấm Lưu cùng lúc.
    const dung = await this.prisma.service.findFirst({
      where: {
        OR: [
          { landingKey: khoa },
          { landingSlugVi: dto.slugVi },
          { landingSlugEn: dto.slugEn },
        ],
      },
    });
    if (dung) throw new ConflictException('Tên hoặc đường dẫn này đã có một dịch vụ dùng rồi');

    const cuoi = await this.prisma.service.findFirst({ orderBy: { sortOrder: 'desc' } });
    const created = await this.prisma.service.create({
      data: {
        code: ma,
        name: dto.name.trim(),
        milestones: ServicesService.MOC_MAC_DINH,
        sortOrder: (cuoi?.sortOrder ?? 0) + 1,
        landingKey: khoa,
        landingSlugVi: dto.slugVi,
        landingSlugEn: dto.slugEn,
        showOnLanding: true,
      },
    });
    await this.activity.log(null, {
      entity: 'services',
      entityId: created.id,
      action: 'create',
      actorId: actor.id,
      detail: { landingKey: khoa, slugVi: dto.slugVi, slugEn: dto.slugEn },
    });
    // Bảo landing dựng lại ngay: không có dòng này thì dịch vụ vừa thêm chưa
    // có trang, chưa có trong menu, và người thêm tưởng mình làm hụt.
    await this.landing.lamMoi(THE_DICH_VU_THEM);
    // Và quên bản danh mục ô đang nhớ tạm: trang mới vừa mọc ra ba mươi ô,
    // người vừa thêm không nên phải đợi hết 60 giây mới thấy chúng.
    this.cms.quenDanhMuc();
    return this.toDto(created, await this.routingMap());
  }

  /** Dịch vụ chưa phòng nào phụ trách — cảnh báo cấu hình (F2). */
  async unrouted(): Promise<ServiceResponseDto[]> {
    return (await this.list()).filter((s) => s.isActive && s.departmentIds.length === 0);
  }

  private async findOrThrow(id: number): Promise<Service> {
    const s = await this.prisma.service.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Không tìm thấy dịch vụ');
    return s;
  }

  async create(dto: CreateServiceDto, actor: AuthenticatedUser): Promise<ServiceResponseDto> {
    if (await this.prisma.service.findUnique({ where: { code: dto.code } }))
      throw new ConflictException('Mã dịch vụ này đã tồn tại');
    const created = await this.prisma.service.create({
      data: {
        code: dto.code,
        name: dto.name,
        slaHours: dto.slaHours ?? 24,
        milestones: dto.milestones,
      },
    });
    await this.activity.log(null, {
      entity: 'services', entityId: created.id, action: 'create', actorId: actor.id,
    });
    return this.toDto(created, await this.routingMap());
  }

  /** Không cho đổi `code`: mã đơn cũ đã mang tiền tố đó, đổi là mất nhất quán. */
  async update(
    id: number,
    dto: UpdateServiceDto,
    actor: AuthenticatedUser,
  ): Promise<ServiceResponseDto> {
    const before = await this.findOrThrow(id);
    const updated = await this.prisma.service.update({ where: { id }, data: dto });
    await this.activity.log(null, {
      entity: 'services', entityId: id, action: 'update', actorId: actor.id, detail: { ...dto },
    });
    // Dịch vụ có trang trên landing: tắt, đổi tên hay đổi thứ tự đều đổi danh
    // sách landing đang giữ trong cache. Không báo thì tới 60 giây sau trang
    // của dịch vụ đã tắt vẫn còn, và trả 200 kèm nội dung "không tìm thấy".
    if (before.landingKey) await this.landing.lamMoi(THE_DICH_VU_THEM);
    return this.toDto(updated, await this.routingMap());
  }

  /**
   * Ghi đè bộ mốc. CHỈ ảnh hưởng đơn chốt SAU đó — đơn đã chốt giữ snapshot riêng
   * trong order_milestones.
   */
  async setMilestones(
    id: number,
    dto: SetMilestonesDto,
    actor: AuthenticatedUser,
  ): Promise<ServiceResponseDto & { notice: string }> {
    const before = await this.findOrThrow(id);
    const updated = await this.prisma.service.update({
      where: { id },
      data: { milestones: dto.milestones },
    });
    await this.activity.log(null, {
      entity: 'services', entityId: id, action: 'set_milestones', actorId: actor.id,
      detail: { milestones: [before.milestones, dto.milestones] },
    });
    return {
      ...this.toDto(updated, await this.routingMap()),
      notice: 'Bộ mốc mới chỉ áp dụng cho đơn chốt sau thời điểm này. Đơn đã chốt giữ nguyên.',
    };
  }
}
