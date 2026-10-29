import uuid

from sqlalchemy import String, and_, cast, exists, func, literal, or_, select, union_all, update, delete
from sqlalchemy.orm import aliased

from app.models.entity_record import EntityRecord, EntityRecordLink
from app.models.entity_type import EntityType
from app.models.organization import Organization


class EntityRecordRepository:
    def __init__(self, db):
        self.db = db

    async def catalog(self, organization_id):
        return list((await self.db.scalars(select(EntityType).where(EntityType.organization_id == organization_id))).all())

    async def list_records(self, organization_id, entity_type_id, params):
        statement = select(EntityRecord).where(EntityRecord.organization_id == organization_id, EntityRecord.entity_type_id == entity_type_id)
        if params.search and params.search.strip():
            term = params.search.strip().lower()
            values = func.jsonb_each_text(EntityRecord.values).table_valued('key', 'value').alias('record_values')
            statement = statement.where(or_(
                func.lower(cast(EntityRecord.id, String)).contains(term, autoescape=True),
                exists(select(1).select_from(values).where(func.lower(values.c.value).contains(term, autoescape=True))),
            ))
        total = await self.db.scalar(select(func.count()).select_from(statement.subquery()))
        records = list((await self.db.scalars(statement.order_by(EntityRecord.created_at.desc(), EntityRecord.id)
                                            .offset(params.offset).limit(params.page_size))).all())
        return records, total or 0

    async def get_record(self, organization_id, entity_type_id, record_id):
        return await self.db.scalar(select(EntityRecord).where(
            EntityRecord.organization_id == organization_id, EntityRecord.entity_type_id == entity_type_id, EntityRecord.id == record_id,
        ))

    async def related_groups(self, organization_id, record_ids, paths):
        if not record_ids or not paths:
            return {}, {}
        statements = []
        for direction in ('outgoing', 'incoming'):
            selected = [path for path in paths if path['direction'] == direction]
            if not selected:
                continue
            linked = aliased(EntityRecord)
            parent_column = EntityRecordLink.source_record_id if direction == 'outgoing' else EntityRecordLink.target_record_id
            linked_column = EntityRecordLink.target_record_id if direction == 'outgoing' else EntityRecordLink.source_record_id
            statements.append(select(parent_column.label('parent_id'), EntityRecordLink.relation_id,
                linked_column.label('linked_id'), literal(direction).label('direction'))
                .join(linked, and_(linked.organization_id == EntityRecordLink.organization_id, linked.id == linked_column))
                .where(EntityRecordLink.organization_id == organization_id, linked.organization_id == organization_id,
                    parent_column.in_(record_ids), or_(*[
                        and_(EntityRecordLink.relation_id == uuid.UUID(path['id']), linked.entity_type_id.in_([uuid.UUID(t) for t in path['type_ids']]))
                        for path in selected
                    ])))
        edges = (union_all(*statements) if len(statements) > 1 else statements[0]).subquery()
        partition = [edges.c.parent_id, edges.c.relation_id, edges.c.direction]
        ranked = select(*edges.c,
            func.row_number().over(partition_by=partition, order_by=edges.c.linked_id).label('position'),
            func.count().over(partition_by=partition).label('total')).subquery()
        rows = (await self.db.execute(select(ranked).where(ranked.c.position <= 3).order_by(ranked.c.parent_id, ranked.c.relation_id, ranked.c.direction, ranked.c.position))).mappings().all()
        groups = {}
        linked_ids = set()
        for row in rows:
            key = (str(row['parent_id']), str(row['relation_id']), row['direction'])
            groups.setdefault(key, {'ids': [], 'total': row['total']})['ids'].append(str(row['linked_id']))
            linked_ids.add(row['linked_id'])
        if not linked_ids:
            return groups, {}
        records = (await self.db.scalars(select(EntityRecord).where(EntityRecord.organization_id == organization_id,
                                                                 EntityRecord.id.in_(linked_ids)))).all()
        return groups, {str(record.id): record for record in records}

    async def lock_writes(self, organization_id):
        await self.db.scalar(select(Organization.id).where(Organization.id == organization_id).with_for_update())

    async def get_records(self, organization_id, record_ids):
        if not record_ids:
            return {}
        records = (await self.db.scalars(select(EntityRecord).where(
            EntityRecord.organization_id == organization_id, EntityRecord.id.in_(record_ids),
        ))).all()
        return {str(record.id): record for record in records}

    async def link_counts(self, organization_id, edges):
        if not edges:
            return {}
        relation_ids = {uuid.UUID(edge[0]) for edge in edges}
        record_ids = {uuid.UUID(identity) for edge in edges for identity in edge[1:]}
        result = {}
        for side, column in (('source', EntityRecordLink.source_record_id), ('target', EntityRecordLink.target_record_id)):
            rows = (await self.db.execute(select(EntityRecordLink.relation_id, column, func.count())
                .where(EntityRecordLink.organization_id == organization_id, EntityRecordLink.relation_id.in_(relation_ids), column.in_(record_ids))
                .group_by(EntityRecordLink.relation_id, column))).all()
            result.update({(str(relation), side, str(record)): count for relation, record, count in rows})
        return result

    async def insert_record(self, organization_id, entity_type_id, actor_id, record_id, values, edges):
        record = EntityRecord(id=record_id, organization_id=organization_id, entity_type_id=entity_type_id,
                              values=values, created_by=actor_id, updated_by=actor_id)
        self.db.add(record)
        await self.db.flush()
        self.db.add_all([EntityRecordLink(organization_id=organization_id, relation_id=uuid.UUID(relation),
            source_record_id=uuid.UUID(source), target_record_id=uuid.UUID(target)) for relation, source, target in edges])
        await self.db.flush()
        affected_records = {uuid.UUID(identity) for _, source, target in edges for identity in (source, target) if identity != str(record_id)}
        if affected_records:
            await self.db.execute(update(EntityRecord).where(EntityRecord.organization_id == organization_id,
                EntityRecord.id.in_(affected_records)).values(updated_by=actor_id, updated_at=func.clock_timestamp()))
        return record

    async def commit(self):
        await self.db.commit()

    async def rollback(self):
        await self.db.rollback()

    async def relation_options(self, organization_id, path, relation, params):
        statement = select(EntityRecord).where(EntityRecord.organization_id == organization_id,
            EntityRecord.entity_type_id.in_([uuid.UUID(identity) for identity in path['type_ids']]))
        occupied_column = EntityRecordLink.target_record_id if path['direction'] == 'outgoing' else EntityRecordLink.source_record_id
        maximum = relation['target_max'] if path['direction'] == 'outgoing' else relation['source_max']
        if maximum == 1:
            occupied = select(1).where(EntityRecordLink.organization_id == organization_id,
                EntityRecordLink.relation_id == uuid.UUID(path['id']), occupied_column == EntityRecord.id)
            if getattr(params, 'record_id', None):
                own_endpoint = EntityRecordLink.source_record_id if path['direction'] == 'outgoing' else EntityRecordLink.target_record_id
                occupied = occupied.where(own_endpoint != params.record_id)
            statement = statement.where(~exists(occupied))
        if params.search and params.search.strip():
            values = func.jsonb_each_text(EntityRecord.values).table_valued('key', 'value').alias('option_values')
            for term in params.search.strip().lower().split(maxsplit=7):
                statement = statement.where(or_(func.lower(cast(EntityRecord.id, String)).contains(term, autoescape=True),
                    exists(select(1).select_from(values).where(func.lower(values.c.value).contains(term, autoescape=True)))))
        total = await self.db.scalar(select(func.count()).select_from(statement.subquery()))
        records = (await self.db.scalars(statement.order_by(EntityRecord.created_at.desc(), EntityRecord.id)
                                        .offset(params.offset).limit(params.page_size))).all()
        return list(records), total or 0

    async def record_edges(self, organization_id, record_id):
        rows = (await self.db.execute(select(EntityRecordLink.relation_id,
            EntityRecordLink.source_record_id, EntityRecordLink.target_record_id).where(
            EntityRecordLink.organization_id == organization_id,
            or_(EntityRecordLink.source_record_id == record_id, EntityRecordLink.target_record_id == record_id)))).all()
        return [(str(relation), str(source), str(target)) for relation, source, target in rows]

    async def replace_record(self, organization_id, record, actor_id, values, old_edges, edges):
        old, new = set(old_edges), set(edges)
        for relation, source, target in old - new:
            await self.db.execute(delete(EntityRecordLink).where(EntityRecordLink.organization_id == organization_id,
                EntityRecordLink.relation_id == uuid.UUID(relation), EntityRecordLink.source_record_id == uuid.UUID(source),
                EntityRecordLink.target_record_id == uuid.UUID(target)))
        self.db.add_all([EntityRecordLink(organization_id=organization_id, relation_id=uuid.UUID(relation),
            source_record_id=uuid.UUID(source), target_record_id=uuid.UUID(target)) for relation, source, target in new - old])
        record.values = values
        record.updated_by = actor_id
        record.updated_at = func.clock_timestamp()
        affected_records = {uuid.UUID(identity) for _, source, target in old ^ new for identity in (source, target) if identity != str(record.id)}
        if affected_records:
            await self.db.execute(update(EntityRecord).where(EntityRecord.organization_id == organization_id,
                EntityRecord.id.in_(affected_records)).values(updated_by=actor_id, updated_at=func.clock_timestamp()))
        await self.db.flush()
