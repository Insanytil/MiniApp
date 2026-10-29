# Métamodèle des entités

## Périmètre actuel

Le configurateur définit les champs, relations, profils d’affichage et vues d’un type d’entité. Il est réservé aux administrateurs de l’organisation active. L’onglet Aperçu utilise exclusivement des données fictives en mémoire : aucun enregistrement métier n’est créé. Le menu d’organisation ouvre désormais une page de lecture des enregistrements avec la vue par défaut. La création des enregistrements est disponible depuis ce tableau, avec validation des champs et des relations. La suppression, la gestion des fichiers et les politiques d’accès fines restent à développer.

## Définitions et stockage

Chaque `EntityType` possède un document `configuration` JSONB strictement validé et un compteur `configuration_version`. Le document contient `schema_version: 1`, `fields`, `relations`, `display_profiles` et `views`. Le nom et l’identifiant technique du type restent dans les colonnes existantes. Les définitions sont distinctes des valeurs métier, désormais stockées en JSONB dans `entity_records`, avec leurs liens dans `entity_record_links`.

Chaque définition et chaque colonne possède un UUID stable. Les références utilisent ces UUID, jamais un libellé ou un identifiant technique. Les identifiants techniques des champs et relations existants sont immuables et partagent un espace de noms par type. `id`, `created_at`, `updated_at`, `created_by` et `updated_by` sont réservés. Leurs UUID de référence sont dérivés par UUIDv5 du type et de leur nom système.

Les champs proposés sont texte, email, entier, décimal, booléen, date, date/heure et image. Le caractère obligatoire décrit une contrainte que la future couche d’enregistrements devra appliquer. Aucun JavaScript utilisateur n’est exécuté.

## Une relation, deux navigations

Une relation est définie uniquement sur son entité de départ. Elle référence les entités liées, un libellé inverse et deux maximums.

Les entités reliées sont fixées à la création : le type source et l’ensemble des types liés d’une relation existante sont immuables, même sans enregistrements métier. Le formulaire propose « Entité de départ » et « Entité liée », puis les affiche en lecture seule à l’édition. Les anciennes relations vers plusieurs types conservent leurs entités liées. L’API contrôle également cette règle ; relier d’autres entités exige une nouvelle relation.

Les deux maximums définissent les cardinalités :

- `source_max`: nombre de cibles par enregistrement source ; `1` ou `null` (plusieurs).
- `target_max`: nombre de sources par enregistrement cible ; `1` ou `null`.

Ainsi, Véhicule → Personne avec `source_max=1`, `target_max=null` est une relation plusieurs-vers-un. Personne obtient automatiquement la navigation inverse Véhicules. Une relation à soi-même donne deux navigations distinctes et compte une seule fois dans le compteur de relations.

Les relations portent aussi une obligation côté source et une politique de suppression `restrict` ou `unlink`. Une relation obligatoire ne peut pas autoriser `unlink`. Ces options décrivent le contrat à appliquer lors de la future gestion des liens entre enregistrements. L’héritage ne se confond pas avec une relation et n’est pas introduit par ce document.

## Représentations et vues

Un profil d’affichage assemble une liste ordonnée de champs pour le titre et le sous-titre, avec un séparateur et un champ image facultatif. Il reste distinct des données stockées. Chaque type disposant de profils en désigne exactement un par défaut.

Une vue définit une liste ordonnée de colonnes : champ direct, représentation de l’enregistrement courant, représentation d’une relation ou compteur. Une colonne relationnelle choisit une navigation sortante ou entrante et utilise le profil par défaut de chaque cible, ou un profil explicite lorsque la destination est univoque. Une collection peut être présentée sous forme de liste compacte ou d’un premier élément accompagné du nombre d’éléments supplémentaires. Les libellés des colonnes sont indépendants des noms des champs.

L’éditeur de vue s’ouvre en grand format, avec un tableau unique. **Ajouter des colonnes** présente les champs, les champs système, les relations et la représentation de l’entité sous forme de cases à cocher. Les colonnes déjà présentes sont indiquées et désactivées. Chaque champ ou navigation de relation ne peut figurer qu’une fois dans une même vue, indépendamment de son libellé ou de son profil ; cette règle est également contrôlée par l’API. Une relation et son compteur sont deux présentations possibles d’une seule colonne.

Le libellé se modifie directement dans le tableau. Le bouton crayon est réservé aux colonnes nécessitant une présentation particulière : profil d’affichage, collection d’éléments liés ou compteur. Il ouvre une fenêtre de réglages sans permettre de changer le contenu de la colonne. **Prévisualiser** ouvre séparément l’aperçu du brouillon.

Les poignées permettent un déplacement à la souris ou au toucher, avec repère de dépôt. Alt + flèche haut/bas et les boutons de déplacement restent disponibles au clavier. Le déplacement conserve les identifiants, les profils et les options relationnelles et ne modifie que cette vue. Les changements passent par **Appliquer au brouillon**, puis **Enregistrer la configuration**.

Exemple :

1. Créer Personne avec Prénom, Nom et Photo.
2. Définir son affichage Compact : titre Prénom puis Nom, séparés par un espace ; avatar Photo.
3. Enregistrer cette configuration.
4. Créer Véhicule, puis sa relation Personne affectée vers Personne : plusieurs-vers-un ; inverse Véhicules affectés.
5. Créer une vue avec une colonne relationnelle nommée Appartient à, utilisant l’affichage Compact.
6. Dans Aperçu, renseigner les valeurs fictives de Personne : le tableau des véhicules affiche le nom composé et l’avatar dans une seule cellule.

Les images de l’aperçu acceptent HTTPS ou une URL relative à l’application ; aucun contenu n’est récupéré par le serveur. Les initiales servent de repli. Le futur gestionnaire de médias devra fournir des références de fichiers et vérifier leurs droits.

## Cohérence, versions et sécurité

`GET /organization/entity-types/configuration/catalog` retourne uniquement les définitions de l’organisation autorisée. `PUT /organization/entity-types/{id}/configuration` reçoit `expected_version` et le document complet. Les écritures sont sérialisées par un verrou de l’organisation, puis validées contre toutes ses définitions. La version et `updated_by` sont mis à jour dans la même transaction. Une version périmée provoque une erreur 409 ; le client conserve le brouillon.

La validation bloque les références inexistantes, les destinations hors organisation, les UUID dupliqués, les profils incompatibles et les suppressions cassant une autre vue. Une modification d’un type est validée avec les vues des autres types, y compris celles qui utilisent une navigation inverse.

Le navigateur protège les départs de page, les fermetures et les changements d’organisation avec un brouillon non enregistré. L’aperçu n’est pas un moteur de requêtes et ne prouve pas l’application de règles d’accès aux futurs enregistrements : ce moteur devra appliquer les politiques avant toute projection, charger les relations en groupe, limiter profondeur et volume et définir explicitement filtres, tris et agrégats.

## Migration

Aucune migration n’est générée ou appliquée automatiquement. Générer et relire une migration Alembic pour `entity_types.configuration` (JSONB avec document vide par défaut) et `entity_types.configuration_version` (entier avec valeur initiale 1), puis l’appliquer avant d’utiliser le configurateur.

Le défaut JSON écrit dans `sa.text(...)` conserve un espace entre le deux-points et le numéro de version (`"schema_version": 1`). Sans cet espace, `:1` est interprété comme un paramètre SQLAlchemy et peut produire un défaut JSON invalide lors de l’autogénération. Le test `test_entity_type_sql.py` vérifie la compilation PostgreSQL et le document JSON obtenu, sans connexion à la base.

## Menu et lecture des données

Le menu d’organisation et la page de lecture des enregistrements sont décrits dans [organization-menu.md](organization-menu.md). Le configurateur conserve son aperçu fictif ; les liens du menu ouvrent un tableau distinct alimenté par `entity_records` et la vue par défaut du type. Le bouton Créer un enregistrement ouvre un formulaire construit à partir des champs et des relations configurés.

Les enregistrements peuvent être modifiés depuis les actions du tableau dans un panneau prérempli, avec vérification de concurrence et validation des relations. Les images sont agrandissables dans le tableau, la fiche et le formulaire.


## Profils des enregistrements liés depuis une vue

Dans **Vues**, ajouter une colonne de relation, puis sélectionner son profil d’affichage. **Créer un profil sur [type lié]** et **Modifier [profil]** ouvrent directement l’éditeur du type concerné, sans fermer le brouillon de vue. Le profil compose des champs ordonnés pour le titre et le sous-titre, un séparateur et une image facultative. Le profil par défaut peut aussi être modifié depuis cette colonne.

Pour un autre type, **Enregistrer le profil** persiste immédiatement sa configuration avec sa version attendue. Ce profil est réutilisable ; modifier un profil existant affecte aussi les autres vues qui le référencent. La colonne sélectionne le profil après réussite uniquement. La vue courante reste à appliquer puis à enregistrer avec **Enregistrer la configuration**. Annuler la vue ne supprime pas un profil déjà enregistré sur un autre type.

Pour une colonne sur le même type (y compris une relation vers lui-même), le profil reste dans le brouillon courant et est enregistré avec la vue. Une relation acceptant plusieurs types continue à utiliser le profil par défaut de chacun de ses types cibles ; une référence unique à un profil spécifique n’est autorisée que pour une cible unique.

Une erreur réseau ou un conflit conserve le formulaire et la vue. Après un conflit, fermer puis rouvrir l’éditeur du profil pour repartir de la version actualisée du catalogue. Les opérations restent limitées à l’organisation active et à son administrateur, avec protection CSRF. Aucune migration supplémentaire n’est nécessaire.
