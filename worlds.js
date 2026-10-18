// 세계 투어: 관광도시 6곳 + 숨은 명소 4곳 + 프롤로그/보너스
import * as THREE from 'three';
import { Track } from './track.js';
import { rng, fbm, noise2, smoothstep, canvasTexture, speckle, roadTexture } from './utils.js';
import { V, makeSky, lights, instanced, mat4, trackNearestFn, makeTerrain, alongTrack, lampGeometry, makeParticles } from './scene-kit.js';
import * as P from './props.js';
import { buildHills, buildRamp, buildCircuit, buildClouds } from './worlds-classic.js';

// 닫힌 코스 모양 (반지름에 물결을 더한 루프)
function loop(rx, rz, waves = [], n = 30, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = 1;
    waves.forEach(([f, amp, ph = 0]) => { r += amp * Math.sin(f * a + ph); });
    const x = rx * r * Math.cos(a), z = rz * r * Math.sin(a);
    pts.push(V(x * Math.cos(rot) - z * Math.sin(rot), 0, x * Math.sin(rot) + z * Math.cos(rot)));
  }
  return pts;
}

// ───────── 도시형 세계 공통 빌더 ─────────
function cityWorld(cfg, { lift, gaps } = {}) {
  const group = new THREE.Group();
  const sunDir = cfg.sunDir.clone().normalize();
  const sky = makeSky({ ...cfg.sky, sunDir });
  group.add(sky);
  const sun = lights(group, { ...cfg.light, dir: sunDir });

  const track = new Track(cfg.track, { width: cfg.width || 14, lift, gaps });
  const hw = track.width / 2;
  const near = trackNearestFn(track);
  const r = rng(cfg.seed || 1);

  // 도로
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTexture(cfg.road || {}), roughness: cfg.roadRough ?? 0.8, metalness: cfg.roadMetal ?? 0 });
  group.add(track.buildRoad(roadMat, { thickness: 0.8, sideMaterial: P.std(cfg.roadSide || '#8a8c90') }));
  if (cfg.curb) {
    const curbTex = canvasTexture(128, (g, s) => { g.fillStyle = cfg.curb[0]; g.fillRect(0, 0, s, s / 2); g.fillStyle = cfg.curb[1]; g.fillRect(0, s / 2, s, s / 2); });
    const cm = new THREE.MeshStandardMaterial({ map: curbTex });
    group.add(track.buildStrip(cm, hw, hw + 0.9, 0.05), track.buildStrip(cm, -hw - 0.9, -hw, 0.05));
  }
  if (cfg.sidewalk) {
    const walkTex = canvasTexture(256, (g, s) => {
      g.fillStyle = cfg.sidewalk; g.fillRect(0, 0, s, s);
      speckle(g, s, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.08)'], 3000, 1.6);
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 3; g.strokeRect(0, 0, s, s);
    });
    const wm = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.9 });
    group.add(track.buildStrip(wm, hw, hw + 4, 0.16), track.buildStrip(wm, -hw - 4, -hw, 0.16));
  }
  if (cfg.edgeGlow) {
    const gm = new THREE.MeshStandardMaterial({ color: cfg.edgeGlow, emissive: cfg.edgeGlow, emissiveIntensity: 1.4, side: THREE.DoubleSide });
    group.add(track.buildWall(gm, hw, 0.02, 0.22), track.buildWall(gm, -hw, 0.02, 0.22, true));
  }

  // 지형
  const H = cfg.height || (() => 0);
  const heightAt = (x, z) => {
    const n = near(x, z);
    return H(x, z, n.d) * smoothstep(12, 34, n.d) - 0.35;
  };
  if (cfg.ground !== false) {
    const tex = canvasTexture(256, (g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      speckle(g, s, ['#d9d6cc', '#c8c4b8', '#eeebe2', '#b8b4a8'], 9000, 2.2);
    }, [140, 140]);
    group.add(makeTerrain({ size: 2400, seg: 240, height: heightAt, map: tex, color: (x, z, h, c) => cfg.groundColor(x, z, h, c) }));
  }
  if (cfg.water) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: cfg.water, metalness: 0.85, roughness: 0.12 }));
    w.rotation.x = -Math.PI / 2; w.position.y = cfg.waterY ?? -1.6;
    group.add(w);
  }

  // 랜드마크 배치
  const centroid = track.pos.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / track.n);
  const exclusions = [];
  const landmarks = [];
  (cfg.landmarks || []).forEach(l => {
    const s = track.sAtU(l.u);
    const f = track.frame(s);
    let pos;
    if (l.at) pos = V(l.at[0], 0, l.at[1]);
    else {
      const dir = centroid.clone().sub(f.pos).setY(0).normalize();
      if (l.side === 'out') dir.negate();
      pos = f.pos.clone().addScaledVector(dir, l.dist || 70).setY(0);
    }
    const obj = l.make();
    const base = l.y ?? heightAt(pos.x, pos.z);
    obj.position.set(pos.x, Math.max(base, -0.3) + (l.lift || 0), pos.z);
    obj.rotation.y = Math.atan2(f.pos.x - pos.x, f.pos.z - pos.z) + (l.rot || 0);
    if (l.scale) obj.scale.multiplyScalar(l.scale);
    group.add(obj);
    exclusions.push([pos.x, pos.z, l.clear || 60]);
    landmarks.push({ obj, s, pos, name: l.name });
    if (obj.userData.update) landmarks.push({ update: obj.userData.update });
  });
  const excluded = (x, z) => exclusions.some(([ex, ez, er]) => (x - ex) ** 2 + (z - ez) ** 2 < er * er);

  // 건물
  (cfg.buildings || []).forEach((b, bi) => {
    const spots = [];
    for (let i = 0; i < b.count * 3 && spots.length < b.count; i++) {
      const x = (r() - 0.5) * (b.range || 1400), z = (r() - 0.5) * (b.range || 1400);
      const n = near(x, z);
      if (n.d < b.band[0] || n.d > b.band[1] || excluded(x, z)) continue;
      if (b.filter && !b.filter(x, z)) continue;
      const p = track.pos[n.i];
      spots.push([x, Math.max(heightAt(x, z), -0.3) - 0.5, z, Math.atan2(p.x - x, p.z - z)]);
    }
    group.add(P.buildingField(spots, { ...b, seed: (cfg.seed || 1) * 10 + bi }));
  });

  // 나무
  (cfg.trees || []).forEach((t, ti) => {
    const geo = t.kind === 'palm' ? P.palmGeometry() : t.kind === 'pine' ? P.umbrellaPineGeometry() : P.blobTreeGeometry();
    const crownGeo = geo.crown || geo.leaves;
    const mats = [], cols = [];
    for (let i = 0; i < t.count * 3 && mats.length < t.count; i++) {
      const x = (r() - 0.5) * (t.range || 1200), z = (r() - 0.5) * (t.range || 1200);
      const n = near(x, z);
      if (n.d < t.band[0] || n.d > t.band[1] || excluded(x, z)) continue;
      mats.push(mat4(x, heightAt(x, z) - 0.2, z, (t.size || 1) * (0.8 + r() * 0.5), r() * 6));
      const c = new THREE.Color(t.colors[Math.floor(r() * t.colors.length)]);
      c.offsetHSL(0, 0, (r() - 0.5) * 0.08);
      cols.push(c);
    }
    group.add(instanced(geo.trunk, P.std(t.trunk || '#6b5038'), mats));
    group.add(instanced(crownGeo, P.std('#ffffff', { flatShading: true, side: THREE.DoubleSide }), mats, { colors: cols }));
  });

  // 가로등
  if (cfg.lamps) {
    const lm = [];
    alongTrack(track, 34, (f, s) => {
      if (track.inGap(s)) return;
      const side = Math.floor(s / 34) % 2 ? 1 : -1;
      const q = f.pos.clone().addScaledVector(f.right, side * (hw + 1.2));
      lm.push(mat4(q.x, q.y, q.z, 1, Math.atan2(f.right.x, f.right.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2)));
    });
    group.add(instanced(lampGeometry(), P.std(cfg.lamps, { metalness: 0.6, roughness: 0.4 }), lm));
  }

  const extra = cfg.extras ? cfg.extras({ group, track, heightAt, near, excluded, r, sun, centroid }) : null;

  const updates = [sky.userData.update, ...landmarks.filter(l => l.update).map(l => l.update)];
  if (extra && extra.update) updates.push(extra.update);
  const mainLm = landmarks.find(l => l.obj);
  return {
    group, track, sun, sunDir,
    fog: cfg.fog, exposure: cfg.exposure ?? 1, bloom: cfg.bloom || [0.15, 1.2],
    env: cfg.env, gravity: 0.6,
    landmarkU: cfg.landmarks && cfg.landmarks[0] ? cfg.landmarks[0].u : 0.85,
    landmarkPos: mainLm ? mainLm.pos : null,
    garageCam: { dist: 7.5, height: 1.5 },
    update(t, dt, cam) { updates.forEach(u => u && u(t, dt, cam)); },
  };
}

const C = (h) => new THREE.Color(h);
const mix = (c, a, b, t) => c.copy(a).lerp(b, Math.min(1, Math.max(0, t)));
// 멀리 둘러싼 산
const ringMountains = (x, z, r0, r1, amp, sc = 0.004) => smoothstep(r0, r1, Math.hypot(x, z)) * (0.4 + fbm(x * sc + 7, z * sc + 3)) * amp;

// ───────── 서울 ─────────
function buildSeoul(o) {
  const namsan = [-60, -40];
  return cityWorld({
    seed: 11, sunDir: V(-0.7, 0.18, -0.5),
    sky: { top: '#2b2f6b', mid: '#ff9e7a', bottom: '#6b5a70', sunColor: '#ffb08a', glow: 0.7, sunSize: 0.9992 },
    light: { sky: '#ffc7a8', ground: '#4a4660', hemi: 1.0, sun: '#ffb28a', sunI: 2.2 },
    fog: new THREE.Fog('#c99a9a', 200, 1500), exposure: 0.95, bloom: [0.35, 0.95],
    env: { top: '#2b2f6b', mid: '#ffb08a', bottom: '#40384a' },
    track: loop(300, 210, [[3, 0.08], [5, 0.04, 1]], 30), width: 16,
    road: { base: '#35373c', center: '#f2c230', edge: '#ffffff' }, sidewalk: '#b9b4ab', lamps: '#9aa0a6',
    height: (x, z) => {
      const nam = 70 * Math.exp(-((x - namsan[0]) ** 2 + (z - namsan[1]) ** 2) / (2 * 55 ** 2));
      let h = nam + ringMountains(x, z, 420, 800, 220);
      const river = Math.abs(z - 0.35 * x - 260);
      h -= 5 * (1 - smoothstep(30, 60, river));
      return h;
    },
    water: '#3d5a7a', waterY: -2.2,
    groundColor: (x, z, h, c) => {
      if (h < -1.5) return c.set('#6f7a6a');
      mix(c, C('#6f7d4f'), C('#4e5e3a'), noise2(x * 0.03, z * 0.03));
      if (h > 60) c.lerp(C('#6b6a58'), 0.4);
    },
    landmarks: [
      { name: 'N서울타워', u: 0.85, at: [namsan[0], namsan[1]], make: P.nSeoulTower, y: 69, clear: 80 },
      { name: '롯데월드타워', u: 0.35, side: 'out', dist: 110, make: P.lotteTower, clear: 70 },
      { name: '광화문', u: 0.6, side: 'out', dist: 45, make: P.gwanghwamun, clear: 50, rot: Math.PI },
    ],
    buildings: [
      { count: 160, band: [30, 260], tex: P.windowTexture({ wall: '#e8e6e0', win: '#4a5666', lit: '#ffd9a0', cols: 6, rows: 14, seed: 3 }), colors: ['#f2f0ea', '#e0e3e8', '#d8d2c6', '#c9d0d8'], h: [30, 80], w: [14, 22] },
      { count: 90, band: [26, 200], tex: P.windowTexture({ wall: '#7f93a8', win: '#22303f', lit: '#ffe2b0', cols: 8, rows: 18, seed: 5 }), colors: ['#a9bccd', '#8ea2b8', '#c1cbd6'], h: [40, 120], w: [16, 26] },
    ],
    trees: [{ kind: 'blob', count: 260, band: [16, 40], colors: ['#4f7a3a', '#5c8a40', '#c95b74'] }],
    extras: ({ group, track, r }) => {
      // 네온 간판
      const neon = [], cols = [], poles = [];
      alongTrack(track, 22, (f, s) => {
        const sd = r() < 0.5 ? 1 : -1;
        const p = f.pos.clone().addScaledVector(f.right, sd * (track.width / 2 + 5 + r() * 2));
        const hgt = 2 + r() * 3, y = 4 + r() * 3;
        neon.push(mat4(p.x, y + hgt / 2, p.z, 1, Math.atan2(f.right.x, f.right.z)).multiply(new THREE.Matrix4().makeScale(0.4, hgt, 3 + r() * 3)));
        poles.push(mat4(p.x, y / 2, p.z, 1).multiply(new THREE.Matrix4().makeScale(0.2, y, 0.2)));
        cols.push(C(['#ff3d8b', '#3df0ff', '#ffcf3d', '#7d5cff'][Math.floor(r() * 4)]));
      });
      group.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), neon, { colors: cols, cast: false }));
      group.add(instanced(new THREE.BoxGeometry(1, 1, 1), P.std('#333'), poles, { cast: false }));
      // 한강 다리 조명 띠
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(260, 3, 14), P.std('#8d949c'));
        b.position.set(-500 + i * 420, 4, 0.35 * (-500 + i * 420) + 260); b.rotation.y = -Math.atan(0.35) + Math.PI / 2;
        group.add(b);
      }
    },
  }, o);
}

// ───────── 도쿄 ─────────
function buildTokyo(o) {
  return cityWorld({
    seed: 21, sunDir: V(0.4, 0.6, 0.6),
    sky: { top: '#4b8fd6', mid: '#d6e6f2', bottom: '#b9c2c8', glow: 0.4 },
    light: { sky: '#e1eeff', ground: '#8a8478', hemi: 1.1, sun: '#fff4e6', sunI: 2.6 },
    fog: new THREE.Fog('#d5e2ec', 250, 1700), bloom: [0.2, 1.1],
    env: { top: '#4b8fd6', mid: '#e6eef4', bottom: '#8a8a80' },
    track: loop(290, 230, [[4, 0.07], [2, 0.05, 2]], 30),
    road: { base: '#3b3d42', center: '#ffffff', edge: '#ffffff', dashed: true }, sidewalk: '#c9c6c0', lamps: '#9aa0a6',
    height: (x, z) => ringMountains(x, z, 500, 900, 120),
    groundColor: (x, z, h, c) => mix(c, C('#6e8a4a'), C('#8aa25a'), noise2(x * 0.04, z * 0.04)),
    landmarks: [
      { name: '도쿄타워', u: 0.25, side: 'in', dist: 95, make: P.tokyoTower, clear: 60 },
      { name: '도리이', u: 0.62, side: 'out', dist: 14, make: () => P.torii(1.6), clear: 16, rot: Math.PI / 2 },
      { name: '후지산', u: 0.5, at: [-200, -1500], make: P.mountFuji, y: 0, clear: 10 },
    ],
    buildings: [
      { count: 220, band: [24, 300], tex: P.windowTexture({ wall: '#d8d8d4', win: '#30404f', lit: '#fff1c8', cols: 7, rows: 16, seed: 7 }), colors: ['#e9e6e0', '#cfd4d8', '#bfc5cc', '#f2efe8', '#a8b0b8'], h: [18, 95], w: [12, 22] },
    ],
    trees: [{ kind: 'blob', count: 320, band: [14, 36], colors: ['#f4b6c8', '#f7c8d6', '#eea4bb', '#ffffff'] }],
    extras: ({ group, track, r }) => {
      const neon = [], cols = [], poles = [];
      alongTrack(track, 16, (f) => {
        const sd = r() < 0.5 ? 1 : -1;
        const p = f.pos.clone().addScaledVector(f.right, sd * (track.width / 2 + 5 + r() * 2));
        const hgt = 4 + r() * 4, y = 3 + r() * 3;
        neon.push(mat4(p.x, y + hgt / 2, p.z, 1, Math.atan2(f.right.x, f.right.z)).multiply(new THREE.Matrix4().makeScale(0.4, hgt, 1.6 + r() * 1.6)));
        poles.push(mat4(p.x, y / 2, p.z, 1).multiply(new THREE.Matrix4().makeScale(0.2, y, 0.2)));
        cols.push(C(['#ff2a6d', '#05d9e8', '#ffd319', '#ff6b1a', '#b967ff'][Math.floor(r() * 5)]));
      });
      group.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), neon, { colors: cols, cast: false }));
      group.add(instanced(new THREE.BoxGeometry(1, 1, 1), P.std('#333'), poles, { cast: false }));
      // 흩날리는 벚꽃잎
      const petals = makeParticles(900, 110, '#ffc4d6', 0.35);
      group.add(petals.points);
      return { update: (t, dt, cam) => petals.update(dt * 0.4, cam) };
    },
  }, o);
}

// ───────── 파리 ─────────
function buildParis(o) {
  return cityWorld({
    seed: 31, sunDir: V(0.8, 0.22, -0.4),
    sky: { top: '#5a7fb8', mid: '#ffd2a0', bottom: '#c9b49a', sunColor: '#ffd9a0', glow: 0.8, sunSize: 0.9991 },
    light: { sky: '#ffe4c4', ground: '#8a7a62', hemi: 1.05, sun: '#ffd8a8', sunI: 2.6 },
    fog: new THREE.Fog('#e8cfb0', 220, 1600), bloom: [0.2, 1.05],
    env: { top: '#5a7fb8', mid: '#ffd9b0', bottom: '#8a7a62' },
    track: loop(300, 220, [[3, 0.06, 1], [6, 0.03]], 30), width: 16,
    road: { base: '#4a4a4e', center: '#ffffff', edge: '#ffffff', dashed: true }, sidewalk: '#d9cfbd', lamps: '#2f3a34',
    height: (x, z) => {
      const river = Math.abs(z + 0.2 * x + 330);
      return -4 * (1 - smoothstep(26, 50, river)) + ringMountains(x, z, 600, 1000, 60);
    },
    water: '#4f6f7a', waterY: -2,
    groundColor: (x, z, h, c) => (h < -1.5 ? c.set('#7c8070') : mix(c, C('#7d8f4e'), C('#93a05c'), noise2(x * 0.04, z * 0.04))),
    landmarks: [
      { name: '에펠탑', u: 0.12, side: 'in', dist: 85, make: P.eiffelTower, clear: 55 },
      { name: '개선문', u: 0.55, side: 'out', dist: 40, make: P.arcDeTriomphe, clear: 40, rot: Math.PI / 2 },
    ],
    buildings: [
      { count: 230, band: [24, 260], tex: P.windowTexture({ wall: '#e8dcc4', win: '#56606a', cols: 6, rows: 6, balcony: true, seed: 11 }), colors: ['#efe4cc', '#e6d8bd', '#f2ead8', '#dccfb4'], h: [16, 26], w: [14, 24], roof: true, roofColor: '#5e6670' },
    ],
    trees: [{ kind: 'blob', count: 300, band: [10, 22], colors: ['#5f8a3a', '#6e9842', '#55803a'], size: 1.1 }],
  }, o);
}

// ───────── 로마 ─────────
function buildRome(o) {
  return cityWorld({
    seed: 41, sunDir: V(-0.5, 0.5, 0.6),
    sky: { top: '#3f7fc6', mid: '#f2dcb8', bottom: '#c2a882', glow: 0.5 },
    light: { sky: '#ffe9c8', ground: '#a07c56', hemi: 1.1, sun: '#fff0d4', sunI: 3.0 },
    fog: new THREE.Fog('#ecd9bc', 220, 1500), bloom: [0.15, 1.2],
    env: { top: '#3f7fc6', mid: '#f4e2c4', bottom: '#a07c56' },
    track: loop(270, 230, [[3, 0.09, 2], [5, 0.04]], 30),
    road: { base: '#5a5650', center: '#ffffff', edge: '#ffffff', dashed: true, edgeLines: false }, sidewalk: '#cbb999',
    height: (x, z) => fbm(x * 0.006, z * 0.006) * 30 + ringMountains(x, z, 500, 900, 110),
    groundColor: (x, z, h, c) => mix(c, C('#9a9058'), C('#7e8a48'), noise2(x * 0.03, z * 0.03)),
    landmarks: [
      { name: '콜로세움', u: 0.3, side: 'out', dist: 95, make: P.colosseum, clear: 85 },
      { name: '성 베드로 대성당', u: 0.75, side: 'in', dist: 120, make: P.domeChurch, clear: 70 },
    ],
    buildings: [
      { count: 200, band: [24, 220], tex: P.windowTexture({ wall: '#e0a86a', win: '#5a3a22', cols: 4, rows: 5, seed: 13 }), colors: ['#e3a066', '#d98e58', '#f0c088', '#c97848', '#e8b878'], h: [10, 20], w: [12, 20], roof: true, roofColor: '#b0503a' },
    ],
    trees: [{ kind: 'pine', count: 200, band: [14, 120], colors: ['#3e5a2a', '#4a6a30'] }],
  }, o);
}

// ───────── 뉴욕 ─────────
function buildNewYork(o) {
  return cityWorld({
    seed: 51, sunDir: V(0.5, 0.65, 0.4),
    sky: { top: '#3d7fd0', mid: '#cfe0ee', bottom: '#9fb0c0', glow: 0.4 },
    light: { sky: '#dceaff', ground: '#6a6e72', hemi: 1.1, sun: '#fff6e8', sunI: 2.8 },
    fog: new THREE.Fog('#cad8e4', 260, 1800), bloom: [0.15, 1.2],
    env: { top: '#3d7fd0', mid: '#dfe8f0', bottom: '#6a6e72' },
    track: loop(280, 200, [[4, 0.05], [2, 0.06, 1]], 30), width: 16,
    road: { base: '#38393d', center: '#f2c230', edge: '#ffffff' }, sidewalk: '#bdbab4', lamps: '#4a5056',
    height: (x, z) => (z > 260 ? -8 * smoothstep(260, 300, z) : 0),
    water: '#355a78', waterY: -2.4,
    groundColor: (x, z, h, c) => (h < -1.5 ? c.set('#59616a') : mix(c, C('#7a7c7e'), C('#6a8048'), smoothstep(0.55, 0.7, noise2(x * 0.02, z * 0.02)))),
    landmarks: [
      { name: '자유의 여신상', u: 0.25, at: [60, 520], make: P.statueOfLiberty, y: -2, clear: 40, scale: 1.1 },
    ],
    buildings: [
      { count: 140, band: [26, 260], tex: P.windowTexture({ wall: '#8d9aa8', win: '#1f2a36', lit: '#ffe9b8', cols: 8, rows: 22, seed: 17 }), colors: ['#a8b6c4', '#c4c9cf', '#8c99a8', '#d1c7b8'], h: [60, 200], w: [20, 32], filter: (x, z) => z < 240 },
      { count: 160, band: [24, 200], tex: P.windowTexture({ wall: '#b0644a', win: '#2a2a30', cols: 5, rows: 8, seed: 19 }), colors: ['#b5674c', '#a85a42', '#c27a5c'], h: [15, 35], w: [14, 20], filter: (x, z) => z < 240 },
    ],
    trees: [{ kind: 'blob', count: 140, band: [12, 26], colors: ['#4f7a3a', '#5c8a40'] }],
    extras: ({ group }) => {
      const glass = P.windowTexture({ wall: '#6d8aa8', win: '#24384d', lit: '#fff0c0', cols: 10, rows: 30, seed: 23 });
      const emp = P.skyscraper({ w: 40, d: 36, h: 330, tiers: 4, spire: 60, tex: glass, color: '#c9c2b0' });
      emp.position.set(-30, 0, -20); group.add(emp);
      const wtc = P.skyscraper({ w: 46, d: 46, h: 380, tiers: 1, spire: 80, tex: glass, color: '#b8cfe6', taper: true });
      wtc.position.set(80, 0, 40); group.add(wtc);
      const island = new THREE.Mesh(new THREE.CylinderGeometry(48, 54, 4, 24), P.std('#7a8a5a'));
      island.position.set(60, -1.8, 520); group.add(island);
    },
  }, o);
}

// ───────── 모로코 (숨은 명소) ─────────
function buildMorocco(o) {
  return cityWorld({
    seed: 61, sunDir: V(-0.8, 0.2, 0.4),
    sky: { top: '#3a5aa8', mid: '#ffb070', bottom: '#d89a60', sunColor: '#ffcf8a', glow: 0.9, sunSize: 0.9990 },
    light: { sky: '#ffd0a0', ground: '#b07040', hemi: 1.1, sun: '#ffc890', sunI: 2.8 },
    fog: new THREE.Fog('#f0b888', 200, 1500), bloom: [0.2, 1.1],
    env: { top: '#3a5aa8', mid: '#ffc090', bottom: '#b07040' },
    track: loop(300, 230, [[3, 0.1], [7, 0.025, 1]], 32),
    road: { base: '#9a6a48', center: '#f4e2c0', edge: '#f4e2c0', dashed: true }, roadSide: '#a8744c', curb: ['#2c7a6a', '#f2e6d0'],
    height: (x, z) => {
      const dunes = (Math.sin(x * 0.012 + Math.sin(z * 0.006) * 2) * 0.5 + 0.5) * 18 + fbm(x * 0.01, z * 0.01) * 12;
      return dunes + ringMountains(x, z, 600, 1000, 160);
    },
    groundColor: (x, z, h, c) => {
      mix(c, C('#e0a868'), C('#c9844c'), noise2(x * 0.02, z * 0.02));
      if (h > 90) c.lerp(C('#a86a4a'), 0.5);
    },
    landmarks: [
      { name: '쿠투비아 미너렛', u: 0.2, side: 'in', dist: 80, make: P.minaret, clear: 50 },
      { name: '바브 아그나우 문', u: 0.48, side: 'out', dist: 22, make: () => P.horseshoeGate(), clear: 30, rot: Math.PI / 2 },
    ],
    buildings: [
      // 셰프샤우엔 파란 마을 (트랙 바깥 한쪽 언덕)
      { count: 220, band: [26, 160], range: 1200, tex: P.windowTexture({ wall: '#ffffff', win: '#1d3f8a', cols: 3, rows: 3, seed: 29 }), colors: ['#4a86d8', '#6aa6ee', '#3a6fc0', '#8cc0f5', '#ffffff'], h: [6, 12], w: [7, 12], filter: (x, z) => x > 80 },
      // 흙벽 마을 (마라케시)
      { count: 180, band: [26, 140], range: 1200, tex: P.windowTexture({ wall: '#d08a5a', win: '#4a2a18', cols: 3, rows: 3, seed: 31 }), colors: ['#d4895a', '#c47a4a', '#e09a68'], h: [6, 14], w: [8, 14], filter: (x, z) => x <= 80 },
    ],
    trees: [{ kind: 'palm', count: 180, band: [10, 70], colors: ['#4f7a2e', '#5c8a34'], trunk: '#8a6a48' }],
    extras: ({ group, track, heightAt, r }) => {
      // 낙타 행렬 (간단한 형태)
      const body = [], cols = [];
      for (let i = 0; i < 6; i++) {
        const x = -420 + i * 9, z = 330 + i * 4, y = heightAt(x, z);
        body.push(mat4(x, y + 2.2, z, 1).multiply(new THREE.Matrix4().makeScale(3, 1.4, 1.2)));
        body.push(mat4(x + 1.8, y + 3.2, z, 1).multiply(new THREE.Matrix4().makeScale(0.6, 1.6, 0.5)));
        for (let k = 0; k < 4; k++) body.push(mat4(x + (k < 2 ? 1 : -1), y + 0.9, z + (k % 2 ? 0.4 : -0.4), 1).multiply(new THREE.Matrix4().makeScale(0.25, 1.8, 0.25)));
      }
      group.add(instanced(new THREE.BoxGeometry(1, 1, 1), P.std('#c49a6a'), body));
      // 등불
      const lan = [];
      alongTrack(track, 40, (f, s) => {
        if (track.inGap(s)) return;
        const p = f.pos.clone().addScaledVector(f.right, (track.width / 2 + 2) * (s % 80 < 40 ? 1 : -1));
        lan.push(mat4(p.x, p.y + 3, p.z, 1));
      });
      group.add(instanced(new THREE.OctahedronGeometry(0.6), new THREE.MeshStandardMaterial({ color: '#ffb84a', emissive: '#ff9a20', emissiveIntensity: 2 }), lan, { cast: false }));
    },
  }, o);
}

// ───────── 우유니 소금사막 (숨은 명소) ─────────
function buildUyuni(o) {
  return cityWorld({
    seed: 71, sunDir: V(0.3, 0.7, -0.5),
    sky: { top: '#1d5fc4', mid: '#a8d0f2', bottom: '#a8d0f2', glow: 0.5 },
    light: { sky: '#d8ecff', ground: '#e8eef4', hemi: 1.2, sun: '#ffffff', sunI: 2.4 },
    fog: new THREE.Fog('#b8d8f4', 400, 2200), bloom: [0.15, 1.3], exposure: 0.95,
    env: { top: '#1d5fc4', mid: '#c4e0f8', bottom: '#1d5fc4' },
    track: loop(340, 260, [[2, 0.08], [5, 0.05, 2]], 30), width: 16,
    road: { base: '#d8d2c6', center: '#ffffff', edge: '#a8a29a', dashed: true }, roadSide: '#e8e4dc',
    ground: false,
    extras: ({ group, track, r }) => {
      // 하늘을 비추는 거울 같은 소금 평원
      const hex = canvasTexture(512, (g, s) => {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(160,170,180,0.55)'; g.lineWidth = 3;
        const R = 32;
        for (let y = -1; y < s / (R * 1.5) + 1; y++) for (let x = -1; x < s / (R * 1.73) + 1; x++) {
          const cx = x * R * 1.732 + (y % 2) * R * 0.866, cy = y * R * 1.5;
          g.beginPath();
          for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
          g.closePath(); g.stroke();
        }
      }, [90, 90]);
      const salt = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ map: hex, color: '#ffffff', metalness: 0.92, roughness: 0.06 }));
      salt.rotation.x = -Math.PI / 2; salt.position.y = -0.4; salt.receiveShadow = true;
      group.add(salt);
      // 먼 산맥 (안데스)
      const mts = [];
      for (let i = 0; i < 70; i++) {
        const a = r() * Math.PI * 2, d = 1300 + r() * 400, h = 60 + r() * 160;
        mts.push(mat4(Math.cos(a) * d, h / 2 - 5, Math.sin(a) * d, 1, r() * 3).multiply(new THREE.Matrix4().makeScale(140 + r() * 120, h, 140 + r() * 100)));
      }
      group.add(instanced(new THREE.ConeGeometry(0.5, 1, 6), P.std('#8b6f8a', { flatShading: true }), mts, { cast: false }));
      // 잉카우아시 섬 + 선인장
      const isl = new THREE.Mesh(new THREE.SphereGeometry(60, 16, 10), P.std('#8a6a50', { flatShading: true }));
      isl.scale.set(1.4, 0.35, 1); isl.position.set(0, -2, 0); group.add(isl);
      const cac = [];
      for (let i = 0; i < 90; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 70; const x = Math.cos(a) * d * 1.3, z = Math.sin(a) * d; cac.push(mat4(x, 18 * Math.sqrt(Math.max(0, 1 - (d / 70) ** 2)) - 2, z, 1 + r(), r() * 6)); }
      group.add(instanced(P.cactusGeometry(), P.std('#5c7a3a'), cac));
      // 다카르 기념비 + 국기
      const mon = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 4), P.std('#e0dcd2'));
      const s0 = track.sAtU(0.5), f = track.frame(s0);
      const mp = f.pos.clone().addScaledVector(f.right, track.width / 2 + 18);
      mon.position.set(mp.x, 3.6, mp.z); group.add(mon);
      const flags = ['#d52b1e', '#f9e300', '#007934', '#ffffff', '#3a7bd5'];
      flags.forEach((c, i) => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9), P.std('#ccc'));
        pole.position.set(mp.x - 8 + i * 4, 4.5, mp.z + 6); group.add(pole);
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), P.std(c, { side: THREE.DoubleSide }));
        fl.position.set(mp.x - 6.7 + i * 4, 8.1, mp.z + 6); group.add(fl);
      });
      // 하늘의 뭉게구름 (평원에 비침)
      const puffs = [];
      for (let i = 0; i < 160; i++) {
        const a = r() * Math.PI * 2, d = 500 + r() * 900, y = 160 + r() * 120, s = 20 + r() * 30;
        puffs.push(mat4(Math.cos(a) * d, y, Math.sin(a) * d, s, r() * 6, s * 0.5));
      }
      group.add(instanced(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#c8dcf0', emissiveIntensity: 0.4 }), puffs, { cast: false }));
    },
  }, o);
}

// ───────── 카파도키아 (숨은 명소) ─────────
function buildCappadocia(o) {
  const balloons = [];
  return cityWorld({
    seed: 81, sunDir: V(0.9, 0.15, 0.2),
    sky: { top: '#5872b8', mid: '#ffc4a0', bottom: '#e0b090', sunColor: '#ffe0b0', glow: 0.8, sunSize: 0.9990 },
    light: { sky: '#ffd8c0', ground: '#b08a68', hemi: 1.1, sun: '#ffd0a0', sunI: 2.6 },
    fog: new THREE.Fog('#f0c8a8', 220, 1500), bloom: [0.2, 1.1],
    env: { top: '#5872b8', mid: '#ffd0b0', bottom: '#b08a68' },
    track: loop(290, 240, [[3, 0.08, 1], [4, 0.05]], 30),
    road: { base: '#8a7a6a', center: '#ffffff', edge: '#e8dccc', dashed: true }, roadSide: '#b09a82',
    height: (x, z) => {
      const valley = Math.abs(fbm(x * 0.004, z * 0.004) - 0.5) * 120;
      return valley + ringMountains(x, z, 450, 900, 140);
    },
    groundColor: (x, z, h, c) => {
      mix(c, C('#e2c8a4'), C('#c9a27c'), (h % 20) / 20);
      if (noise2(x * 0.05, z * 0.05) > 0.75) c.lerp(C('#8a9a5a'), 0.6);
    },
    landmarks: [{ name: '우치히사르 성채', u: 0.7, side: 'in', dist: 110, make: () => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.ConeGeometry(45, 80, 12, 4), P.std('#d8bc98', { flatShading: true })); m.position.y = 40; g.add(m); return g; }, clear: 60 }],
    extras: ({ group, track, heightAt, near, excluded, r }) => {
      const fc = P.fairyChimneyGeometry();
      const bodies = [], caps = [];
      for (let i = 0; i < 900 && bodies.length < 320; i++) {
        const x = (r() - 0.5) * 1200, z = (r() - 0.5) * 1200;
        const n = near(x, z);
        if (n.d < 18 || n.d > 200 || excluded(x, z)) continue;
        const cx = x, cz = z, k = 1 + Math.floor(r() * 3);
        for (let j = 0; j < k; j++) {
          const px = cx + (r() - 0.5) * 12, pz = cz + (r() - 0.5) * 12, s = 0.6 + r() * 0.9;
          const m = mat4(px, heightAt(px, pz) - 0.5, pz, s, r() * 6, s * (0.8 + r() * 0.6));
          bodies.push(m); caps.push(m);
        }
      }
      group.add(instanced(fc.body, P.std('#e8d2b0', { flatShading: true }), bodies));
      group.add(instanced(fc.cap, P.std('#7a5a44', { flatShading: true }), caps));
      // 열기구
      const palette = [['#e63946', '#ffd166'], ['#118ab2', '#ffffff'], ['#06d6a0', '#ef476f'], ['#ff7b00', '#7b2cbf'], ['#ffbe0b', '#3a86ff'], ['#ffffff', '#e63946']];
      for (let i = 0; i < 40; i++) {
        const [a, b] = palette[i % palette.length];
        const bl = P.hotAirBalloon(a, b, i);
        const s0 = track.sAtU(r()), f = track.frame(s0);
        const side = r() < 0.5 ? -1 : 1;
        const p = f.pos.clone().addScaledVector(f.right, side * (20 + r() * 160));
        bl.position.set(p.x, 30 + r() * 120, p.z);
        bl.scale.setScalar(0.8 + r() * 0.6);
        bl.userData.baseY = bl.position.y;
        group.add(bl); balloons.push(bl);
      }
      return { update: t => balloons.forEach((b, i) => { b.position.y = b.userData.baseY + Math.sin(t * 0.4 + i) * 3; b.rotation.y = t * 0.05 + i; }) };
    },
  }, o);
}

// ───────── 아이슬란드 (숨은 명소) ─────────
function buildIceland(o) {
  return cityWorld({
    seed: 91, sunDir: V(-0.3, 0.35, -0.8),
    sky: { top: '#030814', mid: '#0e2238', bottom: '#05080e', sunColor: '#cfe4ff', glow: 0.15, sunSize: 0.99985, stars: 1600, aurora: 1.1 },
    light: { sky: '#5f9aa8', ground: '#101418', hemi: 0.9, sun: '#b8d4ff', sunI: 1.3 },
    fog: new THREE.FogExp2('#0c1824', 0.0009), bloom: [0.4, 0.85], exposure: 1.1,
    env: { top: '#0a2030', mid: '#1f5a5a', bottom: '#05080e' },
    track: loop(300, 230, [[3, 0.07], [5, 0.05, 1]], 30),
    road: { base: '#2c2e33', center: '#f2c230', edge: '#ffffff', dashed: true }, roadSide: '#333',
    edgeGlow: '#5fffc0',
    height: (x, z) => fbm(x * 0.008, z * 0.008) * 18 + ringMountains(x, z, 380, 850, 240, 0.005),
    groundColor: (x, z, h, c) => {
      mix(c, C('#2a2c30'), C('#3a4a3a'), noise2(x * 0.03, z * 0.03));
      if (h > 60 + noise2(x * 0.02, z * 0.02) * 40) c.set('#e8f0f8');
    },
    landmarks: [
      { name: '할그림스키르캬', u: 0.15, side: 'in', dist: 90, make: P.hallgrimskirkja, clear: 50 },
      { name: '스코가포스 폭포', u: 0.55, side: 'out', dist: 70, make: () => P.waterfall(26, 60), clear: 60 },
    ],
    buildings: [
      { count: 60, band: [30, 120], tex: P.windowTexture({ wall: '#f0f0ee', win: '#2a3440', lit: '#ffd890', cols: 3, rows: 3, seed: 37 }), colors: ['#e63946', '#f1faee', '#457b9d', '#ffd166', '#2a9d8f'], h: [6, 10], w: [8, 12], roof: true, roofColor: '#3a3a3a', filter: (x, z) => x < 0 },
    ],
    extras: ({ group, track, near, excluded, r }) => {
      // 주상절리: 도로 바깥쪽 60m 지점에 배치
      [[0.32, 3], [0.78, 5]].forEach(([u, seed]) => {
        const f = track.frame(track.sAtU(u));
        const out = f.pos.clone().setY(0).normalize();
        const c = f.pos.clone().addScaledVector(out, 65);
        group.add(P.basaltField(c.x, c.z, 120, seed));
      });
      // 빙하 얼음 조각
      const ice = [], cols = [];
      for (let i = 0; i < 260; i++) {
        const x = (r() - 0.5) * 1200, z = (r() - 0.5) * 1200;
        const n = near(x, z);
        if (n.d < 20 || n.d > 160 || excluded(x, z)) continue;
        const s = 1 + r() * 5;
        ice.push(mat4(x, s * 0.3, z, s, r() * 6, s * 0.7, r(), r()));
        cols.push(C('#bfe6ff').offsetHSL(0, 0, (r() - 0.5) * 0.2));
      }
      group.add(instanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.15, metalness: 0.1, flatShading: true, emissive: '#2a5a7a', emissiveIntensity: 0.3 }), ice, { colors: cols }));
      const snow = makeParticles(1200, 120, '#ffffff', 0.25);
      group.add(snow.points);
      return { update: (t, dt, cam) => snow.update(dt * 0.5, cam) };
    },
  }, o);
}

// LA (기존 언덕 세계 + 다운타운)
const buildLA = o => buildHills(o);

// ───────── 스테이지 / 스토리 데이터 ─────────
// recipe: 스턴트 구간 순서 (stunts.js 참고)
const STAGE_TEMPLATE = [
  { recipe: ['ramp', 'boost', 'ramp', 'cones', 'ramp', 'rings_low', 'mega', 'boost'], mission: { type: 'perfect', n: 2, text: 'PERFECT 착지 2회' }, target: 12000 },
  { recipe: ['drift', 'ramp', 'cars', 'drift', 'boost', 'mega', 'drift', 'cones', 'ramp'], mission: { type: 'drift', n: 2500, text: '드리프트 2,500점' }, target: 16000 },
  { recipe: ['ramp', 'rings', 'gap', 'boost', 'mega', 'rings', 'gap', 'finale'], mission: { type: 'rings', n: 10, text: '스카이 링 10개 통과' }, target: 26000 },
];

function stages(names, overrides = []) {
  return names.map(([name, desc], i) => ({ name, desc, ...STAGE_TEMPLATE[i], ...(overrides[i] || {}) }));
}

export const WORLDS = [
  {
    id: 'lab', group: 'prologue', name: '비밀 테스트 트랙', en: 'SECRET TEST TRACK', flag: '🧪', country: '테슬라 연구소',
    accent: '#ff3448', thumb: 'linear-gradient(160deg,#01020a,#0b1634 60%,#ff2236 61%,#07080c 64%)',
    host: { name: '엔지니어 미라', emoji: '🧑‍🔬' },
    story: [
      '“영상이 유출됐어. 우리가 숨겨 온 하늘을 나는 로드스터, 코드명 SKY.”',
      '“세계 명소를 도는 스카이 투어 스턴트 쇼가 시작되기 전에, 네가 이 차를 길들여야 해.”',
      '“램프에서 점프하고, SPACE로 날아오르고, 착지 직전에 F를 눌러 자세를 잡아!”',
    ],
    build: () => buildRamp(),
    stages: stages([['첫 점프', '램프에서 뛰어올라 착지를 배워요'], ['비행 테스트', '스카이 링을 통과하며 비행을 익혀요'], ['루프 & 스카이', '수직 루프와 공중 회전 마스터']], [
      { recipe: ['ramp', 'ramp', 'boost', 'ramp', 'mega'], mission: { type: 'perfect', n: 2, text: 'PERFECT 착지 2회' }, target: 6000 },
      { recipe: ['rings_low', 'boost', 'rings', 'rings'], mission: { type: 'rings', n: 8, text: '스카이 링 8개 통과' }, target: 9000 },
      { recipe: ['mega', 'rings', 'mega', 'ramp'], mission: { type: 'flips', n: 3, text: '공중 회전 3회' }, target: 14000 },
    ]),
  },
  {
    id: 'seoul', group: 'city', name: '서울', en: 'SEOUL', flag: '🇰🇷', country: '대한민국',
    accent: '#ff6b9a', thumb: 'linear-gradient(160deg,#2b2f6b,#ff9e7a 55%,#3d5a7a 56%,#2a2c40)',
    host: { name: '크리에이터 하늘', emoji: '📹' },
    story: [
      '“스카이 투어 첫 무대는 서울! 노을 지는 한강 위로 생중계 갑니다.”',
      '“남산 위 N서울타워, 저 멀리 롯데월드타워까지 다 보이죠?”',
      '“구독자 100만 명이 보고 있어요. 멋진 착지 부탁해요!”',
    ],
    build: buildSeoul,
    stages: stages([['한강 다리 점프', '강변북로에서 첫 점프 쇼'], ['강남 네온 드리프트', '네온 간판 사이를 미끄러지듯'], ['남산타워 스카이쇼', '타워를 향해 하늘로!']], [{}, { mission: { type: 'combo', n: 6, text: '콤보 6연속' } }, {}]),
  },
  {
    id: 'tokyo', group: 'city', name: '도쿄', en: 'TOKYO', flag: '🇯🇵', country: '일본',
    accent: '#ff4d6d', thumb: 'linear-gradient(160deg,#4b8fd6,#d6e6f2 55%,#f4b6c8 56%,#ff4d1a)',
    host: { name: '레이서 유키', emoji: '🏎️' },
    story: [
      '“ようこそ! 벚꽃이 흩날리는 도쿄에 온 걸 환영해.”',
      '“도쿄타워 너머로 후지산이 보여. 오늘은 날씨가 최고야.”',
      '“도리이를 지나 공중 회전을 보여줘. 관객들이 기다리고 있어!”',
    ],
    build: buildTokyo,
    stages: stages([['시부야 크로싱', '세계에서 가장 붐비는 교차로 점프'], ['벚꽃 드리프트', '분홍빛 가로수길 드리프트'], ['도쿄타워 & 후지산', '타워 옆 하늘길 비행']], [{}, {}, { mission: { type: 'flips', n: 4, text: '공중 회전 4회' } }]),
  },
  {
    id: 'paris', group: 'city', name: '파리', en: 'PARIS', flag: '🇫🇷', country: '프랑스',
    accent: '#ffc46b', thumb: 'linear-gradient(160deg,#5a7fb8,#ffd2a0 55%,#efe4cc 56%,#7a6248)',
    host: { name: '감독 앙투안', emoji: '🎬' },
    story: [
      '“Bonjour! 황금빛 노을의 파리, 영화 같은 장면을 찍어 보자고.”',
      '“센강을 건너 개선문을 돌고, 마지막엔 에펠탑 곁을 날아오르는 거야.”',
      '“카메라 롤링… 액션!”',
    ],
    build: buildParis,
    stages: stages([['샹젤리제 점프', '명품 거리 한복판의 점프'], ['개선문 드리프트', '개선문 앞 회전 교차로'], ['에펠탑 피날레', '철탑 옆으로 날아올라']], [{ mission: { type: 'airtime', n: 8, text: '체공 시간 8초' } }, {}, {}]),
  },
  {
    id: 'rome', group: 'city', name: '로마', en: 'ROME', flag: '🇮🇹', country: '이탈리아',
    accent: '#e8a04a', thumb: 'linear-gradient(160deg,#3f7fc6,#f2dcb8 55%,#e3a066 56%,#7e8a48)',
    host: { name: '가이드 소피아', emoji: '🏛️' },
    story: [
      '“Ciao! 2000년 전 검투사들이 싸우던 콜로세움이 바로 저기야.”',
      '“오늘은 네가 이 도시의 새로운 검투사야. 무기는 날개 달린 테슬라!”',
      '“우산소나무 사이를 질주해서 관중의 함성을 끌어내 줘.”',
    ],
    build: buildRome,
    stages: stages([['포로 로마노 질주', '고대 유적 사이 점프'], ['골목길 드리프트', '테라코타 골목 드리프트'], ['콜로세움 그랑 피날레', '원형 경기장 위를 날아']], [{}, { mission: { type: 'combo', n: 6, text: '콤보 6연속' } }, {}]),
  },
  {
    id: 'newyork', group: 'city', name: '뉴욕', en: 'NEW YORK', flag: '🇺🇸', country: '미국',
    accent: '#ffd23f', thumb: 'linear-gradient(160deg,#3d7fd0,#cfe0ee 50%,#8d9aa8 51%,#355a78)',
    host: { name: 'MC 마커스', emoji: '🎤' },
    story: [
      '“Ladies and gentlemen! 잠들지 않는 도시, 뉴욕에 온 걸 환영합니다!”',
      '“마천루 사이로 점프하고, 허드슨강 너머 자유의 여신상에게 인사하세요.”',
      '“옐로캡은 피해 가는 게 좋을 거예요. 진짜로요!”',
    ],
    build: buildNewYork,
    stages: stages([['타임스퀘어 점프', '광고판 불빛 아래 점프'], ['옐로캡 슬라롬', '택시 사이를 드리프트로'], ['자유의 여신상 플라이바이', '강 위 하늘을 가로질러']], [{}, {}, {}]),
  },
  {
    id: 'la', group: 'city', name: '로스앤젤레스', en: 'LOS ANGELES', flag: '🇺🇸', country: '미국',
    accent: '#4fe3ff', thumb: 'linear-gradient(160deg,#3f86d8,#b9d7ee 55%,#b9a36a 56%,#6f7f3f)',
    host: { name: '스턴트 감독 잭', emoji: '🎥' },
    story: [
      '“할리우드에 온 걸 환영해, 친구! 여기선 모든 게 영화야.”',
      '“다운타운 빌딩 사이로 날아오르는 그 장면, 오늘 우리가 찍는다.”',
      '“언덕 위 SKY HILLS 사인 보이지? 저기까지가 우리 세트장이야.”',
    ],
    build: buildLA,
    stages: stages([['선셋 대로 점프', '야자수 거리 점프'], ['다운타운 드리프트', '빌딩 숲 드리프트'], ['할리우드 힐스 플라이트', '사인 위로 날아올라']], [{}, {}, {}]),
  },
  {
    id: 'morocco', group: 'hidden', name: '모로코', en: 'MOROCCO', flag: '🇲🇦', country: '마라케시 · 셰프샤우엔 · 사하라',
    accent: '#ff9a3d', thumb: 'linear-gradient(160deg,#3a5aa8,#ffb070 50%,#4a86d8 51%,#e0a868 70%)',
    host: { name: '사막 가이드 아미나', emoji: '🐪' },
    story: [
      '“Marhaba! 붉은 도시 마라케시에 온 걸 환영해요.”',
      '“온통 파란 셰프샤우엔 마을을 지나면, 끝없는 사하라의 모래 언덕이 펼쳐져요.”',
      '“모래 언덕은 최고의 점프대예요. 낙타들이 깜짝 놀라지 않게만 해 줘요!”',
    ],
    build: buildMorocco,
    stages: stages([['마라케시 메디나', '붉은 흙벽 시장길 점프'], ['셰프샤우엔 블루 드리프트', '파란 마을 골목 드리프트'], ['사하라 듄 점프', '모래 언덕 위 하늘 비행']], [{}, {}, { mission: { type: 'airtime', n: 12, text: '체공 시간 12초' } }]),
  },
  {
    id: 'uyuni', group: 'hidden', name: '우유니 소금사막', en: 'SALAR DE UYUNI', flag: '🇧🇴', country: '볼리비아',
    accent: '#7ec8ff', thumb: 'linear-gradient(180deg,#1d5fc4,#a8d0f2 50%,#ffffff 51%,#a8d0f2 80%,#1d5fc4)',
    host: { name: '사진작가 마테오', emoji: '📷' },
    story: [
      '“¡Hola! 세상에서 가장 큰 거울, 우유니 소금사막이야.”',
      '“바닥에 하늘이 비쳐서, 마치 구름 위를 달리는 기분이 들 거야.”',
      '“하늘과 땅이 만나는 이곳에서 날아오르면, 사진은 내가 찍을게!”',
    ],
    build: buildUyuni,
    stages: stages([['하늘 거울 질주', '거울 평원 위 첫 점프'], ['소금 사막 드리프트', '육각 소금 결정 위 드리프트'], ['구름 속으로', '하늘과 땅 사이 비행']], [{}, {}, { mission: { type: 'rings', n: 12, text: '스카이 링 12개 통과' } }]),
  },
  {
    id: 'cappadocia', group: 'hidden', name: '카파도키아', en: 'CAPPADOCIA', flag: '🇹🇷', country: '튀르키예',
    accent: '#ff7b5c', thumb: 'linear-gradient(160deg,#5872b8,#ffc4a0 55%,#e2c8a4 56%,#c9a27c)',
    host: { name: '열기구 조종사 에미르', emoji: '🎈' },
    story: [
      '“Merhaba! 새벽 카파도키아는 열기구 수백 개로 하늘이 물들어.”',
      '“요정의 굴뚝이라 불리는 바위 기둥 사이를 달려 봐.”',
      '“열기구 사이로 날아오르면, 오늘의 주인공은 바로 너야!”',
    ],
    build: buildCappadocia,
    stages: stages([['요정 굴뚝 협곡', '바위 기둥 사이 점프'], ['괴레메 드리프트', '협곡 커브 드리프트'], ['열기구 사이로', '수백 개 열기구 속 비행']], [{}, {}, {}]),
  },
  {
    id: 'iceland', group: 'hidden', name: '아이슬란드', en: 'ICELAND', flag: '🇮🇸', country: '레이캬비크 · 남부 해안',
    accent: '#5fffc0', thumb: 'linear-gradient(170deg,#030814,#0e2238 50%,#5fffc0 52%,#0e2238 56%,#2a2c30)',
    host: { name: '오로라 헌터 시그리드', emoji: '🌌' },
    story: [
      '“Halló! 오늘 밤 오로라 지수 최고치야. 운이 좋네!”',
      '“검은 모래 해변과 빙하, 그리고 거대한 폭포가 기다리고 있어.”',
      '“오로라 커튼 속으로 날아오르는 차라니… 전설이 되겠는걸?”',
    ],
    build: buildIceland,
    stages: stages([['검은 모래 해변', '주상절리 옆 점프'], ['빙하 드리프트', '얼음 조각 사이 드리프트'], ['오로라 스카이 점프', '초록 빛 커튼 속으로']], [{}, {}, { mission: { type: 'flips', n: 5, text: '공중 회전 5회' } }]),
  },
  {
    id: 'circuit', group: 'bonus', name: '그랑프리 서킷', en: 'GRAND PRIX', flag: '🏁', country: '보너스',
    accent: '#d71920', thumb: 'linear-gradient(160deg,#8fa3b7,#e3e6e8 55%,#d71920 56%,#f5f5f5 58%,#5f8a3c 60%)',
    host: { name: '레이스 엔지니어', emoji: '🔧' }, story: ['“보너스 무대! 서킷에서 기록과 콤보에 도전하자.”'],
    build: buildCircuit,
    stages: stages([['랩 어택', '서킷 점프'], ['헤어핀 드리프트', '드리프트 마스터'], ['서킷 스카이쇼', '관중석 위 비행']]),
  },
  {
    id: 'clouds', group: 'bonus', name: '구름 하이웨이', en: 'CLOUD HIGHWAY', flag: '☁️', country: '보너스',
    accent: '#ffae2a', thumb: 'linear-gradient(160deg,#2b2466,#ff9a62 55%,#ffe1cc 70%,#f7c6a3)',
    host: { name: '미라', emoji: '🧑‍🔬' }, story: ['“투어 완주 기념! 구름 위 하늘길을 마음껏 날아 봐.”'],
    build: buildClouds,
    stages: stages([['노을 활주로', '구름 위 점프'], ['황금 링 드리프트', '하늘길 드리프트'], ['스카이 피날레', '구름 위 최종 비행']]),
  },
];

export const GROUPS = [
  { id: 'prologue', title: '프롤로그', sub: '비밀 테스트 트랙에서 조작을 익혀요' },
  { id: 'city', title: '세계 6대 관광도시', sub: '랜드마크를 배경으로 스턴트 쇼' },
  { id: 'hidden', title: '숨은 명소', sub: '덜 알려진 절경 속 특별 무대' },
  { id: 'bonus', title: '보너스', sub: '자유 연습 무대' },
];

export { makeSky };
