import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DispatchPackageService } from '../services/dispatch-package.service';
import {
  CreateDispatchPackageDto,
  ScanAddUnitDto,
  RemoveUnitDto,
  FinalizePackageDto,
  LinkGatePassDto,
  GateExitDto,
  CancelPackageDto,
  QueryDispatchPackageDto,
} from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';

@ApiTags('dispatch/packages')
@Controller('dispatch/packages')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class DispatchPackageController {
  constructor(private readonly service: DispatchPackageService) {}

  @Post()
  @RequireOrgScope()
  @ApiOperation({ summary: 'Create a new open dispatch package' })
  async createPackage(@Req() req: any, @Body() dto: CreateDispatchPackageDto) {
    const companyId = req.erpUser?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const userId = req.user?.id;
    const userName = req.erpUser?.displayName || req.user?.email || 'Operator';
    const pkg = await this.service.createPackage(dto, companyId, userId, userName);
    return { success: true, data: pkg, message: `Created Package ${pkg.packageNo}` };
  }

  @Get()
  @RequireOrgScope()
  @ApiOperation({ summary: 'List dispatch packages' })
  async findAll(@Req() req: any, @Query() query: QueryDispatchPackageDto) {
    const companyId = req.erpUser?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const result = await this.service.findAll(query, companyId);
    return { success: true, ...result };
  }

  @Get('trace')
  @RequireOrgScope()
  @ApiOperation({ summary: 'Cross-entity traceability lookup' })
  async traceLookup(@Req() req: any, @Query('q') q: string) {
    const companyId = req.erpUser?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const result = await this.service.traceLookup(q, companyId);
    return { success: true, ...result };
  }

  @Get('gate-verify')
  @RequireOrgScope()
  @ApiOperation({ summary: 'Scan package QR code at factory gate for instant verification' })
  async gateVerify(@Req() req: any, @Query('qr') qr: string) {
    const companyId = req.erpUser?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const result = await this.service.gateVerify(qr, companyId);
    return { success: true, data: result };
  }

  @Get(':id')
  @RequireOrgScope()
  @ApiOperation({ summary: 'Get dispatch package details with packed units and audit trail' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const companyId = req.erpUser?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const pkg = await this.service.findOne(id, companyId);
    return { success: true, data: pkg };
  }

  @Post(':id/scan-unit')
  @HttpCode(HttpStatus.OK)
  @RequireOrgScope()
  @ApiOperation({ summary: 'Rapid mobile scan: Add a production unit to an open package' })
  async scanAndAddUnit(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ScanAddUnitDto,
  ) {
    const companyId = req.erpUser?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const userId = req.user?.id;
    const userName = req.erpUser?.displayName || req.user?.email || 'Operator';
    const result = await this.service.scanAndAddUnit(id, dto, companyId, userId, userName);
    return {
      success: true,
      data: result,
      message: `Added Coil ${result.addedUnit.coilNo} (${result.addedUnit.unitSerialNo})`,
    };
  }

  @Delete(':id/units/:unitId')
  @RequireOrgScope()
  @ApiOperation({ summary: 'Remove a production unit from an open package before finalization' })
  async removeUnit(
    @Req() req: any,
    @Param('id') id: string,
    @Param('unitId') unitId: string,
    @Body() dto?: RemoveUnitDto,
  ) {
    const companyId = req.erpUser?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const userId = req.user?.id;
    const userName = req.erpUser?.displayName || req.user?.email || 'Operator';
    const pkg = await this.service.removeUnit(id, unitId, dto, companyId, userId, userName);
    return { success: true, data: pkg, message: 'Unit removed from package' };
  }

  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  @RequireOrgScope()
  @ApiOperation({ summary: 'Finalize and lock dispatch package' })
  async finalizePackage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto?: FinalizePackageDto,
  ) {
    const companyId = req.erpUser?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const userId = req.user?.id;
    const userName = req.erpUser?.displayName || req.user?.email || 'Operator';
    const pkg = await this.service.finalizePackage(id, dto, companyId, userId, userName);
    return {
      success: true,
      data: pkg,
      message: `Package ${pkg.packageNo} finalized successfully with ${pkg.totalUnits} units`,
    };
  }

  @Post(':id/link-gate-pass')
  @HttpCode(HttpStatus.OK)
  @RequireOrgScope()
  @ApiOperation({ summary: 'Link finalized package to an Outward Gate Pass / Sales Delivery' })
  async linkGatePass(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: LinkGatePassDto,
  ) {
    const companyId = req.erpUser?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const userId = req.user?.id;
    const userName = req.erpUser?.displayName || req.user?.email || 'Operator';
    const pkg = await this.service.linkGatePass(id, dto, companyId, userId, userName);
    return {
      success: true,
      data: pkg,
      message: `Linked Gate Pass ${pkg.gatePassNo} to Package ${pkg.packageNo}`,
    };
  }

  @Post(':id/print')
  @HttpCode(HttpStatus.OK)
  @RequireOrgScope()
  @ApiOperation({ summary: 'Record package document/label print in audit trail' })
  async recordPrint(@Req() req: any, @Param('id') id: string) {
    const companyId = req.erpUser?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const userId = req.user?.id;
    const userName = req.erpUser?.displayName || req.user?.email || 'Operator';
    const pkg = await this.service.recordPackagePrint(id, companyId, userId, userName);
    return { success: true, data: pkg };
  }

  @Post(':id/gate-exit')
  @HttpCode(HttpStatus.OK)
  @RequireOrgScope()
  @ApiOperation({ summary: 'Authorize factory exit at gate' })
  async gateExit(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto?: GateExitDto,
  ) {
    const companyId = req.erpUser?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const userId = req.user?.id;
    const userName = req.erpUser?.displayName || req.user?.email || 'Gate Officer';
    const pkg = await this.service.gateExit(id, dto, companyId, userId, userName);
    return {
      success: true,
      data: pkg,
      message: `Factory exit confirmed for Package ${pkg.packageNo} on Gate Pass ${pkg.gatePassNo || 'N/A'}`,
    };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireOrgScope()
  @ApiOperation({ summary: 'Cancel an open or finalized package' })
  async cancelPackage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CancelPackageDto,
  ) {
    const companyId = req.erpUser?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const userId = req.user?.id;
    const userName = req.erpUser?.displayName || req.user?.email || 'Operator';
    const pkg = await this.service.cancelPackage(id, dto, companyId, userId, userName);
    return { success: true, data: pkg, message: `Package ${pkg.packageNo} cancelled` };
  }
}
