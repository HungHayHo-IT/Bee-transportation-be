# Sơ đồ tổ chức + chuyển đơn nội bộ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phòng ban có cấu trúc cây nhiều tầng vẽ được thành sơ đồ tổ chức, và cho trưởng phòng chuyển một đơn sang phòng khác trong một thao tác.

**Architecture:** Thêm `parent_id` tự tham chiếu vào `departments`, dựng cây trong bộ nhớ bằng hàm thuần. Chuyển đơn là một endpoint mới đóng dòng phòng nguồn (`passed`) và mở dòng phòng đích (`pending`) trong cùng một transaction, thứ tự đã cố định để `settleCheck` không bắn thông báo `ALL_PASSED` sai.

**Tech Stack:** BE — NestJS 11, Prisma, PostgreSQL, Jest. FE — React 19, Vite, MUI v7, react-i18next, axios.

**Spec:** `docs/superpowers/specs/2026-09-04-org-chart-and-internal-transfer-design.md`

## Global Constraints

- Hai repo: BE `E:\beeops-backend`, FE `E:\bee-transportation-fe`. Mỗi repo commit riêng.
- Migration là **file SQL viết tay** trong `db/migrations/`, đánh số tăng dần, **idempotent**, mở `BEGIN;` đóng `COMMIT;`, có khối chú thích đầu file kèm lệnh chạy. Repo **không dùng `prisma migrate`** — `prisma/schema.prisma` và `db/schema.sql` phải sửa tay cho khớp.
- Không thêm `DeptState` mới. Phòng đã chuyển đi vẫn là `passed`.
- Bình luận trong mã BE viết tiếng Việt (theo lối hiện có); mã FE viết tiếng Anh (theo lối hiện có).
- FE **không có bộ chạy test** — không viết test FE, không dựng vitest/jest trong đợt này.
- Lệnh test BE: `npm test -- <đường dẫn>`. Lint BE: `npm run lint`. Build FE: `npm run build`.
- Mọi chuỗi hiển thị trên FE đi qua i18n, thêm vào **cả** `src/locales/vi.json` và `src/locales/en.json`.

---

## File Structure

**Backend (`E:\beeops-backend`)**

| File | Trách nhiệm |
|---|---|
| `db/migrations/005-department-parent.sql` | Tạo (create) — thêm cột `parent_id` + FK + index |
| `db/schema.sql` | Sửa — DDL `departments` cho khớp |
| `prisma/schema.prisma` | Sửa — self-relation `DeptTree` |
| `src/modules/departments/department-tree.helper.ts` | Tạo — hàm thuần `detectCycle`, `buildTree` |
| `src/modules/departments/department-tree.helper.spec.ts` | Tạo — test cho helper |
| `src/modules/departments/dto/department.dto.ts` | Sửa — `parentId`, `DepartmentTreeNodeDto`, `DepartmentMemberDto` |
| `src/modules/departments/departments.service.ts` | Sửa — kiểm chu trình, chặn vô hiệu hoá phòng còn con, `tree()` |
| `src/modules/departments/departments.controller.ts` | Sửa — `GET /departments/tree` |
| `src/modules/quotes/dto/quote.dto.ts` | Sửa — `TransferDto`, `QueueItemDto.participatingDeptIds` |
| `src/modules/quotes/queue.service.ts` | Sửa — trả `participatingDeptIds` |
| `src/modules/quotes/quotes.service.ts` | Sửa — `transfer()` |
| `src/modules/quotes/quotes.controller.ts` | Sửa — `POST .../transfer` |
| `src/modules/quotes/transfer.service.spec.ts` | Tạo — test cho `transfer()` |

**Frontend (`E:\bee-transportation-fe`)**

| File | Trách nhiệm |
|---|---|
| `src/types/organisation.ts` | Sửa — `DepartmentTreeNode`, `parentId` |
| `src/types/queue.ts` | Sửa — `participatingDeptIds` |
| `src/services/apiEndpoints.ts` | Sửa — `DEPARTMENT_TREE`, `TRANSFER` |
| `src/services/organisationService.ts` | Sửa — `fetchDepartmentTree` |
| `src/services/queueService.ts` | Sửa — `transferOrder`, `participatingDeptIds` |
| `src/pages/orders/transferTargets.ts` | Tạo — hàm thuần làm phẳng cây + lọc phòng đích |
| `src/pages/orders/TransferDialog.tsx` | Tạo — hộp thoại chọn phòng + lý do |
| `src/pages/orders/QueueRow.tsx` | Sửa — nút "Chuyển phòng" |
| `src/pages/orders/QueuePage.tsx` | Sửa — nối hộp thoại |
| `src/pages/admin/OrgChartPage.tsx` | Tạo — trang sơ đồ tổ chức |
| `src/pages/admin/OrgChartNode.tsx` | Tạo — một nút cây, đệ quy |
| `src/routes/routePaths.ts`, `src/routes/AppRoutes.tsx`, `src/layouts/components/useMenuItems.ts` | Sửa — route + menu |
| `src/pages/admin/DepartmentsPage.tsx` (form phòng ban) | Sửa — ô chọn "Thuộc khối" |
| `src/locales/vi.json`, `src/locales/en.json` | Sửa — chuỗi mới |

---

## Task 1: Hàm thuần dựng cây phòng ban

**Files:**
- Create: `src/modules/departments/department-tree.helper.ts`
- Test: `src/modules/departments/department-tree.helper.spec.ts`

**Interfaces:**
- Consumes: không có (hàm thuần, không phụ thuộc task nào)
- Produces:
  - `DeptTreeInput = { id: number; name: string; parentId: number | null; managerId: number | null; managerName: string | null; isActive: boolean; members: DeptTreeMember[] }`
  - `DeptTreeMember = { id: number; fullName: string; roles: string[] }`
  - `DeptTreeNode = DeptTreeInput & { children: DeptTreeNode[] }`
  - `buildTree(rows: DeptTreeInput[]): DeptTreeNode[]`
  - `detectCycle(id: number, parentId: number, parentOf: ReadonlyMap<number, number | null>): boolean`

- [ ] **Step 1: Viết test đỏ**

Tạo `src/modules/departments/department-tree.helper.spec.ts`:

```ts
import { buildTree, detectCycle, DeptTreeInput } from './department-tree.helper';

const mk = (id: number, name: string, parentId: number | null): DeptTreeInput => ({
  id, name, parentId, managerId: null, managerName: null, isActive: true, members: [],
});

/** Ban Vận hành (1) > Phòng Nội địa (2) > Tổ Miền Bắc (4); Phòng Quốc tế (3) cùng cấp với 2. */
const ROWS = [mk(2, 'Phòng Nội địa', 1), mk(4, 'Tổ Miền Bắc', 2), mk(1, 'Ban Vận hành', null), mk(3, 'Phòng Quốc tế', 1)];

describe('buildTree', () => {
  it('dựng đúng nhiều tầng dù dữ liệu vào không theo thứ tự', () => {
    const roots = buildTree(ROWS);
    expect(roots.map((r) => r.id)).toEqual([1]);
    expect(roots[0].children.map((c) => c.id)).toEqual([2, 3]);
    expect(roots[0].children[0].children.map((c) => c.id)).toEqual([4]);
  });

  it('xếp các nút cùng cấp theo tên', () => {
    const roots = buildTree([mk(1, 'Ban B', null), mk(2, 'Ban A', null)]);
    expect(roots.map((r) => r.name)).toEqual(['Ban A', 'Ban B']);
  });

  /** Cha bị xoá thì phòng con vẫn phải hiện — biến mất khỏi sơ đồ là mất dữ liệu trong mắt người dùng. */
  it('phòng mồ côi hiện như một gốc thay vì biến mất', () => {
    const roots = buildTree([mk(1, 'Ban Vận hành', null), mk(9, 'Phòng lạc', 404)]);
    expect(roots.map((r) => r.id).sort()).toEqual([1, 9]);
  });

  it('không nhân bản: mỗi phòng xuất hiện đúng một lần', () => {
    const count = (ns: ReturnType<typeof buildTree>): number =>
      ns.reduce((n, x) => n + 1 + count(x.children), 0);
    expect(count(buildTree(ROWS))).toBe(ROWS.length);
  });
});

describe('detectCycle', () => {
  const parentOf = new Map<number, number | null>([[1, null], [2, 1], [4, 2]]);

  it('tự làm cha chính mình là chu trình', () => {
    expect(detectCycle(2, 2, parentOf)).toBe(true);
  });

  it('cho cháu làm cha của ông là chu trình', () => {
    expect(detectCycle(1, 4, parentOf)).toBe(true);
  });

  it('gắn vào một nhánh khác thì không phải chu trình', () => {
    expect(detectCycle(3, 4, parentOf)).toBe(false);
  });

  /** Dữ liệu hỏng sẵn trong DB không được làm treo tiến trình. */
  it('dừng lại khi chuỗi cha đã sẵn vòng lặp', () => {
    const broken = new Map<number, number | null>([[7, 8], [8, 7]]);
    expect(detectCycle(9, 7, broken)).toBe(false);
  });
});

```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `npm test -- src/modules/departments/department-tree.helper.spec.ts`
Expected: FAIL — `Cannot find module './department-tree.helper'`

- [ ] **Step 3: Viết implementation**

Tạo `src/modules/departments/department-tree.helper.ts`:

```ts
/** Chỉ những gì sơ đồ tổ chức cần vẽ — không email, không điện thoại. */
export interface DeptTreeMember {
  id: number;
  fullName: string;
  roles: string[];
}

export interface DeptTreeInput {
  id: number;
  name: string;
  parentId: number | null;
  managerId: number | null;
  managerName: string | null;
  isActive: boolean;
  members: DeptTreeMember[];
}

export interface DeptTreeNode extends DeptTreeInput {
  children: DeptTreeNode[];
}

/**
 * Dựng cây trong bộ nhớ. Số phòng đếm bằng chục nên không cần đệ quy SQL.
 *
 * Phòng có parentId trỏ tới phòng không tồn tại được coi là GỐC. Bỏ nó đi thì
 * cả nhánh biến mất khỏi màn hình mà không ai biết vì sao — mất dữ liệu trong
 * mắt người dùng, tệ hơn nhiều so với một nút hiện sai chỗ.
 */
export function buildTree(rows: readonly DeptTreeInput[]): DeptTreeNode[] {
  const nodes = new Map<number, DeptTreeNode>(
    rows.map((r) => [r.id, { ...r, children: [] }]),
  );
  const roots: DeptTreeNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (list: DeptTreeNode[]): DeptTreeNode[] => {
    list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    for (const n of list) sort(n.children);
    return list;
  };
  return sort(roots);
}

/**
 * Gắn `id` vào dưới `parentId` có tạo ra vòng không?
 *
 * Đi ngược chuỗi cha từ parentId lên: gặp lại `id` là vòng. `seen` không phải
 * để tối ưu — nếu DB đã có sẵn một vòng do dữ liệu hỏng, thiếu nó thì hàm chạy
 * mãi không dừng.
 */
export function detectCycle(
  id: number,
  parentId: number,
  parentOf: ReadonlyMap<number, number | null>,
): boolean {
  const seen = new Set<number>();
  let cursor: number | null | undefined = parentId;
  while (cursor !== null && cursor !== undefined) {
    if (cursor === id) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = parentOf.get(cursor);
  }
  return false;
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `npm test -- src/modules/departments/department-tree.helper.spec.ts`
Expected: PASS — 7 test.

- [ ] **Step 5: Commit**

```bash
git add src/modules/departments/department-tree.helper.ts src/modules/departments/department-tree.helper.spec.ts
git commit -m "feat(org): hàm thuần dựng cây phòng ban và bắt chu trình"
```

---

## Task 2: Migration + schema cho `parent_id`

**Files:**
- Create: `db/migrations/005-department-parent.sql`
- Modify: `db/schema.sql:12-22`, `prisma/schema.prisma:13-30`

**Interfaces:**
- Consumes: không có
- Produces: cột `departments.parent_id int NULL`; trường Prisma `Department.parentId`, quan hệ `parent` / `children` tên `"DeptTree"`

- [ ] **Step 1: Viết file migration**

Tạo `db/migrations/005-department-parent.sql`:

```sql
-- 005 — Cây phòng ban: thêm parent_id để vẽ sơ đồ tổ chức nhiều tầng
-- Chạy:
--   docker compose -f docker-compose.vm.yml exec -T db \
--     psql -U beeops -d beeops -v ON_ERROR_STOP=1 -f - < db/migrations/005-department-parent.sql
--
-- departments trước nay là bảng phẳng: chỉ có manager_id trỏ tới một user. Doanh
-- nghiệp có nhiều khối (Ban -> Phòng -> Tổ) nhưng cấu trúc đó không nằm ở đâu cả.
--
-- Cột cho phép NULL nên mọi phòng đang có đều thành GỐC sau khi chạy — không đơn
-- nào, không định tuyến nào đổi nghĩa. FK ON DELETE SET NULL: xoá phòng cha thì
-- phòng con nổi lên thành gốc thay vì bị xoá lây.
--
-- Chống chu trình làm ở tầng service (department-tree.helper.ts), không phải ở DB:
-- Postgres không có ràng buộc kiểm tra được điều đó mà không cần trigger đệ quy.
--
-- Idempotent: chạy lại không làm gì thêm.

BEGIN;

ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_id int;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_parent_fk'
  ) THEN
    ALTER TABLE departments
      ADD CONSTRAINT departments_parent_fk
      FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS departments_parent_idx ON departments (parent_id);

COMMIT;

-- Kiểm chứng:
--   SELECT id, name, parent_id FROM departments ORDER BY id;
--   -> mọi dòng parent_id IS NULL ngay sau khi chạy.
```

- [ ] **Step 2: Sửa `db/schema.sql`**

Trong khối `CREATE TABLE departments` (dòng 12-21), thêm ngay sau dòng `manager_id`:

```sql
  -- Cay to chuc: Ban -> Phong -> To. NULL la mot goc.
  -- Chong chu trinh o tang service, Postgres khong kiem duoc.
  parent_id   int REFERENCES departments(id) ON DELETE SET NULL,
```

Và thêm sau `CREATE INDEX departments_services_idx ...`:

```sql
CREATE INDEX departments_parent_idx ON departments (parent_id);
```

- [ ] **Step 3: Sửa `prisma/schema.prisma`**

Trong `model Department`, thêm sau dòng `managerId`:

```prisma
  parentId   Int?     @map("parent_id")
```

Và trong khối quan hệ, thêm sau dòng `manager`:

```prisma
  parent     Department?       @relation("DeptTree", fields: [parentId], references: [id], onDelete: SetNull, map: "departments_parent_fk")
  children   Department[]      @relation("DeptTree")
```

Thêm vào khối index cuối model:

```prisma
  @@index([parentId], map: "departments_parent_idx")
```

- [ ] **Step 4: Sinh lại Prisma client và xác nhận biên dịch**

Run: `npm run prisma:generate && npx tsc --noEmit`
Expected: cả hai lệnh thoát mã 0.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/005-department-parent.sql db/schema.sql prisma/schema.prisma
git commit -m "feat(org): cột parent_id cho cây phòng ban"
```

---

## Task 3: DTO, service và endpoint cây phòng ban

**Files:**
- Modify: `src/modules/departments/dto/department.dto.ts`, `src/modules/departments/departments.service.ts`, `src/modules/departments/departments.controller.ts`

**Interfaces:**
- Consumes: `buildTree`, `detectCycle` (Task 1); `Department.parentId` (Task 2)
- Produces: `GET /departments/tree` → `DepartmentTreeNodeDto[]`; `CreateDepartmentDto.parentId?`, `UpdateDepartmentDto.parentId?`; `DepartmentResponseDto.parentId`

- [ ] **Step 1: Thêm DTO**

Trong `src/modules/departments/dto/department.dto.ts`, thêm `parentId` vào `CreateDepartmentDto` (sau `managerId`):

```ts
  @ApiPropertyOptional({ description: 'Phòng cha trong sơ đồ tổ chức; bỏ trống là một gốc' })
  @IsOptional() @Type(() => Number) @IsInt()
  parentId?: number | null;
```

Thêm y hệt vào `UpdateDepartmentDto` (sau `managerId`). Thêm vào `DepartmentResponseDto` (sau `managerName`):

```ts
  @ApiProperty({ type: Number, nullable: true }) parentId!: number | null;
```

Và thêm hai lớp mới ở cuối file:

```ts
export class DepartmentMemberDto {
  @ApiProperty() id!: number;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
}

/** Nút của sơ đồ tổ chức. `children` tự tham chiếu nên Swagger phải khai báo tay. */
export class DepartmentTreeNodeDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ type: Number, nullable: true }) parentId!: number | null;
  @ApiProperty({ type: Number, nullable: true }) managerId!: number | null;
  @ApiProperty({ type: String, nullable: true }) managerName!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [DepartmentMemberDto] }) members!: DepartmentMemberDto[];
  @ApiProperty({ type: [DepartmentTreeNodeDto] }) children!: DepartmentTreeNodeDto[];
}
```

- [ ] **Step 2: Sửa service**

Trong `src/modules/departments/departments.service.ts`:

Thêm import ở đầu file:

```ts
import { buildTree, DeptTreeNode, detectCycle } from './department-tree.helper';
```

Thêm `parentId: true` vào `DEPT_INCLUDE`? Không — `parentId` là trường vô hướng nên đã có sẵn. Thêm vào type `DeptRow` (sau `managerId`):

```ts
  parentId: number | null;
```

Thêm vào `toDto` (sau `managerName`):

```ts
      parentId: d.parentId,
```

Thêm hai hàm riêng tư ngay trước `create`:

```ts
  /**
   * Cha mới có hợp lệ không. Postgres không kiểm được chu trình mà không cần
   * trigger đệ quy, nên luật nằm ở đây — chỗ DUY NHẤT, dùng chung cho tạo và sửa.
   */
  private async assertValidParent(id: number | null, parentId: number | null): Promise<void> {
    if (parentId === null || parentId === undefined) return;
    if (id !== null && parentId === id)
      throw new BadRequestException('Phòng ban không thể là cha của chính nó');

    const rows = await this.prisma.department.findMany({ select: { id: true, parentId: true } });
    const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
    if (!parentOf.has(parentId)) throw new BadRequestException('Phòng cha không tồn tại');

    if (id !== null && detectCycle(id, parentId, parentOf))
      throw new BadRequestException('Không đặt được: sẽ tạo vòng lặp trong sơ đồ tổ chức');
  }

  /**
   * Vô hiệu hoá phòng còn con đang hoạt động thì cả nhánh mất chỗ đứng. Không tự
   * động kéo con lên cha: im lặng sắp xếp lại sơ đồ tổ chức của người khác là
   * hành vi tệ hơn một thông báo lỗi.
   */
  private async assertNoActiveChildren(id: number): Promise<void> {
    const kids = await this.prisma.department.findMany({
      where: { parentId: id, isActive: true },
      select: { name: true },
    });
    if (kids.length)
      throw new BadRequestException(
        `Còn phòng ban trực thuộc đang hoạt động: ${kids.map((k) => k.name).join(', ')}`,
      );
  }
```

Trong `create`, thêm ngay sau `await this.assertServicesExist(dto.serviceIds ?? []);`:

```ts
    await this.assertValidParent(null, dto.parentId ?? null);
```

và thêm `parentId: dto.parentId ?? null,` vào khối `data`.

Trong `update`, thay thân hàm hiện tại bằng:

```ts
    await this.detail(id);
    if (dto.parentId !== undefined) await this.assertValidParent(id, dto.parentId);
    if (dto.isActive === false) await this.assertNoActiveChildren(id);
    const updated = await this.prisma.department.update({
      where: { id },
      data: dto,
      include: DEPT_INCLUDE,
    });
```

(phần `activity.log` và `return` giữ nguyên).

Thêm phương thức công khai `tree` ở cuối lớp:

```ts
  /**
   * Sơ đồ tổ chức. Một truy vấn lấy hết rồi dựng cây trong bộ nhớ — số phòng đếm
   * bằng chục. Chỉ trả tên và vai trò: đây là màn hình mọi vai trò đọc được, nên
   * email và điện thoại tuyệt đối không đi kèm.
   */
  async tree(): Promise<DeptTreeNode[]> {
    const rows = await this.prisma.department.findMany({
      select: {
        id: true, name: true, parentId: true, managerId: true, isActive: true,
        manager: { select: { fullName: true } },
        members: {
          where: { isActive: true },
          select: { id: true, fullName: true, roles: true },
          orderBy: { fullName: 'asc' },
        },
      },
    });
    return buildTree(
      rows.map((r) => ({
        id: r.id, name: r.name, parentId: r.parentId, managerId: r.managerId,
        managerName: r.manager?.fullName ?? null, isActive: r.isActive, members: r.members,
      })),
    );
  }
```

- [ ] **Step 3: Thêm endpoint**

Trong `src/modules/departments/departments.controller.ts`, thêm `DepartmentTreeNodeDto` vào khối import DTO, rồi chèn route **ngay trước `@Get(':id')`** — nếu đặt sau, `:id` sẽ nuốt mất `/tree` và Nest trả lỗi ParseIntPipe:

```ts
  // PHẢI đứng trước @Get(':id'), nếu không ParseIntPipe nhận chuỗi 'tree'.
  // Mở cho mọi vai trò: sơ đồ tổ chức chính là thứ giúp người dùng biết nên
  // chuyển đơn cho phòng nào, và nó không chứa gì hơn tên với vai trò.
  @Get('tree')
  @Roles(Role.ADMIN, Role.LEADER, Role.MANAGER, Role.SALE, Role.STAFF)
  @ApiOperation({ summary: 'Sơ đồ tổ chức — cây phòng ban lồng nhau' })
  @ApiResponse({ status: 200, type: [DepartmentTreeNodeDto] })
  tree(): Promise<DepartmentTreeNodeDto[]> {
    return this.departmentsService.tree();
  }
```

- [ ] **Step 4: Biên dịch và lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: cả hai thoát mã 0.

- [ ] **Step 5: Commit**

```bash
git add src/modules/departments
git commit -m "feat(org): endpoint cây phòng ban + ràng buộc chống chu trình"
```

---

## Task 4: Chuyển đơn nội bộ — backend

**Files:**
- Modify: `src/modules/quotes/dto/quote.dto.ts`, `src/modules/quotes/quotes.service.ts`, `src/modules/quotes/quotes.controller.ts`, `src/modules/quotes/queue.service.ts`
- Test: `src/modules/quotes/transfer.service.spec.ts`

**Interfaces:**
- Consumes: `assertDeptWorkable`, `assertTransition` (`../orders/order-state.helper`), `NotifyService.deptRecipients`, `QuotesService.settleCheck`
- Produces: `POST orders/:id/departments/:deptId/transfer`; `TransferDto { toDepartmentId: number; reason: string }`; `QueueItemDto.participatingDeptIds: number[]`

- [ ] **Step 1: Viết test đỏ**

Tạo `src/modules/quotes/transfer.service.spec.ts`:

```ts
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { DeptState, NotifType, OrderStatus } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotifyService } from '../notifications/notify.service';
import { QuotesService } from './quotes.service';

const manager: AuthenticatedUser = {
  id: 7, email: 'tp@bee.vn', fullName: 'Trưởng phòng', roles: ['manager'],
  departmentId: 3, canViewCompanyReport: false, mustChangePassword: false,
};

interface Opts {
  orderStatus?: OrderStatus;
  sourceState?: DeptState;
  targetExists?: boolean;
  targetActive?: boolean;
}

/**
 * Prisma giả: $transaction gọi thẳng callback với cùng bộ stub, nên thứ tự các
 * lời gọi bên trong transaction quan sát được qua invocationCallOrder.
 */
function mkHarness(opts: Opts = {}) {
  const {
    orderStatus = OrderStatus.DISTRIBUTED,
    sourceState = DeptState.PENDING,
    targetExists = false,
    targetActive = true,
  } = opts;

  const order = { id: 11, code: 'DOM-20260904-001', status: orderStatus, createdBy: 99 };

  const stub = {
    order: {
      findFirst: jest.fn().mockResolvedValue(order),
      findUnique: jest.fn().mockResolvedValue(order),
      findUniqueOrThrow: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue(order),
    },
    orderDepartment: {
      findUnique: jest.fn(({ where }: { where: { orderId_departmentId: { departmentId: number } } }) =>
        Promise.resolve(
          where.orderId_departmentId.departmentId === 3
            ? { orderId: 11, departmentId: 3, state: sourceState, claimedAt: null }
            : targetExists
              ? { orderId: 11, departmentId: 5, state: DeptState.PENDING }
              : null,
        ),
      ),
      // settleCheck đọc bằng findMany — trả về ảnh chụp SAU khi đã tạo dòng đích.
      findMany: jest.fn().mockResolvedValue([
        { state: DeptState.PASSED }, { state: DeptState.PENDING },
      ]),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    department: {
      findUnique: jest.fn().mockResolvedValue(
        targetActive ? { id: 5, name: 'Phòng Quốc tế', isActive: true } : { id: 5, name: 'Phòng Quốc tế', isActive: false },
      ),
    },
  };

  const prisma = {
    ...stub,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(stub)),
  } as unknown as PrismaService;

  const notify = {
    push: jest.fn().mockResolvedValue(undefined),
    deptRecipients: jest.fn().mockResolvedValue([21, 22]),
    admins: jest.fn().mockResolvedValue([1]),
  } as unknown as NotifyService;

  const service = new QuotesService(
    prisma,
    { orderWhere: () => ({}) } as unknown as ScopeService,
    { log: jest.fn().mockResolvedValue(undefined) } as unknown as ActivityService,
    notify,
  );

  return { service, stub, notify };
}

const body = { toDepartmentId: 5, reason: 'Không thuộc chuyên môn phòng' };

describe('QuotesService.transfer', () => {
  it('đóng dòng phòng nguồn thành passed kèm lý do', async () => {
    const { service, stub } = mkHarness();
    await service.transfer(11, 3, body, manager);
    expect(stub.orderDepartment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId_departmentId: { orderId: 11, departmentId: 3 } },
        data: { state: DeptState.PASSED, passReason: body.reason },
      }),
    );
  });

  it('mở dòng phòng đích ở pending và đánh dấu thủ công', async () => {
    const { service, stub } = mkHarness();
    await service.transfer(11, 3, body, manager);
    expect(stub.orderDepartment.create).toHaveBeenCalledWith({
      data: { orderId: 11, departmentId: 5, state: DeptState.PENDING, isManual: true },
    });
  });

  /**
   * Test chốt. settleCheck đọc order_departments; nếu nó chạy trước khi dòng đích
   * tồn tại thì đơn thoáng qua trạng thái "mọi phòng đã trả lời" và sale nhận một
   * thông báo ALL_PASSED cho đơn vừa được chuyển đi tiếp.
   */
  it('settleCheck chạy SAU khi tạo dòng phòng đích', async () => {
    const { service, stub } = mkHarness();
    await service.transfer(11, 3, body, manager);
    const created = stub.orderDepartment.create.mock.invocationCallOrder[0];
    const settled = stub.orderDepartment.findMany.mock.invocationCallOrder[0];
    expect(settled).toBeGreaterThan(created);
  });

  it('không bao giờ bắn ALL_PASSED — luôn còn một phòng đang chờ', async () => {
    const { service, notify } = mkHarness();
    await service.transfer(11, 3, body, manager);
    const types = (notify.push as jest.Mock).mock.calls
      .flatMap(([rows]: [{ type: string }[]]) => rows.map((r) => r.type));
    expect(types).not.toContain(NotifType.ALL_PASSED);
    expect(types).toContain(NotifType.NEW_ORDER);
  });

  it('báo cho người của phòng đích', async () => {
    const { service, notify } = mkHarness();
    await service.transfer(11, 3, body, manager);
    expect(notify.deptRecipients).toHaveBeenCalledWith(null, 11, 5);
    expect(notify.push).toHaveBeenCalledWith([
      { userId: 21, orderId: 11, type: NotifType.NEW_ORDER, title: 'Đơn DOM-20260904-001 được chuyển tới phòng bạn' },
      { userId: 22, orderId: 11, type: NotifType.NEW_ORDER, title: 'Đơn DOM-20260904-001 được chuyển tới phòng bạn' },
    ]);
  });

  it('phòng đích đã tham gia đơn thì từ chối', async () => {
    const { service } = mkHarness({ targetExists: true });
    await expect(service.transfer(11, 3, body, manager)).rejects.toThrow(ConflictException);
  });

  it('phòng đích trùng phòng nguồn thì từ chối', async () => {
    const { service } = mkHarness();
    await expect(
      service.transfer(11, 3, { ...body, toDepartmentId: 3 }, manager),
    ).rejects.toThrow(BadRequestException);
  });

  it('phòng đích đã ngừng hoạt động thì từ chối', async () => {
    const { service } = mkHarness({ targetActive: false });
    await expect(service.transfer(11, 3, body, manager)).rejects.toThrow(BadRequestException);
  });

  it('đơn đã qua vòng chọn báo giá thì không chuyển được nữa', async () => {
    const { service } = mkHarness({ sourceState: DeptState.WON });
    await expect(service.transfer(11, 3, body, manager)).rejects.toThrow(BadRequestException);
  });

  it('đơn đã huỷ thì không chuyển được', async () => {
    const { service } = mkHarness({ orderStatus: OrderStatus.CANCELLED });
    await expect(service.transfer(11, 3, body, manager)).rejects.toThrow();
  });

  it('không phải phòng mình thì 403', async () => {
    const { service } = mkHarness();
    await expect(service.transfer(11, 4, body, manager)).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `npm test -- src/modules/quotes/transfer.service.spec.ts`
Expected: FAIL — `service.transfer is not a function`

- [ ] **Step 3: Thêm `TransferDto`**

Trong `src/modules/quotes/dto/quote.dto.ts`, thêm sau `AddDepartmentDto`:

```ts
export class TransferDto {
  @ApiProperty({ description: 'Phòng nhận đơn' })
  @Type(() => Number) @IsInt()
  toDepartmentId!: number;

  @ApiProperty({ description: 'Vì sao chuyển — bắt buộc, sẽ hiện trong nhật ký đơn' })
  @IsString() @IsNotEmpty() @MaxLength(500)
  reason!: string;
}
```

Bổ sung `IsNotEmpty`, `IsString`, `MaxLength` vào khối import `class-validator` của file nếu chưa có.

- [ ] **Step 4: Viết `transfer()`**

Trong `src/modules/quotes/quotes.service.ts`, thêm `ConflictException` vào import từ `@nestjs/common`, thêm `TransferDto` vào import DTO, rồi chèn phương thức ngay sau `pass`:

```ts
  /**
   * F3 — chuyển đơn sang phòng khác trong một thao tác.
   *
   * Trước đây phải làm hai bước: phòng A `pass`, rồi nhờ Admin `addDepartment`
   * thêm phòng B. Giữa hai bước đó mọi phòng đều `passed` nên sale nhận một
   * thông báo "mọi phòng đều bỏ qua" cho đơn thật ra đang được chuyển tiếp.
   *
   * Phòng đã chuyển đi vẫn mang state `passed` — ngữ nghĩa "đã chuyển" nằm ở
   * ActivityLog. Thêm một DeptState mới sẽ buộc rà lại settleCheck,
   * selection.service, money.visibility và nhãn trên FE.
   */
  async transfer(
    orderId: number,
    deptId: number,
    dto: TransferDto,
    user: AuthenticatedUser,
  ): Promise<void> {
    const order = await this.assertOrderVisible(orderId, user);
    assertDeptWorkable(order.status);
    this.assertOwnDepartment(user, deptId);

    if (dto.toDepartmentId === deptId)
      throw new BadRequestException('Phòng nhận trùng với phòng đang giữ đơn');

    const od = await this.row(orderId, deptId);
    // Cùng luật với pass, để chỉ có MỘT quy tắc phải nhớ. Phòng đã 'quoted' vẫn
    // chuyển được — báo giá cũ nằm lại trong quote_history.
    if ([DeptState.WON, DeptState.LOST].includes(od.state as DeptState))
      throw new BadRequestException('Đơn đã qua vòng chọn báo giá, không chuyển được nữa');

    const target = await this.prisma.department.findUnique({ where: { id: dto.toDepartmentId } });
    if (!target || !target.isActive)
      throw new BadRequestException('Phòng nhận không tồn tại hoặc đã ngừng hoạt động');

    const already = await this.prisma.orderDepartment.findUnique({
      where: { orderId_departmentId: { orderId, departmentId: dto.toDepartmentId } },
    });
    if (already) throw new ConflictException('Phòng đó đã tham gia đơn này rồi');

    await this.prisma.$transaction(async (tx) => {
      await tx.orderDepartment.update({
        where: { orderId_departmentId: { orderId, departmentId: deptId } },
        data: { state: DeptState.PASSED, passReason: dto.reason },
      });
      await tx.orderDepartment.create({
        data: {
          orderId, departmentId: dto.toDepartmentId,
          state: DeptState.PENDING, isManual: true,
        },
      });

      // Giống addDepartment: thêm một phòng đang chờ thì đơn không còn "đã phân
      // phối xong" hay "chờ chọn báo giá" nữa.
      let next: OrderStatus | null = null;
      if (order.status === OrderStatus.NEW) next = OrderStatus.DISTRIBUTED;
      else if (order.status === OrderStatus.AWAITING_SELECTION) next = OrderStatus.QUOTING;
      if (next) {
        assertTransition(order.status, next);
        await tx.order.update({
          where: { id: orderId }, data: { status: next, updatedAt: new Date() },
        });
      }

      await this.activity.log(tx, {
        orderId, entity: 'order_departments', entityId: `${orderId}:${deptId}`,
        action: 'transfer', actorId: user.id,
        detail: { fromDepartmentId: deptId, toDepartmentId: dto.toDepartmentId, reason: dto.reason },
      });

      // PHẢI đứng sau create ở trên. Chạy trước thì mọi dòng đều đã 'passed' và
      // settleCheck kết luận sai rằng đơn hết đường đi.
      await this.settleCheck(tx, orderId);
    });

    // KHÔNG gọi notifyAfterSettle: sau khi chuyển luôn còn một phòng đang chờ,
    // nên "mọi phòng đều bỏ qua" không bao giờ đúng ở đây.
    await this.notify.push(
      (await this.notify.deptRecipients(null, orderId, dto.toDepartmentId)).map((userId) => ({
        userId, orderId, type: NotifType.NEW_ORDER,
        title: `Đơn ${order.code} được chuyển tới phòng bạn`,
      })),
    );
  }
```

- [ ] **Step 5: Chạy test, xác nhận xanh**

Run: `npm test -- src/modules/quotes/transfer.service.spec.ts`
Expected: PASS — 11 test.

- [ ] **Step 6: Thêm endpoint**

Trong `src/modules/quotes/quotes.controller.ts`, thêm `TransferDto` vào khối import DTO và chèn sau route `pass`:

```ts
  @Post('orders/:id/departments/:deptId/transfer')
  @Roles(Role.MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'Chuyển đơn sang phòng khác (F3)' })
  @ApiResponse({ status: 204, description: 'Đã chuyển' })
  @HttpCode(204)
  async transfer(
    @Param('id', ParseIntPipe) id: number,
    @Param('deptId', ParseIntPipe) deptId: number,
    @Body() dto: TransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.quotesService.transfer(id, deptId, dto, user);
  }
```

Đối chiếu route `pass` ngay phía trên và chỉnh cho khớp đúng lối khai báo của nó (decorator `@HttpCode`, kiểu trả về, thứ tự tham số).

- [ ] **Step 7: Trả `participatingDeptIds` trong hàng đợi**

Hộp thoại chuyển đơn phải loại các phòng đã tham gia; dữ liệu đó chưa có trong payload hàng đợi.

Trong `src/modules/quotes/dto/quote.dto.ts`, thêm vào `QueueItemDto`:

```ts
  @ApiProperty({ type: [Number], description: 'Các phòng đã tham gia đơn — hộp thoại chuyển đơn loại chúng ra' })
  participatingDeptIds!: number[];
```

Trong `src/modules/quotes/queue.service.ts`, thêm vào khối `select` của `order`:

```ts
        departments: { select: { departmentId: true } },
```

và thêm vào đối tượng trả về:

```ts
      participatingDeptIds: r.order.departments.map((d) => d.departmentId),
```

- [ ] **Step 8: Chạy toàn bộ test và lint**

Run: `npm test && npm run lint`
Expected: mọi test PASS (gồm `queue.service.spec.ts` đã có), lint sạch.

Nếu `queue.service.spec.ts` hỏng vì thiếu `departments` trong dữ liệu giả, thêm `departments: [{ departmentId: 3 }]` vào `cancelledRow.order`.

- [ ] **Step 9: Commit**

```bash
git add src/modules/quotes
git commit -m "feat(quotes): chuyển đơn nội bộ sang phòng khác trong một thao tác"
```

---

## Task 5: FE — kiểu dữ liệu và tầng gọi API

**Repo:** `E:\bee-transportation-fe`

**Files:**
- Modify: `src/types/organisation.ts`, `src/types/queue.ts`, `src/services/apiEndpoints.ts`, `src/services/organisationService.ts`, `src/services/queueService.ts`

**Interfaces:**
- Consumes: `GET /departments/tree` (Task 3), `POST .../transfer` và `QueueItemDto.participatingDeptIds` (Task 4)
- Produces: `DepartmentTreeNode`, `fetchDepartmentTree(): Promise<DepartmentTreeNode[]>`, `transferOrder(orderId, departmentId, toDepartmentId, reason): Promise<void>`, `QueueItem.participatingDeptIds`

- [ ] **Step 1: Thêm kiểu**

Trong `src/types/organisation.ts`, thêm `parentId: number | null;` vào `Department` (sau `managerName`), thêm cùng trường vào `CreateDepartmentPayload` và `UpdateDepartmentPayload` dưới dạng `parentId?: number | null;`, và thêm:

```ts
export interface DepartmentMember {
  id: number;
  fullName: string;
  roles: Role[];
}

/** One node of the org chart; `children` nests to any depth. */
export interface DepartmentTreeNode {
  id: number;
  name: string;
  parentId: number | null;
  managerId: number | null;
  managerName: string | null;
  isActive: boolean;
  members: DepartmentMember[];
  children: DepartmentTreeNode[];
}
```

Trong `src/types/queue.ts`, thêm vào `QueueItem`:

```ts
  /** Departments already on this order; the transfer dialog excludes them. */
  participatingDeptIds: number[];
```

- [ ] **Step 2: Thêm endpoint**

Trong `src/services/apiEndpoints.ts`, thêm vào `QUOTE_ENDPOINTS` sau `PASS`:

```ts
  TRANSFER: (orderId: number, departmentId: number) =>
    `${ORDERS}/${orderId}/departments/${departmentId}/transfer`,
```

và vào `ORGANISATION_ENDPOINTS` sau `DEPARTMENTS`:

```ts
  DEPARTMENT_TREE: `${ORGANISATION}/departments/tree`,
```

- [ ] **Step 3: Thêm hàm gọi API**

Trong `src/services/organisationService.ts`, thêm `parentId: api.parentId ?? null,` vào `adaptDepartment`, thêm `parentId: number | null;` vào `interface ApiDepartment`, rồi thêm ở cuối phần phòng ban:

```ts
interface ApiDepartmentTreeNode {
  id: number;
  name: string;
  parentId: number | null;
  managerId: number | null;
  managerName: string | null;
  isActive: boolean;
  members: { id: number; fullName: string; roles: string[] }[];
  children: ApiDepartmentTreeNode[];
}

function adaptTreeNode(api: ApiDepartmentTreeNode): DepartmentTreeNode {
  return {
    id: api.id,
    name: api.name,
    parentId: api.parentId,
    managerId: api.managerId,
    managerName: api.managerName,
    isActive: api.isActive,
    members: api.members.map((m) => ({ id: m.id, fullName: m.fullName, roles: findRoles(m.roles) })),
    children: api.children.map(adaptTreeNode),
  };
}

/** The org chart arrives already nested; the backend owns the tree shape. */
export async function fetchDepartmentTree(): Promise<DepartmentTreeNode[]> {
  const response = await apiClient.get<ApiDepartmentTreeNode[]>(
    ORGANISATION_ENDPOINTS.DEPARTMENT_TREE,
  );
  return response.data.map(adaptTreeNode);
}
```

Thêm `DepartmentTreeNode` vào khối import type từ `@/types/organisation`.

Trong `src/services/queueService.ts`, thêm `participatingDeptIds: number[];` vào `ApiQueueItem`, thêm `participatingDeptIds: api.participatingDeptIds ?? [],` vào `adaptQueueItem` (fallback để bản backend cũ không làm vỡ màn hình), và thêm:

```ts
/** The backend rejects an empty reason, so the dialog must enforce one. */
export async function transferOrder(
  orderId: number,
  departmentId: number,
  toDepartmentId: number,
  reason: string,
): Promise<void> {
  await apiClient.post(QUOTE_ENDPOINTS.TRANSFER(orderId, departmentId), {
    toDepartmentId,
    reason,
  });
}
```

- [ ] **Step 4: Biên dịch**

Run: `npm run build`
Expected: thoát mã 0.

- [ ] **Step 5: Commit**

```bash
git add src/types src/services
git commit -m "feat(api): kiểu và lời gọi cho cây phòng ban và chuyển đơn"
```

---

## Task 6: FE — hộp thoại và nút chuyển đơn

**Repo:** `E:\bee-transportation-fe`

**Files:**
- Create: `src/pages/orders/transferTargets.ts`, `src/pages/orders/TransferDialog.tsx`
- Modify: `src/pages/orders/QueueRow.tsx`, `src/pages/orders/QueuePage.tsx`, `src/locales/vi.json`, `src/locales/en.json`

**Interfaces:**
- Consumes: `fetchDepartmentTree`, `transferOrder` (Task 5); `QueueItem.participatingDeptIds`
- Produces: `flattenTree(nodes): DepartmentTreeNode[]`, `transferTargets(nodes, item): DepartmentTreeNode[]`, `TransferDialog`, `QueueRowProps.onTransfer`

- [ ] **Step 1: Hàm thuần lọc phòng đích**

Tạo `src/pages/orders/transferTargets.ts`:

```ts
import type { DepartmentTreeNode } from '@/types/organisation';
import type { QueueItem } from '@/types/queue';

/** Depth-first, so the flat list keeps the org chart's reading order. */
export function flattenTree(nodes: readonly DepartmentTreeNode[]): DepartmentTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

/**
 * Departments this order can move to. The backend rejects the rest anyway — this
 * only keeps the dialog from offering a choice that is certain to fail:
 * departments already on the order (409) and inactive ones (400).
 *
 * `departmentId` is the caller's own department, which is always on the order.
 */
export function transferTargets(
  nodes: readonly DepartmentTreeNode[],
  item: Pick<QueueItem, 'participatingDeptIds'>,
  departmentId: number,
): DepartmentTreeNode[] {
  const taken = new Set([...item.participatingDeptIds, departmentId]);
  return flattenTree(nodes).filter((node) => node.isActive && !taken.has(node.id));
}
```

- [ ] **Step 2: Hộp thoại**

Tạo `src/pages/orders/TransferDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { DepartmentTreeNode } from '@/types/organisation';

export interface TransferDialogProps {
  open: boolean;
  orderCode: string;
  targets: readonly DepartmentTreeNode[];
  isBusy: boolean;
  onClose: () => void;
  onConfirm: (toDepartmentId: number, reason: string) => void;
}

export function TransferDialog({
  open,
  orderCode,
  targets,
  isBusy,
  onClose,
  onConfirm,
}: TransferDialogProps): ReactNode {
  const { t } = useTranslation();
  const [toDepartmentId, setToDepartmentId] = useState('');
  const [reason, setReason] = useState('');

  // Reopening for a different row must not inherit the previous answer.
  useEffect(() => {
    if (open) {
      setToDepartmentId('');
      setReason('');
    }
  }, [open]);

  const canSubmit = toDepartmentId !== '' && reason.trim() !== '' && !isBusy;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('queue.transferTitle', { code: orderCode })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('queue.transferHint')}
          </Typography>
          <TextField
            select
            required
            label={t('queue.transferTarget')}
            value={toDepartmentId}
            onChange={(event) => setToDepartmentId(event.target.value)}
            helperText={targets.length === 0 ? t('queue.transferNoTarget') : undefined}
            disabled={targets.length === 0}
          >
            {targets.map((node) => (
              <MenuItem key={node.id} value={String(node.id)}>
                {node.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            required
            multiline
            minRows={2}
            label={t('queue.transferReason')}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() => onConfirm(Number(toDepartmentId), reason.trim())}
        >
          {t('queue.transferConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

Trước khi viết, mở một hộp thoại đã có trong `src/pages/orders/` (hộp thoại của nút Bỏ qua) và chỉnh cho khớp cách nó đặt nút, khoảng cách và khoá `common.cancel` thực tế trong `vi.json`.

- [ ] **Step 3: Nút trên hàng hàng đợi**

Trong `src/pages/orders/QueueRow.tsx`:

Thêm `IconArrowsExchange` vào khối import `@tabler/icons-react`. Thêm vào `QueueRowProps`:

```ts
  canTransfer: boolean;
  onTransfer: (item: QueueItem) => void;
```

Thêm hai tham số đó vào danh sách destructure của hàm, rồi chèn khối này **giữa** khối `canAssign` và khối nút Bỏ qua:

```tsx
          {canTransfer ? (
            <Tooltip title={t('queue.transferShort')}>
              <span>
                <IconButton
                  size="small"
                  disabled={isBusy || !isOrderOpen}
                  onClick={() => onTransfer(item)}
                >
                  <IconArrowsExchange size={17} stroke={1.7} />
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
```

`!isOrderOpen` là điều kiện quan trọng: đơn đã huỷ không mời người dùng làm gì cả, đúng luật đã đặt ở `fix/scope-orders-queue-cancelled`.

- [ ] **Step 4: Nối vào trang hàng đợi**

Trong `src/pages/orders/QueuePage.tsx`:

- import `TransferDialog`, `transferTargets`, `fetchDepartmentTree`, `transferOrder`;
- thêm state `const [tree, setTree] = useState<DepartmentTreeNode[]>([]);` và `const [transferItem, setTransferItem] = useState<QueueItem | null>(null);`
- nạp cây một lần khi trang gắn vào DOM, **nuốt lỗi**: nếu backend chưa triển khai endpoint thì màn hình hàng đợi vẫn phải chạy như cũ, chỉ là danh sách phòng đích rỗng.

```tsx
  useEffect(() => {
    fetchDepartmentTree().then(setTree).catch(() => setTree([]));
  }, []);
```

- truyền `canTransfer={canAssign}` (cùng điều kiện: là manager và có phòng ban) và `onTransfer={setTransferItem}` vào `<QueueRow ... />`;
- dựng hộp thoại dưới bảng, dùng lại đúng cách trang này đang xử lý trạng thái bận và làm mới sau `passOrder`:

```tsx
      <TransferDialog
        open={transferItem !== null}
        orderCode={transferItem?.code ?? ''}
        targets={
          transferItem === null || departmentId === null
            ? []
            : transferTargets(tree, transferItem, departmentId)
        }
        isBusy={isBusy}
        onClose={() => setTransferItem(null)}
        onConfirm={(toDepartmentId, reason) => {
          if (transferItem === null || departmentId === null) return;
          void runAction(() =>
            transferOrder(transferItem.orderId, departmentId, toDepartmentId, reason),
          ).then(() => setTransferItem(null));
        }}
      />
```

`runAction` là tên giữ chỗ — dùng đúng trình bao bọc mà `onPass` trong file này đang dùng để bật cờ bận, hiện thông báo và nạp lại hàng đợi.

- [ ] **Step 5: Chuỗi hiển thị**

Thêm vào `src/locales/vi.json`, trong đối tượng `queue`:

```json
"transferShort": "Chuyển phòng",
"transferTitle": "Chuyển đơn {{code}} sang phòng khác",
"transferHint": "Phòng bạn sẽ ngừng xử lý đơn này. Phòng nhận vào hàng đợi và được báo ngay.",
"transferTarget": "Phòng nhận",
"transferReason": "Lý do chuyển",
"transferConfirm": "Chuyển đơn",
"transferNoTarget": "Không còn phòng nào nhận được đơn này"
```

Và bản tiếng Anh tương ứng vào `src/locales/en.json`:

```json
"transferShort": "Transfer",
"transferTitle": "Transfer order {{code}} to another department",
"transferHint": "Your department stops working on this order. The receiving department is queued and notified.",
"transferTarget": "Receiving department",
"transferReason": "Reason for the transfer",
"transferConfirm": "Transfer",
"transferNoTarget": "No department is available to receive this order"
```

Kiểm lại `vi.json` và `en.json` có **đúng cùng một tập khoá** — lệch một khoá là một chuỗi hiện ra dưới dạng mã khoá trên màn hình.

- [ ] **Step 6: Biên dịch và thử tay**

Run: `npm run build && npm run lint`
Expected: cả hai thoát mã 0.

Thử tay với backend đang chạy, đăng nhập bằng một tài khoản `manager`:
1. Vào Hàng đợi phòng ban, một đơn còn mở → nút Chuyển phòng bật.
2. Chuyển sang một phòng khác kèm lý do → hàng đợi làm mới, đơn rời khỏi danh sách.
3. Mở lại hộp thoại trên một đơn khác → phòng vừa nhận **không** còn trong danh sách chọn của đơn đó nếu nó đã tham gia.
4. Một đơn đã huỷ → nút Chuyển phòng mờ.

- [ ] **Step 7: Commit**

```bash
git add src/pages/orders src/locales
git commit -m "feat(queue): nút chuyển đơn sang phòng khác"
```

---

## Task 7: FE — trang sơ đồ tổ chức

**Repo:** `E:\bee-transportation-fe`

**Files:**
- Create: `src/pages/admin/OrgChartPage.tsx`, `src/pages/admin/OrgChartNode.tsx`
- Modify: `src/routes/routePaths.ts`, `src/routes/AppRoutes.tsx`, `src/layouts/components/useMenuItems.ts`, `src/locales/vi.json`, `src/locales/en.json`

**Interfaces:**
- Consumes: `fetchDepartmentTree`, `DepartmentTreeNode` (Task 5)
- Produces: route `RoutePath.OrgChart = '/org-chart'`

- [ ] **Step 1: Nút cây, đệ quy**

Tạo `src/pages/admin/OrgChartNode.tsx`:

```tsx
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Box,
  Chip,
  Collapse,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { ROLE_LABEL_KEY, type Role } from '@/constants/roles';
import type { DepartmentTreeNode } from '@/types/organisation';

export interface OrgChartNodeProps {
  node: DepartmentTreeNode;
  depth: number;
}

/**
 * An indented tree rather than a drawn diagram: it prints, it survives long
 * department names, and it needs no charting library.
 */
export function OrgChartNode({ node, depth }: OrgChartNodeProps): ReactNode {
  const { t } = useTranslation();
  // Top two levels open by default — deeper than that the page becomes a wall.
  const [open, setOpen] = useState(depth < 2);
  const hasDetail = node.children.length > 0 || node.members.length > 0;

  return (
    <>
      <ListItemButton
        onClick={() => setOpen((value) => !value)}
        sx={{ pl: 2 + depth * 3, opacity: node.isActive ? 1 : 0.55 }}
      >
        <Box sx={{ width: 24, display: 'flex', alignItems: 'center' }}>
          {hasDetail ? (
            open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />
          ) : null}
        </Box>
        <ListItemText
          primary={
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" fontWeight={700}>
                {node.name}
              </Typography>
              {node.isActive ? null : (
                <Chip size="small" label={t('orgChart.inactive')} variant="outlined" />
              )}
            </Stack>
          }
          secondary={[
            node.managerName ?? t('orgChart.noManager'),
            t('orgChart.memberCount', { count: node.members.length }),
          ].join(' · ')}
        />
      </ListItemButton>

      <Collapse in={open} unmountOnExit>
        <List disablePadding>
          {node.members.map((member) => (
            <ListItemText
              key={member.id}
              sx={{ pl: 2 + (depth + 1) * 3 + 3, my: 0.25 }}
              primary={
                <Typography variant="body2">
                  {member.fullName}
                  <Typography component="span" variant="caption" color="text.secondary">
                    {` — ${member.roles.map((role: Role) => t(ROLE_LABEL_KEY[role])).join(', ')}`}
                  </Typography>
                </Typography>
              }
            />
          ))}
          {node.children.map((child) => (
            <OrgChartNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </List>
      </Collapse>
    </>
  );
}
```

- [ ] **Step 2: Trang**

Tạo `src/pages/admin/OrgChartPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Card, CircularProgress, List, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { OrgChartNode } from './OrgChartNode';
import { fetchDepartmentTree } from '@/services/organisationService';
import type { DepartmentTreeNode } from '@/types/organisation';

export default function OrgChartPage(): ReactNode {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<DepartmentTreeNode[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchDepartmentTree()
      .then(setNodes)
      .catch(() => setFailed(true));
  }, []);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        {t('orgChart.title')}
      </Typography>
      {failed ? <Alert severity="error">{t('orgChart.loadFailed')}</Alert> : null}
      <Card variant="outlined">
        {nodes === null && !failed ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : (
          <List disablePadding>
            {(nodes ?? []).map((node) => (
              <OrgChartNode key={node.id} node={node} depth={0} />
            ))}
          </List>
        )}
      </Card>
    </Stack>
  );
}
```

Đối chiếu một trang khác trong `src/pages/admin/` và chỉnh cho khớp: cách export (mặc định hay có tên), cách trang đó bọc tiêu đề, và cách nó báo lỗi tải.

- [ ] **Step 3: Route và menu**

Trong `src/routes/routePaths.ts`, thêm `OrgChart: '/org-chart',` cạnh `AdminDepartments`.

Trong `src/routes/AppRoutes.tsx`, thêm import trang và một route **không bọc guard vai trò** (mọi vai trò đăng nhập đều xem được), đặt cạnh `RoutePath.Notifications`:

```tsx
        <Route path={RoutePath.OrgChart} element={<OrgChartPage />} />
```

Trong `src/layouts/components/useMenuItems.ts`, thêm một mục menu trỏ tới `RoutePath.OrgChart`, nhãn `orgChart.title`, biểu tượng `IconSitemap` từ `@tabler/icons-react`, **không kèm điều kiện vai trò**. Đặt cùng nhóm với các mục dùng chung (Bảng điều khiển, Thông báo), không đặt trong nhóm Quản trị.

- [ ] **Step 4: Chuỗi hiển thị**

Thêm vào `src/locales/vi.json` một đối tượng `orgChart` mới ở cấp cao nhất:

```json
"orgChart": {
  "title": "Sơ đồ tổ chức",
  "inactive": "Ngừng hoạt động",
  "noManager": "Chưa có trưởng phòng",
  "memberCount": "{{count}} thành viên",
  "loadFailed": "Không tải được sơ đồ tổ chức"
}
```

Và vào `src/locales/en.json`:

```json
"orgChart": {
  "title": "Org chart",
  "inactive": "Inactive",
  "noManager": "No manager",
  "memberCount": "{{count}} members",
  "loadFailed": "Could not load the org chart"
}
```

- [ ] **Step 5: Biên dịch và thử tay**

Run: `npm run build && npm run lint`
Expected: cả hai thoát mã 0.

Thử tay: đăng nhập bằng tài khoản `staff` → mục Sơ đồ tổ chức có trong menu, mở ra thấy cây; bấm một nút để đóng/mở; phòng ngừng hoạt động hiện mờ kèm nhãn.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/OrgChartPage.tsx src/pages/admin/OrgChartNode.tsx src/routes src/layouts src/locales
git commit -m "feat(org): trang sơ đồ tổ chức"
```

---

## Task 8: FE — chọn phòng cha trong form phòng ban

**Repo:** `E:\bee-transportation-fe`

**Files:**
- Modify: form phòng ban trong `src/pages/admin/` (tìm bằng `grep -rn "DEPARTMENT_DETAIL\|updateDepartment" src/pages/admin`), `src/locales/vi.json`, `src/locales/en.json`

**Interfaces:**
- Consumes: `Department.parentId`, `UpdateDepartmentPayload.parentId`, `fetchDepartments` (Task 5)
- Produces: không có

- [ ] **Step 1: Hàm thuần lọc danh sách cha hợp lệ**

`transferTargets.ts` thuộc màn hình hàng đợi, không dùng lại ở đây. Tạo `src/pages/admin/parentOptions.ts`:

```ts
import type { Department } from '@/types/organisation';

/**
 * Departments this one may sit under. The backend rejects cycles with a 400;
 * this keeps the dropdown from offering a choice that is certain to fail —
 * itself, and anything already below it.
 */
export function parentOptions(all: readonly Department[], id: number): Department[] {
  const banned = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const dept of all) {
      if (banned.has(dept.id)) continue;
      if (dept.parentId !== null && banned.has(dept.parentId)) {
        banned.add(dept.id);
        grew = true;
      }
    }
  }
  return all.filter((dept) => !banned.has(dept.id));
}
```

- [ ] **Step 2: Thêm ô chọn vào form**

Trong form phòng ban, thêm một `TextField select` nhãn `admin.departments.parent`, giá trị `parentId` (chuỗi rỗng nghĩa là gốc), lựa chọn lấy từ `parentOptions(departments, editingId)` khi sửa và từ toàn bộ `departments` khi tạo mới. Thêm một mục rỗng ở đầu:

```tsx
<MenuItem value="">{t('admin.departments.parentNone')}</MenuItem>
```

Khi gửi, chuyển `''` thành `null` chứ không bỏ trường đi — bỏ đi thì không gỡ được cha đã đặt:

```ts
parentId: parentId === '' ? null : Number(parentId),
```

Đối chiếu các ô sẵn có trong chính form đó (ô chọn trưởng phòng) và chỉnh cho khớp cách nó dựng `TextField select`.

- [ ] **Step 3: Chuỗi hiển thị**

Thêm vào nhánh `admin.departments` của `src/locales/vi.json`:

```json
"parent": "Thuộc khối",
"parentNone": "— Là một khối gốc —"
```

Và `src/locales/en.json`:

```json
"parent": "Reports to",
"parentNone": "— Top level —"
```

Nếu nhánh `admin.departments` mang tên khác trong file thực tế, dùng đúng tên đó.

- [ ] **Step 4: Biên dịch và thử tay**

Run: `npm run build && npm run lint`
Expected: cả hai thoát mã 0.

Thử tay bằng tài khoản admin:
1. Sửa một phòng, đặt cha là một phòng khác → lưu được, mở Sơ đồ tổ chức thấy đúng chỗ.
2. Sửa phòng cha, thử đặt cha là chính phòng con của nó → không có trong danh sách chọn.
3. Thử vô hiệu hoá một phòng còn con đang hoạt động → backend trả lỗi kèm tên phòng con, màn hình hiện lỗi đó.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin src/locales
git commit -m "feat(org): chọn khối cha khi sửa phòng ban"
```

---

## Task 9: Chạy migration và kiểm tra đầu-cuối

**Files:** không sửa file nào — đây là bước triển khai và nghiệm thu.

**Interfaces:**
- Consumes: mọi task trước
- Produces: không có

- [ ] **Step 1: Chạy migration trên môi trường đích**

```bash
docker compose -f docker-compose.vm.yml exec -T db \
  psql -U beeops -d beeops -v ON_ERROR_STOP=1 -f - < db/migrations/005-department-parent.sql
```

Expected: `COMMIT`, không lỗi.

- [ ] **Step 2: Xác nhận cột đã có và dữ liệu nguyên vẹn**

```bash
docker compose -f docker-compose.vm.yml exec -T db \
  psql -U beeops -d beeops -c "SELECT id, name, parent_id FROM departments ORDER BY id;"
```

Expected: mọi dòng `parent_id` là `NULL`; số dòng bằng đúng trước khi chạy.

- [ ] **Step 3: Chạy lại migration để xác nhận idempotent**

Lặp lại lệnh ở Step 1.
Expected: `COMMIT`, không lỗi, không đổi gì.

- [ ] **Step 4: Chạy toàn bộ test backend**

Run: `npm test`
Expected: mọi suite PASS.

- [ ] **Step 5: Kiểm tra đầu-cuối**

Với backend và FE đã triển khai:
1. Admin dựng một cây hai tầng (một Ban, hai Phòng dưới nó).
2. Tài khoản `staff` mở Sơ đồ tổ chức → thấy đúng cây, thấy thành viên, **không** thấy email.
3. Tài khoản `manager` của phòng A chuyển một đơn sang phòng B kèm lý do.
4. Tài khoản của phòng B nhận thông báo "được chuyển tới phòng bạn", và đơn có trong hàng đợi của họ.
5. Sale tạo đơn **không** nhận thông báo "mọi phòng đều bỏ qua".
6. Mở Nhật ký hoạt động của đơn → có dòng `transfer` kèm lý do.
7. Thử chuyển lại cùng đơn sang phòng B lần nữa → báo lỗi "Phòng đó đã tham gia đơn này rồi".

- [ ] **Step 6: Commit (nếu có chỉnh sửa phát sinh)**

Nếu bước kiểm tra làm lộ ra chỗ cần sửa, sửa rồi commit riêng với thông điệp mô tả đúng vấn đề gặp phải.
