import { expect, test } from 'bun:test';
import { createJourney } from '../src/deck2d/data/journey';
import { deckView, type LiveDeckView } from '../src/deck2d/data/view';
import { STOPS, type StopId } from '../src/deck2d/contract';
import type { FactoryState } from '@shiptorio/shared';

const base = (): FactoryState => ({ repo:'owner/repo', baseBranch:'main', districts:[], machines:[], belts:[], power:[], items:[{id:'gh-16',title:'Explain checks',kind:'cleanup',source:'github_issue',state:'queued',district:'/',attempts:0,updatedAt:1}], science:{red:0,green:0,grey:0,blue:0},trust:0,tick:0 });
function work(stop: StopId, badge='#16', shipped=0): LiveDeckView {
  return {stops:STOPS.map(id=>({id,built:true,state:id===stop?'working':'idle',automated:false,items:id===stop?[{id:'gh-16',look:'plain',...{badge}}]:[]})),work:{id:'gh-16',title:'Explain checks',stop,badge,status:'working'},intake:[],card:null,jam:null,shippy:{at:stop,pose:'inspect'},shipped,caption:null};
}
test('live queue is a pile before Repo; only selected work enters the line with a real identity',()=>{
  const state=base();
  const pending=deckView(state,{visualFlow:true});
  expect(pending.intake?.map(i=>i.id)).toEqual(['gh-16']);
  expect(pending.stops.every(s=>s.items.length===0)).toBe(true);
  state.pipeline=[{id:'planner',state:'working',cause:'planning',itemIds:['gh-16'],moveIds:[]}];
  const planning=deckView(state,{visualFlow:true});
  expect(planning.work).toMatchObject({id:'gh-16',stop:'planner',badge:'#16'});
  expect(planning.intake).toHaveLength(0);
  state.items[0]={...state.items[0],state:'inspecting',prNumber:27};
  expect(deckView(state,{visualFlow:true}).work).toMatchObject({id:'gh-16',stop:'checks',badge:'PR27'});
});
test('one confirmed issue visits every station, and the rocket waits for real merge and physical arrival',()=>{
  const journey=createJourney();
  journey.view({...work('repo'),work:undefined,intake:[{id:'gh-16',look:'plain',badge:'#16'}]});
  let view=journey.view(work('planner'));
  expect(view.followItem).toBe('gh-16');
  expect(view.work?.stop).toBe('repo');
  journey.step(20); journey.arrive('wrong','repo');
  expect(journey.view(work('planner')).work?.stop).toBe('repo');
  journey.arrive('gh-16','repo');journey.step(1);
  expect(journey.view(work('planner')).work?.stop).toBe('planner');
  journey.arrive('gh-16','planner');
  for(const stop of ['builder','checks','review','gate'] as const) {
    journey.step(1);view=journey.view(work(stop,stop==='builder'?'#16':'PR27'));
    expect(view.work?.stop).toBe(stop);expect(view.followItem).toBe('gh-16');
    expect(view.stops.flatMap(s=>s.items).map(i=>i.id)).toEqual(['gh-16']);
    journey.arrive('gh-16',stop);view=journey.view(work(stop,'PR27'));
    expect(view.followItem).toBeUndefined();expect(view.shipped).toBe(0);
  }
  journey.step(1);view=journey.view(work('launch','PR27',1));
  expect(view.shipped).toBe(0);
  journey.arrive('gh-16','launch');view=journey.view(work('launch','PR27',1));
  expect(view.shipped).toBe(1);
});
test('reconnect starts at the actual stage, and a rework can travel backwards without creating another issue',()=>{
  const journey=createJourney();
  expect(journey.view(work('review','PR27')).work?.stop).toBe('review');
  journey.step(1);
  expect(journey.view(work('builder','PR27')).work?.stop).toBe('checks');
  journey.arrive('gh-16','checks');journey.step(1);
  expect(journey.view(work('builder','PR27')).work?.stop).toBe('builder');
});
test('legacy simulator does not draw the live intake pile twice', () => {
  const view=deckView(base());
  expect(view.intake).toEqual([]);
  expect(view.stops.flatMap(s=>s.items)).toHaveLength(1);
});
test('the active launch keeps focus until its delivery animation finishes', () => {
  const state=base();
  state.items.push({...state.items[0],id:'old',state:'launched',prNumber:12,orbit:{since:1,until:9999999999999,state:'watching'}});
  state.pipeline=[{id:'planner',state:'working',cause:'planning',itemIds:['gh-16'],moveIds:[]}];
  expect(deckView(state,{visualFlow:true,activeItemId:'old'}).work?.id).toBe('old');
  expect(deckView(state,{visualFlow:true}).work?.id).toBe('gh-16');
});

test('launch cannot yield focus to the next issue before arrival and a visible launch beat',()=>{
  const journey=createJourney();
  journey.view(work('gate','PR27'));journey.step(1);
  journey.view(work('launch','PR27',1));
  expect(journey.finished()).toBeNull();
  journey.arrive('gh-16','launch');journey.view(work('launch','PR27',1));
  journey.step(9);expect(journey.finished()).toBeNull();
  journey.step(1);expect(journey.finished()).toBe('gh-16');
});

test('a shipped crate says shipped after arrival rather than working forever',()=>{
  const state=base();state.items[0]={...state.items[0],state:'launched',prNumber:27,orbit:{since:1,until:9999999999999,state:'watching'}};
  const view=deckView(state,{visualFlow:true});
  expect(view.work?.status).toBe('shipped');
  const journey=createJourney();
  expect(journey.view(view).caption).toContain('Shipped');
  expect(journey.view(view).caption).not.toContain('is working');
});
