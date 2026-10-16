const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const items = await prisma.item.findMany({
    where: { itemCode: { in: ['FG-NP-005', 'FG-NP-001', 'FG-NP-002'] } },
    include: { baseUom: true, salesUom: true, purchaseUom: true }
  });
  console.log(JSON.stringify(items.map(x => ({
    code: x.itemCode,
    name: x.name,
    pSize: x.packagingSize,
    pUnit: x.packagingUnit,
    pType: x.packagingType,
    baseUom: x.baseUom?.code,
    salesUom: x.salesUom?.code,
    purchUom: x.purchaseUom?.code
  })), null, 2));
}
run().finally(() => prisma.$disconnect());
