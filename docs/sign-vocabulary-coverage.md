# Shared sign vocabulary coverage

Generated with `npm run coverage:sign`. Mechanical playback and model coverage only. No entry is certified for linguistic correctness or general webcam accuracy. Hindi aliases remain in the existing Hindi translator; none are certified by this report.

164 word entries; 152 bundled word entries (150 distinct model classes); 26 letters and 10 digits, of which 36 have bundled pose data.

Every animation below passes the YBot bone, completion and return-to-rest check. All linguistic reviews are pending. Runtime gates are experimental, not approval for general use. Source holdouts do not establish per-class webcam accuracy. Empty Hindi aliases mean unreviewed, not that Hindi translation was removed.

Word status: 50 evaluated-auto-accept, 76 trained-unevaluated, 3 auto-accept-below-test-target, 12 no-real-data, 23 evaluated-suggestion-only. Gates 0.56/0.15 were chosen on calibration signers; test clips are signer-disjoint. Recall and precision are runtime-gate results on that test split (accepted correct / clips, accepted correct / all accepts as that word).

| ID | Readable label / English aliases | Animation | Real data / trained | Train / calibration / test clips (signers) | Held-out recall, precision | Runtime | Model alias |
| --- | --- | --- | --- | --- | --- | --- | --- |
| word:YOU | YOU | valid | 158 / yes | 93 (10) / 24 (2) / 41 (4) | 0.634, 1 | calibrated-runtime-gates | - |
| word:HOME | HOME | valid | 149 / yes | 91 (10) / 21 (2) / 37 (4) | 0.73, 1 | calibrated-runtime-gates | - |
| word:TIME | TIME | valid | 150 / yes | 91 (10) / 21 (2) / 38 (4) | 0.579, 1 | calibrated-runtime-gates | - |
| word:PERSON | PERSON | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:HELLO | HELLO / hi, hey | valid | 143 / yes | 87 (10) / 19 (2) / 37 (4) | 0.784, 1 | calibrated-runtime-gates | - |
| word:HELP | HELP | valid | 149 / yes | 91 (10) / 20 (2) / 38 (4) | 0.474, 1 | calibrated-runtime-gates | - |
| word:PLEASE | PLEASE | valid | 153 / yes | 96 (10) / 20 (2) / 37 (4) | 0.432, 1 | calibrated-runtime-gates | - |
| word:SORRY | SORRY | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:WELCOME | WELCOME | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:GOOD | GOOD | valid | 151 / yes | 92 (10) / 21 (2) / 38 (4) | 0.895, 0.773 | calibrated-runtime-gates | - |
| word:BAD | BAD | valid | 145 / yes | 84 (10) / 20 (2) / 41 (4) | 0.659, 1 | calibrated-runtime-gates | - |
| word:STOP | STOP | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:WAIT | WAIT | valid | 155 / yes | 95 (10) / 20 (2) / 40 (4) | 0.475, 1 | calibrated-runtime-gates | - |
| word:COME | COME | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:GO | GO | valid | 149 / yes | 88 (10) / 23 (2) / 38 (4) | 0.553, 1 | calibrated-runtime-gates | - |
| word:WANT | WANT | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:NEED | NEED | valid | 0 / no | 0 (0) / 0 (0) / 0 (0) | - | unavailable-without-personal-data | - |
| word:LIKE | LIKE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:KNOW | KNOW | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:UNDERSTAND | UNDERSTAND | valid | 2 / yes | 2 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:ASK | ASK | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:DRINK | DRINK | valid | 147 / yes | 85 (10) / 22 (2) / 40 (4) | 0, - | suggestion-only | - |
| word:EAT | EAT | valid | 147 / yes | 88 (10) / 21 (2) / 38 (4) | 0, - | suggestion-only | - |
| word:WATER | WATER | valid | 148 / yes | 90 (10) / 20 (2) / 38 (4) | 0, - | suggestion-only | - |
| word:GIVE | GIVE | valid | 146 / yes | 90 (10) / 21 (2) / 35 (4) | 0.114, 1 | calibrated-runtime-gates | - |
| word:TAKE | TAKE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:SHOW | SHOW | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:LOOK | LOOK | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:SEE | SEE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:LISTEN | LISTEN | valid | 2 / yes | 2 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:TALK | TALK | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:START | START | valid | 2 / yes | 2 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:FINISH | FINISH | valid | 153 / yes | 93 (10) / 22 (2) / 38 (4) | 0.5, 0.95 | calibrated-runtime-gates | - |
| word:AGAIN | AGAIN | valid | 2 / yes | 2 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:SLEEP | SLEEP | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:TOILET | TOILET | valid | 0 / no | 0 (0) / 0 (0) / 0 (0) | - | unavailable-without-personal-data | - |
| word:DOCTOR | DOCTOR | valid | 147 / yes | 88 (10) / 21 (2) / 38 (4) | 0, - | suggestion-only | - |
| word:HOSPITAL | HOSPITAL | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:ANSWER | ANSWER | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:TELL | TELL | valid | 0 / no | 0 (0) / 0 (0) / 0 (0) | - | unavailable-without-personal-data | - |
| word:FOOD | FOOD | valid | 144 / yes | 85 (10) / 20 (2) / 39 (4) | 0, - | suggestion-only | - |
| word:PAIN | PAIN | valid | 148 / yes | 90 (10) / 19 (2) / 39 (4) | 0.795, 0.969 | calibrated-runtime-gates | - |
| word:SCHOOL | SCHOOL | valid | 157 / yes | 96 (10) / 22 (2) / 39 (4) | 0, - | suggestion-only | - |
| word:CLASS | CLASS | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:TEACHER | TEACHER | valid | 148 / yes | 90 (10) / 20 (2) / 38 (4) | 0.368, 1 | calibrated-runtime-gates | - |
| word:STUDENT | STUDENT | valid | 160 / yes | 100 (10) / 21 (2) / 39 (4) | 0, - | suggestion-only | - |
| word:BOOK | BOOK | valid | 148 / yes | 88 (10) / 21 (2) / 39 (4) | 0.436, 1 | calibrated-runtime-gates | - |
| word:READ | READ | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:WRITE | WRITE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:STUDY | STUDY | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:LEARN | LEARN | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:EXAM | EXAM | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:QUESTION | QUESTION | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:PROJECT | PROJECT | valid | 0 / no | 0 (0) / 0 (0) / 0 (0) | - | unavailable-without-personal-data | - |
| word:COMPUTER | COMPUTER | valid | 155 / yes | 97 (10) / 22 (2) / 36 (4) | 0.667, 1 | calibrated-runtime-gates | - |
| word:COLLEGE | COLLEGE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:PHONE | PHONE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:MOBILE | MOBILE | valid | 2 / yes | 2 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:EMERGENCY | EMERGENCY | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:DANGER | DANGER | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:SAFE | SAFE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:POLICE | POLICE | valid | 155 / yes | 97 (10) / 22 (2) / 36 (4) | 0.722, 1 | calibrated-runtime-gates | - |
| word:WHAT | WHAT | valid | 151 / yes | 90 (10) / 20 (2) / 41 (4) | 0, - | suggestion-only | - |
| word:WHY | WHY | valid | 156 / yes | 94 (10) / 22 (2) / 40 (4) | 0, - | suggestion-only | - |
| word:WHEN | WHEN | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:WHERE | WHERE | valid | 149 / yes | 88 (10) / 21 (2) / 40 (4) | 0, - | suggestion-only | - |
| word:WHO | WHO | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:HOW | HOW | valid | 0 / no | 0 (0) / 0 (0) / 0 (0) | - | unavailable-without-personal-data | - |
| word:WHICH | WHICH | valid | 157 / yes | 94 (10) / 22 (2) / 41 (4) | 0.512, 1 | calibrated-runtime-gates | - |
| word:HOW_MUCH | HOW MUCH | valid | 0 / no | 0 (0) / 0 (0) / 0 (0) | - | unavailable-without-personal-data | - |
| word:HOW_MANY | HOW MANY | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:ROAD | ROAD | valid | 151 / yes | 91 (10) / 21 (2) / 39 (4) | 0.667, 1 | calibrated-runtime-gates | - |
| word:CAR | CAR | valid | 149 / yes | 89 (10) / 22 (2) / 38 (4) | 0, - | suggestion-only | - |
| word:BUS | BUS | valid | 146 / yes | 91 (10) / 17 (2) / 38 (4) | 0.316, 1 | calibrated-runtime-gates | - |
| word:TRAIN | TRAIN | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:MARKET | MARKET | valid | 151 / yes | 93 (10) / 21 (2) / 37 (4) | 0, - | calibrated-runtime-gates | - |
| word:SHOP | SHOP | valid | 152 / yes | 92 (10) / 20 (2) / 40 (4) | 0.775, 1 | calibrated-runtime-gates | - |
| word:CITY | CITY | valid | 148 / yes | 90 (10) / 19 (2) / 39 (4) | 0.256, 1 | calibrated-runtime-gates | - |
| word:VILLAGE | VILLAGE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:PARK | PARK | valid | 5 / yes | 4 (1) / 0 (0) / 1 (1) | 0, - | suggestion-only | - |
| word:OFFICE | OFFICE | valid | 151 / yes | 91 (10) / 21 (2) / 39 (4) | 0.385, 0.75 | calibrated-runtime-gates | - |
| word:MILK | MILK | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:TEA | TEA | valid | 148 / yes | 88 (10) / 21 (2) / 39 (4) | 0.462, 1 | calibrated-runtime-gates | - |
| word:COFFEE | COFFEE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:FRUIT | FRUIT | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:VEGETABLE | VEGETABLE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:RICE | RICE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:BREAD | BREAD | valid | 146 / yes | 91 (10) / 18 (2) / 37 (4) | 0.541, 1 | calibrated-runtime-gates | - |
| word:BREAKFAST | BREAKFAST | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:LUNCH | LUNCH | valid | 150 / yes | 93 (10) / 21 (2) / 36 (4) | 0.833, 1 | calibrated-runtime-gates | - |
| word:DINNER | DINNER | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:HOUSE | HOUSE | valid | 149 / yes | 91 (10) / 21 (2) / 37 (4) | 0.73, 1 | calibrated-runtime-gates | HOME |
| word:ROOM | ROOM | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:DOOR | DOOR | valid | 151 / yes | 92 (10) / 21 (2) / 38 (4) | 0.868, 0.971 | calibrated-runtime-gates | - |
| word:WINDOW | WINDOW | valid | 151 / yes | 95 (10) / 19 (2) / 37 (4) | 0.649, 1 | calibrated-runtime-gates | - |
| word:CHAIR | CHAIR | valid | 152 / yes | 91 (10) / 22 (2) / 39 (4) | 0, - | suggestion-only | - |
| word:TABLE | TABLE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:BAG | BAG | valid | 150 / yes | 91 (10) / 21 (2) / 38 (4) | 0.974, 1 | calibrated-runtime-gates | - |
| word:CLOTHES | CLOTHES | valid | 5 / yes | 4 (1) / 0 (0) / 1 (1) | 0, - | suggestion-only | - |
| word:KEY | KEY | valid | 146 / yes | 88 (10) / 20 (2) / 38 (4) | 0.368, 1 | calibrated-runtime-gates | - |
| word:MONEY | MONEY | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:MAN | MAN | valid | 146 / yes | 88 (10) / 21 (2) / 37 (4) | 0.378, 1 | calibrated-runtime-gates | - |
| word:WOMAN | WOMAN | valid | 152 / yes | 92 (10) / 21 (2) / 39 (4) | 0, - | suggestion-only | - |
| word:CHILD | CHILD | valid | 149 / yes | 90 (10) / 18 (2) / 41 (4) | 0.415, 1 | calibrated-runtime-gates | - |
| word:BOY | BOY | valid | 148 / yes | 88 (10) / 22 (2) / 38 (4) | 0.553, 1 | calibrated-runtime-gates | - |
| word:GIRL | GIRL | valid | 151 / yes | 92 (10) / 21 (2) / 38 (4) | 0.579, 1 | calibrated-runtime-gates | - |
| word:PARENT | PARENT | valid | 6 / yes | 5 (2) / 0 (0) / 1 (1) | 0, - | suggestion-only | - |
| word:FAMILY | FAMILY | valid | 147 / yes | 87 (10) / 21 (2) / 39 (4) | 0.179, 1 | calibrated-runtime-gates | - |
| word:FRIEND | FRIEND | valid | 147 / yes | 88 (10) / 20 (2) / 39 (4) | 0.513, 1 | calibrated-runtime-gates | - |
| word:NEIGHBOR | NEIGHBOR | valid | 149 / yes | 88 (10) / 22 (2) / 39 (4) | 0.667, 1 | calibrated-runtime-gates | - |
| word:MOTHER | MOTHER | valid | 156 / yes | 95 (10) / 21 (2) / 40 (4) | 0.875, 1 | calibrated-runtime-gates | - |
| word:FATHER | FATHER | valid | 151 / yes | 90 (10) / 21 (2) / 40 (4) | 0.575, 1 | calibrated-runtime-gates | - |
| word:BROTHER | BROTHER | valid | 5 / yes | 4 (1) / 0 (0) / 1 (1) | 0, - | suggestion-only | - |
| word:SISTER | SISTER | valid | 151 / yes | 92 (10) / 20 (2) / 39 (4) | 0.538, 1 | calibrated-runtime-gates | - |
| word:NAME | NAME | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:AGE | AGE | valid | 153 / yes | 90 (10) / 22 (2) / 41 (4) | 0.561, 1 | calibrated-runtime-gates | - |
| word:LIVE | LIVE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:WORK | WORK | valid | 154 / yes | 92 (10) / 22 (2) / 40 (4) | 0.9, 1 | calibrated-runtime-gates | - |
| word:PLAY | PLAY | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:WALK | WALK | valid | 156 / yes | 95 (10) / 21 (2) / 40 (4) | 0.275, 1 | calibrated-runtime-gates | - |
| word:RUN | RUN | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:SIT | SIT | valid | 152 / yes | 92 (10) / 20 (2) / 40 (4) | 0, - | suggestion-only | - |
| word:STAND | STAND | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:COME_IN | COME IN | valid | 0 / no | 0 (0) / 0 (0) / 0 (0) | - | unavailable-without-personal-data | - |
| word:GO_OUT | GO OUT | valid | 0 / no | 0 (0) / 0 (0) / 0 (0) | - | unavailable-without-personal-data | - |
| word:OPEN | OPEN | valid | 149 / yes | 92 (10) / 21 (2) / 36 (4) | 0, - | suggestion-only | - |
| word:CLOSE | CLOSE | valid | 149 / yes | 89 (10) / 21 (2) / 39 (4) | 0.872, 1 | calibrated-runtime-gates | - |
| word:BRING | BRING | valid | 0 / no | 0 (0) / 0 (0) / 0 (0) | - | unavailable-without-personal-data | - |
| word:SEND | SEND | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:RECEIVE | RECEIVE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:KEEP | KEEP | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:USE | USE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:MAKE | MAKE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:DO | DO | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:TRY | TRY | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:NEED_HELP | NEED HELP | valid | 0 / no | 0 (0) / 0 (0) / 0 (0) | - | unavailable-without-personal-data | - |
| word:BEGIN | BEGIN | valid | 2 / yes | 2 (1) / 0 (0) / 0 (0) | - | suggestion-only | START |
| word:CHANGE | CHANGE | valid | 152 / yes | 92 (10) / 21 (2) / 39 (4) | 0, - | suggestion-only | - |
| word:WAIT_MINUTE | WAIT MINUTE / wait a minute | valid | 0 / no | 0 (0) / 0 (0) / 0 (0) | - | unavailable-without-personal-data | - |
| word:REMEMBER | REMEMBER | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:FORGET | FORGET | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:THINK | THINK | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:FEEL | FEEL | valid | 143 / yes | 84 (9) / 20 (2) / 39 (4) | 0.615, 1 | calibrated-runtime-gates | - |
| word:BELIEVE | BELIEVE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:BECAUSE | BECAUSE | valid | 0 / no | 0 (0) / 0 (0) / 0 (0) | - | unavailable-without-personal-data | - |
| word:HAPPY | HAPPY | valid | 145 / yes | 91 (10) / 18 (2) / 36 (4) | 0.306, 1 | calibrated-runtime-gates | - |
| word:SAD | SAD | valid | 153 / yes | 93 (10) / 21 (2) / 39 (4) | 0.769, 1 | calibrated-runtime-gates | - |
| word:ANGRY | ANGRY | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:SCARED | SCARED | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:CONFUSED | CONFUSED | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:TIRED | TIRED | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:READY | READY | valid | 152 / yes | 93 (10) / 20 (2) / 39 (4) | 0.667, 0.963 | calibrated-runtime-gates | - |
| word:LATE | LATE | valid | 2 / yes | 2 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:EARLY | EARLY | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:IMPORTANT | IMPORTANT | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:YES | YES | valid | 152 / yes | 95 (10) / 20 (2) / 37 (4) | 0.892, 1 | calibrated-runtime-gates | - |
| word:NO | NO | valid | 148 / yes | 88 (10) / 21 (2) / 39 (4) | 0.769, 1 | calibrated-runtime-gates | - |
| word:THANK_YOU | THANK YOU / thanks, thankyou | valid | 155 / yes | 95 (10) / 22 (2) / 38 (4) | 0, - | suggestion-only | - |
| word:I | I / me, myself | valid | 134 / yes | 83 (10) / 19 (2) / 32 (4) | 0, - | suggestion-only | - |
| word:MY | MY / mine | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:YOUR | YOUR / yours | valid | 145 / yes | 85 (10) / 21 (2) / 39 (4) | 0, - | suggestion-only | - |
| word:LOVE | LOVE | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:MEET | MEET | valid | 1 / yes | 1 (1) / 0 (0) / 0 (0) | - | suggestion-only | - |
| word:MORNING | MORNING | valid | 155 / yes | 95 (10) / 21 (2) / 39 (4) | 0.436, 1 | calibrated-runtime-gates | - |
| letter:A | A | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:B | B | valid | 74 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:C | C | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:D | D | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:E | E | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:F | F | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:G | G | valid | 106 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:H | H | valid | 104 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:I | I | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:J | J | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:K | K | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:L | L | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:M | M | valid | 106 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:N | N | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:O | O | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:P | P | valid | 56 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:Q | Q | valid | 104 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:R | R | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:S | S | valid | 62 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:T | T | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:U | U | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:V | V | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:W | W | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:X | X | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:Y | Y | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| letter:Z | Z | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| number:0 | 0 | valid | 28 / yes | image source | - | numbers-intent-only | - |
| number:1 | 1 | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| number:2 | 2 | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| number:3 | 3 | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| number:4 | 4 | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| number:5 | 5 | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| number:6 | 6 | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| number:7 | 7 | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| number:8 | 8 | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |
| number:9 | 9 | valid | 108 / yes | image source | - | experimental-runtime-gates-only | - |

## Collection needs

Targets: 10 training signers, 3 unseen test signers and 15 test clips per word variant ([protocol](sign-data-collection.md)).

- word:PERSON (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:SORRY (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:WELCOME (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:GOOD (auto-accept-below-test-target): test precision 0.773 is below 0.95; more calibration signers before it is trusted
- word:STOP (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:COME (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:WANT (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:NEED (no-real-data): 10 more training signers (has 0); 3 more unseen test signers (has 0); 15 more test clips
- word:LIKE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:KNOW (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:UNDERSTAND (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:ASK (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:DRINK (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with WATER ×14
- word:EAT (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with FOOD ×23
- word:WATER (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with YOUR ×4
- word:TAKE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:SHOW (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:LOOK (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:SEE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:LISTEN (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:TALK (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:START (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:AGAIN (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:SLEEP (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:TOILET (no-real-data): 10 more training signers (has 0); 3 more unseen test signers (has 0); 15 more test clips
- word:DOCTOR (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with SAD ×4
- word:HOSPITAL (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:ANSWER (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:TELL (no-real-data): 10 more training signers (has 0); 3 more unseen test signers (has 0); 15 more test clips
- word:FOOD (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with EAT ×12
- word:SCHOOL (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with BOOK ×5, HAPPY ×2
- word:CLASS (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:STUDENT (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending
- word:READ (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:WRITE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:STUDY (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:LEARN (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:EXAM (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:QUESTION (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:PROJECT (no-real-data): 10 more training signers (has 0); 3 more unseen test signers (has 0); 15 more test clips
- word:COLLEGE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:PHONE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:MOBILE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:EMERGENCY (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:DANGER (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:SAFE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:WHAT (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with WHY ×4, GIVE ×2
- word:WHY (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with SAD ×3, THANK_YOU ×2
- word:WHEN (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:WHERE (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending
- word:WHO (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:HOW (no-real-data): 10 more training signers (has 0); 3 more unseen test signers (has 0); 15 more test clips
- word:HOW_MUCH (no-real-data): 10 more training signers (has 0); 3 more unseen test signers (has 0); 15 more test clips
- word:HOW_MANY (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:CAR (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending
- word:TRAIN (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:MARKET (auto-accept-below-test-target): no accepted test clips at the runtime gates; more calibration signers before it is trusted
- word:VILLAGE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:PARK (evaluated-suggestion-only): 9 more training signers (has 1); 2 more unseen test signers (has 1); 14 more test clips
- word:OFFICE (auto-accept-below-test-target): test precision 0.75 is below 0.95; more calibration signers before it is trusted; confused with GOOD ×9
- word:MILK (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:COFFEE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:FRUIT (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:VEGETABLE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:RICE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:BREAKFAST (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:DINNER (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:ROOM (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:CHAIR (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with SIT ×7
- word:TABLE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:CLOTHES (evaluated-suggestion-only): 9 more training signers (has 1); 2 more unseen test signers (has 1); 14 more test clips
- word:MONEY (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:WOMAN (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending
- word:PARENT (evaluated-suggestion-only): 8 more training signers (has 2); 2 more unseen test signers (has 1); 14 more test clips
- word:BROTHER (evaluated-suggestion-only): 9 more training signers (has 1); 2 more unseen test signers (has 1); 14 more test clips
- word:NAME (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:LIVE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:PLAY (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:RUN (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:SIT (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with CHAIR ×18
- word:STAND (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:COME_IN (no-real-data): 10 more training signers (has 0); 3 more unseen test signers (has 0); 15 more test clips
- word:GO_OUT (no-real-data): 10 more training signers (has 0); 3 more unseen test signers (has 0); 15 more test clips
- word:OPEN (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with FINISH ×9
- word:BRING (no-real-data): 10 more training signers (has 0); 3 more unseen test signers (has 0); 15 more test clips
- word:SEND (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:RECEIVE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:KEEP (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:USE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:MAKE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:DO (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:TRY (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:NEED_HELP (no-real-data): 10 more training signers (has 0); 3 more unseen test signers (has 0); 15 more test clips
- word:BEGIN (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:CHANGE (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending
- word:WAIT_MINUTE (no-real-data): 10 more training signers (has 0); 3 more unseen test signers (has 0); 15 more test clips
- word:REMEMBER (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:FORGET (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:THINK (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:BELIEVE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:BECAUSE (no-real-data): 10 more training signers (has 0); 3 more unseen test signers (has 0); 15 more test clips
- word:ANGRY (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:SCARED (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:CONFUSED (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:TIRED (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:LATE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:EARLY (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:IMPORTANT (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:THANK_YOU (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with HAPPY ×6
- word:I (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending; confused with DOCTOR ×3
- word:MY (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:YOUR (evaluated-suggestion-only): none for this split; Deaf ISL variant review still pending
- word:LOVE (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- word:MEET (trained-unevaluated): 9 more training signers (has 1); 3 more unseen test signers (has 0); 15 more test clips
- letter:A (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:B (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:C (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:D (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:E (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:F (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:G (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:H (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:I (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:J (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:K (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:L (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:M (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:N (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:O (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:P (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:Q (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:R (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:S (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:T (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:U (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:V (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:W (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:X (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:Y (image-source-only): signer-identified recordings for a signer-disjoint test
- letter:Z (image-source-only): signer-identified recordings for a signer-disjoint test
- number:0 (image-source-only): signer-identified recordings for a signer-disjoint test; recordings that show how 0 differs from letter O, if it does; the bundled photographs are the same captures as O
- number:1 (image-source-only): signer-identified recordings for a signer-disjoint test
- number:2 (image-source-only): signer-identified recordings for a signer-disjoint test
- number:3 (image-source-only): signer-identified recordings for a signer-disjoint test
- number:4 (image-source-only): signer-identified recordings for a signer-disjoint test
- number:5 (image-source-only): signer-identified recordings for a signer-disjoint test
- number:6 (image-source-only): signer-identified recordings for a signer-disjoint test
- number:7 (image-source-only): signer-identified recordings for a signer-disjoint test
- number:8 (image-source-only): signer-identified recordings for a signer-disjoint test
- number:9 (image-source-only): signer-identified recordings for a signer-disjoint test

Machine-readable modality review flags, per-entry source/license/version and recognition status: [isl-coverage.json](../public/models/isl-coverage.json).

Review queue: compare handshape, palm orientation, body-relative location, motion direction, two-hand relationships and non-manual markers with ISLRTC references and Deaf signers. No animation was changed merely because a model has the same English label.
