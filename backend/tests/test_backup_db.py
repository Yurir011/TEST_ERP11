"""정기 백업 스크립트(app/scripts/backup_db.py)의 순수 동작. 실제 pg_dump 는 실행하지 않는다."""
import zipfile
from datetime import datetime

from app.scripts import backup_db

NOW = datetime(2026, 10, 16, 3, 0, 0)


def test_pg_dump_command_keeps_password_out_of_arguments():
    cmd, env = backup_db.pg_dump_command("postgresql+psycopg2://erp_user:s%40cret@db.local:5433/erp_db", backup_db.Path("x.dump"), "pg_dump")
    assert cmd == ["pg_dump", "-h", "db.local", "-p", "5433", "-U", "erp_user", "-d", "erp_db", "-Fc", "-f", "x.dump"]
    assert not any("cret" in part for part in cmd)
    assert env["PGPASSWORD"] == "s@cret"  # URL 인코딩도 풀어서


def test_prune_removes_only_own_old_files(tmp_path):
    names = [
        "erp_db_20260901_030000.dump",  # 45일 전 → 삭제
        "storage_20260910_030000.zip",  # 36일 전 → 삭제
        "erp_db_20261010_030000.dump",  # 6일 전 → 유지
        "erp_db_20260801_145349_before_alembic.dump",  # 수동 백업 → 형식이 달라 유지
        "notes.txt",  # 다른 파일 → 유지
    ]
    for n in names:
        (tmp_path / n).write_text("x")
    removed = backup_db.prune_old(tmp_path, keep_days=30, now=NOW)
    assert sorted(p.name for p in removed) == ["erp_db_20260901_030000.dump", "storage_20260910_030000.zip"]
    assert sorted(p.name for p in tmp_path.iterdir()) == sorted(names[2:])


def test_zip_storage_skips_client_releases_folder_too(tmp_path):
    """설치 파일(client_releases)은 다시 만들 수 있고 크기가 커서 매일 백업에 쌓이지 않게 뺀다."""
    storage = tmp_path / "storage"
    (storage / "receipts").mkdir(parents=True)
    (storage / "receipts" / "1.jpg").write_bytes(b"img")
    (storage / "client_releases").mkdir()
    (storage / "client_releases" / "BENCH-ERP_V.0.07.150_Setup.exe").write_bytes(b"x" * 1000)
    (storage / "client_releases" / "latest.json").write_text("{}")
    out = tmp_path / "out.zip"
    assert backup_db.zip_storage(storage, out, exclude=[storage / "backups", storage / "client_releases"]) == 1
    with zipfile.ZipFile(out) as zf:
        assert [n.replace("\\", "/") for n in zf.namelist()] == ["receipts/1.jpg"]


def test_zip_storage_skips_backup_folder(tmp_path):
    storage = tmp_path / "storage"
    (storage / "receipts").mkdir(parents=True)
    (storage / "receipts" / "1.jpg").write_bytes(b"img")
    (storage / "proposals").mkdir()
    (storage / "proposals" / "3_proposal.pdf").write_bytes(b"pdf")
    backups = storage / "backups" / "daily"
    backups.mkdir(parents=True)
    (backups / "erp_db_20261015_030000.dump").write_bytes(b"old")
    out = backups / "storage_20261016_030000.zip"

    count = backup_db.zip_storage(storage, out, exclude=storage / "backups")
    assert count == 2
    with zipfile.ZipFile(out) as zf:
        assert sorted(n.replace("\\", "/") for n in zf.namelist()) == ["proposals/3_proposal.pdf", "receipts/1.jpg"]
