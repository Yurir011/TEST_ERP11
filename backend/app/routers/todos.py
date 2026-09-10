from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.todo import TodoItem
from app.models.user import User
from app.schemas.todo import TodoCreate, TodoOut

router = APIRouter(prefix="/api/todos", tags=["todos"])
logger = get_logger("Todos")


@router.get("", response_model=list[TodoOut])
def list_todos(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(TodoItem)
        .filter(TodoItem.user_id == current_user.id)
        .order_by(TodoItem.is_done, TodoItem.created_at)
        .all()
    )


@router.post("", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
def create_todo(payload: TodoCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    logger.debug(f"[Todos] 추가: user_id={current_user.id}")
    todo = TodoItem(user_id=current_user.id, content=payload.content)
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.put("/{todo_id}/toggle", response_model=TodoOut)
def toggle_todo(todo_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    todo = db.query(TodoItem).filter(TodoItem.id == todo_id, TodoItem.user_id == current_user.id).first()
    if todo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="할 일을 찾을 수 없습니다.")
    todo.is_done = not todo.is_done
    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo(todo_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    todo = db.query(TodoItem).filter(TodoItem.id == todo_id, TodoItem.user_id == current_user.id).first()
    if todo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="할 일을 찾을 수 없습니다.")
    db.delete(todo)
    db.commit()
    return None
