import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { BranchService } from '../services';
import { CreateBranchDto, UpdateBranchDto } from '../dto';
import { BranchStatus } from '../entities';

@ApiTags('organization/branches')
@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new branch' })
  @ApiResponse({ status: 201, description: 'Branch created successfully' })
  @ApiResponse({ status: 409, description: 'Branch code already exists' })
  async create(@Body() createBranchDto: CreateBranchDto) {
    const branch = await this.branchService.create(createBranchDto);
    return { success: true, data: branch, message: 'Branch created successfully' };
  }

  @Get()
  @ApiOperation({ summary: 'Get all branches' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: BranchStatus })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: BranchStatus,
    @Query('companyId') companyId?: string,
  ) {
    const result = await this.branchService.findAll({ page: Number(page) || 1, limit: Number(limit) || 20, search, status, companyId });
    return { success: true, ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a branch by ID' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  @ApiResponse({ status: 200, description: 'Branch found' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async findOne(@Param('id') id: string) {
    const branch = await this.branchService.findOne(id);
    return { success: true, data: branch };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a branch' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  @ApiResponse({ status: 200, description: 'Branch updated successfully' })
  async update(@Param('id') id: string, @Body() updateBranchDto: UpdateBranchDto) {
    const branch = await this.branchService.update(id, updateBranchDto);
    return { success: true, data: branch, message: 'Branch updated successfully' };
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a branch' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  @ApiResponse({ status: 200, description: 'Branch activated successfully' })
  async activate(@Param('id') id: string) {
    const branch = await this.branchService.activate(id);
    return { success: true, data: branch, message: 'Branch activated successfully' };
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a branch' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  @ApiResponse({ status: 200, description: 'Branch deactivated successfully' })
  async deactivate(@Param('id') id: string) {
    const branch = await this.branchService.deactivate(id);
    return { success: true, data: branch, message: 'Branch deactivated successfully' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a branch' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  @ApiResponse({ status: 204, description: 'Branch deleted successfully' })
  async remove(@Param('id') id: string) {
    await this.branchService.remove(id);
  }
}
