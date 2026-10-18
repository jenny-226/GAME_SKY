// 공용 도구: 노이즈, 캔버스 텍스처, 난수
import * as THREE from 'three';

// 시드 고정 난수 (매번 같은 배경이 나오도록)
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D 값 노이즈 + fbm
function hash(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function smooth(t) { return t * t * (3 - 2 * t); }
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash(xi, yi), b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 5) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise2(x * f, y * f);
    f *= 2; amp *= 0.5;
  }
  return sum;
}

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// 캔버스로 텍스처 만들기
export function canvasTexture(size, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// 점 노이즈를 뿌려 질감 주기
export function speckle(g, size, colors, count, maxR = 1.5) {
  const r = rng(size + count);
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = r() * maxR + 0.4;
    g.fillRect(r() * size, r() * size, s, s);
  }
}

// 아스팔트 + 차선 텍스처 (u: 도로 폭, v: 진행 방향)
export function roadTexture({ base = '#3a3c40', edge = '#e8e8e8', center = '#f2c230', dashed = false, edgeLines = true } = {}) {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    speckle(g, s, ['#2c2e31', '#4a4c50', '#55575c', '#303236'], 9000, 2);
    // 타이어 자국
    g.globalAlpha = 0.08; g.fillStyle = '#000';
    g.fillRect(s * 0.22, 0, s * 0.08, s); g.fillRect(s * 0.7, 0, s * 0.08, s);
    g.globalAlpha = 1;
    if (edgeLines) {
      g.fillStyle = edge;
      g.fillRect(s * 0.03, 0, s * 0.012, s);
      g.fillRect(s * 0.958, 0, s * 0.012, s);
    }
    g.fillStyle = center;
    if (dashed) {
      g.fillRect(s * 0.494, 0, s * 0.012, s * 0.5);
    } else {
      g.fillRect(s * 0.488, 0, s * 0.008, s);
      g.fillRect(s * 0.504, 0, s * 0.008, s);
    }
  });
}
