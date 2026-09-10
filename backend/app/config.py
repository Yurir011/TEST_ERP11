from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "BENCH ERP"
    log_level: str = "DEBUG"
    database_url: str = "postgresql+psycopg2://erp_user:erp_password@localhost:5432/erp_db"
    cors_origins: list[str] = ["http://localhost:5173"]

    jwt_secret_key: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 12

    # 증명서 발급에 표시할 회사 정보. 설정 화면이 생기기 전까지는 .env로 관리한다.
    company_name: str = "BENCH"
    company_ceo_name: str = ""
    company_address: str = ""
    company_reg_no: str = ""

    documents_dir: str = "storage/documents"
    receipts_dir: str = "storage/receipts"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
