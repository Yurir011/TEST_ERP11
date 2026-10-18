/**
 * 받은 HTML 메일을 보여 주는 틀. 앱이 이미 위험한 내용을 걸러 주지만, 한 번 더 막는다.
 *  - sandbox 에서 스크립트(allow-scripts)와 같은 출처 권한(allow-same-origin)을 주지 않는다.
 *  - 팝업(링크 누르기)만 허용하고, 링크는 앱이 기본 브라우저로 연다.
 *  - CSP 로 이미지는 data: 만 허용한다. 사용자가 "이미지 보기"를 누르면 https 이미지도 허용한다.
 */
import { MAIL_FRAME_SANDBOX, buildMailDocument } from "./mailFrame";

interface Props {
  html: string;
  allowRemoteImages: boolean;
  title: string;
}

export function MailHtmlFrame({ html, allowRemoteImages, title }: Props) {
  return (
    <iframe
      title={title}
      sandbox={MAIL_FRAME_SANDBOX}
      referrerPolicy="no-referrer"
      srcDoc={buildMailDocument(html, allowRemoteImages)}
      className="w-full h-full border-0 bg-white rounded-lg"
    />
  );
}
