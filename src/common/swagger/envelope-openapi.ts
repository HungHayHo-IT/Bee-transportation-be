/**
 * Khai vỏ { success, data, meta } vào tài liệu OpenAPI.
 *
 * Controller trả thẳng DTO, còn vỏ do TransformInterceptor và HttpExceptionFilter
 * dựng lúc chạy — hai chỗ Swagger hoàn toàn không nhìn thấy. Hậu quả: spec phát ra
 * khai endpoint trả DTO trần, trong khi client nhận được DTO đã bọc. Ai sinh code
 * từ spec đều nhận sai kiểu, và đội mobile phải tự viết lớp bóc vỏ kèm test riêng
 * chỉ để bù cho chỗ lệch này.
 *
 * Tách thành hàm THUẦN (nhận tài liệu, trả tài liệu mới) thay vì nhét vào main.ts:
 * test được bằng một tài liệu tí hon tự dựng, không phải khởi động cả ứng dụng
 * NestJS chỉ để xem một schema có đúng hình dạng không.
 */

/** Hình dạng tối thiểu mà hàm này cần đọc. Không dùng type của @nestjs/swagger để
 *  test dựng được tài liệu giả bằng object thường. */
interface MediaTypeLike {
  schema?: unknown;
}
interface ResponseLike {
  description?: string;
  content?: Record<string, MediaTypeLike>;
}
interface OperationLike {
  responses?: Record<string, ResponseLike>;
}
type PathItemLike = Record<string, OperationLike>;
interface DocumentLike {
  paths?: Record<string, PathItemLike>;
  components?: { schemas?: Record<string, unknown> };
}

export const ENVELOPE_META_SCHEMA = {
  type: 'object',
  required: ['timestamp', 'path'],
  properties: {
    timestamp: { type: 'string', format: 'date-time' },
    path: { type: 'string', description: 'Đường dẫn của request sinh ra response này' },
  },
} as const;

export const ENVELOPE_ERROR_SCHEMA = {
  type: 'object',
  required: ['success', 'error', 'meta'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    error: {
      type: 'object',
      required: ['code', 'message', 'statusCode'],
      properties: {
        code: { type: 'string', description: 'Tên lớp exception, ví dụ "ConflictException"' },
        message: { type: 'string' },
        statusCode: { type: 'integer' },
        // `details` chỉ có ở một số lỗi (409 trùng tên khách kèm existingCustomerId).
        details: { type: 'object', additionalProperties: true },
      },
    },
    meta: { $ref: '#/components/schemas/EnvelopeMeta' },
  },
} as const;

export const ENVELOPE_META_REF = '#/components/schemas/EnvelopeMeta';
export const ENVELOPE_ERROR_REF = '#/components/schemas/EnvelopeError';

/**
 * Đường dẫn của handler gắn @SkipEnvelope() — trả body THÔ, không bọc vỏ.
 *
 * ĐIỂM YẾU ĐÃ BIẾT: tài liệu OpenAPI không mang theo metadata của decorator, nên
 * ở tầng này không có cách sạch nào đọc được SKIP_ENVELOPE. Lấy đúng thông tin đó
 * đòi hỏi duyệt container của Nest và dò ngược từng handler về path — nhiều mã,
 * dễ vỡ, và chỉ để phục vụ một endpoint duy nhất. Vì vậy dùng danh sách cứng.
 * THÊM @SkipEnvelope() Ở ĐÂU THÌ THÊM ĐƯỜNG DẪN VÀO ĐÂY, nếu không spec sẽ khai
 * sai đúng theo kiểu lỗi mà tệp này sinh ra để sửa.
 */
const DEFAULT_SKIP_PATHS = ['/notifications/stream'];

/** Vỏ SSE là text/event-stream; bọc JSON vào đó thì hỏng giao thức. Chặn thêm một
 *  lớp theo media type để endpoint SSE mới quên khai vẫn không bị bọc nhầm. */
const RAW_MEDIA_TYPES = ['text/event-stream'];

export interface WrapOpenApiOptions {
  /** Thay hẳn danh sách mặc định (không cộng dồn) — để test kiểm được từng nhánh. */
  skipPaths?: string[];
}

function isSuccessStatus(status: string): boolean {
  return /^2\d\d$/.test(status);
}

function isErrorStatus(status: string): boolean {
  return /^[45]\d\d$/.test(status);
}

export function wrapOpenApiInEnvelope<T>(doc: T, options: WrapOpenApiOptions = {}): T {
  const skipPaths = options.skipPaths ?? DEFAULT_SKIP_PATHS;
  // Nhân bản trước khi sửa: hàm thuần thì gọi hai lần phải ra cùng kết quả, và
  // đối tượng tài liệu gốc vẫn dùng được cho việc khác (ghi ra file, so sánh).
  const out = structuredClone(doc) as DocumentLike;

  const components = (out.components ??= {});
  const schemas = (components.schemas ??= {});
  schemas.EnvelopeMeta = structuredClone(ENVELOPE_META_SCHEMA) as unknown;
  schemas.EnvelopeError = structuredClone(ENVELOPE_ERROR_SCHEMA) as unknown;

  for (const [path, pathItem] of Object.entries(out.paths ?? {})) {
    if (skipPaths.includes(path)) continue;

    for (const operation of Object.values(pathItem ?? {})) {
      for (const [status, response] of Object.entries(operation?.responses ?? {})) {
        // 204 và bạn bè không có body, không có gì để bọc.
        if (!response?.content) continue;

        for (const [mediaType, media] of Object.entries(response.content)) {
          if (RAW_MEDIA_TYPES.includes(mediaType)) continue;

          if (isErrorStatus(status)) {
            // Mọi lỗi đều ra khỏi HttpExceptionFilter với cùng một hình dạng, nên
            // schema riêng của từng mã lỗi (thường chỉ là {} do Nest tự sinh) chỉ
            // làm client đoán sai. Trỏ hết về một schema chung.
            media.schema = { $ref: ENVELOPE_ERROR_REF };
            continue;
          }

          if (!isSuccessStatus(status) || media.schema === undefined) continue;

          media.schema = {
            type: 'object',
            required: ['success', 'data', 'meta'],
            properties: {
              success: { type: 'boolean', enum: [true] },
              data: media.schema,
              meta: { $ref: ENVELOPE_META_REF },
            },
          };
        }
      }
    }
  }

  return out as T;
}
