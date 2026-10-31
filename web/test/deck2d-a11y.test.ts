import { afterAll, beforeAll, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { wireDeckAccessibility } from '../src/deck2d/main';
import { mountCard, HOLD_MS } from '../src/deck2d/card/card';
import type { CardView } from '../src/deck2d/contract';

const keys=['window','document','navigator','HTMLElement','Element','Node','Event','MouseEvent','PointerEvent','KeyboardEvent','matchMedia'] as const;
const saved=new Map<string,PropertyDescriptor|undefined>();
let win:Window;
beforeAll(()=>{
  win=new Window({url:'http://localhost/deck.html?px=1'});
  for(const k of keys){saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:(win as unknown as Record<string,unknown>)[k]});}
});
afterAll(async()=>{for(const k of keys){const d=saved.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete(globalThis as Record<string,unknown>)[k];}await win.happyDOM.close();});
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(){
  const canvas=document.createElement('canvas'),host=document.createElement('div'),caption=document.createElement('p');document.body.append(canvas,host,caption);
  const answers:string[]=[];
  const ui=mountCard(host,{onApprove:id=>{answers.push(`yes:${id}`);show(null);},onLater:id=>{answers.push(`later:${id}`);show(null);}});
  const a11y=wireDeckAccessibility(canvas,host,caption);
  const show=(card:CardView|null,text:string|null='Waiting for your call')=>{ui.show(card);a11y.update(card,text);};
  const key=(key:string,type='keydown',repeat=false)=>(document.activeElement ?? canvas).dispatchEvent(new KeyboardEvent(type,{key,bubbles:true,cancelable:true,repeat}));
  return {canvas,host,caption,answers,show,key,destroy(){a11y.destroy();ui.destroy();canvas.remove();host.remove();caption.remove();}};
}
const card=(id:string,hold=false):CardView=>({id,title:hold?'Ship this PR?':'Start this issue?',line:'The next step waits for your approval.',stop:'planner',dots:null,yes:hold?'Ship it':'Start issue',no:'Later',hold});

test('canvas has a short text alternative; current caption is an atomic polite status',()=>{
  const f=fixture();expect(f.canvas.getAttribute('role')).toBe('img');expect(f.canvas.getAttribute('aria-label')!.length).toBeLessThan(80);expect(f.canvas.tabIndex).toBe(0);
  f.show(null,'Working on issue #16');expect(f.caption.getAttribute('role')).toBe('status');expect(f.caption.getAttribute('aria-live')).toBe('polite');expect(f.caption.getAttribute('aria-atomic')).toBe('true');expect(f.caption.textContent).toBe('Working on issue #16');
  f.show(null,null);expect(f.caption.textContent).toBe('');f.destroy();
});
test('new cards are named groups with a description and real buttons in Later / main order',()=>{
  const f=fixture();f.show(card('first'));
  const group=f.host.querySelector('[role="group"]') as HTMLElement;
  expect(document.activeElement).toBe(group);
  expect(document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent).toBe('Start this issue?');
  expect(document.getElementById(group.getAttribute('aria-describedby')!)?.textContent).toBe('The next step waits for your approval.');
  const buttons=[...group.querySelectorAll('button')];expect(buttons).toHaveLength(2);expect(buttons[0].textContent).toContain('Later');expect(buttons[1].textContent).toContain('Start issue');expect(buttons.every(b=>b.tabIndex===0)).toBe(true);
  f.show(card('second'));const next=f.host.querySelector('.ic-card:not(.ic-ghost)')!;expect(next.getAttribute('aria-labelledby')).not.toBe(group.getAttribute('aria-labelledby'));f.destroy();
});
test('Enter accepts a normal card; Escape chooses Later; focus returns to the canvas',()=>{
  const f=fixture();f.show(card('start'));f.key('Enter');expect(f.answers).toEqual(['yes:start']);expect(document.activeElement).toBe(f.canvas);
  f.show(card('later'));f.key('Escape');expect(f.answers).toEqual(['yes:start','later:later']);expect(document.activeElement).toBe(f.canvas);f.destroy();
});
test('keyboard shortcut leaves focused form controls and buttons to their native action',()=>{
  const f=fixture();f.show(card('form'));const input=document.createElement('input');f.host.append(input);input.focus();f.key('Enter');f.key('Escape');expect(f.answers).toEqual([]);
  (f.host.querySelector('.later') as HTMLButtonElement).focus();f.key('Enter');expect(f.answers).toEqual([]);f.destroy();
});
test('Enter retains the real hold threshold; short key presses and Escape cannot merge',async()=>{
  const f=fixture();f.show(card('ship-short',true));f.key('Enter');await wait(40);f.key('Enter','keyup');await wait(HOLD_MS+30);expect(f.answers).toEqual([]);
  f.key('Enter');await wait(40);f.key('Escape');await wait(HOLD_MS+30);expect(f.answers).toEqual(['later:ship-short']);
  f.show(card('ship-held',true));f.key('Enter');await wait(HOLD_MS+50);f.key('Enter','keyup');expect(f.answers).toEqual(['later:ship-short','yes:ship-held']);f.destroy();
});
test('a stray Enter outside the card cannot approve it (Start build dispatches Codex)',()=>{
  const f=fixture();f.show(card('stray'));f.canvas.focus();f.key('Enter');expect(f.answers).toEqual([]);
  (f.host.querySelector('[role="group"]') as HTMLElement).focus();f.key('Enter');expect(f.answers).toEqual(['yes:stray']);f.destroy();
});
