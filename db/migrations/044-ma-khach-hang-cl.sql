-- 044 - Ma khach hang (CL) + nhap 697 khach tu "LIST MA CL.xls".
--
-- Vi sao them cot: he thong cu danh so khach theo CL000001.. va nhan vien goi
-- khach bang ma do. Khong co cot nay thi hai ben noi hai thu tieng khac nhau.
--
-- UNIQUE nhung CHO PHEP NULL: khach cu va khach tu form website khong co ma,
-- Postgres coi moi NULL la khac nhau nen khong can index mot phan.
--
-- Du lieu nam TRONG migration (khong o seed.sql) vi DB dung tu schema.sql bi
-- apply-migrations.sh danh dau "da chay" ma khong chay - xem phan dau
-- scripts/check-migrations.sql. Hai dong kiem tra '044' o do la cai chan loi do.
--
-- Cot cua sheet khong khop bang customers: sheet co Address/Country ma bang
-- khong co. Nhet vao `note` thay vi them hai cot chua ai dung den.
--
-- MA SO THUE giu 683/697 dong, nhan ca ba dang co that trong file:
--   10 so        - phap nhan            (603 dong)
--   10-3 so      - chi nhanh            (78 dong)
--   12 so        - so dinh danh ca nhan, cung la MST cua ca nhan va ho kinh
--                  doanh                (2 dong)
-- 14 dong con lai de TRONG vi o Taxcode cua chung khong chua ma so thue: 13
-- dong chep lai chinh ma CL ('CL000533'), 1 dong ghi ten nguoi ('LE VAN CHIEN').
--
-- Cot Tel bi bo gan het: 438/443 dong ghi dung chu "N/A", chi 5 so la that.

BEGIN;
SET lock_timeout = '3s';

ALTER TABLE customers ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS customers_code_idx ON customers (code);

CREATE TEMP TABLE nhap_cl (
  code         text,
  company_name text,
  tax_code     text,
  phone        text,
  note         text
) ON COMMIT DROP;

INSERT INTO nhap_cl (code, company_name, tax_code, phone, note) VALUES
  ('CL000003', 'VIETNAM AIRLINES - VNA - VN tai DA NANG-1zh1', '0100107518', NULL, 'Nhom: AIRLINE
Dia chi: co H/Dong'),
  ('CL000001', 'MSC VN CO LTD -HCM', '0303137370', NULL, 'Nhom: CARRIER
Dia chi: 152 Nguyen Luong Bang st – Dist.7'),
  ('CL000002', 'EVERGREEN - HCM - xuat hoa don cho all vp cua Evergreen', '0302986886', NULL, 'Nhom: CARRIER
Dia chi: 561A Điện Biên Phủ, Phường 25, Quận BÌnh Thạnh, TP. Hồ Chí Minh'),
  ('CL000029', 'Cosco Shipping Lines VN DAD - COSCO CONTAINER LINES VIETNAM', '0301471348-003', NULL, 'Nhom: CARRIER
Dia chi: 421 TRAN HUNG DAO STREET, AN HAI TAY WARD, SON TRA DISTRICT, DA NANG CITY'),
  ('CL000031', 'MOL CONSOLIDATION - MCS (VIETNAM)', '0315190749', NULL, 'Nhom: CARRIER
Dia chi: 14th Floor, Lim Building 2, 62A Cach Mang Thang Tam, Vo Thi Sau Ward, District 3, Ho Chi Minh City, Vietnam'),
  ('CL000331', 'NEW SITC CONTAINER LINES', '0315904351', NULL, 'Nhom: CARRIER'),
  ('CL000484', 'PETROLIMEX DONG HO', '3100105749-042', NULL, 'Nhom: DOMESTIC
Dia chi: Số 2 Lê Lợi, Phường Nam Đông Hà, Tỉnh Quảng Trị, Việt Nam'),
  ('CL000485', 'O TO PTM', '0101116000-005', NULL, 'Nhom: DOMESTIC
Dia chi: Số 03 Phạm Hùng, Phường Hoà Xuân, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000514', 'XANG DAU QUAN DOI KV3', '0100108688-016', NULL, 'Nhom: DOMESTIC
Dia chi: Số 15 Hoàng Diệu, Phường Nha Trang, Tỉnh Khánh Hòa, Việt Nam'),
  ('CL000533', 'Truong Thi Le 7456568888 techcombank', NULL, NULL, 'Nhom: DOMESTIC'),
  ('CL000546', 'CUU HO LONG AN 24', '1102002985', NULL, 'Nhom: DOMESTIC
Dia chi: 47/19 Trương Định, Phường Long An, Tỉnh Tây Ninh, Việt Nam'),
  ('CL000579', 'MTV VINH NGUYEN', '3703156775', NULL, 'Nhom: DOMESTIC
Dia chi: Số 19 đường D5, Khu phố Tân Thắng, Phường Tân Đông Hiệp, Thành phố Hồ Chí Minh, Việt Nam.'),
  ('CL000596', 'BAO LONG CONTAINER DEPOT', '3703303797', NULL, 'Nhom: DOMESTIC
Dia chi: Lô J5, đường số 10, khu công nghiệp Sóng Thần 2, Phường Dĩ An, TP Hồ Chí Minh, Việt Nam'),
  ('CL000597', 'PETROLIMEX HAI PHONG', '0200120833', NULL, 'Nhom: DOMESTIC
Dia chi: Số 1 Sở Dầu, Phường Hồng Bàng, TP Hải Phòng, Việt Nam'),
  ('CL000606', 'KY THUAT CONTA', '3703432802', NULL, 'Nhom: DOMESTIC
Dia chi: Số 528/13A, Đường Cao Tốc Mỹ Phước Tân Vạn, Khu Phố Đông Thành, Phường Tân Đông Hiệp, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000680', 'DAU KHI PHU YEN', '4400114094-018', NULL, 'Nhom: DOMESTIC
Dia chi: 441B Trần Hưng Đạo, Phường Ayun Pa, Tỉnh Gia Lai, Việt Nam'),
  ('CL000015', 'KHO TASACO - VAN TAI DUYEN HAI', '0200183294', NULL, 'Nhom: OTHER
Dia chi: Km 104+200 duong Nguyen Binh Khiem, Phuong Dong Hai 2, Q. Hai An, TP. Hai Phong, Viet Nam'),
  ('CL000016', 'PHU HUU PORT - TAN CANG PHU HUU', '0309444635', NULL, 'Nhom: OTHER
Dia chi: quarter 4, PHU HUU WARD, DISTRICT 9, HCMC'),
  ('CL000018', 'VICONSHIP QUY NHON', '4101538602', NULL, 'Nhom: OTHER
Dia chi: 83 Hai Bà Trưng , Phường Lê Lợi, Thành phố Quy Nhơn, Tỉnh Bình Định, Việt Nam'),
  ('CL000043', 'DTPT HA TANG KHU KINH TE KON TUM', '6100205467', NULL, 'Nhom: OTHER
Dia chi: Thôn Iệc - Xã Pờ Y - Huyện Ngọc Hồi - Kon Tum.'),
  ('CL000045', 'TRUNG TAM DANG KIEM XE CO GIOI DA NANG', '0400259487', NULL, 'Nhom: OTHER
Dia chi: 25 Hoang Van Thai, Phuong Hoa Minh, Quan Lien Chieu, Thanh pho Da Nang'),
  ('CL000047', 'LEGEND QUANG NGAI', '4300888506', NULL, 'Nhom: OTHER
Dia chi: 98/12 Nguyễn Huệ, Xã Tư Nghĩa, Tỉnh Quảng Ngãi, Việt Nam'),
  ('CL000105', 'KHO VAN TAN CANG', '0309532497', NULL, 'Nhom: OTHER
Dia chi: Tan Cang - Cat Lai Port, Cat Lai Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000117', 'BEEHCM', '0303482440', NULL, 'Nhom: OTHER
Dia chi: 253 HOANG VAN THU STREET, WARD 2, TAN BINH DISTRICT, HO CHI MINH CITY'),
  ('CL000122', 'PHAT TRIEN HANG HAI', '0200736206', NULL, 'Nhom: OTHER
Dia chi: Số 2 Đ22 Nguyễn Bình, Phường Gia Viên, Thành phố Hải Phòng, Việt Nam'),
  ('CL000125', 'HIEU TRUNG', '0200751437', NULL, 'Nhom: OTHER'),
  ('CL000285', 'EUPFIN', '0105909000', NULL, 'Nhom: OTHER
Dia chi: Số 14/6, ngõ 163 đường Nguyễn Khang, phường Yên Hòa, quận Cầu Giấy, thành phố Hà Nội, Việt Nam'),
  ('CL000294', 'BEEHAN', '0303482440', NULL, 'Nhom: OTHER
Dia chi: 253 HOANG VAN THU STREET, WARD 2, TAN BINH DISTRICT, HO CHI MINH CITY'),
  ('CL000295', 'BEEHPH', '0303482440', NULL, 'Nhom: OTHER
Dia chi: 253 HOANG VAN THU STREET, WARD 2, TAN BINH DISTRICT, HO CHI MINH CITY'),
  ('CL000296', 'BEEDAD', '0303482440', NULL, 'Nhom: OTHER
Dia chi: 253 HOANG VAN THU STREET, WARD 2, TAN BINH DISTRICT, HO CHI MINH CITY'),
  ('CL000297', 'XUONG LOI', '0303498867', NULL, 'Nhom: OTHER
Dia chi: 66 Nơ Trang Long, Phường 14, Quận Bình Thạnh, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000298', 'BIC', '0100931299-001', NULL, 'Nhom: OTHER
Dia chi: Lầu 5 khu C tòa nhà Waseco, số 10 Phổ Quang, Phường 2, Quận Tân Bình, TP. Hồ Chí Minh'),
  ('CL000299', 'SMARTEST', '0401950619', NULL, 'Nhom: OTHER'),
  ('CL000301', 'PVOIL QUANG NGAI', '4300603574-020', NULL, 'Nhom: OTHER'),
  ('CL000305', 'XANG DAU KVV', '0400101683', NULL, 'Nhom: OTHER'),
  ('CL000307', 'PHUC HUNG PHAT', '0401991407', NULL, 'Nhom: OTHER
Quoc gia: THE WEST BANK AND GAZA'),
  ('CL000308', 'WW', '0402122456', '0905888561', 'Nhom: OTHER'),
  ('CL000309', 'CONG TY TNHH THUONG MAI DICH VU DAI THIEN HA', '4101463266', NULL, 'Nhom: OTHER'),
  ('CL000310', 'SINOVNL', '0314618728', NULL, 'Nhom: OTHER
Quoc gia: THAILAND'),
  ('CL000311', 'TAN CANG CAI MEP', '3501473524', NULL, 'Nhom: OTHER'),
  ('CL000312', 'PHUC LONG', '0316991861', NULL, 'Nhom: OTHER'),
  ('CL000313', 'XANGDAUQDKV2', '0100108688-015', NULL, 'Nhom: OTHER'),
  ('CL000314', 'VAN NAM VINH PHU', '0304001090-004', NULL, 'Nhom: OTHER'),
  ('CL000315', 'GREATING FORTUNE', '0312714296', NULL, 'Nhom: OTHER'),
  ('CL000316', 'CONG NGHE LOGISTICS', '0317291301', NULL, 'Nhom: OTHER'),
  ('CL000317', 'ANH PHONG', '0303533783', NULL, 'Nhom: OTHER'),
  ('CL000318', 'SEG', '0316021461-004', NULL, 'Nhom: OTHER'),
  ('CL000319', 'PHUC HAO', '3703212451', NULL, 'Nhom: OTHER'),
  ('CL000320', 'KARUTO', '0401678628', NULL, 'Nhom: OTHER'),
  ('CL000321', 'XANGDAUTTH', '3300100988', NULL, 'Nhom: OTHER'),
  ('CL000322', 'XANGDAUQN', '4001273085', NULL, 'Nhom: OTHER'),
  ('CL000323', 'NGUYEN PHUOC SY', '0401824734', NULL, 'Nhom: OTHER'),
  ('CL000324', 'HIEU CUONG', '0401241901', NULL, 'Nhom: OTHER'),
  ('CL000325', 'TIEP VAN MIEN NAM', '0309788756', NULL, 'Nhom: OTHER'),
  ('CL000326', 'HIEP LUC', '0310959597', NULL, 'Nhom: OTHER'),
  ('CL000327', 'KHO VAN MIEN NAM', '0300645369', NULL, 'Nhom: OTHER'),
  ('CL000328', 'A CHUAN', '0303436268', NULL, 'Nhom: OTHER'),
  ('CL000329', 'TAM CANG CAT LAI', '0313611455', NULL, 'Nhom: OTHER'),
  ('CL000330', 'CANG VIET NAM', '0315895749', NULL, 'Nhom: OTHER'),
  ('CL000332', 'CONG DONG XE', '0108796475-021', NULL, 'Nhom: OTHER'),
  ('CL000333', 'BINH ANH', '0102306702', NULL, 'Nhom: OTHER'),
  ('CL000334', 'DAI THINH', '0401976127', NULL, 'Nhom: OTHER'),
  ('CL000335', 'XANG DAU QUANG NGAI', '4300298507', NULL, 'Nhom: OTHER'),
  ('CL000336', 'DAU KHI VUNG ANG', '3000413193', NULL, 'Nhom: OTHER'),
  ('CL000337', 'ANH HOA', '0316512149', NULL, 'Nhom: OTHER'),
  ('CL000338', 'HUU KHANH', '0304753446', NULL, 'Nhom: OTHER'),
  ('CL000339', 'ANH PHAT PETRO', '2802493498-001', NULL, 'Nhom: OTHER'),
  ('CL000340', 'DAU KHI MIEN NAM', '0314872379', NULL, 'Nhom: OTHER'),
  ('CL000341', 'NAM PHI LONG', '0302918999', NULL, 'Nhom: OTHER'),
  ('CL000342', 'PETROLIMEX', '0100108102-009', NULL, 'Nhom: OTHER'),
  ('CL000343', 'TANIMEX', '0304563607', NULL, 'Nhom: OTHER'),
  ('CL000344', 'HOA HIEP', '0301429314', NULL, 'Nhom: OTHER'),
  ('CL000345', 'KHO BAI PHU TAI', '0304853183-001', NULL, 'Nhom: OTHER'),
  ('CL000346', 'XANG DAU PHU HUU', '0301444626-025', NULL, 'Nhom: OTHER'),
  ('CL000347', 'XANG DAU KV II', '0300555450', NULL, 'Nhom: OTHER'),
  ('CL000348', 'HIEP PHU', '3700146497', NULL, 'Nhom: OTHER'),
  ('CL000349', 'TAN VAN', '0314562539', NULL, 'Nhom: OTHER'),
  ('CL000350', 'DIEN TAM', '0317129806', NULL, 'Nhom: OTHER'),
  ('CL000351', 'PHAT NGUYEN TRAM', '3702704852', NULL, 'Nhom: OTHER'),
  ('CL000352', 'NHIEN LIEU SAI GON', '0300631013', NULL, 'Nhom: OTHER'),
  ('CL000353', 'XANG DAU BA RIA VUNG TAU', '3500102573', NULL, 'Nhom: OTHER'),
  ('CL000354', 'XANG DAU TOAN DUNG', '3600628722', NULL, 'Nhom: OTHER'),
  ('CL000355', 'XANG DAU TIN NGHIA', '3601038204', NULL, 'Nhom: OTHER'),
  ('CL000356', 'O TO NGUYEN HOANG', '0312943899', NULL, 'Nhom: OTHER'),
  ('CL000357', 'OTO PHUC LAP', '3701699977-004', NULL, 'Nhom: OTHER'),
  ('CL000359', 'LE HUYEN', '1801346883', NULL, 'Nhom: OTHER'),
  ('CL000360', 'QUAN PHONG', '0401980980', NULL, 'Nhom: OTHER
Dia chi: 480 Nguyễn Lương Bằng, Phường Hoà Hiệp Nam, Quận Liên Chiểu, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000361', 'HUONG DUONG', '0304337291', NULL, 'Nhom: OTHER'),
  ('CL000362', 'TAY NAM', '0313524097', NULL, 'Nhom: OTHER'),
  ('CL000363', 'SAI GON LOGISTICS', '0318825475', NULL, 'Nhom: OTHER'),
  ('CL000364', 'TAN CANG BINH DUONG', '3700923658', NULL, 'Nhom: OTHER'),
  ('CL000365', 'TIEP VAN THANG LONG HCM', '0100112691-002', NULL, 'Nhom: OTHER'),
  ('CL000366', 'KHO VAN TAN CANG', '0318512521', NULL, 'Nhom: OTHER'),
  ('CL000367', 'NGUYEN THI THUC UYEN', '0400375451', NULL, 'Nhom: OTHER'),
  ('CL000368', 'ASEAN CENTRAL', '0401654345', NULL, 'Nhom: OTHER
Dia chi: Kho B Danatrans, Đường số 3, KCN Hòa Cầm, Phường Hoà Thọ Tây, Quận Cẩm Lệ, Thành Phố Đà Nẵng, Việt Nam'),
  ('CL000369', 'INOX TRUNG THANH', '0312527994', NULL, 'Nhom: OTHER'),
  ('CL000370', 'BINH VIET PHAT', '3702370744', NULL, 'Nhom: OTHER'),
  ('CL000371', 'THU DUC OIL', '0317338380', NULL, 'Nhom: OTHER'),
  ('CL000372', 'VAT TU XANG DAU', '0300450673-055', NULL, 'Nhom: OTHER'),
  ('CL000373', 'XANG DAU PHUC KHANG', '3703127904', NULL, 'Nhom: OTHER'),
  ('CL000374', 'VAN TAI VA DICH VU', '0302160137', NULL, 'Nhom: OTHER'),
  ('CL000375', 'HOANG LAN PHAT', '3401182024', NULL, 'Nhom: OTHER'),
  ('CL000376', 'HOANG GIA', '0313334385', NULL, 'Nhom: OTHER'),
  ('CL000377', 'HUYNH TRONG CAO', NULL, NULL, 'Nhom: OTHER'),
  ('CL000378', 'VAN NAM', '0304001090', NULL, 'Nhom: OTHER'),
  ('CL000379', 'TUONG VAN CANH', NULL, NULL, 'Nhom: OTHER'),
  ('CL000380', 'NGUYEN VAN THOI', NULL, NULL, 'Nhom: OTHER'),
  ('CL000382', 'SONG THAN', '3700785006', NULL, 'Nhom: OTHER'),
  ('CL000383', 'TAN CANG SAI GON', '0300514849', NULL, 'Nhom: OTHER'),
  ('CL000384', 'VO TIEN DAT', '3702268638', NULL, 'Nhom: OTHER'),
  ('CL000385', 'LE VAN CHIEN', NULL, NULL, 'Nhom: OTHER'),
  ('CL000386', 'NHAN THANH LOC PHAT', '6101174067', NULL, 'Nhom: OTHER'),
  ('CL000387', 'KM SAIGON', '0318795284', NULL, 'Nhom: OTHER'),
  ('CL000388', 'WAN HAI VN', '0311876512', NULL, 'Nhom: OTHER'),
  ('CL000389', 'DAU KHI PHU YEN', '4400114094', NULL, 'Nhom: OTHER'),
  ('CL000390', 'VAN PHU', '0400546812', NULL, 'Nhom: OTHER'),
  ('CL000391', 'PHUC VINH SANG', '3600249107', NULL, 'Nhom: OTHER'),
  ('CL000392', 'HAO THANH GIA', '0318407693', NULL, 'Nhom: OTHER'),
  ('CL000393', 'HUYNH GIA PHAT', '3702735321', NULL, 'Nhom: OTHER'),
  ('CL000394', 'TAI LINH', NULL, NULL, 'Nhom: OTHER'),
  ('CL000395', 'DO VAN THOI', NULL, NULL, 'Nhom: OTHER'),
  ('CL000396', 'MY THUY', '3200608457', NULL, 'Nhom: OTHER'),
  ('CL000397', '4TL', '3703294447', NULL, 'Nhom: OTHER'),
  ('CL000398', 'NGOI SAO MIEN NAM', '0316899400', NULL, 'Nhom: OTHER'),
  ('CL000399', 'CHAU THANH', '1200253539', NULL, 'Nhom: OTHER'),
  ('CL000400', 'VIET PHAT HUNG', '0310216584-003', NULL, 'Nhom: OTHER'),
  ('CL000401', 'CAU HANG', '3603386888', NULL, 'Nhom: OTHER'),
  ('CL000402', 'ANH SAO DUONG', '3700775992', NULL, 'Nhom: OTHER'),
  ('CL000403', 'SOC TRANG', '1800158559-001', NULL, 'Nhom: OTHER'),
  ('CL000404', 'XANG DAU NGOC ANH', '0301234308', NULL, 'Nhom: OTHER'),
  ('CL000405', 'XANG DAU CA MAU', '2000109850', NULL, 'Nhom: OTHER'),
  ('CL000406', 'KIM CUONG', '0835331450', NULL, 'Nhom: OTHER'),
  ('CL000407', 'XANG DAU AN GIANG', '1600184590', NULL, 'Nhom: OTHER'),
  ('CL000408', 'XANG DAU PHUC LOI', '3700570113', NULL, 'Nhom: OTHER'),
  ('CL000409', 'MINH DUC', '4300512503', NULL, 'Nhom: OTHER'),
  ('CL000410', 'PHAT AN KHANG', '3002076419', NULL, 'Nhom: OTHER'),
  ('CL000411', 'XANG DAU QUANG TRI', '3200041048', NULL, 'Nhom: OTHER'),
  ('CL000412', 'NAM TAY NGUYEN', '6000235027-017', NULL, 'Nhom: OTHER'),
  ('CL000413', 'XANG DAU CTV07', '0312079358-005', NULL, 'Nhom: OTHER'),
  ('CL000414', 'CANG BIEN QUOC', '4000756548', NULL, 'Nhom: OTHER'),
  ('CL000415', 'KIM CUONG', '2200791497', NULL, 'Nhom: OTHER'),
  ('CL000416', 'NAM KHANH', '0315817733', NULL, 'Nhom: OTHER'),
  ('CL000417', 'SITC TAN CANG', '0312397671-001', NULL, 'Nhom: OTHER'),
  ('CL000418', 'TAM CANG', '0304418649', NULL, 'Nhom: OTHER'),
  ('CL000419', 'DUC NHAN LAO BAO', '3200262745', NULL, 'Nhom: OTHER'),
  ('CL000420', 'SONG DA DONG NAI', '3602819578', NULL, 'Nhom: OTHER'),
  ('CL000421', 'CAI MEP', '3502322447', NULL, 'Nhom: OTHER'),
  ('CL000422', 'VAN PHONG', '0402004822', NULL, 'Nhom: OTHER'),
  ('CL000423', 'KIM HOANG HAO DA NANG', '0402032354', NULL, 'Nhom: OTHER'),
  ('CL000424', 'TIEP VAN XANH', '0305013204', '02822108750', 'Nhom: OTHER'),
  ('CL000425', 'CÔNG TY TNHH CẢNG PHƯỚC LONG', '0304791385', NULL, 'Nhom: OTHER'),
  ('CL000427', 'LASER AT', '0316297893', NULL, 'Nhom: OTHER'),
  ('CL000428', 'NGUYEN VAN LOT', NULL, NULL, 'Nhom: OTHER'),
  ('CL000429', 'SITC GIANG NAM', '0316669781', NULL, 'Nhom: OTHER'),
  ('CL000430', 'HANG HAI PHU HUNG', '0317165184', NULL, 'Nhom: OTHER'),
  ('CL000431', 'DAU KHI BINH THUAN', '3400374220-001', NULL, 'Nhom: OTHER'),
  ('CL000432', 'DAI QUANG MINH_Dung ma nay', '0402194404', NULL, 'Nhom: OTHER'),
  ('CL000434', 'PHUC LOC THO', '0312717441-001', NULL, 'Nhom: OTHER'),
  ('CL000435', 'CONG TY XANG DAU TAY NINH', '3900242688', NULL, 'Nhom: OTHER'),
  ('CL000436', 'CUA HANG XANG DAU SO 8', '0302596283-029', NULL, 'Nhom: OTHER'),
  ('CL000437', 'DAU KHI SAI GON TAI DONG NAI', '0310496966-005', NULL, 'Nhom: OTHER'),
  ('CL000438', 'XANG DAU PHU KHANH', '4200240380', NULL, 'Nhom: OTHER'),
  ('CL000439', 'XANG DAU DAU KHI SAI GON', '0310496966-026', NULL, 'Nhom: OTHER'),
  ('CL000440', 'HA HUY THUC', '3502404788', NULL, 'Nhom: OTHER'),
  ('CL000441', 'KIEN QUYET', '3502394480', NULL, 'Nhom: OTHER'),
  ('CL000442', 'VHT VIET NAM', '3502446467', NULL, 'Nhom: OTHER'),
  ('CL000443', 'MINH DAO', '6000403063', NULL, 'Nhom: OTHER'),
  ('CL000444', 'XANG DAU PHU KHANH PHU YEN', '4200240380-027', NULL, 'Nhom: OTHER
Dia chi: Số 138C Lê Lợi, Phường Tuy Hòa, Đắk Lắk'),
  ('CL000445', 'TAN CANG HMM', '0314916883', NULL, 'Nhom: OTHER'),
  ('CL000446', 'TTKS BENH TAT', '4300227048', NULL, 'Nhom: OTHER'),
  ('CL000447', '10B', '6101169483', NULL, 'Nhom: OTHER'),
  ('CL000448', 'CKQT BO Y', '6101083807', NULL, 'Nhom: OTHER'),
  ('CL000449', 'PETROLIMEX HN TAI BAC NINH', '0100919284-002', NULL, 'Nhom: OTHER'),
  ('CL000451', 'KCTC VINA', '3602789563', NULL, 'Nhom: OTHER'),
  ('CL000452', 'SINOKOR TAM CANG', '0314705804', NULL, 'Nhom: OTHER'),
  ('CL000455', 'TONG HOP MIEN BAC', '4900838024', NULL, 'Nhom: OTHER
Dia chi: Km6 + 300, Quốc lộ 1A, Thôn Nà Pài, Xã Đồng Đăng, Tỉnh Lạng Sơn, Việt Nam'),
  ('CL000456', 'THUONG MAI CONG MINH', '2400292738', NULL, 'Nhom: OTHER
Dia chi: Số 237 Hùng Vương, Phường Bắc Giang, Tỉnh Bắc Ninh, Việt Nam'),
  ('CL000457', 'TRUNG TAM DANG KIEM - LAM HA TRUC', '0315446937-001', NULL, 'Nhom: OTHER
Dia chi: 36 Hoàng Hữu Nam, Khu Phố Mỹ Thành, Phường Long Bình, Thành Phố Hồ Chí Minh, Việt Nam'),
  ('CL000458', 'CONG AN THANH PHO HO CHI MINH', '0301464894', NULL, 'Nhom: OTHER
Dia chi: 268 Trần Hưng Đạo, Phường Cầu Ông Lãnh, TP Hồ Chí Minh, Việt Nam'),
  ('CL000459', 'SME WORLDWIDE LOGISTICS', '0313139627', NULL, 'Nhom: OTHER
Dia chi: Số 15/7, Đường Đoàn Như Hài, Phường Xóm Chiếu, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000460', 'TAN VIET KHANH', '0301792221', NULL, 'Nhom: OTHER
Dia chi: 204B5 Nguyễn Văn Hưởng, Phường An Khánh, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000461', 'PV OIL THUA THIEN HUE', '4300603574-018', NULL, 'Nhom: OTHER
Dia chi: Thôn Phú Hải , xã Lộc Vĩnh, huyện Phú Lộc, thành phố Huế, Việt Nam'),
  ('CL000462', 'XANG DAU DANG KHOA', '4900906588', NULL, 'Nhom: OTHER
Dia chi: Thôn Bản Chang, Xã Hoàng Văn Thụ, Tỉnh Lạng Sơn, Việt Nam'),
  ('CL000463', 'NINH PHUC LOGISTICS', '0315165622', NULL, 'Nhom: OTHER
Dia chi: Số A7.20, Khu Cao ốc văn phòng và Chung cư, Số 5B Phổ Quang, Phường Tân Sơn Hòa, TP Hồ Chí Minh, Việt Nam'),
  ('CL000464', 'CONG AN XA BINH CHANH', '0319031362', NULL, 'Nhom: OTHER
Dia chi: 283 An Phú Tây - Hưng Long, xã Bình Chánh, TP.HCM, Việt Nam'),
  ('CL000465', 'XANG DAU XUAN DUONG', '4900901639', NULL, 'Nhom: OTHER
Dia chi: Cửa hàng xăng dầu, bến xe khách cửa khẩu quốc tế Hữu Nghị, Xã Đồng Đăng, tỉnh Lạng Sơn, Việt Nam'),
  ('CL000466', 'MTV PETROLIMEX NINH BINH', '0600018898', NULL, 'Nhom: OTHER
Dia chi: Km số 3, quốc lộ 1A, Phường Hoa Lư, Tỉnh Ninh Bình, Việt Nam'),
  ('CL000467', 'TRANG HIEN NET', '0401968704', NULL, 'Nhom: OTHER
Dia chi: 02 Đường Phước Tường 11, Phường An Khê, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000468', 'TNHH HAI DONG', '0301756463', NULL, 'Nhom: OTHER
Dia chi: 25 Hoàng Diệu, Phường Xóm Chiếu, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000469', 'CHUOI CUNG UNG QUOC TE HML', '0104276669', NULL, 'Nhom: OTHER
Dia chi: SỐ NHÀ 16 NGÕ 4 ĐƯỜNG VŨ TRỌNG KHÁNH, PHƯỜNG HÀ ĐÔNG, THÀNH PHỐ HÀ NỘI, VIỆT NAM'),
  ('CL000470', 'CHI NHANH PETROLIMEX QUANG NAM', '0400101683-005', NULL, 'Nhom: OTHER
Dia chi: số 104 đường Trần Qúy Cáp, Phường Bàn Thạch, TP Đà Nẵng, Việt Nam'),
  ('CL000471', 'VAN TAI TRUONG THO', '0310417812', NULL, 'Nhom: OTHER
Dia chi: 42A Hà Huy Giáp, Phường An Phú Đông , Thành Phố Hồ Chí Minh, Việt Nam'),
  ('CL000472', 'CHI NHANH PETROLIMEX BAC TAY NINH', '1100108351-105', NULL, 'Nhom: OTHER
Dia chi: Số 405, đường 30/4, khu phố 22, Phường Tân Ninh, Tỉnh Tây Ninh, Việt Nam'),
  ('CL000473', 'DUONG ANH THU', '0310751380', NULL, 'Nhom: OTHER
Dia chi: 120/6/28A Cống Lở, Phường Tân Sơn, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000474', 'DICH VU CAI BE', '1200434870', NULL, 'Nhom: OTHER
Dia chi: Số 349 Nguyễn Chí Công, Ấp 4, Xã Cái Bè, Tỉnh Đồng Tháp'),
  ('CL000475', 'O TO DAT TAN PHAT', '3601200954', NULL, 'Nhom: OTHER
Dia chi: 795, KP 4, Xa lộ Hà Nội, Phường Long Bình, Đồng Nai, Việt Nam'),
  ('CL000476', 'VAN TAI TRAN BI', '0401956434', NULL, 'Nhom: OTHER
Dia chi: 07 Phước Hòa 2, Phường Cẩm Lệ, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000478', 'VAN TAI SBS', '0316724369', NULL, 'Nhom: OTHER
Dia chi: 61/6 đường số 10, tổ 14, khu phố 8, Phường Linh Xuân, TP Hồ Chí Minh, Việt Nam'),
  ('CL000479', 'GREEN KA', '0305161770', NULL, 'Nhom: OTHER
Dia chi: 1691/3N, Quốc lộ 1A, Khu Phố 3, Phường An Phú Đông, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000480', 'PHUC XUAN', '0315752701', NULL, 'Nhom: OTHER
Dia chi: Tầng 5, Toà Nhà International Plaza, 343 Phạm Ngũ Lão, Phường Bến Thành, TP Hồ Chí Minh, Việt Nam'),
  ('CL000481', 'MTV PETROLIMEX PHU THO', '2600108866-053', NULL, 'Nhom: OTHER
Dia chi: Số 138 Đường Mê Linh, Phường Vĩnh Phúc, Tỉnh Phú Thọ, Việt Nam'),
  ('CL000482', 'VU CHI NAM - TT DANG KIEM', '3702177878-001', NULL, 'Nhom: OTHER
Dia chi: Số 19/2, khu phố Bình Đáng, Phường Bình Hòa, TP Hồ Chí Minh, Việt Nam'),
  ('CL000483', 'VAN TAI TIEN BINH PHUONG', '4001315715', NULL, 'Nhom: OTHER
Dia chi: Tổ Đoàn kết số 3, Thôn Câu Lâu Tây, Xã Nam Phước, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000486', 'JL INVESTMENT', '0314944954', NULL, 'Nhom: OTHER
Dia chi: P7-41.OT06 tòa Park 7 Vinhomes Central Park, 720A Điện Biên Phủ, Phường Thạnh Mỹ Tây, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000487', 'BAO KHANG', '0313444148', NULL, 'Nhom: OTHER
Dia chi: số 136-138 Vành Đai Tây, khu phố 4, Phường An Khánh, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000488', 'CÔNG TY TNHH ENG KONG VIỆT NAM', '3502341778', NULL, 'Nhom: OTHER
Dia chi: Số 229 Lê Duẩn, Phường Phú Mỹ, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000489', 'KHO BAI CAT LAI', '0318484715', NULL, 'Nhom: OTHER
Dia chi: 106 Bát Nàn, Phường Bình Trưng, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000490', 'HUU HUNG DUNG', '3703234536', NULL, 'Nhom: OTHER
Dia chi: Số 3 2 đường số 4A, Khu nhà ở Tân Đông Hiệp, Khu phố Chiêu Liêu, Phường Dĩ An, Thành phố Hồ Chí Minh'),
  ('CL000491', 'VAN TAI TAN PHU', '0305378357', NULL, 'Nhom: OTHER
Dia chi: 659 Lê Văn Việt, Khu phố 19, Phường Tăng Nhơn Phú, Thành phố Hồ Chí'),
  ('CL000492', 'DANG KIEM CO GIOI 61.14D', '3702914056-001', NULL, 'Nhom: OTHER
Dia chi: Số 934 đường Mỹ Phước - Tân Vạn, khu phố Bình Thung 2, Phường Đông Hòa, TP Hồ Chí Minh, Việt Nam'),
  ('CL000493', 'XANG DAU NHAT HUY', '2500198231', NULL, 'Nhom: OTHER
Dia chi: Km số 8, đường Võ Văn Kiệt, Xã Quang Minh, Thành phố Hà Nội, Việt Nam'),
  ('CL000494', 'KHO BAI PHU TAI', '0304853183-006', NULL, 'Nhom: OTHER
Dia chi: 577/5 khu phố 4, Phường An Phú, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000495', 'XANG DAU THONG THAI', '0302246948', NULL, 'Nhom: OTHER
Dia chi: 229 Quốc Lộ 1K, Khu phố 5, Phường Linh Xuân, TP Hồ Chí Minh, Việt Nam'),
  ('CL000496', 'DAI THANH', '0600444335', NULL, 'Nhom: OTHER
Dia chi: Số 54 Minh Khai, Phường Nam Định, Tỉnh Ninh Bình, Việt Nam'),
  ('CL000497', 'OKELA WOOD', '3603876346', NULL, 'Nhom: OTHER
Dia chi: Số 80, đường Tân Lập, Khu phố Tân Phong, Phường Hàng Gòn, Đồng Nai'),
  ('CL000498', 'VIET THANH CONG', '0317610974', NULL, 'Nhom: OTHER
Dia chi: Số 27 Quốc Lộ 22, ấp Xuân Thới Đông 2, Xã Xuân Thới Sơn, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000499', 'HAI DANG', '4600388423', NULL, 'Nhom: OTHER
Dia chi: Tổ dân phố Bãi Á, Xã Định Hóa, Tỉnh Thái Nguyên, Việt Nam'),
  ('CL000500', 'KINTETSU', '2500268961', NULL, 'Nhom: OTHER
Dia chi: Lô 38G1, Khu công nghiệp Quang Minh, Xã Quang Minh, TP Hà Nội, Việt Nam'),
  ('CL000501', 'DIEN TU VIEN THONG ANH DUONG', '0305320484', NULL, 'Nhom: OTHER
Dia chi: 340/16 Lê Văn Quới, Phường Bình Hưng Hòa, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000502', 'XANG DAU SO 10', '0301444626-028', NULL, 'Nhom: OTHER
Dia chi: 10/A Tổ 1A, Ấp 1, Đường ĐT747, Phường Bình Cơ, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000503', 'HAP LINH', '2300234796', NULL, 'Nhom: OTHER
Dia chi: KCN Hạp Lĩnh, Phường Hạp Lĩnh, Tỉnh Bắc Ninh, Việt Nam'),
  ('CL000505', 'DAU KHI NAM DINH', '0600759399', NULL, 'Nhom: OTHER
Dia chi: Số 36 Phùng Khắc Khoan, Phường Trường Thi, Tỉnh Ninh Bình, Việt Nam'),
  ('CL000506', 'DRONE DYNAMIC', '3502520978', NULL, 'Nhom: OTHER
Dia chi: 127 Lê Duẩn, Phường Bà Rịa, TP Hồ Chí Minh, Việt Nam'),
  ('CL000507', 'TIEP VAN DONG BINH DUONG', '3703306999', NULL, 'Nhom: OTHER
Dia chi: Thửa đất số 5505, Tờ bản đồ số 23, Khu phố 2, Phường Hòa Lợi, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000508', 'TIEP VAN SO 1 DONG NAI', '3602997972', NULL, 'Nhom: OTHER
Dia chi: VPGD (Trong khuôn viên Cty CP Cảng Đồng Nai), KP.Bình Dương, Phường Long Hưng, Tỉnh Đồng Nai, Việt Nam'),
  ('CL000509', 'GEMADEPT-TERMINAL LINK', '3500859860', NULL, 'Nhom: OTHER
Dia chi: Khu phố Tân Lộc, Phường Tân Phước, TP Hồ Chí Minh, Việt Nam'),
  ('CL000510', 'XANG DAU NINH BINH', '2700560240', NULL, 'Nhom: OTHER
Dia chi: Đường Quyết Thắng,Tổ 4, Phường Trung Sơn, Tỉnh Ninh Bình, Việt Nam'),
  ('CL000511', 'PV OIL TAI QUANG TRI', '4300603574-019', NULL, 'Nhom: OTHER
Dia chi: Quốc lộ 1A, Khóm 09, xã Diên Sanh, tỉnh Quảng Trị, Việt Nam'),
  ('CL000512', 'THAI MINH GROUP', '0106536425-002', NULL, 'Nhom: OTHER
Dia chi: Km 24+540 đường cao tốc Hà Nội ­ Hải Phòng, chợ Cống Tráng, Xã Yên Mỹ, Tỉnh Hưng Yên'),
  ('CL000513', 'XANG DAU DUC HUY', '3400401499-001', NULL, 'Nhom: OTHER
Dia chi: 720 Thôn 4, Xã Tân Minh, Tỉnh Lâm Đồng, Việt Nam'),
  ('CL000515', 'PHONG CANH SAT GIAO THONG', '0319128050', NULL, 'Nhom: OTHER
Dia chi: 02 Hoàng Văn Thái, Phường Tân Mỹ, TP Hồ Chí Minh, Việt Nam'),
  ('CL000516', 'THAI MINH GROUP', '0106536425-002', NULL, 'Nhom: OTHER
Dia chi: Km 24+540 đường cao tốc Hà Nội - Hải Phòng, chợ Cống Tráng, Xã Yên Mỹ, Tỉnh Hưng Yên, Việt Nam'),
  ('CL000517', 'NHA HANG SOS', '0313018580-002', NULL, 'Nhom: OTHER
Dia chi: Số 1, đường 30 Tháng 4, Phường Hòa Cường, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000518', 'DO DUNG THANH', NULL, NULL, 'Nhom: OTHER'),
  ('CL000519', 'MINH NHI', '3702911922', NULL, 'Nhom: OTHER
Dia chi: Thửa đất số 685, Tờ bản đồ số 220, Quốc lộ 13, kp Bình Giao, Phường Thuận Giao, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000520', 'XANG DAU THUAN LOC', '4100318932', NULL, 'Nhom: OTHER
Dia chi: QL 1A, Tổ 02, KV 8, Phường Quy Nhơn Tây, Tỉnh Gia Lai, Việt Nam'),
  ('CL000521', 'HUU HAN LOC LOI', '3300338839', NULL, 'Nhom: OTHER
Dia chi: Thôn Xuân Sơn, xã Hưng Lộc, Thành Phố Huế, Việt Nam'),
  ('CL000522', 'LE VAN SAT', NULL, NULL, 'Nhom: OTHER'),
  ('CL000523', 'de trong', NULL, NULL, 'Nhom: OTHER'),
  ('CL000524', 'PETROLIMEX LAM DONG', '5800000689-029', NULL, 'Nhom: OTHER
Dia chi: Km 845, Quốc lộ 14, Phường Nam Gia Nghĩa, Tỉnh Lâm Đồng, Việt Nam'),
  ('CL000525', 'LOGISTICS NPL', '0313103204', NULL, 'Nhom: OTHER
Dia chi: 13C Đường số 13C, Phường An Lạc, Thành Phố Hồ Chí Minh, Việt Nam'),
  ('CL000526', 'TONG HOP VIET HUNG', '4101411356', NULL, 'Nhom: OTHER
Dia chi: Số 199 Quang Trung, Phường Hoài Nhơn Bắc, Tỉnh Gia Lai, Việt Nam'),
  ('CL000527', 'LONG MINH', '0400438214', NULL, 'Nhom: OTHER
Dia chi: 48 Đoàn Thị Điểm, Phường Hải Châu, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000528', 'LOGISTICS QUANG MINH', '2300888164', NULL, 'Nhom: OTHER
Dia chi: Km152, Cao tốc Hà Nội- Bắc Giang, Khu phố Doi Sóc, Phường Từ Sơn, Tỉnh Bắc Ninh, Việt Nam'),
  ('CL000529', 'PETROLIMEX BAC NINH', '2400112897-003', NULL, 'Nhom: OTHER
Dia chi: Khu Xuân Ổ B, Phường Võ Cường, Tỉnh Bắc Ninh, Việt Nam'),
  ('CL000530', 'THAI MINH GROUP', '0106536425-003', NULL, 'Nhom: OTHER
Dia chi: Km 76+870 đường cao tốc Hà Nội -  Hải Phòng, thôn Bạch Câu, Xã An Quang, TP Hải Phòng, Việt Nam'),
  ('CL000531', 'HTL FURNITURE VIETNAM', '3703179187', NULL, 'Nhom: OTHER
Dia chi: Nhà xưởng số 5 và số 9 Cụm NXCT Hoàng Hùng, thửa đất số 678,, Xã Bàu Bàng, TP Hồ Chí Minh, Việt Nam'),
  ('CL000532', 'XANG DAU MIEN TRUNG', '2901910368', NULL, 'Nhom: OTHER
Dia chi: Thôn Hồng Hoa, Xã Đức Đồng, Tỉnh Hà Tĩnh, Việt Nam'),
  ('CL000534', 'TAM MINH NHU', '0401994542', NULL, 'Nhom: OTHER
Dia chi: 74 Nguyen Hanh street, Cam Le ward, Da Nang city, Việt Nam'),
  ('CL000535', 'DUNG TIEN', '0317190617', NULL, 'Nhom: OTHER
Dia chi: Số 113C, Quốc lộ 1A, Khu phố 7, Phường Long Bình, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000536', 'MACSTAR', '0317732806', NULL, 'Nhom: OTHER
Dia chi: 97/48 Đường số 8, Khu phố 61, Phường Tăng Nhơn Phú, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000537', 'VAN TAI D.A', '3702456871', NULL, 'Nhom: OTHER
Dia chi: Số 410 đường ĐT 743A, khu phố Trung Thắng, Phường Đông Hòa, Thành phố Hồ Chí'),
  ('CL000538', 'TMDV PHU HIEN', '0400621481', NULL, 'Nhom: OTHER'),
  ('CL000539', 'PETROLIMEX ĐAK LAK - CN PHU YEN', '6000235027-018', NULL, 'Nhom: OTHER'),
  ('CL000540', 'THUONG MAI KY THUAT DAU TU', '0300649476-024', NULL, 'Nhom: OTHER
Dia chi: Thôn Lạc Sơn 3, xã Cà Ná, tỉnh Khánh Hoà'),
  ('CL000541', 'KIEM SOAT BENH TAT TINH QUANG TRI', '3101146392', NULL, 'Nhom: OTHER
Dia chi: 164 Bà Triệu, Phường Đồng Hới, Tỉnh Quảng Trị, Việt Nam'),
  ('CL000542', 'DONG TAY', '0402239380', NULL, 'Nhom: OTHER'),
  ('CL000543', 'TAN PHAT DAT', '3600843328', NULL, 'Nhom: OTHER'),
  ('CL000544', 'OOCL VIETNAM', '0303195358', NULL, 'Nhom: OTHER
Dia chi: Phòng 501, Tầng 5, mPlaza Saigon, 39 Lê Duẩn, Phường Sài Gòn, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000545', 'XUAN KHIEM', '2700533688', NULL, 'Nhom: OTHER'),
  ('CL000547', 'CIMC LOGISTICS', '0316304332', NULL, 'Nhom: OTHER
Dia chi: Tầng 9, Tòa nhà ROX Tower, Số 180-192 đường Nguyễn Công Trứ, Phường Bến Thành, TP Hồ Chí Minh, Việt Nam'),
  ('CL000548', 'SIEU THI CONG TRINH', '0401836289', NULL, 'Nhom: OTHER
Dia chi: 576-578 Nguyễn Hữu Thọ, Phường Cẩm Lệ, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000549', 'DUC VAN', '0401928518', NULL, 'Nhom: OTHER
Dia chi: 858 Ngô Quyền, Phường An Hải, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000550', 'THACH HAN - CH TAN TUONG', '3200042531', '02333861563', 'Nhom: OTHER
Dia chi: Số 119 Nguyễn Du, Phường Nam Đông Hà, Tỉnh Quảng Trị, Việt Nam'),
  ('CL000551', 'DAU KHI BINH THUAN - CH LUONG SON', '3400374220-002', NULL, 'Nhom: OTHER
Dia chi: Thôn Tịnh Mỹ, Xã Hồng Thái, Tỉnh Lâm Đồng, Việt Nam'),
  ('CL000552', 'THIEN MINH - CH XANG DAU SO 2', '1801226392', NULL, 'Nhom: OTHER
Dia chi: QL1A, KV11, Tổ 58, Phường Hưng Phú, Thành phố Cần Thơ, Việt Nam'),
  ('CL000553', 'TIEP VAN NATRA', '3703305106', NULL, 'Nhom: OTHER
Dia chi: 435/1A, Quốc lộ 1K, Khu Phố Tân An, Phường Tân Đông Hiệp, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000554', 'AVARON VIETNAM', '0318110082', NULL, 'Nhom: OTHER
Dia chi: Căn số A-00.04, Tầng trệt, Chung cư lô C1 – 62 đường Hoàng Thế Thiện, Phường An Khánh, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000555', 'CANG MIEN NAM', '0313440288', NULL, 'Nhom: OTHER
Dia chi: Số 9 Xa Lộ Hà Nội, Phường Thủ Đức, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000556', 'CONTAINER SEN VANG', '3703329925', NULL, 'Nhom: OTHER
Dia chi: 107B đường Vũng Việt, Khu phố Đông Chiêu, Phường Dĩ An, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000557', 'OCEAN NETWORK EXPRESS', '0314689260', NULL, 'Nhom: OTHER
Dia chi: Tầng 14, Ngôi Nhà Đức, số 33, đường Lê Duẩn, Phường Sài Gòn, TP Hồ Chí Minh, Việt Nam'),
  ('CL000558', 'TAN THINH', '0700672053', NULL, 'Nhom: OTHER
Dia chi: Tổ dân phố Trịnh, Phường Duy Hà, Tỉnh Ninh Bình, Việt Nam'),
  ('CL000559', 'TRANSIMEX HI TECH PARK LOGISTICS', '0312967522', '02837206666', 'Nhom: OTHER
Dia chi: Lô BT, Đường D2, Khu Công nghệ cao Thành phố Hồ Chí Minh, Phường Tăng Nhơn Phú, TP Hồ Chí Minh, Việt Nam'),
  ('CL000560', 'NGUYEN VAN LONG - CUA KHAU LAO BAO', NULL, NULL, 'Nhom: OTHER'),
  ('CL000561', 'STRAIGHTWAY CONTAINER', '0318475661', NULL, 'Nhom: OTHER
Dia chi: Số 85, Quốc lộ 1A, Khu phố Bình Dương, Phường Long Hưng, Tỉnh Đồng Nai, Việt Nam'),
  ('CL000562', 'PETROLIMEX SAI GON - CN BINH DUONG', '0300555450-008', NULL, 'Nhom: OTHER
Dia chi: Số 8, Đường Cách Mạng Tháng 8, Phường Thủ Dầu Một, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000563', 'PETROLIMEX THANH HOA', '2800114779', NULL, 'Nhom: OTHER
Dia chi: Số 305 đường Bà Triệu, Phường Hàm Rồng, Tỉnh Thanh Hóa, Việt Nam'),
  ('CL000564', 'ME VY', '0401823057', NULL, 'Nhom: OTHER
Dia chi: 55 Lương Văn Can, Phường Cẩm Lệ, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000565', 'ES DEPOT', '3703338278', NULL, 'Nhom: OTHER
Dia chi: Số 12, Đường N1, Khu Nhà ở Thương mại dịch vụ Phú Mỹ, Tổ 23, khu phố 5, Phường Bình Dương , Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000566', 'MINH THINH', '0310066667', NULL, 'Nhom: OTHER
Dia chi: 19 Đường số 7, Khu phố 4, P.Hiệp Bình Chánh, TP. Thủ Đức, TP. Hồ Chí Minh, Việt Nam'),
  ('CL000567', 'TAN CANG - CN LONG BINH', '0305736891-001', NULL, 'Nhom: OTHER
Dia chi: Khu dịch vụ Tân Cảng - Long Bình, Phường Long Bình, Tỉnh Đồng Nai, Việt Nam'),
  ('CL000568', 'HUNG MY', '0402086014', NULL, 'Nhom: OTHER
Dia chi: 21 Phú Lộc 5, Phường Thanh Khê, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000569', 'HIEP THINH', '3400265888', NULL, 'Nhom: OTHER
Dia chi: 47 Nguyễn Thông, Phường Phú Thủy, Tỉnh Lâm Đồng, Việt Nam'),
  ('CL000570', 'BINH PHONG PHU', '0311847416-001', NULL, 'Nhom: OTHER
Dia chi: 86 đường Tô Ký, Khu phố 2, Phường Trung Mỹ Tây, TP Hồ Chí Minh, Việt Nam'),
  ('CL000571', 'DTPTM - CHI NHANH HAI PHONG', '0104498100-007', NULL, 'Nhom: OTHER
Dia chi: Bãi Traco Đình Vũ, đường 356 Đình Vũ Km2+100, Phường Đông Hải, TP Hải Phòng, Việt Nam'),
  ('CL000572', 'CHI TAM MT', '1201659323', NULL, 'Nhom: OTHER
Dia chi: 5/2A Ấp Bắc, Khu Phố 4, Phường Trung An, Tỉnh Đồng Tháp, Việt Nam'),
  ('CL000573', 'VETC_KHU QUAN LY DUONG BO II', '2900602353', NULL, 'Nhom: OTHER
Dia chi: 58 PHAN ĐĂNG LƯU, PHƯỜNG TRƯỜNG VINH, TỈNH NGHỆ AN, VIỆT NAM'),
  ('CL000574', 'VETC_KHU QUAN LY DUONG BO IV', '0301464767', NULL, 'Nhom: OTHER
Dia chi: 296 Nguyễn Văn Đậu, Phường Bình Lợi Trung, TP. Hồ Chí Minh, Việt Nam'),
  ('CL000575', 'VETC_KHU QUAN LY DUONG BO I', '0100774261', NULL, 'Nhom: OTHER
Dia chi: Số 4 phố Thành Công, phường Giảng Võ, TP Hà Nội, Việt Nam'),
  ('CL000576', 'TU HAI', '6400455764', NULL, 'Nhom: OTHER
Dia chi: 18 Hòa Phong, Xã Đắk Sắk, Tỉnh Lâm Đồng, Việt Nam'),
  ('CL000577', 'CHAN THAT', '0308365684', NULL, 'Nhom: OTHER
Dia chi: 2A Đường Số 5, Phường An Khánh, TP Hồ Chí Minh, Việt Nam'),
  ('CL000578', 'VY THINH', '0401383511', NULL, 'Nhom: OTHER
Dia chi: 34 Lưu Quang Thuận, P. Mỹ An, Q. Ngũ Hành Sơn, Tp. Đà Nẵng, Việt Nam'),
  ('CL000580', 'THU DUC - CH XANG DAU SO 22', '0301444626-023', NULL, 'Nhom: OTHER
Dia chi: Đường DT.741, Ấp Thuận Hải, Xã Thuận Lợi, Tỉnh Đồng Nai, Việt Nam'),
  ('CL000581', 'VU HIEU', '0319344580', NULL, 'Nhom: OTHER
Dia chi: 157/19 Tân Lập 2, Tổ 3, Khu phố 6, Phường Tăng Nhơn Phú, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000582', 'KIM PHUOC LAM', '1702282413', NULL, 'Nhom: OTHER
Dia chi: Số 169 A đường Tỉnh lộ 28, khu phố 2, Phường Hà Tiên, An Giang, Việt Nam'),
  ('CL000583', 'PHAM VAN GIANG', NULL, NULL, 'Nhom: OTHER'),
  ('CL000584', 'CN PETROLIMEX HAI DUONG', '0200120833-027', NULL, 'Nhom: OTHER
Dia chi: Km4, Đường Nguyễn Lương Bằng, Phường Việt Hòa, TP Hải Phòng, Việt Nam'),
  ('CL000585', 'THUAN AN PHU', '3702283682', NULL, 'Nhom: OTHER
Dia chi: Số 82C, Khu phố Hòa Long, Phường Lái Thiêu, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000586', 'MAT TROI MOC', '0313016978', NULL, 'Nhom: OTHER
Dia chi: 127 Nguyễn Du, Phường Bến Thành, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000587', 'XDCTGT 610 - CH 02', '0300425187', NULL, 'Nhom: OTHER
Dia chi: 968 Đường Đỗ Mười, Phường Linh Xuân, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000588', 'MINH DAT', '0301211244', NULL, 'Nhom: OTHER
Dia chi: F1/8N ấp 6, Hương Lộ 80, Xã Vĩnh Lộc, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000589', 'CTCP PV OIL MIEN TRUNG', '4300603574', NULL, 'Nhom: OTHER
Dia chi: Số 197, đường Cách Mạng Tháng Tám, Phường Cẩm Lệ, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000590', 'TOPASIA VIET NAM', '0316290016', NULL, 'Nhom: OTHER
Dia chi: Tòa nhà Robot, 308-308C Điện Biên Phủ, Phường Xuân Hòa, TP Hồ Chí Minh, Việt Nam'),
  ('CL000591', 'CONTAINER 3S', '3604074803', NULL, 'Nhom: OTHER
Dia chi: Số 41, Đường Võ Nguyên Giáp, Khu phố Hương Phước, Phường Phước Tân, Thành phố Đồng Nai, Việt Nam'),
  ('CL000592', 'VIETTRUCK SERVICE', '0319451529', NULL, 'Nhom: OTHER
Dia chi: 68B Đường số 14, Chu Văn An, Phường Bình Thạnh, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000593', 'TT DKPTGT HAI PHONG', '0200139288', NULL, 'Nhom: OTHER
Dia chi: Khu Hạ Đoạn 2, Phường Đông Hải, TP Hải Phòng, Việt Nam'),
  ('CL000594', 'GIAI PHAP CONT VN', '0316941902', NULL, 'Nhom: OTHER
Dia chi: 2A Đường số 5, Phường An Khánh, TP. Hồ Chí Minh, Việt Nam'),
  ('CL000595', 'KHANH VAN', '3703372568', NULL, 'Nhom: OTHER
Dia chi: Thửa đất số 301, tờ bản đồ số 49, tổ 3, khu phố Khánh Tân, Phường Tân Hiệp, TP Hồ Chí Minh, Việt Nam'),
  ('CL000598', 'QUOC THINH', '0302608588', NULL, 'Nhom: OTHER
Dia chi: 213/25 Đường D2, Phường Thạnh Mỹ Tây,Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000599', 'TTC CHAU THANH', '0318558808', NULL, 'Nhom: OTHER
Dia chi: 253 Hoàng Văn Thụ, Phường Tân Sơn Hòa, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000600', 'HAI VAN', '3100316323', NULL, 'Nhom: OTHER
Dia chi: TDP Giao Tế, Phường Đồng Hới, Tỉnh Quảng Trị, Việt Nam'),
  ('CL000601', 'GIAO DUC DA NANG', '0401921953', NULL, 'Nhom: OTHER
Dia chi: 25 Duy Tân, Phường Hòa Cường, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000602', 'PETROLIMEX VUNG TAU', '0300555450-009', NULL, 'Nhom: OTHER
Dia chi: Số 12, Đường Hoàng Hoa Thám, Phường Vũng Tàu, TP Hồ Chí Minh, Việt Nam'),
  ('CL000603', 'RONG DAI CHAU A', '0318212870', NULL, 'Nhom: OTHER
Dia chi: 12/18A Hoàng Hoa Thám, Phường Gia Định, Thành Phố Hồ Chí Minh, Việt Nam'),
  ('CL000604', 'DOAN LOC PHAT', '0401989292', NULL, 'Nhom: OTHER
Dia chi: 26 Phan Khoang - Phường An Khê - Thành Phố Đà Nẵng - Việt Nam'),
  ('CL000605', 'TU LINH', '0313643922', NULL, 'Nhom: OTHER
Dia chi: 96 Đường S9, Phường Tây Thạnh, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000607', 'HAM TAN', '3401132577', NULL, 'Nhom: OTHER
Dia chi: Thôn 2, Xã Hàm Tân, Lâm Đồng, Việt Nam'),
  ('CL000608', 'TRUONG MINH', '8030438067', NULL, 'Nhom: OTHER
Dia chi: Thôn 17, Xã Đạ Huoai, Tỉnh Lâm Đồng, Việt Nam'),
  ('CL000609', 'DANH NAM', '3702296522', NULL, 'Nhom: OTHER
Dia chi: Số 333 Đường ĐT 748, Tổ 1, Ấp Bến Liễu, Phường Phú An, Thành Phố Hồ Chí Minh, Việt Nam'),
  ('CL000610', 'AN SON BD LOG', '3702395178', NULL, 'Nhom: OTHER
Dia chi: Thửa đất số 289, tờ bản đồ số DC9(C2), khu phố An Phú, Phường Thuận An, Thành Phố Hồ Chí Minh, Việt Nam'),
  ('CL000611', 'PETRO LAM DONG - CH37', '5800000689', NULL, 'Nhom: OTHER
Dia chi: Số 2 Hùng Vương, Phường Lâm Viên - Đà Lạt, Tỉnh Lâm Đồng, Việt Nam'),
  ('CL000612', 'HAI LONG', '0315152912', NULL, 'Nhom: OTHER
Dia chi: 46-48 Tạ Hiện, Phường Cát Lái, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000613', 'VT-XD HAI DUONG', '0800295828', NULL, 'Nhom: OTHER
Dia chi: Số nhà 677, đại lộ Lê Thanh Nghị, Phường Lê Thanh Nghị, Thành phố Hải Phòng, Việt Nam'),
  ('CL000614', 'PHAM DINH', '0401769233', NULL, 'Nhom: OTHER
Dia chi: 434 Ông Ích Khiêm, Phường Thanh Khê, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000615', 'MINH MINH TAN', '3701856002', NULL, 'Nhom: OTHER
Dia chi: Số 75, đường Lào Cai, khu 05, Phường Thủ Dầu Một, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000616', 'HAN HUNG', '1201673092', NULL, 'Nhom: OTHER
Dia chi: Ấp Bình Thanh, Xã Ngũ Hiệp, Tỉnh Đồng Tháp, Việt Nam'),
  ('CL000617', 'DAU KHI HN - CN LAO CAI', '0105029292-004', NULL, 'Nhom: OTHER
Dia chi: Đường Lê Thanh, Phường Cam Đường, Tỉnh Lào Cai, Việt Nam'),
  ('CL000618', 'HOANG PHI', '3603579463', NULL, 'Nhom: OTHER
Dia chi: Số 247 Phạm Văn Diêu, khu phố Tân Hạnh 3, Phường Biên Hòa, Thành phố Đồng Nai, Việt Nam'),
  ('CL000619', 'TIEP VAN MIEN NAM', '0309788756-001', NULL, 'Nhom: OTHER
Dia chi: Số 001, tổ 11A, Khu 550, khu phố Bình Đức 3, Phường Bình Hòa, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000620', 'THANH DUY', '0200717316', NULL, 'Nhom: OTHER
Dia chi: Số 95 Nguyễn Công Hoan, Phường Gia Viên, Thành phố Hải Phòng, Việt Nam'),
  ('CL000621', 'HUA THANH TRUONG/STK: 1023662241/NH: VCB', NULL, NULL, 'Nhom: OTHER
Dia chi: Đà Nẵng, Việt Nam'),
  ('CL000622', 'TTV', '0202093511', NULL, 'Nhom: OTHER
Dia chi: Số 9B ngõ 89 đường Máng Nước, tổ dân phố Cái Tắt, Phường An Hải, Thành phố Hải Phòng, Việt Nam'),
  ('CL000623', 'SITC - DINH VU', '0201145622', NULL, 'Nhom: OTHER
Dia chi: Cảng Đình Vũ, Phường Đông Hải, TP Hải Phòng, Việt Nam'),
  ('CL000624', 'AN PHUOC', '0301722256-002', NULL, 'Nhom: OTHER
Dia chi: Số 294/A, Quốc lộ 51, Khu 2, Ấp 7, Xã An Phước, Thành Phố Đồng Nai, Việt Nam'),
  ('CL000625', 'DAU KHI BAC LIEU - CN VINH LONG', '1900291730-030', NULL, 'Nhom: OTHER
Dia chi: Số 187A Hùng Vương, Phường Hòa Thuận, Tỉnh Vĩnh Long, Việt Nam'),
  ('CL000626', 'HO BUU', '3701629627', NULL, 'Nhom: OTHER
Dia chi: Số 99, Đường Huỳnh Văn Luỹ, Khu phố 3, Phường Phú Lợi, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000627', 'LIEN CHIEU XANH', '0401793606', NULL, 'Nhom: OTHER
Dia chi: Đường số 11B, Cụm Công nghiệp Thanh Vinh mở rộng, Phường Liên Chiểu, Thành Phố Đà Nẵng, Việt NamĐường số 11B, Cụm Công nghiệp Thanh Vinh mở rộng, Phường Liên Chiểu, Thành Phố Đà Nẵng, Việt Nam'),
  ('CL000628', 'CANG PHUOC AN', '3601010336', NULL, 'Nhom: OTHER
Dia chi: Cảng Phước An, Ấp Bà Trường, Xã Phước An, Thành phố Đồng Nai, Việt Nam'),
  ('CL000629', 'TAN HIEP - CHXD 540', '0301722256-015', NULL, 'Nhom: OTHER
Dia chi: 540 Lê Đức Anh , Khu phố 20 , Phường Bình Tân, TP Hồ Chí Minh, Việt Nam'),
  ('CL000630', 'HOANG THONG HP', '0202313848', NULL, 'Nhom: OTHER
Dia chi: Số 223 Đường Chùa Vẽ, Phường Đông Hải, Thành phố Hải Phòng, Việt Nam'),
  ('CL000631', 'TIEP VAN PRC', '0317201065', NULL, 'Nhom: OTHER
Dia chi: 290 Hai Bà Trưng, Phường Tân Định, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000632', 'MAI VY PHAT', '042178011321', NULL, 'Nhom: OTHER
Dia chi: Thửa 483, tờ 31, tổ 21, khu phố Cầu Hang, Phường Biên Hòa, Thành Phố Đồng Nai, Việt Nam'),
  ('CL000633', 'HOANG DAT', '3703470068', NULL, 'Nhom: OTHER
Dia chi: 268/1A đường Quốc Lộ 1K, khu phố Tân An, Phường Tân Đông Hiệp, TP Hồ Chí Minh, Việt Nam'),
  ('CL000634', 'XD NAM DUONG', '0801175851', NULL, 'Nhom: OTHER
Dia chi: Thôn Tân Hưng, Xã Lai Khê, Thành phố Hải Phòng, Việt Nam'),
  ('CL000635', 'RANG DONG', '0305459493', NULL, 'Nhom: OTHER
Dia chi: 135/17/37 Nguyễn Hữu Cảnh, Phường Thạnh Mỹ Tây, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000636', 'TOYOTA PGS QUANG TRI', '3200698161', NULL, 'Nhom: OTHER
Dia chi: Quốc lộ 1A, Thôn Phú Mỹ Kiên, Xã Ái Tử, Tỉnh Quảng Trị, Việt Nam'),
  ('CL000637', 'TIEP VAN SO 1', '0300602277', NULL, 'Nhom: OTHER
Dia chi: Số 13 Đường Bến Nghé, Phường Tân Thuận, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000638', 'KIM LONG', '3703482955', NULL, 'Nhom: OTHER
Dia chi: 19/1 ĐT 747B, Khu phố Bình Phước B, Phường Thuận Giao, TP Hồ Chí Minh, Việt Nam'),
  ('CL000639', '8 FREIGHT VN', '0318697054', NULL, 'Nhom: OTHER
Dia chi: 2-2B Lam Sơn, Phường Tân Sơn Hòa, TP Hồ Chí Minh, Việt Nam'),
  ('CL000640', 'AN NHAN PHAT', '0402275847', NULL, 'Nhom: OTHER
Dia chi: 48 Vũ Miên, Tổ 6 Thôn Miếu Bông, Phường Hòa Xuân, Thành Phố Đà Nẵng, Việt Nam'),
  ('CL000641', 'GREATING FORTUNE SG', '3703442705', NULL, 'Nhom: OTHER
Dia chi: Thửa Đất Số 1634, Tờ Bản Đồ Số 30, Đường Suối Sệp, Khu Phố Tân An, Phường Tân Đông Hiệp, Thành Phố Hồ Chí Minh, Việt Nam'),
  ('CL000642', 'MINH NGUYEN VINA', '3703480637', NULL, 'Nhom: OTHER
Dia chi: 1471/E3.1, Đường Nguyễn Thị Minh Khai, Khu phố Tân Phú 1, Phường Tân Đông Hiệp, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000643', 'BINH QUY DP', '3703345067', NULL, 'Nhom: OTHER
Dia chi: Lô CX018, Đường 26, Khu D, Khu công nghiệp Sóng Thần 2, Phường Dĩ An, TP Hồ Chí Minh, Việt Nam'),
  ('CL000644', 'GOLDENWAY', '3703403840', NULL, 'Nhom: OTHER
Dia chi: Số 6 1A/4 6, Đường D1, Khu phố Bình Phước B, Phường An Phú, Thành Phố Hồ Chí Minh, Việt Nam'),
  ('CL000645', 'XD TAN VAN_CN1', '0314562539-004', NULL, 'Nhom: OTHER
Dia chi: Thửa đất số 1238, tờ bản đồ số 7 B-T, khu phố Ngãi Thắng, Phường Đông Hòa, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000646', 'HUYNH GIA-CN PHU MY', '0307210046-003', NULL, 'Nhom: OTHER
Dia chi: Số 01 ĐX 034 - Mỹ Phước Tân Vạn, Phường Bình Dương, Thành Phố Hồ Chí Minh, Việt Nam'),
  ('CL000647', 'FT', '0202014301', NULL, 'Nhom: OTHER
Dia chi: Số 595 Đường Đông Hải, Phường Đông Hải, Thành Phố Hải Phòng, Việt Nam'),
  ('CL000648', 'DOAN THANG', '0317905287', NULL, 'Nhom: OTHER
Dia chi: 52 Đường 46 CL, Phường Cát Lái, TP Hồ Chí Minh, Việt Nam'),
  ('CL000649', 'PETROLIMEX BINH PHUOC - CH 79', '3600247325-040', NULL, 'Nhom: OTHER
Dia chi: Số 298, Quốc lộ 14, Phường Bình Phước, Thành Phố Đồng Nai, Việt Nam'),
  ('CL000650', 'HUNG DUNG HT', '0202276226', NULL, 'Nhom: OTHER
Dia chi: Số 30 đường Chùa Vẽ, Tổ dân phố Đoạn Xá  7 Phường Đông Hải ,Thành phố Hải Phòng, Việt Nam'),
  ('CL000651', 'HUNG 73', '3703283124', NULL, 'Nhom: OTHER
Dia chi: 27 Lê Văn Mầm, khu phố Đông Thành, Phường Tân Đông Hiệp, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000652', 'CN RONG DAI CHAU A', '0318212870-001', NULL, 'Nhom: OTHER
Dia chi: 349 Nguyễn Lương Bằng, Phường Liên Chiểu, TP Đà Nẵng, Việt Nam'),
  ('CL000653', 'SAO A D.C', '0201147203', NULL, 'Nhom: OTHER
Dia chi: Lô đất KB2.3 và KB3.3, khu công nghiệp MP Đình Vũ, Thành phố Hải Phòng, Việt Nam'),
  ('CL000654', 'G-ERA', '0202302282', NULL, 'Nhom: OTHER
Dia chi: Số nhà 33/442, Tổ dân phố An Trang, Phường An Hải, Thành phố Hải Phòng, Việt Nam'),
  ('CL000655', 'XNK NHAT MINH 68', '3200728955', NULL, 'Nhom: OTHER
Dia chi: Số 129/10 Quốc Lộ 9, Trung Chín, xã Lao Bảo, Tỉnh Quảng Trị, Việt Nam'),
  ('CL000656', 'TRUONG NHAN PHAT', '0201652005', NULL, 'Nhom: OTHER
Dia chi: Tổ dân phố Đại Đồng (tại nhà Ông Đào Thế Hùng), Phường Hồng An, TP Hải Phòng, Việt Nam'),
  ('CL000657', 'SONG THAN', '3703127319', NULL, 'Nhom: OTHER
Dia chi: 91A Đường Vũng Việt, Khu Phố Đông Chiêu, Phường Dĩ an, Thành Phố Hồ Chí Minh, Việt Nam'),
  ('CL000658', 'TUONG NGUYEN', '0201792098', NULL, 'Nhom: OTHER
Dia chi: Tầng 1, tòa nhà Thành Đạt, số 3 Lê Thánh Tông, Phường Ngô Quyền, Thành phố Hải Phòng, Việt Nam'),
  ('CL000659', 'HAI NAM', '0201019346', NULL, 'Nhom: OTHER
Dia chi: Lô 267 N13 Tổ dân phố số 15, Phường Hải An, Thành phố Hải Phòng, Việt Nam'),
  ('CL000660', 'SON TUNG', '0201960602', NULL, 'Nhom: OTHER
Dia chi: Số 19/201 Lạch Tray, Phường Gia Viên, Thành phố Hải Phòng, Việt Nam'),
  ('CL000661', 'CARGO HP', '0202136652', NULL, 'Nhom: OTHER
Dia chi: Lô đất KB2.3 và KB3.3, Khu công nghiệp MP Đình Vũ, Thành phố Hải Phòng, Việt Nam'),
  ('CL000662', 'DAO HUNG', '3200243573', NULL, 'Nhom: OTHER
Dia chi: Khóm Trung Chín, Xã Lao Bảo, Tỉnh Quảng Trị, Việt Nam'),
  ('CL000663', 'LIEN KET VANG', '0200994849', NULL, 'Nhom: OTHER
Dia chi: Số 445 Đà Nẵng, Phường Đông Hải, Thành phố Hải Phòng, Việt Nam'),
  ('CL000664', 'DAU KHI HUNG YEN', '1000808141', NULL, 'Nhom: OTHER
Dia chi: Số 392A, Đường Hoàng Văn Thái, Phường Trần Lãm, Tỉnh Hưng Yên, Việt Nam'),
  ('CL000665', 'DAI DUONG XANH', '0202040358', NULL, 'Nhom: OTHER
Dia chi: Phòng 13+14 tầng 4, tòa nhà Thành Đạt, số 3 Lê Thánh Tông, Phường Ngô Quyền, Thành phố Hải Phòng, Việt Nam'),
  ('CL000666', 'THANH HONG GARAGE', '3101157605', NULL, 'Nhom: OTHER
Dia chi: Xóm 1, Thôn Hà Thiệp, Xã Quảng Ninh, Tỉnh Quảng Trị'),
  ('CL000667', 'WONDERLINK', '0402300853', NULL, 'Nhom: OTHER
Dia chi: 630 - 632 Ngô Quyền, Phường An Hải, TP Đà Nẵng, Việt Nam'),
  ('CL000668', 'MAI NGUYEN LOGISTICS', '0201597121', NULL, 'Nhom: OTHER
Dia chi: Số 3 ngõ 60 đường Trần Nhân Tông, phường Kiến An, Thành phố Hải Phòng, Việt Nam'),
  ('CL000669', 'MEDLOG PHU MY ICD', '3502501333', NULL, 'Nhom: OTHER
Dia chi: Khu công nghiệp chuyên sâu Phú Mỹ 3, Phường Tân Phước, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000670', 'LOGISTICS CLS', '0202206892', NULL, 'Nhom: OTHER
Dia chi: Tổ dân phố 5 Do Nha (tại nhà ông Lê Văn Minh), Phường An Dương, Thành phố Hải Phòng, Việt Nam'),
  ('CL000671', 'LOGISTICS HS', '0110441286', NULL, 'Nhom: OTHER
Dia chi: Tầng 2 Tòa nhà Startup Tower, ngõ 91 đường Đại Mỗ, Phường Đại Mỗ, Thành phố Hà Nội, Việt Nam'),
  ('CL000672', 'QC&TK NHAT MINH', '0402333457', NULL, 'Nhom: OTHER
Dia chi: 266 Bắc Sơn, Phường An Khê, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000673', 'TAN TIEN LONG', '4101631094', NULL, 'Nhom: OTHER
Dia chi: 164-166 Lạc Long Quân, Phường Quy Nhơn Bắc, Tỉnh Gia Lai, Việt Nam'),
  ('CL000674', 'XD TRUNG THANH', '3500565941-004', NULL, 'Nhom: OTHER
Dia chi: Số 1594 đường 30/4, Phường Phước Thắng, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000675', 'GREATING FORTUNE CONTAINER VN', '0201209259', NULL, 'Nhom: OTHER
Dia chi: Lô KB4, Khu công nghiệp MP Đình Vũ, Phường Đông Hai, Thành phố Hải Phòng, Việt Nam'),
  ('CL000676', 'DAU KHANG VIET', '0313838939', NULL, 'Nhom: OTHER
Dia chi: 24 Đường số 5, Khu dân cư Tấn Trường, Khu phố 2, Phường Phú Thuận, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000677', 'CHXD 27 - VLXD BINH DUONG', '3700148529', NULL, 'Nhom: OTHER
Dia chi: Số 306 Đường ĐT 743, Khu phố Trung Thắng, Phường Đông Hòa, Thành phố Hồ Chí Minh'),
  ('CL000678', 'CN SO 03 - CTCP VT-XD', '0300450673-065', NULL, 'Nhom: OTHER
Dia chi: 178/9M Điện Biên Phủ, Phường Thạnh Mỹ Tây, TPHCM, Việt Nam'),
  ('CL000679', 'VAN TAI CAT LAI', '0314960353', NULL, 'Nhom: OTHER
Dia chi: 21/1 Đường Xô Viết Nghệ Tĩnh, Phường Gia Định, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000681', 'CN SO 24 - XD CHAU LOAN', '3600263849-022', NULL, 'Nhom: OTHER
Dia chi: Thôn 2, Xã Xuân Sơn, TP. Hồ Chí Minh, Việt Nam'),
  ('CL000682', 'MTV XD HUU NGHI', '0300452670', NULL, 'Nhom: OTHER
Dia chi: Số 38, đường DT 743,Khu phố Ngãi Thắng,Phường Đông Hòa, Thành Phố Hồ Chí Minh,Việt Nam'),
  ('CL000683', 'XNK THANH LOI', '4900219641', NULL, 'Nhom: OTHER
Dia chi: Khối Pò Đứa - Pò Mỏ, Phường Đông Kinh, Tỉnh Lạng Sơn, Việt Nam'),
  ('CL000684', 'CN HANG HAI HCM', '0200580975-002', NULL, 'Nhom: OTHER
Dia chi: Tầng 3, Tòa nhà Lexington, 67 Mai Chí Thọ, Phường Bình Trưng, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000685', 'DICH VU O TO HAI AU', '0111500128', NULL, 'Nhom: OTHER
Dia chi: Tầng 5, Tháp Tây, tòa Hancorp Plaza, số 72 đường Trần Đăng Ninh, Phường Nghĩa Đô, TP Hà Nội, Việt Nam'),
  ('CL000686', 'HKD PHAM VAN HIEN', '033078010787', NULL, 'Nhom: OTHER
Dia chi: Thôn Từ Tây, xã Việt Yên, tỉnh Hưng Yên, Việt Nam'),
  ('CL000687', 'VIET PHUONG', '0200436354', NULL, 'Nhom: OTHER
Dia chi: Số 4/21/50/286 Lê Lai, phường Ngô Quyền, TP Hải Phòng, Việt Nam'),
  ('CL000688', 'QC PHI BAO', '3401231793', NULL, 'Nhom: OTHER
Dia chi: 238 đường 3 tháng 2, thôn Võ Đắt, xã Hoài Đức, Tỉnh Lâm Đồng, Việt Nam'),
  ('CL000689', 'SMARTLOG', '0313202685', NULL, 'Nhom: OTHER
Dia chi: 70 Trường Sa, Phường Gia Định, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000690', 'ECOBOX EXCHANGE', '0319177770', NULL, 'Nhom: OTHER
Dia chi: Tầng 4, Tòa nhà số 95, Đường Điện Biên Phủ, Phường Tân Định, Thành Phố Hồ Chí Minh'),
  ('CL000691', 'VINH AUTO CAR', '0402315151', NULL, 'Nhom: OTHER
Dia chi: 38 Phạm Hùng, Phường Hòa Xuân, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000692', 'DAI HOANG LONG', '0202022729', NULL, 'Nhom: OTHER
Dia chi: 15/180 Đường Phương Lưu, Phường Ngô Quyền, Thành phố Hải Phòng, Việt Nam'),
  ('CL000693', 'PCSGT-CA TP HAI PHONG', '0202264460', NULL, 'Nhom: OTHER
Dia chi: 14 Phan Chu Trinh, Phường Hồng Bàng, Thành phố Hải Phòng, Việt Nam'),
  ('CL000694', 'CA PHUONG LE ICH MOC', '0202296293', NULL, 'Nhom: OTHER
Dia chi: Tổ dân phố Chính Mỹ 6, Phường Lê Ích Mộc, TP Hải Phòng, Việt Nam'),
  ('CL000695', 'DVKT TAN CANG', '0305736891', NULL, 'Nhom: OTHER
Dia chi: 722 Điện Biên Phủ, phường Thạnh Mỹ Tây, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000696', 'CHXD SO 1 BINH DUONG', '0300649476-044', NULL, 'Nhom: OTHER
Dia chi: Số 94 đường ĐT 744, khu phố Dòng Sỏi, phường Tây Nam, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000697', 'OTO DAI NAM', '3703345229', NULL, 'Nhom: OTHER
Dia chi: Số 119, Đường Bình Thung,Khu phố Bình Thung 2, Phường Đông Hòa, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000698', 'SITC VIET NAM', '0200919545', NULL, 'Nhom: OTHER
Dia chi: P.419 420 421, TD-business Center, lô 20a Lê Hồng Phong, Phường Gia Viên, Thành phố Hải Phòng, Việt Nam'),
  ('CL000699', 'KIM LONG', '0301427324', NULL, 'Nhom: OTHER
Dia chi: 40/36 Trần Hưng Đạo, Phường Cầu Ông Lãnh, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000700', 'CN PETROLIMEX TRA VINH - CH120', '1500207131-104', NULL, 'Nhom: OTHER
Dia chi: Số 24 Nguyễn Thị Minh Khai, Phường Trà Vinh, Tỉnh Vĩnh Long, Việt Nam'),
  ('CL000701', 'CH40 PETROLIMEX TAY NINH', '1100108351', NULL, 'Nhom: OTHER
Dia chi: Số 10, đường Trà Quý Bình, Phường Long An, tỉnh Tây Ninh, Việt Nam'),
  ('CL000702', 'JINJIANG SHIPPING CN HAI PHONG', '0318076561-001', NULL, 'Nhom: OTHER
Dia chi: Phòng 208-211, Lầu 2, Tòa nhà Thành Đạt 3, số 4 đường Lê Thánh Tông, Phường Ngô Quyền, Thành phố Hải Phòng, Việt Nam'),
  ('CL000703', 'VETC_KHU QUAN LY DUONG BO III', '0400261327', NULL, 'Nhom: OTHER
Dia chi: Số 16 Lý Tự Trọng, Phường Hải Châu, Thành phố Đà Nẵng'),
  ('CL000004', 'VAN TAI THAI KHOA', '0401699113', NULL, 'Nhom: TRUCKER
Dia chi: 219 ONG ICH DUONG, KHUE TRUNG WARD, CAM LE DIST, DA NANG, VIET NAM'),
  ('CL000005', 'HOANG NGUYEN', '0303697936', NULL, 'Nhom: TRUCKER
Dia chi: 2222 National Highway 1A, Quarter 1, Tan Chanh Hiep Ward, District 12, Ho Chi Minh City, Vietnam'),
  ('CL000006', 'XE HOANG BAO ANH', '0401287416', NULL, 'Nhom: TRUCKER
Dia chi: 251 TỐ HỮU – Q.CẨM LỆ - TP.ĐÀ NẴNG'),
  ('CL000007', 'TAN MINH HOANG', '0400383269', NULL, 'Nhom: TRUCKER
Dia chi: 350 HOÀNG DIỆU - TPĐN'),
  ('CL000008', 'NGUYEN SON TRA', '0401603661', NULL, 'Nhom: TRUCKER
Dia chi: TỔ 2, PHƯỜNG THANH KHÊ TÂY, QUẬN THANH KHÊ, THÀNH PHỐ ĐÀ NẴNG, VIỆT NAM'),
  ('CL000009', 'NHUT LIEN', '0400547372', NULL, 'Nhom: TRUCKER
Dia chi: K259/56 Nguyen Van Linh, Thac Gian Ward, Thanh Khe Dist, Da Nang'),
  ('CL000010', 'DANALOG', '0400999731', NULL, 'Nhom: TRUCKER
Dia chi: Yết Kiêu -  Thọ Quang Ward- Sơn Trà District - Da Nang city'),
  ('CL000011', 'VAN TAI TUNG KHANH', '0200466461', NULL, 'Nhom: TRUCKER
Dia chi: so 6c Nguyen Trai, Phuong May To , Quan Ngo Quyen, thanh pho Hai Phong'),
  ('CL000012', 'VAN TAI TLT - DA NANG', '0401355017', NULL, 'Nhom: TRUCKER
Dia chi: 721 Ngô Quyền, P An Hải Bắc, Quận Sơn Trà, TP Đà Nẵng, Việt Nam'),
  ('CL000013', 'PHUC GIA MANH', '0304297458', NULL, 'Nhom: TRUCKER
Dia chi: 45/2 Trịnh Hòai Đức, Phường Hiệp Phú, Quận 9, TP. Hồ Chí Minh'),
  ('CL000014', 'BINH HUONG THINH', '0401504607', NULL, 'Nhom: TRUCKER
Dia chi: 17 Nguyễn Thuật, Phường An Khê, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000017', 'VAN TAI DONG THUAN', '0315278376', NULL, 'Nhom: TRUCKER
Dia chi: 104/3 / 3Y, Hamlet 3, Dong Thanh Commune, Hoc Mon District, Ho Chi Minh City, Vietnam'),
  ('CL000019', 'VAN TAI TAN CUONG PHAT', '0201280195', NULL, 'Nhom: TRUCKER
Dia chi: No 292 Da Nang, Van My Ward, Ngo Quyen District, Hai Phong city'),
  ('CL000020', 'VAN TAI DUC LUAN', '0201145037', NULL, 'Nhom: TRUCKER
Dia chi: No 25A2/655 Nguyen Van Linh, Vinh Niem Ward, Le Chan District, Hai Phong city, Viet Nam'),
  ('CL000021', 'DANATRANS DUNG QUAT', '4300334120', NULL, 'Nhom: TRUCKER
Dia chi: Khu kinh te Dung Quat, Thuan Phuoc, Xa Binh Thuan, Huyen Binh Son, Quang Ngai, VN'),
  ('CL000022', 'CHINTHO', '4101063476', NULL, 'Nhom: TRUCKER
Dia chi: NO. 135A TRAN HUNG DAO - PHUONG LE LOI - THANH PHO QUY NHON - BINH DINH'),
  ('CL000023', 'VAN TAI HA MINH ANH', '0106706349', NULL, 'Nhom: TRUCKER
Dia chi: So 121 Khu 3 Duong Quoc lo 2, xa Phu Minh, huyen Soc Son, thanh pho Ha Noi, Viet Nam'),
  ('CL000024', 'HOA VINH', '0201643184', NULL, 'Nhom: TRUCKER
Dia chi: So 37/591 Thien Loi, phuong Vinh Niem, quan Le Chan, thanh pho Hai Phong, Viet Nam'),
  ('CL000025', 'THP CO., LTD. -TM DV VAN TAI', '4101559497', NULL, 'Nhom: TRUCKER
Dia chi: Thôn Vân Sơn, Phường An Nhơn, Tỉnh Gia Lai, Việt Nam'),
  ('CL000026', 'TRINH DUYEN', '0201209139', NULL, 'Nhom: TRUCKER
Dia chi: So 177 Chua Ve, Phuong Dong Hai 2, Quan Hai An, Thanh pho Hai Phong'),
  ('CL000027', 'NGUYEN PHAT TAI', '0401739172', NULL, 'Nhom: TRUCKER
Dia chi: 116 Huyền Trân Công Chúa, Phường Hoà Hải, Quận Ngũ Hành Sơn, Thành phố Đà Nẵng'),
  ('CL000028', 'DINH DIEM', '4300536550', NULL, 'Nhom: TRUCKER
Dia chi: 42 Le Trung Dinh, Nghia Chanh, Quang Ngai city, Quang Ngai province, Viet Nam'),
  ('CL000030', 'BA THANH', '4300640914', NULL, 'Nhom: TRUCKER
Dia chi: Thôn 1, Xã Đức Nhuận, Huyện Mộ Đức , Tỉnh Quảng Ngãi'),
  ('CL000032', 'VAN TAI PROSHIP', '0313214289', NULL, 'Nhom: TRUCKER
Dia chi: 602/45D Điện Biên Phủ , Phường 22, Quận Bình Thạnh, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000033', 'TIEN QUAN MINH', '0401982931', NULL, 'Nhom: TRUCKER
Dia chi: 43 Dương Tự Minh, Phường An Hải,Thành Phố Đà Nẵng, Việt Nam'),
  ('CL000034', 'TAN MINH TOAN', '0400384093', NULL, 'Nhom: TRUCKER
Dia chi: 84 Điện Biên Phủ, phường Chính Gián, Quận Thanh Khê, Thành phố Đà Nẵng, VN'),
  ('CL000035', 'VAN TAI THIEN BINH', '0109919546', NULL, 'Nhom: TRUCKER
Dia chi: Thôn Mạnh Trữ - xã Chu Phan - huyện Mê Linh - Hà Nội'),
  ('CL000036', 'SMART LINK JSC-VAN TAI THONG MINH', '0201957913', NULL, 'Nhom: TRUCKER
Dia chi: Số 6 tổ 1 Nam Sơn, Phường Đằng Giang, Quận Ngô Quyền, Thành phố Hải Phòng, Việt Nam'),
  ('CL000037', 'V.P JSC-CO PHAN VP', '0200648126', NULL, 'Nhom: TRUCKER
Dia chi: Tổ dân phố 6 Do Nha (tại nhà ông Mai Trọng Nha), phường An Dương, thành phố Hải Phòng, Việt Nam'),
  ('CL000038', 'TAM TRI THINH', '0401557542', NULL, 'Nhom: TRUCKER
Dia chi: 29 Hồ Sĩ Phấn, Phường Mân Thái, Quận Sơn Trà, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000039', 'VAN TAI VIE TRANSPORT', '0402085116', NULL, 'Nhom: TRUCKER
Dia chi: 721 Ngô Quyền, Phường An Hải, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000040', 'XUAT NHAP KHAU N&M', '0317466054', NULL, 'Nhom: TRUCKER
Dia chi: 381/10 Đường Bình Mỹ, Xã Bình Mỹ, Huyện Củ Chi, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000041', 'TRAN DANG TRANSP', '0402158075', NULL, 'Nhom: TRUCKER
Dia chi: 471 Trưng Nữ Vương, Phường Hoà Cường, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000042', 'SAI GON LOGISTICS', '0316509266', NULL, 'Nhom: TRUCKER
Dia chi: TANG 1, TOA NHA 168, SO 04 NGUYEN THI MINH KHAI, PHUONG DA KAO, QUAN 1, TP. HO CHI MINH'),
  ('CL000044', 'GREEN LINE - DUONG XANH', '4001261097', NULL, 'Nhom: TRUCKER
Dia chi: Thôn Phú Trường, Xã Tam Mỹ, TP Đà Nẵng, Việt Nam'),
  ('CL000046', 'BINH HAI', '0401096588', NULL, 'Nhom: TRUCKER
Dia chi: 260/6 Duong Dinh Nghe, Phuong An Hai Bac, Quan Son Tra, Thanh pho Da Nang, Viet Nam'),
  ('CL000048', 'THANH XUAN', '4100487994', NULL, 'Nhom: TRUCKER
Dia chi: So 03 duong Nguyen Lu, phuong Ngo May, thanh pho Quy Nhon, Binh Dinh, Viet Nam'),
  ('CL000049', 'KIM DAI PHUC', '4001032065', NULL, 'Nhom: TRUCKER
Dia chi: 81 Nguyen Nhuoc Phap, phuong Hoa Minh, quan Lien Chieu, Thanh pho Da Nang, Viet Nam'),
  ('CL000050', 'VAN PHUC GIA', '4001116452', NULL, 'Nhom: TRUCKER
Dia chi: To 3, Khoi Ngan Giang, phuong Dien Ngoc, thi xa Dien Ban, tinh Quang Nam, Viet Nam'),
  ('CL000051', 'HƯNG VINH', '0400513165', NULL, 'Nhom: TRUCKER
Dia chi: 77 Nguyen Mau Tai Street, Hoa Xuan Ward, Cam Le District, Da Nang City, Vietnam'),
  ('CL000052', 'MAI CUONG', '0402043726', NULL, 'Nhom: TRUCKER
Dia chi: Số 18, đường Lê Cao Lãng, Phường Cẩm Lệ, TP Đà Nẵng, Việt Nam'),
  ('CL000053', 'HOANG PHUC', '2900720036', NULL, 'Nhom: TRUCKER
Dia chi: Xóm 9A, Xã Diễn Thịnh, Huyện Diễn Châu, Tỉnh Nghệ An, Việt Nam'),
  ('CL000054', 'VAN TAI THANH LONG', '4101430743', NULL, 'Nhom: TRUCKER
Dia chi: Tan Hoa Nam Village, Cat Hanh Commune, Phu Cat District, Binh Dinh Province, Vietnam'),
  ('CL000055', 'VAN TAI BAO DUY', '0318145367', NULL, 'Nhom: TRUCKER
Dia chi: 183 duong Huynh Thi Na, Ap 6, xa Dong Thanh, huyen Hoc Mon, Thanh pho HCM, Viet Nam'),
  ('CL000056', 'LONG TRUONG HAI LOGISTICS', '0402111239', NULL, 'Nhom: TRUCKER
Dia chi: To 6, duong Cau Do Tuy Loan, phuong Hoa Tho Tay, quan Cam Le, tp Da Nang, Viet Nam'),
  ('CL000057', 'VAN TAI VA DU LICH THIEN PHUOC', '0318213909', NULL, 'Nhom: TRUCKER
Dia chi: 63 Bàu Cát 7, Phường 14, Quận Tân Bình, Thành phố Hồ Chí Minh'),
  ('CL000058', 'NAM DINH EXPRESS', '0601164926', NULL, 'Nhom: TRUCKER
Dia chi: No. 266 Cau Dong, Loc Vuong Ward, Nam Dinh City, Nam Dinh Province, Vietnam'),
  ('CL000059', 'TAN DAT', '4101479185', NULL, 'Nhom: TRUCKER
Dia chi: So 02 Ho Hoc Lam, to 75, khu vuc 8, phuong Quang Trung, thanh pho Quy Nhon, tinh Binh Dinh'),
  ('CL000060', 'HOMIS LOG', '0315323244', NULL, 'Nhom: TRUCKER
Dia chi: 76 duong so 4, khu pho 5, phuong Binh Hung Hoa B, quan Binh tan, TP. HCM'),
  ('CL000061', 'LOG HOANG PHUC', '0317787001', NULL, 'Nhom: TRUCKER
Dia chi: No. 15- 17 Nguyen Ba Tong, Ward 11, Tan Binh District, Ho Chi Minh City HCMC, Vietnam'),
  ('CL000062', 'VAN TAI BAO NGOC', '4101638526', NULL, 'Nhom: TRUCKER
Dia chi: 237/24/3 Hoang Van Thu Street, Ngo May Ward, Quy Nhon City, Binh Dinh Province, Viet Nam'),
  ('CL000063', 'T&T TRANSPORT', '0201951598', NULL, 'Nhom: TRUCKER
Dia chi: Số 226 Lê Thánh Tông, Phường Máy Chai, Quận Ngô Quyền, TP Hải Phòng'),
  ('CL000064', 'AN MINH LOG', '0402149994', NULL, 'Nhom: TRUCKER
Dia chi: K455/D22 Nguyen Luong Bang Street, Hoa Khanh Bac Ward, Lien Chieu District, Da Nang City, Vietnam'),
  ('CL000065', 'SACOMEX -TM DV -NHA XE', '0402175578', NULL, 'Nhom: TRUCKER
Dia chi: 134 Nguyen Nhuoc Phap, phuong Hoa Minh, quan Lien Chieu, thanh pho Da Nang, Viet Nam'),
  ('CL000066', 'TIEP VAN NAM THAI BINH DUONG', '0313686468', NULL, 'Nhom: TRUCKER
Dia chi: 3A Dien Bien Phu, Ward 25, Binh Thanh District, Ho Chi Minh City, Vietnam'),
  ('CL000067', 'VAN TAI TRAM NGOC', '0318361167', NULL, 'Nhom: TRUCKER
Dia chi: 206D Nguyen Van Troi, Ward 1, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000068', 'TAM GIA LOGISTICS', '0201856760', NULL, 'Nhom: TRUCKER
Dia chi: No. 1/67/132 An Da, Dang Giang Ward, Ngo Quyen District, Hai Phong City, Vietnam'),
  ('CL000069', 'HIEN HAN', '0309916084', NULL, 'Nhom: TRUCKER
Dia chi: 31/8 Nguyen Dinh Khoi, Ward 4, Tan Binh District, Ho Chi Minh City, Viet Nam'),
  ('CL000070', 'SAO MOC GROUP', '0316229815', NULL, 'Nhom: TRUCKER
Dia chi: 47/68/40/89/5T Truong Luu Street, Truong Luu Quarter, Long Truong Ward, Thu Duc City, Ho Chi Minh City, Viet Nam'),
  ('CL000071', 'XUAT NHAP KHAU ATM', '0315978586', NULL, 'Nhom: TRUCKER
Dia chi: 245/1 National Highway 1A, Quarter 1, Tan Chanh Hiep Ward, District 12, Ho Chi Minh City, Vietnam'),
  ('CL000072', 'MINH TUAN DTT', '3200695315', NULL, 'Nhom: TRUCKER
Dia chi: Tay Chin, Lao Bao Town, Huong Hoa District, Quang Tri Province, Vietnam'),
  ('CL000073', 'VAN TAI HOANG BAO THU', '0401429389', NULL, 'Nhom: TRUCKER
Dia chi: K55/16 Huynh Ngoc Hue, Hoa Khe Ward, Thanh Khe District, Da Nang City, Viet nam'),
  ('CL000074', 'THAO HUONG NHI', '0402087561', NULL, 'Nhom: TRUCKER
Dia chi: 216 Nguyen Binh, phuong Hoa An, quan Cam Le, Thanh pho Da Nang, Viet Nam'),
  ('CL000075', 'GOGOX', '0316976133', NULL, 'Nhom: TRUCKER
Dia chi: BO 4th Floor, 11th Floor, Bluesky office Building, No. 01, Bach Dang Street, Ward 2, Tan Binh District, Ho Chi Minh City'),
  ('CL000076', 'QUAN PHUC HUY', '0401656832', NULL, 'Nhom: TRUCKER
Dia chi: 15 Nhon Hoa 18, Hoa An Ward, Cam Le District, Da Nang City'),
  ('CL000077', 'HUNG MINH', '3702850998', NULL, 'Nhom: TRUCKER
Dia chi: Land Plot No. 523, Map No. 8, Group 2, Phuoc Hai Quarter, Thai Hoa Ward, Tan Uyen City, Binh Duong Province, Vietnam'),
  ('CL000078', 'BINH EMA', '0318494230', NULL, 'Nhom: TRUCKER
Dia chi: 89/4B Nguyen Hong Dao Street, Ward 14, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000079', 'VAN TAI MINH PHUONG', '0202034072', NULL, 'Nhom: TRUCKER
Dia chi: Thôn Lê Sáng (tại nhà bà Phạm Thị Hường), Xã An Hồng, Huyện An Dương, Thành Phố Hải Phòng, Việt Nam'),
  ('CL000080', 'EURO VO', '0402035186', NULL, 'Nhom: TRUCKER
Dia chi: Tổ 01, Thôn Nhơn Thọ 2, Phường Hoà Xuân, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000081', 'NAM PHUOC THANG', '0401701161', NULL, 'Nhom: TRUCKER
Dia chi: 115 Ho Bieu Chanh, Hoa Cuong Nam Ward, Hai Chau District, Da Nang City, Vietnam'),
  ('CL000082', 'ANH TOAN PHAT', '0401671125', NULL, 'Nhom: TRUCKER
Dia chi: 38 Le Chan, Nai Hien Dong Ward, Son Tra District, Da Nang City, Vietnam'),
  ('CL000083', 'NHU NGOC TRANSPORT-VAN TAI NHU NGOC', '0201957938', NULL, 'Nhom: TRUCKER
Dia chi: No. 1651 Pham Van Dong Street, Tan Thanh Ward, Duong Kinh District, Hai Phong City, Vietnam.'),
  ('CL000084', 'NGOC SONG CHAU', '0401922315', NULL, 'Nhom: TRUCKER
Dia chi: 22 Nguyen Khac Nhu, phuong Hoa Minh, quan Lien Chieu, Thanh pho Da Nang, Viet Nam'),
  ('CL000085', 'HOP TAC XA HOA VANG', '0400517385', NULL, 'Nhom: TRUCKER
Dia chi: National Highway 14B, Thach Nham Dong Village, Hoa Nhon Commune, Hoa Vang District, Da Nang City, Vietnam'),
  ('CL000086', 'SAU THO', '0401666439', NULL, 'Nhom: TRUCKER
Dia chi: 412/18 Ton Duc Thang, Hoa Minh Ward, Lien Chieu District, Da Nang City, Vietnam'),
  ('CL000087', 'TU TAM LONG', '3702919110', NULL, 'Nhom: TRUCKER
Dia chi: Land plot No. 96, map sheet No. 04, An Loi Quarter, Hoa Loi Ward, Ben Cat City, Binh Duong Province , Vietnam'),
  ('CL000088', 'VAN TAI NGOC NGAN', '4101632524', NULL, 'Nhom: TRUCKER
Dia chi: No. 826/20 Tran Hung Dao Street, Dong Da Ward, Quy Nhon City, Binh Dinh Province, Vietnam'),
  ('CL000089', 'HA QUANG TRANSPORT', '3101094049', NULL, 'Nhom: TRUCKER
Dia chi: Ward 5, Ba Don Ward, Ba Don Town, Quang Binh Province'),
  ('CL000090', 'HA HIEN PHUONG', '0401993475', NULL, 'Nhom: TRUCKER
Dia chi: 15 Ba Bang Nhan, Hoa Hai Ward, Ngu Hanh Son District, Da Nang City, Vietnam'),
  ('CL000091', 'FDT', '0400674902', NULL, 'Nhom: TRUCKER
Dia chi: 104-106 Thế Lữ, Phường An Hải, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000092', 'LINH DAI PHAT', '3603459448', NULL, 'Nhom: TRUCKER
Dia chi: No. 71/15C, KP 2, Tam Hoa Ward, Bien Hoa City, Dong Nai Province, Vietnam'),
  ('CL000093', 'HOP TAC XA CAM LE', '0400128597', NULL, 'Nhom: TRUCKER
Dia chi: 715 Truong Chinh, Hoa Phat Ward, Cam Le District, Da Nang City, Vietnam'),
  ('CL000094', 'CTY TUAN MINH LOGISTICS', '0110480380', NULL, 'Nhom: TRUCKER
Dia chi: Thôn Dược Thượng, Xã Sóc Sơn, Thành phố Hà Nội, Việt Nam'),
  ('CL000095', 'CTY FLV', '0402251444', NULL, 'Nhom: TRUCKER
Dia chi: 638 Ngo Quyen, An Hai Bac Ward, Son Tra District, Da Nang'),
  ('CL000096', 'HOANG GIA TIEN PHAT - nha xe', '0401438400', NULL, 'Nhom: TRUCKER
Dia chi: K169/19 Ngo Quyen - Tho Quang Ward - Son Tra District - Da Nang City - Vietnam'),
  ('CL000097', 'HOP TAC XA SO 9', '0301291419', NULL, 'Nhom: TRUCKER
Dia chi: 167 Tran Tuan Khai, Ward 5, District 5, Ho Chi Minh City'),
  ('CL000098', 'PHUC AN KHANG', '4101576686', NULL, 'Nhom: TRUCKER
Dia chi: Group 7, Area 6, Tran Quang Dieu Ward, Quy Nhon City, Binh Dinh Province, Vietnam'),
  ('CL000099', 'THUAN AN NGHIA', '4300577370', NULL, 'Nhom: TRUCKER
Dia chi: Dai An Dong 1 Village, Hanh Thuan Commune, Nghia Hanh District, Quang Ngai Province, Vietnam'),
  ('CL000100', 'LONG NHAT QUANG', '0401629839', NULL, 'Nhom: TRUCKER
Dia chi: 50 Hoa Nam 2, Hoa An Ward, Cam Le District, Da Nang City Nang, Vietnam'),
  ('CL000101', 'BINH ANH KON TUM', '6101292737', NULL, 'Nhom: TRUCKER
Dia chi: Village 9, Dak Ruong Commune, Kon Ray District, Kon Tum Province, Vietnam'),
  ('CL000102', 'THUAN PHONG - GNVT', '0312038383', NULL, 'Nhom: TRUCKER
Dia chi: 53 KHUONG VIET , P.PHU TRUNG , TAN PHU'),
  ('CL000103', 'CPN BAY THINH', '0310976401', NULL, 'Nhom: TRUCKER
Dia chi: 174/2/30A Dương Quảng Hàm, P5, Q Gò Vấp, TPHCM'),
  ('CL000104', 'ITC CORP - SP-ITC', '0302345459', NULL, 'Nhom: TRUCKER'),
  ('CL000106', 'CUC DANG KIEM', '0100109120', NULL, 'Nhom: TRUCKER
Dia chi: 18 Pham Hung - Nam Tu Liem - Hanoi'),
  ('CL000107', 'VAN TAI PHUC AN HUNG', '0200787546', NULL, 'Nhom: TRUCKER
Dia chi: Số 20/199 Tô Hiệu, Phường Trại Cau, Quận Lê Chân, Thành phố Hải Phòng'),
  ('CL000108', 'SRVCFREIGHT', '0313078893', NULL, 'Nhom: TRUCKER
Dia chi: 18H CONG HOA STREET, WARD 4, TAN BINH DIST, HCMC, VN'),
  ('CL000109', 'VAN TAI THE LUAN', '0201730535', NULL, 'Nhom: TRUCKER
Dia chi: DONG HUNG ( HOANG VAN LUAN HOUSE), DONG HAI 2, HAI AN, HAI PHONG, VIET NAM'),
  ('CL000110', 'VAN TAI GIA NGUYEN', '0315679730', NULL, 'Nhom: TRUCKER
Dia chi: 80 Nguyen Gian Thanh, phuong 15, quan 10,tp Ho Chi Minh, Viet Nam'),
  ('CL000111', 'HAI AN HA NOI', '0108111428', NULL, 'Nhom: TRUCKER
Dia chi: Office 3B, 3rd Floor, Building B, Green Pearl Building, 378 Minh Khai, Vinh Tuy Ward, Hai Ba Trung District, Hanoi City, Vietnam'),
  ('CL000112', 'VSICO EXPRESS', '0200587233', NULL, 'Nhom: TRUCKER
Dia chi: Room 315, 3rd Floor, Thanh Dat Building 1, No. 3 Le Thanh Tong, May To Ward, Ngo Quyen District, Hai Phong City, Vietnam.'),
  ('CL000113', 'VAN CHUYEN A CHAU', '0310031872', NULL, 'Nhom: TRUCKER
Dia chi: Số 35 đường Thới An 17A, Phường Thới An, Quận 12, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000114', 'VAN TAI NAM LONG', '0109225604', NULL, 'Nhom: TRUCKER
Dia chi: So nha 1 ngo 40 Duong Cau Ca, To 1, Phuong Dong Mai, Quan Ha Dong, Thanh pho Ha Noi, Viet Nam'),
  ('CL000115', 'DONG HAI TRACO-VAN TAI DONG HAI', '0201005840', NULL, 'Nhom: TRUCKER
Dia chi: Room 409 - 410 Petroleum Building, No. 441 Da Nang Street, Dong Hai 1 Ward, Hai An District, Hai Phong city, Vietnam'),
  ('CL000116', 'KHAI HOAN THIEN LOGISTICS', '3702853036', NULL, 'Nhom: TRUCKER
Dia chi: HOUSE NUMBER 36A, AN HOA HALL, An Son Commune, Thuan An City, Binh Duong Province, Vietnam'),
  ('CL000118', 'CONTAINER HOA LAM - HOA LÂM', '0401309042', NULL, 'Nhom: TRUCKER'),
  ('CL000119', 'MN SHIPPING - VAN TAI BIEN MINH NGUYEN', '0310075608', NULL, 'Nhom: TRUCKER
Dia chi: Room SAV.2-02.30, Floor 2, Tower 2, THE SUN AVENUE, 28 Mai Chi Tho, An Phu Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000120', 'CU CHI', '0301476988', NULL, 'Nhom: TRUCKER
Dia chi: No. 116 Dao Van Try, Tan An Hoi Commune, Cu Chi District, Ho Chi Minh City, Vietnam'),
  ('CL000121', 'GOLDEN PANDA', '3601019988', NULL, 'Nhom: TRUCKER
Dia chi: No. 39/3 Ton That Tung Street, Pham Ngu Lao Ward, District 1, Ho Chi Minh City, Vietnam'),
  ('CL000123', 'LE THANH NHA XE- CP TMVT LE THANH HCM', '0302689749', NULL, 'Nhom: TRUCKER
Dia chi: 41/1-41/3 Đường 68, Khu phố 2, Phường Hiệp Phú, Quận 9, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000124', 'VAN TAI TIEN DUNG - bac giang', '2400741341', NULL, 'Nhom: TRUCKER'),
  ('CL000126', 'SONG TOAN - VAN CHUYEN - TNHH -Danang', '0400393059', NULL, 'Nhom: TRUCKER
Dia chi: 84 Núi Thành, Phường Hòa Cường, TP Đà Nẵng, Việt Nam'),
  ('CL000127', 'FALCON EXPRESS -1zf0', '0311929901', NULL, 'Nhom: TRUCKER'),
  ('CL000128', 'VAN TAI VIETUNI', '0201290570', NULL, 'Nhom: TRUCKER'),
  ('CL000129', 'VANTAGE LOG HCM CORP', '0302802063', NULL, 'Nhom: TRUCKER
Dia chi: Room 601, 6th Floor RiverGate Residence, Number 151-155 Ben Van Don Street, Ward 09, District 4, Ho Chi Minh City, Vietnam'),
  ('CL000130', 'SUNRISE LOGIMEX HCM - SUNRISE Trans Log Imp Exp - GNVT XNK BINH MINH', '0312193357', NULL, 'Nhom: TRUCKER
Dia chi: 1/1 Hoang Viet, Ward 4, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000131', 'LONG VIET LOGISTICS', '0305749594', NULL, 'Nhom: TRUCKER
Dia chi: Room 2.07, 2nd Floor, Newton Building, 38 Truong Quoc Dung, Ward 08, Phu Nhuan District, Ho Chi Minh City, Vietnam'),
  ('CL000132', 'GEODIS VN - HCM', '0309515999', NULL, 'Nhom: TRUCKER
Dia chi: Floor 09, Bluesky Office Building, No. 01, Bach Dang Street, Ward 2, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000133', 'TRONG TIN TRANSPORT CO.,LTD', '0106884655', NULL, 'Nhom: TRUCKER
Dia chi: SO NHA 2, NGO 192 TAY SON, THI TRAN PHUNG, HUYEN DAN PHUONG'),
  ('CL000134', 'HAI MINH - TNHH TM HAI MINH', '3600615508', NULL, 'Nhom: TRUCKER
Dia chi: Group 14, Hamlet 3, Hiep Phuoc Town, Nhon Trach District, Dong Nai Province, Vietnam'),
  ('CL000135', 'SON HIEU NGOC', '0401527731', NULL, 'Nhom: TRUCKER
Dia chi: .'),
  ('CL000136', 'HOA CUC - DAISY', '0309985137', NULL, 'Nhom: TRUCKER
Dia chi: 121 Nguyen Van Luong Street, Ward 10, Go Vap District, Ho Chi Minh City, Viet Nam'),
  ('CL000137', 'OOCL LOGISTICS HCM', '0312095014', NULL, 'Nhom: TRUCKER
Dia chi: Room 1301-1305, 13/F Saigon Trade Center Building,  37 Ton Duc Thang, District 1, Ho Chi Minh City, Vietnam'),
  ('CL000138', 'VAN TAI GIA MINH - GIA MINH TRANSPORT', '0201292095', NULL, 'Nhom: TRUCKER
Dia chi: SB6.08 Vinhomes Marina Urban Area, Vinh Niem Ward, Le Chan District, Hai Phong City, Vietnam'),
  ('CL000139', 'DASH LOGISTICS', '0311253204', NULL, 'Nhom: TRUCKER
Dia chi: 54 Truong Son, Ward 2, Tan Binh District, Ho Chi Minh City, Vietnam.'),
  ('CL000140', 'LOSCAM', '0304432386', NULL, 'Nhom: TRUCKER
Dia chi: No. 526 Binh Duong Avenue, Nguyen Trai Quarter, Lai Thieu Ward, Thuan An City, Binh Duong Province, Vietnam'),
  ('CL000141', 'CHUYEN PHAT NHANH LIEN QUOC GIA - TEL', '0314801593', NULL, 'Nhom: TRUCKER
Dia chi: Tòa nhà TTC Tower, số 253 Hoàng Văn Thụ, Phường 2, Quận Tân Bình, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000142', 'DHL - VNPT EXPRESS - CPN DHL VNPT', '0304680974', NULL, 'Nhom: TRUCKER
Dia chi: Số 6, Đường Thăng Long - Phường 4 - Quận Tân Bình - TP Hồ Chí Minh.'),
  ('CL000143', 'TIEN VIET EXPRESS', '0314960843', NULL, 'Nhom: TRUCKER
Dia chi: 94 Than Nhan Trung, Ward 13, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000144', 'TAN CANG LOGISTICS JSC', '0304875444', NULL, 'Nhom: TRUCKER
Dia chi: 470 đường Đồng Văn Cống, Phường Thạnh Mỹ Lợi, Quận 2, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000145', 'SEABORNES HCM - SONG BINH HCM', '0301446415', NULL, 'Nhom: TRUCKER
Dia chi: 192/2 Nguyễn Trọng Tuyển - Phường 08 - Quận Phú Nhuận - TP Hồ Chí Minh.'),
  ('CL000146', 'SOTRANS LOGISTICS', '0315428529', NULL, 'Nhom: TRUCKER
Dia chi: 1B HOANG, DIEU STREET, DIST. 4, HO CHI MINH CITY, VIETNAM'),
  ('CL000147', 'ORIENTAL LOGISTICS MULTIMODAL TRANSPORT - VT DA PHUONG THUC PHUONG DONG', '0315239810', NULL, 'Nhom: TRUCKER
Dia chi: No. 1, Street 4, KDC Tan Thanh Lap, Phu My Ward, District 7, Ho Chi Minh City, Vietnam'),
  ('CL000148', 'LONG THANH PHAT', '0310362289', NULL, 'Nhom: TRUCKER
Dia chi: Số 73 Đường số 11, Phường Phước Bình, Quận 9, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000149', 'NGUYEN LONG TRANSPORT', '0305617929', NULL, 'Nhom: TRUCKER
Dia chi: 106 Lê Lai - Phường 3 - Quận Gò Vấp - TP Hồ Chí Minh'),
  ('CL000150', 'DUC NHU', '3602285453', NULL, 'Nhom: TRUCKER
Dia chi: C6 KP4, PHUONG QUANG VINH. TP BIEN HOA. TINH DONG NAI'),
  ('CL000151', 'KHOI AN PHU', '0401885977', NULL, 'Nhom: TRUCKER
Dia chi: 728 Ngô Quyền, Phường An Hải, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000152', 'THANH BUOI', '0302029252', NULL, 'Nhom: TRUCKER
Dia chi: 266-268 Lê Hồng Phong, Phường 4, Quận 5, Thành phố Hồ Chí Minh'),
  ('CL000153', 'VAN TAI TRANG ANH', '0312201752', NULL, 'Nhom: TRUCKER
Dia chi: 29/5 Đường 18, Khu phố 5, Phường Linh Trung, Quận Thủ Đức, TP Hồ Chí Minh'),
  ('CL000154', 'SMART TRANS CO., LTD', '0401777026', NULL, 'Nhom: TRUCKER
Dia chi: Số 6 Lê Thạch - Phường Hoà Minh - Quận Liên Chiểu - Đà Nẵng.'),
  ('CL000155', 'NHA XE HUU HUNG DUNG', '3701919397', NULL, 'Nhom: TRUCKER
Dia chi: B1-022, Chung cư Ehome 4 Bắc Sài Gòn, đường Vĩnh Phú 41 - Phường Vĩnh Phú - Thành phố Thuận An - Bình Dương.'),
  ('CL000156', 'TAN CANG SHIPPING', '0315993048', NULL, 'Nhom: TRUCKER
Dia chi: Số 61 Đường Song Hành, Phường An Phú, Quận 2, Thành phố Hồ Chí Minh'),
  ('CL000157', 'HIEP PHAT -TM TV HIEP PHAT', '0311926386', NULL, 'Nhom: TRUCKER
Dia chi: (41/1-41/3) 68 Street, Hiep Phu Ward, District 9, Ho Chi Minh City, Vietnam'),
  ('CL000158', 'AAL JOINT STOCK COMPANY', '0107372459', NULL, 'Nhom: TRUCKER
Dia chi: ACSV cargo terminal, Noi Bai International Airport, Phu Minh Commune, Soc Son District, Hanoi City, Viet Nam'),
  ('CL000159', 'TRANS WORLD AVIATION - TWA-1zh1', '0312610233', NULL, 'Nhom: TRUCKER
Dia chi: 3 th Floor, Hai Au Building, No. 39B Truong Son, Ward 4, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000160', 'LIONS TRANSPORTATION - DV VAN CHUYEN SU TU', '0314416337', NULL, 'Nhom: TRUCKER
Dia chi: 6-10 Cuu Long, Ward 2, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000161', 'LUPUS VIETNAM', '0402057648', NULL, 'Nhom: TRUCKER
Dia chi: Thửa đất số 138, tờ bản đồ 93, Tổ dân phố Đại La, Phường Hoà Khánh, Tp Đà Nẵng'),
  ('CL000162', 'LE THANH TNHH - BINH DUONG', '3702888984', NULL, 'Nhom: TRUCKER
Dia chi: Số 9 đường Tân Long, Khu phố Tân Long, Phường Tân Đông Hiệp, Thành phố Dĩ An, Tỉnh Bình Dương'),
  ('CL000163', 'DANG NGUYEN 3T', '0316334432', NULL, 'Nhom: TRUCKER
Dia chi: 51 Tân Mỹ, Phường Tân Thuận Tây, Quận 7, Thành Phố Hồ Chí Minh, Việt Nam'),
  ('CL000164', '3N TRADING SERVICE', '0312549204', NULL, 'Nhom: TRUCKER
Dia chi: 209H Nguyen Xi Street, Ward 26, Binh Thanh District, Ho Chi Minh City, Vietnam'),
  ('CL000165', 'NTL GROUP', '0314097070', NULL, 'Nhom: TRUCKER
Dia chi: 256/33 Duong Quang Ham Street, Ward 5, Go Vap District, Ho Chi Minh City, Vietnam'),
  ('CL000166', 'XUAN CUONG JSC', '4900239158', NULL, 'Nhom: TRUCKER
Dia chi: No. 175 Tran Dang Ninh street, Tam Thanh ward, Lang Son city, Lang Son province.'),
  ('CL000167', 'TIN PHAT FREIGHT FORWARDING', '3901152564', NULL, 'Nhom: TRUCKER
Dia chi: No. 1535 An Binh Quarter, An Tinh Ward, Trang Bang Town, Tay Ninh Province, Vietnam'),
  ('CL000168', 'PROS LOGISTICS', '0316717805', NULL, 'Nhom: TRUCKER
Dia chi: TTC Tower Building, 253 Hoang Van Thu, Ward 2, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000169', 'D&T TRANSPORT', '0315636617', NULL, 'Nhom: TRUCKER
Dia chi: 167/9 Ngo Tat To, Ward 22, Binh Thanh District, Ho Chi Minh City, Vietnam'),
  ('CL000170', 'NAM CUONG TRANSPORTATION', '3603680544', NULL, 'Nhom: TRUCKER
Dia chi: No. 13E2, Street B3, Quarter 3, Long Binh Tan Ward, Bien Hoa City, Dong Nai Province, Vietnam'),
  ('CL000171', 'AN PHU VIEN', '4000800571', NULL, 'Nhom: TRUCKER
Dia chi: Van Thach Village, Tam Hiep Commune, Nui Thanh District, Quang Nam Province, Vietnam'),
  ('CL000172', 'TRUONG DAI PHAT', '0307571839', NULL, 'Nhom: TRUCKER
Dia chi: 261B Luu Huu Phuoc, Ward 15, District 8, Ho Chi Minh City, Vietnam'),
  ('CL000173', 'TNG SOLUTION JSC', '0106817722', NULL, 'Nhom: TRUCKER
Dia chi: 4th Floor, Times Tower, No. 35 Le Van Luong Street, Nhan Chinh Ward, Thanh Xuan District, City. Hanoi'),
  ('CL000174', 'LIEN KET THAI BINH DUONG', '0401730469', NULL, 'Nhom: TRUCKER
Dia chi: 353/42 Cach Mang Thang Tam, Phuong Hoa Tho Dong, Quan Cam Le, Tp Da Nang, Viet Nam'),
  ('CL000175', 'ANH BINH MINH TECHNICAL TRADE LIMITED CO', '0312132403', NULL, 'Nhom: TRUCKER
Dia chi: 72/8A NGUYEN TU NGHIEM STREET, QUARTER 5, BINH TRUNG TAY WARD, THU DUC CITY, HO CHI MINH CITY, VIET NAM'),
  ('CL000176', 'MOI NGAY - DV GN VC -1zh0', '0313518801', NULL, 'Nhom: TRUCKER
Dia chi: 28/05 Đường số 2, Phường 3, Quận Gò Vấp, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000177', 'HUY HOANG CONVEY - VAN TAI HUY HOANG', '0308819225', NULL, 'Nhom: TRUCKER
Dia chi: 118B Street 2, Quarter 9, Truong Tho Ward, Thu Duc District, Ho Chi Minh City, Vietnam'),
  ('CL000178', 'SAVITRANS', '0311809040', NULL, 'Nhom: TRUCKER
Dia chi: 1st Floor, Rosana Building, No. 60 Nguyen Dinh Chieu, Da Kao Ward, District 1, Ho Chi Minh City, Vietnam'),
  ('CL000179', 'LIEN VAN AN TIN', '0801177672', NULL, 'Nhom: TRUCKER
Dia chi: Lot CN11+CN 12, An Dong Industrial Complex, Nam Sach Town, Nam Sach District, Hai Duong Province, Vietnam'),
  ('CL000180', 'HAPPY TRANS', '0316149528', NULL, 'Nhom: TRUCKER
Dia chi: 23/2 Street 2, Ward 16, Go Vap District, Ho Chi Minh City, Vietnam'),
  ('CL000181', 'ANH KHOA TRANSPORT SERVICES', '2400881187', NULL, 'Nhom: TRUCKER
Dia chi: Dinh Street Residential Group, Kep Town, Lang Giang District, Bac Giang Province, Vietnam'),
  ('CL000182', 'BEE SCS CO.,LTD - CHUOI CUNG UNG CON ONG-1z', '0109978911', NULL, 'Nhom: TRUCKER
Dia chi: Tòa nhà Hanoi Group số 442 Đội Cấn, Phường Cống Vị, Quận Ba Đình, Thành phố Hà Nội, Việt Nam'),
  ('CL000183', 'THAI HA INVESTMENT', '0108739445', NULL, 'Nhom: TRUCKER
Dia chi: No. 25, Group 65, Hoang Van Thu Ward, Hoang Mai District, Hanoi City, Vietnam'),
  ('CL000184', 'TRUNG NGHIA PHAT', '3603406090', NULL, 'Nhom: TRUCKER
Dia chi: No. 20/5, alley 20, Lien hamlet 5-7, hamlet 5, Thanh Phu Commune, Vinh Cuu District, Dong Nai Province, Vietnam'),
  ('CL000185', 'TRAFFIC INVESTMENT AND DEVELOPMENT COMPANY LIMITED- VAN TAI DUNG TRANG', '0202158374', NULL, 'Nhom: TRUCKER
Dia chi: Le Chan, Hai Phong, Viet Nam'),
  ('CL000186', 'XUAN THY - DV VAN TAI', '0317431037', NULL, 'Nhom: TRUCKER
Dia chi: 182/81 Bạch Đằng, Phường 24, Quận Bình Thạnh, TP Hồ Chí Minh.'),
  ('CL000187', 'MTV MANH DUC LOGISTIC', '0315685371', NULL, 'Nhom: TRUCKER
Dia chi: 8/7 TMT 09 Street, Quarter 3, Trung My Tay Ward, District 12, Ho Chi Minh City, Vietnam'),
  ('CL000188', 'TRONG TIN INTERMAL', '0316259030', NULL, 'Nhom: TRUCKER
Dia chi: 73 Street 4, Quarter 4, Tam Phu Ward, Thu Duc District, Ho Chi Minh City, Vietnam'),
  ('CL000189', 'TML LOGISTICS', '0317516675', NULL, 'Nhom: TRUCKER
Dia chi: VP-5-01 Floor 005 Block STMA00, CECICO Apartment and Office Building 135 TOWER, 1014 Pham Van Dong, Hiep Binh Chanh Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000190', 'BAO ANH PHAT', '3703061805', NULL, 'Nhom: TRUCKER
Dia chi: Số 07A DC03 đường D19 khu phố 4 Khu dân cư Việt Sing, Phường An Phú, TP Hồ Chí Minh,Việt Nam'),
  ('CL000191', 'TRANSIMEX PORT', '0317656055', NULL, 'Nhom: TRUCKER
Dia chi: 429/8 Song Hanh Street, Hanoi, Quarter 7, Truong Tho Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000192', 'GREEN WORLD LOGISTICS', '0311897470', NULL, 'Nhom: TRUCKER
Dia chi: 375-377 Nguyen Thai Binh, Ward 12, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000193', 'HOANG HUY PHAT', '0311718971', NULL, 'Nhom: TRUCKER
Dia chi: 219/16/42 Street No. 12, Binh Hung Hoa Ward, Binh Tan District, Ho Chi Minh City, Vietnam'),
  ('CL000194', 'HAI BON BAY', '0304043037', NULL, 'Nhom: TRUCKER
Dia chi: A77 Bach Dang, Ward 2, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000195', 'VOSCO AGENCY AND LOGISTICS', '0201130601', NULL, 'Nhom: TRUCKER
Dia chi: No. 215 Lach Tray, Dang Giang Ward, Ngo Quyen District, Hai Phong City, Vietnam'),
  ('CL000196', 'SPIDER EXPRESS', '3301700057', NULL, 'Nhom: TRUCKER
Dia chi: No. 6/156 Ton That Thiep, Tay Loc Ward, Hue City, Thua Thien Hue Province, Vietnam'),
  ('CL000197', 'TIEN DAT TRADING AND LOGISTICS', '0314529193', NULL, 'Nhom: TRUCKER
Dia chi: 65 Street 23, Hiep Binh Chanh Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000199', '3S LOGISTICS', '0317917490', NULL, 'Nhom: TRUCKER
Dia chi: C40 N1 Street-PARK RIVERSIDE Area, Phu Huu Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000200', 'DICH VU VAN TAI TT', '4601600552', NULL, 'Nhom: TRUCKER
Dia chi: Tổ dân phố Quán Vã - Phường Ba Hàng - Thành phố Phổ Yên - Thái Nguyên.'),
  ('CL000201', 'DAI THANH IMPORT EXPORT', '0315303569', NULL, 'Nhom: TRUCKER
Dia chi: 433 Nguyen Van Cong, Ward 3, Go Vap District, Ho Chi Minh City, Vietnam'),
  ('CL000202', 'HANH NGUYEN LOGISTICS', '6300314022', NULL, 'Nhom: TRUCKER
Dia chi: Cụm Công nghiệp Tập trung Phú Hữu A – Giai đoạn 1, Xã Châu Thành, Thành phố Cần Thơ, Việt Nam'),
  ('CL000203', 'LONG DAT DONG NAI', '0318197005', NULL, 'Nhom: TRUCKER
Dia chi: 14 Truong Quyen, Vo Thi Sau Ward, District 3, Ho Chi Minh City, Vietnam'),
  ('CL000204', 'QUOC CUONG CONSTRUCTION', '0306202518', NULL, 'Nhom: TRUCKER
Dia chi: 26 HT 22 Street, Hiep Thanh Ward, District 12, Ho Chi Minh City, Vietnam'),
  ('CL000205', 'INTERNATIONAL OVERSEAS INVESTMENT', '0316729705', NULL, 'Nhom: TRUCKER
Dia chi: Room D.1403, The Manor Officetel building, 91 Nguyen Huu Canh, Ward 22, Binh Thanh District, Ho Chi Minh City, Vietnam'),
  ('CL000206', 'SPEEDEX', '0310612637', NULL, 'Nhom: TRUCKER
Dia chi: 34 Bui Huu Nghia Street, Ward 2, Binh Thanh District, Ho Chi Minh City, Vietnam'),
  ('CL000207', 'NGUYEN LINH LOGISTICS', '1101951388', NULL, 'Nhom: TRUCKER
Dia chi: No. 59, Quarter 1, Bach Dang Street, Ward 2, Kien Tuong Town, Long An Province, Vietnam'),
  ('CL000208', 'BINH PHUC - TM DV VT', '4001258062', NULL, 'Nhom: TRUCKER
Dia chi: Nguyen Chi Thanh Street, Block 3, Nui Thanh Town, Nui Thanh District, Quang Nam Province, Vietnam'),
  ('CL000209', '3S LOGISTICS VIET NAM', '0318043076', NULL, 'Nhom: TRUCKER
Dia chi: Room 3.3, 3rd Floor, Plaza Tan Binh Building, 174 Bui Thi Xuan, Ward 3, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000210', 'VAN TAI NAM MY', '0104932430', NULL, 'Nhom: TRUCKER
Dia chi: Số 97 tổ 52 thị trấn Đông Anh, huyện Đông Anh, Thành phố Hà Nội, Việt Nam'),
  ('CL000211', 'MPC LOGISTICS TRADE', '3702593363', NULL, 'Nhom: TRUCKER
Dia chi: T6/130 Thuan An Hoa Street, Group 6, Binh Thuan 2 Quarter, Thuan Giao Ward, Thuan An City, Binh Duong Province, Vietnam'),
  ('CL000212', 'SBI SAIGON', '0316722989', NULL, 'Nhom: TRUCKER
Dia chi: 11A Hong Ha, Ward 2, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000213', 'NGUYEN LE TRANSPORT', '3702302776', NULL, 'Nhom: TRUCKER
Dia chi: No. 36 Street 04, Hiep Thanh 3 Residential Area, Area 7, Hiep Thanh Ward, Thu Dau Mot City, Binh Duong Province, Vietnam'),
  ('CL000214', 'SANTA TRANSPORT', '0314454572', NULL, 'Nhom: TRUCKER
Dia chi: 175/28/24 Dinh Phong Phu, Quarter 3, Tang Nhon Phu B Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000215', 'APOLLO TRADING AND INVESTMENT', '0317871510', NULL, 'Nhom: TRUCKER
Dia chi: Officetel SAV.8-19.11 No. 28 Mai Chi Tho Avenue, An Phu Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000216', 'SAI GON EXPRESS', '0312780059', NULL, 'Nhom: TRUCKER
Dia chi: 2/7 NGUYEN TRONG LOI, WARD 4, TAN BINH DIST, HCMC, VN'),
  ('CL000217', 'XNK DUC LONG TRANSPORT', '0202115187', NULL, 'Nhom: TRUCKER
Dia chi: No. 12/1 CT3 A1, Group A1A2, Quan Toan Ward, Hong Bang District, Hai Phong City, Vietnam'),
  ('CL000218', 'VINAWEST', '1801601967', NULL, 'Nhom: TRUCKER
Dia chi: 60–62–64, Ly Hong Thanh, Cai Khe Ward, Ninh Kieu District, Can Tho City, Vietnam'),
  ('CL000219', 'TAN PHUOC KHANH', '3702297847', NULL, 'Nhom: TRUCKER
Dia chi: No. 559, Group 69, Area 8, Phu Loi Ward, Thu Dau Mot City, Binh Duong'),
  ('CL000220', 'HY MINH LOGISTICS', '0317928566', NULL, 'Nhom: TRUCKER
Dia chi: 41/1 - 41/3 Street 68, Quarter 2, Hiep Phu Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000221', 'MABELLE PLUS GLOBAL VINA', '1001278546', NULL, 'Nhom: TRUCKER
Dia chi: Số nhà 5, đường Bồ Xuyên, Tổ 12, Phường Bồ Xuyên, Thành phố Thái Bình, Thái Bình'),
  ('CL000222', 'GHI NAM TRANSPORT', '4100710593', NULL, 'Nhom: TRUCKER
Dia chi: Group 55, Area 10, Hai Cang Ward, Quy Nhon City, Binh Dinh Province, Vietnam'),
  ('CL000223', 'TRANSIN GROUP - CHI NHANH', '0105328020-002', NULL, 'Nhom: TRUCKER
Dia chi: 71 Street 7 Van Phuc 1 Residential Area, Quarter 5, Hiep Binh Phuoc Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000224', 'JANUS SERVICE', '0317845239', NULL, 'Nhom: TRUCKER
Dia chi: 35/7D Tran Dinh Xu, Cau Kho Ward, District 1, Ho Chi Minh City, Vietnam'),
  ('CL000225', 'LAM DAT TRANSPORT SERVICE', '0311260321', NULL, 'Nhom: TRUCKER
Dia chi: 42/13C Tan Thoi Nhat 5, Quarter 7, Tan Thoi Nhat Ward, District 12, Ho Chi Minh City, Vietnam'),
  ('CL000226', 'SONG MA NHAT LONG', '0313709595', NULL, 'Nhom: TRUCKER
Dia chi: The Verosa Park, 39 Street No. 10, Quarter 2, Phu Huu Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000227', 'TAN THINH PHAT', '3703145646', NULL, 'Nhom: TRUCKER
Dia chi: 160/25/9A Doan Thi Kia, Dong Chieu Quarter, Tan Dong Hiep Ward, Di An City, Binh Duong Province, Vietnam'),
  ('CL000228', 'U&I TRANSPORT', '3700970866', NULL, 'Nhom: TRUCKER
Dia chi: No. 158 Ngo Gia Tu, Chanh Nghia Ward, Thu Dau Mot City, Binh Duong Province, Vietnam'),
  ('CL000229', 'UNICORN LOGISTICS', '0316836217', NULL, 'Nhom: TRUCKER
Dia chi: 18 Dong Van Cong, Binh Trung Tay Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000230', 'NAM HOA SON', '0308732849', NULL, 'Nhom: TRUCKER
Dia chi: 43 Street 3B Vinh Loc Residential Area, Binh Hung Hoa B Ward, Binh Tan District, Ho Chi Minh City, Vietnam'),
  ('CL000231', 'TAM BAO 2 TST., JSC', '0108988307', NULL, 'Nhom: TRUCKER
Dia chi: House no.2, Moi Hamlet, Mai Phu Village, Mai Dinh Commune, Soc Son District, Hanoi City'),
  ('CL000232', 'NGUYEN LAM TRADING', '0316019864', NULL, 'Nhom: TRUCKER
Dia chi: 1095 National Highway 1A, Binh Tri Dong A Ward, Binh Tan District, Ho Chi Minh City'),
  ('CL000233', 'THAO VIEN TRANSPORT', '3702315510', NULL, 'Nhom: TRUCKER
Dia chi: No. A135F, Binh Duc Quarter, Binh Nham Ward, Thuan An City, Binh Duong Province, Vietnam'),
  ('CL000234', 'TUAN DUY TRANSPORT', '3702304445', NULL, 'Nhom: TRUCKER
Dia chi: No. 4/12C, Thong Nhat 2 Quarter, Di An Ward, Di An City, Binh Duong Province, Vietnam'),
  ('CL000235', 'SAIGON INTERNATIONAL LOGISTICS', '0318202713', NULL, 'Nhom: TRUCKER
Dia chi: No. 50/48C, Hamlet 4, Xuan Thoi Son Commune, Hoc Mon District, Ho Chi Minh City, Vietnam'),
  ('CL000236', 'TRANG DUONG', '2400763017', NULL, 'Nhom: TRUCKER
Dia chi: No. 257 Nguyen Hong Street, Hoang Van Thu Ward, Bac Giang City, Bac Giang Province, Vietnam'),
  ('CL000237', 'TRUONG AN INVESTMENT', '3702923156', NULL, 'Nhom: TRUCKER
Dia chi: No. 31, Street 8, Hiep Thanh 3 Residential Area, Area 7, Hiep Thanh Ward, Thu Dau Mot City, Binh Duong Province, Vietnam'),
  ('CL000238', 'B.O.M TRANSPORT', '0315556087', NULL, 'Nhom: TRUCKER
Dia chi: No. 71 Street No. 30, Ward 6, Go Vap District, Ho Chi Minh City, Vietnam'),
  ('CL000239', 'MINH NGOC TRANSPORT', '0310000899', NULL, 'Nhom: TRUCKER
Dia chi: 39/3/1 Street 3, Group 2, Quarter 6, Truong Tho Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000240', 'HUNG THINH MECHANICAL SERVICES', '0317400303', NULL, 'Nhom: TRUCKER
Dia chi: Apartment 5.03, 6th Floor (5th Floor), ST Building. MORITZ, 1014 Pham Van Dong, Hiep Binh Chanh Ward, Thu Duc City, Ho Chi Minh City'),
  ('CL000241', 'THINH PHAT DAT', '0318449118', NULL, 'Nhom: TRUCKER
Dia chi: 10/42, Street 379, Tang Nhon Phu A Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000242', 'NHAT NGON LOGISTICS', '0317287150', NULL, 'Nhom: TRUCKER
Dia chi: 26/7A Tang Phu Village, Tang Nhon Phu A Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000243', 'QUOC DAT 68', '0318679288', NULL, 'Nhom: TRUCKER
Dia chi: No. 61 Street 42, Linh Dong Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000244', 'PHUONG MINH AUTO', '0314433237', NULL, 'Nhom: TRUCKER
Dia chi: 156/4/2 Vo Van Ngan, Quarter 1, Binh Tho Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000245', 'DAI SON PHAT', '0316892518', NULL, 'Nhom: TRUCKER
Dia chi: 620 Huynh Tan Phat, Tan Phu Ward, District 7, Ho Chi Minh City, Vietnam'),
  ('CL000246', 'LIEN A - NHA XE', '0312971198', NULL, 'Nhom: TRUCKER
Dia chi: 48B Đường HT18, phường Hiệp Thành, Quận 12, TP Hồ Chí Minh'),
  ('CL000247', 'PHUC AN TRANSPORTATION', '0307134317', NULL, 'Nhom: TRUCKER
Dia chi: 43/11 Bui Thi Xuan, Ward 3, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000248', 'TAN TAI MINH -NHA XE', '0304986391', NULL, 'Nhom: TRUCKER
Dia chi: 11 Nguyễn Tư Nghiêm, Khu phố 5, Phường Bình Trưng Tây, Thành phố Thủ Đức, TP Hồ Chí Minh'),
  ('CL000249', 'DUONG VU LOGISTICS', '0314093573', NULL, 'Nhom: TRUCKER
Dia chi: 12/2 Street 11, Quarter 4, An Phu Ward, Thu Duc City, Ho Chi Minh City, Vietnam'),
  ('CL000250', 'TRANSIMEX DAD', '0301874259-003', NULL, 'Nhom: TRUCKER
Dia chi: Tầng 3, số 184 Trần Phú, Phường Phước Ninh, Quận Hải Châu, TP Đà Nẵng, Việt Nam'),
  ('CL000251', 'DUONG ANH TRUCKING - MTV VAN TAI DUONG ANH', '0103980978', NULL, 'Nhom: TRUCKER
Dia chi: THON DONG, PHU LO'),
  ('CL000252', 'KHAI MINH GLOBAL HCM - KMG HCM - KHAI MINH CN HCM', '0103076466-001', NULL, 'Nhom: TRUCKER
Dia chi: Sovilaco Building 3F, No. 1 Pho Quang Street, Ward 2, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000253', 'VIETFRACHT DANANG', '0400453269', NULL, 'Nhom: TRUCKER
Dia chi: 113 HOANG VAN THU STR., DANANG CITY'),
  ('CL000254', 'EXPOLANKA FREIGHT (VIETNAM) LTD', '0305338347', NULL, 'Nhom: TRUCKER
Dia chi: Lot M02, Floor M, Tower B, Viettel Building, No. 285 Cach Mang Thang Tam, Ward 12, District 10, Ho Chi Minh City, Vietnam'),
  ('CL000255', 'SUN VN TRANSPORT', '0303207229', NULL, 'Nhom: TRUCKER
Dia chi: Room 911, Floor 9, Phu Nhuan Building, No. 20 Hoang Minh Giam, Ward 9, Phu Nhuan District, Ho Chi Minh City, Vietnam'),
  ('CL000256', 'HIEP PHAT LOCK', '0104059858', NULL, 'Nhom: TRUCKER
Dia chi: 33C ALLEY 12, CHO KHAM THIEN STREET, DONG DA DISTRICT, HANOI CAPITAL VIET NAM'),
  ('CL000257', 'VINH THANH - VAN TAI VINH THANH', '0400509761', NULL, 'Nhom: TRUCKER
Dia chi: 180 Le Dinh Ly, Hoa Thuan Tay Ward, Hai Chau District, Da Nang City, Vietnam'),
  ('CL000258', 'NIPPON EXPRESS HCM', '0302065148', NULL, 'Nhom: TRUCKER
Dia chi: Room 5.2 - 5.3, E-town Building, 364 Cong Hoa, Ward 13, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000259', 'DANATRANS  - DANANG', '0400124930', NULL, 'Nhom: TRUCKER
Dia chi: 39 TRAN QUY CAP ST., DA NANG CITY, VN'),
  ('CL000260', 'CANG DA NANG - DA NANG PORT', '0400101972', NULL, 'Nhom: TRUCKER
Dia chi: 26 Bạch Đằng, Phường Thạch Thang, Quận Hải Châu, Tp. Đà Nẵng'),
  ('CL000261', 'HTX DICH VU HO TRO OTO VAN TAI VA XE DU LICH DN', '0400104010', NULL, 'Nhom: TRUCKER
Dia chi: Lô 8A, Bùi Thị Xuân, P.An Hải Tây , Quận Sơn Trà, TP, Đà Nẵng'),
  ('CL000262', 'DHL HCM - GIAO NHAN TOAN CAU DHL HCM', '0305707643', NULL, 'Nhom: TRUCKER
Dia chi: Lầu 11, Tòa nhà Etown 2, Số 364 đường Cộng Hoà, Phường 13, Quận Tân Bình, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000263', 'VIETGLOBAL - VIET GLOBAL - TOAN CAU VIET', '0305386238', NULL, 'Nhom: TRUCKER
Dia chi: 256 CO BAC ST, DIST 1, HCMC, VIETNAM'),
  ('CL000264', 'VAN LA', '0400545537', NULL, 'Nhom: TRUCKER
Dia chi: Tổ 29 , Phường Khuê Mỹ, Quận ngũ hành sơn, Thành Phố Đà Nẵng, Việt Nam'),
  ('CL000265', 'HOANG VINH PHUC', '4000602890', NULL, 'Nhom: TRUCKER
Dia chi: BA BAU, TAM XUAN, NUI THANH DIST, QUANG NAM'),
  ('CL000266', 'SCHENKER VIETNAM - HCM', '0305269823', NULL, 'Nhom: TRUCKER
Dia chi: Floor 14 – Tower A, No. 285 Cach Mang Thang Tam Street, Ward 12, District 10, Ho Chi Minh City, Vietnam'),
  ('CL000267', 'VAN TAI THUAN THANH - VT VA DU LICH THUAN THANH', '0400515130', NULL, 'Nhom: TRUCKER
Dia chi: 36 Ngô Gia Tự, P. Hải Châu II, Q. Hải Châu, Tp Đà Nẵng'),
  ('CL000268', 'SSL VIET NAM', '4300776746', NULL, 'Nhom: TRUCKER
Dia chi: 9-11, Street 6A, Vietnam-Singapore Industrial Zone, Tinh Phong Ward, Son Tinh District, Quang Ngai Province, Vietnam'),
  ('CL000270', 'NST-NST', '0106294825', NULL, 'Nhom: TRUCKER
Dia chi: Tầng 4, tòa nhà AP, số 87 Trần Thái Tông, phường Dịch Vọng, quận Cầu Giấy,Thành phố Hà Nội'),
  ('CL000271', 'BHT TRADING', '0104361427', NULL, 'Nhom: TRUCKER
Dia chi: Km 16, Ql6, Yen Nghia, Ha Dong, Ha Noi, Vietnam'),
  ('CL000272', 'TAM BAO TRANSPORT', '2300984936', NULL, 'Nhom: TRUCKER
Dia chi: Xóm mới nhà số 2, thôn Thái Phù, Xã Mai Đình, Huyện Sóc Sơn, Hà Nội'),
  ('CL000273', 'GLOTRACO', '0401621660', NULL, 'Nhom: TRUCKER
Dia chi: 220 Nguyễn Tri Phương, Phường Thạc Gián, Quận Thanh Khê, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000274', 'HUNG THANH PHONG', '0401977459', NULL, 'Nhom: TRUCKER
Dia chi: 26 Phú Thạnh 9, Phường Hoà Khánh, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000275', 'TRANS WORLD AVIATION', '0312610233', NULL, 'Nhom: TRUCKER
Dia chi: 3 th Floor, Hai Au Building, No. 39B Truong Son, Ward 4, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000276', 'DUC TOAN PHAT TRANCO', '0201728857', NULL, 'Nhom: TRUCKER
Dia chi: No. 67 HCR Street, Lower Section 3, Dong Hai 2 Ward, Hai An District, Hai Phong City, Vietnam'),
  ('CL000277', 'WORLD WIDE TRADE AND EXPRESS 41 - W E 41', '0311977285', NULL, 'Nhom: TRUCKER
Dia chi: 32 Phan Thuc Duyen, Ward 4, Tan Binh District, Ho Chi Minh City, Vietnam'),
  ('CL000278', 'TRUST FRIEND CO., LTD', '0107829135', NULL, 'Nhom: TRUCKER
Dia chi: Hamlet 5, Kim Quan Commune, Thach That District, Hanoi'),
  ('CL000279', 'NHAN NGUYEN', '0401871011', NULL, 'Nhom: TRUCKER
Dia chi: 136 Nguyen Cong Hoan, Hoa An Ward, Cam Le District, Da Nang City, Vietnam'),
  ('CL000280', 'NHU ANH LOGISTICS', '4101617935', NULL, 'Nhom: TRUCKER
Dia chi: Lane 825, Hung Vuong Street, Group 4 Section 05, Nhon Phu Ward, Quy Nhon City, Binh Dinh Province, Viet Nam'),
  ('CL000281', 'PACIFIC CONTAINER SHIPPING JSC', '0106812107', NULL, 'Nhom: TRUCKER
Dia chi: 15th floor, Hoa Binh Office Tower, 106 Hoang Quoc Viet Street, Cau Giay, Hanoi'),
  ('CL000282', 'HOA VINH MECHANICS CO.,LTD- CO KHI HOA VINH', '0202172668', NULL, 'Nhom: TRUCKER
Dia chi: Hai An, Hai Phong, Viet Nam'),
  ('CL000283', 'GIATRUONG LOGISTICS-GIA TRUONG STAR', '4001222764', NULL, 'Nhom: TRUCKER
Dia chi: Le Hong Phong street, No. 4 ward, Nui Thanh town, Nui Thanh district, Quang Nam province, Vietnam'),
  ('CL000284', 'PHUONG DONG DEPOT', '0317359782', NULL, 'Nhom: TRUCKER
Dia chi: Số nhà B6, KDC Rio Vista, Phường Phước Long B, Thành Phố Thủ Đức, Thành Phố Hồ Chí Minh.'),
  ('CL000286', 'CTY QUANG MINH GIANG', '0401766056', NULL, 'Nhom: TRUCKER
Dia chi: 40/20 Nguyen Huy Tuong, Hoa Minh Ward, Lien Chieu District, Da Nang City, Vietnam'),
  ('CL000287', 'LINH TUAN PHAT', '0402256192', NULL, 'Nhom: TRUCKER
Dia chi: 264 Dương Đình Nghệ, Phường An Hải, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000288', 'VAN TAI SON THANH', '4001176966', NULL, 'Nhom: TRUCKER
Dia chi: Ly Thuong Kiet Street, Block 5, Nui Thanh Town, Nui Thanh District, Quang Nam Province, Vietnam'),
  ('CL000289', 'HKD NGO TAN NHUT', '8544617025-001', NULL, 'Nhom: TRUCKER
Dia chi: Phuoc Tho Village, Tinh Giang Commune, Son Tinh District, Quang Ngai Province, Vietnam.'),
  ('CL000290', 'NHAT TRAM COMPANY', '0401667908', NULL, 'Nhom: TRUCKER
Dia chi: Lot B205 - Le Dai Hanh, Hoa Phat Ward, Cam Le District, Da Nang City, Vietnam'),
  ('CL000291', 'MID TRANSPORT', '0402255960', NULL, 'Nhom: TRUCKER
Dia chi: 89 Nguyễn Như Đãi, Phường Cẩm Lệ, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000292', 'VAN VY LONG COMPANY', '4001289430', NULL, 'Nhom: TRUCKER
Dia chi: Kieu Chau Village, Duy Son Commune, Duy Xuyen District, Quang Nam Province, Vietnam'),
  ('CL000293', 'DONG CHAN TRANSPORT', '0801092235', NULL, 'Nhom: TRUCKER
Dia chi: Thanh Lien Village, Lai Khe Commune, Kim Thanh District, Hai Duong Province, Vietnam'),
  ('CL000300', 'HAI AU', '0110383732', NULL, 'Nhom: TRUCKER'),
  ('CL000302', 'PVOIL QUANGNAM', '4300603574-001', NULL, 'Nhom: TRUCKER
Quoc gia: THAILAND'),
  ('CL000303', 'BAC TAY NGUYEN', '6101208220', '0905612468', 'Nhom: TRUCKER'),
  ('CL000304', 'TONG HOP HOA KHANH', '0400124881', NULL, 'Nhom: TRUCKER'),
  ('CL000306', 'VETC', '0107500414', NULL, 'Nhom: TRUCKER'),
  ('CL000450', 'ANH KHOI', '0314571445', NULL, 'Nhom: TRUCKER
Dia chi: 147A Nguyễn Thị Minh Khai, Phường Bến Thành, Thành phố Hồ Chí Minh, Việt Nam.'),
  ('CL000453', 'VTV- SX TM DV VTV', '4001012527', NULL, 'Nhom: TRUCKER
Dia chi: Số 211 Nông Cống, thôn Châu Hiệp, xã Nam Phước, Thành phố Đà Nẵng, Việt Nam'),
  ('CL000454', 'MEDLOG VIETNAM DEPOTS', '0201272677', NULL, 'Nhom: TRUCKER
Dia chi: Lot KB1.8 and Lot CN4-4, MP Dinh Vu Industrial Zone, Dong Hai Ward, Hai Phong City, Vietnam'),
  ('CL000477', 'DAI CAT LOGISTICS', '0313923020', NULL, 'Nhom: TRUCKER
Dia chi: 271/42/9 Lê Văn Lương, Phường Tân Hưng, Thành phố Hồ Chí Minh, Việt Nam'),
  ('CL000504', 'VAN TAI HAI VAN', '0314407251', NULL, 'Nhom: TRUCKER
Dia chi: 145/20/19A Đỗ Xuân Hợp, Phường Phước Long, TP Hồ Chí Minh, Việt Nam');

-- Khach DA CO trong bang voi cung ma so thue thi GAN ma, khong tao ho so thu
-- hai: hai dong cung mot cong ty trong o chon khach la loi nhap don.
--
-- DISTINCT ON de mot ma chi ve mot ho so: file co 2 ma so thue dung cho nhieu
-- ma CL, khong chot lai thi unique index no ngay giua migration.
--
-- NOT EXISTS de bo qua ma DA nam tren mot ho so khac. Thieu dong do thi lan
-- chay THU HAI no ngay: luc ay 697 ma da ton tai, nen ho so moi nao trung ma so
-- thue voi file cung bi gan lai dung cai ma da co. Da thu, duplicate key tren
-- customers_code_idx.
WITH khop AS (
  SELECT DISTINCT ON (n.tax_code) n.code, c.id
    FROM nhap_cl n
    JOIN customers c ON c.tax_code = n.tax_code AND c.code IS NULL
   WHERE n.tax_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM customers x WHERE x.code = n.code)
   ORDER BY n.tax_code, c.id
)
UPDATE customers c SET code = k.code FROM khop k WHERE c.id = k.id;

-- status 'approved': du lieu den tu he thong dang chay that, bat 697 ho so cho
-- nguoi duyet tay la chan viec chu khong phai kiem soat.
INSERT INTO customers (code, company_name, tax_code, phone, note, status)
SELECT n.code, n.company_name, n.tax_code, n.phone, n.note, 'approved'
  FROM nhap_cl n
 WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.code = n.code);

COMMIT;
