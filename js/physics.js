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
    // tylko w mostach zwodzonych: ciężkie bloki betonu na ogonie skrzydła
    counter: { name: 'Przeciwwaga', cost: 80,  mass: 600,  EA: 5e6, maxT: 60000, maxC: 60000, maxLen: 2,  tensionOnly: false },
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
    // skocznia: motocykl startuje rozpędzony, a punkty nadwozia (kierowca) wykrywają wywrotkę
    moto:   { name: 'Motocykl',    style: 'moto',   wheelbase: 1.5, height: 0.95, r: 0.34, massWheel: 70, massTop: 60, speed: 15, accel: 40, launch: true, rider: true },
  };

  // Statki w mostach zwodzonych. parts: [szerokość, wysokość nad wodą] kolejnych brył
  // (kadłub, nadbudówka, maszt) – razem tworzą obrys, który musi się zmieścić pod mostem.
  const SHIPS = {
    jacht:         { name: 'Jacht',             parts: [[3.2, 1.3], [1.8, 2.4], [0.3, 6]] },
    barka:         { name: 'Barka',             parts: [[4.5, 1.5], [1.6, 3.0], [0.3, 4.5]] },
    statek:        { name: 'Statek pasażerski', parts: [[5, 1.8], [3.6, 4.2], [1.2, 5.6], [0.3, 7]] },
    zaglowiec:     { name: 'Żaglowiec',         parts: [[3.4, 1.5], [2.6, 8.5], [0.35, 10]] },
    kontenerowiec: { name: 'Kontenerowiec',     parts: [[6, 2], [5.2, 4.5], [1.8, 7], [0.4, 8]] },
    holownik:      { name: 'Holownik',          parts: [[3.6, 1.6], [2.2, 3.4], [0.8, 5]] },
    prom:          { name: 'Prom',              parts: [[6, 1.8], [5, 4], [2, 5.5], [0.3, 6.5]] },
  };
  const SHIP_APPROACH = 6;   // s – od pojawienia się statku do wpłynięcia pod most
  const SHIP_PASS = 1.5;     // s – przepływanie przez most (wtedy liczy się kolizja)
  const RAISE_TIME = 4;      // s – pełne podniesienie lub opuszczenie skrzydeł
  const RAISE_ANGLE = 85 * Math.PI / 180;
  const SEAM_MAX = 1.05;     // m – szczelina przykrywana płytą najazdową
  const LOCK_TORQUE = 600;   // kN·m – blokada zaryglowanego skrzydła
  const MOTOR_KP = 100, MOTOR_KD = 20; // regulator napędu (1/s², 1/s)
  const LAND_MAX = 9;        // m/s – największa prędkość uderzenia przy lądowaniu bez wywrotki
  const AIR_MIN = 0.15;      // s – po tylu sekundach w powietrzu kontakt z ziemią to lądowanie
  const AIR_ROT = 1.6;       // rad/s – jak szybko kierowca może obrócić motor w locie

  const SUBSTEPS = 40;
  const JOINT_MASS = 6;
  const BREAK_TAU = 0.04; // s – wygładzanie siły przed sprawdzeniem zerwania
  const BLAST_RADIUS = 2.5; // m – zasięg fali uderzeniowej
  const BLAST_SPEED = 6;    // m/s – prędkość nadawana węzłom tuż przy ładunku

  const key = (x, y) => x + ',' + y;

  class Sim {
    // opts.afterDir: 1 – pojazd po statku jedzie w prawo, -1 – w lewo (mosty zwodzone)
    constructor(level, design, opts) {
      this.level = level;
      this.opts = opts || {};
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
      const convoy = (level.convoy || [{ type: level.vehicle || 'car', team: 'civil' }])
        .map(c => (c.after && this.opts.afterDir ? Object.assign({}, c, { dir: this.opts.afterDir }) : c));
      const specOf = (type) => (type === 'moto' && level.motoSpeed ? Object.assign({}, VEHICLES.moto, { speed: level.motoSpeed }) : VEHICLES[type]);
      this.vehicles = convoy.map((c, i) => ({
        idx: i, type: c.type, team: c.team, spec: specOf(c.type), state: 'waiting',
        parts: null, w1: null, w2: null, rot1: 0, rot2: 0, stillTime: 0,
        crossed: false, fell: false, target: specOf(c.type).speed, after: !!c.after, dir: c.dir || 1,
        crashed: false, crashCause: null, airborne: false, takeoffX: null, jump: 0,
      }));
      if (level.drawbridge) this.initDrawbridge();
      this.spawnVehicles();
    }

    // Most zwodzony: ramiona napędów, płyty najazdowe nad szczelinami i statek
    initDrawbridge() {
      const lv = this.level, P = this.particles;
      this.raise = 0;
      this.raiseTarget = 0;
      this.raiseRate = 0;
      this.motors = [];
      for (const m of lv.motors) {
        const idx = P.findIndex(p => p.key === key(m.x, m.y));
        const arms = [];
        if (idx >= 0) {
          for (const c of this.constraints) {
            if (!c.beam || (c.a !== idx && c.b !== idx)) continue;
            const pi = c.a === idx ? c.b : c.a;
            arms.push({ c, pi, th0: Math.atan2(P[pi].y - m.y, P[pi].x - m.x) });
          }
        }
        // wszystkie ruchome węzły połączone z ramionami – na nie działa moment napędu
        const comp = new Set();
        const stack = arms.map(a => a.pi);
        while (stack.length) {
          const i = stack.pop();
          if (comp.has(i) || P[i].fixed) continue;
          comp.add(i);
          for (const c of this.constraints) {
            if (!c.beam) continue;
            if (c.a === i) stack.push(c.b);
            else if (c.b === i) stack.push(c.a);
          }
        }
        const compList = [...comp];
        const th0 = compList.map(i => Math.atan2(P[i].y - m.y, P[i].x - m.x));
        this.motors.push({ x: m.x, y: m.y, dir: m.dir, arms, comp: compList, th0, load: 0 });
      }

      // Płyty najazdowe: końce jezdni oddalone o ok. 1 m od innego końca jezdni lub krawędzi brzegu
      const deg = new Map();
      for (const c of this.constraints) {
        if (c.type !== 'road') continue;
        deg.set(c.a, (deg.get(c.a) || 0) + 1);
        deg.set(c.b, (deg.get(c.b) || 0) + 1);
      }
      const ends = [...deg].filter(([i, d]) => d === 1 && !P[i].fixed).map(([i]) => i);
      const linked = (i, j) => this.constraints.some(c => (c.a === i && c.b === j) || (c.a === j && c.b === i));
      this.seams = [];
      for (let i = 0; i < ends.length; i++) {
        for (let j = i + 1; j < ends.length; j++) {
          const a = P[ends[i]], b = P[ends[j]];
          if (Math.hypot(a.x - b.x, a.y - b.y) <= SEAM_MAX && !linked(ends[i], ends[j])) this.seams.push({ a: ends[i], b: ends[j] });
        }
        for (const sp of lv.seamPoints || []) {
          const a = P[ends[i]];
          if (Math.hypot(a.x - sp[0], a.y - sp[1]) <= SEAM_MAX) this.seams.push({ a: ends[i], sx: sp[0], sy: sp[1] });
        }
      }

      // Oparcia: węzły leżące dokładnie na krawędzi studni lub brzegu opierają się na niej,
      // dopóki most jest opuszczony (przy podnoszeniu odrywają się)
      this.bearings = [];
      P.forEach((p, i) => {
        if (p.fixed || !p.key) return;
        if ((lv.seamPoints || []).some(sp => Math.abs(sp[0] - p.x) < 0.01 && Math.abs(sp[1] - p.y) < 0.01)) this.bearings.push({ i, y: p.y });
      });

      const ship = SHIPS[lv.ship];
      this.ship = {
        type: lv.ship, spec: ship, state: 'waiting', t: 0, x: lv.shipX,
        rects: ship.parts.map(([w, h]) => ({ x0: lv.shipX - w / 2, x1: lv.shipX + w / 2, y0: lv.water - 0.3, y1: lv.water + h })),
      };
    }

    seamEnds(sm) {
      const P = this.particles;
      const a = P[sm.a];
      const b = sm.b != null ? P[sm.b] : null;
      return [a.x, a.y, b ? b.x : sm.sx, b ? b.y : sm.sy, a, b];
    }

    updateShip(dt) {
      const ship = this.ship;
      if (ship.state === 'waiting') {
        if (this.vehicles.filter(v => !v.after).every(v => v.crossed)) { ship.state = 'approach'; ship.t = 0; }
        return;
      }
      ship.t += dt;
      if (ship.state === 'approach' && ship.t >= SHIP_APPROACH) { ship.state = 'passing'; ship.t = 0; }
      else if (ship.state === 'passing') {
        if (this.shipHits()) { ship.state = 'crashed'; ship.t = 0; }
        else if (ship.t >= SHIP_PASS) { ship.state = 'passed'; ship.t = 0; }
      }
    }

    // Czy jakikolwiek element mostu wchodzi w obrys statku
    shipHits() {
      const P = this.particles;
      for (const c of this.constraints) {
        if (c.broken || c.type === 'car') continue;
        const a = P[c.a], b = P[c.b];
        for (const r of this.ship.rects) if (segRect(a.x, a.y, b.x, b.y, r, 0.12)) return true;
      }
      return false;
    }

    // Napęd zawiasu: regulator dąży do zadanego kąta skrzydła, przykładając moment obrotowy
    // do wszystkich węzłów skrzydła. Moment jest ograniczony (słaby napęd wymaga przeciwwagi).
    solveMotors(h) {
      const P = this.particles;
      const t = this.raise;
      const ang = RAISE_ANGLE * t * t * (3 - 2 * t);
      // Opuszczony albo w pełni podniesiony most jest zaryglowany; słaby napęd działa tylko w ruchu
      const moving = this.raiseTarget !== (this.raise > 0.5 ? 1 : 0) || (this.raise > 0.001 && this.raise < 0.999);
      const torque = (moving ? this.level.torque || 600 : LOCK_TORQUE) * 1000;
      for (const m of this.motors) {
        // kąt skrzydła: średni obrót wszystkich jego węzłów (ważony bezwładnością)
        let errSum = 0, wsum = 0;
        m.comp.forEach((i, j) => {
          const p = P[i];
          if (p.w === 0) return;
          const dx = p.x - m.x, dy = p.y - m.y;
          const r2 = dx * dx + dy * dy;
          let dth = m.th0[j] + m.dir * ang - Math.atan2(dy, dx);
          dth = Math.atan2(Math.sin(dth), Math.cos(dth));
          errSum += p.m * r2 * dth;
          wsum += p.m * r2;
        });
        if (!wsum) { m.load = 0; continue; }
        const err = errSum / wsum;
        let I = 0, L = 0;
        for (const i of m.comp) {
          const p = P[i];
          if (p.w === 0) continue;
          const rx = p.x - m.x, ry = p.y - m.y;
          I += p.m * (rx * rx + ry * ry);
          L += p.m * (rx * p.vy - ry * p.vx);
        }
        if (!I) { m.load = 0; continue; }
        const omega = L / I;
        const cmd = I * (MOTOR_KP * err + MOTOR_KD * (m.dir * this.raiseRate - omega));
        const tau = Math.max(-torque, Math.min(torque, cmd));
        m.load = Math.min(1, Math.abs(cmd) / torque);
        // moment przekazywany przez ramiona przy zawiasie (siły prostopadłe do ramion)
        let r2sum = 0;
        for (const arm of m.arms) {
          if (arm.c.broken) continue;
          const p = P[arm.pi];
          r2sum += (p.x - m.x) ** 2 + (p.y - m.y) ** 2;
        }
        if (!r2sum) continue;
        for (const arm of m.arms) {
          if (arm.c.broken) continue;
          const p = P[arm.pi];
          if (p.w === 0) continue;
          const k = (tau / r2sum) * h * p.w;
          p.vx += -(p.y - m.y) * k;
          p.vy += (p.x - m.x) * k;
        }
      }
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
      const s = v.spec, d = v.dir;
      const w1 = this.addParticle(sx, sy + s.r, s.massWheel, s.r);
      const w2 = this.addParticle(sx + d * s.wheelbase, sy + s.r, s.massWheel, s.r);
      const t1 = this.addParticle(sx + d * 0.2, sy + s.r + s.height, s.massTop);
      const t2 = this.addParticle(sx + d * (s.wheelbase - 0.2), sy + s.r + s.height, s.massTop);
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
      if (s.launch) for (const p of parts) p.vx = d * s.speed;
      if (s.rider) for (const p of [t1, t2]) { p.r = 0.24; p.sensor = true; }
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
        if (v.after && (!this.ship || this.ship.state !== 'passed' || this.raise > 0.02)) return;
        const enemy = v.team === 'enemy';
        if (enemy && prev && prev.team !== 'enemy') {
          if (!prev.w2 || prev.w2.x < lv.enemyTrigger) return;
        }
        const back = v.dir < 0;
        const sx = back ? lv.startR.x : enemy ? lv.enemyStart : lv.start.x;
        const clear = this.vehicles.every(o => o.state !== 'active' || o.fell || (back
          ? Math.min(Math.abs(o.w1.x - sx), Math.abs(o.w2.x - sx)) > v.spec.wheelbase + 4
          : Math.min(o.w1.x, o.w2.x) - o.spec.r > sx + v.spec.wheelbase + v.spec.r + 2.5 ||
            Math.max(o.w1.x, o.w2.x) < sx - 3));
        if (!clear) return;
        this.placeVehicle(v, sx, back ? lv.startR.y : lv.start.y);
      }
    }

    step(dt) {
      this.spawnVehicles();
      this.updateTargets();
      const h = dt / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) this.substep(h);
      this.time += dt;

      const lv = this.level;
      if (lv.drawbridge) {
        // przeciążony napęd stoi w miejscu – skrzydło nie podnosi się dalej
        this.motorStall = this.motors.some(m => m.load >= 0.999) && this.raise > 0 && this.raise < 1;
        const rate = this.motorStall ? 0 : dt / RAISE_TIME;
        const before = this.raise;
        this.raise += Math.max(-rate, Math.min(rate, this.raiseTarget - this.raise));
        const t = this.raise;
        this.raiseRate = RAISE_ANGLE * 6 * t * (1 - t) * ((this.raise - before) / dt);
        this.updateShip(dt);
      }
      for (const v of this.vehicles) {
        if (v.state !== 'active') continue;
        const r = v.spec.r;
        v.rot1 -= (v.w1.vx * dt) / r;
        v.rot2 -= (v.w2.vx * dt) / r;
        const speed = Math.hypot(v.w1.vx, v.w1.vy);
        v.stillTime = speed < (v.spec.rider ? 0.4 : 0.15) && Math.abs(v.target) > 0.5 ? v.stillTime + dt : 0;
        if (!v.fell && v.parts.some(p => p.y < lv.water + 0.4)) v.fell = true;
        // pozycja tylnego koła względem mety w kierunku jazdy
        const past = v.dir > 0 ? Math.min(v.w1.x, v.w2.x) - lv.finish : lv.finishL - Math.max(v.w1.x, v.w2.x);
        if (!v.fell && past > 0) v.crossed = true;
        // za metą pojazd zatrzymuje się poza ekranem
        if (past > 7 || v.parts.every(p => p.dead)) {
          v.state = 'done';
          for (const p of v.parts) { p.w = 0; p.vx = p.vy = 0; }
        }
      }
    }

    // Pojazd zwalnia, gdy przed nim jest inny pojazd
    updateTargets() {
      for (const v of this.vehicles) {
        if (v.state !== 'active') continue;
        const d = v.dir;
        const front = d > 0 ? Math.max(v.w1.x, v.w2.x) + v.spec.r : Math.min(v.w1.x, v.w2.x) - v.spec.r;
        let gap = Infinity;
        for (const o of this.vehicles) {
          if (o === v || o.state !== 'active' || o.fell || o.dir !== d) continue;
          const rear = d > 0 ? Math.min(o.w1.x, o.w2.x) - o.spec.r : Math.max(o.w1.x, o.w2.x) + o.spec.r;
          const g = d * (rear - front);
          if (g > -0.5 && Math.abs(o.w1.y - v.w1.y) < 4) gap = Math.min(gap, g);
        }
        v.target = d * (gap < 1.2 ? 0 : gap < 3 ? v.spec.speed * (gap - 1.2) / 1.8 : v.spec.speed);
      }
    }

    substep(h) {
      const P = this.particles;
      const ih2 = 1 / (h * h);

      // prędkość motocykla przed krokiem (do płynnego prowadzenia po rampie)
      for (const v of this.vehicles) {
        if (v.state === 'active' && v.spec.rider) v.preSpeed = Math.hypot((v.w1.vx + v.w2.vx) / 2, (v.w1.vy + v.w2.vy) / 2);
      }

      // w mostach zwodzonych grawitacja narasta przez pierwsze pół sekundy (bez wstrząsu na starcie)
      const g = this.level.drawbridge ? G * Math.min(1, this.time / 0.5) : G;
      for (const p of P) {
        if (p.w === 0) continue;
        p.vy += g * h;
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

      if (this.bearings && this.raiseTarget === 0 && this.raise < 0.02) {
        for (const b of this.bearings) { const p = P[b.i]; if (p.y < b.y) p.y += Math.min(b.y - p.y, 0.0005); }
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

      if (this.motors) this.solveMotors(h);

      // Płynne prowadzenie: gdy koła toczą się po rampie (nie lądują), załamania jezdni zmieniają
      // kierunek jazdy motocykla, ale nie zabierają mu prędkości
      for (const v of this.vehicles) {
        if (v.state !== 'active' || !v.spec.rider || v.crashed) continue;
        if (!v.w1.contact && !v.w2.contact) continue;
        if ((v.w1.air || 0) > AIR_MIN || (v.w2.air || 0) > AIR_MIN) continue;
        const sp = Math.hypot((v.w1.vx + v.w2.vx) / 2, (v.w1.vy + v.w2.vy) / 2);
        if (sp > 0.5 && sp < v.preSpeed) {
          const k = Math.min(1.5, v.preSpeed / sp);
          for (const p of v.parts) { p.vx *= k; p.vy *= k; }
        }
      }

      // Motocykl w powietrzu: kierowca balansuje ciałem i powoli ustawia motor zgodnie z torem lotu
      for (const v of this.vehicles) {
        if (v.state !== 'active' || !v.spec.rider || v.crashed) continue;
        if ((v.w1.air || 0) < 0.05 || (v.w2.air || 0) < 0.05) continue;
        const cx = (v.w1.x + v.w2.x) / 2, cy = (v.w1.y + v.w2.y) / 2;
        const vx = (v.w1.vx + v.w2.vx) / 2, vy = (v.w1.vy + v.w2.vy) / 2;
        const ang = Math.atan2(v.w2.y - v.w1.y, v.w2.x - v.w1.x);
        const lim = 0.6;
        const target = Math.max(-lim, Math.min(lim, Math.atan2(vy, Math.abs(vx)) * Math.sign(vx || 1)));
        let d = Math.atan2(Math.sin(target - ang), Math.cos(target - ang));
        const maxRate = AIR_ROT * h;
        d = Math.max(-maxRate, Math.min(maxRate, d));
        const c = Math.cos(d), sn = Math.sin(d);
        for (const p of v.parts) {
          const rx = p.x - cx, ry = p.y - cy;
          p.x = cx + rx * c - ry * sn;
          p.y = cy + rx * sn + ry * c;
        }
      }

      // Motocykl: kierowca dotknął ziemi albo lądowanie było za twarde → wywrotka
      for (const v of this.vehicles) {
        if (v.state !== 'active' || !v.spec.rider) continue;
        if (!v.crashed && (v.t1.contact || v.t2.contact)) { v.crashed = true; v.crashCause = 'rider'; }
        for (const wh of [v.w1, v.w2]) {
          if (wh.contact) {
            if (!v.crashed && (wh.air || 0) > AIR_MIN && wh.impact > LAND_MAX) { v.crashed = true; v.crashCause = 'landing'; }
            wh.air = 0;
          } else wh.air = (wh.air || 0) + h;
        }
        const inAir = !v.w1.contact && !v.w2.contact && !v.t1.contact && !v.t2.contact;
        if (inAir && !v.airborne && v.w1.air > AIR_MIN) { v.airborne = true; v.takeoffX = Math.max(v.w1.x, v.w2.x); }
        if (!inAir && v.airborne) { v.airborne = false; v.jump = Math.max(v.jump, Math.min(v.w1.x, v.w2.x) - v.takeoffX); }
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
        const touching = v.spec.rider ? [v.w1, v.w2, v.t1, v.t2] : [v.w1, v.w2];
        for (const wh of touching) {
          if (wh.w === 0) continue;
          wh.impact = 0;
          for (const s of this.segments) this.contact(wh, s[0], s[1], s[2], s[3], null, null);
          for (const c of this.constraints) {
            if (c.broken || c.type !== 'road' || c.half) continue;
            const a = P[c.a], b = P[c.b];
            this.contact(wh, a.x, a.y, b.x, b.y, a, b);
          }
          if (this.seams) {
            for (const sm of this.seams) {
              const [ax, ay, bx, by, pa, pb] = this.seamEnds(sm);
              if (Math.hypot(ax - bx, ay - by) < 1.4) this.contact(wh, ax, ay, bx, by, pa, pb);
            }
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
      // prędkość zderzenia wzdłuż normalnej (prędkość z poprzedniego kroku)
      const vn = -(wh.vx * nx + wh.vy * ny);
      if (vn > (wh.impact || 0)) wh.impact = vn;
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
      if (this.level.jump) {
        const v = vs[0];
        const jump = Math.max(v.jump, v.airborne ? Math.min(v.w1.x, v.w2.x) - v.takeoffX : 0);
        if (v.fell) return { win: false, msg: 'Motocyklista spadł w przepaść.', reason: 'fell', jump };
        const landed = Math.min(v.w1.x, v.w2.x) > this.level.landX;
        // wynik dopiero po wylądowaniu za metą (motocykl nie może być w locie)
        const onGround = (v.w1.air || 0) < AIR_MIN && (v.w2.air || 0) < AIR_MIN;
        if (v.crossed && (onGround || v.crashed)) return { win: true, clean: !v.crashed, cause: v.crashCause, jump };
        if (v.stillTime > 2 || this.time > 30) {
          return landed ? { win: true, clean: false, cause: v.crashCause || 'stopped', jump }
            : { win: false, msg: 'Motocyklista nie przeskoczył przepaści.', reason: 'short', jump };
        }
        return null;
      }
      if (this.level.drawbridge) {
        const lost = vs.find(v => v.fell);
        if (lost) return { win: false, msg: `Pojazd (${lost.spec.name.toLowerCase()}) wpadł do wody.`, reason: 'fell' };
        if (this.ship.state === 'crashed') return { win: false, msg: `${this.ship.spec.name} uderzył w most.`, reason: 'ship' };
        if (this.ship.state === 'passed' && this.ship.t > 20 && vs.some(v => v.after && v.state === 'waiting')) {
          return { win: false, msg: 'Ostatni pojazd nie mógł wjechać – most nie został opuszczony.', reason: 'notLowered' };
        }
        if (vs.some(v => !v.crossed && v.stillTime > 3)) return { win: false, msg: 'Pojazd utknął.' };
        if (vs.every(v => v.crossed) && this.ship.state === 'passed' && this.ship.t > 1) return { win: true };
        if (this.time > 150) return { win: false, msg: 'Skończył się czas.' };
        return null;
      }
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

  // Czy odcinek przecina prostokąt powiększony o margines (algorytm Lianga–Barsky’ego)
  function segRect(ax, ay, bx, by, r, m) {
    const x0 = r.x0 - m, x1 = r.x1 + m, y0 = r.y0 - m, y1 = r.y1 + m;
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    const clip = (p, q) => {
      if (p === 0) return q >= 0;
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
      return true;
    };
    return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay);
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

  global.Physics = { Sim, MATERIALS, VEHICLES, SHIPS, key, Geo, DRAW: { SHIP_APPROACH, SHIP_PASS, RAISE_TIME } };
})(typeof window !== 'undefined' ? window : globalThis);
