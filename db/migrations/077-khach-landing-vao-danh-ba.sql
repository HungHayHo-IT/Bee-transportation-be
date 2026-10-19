-- 077 - Khach tu landing vao thang danh ba (14/10/2026).
--
-- 052 da bo man duyet va chuyen moi ho so ve 'approved', nhung cho tao ho so
-- KEM DON (order-customer.helper) van ghi 'pending'. Man Khach hang chi hien
-- 'approved', nen moi khach gui yeu cau tu landing tu do bi an — co ho so, co
-- don, nhung khong ai thay trong danh ba. Code da sua; day la phan du lieu.

BEGIN;
SET lock_timeout = '3s';

UPDATE customers SET status = 'approved' WHERE status <> 'approved';

COMMIT;
