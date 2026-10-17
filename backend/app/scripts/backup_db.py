"""정기 백업: DB(pg_dump) + 선택적으로 첨부 파일(storage 폴더) zip. 하루 한 번 작업 스케줄러로 실행한다 (CLAUDE.md 19단계).

- DB: `pg_dump -Fc` 로 `erp_db_YYYYMMDD_HHMMSS.dump` 를 만들고, `pg_restore -l` 로 열어 표 데이터가 들어 있는지 확인한다.
- 첨부 파일(--with-files): storage 아래 영수증·PDF·첨부 폴더를 `storage_YYYYMMDD_HHMMSS.zip` 으로 묶는다 (backups 폴더와 client_releases 폴더는 제외: 백업끼리 겹치거나, 다시 만들 수 있는 설치 파일이 매일 쌓이는 것을 막는다).
- 보관: --keep-days(기본 30)보다 오래된 백업을 지운다. 이 스크립트가 만든 이름 형식의 파일만 지운다.
- DB 비밀번호는 명령줄에 보이지 않도록 PGPASSWORD 환경변수로만 넘긴다.
- pg_dump 위치: 환경변수 PG_BIN(폴더) → PATH → Windows 기본 설치 경로 순으로 찾는다.

사용법 (backend 폴더에서)
  venv\\Scripts\\python.exe -m app.scripts.backup_db                 # DB 만
  venv\\Scripts\\python.exe -m app.scripts.backup_db --with-files    # DB + 첨부 파일
  venv\\Scripts\\python.exe -m app.scripts.backup_db --keep-days 60 --dir D:\\erp_backup
복원 방법은 README 의 "백업과 복원" 참고.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse

from app.config import settings
from app.logging_config import get_logger, setup_logging

logger = get_logger("Backup")

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DIR = BACKEND_DIR / "storage" / "backups" / "daily"
STORAGE_DIR = BACKEND_DIR / "storage"
WINDOWS_PG_BIN = Path(r"C:\Program Files\PostgreSQL\17\bin")
# 이 스크립트가 만든 파일만 정리 대상 (수동 백업 *_before_*.dump 등은 건드리지 않는다)
OWN_FILE = re.compile(r"^(?:erp_db|storage)_(\d{8}_\d{6})\.(?:dump|zip)$")


def stamp(now: datetime) -> str:
    return now.strftime("%Y%m%d_%H%M%S")


def find_tool(name: str) -> str:
    """pg_dump / pg_restore 실행 파일 경로."""
    exe = name + (".exe" if os.name == "nt" else "")
    pg_bin = os.environ.get("PG_BIN")
    if pg_bin and (Path(pg_bin) / exe).exists():
        return str(Path(pg_bin) / exe)
    found = shutil.which(name)
    if found:
        return found
    if (WINDOWS_PG_BIN / exe).exists():
        return str(WINDOWS_PG_BIN / exe)
    raise FileNotFoundError(f"{name} 를 찾지 못했습니다. PostgreSQL bin 폴더를 PATH 에 넣거나 PG_BIN 환경변수로 지정하세요.")


def pg_dump_command(database_url: str, out_file: Path, pg_dump: str) -> tuple[list[str], dict[str, str]]:
    """pg_dump 명령과 환경변수. 비밀번호는 명령이 아니라 환경변수(PGPASSWORD)에만 넣는다."""
    u = urlparse(re.sub(r"^postgresql\+\w+://", "postgresql://", database_url))
    cmd = [pg_dump, "-h", u.hostname or "localhost", "-p", str(u.port or 5432), "-U", unquote(u.username or ""),
           "-d", u.path.lstrip("/"), "-Fc", "-f", str(out_file)]
    env = dict(os.environ)
    if u.password:
        env["PGPASSWORD"] = unquote(u.password)
    return cmd, env


def table_data_count(dump_file: Path, pg_restore: str) -> int:
    """백업 파일 목차의 표 데이터 항목 수 (0 이면 비정상)."""
    r = subprocess.run([pg_restore, "-l", str(dump_file)], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"백업 파일을 열지 못했습니다: {r.stderr.strip()[:300]}")
    return r.stdout.count("TABLE DATA")


def zip_storage(storage_dir: Path, out_file: Path, exclude: Path | list[Path]) -> int:
    """storage 아래 파일을 zip 으로 묶는다 (exclude 폴더들은 제외). 넣은 파일 수를 돌려준다."""
    count = 0
    excluded = [p.resolve() for p in ([exclude] if isinstance(exclude, Path) else exclude)]
    with zipfile.ZipFile(out_file, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(storage_dir.rglob("*")):
            if not path.is_file():
                continue
            resolved = path.resolve()
            if resolved == out_file.resolve() or any(e in resolved.parents for e in excluded):
                continue
            zf.write(path, path.relative_to(storage_dir))
            count += 1
    return count


def prune_old(backup_dir: Path, keep_days: int, now: datetime) -> list[Path]:
    """keep_days 보다 오래된, 이 스크립트가 만든 백업 파일을 지운다. 지운 파일 목록을 돌려준다."""
    cutoff = now - timedelta(days=keep_days)
    removed = []
    for path in sorted(backup_dir.iterdir()):
        m = OWN_FILE.match(path.name)
        if not (path.is_file() and m):
            continue
        made = datetime.strptime(m.group(1), "%Y%m%d_%H%M%S")
        if made < cutoff:
            path.unlink()
            removed.append(path)
    return removed


def run(backup_dir: Path, keep_days: int, with_files: bool, now: datetime | None = None) -> dict:
    now = now or datetime.now()
    backup_dir.mkdir(parents=True, exist_ok=True)
    result: dict = {}

    dump_file = backup_dir / f"erp_db_{stamp(now)}.dump"
    cmd, env = pg_dump_command(settings.database_url, dump_file, find_tool("pg_dump"))
    logger.info(f"[Backup] DB 백업 시작: {dump_file}")
    r = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        dump_file.unlink(missing_ok=True)
        raise RuntimeError(f"pg_dump 실패: {r.stderr.strip()[:500]}")
    tables = table_data_count(dump_file, find_tool("pg_restore"))
    if tables == 0:
        raise RuntimeError(f"백업 파일에 표 데이터가 없습니다: {dump_file}")
    result["db"] = {"file": str(dump_file), "bytes": dump_file.stat().st_size, "table_data": tables}
    logger.info(f"[Backup] DB 백업 완료: {dump_file.name}, {dump_file.stat().st_size:,} bytes, 표 데이터 {tables}개")

    if with_files:
        zip_file = backup_dir / f"storage_{stamp(now)}.zip"
        count = zip_storage(STORAGE_DIR, zip_file, exclude=[STORAGE_DIR / "backups", STORAGE_DIR / "client_releases"])
        result["files"] = {"file": str(zip_file), "bytes": zip_file.stat().st_size, "count": count}
        logger.info(f"[Backup] 첨부 파일 백업 완료: {zip_file.name}, 파일 {count}개, {zip_file.stat().st_size:,} bytes")

    removed = prune_old(backup_dir, keep_days, now)
    result["removed"] = [p.name for p in removed]
    if removed:
        logger.info(f"[Backup] {keep_days}일 지난 백업 {len(removed)}개 정리: {', '.join(p.name for p in removed)}")
    return result


def main() -> int:
    setup_logging()
    parser = argparse.ArgumentParser(description="ERP DB(+첨부 파일) 백업")
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR, help=f"백업 폴더 (기본 {DEFAULT_DIR})")
    parser.add_argument("--keep-days", type=int, default=30, help="이 일수보다 오래된 백업은 지운다 (기본 30)")
    parser.add_argument("--with-files", action="store_true", help="storage 첨부 파일도 zip 으로 백업")
    args = parser.parse_args()
    try:
        result = run(args.dir, args.keep_days, args.with_files)
    except Exception as exc:  # noqa: BLE001 - 작업 스케줄러가 실패를 알 수 있게 종료 코드 1
        logger.error(f"[Backup] 백업 실패: {exc}")
        print(f"백업 실패: {exc}", file=sys.stderr)
        return 1
    print(f"DB: {result['db']['file']} ({result['db']['bytes']:,} bytes, 표 데이터 {result['db']['table_data']}개)")
    if "files" in result:
        print(f"첨부 파일: {result['files']['file']} ({result['files']['count']}개)")
    if result["removed"]:
        print(f"정리한 오래된 백업: {len(result['removed'])}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
