import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Barcode } from './entities/barcode.entity';
import { BarcodeService } from './services/barcode.service';
import { BarcodeController } from './controllers/barcode.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Barcode]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [BarcodeController],
  providers: [BarcodeService],
  exports: [BarcodeService],
})
export class BarcodeModule {}
