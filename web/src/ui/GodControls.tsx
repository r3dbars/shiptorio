import "./GodControls.css";
import { useEffect, useState, type FormEvent } from 'react';

type Data = {users:{login:string;runs_used:number;calls_used:number;tokens_used:number}[];repos:{full_name:string}[];view:{login:string;repo:string;writable:boolean}|null;audit:{id:string;at:number;admin_login:string;action:string;target_repo:string|null;target_user:string|null;detail_json:string}[]};
const PROGRESS = JSON.stringify({v:1,xp:0,streak:0,best:0,freezes:0,last:null,days:[],seen:{},unlocked:[],equip:{}});
export function GodControls({onClose}:{onClose:()=>void}) {
  const [data,setData]=useState<Data|null>(null),[user,setUser]=useState(''),[repo,setRepo]=useState(''),[action,setAction]=useState('view'),[status,setStatus]=useState('Loading controls…');
  const [level,setLevel]=useState('advisor'),[progress,setProgress]=useState(PROGRESS),[runs,setRuns]=useState('20'),[calls,setCalls]=useState('400'),[tokens,setTokens]=useState('1000000'),[dollars,setDollars]=useState('5'),[confirm,setConfirm]=useState('');
  const [pending,setPending]=useState<Record<string,unknown>|null>(null),[busy,setBusy]=useState(false);
  useEffect(()=>{let live=true;fetch('/admin/god/state').then(async r=>{if(!r.ok)throw Error('Administrator access required');return r.json() as Promise<Data>}).then(d=>{if(live){setData(d);setUser(d.users[0]?.login??'');setRepo(d.view?.repo??d.repos[0]?.full_name??'');setStatus(d.view?'Viewing as '+d.view.login+' · '+(d.view.writable?'Write mode':'Read-only'):'No player view active')}}).catch(e=>{if(live)setStatus(e.message)});return()=>{live=false}},[]);
  function review(e:FormEvent){e.preventDefault();let body:Record<string,unknown>={action,repo,user};
    if(action==='write-mode'||action==='readonly')body={action:'write-mode',enabled:action==='write-mode'};
    if(action==='leave-view')body={action};
    if(action==='autonomy')body.level=level;
    if(action==='progress'||action==='reset-progress')body={action:'progress',user,reset:action==='reset-progress',...(action==='progress'?{progress}:{})};
    if(action==='limits')body={action,user,runs:Number(runs),calls:Number(calls),tokens:Number(tokens),dollars:Number(dollars)};
    if(['pause','resume','pause-all','resume-all'].includes(action))body={action:'pause',paused:action.startsWith('pause'),...(!action.endsWith('-all')?{repo}:{})};
    if(action==='reset-factory')body.confirm=confirm;
    setPending(body);
  }
  async function apply(){if(!pending||busy)return;setBusy(true);try{const r=await fetch('/admin/god',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(pending)}),d=await r.json();if(!r.ok)throw Error(d.error||'Action failed');if(d.url)location.assign(d.url);else location.reload()}catch(e){setStatus(e instanceof Error?e.message:'Action failed');setPending(null);setBusy(false)}}
  return <section className="card sheet god-controls" aria-label="God controls"><p role="status" className="god-view-status">{status}</p><header className="sheet-top"><h2>God controls</h2><button className="tbtn" type="button" onClick={onClose}>Close</button></header><div className="god-body">
    <p>Administrator actions are logged. Daily limits include usage already spent. Viewing starts read-only. Launch and verification gates still apply.</p>
    {data&&<form onSubmit={review} style={{display:'grid',gap:12}}>
      <label>Player<select value={user} onChange={e=>{setUser(e.target.value);setPending(null)}}>{data.users.map(u=><option key={u.login}>{u.login}</option>)}</select></label>
      <label>Factory<select value={repo} onChange={e=>{setRepo(e.target.value);setPending(null)}}>{data.repos.map(r=><option key={r.full_name}>{r.full_name}</option>)}</select></label>
      <label>Action<select value={action} onChange={e=>{setAction(e.target.value);setPending(null)}}>
        <option value="view">View as player (read-only)</option><option value="write-mode">Enable write mode</option><option value="readonly">Return to read-only</option><option value="leave-view">Leave player view</option><option value="fast-forward">Fast-forward scheduling timers</option><option value="autonomy">Set autonomy level</option><option value="progress">Grant progress and unlocks</option><option value="reset-progress">Reset player progress</option><option value="limits">Set run and AI limits</option><option value="pause">Pause factory</option><option value="resume">Resume factory</option><option value="pause-all">Pause all factories</option><option value="resume-all">Resume all factories</option><option value="reset-factory">Reset factory</option>
      </select></label>
      {action==='autonomy'&&<label>Level<select value={level} onChange={e=>{setLevel(e.target.value);setPending(null)}}>{['advisor','floor','build','lights_out'].map(l=><option key={l}>{l}</option>)}</select></label>}
      {action==='progress'&&<label>Progress JSON<textarea value={progress} onChange={e=>{setProgress(e.target.value);setPending(null)}} rows={6} style={{width:'100%'}}/></label>}
      {action==='limits'&&<><p>Already used today: {data.users.find(u=>u.login===user)?.runs_used??0} runs, {data.users.find(u=>u.login===user)?.calls_used??0} AI calls, {data.users.find(u=>u.login===user)?.tokens_used??0} tokens. These count toward the new ceilings.</p>{[['Build runs / day',runs,setRuns],['AI calls / day',calls,setCalls],['AI tokens / day',tokens,setTokens],['AI budget ($ / factory / day)',dollars,setDollars]].map(([name,value,setter])=><label key={name as string}>{name as string}<input type="number" min="0" step="any" value={value as string} onChange={e=>{(setter as (v:string)=>void)(e.target.value);setPending(null)}}/></label>)}</>}
      {action==='reset-factory'&&<label>Type {repo} to confirm reset<input value={confirm} onChange={e=>{setConfirm(e.target.value);setPending(null)}} autoComplete="off"/></label>}
      <button type="submit" className="tbtn" disabled={busy}>Review action</button>
      {pending&&<section aria-label="Confirm admin action"><p>Apply {action} for {String(pending.repo??pending.user??'all factories')}? This action is logged.</p><button type="button" className="tbtn hot" disabled={busy} onClick={apply}>Apply this action</button><button type="button" className="tbtn" disabled={busy} onClick={()=>setPending(null)}>Cancel</button></section>}
    </form>}
    {data&&<details><summary>Last 50 admin actions</summary>{data.audit.map(a=><p key={a.id}>{new Date(a.at).toLocaleString()} · {a.admin_login} · {a.action} · {a.target_repo??a.target_user??'global'} · {JSON.parse(a.detail_json).status??'recorded'}</p>)}</details>}
  </div></section>;
}
