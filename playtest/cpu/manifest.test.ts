import { expect, test } from "bun:test";
import { fixtureIssue, sampleInput, validRun } from "./manifest";
import { cohortQuery, cpuAggregate, type CpuCohort } from "./metrics";
const version="00000000-0000-4000-8000-000000000001";
test("CPU samples bound run identity, operations and sequence without accepting caller destinations",()=>{
 expect(validRun(version)).toBe(true);
 for(const value of [null,{}, {runId:version,operation:"finish",sample:0},{runId:version,operation:"webhook",sample:300},{runId:version,operation:"heartbeat",sample:-1}])expect(sampleInput(value)).toBeNull();
 expect(sampleInput({runId:version,operation:"claim",sample:299})).toEqual({runId:version,operation:"claim",sample:299});
 const issue=fixtureIssue();expect(issue.repository.full_name).toBe("test-fixture/test-newbie");expect(issue.installation.id).toBe(18001);expect(issue.issue.author_association).toBe("OWNER");
});
const scope:CpuCohort={operation:"heartbeat",version,start:"2026-10-27T21:00:00Z",end:"2026-10-27T21:01:00Z",expected:250};
const sample=()=>({viewer:{accounts:[{cohort:[{dimensions:{scriptName:"shiptorio-fixture",scriptVersion:version,status:"success"},avg:{sampleInterval:1},sum:{requests:250,errors:0},quantiles:{cpuTimeP50:100,cpuTimeP95:200,cpuTimeP99:300,wallTimeP50:1000,wallTimeP95:2000}}]}]}});
test("CPU query pins private script/version/time and Factory alarm/object separately",()=>{
 expect(cohortQuery(scope).query).toContain('scriptName:"shiptorio-fixture",scriptVersion:$version');
 const tick=cohortQuery({...scope,operation:"tick",objectId:"a".repeat(64)});
 expect(tick.query).toContain('type:"alarm"');expect(tick.query).toContain("objectId:$objectId");
 expect(()=>cohortQuery({...scope,operation:"tick"})).toThrow();
 expect(cohortQuery(scope).query).not.toMatch(/headers|cookies|authorization|cpuTime\}/);
});
test("CPU projection converts true CPU units, preserves wall separately and rejects missing/sampled/foreign/mixed cohorts",()=>{
 const result=cpuAggregate(sample(),scope);expect(result.status).toBe("complete");if(result.status==="complete"){expect(result.cpuMs.p95).toBe(.2);expect(result.wallMs.p95).toBe(2);}
 for(const change of [(r:any)=>r.sum.requests--,(r:any)=>r.avg.sampleInterval=2,(r:any)=>r.quantiles.cpuTimeP95=0,(r:any)=>r.dimensions.scriptName="shiptorio",(r:any)=>r.dimensions.scriptVersion="wrong",(r:any)=>r.sum.errors++]) {const raw=sample();change(raw.viewer.accounts[0].cohort[0]);expect(cpuAggregate(raw,scope).status).toBe("unproven");}
 const mixed=sample();mixed.viewer.accounts[0].cohort.push(mixed.viewer.accounts[0].cohort[0]);expect(cpuAggregate(mixed,scope).status).toBe("unproven");
});
test("unknown nested request/log/error fields never survive telemetry projection",()=>{
 const raw:any=sample();raw.viewer.accounts[0].cohort[0].headers={authorization:"Bearer PRIVATE_CANARY",cookie:"PRIVATE_CANARY",error:{stack:"PRIVATE_CANARY"}};
 const result=cpuAggregate(raw,scope);expect(result.status).toBe("unproven");expect(JSON.stringify(result)).not.toContain("PRIVATE_CANARY");
 expect(cpuAggregate({errors:[{message:"PRIVATE_CANARY"}]},scope).status).toBe("unproven");
});
