import * as fs from 'fs';
import * as path from 'path';
import {
  isTestAccount, TEST_ACCOUNTS, TEST_ACCOUNT_EMAILS, TEST_ACCOUNT_PASSWORD,
} from './test-accounts.helper';

const SQL = fs.readFileSync(
  path.join(__dirname, '../../../db/seed-test-accounts.sql'),
  'utf8',
);

/**
 * Danh sách tài khoản tồn tại ở HAI nơi: file JSON (code đọc) và file SQL
 * (database đọc). Không có cách nào để một file sinh ra file kia lúc chạy, nên
 * chốt chặn duy nhất chống lệch là bộ test này.
 *
 * Lệch ở đây hỏng im lặng theo kiểu tệ nhất: seed tạo một tài khoản mà code
 * không coi là tài khoản test, nên nó ĐỔI ĐƯỢC mật khẩu — và cả team mất lối
 * vào khi một người lỡ tay.
 */
describe('test-accounts.json khớp với db/seed-test-accounts.sql', () => {
  it.each(TEST_ACCOUNTS.map((a) => [a.email, a]))(
    '%s có trong file SQL với đúng vai trò',
    (_email, acc) => {
      const a = acc as (typeof TEST_ACCOUNTS)[number];
      expect(SQL).toContain(a.email);
      // Doi chieu dong INSERT cua chinh email do, khong phai ca file.
      const line = SQL.split('\n').find((l) => l.includes(a.email) && l.includes('crypt('));
      expect(line).toBeDefined();
      expect(line).toContain(`ARRAY['${a.role}']`);
      expect(line).toContain(a.fullName);
    },
  );

  it('SQL không chứa tài khoản nào ngoài danh sách JSON', () => {
    const trongSql = [...SQL.matchAll(/'([\w.]+@beeops\.test)'/g)].map((m) => m[1]);
    expect([...new Set(trongSql)].sort()).toEqual([...TEST_ACCOUNT_EMAILS].sort());
  });

  it('mật khẩu trong JSON đúng là mật khẩu SQL đem đi băm', () => {
    expect(SQL).toContain(`crypt('${TEST_ACCOUNT_PASSWORD}'`);
    const soLanBam = [...SQL.matchAll(/crypt\('([^']+)'/g)].map((m) => m[1]);
    expect(new Set(soLanBam)).toEqual(new Set([TEST_ACCOUNT_PASSWORD]));
  });

  /**
   * must_change_password = true cộng với việc chặn đổi mật khẩu sẽ khoá chết
   * tài khoản: guard toàn cục chặn mọi endpoint, mà lối thoát duy nhất lại bị
   * cấm. Đóng đinh để không ai vô tình bật lại.
   */
  it('SQL KHÔNG bật must_change_password cho tài khoản test', () => {
    const dongCoTaiKhoan = SQL.split('\n').filter((l) => l.includes('@beeops.test'));
    for (const l of dongCoTaiKhoan) expect(l).not.toMatch(/,\s*true\s*,/);
    expect(SQL).toContain('must_change_password = false');
  });

  it('mọi phòng ban gán cho tài khoản đều được SQL tạo ra', () => {
    for (const a of TEST_ACCOUNTS) {
      if (a.department === null) continue;
      expect(SQL).toContain(a.department);
    }
  });

  it('không có email trùng nhau', () => {
    expect(new Set(TEST_ACCOUNT_EMAILS).size).toBe(TEST_ACCOUNT_EMAILS.length);
  });

  it('mọi tài khoản đều được isTestAccount nhận ra', () => {
    for (const a of TEST_ACCOUNTS) expect(isTestAccount(a.email)).toBe(true);
  });
});
