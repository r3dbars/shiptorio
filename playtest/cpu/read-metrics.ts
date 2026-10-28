// Read-only query; reuses the already authorized load helper without copying its OAuth config.
import { pathToFileURL } from "node:url";
import { cohortQuery, cpuAggregate, type CpuCohort } from "./metrics";
const helper = process.env.SHIPTORIO_LOAD_ANALYTICS_HELPER;
const file = process.argv[2];
if (!helper?.startsWith("/") || !helper.endsWith("/tests/load/cf-analytics.ts") || !file || !process.argv.includes("--read-only")) {
  console.log(JSON.stringify({status:"unproven",reason:"explicit_read_only_helper_and_scope_required"}));
  process.exit(2);
}
try {
  const scope = await Bun.file(file).json() as CpuCohort;
  const {query,variables}=cohortQuery(scope);
  const {graphql,ACCOUNT}=await import(pathToFileURL(helper).href);
  const raw=await graphql(query,{account:ACCOUNT,...variables});
  // No raw records, headers, provider messages or API error bodies are persisted/printed.
  const result=cpuAggregate(raw,scope);
  console.log(JSON.stringify(result));
  if(result.status!=="complete")process.exitCode=2;
} catch {
  console.log(JSON.stringify({status:"unproven",reason:"metrics_read_failed",rawErrorSuppressed:true}));
  process.exitCode=2;
}
