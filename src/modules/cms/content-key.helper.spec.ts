import { BadRequestException } from '@nestjs/common';
import { assertKeyPath, isLockedKey, LOCKED_PREFIXES } from './content-key.helper';

/**
 * CMS ghi đè nội dung landing theo đường dẫn khoá, ví dụ 'hero.title'. Khoá đi
 * thẳng từ trình duyệt xuống DB rồi được landing trộn vào cây từ điển, nên nó
 * là một lối vào cần chặn như mọi lối vào khác.
 */

describe('assertKeyPath', () => {
  it('nhận khoá thường và khoá có chỉ số mảng', () => {
    for (const k of [
      'hero.title',
      'footer.copyright',
      'services.items.domestic.problems.0.name',
      'images.aboutYard',
    ])
      expect(() => assertKeyPath(k)).not.toThrow();
  });

  /**
   * Landing trộn lớp phủ bằng cách đi dọc đường dẫn và gán vào cây. Cho '__proto__'
   * hay 'constructor' đi qua là mở đường sửa nguyên mẫu Object của tiến trình
   * render — một khoá trong DB đổi được hành vi của toàn bộ trang.
   */
  it('chặn khoá đụng tới nguyên mẫu', () => {
    for (const k of [
      '__proto__.polluted',
      'hero.__proto__.x',
      'constructor.prototype.x',
      'hero.constructor',
      'a.prototype.b',
    ])
      expect(() => assertKeyPath(k)).toThrow(BadRequestException);
  });

  it('chặn khoá rỗng, đoạn rỗng và khoảng trắng', () => {
    for (const k of ['', '.', 'hero..title', ' hero.title', 'hero.title ', 'hero. title'])
      expect(() => assertKeyPath(k)).toThrow(BadRequestException);
  });

  it('chặn ký tự ngoài chữ, số, gạch dưới và gạch nối', () => {
    for (const k of ['hero.title!', 'hero/title', 'hero.tiêu-đề', 'hero["title"]'])
      expect(() => assertKeyPath(k)).toThrow(BadRequestException);
  });

  /** Khoá dài vô hạn chỉ tổ làm phình bảng; 200 ký tự đã dư cho cây sâu nhất. */
  it('chặn khoá quá dài', () => {
    expect(() => assertKeyPath('a.'.repeat(120) + 'b')).toThrow(BadRequestException);
  });
});

describe('isLockedKey', () => {
  /**
   * Băng CTA là khối duy nhất người dùng yêu cầu để nguyên. Chặn ở đây chứ
   * không chỉ ẩn trên giao diện: ẩn nút thì một lần gọi API thẳng vẫn ghi được.
   */
  it('khoá băng CTA', () => {
    expect(LOCKED_PREFIXES).toContain('ctaBand');
    expect(isLockedKey('ctaBand.title')).toBe(true);
    expect(isLockedKey('ctaBand')).toBe(true);
  });

  it('không khoá nhầm khoá chỉ trùng tiền tố', () => {
    expect(isLockedKey('ctaBandit.title')).toBe(false);
    expect(isLockedKey('hero.ctaBand')).toBe(false);
  });

  it('phần còn lại của landing đều sửa được', () => {
    for (const k of ['hero.title', 'about.body', 'footer.copyright', 'legal.privacy.title'])
      expect(isLockedKey(k)).toBe(false);
  });

  it('assertKeyPath từ chối luôn khoá bị khoá', () => {
    expect(() => assertKeyPath('ctaBand.title')).toThrow(BadRequestException);
  });
});

/**
 * Dich vu nguoi dung tu them mang hai o KHONG phai chu nghia: `slug` la dia
 * chi trang, `code` la ma dich vu ben BeeOps. Man Noi dung da loc chung ra
 * khoi danh muc o, nhung an nut khong phai la chan: mot lan goi API thang van
 * ghi de duoc, va ghi de `slug` la gay moi duong link da phat ra ngoai.
 */
describe('chan ghi de o dinh tuyen cua dich vu', () => {
  it('khong cho ghi slug hay code cua dich vu', () => {
    expect(() => assertKeyPath('services.items.them_hang_lanh.slug')).toThrow();
    expect(() => assertKeyPath('services.items.them_hang_lanh.code')).toThrow();
  });

  /** Moi o chu nghia khac cua chinh dich vu do van phai sua duoc binh thuong. */
  it('van cho ghi cac o chu nghia', () => {
    expect(() => assertKeyPath('services.items.them_hang_lanh.name')).not.toThrow();
    expect(() => assertKeyPath('services.items.them_hang_lanh.intro')).not.toThrow();
    expect(() => assertKeyPath('services.items.them_hang_lanh.faqs.0.q')).not.toThrow();
  });

  /** Chan dung o do thoi: mot khoa ten 'slug' o cho khac khong lien quan. */
  it('khong chan nham o ten slug o khoi khac', () => {
    expect(() => assertKeyPath('blog.slug')).not.toThrow();
  });
});

