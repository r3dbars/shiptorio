import { ART_PX, PALETTE, type CreateLayer, type DeckLayer } from '../contract';
import { beltRun } from '../engine/pxdraw';
import { island, type District } from './art';
import { Px } from '../stations/px';

export type ZoomLevel = 'station' | 'line' | 'city';
export interface CityLayer extends DeckLayer {
  setCity(on: boolean): void;
  camera(): { x: number; y: number; s: number };
}
const names: District[] = ['Errors', 'Traffic', 'Inbox', 'Customers', 'Marketing'];
const CENTER = { x: 2000, y: 320 };

/** A passive scenery layer. It never reads accounts, issues, analytics, or any service. */
export const createLayer: CreateLayer = () => {
  let active = false;
  const sprites = new Map(names.map(name => [name, island(name)]));
  const generated = import.meta.glob<string>('./assets/*.png', { eager: true, query: '?url', import: 'default' });
  for (const name of names) {
    const url = generated[`./assets/${name.toLowerCase()}.png`];
    if (!url) continue;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = 224; canvas.height = 205;
      const c = canvas.getContext('2d')!; c.imageSmoothingEnabled = false;
      const h = Math.round(220 * image.height / image.width);
      c.drawImage(image, 2, 205-h, 220, h);
      const im = c.getImageData(0,0,224,205), d=im.data;
      for(let i=0;i<d.length;i+=4) {
        if(d[i+3]<180) { d[i+3]=0; continue; }
        const red=name==='Errors' && d[i]>60 && d[i]>d[i+1]*2.5 && d[i]>d[i+2]*2.5;
        const color=red ? (d[i]>125?[200,35,27]:[106,13,13]) : d[i]+d[i+1]+d[i+2]>145 ? [24,18,17] : [10,6,4];
        [d[i],d[i+1],d[i+2]]=color; d[i+3]=255;
      }
      c.putImageData(im,0,0); sprites.set(name,canvas);
    };
    image.src=url;
  }
  const cloud = new Px(160,35);
  for(let i=0;i<12;i++) {
    const x=12+i*12, y=13+(i%3)*3, r=10+(i%4)*2;
    for(let yy=-r;yy<=r;yy++) {
      const half=Math.round(Math.sqrt(Math.max(0,r*r-yy*yy))*1.25);
      cloud.hline(x-half,y+Math.round(yy*.45),half*2+1,i%3===0?'haze-0':'iron-2');
    }
  }
  const cloudArt=cloud.bake();
  const scratch=document.createElement('canvas');
  let cloudTime=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const labels = document.createElement('div'); labels.className = 'city-labels'; labels.hidden = true;
  const repo = new URLSearchParams(location.search).get('repo')?.split('/').pop() || 'shiptorio';
  for(const name of [...names, repo]) { const label=document.createElement('span'); label.textContent=name; labels.append(label); }
  document.body.append(labels);
  const portrait = () => innerWidth / innerHeight <= 1.2;
  // A discrete 2:1 overview uses the same integer device-pixel camera as the deck.
  const scale = () => 1 / (ART_PX * 2 * Math.min(2, devicePixelRatio || 1));
  function positions(): [number, number][] {
    return portrait()
      ? [[-60,-258],[66,-144],[-64,139],[65,257],[-65,-365]]
      : [[-440,-108],[-380,118],[-45,145],[435,102],[470,-215]];
  }
  function screenWorld(x: number, y: number): [number, number] {
    return [CENTER.x+x/scale(), CENTER.y+y/scale()];
  }
  function belt(ctx: CanvasRenderingContext2D, points: [number,number][]) {
    for(let i=1;i<points.length;i++) {
      const a=screenWorld(...points[i-1]), b=screenWorld(...points[i]);
      // beltRun's native direction is left-to-right; swapping endpoints keeps the exact renderer, static.
      if(a[0]>b[0]) [a[0],b[0],a[1],b[1]]=[b[0],a[0],b[1],a[1]];
      beltRun(ctx,...a,...b,Math.hypot(b[0]-a[0],b[1]-a[1]),0,0);
    }
  }
  const layer: CityLayer = {
    setCity(on) { active=on; labels.hidden=!on; },
    camera: () => ({...CENTER, s:scale()}),
    update(dt) {
      if(!reduced.matches) cloudTime+=dt;
      if(!active) return;
      const pos=positions();
      [...labels.children].forEach((node,i)=>{
        const el=node as HTMLElement, [x,y]=pos[i]??[0,0];
        el.style.left=`${innerWidth/2+x}px`;
        el.style.top=`${innerHeight/2+y+(i===5?62:portrait()?65:128)}px`;
      });
    },
    draw(ctx,slot) {
      if(!active || slot!=='sky-far') return;
      const pos=positions(), phone=portrait();
      // Cloud beds are a separate screen-space layer behind all rock and sky belts; no camera attachment.
      ctx.save(); ctx.setTransform(1,0,0,1,0,0);
      const grid = ctx.canvas.width/innerWidth;
      for(const [i,[x,y]] of [...pos,[0,0]].entries()) {
        const drift=Math.round(Math.sin(cloudTime*.09+i)*3);
        const cx=Math.round((innerWidth/2+x+drift)*grid), cy=Math.round((innerHeight/2+y+(phone?38:80))*grid);
        const w=Math.round((phone?140:270)*grid), h=Math.max(2,Math.round((phone?25:38)*grid));
        ctx.drawImage(cloudArt,cx-Math.round(w/2),cy,w,h);
      }
      ctx.restore();
      // Draw all connections into a scratch layer, posterize, then composite behind the islands.
      scratch.width=ctx.canvas.width; scratch.height=ctx.canvas.height;
      const b=scratch.getContext('2d')!; b.imageSmoothingEnabled=false; b.setTransform(ctx.getTransform());
      const intakeX=phone?-90:-195;
      for(const i of [0,1,2]) belt(b, [pos[i],[intakeX-28,pos[i][1]],[intakeX,-10]]);
      const [cx,cy]=pos[3], [ix,iy]=pos[2];
      belt(b, [[cx,cy+18],[cx+40,cy+45],[ix+35,iy+38],[ix,iy]]);
      const im=b.getImageData(0,0,scratch.width,scratch.height), d=im.data;
      for(let i=0;i<d.length;i+=4) if(d[i+3]) {
        const color=(d[i]+d[i+1]+d[i+2]>110)?[24,18,17]:[10,6,4];
        [d[i],d[i+1],d[i+2]]=color; d[i+3]=255;
      }
      b.putImageData(im,0,0); ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(scratch,0,0); ctx.restore();
      // The launch route is a dotted brass arc, never a conveyor or animated rocket.
      const from:[number,number]=[phone?88:184,-8], to=pos[3];
      ctx.fillStyle=PALETTE.brass[2];
      for(let i=0;i<=28;i++) {
        const t=i/28, x=from[0]+(to[0]-from[0])*t, y=from[1]+(to[1]-from[1])*t-Math.sin(t*Math.PI)*(phone?42:100);
        const [wx,wy]=screenWorld(x,y); ctx.fillRect(Math.round(wx/10)*10,Math.round(wy/10)*10,20,20);
      }
      names.forEach((name,i)=>{
        const [x,y]=screenWorld(...pos[i]);
        const s=i===4?.72:1, sprite=sprites.get(name)!;
        // Integer source pixels, nearest-neighbor only. The smaller mast island has its own baked dimensions later.
        const w=Math.round(sprite.width*ART_PX*2*s/10)*10, h=Math.round(sprite.height*ART_PX*2*s/10)*10;
        ctx.drawImage(sprite,Math.round((x-w/2)/10)*10,Math.round((y-h*.42)/10)*10,w,h);
      });
    },
  };
  return layer;
};
