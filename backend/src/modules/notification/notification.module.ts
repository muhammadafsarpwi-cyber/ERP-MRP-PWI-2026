import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationRule } from './entities/notification-rule.entity';
import { NotificationEvent } from './entities/notification-event.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationChannel } from './entities/notification-channel.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { CommunicationSetting } from './entities/communication-setting.entity';
import { ErpUser } from '../user/entities/erp-user.entity';
import { UserRole } from '../user/entities/user-role.entity';
import { Role } from '../role/entities/role.entity';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { NotificationsService } from './notifications.service';
import { NotificationEngineService } from './notification-engine.service';
import { NotificationRecipientResolver } from './notification-recipient-resolver.service';
import { NotificationDeliveryProcessorService } from './notification-delivery-processor.service';
import { NotificationsController } from './notifications.controller';
import { NotificationAdminController } from './notification-admin.controller';
import { NotificationPreferenceController } from './notification-preference.controller';
import { CommunicationSettingController } from './communication-setting.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification, NotificationRule, NotificationEvent, NotificationTemplate,
      NotificationChannel, NotificationPreference, NotificationDelivery,
      CommunicationSetting, ErpUser, UserRole, Role,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [NotificationsController, NotificationAdminController, NotificationPreferenceController, CommunicationSettingController],
  providers: [NotificationsService, NotificationEngineService, NotificationRecipientResolver, NotificationDeliveryProcessorService],
  exports: [NotificationsService, NotificationEngineService],
})
export class NotificationsModule {}