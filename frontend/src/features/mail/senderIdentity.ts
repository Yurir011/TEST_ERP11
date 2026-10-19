import type { MailIdentitySettings, MailSenderIdentity } from "../../lib/desktop";

export const sameAddress = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** 고를 수 있는 보내는 사람들: 로그인한 계정(ERP 사용자 이름) 먼저, 그다음 등록한 이름·주소 (이름이 비면 ERP 사용자 이름) */
export function senderOptions(settings: MailIdentitySettings, account: MailSenderIdentity): MailSenderIdentity[] {
  const extra = settings.items.filter((i) => !sameAddress(i.address, account.address)).map((i) => ({ name: i.name || account.name, address: i.address }));
  return [account, ...extra];
}

/** 처음 고를 보내는 사람: 기본으로 정한 주소, 없으면 로그인한 계정 */
export function defaultSender(settings: MailIdentitySettings, account: MailSenderIdentity): MailSenderIdentity {
  return senderOptions(settings, account).find((o) => settings.defaultAddress !== "" && sameAddress(o.address, settings.defaultAddress)) ?? account;
}
