import { Px, shift } from '../stations/px';
import { IDX, NAMES, RGB } from '../stations/palette';
import { rocks, rim, crystals } from '../props/underside';

export type District = 'Errors' | 'Traffic' | 'Inbox' | 'Customers' | 'Marketing';

/** Original code art, using the deck's actual stone/rim recipe. Every district is unpowered. */
export function island(name: District) {
  const g = new Px(224, 205), p = shift(g, 12, 0);
  const under = { w: 200, y0: 89, y1: 104 };
  rocks(p, under); crystals(p, under, () => false); rim(p, under);
  p.rect(0, 68, 200, 21, 'iron-1');
  for (let y = 70; y < 88; y += 6) {
    p.hline(2, y, 196, 'steel-0');
    for (let x = (y % 12 ? 8 : 22); x < 195; x += 28) { p.vline(x, y, 5, 'soot'); p.set(x + 1, y + 1, 'brass-3'); }
  }
  const box = (x: number, y: number, w: number, h: number) => {
    p.rect(x, y, w, h, 'steel-1'); p.box(x, y, w, h, 'soot');
    p.hline(x + 1, y + 1, w - 2, 'steel-3'); p.vline(x + w - 2, y + 2, h - 3, 'steel-2');
    for (let i = x + 3; i < x + w - 2; i += 7) p.set(i, y + 3, 'brass-4');
  };
  const lamp = (x: number) => {
    p.rect(x, 42, 3, 35, 'soot'); p.vline(x + 2, 43, 34, 'iron-3');
    p.hline(x, 42, 11, 'brass-2'); box(x + 6, 43, 8, 7); p.rect(x + 8, 45, 4, 3, 'iron-0');
    p.rect(x - 3, 77, 9, 3, 'iron-2');
  };
  if (name === 'Errors') {
    for (let r = 36; r > 0; r--) {
      for (let x = -r; x <= r; x++) {
        const y = Math.round(Math.sqrt(r * r - x * x) * .32);
        p.set(72 + x, 72 + y, r > 30 ? 'steel-2' : r > 26 ? 'brass-0' : 'soot');
        p.set(72 + x, 72 - y, r > 30 ? 'iron-2' : 'soot');
      }
    }
    p.line(40, 74, 63, 68, 'jam-0'); p.line(63, 68, 71, 81, 'jam-1'); p.line(71, 81, 101, 71, 'jam-0');
    p.line(63, 68, 58, 59, 'soot'); p.line(71, 81, 83, 87, 'soot');
    box(124, 48, 36, 29); p.line(120, 48, 141, 35, 'soot'); p.line(141, 35, 165, 48, 'brass-2');
    p.rect(129, 54, 24, 10, 'iron-0');
    for (const [a,b,c,d] of [[131,60,136,60],[136,60,139,55],[139,55,142,62],[142,62,149,59]]) p.line(a,b,c,d,'steel-3');
    lamp(177);
  } else if (name === 'Traffic') {
    for (let y = 55; y <= 79; y += 12) {
      for (let x = 18; x < 164; x += 8) p.rect(x, y - 2, 3, 9, 'iron-0');
      p.hline(15, y, 150, 'brass-3'); p.hline(15, y + 5, 150, 'brass-2');
    }
    for (const [x,y] of [[49,49],[110,61]]) {
      box(x,y,27,12); p.rect(x+3,y-4,21,5,'iron-2');
      p.disc(x+5,y+12,3,'soot'); p.disc(x+22,y+12,3,'soot');
    }
    p.rect(25,28,4,53,'iron-2'); p.rect(156,28,4,53,'iron-2'); box(24,26,137,7);
    for (const x of [45,91,137]) { box(x,34,7,13); p.disc(x+3,39,2,'iron-0'); }
    lamp(178);
  } else if (name === 'Inbox') {
    box(39,20,38,57); box(33,16,50,9); p.rect(48,34,20,4,'soot');
    p.box(48,46,20,15,'brass-2'); p.line(49,47,58,54,'brass-3'); p.line(58,54,66,47,'brass-3');
    box(119,53,51,26); p.line(113,53,143,39,'steel-3'); p.line(143,39,176,53,'brass-2');
    for (let i=0;i<3;i++) {
      const x=82+i*10, y=29+i*13;
      p.line(75,y,x,y,'soot'); p.line(x,y,x+5,y+5,'soot'); p.line(x+5,y+5,x+5,67,'soot'); p.line(x+5,67,120,67,'soot');
      p.line(75,y+1,x,y+1,'copper-2'); p.line(x,y+1,x+4,y+5,'copper-3'); p.line(x+4,y+5,x+4,68,'copper-1'); p.line(x+4,68,120,68,'copper-2');
    }
    lamp(181);
  } else if (name === 'Customers') {
    box(66,30,67,44); p.disc(99,53,21,'soot'); p.disc(99,53,19,'brass-2'); p.disc(99,53,15,'steel-1'); p.ring(99,53,12,'brass-4');
    p.disc(99,53,5,'brass-1'); p.line(91,53,107,53,'brass-3'); p.line(99,45,99,61,'brass-3');
    for (const [x,y] of [[9,43],[39,62],[137,43],[167,62]]) {
      box(x,y+9,24,17); p.rect(x-2,y,28,9,'copper-0');
      for(let a=0;a<28;a+=6) p.rect(x-2+a,y,3,9,'copper-3'); p.hline(x-2,y,28,'brass-3');
    }
    for(let r=15;r>0;r--) for(let x=-r;x<=r;x++) p.set(149+x,83-Math.round(Math.sqrt(r*r-x*x)*.32),r>12?'brass-2':'steel-0');
    p.hline(145,78,9,'brass-3'); lamp(186);
  } else {
    p.line(54,79,96,11,'iron-2'); p.line(96,11,145,79,'iron-2');
    p.rect(93,13,6,66,'steel-1'); p.vline(98,14,65,'steel-3');
    for(let y=26;y<73;y+=12) { p.line(94,y,98,y+10,'brass-2'); p.hline(82,y,28,'iron-2'); }
    p.rect(88,9,16,7,'brass-3'); p.rect(91,6,10,3,'brass-4');
    p.line(72,79,96,14,'soot'); p.line(124,79,96,14,'soot');
  }
  g.outline();
  // Posterize the finished drawing, rather than making a different silhouette for a locked district.
  // The fissure remains dull red; lamps, shards and beacon have no emissive layer.
  for(let i=0;i<g.d.length;i++) {
    const k=g.d[i]; if(k===255) continue;
    const name=NAMES[k];
    if(name==='jam-0'||name==='jam-1') continue;
    const [r,b,c]=RGB[k]; g.d[i]=r+b+c>115 ? IDX['iron-0'] : IDX.soot;
  }
  return g.bake();
}
