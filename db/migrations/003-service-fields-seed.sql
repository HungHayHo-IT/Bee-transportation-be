-- 003 — Bộ trường mặc định cho 10 dịch vụ + ô hàng hóa mỗi dịch vụ dùng
-- Chạy SAU 002:
--   docker compose -f docker-compose.vm.yml exec -T db \
--     psql -U beeops -d beeops -v ON_ERROR_STOP=1 -f - < db/migrations/003-service-fields-seed.sql
--
-- Đây là ĐIỂM XUẤT PHÁT, không phải quy định cứng: Admin sửa/thêm/bớt trong
-- "Dịch vụ & mốc tiến độ". Chạy lại chỉ thêm trường còn thiếu, KHÔNG ghi đè nhãn
-- hay lựa chọn mà Admin đã chỉnh (ON CONFLICT DO NOTHING).

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Ô "Thông số hàng hóa" chung mà mỗi dịch vụ thực sự dùng
-- ---------------------------------------------------------------------
-- CON (tư vấn) và RNT (cho thuê thiết bị) không có lô hàng nào để đo, nên khối
-- này biến mất hẳn khỏi form của hai dịch vụ đó.
UPDATE services SET cargo_fields = v.fields FROM (VALUES
  ('DOM', ARRAY['weightKg','volumeCbm','packageCount','containerType']),
  ('CBT', ARRAY['weightKg','volumeCbm','packageCount','containerType']),
  ('CUS', ARRAY['weightKg','packageCount','containerType']),
  ('PRJ', ARRAY['weightKg','volumeCbm','packageCount','containerType','dimLM','dimWM','dimHM']),
  ('LIF', ARRAY['weightKg','dimLM','dimWM','dimHM']),
  ('MMT', ARRAY['weightKg','volumeCbm','packageCount','containerType']),
  ('PKG', ARRAY['weightKg','volumeCbm','packageCount','containerType']),
  ('BRK', ARRAY['weightKg','volumeCbm','containerType']),
  ('RNT', ARRAY[]::text[]),
  ('CON', ARRAY[]::text[])
) AS v(code, fields)
WHERE services.code = v.code;

-- ---------------------------------------------------------------------
-- 2. Trường riêng của từng dịch vụ
-- ---------------------------------------------------------------------
INSERT INTO service_fields
  (service_id, field_key, label, field_type, unit, options, is_required, sort_order)
SELECT s.id, v.field_key, v.label, v.field_type, v.unit, v.options, v.is_required, v.sort_order
FROM (VALUES
  -- DOM — Vận chuyển nội địa
  -- 'text' chu khong phai 'select': dieu phoi nhap dung loai xe thuc te
  -- (vd 'Xe tai 3,5 tan', 'Dau keo + romooc san 40ft'), danh muc dong cung
  -- lam mat thong tin. Doi o day chu khong chi UPDATE tay tren DB dang chay:
  -- ban cai moi doc file nay, sua mot noi thi noi kia quay ve 'select'.
  ('DOM','vehicle_type','Loại phương tiện','text',NULL,ARRAY[]::text[],false,10),
  ('DOM','loading_method','Phương án xếp dỡ','text',NULL,ARRAY[]::text[],false,20),
  ('DOM','is_round_trip','Hàng hai chiều','boolean',NULL,ARRAY[]::text[],false,30),

  -- CBT — Quá cảnh & xuyên biên giới
  ('CBT','destination_country','Nước đến','select',NULL,ARRAY['Trung Quốc','Lào','Campuchia','Thái Lan','Myanmar'],false,10),
  ('CBT','border_gate','Cửa khẩu','select',NULL,ARRAY['Hữu Nghị','Tân Thanh','Móng Cái','Lào Cai','Na Mèo','Cầu Treo','Lao Bảo','Bờ Y','Mộc Bài','Xa Mát'],false,20),
  ('CBT','transit_doc','Chứng từ quá cảnh','select',NULL,ARRAY['Tờ khai quá cảnh','Vận đơn TIR/ATA','Chưa có'],false,30),
  ('CBT','incoterm','Điều kiện giao hàng','select',NULL,ARRAY['EXW','FCA','FOB','CFR','CIF','DAP','DDP'],false,40),

  -- CUS — Thủ tục hải quan
  ('CUS','declaration_type','Loại hình tờ khai','select',NULL,ARRAY['Nhập kinh doanh','Xuất kinh doanh','Tạm nhập tái xuất','Tạm xuất tái nhập','Gia công','Sản xuất xuất khẩu','Phi mậu dịch'],true,10),
  ('CUS','hs_code','Mã HS','text',NULL,ARRAY[]::text[],false,20),
  ('CUS','declaration_count','Số tờ khai','number','tờ',ARRAY[]::text[],false,30),
  ('CUS','customs_branch','Chi cục hải quan','text',NULL,ARRAY[]::text[],false,40),
  ('CUS','special_permit','Giấy phép chuyên ngành','text',NULL,ARRAY[]::text[],false,50),
  ('CUS','docs_ready','Đã đủ bộ chứng từ','boolean',NULL,ARRAY[]::text[],false,60),

  -- PRJ — FCL/LCL, hàng dự án, siêu trường siêu trọng
  ('PRJ','cargo_mode','Hình thức hàng','select',NULL,ARRAY['FCL','LCL','Hàng rời','Siêu trường siêu trọng'],false,10),
  ('PRJ','heaviest_piece_ton','Kiện nặng nhất','number','tấn',ARRAY[]::text[],false,20),
  ('PRJ','needs_permit','Cần giấy phép lưu thông','boolean',NULL,ARRAY[]::text[],false,30),
  ('PRJ','needs_escort','Cần xe hộ tống','boolean',NULL,ARRAY[]::text[],false,40),
  ('PRJ','needs_survey','Cần khảo sát tuyến','boolean',NULL,ARRAY[]::text[],false,50),

  -- LIF — Xếp dỡ, di dời, nâng hạ thiết bị
  ('LIF','equipment_needed','Thiết bị cần huy động','text',NULL,ARRAY[]::text[],false,10),
  ('LIF','lift_capacity_ton','Tải trọng nâng','number','tấn',ARRAY[]::text[],false,20),
  ('LIF','lift_height_m','Độ cao nâng','number','m',ARRAY[]::text[],false,30),
  ('LIF','site_condition','Điều kiện mặt bằng','text',NULL,ARRAY[]::text[],false,40),
  ('LIF','work_shift','Ca thi công','text',NULL,ARRAY[]::text[],false,50),

  -- MMT — Vận chuyển đa phương thức
  ('MMT','leg1_mode','Phương thức chặng 1','select',NULL,ARRAY['Đường bộ','Đường thủy nội địa','Đường biển','Đường sắt','Hàng không'],false,10),
  ('MMT','transship_point','Điểm chuyển tải','text',NULL,ARRAY[]::text[],false,20),
  ('MMT','leg2_mode','Phương thức chặng 2','select',NULL,ARRAY['Đường bộ','Đường thủy nội địa','Đường biển','Đường sắt','Hàng không'],false,30),
  ('MMT','port_of_loading','Cảng/ga xếp hàng','text',NULL,ARRAY[]::text[],false,40),
  ('MMT','port_of_discharge','Cảng/ga dỡ hàng','text',NULL,ARRAY[]::text[],false,50),

  -- PKG — Đóng/rút container, đóng gói, chằng buộc
  ('PKG','job_type','Loại công việc','select',NULL,ARRAY['Đóng container','Rút container','Đóng gói','Chằng buộc','Đóng kiện gỗ'],false,10),
  ('PKG','packing_material','Vật tư đóng gói','select',NULL,ARRAY['Kiện gỗ','Pallet gỗ','Pallet nhựa','Màng PE','Dây đai thép','Thùng carton'],false,20),
  ('PKG','needs_fumigation','Cần hun trùng','boolean',NULL,ARRAY[]::text[],false,30),
  ('PKG','warehouse','Kho thực hiện','text',NULL,ARRAY[]::text[],false,40),

  -- BRK — Môi giới hàng hải
  ('BRK','shipment_type','Loại lô hàng','select',NULL,ARRAY['FCL','LCL','Hàng rời','Hàng lỏng','Ro-Ro'],false,10),
  ('BRK','port_of_loading','Cảng xếp hàng','text',NULL,ARRAY[]::text[],false,20),
  ('BRK','port_of_discharge','Cảng dỡ hàng','text',NULL,ARRAY[]::text[],false,30),
  ('BRK','laycan','Thời gian xếp hàng dự kiến','date',NULL,ARRAY[]::text[],false,40),
  ('BRK','vessel_name','Tên tàu','text',NULL,ARRAY[]::text[],false,50),
  ('BRK','freight_term','Điều kiện cước','select',NULL,ARRAY['FOB','CIF','CFR','EXW','DAP','DDP'],false,60),

  -- RNT — Cho thuê thiết bị & phương tiện
  ('RNT','equipment_type','Loại thiết bị','select',NULL,ARRAY['Xe tải','Đầu kéo','Rơ-moóc','Xe nâng','Cẩu','Container kho','Máy phát điện'],false,10),
  ('RNT','quantity','Số lượng','number','chiếc',ARRAY[]::text[],false,20),
  ('RNT','rent_from','Thuê từ ngày','date',NULL,ARRAY[]::text[],true,30),
  ('RNT','rent_to','Thuê đến ngày','date',NULL,ARRAY[]::text[],true,40),
  ('RNT','with_operator','Kèm người vận hành','boolean',NULL,ARRAY[]::text[],false,50),
  ('RNT','site_address','Địa điểm sử dụng','text',NULL,ARRAY[]::text[],false,60),

  -- CON — Tư vấn giải pháp vận chuyển
  ('CON','topic','Nội dung tư vấn','select',NULL,ARRAY['Tối ưu tuyến','Tối ưu chi phí','Thiết kế chuỗi cung ứng','Tư vấn thủ tục','Tư vấn đóng gói'],false,10),
  ('CON','scope_summary','Phạm vi tư vấn','text',NULL,ARRAY[]::text[],false,20),
  ('CON','deadline','Hạn gửi phương án','date',NULL,ARRAY[]::text[],false,30)
) AS v(service_code, field_key, label, field_type, unit, options, is_required, sort_order)
JOIN services s ON s.code = v.service_code
-- Chi ro WHERE: tu migration 054, khoa chong trung la CHI MUC MOT PHAN
-- (service_id, field_key) WHERE service_child_id IS NULL. Postgres khong suy ra
-- duoc chi muc mot phan neu khong lap lai dung dieu kien cua no - thieu dong
-- WHERE nay thi ca cau INSERT nem loi va KHONG mot o nhap rieng nao duoc nap.
ON CONFLICT (service_id, field_key) WHERE service_child_id IS NULL DO NOTHING;

COMMIT;

-- Kiểm chứng:
--   SELECT s.code, count(f.id) AS so_truong, s.cargo_fields
--     FROM services s LEFT JOIN service_fields f ON f.service_id = s.id
--    GROUP BY s.id, s.code, s.cargo_fields ORDER BY s.code;
