"""Validate reviewed public contributions and compile the deterministic bank."""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path
from typing import Any
from model_evaluation_contract import SCHEMA, MAX_BYTES, digest, require, validate_submission

ROOT = Path(__file__).resolve().parents[1] / 'data/model-evaluations'


def read(path: Path) -> Any:
    require(path.stat().st_size <= MAX_BYTES)
    return json.loads(path.read_text())


def build(root: Path = ROOT) -> dict[str, Any]:
    suite = read(root / 'suite.json')
    # Must match the app's authored suite, including instruction order and review requirements.
    import hashlib
    criteria = suite['criteria']
    encoded = json.dumps([(c['id'], c['metric'], c['tasks'], c['prompt'], c['expected'], c['requires_review'])
                          for c in criteria], ensure_ascii=False)
    require(suite['version'] == 'work_' + hashlib.sha256(encoded.encode()).hexdigest()[:16])
    require(suite['mode'] == 'work_default_1024' and suite['max_output_tokens'] == 1024)
    attestations = read(root / 'attestations.json')
    require(isinstance(attestations, dict))
    records = []
    identifiers: set[str] = set()
    for path in sorted((root / 'submissions').glob('*.json')):
        value = validate_submission(read(path), suite)
        require(path.stem == value['id'] and value['id'] not in identifiers)
        identifiers.add(value['id'])
        review = attestations.get(value['id'])
        require(isinstance(review, dict) and set(review) == {'contributor', 'review_url', 'approved_cases'})
        require(isinstance(review['contributor'], str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}', review['contributor']) is not None)
        require(isinstance(review['review_url'], str) and re.fullmatch(r'https://github.com/ismigar/ismigar.github.io/pull/[1-9][0-9]*', review['review_url']) is not None)
        require(isinstance(review['approved_cases'], list) and len(set(review['approved_cases'])) == len(review['approved_cases'])
                and set(review['approved_cases']) <= {case['id'] for case in value['cases']})
        records.append({'evaluation': value, 'attestation': review})
    require(set(attestations) == identifiers)
    bank = {'schema': SCHEMA, 'suite': suite, 'records': records}
    require(len(json.dumps(bank).encode()) <= MAX_BYTES)
    return bank


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--import-file', type=Path)
    args = parser.parse_args()
    if args.import_file:
        value = validate_submission(read(args.import_file), read(ROOT / 'suite.json'))
        target = ROOT / 'submissions' / (value['id'] + '.json')
        require(not target.exists())
        target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
        print('Imported', target.name, '— add a reviewed attestation before compiling')
        return
    text = json.dumps(build(), ensure_ascii=False, indent=2) + '\n'
    path = ROOT / 'index.json'
    if args.check:
        require(path.read_text() == text)
    else:
        path.write_text(text)
    print('Public model-evaluation bank validated')


if __name__ == '__main__':
    main()
