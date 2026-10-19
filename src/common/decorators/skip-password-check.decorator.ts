import { SetMetadata } from '@nestjs/common';

export const SKIP_PASSWORD_CHECK = 'skipPasswordCheck';
export const SkipPasswordCheck = () => SetMetadata(SKIP_PASSWORD_CHECK, true);
