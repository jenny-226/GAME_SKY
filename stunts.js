// 스턴트 코스 생성: 램프, 메가 램프, 스카이 링, 드리프트 존, 점프 갭, 착지 목표, 장애물, 코인
import * as THREE from 'three';
import { canvasTexture, rng, smoothstep } from './utils.js';
import { buildCar, MODELS, COLORS } from './cars.js';

export const G = 20;          // 중력 (m/s²)
export const NOMINAL_V = 51;   // 코스 설계 기준 속도
const NOMINAL_L = 1700;        // 갭 길이 계산용 기준 트랙 길이

// 스테이지 계획: 트랙을 만들기 전에 고가 구간/갭 위치를 정한다 (u = 0~1 비율)
export function planStage(recipe, seed = 1) {
  const n = recipe.length;
  const items = recipe.map((type, i) => ({ type, u: 0.07 + 0.86 * (i + 0.5) / n }));
  const gaps = [], lifts = [];
  items.filter(it => it.type === 'gap').forEach(it => {
    const half = 22 / NOMINAL_L;
    gaps.push([it.u - half, it.u + half]);
    lifts.push(it.u);
  });
  const lift = lifts.length ? (u => {
    let h = 0;
    lifts.forEach(c => {
      const a = c - 0.085, b = c + 0.085, ramp = 0.05;
      h = Math.max(h, 10 * smoothstep(a - ramp, a, u) * (1 - smoothstep(b, b + ramp, u)));
    });
    return h;
  }) : null;
  return { items, gaps, lift, seed };
}

// ── 텍스처 ──
const rampTex = () => canvasTexture(256, (g, s) => {
  g.fillStyle = '#ffcf1f'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#1a1a1a';
  for (let i = -s; i < s * 2; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 - s, s); g.lineTo(i - s, s); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let k = 0; k < 2; k++) { const y = 60 + k * 110; g.beginPath(); g.moveTo(s * 0.3, y + 40); g.lineTo(s * 0.5, y); g.lineTo(s * 0.7, y + 40); g.lineTo(s * 0.62, y + 40); g.lineTo(s * 0.5, y + 18); g.lineTo(s * 0.38, y + 40); g.fill(); }
});
const megaTex = () => canvasTexture(256, (g, s) => {
  g.fillStyle = '#ff2f5b'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) { const y = 20 + i * 62; g.beginPath(); g.moveTo(s * 0.2, y + 40); g.lineTo(s * 0.5, y); g.lineTo(s * 0.8, y + 40); g.lineTo(s * 0.68, y + 40); g.lineTo(s * 0.5, y + 16); g.lineTo(s * 0.32, y + 40); g.fill(); }
});
const padTex = () => canvasTexture(256, (g, s) => {
  g.fillStyle = 'rgba(20,230,140,0.55)'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.strokeRect(6, 6, s - 12, s - 12);
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.3, 0, 7); g.stroke();
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.12, 0, 7); g.fillStyle = '#ffffff'; g.fill();
});
const chevronTex = () => canvasTexture(128, (g, s) => {
  g.fillStyle = '#1a0d00'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#ff8a1f';
  g.beginPath(); g.moveTo(0, s * 0.7); g.lineTo(s / 2, s * 0.2); g.lineTo(s, s * 0.7); g.lineTo(s, s * 0.95); g.lineTo(s / 2, s * 0.45); g.lineTo(0, s * 0.95); g.fill();
});
const boostTex = () => canvasTexture(128, (g, s) => {
  g.fillStyle = '#062033'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#39e6ff';
  for (let i = 0; i < 3; i++) { const y = 100 - i * 40; g.beginPath(); g.moveTo(14, y); g.lineTo(64, y - 30); g.lineTo(114, y); g.lineTo(114, y + 14); g.lineTo(64, y - 16); g.lineTo(14, y + 14); g.fill(); }
});

function textSprite(text, color = '#ffffff', bg = 'rgba(0,0,0,0.6)') {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 192);
  g.fillStyle = color; g.font = '900 120px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 100);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true });
}

// 트랙을 따라가는 쐐기형 램프 메쉬
function wedge(track, s0, s1, H, hw, mat, sideMat) {
  const N = 8, pos = [], uv = [], idx = [];
  const ring = [];
  for (let i = 0; i <= N; i++) {
    const s = s0 + (s1 - s0) * (i / N);
    const f = track.frame(s);
    const t = i / N;
    const h = H * (t * t * 0.35 + t * 0.65); // 살짝 휘어진 램프면
    const base = pos.length / 3;
    const L = f.pos.clone().addScaledVector(f.right, -hw), R = f.pos.clone().addScaledVector(f.right, hw);
    const Lt = L.clone().addScaledVector(f.up, h + 0.03), Rt = R.clone().addScaledVector(f.up, h + 0.03);
    [L, R, Lt, Rt].forEach(p => pos.push(p.x, p.y, p.z));
    uv.push(0, t, 1, t, 0, t, 1, t);
    ring.push(base);
  }
  const top = [], side = [];
  for (let i = 0; i < N; i++) {
    const a = ring[i], b = ring[i + 1];
    top.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);      // 윗면
    side.push(a, a + 2, b, a + 2, b + 2, b);                 // 왼쪽 옆
    side.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);     // 오른쪽 옆
  }
  const e = ring[N];
  side.push(e, e + 1, e + 2, e + 1, e + 3, e + 2);           // 끝 면
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex([...top, ...side]);
  geo.addGroup(0, top.length, 0);
  geo.addGroup(top.length, side.length, 1);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, [mat, sideMat]);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// 트랙 위 평평한 띠 (착지 목표, 드리프트 존)
function strip(track, s0, s1, a, b, mat, lift = 0.05) {
  const N = Math.max(2, Math.ceil((s1 - s0) / 4));
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const s = s0 + (s1 - s0) * (i / N);
    const f = track.frame(s);
    const A = f.pos.clone().addScaledVector(f.right, a).addScaledVector(f.up, lift);
    const B = f.pos.clone().addScaledVector(f.right, b).addScaledVector(f.up, lift);
    pos.push(A.x, A.y, A.z, B.x, B.y, B.z);
    uv.push(0, (s - s0) / (b - a), 1, (s - s0) / (b - a));
    if (i < N) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function placeAlong(obj, track, s, d = 0, h = 0) {
  const f = track.frame(s);
  obj.position.copy(f.pos).addScaledVector(f.right, d).addScaledVector(f.up, h);
  const left = f.right.clone().negate();
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, f.up, f.tan));
  return f;
}

// 평평한 곳 찾기 (루프/급경사 피하기)
function flatS(track, s, span) {
  for (let k = 0; k < 30; k++) {
    let ok = true;
    for (let t = -10; t <= span + 10; t += 5) {
      const f = track.frame(s + t);
      if (f.up.y < 0.985 || track.inGap(s + t)) { ok = false; break; }
    }
    if (ok) return s;
    s += 12;
  }
  return null;
}

// ── 스턴트 코스 만들기 ──
export function buildStunts(env, plan, worldId) {
  const track = env.track;
  const L = track.length;
  const hw = track.width / 2 - 0.4;
  const group = new THREE.Group();
  const r = rng(plan.seed * 31 + 7);
  const data = { ramps: [], pads: [], rings: [], drifts: [], boosts: [], obstacles: [], coins: [], gaps: track.skip.slice(), group, finishS: L };

  const mats = {
    ramp: new THREE.MeshStandardMaterial({ map: rampTex(), roughness: 0.6 }),
    mega: new THREE.MeshStandardMaterial({ map: megaTex(), roughness: 0.5, emissive: '#550015', emissiveIntensity: 0.4 }),
    side: new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.8 }),
    pad: new THREE.MeshBasicMaterial({ map: padTex(), transparent: true, depthWrite: false }),
    chevron: new THREE.MeshStandardMaterial({ map: chevronTex(), emissive: '#ff7a10', emissiveIntensity: 0.8, emissiveMap: chevronTex() }),
    boost: new THREE.MeshStandardMaterial({ map: boostTex(), emissive: '#39e6ff', emissiveMap: boostTex(), emissiveIntensity: 1.6 }),
    ring: new THREE.MeshStandardMaterial({ color: '#ffd54a', emissive: '#ffb21a', emissiveIntensity: 1.8, metalness: 0.6, roughness: 0.3 }),
    ringGold: new THREE.MeshStandardMaterial({ color: '#ff5fd2', emissive: '#ff3fb0', emissiveIntensity: 2.2, metalness: 0.5, roughness: 0.3 }),
    cone: new THREE.MeshStandardMaterial({ color: '#ff6a00', roughness: 0.6 }),
    barrier: new THREE.MeshStandardMaterial({ map: canvasTexture(128, (g, s) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e8202a'; g.fillRect(i * s / 8, 0, s / 8, s); } }) }),
  };
  const ringGeo = new THREE.TorusGeometry(4.4, 0.38, 10, 40);

  const addRamp = (s0, len, H, k, mega = false) => {
    const s1 = s0 + len;
    group.add(wedge(track, s0, s1, H, hw, mega ? mats.mega : mats.ramp, mats.side));
    data.ramps.push({ s0, s1, H, k, mega });
    // 예상 착지 지점에 목표 패드
    const vh = NOMINAL_V * k;
    const t = (vh + Math.sqrt(vh * vh + 2 * G * H)) / G;
    const dist = NOMINAL_V * t;
    const p0 = s1 + dist * 0.78, p1 = s1 + dist * 1.15;
    if (!track.inGap(p0) && !track.inGap(p1)) {
      group.add(strip(track, p0, p1, -hw, hw, mats.pad, 0.06));
      data.pads.push({ s0: p0, s1: p1 });
    }
    return { s1, vh, t, dist };
  };
  const addRings = (s0, count, hFn, dFn, mat = mats.ring, spacing = 22) => {
    for (let i = 0; i < count; i++) {
      const s = s0 + i * spacing;
      const h = hFn(i / Math.max(1, count - 1)), d = dFn(i);
      const m = new THREE.Mesh(ringGeo, mat);
      placeAlong(m, track, s, d, h);
      group.add(m);
      data.rings.push({ s, d, h, mesh: m, taken: false });
    }
  };
  const addSign = (s, text, color) => {
    const f = track.frame(s);
    const arch = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: '#22252b', metalness: 0.5 });
    [-1, 1].forEach(sd => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), postMat); p.position.set(sd * (hw + 1.4), 3.5, 0); arch.add(p); });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 3, 1.8), textSprite(text, color));
    board.position.set(0, 6.6, 0); board.rotation.y = Math.PI; arch.add(board);
    placeAlong(arch, track, s);
    group.add(arch);
  };

  plan.items.forEach((it, idx) => {
    let s = it.u * L;
    switch (it.type) {
      case 'ramp': {
        s = flatS(track, s, 100); if (s == null) break;
        addRamp(s, 11, 2.3, 0.42);
        break;
      }
      case 'mega': case 'finale': {
        s = flatS(track, s, 170); if (s == null) break;
        if (it.type === 'finale') addSign(s - 40, '★ SHOWTIME ★', '#ff5fd2');
        const res = addRamp(s, 26, 6.5, 0.66, true);
        // 포물선 경로 위 링
        addRings(res.s1 + res.dist * 0.18, 4, t => {
          const time = res.t * (0.18 + t * 0.55);
          return 6.5 + res.vh * time - 0.5 * G * time * time + 1;
        }, () => 0, it.type === 'finale' ? mats.ringGold : mats.ring, res.dist * 0.55 / 3);
        if (it.type === 'finale') {
          // 랜드마크 방향으로 높이 솟는 링 행렬
          addRings(res.s1 + res.dist * 1.25, 6, t => 8 + Math.sin(t * Math.PI) * 26, i => (i % 2 ? 3 : -3), mats.ringGold, 24);
        }
        break;
      }
      case 'rings': {
        s = flatS(track, s, 160) ?? s;
        addSign(s - 30, 'SKY RINGS ▲ SPACE', '#ffd54a');
        addRings(s, 7, t => 4 + Math.sin(t * Math.PI) * 16, i => Math.sin(i * 1.2) * 4);
        break;
      }
      case 'rings_low': {
        addRings(s, 5, t => 2.8 + Math.sin(t * Math.PI) * 4, i => (i % 2 ? 3.5 : -3.5), mats.ring, 20);
        break;
      }
      case 'drift': {
        const s0 = s, s1 = s + 190;
        group.add(strip(track, s0, s1, hw - 1.1, hw, mats.chevron, 0.05), strip(track, s0, s1, -hw, -hw + 1.1, mats.chevron, 0.05));
        addSign(s0, 'DRIFT ZONE x2', '#ff8a1f');
        data.drifts.push({ s0, s1 });
        break;
      }
      case 'boost': {
        [-1, 0, 1].forEach(k => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 9), mats.boost);
          m.rotation.x = -Math.PI / 2;
          const holder = new THREE.Group(); holder.add(m);
          placeAlong(holder, track, s, k * hw * 0.62, 0.06);
          m.rotation.set(-Math.PI / 2, 0, Math.PI);
          group.add(holder);
          data.boosts.push({ s, d: k * hw * 0.62 });
        });
        break;
      }
      case 'cones': {
        // 지그재그 콘 장벽 (빈 차선을 찾아가거나 점프!)
        for (let row = 0; row < 4; row++) {
          const open = row % 2 ? -1 : 1;
          for (let k = -3; k <= 3; k++) {
            const d = k * (hw / 3.4);
            if (Math.sign(d) === open && Math.abs(d) > hw * 0.35) continue;
            const c = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 10), mats.cone);
            const hold = new THREE.Group(); c.position.y = 0.55; hold.add(c);
            placeAlong(hold, track, s + row * 18, d);
            group.add(hold);
            data.obstacles.push({ s: s + row * 18, d, len: 1, w: 0.9, h: 1.1 });
          }
        }
        break;
      }
      case 'cars': {
        const ids = Object.keys(MODELS);
        for (let i = 0; i < 4; i++) {
          const lane = [-1, 1, 0, -1][i] * hw * 0.55;
          const color = worldId === 'newyork' ? 'gold' : COLORS[(idx * 3 + i * 5) % COLORS.length].id;
          const car = buildCar({ model: worldId === 'newyork' ? 'model3' : ids[(i * 2 + idx) % ids.length], color: worldId === 'newyork' ? 'custom' : color, custom: '#f7c600', wheel: 'aero', spoiler: 'none', stance: 'normal' });
          const ss = s + i * 26;
          placeAlong(car, track, ss, lane);
          group.add(car);
          const spec = car.userData.spec;
          data.obstacles.push({ s: ss, d: lane, len: spec.L, w: spec.W, h: 1.5 });
        }
        break;
      }
      case 'gap': {
        const g = track.skip.find(([a, b]) => Math.abs((a + b) / 2 - s) < 120);
        if (!g) break;
        const [a, b] = g;
        // 갭 앞 킥커 + 끊긴 도로 끝 경고 띠
        addRamp(a - 15, 12, 2.2, 0.48);
        [a, b].forEach((e, i) => {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1, 0.6, 0.5), mats.barrier);
          placeAlong(bar, track, i ? e + 0.3 : e - 0.3, 0, -0.3);
          group.add(bar);
        });
        addSign(a - 70, '⚠ GAP JUMP ⚠', '#ffcf1f');
        data.checkpointsBefore = (data.checkpointsBefore || []).concat([a - 90]);
        break;
      }
      default: break;
    }
  });

  // 고가(점프 갭) 구간 교각
  if (plan.lift) {
    const cols = [];
    for (let s = 0; s < L; s += 12) {
      const f = track.frame(s);
      if (plan.lift(s / L) > 2 && !track.inGap(s)) {
        [-1, 1].forEach(sd => {
          const p = f.pos.clone().addScaledVector(f.right, sd * (hw - 1.5));
          cols.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, (p.y - 1.2) / 2 - 0.6, p.z), new THREE.Quaternion(), new THREE.Vector3(1.6, p.y + 0.2, 1.6)));
        });
      }
    }
    if (cols.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#9a9da3', roughness: 0.8 }), cols.length);
      cols.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true;
      group.add(im);
    }
  }

  // 코인: 비어 있는 구간에 줄지어
  const busy = s => data.ramps.some(rp => s > rp.s0 - 8 && s < rp.s1 + 4) || data.obstacles.some(o => Math.abs(o.s - s) < 6) || track.inGap(s);
  for (let s = 40; s < L - 30; s += 46) {
    const lane = (Math.floor(r() * 3) - 1) * hw * 0.55;
    for (let i = 0; i < 5; i++) {
      const ss = s + i * 4.5;
      if (busy(ss)) continue;
      data.coins.push({ s: ss, d: lane, h: 1.1, taken: false });
    }
  }
  const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20).rotateX(Math.PI / 2);
  data.coinMesh = new THREE.InstancedMesh(coinGeo, new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.25 }), Math.max(1, data.coins.length));
  group.add(data.coinMesh);

  // 결승선
  const fin = strip(track, L - 6, L - 1, -hw, hw, new THREE.MeshBasicMaterial({ map: canvasTexture(128, (g, s) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * s / 8, y * s / 2, s / 8, s / 2); } }) }), 0.07);
  group.add(fin);
  addSign(L - 4, 'FINISH', '#ffffff');

  return data;
}

// 진행 바에 표시할 구간 마커
export function stuntMarkers(data) {
  const L = data.finishS;
  const m = [];
  data.ramps.forEach(r => m.push({ u: r.s0 / L, c: r.mega ? '#ff2f5b' : '#ffcf1f' }));
  data.drifts.forEach(d => m.push({ u: d.s0 / L, c: '#ff8a1f' }));
  data.gaps.forEach(([a]) => m.push({ u: a / L, c: '#ffffff' }));
  const ringGroups = [];
  data.rings.forEach(r => { if (!ringGroups.length || r.s - ringGroups[ringGroups.length - 1] > 60) ringGroups.push(r.s); });
  ringGroups.forEach(s => m.push({ u: s / L, c: '#ffd54a' }));
  return m;
}
