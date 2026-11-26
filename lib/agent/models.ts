import { PLANS, tierFor, type Limits, type PlanKey, type Tier } from '@/lib/plans';
import type { ChatModels, ModelInfo } from '@/lib/providers/chat/catalog';
import type { ChatModel } from '@/lib/providers/chat/types';
import { replyEstimate } from './credits';

/* Which models a plan may use. Models fall into three tiers by their output
   price (Economy up to $3 per million tokens, Standard up to $15, Premium
   above), so new models from the live list sort themselves. No plan and
   Starter start on Economy; Scholar and Lab on Standard. */

export class ModelLocked extends Error {
  constructor(readonly tier: Tier) {
    super(`This model needs ${tier === 'premium' ? 'the Lab plan' : 'a paid plan'}. Choose another model or upgrade.`);
    this.name = 'ModelLocked';
  }
}

/* The cheapest plan whose tiers include this one, for the picker's hint. */
const planFor = (tier: Tier): PlanKey | null => (Object.keys(PLANS) as PlanKey[]).find((k) => PLANS[k].limits.tiers.includes(tier)) ?? null;

export type ModelChoice = ModelInfo & { tier: Tier; locked: boolean; needs?: string; credits: { reply: { low: number; high: number } | null; research: { low: number; high: number } | null } };

export function modelAccess(models: ChatModels, limits: Limits) {
  const allowed = (m: ChatModel) => limits.tiers.includes(tierFor(m.outputUsdPerM));
  const usable = models.models.filter(allowed);
  const cheapest = [...usable].sort((a, b) => a.outputUsdPerM - b.outputUsdPerM)[0] ?? null;
  const preferred = models.defaultModel && allowed(models.defaultModel) && tierFor(models.defaultModel.outputUsdPerM) === limits.defaultTier ? models.defaultModel : null;
  const popular = new Map(models.info().models.map((i) => [i.id, i.popular ?? Infinity]));
  const ofTier = usable.filter((m) => tierFor(m.outputUsdPerM) === limits.defaultTier).sort((a, b) => (popular.get(a.id) ?? Infinity) - (popular.get(b.id) ?? Infinity) || a.outputUsdPerM - b.outputUsdPerM);
  const defaultModel = preferred ?? ofTier[0] ?? (models.defaultModel && allowed(models.defaultModel) ? models.defaultModel : cheapest);

  return {
    defaultModel,
    allowed,
    /* The model for a reply: the one asked for (refused when the plan doesn't
       allow it), else the chat's own (or the plan's default when it no longer may). */
    pick(asked: string | null | undefined, stored?: string | null): ChatModel | null {
      if (asked) {
        const m = models.models.find((x) => x.id === asked);
        if (m && !allowed(m)) throw new ModelLocked(tierFor(m.outputUsdPerM));
        if (m) return m;
      }
      const s = stored ? models.models.find((x) => x.id === stored) : undefined;
      return s && allowed(s) ? s : defaultModel;
    },
    /* What the picker shows: every model, its tier, whether this plan may use it, and about what a reply costs. */
    info(): { models: ModelChoice[]; defaultModel: string | null } {
      const base = new Map(models.info().models.map((i) => [i.id, i]));
      return {
        models: models.models.map((m) => {
          const tier = tierFor(m.outputUsdPerM);
          const locked = !allowed(m);
          const needs = locked ? planFor(tier) : null;
          return {
            ...base.get(m.id)!,
            tier,
            locked,
            ...(needs ? { needs: PLANS[needs].name } : {}),
            credits: { reply: replyEstimate('assistant', m, limits), research: replyEstimate('research', m, limits) },
          };
        }),
        defaultModel: defaultModel?.id ?? null,
      };
    },
  };
}
