import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "node:process";

loadEnvFile(".env");
export default defineConfig({
  outputDir:"test-results/crm-cc1",
  testDir:"./e2e", testMatch:/crm-call-center\.spec\.ts/, workers:1, fullyParallel:false,
  timeout:180_000, expect:{timeout:30_000}, reporter:"list",
  use:{...devices["Desktop Chrome"],actionTimeout:30_000,navigationTimeout:60_000,baseURL:"http://localhost:5173",trace:"retain-on-failure"},
  webServer:{command:"node node_modules/next/dist/bin/next start -p 5173 -H localhost",url:"http://localhost:5173/login",reuseExistingServer:true,timeout:180_000,stdout:"ignore",stderr:"pipe"},
});
