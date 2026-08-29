import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards';
import { PermissionGuard, RequirePermission } from '../../auth/guards';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { MaintenanceTechnicianService } from '../services';
import { CreateTechnicianDto, UpdateTechnicianDto } from '../dto';

@ApiTags('Maintenance - Technicians')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, PermissionGuard)
@Controller('master-data/maintenance/technicians')
export class MaintenanceTechnicianController {
  constructor(private readonly technicianService: MaintenanceTechnicianService) {}

  @Get()
  @RequirePermission('maintenance.technician.view')
  @ApiOperation({ summary: 'List technicians (master records)' })
  findAll(
    @Query('department') department?: string,
    @Query('skill') skill?: string,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
    @Query('search') search?: string,
    @Query('active') active?: string,
  ) {
    return this.technicianService.findAll({ department, skill, status, employeeId, search, active });
  }

  @Get(':id')
  @RequirePermission('maintenance.technician.view')
  @ApiOperation({ summary: 'Get technician by ID' })
  findOne(@Param('id') id: string) {
    return this.technicianService.findOne(id);
  }

  @Post()
  @RequirePermission('maintenance.technician.manage')
  @ApiOperation({ summary: 'Create technician master record' })
  create(@Body() dto: CreateTechnicianDto, @CurrentUser() user: any) {
    return this.technicianService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('maintenance.technician.manage')
  @ApiOperation({ summary: 'Update technician master record' })
  update(@Param('id') id: string, @Body() dto: UpdateTechnicianDto, @CurrentUser() user: any) {
    return this.technicianService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('maintenance.technician.manage')
  @ApiOperation({ summary: 'Deactivate technician master record' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.technicianService.remove(id, user.id);
  }
}
