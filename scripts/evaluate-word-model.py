"""Re-score the exact shipped forest on the cached held-out test signers.

Uses the live recognizer's trailing windows, gates and auto-accept classes, then
checks the result against the numbers recorded in isl-temporal-model.json.
"""
import importlib.util
import json
import pathlib
import sys
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('word_training', ROOT / 'scripts/train-word-model.py')
training = importlib.util.module_from_spec(spec)
spec.loader.exec_module(training)
meta = json.loads((ROOT / 'public/models/isl-temporal-model.json').read_text())
nodes = np.fromfile(ROOT / 'public/models/isl-temporal-forest.bin',dtype='<f4').reshape(-1,10)
metadata = json.loads((ROOT / '.sign-data-cache/temporal-recordings.json').read_text())
with np.load(ROOT / '.sign-data-cache/temporal-recordings.npz') as data:
    selected = [dict(**r, raw=data[str(i)]) for i,r in enumerate(metadata) if training.partition(r) == 'test']
for record in selected:
    record['label'] = training.ALIAS_LABELS.get(record['label'], record['label'])
test = training.Scored(nodes, meta['roots'], meta['labels'], selected)
result = dict(**test.summary(test.decide(meta['threshold'], meta['margin'], meta['autoAccept'])),
              previousGates=test.summary(test.decide(.55, .15)),
              note='Exact shipped float32 forest on signer-disjoint test signers. Dictionary-only words have no independent evaluation.')
(ROOT / '.sign-data-cache/temporal-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
recorded = {key: meta['validation'][key] for key in result if key != 'note'}
if recorded != {key: result[key] for key in recorded}:
    sys.exit('The shipped model metadata does not match this evaluation.')
