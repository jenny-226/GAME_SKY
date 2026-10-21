// 시골길 (Countryside): 구불구불한 2차선 시골 도로, 밭과 목초지, 농가, 사일로,
// 건초 더미, 소, 나무 울타리, 전봇대, 먼 산과 풍력 발전기, 뭉게구름
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Track } from './track.js';
import { rng, fbm, noise2, smoothstep, canvasTexture, speckle } from './utils.js';
import { V, makeSky, lights, instanced, mat4, trackNearestFn, makeTerrain, alongTrack } from './scene-kit.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const C = h => new THREE.Color(h);

function loopPts(rx, rz, waves, n = 32) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = 1;
    waves.forEach(([f, amp, ph = 0]) => { r += amp * Math.sin(f * a + ph); });
    pts.push(V(rx * r * Math.cos(a), 0, rz * r * Math.sin(a)));
  }
  return pts;
}

// 오래된 시골 아스팔트: 보수 자국, 균열, 흰 가장자리선, 노란 중앙선
function countryRoadTexture() {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = '#55575a'; g.fillRect(0, 0, s, s);
    speckle(g, s, ['#47494c', '#606266', '#6a6b6e', '#3f4144', '#5b5853'], 16000, 2.2);
    const r = rng(5);
    // 보수한 아스팔트 조각
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(30,31,33,${0.18 + r() * 0.15})`;
      const w = 40 + r() * 120, h = 30 + r() * 140;
      g.fillRect(s * 0.1 + r() * (s * 0.8 - w), r() * s, w, h);
    }
    // 균열
    g.strokeStyle = 'rgba(20,20,20,0.35)'; g.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) {
      let x = r() * s, y = r() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += r() * 26; g.lineTo(x, y); }
      g.stroke();
    }
    // 바퀴 자국 (살짝 밝게 닳은 부분)
    g.fillStyle = 'rgba(255,255,255,0.035)';
    [0.2, 0.33, 0.67, 0.8].forEach(u => g.fillRect(s * u - 14, 0, 28, s));
    // 차선 (약간 바랜 페인트)
    g.globalAlpha = 0.88;
    g.fillStyle = '#e9e7e0';
    g.fillRect(s * 0.035, 0, s * 0.014, s); g.fillRect(s * 0.951, 0, s * 0.014, s);
    g.fillStyle = '#e2b52c';
    g.fillRect(s * 0.486, 0, s * 0.009, s); g.fillRect(s * 0.505, 0, s * 0.009, s);
    g.globalAlpha = 1;
    speckle(g, s, ['rgba(70,70,70,0.6)'], 1500, 2);
  });
}

// 부드러운 구름 조각 텍스처
function cloudTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = rng(77);
  for (let i = 0; i < 28; i++) {
    const x = 50 + r() * 156, y = 70 + r() * 110, rad = 30 + r() * 50;
    const grd = g.createRadialGradient(x, y - rad * 0.3, rad * 0.1, x, y, rad);
    const shade = Math.round(235 - (y - 70) * 0.35);
    grd.addColorStop(0, `rgba(255,255,255,0.55)`);
    grd.addColorStop(0.6, `rgba(${shade},${shade + 3},${shade + 8},0.35)`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 박공지붕 (삼각 기둥): 폭 1, 높이 1, 길이 1
function gableGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0); shape.lineTo(0.5, 0); shape.lineTo(0, 1); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
}

// 소 한 마리 (몸통, 머리, 다리)
function cowGeometry() {
  const parts = [];
  const add = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); parts.push(b); };
  add(0.75, 0.75, 1.9, 0, 1.15, 0);       // 몸통
  add(0.45, 0.45, 0.6, 0, 1.35, 1.15);    // 머리
  add(0.5, 0.3, 0.25, 0, 1.2, 1.45);      // 주둥이
  [[-0.25, -0.7], [0.25, -0.7], [-0.25, 0.7], [0.25, 0.7]].forEach(([x, z]) => add(0.16, 0.8, 0.16, x, 0.4, z));
  return mergeGeometries(parts);
}

// 울퉁불퉁한 잎 덩어리 (구를 노이즈로 찌그러뜨림)
function lumpy(rad, x, y, z, seed) {
  const g = new THREE.IcosahedronGeometry(rad, 2);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + (noise2(v.x * 1.7 + seed * 3.1, v.z * 1.7 + v.y * 1.3) - 0.5) * 0.45;
    v.multiplyScalar(k); v.y *= 0.88;
    p.setXYZ(i, v.x + x, v.y + y, v.z + z);
  }
  g.computeVertexNormals();
  return g;
}

// 풀잎 텍스처 (투명 배경 위 가는 잎)
function grassBladeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = rng(31);
  for (let i = 0; i < 60; i++) {
    const x = 6 + r() * 116, h = 50 + r() * 76, lean = (r() - 0.5) * 30, w = 2 + r() * 3;
    const l = 55 + r() * 35;
    g.fillStyle = `hsl(${78 + r() * 22}, ${35 + r() * 25}%, ${l}%)`;
    g.beginPath(); g.moveTo(x - w, 128); g.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h); g.quadraticCurveTo(x + lean * 0.3 + w * 0.4, 128 - h * 0.6, x + w, 128); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 엇갈린 판 3장으로 만든 풀 포기. 앞뒤 면을 따로 만들고 법선을 모두 위로 향하게 해서
// 어느 쪽에서 봐도 햇빛을 받은 밝은 풀처럼 보이게 한다.
function grassClumpGeometry() {
  const parts = [];
  [0, 1, 2].forEach(i => {
    const p = new THREE.PlaneGeometry(1.3, 0.75); p.translate(0, 0.37, 0); p.rotateY((i / 3) * Math.PI);
    const back = p.clone();
    const idx = back.index.array;
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k]; idx[k] = idx[k + 1]; idx[k + 1] = t; }
    parts.push(p, back);
  });
  const g = mergeGeometries(parts);
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

function treeGeometries() {
  // 활엽수: 여러 덩어리 수관
  const blobs = [];
  [[0, 5.2, 0, 2.8], [1.6, 4.4, 0.7, 2.0], [-1.5, 4.6, -0.6, 2.1], [0.3, 6.8, -0.3, 1.9], [-0.4, 4.2, 1.4, 1.7]].forEach(([x, y, z, r]) => {
    blobs.push(lumpy(r, x, y, z, blobs.length + 1));
  });
  const crown = mergeGeometries(blobs);
  const trunk = new THREE.CylinderGeometry(0.22, 0.38, 4.4, 7); trunk.translate(0, 2.2, 0);
  // 침엽수: 층층이 쌓인 원뿔
  const cones = [];
  [[3.2, 5.5, 3.5], [2.5, 4.6, 6.2], [1.7, 3.8, 8.6], [0.9, 2.6, 10.6]].forEach(([r, h, y]) => {
    const g = new THREE.ConeGeometry(r, h, 8); g.translate(0, y, 0); cones.push(g);
  });
  const pine = mergeGeometries(cones);
  const pineTrunk = new THREE.CylinderGeometry(0.2, 0.32, 3.6, 6); pineTrunk.translate(0, 1.8, 0);
  return { crown, trunk, pine, pineTrunk };
}

export function buildCountry({ lift, gaps } = {}) {
  const group = new THREE.Group();
  const sunDir = V(0.55, 0.52, -0.42).normalize();
  const sky = makeSky({ top: '#2f6cc0', mid: '#b8d2ea', bottom: '#a9b9a6', sunDir, sunColor: '#fff3da', glow: 0.45, sunSize: 0.9995 });
  group.add(sky);
  const sun = lights(group, { sky: '#cfe2ff', ground: '#5d6a3a', hemi: 0.95, sun: '#fff0d4', sunI: 2.9, dir: sunDir });

  const track = new Track(loopPts(330, 250, [[3, 0.1], [5, 0.045, 1], [2, 0.06, 2]], 32), { width: 12, lift, gaps });
  const hw = track.width / 2;
  const near = trackNearestFn(track);
  const r = rng(2024);

  // ── 도로 + 자갈 갓길 ──
  const road = track.buildRoad(new THREE.MeshStandardMaterial({ map: countryRoadTexture(), roughness: 0.92 }), { thickness: 0.6, sideMaterial: std('#77736a') });
  group.add(road);
  const gravelTex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#8e8676'; g.fillRect(0, 0, s, s);
    speckle(g, s, ['#a39b8a', '#6f685c', '#b8b09e', '#7d7566', '#5f5a50'], 12000, 3);
  });
  const gravel = new THREE.MeshStandardMaterial({ map: gravelTex, roughness: 1 });
  group.add(track.buildStrip(gravel, hw, hw + 1.4, 0.0, 3), track.buildStrip(gravel, -hw - 1.4, -hw, 0.0, 3));

  // ── 지형: 완만한 구릉 + 먼 산맥 ──
  const rot = 0.32, cr = Math.cos(rot), sr = Math.sin(rot);
  const hash = (a, b) => { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); };
  // 밭 구획 (회전된 격자, 칸마다 작물 종류)
  const FIELD = [C('#6d8c3c'), C('#86a443'), C('#c7ae5f'), C('#b2954a'), C('#7a5d3e'), C('#56742f'), C('#9fae4a'), C('#6a8a3a')];
  const field = (x, z) => {
    const u = x * cr - z * sr, v = x * sr + z * cr;
    const fw = 95, fd = 70;
    const i = Math.floor(u / fw), j = Math.floor(v / fd);
    const fu = u / fw - i, fv = v / fd - j;
    const k = Math.floor(hash(i, j) * FIELD.length);
    const edge = Math.min(fu, 1 - fu) * fw < 2.5 || Math.min(fv, 1 - fv) * fd < 2.5;
    return { k, edge, i, j, u, v };
  };
  const hills = (x, z) => fbm(x * 0.0042 + 3, z * 0.0042 + 8, 4) * 40 - 15;
  const mountains = (x, z) => {
    const rr = Math.hypot(x, z);
    const ridge = 1 - Math.abs(fbm(x * 0.0022 + 11, z * 0.0022 - 4, 5) * 2 - 1);
    return smoothstep(780, 1250, rr) * (0.3 + ridge * ridge) * 260;
  };
  const heightAt = (x, z) => {
    const n = near(x, z);
    const base = Math.max(0, hills(x, z)) + mountains(x, z);
    return base * smoothstep(9, 46, n.d) - 0.3;
  };
  const grassTex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    speckle(g, s, ['#dfe3d2', '#cfd4bf', '#f2f4ea', '#bfc4ae', '#e8e2c8'], 14000, 2.4);
  }, [220, 220]);
  const verge = C('#6f8a3e'), forest = C('#3d5530'), rock = C('#7e7b72'), tmp = C('#000');
  group.add(makeTerrain({
    size: 2600, seg: 330, height: heightAt, map: grassTex,
    color: (x, z, h, c) => {
      const n = near(x, z);
      const f = field(x, z);
      c.copy(FIELD[f.k]);
      c.offsetHSL(0, 0, (noise2(x * 0.05, z * 0.05) - 0.5) * 0.06);
      if (f.edge) c.lerp(C('#4f6a2c'), 0.7);                              // 밭 경계 풀
      c.lerp(tmp.copy(verge).offsetHSL(0, 0, (noise2(x * 0.2, z * 0.2) - 0.5) * 0.05), 1 - smoothstep(8, 22, n.d)); // 길가 풀밭
      const mt = smoothstep(30, 90, h);                                    // 산: 숲 → 바위
      c.lerp(tmp.copy(forest).offsetHSL(0, 0, (fbm(x * 0.02, z * 0.02) - 0.5) * 0.08), mt);
      if (h > 170) c.lerp(rock, smoothstep(170, 300, h) * 0.6);
    },
  }));

  // 언덕 위 지점이 밭/길에서 쓸만한지
  const place = (minD, maxD, tries, fn) => {
    for (let k = 0; k < tries; k++) {
      const x = (r() - 0.5) * 1500, z = (r() - 0.5) * 1500;
      const n = near(x, z);
      if (n.d < minD || n.d > maxD) continue;
      fn(x, z, n);
    }
  };
  const exclusions = [];
  const excluded = (x, z) => exclusions.some(([ex, ez, er]) => (x - ex) ** 2 + (z - ez) ** 2 < er * er);

  // ── 농가 (빨간 헛간 + 하얀 집 + 사일로) ──
  const gable = gableGeometry();
  const barns = [], barnRoofs = [], houses = [], houseRoofs = [], silos = [], domes = [], doors = [], trims = [], chimneys = [];
  const farms = [];
  const addFarm = (x, z, ry) => {
    const y = heightAt(x, z);
    const m = (dx, dz, yy, s, sy, sz, rr = ry) => {
      const px = x + dx * Math.cos(ry) + dz * Math.sin(ry), pz = z - dx * Math.sin(ry) + dz * Math.cos(ry);
      return new THREE.Matrix4().compose(V(px, yy, pz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rr), V(s, sy, sz));
    };
    // 헛간
    barns.push(m(0, 0, y + 3.5, 12, 7, 18));
    barnRoofs.push(m(0, 0, y + 6.9, 13.2, 4.6, 19));
    doors.push(m(0, 9.02, y + 2.4, 5, 4.8, 0.1));
    trims.push(m(0, 9.05, y + 2.4, 5.4, 0.25, 0.12), m(0, 9.05, y + 4.8, 5.4, 0.25, 0.12));
    // 집
    houses.push(m(-22, 6, y + 2.9, 10, 5.8, 8));
    houseRoofs.push(m(-22, 6, y + 5.7, 11, 3.2, 9.2));
    chimneys.push(m(-25, 6, y + 7.4, 0.9, 3, 0.9));
    // 사일로 2개
    [[10, -6, 5.5, 20], [16, -6, 4.2, 15]].forEach(([dx, dz, rad, h]) => {
      silos.push(m(dx, dz, y + h / 2, rad, h, rad));
      domes.push(m(dx, dz, y + h, rad, rad * 0.6, rad));
    });
    exclusions.push([x, z, 45]);
    farms.push(V(x, y, z));
  };
  // 시작 지점 근처 농가 하나는 꼭 보이게
  {
    const f = track.frame(track.length * 0.06);
    const lft = V(0, 1, 0).cross(f.tan).normalize();
    const p = f.pos.clone().addScaledVector(lft, 75).addScaledVector(f.tan, 110);
    addFarm(p.x, p.z, Math.atan2(f.pos.x - p.x, f.pos.z - p.z) + 0.5);
  }
  for (let k = 0; k < 400 && farms.length < 11; k++) {
    const x = (r() - 0.5) * 1300, z = (r() - 0.5) * 1300;
    const n = near(x, z);
    if (n.d < 45 || n.d > 300 || excluded(x, z) || farms.some(p => p.distanceTo(V(x, p.y, z)) < 180)) continue;
    if (Math.abs(heightAt(x + 15, z) - heightAt(x - 15, z)) > 4 || Math.abs(heightAt(x, z + 15) - heightAt(x, z - 15)) > 4) continue;
    const p = track.pos[n.i];
    addFarm(x, z, Math.atan2(p.x - x, p.z - z) + (r() - 0.5));
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  const barnCols = barns.map(() => C(['#8e2b22', '#9b3326', '#7f261f', '#a33a2a'][Math.floor(r() * 4)]));
  group.add(instanced(box, std('#ffffff', { roughness: 0.9 }), barns, { receive: true, colors: barnCols }));
  group.add(instanced(gable, std('#4b4d50', { roughness: 0.7, metalness: 0.3 }), barnRoofs));
  group.add(instanced(box, std('#f1ede4'), houses, { receive: true }));
  group.add(instanced(gable, std('#3f3a36'), houseRoofs));
  group.add(instanced(box, std('#6b2a22'), doors, { cast: false }));
  group.add(instanced(box, std('#f2efe8'), trims, { cast: false }));
  group.add(instanced(box, std('#7b4a3a'), chimneys));
  group.add(instanced(new THREE.CylinderGeometry(1, 1, 1, 24), std('#c9cbcc', { metalness: 0.6, roughness: 0.45 }), silos));
  group.add(instanced(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#a9adb0', { metalness: 0.7, roughness: 0.35 }), domes));

  // ── 나무: 길가의 큰 나무, 밭 경계 생울타리, 언덕 숲 ──
  const tg = treeGeometries();
  const broad = [], broadCols = [], pines = [], pineCols = [], bushes = [], bushCols = [];
  place(12, 700, 9000, (x, z, n) => {
    if (excluded(x, z)) return;
    const h = heightAt(x, z);
    const f = field(x, z);
    const woods = fbm(x * 0.006 + 40, z * 0.006 - 9, 3);
    if (h > 25 && woods > 0.5) {                                           // 언덕 숲
      if (r() < 0.55) { pines.push(mat4(x, h - 0.3, z, 0.9 + r() * 0.8, r() * 6)); pineCols.push(C('#2f4a2a').offsetHSL(0, 0, (r() - 0.5) * 0.06)); }
      else { broad.push(mat4(x, h - 0.3, z, 1 + r() * 0.6, r() * 6)); broadCols.push(C('#3f6230').offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.08)); }
    } else if (f.edge && n.d > 16) {                                       // 생울타리 + 띄엄띄엄 큰 나무
      if (r() < 0.25) { broad.push(mat4(x, h - 0.3, z, 0.9 + r() * 0.7, r() * 6)); broadCols.push(C('#4b6e32').offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.08)); }
      else { bushes.push(mat4(x, h + 0.6, z, 1.6 + r() * 1.6, r() * 6, 1 + r() * 0.6)); bushCols.push(C('#46622c').offsetHSL(0, 0, (r() - 0.5) * 0.08)); }
    } else if (n.d > 14 && n.d < 40 && r() < 0.06) {                       // 길가 나무
      broad.push(mat4(x, h - 0.3, z, 1.1 + r() * 0.6, r() * 6)); broadCols.push(C('#557a35').offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.08));
    }
  });
  const leafMat = std('#ffffff', { roughness: 0.95 });
  group.add(instanced(tg.trunk, std('#5b4632'), broad), instanced(tg.crown, leafMat, broad, { colors: broadCols }));
  group.add(instanced(tg.pineTrunk, std('#4e3b2a'), pines), instanced(tg.pine, leafMat, pines, { colors: pineCols }));
  group.add(instanced(lumpy(1, 0, 0, 0, 9), std('#ffffff', { roughness: 1 }), bushes, { colors: bushCols }));

  // ── 건초 더미 (둥근 베일) ──
  const bales = [];
  place(14, 400, 5000, (x, z) => {
    if (bales.length > 170 || excluded(x, z)) return;
    const f = field(x, z);
    if ((f.k !== 2 && f.k !== 3) || f.edge) return;
    const h = heightAt(x, z);
    if (h > 20) return;
    bales.push(mat4(x, h + 0.72, z, 1, r() * 6, 1, Math.PI / 2).multiply(new THREE.Matrix4().makeScale(0.75, 1.3, 0.75)));
  });
  const baleTex = canvasTexture(128, (g, s) => {
    g.fillStyle = '#d4b768'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(120,90,40,0.45)'; g.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) { g.beginPath(); g.moveTo(0, i * 5); g.bezierCurveTo(s * 0.3, i * 5 + 3, s * 0.7, i * 5 - 3, s, i * 5); g.stroke(); }
    speckle(g, s, ['#e8cf86', '#b39550'], 900, 1.5);
  });
  group.add(instanced(new THREE.CylinderGeometry(1, 1, 1, 18), new THREE.MeshStandardMaterial({ map: baleTex, roughness: 1 }), bales));

  // ── 목초지의 소 ──
  const cows = [], cowCols = [];
  place(20, 300, 6000, (x, z) => {
    if (cows.length > 70 || excluded(x, z)) return;
    const f = field(x, z);
    if ((f.k !== 0 && f.k !== 1) || f.edge) return;
    const h = heightAt(x, z);
    if (h > 18) return;
    // 소는 무리 지어
    const n = 2 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const cx = x + (r() - 0.5) * 14, cz = z + (r() - 0.5) * 14;
      cows.push(mat4(cx, heightAt(cx, cz), cz, 1, r() * 6));
      cowCols.push(C(['#f0ece4', '#2a2420', '#6b4228', '#8a5a36', '#efe6d6'][Math.floor(r() * 5)]));
    }
  });
  group.add(instanced(cowGeometry(), std('#ffffff'), cows, { colors: cowCols }));

  // ── 길가 나무 울타리 + 전봇대와 전선 ──
  const posts = [], poles = [], arms = [];
  const fenceOff = hw + 3.4;
  const lifted = s => track.frame(s).pos.y > 0.4 || track.inGap(s);
  alongTrack(track, 3.2, (f, s) => {
    if (lifted(s)) return;
    [-1, 1].forEach(sd => {
      if (Math.floor(s / 260) % 3 === (sd > 0 ? 1 : 2)) return; // 울타리가 끊긴 구간 (밭 입구)
      const p = f.pos.clone().addScaledVector(f.right, sd * fenceOff);
      posts.push(mat4(p.x, p.y + 0.55, p.z, 1, r() * 0.2).multiply(new THREE.Matrix4().makeScale(0.13, 1.25, 0.13)));
    });
  });
  const postMat = std('#7a6a55', { roughness: 1 });
  group.add(instanced(box, postMat, posts));
  // 가로대 (두 줄) — 기둥이 있는 구간만
  const railSkip = [];
  let open = null;
  for (let s = 0; s < track.length; s += 3.2) {
    const sd = 1;
    const gap = lifted(s) || Math.floor(s / 260) % 3 === 1;
    if (gap && open === null) open = s; else if (!gap && open !== null) { railSkip.push([open - 1.6, s - 1.6]); open = null; }
  }
  if (open !== null) railSkip.push([open - 1.6, track.length]);
  const railSkipL = [];
  open = null;
  for (let s = 0; s < track.length; s += 3.2) {
    const gap = lifted(s) || Math.floor(s / 260) % 3 === 2;
    if (gap && open === null) open = s; else if (!gap && open !== null) { railSkipL.push([open - 1.6, s - 1.6]); open = null; }
  }
  if (open !== null) railSkipL.push([open - 1.6, track.length]);
  const railMat = std('#8a7a62', { roughness: 1, side: THREE.DoubleSide });
  [[0.55, 0.68], [0.95, 1.08]].forEach(([a, b]) => {
    group.add(track.buildWall(railMat, fenceOff, a, b, false, railSkip));
    group.add(track.buildWall(railMat, -fenceOff, a, b, true, railSkipL));
  });

  const wirePts = [];
  let prevTop = null;
  alongTrack(track, 42, (f, s) => {
    if (lifted(s)) { prevTop = null; return; }
    const p = f.pos.clone().addScaledVector(f.right, hw + 7.5);
    const yaw = Math.atan2(f.right.x, f.right.z);
    poles.push(mat4(p.x, p.y + 4.7, p.z, 1).multiply(new THREE.Matrix4().makeScale(0.28, 9.4, 0.28)));
    arms.push(mat4(p.x, p.y + 8.7, p.z, 1, yaw).multiply(new THREE.Matrix4().makeScale(0.16, 0.16, 2.6)));
    const tops = [-1.1, 0, 1.1].map(o => V(p.x + f.right.x * o, p.y + 8.85, p.z + f.right.z * o));
    if (prevTop) {
      tops.forEach((t, i) => {
        const a = prevTop[i];
        for (let k = 0; k < 8; k++) {
          const u0 = k / 8, u1 = (k + 1) / 8;
          const sag = u => Math.sin(u * Math.PI) * 0.9;
          wirePts.push(a.x + (t.x - a.x) * u0, a.y + (t.y - a.y) * u0 - sag(u0), a.z + (t.z - a.z) * u0);
          wirePts.push(a.x + (t.x - a.x) * u1, a.y + (t.y - a.y) * u1 - sag(u1), a.z + (t.z - a.z) * u1);
        }
      });
    }
    prevTop = tops;
  });
  group.add(instanced(new THREE.CylinderGeometry(0.5, 0.6, 1, 8), std('#6b5a48', { roughness: 1 }), poles));
  group.add(instanced(box, std('#5e4f40'), arms));
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  group.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: '#2b2b2b', transparent: true, opacity: 0.7 })));

  // ── 길가 풀 포기와 들꽃 ──
  const tufts = [], tuftCols = [], flowers = [], flowerCols = [];
  const tuft = grassClumpGeometry();
  alongTrack(track, 0.9, (f, s) => {
    if (lifted(s)) return;
    for (let k = 0; k < 4; k++) {
      const sd = r() < 0.5 ? -1 : 1;
      const off = hw + 1.2 + Math.pow(r(), 1.4) * 22;
      const p = f.pos.clone().addScaledVector(f.right, sd * off).addScaledVector(f.tan, (r() - 0.5) * 1.2);
      const y = heightAt(p.x, p.z);
      tufts.push(mat4(p.x, y - 0.05, p.z, 0.8 + r() * 0.9, r() * 6, 0.6 + r() * 0.9));
      tuftCols.push(C(r() < 0.22 ? '#c9c07a' : '#8db25a').offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.12));
      if (r() < 0.12) {
        flowers.push(mat4(p.x + 0.3, y + 0.55 + r() * 0.3, p.z, 0.09 + r() * 0.05));
        flowerCols.push(C(['#ffffff', '#f6d43a', '#e9e3f5', '#d65a8a', '#8a7fe0'][Math.floor(r() * 5)]));
      }
    }
  });
  group.add(instanced(tuft, new THREE.MeshStandardMaterial({ map: grassBladeTexture(), alphaTest: 0.45, roughness: 1 }), tufts, { colors: tuftCols, cast: false }));
  group.add(instanced(new THREE.IcosahedronGeometry(1, 0), std('#ffffff', { roughness: 0.8 }), flowers, { colors: flowerCols, cast: false }));

  // ── 먼 언덕 위 풍력 발전기 ──
  const turbines = [];
  const bladeGeo = (() => {
    const b = new THREE.BoxGeometry(1.6, 27, 0.5); b.translate(0, 13.5, 0);
    const parts = [0, 1, 2].map(i => b.clone().rotateZ((i / 3) * Math.PI * 2));
    return mergeGeometries(parts);
  })();
  const white = std('#f2f3f4', { roughness: 0.6 });
  for (let k = 0; k < 400 && turbines.length < 9; k++) {
    const a = r() * Math.PI * 2, d = 650 + r() * 300;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = heightAt(x, z);
    if (h < 60 || turbines.some(t => Math.hypot(t.x - x, t.z - z) < 70)) continue;
    const tw = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.0, 62, 12), white); tower.position.y = 31; tw.add(tower);
    const nac = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 7), white); nac.position.set(0, 62, 0); tw.add(nac);
    const rotor = new THREE.Mesh(bladeGeo, white); rotor.position.set(0, 62, 3.7); rotor.rotation.z = r() * 6; tw.add(rotor);
    tw.position.set(x, h - 1, z);
    tw.rotation.y = Math.atan2(sunDir.x, sunDir.z) + 0.6;
    group.add(tw);
    turbines.push({ x, z, rotor, sp: 0.5 + r() * 0.3 });
  }

  // ── 뭉게구름 ──
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTexture(), fog: false, depthWrite: false, transparent: true, opacity: 0.95 });
  const clouds = new THREE.Group();
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, d = 650 + r() * 950;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 330 + r() * 170;
    const n = 4 + Math.floor(r() * 5);
    const size = 70 + r() * 90;
    for (let k = 0; k < n; k++) {
      const sp = new THREE.Sprite(cloudMat);
      sp.position.set(cx + (r() - 0.5) * size * 1.4, cy + (r() - 0.3) * size * 0.25, cz + (r() - 0.5) * size * 0.8);
      const sc = size * (0.6 + r() * 0.6);
      sp.scale.set(sc * 1.5, sc, 1);
      clouds.add(sp);
    }
  }
  group.add(clouds);

  const update = (t, dt, cam) => {
    sky.userData.update(t);
    turbines.forEach(tb => { tb.rotor.rotation.z += tb.sp * dt; });
    if (cam) clouds.position.set(cam.x * 0.85, 0, cam.z * 0.85); // 멀리 있는 것처럼 천천히 따라옴
  };

  return {
    group, track, sun, sunDir,
    fog: new THREE.Fog('#c3d3df', 240, 1750), exposure: 1.0, bloom: [0.08, 1.5],
    env: { top: '#2f6cc0', mid: '#cfe0ee', bottom: '#5d6a3a' },
    landmarkU: 0.06,
    landmarkPos: farms[0] || null,
    update,
  };
}
