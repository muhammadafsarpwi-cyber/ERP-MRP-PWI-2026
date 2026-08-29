import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QcInspectionPlan } from './entities/qc-inspection-plan.entity';
import {
  QcInspection, QcInspectionResult, QcQualityCharacteristic,
  QcDefectClassification, QcNcr, QcCapa,
} from './entities/qc-entities';
import { QcService } from './services/qc.service';
import { QcController } from './controllers/qc.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QcInspectionPlan, QcInspection, QcInspectionResult, QcQualityCharacteristic,
      QcDefectClassification, QcNcr, QcCapa,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [QcController],
  providers: [QcService],
  exports: [QcService],
})
export class QcModule {}