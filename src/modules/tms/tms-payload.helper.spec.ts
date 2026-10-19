import { dungPayloadTmsBill, thieuGiDeDay, type DonDeDay } from './tms-payload.helper';

/**
 * Contract OF1-TMS v1.3 (2026-10-08).
 *
 * `DU` là đơn XUẤT: theo mục 5.2, đầu lấy hàng là KHÁCH (địa chỉ text) còn đầu
 * giao là KHO/CẢNG (mã `receiverLocationId`). Đơn NHẬP ngược lại. Mỗi test chỉ
 * bớt đi đúng thứ nó muốn thử.
 */
const DU: DonDeDay = {
  code: 'E_FCL_20261006_001',
  desiredDate: null,
  originAddress: '123 Hoàng Diệu, Đà Nẵng',
  destinationAddress: '34 Nam Từ Liêm, Hà Nội',
  originProvince: 'Đà Nẵng',
  destinationProvince: 'Hà Nội',
  packageCount: null,
  quantityUnit: null,
  weightKg: null,
  volumeCbm: null,
  note: null,
  serviceChild: { tmsMode: 'EXPORT_FCL' },
  customer: { code: 'CL0123', companyName: 'Công ty Thử Nghiệm' },
  originLocation: { address: 'Kho Đà Nẵng', of1Id: 1042 },
  destinationLocation: { address: 'Kho Hà Nội', of1Id: 1077 },
};

/** Đơn NHẬP — hai đầu đổi vai so với `DU`. */
const NHAP: DonDeDay = { ...DU, serviceChild: { tmsMode: 'IMPORT_LCL' } };

const truong = (don: DonDeDay): string[] => thieuGiDeDay(don).map((t) => t.truong);

describe('thieuGiDeDay', () => {
  it('don du thong tin thi khong thieu gi', () => {
    expect(thieuGiDeDay(DU)).toEqual([]);
    expect(thieuGiDeDay(NHAP)).toEqual([]);
  });

  /**
   * Dau kho/cang THIEU ma OF1 thi KHONG chan — tut xuong dia chi chu.
   *
   * Luat cu chan tai cho, va no chan ca nhung dia diem khong the co ma: danh
   * muc dung tu bang gia, nen mot so dong la O GOM GIA ("CAT LAI, PHU HUU
   * TRANSIMEX, NHA BE" — ba cang chung mot muc cuoc). Ma OF1 tro toi MOT
   * cang, nen ba cang thi khong ma nao gan duoc va don ket vinh vien.
   */
  it('dau kho/cang thieu ma OF1 thi gui dia chi chu, khong chan', () => {
    const p = dungPayloadTmsBill({
      ...DU, destinationAddress: null, destinationProvince: 'TP. Hồ Chí Minh',
      destinationLocation: {
        name: 'CÁT LÁI, PHÚ HỮU TRANSIMEX, NHÀ BÈ', address: null, of1Id: null,
      },
    });
    expect(p).not.toHaveProperty('receiverLocationId');
    expect(p.deliveryAddress).toBe('CÁT LÁI, PHÚ HỮU TRANSIMEX, NHÀ BÈ, TP. Hồ Chí Minh');
  });

  it('don NHAP cung vay o dau nhan', () => {
    const p = dungPayloadTmsBill({
      ...NHAP, originAddress: null,
      originLocation: { name: 'Cảng Hải Phòng', address: null, of1Id: null },
    });
    expect(p).not.toHaveProperty('senderLocationId');
    expect(p.pickupAddress).toBe('Cảng Hải Phòng, Đà Nẵng');
  });

  /** Chan chi khi dau do KHONG CO GI CA — khong ma, khong ten, khong tinh. */
  it('chan khi dau kho/cang khong co ca ma lan ten', () => {
    expect(truong({
      ...DU, destinationAddress: null, destinationProvince: null,
      destinationLocation: { address: null, of1Id: null },
    })).toEqual(['deliveryAddress']);
  });

  /** Đầu KHÁCH không cần mã kho/cảng — OF1 nhận địa chỉ text ở đầu đó. */
  it('dau khach khong co ma kho/cang thi van day duoc', () => {
    expect(thieuGiDeDay({ ...DU, originLocation: { address: 'Kho', of1Id: null } })).toEqual([]);
    expect(thieuGiDeDay({ ...NHAP, destinationLocation: { address: 'Kho', of1Id: null } }))
      .toEqual([]);
  });

  /** Đầu kho/cảng không đòi địa chỉ text: OF1 tự điền từ danh mục. */
  it('dau kho/cang khong doi dia chi text', () => {
    expect(thieuGiDeDay({
      ...DU, destinationAddress: null, destinationProvince: null,
      destinationLocation: { address: null, of1Id: 1077 },
    })).toEqual([]);
  });

  it('thieu dich vu con thi thieu mode', () => {
    expect(truong({ ...DU, serviceChild: null })).toContain('mode');
  });

  /**
   * `PORTTRANSFER_*` là dịch vụ CÓ THẬT của công ty (4 dịch vụ con đang chạy)
   * nhưng không nằm trong 14 mã của contract. Chặn ở nhà kèm câu nói rõ, thay
   * vì gửi đi rồi ăn 400.
   */
  it('ma ngoai contract OF1 cung la thieu mode', () => {
    expect(truong({ ...DU, serviceChild: { tmsMode: 'PORTTRANSFER_FCL' } })).toContain('mode');
    expect(truong({ ...DU, serviceChild: { tmsMode: 'SEA_LCL' } })).toContain('mode');
  });

  /** Mã khách là KHOÁ, tên khách chỉ để đối chiếu — hai ô khác nhau. */
  it('thieu ma khach va ten khach la hai o rieng', () => {
    expect(truong({ ...DU, customer: null })).toEqual(['customerCode', 'customer']);
    expect(truong({ ...DU, customer: { code: null, companyName: 'Công ty A' } }))
      .toEqual(['customerCode']);
  });

  it('dia chi roi ve tinh/thanh thi van coi la co', () => {
    expect(thieuGiDeDay({
      ...DU, originAddress: null, originLocation: { address: null, of1Id: 1042 },
    })).toEqual([]);
  });

  it('liet ke DU moi o thieu, khong dung o o dau tien', () => {
    expect(truong({
      ...DU,
      serviceChild: null,
      customer: null,
      originAddress: null,
      originProvince: null,
      originLocation: null,
      /* Dau giao van du thong tin nen KHONG bi ke ten: cau tu choi chi noi
         dung nhung o that su con thieu. */
    })).toEqual(['mode', 'customerCode', 'customer', 'pickupAddress']);
  });

  it('moi o thieu deu noi cho sua', () => {
    expect(thieuGiDeDay({ ...DU, customer: null })[0]!.suaODau).toContain('Khách');
  });
});

describe('dungPayloadTmsBill', () => {
  /** v1.3 khoá tạo/cập nhật hoàn toàn theo `orderCode` — không còn `action`. */
  it('KHONG con gui action', () => {
    expect(dungPayloadTmsBill(DU)).not.toHaveProperty('action');
  });

  it('KHONG con gui sender_location_id kieu gach duoi', () => {
    expect(dungPayloadTmsBill(NHAP)).not.toHaveProperty('sender_location_id');
  });

  it('orderCode va fileNo deu la ma don BeeOps', () => {
    const p = dungPayloadTmsBill(DU);
    expect(p.orderCode).toBe('E_FCL_20261006_001');
    expect(p.fileNo).toBe('E_FCL_20261006_001');
  });

  /** Trước đây mã khách bị nhét vào ô `customer` — một ô mang hai nghĩa. */
  it('ma khach va ten khach di vao HAI o khac nhau', () => {
    const p = dungPayloadTmsBill(DU);
    expect(p.customerCode).toBe('CL0123');
    expect(p.customer).toBe('Công ty Thử Nghiệm');
  });

  /**
   * Đầu KHÁCH không gửi mã kho/cảng dù địa điểm đó có mã: master data của OF1
   * có cả `State`/`District`, nên một địa điểm trùng tên huyện sẽ mang mã của
   * HUYỆN. Gửi nó đi là nói "lấy hàng tại huyện X" thay vì tại địa chỉ khách.
   */
  it('don XUAT: dau giao gui locationId, dau nhan CHI gui dia chi', () => {
    const p = dungPayloadTmsBill(DU);
    expect(p.receiverLocationId).toBe(1077);
    expect(p).not.toHaveProperty('deliveryAddress');
    expect(p.pickupAddress).toBe('123 Hoàng Diệu, Đà Nẵng');
    expect(p).not.toHaveProperty('senderLocationId');
  });

  /**
   * Tai xe ben OF1 khong mo duoc man don cua ta: dia chi phai doc duoc mot
   * minh. Thieu tinh thi "12 Le Duan" la hang chuc duong tren ca nuoc; con
   * rot ve moi ten tinh thi don ghi "lay hang tai Da Nang", ca thanh pho.
   */
  /**
   * Muc 5.3 co `pickupContact`/`deliveryContact` dang `Ten_SDT`, nhung MAU o
   * muc 5.5 khong co chung nen lan dau doc contract ta bo sot. Tai xe khong
   * co so dien thoai thi den noi roi goi ai.
   */
  it('gui nguoi lien he o dau KHACH', () => {
    const p = dungPayloadTmsBill({
      ...DU,
      customer: { code: 'CL1', companyName: 'Cty A', contactName: 'Chị Lan', phone: '0900000099' },
    });
    expect(p.pickupContact).toBe('Chị Lan_0900000099');
    expect(p).not.toHaveProperty('deliveryContact');
  });

  it('chi co so dien thoai thi van gui', () => {
    expect(dungPayloadTmsBill({
      ...DU, customer: { code: 'CL1', companyName: 'Cty A', contactName: null, phone: '0900' },
    }).pickupContact).toBe('0900');
  });

  it('khach khong co lien he thi bo han truong do', () => {
    expect(dungPayloadTmsBill(DU)).not.toHaveProperty('pickupContact');
  });

  /** Don noi dia: hai dau deu la khach, ca hai cung mot nguoi lien he. */
  it('don noi dia gui ca hai dau', () => {
    const p = dungPayloadTmsBill({
      ...DU, serviceChild: { tmsMode: 'DOMESTIC_LCL' },
      customer: { code: 'CL1', companyName: 'Cty A', contactName: 'Anh Ba', phone: null },
    });
    expect(p.pickupContact).toBe('Anh Ba');
    expect(p.deliveryContact).toBe('Anh Ba');
  });

  it('dia chi khach LUON kem tinh', () => {
    expect(dungPayloadTmsBill({
      ...DU, originAddress: '12 Lê Duẩn', originLocation: null,
    }).pickupAddress).toBe('12 Lê Duẩn, Đà Nẵng');
  });

  it('khong lap tinh khi doan cuoi da la ten tinh', () => {
    expect(dungPayloadTmsBill({
      ...DU, originAddress: '12 Lê Duẩn, TP. Đà Nẵng', originLocation: null,
    }).pickupAddress).toBe('12 Lê Duẩn, TP. Đà Nẵng');
  });

  /** Dia diem TRUNG ten tinh: ghep nua thi ra "Ben Tre, Ben Tre". */
  it('khong lap khi ten dia diem chinh la ten tinh', () => {
    expect(dungPayloadTmsBill({
      ...DU, originAddress: null, originProvince: 'Bến Tre',
      originLocation: { name: 'BẾN TRE', address: null, of1Id: null },
    }).pickupAddress).toBe('BẾN TRE');
  });

  /**
   * "Cang Da Nang" CO chua "Da Nang" nhung do la TEN RIENG cua cai cang chu
   * khong phai o tinh. Khong ghep thi dong dia chi mat tinh, dung luc ten rieng
   * tinh co nhac den no.
   */
  it('ten rieng chua ten tinh thi VAN ghep', () => {
    expect(dungPayloadTmsBill({
      ...DU, destinationAddress: null, destinationProvince: 'Đà Nẵng',
      serviceChild: { tmsMode: 'DOMESTIC_LCL' },
      destinationLocation: { name: 'CẢNG ĐÀ NẴNG', address: null, of1Id: null },
    }).deliveryAddress).toBe('CẢNG ĐÀ NẴNG, Đà Nẵng');
  });

  it('chi co tinh thi van gui tinh', () => {
    expect(dungPayloadTmsBill({
      ...DU, originAddress: null, originLocation: null,
    }).pickupAddress).toBe('Đà Nẵng');
  });

  /**
   * 790/791 dong trong danh muc dia diem khong co cot `address`: danh muc
   * dung tu bang gia noi dia, noi dia diem duoc nhan dang bang TEN. Chi doc
   * `address` thi don rot thang ve ten tinh, mat ca huyen lan khu cong
   * nghiep ma man hinh dang hien.
   */
  it('dia diem khong co cot address thi lay TEN', () => {
    expect(dungPayloadTmsBill({
      ...DU, originAddress: null,
      originLocation: { name: 'KCN Mỹ Phước 2', address: null, of1Id: null },
    }).pickupAddress).toBe('KCN Mỹ Phước 2, Đà Nẵng');
  });

  it('co cot address thi address thang ten', () => {
    expect(dungPayloadTmsBill({
      ...DU, originAddress: null,
      originLocation: { name: 'Vietmind', address: '12 Lê Duẩn', of1Id: null },
    }).pickupAddress).toBe('12 Lê Duẩn, Đà Nẵng');
  });

  it('don NHAP: dau nhan gui locationId, dau giao gui dia chi', () => {
    const p = dungPayloadTmsBill(NHAP);
    expect(p.senderLocationId).toBe(1042);
    expect(p).not.toHaveProperty('pickupAddress');
    expect(p.deliveryAddress).toBe('34 Nam Từ Liêm, Hà Nội');
    expect(p).not.toHaveProperty('receiverLocationId');
  });

  /** Thiếu đơn vị là OF1 trả 400 cho CẢ request, mất luôn những ô đã khai đúng. */
  it('quantity luon di kem quantityUnit', () => {
    const p = dungPayloadTmsBill({ ...DU, packageCount: 7 });
    expect(p.quantity).toBe(7);
    expect(p.quantityUnit).toBe('PK');
  });

  it('don co khai don vi thi gui dung don vi do', () => {
    expect(dungPayloadTmsBill({ ...DU, packageCount: 3, quantityUnit: 'PP' }).quantityUnit)
      .toBe('PP');
  });

  /**
   * Ma la roi ve PK thay vi gui nguyen: OF1 tu choi NGUYEN request neu don vi
   * khong co trong danh muc, mat luon ca nhung o da khai dung.
   */
  it('don vi ngoai danh muc roi ve PK', () => {
    expect(dungPayloadTmsBill({ ...DU, packageCount: 3, quantityUnit: 'KHONG_CO' }).quantityUnit)
      .toBe('PK');
  });

  it('khong khai so kien thi bo ca hai khoa', () => {
    const p = dungPayloadTmsBill(DU);
    expect(p).not.toHaveProperty('quantity');
    expect(p).not.toHaveProperty('quantityUnit');
  });

  it('giu so 0 vi 0 khac han "khong khai"', () => {
    const p = dungPayloadTmsBill({ ...DU, packageCount: 0 });
    expect(p.quantity).toBe(0);
    expect(p.quantityUnit).toBe('PK');
  });

  // Cot desiredDate la DATE, Prisma tra nua dem UTC. Doc theo gio may chu thi
  // may o mui gio am lui mat mot ngay.
  it('deliveryPlan dung dinh dang yyyy-MM-dd HH:mm:ss', () => {
    expect(dungPayloadTmsBill({ ...DU, desiredDate: new Date('2026-10-05T00:00:00Z') })
      .deliveryPlan).toBe('2026-10-05 00:00:00');
  });

  it('o khong bat buoc ma trong thi BO HAN, khong gui null', () => {
    const p = dungPayloadTmsBill(DU);
    expect(p).not.toHaveProperty('note');
    expect(p).not.toHaveProperty('deliveryPlan');
  });

  it('so am thi BO — OF1 tu choi nguyen request chu khong bo qua mot truong', () => {
    expect(dungPayloadTmsBill({ ...DU, weightKg: -5 })).not.toHaveProperty('weight');
  });

  it('Decimal cua Prisma ve dang chuoi van ra JSON number', () => {
    expect(dungPayloadTmsBill({ ...DU, weightKg: '1500.5' }).weight).toBe(1500.5);
  });

  // Goi nham thu tu la gui di mot payload thieu truong bat buoc, va OF1 tra
  // 400 cho MOT don ma ta da chiem cho trong CSDL.
  it('NEM LOI neu goi khi don con thieu o bat buoc', () => {
    expect(() => dungPayloadTmsBill({ ...DU, customer: null })).toThrow(/thiếu/i);
  });
});

describe('ma dia chi khach (070)', () => {
  /**
   * Co ma thi OF1 tu dien dia chi day du, toa do va nguoi lien he nhu don
   * nhap tay (muc 5.2). Gui ca hai la hai nguon cho mot dau tuyen, ma ta
   * khong biet ben kia chon gi.
   */
  it('don XUAT: dau nhan gui MA thay vi chu', () => {
    const p = dungPayloadTmsBill({ ...DU, maDiaChiLay: 'A01' });
    expect(p.pickupAddressCode).toBe('A01');
    expect(p).not.toHaveProperty('pickupAddress');
  });

  it('don NHAP: dau giao gui MA thay vi chu', () => {
    const p = dungPayloadTmsBill({ ...NHAP, maDiaChiGiao: 'A02' });
    expect(p.deliveryAddressCode).toBe('A02');
    expect(p).not.toHaveProperty('deliveryAddress');
  });

  /** Chua co ma thi van gui chu — contract muc 5.2 cho phep, chi thieu toa do. */
  it('chua co ma thi roi ve dia chi dang chu', () => {
    const p = dungPayloadTmsBill({ ...DU, maDiaChiLay: null });
    expect(p.pickupAddress).toBe('123 Hoàng Diệu, Đà Nẵng');
    expect(p).not.toHaveProperty('pickupAddressCode');
  });

  /** Dau kho/cang khong dung ma dia chi khach, du don co mang theo. */
  it('dau kho/cang bo qua ma dia chi khach', () => {
    const p = dungPayloadTmsBill({ ...DU, maDiaChiGiao: 'A03' });
    expect(p.receiverLocationId).toBe(1077);
    expect(p).not.toHaveProperty('deliveryAddressCode');
  });
});

describe('so HBL va ma booking (071)', () => {
  /**
   * Hai khoa nay khai trong kieu tu dau nhung chua bao gio duoc dien, vi
   * BeeOps khong co cho nao luu — doc ma nguon se tuong la co. Gio chung la
   * o rieng cua bon dich vu day sang OF1.
   */
  it('doc tu o rieng cua dich vu', () => {
    const p = dungPayloadTmsBill({
      ...DU, serviceData: { hbl_no: 'ASKJVA08063S', booking_code: 'BSNHPG260348' },
    });
    expect(p.hblNo).toBe('ASKJVA08063S');
    expect(p.bookingCode).toBe('BSNHPG260348');
  });

  /** Don cu khong co khoa nay, dich vu khac khong co o nay — ca hai KHONG phai loi. */
  it('khong co thi BO HAN, khong gui chuoi rong', () => {
    expect(dungPayloadTmsBill(DU)).not.toHaveProperty('hblNo');
    expect(dungPayloadTmsBill({ ...DU, serviceData: {} })).not.toHaveProperty('bookingCode');
    expect(dungPayloadTmsBill({ ...DU, serviceData: { hbl_no: '   ' } }))
      .not.toHaveProperty('hblNo');
  });

  /** Kieu la thi bo qua, khong ep thanh chuoi "[object Object]". */
  it('gia tri khong phai chuoi thi bo qua', () => {
    expect(dungPayloadTmsBill({ ...DU, serviceData: { hbl_no: 123 } }))
      .not.toHaveProperty('hblNo');
    expect(dungPayloadTmsBill({ ...DU, serviceData: null })).not.toHaveProperty('hblNo');
  });
});
