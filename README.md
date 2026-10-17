# 우연한 식탁

처음 보는 4~6명이 결이 맞는 사람들과 한 테이블에서 저녁을 먹도록 연결하는 소셜다이닝 서비스의 해커톤 MVP입니다.
참가자용 모바일 웹앱과 운영자 웹을 하나의 Next.js 프로젝트로 만듭니다.

- 설계 문서: `시스템_설계.md`, `MVP_기능_범위.md`, `사용자_흐름도.md`
- 스택: Next.js 15 (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth) · Vercel (배포, Cron)

## 처음 설정 (10/17 기반 작업)

### 1. 코드 내려받기

이 폴더를 iCloud 밖(예: `~/Developer/uyeonhan-table`)으로 옮긴 뒤 작업하는 것을 권장합니다. iCloud 폴더 안에서는 `node_modules`와 git 파일이 동기화되며 느려지거나 충돌할 수 있습니다.

```bash
cd ~/Developer/uyeonhan-table
npm install
```

### 2. GitHub 저장소

1. GitHub에서 새 저장소를 만듭니다 (비공개 권장).
2. 이 폴더에서:

```bash
git remote add origin https://github.com/<계정>/<저장소>.git
git push -u origin main
```

### 3. Supabase 프로젝트

1. supabase.com에서 새 프로젝트를 만듭니다 (지역: Northeast Asia (Seoul) 권장).
2. **SQL Editor**에 `supabase/migrations/0001_init.sql` 내용을 통째로 붙여 넣고 실행합니다.
3. **Project Settings → API**에서 Project URL, anon key, service_role key를 복사합니다.
4. **Authentication → Providers → Email**에서 이메일 로그인이 켜져 있는지 확인합니다. 테스트 계정은 시드 스크립트가 만들기 때문에 이메일 인증 메일은 필요 없습니다.

### 4. 환경 변수

```bash
cp .env.example .env.local
```

`.env.local`에 3번에서 복사한 값, 아무 긴 문자열의 `CRON_SECRET`, 테스트 계정 비밀번호 `SEED_TEST_PASSWORD`를 채웁니다. `.env.local`은 git에 올라가지 않습니다.

### 5. 시드 데이터

```bash
npm run seed
```

- 다가오는 목요일 3주 × 서울 4개 지역 = 회차 12개 (19:30, 신청 마감·자동 매칭 = 직전 화요일 24:00)
- 지역별 가상 식당 3곳, 회차 날짜별 수용 인원
- `우연한식탁_가상데이터.xlsx` 응답 294건 중 서울 4개 지역을 고른 291명 → 프로필, 이용권, 신청, 모의 결제(전원 결제 완료)
  - 원본의 날짜는 지난 날짜라서, 원래 고른 날짜 수만큼 다가오는 주를 앞에서부터 배정합니다.
  - 원본의 3회권·4회권은 멤버십 1개월로 바꿔 넣었습니다.
- 테스트 계정: `admin@test.local`(운영자), `participant1~3@test.local`(참가자)

### 6. 로컬 실행

```bash
npm run dev
```

http://localhost:3000 → 로그인 → 운영자는 `/admin`, 참가자는 `/home`으로 이동합니다.

### 7. Vercel 배포

1. vercel.com에서 **Add New → Project**로 GitHub 저장소를 가져옵니다.
2. **Environment Variables**에 `.env.local`과 같은 값을 넣습니다 (`SEED_TEST_PASSWORD` 제외).
3. 배포가 끝나면 나오는 주소가 제출용 배포 링크입니다.
4. `vercel.json`의 Cron은 매주 화요일 15:05 UTC(= 수요일 00:05 KST)에 `/api/cron/match`를 호출합니다. 요금제별 Cron 제한은 Vercel 문서에서 확인하세요. 시연은 운영자 화면의 **"지금 매칭 실행"** 버튼으로 합니다.

## 폴더 구조

```
app/                  화면 (참가자: /home 등, 운영자: /admin)
app/api/cron/[job]/   예약 작업 진입점 (CRON_SECRET 확인)
lib/supabase/         DB 클라이언트 (server: 로그인 사용자, admin: 시스템 작업 전용)
modules/jobs/         예약 작업 실행기 (매칭·리마인드·콘텐츠 게시·행사 종료)
supabase/migrations/  DB 스키마와 권한(RLS)
scripts/seed/         시드 스크립트
data/seed/            가상 데이터에서 변환한 시드 원본
```

## 다음 작업

시스템_설계.md 7장 일정을 따릅니다.

- 10/18 신청 흐름: 프로필, 일정·지역, 이용권·모의 결제, 홈, 알림 / 운영자 회차·식당
- 10/19 매칭·안내: 매칭 엔진(`modules/matching`), 재배치, 자동 확정, 식당 배정, 단체방, 매칭 모니터, 예외 처리함
- 10/20 실패 해결·피드백
- 10/21 운영 마무리, 리허설, 23:59 전 제출
