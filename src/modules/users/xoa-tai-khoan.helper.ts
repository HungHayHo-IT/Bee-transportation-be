import { Role } from '@/common/enums';

/**
 * Vai KHÔNG xoá được.
 *
 * Admin, Giám đốc và Trưởng phòng là ba vai điều hành: xoá nhầm một trong số
 * đó là mất đường vào hệ thống hoặc mất người duyệt của cả một phòng. Muốn gỡ
 * quyền của họ thì hạ vai trước, rồi mới xoá.
 */
export const VAI_KHONG_XOA: readonly Role[] = [Role.ADMIN, Role.LEADER, Role.MANAGER];

/** Số bản ghi PHẢI chuyển sang người khác, vì cột giữ chúng là NOT NULL. */
export interface SoPhaiChuyen {
  don: number;
  phieuKy: number;
}

/**
 * Tài khoản này xoá được không — trả câu lỗi, hoặc null nếu được.
 *
 * Hàm THUẦN: luật nằm ở đây để test được toàn bộ mà không dựng cơ sở dữ liệu,
 * còn bên gọi lo việc đi đếm.
 */
export function canXoaDuoc(opts: {
  vaiCuaNguoiBiXoa: readonly string[];
  idNguoiBiXoa: number;
  idNguoiXoa: number;
  phaiChuyen: SoPhaiChuyen;
  idNhanLaiDon: number | undefined;
}): string | null {
  const { vaiCuaNguoiBiXoa, idNguoiBiXoa, idNguoiXoa, phaiChuyen, idNhanLaiDon } = opts;

  /* Tự xoá mình: người gọi đang cầm token của chính tài khoản sắp biến mất.
     Chặn ở đây chứ không để họ tự phát hiện sau khi mọi request đều 401. */
  if (idNguoiBiXoa === idNguoiXoa)
    return 'Không tự xoá tài khoản của mình được';

  const vaiChan = vaiCuaNguoiBiXoa.filter((v) =>
    (VAI_KHONG_XOA as readonly string[]).includes(v),
  );
  if (vaiChan.length > 0)
    return `Tài khoản mang vai ${vaiChan.join(', ')} nên không xoá được. Hạ vai trước rồi xoá.`;

  const { don, phieuKy } = phaiChuyen;
  if (don + phieuKy === 0) return null;

  /* Đơn và phiếu ký giữ người tạo ở cột NOT NULL, nên KHÔNG bỏ trống được —
     phải có người nhận lại. Phiếu ký còn là chứng cứ của hợp đồng khách đã ký:
     xoá nó là xoá bằng chứng, nên chuyển người chứ không xoá. */
  if (idNhanLaiDon === undefined) {
    const ds: string[] = [];
    if (don > 0) ds.push(`${don} đơn`);
    if (phieuKy > 0) ds.push(`${phieuKy} phiếu ký`);
    return `Tài khoản này đang đứng tên ${ds.join(' và ')}. `
      + 'Chọn người nhận lại rồi xoá (tham số chuyenDonCho).';
  }
  if (idNhanLaiDon === idNguoiBiXoa)
    return 'Người nhận lại không thể là chính tài khoản đang bị xoá';

  return null;
}
