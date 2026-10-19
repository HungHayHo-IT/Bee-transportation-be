import { Role } from '../enums';

/**
 * Mức quyền của MỘT vai trò trên MỘT trang. Bốn bậc, xếp từ thấp lên cao.
 *
 *   none = không vào được trang
 *   view = chỉ xem
 *   edit = xem, tạo, sửa — mọi thứ trừ xoá
 *   full = xem, tạo, sửa, xoá
 *
 * Bậc cao bao hàm bậc thấp: xoá được thì đương nhiên sửa và xem được. Một
 * người mang nhiều vai trò lấy bậc CAO NHẤT.
 *
 * Tạo và sửa là MỘT bậc chứ không phải hai. Sửa được một bản ghi mà không tạo
 * được nó, hay ngược lại, là cấu hình không ai dùng tới thật; tách đôi ra chỉ
 * để đủ bốn chữ trong ô chọn là dựng hai lựa chọn khác tên mà hành vi giống
 * hệt — một ô nói dối.
 *
 * Cố ý không có "phòng mình" hay "đơn mình": phạm vi dữ liệu được tính từ
 * PHÒNG BAN của từng người chứ không từ vai trò — hai Pricing ở hai phòng khác
 * nhau phải thấy hai tập đơn khác nhau. Cho chọn phạm vi theo vai trò là dựng
 * một ô không điều khiển được gì, tệ hơn là không có ô.
 */
export const MucQuyen = {
  KHONG: 'none',
  XEM: 'view',
  SUA: 'edit',
  DAY_DU: 'full',
} as const;
export type MucQuyen = (typeof MucQuyen)[keyof typeof MucQuyen];

export const MUC_QUYEN_HOP_LE: readonly string[] = Object.values(MucQuyen);

/**
 * Một trang trong menu quản trị — một DÒNG của ma trận phân quyền.
 *
 * `key` đi vào cơ sở dữ liệu nên không đổi được; nhãn hiển thị do màn quản trị
 * dịch từ khoá này, không lưu trong DB.
 */
export interface TrangQuyen {
  key: string;
  /** Nhóm menu, chỉ để xếp nhóm trên màn ma trận. */
  nhom: string;
  /**
   * Phạm vi dữ liệu của trang này, hiện làm ghi chú trên màn ma trận.
   * 'all' = ai vào cũng thấy như nhau; 'scoped' = cắt theo phòng ban/đơn của
   * chính người xem, bất kể ô trong ma trận ghi gì.
   */
  phamVi: 'all' | 'scoped';
}

/**
 * Hai mươi mốt trang, đúng thứ tự menu bên quản trị.
 *
 * Danh sách này là nguồn duy nhất: backend dùng để chặn, màn ma trận dùng để
 * vẽ dòng, và menu dùng để ẩn/hiện. Thêm một trang mới mà quên khai ở đây thì
 * nó KHÔNG bị chặn — xem PageAccessGuard, trang không khai coi như mở, vì một
 * guard tự chặn thứ nó chưa biết sẽ làm chết tính năng mới ngay khi deploy.
 */
export const TRANG_QUYEN: readonly TrangQuyen[] = [
  { key: 'dashboard', nhom: 'overview', phamVi: 'scoped' },
  { key: 'myTasks', nhom: 'overview', phamVi: 'scoped' },
  // Thông báo là màn riêng, KHÔNG gộp vào "Việc của tôi": hai cái dùng chung
  // một controller nhưng là hai thứ người dùng mở ở hai chỗ khác nhau.
  { key: 'notifications', nhom: 'overview', phamVi: 'scoped' },
  { key: 'orgChart', nhom: 'overview', phamVi: 'all' },

  { key: 'createOrder', nhom: 'orders', phamVi: 'all' },
  { key: 'orders', nhom: 'orders', phamVi: 'scoped' },
  // Chi tiết đơn là MÀN RIÊNG chứ không phải một phần của danh sách: mở được
  // danh sách mà không mở được từng đơn là một cấu hình có thật (ví dụ cho một
  // vai chỉ cần nhìn số lượng), và ngược lại.
  { key: 'orderDetail', nhom: 'orders', phamVi: 'scoped' },
  /* Gửi khách ký phiếu xác nhận. Trang RIÊNG chứ không gác bằng ô
     'orderDetail': ô đó đang là Toàn quyền cho cả Pricing, nên gác kiểu đó sẽ
     lọt thêm một vai không ai định cho. */
  { key: 'orderSignature', nhom: 'orders', phamVi: 'scoped' },
  { key: 'ordersKanban', nhom: 'orders', phamVi: 'scoped' },
  { key: 'queue', nhom: 'orders', phamVi: 'scoped' },
  { key: 'unroutedOrders', nhom: 'orders', phamVi: 'all' },

  { key: 'revenueReport', nhom: 'reports', phamVi: 'scoped' },
  { key: 'operationsReport', nhom: 'reports', phamVi: 'scoped' },

  { key: 'priceList', nhom: 'pricing', phamVi: 'all' },
  { key: 'priceLocations', nhom: 'pricing', phamVi: 'all' },
  // Tra gia MOT TUYEN (057). Khoa rieng voi priceList: duyet ca bang gia va
  // hoi gia mot cap dia diem la hai quyen khac han nhau.
  { key: 'priceLookup', nhom: 'pricing', phamVi: 'all' },

  { key: 'news', nhom: 'seo', phamVi: 'all' },
  { key: 'cms', nhom: 'seo', phamVi: 'all' },
  { key: 'saleRepresentatives', nhom: 'seo', phamVi: 'all' },

  { key: 'customers', nhom: 'directory', phamVi: 'scoped' },
  { key: 'customerDetail', nhom: 'directory', phamVi: 'scoped' },

  { key: 'departments', nhom: 'administration', phamVi: 'all' },
  { key: 'users', nhom: 'administration', phamVi: 'scoped' },
  { key: 'services', nhom: 'administration', phamVi: 'all' },
  { key: 'routingMatrix', nhom: 'administration', phamVi: 'all' },
  { key: 'activityLog', nhom: 'administration', phamVi: 'all' },
  { key: 'permissions', nhom: 'administration', phamVi: 'all' },
  // Cau hinh he thong (057): noi dat tran so lan tra gia mot gio.
  { key: 'systemSettings', nhom: 'administration', phamVi: 'all' },
];

export const KHOA_TRANG: readonly string[] = TRANG_QUYEN.map((t) => t.key);

/**
 * Trang ma trận phân quyền, và vai trò KHÔNG BAO GIỜ mất quyền trên nó.
 *
 * Không có chốt này thì một lần bấm nhầm khoá luôn cả công ty khỏi màn duy
 * nhất mở lại được quyền — và đường sửa còn lại là vào thẳng cơ sở dữ liệu.
 */
export const TRANG_PHAN_QUYEN = 'permissions';
export const VAI_TRO_KHONG_MAT_QUYEN: Role = Role.ADMIN;

/**
 * Ma trận MẶC ĐỊNH — đúng bản ghi trong migration 032.
 *
 * Có ở đây để nút "Đặt lại mặc định" trên màn quản trị có chỗ quay về. Đây là
 * bản sao thứ hai của cùng một dữ liệu, nên hai nơi phải sửa cùng lúc; đổi
 * migration mà quên đổi đây thì nút Đặt lại sẽ kéo hệ thống về một bộ quyền
 * không ai chọn. Test `mac-dinh.spec.ts` khoá đúng điều đó: mọi trang phải có
 * đủ năm vai trò và mức hợp lệ.
 */
const NOI_BO: Record<string, Record<string, MucQuyen>> = {
  orderDetail: { admin: 'full', leader: 'view', manager: 'full', sale: 'full', staff: 'full', dispatcher: 'view' },
  orderSignature: { admin: 'full', leader: 'none', manager: 'full', sale: 'full', staff: 'none', dispatcher: 'none' },
  customerDetail: { admin: 'full', leader: 'view', manager: 'full', sale: 'edit', staff: 'view', dispatcher: 'view' },
  notifications: { admin: 'full', leader: 'full', manager: 'full', sale: 'full', staff: 'full', dispatcher: 'full' },
  dashboard: { admin: 'full', leader: 'view', manager: 'full', sale: 'full', staff: 'full', dispatcher: 'none' },
  myTasks: { admin: 'full', leader: 'view', manager: 'full', sale: 'full', staff: 'full', dispatcher: 'none' },
  orgChart: { admin: 'full', leader: 'view', manager: 'view', sale: 'view', staff: 'view', dispatcher: 'view' },
  createOrder: { admin: 'full', leader: 'none', manager: 'none', sale: 'full', staff: 'none', dispatcher: 'none' },
  orders: { admin: 'full', leader: 'view', manager: 'full', sale: 'full', staff: 'full', dispatcher: 'view' },
  ordersKanban: { admin: 'full', leader: 'view', manager: 'full', sale: 'full', staff: 'full', dispatcher: 'view' },
  queue: { admin: 'full', leader: 'none', manager: 'full', sale: 'none', staff: 'full', dispatcher: 'none' },
  unroutedOrders: { admin: 'full', leader: 'view', manager: 'none', sale: 'none', staff: 'none', dispatcher: 'none' },
  revenueReport: { admin: 'full', leader: 'view', manager: 'view', sale: 'none', staff: 'none', dispatcher: 'none' },
  operationsReport: { admin: 'full', leader: 'view', manager: 'view', sale: 'none', staff: 'none', dispatcher: 'none' },
  // CHI Quan tri he thong va Giam doc (060). Bang gia la toan bo co cau chi
  // phi cua Bee tren moi tuyen; Truong phong, Sale va Pricing tra tung tuyen
  // qua priceLookup chu khong duyet ca bang.
  /* Truong phong XEM duoc, nhung chi thay khu vuc minh dung ten (066) — viec
     cat du lieu nam o RegionRoutesService, khong o day. Khong cho 'edit':
     bang gia la MOT ban cho ca cong ty, sua o mot khu vuc van la sua vao phien
     dang ap dung cua moi nguoi. */
  priceList: { admin: 'full', leader: 'view', manager: 'view', sale: 'none', staff: 'none', dispatcher: 'none' },
  // Cung mot cua nhu priceList (060): danh muc dia diem la hai dau cua moi
  // tuyen, doc het danh muc la doc duoc hinh dang mang luoi. Sale van CHON
  // duoc dia chi luc nhap don vi GET /locations nam duoi priceLookup.
  priceLocations: { admin: 'full', leader: 'view', manager: 'none', sale: 'none', staff: 'none', dispatcher: 'none' },
  priceLookup: { admin: 'view', leader: 'view', manager: 'view', sale: 'view', staff: 'view', dispatcher: 'view' },
  news: { admin: 'full', leader: 'view', manager: 'none', sale: 'none', staff: 'none', dispatcher: 'none' },
  cms: { admin: 'full', leader: 'view', manager: 'none', sale: 'none', staff: 'none', dispatcher: 'none' },
  saleRepresentatives: { admin: 'full', leader: 'view', manager: 'none', sale: 'none', staff: 'none', dispatcher: 'none' },
  customers: { admin: 'full', leader: 'view', manager: 'full', sale: 'edit', staff: 'view', dispatcher: 'view' },
  departments: { admin: 'full', leader: 'view', manager: 'view', sale: 'view', staff: 'view', dispatcher: 'view' },
  users: { admin: 'full', leader: 'view', manager: 'full', sale: 'none', staff: 'none', dispatcher: 'none' },
  services: { admin: 'full', leader: 'view', manager: 'none', sale: 'none', staff: 'none', dispatcher: 'none' },
  routingMatrix: { admin: 'full', leader: 'view', manager: 'none', sale: 'none', staff: 'none', dispatcher: 'none' },
  activityLog: { admin: 'full', leader: 'view', manager: 'none', sale: 'none', staff: 'none', dispatcher: 'none' },
  permissions: { admin: 'full', leader: 'view', manager: 'none', sale: 'none', staff: 'none', dispatcher: 'none' },
  // Chi Admin: day la noi dat tran chong do bang gia, mo rong hon la vo nghia.
  systemSettings: { admin: 'full', leader: 'none', manager: 'none', sale: 'none', staff: 'none', dispatcher: 'none' },
};

/**
 * Đối tác (Bee Logistics) xem được ĐÚNG hai trang. Liệt kê cái MỞ chứ không
 * liệt kê cái đóng: hai mươi bốn chữ 'none' giống hệt nhau không nói lên điều
 * gì, mà lại là hai mươi bốn chỗ để gõ nhầm — và gõ nhầm ở đây là mở một trang
 * nội bộ cho người của công ty khác.
 *
 * Trang nào không có tên dưới đây thì ĐÓNG. Thêm trang mới vào hệ thống mà
 * quên nghĩ tới đối tác cũng không sao, vì mặc định là đóng.
 */
const DOI_TAC_XEM_DUOC: Record<string, MucQuyen> = {
  orders: MucQuyen.XEM,
  orderDetail: MucQuyen.XEM,
  // Tự tạo yêu cầu báo giá (081) — hồ sơ khách do backend gán theo email.
  createOrder: MucQuyen.SUA,
  // Bảng giá niêm yết để đối tác đi báo giá cho khách của họ. Mức XEM nên mọi
  // đường ghi đều bị chặn bởi quyetDinh() theo phương thức HTTP. Phiên giá nháp
  // thì chặn riêng — xem phien-cho-doi-tac.helper.
  priceList: MucQuyen.XEM,
};

export const MAC_DINH: Record<string, Record<string, MucQuyen>> = Object.fromEntries(
  Object.entries(NOI_BO).map(([trang, muc]) => [
    trang,
    { ...muc, [Role.PARTNER]: DOI_TAC_XEM_DUOC[trang] ?? MucQuyen.KHONG },
  ]),
);
