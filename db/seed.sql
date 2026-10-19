-- BeeOps - Du lieu danh muc khoi tao: 10 dich vu + bo moc tien do (muc 7).
-- Ten dich vu va ten moc HIEN THI THANG RA GIAO DIEN -> phai co dau tieng Viet.
-- Chay sau schema.sql:  psql -d beeops -f seed.sql

INSERT INTO services (code, name, sort_order, milestones) VALUES

('CON', 'Tư vấn giải pháp vận chuyển', 1, ARRAY[
  'Đang phân tích', 'Đã gửi phương án', 'Điều chỉnh theo phản hồi (nếu có)', 'Nghiệm thu']),

('CUS', 'Thủ tục hải quan (nhập/xuất khẩu)', 2, ARRAY[
  'Đã nhận đủ chứng từ', 'Đã truyền tờ khai', 'Phân luồng / kiểm hóa',
  'Đã thông quan', 'Trả chứng từ & nghiệm thu']),

('DOM', 'Vận chuyển nội địa', 3, ARRAY[
  'Đã điều xe', 'Đã lấy hàng', 'Đang vận chuyển', 'Đã giao', 'Nghiệm thu (POD)']),

('PRJ', 'FCL/LCL, hàng dự án, siêu trường siêu trọng', 4, ARRAY[
  'Khảo sát & phương án kỹ thuật', 'Đã có giấy phép lưu thông',
  'Đã điều phương tiện', 'Đã xếp hàng', 'Đang vận chuyển (hộ tống)',
  'Đã hạ hàng tại điểm đích', 'Nghiệm thu']),

('LIF', 'Xếp dỡ, di dời, nâng hạ thiết bị', 5, ARRAY[
  'Khảo sát hiện trường', 'Huy động thiết bị & nhân lực', 'Đang thi công',
  'Hoàn tất hạ đặt / lắp đặt', 'Nghiệm thu an toàn']),

('MMT', 'Vận tải đa phương thức (Hàng không / Bộ / Biển)', 6, ARRAY[
  'Đã lấy hàng', 'Đang chặng 1', 'Chuyển tải (cảng / ga / ICD)',
  'Đang chặng 2', 'Đã giao', 'Nghiệm thu']),

('PKG', 'Đóng/rút container, đóng gói, chằng buộc', 7, ARRAY[
  'Đã nhận hàng tại kho', 'Đang đóng gói / chằng buộc', 'Hoàn tất đóng gói',
  'Đã đóng container / bàn giao', 'Nghiệm thu']),

('CBT', 'Vận chuyển quá cảnh & xuyên biên giới', 8, ARRAY[
  'Đã lấy hàng', 'Đến cửa khẩu', 'Thông quan xuất',
  'Thông quan nhập / bàn giao đối tác nước bạn', 'Đang giao nội địa nước bạn',
  'Đã giao', 'Nghiệm thu']),

('BRK', 'Môi giới hàng hải', 9, ARRAY[
  'Đã xác nhận booking', 'Hàng đã lên tàu', 'Tàu khởi hành',
  'Tàu đến cảng đích', 'Hoàn tất chứng từ & nghiệm thu']),

('RNT', 'Cho thuê thiết bị & phương tiện', 10, ARRAY[
  'Đã xác nhận thiết bị', 'Đã bàn giao (bắt đầu thuê)', 'Đang cho thuê',
  'Đã thu hồi thiết bị', 'Đối soát & nghiệm thu'])

ON CONFLICT (code) DO UPDATE
  SET name = excluded.name, milestones = excluded.milestones;

-- Ma OF1-TMS (migration 040 + 041), theo ban final "Danh sach dich vu
-- logistics" 02/10/2026.
--
-- 16 dich vu con. Cong hai ma cha o tren la du 18 ma tai muc 5 tai lieu OF1.
INSERT INTO service_children (service_id, name, tms_mode, sort_order)
SELECT s.id, v.name, v.tms_mode, v.sort_order
FROM (VALUES
  ('DOM', 'Nội địa nguyên container (FCL)',          'DOMESTIC_FCL',      1),
  ('DOM', 'Nội địa hàng lẻ (LCL)',                   'DOMESTIC_LCL',      2),

  ('MMT', 'Xuất khẩu nguyên container (FCL)',        'EXPORT_FCL',        1),
  ('MMT', 'Xuất khẩu FCL – Tái sử dụng container',   'EXPORT_FCL_RU',     2),
  ('MMT', 'Xuất khẩu hàng lẻ (LCL)',                 'EXPORT_LCL',        3),
  ('MMT', 'Xuất khẩu đường hàng không',              'EXPORT_AIR',        4),
  ('MMT', 'Xuất khẩu hàng rời / hàng dự án',         'EXPORT_BULK_CARGO', 5),
  ('MMT', 'Nhập khẩu nguyên container (FCL)',        'IMPORT_FCL',        6),
  ('MMT', 'Nhập khẩu FCL – Tái sử dụng container',   'IMPORT_FCL_RU',     7),
  ('MMT', 'Nhập khẩu hàng lẻ (LCL)',                 'IMPORT_LCL',        8),
  ('MMT', 'Nhập khẩu đường hàng không',              'IMPORT_AIR',        9),
  ('MMT', 'Nhập khẩu hàng rời / hàng dự án',         'IMPORT_BULK_CARGO', 10),

  ('CBT', 'Xuyên biên giới nguyên container',        'CBT_FCL',           1),
  ('CBT', 'Xuyên biên giới hàng lẻ',                 'CBT_LCL',           2),
  ('CBT', 'Chuyển cảng nguyên container',            'PORTTRANSFER_FCL',  3),
  ('CBT', 'Chuyển cảng hàng lẻ',                     'PORTTRANSFER_LCL',  4)
) AS v(ma_cha, name, tms_mode, sort_order)
JOIN services s ON s.code = v.ma_cha
ON CONFLICT (service_id, tms_mode) WHERE tms_mode IS NOT NULL
  DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order;

-- Dich vu mang chu FCL/LCL trong TEN nhan DU 12 ma FCL/LCL (047 -> 050). Hien
-- chi co PRJ "FCL/LCL, hang du an, sieu truong sieu trong". Bon ma AIR va
-- BULK_CARGO khong mang chu do nen khong vao.
INSERT INTO service_children (service_id, name, tms_mode, sort_order)
SELECT s.id, v.name, v.tms_mode, v.sort_order
FROM services s
CROSS JOIN (VALUES
  ('Xuất khẩu nguyên container (FCL)',      'EXPORT_FCL',        1),
  ('Xuất khẩu FCL – Tái sử dụng container', 'EXPORT_FCL_RU',     2),
  ('Xuất khẩu hàng lẻ (LCL)',               'EXPORT_LCL',        3),
  ('Nhập khẩu nguyên container (FCL)',      'IMPORT_FCL',        4),
  ('Nhập khẩu FCL – Tái sử dụng container', 'IMPORT_FCL_RU',     5),
  ('Nhập khẩu hàng lẻ (LCL)',               'IMPORT_LCL',        6),
  ('Nội địa nguyên container (FCL)',        'DOMESTIC_FCL',      7),
  ('Nội địa hàng lẻ (LCL)',                 'DOMESTIC_LCL',      8),
  ('Xuyên biên giới nguyên container',      'CBT_FCL',           9),
  ('Xuyên biên giới hàng lẻ',               'CBT_LCL',          10),
  ('Chuyển cảng nguyên container',          'PORTTRANSFER_FCL', 11),
  ('Chuyển cảng hàng lẻ',                   'PORTTRANSFER_LCL', 12)
) AS v(name, tms_mode, sort_order)
WHERE s.name ~* '\m(FCL|LCL)\M'
ON CONFLICT (service_id, tms_mode) WHERE tms_mode IS NOT NULL
  DO UPDATE SET sort_order = excluded.sort_order;

-- Hai dau cua tuyen, theo DICH VU CON (migration 054). Co o dich vu cha chi la
-- mac dinh cho dich vu khong chia nho; hang xuat va hang nhap nam cung mot dich
-- vu cha nhung nguoc dau nhau nen co o cha mot minh khong dien ta duoc.
UPDATE service_children SET has_domestic_origin = true, has_domestic_destination = false
 WHERE tms_mode LIKE 'EXPORT%' OR tms_mode LIKE 'CBT%';
UPDATE service_children SET has_domestic_origin = false, has_domestic_destination = true
 WHERE tms_mode LIKE 'IMPORT%';
UPDATE service_children SET has_domestic_origin = true, has_domestic_destination = true
 WHERE tms_mode LIKE 'DOMESTIC%' OR tms_mode LIKE 'PORTTRANSFER%';

-- CBT di ra ngoai nuoc nen KHONG co diem den trong nuoc: form an ca o tinh/thanh
-- lan o dia chi diem den, va kiem tra "con thieu thong tin" khong doi diem den.
--
-- Dong nay PHAI nam o day chu khong chi trong migration 021. Migration la lenh
-- UPDATE chay MOT LAN tren du lieu dang co; ban cai sach di theo chuoi
-- schema.sql -> seed.sql -> 003 thi khong bao gio chay qua no, va CBT quay ve
-- mac dinh true — tuc la loi "CBT van doi diem den" song lai. Day dung la cai
-- bay da xay ra mot lan voi tai khoan he thong public@bee.internal (nay da bo, 075).
UPDATE services SET has_domestic_destination = false WHERE code = 'CBT';

-- Tai khoan Admin dau tien (bat buoc doi mat khau lan dang nhap dau).
-- gen_salt('bf') mac dinh cost 6 — qua yeu cho tai khoan admin; tang len 12 cho
-- bang BCRYPT_ROUNDS ma tang ung dung dung khi bam mat khau moi.
-- ON CONFLICT co y KHONG dung lai password_hash: chay lai seed tren DB dang song
-- khong duoc dat lai mat khau admin ve gia tri in trong README.
INSERT INTO users (email, full_name, password_hash, roles, must_change_password)
VALUES ('admin@beetransportation.vn', 'Quản trị hệ thống',
        crypt('BeeOps@2026', gen_salt('bf', 12)), ARRAY['admin'], true)
ON CONFLICT (email) DO UPDATE SET full_name = excluded.full_name;

-- Don khach tu gui tu form cong khai KHONG dung ten ai (created_by NULL) —
-- khong con tai khoan he thong public@bee.internal (migration 075).

-- Danh sach ly do tu choi (co dinh o tang ung dung, khong can bang danh muc):
--   Gia cao | Thoi gian khong dap ung | Khach chon doi thu | Khach huy nhu cau | Khac

-- Bo TRUONG NHAP RIENG cua tung dich vu (bang service_fields) va o "Thong so hang
-- hoa" moi dich vu dung (services.cargo_fields) nam o mot noi duy nhat:
--   db/migrations/003-service-fields-seed.sql
-- Cai dat moi chay: schema.sql -> seed.sql -> 003-service-fields-seed.sql


-- ---------------------------------------------------------------------------
-- MA TRAN PHAN QUYEN MAC DINH (migration 032-036)
--
-- PHAI nam o day chu khong chi trong migration. schema.sql + seed.sql la thu
-- dung len mot he thong moi — CI nap dung bo nay roi chay smoke test, va mot
-- cai dat moi cung di duong do. Thieu bang nay thi PageAccessGuard coi "khong
-- co dong" la "khong co quyen", nen MOI endpoint co @Trang tra 403: dang nhap
-- duoc nhung khong vao duoc trang nao. Da do that — ca ba bo smoke test chet
-- ngay o loi goi dau tien.
--
-- Nguon chuan la MAC_DINH trong src/common/permissions/pages.ts; khoi duoi day
-- sinh ra tu chinh no. Them trang moi thi them ca o hai noi, va bai
-- mac-dinh.spec.ts se bao neu thieu mot o.
--
-- ON CONFLICT DO NOTHING: nap lai tren co so du lieu da chinh tay thi KHONG
-- dap len cong suc chinh do.
-- ---------------------------------------------------------------------------

-- 26 trang x 5 vai tro = 130 dong
INSERT INTO role_page_permissions (page_key, role, level) VALUES
  ('dashboard', 'admin', 'full'),
  ('dashboard', 'leader', 'view'),
  ('dashboard', 'manager', 'full'),
  ('dashboard', 'sale', 'full'),
  ('dashboard', 'staff', 'full'),
  ('myTasks', 'admin', 'full'),
  ('myTasks', 'leader', 'view'),
  ('myTasks', 'manager', 'full'),
  ('myTasks', 'sale', 'full'),
  ('myTasks', 'staff', 'full'),
  ('notifications', 'admin', 'full'),
  ('notifications', 'leader', 'full'),
  ('notifications', 'manager', 'full'),
  ('notifications', 'sale', 'full'),
  ('notifications', 'staff', 'full'),
  ('orgChart', 'admin', 'full'),
  ('orgChart', 'leader', 'view'),
  ('orgChart', 'manager', 'view'),
  ('orgChart', 'sale', 'view'),
  ('orgChart', 'staff', 'view'),
  ('createOrder', 'admin', 'full'),
  ('createOrder', 'leader', 'none'),
  ('createOrder', 'manager', 'none'),
  ('createOrder', 'sale', 'full'),
  ('createOrder', 'staff', 'none'),
  ('orders', 'admin', 'full'),
  ('orders', 'leader', 'view'),
  ('orders', 'manager', 'full'),
  ('orders', 'sale', 'full'),
  ('orders', 'staff', 'full'),
  ('orderDetail', 'admin', 'full'),
  ('orderDetail', 'leader', 'view'),
  ('orderDetail', 'manager', 'full'),
  ('orderDetail', 'sale', 'full'),
  ('orderDetail', 'staff', 'full'),
  ('orderSignature', 'admin', 'full'),
  ('orderSignature', 'leader', 'none'),
  ('orderSignature', 'manager', 'full'),
  ('orderSignature', 'sale', 'full'),
  ('orderSignature', 'staff', 'none'),
  ('ordersKanban', 'admin', 'full'),
  ('ordersKanban', 'leader', 'view'),
  ('ordersKanban', 'manager', 'full'),
  ('ordersKanban', 'sale', 'full'),
  ('ordersKanban', 'staff', 'full'),
  ('queue', 'admin', 'full'),
  ('queue', 'leader', 'none'),
  ('queue', 'manager', 'full'),
  ('queue', 'sale', 'none'),
  ('queue', 'staff', 'full'),
  ('unroutedOrders', 'admin', 'full'),
  ('unroutedOrders', 'leader', 'view'),
  ('unroutedOrders', 'manager', 'none'),
  ('unroutedOrders', 'sale', 'none'),
  ('unroutedOrders', 'staff', 'none'),
  ('revenueReport', 'admin', 'full'),
  ('revenueReport', 'leader', 'view'),
  ('revenueReport', 'manager', 'view'),
  ('revenueReport', 'sale', 'none'),
  ('revenueReport', 'staff', 'none'),
  ('operationsReport', 'admin', 'full'),
  ('operationsReport', 'leader', 'view'),
  ('operationsReport', 'manager', 'view'),
  ('operationsReport', 'sale', 'none'),
  ('operationsReport', 'staff', 'none'),
  ('priceList', 'admin', 'full'),
  ('priceList', 'leader', 'view'),
  -- 'none' (057 roi 060): bang gia niem yet la toan bo co cau chi phi cua Bee
  -- tren moi tuyen. Chi Quan tri he thong va Giam doc duyet duoc ca bang.
  -- Truong phong, Sale va Pricing chi tra duoc GIA CUA MOT TUYEN qua
  -- 'priceLookup', va chi khi da du ca cap diem di/diem den.
  ('priceList', 'manager', 'none'),
  ('priceList', 'sale', 'none'),
  ('priceList', 'staff', 'none'),
  -- Tra gia MOT TUYEN. Khoa rieng vi ha priceList xuong none thi o goi y gia
  -- trong man bao gia cung 403 — tuc la go mot tinh nang dang dung.
  ('priceLookup', 'admin', 'view'),
  ('priceLookup', 'leader', 'view'),
  ('priceLookup', 'manager', 'view'),
  ('priceLookup', 'sale', 'view'),
  ('priceLookup', 'staff', 'view'),
  ('systemSettings', 'admin', 'full'),
  ('systemSettings', 'leader', 'none'),
  ('systemSettings', 'manager', 'none'),
  ('systemSettings', 'sale', 'none'),
  ('systemSettings', 'staff', 'none'),
  ('priceLocations', 'admin', 'full'),
  ('priceLocations', 'leader', 'view'),
  -- 'none' (060, thay cho 056): danh muc dia diem di LIEN voi bang gia — no la
  -- hai dau cua moi tuyen, nen ai doc duoc het danh muc thi doc duoc ca hinh
  -- dang mang luoi cua Bee. Cung mot cua nhu priceList: Quan tri va Giam doc.
  --
  -- Sale van CHON duoc dia chi luc nhap don: GET /locations da chuyen sang
  -- 'priceLookup' (060). Thu mat di la nut "Them dia chi moi" ngay trong o
  -- chon — tu nay dia chi moi do Quan tri hoac Giam doc them.
  ('priceLocations', 'manager', 'none'),
  ('priceLocations', 'sale', 'none'),
  ('priceLocations', 'staff', 'none'),
  ('news', 'admin', 'full'),
  ('news', 'leader', 'view'),
  ('news', 'manager', 'none'),
  ('news', 'sale', 'none'),
  ('news', 'staff', 'none'),
  ('cms', 'admin', 'full'),
  ('cms', 'leader', 'view'),
  ('cms', 'manager', 'none'),
  ('cms', 'sale', 'none'),
  ('cms', 'staff', 'none'),
  ('saleRepresentatives', 'admin', 'full'),
  ('saleRepresentatives', 'leader', 'view'),
  ('saleRepresentatives', 'manager', 'none'),
  ('saleRepresentatives', 'sale', 'none'),
  ('saleRepresentatives', 'staff', 'none'),
  ('customers', 'admin', 'full'),
  ('customers', 'leader', 'view'),
  ('customers', 'manager', 'full'),
  ('customers', 'sale', 'edit'),
  ('customers', 'staff', 'view'),
  ('customerDetail', 'admin', 'full'),
  ('customerDetail', 'leader', 'view'),
  ('customerDetail', 'manager', 'full'),
  ('customerDetail', 'sale', 'edit'),
  ('customerDetail', 'staff', 'view'),
  ('departments', 'admin', 'full'),
  ('departments', 'leader', 'view'),
  ('departments', 'manager', 'view'),
  ('departments', 'sale', 'view'),
  ('departments', 'staff', 'view'),
  ('users', 'admin', 'full'),
  ('users', 'leader', 'view'),
  ('users', 'manager', 'full'),
  ('users', 'sale', 'none'),
  ('users', 'staff', 'none'),
  ('services', 'admin', 'full'),
  ('services', 'leader', 'view'),
  ('services', 'manager', 'none'),
  ('services', 'sale', 'none'),
  ('services', 'staff', 'none'),
  ('routingMatrix', 'admin', 'full'),
  ('routingMatrix', 'leader', 'view'),
  ('routingMatrix', 'manager', 'none'),
  ('routingMatrix', 'sale', 'none'),
  ('routingMatrix', 'staff', 'none'),
  ('activityLog', 'admin', 'full'),
  ('activityLog', 'leader', 'view'),
  ('activityLog', 'manager', 'none'),
  ('activityLog', 'sale', 'none'),
  ('activityLog', 'staff', 'none'),
  ('permissions', 'admin', 'full'),
  ('permissions', 'leader', 'view'),
  ('permissions', 'manager', 'none'),
  ('permissions', 'sale', 'none'),
  ('permissions', 'staff', 'none'),

  -- Vai tro DOI TAC (migration 042): mo dung hai trang, con lai dong.
  ('dashboard', 'partner', 'none'),
  ('myTasks', 'partner', 'none'),
  ('notifications', 'partner', 'none'),
  ('orgChart', 'partner', 'none'),
  ('createOrder', 'partner', 'none'),
  ('orders', 'partner', 'view'),
  ('orderDetail', 'partner', 'view'),
  ('orderSignature', 'partner', 'none'),
  ('ordersKanban', 'partner', 'none'),
  ('queue', 'partner', 'none'),
  ('unroutedOrders', 'partner', 'none'),
  ('revenueReport', 'partner', 'none'),
  ('operationsReport', 'partner', 'none'),
  ('priceList', 'partner', 'view'),
  ('priceLookup', 'partner', 'none'),
  ('systemSettings', 'partner', 'none'),
  ('priceLocations', 'partner', 'none'),
  ('news', 'partner', 'none'),
  ('cms', 'partner', 'none'),
  ('saleRepresentatives', 'partner', 'none'),
  ('customers', 'partner', 'none'),
  ('customerDetail', 'partner', 'none'),
  ('departments', 'partner', 'none'),
  ('users', 'partner', 'none'),
  ('services', 'partner', 'none'),
  ('routingMatrix', 'partner', 'none'),
  ('activityLog', 'partner', 'none'),
  ('permissions', 'partner', 'none')
ON CONFLICT (page_key, role) DO NOTHING;

-- Dieu van (079): chi xem — giong MAC_DINH trong permissions/pages.ts.
INSERT INTO role_page_permissions (role, page_key, level)
SELECT 'dispatcher', k.page_key,
       CASE
         WHEN k.page_key = 'notifications' THEN 'full'
         WHEN k.page_key IN ('orders','orderDetail','ordersKanban','customers','customerDetail',
                             'orgChart','priceLookup','departments') THEN 'view'
         ELSE 'none'
       END
FROM (SELECT DISTINCT page_key FROM role_page_permissions) AS k
ON CONFLICT (role, page_key) DO NOTHING;


-- ---------------------------------------------------------------------------
-- CAU HINH DUNG CHUNG (migration 037, 039)
--
-- Dieu khoan van chuyen khach ky vao, va phap nhan Ben A in tren hop dong.
-- Thieu dong dieu khoan thi bam "Gui cho khach ky" bao loi cau hinh.
--
-- Ma so thue va nguoi dai dien de TRONG co y: dat bua mot ma so thue len hop
-- dong la lam gia giay to. O trong in ra thanh duong cham.
-- ---------------------------------------------------------------------------

INSERT INTO app_settings (key, value) VALUES
  ('dieu_khoan_ky',    '[CHUA SOAN] Dieu khoan van chuyen chua duoc soan. Vao Quan tri de soan truoc khi gui khach ky.'),
  ('cong_ty_ten',       'CONG TY CO PHAN VAN CHUYEN CON ONG (BEE TRANSPORTATION CORPORATION)'),
  ('cong_ty_dia_chi',   'TTC Tower, 253 Hoang Van Thu, Phuong Tan Son Hoa, Thanh pho Ho Chi Minh'),
  ('cong_ty_mst',       ''),
  ('cong_ty_dien_thoai','0886 440 449'),
  ('cong_ty_email',     'info@beetransportation.vn'),
  ('cong_ty_dai_dien',  ''),
  ('cong_ty_chuc_vu',   '')
ON CONFLICT (key) DO NOTHING;

-- Mot dieu khoan khoi tao (migration 053). Day la CHO TRONG CO DANH DAU, khong
-- phai dieu khoan that: dat san mot doan nghe nhu dieu khoan la moi nguoi dem
-- no di ky that. Khong co dong nao thi luong ky nem loi va khong gui duoc.
INSERT INTO terms_clauses (title, body, sort_order)
SELECT 'Điều khoản vận chuyển',
       E'[CHUA SOAN] Day la cho dat dieu khoan van chuyen ma khach hang ky xac nhan.

Noi dung that phai do nguoi phu trach nghiep vu soan, trong CMS > Dieu khoan ky.',
       1
 WHERE NOT EXISTS (SELECT 1 FROM terms_clauses);

-- Bon o rieng cua CBT (Nuoc den, Cua khau...) cung can cho dich vu con mang ma
-- CBT_* o dich vu KHAC, vi du PRJ (migration 054).
--
-- DE O CUOI FILE va van CHUA chac chay duoc: o cua CBT nap o
-- db/migrations/003-service-fields-seed.sql, file do chay SAU seed.sql. Cau nay
-- vi the khong chep duoc gi o lan nap dau. Chay lai seed.sql sau khi 003 da nap
-- thi no chep - va `NOT EXISTS` o duoi khien chay bao nhieu lan cung an toan.
INSERT INTO service_fields
  (service_id, service_child_id, field_key, label, field_type, unit, options,
   is_required, sort_order, help_text, is_active)
SELECT con.service_id, con.id, f.field_key, f.label, f.field_type, f.unit, f.options,
       f.is_required, f.sort_order, f.help_text, f.is_active
  FROM service_fields f
  JOIN services s ON s.id = f.service_id AND s.code = 'CBT'
  CROSS JOIN LATERAL (
    SELECT c.id, c.service_id FROM service_children c
      JOIN services p ON p.id = c.service_id
     WHERE c.tms_mode LIKE 'CBT%' AND p.code <> 'CBT'
  ) con
 WHERE f.service_child_id IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM service_fields x
      WHERE x.service_child_id = con.id AND x.field_key = f.field_key);


-- ---------------------------------------------------------------------
-- Khu vuc bang gia (061). Danh muc, khong phai du lieu mau: man "Khu vuc va
-- tuyen" khong them duoc tuyen nao neu bang nay rong, va migration 061 chia
-- 34 tinh vao dung ba ten duoi day.
-- ---------------------------------------------------------------------
INSERT INTO price_regions (name, sort_order) VALUES
  ('Miền Bắc', 1), ('Miền Trung', 2), ('Miền Nam', 3)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Don vi tinh gia (055). Danh muc, khong phai du lieu mau: man "Tuyen & gia"
-- khong co o nao de nhap gia neu bang nay rong.
-- ---------------------------------------------------------------------
INSERT INTO price_units (code, label, kind, sort_order) VALUES
  -- Container: DC -> FCL. Bac tai lay nguyen van tu bang gia.
  ('CONT20DC_LE17T', e'20\'DC ≤ 17 tấn',  'FCL', 10),
  ('CONT20DC_LE18T', e'20\'DC ≤ 18 tấn',  'FCL', 11),
  ('CONT20DC_LE22T', e'20\'DC ≤ 22 tấn',  'FCL', 12),
  ('CONT20DC_GT22T', e'20\'DC > 22 tấn',       'FCL', 13),
  ('CONT40DC_LE16T', e'40\'DC ≤ 16 tấn',  'FCL', 20),
  ('CONT40DC_LE17T', e'40\'DC ≤ 17 tấn',  'FCL', 21),
  ('CONT40DC_LE22T', e'40\'DC ≤ 22 tấn',  'FCL', 22),
  ('CONT40DC_GT22T', e'40\'DC > 22 tấn',       'FCL', 23),

  -- Xe tai theo chuyen: tinh theo tan -> LCL.
  ('TRUCK_1T4',  'Xe 1.4T',  'LCL', 30),
  ('TRUCK_2T4',  'Xe 2.4T',  'LCL', 31),
  ('TRUCK_3T5',  'Xe 3.5T',  'LCL', 32),
  ('TRUCK_5T',   'Xe 5T',    'LCL', 33),
  ('TRUCK_7T',   'Xe 7T',    'LCL', 34),
  ('TRUCK_10T',  'Xe 10T',   'LCL', 35),
  -- Khoi TRUNG CHUYEN cua bang duong dai dung bac tai khac (058): '2.4T' va
  -- '2-3T' la hai bac khac nhau trong chinh bang gia cua Bee.
  ('TRUCK_2_3T', 'Xe 2–3T',  'LCL', 36),
  ('TRUCK_MAX',  'Xe MAX (thùng kín)', 'LCL', 37),

  -- Duong dai: tinh theo khoi/trong luong/pallet.
  ('CBM', e'Theo khối (CBM)', 'LCL', 40),
  ('TON', e'Theo tấn',        'LCL', 41),
  ('PALLET_STACK_LT500',
     e'Pallet tiêu chuẩn — chồng đôi, <500kg', 'LCL', 50),
  ('PALLET_STACK_600_700',
     e'Pallet tiêu chuẩn — chồng đôi, 600–700kg', 'LCL', 51),
  ('PALLET_NOSTACK',
     e'Pallet tiêu chuẩn — không chồng được', 'LCL', 52),
  ('PALLET_H19',
     e'Pallet cao trên 1m9, >800kg', 'LCL', 53),
  ('PALLET_OVERSIZE',
     e'Pallet vượt khổ / kiện dài', 'LCL', 54),

  -- Nguyen chuyen duong dai.
  ('FULL_5T_BAT',  e'Xe 5T nguyên chuyến — thùng bạt', 'LCL', 60),
  ('FULL_5T_KIN',  e'Xe 5T nguyên chuyến — thùng kín', 'LCL', 61),
  ('FULL_8_10T',   e'Xe 8T/10T nguyên chuyến',                      'LCL', 62),
  ('FULL_15T',     e'Xe 15T nguyên chuyến',                         'LCL', 63),

  -- Dong gia CU, truoc 055: khong biet la loai xe nao. Giu lai de khong mat
  -- du lieu va de man hinh noi that rang no khong xac dinh.
  ('LEGACY', e'Giá chung (dữ liệu trước 07/10/2026)', 'LCL', 99)
ON CONFLICT (code) DO NOTHING;
