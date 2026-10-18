// GAME SKY - 메인 게임 로직
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WORLDS, makeSky } from './worlds.js';
import { buildCar, MODELS, COLORS, WHEELS, SPOILERS, STANCES } from './cars.js';

// ───────── 저장 데이터 ─────────
const DEFAULT = { model: 'model3', color: 'pearl', custom: '#33c3ff', wheel: 'aero', spoiler: 'none', stance: 'normal', world: 'hills', coins: 0, best: {} };
let save = { ...DEFAULT };
try { save = { ...DEFAULT, ...JSON.parse(localStorage.getItem('gamesky-save') || '{}') }; } catch (e) { /* 저장소 사용 불가 */ }
function persist() { try { localStorage.setItem('gamesky-save', JSON.stringify(save)); } catch (e) { /* 무시 */ } }
if (!MODELS[save.model]) save.model = DEFAULT.model;
if (!WORLDS.find(w => w.id === save.world)) save.world = DEFAULT.world;

// ───────── 렌더러 ─────────
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
let scene = new THREE.Scene();
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.6, 0.85);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const pmrem = new THREE.PMREMGenerator(renderer);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ───────── 상태 ─────────
let world = null;
let car = null;
let mode = 'menu';
const traffic = [];
let coins = [], coinMesh = null;
let pads = [];
const player = { s: 8, d: 0, v: 0, steer: 0, lap: 1, lapStart: 0, time: 0, lapTime: 0, boost: 0, shake: 0, spin: 0 };
const input = { left: false, right: false, gas: false, brake: false };
const $ = id => document.getElementById(id);

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
  });
}

// ───────── 월드 불러오기 ─────────
function loadWorld(id) {
  $('loading').classList.add('show');
  return new Promise(resolve => setTimeout(() => {
    if (world) { disposeTree(world.group); }
    scene = new THREE.Scene();
    renderPass.scene = scene;
    const def = WORLDS.find(w => w.id === id) || WORLDS[0];
    world = def.build();
    world.def = def;
    scene.add(world.group);
    scene.fog = world.fog;
    renderer.toneMappingExposure = world.exposure;
    bloom.strength = world.bloom[0];
    bloom.threshold = world.bloom[1];

    // 하늘 색으로 반사 환경맵 만들기
    const envScene = new THREE.Scene();
    envScene.add(makeSky({ ...world.env, sunDir: world.sunDir, glow: 0.6 }));
    if (scene.environment) scene.environment.dispose();
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;

    buildCoins();
    buildPads();
    buildTraffic();
    spawnPlayer();
    $('loading').classList.remove('show');
    resolve();
  }, 30));
}

function spawnPlayer() {
  if (car) { scene.remove(car); }
  car = buildCar(save);
  scene.add(car);
  Object.assign(player, { s: 8, d: world.traffic && world.traffic.dir < 0 ? 3.5 : 0, v: 0, steer: 0, lap: 1, lapStart: 8, time: 0, lapTime: 0, boost: 0, shake: 0 });
  placeCar(car, player.s, player.d, 0, 0);
}

function rebuildCar() {
  if (!world) return;
  if (car) { scene.remove(car); disposeTree(car); }
  car = buildCar(save);
  scene.add(car);
  placeCar(car, player.s, player.d, 0, 0);
}

// ───────── 코인 / 부스트 / 교통 ─────────
function buildCoins() {
  coins = [];
  const tr = world.track;
  const every = world.coinEvery || 60;
  const hw = tr.width / 2 - 2;
  let k = 0;
  for (let s = 60; s < tr.length - 20; s += every) {
    const lane = [-1, 0, 1][Math.floor((k++ * 7) % 3)] * hw * 0.6;
    for (let i = 0; i < 5; i++) coins.push({ s: s + i * 4, d: lane, taken: false });
  }
  const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24).rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.25 });
  coinMesh = new THREE.InstancedMesh(geo, mat, coins.length);
  coinMesh.castShadow = true;
  scene.add(coinMesh);
}

function buildPads() {
  pads = [];
  const tex = new THREE.CanvasTexture((() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#0b1a2a'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#39e6ff';
    for (let i = 0; i < 3; i++) { const y = 200 - i * 80; g.beginPath(); g.moveTo(14, y); g.lineTo(64, y - 50); g.lineTo(114, y); g.lineTo(114, y + 22); g.lineTo(64, y - 28); g.lineTo(14, y + 22); g.fill(); }
    return c;
  })());
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: '#39e6ff', emissiveMap: tex, emissiveIntensity: 2 });
  (world.boosts || []).forEach(s => {
    const f = world.track.frame(s);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 10), mat);
    const p = f.pos.clone().addScaledVector(f.up, 0.05);
    m.position.copy(p);
    const left = f.right.clone().negate();
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, f.tan, f.up));
    scene.add(m);
    pads.push(s);
  });
}

function buildTraffic() {
  traffic.length = 0;
  const t = world.traffic;
  if (!t) return;
  const ids = Object.keys(MODELS);
  for (let i = 0; i < t.count; i++) {
    const cfg = {
      model: ids[(i * 3 + 1) % ids.length], color: COLORS[(i * 5 + 2) % COLORS.length].id,
      wheel: WHEELS[i % WHEELS.length].id, spoiler: t.racers ? 'wing' : 'none', stance: 'normal',
    };
    const mesh = buildCar(cfg);
    scene.add(mesh);
    const lane = t.racers ? [-4, 0, 4][i % 3] : t.lane;
    traffic.push({
      mesh, s: t.racers ? 20 + i * 14 : (world.track.length / t.count) * i + 120, d: lane, baseD: lane,
      v: t.speed[0] + ((i * 37) % 10) / 10 * (t.speed[1] - t.speed[0]), dir: t.dir, L: MODELS[cfg.model].L,
    });
  }
}

// ───────── 차 배치 ─────────
const _f = {};
const _m = new THREE.Matrix4();
function placeCar(obj, s, d, yaw = 0, roll = 0, flip = false) {
  const f = world.track.frame(s, _f);
  const tan = flip ? f.tan.clone().negate() : f.tan;
  const left = new THREE.Vector3().crossVectors(f.up, tan).normalize();
  obj.position.copy(f.pos).addScaledVector(f.right, d).addScaledVector(f.up, 0.02);
  _m.makeBasis(left, f.up, tan);
  obj.quaternion.setFromRotationMatrix(_m);
  if (yaw) obj.rotateY(yaw);
  const body = obj.userData.body;
  if (body) body.rotation.x = roll; // 차체 롤(좌우 기울기) — 피벗 회전으로 길이 방향 축
  return f;
}

function spinWheels(obj, v, dt, steer = 0) {
  const ws = obj.userData.wheels || [];
  const r = obj.userData.spec ? obj.userData.spec.r : 0.35;
  ws.forEach(w => {
    w.userData.spinner.rotation.z -= (v * dt / r) * (w.userData.sign || 1);
    if (w.userData.front) w.rotation.y = (w.userData.sign < 0 ? Math.PI : 0) + steer * 0.45;
  });
}

const wrap = (x, L) => ((x % L) + L * 1.5) % L - L / 2;

// ───────── 주행 물리 ─────────
function updatePlay(dt) {
  const tr = world.track;
  const spec = MODELS[save.model];
  const [spd, hand, brk] = spec.stats;
  const maxV = 40 + spd * 0.42; // 약 70~82 m/s
  const accel = 9 + spd * 0.07;
  const boosting = player.boost > 0;
  const top = boosting ? maxV * 1.35 : maxV;
  const f = tr.frame(player.s, _f);

  let a = 0;
  if (input.gas && !player.lock) a += boosting ? accel * 1.8 : accel;
  if (input.brake && !player.lock) a -= player.v > 0.5 ? 16 + brk * 0.12 : 6;
  a -= (accel / top) * player.v * (input.gas ? 1 : 0.6);
  a -= 9.8 * (world.gravity ?? 0.6) * f.tan.y;
  if (boosting) a += 14;
  player.v = THREE.MathUtils.clamp(player.v + a * dt, -12, top * 1.05);
  if (!input.gas && !input.brake && Math.abs(player.v) < 0.3 && Math.abs(f.tan.y) < 0.05) player.v = 0;
  player.boost = Math.max(0, player.boost - dt);

  // 조향
  const target = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  player.steer += (target - player.steer) * Math.min(1, dt * 6);
  const steerRate = 7 + hand * 0.06;
  player.d -= player.steer * steerRate * Math.min(1, Math.abs(player.v) / 12) * dt;
  const hw = tr.width / 2 - spec.W / 2 - 0.2;
  if (Math.abs(player.d) > hw) {
    player.d = Math.sign(player.d) * hw;
    player.v *= 1 - 1.2 * dt;
    player.shake = 0.15;
  }
  const prevS = player.s;
  player.s += player.v * dt;
  player.time += dt;

  // 랩
  if (player.s - player.lapStart >= tr.length) {
    const lt = player.time - player.lapTime;
    player.lapTime = player.time;
    player.lapStart += tr.length;
    player.lap++;
    const best = save.best[world.def.id];
    if (!best || lt < best) { save.best[world.def.id] = lt; persist(); toast(`🏁 최고 기록! ${fmt(lt)}`); }
    else toast(`🏁 랩 ${fmt(lt)}`);
  }

  // 부스트 패드
  pads.forEach(ps => {
    const d0 = wrap(prevS - ps, tr.length), d1 = wrap(player.s - ps, tr.length);
    if (d0 < 0 && d1 >= 0 && Math.abs(player.d) < 3) { player.boost = 2.2; player.v = Math.max(player.v, maxV * 0.9); toast('⚡ BOOST!'); }
  });

  // 코인
  coins.forEach(c => {
    if (c.taken) return;
    if (Math.abs(wrap(c.s - player.s, tr.length)) < 2.2 && Math.abs(c.d - player.d) < 1.7) {
      c.taken = true; save.coins += 10; persist();
      $('coinCount').textContent = save.coins.toLocaleString();
    }
  });
  if (coins.length && coins.every(c => c.taken)) coins.forEach(c => (c.taken = false));

  // 다른 차와 충돌
  traffic.forEach(t => {
    const ds = wrap(t.s - player.s, tr.length);
    if (Math.abs(ds) < (t.L + spec.L) / 2 - 0.3 && Math.abs(t.d - player.d) < (spec.W + 1.9) / 2) {
      player.v *= t.dir < 0 ? 0.35 : 0.7;
      player.d += Math.sign(player.d - t.d || 1) * 0.8;
      player.shake = 0.35;
      if (t.dir > 0 && ds > 0) t.v += 2;
    }
  });

  const roll = -player.steer * Math.min(1, Math.abs(player.v) / 40) * 0.05;
  placeCar(car, player.s, player.d, player.steer * 0.08 * Math.min(1, Math.abs(player.v) / 10), roll);
  spinWheels(car, player.v, dt, player.steer);
  car.userData.lights.tail.forEach(l => (l.material.emissiveIntensity = input.brake ? 5 : 2));

  // 카메라 추적 (루프에서 뒤집혀도 따라감)
  const cp = car.position;
  const want = cp.clone().addScaledVector(f.tan, -7.8 - player.v * 0.02).addScaledVector(f.up, 2.5);
  camera.position.lerp(want, Math.min(1, dt * 6));
  camera.up.lerp(f.up, Math.min(1, dt * 5)).normalize();
  const look = cp.clone().addScaledVector(f.up, 1.1).addScaledVector(f.tan, 4);
  if (player.shake > 0) { look.x += (Math.random() - 0.5) * player.shake; look.y += (Math.random() - 0.5) * player.shake; player.shake -= dt; }
  camera.lookAt(look);
  camera.fov = 60 + Math.min(18, Math.abs(player.v) * 0.18) + (boosting ? 6 : 0);
  camera.updateProjectionMatrix();

  // HUD
  $('speed').textContent = Math.round(Math.abs(player.v) * 3.6);
  $('lap').textContent = player.lap;
  $('time').textContent = fmt(player.time - player.lapTime);
  const best = save.best[world.def.id];
  $('best').textContent = best ? fmt(best) : '--:--.--';
  $('speedBar').style.width = `${Math.min(100, (Math.abs(player.v) / (maxV * 1.35)) * 100)}%`;
  drawMinimap();
}

function updateTraffic(dt) {
  const tr = world.track;
  traffic.forEach((t, i) => {
    if (world.traffic.racers) {
      t.d = t.baseD + Math.sin(performance.now() * 0.0003 + i) * 2.5;
      const k = tr.frame(t.s + 30, {}).tan.dot(tr.frame(t.s, {}).tan);
      const want = world.traffic.speed[0] + (world.traffic.speed[1] - world.traffic.speed[0]) * ((i % 5) / 4) * (0.5 + 0.5 * k);
      t.v += (want - t.v) * dt * 0.6;
    }
    t.s += t.v * dt * t.dir;
    placeCar(t.mesh, t.s, t.d, 0, 0, t.dir < 0);
    spinWheels(t.mesh, t.v, dt);
  });
}

function updateCoins(time) {
  if (!coinMesh) return;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const tr = world.track;
  coins.forEach((c, i) => {
    const f = tr.frame(c.s, {});
    const p = f.pos.clone().addScaledVector(f.right, c.d).addScaledVector(f.up, 1.1 + Math.sin(time * 3 + i) * 0.15);
    const left = f.right.clone().negate();
    q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, f.up, f.tan));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), time * 3 + i * 0.3));
    sc.setScalar(c.taken ? 0 : 1);
    m.compose(p, q, sc);
    coinMesh.setMatrixAt(i, m);
  });
  coinMesh.instanceMatrix.needsUpdate = true;
}

// ───────── 차고 / 메뉴 카메라 ─────────
let orbit = 2.4, orbitVel = 0.25, dragging = false, lastX = 0;
canvas.addEventListener('pointerdown', e => { if (mode !== 'play') { dragging = true; lastX = e.clientX; } });
window.addEventListener('pointerup', () => (dragging = false));
window.addEventListener('pointermove', e => {
  if (!dragging) return;
  orbitVel = 0; orbit -= (e.clientX - lastX) * 0.008; lastX = e.clientX;
});

function updateShowroom(dt) {
  const gc = world.garageCam || { dist: 7.5, height: 1.5 };
  if (!dragging) { orbitVel += (0.18 - orbitVel) * dt; orbit += orbitVel * dt; }
  placeCar(car, player.s, player.d, 0, 0);
  const f = world.track.frame(player.s, _f);
  const left = new THREE.Vector3().crossVectors(f.up, f.tan);
  const fit = THREE.MathUtils.clamp(1.25 / camera.aspect, 1, 2.8); // 세로 화면에서는 멀리
  const dist = (mode === 'garage' ? gc.dist : gc.dist + 3) * fit;
  const off = f.tan.clone().multiplyScalar(Math.cos(orbit) * dist).addScaledVector(left, Math.sin(orbit) * dist).addScaledVector(f.up, gc.height + (mode === 'garage' ? 0 : 0.8));
  camera.position.copy(car.position).add(off);
  camera.up.set(0, 1, 0);
  const look = car.position.clone().addScaledVector(f.up, 0.8);
  if (mode === 'garage' && window.innerWidth > 700) look.addScaledVector(left, Math.sin(orbit + Math.PI / 2) * 0.9);
  camera.lookAt(look);
  camera.fov = mode === 'garage' ? 40 : 50;
  camera.updateProjectionMatrix();
}

// ───────── 미니맵 ─────────
const mini = $('minimap');
const mctx = mini.getContext('2d');
let miniPath = null;
function drawMinimap() {
  const tr = world.track;
  const W = mini.width, H = mini.height;
  if (!miniPath || miniPath.track !== tr) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    tr.pos.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
    const sc = Math.min((W - 16) / (maxX - minX), (H - 16) / (maxZ - minZ));
    const ox = (W - (maxX - minX) * sc) / 2, oz = (H - (maxZ - minZ) * sc) / 2;
    miniPath = { track: tr, map: p => [ox + (p.x - minX) * sc, oz + (p.z - minZ) * sc] };
  }
  mctx.clearRect(0, 0, W, H);
  mctx.lineWidth = 5; mctx.strokeStyle = 'rgba(255,255,255,0.85)'; mctx.lineJoin = 'round';
  mctx.beginPath();
  for (let i = 0; i < tr.n; i += 10) { const [x, y] = miniPath.map(tr.pos[i]); i ? mctx.lineTo(x, y) : mctx.moveTo(x, y); }
  mctx.closePath(); mctx.stroke();
  traffic.forEach(t => { const [x, y] = miniPath.map(t.mesh.position); mctx.fillStyle = '#ff5a5a'; mctx.beginPath(); mctx.arc(x, y, 3.5, 0, 7); mctx.fill(); });
  const [px, py] = miniPath.map(car.position);
  mctx.fillStyle = '#39e6ff'; mctx.beginPath(); mctx.arc(px, py, 5.5, 0, 7); mctx.fill();
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.stroke();
}

// ───────── 루프 ─────────
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const t = clock.elapsedTime;
  if (world) {
    if (mode === 'play') updatePlay(dt);
    else if (mode !== 'pause') updateShowroom(dt);
    if (mode !== 'pause') updateTraffic(dt);
    updateCoins(t);
    if (world.update) world.update(t, dt, camera.position);
    // 그림자 카메라가 차를 따라가게
    if (car) {
      world.sun.target.position.copy(car.position);
      world.sun.position.copy(car.position).addScaledVector(world.sunDir, 150);
    }
    composer.render();
  }
  requestAnimationFrame(loop);
}

// ───────── UI ─────────
function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

function setMode(m) {
  mode = m;
  document.body.dataset.mode = m;
  if (m === 'garage') refreshGarage();
}

const modelIds = Object.keys(MODELS);
function refreshGarage() {
  const spec = MODELS[save.model];
  $('carName').textContent = spec.name;
  $('carSub').textContent = spec.sub;
  ['statSpeed', 'statHandling', 'statBrake'].forEach((id, i) => ($(id).style.width = `${spec.stats[i]}%`));
  document.querySelectorAll('#swatches .swatch').forEach(el => el.classList.toggle('on', el.dataset.id === save.color));
  document.querySelectorAll('.chip').forEach(el => el.classList.toggle('on', save[el.dataset.group] === el.dataset.id));
  document.querySelectorAll('.model-dot').forEach(el => el.classList.toggle('on', el.dataset.id === save.model));
  $('customColor').value = save.custom;
  $('coinCount').textContent = save.coins.toLocaleString();
}

function changeModel(dir) {
  const i = modelIds.indexOf(save.model);
  save.model = modelIds[(i + dir + modelIds.length) % modelIds.length];
  // 사이버트럭은 사이버 휠/스테인리스가 기본
  persist(); rebuildCar(); refreshGarage();
}

function buildUI() {
  // 색상 스와치
  const sw = $('swatches');
  COLORS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.dataset.id = c.id; b.title = c.name;
    b.style.setProperty('--c', c.hex);
    b.onclick = () => { save.color = c.id; persist(); rebuildCar(); refreshGarage(); $('paintName').textContent = c.name; };
    sw.appendChild(b);
  });
  $('customColor').addEventListener('input', e => {
    save.custom = e.target.value; save.color = 'custom'; persist(); rebuildCar(); refreshGarage(); $('paintName').textContent = '커스텀 컬러';
  });
  // 모양 옵션
  const groups = [['wheel', WHEELS, 'optWheel'], ['spoiler', SPOILERS, 'optSpoiler'], ['stance', STANCES, 'optStance']];
  groups.forEach(([key, list, el]) => {
    list.forEach(o => {
      const b = document.createElement('button');
      b.className = 'chip'; b.dataset.group = key; b.dataset.id = o.id; b.textContent = o.name;
      b.onclick = () => { save[key] = o.id; persist(); rebuildCar(); refreshGarage(); };
      $(el).appendChild(b);
    });
  });
  // 모델 점
  modelIds.forEach(id => {
    const b = document.createElement('button');
    b.className = 'model-dot'; b.dataset.id = id; b.textContent = MODELS[id].name.replace('Model ', '');
    b.onclick = () => { save.model = id; persist(); rebuildCar(); refreshGarage(); };
    $('modelDots').appendChild(b);
  });
  // 탭
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    document.body.dataset.tab = b.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
  }));
  document.body.dataset.tab = 'paint';
  $('prevCar').onclick = () => changeModel(-1);
  $('nextCar').onclick = () => changeModel(1);

  // 월드 카드
  const wl = $('worldList');
  WORLDS.forEach(w => {
    const b = document.createElement('button');
    b.className = 'world-card'; b.dataset.id = w.id;
    b.innerHTML = `<div class="thumb" style="background:${w.thumb}"></div><div class="wname">${w.name}</div><div class="wdesc">${w.desc}</div>`;
    b.onclick = async () => {
      save.world = w.id; persist();
      document.querySelectorAll('.world-card').forEach(x => x.classList.toggle('on', x.dataset.id === w.id));
      await loadWorld(w.id);
      $('worldName').textContent = w.name;
      setMode('menu');
    };
    wl.appendChild(b);
  });
  document.querySelectorAll('.world-card').forEach(x => x.classList.toggle('on', x.dataset.id === save.world));

  // 버튼
  $('btnStart').onclick = startRace;
  $('btnGarage').onclick = () => setMode('garage');
  $('btnWorld').onclick = () => setMode('worlds');
  $('btnDrive').onclick = startRace;
  $('garageBack').onclick = () => setMode('menu');
  $('worldBack').onclick = () => setMode('menu');
  $('btnPause').onclick = () => setMode('pause');
  $('btnResume').onclick = () => { setMode('play'); clock.getDelta(); };
  $('btnRestart').onclick = () => startRace();
  $('btnQuit').onclick = () => { spawnPlayer(); setMode('menu'); };

  // 터치 버튼
  document.querySelectorAll('[data-key]').forEach(el => {
    const k = el.dataset.key;
    const on = e => { e.preventDefault(); input[k] = true; el.classList.add('down'); };
    const off = e => { e.preventDefault(); input[k] = false; el.classList.remove('down'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('pointercancel', off);
  });
}

function startRace() {
  spawnPlayer();
  camera.position.copy(car.position).add(new THREE.Vector3(0, 4, 0));
  setMode('play');
  player.lock = true;
  let n = 3;
  const cd = $('countdown');
  cd.textContent = n; cd.classList.add('show');
  const iv = setInterval(() => {
    n--;
    if (n > 0) cd.textContent = n;
    else if (n === 0) { cd.textContent = 'GO!'; player.lock = false; }
    else { cd.classList.remove('show'); clearInterval(iv); }
  }, 700);
}

const keyMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', Space: 'brake' };
window.addEventListener('keydown', e => {
  if (keyMap[e.code]) { input[keyMap[e.code]] = true; if (mode === 'play') e.preventDefault(); }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (mode === 'play') setMode('pause'); else if (mode === 'pause') setMode('play'); }
  if (mode === 'garage' && e.code === 'ArrowLeft') changeModel(-1);
  if (mode === 'garage' && e.code === 'ArrowRight') changeModel(1);
});
window.addEventListener('keyup', e => { if (keyMap[e.code]) input[keyMap[e.code]] = false; });

// ───────── 시작 ─────────
buildUI();
setMode('menu');
loadWorld(save.world).then(() => {
  $('worldName').textContent = world.def.name;
  refreshGarage();
});
loop();

// 디버그/테스트용
window.__game = { setOrbit: a => { orbit = a; orbitVel = 0; dragging = true; }, setMode, loadWorld, input, player, get world() { return world; }, startRace };
