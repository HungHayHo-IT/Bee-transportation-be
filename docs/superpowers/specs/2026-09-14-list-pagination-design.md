# Phân trang đồng nhất cho mọi API danh sách

Ngày: 2026-09-14 · Trạng thái: chờ duyệt

## Vấn đề

Quy ước đã có từ QA-05, ghi trong doc-comment của `onePage()`
(`src/common/dto/pagination.dto.ts:41-46`):

> *"một số danh sách trả mảng trần, số khác trả vỏ phân trang, nên mỗi service ở
> front-end phải nhớ riêng từng dạng. Nay MỌI danh sách đều dùng vỏ này."*

Quy ước đó **làm dở**. Trong 63 endpoint GET của hệ thống, những cái trả về
danh sách chia làm bốn nhóm:

- **10** đã phân trang thật
- **6** đã bọc `onePage()`
- **15** vẫn trả mảng trần — chính là nhóm quy ước bỏ sót
- **9** là số liệu tổng hợp của dashboard, không phải danh sách

Số còn lại là endpoint chi tiết một bản ghi, đếm số, hoặc tải file — không liên quan.

Ngoài ra có hai hỏng hóc đi kèm, phát hiện khi khảo sát:

**`clamp` bị sao chép sáu lần** — `customers.controller.ts:15`,
`users.controller.ts:14`, `news.controller.ts:18`,
`quote-request.controller.ts:27`, `notifications.controller.ts:15`,
`customer-profile.controller.ts:30`. Hai chữ ký khác nhau nhưng hành xử y hệt
(bản ba tham số hardcode `lo = 1`, bản bốn tham số nhận `lo` rồi mọi điểm gọi
đều truyền `1`).

**`page` tràn kiểu `Int` của Prisma và bật 500.** Năm trong sáu controller truyền
`Number.MAX_SAFE_INTEGER` làm trần cho `page`, nên `?page=9007199254740991` cho
`skip` vượt `Int` và Prisma ném lỗi chưa bắt. Chỗ này đã vá ở
`customer-profile.controller.ts` (`MAX_PAGE = 1_000_000`) nhưng chỉ một chỗ.

## Phạm vi

Trong phạm vi: 15 endpoint trả mảng trần, cộng hai hỏng hóc trên.

Ngoài phạm vi, đã cân nhắc và loại:

- **9 endpoint dashboard tổng hợp** (`summary`, `revenue`, `revenue/by`, `funnel`,
  `win-rate`, `response-time`, `competition`, `competition/avg-departments`,
  `workload`). Đây là số liệu, không phải danh sách; phân trang một cái phễu hay
  một chuỗi doanh thu là vô nghĩa. `GET /dashboard/export` trả file Excel, cũng
  không phải danh sách.
- **`GET /orders/kanban`.** Đã tự giới hạn 50 đơn mỗi cột lấy từ 500 đơn mới nhất,
  và doc-comment ghi rõ *"bảng thao tác, không phải báo cáo đầy đủ"* — cố ý.
- **`orders` và `activity`** đang nhận tham số qua `PaginationDto` + class-validator
  (ném 400 khi gõ rác) thay vì `clamp` (rác thì lấy mặc định). Hai lối này cùng tồn
  tại từ trước; thống nhất chúng là việc riêng, không phục vụ mục tiêu lần này.
- **Thêm `sortBy`/`sortOrder`** cho các endpoint mới. Mỗi cái đã có thứ tự tự nhiên
  (timeline và bình luận theo thời gian, file theo lúc tải lên). YAGNI.

## Quyết định: `clamp`, không phải `PaginationDto`

Sáu controller dùng `clamp`, hai dùng `PaginationDto`. Theo số đông là một lý do
yếu; lý do thật nằm ở doc-comment lặp trên cả sáu bản `clamp`:

> *"Query string luôn là chuỗi; số rác thì lấy mặc định thay vì ném 400."*

Đó là một quyết định sản phẩm đã có: danh sách gõ sai tham số thì vẫn trả trang
đầu, không chặn người dùng bằng lỗi validate. Endpoint mới theo đúng lối đó.

## Thay đổi

### 1. Một `clamp` duy nhất

Chuyển vào `src/common/dto/pagination.dto.ts`, export ra:

```ts
export const MAX_PAGE = 1_000_000;

/** Query string luôn là chuỗi; số rác thì lấy mặc định thay vì ném 400. */
export function clamp(raw: string | undefined, fallback: number, lo: number, hi: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < lo) return fallback;
  return Math.min(n, hi);
}
```

Xoá sáu bản cục bộ, mọi điểm gọi import từ đây. Điểm gọi nào đang truyền
`Number.MAX_SAFE_INTEGER` (hoặc dùng mặc định) làm trần cho `page` thì đổi sang
`MAX_PAGE` — đó là phần vá lỗi 500, và gộp về một hàm là cách duy nhất để vá cả
sáu chỗ mà không bỏ sót.

Giữ nguyên chữ ký bốn tham số: bản ba tham số chỉ là bản bốn tham số với `lo`
hardcode, nên gộp theo hướng này không đổi hành vi ở bất kỳ điểm gọi nào.

### 2. `PagedDto()` — một nhà máy thay cho 27 bản sao

Repo đang có **12 lớp `XxxPageDto` viết tay**, mỗi lớp cùng một vỏ bốn field chỉ
khác kiểu `items`. Thêm 15 endpoint theo lối cũ là 27 bản sao của cùng bốn dòng.

Thêm vào `pagination.dto.ts`:

Một hàm sinh lớp, nhận kiểu của phần tử và trả về một lớp có đúng bốn field
`items` / `total` / `page` / `limit`, `items` được đánh dấu `@ApiProperty({ type: [item] })`.

Hai ràng buộc phải giữ:

- **Đặt lại `name` của lớp sinh ra.** Mọi lớp sinh từ cùng một nhà máy đều mang
  cùng một tên, mà Swagger lấy tên lớp làm tên schema — không đặt lại thì các
  schema đè lên nhau và tài liệu API sai im lặng.
- **Nhận được cả kiểu nguyên thuỷ.** Bốn endpoint `reference/*` trả `string[]`,
  không phải lớp DTO, nên nhà máy phải nhận được `String` bên cạnh các lớp.

Điểm gọi giữ nguyên tên lớp cũ để **tên schema trong Swagger không đổi**:

```ts
export class OrderPageDto extends PagedDto(OrderListItemDto) {}
```

Chuyển cả 12 lớp sẵn có sang nhà máy này. Việc đó không đụng controller hay
service — tên lớp giữ nguyên nên chữ ký endpoint không đổi, chỉ thân lớp DTO ngắn
lại từ năm dòng còn một. Để hai lối khai báo cùng tồn tại thì người sau sẽ phải
hỏi "dùng cái nào", nên chuyển hết là rẻ hơn về lâu dài.

*Nếu lúc duyệt spec thấy việc chuyển 12 lớp cũ là mở rộng phạm vi quá tay, cắt nó
ra khỏi kế hoạch được — phần còn lại vẫn chạy độc lập.*

### 3. Nhóm bọc vỏ — 12 endpoint

Mỗi cái đổi kiểu trả về thành `PageResult<T>` và bọc `onePage(...)`. Không thêm
tham số truy vấn nào. Đây là những danh sách **có trần tự nhiên**, nên bọc vỏ chỉ
để front-end không phải nhớ hai dạng response.

| Endpoint | File | Kiểu hiện tại |
|---|---|---|
| `GET /reference/provinces` | `reference.controller.ts:23` | `string[]` (đồng bộ) |
| `GET /reference/order-statuses` | `reference.controller.ts:30` | `LabeledDto[]` (đồng bộ) |
| `GET /reference/reject-reasons` | `reference.controller.ts:37` | `string[]` (đồng bộ) |
| `GET /reference/order-sources` | `reference.controller.ts:44` | `string[]` (đồng bộ) |
| `GET /departments/tree` | `departments.controller.ts:56` | `DepartmentTreeNodeDto[]` |
| `GET /orders/:id/milestones` | `milestones.controller.ts:16` | `OrderMilestoneDto[]` |
| `GET /orders/:id/reference-prices` | `quotes.controller.ts:126` | `ReferencePriceDto[]` |
| `GET /orders/:id/mentionables` | `collab.controller.ts:52` | `MentionableUserDto[]` |
| `GET /orders/:id/files` | `collab.controller.ts:68` | `FileMetaDto[]` |
| `GET /sale/representatives` | `sale.controller.ts:17` | `DepartmentRepresentativeGroupDto[]` |
| `GET /landing/representatives` | `sale.controller.ts:37` | `LandingRepresentativeDto[]` |
| `GET /notifications/my-tasks` | `notifications.controller.ts:80` | `TaskDto[]` |

Bốn endpoint `reference/*` là **đồng bộ** (trả `T[]` chứ không phải `Promise<T[]>`).
`onePage()` cũng đồng bộ nên không cần đổi sang `async`.

**`my-tasks` nằm ở nhóm này chứ không phải nhóm phân trang thật.** Nó đã có trần
sẵn: `take: 50` ở mỗi trong hai nhánh vai trò rồi gộp trong JS
(`notifications.service.ts:77-126`), tối đa 100 mục. Phân trang thật ở đó đòi gộp
hai truy vấn khác loại thành một truy vấn phân trang được — nhiều việc cho một
widget vốn đã bị chặn, và `total` sẽ là con số bịa (100) chứ không phải tổng thật.

**`files` cũng nằm ở nhóm này, vì KHÔNG phân trang thật được.** `FilesService.list`
(`files.service.ts:69-83`) không truy vấn một bảng file nào — nó đọc cột JSON
`orders.files` và `order_milestones.files`, gộp hai nguồn trong JS rồi map. Không có
hàng nào để `skip`/`take`; phân trang thật ở đây đòi tách file ra thành bảng riêng,
là việc đổi schema nằm ngoài mục tiêu lần này. Số file đính kèm một đơn có trần
tự nhiên, nên bọc vỏ là đủ.

### 4. Nhóm phân trang thật — 3 endpoint

| Endpoint | File | Hiện tại |
|---|---|---|
| `GET /orders/:id/timeline` | `orders.controller.ts:117` | mảng trần |
| `GET /orders/:id/comments` | `collab.controller.ts:31` | mảng trần |
| `GET /dashboard/drill` | `dashboard.controller.ts:127` | có `limit`, **không có `page`, không có `total`** |

Mỗi endpoint:

- Controller nhận `@Query('page')` và `@Query('limit')`, đưa qua `clamp` dùng chung
  — `clamp(page, 1, 1, MAX_PAGE)` và `clamp(limit, <mặc định>, 1, <trần>)`.
- Service chạy `this.prisma.$transaction([count, findMany])` rồi trả `PageResult`.
- Giữ nguyên `orderBy` hiện có.

Mặc định `limit`: 20 cho `timeline` và `comments`; **50 cho `drill`, trần
500** — giữ đúng con số `take: f.limit ?? 500` đang chạy để không thu hẹp hành vi
sẵn có của màn drill-down.

`drill` là ca đặc biệt: nó **đã** nhận `limit` qua `DrillFilterDto`. Thêm `page`
và `total` vào, không đẻ tham số thứ hai trùng nghĩa.

### Ràng buộc ẩn: `POST /orders/:id/comments` gọi `list()`

`CommentsService.create` kết thúc bằng `return this.list(orderId, user)`
(`comments.service.ts:113`) — POST trả về nguyên luồng sau khi thêm. Đổi chữ ký
`list()` là POST gãy theo.

Luồng bình luận sắp theo `createdAt: 'asc'`, nên bình luận vừa viết nằm ở TRANG
CUỐI chứ không phải trang đầu. Trả trang đầu là người dùng viết xong không thấy
bình luận của chính mình.

Quyết định: **`create()` trả về TRANG CUỐI**, cùng vỏ `PageResult` với GET. Đây là
thay đổi hành vi nhỏ nhất: front-end vẫn thấy bình luận mới trong response như cũ,
chỉ thêm một lớp `.items` để bóc.

Đã cân nhắc và loại: để POST trả mảng trần như cũ (thì một luồng 500 bình luận
vẫn trả cả 500 sau mỗi lần viết — đúng cái vấn đề đang sửa), và để POST chỉ trả
bình luận vừa tạo (đúng REST hơn, nhưng bắt front-end sửa nhiều hơn so với việc
chỉ bóc thêm `.items`).

## Phá hợp đồng API

15 endpoint đổi từ `T[]` sang `{ items, total, page, limit }`. Không có cách nào
vừa đổi vừa không phá, trừ khi thêm tham số opt-in — mà như thế lại đẻ ra đúng hai
dạng response mà QA-05 sinh ra để dẹp.

Đã chốt với chủ dự án: **đổi thẳng, front-end sửa theo cùng đợt.** Không làm giai
đoạn chuyển tiếp, không giữ shape cũ.

## Xử lý lỗi

Không có đường lỗi mới. `clamp` nuốt mọi đầu vào rác về mặc định theo đúng thiết
kế sẵn có, nên các endpoint mới không sinh thêm mã lỗi nào. `MAX_PAGE` biến một ca
đang trả 500 thành trả trang rỗng — đó là sửa lỗi, không phải hành vi mới.

## Kiểm thử

Jest, unit test thuần với Prisma giả cast `as unknown as PrismaService` — repo
không có test chạm DB.

1. **`clamp`** — bảng ca cho `undefined`, chuỗi rỗng, `'abc'`, `'0'`, số âm, số
   thực, số vượt trần, số hợp lệ. Đây là hàm dùng chung cho toàn hệ thống sau khi
   gộp nên nó xứng đáng có bộ test riêng, thứ mà sáu bản cũ chưa bao giờ có.
2. **`MAX_PAGE`** — `?page=9007199254740991` cho ra `skip` hữu hạn, không tràn.
3. **`PagedDto()`** — lớp sinh ra có đúng bốn field; hai lớp sinh từ hai kiểu khác
   nhau có `name` khác nhau (nếu không Swagger sẽ đè schema).
4. **Nhóm bọc vỏ** — với mỗi endpoint: `total` bằng `items.length`, `page` bằng 1.
   Không cần test riêng cho từng cái trong 11 cái; một test bảng chạy qua các
   controller là đủ, vì logic y hệt nhau.
5. **Nhóm phân trang thật** — với mỗi endpoint: `skip` bằng `(page - 1) * limit`;
   `total` lấy từ `count` chứ không phải `items.length` (đây là chỗ dễ sai nhất và
   là cả lý do tồn tại của `total`); tham số rác rơi về mặc định.
6. **Hồi quy** — 219 test hiện có phải còn xanh. Bất kỳ test nào đang assert trên
   mảng trần của 15 endpoint này đều phải sửa sang `.items`.

## Tổng khối lượng

1 file dùng chung sửa (`pagination.dto.ts`: thêm `clamp`, `MAX_PAGE`, `PagedDto`),
6 bản `clamp` cục bộ xoá đi, 12 lớp `PageDto` sẵn có chuyển sang nhà máy, 15
endpoint đổi kiểu trả về trên 8 controller (12 bọc vỏ, 3 phân trang thật), khoảng 12 lớp `PageDto` mới (ba danh
sách chuỗi của `reference/*` dùng chung một lớp), 3 service thêm truy vấn `count`.
