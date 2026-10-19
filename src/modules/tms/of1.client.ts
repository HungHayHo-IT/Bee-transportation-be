import { Injectable, Logger } from '@nestjs/common';
import { BiMatService } from '@/common/bi-mat/bi-mat.service';
import type { PayloadCustomer } from './customer-payload.helper';
import type { PayloadTmsBill } from './tms-payload.helper';

/**
 * Ba kết quả, KHÔNG phải hai.
 *
 * `khong_ro` là cái quan trọng nhất: OF1 không chặn trùng fileNo, mỗi CREATE
 * nhận được là một bill MỚI. Gửi lại khi không chắc lần trước hỏng là sinh đơn
 * trùng bên đối tác — tài liệu mục 8 nói thẳng điều này. Nên chỉ đánh
 * `tu_choi` khi OF1 nói rõ là nó từ chối; còn lại đều là `khong_ro` và phải
 * có người đối soát trước khi gửi lần nữa.
 */
export interface KetQuaDayTms {
  ketQua: 'nhan' | 'tu_choi' | 'khong_ro';
  loi: string | null;
  /**
   * Cảnh báo KHÔNG chặn request — mục 3 contract v1.3.
   *
   * OF1 trả `status: 'S'` kèm `warnings` khi nó nhận bản ghi nhưng có phần
   * không dùng được: ví dụ một địa chỉ không định vị nổi thì mã địa chỉ ấy
   * KHÔNG được lưu, và đơn sau đó tham chiếu vào nó sẽ bị từ chối.
   *
   * Nuốt cảnh báo là biến một lỗi báo trước thành một lỗi bất ngờ ở đơn hàng,
   * cách chỗ gây ra nó vài ngày.
   */
  canhBao: string[];
}

function chuoiHoacRong(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Tách riêng khỏi phần gọi mạng để test được mà không cần dựng máy chủ giả. */
export function docPhanHoiOf1(httpStatus: number, body: unknown): KetQuaDayTms {
  if (httpStatus !== 200) {
    return { ketQua: 'khong_ro', loi: `HTTP ${httpStatus}`, canhBao: [] };
  }
  if (typeof body !== 'object' || body === null) {
    return { ketQua: 'khong_ro', loi: 'Phản hồi không đọc được', canhBao: [] };
  }
  const b = body as Record<string, unknown>;

  // Lỗi khung ngoài: data rỗng, lý do nằm ở `error`. Gặp khi token sai.
  const err = b.error as Record<string, unknown> | null | undefined;
  if (err && typeof err === 'object') {
    const loai = chuoiHoacRong(err.errorType) || 'Lỗi';
    return { ketQua: 'tu_choi', loi: `${loai}: ${chuoiHoacRong(err.message)}`, canhBao: [] };
  }

  /* TMSBILL gói kết quả trong `data`; CUSTOMER và wh-locations đặt
     `status`/`message` ngay ngoài. Tài liệu viết cả hai kiểu, nên đọc cả hai
     thay vì tin một — đoán sai là mọi lần gọi đều thành "không rõ", và
     "không rõ" là trạng thái bắt người ta đi đối soát tay. */
  const data = (b.data && typeof b.data === 'object' && !Array.isArray(b.data)
    ? b.data as Record<string, unknown>
    : typeof b.status === 'string' ? b : null);
  if (!data) {
    return { ketQua: 'khong_ro', loi: 'Phản hồi thiếu data', canhBao: [] };
  }
  const canhBao = Array.isArray(data.warnings) ? data.warnings.map(String) : [];
  if (data.status === 'S') return { ketQua: 'nhan', loi: null, canhBao };
  if (data.status === 'E') {
    const ds = Array.isArray(data.errors) ? data.errors.map(String) : [];
    const chinh = chuoiHoacRong(data.message) || 'OF1 từ chối';
    return { ketQua: 'tu_choi', loi: ds.length ? `${chinh}: ${ds.join('; ')}` : chinh, canhBao };
  }
  return { ketQua: 'khong_ro', loi: `data.status lạ: ${String(data.status)}`, canhBao };
}

/** Thiếu cấu hình thì KHÔNG gọi — im lặng còn hơn gọi vào địa chỉ rỗng. */
export interface CauHinhOf1 {
  url: string;
  token: string;
}

/** Một kho/cảng/KCN trong master data của OF1 — mục 4 contract v1.3. */
export interface KhoCangOf1 {
  locationId: number;
  code: string | null;
  shortLabel: string | null;
  label: string | null;
  locationType: string | null;
  address: string | null;
  stateLabel: string | null;
}

function chuoiHoacNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

@Injectable()
export class Of1Client {
  private readonly logger = new Logger(Of1Client.name);

  constructor(private readonly biMat: BiMatService) {}

  /** Cả ba biến đều đi qua BiMatService: mã hoá hay không là việc của .env,
   *  chỗ này không cần biết. */
  docCauHinh(api = 'TMSBILL'): CauHinhOf1 | null {
    const goc = this.biMat.doc('OF1_TMS_URL').replace(/\/+$/, '');
    const ma = this.biMat.doc('OF1_COMPANY_CODE');
    const token = this.biMat.doc('OF1_TOKEN');
    if (!goc || !ma || !token) return null;
    return { url: `${goc}/webhook/${ma}/of1/${api}`, token };
  }

  /**
   * Danh sách kho/cảng của OF1 — mục 4 contract v1.3.
   *
   * CHỈ ĐỌC: POST với body rỗng, không tạo ra gì bên kia, gọi lại bao nhiêu
   * lần cũng được. Khác hẳn `day()` — mỗi lần gọi đó là một bill thật.
   *
   * Ném lỗi thay vì trả mảng rỗng: danh sách rỗng và "gọi không được" là hai
   * chuyện khác nhau, mà bên gọi đang định lấy nó đi điền vào danh mục.
   */
  async layKhoCang(cauHinh: CauHinhOf1): Promise<KhoCangOf1[]> {
    const res = await fetch(cauHinh.url, {
      method: 'POST',
      headers: {
        Authorization: cauHinh.token,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: '{}',
      signal: AbortSignal.timeout(30_000),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.status !== 200 || typeof body !== 'object' || body === null)
      throw new Error(`OF1 wh-locations: HTTP ${res.status}`);
    const b = body as Record<string, unknown>;
    const err = b.error as Record<string, unknown> | null | undefined;
    if (err && typeof err === 'object')
      throw new Error(`OF1 wh-locations: ${chuoiHoacRong(err.message) || 'lỗi'}`);
    /* Envelope của wh-locations đặt status/data ở NGOÀI, khác TMSBILL đặt
       trong `data`. Nhận cả hai dạng để một lần OF1 đổi khung không làm hỏng
       cả vòng đồng bộ. */
    const trong = (b.data && typeof b.data === 'object' && !Array.isArray(b.data)
      ? b.data as Record<string, unknown> : b);
    const ds = Array.isArray(trong.data) ? trong.data
      : Array.isArray(b.data) ? b.data : null;
    if (!ds) throw new Error(`OF1 wh-locations: phản hồi thiếu data — ${JSON.stringify(b).slice(0, 200)}`);
    return ds.map((x) => {
      const o = x as Record<string, unknown>;
      return {
        locationId: Number(o.locationId),
        code: chuoiHoacNull(o.code),
        shortLabel: chuoiHoacNull(o.shortLabel),
        label: chuoiHoacNull(o.label),
        locationType: chuoiHoacNull(o.locationType),
        address: chuoiHoacNull(o.address),
        stateLabel: chuoiHoacNull(o.stateLabel),
      };
    }).filter((x) => Number.isInteger(x.locationId) && x.locationId > 0);
  }

  /**
   * Đồng bộ một khách sang OF1 — mục 3 contract v1.3.
   *
   * UPSERT theo `customerCode`: gửi lại an toàn, không sinh bản ghi trùng.
   * Khác hẳn `day()` của đơn hàng — chỗ đó mỗi lần gọi là một bill mới.
   *
   * Vẫn GHI THẬT vào hệ thống bên kia, và contract chưa có API xoá: sai thì
   * phải nhờ Bee sửa tay.
   */
  async dayKhach(payload: PayloadCustomer, cauHinh: CauHinhOf1): Promise<KetQuaDayTms> {
    try {
      const res = await fetch(cauHinh.url, {
        method: 'POST',
        headers: {
          Authorization: cauHinh.token,
          'Content-Type': 'application/json;charset=UTF-8',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      const body: unknown = await res.json().catch(() => null);
      const kq = docPhanHoiOf1(res.status, body);
      if (kq.ketQua !== 'nhan')
        this.logger.warn(`OF1 CUSTOMER ${payload.customerCode}: ${kq.ketQua} — ${kq.loi ?? ''}`);
      /* Cảnh báo ghi lại NGAY CẢ KHI nhận: 'S' kèm cảnh báo nghĩa là hồ sơ vào
         được nhưng một phần bị bỏ, và phần bị bỏ đó sẽ làm đơn hỏng về sau. */
      for (const c of kq.canhBao)
        this.logger.warn(`OF1 CUSTOMER ${payload.customerCode}: cảnh báo — ${c}`);
      return kq;
    } catch (e) {
      /* Upsert nên gửi lại được — nhưng vẫn là `khong_ro`: ta không biết lần
         này đã vào hay chưa, và câu trả lời đó mới là thứ người đối soát cần. */
      this.logger.warn(`OF1 CUSTOMER ${payload.customerCode}: không rõ — ${String(e)}`);
      return { ketQua: 'khong_ro', loi: String(e), canhBao: [] };
    }
  }

  async day(payload: PayloadTmsBill, cauHinh: CauHinhOf1): Promise<KetQuaDayTms> {
    try {
      const res = await fetch(cauHinh.url, {
        method: 'POST',
        headers: {
          // Token NGUYÊN VĂN, không `Basic`, không `Bearer` — mục 2 tài liệu
          // OF1-TMS v1.0. Thêm tiền tố vào là bị chặn ngay ở vòng ngoài.
          Authorization: cauHinh.token,
          'Content-Type': 'application/json;charset=UTF-8',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      const body: unknown = await res.json().catch(() => null);
      const kq = docPhanHoiOf1(res.status, body);
      if (kq.ketQua !== 'nhan') {
        this.logger.warn(`OF1 ${payload.fileNo}: ${kq.ketQua} — ${kq.loi ?? ''}`);
      }
      for (const c of kq.canhBao)
        this.logger.warn(`OF1 ${payload.fileNo}: cảnh báo — ${c}`);
      return kq;
    } catch (e) {
      // Mạng đứt hoặc hết giờ chờ: đơn CÓ THỂ đã vào OF1 rồi. Không bao giờ
      // đánh là từ chối.
      this.logger.warn(`OF1 ${payload.fileNo}: không rõ kết quả — ${String(e)}`);
      return { ketQua: 'khong_ro', loi: String(e), canhBao: [] };
    }
  }
}
