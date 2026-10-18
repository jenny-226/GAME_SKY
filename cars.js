// 테슬라 차량 모델 (실제 치수와 옆모습 실루엣 기반으로 만든 3D 모델)
// 같은 폴더에 <id>.glb 파일(예: model3.glb)을 넣으면 그 3D 모델을 대신 사용한다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { smoothstep } from './utils.js';

// 길이 L, 폭 W, 축거 wb, 앞/뒤 오버행 비율, 바퀴 반지름, 실루엣(뒤→앞, x는 0~1 비율, y는 m)
export const MODELS = {
  model3: {
    name: 'Model 3', sub: 'Highland', L: 4.72, W: 1.85, wb: 2.875, rear: 0.205, r: 0.34,
    glass: [0.2, 0.73], belt: 0.98, lightbar: false, stats: [82, 86, 80],
    top: [[0, 0.3], [0, 0.56], [0.008, 0.8], [0.03, 0.98], [0.11, 1.02], [0.21, 1.12], [0.33, 1.34], [0.43, 1.43], [0.52, 1.44], [0.6, 1.38], [0.67, 1.2], [0.73, 1.0], [0.85, 0.9], [0.95, 0.78], [0.993, 0.6], [1, 0.42], [0.99, 0.28]],
  },
  modelS: {
    name: 'Model S', sub: 'Plaid', L: 4.97, W: 1.96, wb: 2.96, rear: 0.2, r: 0.35,
    glass: [0.18, 0.73], belt: 0.99, lightbar: false, stats: [97, 84, 86],
    top: [[0, 0.32], [0, 0.62], [0.01, 0.88], [0.035, 1.0], [0.1, 1.04], [0.19, 1.15], [0.31, 1.34], [0.42, 1.43], [0.52, 1.44], [0.6, 1.39], [0.67, 1.22], [0.73, 1.02], [0.86, 0.9], [0.95, 0.78], [0.995, 0.62], [1, 0.42], [0.99, 0.28]],
  },
  modelY: {
    name: 'Model Y', sub: 'Juniper', L: 4.79, W: 1.92, wb: 2.89, rear: 0.215, r: 0.37,
    glass: [0.17, 0.73], belt: 1.08, lightbar: true, stats: [76, 78, 80],
    top: [[0, 0.34], [0, 0.68], [0.01, 0.95], [0.04, 1.1], [0.1, 1.2], [0.2, 1.42], [0.3, 1.56], [0.4, 1.61], [0.52, 1.62], [0.6, 1.55], [0.67, 1.33], [0.73, 1.1], [0.86, 0.98], [0.95, 0.84], [0.995, 0.66], [1, 0.44], [0.99, 0.3]],
  },
  modelX: {
    name: 'Model X', sub: 'Falcon Wing', L: 5.06, W: 2.0, wb: 2.97, rear: 0.21, r: 0.38,
    glass: [0.15, 0.76], belt: 1.1, lightbar: false, stats: [84, 72, 82],
    top: [[0, 0.36], [0, 0.72], [0.01, 1.0], [0.04, 1.16], [0.12, 1.32], [0.24, 1.6], [0.36, 1.68], [0.5, 1.68], [0.6, 1.62], [0.68, 1.4], [0.76, 1.12], [0.87, 1.0], [0.95, 0.86], [0.995, 0.68], [1, 0.46], [0.99, 0.32]],
  },
  roadster: {
    name: 'Roadster', sub: '2nd Gen', L: 4.3, W: 1.98, wb: 2.6, rear: 0.2, r: 0.35,
    glass: [0.3, 0.72], belt: 0.9, lightbar: false, stats: [100, 92, 88],
    top: [[0, 0.3], [0, 0.55], [0.01, 0.78], [0.05, 0.9], [0.15, 0.94], [0.27, 1.02], [0.38, 1.14], [0.47, 1.19], [0.54, 1.18], [0.62, 1.08], [0.72, 0.88], [0.85, 0.76], [0.95, 0.64], [0.995, 0.48], [1, 0.36], [0.99, 0.24]],
  },
  cybercab: {
    name: 'Cybercab', sub: 'Robotaxi', L: 4.25, W: 1.95, wb: 2.75, rear: 0.17, r: 0.36,
    glass: [0.14, 0.77], belt: 0.98, lightbar: true, stats: [70, 82, 84],
    top: [[0, 0.34], [0, 0.62], [0.02, 0.9], [0.09, 1.1], [0.22, 1.3], [0.36, 1.4], [0.5, 1.42], [0.6, 1.38], [0.69, 1.22], [0.77, 0.98], [0.88, 0.84], [0.96, 0.72], [1, 0.56], [1, 0.4], [0.99, 0.3]],
  },
  cybertruck: {
    name: 'Cybertruck', sub: 'Cyberbeast', L: 5.68, W: 2.2, wb: 3.66, rear: 0.17, r: 0.43,
    glass: [0.33, 0.7], belt: 1.28, lightbar: true, angular: true, stats: [90, 70, 92],
    top: [[0, 0.52], [0, 1.3], [0.47, 1.79], [0.985, 1.07], [1, 1.02], [1, 0.58]],
  },
};

// 테슬라 순정 컬러 + 커스텀 컬러
export const COLORS = [
  { id: 'pearl', name: 'Pearl White', hex: '#e6e6e2', metal: 0.2 },
  { id: 'black', name: 'Diamond Black', hex: '#0d0e10', metal: 0.5 },
  { id: 'stealth', name: 'Stealth Grey', hex: '#4a4d52', metal: 0.5 },
  { id: 'quick', name: 'Quicksilver', hex: '#a9abae', metal: 0.85 },
  { id: 'red', name: 'Ultra Red', hex: '#b3121b', metal: 0.45 },
  { id: 'blue', name: 'Deep Blue', hex: '#16357a', metal: 0.7 },
  { id: 'steel', name: 'Stainless', hex: '#b8bcc0', metal: 1.0, rough: 0.42 },
  { id: 'gold', name: 'Cyber Gold', hex: '#c9a45c', metal: 0.9 },
  { id: 'orange', name: 'Sunset Orange', hex: '#ef6a12', metal: 0.4 },
  { id: 'lime', name: 'Volt Green', hex: '#5fd13a', metal: 0.4 },
  { id: 'pink', name: 'Hot Pink', hex: '#e9338f', metal: 0.4 },
  { id: 'purple', name: 'Royal Purple', hex: '#7a2fd6', metal: 0.6 },
];

export const WHEELS = [
  { id: 'aero', name: '에어로' },
  { id: 'sport', name: '스포츠' },
  { id: 'turbine', name: '터빈' },
  { id: 'cyber', name: '사이버' },
];
export const SPOILERS = [
  { id: 'none', name: '없음' },
  { id: 'lip', name: '립' },
  { id: 'wing', name: 'GT 윙' },
];
export const STANCES = [
  { id: 'normal', name: '기본', dy: 0 },
  { id: 'low', name: '로우', dy: -0.06 },
  { id: 'lift', name: '리프트', dy: 0.1 },
];

const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0c10, metalness: 0.3, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.9 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.55, metalness: 0.2 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 2.2 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 2.0 });
const brakeMat = new THREE.MeshStandardMaterial({ color: 0xc11919, roughness: 0.4 });
const discMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.9, roughness: 0.35 });

export function paintMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color.hex), metalness: color.metal ?? 0.5,
    roughness: color.rough ?? 0.28, clearcoat: color.id === 'steel' ? 0 : 1, clearcoatRoughness: 0.06,
  });
}

// ── 차체 형상 (단면을 길이 방향으로 이어 붙인 매끈한 곡면) ──
function makeProfile(spec) {
  const L = spec.L;
  const top = spec.top;
  // 위쪽 외곽선 (x 증가 순)
  let env = top.slice(1, -1).map(([fx, y]) => new THREE.Vector2(fx * L, y));
  let pts = spec.angular ? env : new THREE.SplineCurve(env).getPoints(400);
  for (let i = 1; i < pts.length; i++) if (pts[i].x <= pts[i - 1].x) pts[i] = new THREE.Vector2(pts[i - 1].x + 1e-4, pts[i].y);
  const topY = x => {
    if (x <= pts[0].x) return pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i].x) { const k = (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x); return pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k; }
    }
    return pts[pts.length - 1].y;
  };
  const xr = L * spec.rear, xf = xr + spec.wb;
  const arch = spec.r + (spec.angular ? 0.1 : 0.06);
  const floor = spec.floor ?? spec.r * 0.5 + 0.02;
  const rearB = top[0][1], frontB = top[top.length - 1][1];
  const bottomY = x => {
    let y = floor;
    const a = smoothstep(0, 0.13 * L, x), b = smoothstep(L, L * 0.88, x);
    y = rearB + (y - rearB) * a;
    y = frontB + (y - frontB) * b;
    [xr, xf].forEach(c => {
      const d = Math.abs(x - c);
      if (d < arch) y = Math.max(y, spec.r + Math.sqrt(arch * arch - d * d));
    });
    return y;
  };
  const plan = x => {
    if (spec.angular) return 1;
    let f = 1;
    const rf = L * 0.2, rr = L * 0.11;
    if (x > L - rf) { const t = (x - (L - rf)) / rf; f *= 0.22 + 0.78 * Math.pow(Math.max(0, 1 - t * t), 0.6); }
    if (x < rr) { const t = (rr - x) / rr; f *= 0.42 + 0.58 * Math.sqrt(Math.max(0, 1 - t * t)); }
    return f;
  };
  return { topY, bottomY, plan, xr, xf, arch, L };
}

const LOWER = 10, UPPER = 12, HALF = LOWER + UPPER; // 반쪽 단면 점 개수

// x 위치의 반쪽 단면: 바닥 중앙 → 옆면 → 어깨선 → 지붕 중앙  [z, y]
function section(spec, prof, x) {
  const W = spec.W;
  const yb = prof.bottomY(x);
  let yt = Math.max(prof.topY(x), yb + 0.06);
  const wl = (W / 2) * prof.plan(x);
  let ys = Math.min(spec.belt, yt - 0.07);
  if (ys < yb + 0.04) ys = yb + (yt - yb) * 0.55;
  const out = [[0, yb], [wl * 0.55, yb], [wl * 0.86, yb + 0.004]];
  for (let i = 0; i < 7; i++) {
    const s = (i + 1) / 7;
    const y = yb + (ys - yb) * s;
    const z = spec.angular ? wl * (1 - 0.015 * s) : wl * (0.9 + 0.1 * Math.sin(Math.PI * (0.12 + 0.76 * s)));
    out.push([z, y]);
  }
  const zs = out[out.length - 1][0];
  const h = yt - ys;
  if (spec.angular) {
    // 사이버트럭: 평평한 면
    for (let j = 1; j <= UPPER; j++) {
      const t = j / UPPER;
      if (t < 0.75) { const k = t / 0.75; out.push([zs + (zs * 0.84 - zs) * k, ys + (h - 0.03) * k]); }
      else { const k = (t - 0.75) / 0.25; out.push([zs * 0.84 * (1 - k), yt - 0.03 + 0.03 * k]); }
    }
  } else {
    const tumble = 0.3 * Math.min(1, h / 0.42);
    const p = 3.2, e = 2 / p;
    for (let j = 1; j <= UPPER; j++) {
      const th = (j / UPPER) * Math.PI / 2;
      const c = Math.pow(Math.cos(th), e), s = Math.pow(Math.sin(th), e);
      out.push([zs * c * (1 - tumble * s), ys + h * s]);
    }
  }
  out.ys = ys; out.yt = yt;
  return out;
}

// 차체 표면에서 (x, y) 지점의 폭(z)
function surfZ(spec, prof, x, y) {
  const s = section(spec, prof, x);
  for (let i = 1; i < s.length; i++) {
    const [z0, y0] = s[i - 1], [z1, y1] = s[i];
    if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && y1 !== y0) return z0 + (z1 - z0) * (y - y0) / (y1 - y0);
  }
  return 0;
}

function buildBodyGeometry(spec, prof) {
  const L = spec.L, N = 150;
  const ringN = HALF * 2 - 2;
  const pos = [], idx = [];
  const xs = [], sections = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const x = L * (0.5 - 0.5 * Math.cos(Math.PI * u));
    xs.push(x);
    const s = section(spec, prof, x);
    sections.push(s);
    const ring = s.slice(0, HALF).concat(s.slice(1, HALF - 1).reverse().map(([z, y]) => [-z, y]));
    ring.forEach(([z, y]) => pos.push(x, y, z));
  }
  // 재질 그룹: 0 차체, 1 유리, 2 블랙 트림
  const groups = [[], [], []];
  const [g0, g1] = spec.glass;
  const ringIsUpper = j => {
    const k = j < HALF ? j : ringN - j; // 반쪽 인덱스
    return k >= LOWER - 1;
  };
  const ringK = j => (j < HALF ? j : ringN - j);
  for (let i = 0; i < N - 1; i++) {
    const xc = (xs[i] + xs[i + 1]) / 2;
    const s = sections[i];
    const h = s.yt - s.ys;
    const inGlass = xc > g0 * L && xc < g1 * L && h > 0.16;
    for (let j = 0; j < ringN; j++) {
      const jn = (j + 1) % ringN;
      const a = i * ringN + j, b = (i + 1) * ringN + j, c = (i + 1) * ringN + jn, d = i * ringN + jn;
      let g = 0;
      if (inGlass && ringIsUpper(j) && ringIsUpper(jn)) {
        const k = Math.min(ringK(j), ringK(jn));
        g = k === LOWER - 1 ? 2 : 1;
      }
      groups[g].push(a, b, d, b, c, d);
    }
  }
  // 앞뒤 마감
  const capStart = pos.length / 3;
  [0, N - 1].forEach((i, n) => {
    const base = pos.length / 3;
    let cy = 0;
    for (let j = 0; j < ringN; j++) { const o = (i * ringN + j) * 3; pos.push(pos[o], pos[o + 1], pos[o + 2]); cy += pos[o + 1]; }
    pos.push(xs[i], cy / ringN, 0);
    const c = base + ringN;
    for (let j = 0; j < ringN; j++) {
      const p = base + j, q = base + ((j + 1) % ringN);
      if (n === 0) groups[0].push(c, p, q); else groups[0].push(c, q, p);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const all = [];
  groups.forEach((g, gi) => { geo.addGroup(all.length, g.length, gi); all.push(...g); });
  geo.setIndex(all);
  geo.computeVertexNormals();
  return geo;
}

// 차체 표면을 따라가는 띠 (라이트바 등)
function surfaceStrip(spec, prof, y, end, width, mat, thick = 0.035) {
  const L = spec.L;
  const zmax = surfZ(spec, prof, end > 0 ? L * 0.9 : L * 0.08, y) * width;
  const pts = [];
  for (let k = -12; k <= 12; k++) {
    const z = (k / 12) * zmax;
    let x = end > 0 ? L : 0;
    const step = end > 0 ? -0.01 : 0.01;
    for (let n = 0; n < 200; n++) { if (surfZ(spec, prof, x, y) >= Math.abs(z)) break; x += step; }
    pts.push(new THREE.Vector3(x + (end > 0 ? 0.008 : -0.008), y, z));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, thick / 2, 6), mat);
}

function buildWheel(spec, style, paintMat) {
  const r = spec.r, w = spec.angular ? 0.32 : 0.26;
  const g = new THREE.Group();
  const sp = new THREE.Group();
  g.add(sp);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 36, 1), tireMat);
  tire.rotation.x = Math.PI / 2;
  tire.castShadow = true;
  sp.add(tire);
  const side = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, r * 0.14, 10, 36), tireMat);
  side.position.z = w / 2 - 0.02;
  sp.add(side);
  const rimR = r * 0.74;
  const rimFace = new THREE.Group();
  rimFace.position.z = w / 2 - 0.01;
  sp.add(rimFace);
  const rimMat = style === 'sport'
    ? new THREE.MeshStandardMaterial({ color: 0x2a2b2e, metalness: 0.8, roughness: 0.3 })
    : new THREE.MeshStandardMaterial({ color: 0xc9cbce, metalness: 0.9, roughness: 0.25 });
  if (style === 'aero') {
    // 테슬라 에어로 커버: 평평한 원판 + 5개 홈
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, 0.04, 40), new THREE.MeshStandardMaterial({ color: 0x9da0a4, metalness: 0.7, roughness: 0.35 }));
    disc.rotation.x = Math.PI / 2; rimFace.add(disc);
    for (let i = 0; i < 5; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(rimR * 0.55, 0.06, 0.03), trimMat);
      const a = (i / 5) * Math.PI * 2;
      slot.position.set(Math.cos(a) * rimR * 0.62, Math.sin(a) * rimR * 0.62, 0.015);
      slot.rotation.z = a + 0.5; rimFace.add(slot);
    }
  } else if (style === 'cyber') {
    // 사이버트럭 스타일 육각 커버
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, 0.05, 6), new THREE.MeshStandardMaterial({ color: 0x2d2f33, metalness: 0.4, roughness: 0.5 }));
    hex.rotation.x = Math.PI / 2; rimFace.add(hex);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rimR * 0.55, 0.02, 6, 6), discMat);
    ring.position.z = 0.03; rimFace.add(ring);
  } else {
    // 스포크 휠 (스포츠: 블랙 / 터빈: 실버 곡선)
    const n = style === 'turbine' ? 14 : 5;
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.03, 8, 40), rimMat);
    rimFace.add(ringM);
    const hubM = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.2, rimR * 0.2, 0.06, 16), rimMat);
    hubM.rotation.x = Math.PI / 2; rimFace.add(hubM);
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(rimR * 0.85, style === 'turbine' ? 0.035 : 0.09, 0.04), rimMat);
      const a = (i / n) * Math.PI * 2;
      sp.position.set(Math.cos(a) * rimR * 0.5, Math.sin(a) * rimR * 0.5, 0);
      sp.rotation.z = a + (style === 'turbine' ? 0.35 : 0);
      rimFace.add(sp);
    }
    // 브레이크 디스크 + 캘리퍼
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.03, 30), discMat);
    disc.rotation.x = Math.PI / 2; disc.position.z = w / 2 - 0.09; sp.add(disc);
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.1, rimR * 0.5, 0.07), brakeMat);
    cal.position.set(-rimR * 0.6, 0, w / 2 - 0.07); g.add(cal);
  }
  const inner = new THREE.Mesh(new THREE.CircleGeometry(rimR, 30), trimMat);
  inner.position.z = w / 2 - 0.12; sp.add(inner);
  g.userData.spinner = sp;
  return g;
}

// 테슬라 차량 만들기
export function buildCar(config) {
  const spec = MODELS[config.model] || MODELS.model3;
  const isCustom = config.color === 'custom' && config.custom;
  const color = isCustom ? { id: 'custom', hex: config.custom, metal: 0.55 } : (COLORS.find(c => c.id === config.color) || COLORS[0]);
  const stance = STANCES.find(s => s.id === config.stance) || STANCES[0];
  const paint = paintMaterial(color);
  if (spec.angular) paint.flatShading = true;
  const car = new THREE.Group();
  const body = new THREE.Group(); // 차체 (롤 기울기 적용)
  car.add(body);

  const L = spec.L, W = spec.W;
  const prof = makeProfile(spec);
  const { xr, xf } = prof;
  const bodyMesh = new THREE.Mesh(buildBodyGeometry(spec, prof), [paint, glassMat, trimMat]);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  bodyMesh.name = 'paint';
  body.add(bodyMesh);

  // 휠 하우스 안쪽 (검정)
  [xr, xf].forEach(x => {
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(prof.arch - 0.01, prof.arch - 0.01, W * 0.96, 24, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x050505, side: THREE.BackSide, roughness: 1 }));
    liner.rotation.x = -Math.PI / 2;
    liner.position.set(x, spec.r, 0);
    body.add(liner);
  });

  // 하단 블랙 트림 (사이드 스커트)
  const skirtY = prof.bottomY((xr + xf) / 2);
  [-1, 1].forEach(sd => {
    const len = spec.wb - prof.arch * 2 - 0.05;
    const sk = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.03), trimMat);
    sk.position.set((xr + xf) / 2, skirtY + 0.05, sd * (surfZ(spec, prof, (xr + xf) / 2, skirtY + 0.05) + 0.005));
    body.add(sk);
  });

  // 사이드 미러
  const mx = L * spec.glass[1] - (spec.angular ? 0.35 : 0.3), my = spec.belt + 0.05;
  const mz = surfZ(spec, prof, mx, spec.belt);
  [-1, 1].forEach(sd => {
    const m = new THREE.Mesh(spec.angular ? new THREE.BoxGeometry(0.22, 0.1, 0.18) : new THREE.SphereGeometry(0.11, 16, 10), spec.angular ? trimMat : paint);
    if (!spec.angular) m.scale.set(1.3, 0.75, 1.1);
    m.position.set(mx, my, sd * (mz + 0.1));
    m.castShadow = true;
    body.add(m);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.12), trimMat);
    arm.position.set(mx + 0.03, my - 0.04, sd * (mz + 0.04));
    body.add(arm);
  });

  // 문 틈 / 손잡이 라인 (얇은 어두운 선)
  if (!spec.angular) {
    const seamMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
    const doorXs = config.model === 'roadster' || config.model === 'cybercab' ? [L * spec.glass[1] - 0.1, L * spec.glass[0] + 0.25] : [L * spec.glass[1] - 0.12, (L * spec.glass[0] + L * spec.glass[1]) / 2 + 0.1, L * spec.glass[0] + 0.35];
    doorXs.forEach(x => {
      const y0 = prof.bottomY(x) + 0.08, y1 = spec.belt - 0.02;
      [-1, 1].forEach(sd => {
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.008, y1 - y0), seamMat);
        sm.position.set(x, (y0 + y1) / 2, sd * (surfZ(spec, prof, x, (y0 + y1) / 2) + 0.003));
        sm.rotation.y = sd > 0 ? 0 : Math.PI;
        body.add(sm);
      });
    });
  }

  // 라이트
  const frontY = Math.min(prof.topY(L * 0.96) - 0.07, spec.angular ? 1.03 : 9);
  const rearY = spec.angular ? 1.27 : prof.topY(L * 0.03) - 0.09;
  const lights = { tail: [] };
  if (spec.lightbar) {
    body.add(surfaceStrip(spec, prof, frontY, 1, spec.angular ? 0.98 : 0.92, headMat, 0.035));
    const tb = surfaceStrip(spec, prof, rearY, -1, spec.angular ? 0.98 : 0.95, tailMat, 0.05);
    body.add(tb); lights.tail.push(tb);
  }
  if (!spec.angular) {
    // 슬림 헤드램프 / 테일램프 (차체 곡면 위)
    const lamp = (x0, x1, y, mat, th) => {
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const x = x0 + (x1 - x0) * (k / 10);
        const yy = y + (k / 10) * 0.03;
        pts.push(new THREE.Vector3(x, yy, surfZ(spec, prof, x, yy) + 0.006));
      }
      return pts;
    };
    [-1, 1].forEach(sd => {
      const hp = lamp(L - 0.5, L - 0.2, frontY, headMat).map(p => new THREE.Vector3(p.x, p.y, p.z * sd));
      body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp), 16, 0.02, 6), headMat));
      const tp = lamp(0.04, 0.4, rearY, tailMat).map(p => new THREE.Vector3(p.x, p.y, p.z * sd));
      const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tp), 16, 0.04, 6), tailMat);
      body.add(t); lights.tail.push(t);
    });
    // 엠블럼 자리 (작은 은색 T 배지)
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), discMat);
    let bx = L; for (let n = 0; n < 100 && surfZ(spec, prof, bx, frontY + 0.06) < 0.01; n++) bx -= 0.01;
    badge.position.set(bx + 0.004, frontY + 0.06, 0); badge.rotation.y = Math.PI / 2;
    body.add(badge);
  }

  // 스포일러
  if (config.spoiler === 'lip') {
    const lx = L * 0.035, ly = prof.topY(lx) + 0.02;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, surfZ(spec, prof, lx, ly - 0.05) * 1.8), spec.angular ? trimMat : paint);
    lip.position.set(lx, ly, 0); lip.rotation.z = 0.3; body.add(lip);
  } else if (config.spoiler === 'wing') {
    const wx = L * 0.05, wy = prof.topY(wx) + 0.3;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, W * 0.92), trimMat);
    wing.position.set(wx, wy, 0); wing.rotation.z = 0.12;
    wing.castShadow = true; body.add(wing);
    [-1, 1].forEach(sd => {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.03), trimMat);
      st.position.set(wx + 0.02, wy - 0.16, sd * W * 0.3); body.add(st);
      const ep = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.02), trimMat);
      ep.position.set(wx, wy + 0.02, sd * W * 0.46); body.add(ep);
    });
  }

  // 사이버트럭: 적재함 덮개 라인, 블랙 휠아치 몰딩
  if (spec.angular) {
    [xr, xf].forEach(x => {
      [-1, 1].forEach(sd => {
        const flare = new THREE.Mesh(new THREE.TorusGeometry(prof.arch + 0.04, 0.05, 4, 6, Math.PI), trimMat);
        flare.position.set(x, spec.r, sd * (W / 2 + 0.005));
        body.add(flare);
      });
    });
  }

  // 바퀴
  const wheels = [];
  const track = W / 2 - 0.15;
  const wheelStyle = config.wheel || (spec.angular ? 'cyber' : 'aero');
  [[xf, 1], [xf, -1], [xr, 1], [xr, -1]].forEach(([x, sd]) => {
    const wh = buildWheel(spec, wheelStyle, paint);
    wh.position.set(x, spec.r, sd * track);
    if (sd < 0) wh.rotation.y = Math.PI;
    wh.userData.sign = sd;
    wh.userData.front = x === xf;
    car.add(wh);
    wheels.push(wh);
  });

  // 차 중심을 원점으로 (앞이 +Z 방향)
  body.position.y = stance.dy;
  wheels.forEach(w => (w.position.y = spec.r));
  const pivot = new THREE.Group();
  car.position.set(-L / 2, 0, 0);
  pivot.add(car);
  pivot.rotation.y = -Math.PI / 2;
  const root = new THREE.Group();
  root.add(pivot);
  root.userData = { spec, wheels, body, lights, paint };
  tryLoadGLB(config.model, root, paint);
  return root;
}

// 실제 테슬라 3D 파일(model3.glb 등)이 있으면 교체
const glbCache = {};
async function tryLoadGLB(id, root, paint) {
  if (!(id in glbCache)) {
    glbCache[id] = fetch(`./${id}.glb`, { method: 'HEAD' })
      .then(r => (r.ok ? new GLTFLoader().loadAsync(`./${id}.glb`) : null))
      .catch(() => null);
  }
  const gltf = await glbCache[id];
  if (!gltf) return;
  const spec = root.userData.spec;
  const model = gltf.scene.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const len = Math.max(size.x, size.z);
  const s = spec.L / len;
  model.scale.setScalar(s);
  if (size.x > size.z) model.rotation.y = -Math.PI / 2;
  const box2 = new THREE.Box3().setFromObject(model);
  const c = box2.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box2.min.y, -c.z);
  model.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      const n = ((o.material && o.material.name) || o.name || '').toLowerCase();
      if (/paint|body|carpaint|exterior/.test(n)) o.material = paint;
    }
  });
  root.children.forEach(ch => (ch.visible = false));
  root.add(model);
  root.userData.wheels = [];
}
