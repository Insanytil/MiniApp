"""Validation of replacements, including required links on other source records."""
from app.modules.entity_records.creation import RecordRelationConflictError, check_capacity
from app.modules.entity_types.configuration_rules import relation_catalog


class RecordConflictError(Exception):
    pass


def validate_replacement(catalog, old_edges, new_edges, counts, record_id):
    adjusted = dict(counts)
    for relation, source, target in old_edges:
        for side, identity in (('source', source), ('target', target)):
            key = (relation, side, identity)
            adjusted[key] = adjusted.get(key, 0) - 1
    check_capacity(catalog, new_edges, adjusted, record_id)
    definitions = relation_catalog(catalog)
    remaining = dict(adjusted)
    for relation, source, target in new_edges:
        key = (relation, 'source', source)
        remaining[key] = remaining.get(key, 0) + 1
    for relation, source, _ in old_edges:
        if source != str(record_id) and definitions[relation][1]['required'] and remaining.get((relation, 'source', source), 0) < 1:
            raise RecordRelationConflictError([{'field': f'relation:{relation}:incoming',
                'message': 'Ce lien est obligatoire pour l’enregistrement associé. Réaffectez-le depuis sa fiche avant de le retirer.'}])
    return sorted(set(new_edges))
