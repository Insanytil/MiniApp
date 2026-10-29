MAX_DEPTH = 8
MAX_NODES = 200


class NavigationError(ValueError):
    pass


class NavigationConflictError(Exception):
    pass


def check_budget(nodes):
    pending = [(node, 1) for node in nodes]
    count = 0
    while pending:
        node, depth = pending.pop()
        count += 1
        if count > MAX_NODES or depth > MAX_DEPTH:
            raise NavigationError("Le menu est limité à 200 éléments et 8 niveaux.")
        if isinstance(node, dict) and isinstance(node.get('children'), list):
            pending.extend((child, depth + 1) for child in node['children'])


def referenced_types(nodes):
    result = set()
    pending = list(nodes)
    while pending:
        node = pending.pop()
        if node['kind'] == 'entity':
            result.add(node['entity_type_id'])
        else:
            pending.extend(node.get('children', []))
    return result


def supported_navigation(nodes):
    """Read only supported node kinds without rewriting stored navigation."""
    result = []
    for node in nodes:
        if node['kind'] == 'category':
            result.append({**node, 'children': supported_navigation(node['children'])})
        elif node['kind'] == 'entity':
            result.append(node)
    return result


def validate_navigation(nodes, allowed_type_ids):
    check_budget(nodes)
    pending = list(nodes)
    seen = set()
    while pending:
        node = pending.pop()
        if node['id'] in seen:
            raise NavigationError("Chaque élément du menu doit avoir un identifiant unique.")
        seen.add(node['id'])
        if node['kind'] == 'entity':
            if node['entity_type_id'] not in allowed_type_ids:
                raise NavigationError("Un type d’entité du menu n’existe pas dans cette organisation.")
        else:
            pending.extend(node['children'])


def resolve_navigation(nodes, type_names):
    resolved = []
    for node in nodes:
        if node['kind'] == 'category':
            resolved.append({**node, 'children': resolve_navigation(node['children'], type_names)})
        elif node['entity_type_id'] in type_names:
            resolved.append({**node, 'label': node['label'] or type_names[node['entity_type_id']]})
    return resolved
