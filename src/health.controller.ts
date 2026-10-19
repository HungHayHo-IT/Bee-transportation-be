import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './common/prisma/prisma.service';

@ApiTags('System')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness — cho reverse proxy' })
  @ApiResponse({ status: 200 })
  async check(): Promise<{ status: string; db: string; now: Date }> {
    const [row] = await this.prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    return { status: 'ok', db: 'up', now: row.now };
  }
}
