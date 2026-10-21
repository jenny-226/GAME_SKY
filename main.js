// GAME SKY - 랜드마크 스턴트 투어 (메인 게임 로직)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WORLDS, GROUPS, makeSky } from './worlds.js';
import { buildCar, MODELS, COLORS } from './cars.js';
import { planStage, buildStunts, stuntMarkers, G } from './stunts.js';

// ───────── 저장 데이터 ─────────
const DEFAULT = {
  model: 'roadster', color: 'pearl', custom: '#33c3ff', wheel: 'aero', spoiler: 'none', stance: 'normal',
  coins: 0, progress: {}, last: { world: 'country', stage: 0 }, v: 3,
  settings: { hand: 'right', sens: 1, shake: true },
};
let save = structuredClone(DEFAULT);
try { const raw = JSON.parse(localStorage.getItem('gamesky-save-v2') || '{}'); save = { ...save, ...raw, settings: { ...DEFAULT.settings, ...(raw.settings || {}) } }; } catch (e) { /* 저장소 없음 */ }
function persist() { try { localStorage.setItem('gamesky-save-v2', JSON.stringify(save)); } catch (e) { /* 무시 */ } }
// 차는 테슬라 로드스터 한 가지 (색상만 바꿀 수 있음)
Object.assign(save, { model: 'roadster', wheel: 'aero', spoiler: 'none', stance: 'normal' });
if ((save.v || 0) < 3) { save.v = 3; save.last = { world: 'country', stage: 0 }; persist(); }
const worldById = id => WORLDS.find(w => w.id === id) || WORLDS[0];
const prog = (wid, i) => ((save.progress[wid] || [])[i]) || { stars: 0, best: 0 };
const unlocked = (wid, i) => i === 0 || prog(wid, i - 1).stars > 0;

// ───────── 렌더러 ─────────
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 5000);
let scene = new THREE.Scene();
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.6, 0.9);
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass());
const pmrem = new THREE.PMREMGenerator(renderer);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
});

const $ = id => document.getElementById(id);
const wrap = (x, L) => ((x % L) + L * 1.5) % L - L / 2;
const TAU = Math.PI * 2;

// ───────── 상태 ─────────
let env = null, stunts = null, world = null, stageIdx = 0, stage = null;
let carHolder = null, car = null;
let mode = 'title';
const input = { boost: false, brake: false, fly: false, drift: false, steerX: 0.5 };
const p = {};
function resetPlayer(s = 8) {
  Object.assign(p, {
    s, d: 0, h: 0, v: 0, vh: 0, air: false, groundPitch: 0, airPitch: 0, roll: 0, pitch: 0, rollTarget: 0, pitchTarget: 0,
    rollAccum: 0, pitchAccum: 0, assist: 0, yaw: 0, drifting: false, driftDir: 1, driftPts: 0, driftTime: 0,
    energy: 100, flying: false, boostT: 0, crashT: 0, crashSpin: 0, landPressT: -9, airTime: 0, pending: 0, airTricks: 0,
    combo: 0, comboT: 0, score: 0, lastSafe: s, lock: true, finished: false, fold: 0, shake: 0, targetD: 0, lastS: s,
    stats: { perfect: 0, good: 0, bullseye: 0, rings: 0, flips: 0, drift: 0, airtime: 0, coins: 0, crashes: 0, maxCombo: 0 },
  });
}
resetPlayer();

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
  });
}

// ───────── 월드/스테이지 불러오기 ─────────
function loadStage(wid, si) {
  $('loading').classList.add('show');
  $('loadingText').textContent = `${worldById(wid).flag} ${worldById(wid).name} 불러오는 중…`;
  return new Promise(resolve => setTimeout(() => {
    if (env) disposeTree(env.group);
    if (stunts) disposeTree(stunts.group);
    scene = new THREE.Scene();
    renderPass.scene = scene;
    world = worldById(wid); stageIdx = si; stage = world.stages[si];
    const plan = planStage(stage.recipe, si + 1 + wid.length * 7);
    env = world.build({ lift: plan.lift, gaps: plan.gaps });
    scene.add(env.group);
    scene.fog = env.fog;
    renderer.toneMappingExposure = env.exposure ?? 1;
    bloom.strength = env.bloom[0]; bloom.threshold = env.bloom[1];
    const envScene = new THREE.Scene();
    envScene.add(makeSky({ ...env.env, sunDir: env.sunDir, glow: 0.6 }));
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    stunts = buildStunts(env, plan, wid);
    scene.add(stunts.group);
    spawnCar();
    resetPlayer(8);
    placePlayer(0);
    drawMarkers();
    document.documentElement.style.setProperty('--accent', world.accent);
    $('loading').classList.remove('show');
    resolve();
  }, 40));
}

function spawnCar() {
  if (carHolder) { scene.remove(carHolder); disposeTree(carHolder); }
  carHolder = new THREE.Group();
  car = buildCar(save);
  car.position.y = -0.75; // 회전 중심을 차체 중앙으로
  carHolder.add(car);
  scene.add(carHolder);
}

// ───────── 입력 ─────────
// 차는 스스로 앞으로 달린다. 방향은 마우스 커서(또는 손가락)로만 바꾼다.
// 아래 키는 선택 사항 (마우스 버튼으로도 모두 가능)
const KEYS = { Space: 'fly', ShiftLeft: 'drift', ShiftRight: 'drift' };
const TAP = { KeyQ: 'rollL', KeyE: 'rollR', KeyR: 'flip', KeyF: 'land' };
window.addEventListener('keydown', e => {
  if (e.repeat && TAP[e.code]) return;
  if (KEYS[e.code]) input[KEYS[e.code]] = true;
  if (TAP[e.code]) action(TAP[e.code]);
  if (mode === 'play' && (KEYS[e.code] || TAP[e.code])) e.preventDefault();
  if (e.code === 'Escape' || e.code === 'KeyP') { if (mode === 'play') setMode('pause'); else if (mode === 'pause') resume(); }
});
window.addEventListener('keyup', e => { if (KEYS[e.code]) input[KEYS[e.code]] = false; });

// 마우스 커서 / 손가락 위치로 조향 (화면 왼쪽 = 왼쪽, 오른쪽 = 오른쪽)
// 마우스 왼쪽 버튼 길게 = 점프 · 비행, 오른쪽 버튼 길게 = 드리프트
let steerPointer = null;
canvas.addEventListener('pointerdown', e => {
  if (mode === 'play') {
    if (e.pointerType === 'mouse') { if (e.button === 0) input.fly = true; if (e.button === 2) input.drift = true; }
    else { steerPointer = e.pointerId; input.steerX = e.clientX / window.innerWidth; }
  } else { orbitDrag = true; lastX = e.clientX; }
});
window.addEventListener('pointermove', e => {
  if (mode === 'play' || mode === 'pause') {
    if (e.pointerType === 'mouse' || e.pointerId === steerPointer) input.steerX = e.clientX / window.innerWidth;
  } else {
    if (e.pointerType === 'mouse') input.steerX = e.clientX / window.innerWidth;
    if (orbitDrag) { orbit -= (e.clientX - lastX) * 0.008; lastX = e.clientX; }
  }
});
window.addEventListener('pointerup', e => {
  if (e.pointerType === 'mouse' && e.button === 0) input.fly = false;
  if (e.pointerType === 'mouse' && e.button === 2) input.drift = false;
  if (e.pointerId === steerPointer) steerPointer = null;
  orbitDrag = false;
});
window.addEventListener('blur', () => { input.fly = false; input.drift = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// 터치 버튼
document.querySelectorAll('[data-hold]').forEach(el => {
  const k = el.dataset.hold;
  const on = e => { e.preventDefault(); e.stopPropagation(); input[k] = true; el.classList.add('down'); };
  const off = e => { e.preventDefault(); input[k] = false; el.classList.remove('down'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
  el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
});
document.querySelectorAll('[data-tap]').forEach(el => {
  el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); action(el.dataset.tap); el.classList.add('down'); setTimeout(() => el.classList.remove('down'), 120); });
});

function action(a) {
  if (mode !== 'play' || p.lock || p.crashT > 0) return;
  const canTrick = p.air && p.h > 1.2;
  if (a === 'rollL' && canTrick) p.rollTarget += TAU;
  if (a === 'rollR' && canTrick) p.rollTarget -= TAU;
  if (a === 'flip' && canTrick) p.pitchTarget -= TAU;
  if (a === 'land') { p.landPressT = clock.elapsedTime; p.assist = 0.5; }
}

// ───────── 스턴트 물리 ─────────
function multiplier() { return 1 + Math.min(p.combo, 16) * 0.25; }
function addCombo() { p.combo++; p.comboT = 0; p.stats.maxCombo = Math.max(p.stats.maxCombo, p.combo); }
function bank(points, label, cls = '') {
  const pts = Math.round(points * multiplier());
  p.score += pts;
  popup(`${label} <b>+${pts.toLocaleString()}</b>`, cls);
  return pts;
}

function crash(msg, fell = false) {
  if (p.crashT > 0) return;
  p.crashT = 1.3; p.crashSpin = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4);
  p.stats.crashes++;
  if (p.pending > 0) popup(`${msg} <s>${Math.round(p.pending)}</s>`, 'bad'); else popup(msg, 'bad');
  p.pending = 0; p.combo = 0; p.airTricks = 0;
  endDrift(false);
  p.fell = fell;
  p.shake = 0.6;
}

function endDrift(award = true) {
  if (p.drifting && award && p.driftPts > 60) {
    const pts = bank(p.driftPts, `DRIFT ${p.driftTime.toFixed(1)}s`, 'drift');
    p.stats.drift += p.driftPts;
    addCombo();
    p.v += Math.min(12, p.driftTime * 3.5); // 미니 터보
  }
  p.drifting = false; p.driftPts = 0; p.driftTime = 0;
}

function update(dt) {
  const tr = env.track;
  const spec = MODELS[save.model];
  const [spd, hand] = spec.stats;
  const maxV = 40 + spd * 0.12;
  const hw = tr.width / 2 - 1.0;
  const t = clock.elapsedTime;
  const f0 = tr.frame(p.s);

  // ── 충돌 후 회복 ──
  if (p.crashT > 0) {
    p.crashT -= dt;
    p.v *= 1 - 1.6 * dt;
    p.s += p.v * dt;
    p.roll += p.crashSpin * dt;
    if (p.air || p.h > 0) { p.vh -= G * dt; p.h = Math.max(p.fell ? -40 : 0, p.h + p.vh * dt); }
    if (p.crashT <= 0) {
      if (p.fell) { p.s = p.lastSafe; p.v = 24; }
      Object.assign(p, { h: 0, vh: 0, air: false, roll: 0, pitch: 0, rollTarget: 0, pitchTarget: 0, rollAccum: 0, pitchAccum: 0, airPitch: 0, fell: false, airTime: 0, energy: Math.max(p.energy, 40) });
      p.v = Math.max(p.v, 18);
    }
    placePlayer(dt);
    return;
  }

  // ── 속도: 출발 신호 후 스스로 가속해서 일정한 속도로 달린다 ──
  let target = p.lock ? 0 : maxV;
  if (!p.air) {
    const acc = p.v < target ? 12 + spd * 0.05 : 26;
    p.v += THREE.MathUtils.clamp(target - p.v, -acc * dt, acc * dt);
    p.v -= G * 0.45 * f0.tan.y * dt;
  }
  if (p.boostT > 0) { p.boostT -= dt; p.v = Math.max(p.v, maxV * 1.22); }
  p.v = THREE.MathUtils.clamp(p.v, -8, maxV * 1.3);

  // ── 조향: 커서가 있는 쪽으로 차가 방향을 튼다 ──
  p.targetD = THREE.MathUtils.clamp((input.steerX - 0.5) * 2.3 * save.settings.sens, -1, 1) * hw;
  const latMax = (p.drifting ? 17 : 12 + hand * 0.04) * (p.air ? 0.8 : 1);
  const lat = THREE.MathUtils.clamp((p.targetD - p.d) * 5, -latMax, latMax);
  p.d += lat * dt;
  if (Math.abs(p.d) > hw) { p.d = Math.sign(p.d) * hw; if (!p.air) p.v *= 1 - 0.6 * dt; }

  // ── 진행 ──
  const prevS = p.s;
  p.s = Math.max(0, p.s + p.v * dt);

  // ── 램프 / 지면 ──
  if (!p.air) {
    const ramp = stunts.ramps.find(r => p.s >= r.s0 && p.s <= r.s1);
    const passed = stunts.ramps.find(r => prevS < r.s1 && p.s >= r.s1);
    if (passed) {
      p.air = true; p.h = passed.H; p.vh = Math.max(4, p.v * passed.k); p.airTime = 0; p.pending = 0; p.airTricks = 0;
      p.airPitch = Math.atan2(p.vh, Math.max(10, p.v)) * 0.8;
      popup(passed.mega ? 'MEGA JUMP!' : 'JUMP!', 'jump');
    } else if (ramp) {
      const u = (p.s - ramp.s0) / (ramp.s1 - ramp.s0);
      p.h = ramp.H * (u * u * 0.35 + u * 0.65);
      p.groundPitch = Math.atan(ramp.H * (0.7 * u + 0.65) / (ramp.s1 - ramp.s0));
    } else { p.h = 0; p.groundPitch *= 1 - Math.min(1, dt * 10); }
    if (!p.air && tr.inGap(p.s)) { p.air = true; p.vh = 0; p.airTime = 0; }
  }

  // ── 비행 (마우스 왼쪽 버튼 / SPACE 길게) ──
  p.flying = false;
  if (input.fly && p.energy > 0 && !p.lock) {
    if (!p.air) { p.air = true; p.vh = 9; p.h = Math.max(p.h, 0.2); p.airTime = 0; p.pending = 0; p.airTricks = 0; p.energy -= 6; }
    p.vh = Math.min(p.vh + 38 * dt, 13);
    p.energy = Math.max(0, p.energy - 20 * dt);
    p.flying = true;
  }
  if (!p.air) p.energy = Math.min(100, p.energy + 14 * dt);

  // ── 공중 ──
  if (p.air) {
    p.vh -= G * dt;
    p.h += p.vh * dt;
    p.h = Math.min(p.h, 70);
    p.airTime += dt;
    p.pending += 120 * dt;
    p.airPitch += (Math.atan2(p.vh, Math.max(10, p.v)) * 0.6 - p.airPitch) * Math.min(1, dt * 2.5);
    // 회전 기술
    const rs = (TAU / 0.62) * (1 + p.assist * 2.4), ps = (TAU / 0.8) * (1 + p.assist * 2.4);
    const dr = THREE.MathUtils.clamp(p.rollTarget - p.roll, -rs * dt, rs * dt);
    const dp = THREE.MathUtils.clamp(p.pitchTarget - p.pitch, -ps * dt, ps * dt);
    p.roll += dr; p.pitch += dp;
    p.rollAccum += Math.abs(dr); p.pitchAccum += Math.abs(dp);
    if (p.rollAccum >= TAU - 0.02) { p.rollAccum -= TAU; trick('BARREL ROLL', 450); }
    if (p.pitchAccum >= TAU - 0.02) { p.pitchAccum -= TAU; trick('FRONT FLIP', 650); }
    p.assist = Math.max(0, p.assist - dt * 0.8);

    // 착지
    if (p.h <= 0 && p.vh < 0) {
      if (tr.inGap(p.s)) {
        if (p.h < -9) crash('추락! 💥', true);
      } else land();
    }
  }

  // ── 드리프트 (SHIFT) ──
  const wantDrift = input.drift && !p.air && p.v > 16;
  if (wantDrift) {
    if (!p.drifting) { p.drifting = true; p.driftDir = Math.sign(p.targetD - p.d) || p.driftDir; }
    if (Math.abs(p.targetD - p.d) > 1) p.driftDir = Math.sign(p.targetD - p.d);
    const inZone = stunts.drifts.some(z => p.s > z.s0 && p.s < z.s1);
    p.driftPts += p.v * Math.abs(p.yaw) * dt * 9 * (inZone ? 2 : 1);
    p.driftTime += dt;
    p.v *= 1 - 0.05 * dt;
  } else if (p.drifting) endDrift(true);
  const yawTarget = p.drifting ? p.driftDir * 0.6 : THREE.MathUtils.clamp(-lat * 0.018, -0.28, 0.28);
  p.yaw += (yawTarget - p.yaw) * Math.min(1, dt * 6);

  // ── 부스트 패드 ──
  if (!p.air) stunts.boosts.forEach(b => {
    if (prevS < b.s && p.s >= b.s && Math.abs(p.d - b.d) < 2.8) { p.boostT = 1.8; popup('BOOST!', 'boost'); }
  });

  // ── 스카이 링 ──
  stunts.rings.forEach(r => {
    if (r.taken) return;
    if (Math.abs(wrap(r.s - p.s, tr.length)) < 2.2 && Math.hypot(r.d - p.d, r.h - (p.h + 0.7)) < 4.1) {
      r.taken = true; r.mesh.visible = false;
      p.stats.rings++; addCombo();
      p.energy = Math.min(100, p.energy + 15);
      bank(250, 'RING', 'ring');
    }
  });

  // ── 장애물 ──
  stunts.obstacles.forEach(o => {
    if (p.h < o.h && Math.abs(wrap(o.s - p.s, tr.length)) < o.len / 2 + 2.1 && Math.abs(o.d - p.d) < o.w / 2 + 0.9) crash('CRASH! 💥');
  });

  // ── 코인 ──
  stunts.coins.forEach(c => {
    if (c.taken) return;
    if (Math.abs(wrap(c.s - p.s, tr.length)) < 2.2 && Math.abs(c.d - p.d) < 1.8 && Math.abs(c.h - (p.h + 0.7)) < 1.8) {
      c.taken = true; save.coins += 5; p.stats.coins++; p.score += 50;
    }
  });

  // 콤보 유지 시간
  if (!p.air && !p.drifting) { p.comboT += dt; if (p.comboT > 7 && p.combo > 0) { p.combo = 0; popup('콤보 종료', 'dim'); } }
  // 체크포인트
  if (!p.air && p.crashT <= 0 && !tr.skip.some(([a, b]) => p.s > a - 120 && p.s < b + 10)) p.lastSafe = p.s;
  // 결승
  if (!p.finished && p.s >= stunts.finishS - 3) finish();

  placePlayer(dt);
}

function trick(name, pts) {
  p.airTricks++;
  p.stats.flips++;
  const mult = p.airTricks > 1 ? 1 + (p.airTricks - 1) * 0.5 : 1;
  p.pending += pts * mult;
  popup(`${name}${p.airTricks > 1 ? ' x' + p.airTricks : ''}`, 'trick');
}

function land() {
  const err = Math.abs(p.rollTarget - p.roll) + Math.abs(p.pitchTarget - p.pitch);
  const assisted = clock.elapsedTime - p.landPressT < 0.6;
  if (err > (assisted ? 1.7 : 0.6)) { crash('WIPEOUT!'); return; }
  const big = p.airTime > 0.55 || p.airTricks > 0;
  const perfect = err < 0.22 || assisted;
  const pad = stunts.pads.find(z => p.s > z.s0 && p.s < z.s1);
  if (big) {
    let base = p.pending;
    let label = perfect ? 'PERFECT LANDING' : 'NICE LANDING';
    if (perfect) { base = base * 1.5 + 300; p.stats.perfect++; } else p.stats.good++;
    if (pad) { base += 500; label += ' · BULLSEYE 🎯'; p.stats.bullseye++; }
    p.stats.airtime += p.airTime;
    bank(base, label, perfect ? 'perfect' : 'good');
    addCombo();
    if (perfect) p.v += 4;
    p.shake = 0.25;
  }
  Object.assign(p, { air: false, h: 0, vh: 0, roll: 0, pitch: 0, rollTarget: 0, pitchTarget: 0, rollAccum: 0, pitchAccum: 0, airPitch: 0, airTime: 0, pending: 0, airTricks: 0 });
}

// ───────── 차 배치 / 카메라 ─────────
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
function placePlayer(dt) {
  const tr = env.track;
  const f = tr.frame(p.s);
  const left = new THREE.Vector3().crossVectors(f.up, f.tan).normalize();
  carHolder.position.copy(f.pos).addScaledVector(f.right, p.d).addScaledVector(f.up, p.h + 0.75);
  _m.makeBasis(left, f.up, f.tan);
  carHolder.quaternion.setFromRotationMatrix(_m);
  carHolder.quaternion.multiply(_q.setFromAxisAngle(AY, p.yaw));
  carHolder.quaternion.multiply(_q.setFromAxisAngle(AX, -(p.groundPitch + p.airPitch + p.pitch)));
  carHolder.quaternion.multiply(_q.setFromAxisAngle(AZ, p.roll));

  // 바퀴 회전 / 비행 변신
  const ud = car.userData;
  (ud.wheels || []).forEach(w => {
    if (w.userData.spinner) w.userData.spinner.rotation.z -= (p.air ? p.v * 0.3 : p.v) * dt / ud.spec.r * (w.userData.sign || 1);
    if (w.userData.front) w.rotation.y = (w.userData.sign < 0 ? Math.PI : 0) + THREE.MathUtils.clamp((p.targetD - p.d) * -0.08, -0.45, 0.45) * (p.drifting ? -1 : 1);
  });
  const foldTarget = p.air && (p.flying || p.h > 2.2) && p.crashT <= 0 ? 1 : 0;
  p.fold += (foldTarget - p.fold) * Math.min(1, dt * 7);
  (ud.folds || []).forEach(({ fold, sd, flame, glow }) => {
    fold.rotation.x = sd * p.fold * Math.PI / 2;
    flame.visible = p.fold > 0.6 && (p.flying || p.vh > 0);
    flame.scale.set(1, 0.6 + Math.random() * 0.6 * (p.flying ? 1.4 : 0.6), 1);
    glow.visible = p.fold > 0.5;
  });
  (ud.boosters || []).forEach(b => { b.visible = p.boostT > 0; b.scale.y = 0.7 + Math.random() * 0.6; });
  (ud.lights?.tail || []).forEach(l => (l.material.emissiveIntensity = input.brake ? 5 : 2));

  // 추격 카메라 (공중에서는 더 멀리, 루프에서는 위쪽 벡터를 따라감)
  if (mode === 'play' || mode === 'pause' || mode === 'brief' || mode === 'results') {
    const cp = carHolder.position;
    const back = 7.5 + (p.air ? Math.min(4, p.h * 0.1 + 1.5) : 0) + p.v * 0.02;
    const upOff = 2.8 + (p.air ? Math.min(3.5, p.h * 0.1 + 0.8) : 0);
    const want = cp.clone().addScaledVector(f.tan, -back).addScaledVector(f.up, upOff).addScaledVector(f.right, p.d * -0.25);
    camera.position.lerp(want, 1 - Math.exp(-dt * 16));
    camera.up.lerp(f.up, Math.min(1, dt * 4)).normalize();
    const look = cp.clone().addScaledVector(f.tan, 6).addScaledVector(f.up, p.air ? -0.5 : 0.6);
    if (p.shake > 0 && save.settings.shake) { look.x += (Math.random() - 0.5) * p.shake; look.y += (Math.random() - 0.5) * p.shake; }
    p.shake = Math.max(0, p.shake - dt);
    camera.lookAt(look);
    camera.fov = 62 + Math.min(16, p.v * 0.2) + (p.boostT > 0 ? 6 : 0);
    camera.updateProjectionMatrix();
  }
}

// 메뉴/차고 배경: 랜드마크를 보며 천천히 도는 카메라
let orbit = 2.2, orbitDrag = false, lastX = 0;
function updateShowroom(dt) {
  const tr = env.track;
  if (!orbitDrag) orbit += dt * (mode === 'garage' ? 0.12 : 0.05);
  const show = showroom();
  const s = show.s;
  p.s = s; p.d = 0; p.h = 0; p.v = 0; p.air = false; p.roll = p.pitch = p.yaw = p.airPitch = p.groundPitch = 0; p.fold = 0;
  placePlayer(dt);
  const f = tr.frame(s);
  const left = new THREE.Vector3().crossVectors(f.up, f.tan);
  const fit = THREE.MathUtils.clamp(1.25 / camera.aspect, 1, 2.6);
  camera.up.set(0, 1, 0);
  if (mode !== 'garage' && show.lm) {
    // 차 뒤에서 랜드마크를 함께 보는 구도 (살짝 좌우로 흔들림)
    const sway = Math.sin(orbit) * 0.35;
    const back = f.tan.clone().negate().applyAxisAngle(f.up, sway);
    camera.position.copy(carHolder.position).addScaledVector(back, 9 * fit).addScaledVector(f.up, 2.6).addScaledVector(left, -1.5);
    const target = carHolder.position.clone().lerp(show.lm, 0.05).addScaledVector(f.up, 1.2);
    camera.lookAt(target);
    camera.fov = 55;
  } else {
    const dist = (mode === 'garage' ? 7.2 : 9.5) * fit;
    const off = f.tan.clone().multiplyScalar(Math.cos(orbit) * dist).addScaledVector(left, Math.sin(orbit) * dist).addScaledVector(f.up, mode === 'garage' ? 1.6 : 2.6);
    camera.position.copy(carHolder.position).add(off);
    camera.lookAt(carHolder.position.clone().addScaledVector(f.up, mode === 'garage' ? 0.1 : 1.6));
    camera.fov = mode === 'garage' ? 40 : 52;
  }
  camera.updateProjectionMatrix();
}
// 랜드마크가 앞쪽에 보이는 평평한 지점 찾기
function showroom() {
  if (env._show) return env._show;
  const tr = env.track, L = tr.length;
  const ok = s => { const f = tr.frame(s); return f.up.y > 0.99 && !tr.inGap(s) && !stunts.ramps.some(r => s > r.s0 - 15 && s < r.s1 + 8) && !stunts.obstacles.some(o => Math.abs(o.s - s) < 15); };
  let best = null;
  if (env.landmarkPos) {
    const lm = env.landmarkPos.clone();
    const top = lm.clone().setY(lm.y + 40);
    for (let s = 20; s < L - 20; s += 8) {
      if (!ok(s)) continue;
      const f = tr.frame(s);
      const to = lm.clone().sub(f.pos).setY(0);
      const d = to.length();
      if (d < 110 || d > 420) continue;
      const score = to.normalize().dot(f.tan) * 2 - Math.abs(d - 200) / 800;
      if (to.dot(f.tan) < 0.75) continue;
      if (!best || score > best.score) best = { s, score, lm: top };
    }
  }
  if (!best) {
    let s = (env.landmarkU ?? 0.1) * L - 70;
    for (let k = 0; k < 60 && !ok(s); k++) s += 15;
    best = { s: ((s % L) + L) % L, lm: null };
  }
  env._show = best;
  return best;
}

function updateCoins(time) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const tr = env.track;
  stunts.coins.forEach((c, i) => {
    const f = tr.frame(c.s);
    const pos = f.pos.clone().addScaledVector(f.right, c.d).addScaledVector(f.up, c.h + Math.sin(time * 3 + i) * 0.15);
    q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right.clone().negate(), f.up, f.tan));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(AY, time * 3 + i * 0.3));
    sc.setScalar(c.taken ? 0 : 1);
    m.compose(pos, q, sc);
    stunts.coinMesh.setMatrixAt(i, m);
  });
  stunts.coinMesh.instanceMatrix.needsUpdate = true;
  stunts.rings.forEach((r, i) => { if (!r.taken) r.mesh.rotateZ(0.02); });
}

// ───────── HUD ─────────
let popTimer = 0;
function popup(html, cls = '') {
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.innerHTML = html;
  $('pops').prepend(el);
  setTimeout(() => el.classList.add('out'), 1300);
  setTimeout(() => el.remove(), 1800);
  while ($('pops').children.length > 4) $('pops').lastChild.remove();
}

function missionValue() {
  const m = stage.mission, s = p.stats;
  return { perfect: s.perfect, drift: Math.round(s.drift), rings: s.rings, flips: s.flips, combo: s.maxCombo, airtime: Math.round(s.airtime * 10) / 10 }[m.type] ?? 0;
}

function drawMarkers() {
  const bar = $('progMarks');
  bar.innerHTML = '';
  stuntMarkers(stunts).forEach(m => {
    const i = document.createElement('i');
    i.style.left = `${m.u * 100}%`; i.style.background = m.c;
    bar.appendChild(i);
  });
}

function updateHUD() {
  $('hudScore').textContent = Math.round(p.score).toLocaleString();
  const mult = multiplier();
  $('hudMult').textContent = `x${mult.toFixed(2).replace(/\.?0+$/, '')}`;
  $('hudMult').classList.toggle('hot', mult >= 2);
  $('hudCombo').textContent = p.combo ? `COMBO ${p.combo}` : '';
  $('hudSpeed').textContent = Math.round(Math.abs(p.v) * 3.6);
  $('energyFill').style.width = `${p.energy}%`;
  $('energyFill').classList.toggle('low', p.energy < 25);
  $('progFill').style.width = `${Math.min(100, (p.s / stunts.finishS) * 100)}%`;
  const live = $('hudLive');
  if (p.air && p.pending > 30) live.innerHTML = `✈ ${Math.round(p.pending).toLocaleString()} <small>${p.airTime.toFixed(1)}s</small>`;
  else if (p.drifting) live.innerHTML = `🔥 DRIFT ${Math.round(p.driftPts).toLocaleString()}`;
  else live.innerHTML = '';
  const mv = missionValue(), mt = stage.mission.n;
  $('hudMission').innerHTML = `${mv >= mt ? '✅' : '🎯'} ${stage.mission.text} <b>${Math.min(mv, mt).toLocaleString()}/${mt.toLocaleString()}</b>`;
  // 공중일 때 착지 안내
  const err = Math.abs(p.rollTarget - p.roll) + Math.abs(p.pitchTarget - p.pitch);
  $('landHint').classList.toggle('show', p.air && p.vh < 0 && p.h < 9 && p.h > 0.5 && (err > 0.3 || p.airTricks > 0));
  document.body.classList.toggle('airborne', p.air);
}

// ───────── 진행 흐름 ─────────
function setMode(m) {
  mode = m;
  document.body.dataset.mode = m;
  if (m === 'garage') refreshGarage();
  if (m === 'tour') renderTour();
}

async function openWorld(wid) {
  await loadStage(wid, 0);
  renderWorld();
  setMode('world');
}

async function startStage(wid, si) {
  save.last = { world: wid, stage: si }; persist();
  if (!env || world.id !== wid || stageIdx !== si) await loadStage(wid, si);
  else { stunts.rings.forEach(r => { r.taken = false; r.mesh.visible = true; }); stunts.coins.forEach(c => (c.taken = false)); }
  resetPlayer(8);
  placePlayer(0);
  camera.position.copy(carHolder.position).add(new THREE.Vector3(0, 6, 0));
  $('pops').innerHTML = '';
  $('briefTitle').textContent = `${world.flag} ${world.name} · ${stageIdx + 1}단계`;
  $('briefName').textContent = stage.name;
  $('briefDesc').textContent = stage.desc;
  $('briefMission').textContent = stage.mission.text;
  $('briefTarget').textContent = stage.target.toLocaleString();
  setMode('brief');
}

function go() {
  setMode('play');
  p.lock = true;
  let n = 3;
  const cd = $('countdown');
  cd.textContent = n; cd.classList.add('show');
  const iv = setInterval(() => {
    n--;
    if (n > 0) cd.textContent = n;
    else if (n === 0) { cd.textContent = 'GO!'; p.lock = false; p.v = 20; }
    else { cd.classList.remove('show'); clearInterval(iv); }
  }, 650);
}

function resume() { setMode('play'); clock.getDelta(); }

function finish() {
  p.finished = true;
  endDrift(true);
  const mv = missionValue();
  const missionOk = mv >= stage.mission.n;
  const scoreOk = p.score >= stage.target;
  const stars = 1 + (missionOk ? 1 : 0) + (scoreOk ? 1 : 0);
  const arr = save.progress[world.id] || (save.progress[world.id] = []);
  const prev = arr[stageIdx] || { stars: 0, best: 0 };
  const newBest = p.score > prev.best;
  arr[stageIdx] = { stars: Math.max(prev.stars, stars), best: Math.max(prev.best, Math.round(p.score)) };
  persist();
  setTimeout(() => {
    $('resTitle').textContent = `${world.flag} ${world.name} · ${stage.name}`;
    $('resScore').textContent = Math.round(p.score).toLocaleString();
    $('resBest').textContent = newBest ? '🏆 최고 기록!' : `최고 ${prev.best.toLocaleString()}`;
    $('resStars').innerHTML = [0, 1, 2].map(i => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${0.2 + i * 0.25}s">★</span>`).join('');
    const s = p.stats;
    $('resStats').innerHTML = [
      ['PERFECT 착지', s.perfect], ['일반 착지', s.good], ['🎯 목표 착지', s.bullseye], ['공중 회전', s.flips],
      ['스카이 링', s.rings], ['드리프트', Math.round(s.drift).toLocaleString()], ['최대 콤보', s.maxCombo], ['코인', s.coins], ['충돌', s.crashes],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('resGoals').innerHTML = `<div class="${'ok'}">★ 결승선 통과</div><div class="${missionOk ? 'ok' : ''}">★ ${stage.mission.text} (${Math.min(mv, stage.mission.n)}/${stage.mission.n})</div><div class="${scoreOk ? 'ok' : ''}">★ 목표 점수 ${stage.target.toLocaleString()}</div>`;
    const hasNext = stageIdx < world.stages.length - 1;
    $('btnNext').style.display = hasNext ? '' : 'none';
    setMode('results');
  }, 900);
}

// ───────── 화면 렌더 ─────────
function starsOf(wid) { return (save.progress[wid] || []).reduce((a, x) => a + (x ? x.stars : 0), 0); }

function renderTour() {
  const box = $('tourList');
  box.innerHTML = '';
  GROUPS.forEach(g => {
    const sec = document.createElement('section');
    sec.innerHTML = `<h3>${g.title}<small>${g.sub}</small></h3><div class="cards"></div>`;
    WORLDS.filter(w => w.group === g.id).forEach(w => {
      const b = document.createElement('button');
      b.className = 'wcard';
      b.style.setProperty('--accent', w.accent);
      b.innerHTML = `<div class="thumb" style="background:${w.thumb}"><span class="flag">${w.flag}</span></div>
        <div class="wbody"><b>${w.name}</b><small>${w.en} · ${w.country}</small><div class="wstars">${'★'.repeat(starsOf(w.id))}${'☆'.repeat(9 - starsOf(w.id))}</div></div>`;
      b.onclick = () => openWorld(w.id);
      sec.querySelector('.cards').appendChild(b);
    });
    box.appendChild(sec);
  });
}

let storyIdx = 0;
function renderWorld() {
  $('wFlag').textContent = world.flag;
  $('wName').textContent = world.name;
  $('wEn').textContent = `${world.en} · ${world.country}`;
  $('hostEmoji').textContent = world.host.emoji;
  $('hostName').textContent = world.host.name;
  storyIdx = 0;
  showStory();
  const list = $('stageList');
  list.innerHTML = '';
  world.stages.forEach((st, i) => {
    const pr = prog(world.id, i), open = unlocked(world.id, i);
    const b = document.createElement('button');
    b.className = `scard ${open ? '' : 'locked'}`;
    b.innerHTML = `<div class="snum">${i + 1}단계</div><div class="sname">${st.name}</div><div class="sdesc">${st.desc}</div>
      <div class="smission">🎯 ${st.mission.text}</div>
      <div class="sfoot"><span class="sstars">${'★'.repeat(pr.stars)}${'☆'.repeat(3 - pr.stars)}</span><span>${open ? (pr.best ? '최고 ' + pr.best.toLocaleString() : '도전!') : '🔒 이전 단계 클리어'}</span></div>`;
    if (open) b.onclick = () => startStage(world.id, i);
    list.appendChild(b);
  });
}
function showStory() {
  const line = world.story[storyIdx] || '';
  const el = $('storyText');
  el.textContent = '';
  let k = 0;
  clearInterval(showStory.iv);
  showStory.iv = setInterval(() => { el.textContent = line.slice(0, ++k); if (k >= line.length) clearInterval(showStory.iv); }, 22);
  $('storyNext').textContent = storyIdx < world.story.length - 1 ? '다음 ▶' : '처음부터 ↺';
}
$('storyNext').onclick = () => { storyIdx = (storyIdx + 1) % world.story.length; showStory(); };

// ── 차고 ──
function refreshGarage() {
  const spec = MODELS[save.model];
  $('carName').textContent = `Tesla ${spec.name}`; $('carSub').textContent = spec.sub;
  ['statSpeed', 'statHandling', 'statBrake'].forEach((id, i) => ($(id).style.width = `${spec.stats[i]}%`));
  document.querySelectorAll('#swatches .swatch').forEach(el => el.classList.toggle('on', el.dataset.id === save.color));
  $('paintName').textContent = save.color === 'custom' ? '커스텀 컬러' : (COLORS.find(c => c.id === save.color) || COLORS[0]).name;
  $('customColor').value = save.custom;
  document.querySelectorAll('.coinCount').forEach(el => (el.textContent = save.coins.toLocaleString()));
}
function rebuildCar() { if (env) { spawnCar(); placePlayer(0); } }
function buildUI() {
  COLORS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.dataset.id = c.id; b.title = c.name; b.style.setProperty('--c', c.hex);
    b.onclick = () => { save.color = c.id; persist(); rebuildCar(); refreshGarage(); $('paintName').textContent = c.name; };
    $('swatches').appendChild(b);
  });
  $('customColor').addEventListener('input', e => { save.custom = e.target.value; save.color = 'custom'; persist(); rebuildCar(); refreshGarage(); $('paintName').textContent = '커스텀 컬러'; });
  // 설정
  const applySettings = () => {
    document.body.dataset.hand = save.settings.hand;
    document.querySelectorAll('[data-hand]').forEach(b => b.classList.toggle('on', b.dataset.hand === save.settings.hand));
    $('sensRange').value = save.settings.sens;
    $('shakeToggle').checked = save.settings.shake;
  };
  document.querySelectorAll('[data-hand]').forEach(b => (b.onclick = () => { save.settings.hand = b.dataset.hand; persist(); applySettings(); }));
  $('sensRange').oninput = e => { save.settings.sens = +e.target.value; persist(); };
  $('shakeToggle').onchange = e => { save.settings.shake = e.target.checked; persist(); };
  applySettings();

  let backTo = 'title';
  const nav = (id, fn) => ($(id).onclick = fn);
  nav('btnTour', () => setMode('tour'));
  nav('btnContinue', () => startStage(save.last.world, save.last.stage));
  nav('btnGarage', () => { backTo = mode; setMode('garage'); });
  nav('btnWorldGarage', () => { backTo = 'world'; setMode('garage'); });
  nav('btnSettings', () => { backTo = mode; setMode('settings'); });
  nav('btnPauseSettings', () => { backTo = 'pause'; setMode('settings'); });
  nav('garageBack', () => setMode(backTo === 'garage' || backTo === 'settings' ? 'title' : backTo));
  nav('settingsBack', () => setMode(backTo));
  nav('tourBack', () => setMode('title'));
  nav('worldBack', () => setMode('tour'));
  nav('btnGo', go);
  nav('briefBack', () => { renderWorld(); setMode('world'); });
  nav('btnPause', () => setMode('pause'));
  nav('btnResume', resume);
  nav('btnRestart', () => startStage(world.id, stageIdx).then(go));
  nav('btnQuit', () => { renderWorld(); setMode('world'); });
  nav('btnRetry', () => startStage(world.id, stageIdx).then(go));
  nav('btnNext', () => startStage(world.id, stageIdx + 1));
  nav('btnResWorld', () => { renderWorld(); setMode('world'); });
}

// ───────── 루프 ─────────
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const t = clock.elapsedTime;
  if (env && carHolder) {
    if (mode === 'play') { update(dt); updateHUD(); }
    else if (mode === 'brief' || mode === 'results') placePlayer(dt);
    else if (mode !== 'pause') updateShowroom(dt);
    updateCoins(t);
    stunts.coinMesh.visible = mode === 'play' || mode === 'pause' || mode === 'brief' || mode === 'results';
    if (env.update) env.update(t, dt, camera.position);
    env.sun.target.position.copy(carHolder.position);
    env.sun.position.copy(carHolder.position).addScaledVector(env.sunDir, 150);
    composer.render();
  }
  requestAnimationFrame(loop);
}

buildUI();
setMode('title');
refreshGarage();
loadStage(save.last.world, 0).then(() => { $('titleWorld').textContent = `${world.flag} ${world.name}`; });
loop();

// 테스트용
window.__game = { step: (dt, n) => { for (let i = 0; i < n; i++) { clock.elapsedTime += dt; update(dt); } updateHUD(); }, get mode() { return mode; }, setMode, startStage, go, input, p, action, get env() { return env; }, get stunts() { return stunts; }, loadStage, openWorld, setOrbit: a => { orbit = a; orbitDrag = true; } };
