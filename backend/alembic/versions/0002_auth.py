"""email and password sign-in, revocable sessions

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-07 09:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_credentials",
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False),
        sa.Column("locked_until", sa.DateTime(), nullable=True),
        sa.Column("password_changed_at", sa.DateTime(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_user_credentials_user_id_users")),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_user_credentials")),
    )
    with op.batch_alter_table("user_credentials", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_user_credentials_email"), ["email"], unique=True)
    op.create_table(
        "revoked_tokens",
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("jti", name=op.f("pk_revoked_tokens")),
    )
    with op.batch_alter_table("revoked_tokens", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_revoked_tokens_user_id"), ["user_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("revoked_tokens", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_revoked_tokens_user_id"))
    op.drop_table("revoked_tokens")
    with op.batch_alter_table("user_credentials", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_user_credentials_email"))
    op.drop_table("user_credentials")
