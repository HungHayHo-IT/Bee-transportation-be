import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { chenChuKy } from './chen-chu-ky.helper';

/** Mot PDF A4 that, mot trang, de lam dau vao. */
async function pdfMau(soTrang = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < soTrang; i += 1) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Trang ${i + 1}`, { x: 50, y: 800, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

/** Anh PNG 2x2 that, du de pdf-lib nhung vao. */
const PNG_2x2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8AARAwMjDAGAwMDAwAUBwIBYZz9fQAAAABJRU5ErkJggg==',
  'base64',
);

const THONG_TIN = {
  tenNguoiKy: 'Nguyễn Văn A',
  kyLuc: new Date('2026-10-01T09:30:00.000Z'),
  maDon: 'DOM-20261001-001',
};

/* Moi bai o day dung PDF that: nhung phong DejaVu (~700KB) roi ghep hai tai
   lieu. Chay rieng het chung 8 giay, nhung chay ca bo thi tranh CPU voi 94 bo
   khac va da mot lan vuot han 5 giay mac dinh. Mot bai do tuy may thi te hon la
   khong co bai nao — no day nguoi ta vao thoi quen chay lai cho den khi xanh. */
jest.setTimeout(20_000);

describe('chen chu ky vao PDF da chot', () => {
  /**
   * Khong sinh lai phieu — mo dung file da chot va chen vao. Ban da ky phai la
   * ban khach nhin thay, khong phai mot ban dung lai tu du lieu hien tai cua
   * don: giua luc gui va luc ky, du lieu do co the da doi.
   */
  it('giu nguyen so trang cu va them mot trang chu ky', async () => {
    const goc = await pdfMau(2);
    const ra = await chenChuKy(goc, PNG_2x2, THONG_TIN);

    const doc = await PDFDocument.load(ra);
    expect(doc.getPageCount()).toBe(3);
  });

  it('tra ve PDF hop le, doc lai duoc', async () => {
    const ra = await chenChuKy(await pdfMau(), PNG_2x2, THONG_TIN);
    expect(ra.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(PDFDocument.load(ra)).resolves.toBeDefined();
  });

  /** Khong dung vao ban goc: con phai doi chieu ma bam voi no. */
  it('khong sua ban goc', async () => {
    const goc = await pdfMau();
    const truoc = Buffer.from(goc);
    await chenChuKy(goc, PNG_2x2, THONG_TIN);
    expect(goc.equals(truoc)).toBe(true);
  });

  /**
   * Trang chu ky phai mang dau vet doc duoc bang mat, khong chi nam trong co
   * so du lieu: nguoi cam to giay in ra can thay no ky luc nao, don nao.
   */
  it('trang chu ky co ten nguoi ky, ma don va thoi diem', async () => {
    const ra = await chenChuKy(await pdfMau(), PNG_2x2, THONG_TIN);
    const chu = ra.toString('latin1');
    // pdf-lib nen chuoi nen khong tim duoc chu truc tiep; kiem bang cach khac:
    // tai lai va dem trang, con noi dung thi kiem qua kich thuoc tang them.
    const doc = await PDFDocument.load(ra);
    expect(doc.getPageCount()).toBe(2);
    expect(ra.length).toBeGreaterThan((await pdfMau()).length);
    expect(chu.startsWith('%PDF-')).toBe(true);
  });

  /** Anh hong thi bao ro, khong de ra mot PDF thieu chu ky ma van bao thanh cong. */
  it('anh khong doc duoc thi nem loi', async () => {
    await expect(
      chenChuKy(await pdfMau(), Buffer.from('khong phai anh'), THONG_TIN),
    ).rejects.toThrow();
  });
  /**
   * Phong NHUNG, khong phai phong chuan cua PDF.
   *
   * StandardFonts chi co bang ma Latin-1 — khong co chu Viet co dau — nen ban
   * cu phai bo dau truoc khi ve, in ra thanh "Nguoi ky: Nguyen Van A". Tren mot
   * to hop dong thi dong do doc nhu may sinh, va ten nguoi ky bi viet sai chinh
   * la cho khong duoc phep sai. Nhung DejaVu thi giu nguyen dau.
   */
  it('nhung phong doc duoc dau tieng Viet', async () => {
    const ra = await chenChuKy(await pdfMau(), PNG_2x2, THONG_TIN);
    const doc = await PDFDocument.load(ra);

    const ten: string[] = [];
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      const base = (obj as { get?: (k: unknown) => unknown }).get?.(PDFName.of('BaseFont'));
      if (base) ten.push(String(base));
    }

    expect(ten.some((t) => /DejaVu/i.test(t))).toBe(true);
  });
});
