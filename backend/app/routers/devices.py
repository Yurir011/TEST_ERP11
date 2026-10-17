from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.audit import record_event
from app.core.deps import require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.client_device import ClientDevice, DeviceStatus
from app.models.user import User
from app.schemas.nfc import DeviceOut, DeviceRegister, DeviceRegisterOut, DeviceRename

router = APIRouter(prefix="/api/devices", tags=["devices"])
logger = get_logger("Device")

MAX_PENDING_DEVICES = 20  # 로그인 없이 호출되는 등록 요청이 표를 채우지 못하게 하는 상한


def _out(d: ClientDevice, db: Session) -> DeviceOut:
    approver = db.get(User, d.approved_by) if d.approved_by else None
    return DeviceOut(
        id=d.id,
        name=d.name,
        public_key_short=d.public_key[:8].upper(),
        status=d.status,
        approved_by=d.approved_by,
        approved_by_name=approver.name if approver else None,
        approved_at=d.approved_at,
        last_seen_at=d.last_seen_at,
        last_ip=d.last_ip,
        created_at=d.created_at,
    )


@router.post("/register", response_model=DeviceRegisterOut)
def register_device(payload: DeviceRegister, request: Request, db: Session = Depends(get_db)):
    """데스크톱 앱이 시작할 때마다 부른다 (로그인 전). 처음이면 승인 대기로 등록하고, 이미 있으면 현재 상태를 돌려준다.
    승인은 관리자만 할 수 있으므로 이 요청만으로는 아무 권한도 생기지 않는다."""
    ip = request.client.host if request.client else None
    key = payload.public_key.lower()
    now = datetime.now(timezone.utc)

    device = db.query(ClientDevice).filter(ClientDevice.public_key == key).first()
    if device is None:
        pending = db.query(ClientDevice).filter(ClientDevice.status == DeviceStatus.pending.value).count()
        if pending >= MAX_PENDING_DEVICES:
            logger.warning(f"[Device] 승인 대기 기기가 너무 많아 등록 요청 거절: ip={ip}")
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="승인 대기 중인 기기가 너무 많습니다. 관리자에게 문의하세요.")
        device = ClientDevice(name=payload.name, public_key=key, status=DeviceStatus.pending.value)
        db.add(device)
        db.flush()
        record_event(db, "device_registered", "device", device.id, f"기기 등록 요청: {device.name} ({key[:8].upper()}), 접속 주소 {ip}")
        logger.info(f"[Device] 등록 요청: device_id={device.id}, name={device.name}, ip={ip}")
    device.last_seen_at = now
    device.last_ip = ip
    db.commit()
    return DeviceRegisterOut(status=device.status)


@router.get("", response_model=list[DeviceOut])
def list_devices(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    devices = db.query(ClientDevice).order_by(ClientDevice.status.desc(), ClientDevice.id).all()
    return [_out(d, db) for d in devices]


def _get(db: Session, device_id: int) -> ClientDevice:
    d = db.get(ClientDevice, device_id)
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="기기를 찾을 수 없습니다.")
    return d


@router.put("/{device_id}/approve", response_model=DeviceOut)
def approve_device(device_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    d = _get(db, device_id)
    if d.status == DeviceStatus.revoked.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="사용 중지된 기기는 다시 승인할 수 없습니다. 앱을 다시 설치해 새로 등록하세요.")
    if d.status != DeviceStatus.approved.value:
        d.status = DeviceStatus.approved.value
        d.approved_by = current_user.id
        d.approved_at = datetime.now(timezone.utc)
        record_event(db, "device_approved", "device", d.id, f"기기 승인: {d.name} ({d.public_key[:8].upper()})")
        db.commit()
        logger.info(f"[Device] 승인: device_id={d.id}, by={current_user.id}")
    return _out(d, db)


@router.put("/{device_id}/revoke", response_model=DeviceOut)
def revoke_device(device_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    d = _get(db, device_id)
    if d.status != DeviceStatus.revoked.value:
        d.status = DeviceStatus.revoked.value
        record_event(db, "device_revoked", "device", d.id, f"기기 사용 중지: {d.name} ({d.public_key[:8].upper()})")
        db.commit()
        logger.info(f"[Device] 사용 중지: device_id={d.id}, by={current_user.id}")
    return _out(d, db)


@router.put("/{device_id}", response_model=DeviceOut)
def rename_device(device_id: int, payload: DeviceRename, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    d = _get(db, device_id)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="기기 이름이 비어 있습니다.")
    d.name = name
    db.commit()
    return _out(d, db)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(device_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """승인 대기 중인 요청을 거절(삭제)한다. 승인된 기기는 먼저 사용 중지해야 하고, 사용 중지된 기기는 기록으로 남긴다."""
    d = _get(db, device_id)
    if d.status != DeviceStatus.pending.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인 대기 중인 요청만 삭제할 수 있습니다. 사용 중인 기기는 사용 중지를 누르세요.")
    record_event(db, "device_deleted", "device", d.id, f"기기 등록 요청 거절: {d.name} ({d.public_key[:8].upper()})")
    db.delete(d)
    db.commit()
