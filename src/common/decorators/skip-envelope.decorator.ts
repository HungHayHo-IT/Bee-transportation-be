import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE = 'skipEnvelope';

/**
 * Trả body THÔ, không bọc { success, data, meta }.
 * Dành cho luồng SSE: bọc một Observable vào vỏ JSON thì client nhận rác.
 */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE, true);
