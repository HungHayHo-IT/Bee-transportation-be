import { IMAGE_PREFIX, isImageKey, localesFor } from './content-locale.helper';
import { CMS_LOCALES } from './dto/cms.dto';

/**
 * Ảnh dùng chung cho cả hai ngôn ngữ; chữ thì tách riêng.
 *
 * Ép ở tầng dữ liệu chứ không chỉ ở giao diện: giao diện có thể quên gửi bản
 * còn lại, và lúc đó trang tiếng Anh giữ ảnh cũ mà không ai thấy sai ở đâu.
 */

describe('isImageKey', () => {
  it('nhận đúng ô ảnh', () => {
    expect(IMAGE_PREFIX).toBe('images.');
    expect(isImageKey('images.aboutYard')).toBe(true);
    expect(isImageKey('images.hero.poster')).toBe(true);
  });

  it('không nhận nhầm khoá chỉ trùng chữ', () => {
    for (const k of ['images', 'imagesOfYard', 'hero.images.x', 'about.title'])
      expect(isImageKey(k)).toBe(false);
  });
});

describe('localesFor', () => {
  it('ô chữ chỉ ghi vào đúng ngôn ngữ đang sửa', () => {
    expect(localesFor('vi-vn', 'about.title')).toEqual(['vi-vn']);
    expect(localesFor('en-us', 'about.title')).toEqual(['en-us']);
  });

  it('ô ảnh ghi cho cả hai ngôn ngữ, dù đang sửa ở bản nào', () => {
    expect(localesFor('vi-vn', 'images.aboutYard').sort()).toEqual([...CMS_LOCALES].sort());
    expect(localesFor('en-us', 'images.aboutYard').sort()).toEqual([...CMS_LOCALES].sort());
  });

  /** Thêm ngôn ngữ thứ ba mà quên chỗ này thì ảnh sẽ lệch âm thầm. */
  it('bám theo danh sách ngôn ngữ, không cắm cứng hai giá trị', () => {
    expect(localesFor('vi-vn', 'images.x')).toHaveLength(CMS_LOCALES.length);
  });

  /**
   * Địa chỉ mạng xã hội dùng chung hai ngôn ngữ: trang Facebook của công ty
   * không có bản tiếng Anh riêng. Bắt điền hai lần là điền một bên, quên bên
   * kia, và trang ngôn ngữ kia im lặng không hiện kênh đó.
   */
  it('địa chỉ mạng xã hội ghi cho mọi ngôn ngữ', () => {
    for (const k of ['social.facebook', 'social.zalo', 'social.tiktok']) {
      expect(localesFor('vi-vn', k)).toEqual(['vi-vn', 'en-us']);
    }
  });

  it('nhãn mạng xã hội vẫn theo từng ngôn ngữ', () => {
    // Câu cho trình đọc màn hình, mỗi ngôn ngữ một câu.
    expect(localesFor('vi-vn', 'social.label')).toEqual(['vi-vn']);
  });

  it('không nhận nhầm khoá chỉ trùng tiền tố', () => {
    expect(localesFor('vi-vn', 'socialProof.title')).toEqual(['vi-vn']);
    expect(localesFor('vi-vn', 'site.officesNote')).toEqual(['vi-vn']);
  });

  it('văn phòng, hotline, email chung ghi cho mọi ngôn ngữ', () => {
    // Địa chỉ không có bản tiếng Anh; số và email là một.
    for (const k of ['site.offices', 'site.offices.1.phone', 'site.phoneNumber', 'site.email']) {
      expect(localesFor('en-us', k)).toEqual(['vi-vn', 'en-us']);
    }
    // Tên công ty, giấy phép… vẫn theo từng ngôn ngữ.
    expect(localesFor('vi-vn', 'site.name')).toEqual(['vi-vn']);
    expect(localesFor('vi-vn', 'site.emailNote')).toEqual(['vi-vn']);
  });
});
