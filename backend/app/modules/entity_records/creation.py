"""Validation of dynamic record writes, independent of storage and UI."""
import math
import re
from datetime import date, datetime, timezone

from app.modules.entity_records.presentation import safe_image
from app.modules.entity_types.configuration_rules import relation_catalog, navigations

MAX_NUMBER = 9007199254740991
EMAIL = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


class RecordValidationError(ValueError):
    def __init__(self, issues):
        self.issues = issues
        super().__init__('Vérifiez les informations saisies.')


class RecordSchemaConflictError(Exception):
    pass


class RecordRelationConflictError(RecordValidationError):
    pass


def _text(value, limit=10000):
    if not isinstance(value, str):
        raise ValueError('Une valeur textuelle est attendue.')
    value = value.strip()
    if len(value) > limit:
        raise ValueError(f'{limit} caractères maximum.')
    return value


def _email(value):
    value = _text(value, 320)
    if not EMAIL.fullmatch(value):
        raise ValueError('Adresse e-mail invalide.')
    return value


def _image(value):
    value = _text(value, 2048)
    if not safe_image(value):
        raise ValueError('Utilisez une URL HTTPS ou un chemin d’image de l’application.')
    return value


def _date(value):
    value = _text(value, 100)
    try:
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
            raise ValueError()
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise ValueError('Date invalide.') from None


def _datetime(value):
    value = _text(value, 100)
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if 'T' not in value or parsed.utcoffset() is None:
            raise ValueError()
        return parsed.astimezone(timezone.utc).isoformat()
    except (ValueError, OverflowError):
        raise ValueError('Date et heure invalides ; le fuseau horaire est requis.') from None


def _boolean(value):
    if type(value) is not bool:
        raise ValueError('Choisissez Oui ou Non.')
    return value


def _integer(value):
    if type(value) is not int or abs(value) > MAX_NUMBER:
        raise ValueError('Un entier représentable sans perte de précision est attendu.')
    return value


def _decimal(value):
    if type(value) not in (int, float) or abs(value) > MAX_NUMBER or not math.isfinite(value):
        raise ValueError('Un nombre fini représentable sans perte de précision est attendu.')
    return value


def field_value(field, value):
    if value is None or (isinstance(value, str) and not value.strip()) or (
        field['kind'] == 'choice' and field.get('multiple') and value == []
    ):
        if field['required']:
            raise ValueError('Ce champ est obligatoire.')
        return None
    if field['kind'] == 'choice':
        multiple = field.get('multiple', False)
        selections = value if multiple else [value]
        allowed = {option['id'] for option in field['options']}
        if not isinstance(selections, list) or any(
            not isinstance(selection, str) or selection not in allowed for selection in selections
        ) or len(set(selections)) != len(selections):
            raise ValueError('Sélectionnez des options valides et distinctes.')
        return selections if multiple else value
    validators = {
        'text': _text,
        'email': _email,
        'image': _image,
        'date': _date,
        'datetime': _datetime,
        'boolean': _boolean,
        'integer': _integer,
        'decimal': _decimal,
        'phone': _phone,
        'address': _address,
    }
    validator = validators.get(field['kind'])
    if validator is None:
        raise ValueError('Type de champ non pris en charge.')
    return validator(value)


def _phone(value):
    value = _text(value, 40)
    digits = sum(character.isascii() and character.isdigit() for character in value)
    if not re.fullmatch(r'\+?[0-9 ().-]+', value) or not 3 <= digits <= 15:
        raise ValueError('Saisissez un numéro de téléphone valide.')
    return value


def _address(value):
    return _text(value, 1000)


def validate_values(fields, supplied):
    definitions = {field['id']: field for field in fields}
    issues = [{'field': identity, 'message': 'Ce champ est inconnu ou réservé au système.'}
              for identity in supplied if identity not in definitions]
    result = {}
    for identity, field in definitions.items():
        try:
            normalized = field_value(field, supplied.get(identity))
            if normalized is not None:
                result[identity] = normalized
        except ValueError as exc:
            issues.append({'field': identity, 'message': str(exc)})
    if issues:
        raise RecordValidationError(issues)
    return result


def creation_relations(type_id, catalog):
    definitions = relation_catalog(catalog)
    return [{**path, 'required': path['direction'] == 'outgoing' and definitions[path['id']][1]['required']}
            for path in navigations(str(type_id), catalog)]


def validate_assignments(type_id, catalog, assignments, related, new_record_id):
    paths = {(path['id'], path['direction']): path for path in creation_relations(type_id, catalog)}
    seen = set()
    issues, edges = [], []
    for assignment in assignments:
        identity, direction = assignment['relation_id'], assignment['direction']
        key = (identity, direction)
        field = f'relation:{identity}:{direction}'
        path = paths.get(key)
        if key in seen or path is None:
            issues.append({'field': field, 'message': 'Cette relation est inconnue ou déclarée plusieurs fois.'})
            continue
        seen.add(key)
        record_ids = assignment['record_ids']
        if len(set(record_ids)) != len(record_ids):
            issues.append({'field': field, 'message': 'Un enregistrement ne peut être sélectionné plusieurs fois.'})
        if (not path['many'] and len(record_ids) > 1) or (path['required'] and not record_ids):
            issues.append({'field': field, 'message': 'Sélectionnez exactement un élément.' if not path['many'] else 'Cette relation est obligatoire.'})
        for record_id in record_ids:
            record = related.get(record_id)
            if record is None or str(record.entity_type_id) not in path['type_ids']:
                issues.append({'field': field, 'message': 'Un élément lié est introuvable ou appartient à un type non autorisé dans cette organisation.'})
                continue
            edges.append((identity, str(new_record_id), record_id) if direction == 'outgoing' else (identity, record_id, str(new_record_id)))
    for key, path in paths.items():
        if path['required'] and key not in seen:
            issues.append({'field': f'relation:{key[0]}:{key[1]}', 'message': 'Cette relation est obligatoire.'})
    if issues:
        raise RecordValidationError(issues)
    return edges


def check_capacity(catalog, edges, counts, new_record_id):
    definitions = relation_catalog(catalog)
    planned = {}
    issues = []
    for relation_id, source_id, target_id in edges:
        relation = definitions[relation_id][1]
        for side, record_id, maximum in (('source', source_id, relation['source_max']), ('target', target_id, relation['target_max'])):
            key = (relation_id, side, record_id)
            planned[key] = planned.get(key, 0) + 1
            if maximum is not None and counts.get(key, 0) + planned[key] > maximum:
                direction = 'outgoing' if source_id == str(new_record_id) else 'incoming'
                issues.append({'field': f'relation:{relation_id}:{direction}', 'message': 'Cet élément est déjà lié et la cardinalité de la relation ne permet pas un lien supplémentaire.'})
    if issues:
        raise RecordRelationConflictError(issues)
