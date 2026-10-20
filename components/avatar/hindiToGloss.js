/**
 * Offline Hindi (Devanagari) to ISL gloss.
 *
 * Hindi is already subject-object-verb, so word order is kept except that
 * question words move to the end and negation moves after the verb, matching
 * the English engine. Known words map to the avatar's supported signs; any
 * other Devanagari word is transliterated to Latin letters and fingerspelled
 * rather than dropped. The lexicon is deliberately small and literal: it
 * covers the avatar vocabulary, not general Hindi.
 */

const NUKTA = /़/g;
const CHANDRABINDU = /ँ/g;

// Lookup form: NFC, nukta removed, chandrabindu folded into anusvara, so
// "ज़रूरी"/"जरूरी" and "हाँ"/"हां" share an entry.
export function normalizeHindi(word) {
  return String(word).normalize("NFC").replace(NUKTA, "").replace(CHANDRABINDU, "ं");
}

const LEXICON_SOURCE = {
  YOU: "तुम आप तू तुझे तुम्हें आपको तुमको",
  YOUR: "तुम्हारा तुम्हारी तुम्हारे आपका आपकी आपके तेरा तेरी तेरे",
  I: "मैं मुझे मुझको मैंने हम हमें हमको हमने",
  MY: "मेरा मेरी मेरे हमारा हमारी हमारे",
  PERSON: "उसे उसको उन्हें उनको व्यक्ति इंसान लोग",
  HELLO: "नमस्ते नमस्कार हेलो हैलो",
  THANK_YOU: "धन्यवाद शुक्रिया थैंक्यू",
  YES: "हाँ हां",
  NO: "नहीं नही ना मत",
  PLEASE: "कृपया प्लीज़",
  SORRY: "माफ़ माफ़ी क्षमा सॉरी",
  WELCOME: "स्वागत",
  GOOD: "अच्छा अच्छी अच्छे बढ़िया ठीक",
  BAD: "बुरा बुरी बुरे ख़राब",
  STOP: "रुको रोको",
  WAIT: "इंतज़ार ठहरो रुकिए",
  COME: "आओ आइए आना आ आया आई आए आता आती आते",
  GO: "जाओ जाइए जाना जा गया गई गए जाता जाती जाते",
  WANT: "चाहता चाहती चाहते",
  NEED: "चाहिए ज़रूरत",
  LIKE: "पसंद",
  KNOW: "जानता जानती जानते जानना पता",
  UNDERSTAND: "समझ समझा समझी समझे समझता समझती समझते समझना",
  ASK: "पूछो पूछना पूछा पूछ",
  DRINK: "पीना पियो पीओ पी पिया पीता पीती पीते",
  EAT: "खाओ खा खाया खाता खाती खाते खाइए",
  FOOD: "खाना भोजन",
  WATER: "पानी जल",
  GIVE: "दो दीजिए देना दे दिया देता देती देते",
  TAKE: "लो लीजिए लेना ले लिया",
  SHOW: "दिखाओ दिखाना दिखा दिखाइए",
  LOOK: "देखो देखिए",
  SEE: "देखना देखा देख देखता देखती",
  LISTEN: "सुनो सुनिए सुनना सुन सुना",
  TALK: "बात बोलो बोलना बोल",
  START: "शुरू",
  FINISH: "ख़त्म समाप्त",
  AGAIN: "फिर दोबारा दुबारा",
  SLEEP: "सोओ सोना सो सोया नींद",
  TOILET: "शौचालय टॉयलेट बाथरूम",
  DOCTOR: "डॉक्टर डाक्टर चिकित्सक",
  HOSPITAL: "अस्पताल",
  PAIN: "दर्द पीड़ा",
  SCHOOL: "स्कूल विद्यालय",
  CLASS: "कक्षा क्लास",
  TEACHER: "शिक्षक अध्यापक टीचर गुरु",
  STUDENT: "छात्र छात्रा विद्यार्थी",
  BOOK: "किताब पुस्तक",
  READ: "पढ़ो पढ़ना पढ़ पढ़ा",
  WRITE: "लिखो लिखना लिख लिखा",
  STUDY: "पढ़ाई",
  LEARN: "सीखो सीखना सीख सीखा",
  EXAM: "परीक्षा इम्तिहान एग्ज़ाम",
  QUESTION: "सवाल प्रश्न",
  ANSWER: "जवाब उत्तर",
  COMPUTER: "कंप्यूटर कम्प्यूटर",
  COLLEGE: "कॉलेज",
  PHONE: "फ़ोन",
  MOBILE: "मोबाइल",
  EMERGENCY: "आपातकाल इमरजेंसी",
  DANGER: "ख़तरा",
  SAFE: "सुरक्षित",
  POLICE: "पुलिस",
  WHAT: "क्या",
  WHY: "क्यों",
  WHEN: "कब",
  WHERE: "कहाँ कहां",
  WHO: "कौन",
  HOW: "कैसे कैसा कैसी",
  WHICH: "कौनसा कौनसी",
  HOW_MUCH: "कितना कितनी",
  HOW_MANY: "कितने",
  ROAD: "सड़क रास्ता",
  CAR: "गाड़ी कार",
  TRAIN: "ट्रेन रेलगाड़ी",
  MARKET: "बाज़ार",
  SHOP: "दुकान",
  CITY: "शहर",
  VILLAGE: "गाँव गांव",
  PARK: "पार्क बगीचा",
  OFFICE: "दफ़्तर ऑफिस कार्यालय",
  MILK: "दूध",
  TEA: "चाय",
  COFFEE: "कॉफ़ी",
  FRUIT: "फल",
  VEGETABLE: "सब्ज़ी",
  RICE: "चावल",
  BREAD: "रोटी ब्रेड",
  BREAKFAST: "नाश्ता",
  HOUSE: "मकान",
  HOME: "घर",
  ROOM: "कमरा कमरे",
  DOOR: "दरवाज़ा",
  WINDOW: "खिड़की",
  CHAIR: "कुर्सी",
  TABLE: "मेज़",
  BAG: "बैग थैला",
  CLOTHES: "कपड़े कपड़ा",
  KEY: "चाबी",
  MONEY: "पैसा पैसे रुपये रुपए",
  MAN: "आदमी पुरुष",
  WOMAN: "औरत महिला",
  CHILD: "बच्चा बच्चे बच्ची",
  BOY: "लड़का लड़के",
  GIRL: "लड़की",
  FAMILY: "परिवार",
  FRIEND: "दोस्त मित्र",
  NEIGHBOR: "पड़ोसी",
  MOTHER: "माँ मां माता मम्मी",
  FATHER: "पिता पापा",
  BROTHER: "भाई भैया",
  SISTER: "बहन दीदी",
  NAME: "नाम",
  AGE: "उम्र आयु",
  LIVE: "रहता रहती रहते रहना",
  WORK: "काम",
  PLAY: "खेलो खेलना खेल",
  WALK: "चलो चलना चल",
  RUN: "दौड़ो दौड़",
  SIT: "बैठो बैठिए बैठना बैठ",
  STAND: "खड़े खड़ा",
  OPEN: "खोलो खोलना खोल",
  CLOSE: "बंद",
  BRING: "लाओ लाना ला",
  SEND: "भेजो भेजना भेज",
  KEEP: "रखो रखना रख",
  USE: "इस्तेमाल उपयोग",
  MAKE: "बनाओ बनाना बना",
  DO: "करो करना कर किया करता करती करते करिए कीजिए",
  TRY: "कोशिश",
  CHANGE: "बदलो बदलना बदल",
  REMEMBER: "याद",
  FORGET: "भूल भूलना भूला",
  THINK: "सोचो सोचना सोच",
  FEEL: "महसूस",
  BELIEVE: "विश्वास भरोसा",
  BECAUSE: "क्योंकि",
  HAPPY: "ख़ुश",
  SAD: "दुखी उदास",
  ANGRY: "गुस्सा नाराज़",
  SCARED: "डर डरा",
  TIRED: "थका थकी थके",
  READY: "तैयार",
  LATE: "देर",
  EARLY: "जल्दी",
  IMPORTANT: "ज़रूरी महत्वपूर्ण",
  LOVE: "प्यार प्रेम",
  MEET: "मिलो मिलना मिल मिले",
  MORNING: "सुबह",
  TIME: "समय वक़्त टाइम",
  HELP: "मदद सहायता",
  TELL: "बताओ बताना बता बताइए",
};

const LEXICON = new Map();
for (const [token, words] of Object.entries(LEXICON_SOURCE)) {
  for (const word of words.split(" ")) LEXICON.set(normalizeHindi(word), token);
}

// Copulas, postpositions and particles with no sign of their own.
const STOPWORDS = new Set(
  "है हैं हूँ हूं हो था थी थे का की के को से में पर और भी तो ही ने यह ये वह वो रहा रही रहे जी कि लिए एक"
    .split(" ").map(normalizeHindi),
);

// Inflection endings tried only when the remaining stem is a known word.
const SUFFIXES = ["ियों", "ाओं", "ाएं", "ों", "ें", "ीं", "ने", "ना", "ता", "ती", "ते", "ो", "े", "ी", "ा"];

const QUESTION_TOKENS = new Set(["WHAT", "WHY", "WHEN", "WHERE", "WHO", "HOW", "WHICH", "HOW_MUCH", "HOW_MANY"]);

function lookup(word) {
  if (STOPWORDS.has(word)) return "";
  if (LEXICON.has(word)) return LEXICON.get(word);
  for (const suffix of SUFFIXES) {
    if (word.length > suffix.length + 1 && word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (LEXICON.has(stem)) return LEXICON.get(stem);
    }
  }
  return null;
}

const VOWELS = { "अ": "A", "आ": "A", "इ": "I", "ई": "I", "उ": "U", "ऊ": "U", "ऋ": "RI", "ए": "E", "ऐ": "AI", "ओ": "O", "औ": "AU", "ऑ": "O", "ऍ": "E" };
const MATRAS = { "ा": "A", "ि": "I", "ी": "I", "ु": "U", "ू": "U", "ृ": "RI", "े": "E", "ै": "AI", "ो": "O", "ौ": "AU", "ॉ": "O", "ॅ": "E" };
const CONSONANTS = {
  "क": "K", "ख": "KH", "ग": "G", "घ": "GH", "ङ": "N", "च": "CH", "छ": "CHH", "ज": "J", "झ": "JH", "ञ": "N",
  "ट": "T", "ठ": "TH", "ड": "D", "ढ": "DH", "ण": "N", "त": "T", "थ": "TH", "द": "D", "ध": "DH", "न": "N",
  "प": "P", "फ": "PH", "ब": "B", "भ": "BH", "म": "M", "य": "Y", "र": "R", "ल": "L", "व": "V", "श": "SH",
  "ष": "SH", "स": "S", "ह": "H",
};
const NUKTA_CONSONANTS = { "क": "Q", "ख": "KH", "ग": "G", "ज": "Z", "ड": "R", "ढ": "RH", "फ": "F", "य": "Y" };
const VIRAMA = "्";

/** Romanize one Devanagari word for fingerspelling, e.g. "अमित" -> "AMIT". */
export function transliterateHindi(word) {
  const chars = Array.from(String(word).normalize("NFC"));
  let out = "";
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (CONSONANTS[char]) {
      const hasNukta = chars[index + 1] === "़";
      if (hasNukta) index += 1;
      out += hasNukta ? NUKTA_CONSONANTS[char] ?? CONSONANTS[char] : CONSONANTS[char];
      const next = chars[index + 1];
      // Inherent "a" unless a vowel sign or virama follows; dropped at word end.
      if (!MATRAS[next] && next !== VIRAMA && index + 1 < chars.length) out += "A";
    } else if (MATRAS[char]) out += MATRAS[char];
    else if (VOWELS[char]) out += VOWELS[char];
    else if (char === "ं" || char === "ँ") out += "N";
    else if (char === "ः") out += "H";
    else if (char >= "०" && char <= "९") out += String(char.charCodeAt(0) - 0x0966);
    else if (/[A-Za-z0-9]/.test(char)) out += char.toUpperCase();
  }
  return out;
}

const DEVANAGARI = /[ऀ-ॿ]/;
const DEVANAGARI_DIGITS = /[०-९]/g;

/**
 * Converts one Hindi (optionally mixed with English) sentence to gloss tokens.
 * `englishWord` resolves a Latin-script word with the English engine.
 */
export function hindiSentenceToGloss(sentence, englishWord) {
  const words = sentence
    .replace(DEVANAGARI_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0966))
    .split(/[\s,;:"'()\-–—]+/)
    .map((word) => word.replace(/[?!.।॥]/g, ""))
    .filter(Boolean);
  const lead = [];
  const body = [];
  const negation = [];
  const questions = [];
  for (const raw of words) {
    if (!DEVANAGARI.test(raw)) {
      body.push(...englishWord(raw));
      continue;
    }
    const token = lookup(normalizeHindi(raw));
    if (token === "") continue;
    if (token === null) {
      // Hyphenated so a romanization such as "GO" is spelled, never signed.
      const spelled = transliterateHindi(raw);
      if (spelled) body.push(Array.from(spelled).join("-"));
      continue;
    }
    if (QUESTION_TOKENS.has(token)) questions.push(token);
    else if (token === "NO" && body.length) negation.push(token);
    else if (!body.length && ["HELLO", "THANK_YOU", "SORRY", "PLEASE", "YES", "NO"].includes(token)) lead.push(token);
    else body.push(token);
  }
  return [...lead, ...body, ...negation, ...questions];
}

export function containsDevanagari(text) {
  return DEVANAGARI.test(String(text));
}
