/**
 * Công cụ dòng lệnh cho giá trị bí mật trong .env.
 *
 *   npm run bi-mat -- --tao-khoa     # sinh khoá 32 byte
 *   npm run bi-mat                   # mã hoá, đọc giá trị từ bàn phím
 *
 * Giá trị nhập qua STDIN chứ không qua tham số dòng lệnh: tham số nằm lại
 * trong lịch sử shell và trong `ps`, nên dán token vào đó là lộ ngay ở chỗ
 * vừa định giấu.
 */
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { docKhoa, maHoa } from '../src/common/bi-mat/bi-mat.helper';

function doc(cauHoi: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((ok) => rl.question(cauHoi, (tl) => { rl.close(); ok(tl); }));
}

async function main(): Promise<void> {
  if (process.argv.includes('--tao-khoa')) {
    process.stdout.write(`${randomBytes(32).toString('base64')}\n`);
    process.stderr.write(
      '\nCất khoá này vào một file riêng, KHÔNG để trong .env:\n'
      + '  sudo install -m 600 -o root -g root /dev/null /srv/beeops/secret.key\n'
      + '  (dán khoá vào file đó)\n'
      + 'Rồi trong .env đặt: APP_SECRET_KEY_FILE=/srv/beeops/secret.key\n',
    );
    return;
  }

  const duongDan = process.env.APP_SECRET_KEY_FILE;
  const thoKhoa = duongDan ? readFileSync(duongDan, 'utf8') : (process.env.APP_SECRET_KEY ?? '');
  if (!thoKhoa.trim()) {
    process.stderr.write(
      'Chưa có khoá. Đặt APP_SECRET_KEY_FILE (hoặc APP_SECRET_KEY), '
      + 'hoặc chạy: npm run bi-mat -- --tao-khoa\n',
    );
    process.exitCode = 1;
    return;
  }

  const giaTri = (await doc('Giá trị cần mã hoá (dán rồi Enter): ')).trim();
  if (!giaTri) {
    process.stderr.write('Không nhận được giá trị nào.\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${maHoa(giaTri, docKhoa(thoKhoa))}\n`);
  process.stderr.write('\nChép nguyên dòng trên vào .env, kể cả tiền tố enc:\n');
}

void main();
