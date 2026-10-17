# Backlog — nouvelles fonctionnalités

Ordre = difficulté croissante. Une feature à la fois.
Chaque feature passe par brainstorming → spec → plan → implémentation avant la suivante.

État au 2026-10-17 : les PRs #5 à #9 (spec `specs/2026-06-14-pos-features.md`) ont livré 1 à 7.
Contexte technique : PWA React + localStorage, zéro backend, zéro compte.

| # | Feature | Difficulté | État |
|---|---------|-----------|------|
| 1 | Verrouiller / déverrouiller un événement | ★ | ✅ |
| 2 | Fond de caisse | ★ | ✅ |
| 3 | Écran récap avant paiement | ★★ | ✅ |
| 4 | Catégories (couleur, 1 par article, fond coloré dans Vente, tri) | ★★ | ✅ |
| 5 | Icône par article (icon picker emoji) | ★★ | ✅ |
| 6 | Vente : gros boutons (icône + nom + prix + couleur catégorie) | ★★ | ✅ sauf réglage de taille |
| 6b | Vente : réglage de la taille des boutons (petit / moyen / grand) | ★ | à faire |
| 7 | Comptage de caisse (onglet Caisse, rapprochement avec le rapport) | ★★★ | ✅ |
| 8 | Sync multi-tablettes même utilisateur | ★★★★★ | partiel : même appareil seulement |

## Reste à faire

### 6b. Réglage de taille des boutons Vente ★
- Demandé : « bouton pour augmenter la taille ». Les gros boutons existent, pas le réglage.
- Proposition : 3 tailles (S / M / L), persistées en local (`ui:sellSize`), réglage dans le tiroir ou en haut de Vente.

### 8. Sync multi-tablettes ★★★★★
- Fait : sync entre onglets / fenêtres / PWA installée **du même appareil** via `storage` events, identité utilisateur locale (`app:user`).
- Manque : sync **entre appareils**. Impose un backend (Supabase / Firebase), un compte utilisateur, de la sync temps réel, et une gestion hors-ligne + conflits.
- À brainstormer à part. Questions ouvertes : nombre de tablettes, réseau sur place (wifi / 4G / rien), que faire quand une tablette est hors-ligne, qui tranche en cas de conflit.
