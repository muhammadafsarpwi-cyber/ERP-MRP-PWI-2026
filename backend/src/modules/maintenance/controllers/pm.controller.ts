import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards';
import { PermissionGuard, RequirePermission } from '../../auth/guards';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { MaintenancePmService } from '../services';
import { CreatePmPlanDto, UpdatePmPlanDto, GenerateScheduleDto } from '../dto';

@ApiTags('Maintenance - Preventive Maintenance')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, PermissionGuard)
@Controller('master-data/maintenance/pm')
export class MaintenancePmController {
  constructor(private readonly pmService: MaintenancePmService) {}

  @Post('plans')
  @RequirePermission('maintenance.pm.manage')
  @ApiOperation({ summary: 'Create PM plan' })
  createPlan(@Body() dto: CreatePmPlanDto, @CurrentUser() user: any) {
    return this.pmService.createPlan(dto, user.id);
  }

  @Get('plans')
  @RequirePermission('maintenance.pm.view')
  @ApiOperation({ summary: 'List PM plans' })
  findAllPlans(@Query('companyId') companyId?: string) {
    return this.pmService.findAllPlans(companyId);
  }

  @Get('plans/:id')
  @RequirePermission('maintenance.pm.view')
  @ApiOperation({ summary: 'Get PM plan by ID' })
  findOnePlan(@Param('id') id: string) {
    return this.pmService.findOnePlan(id);
  }

  @Put('plans/:id')
  @RequirePermission('maintenance.pm.manage')
  @ApiOperation({ summary: 'Update PM plan' })
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePmPlanDto, @CurrentUser() user: any) {
    return this.pmService.updatePlan(id, dto, user.id);
  }

  @Delete('plans/:id')
  @RequirePermission('maintenance.pm.manage')
  @ApiOperation({ summary: 'Deactivate PM plan' })
  removePlan(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pmService.removePlan(id, user.id);
  }

  @Post('plans/:id/generate-schedules')
  @RequirePermission('maintenance.pm.manage')
  @ApiOperation({ summary: 'Generate PM schedules for a plan' })
  generateSchedules(@Param('id') id: string, @Body() dto: GenerateScheduleDto, @CurrentUser() user: any) {
    return this.pmService.generateSchedules(id, dto, user.id);
  }

  @Get('schedules')
  @RequirePermission('maintenance.pm.view')
  @ApiOperation({ summary: 'List PM schedules' })
  findSchedules(@Query('companyId') companyId?: string) {
    return this.pmService.findSchedules(companyId);
  }

  @Post('schedules/:id/complete')
  @RequirePermission('maintenance.pm.manage')
  @ApiOperation({ summary: 'Mark PM schedule as completed' })
  completeSchedule(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pmService.completeSchedule(id, user.id);
  }

  @Post('schedules/:id/skip')
  @RequirePermission('maintenance.pm.manage')
  @ApiOperation({ summary: 'Skip PM schedule' })
  skipSchedule(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pmService.skipSchedule(id, user.id);
  }
}
