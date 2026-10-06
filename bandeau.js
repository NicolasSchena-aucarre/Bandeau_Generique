/* ==========================================================
   bandeau.js — bandeau « portail » au carré, autonome.

   UTILISATION (dans le <head> ou le <body> du widget hôte) :

     <script src="https://<compte>.github.io/<depot>/bandeau.js"></script>

   Et, côté widget hôte, l'accès complet au document est OBLIGATOIRE :

     grist.ready({ requiredAccess: "full" });

   Le bandeau n'appelle JAMAIS grist.ready lui-même.

   SOURCES DE DONNÉES (tables du document Grist) :
     Menu    (1re ligne uniquement) : Titre (texte), Logo (pièce jointe), Icone (pièce jointe)
     Widget  (1 ligne par lien)     : Titre (texte), URL (texte), Ordre (numérique, facultatif)

   OPTION (attribut data-* du <script>, facultatif) :
     data-cible   Sélecteur CSS du conteneur d'accueil (défaut : début de <body>).

   AUCUNE VALEUR PAR DÉFAUT VISIBLE : ni logo, ni titre n'existent dans ce
   fichier. Le contenu du bandeau reste masqué tant que la table Menu n'est
   pas chargée (le logo n'apparaît qu'une fois entièrement téléchargé).

   ROBUSTESSE : toute erreur (table absente, jeton refusé, réseau) est
   absorbée. Le bandeau s'affiche alors neutre (sans logo ni titre, avec le
   glyphe ☰) et ne bloque jamais le widget hôte.
   Sans dépendance : n'utilise ni x-dc ni support.js.
   ========================================================== */
(function () {
  "use strict";

  // ---- Configuration (seul endroit à éditer) -------------------------------
  var TABLE_MENU = "Menu";
  var TABLE_WIDGET = "Widget";
  var COL = { titre: "Titre", logo: "Logo", icone: "Icone", url: "URL", ordre: "Ordre" };
  var ATTENTE_GRIST_MS = 10000; // durée max d'attente de l'API Grist
  var PAS_ATTENTE_MS = 250;
  // --------------------------------------------------------------------------

  var VERSION = "2026-10-06-sans-repli";
  console.info("[bandeau] version " + VERSION);

  var script = document.currentScript;
  var opt = (script && script.dataset) || {};

  var CSS = [
    ":host{display:block;position:sticky;top:0;z-index:20;",
    "--ac-black:#090c0b;--ac-turquoise:#45f8cf;--ac-orange:#f77245;--ac-yellow:#fcfc0b;",
    "--ac-grey-dark:#59736e;--ac-grey-light:#f2f2f2;--ac-off-white:#f3f6f6;--ac-white:#fff;",
    "font-family:Montserrat,system-ui,sans-serif}",
    "*{box-sizing:border-box}",
    ".pm-header{background:var(--ac-white);color:var(--ac-black);padding:0 24px;border-bottom:1.5px solid var(--ac-black)}",
    ".pm-header-inner{max-width:1240px;margin:0 auto;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:24px;min-height:72px;padding:8px 0}",
    ".pm-header-inner{visibility:hidden}.pm-pret .pm-header-inner{visibility:visible}",
    ".pm-brand-logo[hidden]{display:none}",
    ".pm-brand{display:flex;align-items:center}",
    ".pm-brand-logo{height:60px;width:auto;flex:none;display:block}",
    ".pm-titre{margin:0;text-align:center;font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".pm-burger-wrap{position:relative;justify-self:end}",
    ".pm-burger-btn{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:6px;border-radius:8px;cursor:pointer;background:none;border:none;transition:background .15s ease;color:inherit;font:inherit}",
    ".pm-burger-btn:hover,.pm-burger-btn:focus-visible{background:var(--ac-off-white)}",
    ".pm-burger-icone{max-width:100%;max-height:100%;display:block}",
    ".pm-burger-repli{font-size:26px;line-height:1}",
    ".pm-portail-menu{position:absolute;top:calc(100% + 8px);right:0;z-index:50;min-width:220px;max-width:min(90vw,360px);background:var(--ac-white);border:1.5px solid var(--ac-black);border-radius:8px;box-shadow:4px 4px 0 var(--ac-black);padding:8px}",
    ".pm-portail-menu[hidden]{display:none}",
    ".pm-portail-menu a{display:block;padding:8px 10px;border-radius:6px;text-decoration:none;color:var(--ac-black);font-size:13.5px;font-weight:500}",
    ".pm-portail-menu a:hover,.pm-portail-menu a:focus-visible{background:var(--ac-grey-light)}",
    ".pm-portail-vide{padding:8px 10px;font-size:13px;color:var(--ac-grey-dark);margin:0}"
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

  // Valeur d'une colonne, sans tenir compte de la casse (« Url » = « URL » = « url »).
  function champ(ligne, nom) {
    if (!ligne) return undefined;
    if (nom in ligne) return ligne[nom];
    var cible = nom.toLowerCase();
    for (var k in ligne) if (k.toLowerCase() === cible) return ligne[k];
    return undefined;
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

  // ---------- Construction du bandeau ----------
  function construire() {
    if (document.getElementById("pm-bandeau")) return;

    var host = el("div", null, { id: "pm-bandeau" });
    var root = host.attachShadow({ mode: "open" });
    var style = el("style");
    style.textContent = CSS;

    var header = el("header", "pm-header");
    var inner = el("div", "pm-header-inner");

    // Gauche : logo (simple affichage)
    var brand = el("div", "pm-brand");
    var logo = el("img", "pm-brand-logo", { alt: "Logo" });
    logo.hidden = true; // affiché seulement quand Menu.Logo est chargé
    brand.appendChild(logo);

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

    charger({ header: header, logo: logo, titre: titre, btn: btn, repli: repli, menu: menu });
  }

  // ---------- Chargement des données ----------
  function remplirMenu(menu, liens) {
    menu.textContent = "";
    if (!liens.length) {
      var v = el("p", "pm-portail-vide");
      v.textContent = "Aucun outil configuré.";
      menu.appendChild(v);
      return;
    }
    liens.forEach(function (o) {
      var a = el("a", null, { href: o.url, target: "_blank", rel: "noopener" });
      a.textContent = o.titre;
      menu.appendChild(a);
    });
  }

  function menuIndisponible(menu) {
    menu.textContent = "";
    var v = el("p", "pm-portail-vide");
    v.textContent = "Liste indisponible.";
    menu.appendChild(v);
  }

  function charger(ui) {
    var affiche = false;
    function afficher() {
      if (affiche) return;
      affiche = true;
      ui.header.classList.add("pm-pret");
    }
    setTimeout(afficher, ATTENTE_GRIST_MS + 5000); // filet de sécurité

    attendreGrist().then(function (grist) {
      // Table Widget -> liens du menu
      grist.docApi.fetchTable(TABLE_WIDGET).then(function (t) {
        var liens = lignes(t).map(function (l) {
          return { titre: String(champ(l, COL.titre) || "").trim(), url: urlSure(champ(l, COL.url)), ordre: champ(l, COL.ordre) };
        }).filter(function (l) { return l.titre && l.url; });
        if (liens.some(function (l) { return typeof l.ordre === "number"; })) {
          liens.sort(function (a, b) {
            var oa = typeof a.ordre === "number" ? a.ordre : Infinity;
            var ob = typeof b.ordre === "number" ? b.ordre : Infinity;
            return oa - ob;
          });
        }
        if (!liens.length) {
          console.warn("[bandeau] aucune ligne valide dans la table " + TABLE_WIDGET +
            ". Colonnes reçues : " + Object.keys(t || {}).join(", ") +
            " ; lignes : " + lignes(t).length + " ; 1re ligne : " + JSON.stringify(lignes(t)[0]));
        }
        remplirMenu(ui.menu, liens);
      }).catch(function (e) {
        console.warn("[bandeau] table " + TABLE_WIDGET + " :", e);
        menuIndisponible(ui.menu);
      });

      // Table Menu -> titre, logo, icône (1re ligne). Le bandeau s'affiche une
      // fois cette configuration appliquée (logo téléchargé compris).
      return grist.docApi.fetchTable(TABLE_MENU).then(function (t) {
        var cfg = lignes(t)[0];
        if (!cfg) return;
        var titre = String(champ(cfg, COL.titre) || "").trim();
        if (titre) ui.titre.textContent = titre;

        var aLogo = premierIdPieceJointe(champ(cfg, COL.logo)) !== null;
        var aIcone = premierIdPieceJointe(champ(cfg, COL.icone)) !== null;
        if (!aLogo && !aIcone) return;

        return grist.docApi.getAccessToken({ readOnly: true }).then(function (jeton) {
          var uIcone = urlPieceJointe(champ(cfg, COL.icone), jeton);
          if (uIcone) {
            var img = el("img", "pm-burger-icone", { src: uIcone, alt: "" });
            img.addEventListener("error", function () { // icône illisible : retour au glyphe ☰
              if (img.parentNode) img.parentNode.replaceChild(ui.repli, img);
            });
            ui.btn.replaceChild(img, ui.repli);
          }
          var uLogo = urlPieceJointe(champ(cfg, COL.logo), jeton);
          if (!uLogo) return;
          return new Promise(function (resolve) {
            ui.logo.onload = function () { ui.logo.hidden = false; resolve(); };
            ui.logo.onerror = function () { ui.logo.hidden = true; resolve(); };
            ui.logo.src = uLogo;
          });
        });
      }).catch(function (e) {
        console.warn("[bandeau] table " + TABLE_MENU + " / pièces jointes :", e);
      });
    }).catch(function (e) {
      console.warn("[bandeau] " + e.message);
      menuIndisponible(ui.menu);
    }).then(afficher);
  }

  if (document.body) construire();
  else document.addEventListener("DOMContentLoaded", construire);
})();
