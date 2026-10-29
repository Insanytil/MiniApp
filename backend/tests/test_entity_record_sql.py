"""PostgreSQL compilation checks for the menu and record read engine; no DB writes."""
import ast
import json
import runpy
import unittest
import warnings
import uuid
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

try:
    from sqlalchemy import Column, String, Table, Uuid, func, or_, select, type_coerce, CheckConstraint, ForeignKey, ForeignKeyConstraint, Index, Text, UniqueConstraint, Integer, text, DateTime, Boolean, true, and_, cast, exists, literal, union_all, update, delete
    from sqlalchemy.dialects.postgresql import JSONB
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, aliased
    from sqlalchemy.schema import CreateTable
    from sqlalchemy.exc import SAWarning
    from sqlalchemy.types import TypeDecorator
    AVAILABLE = True
except ImportError:
    AVAILABLE = False

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(AVAILABLE, 'SQLAlchemy is required')
class RecordSQLTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        class Base(DeclarativeBase): pass
        namespace = {**globals(), 'Base': Base}
        for filename in ('app/db/base_entity.py', 'app/models/organization.py', 'app/models/entity_type.py', 'app/models/entity_record.py'):
            path = ROOT / filename
            nodes = [node for node in ast.parse(path.read_text()).body if isinstance(node, ast.ClassDef)]
            if filename.endswith('organization.py'):
                nodes[0].body = [node for node in nodes[0].body if not (isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == 'memberships')]
            exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), 'exec'), namespace)
        class GUID(TypeDecorator):
            impl = Uuid
            cache_ok = True
        Table('users', Base.metadata, Column('id', GUID, primary_key=True),
              Column('default_organization_id', Uuid, ForeignKey('organizations.id')))
        for filename in ('app/modules/entity_records/repository.py', 'app/modules/organization_navigation/service.py', 'app/modules/entity_types/repository.py'):
            path = ROOT / filename
            node = next(node for node in ast.parse(path.read_text()).body if isinstance(node, ast.ClassDef))
            exec(compile('from __future__ import annotations\n' + ast.unparse(node), str(path), 'exec'), namespace)
        namespace.update(runpy.run_path(str(ROOT / 'app/modules/organization_navigation/rules.py')))
        cls.namespace = namespace

    def setUp(self):
        self.org, self.type_id, self.record_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        self.db = SimpleNamespace(scalar=AsyncMock(return_value=0), scalars=AsyncMock(return_value=SimpleNamespace(all=lambda: [])),
            execute=AsyncMock(return_value=SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: []))), commit=AsyncMock())
        self.repo = self.namespace['EntityRecordRepository'](self.db)

    def compile(self, statement):
        return statement.compile(dialect=postgresql.dialect())

    async def test_record_search_count_and_pagination_are_scoped(self):
        await self.repo.list_records(self.org, self.type_id, SimpleNamespace(search='100%', offset=20, page_size=20))
        for call in (self.db.scalar.await_args, self.db.scalars.await_args):
            compiled = self.compile(call.args[0])
            self.assertIn(self.org, compiled.params.values())
            self.assertIn(self.type_id, compiled.params.values())
            self.assertIn('jsonb_each_text', str(compiled))
            self.assertIn('100/%', compiled.params.values())
            self.assertIn('entity_records.organization_id =', str(compiled))
        self.assertIn('LIMIT', str(self.compile(self.db.scalars.await_args.args[0])))

    async def test_detail_binds_record_type_and_organization(self):
        await self.repo.get_record(self.org, self.type_id, self.record_id)
        params = self.compile(self.db.scalar.await_args.args[0]).params.values()
        for identity in (self.org, self.type_id, self.record_id): self.assertIn(identity, params)

    async def test_relation_fetch_counts_full_collection_but_returns_at_most_three_per_group(self):
        relation = uuid.uuid4()
        paths = [{'id': str(relation), 'direction': direction, 'type_ids': [str(self.type_id)]} for direction in ('outgoing', 'incoming')]
        await self.repo.related_groups(self.org, [self.record_id], paths)
        compiled = self.compile(self.db.execute.await_args.args[0])
        sql = str(compiled).lower()
        self.assertIn('row_number() over', sql)
        self.assertIn('count(*) over', sql)
        self.assertIn('union all', sql)
        self.assertIn('entity_record_links.organization_id =', sql)
        self.assertIn(self.org, compiled.params.values())
        self.assertIn(3, compiled.params.values())
        self.assertIn('order by', sql)
        self.db.scalars.assert_not_awaited()

    async def test_empty_pages_do_not_query_relations(self):
        self.assertEqual(await self.repo.related_groups(self.org, [], []), ({}, {}))
        self.db.execute.assert_not_awaited()

    def test_composite_foreign_keys_block_cross_organization_records_and_links(self):
        record_sql = str(CreateTable(self.namespace['EntityRecord'].__table__).compile(dialect=postgresql.dialect()))
        link_sql = str(CreateTable(self.namespace['EntityRecordLink'].__table__).compile(dialect=postgresql.dialect()))
        self.assertIn('FOREIGN KEY(organization_id, entity_type_id)', record_sql)
        self.assertIn('FOREIGN KEY(organization_id, source_record_id)', link_sql)
        self.assertIn('FOREIGN KEY(organization_id, target_record_id)', link_sql)
        self.assertIn('jsonb_typeof("values")', record_sql)

    def test_menu_default_is_valid_json_without_bind_parameters(self):
        default = self.namespace['Organization'].__table__.c.navigation.server_default.arg
        self.assertEqual(self.compile(default).params, {})
        literal = str(default.compile(dialect=postgresql.dialect(), compile_kwargs={'literal_binds': True}))
        self.assertEqual(json.loads(literal[1:-8]), {'schema_version': 1, 'nodes': []})

    async def test_menu_write_locks_and_refreshes_the_authorized_organization(self):
        service = self.namespace['OrganizationNavigationService'](self.db)
        organization = SimpleNamespace(navigation={'schema_version': 1, 'nodes': []}, navigation_version=1)
        self.db.scalar.return_value = organization
        self.db.scalars.return_value = SimpleNamespace(all=lambda: [])
        self.db.execute.return_value = SimpleNamespace(all=lambda: [])
        await service.save_menu(self.org, uuid.uuid4(), SimpleNamespace(expected_version=1, document=SimpleNamespace(model_dump=lambda **kw: {'schema_version': 1, 'nodes': []})))
        statement = self.db.scalar.await_args_list[0].args[0]
        self.assertIn('FOR UPDATE', str(self.compile(statement)))
        self.assertIn(self.org, self.compile(statement).params.values())
        self.assertTrue(statement.get_execution_options()['populate_existing'])
        self.db.commit.assert_awaited_once()

    async def test_type_deletion_guards_query_records_and_menu_in_the_same_organization(self):
        repo = self.namespace['EntityTypeRepository'](self.db)
        await repo.has_records(self.org, self.type_id)
        compiled = self.compile(self.db.scalar.await_args.args[0])
        self.assertIn(self.org, compiled.params.values())
        self.assertIn(self.type_id, compiled.params.values())
        self.db.scalar.return_value = {'schema_version': 1, 'nodes': []}
        self.assertFalse(await repo.used_in_menu(self.org, self.type_id))
        self.assertIn(self.org, self.compile(self.db.scalar.await_args.args[0]).params.values())

    def test_organization_user_cycle_has_an_explicit_alter_constraint(self):
        with warnings.catch_warnings():
            warnings.simplefilter('error', SAWarning)
            tables = self.namespace['Organization'].metadata.sorted_tables
        self.assertTrue(tables)
        foreign_key = next(iter(self.namespace['Organization'].__table__.c.navigation_updated_by.foreign_keys))
        self.assertTrue(foreign_key.use_alter)
        self.assertEqual(foreign_key.name, 'fk_organizations_navigation_updated_by_users')

    def test_audit_columns_use_native_uuid_instead_of_inheriting_the_users_guid_decorator(self):
        for model, columns in [
            (self.namespace['Organization'], ['navigation_updated_by']),
            (self.namespace['EntityType'], ['created_by', 'updated_by']),
            (self.namespace['EntityRecord'], ['created_by', 'updated_by']),
        ]:
            for name in columns:
                self.assertIsInstance(model.__table__.c[name].type, Uuid)

    async def test_record_write_lock_and_related_lookup_bind_the_organization(self):
        await self.repo.lock_writes(self.org)
        compiled = self.compile(self.db.scalar.await_args.args[0])
        self.assertIn('FOR UPDATE', str(compiled))
        self.assertIn(self.org, compiled.params.values())
        await self.repo.get_records(self.org, {self.record_id})
        compiled = self.compile(self.db.scalars.await_args.args[0])
        self.assertIn(self.org, compiled.params.values())
        self.assertIn('entity_records.id IN', str(compiled))

    async def test_capacity_counts_are_scoped_and_grouped_on_both_ends(self):
        self.db.execute.return_value = SimpleNamespace(all=lambda: [])
        await self.repo.link_counts(self.org, [(str(uuid.uuid4()), str(self.record_id), str(uuid.uuid4()))])
        self.assertEqual(self.db.execute.await_count, 2)
        for call in self.db.execute.await_args_list:
            compiled = self.compile(call.args[0])
            self.assertIn(self.org, compiled.params.values())
            self.assertIn('GROUP BY', str(compiled))
            self.assertIn('entity_record_links.relation_id IN', str(compiled))

    async def test_relation_options_exclude_occupied_opposite_slots_and_tokenize_names(self):
        relation_id = str(uuid.uuid4())
        for direction, column in [('outgoing', 'target_record_id'), ('incoming', 'source_record_id')]:
            await self.repo.relation_options(self.org,
                {'id': relation_id, 'direction': direction, 'type_ids': [str(self.type_id)]},
                {'source_max': 1, 'target_max': 1}, SimpleNamespace(search='Lucien Vervaeren', offset=0, page_size=20))
            compiled = self.compile(self.db.scalars.await_args.args[0])
            self.assertIn(self.org, compiled.params.values())
            self.assertIn('NOT (EXISTS', str(compiled))
            self.assertIn(f'entity_record_links.{column}', str(compiled))
            self.assertIn('lucien', compiled.params.values())
            self.assertIn('vervaeren', compiled.params.values())

    async def test_insert_sets_audit_and_touches_existing_link_endpoints(self):
        self.db.add, self.db.add_all, self.db.flush = Mock(), Mock(), AsyncMock()
        actor, new_id, relation_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        record = await self.repo.insert_record(self.org, self.type_id, actor, new_id, {'field': 'value'},
            [(str(relation_id), str(self.record_id), str(new_id))])
        self.assertEqual(record.created_by, actor)
        self.assertEqual(record.updated_by, actor)
        self.assertEqual(record.organization_id, self.org)
        edge = self.db.add_all.call_args.args[0][0]
        self.assertEqual(edge.source_record_id, self.record_id)
        self.assertEqual(edge.target_record_id, new_id)
        self.assertEqual(self.db.flush.await_count, 2)
        self.db.commit.assert_not_awaited()
        compiled = self.compile(self.db.execute.await_args.args[0])
        self.assertIn(self.org, compiled.params.values())
        self.assertIn(actor, compiled.params.values())
        self.assertIn('updated_at=clock_timestamp()', str(compiled))

    async def test_edit_relation_options_exclude_current_record_from_occupied_slots(self):
        for direction, endpoint in [('outgoing', 'source_record_id'), ('incoming', 'target_record_id')]:
            await self.repo.relation_options(self.org,
                {'id': str(uuid.uuid4()), 'direction': direction, 'type_ids': [str(self.type_id)]},
                {'source_max': 1, 'target_max': 1}, SimpleNamespace(search=None, offset=0, page_size=20, record_id=self.record_id))
            compiled = self.compile(self.db.scalars.await_args.args[0])
            self.assertIn(f'entity_record_links.{endpoint} !=', str(compiled))
            self.assertIn(self.record_id, compiled.params.values())
            self.assertIn(self.org, compiled.params.values())

    async def test_record_edges_are_scoped_in_both_directions(self):
        self.db.execute.return_value = SimpleNamespace(all=lambda: [])
        await self.repo.record_edges(self.org, self.record_id)
        compiled = self.compile(self.db.execute.await_args.args[0])
        self.assertIn(self.org, compiled.params.values())
        self.assertIn(self.record_id, compiled.params.values())
        self.assertIn(' OR ', str(compiled))

    async def test_replace_diffs_edges_and_touches_both_related_endpoints(self):
        self.db.add_all, self.db.flush = Mock(), AsyncMock()
        actor, relation, target = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        record = SimpleNamespace(id=self.record_id, values={'old': 'value'}, created_by='original')
        old = [(str(relation), str(self.record_id), str(target))]
        await self.repo.replace_record(self.org, record, actor, {'new': 'value'}, old, [])
        self.assertEqual(record.created_by, 'original')
        self.assertEqual(record.values, {'new': 'value'})
        self.assertEqual(record.updated_by, actor)
        statements = [self.compile(call.args[0]) for call in self.db.execute.await_args_list]
        self.assertIn('DELETE FROM entity_record_links', str(statements[0]))
        for statement in statements: self.assertIn(self.org, statement.params.values())
        self.assertIn([target], statements[1].params.values())
        self.db.flush.assert_awaited_once()
        self.db.commit.assert_not_awaited()



if __name__ == '__main__': unittest.main()
