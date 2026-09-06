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
import { OperationService } from '../services';
import {
  CreateOperationDto,
  UpdateOperationDto,
  ChangeOperationStatusDto,
  OperationQueryDto,
} from '../dto';
import { OperationStatus } from '../entities';

@ApiTags('Operations')
@Controller('master-data/operations')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class OperationController {
  constructor(private readonly operationService: OperationService) {}

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
  @RequirePermission('manufacturing.operation.view')
  @ApiOperation({ summary: 'List operations with filters, sorting and pagination' })
  async findAll(@Query() query: OperationQueryDto, @Req() req: any) {
    return this.operationService.findAll(this.getCompanyId(req), query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.operation.view')
  @ApiOperation({ summary: 'Get operation details' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    return this.operationService.findOne(id, this.getCompanyId(req));
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.operation.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an operation' })
  async create(@Body() dto: CreateOperationDto, @Req() req: any) {
    return this.operationService.create(dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.operation.update')
  @ApiOperation({ summary: 'Update an operation (partial)' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOperationDto,
    @Req() req: any,
  ) {
    return this.operationService.update(id, dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.operation.update')
  @ApiOperation({ summary: 'Update an operation (full replace of editable fields)' })
  async replace(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOperationDto,
    @Req() req: any,
  ) {
    return this.operationService.update(id, dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Patch(':id/status')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.operation.change_status')
  @ApiOperation({ summary: 'Activate / deactivate an operation' })
  async changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeOperationStatusDto,
    @Req() req: any,
  ) {
    return this.operationService.changeStatus(id, dto.status, this.getCompanyId(req), this.getUserId(req));
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.operation.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an operation' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    await this.operationService.remove(id, this.getCompanyId(req), this.getUserId(req));
  }
}