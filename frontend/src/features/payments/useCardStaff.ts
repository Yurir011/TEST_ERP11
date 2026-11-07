import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { logError } from "../../lib/logger";

export interface CardStaff {
  id: number;
  name: string;
}

/** 카드 소유 직원·사용 허용 직원을 고르는 재직 직원 목록 (id·이름만, 로그인한 직원 누구나 조회). */
export function useCardStaff(): CardStaff[] {
  const [staff, setStaff] = useState<CardStaff[]>([]);
  useEffect(() => {
    apiGet<CardStaff[]>("/api/payment-accounts/staff")
      .then(setStaff)
      .catch((err) => logError("PaymentAccounts", "직원 목록 조회 실패", err));
  }, []);
  return staff;
}
