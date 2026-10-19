import type { OpenAPIObject } from '@nestjs/swagger';
import { ENVELOPE_ERROR_SCHEMA, ENVELOPE_META_SCHEMA, wrapOpenApiInEnvelope } from './envelope-openapi';

/**
 * Tài liệu tí hon tự dựng: hàm bọc vỏ là hàm THUẦN nên test được thẳng, không
 * cần NestFactory.create() — mục đích chính của việc tách nó ra khỏi main.ts.
 */
function tinyDoc(): Record<string, unknown> {
  return {
    openapi: '3.0.0',
    paths: {
      '/orders': {
        get: {
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderPageDto' } } },
            },
            '400': {
              description: 'Tham số sai',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          },
        },
        post: {
          responses: {
            '201': {
              description: 'Created',
              content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } },
            },
            '204': { description: 'Không có body' },
          },
        },
      },
      '/notifications/stream': {
        get: {
          responses: {
            '200': {
              description: 'SSE',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/StreamFrame' } } },
            },
          },
        },
      },
    },
    components: { schemas: { OrderPageDto: { type: 'object' } } },
  };
}

/**
 * Cây OpenAPI ở đây không có kiểu tĩnh, nên test duyệt nó bằng chuỗi khoá động.
 * Mọi lần đi sâu đều qua `dig()` thay vì nối `.a.b.c`: lint cấm `any`, còn
 * `unknown` thì chặn luôn phép nối khoá — `dig` là chỗ duy nhất phải ép kiểu,
 * và ép đúng một lần thay vì rải khắp file.
 */
type AnyRec = Record<string, unknown>;

function dig(node: unknown, ...keys: string[]): AnyRec {
  let cur = node as AnyRec;
  for (const k of keys) cur = cur[k] as AnyRec;
  return cur;
}

function schemaAt(doc: AnyRec, path: string, method: string, status: string): AnyRec {
  return dig(doc, 'paths', path, method, 'responses', status, 'content', 'application/json', 'schema');
}

describe('wrapOpenApiInEnvelope', () => {
  it('bọc response 2xx: schema gốc chuyển xuống thuộc tính data', () => {
    const out = wrapOpenApiInEnvelope(tinyDoc()) as AnyRec;
    const s = schemaAt(out, '/orders', 'get', '200');

    expect(s.type).toBe('object');
    expect(s.required).toEqual(['success', 'data', 'meta']);
    expect(dig(s, 'properties', 'success')).toMatchObject({ type: 'boolean', enum: [true] });
    expect(dig(s, 'properties', 'data')).toEqual({ $ref: '#/components/schemas/OrderPageDto' });
    expect(dig(s, 'properties', 'meta')).toEqual({ $ref: '#/components/schemas/EnvelopeMeta' });
  });

  it('bọc cả 201 và giữ nguyên schema gốc dạng mảng', () => {
    const out = wrapOpenApiInEnvelope(tinyDoc()) as AnyRec;
    expect(dig(schemaAt(out, '/orders', 'post', '201'), 'properties', 'data')).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('không đụng response 2xx không có body (204)', () => {
    const out = wrapOpenApiInEnvelope(tinyDoc()) as AnyRec;
    expect(dig(out, 'paths', '/orders', 'post', 'responses', '204'))
      .toEqual({ description: 'Không có body' });
  });

  it('chuyển response 4xx sang schema lỗi chung, giữ nguyên description', () => {
    const out = wrapOpenApiInEnvelope(tinyDoc()) as AnyRec;
    const res = dig(out, 'paths', '/orders', 'get', 'responses', '400');

    expect(res.description).toBe('Tham số sai');
    expect(dig(res, 'content', 'application/json', 'schema')).toEqual({
      $ref: '#/components/schemas/EnvelopeError',
    });
  });

  it('bỏ qua đường dẫn SSE vì handler gắn @SkipEnvelope()', () => {
    const out = wrapOpenApiInEnvelope(tinyDoc()) as AnyRec;
    expect(schemaAt(out, '/notifications/stream', 'get', '200')).toEqual({
      $ref: '#/components/schemas/StreamFrame',
    });
  });

  it('nhận danh sách đường dẫn bỏ qua do người gọi truyền vào', () => {
    const out = wrapOpenApiInEnvelope(tinyDoc(), { skipPaths: ['/orders'] }) as AnyRec;

    expect(schemaAt(out, '/orders', 'get', '200')).toEqual({
      $ref: '#/components/schemas/OrderPageDto',
    });
    // Danh sách tự truyền thay hẳn mặc định, nên SSE lúc này bị bọc.
    expect(dig(schemaAt(out, '/notifications/stream', 'get', '200'), 'properties')).toBeDefined();
  });

  it('bỏ qua media type text/event-stream dù đường dẫn không nằm trong danh sách', () => {
    const doc = tinyDoc() as AnyRec;
    (doc.paths as AnyRec)['/reports/live'] = {
      get: {
        responses: {
          '200': { description: 'SSE', content: { 'text/event-stream': { schema: { type: 'string' } } } },
        },
      },
    };

    const out = wrapOpenApiInEnvelope(doc) as AnyRec;
    expect(dig(out, 'paths', '/reports/live', 'get', 'responses', '200',
      'content', 'text/event-stream', 'schema')).toEqual({
      type: 'string',
    });
  });

  it('khai schema vỏ dùng chung vào components và giữ schema có sẵn', () => {
    const out = wrapOpenApiInEnvelope(tinyDoc()) as AnyRec;

    expect(dig(out, 'components', 'schemas', 'EnvelopeMeta')).toEqual(ENVELOPE_META_SCHEMA);
    expect(dig(out, 'components', 'schemas', 'EnvelopeError')).toEqual(ENVELOPE_ERROR_SCHEMA);
    expect(dig(out, 'components', 'schemas', 'OrderPageDto')).toEqual({ type: 'object' });
  });

  it('không sửa tài liệu đầu vào — hàm thuần, gọi lại vẫn ra kết quả cũ', () => {
    const doc = tinyDoc();
    const snapshot = JSON.stringify(doc);

    wrapOpenApiInEnvelope(doc);

    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  // main.ts truyền thẳng kết quả của SwaggerModule.createDocument() vào rồi đưa
  // tiếp cho SwaggerModule.setup(); kiểu phải đi qua nguyên vẹn, nếu không chỗ đó
  // chỉ vỡ lúc build chứ không vỡ ở test nào.
  it('giữ nguyên kiểu OpenAPIObject để main.ts nối thẳng được', () => {
    const nestDoc: OpenAPIObject = {
      openapi: '3.0.0',
      info: { title: 'BeeOps', version: '1.0' },
      paths: {
        '/health': {
          get: {
            responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } } },
          },
        },
      },
    };
    const out: OpenAPIObject = wrapOpenApiInEnvelope(nestDoc);

    expect(dig(schemaAt(out as unknown as AnyRec, '/health', 'get', '200'), 'properties', 'data')).toEqual({
      type: 'object',
    });
  });

  it('chịu được tài liệu rỗng, không có paths lẫn components', () => {
    expect(() => wrapOpenApiInEnvelope({ openapi: '3.0.0' })).not.toThrow();
  });
});
