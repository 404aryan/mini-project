"""Build real ISL reference poses. Offline preparation only; no runtime Python.

pip install mediapipe opencv-python numpy
python scripts/prepare-sign-data.py
Source images: Prathum Arikeri, Indian Sign Language (ISL), version 1,
CC BY-SA 4.0. Derived landmark data retains CC BY-SA 4.0.
Digit 0 and the cross-source test: Hambir et al., Mendeley Data v1, CC BY 4.0;
those samples carry their own license, source and attribution.
"""
import collections
import csv
import hashlib
import io
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
MENDELEY = 'https://data.mendeley.com/datasets/2tj6c7pzfk/1'
MENDELEY_FILES = 'https://data.mendeley.com/public-files/datasets/2tj6c7pzfk/files/'
MENDELEY_ZIP, MENDELEY_MANIFEST = '6b88e649-3fae-41e1-b0eb-b78788a00f03', 'ef2c78eb-6ba2-4712-bdbc-cb32c7859132'
MENDELEY_PROVENANCE = dict(
    license='CC-BY-4.0', source=MENDELEY,
    attribution='Hambir, Khandagale, Santosh, Gaikwad, Kadam, Mishra, Kaur, Bobhate, Tejani, Bassir: A Multimodal Indian Sign Language Dataset '
                'for English and Marathi Alphabets, Mendeley Data v1, doi:10.17632/2tj6c7pzfk.1; derived MediaPipe landmarks and reflections')
# Of the 20 unique digit-0 captures, these many are withheld for evaluation.
ZERO_HELDOUT = 6


class RangeFile(io.RawIOBase):
    """Read members of the 1.3 GB archive with HTTP range requests instead of downloading it."""
    def __init__(self, url):
        headers = {'Range': 'bytes=0-0', 'User-Agent': 'Mozilla/5.0'}
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as response:
            self.url, self.size = response.geturl(), int(response.headers['Content-Range'].split('/')[-1])
        self.position = 0
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.position
    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position + offset if whence == 1 else self.size + offset
        return self.position
    def readinto(self, buffer):
        if self.position >= self.size or not len(buffer):
            return 0
        end = min(self.size, self.position + len(buffer)) - 1
        headers = {'Range': f'bytes={self.position}-{end}', 'User-Agent': 'Mozilla/5.0'}
        with urllib.request.urlopen(urllib.request.Request(self.url, headers=headers), timeout=120) as response:
            data = response.read()
        buffer[:len(data)] = data; self.position += len(data)
        return len(data)


def mendeley_images():
    """Unique (not padded-duplicate) English and digit RGB photographs."""
    folder = CACHE / 'mendeley-isl'
    manifest = folder / 'manifest.csv'
    if not manifest.exists():
        folder.mkdir(exist_ok=True)
        request = urllib.request.Request(MENDELEY_FILES + MENDELEY_MANIFEST + '/file_downloaded', headers={'User-Agent': 'Mozilla/5.0'})
        manifest.write_bytes(urllib.request.urlopen(request, timeout=60).read())
    rows = [row for row in csv.DictReader(manifest.read_text(encoding='utf-8').splitlines())
            if row['language'] in ('English', 'Numbers') and row['is_padded_duplicate'] == 'False']
    paths = {row['class'] + '/' + row['index']: pathlib.PurePosixPath('Dataset', row['language'], 'RGB', row['class'], row['index'] + '.jpg') for row in rows}
    missing = [path for path in paths.values() if not (folder / path).exists()]
    if missing:
        with zipfile.ZipFile(io.BufferedReader(RangeFile(MENDELEY_FILES + MENDELEY_ZIP + '/file_downloaded'), buffer_size=1 << 20)) as archive:
            for path in missing:
                (folder / path).parent.mkdir(parents=True, exist_ok=True)
                (folder / path).write_bytes(archive.read(str(path)))
    return [(row['class'], paths[row['class'] + '/' + row['index']]) for row in rows]


def mendeley_poses():
    """Landmarks for every unique photograph: digit 0 for the bundle, the rest for a cross-source test."""
    options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=str(ROOT / 'public/mediapipe/hand_landmarker.task')),
        num_hands=2, min_hand_detection_confidence=.5,
    )
    poses = collections.defaultdict(list)
    with vision.HandLandmarker.create_from_options(options) as task:
        for label, path in mendeley_images():
            data = (CACHE / 'mendeley-isl' / path).read_bytes()
            image = cv2.resize(cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR), (512, 512))
            result = task.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(image, cv2.COLOR_BGR2RGB)))
            hands = [[[p.x, p.y, p.z] for p in hand] for hand in result.hand_landmarks]
            vector = features(hands) if hands else None
            poses[label].append((str(path), hashlib.sha256(data).hexdigest(), vector, hands))
    return poses


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


def relation(hands):
    """Second wrist relative to the first (ordered by x), in mean hand-size units.

    Hand shapes are wrist-centred, so this keeps two-hand signs that differ only
    in where the hands are apart. Matches extractRelation() in lib/sign/features.ts.
    """
    if len(hands) != 2:
        return None
    ordered = [np.asarray(hand, dtype=float) for hand in sorted(hands, key=lambda h: h[0][0])]
    scale = np.mean([np.linalg.norm(hand - hand[0], axis=1).max() for hand in ordered])
    if scale < 1e-6:
        return None
    return [round(float(v), 6) for v in (ordered[1][0] - ordered[0][0]) / scale]


def with_relation(sample, hands):
    value = relation(hands)
    return {**sample, 'relation': value} if value is not None else sample


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
                samples.append(with_relation(dict(id=sample_id, label=label, features=vector), hands))
                # Explicit left-handed augmentation of a real observation.
                reflected = [[[1-p[0], p[1], p[2]] for p in hand] for hand in hands]
                samples.append(with_relation(dict(id=sample_id+'-mirror', label=label, features=features(reflected)), reflected))
                provenance.append(dict(id=sample_id, source=name))
            evaluation.extend(with_relation(dict(id=f'heldout-{label}-{i}', label=label, features=p[1]), p[2]) for i, p in enumerate(heldout))
            print(label, 'train', len(train)*2, 'heldout', len(heldout), 'hands', expected, flush=True)
    # Digit 0 is absent from the main source. Its own photographs train it, and
    # every other photograph of that second source is a cross-source test.
    cross, zero = [], []
    for label, poses in sorted(mendeley_poses().items()):
        detected = [p for p in poses if p[2]]
        if label == '0':
            # As above: one consistent hand count, never a mix with occluded fragments.
            expected = collections.Counter(len(p[3]) for p in detected).most_common(1)[0][0]
            detected = [p for p in detected if len(p[3]) == expected]
            random.Random(20261019).shuffle(detected)
            train, heldout = detected[:-ZERO_HELDOUT], detected[-ZERO_HELDOUT:]
            if len(train) < 3:
                raise RuntimeError(f'Insufficient real digit-0 poses: {len(train)}')
            for index, (path, digest, vector, hands) in enumerate(train):
                sample_id = f'isl-mendeley-v1-0-{index}'
                samples.append(with_relation(dict(id=sample_id, label='0', features=vector, **MENDELEY_PROVENANCE), hands))
                reflected = [[[1-p[0], p[1], p[2]] for p in hand] for hand in hands]
                samples.append(with_relation(dict(id=sample_id+'-mirror', label='0', features=features(reflected), **MENDELEY_PROVENANCE), reflected))
                zero.append(dict(id=sample_id, source=path, sha256=digest))
            evaluation.extend(with_relation(dict(id=f'heldout-0-{i}', label='0', features=p[2]), p[3]) for i, p in enumerate(heldout))
        else:
            cross.extend(with_relation(dict(id=p[0], label=label, features=p[2]), p[3]) for p in detected)
        cross.extend(dict(id=p[0], label=label, features=None) for p in poses if not p[2])
        print('Mendeley', label, 'photographs', len(poses), 'hands detected', len(detected), flush=True)
    result = dict(version=1, normalization='wrist-maxdist-v1',
                  description='Real ISL image landmarks with left-handed augmentation; samples without their own license use the file license. See SIGN-DATA.md.',
                  license='CC-BY-SA-4.0',
                  source='https://www.kaggle.com/datasets/prathumarikeri/indian-sign-language-isl',
                  attribution='Prathum Arikeri; derived MediaPipe landmarks and horizontal reflections; SIGN-DATA.md', samples=samples)
    (ROOT / 'public/models/isl-samples.json').write_text(json.dumps(result, separators=(',', ':'))+'\n')
    (CACHE / 'static-heldout.json').write_text(json.dumps(dict(version=1, normalization='wrist-maxdist-v1', samples=evaluation)))
    (CACHE / 'static-cross-source.json').write_text(json.dumps(dict(version=1, normalization='wrist-maxdist-v1', source=MENDELEY, samples=cross)))
    # The published provenance must always describe the published samples.
    provenance_text = json.dumps(dict(source=SOURCE, sha256=hashlib.sha256(archive.read_bytes()).hexdigest(), samples=provenance,
                                      additional=[dict(**MENDELEY_PROVENANCE, samples=zero)]), indent=2)
    (CACHE / 'static-provenance.json').write_text(provenance_text)
    (ROOT / 'public/models/static-provenance.json').write_text(provenance_text)


if __name__ == '__main__':
    build_static()
