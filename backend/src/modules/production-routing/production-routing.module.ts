import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionRouting } from './entities/production-routing.entity';
import { RoutingOperation } from './entities/routing-operation.entity';
import { ProductionRoutingService } from './services/production-routing.service';
import { ProductionRoutingController } from './controllers/production-routing.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { Item } from '../item/entities/item.entity';
import { Uom } from '../item/entities/uom.entity';
import { BillOfMaterials } from '../bom/entities/bill-of-materials.entity';
import { Division } from '../organization/entities/division.entity';
import { Section } from '../organization/entities/section.entity';
import { Department } from '../organization/entities/department.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionRouting,
      RoutingOperation,
      Item,
      Uom,
      BillOfMaterials,
      Division,
      Section,
      Department,
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
