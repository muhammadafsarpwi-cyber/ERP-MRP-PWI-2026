import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FinanceAccount, FinanceAccountGroup, FinanceFiscalYear, FinanceAccountingPeriod,
  FinanceJournal, FinanceJournalLine,
} from './entities';
import { FinanceService } from './services/finance.service';
import { FinanceController } from './controllers/finance.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinanceAccount, FinanceAccountGroup, FinanceFiscalYear, FinanceAccountingPeriod, FinanceJournal, FinanceJournalLine,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}