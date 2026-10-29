import { expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { assembleCodex } from '../src/codex-assembler';
import { nativeTest } from './native-prerequisite';

async function fixture(run:(root:string,work:string,home:string,executable:string)=>Promise<void>){
  const root=await realpath(await mkdtemp(resolve(tmpdir(),'shiptorio-resilience-')));
  const work=resolve(root,'checkout'),home=resolve(root,'home'),executable=resolve(root,'fake-codex');
  await mkdir(work);await mkdir(home);await Bun.write(resolve(work,'README.md'),'Original documentation.\n');
  await Bun.write(executable,'#!/bin/sh\nprintf "partial proposal\\n"\nsleep 30\n');await chmod(executable,0o700);
  try{await run(root,work,home,executable);}finally{await rm(root,{recursive:true,force:true});}
}

nativeTest('a stuck Codex process ends with a clear terminal timeout and applies no partial edit',async()=>{
  await fixture(async(root,work,home,executable)=>{
    let writes=0;
    const verification={run:async()=>{writes++;throw Error('no incomplete proposal may reach the writer');},close:async()=>{}};
    await expect(assembleCodex({root,work,home,executable,timeout:250,job:{plan:'Improve the README.',allowedPaths:['README.md']},files:[{path:'README.md',content:'Original documentation.\n'}],verification})).rejects.toThrow('Codex timed out');
    expect(writes).toBe(0);expect(await Bun.file(resolve(work,'README.md')).text()).toBe('Original documentation.\n');
  });
});

import { Backoff, recoverWorkspace, replayReceipts } from '../src/recovery';
import { maintainConnection, RunnerExecutionFailure, runnerFailureSummary } from '../src/health';
import { loadPairings, savePairing } from '../src/pairing';
import { subscriptionSignedIn } from '../src/subscriptions';
import type { Job } from '../src/messages';

function assignment(now:number):Job {
  const id=crypto.randomUUID();return {id,lease:crypto.randomUUID(),repo:'fixture/repo',harness:'codex',baseSha:'a'.repeat(40),branch:`shiptorio/runner-${id}`,plan:'Improve docs',allowedPaths:['README.md'],token:'fixture-installation-token',deadline:now+30*60000};
}

test('virtual ten-minute sleep and sixty-second network loss resume the same journal without re-pairing',async()=>{
  await fixture(async(root)=>{
    const start=1700000000000,j=assignment(start);
    const pair={repo:j.repo,token:'unchanged-pairing',expires:start+7*86400000};await savePairing(pair,root);
    const first=await recoverWorkspace(root,j);await mkdir(first.work);await Bun.write(resolve(first.work,'README.md'),'Partly checked docs');await first.checkpoint('initialized');
    let now=start+10*60000,beats=0,failures=0;const online=now+60000,backoff=new Backoff(()=>1);
    while(now<online+60000 && !beats){
      if(backoff.ready(now))try{
        await maintainConnection(pair,{now:()=>now,renew:async()=>{throw Error('valid grant must not renew');},heartbeat:async()=>{if(now<online)throw new TypeError('network unavailable');beats++;}});backoff.reset();
      }catch{failures++;backoff.fail(now);}
      now+=1000;
    }
    expect(beats).toBe(1);expect(failures).toBeGreaterThan(1);
    const resumed=await recoverWorkspace(root,{...j,token:'fresh-installation-token'});
    expect(resumed.directory).toBe(first.directory);expect(resumed.state.initialized).toBe(true);expect(resumed.state.agentDone).toBe(false);
    expect(await Bun.file(resolve(resumed.work,'README.md')).text()).toBe('Partly checked docs');
    expect(await loadPairings(root)).toEqual([pair]);
    await Bun.write(resolve(root,'.work',`${j.id}.receipt.json`),JSON.stringify({jobId:j.id,lease:j.lease,ok:true,sha:'b'.repeat(40),summary:'Completed',checks:[]}));
    let acknowledged=0;await replayReceipts(root,j.repo,async()=>{acknowledged++;},now);await replayReceipts(root,j.repo,async()=>{acknowledged++;},now);
    expect(acknowledged).toBe(1);expect(await Bun.file(resolve(resumed.work,'README.md')).exists()).toBe(false);expect(await loadPairings(root)).toEqual([pair]);
  });
});

nativeTest('killing Codex mid-proposal fails cleanly, keeps pairing and accepts a later status check',async()=>{
  await fixture(async(root,_work,home,executable)=>{
    const j=assignment(Date.now()),workspace=await recoverWorkspace(root,j);await mkdir(workspace.work);await Bun.write(resolve(workspace.work,'README.md'),'Original documentation.\n');await workspace.checkpoint('initialized');
    const pair={repo:j.repo,token:'fixture-pairing',expires:Date.now()+86400000};await savePairing(pair,root);
    await Bun.write(executable,'#!/bin/sh\nprintf "partial edit proposal\\n"\nprintf ready > "$HOME/child-ready"\nwhile [ ! -f "$HOME/kill-now" ]; do sleep 0.01; done\nkill -KILL $$\n');
    let writes=0;
    const attempt=assembleCodex({root:workspace.directory,work:workspace.work,home,executable,timeout:5000,job:j,files:[{path:'README.md',content:'Original documentation.\n'}],verification:{run:async()=>{writes++;throw Error('incomplete output');},close:async()=>{}}});
    const settled=attempt.then(()=>null,error=>error);
    const end=Date.now()+3000;
    while(!await Bun.file(resolve(home,'child-ready')).exists()&&Date.now()<end)await Bun.sleep(10);
    expect(await Bun.file(resolve(home,'child-ready')).text()).toBe('ready');
    // The process's PID is namespace-local under Linux bubblewrap. Ask the same
    // real process to receive SIGKILL inside its boundary instead of killing a host PID.
    await Bun.write(resolve(home,'kill-now'),'kill');
    const failure=await settled;expect(failure).toBeInstanceOf(RunnerExecutionFailure);expect(runnerFailureSummary(failure)).toContain('Codex stopped');expect(writes).toBe(0);
    expect(await Bun.file(resolve(workspace.work,'README.md')).text()).toBe('Original documentation.\n');
    await Bun.write(resolve(root,'.work',`${j.id}.receipt.json`),JSON.stringify({jobId:j.id,lease:j.lease,ok:false,summary:runnerFailureSummary(failure),checks:[]}));
    await replayReceipts(root,j.repo,async receipt=>{expect((receipt as {summary:string}).summary).toContain('No code was published');});
    expect(await Bun.file(resolve(workspace.work,'README.md')).exists()).toBe(false);expect(await loadPairings(root)).toEqual([pair]);
    await Bun.write(executable,'#!/bin/sh\necho "Logged in using ChatGPT"\n');
    expect(await subscriptionSignedIn('codex',executable,home)).toBe(true);expect(await loadPairings(root)).toEqual([pair]);
  });
});
