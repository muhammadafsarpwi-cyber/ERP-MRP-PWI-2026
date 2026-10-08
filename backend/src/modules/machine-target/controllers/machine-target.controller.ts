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
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard, divisionFilterFromRequest } from '../../auth/guards/division-scope.guard';
import { MachineTargetService } from '../services';
import {
  CreateMachineTargetDto,
  UpdateMachineTargetDto,
  ChangeMachineTargetStatusDto,
  MachineTargetQueryDto,
  ResolveMachineTargetQueryDto,
} from '../dto';

@ApiTags('Machine Targets')
@Controller('production/machine-targets')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class MachineTargetController {
  constructor(private readonly service: MachineTargetService) {}

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

  /** Division list a service may filter with; `undefined` = unrestricted. */
  private divisions(req: any): string[] | undefined {
    return divisionFilterFromRequest(req.allowedDivisionIds);
  }

  @Post('import')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine_target.create')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Bulk upsert machine targets from CSV — [Machine Code + Shift Code + Item Code] is the composite anchor; blank/excluded columns are retained',
  })
  async importCsv(
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!/\.csv$/i.test(file.originalname)) {
      throw new BadRequestException('Only CSV files are supported');
    }
    return this.service.importCsv(this.getCompanyId(req), this.getUserId(req), file.buffer, this.divisions(req));
  }

  @Get('resolve')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine_target.view')
  @ApiOperation({ summary: 'Resolve the applicable target for machine + shift + production date' })
  async resolve(@Query() query: ResolveMachineTargetQueryDto, @Req() req: any) {
    return this.service.resolve(query, this.getCompanyId(req), this.divisions(req));
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine_target.view')
  @ApiOperation({ summary: 'List machine targets with filters, sorting and pagination' })
  async findAll(@Query() query: MachineTargetQueryDto, @Req() req: any) {
    return this.service.findAll(this.getCompanyId(req), {
      ...query,
      allowedDivisionIds: this.divisions(req),
    });
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine_target.view')
  @ApiOperation({ summary: 'Get a machine target' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    return this.service.findOne(id, this.getCompanyId(req), this.divisions(req));
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine_target.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a machine target' })
  async create(@Body() dto: CreateMachineTargetDto, @Req() req: any) {
    return this.service.create(dto, this.getCompanyId(req), this.getUserId(req), this.divisions(req));
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine_target.update')
  @ApiOperation({ summary: 'Update a machine target' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMachineTargetDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, this.getCompanyId(req), this.getUserId(req), this.divisions(req));
  }

  @Patch(':id/status')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine_target.change_status')
  @ApiOperation({ summary: 'Activate / deactivate a machine target' })
  async changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeMachineTargetStatusDto,
    @Req() req: any,
  ) {
    return this.service.changeStatus(id, dto.status, this.getCompanyId(req), this.getUserId(req), this.divisions(req));
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.machine_target.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a machine target' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    await this.service.remove(id, this.getCompanyId(req), this.getUserId(req), this.divisions(req));
  }
}
