# BeeOps Backend

Web vận hành nội bộ Bee Transportation Corporation — **một service NestJS, chỉ dùng PostgreSQL**.

Triển khai lên VM: **[DEPLOY.md](DEPLOY.md)**

Thiết kế đầy đủ (ngoài repo): `beeops-docs/beeops-backend.md`

---

## Chạy lần đầu

```bash
cp .env.example .env          # sửa secret nếu cần
npm install
npm run db:up                 # PostgreSQL 16 trong Docker, cổng 5442

# nạp schema (hai file, chạy liên tiếp) + danh mục + bộ ô nhập riêng của từng dịch vụ
for f in db/schema.sql db/schema-flow.sql db/seed.sql \
         db/migrations/003-service-fields-seed.sql; do
  docker exec -i beeops-postgres psql -U beeops -d beeops -v ON_ERROR_STOP=1 < "$f"
done

npm run prisma:generate
npm run start:dev             # http://localhost:8087/api  ·  docs: /api/docs
```

Tài khoản đầu tiên: `admin@beetransportation.vn` / `BeeOps@2026` — bắt buộc đổi ở
lần đăng nhập đầu. Lần đổi đầu tiên phải là **PIN 6 chữ số** (rule mới từ 013).

Nhân viên còn lại: PIN mặc định `123456`, cũng bị ép đổi ngay lần đầu.

Mật khẩu này chỉ đúng trên DB vừa nạp seed lần đầu. Sau khi ai đó đã đổi, chạy lại
seed cũng không đặt lại. Quên mật khẩu trên môi trường đã dùng thì đặt lại thẳng
dưới DB:

```bash
docker exec -i beeops-postgres psql -U beeops -d beeops -c "UPDATE users SET password_hash = crypt('BeeOps@2026', gen_salt('bf', 12)), must_change_password = true WHERE email = 'admin@beetransportation.vn';"
```

## Lệnh hay dùng

| Lệnh | Việc |
|---|---|
| `npm run start:dev` | Chạy dev, watch |
| `npm run build && npm run start:prod` | Chạy bản build |
| `npm test` | Unit test (phân quyền + máy trạng thái) |
| `python scripts/e2e-smoke.py` | Smoke test toàn luồng F1→F5 trên DB thật |
| `python scripts/e2e-dashboard.py` | Smoke test F6 (chạy sau e2e-smoke) |
| `python scripts/e2e-collab.py` | Smoke test bình luận / file / Excel / PDF / audit |
| `npm run db:reset` | Xóa sạch DB và tạo lại container |
| `npm run prisma:studio` | Xem dữ liệu bằng GUI |

Trên Windows, chạy smoke test bằng `PYTHONIOENCODING=utf-8 python scripts/e2e-smoke.py`
để console không vỡ tiếng Việt.

---

## Tài khoản test dùng chung

Danh sách nằm ở **`src/common/config/test-accounts.json`** — mọi team (BE, FE, QA)
đọc trực tiếp file đó: email, mật khẩu, vai trò, phòng ban.

Năm tài khoản `test.<vai trò>@beeops.test` phủ đủ năm vai trò, dùng chung một mật
khẩu. Chúng **không đổi được mật khẩu** — `POST /auth/change-password` trả 403.
Cả team dùng chung một bộ, nên một người đổi là những người còn lại mất lối vào.

Dựng lại từ đầu (XOÁ SẠCH dữ liệu rồi tạo lại danh mục, sơ đồ tổ chức và tài khoản):

```bash
./scripts/reset-test-data.sh          # hỏi xác nhận trước khi xoá
```

Không hoàn tác được, chỉ chạy trên môi trường thử nghiệm. Script sinh sẵn sơ đồ ba
khối với tám phòng chuyên môn phủ hết mười dịch vụ, trong đó `DOM` và `MMT` cố ý
giao cho hai phòng để luồng cạnh tranh báo giá có chỗ chạy.

Danh sách tài khoản tồn tại ở hai nơi — JSON (code đọc) và `db/seed-test-accounts.sql`
(database đọc). `src/common/config/test-accounts.spec.ts` canh cho hai bên không lệch.

---

## Ba điều dễ sai nhất

**1. Múi giờ.** `current_date` của PostgreSQL quyết định ngày trong mã đơn. Container DB
đặt `TZ=Asia/Ho_Chi_Minh` trong `docker-compose.yml`. Nếu để UTC, đơn tạo lúc 00:00–07:00
giờ Việt Nam sẽ mang mã của **hôm trước**.

**2. Mọi truy vấn `order` phải AND với `scope.orderWhere(user)`.** Đường đọc gom hết
trong `OrdersQueryService` để không có chỗ nào quên. Đơn ngoài phạm vi trả **404**, không
phải 403 — 403 là gián tiếp xác nhận đơn tồn tại.

**3. Doanh thu là dữ liệu riêng.** `orders.finalAmount` chính là báo giá của phòng thắng,
nên chỉ sale phụ trách và **phòng thắng** được thấy. Phòng thua thấy báo giá của chính
mình nhưng không thấy `finalAmount`. Lọc qua `canSeeOrderAmount()`; mọi đường ra khác
(Excel, PDF) cũng phải gọi hàm đó.

---

## Cấu trúc

```
db/                 schema.sql + schema-flow.sql · seed.sql · queries.sql
                                                          ← nguồn sự thật của DB
db/migrations/      thay đổi schema sau golive, chạy theo thứ tự số
prisma/schema.prisma                                      ← view camelCase của db/schema*.sql
src/common/         prisma · guards · scope · mail · activity · filters
src/modules/        auth · departments · users · services · customers
                    orders · quotes · milestones · notifications
scripts/            e2e-smoke.py
```

Sửa DB thì sửa `db/schema.sql` (hoặc `db/schema-flow.sql`) trước, viết thêm một file
trong `db/migrations/` cho database đang chạy, rồi `npx prisma db pull` và đối chiếu tên
camelCase trong `prisma/schema.prisma`. Hai file schema là **một** schema: `schema.sql`
giữ tổ chức, danh mục, trường riêng theo dịch vụ và đơn hàng; `schema-flow.sql` giữ
phân phối, báo giá, mốc tiến độ, trao đổi và nhật ký.

Mọi file mã nguồn giữ **dưới 300 dòng**.

---

## Đã xong / còn thiếu

**Xong:** F7 tổ chức · F1 tạo đơn + mã đơn · F2 phân phối tự động · F3 báo giá cạnh
tranh + báo giá kín + đơn giá tham khảo · F4 chốt/từ chối/hủy · F5 tiến độ + danh sách
+ Kanban + timeline · **F6 dashboard 3 tầng + drill-down + xuất Excel** · F8 thông báo
in-app + cron SLA/email.

**Xong nốt:** bình luận tách luồng theo phòng + @mention · đính kèm file (upload /
stream có kiểm tra quyền / xóa / cron dọn file mồ côi) · xuất Excel đơn hàng · PDF phiếu
xác nhận · audit log cho Admin.

Toàn bộ 8 nhóm tính năng F1–F8 của đặc tả đã có backend.

### Lưu ý về F6

Hai nhóm chỉ số dùng **hai mệnh đề lọc khác nhau** (`dashboard-scope.helper.ts`):
doanh thu chỉ tính đơn phòng **thắng**, chỉ số vận hành tính cả đơn phòng chỉ **tham
gia** báo giá rồi thua — bỏ vế sau thì tỷ lệ thắng báo giá mất đúng phần mẫu số.

Win rate = `(closed|in_progress|completed) / (đó + rejected)`. `cancelled` nằm ngoài cả
tử lẫn mẫu.

`?departmentId=` / `?userId=` chỉ ép **hẹp** hơn, không bao giờ rộng hơn quyền.

### Lưu ý về file đính kèm

Tên file trên đĩa là **UUID**, không dùng tên người dùng gửi lên (chống path traversal);
tên gốc chỉ nằm trong metadata jsonb. Tải về đi qua `GET /files/:orderId/:fileId` có
kiểm tra scope — **không** phục vụ tĩnh. Whitelist MIME: pdf, jpeg, png, webp, doc(x),
xls(x); tối đa 20MB.

Cron dọn file mồ côi chỉ xóa file **cũ hơn 24 giờ**: file vừa upload mà transaction ghi
metadata chưa commit thì chưa có tham chiếu, xóa ngay là mất dữ liệu người dùng.

### Lưu ý về PDF

pdfkit chỉ có Helvetica nên **mất dấu tiếng Việt**. Phiếu xác nhận nhúng `DejaVuSans`
từ package `dejavu-fonts-ttf` — đừng đổi sang font mặc định.

## Thay đổi hợp đồng API sau vòng QA 22/08/2026

Biên bản QA front-end nêu 25 phát hiện. Phần dưới chỉ liệt kê những thay đổi **phá
vỡ hợp đồng cũ** — client phải sửa theo. Các mục còn lại là sửa lỗi trong suốt.

| Trước | Sau | Vì sao |
|---|---|---|
| `/departments`, `/users`, `/services`, `/customers`, `/orders/unrouted`, `/queue`, `/notifications` trả **mảng trần** | Tất cả trả `{ items, total, page, limit }` | QA-05 — ba kiểu hợp đồng danh sách khác nhau, sai một chỗ là màn hình trắng |
| `/activity` và `/orders/:id/timeline` trả trường `at` | Trả `createdAt` | QA-06 — lệch với mọi DTO khác |
| File đính kèm trả `{ by, at, path }` | Trả `{ uploadedById, uploadedByName, createdAt, milestoneId }`, **không còn `path`** | QA-06 — nhất quán tên, và `path` là đường dẫn trên đĩa, không nên lộ |
| Ghi chú từ chối / hủy nằm ở `closeNote` | `rejectNote` và `cancelReason` là hai trường riêng | QA-19 — một cột gánh ba nghiệp vụ |
| Gửi lại báo giá thiếu `scopeNote` → xóa trắng | Vắng khóa = **giữ nguyên**; gửi `null` tường minh mới xóa | QA-17 — mất dữ liệu âm thầm |
| `POST /customers` trùng tên → tạo hồ sơ thứ hai | Trả **409** kèm `error.details.existingCustomerId` | QA-25 — tách đôi lịch sử đơn của một khách |
| `originProvince` nhận mọi chuỗi | Quy về danh mục 34 tỉnh/thành; sai hẳn → 400 | QA-02 — `HN` và `Hà Nội` cùng tồn tại làm hỏng đơn giá tham khảo |
| `dashboard/revenue` trả `period` lùi một ngày | Đúng ngày đầu kỳ theo giờ Việt Nam | QA-21 — tháng 8 hiện thành 07/2026 |
| `revenue/by?dimension=department\|sale` mở cho mọi vai trò | Chỉ cấp công ty, còn lại **403** | QA-22 — đặc tả F6 |

### Thêm mới

| Endpoint | Việc |
|---|---|
| `GET /reference/provinces` | 34 tỉnh/thành hợp lệ — nguồn sự thật cho ô chọn |
| `GET /reference/order-statuses` | Trạng thái đơn kèm nhãn tiếng Việt |
| `GET /reference/reject-reasons`, `/order-sources` | Danh mục cố định |
| `GET /orders/:id/departments/:deptId/quote-history` | Các bản báo giá đã bị ghi đè (QA-16) |
| `POST /orders` với `newCustomer: {...}` | Tạo khách và đơn trong **một** giao dịch (QA-09) |
| `GET /users` cho `manager` | Trưởng phòng lấy được người của phòng mình (QA-01) |

Mọi lỗi có dữ liệu kèm theo nay trả thêm `error.details`. Vi phạm ràng buộc duy nhất
(trùng tên phòng, trùng email) trả **409** thay vì 500.

Chạy lại lưới hồi quy cho biên bản này: `PYTHONIOENCODING=utf-8 python scripts/qa/run_all.py`
#   B e e - t r a n s p o r t a t i o n - b e  
 