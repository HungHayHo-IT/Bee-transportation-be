-- 063 - Bang gia khu vuc thuoc ve mot PHIEN GIA.
--
-- 061 dung bang gia khu vuc khong theo phien, vi man hinh luc do khong co o
-- chon phien nao. Nhung bo phien thi mat hai thu da co o bang gia cu (027/055):
--
--   * "hoi thang 6 bao khach bao nhieu" - khong tra lai duoc nua;
--   * soan gia moi ma khong dung toi gia dang bao cho khach - khong lam duoc,
--     moi lan sua la sua thang vao bang dang chay.
--
-- Nen gan session_id vao REGION_ROUTES chu khong vao region_route_prices: mot
-- phien la mot BAN CHUP day du cua bang gia, dung nhu route_prices da lam.
-- Hai phien co the co cung mot cap dia diem voi gia khac nhau, va luu tru mot
-- phien thi ca tuyen lan gia cua no o yen do.
--
-- Dia diem KHONG theo phien: no la danh muc dung chung, va don hang cu tro
-- thang vao no.
--
-- Du lieu dang co (9 tuyen, 44 muc gia) duoc gan vao mot phien va CONG BO
-- luon - khong co phien nao dang ap dung thi man don hang khong tra duoc gia.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

-- 1. Cot moi, tam thoi cho NULL de con dien du lieu cu vao.
ALTER TABLE region_routes
  ADD COLUMN IF NOT EXISTS session_id int REFERENCES price_sessions(id) ON DELETE CASCADE;

-- 2. Chua co phien nao thi tao mot phien va cong bo. Chi chay khi THAT SU
--    chua co: da co phien roi thi dung phien dang ap dung, khong de them.
INSERT INTO price_sessions (name, effective_from, status, activated_at)
SELECT 'Bang gia ' || to_char(current_date, 'DD/MM/YYYY'), current_date, 'active', now()
 WHERE NOT EXISTS (SELECT 1 FROM price_sessions);

-- 3. Tuyen chua thuoc phien nao -> gan vao phien dang ap dung, khong co thi
--    phien moi nhat. Chay lai khong de len tuyen da co phien.
UPDATE region_routes r
   SET session_id = (
     SELECT id FROM price_sessions
      ORDER BY (status = 'active') DESC, id DESC
      LIMIT 1)
 WHERE r.session_id IS NULL;

-- 4. Khoa lai. Lam SAU buoc 3 nen khong bao gio co dong nao ket o NULL.
--    Con dong NULL thi dung lai va bao, chu khong xoa chung di.
DO $$
DECLARE con int;
BEGIN
  SELECT count(*) INTO con FROM region_routes WHERE session_id IS NULL;
  IF con > 0 THEN
    RAISE EXCEPTION 'Con % tuyen chua gan duoc phien gia - kiem tra bang price_sessions', con;
  END IF;
END $$;

ALTER TABLE region_routes ALTER COLUMN session_id SET NOT NULL;

-- 5. Mot cap dia diem duoc lap lai o phien KHAC: do la ca y nghia cua phien.
DROP INDEX IF EXISTS region_routes_uk;
CREATE UNIQUE INDEX IF NOT EXISTS region_routes_uk
  ON region_routes (session_id, origin_id, destination_id);
CREATE INDEX IF NOT EXISTS region_routes_session_idx ON region_routes (session_id);

COMMIT;

-- Kiem chung:
--   SELECT p.name, p.status, count(r.id) AS so_tuyen
--     FROM price_sessions p LEFT JOIN region_routes r ON r.session_id = p.id
--    GROUP BY p.name, p.status;
--   SELECT count(*) FROM region_routes WHERE session_id IS NULL;
