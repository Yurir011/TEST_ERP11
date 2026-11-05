import type { CapacitorConfig } from "@capacitor/cli";

// 앱이 열 서버 주소. 데스크톱 앱처럼 서버가 내보내는 화면(/m)을 그대로 보여 주므로,
// 화면을 고치면 서버만 업데이트해도 앱에 반영되고 API 주소·CORS 를 따로 손볼 필요가 없다.
// 맥에서는 `CAP_SERVER_URL=http://서버주소:3102 npx cap sync ios` 처럼 지정한다.
const serverUrl = process.env.CAP_SERVER_URL ?? "http://192.168.0.10:3102";

const config: CapacitorConfig = {
  appId: "kr.co.bench.erp",
  appName: "BENCH ERP",
  webDir: "www", // 서버에 연결하지 못할 때 보여 줄 안내 화면(www/index.html)
  server: {
    url: `${serverUrl}/m`,
    cleartext: true, // 현재 HTTPS 없이 http 로 접속 (Android 용 옵션, iOS 는 Info.plist 의 ATS 예외 필요: README 참고)
  },
  ios: {
    contentInset: "never", // 노치/홈바 안전영역은 화면(CSS env(safe-area-inset-*))이 직접 처리
    scrollEnabled: true,
  },
};

export default config;
