import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';
import {
  ProductionReworkReturnService,
  CreateReworkReturnDto,
  UpdateReworkReturnStatusDto,
  ReworkReturnFilterQuery,
} from '../services';

@ApiTags('production/rework-returns')
@Controller('production/rework-returns')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class ProductionReworkReturnController {
  constructor(private readonly service: ProductionReworkReturnService) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    return companyId || '7725aa04-a270-4314-9e82-90949cbe7791';
  }

  private getUserId(req: any): string | undefined {
    return req.erpUser?.id;
  }

  @Post()
  @ApiOperation({ summary: 'Create an inter-department production rework return' })
  async create(@Body() dto: CreateReworkReturnDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    const result = await this.service.create(dto, companyId, userId);
    return {
      success: true,
      data: result,
      message: `Production return ${result.returnNumber} created successfully`,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List production rework returns with filters' })
  async findAll(@Query() query: ReworkReturnFilterQuery, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    return this.service.findAll(query, companyId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get KPI statistics and defect breakdown for rework returns' })
  async getSummary(@Query('divisionId') divisionId: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    return this.service.getSummary(companyId, divisionId);
  }

  @Get('stage-items')
  @ApiOperation({ summary: 'Get stage components and WIP items for returns routing' })
  async getStageItems(
    @Query('divisionId') divisionId?: string,
    @Query('fromDepartmentId') fromDepartmentId?: string,
    @Query('toDepartmentId') toDepartmentId?: string,
  ) {
    const data = await this.service.getStageItems({ divisionId, fromDepartmentId, toDepartmentId });
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get rework return detail by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const result = await this.service.findOne(id, companyId);
    return { success: true, data: result };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update rework return status (e.g. Acknowledge, In Rework, Rectified, Closed)' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReworkReturnStatusDto,
    @Req() req: any,
  ) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    const result = await this.service.updateStatus(id, companyId, dto, userId);
    return {
      success: true,
      data: result,
      message: `Return ${result.returnNumber} status updated to ${result.status}`,
    };
  }
}

