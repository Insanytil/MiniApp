# Backend MiniApp

API FastAPI et worker Celery. En développement sous Windows, ils utilisent le même interpréteur Python et le même fichier `.env`, mais tournent dans deux processus séparés.

## Préparer l'environnement

Prérequis : Python 3.12 ou supérieur, `uv` et Docker Desktop.

Depuis un terminal PowerShell à la racine du dépôt :

```powershell
cd backend
uv sync --locked
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Adapter les valeurs de [`.env`](.env.example), notamment les identifiants PostgreSQL. Le fichier local `.env` est ignoré par Git.

Depuis la racine du dépôt, démarrer les services nécessaires :

```powershell
docker compose --env-file backend/.env -f infra/compose.yaml up -d postgres redis mailpit minio minio-init
```

- PostgreSQL : `127.0.0.1:5432` par défaut.
- Redis : `127.0.0.1:6379` par défaut.
- Mailpit : SMTP sur `127.0.0.1:1025`, interface sur <http://localhost:8025>.

Les ports et identifiants doivent correspondre à ceux du fichier `.env`. La préparation du schéma de base de données reste à effectuer selon votre procédure habituelle ; ces commandes ne génèrent et n'appliquent aucune migration.

## Interpréteur PyCharm

Dans **Settings → Project → Python Interpreter**, sélectionner l'environnement existant :

```text
<dépôt>\backend\.venv\Scripts\python.exe
```

Pour cette configuration Windows, utiliser l'interpréteur Windows, avec Docker Desktop lancé sur l'hôte Windows.

Les configurations ci-dessous supposent que PyCharm ouvre la racine **MiniApp**. Si vous ouvrez directement le dossier **backend**, remplacer le dossier de travail `$PROJECT_DIR$/backend` par `$PROJECT_DIR$`.

Le dossier `backend` peut être marqué **Sources Root** dans PyCharm pour faciliter la résolution des imports `app` dans l'éditeur.

## Worker Celery dans PyCharm

Ouvrir **Run → Edit Configurations… → + → Python**, puis renseigner :

| Champ | Valeur |
| --- | --- |
| Name | `Celery worker` |
| Type de cible | **Module name** |
| Module name | `celery` |
| Parameters / Script parameters | `-A app.workers.celery_app:celery_app worker --loglevel=info --pool=solo` |
| Python interpreter | L'interpréteur `backend\.venv\Scripts\python.exe` |
| Working directory | `$PROJECT_DIR$/backend` |
| Environment variables, facultatif | `PYTHONUNBUFFERED=1` |

**Les arguments vont bien dans « Parameters » / « Script parameters ».** Le nom du module est seulement `celery` ; ne pas sélectionner un chemin de script Python.

Le dossier de travail est essentiel : l'application lit automatiquement `.env` depuis ce dossier. Aucun plugin EnvFile n'est nécessaire. Éviter de recopier les secrets dans la configuration PyCharm ; des variables d'environnement déjà définies peuvent prendre le dessus sur `.env`.

Le paramètre `--pool=solo` convient au développement local sous Windows : les tâches sont exécutées une à une dans le processus du worker.

Cliquer sur **Run** ou **Debug**. La console doit afficher la tâche `progressia.email.process`, puis un message indiquant que le worker est prêt (`ready`). L'API doit être lancée séparément pour pouvoir soumettre des tâches. Les courriels envoyés via le SMTP local sont consultables dans Mailpit.

Après une modification du code Python du worker, le redémarrer : cette configuration ne recharge pas automatiquement les fichiers. Utiliser **Stop** dans PyCharm pour l'arrêter.

### Commande équivalente dans un terminal

Depuis la racine du dépôt, dans PowerShell :

```powershell
cd backend
.\.venv\Scripts\python.exe -m celery -A app.workers.celery_app:celery_app worker --loglevel=info --pool=solo
```

L'application Celery se trouve dans [`app/workers/celery_app.py`](app/workers/celery_app.py). Elle utilise `CELERY_BROKER_URL` et `CELERY_RESULT_BACKEND` du fichier `.env`.

## API dans PyCharm

Créer une seconde configuration **Python** :

| Champ | Valeur |
| --- | --- |
| Name | `API` |
| Type de cible | **Module name** |
| Module name | `uvicorn` |
| Parameters / Script parameters | `main:app --host 127.0.0.1 --port 8000 --reload` |
| Python interpreter | Le même environnement que le worker |
| Working directory | `$PROJECT_DIR$/backend` |

L'API est accessible sur <http://127.0.0.1:8000>, sa documentation sur <http://127.0.0.1:8000/docs>.

## Dépannage du worker

| Symptôme | Vérification |
| --- | --- |
| `No module named celery` | Vérifier l'interpréteur sélectionné et exécuter `uv sync --locked` dans `backend`. |
| `No module named app` | Vérifier que **Working directory** pointe vers `backend`. |
| Erreur de validation des paramètres au démarrage | Vérifier que `backend/.env` existe et contient les valeurs requises de `.env.example`. |
| Connexion Redis refusée | Vérifier que Redis est démarré et que les ports des URL Celery correspondent au port publié par Docker. |
| Tâches en attente | Vérifier que le worker affiche `ready` et que l'API et le worker utilisent le même broker Redis. |
| Erreur PostgreSQL ou SMTP pendant une tâche | Vérifier les services Docker, les identifiants et les ports dans `.env`, puis consulter l'erreur dans la console du worker. |

Les réglages locaux PyCharm (`.idea/`) sont ignorés par Git. Ce README sert de référence partagée pour recréer les configurations.

Références : [configuration Python dans PyCharm](https://www.jetbrains.com/help/pycharm/run-debug-configuration-python.html), [concurrence Celery](https://docs.celeryq.dev/en/stable/userguide/concurrency/index.html).

## Fichiers et images — MinIO

Le stockage local utilise les images officielles MinIO et `mc`, avec des versions
fixées dans `infra/compose.yaml`. Le volume `Miniapp-minio-data` conserve les objets.
L'initialisation attend MinIO, crée `S3_BUCKET`, interdit l'accès anonyme et configure
l'expiration des objets `pending/` après un jour. Elle peut être relancée avec la
même commande ; elle remplace les règles de cycle de vie de ce bucket dédié.

```powershell
# À la racine du dépôt
docker compose --env-file backend/.env -f infra/compose.yaml up -d minio minio-init
docker compose --env-file backend/.env -f infra/compose.yaml logs minio-init
# Depuis backend, après installation des dépendances par le développeur
uv run alembic upgrade head
uv run python -m unittest discover -s tests -p test_files.py -v
```

- API S3 : <http://127.0.0.1:9000>.
- Console : <http://127.0.0.1:9001>, avec `MINIO_ROOT_USER` et `MINIO_ROOT_PASSWORD`.
- Recopier les variables MinIO/S3 de `.env.example` dans `.env` et conserver la
  correspondance entre identifiants MinIO et S3. Les valeurs par défaut sont locales.
- `S3_ENDPOINT_URL` sert aux opérations serveur. Depuis un backend conteneurisé,
  utiliser `http://minio:9000`. `S3_PUBLIC_ENDPOINT_URL` doit rester accessible au
  navigateur ; le nom d'hôte fait partie de la signature et ne doit pas être réécrit.
- `FRONTEND_BASE_URL` configure l'origine autorisée par MinIO pour les requêtes
  navigateur. Recréer le conteneur MinIO après modification.
- Limite par défaut : 20 Mio ; signatures valables 300 secondes (maximum 3600).

Les routes sous `/organization/files` utilisent la session et `X-Organization-ID`.
Les mutations exigent également le jeton CSRF habituel.

| Route | Usage |
| --- | --- |
| `POST /uploads` | `{filename, content_type, size_bytes}` → métadonnées et formulaire signé `{url, fields, expires_in}` |
| `POST /{id}/complete` | Vérifie taille/type stockés, puis copie conditionnelle vers une clé définitive |
| `GET ?offset=0&limit=50` | Liste des fichiers disponibles de l'organisation, limite maximale 100 |
| `GET /{id}/download` | URL signée de téléchargement, non mise en cache par l'API |
| `GET /{id}/download?preview=true` | Affichage inline pour PNG/JPEG/GIF/WebP/AVIF ; autres types téléchargés |
| `DELETE /{id}` | Supprime les objets et marque les métadonnées supprimées |

Envoyer le formulaire directement à MinIO en `multipart/form-data`, avec les champs
signés puis le champ `file` en dernier, sans cookies applicatifs ni jeton CSRF.
Appeler ensuite `/complete`. Le fichier est visible seulement après validation.
Le client réutilisable `frontend/src/features/files/api.ts` réalise ce flux et
conserve explicitement l'organisation sélectionnée au début de l'envoi.
Les composants métier peuvent conserver l'identifiant du fichier et redemander une
URL lorsqu'ils en ont besoin ; ne pas enregistrer d'URL signée en base.

Tout membre actif peut lire et déposer dans son organisation. Seul l'auteur peut
finaliser ; l'auteur ou un administrateur peut supprimer. Les superadministrateurs
peuvent aussi effectuer ces opérations. Une organisation ayant des métadonnées de
fichiers ne peut pas être supprimée physiquement (clé étrangère RESTRICT).

Les métadonnées MIME sont déclaratives : aucune analyse antivirus ni transformation
d'image n'est effectuée. Une URL signée reste utilisable jusqu'à expiration tant que
l'objet existe. Les copies temporaires expirent via MinIO, mais les métadonnées des
dépôts abandonnés restent en état `pending`. La migration est fournie ; elle n'est
pas appliquée automatiquement au démarrage de l'API.

Références : [MinIO Docker](https://github.com/minio/minio/blob/master/docs/docker/README.md),
[formulaires et URL signés Boto3](https://docs.aws.amazon.com/boto3/latest/guide/s3-presigned-urls.html).

### Champs image des fiches

Les formulaires de création et de modification proposent le choix d'un fichier,
le glisser-déposer, l'aperçu, le remplacement et le retrait de l'image. Ils bloquent
l'enregistrement pendant le dépôt. Formats pris en charge : PNG, JPEG, GIF, WebP,
AVIF. Les anciennes URL HTTPS et chemins applicatifs restent lisibles.

La valeur durable d'un champ image est `file:<UUID>` ; aucune URL signée n'est
stockée dans la fiche. À chaque création ou modification, l'API vérifie que le
fichier est prêt, possède un type MIME image accepté et appartient à l'organisation
courante. Le verrou du fichier reste acquis jusqu'à l'enregistrement de la fiche.
Une suppression de fichier encore référencé renvoie 409. Retirer ou remplacer une
image dans un champ ne supprime pas le fichier, qui peut être partagé par plusieurs
fiches. Un dépôt terminé puis abandonné dans le formulaire reste dans la liste des
fichiers de l'organisation.

Les tableaux, détails et profils d'affichage demandent une URL signée à partir de
cette référence et la renouvellent avant son expiration.

## Profils utilisateur par organisation

Les prénom et nom sont stockés sur `organization_memberships`, indépendamment du
compte global. Un administrateur les modifie via **Utilisateurs → Actions → Modifier
le profil**. L'API correspondante est `PUT /organization/users/{user_id}/profile`,
avec `{first_name, last_name}`, la session, le jeton CSRF et `X-Organization-ID`.
Les deux valeurs sont requises dans la requête et peuvent être vides pour revenir
à l'affichage de l'email. Elles sont limitées à 100 caractères et nettoyées des
espaces en début et fin.

Les détails présentent d'abord les champs métier puis les champs système. Les
auteurs sont affichés avec leur prénom et nom dans cette organisation, sinon leur
email. Les UUID restent les valeurs stockées et les valeurs brutes de l'API ;
`display_value` fournit leur libellé dans le détail. Les tableaux et profils
d'affichage utilisent le même libellé. Un auteur sans appartenance dans
l'organisation (par exemple un administrateur de plateforme) utilise son email.
Les membres suspendus conservent leur nom dans l'historique.

Appliquer la migration `c92f15a7b301` depuis `backend` après synchronisation des
dépendances par le développeur : `uv run --no-sync alembic upgrade head`.
