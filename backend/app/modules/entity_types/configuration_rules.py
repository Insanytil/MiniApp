"""Semantic validation independent of persistence and UI frameworks."""
from uuid import UUID, uuid5

SYSTEM_KINDS = {"id": "text", "created_at": "datetime", "updated_at": "datetime", "created_by": "text", "updated_by": "text"}


class ConfigurationError(ValueError):
    pass


class ConfigurationConflictError(Exception):
    pass


def empty_configuration():
    return {"schema_version": 1, "fields": [], "relations": [], "display_profiles": [], "views": []}


def system_fields(type_id):
    return [{"id": str(uuid5(UUID(str(type_id)), name)), "name": name,
             "technical_name": name, "kind": kind, "required": False, "system": True}
            for name, kind in SYSTEM_KINDS.items()]


def all_fields(type_id, configuration):
    return system_fields(type_id) + configuration.get("fields", [])


def relation_catalog(catalog):
    return {relation["id"]: (owner_id, relation)
            for owner_id, config in catalog.items() for relation in config.get("relations", [])}


def navigations(type_id, catalog):
    result = []
    for relation_id, (owner_id, relation) in relation_catalog(catalog).items():
        if owner_id == type_id:
            result.append({"id": relation_id, "name": relation["name"], "direction": "outgoing",
                           "type_ids": relation["target_type_ids"], "many": relation["source_max"] is None})
        if type_id in relation["target_type_ids"]:
            result.append({"id": relation_id, "name": relation["inverse_name"], "direction": "incoming",
                           "type_ids": [owner_id], "many": relation["target_max"] is None})
    return result


def validate_catalog(catalog, previous=None):
    """Validate the entire organization so edits cannot break another type's view."""
    if previous:
        old_relations = relation_catalog(previous)
        for relation_id, (owner_id, relation) in relation_catalog(catalog).items():
            if relation_id not in old_relations:
                continue
            old_owner_id, old_relation = old_relations[relation_id]
            if owner_id != old_owner_id or set(relation['target_type_ids']) != set(old_relation['target_type_ids']):
                raise ConfigurationError("Les entités reliées par une relation existante sont immuables. Créez une nouvelle relation pour relier d’autres entités.")
    seen = set()
    reserved_ids = {field["id"] for type_id in catalog for field in system_fields(type_id)}
    for type_id, config in catalog.items():
        fields = {field["id"]: field for field in all_fields(type_id, config)}
        technical_names = set(SYSTEM_KINDS)
        for category in ("fields", "relations", "display_profiles", "views"):
            for definition in config.get(category, []):
                identity = definition["id"]
                if identity in seen or identity in reserved_ids:
                    raise ConfigurationError("Chaque définition doit avoir un identifiant unique.")
                seen.add(identity)
                if category in ("fields", "relations"):
                    name = definition["technical_name"]
                    if name in technical_names:
                        raise ConfigurationError(f"L’identifiant « {name} » est réservé ou déjà utilisé.")
                    technical_names.add(name)
        for category in ("display_profiles", "views"):
            items = config.get(category, [])
            if items and sum(bool(item["is_default"]) for item in items) != 1:
                raise ConfigurationError("Définissez exactement un affichage et une vue par défaut lorsqu’ils existent.")
        for relation in config.get("relations", []):
            targets = relation["target_type_ids"]
            if len(set(targets)) != len(targets) or any(target not in catalog for target in targets):
                raise ConfigurationError("Les cibles d’une relation doivent exister dans cette organisation et être distinctes.")
            if relation["required"] and relation["on_delete"] == "unlink":
                raise ConfigurationError("Une relation obligatoire ne peut pas être détachée lors d’une suppression.")
        for profile in config.get("display_profiles", []):
            for identity in profile["title_fields"] + profile["secondary_fields"]:
                if identity not in fields or fields[identity]["kind"] == "image":
                    raise ConfigurationError("Un affichage référence un champ textuel absent ou un champ image.")
            image = profile["image_field"]
            if image is not None and (image not in fields or fields[image]["kind"] != "image"):
                raise ConfigurationError("L’avatar doit référencer un champ de type image.")
        paths = {(item["id"], item["direction"]): item for item in navigations(type_id, catalog)}
        for view in config.get("views", []):
            column_contents = set()
            for column in view["columns"]:
                content = (
                    ('field', column['field_id']) if column['kind'] == 'field'
                    else ('display',) if column['kind'] == 'display'
                    else ('relation', column['relation_id'], column['direction'])
                )
                if content in column_contents:
                    raise ConfigurationError("Une colonne ne peut apparaître qu’une seule fois dans une vue, même avec un autre libellé ou affichage.")
                column_contents.add(content)
                if column["id"] in seen or column["id"] in reserved_ids:
                    raise ConfigurationError("Chaque colonne doit avoir un identifiant unique.")
                seen.add(column["id"])
                if column["kind"] == "field":
                    if column["field_id"] not in fields or column["relation_id"] is not None or column["profile_id"] is not None:
                        raise ConfigurationError("Une colonne de champ doit référencer uniquement un champ existant.")
                elif column["kind"] == "display":
                    if column["field_id"] is not None or column["relation_id"] is not None or (
                        column["profile_id"] is not None and not any(
                            item["id"] == column["profile_id"] for item in config.get("display_profiles", [])
                        )
                    ):
                        raise ConfigurationError("Une colonne d’affichage doit référencer un profil de ce type.")
                else:
                    path = paths.get((column["relation_id"], column["direction"]))
                    if path is None or column["field_id"] is not None:
                        raise ConfigurationError("Une colonne relationnelle référence une relation inaccessible depuis ce type.")
                    profile = column["profile_id"]
                    if column["kind"] == "count" and profile is not None:
                        raise ConfigurationError("Un compteur ne possède pas de profil d’affichage.")
                    if profile is not None and (len(path["type_ids"]) != 1 or not any(
                        item["id"] == profile for item in catalog[path["type_ids"][0]].get("display_profiles", [])
                    )):
                        raise ConfigurationError("Le profil choisi doit appartenir au type lié. Pour plusieurs types, utilisez leur affichage par défaut.")
    if previous:
        for type_id, old in previous.items():
            if type_id not in catalog:
                continue
            for category in ("fields", "relations"):
                current = {item["id"]: item for item in catalog[type_id].get(category, [])}
                for item in old.get(category, []):
                    if item["id"] in current and current[item["id"]]["technical_name"] != item["technical_name"]:
                        raise ConfigurationError("L’identifiant technique d’une définition existante est immuable.")


def requires_data_migration(previous, candidate):
    """Protect existing JSON values and edges until a data migration is supplied."""
    old_fields = {field['id']: field for field in previous['fields']}
    fields = {field['id']: field for field in candidate['fields']}
    for identity, field in old_fields.items():
        if identity not in fields or fields[identity]['kind'] != field['kind'] or (fields[identity]['required'] and not field['required']):
            return True
    if any(field['required'] and field['id'] not in old_fields for field in candidate['fields']):
        return True
    old_relations = {relation['id']: relation for relation in previous['relations']}
    relations = {relation['id']: relation for relation in candidate['relations']}
    structural_keys = ('target_type_ids', 'source_max', 'target_max', 'required')
    for identity, relation in old_relations.items():
        if identity not in relations or any(relations[identity][key] != relation[key] for key in structural_keys):
            return True
    return any(relation['required'] and relation['id'] not in old_relations for relation in candidate['relations'])
