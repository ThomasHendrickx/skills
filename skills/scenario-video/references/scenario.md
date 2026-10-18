# scenario.json and vo.json

Coordinates are on a 1280x720 canvas, origin top left. Times are seconds from the start. `example/` is a complete, working pair: copy its shape.

## The 90-second template

| Beat | Time | Caption group | What happens |
|---|---|---|---|
| Intro | 0 to `a0` (3.4) | One call | Caption with a subline: who the company is; one call, played twice. |
| Run A | `a0` to `a1` (35.0) | Without Aeolus | About 5 scenes. People carry every step by phone, mail and chat (amber); the clock jumps hours and days; hand-offs count up; each decision. Ends on a count line ("Four decisions. Fourteen hand-offs by people."). |
| Switch | `a1` to `b0` (38.6) | Now on Aeolus | "Same call. Now on Aeolus." The mark appears at `a1`+0.8, the wave at `join` (36.4) puts everyone on the network, agents appear from `join`+0.6. |
| Run B | `b0` to `proof` (71.0) | With Aeolus | About 6 scenes. The same call; agents and apps carry the work along the network (purple); the clock runs in minutes; the same decisions, each on a screen (vignette). |
| Proof | `proof` to `end` (81.4) | The proof | The proof card, row by row at `proof.times`, with three voice lines. |
| End | `end` to `dur` (90) | End | The end card; one voice line with the tagline. |

Keep these times and caption group names unless the story cannot fit; the score, the chips and the proof follow them. Write the beat table first: per scene its time, caption, voice lines, and what moves.

## Layout

- Keep clear: the caption at top left (x 48 to 816, y 43 to 135 for two lines), the clock and counters at top right (x 1000 to 1231, y 43 to 160), the chip right-aligned at x 1231 around y 190.
- People in the middle band (y 240 to 480), about 200 px apart; an avatar has radius 42 and a name plate of about 50 px under it.
- Apps in one row along the bottom (y about 665), about 270 px apart.
- Agents between people and apps (y 440 to 550), near what they serve; a private assistant sits beside its person.
- Outside parties (the customer, a supplier) at the left or right edge.
- `timeline.center` is the middle of the cast: the wave starts there.
- Tags need room: about 250 px beside a person for `right` and `left` tags.

## Fields

`page`: `title` (browser tab), `heading` (above the video), `kicker` ("Scenario · 90 s · voice and music"), `aria` (the whole story in a few sentences, for screen readers).

`timeline`: `dur`, `a0`, `a1`, `join`, `b0`, `proof`, `end`, `center` {x, y}. Optional `mark` (default `a1`+0.8) and `fly` (default `join`+0.8).

`people`: key to {`x`, `y`, `name`, `role`, `spec`}, plus:
- `spec`: {`skin`, `hair`, `style` (short, bun, long, curly, fringe), `beard`, `glasses`, `bg`, `shirt`}, colours in hex. Vary skin, hair and style across the cast.
- `outside: true`: not on the network (the customer).
- `small: true`, `r: 26`, `label`: a minor party (another customer), one label above instead of a name plate.

`apps`: key to {`x`, `y`, `label`}, 142x42 by default (`w`, `h` to change). `outside: true`: a grey tile that never joins the network (a supplier's system).

`agents`: key to {`x`, `y`, `r` (21; 13 when private), `label`, `lab` (right, left, above, below: where the label sits), `from` (when it appears)}. `own`: the person it works for, drawn as a link. `kind: "private"`: a person's own assistant, a small badge with its label below.

`show`: key to [[from, to], ...]: when a person or app is on stage. Without an entry, always.

`decisions`: {`who` [person per decision], `a` [times in run A], `b` [times in run B], `tags` [{x, y} per decision]}. At each time the person gets an orange ring, a chime plays and a "Decision n of N" pill shows at `tags[n]` (its centre) for 1.8 s. With a vignette, the decision time is its `press` + 0.4.

`notes`: [{`x`, `y`, `rot`, `l1`, `l2`, `from`, `to`, `handoff`}]: a sticky note a person writes to remember. `handoff` (a time) counts as a hand-off.

`lines`: [{`a`, `b`, `from`, `to`, `bend`}]: two people on the phone with each other; use it to show why someone cannot answer.

`hops`: [from, to, start, end, kind, bend, handoff]: something moving between two keys along a curve.

| kind | shows | use |
|---|---|---|
| busy | a call that does not get through | the first call in run A |
| phone | an amber handset | a person phones |
| mail | an envelope (amber in run A, slate in run B) | email |
| doc | a document | a person retypes into an app |
| chat | an amber chat bubble | a person's chat message |
| call | a green handset | a call the voice agent takes |
| msg | a slate chat glyph | an automated message to a person |
| spark | a purple agent dot | agents and apps carrying work |

- `bend`: curvature, about -0.3 to 0.3; flip its sign to move a curve off a person or label. Run B hops take their edge's bend.
- `handoff`: 1 on a run A step a person carried (needs a `bend` before it). It counts in "Hand-offs by people" and leaves an amber trace until run A ends. The proof's hand-off number is these plus note hand-offs; the voice says the same number.
- Run A hops last 0.5 to 1 s; run B hops 0.4 to 0.6 s, chained.

`edges`: {"a>b": bend}: the network connections of run B. A connection appears the first time a run B hop crosses it (either direction) and glows while it carries work; connections to outside keys are dashed. Give every run B hop an edge, except between an agent and its `own` person.

`tags`: [{`from`, `to`, `text`, `at`, `of`, `dx`, `dy`, `icon`, `col`, `ic`, `sfx`}]: short pills.
- `at`: right, left, above, below (`dy` 22 by default) a person or agent; `app`: above an app tile; `agent`: above an agent. Without `at`: centred at `x`, `y`.
- `icon`: check, cross, clock, pencil, chat, spark, phone, dot, van, ball, msg, mail.
- `col` (text) and `ic` (icon) take a palette name: ink, muted, slate, agent, app (green), gate (orange), amber.
- Meaning by look: done is check with col app; carried by a person ends in ", by phone" or ", by email" with icon phone (ic amber) or mail; a finding is dot with ic gate; a condition is clock; a manual edit is pencil; where a person is (van, ball) is context.
- `sfx`: "urgent" (two bips) or "accept" (a bell).
- One to three tags on stage at once, 1 to 3 s each.

`vignettes`: [{`type`, `from`, `to`, `x`, `y` (top-left corner), `slide` (px it rises while appearing, 8)}, plus by type:
- `chatCard` (320x128, team chat on a desktop): `title`, `lines` (up to 2), `options` [left, right] (the right one is pressed), `press`, `done` ("Decided"), `w`.
- `phoneCard` (170x236, a brief on a phone): `title`, `rows` [[label, value, colour]] (up to 4; one row every 0.45 s).
- `approvalPhone` (150x212): `title`, `label`, `amount`, `note`, `options` (["Later", "Approve"]), `press`, `done` ("Approved").
- `voiceNote` (140x38, recording): `len` ("0:20").
- `quoteCard` (280x196, a draft with line items): `title`, `lines` [[label, value]] or [[label, old, new]] (up to 2), `note`, `total` [old, new], `totalLabel` ("Total"), `change` (when new values replace old), `press`, `button` ("Send"), `done` ("Sent").

`captions`: [{`a`, `b`, `g`, `h`, `s`}]: one per scene. `g` groups scenes into the chapter buttons under the video, `h` is the headline, `s` a subline (intro only). The proof and end scenes have `h` "".

`clockA`: [[t, day, "HH:MM"], ...]: run A's clock, jumping. `clockB`: {`day`, `keys` [[t, minutes since midnight], ...]}: run B's clock, running between keys (615 is 10:15).

`labels`: {`handoffs` "Hand-offs by people", `decisions` "Decisions by people", `chipA` "Without Aeolus", `chipB` "On Aeolus"}.

`proof`: {`title` "Same call.", `colA`, `colB`, `footer` [two lines], `times` [title, decisions row, hand-offs row, footer]}. Its numbers come from `decisions`, `hops` and `notes`, never typed.

`end`: {`word` "Aeolus", `tagline`, `url`, `label` "Scenario"}. Keep the example's values.

`sound`: optional score cues.
- `ticks`: run A clock jumps that get ticking (default: every `clockA` time after the first).
- `turn` [t0, t1]: the music holds its breath (no drums) around the run B finding.
- `suspense` [t0, t1]: the music thins before the last decision, with a fill into it.
- Put `turn` and `suspense` on the half-second beat from `b0`.

The score adds every sound effect itself, from the hops, notes, agents, tags with `sfx`, vignettes, decisions, proof rows and the end card.

## vo.json

{`voice` "af_heart", `respell` {written: spoken}, `lines` [{`t`, `end`, `text`}]}.
- Each line plays from `t` and is sped up (at most 23 %) to end by `end`. Plan about 3 words per second of window, windows 2 to 4 s, gaps of about 0.2 s.
- Run A closes with the count line, the switch has its own line, and each proof line starts just after its proof row.
- Respell names the voice gets wrong ("Jens": "Yens", "Aeolus": "Eeohlus"); write times and numbers as words.
