import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { CustomerNotifType, DeptState, NotifType, OrderStatus } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { DiaChiKhachService } from '../customers/dia-chi-khach.service';
import { ServiceDataValidator } from '../services/service-data.validator';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { CustomerNotifyService } from '../notifications/customer-notify.service';
import { NotifyService } from '../notifications/notify.service';
import { OrderDetailDto } from './dto/order-response.dto';
import { CancelOrderDto, CloseOrderDto, CreateOrderDto, RejectOrderDto, UpdateOrderDto } from './dto/order.dto';
import { assertTransition, REJECTABLE_STATUSES, statusLabel } from './order-state.helper';
import { chotDon as chotDonChung } from './chot-don';
import { nhanDon as nhanDonChung } from './nhan-don';
import { missingInfoForPublicOrder } from './order-completeness.helper';
import { khachCuaDoiTac, resolveCustomerId } from './order-customer.helper';
import { laDoiTac } from '@/common/scope/la-doi-tac';
import { OrdersQueryService } from './orders-query.service';
import { kiemDichVuCon } from './dich-vu-con.helper';
import { conDangBatCua } from './con-dang-bat.helper';
import { tienToCuaDon } from './ma-don.helper';
import { tuyenCuaDon } from '@/modules/services/hinh-dang-tuyen.helper';
import { mapWritableOrder } from './orders.write-mapper';
import { ghiNhoDiaChiCuaDon } from './ghi-nho-dia-chi.helper';
import { notifyDeptRows } from './order-dept-notify.helper';
import { sendNewOrderNotification } from './order-notify.helper';
import { promoteIfComplete } from './order-promote.helper';
import { huyChoKy } from '@/modules/signatures/huy-cho-ky';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notify: NotifyService,
    private readonly query: OrdersQueryService,
    private readonly customers: CustomersService,
    private readonly diaChiKhach: DiaChiKhachService,
    private readonly serviceData: ServiceDataValidator,
    private readonly customerNotify: CustomerNotifyService,
  ) {}

  /** F1 + F2 trong MỘT transaction: sinh mã, ghi đơn, phân phối. */
  /**
   * `user` null CHỈ với đơn khách tự gửi từ landing (fromPublicForm): đơn chưa
   * đứng tên Sale nào, và trả về `{ id }` thay cho chi tiết — không có ai để
   * soi phạm vi đọc.
   */
  async create(
    dto: CreateOrderDto, user: AuthenticatedUser, opts?: { fromPublicForm?: boolean },
  ): Promise<OrderDetailDto>;
  async create(
    dto: CreateOrderDto, user: AuthenticatedUser | null, opts: { fromPublicForm: true },
  ): Promise<{ id: number }>;
  async create(
    dto: CreateOrderDto, user: AuthenticatedUser | null, opts?: { fromPublicForm?: boolean },
  ): Promise<OrderDetailDto | { id: number }> {
    const service = await this.prisma.service.findUnique({ where: { id: dto.serviceId } });
    if (!service || !service.isActive) throw new BadRequestException('Dịch vụ không hợp lệ');

    /* Dịch vụ con phải kiểm ở ĐÂY chứ không để khoá ngoại bắt: khoá ngoại chỉ
       biết id có tồn tại hay không, nó không biết dịch vụ con ấy thuộc dịch vụ
       nào, còn bật hay không, và càng không biết dịch vụ này BẮT BUỘC phải
       chọn. Ba thứ đó mới là cái sai mà người dùng gặp. */
    const conDangBat = await conDangBatCua(this.prisma, dto.serviceId);
    /* BẮT BUỘC với đơn nội bộ, KHÔNG bắt buộc với đơn từ form công khai.
       Form landing chỉ hỏi dịch vụ cha, mà cả bốn dịch vụ vận chuyển đều có
       dịch vụ con — bắt buộc ở đây nghĩa là MỌI yêu cầu từ landing ném lỗi,
       auto-convert chết, và khách nằm im ở 'pending' cho tới khi có người mở
       màn Yêu cầu báo giá. Đã xảy ra thật với 4 yêu cầu liên tiếp.

       Đơn vẫn tạo, nhưng 'Dịch vụ con' vào danh sách cần bổ sung (xem
       order-completeness.helper) nên nó không lặng lẽ thiếu mã TMS. */
    const loiCon = kiemDichVuCon(
      dto.serviceId, dto.serviceChildId, conDangBat, !opts?.fromPublicForm,
    );
    if (loiCon) throw new BadRequestException(loiCon);
    const { tienTo, ngan } = tienToCuaDon(service, conDangBat, dto.serviceChildId);
    // Hình dạng tuyến theo DỊCH VỤ CON (054) — xem hinh-dang-tuyen.helper.
    const tuyen = tuyenCuaDon(service, conDangBat, dto.serviceChildId);
    if (dto.customerId !== undefined && dto.newCustomer !== undefined)
      throw new BadRequestException('Chỉ được gửi customerId HOẶC newCustomer, không gửi cả hai');

    // Kiểm tra NGOÀI transaction: hai truy vấn chỉ đọc, không việc gì phải giữ advisory lock sinh mã đơn.
    this.serviceData.assertCargoAllowed(service.cargoFields, dto as unknown as Record<string, unknown>);
    // Nới trường bắt buộc đi qua `opts` — tham số NỘI BỘ, chỉ auto-convert form
    // công khai mở. KHÔNG lấy dto.source: client tự khai được thì ai cũng lách.
    const serviceData = await this.serviceData.validate(
      dto.serviceId, dto.serviceData ?? {}, { skipRequired: opts?.fromPublicForm },
    );

    // "Miễn lúc ghi" khác "sẵn sàng cho phòng ban" — chấm lại (scope ngoài transaction, Task 5 dùng thẳng):
    const missing = await missingInfoForPublicOrder(
      dto, serviceData as Record<string, unknown>, opts, (id) => this.serviceData.requiredFieldsOf(id),
      tuyen, conDangBat.length > 0);
    const incomplete = missing.length > 0;

    // Advisory lock trong next_daily_no() SERIAL HÓA transaction cùng (tiền tố, ngày). maxWait mặc
    // định 2s của Prisma quá ngắn — chục sale bấm cùng lúc là request sau ném 500 "Unable to start
    // a transaction in the given time". Nới hạn chờ, không nới thời gian giữ khóa.
    const { orderId, deptIds } = await this.prisma.$transaction(async (tx) => {
      // Lấy ngày MỘT LẦN từ database rồi truyền đi — không để mỗi chỗ tự gọi current_date.
      const [{ today }] = await tx.$queryRaw<{ today: Date }[]>`SELECT current_date AS today`;
      const [{ no }] = await tx.$queryRaw<{ no: number }[]>`
        SELECT next_daily_no(${tienTo}::text, ${today}::date) AS no`;
      const [{ code }] = await tx.$queryRaw<{ code: string }[]>`
        SELECT order_code(${tienTo}::text, ${ngan}::text, ${today}::date, ${no}::int) AS code`;

      // Luật chọn/tạo hồ sơ khách (QA-09 và việc lấp số điện thoại còn trống để
      // hai lần chấm đủ-thiếu khớp nhau) nằm trong order-customer.helper.
      const customerId = user && laDoiTac(user)
        ? await khachCuaDoiTac(tx, user.email, dto.newCustomer)
        : await resolveCustomerId(tx, this.customers, dto);

      // Tra định tuyến TRƯỚC khi tạo; bỏ qua nếu đơn chờ bổ sung thông tin.
      const depts = incomplete ? [] : await tx.department.findMany({
        // Chỉ Phòng báo giá được chia đơn (080) — phòng khác tích dịch vụ là để XEM đơn đã chốt.
        where: { isActive: true, isQuoting: true, serviceIds: { has: dto.serviceId } },
        select: { id: true },
      });

      const created = await tx.order.create({
        data: {
          ...mapWritableOrder(dto),
          serviceData,
          customerId,
          serviceId: dto.serviceId,
          code,
          codePrefix: tienTo,
          orderDay: today,
          dailyNo: no,
          createdBy: user?.id ?? null,
          status: incomplete ? OrderStatus.AWAITING_INFO : (depts.length ? OrderStatus.DISTRIBUTED : OrderStatus.NEW),
        },
      });

      if (depts.length)
        await tx.orderDepartment.createMany({
          data: depts.map((d) => ({ orderId: created.id, departmentId: d.id })),
        });

      /* Mode lấy từ chính dịch vụ con của đơn — nó quyết định đầu nào là
         khách, đầu nào là kho/cảng. */
      await ghiNhoDiaChiCuaDon(this.diaChiKhach, tx, {
        customerId: customerId ?? null,
        tmsMode: conDangBat.find((c) => c.id === dto.serviceChildId)?.tmsMode ?? null,
        originAddress: dto.originAddress,
        destinationAddress: dto.destinationAddress,
      });

      await this.activity.log(tx, {
        orderId: created.id, entity: 'orders', entityId: created.id,
        action: 'create', actorId: user?.id ?? null, detail: { code, serviceId: dto.serviceId },
      });
      return { orderId: created.id, deptIds: depts.map((d) => d.id) };
    }, { maxWait: 15_000, timeout: 20_000 });

    // Thông báo NGOÀI transaction — SMTP chậm không được giữ khóa DB.
    await sendNewOrderNotification({ prisma: this.prisma, notify: this.notify }, orderId, deptIds, service.name, missing);
    return user ? this.query.detail(orderId, user) : { id: orderId };
  }

  /** Sửa sau chốt vẫn được (đặc tả F4) nhưng BẮT BUỘC có changeNote và luôn lưu vết. */
  async update(id: number, dto: UpdateOrderDto, user: AuthenticatedUser): Promise<OrderDetailDto> {
    const order = await this.query.findScoped(id, user);
    const beforeClose: string[] = [
      // Đơn chờ bổ sung chưa chốt gì cả — đòi ghi chú lý do ở đây là chặn đúng
      // thao tác mà trạng thái này sinh ra để phục vụ.
      OrderStatus.AWAITING_INFO,
      OrderStatus.NEW, OrderStatus.DISTRIBUTED, OrderStatus.QUOTING,
      OrderStatus.AWAITING_SELECTION,
    ];
    if (!beforeClose.includes(order.status) && !dto.changeNote)
      throw new BadRequestException('Sửa đơn đã chốt bắt buộc phải có ghi chú lý do');

    // Dịch vụ của đơn không đổi được (mã đơn đã mang tiền tố đó), nên bộ trường đối
    // chiếu luôn là bộ của order.serviceId chứ không phải thứ client gửi kèm.
    // Dịch vụ không đổi được, nên tra dịch vụ con theo dịch vụ CỦA ĐƠN chứ
    // không theo thứ client gửi. Không bắt buộc ở đây: PATCH vắng trường nghĩa
    // là không đụng tới, đơn cũ chưa có dịch vụ con vẫn sửa được thông tin khác.
    const loiCon = kiemDichVuCon(
      order.serviceId, dto.serviceChildId,
      await conDangBatCua(this.prisma, order.serviceId), false,
    );
    if (loiCon) throw new BadRequestException(loiCon);

    const cargoFields = await this.serviceData.cargoFieldsOf(order.serviceId);
    this.serviceData.assertCargoAllowed(cargoFields, dto as unknown as Record<string, unknown>);
    // serviceData vắng mặt = không đụng tới; gửi lên là THAY CẢ CỤM, đúng như mọi
    // trường khác của PATCH này — nửa vời thì không xóa được một ô đã nhập nhầm.
    const serviceData =
      dto.serviceData === undefined
        ? undefined
        : await this.serviceData.validate(order.serviceId, dto.serviceData);

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { ...mapWritableOrder(dto), ...(serviceData ? { serviceData } : {}), updatedAt: new Date() },
      });

      await ghiNhoDiaChiCuaDon(this.diaChiKhach, tx, {
        customerId: order.customerId,
        tmsMode: order.serviceChild?.tmsMode ?? null,
        originAddress: dto.originAddress ?? order.originAddress,
        destinationAddress: dto.destinationAddress ?? order.destinationAddress,
      });
      await this.activity.log(tx, {
        orderId: id, entity: 'orders', entityId: id, action: 'update', actorId: user.id,
        detail: { note: dto.changeNote ?? null },
      });
    });
    /* Đơn vừa đổi thì yêu cầu ký đang chờ không còn đúng nữa: khách mở đường
       dẫn cũ ra sẽ ký vào một bản phiếu khác bản hiện tại. Huỷ ở đây, sale gửi
       lại nếu còn cần. */
    await huyChoKy(this.prisma, id);

    // Sau khi ghi, ngoài transaction trên: thăng trạng thái có transaction
    // riêng và bắn thông báo, không được giữ khóa DB trong lúc đó.
    await promoteIfComplete(
      { prisma: this.prisma, activity: this.activity, serviceData: this.serviceData, notify: this.notify },
      id, user,
    );
    return this.query.detail(id, user);
  }

  /** F4 — khóa doanh thu + sinh snapshot bộ mốc. */
  /** Sale nhận một đơn chưa có ai đứng tên — xem nhan-don.ts. */
  nhanDon(id: number, user: AuthenticatedUser): Promise<OrderDetailDto> {
    const deps = { prisma: this.prisma, activity: this.activity, query: this.query };
    return nhanDonChung(deps, id, user);
  }

  async close(id: number, dto: CloseOrderDto, user: AuthenticatedUser): Promise<OrderDetailDto> {
    const current = await this.query.findScoped(id, user);
    await this.chotDon(id, dto.note ?? null, user.id, current.code, current.departmentId);
    return this.query.detail(id, user);
  }

  /**
   * Chốt đơn, KHÔNG kiểm phạm vi dữ liệu của người gọi — xem `chot-don.ts`.
   */
  async chotDon(
    id: number,
    note: string | null,
    actorId: number,
    maDon: string,
    deptId: number | null,
  ): Promise<void> {
    return chotDonChung(
      {
        prisma: this.prisma,
        activity: this.activity,
        notify: this.notify,
        customerNotify: this.customerNotify,
      },
      id, note, actorId, maDon, deptId,
    );
  }

  /**
   * Khách từ chối. Từ migration 023 KHÔNG còn trạng thái 'rejected' riêng — đơn
   * về 'cancelled' như mọi đơn kết thúc không thành.
   *
   * Nhưng thao tác này GIỮ LẠI, không gộp vào cancel(): "khách chê giá" và "nhập
   * nhầm, huỷ nội bộ" là hai việc khác nhau, và win rate phân biệt được chúng nhờ
   * đơn có báo giá hay chưa. Lý do vẫn ghi vào reject_reason như cũ, và chép thêm
   * sang cancel_reason để mọi màn hình đọc "vì sao đơn này huỷ" đều thấy — không
   * màn nào phải biết là đơn này từng đi đường nào.
   */
  async reject(id: number, dto: RejectOrderDto, user: AuthenticatedUser): Promise<OrderDetailDto> {
    const current = await this.query.findScoped(id, user);

    // Chặn riêng ở đây chứ không dựa vào máy trạng thái: đích đến giờ là
    // 'cancelled', mà huỷ thì hợp lệ từ cả 'closed' — nên nếu để assertTransition
    // gác một mình thì "Khách từ chối" sẽ nuốt luôn cả đơn ĐÃ CHỐT. Khách không
    // thể từ chối một cái giá đã chốt xong; muốn bỏ đơn đó thì dùng Hủy đơn.
    if (!REJECTABLE_STATUSES.includes(current.status as OrderStatus))
      throw new ConflictException(
        `Đơn đang ở trạng thái "${statusLabel(current.status)}" nên không ghi nhận ` +
          'khách từ chối được. Dùng Hủy đơn nếu cần dừng đơn này.',
      );

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id } });
      assertTransition(order.status, OrderStatus.CANCELLED);
      await tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.CANCELLED,
          rejectReason: dto.rejectReason,
          cancelReason: dto.rejectReason,
          // QA-19: ghi chú của ba nghiệp vụ vào ba cột riêng, đừng dồn close_note.
          rejectNote: dto.note,
          updatedAt: new Date(),
        },
      });
      await this.activity.log(tx, {
        orderId: id, entity: 'orders', entityId: id, action: 'reject', actorId: user.id,
        detail: { rejectReason: dto.rejectReason },
      });
    });

    // Chưa chọn phòng nào -> báo MỌI phòng đang tham gia.
    const deptIds = current.departmentId
      ? [current.departmentId]
      : current.departments.map((d) => d.departmentId);
    await notifyDeptRows(this.notify, id, deptIds, (userId) => ({
      userId, orderId: id, type: NotifType.ORDER_REJECTED,
      title: `Đơn ${current.code} bị khách từ chối`,
      body: `Lý do: ${dto.rejectReason}`,
    }));
    return this.query.detail(id, user);
  }

  /** Hủy nội bộ — NGOÀI win rate. Bắt buộc kèm lý do. */
  async cancel(id: number, dto: CancelOrderDto, user: AuthenticatedUser): Promise<OrderDetailDto> {
    const current = await this.query.findScoped(id, user);
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id } });
      assertTransition(order.status, OrderStatus.CANCELLED);
      await tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED, cancelReason: dto.reason, updatedAt: new Date() },
      });
      await this.activity.log(tx, {
        orderId: id, entity: 'orders', entityId: id, action: 'cancel', actorId: user.id,
        detail: { reason: dto.reason },
      });
    });

    const deptIds = current.departments.filter((d) => d.state !== DeptState.PASSED).map((d) => d.departmentId);
    await notifyDeptRows(this.notify, id, deptIds, (userId) => ({
      userId, orderId: id, type: NotifType.ORDER_CANCELLED,
      title: `Đơn ${current.code} đã bị hủy`, body: `Lý do: ${dto.reason}`,
    }));
    await this.customerNotify.orderEvent(
      id, CustomerNotifType.ORDER_CANCELLED,
      `Đơn ${current.code} đã bị huỷ`,
    );
    return this.query.detail(id, user);
  }
}
