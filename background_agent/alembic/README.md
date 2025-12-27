Alembic migration scripts live here. To run migrations:

1. Install alembic: `pip install alembic`
2. Set `sqlalchemy.url` in `alembic.ini` or pass `--sqlalchemy-url`.
3. `alembic revision -m "create tasks" --autogenerate`
4. `alembic upgrade head`
