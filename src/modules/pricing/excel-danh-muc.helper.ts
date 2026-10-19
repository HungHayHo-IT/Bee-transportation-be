import type * as ExcelJS from 'exceljs';

/**
 * Trang "Danh mục" và ô chọn (dropdown) cho file bảng giá.
 *
 * Nhập Excel khớp địa điểm và dịch vụ THEO TÊN. Để người ta gõ tay thì sai một
 * dấu là mất cả dòng, và câu báo lỗi chỉ nói được "không có địa điểm ..." —
 * đúng nhưng vô ích, vì họ không biết tên đúng là gì. Ô chọn cắt hẳn cả lớp
 * lỗi đó: không gõ được cái tên không tồn tại.
 *
 * Dùng chung cho cả file MẪU và file XUẤT RA, vì quy trình sửa hàng loạt là
 * xuất → sửa trong Excel → nhập lại; file xuất ra mà không có ô chọn thì đúng
 * lúc người ta sửa nhiều nhất lại là lúc không được đỡ.
 */

export const TEN_TRANG_DANH_MUC = 'Danh mục';

export interface MucDanhMuc {
  name: string;
  province?: string | null;
}

/** Số dòng dữ liệu tối thiểu được gắn ô chọn, kể cả khi bảng đang trống. */
const DONG_TOI_THIEU = 300;

/**
 * Thêm trang "Danh mục" liệt kê tên địa điểm và đơn vị tính đang có.
 *
 * KHÔNG còn cột Dịch vụ (059): giá đi theo địa điểm, file nhập không có cột đó.
 *
 * Trả về số lượng mỗi loại để bên gọi biết có đủ dữ liệu mà gắn ô chọn không.
 */
export function themTrangDanhMuc(
  wb: ExcelJS.Workbook,
  diaDiem: readonly MucDanhMuc[],
  donVi: readonly MucDanhMuc[] = [],
): { soDiaDiem: number; soDonVi: number } {
  const dm = wb.addWorksheet(TEN_TRANG_DANH_MUC);
  dm.columns = [
    { header: 'Địa điểm', key: 'loc', width: 34 },
    { header: 'Tỉnh/thành', key: 'prov', width: 22 },
    { header: 'Đơn vị tính', key: 'unit', width: 38 },
  ];
  dm.getRow(1).font = { bold: true };

  // Hai danh sách dài không bằng nhau nên đi song song theo chỉ số, không ghép
  // cặp — dòng thứ ba không có nghĩa là "địa điểm 3 dùng đơn vị tính 3".
  const soDong = Math.max(diaDiem.length, donVi.length);
  for (let i = 0; i < soDong; i += 1) {
    dm.addRow({
      loc: diaDiem[i]?.name ?? '',
      prov: diaDiem[i]?.province ?? '',
      unit: donVi[i]?.name ?? '',
    });
  }

  return { soDiaDiem: diaDiem.length, soDonVi: donVi.length };
}

/** Vùng ô trên trang Danh mục, viết đúng kiểu Excel hiểu. */
function vung(cot: string, soMuc: number): string {
  // Tên trang có dấu cách nên phải bọc nháy đơn, nếu không Excel đọc thành hai
  // thứ khác nhau và ô chọn im lặng không hiện gì.
  return `'${TEN_TRANG_DANH_MUC}'!$${cot}$2:$${cot}$${soMuc + 1}`;
}

/**
 * Gắn ô chọn cho ba cột Điểm đi / Điểm đến / Đơn vị tính.
 *
 * `soDongDuLieu` là số dòng đang có; hàm tự gắn dư thêm để người dùng còn chỗ
 * thêm tuyến mới mà vẫn được chọn từ danh sách.
 *
 * Danh mục rỗng thì KHÔNG gắn gì: một ô chọn trỏ vào vùng rỗng làm Excel báo
 * file hỏng, tức là đổi một bất tiện lấy một file không mở được.
 */
export function themODuocChon(
  ws: ExcelJS.Worksheet,
  soDiaDiem: number,
  soDonVi: number,
  soDongDuLieu: number,
): void {
  const den = Math.max(soDongDuLieu, 0) + DONG_TOI_THIEU + 1;

  const gan = (cot: string, nguon: string, ten: string): void => {
    for (let r = 2; r <= den; r += 1) {
      ws.getCell(`${cot}${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [nguon],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'Tên không có trong danh mục',
        error:
          `Chọn ${ten} từ danh sách. Gõ tay một cái tên chưa có trong hệ thống ` +
          'thì lúc nhập lên dòng đó sẽ bị bỏ.',
      };
    }
  };

  if (soDiaDiem > 0) {
    gan('A', vung('A', soDiaDiem), 'điểm đi');
    gan('B', vung('A', soDiaDiem), 'điểm đến');
  }
  // Cột C là Đơn vị tính (059 bỏ cột Dịch vụ nên nó dịch từ D sang C). Gõ tay
  // thì dòng đó bị bỏ lúc nhập, mà nhãn kiểu "20'DC ≤ 17 tấn" có dấu ≤ thì gõ
  // tay gần như chắc chắn sai.
  if (soDonVi > 0) gan('C', vung('C', soDonVi), 'đơn vị tính');
}
