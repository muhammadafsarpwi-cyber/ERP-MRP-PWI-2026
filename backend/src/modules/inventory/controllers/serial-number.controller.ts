import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { SerialNumberService } from '../services/serial-number.service';
import { CreateSerialNumberDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('inventory/serial-numbers')
@Controller('inventory/serial-numbers')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class SerialNumberController {
  constructor(private readonly serialNumberService: SerialNumberService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.serial.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a serial number' })
  async create(@Body() dto: CreateSerialNumberDto) {
    const serial = await this.serialNumberService.create(dto);
    return { success: true, data: serial, message: 'Serial number created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.serial.view')
  @ApiOperation({ summary: 'List serial numbers' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('companyId') companyId?: string,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const result = await this.serialNumberService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20,
      companyId, itemId, warehouseId, status, search,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.serial.view')
  @ApiOperation({ summary: 'Get serial number by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const serial = await this.serialNumberService.findOne(id);
    return { success: true, data: serial };
  }

  @Patch(':id/status')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.serial.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update serial number status' })
  @ApiParam({ name: 'id' })
  async updateStatus(@Param('id') id: string, @Body('status') status: string) {
    const serial = await this.serialNumberService.updateStatus(id, status);
    return { success: true, data: serial, message: 'Serial number status updated' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.serial.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate serial number' })
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const serial = await this.serialNumberService.deactivate(id);
    return { success: true, data: serial, message: 'Serial number deactivated' };
  }
}
