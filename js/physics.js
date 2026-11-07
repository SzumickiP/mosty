// Silnik fizyki mostu: XPBD (Position Based Dynamics z podatnością) w małych krokach.
// Bez zależności od DOM – można go uruchomić w Node do testów.
(function (global) {
  'use strict';

  const G = -9.81;

  // cost – koszt za metr, mass – kg/m, EA – sztywność osiowa [N],
  // maxT / maxC – siła zrywająca przy rozciąganiu / ściskaniu [N], maxLen – maks. długość [m]
  const MATERIALS = {
    road:  { name: 'Jezdnia',       cost: 200, mass: 100, EA: 4e6, maxT: 34000, maxC: 34000, maxLen: 4,  tensionOnly: false },
    steel: { name: 'Belka stalowa', cost: 120, mass: 40,  EA: 5e6, maxT: 48000, maxC: 38000, maxLen: 5,  tensionOnly: false },
    cable: { name: 'Lina stalowa',  cost: 70,  mass: 8,   EA: 3e6, maxT: 55000, maxC: 0,     maxLen: 12, tensionOnly: true  },
  };

  const VEHICLES = {
    car:    { name: 'Auto',        style: 'car',    wheelbase: 2.2, height: 0.9, r: 0.42, massWheel: 300, massTop: 200, speed: 4.0, accel: 8 },
    van:    { name: 'Dostawczak',  style: 'van',    wheelbase: 2.6, height: 1.3, r: 0.46, massWheel: 400, massTop: 300, speed: 3.6, accel: 8 },
    truck:  { name: 'Ciężarówka',  style: 'truck',  wheelbase: 3.2, height: 1.4, r: 0.52, massWheel: 550, massTop: 350, speed: 3.2, accel: 7 },
    tanker: { name: 'Cysterna',    style: 'tanker', wheelbase: 3.6, height: 1.5, r: 0.55, massWheel: 700, massTop: 500, speed: 3.0, accel: 7 },
    // pojazdy wojskowe
    jeep:   { name: 'Łazik',       style: 'jeep',   wheelbase: 2.2, height: 0.9, r: 0.44, massWheel: 280, massTop: 170, speed: 4.5, accel: 9 },
    apc:    { name: 'Transporter', style: 'apc',    wheelbase: 3.0, height: 1.2, r: 0.5,  massWheel: 500, massTop: 300, speed: 3.6, accel: 8 },
    tank:   { name: 'Czołg',       style: 'tank',   wheelbase: 3.4, height: 1.2, r: 0.55, massWheel: 750, massTop: 450, speed: 2.8, accel: 7 },
  };

  const SUBSTEPS = 40;
  const JOINT_MASS = 6;
  const BREAK_TAU = 0.04; // s – wygładzanie siły przed sprawdzeniem zerwania
  const BLAST_RADIUS = 2.5; // m – zasięg fali uderzeniowej
  const BLAST_SPEED = 6;    // m/s – prędkość nadawana węzłom tuż przy ładunku

  const key = (x, y) => x + ',' + y;

  class Sim {
    constructor(level, design) {
      this.level = level;
      this.particles = [];
      this.constraints = [];
      this.time = 0;
      this.brokenCount = 0;
      this.detonated = false;
      this.explosions = [];

      const anchorSet = new Set(level.anchors.map(a => key(a[0], a[1])));
      const index = new Map();
      const node = (pt) => {
        const k = key(pt[0], pt[1]);
        if (index.has(k)) return index.get(k);
        const p = this.addParticle(pt[0], pt[1], 0);
        p.fixed = anchorSet.has(k);
        p.key = k;
        index.set(k, this.particles.length - 1);
        return this.particles.length - 1;
      };

      for (const b of design.beams) {
        const mat = MATERIALS[b.type];
        const ia = node(b.a), ib = node(b.b);
        const pa = this.particles[ia], pb = this.particles[ib];
        const L = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        pa.m += mat.mass * L / 2;
        pb.m += mat.mass * L / 2;
        this.constraints.push({
          a: ia, b: ib, rest: L, compliance: L / mat.EA, type: b.type, mat,
          force: 0, fs: 0, broken: false, beam: true, charge: !!b.charge,
        });
      }
      for (const p of this.particles) {
        p.m += JOINT_MASS;
        p.w = p.fixed ? 0 : 1 / p.m;
      }

      // Statyczne krawędzie terenu (kolizje kół)
      this.segments = [];
      for (const poly of level.terrain) {
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length];
          this.segments.push([a[0], a[1], b[0], b[1]]);
        }
      }

      // Kolumna pojazdów. Tryb cywilny: jeden pojazd.
      const convoy = level.convoy || [{ type: level.vehicle || 'car', team: 'civil' }];
      this.vehicles = convoy.map((c, i) => ({
        idx: i, type: c.type, team: c.team, spec: VEHICLES[c.type], state: 'waiting',
        parts: null, w1: null, w2: null, rot1: 0, rot2: 0, stillTime: 0,
        crossed: false, fell: false, target: VEHICLES[c.type].speed,
      }));
      this.spawnVehicles();
    }

    // Zgodność ze starszym kodem: pierwszy pojazd
    get car() { return this.vehicles[0]; }
    get carParts() { return this.vehicles[0].parts || []; }

    addParticle(x, y, m, r) {
      const p = { x, y, px: x, py: y, vx: 0, vy: 0, m, w: m > 0 ? 1 / m : 0, r: r || 0, fixed: false, dead: false, contact: null };
      this.particles.push(p);
      return p;
    }

    // Pojazd: 2 koła + 2 punkty nadwozia, sztywny czworobok z przekątnymi
    placeVehicle(v, sx, sy) {
      const s = v.spec;
      const w1 = this.addParticle(sx, sy + s.r, s.massWheel, s.r);
      const w2 = this.addParticle(sx + s.wheelbase, sy + s.r, s.massWheel, s.r);
      const t1 = this.addParticle(sx + 0.2, sy + s.r + s.height, s.massTop);
      const t2 = this.addParticle(sx + s.wheelbase - 0.2, sy + s.r + s.height, s.massTop);
      const parts = [w1, w2, t1, t2];
      const ids = parts.map(p => this.particles.indexOf(p));
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const a = parts[i], b = parts[j];
          this.constraints.push({
            a: ids[i], b: ids[j], rest: Math.hypot(b.x - a.x, b.y - a.y), compliance: 0,
            type: 'car', force: 0, fs: 0, broken: false, beam: false,
          });
        }
      }
      Object.assign(v, { parts, w1, w2, t1, t2, state: 'active' });
    }

    // Kolejne pojazdy wjeżdżają, gdy zwolni się miejsce. Pierwszy wróg rusza dopiero,
    // gdy ostatni sojusznik dojedzie do końca przepaści (level.enemyTrigger).
    spawnVehicles() {
      const lv = this.level;
      for (const v of this.vehicles) {
        if (v.state !== 'waiting') continue;
        const prev = this.vehicles[v.idx - 1];
        if (prev && prev.state === 'waiting') return;
        const enemy = v.team === 'enemy';
        if (enemy && prev && prev.team !== 'enemy') {
          if (!prev.w2 || prev.w2.x < lv.enemyTrigger) return;
        }
        const sx = enemy ? lv.enemyStart : lv.start.x;
        const clear = this.vehicles.every(o => o.state !== 'active' || o.fell ||
          Math.min(o.w1.x, o.w2.x) - o.spec.r > sx + v.spec.wheelbase + v.spec.r + 2.5 ||
          Math.max(o.w1.x, o.w2.x) < sx - 3);
        if (!clear) return;
        this.placeVehicle(v, sx, lv.start.y);
      }
    }

    step(dt) {
      this.spawnVehicles();
      this.updateTargets();
      const h = dt / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) this.substep(h);
      this.time += dt;

      const lv = this.level;
      for (const v of this.vehicles) {
        if (v.state !== 'active') continue;
        const r = v.spec.r;
        v.rot1 -= (v.w1.vx * dt) / r;
        v.rot2 -= (v.w2.vx * dt) / r;
        const speed = Math.hypot(v.w1.vx, v.w1.vy);
        v.stillTime = speed < 0.15 && v.target > 0.5 ? v.stillTime + dt : 0;
        if (!v.fell && v.parts.some(p => p.y < lv.water + 0.4)) v.fell = true;
        if (!v.fell && Math.min(v.w1.x, v.w2.x) > lv.finish) v.crossed = true;
        // za metą pojazd zatrzymuje się poza ekranem
        if (Math.min(v.w1.x, v.w2.x) > lv.finish + 7 || v.parts.every(p => p.dead)) {
          v.state = 'done';
          for (const p of v.parts) { p.w = 0; p.vx = p.vy = 0; }
        }
      }
    }

    // Pojazd zwalnia, gdy przed nim jest inny pojazd
    updateTargets() {
      for (const v of this.vehicles) {
        if (v.state !== 'active') continue;
        const front = Math.max(v.w1.x, v.w2.x) + v.spec.r;
        let gap = Infinity;
        for (const o of this.vehicles) {
          if (o === v || o.state !== 'active' || o.fell) continue;
          const rear = Math.min(o.w1.x, o.w2.x) - o.spec.r;
          if (rear > front - 0.5 && Math.abs(o.w1.y - v.w1.y) < 4) gap = Math.min(gap, rear - front);
        }
        v.target = gap < 1.2 ? 0 : gap < 3 ? v.spec.speed * (gap - 1.2) / 1.8 : v.spec.speed;
      }
    }

    substep(h) {
      const P = this.particles;
      const ih2 = 1 / (h * h);

      for (const p of P) {
        if (p.w === 0) continue;
        p.vy += G * h;
        p.px = p.x; p.py = p.y;
        p.x += p.vx * h;
        p.y += p.vy * h;
        p.contact = null;
      }

      for (const c of this.constraints) {
        if (c.broken) continue;
        const a = P[c.a], b = P[c.b];
        const wsum = a.w + b.w;
        if (wsum === 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-9) continue;
        const C = d - c.rest;
        if (c.mat && c.mat.tensionOnly && C < 0) { c.force = 0; continue; }
        const dl = -C / (wsum + c.compliance * ih2);
        const nx = dx / d, ny = dy / d;
        a.x -= nx * dl * a.w; a.y -= ny * dl * a.w;
        b.x += nx * dl * b.w; b.y += ny * dl * b.w;
        c.force = -dl * ih2; // > 0 rozciąganie, < 0 ściskanie
      }

      this.solveContacts();

      for (const p of P) {
        if (p.w === 0) continue;
        p.vx = (p.x - p.px) / h;
        p.vy = (p.y - p.py) / h;
        const damp = 1 - 0.15 * h;
        p.vx *= damp; p.vy *= damp;
        if (p.y < -15) { p.w = 0; p.dead = true; p.vx = p.vy = 0; }
      }

      // Napęd: koła w kontakcie dążą do prędkości docelowej wzdłuż podłoża
      for (const v of this.vehicles) {
        if (v.state !== 'active') continue;
        for (const wh of [v.w1, v.w2]) {
          if (!wh.contact || wh.w === 0) continue;
          const nx = wh.contact[0], ny = wh.contact[1];
          if (ny < 0.3) continue;
          const tx = ny, ty = -nx;
          const vt = wh.vx * tx + wh.vy * ty;
          const maxDv = v.spec.accel * h;
          const dv = Math.max(-maxDv, Math.min(maxDv, v.target - vt));
          wh.vx += tx * dv; wh.vy += ty * dv;
        }
      }

      // Zerwania
      const k = 1 - Math.exp(-h / BREAK_TAU);
      for (const c of this.constraints) {
        if (c.broken || !c.beam) continue;
        c.fs += (c.force - c.fs) * k;
        if (c.fs > c.mat.maxT || (!c.mat.tensionOnly && -c.fs > c.mat.maxC)) this.breakBeam(c);
      }
    }

    solveContacts() {
      const P = this.particles;
      for (const v of this.vehicles) {
        if (v.state !== 'active') continue;
        for (const wh of [v.w1, v.w2]) {
          if (wh.w === 0) continue;
          for (const s of this.segments) this.contact(wh, s[0], s[1], s[2], s[3], null, null);
          for (const c of this.constraints) {
            if (c.broken || c.type !== 'road' || c.half) continue;
            const a = P[c.a], b = P[c.b];
            this.contact(wh, a.x, a.y, b.x, b.y, a, b);
          }
        }
      }
    }

    contact(wh, ax, ay, bx, by, pa, pb) {
      const ex = bx - ax, ey = by - ay;
      const L2 = ex * ex + ey * ey;
      if (L2 < 1e-12) return;
      let t = ((wh.x - ax) * ex + (wh.y - ay) * ey) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + ex * t, cy = ay + ey * t;
      const dx = wh.x - cx, dy = wh.y - cy;
      const d = Math.hypot(dx, dy);
      if (d >= wh.r || d < 1e-9) return;
      const nx = dx / d, ny = dy / d;
      const wa = pa ? pa.w : 0, wb = pb ? pb.w : 0;
      const denom = wh.w + wa * (1 - t) * (1 - t) + wb * t * t;
      const dl = (wh.r - d) / denom;
      wh.x += nx * dl * wh.w; wh.y += ny * dl * wh.w;
      if (pa) { pa.x -= nx * dl * wa * (1 - t); pa.y -= ny * dl * wa * (1 - t); }
      if (pb) { pb.x -= nx * dl * wb * t; pb.y -= ny * dl * wb * t; }
      if (!wh.contact || ny > wh.contact[1]) wh.contact = [nx, ny];
    }

    // Zerwany element rozpada się na dwie zwisające połówki
    breakBeam(c, blast) {
      c.broken = true;
      this.brokenCount++;
      const P = this.particles;
      const a = P[c.a], b = P[c.b];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const halfMass = c.mat.mass * c.rest / 4 + 1;
      for (const [end, endIdx] of [[a, c.a], [b, c.b]]) {
        const piece = this.addParticle(mx + (end.x - mx) * 0.08, my + (end.y - my) * 0.08, halfMass);
        piece.vx = end.vx; piece.vy = end.vy;
        if (blast) { piece.vx += (end.x - mx) * 4; piece.vy += (end.y - my) * 4 + 3; }
        const L = Math.hypot(piece.x - end.x, piece.y - end.y);
        this.constraints.push({
          a: endIdx, b: P.length - 1, rest: L, compliance: 0, type: c.type, mat: c.mat,
          force: 0, fs: 0, broken: false, beam: false, half: true,
        });
      }
    }

    // Wynik próby: null – jeszcze trwa, { win, msg } – koniec
    result() {
      const vs = this.vehicles;
      if (!this.level.military) {
        // wszystkie pojazdy (jeden albo konwój) muszą dojechać do flagi
        const lost = vs.find(v => v.fell);
        if (lost) return { win: false, msg: vs.length > 1 ? `Pojazd z konwoju (${lost.spec.name.toLowerCase()}) wpadł do przepaści.` : 'Pojazd wpadł do przepaści.' };
        if (vs.every(v => v.crossed)) return { win: true };
        if (vs.some(v => !v.crossed && v.stillTime > 3)) return { win: false, msg: 'Pojazd utknął.' };
        if (this.time > 60 + 20 * (vs.length - 1)) return { win: false, msg: 'Skończył się czas.' };
        return null;
      }
      const allies = vs.filter(v => v.team === 'ally');
      const enemies = vs.filter(v => v.team === 'enemy');
      const lostAlly = allies.find(v => v.fell);
      if (lostAlly) return { win: false, msg: `${lostAlly.spec.name} sojuszników wpadł do przepaści.` };
      if (enemies.some(v => v.crossed)) return { win: false, msg: 'Wróg przejechał przez most.' };
      if (allies.some(v => !v.crossed && v.stillTime > 3)) return { win: false, msg: 'Pojazd sojuszników utknął.' };
      const stopped = (v) => v.fell || (v.state === 'active' && v.stillTime > 3);
      if (allies.every(v => v.crossed) && enemies.every(stopped)) {
        return { win: true, enemiesFell: enemies.filter(v => v.fell).length, enemies: enemies.length };
      }
      if (this.time > 90) return { win: false, msg: 'Skończył się czas.' };
      return null;
    }

    // Wysadza wszystkie ładunki naraz: zrywa zaminowane elementy i odpycha pobliskie węzły
    detonate() {
      if (this.detonated) return false;
      this.detonated = true;
      const P = this.particles;
      const blasts = [];
      for (const c of this.constraints) {
        if (!c.charge || c.broken) continue;
        const a = P[c.a], b = P[c.b];
        blasts.push([(a.x + b.x) / 2, (a.y + b.y) / 2]);
        this.breakBeam(c, true);
      }
      for (const [x, y] of blasts) {
        this.explosions.push({ x, y, t: this.time });
        for (const p of P) {
          if (p.w === 0) continue;
          const dx = p.x - x, dy = p.y - y;
          const d = Math.hypot(dx, dy);
          if (d > BLAST_RADIUS || d < 1e-6) continue;
          const f = BLAST_SPEED * (1 - d / BLAST_RADIUS);
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }
      return true;
    }
  }

  // ---------- Reguły budowy (wspólne dla gry i narzędzi) ----------
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function distToSeg(px, py, ax, ay, bx, by) {
    const ex = bx - ax, ey = by - ay;
    const l2 = ex * ex + ey * ey;
    let t = l2 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + ex * t), py - (ay + ey * t));
  }
  function onTerrainEdge(level, x, y) {
    for (const poly of level.terrain) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if (distToSeg(x, y, a[0], a[1], b[0], b[1]) < 0.02) return true;
      }
    }
    return false;
  }
  // Punkt we wnętrzu skały (brzeg skały się nie liczy)
  function insideTerrain(level, x, y) {
    if (!level.terrain.some(p => pointInPoly(x, y, p))) return false;
    return !onTerrainEdge(level, x, y);
  }
  const samePt = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  const isAnchor = (level, p) => level.anchors.some(a => samePt(a, p));
  function inBuildArea(level, p) {
    const b = level.build;
    return p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1;
  }
  function validPoint(level, p) {
    return isAnchor(level, p) || (inBuildArea(level, p) && !insideTerrain(level, p[0], p[1]));
  }
  function crossesTerrain(level, a, b) {
    const n = Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) * 6);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (insideTerrain(level, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return true;
    }
    return false;
  }
  // Zwraca opis błędu albo null, gdy element można postawić
  function checkBeam(level, a, b, type) {
    const mat = MATERIALS[type];
    if (samePt(a, b)) return 'Element musi mieć długość';
    if (!validPoint(level, a) || !validPoint(level, b)) return 'Tu nie można postawić węzła';
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > mat.maxLen + 1e-6) return `Za długi element – maks. ${mat.maxLen} m`;
    if (crossesTerrain(level, a, b)) return 'Element nie może przechodzić przez skałę';
    return null;
  }
  function designCost(beams) {
    return Math.round(beams.reduce((s, b) => s + Math.hypot(b.a[0] - b.b[0], b.a[1] - b.b[1]) * MATERIALS[b.type].cost, 0));
  }

  const Geo = { pointInPoly, distToSeg, insideTerrain, isAnchor, inBuildArea, validPoint, crossesTerrain, checkBeam, designCost, samePt };

  global.Physics = { Sim, MATERIALS, VEHICLES, key, Geo };
})(typeof window !== 'undefined' ? window : globalThis);
