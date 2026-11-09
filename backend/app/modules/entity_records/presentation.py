"""Deterministic, bounded presentation of stored records. No user code is executed."""
import re
from urllib.parse import urlsplit

from app.modules.entity_types.configuration_rules import system_fields


def record_values(record, actor_labels=None):
    values = dict(record.values)
    attributes = {field['technical_name']: field['id'] for field in system_fields(record.entity_type_id)}
    for name, identity in attributes.items():
        value = getattr(record, name)
        if actor_labels is not None and name in ('created_by', 'updated_by') and value is not None:
            value = actor_labels.get(str(value), 'Utilisateur indisponible')
        # System values always override JSON supplied values.
        values[identity] = value.isoformat() if hasattr(value, 'isoformat') else str(value) if value is not None else None
    return values


def scalar_text(value):
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'Oui' if value else 'Non'
    return str(value) if isinstance(value, (str, int, float)) else ''


def safe_image(value):
    if not isinstance(value, str) or re.search(r'[\x00-\x20\\]', value):
        return None
    if re.fullmatch(r'file:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', value):
        return value.lower()
    if value.startswith('/'):
        return value if not value.startswith('//') else None
    try:
        parsed = urlsplit(value)
        return value if parsed.scheme == 'https' and parsed.netloc and not parsed.username and not parsed.password else None
    except ValueError:
        return None


def selected_options(field, value):
    options = {option['id']: option for option in field['options']}
    selections = value if isinstance(value, list) else [value]
    return [options.get(item, {'id': item, 'name': item}) for item in selections if isinstance(item, str)]


def field_text(field, value):
    if field and field['kind'] == 'choice':
        return ', '.join(option['name'] for option in selected_options(field, value))
    return scalar_text(value)


def present_record(record, entity_type, profile_id=None, actor_labels=None):
    profiles = entity_type.configuration['display_profiles']
    profile = next((p for p in profiles if p['id'] == profile_id), None) if profile_id else None
    profile = profile or next((p for p in profiles if p['is_default']), None)
    values = record_values(record, actor_labels)
    fields = {field['id']: field for field in entity_type.configuration['fields']}
    def compose(ids):
        return profile['separator'].join(text for identity in ids
            if (text := field_text(fields.get(identity), values.get(identity))))
    title = compose(profile['title_fields']) if profile else ''
    return {
        'id': str(record.id), 'entity_type_id': str(record.entity_type_id),
        'title': title or f'{entity_type.name} · {str(record.id)[:8]}',
        'secondary': compose(profile['secondary_fields']) if profile else '',
        'image': safe_image(values.get(profile['image_field'])) if profile and profile['image_field'] else None,
    }


def default_view(entity_type):
    config = entity_type.configuration
    view = next((view for view in config['views'] if view['is_default']), None)
    if view:
        return view
    fields = config['fields'] or system_fields(entity_type.id)[:1]
    return {'id': None, 'name': 'Vue par défaut', 'columns': [
        {'id': field['id'], 'label': field['name'], 'kind': 'field', 'field_id': field['id'],
         'relation_id': None, 'profile_id': None, 'direction': 'outgoing', 'collection_display': 'list'} for field in fields
    ]}


def project_rows(records, entity_type, view, catalog, paths, link_groups, related, actor_labels=None):
    fields = {field['id']: field for field in system_fields(entity_type.id) + entity_type.configuration['fields']}
    output = []
    for record in records:
        values = record_values(record, actor_labels)
        cells = {}
        for column in view['columns']:
            kind = column['kind']
            if kind == 'field':
                field = fields.get(column['field_id'])
                value = values.get(column['field_id'])
                cells[column['id']] = {'kind': 'image', 'image': safe_image(value)} if field and field['kind'] == 'image' else {
                    'kind': 'text', 'text': field_text(field, value) or '—', 'field_kind': field['kind'] if field else 'text'}
                if field and field['kind'] == 'choice':
                    cells[column['id']]['choice_options'] = selected_options(field, value)
            elif kind == 'display':
                cells[column['id']] = {'kind': 'records', 'items': [present_record(record, entity_type, column['profile_id'], actor_labels)], 'total': 1}
            else:
                key = (str(record.id), column['relation_id'], column['direction'])
                group = link_groups.get(key, {'ids': [], 'total': 0})
                if kind == 'count':
                    cells[column['id']] = {'kind': 'count', 'total': group['total']}
                    continue
                path = paths.get((column['relation_id'], column['direction']))
                cap = 1 if column['collection_display'] == 'first' else 3
                linked = [related[identity] for identity in group['ids'] if identity in related][:cap]
                items = [present_record(item, catalog[str(item.entity_type_id)], column['profile_id'], actor_labels)
                         for item in linked if path and str(item.entity_type_id) in path['type_ids'] and str(item.entity_type_id) in catalog]
                cells[column['id']] = {'kind': 'records', 'items': items, 'total': group['total']}
        output.append({'id': str(record.id), 'cells': cells})
    return output
