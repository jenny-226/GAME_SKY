// 테슬라 로드스터 (신형 컨셉) 차체: 낮고 뾰족한 쐐기형 앞코, 날카로운 옆면 캐릭터 라인,
// 유리 캐노피 지붕, 뒤쪽 풀폭 레드 라이트바, 블랙 하단부와 큰 디퓨저.
// 좌표: x = 뒤(0) → 앞(L), y = 위, z = 옆 (반폭)
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothstep } from './utils.js';

const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x07090c, metalness: 0.2, roughness: 0.04, clearcoat: 1 });
const roofGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x2a1c0c, metalness: 0.5, roughness: 0.08, clearcoat: 1 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.6, metalness: 0.2 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeef6ff, emissiveIntensity: 2.4 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1220, emissiveIntensity: 2.2 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd9dadc, metalness: 1, roughness: 0.2 });

// 지붕선 (뒤 → 앞, 단위 m)
const ROOF = [
  [0.0, 0.99], [0.22, 1.0], [0.55, 1.03], [1.0, 1.11], [1.5, 1.17], [1.9, 1.19], [2.3, 1.17],
  [2.65, 1.08], [2.95, 0.96], [3.1, 0.92], [3.5, 0.83], [3.9, 0.72], [4.2, 0.62], [4.33, 0.54], [4.35, 0.47],
];
const CABIN = [0.62, 2.95];       // 유리 구간 (뒷유리 아래 ~ 앞유리 아래)
const ROOF_PANEL = [1.0, 2.45];   // 브론즈 유리 지붕

export function roadsterProfile(spec) {
  const L = spec.L;
  const pts = new THREE.SplineCurve(ROOF.map(([x, y]) => new THREE.Vector2(x * L / 4.35, y))).getPoints(300);
  for (let i = 1; i < pts.length; i++) if (pts[i].x <= pts[i - 1].x) pts[i].x = pts[i - 1].x + 1e-4;
  const topY = x => {
    if (x <= pts[0].x) return pts[0].y;
    for (let i = 1; i < pts.length; i++) if (x <= pts[i].x) { const k = (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x); return pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k; }
    return pts[pts.length - 1].y;
  };
  const xr = L * spec.rear, xf = xr + spec.wb;
  const arch = spec.r + 0.04;
  const bottomY = x => {
    let y = 0.2;
    y = 0.38 + (y - 0.38) * smoothstep(0, 0.5, x);           // 뒤: 디퓨저 위로 올라감
    y = 0.3 + (y - 0.3) * smoothstep(L, L - 0.55, x);        // 앞: 앞코 아래
    [xr, xf].forEach(c => { const d = Math.abs(x - c); if (d < arch) y = Math.max(y, spec.r + Math.sqrt(arch * arch - d * d)); });
    return y;
  };
  // 평면도 폭 비율: 앞코는 둥글게 좁아지고, 뒤는 거의 직각
  const plan = x => {
    let f = 1;
    const rf = 0.95;
    if (x > L - rf) { const t = (x - (L - rf)) / rf; f *= 0.7 + 0.3 * Math.sqrt(Math.max(0, 1 - t * t * t)); }
    if (x < 0.3) f *= 0.95 + 0.05 * (x / 0.3);
    return f;
  };
  const creaseY = x => 0.86 + (0.6 - 0.86) * THREE.MathUtils.clamp((x - 0.2) / (L - 0.5), 0, 1);
  // 블랙 하단부 높이 (바닥에서 위로): 뒷바퀴 뒤에서 위로 휘어 올라감
  const blackY = x => 0.12 + 0.13 * smoothstep(xr - arch, 0, x) - 0.03 * smoothstep(L - 0.6, L, x);
  const beltY = x => 0.9 + (0.99 - 0.9) * THREE.MathUtils.clamp((CABIN[1] - x) / (CABIN[1] - CABIN[0]), 0, 1);
  const inCabin = x => x > CABIN[0] && x < CABIN[1];
  return { L, topY, bottomY, plan, creaseY, blackY, beltY, inCabin, xr, xf, arch };
}

const UPPER = 12;
const LOW = 6; // 바닥 중앙, 바닥, 실(sill), 블랙 라인, 캐릭터 라인, 어깨
// x 위치의 반쪽 단면 [z, y] (바닥 중앙 → 옆면 → 지붕 중앙)
function section(spec, P, x) {
  const yb = P.bottomY(x);
  const yt = Math.max(P.topY(x), yb + 0.06);
  const wmax = (spec.W / 2) * P.plan(x);
  const cabin = P.inCabin(x) && yt - P.beltY(x) > 0.1;
  let ysh = cabin ? Math.min(P.beltY(x), yt - 0.1) : yt - 0.04 * Math.min(1, (yt - yb) / 0.3);
  ysh = THREE.MathUtils.clamp(ysh, yb + 0.03, yt - 0.008);
  const yc = THREE.MathUtils.clamp(P.creaseY(x), yb + 0.02, ysh - 0.012);
  const ws = wmax * 0.9;
  const yk = THREE.MathUtils.clamp(yb + P.blackY(x), yb + 0.006, yc - 0.006);
  const zk = ws + (wmax - ws) * (yk - yb) / Math.max(1e-3, yc - yb);
  const wsh = wmax * (cabin ? 0.95 : 0.93);
  const out = [[0, yb], [ws * 0.55, yb], [ws, yb + 0.004], [zk, yk], [wmax, yc], [wsh, ysh]];
  const h = yt - ysh;
  const p = cabin ? 2.6 : 6, e = 2 / p, tumble = cabin ? 0.4 : 0.02;
  for (let j = 1; j <= UPPER; j++) {
    const th = (j / UPPER) * Math.PI / 2;
    const c = Math.pow(Math.cos(th), e), s = Math.pow(Math.sin(th), e);
    out.push([wsh * c * (1 - tumble * s), ysh + h * s]);
  }
  out.cabin = cabin; out.yb = yb; out.yt = yt; out.yk = yk;
  return out;
}

// 차체 표면에서 (x, y) 높이의 반폭
export function roadsterSurfZ(spec, P, x, y) {
  const s = section(spec, P, x);
  for (let i = 1; i < s.length; i++) {
    const [z0, y0] = s[i - 1], [z1, y1] = s[i];
    if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && y1 !== y0) return z0 + (z1 - z0) * (y - y0) / (y1 - y0);
  }
  return 0;
}

function bodyGeometry(spec, P) {
  const L = spec.L, N = 170;
  const HALF = LOW + UPPER;
  const ringN = HALF * 2 - 2;
  const pos = [], xs = [], secs = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const x = L * (0.5 - 0.5 * Math.cos(Math.PI * u));
    const s = section(spec, P, x);
    xs.push(x); secs.push(s);
    const ring = s.slice(0, HALF).concat(s.slice(1, HALF - 1).reverse().map(([z, y]) => [-z, y]));
    ring.forEach(([z, y]) => pos.push(x, y, z));
  }
  // 재질: 0 페인트, 1 유리, 2 블랙 트림, 3 브론즈 유리 지붕
  const groups = [[], [], [], []];
  const kOf = j => (j < HALF ? j : ringN - j);
  for (let i = 0; i < N - 1; i++) {
    const xc = (xs[i] + xs[i + 1]) / 2;
    const cabin = secs[i].cabin && secs[i + 1].cabin;
    for (let j = 0; j < ringN; j++) {
      const jn = (j + 1) % ringN;
      const k = Math.min(kOf(j), kOf(jn)); // 이 면이 시작하는 반쪽 인덱스
      let g = 0;
      if (k <= 2) g = 2;                                  // 바닥 + 실 아래 블랙
      else if (k >= LOW - 1 && cabin) {
        g = 1;
        if (k >= HALF - 4 && xc > ROOF_PANEL[0] && xc < ROOF_PANEL[1]) g = 3;
      }
      const a = i * ringN + j, b = (i + 1) * ringN + j, c = (i + 1) * ringN + jn, d = i * ringN + jn;
      groups[g].push(a, b, d, b, c, d);
    }
  }
  // 앞뒤 마감 (부채꼴)
  [0, N - 1].forEach((i, n) => {
    const base = pos.length / 3;
    let cy = 0;
    for (let j = 0; j < ringN; j++) { const o = (i * ringN + j) * 3; pos.push(pos[o], pos[o + 1], pos[o + 2]); cy += pos[o + 1]; }
    pos.push(xs[i], cy / ringN, 0);
    const c = base + ringN;
    for (let j = 0; j < ringN; j++) {
      const p = base + j, q = base + ((j + 1) % ringN);
      groups[n === 0 ? 2 : 0].push(...(n === 0 ? [c, p, q] : [c, q, p]));
    }
  });
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const all = [];
  groups.forEach((g, gi) => { geo.addGroup(all.length, g.length, gi); all.push(...g); });
  geo.setIndex(all);
  geo = toCreasedNormals(geo, 0.42);
  return geo;
}

// 리어 패널: 위쪽은 페인트, 아래는 블랙 (차체 뒤 끝 단면 모양을 그대로 사용)
function rearFace(spec, P, mat, yFrom, yTo, x) {
  const s = section(spec, P, 0.0005);
  const half = [];
  for (let i = 0; i < s.length; i++) {
    const [z, y] = s[i];
    if (y >= yFrom && y <= yTo) half.push([z, y]);
  }
  half.push([roadsterSurfZ(spec, P, 0.0005, yTo), yTo]);
  half.unshift([roadsterSurfZ(spec, P, 0.0005, yFrom), yFrom]);
  half.sort((a, b) => a[1] - b[1]);
  const shape = new THREE.Shape();
  shape.moveTo(-half[0][0], half[0][1]);
  half.forEach(([z, y]) => shape.lineTo(z, y));
  for (let i = half.length - 1; i >= 0; i--) shape.lineTo(-half[i][0], half[i][1]);
  const geo = new THREE.ShapeGeometry(shape);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.y = -Math.PI / 2;
  m.position.x = x;
  return m;
}

function plateTexture(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#222'; g.lineWidth = 6; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = '#1a1a1a'; g.font = '700 72px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 로드스터 차체를 body 그룹에 추가. 바퀴 배치에 필요한 정보를 돌려준다.
export function buildRoadsterBody(spec, body, paint) {
  const P = roadsterProfile(spec);
  const L = spec.L, W = spec.W;
  const surfZ = (x, y) => roadsterSurfZ(spec, P, x, y);
  const mesh = new THREE.Mesh(bodyGeometry(spec, P), [paint, glassMat, trimMat, roofGlassMat]);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'paint';
  body.add(mesh);

  // 휠 하우스 안쪽
  [P.xr, P.xf].forEach(x => {
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(P.arch - 0.01, P.arch - 0.01, W * 0.94, 24, 1, true, -Math.PI / 2, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x050505, side: THREE.BackSide, roughness: 1 }));
    liner.rotation.x = -Math.PI / 2;
    liner.position.set(x, spec.r, 0);
    body.add(liner);
  });

  // 뒤: 페인트 상단 + 블랙 하단 패널
  const yb0 = P.bottomY(0), yk0 = yb0 + P.blackY(0), yt0 = P.topY(0);
  body.add(rearFace(spec, P, paint, yk0, yt0 - 0.002, -0.002));
  body.add(rearFace(spec, P, trimMat, yb0 + 0.002, yk0, -0.004));

  const lights = { tail: [] };
  // 풀폭 레드 라이트바 + 모서리에서 옆으로 감싸는 부분
  const barY = yt0 - 0.07, barZ = surfZ(0.001, barY);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, barZ * 2 * 0.97), tailMat);
  bar.position.set(-0.012, barY, 0);
  body.add(bar); lights.tail.push(bar);
  [-1, 1].forEach(sd => {
    const wrapL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.02), tailMat);
    wrapL.position.set(0.07, barY, sd * (surfZ(0.07, barY) + 0.004));
    body.add(wrapL); lights.tail.push(wrapL);
    // 뒷바퀴 뒤 작은 사이드 마커
    const mk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.01), tailMat);
    const my = P.creaseY(0.35) - 0.08;
    mk.position.set(0.35, my, sd * (surfZ(0.35, my) + 0.004));
    body.add(mk);
  });
  // 블랙 패널의 원형 라이트 6개
  const ringGeo = new THREE.TorusGeometry(0.035, 0.009, 8, 20), dotGeo = new THREE.CircleGeometry(0.03, 16);
  const lampY = (yb0 + yk0) / 2 + 0.03;
  for (let i = 0; i < 6; i++) {
    const z = (i - 2.5) * 0.15 + (i < 3 ? -0.08 : 0.08);
    const rg = new THREE.Mesh(ringGeo, chromeMat); rg.rotation.y = Math.PI / 2; rg.position.set(-0.012, lampY, z); body.add(rg);
    const dt = new THREE.Mesh(dotGeo, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x330000, roughness: 0.3 }));
    dt.rotation.y = -Math.PI / 2; dt.position.set(-0.014, lampY, z); body.add(dt);
  }
  // 번호판
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), new THREE.MeshStandardMaterial({ map: plateTexture('SKY'), roughness: 0.5 }));
  plate.rotation.y = -Math.PI / 2; plate.position.set(-0.012, yk0 + 0.1, 0);
  body.add(plate);
  // 디퓨저 핀
  for (let i = 0; i < 7; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.016), trimMat);
    fin.position.set(0.3, P.bottomY(0.3) + 0.01, (i - 3) * 0.2);
    body.add(fin);
  }
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, W * 0.8), trimMat);
  diffuser.position.set(0.3, P.bottomY(0.3) - 0.025, 0); diffuser.rotation.z = -0.12;
  body.add(diffuser);

  // 앞: 가는 헤드램프 (앞 펜더 모서리) + 블랙 스플리터
  [-1, 1].forEach(sd => {
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const x = L - 0.5 + 0.42 * (k / 12);
      const y = P.topY(x) - 0.045 - (k / 12) * 0.02;
      pts.push(new THREE.Vector3(x, y, sd * (surfZ(x, y) + 0.004)));
    }
    body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.014, 6), headMat));
    // 앞 범퍼 아래 작은 흡기구
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.3), trimMat);
    intake.position.set(L - 0.045, P.bottomY(L - 0.05) + 0.05, sd * 0.42);
    body.add(intake);
  });
  const nb = P.bottomY(L - 0.1);
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, W * 0.66), trimMat);
  splitter.position.set(L - 0.25, nb - 0.01, 0);
  body.add(splitter);

  // 옆: 문 틈, 쿼터 유리 기둥, 작은 카메라 미러
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 });
  [[1.2, 2.72]].forEach(([x0, x1]) => {
    [x0, x1].forEach(x => {
      const y0 = P.bottomY(x) + P.blackY(x) + 0.02, y1 = P.beltY(x) - 0.02;
      [-1, 1].forEach(sd => {
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.008, y1 - y0), seamMat);
        sm.position.set(x, (y0 + y1) / 2, sd * (surfZ(x, (y0 + y1) / 2) + 0.004));
        sm.rotation.y = sd > 0 ? 0 : Math.PI;
        body.add(sm);
      });
    });
  });
  [-1, 1].forEach(sd => {
    // 카메라 미러
    const cx = 2.8, cy = P.beltY(cx) + 0.02;
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.05), trimMat);
    cam.position.set(cx, cy, sd * (surfZ(cx, cy - 0.03) + 0.025));
    body.add(cam);
  });

  return { prof: P, lights };
}
