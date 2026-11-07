// Liczy budżety plansz: dla każdej planszy generuje kilka typowych mostów (kratownice
// nad / pod jezdnią, wieże na filarach, połączenia z kotwami), sprawdza je w symulacji
// i ustawia budżet na podstawie najtańszego mostu, który przeprowadził pojazd z zapasem.
//
// Plansze militarne muszą dodatkowo dać się wysadzić: narzędzie szuka rozmieszczenia
// dostępnych ładunków, przy którym sojusznicy przejeżdżają, a wróg już nie.
//
// Użycie:  node tools/budzety.js             – przelicz wszystkie plansze i zapisz js/budgets.js
//          ZAPISZ=1 node tools/budzety.js z6 s3 – przelicz wybrane plansze i dopisz ich budżety
//          node tools/budzety.js 12 m3       – tylko plansza cywilna 12 i militarna 3, bez zapisu
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'js/physics.js'));
require(path.join(ROOT, 'js/levels.js'));
const { Sim, MATERIALS, Geo } = globalThis.Physics;
const LEVELS = globalThis.LEVELS;
const MIL_LEVELS = globalThis.MIL_LEVELS;
const DRAW_LEVELS = globalThis.DRAW_LEVELS;
const JUMP_LEVELS = globalThis.JUMP_LEVELS;

const BUDGET_FACTOR = 1.15;   // budżet = koszt mostu wzorcowego × współczynnik
const SAFETY = 0.92;          // most wzorcowy nie może przekroczyć 92% wytrzymałości
const DT = 1 / 60;

const k = (p) => p[0] + ',' + p[1];

function stressOf(sim) {
  let m = 0;
  for (const c of sim.constraints) {
    if (!c.beam || c.broken) continue;
    const r = c.fs > 0 ? c.fs / c.mat.maxT : (c.mat.maxC ? -c.fs / c.mat.maxC : 0);
    if (r > m) m = r;
  }
  return m;
}

// Tryb cywilny: pojazd musi przejechać bez żadnego pękniętego elementu
function simulate(level, beams) {
  const sim = new Sim(level, { beams });
  let maxStress = 0;
  for (let f = 0; f < 60 * 60; f++) {
    sim.step(DT);
    if (sim.brokenCount) return { win: false };
    maxStress = Math.max(maxStress, stressOf(sim));
    const r = sim.result();
    if (r) return r.win ? { win: true, maxStress } : { win: false };
  }
  return { win: false };
}

function cloneSim(sim) {
  const c = structuredClone(sim);
  Object.setPrototypeOf(c, Sim.prototype);
  return c;
}

// Tryb militarny, etap 1: sojusznicy przejeżdżają przez cały most bez uszkodzeń.
// Zwraca stan symulacji w chwili, gdy ostatni sojusznik zjechał z mostu.
function alliesCross(level, beams) {
  const sim = new Sim(level, { beams });
  const allies = sim.vehicles.filter(v => v.team === 'ally');
  const last = allies[allies.length - 1];
  const xR = level.anchors[1][0];
  let maxStress = 0;
  for (let f = 0; f < 60 * 60; f++) {
    sim.step(DT);
    if (sim.brokenCount) return null;
    maxStress = Math.max(maxStress, stressOf(sim));
    if (maxStress > SAFETY) return null;
    const r = sim.result();
    if (r && !r.win) return null;
    if (last.state === 'active' && Math.min(last.w1.x, last.w2.x) - last.spec.r > xR + 0.3) return { sim, maxStress };
  }
  return null;
}

// Etap 2: wysadzenie wybranych elementów i dalszy przebieg do końca misji
function blowUp(snapshot, idxs) {
  const sim = cloneSim(snapshot);
  for (const i of idxs) sim.constraints[i].charge = true;
  sim.detonate();
  let enemyX = -Infinity;
  for (let f = 0; f < 60 * 40; f++) {
    sim.step(DT);
    for (const v of sim.vehicles) if (v.team === 'enemy' && v.state === 'active') enemyX = Math.max(enemyX, v.w2.x);
    const r = sim.result();
    if (r) return { win: r.win, enemyX };
  }
  return { win: false, enemyX };
}

function* combos(arr, n, start = 0, acc = []) {
  if (acc.length === n) { yield acc.slice(); return; }
  for (let i = start; i < arr.length; i++) { acc.push(arr[i]); yield* combos(arr, n, i + 1, acc); acc.pop(); }
}

function findCharges(snapshot, maxCharges) {
  const targets = [];
  snapshot.constraints.forEach((c, i) => { if (c.beam && c.type !== 'road') targets.push(i); });
  const singles = [];
  for (const i of targets) {
    const r = blowUp(snapshot, [i]);
    if (r.win) return [i];
    singles.push([i, r.enemyX]);
  }
  // najbardziej obiecujące pojedyncze ładunki (wróg dojechał najkrócej) łączymy w pary i trójki
  const best = singles.sort((a, b) => a[1] - b[1]).slice(0, 7).map(s => s[0]);
  for (let n = 2; n <= maxCharges; n++) {
    for (const set of combos(best, n)) if (blowUp(snapshot, set).win) return set;
  }
  return null;
}

function candidate(level, opt) {
  const s = level.spec;
  const xL = level.anchors[0][0], yL = level.anchors[0][1];
  const xR = level.anchors[1][0], yR = level.anchors[1][1];
  const deckY = (x) => Math.round(yL + ((yR - yL) * (x - xL)) / (xR - xL));

  const beams = [];
  const seen = new Set();
  const add = (a, b, type) => {
    const id = [k(a), k(b)].sort().join('|');
    if (seen.has(id)) return;
    seen.add(id);
    beams.push({ a, b, type });
  };

  // Węzły jezdni: regularny krok + punkty nad filarami
  const xs = new Set();
  for (let x = xL; x < xR; x += opt.step) xs.add(x);
  xs.add(xR);
  const pillars = (s.pillars || []).map(p => [xL + p.x, xL + p.x + 2, p.top]);
  for (const [x0, x1] of pillars) { xs.add(x0); xs.add(x1); }
  const deck = [...xs].sort((a, b) => a - b).map(x => [x, deckY(x)]);
  for (let i = 0; i < deck.length - 1; i++) add(deck[i], deck[i + 1], 'road');

  const dir = opt.side === 'above' ? 1 : -1;
  const truss = [];
  if (opt.kind === 'warren') {
    // Kratownica Warrena: węzły pasa nad środkami przęseł jezdni
    for (let i = 0; i < deck.length - 1; i++) {
      const a = deck[i], b = deck[i + 1];
      const t = [(a[0] + b[0]) / 2, Math.round((a[1] + b[1]) / 2) + dir * opt.h];
      if (!Number.isInteger(t[0])) return null;
      truss.push(t);
      add(a, t, 'steel');
      add(t, b, 'steel');
    }
  } else {
    // Kratownica z pionowymi słupkami i krzyżowymi przekątnymi
    for (const d of deck) truss.push([d[0], d[1] + dir * opt.h]);
    for (let i = 0; i < deck.length; i++) {
      if (i > 0 && i < deck.length - 1) add(deck[i], truss[i], 'steel');
      if (i < deck.length - 1) {
        add(deck[i], truss[i + 1], 'steel');
        add(truss[i], deck[i + 1], 'steel');
      }
    }
    // skrajne węzły pasa są zbędne – zastępuje je przekątna z kotwy
    truss.shift(); truss.pop();
    beams.splice(0, beams.length, ...beams.filter(b => truss.some(t => Geo.samePt(t, b.a) || Geo.samePt(t, b.b)) || b.type === 'road'));
  }
  for (let i = 0; i < truss.length - 1; i++) add(truss[i], truss[i + 1], 'steel');

  // Wieże na filarach: słupy od kotew do jezdni, przekątne w każdym piętrze
  for (const [x0, x1, top] of pillars) {
    const yTop = deckY(x0);
    const n = Math.max(1, Math.ceil((yTop - top) / 4));
    let prev = null;
    for (let j = 0; j <= n; j++) {
      const y = j === n ? yTop : top + Math.round((j * (yTop - top)) / n);
      const pair = [[x0, j === n ? deckY(x0) : y], [x1, j === n ? deckY(x1) : y]];
      if (prev) {
        add(prev[0], pair[0], 'steel');
        add(prev[1], pair[1], 'steel');
        add(prev[0], pair[1], 'steel');
        add(prev[1], pair[0], 'steel');
      }
      if (j > 0 && j < n) add(pair[0], pair[1], 'steel');
      prev = pair;
    }
  }

  // Połączenia wolnych kotew z najbliższymi węzłami konstrukcji
  if (opt.links) {
    const nodes = new Map();
    for (const b of beams) { nodes.set(k(b.a), b.a); nodes.set(k(b.b), b.b); }
    for (const a of level.anchors) {
      if (nodes.has(k(a))) continue;
      const near = [...nodes.values()]
        .filter(p => !Geo.isAnchor(level, p))
        .map(p => [p, Math.hypot(p[0] - a[0], p[1] - a[1])])
        .filter(([p, d]) => d <= MATERIALS.steel.maxLen && !Geo.checkBeam(level, a, p, 'steel'))
        .sort((p, q) => p[1] - q[1])
        .slice(0, opt.links);
      for (const [p] of near) add(a, p, 'steel');
    }
  }

  for (const b of beams) if (Geo.checkBeam(level, b.a, b.b, b.type)) return null;
  return beams;
}

// ---------- Mosty zwodzone ----------
// Most wzorcowy: skrzydła (jezdnia + kratownica z pasem dolnym h i/lub górnym a),
// opcjonalnie ogon z przeciwwagą nad studnią, liny z pylonu i mosty dojazdowe do filarów.
function drawCandidate(level, opt) {
  const beams = [];
  const seen = new Set();
  const add = (a, b, type) => {
    const id = [k(a), k(b)].sort().join('|');
    if (seen.has(id)) return;
    seen.add(id);
    beams.push({ a, b, type });
  };

  // mosty dojazdowe do filarów: kratownica Warrena nad jezdnią
  for (const sp of level.spans) {
    const y = sp.a[1];
    const deck = [];
    for (let x = sp.a[0]; x <= sp.b[0]; x += 2) deck.push([x, y]);
    for (let i = 0; i < deck.length - 1; i++) {
      const t = [deck[i][0] + 1, y + opt.appH];
      add(deck[i], deck[i + 1], 'road');
      add(deck[i], t, 'steel');
      add(t, deck[i + 1], 'steel');
      if (i > 0) add([deck[i - 1][0] + 1, y + opt.appH], t, 'steel');
    }
  }

  for (const lf of level.leaves) {
    const m = level.motors[lf.m], d = m.dir;
    const xs = [];
    for (let x = m.x; d > 0 ? x < lf.tipX : x > lf.tipX; x += d * opt.step) xs.push(x);
    xs.push(lf.tipX);
    const yAt = (x) => Math.round(m.y + ((lf.tipY - m.y) * (x - m.x)) / (lf.tipX - m.x));
    const deck = xs.map(x => [x, yAt(x)]);
    for (let i = 0; i < deck.length - 1; i++) add(deck[i], deck[i + 1], 'road');
    for (const [off, on] of [[-opt.h, opt.h > 0], [opt.a, opt.a > 0]]) {
      if (!on) continue;
      const chord = deck.map(([x, y]) => [x, y + off]);
      for (let i = 1; i < deck.length; i++) {
        add(deck[i], chord[i], 'steel');
        add(deck[i - 1], chord[i], 'steel');
        if (i > 1) { add(chord[i - 1], deck[i], 'steel'); add(chord[i - 1], chord[i], 'steel'); }
      }
    }

    // ogon z przeciwwagą: jezdnia nad studnią, pas dolny częściowo z bloków betonu
    if (lf.pit && opt.tail) {
      const t = lf.pit.w;
      // ogon i skrzydło muszą tworzyć jedną sztywną bryłę – belki omijające sworzeń zawiasu
      const T1 = [m.x - d, m.y], B1 = [m.x - d, m.y - opt.tailD];
      add(B1, deck[1], 'steel');
      if (opt.a) add(T1, [deck[1][0], deck[1][1] + opt.a], 'steel');
      else if (opt.h) add(T1, [deck[1][0], deck[1][1] - opt.h], 'steel');
      // pas górny skrzydła przechodzi nad zawiasem aż do końca ogona (duże ramię momentu)
      if (opt.a) {
        const U0 = [m.x, m.y + opt.a];
        add(U0, [m.x, m.y], 'steel');
        add(U0, [deck[1][0], deck[1][1] + opt.a], 'steel');
        add(U0, deck[1], 'steel');
        let prevU = U0;
        for (let i = 1; i <= t; i++) {
          const U = [m.x - d * i, m.y + opt.a], T = [m.x - d * i, m.y];
          add(prevU, U, 'steel');
          add(U, T, 'steel');
          add(prevU, T, 'steel');
          prevU = U;
        }
      }
      let prevT = [m.x, m.y], prevB = null;
      for (let i = 1; i <= t; i++) {
        const T = [m.x - d * i, m.y], B = [m.x - d * i, m.y - opt.tailD];
        add(prevT, T, 'road');
        add(T, B, 'steel');
        add(prevT, B, 'steel');
        if (prevB) {
          add(prevB, T, 'steel');
          add(prevB, B, i > t - opt.cw ? 'counter' : 'steel');
        }
        prevT = T; prevB = B;
      }
      // dodatkowa warstwa bloków pod ogonem
      if (opt.heavy) {
        let prevC = null;
        for (let i = t - 1; i <= t; i++) {
          const B = [m.x - d * i, m.y - opt.tailD], C = [m.x - d * i, m.y - opt.tailD - 1];
          add(B, C, 'counter');
          if (prevC) { add(prevC, C, 'counter'); add([m.x - d * (i - 1), m.y - opt.tailD], C, 'steel'); }
          prevC = C;
        }
      }
    }

    // liny z pylonu do najdalszych węzłów jezdni, które da się sięgnąć
    if (lf.pylon && opt.cables) {
      let n = 0;
      for (const nd of deck.slice(1).reverse()) {
        if (n >= opt.cables) break;
        if (!Geo.checkBeam(level, lf.pylon, nd, 'cable')) { add(lf.pylon, nd, 'cable'); n++; }
      }
      if (!n) return null;
    }
  }
  for (const b of beams) if (Geo.checkBeam(level, b.a, b.b, b.type)) return null;
  return beams;
}

function drawOptions(level) {
  const opts = [];
  const tails = [{ tail: false }];
  const pit = level.leaves.find(l => l.pit);
  if (pit) {
    for (const tailD of [2]) {
      for (let cw = 0; cw < pit.pit.w; cw++) for (const heavy of [false, true]) tails.push({ tail: true, tailD, cw, heavy });
    }
  }
  const cables = level.pylons.length ? [0, 1, 2] : [0];
  const appHs = level.spans.length ? [2, 3] : [0];
  for (const step of [2, 3]) {
    for (const h of [0, 1, 2]) {
      for (const a of [0, 1, 2, 3]) {
        if (!h && !a) continue;
        for (const tl of tails) for (const c of cables) for (const appH of appHs) {
          opts.push(Object.assign({ kind: 'skrzydło', step, side: h ? 'below' : 'above', h, a, links: 0, cables: c, appH }, tl));
        }
      }
    }
  }
  return opts;
}

// Scenariusz: most podnosi się, gdy nadpływa statek, i opada, gdy statek przepłynie.
// Ostatni pojazd może nadjechać z dowolnej strony, więc sprawdzamy oba kierunki.
function drawSimulate(level, beams) {
  let maxStress = 0;
  for (const afterDir of [1, -1]) {
    const r = drawSimulateDir(level, beams, afterDir);
    if (!r.win) return { win: false, reason: (afterDir > 0 ? 'z lewej: ' : 'z prawej: ') + r.reason };
    maxStress = Math.max(maxStress, r.maxStress);
  }
  return { win: true, maxStress };
}

function drawSimulateDir(level, beams, afterDir) {
  const sim = new Sim(level, { beams }, { afterDir });
  let maxStress = 0;
  for (let f = 0; f < 60 * 150; f++) {
    if (sim.ship.state === 'approach') sim.raiseTarget = 1;
    if (sim.ship.state === 'passed') sim.raiseTarget = 0;
    sim.step(DT);
    if (sim.brokenCount) return { win: false, reason: 'pękło' };
    maxStress = Math.max(maxStress, stressOf(sim));
    const r = sim.result();
    if (r) return r.win ? { win: true, maxStress } : { win: false, reason: r.msg };
  }
  return { win: false, reason: 'czas' };
}

// ---------- Skocznia ----------
// Profile rampy: kolejne odcinki wznoszą się o 1 m na dx metrów, coraz stromiej ku krawędzi
function rampProfiles(maxN, maxLen) {
  const out = [];
  const rec = (seq, sum) => {
    if (seq.length) out.push(seq.slice());
    if (seq.length >= maxN) return;
    const last = seq.length ? seq[seq.length - 1] : 3;
    for (let dx = Math.min(3, last); dx >= 1; dx--) {
      if (sum + dx > maxLen) continue;
      seq.push(dx); rec(seq, sum + dx); seq.pop();
    }
  };
  rec([], 0);
  return out;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Każdy węzeł bez kotwy dostaje dwie belki do najbliższych punktów oparcia (kotew albo już
// podpartych węzłów), tak by tworzyły trójkąt. Zwraca false, gdy węzła nie da się podeprzeć.
function supportNodes(level, add, nodes, supported) {
  const isSup = (p) => supported.some(q => q[0] === p[0] && q[1] === p[1]);
  const pending = nodes.filter(n => !isSup(n));
  while (pending.length) {
    pending.sort((a, b) => Math.min(...supported.map(s => dist(s, a))) - Math.min(...supported.map(s => dist(s, b))));
    const n = pending.shift();
    const cands = supported
      .filter(p => dist(p, n) > 0 && dist(p, n) <= MATERIALS.steel.maxLen + 1e-9 && !Geo.checkBeam(level, p, n, 'steel'))
      .sort((a, b) => dist(a, n) - dist(b, n));
    if (!cands.length) return false;
    const p1 = cands[0];
    const p2 = cands.find(p => Math.abs((p1[0] - n[0]) * (p[1] - n[1]) - (p1[1] - n[1]) * (p[0] - n[0])) > 0.5);
    if (!p2) return false;
    add(n, p1, 'steel');
    add(n, p2, 'steel');
    supported.push(n);
  }
  return true;
}

function solidGround(level, x) {
  const [xL] = level.edgeL;
  const dt = level.spec.ditch;
  if (x > xL) return false;
  return !(dt && x > xL + dt.x0 && x < xL + dt.x1);
}

function jumpCandidate(level, takeoff, landing) {
  const beams = [];
  const seen = new Set();
  const add = (a, b, type) => {
    const id = [k(a), k(b)].sort().join('|');
    if (seen.has(id)) return;
    seen.add(id);
    beams.push({ a, b, type });
  };
  const [, yL] = level.edgeL;
  const [xR, yR] = level.edgeR;
  const supported = level.anchors.map(a => a.slice());

  // rampa startowa kończąca się na wysokości n nad krawędzią w punkcie lip
  const total = takeoff.prof.reduce((a, b) => a + b, 0);
  let x = takeoff.lip - total, h = 0;
  if (!solidGround(level, x)) return null;
  const nodes = [];
  // rampa zaczynająca się za rowem dostaje płaski odcinek jezdni nad rowem
  const dt = level.spec.ditch;
  if (dt && x > level.edgeL[0] + dt.x0) {
    for (let fx = level.edgeL[0] + dt.x0; fx < x; fx += 3) nodes.push([fx, yL]);
  }
  nodes.push([x, yL]);
  for (const dx of takeoff.prof) { x += dx; h += 1; nodes.push([x, yL + h]); }
  for (let i = 0; i < nodes.length - 1; i++) add(nodes[i], nodes[i + 1], 'road');
  if (!supportNodes(level, add, nodes, supported)) return null;

  // rampa lądowania: szczyt nad punktem xR - e, zjazd w prawo aż do poziomu brzegu
  if (landing) {
    let lx = xR - landing.e, lh = landing.prof.length;
    const ln = [[lx, yR + lh]];
    for (const dx of landing.prof.slice().reverse()) { lx += dx; lh -= 1; ln.push([lx, yR + lh]); }
    while (lx < xR) { lx = Math.min(xR, lx + 3); ln.push([lx, yR]); }
    for (let i = 0; i < ln.length - 1; i++) add(ln[i], ln[i + 1], 'road');
    if (!supportNodes(level, add, ln, supported)) return null;
  }
  for (const b of beams) if (Geo.checkBeam(level, b.a, b.b, b.type)) return null;
  return beams;
}

function jumpSimulate(level, beams) {
  const sim = new Sim(level, { beams });
  let maxStress = 0, reachX = -Infinity;
  const yR = level.edgeR[1];
  for (let f = 0; f < 60 * 40; f++) {
    sim.step(DT);
    const v = sim.car;
    if (v.state === 'active' && Math.min(v.w1.y, v.w2.y) > yR + 0.3) reachX = Math.max(reachX, Math.max(v.w1.x, v.w2.x));
    if (sim.brokenCount) return { win: false, reachX };
    maxStress = Math.max(maxStress, stressOf(sim));
    const r = sim.result();
    if (r) return r.win ? { win: true, clean: r.clean, jump: r.jump, maxStress, reachX } : { win: false, reachX };
  }
  return { win: false, reachX };
}

// Najtańszy zestaw ramp z czystym lądowaniem; jeśli takiego nie ma – najtańszy udany skok
function solveJump(level) {
  const [xL, yL] = level.edgeL;
  const [xR] = level.edgeR;
  const overhang = level.anchors.some(a => a[0] === xL && a[1] < yL);
  const lips = overhang ? [xL, xL + 1, xL + 2, xL + 3] : [xL];
  const takeoffs = [];
  for (const prof of rampProfiles(5, 10)) for (const lip of lips) takeoffs.push({ prof, lip });
  const landings = [null];
  for (const prof of [[], ...rampProfiles(3, 8)]) for (const e of [0, 2, 4, 6, 8]) if (prof.length || e) landings.push({ prof, e });

  // 1) same rampy startowe: odrzuć te, po których motocykl nie dolatuje w pobliże drugiego brzegu
  const kept = [];
  let tested = 0;
  for (const t of takeoffs) {
    const beams = jumpCandidate(level, t, null);
    if (!beams) continue;
    tested++;
    const r = jumpSimulate(level, beams);
    if (r.win || r.reachX >= xR - 9) kept.push(t);
  }
  // 2) pary rampa startowa + rampa lądowania, od najtańszych
  const cands = [];
  for (const t of kept) {
    for (const l of landings) {
      const beams = jumpCandidate(level, t, l);
      if (beams) cands.push({ opt: { takeoff: t, landing: l }, beams, cost: Geo.designCost(beams) });
    }
  }
  cands.sort((a, b) => a.cost - b.cost);
  let firstWin = null;
  for (const c of cands.slice(0, 4000)) {
    tested++;
    const r = jumpSimulate(level, c.beams);
    if (!r.win || r.maxStress > SAFETY) continue;
    const res = { ...c, maxStress: r.maxStress, clean: r.clean, jump: r.jump, tested, total: cands.length };
    if (r.clean) return res;
    if (!firstWin) firstWin = res;
  }
  return firstWin || { tested, total: cands.length };
}

function allCandidates(level) {
  if (level.drawbridge) {
    const cands = [];
    for (const opt of drawOptions(level)) {
      const beams = drawCandidate(level, opt);
      if (beams) cands.push({ opt, beams, cost: Geo.designCost(beams) });
    }
    return cands.sort((a, b) => a.cost - b.cost);
  }
  const cands = [];
  for (const kind of ['warren', 'pratt']) {
    for (const step of [2, 3, 4]) {
      for (const side of ['above', 'below']) {
        for (const h of [1, 2, 3, 4]) {
          for (const links of [0, 1, 2]) {
            const opt = { kind, step, side, h, links };
            const beams = candidate(level, opt);
            if (beams) cands.push({ opt, beams, cost: Geo.designCost(beams) });
          }
        }
      }
    }
  }
  return cands.sort((a, b) => a.cost - b.cost);
}

function solve(level) {
  if (level.jump) return solveJump(level);
  const cands = allCandidates(level);
  let tested = 0;
  for (const c of cands) {
    tested++;
    if (level.drawbridge) {
      const r = drawSimulate(level, c.beams);
      if (r.win && r.maxStress <= SAFETY) return { ...c, maxStress: r.maxStress, tested, total: cands.length };
      if (process.env.DEBUG) console.log('   ', JSON.stringify(c.opt), c.cost, r.win ? 'naprężenie ' + r.maxStress.toFixed(2) : r.reason);
      continue;
    }
    if (level.military) {
      const crossed = alliesCross(level, c.beams);
      if (!crossed) continue;
      const charges = findCharges(crossed.sim, level.charges);
      if (!charges) continue;
      const beams = c.beams.map((b, i) => (charges.includes(i) ? { ...b, charge: true } : b));
      return { ...c, beams, charges, maxStress: crossed.maxStress, tested, total: cands.length };
    }
    const r = simulate(level, c.beams);
    if (r.win && r.maxStress <= SAFETY) return { ...c, maxStress: r.maxStress, tested, total: cands.length };
  }
  return { tested, total: cands.length };
}

module.exports = { solve, candidate, simulate, drawCandidate, jumpCandidate, jumpSimulate };
if (require.main === module) main();

function main() {
  const args = process.argv.slice(2);
  const only = args.length > 0;
  const pick = (prefix, i) => !only || args.includes(prefix + (i + 1));
  let failed = 0;

  const run = (list, prefix, label) => {
    const budgets = [];
    console.log(`\n${label}`);
    list.forEach((lv, i) => {
      if (!pick(prefix, i)) return;
      const r = solve(lv);
      const num = (prefix + (i + 1)).padStart(3);
      if (r.beams) {
        const budget = Math.ceil((r.cost * BUDGET_FACTOR) / 100) * 100;
        budgets[i] = budget;
        const o = r.opt;
        const extra = r.charges ? `, ładunki ${r.charges.length}/${lv.charges}` : '';
        const shape = lv.jump
          ? `rampa [${o.takeoff.prof}]${o.takeoff.lip !== lv.edgeL[0] ? ' nawis ' + (o.takeoff.lip - lv.edgeL[0]) : ''}, lądowanie ${o.landing ? `[${o.landing.prof}]${o.landing.e ? ' +' + o.landing.e + ' m' : ''}` : 'brak'}, skok ${r.jump.toFixed(1)} m, ${r.clean ? 'czysto' : 'WYWROTKA'}`
          : lv.drawbridge ? `skrzydło, krok ${o.step}, dół ${o.h}, góra ${o.a}${o.tail ? `, ogon h${o.tailD} (bloki ${o.cw}${o.heavy ? '+warstwa' : ''})` : ''}${o.cables ? ', liny ' + o.cables : ''}${o.appH ? ', dojazd h' + o.appH : ''}` : `${o.kind}, krok ${o.step}, ${o.side === 'above' ? 'nad' : 'pod'}, h${o.h}, kotwy ${o.links}`;
        console.log(`${num}. ${lv.name.padEnd(22)} budżet ${String(budget).padStart(6)}  wzorzec ${r.cost} (${shape}, naprężenie ${(r.maxStress * 100).toFixed(0)}%${extra})  [${r.tested}/${r.total}]`);
      } else {
        failed++;
        console.log(`${num}. ${lv.name.padEnd(22)} BRAK ROZWIĄZANIA (${r.total} wariantów)`);
      }
    });
    return budgets;
  };

  const civil = run(LEVELS, '', 'Wersja cywilna');
  const military = run(MIL_LEVELS, 'm', 'Wersja militarna');
  const draw = run(DRAW_LEVELS, 'z', 'Wersja z mostami zwodzonymi');
  const jump = run(JUMP_LEVELS, 's', 'Wersja ze skocznią');

  // ZAPISZ=1 z listą plansz: dopisz nowe budżety do istniejącego pliku js/budgets.js
  if (only && process.env.ZAPISZ) {
    if (failed) { console.log(`\n${failed} plansz bez rozwiązania – nie zapisuję budżetów.`); process.exit(1); }
    require(path.join(ROOT, 'js/budgets.js'));
    const merge = (old, fresh) => { const out = (old || []).slice(); fresh.forEach((b, i) => { if (b != null) out[i] = b; }); return out; };
    civil.splice(0, civil.length, ...merge(globalThis.LEVEL_BUDGETS, civil));
    military.splice(0, military.length, ...merge(globalThis.MIL_BUDGETS, military));
    draw.splice(0, draw.length, ...merge(globalThis.DRAW_BUDGETS, draw));
    jump.splice(0, jump.length, ...merge(globalThis.JUMP_BUDGETS, jump));
  }
  if (!only || process.env.ZAPISZ) {
    if (failed) { console.log(`\n${failed} plansz bez rozwiązania – nie zapisuję budżetów.`); process.exit(1); }
    const out = `// Plik generowany przez tools/budzety.js – nie edytuj ręcznie.\n` +
      `(function (g) {\n  g.LEVEL_BUDGETS = ${JSON.stringify(civil)};\n  g.MIL_BUDGETS = ${JSON.stringify(military)};\n  g.DRAW_BUDGETS = ${JSON.stringify(draw)};\n  g.JUMP_BUDGETS = ${JSON.stringify(jump)};\n})(typeof window !== 'undefined' ? window : globalThis);\n`;
    fs.writeFileSync(path.join(ROOT, 'js/budgets.js'), out);
    console.log('\nZapisano js/budgets.js');
  }
}
