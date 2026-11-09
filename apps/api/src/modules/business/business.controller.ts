import { Body, Controller, Get, Module, Patch } from '@nestjs/common';
import {
  BusinessSettingsSchema,
  PLAN_FEATURES,
  UpdateBusinessSchema,
  parseBusinessSettings,
} from '@stockwise/shared';
import { RequirePermissions } from '../../common/auth/decorators';
import { RequestContext } from '../../common/context/request-context';
import { ZodPipe, type Out } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Settings that reveal cost thresholds; hidden without products.view_cost (docs/05 §4.3). */
function visibleSettings(raw: unknown, canSeeCost: boolean) {
  const settings = parseBusinessSettings(raw);
  if (canSeeCost) return settings;
  const { anomaly: _anomaly, ...rest } = settings;
  return rest;
}

@Controller('business')
export class BusinessController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async get() {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: this.ctx.tenant.businessId },
    });
    return {
      ...business,
      settings: visibleSettings(business.settings, this.ctx.can('products.view_cost')),
    };
  }

  @Patch()
  @RequirePermissions('business.manage')
  async update(@Body(new ZodPipe(UpdateBusinessSchema)) body: Out<typeof UpdateBusinessSchema>) {
    const id = this.ctx.tenant.businessId;
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.business.findUniqueOrThrow({ where: { id } });
      const data = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
      const after = await tx.business.update({ where: { id }, data });
      await this.audit.record(tx, {
        action: 'business.update',
        entityType: 'Business',
        entityId: id,
        before,
        after,
      });
      return { ...after, settings: parseBusinessSettings(after.settings) };
    });
  }

  /** Validated BusinessSettings (docs/02 §6). Partial updates merge into the stored settings. */
  @Patch('settings')
  @RequirePermissions('business.manage')
  async updateSettings(@Body() body: unknown) {
    const id = this.ctx.tenant.businessId;
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.business.findUniqueOrThrow({ where: { id } });
      const current = parseBusinessSettings(before.settings);
      const patch = (body ?? {}) as Record<string, unknown>;
      const merged = new ZodPipe(BusinessSettingsSchema).transform({
        ...current,
        ...patch,
        analysis: { ...current.analysis, ...(patch.analysis as object | undefined) },
        anomaly: { ...current.anomaly, ...(patch.anomaly as object | undefined) },
      });
      await tx.business.update({ where: { id }, data: { settings: merged } });
      await this.audit.record(tx, {
        action: 'business.settings',
        entityType: 'Business',
        entityId: id,
        before: current,
        after: merged,
      });
      return merged;
    });
  }

  @Get('plan')
  @RequirePermissions('business.plan')
  async plan() {
    const { plan } = this.ctx.tenant;
    return { plan, features: PLAN_FEATURES[plan] };
  }
}

@Module({ controllers: [BusinessController] })
export class BusinessModule {}
