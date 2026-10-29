# Frontend MiniApp

React + TypeScript, Vite, TanStack Router / Query / Form et composants shadcn.

## Démarrage local

Depuis `frontend/` :

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Lancer FastAPI sur `http://127.0.0.1:8000` dans un autre terminal.
Ouvrir `http://localhost:3000`. Vite relaie `/api/*` vers le backend en retirant
le préfixe `/api`. Cela permet de conserver cookies et CSRF sur la même origine,
sans configuration CORS supplémentaire en développement.

Les noms du cookie et de l’en-tête CSRF dans `.env` doivent correspondre à ceux
du backend. Les variables `VITE_*` sont publiques : aucun secret ne doit y figurer.
En production, exposer `/api` via le reverse proxy vers FastAPI, avec repli des
routes du frontend vers `index.html` et cookies sécurisés sous HTTPS.

## Session et routes

- `/` vérifie la session puis redirige vers `/login` ou `/home`.
- `/login` est réservé aux visiteurs non connectés.
- Les dossiers `_guest`, `_neutral` et `_protected` définissent des layouts sans
  segment URL. `_guest` réserve le login aux visiteurs, `_neutral` ne pose aucune
  restriction, et `_protected` protège `/home` et les futures pages privées.
  Les gardes sont exportées depuis `features/auth`. Le shell fournit le contexte
  utilisateur et organisation.
- `GET /auth/me` constitue la source de vérité. Les gardes réutilisent la session
  en cache pendant la navigation. Elle est vérifiée au démarrage, puis après une
  minute au retour sur l’onglet ou à la reconnexion réseau, et chaque minute
  tant que le shell est monté.
- Un `401` invalide la session locale et purge les données métier. Un `403` ou une
  panne réseau ne déconnecte pas l’utilisateur.
- Le logout appelle le backend avant de vider le cache. Si le serveur est
  indisponible, une erreur permet de réessayer sans prétendre avoir déconnecté.
- Les contrôles d’autorisation restent impérativement vérifiés par le backend.

## Activation et réinitialisation du mot de passe

- `/activate?token=...` vérifie l’invitation puis permet de définir le mot de passe
  et de vérifier l’adresse du nouveau compte.
- `/reset-password?token=...` vérifie le lien de réinitialisation puis permet de
  remplacer le mot de passe. Le backend révoque les sessions du compte concerné.

Ces pages appartiennent au layout `_neutral` : elles restent accessibles même si
un autre compte est déjà connecté. Aucun login automatique n’est effectué.
Les formulaires exigent 15 à 1024 caractères et une confirmation identique.
Les liens incomplets, invalides, expirés ou déjà utilisés affichent un état dédié ;
une panne réseau permet de réessayer. Les jetons ne sont pas persistés et les
champs sont effacés après succès.

Le backend et le worker doivent utiliser `FRONTEND_BASE_URL=http://localhost:3000`
en local. Redémarrer le worker après modification de son `.env` pour générer les
prochains mails avec la bonne URL. Les anciens mails conservent leur URL initiale.

## Client API

`src/lib/api` expose le client commun. Il transmet les cookies, ajoute le CSRF sur
les méthodes de modification et expose `ApiError` (`status`, `message`, `issues`).
Les requêtes annulables transmettent le signal de TanStack Query :

```ts
api.request<CurrentUser>('/auth/me', { signal })
api.request<void>('/resource', { method: 'POST', body: payload })
```

## Organisation active

`useAuth()` donne accès à `user`, `organization` et `selectOrganization(id)`.
L’organisation choisie doit appartenir à la liste active de `/auth/me`.
Le choix est mémorisé dans `sessionStorage` pour l’onglet et l’utilisateur courant.
Sans choix valide : organisation par défaut, première adhésion, puis aucune.
Aucun cookie de session ni mot de passe n’est stocké dans le navigateur par le code.
Un PlatformAdmin sans adhésion accède au shell en mode plateforme.

Pour une requête métier, inclure **toujours l’ID dans la clé du cache** et dans la
portée de l’appel. Capturer explicitement l’ID garantit qu’un réessai ne change
pas d’organisation après un changement de sélection :

```ts
const { organization } = useAuth()
useQuery({
  queryKey: organizationQueryKey(organization?.id ?? '', 'entities'),
  enabled: !!organization,
  queryFn: ({ signal }) =>
    api.request<Entity[]>('/entities', {
      organizationId: organization!.id,
      organizationScoped: true,
      signal,
    }),
})
```

Les appels globaux (`/auth`, `/platform`) n’ajoutent pas d’organisation.
`organizationScoped: true` sans ID explicite utilise l’organisation active et
refuse l’appel si aucune organisation n’est sélectionnée.

## Administration de la plateforme

Le menu Administration et les routes `/platform/organizations` et `/platform/users`
sont réservés aux SuperUsers. Le backend vérifie également ces droits.

Les tableaux partagent un composant TanStack Table v9, avec pagination et recherche
côté serveur (debounce de 350 ms), taille de page configurable et colonne Actions
à droite. Les colonnes secondaires sont masquées sur les petits écrans.

Les formulaires utilisent TanStack Form et Zod dans des panneaux à droite
(shadcn Sheet), en pleine largeur sur mobile, avec corps défilant et actions en bas.
Leur ouverture et leur fermeture sont animées en 250 ms, sans mouvement lorsque
la préférence de réduction des animations est activée.

La sélection d’organisation utilise `components/inputs/async-combobox.tsx` : un seul
champ, recherche asynchrone avec debounce de 350 ms, cache TanStack Query et
annulation des requêtes obsolètes via AbortSignal. Le composant prend une clé de
cache, une fonction `loadOptions(search, signal)` et une valeur sélectionnée
normalisée `{ value, label, description? }`. Seules les organisations actives sont
proposées ; la valeur soumise reste leur ID, jamais le texte libre. Les organisations peuvent être
créées, modifiées, suspendues/réactivées et supprimées après confirmation. Le refus
de supprimer une organisation qui possède des membres est affiché sans fermer
la confirmation.

Les utilisateurs peuvent être créés avec une adhésion facultative et un rôle dans
l’organisation, puis suspendus/réactivés. La colonne Organisations affiche un compteur ouvrant une liste flottante et
défilante, avec une recherche au-delà de cinq adhésions. Chaque entrée distingue
l’état de l’organisation et l’accès individuel, avec une action pour suspendre
ou réactiver cette seule adhésion. Les restrictions globales du compte restent
indiquées séparément.
Les actions proposent le renvoi du mail d’activation pour les comptes non vérifiés
et un lien de réinitialisation pour les comptes activés. Les toasts distinguent
une demande mise en file d’envoi d’un échec de publication. L’activation par e-mail nécessite le
worker Celery du backend ; une invitation en file n’est pas encore un mail livré.

Les actions des organisations proposent « Ajouter un membre » et celles des
utilisateurs « Lier à une organisation ». Un panneau partagé recherche l’utilisateur
ou l’organisation existante et attribue un rôle Utilisateur (par défaut) ou
Administrateur. Les associations déjà présentes sont désactivées dans la liste,
même si leur accès est suspendu. Le serveur conserve la contrainte d’unicité et
les conflits restent affichés dans le panneau. Après succès, les listes et les
compteurs d’affiliations sont actualisés, avec un toast ciblé.

## Vérification

```powershell
npm test
npm run generate-routes
npx tsc --noEmit
npm run build
```
