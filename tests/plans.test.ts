import { describe, expect, it } from 'vitest';
import { allPackProductIds, allPlanProductIds, limitsFor, NO_PLAN, packDefs, packForProduct, planDefs, planForProduct, planViews, previewPlanViews, tierFor } from '@/lib/plans';

const ENV = {
  POLAR_STARTER_MONTHLY_PRODUCT_ID: 'prod_tm',
  POLAR_STARTER_ANNUAL_PRODUCT_ID: 'prod_ty',
  POLAR_SCHOLAR_MONTHLY_PRODUCT_ID: 'prod_sm',
  POLAR_SCHOLAR_ANNUAL_PRODUCT_ID: 'prod_sy',
  POLAR_PRO_MONTHLY_PRODUCT_ID: 'prod_pm',
  POLAR_PRO_ANNUAL_PRODUCT_ID: 'prod_py',
  POLAR_LAB_MONTHLY_PRODUCT_ID: 'prod_lm',
  POLAR_LAB_ANNUAL_PRODUCT_ID: 'prod_ly',
  POLAR_TOPUP_SMALL_PRODUCT_ID: 'prod_p5',
  POLAR_TOPUP_LARGE_PRODUCT_ID: 'prod_p25',
};

describe('plans from the environment', () => {
  it('reads Starter, Scholar, Pro and Lab with their monthly credits', () => {
    const [starter, scholar, pro, lab] = planDefs(ENV);
    expect(starter).toMatchObject({ key: 'starter', monthlyCredits: 700, products: { month: { productId: 'prod_tm', credits: 700 }, year: { productId: 'prod_ty', credits: 8400 } } });
    expect(scholar).toMatchObject({ key: 'scholar', featured: true, monthlyCredits: 1900 });
    expect(pro).toMatchObject({ key: 'pro', name: 'Pro', monthlyCredits: 3900, products: { year: { credits: 46800 } } });
    expect(lab).toMatchObject({ key: 'lab', name: 'Lab', monthlyCredits: 7900, products: { year: { credits: 94800 } } });
    expect(allPlanProductIds(ENV)).toEqual(new Set(['prod_tm', 'prod_ty', 'prod_sm', 'prod_sy', 'prod_pm', 'prod_py', 'prod_lm', 'prod_ly']));
  });

  it('credits can be changed in the environment alone; bad values are ignored', () => {
    expect(planDefs({ ...ENV, LAB_MONTHLY_CREDITS: '8000' })[3].monthlyCredits).toBe(8000);
    expect(planDefs({ ...ENV, LAB_MONTHLY_CREDITS: 'lots' })[3].monthlyCredits).toBe(7900);
    expect(planDefs({}).every((p) => !p.products.month && !p.products.year)).toBe(true);
  });

  it('finds the plan and interval of a product', () => {
    expect(planForProduct('prod_ly', ENV)).toMatchObject({ interval: 'year', monthlyCredits: 7900, plan: { key: 'lab' } });
    expect(planForProduct('prod_pm', ENV)).toMatchObject({ interval: 'month', monthlyCredits: 3900, plan: { key: 'pro' } });
    expect(planForProduct('prod_p5', ENV)).toBeNull();
    expect(planForProduct(undefined, ENV)).toBeNull();
  });

  it('finds top-ups, and only the ones that are set up', () => {
    expect(packForProduct('prod_p25', ENV)).toMatchObject({ key: 'large', credits: 2500, price: 2500 });
    expect(packForProduct('prod_sm', ENV)).toBeNull();
    expect(allPackProductIds(ENV)).toEqual(new Set(['prod_p5', 'prod_p25']));
    expect(packDefs({}).map((p) => [p.credits, p.price])).toEqual([[500, 500], [1000, 1000], [2500, 2500]]);
  });
});

describe('what each plan allows', () => {
  it('every plan allows more than the one below it', () => {
    const order = [NO_PLAN, limitsFor('starter'), limitsFor('scholar'), limitsFor('pro')];
    for (const k of ['searchesPerDay', 'pdfStorageBytes', 'savedTraces', 'shelfPapers', 'embedsPerMonth', 'replyBudgetCap', 'dailySpendCap'] as const) {
      for (let i = 1; i < order.length; i++) expect(order[i][k]).toBeGreaterThan(order[i - 1][k]);
    }
    expect(NO_PLAN.researchBudgetCap).toBeNull();
    expect(limitsFor('lab').tiers).toContain('premium');
    expect(limitsFor('scholar').tiers).not.toContain('premium');
  });

  it('Lab is Pro for a group: the same limits per person, plus the shared lab, Python runs and room to share', () => {
    const pro = limitsFor('pro');
    const lab = limitsFor('lab');
    for (const k of ['searchesPerDay', 'pdfStorageBytes', 'savedTraces', 'shelfPapers', 'replyBudgetCap', 'researchBudgetCap'] as const) expect(lab[k]).toBe(pro[k]);
    expect([lab.codeSandbox, lab.labMembers]).toEqual([true, 5]);
    for (const l of [NO_PLAN, limitsFor('starter'), limitsFor('scholar'), pro]) expect([l.codeSandbox, l.labMembers]).toEqual([false, 0]);
    expect(lab.dailySpendCap).toBeGreaterThan(pro.dailySpendCap);
  });

  it('sorts models into tiers by output price', () => {
    expect(tierFor(2.5)).toBe('economy');
    expect(tierFor(3)).toBe('economy');
    expect(tierFor(9)).toBe('standard');
    expect(tierFor(15.01)).toBe('premium');
  });
});

describe('what the pricing page shows', () => {
  it('joins plans with Polar prices and works out the annual saving', () => {
    const prices = new Map([
      ['prod_sm', { price: 1900, currency: 'usd' }],
      ['prod_sy', { price: 18300, currency: 'usd' }],
    ]);
    const views = planViews(planDefs(ENV), prices);
    expect(views.map((v) => v.key)).toEqual(['scholar']);
    expect(views[0]).toMatchObject({ month: { price: 1900, credits: 1900 }, year: { price: 18300, credits: 22800 }, savePct: 20 });
  });

  it('before Polar is set up, shows every plan at the display prices', () => {
    const [starter, scholar, lab] = previewPlanViews({});
    expect(starter).toMatchObject({ preview: true, month: { price: 700 }, year: { price: 6800 }, savePct: 19 });
    expect(scholar).toMatchObject({ month: { price: 1900 }, year: { price: 18300 }, savePct: 20 });
    expect(lab).toMatchObject({ month: { price: 3900 }, year: { price: 37500 }, savePct: 20 });
  });
});

describe('Python runs only on the Lab plan', () => {
  it('offers run_python only with the code sandbox, and says which plan has it', async () => {
    const { offeredTools } = await import('@/lib/agent/tools');
    const { sandboxContext } = await import('@/lib/agent/prompt');
    const names = (sandbox: boolean) => offeredTools({ web: false, sandbox }).map((t) => t.name);
    expect(names(true)).toContain('run_python');
    expect(names(false)).not.toContain('run_python');
    // converting text files needs no sandbox, so it stays on every plan
    expect(names(false)).toContain('convert_file');
    expect(sandboxContext()).toContain('Lab plan');
  });
});

describe('asking for the sandbox without it', () => {
  it('tells the user Python runs come with the Lab plan', async () => {
    const { runTool } = await import('@/lib/agent/tools/run');
    const ctx = { userId: 'u', limits: limitsFor('pro'), code: () => null } as never;
    expect((await runTool(ctx, 'run_python', { code: 'print(1)' })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('Lab plan') });
  });
});
