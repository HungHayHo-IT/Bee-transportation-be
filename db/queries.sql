-- BeeOps - Cac truy van nghiep vu chinh (tham chieu khi code backend)

-- =====================================================================
-- A. F1 + F2: Tao don + phan phoi tu dong (1 transaction)
-- =====================================================================
BEGIN;
  -- 1) Sinh STT trong ngay (co advisory lock ben trong) + ma don.
  --    :prefix va :sep do backend tinh san - xem ma-don.helper.ts:
  --    co ma TMS  -> ('E_FCL', '_'),  khong co -> (ma dich vu cha, '-').
  INSERT INTO orders (order_day, daily_no, code, code_prefix, service_id, customer_id, created_by,
                      status, origin_province, destination_province, weight_kg, volume_cbm)
  SELECT current_date, n.no, order_code(:prefix, :sep, current_date, n.no), :prefix,
         :service_id, :customer_id, :sale_id, 'distributed',
         :origin, :destination, :weight, :cbm
  FROM (SELECT next_daily_no(:prefix) AS no) n
  RETURNING id;   -- -> :order_id

  -- 2) Day den TAT CA phong phu trach dich vu do
  INSERT INTO order_departments (order_id, department_id)
  SELECT :order_id, d.id
  FROM departments d
  WHERE d.is_active AND :service_id = ANY (d.service_ids);

  -- 3) Khong phong nao phu trach -> hang doi "Chua dinh tuyen" cho Admin
  UPDATE orders SET status = 'new'
  WHERE id = :order_id
    AND NOT EXISTS (SELECT 1 FROM order_departments WHERE order_id = :order_id);

  INSERT INTO activity_log (order_id, entity, entity_id, action, actor_id)
  VALUES (:order_id, 'orders', :order_id, 'create', :sale_id);
COMMIT;

-- Dich vu chua phong nao phu trach (canh bao o man hinh cau hinh F7)
SELECT s.code, s.name FROM services s
WHERE s.is_active
  AND NOT EXISTS (SELECT 1 FROM departments d
                  WHERE d.is_active AND s.id = ANY (d.service_ids));

-- =====================================================================
-- B. F3: Don gia tham khao - 5 don thanh cong gan nhat, khop dan
--    cung dich vu -> cung tuyen -> quy mo tuong duong (+/- 30%)
-- =====================================================================
SELECT o.code, o.final_amount, o.closed_at,
       o.origin_province, o.destination_province,
       o.weight_kg, o.volume_cbm, o.package_count,
       (CASE WHEN o.origin_province      = :origin      THEN 2 ELSE 0 END)
     + (CASE WHEN o.destination_province = :destination THEN 2 ELSE 0 END)
     + (CASE WHEN :weight IS NOT NULL AND o.weight_kg
                BETWEEN :weight * 0.7 AND :weight * 1.3 THEN 1 ELSE 0 END)
     + (CASE WHEN :cbm IS NOT NULL AND o.volume_cbm
                BETWEEN :cbm * 0.7 AND :cbm * 1.3 THEN 1 ELSE 0 END) AS match_score
FROM orders o
WHERE o.service_id = :service_id
  AND o.status IN ('closed','in_progress','completed')
  AND o.final_amount IS NOT NULL
ORDER BY match_score DESC, o.closed_at DESC
LIMIT 5;

-- Gui bao gia: day ban cu xuong lich su, ghi ban moi ngay tren dong phan phoi
UPDATE order_departments SET
  quote_history = CASE WHEN quote_version = 0 THEN quote_history
                  ELSE quote_history || jsonb_build_object(
                       'version', quote_version, 'amount', amount,
                       'scope_note', scope_note, 'lead_time', lead_time,
                       'at', last_quoted_at) END,
  quote_version = quote_version + 1,
  amount = :amount, scope_note = :scope, lead_time = :lead_time,
  valid_until = :valid_until,
  state = 'quoted',
  first_quoted_at = COALESCE(first_quoted_at, now()),
  last_quoted_at  = now()
WHERE order_id = :order_id AND department_id = :dept_id;

UPDATE orders SET status = 'quoting', updated_at = now()
WHERE id = :order_id AND status IN ('new','distributed');

-- Man hinh so sanh bao gia cua sale: 1 query, khong join bang quotes
-- (bao gia kin: nhan vien phong chi duoc xem dong cua phong minh - loc o tang app)
SELECT d.name AS phong, od.state, od.amount, od.scope_note, od.lead_time,
       od.valid_until, od.quote_version, od.last_quoted_at, od.pass_reason,
       u.full_name AS nguoi_phu_trach
FROM order_departments od
JOIN departments d ON d.id = od.department_id
LEFT JOIN users u  ON u.id = od.assignee_id
WHERE od.order_id = :order_id
ORDER BY od.amount NULLS LAST;

-- =====================================================================
-- C1. F3: Chon bao gia thang -> phong phu trach chinh thuc (dac ta muc 5)
--     Chua khoa doanh thu o buoc nay.
-- =====================================================================
BEGIN;
  UPDATE orders SET status = 'awaiting_customer', department_id = :dept_id,
                    updated_at = now()
  WHERE id = :order_id AND status IN ('quoting','awaiting_selection');

  UPDATE order_departments SET state = 'lost'
   WHERE order_id = :order_id AND state = 'quoted';       -- 'passed' giu nguyen
  UPDATE order_departments SET state = 'won'
   WHERE order_id = :order_id AND department_id = :dept_id;
COMMIT;

-- Mo lai vong gia tu 'awaiting_customer' -> PHAI hoan tac viec chon
BEGIN;
  UPDATE orders SET status = 'quoting', department_id = NULL, updated_at = now()
  WHERE id = :order_id AND status = 'awaiting_customer';

  UPDATE order_departments SET state = 'quoted'
   WHERE order_id = :order_id AND state IN ('won','lost');
COMMIT;

-- =====================================================================
-- C2. F4: Chot don - khoa doanh thu + sinh bo moc tien do cua dich vu
--     Phong phu trach lay tu orders.department_id (da chon o C1),
--     KHONG nhan lai tu request.
-- =====================================================================
BEGIN;
  UPDATE orders o SET
    status       = 'closed',      -- 'in_progress' khi phong cap nhat moc dau tien
    final_amount = (SELECT amount FROM order_departments
                    WHERE order_id = o.id AND department_id = o.department_id),
    closed_at    = now(), updated_at = now()
  WHERE o.id = :order_id AND o.status = 'awaiting_customer'
    AND o.department_id IS NOT NULL;

  -- Copy snapshot moc tien do: Admin sua services.milestones sau nay
  -- khong lam thay doi don da chot
  INSERT INTO order_milestones (order_id, seq, name)
  SELECT :order_id, m.seq, m.name
  FROM orders o
  JOIN services s ON s.id = o.service_id
  CROSS JOIN LATERAL unnest(s.milestones) WITH ORDINALITY AS m(name, seq)
  WHERE o.id = :order_id;

  INSERT INTO activity_log (order_id, entity, entity_id, action, actor_id, detail)
  VALUES (:order_id, 'orders', :order_id, 'close', :sale_id,
          jsonb_build_object('final_amount', :amount));
COMMIT;

-- Moc dau tien duoc xu ly -> don Dang thuc hien
UPDATE orders SET status = 'in_progress'
WHERE id = :order_id AND status = 'closed';

-- Hoan tat moc cuoi -> don Hoan thanh
UPDATE orders SET status = 'completed', completed_at = now()
WHERE id = :order_id
  AND NOT EXISTS (SELECT 1 FROM order_milestones
                  WHERE order_id = :order_id AND status = 'pending');

-- =====================================================================
-- D. F5: Danh sach don theo pham vi quyen (dieu kien them o tang ung dung)
--    admin / leader -> khong dieu kien
--    manager        -> o.id IN (SELECT order_id FROM order_departments
--                               WHERE department_id = :my_dept)
--    sale           -> o.created_by = :me
--    staff          -> od.assignee_id = :me OR od.department_id = :my_dept
--    (co co "Xem bao cao cong ty" -> khong dieu kien, de drill-down duoc)
-- =====================================================================
SELECT o.code, s.name AS dich_vu, c.company_name AS khach_hang, o.status,
       o.final_amount, d.name AS phong_phu_trach, u.full_name AS sale,
       (SELECT name FROM order_milestones
         WHERE order_id = o.id AND status = 'done'
         ORDER BY seq DESC LIMIT 1) AS moc_moi_nhat,
       o.created_at
FROM orders o
JOIN services s   ON s.id = o.service_id
JOIN users u      ON u.id = o.created_by
LEFT JOIN customers c   ON c.id = o.customer_id
LEFT JOIN departments d ON d.id = o.department_id
WHERE (:status IS NULL OR o.status = :status)
ORDER BY o.created_at DESC
LIMIT 50 OFFSET :offset;

-- Dong thoi gian hoat dong cua don (trang chi tiet)
SELECT a.created_at, u.full_name, a.action, a.detail
FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
WHERE a.order_id = :order_id ORDER BY a.created_at;

-- =====================================================================
-- E. F6: Dashboard - tinh truc tiep tu orders, khong bang tong hop
-- =====================================================================

-- Doanh thu theo thang.
--   tang phong ban : them  AND o.department_id = :dept
--   tang ca nhan   : them  AND (o.created_by = :me OR EXISTS (
--                      SELECT 1 FROM order_departments od
--                      WHERE od.order_id = o.id AND od.assignee_id = :me))
--   Nhan vien phong ban KHONG BAO GIO tao don -> chi loc created_by se ra rong.
SELECT date_trunc('month', o.closed_at) AS thang,
       count(*) AS so_don, sum(o.final_amount) AS doanh_thu,
       round(avg(o.final_amount)) AS gia_tri_tb
FROM orders o
WHERE o.status IN ('closed','in_progress','completed')
  AND o.closed_at >= :from_date
GROUP BY 1 ORDER BY 1;

-- Lat cat theo dich vu (doi GROUP BY de ra tuyen / khach hang / sale)
SELECT s.code, s.name, count(*) AS so_don, sum(o.final_amount) AS doanh_thu
FROM orders o JOIN services s ON s.id = o.service_id
WHERE o.closed_at >= :from_date AND o.final_amount IS NOT NULL
GROUP BY s.id, s.code, s.name ORDER BY doanh_thu DESC;

-- Ty le chot (win rate) theo sale
-- Mau so = don DA CO KET QUA voi khach: thang + bi tu choi.
-- 'cancelled' (huy noi bo) va don dang chay deu nam NGOAI ca tu so lan mau so.
SELECT u.full_name,
       count(*) FILTER (WHERE o.status IN ('closed','in_progress','completed')) AS chot,
       count(*) FILTER (WHERE o.status = 'rejected')                            AS tu_choi,
       count(*) AS co_ket_qua,
       round(100.0 * count(*) FILTER (WHERE o.status IN
             ('closed','in_progress','completed')) / nullif(count(*), 0), 1) AS win_rate
FROM orders o JOIN users u ON u.id = o.created_by
WHERE o.created_at >= :from_date
  AND o.status IN ('closed','in_progress','completed','rejected')
GROUP BY u.id, u.full_name;

-- Ly do tu choi
SELECT reject_reason, count(*) FROM orders
WHERE status = 'rejected' AND reject_reason IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;

-- Thoi gian phan hoi + ty le thang bao gia theo phong
SELECT d.name,
       round(avg(extract(epoch FROM od.claimed_at - od.distributed_at) / 3600)::numeric, 1)
         AS gio_den_khi_nhan,
       round(avg(extract(epoch FROM od.first_quoted_at - od.distributed_at) / 3600)::numeric, 1)
         AS gio_den_khi_bao_gia,
       count(*) FILTER (WHERE od.state = 'won')            AS thang,
       count(*) FILTER (WHERE od.state IN ('won','lost'))  AS tham_gia
FROM order_departments od JOIN departments d ON d.id = od.department_id
GROUP BY d.id, d.name;

-- =====================================================================
-- F. SLA + hang doi email (cron moi 15 phut, khong can message queue)
-- =====================================================================

-- Don qua han chua phong nao nhan -> nhac truong phong & sale.
-- Chong nhac lap o muc (don, phong, nguoi nhan) bang dedupe_key.
-- Chong lap o muc (don, type) la SAI: phong A tre truoc se lam phong B, C khong duoc nhac.
INSERT INTO notifications (user_id, order_id, type, title, body, dedupe_key)
SELECT u.id, o.id, 'sla_late',
       'Don ' || o.code || ' qua han tiep nhan',
       'Phong ' || d.name || ' chua tiep nhan sau ' || s.sla_hours || ' gio.',
       'sla_late:' || o.id || ':' || d.id || ':' || u.id
FROM order_departments od
JOIN orders o      ON o.id = od.order_id
JOIN services s    ON s.id = o.service_id
JOIN departments d ON d.id = od.department_id
JOIN users u ON u.id IN (d.manager_id, o.created_by) AND u.is_active
WHERE od.state = 'pending'
  AND od.distributed_at < now() - (s.sla_hours || ' hours')::interval
ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

-- Hang doi gui email SMTP (worker lay ra, gui xong set emailed_at)
SELECT n.id, u.email, n.title, n.body
FROM notifications n
JOIN users u ON u.id = n.user_id AND u.is_active
WHERE n.emailed_at IS NULL
  AND NOT (n.type = ANY (u.email_off))
ORDER BY n.created_at
LIMIT 50
FOR UPDATE OF n SKIP LOCKED;
