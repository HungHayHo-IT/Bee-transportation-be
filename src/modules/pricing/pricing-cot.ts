/**
 * Tiêu đề cột của file nhập/xuất bảng giá.
 *
 * Để riêng vì XUẤT và NHẬP phải dùng CHUNG danh sách này: người ta xuất ra, sửa
 * trong Excel rồi nhập lại. Hai bản sao lệch nhau một chữ là cả file nhập lên
 * báo thiếu cột, mà nhìn bằng mắt thì file trông đúng y như lúc tải về.
 */
export const COT = {
  origin: 'Điểm đi',
  destination: 'Điểm đến',
  /* KHÔNG có cột Dịch vụ (059): giá đi theo ĐỊA ĐIỂM. Cước một chặng là tiền
     của chặng đường và loại xe; nó không đổi vì đơn được xếp vào dịch vụ nào.

     Một tuyến có nhiều mức giá, mỗi đơn vị tính một mức. Thiếu cột này thì file
     nhập chỉ mang được 1 trong 8 con số của một tuyến container, và không ai
     biết con số đó là của loại xe nào. */
  unit: 'Đơn vị tính',
  price: 'Giá (VND)',
  note: 'Ghi chú',
} as const;
