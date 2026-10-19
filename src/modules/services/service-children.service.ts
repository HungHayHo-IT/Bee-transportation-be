import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import {
  CreateServiceChildDto, ServiceChildResponseDto, UpdateServiceChildDto,
} from './dto/service-child.dto';

/** Dòng Prisma + số đơn đang dùng, đúng hình của ServiceChildResponseDto. */
interface DongCon {
  id: number;
  serviceId: number;
  name: string;
  tmsMode: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { orders: number };
}

@Injectable()
export class ServiceChildrenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private toDto(c: DongCon): ServiceChildResponseDto {
    return {
      id: c.id,
      serviceId: c.serviceId,
      name: c.name,
      tmsMode: c.tmsMode,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      orderCount: c._count?.orders ?? 0,
    };
  }

  /** Ném 404 nếu dịch vụ cha không có — gọi trước mọi thao tác ghi. */
  private async coCha(serviceId: number): Promise<void> {
    const cha = await this.prisma.service.findUnique({
      where: { id: serviceId }, select: { id: true },
    });
    if (!cha) throw new NotFoundException('Không tìm thấy dịch vụ');
  }

  /**
   * Đọc dịch vụ con và CHẶN NGAY nếu nó không thuộc dịch vụ cha trên URL.
   *
   * Không kiểm thì `PATCH /services/3/children/99` sửa được dịch vụ con của
   * dịch vụ khác — người bấm tưởng mình đang sửa trong màn dịch vụ 3.
   */
  private async cuaCha(serviceId: number, childId: number) {
    const con = await this.prisma.serviceChild.findUnique({ where: { id: childId } });
    if (!con || con.serviceId !== serviceId)
      throw new NotFoundException('Không tìm thấy dịch vụ con trong dịch vụ này');
    return con;
  }

  /**
   * Mặc định trả CẢ dịch vụ con đã tắt — đây là tuyến quản trị, giấu đi là giấu
   * luôn id, mà không có id thì không bật lại được. Form tạo đơn truyền
   * activeOnly=true.
   */
  async list(serviceId: number, activeOnly = false): Promise<ServiceChildResponseDto[]> {
    await this.coCha(serviceId);
    const rows = await this.prisma.serviceChild.findMany({
      where: { serviceId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { orders: true } } },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(
    serviceId: number,
    dto: CreateServiceChildDto,
    actor: AuthenticatedUser,
  ): Promise<ServiceChildResponseDto> {
    await this.coCha(serviceId);
    await this.chuaAiDungMa(serviceId, dto.tmsMode ?? null, null);

    const created = await this.prisma.serviceChild.create({
      data: {
        serviceId,
        name: dto.name,
        tmsMode: dto.tmsMode ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.activity.log(null, {
      entity: 'service_children', entityId: created.id, action: 'create', actorId: actor.id,
      detail: { serviceId, name: created.name, tmsMode: created.tmsMode },
    });
    return this.toDto({ ...created, _count: { orders: 0 } });
  }

  async update(
    serviceId: number,
    childId: number,
    dto: UpdateServiceChildDto,
    actor: AuthenticatedUser,
  ): Promise<ServiceChildResponseDto> {
    const cu = await this.cuaCha(serviceId, childId);
    if (dto.tmsMode !== undefined)
      await this.chuaAiDungMa(serviceId, dto.tmsMode, childId);

    const moi = await this.prisma.serviceChild.update({
      where: { id: childId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.tmsMode !== undefined ? { tmsMode: dto.tmsMode } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedAt: new Date(),
      },
      include: { _count: { select: { orders: true } } },
    });
    await this.activity.log(null, {
      entity: 'service_children', entityId: childId, action: 'update', actorId: actor.id,
      // Ghi CẢ giá trị cũ: đổi mã TMS là đổi cách đơn đi sang OF1, mà nhìn một
      // mình giá trị mới thì không biết nó vừa thay cho cái gì.
      detail: { tmsMode: [cu.tmsMode, moi.tmsMode], name: [cu.name, moi.name] },
    });
    return this.toDto(moi);
  }

  /**
   * Xoá hẳn, và CHỈ khi chưa đơn nào dùng.
   *
   * Khoá ngoại ON DELETE RESTRICT đã chặn ở tầng CSDL rồi, nhưng lỗi nó ném ra
   * là một chuỗi Postgres mà người bấm không hiểu. Đếm trước để trả lời bằng
   * tiếng người, kèm số đơn, và chỉ đường sang nút Tắt.
   */
  async remove(serviceId: number, childId: number, actor: AuthenticatedUser): Promise<void> {
    const con = await this.cuaCha(serviceId, childId);
    const dangDung = await this.prisma.order.count({ where: { serviceChildId: childId } });
    if (dangDung > 0)
      throw new ConflictException(
        `Đã có ${dangDung} đơn dùng dịch vụ con này nên không xoá được. `
        + 'Hãy tắt nó đi — đơn cũ vẫn đọc được tên.',
      );

    await this.prisma.serviceChild.delete({ where: { id: childId } });
    await this.activity.log(null, {
      entity: 'service_children', entityId: childId, action: 'delete', actorId: actor.id,
      detail: { serviceId, name: con.name, tmsMode: con.tmsMode },
    });
  }

  /**
   * Trong một dịch vụ cha, một mã TMS chỉ gắn được một lần — trùng thì không
   * biết đơn nên đi theo dòng nào. `null` thì bao nhiêu dòng cũng được: "chưa
   * có mã" không phải một mã.
   */
  private async chuaAiDungMa(
    serviceId: number,
    tmsMode: string | null,
    boQuaId: number | null,
  ): Promise<void> {
    if (tmsMode === null) return;
    const trung = await this.prisma.serviceChild.findFirst({
      where: { serviceId, tmsMode, ...(boQuaId === null ? {} : { id: { not: boQuaId } }) },
      select: { name: true },
    });
    if (trung)
      throw new ConflictException(`Mã ${tmsMode} đã gắn cho "${trung.name}" trong dịch vụ này`);
  }
}
