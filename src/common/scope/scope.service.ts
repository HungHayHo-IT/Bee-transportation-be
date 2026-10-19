import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderStatus, Role } from '../enums';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { canReadAllOrders } from './can-read-all-orders';
import { chiLaSale } from './chi-la-sale';
import { isCompanyWide } from './is-company-wide';
import { laDoiTac } from './la-doi-tac';
import { dieuVanWhere } from './dieu-van';
import { DON_CHUA_CO_SALE } from '@/modules/orders/don-chua-co-sale';
import { DIEU_KIEN_KHACH_BEE_LOGS } from '@/modules/customers/khach-bee-logs.helper';

export interface ReportScope {
  level: 'company' | 'department' | 'personal';
  /** Các vế dưới đây là HỢP (OR) với nhau, không loại trừ nhau. */
  departmentId?: number;
  createdBy?: number;
  assigneeId?: number;
}

@Injectable()
export class ScopeService {
  /**
   * Điều kiện lọc đơn hàng theo phạm vi quyền. MỌI truy vấn `order` phải AND với nó.
   * Không khớp vai trò nào có scope -> { id: -1 } (rỗng), KHÔNG phải {} (tất cả).
   *
   * Dùng canReadAllOrders (chỉ Admin), KHÔNG dùng isCompanyWide: lãnh đạo và kế toán
   * xem được báo cáo tổng nhưng không xem được đơn của phòng khác.
   */
  /**
   * Phạm vi ĐỌC đơn — rộng hơn orderWhere() đúng một vế: người có cờ "Xem toàn
   * bộ đơn (chỉ xem)" đọc được MỌI đơn, trừ đơn còn chờ bổ sung thông tin.
   *
   * Tách khỏi orderWhere() vì orderWhere() là cửa của cả thao tác GHI: bình
   * luận, tải file, cập nhật mốc, nhận/báo giá, sửa/huỷ đơn đều hỏi nó "đơn
   * này có trong phạm vi không". Nới nó ra là cấp luôn quyền làm. Chỉ đường
   * đọc gọi hàm này; đường ghi giữ nguyên cửa cũ.
   *
   * Loại `awaiting_info`: đơn khách tự đặt từ landing chưa đủ thông tin thì
   * chưa có gì để báo giá — Sale nhập đủ, đơn rời trạng thái đó, rồi mới hiện.
   *
   * Đối tác không bao giờ hưởng vế này, kể cả khi ai đó bật cờ cho họ.
   */
  orderReadWhere(user: AuthenticatedUser): Prisma.OrderWhereInput {
    const ghi = this.orderWhere(user);
    if (laDoiTac(user)) return ghi;
    if (user.canViewAllOrders) return { OR: [ghi, { status: { not: OrderStatus.AWAITING_INFO } }] };
    // Điều vận / Trưởng phòng: thêm đơn đã chốt của dịch vụ phòng mình tích — CHỈ ở đường đọc (080).
    const dv = dieuVanWhere(user);
    return dv ? { OR: [ghi, dv] } : ghi;
  }

  orderWhere(user: AuthenticatedUser): Prisma.OrderWhereInput {
    if (canReadAllOrders(user)) return {};

    /* ĐỐI TÁC: phạm vi cố định, trả về NGAY và không hợp (OR) với vế nào khác.
       Để nó chảy xuống dưới thì chỉ cần ai đó gán phòng ban cho tài khoản đối
       tác — một thao tác bình thường trên màn nhân sự — là họ thấy luôn toàn
       bộ đơn của phòng đó. Chặn ở đây thì không thao tác nhân sự nào mở rộng
       được phạm vi của người ngoài công ty. */
    if (laDoiTac(user))
      return { customer: DIEU_KIEN_KHACH_BEE_LOGS };

    const or: Prisma.OrderWhereInput[] = [];

    /* Thuộc phòng nào thì thấy đơn của phòng đó: thông báo bắn cho mọi thành
       viên phòng nên quyền đọc phải rộng bằng, không thì bấm vào ra 404. Vẫn
       đòi ít nhất một vai trò — user không vai trò là dữ liệu hỏng, không được
       mở phạm vi cho họ.

       TRỪ người CHỈ là Sale (07/10/2026). Vế này từng là đường để hai Sale ngồi
       cùng phòng đọc đơn của nhau. Sale giờ chỉ thấy đơn mình tạo; đổi lại
       `deptRecipients` cũng thôi bắn thông báo phòng cho họ, nếu không là nhận
       thông báo rồi bấm vào ra 404. Trưởng phòng KIÊM sale không rơi vào đây —
       xem chiLaSale. */
    if (user.departmentId !== null && user.roles.length > 0 && !chiLaSale(user.roles))
      or.push({ departments: { some: { departmentId: user.departmentId } } });

    /* Đơn của phòng mình LÀM TRƯỞNG — vế riêng, không gộp được với vế trên.
       `departments.manager_id` và `users.department_id` là HAI quan hệ tách
       rời: trưởng phòng hoàn toàn có thể không nằm trong biên chế phòng mình
       quản. Khi đó vế trên không khớp gì và họ không thấy MỘT đơn nào của
       phòng — `or` rỗng là `{ id: -1 }`.

       `NotifyService.deptRecipients` đã bù đúng chỗ này từ lâu (nó cộng thêm
       `dept.manager` vào người nhận), còn chỗ này thì chưa — nên trưởng phòng
       nhận thông báo rồi bấm vào ra 404. Lại là hai nguồn sự thật.

       Bám vào DỮ LIỆU (ai đang là trưởng phòng) chứ không vào chuỗi vai trò:
       người được giao quản một phòng thì đọc được đơn của phòng đó, kể cả khi
       hồ sơ của họ ghi vai gì. */
    if (user.roles.length > 0)
      or.push({ departments: { some: { department: { managerId: user.id } } } });

    /* HAI LUỒNG cho Sale, và chỉ hai (07/10/2026):
         1. Đơn mình đứng tên — `created_by` chính là sale của đơn.
         2. Đơn CHƯA CÓ SALE nào đứng tên — mọi Sale thấy, để có người nhận.
       Nhận đơn xong (OrdersService.nhanDon đổi `created_by`) là đơn rời vế 2
       sang vế 1, và Sale khác thôi thấy ngay.

       Vế 2 thay cho điều kiện cũ `awaiting_info AND chưa có phòng nào`. Điều
       kiện cũ bám vào TRẠNG THÁI nên tự đóng khi đơn được phân phòng — nhưng
       đúng lúc đó vế phòng ban ở trên lại mở ra, nên hai Sale cùng phòng vẫn
       đọc được đơn của nhau, càng vào sâu quy trình càng lộ. Vế mới bám vào
       NGƯỜI ĐỨNG TÊN, không bám trạng thái. */
    if (user.roles.includes(Role.SALE)) {
      or.push({ createdBy: user.id });
      or.push(DON_CHUA_CO_SALE);
    }

    // Vế riêng cho đơn Admin gán cho người NGOÀI phòng phụ trách; vế hàng đợi phòng
    // đã nằm trong nhánh phòng ban ở trên.
    if (user.roles.includes(Role.STAFF))
      or.push({ departments: { some: { assigneeId: user.id } } });

    return or.length ? { OR: or } : { id: -1 };
  }

  /**
   * Phạm vi thống kê. `level` chỉ quyết định hiển thị tầng nào; các vế lọc thì OR với
   * nhau y hệt orderWhere — lệch nhau là dashboard và danh sách đơn đá nhau.
   *
   * Đây là chỗ DUY NHẤT còn dùng isCompanyWide cho đơn: báo cáo tổng vẫn mở cho lãnh
   * đạo và kế toán. Đổi lại, drill-down từ dashboard đi qua orderWhere nên họ thấy số
   * tổng mà không mở được từng đơn ngoài phòng mình — có chủ ý.
   */
  reportScope(user: AuthenticatedUser): ReportScope {
    if (isCompanyWide(user)) return { level: 'company' };

    // Điều kiện là "có phòng ban", KHÔNG phải "là trưởng phòng" — phải trùng đúng
    // nhánh phòng ban của orderWhere ở trên, kể cả chỗ loại người chỉ là Sale.
    const inDepartment = user.departmentId !== null && !chiLaSale(user.roles);
    return {
      level: inDepartment ? 'department' : 'personal',
      departmentId: inDepartment ? (user.departmentId as number) : undefined,
      createdBy: user.roles.includes(Role.SALE) ? user.id : undefined,
      assigneeId: user.roles.includes(Role.STAFF) ? user.id : undefined,
    };
  }
}
