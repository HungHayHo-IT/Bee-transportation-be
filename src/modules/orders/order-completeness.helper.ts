/** Một trường bắt buộc riêng của dịch vụ, đọc từ bảng service_fields. */
export interface RequiredField {
  fieldKey: string;
  label: string;
}

export interface OrderInfoInput {
  customerName: string | null;
  phone: string | null;
  serviceId: number | null;
  originProvince: string | null;
  destinationProvince: string | null;
  serviceData: Record<string, unknown>;
  requiredFields: RequiredField[];
  /**
   * Dịch vụ con đã chọn chưa, và dịch vụ cha có dịch vụ con nào đang bật không.
   *
   * Đơn từ form công khai KHÔNG bị chặn vì thiếu dịch vụ con nữa — form chỉ hỏi
   * dịch vụ cha, mà bốn dịch vụ vận chuyển đều có dịch vụ con, nên bắt buộc ở
   * lúc tạo là mọi yêu cầu từ landing đều không sinh được đơn. Thay vào đó đơn
   * vẫn tạo, và thiếu dịch vụ con là một dòng trong danh sách "cần bổ sung".
   *
   * Vắng mặt = KHÔNG đòi, ngược với hai cờ `hasDomestic*` ở dưới. Cố ý: quên
   * truyền cờ domestic thì cùng lắm đòi thừa một ô, còn quên truyền cờ này mà
   * mặc định là đòi thì MỌI đơn của dịch vụ không có dịch vụ con kẹt vĩnh viễn
   * ở "chờ bổ sung".
   */
  serviceChildId?: number | null;
  coDichVuCon?: boolean;
  /**
   * Hai đầu của tuyến có nằm trong nước không — ô "Tỉnh/thành" là danh sách
   * tỉnh thành Việt Nam nên vô nghĩa với đầu nằm ngoài nước, và form ẩn nó đi.
   *
   * Tính theo DỊCH VỤ CON nếu đơn đã chọn (migration 054): hàng xuất và hàng
   * nhập nằm cùng một dịch vụ cha nhưng ngược đầu nhau.
   *
   * Vắng mặt = CÓ đòi. Mặc định phải là đòi, để thêm cờ không lặng lẽ nới điều
   * kiện của mọi dịch vụ đang chạy.
   */
  hasDomesticOrigin?: boolean;
  hasDomesticDestination?: boolean;
}

const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * NGUỒN SỰ THẬT DUY NHẤT cho câu hỏi "đơn này đã đủ để chạy tiếp chưa".
 *
 * `create()` dùng nó để quyết định trạng thái ban đầu của đơn từ form công khai,
 * `update()` dùng nó để biết lúc nào tự thăng trạng thái. Hàm THUẦN — không chạm
 * Prisma — nên test được toàn bộ luật mà không mock gì; bên gọi lo việc đi lấy
 * dữ liệu.
 *
 * Trả về NHÃN tiếng Việt chứ không phải khoá: kết quả này đi thẳng vào nội dung
 * thông báo cho nhân viên, người đọc cần biết "thiếu Điểm đi" chứ không phải
 * "thiếu originProvince".
 */
export function missingOrderInfo(input: OrderInfoInput): string[] {
  const missing: string[] = [];

  if (isBlank(input.customerName)) missing.push('Tên khách hàng');
  if (isBlank(input.phone)) missing.push('Số điện thoại');
  if (input.serviceId === null) missing.push('Dịch vụ');
  // Hàng NHẬP khẩu lấy hàng ở nước ngoài: đòi một tỉnh Việt Nam cho điểm đi là
  // đòi một ô form đã ẩn, và đơn kẹt vĩnh viễn ở "Cần bổ sung thông tin".
  if (input.hasDomesticOrigin !== false && isBlank(input.originProvince))
    missing.push('Điểm đi');
  // Chỉ đòi khi dịch vụ thật sự có điểm đến trong nước. Đòi một ô mà form đã ẩn
  // là cách chắc chắn nhất để đơn kẹt lại vĩnh viễn ở "Cần bổ sung thông tin".
  if (input.hasDomesticDestination !== false && isBlank(input.destinationProvince))
    missing.push('Điểm đến');

  /* Thiếu dịch vụ con thì đơn KHÔNG mang mã TMS, và lúc đẩy sang OF1 mới phát
     hiện ra — muộn hơn một bước so với chỗ sửa được. Nêu ở đây để sale thấy
     ngay trên banner "cần bổ sung" của đơn. */
  if (input.coDichVuCon === true && (input.serviceChildId ?? null) === null)
    missing.push('Dịch vụ con');

  // Giữ nguyên thứ tự khai báo của dịch vụ (đã sortOrder ở tầng truy vấn) để
  // danh sách thiếu đọc theo đúng thứ tự trên form.
  for (const field of input.requiredFields)
    if (isBlank(input.serviceData[field.fieldKey])) missing.push(field.label);

  return missing;
}

/**
 * Bọc `missingOrderInfo` cho `create()`: chỉ chấm khi đơn đến từ form công khai
 * — đơn nội bộ đã đi qua form admin vốn bắt buộc đủ trường, thêm một truy vấn
 * requiredFieldsOf cho mọi đơn là trả giá vô ích. Nhận `requiredFieldsOf` làm
 * tham số thay vì tự gọi Prisma để hàm này không kéo phụ thuộc DB vào module
 * thuần túy này — bên gọi (OrdersService) đi lấy dữ liệu.
 */
export async function missingInfoForPublicOrder(
  dto: {
    newCustomer?: { companyName?: string; contactName?: string; phone?: string };
    serviceId: number;
    serviceChildId?: number;
    originProvince?: string;
    destinationProvince?: string;
  },
  serviceData: Record<string, unknown>,
  opts: { fromPublicForm?: boolean } | undefined,
  requiredFieldsOf: (serviceId: number) => Promise<RequiredField[]>,
  tuyen?: { diTrongNuoc: boolean; denTrongNuoc: boolean },
  coDichVuCon?: boolean,
): Promise<string[]> {
  if (!opts?.fromPublicForm) return [];
  return missingOrderInfo({
    serviceChildId: dto.serviceChildId ?? null,
    coDichVuCon,
    hasDomesticOrigin: tuyen?.diTrongNuoc,
    hasDomesticDestination: tuyen?.denTrongNuoc,
    // Tên công ty HOẶC tên người liên hệ — một trong hai là đủ để gọi tên khách.
    // Form website chỉ hỏi tên người, nên đòi riêng companyName sẽ làm MỌI đơn
    // từ web kẹt vĩnh viễn ở awaiting_info trong khi màn hình đang hiện tên.
    customerName: dto.newCustomer?.companyName ?? dto.newCustomer?.contactName ?? null,
    phone: dto.newCustomer?.phone ?? null,
    serviceId: dto.serviceId,
    originProvince: dto.originProvince ?? null,
    destinationProvince: dto.destinationProvince ?? null,
    serviceData,
    requiredFields: await requiredFieldsOf(dto.serviceId),
  });
}
