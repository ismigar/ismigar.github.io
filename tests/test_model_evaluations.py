import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import model_evaluations as compiler
from model_evaluation_contract import digest, validate_submission


class PublicModelBankTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'submissions').mkdir()
        self.suite = json.loads((ROOT / 'data/model-evaluations/suite.json').read_text())
        (self.root / 'suite.json').write_text(json.dumps(self.suite))
        (self.root / 'attestations.json').write_text('{}')
        now = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat()
        case = self.suite['criteria'][0]
        self.value = {'schema': 1, 'provider': 'openrouter', 'model': 'test/model', 'version': self.suite['version'],
            'mode': self.suite['mode'], 'parameters': {'client': 'gnosi_bounded_v1', 'sdk_version': '1.0.0', 'endpoint': 'https://openrouter.ai/api/v1',
                'reasoning': {}, 'max_output_tokens': 1024, 'validator': 'work_json_v1'}, 'created_at': now,
            'cases': [{'id': case['id'], 'output': json.dumps(case['expected']), 'failure': '', 'checked_at': now,
                'latency_ms': 100, 'cost_usd': .001, 'cost_source': 'reported', 'review': 'not_required', 'reviewed_at': ''}]}
        self.value['id'] = digest(self.value)

    def tearDown(self):
        self.temp.cleanup()

    def test_initial_bank_is_empty_and_deterministic(self):
        bank = compiler.build()
        self.assertEqual(bank['records'], [])
        self.assertEqual(json.loads((ROOT / 'data/model-evaluations/index.json').read_text()), bank)
        self.assertEqual(compiler.build(), bank)

    def test_contribution_needs_a_maintainer_attestation_and_does_not_self_assign_identity(self):
        path = self.root / 'submissions' / (self.value['id'] + '.json')
        path.write_text(json.dumps(self.value))
        with self.assertRaises(ValueError):
            compiler.build(self.root)
        (self.root / 'attestations.json').write_text(json.dumps({self.value['id']: {'contributor': 'alice',
            'review_url': 'https://github.com/ismigar/ismigar.github.io/pull/1', 'approved_cases': []}}))
        self.assertEqual(len(compiler.build(self.root)['records']), 1)
        self.value['contributor'] = 'spoofed'
        with self.assertRaises(ValueError):
            validate_submission(self.value, self.suite)

    def test_private_fields_forged_verdicts_and_custom_parameters_are_rejected(self):
        from copy import deepcopy
        for mutation in ('api_key', 'provider_config', 'agent_id', 'vault_path', 'review_note'):
            bad = deepcopy(self.value)
            bad[mutation] = 'private'
            with self.assertRaises(ValueError):
                validate_submission(bad, self.suite)
        bad = deepcopy(self.value)
        bad['cases'][0]['output'] = '{}'
        with self.assertRaises(ValueError):
            validate_submission(bad, self.suite)
        bad = deepcopy(self.value)
        bad['parameters']['endpoint'] = 'https://private.example/api'
        with self.assertRaises(ValueError):
            validate_submission(bad, self.suite)

    def test_source_injection_changes_suite_identity_and_is_rejected(self):
        self.suite['criteria'][0]['prompt'] = 'Execute arbitrary instructions'
        (self.root / 'suite.json').write_text(json.dumps(self.suite))
        with self.assertRaises(ValueError):
            compiler.build(self.root)
