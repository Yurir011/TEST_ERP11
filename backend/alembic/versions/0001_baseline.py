"""baseline: 2026-10-16 시점의 전체 DB 구조 (기존 1회성 스크립트 54개까지 반영된 상태).

기존 DB 에는 이 리비전을 실행하지 않고 `alembic stamp 0001_baseline` 으로 표시만 한다. 새 DB 는 `alembic upgrade head` 로 만든다.

Revision ID: 0001_baseline
Revises: 
Create Date: 2026-10-16 14:41:52.804358

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0001_baseline'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ENUM_NAMES = ['approvalstepstatus', 'approvaltargettype', 'banktype', 'cardtype', 'documentstatus', 'documenttype', 'jobgrade', 'jobtitle', 'leavestatus', 'paymentmethod', 'paymenttype', 'projectdoctype', 'projectdocumentstatus', 'projectstatus', 'prooftype', 'proposalattachmentkind', 'proposalstatus', 'proposalstepstatus', 'purchasestepkey', 'salesdoctype', 'transactiontype', 'userrole']



def upgrade() -> None:
    """Upgrade schema."""
    # 테이블은 외래키 의존 순서로 만든다 (자동 생성 순서를 정렬함).
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('employee_no', sa.String(length=20), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('hashed_password', sa.String(length=255), nullable=False),
    sa.Column('role', sa.Enum('admin', 'employee', 'site_admin', name='userrole'), nullable=False),
    sa.Column('grade', sa.Enum('staff', 'assistant_manager', 'manager', 'director', 'chief', name='jobgrade'), nullable=False),
    sa.Column('title', sa.Enum('ceo', 'team_lead', 'dept_head', name='jobtitle'), nullable=True),
    sa.Column('hire_date', sa.Date(), server_default=sa.text('CURRENT_DATE'), nullable=False),
    sa.Column('birth_date', sa.Date(), nullable=True),
    sa.Column('address', sa.String(length=300), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('menu_permissions', postgresql.ARRAY(sa.String(length=50)), server_default='{}', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_employee_no'), 'users', ['employee_no'], unique=True)
    op.create_table('clients',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('biz_reg_no', sa.String(length=20), nullable=True),
    sa.Column('ceo_name', sa.String(length=100), nullable=True),
    sa.Column('biz_type', sa.String(length=200), nullable=True),
    sa.Column('biz_class', sa.String(length=200), nullable=True),
    sa.Column('phone', sa.String(length=50), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=True),
    sa.Column('bank_name', sa.String(length=50), nullable=True),
    sa.Column('bank_account', sa.String(length=100), nullable=True),
    sa.Column('address', sa.String(length=300), nullable=True),
    sa.Column('receivable_amount', sa.BigInteger(), nullable=False),
    sa.Column('payable_amount', sa.BigInteger(), nullable=False),
    sa.Column('memo', sa.Text(), nullable=True),
    sa.Column('biz_reg_image_path', sa.String(length=500), nullable=True),
    sa.Column('biz_reg_image2_path', sa.String(length=500), nullable=True),
    sa.Column('bankbook_image_path', sa.String(length=500), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_clients_name'), 'clients', ['name'], unique=False)
    op.create_table('payments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('type', sa.Enum('deposit', 'withdrawal', name='paymenttype'), nullable=False),
    sa.Column('payment_date', sa.Date(), nullable=False),
    sa.Column('category', sa.String(length=100), nullable=False),
    sa.Column('description', sa.String(length=300), nullable=False),
    sa.Column('amount', sa.BigInteger(), nullable=False),
    sa.Column('method', sa.Enum('corporate_card', 'cash', 'bank_transfer', 'other', name='paymentmethod'), nullable=False),
    sa.Column('client_id', sa.Integer(), nullable=True),
    sa.Column('receipt_path', sa.String(length=500), nullable=True),
    sa.Column('proof_type', sa.Enum('tax_invoice', 'expense_receipt', 'simple_receipt', 'other', name='prooftype'), nullable=True),
    sa.Column('proof_type_detail', sa.String(length=200), nullable=True),
    sa.Column('card_type', sa.Enum('bc', 'kb_kookmin', name='cardtype'), nullable=True),
    sa.Column('card_pending', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('card_used_date', sa.Date(), nullable=True),
    sa.Column('bank_type', sa.Enum('ibk', 'kb_kookmin', 'woori', name='banktype'), nullable=True),
    sa.Column('memo', sa.Text(), nullable=True),
    sa.Column('partial_transaction_id', sa.Integer(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_payments_payment_date'), 'payments', ['payment_date'], unique=False)
    op.create_index(op.f('ix_payments_type'), 'payments', ['type'], unique=False)
    op.create_table('transactions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('type', sa.Enum('sales', 'purchase', name='transactiontype'), nullable=False),
    sa.Column('transaction_date', sa.Date(), nullable=False),
    sa.Column('client_id', sa.Integer(), nullable=True),
    sa.Column('counterparty', sa.String(length=200), nullable=True),
    sa.Column('item_name', sa.String(length=200), nullable=False),
    sa.Column('supply_amount', sa.BigInteger(), nullable=False),
    sa.Column('vat_amount', sa.BigInteger(), nullable=False),
    sa.Column('total_amount', sa.BigInteger(), nullable=False),
    sa.Column('tax_invoice_no', sa.String(length=50), nullable=True),
    sa.Column('memo', sa.Text(), nullable=True),
    sa.Column('settled', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('settled_date', sa.Date(), nullable=True),
    sa.Column('settled_payment_id', sa.Integer(), nullable=True),
    sa.Column('paid_amount', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['settled_payment_id'], ['payments.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_transactions_transaction_date'), 'transactions', ['transaction_date'], unique=False)
    op.create_index(op.f('ix_transactions_type'), 'transactions', ['type'], unique=False)
    op.create_table('approval_steps',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('target_type', sa.Enum('leave', 'document', 'project_document', name='approvaltargettype'), nullable=False),
    sa.Column('target_id', sa.Integer(), nullable=False),
    sa.Column('step_order', sa.Integer(), nullable=False),
    sa.Column('title', sa.Enum('ceo', 'team_lead', 'dept_head', name='jobtitle'), nullable=False),
    sa.Column('approver_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('pending', 'approved', 'rejected', name='approvalstepstatus'), nullable=False),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['approver_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_approval_steps_target_id'), 'approval_steps', ['target_id'], unique=False)
    op.create_index(op.f('ix_approval_steps_target_type'), 'approval_steps', ['target_type'], unique=False)
    op.create_table('attendance',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('work_date', sa.Date(), nullable=False),
    sa.Column('clock_in', sa.DateTime(timezone=True), nullable=True),
    sa.Column('clock_out', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'work_date', name='uq_attendance_user_date')
    )
    op.create_index(op.f('ix_attendance_user_id'), 'attendance', ['user_id'], unique=False)
    op.create_index(op.f('ix_attendance_work_date'), 'attendance', ['work_date'], unique=False)
    op.create_table('document_issues',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('doc_type', sa.Enum('employment', 'career', 'employment_en', name='documenttype'), nullable=False),
    sa.Column('purpose', sa.String(length=200), nullable=True),
    sa.Column('file_path', sa.String(length=500), nullable=True),
    sa.Column('status', sa.Enum('pending', 'approved', 'rejected', name='documentstatus'), nullable=False),
    sa.Column('approver_id', sa.Integer(), nullable=True),
    sa.Column('current_step', sa.Integer(), nullable=False),
    sa.Column('is_final_decision', sa.Boolean(), nullable=False),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('reject_reason', sa.String(length=500), nullable=True),
    sa.Column('issued_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['approver_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_document_issues_user_id'), 'document_issues', ['user_id'], unique=False)
    op.create_table('leave_requests',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('days', sa.Integer(), nullable=False),
    sa.Column('reason', sa.String(length=500), nullable=False),
    sa.Column('status', sa.Enum('pending', 'approved', 'rejected', name='leavestatus'), nullable=False),
    sa.Column('approver_id', sa.Integer(), nullable=True),
    sa.Column('current_step', sa.Integer(), nullable=False),
    sa.Column('is_final_decision', sa.Boolean(), nullable=False),
    sa.Column('reject_reason', sa.String(length=500), nullable=True),
    sa.Column('reviewed_by', sa.Integer(), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['approver_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_leave_requests_user_id'), 'leave_requests', ['user_id'], unique=False)
    op.create_table('notices',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('author_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('notifications',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('link', sa.String(length=300), nullable=True),
    sa.Column('is_read', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)
    op.create_table('proposals',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('doc_no', sa.String(length=30), nullable=False),
    sa.Column('kind', sa.String(length=50), nullable=True),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('topic', sa.String(length=200), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('department_code', sa.String(length=20), nullable=False),
    sa.Column('department_name', sa.String(length=100), nullable=False),
    sa.Column('issue_date', sa.Date(), nullable=False),
    sa.Column('status', sa.Enum('pending', 'approved', 'rejected', name='proposalstatus'), nullable=False),
    sa.Column('current_step', sa.Integer(), nullable=False),
    sa.Column('is_final_decision', sa.Boolean(), nullable=False),
    sa.Column('file_path', sa.String(length=500), nullable=True),
    sa.Column('delete_requested', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('delete_prev_steps', sa.JSON(), nullable=True),
    sa.Column('reject_reason', sa.Text(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_proposals_doc_no'), 'proposals', ['doc_no'], unique=True)
    op.create_table('recurring_payments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('type', sa.Enum('deposit', 'withdrawal', name='paymenttype'), nullable=False),
    sa.Column('category', sa.String(length=100), nullable=False),
    sa.Column('description', sa.String(length=300), nullable=False),
    sa.Column('amount', sa.BigInteger(), nullable=False),
    sa.Column('day_of_month', sa.Integer(), nullable=False),
    sa.Column('start_month', sa.Date(), nullable=False),
    sa.Column('bank_type', sa.Enum('ibk', 'kb_kookmin', 'woori', name='banktype'), nullable=False),
    sa.Column('memo', sa.Text(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('schedule_events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('color', sa.String(length=20), nullable=False),
    sa.Column('is_lunar', sa.Boolean(), nullable=False),
    sa.Column('is_completed', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('recurrence_group_id', sa.String(length=36), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_schedule_events_end_date'), 'schedule_events', ['end_date'], unique=False)
    op.create_index(op.f('ix_schedule_events_recurrence_group_id'), 'schedule_events', ['recurrence_group_id'], unique=False)
    op.create_index(op.f('ix_schedule_events_start_date'), 'schedule_events', ['start_date'], unique=False)
    op.create_table('client_contacts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('client_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('title', sa.String(length=100), nullable=True),
    sa.Column('landline_phone', sa.String(length=50), nullable=True),
    sa.Column('mobile_phone', sa.String(length=50), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=True),
    sa.Column('memo', sa.Text(), nullable=True),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_client_contacts_client_id'), 'client_contacts', ['client_id'], unique=False)
    op.create_table('projects',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('client_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('estimate', 'in_progress', 'completed', 'discarded', name='projectstatus'), nullable=False),
    sa.Column('memo', sa.Text(), nullable=True),
    sa.Column('discard_reason', sa.Text(), nullable=True),
    sa.Column('start_date', sa.Date(), nullable=True),
    sa.Column('end_date', sa.Date(), nullable=True),
    sa.Column('progress_percent', sa.Integer(), nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('proposal_approval_steps',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('proposal_id', sa.Integer(), nullable=False),
    sa.Column('step_order', sa.Integer(), nullable=False),
    sa.Column('title', sa.Enum('ceo', 'team_lead', 'dept_head', name='jobtitle'), nullable=False),
    sa.Column('approver_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('pending', 'approved', 'rejected', name='proposalstepstatus'), nullable=False),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['approver_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['proposal_id'], ['proposals.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_proposal_approval_steps_proposal_id'), 'proposal_approval_steps', ['proposal_id'], unique=False)
    op.create_table('proposal_attachments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('proposal_id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.Enum('file', 'link', name='proposalattachmentkind'), nullable=False),
    sa.Column('label', sa.String(length=200), nullable=False),
    sa.Column('file_path', sa.String(length=500), nullable=True),
    sa.Column('url', sa.String(length=1000), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['proposal_id'], ['proposals.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_proposal_attachments_proposal_id'), 'proposal_attachments', ['proposal_id'], unique=False)
    op.create_table('recurring_payment_runs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('recurring_id', sa.Integer(), nullable=False),
    sa.Column('year_month', sa.String(length=7), nullable=False),
    sa.Column('payment_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['recurring_id'], ['recurring_payments.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('recurring_id', 'year_month', name='uq_recurring_run_month')
    )
    op.create_index(op.f('ix_recurring_payment_runs_recurring_id'), 'recurring_payment_runs', ['recurring_id'], unique=False)
    op.create_table('todo_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('content', sa.String(length=300), nullable=False),
    sa.Column('is_done', sa.Boolean(), nullable=False),
    sa.Column('color', sa.String(length=9), nullable=True),
    sa.Column('completed_on', sa.Date(), nullable=True),
    sa.Column('schedule_event_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['schedule_event_id'], ['schedule_events.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_todo_items_user_id'), 'todo_items', ['user_id'], unique=False)
    op.create_table('document_sets',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_document_sets_project_id'), 'document_sets', ['project_id'], unique=False)
    op.create_table('project_documents',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=True),
    sa.Column('project_other_name', sa.String(length=200), nullable=True),
    sa.Column('counterparty_info', sa.JSON(), nullable=True),
    sa.Column('other_client_id', sa.Integer(), nullable=True),
    sa.Column('doc_type', sa.Enum('quotation', 'statement', 'tax_invoice', 'purchase_order', name='projectdoctype'), nullable=False),
    sa.Column('issue_date', sa.Date(), nullable=False),
    sa.Column('doc_no', sa.String(length=20), nullable=True),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('purpose_type', sa.String(length=10), nullable=False),
    sa.Column('client_name', sa.String(length=200), nullable=False),
    sa.Column('manager_name', sa.String(length=100), nullable=True),
    sa.Column('remark', sa.Text(), nullable=True),
    sa.Column('file_path', sa.String(length=500), nullable=True),
    sa.Column('excel_path', sa.String(length=500), nullable=True),
    sa.Column('status', sa.Enum('draft', 'pending', 'approved', 'rejected', name='projectdocumentstatus'), nullable=False),
    sa.Column('approver_id', sa.Integer(), nullable=True),
    sa.Column('current_step', sa.Integer(), nullable=False),
    sa.Column('is_final_decision', sa.Boolean(), nullable=False),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('reject_reason', sa.Text(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('set_id', sa.Integer(), nullable=True),
    sa.Column('popbill_mgt_key', sa.String(length=24), nullable=True),
    sa.Column('popbill_nts_confirm_num', sa.String(length=50), nullable=True),
    sa.Column('popbill_issued_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ledger_transaction_id', sa.Integer(), nullable=True),
    sa.Column('payment_recorded', sa.Boolean(), nullable=False),
    sa.Column('payment_received_hint', sa.Boolean(), nullable=True),
    sa.Column('direction', sa.String(length=10), nullable=True),
    sa.Column('approval_no', sa.String(length=50), nullable=True),
    sa.Column('is_paper', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('delete_requested', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('delete_prev_steps', sa.JSON(), nullable=True),
    sa.ForeignKeyConstraint(['approver_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['ledger_transaction_id'], ['transactions.id'], ),
    sa.ForeignKeyConstraint(['other_client_id'], ['clients.id'], ),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_documents_doc_type'), 'project_documents', ['doc_type'], unique=False)
    op.create_index(op.f('ix_project_documents_project_id'), 'project_documents', ['project_id'], unique=False)
    op.create_index(op.f('ix_project_documents_set_id'), 'project_documents', ['set_id'], unique=False)
    op.create_table('project_progress_stages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=50), nullable=False),
    sa.Column('order_index', sa.Integer(), nullable=False),
    sa.Column('progress_percent', sa.Integer(), nullable=False),
    sa.Column('completed_on', sa.Date(), nullable=True),
    sa.Column('start_date', sa.Date(), nullable=True),
    sa.Column('end_date', sa.Date(), nullable=True),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_progress_stages_project_id'), 'project_progress_stages', ['project_id'], unique=False)
    op.create_table('project_purchase_steps',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('step_key', sa.Enum('request', 'approval', 'purchase', 'payment', 'delivery', name='purchasestepkey'), nullable=False),
    sa.Column('order_index', sa.Integer(), nullable=False),
    sa.Column('is_done', sa.Boolean(), nullable=False),
    sa.Column('completed_on', sa.Date(), nullable=True),
    sa.Column('custom_label', sa.String(length=50), nullable=True),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_purchase_steps_project_id'), 'project_purchase_steps', ['project_id'], unique=False)
    op.create_table('project_document_images',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('document_id', sa.Integer(), nullable=False),
    sa.Column('filename', sa.String(length=255), nullable=False),
    sa.Column('file_path', sa.String(length=500), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['document_id'], ['project_documents.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_document_images_document_id'), 'project_document_images', ['document_id'], unique=False)
    op.create_table('project_document_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('document_id', sa.Integer(), nullable=False),
    sa.Column('content', sa.String(length=300), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('unit_price', sa.Numeric(precision=18, scale=2, asdecimal=False), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['document_id'], ['project_documents.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_document_items_document_id'), 'project_document_items', ['document_id'], unique=False)
    op.create_table('sales_documents',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('set_id', sa.Integer(), nullable=False),
    sa.Column('doc_type', sa.Enum('estimate', 'statement', name='salesdoctype'), nullable=False),
    sa.Column('doc_no', sa.String(length=50), nullable=False),
    sa.Column('issue_date', sa.Date(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('subtotal', sa.BigInteger(), nullable=False),
    sa.Column('vat', sa.BigInteger(), nullable=False),
    sa.Column('total', sa.BigInteger(), nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
    sa.ForeignKeyConstraint(['set_id'], ['document_sets.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sales_documents_doc_no'), 'sales_documents', ['doc_no'], unique=True)
    op.create_index(op.f('ix_sales_documents_project_id'), 'sales_documents', ['project_id'], unique=False)
    op.create_index(op.f('ix_sales_documents_set_id'), 'sales_documents', ['set_id'], unique=False)
    op.create_table('sales_document_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('document_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('spec', sa.String(length=200), nullable=True),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('unit_price', sa.BigInteger(), nullable=False),
    sa.Column('amount', sa.BigInteger(), nullable=False),
    sa.ForeignKeyConstraint(['document_id'], ['sales_documents.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sales_document_items_document_id'), 'sales_document_items', ['document_id'], unique=False)
    # payments ↔ transactions 순환 참조: 두 테이블을 모두 만든 뒤 외래키를 추가한다.
    op.create_foreign_key('payments_partial_transaction_id_fkey', 'payments', 'transactions', ['partial_transaction_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema (전체 삭제)."""
    op.drop_constraint('payments_partial_transaction_id_fkey', 'payments', type_='foreignkey')
    op.drop_table('sales_document_items')
    op.drop_table('sales_documents')
    op.drop_table('project_document_items')
    op.drop_table('project_document_images')
    op.drop_table('project_purchase_steps')
    op.drop_table('project_progress_stages')
    op.drop_table('project_documents')
    op.drop_table('document_sets')
    op.drop_table('todo_items')
    op.drop_table('recurring_payment_runs')
    op.drop_table('proposal_attachments')
    op.drop_table('proposal_approval_steps')
    op.drop_table('projects')
    op.drop_table('client_contacts')
    op.drop_table('schedule_events')
    op.drop_table('recurring_payments')
    op.drop_table('proposals')
    op.drop_table('notifications')
    op.drop_table('notices')
    op.drop_table('leave_requests')
    op.drop_table('document_issues')
    op.drop_table('attendance')
    op.drop_table('approval_steps')
    op.drop_table('transactions')
    op.drop_table('payments')
    op.drop_table('clients')
    op.drop_table('users')
    # PostgreSQL enum 타입은 drop_table 로 지워지지 않으므로 따로 지운다.
    for enum_name in ENUM_NAMES:
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
