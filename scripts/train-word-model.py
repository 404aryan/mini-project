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
import time
import urllib.parse
import urllib.request

import cv2
import h5py
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.metrics import accuracy_score

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / '.sign-data-cache'
OUT = ROOT / 'public/models'
ISL = 'https://huggingface.co/datasets/ISL500/ISL-DATA'
DICTIONARY = 'https://huggingface.co/datasets/Vignesh3816/Indian_Sign_Language_Data.gov_Rencoded'
DIM = 135
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
    tokens = vocabulary()
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        trees = list(pool.map(user_tree, range(1, 6)))
    available = {normal(pathlib.PurePosixPath(x['path']).name.split('__')[0]): pathlib.PurePosixPath(x['path']).name.split('__')[0] for x in trees[0] if '/_mnt_' not in x['path']}
    jobs = []
    for label in tokens:
        original = available.get(normal(label))
        if not original:
            continue
        for user, tree in enumerate(trees, 1):
            paths = sorted(x['path'] for x in tree if pathlib.PurePosixPath(x['path']).name.split('__')[0] == original)[:6]
            jobs.extend((label, user, path) for path in paths)
    print('Downloading/extracting', len(jobs), 'real multi-signer sequences', flush=True)
    records = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for index, (label, user, path, raw) in enumerate(pool.map(isl_extract, jobs)):
            if raw is not None:
                records.append(dict(label=label, signer=f'isl500-{user}', source=path, raw=raw))
            if index % 100 == 0:
                print('ISL500', index+1, '/', len(jobs), flush=True)
    dictionary = json.loads((CACHE / 'dictionary-matches.json').read_text())
    dictionary.update(ALIASES)
    # Shared source glosses are one class, rather than conflicting labels.
    alias_labels = {'HOUSE': 'HOME', 'BEGIN': 'START'}
    dictionary_jobs = sorted(set((alias_labels.get(label, label), path) for label, paths in dictionary.items() for path in paths if '(Explanation)' not in path))
    print('Extracting', len(dictionary_jobs), 'dictionary recordings', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for index, result in enumerate(pool.map(dictionary_extract, dictionary_jobs)):
            label, path, raw = result
            if raw is not None:
                records.append(dict(label=label, signer='dictionary', source=path, raw=raw))
            if index % 10 == 0:
                print('Dictionary', index+1, '/', len(dictionary_jobs), flush=True)
    # Cache real sequences before training so experiments never need redownloads.
    manifest = [{k:v for k,v in r.items() if k != 'raw'} for r in records]
    np.savez_compressed(CACHE / 'temporal-recordings.npz', **{str(i): r['raw'] for i,r in enumerate(records)})
    (CACHE / 'temporal-recordings.json').write_text(json.dumps(manifest, indent=2))
    train(records, tokens, alias_labels)


def train(records, tokens, alias_labels):
    counts = collections.Counter(r['label'] for r in records)
    labels = sorted(label for label,count in counts.items() if count >= 1)
    # Users 4/5 are never augmented into the training partition.
    train_records = [r for r in records if r['signer'] not in ['isl500-4', 'isl500-5']]
    test_records = [r for r in records if r['signer'] in ['isl500-4', 'isl500-5']]
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
    model = ExtraTreesClassifier(n_estimators=96, max_leaf_nodes=384, max_features=.25,
                                class_weight='balanced', n_jobs=4, random_state=20261019)
    model.fit(np.array(x), y)
    tests = np.array([embed(r['raw']) for r in test_records])
    expected = np.array([r['label'] for r in test_records])
    predictions = model.predict_proba(tests)
    classes = list(model.classes_)
    order = np.argsort(predictions,axis=1)
    best = predictions[np.arange(len(tests)),order[:,-1]]
    margin = best-predictions[np.arange(len(tests)),order[:,-2]]
    accepted = (best >= .55) & (margin >= .15)
    predicted = np.array(classes)[order[:,-1]]
    metrics = dict(observations=len(tests), correct=int((predicted==expected).sum()), accuracy=float(accuracy_score(expected,predicted)),
                   acceptedCorrect=int(((predicted==expected)&accepted).sum()), acceptedWrong=int(((predicted!=expected)&accepted).sum()),
                   rejected=int((~accepted).sum()), split='ISL500 signers 4 and 5 held out; dictionary single-source classes not independently validated')
    print('Validation', json.dumps(metrics), flush=True)
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
    covered=sorted(set(labels)|{alias for alias,canonical in alias_labels.items() if canonical in labels})
    info=dict(version=1,features='hand-temporal-stats-v1',featureLength=len(x[0]),nodeWidth=10,nodeCount=len(nodes),roots=roots,labels=classes,
              vocabulary=covered,aliases=alias_labels,missing=[t for t in tokens if t not in covered],threshold=.55,margin=.15,
              trainingObservations=len(train_records),sourceCounts=dict(counts),validation=metrics,
              weights='/models/isl-temporal-forest.bin',sha256=hashlib.sha256(binary.tobytes()).hexdigest(),
              sources=[ISL,DICTIONARY],license='Mixed source terms: ISL500 research/academic only; dictionary MIT card and original ISLRTC attribution. See SIGN-DATA.md.')
    (OUT / 'isl-temporal-model.json').write_text(json.dumps(info,indent=2)+'\n')
    (OUT / 'temporal-provenance.json').write_text(json.dumps([{k:v for k,v in r.items() if k!='raw'} for r in records],indent=2)+'\n')
    # Real held-out raw landmarks for end-to-end tracker-to-transcript replay.
    replay=[r for r in test_records if r['label'] in ['YES','NO','HELLO','THANK_YOU']][:30]
    (CACHE / 'temporal-replay.json').write_text(json.dumps([{**{k:v for k,v in r.items() if k!='raw'},'hands':r['raw'][::2].tolist()} for r in replay]))
    print('Model saved:', len(nodes), 'nodes;', len(covered), '/', len(tokens), 'avatar words covered', flush=True)


if __name__ == '__main__':
    main()
