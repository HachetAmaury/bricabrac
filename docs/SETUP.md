# Installation et déploiement

Backend : Supabase (projet `bkppqrnfxyacngmmamkw`) pour l'authentification, Postgres, Realtime et la file d'envoi hors-ligne. Spec : `docs/superpowers/specs/2026-10-17-supabase-auth-sync-design.md`.

## Variables d'environnement

Fichier `.env` à la racine (ignoré par git, ne jamais le committer) :

```
VITE_SUPABASE_URL=https://bkppqrnfxyacngmmamkw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<clé publishable>
SUPABASE_SERVICE_ROLE_KEY=<clé service_role>
```

- `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` sont publiques et embarquées dans le build.
- `SUPABASE_SERVICE_ROLE_KEY` est un secret serveur, utilisé uniquement par le script d'administration. Ne l'ajoutez ni à Vercel ni à GitHub.

## Créer le premier administrateur

```
npm run admin:create -- <email> <mot de passe> "<nom>"
```

Les comptes suivants se créent depuis l'écran Administration de l'application.

## Réglages du tableau de bord Supabase

À faire une fois par le propriétaire du projet :

- Désactiver les inscriptions publiques : Authentication → Sign In / Providers → Email → « Allow new users to sign up » désactivé.

## Migrations

Les migrations SQL sont dans `supabase/migrations`. Elles s'appliquent dans l'ordre des noms de fichier, via le CLI (`supabase db push --project-ref bkppqrnfxyacngmmamkw`) ou via le MCP Supabase (`apply_migration`).

## Edge function `admin-users`

```
supabase functions deploy admin-users --project-ref bkppqrnfxyacngmmamkw
```

Le déploiement peut aussi se faire via le MCP Supabase (`deploy_edge_function`).

## Déploiement

- **Vercel** (projet `bricabrac`) : variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` définies pour Production et Preview (`vercel env ls` pour vérifier). Un redéploiement est nécessaire après toute modification.
- **GitHub Pages** : le workflow `.github/workflows/deploy.yml` lit les secrets de dépôt `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` (`gh secret set NOM --body "valeur"`, `gh secret list`). Node 22 est requis par `@supabase/supabase-js`.

## Tests

- Unitaires : `npm test`
- Bout en bout, avec un compte existant : `E2E_EMAIL=… E2E_PASSWORD=… npm run e2e`. Sans ces variables, les specs sont ignorées.
- Les specs créent un catalogue et un événement nommés `E2E <horodatage>` dans le vrai projet, puis les suppriment à la fin. Un échec en cours de route peut laisser ces données : supprimez-les depuis l'application.
