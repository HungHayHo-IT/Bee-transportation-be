import { SetMetadata } from '@nestjs/common';

export const TRANG_KEY = 'trang_quyen';

/**
 * Khai endpoint này thuộc TRANG nào trong ma trận phân quyền.
 *
 * Đặt trên cả controller (cả nhóm endpoint cùng một trang) hoặc trên từng
 * handler khi một controller phục vụ nhiều trang. Khai ở handler thì đè lên
 * khai ở controller.
 *
 * Khai được NHIỀU trang, và khi đó CHỈ CẦN MỘT trang cho phép là qua. Có vì
 * một endpoint thật sự phục vụ hai màn: `/route-prices` vừa là dữ liệu của màn
 * Giá niêm yết vừa của màn Tuyến & giá. Ép nó về một trang thì ô kia trong ma
 * trận nói dối — bật lên mà màn vẫn trống.
 */
export const Trang = (...pageKeys: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(TRANG_KEY, pageKeys);
