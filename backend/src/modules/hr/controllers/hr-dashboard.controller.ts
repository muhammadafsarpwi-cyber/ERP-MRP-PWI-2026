import { Controller, Get, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { HrDashboardService } from '../services/hr-dashboard.service';

@ApiTags('hr')
@Controller('hr')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class HrDashboardController {
  constructor(private readonly hrDashboardService: HrDashboardService) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  @Get('dashboard')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('hr.dashboard.view')
  @ApiQuery({ name: 'date', required: false, description: 'As-of date YYYY-MM-DD (defaults to today)' })
  @ApiQuery({ name: 'days', required: false, description: 'Attendance trend window days (default 30, max 90)' })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiOperation({ summary: 'HR dashboard — head-count KPIs, today attendance, 30-day attendance trend and employees by department' })
  async dashboard(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('days') days?: number,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.hrDashboardService.getDashboardData(companyId, {
      date,
      days,
      divisionId,
      sectionId,
      departmentId,
    });
    return { success: true, data };
  }
}