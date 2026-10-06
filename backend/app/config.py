from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "BENCH ERP"
    log_level: str = "DEBUG"
    database_url: str = "postgresql+psycopg2://erp_user:erp_password@localhost:5432/erp_db"
    cors_origins: list[str] = ["http://localhost:5173", "http://192.168.0.10:5173"]

    jwt_secret_key: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 12

    # 증명서 발급에 표시할 회사 정보. 설정 화면이 생기기 전까지는 .env로 관리한다.
    company_name: str = "BENCH"
    company_ceo_name: str = ""
    company_address: str = ""
    company_reg_no: str = ""
    company_biz_type: str = ""  # 업태
    company_biz_class: str = ""  # 종목

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

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
