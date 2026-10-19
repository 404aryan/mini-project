"""Build real ISL reference poses. Offline preparation only; no runtime Python.

pip install mediapipe opencv-python numpy
python scripts/prepare-sign-data.py
Source images: Prathum Arikeri, Indian Sign Language (ISL), version 1,
CC BY-SA 4.0. Derived landmark data retains CC BY-SA 4.0.
"""
import collections
import hashlib
import json
import pathlib
import random
import urllib.request
import zipfile

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / '.sign-data-cache'
CACHE.mkdir(exist_ok=True)
SOURCE = 'https://www.kaggle.com/api/v1/datasets/download/prathumarikeri/indian-sign-language-isl/1'


def features(hands):
    ordered = sorted(hands, key=lambda h: h[0][0])
    vector = []
    for hand in ordered:
        points = np.asarray(hand, dtype=float)
        points -= points[0].copy()
        scale = np.linalg.norm(points, axis=1).max()
        if scale < 1e-6:
            return None
        vector.extend((points / scale).reshape(-1).tolist())
    return [round(v, 6) for v in vector] + [0.] * (126 - len(vector))


def build_static():
    archive = CACHE / 'isl-static.zip'
    if not archive.exists():
        urllib.request.urlretrieve(SOURCE, archive)
    options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=str(ROOT / 'public/mediapipe/hand_landmarker.task')),
        num_hands=2, min_hand_detection_confidence=.5,
    )
    samples, evaluation, provenance = [], [], []
    with vision.HandLandmarker.create_from_options(options) as task, zipfile.ZipFile(archive) as source:
        labels = collections.defaultdict(list)
        for name in source.namelist():
            parts = name.split('/')
            if len(parts) == 3 and parts[1] in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789' and name.endswith('.jpg'):
                labels[parts[1]].append(name)
        for label, names in sorted(labels.items()):
            random.Random(20261019).shuffle(names)
            poses = []
            for name in names:
                image = cv2.imdecode(np.frombuffer(source.read(name), np.uint8), cv2.IMREAD_COLOR)
                # Preserve the original crop, with a border to let palms near the edge be detected.
                image = cv2.copyMakeBorder(image, 24, 24, 24, 24, cv2.BORDER_CONSTANT)
                image = cv2.resize(image, (352, 352))
                result = task.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(image, cv2.COLOR_BGR2RGB)))
                hands = [[[p.x, p.y, p.z] for p in hand] for hand in result.hand_landmarks]
                if hands:
                    vector = features(hands)
                    if vector:
                        poses.append((name, vector, hands))
                if len(poses) >= 64:
                    break
            # Two-handed signs must not silently learn an occluded single-hand fragment.
            counts = collections.Counter(len(p[2]) for p in poses)
            expected = 2 if counts[2] >= 8 else 1
            poses = [p for p in poses if len(p[2]) == expected]
            train, heldout = poses[:-10], poses[-10:]
            if len(train) < 3:
                raise RuntimeError(f'Insufficient real poses for {label}: {counts}')
            for index, (name, vector, hands) in enumerate(train):
                sample_id = f'isl-arikeri-v1-{label}-{index}'
                samples.append(dict(id=sample_id, label=label, features=vector))
                # Explicit left-handed augmentation of a real observation.
                mirrored = features([[[1-p[0], p[1], p[2]] for p in hand] for hand in hands])
                samples.append(dict(id=sample_id+'-mirror', label=label, features=mirrored))
                provenance.append(dict(id=sample_id, source=name))
            evaluation.extend(dict(id=f'heldout-{label}-{i}', label=label, features=p[1]) for i, p in enumerate(heldout))
            print(label, 'train', len(train)*2, 'heldout', len(heldout), 'hands', expected, flush=True)
    result = dict(version=1, normalization='wrist-maxdist-v1',
                  description='Real ISL image landmarks with left-handed augmentation; see SIGN-DATA.md.',
                  license='CC-BY-SA-4.0',
                  source='https://www.kaggle.com/datasets/prathumarikeri/indian-sign-language-isl',
                  attribution='Prathum Arikeri; derived MediaPipe landmarks and horizontal reflections; SIGN-DATA.md', samples=samples)
    (ROOT / 'public/models/isl-samples.json').write_text(json.dumps(result, separators=(',', ':'))+'\n')
    (CACHE / 'static-heldout.json').write_text(json.dumps(dict(version=1, normalization='wrist-maxdist-v1', samples=evaluation)))
    (CACHE / 'static-provenance.json').write_text(json.dumps(dict(source=SOURCE, sha256=hashlib.sha256(archive.read_bytes()).hexdigest(), samples=provenance), indent=2))


if __name__ == '__main__':
    build_static()
