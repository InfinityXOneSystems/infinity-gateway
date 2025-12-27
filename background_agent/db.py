from sqlalchemy import (Column, String, Integer, Float, Text, create_engine)
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.exc import OperationalError
import os

DATABASE_URL = os.environ.get('BACKGROUND_AGENT_DATABASE_URL', 'postgresql+psycopg2://bgagent:password@postgres:5432/bgagent')

engine = create_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


class Task(Base):
    __tablename__ = 'tasks'
    id = Column(String, primary_key=True, index=True)
    agent = Column(String, index=True)
    command = Column(Text)
    meta = Column(Text)
    status = Column(String, index=True)
    attempts = Column(Integer, default=0)
    last_error = Column(Text)
    created_at = Column(Float)
    updated_at = Column(Float)


class Agent(Base):
    __tablename__ = 'agents'
    name = Column(String, primary_key=True, index=True)
    endpoint = Column(String)
    meta = Column(Text)
    registered_at = Column(Float)


class Processed(Base):
    __tablename__ = 'processed'
    id = Column(String, primary_key=True, index=True)
    agent = Column(String)
    command = Column(Text)
    status = Column(String)
    details = Column(Text)
    ts = Column(Float)


def init_db():
    try:
        Base.metadata.create_all(bind=engine)
    except OperationalError:
        # DB not ready yet
        raise
