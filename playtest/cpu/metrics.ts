// Header/body-free aggregate query and strict projection. No invocation logs required.
import { CPU_OPERATIONS, type CpuOperation, validRun } from "./manifest";
export interface CpuCohort { operation: CpuOperation; version: string; start: string; end: string; expected: number; objectId?: string }
export function cohortQuery(scope: CpuCohort) {
  if (!CPU_OPERATIONS.includes(scope.operation) || !validRun(scope.version) || !Number.isFinite(Date.parse(scope.start)) || !Number.isFinite(Date.parse(scope.end)) || Date.parse(scope.start) >= Date.parse(scope.end) || !Number.isInteger(scope.expected) || scope.expected < 1 || scope.expected > 500) throw new Error("Invalid CPU cohort");
  const alarm = scope.operation === "tick";
  if (alarm && !/^[a-f0-9]{64}$/.test(scope.objectId ?? "")) throw new Error("Missing Factory identity");
  const filter = 'scriptName:"shiptorio-fixture",scriptVersion:$version,datetime_geq:$start,datetime_lt:$end' + (alarm ? ',objectId:$objectId,type:"alarm"' : '');
  const dataset = alarm ? "durableObjectsInvocationsAdaptiveGroups" : "workersInvocationsAdaptive";
  const dimensions = alarm ? 'namespaceId objectId type status scriptVersion' : 'scriptName scriptVersion status';
  return { query: `query($account:string!,$version:string!,$start:Time!,$end:Time!${alarm ? ',$objectId:string!' : ''}) {viewer {accounts(filter:{accountTag:$account}) {cohort:${dataset}(limit:4,filter:{${filter}}) {dimensions{${dimensions}} avg{sampleInterval} sum{requests${alarm ? '' : ' errors'}} quantiles{cpuTimeP50 cpuTimeP95 cpuTimeP99 wallTimeP50 wallTimeP95}}}}}`,
    variables: {version:scope.version,start:scope.start,end:scope.end,...(alarm ? {objectId:scope.objectId} : {})} };
}
function exact(value: unknown, allowed: readonly string[]): value is Record<string,unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key=>allowed.includes(key));
}
function numbers(value: unknown, fields: string[]): value is Record<string,number> {
  return exact(value,fields) && fields.every(field=>typeof value[field]==="number" && Number.isFinite(value[field]) && Number(value[field])>=0);
}
export function cpuAggregate(raw: unknown, scope: CpuCohort) {
  const failure = () => ({ status:"unproven" as const, operation:scope.operation, reason:"scope_sampling_or_completeness" });
  if (!exact(raw,["viewer"]) || !exact(raw.viewer,["accounts"]) || !Array.isArray(raw.viewer.accounts) || raw.viewer.accounts.length!==1 || !exact(raw.viewer.accounts[0],["cohort"])) return failure();
  const rows=raw.viewer.accounts[0].cohort;
  // Never merge quantiles across status groups or average p95s. One exclusive cohort only.
  if (!Array.isArray(rows) || rows.length!==1 || !exact(rows[0],["dimensions","avg","sum","quantiles"])) return failure();
  const row=rows[0], alarm=scope.operation==="tick";
  const dimensionFields=alarm ? ["namespaceId","objectId","type","status","scriptVersion"] : ["scriptName","scriptVersion","status"];
  const d=row.dimensions;
  if (!exact(d,dimensionFields) || d.scriptVersion!==scope.version || d.status!=="success" || (!alarm && d.scriptName!=="shiptorio-fixture") || (alarm && (d.type!=="alarm" || d.objectId!==scope.objectId || typeof d.namespaceId!=="string" || !/^[a-f0-9]{32}$/.test(d.namespaceId)))) return failure();
  if (!numbers(row.avg,["sampleInterval"]) || row.avg.sampleInterval!==1 || !numbers(row.sum,alarm?["requests"]:["requests","errors"]) || row.sum.requests!==scope.expected || !alarm && row.sum.errors!==0) return failure();
  if (!numbers(row.quantiles,["cpuTimeP50","cpuTimeP95","cpuTimeP99","wallTimeP50","wallTimeP95"]) || row.quantiles.cpuTimeP95===0) return failure();
  return { status:"complete" as const, operation:scope.operation, version:scope.version, samples:scope.expected,
    cpuMs:{p50:row.quantiles.cpuTimeP50/1000,p95:row.quantiles.cpuTimeP95/1000,p99:row.quantiles.cpuTimeP99/1000},
    wallMs:{p50:row.quantiles.wallTimeP50/1000,p95:row.quantiles.wallTimeP95/1000},
    scope:alarm ? "Factory alarm invocation" : "private probe RPC including identical adapter overhead",
    quantileSource:"Cloudflare aggregate, microseconds converted to milliseconds; no per-request bootstrap available" };
}
