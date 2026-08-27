import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards';
import { PermissionGuard, RequirePermission } from '../../auth/guards';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { MaintenanceTeamService } from '../services';
import { CreateTeamDto, UpdateTeamDto } from '../dto';

@ApiTags('Maintenance - Teams')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, PermissionGuard)
@Controller('master-data/maintenance/teams')
export class MaintenanceTeamController {
  constructor(private readonly teamService: MaintenanceTeamService) {}

  @Post()
  @RequirePermission('maintenance.team.manage')
  @ApiOperation({ summary: 'Create maintenance team' })
  create(@Body() dto: CreateTeamDto, @CurrentUser() user: any) {
    return this.teamService.create(dto, user.id);
  }

  @Get()
  @RequirePermission('maintenance.team.view')
  @ApiOperation({ summary: 'List maintenance teams' })
  findAll(@Query('companyId') companyId?: string) {
    return this.teamService.findAll(companyId);
  }

  @Get(':id')
  @RequirePermission('maintenance.team.view')
  @ApiOperation({ summary: 'Get team by ID' })
  findOne(@Param('id') id: string) {
    return this.teamService.findOne(id);
  }

  @Put(':id')
  @RequirePermission('maintenance.team.manage')
  @ApiOperation({ summary: 'Update team' })
  update(@Param('id') id: string, @Body() dto: UpdateTeamDto, @CurrentUser() user: any) {
    return this.teamService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('maintenance.team.manage')
  @ApiOperation({ summary: 'Deactivate team' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.teamService.remove(id, user.id);
  }
}
