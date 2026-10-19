import { Prisma } from '@prisma/client';

/** Tên miền email của Bee Logistics — bên vận hành OF1-TMS. */
export const TEN_MIEN_BEE_LOGS = 'beelogistics.com';

/**
 * Hai cái đuôi đủ để nhận ra tên miền. Hàm bên dưới VÀ câu truy vấn lọc đơn
 * đều đọc từ đây — tách ra hai nơi thì sớm muộn một bên nhận tên miền con còn
 * bên kia không, và người dùng thấy danh sách đơn khác với cái nhãn trên hồ sơ.
 */
export const DUOI_BEE_LOGS = [`@${TEN_MIEN_BEE_LOGS}`, `.${TEN_MIEN_BEE_LOGS}`] as const;

/**
 * Khách hàng này có phải người của Bee Logistics không, nhận ra qua tên miền
 * email.
 *
 * SUY RA chứ không lưu thành cột: email là thứ sale sửa được bất cứ lúc nào,
 * mà một cột lưu sẵn thì sửa email xong cờ vẫn đứng yên — hồ sơ nói một đằng,
 * địa chỉ nói một nẻo, và không ai biết bên nào đúng. Suy ra thì không bao giờ
 * lệch, và cũng không cần migration hay backfill.
 *
 * Khớp CẢ tên miền con (`@vn.beelogistics.com`): chi nhánh vẫn là người của
 * họ. Nhưng chặn `@notbeelogistics.com` — phải đúng một dấu chấm hoặc đúng
 * dấu @ ngay trước tên miền.
 */
export function laKhachBeeLogs(email: string | null | undefined): boolean {
  if (!email) return false;
  const sau = email.trim().toLowerCase().split('@').at(-1);
  if (!sau) return false;
  return sau === TEN_MIEN_BEE_LOGS || sau.endsWith(`.${TEN_MIEN_BEE_LOGS}`);
}

/**
 * Điều kiện Prisma lọc HỒ SƠ KHÁCH thuộc Bee Logistics.
 *
 * Nằm cùng file với `laKhachBeeLogs` vì cả hai nói đúng một luật. Tách ra hai
 * nơi thì sớm muộn một bên nhận tên miền con còn bên kia không, và người dùng
 * thấy danh sách đơn khác với cái nhãn trên hồ sơ.
 */
export const DIEU_KIEN_KHACH_BEE_LOGS: Prisma.CustomerWhereInput = {
  OR: DUOI_BEE_LOGS.map((duoi) => ({
    email: { endsWith: duoi, mode: 'insensitive' as const },
  })),
};
