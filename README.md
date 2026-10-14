# Bandeau de navigation pour Grist

Un bandeau (titre, logo, personne connectée, menu de liens) affiché dans les widgets personnalisés d'un document
Grist, et un configurateur pour le gérer sans toucher au code. Tout est lu dans les tables du document.

## Contenu du dépôt

```
v1/
  bandeau.js            le bandeau, partagé par tous les clients (un seul fichier, sans dépendance)
  configurateur.html    le widget de configuration, à ajouter dans chaque document client
  exemple-widget.html   un widget minimal pour tester le bandeau (à ne pas déployer chez un client)
README.md
```

Les trois fichiers de `v1/` doivent rester **dans le même dossier** : la balise générée par le configurateur
déduit l'adresse de `bandeau.js` de celle du configurateur.

## Publication (GitHub Pages)

1. Réglages du dépôt > Pages > « Deploy from a branch » > branche `main`, dossier `/ (root)`.
2. Attendre le déploiement (onglet Actions), puis vérifier que ces adresses s'ouvrent (le nom du dépôt est sensible à la casse) :
   - `https://<compte>.github.io/<depot>/v1/bandeau.js`
   - `https://<compte>.github.io/<depot>/v1/configurateur.html`
3. GitHub Pages garde les fichiers en cache environ 10 minutes : après une publication, recharger avec Ctrl+F5.

## Règle de version

- `v1/` ne reçoit que des changements **compatibles** : corrections et ajouts qui ne changent pas le comportement
  des widgets déjà équipés (mêmes tables, mêmes colonnes, mêmes clés de `Bandeau_config`).
- Tout changement qui casserait un widget existant va dans un **nouveau dossier** (`v2/`). Chaque client migre quand c'est décidé.
- Le numéro de version est dans `bandeau.js` (`VERSION`) et en pied du configurateur. Dans la console d'un widget : `BandeauMenu.version`.

## Sécurité du dépôt

Le code de `bandeau.js` s'exécute avec l'accès complet dans les documents de tous les clients : qui peut le modifier agit sur tous.
À mettre en place avant le premier client :

- héberger le dépôt dans une **organisation** GitHub, pas sur un compte personnel ;
- **double authentification obligatoire** pour tous les membres ;
- peu de personnes avec droit d'écriture ;
- **protection de la branche `main`** : modification par demande de fusion, avec une relecture obligatoire ;
- ne jamais charger de script d'un autre hébergeur dans ces fichiers.

## Mise en service chez un client (résumé)

1. Dans le document du client : page + widget personnalisé vers `v1/configurateur.html`, accès complet.
2. Configurateur : créer les tables (ou configurer le mapping), remplir la table des personnes, poser la règle d'accès.
3. Onglets « Liens du menu » et « Design ».
4. Onglet « Widgets du document » : ajouter le bandeau aux widgets (bouton pour les Custom Widget Builder, balise à copier pour les autres).
5. « Vérifier l'installation », puis tester avec un compte non propriétaire.

Le détail, pour le client, est dans le mode d'emploi.

## Liste de contrôle avant de publier une modification

À faire sur un document de test, avec un compte propriétaire **et** un compte éditeur :

- [ ] installation sur un document vide, puis sur un document qui a déjà une table de personnes aux colonnes nommées autrement ;
- [ ] ajout, modification, réordonnancement, désactivation et suppression d'un lien (page du document et adresse externe) ;
- [ ] le bandeau s'affiche dans un widget hébergé et dans un Custom Widget Builder (ajout puis retrait) ;
- [ ] filtrage par rôle avec le compte éditeur ; lien vers une page du document ouvert dans le même onglet ;
- [ ] design : aperçu, enregistrement, rechargement du widget ;
- [ ] diagnostic sans erreur ;
- [ ] « Menu indisponible » discret quand une table est absente.

## Migrer les widgets de test

Les widgets de test existants pointent vers la racine du dépôt. Pointer vers `v1/` (le configurateur le fait tout seul
dans la balise qu'il génère), puis supprimer les anciens fichiers de la racine.
