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
docker compose --env-file backend/.env -f infra/compose.yaml up -d postgres redis mailpit
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
