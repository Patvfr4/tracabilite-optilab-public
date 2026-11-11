#!/usr/bin/env python3
"""Publie une copie du dépôt privé vers le dépôt public (Patvfr4/tracabilite-optilab-public).

Le dépôt PRIVÉ reste le dépôt de travail (développement, CI, Cloudflare Pages, sauvegardes).
Le dépôt PUBLIC est une copie mise à jour à chaque version : un commit par publication, sans
l'historique du dépôt privé.

Contenu publié : l'arbre d'un commit du dépôt privé (par défaut origin/main, donc uniquement du
code relu et fusionné), sans les fichiers propres au dépôt privé (EXCLUS) et avec l'allowlist
gitleaks d'un ancien commit privé retirée (sans objet dans l'historique public).

Garde-fous (échec fermé, rien n'est poussé) : chemins interdits, motifs de secrets, fichiers
exclus encore présents. Sans --pousser, rien ne quitte le poste : la copie est préparée dans un
dossier temporaire dont le chemin est affiché.

Usage :
  python .github/scripts/publier_depot_public.py                 # préparer et contrôler
  python .github/scripts/publier_depot_public.py --pousser       # ... puis publier
Options : --ref <commit> (défaut origin/main), --depot <url ou chemin du dépôt public>.
"""
import argparse
import io
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

DEPOT_PUBLIC = 'https://github.com/Patvfr4/tracabilite-optilab-public.git'
# Auteur des commits publics : adresse « noreply » de GitHub, jamais une adresse personnelle.
AUTEUR_NOM = 'Patvfr4'
AUTEUR_COURRIEL = '62609091+Patvfr4@users.noreply.github.com'

# Fichiers propres au dépôt privé.
EXCLUS = {
    # Sur un dépôt public, tout utilisateur GitHub connecté peut télécharger les artifacts :
    # les sauvegardes de la base, même chiffrées, ne tournent que dans le dépôt privé.
    '.github/workflows/db-backup.yml',
    # Le dépôt public est une copie : des PR Dependabot y seraient sans suite.
    '.github/dependabot.yml',
    # Consignes de l'assistant de codage, propres au dépôt de travail.
    'CLAUDE.md',
    # Plan de travail de la V2 (document interne, liens vers des fichiers retirés).
    'docs/v2.md',
}
# Chemins qui ne doivent jamais être publiés (garde-fou, en plus du .gitignore).
INTERDITS = [
    re.compile(r'(^|/)memory/'),
    re.compile(r'(^|/)\.claude/'),
    re.compile(r'^supabase/migrations/'),
    re.compile(r'(^|/)\.env($|\.(?!example$))'),
    re.compile(r'\.(dump|backup|age|pem|key|p12|pfx)$', re.I),
    re.compile(r'(^|/)(id_rsa|id_ed25519)[^/]*$'),
]
# Motifs de secrets (valeurs factices évidentes tolérées).
SECRETS = {
    'jwt': re.compile(r'\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'),
    'cle secrete Supabase': re.compile(r'\bsb_secret_[A-Za-z0-9_-]{10,}'),
    'cle Resend': re.compile(r'\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}'),
    'URL postgres avec mot de passe': re.compile(r'postgres(?:ql)?://[^\s:@/<\[{]+:[^\s@<>\[\]{}]{6,}@'),
    'cle privee age': re.compile(r'AGE-SECRET-KEY-1[0-9A-Z]{20,}'),
    'cle privee': re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'),
    'jeton GitHub': re.compile(r'\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}'),
    'cle secrete Turnstile': re.compile(r'\b0x4AAAAAA[A-Za-z0-9_-]{29,}\b'),
}
FACTICE = re.compile(r'factice|exemple|example|placeholder|dummy|fake|xxxx|<[^>]*>', re.I)
BINAIRES = re.compile(r'\.(png|jpe?g|gif|ico|webp|pdf|woff2?|ttf)$', re.I)


def git(*args, cwd=None, capture=True):
    r = subprocess.run(['git', '-c', 'core.autocrlf=false', *args], cwd=cwd,
                       capture_output=capture, check=False)
    if r.returncode != 0:
        err = (r.stderr or b'').decode('utf-8', 'replace').strip()
        raise SystemExit(f'git {" ".join(args)} : échec ({err})')
    return r.stdout if capture else b''


def exporter(ref, dest):
    """Extrait l'arbre du commit (fichiers suivis seulement) dans dest."""
    archive = git('archive', '--format=tar', ref)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(dest, filter='data')
    for chemin in EXCLUS:
        p = dest / chemin
        if p.exists():
            p.unlink()


def retirer_allowlist_jwt(dest):
    p = dest / '.gitleaks.toml'
    if not p.exists():
        return 'absent'
    texte = p.read_text(encoding='utf-8')
    nouveau = re.sub(r"\n\[\[allowlists\]\]\ndescription = \"Clé anon \(JWT[\s\S]*?paths = \['''\^index\\\.html\$'''\]\n",
                     '\n', texte.replace('\r\n', '\n'))
    if nouveau == texte.replace('\r\n', '\n'):
        return 'déjà absente'
    p.write_text(nouveau, encoding='utf-8', newline='\n')
    return 'retirée'


def controler(dest):
    problemes = []
    fichiers = sorted(str(p.relative_to(dest)).replace('\\', '/') for p in dest.rglob('*') if p.is_file())
    for f in fichiers:
        if f in EXCLUS:
            problemes.append(f'fichier exclu présent : {f}')
        if any(r.search(f) for r in INTERDITS):
            problemes.append(f'chemin interdit : {f}')
        if BINAIRES.search(f):
            continue
        texte = (dest / f).read_text(encoding='utf-8', errors='replace')
        for nom, motif in SECRETS.items():
            for m in motif.finditer(texte):
                if not FACTICE.search(m.group(0)):
                    # Jamais la valeur : le nom du motif et le fichier suffisent.
                    problemes.append(f'{nom} : {f}')
                    break
    return fichiers, problemes


def version(dest):
    m = re.search(r'BETA \d+\.\d+\.\d+', (dest / 'public' / 'index.html').read_text(encoding='utf-8', errors='replace'))
    return m.group(0) if m else 'version inconnue'


def publier(dest, depot, ref, sha, ver):
    travail = Path(tempfile.mkdtemp(prefix='optilab-public-git-'))
    vide = not git('ls-remote', '--heads', depot).strip()
    if vide:
        git('init', '-q', '-b', 'main', cwd=travail)
        git('remote', 'add', 'origin', depot, cwd=travail)
    else:
        git('clone', '-q', '--depth', '1', '--branch', 'main', depot, str(travail))
        for p in travail.iterdir():
            if p.name != '.git':
                shutil.rmtree(p) if p.is_dir() else p.unlink()
    for p in dest.iterdir():
        cible = travail / p.name
        shutil.copytree(p, cible) if p.is_dir() else shutil.copy2(p, cible)
    git('add', '-A', cwd=travail)
    if not vide and not git('status', '--porcelain', cwd=travail).strip():
        print('Rien à publier : la copie publique est déjà à jour.')
        return
    message = (f'Publication {ver} — {date.today().isoformat()}\n\n'
               f'Copie du dépôt de travail au commit {sha[:12]} ({ref}).\n')
    env = dict(os.environ, GIT_AUTHOR_NAME=AUTEUR_NOM, GIT_AUTHOR_EMAIL=AUTEUR_COURRIEL,
               GIT_COMMITTER_NAME=AUTEUR_NOM, GIT_COMMITTER_EMAIL=AUTEUR_COURRIEL,
               GIT_AUTHOR_DATE=datetime.now(timezone.utc).isoformat(),
               GIT_COMMITTER_DATE=datetime.now(timezone.utc).isoformat())
    r = subprocess.run(['git', '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message],
                       cwd=travail, env=env, check=False, capture_output=True)
    if r.returncode != 0:
        raise SystemExit('commit : échec (' + r.stderr.decode('utf-8', 'replace').strip() + ')')
    # Jamais de force : la copie publique ne fait qu'avancer.
    git('push', '-q', 'origin', 'main', cwd=travail, capture=False)
    print(f'Publié sur {depot} (branche main) : {ver}, depuis {sha[:12]}.')
    shutil.rmtree(travail, ignore_errors=True)
    shutil.rmtree(dest, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--ref', default='origin/main')
    ap.add_argument('--depot', default=DEPOT_PUBLIC)
    ap.add_argument('--pousser', action='store_true', help='publier après les contrôles')
    a = ap.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')

    sha = git('rev-parse', '--verify', a.ref + '^{commit}').decode().strip()
    dest = Path(tempfile.mkdtemp(prefix='optilab-public-'))
    exporter(sha, dest)
    etat_allowlist = retirer_allowlist_jwt(dest)
    fichiers, problemes = controler(dest)
    ver = version(dest)
    print(f'Copie préparée : {dest}')
    print(f'Source : {a.ref} ({sha[:12]}), {ver} ; {len(fichiers)} fichiers ; '
          f'exclus : {", ".join(sorted(EXCLUS))} ; allowlist JWT : {etat_allowlist}.')
    if problemes:
        print('ARRÊT — à corriger avant toute publication :')
        for p in problemes:
            print('  -', p)
        sys.exit(1)
    print('Contrôles : aucun chemin interdit, aucun motif de secret.')
    if a.pousser:
        publier(dest, a.depot, a.ref, sha, ver)
    else:
        print('Rien n\'a été poussé (ajouter --pousser pour publier).')


if __name__ == '__main__':
    main()
