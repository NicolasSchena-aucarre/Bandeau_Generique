/* ==========================================================
   bandeau.js — bandeau « portail » au carré, autonome.

   UTILISATION (dans le <head> du widget hôte, après grist-plugin-api.js) :

     <script src="https://<compte>.github.io/<depot>/bandeau.js"></script>

   Et, côté widget hôte, l'accès complet au document est OBLIGATOIRE :

     grist.ready({ requiredAccess: "full" });

   Le bandeau n'appelle JAMAIS grist.ready lui-même.

   TOUT SE RÈGLE DANS LES TABLES DU DOCUMENT GRIST (voir DOCUMENTATION) :
     Menu    (1re ligne) : Titre, Logo, Icone, CouleurFond, CouleurTexte,
                           CouleurBordure, CouleurSurvol, CouleurAccent,
                           Police, TaillePolice, HauteurLogo, HauteurBandeau,
                           AlignTitre, OmbreMenu, Sticky, LienLogo
     Widget  (1 ligne/lien): Titre, Url, Ordre, Actif, Role, Cible, Icone, Groupe
     User    (facultative) : Role, Email — sert uniquement à filtrer les liens
                             par rôle (colonne Widget.Role).

   OPTION (attribut data-* du <script>, facultatif) :
     data-cible   Sélecteur CSS du conteneur d'accueil (défaut : début de <body>).

   RÈGLES GÉNÉRALES
   - Une cellule vide = apparence de la charte au carré. Exception : les
     colonnes booléennes (Actif, OmbreMenu, Sticky), où « décoché » = désactivé.
   - Aucune valeur par défaut visible : ni logo ni titre dans ce fichier. Le
     contenu reste masqué tant que la table Menu n'est pas chargée.
   - Toute colonne absente ou invalide est ignorée : le bandeau ne bloque
     jamais le widget hôte.
   - Pour ajouter une variable : une entrée dans COL, une ligne dans
     appliquerMenu() (ou dans la lecture des liens), et si besoin une
     variable CSS --pm-* dans CSS.
   ========================================================== */
(function () {
  "use strict";

  var VERSION = "2026-10-06-variables";
  console.info("[bandeau] version " + VERSION);

  // ---- Configuration (seul endroit à éditer pour renommer tables/colonnes) --
  var TABLE_MENU = "Menu";
  var TABLE_WIDGET = "Widget";
  var TABLE_USER = "User";
  var COL = {
    // Menu
    titre: "Titre", logo: "Logo", icone: "Icone",
    fond: "CouleurFond", texte: "CouleurTexte", bordure: "CouleurBordure",
    survol: "CouleurSurvol", accent: "CouleurAccent",
    police: "Police", taillePolice: "TaillePolice",
    hauteurLogo: "HauteurLogo", hauteurBandeau: "HauteurBandeau",
    alignTitre: "AlignTitre", ombre: "OmbreMenu", sticky: "Sticky", lienLogo: "LienLogo",
    // Widget (« icone » est partagée avec Menu : même nom, tables différentes)
    url: "Url", ordre: "Ordre", actif: "Actif", role: "Role", cible: "Cible", groupe: "Groupe",
    // User
    userRole: "Role", userEmail: "Email"
  };
  var ATTENTE_GRIST_MS = 10000; // durée max d'attente de l'API Grist
  var PAS_ATTENTE_MS = 250;
  var POLICES = { // liste fermée : nom (sans accents, minuscule) -> pile de polices
    "montserrat": "Montserrat,system-ui,sans-serif",
    "arial": "Arial,Helvetica,sans-serif",
    "helvetica": "Helvetica,Arial,sans-serif",
    "verdana": "Verdana,Geneva,sans-serif",
    "trebuchet ms": "'Trebuchet MS',Helvetica,sans-serif",
    "georgia": "Georgia,'Times New Roman',serif",
    "times new roman": "'Times New Roman',Times,serif",
    "courier new": "'Courier New',Courier,monospace",
    "monospace": "ui-monospace,Menlo,Consolas,monospace",
    "systeme": "system-ui,-apple-system,'Segoe UI',sans-serif",
    "system": "system-ui,-apple-system,'Segoe UI',sans-serif"
  };
  var ALIGNEMENTS = {
    gauche: "left", left: "left", centre: "center", center: "center", droite: "right", right: "right"
  };
  // --------------------------------------------------------------------------

  var script = document.currentScript;
  var opt = (script && script.dataset) || {};

  var CSS = [
    ":host{display:block;position:sticky;top:0;z-index:20;",
    "--ac-black:#090c0b;--ac-turquoise:#45f8cf;--ac-orange:#f77245;--ac-yellow:#fcfc0b;",
    "--ac-grey-dark:#59736e;--ac-grey-light:#f2f2f2;--ac-off-white:#f3f6f6;--ac-white:#fff;",
    "font-family:var(--pm-police,Montserrat,system-ui,sans-serif)}",
    "*{box-sizing:border-box}",
    ".pm-header{background:var(--pm-fond,var(--ac-white));color:var(--pm-texte,var(--ac-black));padding:0 24px;border-bottom:1.5px solid var(--pm-bordure,var(--ac-black))}",
    ".pm-header-inner{max-width:1240px;margin:0 auto;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:24px;min-height:var(--pm-hauteur-bandeau,72px);padding:8px 0;visibility:hidden}",
    ".pm-pret .pm-header-inner{visibility:visible}",
    ".pm-brand{display:flex;align-items:center}",
    ".pm-brand-lien{display:flex;align-items:center;color:inherit}",
    ".pm-brand-logo{height:var(--pm-hauteur-logo,60px);width:auto;flex:none;display:block}",
    ".pm-brand-logo[hidden]{display:none}",
    ".pm-titre{margin:0;text-align:var(--pm-align-titre,center);font-size:var(--pm-taille-police,16px);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".pm-burger-wrap{position:relative;justify-self:end}",
    ".pm-burger-btn{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:6px;border-radius:8px;cursor:pointer;background:none;border:none;transition:background .15s ease;color:inherit;font:inherit}",
    ".pm-burger-btn:hover,.pm-burger-btn:focus-visible{background:var(--pm-survol,var(--ac-off-white))}",
    ".pm-burger-icone{max-width:100%;max-height:100%;display:block}",
    ".pm-burger-repli{font-size:26px;line-height:1;color:var(--pm-accent,currentColor)}",
    ".pm-portail-menu{position:absolute;top:calc(100% + 8px);right:0;z-index:50;min-width:220px;max-width:min(90vw,360px);background:var(--pm-fond,var(--ac-white));color:var(--pm-texte,var(--ac-black));border:1.5px solid var(--pm-bordure,var(--ac-black));border-radius:8px;box-shadow:4px 4px 0 var(--pm-bordure,var(--ac-black));padding:8px}",
    ".pm-sans-ombre .pm-portail-menu{box-shadow:none}",
    ".pm-portail-menu[hidden]{display:none}",
    ".pm-portail-menu a{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;text-decoration:none;color:var(--pm-texte,var(--ac-black));font-size:13.5px;font-weight:500}",
    ".pm-portail-menu a:hover,.pm-portail-menu a:focus-visible{background:var(--pm-survol,var(--ac-grey-light))}",
    ".pm-lien-icone{width:18px;height:18px;object-fit:contain;flex:none}",
    ".pm-groupe{margin:8px 10px 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--pm-accent,var(--ac-grey-dark))}",
    ".pm-portail-vide{padding:8px 10px;font-size:13px;color:var(--pm-texte,var(--ac-grey-dark));margin:0}"
  ].join("");

  // ---------- Utilitaires ----------
  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    for (var k in (attrs || {})) n.setAttribute(k, attrs[k]);
    return n;
  }

  // fetchTable renvoie un objet « colonnes » {id:[…], Titre:[…]} -> tableau de lignes.
  function lignes(table) {
    if (!table || !table.id) return [];
    return table.id.map(function (_, i) {
      var l = {};
      for (var c in table) l[c] = table[c][i];
      return l;
    });
  }

  // Valeur d'une colonne, sans tenir compte de la casse (« Url » = « URL »).
  function champ(ligne, nom) {
    if (!ligne) return undefined;
    if (nom in ligne) return ligne[nom];
    var cible = nom.toLowerCase();
    for (var k in ligne) if (k.toLowerCase() === cible) return ligne[k];
    return undefined;
  }

  // minuscule, sans accents ni espaces superflus (comparaison de listes de choix).
  function normaliser(s) {
    return String(s == null ? "" : s).trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // Choice List : ["L","Manager","Collaborateur"] (ou tableau nu) -> valeurs normalisées.
  function listeValeurs(v) {
    if (typeof v === "string") v = [v];
    if (!Array.isArray(v)) return [];
    var vals = v[0] === "L" ? v.slice(1) : v;
    return vals.map(normaliser).filter(Boolean);
  }

  // Pièce jointe : ["L", 12, 13] (ou [12, 13]) -> 12 ; sinon null.
  function premierIdPieceJointe(v) {
    if (!Array.isArray(v)) return null;
    var ids = v[0] === "L" ? v.slice(1) : v;
    return typeof ids[0] === "number" ? ids[0] : null;
  }

  function urlPieceJointe(v, jeton) {
    var id = premierIdPieceJointe(v);
    if (id === null || !jeton) return null;
    return jeton.baseUrl + "/attachments/" + id + "/download?auth=" + encodeURIComponent(jeton.token);
  }

  // Seuls http(s) sont acceptés comme cible de lien.
  function urlSure(u) {
    return typeof u === "string" && /^https?:\/\//i.test(u.trim()) ? u.trim() : null;
  }

  // Couleur : #rgb ou #rrggbb uniquement (jamais de CSS libre) -> "#rrggbb" ou null.
  function couleurSure(v) {
    if (typeof v !== "string") return null;
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
    if (!m) return null;
    var h = m[1].toLowerCase();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return "#" + h;
  }
  function rgb(hex) {
    return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)];
  }
  function luminance(hex) {
    var c = rgb(hex).map(function (x) {
      x /= 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contraste(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  // Nombre borné dans [min, max], sinon null.
  function nombreBorne(v, min, max) {
    return typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
  }

  // Attend que grist.docApi soit utilisable (le widget hôte appelle grist.ready).
  function attendreGrist() {
    return new Promise(function (resolve, reject) {
      var ecoule = 0;
      (function essai() {
        if (window.grist && window.grist.docApi && window.grist.docApi.fetchTable) return resolve(window.grist);
        ecoule += PAS_ATTENTE_MS;
        if (ecoule >= ATTENTE_GRIST_MS) return reject(new Error("API Grist indisponible"));
        setTimeout(essai, PAS_ATTENTE_MS);
      })();
    });
  }

  // Jeton d'accès aux pièces jointes : demandé une seule fois, partagé.
  var jetonPromesse = null;
  function jeton(grist) {
    if (!jetonPromesse) jetonPromesse = grist.docApi.getAccessToken({ readOnly: true });
    return jetonPromesse;
  }

  // ---------- Construction du bandeau ----------
  function construire() {
    if (document.getElementById("pm-bandeau")) return;

    var host = el("div", null, { id: "pm-bandeau" });
    var root = host.attachShadow({ mode: "open" });
    var style = el("style");
    style.textContent = CSS;

    var header = el("header", "pm-header");
    var inner = el("div", "pm-header-inner");

    // Gauche : logo (cliquable seulement si Menu.LienLogo est renseigné)
    var brand = el("div", "pm-brand");
    var logoLien = el("a", "pm-brand-lien");
    var logo = el("img", "pm-brand-logo", { alt: "Logo" });
    logo.hidden = true; // affiché seulement quand Menu.Logo est chargé
    logoLien.appendChild(logo);
    brand.appendChild(logoLien);

    // Centre : titre
    var titre = el("p", "pm-titre");

    // Droite : burger + menu
    var wrap = el("div", "pm-burger-wrap");
    var btn = el("button", "pm-burger-btn", {
      type: "button", "aria-label": "Menu", "aria-expanded": "false"
    });
    var repli = el("span", "pm-burger-repli", { "aria-hidden": "true" });
    repli.textContent = "☰";
    btn.appendChild(repli);

    var menu = el("div", "pm-portail-menu");
    menu.hidden = true;
    var etatMenu = el("p", "pm-portail-vide");
    etatMenu.textContent = "Chargement…";
    menu.appendChild(etatMenu);

    wrap.appendChild(btn);
    wrap.appendChild(menu);

    inner.appendChild(brand);
    inner.appendChild(titre);
    inner.appendChild(wrap);
    header.appendChild(inner);
    root.appendChild(style);
    root.appendChild(header);

    function basculer(ouvrir) {
      menu.hidden = !ouvrir;
      btn.setAttribute("aria-expanded", ouvrir ? "true" : "false");
    }
    btn.addEventListener("click", function (e) { e.stopPropagation(); basculer(menu.hidden); });
    document.addEventListener("click", function () { basculer(false); });
    root.addEventListener("click", function (e) {
      if (!menu.contains(e.target) && !btn.contains(e.target)) basculer(false);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") basculer(false); });

    var parent = (opt.cible && document.querySelector(opt.cible)) || document.body;
    parent.insertBefore(host, parent.firstChild);

    charger({
      host: host, header: header, logoLien: logoLien, logo: logo,
      titre: titre, btn: btn, repli: repli, menu: menu
    });
  }

  // ---------- Menu déroulant ----------
  function remplirMenu(menu, liens) {
    menu.textContent = "";
    if (!liens.length) {
      var v = el("p", "pm-portail-vide");
      v.textContent = "Aucun outil configuré.";
      menu.appendChild(v);
      return;
    }
    // Regroupement : liens sans groupe d'abord, puis chaque groupe dans l'ordre d'apparition.
    var ordreGroupes = [], parGroupe = {};
    liens.forEach(function (l) {
      var g = l.groupe || "";
      if (!(g in parGroupe)) { parGroupe[g] = []; ordreGroupes.push(g); }
      parGroupe[g].push(l);
    });
    ordreGroupes.sort(function (a, b) { return (a === "" ? 0 : 1) - (b === "" ? 0 : 1); });
    ordreGroupes.forEach(function (g) {
      if (g) {
        var h = el("div", "pm-groupe");
        h.textContent = g;
        menu.appendChild(h);
      }
      parGroupe[g].forEach(function (o) {
        var a = el("a", null, { href: o.url, target: o.cible, rel: "noopener" });
        if (o.iconeUrl) {
          var ic = el("img", "pm-lien-icone", { src: o.iconeUrl, alt: "" });
          ic.addEventListener("error", function () { if (ic.parentNode) ic.parentNode.removeChild(ic); });
          a.appendChild(ic);
        }
        var t = el("span");
        t.textContent = o.titre;
        a.appendChild(t);
        menu.appendChild(a);
      });
    });
  }

  function menuIndisponible(menu) {
    menu.textContent = "";
    var v = el("p", "pm-portail-vide");
    v.textContent = "Liste indisponible.";
    menu.appendChild(v);
  }

  // Rôle de la personne connectée : 1re ligne de User dont l'Email est lisible
  // (règle d'accès Grist masquant l'Email des autres). null si indéterminé.
  function chargerRole(grist) {
    return grist.docApi.fetchTable(TABLE_USER).then(function (t) {
      var moi = lignes(t).filter(function (l) {
        var e = champ(l, COL.userEmail);
        return typeof e === "string" && e.length > 0;
      })[0];
      var r = moi ? champ(moi, COL.userRole) : null;
      return typeof r === "string" && r.trim() ? normaliser(r) : null;
    }).catch(function (e) {
      console.warn("[bandeau] table " + TABLE_USER + " (rôle) :", e);
      return null;
    });
  }

  // ---------- Table Widget -> liens ----------
  function chargerLiens(grist, ui) {
    return grist.docApi.fetchTable(TABLE_WIDGET).then(function (t) {
      var toutes = lignes(t).map(function (l) {
        var cible = normaliser(champ(l, COL.cible));
        return {
          titre: String(champ(l, COL.titre) || "").trim(),
          url: urlSure(champ(l, COL.url)),
          ordre: champ(l, COL.ordre),
          actif: champ(l, COL.actif) !== false, // décoché = masqué ; colonne absente = visible
          roles: listeValeurs(champ(l, COL.role)),
          cible: /(meme|same|self|top)/.test(cible) ? "_top" : "_blank",
          groupe: String(champ(l, COL.groupe) || "").trim(),
          icone: champ(l, COL.icone)
        };
      });
      var valides = toutes.filter(function (l) { return l.titre && l.url && l.actif; });
      if (valides.some(function (l) { return typeof l.ordre === "number"; })) {
        valides.sort(function (a, b) {
          var oa = typeof a.ordre === "number" ? a.ordre : Infinity;
          var ob = typeof b.ordre === "number" ? b.ordre : Infinity;
          return oa - ob;
        });
      }
      var besoinRole = valides.some(function (l) { return l.roles.length > 0; });
      return (besoinRole ? chargerRole(grist) : Promise.resolve(null)).then(function (role) {
        // Lien sans Role = visible par tous ; avec Role = visible si le rôle correspond.
        var visibles = valides.filter(function (l) {
          return !l.roles.length || (role !== null && l.roles.indexOf(role) !== -1);
        });
        if (!visibles.length) {
          console.warn("[bandeau] aucun lien visible dans la table " + TABLE_WIDGET +
            " : " + toutes.length + " ligne(s) ; " + valides.length + " valide(s) (Titre + Url http(s) + Actif coché) ; " +
            "rôle détecté : " + role + ". Colonnes reçues : " + Object.keys(t || {}).join(", "));
        }
        var avecIcone = visibles.some(function (l) { return premierIdPieceJointe(l.icone) !== null; });
        return (avecIcone ? jeton(grist).catch(function () { return null; }) : Promise.resolve(null)).then(function (j) {
          visibles.forEach(function (l) { l.iconeUrl = urlPieceJointe(l.icone, j); });
          remplirMenu(ui.menu, visibles);
        });
      });
    }).catch(function (e) {
      console.warn("[bandeau] table " + TABLE_WIDGET + " :", e);
      menuIndisponible(ui.menu);
    });
  }

  // ---------- Table Menu -> apparence (1re ligne) ----------
  function appliquerMenu(grist, ui, cfg) {
    var h = ui.host;

    // Titre
    var titre = String(champ(cfg, COL.titre) || "").trim();
    if (titre) ui.titre.textContent = titre;

    // Couleurs (cellule vide ou invalide = charte au carré)
    var fond = couleurSure(champ(cfg, COL.fond));
    var texte = couleurSure(champ(cfg, COL.texte));
    var bordure = couleurSure(champ(cfg, COL.bordure));
    var survol = couleurSure(champ(cfg, COL.survol));
    var accent = couleurSure(champ(cfg, COL.accent));
    if (fond && !texte) texte = luminance(fond) > 0.179 ? "#090c0b" : "#ffffff"; // lisibilité automatique
    if (fond && texte && contraste(fond, texte) < 4.5) {
      console.warn("[bandeau] contraste fond/texte insuffisant (" + contraste(fond, texte).toFixed(2) + ":1, minimum RGAA 4,5:1)");
    }
    if (fond && !survol) survol = "rgba(" + rgb(texte).join(",") + ",.10)"; // survol adapté au fond choisi
    if (fond) h.style.setProperty("--pm-fond", fond);
    if (texte) h.style.setProperty("--pm-texte", texte);
    if (bordure) h.style.setProperty("--pm-bordure", bordure);
    if (survol) h.style.setProperty("--pm-survol", survol);
    if (accent) h.style.setProperty("--pm-accent", accent);

    // Police (liste fermée)
    var police = champ(cfg, COL.police);
    if (police) {
      var pile = POLICES[normaliser(police)];
      if (pile) h.style.setProperty("--pm-police", pile);
      else console.warn("[bandeau] police « " + police + " » inconnue. Valeurs acceptées : " + Object.keys(POLICES).join(", "));
    }

    // Dimensions
    var taille = nombreBorne(champ(cfg, COL.taillePolice), 10, 40);
    if (taille !== null) h.style.setProperty("--pm-taille-police", taille + "px");
    var hLogo = nombreBorne(champ(cfg, COL.hauteurLogo), 16, 200);
    if (hLogo !== null) h.style.setProperty("--pm-hauteur-logo", hLogo + "px");
    var hBandeau = nombreBorne(champ(cfg, COL.hauteurBandeau), 40, 200);
    if (hBandeau !== null) h.style.setProperty("--pm-hauteur-bandeau", hBandeau + "px");

    // Alignement du titre
    var align = champ(cfg, COL.alignTitre);
    if (align) {
      var a = ALIGNEMENTS[normaliser(align)];
      if (a) h.style.setProperty("--pm-align-titre", a);
      else console.warn("[bandeau] AlignTitre « " + align + " » inconnu (gauche, centre, droite)");
    }

    // Booléens : décoché = désactivé (cocher pour retrouver le comportement de la charte)
    if (champ(cfg, COL.sticky) === false) h.style.position = "static";
    if (champ(cfg, COL.ombre) === false) ui.header.classList.add("pm-sans-ombre");

    // Lien du logo
    var lien = urlSure(champ(cfg, COL.lienLogo));
    if (lien) {
      ui.logoLien.setAttribute("href", lien);
      ui.logoLien.setAttribute("target", "_blank");
      ui.logoLien.setAttribute("rel", "noopener");
    }

    // Pièces jointes : icône du burger, puis logo (le bandeau attend son téléchargement)
    var aLogo = premierIdPieceJointe(champ(cfg, COL.logo)) !== null;
    var aIcone = premierIdPieceJointe(champ(cfg, COL.icone)) !== null;
    if (!aLogo && !aIcone) return null;
    return jeton(grist).then(function (j) {
      var uIcone = urlPieceJointe(champ(cfg, COL.icone), j);
      if (uIcone) {
        var img = el("img", "pm-burger-icone", { src: uIcone, alt: "" });
        img.addEventListener("error", function () { // icône illisible : retour au glyphe ☰
          if (img.parentNode) img.parentNode.replaceChild(ui.repli, img);
        });
        ui.btn.replaceChild(img, ui.repli);
      }
      var uLogo = urlPieceJointe(champ(cfg, COL.logo), j);
      if (!uLogo) return;
      return new Promise(function (resolve) {
        ui.logo.onload = function () { ui.logo.hidden = false; resolve(); };
        ui.logo.onerror = function () { ui.logo.hidden = true; resolve(); };
        ui.logo.src = uLogo;
      });
    });
  }

  // ---------- Orchestration ----------
  function charger(ui) {
    var affiche = false;
    function afficher() {
      if (affiche) return;
      affiche = true;
      ui.header.classList.add("pm-pret");
    }
    setTimeout(afficher, ATTENTE_GRIST_MS + 5000); // filet de sécurité

    attendreGrist().then(function (grist) {
      chargerLiens(grist, ui); // indépendant : n'empêche jamais l'affichage du bandeau

      return grist.docApi.fetchTable(TABLE_MENU).then(function (t) {
        var cfg = lignes(t)[0];
        if (cfg) return appliquerMenu(grist, ui, cfg);
      }).catch(function (e) {
        console.warn("[bandeau] table " + TABLE_MENU + " :", e);
      });
    }).catch(function (e) {
      console.warn("[bandeau] " + e.message);
      menuIndisponible(ui.menu);
    }).then(afficher);
  }

  if (document.body) construire();
  else document.addEventListener("DOMContentLoaded", construire);
})();
