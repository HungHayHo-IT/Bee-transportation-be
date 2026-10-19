-- Kiểm tra máy chủ đã có ĐỦ thứ mà các migration phải tạo ra. Chỉ ĐỌC, không sửa gì.
--
-- Vì sao cần: apply-migrations.sh có một lối tắt — DB nào đã có bảng `users`
-- mà `schema_migrations` còn trống thì mọi migration bị đánh dấu "đã chạy" MÀ
-- KHÔNG chạy file nào. Lối tắt đó đúng cho DB cũ đã migrate đủ, nhưng với DB
-- dựng từ schema.sql thì nó bỏ qua phần DỮ LIỆU nằm trong migration.
--
-- Đã cắn một lần: user hệ thống public@bee.internal (migration 008/009) không
-- được tạo trên production. Hậu quả là MỌI yêu cầu báo giá từ form công khai
-- đều không sinh được đơn, im lặng nhiều ngày — không log, không cảnh báo.
--
-- Bảng dưới vì thế kiểm KẾT QUẢ (cột/bảng/dữ liệu có thật chưa), không kiểm
-- bảng schema_migrations — đúng cái mà lối tắt kia nói dối.
--   docker compose -f docker-compose.vm.yml exec -T db \
--     psql -U beeops -d beeops -f - < scripts/check-migrations.sql
SELECT m.buoc, m.can_lam,
       CASE WHEN m.da_co THEN 'OK' ELSE '>>> THIEU — phai chay' END AS trang_thai
FROM (VALUES
  ('001', 'cot orders.reject_note / cancel_reason (QA-19)',
   (SELECT count(*) = 2 FROM information_schema.columns
     WHERE table_name='orders' AND column_name IN ('reject_note','cancel_reason'))),
  ('001', 'index order_departments(assignee_id) (QA-12)',
   (SELECT to_regclass('public.order_departments_assignee_idx') IS NOT NULL)),
  ('001', 'trigger orders_touch_updated_at (QA-11)',
   (SELECT count(*) = 1 FROM pg_trigger
     WHERE tgname='orders_touch_updated_at' AND NOT tgisinternal)),
  ('001', 'du lieu tinh/thanh da chuan hoa (QA-02)',
   (SELECT count(*) = 0 FROM orders
     WHERE origin_province IN ('HN','HP') OR destination_province IN ('HN','HP'))),
  ('002', 'cot orders.service_data',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name='orders' AND column_name='service_data')),
  ('002', 'bang service_fields + cot services.cargo_fields',
   (SELECT to_regclass('public.service_fields') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='services' AND column_name='cargo_fields'))),
  ('003', 'da nap bo o nhap rieng cua cac dich vu',
   (SELECT EXISTS (SELECT 1 FROM service_fields))),
  ('004', 'nhan moc CON co "(neu co)"',
   (SELECT EXISTS (SELECT 1 FROM services
                    WHERE code='CON'
                      AND 'Điều chỉnh theo phản hồi (nếu có)' = ANY (milestones)))),
  ('005', 'cot departments.parent_id',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name='departments' AND column_name='parent_id')),
  ('006', 'cot users.is_landing_representative',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name='users' AND column_name='is_landing_representative')),
  ('007', 'bang quote_requests',
   (SELECT to_regclass('public.quote_requests') IS NOT NULL)),
  -- DONG QUAN TRONG NHAT BANG NAY: created_by con NOT NULL thi form bao gia
  -- cong khai khong sinh duoc don nao, va khong co dau hieu nao khac de nhan ra.
  ('075', 'don khach tu gui khong can tai khoan he thong (created_by cho NULL)',
   (SELECT is_nullable = 'YES' FROM information_schema.columns
     WHERE table_name = 'orders' AND column_name = 'created_by')),
  ('010', 'bang news_articles',
   (SELECT to_regclass('public.news_articles') IS NOT NULL)),
  ('011', 'bang customer_accounts / customer_identities / customer_otps',
   (SELECT to_regclass('public.customer_accounts') IS NOT NULL
       AND to_regclass('public.customer_identities') IS NOT NULL
       AND to_regclass('public.customer_otps') IS NOT NULL)),
  ('012', 'cot quote_requests.customer_id',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name='quote_requests' AND column_name='customer_id')),
  ('014', 'bang customer_devices',
   (SELECT to_regclass('public.customer_devices') IS NOT NULL)),
  ('015', 'cot notifications.customer_id / quote_request_id / pushed_at',
   (SELECT count(*) = 3 FROM information_schema.columns
     WHERE table_name='notifications'
       AND column_name IN ('customer_id','quote_request_id','pushed_at'))),
  ('016', 'index notifications_outbox_idx',
   (SELECT to_regclass('public.notifications_outbox_idx') IS NOT NULL)),
  -- Thieu hai bang nay thi /auth/refresh va /customer-auth/refresh do 500 o moi
  -- lan goi, va app mobile khong gia han duoc phien -> het 12h la dang xuat.
  ('017', 'bang refresh_tokens / customer_refresh_tokens',
   (SELECT to_regclass('public.refresh_tokens') IS NOT NULL
       AND to_regclass('public.customer_refresh_tokens') IS NOT NULL)),
  -- Thieu cot nay thi GET/PATCH /customer-auth/me do 500 vi Prisma select mot
  -- cot khong ton tai -- ca man Ho so cua app khach hang chet.
  ('018', 'cot customer_accounts.avatar_url',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name='customer_accounts' AND column_name='avatar_url')),
  -- Thieu bang nay thi POST/DELETE /notifications/devices do 500 va nhan vien
  -- khong dang ky duoc may nao -- push cho noi bo im lang hoan toan.
  ('019', 'bang user_devices',
   (SELECT to_regclass('public.user_devices') IS NOT NULL)),
  -- Thieu cot nay thi PushCron.resolveTokens select mot cot khong ton tai ->
  -- moi vong cron push nem loi, ke ca luong cua KHACH dang chay that.
  ('019', 'cot users.push_off',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name='users' AND column_name='push_off')),
  -- Vi tu index phai KHOP cau WHERE cua claim(). Con sot ve `user_id IS NULL`
  -- thi index khong dung duoc va cron push seq scan ca bang notifications.
  ('019', 'notifications_push_idx da bo ve user_id IS NULL',
   (SELECT pg_get_expr(i.indpred, i.indrelid) NOT LIKE '%user_id%'
      FROM pg_index i WHERE i.indexrelid = to_regclass('public.notifications_push_idx'))),
  -- Thieu buoc nay thi moi don tu form cong khai deu do 500 khi INSERT: rang
  -- buoc CHECK cu khong biet 'awaiting_info'. Loi nam o tang DB nen khong test
  -- nao cua ung dung bat duoc.
  ('020', 'orders_status_check da nhan awaiting_info',
   (SELECT pg_get_constraintdef(oid) LIKE '%awaiting_info%'
      FROM pg_constraint WHERE conname = 'orders_status_check')),
  -- Thieu cot nay thi don CBT tu form cong khai KET vinh vien o awaiting_info:
  -- backend van doi diem den trong nuoc, ma admin da an o do di.
  ('021', 'cot services.has_domestic_destination',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name='services' AND column_name='has_domestic_destination')),
  -- Co that ra nhung dung cho CBT thi cot co cung vo nghia.
  ('021', 'CBT da tat has_domestic_destination',
   (SELECT has_domestic_destination = false FROM services WHERE code='CBT')),
  -- Con NOT NULL thi khach tu form website khong luu duoc: form chi hoi ten
  -- nguoi, ma ten nguoi phai vao contact_name chu khong phai company_name.
  ('022', 'customers.company_name da bo NOT NULL',
   (SELECT is_nullable = 'YES' FROM information_schema.columns
     WHERE table_name='customers' AND column_name='company_name')),
  -- Con nhan 4 trang thai cu thi code va DB noi hai thu khac nhau: backend
  -- khong sinh ra chung nua, nhung don cu van mang va khong man hinh nao doc duoc.
  ('023', 'orders_status_check da bo 4 trang thai cu',
   (SELECT pg_get_constraintdef(oid) NOT LIKE '%in_progress%'
       AND pg_get_constraintdef(oid) NOT LIKE '%rejected%'
       AND pg_get_constraintdef(oid) NOT LIKE '%awaiting_customer%'
      FROM pg_constraint WHERE conname = 'orders_status_check')),
  ('023', 'khong con don nao o 4 trang thai cu',
   (SELECT count(*) = 0 FROM orders
     WHERE status IN ('in_progress','completed','rejected','awaiting_customer'))),
  -- Thieu bang nay thi CMS ghi khong duoc, va landing lang le dung ban trong
  -- code mai mai: no von thiet ke de chay tiep khi khong lay duoc lop phu, nen
  -- loi se khong noi ra o dau ca.
  ('025', 'bang landing_content da co',
   (SELECT to_regclass('public.landing_content') IS NOT NULL)),
  ('025', 'landing_content chi nhan hai ngon ngu',
   (SELECT count(*) = 1 FROM pg_constraint
     WHERE conrelid = 'landing_content'::regclass
       AND pg_get_constraintdef(oid) LIKE '%vi-vn%'
       AND pg_get_constraintdef(oid) LIKE '%en-us%')),
  -- Thieu cot nay thi moi ho so khach moi vao thang danh sach dung duoc, va
  -- buoc duyet bi bo qua ma khong bao gi.
  ('026', 'customers co cot status',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'customers' AND column_name = 'status')),
  ('026', 'customers co ma so thue va giay phep',
   (SELECT count(*) = 2 FROM information_schema.columns
     WHERE table_name = 'customers'
       AND column_name IN ('tax_code', 'business_licence'))),
  -- Chan gia tri la o tang du lieu: mot lan ghi thang 'Approved' (hoa chu) la
  -- bo loc im lang bo sot ho so do.
  ('026', 'customers_status_check chan gia tri la',
   (SELECT count(*) = 1 FROM pg_constraint
     WHERE conname = 'customers_status_check')),
  ('026', 'khach cu deu da duoc duyet',
   (SELECT count(*) = 0 FROM customers WHERE status NOT IN
     ('pending', 'approved', 'rejected'))),
  ('027', 'ba bang gia tuyen da co',
   (SELECT count(*) = 3 FROM information_schema.tables
     WHERE table_name IN ('locations', 'price_sessions', 'route_prices'))),
  -- Hai phien cung active thi man gia niem yet hien mot trong hai, va khong ai
  -- biet no chon cai nao. Ep o tang du lieu chu khong o tang ung dung.
  ('027', 'chi mot phien gia duoc active',
   (SELECT count(*) = 1 FROM pg_indexes
     WHERE indexname = 'price_sessions_one_active_uk')),
  ('027', 'mot tuyen mot dich vu chi mot gia trong mot phien',
   (SELECT count(*) = 1 FROM pg_indexes WHERE indexname = 'route_prices_uk')),
  -- Thieu hai cot nay thi khong co khoa nao de tra gia niem yet cho mot don:
  -- don noi 'Da Nang -> Quang Nam', bang gia noi 'Kho DN -> Kho Tam Ky'.
  ('028', 'orders tro duoc toi dia diem dau tuyen',
   (SELECT count(*) = 2 FROM information_schema.columns
     WHERE table_name = 'orders'
       AND column_name IN ('origin_location_id', 'destination_location_id'))),
  ('029', 'nguoi dai dien co cot mo ta',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'landing_description')),
  ('030', 'nguoi dai dien co cot anh',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'landing_avatar_url')),
  ('031', 'services co bon cot cho landing',
   (SELECT count(*) = 4 FROM information_schema.columns
     WHERE table_name = 'services'
       AND column_name IN
         ('landing_key', 'landing_slug_vi', 'landing_slug_en', 'show_on_landing'))),
  -- Hai dich vu cung mot duong dan thi landing hien cai nao cung sai. Ep o
  -- tang du lieu chu khong o tang ung dung.
  ('031', 'duong dan landing khong trung nhau',
   (SELECT count(*) = 3 FROM pg_indexes WHERE indexname IN
     ('services_landing_key_uk', 'services_landing_slug_vi_uk', 'services_landing_slug_en_uk'))),
  ('031', 'len landing thi phai du khoa va duong dan',
   (SELECT count(*) = 1 FROM pg_constraint WHERE conname = 'services_landing_du_ck')),
  ('032', 'co bang ma tran phan quyen',
   (SELECT count(*) = 1 FROM information_schema.tables
     WHERE table_name = 'role_page_permissions')),
  -- Muc la trong mot tap dong, ep o tang du lieu: mot chuoi la lot vao day thi
  -- guard doc ra khong hieu, va cach hong an toan duy nhat la chan het.
  ('032', 'muc quyen bi rang buoc o tang du lieu',
   (SELECT count(*) = 1 FROM pg_constraint
     WHERE conname = 'role_page_permissions_level_ck')),
  ('032', 'admin khong mat quyen tren man phan quyen',
   (SELECT count(*) = 1 FROM role_page_permissions
     WHERE role = 'admin' AND page_key = 'permissions' AND level = 'full')),
  -- Thieu dong = KHONG co quyen, nen ba man them o dot 033 ma khong seed la
  -- khoa ca cong ty khoi man chi tiet don ngay khi deploy.
  -- Dem rieng NAM VAI TRO NOI BO. Truoc day dem tong, nhung 042 them vai tro
  -- 'partner' nen tong doi — dem theo danh sach vai tro thi them vai tro moi
  -- khong lam cau kiem nay do oan.
  ('033', 'ba trang them vao ma tran co du nam vai tro noi bo',
   (SELECT count(*) = 15 FROM role_page_permissions
     WHERE page_key IN ('orderDetail', 'customerDetail', 'notifications')
       AND role IN ('admin','leader','manager','sale','staff'))),
  -- Bac 'edit' phai duoc rang buoc CHAP NHAN: thieu buoc 034 thi man phan
  -- quyen luu bac nay se bi co so du lieu tu choi, va loi hien ra o cho khac.
  ('034', 'muc quyen nhan duoc bac edit',
   (SELECT pg_get_constraintdef(oid) LIKE '%edit%' FROM pg_constraint
     WHERE conname = 'role_page_permissions_level_ck')),
  -- Man "Gia niem yet" da bo: dong nao con tro toi no la dong khong ai doc
  -- duoc nua, va lam nguoi doc tuong con mot man hinh thu hai o dau do.
  ('035', 'khong con dong nao tro toi trang gia niem yet',
   (SELECT count(*) = 0 FROM role_page_permissions WHERE page_key = 'priceQuoted')),
  ('036', 'co bang chu ky don hang',
   (SELECT count(*) = 1 FROM information_schema.tables
     WHERE table_name = 'order_signatures')),
  -- Mot dong 'da_ky' ma thieu dau vet la mot dong khong chung minh duoc gi.
  ('036', 'da ky thi bat buoc du dau vet',
   (SELECT count(*) = 1 FROM pg_constraint
     WHERE conname = 'order_signatures_da_ky_du_ck')),
  -- Hai link cung song thi ky cai nao cung duoc, khong ai biet ban nao that.
  ('036', 'moi don chi mot yeu cau dang cho ky',
   (SELECT count(*) = 1 FROM pg_indexes
     WHERE indexname = 'order_signatures_mot_cho_ky_uk')),
  ('036', 'trang gui khach ky co du nam vai tro noi bo',
   (SELECT count(*) = 5 FROM role_page_permissions WHERE page_key = 'orderSignature'
     AND role IN ('admin','leader','manager','sale','staff'))),
  -- Thieu dong nay thi man ky tra ve dieu khoan rong, va khach ky vao mot to
  -- giay khong co dieu kien nao.
  ('037', 'co dong cau hinh dieu khoan ky',
   (SELECT count(*) = 1 FROM app_settings WHERE key = 'dieu_khoan_ky')),
  -- Thieu buoc nay thi bam gui OTP tra ve 500 ngay giua luc khach dang cho ma.
  ('038', 'OTP nhan duoc muc dich ky don',
   (SELECT pg_get_constraintdef(oid) LIKE '%sign_order%' FROM pg_constraint
     WHERE conname = 'customer_otps_purpose_check')),
  -- Con '[CHUA SOAN]' nghia la khach dang ky vao mot to giay khong co dieu kien.
  ('039', 'dieu khoan van chuyen da soan',
   (SELECT value NOT LIKE '[CHUA SOAN]%' FROM app_settings WHERE key = 'dieu_khoan_ky')),
  -- Thieu mot khoa thi o tuong ung tren hop dong in ra trong tron.
  ('039', 'du bay khoa phap nhan ben van chuyen',
   (SELECT count(*) = 7 FROM app_settings WHERE key LIKE 'cong_ty_%')),
  -- Thieu bang nay thi man dich vu khong mo duoc, va khong don nao gan duoc ma TMS.
  ('040', 'co bang dich vu con',
   (SELECT to_regclass('public.service_children') IS NOT NULL)),
  -- Thieu cot nay thi don khong giu duoc dich vu con da chon.
  ('040', 'orders co cot service_child_id',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'orders' AND column_name = 'service_child_id')),
  -- 18 ma tai muc 5 tai lieu OF1-TMS. Thieu ma nao la don loai do khong day duoc.
  ('040', 'co 16 dich vu con mang ma TMS',
   (SELECT count(DISTINCT tms_mode) = 16 FROM service_children WHERE tms_mode IS NOT NULL)),
  -- Hai dong cu cua 041 (DOM/CBT mang ma cua chinh no, va "du 18 ma tren ca hai
  -- bang") bo di cung voi cot services.tms_mode o 049. Tu do ma TMS CHI nam o
  -- dich vu con, va hai ma 'DOMESTIC' / 'CBT' khong con duoc dung - chung von
  -- da khong gui duoc, vi payload chi doc ma cua dich vu con.
  -- Chuyen cang thuoc nhom qua canh, khong phai da phuong thuc.
  ('041', 'PORTTRANSFER nam duoi CBT',
   (SELECT count(*) = 2 FROM service_children c JOIN services s ON s.id = c.service_id
     WHERE c.tms_mode LIKE 'PORTTRANSFER%' AND s.code = 'CBT')),
  -- Thieu thi khong tao duoc tai khoan doi tac: CHECK tu choi vai tro la.
  ('042', 'CSDL nhan vai tro partner',
   (SELECT pg_get_constraintdef(oid) LIKE '%partner%' FROM pg_constraint
     WHERE conname = 'users_roles_ck')),
  -- Thieu thi buoc nhap ma khong luu duoc, dang ky dung giua chung.
  ('042', 'OTP nhan muc dich dang ky doi tac',
   (SELECT pg_get_constraintdef(oid) LIKE '%register_partner%' FROM pg_constraint
     WHERE conname = 'customer_otps_purpose_check')),
  -- Doi tac phai MO dung hai trang. Nhieu hon la lo du lieu noi bo cho cong ty khac.
  ('042', 'doi tac co quyen xem don',
   (SELECT count(*) = 2 FROM role_page_permissions
     WHERE role = 'partner' AND level <> 'none'
       AND page_key IN ('orders', 'orderDetail'))),
  -- Doi tac xem bang gia de di bao gia cho khach cua ho.
  ('043', 'doi tac xem duoc bang gia',
   (SELECT level = 'view' FROM role_page_permissions
     WHERE role = 'partner' AND page_key = 'priceList')),
  -- Mo dung ba trang. Nhieu hon la lo du lieu noi bo cho cong ty khac.
  ('043', 'doi tac mo dung ba trang',
   (SELECT count(*) = 3 FROM role_page_permissions
     WHERE role = 'partner' AND level <> 'none')),
  -- Thieu cot thi API tra ve thieu truong, man khach hang khong hien ma.
  ('044', 'cot customers.code',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'customers' AND column_name = 'code')),
  -- 697 ma CL nam TRONG migration 044. DB dung tu schema.sql bo qua phan du
  -- lieu do, va khong co no thi nhan vien goi ma khach ma he thong khong biet.
  ('044', 'du lieu 697 ma khach CL',
   (SELECT count(*) >= 697 FROM customers WHERE code LIKE 'CL%')),
  -- Thieu ba cot nay thi khong ghi lai duoc don nao da day sang OF1, va OF1
  -- KHONG chan trung fileNo: bam hai lan la khach co hai don ben do.
  ('045', 'cot orders.tms_status / tms_pushed_at / tms_error',
   (SELECT count(*) = 3 FROM information_schema.columns
     WHERE table_name = 'orders'
       AND column_name IN ('tms_status', 'tms_pushed_at', 'tms_error'))),
  -- Thieu CHECK thi mot trang thai go sai van ghi duoc, va o khoa chiem cho het
  -- dang tin: don o trang thai la se bi coi la chua day.
  ('045', 'CSDL chan trang thai TMS la',
   (SELECT count(*) = 1 FROM pg_constraint WHERE conname = 'orders_tms_status_ck')),
  -- Thieu cot thi cau dem so thu tu trong ngay khong chay, va KHONG tao duoc
  -- don nao ca.
  ('046', 'cot orders.code_prefix',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'orders' AND column_name = 'code_prefix')),
  -- Khoa chong trung phai tinh theo tien to. Con tinh theo service_id thi don
  -- E_FCL va I_LCL thu hai trong ngay deu bi chan: ca hai cung la so 1 cua
  -- dich vu MMT.
  ('046', 'khoa chong trung theo code_prefix',
   (SELECT count(*) = 1 FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
     WHERE c.relname = 'orders_daily_no_uk'
       AND pg_get_indexdef(i.indexrelid) LIKE '%code_prefix%')),
  -- Ham cu nhan service_id, ban moi nhan tien to. Con sot ban cu thi Postgres
  -- giu ca hai nhu ham nap chong va ma don cu van sinh ra im lang.
  ('046', 'ham sinh ma don nhan tien to',
   (SELECT count(*) = 0 FROM pg_proc
     WHERE proname = 'next_daily_no' AND pg_get_function_arguments(oid) LIKE '%integer%')),
  -- Thieu thi don PRJ khong day sang OF1 duoc va ma don van la PRJ-<ngay>-<stt>.
  -- KHONG loc theo s.tms_mode: PRJ tren production co ma cha EXPORT_FCL, loc
  -- theo do thi phep kiem nhin vao tap RONG va bool_and tra NULL - khong bao
  -- OK ma cung khong bao thieu. Dung la chinh loi 047 mac phai.
  ('050', 'dich vu ten co FCL/LCL da co du 12 ma',
   (SELECT COALESCE(bool_and(co.n = 12), true) FROM (
      SELECT count(c.id) FILTER (WHERE c.tms_mode IS NOT NULL) AS n
        FROM services s LEFT JOIN service_children c ON c.service_id = s.id
       WHERE s.name ~* '\m(FCL|LCL)\M'
       GROUP BY s.id) co)),
  -- Con cot nay thi o dat ma cha van con duong song lai, va luat "bat buoc chon
  -- dich vu con" van co lo thoat - lo thoat dan toi don sang OF1 khong mang
  -- mode nao.
  ('049', 'da bo cot services.tms_mode',
   (SELECT count(*) = 0 FROM information_schema.columns
     WHERE table_name = 'services' AND column_name = 'tms_mode')),
  -- Thieu cot thi KHONG don nao day sang OF1 duoc: hai ma dia diem la truong
  -- bat buoc cua TMSBILL.
  ('051', 'cot locations.of1_id',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'locations' AND column_name = 'of1_id')),
  -- Con dong 'pending' hay 'rejected' thi chung mac ket: khong con man duyet,
  -- va luc tao don chung khong hien trong o chon khach.
  ('052', 'khong con ho so khach cho duyet',
   (SELECT count(*) = 0 FROM customers WHERE status <> 'approved')),
  -- Sale phai o bac 'edit': bac 'full' la ho xoa duoc khach.
  ('052', 'sale o bac edit tren trang khach hang',
   (SELECT count(*) = 2 FROM role_page_permissions
     WHERE role = 'sale' AND page_key IN ('customers', 'customerDetail')
       AND level = 'edit')),
  -- Thieu bang thi man soan dieu khoan khong mo duoc, va luong ky roi ve
  -- app_settings - tuc la van gui khach dong '[CHUA SOAN]'.
  -- CHI kiem bang co ton tai, KHONG dem dong: mot cau SELECT ... FROM
  -- terms_clauses lam hong CA SCRIPT tren CSDL chua chay 053, va script do vo
  -- thi giau luon moi dong con lai. Phan du lieu nam cung transaction voi phan
  -- tao bang nen co bang la co dong.
  ('053', 'co bang dieu khoan ky',
   (SELECT to_regclass('public.terms_clauses') IS NOT NULL)),
  -- Thieu cot thi form van doc co cua dich vu CHA: don PRJ chon "Xuyen bien
  -- gioi" bi doi tinh/thanh Viet Nam cho diem den, va hang nhap khau khong co
  -- cach nao khai diem di o nuoc ngoai.
  ('054', 'service_children co hai co diem di/den',
   (SELECT count(*) = 2 FROM information_schema.columns
     WHERE table_name = 'service_children'
       AND column_name IN ('has_domestic_origin', 'has_domestic_destination'))),
  -- Thieu cot thi o rieng khong gan duoc vao dich vu con: don PRJ chon CBT_FCL
  -- se khong co o "Nuoc den" va "Cua khau".
  ('054', 'service_fields gan duoc vao dich vu con',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'service_fields' AND column_name = 'service_child_id')),
  -- Thieu bang don vi tinh thi man "Tuyen & gia" khong co o nao de nhap gia,
  -- va route_prices.unit_code tro vao hu khong. CHI kiem bang ton tai, khong
  -- dem dong: mot SELECT ... FROM price_units lam hong CA SCRIPT tren CSDL
  -- chua chay 055, va script vo thi giau luon moi dong con lai.
  ('055', 'co bang danh muc don vi tinh gia',
   (SELECT to_regclass('public.price_units') IS NOT NULL)),
  -- Thieu cot thi mot tuyen chi giu duoc MOT gia: nhap bang gia that vao la
  -- mat 7/8 so lieu va khong con biet con so con lai la cua loai xe nao.
  ('055', 'route_prices co chieu don vi tinh',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'route_prices' AND column_name = 'unit_code')),
  -- Thieu cot thi khong biet dia diem thuoc van phong nao phu trach.
  ('055', 'locations co van phong phu trach',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'locations' AND column_name = 'office_code')),
  -- Khoa cu lower(name) van lot trung: cung mot KCN duoc go ca dau cham lan
  -- dau phay. Con khoa cu nghia la 055 chua chay het.
  ('055', 'khoa chong trung dia diem da chuan hoa',
   (SELECT to_regclass('public.locations_name_province_uk') IS NOT NULL)),
  -- 056 ('Sale them duoc dia chi moi', doi hoi priceLocations='edit' cho sale)
  -- da BO: 060 dao nguoc chinh no, ha sale xuong 'none'. Giu lai thi dong do
  -- bao THIEU vinh vien, va mot dong luon do se day nguoi ta bo qua ca bang.
  -- Thu 060 bao dam thay cho no la 'Sale va Pricing con doc duoc danh muc dia
  -- diem' — tuc la o chon dia chi van chay, chi mat nut them moi.
  -- Con 'view' thi Sale va Pricing van mo duoc ca bang gia va xuat ra Excel.
  ('057', 'Sale va Pricing thoi duyet bang gia',
   (SELECT count(*) = 2 FROM role_page_permissions
     WHERE page_key = 'priceList' AND role IN ('sale','staff') AND level = 'none')),
  -- Thieu khoa nay thi o goi y gia trong man bao gia tra 403 cho moi nguoi
  -- khong phai admin — tuc la 057 go mat mot tinh nang dang dung.
  ('057', 'co khoa trang tra gia mot tuyen',
   (SELECT count(*) >= 5 FROM role_page_permissions
     WHERE page_key = 'priceLookup' AND level = 'view')),
  -- Thieu gioi han thi ngoi tra lan luot tung cap dia diem la dung lai ca bang
  -- gia, chi lau hon.
  ('057', 'co gioi han so lan tra gia mot gio',
   (SELECT count(*) = 1 FROM app_settings WHERE key = 'pricing_lookup_per_hour')),
  -- Thieu hai bac tai nay thi khoi TRUNG CHUYEN cua bang gia duong dai khong
  -- nhap duoc: moi dong cua chung bi bo vi "khong co don vi tinh".
  ('058', 'co don vi tinh cua khoi trung chuyen',
   (SELECT count(*) = 2 FROM price_units WHERE code IN ('TRUCK_2_3T','TRUCK_MAX'))),
  -- Con cot service_id thi gia van khoa theo dich vu: cung mot tuyen phai nhap
  -- lai gia cho tung dich vu, va don thuoc dich vu khac khong thay gia nao.
  ('059', 'gia khong con khoa theo dich vu',
   (SELECT count(*) = 0 FROM information_schema.columns
     WHERE table_name = 'route_prices' AND column_name = 'service_id')),
  -- Con mot bac khac 'none' o ba vai nay la bang gia van ho ra ngoai hai nguoi
  -- duoc phep xem.
  -- 066 mo lai priceList cho Truong phong o bac XEM, va cat du lieu theo nguoi
  -- phu trach khu vuc — nen dong kiem nay chi con xet Sale va Pricing.
  ('060', 'Sale va Pricing khong vao duoc bang gia + dia diem',
   (SELECT count(*) = 0 FROM role_page_permissions
     WHERE page_key IN ('priceList', 'priceLocations')
       AND role IN ('sale', 'staff')
       AND level <> 'none')),
  -- GET /locations gio di theo QUYEN DON HANG, khong theo quyen man bang gia:
  -- danh muc khong lo gia, nhung Sale phai chon duoc dia chi luc nhap don. Buoc
  -- no vao mot khoa cua man bang gia thi khoa man do lai la o chon kho trong
  -- form don im lang tra ve rong — da xay ra that.
  ('060', 'Sale van doc duoc danh muc dia diem de nhap don',
   (SELECT count(*) >= 1 FROM role_page_permissions
     WHERE page_key IN ('createOrder', 'orders')
       AND role = 'sale'
       AND level <> 'none')),
  ('061', 'bang khu vuc + tuyen + gia theo dich vu',
   (SELECT count(*) = 3 FROM information_schema.tables
     WHERE table_name IN ('price_regions', 'region_routes', 'region_route_prices'))),
  -- Khu vuc gan vao DIA DIEM. Thieu cot nay thi man "Khu vuc va tuyen" khong
  -- gom duoc tuyen nao, va no that bai IM LANG: danh sach rong trong moi khu vuc.
  ('061', 'cot locations.region_id',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'locations' AND column_name = 'region_id')),
  -- Ba khu vuc khoi tao. Khong co khu vuc nao thi khong them duoc tuyen nao.
  ('061', 'ba khu vuc Bac/Trung/Nam da seed',
   (SELECT count(*) >= 3 FROM price_regions)),
  -- Chi DIEM DI moi bat buoc co khu vuc: khu vuc cua tuyen la khu vuc cua diem
  -- di, nen diem di khong co khu vuc thi tuyen do tang hinh o moi khu vuc.
  -- Dia diem chi lam diem DEN thi khong can — cot "Khu vuc" trong file nhap noi
  -- ve dau DI, va doi hoi ca hai dau la bao mot loi khong co that.
  ('061', 'dia diem dang lam diem DI deu co khu vuc',
   (SELECT count(*) = 0 FROM locations l
     WHERE l.is_active AND l.region_id IS NULL
       AND EXISTS (SELECT 1 FROM region_routes r WHERE r.origin_id = l.id))),
  -- Con cot vehicle_load la ban cu: man hinh gui unit_code, DB doi mot con so,
  -- va moi lan luu gia deu 500.
  ('062', 'gia tuyen khoa theo don vi tinh, khong theo so tan',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'region_route_prices' AND column_name = 'unit_code')
   AND (SELECT count(*) = 0 FROM information_schema.columns
     WHERE table_name = 'region_route_prices' AND column_name = 'vehicle_load')),
  ('062', 'km 2 chieu nam o tuyen',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'region_routes' AND column_name = 'round_trip_km')),
  -- Thieu cot nay thi moi lan luu tuyen deu 500, va bang gia khong con lich su.
  ('063', 'tuyen khu vuc thuoc mot phien gia',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'region_routes' AND column_name = 'session_id'
       AND is_nullable = 'NO')),
  -- Khong co phien nao dang ap dung thi man don hang khong tra duoc gia.
  ('063', 'co phien gia dang ap dung khi da co tuyen',
   (SELECT count(*) = 0 FROM region_routes)
   OR (SELECT count(*) = 1 FROM price_sessions WHERE status = 'active')),
  -- Dong chi co gia hai chieu la dong nhap theo luat CU (mot cot = gia hai
  -- chieu). Luat that: mot cot la gia MOT chieu, hai chieu = +50%.
  ('064', 'khong con dong gia chi co chieu ve',
   (SELECT count(*) = 0 FROM region_route_prices
     WHERE one_way_price IS NULL AND round_trip_price IS NOT NULL)),
  -- Con cot service_child_id la ban cu: man hinh gui kind, DB doi mot id.
  -- Thieu cot nay thi khong giao khu vuc cho ai duoc, va Truong phong mo man
  -- bang gia ra chi thay mot danh sach rong.
  ('066', 'khu vuc co cot nguoi phu trach',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'price_regions' AND column_name = 'manager_id')),
  -- Ten co xuong dong di thang vao danh muc roi hien ra giua man hinh; ham
  -- khoa cua CSDL von da gop khoang trang khi so sanh nen giu ban goc chi de
  -- lai mot cai ten xau.
  ('067', 'ten dia diem khong con khoang trang kep',
   (SELECT count(*) = 0 FROM locations
     WHERE name <> btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))),
  -- Khu vuc suy theo HANG XOM cung tinh de lai 346/486 dia diem khong thuoc
  -- khu vuc nao, va 6 dia diem TP.HCM nam trong Mien Trung. Tinh quyet dinh.
  ('068', 'moi dia diem co tinh deu thuoc mot khu vuc',
   (SELECT count(*) = 0 FROM locations l
     LEFT JOIN price_regions r ON r.id = l.region_id
    WHERE l.province IS NOT NULL AND r.name IS NULL)),
  -- Contract OF1 v1.3: co `quantity` thi BAT BUOC `quantityUnit`, thieu la
  -- OF1 tu choi NGUYEN request.
  ('069', 'don co cot don vi tinh',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'orders' AND column_name = 'quantity_unit')),
  -- Contract OF1 muc 3: khach dong bo kem addresses[], don tham chieu bang ma
  -- va Bee tu dien toa do. Truoc 070 BeeOps khong co cho nao quan ly chung.
  ('070', 'co danh muc dia chi cua khach',
   (SELECT count(*) = 1 FROM information_schema.tables
     WHERE table_name = 'customer_addresses')),
  -- Contract OF1 muc 5.3 co hblNo/bookingCode; payload khai hai khoa ay tu dau
  -- nhung khong bao gio dien duoc vi BeeOps khong co cho nao luu.
  ('071', 'dich vu co ma TMS deu co o HBL va booking',
   (SELECT count(*) = 0 FROM (
      SELECT DISTINCT service_id FROM service_children WHERE tms_mode IS NOT NULL
    ) s WHERE (SELECT count(*) FROM service_fields f
                WHERE f.service_id = s.service_id
                  AND f.field_key IN ('hbl_no','booking_code')) <> 2)),
  -- Khach tao kem don (ke ca tu landing) phai hien o man Khach hang.
  ('077', 'khong con ho so khach pending',
   (SELECT count(*) = 0 FROM customers WHERE status <> 'approved')),
  -- Phong sale: khong tham gia bao gia, nen khong giu dich vu nao.
  ('076', 'co departments.is_sales + CHECK phong sale khong dich vu',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'departments' AND column_name = 'is_sales')
   AND (SELECT count(*) = 1 FROM pg_constraint WHERE conname = 'departments_sale_khong_dich_vu')),
  -- Nhieu dia diem dung chung mot ma OF1.
  ('074', 'ma OF1 khong con duy nhat',
   (SELECT count(*) = 0 FROM pg_indexes WHERE indexname = 'locations_of1_id_uk')),
  -- Logo doi tac landing chuyen tu ma nguon vao CSDL de CMS quan ly.
  ('073', 'co bang logo doi tac, da nap san',
   (SELECT count(*) = 1 FROM information_schema.tables WHERE table_name = 'partner_logos')
   AND (SELECT count(*) > 0 FROM partner_logos)),
  -- Pricing phai xem don cua moi phong de bao gia, nhung chi xem.
  ('072', 'co co xem toan bo don (chi xem)',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'can_view_all_orders')),
  ('066', 'Truong phong xem duoc bang gia',
   (SELECT count(*) = 1 FROM role_page_permissions
     WHERE page_key = 'priceList' AND role = 'manager' AND level <> 'none')),
  ('065', 'gia tuyen khoa theo FCL/LCL',
   (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'region_route_prices' AND column_name = 'kind')
   AND (SELECT count(*) = 0 FROM information_schema.columns
     WHERE table_name = 'region_route_prices' AND column_name = 'service_child_id'))
) AS m(buoc, can_lam, da_co)
ORDER BY m.buoc, m.can_lam;
