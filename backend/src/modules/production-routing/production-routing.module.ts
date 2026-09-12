import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionRouting } from './entities/production-routing.entity';
import { RoutingOperation } from './entities/routing-operation.entity';
import { RoutingOperationInput } from './entities/routing-operation-input.entity';
import { RoutingOperationOutput } from './entities/routing-operation-output.entity';
import { ProductionRoutingService } from './services/production-routing.service';
import { ProductionRoutingController } from './controllers/production-routing.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { Item } from '../item/entities/item.entity';
import { ItemRouteType } from '../item/entities/route-type.entity';
import { Uom } from '../item/entities/uom.entity';
import { BillOfMaterials } from '../bom/entities/bill-of-materials.entity';
import { Division } from '../organization/entities/division.entity';
import { Section } from '../organization/entities/section.entity';
import { Department } from '../organization/entities/department.entity';
import { Warehouse } from '../organization/entities/warehouse.entity';
import { Machine } from '../production/entities/machine.entity';
import { Operation } from '../operation/entities/operation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionRouting,
      RoutingOperation,
      RoutingOperationInput,
      RoutingOperationOutput,
      Item,
      ItemRouteType,
      Uom,
      BillOfMaterials,
      Division,
      Section,
      Department,
      Warehouse,
      Machine,
      Operation,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [ProductionRoutingController],
  providers: [ProductionRoutingService],
  exports: [ProductionRoutingService],
})
export class ProductionRoutingModule {}
