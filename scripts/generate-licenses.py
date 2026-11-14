#!/usr/bin/env python3
"""Inventory installed/locked package notices without guessing their licenses.

Run from the repository root. No network is used. --collect-python emits a
portable snapshot from the interpreter/environment running this script.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
NOTICE = re.compile(r'(?:^|[-_.])(licen[cs]e|copying|notice)(?:$|[-_.])', re.I)


def collect_python():
    rows = []
    for distribution in sorted(importlib.metadata.distributions(), key=lambda d: (d.metadata['Name'] or '').lower()):
        metadata = distribution.metadata
        classifiers = [v.removeprefix('License :: ') for v in metadata.get_all('Classifier', []) if v.startswith('License :: ')]
        texts = []
        for filename in distribution.files or []:
            name = str(filename)
            if not NOTICE.search(Path(name).name):
                continue
            location = Path(distribution.locate_file(filename))
            if not location.is_file() or location.stat().st_size > 3_000_000:
                continue
            try:
                content = location.read_text(encoding='utf-8')
            except (UnicodeError, OSError):
                continue
            if content.strip():
                texts.append({'path': name, 'text': content})
        expression = metadata.get('License-Expression')
        declared = metadata.get('License')
        # Some Python packages put the full license in the metadata field.
        if declared and ('\n' in declared or len(declared) > 160):
            texts.append({'path': 'METADATA:License', 'text': declared})
            declared = None
        rows.append({'name': metadata['Name'], 'version': distribution.version,
                     'licenseExpression': expression, 'licenseMetadata': declared,
                     'licenseClassifiers': classifiers,
                     'projectURLs': metadata.get_all('Project-URL', []),
                     'homepage': metadata.get('Home-page'), 'notices': texts})
    return {'schemaVersion': 1, 'pythonVersion': sys.version.split()[0], 'packages': rows}


def preserve(content, destination):
    raw = content.encode('utf-8')
    digest = hashlib.sha256(raw).hexdigest()
    filename = digest + '.txt'
    target = destination / filename
    target.write_bytes(raw)
    return {'file': 'texts/' + filename, 'sha256': digest}


def notice_files(folder):
    # Include notices for bundled code under dist/compiled, native libraries,
    # etc.; nested npm packages are inventoried independently from the lock.
    for current, directories, files in os.walk(folder):
        directories[:] = sorted(d for d in directories if d not in {'node_modules', '.git', '__pycache__'})
        for filename in sorted(files):
            if NOTICE.search(filename):
                path = Path(current) / filename
                if path.is_file() and path.stat().st_size <= 3_000_000:
                    yield path


def markdown_escape(value):
    return str(value).replace('|', '\\|').replace('\n', ' ')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--collect-python', action='store_true')
    parser.add_argument('--python-snapshot', action='append', default=[], metavar='JSON')
    parser.add_argument('--fetch-upstream', action='store_true', help='Download the public license URLs in licenses/upstream-sources.json')
    args = parser.parse_args()
    if args.collect_python:
        print(json.dumps(collect_python(), ensure_ascii=False, indent=2))
        return
    out = ROOT / 'licenses'
    if args.fetch_upstream:
        sources = json.loads((out / 'upstream-sources.json').read_text())
        for item in sources:
            target = out / item['file']
            target.parent.mkdir(parents=True, exist_ok=True)
            request = urllib.request.Request(item['url'], headers={'User-Agent': 'Clearroom-license-inventory/1.0'})
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    raw = response.read(3_000_001)
                if len(raw) > 3_000_000 or b'<html' in raw[:300].lower():
                    raise ValueError('Unexpected license response')
                raw.decode('utf-8')
                target.write_bytes(raw)
                item['sha256'] = hashlib.sha256(raw).hexdigest()
                item.pop('fetchError', None)
                print('Fetched ' + item['name'])
            except Exception as error:
                item['fetchError'] = str(error)
                print('Could not fetch ' + item['name'] + ': ' + str(error), file=sys.stderr)
        (out / 'upstream-sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n')
        if any(item.get('fetchError') for item in sources):
            raise SystemExit(1)
        return
    text_dir = out / 'texts'
    text_dir.mkdir(parents=True, exist_ok=True)
    lock = json.loads((ROOT / 'package-lock.json').read_text())
    root_package = json.loads((ROOT / 'package.json').read_text())
    rows = []
    for location, locked in sorted(lock['packages'].items()):
        if not location:
            continue
        folder = ROOT / location
        manifest = folder / 'package.json'
        package = json.loads(manifest.read_text()) if manifest.is_file() else {}
        name = package.get('name') or location.rsplit('node_modules/', 1)[-1]
        license_value = package.get('license') or locked.get('license')
        if isinstance(license_value, dict):
            license_value = license_value.get('type', json.dumps(license_value))
        notices = []
        if manifest.is_file():
            for path in notice_files(folder):
                try:
                    content = path.read_text(encoding='utf-8')
                except (UnicodeError, OSError):
                    continue
                if content.strip():
                    notices.append({'sourcePath': path.relative_to(folder).as_posix(), **preserve(content, text_dir)})
            if not notices:
                # Preserve a publisher's inline README license section when no
                # separate notice file was shipped. Never substitute a template.
                for readme in sorted(folder.glob('[Rr][Ee][Aa][Dd][Mm][Ee]*')):
                    if not readme.is_file():
                        continue
                    content = readme.read_text(encoding='utf-8', errors='replace')
                    heading = re.search(r'^(?:#{1,6}\s+)?(?:licen[cs](?:e|ing)|copyright)\b.*$', content, re.I | re.M)
                    if heading:
                        notices.append({'sourcePath': readme.name + ':license-section', **preserve(content[heading.start():], text_dir)})
        rows.append({'name': name, 'version': locked.get('version'), 'path': location,
                     'installedVersion': package.get('version'),
                     'matchesLock': package.get('version') == locked.get('version') if manifest.is_file() else None,
                     'license': license_value or 'UNDECLARED',
                     'direct': name in root_package.get('dependencies', {}) or name in root_package.get('devDependencies', {}),
                     'development': bool(locked.get('dev')), 'optional': bool(locked.get('optional')),
                     'installed': manifest.is_file(), 'source': locked.get('resolved'),
                     'repository': package.get('repository'), 'notices': notices})
    npm = {'schemaVersion': 1, 'lockfileVersion': lock.get('lockfileVersion'),
           'lockfileSha256': hashlib.sha256((ROOT / 'package-lock.json').read_bytes()).hexdigest(),
           'packages': rows}
    (out / 'npm-inventory.json').write_text(json.dumps(npm, ensure_ascii=False, indent=2) + '\n')
    table = ['# JavaScript dependency notices', '',
             'Generated by `python3 scripts/generate-licenses.py` from `package-lock.json` and installed package files. Includes production, development, transitive, and platform-optional entries. A license label is publisher metadata, not an independent legal conclusion.', '',
             '| Package | Version | Declared license | Scope | Preserved notices |', '| --- | --- | --- | --- | --- |']
    for row in rows:
        scope = ('development' if row['development'] else 'production/peer') + ('; direct' if row['direct'] else '; transitive')
        if not row['installed']:
            scope += '; not installed here'
        elif not row['matchesLock']:
            scope += '; NOTICE FROM INSTALLED ' + str(row['installedVersion']) + ' (lock differs)'
        links = ', '.join(f"[{markdown_escape(item['sourcePath'])}]({item['file']})" for item in row['notices'])
        if not links:
            links = 'Not installed; inspect target artifact' if not row['installed'] else 'No separate notice found; see publisher metadata/source'
        table.append('| ' + ' | '.join([markdown_escape(row['name']), markdown_escape(row['version']), markdown_escape(row['license']), scope, links]) + ' |')
    (out / 'npm-inventory.md').write_text('\n'.join(table) + '\n')
    python_rows = []
    for source in args.python_snapshot:
        snapshot = json.loads(Path(source).read_text())
        environment = snapshot.get('environment', Path(source).stem)
        for item in snapshot['packages']:
            row = {key: value for key, value in item.items() if key != 'notices'}
            row['environment'] = environment
            row['notices'] = [{'sourcePath': n['path'], **preserve(n['text'], text_dir)} for n in item['notices']]
            python_rows.append(row)
    if python_rows:
        result = {'schemaVersion': 1, 'packages': sorted(python_rows, key=lambda r: (r['environment'], r['name'].lower()))}
        (out / 'python-inventory.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        table = ['# Python dependency notices', '',
                 'Environment snapshots generated with `scripts/generate-licenses.py --collect-python`. Actual installed versions are listed; `backend/requirements.txt` uses ranges and may resolve differently on a later build.', '',
                 '| Environment | Package | Version | License metadata | Preserved notices |', '| --- | --- | --- | --- | --- |']
        for row in result['packages']:
            label = row['licenseExpression'] or row['licenseMetadata'] or '; '.join(row['licenseClassifiers']) or 'UNDECLARED'
            links = ', '.join(f"[{markdown_escape(n['sourcePath'])}]({n['file']})" for n in row['notices']) or 'No bundled notice found'
            table.append('| ' + ' | '.join([markdown_escape(row['environment']), markdown_escape(row['name']), markdown_escape(row['version']), markdown_escape(label), links]) + ' |')
        (out / 'python-inventory.md').write_text('\n'.join(table) + '\n')
    missing = [r for r in rows if r['installed'] and not r['notices']]
    print(json.dumps({'npmLockEntries': len(rows), 'npmInstalled': sum(r['installed'] for r in rows),
                      'npmVersionMismatches': sum(r['matchesLock'] is False for r in rows),
                      'npmInstalledWithoutNoticeFile': len(missing),
                      'pythonEnvironmentEntries': len(python_rows), 'preservedTexts': len(list(text_dir.glob('*.txt')))}, indent=2))


if __name__ == '__main__':
    main()
