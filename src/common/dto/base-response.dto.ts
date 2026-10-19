export interface ResponseMeta {
  timestamp: string;
  path: string;
}

export interface BaseResponseDto<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ErrorResponseDto {
  success: false;
  error: { code: string; message: string; statusCode: number };
  meta: ResponseMeta;
}
