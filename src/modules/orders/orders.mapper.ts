import { Prisma } from '@prisma/client';
import { laDoiTac } from '@/common/scope/la-doi-tac';
import { canReadAllOrders } from '@/common/scope/can-read-all-orders';
import { maskAmount } from '@/common/scope/money.visibility';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { MilestoneStatus } from '@/common/enums';
import { statusLabel } from './order-state.helper';
import { OrderDeptDto, OrderDetailDto, OrderListItemDto, OrderMilestoneDto } from './dto/order-response.dto';
import { customerDisplayName } from '@/common/customer-display-name';
import { chuaCoSale } from './don-chua-co-sale';
import { laDieuVanCuaDon } from '@/common/scope/dieu-van';

export const ORDER_LIST_INCLUDE = {
  service: { select: { code: true, name: true, hasDomesticDestination: true } },
  customer: { select: { companyName: true, contactName: true } },
  creator: { select: { fullName: true, email: true, roles: true } },
  department: { select: { name: true } },
  milestones: { where: { status: MilestoneStatus.DONE }, orderBy: { seq: 'desc' }, take: 1 },
  departments: { select: { departmentId: true } },
} satisfies Prisma.OrderInclude;

export const ORDER_DETAIL_INCLUDE = {
  ...ORDER_LIST_INCLUDE,
  // Số điện thoại không hiện ở đâu trên chi tiết đơn, nhưng missingOrderInfo()
  // chấm nó — thiếu ở đây thì danh sách "còn thiếu gì" luôn báo thiếu số.
  customer: { select: { companyName: true, contactName: true, phone: true } },
  // QA-14: thiếu join này thì doneByName ở chi tiết đơn luôn null, trong khi
  // GET /orders/:id/milestones lại có tên — hai màn hình chỏi nhau.
  milestones: { orderBy: { seq: 'asc' }, include: { user: { select: { fullName: true } } } },
  departments: {
    include: { department: { select: { name: true } }, assignee: { select: { fullName: true } } },
    orderBy: { departmentId: 'asc' },
  },
  // Tên địa điểm để hiện ra; id thôi thì màn chi tiết phải gọi thêm một lượt
  // chỉ để dịch hai con số thành hai cái tên.
  originLocation: { select: { name: true } },
  destinationLocation: { select: { name: true } },
  // Tên VÀ mã TMS của dịch vụ con: màn chi tiết hiện cả hai, và mã là thứ
  // quyết định đơn này có đẩy sang OF1 được không.
  serviceChild: { select: { id: true, name: true, tmsMode: true } },
  /* Dịch vụ cha này có dịch vụ con nào đang bật không — `missingOrderInfo()`
     cần để biết có đòi "Dịch vụ con" hay không. Đếm KÈM trong câu đã có thay vì
     một truy vấn riêng: đây là câu chạy mỗi lần mở chi tiết đơn. */
  service: {
    select: {
      code: true, name: true, hasDomesticDestination: true,
      _count: { select: { children: { where: { isActive: true } } } },
    },
  },
} satisfies Prisma.OrderInclude;

type ListRow = Prisma.OrderGetPayload<{ include: typeof ORDER_LIST_INCLUDE }>;
type DetailRow = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;

const num = (v: Prisma.Decimal | null): number | null => (v === null ? null : Number(v));

export function toListItem(o: ListRow, user: AuthenticatedUser): OrderListItemDto {
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    statusLabel: statusLabel(o.status),
    serviceCode: o.service.code,
    serviceName: o.service.name,
    customerName: customerDisplayName(o.customer),
    originProvince: o.originProvince,
    destinationProvince: o.destinationProvince,
    // Người tạo không mang vai Sale (đối tác tự tạo, Admin nhập hộ) thì đơn CHƯA có Sale —
    // hiện tên họ ở ô "Sale" là nói ngược với nút "Nhận đơn" ngay bên cạnh.
    saleName: chuaCoSale(o.creator) ? null : o.creator?.fullName ?? null,
    /* Chưa có sale nào đứng tên -> màn danh sách và màn chi tiết hiện nút
       "Nhận đơn". Tính ở backend chứ không để FE đoán theo tên người tạo: tên
       là chữ người dùng sửa được, còn luật thì nằm ở don-chua-co-sale.ts. */
    chuaCoSale: chuaCoSale(o.creator),
    source: o.source,
    departmentName: o.department?.name ?? null,
    // Tầng cột: chỉ phòng THẮNG và sale phụ trách mới thấy doanh thu.
    finalAmount: maskAmount(user, o, o.finalAmount),
    latestMilestone: o.milestones[0]?.name ?? null,
    createdAt: o.createdAt,
    closedAt: o.closedAt,
  };
}

/**
 * Báo giá kín: mỗi phòng chỉ thấy dòng của mình. Chỉ sale phụ trách đơn và vai trò
 * Admin thấy tất cả — dùng CHUNG canReadAllOrders() với các chỗ khác.
 */
export function visibleDepartments(o: DetailRow, user: AuthenticatedUser): OrderDeptDto[] {
  /* Đối tác (Bee Logistics) THẤY giá phòng ban — quyết định của Bee (081):
     đơn Bee Logistics không qua Sale, Pricing báo thẳng giá cost cho họ.
     Phạm vi dòng đã do ScopeService chặn ở đúng đơn của công ty họ. Chỉ lộ
     phòng ĐÃ có giá, và giấu người xử lý cùng lý do bỏ qua — việc nội bộ. */
  const doiTac = laDoiTac(user);

  // Điều vận / Trưởng phòng thấy báo giá của đơn đã chốt thuộc dịch vụ phòng mình (080).
  const canSeeAll = canReadAllOrders(user) || o.createdBy === user.id || laDieuVanCuaDon(user, o);
  return o.departments
    .filter((d) => (doiTac ? d.amount !== null : canSeeAll || d.departmentId === user.departmentId))
    .map((d) => ({
      departmentId: d.departmentId,
      departmentName: d.department.name,
      state: d.state,
      assigneeName: doiTac ? null : d.assignee?.fullName ?? null,
      assigneeId: doiTac ? null : d.assigneeId ?? null,
      passReason: doiTac ? null : d.passReason,
      amount: num(d.amount),
      scopeNote: d.scopeNote,
      leadTime: d.leadTime,
      validUntil: d.validUntil,
      quoteVersion: d.quoteVersion,
      distributedAt: d.distributedAt,
      claimedAt: d.claimedAt,
      lastQuotedAt: d.lastQuotedAt,
    }))
    .sort((a, b) => (a.amount ?? Number.MAX_SAFE_INTEGER) - (b.amount ?? Number.MAX_SAFE_INTEGER));
}

function toMilestone(m: DetailRow['milestones'][number]): OrderMilestoneDto {
  return {
    id: m.id,
    seq: m.seq,
    name: m.name,
    status: m.status,
    note: m.note,
    doneAt: m.doneAt,
    doneByName: m.user?.fullName ?? null,
  };
}

export function toDetail(o: DetailRow, user: AuthenticatedUser): OrderDetailDto {
  const done = o.milestones.filter((m) => m.status === MilestoneStatus.DONE);
  return {
    ...toListItem({ ...o, milestones: done.slice(-1) } as unknown as ListRow, user),
    serviceId: o.serviceId,
    orderDay: o.orderDay,
    dailyNo: o.dailyNo,
    updatedAt: o.updatedAt,
    customerId: o.customerId,
    originAddress: o.originAddress,
    destinationAddress: o.destinationAddress,
    originLocationId: o.originLocationId,
    serviceChildId: o.serviceChild?.id ?? null,
    serviceChildName: o.serviceChild?.name ?? null,
    serviceChildTmsMode: o.serviceChild?.tmsMode ?? null,
    // Mã THỰC SỰ gửi sang OF1 — chỉ của dịch vụ con, vì đó đúng là thứ
    // tms-payload.helper.ts đọc. Trước 049 chỗ này còn rơi về mã của dịch vụ
    // cha, nên màn hình hiện "DOMESTIC" trong khi bill gửi đi không mang mode
    // nào: nói một đằng, gửi một nẻo.
    tmsMode: o.serviceChild?.tmsMode ?? null,
    originLocationName: o.originLocation?.name ?? null,
    destinationLocationId: o.destinationLocationId,
    destinationLocationName: o.destinationLocation?.name ?? null,
    desiredDate: o.desiredDate,
    weightKg: num(o.weightKg),
    volumeCbm: num(o.volumeCbm),
    packageCount: o.packageCount,
    quantityUnit: o.quantityUnit,
    containerType: o.containerType,
    dimLM: num(o.dimLM),
    dimWM: num(o.dimWM),
    dimHM: num(o.dimHM),
    goodsName: o.goodsName,
    note: o.note,
    source: o.source,
    // Giá Sale chốt với khách — cùng tầng che như doanh thu.
    salePrice: maskAmount(user, o, o.salePrice),
    rejectReason: o.rejectReason,
    closeNote: o.closeNote,
    rejectNote: o.rejectNote,
    cancelReason: o.cancelReason,
    tmsStatus: o.tmsStatus,
    tmsError: o.tmsError,
    completedAt: o.completedAt,
    // Cột jsonb: Prisma trả JsonValue, nhưng constraint orders_service_data_ck đảm
    // bảo luôn là object nên ép kiểu ở đây an toàn.
    serviceData: (o.serviceData ?? {}) as Record<string, unknown>,
    // Mảng rỗng là mặc định đúng cho mọi trạng thái khác awaiting_info; chỉ
    // OrdersQueryService.detail() mới đắp giá trị thật vào, vì tính được nó cần
    // một truy vấn bộ trường bắt buộc mà mapper (hàm thuần, đồng bộ) không làm.
    missingInfo: [],
    departments: visibleDepartments(o, user),
    milestones: o.milestones.map(toMilestone),
  };
}
