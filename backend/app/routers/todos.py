from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.schedule import ScheduleEvent
from app.models.todo import TodoItem
from app.models.user import User
from app.schemas.todo import TodoCreate, TodoOut

router = APIRouter(prefix="/api/todos", tags=["todos"])
logger = get_logger("Todos")


@router.get("", response_model=list[TodoOut])
def list_todos(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    return (
        db.query(TodoItem)
        .filter(TodoItem.user_id == current_user.id)
        # 완료된 항목은 완료 당일에만 노출하고, 날짜가 지나면 목록에서 자동으로 사라지게 한다.
        .filter(or_(TodoItem.is_done.is_(False), TodoItem.completed_on == today))
        .order_by(TodoItem.is_done, TodoItem.created_at)
        .all()
    )


@router.post("", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
def create_todo(payload: TodoCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    logger.debug(f"[Todos] 추가: user_id={current_user.id}")
    today = date.today()

    # 오늘의 할일에 추가하면 일정관리 캘린더에도 같은 날짜로 함께 기록한다.
    event = ScheduleEvent(
        title=payload.content,
        description="오늘의 할일에서 자동 등록된 일정입니다.",
        start_date=today,
        end_date=today,
        color="gray",
        created_by=current_user.id,
    )
    db.add(event)
    db.flush()  # id 확보 -> sort_order 기본값으로 사용
    event.sort_order = event.id

    todo = TodoItem(user_id=current_user.id, content=payload.content, schedule_event_id=event.id)
    db.add(todo)
    db.commit()
    db.refresh(todo)
    logger.debug(f"[Todos] 일정 자동 등록: todo_id={todo.id}, event_id={event.id}")
    return todo


@router.put("/{todo_id}/toggle", response_model=TodoOut)
def toggle_todo(todo_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    todo = db.query(TodoItem).filter(TodoItem.id == todo_id, TodoItem.user_id == current_user.id).first()
    if todo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="할 일을 찾을 수 없습니다.")
    todo.is_done = not todo.is_done
    todo.completed_on = date.today() if todo.is_done else None
    logger.debug(f"[Todos] 토글: todo_id={todo.id}, is_done={todo.is_done}, completed_on={todo.completed_on}")

    if todo.schedule_event_id:
        event = db.query(ScheduleEvent).filter(ScheduleEvent.id == todo.schedule_event_id).first()
        if event is not None:
            event.is_completed = todo.is_done

    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo(todo_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    todo = db.query(TodoItem).filter(TodoItem.id == todo_id, TodoItem.user_id == current_user.id).first()
    if todo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="할 일을 찾을 수 없습니다.")

    if todo.schedule_event_id:
        db.query(ScheduleEvent).filter(ScheduleEvent.id == todo.schedule_event_id).delete()
        logger.debug(f"[Todos] 연결된 일정 삭제: event_id={todo.schedule_event_id}")

    db.delete(todo)
    db.commit()
    return None
