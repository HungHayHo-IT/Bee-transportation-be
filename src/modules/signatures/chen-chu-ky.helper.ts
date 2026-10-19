import { BadRequestException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { join } from 'path';
import { PDFDocument as PdfLib, rgb } from 'pdf-lib';

export interface ThongTinKy {
  tenNguoiKy: string;
  kyLuc: Date;
  maDon: string;
}

// Cùng bộ phông với hợp đồng: trang chữ ký phải đọc liền mạch với phần trước nó.
const FONT_DIR = join(process.cwd(), 'node_modules', 'dejavu-fonts-ttf', 'ttf');
const FONT = join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = join(FONT_DIR, 'DejaVuSans-Bold.ttf');

const KHO_A4: [number, number] = [595, 842];
const LE = 50;
const RONG_CHU_KY = 220;
const CAO_CHU_KY_TOI_DA = 90;
/* Hai mốc cố định, tính từ MÉP TRÊN trang: nhãn "Chữ ký của Bên B" và gạch
   chân chỗ ký. Cố định chứ không chạy theo dòng chữ vì hai thư viện cùng vẽ
   lên trang này và chúng đo trục y ngược chiều nhau — phải có mốc chung.

   Khoảng giữa hai mốc là chỗ dành cho ảnh. Ảnh ĐỨNG TRÊN gạch chân (chữ ký
   trên giấy nằm trên dòng kẻ), nên ảnh càng thấp thì khoảng trống phía trên
   càng rộng; chọn hai con số này để cả ảnh cao nhất lẫn thấp nhất đều không
   đè vào nhãn mà cũng không bỏ lại một mảng trắng giữa trang. */
const TU_TREN_TOI_NHAN = 215;
const TU_TREN_TOI_GACH = 340;

/**
 * Chèn chữ ký vào bản PDF ĐÃ CHỐT, không sinh lại hợp đồng.
 *
 * Đây là điểm mấu chốt của cả tính năng: bản đã ký phải đúng là bản khách nhìn
 * thấy lúc bấm xác nhận. Nếu dựng lại hợp đồng từ dữ liệu hiện tại của đơn thì
 * giữa lúc gửi và lúc ký dữ liệu có thể đã đổi, và bản ký ra sẽ khác bản khách
 * đọc — lúc đó chữ ký không chứng minh được gì.
 *
 * Chữ ký nằm trên một trang MỚI ở cuối chứ không đè lên trang cuối: trang cuối
 * của hợp đồng có thể đã kín chữ, và đè lên là làm hỏng chính thứ đang được ký.
 *
 * MỖI THƯ VIỆN LÀM PHẦN NÓ LÀM TỐT. Chữ do pdfkit vẽ vì nó nhúng được DejaVu,
 * giữ nguyên dấu tiếng Việt — bản trước vẽ bằng pdf-lib với phông chuẩn PDF
 * (bảng mã Latin-1) nên phải bỏ dấu, in ra thành "Nguoi ky: Nguyen Van A", mà
 * trên hợp đồng thì tên người ký là chỗ không được phép sai. Ảnh thì do pdf-lib
 * nhúng vì nó đọc được nhiều biến thể PNG hơn: đã thử, có ảnh PNG hợp lệ pdfkit
 * từ chối. Chỗ này là bước cuối cùng khách bấm sau khi đã nhập mã, nên hỏng ở
 * đây là tệ nhất — chọn thư viện dễ tính hơn.
 */
export async function chenChuKy(
  pdfGoc: Buffer,
  anhPng: Buffer,
  tt: ThongTinKy,
): Promise<Buffer> {
  /* Chép sang Uint8Array mới: `load` có thể giữ tham chiếu tới buffer đưa vào,
     mà bản gốc còn phải đối chiếu mã băm sau này. */
  const doc = await PdfLib.load(new Uint8Array(pdfGoc));

  const nen = await PdfLib.load(new Uint8Array(await veChu(tt)));
  const [trang] = await doc.copyPages(nen, [0]);
  doc.addPage(trang);

  let anh;
  try {
    anh = await doc.embedPng(new Uint8Array(anhPng));
  } catch {
    // Báo rõ thay vì trả ra một PDF thiếu chữ ký mà vẫn coi là thành công.
    throw new BadRequestException('Ảnh chữ ký không đọc được');
  }

  // Giữ đúng tỉ lệ ảnh: kéo méo chữ ký là làm sai chính thứ đang chứng minh.
  const ty = anh.height / anh.width;
  let rong = RONG_CHU_KY;
  let cao = rong * ty;
  if (cao > CAO_CHU_KY_TOI_DA) {
    cao = CAO_CHU_KY_TOI_DA;
    rong = cao / ty;
  }

  // Ảnh đứng TRÊN gạch chân, như chỗ ký trên bản giấy — cao bao nhiêu cũng vậy.
  const yGach = KHO_A4[1] - TU_TREN_TOI_GACH;
  trang.drawImage(anh, { x: LE, y: yGach + 4, width: rong, height: cao });
  trang.drawLine({
    start: { x: LE, y: yGach },
    end: { x: LE + RONG_CHU_KY, y: yGach },
    thickness: 0.8,
    color: rgb(0.4, 0.4, 0.4),
  });

  return Buffer.from(await doc.save());
}

/** Phần chữ của trang chữ ký, dựng thành một PDF một trang. */
function veChu(tt: ThongTinKy): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: LE, font: FONT });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const xong = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  doc.font(FONT_BOLD).fontSize(16).text('XÁC NHẬN ĐIỆN TỬ CỦA BÊN B');
  doc.moveDown(0.3);
  doc.font(FONT).fontSize(9).fillColor('#666')
    .text('Trang này là một phần không tách rời của hợp đồng ở các trang trước.');
  doc.moveDown(1.2).fillColor('#000');

  const dong = (nhan: string, giaTri: string): void => {
    doc.font(FONT_BOLD).fontSize(10.5).text(`${nhan}: `, { continued: true });
    doc.font(FONT).text(giaTri);
  };

  dong('Số hợp đồng', tt.maDon);
  dong('Người ký', tt.tenNguoiKy);
  dong('Thời điểm ký', dinhDangLuc(tt.kyLuc));

  doc.y = TU_TREN_TOI_NHAN;
  doc.font(FONT_BOLD).fontSize(10.5).text('Chữ ký của Bên B:', LE, doc.y);

  // Nhảy xuống dưới gạch chân — khoảng giữa dành cho ảnh, do pdf-lib vẽ sau.
  doc.y = TU_TREN_TOI_GACH + 8;
  doc.font(FONT).fontSize(9.5).fillColor('#444')
    .text(tt.tenNguoiKy, LE, doc.y, { width: RONG_CHU_KY, align: 'center' });

  doc.moveDown(2.5);
  doc.font(FONT).fontSize(8.5).fillColor('#666')
    .text(
      'Chữ ký điện tử — bằng chứng thỏa thuận giữa hai bên, không phải chữ ký số có '
      + 'chứng thư. Hệ thống ghi nhận thời điểm ký, địa chỉ IP và thiết bị dùng để ký.',
      LE,
      doc.y,
      { width: doc.page.width - LE * 2 },
    );

  doc.end();
  return xong;
}

/** Giờ Việt Nam, vì tờ giấy này đọc ở Việt Nam. */
function dinhDangLuc(d: Date): string {
  return `${d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })} (GMT+7)`;
}
