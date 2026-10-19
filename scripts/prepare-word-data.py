"""Prepare research ISL word references from ISL500 real MediaPipe recordings.

pip install h5py numpy
python scripts/prepare-word-data.py
ISL500 permits research/academic use only. See public/models/SIGN-DATA.md.
"""
import collections
import concurrent.futures
import hashlib
import json
import pathlib
import urllib.parse
import urllib.request

import h5py
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / '.sign-data-cache'
CACHE.mkdir(exist_ok=True)
REPO = 'https://huggingface.co/datasets/ISL500/ISL-DATA'
LABELS = {'Hello': 'HELLO', 'Thankyou': 'THANK YOU', 'Please': 'PLEASE', 'Help': 'HELP',
          'Water': 'WATER', 'Yes': 'YES', 'No': 'NO', 'Good': 'GOOD', 'Wait': 'WAIT',
          'Go': 'GO', 'Eat': 'EAT', 'Drink': 'DRINK', 'School': 'SCHOOL'}


def tree(user):
    cached = CACHE / f'words-user{user}.json'
    if cached.exists():
        return json.loads(cached.read_text())
    url = REPO.replace('/datasets/', '/api/datasets/') + f'/tree/main/Landmarks/MediaPipe/ISL_DATA_USER{user:03}?limit=1000'
    entries = []
    while url:
        response = urllib.request.urlopen(url, timeout=45)
        entries.extend(json.load(response))
        link = response.headers.get('Link', '')
        url = link.split('>;')[0].strip('<') if 'rel="next"' in link else None
    cached.write_text(json.dumps(entries))
    return entries


def encode(raw):
    # Use a contiguous observed run, never fill a missing hand with invented poses.
    observed = np.isfinite(raw).all(axis=(2, 3)) & np.any(raw != 0, axis=(2, 3))
    counts = observed.sum(axis=1)
    runs, start = [], 0
    for i in range(1, len(raw) + 1):
        if i == len(raw) or counts[i] != counts[start]:
            if counts[start] and 42 <= i - start <= 150:
                runs.append((start, i, int(counts[start])))
            elif counts[start] and i - start > 150:
                runs.append((start, start + 150, int(counts[start])))
            start = i
    if not runs:
        return None
    start, end, count = max(runs, key=lambda r: (r[2], r[1] - r[0]))
    # Interpolate measured coordinates to the runtime's 30-frame sequence format.
    indices = np.linspace(start, end - 1, 30)
    hands = []
    for position in indices:
        low, high = int(np.floor(position)), int(np.ceil(position))
        selected = raw[low, observed[low]] * (1 - (position - low)) + raw[high, observed[high]] * (position - low)
        selected = selected[np.argsort(selected[:, 0, 0])]
        hands.append(selected)
    anchors = hands[0][:, 0].copy()
    scales = np.linalg.norm(hands[0] - anchors[:, None], axis=2).max(axis=1)
    if np.any(scales < 1e-6):
        return None
    frames = []
    for selected in hands:
        relative = selected - selected[:, :1]
        sizes = np.linalg.norm(relative, axis=2).max(axis=1)
        if np.any(sizes < 1e-6):
            return None
        pose = (relative / sizes[:, None, None]).reshape(-1).tolist() + [0.] * (126 - count * 63)
        motion = ((selected[:, 0] - anchors) / scales[:, None]).reshape(-1).tolist() + [0.] * (6 - count * 3)
        if max(abs(v) for v in motion) > 12:
            return None
        frames.append([round(v, 6) for v in pose + motion])
    if np.max(np.std(np.array(frames), axis=0)) < .015:
        return None
    return dict(handCount=count, durationMs=round((end-start) / 30 * 1000), frames=frames)


def build():
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        trees = list(pool.map(tree, [1, 2, 3]))
    samples, provenance, heldout = [], [], []
    for original, label in LABELS.items():
        candidates = []
        # Round-robin signers, then sessions, with stable filenames.
        per_user = [sorted(x['path'] for x in entries if x['path'].split('/')[-1].split('__')[0] == original) for entries in trees]
        for i in range(min(8, max(map(len, per_user)))):
            candidates.extend(paths[i] for paths in per_user if i < len(paths))
        def download(path):
            local = CACHE / (hashlib.sha256(path.encode()).hexdigest() + '.h5')
            if not local.exists():
                urllib.request.urlretrieve(REPO + '/resolve/main/' + urllib.parse.quote(path), local)
            return path, local
        encoded = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            downloaded = list(pool.map(download, candidates))
        for path, local in downloaded:
            with h5py.File(local) as f:
                result = encode(f['intermediate'][:])
            if result:
                encoded.append((path, result))
            if len(encoded) >= 10:
                break
        counts = collections.Counter(result['handCount'] for _, result in encoded)
        if not counts:
            print(label, 'no usable sequences', flush=True)
            continue
        hand_count = counts.most_common(1)[0][0]
        compatible = [(p, r) for p, r in encoded if r['handCount'] == hand_count]
        if len(compatible) < 4:
            print(label, 'insufficient sequences', counts, flush=True)
            continue
        training_count = min(5, len(compatible) - 1)
        for i, (path, result) in enumerate(compatible[:training_count + 1]):
            item = dict(id=f'isl500-{original}-{i}', label=label, **result)
            if i == training_count:
                heldout.append(item)
            else:
                samples.append(item)
                provenance.append(dict(id=item['id'], source=path, sha256=hashlib.sha256((CACHE / (hashlib.sha256(path.encode()).hexdigest()+'.h5')).read_bytes()).hexdigest()))
        print(label, training_count, 'references, 1 heldout, hands', hand_count, flush=True)
    dataset = dict(version=1, normalization='sequence-wrist-motion-v1',
                   description='Real ISL500 landmark recordings for research/academic use. See SIGN-DATA.md.',
                   license='Research and academic use only; contact ISL500 authors for commercial use', source=REPO,
                   attribution='ISL500 / ISL-DATA; derived normalized hand sequences; SIGN-DATA.md', samples=samples)
    (ROOT / 'public/models/isl-words.json').write_text(json.dumps(dataset, separators=(',', ':'))+'\n')
    (CACHE / 'word-provenance.json').write_text(json.dumps(dict(source=REPO, samples=provenance), indent=2))
    (CACHE / 'word-heldout.json').write_text(json.dumps(dict(**{k:v for k,v in dataset.items() if k != 'samples'}, samples=heldout)))


if __name__ == '__main__':
    build()
