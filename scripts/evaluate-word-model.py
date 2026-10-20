"""Evaluate the exact deployed, compressed forest on withheld source recordings."""
import hashlib
import importlib.util
import json
import pathlib
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('word_training', ROOT / 'scripts/train-word-model.py')
training = importlib.util.module_from_spec(spec)
spec.loader.exec_module(training)
meta = json.loads((ROOT / 'public/models/isl-temporal-model.json').read_text())
nodes = np.fromfile(ROOT / 'public/models/isl-temporal-forest.bin',dtype='<f4').reshape(-1,10)
records = json.loads((ROOT / '.sign-data-cache/temporal-recordings.json').read_text())
selected = [(i,r) for i,r in enumerate(records) if r['signer'] in ['isl500-4','isl500-5','include-test']]
recordings = ROOT / '.sign-data-cache/temporal-recordings.npz'
cached = ROOT / '.sign-data-cache/temporal-validation-features.npy'
key_file = cached.with_suffix('.key')
# Reuse cached vectors only for the same records, in the same order, embedded by
# the same feature code from the same source recordings.
digest = hashlib.sha256()
digest.update(json.dumps([[i, r] for i, r in selected], sort_keys=True).encode())
digest.update((ROOT / 'scripts/train-word-model.py').read_bytes())
with recordings.open('rb') as source:
    for block in iter(lambda: source.read(1 << 20), b''): digest.update(block)
key = digest.hexdigest()
if cached.exists() and key_file.exists() and key_file.read_text().strip() == key:
    features = np.load(cached)
else:
    with np.load(recordings) as raw:
        features = np.array([training.embed(raw[str(i)]) for i,_ in selected],dtype=np.float32)
    np.save(cached,features)
    key_file.write_text(key + '\n')
expected = np.array([r['label'] for _,r in selected])
result = dict(**training.deployed_metrics(nodes, meta['roots'], meta['labels'], features, expected, meta['threshold'], meta['margin']),
              note='Exact shipped float32 forest; ISL500 signers 4/5 and separate INCLUDE clips withheld. Dictionary-only words have no independent evaluation.')
(ROOT / '.sign-data-cache/temporal-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
