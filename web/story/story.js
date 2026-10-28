  const $ = id => document.getElementById(id);
  const ns = 'http://www.w3.org/2000/svg';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let elapsed = 0, running = false, approved = false, started = false, last = 0, phase = -1, shipped = 0;
  let spawn = 0, launch = 0, boxes = [], rockets = [], drag = null, suppressClick = false;
  function shape(parent, href, x, y) {
    const node = document.createElementNS(ns, 'use');
    node.setAttribute('href', href); node.setAttribute('x', x); node.setAttribute('y', y);
    $(parent).append(node); return node;
  }
  function show(id, visible) { $(id).hidden = !visible; }
  function setPhase(next) {
    if (phase === next) return;
    phase = next;
    const copy = [
      ['A little work. A little lift.', 'The agents build. You give the go-ahead. Rockets ship.'],
      ['More agents. More work.', 'They get faster. But every change still needs your yes.'],
      ['And then… there’s you.', 'Good work piles up at the one place agents can’t replace.'],
      ['One yes. A whole lot of lift.', 'The pile clears. Your agents get back to shipping.'],
      ['That’s your repo.', 'Want to see the real one?']
    ][next];
    $('title').textContent = copy[0]; $('caption').textContent = copy[1];
    show('approval', next === 2); show('receipt', next !== 2 && next !== 4);
    if (next === 0) $('receipt').innerHTML = 'Small line. Real momentum.<small>Every rocket is a piece of work shipped.</small>';
    if (next === 1) $('receipt').innerHTML = 'The work speeds up.<small>The approval line doesn’t.</small>';
    if (next === 3) $('receipt').innerHTML = 'You cleared the way.<small>Less waiting. More shipping.</small>';
    show('cta', next === 4); show('replay', next === 4); show('pause', next !== 4);
    $('gate').setAttribute('stroke', next === 3 || next === 4 ? '#5bd18b' : '#f2a93b');
    $('queue-label').textContent = next === 3 || next === 4 ? 'All clear.' : 'One yes away.';
    if (next === 4) running = false;
  }
  function begin() {
    elapsed = 0; approved = false; started = true; running = true; phase = -1; shipped = 0;
    boxes = []; rockets = []; spawn = 0; launch = 0; last = 0;
    for (const id of ['crates', 'pile', 'rockets']) $(id).replaceChildren();
    $('card').style.transform = ''; $('pause').textContent = 'Pause'; $('shipped').textContent = '0 shipped';
    show('start', false); show('intro', false); setPhase(0);
  }
  function approve() {
    if (phase !== 2) return;
    approved = true; $('card').style.transform = ''; setPhase(3);
  }
  $('start').onclick = begin; $('replay').onclick = begin;
  $('pause').onclick = () => { running = !running; $('pause').textContent = running ? 'Pause' : 'Resume'; };
  $('card').onclick = () => { if (!suppressClick) approve(); };
  $('card').onkeydown = event => { if (event.key === 'ArrowRight') { event.preventDefault(); approve(); } };
  $('card').onpointerdown = event => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0 };
    suppressClick = false; $('card').setPointerCapture(event.pointerId);
  };
  $('card').onpointermove = event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.dx = event.clientX - drag.x;
    if (Math.abs(event.clientY - drag.y) > 40) drag.dx = 0;
    $('card').style.transform = `translateX(${Math.max(-12, Math.min(drag.dx, 150))}px)`;
  };
  function release(event) {
    if (!drag || drag.id !== event.pointerId) return;
    suppressClick = Math.abs(event.clientX - drag.x) > 8 || Math.abs(event.clientY - drag.y) > 8;
    if (event.type === 'pointerup' && drag.dx > 65) approve();
    drag = null; $('card').style.transform = '';
  }
  $('card').onpointerup = release; $('card').onpointercancel = release;
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, .1) : 0; last = now;
    if (started && running && !document.hidden) {
      // Hold the story at the human gate. Approval is never automatic.
      if (elapsed < 24 || approved) elapsed = Math.min(60, elapsed + dt);
      setPhase(approved ? (elapsed >= 60 ? 4 : 3) : elapsed >= 24 ? 2 : elapsed >= 12 ? 1 : 0);
      $('progress').style.width = `${elapsed / 60 * 100}%`;
      $('progress').parentElement.setAttribute('aria-valuenow', Math.floor(elapsed));
      const speed = approved ? 145 : elapsed >= 12 ? 100 : 48;
      spawn += dt; launch += dt;
      if (spawn > (approved ? .4 : elapsed >= 12 ? .5 : 1.7)) {
        spawn = 0; if (boxes.length < 24) boxes.push({ x: 36, node: shape('crates', '#box', 36, 176) });
      }
      for (const box of boxes) {
        box.x = Math.min(box.x + speed * dt, approved || elapsed < 12 ? 312 : 188);
        box.node.setAttribute('x', box.x); box.node.style.visibility = reduced ? 'hidden' : 'visible';
      }
      boxes = boxes.filter(box => { if (box.x >= 312) { box.node.remove(); return false; } return true; });
      const waiting = boxes.filter(box => box.x === 188).length;
      $('pile').replaceChildren();
      for (let i = 0; i < Math.min(waiting, 12); i++) shape('pile', '#box', 158 + (i % 2) * 24, 150 - Math.floor(i / 2) * 24);
      if ((approved || elapsed < 12) && launch > (approved ? .75 : 3)) {
        launch = 0; shipped++; $('shipped').textContent = `${shipped} shipped`;
        rockets.push({ y: 115, node: shape('rockets', '#rocket', 315, 115) });
      }
      for (const rocket of rockets) { rocket.y -= dt * (approved ? 140 : 70); rocket.node.setAttribute('y', reduced ? 115 : rocket.y); }
      rockets = rockets.filter(rocket => { if (rocket.y < -70) { rocket.node.remove(); return false; } return true; });
      $('agent2').setAttribute('y', reduced ? 122 : 122 - Math.abs(Math.sin(now / (elapsed >= 12 ? 85 : 250))) * 5);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
