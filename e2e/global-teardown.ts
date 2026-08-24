import { cleanupFixtures, prisma } from "./fixtures";

export default async function globalTeardown() {
  await cleanupFixtures();
  await prisma.$disconnect();
}
