-- 035: bo trang 'priceQuoted' khoi ma tran phan quyen.
--
-- VAN DE: bang gia co HAI man trong menu — "Gia niem yet" va "Tuyen & gia" —
-- tren dung mot bang du lieu. Khac nhau chi o cho man dau khoa vao phien dang
-- ap dung va khong cho sua tung dong. Nguoi dung doc menu khong thay duoc cho
-- khac do, va phai doan xem gia that nam o man nao.
--
-- Nay con mot man: "Tuyen & gia". Ai muon xem gia dang ap dung thi vao do,
-- phien dang ap dung duoc chon san.
--
-- KHONG AI MAT QUYEN GI: da doi chieu tren chinh co so du lieu nay truoc khi
-- xoa — ca nam vai tro dang co muc GIONG HET nhau tren 'priceQuoted' va
-- 'priceList' (admin/staff = full, ba vai con lai = view). Neu mot he thong
-- nao do da sua lech hai o nay thi buoc kiem trong scripts/check-migrations.sql
-- se khong con y nghia, nhung quyen thuc te van do 'priceList' quyet dinh —
-- dung cai ma man hinh con lai dang dung.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

-- Xoa han thay vi de lai: mot dong tro toi trang khong con ton tai thi khong
-- ai doc duoc no nua, ma no van hien ra trong moi cau truy van kiem tra sau
-- nay va lam nguoi doc tuong con mot man hinh thu hai o dau do.
DELETE FROM role_page_permissions WHERE page_key = 'priceQuoted';

COMMIT;
