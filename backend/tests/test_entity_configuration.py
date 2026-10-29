"""Semantic metadata validation without infrastructure dependencies."""
import copy
import runpy
import unittest
import uuid
from pathlib import Path

rules = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'app/modules/entity_types/configuration_rules.py'))
validate = rules['validate_catalog']
Error = rules['ConfigurationError']


def identity():
    return str(uuid.uuid4())


def field(name, kind='text'):
    return {'id': identity(), 'name': name, 'technical_name': name, 'kind': kind, 'required': False}


def profile(fields):
    return {'id': identity(), 'name': 'Compact', 'title_fields': [f['id'] for f in fields],
            'secondary_fields': [], 'image_field': None, 'separator': ' ', 'is_default': True}


def relation(target):
    return {'id': identity(), 'name': 'Assigné à', 'technical_name': 'assigned_person',
            'target_type_ids': [target], 'inverse_name': 'Véhicules', 'source_max': 1,
            'target_max': None, 'required': False, 'on_delete': 'restrict'}


def column(kind, **kw):
    return {'id': identity(), 'label': 'Appartient à', 'kind': kind, 'field_id': None,
            'relation_id': None, 'direction': 'outgoing', 'profile_id': None,
            'collection_display': 'list', **kw}


def view(columns):
    return {'id': identity(), 'name': 'Tableau', 'columns': columns, 'is_default': True}


class ConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.person, self.vehicle = identity(), identity()
        self.first, self.last, self.image = field('first_name'), field('last_name'), field('photo', 'image')
        self.profile = profile([self.first, self.last])
        self.profile['image_field'] = self.image['id']
        self.relation = relation(self.person)
        self.catalog = {self.person: rules['empty_configuration'](), self.vehicle: rules['empty_configuration']()}
        self.catalog[self.person]['fields'] = [self.first, self.last, self.image]
        self.catalog[self.person]['display_profiles'] = [self.profile]
        self.catalog[self.vehicle]['relations'] = [self.relation]
        self.column = column('relation', relation_id=self.relation['id'], profile_id=self.profile['id'])
        self.catalog[self.vehicle]['views'] = [view([self.column])]

    def test_vehicle_person_composite_title_and_image_is_valid(self):
        validate(self.catalog)

    def test_forward_and_inverse_navigations_share_one_relation(self):
        forward = rules['navigations'](self.vehicle, self.catalog)[0]
        inverse = rules['navigations'](self.person, self.catalog)[0]
        self.assertEqual(forward['id'], inverse['id'])
        self.assertFalse(forward['many'])
        self.assertTrue(inverse['many'])
        self.assertEqual(inverse['type_ids'], [self.vehicle])

    def test_self_relation_supports_two_directions_without_recursing(self):
        self.relation['target_type_ids'] = [self.vehicle]
        self.column['profile_id'] = None
        validate(self.catalog)
        paths = rules['navigations'](self.vehicle, self.catalog)
        self.assertEqual({p['direction'] for p in paths}, {'incoming', 'outgoing'})

    def test_outside_organization_target_is_rejected(self):
        self.relation['target_type_ids'] = [identity()]
        with self.assertRaises(Error): validate(self.catalog)

    def test_duplicate_target_is_rejected(self):
        self.relation['target_type_ids'] *= 2
        with self.assertRaises(Error): validate(self.catalog)

    def test_all_four_cardinalities_are_representable(self):
        for source in (1, None):
            for target in (1, None):
                self.relation.update(source_max=source, target_max=target)
                validate(self.catalog)

    def test_required_relation_cannot_unlink_when_target_deleted(self):
        self.relation.update(required=True, on_delete='unlink')
        with self.assertRaises(Error): validate(self.catalog)

    def test_polymorphic_relation_uses_each_target_default_profile(self):
        company = identity()
        self.catalog[company] = rules['empty_configuration']()
        self.relation['target_type_ids'].append(company)
        with self.assertRaises(Error): validate(self.catalog)
        self.column['profile_id'] = None
        validate(self.catalog)

    def test_inverse_view_can_render_or_count_related_vehicles(self):
        for kind in ('count', 'relation'):
            self.catalog[self.person]['views'] = [view([
                column(kind, relation_id=self.relation['id'], direction='incoming'),
            ])]
            validate(self.catalog)

    def test_same_field_cannot_be_added_twice_with_different_labels(self):
        self.catalog[self.person]['views'] = [view([
            column('field', field_id=self.first['id'], label='Prénom'),
            column('field', field_id=self.first['id'], label='Autre libellé'),
        ])]
        with self.assertRaisesRegex(Error, 'une seule fois'):
            validate(self.catalog)

    def test_relation_and_its_counter_cannot_duplicate_the_same_column(self):
        self.catalog[self.person]['views'] = [view([
            column('count', relation_id=self.relation['id'], direction='incoming'),
            column('relation', relation_id=self.relation['id'], direction='incoming'),
        ])]
        with self.assertRaisesRegex(Error, 'une seule fois'):
            validate(self.catalog)

    def test_current_record_representation_cannot_be_duplicated(self):
        self.catalog[self.person]['views'] = [view([column('display'), column('display')])]
        with self.assertRaisesRegex(Error, 'une seule fois'):
            validate(self.catalog)

    def test_distinct_directions_of_a_self_relation_are_distinct_columns(self):
        self.relation['target_type_ids'] = [self.vehicle]
        self.catalog[self.vehicle]['views'] = [view([
            column('relation', relation_id=self.relation['id'], direction='outgoing'),
            column('relation', relation_id=self.relation['id'], direction='incoming'),
        ])]
        validate(self.catalog)

    def test_parent_relation_does_not_allow_arbitrary_traversal(self):
        self.column['relation_id'] = identity()
        with self.assertRaises(Error): validate(self.catalog)

    def test_unknown_field_in_display_title_is_rejected(self):
        self.profile['title_fields'] = [identity()]
        with self.assertRaises(Error): validate(self.catalog)

    def test_image_field_cannot_be_used_as_text_title(self):
        self.profile['title_fields'] = [self.image['id']]
        with self.assertRaises(Error): validate(self.catalog)

    def test_avatar_must_reference_an_image_field(self):
        self.profile['image_field'] = self.first['id']
        with self.assertRaises(Error): validate(self.catalog)

    def test_system_fields_have_stable_ids_and_can_be_referenced(self):
        fields = rules['system_fields'](self.person)
        self.assertEqual(fields, rules['system_fields'](self.person))
        self.profile['title_fields'] = [fields[0]['id']]
        validate(self.catalog)

    def test_system_names_and_identities_cannot_be_overridden(self):
        self.first['technical_name'] = 'created_at'
        with self.assertRaises(Error): validate(self.catalog)
        self.first['technical_name'] = 'first_name'
        self.first['id'] = rules['system_fields'](self.person)[0]['id']
        with self.assertRaises(Error): validate(self.catalog)

    def test_duplicate_metadata_ids_and_identifiers_are_rejected(self):
        self.last['id'] = self.first['id']
        with self.assertRaises(Error): validate(self.catalog)
        self.last['id'] = identity()
        self.last['technical_name'] = self.first['technical_name']
        with self.assertRaises(Error): validate(self.catalog)

    def test_two_defaults_or_no_default_are_rejected(self):
        second = profile([self.first])
        self.catalog[self.person]['display_profiles'].append(second)
        with self.assertRaises(Error): validate(self.catalog)
        self.profile['is_default'] = second['is_default'] = False
        with self.assertRaises(Error): validate(self.catalog)

    def test_profile_must_belong_to_the_related_type(self):
        self.column['profile_id'] = identity()
        with self.assertRaises(Error): validate(self.catalog)

    def test_counter_cannot_reference_a_profile(self):
        self.column['kind'] = 'count'
        with self.assertRaises(Error): validate(self.catalog)

    def test_column_cannot_mix_field_and_relation_sources(self):
        self.column['field_id'] = self.first['id']
        with self.assertRaises(Error): validate(self.catalog)

    def test_deleting_profile_or_relation_used_in_another_view_is_blocked(self):
        old = copy.deepcopy(self.catalog)
        self.catalog[self.person]['display_profiles'] = []
        with self.assertRaises(Error): validate(self.catalog)
        self.catalog = old
        self.catalog[self.vehicle]['relations'] = []
        with self.assertRaises(Error): validate(self.catalog)

    def test_technical_identifiers_are_immutable_but_labels_can_change(self):
        old = copy.deepcopy(self.catalog)
        self.first['name'] = 'Prénom'
        validate(self.catalog, old)
        self.first['technical_name'] = 'new_identifier'
        with self.assertRaises(Error): validate(self.catalog, old)

    def test_existing_relation_cannot_replace_add_or_remove_linked_entities(self):
        third = identity()
        self.catalog[third] = rules['empty_configuration']()
        old = copy.deepcopy(self.catalog)
        for targets in ([third], [self.person, third], [self.vehicle], []):
            with self.subTest(targets=targets):
                candidate = copy.deepcopy(old)
                candidate[self.vehicle]['relations'][0]['target_type_ids'] = targets
                with self.assertRaisesRegex(Error, 'entités.*immuables'):
                    validate(candidate, old)

    def test_existing_relation_cannot_move_to_another_source_entity(self):
        old = copy.deepcopy(self.catalog)
        moved = self.catalog[self.vehicle]['relations'].pop()
        self.catalog[self.person]['relations'].append(moved)
        with self.assertRaisesRegex(Error, 'entités.*immuables'):
            validate(self.catalog, old)

    def test_existing_relation_labels_and_cardinality_can_still_change(self):
        old = copy.deepcopy(self.catalog)
        self.relation.update(name='Responsable', inverse_name='Éléments gérés', source_max=None)
        validate(self.catalog, old)

    def test_existing_multi_entity_relation_keeps_its_members_even_when_reordered(self):
        third = identity()
        self.catalog[third] = rules['empty_configuration']()
        self.catalog[self.vehicle]['views'] = []
        self.relation['target_type_ids'].append(third)
        old = copy.deepcopy(self.catalog)
        self.relation['target_type_ids'].reverse()
        validate(self.catalog, old)
        self.relation['target_type_ids'].pop()
        with self.assertRaisesRegex(Error, 'entités.*immuables'):
            validate(self.catalog, old)

    def test_deleting_a_type_with_incoming_relations_is_blocked(self):
        del self.catalog[self.person]
        with self.assertRaises(Error): validate(self.catalog)

    def test_own_record_display_can_compose_multiple_fields_in_one_column(self):
        self.catalog[self.person]['views'] = [view([column('display', profile_id=self.profile['id'])])]
        validate(self.catalog)

    def test_own_display_cannot_select_another_types_profile(self):
        self.catalog[self.vehicle]['views'] = [view([column('display', profile_id=self.profile['id'])])]
        with self.assertRaises(Error): validate(self.catalog)

    def test_own_display_cannot_mix_in_relation_or_field_sources(self):
        self.catalog[self.person]['views'] = [view([column('display', profile_id=self.profile['id'], field_id=self.first['id'])])]
        with self.assertRaises(Error): validate(self.catalog)

    def test_destructive_changes_require_record_migration_but_display_changes_do_not(self):
        old = copy.deepcopy(self.catalog[self.person])
        renamed = copy.deepcopy(old)
        renamed['fields'][0]['name'] = 'Prénom renommé'
        self.assertFalse(rules['requires_data_migration'](old, renamed))
        changed = copy.deepcopy(old)
        changed['fields'][0]['kind'] = 'integer'
        self.assertTrue(rules['requires_data_migration'](old, changed))
        changed = copy.deepcopy(old)
        changed['fields'].pop()
        self.assertTrue(rules['requires_data_migration'](old, changed))


if __name__ == '__main__':
    unittest.main()
