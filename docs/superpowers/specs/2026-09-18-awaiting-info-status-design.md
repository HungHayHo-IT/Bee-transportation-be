# Trạng thái `awaiting_info` — đơn từ form khách phải bổ sung thông tin

Ngày: 2026-09-18

## Vấn đề

Form báo giá trên landing page cố tình tối giản: chỉ hỏi tên, số điện thoại,
dịch vụ, lời nhắn. Khách **không** được hỏi điểm đi, điểm đến, hay các trường
riêng của dịch vụ ("Thuê từ ngày", "Loại hình tờ khai"…) — đó là việc của nhân
viên sau khi liên hệ.

Nhưng `orders.create(..., { fromPublicForm: true })` đang **miễn** mọi trường
bắt buộc rồi gán thẳng đơn sang `distributed`. Hậu quả: một đơn chưa có điểm đi
lẫn điểm đến vẫn được phân cho phòng ban và hiện ở cột "Đang báo giá" — phòng
ban nhìn vào không có gì để báo giá, còn trạng thái thì nói dối rằng đơn đang
chạy bình thường.

Song song đó, form admin và form web lệch nhau ở trường bắt buộc: web bắt buộc
số điện thoại, admin thì không.

## Quyết định

Thêm trạng thái thật `awaiting_info` vào vòng đời đơn, chặn luồng — không phải
nhãn hiển thị. Đơn từ form khách dừng ở đó cho tới khi có người nhập đủ.

Phương án "chỉ là nhãn hiển thị" đã bị loại: nó để phòng ban tiếp tục nhận đơn
thiếu dữ liệu và vẫn báo giá được, tức là không giải quyết cái đau thật.

## Thiết kế

### 1. Máy trạng thái

```
awaiting_info -> new | distributed | cancelled
```

Một chiều. **Không** trạng thái nào quay ngược về `awaiting_info`.

Lý do: nếu cho quay lại, một người lỡ xoá trống ô điểm đến sẽ kéo đơn đang báo
giá dở về hàng chờ, phòng ban mất việc đang làm và đơn nhảy qua nhảy lại giữa
hai cột. Vào `awaiting_info` chỉ bằng đúng một cửa — lúc tạo từ form khách.

`awaiting_info` không nằm trong danh sách trạng thái cho phép báo giá và không
nằm trong `DEPT_WORKABLE`, nên phòng ban không nhận được đơn và không báo giá
được.

### 2. Định nghĩa "đủ thông tin" — một nguồn sự thật

Helper mới `src/modules/orders/order-completeness.helper.ts`:

```ts
missingOrderInfo(order, schema): string[]
```

Trả về danh sách khoá trường còn thiếu:

- tên khách (`companyName`)
- số điện thoại
- dịch vụ
- điểm đi (`originProvince`)
- điểm đến (`destinationProvince`)
- các trường bắt buộc riêng của dịch vụ — dùng lại đúng validator mà
  `skipRequired` đang bỏ qua, không viết lại luật lần hai

Backend là nơi phán quyết. Admin vẫn giữ nút Lưu mờ đi cho dễ dùng, nhưng
không được phép là chỗ **định nghĩa** "đủ": hai định nghĩa song song sẽ lệch
nhau sau vài tháng và không ai biết bên nào đúng.

### 3. Đơn từ form khách

Trong `orders.create`, khi `fromPublicForm` và `missingOrderInfo()` còn thiếu:

- trạng thái = `awaiting_info`
- **bỏ hẳn** bước định tuyến phòng ban (không sinh `order_departments`)

Khi không thiếu gì (nhân viên nhập hộ qua cùng API), giữ nguyên luồng cũ.

### 4. Thoát trạng thái

Nhân viên sửa đơn qua `PATCH /orders/:id`. Lưu xong, backend tự chấm lại bằng
`missingOrderInfo()`. Hết thiếu thì:

1. chạy đúng bước định tuyến của `create()`
2. `assertTransition` sang `distributed` (hoặc `new` nếu không ra phòng nào)
3. ghi activity log
4. bắn thông báo phân công như đơn thường

Không có nút "Xác nhận đủ thông tin" riêng — thêm một bước thủ công là thêm một
chỗ để quên, và đơn sẽ nằm lại trong hàng chờ dù đã đủ dữ liệu.

### 5. Đồng bộ trường bắt buộc giữa hai form

Chỗ lệch duy nhất là **số điện thoại**: `QuoteForm.tsx` bắt buộc, admin không.
Sửa admin bắt buộc (`OrderCustomerPicker` + `canSubmit`).

Điểm đi/điểm đến **giữ nguyên hiện trạng** — web không hỏi, DTO để optional,
admin bắt buộc. Phần này vốn đã đúng; cái sai chỉ là hậu quả của nó, tức trạng
thái đơn, đã xử lý ở mục 1 và 3.

### 6. Thông báo cho admin

Đã có sẵn và **không làm lại**:

- convert thành công → `NEW_ORDER` cho admin + sale
- không ra được dịch vụ → thông báo riêng cho admin + sale
- auto-convert ném lỗi → thông báo riêng cho admin

Việc cần làm: đổi **nội dung** thông báo cho đơn rơi vào `awaiting_info` thành
"thiếu điểm đi, điểm đến…" kèm danh sách trường thiếu, để người đọc biết phải
làm gì thay vì mở đơn ra mới biết. Giữ nguyên `NotifType.NEW_ORDER` vì app đã
xử lý loại này rồi.

Kiểm chứng bằng dữ liệu thật trên production rằng thông báo có bắn, không kết
luận từ việc đọc mã.

### 7. Khách hàng không bị ảnh hưởng

`customer-quote.helper.ts` chỉ trả về trạng thái **suy ra** (`pending` / có giá
/ đơn chết), không bao giờ trả `orders.status` thô. Khách sẽ thấy `pending` —
đúng nghĩa "chưa có giá" — chứ không thấy dòng chữ "cần bổ sung thông tin" rồi
tưởng mình phải nhập gì đó.

### 8. App nhân viên

App đọc `orders.status` trực tiếp. Team mobile phải thêm nhãn cho
`awaiting_info`, nếu không đơn sẽ hiện trạng thái trống. Đây là thay đổi phá vỡ
giao kèo — phải báo trước khi deploy.

### 9. Đơn cũ

Migration **không** đụng vào đơn cũ. Đơn đang ở `distributed`/`quoting` giữ
nguyên, phòng ban đang làm dở không bị kéo ngược. Chấp nhận một thời gian tồn
tại song song hai kiểu đơn.

## Cơ sở dữ liệu

Đủ 4 bước bắt buộc của repo:

1. `db/migrations/020-order-awaiting-info.sql` — bỏ và tạo lại ràng buộc CHECK
   trên `orders.status` để thêm `'awaiting_info'`
2. `db/schema.sql` — cập nhật đúng khối CHECK đó
3. `scripts/check-migrations.sql` — thêm dòng kiểm tra ràng buộc mới đã có
4. `prisma/schema.prisma` — `status` là `String` nên không đổi kiểu, chỉ cập
   nhật chú thích liệt kê trạng thái

## Kiểm thử (viết test đỏ trước)

- máy trạng thái: `awaiting_info` đi được sang `new`/`distributed`/`cancelled`,
  **không** đi thẳng sang `quoting`; không trạng thái nào quay về `awaiting_info`
- `missingOrderInfo()`: thiếu từng trường một, đủ thì trả mảng rỗng
- `create()` từ form khách: dừng ở `awaiting_info` và **không** sinh
  `order_departments`
- `create()` từ form khách nhưng đủ dữ liệu: vẫn chạy luồng cũ
- `update()`: nhập nốt trường cuối thì tự thăng trạng thái và có định tuyến
- API báo giá từ chối đơn đang ở `awaiting_info`
- nội dung thông báo có liệt kê trường thiếu

## Phạm vi file

**Backend** — `src/common/enums/index.ts`, `src/modules/orders/order-state.helper.ts`,
`src/modules/orders/orders.service.ts`, `order-completeness.helper.ts` (mới),
`quote-request-notify.helper.ts`, migration 020 + `db/schema.sql` +
`scripts/check-migrations.sql` + `prisma/schema.prisma`.

**Admin** — `src/constants/orderStatus.ts`, i18n vi/en, `OrdersKanbanPage`,
`OrderFiltersBar`, `OrderCustomerPicker`, banner "còn thiếu" ở trang chi tiết.

**Landing** — không đổi gì.
