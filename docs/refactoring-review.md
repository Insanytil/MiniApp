# Revue et refactoring transversal

## Périmètre

Revue du backend FastAPI (authentification, autorisation, administration,
entités, fichiers, tâches et persistance), du frontend React (session, listes,
formulaires, configuration, composants partagés et client API) et de Docker Compose.
Les modifications présentes avant cette intervention sont conservées.

## Changements

| Zone | Problème constaté | Changement |
| --- | --- | --- |
| Application | Assemblage directement dans le point d'entrée | Fabrique `app.application.create_app`, point d'entrée ASGI conservé |
| Plateforme | Un routeur de plus de 500 lignes | Routeurs utilisateurs, organisations et tâches, garde administrateur commune |
| Membres | Route PATCH renvoyant un succès sans écriture | Alias du traitement existant, validation du payload et réponse 204 ; erreurs 404 conservées |
| Authentification | Validation de session dupliquée pour HTTP et SSE | Fonction commune ; session de base de données SSE toujours de courte durée |
| Autorisation | Contexte métier défini dans le module HTTP | `OrganizationScope` isolé dans un module dédié, import existant compatible |
| Fichiers | SQL, politique métier et HTTP mélangés | Dépôt SQL, service applicatif, exceptions et routes séparés |
| Images | Types MIME et plafond de signature répétés | Politique backend partagée |
| Emails | Mise en file dupliquée ; tests attendant encore SMTP direct | Orchestration commune, tests du vrai service et du commit avant publication |
| Formulaires | Champs scalaires et relations dans un composant de près de 700 lignes | Composants de champs séparés du cycle de soumission |
| Détail | Présentation du détail dans la page du tableau | Panneau dédié, encadré de suivi conservé |
| Aperçu image | Composant réutilisable dépendant du rendu d'une cellule | Composant dans le domaine fichiers |
| Configuration | Sélection de champs de profil imbriquée dans l'éditeur général | Contrôles de sélection isolés |
| Listes | Effet de correction de page dupliqué | Hook partagé sur les cinq listes concernées |
| Typage | Retours et accès de dictionnaires supposés toujours présents | Types corrigés, notamment organisation facultative et alias de langages |
| UI partagée | Imports de types incohérents et variables masquées | Corrections ESLint et formatage des fichiers modifiés |
| Contrôles | Vérifications dispersées | `npm run verify` ; règles d'édition partagées dans `.editorconfig` |

Les signatures publiques, les filtres d'organisation, les protections CSRF,
les verrous de fichiers et l'ordre commit/publication sont conservés. La seule
correction fonctionnelle est la route PATCH de membre auparavant vide.
Aucune dépendance ajoutée, aucune migration de base de données nécessaire.

## Validation

- Suite backend complète, comprenant les tests HTTP de refus des routes de
  plateforme pour un non-administrateur, les erreurs de fichiers et l'isolation
  des instances d'application.
- Suite frontend complète : 140 tests.
- TypeScript sans émission, ESLint sans erreur ni avertissement et build Vite.
- Docker Compose : `config --quiet`.
- Le test MinIO réel est volontairement activable séparément avec
  `MINIO_INTEGRATION=1` ; il n'est pas requis par la suite unitaire.

## Points à poursuivre sans changement automatique de comportement

- Plusieurs tests historiques chargent encore les fonctions via AST. Les tests
  d'emails et les nouveaux tests d'application importent les modules réels ;
  poursuivre cette migration progressivement pour tester aussi leur assemblage.
- Les éditeurs de configuration restent volumineux. Un découpage supplémentaire
  doit conserver les interactions de brouillon, de glisser-déposer et de versions.
- Les fichiers terminés mais abandonnés dans un formulaire ne sont pas supprimés
  automatiquement ; définir une politique produit avant d'ajouter un nettoyage.
