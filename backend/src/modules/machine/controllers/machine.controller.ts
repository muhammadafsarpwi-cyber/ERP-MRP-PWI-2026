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
import { MachineService } from '../services';
import {
  CreateMachineDto,
  UpdateMachineDto,
  ChangeMachineStatusDto,
  MachineQueryDto,
} from '../dto';

@ApiTags('Machines')
// Compatibility: the Machine Master is served under BOTH /machines and
// /production/machines (global prefix api/v1 applies to both). One table,
// one service – no data duplication.
@Controller(['machines', 'production/machines'])
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class MachineController {
  constructor(private readonly machineService: MachineService) {}

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
  @RequirePermission('manufacturing.machine.view')
  @ApiOperation({ summary: 'List machines with filters, sorting and pagination' })
  async findAll(@Query() query: MachineQueryDto, @Req() req: any) {
    return this.machineService.findAll(this.getCompanyId(req), query);
  }

  @Get('by-code/:code')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine.view')
  @ApiOperation({ summary: 'Resolve a QR payload / machine id / machine code to its record' })
  async resolveByCode(@Param('code') code: string, @Req() req: any) {
    return this.machineService.resolveByCode(code, this.getCompanyId(req));
  }

  @Get('qr/:machineId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine.view')
  @ApiOperation({ summary: 'Look up a machine by its QR identity / system-generated Machine ID (e.g. MCH001)' })
  async findByMachineId(@Param('machineId') machineId: string, @Req() req: any) {
    return this.machineService.resolveByCode(machineId, this.getCompanyId(req));
  }

  @Get(':id/qr')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine.view')
  @ApiOperation({ summary: 'Get QR code (PNG data URL) for a machine' })
  async getQr(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    return this.machineService.getQr(id, this.getCompanyId(req));
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine.view')
  @ApiOperation({ summary: 'Get machine details' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    return this.machineService.findOne(id, this.getCompanyId(req));
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a machine' })
  async create(@Body() dto: CreateMachineDto, @Req() req: any) {
    return this.machineService.create(dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine.update')
  @ApiOperation({ summary: 'Update a machine (partial)' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMachineDto,
    @Req() req: any,
  ) {
    return this.machineService.update(id, dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine.update')
  @ApiOperation({ summary: 'Update a machine (full replace of editable fields)' })
  async replace(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMachineDto,
    @Req() req: any,
  ) {
    return this.machineService.update(id, dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Patch(':id/status')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine.change_status')
  @ApiOperation({ summary: 'Activate / deactivate / set maintenance' })
  async changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeMachineStatusDto,
    @Req() req: any,
  ) {
    return this.machineService.changeStatus(id, dto.status, this.getCompanyId(req), this.getUserId(req));
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a machine' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    await this.machineService.remove(id, this.getCompanyId(req), this.getUserId(req));
  }
}
