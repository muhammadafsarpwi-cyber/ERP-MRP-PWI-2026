import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
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
import { ProductionRoutingService } from '../services/production-routing.service';
import {
  CreateRoutingDto,
  UpdateRoutingDto,
  UpdateRoutingStatusDto,
  CreateRoutingOperationDto,
  UpdateRoutingOperationDto,
  ReorderRoutingOperationDto,
  CreateRoutingConnectionDto,
} from '../dto';

@ApiTags('Production Routing')
@Controller('production/routings')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class ProductionRoutingController {
  constructor(private readonly routingService: ProductionRoutingService) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.view')
  @ApiOperation({ summary: 'List all production routings' })
  async findAll(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const routings = await this.routingService.findAll(companyId);
    return { data: routings, total: routings.length };
  }

  @Get('product/:productId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.view')
  @ApiOperation({ summary: 'Get active routing for a product' })
  async findByProduct(@Param('productId', ParseUUIDPipe) productId: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const routing = await this.routingService.findByProduct(productId, companyId);
    return { data: routing };
  }

  @Get('item/:itemId/route')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.view')
  @ApiOperation({ summary: "Get an item's effective production route in sequence order" })
  async getEffectiveRouteForItem(@Param('itemId', ParseUUIDPipe) itemId: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const routing = await this.routingService.getEffectiveRouteForItem(itemId, companyId);
    return { data: routing };
  }

  @Get('flow/:itemId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.view')
  @ApiOperation({ summary: "Get the production flow graph for an item (derived from routing input/output relationships)" })
  async getFlowGraph(@Param('itemId', ParseUUIDPipe) itemId: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const graph = await this.routingService.getRouteFlowGraph(itemId, companyId);
    return { data: graph };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.view')
  @ApiOperation({ summary: 'Get routing by ID with operations' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const routing = await this.routingService.findOne(id, companyId);
    return { data: routing };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.create')
  @ApiOperation({ summary: 'Create a new production routing' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateRoutingDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    dto.companyId = companyId;
    const userId = req.erpUser?.id || req.user?.id;
    const routing = await this.routingService.create(dto, userId);
    return { data: routing, message: 'Routing created successfully' };
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.update')
  @ApiOperation({ summary: 'Update a production routing' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoutingDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const userId = req.erpUser?.id || req.user?.id;
    const routing = await this.routingService.update(id, dto, companyId, userId);
    return { data: routing, message: 'Routing updated successfully' };
  }

  @Put(':id/status')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.change_status')
  @ApiOperation({ summary: 'Change routing status' })
  async changeStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoutingStatusDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const userId = req.erpUser?.id || req.user?.id;
    const routing = await this.routingService.changeStatus(id, dto, companyId, userId);
    return { data: routing, message: `Routing status changed to ${dto.status}` };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a production routing' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const userId = req.erpUser?.id || req.user?.id;
    await this.routingService.remove(id, companyId, userId);
    return { message: 'Routing deleted successfully' };
  }

  @Post(':id/operations')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing_operation.create')
  @ApiOperation({ summary: 'Add an operation to a routing' })
  @HttpCode(HttpStatus.CREATED)
  async addOperation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateRoutingOperationDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const routing = await this.routingService.addOperation(id, dto, companyId, req.user?.id);
    return { data: routing, message: 'Operation added successfully' };
  }

  @Put('operations/:operationId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing_operation.update')
  @ApiOperation({ summary: 'Update a routing operation' })
  async updateOperation(@Param('operationId', ParseUUIDPipe) operationId: string, @Body() dto: UpdateRoutingOperationDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const operation = await this.routingService.updateOperation(operationId, dto, companyId, req.user?.id);
    return { data: operation, message: 'Operation updated successfully' };
  }

  @Delete('operations/:operationId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing_operation.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a routing operation' })
  async removeOperation(@Param('operationId', ParseUUIDPipe) operationId: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    await this.routingService.removeOperation(operationId, companyId, req.user?.id);
    return { message: 'Operation deleted successfully' };
  }

  @Post(':id/operations/:operationId/reorder')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing_operation.reorder')
  @ApiOperation({ summary: 'Reorder a routing operation (operations are renumbered compactly)' })
  @HttpCode(HttpStatus.OK)
  async reorderOperation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @Body() dto: ReorderRoutingOperationDto,
    @Req() req: any,
  ) {
    const companyId = this.getCompanyId(req);
    const routing = await this.routingService.reorderOperation(id, operationId, dto.newSequenceNo, companyId, req.user?.id);
    return { data: routing, message: 'Operation reordered successfully' };
  }

  @Post(':id/operations/:operationId/duplicate')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing_operation.duplicate')
  @ApiOperation({ summary: 'Duplicate a routing operation (including its inputs and outputs)' })
  @HttpCode(HttpStatus.CREATED)
  async duplicateOperation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @Req() req: any,
  ) {
    const companyId = this.getCompanyId(req);
    const routing = await this.routingService.duplicateOperation(id, operationId, companyId, req.user?.id);
    return { data: routing, message: 'Operation duplicated successfully' };
  }

  /* ── Production Routing Graph & Operation Connections (PROMPT #5) ──────── */

  @Get(':id/graph')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.view')
  @ApiOperation({ summary: 'Get full production routing process flow graph' })
  async getRoutingGraph(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const graph = await this.routingService.getRoutingGraph(id, companyId);
    return { data: graph };
  }

  @Get(':id/connections')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.view')
  @ApiOperation({ summary: 'List explicit operation-to-operation graph connections for a routing' })
  async getConnections(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const connections = await this.routingService.getConnections(id, companyId);
    return { data: connections, total: connections.length };
  }

  @Post(':id/connections')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.edit')
  @ApiOperation({ summary: 'Create an explicit operation-to-operation connection (branch, merge, sequential)' })
  @HttpCode(HttpStatus.CREATED)
  async createConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRoutingConnectionDto,
    @Req() req: any,
  ) {
    const companyId = this.getCompanyId(req);
    const conn = await this.routingService.createConnection(id, dto, companyId, req.user?.id);
    return { data: conn, message: 'Routing connection created successfully' };
  }

  @Delete(':id/connections/:connectionId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.routing.edit')
  @ApiOperation({ summary: 'Delete an explicit routing connection' })
  @HttpCode(HttpStatus.OK)
  async deleteConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Req() req: any,
  ) {
    const companyId = this.getCompanyId(req);
    await this.routingService.deleteConnection(id, connectionId, companyId);
    return { message: 'Routing connection deleted successfully' };
  }
}
