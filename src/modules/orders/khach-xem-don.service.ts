import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageResult } from '@/common/dto/pagination.dto';
import { MilestoneStatus } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedCustomer } from '@/common/types/authenticated-customer.type';
import { DIEU_KIEN_KHACH_BEE_LOGS, laKhachBeeLogs } from '../customers/khach-bee-logs.helper';
import { statusLabel } from './order-state.helper';
import { DonCuaCongTyDto } from './dto/khach-xem-don.dto';

/**
 * Đơn của CÔNG TY người đang đăng nhập, cho khách Bee Logistics.
 *
 * KHÔNG có bảng nối giữa tài khoản đăng nhập và hồ sơ khách: cả hai phía đều
 * đã mang sẵn tên miền email, nên cùng một điều kiện lọc dùng được cho cả hai.
 * Dựng một bảng nối ở đây là dựng một thứ phải tự tay bảo trì cho đúng với một
 * sự thật vốn đã nằm sẵn trong dữ liệu.
 *
 * Phạm vi: người đăng nhập bằng email Bee Logistics thấy mọi đơn mà hồ sơ
 * khách cũng mang email Bee Logistics. Tức là ai nhận được thư ở tên miền đó
 * thì thấy toàn bộ đơn của họ — đây là quyết định phân quyền Bee đã chọn, và
 * nút tắt là `customer_accounts.is_active`.
 */
@Injectable()
export class KhachXemDonService {
  constructor(private readonly prisma: PrismaService) {}

  async danhSach(
    nguoiDung: AuthenticatedCustomer,
    page: number,
    limit: number,
  ): Promise<PageResult<DonCuaCongTyDto>> {
    /* Kiểm NGAY, trước cả truy vấn: tài khoản không thuộc tên miền thì đây
       không phải cửa của họ. Trả 403 chứ không phải danh sách rỗng — rỗng đọc
       lên là "công ty bạn chưa có đơn nào", một câu sai và gây hiểu nhầm. */
    if (!laKhachBeeLogs(nguoiDung.email))
      throw new ForbiddenException('Tài khoản này không thuộc Bee Logistics');

    const where: Prisma.OrderWhereInput = { customer: DIEU_KIEN_KHACH_BEE_LOGS };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          service: { select: { name: true } },
          serviceChild: { select: { name: true } },
          customer: { select: { companyName: true, contactName: true } },
          // Giống danh sách bên nhân viên: lọc mốc ĐÃ XONG rồi mới lấy mốc cuối.
          // Lấy mốc cuối theo seq rồi mới xét xong hay chưa thì đơn mới tick mốc
          // một sẽ hiện trống, vì mốc cuối cùng chưa ai động tới.
          milestones: {
            where: { status: MilestoneStatus.DONE },
            orderBy: { seq: 'desc' },
            take: 1,
            select: { name: true },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: rows.map((o) => ({
        id: o.id,
        code: o.code,
        status: o.status,
        statusLabel: statusLabel(o.status),
        serviceName: o.service.name,
        serviceChildName: o.serviceChild?.name ?? null,
        customerName: o.customer?.companyName ?? o.customer?.contactName ?? null,
        originProvince: o.originProvince,
        destinationProvince: o.destinationProvince,
        desiredDate: o.desiredDate,
        // Giá đã chốt là giá CỦA HỌ, không phải số nội bộ — nhưng chỉ có sau khi
        // chốt, trước đó là null chứ không phải 0.
        finalAmount: o.finalAmount === null ? null : Number(o.finalAmount),
        // Mốc đã xong gần nhất. Chưa tick mốc nào thì null, không bịa "Đang xử lý".
        latestMilestone: o.milestones[0]?.name ?? null,
        createdAt: o.createdAt,
        closedAt: o.closedAt,
        completedAt: o.completedAt,
      })),
      total,
      page,
      limit,
    };
  }
}
