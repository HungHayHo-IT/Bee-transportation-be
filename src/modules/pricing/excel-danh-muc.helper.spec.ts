import * as ExcelJS from 'exceljs';
import { TEN_TRANG_DANH_MUC, themODuocChon, themTrangDanhMuc } from './excel-danh-muc.helper';

/** Dung mot file bang gia rong, dung nam cot nhu file that. */
function dungFile(): { wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet } {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bảng giá');
  ws.columns = [
    { header: 'Điểm đi', key: 'origin' },
    { header: 'Điểm đến', key: 'destination' },
    { header: 'Dịch vụ', key: 'service' },
    { header: 'Giá (VND)', key: 'price' },
    { header: 'Ghi chú', key: 'note' },
  ];
  return { wb, ws };
}

const DIA_DIEM = [
  { name: 'Kho Đà Nẵng', province: 'Đà Nẵng' },
  { name: 'Kho Tam Kỳ', province: 'Quảng Nam' },
];
const DON_VI = [{ name: "20'DC ≤ 17 tấn" }, { name: 'Xe 5T' }, { name: 'Theo khối (CBM)' }];

describe('trang Danh muc', () => {
  it('liet ke du ca hai danh sach, du dai ngan khac nhau', () => {
    const { wb } = dungFile();
    const dem = themTrangDanhMuc(wb, DIA_DIEM, DON_VI);
    expect(dem).toEqual({ soDiaDiem: 2, soDonVi: 3 });

    const dm = wb.getWorksheet(TEN_TRANG_DANH_MUC);
    expect(dm?.getCell('A2').value).toBe('Kho Đà Nẵng');
    expect(dm?.getCell('B2').value).toBe('Đà Nẵng');
    expect(dm?.getCell('C2').value).toBe("20'DC ≤ 17 tấn");
    // Cac danh sach di song song theo chi so, khong ghep cap: dong 3 co dia
    // diem nhung khong co dich vu, va do la dung.
    expect(dm?.getCell('A3').value).toBe('Kho Tam Kỳ');
    // Danh sach don vi tinh dai hon danh sach dia diem nen dong 4 chi co no.
    expect(dm?.getCell('A4').value).toBe('');
    expect(dm?.getCell('C4').value).toBe('Theo khối (CBM)');
  });
});

describe('o duoc chon tren file bang gia', () => {
  /**
   * Bon cot TEN co danh sach chon; cot gia va ghi chu thi khong.
   *
   * Tu 059 (bo cot Dich vu) cot C la Don vi tinh, gia sang D, ghi chu sang E.
   * Ca truyen soDonVi = 0 thi cot C mat o chon ma khong co gi bao - kiem ca hai.
   */
  it('ba cot ten deu co danh sach chon, cot gia va ghi chu thi khong', () => {
    const { wb, ws } = dungFile();
    const dm = themTrangDanhMuc(wb, DIA_DIEM, DON_VI);
    themODuocChon(ws, dm.soDiaDiem, dm.soDonVi, 0);

    for (const o of ['A2', 'B2', 'C2']) {
      expect(ws.getCell(o).dataValidation?.type).toBe('list');
    }
    expect(ws.getCell('D2').dataValidation).toBeUndefined();
    expect(ws.getCell('E2').dataValidation).toBeUndefined();
  });

  /** Danh muc don vi tinh rong thi KHONG gan gi: o chon tro vao vung rong lam
      Excel bao file hong. */
  it('khong co don vi tinh thi cot C khong gan o chon', () => {
    const { wb, ws } = dungFile();
    const dm = themTrangDanhMuc(wb, DIA_DIEM);
    themODuocChon(ws, dm.soDiaDiem, dm.soDonVi, 0);
    expect(ws.getCell('D2').dataValidation).toBeUndefined();
  });

  /** Diem di va diem den doc CUNG mot cot dia diem — khong phai hai danh sach. */
  it('diem di va diem den cung tro vao cot dia diem', () => {
    const { wb, ws } = dungFile();
    const { soDiaDiem, soDonVi } = themTrangDanhMuc(wb, DIA_DIEM, DON_VI);
    themODuocChon(ws, soDiaDiem, soDonVi, 0);

    const a = ws.getCell('A2').dataValidation?.formulae?.[0];
    expect(a).toBe(ws.getCell('B2').dataValidation?.formulae?.[0]);
    // Ten trang co dau cach nen phai boc nhay don, khong thi Excel doc thanh
    // hai thu khac nhau va o chon im lang khong hien gi.
    expect(a).toBe(`'${TEN_TRANG_DANH_MUC}'!$A$2:$A$3`);
    // Cot C la Don vi tinh (059), tro vao chinh cot C cua trang Danh muc.
    expect(ws.getCell('C2').dataValidation?.formulae?.[0])
      .toBe(`'${TEN_TRANG_DANH_MUC}'!$C$2:$C$4`);
  });

  /** Gan du ra cho nguoi dung con them tuyen moi ma van duoc chon. */
  it('gan ca nhung dong chua co du lieu', () => {
    const { wb, ws } = dungFile();
    const { soDiaDiem } = themTrangDanhMuc(wb, DIA_DIEM);
    themODuocChon(ws, soDiaDiem, 0, 0);
    expect(ws.getCell('A100').dataValidation?.type).toBe('list');
  });

  /**
   * Mot o chon tro vao vung RONG lam Excel bao file hong — tuc la doi mot bat
   * tien lay mot file khong mo duoc.
   */
  it('danh muc rong thi khong gan gi ca', () => {
    const { wb, ws } = dungFile();
    const { soDiaDiem, soDonVi } = themTrangDanhMuc(wb, [], []);
    themODuocChon(ws, soDiaDiem, soDonVi, 0);
    for (const o of ['A2', 'B2', 'C2']) {
      expect(ws.getCell(o).dataValidation).toBeUndefined();
    }
  });

  it('chi thieu don vi tinh thi hai cot dia diem van co', () => {
    const { wb, ws } = dungFile();
    const { soDiaDiem, soDonVi } = themTrangDanhMuc(wb, DIA_DIEM, []);
    themODuocChon(ws, soDiaDiem, soDonVi, 0);
    expect(ws.getCell('A2').dataValidation?.type).toBe('list');
    expect(ws.getCell('C2').dataValidation).toBeUndefined();
  });

  /**
   * File phai mo lai duoc that, khong chi dung trong bo nho.
   *
   * Han 30 giay chu khong phai 5 giay mac dinh: test nay ghi va doc lai mot
   * file xlsx that, nang CPU. Chay rieng het khoang 4 giay, nhung trong ca bo
   * — muoi may worker tranh CPU cung luc — no da vuot 5 giay, roi vuot ca 15
   * giay. Mot test do vi may ban chu khong vi ma nguon sai la test khong dung
   * duoc: lan sau nguoi ta se bo qua no, ke ca khi no bao dung.
   *
   * Day la lan nong thu HAI. Nong mai khong phai cach sua — cai dat o day nang
   * that, va neu no con do nua thi viec can lam la do thoi gian thuc te roi tach
   * phan ghi/doc file ra khoi bo chay song song, chu khong phai them mot so khong
   * nua. Ghi lai de lan sau khong ai nong len 60 giay.
   */
  it('ghi ra roi doc lai van con danh sach chon', async () => {
    const { wb, ws } = dungFile();
    const { soDiaDiem } = themTrangDanhMuc(wb, DIA_DIEM);
    themODuocChon(ws, soDiaDiem, 0, 0);

    const buf = await wb.xlsx.writeBuffer();
    const lai = new ExcelJS.Workbook();
    await lai.xlsx.load(buf as ArrayBuffer);
    expect(lai.getWorksheet('Bảng giá')?.getCell('A2').dataValidation?.type).toBe('list');
  }, 30_000);
});
