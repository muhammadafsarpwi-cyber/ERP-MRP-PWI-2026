import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards';
import { RequirePermission } from '../../auth/guards';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { MaintenancePmService } from '../services';
import { CreatePmPlanDto, UpdatePmPlanDto } from '../dto';

@ApiTags('Maintenance - Preventive Maintenance')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard)
@Controller('maintenance/pm')
export class MaintenancePmController {
  constructor(private readonly pmService: MaintenancePmService) {}

  @Post('plans')
  @RequirePermission('maintenance.pm_plan.create')
  @ApiOperation({ summary: 'Create PM plan' })
  createPlan(@Body() dto: CreatePmPlanDto, @CurrentUser() user: any) {
    return this.pmService.createPlan(dto, user.id);
  }

  @Get('plans')
  @RequirePermission('maintenance.pm_plan.view')
  @ApiOperation({ summary: 'List PM plans' })
  findAllPlans(@Query('companyId') companyId?: string) {
    return this.pmService.findAllPlans(companyId);
  }

  @Get('plans/:id')
  @RequirePermission('maintenance.pm_plan.view')
  @ApiOperation({ summary: 'Get PM plan by ID' })
  findOnePlan(@Param('id') id: string) {
    return this.pmService.findOnePlan(id);
  }

  @Put('plans/:id')
  @RequirePermission('maintenance.pm_plan.edit')
  @ApiOperation({ summary: 'Update PM plan' })
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePmPlanDto, @CurrentUser() user: any) {
    return this.pmService.updatePlan(id, dto, user.id);
  }

  @Delete('plans/:id')
  @RequirePermission('maintenance.pm_plan.delete')
  @ApiOperation({ summary: 'Delete PM plan' })
  removePlan(@Param('id') id: string) {
    return this.pmService.removePlan(id);
  }

  @Get('schedules')
  @RequirePermission('maintenance.pm_plan.view')
  @ApiOperation({ summary: 'List PM schedules' })
  findSchedules(@Query('companyId') companyId?: string) {
    return this.pmService.findSchedules(companyId);
  }
}
