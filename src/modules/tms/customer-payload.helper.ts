/**
 * Payload `of1/CUSTOMER` — mục 3 contract OF1-TMS v1.3.
 *
 * Upsert theo `customerCode`: cùng mã = cập nhật, mã mới = tạo mới. Gửi lại an
 * toàn, không sinh bản ghi trùng — nên lỡ mất phản hồi thì cứ chạy lại.
 *
 * KHÔNG gửi `addresses[]`: hồ sơ khách của BeeOps không có trường địa chỉ nào
 * cả. Địa chỉ nằm trên TỪNG ĐƠN dưới dạng chữ tự do, mỗi đơn một kiểu, và
 * không có mã để tham chiếu. Bịa ra `addressCode` từ chuỗi địa chỉ của đơn là
 * tạo một danh mục mà BeeOps không có chỗ nào quản lý, rồi lần sau sửa đơn là
 * hai bên lệch nhau mà không ai thấy.
 *
 * Hệ quả: đơn vẫn gửi `pickupAddress`/`deliveryAddress` dạng chữ. Contract mục
 * 5.2 cho phép, chỉ thiếu toạ độ.
 */
export interface PayloadCustomer {
  customerCode: string;
  name: string;
  shortName?: string;
  taxCode?: string;
  /** Địa chỉ trụ sở — hiển thị trên hồ sơ khách bên OF1. */
  address?: string;
  emails?: string[];
  note?: string;
  /** Địa chỉ lấy/giao của khách — đơn hàng tham chiếu bằng `addressCode`. */
  addresses?: DiaChiKhach[];
}

export interface DiaChiKhach {
  addressCode: string;
  address: string;
  contact?: string;
  type?: 'PICKUP' | 'DELIVERY' | 'BOTH';
}

/**
 * Địa chỉ trụ sở moi ra từ ghi chú.
 *
 * Lần nhập dữ liệu cũ nhét địa chỉ vào `note` theo một khuôn cố định —
 * "Nhom: CARRIER\nDia chi: 152 Nguyen Luong Bang st" — và 534/697 hồ sơ có nó.
 * Contract có hẳn ô `address` cho hồ sơ khách, nên để địa chỉ nằm lẫn trong
 * ghi chú là bỏ phí một ô mà bên kia có chỗ hiển thị tử tế.
 *
 * Vẫn giữ NGUYÊN `note`: nó còn mang "Nhom: CARRIER", thứ ta không có ô nào
 * khác để đựng. Chép ra chứ không cắt đi.
 */
export function diaChiTuGhiChu(note: string | null | undefined): string | undefined {
  const m = /(?:^|\n)\s*(?:[dđ][iị]a ch[iỉ])\s*:\s*(.+)/i.exec(note ?? '');
  const s = m?.[1]?.trim();
  /* Phai co it nhat mot chu hoac so, va dai hon hai ky tu: du lieu cu co dong
     ghi "Dia chi: ." — mot dau cham khong phai dia chi, va gui no sang la de
     lai mot o rac tren ho so khach ben doi tac. */
  return s !== undefined && s.length >= 3 && /[\p{L}\p{N}]/u.test(s) ? s : undefined;
}

/** Phần hồ sơ khách mà OF1 cần — khai riêng để test không phải dựng Prisma. */
export interface KhachDeDay {
  code: string | null;
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  taxCode: string | null;
  note: string | null;
  status: string;
  /** Danh mục địa chỉ của khách (070). Rỗng = khách chưa có đơn nào có địa chỉ. */
  addresses?: {
    code: string; address: string; contact: string | null; type: string; isActive: boolean;
  }[];
}

/** Một ô còn thiếu, kèm chỗ sửa. */
export interface OThieuKhach {
  truong: string;
  nhan: string;
}

const chuoi = (...ungVien: (string | null | undefined)[]): string | undefined => {
  for (const v of ungVien) {
    const s = v?.trim();
    if (s) return s;
  }
  return undefined;
};

/**
 * Những ô BẮT BUỘC mà hồ sơ khách còn thiếu — rỗng nghĩa là đồng bộ được.
 *
 * Chấm ở nhà chứ không để OF1 trả 400: đây là vòng chạy hàng loạt, một câu
 * lỗi giữa bảy trăm dòng thì không ai đọc ra là của khách nào.
 */
export function thieuGiDeDongBo(k: KhachDeDay): OThieuKhach[] {
  const thieu: OThieuKhach[] = [];
  if (!chuoi(k.code)) thieu.push({ truong: 'customerCode', nhan: 'Mã khách hàng' });
  if (!chuoi(k.companyName, k.contactName))
    thieu.push({ truong: 'name', nhan: 'Tên khách hàng' });
  /* Khách chưa duyệt thì KHÔNG đẩy: hồ sơ `pending` là hồ sơ chưa ai xác nhận,
     mà đẩy sang rồi thì không xoá được — contract không có API xoá. */
  if (k.status !== 'approved')
    thieu.push({ truong: 'status', nhan: `Hồ sơ chưa duyệt (${k.status})` });
  return thieu;
}

/** Gọi SAU `thieuGiDeDongBo` — hàm này tin rằng mọi ô bắt buộc đã có. */
export function dungPayloadCustomer(k: KhachDeDay): PayloadCustomer {
  const thieu = thieuGiDeDongBo(k);
  if (thieu.length > 0)
    throw new Error(`Khách còn thiếu: ${thieu.map((t) => t.nhan).join(', ')}`);

  const p: PayloadCustomer = {
    customerCode: chuoi(k.code) as string,
    name: chuoi(k.companyName, k.contactName) as string,
  };
  /* Tên ngắn chỉ gửi khi nó KHÁC tên đầy đủ: contract nói trống thì OF1 tự
     dùng `name`, nên gửi lại y hệt là thêm một bản sao để sau này lệch nhau. */
  const ngan = chuoi(k.contactName);
  if (ngan !== undefined && ngan !== p.name) p.shortName = ngan;

  const thue = chuoi(k.taxCode);
  if (thue !== undefined) p.taxCode = thue;
  const diaChi = diaChiTuGhiChu(k.note);
  if (diaChi !== undefined) p.address = diaChi;
  const mail = chuoi(k.email);
  if (mail !== undefined) p.emails = [mail];
  const ghiChu = chuoi(k.note);
  if (ghiChu !== undefined) p.note = ghiChu;

  /* Chỉ gửi địa chỉ ĐANG BẬT. Tắt một địa chỉ ở BeeOps rồi vẫn gửi sang là
     nói với OF1 rằng nó còn dùng được, và đơn sau đó lại trỏ vào nó. */
  const ds = (k.addresses ?? []).filter((d) => d.isActive);
  if (ds.length > 0) {
    p.addresses = ds.map((d) => ({
      addressCode: d.code,
      address: d.address,
      ...(d.contact ? { contact: d.contact } : {}),
      type: (d.type === 'PICKUP' || d.type === 'DELIVERY' ? d.type : 'BOTH'),
    }));
  }
  return p;
}
