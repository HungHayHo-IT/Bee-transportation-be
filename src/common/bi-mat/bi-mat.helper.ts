import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Giá trị đã mã hoá trong .env mang tiền tố này. Giá trị không có tiền tố thì
 * dùng nguyên văn — nhờ vậy chuyển dần từng biến một, không phải đổi hết trong
 * một lượt rồi hỏng cả máy chủ vì sót một chỗ.
 */
export const TIEN_TO_MA_HOA = 'enc:';

/** AES-256-GCM: vừa giấu vừa XÁC THỰC. Xem giải thích ở giaiMa(). */
const THUAT_TOAN = 'aes-256-gcm';
const DAI_IV = 12;
const DAI_THE = 16;

/** Đọc khoá base64 thành 32 byte. Cắt khoảng trắng vì khoá đọc từ file luôn
 *  dính dấu xuống dòng ở cuối. */
export function docKhoa(base64: string): Buffer {
  const k = Buffer.from((base64 ?? '').trim(), 'base64');
  if (k.length !== 32) {
    throw new Error(`Khoá bí mật phải đúng 32 byte sau khi giải base64, đang là ${k.length}`);
  }
  return k;
}

export function maHoa(giaTri: string, khoa: Buffer): string {
  // IV mới mỗi lần: cùng một chuỗi mã hoá hai lần phải ra hai kết quả khác
  // nhau, nếu không người đọc .env biết được hai biến đang cùng giá trị.
  const iv = randomBytes(DAI_IV);
  const c = createCipheriv(THUAT_TOAN, khoa, iv);
  const kin = Buffer.concat([c.update(giaTri, 'utf8'), c.final()]);
  return TIEN_TO_MA_HOA + Buffer.concat([iv, c.getAuthTag(), kin]).toString('base64');
}

/**
 * Giải mã một giá trị cấu hình. Không có tiền tố thì trả nguyên văn.
 *
 * GCM có thẻ xác thực, và hàm này để lỗi NÉM RA chứ không nuốt. Thiếu bước đó
 * thì một byte sai trong .env — sửa tay nhầm, copy thiếu ký tự — sẽ cho ra một
 * chuỗi rác trông như token, và máy chủ đem rác đi gọi OF1 thay vì báo hỏng.
 * Sai cấu hình phải ồn ào ngay lúc khởi động.
 */
export function giaiMa(giaTri: string, khoa: Buffer): string {
  if (!giaTri.startsWith(TIEN_TO_MA_HOA)) return giaTri;
  const goi = Buffer.from(giaTri.slice(TIEN_TO_MA_HOA.length), 'base64');
  if (goi.length <= DAI_IV + DAI_THE) throw new Error('Giá trị mã hoá quá ngắn');
  const d = createDecipheriv(THUAT_TOAN, khoa, goi.subarray(0, DAI_IV));
  d.setAuthTag(goi.subarray(DAI_IV, DAI_IV + DAI_THE));
  return Buffer.concat([
    d.update(goi.subarray(DAI_IV + DAI_THE)),
    d.final(),
  ]).toString('utf8');
}
