-- 039: thay cho trong bang dieu khoan van chuyen that, va them thong tin
-- phap nhan ben van chuyen de phieu xac nhan in ra duoc dang hop dong.
--
-- HAI VIEC, MOT MIGRATION, vi chung di cung nhau: to phieu chi doc ra nhu hop
-- dong khi co DU hai ben va du dieu khoan. Thieu mot nua thi van la to phieu cu.
--
-- VE DIEU KHOAN: ban nay do nguoi viet phan mem soan theo thong le van tai noi
-- dia, KHONG phai do luat su duyet. No thay cho dong '[CHUA SOAN]' de he thong
-- khong con chay bang mot cho trong, nhung truoc khi dung voi khach that thi
-- nguoi phu trach phap che phai doc lai — nhat la cac CON SO: han thanh toan,
-- muc boi thuong, han khieu nai, noi giai quyet tranh chap.
--
-- Chi ghi de khi gia tri hien tai VAN LA cho trong. Noi nao da soan dieu khoan
-- rieng thi migration nay khong duoc dap len cong suc do.
--
-- VE PHAP NHAN: moi khoa mot dong, de sau nay sua tren man quan tri. Ma so thue
-- va nguoi dai dien de TRONG co y — khong ai o day biet hai thong tin do, va
-- dat bua mot ma so thue len hop dong la lam gia giay to. Phieu in ra se ve mot
-- duong cham cham o nhung o con trong.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

UPDATE app_settings
   SET value = $dk$ĐIỀU 3. GIAO NHẬN HÀNG HÓA
3.1. Bên B giao hàng đúng địa điểm và thời gian ghi tại Điều 1. Trường hợp thay đổi, Bên B thông báo cho Bên A chậm nhất 24 (hai mươi tư) giờ trước thời điểm nhận hàng.
3.2. Bên B chịu trách nhiệm đóng gói phù hợp với tính chất hàng hóa và phương thức vận chuyển. Hư hỏng phát sinh do đóng gói không phù hợp không thuộc trách nhiệm của Bên A.
3.3. Bên B cung cấp đầy đủ chứng từ hợp pháp của lô hàng. Bên A có quyền từ chối vận chuyển hàng hóa không có chứng từ hợp lệ hoặc thuộc danh mục cấm lưu thông.
3.4. Hàng hóa được coi là đã giao khi người nhận tại địa điểm giao hàng ký xác nhận trên chứng từ giao nhận.

ĐIỀU 4. CƯỚC VẬN CHUYỂN VÀ THANH TOÁN
4.1. Cước vận chuyển là giá trị ghi tại Điều 2, áp dụng cho khối lượng, kích thước và tuyến đường đã mô tả tại Điều 1.
4.2. Chi phí phát sinh ngoài phạm vi Điều 1 — lưu xe, lưu kho, bốc xếp ngoài giờ, thay đổi điểm giao, hàng quay đầu — phải được hai bên xác nhận bằng văn bản hoặc thư điện tử trước khi thực hiện.
4.3. Bên B thanh toán trong vòng 07 (bảy) ngày kể từ ngày nhận đủ hóa đơn và chứng từ giao nhận, bằng chuyển khoản vào tài khoản do Bên A chỉ định.
4.4. Giá trị tại Điều 2 chưa bao gồm thuế giá trị gia tăng, trừ khi ghi rõ khác.

ĐIỀU 5. TRÁCH NHIỆM CỦA BÊN A
5.1. Bố trí phương tiện phù hợp, vận chuyển hàng đúng tuyến và bàn giao đúng địa điểm.
5.2. Bảo quản hàng hóa trong suốt quá trình vận chuyển; thông báo kịp thời cho Bên B khi có sự cố.
5.3. Bồi thường thiệt hại thực tế đối với hàng hóa mất mát, hư hỏng do lỗi của Bên A, tối đa không vượt quá giá trị lô hàng Bên B đã khai báo. Trường hợp Bên B không khai báo giá trị, mức bồi thường tối đa bằng 10 (mười) lần cước vận chuyển của lô hàng đó.

ĐIỀU 6. TRÁCH NHIỆM CỦA BÊN B
6.1. Khai báo trung thực tên hàng, khối lượng, kích thước và giá trị lô hàng.
6.2. Bố trí người giao hàng và người nhận hàng tại hai đầu tuyến theo thời gian đã thống nhất.
6.3. Thanh toán đầy đủ và đúng hạn theo Điều 4.

ĐIỀU 7. KHIẾU NẠI
7.1. Khiếu nại về số lượng và tình trạng bên ngoài của hàng hóa được lập ngay tại thời điểm giao nhận và ghi trên chứng từ giao nhận.
7.2. Khiếu nại về hư hỏng không nhìn thấy được gửi tới Bên A trong vòng 03 (ba) ngày kể từ ngày nhận hàng. Quá thời hạn này, hàng hóa được coi là đã giao nguyên vẹn.

ĐIỀU 8. BẤT KHẢ KHÁNG
8.1. Bất khả kháng là sự kiện xảy ra khách quan, không lường trước được và không thể khắc phục dù đã áp dụng mọi biện pháp cần thiết: thiên tai, dịch bệnh, chiến tranh, đình công, quyết định của cơ quan nhà nước có thẩm quyền.
8.2. Bên gặp sự kiện bất khả kháng thông báo cho bên kia trong vòng 03 (ba) ngày và không phải chịu trách nhiệm đối với phần nghĩa vụ không thực hiện được do sự kiện đó.

ĐIỀU 9. BẢO MẬT
Hai bên giữ bí mật thông tin về hàng hóa, giá cước và nội dung hợp đồng, trừ trường hợp phải cung cấp theo yêu cầu của cơ quan nhà nước có thẩm quyền.

ĐIỀU 10. HIỆU LỰC VÀ GIẢI QUYẾT TRANH CHẤP
10.1. Hợp đồng có hiệu lực kể từ thời điểm Bên B ký xác nhận và chấm dứt khi hai bên hoàn thành nghĩa vụ của mình.
10.2. Bên B ký xác nhận bằng phương thức điện tử trên hệ thống của Bên A. Chữ ký điện tử cùng thời điểm ký, địa chỉ IP và thiết bị ký được hệ thống ghi nhận và có giá trị như chữ ký trên bản giấy theo Luật Giao dịch điện tử.
10.3. Tranh chấp phát sinh được giải quyết trước hết bằng thương lượng trong 30 (ba mươi) ngày. Không thương lượng được thì đưa ra Tòa án có thẩm quyền tại Thành phố Hồ Chí Minh giải quyết.
10.4. Những nội dung không quy định tại hợp đồng này được thực hiện theo Bộ luật Dân sự và Luật Thương mại hiện hành.$dk$,
       updated_at = now()
 WHERE key = 'dieu_khoan_ky'
   AND value LIKE '[CHUA SOAN]%';

INSERT INTO app_settings (key, value) VALUES
  ('cong_ty_ten',       'CÔNG TY CỔ PHẦN VẬN CHUYỂN CON ONG (BEE TRANSPORTATION CORPORATION)'),
  ('cong_ty_dia_chi',   'TTC Tower, 253 Hoàng Văn Thụ, Phường Tân Sơn Hoà, Thành phố Hồ Chí Minh'),
  ('cong_ty_mst',       ''),
  ('cong_ty_dien_thoai','0886 440 449'),
  ('cong_ty_email',     'info@beetransportation.vn'),
  ('cong_ty_dai_dien',  ''),
  ('cong_ty_chuc_vu',   '')
ON CONFLICT (key) DO NOTHING;

COMMIT;
