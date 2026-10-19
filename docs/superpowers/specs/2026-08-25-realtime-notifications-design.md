# Thông báo tức thì + badge trên tab

Ngày: 2026-08-25 · Trạng thái: đã duyệt, đang thực hiện

## Vấn đề

Thông báo ghi vào DB ngay trong request tạo đơn, nhưng FE poll mỗi 60 giây
(`NotificationProvider.tsx`) nên người nhận thấy trễ tới một phút. Không có
websocket. Người dùng cũng không biết có tin mới khi tab đang ở nền.

## Ràng buộc hạ tầng

Ba điều kiện quyết định thiết kế, đã xác minh trong mã nguồn:

1. **Session là JWT trong cookie httpOnly** (`jwt.strategy.ts`). `EventSource`
   tự gửi cookie, nên SSE không cần đổi cơ chế xác thực — đây là lý do phương
   án này rẻ.
2. **Chỉ một container API** (`docker-compose.prod.yml`). Bus trong bộ nhớ là
   đủ; KHÔNG đúng nữa nếu chạy nhiều replica.
3. **Vercel proxy `/api/*` sang VM** (`vercel.json`). Proxy của Vercel có thể
   buffer hoặc cắt `text/event-stream`. Không thể biết trước, phải chịu được
   cả hai khả năng.

Ràng buộc 3 là lý do có cơ chế hạ cấp; không có nó thì SSE trần đã đủ.

## Kiến trúc

    push()/cron  ──emit──▶  NotificationEvents (rxjs Subject)
                                    │ lọc theo userId
                                    ▼
                            @Sse('stream')  ──▶  EventSource
                                                      │
                                        live ─────────┤
                                        đứt 3 lần ────┴──▶ poll 5s

### Backend

- `NotificationEvents` — Subject trong bộ nhớ. `emit(rows)` và
  `streamFor(userId)`. Nhịp tim 25 giây để proxy không cắt kết nối rỗng và để
  FE phát hiện đường truyền chết.
- `NotifyService.push` — emit sau khi `createMany` thành công, bọc try/catch
  riêng: ghi thông báo là việc phụ, không được làm hỏng việc chính.
- `NotificationCron` — hai hàm `checkSla`/`expireQuotes` INSERT bằng raw SQL,
  KHÔNG đi qua `NotifyService`. Phải đổi sang `$queryRaw ... RETURNING` rồi
  emit, nếu không nhắc SLA và báo giá hết hạn sẽ không realtime.
- `@Sse('stream')` trong `NotificationsController`, có `@SkipEnvelope()`.

### Hai cái bẫy

- `TransformInterceptor` là interceptor TOÀN CỤC, bọc mọi response vào
  `{ success, data, meta }`. Áp lên luồng SSE thì client nhận rác. Giải bằng
  decorator `@SkipEnvelope()` đọc qua `Reflector` — tường minh hơn dò metadata
  nội bộ của Nest.
- Bus trong bộ nhớ chỉ đúng với một instance. Cảnh báo nằm trong doc-comment
  của `NotificationEvents`, vì đây là loại lỗi chỉ lộ ra khi scale.

### Frontend

- `services/notificationStream.ts` — bọc `EventSource`, máy trạng thái
  `live` / `fallback`. Đứt 3 lần liên tiếp thì đóng SSE và poll 5 giây, thử
  nối lại mỗi 60 giây. Bộ đếm 3 lần để phân biệt mạng chớp với proxy chặn hẳn.
- `NotificationProvider` — chu kỳ poll lấy theo trạng thái kết nối (5 phút khi
  live, 5 giây khi fallback). Giữ nguyên hai hành vi cũ: chỉ poll khi tab hiển
  thị, và refresh khi cửa sổ được focus. Thêm `subscribe(cb)` để chuông tự làm
  mới nếu đang mở sẵn.
- `utils/documentTitle.ts` — CHỦ SỞ HỮU DUY NHẤT của `document.title`. Hiện
  `PageContainer` ghi thẳng vào nó; nếu badge ghi từ chỗ khác thì đổi trang là
  badge biến mất. Module giữ hai mẩu trạng thái (tên trang, số chưa đọc) và tự
  dựng lại chuỗi `(3) Nhân viên · BeeOps`. Trên 99 hiện `(99+)`, bằng 0 bỏ hẳn
  tiền tố.

## Ngoài phạm vi

Toast nổi, âm thanh, đổi favicon. Yêu cầu là con số trên tab.

## Kiểm thử

- Backend jest: người A không nhận sự kiện của người B; có nhịp tim; huỷ đăng
  ký khi ngắt; `push` có emit; cron emit đúng số dòng `RETURNING`.
- Backend: `npm test`, `tsc --noEmit`, `npm run lint`.
- FE: `npm run build` (tsc -b), `npm run lint`. FE chưa có test runner.
- Thủ công: hai trình duyệt, tạo đơn ở tài khoản sale, xem tab tài khoản nhân
  viên cùng phòng — số phải nhảy dưới 1 giây. Chặn `/stream` bằng DevTools để
  ép `fallback`, xác nhận vẫn nhảy trong 5 giây.
