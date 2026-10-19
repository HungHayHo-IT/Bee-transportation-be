import { CMS_LOCALES, CmsLocale } from './dto/cms.dto';

/**
 * Tiền tố đánh dấu một ô là ảnh. Khoá ảnh có dạng 'images.<tên ô>', giá trị là
 * URL trên S3.
 */
export const IMAGE_PREFIX = 'images.';

export function isImageKey(keyPath: string): boolean {
  return keyPath.startsWith(IMAGE_PREFIX);
}

/**
 * Ô dùng chung cho mọi ngôn ngữ dù không phải ảnh.
 *
 * Địa chỉ trang Facebook của công ty không có bản tiếng Anh riêng. Bắt điền
 * hai lần là mở ra đúng một kiểu hỏng: điền một bên, quên bên kia, và trang
 * ngôn ngữ kia im lặng không hiện kênh đó.
 *
 * `social.label` KHÔNG nằm trong đây: nó là câu cho trình đọc màn hình, mỗi
 * ngôn ngữ một câu.
 *
 * Danh sách văn phòng (`site.offices`), hotline và email chung cũng vậy: địa
 * chỉ không có bản tiếng Anh, số và email là một. Nhãn nhóm ("Trụ sở chính", "Chi nhánh") được bản
 * tiếng Anh tự dịch lúc hiện — xem nhanNhom ở landing lib/offices.ts.
 */
const DUNG_CHUNG = /^(social\.(?!label$)|site\.offices(\.|$)|site\.(phoneNumber|email)$)/;

/**
 * Một ô nội dung được ghi cho những ngôn ngữ nào.
 *
 * Chữ: chỉ ngôn ngữ đang sửa — sửa tiếng Việt không được đụng bản tiếng Anh.
 *
 * Ảnh, địa chỉ mạng xã hội và danh sách văn phòng: TẤT CẢ ngôn ngữ. Cùng một tấm ảnh, cùng một
 * trang Facebook cho cả hai bản, nên nếu chỉ ghi bản đang sửa thì trang ngôn
 * ngữ kia giữ giá trị cũ — và không màn hình nào nói ra điều đó, người sửa tin
 * rằng mình đã đổi xong. Ép ở đây, tầng dữ liệu, để giao diện có quên thì cũng
 * không lệch được.
 */
export function localesFor(dangSua: CmsLocale, keyPath: string): CmsLocale[] {
  return isImageKey(keyPath) || DUNG_CHUNG.test(keyPath) ? [...CMS_LOCALES] : [dangSua];
}
