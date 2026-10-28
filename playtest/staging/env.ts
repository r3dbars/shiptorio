import type { Env } from "../../server/src/index";
import type { FixtureProvider } from "./provider";
export interface FixtureEnv extends Env {
  FIXTURE_INSTANCE: "shiptorio-fixture";
  FIXTURE_PROVIDERS: DurableObjectNamespace<FixtureProvider>;
  TEST_FACTORY_KEY: string;
}
