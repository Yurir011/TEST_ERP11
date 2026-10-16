# 기준점 이전의 1회성 마이그레이션 스크립트 (실행하지 않음)

2026-10-16 Alembic 도입 전, DB 에 컬럼·테이블을 추가하던 1회성 스크립트들이다. 이력 보존을 위해 남겨 두었다.

- 이 스크립트들의 결과는 모두 Alembic 기준점 리비전 `alembic/versions/0001_baseline.py`에 반영되어 있다.
- 기존 DB 와 기준점의 작은 차이(스크립트가 붙인 DB 기본값 등)는 `0002_align_legacy_db.py`가 정리한다.
- **새 DB 를 만들거나 구조를 바꿀 때는 이 스크립트를 쓰지 않는다.** `venv\Scripts\python.exe -m alembic upgrade head` 를 쓴다.
- 이 폴더에는 `__init__.py`가 없어 import 대상이 아니다(실수로 서버가 불러오지 않게).
