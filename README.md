# BENCH ERP

주식회사 벤치소프트(BENCH) 사내 전용 ERP 시스템. 통신기기 개발·제조업체 특성에 맞춰 인사·영업·회계 업무를 하나의 인트라넷 웹앱에서 처리한다.

> 외부 비공개, 사내망 전용. 상세 기획/진행 상황은 [`CLAUDE.md`](./CLAUDE.md) 참고.

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프론트엔드 | React 19 + TypeScript + Vite + Tailwind CSS |
| 백엔드 | Python (FastAPI) + SQLAlchemy |
| DB | PostgreSQL |
| 인증 | JWT (Bearer Token) |
| PDF 생성 | reportlab (한글 폰트: 맑은 고딕) |
| 음력/공휴일 | lunar-javascript |

## 주요 기능

- **인증/권한**: 로그인, 관리자·일반직원 2단계 권한, 직원 계정 관리(설정)
- **대시보드**: 근태·연차·프로젝트·거래처 현황 요약, 최근 공지 연동
- **일정관리**: 월/주/일 캘린더, 색상 라벨, 반복 일정(매일·매주·매년), 공휴일·음력 표시, 사이드바 오늘의 할일
- **공지사항**: 관리자 작성, 전 직원 열람
- **출퇴근기록**: 출근/퇴근 버튼, 월별 조회(최근 36개월), 관리자 전체 현황
- **연차관리**: 신청/승인/반려, 근속 기준 자동 계산, 승인 시 공지 자동 등록
- **재직/경력증명서**: PDF 자동 발급 및 재다운로드
- **거래처관리**: 등록/검색/수정, 미수금·미지급금 관리
- **프로젝트관리**: 견적서·거래명세서 세트 생성(공동 채번), PDF 출력
- **매입매출관리**(관리자 전용): 매입/매출 장부, 부가세 자동 집계
- **입출금관리**(관리자 전용): 입출금 장부, 영수증 이미지 첨부, 법인카드 CSV 가져오기

## 시작하기

### 방법 1 — 배치 파일 (권장)
루트의 `start.bat`을 더블클릭하면 백엔드/프론트엔드가 각각 새 창으로 실행되고 브라우저가 자동으로 열린다. 종료는 `stop.bat` 또는 두 콘솔 창을 직접 닫으면 된다.

### 방법 2 — 수동 실행 (최초 1회는 의존성 설치 필요)
```bash
# 백엔드 (최초 1회: 가상환경 생성 + 패키지 설치)
cd backend
python -m venv venv
./venv/Scripts/python.exe -m pip install -r requirements.txt
./venv/Scripts/python.exe -m uvicorn app.main:app --port 8000

# 프론트엔드
cd frontend
npm install
npm run dev
```

`backend/.env`가 없다면 `backend/.env.example`을 복사해서 값을 채운다 (DB 접속정보, JWT 시크릿, 회사정보 등).

### 같은 사무실 네트워크의 다른 PC에서 테스트하기
`start.bat`으로 서버를 켠 PC와 같은 공유기(네트워크)에 연결돼 있다면, 별도 서버 없이 그 PC의 IP로 접속해서 테스트할 수 있다.

- 서버 PC의 IP 확인: PowerShell에서 `ipconfig` → "IPv4 주소" 확인
- 다른 PC 브라우저에서 `http://<서버 PC의 IP>:5173` 접속 (예: `http://192.168.0.10:5173`)
- 서버 PC의 IP가 바뀌면 `backend/app/config.py`의 `cors_origins`도 함께 갱신해야 한다
- Windows 방화벽에서 5173, 8000 포트 인바운드 허용이 필요하다 (사설 네트워크 기준)

- 프론트엔드: http://localhost:5173
- 백엔드 헬스체크: http://localhost:8000/api/health
- DB 접속 정보는 `backend/.env.example` 참고 (실제 값은 `backend/.env`에 별도 관리, git 미포함)

### 최초 관리자 계정 생성
```bash
cd backend
./venv/Scripts/python.exe -m app.scripts.create_admin
```

## 프로젝트 구조

```
/backend
  app/
    models/        SQLAlchemy 모델
    schemas/        Pydantic 스키마
    routers/        API 라우터
    services/       PDF 생성, CSV 파싱 등
    core/           인증, 보안, 의존성
/frontend
  src/
    features/       기능별 모듈 (attendance, leaves, schedule, ...)
    components/      공통 레이아웃/UI 컴포넌트
    lib/             API 클라이언트, 포맷터, 로거
```

## 참고 문서

- [`CLAUDE.md`](./CLAUDE.md) — 20단계 구축 계획 및 진행 상황 체크리스트
