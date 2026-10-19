import type { PublicFormFieldDto, PublicServiceChildDto } from './dto/service.dto';

/**
 * Các ô của form gửi yêu cầu báo giá công khai, dựng theo đúng luật backend
 * đang chạy.
 *
 * VÌ SAO Ở ĐÂY CHỨ KHÔNG VIẾT CỨNG TRONG APP: app phát hành lại mất hàng tuần
 * và người dùng không bắt buộc cập nhật. Thêm một ô bắt buộc ở backend mà app
 * cũ chưa biết thì yêu cầu gửi lên vẫn thiếu và nằm im ở `pending` — không ai
 * nhìn thấy, khách tưởng đã gửi được.
 *
 * ĐÂY LÀ HÀM THUẦN, và luật trong nó phải khớp với hai chỗ thật sự chặn:
 *   - `missingOrderInfo` (order-completeness.helper) — tên khách, điện thoại,
 *     điểm đi, điểm đến
 *   - `kiemDichVuCon` (dich-vu-con.helper) — dịch vụ con bắt buộc khi dịch vụ
 *     có dòng con đang bật
 */
export function dungFormCongKhai(
  dichVu: { hasDomesticDestination: boolean },
  con: PublicServiceChildDto[],
): PublicFormFieldDto[] {
  const o = (
    key: string,
    label: string,
    type: string,
    required: boolean,
    options: PublicServiceChildDto[] = [],
  ): PublicFormFieldDto => ({ key, label, type, required, options });

  const ds: PublicFormFieldDto[] = [
    o('customerName', 'Tên người liên hệ', 'text', true),
    o('phone', 'Số điện thoại', 'phone', true),
    o('email', 'Email', 'email', false),
  ];

  /* Bắt buộc khi dịch vụ có dòng con đang bật — `kiemDichVuCon` ném 400 chứ
     không bỏ qua. Thiếu nó thì yêu cầu KHÔNG tự thành đơn, nằm lại pending. */
  if (con.length > 0)
    ds.push(o('serviceChildId', 'Dịch vụ con', 'select', true, con));

  ds.push(o('originProvince', 'Tỉnh/thành điểm đi', 'province', true));

  /* Dịch vụ đi ra nước ngoài (CBT) không hỏi tỉnh/thành điểm đến: danh sách là
     tỉnh thành Việt Nam nên vô nghĩa, và backend cũng bỏ qua ô này khi chấm
     đơn đã đủ thông tin chưa. Hai bên đọc cùng một cờ. */
  if (dichVu.hasDomesticDestination)
    ds.push(o('destinationProvince', 'Tỉnh/thành điểm đến', 'province', true));

  ds.push(o('note', 'Ghi chú', 'textarea', false));
  return ds;
}
