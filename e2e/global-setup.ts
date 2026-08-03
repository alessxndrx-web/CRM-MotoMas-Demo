import { prisma, seedFixtures } from "./fixtures";

export default async function globalSetup() {
  await seedFixtures();
  await prisma.$disconnect();
}
