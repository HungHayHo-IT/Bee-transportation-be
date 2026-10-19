# Sơ đồ tổ chức + chuyển đơn nội bộ

Ngày: 2026-09-04 · Trạng thái: đã duyệt, chờ lập kế hoạch thực hiện

Phạm vi trải hai repo: `bee-transportation-be` (NestJS/Prisma) và
`bee-transportation-admin` (React/Vite/MUI). Không viết lại phần nào đang
chạy — chỉ bổ sung.

## Vấn đề

Hai thiếu sót độc lập nhưng dùng chung một khối dữ liệu (phòng ban), nên làm
cùng một đợt.

**1. Không có sơ đồ tổ chức.** `Department` trong `prisma/schema.prisma:13`
là bảng phẳng: chỉ có `managerId` trỏ tới một `User`, và `User.departmentId`
trỏ ngược lại. Doanh nghiệp có nhiều khối (Ban → Phòng → Tổ) nhưng cấu trúc
đó không tồn tại trong dữ liệu, nên không vẽ được và cũng không tra được ai
thuộc khối nào.

**2. Không chuyển được đơn sang phòng khác.** `quotes.service.ts` có bốn thao
tác trên `order_departments`:

| Thao tác | Quyền | Làm gì |
|---|---|---|
| `claim` | manager, staff | nhận đơn về mình, trong phòng mình |
| `assign` | manager, admin | gán cho người khác — `assertOwnDepartment`, **chỉ trong phòng mình** |
| `pass` | manager, staff | từ chối; dòng phòng đó đóng lại vĩnh viễn |
| `addDepartment` | **admin** | kéo thêm một phòng vào đơn |

Không có đường nào để trưởng phòng đẩy đơn sang phòng khác. `pass` không phải
chuyển — khi mọi phòng đều `passed`, `settleCheck` bắn `ALL_PASSED` và đơn
rơi vào ngõ cụt. Cách làm hiện tại trên thực tế là: phòng A `pass`, rồi nhắn
admin dùng `addDepartment` thêm phòng B. Hai bước, người ngoài cuộc phải can
thiệp, và giữa hai bước sale nhận một thông báo `ALL_PASSED` sai.

## Quyết định thiết kế đã chốt

**Phòng đã chuyển đi dùng lại state `passed`, không thêm state mới.** Ngữ
nghĩa "đã chuyển" nằm ở `ActivityLog` (`action: 'transfer'`, detail có phòng
đích và lý do). Lý do: thêm một `DeptState` buộc phải rà lại mọi nơi liệt kê
state — `settleCheck`, `selection.service`, `money.visibility`, nhãn FE — tức
là mở lại vùng đã QA để đổi lấy một phân biệt mà ActivityLog đã ghi đủ. Nếu
sau này báo cáo cần tách "tự bỏ qua" khỏi "đã chuyển đi", đó là việc riêng.

**Sơ đồ tổ chức cho mọi vai trò đã đăng nhập đọc.** Nó không nhạy cảm, và
chính nó là thứ giúp người dùng biết nên chuyển đơn cho phòng nào. Không trả
email/điện thoại — chỉ tên, vai trò, phòng.

**Chuyển đơn KHÔNG mang theo báo giá cũ.** Phòng đích báo giá lại từ đầu.
Chép `amount`/`scopeNote`/`validUntil` sang phòng khác là gán cho họ một con
số họ không tính ra.

## Phần 1 — Cây phòng ban

### Dữ liệu

Thêm vào `Department` một self-relation:

    parentId Int?         @map("parent_id")
    parent   Department?  @relation("DeptTree", fields: [parentId], references: [id])
    children Department[] @relation("DeptTree")

Kèm migration. Cột cho phép null: phòng không có cha là một gốc, và mọi phòng
hiện có đều thành gốc sau migration — trạng thái hôm nay được bảo toàn nguyên
vẹn.

### Ràng buộc

Postgres không tự lo được, nên kiểm ở service trước khi lưu:

1. `parentId !== id` — không tự làm cha chính mình.
2. Không chu trình: đi ngược chuỗi cha từ `parentId` lên; gặp lại `id` thì
   `400`. Chuỗi hữu hạn vì mỗi phòng có tối đa một cha.
3. Không cho vô hiệu hoá (`isActive: false`) phòng còn con đang hoạt động —
   trả `400` nêu tên các phòng con. Không tự động kéo con lên cha: im lặng
   sắp xếp lại sơ đồ tổ chức của người khác là hành vi tệ.

Tách thành `department-tree.helper.ts` — hàm thuần, không đụng Prisma:
`detectCycle(id, parentId, edges)` và `buildTree(rows)`. Kiểm thử được độc
lập, và service chỉ còn việc nạp dữ liệu.

### API

`parentId` thêm vào `UpdateDepartmentDto` và `CreateDepartmentDto`. Dùng lại
`PATCH /departments/:id` và `POST /departments` đã có (`admin` only) — không
đẻ endpoint ghi mới.

`GET /departments/tree` — đọc, mở cho mọi vai trò đã đăng nhập. Trả mảng các
gốc, mỗi nút:

    { id, name, managerId, managerName, isActive,
      members: [{ id, fullName, roles }],
      children: [ ...cùng dạng ] }

Một truy vấn lấy toàn bộ phòng + thành viên, dựng cây trong bộ nhớ. Số phòng
tính bằng chục, không cần đệ quy SQL.

### Giao diện

Trang mới `/org-chart`, thêm vào menu chính. Cây thụt lề dựng đệ quy bằng MUI
(`List` lồng + `Collapse`), không dùng thư viện vẽ sơ đồ: nhẹ hơn, in được,
và chịu được tên phòng dài. Mỗi nút hiện tên phòng, trưởng phòng, số thành
viên; bung ra thấy danh sách người kèm nhãn vai trò (dùng lại
`ROLE_LABEL_KEY` trong `constants/roles.ts`). Phòng `isActive: false` hiện mờ
kèm nhãn.

Sửa cấu trúc cây làm ở form phòng ban sẵn có (thêm ô chọn "Thuộc khối"), giới
hạn danh sách chọn để không tự chọn mình hoặc con cháu mình. **Không kéo-thả.**

## Phần 2 — Chuyển đơn nội bộ

### API

`POST orders/:id/departments/:deptId/transfer`
Body: `{ toDepartmentId: number, reason: string }` — `reason` bắt buộc,
không rỗng.
Quyền: `MANAGER` (phòng mình) + `ADMIN`.

### Trình tự — thứ tự này là bắt buộc

Trong một `$transaction`:

1. `assertOrderVisible(orderId, user)` → `assertDeptWorkable(order.status)` →
   `assertOwnDepartment(user, deptId)`. Ba lớp giống hệt `pass`.
2. Dòng nguồn ở `won` hoặc `lost` → `400`. Cùng luật với `pass`, để chỉ có
   một quy tắc phải nhớ. Phòng đã `quoted` vẫn chuyển được — báo giá cũ nằm
   lại trong `quote_history`.
3. Phòng đích: tồn tại, `isActive`, khác phòng nguồn. Đã có dòng cho đơn này
   → `409` "Phòng đó đã tham gia đơn này rồi".
4. Dòng nguồn → `state: passed`, `passReason: reason`.
5. Tạo dòng đích: `state: pending`, `isManual: true`, `distributedAt: now`.
6. Đẩy trạng thái đơn đúng như `addDepartment` đang làm: `NEW → DISTRIBUTED`,
   `AWAITING_SELECTION → QUOTING`, qua `assertTransition`.
7. `activity.log(action: 'transfer', detail: { fromDepartmentId,
   toDepartmentId, reason })`.
8. `settleCheck(tx, orderId)` — **sau bước 5, không bao giờ trước.**

Bước 8 là chỗ dễ sai nhất. Nếu `settleCheck` chạy khi dòng nguồn đã `passed`
mà dòng đích chưa tồn tại, đơn thoáng qua trạng thái "mọi phòng đã trả lời"
và sale nhận thông báo `ALL_PASSED` cho một đơn vừa được chuyển đi tiếp. Có
một test riêng khoá hành vi này.

Ngoài transaction: `notify.push` tới `notify.deptRecipients(null, orderId,
toDepartmentId)`, `NotifType.NEW_ORDER`, tiêu đề
`Đơn <code> được chuyển tới phòng bạn` — đúng câu `addDepartment` đang dùng,
nên người nhận không phải học thêm một dạng thông báo mới.

### Giao diện

Nút "Chuyển phòng" trong `QueueRow.tsx`, cạnh Nhận/Gán/Bỏ qua. Hiện khi
người dùng là manager **và** `isDeptWorkable(item.orderStatus)` — tôn trọng
đúng luật đã sửa ở nhánh `fix/scope-orders-queue-cancelled`: đơn đã huỷ không
mời người dùng làm gì cả.

Hộp thoại: ô chọn phòng đích + ô lý do bắt buộc. Danh sách phòng đích lấy từ
`GET /departments/tree` (làm phẳng), bỏ phòng mình và các phòng đã tham gia
đơn — lọc bằng một hàm thuần tách riêng để kiểm thử được.

## Kiểm thử

Viết test đỏ trước, theo đúng lối các spec hiện có.

**`department-tree.helper.spec.ts`** — dựng cây nhiều tầng đúng thứ tự; phát
hiện chu trình A→B→A và chuỗi dài hơn; chặn tự làm cha; phòng mồ côi
(`parentId` trỏ tới phòng đã xoá) vẫn hiện như một gốc thay vì biến mất.

**`quotes.service` — transfer:**
- chuyển thành công: dòng nguồn `passed` + `passReason`, dòng đích `pending`
  và `isManual: true`;
- phòng đích đã tham gia → `409`;
- dòng nguồn `won`/`lost` → `400`;
- đơn đã huỷ → `409` từ `assertDeptWorkable`;
- không phải phòng mình → `403`;
- **chuyển phòng cuối cùng KHÔNG bắn `ALL_PASSED`** — test chốt của bước 8.

**FE: không có test tự động.** Repo `bee-transportation-admin` chưa có bộ chạy
test nào (không vitest, không jest, không một file `.test.tsx`) — tính năng
`@mention` vừa rồi cũng ship theo lối đó. Dựng cả hạ tầng test cho FE là một
việc riêng, không gộp vào đợt này. Bù lại, logic lọc phòng đích tách thành hàm
thuần `transferTargets.ts` để khi có bộ test thì kiểm ngay được, và phần còn
lại kiểm bằng tay: đơn đã huỷ không hiện nút, phòng đã tham gia không nằm
trong danh sách chọn.

## Cố ý không làm

- Kéo-thả sắp xếp sơ đồ tổ chức.
- Mang báo giá cũ theo khi chuyển phòng.
- Trạng thái `transferred` riêng (xem "Quyết định thiết kế đã chốt").
- Chuyển đơn cho cá nhân ở phòng khác — `assign` chỉ trong phòng mình, và
  phòng đích tự phân công sau khi nhận.
