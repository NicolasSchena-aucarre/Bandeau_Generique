/* ==========================================================
   bandeau.js — bandeau « portail » au carré, autonome.

   UTILISATION (dans le <head> ou le <body> du widget) :

     <script src="https://nicolasschena-aucarre.github.io/Logo_Aucarre/bandeau.js"
             data-titre="Nom de l'outil"></script>

   OPTIONS (attributs data-* du <script>) :
     data-titre      Nom affiché à côté du logo.            (défaut : "")
     data-logo       URL du logo.                           (défaut : logo.png du dépôt)
     data-cible      Sélecteur CSS du conteneur d'accueil.  (défaut : début de <body>)

   LISTE DES OUTILS : constante OUTILS ci-dessous (seul endroit à éditer).
   Sans dépendance : n'utilise ni x-dc, ni support.js, ni l'API Grist.
   ========================================================== */
(function () {
  "use strict";

  var BASE = "https://nicolasschena-aucarre.github.io/Logo_Aucarre/";

  // ---- À ÉDITER : liste des outils internes -------------------------------
  var OUTILS = [
    // { nom: "Ressources", url: "https://grist.aucarre.tech/o/outils/<docId>/<NomDoc>/p/<page>" }
  ];
  // -------------------------------------------------------------------------

  var script = document.currentScript;
  var titre = (script && script.dataset.titre) || "";
  var logo = (script && script.dataset.logo) || BASE + "logo.png";
  var cible = script && script.dataset.cible;

  var CSS = [
    ":host{display:block;position:sticky;top:0;z-index:20;",
    "--ac-black:#090c0b;--ac-turquoise:#45f8cf;--ac-orange:#f77245;--ac-yellow:#fcfc0b;",
    "--ac-grey-dark:#59736e;--ac-grey-light:#f2f2f2;--ac-off-white:#f3f6f6;--ac-white:#fff;",
    "font-family:Montserrat,system-ui,sans-serif}",
    "*{box-sizing:border-box}",
    ".pm-header{background:var(--ac-white);color:var(--ac-black);padding:0 24px;border-bottom:1.5px solid var(--ac-black)}",
    ".pm-header-inner{max-width:1240px;margin:0 auto;display:flex;align-items:center;gap:24px;min-height:72px;padding:8px 0;flex-wrap:wrap}",
    ".pm-brand{display:flex;align-items:center;gap:12px;position:relative}",
    ".pm-brand-logo{height:60px;width:auto;flex:none;display:block}",
    ".pm-brand-sep{width:1px;height:20px;background:rgba(9,12,11,.18)}",
    ".pm-brand-sub{font-size:14px;font-weight:500}",
    ".pm-brand-menu-wrap{position:relative;display:inline-block}",
    ".pm-brand-logo-btn{display:inline-flex;align-items:center;gap:4px;padding:6px;border-radius:8px;cursor:pointer;background:none;border:none;transition:background .15s ease;font:inherit;color:inherit}",
    ".pm-brand-logo-btn:hover,.pm-brand-logo-btn:focus-visible{background:var(--ac-off-white)}",
    ".pm-chevron{font-size:24px;line-height:1}",
    ".pm-portail-menu{position:absolute;top:calc(100% + 8px);left:0;z-index:50;min-width:220px;background:var(--ac-white);border:1.5px solid var(--ac-black);border-radius:8px;box-shadow:4px 4px 0 var(--ac-black);padding:8px}",
    ".pm-portail-menu[hidden]{display:none}",
    ".pm-portail-menu a{display:block;padding:8px 10px;border-radius:6px;text-decoration:none;color:var(--ac-black);font-size:13.5px;font-weight:500}",
    ".pm-portail-menu a:hover,.pm-portail-menu a:focus-visible{background:var(--ac-grey-light)}",
    ".pm-portail-vide{padding:8px 10px;font-size:13px;color:var(--ac-grey-dark);margin:0}"
  ].join("");

  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    for (var k in (attrs || {})) n.setAttribute(k, attrs[k]);
    return n;
  }

  function construire() {
    if (document.getElementById("pm-bandeau")) return; // déjà injecté

    var host = el("div", null, { id: "pm-bandeau" });
    var root = host.attachShadow({ mode: "open" });

    var style = el("style");
    style.textContent = CSS;

    var header = el("header", "pm-header");
    var inner = el("div", "pm-header-inner");
    var brand = el("div", "pm-brand");
    var wrap = el("span", "pm-brand-menu-wrap");

    var btn = el("button", "pm-brand-logo-btn", {
      type: "button", "aria-label": "Autres outils internes", "aria-expanded": "false"
    });
    var img = el("img", "pm-brand-logo", { src: logo, alt: "au carré" });
    var chev = el("span", "pm-chevron", { "aria-hidden": "true" });
    chev.textContent = "▾";
    btn.appendChild(img);
    btn.appendChild(chev);
    wrap.appendChild(btn);

    var menu = el("div", "pm-portail-menu");
    menu.hidden = true;
    if (OUTILS.length === 0) {
      var vide = el("p", "pm-portail-vide");
      vide.textContent = "Aucun outil configuré.";
      menu.appendChild(vide);
    } else {
      OUTILS.forEach(function (o) {
        var a = el("a", null, { href: o.url, target: "_blank", rel: "noopener" });
        a.textContent = o.nom;
        menu.appendChild(a);
      });
    }
    wrap.appendChild(menu);
    brand.appendChild(wrap);

    if (titre) {
      var sep = el("span", "pm-brand-sep");
      var sub = el("span", "pm-brand-sub");
      sub.textContent = titre;
      brand.appendChild(sep);
      brand.appendChild(sub);
    }

    inner.appendChild(brand);
    header.appendChild(inner);
    root.appendChild(style);
    root.appendChild(header);

    function basculer(ouvrir) {
      menu.hidden = !ouvrir;
      btn.setAttribute("aria-expanded", ouvrir ? "true" : "false");
      chev.textContent = ouvrir ? "▴" : "▾";
    }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      basculer(menu.hidden);
    });
    // Clic ailleurs dans la page (ou Échap) : fermeture.
    document.addEventListener("click", function () { basculer(false); });
    root.addEventListener("click", function (e) {
      if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) basculer(false);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") basculer(false); });

    var parent = (cible && document.querySelector(cible)) || document.body;
    parent.insertBefore(host, parent.firstChild);
  }

  if (document.body) construire();
  else document.addEventListener("DOMContentLoaded", construire);
})();
