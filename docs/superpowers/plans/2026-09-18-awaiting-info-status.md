# Trạng thái `awaiting_info` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đơn sinh từ form báo giá công khai dừng ở trạng thái `awaiting_info` ("Cần bổ sung thông tin"), không phân phối cho phòng ban, cho tới khi nhân viên nhập đủ thông tin thì tự chạy tiếp luồng cũ.

**Architecture:** Thêm một giá trị mới vào `OrderStatus` và một nhánh một chiều trong máy trạng thái. Một hàm thuần `missingOrderInfo()` là nguồn sự thật duy nhất cho câu hỏi "đơn này đã đủ chưa"; `create()` dùng nó để quyết định trạng thái ban đầu, `update()` dùng nó để tự thăng trạng thái. Admin chỉ phản chiếu, không định nghĩa luật.

**Tech Stack:** NestJS + Fastify + Prisma + PostgreSQL (backend, jest). React + Vite + MUI (admin, không có test runner — kiểm bằng `npm run build` và `npm run lint`).

**Spec:** `docs/superpowers/specs/2026-09-18-awaiting-info-status-design.md`

## Global Constraints

- Mọi file giữ dưới **300 dòng**. File nào chạm mốc thì tách helper trước khi thêm.
- Comment tiếng Việt, giải thích **TẠI SAO**, không mô tả lại code.
- TDD: viết test đỏ trước, **chạy nó và xác nhận nó đỏ vì đúng lý do**, rồi mới viết code.
- Thay đổi DB phải đủ **4 bước**: file migration → `db/schema.sql` → một dòng trong `scripts/check-migrations.sql` → `prisma/schema.prisma`. Thiếu bước nào cũng là lỗi.
- Mọi thay đổi `orders.status` phải đi qua `assertTransition`.
- `awaiting_info` **không** được thêm vào `DEPT_WORKABLE` — đó chính là cơ chế chặn phòng ban báo giá.
- Không trạng thái nào được phép quay **ngược lại** `awaiting_info`.
- Landing page (`E:\bee-transportation-web`) **không đổi một dòng nào**.
- Backend: `npm test` (jest). Admin: `npm run build` + `npm run lint`.

---

### Task 1: Trạng thái mới trong enum và máy trạng thái

**Files:**
- Modify: `src/common/enums/index.ts:11-22`
- Modify: `src/modules/orders/order-state.helper.ts:8-50` (ALLOWED), `:52-70` (LABEL)
- Test: `src/modules/orders/order-state.helper.spec.ts`

**Interfaces:**
- Consumes: không có (task đầu)
- Produces: `OrderStatus.AWAITING_INFO = 'awaiting_info'`; `ALLOWED[OrderStatus.AWAITING_INFO] = [NEW, DISTRIBUTED, CANCELLED]`; nhãn `'Cần bổ sung thông tin'`

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `src/modules/orders/order-state.helper.spec.ts`:

```ts
describe('awaiting_info — đơn từ form khách còn thiếu thông tin', () => {
  it('đi được sang new, distributed và cancelled', () => {
    for (const to of [OrderStatus.NEW, OrderStatus.DISTRIBUTED, OrderStatus.CANCELLED])
      expect(() => assertTransition(OrderStatus.AWAITING_INFO, to)).not.toThrow();
  });

  /**
   * Bỏ qua bước nhập thông tin là đúng thứ trạng thái này sinh ra để chặn:
   * phòng ban không được nhận một đơn chưa có điểm đi lẫn điểm đến.
   */
  it('KHÔNG đi thẳng sang quoting hay các bước sau', () => {
    for (const to of [
      OrderStatus.QUOTING, OrderStatus.AWAITING_SELECTION,
      OrderStatus.AWAITING_CUSTOMER, OrderStatus.CLOSED,
    ])
      expect(() => assertTransition(OrderStatus.AWAITING_INFO, to)).toThrow(ConflictException);
  });

  /**
   * Một chiều. Cho quay lại thì người lỡ xoá trống ô điểm đến sẽ kéo đơn đang
   * báo giá dở về hàng chờ, phòng ban mất việc đang làm.
   */
  it('không trạng thái nào quay NGƯỢC về awaiting_info', () => {
    for (const from of Object.keys(ALLOWED) as OrderStatus[])
      expect(ALLOWED[from]).not.toContain(OrderStatus.AWAITING_INFO);
  });

  /** Không nằm trong DEPT_WORKABLE chính là cơ chế chặn phòng ban báo giá. */
  it('phòng ban không thao tác được', () => {
    expect(() => assertDeptWorkable(OrderStatus.AWAITING_INFO)).toThrow(ConflictException);
  });

  it('có nhãn tiếng Việt, không rơi về mã thô', () => {
    expect(statusLabel(OrderStatus.AWAITING_INFO)).toBe('Cần bổ sung thông tin');
  });
});
```

Bổ sung vào dòng import đầu file những tên còn thiếu: `ALLOWED`, `assertDeptWorkable`, `statusLabel`, và `ConflictException` từ `@nestjs/common`.

- [ ] **Step 2: Chạy test, xác nhận đỏ đúng lý do**

Run: `npm test -- order-state.helper.spec`
Expected: FAIL — `Property 'AWAITING_INFO' does not exist on type 'typeof OrderStatus'`. Nếu đỏ vì lý do khác (import sai tên), sửa test trước khi đi tiếp.

- [ ] **Step 3: Thêm giá trị vào enum**

Trong `src/common/enums/index.ts`, thêm vào **đầu** `OrderStatus` (trước `NEW`) vì nó đứng trước mọi thứ trong vòng đời:

```ts
export enum OrderStatus {
  /**
   * Đơn sinh từ form báo giá công khai còn thiếu thông tin bắt buộc. Form đó cố
   * tình chỉ hỏi tên, số điện thoại và dịch vụ — điểm đi, điểm đến và trường
   * riêng của dịch vụ là việc nhân viên hỏi khách sau. Trước đây đơn như vậy
   * được gán thẳng 'distributed', phòng ban nhận về không có gì để báo giá.
   */
  AWAITING_INFO = 'awaiting_info',
  NEW = 'new',
  // ... giữ nguyên phần còn lại
}
```

- [ ] **Step 4: Thêm nhánh vào máy trạng thái**

Trong `src/modules/orders/order-state.helper.ts`, thêm vào **đầu** `ALLOWED`:

```ts
export const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  // Một chiều: vào đây chỉ bằng đúng một cửa là lúc tạo từ form công khai.
  // Không nhánh nào quay ngược lại — xem test "không quay ngược".
  [OrderStatus.AWAITING_INFO]: [
    OrderStatus.NEW,
    OrderStatus.DISTRIBUTED,
    OrderStatus.CANCELLED,
  ],

  [OrderStatus.NEW]: [OrderStatus.DISTRIBUTED, OrderStatus.CANCELLED],
  // ... giữ nguyên phần còn lại
};
```

Và thêm vào `LABEL`:

```ts
const LABEL: Record<string, string> = {
  awaiting_info: 'Cần bổ sung thông tin',
  new: 'Mới tạo',
  // ... giữ nguyên phần còn lại
};
```

**Không** đụng vào `DEPT_WORKABLE`.

- [ ] **Step 5: Chạy test, xác nhận xanh**

Run: `npm test -- order-state.helper.spec`
Expected: PASS toàn bộ file, kể cả các test cũ.

- [ ] **Step 6: Commit**

```bash
git add src/common/enums/index.ts src/modules/orders/order-state.helper.ts src/modules/orders/order-state.helper.spec.ts
git commit -m "feat(orders): trạng thái awaiting_info cho đơn còn thiếu thông tin"
```

---

### Task 2: Migration 020 và bốn bước cơ sở dữ liệu

**Files:**
- Create: `db/migrations/020-order-awaiting-info.sql`
- Modify: `db/schema.sql:131-133`
- Modify: `scripts/check-migrations.sql` (thêm dòng trước `) AS m(buoc, can_lam, da_co)`)
- Modify: `prisma/schema.prisma:172` (chú thích)

**Interfaces:**
- Consumes: `OrderStatus.AWAITING_INFO` từ Task 1
- Produces: ràng buộc `orders_status_check` chấp nhận `'awaiting_info'`

- [ ] **Step 1: Viết migration**

Tạo `db/migrations/020-order-awaiting-info.sql`:

```sql
-- 020: them trang thai 'awaiting_info' cho don sinh tu form bao gia cong khai.
--
-- Form cong khai chi hoi ten, so dien thoai va dich vu. Don nhu vay truoc day
-- duoc gan thang 'distributed' va phan cho phong ban -- phong ban mo ra khong
-- co diem di lan diem den de bao gia.
--
-- KHONG dong vao don cu: don dang o distributed/quoting giu nguyen de phong ban
-- dang lam do khong bi keo nguoc ve hang cho.

BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'awaiting_info',
  'new','distributed','quoting','awaiting_selection','awaiting_customer',
  'closed','in_progress','completed','rejected','cancelled'));

COMMIT;
```

- [ ] **Step 2: Cập nhật `db/schema.sql`**

Sửa khối CHECK ở `db/schema.sql:131-133` cho khớp **từng chữ** với migration:

```sql
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'awaiting_info',
    'new','distributed','quoting','awaiting_selection','awaiting_customer',
    'closed','in_progress','completed','rejected','cancelled')),
```

- [ ] **Step 3: Thêm dòng kiểm tra vào `scripts/check-migrations.sql`**

Chèn ngay trước dòng `) AS m(buoc, can_lam, da_co)`:

```sql
  -- Thieu buoc nay thi moi don tu form cong khai deu do 500 khi INSERT: rang
  -- buoc CHECK cu khong biet 'awaiting_info'. Loi nam o tang DB nen khong test
  -- nao cua ung dung bat duoc.
  ('020', 'orders_status_check da nhan awaiting_info',
   (SELECT pg_get_constraintdef(oid) LIKE '%awaiting_info%'
      FROM pg_constraint WHERE conname = 'orders_status_check')),
```

- [ ] **Step 4: Cập nhật chú thích trong Prisma**

`orders.status` là `String` nên kiểu không đổi. Sửa chú thích ở `prisma/schema.prisma:172` để liệt kê đủ trạng thái, tránh người đọc sau tưởng danh sách cũ là đầy đủ:

```prisma
  /// awaiting_info | new | distributed | quoting | awaiting_selection |
  /// awaiting_customer | closed | in_progress | completed | rejected | cancelled
  status     String   @default("new")
```

- [ ] **Step 5: Áp migration lên DB local và kiểm chứng**

```bash
docker exec -i beeops-postgres psql -U beeops -d beeops -v ON_ERROR_STOP=1 -f /dev/stdin < db/migrations/020-order-awaiting-info.sql
docker exec -i beeops-postgres psql -U beeops -d beeops -f /dev/stdin < scripts/check-migrations.sql | grep 020
```

Expected: dòng `020 | orders_status_check da nhan awaiting_info | OK`.

- [ ] **Step 6: Kiểm chứng ràng buộc thật sự chặn giá trị rác**

```bash
docker exec -i beeops-postgres psql -U beeops -d beeops -c "UPDATE orders SET status='khong_ton_tai' WHERE id = (SELECT min(id) FROM orders)"
```

Expected: lỗi `new row for relation "orders" violates check constraint`. Nếu lệnh này **thành công** thì ràng buộc đã bị mất — dừng lại và sửa migration.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/020-order-awaiting-info.sql db/schema.sql scripts/check-migrations.sql prisma/schema.prisma
git commit -m "feat(db): 020 - orders_status_check nhận awaiting_info"
```

---

### Task 3: Hàm thuần `missingOrderInfo` và `requiredFieldsOf`

**Files:**
- Create: `src/modules/orders/order-completeness.helper.ts`
- Create: `src/modules/orders/order-completeness.spec.ts`
- Modify: `src/modules/services/service-data.validator.ts` (thêm `requiredFieldsOf`)

**Interfaces:**
- Consumes: không
- Produces:
  - `interface RequiredField { fieldKey: string; label: string }`
  - `interface OrderInfoInput { customerName, phone, serviceId, originProvince, destinationProvince: string|number|null; serviceData: Record<string, unknown>; requiredFields: RequiredField[] }`
  - `missingOrderInfo(input: OrderInfoInput): string[]` — trả **nhãn tiếng Việt** của các trường còn thiếu, mảng rỗng nghĩa là đủ
  - `ServiceDataValidator.requiredFieldsOf(serviceId: number): Promise<RequiredField[]>`

- [ ] **Step 1: Viết test đỏ**

Tạo `src/modules/orders/order-completeness.spec.ts`:

```ts
import { missingOrderInfo, OrderInfoInput } from './order-completeness.helper';

/**
 * Định nghĩa "đơn đã đủ thông tin chưa" phải nằm ở ĐÚNG MỘT chỗ. Admin có bản
 * kiểm riêng để làm mờ nút Lưu, nhưng nếu nó cũng là nơi ĐỊNH NGHĨA luật thì hai
 * bản sẽ lệch nhau sau vài tháng và không ai biết bên nào đúng.
 */
const full = (): OrderInfoInput => ({
  customerName: 'Công ty A',
  phone: '0900000000',
  serviceId: 3,
  originProvince: 'Hà Nội',
  destinationProvince: 'Lào Cai',
  serviceData: { rent_from: '2026-01-01' },
  requiredFields: [{ fieldKey: 'rent_from', label: 'Thuê từ ngày' }],
});

describe('missingOrderInfo — đơn đã đủ để chạy tiếp chưa', () => {
  it('đủ hết thì trả mảng rỗng', () => {
    expect(missingOrderInfo(full())).toEqual([]);
  });

  it.each([
    ['customerName', 'Tên khách hàng'],
    ['phone', 'Số điện thoại'],
    ['originProvince', 'Điểm đi'],
    ['destinationProvince', 'Điểm đến'],
  ])('thiếu %s thì báo "%s"', (key, label) => {
    expect(missingOrderInfo({ ...full(), [key]: null })).toEqual([label]);
  });

  it('thiếu dịch vụ thì báo "Dịch vụ"', () => {
    expect(missingOrderInfo({ ...full(), serviceId: null })).toEqual(['Dịch vụ']);
  });

  /** Chuỗi toàn khoảng trắng là "chưa nhập", không phải "đã nhập". */
  it('chuỗi rỗng và toàn khoảng trắng đều tính là thiếu', () => {
    expect(missingOrderInfo({ ...full(), originProvince: '   ' })).toEqual(['Điểm đi']);
  });

  /** Đây chính là "Thuê từ ngày"/"Loại hình tờ khai" mà form công khai bỏ qua. */
  it('thiếu trường bắt buộc riêng của dịch vụ thì báo theo nhãn của trường đó', () => {
    expect(missingOrderInfo({ ...full(), serviceData: {} })).toEqual(['Thuê từ ngày']);
  });

  it('dịch vụ không có trường bắt buộc nào thì serviceData rỗng vẫn là đủ', () => {
    expect(missingOrderInfo({ ...full(), serviceData: {}, requiredFields: [] })).toEqual([]);
  });

  it('thiếu nhiều trường thì liệt kê hết, giữ thứ tự khai báo', () => {
    expect(missingOrderInfo({
      ...full(), originProvince: null, destinationProvince: null, serviceData: {},
    })).toEqual(['Điểm đi', 'Điểm đến', 'Thuê từ ngày']);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ đúng lý do**

Run: `npm test -- order-completeness.spec`
Expected: FAIL — `Cannot find module './order-completeness.helper'`.

- [ ] **Step 3: Viết helper**

Tạo `src/modules/orders/order-completeness.helper.ts`:

```ts
/** Một trường bắt buộc riêng của dịch vụ, đọc từ bảng service_fields. */
export interface RequiredField {
  fieldKey: string;
  label: string;
}

export interface OrderInfoInput {
  customerName: string | null;
  phone: string | null;
  serviceId: number | null;
  originProvince: string | null;
  destinationProvince: string | null;
  serviceData: Record<string, unknown>;
  requiredFields: RequiredField[];
}

const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * NGUỒN SỰ THẬT DUY NHẤT cho câu hỏi "đơn này đã đủ để chạy tiếp chưa".
 *
 * `create()` dùng nó để quyết định trạng thái ban đầu của đơn từ form công khai,
 * `update()` dùng nó để biết lúc nào tự thăng trạng thái. Hàm THUẦN — không chạm
 * Prisma — nên test được toàn bộ luật mà không mock gì; bên gọi lo việc đi lấy
 * dữ liệu.
 *
 * Trả về NHÃN tiếng Việt chứ không phải khoá: kết quả này đi thẳng vào nội dung
 * thông báo cho nhân viên, người đọc cần biết "thiếu Điểm đi" chứ không phải
 * "thiếu originProvince".
 */
export function missingOrderInfo(input: OrderInfoInput): string[] {
  const missing: string[] = [];

  if (isBlank(input.customerName)) missing.push('Tên khách hàng');
  if (isBlank(input.phone)) missing.push('Số điện thoại');
  if (input.serviceId === null) missing.push('Dịch vụ');
  if (isBlank(input.originProvince)) missing.push('Điểm đi');
  if (isBlank(input.destinationProvince)) missing.push('Điểm đến');

  // Giữ nguyên thứ tự khai báo của dịch vụ (đã sortOrder ở tầng truy vấn) để
  // danh sách thiếu đọc theo đúng thứ tự trên form.
  for (const field of input.requiredFields)
    if (isBlank(input.serviceData[field.fieldKey])) missing.push(field.label);

  return missing;
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `npm test -- order-completeness.spec`
Expected: PASS, 9 test.

- [ ] **Step 5: Thêm `requiredFieldsOf` vào validator**

Trong `src/modules/services/service-data.validator.ts`, thêm ngay cạnh `cargoFieldsOf`:

```ts
  /**
   * Bộ trường bắt buộc của một dịch vụ, cho tầng đơn hàng chấm "đã đủ chưa".
   * Tách khỏi validate(): validate() NÉM khi thiếu, còn ở đây cần ĐẾM xem thiếu
   * những gì mà không làm hỏng request.
   *
   * Khai kiểu trả về tại chỗ thay vì import RequiredField từ module orders:
   * orders vốn đã import ServiceDataValidator, import ngược lại sẽ tạo vòng
   * giữa hai module. TypeScript khớp theo cấu trúc nên hai kiểu vẫn tương thích.
   */
  async requiredFieldsOf(serviceId: number): Promise<{ fieldKey: string; label: string }[]> {
    return this.prisma.serviceField.findMany({
      where: { serviceId, isActive: true, isRequired: true },
      select: { fieldKey: true, label: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
```

**Không** import gì từ module `orders` vào file này.

- [ ] **Step 6: Kiểm tra biên dịch toàn dự án**

Run: `npx tsc --noEmit`
Expected: không lỗi. (Chạy `tsc --noEmit` chứ không chỉ chạy test — test chỉ biên dịch những file nó chạm tới.)

- [ ] **Step 7: Commit**

```bash
git add src/modules/orders/order-completeness.helper.ts src/modules/orders/order-completeness.spec.ts src/modules/services/service-data.validator.ts
git commit -m "feat(orders): missingOrderInfo - nguồn sự thật duy nhất cho đơn đủ thông tin"
```

---

### Task 4: `create()` dừng đơn form công khai ở `awaiting_info`

**Files:**
- Modify: `src/modules/orders/orders.service.ts:29-107` (hàm `create`)
- Test: `src/modules/orders/create-awaiting-info.spec.ts` (tạo mới)

**Interfaces:**
- Consumes: `missingOrderInfo`, `RequiredField` (Task 3); `OrderStatus.AWAITING_INFO` (Task 1)
- Produces: `create()` trả đơn `status='awaiting_info'` và **không** sinh `order_departments` khi `fromPublicForm` mà còn thiếu

- [ ] **Step 1: Viết test đỏ**

Tạo `src/modules/orders/create-awaiting-info.spec.ts`. Test dựng `OrdersService` với Prisma giả; `$transaction` nhận callback và gọi lại với chính đối tượng giả:

```ts
import { OrderStatus } from '@/common/enums';
import { OrdersService } from './orders.service';

/**
 * Đơn từ form báo giá công khai thiếu điểm đi lẫn điểm đến mà vẫn được gán
 * 'distributed' và phân cho phòng ban — phòng ban mở ra không có gì để báo giá.
 * Đây là hành vi đang sai trên production.
 */
function mk(deptCount: number) {
  const orderCreate = jest.fn().mockResolvedValue({ id: 77 });
  const deptCreateMany = jest.fn().mockResolvedValue({ count: deptCount });
  const tx = {
    $queryRaw: jest.fn()
      .mockResolvedValueOnce([{ today: new Date('2026-09-18') }])
      .mockResolvedValueOnce([{ no: 1 }])
      .mockResolvedValueOnce([{ code: 'RNT-260918-01' }]),
    customer: { create: jest.fn().mockResolvedValue({ id: 5 }) },
    department: { findMany: jest.fn().mockResolvedValue(
      Array.from({ length: deptCount }, (_, i) => ({ id: i + 1 })),
    ) },
    order: { create: orderCreate },
    orderDepartment: { createMany: deptCreateMany },
  };
  const prisma = {
    service: { findUnique: jest.fn().mockResolvedValue({ id: 3, name: 'Thuê xe', isActive: true, cargoFields: [] }) },
    order: { findUniqueOrThrow: jest.fn().mockResolvedValue({ code: 'RNT-260918-01', source: 'website' }) },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const serviceData = {
    assertCargoAllowed: jest.fn(),
    validate: jest.fn().mockResolvedValue({}),
    requiredFieldsOf: jest.fn().mockResolvedValue([]),
  };
  // Thứ tự tham số PHẢI khớp constructor thật (orders.service.ts:19-26):
  // prisma, activity, notify, query, customers, serviceData, customerNotify.
  const svc = new OrdersService(
    prisma as never,
    { log: jest.fn() } as never,
    { push: jest.fn(), adminsAndSales: jest.fn().mockResolvedValue([1]), deptRecipients: jest.fn().mockResolvedValue([9]) } as never,
    { detail: jest.fn().mockResolvedValue({ id: 77 }), findScoped: jest.fn() } as never,
    { findByName: jest.fn().mockResolvedValue(null) } as never,
    serviceData as never,
    { quoteRequestReceived: jest.fn() } as never,
  );
  return { svc, orderCreate, deptCreateMany, tx };
}

const publicDto = {
  serviceId: 3,
  newCustomer: { companyName: 'Khách lạ', phone: '0900000000' },
  source: 'website',
} as never;

const user = { id: 1 } as never;

describe('create() — đơn từ form công khai còn thiếu thông tin', () => {
  it('dừng ở awaiting_info thay vì distributed', async () => {
    const { svc, orderCreate } = mk(2);
    await svc.create(publicDto, user, { fromPublicForm: true });
    expect(orderCreate.mock.calls[0][0].data.status).toBe(OrderStatus.AWAITING_INFO);
  });

  /** Chặn ở đây mới là thứ giữ đơn thiếu dữ liệu ra khỏi hàng đợi phòng ban. */
  it('KHÔNG phân phối cho phòng ban', async () => {
    const { svc, deptCreateMany } = mk(2);
    await svc.create(publicDto, user, { fromPublicForm: true });
    expect(deptCreateMany).not.toHaveBeenCalled();
  });

  it('đủ thông tin thì vẫn chạy luồng cũ', async () => {
    const { svc, orderCreate, deptCreateMany } = mk(2);
    await svc.create(
      { ...publicDto, originProvince: 'Hà Nội', destinationProvince: 'Lào Cai' } as never,
      user, { fromPublicForm: true },
    );
    expect(orderCreate.mock.calls[0][0].data.status).toBe(OrderStatus.DISTRIBUTED);
    expect(deptCreateMany).toHaveBeenCalled();
  });

  /**
   * Nhân viên nhập tay qua cùng API này KHÔNG được rơi vào awaiting_info: họ đã
   * đi qua form admin vốn bắt buộc đủ trường.
   */
  it('đơn nội bộ (không fromPublicForm) không bao giờ vào awaiting_info', async () => {
    const { svc, orderCreate } = mk(2);
    await svc.create(publicDto, user);
    expect(orderCreate.mock.calls[0][0].data.status).toBe(OrderStatus.DISTRIBUTED);
  });
});
```

Nếu `npx tsc --noEmit` báo lệch kiểu ở lời gọi constructor, đọc lại
`src/modules/orders/orders.service.ts:19-26` và sửa thứ tự cho khớp.

- [ ] **Step 2: Chạy test, xác nhận đỏ đúng lý do**

Run: `npm test -- create-awaiting-info.spec`
Expected: FAIL ở test đầu — nhận `'distributed'` thay vì `'awaiting_info'`. Đây đúng là bug đang có trên production.

- [ ] **Step 3: Sửa `create()`**

Trong `src/modules/orders/orders.service.ts`, sau lệnh `const serviceData = await this.serviceData.validate(...)`:

```ts
    // Đơn từ form công khai được miễn trường bắt buộc (form cố tình tối giản),
    // nhưng "được miễn lúc ghi" không có nghĩa là "sẵn sàng cho phòng ban". Chấm
    // lại ở đây để biết đơn phải dừng chờ bổ sung hay chạy thẳng.
    // Chỉ chấm cho form công khai: đơn nội bộ đã đi qua form admin vốn bắt buộc
    // đủ trường, thêm một truy vấn nữa cho mọi đơn là trả giá vô ích.
    const missing = opts?.fromPublicForm
      ? missingOrderInfo({
        customerName: dto.newCustomer?.companyName ?? null,
        phone: dto.newCustomer?.phone ?? null,
        serviceId: dto.serviceId,
        originProvince: dto.originProvince ?? null,
        destinationProvince: dto.destinationProvince ?? null,
        serviceData: serviceData as Record<string, unknown>,
        requiredFields: await this.serviceData.requiredFieldsOf(dto.serviceId),
      })
      : [];
    const incomplete = missing.length > 0;
```

Trong transaction, thay lệnh tra phòng ban:

```ts
      // Đơn chờ bổ sung thì không tra định tuyến: không phòng nào được nhận nó.
      const depts = incomplete ? [] : await tx.department.findMany({
        where: { isActive: true, serviceIds: { has: dto.serviceId } },
        select: { id: true },
      });
```

và dòng trạng thái:

```ts
          status: incomplete
            ? OrderStatus.AWAITING_INFO
            : (depts.length ? OrderStatus.DISTRIBUTED : OrderStatus.NEW),
```

Câu `return` của transaction giữ nguyên — `missing` đã nằm ở scope ngoài transaction nên Task 5 dùng thẳng được, không cần trả kèm.

Thêm import: `import { missingOrderInfo } from './order-completeness.helper';`

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `npm test -- create-awaiting-info.spec`
Expected: PASS cả 4 test.

- [ ] **Step 5: Chạy toàn bộ test backend, bắt hồi quy**

Run: `npm test`
Expected: toàn bộ xanh. Đặc biệt `auto-convert-relaxed.spec` — nó khẳng định đơn form công khai vẫn tạo được khi thiếu trường bắt buộc; nếu nó đỏ vì **kỳ vọng status cũ**, cập nhật kỳ vọng và ghi lý do vào comment. Nếu đỏ vì đơn không tạo được nữa thì đó là hồi quy thật, phải sửa code.

- [ ] **Step 6: Kiểm tra độ dài file**

Run: `wc -l src/modules/orders/orders.service.ts`
Expected: dưới 300. Nếu vượt, tách phần chấm "đủ chưa" thành một private method hoặc đưa sang helper — không để file vượt mốc.

- [ ] **Step 7: Commit**

```bash
git add src/modules/orders/orders.service.ts src/modules/orders/create-awaiting-info.spec.ts
git commit -m "feat(orders): đơn form công khai thiếu thông tin dừng ở awaiting_info"
```

---

### Task 5: Thông báo nói rõ đơn thiếu những gì

**Files:**
- Modify: `src/modules/orders/new-order-notify.helper.ts:15-55`
- Modify: `src/modules/orders/orders.service.ts` (hàm `notifyNewOrder` + chỗ gọi trong `create`)
- Test: `src/modules/orders/new-order-notify.spec.ts` (file đã có — thêm describe mới)

**Interfaces:**
- Consumes: `missingOrderInfo` (Task 3)
- Produces: `NewOrderNotifyInput.missingInfo?: string[]`; `notifyNewOrder(orderId, deptIds, serviceName, missingInfo: string[])`

- [ ] **Step 1: Viết test đỏ**

Thêm vào `src/modules/orders/new-order-notify.spec.ts`:

```ts
describe('đơn chờ bổ sung thông tin', () => {
  const base = {
    orderId: 77, orderCode: 'RNT-260918-01', serviceName: 'Thuê xe',
    source: 'website', deptRecipientIds: [], staffIds: [1, 2], routed: false,
  };

  /**
   * Không được rơi vào nhánh "chưa định tuyến": dịch vụ VẪN có phòng phụ trách,
   * ta cố ý không phân. Báo sai nguyên nhân thì admin đi sửa cấu hình phòng ban
   * trong khi thứ cần làm là gọi cho khách hỏi điểm đi.
   */
  it('nói đúng nguyên nhân, không đổ cho định tuyến', () => {
    const rows = buildNewOrderRows({ ...base, missingInfo: ['Điểm đi', 'Điểm đến'] });
    expect(rows[0].title).toContain('cần bổ sung thông tin');
    expect(rows[0].title).not.toContain('chưa định tuyến');
  });

  it('liệt kê thẳng những trường còn thiếu', () => {
    const rows = buildNewOrderRows({ ...base, missingInfo: ['Điểm đi', 'Điểm đến'] });
    expect(rows[0].body).toContain('Điểm đi');
    expect(rows[0].body).toContain('Điểm đến');
  });

  it('báo cho admin và sale, mỗi người đúng một bản', () => {
    const rows = buildNewOrderRows({ ...base, missingInfo: ['Điểm đi'] });
    expect(rows.map((r) => r.userId).sort()).toEqual([1, 2]);
  });

  it('không thiếu gì thì giữ nguyên nội dung cũ', () => {
    const rows = buildNewOrderRows({ ...base, routed: true, deptRecipientIds: [9], missingInfo: [] });
    expect(rows[0].title).toBe('Đơn mới RNT-260918-01');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ đúng lý do**

Run: `npm test -- new-order-notify.spec`
Expected: FAIL — title là `'Đơn RNT-260918-01 chưa định tuyến'`, đúng cái nhãn sai mà test đang tố cáo.

- [ ] **Step 3: Thêm nhánh vào helper**

Trong `src/modules/orders/new-order-notify.helper.ts`, thêm vào interface:

```ts
  /**
   * Nhãn các trường đơn còn thiếu (từ missingOrderInfo). Có phần tử nghĩa là đơn
   * đang ở awaiting_info.
   */
  missingInfo?: string[];
```

và thêm nhánh **trước** nhánh `if (!routed)`:

```ts
  // Phải đứng TRƯỚC nhánh !routed: đơn chờ bổ sung cũng chưa định tuyến, nhưng
  // nguyên nhân khác hẳn — dịch vụ vẫn có phòng phụ trách, ta cố ý không phân.
  // Gộp vào một nhãn thì admin đi sửa cấu hình phòng ban trong khi việc cần làm
  // là gọi cho khách hỏi điểm đi.
  if (input.missingInfo?.length) {
    const thieu = input.missingInfo.join(', ');
    return input.staffIds.map((userId) =>
      row(
        userId,
        `Đơn ${orderCode} cần bổ sung thông tin`,
        `Dịch vụ "${serviceName}". Còn thiếu: ${thieu}.`,
      ),
    );
  }
```

- [ ] **Step 4: Truyền `missingInfo` từ `OrdersService`**

Đổi chữ ký:

```ts
  private async notifyNewOrder(
    orderId: number, deptIds: number[], serviceName: string, missingInfo: string[],
  ): Promise<void> {
```

truyền xuống `buildNewOrderRows({ ..., missingInfo })`, và ở cuối `create()`:

```ts
    await this.notifyNewOrder(orderId, deptIds, service.name, missing);
```

- [ ] **Step 5: Chạy test, xác nhận xanh**

Run: `npm test -- new-order-notify.spec create-awaiting-info.spec`
Expected: PASS cả hai file.

- [ ] **Step 6: Commit**

```bash
git add src/modules/orders/new-order-notify.helper.ts src/modules/orders/new-order-notify.spec.ts src/modules/orders/orders.service.ts
git commit -m "feat(notify): thông báo nêu rõ đơn còn thiếu trường nào"
```

---

### Task 6: `update()` tự thăng trạng thái khi đã đủ

**Files:**
- Modify: `src/modules/orders/orders.service.ts` (hàm `update` + private method mới)
- Test: `src/modules/orders/promote-awaiting-info.spec.ts` (tạo mới)

**Interfaces:**
- Consumes: `missingOrderInfo` (Task 3), `assertTransition` (Task 1), `notifyNewOrder` (Task 5)
- Produces: `private promoteIfComplete(orderId: number, user: AuthenticatedUser): Promise<void>`

- [ ] **Step 0: Cho `awaiting_info` vào danh sách sửa-không-cần-ghi-chú**

`update()` đòi `changeNote` với mọi trạng thái **ngoài** danh sách `beforeClose`
(`src/modules/orders/orders.service.ts:139-144`). `awaiting_info` không nằm trong
đó, nên nhân viên nhập nốt điểm đến sẽ bị chặn bằng thông báo *"Sửa đơn đã chốt
bắt buộc phải có ghi chú lý do"* — vô nghĩa với một đơn chưa chốt gì cả, và nó
chặn đúng thao tác mà cả tính năng này sinh ra để phục vụ.

```ts
    const beforeClose: string[] = [
      // Đơn chờ bổ sung chưa chốt gì cả — đòi ghi chú lý do ở đây là chặn đúng
      // thao tác mà trạng thái này sinh ra để phục vụ.
      OrderStatus.AWAITING_INFO,
      OrderStatus.NEW, OrderStatus.DISTRIBUTED, OrderStatus.QUOTING,
      OrderStatus.AWAITING_SELECTION, OrderStatus.AWAITING_CUSTOMER,
    ];
```

Thêm test cho đúng chỗ này vào file spec ở Step 1:

```ts
  /**
   * Trước khi sửa, update() đòi changeNote với mọi trạng thái ngoài beforeClose
   * và awaiting_info không có trong đó — nhân viên nhập nốt điểm đến bị chặn
   * bằng thông báo "Sửa đơn đã chốt bắt buộc phải có ghi chú lý do".
   */
  it('sửa đơn chờ bổ sung KHÔNG cần changeNote', async () => {
    const { svc } = mkPromote({
      status: OrderStatus.AWAITING_INFO,
      originProvince: 'Hà Nội', destinationProvince: null, deptCount: 2,
    });
    await expect(
      svc.update(77, { destinationProvince: 'Lào Cai' } as never, { id: 1 } as never),
    ).resolves.toBeDefined();
  });
```

- [ ] **Step 1: Viết test đỏ**

Tạo `src/modules/orders/promote-awaiting-info.spec.ts`:

```ts
import { OrderStatus } from '@/common/enums';

/**
 * Nhập nốt điểm đến rồi bấm Lưu mà đơn vẫn nằm trong hàng chờ thì nhân viên
 * không có cách nào đẩy nó đi tiếp — không có nút nào làm việc đó.
 *
 * Cố tình KHÔNG làm nút "Xác nhận đủ thông tin": thêm một bước thủ công là thêm
 * một chỗ để quên, và đơn sẽ nằm lại dù dữ liệu đã đủ.
 */
describe('promoteIfComplete — thoát awaiting_info khi đã đủ', () => {
  it('nhập đủ thì chuyển sang distributed và sinh order_departments', async () => {
    const { svc, orderUpdate, deptCreateMany } = mkPromote({
      status: OrderStatus.AWAITING_INFO,
      originProvince: 'Hà Nội', destinationProvince: 'Lào Cai', deptCount: 2,
    });
    await svc.update(77, { originProvince: 'Hà Nội' } as never, { id: 1 } as never);
    expect(orderUpdate.mock.calls.at(-1)?.[0].data.status).toBe(OrderStatus.DISTRIBUTED);
    expect(deptCreateMany).toHaveBeenCalled();
  });

  it('dịch vụ không có phòng nào thì chuyển sang new', async () => {
    const { svc, orderUpdate } = mkPromote({
      status: OrderStatus.AWAITING_INFO,
      originProvince: 'Hà Nội', destinationProvince: 'Lào Cai', deptCount: 0,
    });
    await svc.update(77, {} as never, { id: 1 } as never);
    expect(orderUpdate.mock.calls.at(-1)?.[0].data.status).toBe(OrderStatus.NEW);
  });

  it('còn thiếu thì ở nguyên awaiting_info', async () => {
    const { svc, orderUpdate } = mkPromote({
      status: OrderStatus.AWAITING_INFO,
      originProvince: 'Hà Nội', destinationProvince: null, deptCount: 2,
    });
    await svc.update(77, {} as never, { id: 1 } as never);
    const statuses = orderUpdate.mock.calls.map((c) => c[0].data.status).filter(Boolean);
    expect(statuses).not.toContain(OrderStatus.DISTRIBUTED);
  });

  /** Đơn đang báo giá dở KHÔNG được chạm tới — đây là chỗ dễ gây hồi quy nhất. */
  it('đơn không ở awaiting_info thì không đụng trạng thái', async () => {
    const { svc, orderUpdate, deptCreateMany } = mkPromote({
      status: OrderStatus.QUOTING,
      originProvince: 'Hà Nội', destinationProvince: 'Lào Cai', deptCount: 2,
    });
    await svc.update(77, {} as never, { id: 1 } as never);
    const statuses = orderUpdate.mock.calls.map((c) => c[0].data.status).filter(Boolean);
    expect(statuses).toEqual([]);
    expect(deptCreateMany).not.toHaveBeenCalled();
  });
});
```

Viết `mkPromote()` theo đúng khuôn `mk()` ở `create-awaiting-info.spec.ts`, thêm:
- `prisma.order.findUniqueOrThrow` trả `{ id: 77, status, serviceId: 3, originProvince, destinationProvince, serviceData: {}, customer: { companyName: 'A', phone: '090' }, service: { name: 'Thuê xe' } }`
- `query.findScoped` trả cùng đối tượng đó
- `serviceData.cargoFieldsOf` trả `[]`

- [ ] **Step 2: Chạy test, xác nhận đỏ đúng lý do**

Run: `npm test -- promote-awaiting-info.spec`
Expected: FAIL — hai test đầu đỏ vì `update()` chưa bao giờ đổi `status`.

- [ ] **Step 3: Viết `promoteIfComplete`**

Thêm vào `OrdersService`:

```ts
  /**
   * Đơn đang chờ bổ sung, vừa được sửa: chấm lại và nếu đã đủ thì chạy đúng bước
   * định tuyến mà create() chạy, rồi đi tiếp luồng cũ.
   *
   * Tự động, không có nút bấm: thêm một bước thủ công là thêm một chỗ để quên,
   * và đơn sẽ nằm lại trong hàng chờ dù dữ liệu đã đủ.
   *
   * Thoát sớm khi đơn không ở awaiting_info — đơn đang báo giá dở tuyệt đối
   * không được chạm vào.
   */
  private async promoteIfComplete(orderId: number, user: AuthenticatedUser): Promise<void> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        status: true, serviceId: true, originProvince: true, destinationProvince: true,
        serviceData: true,
        customer: { select: { companyName: true, phone: true } },
        service: { select: { name: true } },
      },
    });
    if (order.status !== OrderStatus.AWAITING_INFO) return;

    const missing = missingOrderInfo({
      customerName: order.customer?.companyName ?? null,
      phone: order.customer?.phone ?? null,
      serviceId: order.serviceId,
      originProvince: order.originProvince,
      destinationProvince: order.destinationProvince,
      serviceData: (order.serviceData ?? {}) as Record<string, unknown>,
      requiredFields: await this.serviceData.requiredFieldsOf(order.serviceId),
    });
    if (missing.length) return;

    const deptIds = await this.prisma.$transaction(async (tx) => {
      const depts = await tx.department.findMany({
        where: { isActive: true, serviceIds: { has: order.serviceId } },
        select: { id: true },
      });
      const next = depts.length ? OrderStatus.DISTRIBUTED : OrderStatus.NEW;
      assertTransition(order.status, next);
      await tx.order.update({
        where: { id: orderId }, data: { status: next, updatedAt: new Date() },
      });
      if (depts.length)
        await tx.orderDepartment.createMany({
          data: depts.map((d) => ({ orderId, departmentId: d.id })),
          // Đơn chờ bổ sung lẽ ra chưa có dòng nào, nhưng bảng có UNIQUE
          // (order_id, department_id) — đừng để một dòng sót làm hỏng cả lần thăng.
          skipDuplicates: true,
        });
      await this.activity.log(tx, {
        orderId, entity: 'orders', entityId: orderId, action: 'complete-info',
        actorId: user.id, detail: { status: [order.status, next] },
      });
      return depts.map((d) => d.id);
    });

    await this.notifyNewOrder(orderId, deptIds, order.service.name, []);
  }
```

Thêm import `assertTransition` nếu file chưa có.

- [ ] **Step 4: Gọi từ `update()`**

Ngay trước `return this.query.detail(id, user);` trong `update()`:

```ts
    // Sau khi ghi, không nằm trong transaction trên: việc thăng trạng thái có
    // transaction riêng và có bắn thông báo, không được giữ khóa DB trong lúc đó.
    await this.promoteIfComplete(id, user);
```

- [ ] **Step 5: Chạy test, xác nhận xanh**

Run: `npm test -- promote-awaiting-info.spec`
Expected: PASS cả 4 test.

- [ ] **Step 6: Chạy toàn bộ test và kiểm tra biên dịch**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: xanh cả ba. `wc -l src/modules/orders/orders.service.ts` phải dưới 300 — vượt thì tách `promoteIfComplete` sang file riêng `order-promote.helper.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/modules/orders/orders.service.ts src/modules/orders/promote-awaiting-info.spec.ts
git commit -m "feat(orders): nhập đủ thông tin thì đơn tự rời awaiting_info"
```

---

### Task 7: Admin — hằng số trạng thái, bản dịch, kanban, bộ lọc

**Files:**
- Modify: `E:\bee-transportation-fe\src\constants\orderStatus.ts`
- Modify: `E:\bee-transportation-fe\src\locales\vi.json`, `en.json`

**Interfaces:**
- Consumes: giá trị `'awaiting_info'` từ backend (Task 1)
- Produces: `OrderStatus.AwaitingInfo`; khoá dịch `orderStatus.awaitingInfo`

- [ ] **Step 1: Thêm vào hằng số**

Trong `src/constants/orderStatus.ts`:

```ts
export const OrderStatus = {
  AwaitingInfo: 'awaiting_info',
  New: 'new',
  // ... giữ nguyên
} as const;
```

Thêm vào **đầu** `ORDER_STATUS_SEQUENCE` (nó quyết định thứ tự cột kanban, và đây là bước đầu vòng đời):

```ts
export const ORDER_STATUS_SEQUENCE: readonly OrderStatus[] = [
  OrderStatus.AwaitingInfo,
  OrderStatus.New,
  // ... giữ nguyên
];
```

Thêm nhãn:

```ts
  [OrderStatus.AwaitingInfo]: 'orderStatus.awaitingInfo',
```

Thêm vào `CANCELLABLE_STATUSES` (huỷ được từ mọi nơi trừ ba trạng thái kết thúc):

```ts
export const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.AwaitingInfo,
  OrderStatus.New,
  // ... giữ nguyên
];
```

**KHÔNG** thêm vào `DEPT_WORKABLE_STATUSES`, `CLOSABLE_STATUSES` hay `REJECTABLE_STATUSES` — ba danh sách đó phản chiếu backend, và backend không cho phòng ban lẫn sale thao tác trên đơn chờ bổ sung. Thêm vào sẽ hiện nút mà bấm xong trả 409.

- [ ] **Step 2: Thêm bản dịch**

`src/locales/vi.json`, trong `orderStatus`:

```json
    "awaitingInfo": "Cần bổ sung thông tin",
```

`src/locales/en.json`:

```json
    "awaitingInfo": "Needs more info",
```

- [ ] **Step 3: Kiểm chứng bằng biên dịch**

Run: `npm run build`
Expected: thành công. `ORDER_STATUS_LABEL_KEY` là `Record<OrderStatus, string>` nên nếu quên nhãn, TypeScript sẽ báo thiếu khoá — đó là lưới an toàn ở đây, không cần test riêng.

- [ ] **Step 4: Xác nhận không còn khoá dịch nào bị thiếu**

Run:
```bash
node -e "const vi=require('./src/locales/vi.json'),en=require('./src/locales/en.json');const a=Object.keys(vi.orderStatus).sort(),b=Object.keys(en.orderStatus).sort();console.log(JSON.stringify(a)===JSON.stringify(b)?'KHOP':'LECH: '+a.filter(k=>!b.includes(k)))"
```
Expected: `KHOP`.

- [ ] **Step 5: Commit**

```bash
git add src/constants/orderStatus.ts src/locales/vi.json src/locales/en.json
git commit -m "feat(orders): cột và bộ lọc cho trạng thái Cần bổ sung thông tin"
```

---

### Task 8: Admin — số điện thoại bắt buộc và banner "còn thiếu"

**Files:**
- Modify: `E:\bee-transportation-fe\src\pages\orders\OrderCustomerPicker.tsx:96-105`
- Modify: `E:\bee-transportation-fe\src\pages\orders\CreateOrderPage.tsx:77-83` (`canSubmit`)
- Modify: `E:\bee-transportation-fe\src\pages\orders\detail\OrderOverviewTab.tsx`
- Modify: `src/locales/vi.json`, `en.json`

**Interfaces:**
- Consumes: `OrderStatus.AwaitingInfo` (Task 7); `missingRequiredFields()` và `useServiceSchema()` đã có sẵn trong admin
- Produces: không có gì cho task sau

- [ ] **Step 1: Bắt buộc số điện thoại**

Đây là chỗ lệch duy nhất giữa hai form: `QuoteForm.tsx` trên landing bắt buộc số điện thoại, admin thì không.

Trong `OrderCustomerPicker.tsx`, thêm `required` vào ô điện thoại giống ô tên công ty ở dòng 84:

```tsx
          label={t('customers.phone')}
          required
```

- [ ] **Step 2: Chặn ở nút Lưu**

Trong `CreateOrderPage.tsx`, thêm một dòng vào `canSubmit`:

```tsx
  const canSubmit =
    customer.companyName.trim() !== '' &&
    // Web bắt buộc số điện thoại; admin bỏ trống được thì cùng một khách gửi
    // qua hai đường sẽ ra hai chất lượng dữ liệu khác nhau.
    customer.phone.trim() !== '' &&
    serviceId !== '' &&
    route.originProvince !== '' &&
    route.destinationProvince !== '' &&
    schema !== null &&
    missingRequired.length === 0;
```

- [ ] **Step 3: Banner "còn thiếu" ở trang chi tiết**

Trong `OrderOverviewTab.tsx`, hiện một `Alert` khi đơn ở `awaiting_info`. Dùng lại đúng những thứ trang này đã có — không gọi thêm API, không định nghĩa lại luật:

`OrderOverviewTab.tsx:73` đã có sẵn `const { schema } = useServiceSchema(order.serviceId)`
— dùng lại chính nó, không thêm hook thứ hai.

`missingRequiredFields(fields, draft)` trả thẳng `string[]` **nhãn** (xem
`serviceDataValues.ts:68-76`), không phải mảng object — đừng `.map(f => f.label)`
lên kết quả.

```tsx
{order.status === OrderStatus.AwaitingInfo && (
  <Alert severity="warning" sx={{ mb: 2 }}>
    {t('orders.awaitingInfo.hint', {
      fields: [
        !order.originProvince && t('orders.fields.originProvince'),
        !order.destinationProvince && t('orders.fields.destinationProvince'),
        ...missingRequiredFields(schema?.fields ?? [], order.serviceData ?? {}),
      ].filter(Boolean).join(', '),
    })}
  </Alert>
)}
```

Import `OrderStatus` từ `@/constants/orderStatus`, `missingRequiredFields` từ
`../serviceDataValues`, và thêm `Alert` vào dòng import `@mui/material` đã có.

Nếu file vượt 300 dòng sau khi thêm, tách banner thành `detail/AwaitingInfoAlert.tsx` nhận `order` và `fields`.

- [ ] **Step 4: Thêm bản dịch**

`vi.json`, trong `orders`:

```json
    "awaitingInfo": {
      "hint": "Đơn này gửi từ form báo giá của khách nên còn thiếu: {{fields}}. Nhập đủ rồi lưu, đơn sẽ tự chuyển cho phòng ban."
    },
```

`en.json`:

```json
    "awaitingInfo": {
      "hint": "This order came from the customer quote form and is still missing: {{fields}}. Fill them in and save — it moves on to the departments automatically."
    },
```

- [ ] **Step 5: Kiểm chứng bằng biên dịch và lint**

Run: `npm run build && npm run lint`
Expected: xanh cả hai.

- [ ] **Step 6: Kiểm chứng bằng mắt trên máy thật**

Khởi động admin (`npm run dev`) trỏ vào backend local, rồi:
1. Gửi một yêu cầu qua `POST /quote-requests` không kèm điểm đi/điểm đến
2. Mở màn Đơn hàng — đơn phải nằm ở cột **Cần bổ sung thông tin**, không ở cột Đã phân phối
3. Mở đơn — thấy banner liệt kê đúng những trường thiếu
4. Nhập điểm đi, điểm đến, lưu — đơn phải tự nhảy sang **Đã phân phối**
5. Mở màn Tạo đơn hàng — bỏ trống số điện thoại, nút Lưu phải mờ

Bước 4 là bước quan trọng nhất: nó chứng minh cả chuỗi chạy thật chứ không chỉ test đơn vị xanh.

- [ ] **Step 7: Commit**

```bash
git add src/pages/orders/OrderCustomerPicker.tsx src/pages/orders/CreateOrderPage.tsx src/pages/orders/detail/OrderOverviewTab.tsx src/locales/vi.json src/locales/en.json
git commit -m "feat(orders): số điện thoại bắt buộc và banner cần bổ sung thông tin"
```

---

## Trước khi mở PR

- [ ] Backend: `npm test && npx tsc --noEmit && npm run lint` — xanh cả ba
- [ ] Admin: `npm run build && npm run lint` — xanh cả hai
- [ ] `scripts/check-migrations.sql` trên DB local: dòng `020` báo OK
- [ ] Mọi file chạm vào đều dưới 300 dòng
- [ ] Mô tả PR ghi rõ: **app nhân viên phải thêm nhãn cho `awaiting_info`**, nếu không đơn hiện trạng thái trống. Đây là thay đổi phá vỡ giao kèo, phải báo team mobile trước khi deploy.
- [ ] Mô tả PR ghi rõ: migration **không** đụng đơn cũ — đơn đang ở `distributed`/`quoting` giữ nguyên.
