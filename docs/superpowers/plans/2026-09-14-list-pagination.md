# Phân trang đồng nhất cho mọi API danh sách — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 15 endpoint danh sách còn trả mảng trần chuyển sang vỏ `PageResult`, hoàn thành quy ước QA-05 vốn đã đặt ra nhưng làm dở.

**Architecture:** Gộp sáu bản `clamp` sao chép thành một hàm dùng chung trong `pagination.dto.ts` (tiện thể vá lỗi `page` tràn `Int` gây 500 ở năm controller). Thêm nhà máy `PagedDto()` sinh lớp Swagger, thay cho việc chép tay cùng bốn field 27 lần. 12 endpoint có trần tự nhiên thì bọc `onePage()`; 3 endpoint lớn dần thì phân trang thật bằng `$transaction([count, findMany])`.

**Tech Stack:** NestJS 10 + Fastify, Prisma + PostgreSQL, `@nestjs/swagger`, jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-09-14-list-pagination-design.md`

## Global Constraints

- **Mọi file mã nguồn giữ dưới 300 dòng** (README.md:95).
- Tiếng Việt có dấu trong mọi chuỗi hiển thị và mọi comment trong `src/`.
- Import nội bộ dùng alias `@/` ở chỗ file đang dùng lối đó; khớp với file xung quanh chứ đừng trộn hai kiểu.
- Unit test thuần, Prisma giả cast `as unknown as PrismaService`. Repo không có test chạm DB.
- **Đây là thay đổi PHÁ hợp đồng API, đã được chủ dự án chốt.** Không giữ shape cũ, không thêm tham số opt-in, không làm giai đoạn chuyển tiếp.
- Lệnh: `npx jest <path>`, `npm run lint`, `npx tsc --noEmit`.
- Suite hiện tại: 26 suite / 219 test, tất cả xanh. Mỗi task phải giữ nó xanh.

---

### Task 1: Gộp `clamp` và vá lỗi `page` tràn

**Files:**
- Modify: `src/common/dto/pagination.dto.ts`
- Create: `src/common/dto/pagination.spec.ts`
- Modify: `src/modules/customers/customers.controller.ts:13-19,37`
- Modify: `src/modules/users/users.controller.ts:12-18,61-62`
- Modify: `src/modules/news/news.controller.ts:16-22,57,121`
- Modify: `src/modules/quote-requests/quote-request.controller.ts:25-31,93,120`
- Modify: `src/modules/notifications/notifications.controller.ts:13-19,68-69`
- Modify: `src/modules/customer-auth/customer-profile.controller.ts:24-40,168-169`

**Interfaces:**
- Consumes: không có (task đầu).
- Produces: `clamp(raw: string | undefined, fallback: number, lo: number, hi: number): number` và `MAX_PAGE = 1_000_000`, cả hai export từ `@/common/dto/pagination.dto`.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/common/dto/pagination.spec.ts`:

```ts
import { clamp, MAX_PAGE, onePage } from './pagination.dto';

describe('clamp — chuẩn hoá tham số phân trang từ query string', () => {
  /**
   * Ý đồ đã ghi trên cả sáu bản gốc: "số rác thì lấy mặc định thay vì ném 400".
   * Danh sách gõ sai tham số vẫn trả trang đầu, không chặn người dùng.
   */
  it.each([
    ['undefined', undefined, 7],
    ['chuỗi rỗng', '', 7],
    ['không phải số', 'abc', 7],
    ['số 0', '0', 7],
    ['số âm', '-5', 7],
    ['số thực', '1.5', 7],
  ])('%s thì rơi về mặc định', (_label, raw, expected) => {
    expect(clamp(raw as string | undefined, 7, 1, 100)).toBe(expected);
  });

  it('số hợp lệ thì giữ nguyên', () => {
    expect(clamp('3', 7, 1, 100)).toBe(3);
  });

  it('vượt trần thì cắt xuống trần', () => {
    expect(clamp('9999', 7, 1, 100)).toBe(100);
  });

  it('bằng đúng cận dưới thì được chấp nhận', () => {
    expect(clamp('1', 7, 1, 100)).toBe(1);
  });

  /**
   * Trước khi gộp, năm controller truyền Number.MAX_SAFE_INTEGER làm trần cho
   * page, nên skip = (page - 1) * limit vượt kiểu Int của Prisma và bật 500.
   */
  it('MAX_PAGE giữ skip trong tầm Int của Prisma', () => {
    const page = clamp(String(Number.MAX_SAFE_INTEGER), 1, 1, MAX_PAGE);
    expect(page).toBe(MAX_PAGE);
    expect((page - 1) * 100).toBeLessThan(2_147_483_647);
  });
});

describe('onePage', () => {
  it('bọc mảng thành một trang trọn vẹn', () => {
    expect(onePage(['a', 'b'])).toEqual({ items: ['a', 'b'], total: 2, page: 1, limit: 2 });
  });

  it('mảng rỗng cho limit 0, không phải mặc định bịa ra', () => {
    expect(onePage([])).toEqual({ items: [], total: 0, page: 1, limit: 0 });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx jest src/common/dto/pagination.spec.ts`
Expected: FAIL — `clamp` và `MAX_PAGE` chưa được export từ `pagination.dto.ts`.

- [ ] **Step 3: Thêm `clamp` và `MAX_PAGE` vào `pagination.dto.ts`**

Thêm vào cuối file:

```ts
/**
 * Trần cho `page`. Không có nó thì `?page=9007199254740991` cho
 * `skip = (page - 1) * limit` vượt kiểu `Int` của Prisma và bật 500 — đúng loại
 * lỗi mà `clamp` sinh ra để dập, nhưng năm controller lại truyền
 * `Number.MAX_SAFE_INTEGER` làm trần nên tự mở lại nó.
 */
export const MAX_PAGE = 1_000_000;

/**
 * Query string luôn là chuỗi; số rác thì lấy mặc định thay vì ném 400.
 *
 * Trước đây hàm này bị chép sáu lần với hai chữ ký (bản ba tham số hardcode
 * `lo = 1`, bản bốn tham số nhận `lo` rồi mọi điểm gọi đều truyền `1`) — cùng
 * một hành vi, sáu nơi phải nhớ sửa.
 */
export function clamp(
  raw: string | undefined,
  fallback: number,
  lo: number,
  hi: number,
): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < lo) return fallback;
  return Math.min(n, hi);
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx jest src/common/dto/pagination.spec.ts`
Expected: toàn bộ test trong file PASS.

- [ ] **Step 5: Xoá sáu bản `clamp` cục bộ và đổi điểm gọi**

Ở mỗi file dưới đây: xoá hàm `clamp` cục bộ cùng doc-comment của nó, thêm import, rồi đổi điểm gọi sang chữ ký bốn tham số. **Mọi `page` dùng `MAX_PAGE` làm trần** — đó là phần vá lỗi 500.

`src/modules/customers/customers.controller.ts` — xoá dòng 13-19, thêm `clamp, MAX_PAGE` vào import từ `@/common/dto/pagination.dto` (file đã import `PageResult` từ đó), dòng 37 thành:

```ts
    return this.customersService.search(q, clamp(page, 1, 1, MAX_PAGE), clamp(limit, 20, 1, 100));
```

`src/modules/users/users.controller.ts` — xoá dòng 12-18, thêm import, dòng 61-62 thành:

```ts
      clamp(page, 1, 1, MAX_PAGE),
      clamp(limit, 50, 1, 200),
```

`src/modules/news/news.controller.ts` — xoá dòng 16-22, thêm import, dòng 57 và 121 thành:

```ts
    return this.news.list(status, clamp(page, 1, 1, MAX_PAGE), clamp(limit, 20, 1, 100));
```

```ts
    return this.news.publicList(clamp(page, 1, 1, MAX_PAGE), clamp(limit, 20, 1, 100));
```

`src/modules/quote-requests/quote-request.controller.ts` — xoá dòng 25-31, thêm import, dòng 93 và 120 thành:

```ts
    return this.service.myList(customer.id, status, clamp(page, 1, 1, MAX_PAGE), clamp(limit, 20, 1, 100));
```

```ts
    return this.service.list(status, clamp(page, 1, 1, MAX_PAGE), clamp(limit, 50, 1, 200));
```

`src/modules/notifications/notifications.controller.ts` — xoá dòng 13-19, thêm import, dòng 68 thành `clamp(page, 1, 1, MAX_PAGE),` (dòng 69 giữ nguyên).

`src/modules/customer-auth/customer-profile.controller.ts` — xoá hàm `clamp` cục bộ và hằng `MAX_PAGE` cục bộ (dòng 24-40, giữ lại các doc-comment nào nói về chuyện khác), thêm import. Dòng 168-169 giữ nguyên vì đã đúng chữ ký.

- [ ] **Step 6: Chạy toàn bộ test + lint + kiểm không còn bản `clamp` cục bộ nào**

Run: `npm run lint && npx tsc --noEmit && npx jest && grep -rn "function clamp" src/`
Expected: sạch; **không test cũ nào đỏ** (219 test trước task này phải còn xanh, cộng
các test mới của task); `grep` **không ra kết quả nào** — còn bản `clamp` cục bộ nào
là chưa gộp xong.

- [ ] **Step 7: Commit**

```bash
git add src/common/dto src/modules/customers src/modules/users src/modules/news src/modules/quote-requests src/modules/notifications src/modules/customer-auth
git commit -m "refactor(pagination): gộp sáu bản clamp về một, vá lỗi page tràn Int"
```

---

### Task 2: Nhà máy `PagedDto()` thay cho các lớp chép tay

**Files:**
- Modify: `src/common/dto/pagination.dto.ts`
- Modify: `src/common/dto/pagination.spec.ts`
- Modify: 10 file DTO chứa 12 lớp `XxxPageDto` (liệt kê ở Step 5)

**Interfaces:**
- Consumes: `PageResult<T>` (đã có trong `pagination.dto.ts`).
- Produces: `PagedDto(item: Type<unknown> | typeof String, totalDescription?: string): Type<unknown>` export từ `@/common/dto/pagination.dto`. Dùng làm lớp cha: `export class XPageDto extends PagedDto(XDto) {}`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `src/common/dto/pagination.spec.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { PagedDto } from './pagination.dto';

class WidgetDto {
  @ApiProperty() id!: number;
}

class GadgetDto {
  @ApiProperty() name!: string;
}

describe('PagedDto — nhà máy sinh lớp vỏ phân trang cho Swagger', () => {
  it('lớp sinh ra khởi tạo được và có đúng bốn field', () => {
    class WidgetPageDto extends PagedDto(WidgetDto) {}
    const page = Object.assign(new WidgetPageDto(), {
      items: [{ id: 1 }], total: 1, page: 1, limit: 20,
    });
    expect(Object.keys(page).sort()).toEqual(['items', 'limit', 'page', 'total']);
  });

  /**
   * Swagger lấy TÊN LỚP làm tên schema. Mọi lớp sinh từ cùng một nhà máy mà
   * trùng tên thì các schema đè lên nhau và tài liệu API sai im lặng — không
   * một test nào khác trong repo bắt được chuyện đó.
   */
  it('hai lớp sinh từ hai kiểu khác nhau có tên khác nhau', () => {
    const A = PagedDto(WidgetDto);
    const B = PagedDto(GadgetDto);
    expect(A.name).not.toBe(B.name);
    expect(A.name).toContain('Widget');
    expect(B.name).toContain('Gadget');
  });

  /** Bốn endpoint reference/* trả string[], không phải lớp DTO. */
  it('nhận được kiểu nguyên thuỷ String', () => {
    const S = PagedDto(String);
    expect(typeof S).toBe('function');
    expect(S.name).toContain('String');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx jest src/common/dto/pagination.spec.ts`
Expected: FAIL — `PagedDto` chưa được export.

- [ ] **Step 3: Viết `PagedDto`**

Thêm vào `pagination.dto.ts` (cần `import { Type } from '@nestjs/common';` — lưu ý file đã import `Type` từ `class-transformer` cho `PaginationDto`, nên đặt bí danh: `import { Type as NestType } from '@nestjs/common';`):

```ts
/**
 * Swagger cần một LỚP CỤ THỂ cho mỗi vỏ phân trang — generic không dựng được
 * schema. Nhà máy này sinh lớp đó, thay cho việc chép tay cùng bốn field ở 12
 * nơi (và sẽ là 27 nơi sau đợt này).
 *
 * `Object.defineProperty` đặt lại `name` là BẮT BUỘC, không phải cho đẹp: mọi
 * lớp sinh ra đều mang cùng một tên, mà Swagger lấy tên lớp làm tên schema, nên
 * không đặt lại thì các schema đè lên nhau và tài liệu API sai im lặng.
 */
export function PagedDto(
  item: NestType<unknown> | typeof String,
  totalDescription?: string,
): NestType<unknown> {
  class Page {
    @ApiProperty({ type: [item] }) items!: unknown[];
    @ApiProperty(totalDescription ? { description: totalDescription } : {}) total!: number;
    @ApiProperty() page!: number;
    @ApiProperty() limit!: number;
  }
  Object.defineProperty(Page, 'name', { value: `Paged${item.name}` });
  return Page;
}
```

Thêm `ApiProperty` vào import từ `@nestjs/swagger` ở đầu file (file đang chỉ import `ApiPropertyOptional`).

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx jest src/common/dto/pagination.spec.ts`
Expected: toàn bộ test trong file PASS.

- [ ] **Step 5: Chuyển 12 lớp sẵn có sang nhà máy**

**Giữ nguyên tên lớp export** ở mọi chỗ — tên lớp là tên schema Swagger, đổi tên là đổi tài liệu API.

| File | Thay bằng |
|---|---|
| `src/modules/activity/activity.dto.ts:70-75` | `export class ActivityPageDto extends PagedDto(ActivityItemDto) {}` |
| `src/modules/customers/dto/customer.dto.ts:43-48` | `export class CustomerPageDto extends PagedDto(CustomerResponseDto) {}` |
| `src/modules/departments/dto/department.dto.ts:59-64` | `export class DepartmentPageDto extends PagedDto(DepartmentResponseDto) {}` |
| `src/modules/news/dto/news.dto.ts:85-90` | `export class NewsPageDto extends PagedDto(NewsArticleDto) {}` |
| `src/modules/news/dto/news.dto.ts:92-97` | `export class PublicNewsPageDto extends PagedDto(PublicNewsSummaryDto) {}` |
| `src/modules/quote-requests/dto/quote-request.dto.ts:77-82` | `export class QuoteRequestPageDto extends PagedDto(QuoteRequestDto) {}` |
| `src/modules/quotes/dto/quote.dto.ts:136-141` | `export class QueuePageDto extends PagedDto(QueueItemDto) {}` |
| `src/modules/services/dto/service-field.dto.ts:117-122` | `export class ServiceFieldPageDto extends PagedDto(ServiceFieldResponseDto) {}` |
| `src/modules/services/dto/service.dto.ts:81-86` | `export class ServicePageDto extends PagedDto(ServiceResponseDto) {}` |
| `src/modules/users/dto/user.dto.ts:76-81` | `export class UserPageDto extends PagedDto(UserResponseDto) {}` |

**Hai lớp có `description` riêng trên `total` — phải truyền tham số thứ hai, nếu không migration làm mất tài liệu:**

```ts
// src/modules/notifications/dto/notification.dto.ts:17-22
export class NotificationPageDto extends PagedDto(
  NotificationDto,
  'Tổng số thông báo khớp bộ lọc',
) {}

// src/modules/orders/dto/order-response.dto.ts:107-114 — giữ cả doc-comment QA-05 ở trên
export class OrderPageDto extends PagedDto(
  OrderListItemDto,
  'Tổng số đơn khớp bộ lọc, không phải số dòng trang này',
) {}
```

- [ ] **Step 6: Kiểm Swagger không vỡ**

Run: `npx tsc --noEmit && npm run start:dev`

Mở `http://localhost:8087/api/docs`, mở `GET /orders` và `GET /notifications`, xác nhận schema response vẫn hiện đủ bốn field và phần mô tả của `total` vẫn còn. Dừng server.

Nếu môi trường không mở được trình duyệt, thay bằng: `curl -s http://localhost:8087/api/docs-json | node -e "const s=JSON.parse(require('fs').readFileSync(0));console.log(JSON.stringify(s.components.schemas.OrderPageDto,null,2))"` và đối chiếu bằng mắt.

- [ ] **Step 7: Chạy toàn bộ test + lint**

Run: `npm run lint && npx tsc --noEmit && npx jest`
Expected: sạch; không test cũ nào đỏ.

- [ ] **Step 8: Commit**

```bash
git add src/common/dto src/modules/activity src/modules/customers src/modules/departments src/modules/news src/modules/notifications src/modules/orders src/modules/quote-requests src/modules/quotes src/modules/services src/modules/users
git commit -m "refactor(swagger): nhà máy PagedDto thay cho 12 lớp vỏ phân trang chép tay"
```

---

### Task 3: Bọc vỏ 12 endpoint có trần tự nhiên

**Files:**
- Modify: `src/modules/reference/reference.controller.ts` (4 endpoint)
- Modify: `src/modules/departments/departments.controller.ts:52-58`
- Modify: `src/modules/milestones/milestones.controller.ts:16-25`
- Modify: `src/modules/quotes/quotes.controller.ts:126-134`
- Modify: `src/modules/collab/collab.controller.ts:52-77` (2 endpoint)
- Modify: `src/modules/sale/sale.controller.ts:17-22,37-42`
- Modify: `src/modules/notifications/notifications.controller.ts:80-86`
- Modify: các file DTO tương ứng để thêm lớp `XxxPageDto`
- Create: `src/common/dto/one-page-endpoints.spec.ts`

**Interfaces:**
- Consumes: `onePage()` (đã có), `PagedDto()` (Task 2).
- Produces: không có gì cho task sau.

Đây là **12 thay đổi cùng một hình dạng**. Với mỗi endpoint: đổi kiểu trả về thành `PageResult<T>`, bọc lời gọi service trong `onePage(...)`, đổi `@ApiResponse({ type: [T] })` thành `@ApiResponse({ type: XPageDto })`. **Không thêm tham số truy vấn nào.**

- [ ] **Step 1: Viết test thất bại**

Tạo `src/common/dto/one-page-endpoints.spec.ts`. Test này kiểm hợp đồng chung của cả nhóm thay vì 12 bộ test gần như giống hệt nhau:

```ts
import { ReferenceController } from '@/modules/reference/reference.controller';

/**
 * Cả 12 endpoint nhóm này cùng một luật: bọc onePage(), total = số phần tử,
 * page = 1. Kiểm bốn endpoint reference/* là đủ đại diện vì chúng đồng bộ và
 * không cần dựng service giả; tám cái còn lại đi qua đúng một hàm onePage().
 */
describe('reference/* trả vỏ phân trang thay vì mảng trần', () => {
  const c = new ReferenceController();

  it('provinces trả vỏ, total khớp số phần tử', () => {
    const res = c.provinces();
    expect(Array.isArray(res)).toBe(false);
    expect(res.page).toBe(1);
    expect(res.total).toBe(res.items.length);
    expect(res.items).toContain('Hà Nội');
  });

  it('order-statuses trả vỏ', () => {
    const res = c.orderStatuses();
    expect(res.total).toBe(res.items.length);
    expect(res.items[0]).toHaveProperty('value');
    expect(res.items[0]).toHaveProperty('label');
  });

  it('reject-reasons trả vỏ', () => {
    const res = c.rejectReasons();
    expect(res.total).toBe(res.items.length);
  });

  it('order-sources trả vỏ', () => {
    const res = c.orderSources();
    expect(res.total).toBe(res.items.length);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx jest src/common/dto/one-page-endpoints.spec.ts`
Expected: FAIL — `res.page` là `undefined` vì controller còn trả mảng trần.

- [ ] **Step 3: Sửa `reference.controller.ts`**

Thêm import `import { onePage, PageResult, PagedDto } from '@/common/dto/pagination.dto';`, export `LabeledDto` (đang là lớp private trong file), thêm hai lớp vỏ rồi đổi bốn method:

```ts
export class StringPageDto extends PagedDto(String) {}
export class LabeledPageDto extends PagedDto(LabeledDto) {}
```

```ts
  @Get('provinces')
  @ApiOperation({ summary: 'Danh mục tỉnh/thành hợp lệ cho điểm đi / điểm đến' })
  @ApiResponse({ status: 200, type: StringPageDto })
  provinces(): PageResult<string> {
    return onePage([...PROVINCES]);
  }

  @Get('order-statuses')
  @ApiOperation({ summary: 'Trạng thái đơn kèm nhãn tiếng Việt' })
  @ApiResponse({ status: 200, type: LabeledPageDto })
  orderStatuses(): PageResult<LabeledDto> {
    return onePage(Object.values(OrderStatus).map((value) => ({ value, label: statusLabel(value) })));
  }

  @Get('reject-reasons')
  @ApiOperation({ summary: 'Nhóm lý do khách từ chối' })
  @ApiResponse({ status: 200, type: StringPageDto })
  rejectReasons(): PageResult<string> {
    return onePage([...REJECT_REASONS]);
  }

  @Get('order-sources')
  @ApiOperation({ summary: 'Nguồn đơn' })
  @ApiResponse({ status: 200, type: StringPageDto })
  orderSources(): PageResult<string> {
    return onePage(Object.values(OrderSource));
  }
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx jest src/common/dto/one-page-endpoints.spec.ts`
Expected: toàn bộ test trong file PASS.

- [ ] **Step 5: Sửa tám endpoint còn lại**

Cùng một khuôn: `async` giữ nguyên, bọc `onePage(await ...)`, đổi kiểu trả về, đổi `@ApiResponse`.

`src/modules/departments/departments.controller.ts` — thêm `DepartmentTreePageDto` vào `dto/department.dto.ts` (`export class DepartmentTreePageDto extends PagedDto(DepartmentTreeNodeDto) {}`):

```ts
  @ApiResponse({ status: 200, type: DepartmentTreePageDto })
  async tree(): Promise<PageResult<DepartmentTreeNodeDto>> {
    return onePage(await this.departmentsService.tree());
  }
```

`src/modules/milestones/milestones.controller.ts` — thêm `OrderMilestonePageDto` vào `orders/dto/order-response.dto.ts`:

```ts
  @ApiResponse({ status: 200, type: OrderMilestonePageDto })
  async list(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<OrderMilestoneDto>> {
    return onePage(await this.milestonesService.list(id, user));
  }
```

`src/modules/quotes/quotes.controller.ts` (reference-prices) — thêm
`export class ReferencePricePageDto extends PagedDto(ReferencePriceDto) {}` vào
`quotes/dto/quote.dto.ts`. Giữ nguyên mọi tham số và thân lời gọi, chỉ bọc kết quả:

```ts
  @ApiResponse({ status: 200, type: ReferencePricePageDto })
  async referencePrices(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<ReferencePriceDto>> {
    return onePage(await this.quotesService.referencePrices(id, user));
  }
```

Giữ nguyên tên method và danh sách tham số thực tế đang có trong file (đoạn trên là
khuôn, không phải bản chép nguyên văn) — chỉ đổi kiểu trả về, `@ApiResponse`, và
bọc `onePage(await ...)`.

`src/modules/collab/collab.controller.ts` (mentionables và files) — thêm vào DTO
của module collab:

```ts
export class MentionablePageDto extends PagedDto(MentionableUserDto) {}
export class FileMetaPageDto extends PagedDto(FileMetaDto) {}
```

```ts
  @ApiResponse({ status: 200, type: MentionablePageDto })
  async listMentionables(
    @Param('id', ParseIntPipe) id: number,
    @Query('departmentId') departmentId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<MentionableUserDto>> {
    return onePage(
      await this.commentsService.mentionables(
        id,
        departmentId === undefined ? undefined : Number(departmentId),
        user,
      ),
    );
  }

  @ApiResponse({ status: 200, type: FileMetaPageDto })
  async listFiles(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<FileMetaDto>> {
    return onePage(await this.filesService.list(id, user));
  }
```

**Chỉ đổi hai method `GET` này. `POST orders/:id/files` giữ nguyên** vì nó trả một
`FileMetaDto` đơn lẻ, không phải danh sách.

`src/modules/sale/sale.controller.ts` — thêm vào `sale/dto/sale.dto.ts`:

```ts
export class DepartmentRepresentativeGroupPageDto extends PagedDto(DepartmentRepresentativeGroupDto) {}
export class LandingRepresentativePageDto extends PagedDto(LandingRepresentativeDto) {}
```

```ts
  @ApiResponse({ status: 200, type: DepartmentRepresentativeGroupPageDto })
  async list(): Promise<PageResult<DepartmentRepresentativeGroupDto>> {
    return onePage(await this.saleService.listGrouped());
  }

  @ApiResponse({ status: 200, type: LandingRepresentativePageDto })
  async landing(): Promise<PageResult<LandingRepresentativeDto>> {
    return onePage(await this.saleService.landingList());
  }
```

**Không đổi `GET landing/representatives/:userId`** — đó là endpoint chi tiết một
bản ghi, không phải danh sách.

`src/modules/notifications/notifications.controller.ts` (my-tasks) — thêm `TaskPageDto` vào `notifications/dto/notification.dto.ts`:

```ts
  @ApiResponse({ status: 200, type: TaskPageDto })
  async myTasks(@CurrentUser() user: AuthenticatedUser): Promise<PageResult<TaskDto>> {
    return onePage(await this.notificationsService.myTasks(user));
  }
```

- [ ] **Step 6: Kiểm kích thước file và chạy toàn bộ**

Run: `npm run lint && npx tsc --noEmit && npx jest && wc -l src/modules/reference/reference.controller.ts src/modules/collab/collab.controller.ts src/modules/notifications/notifications.controller.ts`
Expected: sạch; không test cũ nào đỏ; mọi file dưới 300 dòng.

- [ ] **Step 7: Commit**

```bash
git add src/common/dto src/modules/reference src/modules/departments src/modules/milestones src/modules/quotes src/modules/collab src/modules/sale src/modules/notifications src/modules/orders
git commit -m "feat(api): bọc vỏ phân trang cho 12 danh sách có trần tự nhiên"
```

---

### Task 4: Phân trang thật cho `timeline` và `drill`

**Files:**
- Modify: `src/modules/orders/orders-query.service.ts:123-136`
- Modify: `src/modules/orders/orders.controller.ts:117-124`
- Modify: `src/modules/dashboard/drill.service.ts:76-84`
- Modify: `src/modules/dashboard/dashboard.controller.ts:127-138`
- Modify: `src/modules/dashboard/dto/*.dto.ts` (DrillFilterDto thêm `page`)
- Create: `src/modules/orders/timeline-pagination.spec.ts`

**Interfaces:**
- Consumes: `clamp`, `MAX_PAGE` (Task 1), `PagedDto` (Task 2).
- Produces: `OrdersQueryService.timeline(id, user, page, limit): Promise<PageResult<TimelineItemDto>>`; `DrillService.drill(user, f): Promise<PageResult<OrderListItemDto>>` với `f.page` mới.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/modules/orders/timeline-pagination.spec.ts`:

```ts
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { OrdersQueryService } from './orders-query.service';

const USER = { id: 1, roles: ['admin'], departmentId: null } as unknown as AuthenticatedUser;

function mk(total: number, rows: unknown[]) {
  const count = jest.fn().mockResolvedValue(total);
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = {
    order: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    activityLog: { count, findMany },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  } as unknown as PrismaService;
  const svc = new OrdersQueryService(prisma, { orderWhere: () => ({}) } as never);
  return { svc, count, findMany };
}

const ROW = { createdAt: new Date(), action: 'create', actor: { fullName: 'A' }, detail: null };

describe('OrdersQueryService.timeline — phân trang', () => {
  it('skip = (page - 1) * limit', async () => {
    const { svc, findMany } = mk(100, [ROW]);
    await svc.timeline(7, USER, 3, 20);
    expect(findMany.mock.calls[0][0].skip).toBe(40);
    expect(findMany.mock.calls[0][0].take).toBe(20);
  });

  /**
   * total PHẢI đến từ count(), không phải items.length. Lấy nhầm là FE tính ra
   * một trang duy nhất và nút "trang sau" biến mất — đúng cả lý do total tồn tại.
   */
  it('total lấy từ count, không phải số dòng của trang này', async () => {
    const { svc } = mk(234, [ROW]);
    const res = await svc.timeline(7, USER, 1, 20);
    expect(res.total).toBe(234);
    expect(res.items).toHaveLength(1);
  });

  it('giữ nguyên thứ tự thời gian tăng dần', async () => {
    const { svc, findMany } = mk(1, [ROW]);
    await svc.timeline(7, USER, 1, 20);
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
  });

  it('trang vượt quá dữ liệu trả items rỗng nhưng total vẫn thật', async () => {
    const { svc } = mk(5, []);
    const res = await svc.timeline(7, USER, 99, 20);
    expect(res.items).toEqual([]);
    expect(res.total).toBe(5);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx jest src/modules/orders/timeline-pagination.spec.ts`
Expected: FAIL — `timeline` chưa nhận `page`/`limit`.

- [ ] **Step 3: Sửa `timeline` trong `orders-query.service.ts`**

```ts
  async timeline(
    id: number,
    user: AuthenticatedUser,
    page: number,
    limit: number,
  ): Promise<PageResult<TimelineItemDto>> {
    await this.findScoped(id, user);
    const where = { orderId: id };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({
        where,
        include: { actor: { select: { fullName: true } } },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((a) => ({
        createdAt: a.createdAt,
        action: a.action,
        actorName: a.actor?.fullName ?? null,
        detail: a.detail,
      })),
      total,
      page,
      limit,
    };
  }
```

- [ ] **Step 4: Sửa điểm gọi ở `orders.controller.ts`**

Thêm `TimelinePageDto` vào `orders/dto/order-response.dto.ts` (`export class TimelinePageDto extends PagedDto(TimelineItemDto) {}`), rồi:

```ts
  @Get(':id/timeline')
  @ApiOperation({ summary: 'Dòng thời gian của đơn' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Mặc định 1' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Mặc định 20, tối đa 100' })
  @ApiResponse({ status: 200, type: TimelinePageDto })
  timeline(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PageResult<TimelineItemDto>> {
    return this.ordersQuery.timeline(id, user, clamp(page, 1, 1, MAX_PAGE), clamp(limit, 20, 1, 100));
  }
```

Giữ nguyên `@ApiOperation` summary sẵn có nếu nó khác chuỗi trên.

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npx jest src/modules/orders/timeline-pagination.spec.ts`
Expected: toàn bộ test trong file PASS.

- [ ] **Step 6: Sửa `drill`**

`DrillFilterDto` **đã có `limit`** — thêm `page`, không đẻ tham số thứ hai trùng nghĩa:

```ts
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;
```

`drill.service.ts`:

```ts
  async drill(user: AuthenticatedUser, f: DrillFilterDto): Promise<PageResult<OrderListItemDto>> {
    const where = this.where(user, f);
    // Giữ đúng trần 500 của bản cũ (`take: f.limit ?? 500`) để không thu hẹp
    // hành vi sẵn có của màn drill-down.
    const limit = Math.min(f.limit ?? 50, 500);
    const page = f.page ?? 1;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map((r) => toListItem(r, user)), total, page, limit };
  }
```

`dashboard.controller.ts` đổi kiểu trả về thành `Promise<PageResult<OrderListItemDto>>` và `@ApiResponse` sang `OrderPageDto` (lớp đã có sẵn ở `orders/dto/order-response.dto.ts`).

**Không đụng `drill.service.ts:90` (`exportExcel`)** — nó lấy `take: 5000` cho file Excel, không phải danh sách phân trang.

- [ ] **Step 7: Chạy toàn bộ test + lint**

Run: `npm run lint && npx tsc --noEmit && npx jest`
Expected: sạch; không test cũ nào đỏ.

- [ ] **Step 8: Commit**

```bash
git add src/modules/orders src/modules/dashboard
git commit -m "feat(api): phân trang thật cho timeline đơn và drill-down dashboard"
```

---

### Task 5: Phân trang thật cho `comments`, POST trả trang cuối

**Files:**
- Modify: `src/modules/collab/comments.service.ts:43-70,113`
- Modify: `src/modules/collab/collab.controller.ts:31-50`
- Modify: DTO của module collab (thêm `CommentPageDto`)
- Create: `src/modules/collab/comments-pagination.spec.ts`

**Interfaces:**
- Consumes: `clamp`, `MAX_PAGE` (Task 1), `PagedDto` (Task 2).
- Produces: `CommentsService.list(orderId, user, page, limit): Promise<PageResult<CommentDto>>` và `CommentsService.create(orderId, dto, user): Promise<PageResult<CommentDto>>` (trang cuối).

**Đây là task duy nhất có phán đoán thật.** `create()` kết thúc bằng `return this.list(orderId, user)` (`comments.service.ts:113`), và luồng sắp `createdAt: 'asc'` nên bình luận vừa viết nằm ở **trang cuối**. Trả trang đầu là người dùng viết xong không thấy bình luận của chính mình.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/modules/collab/comments-pagination.spec.ts`:

```ts
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotifyService } from '@/modules/notifications/notify.service';
import { CommentsService } from './comments.service';

const USER = {
  id: 1, fullName: 'Sale A', roles: ['admin'], departmentId: null,
} as unknown as AuthenticatedUser;

const ROW = {
  id: 1, kind: 'comment', body: 'x', departmentId: null, department: null,
  userId: 1, user: { fullName: 'Sale A' }, createdAt: new Date(), mentions: [],
};

function mk(total: number, rows: unknown[] = [ROW]) {
  const count = jest.fn().mockResolvedValue(total);
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = {
    order: { findFirst: jest.fn().mockResolvedValue({ id: 7, createdBy: 1, departmentId: null }) },
    comment: { count, findMany, create: jest.fn().mockResolvedValue({ id: 9 }) },
    orderDepartment: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  } as unknown as PrismaService;
  const svc = new CommentsService(
    prisma,
    { orderWhere: () => ({}) } as never,
    { push: jest.fn().mockResolvedValue(undefined), deptRecipients: jest.fn().mockResolvedValue([]) } as unknown as NotifyService,
  );
  return { svc, count, findMany };
}

describe('CommentsService.list — phân trang', () => {
  it('skip = (page - 1) * limit', async () => {
    const { svc, findMany } = mk(100);
    await svc.list(7, USER, 3, 20);
    expect(findMany.mock.calls[0][0].skip).toBe(40);
    expect(findMany.mock.calls[0][0].take).toBe(20);
  });

  it('total lấy từ count, không phải số dòng trang này', async () => {
    const { svc } = mk(87);
    const res = await svc.list(7, USER, 1, 20);
    expect(res.total).toBe(87);
  });

  it('giữ thứ tự thời gian tăng dần — luồng hội thoại đọc từ cũ tới mới', async () => {
    const { svc, findMany } = mk(1);
    await svc.list(7, USER, 1, 20);
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
  });
});

/**
 * Luồng sắp asc nên bình luận vừa viết ở TRANG CUỐI. Trả trang đầu là người dùng
 * viết xong không thấy bình luận của chính mình — đúng thứ dễ sai nhất khi phân
 * trang một luồng hội thoại.
 */
describe('CommentsService.create — trả về trang cuối', () => {
  it('87 bình luận, limit 20 thì trả trang 5', async () => {
    const { svc, findMany } = mk(87);
    const res = await svc.create(7, { body: 'hi' } as never, USER);
    expect(res.page).toBe(5);
    expect(findMany.mock.calls[0][0].skip).toBe(80);
  });

  it('chia hết thì không đẻ thêm trang rỗng — 40 bình luận, limit 20, ra trang 2', async () => {
    const { svc } = mk(40);
    const res = await svc.create(7, { body: 'hi' } as never, USER);
    expect(res.page).toBe(2);
  });

  it('luồng rỗng trước đó vẫn ra trang 1, không phải trang 0', async () => {
    const { svc } = mk(1);
    const res = await svc.create(7, { body: 'hi' } as never, USER);
    expect(res.page).toBe(1);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx jest src/modules/collab/comments-pagination.spec.ts`
Expected: FAIL — `list` chưa nhận `page`/`limit`.

- [ ] **Step 3: Sửa `list` trong `comments.service.ts`**

```ts
  async list(
    orderId: number,
    user: AuthenticatedUser,
    page: number,
    limit: number,
  ): Promise<PageResult<CommentDto>> {
    const order = await this.scopedOrder(orderId, user);
    const where = { AND: [{ orderId }, this.threadFilter(user, order)] };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.comment.count({ where }),
      this.prisma.comment.findMany({
        where,
        include: { user: { select: { fullName: true } }, department: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((c) => ({
        id: c.id,
        kind: c.kind,
        body: c.body,
        departmentId: c.departmentId,
        departmentName: c.department?.name ?? null,
        authorId: c.userId,
        authorName: c.user.fullName,
        mentions: c.mentions,
        createdAt: c.createdAt,
      })),
      total,
      page,
      limit,
    };
  }
```

Phép map giữ **nguyên văn** bản cũ (`comments.service.ts:50-60`) — không đổi một
field nào. Chỉ có vỏ bên ngoài đổi.

- [ ] **Step 4: Sửa `create` trả trang cuối**

Thay `return this.list(orderId, user);` (dòng 113) bằng:

```ts
    // Luồng sắp theo thời gian TĂNG DẦN nên bình luận vừa viết nằm ở trang cuối.
    // Trả trang đầu là người viết xong không thấy bình luận của chính mình.
    const limit = COMMENT_PAGE_SIZE;
    const total = await this.prisma.comment.count({
      where: { AND: [{ orderId }, this.threadFilter(user, order)] },
    });
    const lastPage = Math.max(1, Math.ceil(total / limit));
    return this.list(orderId, user, lastPage, limit);
```

Khai báo hằng ở đầu file, cạnh các hằng sẵn có:

```ts
/** Mặc định của GET, dùng lại cho trang cuối mà POST trả về — hai bên phải khớp. */
const COMMENT_PAGE_SIZE = 20;
```

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npx jest src/modules/collab/comments-pagination.spec.ts`
Expected: toàn bộ test trong file PASS.

- [ ] **Step 6: Sửa `collab.controller.ts`**

Thêm `CommentPageDto` vào DTO của module collab. Hai method:

```ts
  @Get('orders/:id/comments')
  @ApiOperation({ summary: 'Bình luận — đã lọc theo luồng người gọi được xem' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Mặc định 1' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Mặc định 20, tối đa 100' })
  @ApiResponse({ status: 200, type: CommentPageDto })
  listComments(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PageResult<CommentDto>> {
    return this.commentsService.list(id, user, clamp(page, 1, 1, MAX_PAGE), clamp(limit, 20, 1, 100));
  }

  @Post('orders/:id/comments')
  @ApiOperation({
    summary: 'Viết bình luận, kèm @mention',
    description: 'Trả về TRANG CUỐI của luồng — nơi chứa bình luận vừa viết.',
  })
  @ApiResponse({ status: 201, type: CommentPageDto })
  createComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<CommentDto>> {
    return this.commentsService.create(id, dto, user);
  }
```

- [ ] **Step 7: Chạy toàn bộ test + lint + kiểm kích thước file**

Run: `npm run lint && npx tsc --noEmit && npx jest && wc -l src/modules/collab/comments.service.ts src/modules/collab/collab.controller.ts`
Expected: sạch; không test cũ nào đỏ; cả hai file dưới 300 dòng.

- [ ] **Step 8: Kiểm thủ công đầu-cuối**

```bash
npm run start:dev
```

Mở `http://localhost:8087/api/docs`, xác nhận: `GET /reference/provinces` hiện schema `PagedString` thay vì `string[]`; `GET /orders/{id}/timeline` có hai tham số `page`/`limit`; `POST /orders/{id}/comments` mô tả rõ trả trang cuối. Dừng server.

- [ ] **Step 9: Commit**

```bash
git add src/modules/collab
git commit -m "feat(collab): phân trang bình luận, POST trả trang cuối chứa bình luận vừa viết"
```

---

## Ghi chú cho người thực hiện

**Hai endpoint KHÔNG phân trang thật dù trông giống:**

- `GET /orders/:id/files` — `FilesService.list` (`files.service.ts:69-83`) đọc cột JSON `orders.files` và `order_milestones.files` rồi gộp trong JS. Không có hàng nào để `skip`/`take`. Chỉ bọc `onePage()` (Task 3).
- `GET /notifications/my-tasks` — đã có `take: 50` ở mỗi trong hai nhánh vai trò rồi gộp trong JS (`notifications.service.ts:77-126`), tối đa 100 mục. Chỉ bọc `onePage()` (Task 3).

Cả hai đã được xác minh bằng cách đọc service, không phải suy từ chữ ký controller. Nếu trong lúc làm thấy có vẻ phân trang thật được, hãy đọc lại service trước khi đổi hướng.

**Test hồi quy:** bất kỳ test nào đang assert trên mảng trần của 15 endpoint này đều phải sửa sang `.items`. Chạy `npx jest` sau mỗi task để bắt sớm.
