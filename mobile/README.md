# BENCH ERP 아이폰 앱 (mobile)

Capacitor 로 만든 아이폰 앱 껍데기입니다. 앱을 열면 서버의 `/m` 화면(기존 React 모바일 화면)을 앱 안에서 보여 줍니다.
화면 수정은 `frontend/src/features/mobile/` 에서 하고, 서버에 반영하면 앱에도 바로 적용됩니다. 네이티브 기능(푸시, 생체인증 등)을 붙일 때만 앱을 다시 빌드합니다.

## 맥북에서 처음 한 번 (준비물: Xcode, Node 22 이상, CocoaPods, Apple 개발자 계정)
```
git pull
cd mobile
npm install
CAP_SERVER_URL=http://서버주소:3102 npx cap add ios   # ios/ 폴더 생성 (최초 1회)
npx cap open ios                                        # Xcode 열기
```
Xcode 에서: App 타깃 → Signing & Capabilities → Team 에 개발자 계정 선택, Bundle Identifier 확인(`kr.co.bench.erp`) → 아이폰 연결 후 Run.

## http(HTTPS 없음) 로 접속하려면
iOS 는 기본적으로 http 통신을 막습니다(ATS). `ios/App/App/Info.plist` 에 아래를 추가하세요.
```
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoadsInWebContent</key><true/>
  <key>NSAllowsLocalNetworking</key><true/>
</dict>
```
서버가 HTTPS 가 되면 이 항목은 지우고 `CAP_SERVER_URL` 만 https 주소로 바꾸면 됩니다.

## 설정을 바꾼 뒤
```
CAP_SERVER_URL=http://서버주소:3102 npx cap sync ios
```

## 알아 둘 점
- 서버 주소가 사설 IP 이므로 사내 와이파이(또는 VPN)에서만 열립니다.
- 앱 안의 화면은 Safari 가 아니라 WKWebView 입니다. 아이폰 폭 문제는 이 앱에서도 같은지 `/m?debug=layout` 로 확인해 비교하세요.
