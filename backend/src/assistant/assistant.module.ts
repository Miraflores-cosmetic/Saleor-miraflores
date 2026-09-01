import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffModule } from '../staff/staff.module';
import { AssistantAdminController } from './assistant-admin.controller';
import { AssistantService } from './assistant.service';
import { AssistantToolsService } from './assistant-tools.service';
import { GptunnelClient } from './gptunnel.client';

@Module({
  imports: [
    PrismaModule,
    StaffModule,
    DashboardModule,
    OrdersModule,
    CatalogModule,
  ],
  controllers: [AssistantAdminController],
  providers: [AssistantService, AssistantToolsService, GptunnelClient],
})
export class AssistantModule {}
