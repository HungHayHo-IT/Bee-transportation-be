# Thông báo đẩy cho khách hàng (FCM) + vá lỗ hổng thông báo yêu cầu báo giá

Ngày: 2026-09-14 · Trạng thái: chờ duyệt

## Vấn đề

Hai việc, một nền chung.

**1. Khách hàng không nhận được gì.** `customer_devices` đã thu thập FCM token
từ commit 6dcf54b, nhưng không chỗ nào trong `src/` đọc bảng đó để gửi đi —
grep `fcmToken` chỉ ra 5 điểm, toàn bộ là register/unregister và DTO. Token
nằm im. Cụ thể: khi Sale chốt giá (`selection.service.ts:77-89`) chỉ nhân viên
các phòng được báo; khách gửi yêu cầu báo giá không hề biết giá đã có.

**2. Hai ca yêu cầu báo giá rơi vào im lặng hoàn toàn.**

- Yêu cầu **không có `serviceId`** (form public không chọn được dịch vụ, hoặc
  `serviceCode` sai): không auto-convert nên không sinh Order, mà `NEW_ORDER`
  lại gắn vào Order — kết quả là không ai được báo, bản ghi nằm ở
  `status='pending'` cho tới khi có người tình cờ mở danh sách.
- Auto-convert **ném lỗi**: `quote-request.service.ts:160` bắt rồi chỉ ghi
  `activity.log`. Đúng ở chỗ không xoá mất yêu cầu của khách, nhưng không ai
  được báo là có việc hỏng.

Ca "có dịch vụ nhưng chưa phòng nào phụ trách" **không** nằm trong danh sách
này — `notifyNewOrder` đã bắn cho admin với tiêu đề "Đơn chưa định tuyến"
(`orders.service.ts:104`).

## Phạm vi

Trong phạm vi:

- Kênh push FCM cho khách hàng, kèm inbox lưu DB.
- 7 loại thông báo cho khách, 2 loại bổ sung cho nhân viên.
- Khách vãng lai (không đăng nhập) nhận push theo thiết bị.

Ngoài phạm vi, đã cân nhắc và loại:

- **Push cho nhân viên.** Staff đã có inbox + SSE realtime + email, tất cả chạy
  trên web admin. `FcmService` viết ở `common/` để sau này thêm được, nhưng
  phase này không nối dây.
- **Thông báo riêng ở tầng yêu cầu báo giá cho phòng ban.** Yêu cầu có
  `serviceId` đã tự convert thành Order và `notifyNewOrder` đã bắn `NEW_ORDER`
  đúng các phòng phụ trách dịch vụ đó (`orders.service.ts:62,99`). Thêm một
  loại nữa ở tầng trên là hai thông báo cho cùng một việc, cách nhau chưa tới
  một giây. Chỉ vá hai ca đang im lặng.
- **`quote_revised`.** Sau `requestRevision` đơn vẫn phải đi qua `selectQuote`
  lần nữa, nên `quote_ready` tự bắn lại. Không cần loại riêng.
- **`order_in_progress` cho khách.** Cách `order_closed` vài phút; khách không
  phân biệt được "đã chốt" với "đang làm".
- **Email cho khách.** Khách có app thì push + inbox là đủ. Email của khách
  hiện chỉ dùng cho OTP.

## Quyết định nền: một bảng, hai cột FK

Thông báo của khách dùng **chung bảng `notifications`**, không tạo bảng mới.
Cách phân biệt chủ sở hữu là **hai cột FK nullable**, không phải cờ
`is_customer`.

Lý do bác cờ boolean: `users.id` và `customer_accounts.id` là hai sequence độc
lập, đều bắt đầu từ 1, nên trùng nhau dày đặc. Nếu nhét customer id vào
`user_id` rồi phân biệt bằng cờ thì có 5 điểm truy vấn phải nhớ thêm điều kiện
lọc, và quên bất kỳ điểm nào là lẫn dữ liệu giữa hai loại người dùng — lẫn im
lặng, không có lỗi nào nổ ra. Nặng nhất là `notification.cron.ts:68`:

```sql
JOIN users u ON u.id = n.user_id
```

Thông báo của khách id 5 sẽ JOIN vào **nhân viên id 5** và email báo giá của
khách được gửi tới nhân viên đó.

Với hai cột riêng, `customer_id = 5` không bao giờ chạm `user_id = 5`. Năm
điểm truy vấn kia **không cần sửa gì để đúng**: Prisma `where: { userId: 5 }`
không khớp dòng có `userId` null, và `JOIN users u ON u.id = n.user_id` là
INNER JOIN nên dòng của khách tự rụng. (Cron sẽ được thêm một điều kiện — xem
mục cuối — nhưng đó là vá hiệu năng, không phải vá đúng-sai.)

Quên filter thì không lộ gì, vì không có gì để lộ.
Đây là khác biệt quyết định — cờ boolean bắt an toàn phụ thuộc vào kỷ luật,
hai cột FK làm an toàn thành mặc định.

Giá phải trả: `user_id` chuyển từ NOT NULL sang nullable, và cần một CHECK giữ
ràng buộc.

## Thay đổi schema

Migration `db/migrations/015-customer-notifications.sql` (số tiếp theo sau
`014-customer-devices.sql`).

### `notifications`

```sql
ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE notifications
  ADD COLUMN customer_id       int REFERENCES customer_accounts(id) ON DELETE CASCADE,
  ADD COLUMN quote_request_id  int REFERENCES quote_requests(id)    ON DELETE CASCADE,
  ADD COLUMN pushed_at         timestamptz;

ALTER TABLE notifications ADD CONSTRAINT notifications_owner_ck CHECK (
  num_nonnulls(user_id, customer_id) = 1
  OR (user_id IS NULL AND customer_id IS NULL AND quote_request_id IS NOT NULL)
);
```

CHECK đọc là: *hoặc đúng một chủ sở hữu có tài khoản (nhân viên hoặc khách),
hoặc không ai có tài khoản nhưng phải neo vào một yêu cầu báo giá* — vế sau là
khách vãng lai.

`quote_request_id` mang hai vai: với khách có tài khoản nó là **ngữ cảnh** (để
FE deep-link về yêu cầu); với khách vãng lai nó là **đường tìm token**, vì
không còn cột nào khác neo được.

Chỉ mục:

```sql
CREATE INDEX notifications_push_idx ON notifications (created_at)
  WHERE pushed_at IS NULL AND user_id IS NULL;

CREATE INDEX notifications_cust_inbox_idx
  ON notifications (customer_id, is_read, created_at DESC);
```

Index đầu là partial — cron chỉ quét dòng chưa đẩy của người không phải nhân
viên. Dòng của staff có `user_id` khác null nên nằm ngoài index, không cần
backfill và index không phình theo lượng thông báo nội bộ.

Index sau đối xứng `notifications_inbox_idx` sẵn có.

### `quote_requests`

```sql
ALTER TABLE quote_requests ADD COLUMN fcm_token text;
CREATE INDEX quote_requests_order_idx ON quote_requests (converted_to_order_id)
  WHERE converted_to_order_id IS NOT NULL;
```

`fcm_token` là token máy của khách vãng lai, nhận lúc submit form.

Index thứ hai **bắt buộc**: mọi thông báo ở tầng đơn hàng (`quote_ready`,
`order_closed`, `order_milestone`, `order_completed`, `order_cancelled`) đều
phải tra ngược `quote_requests` theo `converted_to_order_id` để tìm ra khách.
Bảng hiện chỉ có `quote_requests_status_idx` trên `(status, created_at)` —
không đỡ được truy vấn này, sẽ seq scan mỗi lần chốt giá.

### `customer_accounts`

```sql
ALTER TABLE customer_accounts
  ADD COLUMN push_off text[] NOT NULL DEFAULT '{}';
```

Mirror `users.email_off` (`schema.prisma:44`). Không đẻ bảng preference riêng.

### Prisma

`user_id` thành `Int?`, quan hệ `user` thành `User?`. Thêm `customerId`,
`quoteRequestId`, `pushedAt` và hai quan hệ ngược. Prisma **không** biểu diễn
được CHECK — ràng buộc sống ở DB, và ở test.

## Vì sao khách vãng lai không có tài khoản tạm

Phương án đầu tiên được cân nhắc là tạo `CustomerAccount` tạm lúc khách vãng
lai gửi form rồi gắn token vào đó. Bỏ vì ba va chạm với schema hiện tại:

1. `customer_accounts.email` là `@unique` **NOT NULL** (`schema.prisma:345`)
   nhưng `CreateQuoteRequestDto.email` là **optional** — khách có thể chỉ để
   tên và số điện thoại. Không có email thì không tạo nổi hàng.
2. Tài khoản tạm **chặn đăng ký thật sau này**: `register()` thấy email đã tồn
   tại thì ném 409 (`customer-auth.service.ts:56`), mà tài khoản tạm không có
   `pinHash` nên `loginPin()` cũng từ chối. Khách kẹt cứng, không vào được
   bằng đường nào.
3. Khách vãng lai nhập email trùng tài khoản thật đã có thì phải merge, không
   được đẻ hàng thứ hai.

Gắn token vào `quote_requests` né sạch cả ba: không tài khoản nào được tạo nên
không có email để đụng unique, không có gì chặn `register()`, không có gì để
merge. Và khi khách đăng ký thật trên cùng máy đó, logic upsert-by-token sẵn
có (`customer-profile.service.ts:109`) tự kéo token về tài khoản thật — đúng
cái ca mà doc-comment ở dòng 98-105 đã mô tả.

## Kiến trúc

```
selectQuote / closeOrder / milestone / reject
        │
        ▼
NotifyService.pushCustomer()   ── ghi notifications (pushed_at = null)
        │                          try/catch, không bao giờ ném ra ngoài
        ▼
  [ outbox nằm trong bảng ]
        │
        ▼  @Cron('*/30 * * * * *')
NotificationCron.flushPush()   ── claim FOR UPDATE SKIP LOCKED
        │                          set pushed_at NGAY trong transaction claim
        ▼
    FcmService.sendEach()      ── trả { ok, dead }
        │
        ▼
   dọn token chết             ── xoá customer_devices / clear quote_requests.fcm_token
```

### Vì sao outbox thay vì gọi thẳng

Ba cách đã cân nhắc: gọi thẳng có `await`, bắn rồi quên, hoặc outbox + cron.

Chọn outbox vì repo **đã có sẵn đúng khuôn này** cho email:
`notifications.emailed_at` + `NotificationCron.flushEmails()` claim trong
transaction rồi gửi ngoài (`notification.cron.ts:61-95`). Làm push theo cùng
khuôn thì không đẻ ra khái niệm thứ hai cho cùng một việc, và thừa hưởng luôn
tính chất: FCM sập mười phút thì thông báo vẫn nằm đó chờ, sống lại là đi tiếp.

Gọi thẳng có `await` thì FCM lag hai giây là `selectQuote` lag hai giây. Bắn
rồi quên thì mất thông báo im lặng khi FCM lỗi tạm thời, không retry được,
không có dấu vết để điều tra.

Giá phải trả: độ trễ tối đa 30 giây. Chấp nhận được với "báo giá của bạn đã
có", không chấp nhận được với chat — đây không phải chat.

### `pushed_at` nghĩa là "cron đã xử lý", không phải "đã gửi"

Set `pushed_at` ngay trong transaction claim, trước khi gọi FCM — giống hệt
`emailed_at` và vì đúng lý do đã ghi ở `notification.cron.ts:76`. Đánh đổi có
chủ ý: thà mất một push khi process chết giữa chừng, còn hơn bắn trùng mỗi
vòng cron 30 giây.

### Giải token trong cron

Theo thứ tự, cho từng dòng đã claim:

- `customer_id` khác null → mọi `customer_devices.fcm_token` của khách đó.
- `customer_id` null (nên theo CHECK thì `quote_request_id` khác null) →
  `quote_requests.fcm_token` của yêu cầu đó.
- Gộp lại rồi **distinct theo token**. Cần thiết vì khách vãng lai đăng ký thật
  sau đó thì cùng một máy lọt vào cả hai đường.
- Bỏ token nếu `type` nằm trong `customer_accounts.push_off`.
- Không còn token nào → **vẫn set `pushed_at`**, dòng nằm lại inbox. Khách chưa
  cấp quyền thông báo không phải là lỗi.

### Dọn token chết

FCM trả `UNREGISTERED` hoặc `INVALID_ARGUMENT` cho token nào thì:

```sql
DELETE FROM customer_devices WHERE fcm_token = $1;
UPDATE quote_requests SET fcm_token = NULL WHERE fcm_token = $1;
```

Không dọn thì token chết tích tụ và mỗi vòng cron tốn một round-trip để nhận
lại đúng một lỗi. Đây chính là việc mà doc-comment ở
`customer-profile.service.ts:105` đã bỏ ngỏ khi nói `lastSeenAt` dùng để "sau
này dọn token chết".

## Thành phần

### `src/common/fcm/fcm.service.ts` (mới)

Bọc `firebase-admin`. Một method:

```ts
sendEach(
  tokens: string[],
  msg: { title: string; body: string; data: Record<string, string> },
): Promise<{ ok: string[]; dead: string[] }>
```

`dead` tách riêng vì đó là thứ duy nhất người gọi cần biết ngoài "xong chưa".

Đặt ở `common/` chứ không nhét trong `customer-auth/`: khi nào muốn bắn cho
staff thì chỉ thêm bảng thiết bị, không phải gỡ service ra khỏi module khách.

Chưa cấu hình credential thì **no-op và log warn một lần lúc khởi động**, không
ném. Máy dev không có service account vẫn chạy được toàn bộ app.

### `NotifyService.pushCustomer()` (thêm vào service sẵn có)

Đối xứng `push()`. Một bảng thì một service — không tách `CustomerNotifyService`
riêng.

```ts
interface CustomerNotifyInput {
  customerId: number | null;
  quoteRequestId: number | null;
  orderId?: number | null;
  type: CustomerNotifType;
  title: string;
  body?: string;
}
```

Bọc try/catch, **không bao giờ ném ra ngoài**. Nguyên tắc này đã thành văn ở
`notify.service.ts:17`: *"Ghi thông báo là việc PHỤ, không bao giờ được làm
hỏng việc chính"*. Chốt giá phải thành công kể cả khi DB thông báo hỏng.

**Không** gọi `events.emit()`: SSE là kênh của staff, khách dùng push.

### `NotificationCron.flushPush()` (thêm vào cron sẵn có)

`@Cron(process.env.PUSH_FLUSH_CRON ?? '*/30 * * * * *')` — theo đúng lối đặt
biến môi trường của ba cron hiện có.

### Enum

`CustomerNotifType` **riêng**, không dùng chung `NotifType`. Hai bên nói hai
ngôn ngữ: staff nghe "phòng bạn thắng vòng giá", khách nghe "báo giá của bạn
đã có". Gộp enum là sớm muộn cũng lộ chữ nội bộ ra mặt khách.

Thêm loại mới không cần migration — `notifications.type` là cột `text` thường,
không phải DB enum (`schema.prisma:288`).

## Danh mục thông báo

### Cho khách hàng — `CustomerNotifType`

| type | Bắn khi | Điểm nối |
|---|---|---|
| `quote_request_received` | Khách vừa gửi yêu cầu | `quote-request.service.ts:113` |
| `quote_ready` | Sale chốt giá, đơn sang `awaiting_customer` | `selection.service.ts:53` |
| `quote_request_rejected` | Admin/Sale từ chối yêu cầu | `quote-request.service.ts:221` |
| `order_closed` | Đơn chốt thành công | `orders.service.ts:207` |
| `order_milestone` | Mốc hành trình chuyển `done` | `milestones.service.ts:125` |
| `order_completed` | Đơn hoàn thành | `milestones.service.ts:111` |
| `order_cancelled` | Đơn bị huỷ | `orders.service.ts:273` |

`quote_ready` là loại chính của thiết kế này.

`quote_request_received` không thừa: khách gửi form xong không thấy hồi âm thì
gửi lại lần hai, lần ba, và Sale nhận ba yêu cầu trùng.

`order_milestone` là thứ khách hỏi nhiều nhất sau khi chốt. Hiện
`MILESTONE_UPDATED` chỉ bắn cho `order.createdBy` — đúng một người là Sale tạo
đơn (`milestones.service.ts:127`).

### Cho nhân viên — thêm vào `NotifType`

| type | Bắn cho | Vá lỗ hổng |
|---|---|---|
| `quote_request_new` | Admin + Sale | Yêu cầu không có `serviceId` → hiện không ai được báo |
| `quote_request_failed` | Admin | Auto-convert lỗi → hiện chỉ ghi activity log rồi nuốt |

Hai loại này dùng `quote_request_id` làm ngữ cảnh thay cho `order_id` — đúng
lúc bắn thì chưa có đơn nào.

## Luồng `quote_ready`

Trong `selection.service.ts`, **sau** vòng `for` bắn cho các phòng (dòng
77-89), thêm một khối:

1. `quoteRequest.findFirst({ where: { convertedToOrderId: orderId } })`
2. Không có → đơn do Sale tự tạo, không từ khách nào. Không bắn. Đây là ca bình
   thường, không phải lỗi.
3. Có → dựng `CustomerNotifyInput` với `customerId` (có thể null) và
   `quoteRequestId`.
4. Body lấy `OrderDepartment.amount` của phòng thắng (`schema.prisma:227`,
   `Decimal(15,0)`) → *"Báo giá đơn BOP-xxx: 12.500.000đ"*. Có con số thì push
   mới đáng mở.

## API

Ba endpoint mới cho khách, mirror `notifications.controller.ts`, đặt dưới
`CustomerProfileController` (đã có `CustomerJwtGuard`):

| Method | Path |
|---|---|
| GET | `/customer-auth/me/notifications` |
| GET | `/customer-auth/me/notifications/unread-count` |
| POST | `/customer-auth/me/notifications/read` |

Và hai endpoint sửa:

- `POST /quote-requests` — `CreateQuoteRequestDto` nhận thêm `fcmToken?`
  (optional, CHỈ có tác dụng với khách vãng lai; submit khi đã đăng nhập thì
  token bị bỏ qua vì đã nằm ở `customer_devices`). Không nhận `platform`:
  `quote_requests` không có cột này nên trường đó sẽ bị vứt đi trong im lặng.
- `PUT /customer-auth/me/push-preferences` — đọc/ghi `push_off`.

## Xử lý lỗi

| Tình huống | Xử lý |
|---|---|
| Ghi `notifications` lỗi | Log error, nuốt. Việc chính đã commit xong |
| FCM sập / timeout | Dòng đã `pushed_at`, mất push đó. Khách CÓ tài khoản vẫn thấy trong inbox — lý do chọn push + inbox thay vì push trần. Khách VÃNG LAI thì **mất hẳn**, xem ghi chú dưới bảng |
| Token chết | Xoá `customer_devices`; nếu là token vãng lai thì clear `quote_requests.fcm_token` |
| Khách chưa cấp quyền | Không có token → không bắn, inbox vẫn ghi |
| `firebase-admin` chưa cấu hình | No-op + warn một lần lúc khởi động |
| Khách xoá tài khoản | `ON DELETE CASCADE` trên `customer_id` dọn sạch. Khớp với `DELETE /customer-auth/me` đã có (commit f8a7cb4) |

### Khách vãng lai là push-only, không có đường cứu

Nói thẳng vì đây là ca chính chứ không phải ca biên: form public trên landing
page mới là nguồn yêu cầu báo giá đông nhất, và người gửi nó không có tài
khoản.

Dòng thông báo của họ có `customer_id IS NULL`, trong khi
`CustomerNotificationsService.inbox` lọc theo `customerId` — không endpoint nào
trả về được dòng đó. `pushed_at` lại được đóng dấu TRƯỚC khi gọi FCM. Nghĩa là
chỉ cần một lần FCM timeout, hoặc máy khách tắt quyền thông báo, là câu "báo giá
của bạn đã có" biến mất vĩnh viễn: khách không có chỗ nào mở ra xem lại, và
cũng không biết là mình vừa mất gì. Câu "Inbox vẫn còn" ở bảng trên chỉ đúng với
khách có tài khoản.

Đây là **cái giá được chấp nhận**, không phải thiếu sót quên vá. Để khách vãng
lai có hộp thư thì phải sinh tài khoản placeholder cho mỗi lần submit — mà
`customer_accounts.email` là UNIQUE NOT NULL trong khi form public cho bỏ trống
email, nên sẽ đẻ ra một bảng tài khoản rác không ai đăng nhập được và không ai
dọn. Đổi lại, `quote_requests` vẫn giữ `phone`/`email` khách nhập — Sale gọi
lại được, và đó là đường cứu duy nhất. Không làm endpoint hộp thư cho khách
vãng lai.

## Một thay đổi cần làm ở truy vấn cũ

Đúng một chỗ, và là vá hiệu năng chứ không phải vá đúng-sai.

`flushEmails` (`notification.cron.ts:64-72`) quét `WHERE n.emailed_at IS NULL`.
Dòng của khách không bao giờ được gửi email nên `emailed_at` ở null vĩnh viễn,
và sẽ bị quét lại mỗi hai phút, tích tụ dần. Thêm một điều kiện:

```sql
WHERE n.emailed_at IS NULL AND n.user_id IS NOT NULL
```

Tính đúng-sai đã an toàn sẵn nhờ INNER JOIN với `users` — đây chỉ là để bảng
quét không phình theo thời gian.

Bốn điểm truy vấn còn lại (`notifications.service.ts:25,26,46,52`) **không đổi
một dòng nào**, và luồng SSE cũng vậy: `pushCustomer` không gọi `events.emit`,
còn `NotificationEvent.userId` vẫn là `number` bắt buộc nên
`streamFor(userId)` không có gì để lọc thêm.

## Kiểm thử

Jest, `npm test`. Repo đã có 15 file `.spec.ts`.

Đơn vị:

1. `resolveTokens` — khách có tài khoản; khách vãng lai; cùng token lọt cả hai
   đường (phải distinct); `push_off` lọc đúng loại; không có token nào.
2. `flushPush` claim — hai vòng cron chạy song song không bắn trùng
   (`SKIP LOCKED`).
3. Token chết → `customer_devices` bị xoá và `quote_requests.fcm_token` bị
   clear.
4. `selectQuote` sinh đúng một dòng với `amount` đúng; đơn không có quote
   request → không sinh dòng nào.
5. `pushCustomer` ném lỗi DB → `selectQuote` vẫn thành công.
6. CHECK `notifications_owner_ck` — chèn dòng có cả `user_id` và `customer_id`
   phải bị DB từ chối; dòng ba cột đều null cũng bị từ chối.

Hồi quy, phải chạy lại sau khi `user_id` thành nullable:

7. `notify.service.spec.ts` — đường của staff không đổi hành vi.
8. Inbox của nhân viên id N **không** thấy thông báo của khách id N. Đây là
   chính cái ca mà thiết kế hai cột FK sinh ra để chặn; phải có test đóng đinh
   nó lại.

## Tổng khối lượng

1 migration, 3 cột thêm vào `notifications`, 1 cột vào `quote_requests`, 1 cột
vào `customer_accounts`, 3 index, 1 CHECK; 1 service mới (`FcmService`), 1
method thêm vào `NotifyService`, 1 method thêm vào `NotificationCron`; 9 loại
thông báo; 5 endpoint; 1 dependency (`firebase-admin`); 1 dòng sửa ở truy vấn
cũ.
