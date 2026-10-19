# Lost Footing: design

The owner's brief ([brief.md](brief.md)) is fixed. This document is the design
that follows from it, with the numbers the code uses. Numbers live in
`src/constants.js` (physics, platforms, match rules), `src/characters.js`
(moves), `src/stages.js` (layouts, hazard rhythms) and `src/bot.js` (bots);
change them there and here together.

## The idea in one line

Nobody can touch anybody. You win by making the ground under the others
disappear: break it, coat it, wall it off, or steer a hazard across it, while
you keep moving so your own ground holds.

## Contents

- [Core rules](#core-rules)
- [Crumble platforms](#crumble-platform)
- [Sturdy platforms](#sturdy-platform)
- [Forged floor](#forged-floor)
- [Movement](#movement)
- [Vertical contact](#vertical-contact)
- [Placeables and moves](#placeable)
- [Characters](#characters)
- [Stages and hazards](#stage-hazard)
- [Blast zones, stocks and credit](#blast-zone)
- [Overtime and collapse](#overtime)
- [Controls](#controls)
- [Bots](#bots)
- [Simulation and determinism](#simulation)
- [Presentation](#presentation)
- [Ideas not yet built](#ideas)

## Core rules

- **No direct damage.** No move hits, damages or knocks back another player.
  Moves place objects or break platforms; objects act on everyone who touches
  them, the owner included.
- **The stage eliminates.** Leaving a [blast zone](#blast-zone) (falling off
  the bottom, flying off a side or the top) or touching a lethal hazard (the
  tide) costs a stock.
- **Credit is indirect.** When something you made (your glue, your spring,
  your saw-cut tile, your stomp, a comet your wall bounced) affects a player
  and they are eliminated within 5 seconds, you are credited.
- Everyone starts with 3 stocks (1 to 5 in setup). Last player with stocks
  wins.

## Crumble platform

<a id="crumble-platform"></a>
Most of every stage is crumble platforms: rows of 48 x 18 px tiles in the
Mario Bros style. Each tile carries **stress** from 0 to 1.

| What | Stress per tick | Seconds to break |
|---|---|---|
| A player standing still (speed under 1.1 px/tick) | 1/56 | about 0.9 s (shaking from 0.4 s) |
| A player moving on it | 1/110 | about 3 s of pacing on the same tiles; never if you keep travelling |
| Nobody on it | -1/260 (decays) | |
| Landing (hard landing at 10+ px/tick) | +0.06 (+0.12) once | |
| Someone riding on your head | +60% of their load | |
| Being stomped | +0.25 once | |

- At stress 0.45 the tile starts **shaking** (telegraph). At 0.75 it is
  **doomed**: it keeps gaining 1/80 per tick by itself, even if you leave.
- At 1 it **falls** (40 ticks, not solid), is **gone** for 3.3 s, then
  **flickers back** for 0.75 s (not solid) and is solid again with no stress.
  A tile is back about 4.75 s after it broke (longer in overtime).
- Straddling two tiles splits your weight (each takes 75% of the rate), a small
  reward for footwork.
- All platforms are one-way: jump up through them, press down to drop
  through.

## Sturdy platform

<a id="sturdy-platform"></a>
Sturdy slabs (metal and stone, drawn differently) never crumble from standing.
They have hit points (4, or 8 for the Quarry's great ledge). Moves and hazards
damage them; at 0 they shatter, stay gone for 8 s, then come back whole. Every
stage pairs its slabs with a hazard that crosses them on a rhythm, so a slab is
a place to rest between dangers, never a place to camp.

## Forged floor

<a id="forged-floor"></a>
Dab's tricks make floor that holds only her. Everyone else sees an ordinary
crumble tile with a faint wash of her colour pulsing along it, and falls
through.

- A **decoy** is a temporary tile (96 x 18, 5 s, two at once) that is solid
  for Dab alone. Other players pass through it; objects (anvils, lobs, saws,
  rocks, charges) ignore it. Anyone who drops through one is credited to Dab.
- A **hollow tile** is a real crumble tile that Dab has turned: it shimmers for
  0.4 s, then for 2.5 s holds only Dab. Whoever is standing on it when it gives
  way is credited to Dab. It is still a normal tile for objects.
- Neither can be told from real floor except by the tell, so they are the
  game's one deliberate piece of hidden information. Bots see hollow tiles'
  shimmer; hard bots also see decoys.

## Movement

Units are pixels and ticks (60 per second). The world is 1600 x 900.

| | |
|---|---|
| Run speed | 5.4, ground accel 0.9, friction 0.72 |
| Air control | accel 0.45, drag 0.985 |
| Gravity | 0.6, max fall 13; fast fall (hold down) 1.0, max 17 |
| Jump | -13 (about 140 px high); air jump -11.2 (about 105 px), one per landing |
| Short hop | releasing jump while rising faster than 5 cuts the rise |
| Coyote time / jump buffer | 6 ticks each |
| Body | 26 x 38 |

Tier spacing on stages is 120 to 140 px: one jump reaches the next tier, the air
jump is your recovery.

## Vertical contact

<a id="vertical-contact"></a>
Players pass through each other side to side. Vertical contact (decided from
last tick's positions: whoever was above is the upper body) matters:

- **Stomp / bump.** If the upper body is closing at 4+ px/tick (falling onto
  someone, or someone jumping up into your feet), the upper body bounces up
  (3 + 0.4 x closing speed, max 9.5) and gets its air jump back. A grounded
  lower body is slowed for 0.5 s and its tile takes +0.25 stress; an airborne
  lower body is pushed down at 75% of the upper body's speed. A bump from below
  stops the jumper's rise and pops the player above upward, even through a
  one-way platform.
- **Riding.** A gentle landing lets you ride on someone's head. You weigh down
  their tile (+60% of your load) and they cannot jump through you without
  bumping you off.
- Both are credited contact: a stomp that sends someone into the pit is an
  elimination for the stomper.

## Placeable

<a id="placeable"></a>
A placeable is an object a move puts into the world. Every placeable affects
every player who touches it, its owner included; most need a surface under
them and fall when it breaks. Every move has a cooldown, and placeables have a
lifetime and a limit on how many one player may have at once (placing past the
limit removes your oldest). Objects arm briefly before they act (a bumper
glows for half a second, a spring for a quarter), so nothing is an instant hit.

Throws ("lobs") arc: a neutral throw goes 6.5 px/tick forward, holding forward
throws far (9), holding up lobs high (4.5 forward, -10 up). Gusts push lobs in
flight.

Move keys are the same role for everyone:

1. **Place**: the character's main obstacle.
2. **Trick**: a second tool, often mobility or a combo piece.
3. **Break**: platform destruction.

## Characters

<a id="characters"></a>

| | Place (1) | Trick (2) | Break (3) |
|---|---|---|---|
| **Mason**, the builder (builds his own footing) | **Wall**: 22 x 90 stone wall ahead, solid on every side, 5.5 s, 2 at once, cd 1.25 s. Reflects comets and saws. | **Ledge**: a temporary sturdy slab under you (in the air) or ahead of you (on the ground), 4 s, cd 6 s. | **Anvil**: a thrown anvil that punches through up to 3 crumble tiles, or does 2 damage to a slab, cd 5 s. |
| **Glim**, the alchemist (light: **two air jumps**) | **Glue**: a lobbed glob; a 72 px sticky patch for 7 s (speed x0.1, jump x0.55; you count as standing still, so the tile crumbles). 2 at once, cd 2.3 s. | **Oil**: a lobbed slick; a 110 px patch for 7 s (almost no friction or traction, top speed x1.25). 2 at once, cd 2.3 s. | **Acid**: a lobbed flask; a 80 px puddle that dissolves the tiles under it in under a second and eats 1 slab hp per 0.8 s, 2.5 s, cd 5.5 s. |
| **Pip**, the acrobat (air spring) | **Spring**: a pad ahead of you. Launches whoever steps on it up (-17), or diagonally (-15 up, 8 sideways) if you held a direction when placing. Placed in the air it appears under you and launches you (-13.5) in place of your air jump. Arms in 0.25 s, 4 uses, 8 s, 2 at once, cd 1.8 s. | **Gust**: a fan that blows 340 px ahead for 3 s (0.27 px/tick² at the fan, half at the far end) after a 0.4 s spin-up. 1 at once, cd 8 s. | **Drill**: dive straight down (hop first if grounded); the tiles you land on break, neighbours within 140 px take +0.4 stress, slabs take 2 damage; you bounce up. An air jump cancels the dive. cd 4.5 s. |
| **Fuse**, the demolitionist (air bumper) | **Bumper**: a floating bumper ahead that bounces anyone who touches it away at 11.5 px/tick. Arms in 0.5 s, 4 bounces, 7 s, 2 at once, cd 2.2 s. Placed while falling, it appears underfoot already armed and bounces Fuse up. | **Charge**: a lobbed sticky charge; after 1.7 s of beeping it breaks every tile within 115 px, does 2 damage to slabs and destroys placeables, cd 5 s. | **Saw**: a blade that rolls along surfaces at 7 px/tick for 2.2 s, dooming every crumble tile it crosses and chipping slabs; drops to lower tiers. cd 4.5 s. |

| **Dab**, the forger (decoys and hollowed tiles hold only her) | **Decoy**: paints two tiles of fake floor ahead (90 px, or 150 px with forward held) at your feet's height; fizzles if it would sit on real floor. Solid for Dab only. In the air it appears under you. 5 s, 2 at once, cd 3.3 s. | **Hollow**: crumble tiles 30 to 160 px ahead on your tier shimmer for 0.4 s, then for 2.5 s hold only Dab, so anyone on them drops. cd 7 s. | **Rub out**: a 170 px brushstroke starting past the tiles you stand on; after 0.5 s every platform in it is erased (slabs take 2 damage). cd 4.5 s. |

| **Fern**, the gardener (patient: slow to sprout, long to last) | **Vine**: a seed 50 px ahead; after 0.5 s it grows four one-way leaves (56 x 12) in a zigzag, 38 px either side of the seed and 64 px apart, one every 0.2 s, each lasting about 7 s. Anyone can climb it. Needs ground. 2 at once, cd 5.5 s. | **Thorns**: a 150 px bramble patch starting 30 px ahead, growing for 0.4 s, then 5 s. Standing in it: speed x0.4, accel x0.5, jump x0.8, and it adds 1/130 stress per tick to crumble tiles under it (more than they shed, so an empty patch still wears them down in about 4 s). 2 at once, cd 4 s. | **Roots**: a seed 110 px ahead. For 1 s the tiles within 125 px shake (stress held at 0.48); then they are doomed and break within half a second; slabs in reach take 1 damage. 1 at once, cd 5.5 s. |

| **Ferro**, the magnetist (takes what she pulls) | **Lodestone**: a floating magnet 70 px ahead (arms in 0.17 s), 5 s, 1 at once, cd 2.5 s. Loose metal within 240 px (anvils, saws, charges, lobs in flight, bumpers) is pulled toward it, harder the closer it is, and hangs on it once within 24 px. Whatever it pulls changes owner to Ferro, and so does the credit for what it does next. | **Polarity**: flips her lodestone for 2.5 s. Everything loose within 240 px is thrown away from it at 11 px/tick, and it pushes (instead of pulling) until the flip ends. Needs a lodestone. cd 6 s. | **Ingot**: a thrown iron bar (an anvil that breaks only the tile or two it first lands on, or cracks a slab by 2, then is spent). cd 3.5 s. |

Interactions that are built in (the combination space is the point):

- **Glue on crumble = a trap.** Glue makes you "still", so the tile under you
  crumbles at the still rate.
- **Oil + gust / oil + slope of momentum**: slick patches carry you off edges.
- **Walls and bumpers reflect comets and saws**; a reflected comet is credited
  to the wall's or bumper's owner (steering a hazard).
- **Springs launch everything**: players, anvils, saws (a saw can hop a tier).
- **Gusts push lobs, saws and comets**, and push players everywhere in the box.
  Wind (a gust or a gale) makes footing slippery: a player who stops pushing
  against it is blown along the ground.
- **Charges destroy placeables** (break a wall, pop a spring).
- **Glue slows saws, oil speeds them up.**
- **Stomps stress tiles**; riding someone weighs down their tile.
- **Walls pin**: pressing into a wall keeps you "still", so your tile crumbles.
- **Decoy + Rub out**: Dab can erase the real floor next to her decoy and walk
  on across the gap.
- **Lodestone + anything loose**: it steals enemy anvils, saws, charges and
  bumpers; a stolen charge hangs on the lodestone and explodes there; a
  lodestone near a bumper carries it into the fight. A Charge also destroys
  lodestones.
- **Lodestone + Polarity**: park an anvil on the lodestone, then flip it to fire
  the anvil away: downward, it punches through the floor.
- **Vine + Roots / Rub out**: climb a vine and the floor you left can be taken
  out from under the ones chasing you.
- **Thorns + anything that keeps you still**: slowed players are easy to pin
  with a wall or a lob.
- **Hollow + a stomp or a spring**: a launched player who lands on a hollowed
  tile drops straight through it.

## Stages and hazards

<a id="stage-hazard"></a>
Six stages, each 1600 x 900, with crumble rows on tiers 120 to 140 px apart.

| Stage | Layout | Hazard rhythm |
|---|---|---|
| **Crumble Yard** (the gentlest) | A main floor of brick with a sturdy centre slab, two side slabs, tiers above, two small ledges low over the pit. | **Comets** every 6 to 8.7 s skim the sturdy slabs (lanes at y 640 and 470), 1.5 s lane warning. |
| **The Quarry** | A great 400 px stone ledge (8 hp) over the pit, crumble wings, two high slabs. | **Rockfall** every 3.3 to 5 s: a shadow marks a column for 1.3 s, then a boulder drops, pushing players down and smashing the first platform it hits (2 slab hp). 60% of rocks aim at a sturdy slab, 25% at a player. |
| **Tide Pools** | Three sturdy islands at the bottom, crumble tiers above. | **Tide** every 12 to 15 s: a 2 s warning, then the water rises over the islands for 4 s (lethal) and recedes. Comets cross the middle tier. |
| **Gale Bridge** | One 25-tile bridge across the stage, two high slabs, a low slab under the middle. | **Gales** every 10 to 13 s: a 1.7 s warning, then 3.3 s of wind (0.34 px/tick²) from one side. Comets cross the high slabs. |
| **Conveyor Sky** (moving floors) | Seven belt rows on four tiers, a centre slab and two side slabs. Belts alternate direction, tier by tier: the low tier carries toward the middle, the second and top tiers carry out toward the edges. | **Belts** reverse every 7 to 10 s: they stop for a 1.25 s warning (chevrons turn orange), then all run the other way. Comets cross the slabs (lanes y 650 and 480). |
| **Sinking Ship** (moving floors) | Six deck rows that heave on the swell, the two halves of the main deck half a period apart, a keel slab at the bottom and two side slabs. | **Tide** as in Tide Pools (it floods the keel), plus comets across the side slabs. |

**Moving floors.** A row can carry a belt speed or ride a sine (a *bob*: amplitude
22 to 36 px, period 6 to 10 s). Every tile of a row moves together, so a row is
still a tier. A player standing on a tile rides it: a belt adds its speed to
their position (it is not a velocity, so standing still on a belt still crumbles
the tile and carries you toward the edge), and a deck's rise and fall is added to
their height. Everything that finds "the tile I stand on" (moves, bots) works on
the tile's current height. Objects on a deck follow its height; objects do not
ride belts. Slabs and comet lanes do not move.

Comets knock players 15 px/tick sideways and 7 up. Hazards have no owner: an elimination by a hazard is credited to whoever last
affected the player (including whoever reflected the comet).

## Blast zones, stocks and credit

<a id="blast-zone"></a>
The blast zones are the edges of the world plus a margin: x < -260, x > 1860,
y > 980 (just below the screen, so falling under the lowest tier needs a real
recovery), y < -420 (far above). Crossing one, or touching
the tide, eliminates. The eliminated player loses a stock and after 1.5 s
respawns on a **halo**: a personal floating platform at the spawn point farthest
from the others, which vanishes as soon as you step off it (or after 3 s).
Respawned players are untouchable by hazards and contact for 2 s.

**Credit**: every indirect effect records "who did this to me". An elimination
within 5 s of such an effect is credited to that player; otherwise it is a
self-elimination ("fell"). If the last players are eliminated on the same tick,
the tie is broken by credited eliminations, then fewer self-eliminations, then
platforms broken, then seat order.

## Overtime

<a id="overtime"></a>
Every match ends. From 1:30 of play, **overtime**: every 30 s, platforms take
50% longer to come back and hazards come 15% more often (to a floor of 40% of
the normal gap). From 3:30, **collapse**: nothing broken comes back, a random
crumble tile is doomed every 0.5 s and every sturdy slab loses 1 hp every 2 s.
The stage is gone within about a minute.

## Controls

Four key clusters on one keyboard, chosen so each fits one hand, avoids
browser-reserved keys (no Ctrl, Alt, Tab or function keys: Ctrl+W would close
the tab), and keeps the same shape (jump in the middle, Place left of it,
Trick and Break to the right):

| Seat | Move / jump / drop | Place | Trick | Break |
|---|---|---|---|---|
| P1 | A D, W, S | Q | E | R |
| P2 | ← →, ↑, ↓ | `.` (or Delete) | `/` (or End) | Right Shift (or Page Down) |
| P3 | J L, I, K | U | O | P |
| P4 | Numpad 4 6, 8, 5 (or 2) | Numpad 7 | Numpad 9 | Numpad + |

Global: Esc pauses, M mutes, Enter confirms in menus. Any seat's cluster also
drives the menus.

**Ghosting.** Most keyboards cannot report every combination of three or more
keys (it depends on the keyboard's wiring). The clusters sit in different
regions of the keyboard to reduce clashes, and the Controls screen has a key
tester that lights each seat's keys as they register, so players can check
their keyboard before a match. Modifier keys (Right Shift) rarely ghost.

## Bots

<a id="bots"></a>
Bots live in the simulation (`src/bot.js`) and read only the match state, with
their own seeded generator, so a bot match is as deterministic as any other.
Each tick a bot:

1. **Picks footing.** Every few ticks (its reaction time) it scores the
   surfaces it could reach: solid, low stress, not shaking, not coated, not in
   a warned hazard lane, rock column or the tide, not in a charge radius,
   preferring the middle of the stage and nearby ground. It heads for the best.
   When an opponent is falling with nothing under them, normal and hard bots
   **edge-guard**: they stand near the edge that player is heading for.
2. **Moves.** Runs toward the target, jumps when the target is above, drops
   when it is below, uses the air jump to recover, and paces back and forth
   across tiles when it arrives so its ground holds.
3. **Dodges.** Jumps over an incoming comet, leaves a rock's column, climbs
   above the tide, leaves a gust box toward the stage.
4. **Uses its kit.** For each ready move it checks whether it would hurt an
   opponent: a lob that would land near an opponent's feet, a saw along an
   opponent's row, a drill from above, a wall or bumper in an opponent's path,
   a gust that would push someone toward an edge, and against a recovering
   opponent a bumper, wall, gust or lob at the edge they need. Its recovery
   tools (ledge, air spring, air bumper, Dab's air decoy, Glim's second air
   jump) come out when it is falling with nothing below. Dab's bot hollows
   tiles under an opponent on its tier and rubs out the floor ahead of one;
   Fern's bot grows thorns in an opponent's path and plants roots under one
   (the vine is left to people); Ferro's bot places a lodestone where someone
   else's loose metal is about to pass and flips it with metal hanging on it
   and an opponent in reach. Bots treat thorns and a growing root bulge as
   dangerous floor.

Three levels: **easy** (reacts in 0.4 s, rarely uses moves, misjudges throws,
misses hazards 45% of the time, no edge-guarding), **normal** (0.2 s, misses
15%) and **hard** (0.08 s, aims well, never misses a hazard, uses moves
whenever useful).

Playtesting with bots (4 normal bots, 3 stocks) gives an elimination every 15
to 30 s on the Quarry, Tide Pools and Gale Bridge; the Yard is the gentlest
stage, and so are the two moving stages, where bots (who simply keep walking)
take most of a match to be worn down. `tests/bots.test.js` checks that bot
matches on every stage end with a winner within six minutes and, on the first
four stages, that most eliminations happen before the collapse. The moving
stages have not been played by people yet; their numbers (belt speeds, swell
amplitudes, reversal rhythm) are first guesses.

## Simulation

<a id="simulation"></a>
- `src/` is the whole game rule set: no DOM, no rendering, no input devices.
  `web/` imports it.
- Fixed 60 Hz ticks. `step(state, inputs)` takes one button bitmask per seat
  (left, right, up, down, place, trick, break) and advances one tick.
- All randomness comes from seeded generators stored in the state (mulberry32:
  one for the stage, one for bots). Nothing reads the clock or Math.random.
  `hashState` fingerprints a state; the tests check that the same seed and
  inputs give the same hash.
- The state is plain JSON-able data, which leaves the door open to rollback or
  lockstep online play later.
- `state.events` lists what happened this tick (sounds, particles) for the
  client; it is excluded from the hash.

## Presentation

- Screens: title (with a live bot match behind it), Players (each seat joins
  and picks with its own keys; number keys add bots), Stage (with stocks),
  How to play, Controls (with a key tester), the match, Pause (resume,
  restart, players and stage, quit), Results (placings, awards, stats,
  rematch). Everything is keyboard-driven; settings are remembered per browser.
- Keys are rebindable on the Controls screen (Enter to edit, Enter on an action,
  then the new key; Backspace restores the default). A rebound action holds one
  key; a key another action uses is refused, and the menu keys (Esc, Enter, M,
  1-4, Space, Tab, Backspace) and modifiers can't be bound. Stored per browser;
  stored bindings that clash are dropped on load. Logic in `web/bindings.js`.
- Fixed camera showing the whole stage, letterboxed to the window.
  Off-screen players get an arrow at the screen edge in their colour.
- Player colours are per seat (P1 red, P2 blue, P3 green, P4 gold); characters
  differ in silhouette (Mason's hard hat, Glim's hood, Pip's antenna, Fuse's
  goggles and spark, Dab's beret, Fern's sprout, Ferro's magnet).
- Tiles jitter and redden as stress rises, crack when doomed, and fall
  tumbling; respawning tiles flicker in outline. Hazard warnings are lane
  stripes, shadows and edge arrows with a siren.
- Human players with a lobbed move ready (Glim, Fuse's charge) see a faint
  aim arc and a landing mark; it follows the throw modifiers held (forward,
  up). The GO banner reminds everyone to keep moving.
- Forged floor: a decoy is drawn as an ordinary tile with a slow pulse of its
  painter's colour; hollowed tiles pulse faster while they arm. Rub out shows
  its stroke as a dashed box that fills in as it lands.
- Fern's plants: a seed and a shoot while a vine sprouts (then green leaves,
  wilting yellow in the last second); thorns grow up as spikes; roots show a
  dashed circle that tightens and a swelling mound.
- Ferro's lodestone: a horseshoe with field rings that drift in (pull) or out
  (push, in red); an ingot is a silver bar.
- Synthesized sound (WebAudio, no files), mute with M.
- KOs flash at the blast zone in the victim's colour, shake the screen and
  post to a feed ("P1's glue → P3").
- Results show placings and stats: eliminations credited, self-eliminations,
  platforms broken, objects placed, stomps, time airborne, longest life.

## Ideas not yet built

- Online play (lockstep or rollback over the deterministic simulation).
- Gamepad support (the brief says keyboard only, so this needs the owner's say).
- Team mode and handicaps; replays from recorded inputs.
