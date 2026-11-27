import { describe, expect, it } from 'vitest';
import { modelAccess, ModelLocked } from '@/lib/agent/models';
import { limitsFor, NO_PLAN } from '@/lib/plans';
import type { ChatModels } from '@/lib/providers/chat/catalog';
import type { ChatModel } from '@/lib/providers/chat/types';

const m = (id: string, out: number): ChatModel => ({ id, provider: 'fake', label: id, vendorModel: id, inputUsdPerM: out / 5, outputUsdPerM: out });
const LITE = m('g/lite', 2.5);
const FLASH = m('g/flash', 9);
const BIG = m('a/big', 60);

function catalog(models: ChatModel[], def: ChatModel | null = LITE): ChatModels {
  return {
    models,
    defaultModel: def,
    pick: (id) => models.find((x) => x.id === id) ?? def,
    provider: () => { throw new Error('no calls'); },
    info: () => ({ models: models.map((x, i) => ({ id: x.id, label: x.label, vendor: 'v', vendorName: 'V', popular: i })), defaultModel: def?.id ?? null }),
  };
}

describe('models by plan', () => {
  it('sorts models into tiers and locks the ones the plan does not include', () => {
    const info = modelAccess(catalog([LITE, FLASH, BIG]), NO_PLAN).info();
    expect(info.models.map((x) => [x.id, x.tier, x.locked, x.needs ?? null])).toEqual([
      ['g/lite', 'economy', false, null],
      ['g/flash', 'standard', true, 'Starter'],
      ['a/big', 'premium', true, 'Lab'],
    ]);
    expect(info.models[0].credits.reply).toMatchObject({ low: expect.any(Number) });
    expect(info.models[0].credits.research).toBeNull();
  });

  it('starts no-plan and Starter on Economy, Scholar and Lab on Standard', () => {
    const c = catalog([LITE, FLASH, BIG]);
    expect(modelAccess(c, NO_PLAN).defaultModel?.id).toBe('g/lite');
    expect(modelAccess(c, limitsFor('starter')).defaultModel?.id).toBe('g/lite');
    expect(modelAccess(c, limitsFor('scholar')).defaultModel?.id).toBe('g/flash');
    expect(modelAccess(c, limitsFor('lab')).defaultModel?.id).toBe('g/flash');
  });

  it('refuses a locked model when asked for, and replaces a chat’s locked model with the default', () => {
    const scholar = modelAccess(catalog([LITE, FLASH, BIG]), limitsFor('scholar'));
    expect(() => scholar.pick('a/big')).toThrow(ModelLocked);
    expect(scholar.pick(null, 'a/big')?.id).toBe('g/flash');
    expect(scholar.pick('g/lite', 'a/big')?.id).toBe('g/lite');
    expect(modelAccess(catalog([LITE, FLASH, BIG]), limitsFor('lab')).pick('a/big')?.id).toBe('a/big');
  });
});
