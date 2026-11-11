#!/usr/bin/env python3
"""Contrôle CI (job « client ») : scripts tiers de public/ épinglés et intègres.

Tout script servi par une autre origine (CDN) doit être épinglé sur une
version EXACTE et accompagné d'une empreinte d'intégrité (SRI). Sinon, le code
exécuté dans la session des utilisateurs peut changer sans modification du
dépôt (version en intervalle, « @2 ») ou être remplacé sur le CDN sans que le
navigateur le refuse (pas d'empreinte).

Règles, hors public/lib/ (copies locales servies par notre propre origine) :
  HTML  chaque <script src="https://…"> porte une version X.Y.Z exacte,
        integrity="sha256|384|512-…" et crossorigin (sans crossorigin, le
        navigateur ne peut pas vérifier l'empreinte d'une autre origine) ;
  JS    (fichiers .js et scripts en ligne des pages HTML)
        · aucun import()/import … from vers une URL http(s) : un module
          importé ainsi ne peut pas porter d'empreinte ;
        · chaque URL http(s) de script (fichier .js/.mjs ou CDN npm) figure
          dans un objet { src: '…@X.Y.Z…', integrity: 'sha384-…' } ;
        · chaque loadScriptOnce(LIB_X.src …) d'une bibliothèque distante
          passe aussi LIB_X.integrity.
Exception unique : l'API Cloudflare Turnstile, que Cloudflare impose de charger
depuis challenges.cloudflare.com sans épinglage ni copie (pas de SRI possible).

Usage : python3 .github/scripts/verif_scripts_tiers.py [dossier public]
Sortie : annotations GitHub (::error file=…,line=…::…), code 1 si un écart.
"""
import os
import re
import sys

RACINE = sys.argv[1] if len(sys.argv) > 1 else "public"
EXCLUS = {os.path.normpath(os.path.join(RACINE, "lib"))}

# Seule exception : Cloudflare interdit d'épingler ou de copier api.js.
EXCEPTIONS = ("https://challenges.cloudflare.com/turnstile/v0/api.js",)

# Hôtes de CDN de paquets : toute URL vers eux est traitée comme un script.
CDN = ("cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "esm.sh",
       "cdn.skypack.dev", "ga.jspm.io", "esm.run", "deno.land")

VERSION_EXACTE = re.compile(r"(?:@|/)v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?(?=/|$|[?#])")
SRI = r"sha(?:256|384|512)-[A-Za-z0-9+/]{40,}={0,2}"
SRI_ATTR = re.compile(r"""\bintegrity\s*=\s*["']\s*""" + SRI + r"""\s*["']""", re.I)
SRI_JS = re.compile(r"""\bintegrity\s*:\s*['"]""" + SRI + r"""['"]""")
CROSSORIGIN = re.compile(r"\bcrossorigin\b", re.I)
BALISE_SCRIPT = re.compile(r"<script\b([^>]*)>(.*?)</script\s*>", re.I | re.S)
SRC_ATTR = re.compile(r"""\bsrc\s*=\s*["']([^"']+)["']""", re.I)
IMPORT_DISTANT = re.compile(
    r"""\bimport\s*\(\s*['"`]\s*(?:https?:)?//"""          # import('https://…')
    r"""|\bfrom\s*['"](?:https?:)?//"""                     # import … from 'https://…'
    r"""|^\s*import\s*['"](?:https?:)?//""",                # import 'https://…'
    re.M)
URL_LITTERALE = re.compile(r"""(['"`])((?:https?:)?//[^'"`\s]+)\1""")
APPEL_LOAD = re.compile(r"(?<!function )\bloadScriptOnce\s*\(\s*([^,)]*?)\s*(?:,\s*([^)]*?))?\s*\)")
DEF_LIB = re.compile(r"\b(?:var|let|const)\s+(LIB_\w+)\s*=\s*\{([^}]*)\}", re.S)
SRC_LIB = re.compile(r"""\bsrc\s*:\s*['"]([^'"]+)['"]""")

erreurs = []


def ligne_de(texte, pos):
    return texte.count("\n", 0, pos) + 1


def en_commentaire(texte, pos):
    """Vrai si pos est dans un commentaire JS (// ou /* */) : la prose qui
    cite une URL ou loadScriptOnce() n'est pas du code. Heuristique simple :
    elle peut manquer un cas, pas en inventer un."""
    debut_ligne = texte.rfind("\n", 0, pos) + 1
    prefixe = texte[debut_ligne:pos].lstrip()
    if prefixe.startswith(("//", "/*", "*")):
        return True
    return texte.rfind("/*", 0, pos) > texte.rfind("*/", 0, pos)


def sans_commentaires_html(texte):
    """Retire les commentaires HTML en gardant les sauts de ligne (numéros de
    ligne inchangés) : une balise <script> commentée n'est pas chargée."""
    return re.sub(r"<!--.*?-->", lambda m: "\n" * m.group(0).count("\n"), texte, flags=re.S)


def erreur(chemin, ligne, message):
    erreurs.append((chemin, ligne, message))


def est_distante(url):
    return bool(re.match(r"(?:https?:)?//", url, re.I))


def est_script(url):
    sans_requete = re.split(r"[?#]", url, maxsplit=1)[0]
    hote = re.sub(r"^(?:https?:)?//", "", url, flags=re.I).split("/", 1)[0].lower()
    return sans_requete.lower().endswith((".js", ".mjs")) or hote in CDN


def exception(url):
    return any(url.startswith(e) for e in EXCEPTIONS)


def verifier_url(chemin, ligne, url):
    """Version exacte et https pour une URL de script distante."""
    if url.lower().startswith("http://") or url.startswith("//"):
        erreur(chemin, ligne, f"script tiers sans https : {url}")
    if not VERSION_EXACTE.search(url):
        erreur(chemin, ligne, f"script tiers sans version exacte X.Y.Z : {url}")


def verifier_js(chemin, texte, decalage=0, source=None):
    """Règles JS ; decalage/source : position d'un script en ligne dans sa page."""
    source = source if source is not None else texte

    def ligne(pos):
        return ligne_de(source, decalage + pos)

    for m in IMPORT_DISTANT.finditer(texte):
        if en_commentaire(texte, m.start()):
            continue
        erreur(chemin, ligne(m.start()), "import() ou import … from vers une URL distante : impossible d'y attacher une empreinte SRI (copier dans public/lib/ ou passer par loadScriptOnce avec empreinte)")
    for m in URL_LITTERALE.finditer(texte):
        url = m.group(2)
        if not est_script(url) or exception(url) or en_commentaire(texte, m.start()):
            continue
        verifier_url(chemin, ligne(m.start()), url)
        # L'empreinte doit être déclarée dans le même objet littéral { … }.
        debut = texte.rfind("{", 0, m.start())
        fin = texte.find("}", m.end())
        objet = texte[debut:fin + 1] if debut >= 0 and fin >= 0 else ""
        if not SRI_JS.search(objet):
            erreur(chemin, ligne(m.start()), f"script tiers sans empreinte : déclarer {{ src: '…', integrity: 'sha384-…' }} pour {url}")


def collecter_libs(fichiers_js):
    libs = {}
    for chemin, texte in fichiers_js:
        for m in DEF_LIB.finditer(texte):
            s = SRC_LIB.search(m.group(2))
            libs[m.group(1)] = s.group(1) if s else None
    return libs


def verifier_appels(chemin, texte, libs, decalage=0, source=None):
    source = source if source is not None else texte
    for m in APPEL_LOAD.finditer(texte):
        arg1, arg2 = m.group(1).strip(), (m.group(2) or "").strip()
        if not arg1 or en_commentaire(texte, m.start()):
            continue
        n = ligne_de(source, decalage + m.start())
        lib = re.fullmatch(r"(LIB_\w+)\.src", arg1)
        if lib:
            src = libs.get(lib.group(1))
            if src is None:
                erreur(chemin, n, f"loadScriptOnce : {lib.group(1)} introuvable ou sans src littéral")
            elif est_distante(src) and arg2 != f"{lib.group(1)}.integrity":
                erreur(chemin, n, f"loadScriptOnce({arg1}) d'une bibliothèque distante sans {lib.group(1)}.integrity")
        elif re.fullmatch(r"""['"]/[^/][^'"]*['"]""", arg1):
            pass  # copie locale (même origine)
        elif re.fullmatch(r"""['"][^'"]*['"]""", arg1):
            url = arg1[1:-1]
            if est_distante(url) and not re.fullmatch(r"""['"]""" + SRI + r"""['"]""", arg2):
                erreur(chemin, n, f"loadScriptOnce d'une URL distante sans empreinte littérale : {url}")
        else:
            erreur(chemin, n, f"loadScriptOnce({arg1}) : argument non vérifiable (utiliser une constante LIB_* de utils.js)")


def verifier_html(chemin, texte, libs):
    texte = sans_commentaires_html(texte)
    for m in BALISE_SCRIPT.finditer(texte):
        attributs, contenu = m.group(1), m.group(2)
        n = ligne_de(texte, m.start())
        s = SRC_ATTR.search(attributs)
        if s:
            url = s.group(1)
            if not est_distante(url) or exception(url):
                continue
            verifier_url(chemin, n, url)
            if not SRI_ATTR.search(attributs):
                erreur(chemin, n, f"<script> tiers sans integrity=\"sha384-…\" : {url}")
            if not CROSSORIGIN.search(attributs):
                erreur(chemin, n, f"<script> tiers sans crossorigin (l'empreinte ne peut pas être vérifiée) : {url}")
        elif contenu.strip():
            verifier_js(chemin, contenu, m.start(2), texte)
            verifier_appels(chemin, contenu, libs, m.start(2), texte)


def main():
    fichiers = []
    for dossier, sous, noms in os.walk(RACINE):
        sous[:] = sorted(d for d in sous if os.path.normpath(os.path.join(dossier, d)) not in EXCLUS)
        for nom in sorted(noms):
            if nom.endswith((".js", ".mjs", ".html", ".htm")):
                chemin = os.path.join(dossier, nom).replace("\\", "/")
                with open(chemin, encoding="utf-8") as f:
                    fichiers.append((chemin, f.read()))
    if not fichiers:
        print(f"::error::aucun fichier .js ou .html dans {RACINE}")
        return 1
    js = [(c, t) for c, t in fichiers if c.endswith((".js", ".mjs"))]
    libs = collecter_libs(js)
    for chemin, texte in fichiers:
        if chemin.endswith((".html", ".htm")):
            verifier_html(chemin, texte, libs)
        else:
            verifier_js(chemin, texte)
            verifier_appels(chemin, texte, libs)
    for chemin, ligne, message in erreurs:
        print(f"::error file={chemin},line={ligne}::{message}")
    distantes = sorted(n for n, s in libs.items() if s and est_distante(s))
    print(f"{len(fichiers)} fichiers analysés ; bibliothèques distantes déclarées : {', '.join(distantes) or 'aucune'} ; écarts : {len(erreurs)}")
    return 1 if erreurs else 0


if __name__ == "__main__":
    sys.exit(main())
