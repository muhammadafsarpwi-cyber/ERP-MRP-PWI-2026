import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OpeningStockService } from '../services/opening-stock.service';
import { PostOpeningStockDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('inventory/opening-stock')
@Controller('inventory/opening-stock')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class OpeningStockController {
  constructor(private readonly openingStockService: OpeningStockService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.opening_stock.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Post opening stock balances' })
  async postOpeningStock(@Req() req: any, @Body() dto: PostOpeningStockDto) {
    if (!dto.companyId) {
      dto.companyId = req.user?.defaultCompanyId || req.user?.companyId || '7725aa04-a270-4314-9e82-90949cbe7791';
    }
    const result = await this.openingStockService.postOpeningStock(dto, req.user?.id);
    return { success: true, data: result, message: `Opening stock posted: ${result.posted} lines` };
  }
}
