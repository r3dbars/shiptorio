// The OLD side city + haze (moved here word for word from world.js's 'city' section, floating-city slice 1).
// world.js calls oldCity() for every load: with ?artpass=1 off it builds exactly what it always did; with it on the
// blocks are built into a throwaway group (so world.js's random sequence, and so the rest of the island, stays the
// same), the haze is skipped, and only the landmarks (pithead headframe, cooling tower, gantry crane, gasometer,
// the two flanking chimneys) are kept, in a group named 'city-landmarks' for skyline.js to ring the shaft with.
// No default export: the module loader skips this file.

export function oldCity(env) {
  const { K, THREE, M, rnd, chimney, hazeTex, artPass } = env;
  // flag on: the blocks go nowhere and their smoke with them; the landmarks get a group of their own
  const FAR = artPass ? K.group() : env.FAR;
  const chimTops = artPass ? [] : env.chimTops;
  const LM = artPass ? env.landmarks : env.FAR;
  const chim = artPass ? (x, z, y0, y1, r, smoke, P) => chimney(x, z, y0, y1, r, false, P) : chimney;
  // three layers each side, lower than the shaft so the sky shows above them; the furthest is the palest
  const layers = [{ z: -36, top: [-22, -4], m: M.city, win: 0.42, rows: 5 }, { z: -46, top: [-14, 2], m: M.cityD, win: 0.3, rows: 4 }, { z: -56, top: [-8, 4], m: M.cityL, win: 0.18, rows: 3 }];
  let smokers = 0;
  layers.forEach((L, li) => {
    for (const s of [-1, 1]) {
      let x = s * (19.5 + li * 1.5 + rnd() * 2);
      while (Math.abs(x) < 66) {
        const shed = li === 0 && rnd() < 0.3; // long low sheds between the blocks
        const w = shed ? 5 + rnd() * 4 : 2.2 + rnd() * 4.2, top = shed ? L.top[0] - 2 + rnd() * 4 : L.top[0] + rnd() * (L.top[1] - L.top[0]), base = -64, z = L.z - rnd() * 3, cx = x + s * w / 2;
        K.box(w, top - base, 3, rnd() < 0.5 ? L.m : M.silD, cx, (top + base) / 2, z, FAR);
        const roof = shed ? 0 : rnd();
        if (roof < 0.35) for (let i = 0; i < Math.floor(w / 0.8); i++) { const tr = K.box(0.8, 0.6, 3, L.m, cx - w / 2 + 0.4 + i * 0.8, top + 0.22, z, FAR); tr.rotation.z = 0.55; tr.scale.y = 0.8; }
        else if (roof < 0.6) { const ch = cx + (rnd() - 0.5) * w * 0.6, chh = 2 + rnd() * 4; K.cyl(0.32, 0.42, chh, M.silD, 6, ch, top + chh / 2, z, FAR); if (li < 2 && smokers < 8 && rnd() < 0.6) { smokers++; chimTops.push([ch, top + chh, z, 0.3, true]); } }
        else if (roof < 0.75) { K.cyl(0.9, 0.9, 1.2, M.silL, 8, cx, top + 1.6, z, FAR); for (const sx of [-0.6, 0.6]) K.box(0.1, 1.1, 0.1, M.silD, cx + sx, top + 0.5, z, FAR); }
        else if (roof < 0.85) { for (let k = 0; k < 4; k++) K.box(0.08, 3, 0.08, M.silL, cx - 0.6 + k * 0.4, top + 1.5, z, FAR); K.box(1.6, 0.1, 0.1, M.silL, cx, top + 2.9, z, FAR); K.box(0.12, 0.12, 0.12, M.beacon, cx, top + 3.05, z, FAR); }
        // lit windows in rows (sheds: one long lit band of the furnace floor)
        if (shed) { for (let i = 0; i < Math.floor(w / 0.42); i++) if (rnd() < 0.75) K.box(0.3, 0.42, 0.05, rnd() < 0.85 ? M.cityWin : M.cityWin2, cx - w / 2 + 0.3 + i * 0.42, top - 1.0, z + 1.53, FAR); }
        else {
          const rows = 1 + Math.floor(rnd() * L.rows);
          for (let r = 0; r < rows; r++) { const wy = top - 0.9 - r * (1.1 + rnd() * 0.6); for (let i = 0; i < Math.floor(w / 0.55); i++) if (rnd() < L.win) K.box(0.24, 0.3, 0.05, li === 2 ? M.cityWinD : rnd() < 0.8 ? M.cityWin : M.cityWin2, cx - w / 2 + 0.35 + i * 0.55, wy, z + 1.53, FAR); }
        }
        x += s * (w + 0.4 + rnd() * 2.2);
      }
    }
  });
  // landmarks that pierce the sky: a pithead headframe with its winding wheel, a cooling tower (left);
  // a gantry crane with a beacon and a gasometer (right)
  const hf = K.group(LM, -31, -12, -44.5);
  for (const sx of [-1.6, 1.6]) { const leg = K.box(0.34, 17.5, 0.34, M.silD, sx * 0.62, 8.4, 0, hf); leg.rotation.z = -sx * 0.085; }
  const strut = K.box(0.3, 17, 0.3, M.silD, 3.6, 7.8, 0, hf); strut.rotation.z = 0.36;
  for (let y = 1.5; y < 15.5; y += 1.9) { const w = 3.2 - y * 0.12; K.box(w, 0.14, 0.14, M.silD, 0, y, 0, hf); const b = K.box(0.1, Math.hypot(w, 1.9), 0.1, M.silD, 0, y + 0.95, 0, hf); b.rotation.z = Math.atan2(w, 1.9) * (Math.round(y) % 2 ? 1 : -1); }
  K.box(2.6, 0.4, 0.6, M.silD, 0, 16.4, 0, hf);
  for (const zz of [-0.35, 0.35]) { K.torus(1.55, 0.09, M.silL, 4, 20, 0, 17.6, zz, hf); for (let i = 0; i < 6; i++) { const sp = K.box(3.0, 0.07, 0.07, M.silL, 0, 17.6, zz, hf); sp.rotation.z = i * Math.PI / 6; } }
  K.box(0.12, 0.12, 0.12, M.beacon, 0, 19.3, 0, hf);
  K.lathe([[3.4, 0], [2.7, 3.5], [2.25, 7], [2.45, 9.2], [2.7, 10.4]], M.cityD, 14, -44, -14, -53, LM);
  const gc = K.group(LM, 38, -9, -50);
  for (const sx of [-2.2, 2.2]) K.box(0.3, 12, 0.3, M.silD, sx, 6, 0, gc);
  K.box(10, 0.5, 0.5, M.silD, 1.6, 12.2, 0, gc); K.box(1.4, 1.0, 0.8, M.silD, 4.5, 11.5, 0, gc);
  for (let i = 0; i < 6; i++) { const b = K.box(0.08, 2.4, 0.08, M.silL, -2.2 + i * 0.88, 10.9, 0, gc); b.rotation.z = i % 2 ? 0.6 : -0.6; }
  K.box(0.03, 3.5, 0.03, M.silL, 4.5, 9.2, 0, gc); K.box(0.14, 0.14, 0.14, M.beacon, -2.2, 12.6, 0, gc);
  const gs = K.group(LM, 49, -8, -55);
  K.cyl(3.6, 3.6, 5.5, M.cityL, 16, 0, 2.75, 0, gs);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box(0.16, 7.2, 0.16, M.silL, Math.cos(a) * 3.8, 3.6, Math.sin(a) * 3.8, gs); }
  for (const y of [2.4, 4.8, 7.0]) K.torus(3.8, 0.07, M.silL, 4, 24, 0, y, 0, gs).rotation.x = Math.PI / 2;
  // tall flanking chimneys either side of the stack (smoking)
  chim(-26.5, -38.5, -40, 15.5, 1.05, true, LM); chim(27.4, -39.5, -40, 13.2, 0.95, true, LM);
  if (artPass) return;
  // orange haze rising out of the depths: one bank in front of the city's feet, a thinner one further back
  const haze = new THREE.MeshBasicMaterial({ map: hazeTex(), transparent: true, depthWrite: false, fog: false });
  K.box(160, 46, 0.01, haze, 0, -26, -31, FAR);
  K.box(170, 40, 0.01, haze, 0, -22, -42, FAR);
}
