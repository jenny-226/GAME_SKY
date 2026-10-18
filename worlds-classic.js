// 원래 4개 세계 (LA 언덕 / 네온 테스트 트랙 / 그랑프리 / 구름 하이웨이)
import * as THREE from 'three';
import { Track } from './track.js';
import { rng, fbm, noise2, smoothstep, canvasTexture, speckle, roadTexture } from './utils.js';
import { V, makeSky, lights, instanced, mat4, trackDistanceFn, makeTerrain, alongTrack, textPlane, palmGeometry, treeGeometry, lampGeometry, addTruss, makeParticles } from './scene-kit.js';
import { skyscraper, windowTexture } from './props.js';

// ───────── 세계 1: SKY HILLS (화창한 언덕 도시) ─────────
export function buildHills({ lift, gaps } = {}) {
  const group = new THREE.Group();
  const sunDir = V(-0.4, 0.75, 0.5).normalize();
  group.add(makeSky({ top: '#3f86d8', mid: '#b9d7ee', bottom: '#c9c0a4', sunDir, glow: 0.5 }));
  const sun = lights(group, { sky: '#cfe6ff', ground: '#a08a5c', hemi: 1.1, sun: '#fff1d8', sunI: 3.0, dir: sunDir });

  const track = new Track([
    V(-175, 0, 0), V(-150, 0, -70), V(-90, 0, -105), V(0, 0, -112), V(90, 0, -100), V(160, 0, -60),
    V(180, 0, 10), V(150, 0, 75), V(70, 0, 105), V(-10, 0, 85), V(-80, 0, 108), V(-150, 0, 80),
  ].map(p => p.multiplyScalar(1.45)), { width: 14, lift, gaps });
  const hw = track.width / 2;
  const road = track.buildRoad(new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.85 }));
  group.add(road);

  // 인도 + 연석
  const walkTex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#c9c4b8'; g.fillRect(0, 0, s, s);
    speckle(g, s, ['#b8b2a5', '#d8d3c8', '#a9a397'], 3000, 1.6);
    g.strokeStyle = '#9e988b'; g.lineWidth = 3;
    g.strokeRect(0, 0, s, s); g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
  });
  const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.9 });
  const curbMat = new THREE.MeshStandardMaterial({ color: '#bdb8ad', roughness: 0.8 });
  [[hw, hw + 4.5, false], [-hw - 4.5, -hw, true]].forEach(([a, b, flip]) => {
    group.add(track.buildStrip(walkMat, a, b, 0.18, 4));
    const off = flip ? b : a;
    group.add(track.buildWall(curbMat, off, 0.02, 0.18, flip));
  });

  // 지형: 근처는 평평, 멀리는 산, 북쪽에 큰 언덕
  const dist = trackDistanceFn(track);
  const height = (x, z) => {
    const d = dist(x, z);
    const r = Math.hypot(x, z);
    let h = fbm(x * 0.012, z * 0.012) * 9 * smoothstep(20, 70, d);
    h += smoothstep(170, 460, r) * (0.5 + fbm(x * 0.004 + 5, z * 0.004 + 2)) * 150;
    h += 135 * Math.exp(-((x + 40) ** 2 + (z + 400) ** 2) / (2 * 160 ** 2));
    h += 60 * Math.exp(-((x - 260) ** 2 + (z + 300) ** 2) / (2 * 90 ** 2));
    return h * smoothstep(12, 32, d) - 0.3;
  };
  const dry = new THREE.Color('#b9a36a'), green = new THREE.Color('#6f7f3f'), brush = new THREE.Color('#55622f'), rock = new THREE.Color('#a8957a');
  const grassTex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    speckle(g, s, ['#d9d4c4', '#c7c0a8', '#ece8dc', '#bab29a'], 9000, 2.2);
  }, [120, 120]);
  group.add(makeTerrain({
    height, map: grassTex,
    color: (x, z, h, c) => {
      const n = fbm(x * 0.03 + 9, z * 0.03);
      c.copy(dry).lerp(green, smoothstep(0.45, 0.7, n));
      if (h > 15) c.lerp(brush, smoothstep(0.4, 0.62, fbm(x * 0.02, z * 0.02 + 4)) * 0.85);
      if (h > 90) c.lerp(rock, smoothstep(90, 160, h) * 0.5);
    },
  }));

  // 언덕 위 사인 "SKY HILLS"
  const signX = -40, signZ = -300;
  const sy = height(signX, signZ);
  const slope = Math.atan2(height(signX, signZ - 10) - height(signX, signZ + 10), 20);
  const sign = textPlane('SKY HILLS', { w: 120, h: 24, font: '900 300px Arial Black, Impact, Arial' });
  sign.position.set(signX, sy + 13, signZ);
  sign.rotation.x = -slope * 0.6;
  sign.lookAt(0, sy + 13 + 20, 0);
  group.add(sign);

  // 야자수 / 가로등 (인도 위)
  const palm = palmGeometry();
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a6248', roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#4b7a2e', roughness: 0.8, side: THREE.DoubleSide });
  const palms = [], lamps = [];
  const r = rng(11);
  alongTrack(track, 26, (f, s) => {
    const side = Math.floor(s / 26) % 2 ? 1 : -1;
    const p = f.pos.clone().addScaledVector(f.right, side * (hw + 3.2));
    palms.push(mat4(p.x, 0.18, p.z, 0.85 + r() * 0.4, r() * 6));
    const q = f.pos.clone().addScaledVector(f.right, -side * (hw + 1.0));
    const ang = Math.atan2(f.right.x, f.right.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    lamps.push(mat4(q.x, 0.18, q.z, 1, ang));
  });
  group.add(instanced(palm.trunk, trunkMat, palms), instanced(palm.leaves, leafMat, palms));
  group.add(instanced(lampGeometry(), new THREE.MeshStandardMaterial({ color: '#8d9196', metalness: 0.6, roughness: 0.4 }), lamps));

  // 둥근 나무 + 덤불 (언덕 위 관목)
  const tree = treeGeometry();
  const trees = [], bushes = [], houses = [], roofs = [];
  const treeCols = [], bushCols = [];
  for (let i = 0; i < 2600; i++) {
    const x = (r() - 0.5) * 1300, z = (r() - 0.5) * 1300;
    const d = dist(x, z);
    if (d < 14) continue;
    const h = height(x, z);
    if (i < 380) {
      if (d > 120) continue;
      trees.push(mat4(x, h - 0.2, z, 0.8 + r() * 0.7, r() * 6));
      treeCols.push(new THREE.Color().setHSL(0.24 + r() * 0.06, 0.45, 0.22 + r() * 0.1));
    } else if (i < 520) {
      if (d < 30 || d > 160 || h > 40) continue;
      // 언덕 위 하얀 집들
      const s = 1 + r() * 0.6, ry = r() * 6;
      houses.push(mat4(x, h + 1.8 * s, z, s, ry).multiply(new THREE.Matrix4().makeScale(9, 3.6, 7)));
      roofs.push(mat4(x, h + 3.6 * s + 1.1 * s, z, s, ry + Math.PI / 4).multiply(new THREE.Matrix4().makeScale(8.2, 2.2, 8.2)));
    } else {
      bushes.push(mat4(x, h + 0.3, z, 1.2 + r() * 2.8, r() * 6, 0.8 + r()));
      bushCols.push(new THREE.Color().setHSL(0.2 + r() * 0.08, 0.35, 0.18 + r() * 0.1));
    }
  }
  const crownMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
  group.add(instanced(tree.crown, crownMat, trees, { colors: treeCols }), instanced(tree.trunk, trunkMat, trees));
  group.add(instanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 }), bushes, { colors: bushCols, cast: false }));
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#f1ece2' }), houses, { receive: true }));
  group.add(instanced(new THREE.ConeGeometry(0.72, 1, 4), new THREE.MeshStandardMaterial({ color: '#b5583c', flatShading: true }), roofs));

  // 다운타운 고층 빌딩 숲 (트랙 안쪽 중앙)
  const glassTex = windowTexture({ wall: '#7f9fbf', win: '#2b3f57', cols: 8, rows: 16, seed: 9 });
  const towers = [[0, 0, 34, 230, 2, 18], [45, 30, 28, 170, 1, 0], [-40, 25, 30, 190, 2, 0], [20, -45, 26, 150, 1, 10], [-30, -40, 24, 130, 1, 0], [70, -20, 22, 110, 1, 0], [-75, -5, 26, 120, 1, 0], [60, 65, 20, 95, 1, 0], [-65, 60, 22, 100, 1, 0]];
  towers.forEach(([x, z, w, h, tiers, sp], i) => {
    const t = skyscraper({ w, d: w * (0.8 + (i % 3) * 0.15), h, tiers, spire: sp, tex: glassTex, color: ['#9cc0e0', '#c8d6e6', '#a6b4c4'][i % 3], taper: i === 2 });
    t.position.set(x, 0, z); t.rotation.y = i * 0.4;
    group.add(t);
  });

  return {
    group, track, sun, sunDir, landmarkU: 0.08,
    fog: new THREE.Fog('#c3d6e6', 180, 1500), exposure: 1.0, bloom: [0.12, 1.3],
    env: { top: '#3f86d8', mid: '#dfe9f2', bottom: '#8f8566' },
    traffic: { count: 6, speed: [16, 24], lane: -3.5, dir: -1 },
    coinEvery: 60,
    garageCam: { dist: 7.5, height: 1.6, angle: 2.4 },
  };
}

// ───────── 세계 2: NEON SKY RAMP (밤하늘 루프 램프) ─────────
export function buildRamp() {
  const group = new THREE.Group();
  const sunDir = V(0.3, 0.6, -0.7).normalize();
  group.add(makeSky({ top: '#01020a', mid: '#0b1634', bottom: '#020308', sunDir, sunColor: '#9fb6ff', glow: 0.08, sunSize: 0.99985, stars: 1800 }));
  const sun = lights(group, { sky: '#4a5f99', ground: '#0b0b10', hemi: 0.55, sun: '#c7d5ff', sunI: 1.1, dir: sunDir });

  // 트랙: 직선 → 수직 루프 → 직선 → 유턴 → 하늘로 솟는 언덕 → 유턴
  const pts = [];
  for (let x = -200; x <= -30; x += 34) pts.push(V(x, 0, 0));
  const R = 32, shift = 22;
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push(V(R * Math.sin(a), R * (1 - Math.cos(a)), shift * smoothstep(0, 1, i / 24)));
  }
  for (let x = 30; x <= 200; x += 34) pts.push(V(x, 0, shift));
  for (let i = 1; i < 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    pts.push(V(200 + 79 * Math.cos(a), 0, 101 + 79 * Math.sin(a)));
  }
  const hill = x => 62 * Math.exp(-(((x - 10) / 62) ** 2));
  for (let x = 200; x >= -220; x -= 18) pts.push(V(x, hill(x), 180));
  for (let i = 1; i < 8; i++) {
    const a = Math.PI / 2 + (i / 8) * Math.PI;
    pts.push(V(-220 + 90 * Math.cos(a), 0, 90 + 90 * Math.sin(a)));
  }
  const track = new Track(pts, { width: 12, samples: 3000 });
  const hw = track.width / 2;

  const concrete = canvasTexture(512, (g, s) => {
    g.fillStyle = '#8d9096'; g.fillRect(0, 0, s, s);
    speckle(g, s, ['#7d8086', '#9da0a6', '#a8abb0', '#73767c'], 12000, 2);
    g.fillStyle = '#f4f4f4'; g.fillRect(s * 0.494, 0, s * 0.012, s * 0.55);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, s - 4, s, 4);
  });
  const roadMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.7, side: THREE.DoubleSide });
  const underMat = new THREE.MeshStandardMaterial({ color: '#3b3e44', roughness: 0.9, side: THREE.DoubleSide });
  group.add(track.buildRoad(roadMat, { thickness: 0.7, sideMaterial: underMat }));
  // 네온 가장자리
  const neon = new THREE.MeshStandardMaterial({ color: '#ff3040', emissive: '#ff2236', emissiveIntensity: 1.6, side: THREE.DoubleSide });
  group.add(track.buildWall(neon, hw, 0.02, 0.18), track.buildWall(neon, -hw, 0.02, 0.18, true));
  group.add(track.buildStrip(neon, hw - 0.15, hw, 0.035), track.buildStrip(neon, -hw, -hw + 0.15, 0.035));

  // 땅: 어두운 바닥 + 은은한 격자
  const gridTex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#07080c'; g.fillRect(0, 0, s, s);
    speckle(g, s, ['#0c0d12', '#111218', '#050608'], 4000, 2);
    g.strokeStyle = 'rgba(80,120,255,0.18)'; g.lineWidth = 2;
    g.strokeRect(0, 0, s, s);
  }, [200, 200]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: gridTex, roughness: 0.35, metalness: 0.4 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.8; ground.receiveShadow = true;
  group.add(ground);

  // 트러스 기둥 (평평한 높은 구간 아래)
  const truss = [];
  alongTrack(track, 9, f => {
    if (f.pos.y < 3 || f.up.y < 0.85) return;
    [-1, 1].forEach(sd => {
      const p = f.pos.clone().addScaledVector(f.right, sd * (hw + 1.1));
      addTruss(truss, p.x, p.z, -0.8, p.y - 0.4, 1.2, Math.atan2(f.tan.x, f.tan.z));
    });
  });
  // 루프 옆 거대한 철골 갠트리
  const gTop = R * 2 + 10;
  [-18, shift + 18].forEach(z => {
    [-14, 14].forEach(x => addTruss(truss, x, z, -0.8, gTop, 2.4));
  });
  for (let z = -18; z <= shift + 18; z += 2.4) {
    [-14, 14].forEach(x => {
      truss.push(mat4(x, gTop, z, 1).multiply(new THREE.Matrix4().makeScale(2.4, 0.12, 0.12)));
    });
  }
  for (let x = -14; x <= 14; x += 2.4) {
    [-18, shift + 18].forEach(z => truss.push(mat4(x, gTop, z, 1).multiply(new THREE.Matrix4().makeScale(0.12, 0.12, 2.4))));
  }
  const steel = new THREE.MeshStandardMaterial({ color: '#5d6168', metalness: 0.85, roughness: 0.35 });
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), steel, truss));

  // 갠트리 위 조명
  const lampMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 4 });
  [-18, shift + 18].forEach(z => [-14, 14].forEach(x => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.6, 0.6), lampMat);
    l.position.set(x, gTop + 1, z); group.add(l);
  }));
  const spot = new THREE.PointLight('#e9efff', 900, 160, 1.6);
  spot.position.set(0, gTop + 4, shift / 2);
  group.add(spot);

  // 먼 도시 스카이라인 (불 켜진 창문)
  const winTex = canvasTexture(128, (g, s) => {
    g.fillStyle = '#05060a'; g.fillRect(0, 0, s, s);
    const r = rng(3);
    for (let y = 4; y < s; y += 10) for (let x = 4; x < s; x += 9) {
      if (r() < 0.25) { g.fillStyle = r() < 0.7 ? '#c99a55' : '#6f9fd0'; g.fillRect(x, y, 4, 5); }
    }
  }, [3, 6]);
  const bmat = new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: '#ffffff', emissiveIntensity: 0.6, color: '#111' });
  const blds = [];
  const r = rng(21);
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2, d = 900 + r() * 600;
    const h = 40 + r() * 160, w = 18 + r() * 30;
    blds.push(mat4(Math.cos(a) * d, h / 2 - 0.8, Math.sin(a) * d, 1, r() * 3).multiply(new THREE.Matrix4().makeScale(w, h, w)));
  }
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), bmat, blds, { cast: false }));

  // 부스트 패드 (루프와 언덕 앞)
  const boosts = [];
  const loopStart = track.length * 0; // 시작 직선 끝부분
  for (let s = 0; s < track.length; s += 2) {
    const f = track.frame(s);
    if (Math.abs(f.pos.z) < 1 && f.pos.x > -110 && f.pos.x < -80 && f.up.y > 0.99) { boosts.push(s); s += 60; }
    else if (Math.abs(f.pos.z - 180) < 1 && f.pos.x > 120 && f.pos.x < 150) { boosts.push(s); s += 60; }
  }

  return {
    group, track, sun, sunDir,
    fog: new THREE.FogExp2('#05070f', 0.0011), exposure: 1.0, bloom: [0.55, 0.8],
    env: { top: '#0a1230', mid: '#1c2850', bottom: '#050508' },
    boosts, gravity: 0.75,
    coinEvery: 45,
    garageCam: { dist: 8, height: 1.4, angle: 2.6 },
    update(t) { neon.emissiveIntensity = 1.5 + Math.sin(t * 3) * 0.35; },
  };
}

// ───────── 세계 3: GRAND PRIX (안개 낀 서킷) ─────────
export function buildCircuit({ lift, gaps } = {}) {
  const group = new THREE.Group();
  const sunDir = V(0.5, 0.55, 0.3).normalize();
  group.add(makeSky({ top: '#8fa3b7', mid: '#e3e6e8', bottom: '#b9bcb6', sunDir, sunColor: '#fff6e0', glow: 0.25, sunSize: 0.9996 }));
  const sun = lights(group, { sky: '#e6edf5', ground: '#6b7560', hemi: 1.2, sun: '#fff6e4', sunI: 2.0, dir: sunDir });

  const track = new Track([
    V(-250, 0, 0), V(-50, 0, 0), V(150, 0, 0), V(230, 0, -20), V(262, 0, -80), V(222, 0, -142), V(125, 0, -150),
    V(62, 0, -108), V(0, 0, -150), V(-80, 0, -205), V(-200, 0, -192), V(-262, 0, -120), V(-292, 0, -50),
  ], { width: 16, lift, gaps });
  const hw = track.width / 2;
  group.add(track.buildRoad(new THREE.MeshStandardMaterial({ map: roadTexture({ base: '#34363a', center: '#ffffff', dashed: true, edge: '#ffffff' }), roughness: 0.8 }), { uvScale: 16 }));

  // 빨강/흰색 연석
  const curbTex = canvasTexture(128, (g, s) => {
    g.fillStyle = '#d71920'; g.fillRect(0, 0, s, s / 2);
    g.fillStyle = '#f5f5f5'; g.fillRect(0, s / 2, s, s / 2);
  });
  const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.6 });
  group.add(track.buildStrip(curbMat, hw, hw + 1.4, 0.06, 4), track.buildStrip(curbMat, -hw - 1.4, -hw, 0.06, 4));
  // 런오프 (밝은 아스팔트)
  const runMat = new THREE.MeshStandardMaterial({ color: '#7d7f82', roughness: 0.9 });
  group.add(track.buildStrip(runMat, hw + 1.4, hw + 7, 0.03), track.buildStrip(runMat, -hw - 7, -hw - 1.4, 0.03));
  // 콘크리트 벽 (흰/파랑)
  const wallTex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#1f4fa8'; g.fillRect(0, s * 0.62, s, s * 0.38);
    g.fillStyle = '#1f4fa8'; g.font = '900 70px Arial'; g.textAlign = 'center'; g.fillText('SKY GP', s / 2, s * 0.45);
  });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.7, side: THREE.DoubleSide });
  group.add(track.buildWall(wallMat, hw + 9, 0, 1.2), track.buildWall(wallMat, -hw - 9, 0, 1.2, true));

  // 잔디 지형
  const dist = trackDistanceFn(track);
  const grassTex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    speckle(g, s, ['#dfe8d6', '#c8d4bd', '#eef3ea'], 8000, 2);
    g.globalAlpha = 0.08; g.fillStyle = '#000'; g.fillRect(0, 0, s, s / 2);
  }, [160, 160]);
  const gA = new THREE.Color('#5f8a3c'), gB = new THREE.Color('#759c48');
  group.add(makeTerrain({
    map: grassTex,
    height: (x, z) => {
      const r = Math.hypot(x + 20, z + 90);
      return smoothstep(380, 800, r) * fbm(x * 0.004, z * 0.004) * 110 * smoothstep(20, 40, dist(x, z)) - 0.2;
    },
    color: (x, z, h, c) => c.copy(gA).lerp(gB, noise2(x * 0.05, z * 0.05)),
  }));

  // 관중석 (메인 직선 바깥쪽 z>0)
  const standMat = new THREE.MeshStandardMaterial({ color: '#9aa2ab', roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.5, metalness: 0.3 });
  const seats = [], crowd = [], crowdCols = [];
  const r = rng(5);
  for (let xs = -200; xs <= 110; xs += 62) {
    for (let row = 0; row < 12; row++) {
      seats.push(new THREE.Matrix4().compose(V(xs + 28, 0.6 + row * 0.9, 22 + row * 1.2), new THREE.Quaternion(), V(56, 1.2 + row * 1.8, 1.2)));
      for (let k = 0; k < 40; k++) {
        if (r() < 0.25) continue;
        crowd.push(mat4(xs + 1 + k * 1.38, 1.4 + row * 0.9 + row * 0.9, 21.6 + row * 1.2, 1).multiply(new THREE.Matrix4().makeScale(0.5, 0.9, 0.4)));
        crowdCols.push(new THREE.Color().setHSL(r(), 0.6, 0.35 + r() * 0.3));
      }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(58, 0.5, 18), roofMat);
    roof.position.set(xs + 28, 24, 29); roof.rotation.x = -0.08; roof.castShadow = true;
    group.add(roof);
    [0, 56].forEach(dx => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 24), standMat);
      col.position.set(xs + dx, 12, 37); group.add(col);
    });
  }
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), standMat, seats, { receive: true }));
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff' }), crowd, { colors: crowdCols, cast: false }));

  // 출발/결승 갠트리 + 체커 라인
  const gantry = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: '#2b2f36', metalness: 0.6, roughness: 0.4 });
  [-hw - 3, hw + 3].forEach(z => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), gm); p.position.set(0, 4.5, z); p.castShadow = true; gantry.add(p);
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2, hw * 2 + 7), gm); beam.position.set(0, 8.5, 0); gantry.add(beam);
  const banner = textPlane('SKY GRAND PRIX', { w: 18, h: 1.8, bg: '#c4161c', font: '900 160px Arial' });
  banner.position.set(-0.72, 8.5, 0); banner.rotation.y = -Math.PI / 2; gantry.add(banner);
  const lightsRed = new THREE.MeshStandardMaterial({ color: '#300', emissive: '#ff2020', emissiveIntensity: 3 });
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), lightsRed);
    l.position.set(-0.8, 9.1, -3 + i * 1.5); gantry.add(l);
  }
  gantry.position.set(-50, 0, 0);
  group.add(gantry);
  const checker = canvasTexture(128, (g, s) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * s / 8, y * s / 2, s / 8, s / 2); }
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(2, track.width), new THREE.MeshStandardMaterial({ map: checker }));
  line.rotation.x = -Math.PI / 2; line.position.set(-50, 0.035, 0); group.add(line);

  // 나무 줄, 타이어 벽, 먼 건물
  const tree = treeGeometry();
  const trees = [], cols = [], tires = [], blds = [];
  for (let i = 0; i < 1600; i++) {
    const x = (r() - 0.5) * 1100 - 20, z = (r() - 0.5) * 900 - 90;
    const d = dist(x, z);
    if (d < 30 || (z > 10 && z < 50 && x > -210 && x < 180)) continue;
    trees.push(mat4(x, -0.2, z, 0.9 + r() * 0.9, r() * 6));
    cols.push(new THREE.Color().setHSL(0.27 + r() * 0.05, 0.4, 0.18 + r() * 0.08));
  }
  alongTrack(track, 7, f => {
    const k = f.pos.clone().addScaledVector(f.right, -hw - 9.8);
    tires.push(mat4(k.x, 0.3, k.z, 1)); tires.push(mat4(k.x, 0.75, k.z, 1));
  });
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2, d = 520 + r() * 300;
    const h = 20 + r() * 70;
    blds.push(mat4(Math.cos(a) * d - 20, h / 2, Math.sin(a) * d - 90, 1, r() * 3).multiply(new THREE.Matrix4().makeScale(30 + r() * 30, h, 25 + r() * 20)));
  }
  group.add(instanced(tree.crown, new THREE.MeshStandardMaterial({ color: '#fff', flatShading: true, roughness: 0.9 }), trees, { colors: cols }));
  group.add(instanced(tree.trunk, new THREE.MeshStandardMaterial({ color: '#5b4632' }), trees));
  group.add(instanced(new THREE.TorusGeometry(0.4, 0.2, 6, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 }), tires));
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#b9bfc6', roughness: 0.8 }), blds, { cast: false }));

  // 흩날리는 눈/먼지 입자
  const snow = makeParticles(1600, 120, '#ffffff', 0.25);
  group.add(snow.points);

  return {
    group, track, sun, sunDir,
    fog: new THREE.Fog('#dfe3e6', 90, 900), exposure: 1.0, bloom: [0.1, 1.3],
    env: { top: '#9eb1c4', mid: '#eef0f2', bottom: '#7f8a72' },
    traffic: { count: 5, speed: [30, 42], lane: 0, dir: 1, racers: true },
    coinEvery: 70,
    garageCam: { dist: 7.2, height: 1.3, angle: 2.3 },
    update(t, dt, cam) { snow.update(dt, cam); },
  };
}

// ───────── 세계 4: CLOUD HIGHWAY (구름 위 노을 도로) ─────────
export function buildClouds({ lift, gaps } = {}) {
  const group = new THREE.Group();
  const sunDir = V(0.85, 0.12, -0.5).normalize();
  group.add(makeSky({ top: '#2b2466', mid: '#ff9a62', bottom: '#f7c6a3', sunDir, sunColor: '#ffd9a0', glow: 0.9, sunSize: 0.9988 }));
  const sun = lights(group, { sky: '#ffb38a', ground: '#7d6aa8', hemi: 1.0, sun: '#ffc48a', sunI: 2.4, dir: sunDir });

  const pts = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const rr = 270 + 60 * Math.sin(a * 2) + 25 * Math.cos(a * 5);
    pts.push(V(Math.cos(a) * rr, 22 * Math.sin(a * 3), Math.sin(a) * rr));
  }
  const track = new Track(pts, { width: 14, lift, gaps });
  const hw = track.width / 2;
  group.add(track.buildRoad(new THREE.MeshStandardMaterial({ map: roadTexture({ base: '#2d2f3a', center: '#7fe6ff', edge: '#ffffff', dashed: true }), roughness: 0.6 }), {
    thickness: 0.9, sideMaterial: new THREE.MeshStandardMaterial({ color: '#e9e3f5', roughness: 0.5 }),
  }));
  const glow = new THREE.MeshStandardMaterial({ color: '#7fe6ff', emissive: '#59dcff', emissiveIntensity: 1.4, side: THREE.DoubleSide });
  group.add(track.buildWall(glow, hw, 0.02, 0.3), track.buildWall(glow, -hw, 0.02, 0.3, true));

  // 구름 덩어리
  const r = rng(31);
  const puffs = [], pcols = [];
  const cloud = (cx, cy, cz, size) => {
    const n = 5 + Math.floor(r() * 6);
    for (let i = 0; i < n; i++) {
      const s = size * (0.5 + r() * 0.7);
      puffs.push(mat4(cx + (r() - 0.5) * size * 3, cy + (r() - 0.3) * size * 0.6, cz + (r() - 0.5) * size * 2, s, r() * 6, s * 0.6));
      pcols.push(new THREE.Color().setHSL(0.03 + r() * 0.05, 0.6, 0.86 + r() * 0.1));
    }
  };
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2, d = r() * 900;
    cloud(Math.cos(a) * d, -45 - r() * 40, Math.sin(a) * d, 14 + r() * 22);
  }
  // 도로 옆 가까운 구름
  alongTrack(track, 40, f => {
    const sd = r() < 0.5 ? -1 : 1;
    const p = f.pos.clone().addScaledVector(f.right, sd * (hw + 25 + r() * 40));
    cloud(p.x, p.y - 12 - r() * 10, p.z, 8 + r() * 8);
  });
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffb08a', emissiveIntensity: 0.12 });
  group.add(instanced(new THREE.IcosahedronGeometry(1, 2), cloudMat, puffs, { colors: pcols, cast: false }));

  // 떠 있는 섬
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8a6a5a', flatShading: true, roughness: 1 });
  const topMat = new THREE.MeshStandardMaterial({ color: '#6fa84a', flatShading: true });
  const tree = treeGeometry();
  const tmats = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + r() * 0.2, d = i % 2 ? 140 : 430 + r() * 150;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = 10 + r() * 50, s = 18 + r() * 22;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(s, s * 1.6, 7), rockMat);
    rock.rotation.x = Math.PI; rock.position.set(x, y - s * 0.8, z); group.add(rock);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 0.98, 2.5, 7), topMat);
    top.position.set(x, y + 1, z); top.receiveShadow = true; group.add(top);
    for (let k = 0; k < 5; k++) tmats.push(mat4(x + (r() - 0.5) * s, y + 2, z + (r() - 0.5) * s, 0.8 + r() * 0.6, r() * 6));
  }
  group.add(instanced(tree.crown, new THREE.MeshStandardMaterial({ color: '#4f8f3a', flatShading: true }), tmats));
  group.add(instanced(tree.trunk, new THREE.MeshStandardMaterial({ color: '#5b4632' }), tmats));

  // 황금 링 게이트
  const ringMat = new THREE.MeshStandardMaterial({ color: '#ffcc55', emissive: '#ffae2a', emissiveIntensity: 2.2, metalness: 0.8, roughness: 0.3 });
  alongTrack(track, 160, f => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(hw + 2, 0.45, 10, 40), ringMat);
    ring.position.copy(f.pos);
    ring.lookAt(f.pos.clone().add(f.tan));
    group.add(ring);
  }, 80);

  return {
    group, track, sun, sunDir,
    fog: new THREE.Fog('#f2b59a', 200, 1400), exposure: 0.9, bloom: [0.3, 1.15],
    env: { top: '#3a2f78', mid: '#ffb48a', bottom: '#f8d8c0' },
    gravity: 0.6,
    coinEvery: 50,
    garageCam: { dist: 7.5, height: 1.5, angle: 2.2 },
    update(t) { ringMat.emissiveIntensity = 1.8 + Math.sin(t * 2) * 0.5; },
  };
}

