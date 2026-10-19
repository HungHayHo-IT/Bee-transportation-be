import PDFDocument from 'pdfkit';
import { join } from 'path';
import { docSoTien } from './doc-so-tien.helper';

// pdfkit chỉ có Helvetica -> mất dấu tiếng Việt. Nhúng DejaVuSans (có sẵn trong deps).
const FONT_DIR = join(process.cwd(), 'node_modules', 'dejavu-fonts-ttf', 'ttf');
const FONT = join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = join(FONT_DIR, 'DejaVuSans-Bold.ttf');

const LE = 50;
/** Ô để trống trên hợp đồng vẽ thành đường chấm, không bỏ trắng — xem `oTrong`. */
const CHAM = '…………………………………';

export interface BenHopDong {
  ten: string;
  diaChi: string;
  mst: string;
  dienThoai: string;
  email: string;
  /** Người đại diện ký. Bên B ký điện tử nên để trống, tên nằm ở trang chữ ký. */
  daiDien?: string;
  chucVu?: string;
}

export interface DongNoiDung {
  nhan: string;
  giaTri: string;
}

export interface DuLieuHopDong {
  maDon: string;
  benA: BenHopDong;
  benB: BenHopDong;
  /** Các dòng của Điều 1, đã dựng sẵn ở nơi gọi vì chúng phụ thuộc dịch vụ. */
  noiDung: DongNoiDung[];
  /** null = người in không có quyền xem tiền. Hợp đồng vẫn in, ô tiền bỏ trống. */
  giaTri: number | null;
  ghiChu: string | null;
  /** Toàn văn điều khoản, đánh số từ Điều 3 trở đi. */
  dieuKhoan: string;
  inBoi: string;
  inLuc: Date;
}

/** Giá trị rỗng in thành đường chấm: tờ hợp đồng không được có chỗ trắng không rõ nghĩa. */
const oTrong = (v: string | undefined | null): string => (v && v.trim() ? v.trim() : CHAM);

const vnd = (n: number): string => n.toLocaleString('vi-VN') + ' đồng';

/**
 * Phiếu xác nhận đơn hàng, in ra dưới dạng HỢP ĐỒNG VẬN CHUYỂN.
 *
 * Dạng hợp đồng chứ không phải tờ tóm tắt, vì đây chính là thứ khách ký điện tử
 * vào. Một tờ tóm tắt ký xong không nói được hai bên đã thoả thuận điều gì;
 * muốn nó có sức nặng thì trên giấy phải có đủ: hai pháp nhân, nội dung công
 * việc, giá trị, và các điều khoản ràng buộc.
 *
 * Điều khoản in NGUYÊN VĂN từ cấu hình và được đánh số từ Điều 3, nối tiếp
 * Điều 1 (nội dung) và Điều 2 (giá trị) do hàm này dựng. Ghép số như vậy để tờ
 * giấy đọc liền mạch một mạch từ trên xuống.
 */
export function hopDongPdf(d: DuLieuHopDong): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: LE, font: FONT });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const xong = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  quocHieu(doc);
  tieuDe(doc, d);
  moDau(doc, d.inLuc);
  ben(doc, 'BÊN A (BÊN VẬN CHUYỂN)', d.benA, true);
  ben(doc, 'BÊN B (BÊN THUÊ VẬN CHUYỂN)', d.benB, false);

  doc.moveDown(0.6);
  doc.font(FONT).fontSize(10)
    .text('Hai bên thống nhất ký kết hợp đồng vận chuyển hàng hóa với các điều khoản sau:');

  dieu1(doc, d);
  dieu2(doc, d);
  dieuKhoanConLai(doc, d.dieuKhoan);
  khoiKy(doc, d);

  doc.end();
  return xong;
}

type Doc = PDFKit.PDFDocument;

function quocHieu(doc: Doc): void {
  doc.font(FONT_BOLD).fontSize(11)
    .text('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { align: 'center' });
  doc.font(FONT_BOLD).fontSize(10.5).text('Độc lập - Tự do - Hạnh phúc', { align: 'center' });
  doc.font(FONT).fontSize(10).text('---------------', { align: 'center' });
}

function tieuDe(doc: Doc, d: DuLieuHopDong): void {
  doc.moveDown(1.2);
  doc.font(FONT_BOLD).fontSize(16).text('HỢP ĐỒNG VẬN CHUYỂN HÀNG HÓA', { align: 'center' });
  doc.moveDown(0.25);
  doc.font(FONT).fontSize(10.5).text(`Số: ${d.maDon}`, { align: 'center' });
}

function moDau(doc: Doc, luc: Date): void {
  doc.moveDown(1);
  const ngay = luc.getDate();
  const thang = luc.getMonth() + 1;
  const nam = luc.getFullYear();
  doc.font(FONT).fontSize(10)
    .text(`Hôm nay, ngày ${ngay} tháng ${thang} năm ${nam}, các bên gồm:`);
}

function ben(doc: Doc, tieuDeBen: string, b: BenHopDong, coDaiDien: boolean): void {
  doc.moveDown(0.7);
  doc.font(FONT_BOLD).fontSize(10.5).text(tieuDeBen);
  doc.moveDown(0.2);
  doc.font(FONT_BOLD).fontSize(10).text(oTrong(b.ten));

  const dong = (nhan: string, giaTri: string): void => {
    doc.font(FONT).fontSize(10).text(`${nhan}: `, { continued: true });
    doc.text(giaTri);
  };

  dong('Địa chỉ', oTrong(b.diaChi));
  dong('Mã số thuế', oTrong(b.mst));
  dong('Điện thoại', oTrong(b.dienThoai));
  dong('Email', oTrong(b.email));
  if (coDaiDien) {
    dong('Người đại diện', oTrong(b.daiDien));
    dong('Chức vụ', oTrong(b.chucVu));
  }
}

function dieu1(doc: Doc, d: DuLieuHopDong): void {
  doc.moveDown(0.9);
  doc.font(FONT_BOLD).fontSize(10.5).text('ĐIỀU 1. NỘI DUNG VẬN CHUYỂN');
  doc.moveDown(0.3);
  for (const { nhan, giaTri } of d.noiDung) {
    doc.font(FONT).fontSize(10).text(`${nhan}: `, { continued: true });
    doc.text(giaTri || CHAM);
  }
}

function dieu2(doc: Doc, d: DuLieuHopDong): void {
  doc.moveDown(0.9);
  doc.font(FONT_BOLD).fontSize(10.5).text('ĐIỀU 2. GIÁ TRỊ HỢP ĐỒNG');
  doc.moveDown(0.3);

  if (d.giaTri === null) {
    // Người in không có quyền xem tiền: để TRỐNG, không in số 0 — số 0 trên hợp
    // đồng là một cam kết miễn phí.
    doc.font(FONT).fontSize(10).text(`2.1. Giá trị hợp đồng: ${CHAM}`);
  } else {
    doc.font(FONT).fontSize(10).text('2.1. Giá trị hợp đồng: ', { continued: true });
    doc.font(FONT_BOLD).text(vnd(d.giaTri));
    const chu = docSoTien(d.giaTri);
    // Thiếu dòng chữ còn hơn một dòng chữ đọc sai nằm cạnh con số đúng.
    if (chu) doc.font(FONT).fontSize(10).text(`Bằng chữ: ${chu}.`);
  }

  if (d.ghiChu) {
    doc.font(FONT).fontSize(10).text(`2.2. Ghi chú: ${d.ghiChu}`);
  }
}

/** Nhận ra dòng tiêu đề điều khoản để in đậm, phần còn lại in thường. */
const LA_TIEU_DE_DIEU = /^ĐIỀU\s+\d+\./;

function dieuKhoanConLai(doc: Doc, toanVan: string): void {
  for (const dong of toanVan.split('\n')) {
    const chu = dong.trim();
    if (!chu) {
      doc.moveDown(0.5);
      continue;
    }
    if (LA_TIEU_DE_DIEU.test(chu)) {
      doc.moveDown(0.5);
      doc.font(FONT_BOLD).fontSize(10.5).text(chu);
      doc.moveDown(0.2);
    } else {
      doc.font(FONT).fontSize(10).text(chu, { align: 'justify' });
    }
  }
}

/** Chiều cao tối thiểu để khối ký không bị cắt làm đôi sang trang sau. */
const CAO_KHOI_KY = 150;

function khoiKy(doc: Doc, d: DuLieuHopDong): void {
  // Khối ký bị tách đôi qua hai trang là lỗi dễ thấy nhất trên một tờ hợp đồng.
  if (doc.y > doc.page.height - LE - CAO_KHOI_KY) doc.addPage();

  doc.moveDown(1.5);
  const yDau = doc.y;
  const rong = (doc.page.width - LE * 2) / 2;

  doc.font(FONT_BOLD).fontSize(10)
    .text('ĐẠI DIỆN BÊN A', LE, yDau, { width: rong, align: 'center' });
  doc.font(FONT).fontSize(9).text('(Ký, ghi rõ họ tên, đóng dấu)', { width: rong, align: 'center' });

  doc.font(FONT_BOLD).fontSize(10)
    .text('ĐẠI DIỆN BÊN B', LE + rong, yDau, { width: rong, align: 'center' });
  doc.font(FONT).fontSize(9)
    .text('(Ký xác nhận điện tử — xem trang cuối)', LE + rong, doc.y, {
      width: rong,
      align: 'center',
    });

  doc.moveDown(5);
  doc.font(FONT).fontSize(8).fillColor('#666')
    .text(
      `Bản in bởi ${d.inBoi} lúc ${d.inLuc.toLocaleString('vi-VN')}`,
      LE,
      doc.y,
      { width: doc.page.width - LE * 2, align: 'left' },
    );
}
