/**
 * Phân loại `serviceCode` mà form công khai gửi lên.
 *
 * Trước đây việc này là đúng một dòng trong QuoteRequestService:
 *
 *     if (svc?.isActive) serviceId = svc.id;
 *
 * Mã không khớp dịch vụ nào, hoặc khớp một dịch vụ đã ngừng bán, đều rơi
 * xuống cùng một nhánh im lặng — không log, không lỗi, không phân biệt với ca
 * khách KHÔNG chọn dịch vụ. Trong khi `serviceId` sai thì ném 400 đàng hoàng.
 *
 * Hậu quả thật: bảng ánh xạ key→mã bên landing page thiếu sáu dòng, mọi yêu
 * cầu của sáu dịch vụ đó gửi lên không kèm mã hợp lệ, và hệ thống báo cho nhân
 * viên đúng một câu "chưa chọn được dịch vụ" — nghe như lỗi của khách. Phải
 * lần ngược từ ảnh chụp màn hình mới ra nguyên nhân thật.
 *
 * Tách thành hàm THUẦN: nhận kết quả tra cứu đã có sẵn, không tự truy vấn, nên
 * test được toàn bộ ba nhánh mà không cần Prisma giả.
 *
 * KHÔNG ném lỗi. `serviceId` đến từ người gọi nội bộ nên sai là lỗi lập trình,
 * đáng 400. `serviceCode` đến từ form của khách — bảng ánh xạ bên ngoài lệch
 * một dòng mà ném 400 thì mọi khách chọn dịch vụ đó đều bị từ chối, mất khách
 * thật để đổi lấy tính nhất quán. Cả module này được viết theo hướng ngược
 * lại: yêu cầu của khách phải được lưu bằng mọi giá, trục trặc thì báo người
 * xử lý chứ không đá ngược về phía khách.
 */
export interface ServiceCodeProblem {
  code: string;
  reason: 'not_found' | 'inactive';
}

export interface ServiceCodeResult {
  serviceId?: number;
  problem?: ServiceCodeProblem;
}

export function classifyServiceCode(
  code: string,
  svc: { id: number; isActive: boolean } | null,
): ServiceCodeResult {
  if (!svc) return { problem: { code, reason: 'not_found' } };
  if (!svc.isActive) return { problem: { code, reason: 'inactive' } };
  return { serviceId: svc.id };
}
