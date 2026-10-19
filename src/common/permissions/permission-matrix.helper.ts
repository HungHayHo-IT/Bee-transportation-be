import { MucQuyen } from './pages';

/**
 * Thứ tự mức quyền, từ thấp lên cao. Dùng để gộp nhiều vai trò của một người.
 */
const THU_HANG: Record<MucQuyen, number> = {
  [MucQuyen.KHONG]: 0,
  [MucQuyen.XEM]: 1,
  [MucQuyen.SUA]: 2,
  [MucQuyen.DAY_DU]: 3,
};

/** Khoá tra trong bản đồ ma trận. Một chuỗi phẳng, rẻ hơn hai tầng Map. */
export function khoaO(role: string, pageKey: string): string {
  return `${role}:${pageKey}`;
}

/**
 * Mức quyền của một người trên một trang: CAO NHẤT trong các vai trò họ mang.
 *
 * Cao nhất chứ không thấp nhất: một trưởng phòng kiêm pricing mà bị tụt về mức
 * thấp hơn của một trong hai vai thì kiêm nhiệm trở thành hình phạt, và không
 * ai hiểu vì sao mình mất quyền vừa có hôm qua.
 *
 * Không vai trò nào có dòng nào thì trả `none` — mặc định là ĐÓNG, để thêm một
 * trang mới mà quên cấu hình không vô tình mở nó cho cả công ty.
 */
export function mucCaoNhat(
  bang: ReadonlyMap<string, MucQuyen>,
  roles: readonly string[],
  pageKey: string,
): MucQuyen {
  let cao: MucQuyen = MucQuyen.KHONG;
  for (const r of roles) {
    const m = bang.get(khoaO(r, pageKey));
    if (m !== undefined && THU_HANG[m] > THU_HANG[cao]) cao = m;
  }
  return cao;
}

/**
 * Phương thức này có phải là GHI không.
 *
 * Mọi thứ không phải đọc đều coi là ghi, kể cả phương thức lạ: cách hỏng an
 * toàn là đòi mức đầy đủ, chứ không phải cho qua vì không nhận ra.
 */
export function phuongThucGhi(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

/** Cho qua hay chặn, theo mức quyền và phương thức HTTP. */
export function quyetDinh(muc: MucQuyen, method: string): boolean {
  if (muc === MucQuyen.KHONG) return false;
  if (muc === MucQuyen.DAY_DU) return true;
  // Còn lại là bậc xem và bậc tạo/sửa: đọc thì cả hai đều được.
  if (!phuongThucGhi(method)) return true;
  if (muc === MucQuyen.XEM) return false;
  /* Bậc tạo/sửa. Phương thức lạ (TRACE, một verb tự chế) rơi vào đây và bị
     chặn cùng với DELETE: không nhận ra thì đòi bậc cao nhất, chứ không cho
     qua vì không hiểu. */
  return ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase());
}
