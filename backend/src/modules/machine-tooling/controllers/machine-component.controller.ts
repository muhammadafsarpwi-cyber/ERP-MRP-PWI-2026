import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
import { MachineComponentService } from '../services';
import {
  CreateMachineComponentDto,
  UpdateMachineComponentDto,
  MachineComponentQueryDto,
  ChangeComponentStatusDto,
} from '../dto';

@ApiTags('Machine Tool & Component Master')
@Controller('machine-tooling/components')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class MachineComponentController {
  constructor(private readonly service: MachineComponentService) {}

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

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.tool_component.view')
  @ApiOperation({ summary: 'List tools / components per machine with filters, sorting, pagination' })
  async findAll(@Query() query: MachineComponentQueryDto, @Req() req: any) {
    return this.service.findAll(this.getCompanyId(req), query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.tool_component.view')
  @ApiOperation({ summary: 'Get a tool / component' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    return this.service.findOne(id, this.getCompanyId(req));
  }

  @Get(':id/history')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.view')
  @ApiOperation({ summary: 'Replacement history + life stats for a tool / component' })
  async history(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('counter') counter: string | undefined,
    @Req() req: any,
  ) {
    const companyId = this.getCompanyId(req);
    const component = await this.service.findOne(id, companyId);
    let counterValue: number | null = null;
    if (counter === 'derive' || counter === 'true') {
      counterValue = await this.service.deriveMachineCounter(companyId, component.machineId);
    }
    return this.service.getHistory(companyId, id, counterValue);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.tool_component.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a tool / component for a machine' })
  async create(@Body() dto: CreateMachineComponentDto, @Req() req: any) {
    return this.service.create(dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.tool_component.update')
  @ApiOperation({ summary: 'Update a tool / component' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMachineComponentDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Patch(':id/status')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.tool_component.update')
  @ApiOperation({ summary: 'Activate / deactivate a tool / component' })
  async changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeComponentStatusDto,
    @Req() req: any,
  ) {
    return this.service.changeStatus(id, dto.status, this.getCompanyId(req), this.getUserId(req));
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.tool_component.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a tool / component (blocked for components with changes)' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    await this.service.remove(id, this.getCompanyId(req), this.getUserId(req));
  }
}