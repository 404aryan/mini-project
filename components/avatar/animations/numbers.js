// One-hand ISL number handshapes. The extended fingers for 1-9 follow the
// bundled static recognition samples (public/models/isl-samples.json, all
// one-handed): 1 index; 2 index+middle; 3 index+middle+ring; 4 four fingers;
// 5 open hand; 6 little finger; 7 thumb+index; 8 thumb+index+middle; 9 thumb.
// 0 bends every finger and the thumb halfway into a ring. (The avatar's
// letter O is the two-handed vowel form, so it is not reused.) Arm, wrist and
// curl targets reuse the proven V and A letter poses, and the second frame
// returns each joint to rest. These still need review by fluent ISL signers,
// like every other procedural sign.

const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

const numberSign = ({ thumb = false, fingers = [], curl = Math.PI / 2, thumbFold = -Math.PI / 3 }) => (ref) => {
  let animations = [];

  for (const finger of FINGERS) {
    if (fingers.includes(finger)) continue;
    for (const joint of [1, 2, 3]) {
      animations.push([`mixamorigRightHand${finger}${joint}`, "rotation", "z", curl, "+"]);
    }
  }
  if (!thumb) {
    animations.push(["mixamorigRightHandThumb2", "rotation", "y", thumbFold, "-"]);
    animations.push(["mixamorigRightHandThumb3", "rotation", "y", thumbFold, "-"]);
  }

  animations.push(["mixamorigRightHand", "rotation", "z", -Math.PI / 2.3, "-"]);
  animations.push(["mixamorigRightHand", "rotation", "y", -Math.PI / 5, "-"]);
  animations.push(["mixamorigRightForeArm", "rotation", "z", Math.PI / 2.65, "+"]);
  animations.push(["mixamorigRightForeArm", "rotation", "x", Math.PI / 30, "+"]);
  animations.push(["mixamorigRightArm", "rotation", "x", -Math.PI / 4, "-"]);

  ref.animations.push(animations);

  animations = [];

  for (const finger of FINGERS) {
    if (fingers.includes(finger)) continue;
    for (const joint of [1, 2, 3]) {
      animations.push([`mixamorigRightHand${finger}${joint}`, "rotation", "z", 0, "-"]);
    }
  }
  if (!thumb) {
    animations.push(["mixamorigRightHandThumb2", "rotation", "y", 0, "+"]);
    animations.push(["mixamorigRightHandThumb3", "rotation", "y", 0, "+"]);
  }

  animations.push(["mixamorigRightHand", "rotation", "z", 0, "+"]);
  animations.push(["mixamorigRightHand", "rotation", "y", 0, "+"]);
  animations.push(["mixamorigRightForeArm", "rotation", "z", 0, "-"]);
  animations.push(["mixamorigRightForeArm", "rotation", "x", 0, "-"]);
  animations.push(["mixamorigRightArm", "rotation", "x", 0, "+"]);

  ref.animations.push(animations);
};

export const NUMBER_ANIMATIONS = Object.freeze({
  "0": numberSign({ curl: Math.PI / 3.2, thumbFold: -Math.PI / 6 }),
  "1": numberSign({ fingers: ['Index'] }),
  "2": numberSign({ fingers: ['Index', 'Middle'] }),
  "3": numberSign({ fingers: ['Index', 'Middle', 'Ring'] }),
  "4": numberSign({ fingers: ['Index', 'Middle', 'Ring', 'Pinky'] }),
  "5": numberSign({ thumb: true, fingers: ['Index', 'Middle', 'Ring', 'Pinky'] }),
  "6": numberSign({ fingers: ['Pinky'] }),
  "7": numberSign({ thumb: true, fingers: ['Index'] }),
  "8": numberSign({ thumb: true, fingers: ['Index', 'Middle'] }),
  "9": numberSign({ thumb: true }),
});
