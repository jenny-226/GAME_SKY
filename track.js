// 트랙: 닫힌 곡선을 따라 도로를 만들고, 거리(s)로 위치/방향을 찾는다
import * as THREE from 'three';

export class Track {
  constructor(points, { width = 14, samples = 2400, tension = 0.5, lift = null, gaps = null } = {}) {
    this.width = width;
    this.curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', tension);
    const n = samples;
    this.n = n;
    this.pos = []; this.tan = []; this.up = []; this.right = []; this.dist = [];

    // 균일 간격으로 샘플링
    const pts = this.curve.getSpacedPoints(n);
    pts.pop(); // 마지막 점 = 첫 점
    // 고가 구간(점프 갭용) 높이 더하기
    if (lift) pts.forEach((p, i) => { p.y += lift(i / n); });
    let up = new THREE.Vector3(0, 1, 0);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const nx = pts[(i + 1) % n], pv = pts[(i - 1 + n) % n];
      const t = nx.clone().sub(pv).normalize();
      // 위쪽 벡터를 평행 이동해서 수직 루프에서도 뒤틀리지 않게
      up = up.clone().sub(t.clone().multiplyScalar(up.dot(t))).normalize();
      const r = new THREE.Vector3().crossVectors(t, up).normalize();
      if (i > 0) total += p.distanceTo(pts[i - 1]);
      this.pos.push(p); this.tan.push(t); this.up.push(up.clone()); this.right.push(r);
      this.dist.push(total);
    }
    this.length = total + pts[n - 1].distanceTo(pts[0]);
    this.step = this.length / n;
    // 도로가 끊긴 구간 (u 비율 → 거리 s)
    this.skip = (gaps || []).map(([a, b]) => [this.sAtU(a), this.sAtU(b)]);
  }

  sAtU(u) { return this.dist[Math.min(this.n - 1, Math.max(0, Math.floor(u * this.n)))]; }
  inGap(s) { s = ((s % this.length) + this.length) % this.length; return this.skip.some(([a, b]) => s >= a && s <= b); }

  // 거리 s에서의 프레임 (보간)
  frame(s, out = {}) {
    s = ((s % this.length) + this.length) % this.length;
    const f = s / this.step;
    const i = Math.floor(f) % this.n, j = (i + 1) % this.n, k = f - Math.floor(f);
    out.pos = (out.pos || new THREE.Vector3()).lerpVectors(this.pos[i], this.pos[j], k);
    out.tan = (out.tan || new THREE.Vector3()).lerpVectors(this.tan[i], this.tan[j], k).normalize();
    out.up = (out.up || new THREE.Vector3()).lerpVectors(this.up[i], this.up[j], k).normalize();
    out.right = (out.right || new THREE.Vector3()).crossVectors(out.tan, out.up).normalize();
    return out;
  }

  // 곡선의 한 지점에서 옆으로 offset 만큼 떨어진 점
  pointAt(s, offset = 0, lift = 0) {
    const f = this.frame(s);
    return f.pos.clone().addScaledVector(f.right, offset).addScaledVector(f.up, lift);
  }

  // 도로 리본 메쉬 (두께 포함)
  buildRoad(material, { thickness = 0, sideMaterial = null, uvScale = 14, skip = null } = {}) {
    const group = new THREE.Group();
    const hw = this.width / 2;
    const top = ribbon(this, -hw, hw, 0.02, uvScale, false, skip);
    const road = new THREE.Mesh(top, material);
    road.receiveShadow = true;
    group.add(road);
    if (thickness > 0) {
      const mat = sideMaterial || material;
      const bottom = new THREE.Mesh(ribbon(this, -hw, hw, -thickness, uvScale, true, skip), mat);
      const l = new THREE.Mesh(wall(this, -hw, 0.02, -thickness, false, skip), mat);
      const r = new THREE.Mesh(wall(this, hw, 0.02, -thickness, true, skip), mat);
      [bottom, l, r].forEach(m => { m.castShadow = true; m.receiveShadow = true; group.add(m); });
    }
    return group;
  }

  // 도로 가장자리를 따라가는 띠 (연석, 네온 등)
  buildStrip(material, offsetA, offsetB, lift = 0.03, uvScale = 4, skip = null) {
    const m = new THREE.Mesh(ribbon(this, offsetA, offsetB, lift, uvScale, false, skip), material);
    m.receiveShadow = true;
    return m;
  }

  // 가장자리 세로 벽 (가드레일, 네온 벽)
  buildWall(material, offset, h0, h1, flip = false, skip = null) {
    return new THREE.Mesh(wall(this, offset, h0, h1, flip, skip), material);
  }
}

function inSkip(skip, d) { return skip && skip.length && skip.some(([a, b]) => d >= a && d <= b); }

function ribbon(track, a, b, lift, uvScale, flip, skip = null) {
  skip = skip || track.skip;
  const n = track.n;
  const verts = [], uvs = [], idx = [], normals = [];
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    const p = track.pos[k], r = track.right[k], u = track.up[k];
    const v = (i === n ? track.length : track.dist[k]) / uvScale;
    const pa = p.clone().addScaledVector(r, a).addScaledVector(u, lift);
    const pb = p.clone().addScaledVector(r, b).addScaledVector(u, lift);
    verts.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
    const nn = flip ? u.clone().negate() : u;
    normals.push(nn.x, nn.y, nn.z, nn.x, nn.y, nn.z);
    uvs.push(0, v, 1, v);
    if (i < n && !inSkip(skip, track.dist[k])) {
      const o = i * 2;
      if (flip) idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
      else idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

function wall(track, offset, h0, h1, flip, skip = null) {
  skip = skip || track.skip;
  const n = track.n;
  const verts = [], uvs = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    const p = track.pos[k], r = track.right[k], u = track.up[k];
    const v = (i === n ? track.length : track.dist[k]) / 4;
    const base = p.clone().addScaledVector(r, offset);
    const a = base.clone().addScaledVector(u, h0), b = base.clone().addScaledVector(u, h1);
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    uvs.push(v, 1, v, 0);
    if (i < n && !inSkip(skip, track.dist[k])) {
      const o = i * 2;
      if (flip) idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
      else idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
