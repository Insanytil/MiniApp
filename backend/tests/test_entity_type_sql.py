"""Compile the actual model defaults and scoped repository queries for PostgreSQL."""
import ast
import json
import unittest
import uuid
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

try:
    from sqlalchemy import Column, String, Table, Uuid, func, or_, select, type_coerce, CheckConstraint, ForeignKey, Index, Text, UniqueConstraint, Integer, text, DateTime
    from sqlalchemy.dialects.postgresql import JSONB
    from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateTable
    SQL_AVAILABLE = True
except ImportError:
    SQL_AVAILABLE = False

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(SQL_AVAILABLE, 'SQLAlchemy is required for PostgreSQL compilation checks')
class EntityTypeSQLTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        class IsolatedBase(DeclarativeBase):
            pass
        namespace = {**globals(), 'Base': IsolatedBase}
        # Execute the real class bodies in an isolated registry, without importing
        # the application's complete model package or changing its metadata.
        for model_source in ('app/db/base_entity.py', 'app/models/entity_type.py'):
            source_path = ROOT / model_source
            nodes = [node for node in ast.parse(source_path.read_text()).body if isinstance(node, ast.ClassDef)]
            exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source_path), 'exec'), namespace)
        cls.model = namespace['EntityType']
        metadata = cls.model.metadata
        if 'organizations' not in metadata.tables:
            Table('organizations', metadata, Column('id', Uuid, primary_key=True))
        if 'users' not in metadata.tables:
            Table('users', metadata, Column('id', Uuid, primary_key=True))
        source = ROOT / 'app/modules/entity_types/repository.py'
        node = next(node for node in ast.parse(source.read_text()).body if isinstance(node, ast.ClassDef))
        repo_namespace = {'EntityType': cls.model, 'Organization': SimpleNamespace(id=metadata.tables['organizations'].c.id),
                          'select': select, 'func': func, 'or_': or_, 'type_coerce': type_coerce, 'String': String}
        exec(compile('from __future__ import annotations\n' + ast.unparse(node), str(source), 'exec'), repo_namespace)
        cls.repository_class = repo_namespace['EntityTypeRepository']

    def setUp(self):
        self.org = uuid.uuid4()
        self.user_type = uuid.uuid4()
        self.db = SimpleNamespace(scalar=AsyncMock(return_value=0), scalars=AsyncMock(return_value=SimpleNamespace(all=lambda: [])),
                                  execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [])))
        self.repo = self.repository_class(self.db)

    def compiled(self, statement):
        return statement.compile(dialect=postgresql.dialect())

    def test_json_default_is_valid_and_has_no_accidental_bind_parameters(self):
        default = self.model.__table__.c.configuration.server_default.arg
        compiled = self.compiled(default)
        self.assertEqual(compiled.params, {})
        literal = str(default.compile(dialect=postgresql.dialect(), compile_kwargs={'literal_binds': True}))
        self.assertTrue(literal.endswith("'::jsonb"))
        document = json.loads(literal[1:-8])
        self.assertEqual(document['schema_version'], 1)
        self.assertEqual(document['fields'], [])
        ddl = str(CreateTable(self.model.__table__).compile(dialect=postgresql.dialect()))
        self.assertNotIn('"schema_version"NULL', ddl)
        self.assertIn('configuration JSONB DEFAULT', ddl)

    async def test_record_lookup_and_lock_always_include_organization(self):
        await self.repo.get_by_id(organization_id=self.org, entity_type_id=self.user_type)
        compiled = self.compiled(self.db.scalar.await_args.args[0])
        self.assertIn(self.org, compiled.params.values())
        self.assertIn(self.user_type, compiled.params.values())
        self.assertIn('entity_types.organization_id =', str(compiled))
        self.assertIn('FOR UPDATE', str(compiled))

    async def test_identifier_lookup_is_organization_scoped(self):
        await self.repo.get_by_technical_name(organization_id=self.org, technical_name='person')
        compiled = self.compiled(self.db.scalar.await_args.args[0])
        self.assertIn(self.org, compiled.params.values())
        self.assertIn('person', compiled.params.values())
        self.assertIn('entity_types.organization_id =', str(compiled))

    async def test_search_and_count_bind_scope_and_escape_wildcards(self):
        await self.repo.list_types(organization_id=self.org, search='100%', offset=20, limit=20)
        for call in (self.db.scalar.await_args, self.db.scalars.await_args):
            compiled = self.compiled(call.args[0])
            self.assertIn(self.org, compiled.params.values())
            self.assertIn('entity_types.organization_id =', str(compiled))
            self.assertIn('100/%', compiled.params.values())
        self.assertIn('LIMIT', str(self.compiled(self.db.scalars.await_args.args[0])))

    async def test_catalog_and_statistics_are_organization_scoped(self):
        await self.repo.catalog(self.org)
        await self.repo.definition_counts(self.org)
        for call in (self.db.scalars.await_args, self.db.execute.await_args):
            compiled = self.compiled(call.args[0])
            self.assertIn(self.org, compiled.params.values())
            self.assertIn('entity_types.organization_id =', str(compiled))

    async def test_metadata_lock_is_on_the_authorized_organization(self):
        await self.repo.lock_configuration(self.org)
        compiled = self.compiled(self.db.scalar.await_args.args[0])
        self.assertIn(self.org, compiled.params.values())
        self.assertIn('FOR UPDATE', str(compiled))


if __name__ == '__main__':
    unittest.main()
