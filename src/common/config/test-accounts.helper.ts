import raw from './test-accounts.json';

export interface TestAccount {
  email: string;
  fullName: string;
  role: string;
  /** Tên phòng ban (khớp `departments.name`), null = không thuộc phòng nào. */
  department: string | null;
  note: string;
}

/**
 * Bộ tài khoản test dùng chung cho mọi team, đọc thẳng từ `test-accounts.json`.
 *
 * File JSON là nguồn sự thật DUY NHẤT: nó vừa nuôi đoạn chặn đổi mật khẩu bên
 * dưới, vừa nuôi `db/seed-test-accounts.sql`. Nếu chép danh sách này thành hằng
 * trong code thì sớm muộn hai bên lệch nhau, và lệch kiểu im lặng — tài khoản
 * vẫn đăng nhập được nhưng không còn bị khoá đổi mật khẩu.
 *
 * TÊN FILE cố ý là `.helper.ts` chứ không phải `test-accounts.ts`: jest khai
 * `moduleFileExtensions: ['js','json','ts']` — `json` ĐỨNG TRƯỚC `ts`, nên
 * `import từ '@/common/config/test-accounts'` sẽ giải ra file JSON cạnh đây
 * chứ không phải module này. Import vẫn chạy, nhưng mọi export thành
 * `undefined` — hỏng im lặng, không một lỗi biên dịch nào.
 */
export const TEST_ACCOUNTS: TestAccount[] = raw.accounts;

/** Mật khẩu chung của cả bộ. Chỉ dùng cho môi trường thử nghiệm. */
export const TEST_ACCOUNT_PASSWORD: string = raw.password;

export const TEST_ACCOUNT_EMAILS: string[] = TEST_ACCOUNTS.map((a) => a.email);

/** So sánh không phân biệt hoa thường: `users.email` là `citext`. */
const LOOKUP = new Set(TEST_ACCOUNT_EMAILS.map((e) => e.toLowerCase()));

export const isTestAccount = (email: string): boolean =>
  LOOKUP.has(email.trim().toLowerCase());
