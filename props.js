// 랜드마크와 소품 3D 모델 (모두 코드로 생성)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, canvasTexture, speckle } from './utils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// 두 점을 잇는 막대(상자)의 행렬
export function beam(a, b, t = 0.4) {
  const d = b.clone().sub(a);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(t, len, t));
}

export function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }); }

function inst(geo, mat, mats, colors) {
  const m = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((x, i) => m.setMatrixAt(i, x));
  if (colors) colors.forEach((c, i) => m.setColorAt(i, c));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const BOX = new THREE.BoxGeometry(1, 1, 1);

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ── 격자 탑 (에펠탑 / 도쿄타워) ──
function latticeTower({ H, base, top, k, color, bands = null, decks = [], tip = 20 }) {
  const g = new THREE.Group();
  const half = y => top + (base - top) * Math.exp(-y / k) - (base - top) * Math.exp(-H / k) * (y / H);
  const levels = [];
  const N = 26;
  for (let i = 0; i <= N; i++) { const y = H * Math.pow(i / N, 1.15); levels.push([y, half(y)]); }
  const corners = (y, h) => [V(-h, y, -h), V(h, y, -h), V(h, y, h), V(-h, y, h)];
  const beams = [], cols = [];
  const colorAt = y => {
    if (!bands) return new THREE.Color(color);
    return new THREE.Color(Math.floor((y / H) * bands) % 2 ? '#f4f4f0' : color);
  };
  for (let i = 0; i < levels.length - 1; i++) {
    const [y0, h0] = levels[i], [y1, h1] = levels[i + 1];
    const c0 = corners(y0, h0), c1 = corners(y1, h1);
    const t = Math.max(0.35, h0 * 0.06);
    for (let k2 = 0; k2 < 4; k2++) {
      // 다리 (안쪽/바깥쪽 2개씩)
      beams.push(beam(c0[k2], c1[k2], t * 1.6)); cols.push(colorAt(y0));
      const inner = s => s.clone().multiply(V(0.82, 1, 0.82));
      beams.push(beam(inner(c0[k2]), inner(c1[k2]), t)); cols.push(colorAt(y0));
      // 가로대
      beams.push(beam(c1[k2], c1[(k2 + 1) % 4], t * 0.6)); cols.push(colorAt(y1));
      // X자 보강
      beams.push(beam(c0[k2], c1[(k2 + 1) % 4], t * 0.45)); cols.push(colorAt(y0));
      beams.push(beam(c0[(k2 + 1) % 4], c1[k2], t * 0.45)); cols.push(colorAt(y0));
    }
  }
  const mat = std('#ffffff', { roughness: 0.6, metalness: 0.4 });
  g.add(inst(BOX, mat, beams, cols));
  // 아래쪽 아치
  const archMat = std(color, { metalness: 0.4, roughness: 0.6 });
  for (let k2 = 0; k2 < 4; k2++) {
    const a = new THREE.Mesh(new THREE.TorusGeometry(base * 0.62, base * 0.05, 6, 24, Math.PI), archMat);
    a.rotation.y = (k2 * Math.PI) / 2;
    const dir = [V(0, 0, -1), V(1, 0, 0), V(0, 0, 1), V(-1, 0, 0)][k2];
    a.position.copy(dir.multiplyScalar(base * 0.78)).setY(base * 0.12);
    if (k2 % 2) a.rotation.y = Math.PI / 2;
    a.scale.y = 0.75;
    g.add(a);
  }
  // 전망대
  decks.forEach(([fy, color2]) => {
    const y = H * fy, h = half(y) * 2.3;
    const d = mesh(new THREE.BoxGeometry(h, h * 0.18, h), std(color2 || color, { metalness: 0.3 }), 0, y, 0);
    g.add(d);
  });
  const ant = mesh(new THREE.CylinderGeometry(0.3, top * 0.8, tip, 6), archMat, 0, H + tip / 2, 0);
  g.add(ant);
  const beacon = mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffdd88', emissiveIntensity: 4 }), 0, H + tip, 0);
  g.add(beacon);
  return g;
}

export function eiffelTower(scale = 1) {
  const g = latticeTower({ H: 150, base: 30, top: 2.2, k: 34, color: '#7a6248', decks: [[0.2, '#6b5540'], [0.39, '#6b5540'], [0.92, '#6b5540']], tip: 18 });
  g.scale.setScalar(scale);
  return g;
}
export function tokyoTower(scale = 1) {
  const g = latticeTower({ H: 140, base: 26, top: 2.4, k: 36, color: '#ff4d1a', bands: 9, decks: [[0.42, '#ffffff'], [0.72, '#ffffff']], tip: 26 });
  g.scale.setScalar(scale);
  return g;
}

// ── 개선문 ──
export function arcDeTriomphe() {
  const g = new THREE.Group();
  const stone = std('#e2d6bd');
  const W = 45, D = 22, H = 50;
  g.add(mesh(new THREE.BoxGeometry(13, 36, D), stone, -W / 2 + 6.5, 18, 0));
  g.add(mesh(new THREE.BoxGeometry(13, 36, D), stone, W / 2 - 6.5, 18, 0));
  g.add(mesh(new THREE.BoxGeometry(W, 14, D), stone, 0, 43, 0));
  g.add(mesh(new THREE.BoxGeometry(W + 2, 2, D + 2), stone, 0, 36, 0));
  g.add(mesh(new THREE.BoxGeometry(W + 1, 1.5, D + 1), stone, 0, H, 0));
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, D + 0.2, 24, 1, false, 0, Math.PI), stone);
  arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2;
  arch.position.set(0, 29, 0); arch.scale.set(1, 1, 0.6);
  g.add(arch);
  // 부조 장식
  const relief = std('#cbbd9f');
  [-1, 1].forEach(s => [-1, 1].forEach(f => g.add(mesh(new THREE.BoxGeometry(8, 9, 0.6), relief, s * (W / 2 - 6.5), 16, f * (D / 2 + 0.2)))));
  return g;
}

// ── 텍스처: 창문 ──
export function windowTexture({ wall = '#d9d2c0', win = '#3a4a5c', lit = null, cols = 6, rows = 10, balcony = false, seed = 1 } = {}) {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = wall; g.fillRect(0, 0, s, s);
    speckle(g, s, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.06)'], 1500, 2);
    const r = rng(seed);
    const cw = s / cols, rh = s / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      g.fillStyle = lit && r() < 0.35 ? lit : win;
      g.fillRect(x * cw + cw * 0.22, y * rh + rh * 0.2, cw * 0.56, rh * 0.6);
      if (balcony) { g.fillStyle = '#2a2a2a'; g.fillRect(x * cw + cw * 0.12, y * rh + rh * 0.78, cw * 0.76, rh * 0.06); }
    }
  });
}

// 건물 블록 무리 (스타일별)
export function buildingField(spots, { tex, colors, h = [12, 30], w = [12, 22], roof = null, roofColor = '#555', seed = 3 }) {
  const r = rng(seed);
  const mats = [], cols = [], roofs = [];
  spots.forEach(([x, y, z, ry]) => {
    const bw = w[0] + r() * (w[1] - w[0]), bd = w[0] + r() * (w[1] - w[0]);
    const bh = h[0] + Math.pow(r(), 1.6) * (h[1] - h[0]);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, ry);
    mats.push(new THREE.Matrix4().compose(V(x, y + bh / 2, z), q, V(bw, bh, bd)));
    cols.push(new THREE.Color(colors[Math.floor(r() * colors.length)]));
    if (roof) roofs.push(new THREE.Matrix4().compose(V(x, y + bh + 2.2, z), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 4)), V(bw * 0.72, 4.4, bd * 0.72)));
  });
  const g = new THREE.Group();
  const t = tex.clone(); t.needsUpdate = true;
  g.add(inst(BOX, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }), mats, cols));
  if (roof) g.add(inst(new THREE.CylinderGeometry(0.5, 0.72, 1, 4), std(roofColor, { flatShading: true }), roofs));
  return g;
}

// 고층 빌딩 (유리)
export function skyscraper({ w = 30, d = 30, h = 150, color = '#8fb3d9', tex, tiers = 1, spire = 0, taper = false }) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: tex, color, metalness: 0.55, roughness: 0.25 });
  let y = 0, cw = w, cd = d;
  for (let i = 0; i < tiers; i++) {
    const th = h * (i === 0 ? 0.6 : 0.4 / (tiers - 1 || 1));
    const geo = taper ? new THREE.CylinderGeometry(cw * 0.45, cw * 0.72, th, 4, 1) : new THREE.BoxGeometry(cw, th, cd);
    if (taper) geo.rotateY(Math.PI / 4);
    g.add(mesh(geo, mat, 0, y + th / 2, 0));
    y += th; cw *= 0.75; cd *= 0.75;
  }
  if (spire) g.add(mesh(new THREE.CylinderGeometry(0.4, 1.6, spire, 6), std('#c9ccd0', { metalness: 0.8 }), 0, y + spire / 2, 0));
  return g;
}

// ── 서울: N서울타워 / 롯데월드타워 / 광화문 ──
export function nSeoulTower() {
  const g = new THREE.Group();
  const white = std('#eef0f2', { roughness: 0.5 });
  g.add(mesh(new THREE.CylinderGeometry(9, 11, 10, 16), std('#b8bcc2'), 0, 5, 0));
  g.add(mesh(new THREE.CylinderGeometry(3.2, 4.2, 105, 20), white, 0, 60, 0));
  g.add(mesh(new THREE.CylinderGeometry(11, 9, 6, 28), std('#ced3d8', { metalness: 0.3 }), 0, 98, 0));
  g.add(mesh(new THREE.CylinderGeometry(10, 11, 8, 28), new THREE.MeshStandardMaterial({ color: '#33475e', metalness: 0.6, roughness: 0.2, emissive: '#2a4a80', emissiveIntensity: 0.2 }), 0, 105, 0));
  g.add(mesh(new THREE.CylinderGeometry(8, 10, 3, 28), white, 0, 110.5, 0));
  for (let i = 0; i < 4; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.9 - i * 0.18, 1.1 - i * 0.18, 12, 8), std(i % 2 ? '#e33' : '#fff'), 0, 118 + i * 12, 0);
    g.add(seg);
  }
  g.add(mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: '#f22', emissive: '#f22', emissiveIntensity: 3 }), 0, 166, 0));
  return g;
}

export function lotteTower() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: '#c9d6e3', metalness: 0.8, roughness: 0.15 });
  const geo = new THREE.CylinderGeometry(6, 22, 250, 4, 12);
  geo.rotateY(Math.PI / 4);
  // 위로 갈수록 곡선으로 가늘어지게
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 125, t = y / 250;
    const f = 1 - 0.55 * t * t;
    const base = (22 - 16 * t);
    p.setX(i, p.getX(i) * (f * 22 / base));
    p.setZ(i, p.getZ(i) * (f * 22 / base));
  }
  geo.computeVertexNormals();
  g.add(mesh(geo, glass, 0, 125, 0));
  // 꼭대기 갈라진 왕관
  [-1, 1].forEach(s => {
    const c = mesh(new THREE.BoxGeometry(5, 26, 1.2), glass, s * 3, 262, 0);
    c.rotation.z = -s * 0.06; g.add(c);
  });
  g.add(mesh(new THREE.BoxGeometry(70, 30, 60), new THREE.MeshStandardMaterial({ color: '#b9c4cf', metalness: 0.5, roughness: 0.3 }), 0, 15, 30));
  return g;
}

// 한옥 지붕 (처마가 휘어 올라간 형태)
function hanokRoof(w, d, h, color) {
  const geo = new THREE.CylinderGeometry(0.5, 0.72, 1, 4, 3, false);
  geo.rotateY(Math.PI / 4);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const edge = Math.max(Math.abs(x), Math.abs(z)) / 0.5;
    const corner = Math.abs(x) * Math.abs(z) * 8;
    p.setY(i, y + (y < 0 ? corner * 0.35 : 0) - (y < 0 ? 0 : 0) + edge * 0.0);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, std(color, { flatShading: true, roughness: 0.7 }));
  m.scale.set(w, h, d);
  m.castShadow = true;
  return m;
}

export function gwanghwamun() {
  const g = new THREE.Group();
  const stone = std('#cfc7b5');
  g.add(mesh(new THREE.BoxGeometry(60, 14, 18), stone, 0, 7, 0));
  [-16, 0, 16].forEach(x => {
    const a = mesh(new THREE.BoxGeometry(x === 0 ? 7 : 5.5, 8, 18.4), std('#1b1b1e'), x, 4, 0);
    g.add(a);
  });
  const red = std('#9c2a22');
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 7, 10), red, -20 + i * 8, 17.5, 5.5));
  g.add(mesh(new THREE.BoxGeometry(44, 1.4, 14), std('#3a6b5a'), 0, 21.5, 0));
  const r1 = hanokRoof(56, 24, 7, '#3b3d42'); r1.position.set(0, 25, 0); g.add(r1);
  g.add(mesh(new THREE.BoxGeometry(30, 5, 10), red, 0, 30, 0));
  const r2 = hanokRoof(42, 18, 6, '#3b3d42'); r2.position.set(0, 35, 0); g.add(r2);
  return g;
}

// ── 일본: 도리이 / 후지산 / 벚꽃 ──
export function torii(s = 1) {
  const g = new THREE.Group();
  const red = std('#d8321e', { roughness: 0.5 });
  [-5, 5].forEach(x => g.add(mesh(new THREE.CylinderGeometry(0.55, 0.65, 12, 12), red, x, 6, 0)));
  const top = mesh(new THREE.BoxGeometry(15, 1, 1.4), std('#1a1a1a'), 0, 12.4, 0); g.add(top);
  const top2 = mesh(new THREE.BoxGeometry(14, 0.9, 1.1), red, 0, 11.6, 0); g.add(top2);
  g.add(mesh(new THREE.BoxGeometry(11.5, 0.7, 0.8), red, 0, 9.6, 0));
  g.scale.setScalar(s);
  return g;
}

export function mountFuji() {
  const geo = new THREE.ConeGeometry(620, 380, 64, 12, true);
  const p = geo.attributes.position;
  const cols = [];
  const snow = new THREE.Color('#f6f8fb'), rock = new THREE.Color('#5f6f8a');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 190;
    // 꼭대기를 평평하게 (분화구)
    if (y > 350) { p.setY(i, 350 - 190); p.setX(i, p.getX(i) * 1.0); }
    const t = (y - 230 + Math.sin(i * 1.7) * 18) / 120;
    const c = rock.clone().lerp(snow, Math.min(1, Math.max(0, t)));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, fog: true }));
  m.position.y = 170;
  return m;
}

// 둥근 나무 (벚꽃/소나무 등 색만 바꿔 사용)
export function blobTreeGeometry() {
  const blobs = [];
  [[0, 4.2, 0, 2.4], [1.3, 3.6, 0.6, 1.7], [-1.2, 3.8, -0.5, 1.8], [0.2, 5.6, -0.3, 1.6]].forEach(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 1); g.translate(x, y, z); blobs.push(g);
  });
  const trunk = new THREE.CylinderGeometry(0.25, 0.35, 3.4, 6); trunk.translate(0, 1.7, 0);
  return { crown: mergeGeometries(blobs), trunk };
}

// 우산소나무 (로마)
export function umbrellaPineGeometry() {
  const trunk = new THREE.CylinderGeometry(0.3, 0.45, 11, 6); trunk.translate(0, 5.5, 0);
  const parts = [];
  [[0, 12, 0, 5], [2.5, 11.6, 1, 3.5], [-2.6, 11.8, -0.8, 3.6]].forEach(([x, y, z, r]) => {
    const g = new THREE.SphereGeometry(r, 10, 6); g.scale(1, 0.38, 1); g.translate(x, y, z); parts.push(g);
  });
  return { crown: mergeGeometries(parts), trunk };
}

export function palmGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.CylinderGeometry(0.22 - i * 0.015, 0.26 - i * 0.015, 2.2, 7);
    seg.translate(Math.pow(i / 6, 2) * 1.2, 1.1 + i * 2.1, 0);
    parts.push(seg);
  }
  const leaves = [];
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.ConeGeometry(0.55, 5.2, 4, 1);
    leaf.scale(1, 1, 0.18); leaf.translate(0, 2.6, 0);
    leaf.rotateZ(-Math.PI / 2 + 0.45 + (i % 2) * 0.25);
    leaf.rotateY((i / 9) * Math.PI * 2);
    leaf.translate(1.2, 13.2, 0);
    leaves.push(leaf);
  }
  return { trunk: mergeGeometries(parts), leaves: mergeGeometries(leaves) };
}

// ── 로마: 콜로세움 / 돔 ──
export function colosseum() {
  const g = new THREE.Group();
  const archTex = canvasTexture(512, (c, s) => {
    c.fillStyle = '#d8c4a0'; c.fillRect(0, 0, s, s);
    speckle(c, s, ['#c6b08a', '#e6d6b6', '#b59d78'], 6000, 2.5);
    const rows = 4, cols = 8;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const x = k * s / cols, y = r * s / rows;
      c.fillStyle = '#4a3a2a';
      if (r === 0) { c.fillRect(x + 14, y + 26, s / cols - 28, s / rows - 30); continue; }
      c.beginPath();
      c.moveTo(x + 12, y + s / rows - 6); c.lineTo(x + 12, y + 46);
      c.arc(x + s / cols / 2, y + 46, s / cols / 2 - 12, Math.PI, 0);
      c.lineTo(x + s / cols - 12, y + s / rows - 6); c.fill();
      c.fillStyle = '#c3ad86'; c.fillRect(x, y + s / rows - 8, s / cols, 8);
    }
  }, [6, 1]);
  const mat = new THREE.MeshStandardMaterial({ map: archTex, roughness: 0.9, side: THREE.DoubleSide });
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(52, 52, 48, 64, 1, true), mat);
  outer.position.y = 24; outer.scale.set(1.25, 1, 1); outer.castShadow = true;
  g.add(outer);
  // 무너진 쪽 (반원만 낮게)
  const broken = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 34, 48, 1, true, Math.PI * 0.2, Math.PI * 1.3), mat);
  broken.position.y = 17; broken.scale.set(1.25, 1, 1);
  g.add(broken);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, 22, 48, 1, true), std('#a78f6d', { side: THREE.DoubleSide }));
  inner.position.y = 11; inner.scale.set(1.3, 1, 1); g.add(inner);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 32), std('#9a7f5a'));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 1; floor.scale.set(1.3, 1, 1); g.add(floor);
  return g;
}

export function domeChurch() {
  const g = new THREE.Group();
  const stone = std('#e6dccb');
  g.add(mesh(new THREE.BoxGeometry(70, 30, 50), stone, 0, 15, 0));
  g.add(mesh(new THREE.CylinderGeometry(20, 20, 18, 32), stone, 0, 39, 0));
  const dome = mesh(new THREE.SphereGeometry(20, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), std('#8aa3a0', { roughness: 0.5 }), 0, 48, 0);
  dome.scale.y = 1.25; g.add(dome);
  g.add(mesh(new THREE.CylinderGeometry(3, 3, 8, 12), stone, 0, 77, 0));
  g.add(mesh(new THREE.ConeGeometry(3, 6, 12), std('#8aa3a0'), 0, 84, 0));
  for (let i = 0; i < 8; i++) g.add(mesh(new THREE.CylinderGeometry(1.2, 1.2, 26, 10), stone, -28 + i * 8, 13, 26));
  g.add(mesh(new THREE.ConeGeometry(30, 8, 3), stone, 0, 34, 26));
  return g;
}

// ── 뉴욕: 자유의 여신상 / 엠파이어 ──
export function statueOfLiberty() {
  const g = new THREE.Group();
  const stone = std('#b9ad98');
  const green = std('#5fa592', { roughness: 0.6, metalness: 0.2 });
  g.add(mesh(new THREE.CylinderGeometry(34, 36, 8, 11), stone, 0, 4, 0));
  g.add(mesh(new THREE.BoxGeometry(22, 18, 22), stone, 0, 17, 0));
  const ped = mesh(new THREE.CylinderGeometry(9, 13, 30, 4), stone, 0, 41, 0); ped.rotation.y = Math.PI / 4; g.add(ped);
  // 몸체 (로브)
  g.add(mesh(new THREE.CylinderGeometry(4.5, 7.5, 26, 14), green, 0, 69, 0));
  g.add(mesh(new THREE.CylinderGeometry(3.8, 4.5, 10, 14), green, 0, 87, 0));
  g.add(mesh(new THREE.SphereGeometry(3, 16, 12), green, 0, 95, 0));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI - Math.PI / 2;
    const spike = mesh(new THREE.ConeGeometry(0.45, 4.5, 6), green, Math.sin(a) * 2.8, 98.5, Math.cos(a) * 2.8 * 0.6 + 0.8);
    spike.rotation.set(Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.9); g.add(spike);
  }
  // 횃불 든 오른팔
  const arm = mesh(new THREE.CylinderGeometry(1.1, 1.4, 16, 10), green, 4.5, 99, 0); arm.rotation.z = -0.2; g.add(arm);
  g.add(mesh(new THREE.CylinderGeometry(1.6, 0.9, 3, 10), std('#c9a548', { metalness: 0.8, roughness: 0.3 }), 6.2, 108, 0));
  g.add(mesh(new THREE.SphereGeometry(1.5, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffcc55', emissive: '#ffaa22', emissiveIntensity: 3 }), 6.2, 110.4, 0));
  // 왼팔 + 석판
  const tab = mesh(new THREE.BoxGeometry(2, 6, 1.2), green, -4.6, 80, 2); tab.rotation.z = 0.2; g.add(tab);
  return g;
}

// ── 모로코: 쿠투비아 미너렛 / 말발굽 아치 문 ──
export function minaret() {
  const g = new THREE.Group();
  const tex = canvasTexture(256, (c, s) => {
    c.fillStyle = '#c9895a'; c.fillRect(0, 0, s, s);
    speckle(c, s, ['#b8784c', '#d9996a', '#a96a40'], 4000, 2);
    c.strokeStyle = '#8c5530'; c.lineWidth = 6;
    c.beginPath(); c.arc(s / 2, s * 0.45, s * 0.2, Math.PI, 0); c.lineTo(s * 0.7, s * 0.75); c.lineTo(s * 0.3, s * 0.75); c.closePath(); c.stroke();
    c.fillStyle = '#2f6b5e'; c.fillRect(0, s * 0.9, s, s * 0.05);
  }, [1, 5]);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  g.add(mesh(new THREE.BoxGeometry(13, 70, 13), mat, 0, 35, 0));
  g.add(mesh(new THREE.BoxGeometry(14.5, 2, 14.5), std('#2f6b5e'), 0, 70, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    g.add(mesh(new THREE.BoxGeometry(2, 2.4, 2), std('#c9895a'), Math.cos(a) * 6, 72, Math.sin(a) * 6));
  }
  g.add(mesh(new THREE.BoxGeometry(6, 10, 6), mat, 0, 76, 0));
  g.add(mesh(new THREE.SphereGeometry(3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#2f6b5e'), 0, 81, 0));
  const gold = new THREE.MeshStandardMaterial({ color: '#e0b84a', metalness: 0.9, roughness: 0.25 });
  [1.3, 1.0, 0.7].forEach((r, i) => g.add(mesh(new THREE.SphereGeometry(r, 12, 8), gold, 0, 85 + i * 2.2, 0)));
  return g;
}

export function horseshoeGate(color = '#d3a272') {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-14, 0); shape.lineTo(14, 0); shape.lineTo(14, 22); shape.lineTo(-14, 22); shape.lineTo(-14, 0);
  const hole = new THREE.Path();
  hole.moveTo(-5, 0); hole.lineTo(-5, 9); hole.absarc(0, 11, 6.2, Math.PI + 0.4, -0.4, true); hole.lineTo(5, 9); hole.lineTo(5, 0);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: false });
  geo.translate(0, 0, -2.5);
  g.add(mesh(geo, std(color)));
  for (let i = -6; i <= 6; i++) g.add(mesh(new THREE.BoxGeometry(1.4, 1.6, 5.4), std(color), i * 2.1, 23, 0));
  const tile = new THREE.Mesh(new THREE.TorusGeometry(6.8, 0.5, 6, 24, Math.PI + 0.8), std('#2c7a6a'));
  tile.position.set(0, 11, 2.6); tile.rotation.z = -0.4; g.add(tile);
  return g;
}

// ── 카파도키아: 요정 굴뚝 / 열기구 ──
export function fairyChimneyGeometry() {
  const body = new THREE.ConeGeometry(5, 20, 10, 4);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const bulge = 1 + 0.25 * Math.sin((y + 10) / 20 * Math.PI);
    p.setX(i, p.getX(i) * bulge); p.setZ(i, p.getZ(i) * bulge);
  }
  body.translate(0, 10, 0);
  body.computeVertexNormals();
  const cap = new THREE.ConeGeometry(3.2, 3.5, 10); cap.translate(0, 20.5, 0);
  return { body, cap };
}

export function hotAirBalloon(color1, color2, seed = 1) {
  const g = new THREE.Group();
  const tex = canvasTexture(128, (c, s) => {
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? color1 : color2; c.fillRect(i * s / 8, 0, s / 8, s); }
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, s * 0.45, s, s * 0.06);
  });
  const env = new THREE.SphereGeometry(8, 24, 18);
  const p = env.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0) { const k = 1 + (y / 8) * 0.55; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  }
  env.computeVertexNormals();
  const e = mesh(env, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), 0, 12, 0);
  e.scale.y = 1.15; g.add(e);
  g.add(mesh(new THREE.BoxGeometry(2, 1.6, 2), std('#7a5230'), 0, 0.8, 0));
  const ropeMat = std('#3a2a1a');
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, z]) => {
    const rope = new THREE.Mesh(BOX, ropeMat);
    rope.applyMatrix4(beam(V(x * 0.9, 1.6, z * 0.9), V(x * 2.5, 4.6, z * 2.5), 0.08));
    g.add(rope);
  });
  g.add(mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffb040', emissive: '#ff8a00', emissiveIntensity: 2 }), 0, 3.2, 0));
  g.userData.seed = seed;
  return g;
}

// ── 아이슬란드: 할그림스키르캬 / 폭포 / 주상절리 ──
export function hallgrimskirkja() {
  const g = new THREE.Group();
  const c = std('#d6d8d6');
  g.add(mesh(new THREE.BoxGeometry(6, 74, 9), c, 0, 37, 0));
  g.add(mesh(new THREE.ConeGeometry(4, 10, 4), c, 0, 79, 0));
  for (let i = 1; i <= 7; i++) {
    const h = 62 - i * 7.2, x = 3 + i * 2.6;
    [-1, 1].forEach(s => g.add(mesh(new THREE.BoxGeometry(2.6, h, 8.6), c, s * x, h / 2, 0)));
  }
  g.add(mesh(new THREE.BoxGeometry(18, 22, 50), c, 0, 11, -28));
  g.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 16), std('#222'), 0, 60, 4.6).rotateX(Math.PI / 2));
  return g;
}

export function waterfall(width = 26, height = 60) {
  const g = new THREE.Group();
  const rock = std('#3b3f44', { flatShading: true });
  const cliff = mesh(new THREE.BoxGeometry(width * 5, height, 30), rock, 0, height / 2, -16);
  g.add(cliff);
  const tex = canvasTexture(128, (c, s) => {
    c.fillStyle = '#dfefff'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(150,190,230,${Math.random() * 0.5})`; c.fillRect(Math.random() * s, Math.random() * s, 2, 18 + Math.random() * 30); }
  }, [3, 2]);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.9, emissive: '#99bbdd', emissiveIntensity: 0.3 });
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  fall.position.set(0, height / 2, -0.8);
  g.add(fall);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(width, 24), std('#9fc8e8', { metalness: 0.4, roughness: 0.1 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.3, 6); g.add(pool);
  const mist = new THREE.Mesh(new THREE.SphereGeometry(width * 0.6, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, depthWrite: false }));
  mist.position.set(0, 3, 3); mist.scale.y = 0.4; g.add(mist);
  g.userData.update = t => { tex.offset.y = (t * 1.6) % 1; };
  return g;
}

export function basaltField(cx, cz, n = 120, seed = 4) {
  const r = rng(seed);
  const mats = [], cols = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 30;
    const h = 2 + r() * 12;
    mats.push(new THREE.Matrix4().compose(V(cx + Math.cos(a) * d, h / 2, cz + Math.sin(a) * d), new THREE.Quaternion(), V(1, h, 1)));
    cols.push(new THREE.Color().setHSL(0.6, 0.05, 0.12 + r() * 0.1));
  }
  return inst(new THREE.CylinderGeometry(1.6, 1.6, 1, 6), std('#ffffff', { flatShading: true }), mats, cols);
}

// ── 우유니: 잉카우아시 섬 선인장 ──
export function cactusGeometry() {
  const parts = [];
  const main = new THREE.CylinderGeometry(0.5, 0.6, 7, 8); main.translate(0, 3.5, 0); parts.push(main);
  [[1, 3, 1], [-1, 4, 1.4]].forEach(([s, y, h]) => {
    const a = new THREE.CylinderGeometry(0.35, 0.35, 1.4, 8); a.rotateZ(Math.PI / 2); a.translate(s * 0.9, y, 0); parts.push(a);
    const b = new THREE.CylinderGeometry(0.35, 0.35, h + 1.2, 8); b.translate(s * 1.5, y + h * 0.5, 0); parts.push(b);
  });
  return mergeGeometries(parts);
}

// ── 공통: 랜드마크 이름 표지 ──
export function nameBoard(text, sub, color = '#ffcc33') {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,14,24,0.85)'; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = color; g.fillRect(0, 0, 1024, 14);
  g.fillStyle = '#fff'; g.font = '900 96px Arial'; g.textAlign = 'center'; g.fillText(text, 512, 130);
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '700 48px Arial'; g.fillText(sub, 512, 205);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  return m;
}
