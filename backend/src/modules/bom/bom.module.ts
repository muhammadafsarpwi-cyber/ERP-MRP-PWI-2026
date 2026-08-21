import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillOfMaterials } from './entities/bill-of-materials.entity';
import { BomLine } from './entities/bom-line.entity';
import { BomService } from './services/bom.service';
import { BomController } from './controllers/bom.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { Item } from '../item/entities/item.entity';
import { Uom } from '../item/entities/uom.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BillOfMaterials, BomLine, Item, Uom]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [BomController],
  providers: [BomService],
  exports: [BomService],
})
export class BomModule {}
