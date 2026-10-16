from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "BENCH ERP"
    # 실행 환경. 운영 서버에서는 .env 에 ENVIRONMENT=production 을 지정한다. production 에서는 보안 설정이 안전하지 않으면 서버가 시작되지 않는다.
    environment: str = "development"
    # 기본은 INFO. 개발 PC 에서는 .env 에 LOG_LEVEL=DEBUG 를 지정해 디버그 메시지를 본다.
    log_level: str = "INFO"
    database_url: str = "postgresql+psycopg2://erp_user:erp_password@localhost:5432/erp_db"
    cors_origins: list[str] = ["http://localhost:5173", "http://192.168.0.10:5173"]

    jwt_secret_key: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 12

    # 로그인 시도 제한: 같은 이메일로 login_max_failures 번 실패하면 login_lockout_seconds 동안 로그인을 막는다 (실패는 login_window_seconds 안의 것만 센다).
    # 같은 접속 주소(IP)는 여러 사람이 한 PC 를 쓸 수 있어 login_ip_max_failures 로 더 느슨하게 둔다.
    login_max_failures: int = 5
    login_ip_max_failures: int = 20
    login_window_seconds: int = 600
    login_lockout_seconds: int = 300

    # 증명서 발급에 표시할 회사 정보. 설정 화면이 생기기 전까지는 .env로 관리한다.
    company_name: str = "BENCH"
    company_ceo_name: str = ""
    company_address: str = ""
    company_reg_no: str = ""
    company_biz_type: str = ""  # 업태
    company_biz_class: str = ""  # 종목
    card_bc_pay_day: int = 23  # BC카드 매월 결제일 (사용기간 1일~말일, 다음 달 결제)
    card_kb_pay_day: int = 15  # KB국민카드 매월 결제일
    company_email: str = "info@bench-soft.com"  # 세금계산서 공급자 이메일 (비어 있으면 발행자 로그인 이메일 사용)

    documents_dir: str = "storage/documents"
    receipts_dir: str = "storage/receipts"
    project_documents_dir: str = "storage/project_documents"
    tax_invoice_images_dir: str = "storage/tax_invoice_images"
    proposals_dir: str = "storage/proposals"
    proposal_attachments_dir: str = "storage/proposal_attachments"
    business_reg_images_dir: str = "storage/business_reg_images"
    bankbook_images_dir: str = "storage/bankbook_images"

    # 사업자등록증 이미지 인식(OCR)에 사용하는 로컬 Tesseract 실행 파일 경로. 서버 PATH에 없을 때만 .env로 override.
    tesseract_cmd: str = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

    # 팝빌 전자세금계산서 연동. 연동신청으로 발급받은 LinkID/SecretKey, 테스트 팝빌 가입 사업자번호/아이디.
    popbill_link_id: str = ""
    popbill_secret_key: str = ""
    popbill_corp_num: str = ""
    popbill_user_id: str = ""
    popbill_is_test: bool = True

    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parent.parent / ".env", env_file_encoding="utf-8")


settings = Settings()
