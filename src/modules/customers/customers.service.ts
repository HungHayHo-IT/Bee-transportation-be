import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { PageResult } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { laKhachBeeLogs } from './khach-bee-logs.helper';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { REVENUE_STATUSES } from '@/common/enums';
import {
  CreateCustomerDto, CustomerDetailResponseDto, CustomerResponseDto, UpdateCustomerDto,
} from './dto/customer.dto';
import { assertTaoDuoc } from './approval.helper';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  private toDto(
    c: Customer & { reviewedBy?: { fullName: string } | null },
  ): CustomerResponseDto {
    return {
      id: c.id,
      code: c.code,
      companyName: c.companyName,
      contactName: c.contactName,
      phone: c.phone,
      email: c.email,
      note: c.note,
      status: c.status,
      taxCode: c.taxCode,
      businessLicence: c.businessLicence,
      rejectReason: c.rejectReason,
      reviewedByName: c.reviewedBy?.fullName ?? null,
      laBeeLogs: laKhachBeeLogs(c.email),
    };
  }

  /**
   * @param status Bỏ trống = CHỈ hồ sơ đã duyệt.
   *
   * Mặc định này là chỗ bước duyệt thật sự có hiệu lực. Ô chọn khách lúc tạo
   * đơn gọi đúng hàm này và không truyền `status`; nếu mặc định trả về cả hồ
   * sơ đang chờ thì người ta chọn được ngay hồ sơ vừa gõ xong, và nút duyệt
   * chỉ còn là trang trí. Màn duyệt muốn thấy hàng chờ thì phải hỏi rõ.
   */
  async search(
    q?: string,
    page = 1,
    limit = 20,
    status?: string,
  ): Promise<PageResult<CustomerResponseDto>> {
    // Khop ca hai cot ten: khach den tu form website KHONG co ten cong ty, chi
    // tim theo companyName thi go dung ten ho van ra danh sach rong.
    //
    /* Khop ca `code` va `taxCode`: nhan vien quen khach theo ma CL ben he thong
       cu, con ke toan tim theo ma so thue. Go mot trong hai ma khong ra gi thi
       ho ket luan khach chua co trong he thong roi tao them mot ho so trung. */
    const loc: Prisma.CustomerWhereInput =
      status === 'all' ? {} : { status: status ?? 'approved' };
    const where: Prisma.CustomerWhereInput = q
      ? {
          ...loc,
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { companyName: { contains: q, mode: 'insensitive' } },
            { contactName: { contains: q, mode: 'insensitive' } },
            { taxCode: { contains: q, mode: 'insensitive' } },
          ],
        }
      : loc;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        include: { reviewedBy: { select: { fullName: true } } },
        // Hàng chờ xếp theo hồ sơ mới trước; danh sách đã duyệt xếp theo tên.
        orderBy: status === 'pending' ? { createdAt: 'desc' } : { companyName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map((r) => this.toDto(r)), total, page, limit };
  }

  /**
   * Số đơn đếm trong phạm vi quyền. Tổng doanh thu CHỈ trả cho tầng công ty / phòng —
   * tầng cá nhân nhận null, nếu không đây là đường vòng để lộ doanh thu tổng hợp.
   */
  async detail(id: number, user: AuthenticatedUser): Promise<CustomerDetailResponseDto> {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Không tìm thấy khách hàng');

    const scoped: Prisma.OrderWhereInput = {
      AND: [{ customerId: id }, this.scope.orderReadWhere(user)],
    };
    const orderCount = await this.prisma.order.count({ where: scoped });

    let totalRevenue: number | null = null;
    if (this.scope.reportScope(user).level !== 'personal') {
      const agg = await this.prisma.order.aggregate({
        where: { AND: [scoped, { status: { in: REVENUE_STATUSES } }] },
        _sum: { finalAmount: true },
      });
      totalRevenue = Number(agg._sum.finalAmount ?? 0);
    }

    return { ...this.toDto(c), orderCount, totalRevenue };
  }

  /**
   * QA-25: hai hồ sơ cùng tên làm lịch sử đơn của một khách bị tách đôi. Không đặt
   * UNIQUE ở DB vì tên công ty trùng nhau là chuyện có thật; chặn ở đây và trả kèm
   * id hồ sơ đang có để front-end mời người dùng dùng lại thay vì tạo mới.
   */
  /**
   * Gần như ai cũng tạo được hồ sơ khách hàng — TRỪ Giám đốc, vai chỉ xem.
   *
   * Khác nhau ở chỗ hồ sơ do NHÂN VIÊN tạo vào hàng chờ, phải Giám sát hoặc
   * Trưởng phòng duyệt; Admin, Trưởng phòng và Giám sát tạo xong dùng được
   * ngay — xem trangThaiKhiTao.
   */
  async create(
    dto: CreateCustomerDto,
    user: AuthenticatedUser,
  ): Promise<CustomerResponseDto> {
    assertTaoDuoc(user);
    const existing = await this.findByName(this.prisma, dto.companyName);
    if (existing)
      throw new ConflictException({
        message: `Đã có khách hàng tên "${existing.companyName}" (mã ${existing.id})`,
        existingCustomerId: existing.id,
      });
    return this.toDto(
      await this.prisma.customer.create({
        // Tạo xong dùng được ngay — từ 052 không còn bước duyệt. Cột `status`
        // ở lại vì nhiều truy vấn lọc 'approved', nay nó chỉ còn một giá trị.
        data: { ...dto, status: 'approved', createdById: user.id },
      }),
    );
  }

  /** So khớp bỏ khoảng trắng thừa và không phân biệt hoa thường — khớp customers_name_norm_idx. */
  async findByName(
    db: Pick<PrismaService, 'customer'>,
    name: string,
  ): Promise<Customer | null> {
    return db.customer.findFirst({
      where: { companyName: { equals: name.trim(), mode: 'insensitive' } },
    });
  }

  async update(id: number, dto: UpdateCustomerDto): Promise<CustomerResponseDto> {
    if (!(await this.prisma.customer.count({ where: { id } })))
      throw new NotFoundException('Không tìm thấy khách hàng');
    return this.toDto(await this.prisma.customer.update({ where: { id }, data: dto }));
  }

  /**
   * Xoá hồ sơ khách hàng.
   *
   * Đếm đơn TRƯỚC khi xoá thay vì để khoá ngoại ném lỗi: lỗi khoá ngoại của
   * Postgres mang tên ràng buộc, người dùng đọc không ra. Đếm trước thì câu
   * trả lời nói đúng việc — khách này có bao nhiêu đơn.
   */
  async xoa(id: number): Promise<void> {
    if (!(await this.prisma.customer.count({ where: { id } })))
      throw new NotFoundException('Không tìm thấy khách hàng');
    const soDon = await this.prisma.order.count({ where: { customerId: id } });
    if (soDon > 0)
      throw new ConflictException(
        `Khách hàng này đang có ${soDon} đơn nên không xoá được. Sửa lại hồ sơ thay vì xoá.`,
      );
    await this.prisma.customer.delete({ where: { id } });
  }
}
