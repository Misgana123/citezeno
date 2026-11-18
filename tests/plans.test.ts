import { describe, expect, it } from 'vitest';
import { allPlanProductIds, creditsForProduct, planDefs, planForProduct, planViews } from '@/lib/plans';

const ENV = {
  POLAR_SCHOLAR_MONTHLY_PRODUCT_ID: 'prod_sm',
  POLAR_SCHOLAR_ANNUAL_PRODUCT_ID: 'prod_sy',
  POLAR_LAB_MONTHLY_PRODUCT_ID: 'prod_lm',
  POLAR_LAB_ANNUAL_PRODUCT_ID: 'prod_ly',
  SCHOLAR_MONTHLY_CREDITS: '200',
  SCHOLAR_ANNUAL_CREDITS: '2400',
  LAB_MONTHLY_CREDITS: '1000',
  LAB_ANNUAL_CREDITS: '12000',
};

describe('plans from the environment', () => {
  it('reads Scholar and Lab, monthly and annual', () => {
    const [scholar, lab] = planDefs(ENV);
    expect(scholar).toMatchObject({ key: 'scholar', name: 'Scholar', featured: false, products: { month: { productId: 'prod_sm', credits: 200 }, year: { productId: 'prod_sy', credits: 2400 } } });
    expect(lab).toMatchObject({ key: 'lab', name: 'Lab', featured: true, products: { month: { productId: 'prod_lm', credits: 1000 }, year: { productId: 'prod_ly', credits: 12000 } } });
  });

  it('credits can be changed in the environment alone', () => {
    const [scholar, lab] = planDefs({ ...ENV, SCHOLAR_MONTHLY_CREDITS: '250', LAB_ANNUAL_CREDITS: '15000' });
    expect(scholar.products.month!.credits).toBe(250);
    expect(lab.products.year!.credits).toBe(15000);
  });

  it('falls back to sensible defaults and 12 × monthly for annual', () => {
    const [scholar, lab] = planDefs({ POLAR_SCHOLAR_MONTHLY_PRODUCT_ID: 'a', POLAR_SCHOLAR_ANNUAL_PRODUCT_ID: 'b', POLAR_LAB_ANNUAL_PRODUCT_ID: 'c', LAB_MONTHLY_CREDITS: '900' });
    expect(scholar.products.month!.credits).toBe(200);
    expect(scholar.products.year!.credits).toBe(2400);
    expect(lab.products.year!.credits).toBe(10800);
    expect(lab.products.month).toBeUndefined();
    // bad values are ignored
    expect(planDefs({ ...ENV, SCHOLAR_MONTHLY_CREDITS: 'lots' })[0].products.month!.credits).toBe(200);
    expect(planDefs({ ...ENV, SCHOLAR_MONTHLY_CREDITS: '-5' })[0].products.month!.credits).toBe(200);
  });

  it('a plan with no product IDs has no products', () => {
    expect(planDefs({}).every((p) => !p.products.month && !p.products.year)).toBe(true);
    expect(allPlanProductIds(ENV)).toEqual(new Set(['prod_sm', 'prod_sy', 'prod_lm', 'prod_ly']));
  });
});

describe('credits for a paid order', () => {
  it('uses the environment for plan products, whatever their metadata says', () => {
    expect(creditsForProduct({ id: 'prod_sy', metadata: { credits: 5 } }, ENV)).toBe(2400);
    expect(creditsForProduct({ id: 'prod_lm' }, ENV)).toBe(1000);
    expect(planForProduct('prod_ly', ENV)).toMatchObject({ interval: 'year', credits: 12000, plan: { key: 'lab' } });
  });

  it('other products still use their "credits" metadata, and unknown ones give nothing', () => {
    expect(creditsForProduct({ id: 'prod_pack', metadata: { credits: '500' } }, ENV)).toBe(500);
    expect(creditsForProduct({ id: 'prod_other', metadata: {} }, ENV)).toBe(0);
    expect(creditsForProduct(null, ENV)).toBe(0);
    expect(planForProduct(undefined, ENV)).toBeNull();
  });
});

describe('what the pricing page shows', () => {
  const prices = new Map([
    ['prod_sm', { price: 700, currency: 'usd' }],
    ['prod_sy', { price: 6720, currency: 'usd' }],
    ['prod_lm', { price: 1900, currency: 'usd' }],
    ['prod_ly', { price: 18240, currency: 'usd' }],
  ]);

  it('joins plans with Polar prices and works out the annual saving', () => {
    const [scholar, lab] = planViews(planDefs(ENV), prices);
    expect(scholar).toMatchObject({ name: 'Scholar', month: { price: 700, credits: 200 }, year: { price: 6720, credits: 2400 }, savePct: 20 });
    expect(lab).toMatchObject({ name: 'Lab', featured: true, month: { price: 1900 }, year: { price: 18240, credits: 12000 }, savePct: 20 });
  });

  it('hides an interval with no price, and a plan with none at all', () => {
    const only = new Map([['prod_lm', { price: 1900, currency: 'usd' }]]);
    const views = planViews(planDefs(ENV), only);
    expect(views.map((v) => v.key)).toEqual(['lab']);
    expect(views[0].year).toBeUndefined();
    expect(views[0].savePct).toBe(0);
  });
});
