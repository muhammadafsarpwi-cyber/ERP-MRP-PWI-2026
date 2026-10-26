import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { ShopfloorTouchscreenService, SubmitShiftReportDto } from '../services/shopfloor-touchscreen.service';

@ApiTags('production/touchscreen')
@Controller('production/touchscreen')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class ShopfloorTouchscreenController {
  constructor(private readonly touchscreenService: ShopfloorTouchscreenService) {}

  private getCompanyId(req: any): string | undefined {
    return req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
  }

  private getUserId(req: any): string | undefined {
    return req.erpUser?.id;
  }

  @Get('init-telemetry')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Step 1: Rapid-select operator, machine and shift telemetry (zero typing)' })
  async getTelemetry(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.touchscreenService.getTelemetry(companyId);
    return { success: true, data };
  }

  @Get('departments')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Step 1: Get 5 visual manufacturing department segments for touch terminal' })
  async getDepartments(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.touchscreenService.getDepartments(companyId);
    return { success: true, data };
  }

  @Get('contracts')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.view')
  @ApiQuery({ name: 'segmentKey', required: true, description: 'Manufacturing segment key' })
  @ApiOperation({ summary: 'Step 2: Get active Sales Order Contracts assigned to selected segment via production routings' })
  async getActiveContracts(@Query('segmentKey') segmentKey: string, @Req() req: any) {
    if (!segmentKey) throw new BadRequestException('segmentKey parameter is required');
    const companyId = this.getCompanyId(req);
    const data = await this.touchscreenService.getActiveContracts(segmentKey, companyId);
    return { success: true, data };
  }

  @Post('submit-entry')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Step 3: Submit 3-field daily report from touchscreen terminal' })
  async submitDailyProgress(@Body() dto: SubmitShiftReportDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    const result = await this.touchscreenService.submitDailyProgress(dto, companyId, userId);
    return result;
  }
}
