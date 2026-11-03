import {expect,test} from 'bun:test';
import {createBuild} from '../src/deck2d/build/build';
import {createBus,STOPS,type DeckView} from '../src/deck2d/contract';
test('a live snapshot can build all six machines without treating launch as a station sprite',()=>{
 const build=createBuild({get:()=>null} as never,createBus(),{reduced:true});
 const view=(built:boolean):DeckView=>({stops:STOPS.map(id=>({id,built,state:'idle',automated:false,items:[]})),jam:null,card:null,shippy:{at:'corner',pose:'idle'},shipped:0,caption:null});
 build.update(0,view(false));build.update(0,view(true));
 for(const stop of view(true).stops) expect(build.owns(stop)).toBe(stop.id!=='launch');
 build.start('launch');expect(build.progress('launch')).toBeNull();
});
