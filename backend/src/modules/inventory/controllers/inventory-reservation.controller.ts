import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryReservationService } from '../services/inventory-reservation.service';
import { CreateInventoryReservationDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('inventory/reservations')
@Controller('inventory/reservations')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class InventoryReservationController {
  constructor(private readonly inventoryReservationService: InventoryReservationService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.reservation.create')
  @ApiOperation({ summary: 'Create an inventory reservation' })
  async create(@Body() dto: CreateInventoryReservationDto) {
    const reservation = await this.inventoryReservationService.create(dto);
    return { success: true, data: reservation, message: 'Inventory reservation created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.reservation.view')
  @ApiOperation({ summary: 'List inventory reservations' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'reservationType', required: false })
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('companyId') companyId?: string,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
    @Query('reservationType') reservationType?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.inventoryReservationService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, companyId, itemId, warehouseId,
      status, reservationType, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.reservation.view')
  @ApiOperation({ summary: 'Get inventory reservation by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const reservation = await this.inventoryReservationService.findOne(id);
    return { success: true, data: reservation };
  }

  @Patch(':id/release')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.reservation.release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release inventory reservation' })
  @ApiParam({ name: 'id' })
  async release(@Param('id') id: string) {
    const reservation = await this.inventoryReservationService.release(id);
    return { success: true, data: reservation, message: 'Inventory reservation released' };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.reservation.release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel inventory reservation' })
  @ApiParam({ name: 'id' })
  async cancel(@Param('id') id: string) {
    const reservation = await this.inventoryReservationService.cancel(id);
    return { success: true, data: reservation, message: 'Inventory reservation cancelled' };
  }
}
