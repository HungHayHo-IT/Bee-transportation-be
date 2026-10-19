# Thông báo đẩy FCM cho khách hàng — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi Sale chốt giá thì khách đã gửi yêu cầu báo giá nhận được push FCM + thông báo trong hộp thư; đồng thời vá hai ca yêu cầu báo giá hiện không báo cho ai.

**Architecture:** Dùng chung bảng `notifications` với hai cột FK nullable (`user_id` cho nhân viên, `customer_id` cho khách), CHECK giữ đúng một chủ sở hữu. Ghi thông báo là ghi vào outbox (`pushed_at IS NULL`); một cron 30 giây claim bằng `FOR UPDATE SKIP LOCKED` rồi gọi FCM — cùng khuôn với `flushEmails` sẵn có. Khách vãng lai không có tài khoản: token gắn thẳng vào `quote_requests.fcm_token`.

**Tech Stack:** NestJS 10 + Fastify, Prisma + PostgreSQL 16, `firebase-admin`, jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-09-14-customer-push-notifications-design.md`

## Global Constraints

- **Mọi file mã nguồn giữ dưới 300 dòng** (README.md:95). `orders.service.ts` đang 280 dòng, `quote-request.service.ts` 261, `selection.service.ts` 246 — đây là lý do phần format nội dung thông báo nằm ở `CustomerNotifyService` riêng, mỗi điểm gọi chỉ thêm 1-3 dòng.
- **Sửa DB thì sửa `db/schema-flow.sql` TRƯỚC, rồi viết file trong `db/migrations/`, rồi `npx prisma db pull` đối chiếu** (README.md:89-91).
- **`db/schema.sql` và `db/schema-flow.sql` viết comment KHÔNG dấu** (ASCII). File trong `db/migrations/` thì viết có dấu bình thường — xem `014-customer-devices.sql`.
- Migration phải **idempotent** (`IF NOT EXISTS` / `IF EXISTS`), theo đúng lối của 014.
- Test là **unit test thuần**, Prisma giả bằng object cast `as unknown as PrismaService`. Repo không có test chạm DB thật — xem `notify.service.spec.ts`, `customer-device.spec.ts`.
- Đường dẫn import nội bộ dùng alias `@/` (jest `moduleNameMapper` đã map sang `<rootDir>`).
- Tiếng Việt có dấu trong mọi chuỗi hiển thị cho người dùng và mọi comment trong `src/`.
- Lệnh chạy test: `npx jest <path>` (script `npm test` = `jest`).
- Lint: `npm run lint` (eslint --fix). Chạy trước mỗi commit.

---

### Task 1: Schema — hai cột FK, outbox, index

**Files:**
- Modify: `db/schema-flow.sql:79-97` (bảng `notifications`), `db/schema-flow.sql:137-156` (bảng `quote_requests`)
- Create: `db/migrations/015-customer-push-notifications.sql`
- Modify: `prisma/schema.prisma:284-301` (model `Notification`), `prisma/schema.prisma:86-112` (model `QuoteRequest`), `prisma/schema.prisma:342-359` (model `CustomerAccount`)

**Interfaces:**
- Consumes: không có (task đầu).
- Produces: Prisma client với `notification.customerId: number | null`, `notification.quoteRequestId: number | null`, `notification.pushedAt: Date | null`, `notification.userId: number | null`; `quoteRequest.fcmToken: string | null`; `customerAccount.pushOff: string[]`.

- [ ] **Step 1: Sửa `db/schema-flow.sql` — bảng `notifications`**

Thay nguyên khối `CREATE TABLE notifications (...)` cùng các index ngay dưới nó (dòng 79-97) bằng:

```sql
CREATE TABLE notifications (
  id         serial PRIMARY KEY,
  -- Chu so huu: DUNG MOT trong user_id / customer_id, hoac ca hai NULL khi la
  -- khach vang lai (luc do quote_request_id giu vai tro neo). Hai cot rieng chu
  -- KHONG phai mot cot + co is_customer: users.id va customer_accounts.id la hai
  -- sequence doc lap, deu bat dau tu 1, nen trung nhau day dac. Dung chung cot thi
  -- cron email JOIN users se gui thong bao cua khach id 5 toi nhan vien id 5.
  user_id     int REFERENCES users(id) ON DELETE CASCADE,
  customer_id int REFERENCES customer_accounts(id) ON DELETE CASCADE,
  -- Voi khach co tai khoan: ngu canh de FE deep-link. Voi khach vang lai: duong
  -- duy nhat tim ra FCM token (quote_requests.fcm_token).
  quote_request_id int REFERENCES quote_requests(id) ON DELETE CASCADE,
  order_id   int REFERENCES orders(id) ON DELETE CASCADE,
  type       text NOT NULL,                         -- new_order, quote_received, sla_late...
  title      text NOT NULL,
  body       text,
  is_read    boolean NOT NULL DEFAULT false,
  emailed_at timestamptz,                           -- NULL = chua gui SMTP
  pushed_at  timestamptz,                           -- NULL = cron push chua xu ly
  -- Chong nhac lap cho thong bao lap theo thoi gian (sla_late, quote_expired).
  -- Vi du: 'sla_late:<order_id>:<department_id>:<user_id>'.
  -- NULL voi thong bao thuong -> moi lan la mot su kien moi.
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notifications_owner_ck CHECK (
    num_nonnulls(user_id, customer_id) = 1
    OR (user_id IS NULL AND customer_id IS NULL AND quote_request_id IS NOT NULL)
  )
);
CREATE INDEX notifications_inbox_idx  ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX notifications_outbox_idx ON notifications (created_at) WHERE emailed_at IS NULL;
CREATE UNIQUE INDEX notifications_dedupe_uk ON notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX notifications_cust_inbox_idx
  ON notifications (customer_id, is_read, created_at DESC);
-- Partial: cron push chi quet dong cua nguoi KHONG phai nhan vien. Dong cua staff
-- co user_id khac null nen nam ngoai index -> index khong phinh theo thong bao noi bo.
CREATE INDEX notifications_push_idx ON notifications (created_at)
  WHERE pushed_at IS NULL AND user_id IS NULL;
```

- [ ] **Step 2: Sửa `db/schema-flow.sql` — bảng `quote_requests`**

Thêm cột `fcm_token` vào cuối danh sách cột (sau `reject_reason`), và thêm một index sau khối `CREATE INDEX ... quote_requests_status_idx`:

```sql
  reject_reason          text,
  -- Token FCM cua may khach VANG LAI (khong dang nhap). Khach co tai khoan thi
  -- token nam o customer_devices. Khong tao tai khoan tam: customer_accounts.email
  -- la UNIQUE NOT NULL nhung form bao gia cho phep bo trong email.
  fcm_token              text
);
CREATE INDEX IF NOT EXISTS quote_requests_status_idx
  ON quote_requests (status, created_at DESC);
-- Moi thong bao tang don hang deu tra nguoc tu order_id ve khach qua cot nay.
CREATE INDEX IF NOT EXISTS quote_requests_order_idx
  ON quote_requests (converted_to_order_id) WHERE converted_to_order_id IS NOT NULL;
```

- [ ] **Step 3: Tạo `db/migrations/015-customer-push-notifications.sql`**

```sql
-- 015 — Thong bao day (FCM) cho khach hang.
--
-- Dung CHUNG bang notifications thay vi tao bang rieng. Phan biet chu so huu bang
-- HAI COT FK nullable, khong phai co is_customer: users.id va customer_accounts.id
-- la hai sequence doc lap trung nhau day dac, nen nhet customer id vao user_id se
-- lam cron email (JOIN users u ON u.id = n.user_id) gui thong bao cua khach id 5
-- toi nhan vien id 5.
--
-- Idempotent.

BEGIN;

ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS customer_id      int REFERENCES customer_accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS quote_request_id int REFERENCES quote_requests(id)    ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pushed_at        timestamptz;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_owner_ck;
ALTER TABLE notifications ADD CONSTRAINT notifications_owner_ck CHECK (
  num_nonnulls(user_id, customer_id) = 1
  OR (user_id IS NULL AND customer_id IS NULL AND quote_request_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS notifications_cust_inbox_idx
  ON notifications (customer_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_push_idx ON notifications (created_at)
  WHERE pushed_at IS NULL AND user_id IS NULL;

ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS fcm_token text;
CREATE INDEX IF NOT EXISTS quote_requests_order_idx
  ON quote_requests (converted_to_order_id) WHERE converted_to_order_id IS NOT NULL;

ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS push_off text[] NOT NULL DEFAULT '{}';

COMMIT;
```

- [ ] **Step 4: Chạy migration lên DB đang chạy**

```bash
docker exec -i beeops-postgres psql -U beeops -d beeops -v ON_ERROR_STOP=1 \
  < db/migrations/015-customer-push-notifications.sql
```

Expected: `BEGIN` ... `COMMIT`, không có `ERROR`.

- [ ] **Step 5: Kiểm tra CHECK constraint bằng psql**

Repo không có test chạm DB thật, nên ràng buộc này xác minh thủ công ở đây (một lần, lúc tạo migration):

```bash
docker exec -i beeops-postgres psql -U beeops -d beeops <<'SQL'
-- Ca 1: ca user_id va customer_id -> PHAI loi
INSERT INTO notifications (user_id, customer_id, type, title) VALUES (1, 1, 't', 't');
-- Ca 2: ba cot deu null -> PHAI loi
INSERT INTO notifications (type, title) VALUES ('t', 't');
SQL
```

Expected: cả hai câu đều trả `ERROR: new row for relation "notifications" violates check constraint "notifications_owner_ck"`.

- [ ] **Step 6: Đồng bộ Prisma**

```bash
npx prisma db pull && npm run prisma:generate
```

Sau `db pull`, mở `prisma/schema.prisma` và sửa lại tên camelCase + doc-comment cho ba model (Prisma đặt tên theo cột nên phải chỉnh tay). Model `Notification` phải thành:

```prisma
model Notification {
  id             Int       @id @default(autoincrement())
  userId         Int?      @map("user_id")
  customerId     Int?      @map("customer_id")
  quoteRequestId Int?      @map("quote_request_id")
  orderId        Int?      @map("order_id")
  type           String
  title          String
  body           String?
  isRead         Boolean   @default(false) @map("is_read")
  emailedAt      DateTime? @map("emailed_at") @db.Timestamptz(6)
  pushedAt       DateTime? @map("pushed_at") @db.Timestamptz(6)
  dedupeKey      String?   @map("dedupe_key")
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  user         User?            @relation(fields: [userId], references: [id], onDelete: Cascade)
  customer     CustomerAccount? @relation(fields: [customerId], references: [id], onDelete: Cascade)
  quoteRequest QuoteRequest?    @relation(fields: [quoteRequestId], references: [id], onDelete: Cascade)
  order        Order?           @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([userId, isRead, createdAt(sort: Desc)], map: "notifications_inbox_idx")
  @@index([customerId, isRead, createdAt(sort: Desc)], map: "notifications_cust_inbox_idx")
  @@map("notifications")
}
```

Thêm vào `model QuoteRequest`: `fcmToken String? @map("fcm_token")` và quan hệ ngược `notifications Notification[]`.
Thêm vào `model CustomerAccount`: `pushOff String[] @default([]) @map("push_off")` và `notifications Notification[]`.

- [ ] **Step 7: Chạy toàn bộ test cũ để chắc không vỡ gì**

`user_id` vừa thành nullable nên TypeScript có thể kêu ở chỗ đọc `notification.userId`.

Run: `npx tsc --noEmit && npx jest`
Expected: biên dịch sạch, toàn bộ test cũ PASS.

- [ ] **Step 8: Commit**

```bash
git add db/schema-flow.sql db/migrations/015-customer-push-notifications.sql prisma/schema.prisma
git commit -m "feat(db): hai cot FK chu so huu + outbox push cho notifications"
```

---

### Task 2: FcmService

**Files:**
- Create: `src/common/fcm/fcm.service.ts`
- Create: `src/common/fcm/fcm.service.spec.ts`
- Modify: `src/common/common.module.ts:26-30`
- Modify: `src/common/config/env.validation.ts:57-62`

**Interfaces:**
- Consumes: `ConfigService` từ `@nestjs/config`.
- Produces: `FcmService.sendEach(tokens: string[], msg: FcmMessage): Promise<FcmResult>` với
  `interface FcmMessage { title: string; body: string; data: Record<string, string> }` và
  `interface FcmResult { ok: string[]; dead: string[] }`.
  `FcmService.isEnabled: boolean`.

- [ ] **Step 1: Cài dependency**

```bash
npm install firebase-admin
```

- [ ] **Step 2: Thêm biến môi trường**

Trong `src/common/config/env.validation.ts`, thêm ngay sau khối `APPLE_CLIENT_ID` (dòng 55):

```ts
  // Firebase Admin cho push FCM tới khách hàng. Dán nguyên nội dung file service
  // account JSON vào một biến. Trống => FcmService no-op, app vẫn chạy bình thường
  // (máy dev không cần credential).
  FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string().optional().allow(''),
```

và thêm vào khối cron (sau `QUOTE_EXPIRY_CRON`, dòng 60):

```ts
  PUSH_FLUSH_CRON: Joi.string().default('*/30 * * * * *'),
```

- [ ] **Step 3: Viết test thất bại**

Tạo `src/common/fcm/fcm.service.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { FcmService } from './fcm.service';

const sendEachForMulticast = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: () => ({ sendEachForMulticast }),
}));

const CRED = JSON.stringify({ project_id: 'p', client_email: 'e', private_key: 'k' });

const mkConfig = (json: string): ConfigService =>
  ({ get: () => json }) as unknown as ConfigService;

const MSG = { title: 'Báo giá đã có', body: '12.500.000đ', data: { orderId: '7' } };

describe('FcmService khi chưa cấu hình credential', () => {
  it('isEnabled = false và sendEach không gọi Firebase', async () => {
    const svc = new FcmService(mkConfig(''));
    expect(svc.isEnabled).toBe(false);
    const res = await svc.sendEach(['tok-a'], MSG);
    expect(res).toEqual({ ok: [], dead: [] });
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });
});

describe('FcmService.sendEach', () => {
  beforeEach(() => sendEachForMulticast.mockReset());

  it('tách token sống và token chết theo mã lỗi của Firebase', async () => {
    sendEachForMulticast.mockResolvedValue({
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: false, error: { code: 'messaging/invalid-argument' } },
        { success: false, error: { code: 'messaging/internal-error' } },
      ],
    });
    const svc = new FcmService(mkConfig(CRED));
    const res = await svc.sendEach(['a', 'b', 'c', 'd'], MSG);
    expect(res.ok).toEqual(['a']);
    expect(res.dead.sort()).toEqual(['b', 'c']);
  });

  /**
   * 'messaging/internal-error' là lỗi TẠM THỜI của Firebase. Xếp nó vào dead là
   * tự xoá token còn sống của khách — lần sau họ không nhận được gì nữa.
   */
  it('lỗi tạm thời KHÔNG bị coi là token chết', async () => {
    sendEachForMulticast.mockResolvedValue({
      responses: [{ success: false, error: { code: 'messaging/server-unavailable' } }],
    });
    const svc = new FcmService(mkConfig(CRED));
    expect((await svc.sendEach(['a'], MSG)).dead).toEqual([]);
  });

  it('mảng token rỗng thì không gọi Firebase', async () => {
    const svc = new FcmService(mkConfig(CRED));
    await svc.sendEach([], MSG);
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  /** sendEachForMulticast giới hạn 500 token mỗi lần gọi. */
  it('chia lô 500 token', async () => {
    sendEachForMulticast.mockImplementation(({ tokens }: { tokens: string[] }) =>
      Promise.resolve({ responses: tokens.map(() => ({ success: true })) }),
    );
    const svc = new FcmService(mkConfig(CRED));
    const many = Array.from({ length: 501 }, (_, i) => `tok-${i}`);
    const res = await svc.sendEach(many, MSG);
    expect(sendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(res.ok).toHaveLength(501);
  });

  it('Firebase ném lỗi thì nuốt, trả kết quả rỗng — không làm hỏng cron', async () => {
    sendEachForMulticast.mockRejectedValue(new Error('network down'));
    const svc = new FcmService(mkConfig(CRED));
    await expect(svc.sendEach(['a'], MSG)).resolves.toEqual({ ok: [], dead: [] });
  });
});
```

- [ ] **Step 4: Chạy test để xác nhận thất bại**

Run: `npx jest src/common/fcm/fcm.service.spec.ts`
Expected: FAIL — `Cannot find module './fcm.service'`.

- [ ] **Step 5: Viết implementation**

Tạo `src/common/fcm/fcm.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface FcmMessage {
  title: string;
  body: string;
  /** Payload FE dùng để điều hướng. Giá trị PHẢI là chuỗi — FCM không nhận kiểu khác. */
  data: Record<string, string>;
}

export interface FcmResult {
  ok: string[];
  /** Token Firebase khẳng định không còn tồn tại — người gọi phải xoá khỏi DB. */
  dead: string[];
}

/** Giới hạn cứng của sendEachForMulticast. */
const BATCH = 500;

/**
 * Chỉ hai mã này nghĩa là token thật sự chết. Mọi mã khác (internal-error,
 * server-unavailable, quota-exceeded...) là lỗi TẠM THỜI — xếp chúng vào `dead`
 * là tự tay xoá token còn sống của khách.
 */
const DEAD_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

/**
 * Bọc firebase-admin. Đặt ở common/ chứ không nhét trong customer-auth/: khi nào
 * muốn bắn push cho nhân viên thì chỉ thêm bảng thiết bị, không phải gỡ service
 * ra khỏi module khách.
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  readonly isEnabled: boolean;

  constructor(config: ConfigService) {
    const raw = config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON') ?? '';
    if (!raw) {
      this.isEnabled = false;
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON trống — push FCM tắt, app vẫn chạy');
      return;
    }
    try {
      if (!admin.apps.length)
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(raw) as admin.ServiceAccount),
        });
      this.isEnabled = true;
    } catch (e) {
      // Credential hỏng không được làm app chết lúc khởi động — push là việc phụ.
      this.isEnabled = false;
      this.logger.error({ err: e }, 'Credential Firebase không đọc được — push FCM tắt');
    }
  }

  async sendEach(tokens: string[], msg: FcmMessage): Promise<FcmResult> {
    if (!this.isEnabled || tokens.length === 0) return { ok: [], dead: [] };
    const ok: string[] = [];
    const dead: string[] = [];

    for (let i = 0; i < tokens.length; i += BATCH) {
      const lot = tokens.slice(i, i + BATCH);
      try {
        const res = await admin.messaging().sendEachForMulticast({
          tokens: lot,
          notification: { title: msg.title, body: msg.body },
          data: msg.data,
        });
        res.responses.forEach((r, idx) => {
          if (r.success) ok.push(lot[idx]);
          else if (r.error && DEAD_CODES.has(r.error.code)) dead.push(lot[idx]);
        });
      } catch (e) {
        // Cả lô hỏng: coi như chưa gửi, KHÔNG đánh dấu token nào là chết.
        this.logger.error({ err: e, count: lot.length }, 'Gọi FCM thất bại');
      }
    }
    return { ok, dead };
  }
}
```

- [ ] **Step 6: Chạy test để xác nhận pass**

Run: `npx jest src/common/fcm/fcm.service.spec.ts`
Expected: 6 test PASS.

- [ ] **Step 7: Đăng ký vào CommonModule**

Trong `src/common/common.module.ts`, thêm import `import { FcmService } from './fcm/fcm.service';`, thêm `FcmService` vào cả `providers` và `exports` (module đã có `@Global()` nên mọi module khác dùng được ngay).

- [ ] **Step 8: Chạy toàn bộ test + lint**

Run: `npm run lint && npx tsc --noEmit && npx jest`
Expected: sạch, toàn bộ PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/common/fcm src/common/common.module.ts src/common/config/env.validation.ts
git commit -m "feat(fcm): FcmService bọc firebase-admin, tắt an toàn khi thiếu credential"
```

---

### Task 3: CustomerNotifType + NotifyService.pushCustomer

**Files:**
- Modify: `src/common/enums/index.ts:68-83`
- Modify: `src/modules/notifications/notify.service.ts:1-55`
- Create: `src/modules/notifications/push-customer.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `NotificationEvents` (constructor `NotifyService` hiện tại không đổi).
- Produces:
  - `enum CustomerNotifType` với 7 thành viên: `QUOTE_REQUEST_RECEIVED = 'quote_request_received'`, `QUOTE_READY = 'quote_ready'`, `QUOTE_REQUEST_REJECTED = 'quote_request_rejected'`, `ORDER_CLOSED = 'order_closed'`, `ORDER_MILESTONE = 'order_milestone'`, `ORDER_COMPLETED = 'order_completed'`, `ORDER_CANCELLED = 'order_cancelled'`.
  - `NotifType.QUOTE_REQUEST_NEW = 'quote_request_new'`, `NotifType.QUOTE_REQUEST_FAILED = 'quote_request_failed'`.
  - `interface CustomerNotifyInput { customerId: number | null; quoteRequestId: number | null; orderId?: number | null; type: CustomerNotifType; title: string; body?: string }`
  - `NotifyService.pushCustomer(rows: CustomerNotifyInput[]): Promise<void>`

- [ ] **Step 1: Thêm enum**

Trong `src/common/enums/index.ts`, thêm hai thành viên vào cuối `enum NotifType` (sau `MENTION = 'mention',` dòng 82):

```ts
  QUOTE_REQUEST_NEW = 'quote_request_new',
  QUOTE_REQUEST_FAILED = 'quote_request_failed',
```

và thêm enum mới ngay sau khối `NotifType`:

```ts
/**
 * Loại thông báo gửi cho KHÁCH HÀNG. Tách khỏi NotifType là cố ý: hai bên nói hai
 * ngôn ngữ khác nhau — nhân viên nghe "phòng bạn thắng vòng giá", khách nghe "báo
 * giá của bạn đã có". Gộp chung enum là sớm muộn cũng lộ chữ nội bộ ra mặt khách.
 */
export enum CustomerNotifType {
  QUOTE_REQUEST_RECEIVED = 'quote_request_received',
  QUOTE_READY = 'quote_ready',
  QUOTE_REQUEST_REJECTED = 'quote_request_rejected',
  ORDER_CLOSED = 'order_closed',
  ORDER_MILESTONE = 'order_milestone',
  ORDER_COMPLETED = 'order_completed',
  ORDER_CANCELLED = 'order_cancelled',
}
```

- [ ] **Step 2: Viết test thất bại**

Tạo `src/modules/notifications/push-customer.spec.ts`:

```ts
import { CustomerNotifType } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationEvents } from './notification-events.service';
import { NotifyService } from './notify.service';

const mk = (createMany: jest.Mock) => {
  const events = new NotificationEvents();
  const prisma = { notification: { createMany } } as unknown as PrismaService;
  return { service: new NotifyService(prisma, events), events };
};

const CUSTOMER_ROW = {
  customerId: 7,
  quoteRequestId: 12,
  orderId: 3,
  type: CustomerNotifType.QUOTE_READY,
  title: 'Báo giá đơn BOP-001 đã có',
  body: '12.500.000đ',
};

const GUEST_ROW = {
  customerId: null,
  quoteRequestId: 12,
  type: CustomerNotifType.QUOTE_READY,
  title: 'Báo giá đã có',
};

describe('NotifyService.pushCustomer', () => {
  it('ghi dòng với customerId, KHÔNG đặt userId', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    await mk(createMany).service.pushCustomer([CUSTOMER_ROW]);
    const written = createMany.mock.calls[0][0].data[0];
    expect(written.customerId).toBe(7);
    expect(written.userId).toBeNull();
    expect(written.quoteRequestId).toBe(12);
  });

  /** Khách vãng lai: cả userId lẫn customerId đều null, neo bằng quoteRequestId. */
  it('khách vãng lai ghi được với customerId null', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    await mk(createMany).service.pushCustomer([GUEST_ROW]);
    const written = createMany.mock.calls[0][0].data[0];
    expect(written.customerId).toBeNull();
    expect(written.userId).toBeNull();
    expect(written.quoteRequestId).toBe(12);
  });

  /**
   * SSE là kênh của nhân viên. Bắn sự kiện cho khách vào bus staff thì
   * streamFor(userId) sẽ so customerId với userId — lẫn hai loại người dùng.
   */
  it('KHÔNG đẩy SSE — khách dùng push, không dùng SSE', async () => {
    const { service, events } = mk(jest.fn().mockResolvedValue({ count: 1 }));
    const spy = jest.spyOn(events, 'emit');
    await service.pushCustomer([CUSTOMER_ROW]);
    expect(spy).not.toHaveBeenCalled();
  });

  /** Ghi thông báo là việc PHỤ — không bao giờ được làm hỏng việc chính. */
  it('DB lỗi thì nuốt, không ném ra ngoài', async () => {
    const { service } = mk(jest.fn().mockRejectedValue(new Error('db down')));
    await expect(service.pushCustomer([CUSTOMER_ROW])).resolves.toBeUndefined();
  });

  it('mảng rỗng thì không chạm tới DB', async () => {
    const createMany = jest.fn();
    await mk(createMany).service.pushCustomer([]);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('pushed_at để trống — cron là bên đặt giá trị đó', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    await mk(createMany).service.pushCustomer([CUSTOMER_ROW]);
    expect(createMany.mock.calls[0][0].data[0].pushedAt).toBeUndefined();
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận thất bại**

Run: `npx jest src/modules/notifications/push-customer.spec.ts`
Expected: FAIL — `service.pushCustomer is not a function`.

- [ ] **Step 4: Viết implementation**

Trong `src/modules/notifications/notify.service.ts`, thêm `CustomerNotifType` vào import từ `@/common/enums`, thêm interface sau `NotifyInput` (dòng 14):

```ts
/**
 * Thông báo gửi cho khách. `customerId` null = khách vãng lai; lúc đó
 * `quoteRequestId` là thứ duy nhất neo được dòng này về một cái máy (token nằm ở
 * quote_requests.fcm_token). CHECK notifications_owner_ck ở DB giữ đúng luật này.
 */
export interface CustomerNotifyInput {
  customerId: number | null;
  quoteRequestId: number | null;
  orderId?: number | null;
  type: CustomerNotifType;
  title: string;
  body?: string;
}
```

và thêm method sau `push()` (sau dòng 55):

```ts
  /**
   * Đối xứng push() nhưng cho khách hàng. KHÔNG emit SSE: đó là kênh của nhân
   * viên, và NotificationEvent.userId sẽ bị so nhầm với customerId.
   *
   * Không đặt pushedAt — để null chính là "chưa đẩy", cron flushPush claim sau.
   */
  async pushCustomer(rows: CustomerNotifyInput[]): Promise<void> {
    if (!rows.length) return;
    try {
      await this.prisma.notification.createMany({
        data: rows.map((r) => ({
          userId: null,
          customerId: r.customerId,
          quoteRequestId: r.quoteRequestId,
          orderId: r.orderId ?? null,
          type: r.type,
          title: r.title,
          body: r.body,
        })),
      });
    } catch (e) {
      this.logger.error({ err: e }, 'Ghi thông báo khách hàng thất bại');
    }
  }
```

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npx jest src/modules/notifications/push-customer.spec.ts`
Expected: 6 test PASS.

- [ ] **Step 6: Kiểm tra kích thước file**

Run: `wc -l src/modules/notifications/notify.service.ts`
Expected: dưới 300 (khoảng 130).

- [ ] **Step 7: Chạy toàn bộ test + lint**

Run: `npm run lint && npx tsc --noEmit && npx jest`
Expected: sạch, toàn bộ PASS.

- [ ] **Step 8: Commit**

```bash
git add src/common/enums/index.ts src/modules/notifications/notify.service.ts src/modules/notifications/push-customer.spec.ts
git commit -m "feat(notifications): CustomerNotifType + NotifyService.pushCustomer"
```

---

### Task 4: Cron đẩy push + dọn token chết

**Files:**
- Create: `src/modules/notifications/push.cron.ts`
- Create: `src/modules/notifications/push.cron.spec.ts`
- Modify: `src/modules/notifications/notification.cron.ts:69` (thêm một điều kiện)
- Modify: `src/modules/notifications/notifications.module.ts:8-11`

**Interfaces:**
- Consumes: `FcmService.sendEach` (Task 2), cột `pushed_at` / `customer_id` / `quote_request_id` (Task 1).
- Produces: `PushCron.flushPush(): Promise<void>` — cron tự chạy, không ai gọi tay trừ test.

File riêng chứ không nhét vào `notification.cron.ts` (145 dòng): thêm claim + giải token + dọn token chết vào đó sẽ chạm trần 300 dòng, và trộn hai kênh gửi khác nhau vào một file.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/modules/notifications/push.cron.spec.ts`:

```ts
import { CustomerNotifType } from '@/common/enums';
import { FcmService } from '@/common/fcm/fcm.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PushCron } from './push.cron';

interface Fixture {
  claimed?: Array<{
    id: number;
    customer_id: number | null;
    quote_request_id: number | null;
    order_id: number | null;
    type: string;
    title: string;
    body: string | null;
  }>;
  devices?: Array<{ customerId: number; fcmToken: string }>;
  guests?: Array<{ id: number; fcmToken: string | null }>;
  accounts?: Array<{ id: number; pushOff: string[] }>;
  sendResult?: { ok: string[]; dead: string[] };
}

const ROW = {
  id: 1,
  customer_id: 7,
  quote_request_id: 12,
  order_id: 3,
  type: CustomerNotifType.QUOTE_READY as string,
  title: 'Báo giá đã có',
  body: '12.500.000đ',
};

function mk(f: Fixture) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const deviceDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const qrUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const sendEach = jest.fn().mockResolvedValue(f.sendResult ?? { ok: [], dead: [] });

  const prisma = {
    $transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          $queryRaw: () => Promise.resolve(f.claimed ?? []),
          notification: { updateMany },
        }),
      ),
    customerDevice: {
      findMany: jest.fn().mockResolvedValue(f.devices ?? []),
      deleteMany: deviceDeleteMany,
    },
    quoteRequest: {
      findMany: jest.fn().mockResolvedValue(f.guests ?? []),
      updateMany: qrUpdateMany,
    },
    customerAccount: { findMany: jest.fn().mockResolvedValue(f.accounts ?? []) },
  } as unknown as PrismaService;

  const fcm = { isEnabled: true, sendEach } as unknown as FcmService;
  return { cron: new PushCron(prisma, fcm), updateMany, deviceDeleteMany, qrUpdateMany, sendEach };
}

describe('PushCron.flushPush — giải token', () => {
  it('khách có tài khoản: lấy mọi token trong customer_devices', async () => {
    const { cron, sendEach } = mk({
      claimed: [ROW],
      devices: [
        { customerId: 7, fcmToken: 'tok-dt' },
        { customerId: 7, fcmToken: 'tok-web' },
      ],
    });
    await cron.flushPush();
    expect(sendEach.mock.calls[0][0].sort()).toEqual(['tok-dt', 'tok-web']);
  });

  it('khách vãng lai: lấy token từ quote_requests.fcm_token', async () => {
    const { cron, sendEach } = mk({
      claimed: [{ ...ROW, customer_id: null }],
      guests: [{ id: 12, fcmToken: 'tok-guest' }],
    });
    await cron.flushPush();
    expect(sendEach.mock.calls[0][0]).toEqual(['tok-guest']);
  });

  /**
   * Khách vãng lai đăng ký tài khoản thật trên CÙNG máy: upsert-by-token kéo
   * token về tài khoản, nên cùng một token lọt vào cả hai đường. Không khử trùng
   * lặp thì máy đó rung hai lần cho một việc.
   */
  it('cùng token lọt cả hai đường thì chỉ gửi một lần', async () => {
    const { cron, sendEach } = mk({
      claimed: [ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-x' }],
      guests: [{ id: 12, fcmToken: 'tok-x' }],
    });
    await cron.flushPush();
    expect(sendEach.mock.calls[0][0]).toEqual(['tok-x']);
  });

  it('loại nằm trong push_off thì không gửi', async () => {
    const { cron, sendEach } = mk({
      claimed: [ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-x' }],
      accounts: [{ id: 7, pushOff: [CustomerNotifType.QUOTE_READY] }],
    });
    await cron.flushPush();
    expect(sendEach).not.toHaveBeenCalled();
  });

  it('push_off chứa loại KHÁC thì vẫn gửi', async () => {
    const { cron, sendEach } = mk({
      claimed: [ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-x' }],
      accounts: [{ id: 7, pushOff: [CustomerNotifType.ORDER_MILESTONE] }],
    });
    await cron.flushPush();
    expect(sendEach).toHaveBeenCalled();
  });

  /** Khách chưa cấp quyền thông báo không phải là lỗi — dòng vẫn ở lại hộp thư. */
  it('không có token nào thì vẫn đánh dấu đã xử lý', async () => {
    const { cron, updateMany, sendEach } = mk({ claimed: [ROW], devices: [] });
    await cron.flushPush();
    expect(sendEach).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalled();
  });
});

describe('PushCron.flushPush — đánh dấu và dọn dẹp', () => {
  /**
   * Đặt pushed_at NGAY trong transaction claim, trước khi gọi FCM. Nghĩa là "cron
   * đã xử lý", không phải "đã gửi" — giống hệt emailed_at. Thà mất một push khi
   * process chết giữa chừng còn hơn bắn trùng mỗi 30 giây.
   */
  it('đặt pushed_at trong transaction claim, trước khi gọi FCM', async () => {
    const order: string[] = [];
    const { cron, updateMany, sendEach } = mk({
      claimed: [ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-x' }],
    });
    updateMany.mockImplementation(() => {
      order.push('mark');
      return Promise.resolve({ count: 1 });
    });
    sendEach.mockImplementation(() => {
      order.push('send');
      return Promise.resolve({ ok: ['tok-x'], dead: [] });
    });
    await cron.flushPush();
    expect(order).toEqual(['mark', 'send']);
  });

  it('token chết thì xoá customer_devices và clear quote_requests.fcm_token', async () => {
    const { cron, deviceDeleteMany, qrUpdateMany } = mk({
      claimed: [ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-dead' }],
      sendResult: { ok: [], dead: ['tok-dead'] },
    });
    await cron.flushPush();
    expect(deviceDeleteMany).toHaveBeenCalledWith({ where: { fcmToken: { in: ['tok-dead'] } } });
    expect(qrUpdateMany).toHaveBeenCalledWith({
      where: { fcmToken: { in: ['tok-dead'] } },
      data: { fcmToken: null },
    });
  });

  it('không có token chết thì không đụng tới DB thiết bị', async () => {
    const { cron, deviceDeleteMany, qrUpdateMany } = mk({
      claimed: [ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-x' }],
      sendResult: { ok: ['tok-x'], dead: [] },
    });
    await cron.flushPush();
    expect(deviceDeleteMany).not.toHaveBeenCalled();
    expect(qrUpdateMany).not.toHaveBeenCalled();
  });

  it('không claim được dòng nào thì thoát sớm, không gọi FCM', async () => {
    const { cron, updateMany, sendEach } = mk({ claimed: [] });
    await cron.flushPush();
    expect(updateMany).not.toHaveBeenCalled();
    expect(sendEach).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx jest src/modules/notifications/push.cron.spec.ts`
Expected: FAIL — `Cannot find module './push.cron'`.

- [ ] **Step 3: Viết implementation**

Tạo `src/modules/notifications/push.cron.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { FcmService } from '@/common/fcm/fcm.service';
import { PrismaService } from '@/common/prisma/prisma.service';

/** Dòng đã claim. Tên cột snake_case vì đi thẳng từ $queryRaw. */
interface PendingPush {
  id: number;
  customer_id: number | null;
  quote_request_id: number | null;
  order_id: number | null;
  type: string;
  title: string;
  body: string | null;
}

const CLAIM_LIMIT = 100;

/**
 * Đẩy thông báo của KHÁCH ra FCM. Tách khỏi NotificationCron (kênh email của nhân
 * viên) — hai kênh, hai vòng đời, hai file.
 *
 * Cùng khuôn với flushEmails: BƯỚC 1 claim trong transaction (khóa chỉ sống tới
 * COMMIT), BƯỚC 2 gửi ngoài.
 */
@Injectable()
export class PushCron {
  private readonly logger = new Logger(PushCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
  ) {}

  @Cron(process.env.PUSH_FLUSH_CRON ?? '*/30 * * * * *')
  async flushPush(): Promise<void> {
    const claimed = await this.claim();
    if (!claimed.length) return;

    const tokensOf = await this.resolveTokens(claimed);
    const dead = new Set<string>();

    for (const row of claimed) {
      const tokens = tokensOf.get(row.id) ?? [];
      if (!tokens.length) continue;
      const res = await this.fcm.sendEach(tokens, {
        title: row.title,
        body: row.body ?? '',
        data: {
          type: row.type,
          orderId: String(row.order_id ?? ''),
          quoteRequestId: String(row.quote_request_id ?? ''),
        },
      });
      res.dead.forEach((t) => dead.add(t));
    }

    await this.dropDeadTokens([...dead]);
  }

  /**
   * `user_id IS NULL` là bộ lọc duy nhất cần thiết để loại thông báo nhân viên —
   * khớp đúng partial index notifications_push_idx.
   *
   * Đặt pushed_at NGAY ở đây, trước khi gọi FCM: giá trị này nghĩa là "cron đã xử
   * lý", không phải "đã gửi". Thà mất một push khi process chết giữa chừng còn hơn
   * bắn trùng mỗi vòng cron.
   */
  private async claim(): Promise<PendingPush[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PendingPush[]>`
        SELECT id, customer_id, quote_request_id, order_id, type, title, body
        FROM notifications
        WHERE pushed_at IS NULL AND user_id IS NULL
        ORDER BY created_at
        LIMIT ${CLAIM_LIMIT}
        FOR UPDATE SKIP LOCKED`;
      if (rows.length)
        await tx.notification.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { pushedAt: new Date() },
        });
      return rows;
    });
  }

  /** id thông báo -> danh sách token đã khử trùng lặp và đã lọc push_off. */
  private async resolveTokens(rows: PendingPush[]): Promise<Map<number, string[]>> {
    const customerIds = [...new Set(rows.map((r) => r.customer_id).filter((x): x is number => x !== null))];
    const guestQrIds = [
      ...new Set(
        rows.filter((r) => r.customer_id === null)
          .map((r) => r.quote_request_id)
          .filter((x): x is number => x !== null),
      ),
    ];

    const [devices, guests, accounts] = await Promise.all([
      customerIds.length
        ? this.prisma.customerDevice.findMany({
            where: { customerId: { in: customerIds } },
            select: { customerId: true, fcmToken: true },
          })
        : Promise.resolve([]),
      guestQrIds.length
        ? this.prisma.quoteRequest.findMany({
            where: { id: { in: guestQrIds }, fcmToken: { not: null } },
            select: { id: true, fcmToken: true },
          })
        : Promise.resolve([]),
      customerIds.length
        ? this.prisma.customerAccount.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, pushOff: true },
          })
        : Promise.resolve([]),
    ]);

    const byCustomer = new Map<number, string[]>();
    for (const d of devices)
      byCustomer.set(d.customerId, [...(byCustomer.get(d.customerId) ?? []), d.fcmToken]);
    const byGuest = new Map(guests.map((g) => [g.id, g.fcmToken as string]));
    const offOf = new Map(accounts.map((a) => [a.id, new Set(a.pushOff)]));

    const out = new Map<number, string[]>();
    for (const r of rows) {
      if (r.customer_id !== null) {
        if (offOf.get(r.customer_id)?.has(r.type)) continue;
        // Set: khách vãng lai đăng ký thật trên cùng máy thì một token lọt cả hai
        // đường, gửi hai lần là máy đó rung hai lần cho một việc.
        out.set(r.id, [...new Set(byCustomer.get(r.customer_id) ?? [])]);
        continue;
      }
      const guest = r.quote_request_id !== null ? byGuest.get(r.quote_request_id) : undefined;
      out.set(r.id, guest ? [guest] : []);
    }
    return out;
  }

  /**
   * Không dọn thì token chết tích tụ và mỗi vòng cron tốn một round-trip để nhận
   * lại đúng một lỗi.
   */
  private async dropDeadTokens(tokens: string[]): Promise<void> {
    if (!tokens.length) return;
    try {
      const where: Prisma.StringFilter = { in: tokens };
      await this.prisma.customerDevice.deleteMany({ where: { fcmToken: where } });
      await this.prisma.quoteRequest.updateMany({
        where: { fcmToken: where },
        data: { fcmToken: null },
      });
    } catch (e) {
      this.logger.error({ err: e, count: tokens.length }, 'Dọn token chết thất bại');
    }
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx jest src/modules/notifications/push.cron.spec.ts`
Expected: 10 test PASS.

- [ ] **Step 5: Vá hiệu năng cho flushEmails**

Trong `src/modules/notifications/notification.cron.ts`, sửa dòng 69:

```ts
        WHERE n.emailed_at IS NULL AND n.user_id IS NOT NULL
```

Thêm ngay trên doc-comment của `flushEmails` (nối vào khối comment dòng 55-60) một câu:

```ts
   * `user_id IS NOT NULL` loại thông báo của khách: họ không nhận email nên
   * emailed_at ở null vĩnh viễn và sẽ bị quét lại mỗi hai phút. Tính đúng-sai đã
   * an toàn sẵn nhờ INNER JOIN users — đây chỉ là để bảng quét không phình.
```

- [ ] **Step 6: Đăng ký PushCron vào module**

Trong `src/modules/notifications/notifications.module.ts`, thêm `import { PushCron } from './push.cron';` và thêm `PushCron` vào mảng `providers`.

- [ ] **Step 7: Chạy toàn bộ test + lint + kiểm tra kích thước file**

Run: `npm run lint && npx tsc --noEmit && npx jest && wc -l src/modules/notifications/push.cron.ts`
Expected: sạch, toàn bộ PASS, `push.cron.ts` dưới 300 dòng.

- [ ] **Step 8: Commit**

```bash
git add src/modules/notifications/push.cron.ts src/modules/notifications/push.cron.spec.ts src/modules/notifications/notification.cron.ts src/modules/notifications/notifications.module.ts
git commit -m "feat(notifications): cron đẩy push FCM 30s + dọn token chết"
```

---

### Task 5: CustomerNotifyService + bắn khi chốt giá

**Files:**
- Create: `src/modules/notifications/customer-notify.service.ts`
- Create: `src/modules/notifications/customer-notify.service.spec.ts`
- Modify: `src/modules/notifications/notifications.module.ts`
- Modify: `src/modules/quotes/selection.service.ts:14-20` (constructor), `:88-89` (cuối `selectQuote`)
- Modify: `src/modules/quotes/quotes.module.ts`

**Interfaces:**
- Consumes: `NotifyService.pushCustomer` (Task 3), `CustomerNotifType` (Task 3).
- Produces: `CustomerNotifyService` với các method (Task 6 và 8 dùng tiếp):
  - `quoteReady(orderId: number, departmentId: number): Promise<void>`
  - `quoteRequestReceived(quoteRequestId: number): Promise<void>`
  - `quoteRequestRejected(quoteRequestId: number, reason: string): Promise<void>`
  - `orderEvent(orderId: number, type: CustomerNotifType, title: string, body?: string): Promise<void>`

Đây là tầng **format nội dung**; `NotifyService.pushCustomer` là tầng **ghi dòng**. Tách vì hai trách nhiệm khác nhau, và vì nhờ nó mỗi điểm gọi ở `orders.service.ts` (280 dòng) chỉ tốn 1 dòng — trần 300 dòng của repo không cho phép nhét format vào đó.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/modules/notifications/customer-notify.service.spec.ts`:

```ts
import { CustomerNotifType } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotifyService } from './customer-notify.service';
import { NotifyService } from './notify.service';

interface Fixture {
  quoteRequest?: { id: number; customerId: number | null } | null;
  order?: { code: string } | null;
  dept?: { amount: unknown } | null;
}

function mk(f: Fixture) {
  const pushCustomer = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    quoteRequest: {
      findFirst: jest.fn().mockResolvedValue(f.quoteRequest ?? null),
      findUnique: jest.fn().mockResolvedValue(f.quoteRequest ?? null),
    },
    order: { findUnique: jest.fn().mockResolvedValue(f.order ?? null) },
    orderDepartment: { findUnique: jest.fn().mockResolvedValue(f.dept ?? null) },
  } as unknown as PrismaService;
  const notify = { pushCustomer } as unknown as NotifyService;
  return { svc: new CustomerNotifyService(prisma, notify), pushCustomer };
}

describe('CustomerNotifyService.quoteReady', () => {
  const BASE = {
    quoteRequest: { id: 12, customerId: 7 },
    order: { code: 'BOP-250914-01' },
    dept: { amount: 12_500_000 },
  };

  it('bắn cho khách đã gửi yêu cầu, kèm mã đơn và số tiền', async () => {
    const { svc, pushCustomer } = mk(BASE);
    await svc.quoteReady(3, 5);
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.customerId).toBe(7);
    expect(row.quoteRequestId).toBe(12);
    expect(row.orderId).toBe(3);
    expect(row.type).toBe(CustomerNotifType.QUOTE_READY);
    expect(row.title).toContain('BOP-250914-01');
    expect(row.body).toContain('12.500.000');
  });

  /** Đơn do Sale tự tạo, không từ khách nào. Ca bình thường, không phải lỗi. */
  it('đơn không sinh từ yêu cầu báo giá thì không bắn gì', async () => {
    const { svc, pushCustomer } = mk({ ...BASE, quoteRequest: null });
    await svc.quoteReady(3, 5);
    expect(pushCustomer).not.toHaveBeenCalled();
  });

  it('khách vãng lai (customerId null) vẫn bắn, neo bằng quoteRequestId', async () => {
    const { svc, pushCustomer } = mk({ ...BASE, quoteRequest: { id: 12, customerId: null } });
    await svc.quoteReady(3, 5);
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.customerId).toBeNull();
    expect(row.quoteRequestId).toBe(12);
  });

  /** Chốt giá mà phòng thắng chưa điền amount: vẫn phải báo, chỉ là không có số. */
  it('chưa có amount thì vẫn bắn, body không kèm tiền', async () => {
    const { svc, pushCustomer } = mk({ ...BASE, dept: { amount: null } });
    await svc.quoteReady(3, 5);
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.title).toContain('BOP-250914-01');
    expect(row.body).toBeUndefined();
  });
});

describe('CustomerNotifyService.quoteRequestReceived', () => {
  it('bắn xác nhận đã nhận yêu cầu', async () => {
    const { svc, pushCustomer } = mk({ quoteRequest: { id: 12, customerId: 7 } });
    await svc.quoteRequestReceived(12);
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.type).toBe(CustomerNotifType.QUOTE_REQUEST_RECEIVED);
    expect(row.quoteRequestId).toBe(12);
    expect(row.customerId).toBe(7);
  });

  it('yêu cầu không tồn tại thì im lặng', async () => {
    const { svc, pushCustomer } = mk({ quoteRequest: null });
    await svc.quoteRequestReceived(99);
    expect(pushCustomer).not.toHaveBeenCalled();
  });
});

describe('CustomerNotifyService.quoteRequestRejected', () => {
  it('bắn kèm lý do từ chối', async () => {
    const { svc, pushCustomer } = mk({ quoteRequest: { id: 12, customerId: 7 } });
    await svc.quoteRequestRejected(12, 'Ngoài phạm vi phục vụ');
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.type).toBe(CustomerNotifType.QUOTE_REQUEST_REJECTED);
    expect(row.body).toContain('Ngoài phạm vi phục vụ');
  });
});

describe('CustomerNotifyService.orderEvent', () => {
  it('tra ngược khách từ orderId rồi bắn', async () => {
    const { svc, pushCustomer } = mk({
      quoteRequest: { id: 12, customerId: 7 },
      order: { code: 'BOP-250914-01' },
    });
    await svc.orderEvent(3, CustomerNotifType.ORDER_CLOSED, 'Đơn đã chốt', 'Cảm ơn bạn');
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.type).toBe(CustomerNotifType.ORDER_CLOSED);
    expect(row.orderId).toBe(3);
    expect(row.customerId).toBe(7);
  });

  it('đơn không từ khách nào thì không bắn', async () => {
    const { svc, pushCustomer } = mk({ quoteRequest: null, order: { code: 'BOP-1' } });
    await svc.orderEvent(3, CustomerNotifType.ORDER_CLOSED, 'Đơn đã chốt');
    expect(pushCustomer).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx jest src/modules/notifications/customer-notify.service.spec.ts`
Expected: FAIL — `Cannot find module './customer-notify.service'`.

- [ ] **Step 3: Viết implementation**

Tạo `src/modules/notifications/customer-notify.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { CustomerNotifType } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotifyService } from './notify.service';

/** Chủ sở hữu thông báo phía khách: có tài khoản, hoặc chỉ có yêu cầu báo giá. */
interface CustomerRef {
  customerId: number | null;
  quoteRequestId: number;
}

const money = (v: unknown): string | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString('vi-VN')}đ` : undefined;
};

/**
 * Tầng FORMAT nội dung thông báo cho khách. Tầng ghi dòng là
 * NotifyService.pushCustomer — tách ra vì hai trách nhiệm khác nhau, và vì nhờ
 * thế mỗi điểm gọi trong orders/quotes/milestones chỉ tốn một dòng (trần 300
 * dòng mỗi file của repo).
 *
 * Mọi method đều IM LẶNG khi không tìm ra khách: đơn do Sale tự tạo không đến từ
 * yêu cầu báo giá nào, đó là ca bình thường chứ không phải lỗi.
 */
@Injectable()
export class CustomerNotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  /** Tra ngược từ đơn về khách qua quote_requests.converted_to_order_id. */
  private async refOfOrder(orderId: number): Promise<CustomerRef | null> {
    const qr = await this.prisma.quoteRequest.findFirst({
      where: { convertedToOrderId: orderId },
      select: { id: true, customerId: true },
    });
    return qr ? { customerId: qr.customerId, quoteRequestId: qr.id } : null;
  }

  private async refOfRequest(quoteRequestId: number): Promise<CustomerRef | null> {
    const qr = await this.prisma.quoteRequest.findUnique({
      where: { id: quoteRequestId },
      select: { id: true, customerId: true },
    });
    return qr ? { customerId: qr.customerId, quoteRequestId: qr.id } : null;
  }

  /** Sale chốt giá — đơn sang awaiting_customer. Loại thông báo chính của luồng này. */
  async quoteReady(orderId: number, departmentId: number): Promise<void> {
    const ref = await this.refOfOrder(orderId);
    if (!ref) return;
    const [order, dept] = await Promise.all([
      this.prisma.order.findUnique({ where: { id: orderId }, select: { code: true } }),
      this.prisma.orderDepartment.findUnique({
        where: { orderId_departmentId: { orderId, departmentId } },
        select: { amount: true },
      }),
    ]);
    if (!order) return;
    await this.notify.pushCustomer([
      {
        ...ref,
        orderId,
        type: CustomerNotifType.QUOTE_READY,
        title: `Báo giá đơn ${order.code} đã có`,
        body: money(dept?.amount),
      },
    ]);
  }

  /**
   * Không có cái này thì khách gửi form xong không thấy hồi âm sẽ gửi lại lần hai,
   * lần ba, và Sale nhận ba yêu cầu trùng.
   */
  async quoteRequestReceived(quoteRequestId: number): Promise<void> {
    const ref = await this.refOfRequest(quoteRequestId);
    if (!ref) return;
    await this.notify.pushCustomer([
      {
        ...ref,
        type: CustomerNotifType.QUOTE_REQUEST_RECEIVED,
        title: `Đã nhận yêu cầu báo giá #${quoteRequestId}`,
        body: 'Chúng tôi sẽ gửi báo giá tới bạn trong thời gian sớm nhất.',
      },
    ]);
  }

  async quoteRequestRejected(quoteRequestId: number, reason: string): Promise<void> {
    const ref = await this.refOfRequest(quoteRequestId);
    if (!ref) return;
    await this.notify.pushCustomer([
      {
        ...ref,
        type: CustomerNotifType.QUOTE_REQUEST_REJECTED,
        title: `Yêu cầu báo giá #${quoteRequestId} chưa thể tiếp nhận`,
        body: `Lý do: ${reason}`,
      },
    ]);
  }

  /** Dùng chung cho mọi sự kiện ở tầng đơn hàng (chốt, huỷ, mốc, hoàn thành). */
  async orderEvent(
    orderId: number,
    type: CustomerNotifType,
    title: string,
    body?: string,
  ): Promise<void> {
    const ref = await this.refOfOrder(orderId);
    if (!ref) return;
    await this.notify.pushCustomer([{ ...ref, orderId, type, title, body }]);
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx jest src/modules/notifications/customer-notify.service.spec.ts`
Expected: 9 test PASS.

- [ ] **Step 5: Export service khỏi module**

Trong `src/modules/notifications/notifications.module.ts`, thêm import `CustomerNotifyService`, đưa vào `providers` **và** `exports` (các module khác sẽ inject).

- [ ] **Step 6: Nối vào selectQuote**

Trong `src/modules/quotes/selection.service.ts`:

Thêm import `import { CustomerNotifyService } from '../notifications/customer-notify.service';`, thêm vào constructor (sau `notify`):

```ts
    private readonly customerNotify: CustomerNotifyService,
```

Thêm ngay sau vòng `for (const d of order.departments) { ... }` trong `selectQuote` (sau dòng 89, trước dấu `}` đóng method):

```ts
    // Khách đã gửi yêu cầu báo giá cần biết giá đã chốt. Gọi SAU vòng bắn cho các
    // phòng và không await chung try — thông báo cho khách hỏng không được làm
    // hỏng việc đã commit.
    await this.customerNotify.quoteReady(orderId, dto.departmentId);
```

Trong `src/modules/quotes/quotes.module.ts`, bảo đảm `NotificationsModule` đã nằm trong `imports` (nếu chưa thì thêm).

- [ ] **Step 7: Chạy toàn bộ test + lint + kiểm tra kích thước file**

Run: `npm run lint && npx tsc --noEmit && npx jest && wc -l src/modules/quotes/selection.service.ts src/modules/notifications/customer-notify.service.ts`
Expected: sạch, toàn bộ PASS, cả hai file dưới 300 dòng.

- [ ] **Step 8: Commit**

```bash
git add src/modules/notifications/customer-notify.service.ts src/modules/notifications/customer-notify.service.spec.ts src/modules/notifications/notifications.module.ts src/modules/quotes/selection.service.ts src/modules/quotes/quotes.module.ts
git commit -m "feat(quotes): chốt giá bắn thông báo về khách đã gửi yêu cầu"
```

---

### Task 6: Nhận token lúc gửi yêu cầu + hai thông báo tầng yêu cầu

**Files:**
- Modify: `src/modules/quote-requests/dto/quote-request.dto.ts:8-33`
- Modify: `src/modules/quote-requests/quote-request.service.ts:29-33` (constructor), `:113-128` (create), `:221-233` (reject)
- Modify: `src/modules/quote-requests/quote-request.module.ts`
- Create: `src/modules/quote-requests/quote-request-notify.spec.ts`

**Interfaces:**
- Consumes: `CustomerNotifyService.quoteRequestReceived`, `.quoteRequestRejected` (Task 5).
- Produces: `CreateQuoteRequestDto.fcmToken?: string`, `CreateQuoteRequestDto.platform?: DevicePlatform`.

- [ ] **Step 1: Thêm hai field vào DTO**

Trong `src/modules/quote-requests/dto/quote-request.dto.ts`, thêm import `import { DEVICE_PLATFORMS, DevicePlatform } from '@/modules/customer-auth/dto/profile.dto';` và `IsIn` vào danh sách import từ `class-validator`. Thêm vào cuối `CreateQuoteRequestDto` (sau `note`):

```ts
  /**
   * Token FCM của máy đang gửi form. CHỈ dùng cho khách VÃNG LAI — khách đã đăng
   * nhập thì token của họ nằm ở customer_devices rồi. Không tạo tài khoản tạm:
   * customer_accounts.email là UNIQUE NOT NULL nhưng form này cho bỏ trống email.
   */
  @ApiPropertyOptional({ description: 'FCM token để nhận thông báo khi có báo giá' })
  @IsOptional() @IsString() @MinLength(20) @MaxLength(512)
  fcmToken?: string;

  @ApiPropertyOptional({ enum: DEVICE_PLATFORMS })
  @IsOptional() @IsIn(DEVICE_PLATFORMS)
  platform?: DevicePlatform;
```

- [ ] **Step 2: Viết test thất bại**

Tạo `src/modules/quote-requests/quote-request-notify.spec.ts`:

```ts
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotifyService } from '@/modules/notifications/customer-notify.service';
import { NotifyService } from '@/modules/notifications/notify.service';
import { OrdersService } from '../orders/orders.service';
import { QuoteRequestService } from './quote-request.service';

const TOKEN = 'fGx9_tokenFCMdaikhoang150kytu:APA91bH-xxxxxxxxxxxxxxxxxxxx';

interface Fixture {
  service?: { id: number; isActive: boolean } | null;
  createdRow?: { id: number };
}

function mk(f: Fixture = {}) {
  const create = jest.fn().mockResolvedValue(f.createdRow ?? { id: 12 });
  const quoteRequestReceived = jest.fn().mockResolvedValue(undefined);
  const quoteRequestRejected = jest.fn().mockResolvedValue(undefined);
  const push = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    service: { findUnique: jest.fn().mockResolvedValue(f.service ?? null) },
    quoteRequest: {
      create,
      update: jest.fn().mockResolvedValue({ id: 12, status: 'rejected' }),
      findUnique: jest.fn().mockResolvedValue({ id: 12, status: 'pending' }),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) },
  } as unknown as PrismaService;

  const svc = new QuoteRequestService(
    prisma,
    { log: jest.fn() } as unknown as ActivityService,
    {} as OrdersService,
    { quoteRequestReceived, quoteRequestRejected } as unknown as CustomerNotifyService,
    {
      push,
      admins: jest.fn().mockResolvedValue([1]),
      adminsAndSales: jest.fn().mockResolvedValue([1]),
    } as unknown as NotifyService,
  );
  return { svc, create, quoteRequestReceived, quoteRequestRejected, push };
}

const DTO = { customerName: 'Cty ABC', phone: '0900000000' };

describe('QuoteRequestService.create — lưu FCM token của khách vãng lai', () => {
  it('ghi fcmToken vào quote_requests khi DTO có token', async () => {
    const { svc, create } = mk();
    await svc.create({ ...DTO, fcmToken: TOKEN }, null, null);
    expect(create.mock.calls[0][0].data.fcmToken).toBe(TOKEN);
  });

  it('không có token thì ghi null, không ghi undefined', async () => {
    const { svc, create } = mk();
    await svc.create(DTO, null, null);
    expect(create.mock.calls[0][0].data.fcmToken).toBeNull();
  });

  it('bắn thông báo xác nhận đã nhận yêu cầu', async () => {
    const { svc, quoteRequestReceived } = mk();
    await svc.create(DTO, null, null);
    expect(quoteRequestReceived).toHaveBeenCalledWith(12);
  });
});

describe('QuoteRequestService.reject', () => {
  it('bắn thông báo từ chối kèm lý do cho khách', async () => {
    const { svc, quoteRequestRejected } = mk();
    await svc.reject(12, 'Ngoài phạm vi phục vụ', { id: 1 } as never);
    expect(quoteRequestRejected).toHaveBeenCalledWith(12, 'Ngoài phạm vi phục vụ');
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận thất bại**

Run: `npx jest src/modules/quote-requests/quote-request-notify.spec.ts`
Expected: FAIL — constructor `QuoteRequestService` chưa nhận 5 tham số.

- [ ] **Step 4: Viết implementation**

Trong `src/modules/quote-requests/quote-request.service.ts`:

Thêm import:

```ts
import { CustomerNotifyService } from '../notifications/customer-notify.service';
import { NotifyService } from '../notifications/notify.service';
```

Thêm hai tham số vào constructor (sau `orders`):

```ts
    private readonly customerNotify: CustomerNotifyService,
    private readonly notify: NotifyService,
```

Trong `create()`, thêm `fcmToken` vào `data` của `prisma.quoteRequest.create` (sau `customerId`):

```ts
        fcmToken: dto.fcmToken ?? null,
```

Thêm ngay sau khối `await this.activity.log(...)` của `create()` (sau dòng 128):

```ts
    // Xác nhận đã nhận — khách không thấy hồi âm sẽ gửi lại nhiều lần.
    await this.customerNotify.quoteRequestReceived(row.id);
```

Trong `reject()`, thêm ngay sau `await this.activity.log(...)` (sau dòng 232):

```ts
    await this.customerNotify.quoteRequestRejected(id, reason);
```

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npx jest src/modules/quote-requests/quote-request-notify.spec.ts`
Expected: 4 test PASS.

- [ ] **Step 6: Nối module**

Trong `src/modules/quote-requests/quote-request.module.ts`, thêm `NotificationsModule` vào `imports` nếu chưa có.

- [ ] **Step 7: Chạy toàn bộ test + lint + kiểm tra kích thước file**

Run: `npm run lint && npx tsc --noEmit && npx jest && wc -l src/modules/quote-requests/quote-request.service.ts`
Expected: sạch, toàn bộ PASS, file dưới 300 dòng.

- [ ] **Step 8: Commit**

```bash
git add src/modules/quote-requests
git commit -m "feat(quote-requests): nhận FCM token khách vãng lai + báo đã nhận/từ chối"
```

---

### Task 7: Vá hai ca yêu cầu báo giá đang im lặng

**Files:**
- Modify: `src/modules/quote-requests/quote-request.service.ts:131-170` (nhánh auto-convert)
- Create: `src/modules/quote-requests/quote-request-staff-notify.spec.ts`

**Interfaces:**
- Consumes: `NotifyService.push`, `NotifyService.admins` (đã có), `NotifType.QUOTE_REQUEST_NEW`, `NotifType.QUOTE_REQUEST_FAILED` (Task 3).
- Produces: không có gì cho task sau.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/modules/quote-requests/quote-request-staff-notify.spec.ts`:

```ts
import { ActivityService } from '@/common/activity/activity.service';
import { NotifType, Role } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotifyService } from '@/modules/notifications/customer-notify.service';
import { NotifyService } from '@/modules/notifications/notify.service';
import { OrdersService } from '../orders/orders.service';
import { QuoteRequestService } from './quote-request.service';

function mk(opts: { serviceId?: number; convertThrows?: boolean } = {}) {
  const push = jest.fn().mockResolvedValue(undefined);
  const ordersCreate = opts.convertThrows
    ? jest.fn().mockRejectedValue(new Error('không định tuyến được'))
    : jest.fn().mockResolvedValue({ id: 55 });

  const prisma = {
    service: {
      findUnique: jest.fn().mockResolvedValue(
        opts.serviceId ? { id: opts.serviceId, isActive: true } : null,
      ),
    },
    quoteRequest: {
      create: jest.fn().mockResolvedValue({ id: 12 }),
      update: jest.fn().mockResolvedValue({ id: 12 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 1, isActive: true, roles: [Role.SALE], email: 'a@b.c',
        fullName: 'Sale', departmentId: null, canViewCompanyReport: false,
        mustChangePassword: false,
      }),
      findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
    },
  } as unknown as PrismaService;

  const svc = new QuoteRequestService(
    prisma,
    { log: jest.fn() } as unknown as ActivityService,
    { create: ordersCreate } as unknown as OrdersService,
    {
      quoteRequestReceived: jest.fn().mockResolvedValue(undefined),
      quoteRequestRejected: jest.fn().mockResolvedValue(undefined),
    } as unknown as CustomerNotifyService,
    {
      push,
      admins: jest.fn().mockResolvedValue([1, 2]),
      adminsAndSales: jest.fn().mockResolvedValue([1, 2]),
    } as unknown as NotifyService,
  );
  return { svc, push };
}

const DTO = { customerName: 'Cty ABC', phone: '0900000000' };

/**
 * Yêu cầu không có serviceId thì KHÔNG auto-convert, nên không sinh Order, nên
 * NEW_ORDER (gắn vào Order) không bắn. Trước khi vá, ca này không báo cho ai và
 * bản ghi nằm im ở status='pending'.
 */
describe('yêu cầu báo giá không có dịch vụ', () => {
  it('bắn quote_request_new cho Admin và Sale', async () => {
    const { svc, push } = mk();
    await svc.create(DTO, null, null);
    const rows = push.mock.calls.flatMap((c) => c[0]);
    const news = rows.filter((r: { type: string }) => r.type === NotifType.QUOTE_REQUEST_NEW);
    expect(news.map((r: { userId: number }) => r.userId).sort()).toEqual([1, 2]);
    expect(news[0].quoteRequestId).toBe(12);
  });

  it('không gắn orderId — lúc bắn chưa có đơn nào', async () => {
    const { svc, push } = mk();
    await svc.create(DTO, null, null);
    const row = push.mock.calls.flatMap((c) => c[0])
      .find((r: { type: string }) => r.type === NotifType.QUOTE_REQUEST_NEW);
    expect(row.orderId).toBeUndefined();
  });
});

/** Có serviceId thì notifyNewOrder đã lo — không được bắn trùng thêm lần nữa. */
describe('yêu cầu báo giá CÓ dịch vụ và convert thành công', () => {
  it('KHÔNG bắn quote_request_new', async () => {
    const { svc, push } = mk({ serviceId: 4 });
    await svc.create({ ...DTO, serviceId: 4 }, null, null);
    const rows = push.mock.calls.flatMap((c) => c[0]);
    expect(rows.some((r: { type: string }) => r.type === NotifType.QUOTE_REQUEST_NEW)).toBe(false);
  });
});

/** Trước khi vá, lỗi này chỉ vào activity log và không ai biết có việc hỏng. */
describe('auto-convert ném lỗi', () => {
  it('bắn quote_request_failed cho Admin', async () => {
    const { svc, push } = mk({ serviceId: 4, convertThrows: true });
    await svc.create({ ...DTO, serviceId: 4 }, null, null);
    const rows = push.mock.calls.flatMap((c) => c[0]);
    const failed = rows.filter((r: { type: string }) => r.type === NotifType.QUOTE_REQUEST_FAILED);
    expect(failed).toHaveLength(2);
    expect(failed[0].quoteRequestId).toBe(12);
  });

  it('vẫn không ném lỗi ra ngoài — yêu cầu của khách đã được lưu', async () => {
    const { svc } = mk({ serviceId: 4, convertThrows: true });
    await expect(svc.create({ ...DTO, serviceId: 4 }, null, null)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx jest src/modules/quote-requests/quote-request-staff-notify.spec.ts`
Expected: FAIL — không có dòng `quote_request_new` nào được bắn.

- [ ] **Step 3: Mở rộng NotifyInput để mang quoteRequestId**

Trong `src/modules/notifications/notify.service.ts`, thêm field vào `NotifyInput` (sau `orderId`):

```ts
  /** Ngữ cảnh cho thông báo ở tầng yêu cầu báo giá — lúc đó chưa có đơn nào. */
  quoteRequestId?: number | null;
```

và thêm vào phần map trong `push()` (sau `orderId`):

```ts
          quoteRequestId: r.quoteRequestId ?? null,
```

- [ ] **Step 4: Thêm `adminsAndSales()` vào NotifyService**

`notify.admins()` hiện chỉ trả role `admin` (`notify.service.ts:88-95`). `QUOTE_REQUEST_NEW` cần cả Sale — họ là người xử lý yêu cầu báo giá. Thêm method mới ngay sau `admins()`, **không sửa `admins()`** (ba chỗ khác đang dùng nó với ý nghĩa "chỉ Admin"):

```ts
  /** Admin VÀ Sale — hai vai trò chịu trách nhiệm yêu cầu báo giá chưa vào đơn. */
  async adminsAndSales(): Promise<number[]> {
    const rows = await this.prisma.user.findMany({
      where: { isActive: true, roles: { hasSome: [Role.ADMIN, Role.SALE] } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
```

Thêm `Role` vào import từ `@/common/enums` trong `notify.service.ts`.

- [ ] **Step 5: Viết implementation ở QuoteRequestService**

Trong `src/modules/quote-requests/quote-request.service.ts`, thêm `NotifType` vào import từ `@/common/enums`, rồi thêm một private method trước `create()`:

```ts
  /**
   * Hai ca yêu cầu báo giá trước đây rơi vào im lặng hoàn toàn:
   * - không có serviceId  -> không convert -> không sinh Order -> NEW_ORDER không bắn
   * - auto-convert ném lỗi -> chỉ vào activity log
   * Cả hai đều để bản ghi nằm im ở status='pending' tới khi có người tình cờ mở.
   *
   * Nhận sẵn `recipients` thay vì tự gọi: hai ca có hai tập người nhận khác nhau.
   */
  private async notifyStaff(
    recipients: number[],
    quoteRequestId: number,
    type: NotifType,
    title: string,
    body: string,
  ): Promise<void> {
    await this.notify.push(
      recipients.map((userId) => ({ userId, quoteRequestId, type, title, body })),
    );
  }
```

Trong `create()`, thêm nhánh `else` cho `if (serviceId !== undefined)` (tức là sau khối try/catch auto-convert, dòng ~170):

```ts
    } else {
      await this.notifyStaff(
        await this.notify.adminsAndSales(),
        row.id,
        NotifType.QUOTE_REQUEST_NEW,
        `Yêu cầu báo giá #${row.id} chưa có dịch vụ`,
        `${dto.customerName.trim()} — ${dto.phone.trim()}. Chưa chọn được dịch vụ nên chưa tạo đơn tự động.`,
      );
    }
```

Trong khối `catch (err)` của auto-convert, thêm sau lời gọi `activity.log` hiện có. Chỉ Admin — đây là sự cố kỹ thuật, không phải việc của Sale:

```ts
        await this.notifyStaff(
          await this.notify.admins(),
          row.id,
          NotifType.QUOTE_REQUEST_FAILED,
          `Yêu cầu báo giá #${row.id} không tạo được đơn`,
          `${dto.customerName.trim()} — ${dto.phone.trim()}. Cần tạo đơn thủ công.`,
        );
```

- [ ] **Step 6: Chạy test để xác nhận pass**

Run: `npx jest src/modules/quote-requests/quote-request-staff-notify.spec.ts`
Expected: 5 test PASS.

- [ ] **Step 7: Chạy toàn bộ test + lint + kiểm tra kích thước file**

Run: `npm run lint && npx tsc --noEmit && npx jest && wc -l src/modules/quote-requests/quote-request.service.ts`
Expected: sạch, toàn bộ PASS, file dưới 300 dòng. Nếu vượt, tách `notifyStaff` + hai chuỗi nội dung sang `src/modules/quote-requests/quote-request-notify.helper.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/modules/quote-requests src/modules/notifications/notify.service.ts
git commit -m "feat(quote-requests): báo Admin/Sale khi yêu cầu không có dịch vụ hoặc convert lỗi"
```

---

### Task 8: Thông báo vòng đời đơn cho khách

**Files:**
- Modify: `src/modules/orders/orders.service.ts:200-215` (close), `:265-280` (cancel)
- Modify: `src/modules/orders/orders.module.ts`
- Modify: `src/modules/milestones/milestones.service.ts:105-135`
- Modify: `src/modules/milestones/milestones.module.ts`
- Create: `src/modules/milestones/milestone-customer-notify.spec.ts`

**Interfaces:**
- Consumes: `CustomerNotifyService.orderEvent(orderId, type, title, body?)` (Task 5), `CustomerNotifType` (Task 3).
- Produces: không có gì cho task sau.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/modules/milestones/milestone-customer-notify.spec.ts`. Kiểm luật thật: mốc `DONE` bắn cho khách, mốc `SKIPPED` thì không (khách không cần biết nội bộ bỏ qua bước nào), và mốc cuối xong thì bắn thêm `ORDER_COMPLETED`.

```ts
import { ActivityService } from '@/common/activity/activity.service';
import { CustomerNotifType, MilestoneStatus, OrderStatus, Role } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { CustomerNotifyService } from '@/modules/notifications/customer-notify.service';
import { NotifyService } from '@/modules/notifications/notify.service';
import { MilestonesService } from './milestones.service';

const USER = {
  id: 1, email: 'a@b.c', fullName: 'A', roles: [Role.ADMIN],
  departmentId: 2, canViewCompanyReport: true, mustChangePassword: false,
} as AuthenticatedUser;

const ORDER = {
  id: 3, code: 'BOP-250914-01', status: OrderStatus.IN_PROGRESS,
  departmentId: 2, createdBy: 1,
};

/**
 * `remaining` = số mốc còn PENDING sau khi cập nhật; 0 nghĩa là đơn vừa xong.
 *
 * Khi remaining = 0 thì mốc seq 1 PHẢI đã DONE: `update()` chặn cập nhật mốc sau
 * khi mốc trước còn PENDING ("Phải xử lý mốc ... trước"), nên để PENDING ở đây là
 * test ném lỗi trước khi chạm tới phần thông báo.
 */
function mk(remaining: number) {
  const orderEvent = jest.fn().mockResolvedValue(undefined);
  const firstStatus = remaining === 0 ? MilestoneStatus.DONE : MilestoneStatus.PENDING;
  const milestones = [
    { id: 10, seq: 1, name: 'Đã lấy hàng', status: firstStatus, note: null, doneAt: null },
    { id: 11, seq: 2, name: 'Nghiệm thu', status: MilestoneStatus.PENDING, note: null, doneAt: null },
  ];
  const prisma = {
    order: { findFirst: jest.fn().mockResolvedValue(ORDER), update: jest.fn() },
    orderMilestone: {
      findMany: jest.fn().mockResolvedValue(milestones.map((m) => ({ ...m, user: null }))),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(remaining),
    },
    $transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          orderMilestone: { update: jest.fn(), count: jest.fn().mockResolvedValue(remaining) },
          order: { update: jest.fn() },
        }),
      ),
  } as unknown as PrismaService;

  const svc = new MilestonesService(
    prisma,
    { orderWhere: () => ({}) } as unknown as ScopeService,
    { log: jest.fn() } as unknown as ActivityService,
    { push: jest.fn().mockResolvedValue(undefined) } as unknown as NotifyService,
    { orderEvent } as unknown as CustomerNotifyService,
  );
  return { svc, orderEvent };
}

describe('MilestonesService.update — thông báo cho khách', () => {
  it('mốc hoàn thành thì bắn ORDER_MILESTONE kèm mã đơn và tên mốc', async () => {
    const { svc, orderEvent } = mk(1);
    await svc.update(3, 10, { status: MilestoneStatus.DONE }, USER);
    const call = orderEvent.mock.calls.find(
      (c) => c[1] === CustomerNotifType.ORDER_MILESTONE,
    );
    expect(call).toBeDefined();
    expect(call![0]).toBe(3);
    expect(call![2]).toBe('Đơn BOP-250914-01: Đã lấy hàng');
  });

  /** Bỏ qua mốc là chuyện điều hành nội bộ — báo cho khách chỉ gây hoang mang. */
  it('mốc bị bỏ qua thì KHÔNG bắn cho khách', async () => {
    const { svc, orderEvent } = mk(1);
    await svc.update(3, 10, { status: MilestoneStatus.SKIPPED, note: 'Khách tự lấy' }, USER);
    expect(
      orderEvent.mock.calls.some((c) => c[1] === CustomerNotifType.ORDER_MILESTONE),
    ).toBe(false);
  });

  it('mốc cuối xong (remaining = 0) thì bắn thêm ORDER_COMPLETED', async () => {
    const { svc, orderEvent } = mk(0);
    await svc.update(3, 11, { status: MilestoneStatus.DONE }, USER);
    const types = orderEvent.mock.calls.map((c) => c[1]);
    expect(types).toContain(CustomerNotifType.ORDER_MILESTONE);
    expect(types).toContain(CustomerNotifType.ORDER_COMPLETED);
  });

  it('còn mốc PENDING thì KHÔNG bắn ORDER_COMPLETED', async () => {
    const { svc, orderEvent } = mk(1);
    await svc.update(3, 10, { status: MilestoneStatus.DONE }, USER);
    expect(
      orderEvent.mock.calls.some((c) => c[1] === CustomerNotifType.ORDER_COMPLETED),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx jest src/modules/milestones/milestone-customer-notify.spec.ts`
Expected: FAIL — constructor `MilestonesService` chưa nhận tham số thứ năm.

- [ ] **Step 3: Nối vào orders.service.ts — đóng đơn**

Trong `src/modules/orders/orders.service.ts`, thêm import:

```ts
import { CustomerNotifType } from '@/common/enums';
import { CustomerNotifyService } from '../notifications/customer-notify.service';
```

(`CustomerNotifType` có thể gộp vào dòng import `@/common/enums` sẵn có.)

Thêm vào constructor:

```ts
    private readonly customerNotify: CustomerNotifyService,
```

Ngay sau khối `await this.notify.push(...)` với `NotifType.ORDER_CLOSED` (sau dòng 211):

```ts
    await this.customerNotify.orderEvent(
      id, CustomerNotifType.ORDER_CLOSED,
      `Đơn ${order.code} đã được chốt`,
      'Cảm ơn bạn đã tin tưởng BeeOps. Chúng tôi sẽ cập nhật tiến độ vận chuyển.',
    );
```

Ngay sau khối `NotifType.ORDER_CANCELLED` (sau dòng 277):

```ts
    await this.customerNotify.orderEvent(
      id, CustomerNotifType.ORDER_CANCELLED,
      `Đơn ${order.code} đã bị huỷ`,
    );
```

**Không** thêm gì cho `ORDER_REJECTED`: đó là trạng thái nội bộ từ chối đơn, không phải việc để báo khách.

Trong `src/modules/orders/orders.module.ts`, bảo đảm `NotificationsModule` nằm trong `imports`.

- [ ] **Step 4: Nối vào milestones.service.ts**

Trong `src/modules/milestones/milestones.service.ts`, thêm import `CustomerNotifType` và `CustomerNotifyService`, thêm vào constructor `private readonly customerNotify: CustomerNotifyService,`.

Ngay sau khối `await this.notify.push([...])` hiện có (sau dòng 133):

```ts
    // Khách chỉ quan tâm mốc ĐÃ XONG. Mốc bị bỏ qua là chuyện điều hành nội bộ.
    if (dto.status === MilestoneStatus.DONE)
      await this.customerNotify.orderEvent(
        orderId, CustomerNotifType.ORDER_MILESTONE,
        `Đơn ${order.code}: ${target.name}`,
      );
```

Và cho mốc cuối cùng — trong nhánh `if (remaining === 0 && current === OrderStatus.IN_PROGRESS)` đã chuyển đơn sang `COMPLETED` (dòng 110-116), ghi nhớ bằng một biến cục bộ khai báo trước `$transaction`:

```ts
    let justCompleted = false;
```

gán `justCompleted = true;` ngay sau `tx.order.update({ ... status: OrderStatus.COMPLETED ... })`, rồi sau khối thông báo mốc:

```ts
    if (justCompleted)
      await this.customerNotify.orderEvent(
        orderId, CustomerNotifType.ORDER_COMPLETED,
        `Đơn ${order.code} đã hoàn thành`,
        'Toàn bộ mốc hành trình đã xong.',
      );
```

Trong `src/modules/milestones/milestones.module.ts`, bảo đảm `NotificationsModule` nằm trong `imports`.

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npx jest src/modules/milestones/milestone-customer-notify.spec.ts`
Expected: 4 test PASS.

- [ ] **Step 6: Chạy toàn bộ test + lint + kiểm tra kích thước file**

Run: `npm run lint && npx tsc --noEmit && npx jest && wc -l src/modules/orders/orders.service.ts src/modules/milestones/milestones.service.ts`
Expected: sạch, toàn bộ PASS. **`orders.service.ts` đang 280 dòng — nếu vượt 300, tách hai khối `notifyOrderClosed`/`notifyOrderCancelled` sang `src/modules/orders/orders-notify.helper.ts`.**

- [ ] **Step 7: Commit**

```bash
git add src/modules/orders src/modules/milestones
git commit -m "feat(orders): báo khách khi đơn chốt, huỷ, qua mốc và hoàn thành"
```

---

### Task 9: Hộp thư và tuỳ chọn tắt thông báo cho khách

**Files:**
- Create: `src/modules/customer-auth/customer-notifications.service.ts`
- Create: `src/modules/customer-auth/customer-notifications.service.spec.ts`
- Create: `src/modules/customer-auth/dto/customer-notification.dto.ts`
- Modify: `src/modules/customer-auth/customer-profile.controller.ts` (thêm 4 endpoint)
- Modify: `src/modules/customer-auth/customer-auth.module.ts`

**Interfaces:**
- Consumes: cột `customer_id`, `push_off` (Task 1); `CustomerNotifType` (Task 3).
- Produces: (kết thúc plan)

- [ ] **Step 1: Viết test thất bại**

Tạo `src/modules/customer-auth/customer-notifications.service.spec.ts`:

```ts
import { CustomerNotifType } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotificationsService } from './customer-notifications.service';

function mk(rows: unknown[] = [], total = 0) {
  const count = jest.fn().mockResolvedValue(total);
  const findMany = jest.fn().mockResolvedValue(rows);
  const updateMany = jest.fn().mockResolvedValue({ count: 2 });
  const update = jest.fn().mockResolvedValue({ pushOff: [CustomerNotifType.ORDER_MILESTONE] });
  const prisma = {
    notification: { count, findMany, updateMany },
    customerAccount: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ pushOff: [] }),
      update,
    },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  } as unknown as PrismaService;
  return { svc: new CustomerNotificationsService(prisma), count, findMany, updateMany, update };
}

describe('CustomerNotificationsService.inbox', () => {
  /** Lọc theo customerId, KHÔNG theo userId — đây là ranh giới giữa hai loại người dùng. */
  it('chỉ lấy thông báo của đúng khách đang hỏi', async () => {
    const { svc, findMany } = mk();
    await svc.inbox(7);
    expect(findMany.mock.calls[0][0].where.customerId).toBe(7);
    expect(findMany.mock.calls[0][0].where.userId).toBeUndefined();
  });

  it('phân trang: page 2, limit 20 thì skip 20', async () => {
    const { svc, findMany } = mk();
    await svc.inbox(7, undefined, 2, 20);
    expect(findMany.mock.calls[0][0].skip).toBe(20);
    expect(findMany.mock.calls[0][0].take).toBe(20);
  });

  it('lọc theo isRead khi có tham số', async () => {
    const { svc, findMany } = mk();
    await svc.inbox(7, false);
    expect(findMany.mock.calls[0][0].where.isRead).toBe(false);
  });
});

describe('CustomerNotificationsService.markRead', () => {
  it('ràng customerId nên không đánh dấu được thông báo của người khác', async () => {
    const { svc, updateMany } = mk();
    await svc.markRead(7, [1, 2]);
    expect(updateMany.mock.calls[0][0].where.customerId).toBe(7);
    expect(updateMany.mock.calls[0][0].where.id).toEqual({ in: [1, 2] });
  });

  it('all = true thì bỏ điều kiện id', async () => {
    const { svc, updateMany } = mk();
    await svc.markRead(7, undefined, true);
    expect(updateMany.mock.calls[0][0].where.id).toBeUndefined();
  });
});

describe('CustomerNotificationsService.setPushOff', () => {
  it('ghi danh sách loại bị tắt', async () => {
    const { svc, update } = mk();
    const res = await svc.setPushOff(7, [CustomerNotifType.ORDER_MILESTONE]);
    expect(update.mock.calls[0][0].where).toEqual({ id: 7 });
    expect(res.pushOff).toEqual([CustomerNotifType.ORDER_MILESTONE]);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx jest src/modules/customer-auth/customer-notifications.service.spec.ts`
Expected: FAIL — `Cannot find module './customer-notifications.service'`.

- [ ] **Step 3: Viết DTO**

Tạo `src/modules/customer-auth/dto/customer-notification.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional } from 'class-validator';
import { CustomerNotifType } from '@/common/enums';

const TYPES = Object.values(CustomerNotifType);

export class CustomerNotificationDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: TYPES }) type!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) body!: string | null;
  @ApiProperty({ type: Number, nullable: true }) orderId!: number | null;
  @ApiProperty({ type: Number, nullable: true }) quoteRequestId!: number | null;
  @ApiProperty() isRead!: boolean;
  @ApiProperty() createdAt!: Date;
}

export class MarkCustomerReadDto {
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional() @IsArray() @IsInt({ each: true }) @ArrayMaxSize(200)
  ids?: number[];

  @ApiPropertyOptional({ description: 'true = đánh dấu đã đọc toàn bộ' })
  @IsOptional() @IsBoolean()
  all?: boolean;
}

export class SetPushOffDto {
  @ApiProperty({ enum: TYPES, isArray: true })
  @IsArray() @IsIn(TYPES, { each: true }) @ArrayMaxSize(20)
  pushOff!: string[];
}
```

- [ ] **Step 4: Viết implementation**

Tạo `src/modules/customer-auth/customer-notifications.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageResult } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotificationDto } from './dto/customer-notification.dto';

/**
 * Hộp thư của KHÁCH. Song song NotificationsService (của nhân viên) nhưng lọc
 * theo customer_id — không bao giờ chạm user_id. Hai cột FK tách rời chính là thứ
 * làm ranh giới này không thể lẫn: customerId 5 không khớp dòng của userId 5.
 */
@Injectable()
export class CustomerNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async inbox(
    customerId: number,
    isRead?: boolean,
    page = 1,
    limit = 20,
  ): Promise<PageResult<CustomerNotificationDto>> {
    const where = { customerId, ...(isRead === undefined ? {} : { isRead }) };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const items = rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      orderId: n.orderId,
      quoteRequestId: n.quoteRequestId,
      isRead: n.isRead,
      createdAt: n.createdAt,
    }));
    return { items, total, page, limit };
  }

  async unreadCount(customerId: number): Promise<{ count: number }> {
    return {
      count: await this.prisma.notification.count({ where: { customerId, isRead: false } }),
    };
  }

  /** where ràng CẢ customerId: khách đoán được id cũng không đánh dấu hộ người khác. */
  async markRead(customerId: number, ids?: number[], all?: boolean): Promise<{ updated: number }> {
    const where: Prisma.NotificationWhereInput = { customerId, isRead: false };
    if (!all) where.id = { in: ids ?? [] };
    const res = await this.prisma.notification.updateMany({ where, data: { isRead: true } });
    return { updated: res.count };
  }

  async getPushOff(customerId: number): Promise<{ pushOff: string[] }> {
    const c = await this.prisma.customerAccount.findUniqueOrThrow({
      where: { id: customerId },
      select: { pushOff: true },
    });
    return { pushOff: c.pushOff };
  }

  async setPushOff(customerId: number, pushOff: string[]): Promise<{ pushOff: string[] }> {
    const c = await this.prisma.customerAccount.update({
      where: { id: customerId },
      data: { pushOff },
      select: { pushOff: true },
    });
    return { pushOff: c.pushOff };
  }
}
```

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npx jest src/modules/customer-auth/customer-notifications.service.spec.ts`
Expected: 6 test PASS.

- [ ] **Step 6: Test hồi quy — ranh giới nhân viên / khách**

Đây là ca mà toàn bộ thiết kế hai cột FK sinh ra để chặn, phải có test đóng đinh lại. Tạo `src/modules/notifications/staff-customer-boundary.spec.ts`:

```ts
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotificationsService } from './notifications.service';

const USER = { id: 5 } as AuthenticatedUser;

function mk() {
  const count = jest.fn().mockResolvedValue(0);
  const findMany = jest.fn().mockResolvedValue([]);
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    notification: { count, findMany, updateMany },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  } as unknown as PrismaService;
  return { svc: new NotificationsService(prisma), count, findMany, updateMany };
}

/**
 * users.id và customer_accounts.id là hai sequence độc lập trùng nhau dày đặc.
 * Nếu có ngày ai đó gộp hai loại chủ sở hữu vào một cột thì đúng ba test này vỡ
 * trước khi dữ liệu của khách kịp lọt sang hộp thư nhân viên.
 */
describe('hộp thư nhân viên không chạm dữ liệu khách', () => {
  it('inbox lọc theo userId, không bao giờ theo customerId', async () => {
    const { svc, findMany } = mk();
    await svc.inbox(USER);
    const where = findMany.mock.calls[0][0].where;
    expect(where.userId).toBe(5);
    expect(where).not.toHaveProperty('customerId');
  });

  it('unreadCount lọc theo userId', async () => {
    const { svc, count } = mk();
    await svc.unreadCount(USER);
    expect(count.mock.calls[0][0].where.userId).toBe(5);
  });

  it('markRead ràng userId nên không đụng dòng của khách', async () => {
    const { svc, updateMany } = mk();
    await svc.markRead(USER, undefined, true);
    expect(updateMany.mock.calls[0][0].where.userId).toBe(5);
  });
});
```

Run: `npx jest src/modules/notifications/staff-customer-boundary.spec.ts`
Expected: 3 test PASS **mà không phải sửa `notifications.service.ts` một dòng nào** — đó chính là điều thiết kế hai cột FK hứa hẹn. Nếu phải sửa thì có gì đó đã đi lệch, dừng lại và xem lại Task 1.

- [ ] **Step 7: Thêm endpoint vào controller**

Trong `src/modules/customer-auth/customer-profile.controller.ts`, inject `CustomerNotificationsService` và thêm bốn endpoint trước `@Delete('link/:provider')`:

```ts
  /* ---------------------------------------------------------- Hộp thư khách */

  @Get('notifications')
  @ApiOperation({ summary: 'Hộp thư thông báo của khách' })
  inbox(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Query('isRead') isRead?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PageResult<CustomerNotificationDto>> {
    return this.notifications.inbox(
      c.id,
      isRead === undefined ? undefined : isRead === 'true',
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Badge số thông báo chưa đọc' })
  unreadCount(@CurrentCustomer() c: AuthenticatedCustomer): Promise<{ count: number }> {
    return this.notifications.unreadCount(c.id);
  }

  @Post('notifications/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đánh dấu đã đọc' })
  markRead(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: MarkCustomerReadDto,
  ): Promise<{ updated: number }> {
    return this.notifications.markRead(c.id, dto.ids, dto.all);
  }

  @Put('push-preferences')
  @ApiOperation({ summary: 'Loại thông báo đang tắt push' })
  setPushOff(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: SetPushOffDto,
  ): Promise<{ pushOff: string[] }> {
    return this.notifications.setPushOff(c.id, dto.pushOff);
  }
```

Thêm `Get`, `Put`, `Query` vào import từ `@nestjs/common` nếu chưa có, và import `PageResult` từ `@/common/dto/pagination.dto`.

Trong `src/modules/customer-auth/customer-auth.module.ts`, thêm `CustomerNotificationsService` vào `providers`.

- [ ] **Step 8: Chạy toàn bộ test + lint + kiểm tra kích thước file**

Run: `npm run lint && npx tsc --noEmit && npx jest && wc -l src/modules/customer-auth/customer-profile.controller.ts`
Expected: sạch, toàn bộ PASS. File đang 137 dòng, sau khi thêm khoảng 210 — dưới 300. Nếu vượt, tách bốn endpoint sang `customer-notifications.controller.ts`.

- [ ] **Step 9: Kiểm tra thủ công đầu-cuối**

```bash
npm run start:dev
```

Mở `http://localhost:8087/api/docs`, xác nhận Swagger hiện đủ: `POST /quote-requests` có `fcmToken`/`platform`; nhóm Customer Auth có 4 endpoint mới. Kiểm tra log lúc khởi động có dòng warn `FIREBASE_SERVICE_ACCOUNT_JSON trống — push FCM tắt` (nếu máy dev chưa cấu hình credential) và app vẫn chạy bình thường.

- [ ] **Step 10: Commit**

```bash
git add src/modules/customer-auth src/modules/notifications/staff-customer-boundary.spec.ts
git commit -m "feat(customer-auth): hộp thư thông báo + tắt push theo loại cho khách"
```

---

## Ghi chú lệch so với spec

Spec viết *"một bảng thì một service — không tách CustomerNotifyService riêng"*. Plan này vẫn giữ một bảng, nhưng tách **hai tầng**:

- `NotifyService.pushCustomer` — ghi dòng (tầng dữ liệu), đúng như spec mô tả.
- `CustomerNotifyService` — format tiêu đề/nội dung và tra ngược khách từ `orderId` (tầng nội dung).

Lý do: trần 300 dòng mỗi file của repo. `orders.service.ts` đang 280 dòng và `quote-request.service.ts` 261; nhét phần tra cứu + format vào từng điểm gọi sẽ vượt trần ở cả hai. Với tầng thứ hai, mỗi điểm gọi chỉ tốn 1-3 dòng. Đây cũng là hai trách nhiệm khác nhau, nên tách không phải chỉ để lách giới hạn dòng.

## Hai điểm kiểm thử không nằm trong jest

Spec liệt kê 8 điểm kiểm thử. Sáu điểm thành unit test; hai điểm còn lại không:

- **`FOR UPDATE SKIP LOCKED` chống claim trùng khi hai vòng cron chồng nhau.** Cần hai kết nối Postgres thật chạy song song. Repo không có test chạm DB (mọi `.spec.ts` đều dựng Prisma giả bằng object), nên dựng hạ tầng cho đúng một test là lệch hẳn khỏi lối làm hiện tại. Test trong Task 4 chỉ khoá được phần quan sát được từ ngoài: `pushed_at` phải đặt **trong** transaction claim và **trước** khi gọi FCM. Bản thân câu SQL sao chép nguyên văn từ `flushEmails` (`notification.cron.ts:64-72`) đang chạy production.
- **CHECK `notifications_owner_ck`.** Ràng buộc sống ở DB, Prisma không biểu diễn được. Xác minh thủ công một lần bằng psql ở Task 1 Step 5.

Người thực hiện không cần tìm cách unit-test hai điểm này — đã cân nhắc và quyết định bỏ.
