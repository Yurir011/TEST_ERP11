"""연락처: 전 직원 공유 주소록, 거래처 담당자 휴대폰 자동 등록, 거래처 팝업."""
from app.models.contact import Contact
from app.models.user import UserRole


def _new(client, h, **over):
    body = {"name": "김담당", "phone": "010-1111-2222", "phone2": "02-333-4444"}
    body.update(over)
    res = client.post("/api/contacts", headers=h, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_contacts_are_shared_between_employees_and_searchable(client, make_user, auth_headers):
    a, b = make_user(name="직원A"), make_user(name="직원B")
    made = _new(client, auth_headers(a), company_name="외부상사", title="과장")
    rows = client.get("/api/contacts", headers=auth_headers(b)).json()  # 다른 직원도 같은 내용을 본다
    assert [r["id"] for r in rows] == [made["id"]] and rows[0]["company"] == "외부상사"
    assert client.get("/api/contacts?q=01011112222", headers=auth_headers(b)).json()  # 하이픈 없이도 번호로 찾는다
    assert client.get("/api/contacts?q=외부", headers=auth_headers(b)).json()
    assert client.get("/api/contacts?q=없는사람", headers=auth_headers(b)).json() == []
    # 다른 직원이 고치고 지울 수도 있다
    assert client.put(f"/api/contacts/{made['id']}", headers=auth_headers(b), json={"name": "김담당", "phone": "010-9"}).json()["phone"] == "010-9"
    assert client.delete(f"/api/contacts/{made['id']}", headers=auth_headers(b)).status_code == 204


def test_name_required_and_unknown_client_rejected(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    assert client.post("/api/contacts", headers=h, json={"name": "  "}).status_code == 422
    assert client.post("/api/contacts", headers=h, json={"name": "홍", "client_id": 99999}).status_code == 400


def test_client_contact_mobile_is_registered_automatically(client, make_user, auth_headers):
    admin = make_user(role=UserRole.admin, name="대표")
    h = auth_headers(admin)
    body = {
        "name": "(주)테스트거래처",
        "contacts": [
            {"name": "이휴대", "title": "대리", "mobile_phone": "010-5555-6666", "landline_phone": "031-777-8888"},
            {"name": "박유선", "landline_phone": "031-999-0000"},  # 휴대폰이 없으면 등록하지 않는다
        ],
    }
    cl = client.post("/api/clients", headers=h, json=body).json()
    rows = client.get("/api/contacts", headers=h).json()
    assert [(r["name"], r["company"], r["client_id"], r["phone"], r["phone2"]) for r in rows] == [("이휴대", "(주)테스트거래처", cl["id"], "010-5555-6666", "031-777-8888")]

    # 번호를 바꿔 다시 저장해도 새로 만들지 않고 같은 연락처를 고친다
    body["contacts"][0]["mobile_phone"] = "010-0000-1234"
    client.put(f"/api/clients/{cl['id']}", headers=h, json=body)
    rows = client.get("/api/contacts", headers=h).json()
    assert len(rows) == 1 and rows[0]["phone"] == "010-0000-1234"

    # 팝업용 요약은 거래처관리 권한이 없는 직원도 볼 수 있고, 금액·계좌는 들어 있지 않다
    staff = make_user(name="일반직원")
    summary = client.get(f"/api/contacts/clients/{cl['id']}", headers=auth_headers(staff))
    assert summary.status_code == 200 and summary.json()["name"] == "(주)테스트거래처"
    assert "receivable_amount" not in summary.json() and "bank_account" not in summary.json()
    assert [o["name"] for o in client.get("/api/contacts/client-options", headers=auth_headers(staff)).json()] == ["(주)테스트거래처"]


def test_deleting_client_keeps_contact_with_company_name(client, db, make_user, auth_headers):
    admin = make_user(role=UserRole.admin, title=None, name="대표") if False else make_user(role=UserRole.admin, name="대표")
    h = auth_headers(admin)
    cl = client.post("/api/clients", headers=h, json={"name": "사라질회사", "contacts": [{"name": "최남음", "mobile_phone": "010-1"}]}).json()
    client.delete(f"/api/clients/{cl['id']}", headers=h)
    db.expire_all()
    c = db.query(Contact).filter(Contact.name == "최남음").one()
    assert c.client_id is None and c.company_name == "사라질회사"
