/**
 * Indian Sign Language (ISL) Text-to-Gloss NLP Engine
 * 
 * Converts spoken/written English into grammatically structured ISL Gloss format:
 * 1. Time / Temporal markers at the beginning
 * 2. Subject - Object - Verb (SOV) order
 * 3. Copulas (is, am, are, was, were) and Stopwords (a, an, the, to, of) removed
 * 4. Verb Lemmatization (eating -> EAT, went -> GO)
 * 5. Negations (NOT, NO) placed at the end of the clause
 * 6. WH-Question words (WHAT, WHERE, WHY, WHO, WHEN, HOW) placed at the very end
 */

import { getDictionaryGloss, ISL_GLOSS_DICTIONARY } from "./glossDictionary.js";
import { containsDevanagari, hindiSentenceToGloss } from "./hindiToGloss.js";
import { SUPPORTED_TOKENS, SUPPORTED_TOKEN_SET, SIGN_TEXT_ALIASES } from "../../lib/islVocabulary";

// The translator, voice input, quick controls and animation queue all share
// these canonical gloss tokens.  The action IDs are deliberately UI/debug
// metadata: AvatarPlayer resolves the matching uppercase token to its existing
// procedural gesture function.
export const SUPPORTED_SIGNS = Object.freeze({
  you: { token: "YOU", actionId: "clip_you", label: "YOU" },
  home: { token: "HOME", actionId: "clip_home", label: "HOME" },
  time: { token: "TIME", actionId: "clip_time", label: "TIME" },
  person: { token: "PERSON", actionId: "clip_person", label: "PERSON" },
  hello: { token: "HELLO", actionId: "clip_hello", label: "HELLO" },
  help: { token: "HELP", actionId: "clip_help", label: "HELP" },
  please: { token: "PLEASE", actionId: "clip_please", label: "PLEASE" },
  sorry: { token: "SORRY", actionId: "clip_sorry", label: "SORRY" },
  welcome: { token: "WELCOME", actionId: "clip_welcome", label: "WELCOME" },
  good: { token: "GOOD", actionId: "clip_good", label: "GOOD" },
  bad: { token: "BAD", actionId: "clip_bad", label: "BAD" },
  stop: { token: "STOP", actionId: "clip_stop", label: "STOP" },
  wait: { token: "WAIT", actionId: "clip_wait", label: "WAIT" },
  "wait minute": { token: "WAIT_MINUTE", actionId: "clip_waitminute", label: "WAIT MINUTE" },
  "wait a minute": { token: "WAIT_MINUTE", actionId: "clip_waitminute", label: "WAIT A MINUTE" },
  come: { token: "COME", actionId: "clip_come", label: "COME" },
  go: { token: "GO", actionId: "clip_go", label: "GO" },
  want: { token: "WANT", actionId: "clip_want", label: "WANT" },
  need: { token: "NEED", actionId: "clip_need", label: "NEED" },
  like: { token: "LIKE", actionId: "clip_like", label: "LIKE" },
  know: { token: "KNOW", actionId: "clip_know", label: "KNOW" },
  understand: { token: "UNDERSTAND", actionId: "clip_understand", label: "UNDERSTAND" },
  ask: { token: "ASK", actionId: "clip_ask", label: "ASK" },
  drink: { token: "DRINK", actionId: "clip_drink", label: "DRINK" },
  eat: { token: "EAT", actionId: "clip_eat", label: "EAT" },
  water: { token: "WATER", actionId: "clip_water", label: "WATER" },
  give: { token: "GIVE", actionId: "clip_give", label: "GIVE" },
  take: { token: "TAKE", actionId: "clip_take", label: "TAKE" },
  show: { token: "SHOW", actionId: "clip_show", label: "SHOW" },
  look: { token: "LOOK", actionId: "clip_look", label: "LOOK" },
  see: { token: "SEE", actionId: "clip_see", label: "SEE" },
  listen: { token: "LISTEN", actionId: "clip_listen", label: "LISTEN" },
  talk: { token: "TALK", actionId: "clip_talk", label: "TALK" },
  start: { token: "START", actionId: "clip_start", label: "START" },
  finish: { token: "FINISH", actionId: "clip_finish", label: "FINISH" },
  again: { token: "AGAIN", actionId: "clip_again", label: "AGAIN" },
  sleep: { token: "SLEEP", actionId: "clip_sleep", label: "SLEEP" },
  toilet: { token: "TOILET", actionId: "clip_toilet", label: "TOILET" },
  doctor: { token: "DOCTOR", actionId: "clip_doctor", label: "DOCTOR" },
  hospital: { token: "HOSPITAL", actionId: "clip_hospital", label: "HOSPITAL" },
  pain: { token: "PAIN", actionId: "clip_pain", label: "PAIN" },
  school: { token: "SCHOOL", actionId: "clip_school", label: "SCHOOL" },
  class: { token: "CLASS", actionId: "clip_class", label: "CLASS" },
  teacher: { token: "TEACHER", actionId: "clip_teacher", label: "TEACHER" },
  student: { token: "STUDENT", actionId: "clip_student", label: "STUDENT" },
  book: { token: "BOOK", actionId: "clip_book", label: "BOOK" },
  "thank you": { token: "THANK_YOU", actionId: "clip_thankyou", label: "THANK YOU" },
  thankyou: { token: "THANK_YOU", actionId: "clip_thankyou", label: "THANK YOU" },
  thanks: { token: "THANK_YOU", actionId: "clip_thankyou", label: "THANK YOU" },
  yes: { token: "YES", actionId: "clip_yes", label: "YES" },
  no: { token: "NO", actionId: "clip_no", label: "NO" },
  i: { token: "I", actionId: "clip_i", label: "I" },
  me: { token: "I", actionId: "clip_i", label: "I" },
  my: { token: "MY", actionId: "clip_my", label: "MY" },
  mine: { token: "MY", actionId: "clip_my", label: "MY" },
  your: { token: "YOUR", actionId: "clip_your", label: "YOUR" },
  yours: { token: "YOUR", actionId: "clip_your", label: "YOUR" },
  love: { token: "LOVE", actionId: "clip_love", label: "LOVE" },
  meet: { token: "MEET", actionId: "clip_meet", label: "MEET" },
  morning: { token: "MORNING", actionId: "clip_morning", label: "MORNING" },
  ...Object.fromEntries(Object.entries(SIGN_TEXT_ALIASES).flatMap(([token, aliases]) => aliases.map(alias => [alias, {
    token, actionId: `clip_${token.toLowerCase().replaceAll('_', '')}`, label: token.replaceAll('_', ' '),
  }]))),
});

const SIGN_PHRASES = Object.keys(SUPPORTED_SIGNS).sort((left, right) => right.length - left.length);

export function getActionIdForGloss(token) {
  return Object.values(SUPPORTED_SIGNS).find((sign) => sign.token === token)?.actionId || null;
}

// Try to cover the WHOLE sentence with supported signs. Returns the token list
// (in ISL order, see `orderCoveredSigns`) only when every meaningful word
// resolves to a known sign; a partial hit (e.g. the lone "you" in "bro what are
// you doing") returns null so the caller falls through to the grammar +
// dictionary + fingerspelling path and no word is silently dropped. Numbers
// are never covered, so a sentence containing one always takes that path.
function coverSentenceWithSigns(sentence) {
  const normalized = sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return null;
  const words = normalized.split(" ");
  const covered = new Array(words.length).fill(false);
  const tokens = [];

  for (let index = 0; index < words.length;) {
    let best = null;
    for (const phrase of SIGN_PHRASES) {
      const parts = phrase.split(" ");
      if (parts.length > words.length - index) continue;
      const hit = parts.every((part, offset) => words[index + offset] === part);
      if (hit && (!best || parts.length > best.length)) best = { phrase, length: parts.length };
    }
    if (best) {
      tokens.push(SUPPORTED_SIGNS[best.phrase].token);
      for (let offset = 0; offset < best.length; offset += 1) covered[index + offset] = true;
      index += best.length;
    } else {
      index += 1;
    }
  }

  for (let index = 0; index < words.length; index += 1) {
    if (!covered[index] && !COVERAGE_SKIP_WORDS.has(words[index])) return null;
  }
  return tokens.length > 0 ? orderCoveredSigns(tokens) : null;
}

const LEADING_INTERJECTIONS = new Set(["HELLO", "THANK_YOU", "SORRY", "PLEASE", "WELCOME", "YES", "NO"]);

// Apply the same ISL order as the grammar path to a fully covered sentence:
// leading greetings/answers stay first, then time, subject, object, verb,
// negation and question ("I eat water" -> I WATER EAT; "Hello, I need help"
// -> HELLO I NEED HELP). Tokens keep their spoken order within each group.
function orderCoveredSigns(tokens) {
  const lead = [];
  const groups = { TIME: [], SUBJECT: [], OBJECT: [], VERB: [], NEGATION: [], QUESTION: [] };
  tokens.forEach((token, index) => {
    if (index === lead.length && LEADING_INTERJECTIONS.has(token)) {
      lead.push(token);
      return;
    }
    const { role } = classifyToken(token.toLowerCase());
    (groups[role] ?? groups.OBJECT).push(token);
  });
  return [...lead, ...groups.TIME, ...groups.SUBJECT, ...groups.OBJECT, ...groups.VERB, ...groups.NEGATION, ...groups.QUESTION];
}

// Common ISL Idiomatic and Compound Phrases
const PHRASE_DICTIONARY = {
  "HOW ARE YOU": ["YOU", "HOW"],
  "HOW ARE YOU DOING": ["YOU", "HOW"],
  "WHAT IS YOUR NAME": ["YOUR", "NAME", "WHAT"],
  "WHAT'S YOUR NAME": ["YOUR", "NAME", "WHAT"],
  "MY NAME IS": ["MY", "NAME"],
  "WHERE DO YOU LIVE": ["YOU", "LIVE", "WHERE"],
  "WHERE ARE YOU FROM": ["YOU", "WHERE", "FROM"],
  "WHERE ARE YOU GOING": ["YOU", "GO", "WHERE"],
  "SEE YOU LATER": ["LATER", "YOU", "SEE"],
  "NICE TO MEET YOU": ["YOU", "MEET"],
  "GOOD MORNING": ["GOOD", "MORNING"],
  "GOOD AFTERNOON": ["GOOD", "AFTERNOON"],
  "GOOD EVENING": ["GOOD", "EVENING"],
  "GOOD NIGHT": ["GOOD", "NIGHT"],
  "THANK YOU": ["THANK_YOU"],
  "THANK YOU VERY MUCH": ["THANK_YOU"],
  "PLEASE HELP ME": ["ME", "HELP", "PLEASE"],
  "HELP ME": ["ME", "HELP"],
  "HELP": ["HELP"],
  "PLEASE": ["PLEASE"],
  "SORRY": ["SORRY"],
  "THANKS A LOT": ["THANK_YOU"],
  "WELCOME": ["WELCOME"],
  "YOU ARE WELCOME": ["WELCOME"],
  "I AM SORRY": ["SORRY"],
  "YES": ["YES"],
  "NO": ["NO"],
  "GOOD": ["GOOD"],
  "BAD": ["BAD"],
  "STOP": ["STOP"],
  "WAIT": ["WAIT"],
  "COME HERE": ["HERE", "COME"],
  "GO THERE": ["THERE", "GO"],
  "GIVE ME": ["ME", "GIVE"],
  "TAKE THIS": ["THIS", "TAKE"],
  "I WANT": ["I", "WANT"],
  "I NEED": ["I", "NEED"],
  "I LIKE": ["I", "LIKE"],
  "I KNOW": ["I", "KNOW"],
  "I UNDERSTAND": ["I", "UNDERSTAND"],
  "CALL POLICE": ["POLICE", "CALL"],
  "WHERE IS HOSPITAL": ["HOSPITAL", "WHERE"],
  "WHERE IS TOILET": ["TOILET", "WHERE"],
  "WHERE IS DOCTOR": ["DOCTOR", "WHERE"],
  "I AM IN PAIN": ["I", "PAIN"],
  "I HAVE PAIN": ["I", "PAIN"],
  "I GO TO SCHOOL": ["I", "SCHOOL", "GO"],
  "I GO TO COLLEGE": ["I", "COLLEGE", "GO"],
  "I READ BOOK": ["I", "BOOK", "READ"],
  "I WRITE EXAM": ["I", "EXAM", "WRITE"],
  "I STUDY COMPUTER": ["I", "COMPUTER", "STUDY"],
  "I LOVE YOU": ["I", "YOU", "LOVE"],
  "I DO NOT KNOW": ["I", "KNOW", "NOT"],
  "I DONT KNOW": ["I", "KNOW", "NOT"],
  "HOW MUCH": ["HOW_MUCH"],
  "HOW MANY": ["HOW_MANY"],
  "COME IN": ["COME_IN"],
  "GO OUT": ["GO_OUT"],
  "NEED HELP": ["NEED_HELP"],
  "WAIT A MINUTE": ["WAIT_MINUTE"]
};

// Contractions map
const CONTRACTIONS = {
  "what's": "what is",
  "whats": "what is",
  "where's": "where is",
  "wheres": "where is",
  "how's": "how is",
  "hows": "how is",
  "who's": "who is",
  "whos": "who is",
  "it's": "it is",
  "that's": "that is",
  "there's": "there is",
  "i'm": "i am",
  "im": "i am",
  "you're": "you are",
  "youre": "you are",
  "we're": "we are",
  "they're": "they are",
  "he's": "he is",
  "she's": "she is",
  "don't": "do not",
  "dont": "do not",
  "doesn't": "does not",
  "doesnt": "does not",
  "didn't": "did not",
  "didnt": "did not",
  "can't": "cannot",
  "cant": "cannot",
  "won't": "will not",
  "wont": "will not",
  "isn't": "is not",
  "isnt": "is not",
  "aren't": "are not",
  "arent": "are not",
  "wasn't": "was not",
  "wasnt": "was not",
  "weren't": "were not",
  "werent": "were not",
  "haven't": "have not",
  "havent": "have not",
  "hasn't": "has not",
  "hasnt": "has not",
  "hadn't": "had not",
  "hadnt": "had not",
  "wouldn't": "would not",
  "couldn't": "could not",
  "shouldn't": "should not"
};

// Irregular verb lemmatization dictionary
const IRREGULAR_VERBS = {
  "went": "go", "gone": "go", "going": "go", "goes": "go",
  "ate": "eat", "eaten": "eat", "eating": "eat", "eats": "eat",
  "drank": "drink", "drunk": "drink", "drinking": "drink", "drinks": "drink",
  "saw": "see", "seen": "see", "seeing": "see", "sees": "see",
  "came": "come", "coming": "come", "comes": "come",
  "ran": "run", "running": "run", "runs": "run",
  "wrote": "write", "written": "write", "writing": "write", "writes": "write",
  "read": "read", "reading": "read", "reads": "read",
  "bought": "buy", "buying": "buy", "buys": "buy",
  "spoke": "speak", "spoken": "speak", "speaking": "speak", "speaks": "speak",
  "thought": "think", "thinking": "think", "thinks": "think",
  "took": "take", "taken": "take", "taking": "take", "takes": "take",
  "gave": "give", "given": "give", "giving": "give", "gives": "give",
  "knew": "know", "known": "know", "knowing": "know", "knows": "know",
  "slept": "sleep", "sleeping": "sleep", "sleeps": "sleep",
  "taught": "teach", "teaching": "teach", "teaches": "teach",
  "built": "build", "building": "build", "builds": "build",
  "said": "say", "saying": "say", "says": "say",
  "met": "meet", "meeting": "meet", "meets": "meet",
  "made": "make", "making": "make", "makes": "make",
  "felt": "feel", "feeling": "feel", "feels": "feel",
  "heard": "hear", "hearing": "hear", "hears": "hear",
  "found": "find", "finding": "find", "finds": "find",
  "told": "tell", "telling": "tell", "tells": "tell",
  "worked": "work", "working": "work", "works": "work",
  "played": "play", "playing": "play", "plays": "play",
  "learned": "learn", "learning": "learn", "learns": "learn",
  "studied": "study", "studying": "study", "studies": "study",
  "watched": "watch", "watching": "watch", "watches": "watch",
  "cried": "cry", "crying": "cry", "cries": "cry",
  "smiled": "smile", "smiling": "smile", "smiles": "smile",
  "laughed": "laugh", "laughing": "laugh", "laughs": "laugh",
  "helped": "help", "helping": "help", "helps": "help",
  "walked": "walk", "walking": "walk", "walks": "walk",
  "talked": "talk", "talking": "talk", "talks": "talk",
  "listened": "listen", "listening": "listen", "listens": "listen",
  "called": "call", "calling": "call", "calls": "call",
  "asked": "ask", "asking": "ask", "asks": "ask",
  "looked": "look", "looking": "look", "looks": "look",
  "opened": "open", "opening": "open", "opens": "open",
  "closed": "close", "closing": "close", "closes": "close",
  "started": "start", "starting": "start", "starts": "start",
  "stopped": "stop", "stopping": "stop", "stops": "stop",
  "liked": "like", "liking": "like", "likes": "like",
  "loved": "love", "loving": "love", "loves": "love",
  "wanted": "want", "wanting": "want", "wants": "want",
  "needed": "need", "needing": "need", "needs": "need",
  "brought": "bring", "bringing": "bring", "brings": "bring",
  "sent": "send", "sending": "send", "sends": "send",
  "received": "receive", "receiving": "receive", "receives": "receive",
  "kept": "keep", "keeping": "keep", "keeps": "keep",
  "used": "use", "using": "use", "uses": "use",
  "did": "do", "done": "do", "doing": "do", "does": "do",
  "tried": "try", "trying": "try", "tries": "try",
  "began": "begin", "begun": "begin", "beginning": "begin", "begins": "begin",
  "changed": "change", "changing": "change", "changes": "change",
  "remembered": "remember", "remembering": "remember", "remembers": "remember",
  "forgot": "forget", "forgotten": "forget", "forgetting": "forget", "forgets": "forget",
  "believed": "believe", "believing": "believe", "believes": "believe",
  "sat": "sit", "sitting": "sit", "sits": "sit",
  "stood": "stand", "standing": "stand", "stands": "stand"
};

// Common plural to singular mappings
const PLURAL_NOUNS = {
  "apples": "apple", "books": "book", "children": "child", "kids": "kid",
  "people": "person", "men": "man", "women": "woman", "cars": "car",
  "houses": "house", "days": "day", "friends": "friend", "students": "student",
  "teachers": "teacher", "dogs": "dog", "cats": "cat", "birds": "bird",
  "fruits": "fruit", "flowers": "flower", "trees": "tree", "hands": "hand",
  "eyes": "eye", "legs": "leg", "letters": "letter", "videos": "video",
  "pictures": "picture", "questions": "question", "answers": "answer",
  "markets": "market", "shops": "shop", "cities": "city", "villages": "village", "parks": "park", "offices": "office",
  "vegetables": "vegetable",
  "rooms": "room", "doors": "door", "windows": "window", "chairs": "chair", "tables": "table", "bags": "bag", "keys": "key",
  "boys": "boy", "girls": "girl", "parents": "parent", "families": "family", "neighbors": "neighbor", "mothers": "mother", "fathers": "father", "brothers": "brother", "sisters": "sister", "names": "name", "ages": "age"
};

// Temporal / Time markers (placed first in ISL)
const TIME_WORDS = new Set([
  "yesterday", "today", "tomorrow", "now", "later", "before", "early",
  "morning", "afternoon", "evening", "night", "daily", "always",
  "sometimes", "soon", "recently", "tonight", "time", "monday",
  "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "year", "month", "week", "day", "hour", "minute", "past", "future",
  "already", "everyday", "last-night", "yesterday-night", "late"
]);

// Interrogative / Question words (placed at the very end in ISL)
const QUESTION_WORDS = new Set([
  "what", "where", "when", "why", "who", "whom", "whose", "which", "how", "how_much", "how_many"
]);

// Negation words (placed at the end or after verb in ISL)
const NEGATION_WORDS = new Set([
  "not", "no", "never", "nothing", "nobody", "none", "neither", "nor", "cannot"
]);

// Pronouns / Subjects
const PRONOUNS = new Set([
  "i", "me", "my", "mine", "myself",
  "you", "your", "yours", "yourself",
  "he", "him", "his", "himself",
  "she", "her", "hers", "herself",
  "it", "its", "itself",
  "we", "us", "our", "ours", "ourselves",
  "they", "them", "their", "theirs", "themselves",
  "this", "that", "these", "those"
]);

// Known Verbs set for POS disambiguation
const KNOWN_VERBS = new Set([
  "go", "come", "eat", "drink", "see", "run", "write", "read", "buy",
  "speak", "think", "take", "give", "know", "sleep", "teach", "build",
  "say", "meet", "make", "feel", "hear", "find", "tell", "work",
  "play", "learn", "study", "watch", "cry", "smile", "laugh", "help",
  "walk", "talk", "listen", "call", "ask", "look", "open", "close",
  "start", "stop", "like", "love", "want", "need", "live", "stay",
  "bring", "cook", "stand", "sit", "wait", "drive", "fly", "jump",
  "dance", "sing", "win", "lose", "cut", "clean", "wash", "pay",
  "send", "receive", "keep", "use", "do", "try", "begin", "change", 
  "remember", "forget", "believe"
]);

// Stopwords & Copulas to strip
const STOPWORDS = new Set([
  "a", "an", "the",
  "is", "am", "are", "was", "were", "be", "been", "being",
  "do", "does", "did",
  "to", "of", "for", "at", "by", "from", "with", "into", "onto", "upon", "about", "as",
  "and", "or", "so", "than", "that",
  "will", "shall", "would", "should", "could", "may", "might", "must", "can"
]);

// Words that carry no ISL sign of their own, so `coverSentenceWithSigns` may
// leave them uncovered and still treat the sentence as fully signed.
// Pronouns are deliberately absent: an uncovered "we" or "us" must reach the
// grammar path, which keeps the participant instead of dropping it.
const COVERAGE_SKIP_WORDS = new Set([
  ...STOPWORDS,
  "yeah", "yep", "ok", "okay"
]);

// Spoken numbers become digits, which the avatar signs with number handshapes.
const NUMBER_WORDS = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16",
  seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20", hundred: "100", thousand: "1000"
};

// Every word the engine can already sign or classify. Suffix stripping only
// accepts a stem from this set, so names and unknown words are never cut down
// into a different word ("James" stays JAMES, not JAM).
const KNOWN_WORDS = new Set([
  ...Object.keys(SUPPORTED_SIGNS),
  ...SUPPORTED_TOKENS.map((token) => token.toLowerCase().replace(/_/g, " ")),
  ...Object.keys(ISL_GLOSS_DICTIONARY),
  ...KNOWN_VERBS,
  ...Object.values(IRREGULAR_VERBS),
  ...Object.values(PLURAL_NOUNS),
  ...TIME_WORDS,
  ...QUESTION_WORDS,
  ...NEGATION_WORDS,
  ...PRONOUNS
]);

/**
 * Expands contractions in text
 */
function expandContractions(text) {
  let words = text.split(/\s+/);
  return words.map(w => {
    let clean = w.toLowerCase().replace(/[^a-z']/g, "");
    if (CONTRACTIONS[clean]) {
      return CONTRACTIONS[clean];
    }
    return w;
  }).join(" ");
}

/**
 * Lemmatizes a single word into its root form
 */
export function lemmatizeWord(word) {
  const lower = word.toLowerCase();

  if (IRREGULAR_VERBS[lower]) return IRREGULAR_VERBS[lower];
  if (PLURAL_NOUNS[lower]) return PLURAL_NOUNS[lower];
  // Already a known word (CLOTHES, BUS, NEWS): keep it whole.
  if (KNOWN_WORDS.has(lower)) return lower;

  for (const base of suffixStems(lower)) {
    if (KNOWN_WORDS.has(base)) return base;
  }
  // Unknown words, including names, are fingerspelled exactly as written.
  return lower;
}

// Candidate stems for common English endings, most specific first.
function suffixStems(lower) {
  const stems = [];
  const undouble = (base) => base.length >= 3 && base[base.length - 1] === base[base.length - 2] ? [base.slice(0, -1)] : [];
  if (lower.endsWith("ing") && lower.length > 5) {
    const base = lower.slice(0, -3);
    stems.push(base, `${base}e`, ...undouble(base)); // eating, making, running
  }
  if (lower.endsWith("ed") && lower.length > 4) {
    const base = lower.slice(0, -2);
    stems.push(base, `${base}e`, ...undouble(base)); // walked, closed, stopped
    if (base.endsWith("i")) stems.push(`${base.slice(0, -1)}y`); // studied
  }
  if (lower.endsWith("ies") && lower.length > 4) stems.push(`${lower.slice(0, -3)}y`);
  if (lower.endsWith("es") && lower.length > 4) stems.push(lower.slice(0, -2));
  if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 3) stems.push(lower.slice(0, -1));
  return stems;
}

/**
 * Classifies a token into ISL grammatical role
 */
function classifyToken(token) {
  // Match closed-class words on the raw form first: lemmatization strips "-ing"
  // ("morning" -> "morn") and "-ed", which would hide TIME/QUESTION/NEGATION
  // words from these sets and mangle the fingerspelled fallback.
  const raw = token.toLowerCase().replace(/[^a-z_]/g, "");
  if (/^[0-9]+$/.test(token)) return { role: "OBJECT", value: token };
  if (NUMBER_WORDS[raw]) return { role: "OBJECT", value: NUMBER_WORDS[raw] };
  let lemma = lemmatizeWord(token);

  if (TIME_WORDS.has(raw)) return { role: "TIME", value: raw.toUpperCase() };
  if (QUESTION_WORDS.has(raw)) return { role: "QUESTION", value: raw.toUpperCase() };
  if (NEGATION_WORDS.has(raw)) return { role: "NEGATION", value: raw.toUpperCase() };
  if (PRONOUNS.has(raw)) return { role: "SUBJECT", value: raw.toUpperCase() };

  if (TIME_WORDS.has(lemma)) return { role: "TIME", value: lemma.toUpperCase() };
  if (QUESTION_WORDS.has(lemma)) return { role: "QUESTION", value: lemma.toUpperCase() };
  if (NEGATION_WORDS.has(lemma)) return { role: "NEGATION", value: lemma.toUpperCase() };
  if (PRONOUNS.has(lemma)) return { role: "SUBJECT", value: lemma.toUpperCase() };
  if (KNOWN_VERBS.has(lemma)) return { role: "VERB", value: lemma.toUpperCase() };

  // Fallback noun/object
  return { role: "OBJECT", value: lemma.toUpperCase() };
}

/**
 * Transforms a single sentence into ISL Gloss order (SOV + Time + Question + Negation rules)
 */
function convertSentenceToGloss(sentence) {
  let cleanSentence = sentence.trim().toUpperCase().replace(/[.,!]/g, "");

  // A standalone canonical gloss (including compound names such as COME_IN)
  // should reach its restored animation without losing underscores in NLP.
  if (SUPPORTED_TOKEN_SET.has(cleanSentence)) {
    return { tokens: [cleanSentence], text: cleanSentence };
  }

  // 1. Direct idiomatic phrase match (most specific, highest priority).
  if (PHRASE_DICTIONARY[cleanSentence]) {
    return {
      tokens: PHRASE_DICTIONARY[cleanSentence],
      text: PHRASE_DICTIONARY[cleanSentence].join(" ")
    };
  }

  // 2. Whole-sentence supported-sign match. Only short-circuits when every
  //    meaningful word maps to a known sign; partial hits fall through so the
  //    grammar + dictionary + fingerspelling path can handle the rest.
  const coveredSigns = coverSentenceWithSigns(sentence);
  if (coveredSigns) {
    return { tokens: coveredSigns, text: coveredSigns.join(" ") };
  }

  // 3. Expand contractions and tokenize
  let expanded = expandContractions(sentence.replace(/[?!.,]/g, " "));
  let rawTokens = expanded.split(/\s+/).filter(w => w.trim().length > 0);

  // Keep multi-word WH terms together even when they appear inside a longer
  // sentence, e.g. "How many dogs?" -> "DOG HOW_MANY".
  const mergedTokens = [];
  for (let index = 0; index < rawTokens.length; index += 1) {
    const current = rawTokens[index].toLowerCase().replace(/[^a-z]/g, "");
    const next = rawTokens[index + 1]?.toLowerCase().replace(/[^a-z]/g, "");
    if (current === "how" && (next === "many" || next === "much")) {
      mergedTokens.push(`how_${next}`);
      index += 1;
    } else {
      mergedTokens.push(rawTokens[index]);
    }
  }
  rawTokens = mergedTokens;

  // A run of individual letters or digits is fingerspelling, not an English
  // sentence. "a b c d" must retain A, and "b b" must keep both letters, so
  // the run becomes one hyphenated spelling token (A-B-C-D, B-B). That form
  // also keeps a spelled I from playing as the pronoun sign.
  const normalizedTokens = rawTokens
    .map(token => token.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean);
  if (normalizedTokens.length > 0 && normalizedTokens.every(token => /^[a-z0-9]$/i.test(token))) {
    const tokens = [normalizedTokens.map(token => token.toUpperCase()).join("-")];
    return { tokens, text: tokens.join(" ") };
  }

  // 4. Filter stopwords (except when part of specific grammar)
  let filtered = [];
  for (let t of rawTokens) {
    let lower = t.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!lower) continue;
    if (!STOPWORDS.has(lower) || QUESTION_WORDS.has(lower) || NEGATION_WORDS.has(lower) || PRONOUNS.has(lower)) {
      filtered.push(t);
    }
  }

  if (filtered.length === 0) {
    return { tokens: [], text: "" };
  }

  // 5. Categorize tokens
  let timeTokens = [];
  let subjectTokens = [];
  let objectTokens = [];
  let verbTokens = [];
  let negationTokens = [];
  let questionTokens = [];
  let otherTokens = [];

  for (let raw of filtered) {
    let info = classifyToken(raw);
    switch (info.role) {
      case "TIME":
        timeTokens.push(info.value);
        break;
      case "QUESTION":
        questionTokens.push(info.value);
        break;
      case "NEGATION":
        negationTokens.push(info.value);
        break;
      case "SUBJECT":
        subjectTokens.push(info.value);
        break;
      case "VERB":
        verbTokens.push(info.value);
        break;
      case "OBJECT":
        objectTokens.push(info.value);
        break;
      default:
        otherTokens.push(info.value);
    }
  }

  // 6. Synthesize ISL Word Order:
  // [TIME] -> [SUBJECT] -> [OBJECT] -> [OTHER / ADJ] -> [VERB] -> [NEGATION] -> [QUESTION]
  let glossTokens = [];

  glossTokens.push(...timeTokens);
  glossTokens.push(...subjectTokens);
  glossTokens.push(...objectTokens);
  glossTokens.push(...otherTokens);
  glossTokens.push(...verbTokens);
  glossTokens.push(...negationTokens);
  glossTokens.push(...questionTokens);

  // Handle case where sentence is empty or standard single-word
  if (glossTokens.length === 0) {
    glossTokens = filtered.map(w => lemmatizeWord(w).toUpperCase());
  }

  const dictionaryTokens = glossTokens.flatMap((token) => getDictionaryGloss(token) || [token]);

  return {
    tokens: dictionaryTokens,
    text: dictionaryTokens.join(" ")
  };
}

// First and second person now have dedicated signs: I (index to own chest),
// MY (flat palm on chest), YOU (point out), YOUR (palm pushed out). Third person
// collapses to the single PERSON sign — ISL disambiguates by where you point,
// which this rig can't do. Plural first person ("we"/"us") uses the "I" point
// as the closest available sign. Third-person possessives and objects
// ("her", "his", "their") also map to PERSON so the participant is kept.
const PRONOUN_TO_SIGN = {
  I: "I", ME: "I", MYSELF: "I", WE: "I", US: "I", OURSELVES: "I",
  MY: "MY", MINE: "MY", OUR: "MY", OURS: "MY",
  YOU: "YOU", YOUR: "YOUR", YOURS: "YOUR", YOURSELF: "YOUR", YOURSELVES: "YOUR",
  HE: "PERSON", HIM: "PERSON", HIMSELF: "PERSON", SHE: "PERSON", HERSELF: "PERSON",
  THEY: "PERSON", THEM: "PERSON", THEMSELVES: "PERSON",
  HIS: "PERSON", HER: "PERSON", HERS: "PERSON", THEIR: "PERSON", THEIRS: "PERSON",
};

// Every negation plays the existing NO sign, matching the online prompt.
const NEGATION_TOKENS = new Set([...NEGATION_WORDS].map((word) => word.toUpperCase()));

/**
 * Final cleanup on a gloss token list: fold pronouns and negations onto a
 * playable sign, and collapse a repeat only when pronoun folding created it
 * ("he and she" -> PERSON, not PERSON PERSON). Explicit repeats stay.
 */
function normalizeGlossTokens(tokens) {
  const out = [];
  let previousFromPronoun = false;
  for (const token of tokens) {
    const word = NEGATION_TOKENS.has(token) ? "NO" : token;
    const fromPronoun = word in PRONOUN_TO_SIGN;
    const mapped = fromPronoun ? PRONOUN_TO_SIGN[word] : word;
    if (!mapped) continue;
    if (fromPronoun && previousFromPronoun && out[out.length - 1] === mapped) continue;
    out.push(mapped);
    previousFromPronoun = fromPronoun;
  }
  return out;
}

// Every proper prefix of a multi-word sign or idiom ("thank", "thank you very",
// "how", "wait a"...). Live speech holds such trailing words back so a phrase
// split across recognizer updates still reaches the phrase mapping whole.
const PHRASE_PREFIXES = (() => {
  const prefixes = new Set();
  const phrases = [
    ...Object.keys(SUPPORTED_SIGNS),
    ...Object.keys(PHRASE_DICTIONARY).map((phrase) => phrase.toLowerCase()),
    "how many", "how much",
  ];
  for (const phrase of phrases) {
    const parts = phrase.split(" ");
    for (let length = 1; length < parts.length; length += 1) prefixes.add(parts.slice(0, length).join(" "));
  }
  return prefixes;
})();

/** How many trailing words could still grow into a multi-word sign (0-3). */
export function trailingPhrasePrefixLength(words) {
  const clean = words.map((word) => String(word).toLowerCase().replace(/[^a-z']/g, ""));
  for (let length = Math.min(3, clean.length); length > 0; length -= 1) {
    if (PHRASE_PREFIXES.has(clean.slice(-length).join(" "))) return length;
  }
  return 0;
}

/**
 * Main function: Converts multi-sentence text to ISL Gloss
 *
 * @param {string} text - The input English sentence(s)
 * @returns {object} { glossText: string, tokens: string[], original: string, sentences: object[] }
 */
export function textToGloss(text) {
  if (!text || typeof text !== "string") {
    return {
      glossText: "",
      tokens: [],
      original: text || "",
      sentences: []
    };
  }

  // Split by sentence delimiters (period, question mark, exclamation, semicolon, newline)
  let rawSentences = text
    .split(/([.?!;\n।॥]+)/)
    .filter(s => s.trim().length > 0 && !s.match(/^[.?!;\n।॥]+$/));

  if (rawSentences.length === 0) {
    rawSentences = [text];
  }

  let allTokens = [];
  let sentenceResults = [];

  for (let s of rawSentences) {
    // Devanagari input (spoken or typed Hindi) uses the Hindi lexicon; any
    // English words inside it still go through the English engine.
    let res = containsDevanagari(s)
      ? { tokens: hindiSentenceToGloss(s, (word) => convertSentenceToGloss(word).tokens) }
      : convertSentenceToGloss(s);
    if (res.tokens.length > 0) {
      const tokens = normalizeGlossTokens(res.tokens);
      allTokens.push(...tokens);
      sentenceResults.push({ ...res, tokens, text: tokens.join(" ") });
    }
  }

  return {
    glossText: allTokens.join(" "),
    tokens: allTokens,
    original: text,
    sentences: sentenceResults
  };
}

export default textToGloss;
