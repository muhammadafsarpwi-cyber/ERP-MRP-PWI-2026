import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { ComponentChangeService } from '../services';
import {
  CreateComponentChangeDto,
  UpdateComponentChangeDto,
  ComponentChangeQueryDto,
  ComponentCounterQueryDto,
  MonthlyConsumptionQueryDto,
} from '../dto';

@ApiTags('Component Change Transactions')
@Controller('machine-tooling/changes')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class ComponentChangeController {
  constructor(private readonly service: ComponentChangeService) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  private getUserId(req: any): string | undefined {
    return req.erpUser?.id;
  }

  @Get('counter')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.view')
  @ApiOperation({ summary: 'Derived current production counter for a machine (production-entries sum)' })
  async counter(@Query() query: ComponentCounterQueryDto, @Req() req: any) {
    return this.service.currentCounter(this.getCompanyId(req), query.machineId);
  }

  @Get('reports/monthly')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.tool_consumption.report')
  @ApiOperation({ summary: 'Monthly tool / component consumption report' })
  async monthlyReport(@Query() query: MonthlyConsumptionQueryDto, @Req() req: any) {
    return this.service.monthlyReport(this.getCompanyId(req), query.month, query.machineId);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.view')
  @ApiOperation({ summary: 'List component change transactions with filters, sorting, pagination' })
  async findAll(@Query() query: ComponentChangeQueryDto, @Req() req: any) {
    return this.service.findAll(this.getCompanyId(req), query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.view')
  @ApiOperation({ summary: 'Get a component change transaction' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    return this.service.findOne(id, this.getCompanyId(req));
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a component change (computes production since previous)' })
  async create(@Body() dto: CreateComponentChangeDto, @Req() req: any) {
    return this.service.create(dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.update')
  @ApiOperation({ summary: 'Update a component change transaction' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateComponentChangeDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a component change transaction' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    await this.service.remove(id, this.getCompanyId(req), this.getUserId(req));
  }
}