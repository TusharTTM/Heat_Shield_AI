import logging
from collections.abc import Generator

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def build_engine(database_url: str):
    kwargs = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(database_url, **kwargs)


def build_session_factory(engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db(request: Request) -> Generator[Session, None, None]:
    session = request.app.state.SessionLocal()
    try:
        yield session
    except Exception:
        # Services roll back their own known failures; this covers anything that
        # escapes (e.g. a unique-constraint race), so a request-scoped error
        # never leaves an open transaction behind for the pool to inherit.
        try:
            session.rollback()
        except Exception:  # pragma: no cover - rollback of a dead connection
            logger.warning("Session rollback failed while handling a request error", exc_info=True)
        raise
    finally:
        session.close()
