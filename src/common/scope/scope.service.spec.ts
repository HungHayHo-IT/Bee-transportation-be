import { OrderStatus, Role } from '../enums';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { ScopeService } from './scope.service';

const mkUser = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 7,
  email: 'x@bee.vn',
  fullName: 'X',
  roles: [],
  departmentId: null,
  canViewCompanyReport: false,
  mustChangePassword: false,
  ...over,
});

const OF_DEPT_3 = { departments: { some: { departmentId: 3 } } };

/**
 * Đơn CHƯA CÓ SALE nào đứng tên — mọi Sale đều thấy, để có người nhận. Định
 * nghĩa thật ở don-chua-co-sale.ts; ở đây chỉ lặp lại hình dạng để so.
 */
const CHUA_CO_SALE = {
  OR: [
    { createdBy: null },
    { creator: { NOT: { roles: { has: Role.SALE } } } },
  ],
};

/** Người tạo mẫu: một sale thật và một quản trị viên. Đơn khách tự gửi thì không có người tạo. */
const MOT_SALE = { email: 'sale@bee.vn', roles: [Role.SALE] };
const QUAN_TRI = { email: 'admin@bee.vn', roles: [Role.ADMIN] };

interface FakeOrder {
  status: OrderStatus;
  createdBy: number | null;
  /** `managerId` = trưởng phòng của phòng đó, theo departments.manager_id. */
  departments: { departmentId: number; assigneeId: number | null; managerId?: number }[];
  creator: { email: string; roles: string[] } | null;
}

const QUAN_PHONG_3 = { departments: { some: { department: { managerId: 7 } } } };

/**
 * Chấm một đơn giả lập theo where của orderWhere. CHỈ hiểu đúng những hình dạng
 * mà orderWhere sinh ra — đây là dụng cụ của test, không phải bản cài đặt thứ
 * hai của bộ lọc. Có nó thì mới kiểm được câu hỏi thật ("Sale có mở được đơn
 * này không") thay vì chỉ so hình dạng object.
 */
function canRead(where: Record<string, unknown>, o: FakeOrder): boolean {
  if (Object.keys(where).length === 0) return true;
  if (where.id === -1) return false;
  type Clause = {
    status?: string;
    createdBy?: number | null;
    departments?: {
      none?: object;
      some?: { departmentId?: number; assigneeId?: number; department?: { managerId?: number } };
    };
    OR?: Clause[];
    creator?: { NOT?: { roles?: { has?: string } } };
  };
  return ((where.OR ?? []) as Clause[]).some((c) => {
    // Vế "chưa có sale" là một OR lồng — đệ quy chứ không mở tay ra ở đây.
    if (c.OR !== undefined) return canRead({ OR: c.OR }, o);
    if (c.creator !== undefined) {
      if (o.creator === null) return false;
      const vai = c.creator.NOT?.roles?.has;
      if (vai !== undefined) return !o.creator.roles.includes(vai);
      return false;
    }
    if (c.status !== undefined && c.status !== o.status) return false;
    if (c.createdBy !== undefined && c.createdBy !== o.createdBy) return false;
    const d = c.departments;
    if (d?.none !== undefined) return o.departments.length === 0;
    if (d?.some?.departmentId !== undefined)
      return o.departments.some((x) => x.departmentId === d.some?.departmentId);
    if (d?.some?.assigneeId !== undefined)
      return o.departments.some((x) => x.assigneeId === d.some?.assigneeId);
    if (d?.some?.department?.managerId !== undefined)
      return o.departments.some((x) => x.managerId === d.some?.department?.managerId);
    return true;
  });
}

describe('ScopeService.orderWhere', () => {
  const scope = new ScopeService();

  it('Admin thấy toàn bộ', () => {
    expect(scope.orderWhere(mkUser({ roles: [Role.ADMIN] }))).toEqual({});
  });

  /**
   * Đơn hàng siết chặt hơn báo cáo: chỉ Admin đọc được đơn của MỌI phòng. Ban lãnh
   * đạo và người có cờ báo cáo vẫn xem được số tổng hợp (reportScope bên dưới),
   * nhưng danh sách đơn thì chỉ trong phạm vi phòng ban của họ.
   */
  it('Ban lãnh đạo KHÔNG còn đọc được đơn ngoài phòng mình', () => {
    expect(scope.orderWhere(mkUser({ roles: [Role.LEADER] }))).toEqual({ OR: [QUAN_PHONG_3] });
  });

  it('Ban lãnh đạo có phòng ban chỉ thấy đơn phòng mình', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.LEADER], departmentId: 3 }));
    expect(w).toEqual({ OR: [OF_DEPT_3, QUAN_PHONG_3] });
  });

  it('cờ canViewCompanyReport KHÔNG mở phạm vi đọc đơn', () => {
    expect(scope.orderWhere(mkUser({ roles: [], canViewCompanyReport: true }))).toEqual({ id: -1 });
  });

  it('kế toán có cờ báo cáo, thuộc phòng: vẫn chỉ thấy đơn phòng mình', () => {
    const w = scope.orderWhere(
      mkUser({ roles: [Role.STAFF], departmentId: 3, canViewCompanyReport: true }),
    );
    expect(w).toEqual({
      OR: [OF_DEPT_3, QUAN_PHONG_3, { departments: { some: { assigneeId: 7 } } }],
    });
  });

  it('Sale KHÔNG thuộc phòng nào: đơn mình tạo HOẶC đơn chưa có sale', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.SALE] }));
    expect(w).toEqual({ OR: [QUAN_PHONG_3, { createdBy: 7 }, CHUA_CO_SALE] });
  });

  /** Luồng 1: đơn khách tự gửi từ landing page — chưa ai đứng tên (created_by NULL). */
  it('Sale đọc được đơn từ landing page, BẤT KỂ trạng thái và đã phân phòng hay chưa', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.SALE] }));
    for (const don of [
      { status: OrderStatus.AWAITING_INFO, createdBy: null, departments: [], creator: null },
      // Chỗ luật cũ hỏng: phân phòng xong là vế cũ tự đóng, nhưng đơn vẫn chưa
      // có sale nào đứng tên nên vẫn phải hiện ra cho mọi Sale.
      {
        status: OrderStatus.QUOTING, createdBy: null,
        departments: [{ departmentId: 3, assigneeId: null }], creator: null,
      },
    ]) expect(canRead(w as never, don)).toBe(true);
  });

  /** Luồng 1 còn gồm đơn Quản trị viên nhập hộ: chưa ai trong đội bán đứng tên. */
  it('Sale đọc được đơn do Quản trị viên tạo', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.SALE] }));
    expect(canRead(w as never, {
      status: OrderStatus.QUOTING, createdBy: 999, departments: [], creator: QUAN_TRI,
    })).toBe(true);
  });

  /** Luồng 2, và là cả lý do của thay đổi này. */
  it('Sale KHÔNG đọc được đơn của Sale khác, kể cả cùng phòng và đã phân phối', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.SALE], departmentId: 3 }));
    expect(canRead(w as never, {
      status: OrderStatus.QUOTING, createdBy: 999,
      departments: [{ departmentId: 3, assigneeId: null }], creator: MOT_SALE,
    })).toBe(false);
  });

  /** Nhận đơn = đổi created_by, nên đơn rời luồng 1 sang luồng 2 ngay. */
  it('đơn landing ĐÃ có sale nhận thì Sale khác thôi thấy', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.SALE] }));
    expect(canRead(w as never, {
      status: OrderStatus.QUOTING, createdBy: 999, departments: [], creator: MOT_SALE,
    })).toBe(false);
  });

  /** Không phải Sale thì không được hưởng vế này. */
  it('Nhân viên KHÔNG phải Sale không đọc được đơn chưa có sale', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.STAFF], departmentId: 3 }));
    expect(canRead(w as never, {
      status: OrderStatus.AWAITING_INFO, createdBy: null, departments: [], creator: null,
    })).toBe(false);
  });

  it('Trưởng phòng thấy đơn phòng mình tham gia', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.MANAGER], departmentId: 3 }));
    expect(w).toEqual({ OR: [OF_DEPT_3, QUAN_PHONG_3] });
  });

  it('Nhân viên: hàng đợi phòng HOẶC đơn mình được gán ở phòng khác', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.STAFF], departmentId: 3 }));
    expect(w).toEqual({
      OR: [OF_DEPT_3, QUAN_PHONG_3, { departments: { some: { assigneeId: 7 } } }],
    });
  });

  /**
   * Người CHỈ là Sale KHÔNG còn vế phòng ban. Vế đó từng là đường để hai Sale
   * ngồi cùng phòng đọc đơn của nhau — xem chiLaSale. Đổi lại deptRecipients
   * cũng thôi bắn thông báo phòng cho họ, nên không sinh ra 404 nào.
   */
  it('Sale THUỘC phòng vẫn KHÔNG thấy đơn của phòng', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.SALE], departmentId: 3 }));
    expect(w).toEqual({ OR: [QUAN_PHONG_3, { createdBy: 7 }, CHUA_CO_SALE] });
  });

  /** "CHỈ là Sale" chứ không phải "có vai Sale": kiêm nhiệm giữ nguyên tầm nhìn. */
  it('Trưởng phòng KIÊM sale: giữ CẢ vế phòng ban lẫn vế sale', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.MANAGER, Role.SALE], departmentId: 3 }));
    expect(w).toEqual({ OR: [OF_DEPT_3, QUAN_PHONG_3, { createdBy: 7 }, CHUA_CO_SALE] });
  });

  it('vai trò rỗng -> { id: -1 } chứ KHÔNG phải {}', () => {
    expect(scope.orderWhere(mkUser())).toEqual({ id: -1 });
  });

  it('có phòng ban nhưng KHÔNG vai trò nào -> vẫn { id: -1 }', () => {
    expect(scope.orderWhere(mkUser({ departmentId: 3 }))).toEqual({ id: -1 });
  });

  /**
   * `departments.manager_id` và `users.department_id` là HAI quan hệ tách rời:
   * trưởng phòng hoàn toàn có thể không nằm trong biên chế phòng mình quản.
   * Trước đây người này không thấy MỘT đơn nào của phòng mình — `or` rỗng là
   * `{ id: -1 }` — trong khi deptRecipients vẫn bắn thông báo cho họ, nên bấm
   * vào ra 404.
   */
  it('trưởng phòng KHÔNG thuộc biên chế vẫn đọc được đơn phòng mình quản', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.MANAGER] }));
    expect(w).toEqual({ OR: [QUAN_PHONG_3] });
    expect(canRead(w as never, {
      status: OrderStatus.QUOTING, createdBy: 999, creator: MOT_SALE,
      departments: [{ departmentId: 3, assigneeId: null, managerId: 7 }],
    })).toBe(true);
  });

  it('nhưng KHÔNG đọc được đơn của phòng mình không quản', () => {
    const w = scope.orderWhere(mkUser({ roles: [Role.MANAGER] }));
    expect(canRead(w as never, {
      status: OrderStatus.QUOTING, createdBy: 999, creator: MOT_SALE,
      departments: [{ departmentId: 9, assigneeId: null, managerId: 42 }],
    })).toBe(false);
  });
});

describe('ScopeService.reportScope', () => {
  const scope = new ScopeService();

  it('cờ báo cáo công ty -> tầng company', () => {
    expect(scope.reportScope(mkUser({ canViewCompanyReport: true }))).toEqual({ level: 'company' });
  });

  /** Báo cáo KHÔNG siết theo đơn hàng: lãnh đạo và kế toán giữ nguyên tầm nhìn tổng. */
  it('Ban lãnh đạo vẫn xem báo cáo toàn công ty', () => {
    expect(scope.reportScope(mkUser({ roles: [Role.LEADER] }))).toEqual({ level: 'company' });
  });

  it('nhân viên phòng ban: tầng phòng, vẫn giữ assigneeId cho đơn gán ngoài phòng', () => {
    const s = scope.reportScope(mkUser({ roles: [Role.STAFF], departmentId: 3 }));
    expect(s.level).toBe('department');
    expect(s.departmentId).toBe(3);
    expect(s.assigneeId).toBe(7);
    expect(s.createdBy).toBeUndefined();
  });

  it('nhân viên KHÔNG thuộc phòng nào -> tầng cá nhân', () => {
    const s = scope.reportScope(mkUser({ roles: [Role.STAFF] }));
    expect(s.level).toBe('personal');
    expect(s.departmentId).toBeUndefined();
    expect(s.assigneeId).toBe(7);
  });

  /** Đi kèm orderWhere: lệch nhau là dashboard và danh sách đơn đá nhau. */
  /**
   * Phải trùng đúng orderWhere: người CHỈ là Sale không còn đọc đơn của phòng,
   * nên dashboard cũng phải tụt về tầng cá nhân. Lệch nhau là bảng điều khiển
   * hiện một con số mà bấm vào không mở được đơn nào.
   */
  it('sale THUỘC phòng -> vẫn tầng CÁ NHÂN, không phải tầng phòng', () => {
    const s = scope.reportScope(mkUser({ roles: [Role.SALE], departmentId: 3 }));
    expect(s.level).toBe('personal');
    expect(s.departmentId).toBeUndefined();
    expect(s.createdBy).toBe(7);
  });

  it('trưởng phòng KIÊM sale vẫn ở tầng phòng', () => {
    const s = scope.reportScope(mkUser({ roles: [Role.MANAGER, Role.SALE], departmentId: 3 }));
    expect(s.level).toBe('department');
    expect(s.departmentId).toBe(3);
    expect(s.createdBy).toBe(7);
  });

  it('sale KHÔNG thuộc phòng -> tầng cá nhân', () => {
    const s = scope.reportScope(mkUser({ roles: [Role.SALE] }));
    expect(s.level).toBe('personal');
    expect(s.departmentId).toBeUndefined();
    expect(s.createdBy).toBe(7);
  });

  it('trưởng phòng kiêm sale: giữ CẢ departmentId lẫn createdBy', () => {
    const s = scope.reportScope(mkUser({ roles: [Role.MANAGER, Role.SALE], departmentId: 3 }));
    expect(s.level).toBe('department');
    expect(s.departmentId).toBe(3);
    expect(s.createdBy).toBe(7); // thiếu vế này thì dashboard đá nhau với danh sách đơn
  });
});

/**
 * Cờ "Xem toàn bộ đơn (chỉ xem)" — cho người báo giá. Phải xem được đơn của
 * mọi phòng thì mới báo giá cho khách được, nhưng KHÔNG được thao tác.
 */
describe('ScopeService.orderReadWhere', () => {
  const scope = new ScopeService();
  const pricing = mkUser({ roles: [Role.STAFF], departmentId: 4, canViewAllOrders: true });

  it('khong co co thi y het orderWhere', () => {
    const u = mkUser({ roles: [Role.STAFF], departmentId: 4 });
    expect(scope.orderReadWhere(u)).toEqual(scope.orderWhere(u));
  });

  it('co co thi them moi don, TRU don cho bo sung thong tin', () => {
    expect(scope.orderReadWhere(pricing)).toEqual({
      OR: [scope.orderWhere(pricing), { status: { not: OrderStatus.AWAITING_INFO } }],
    });
  });

  /** Cửa GHI không được nới theo: bình luận, tải file, nhận/báo giá, sửa đơn đều hỏi orderWhere. */
  it('co co KHONG noi rong orderWhere — duong ghi giu nguyen', () => {
    const khongCo = mkUser({ roles: [Role.STAFF], departmentId: 4 });
    expect(scope.orderWhere(pricing)).toEqual(scope.orderWhere(khongCo));
  });

  it('doi tac co co cung khong duoc nhan', () => {
    const dt = mkUser({ roles: [Role.PARTNER], departmentId: null, canViewAllOrders: true });
    expect(scope.orderReadWhere(dt)).toEqual(scope.orderWhere(dt));
  });
});
