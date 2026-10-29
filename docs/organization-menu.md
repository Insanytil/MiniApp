# Menu d’organisation et enregistrements

## Composer le menu

Depuis Configuration, choisir **Composer le menu**. Ajouter des catégories ou des liens vers un type d’entité. Une catégorie peut contenir des catégories et des liens. Le champ Emplacement permet de changer de parent ; les flèches réordonnent les éléments d’un même niveau. Retirer une catégorie retire uniquement son sous-arbre du menu, sans supprimer les types ni leurs données.

Les libellés de catégorie sont obligatoires. Le libellé d’un lien est facultatif : vide, il suit le nom actuel du type, même si celui-ci est renommé. Plusieurs liens vers un même type sont autorisés. Le document est limité à 200 éléments et 8 niveaux ; chaque nœud a un UUID unique. Les références à des types extérieurs à l’organisation sont refusées.

Les modifications restent dans un brouillon jusqu’à **Enregistrer le menu**. Une version optimiste protège contre les écrasements concurrents. Les départs de page et changements d’organisation demandent confirmation lorsqu’un brouillon existe. Le menu enregistré apparaît immédiatement dans le menu latéral du compte courant ; les autres sessions l’actualisent au retour sur l’application ou périodiquement.

## Accès

- `GET /organization/navigation` est disponible aux membres actifs de l’organisation autorisée.
- `PUT /organization/navigation` exige le rôle administrateur de cette organisation et une protection CSRF.
- Le menu est partagé par l’organisation. Il n’est pas une politique d’autorisation : retirer un lien ne rend pas les données privées.
- La lecture et la création des enregistrements sont actuellement ouvertes aux membres actifs de l’organisation. Les droits fins par type, champ et enregistrement seront ajoutés avec le moteur de politiques.

Toutes les requêtes utilisent l’organisation validée depuis `X-Organization-ID`. Les clés de cache frontend incluent son identifiant. Un changement d’organisation réinitialise la page et ses sélections.

## Ouvrir un type d’entité

Un lien ouvre `/workspace/entities/{entityTypeId}`. La page interroge les véritables tables d’enregistrements ; elle n’utilise pas les données fictives du configurateur.

La vue marquée `is_default` détermine les colonnes. S’il n’existe aucune vue configurée, le tableau utilise les champs personnalisés, ou le champ système `id` pour un type sans champ. La recherche porte sur les valeurs directes et l’identifiant de l’enregistrement ; elle ne recherche pas encore dans les libellés des relations. Le tableau est paginé et défile dans sa propre zone. L’action de lecture ouvre une fiche dans un panneau à droite.

Les cellules prennent en charge un champ direct, un affichage composé du record courant, une représentation des enregistrements liés et un compteur. Les noms composés et images utilisent les profils du configurateur. Les valeurs système sont calculées à partir des colonnes d’audit et prennent toujours le dessus sur une éventuelle valeur JSON du même identifiant.

Le moteur charge les relations par lots. Une requête à fonctions de fenêtre calcule les compteurs et ne retourne que trois cibles au maximum par enregistrement, relation et sens. La vue peut n’en afficher qu’une avec le nombre d’éléments supplémentaires. Aucune requête HTTP par ligne n’est nécessaire.

## Stockage et intégrité

- `organizations.navigation` : document JSONB versionné, avec `schema_version: 1` et `nodes`.
- `organizations.navigation_version` et `navigation_updated_by` : contrôle de concurrence et auteur.
- `entity_records` : organisation, type, valeurs JSONB indexées par UUID de champ, et champs système d’audit.
- `entity_record_links` : organisation, UUID de relation, enregistrement source et cible.

Les clés étrangères composites garantissent que le type d’un enregistrement et les deux extrémités d’un lien appartiennent à la même organisation. Les définitions de relations restent dans les documents de configuration ; leur validation est appliquée lors de la création des enregistrements.

Un type encore utilisé dans le menu, par une définition dépendante ou par des enregistrements ne peut pas être supprimé. Les modifications structurelles destructrices d’un type déjà peuplé sont refusées en attendant une migration de données explicite. Les changements de libellés, de profils et de vues restent possibles.

## Créer un enregistrement

Le bouton **Créer un enregistrement** ouvre un panneau à droite. Les champs personnalisés sont construits à partir de leur type ; les champs système sont générés côté serveur. Les champs image acceptent une URL HTTPS ou un chemin relatif, sans téléversement de fichier.

Les relations utilisent une autocomplétion paginée avec le profil d’affichage de chaque cible. Les relations multiples permettent plusieurs sélections. Les cardinalités et les relations obligatoires sont vérifiées côté serveur, ainsi que l’organisation et le type de chaque cible. Une association inverse est enregistrée dans le sens canonique de la relation.

- `GET /organization/entities/{type_id}/creation-schema` : champs, relations et version du formulaire.
- `GET /organization/entities/{type_id}/record-options` : cibles disponibles pour une relation et un sens donnés.
- `POST /organization/entities/{type_id}/records` : création avec protection CSRF et version de configuration attendue.

L’enregistrement, les liens et l’audit sont validés dans une seule transaction. Le verrou d’organisation commun aux changements de configuration protège les cardinalités et la version du schéma contre les écritures concurrentes. Un échec annule toute l’écriture. Le serveur attribue l’identifiant, les dates et l’utilisateur auteur ; le client ne peut pas les imposer.

Les erreurs conservent les saisies. Si la configuration a changé, une confirmation permet de recharger le formulaire ; un brouillon protège aussi les départs de page et les changements d’organisation. Après création, les tableaux et les relations en cache sont actualisés. L’action **Modifier** du tableau ouvre ce même formulaire prérempli. La suppression des enregistrements reste à développer. Cette fonctionnalité ne nécessite aucune migration supplémentaire.

## Migration à réaliser manuellement

Aucune migration n’est générée ou appliquée par ce changement. La migration doit ajouter :

1. Les trois colonnes de navigation et la clé étrangère d’auteur sur `organizations`.
2. La contrainte unique `(organization_id, id)` sur `entity_types`.
3. La table `entity_records`, puis `entity_record_links`, leurs contraintes et leurs index.

La contrainte unique sur le type existant doit être créée **avant** la clé étrangère composite de `entity_records` ; vérifier l’ordre produit par l’autogénération Alembic. Les valeurs JSON SQL par défaut conservent un espace après le deux-points précédant le numéro de version pour éviter que SQLAlchemy interprète `:1` comme un paramètre.

Les tests unitaires et de compilation PostgreSQL couvrent le périmètre d’organisation, les compteurs, les projections, les limites du menu et les défauts SQL. Ils ne remplacent pas une exécution de la migration sur PostgreSQL.

La référence `organizations.navigation_updated_by → users.id` est nommée et déclarée avec `use_alter=True` pour rompre le cycle de tri avec `users.default_organization_id → organizations.id`. Les nouvelles colonnes d’auteur utilisent explicitement `Uuid(as_uuid=True)` pour éviter que l’autogénération propage le type décoré `GUID` du modèle d’authentification sans ajouter son import. Sur la migration déjà générée, l’import `fastapi_users_db_sqlalchemy.generics` conserve les usages de `GUID()` tels quels. Dans le downgrade, supprimer la contrainte unique de `entity_types` après les tables qui la référencent.


## Modification et images

- `GET /organization/entities/{type_id}/records/{record_id}/edit-schema` retourne un instantané cohérent des champs, des sélections et de `updated_at`.
- `PUT /organization/entities/{type_id}/records/{record_id}` remplace les valeurs et les relations avec `expected_configuration_version` et `expected_updated_at`. Une version obsolète retourne 409 et conserve les saisies dans l’interface jusqu’au rechargement explicite.
- Les liens inchangés sont conservés. Les cardinalités sont calculées sur le résultat final ; un retrait depuis une relation inverse ne peut pas supprimer le dernier lien obligatoire d’un autre enregistrement. Les liens et valeurs sont modifiés dans la même transaction, sous le verrou d’organisation.
- Les auteurs de création restent inchangés. L’auteur et la date de modification sont actualisés pour l’enregistrement et les autres extrémités des liens modifiés, afin de protéger aussi les éditions concurrentes depuis le sens inverse.
- Les images ont une vignette rectangulaire de 112 × 80 pixels dans les tableaux, un aperçu adapté au panneau de détail et un agrandissement au clic. Leur cadrage conserve l’image entière ; les images de profil restent des avatars. Le formulaire affiche aussi un aperçu de l’URL saisie.

Cette modification ne nécessite pas de migration supplémentaire.
