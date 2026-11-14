set -eu
cd /home/ubuntu/clearroom/backend
docker compose exec -T api python - <<'PY' > /home/ubuntu/clearroom/python-runtime-licenses.json
import importlib.metadata, json, re, sys
from pathlib import Path
NOTICE=re.compile(r"(?:^|[-_.])(licen[cs]e|copying|notice)(?:$|[-_.])",re.I)
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

result=collect_python()
result["environment"]="Brev API container"
print(json.dumps(result,ensure_ascii=False,indent=2))
PY
printf 'Exported public Python package metadata and license texts.\n'
