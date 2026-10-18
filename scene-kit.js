// 3D 장면 공용 도구 (하늘, 조명, 지형, 인스턴싱)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, fbm, noise2, smoothstep, canvasTexture, speckle, roadTexture } from './utils.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ───────── 공용 부품 ─────────

// 그라데이션 하늘 + 태양
export function makeSky({ top, mid, bottom, sunDir, sunColor = '#fff4d6', sunSize = 0.9994, glow = 0.35, stars = 0, aurora = 0 }) {
  const uniforms = {
    top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, bottom: { value: new THREE.Color(bottom) },
    sunDir: { value: sunDir.clone().normalize() }, sunColor: { value: new THREE.Color(sunColor) },
    sunSize: { value: sunSize }, glow: { value: glow }, aurora: { value: aurora }, time: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top, mid, bottom, sunDir, sunColor; uniform float sunSize, glow, aurora, time; varying vec3 vDir;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n21(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(mid, bottom, clamp(-h*4.0,0.0,1.0));
        float sd = dot(d, sunDir);
        c += sunColor * pow(max(sd,0.0), 18.0) * glow;
        c += sunColor * smoothstep(sunSize, sunSize + 0.0004, sd) * 2.0;
        if (aurora > 0.0 && h > 0.02) {
          float az = atan(d.z, d.x);
          float band = 0.0;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float wave = sin(az * (3.0 + fi) + time * (0.15 + fi * 0.07) + n21(vec2(az * 4.0, fi + time * 0.1)) * 2.0) * 0.08;
            float y0 = 0.28 + fi * 0.12 + wave;
            band += exp(-pow((h - y0) / (0.05 + 0.03 * fi), 2.0)) * (0.6 + 0.4 * n21(vec2(az * 20.0, time * 0.4 + fi)));
          }
          vec3 ac = mix(vec3(0.1, 1.0, 0.55), vec3(0.6, 0.25, 1.0), smoothstep(0.35, 0.6, h));
          c += ac * band * aurora;
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  const g = new THREE.Group();
  g.add(sky);
  g.userData.update = t => { uniforms.time.value = t; };
  if (stars) {
    const r = rng(7);
    const pos = [];
    for (let i = 0; i < stars; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05;
      const s = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * s * 1700, y * 1700, Math.sin(a) * s * 1700);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    pts.frustumCulled = false;
    g.add(pts);
  }
  return g;
}

// 가장 가까운 트랙 지점 (수평 거리, 인덱스)
export function trackNearestFn(track) {
  const idx = [];
  for (let i = 0; i < track.n; i += 6) idx.push(i);
  return (x, z) => {
    let m = Infinity, bi = 0;
    for (const i of idx) {
      const p = track.pos[i];
      const dx = p.x - x, dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < m) { m = d; bi = i; }
    }
    return { d: Math.sqrt(m), i: bi };
  };
}

export function lights(group, { sky, ground, hemi = 0.9, sun, sunI = 2.6, dir }) {
  const h = new THREE.HemisphereLight(sky, ground, hemi);
  group.add(h);
  const d = new THREE.DirectionalLight(sun, sunI);
  d.position.copy(dir).multiplyScalar(150);
  d.castShadow = true;
  d.shadow.mapSize.set(2048, 2048);
  const c = d.shadow.camera;
  c.left = c.bottom = -70; c.right = c.top = 70; c.near = 10; c.far = 400;
  d.shadow.bias = -0.0004;
  d.shadow.normalBias = 0.03;
  group.add(d, d.target);
  return d;
}

export function instanced(geo, mat, matrices, { cast = true, receive = false, colors = null } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
  if (colors) colors.forEach((c, i) => m.setColorAt(i, c));
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function mat4(x, y, z, s = 1, ry = 0, sy = null, rx = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(V(x, y, z), _q, V(s, sy ?? s, s));
}

// 트랙과의 최소 거리 (수평)
export function trackDistanceFn(track) {
  const pts = [];
  for (let i = 0; i < track.n; i += 6) pts.push(track.pos[i]);
  return (x, z) => {
    let m = Infinity;
    for (const p of pts) {
      const dx = p.x - x, dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < m) m = d;
    }
    return Math.sqrt(m);
  };
}

// 지형 (높이·색상 함수)
export function makeTerrain({ size = 1800, seg = 220, height, color, map }) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const cols = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const h = height(x, z);
    p.setY(i, h);
    color(x, z, h, c);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map }));
  mesh.receiveShadow = true;
  return mesh;
}

// 트랙을 따라 간격마다 콜백
export function alongTrack(track, every, fn, start = 0) {
  for (let s = start; s < track.length; s += every) fn(track.frame(s), s);
}

export function textPlane(text, { w = 100, h = 20, color = '#ffffff', font = '900 200px Arial Black, Arial', shadow = 'rgba(0,0,0,0.25)', bg = null } = {}) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = Math.round(2048 * h / w);
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fs = parseInt(font.match(/(\d+)px/)[1], 10);
  const scale = Math.min(1, (c.width * 0.94) / g.measureText(text).width);
  g.font = font.replace(/\d+px/, `${Math.floor(fs * scale)}px`);
  if (shadow) { g.fillStyle = shadow; g.fillText(text, c.width / 2 + 10, c.height / 2 + 12); }
  g.fillStyle = color; g.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: !bg, roughness: 0.8, side: THREE.DoubleSide }));
}

// ── 식물 / 소품 지오메트리 ──
export function palmGeometry() {
  const parts = [];
  // 살짝 휘어진 줄기
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.CylinderGeometry(0.22 - i * 0.015, 0.26 - i * 0.015, 2.2, 7);
    seg.translate(Math.pow(i / 6, 2) * 1.2, 1.1 + i * 2.1, 0);
    parts.push(seg);
  }
  const trunk = mergeGeometries(parts);
  const leaves = [];
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.ConeGeometry(0.55, 5.2, 4, 1);
    leaf.scale(1, 1, 0.18);
    leaf.translate(0, 2.6, 0);
    leaf.rotateZ(-Math.PI / 2 + 0.45 + (i % 2) * 0.25);
    leaf.rotateY((i / 9) * Math.PI * 2);
    leaf.translate(1.2, 13.2, 0);
    leaves.push(leaf);
  }
  return { trunk, leaves: mergeGeometries(leaves) };
}

export function treeGeometry() {
  const blobs = [];
  [[0, 4.2, 0, 2.4], [1.3, 3.6, 0.6, 1.7], [-1.2, 3.8, -0.5, 1.8], [0.2, 5.6, -0.3, 1.6]].forEach(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, y, z);
    blobs.push(g);
  });
  const crown = mergeGeometries(blobs);
  const trunk = new THREE.CylinderGeometry(0.25, 0.35, 3.4, 6);
  trunk.translate(0, 1.7, 0);
  return { crown, trunk };
}

export function lampGeometry(h = 9) {
  const pole = new THREE.CylinderGeometry(0.11, 0.16, h, 8);
  pole.translate(0, h / 2, 0);
  const arm = new THREE.BoxGeometry(2.4, 0.12, 0.12);
  arm.translate(-1.1, h - 0.1, 0);
  const head = new THREE.BoxGeometry(0.8, 0.18, 0.35);
  head.translate(-2.2, h - 0.2, 0);
  const base = new THREE.CylinderGeometry(0.3, 0.35, 0.5, 8);
  base.translate(0, 0.25, 0);
  return mergeGeometries([pole, arm, head, base]);
}

// 철골 트러스 기둥 (격자 부재들의 행렬 목록에 추가)
export function addTruss(list, x, z, y0, y1, w = 1.6, ry = 0) {
  const h = y1 - y0;
  if (h < 1) return;
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const corner = (cx, cz) => [x + cx * cos - cz * sin, z + cx * sin + cz * cos];
  const half = w / 2;
  const cs = [[-half, -half], [half, -half], [half, half], [-half, half]];
  cs.forEach(([cx, cz]) => {
    const [px, pz] = corner(cx, cz);
    list.push(mat4(px, y0 + h / 2, pz, 1, ry, h, 0, 0).multiply(new THREE.Matrix4().makeScale(0.12, 1, 0.12)));
  });
  const step = 2.4;
  for (let y = y0 + step; y < y1; y += step) {
    for (let k = 0; k < 4; k++) {
      const [ax, az] = cs[k], [bx, bz] = cs[(k + 1) % 4];
      const [px, pz] = corner((ax + bx) / 2, (az + bz) / 2);
      const horiz = k % 2 === 0 ? ry : ry + Math.PI / 2;
      list.push(mat4(px, y, pz, 1, horiz).multiply(new THREE.Matrix4().makeScale(w, 0.08, 0.08)));
      // 대각선
      const diag = Math.hypot(w, step);
      list.push(mat4(px, y - step / 2, pz, 1, horiz, 1, 0, Math.atan2(step, w) * (y % (step * 2) < step ? 1 : -1)).multiply(new THREE.Matrix4().makeScale(diag, 0.06, 0.06)));
    }
  }
}


// 카메라 주변을 따라다니는 입자
export function makeParticles(count, range, color, size) {
  const pos = new Float32Array(count * 3);
  const r = rng(99);
  for (let i = 0; i < count * 3; i++) pos[i] = (r() - 0.5) * range;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.8, depthWrite: false }));
  points.frustumCulled = false;
  return {
    points,
    update(dt, cam) {
      if (!cam) return;
      for (let i = 0; i < count; i++) {
        let y = pos[i * 3 + 1] - dt * (2 + (i % 5) * 0.5);
        if (y < -range / 2) y += range;
        pos[i * 3 + 1] = y;
        pos[i * 3] += Math.sin(i + y * 0.1) * dt * 0.6;
      }
      geo.attributes.position.needsUpdate = true;
      points.position.set(Math.round(cam.x / range) * range, cam.y, Math.round(cam.z / range) * range);
    },
  };
}

