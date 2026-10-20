/** Illustration geometry only. Never used by the tracker, classifier or datasets. */
export const STORY_JOINTS = [
  [230, 362], [199, 316], [168, 288], [141, 258], [119, 231],
  [202, 262], [191, 213], [188, 165], [186, 126],
  [233, 253], [235, 190], [236, 139], [237, 92],
  [264, 265], [275, 211], [279, 168], [281, 131],
  [289, 283], [310, 248], [322, 217], [331, 188],
] as const
export const STORY_FINGERS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]]
export const STORY_OUTLINE = 'M 197 408 L 193 358 Q 185 327 173 310 L 115 247 Q 97 229 109 218 Q 120 207 134 220 L 176 262 L 167 141 Q 164 120 183 117 Q 200 116 204 140 L 210 214 L 214 105 Q 214 86 233 84 Q 254 84 255 107 L 252 214 L 262 141 Q 266 121 283 126 Q 300 131 297 151 L 284 237 L 313 181 Q 322 165 337 174 Q 352 182 343 201 L 315 287 Q 309 322 289 347 L 282 408 Z'
export const STORY_SEGMENTS = STORY_FINGERS.flatMap((chain, finger) => chain.slice(1).map((joint, index) => ({ from: chain[index], to: joint, finger })))
export const STORY_BEATS = [
  { number: '01', title: 'Your hands lead.', text: 'Start with a sign you know. Give both hands a little light and a little room to move.', tag: 'A space for expression' },
  { number: '02', title: 'Every small movement.', text: '21 landmarks map each hand. Tracking happens right here, on your device.', tag: '21 points per hand' },
  { number: '03', title: 'A vocabulary that’s yours.', text: 'Hand shapes are centred and scaled, then compared with the built-in ISL library. Add personal signs whenever you like.', tag: 'Ready when you are' },
  { number: '04', title: 'A thought becomes a voice.', text: 'Hold a supported sign to add a letter. Shape your text into a sentence, then choose a voice when you’re ready.', tag: 'Letters. Words. Connection.' },
] as const
export const STORY_SENTENCE = 'Hello, world.'
export const STORY_SNAPSHOTS = [.2, .48, .71, 1] as const

export function storyBeat(progress: number) {
  return Math.min(3, Math.max(0, Math.floor(progress * 4)))
}
