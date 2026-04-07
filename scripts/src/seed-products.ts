import { getUncachableStripeClient } from './stripeClient';

const PRODUCTS = [
  {
    name: '100 Gem Paketi',
    description: '100 Gem ile macerana hiz kat!',
    metadata: { productId: 'gem_pack_100', type: 'gem_pack', gemsAmount: '100', bonusGems: '0' },
    priceUSD: 99,
  },
  {
    name: '500 Gem Paketi',
    description: '500 Gem + 50 bonus gem! En populer paket.',
    metadata: { productId: 'gem_pack_500', type: 'gem_pack', gemsAmount: '500', bonusGems: '50' },
    priceUSD: 499,
  },
  {
    name: '1000 Gem Paketi',
    description: '1000 Gem + 200 bonus gem! En iyi deger.',
    metadata: { productId: 'gem_pack_1000', type: 'gem_pack', gemsAmount: '1000', bonusGems: '200' },
    priceUSD: 999,
  },
  {
    name: 'Sezon Pasi',
    description: 'Premium odul hattini ac ve ozel odulleri kazan!',
    metadata: { productId: 'battle_pass_unlock', type: 'battle_pass', gemsAmount: '0', bonusGems: '0', includesBattlePass: 'true' },
    priceUSD: 499,
  },
  {
    name: 'Baslangic Paketi',
    description: '300 Gem + Sezon Pasi - yeni oyuncular icin ideal!',
    metadata: { productId: 'starter_bundle', type: 'bundle', gemsAmount: '300', bonusGems: '0', includesBattlePass: 'true' },
    priceUSD: 699,
  },
  {
    name: 'Mega Paket',
    description: '1500 Gem + 300 bonus + Sezon Pasi - en iyi teklif!',
    metadata: { productId: 'mega_bundle', type: 'bundle', gemsAmount: '1500', bonusGems: '300', includesBattlePass: 'true' },
    priceUSD: 1499,
  },
];

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();

    console.log('Creating GymQuest products in Stripe...\n');

    for (const p of PRODUCTS) {
      const existing = await stripe.products.search({
        query: `name:'${p.name}' AND active:'true'`
      });

      if (existing.data.length > 0) {
        console.log(`[SKIP] ${p.name} already exists (${existing.data[0].id})`);
        continue;
      }

      const product = await stripe.products.create({
        name: p.name,
        description: p.description,
        metadata: p.metadata,
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: p.priceUSD,
        currency: 'usd',
      });

      console.log(`[CREATED] ${p.name} -> product: ${product.id}, price: ${price.id} ($${(p.priceUSD / 100).toFixed(2)})`);
    }

    console.log('\nDone! Products will sync to database via webhooks.');
  } catch (error: any) {
    console.error('Error creating products:', error.message);
    process.exit(1);
  }
}

createProducts();
