import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Uom, UomConversion, ItemCategory, Item, ItemBarcode,
  ItemAttributeDefinition, ItemAttributeValue, ItemSpecification, ItemDocument, ItemRouteType,
} from './entities';
import { Division, Section, Department } from '../organization/entities';
import { UomService } from './services/uom.service';
import { UomConversionService } from './services/uom-conversion.service';
import { ItemCategoryService } from './services/item-category.service';
import { ItemService } from './services/item.service';
import { ItemRouteTypeService } from './services/item-route-type.service';
import { ItemConversionService } from './services/item-conversion.service';
import { ItemBarcodeService } from './services/item-barcode.service';
import { ItemAttributeService } from './services/item-attribute.service';
import { ItemSpecificationService } from './services/item-specification.service';
import { ItemDocumentService } from './services/item-document.service';
import { UomController } from './controllers/uom.controller';
import { UomConversionController } from './controllers/uom-conversion.controller';
import { ItemCategoryController } from './controllers/item-category.controller';
import { ItemRouteTypeController } from './controllers/item-route-type.controller';
import { ItemController } from './controllers/item.controller';
import { ItemBarcodeController } from './controllers/item-barcode.controller';
import { ItemAttributeController } from './controllers/item-attribute.controller';
import { ItemSpecificationController } from './controllers/item-specification.controller';
import { ItemDocumentController } from './controllers/item-document.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Uom, UomConversion, ItemCategory, Item, ItemBarcode, ItemRouteType,
      ItemAttributeDefinition, ItemAttributeValue, ItemSpecification, ItemDocument,
      Division, Section, Department,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [
    UomController, UomConversionController, ItemCategoryController, ItemRouteTypeController,
    ItemController, ItemBarcodeController, ItemAttributeController,
    ItemSpecificationController, ItemDocumentController,
  ],
  providers: [
    UomService, UomConversionService, ItemCategoryService, ItemService,
    ItemRouteTypeService, ItemConversionService,
    ItemBarcodeService, ItemAttributeService, ItemSpecificationService, ItemDocumentService,
  ],
  exports: [ItemService, ItemConversionService, UomService, ItemCategoryService],
})
export class ItemModule {}
