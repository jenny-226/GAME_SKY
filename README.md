# GAME SKY

테슬라 차량으로 4개의 3D 세계를 달리는 브라우저 레이싱 게임 (Three.js).

## 실행

빌드 없이 바로 실행됩니다. 이 폴더에서 정적 서버를 띄우고 브라우저로 여세요.

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

GitHub Pages 에 올려도 그대로 동작합니다. (`index.html` 을 파일로 직접 열면 모듈 로딩이 막히니 서버로 여세요.)

## 세계 테마 (3D 배경)

| 세계 | 분위기 |
| --- | --- |
| SKY HILLS | 화창한 언덕 도시 · 산 위 "SKY HILLS" 사인, 야자수, 인도, 가로등, 마주 오는 차 |
| NEON RAMP | 밤하늘 · 빨간 네온 가장자리 콘크리트 램프, 수직 루프, 철골 트러스, 도시 야경 |
| GRAND PRIX | 안개 낀 서킷 · 빨강/흰 연석, 관중석, 출발 갠트리, AI 레이서, 흩날리는 눈 |
| CLOUD HIGHWAY | 노을 하늘 · 구름 위 떠 있는 도로, 떠다니는 섬, 황금 링 |

## 자동차 (차고)

- 모델: Model 3 · Model S · Model Y · Model X · Roadster · Cybercab · Cybertruck
  (실제 차량 치수·축거·옆모습 실루엣으로 만든 3D 모델)
- **Paint**: 테슬라 순정 컬러 + 추가 컬러 12종, 커스텀 컬러 선택기
- **Shape**: 모델, 휠(에어로/스포츠/터빈/사이버), 스포일러(없음/립/GT 윙), 차고(기본/로우/리프트)
- 선택은 브라우저에 자동 저장됩니다.

### 실제 3D 파일로 교체하기 (선택)

같은 폴더에 `<모델id>.glb` 파일을 넣으면 그 모델을 대신 사용합니다.
파일 이름: `model3.glb`, `modelS.glb`, `modelY.glb`, `modelX.glb`, `roadster.glb`, `cybercab.glb`, `cybertruck.glb`
재질 이름에 `paint` / `body` 가 들어간 부분에 선택한 색상이 칠해집니다.

## 조작

- PC: `↑`/`W` 가속, `↓`/`S`/`Space` 브레이크, `←` `→` 조향, `Esc` 일시정지
- 모바일: 화면의 ◀ ▶ / BRAKE / GAS 버튼

## 파일 구성 (모두 이 폴더 바로 아래)

- `index.html` · `style.css` — 화면과 UI
- `main.js` — 게임 루프, 주행 물리, 차고/메뉴
- `worlds.js` — 세계 테마별 3D 배경
- `cars.js` — 테슬라 차량 모델과 색상/모양 옵션
- `track.js` — 트랙(도로) 생성
- `utils.js` — 노이즈, 텍스처 도구
