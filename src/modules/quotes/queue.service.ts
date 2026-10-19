import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DeptState, OrderStatus } from '@/common/enums';
import { DEPT_WORKABLE } from '@/modules/orders/order-state.helper';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PageResult } from '@/common/dto/pagination.dto';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { QueueItemDto } from './dto/quote.dto';
import { QUEUE_STATES, QueueQueryDto } from './dto/queue-query.dto';
import { customerDisplayName } from '@/common/customer-display-name';

@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService) {}

  async myQueue(user: AuthenticatedUser, query: QueueQueryDto): Promise<PageResult<QueueItemDto>> {
    if (user.departmentId === null)
      throw new BadRequestException('Tài khoản của bạn chưa thuộc phòng ban nào');

    const where: Prisma.OrderDepartmentWhereInput = {
      departmentId: user.departmentId,
      state: query.status ?? { in: QUEUE_STATES },
    };

    // Đếm và lấy dòng trong CÙNG một transaction: hai truy vấn rời nhau có thể
    // rơi vào hai ảnh chụp khác nhau của dữ liệu, cho ra total không khớp items.
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.orderDepartment.count({ where }),
      this.prisma.orderDepartment.findMany({
        where,
        include: {
          assignee: { select: { fullName: true } },
          order: {
            select: {
              code: true,
              status: true,
              originProvince: true,
              destinationProvince: true,
              customer: { select: { companyName: true, contactName: true } },
              service: { select: { name: true, slaHours: true } },
              departments: { select: { departmentId: true } },
            },
          },
        },
        // Khoá phụ để thứ tự ỔN ĐỊNH. Nhiều đơn được phân phối trong cùng một
        // giây là chuyện thường, và khi distributedAt bằng nhau thì thứ tự giữa
        // chúng không xác định — trang 1 và trang 2 có thể cùng trả một đơn rồi
        // cùng bỏ sót một đơn khác. Không phân trang thì lỗi này vô hình.
        // MOI NHAT LEN DAU (12/10/2026). Truoc day cu nhat len dau, nen don vua
        // phan ve nam duoi cung — sau 11-16 don cho cu cua phong — va nhan vien
        // mo man hinh ra "khong thay don moi". Don tre SLA van co co do rieng,
        // khong can dung thu tu de noi.
        orderBy: [{ distributedAt: 'desc' }, { orderId: 'desc' }],
        skip: query.skip,
        take: query.limit,
      }),
    ]);

    const now = Date.now();
    const items = rows.map((r) => ({
      orderId: r.orderId,
      code: r.order.code,
      serviceName: r.order.service.name,
      customerName: customerDisplayName(r.order.customer),
      originProvince: r.order.originProvince,
      destinationProvince: r.order.destinationProvince,
      state: r.state,
      // Hủy đơn KHÔNG đụng tới order_departments.state, nên trạng thái phòng một mình
      // không đủ: thiếu vế này thì đơn đã hủy vẫn hiện "Chờ tiếp nhận" kèm nút Nhận đơn
      // mà backend chắc chắn từ chối (assertDeptWorkable).
      orderStatus: r.order.status,
      assigneeName: r.assignee?.fullName ?? null,
      assigneeId: r.assigneeId,
      distributedAt: r.distributedAt,
      participatingDeptIds: r.order.departments.map((d) => d.departmentId),
      slaLate:
        r.state === DeptState.PENDING &&
        DEPT_WORKABLE.includes(r.order.status as OrderStatus) &&
        now - r.distributedAt.getTime() > r.order.service.slaHours * 3600_000,
    }));

    return { items, total, page: query.page, limit: query.limit };
  }
}
