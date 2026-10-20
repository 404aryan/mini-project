"""Train the camera's temporal classifier from real ISL recordings.

Dependencies: numpy scikit-learn h5py mediapipe opencv-python
Run: python scripts/train-word-model.py
No avatar geometry or invented labelled poses are used as observations.
"""
import collections
import concurrent.futures
import hashlib
import json
import os
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

import cv2
import h5py
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / '.sign-data-cache'
OUT = ROOT / 'public/models'
ISL = 'https://huggingface.co/datasets/ISL500/ISL-DATA'
DICTIONARY = 'https://huggingface.co/datasets/Vignesh3816/Indian_Sign_Language_Data.gov_Rencoded'
DIM = 135
CACHE.mkdir(exist_ok=True)
ISL500_USERS = range(1, 16)
# Signer-disjoint partitions, fixed before this split was evaluated. Calibration
# signers choose the gates and which classes may auto-accept; test signers are
# only used to report the chosen model. Augmentations inherit their clip's side.
CALIBRATION = ('isl500-12', 'isl500-13')
TEST = ('isl500-4', 'isl500-5', 'isl500-14', 'isl500-15', 'include-test')
PRECISION_TARGET = .95
# A class auto-accepts only with this much calibration evidence (docs/sign-data-collection.md).
MIN_TRAIN_SIGNERS, MIN_CALIBRATION_CLIPS = 3, 10
# The live recognizer's trailing windows (lib/sign/temporal-recognizer.ts),
# sampled from 30 fps sources at roughly its 10 Hz frame rate.
WINDOW_SECONDS = (.6, 1, 1.6, 2.4, 3.8)
RUNTIME_STEP = 3
FOREST = dict(n_estimators=64, max_leaf_nodes=1024, max_features=.25)
# Shared source glosses are one class rather than competing labels: the ISLRTC
# dictionary records House/Home and Start/Begin as one sign each.
ALIAS_LABELS = {'HOUSE': 'HOME', 'BEGIN': 'START'}
ALIASES = {
    'HOME': ['H/House_Home.mp4'], 'HOUSE': ['H/House_Home.mp4'],
    'WELCOME': ['W/Welcome_(Reply_to_Thanks).mp4'], 'WANT': ['W/Want_Desire_Wish_For.mp4'],
    'UNDERSTAND': ['U/Understand_Comprehend.mp4', 'U/Understand_Comprehend_Grasp_(Sign_2).mp4'],
    'ASK': ['A/Ask_Question.mp4'], 'LOOK': ['L/Look_Gaze_See.mp4'],
    'LISTEN': ['L/Listen_(Sound).mp4', 'L/Listen_(Visual).mp4'], 'TALK': ['T/Talk_Chat.mp4'],
    'START': ['S/Start_Begin.mp4', 'S/Start_Begin_(Sign_2).mp4'],
    'BEGIN': ['S/Start_Begin.mp4', 'S/Start_Begin_(Sign_2).mp4'],
    'AGAIN': ['A/Again_Repeat.mp4', 'A/Again_Repeat_(Sign_2).mp4'],
    'MOBILE': ['C/Cell_Mobile.mp4', 'C/Cell_Mobile_(Sign_2).mp4'],
    'DANGER': ['D/Danger_Hazard_Peril.mp4'], 'WHY': ['W/Why_(Sign_1).mp4', 'W/Why_(Sign_2).mp4'],
    'WHEN': ['W/When_(For_Days).mp4'], 'WHO': ['W/Who_Whom.mp4'],
    'TABLE': ['T/Table_Desk.mp4'], 'MONEY': ['R/Rupee, money.mp4'],
    'WOMAN': ['W/Woman_Female.mp4'], 'USE': ['U/Use_Utilize.mp4'],
    'THINK': ['T/Think_Contemplate_Ponder.mp4'], 'ANGRY': ['A/Angry_Enraged_Furious.mp4'],
    'SCARED': ['A/Afraid_Scared.mp4'], 'TIRED': ['T/Tired_Exhausted_Fatigued.mp4'],
    'LATE': ['L/Late_(Sign_1).mp4', 'L/Late_(Sign_2).mp4'],
    'IMPORTANT': ['I/Important_Significant.mp4'], 'I': ['I/I_Me.mp4'],
    'FRUIT': ['F/Fruits.mp4'], 'VEGETABLE': ['V/Vegetables.mp4'], 'PARENT': ['P/Parents.mp4'],
}


def vocabulary():
    source = (ROOT / 'lib/islVocabulary.ts').read_text(encoding='utf-8').split('= [', 1)[1].split(']', 1)[0]
    return re.findall(r"'([^']+)'", source)


def normal(value):
    return re.sub('[^A-Z]', '', value.upper())


def download(url, target):
    if target.exists() and target.stat().st_size:
        return target
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                data = response.read()
            target.write_bytes(data)
            return target
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1)


def user_tree(user):
    path = CACHE / f'words-user{user}.json'
    if path.exists():
        return json.loads(path.read_text())
    url = ISL.replace('/datasets/', '/api/datasets/') + f'/tree/main/Landmarks/MediaPipe/ISL_DATA_USER{user:03}?limit=1000'
    data = []
    while url:
        response = urllib.request.urlopen(url, timeout=60)
        data.extend(json.load(response))
        link = response.headers.get('Link', '')
        url = link.split('>;')[0].strip('<') if 'rel="next"' in link else None
    path.write_text(json.dumps(data))
    return data


def prepare_indices():
    match_file = CACHE / 'dictionary-matches.json'
    if not match_file.exists():
        def letter_tree(letter):
            url = DICTIONARY.replace('/datasets/', '/api/datasets/') + '/tree/main/'+letter+'?recursive=true&limit=1000'
            entries = []
            while url:
                response = urllib.request.urlopen(url, timeout=60); entries.extend(json.load(response))
                link = response.headers.get('Link',''); url = link.split('>;')[0].strip('<') if 'rel="next"' in link else None
            return entries
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            tree = [entry for entries in pool.map(letter_tree, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') for entry in entries]
        match_file.write_text(json.dumps({token:[entry['path'] for entry in tree if normal(pathlib.PurePosixPath(entry['path']).stem)==normal(token)] for token in vocabulary()}))
    include_file = CACHE / 'include-tree.json'
    if not include_file.exists():
        base = 'https://www.kaggle.com/api/v1/datasets/list/swaptr/indian-sign-language-mediapipe-holistic-landmarks?pageSize=200'
        data, entries = {}, []
        while True:
            data = json.load(urllib.request.urlopen(base+('&pageToken='+urllib.parse.quote(data['nextPageToken']) if data.get('nextPageToken') else ''),timeout=60))
            entries.extend(data['datasetFiles'])
            if not data.get('nextPageToken'): break
        include_file.write_text(json.dumps(entries))


def frame_features(raw):
    present = np.isfinite(raw).all(axis=(1, 2)) & np.any(raw != 0, axis=(1, 2))
    hands = raw[present]
    result = np.zeros(DIM, dtype=np.float32)
    if not len(hands):
        return result
    hands = hands[np.argsort(hands[:, 0, 0])]
    sizes = []
    for i, hand in enumerate(hands[:2]):
        relative = hand - hand[0]
        scale = np.linalg.norm(relative, axis=1).max()
        if scale < 1e-6:
            continue
        sizes.append(scale)
        result[i*63:(i+1)*63] = (relative / scale).reshape(-1)
        result[126+i] = 1
        result[128+i*2:130+i*2] = hand[0, :2]
    if len(hands) == 2 and sizes:
        result[132:135] = np.clip((hands[1, 0] - hands[0, 0]) / np.mean(sizes), -12, 12)
    return result


def trim(raw):
    valid = np.isfinite(raw).all(axis=(2, 3)) & np.any(raw != 0, axis=(2, 3))
    indices = np.where(valid.any(axis=1))[0]
    if len(indices) < 5:
        return None
    raw = raw[indices[0]:indices[-1]+1]
    # Short detector gaps are interpolated between two measured observations.
    # Entire absent hands remain absent; no synthetic labelled hand is created.
    valid = np.isfinite(raw).all(axis=(2, 3)) & np.any(raw != 0, axis=(2, 3))
    raw = np.nan_to_num(raw).copy()
    for hand in range(2):
        points = np.where(valid[:, hand])[0]
        for left, right in zip(points[:-1], points[1:]):
            if 1 < right-left <= 4:
                for i in range(left+1, right):
                    raw[i, hand] = raw[left, hand] + (raw[right, hand]-raw[left, hand]) * (i-left)/(right-left)
    return raw


def deployed_scores(nodes, roots, label_count, features):
    """Class scores from the shipped float32 node table, walked the way the browser forest walks it."""
    scores = np.zeros((len(features), label_count))
    for root in roots:
        indices = np.full(len(features), root, dtype=int)
        for _ in range(100):
            columns = nodes[indices, 0].astype(int); active = np.where(columns >= 0)[0]
            if not len(active): break
            right = features[active, columns[active]] > nodes[indices[active], 1]
            indices[active] = nodes[indices[active], 2 + right.astype(int)].astype(int)
        for position in [4, 6, 8]:
            classes = nodes[indices, position].astype(int)
            scores[np.arange(len(features)), classes] += nodes[indices, position + 1] / len(roots)
    return scores


def deployed_metrics(nodes, roots, labels, features, expected, threshold, margin_gate):
    """Validation numbers for the deployed binary, so the manifest matches what ships."""
    scores = deployed_scores(nodes, roots, len(labels), features)
    rank = np.argsort(scores, axis=1); best = scores[np.arange(len(scores)), rank[:, -1]]
    margin = best - scores[np.arange(len(scores)), rank[:, -2]]
    predicted = np.array(labels)[rank[:, -1]]
    accepted = (best >= threshold) & (margin >= margin_gate) & (predicted != '__NONE__')
    return dict(observations=len(features), correct=int((predicted == expected).sum()), accuracy=float((predicted == expected).mean()),
                acceptedCorrect=int(((predicted == expected) & accepted).sum()), acceptedWrong=int(((predicted != expected) & accepted).sum()),
                rejected=int((~accepted).sum()))


def runtime_windows(raw):
    """The trailing windows the browser scores when hands are lowered after a sign."""
    frames = raw[::RUNTIME_STEP]
    frames = frames[np.any(frames != 0, axis=(1, 2, 3))]
    windows, sizes = [], set()
    for seconds in WINDOW_SECONDS:
        count = min(len(frames), int(seconds * 30 / RUNTIME_STEP) + 1)
        if count >= 5 and count not in sizes:
            windows.append(embed(frames[-count:])); sizes.add(count)
    return windows


class Scored:
    """Clip and runtime-window forest scores for one partition."""
    def __init__(self, nodes, roots, labels, records):
        self.labels = np.array(labels); self.expected = np.array([r['label'] for r in records])
        self.signers = np.array([r['signer'] for r in records])
        clip = deployed_scores(nodes, roots, len(labels), np.array([embed(r['raw']) for r in records], dtype=np.float32))
        self.top1 = self.labels[clip.argmax(axis=1)]
        windows = [runtime_windows(r['raw']) for r in records]
        owner = np.repeat(np.arange(len(records)), [len(w) for w in windows])
        scores = deployed_scores(nodes, roots, len(labels), np.array([x for w in windows for x in w], dtype=np.float32))
        rank = np.argsort(scores, axis=1); rows = np.arange(len(scores))
        self.owner, self.window_label = owner, self.labels[rank[:, -1]]
        self.confidence = scores[rows, rank[:, -1]]; self.margin = self.confidence - scores[rows, rank[:, -2]]
        # Windows are shortest first, so each clip's last window spans the whole buffered sign.
        longest = np.cumsum([len(w) for w in windows]) - 1
        self.whole_label = self.window_label[longest[owner]]

    def decide(self, threshold, margin, eligible=None, agree=True):
        """Mirror of the worker: the most confident accepted window, else no word.
        With `agree`, a shorter window only counts when the whole buffered sign has
        the same top label, so a fragment of a sign cannot stand in for it."""
        accepted = (self.confidence >= threshold) & (self.margin >= margin) & (self.window_label != '__NONE__')
        if agree:
            accepted &= self.window_label == self.whole_label
        if eligible is not None:
            accepted &= np.isin(self.window_label, sorted(eligible))
        decision = np.full(len(self.expected), None, dtype=object); best = np.full(len(self.expected), -1.)
        for i in np.where(accepted)[0]:
            if self.confidence[i] > best[self.owner[i]]:
                best[self.owner[i]] = self.confidence[i]; decision[self.owner[i]] = self.window_label[i]
        return decision

    def summary(self, decision, mask=None):
        mask = np.ones(len(self.expected), bool) if mask is None else mask
        accepted = np.array([d is not None for d in decision]) & mask
        correct = accepted & (decision == self.expected)
        return dict(observations=int(mask.sum()), top1Correct=int((self.top1 == self.expected)[mask].sum()),
                    acceptedCorrect=int(correct.sum()), acceptedWrong=int((accepted & ~correct).sum()), rejected=int((mask & ~accepted).sum()))


def choose_gates(scored):
    """Most correct calibration accepts at or above the precision target."""
    best = None
    for threshold in np.round(np.arange(.3, .81, .02), 2):
        for margin in (.05, .1, .15, .2):
            result = scored.summary(scored.decide(threshold, margin))
            accepted = result['acceptedCorrect'] + result['acceptedWrong']
            if accepted and result['acceptedCorrect'] / accepted >= PRECISION_TARGET:
                key = (result['acceptedCorrect'], threshold, margin)
                if best is None or key > best: best = key
    if best is None:
        raise RuntimeError('No gate reaches the calibration precision target')
    return float(best[1]), float(best[2])


def per_class(scored, decision, labels):
    rows = {}
    for label in labels:
        own = scored.expected == label
        claimed = np.array([d == label for d in decision])
        correct = own & claimed
        rows[label] = dict(observations=int(own.sum()), signers=len(set(scored.signers[own])), top1Correct=int((own & (scored.top1 == label)).sum()),
                           acceptedCorrect=int(correct.sum()), acceptedWrong=int((own & ~claimed & np.array([d is not None for d in decision])).sum()),
                           falseAccepts=int((claimed & ~own).sum()))
    return rows


def confusions(scored, limit=40):
    pairs = collections.Counter((a, b) for a, b in zip(scored.expected, scored.top1) if a != b)
    return [dict(expected=a, predicted=b, count=c) for (a, b), c in pairs.most_common(limit)]


def track_hash(raw):
    return hashlib.sha256(np.ascontiguousarray(raw, dtype='<f4').tobytes()).hexdigest()


def partition(record):
    return 'calibration' if record['signer'] in CALIBRATION else 'test' if record['signer'] in TEST else 'train'


def embed(raw):
    frames = np.array([frame_features(frame) for frame in raw], dtype=np.float32)
    at = np.linspace(0, len(frames)-1, 12)
    sampled = np.array([frames[int(np.floor(t))]*(1-(t % 1)) + frames[int(np.ceil(t))]*(t % 1) for t in at])
    # Statistics + temporal order; exactly mirrored in temporal-features.ts.
    return np.concatenate([frames.mean(axis=0), frames.std(axis=0), frames.min(axis=0), frames.max(axis=0), sampled.reshape(-1)]).astype(np.float32)


def dictionary_extract(item):
    label, path = item
    key = hashlib.sha256(path.encode()).hexdigest()
    cached = CACHE / f'dictionary-{key}.npy'
    if cached.exists():
        return label, path, np.load(cached)
    video = download(DICTIONARY+'/resolve/main/'+urllib.parse.quote(path), CACHE / f'dictionary-{key}.mp4')
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    options = vision.HandLandmarkerOptions(base_options=python.BaseOptions(model_asset_path=str(OUT.parent / 'mediapipe/hand_landmarker.task')), num_hands=2,
                                           running_mode=vision.RunningMode.VIDEO, min_hand_detection_confidence=.35)
    capture = cv2.VideoCapture(str(video))
    fps = capture.get(cv2.CAP_PROP_FPS) or 30
    count = capture.get(cv2.CAP_PROP_FRAME_COUNT)
    # Explanation videos are not isolated sign labels.
    if count/fps > 20:
        capture.release()
        return label, path, None
    frames, index = [], 0
    with vision.HandLandmarker.create_from_options(options) as tracker:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if index % max(1, round(fps/10)) == 0:
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = tracker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=frame), round(index/fps*1000))
                hands = np.zeros((2, 21, 3), dtype=np.float32)
                for i, hand in enumerate(result.hand_landmarks[:2]):
                    hands[i] = [[p.x, p.y, p.z] for p in hand]
                frames.append(hands)
            index += 1
    capture.release()
    data = trim(np.array(frames)) if frames else None
    if data is not None:
        np.save(cached, data)
    return label, path, data


def isl_extract(item):
    label, user, path = item
    try:
        local = CACHE / (hashlib.sha256(path.encode()).hexdigest()+'.h5')
        download(ISL+'/resolve/main/'+urllib.parse.quote(path), local)
        with h5py.File(local) as file:
            raw = trim(file['intermediate'][:])
        return label, user, path, raw
    except Exception as error:
        print('skip', path, str(error), flush=True)
        return label, user, path, None


def main():
    prepare_indices()
    tokens = vocabulary()
    if '--cached' in sys.argv:
        metadata = json.loads((CACHE / 'temporal-recordings.json').read_text())
        with np.load(CACHE / 'temporal-recordings.npz') as data:
            records = [dict(**record, raw=data[str(i)]) for i,record in enumerate(metadata)]
        extend_records(records)
        save_records(records)
        train(records, tokens)
        return
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        trees = list(pool.map(user_tree, ISL500_USERS))
    available = {normal(pathlib.PurePosixPath(x['path']).name.split('__')[0]): pathlib.PurePosixPath(x['path']).name.split('__')[0] for x in trees[0] if '/_mnt_' not in x['path']}
    jobs = []
    for label in tokens:
        original = available.get(normal(label))
        if not original:
            continue
        # Every first-round clip of every signer; the `_mnt_` second-round copies are not used.
        for user, tree in zip(ISL500_USERS, trees):
            paths = sorted(x['path'] for x in tree if '/_mnt_' not in x['path'] and pathlib.PurePosixPath(x['path']).name.split('__')[0] == original)
            jobs.extend((ALIAS_LABELS.get(label, label), user, path) for path in paths)
    print('Downloading/extracting', len(jobs), 'real multi-signer sequences', flush=True)
    records = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for index, (label, user, path, raw) in enumerate(pool.map(isl_extract, jobs)):
            if raw is not None:
                records.append(dict(label=label, signer=f'isl500-{user}', source=path, raw=raw))
            if index % 500 == 0:
                print('ISL500', index+1, '/', len(jobs), flush=True)
    dictionary = json.loads((CACHE / 'dictionary-matches.json').read_text())
    dictionary.update(ALIASES)
    dictionary_jobs = sorted(set((ALIAS_LABELS.get(label, label), path) for label, paths in dictionary.items() for path in paths if '(Explanation)' not in path))
    print('Extracting', len(dictionary_jobs), 'dictionary recordings', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for index, result in enumerate(pool.map(dictionary_extract, dictionary_jobs)):
            label, path, raw = result
            if raw is not None:
                records.append(dict(label=label, signer='dictionary', source=path, raw=raw))
            if index % 10 == 0:
                print('Dictionary', index+1, '/', len(dictionary_jobs), flush=True)
    # Cache real sequences before training so experiments never need redownloads.
    extend_records(records)
    save_records(records)
    train(records, tokens)


def save_records(records):
    np.savez_compressed(CACHE / 'temporal-recordings.npz', **{str(i): r['raw'] for i,r in enumerate(records)})
    (CACHE / 'temporal-recordings.json').write_text(json.dumps([{k:v for k,v in r.items() if k != 'raw'} for r in records], indent=2))


def extend_records(records):
    existing = {record['source'] for record in records}
    for label in ['FRUIT', 'VEGETABLE', 'PARENT']:
        for path in ALIASES[label]:
            if path not in existing:
                _, _, raw = dictionary_extract((label, path))
                if raw is not None:
                    records.append(dict(label=label, signer='dictionary', source=path, raw=raw))
    keep_source = 'ISL-canonical-motion-v1/isl_canonical_v1_part2/p4b_id_59088652333312b5.npz'
    if keep_source not in existing:
        local = CACHE / 'canonical-keep.npz'
        download('https://www.kaggle.com/api/v1/datasets/download/hariragavendramg/isl-canonical-motion-v1?fileName=isl_canonical_v1_part2/p4b_id_59088652333312b5.npz',local)
        if hashlib.sha256(local.read_bytes()).hexdigest() != '9f1bce692e69e3d93d8266acb285c32a46f3ad9bc25af162b56ec64fc796ef9c':
            raise RuntimeError('KEEP source checksum does not match its published audit manifest')
        with np.load(local,allow_pickle=False) as data:
            raw = np.stack([data['left_hand'],data['right_hand']],axis=1)
        raw = trim(raw)
        if raw is not None:
            records.append(dict(label='KEEP',signer='canonical-dictionary',source=keep_source,raw=raw))
    # INCLUDE contributes multiple real performances for gaps in the dictionary.
    import pyarrow.parquet as pq
    index = json.loads((CACHE / 'include-tree.json').read_text())
    for original, label in {'clothing':'CLOTHES', 'parent':'PARENT', 'brother':'BROTHER', 'park':'PARK'}.items():
        paths = sorted(x['name'] for x in index if '/'+original+'/' in x['name'])[:5]
        for i, path in enumerate(paths):
            source = 'INCLUDE/'+path
            if source in existing:
                continue
            local = CACHE / ('include-'+hashlib.sha256(path.encode()).hexdigest()+'.parquet')
            download('https://www.kaggle.com/api/v1/datasets/download/swaptr/indian-sign-language-mediapipe-holistic-landmarks?fileName='+urllib.parse.quote(path), local)
            table = pq.read_table(local).to_pandas()
            hands = table[table['type'].isin(['left_hand','right_hand'])]
            raw = np.zeros((int(table['frame'].max())+1,2,21,3),dtype=np.float32)
            for hand, slot in [('left_hand',0),('right_hand',1)]:
                selected = hands[hands['type']==hand]
                raw[selected['frame'].to_numpy(dtype=int),slot,selected['landmark_index'].to_numpy(dtype=int)] = selected[['x','y','z']].fillna(0).to_numpy()
            raw = trim(raw)
            if raw is not None:
                records.append(dict(label=label, signer='include-test' if i==4 else 'include-train', source=source, raw=raw))
        print('INCLUDE added', label, flush=True)


def train(records, tokens):
    for record in records:
        record['label'] = ALIAS_LABELS.get(record['label'], record['label'])
        record['partition'] = partition(record)
    counts = collections.Counter(r['label'] for r in records)
    train_records = [r for r in records if r['partition'] == 'train']
    calibration_records = [r for r in records if r['partition'] == 'calibration']
    test_records = [r for r in records if r['partition'] == 'test']
    labels = sorted({r['label'] for r in train_records})
    rng = np.random.default_rng(20261019)
    x, y = [], []
    for record in train_records:
        raw = record['raw']
        for variation in range(5):
            transformed = raw.copy()
            if variation:
                present = np.any(transformed != 0, axis=(2,3))
                zoom = rng.uniform(.85, 1.15)
                transformed[present] *= zoom
                transformed[present, :, :2] += rng.uniform(-.04, .04, 2)
                # Spatial and modest temporal augmentation of this observation.
                if variation % 2:
                    transformed[present, :, 0] = 1-transformed[present, :, 0]
                left = int(rng.uniform(0, .08)*len(transformed)); right = max(left+4, int(rng.uniform(.9, 1)*len(transformed)))
                transformed = transformed[left:right]
            x.append(embed(transformed)); y.append(record['label'])
    # Empty hands are a genuine no-sign condition and must never produce a word.
    for _ in range(80):
        x.append(embed(np.zeros((12,2,21,3),dtype=np.float32))); y.append('__NONE__')
    print('Training forest:', len(x), 'examples,', len(labels), 'words,', len(x[0]), 'features', flush=True)
    model = ExtraTreesClassifier(**FOREST, class_weight='balanced', n_jobs=4, random_state=20261019)
    model.fit(np.array(x), y)
    classes = list(model.classes_)
    # Each fixed-width node: feature, threshold, left, right, then top three class/probability pairs.
    nodes, roots = [], []
    for estimator in model.estimators_:
        tree = estimator.tree_; base = len(nodes); roots.append(base)
        for i in range(tree.node_count):
            value = tree.value[i,0]; value = value/max(value.sum(),1e-12); top=np.argsort(value)[-3:][::-1]
            row=[int(tree.feature[i]),float(tree.threshold[i]),int(tree.children_left[i])+base,int(tree.children_right[i])+base]
            for j in range(3):
                c=int(top[j]) if j<len(top) else 0;row += [c,float(value[c]) if j<len(top) else 0]
            nodes.append(row)
    binary=np.array(nodes,dtype='<f4');binary.tofile(OUT / 'isl-temporal-forest.bin')
    # Everything below scores the compressed float32 forest that ships, never the float64 estimator.
    calibration = Scored(binary, roots, classes, calibration_records)
    threshold, margin = choose_gates(calibration)
    train_signers = {label: len({r['signer'] for r in train_records if r['label'] == label}) for label in labels}
    calibration_rows = per_class(calibration, calibration.decide(threshold, margin), labels)
    auto_accept = sorted(label for label, row in calibration_rows.items() if train_signers[label] >= MIN_TRAIN_SIGNERS
                         and row['observations'] >= MIN_CALIBRATION_CLIPS and row['acceptedCorrect']
                         and row['acceptedCorrect'] / (row['acceptedCorrect'] + row['falseAccepts']) >= PRECISION_TARGET)
    calibration_decision = calibration.decide(threshold, margin, auto_accept)
    test = Scored(binary, roots, classes, test_records)
    test_decision = test.decide(threshold, margin, auto_accept)
    test_rows = per_class(test, test_decision, labels)
    calibration_rows = per_class(calibration, calibration_decision, labels)
    split = dict(train=sorted({r['signer'] for r in train_records}), calibration=list(CALIBRATION), test=list(TEST))
    validation = dict(**test.summary(test_decision), previousGates=test.summary(test.decide(.55, .15)),
                      split='Signer-disjoint: '+', '.join(s for s in TEST if s.startswith('isl500'))+' plus separate INCLUDE clips; gates and auto-accept classes chosen on '+' and '.join(CALIBRATION)+' only.',
                      note='Exact shipped float32 forest, scored with the live trailing windows. Dictionary-only classes have no independent evaluation and never auto-accept.')
    print('Gates', threshold, margin, 'auto-accept classes', len(auto_accept), flush=True)
    print('Calibration', json.dumps(calibration.summary(calibration_decision)), flush=True)
    print('Validation', json.dumps(validation), flush=True)
    provenance = [dict(label=r['label'], signer=r['signer'], source=r['source'], partition=r['partition'], frames=len(r['raw']), sha256=track_hash(r['raw'])) for r in records]
    dataset = hashlib.sha256('\n'.join(sorted(f"{p['partition']} {p['label']} {p['source']} {p['sha256']}" for p in provenance)).encode()).hexdigest()
    sha = hashlib.sha256(binary.tobytes()).hexdigest()
    covered=sorted(set(labels)|{alias for alias,canonical in ALIAS_LABELS.items() if canonical in labels})
    info=dict(version=1,features='hand-temporal-stats-v1',featureLength=len(x[0]),nodeWidth=10,nodeCount=len(nodes),roots=roots,labels=classes,
              vocabulary=covered,aliases={alias: canonical for alias, canonical in ALIAS_LABELS.items() if canonical in labels},
              missing=[t for t in tokens if t not in covered],threshold=threshold,margin=margin,autoAccept=auto_accept,
              trainingObservations=len(train_records),sourceCounts=dict(sorted(counts.items())),partitions=split,validation=validation,
              calibration=calibration.summary(calibration_decision),evaluation='/models/word-evaluation.json',datasetSha256=dataset,
              training=dict(command='python scripts/train-word-model.py [--cached]',forest=FOREST,precisionTarget=PRECISION_TARGET,
                            autoAcceptRule=f'>= {MIN_TRAIN_SIGNERS} training signers, >= {MIN_CALIBRATION_CLIPS} calibration clips, calibration precision >= {PRECISION_TARGET}',
                            requirements='scripts/sign-training-requirements.txt'),
              weights='/models/isl-temporal-forest.bin',sha256=sha,
              sources=[ISL,DICTIONARY,'https://huggingface.co/datasets/ai4bharat/INCLUDE','https://www.kaggle.com/datasets/hariragavendramg/isl-canonical-motion-v1'],license='Mixed source terms: ISL500 research/academic only; dictionary MIT card and original ISLRTC attribution; INCLUDE CC BY 4.0; canonical release CC0 with original ISLRTC attribution. See SIGN-DATA.md.')
    evaluation = dict(version=1, model=sha, datasetSha256=dataset, partitions=split, gates=dict(threshold=threshold, margin=margin, chosenOn='calibration'),
                      autoAccept=auto_accept, calibration=dict(**calibration.summary(calibration_decision), perClass=calibration_rows, confusions=confusions(calibration)),
                      test=dict(**validation, perClass=test_rows, perSigner={s: test.summary(test_decision, test.signers == s) for s in sorted(set(test.signers))},
                                confusions=confusions(test)),
                      trainingSigners=train_signers)
    (OUT / 'isl-temporal-model.json').write_text(json.dumps(info,indent=2)+'\n')
    (OUT / 'word-evaluation.json').write_text(json.dumps(evaluation,indent=1)+'\n')
    (OUT / 'temporal-provenance.json').write_text(json.dumps(provenance,indent=0)+'\n')
    # Real held-out raw landmarks for end-to-end tracker-to-transcript replay.
    core = ['HELLO','YES','NO','GOOD','BAD','THANK_YOU','GO','WANT','PLEASE','HELP','SORRY','COME','WATER','EAT','DRINK']
    replay=[r for r in test_records if r['label'] in core]
    (CACHE / 'temporal-replay.json').write_text(json.dumps([{**{k:v for k,v in r.items() if k!='raw'},'hands':r['raw'][::2].tolist()} for r in replay]))
    print('Model saved:', len(nodes), 'nodes;', len(covered), '/', len(tokens), 'avatar words covered', flush=True)

if __name__ == '__main__':
    main()
