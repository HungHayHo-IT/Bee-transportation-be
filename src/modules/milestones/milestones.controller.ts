import { Body, Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { onePage, PageResult } from '@/common/dto/pagination.dto';
import { Role } from '@/common/enums';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { OrderMilestoneDto, OrderMilestonePageDto } from '../orders/dto/order-response.dto';
import { UpdateMilestoneDto } from './dto/milestone.dto';
import { MilestonesService } from './milestones.service';

@ApiTags('Milestones (F5)')
@Controller('orders/:id/milestones')
export class MilestonesController {
  constructor(private readonly milestonesService: MilestonesService) {}

  @Get()
  @ApiOperation({ summary: 'Bộ mốc tiến độ của đơn' })
  @ApiResponse({ status: 200, type: OrderMilestonePageDto })
  async list(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<OrderMilestoneDto>> {
    return onePage(await this.milestonesService.list(id, user));
  }

  @Patch(':milestoneId')
  @Roles(Role.MANAGER, Role.STAFF, Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật mốc — tuần tự, không bỏ qua mốc cuối' })
  @ApiResponse({ status: 200, type: OrderMilestonePageDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Param('milestoneId', ParseIntPipe) milestoneId: number,
    @Body() dto: UpdateMilestoneDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<OrderMilestoneDto>> {
    return onePage(await this.milestonesService.update(id, milestoneId, dto, user));
  }
}
