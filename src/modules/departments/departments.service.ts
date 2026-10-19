import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { backfillOpenOrders, RoutingTx } from './department-routing.helper';
import { buildTree, DeptTreeNode, detectCycle } from './department-tree.helper';
import {
  CreateDepartmentDto,
  DepartmentResponseDto,
  SetServicesDto,
  UpdateDepartmentDto,
} from './dto/department.dto';

const DEPT_INCLUDE = {
  manager: { select: { fullName: true } },
  _count: { select: { members: true } },
};

type DeptRow = {
  id: number;
  name: string;
  managerId: number | null;
  parentId: number | null;
  serviceIds: number[];
  isActive: boolean;
  isSales: boolean;
  isQuoting: boolean;
  manager: { fullName: string } | null;
  _count: { members: number };
};

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private toDto(d: DeptRow): DepartmentResponseDto {
    return {
      id: d.id,
      name: d.name,
      managerId: d.managerId,
      managerName: d.manager?.fullName ?? null,
      parentId: d.parentId,
      serviceIds: d.serviceIds,
      isActive: d.isActive,
      isSales: d.isSales,
      isQuoting: d.isQuoting,
      memberCount: d._count.members,
    };
  }

  async list(isActive?: boolean): Promise<DepartmentResponseDto[]> {
    const rows = await this.prisma.department.findMany({
      where: isActive === undefined ? {} : { isActive },
      include: DEPT_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async detail(id: number): Promise<DepartmentResponseDto> {
    const d = await this.prisma.department.findUnique({ where: { id }, include: DEPT_INCLUDE });
    if (!d) throw new NotFoundException('Không tìm thấy phòng ban');
    return this.toDto(d);
  }

  private async assertServicesExist(ids: number[]): Promise<void> {
    if (!ids.length) return;
    const n = await this.prisma.service.count({ where: { id: { in: ids } } });
    if (n !== ids.length) throw new BadRequestException('Có dịch vụ không tồn tại trong danh mục');
  }

  /**
   * Cha mới có hợp lệ không. Postgres không kiểm được chu trình mà không cần
   * trigger đệ quy, nên luật nằm ở đây — chỗ DUY NHẤT, dùng chung cho tạo và sửa.
   */
  private async assertValidParent(id: number | null, parentId: number | null): Promise<void> {
    if (parentId === null || parentId === undefined) return;
    if (id !== null && parentId === id)
      throw new BadRequestException('Phòng ban không thể là cha của chính nó');

    const rows = await this.prisma.department.findMany({ select: { id: true, parentId: true } });
    const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
    if (!parentOf.has(parentId)) throw new BadRequestException('Phòng cha không tồn tại');

    if (id !== null && detectCycle(id, parentId, parentOf))
      throw new BadRequestException('Không đặt được: sẽ tạo vòng lặp trong sơ đồ tổ chức');
  }

  /**
   * Vô hiệu hoá phòng còn con đang hoạt động thì cả nhánh mất chỗ đứng. Không tự
   * động kéo con lên cha: im lặng sắp xếp lại sơ đồ tổ chức của người khác là
   * hành vi tệ hơn một thông báo lỗi.
   */
  private async assertNoActiveChildren(id: number): Promise<void> {
    const kids = await this.prisma.department.findMany({
      where: { parentId: id, isActive: true },
      select: { name: true },
    });
    if (kids.length)
      throw new BadRequestException(
        `Còn phòng ban trực thuộc đang hoạt động: ${kids.map((k) => k.name).join(', ')}`,
      );
  }

  async create(dto: CreateDepartmentDto, actor: AuthenticatedUser): Promise<DepartmentResponseDto> {
    await this.assertServicesExist(dto.serviceIds ?? []);
    await this.assertValidParent(null, dto.parentId ?? null);
    const { created, backfilled } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.department.create({
        data: {
          name: dto.name,
          managerId: dto.managerId,
          parentId: dto.parentId ?? null,
          serviceIds: dto.serviceIds ?? [],
        },
        include: DEPT_INCLUDE,
      });
      // Phòng lập ra đã kèm dịch vụ thì nó nhận đơn đang mở ngay, không phải
      // chờ ai vào sửa ma trận thêm một lần nữa.
      const ids = await backfillOpenOrders(tx as unknown as RoutingTx, row);
      return { created: row, backfilled: ids };
    });
    await this.activity.log(null, {
      entity: 'departments', entityId: created.id, action: 'create', actorId: actor.id,
      detail: { backfilledOrderIds: backfilled },
    });
    return this.toDto(created);
  }

  async update(
    id: number,
    dto: UpdateDepartmentDto,
    actor: AuthenticatedUser,
  ): Promise<DepartmentResponseDto> {
    await this.detail(id);
    if (dto.parentId !== undefined) await this.assertValidParent(id, dto.parentId);
    if (dto.isActive === false) await this.assertNoActiveChildren(id);
    // Cùng một transaction: sửa phòng rồi kéo đơn cũ về. `dto` có thể mang
    // serviceIds, hoặc bật lại một phòng đang ngừng — cả hai đều là "phòng này
    // vừa được trao quyền trên mấy dịch vụ đó".
    const { updated, backfilled } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.department.update({
        where: { id },
        data: dto,
        include: DEPT_INCLUDE,
      });
      const ids = await backfillOpenOrders(tx as unknown as RoutingTx, row);
      return { updated: row, backfilled: ids };
    });
    await this.activity.log(null, {
      entity: 'departments', entityId: id, action: 'update', actorId: actor.id,
      detail: { ...dto, backfilledOrderIds: backfilled },
    });
    return this.toDto(updated);
  }

  /**
   * Ghi đè ma trận định tuyến, rồi kéo nốt đơn cũ CHƯA CHỐT GIÁ của những dịch
   * vụ đó về phòng này — xem backfillOpenOrders.
   *
   * Trước đây chỗ này chỉ áp cho đơn tạo sau đó, và đó là một cái bẫy: người
   * vừa trao quyền cho một phòng tin rằng phòng đó đã thấy việc, trong khi cả
   * loạt đơn đang chờ báo giá vẫn vô hình với họ. Đơn đã chốt hoặc đã chọn được
   * phòng thắng thì vẫn giữ nguyên, vòng giá của chúng đóng rồi.
   */
  async setServices(
    id: number,
    dto: SetServicesDto,
    actor: AuthenticatedUser,
  ): Promise<DepartmentResponseDto> {
    const before = await this.detail(id);
    /* Phòng Sale không tham gia báo giá nên không giữ dịch vụ nào — CHECK ở
       DB (076) chặn lần nữa. Nhờ vậy mọi chỗ phân đơn ("phòng nào có dịch
       vụ X") tự bỏ qua nó, không nơi nào phải nhớ thêm điều kiện. */
    const isSales = dto.isSales ?? before.isSales;
    const isQuoting = dto.isQuoting ?? before.isQuoting;
    // CHECK ở DB chặn lần nữa (080), đây để báo lỗi dễ hiểu.
    if (isSales && isQuoting)
      throw new BadRequestException('Một phòng không thể vừa là Phòng Sale vừa là Phòng báo giá');
    /* Dịch vụ tích ở phòng KHÁC Phòng báo giá không chia đơn: Điều vận và
       Trưởng phòng của phòng đó XEM được đơn đã chốt của các dịch vụ ấy (080). */
    const serviceIds = isSales ? [] : dto.serviceIds;
    await this.assertServicesExist(serviceIds);
    const { updated, backfilled } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.department.update({
        where: { id },
        data: { serviceIds, isSales, isQuoting },
        include: DEPT_INCLUDE,
      });
      const ids = await backfillOpenOrders(tx as unknown as RoutingTx, row);
      return { updated: row, backfilled: ids };
    });
    await this.activity.log(null, {
      entity: 'departments', entityId: id, action: 'set_services', actorId: actor.id,
      detail: {
        serviceIds: [before.serviceIds, serviceIds], isSales: [before.isSales, isSales],
        isQuoting: [before.isQuoting, isQuoting],
        backfilledOrderIds: backfilled,
      },
    });
    return this.toDto(updated);
  }

  /**
   * Sơ đồ tổ chức. Một truy vấn lấy hết rồi dựng cây trong bộ nhớ — số phòng đếm
   * bằng chục. Chỉ trả tên và vai trò: đây là màn hình mọi vai trò đọc được, nên
   * email và điện thoại tuyệt đối không đi kèm.
   */
  async tree(): Promise<DeptTreeNode[]> {
    const rows = await this.prisma.department.findMany({
      select: {
        id: true, name: true, parentId: true, managerId: true, isActive: true, isSales: true,
        manager: { select: { fullName: true } },
        members: {
          where: { isActive: true },
          select: { id: true, fullName: true, roles: true },
          orderBy: { fullName: 'asc' },
        },
      },
    });
    return buildTree(
      rows.map((r) => ({
        id: r.id, name: r.name, parentId: r.parentId, managerId: r.managerId,
        managerName: r.manager?.fullName ?? null, isActive: r.isActive, isSales: r.isSales,
        members: r.members,
      })),
    );
  }
}
