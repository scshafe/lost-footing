# Lost Footing

A keyboard survival fighter for the browser, for 2 to 4 players on one
keyboard (bots fill empty seats). Players share a stage built from crumbling
platforms and **never hit each other**: they win by placing obstacles,
breaking platforms and steering hazards so that the others lose their footing.

The owner's brief is [docs/brief.md](docs/brief.md); the design that follows
from it, with every number the game uses, is [docs/design.md](docs/design.md).

## Run it

```sh
./scripts/serve        # then open http://localhost:8080/web/
```

`PORT=9000 ./scripts/serve` serves on another port. There is no build step:
plain ES modules and Canvas 2D, no dependencies.

The deployed game runs the same files from a container (`Dockerfile`,
`server/serve.js`) on a tailnet-only machine, `lost-footing`; a merge to `main`
deploys it (`deploy/stack/`, `.github/workflows/deploy.yml`).

## How to play

- **You can never hit anyone.** Nothing you do touches another player.
- **The ground crumbles.** Stand still and the tiles under you shake and fall
  in about a second; keep moving and they hold. Broken tiles come back after a
  few seconds. Platforms are one-way: jump up through them, press down to drop.
- **Sturdy slabs** don't crumble, but every stage aims a hazard at them on a
  rhythm (comets, rockfall, the tide, gales), always warned first. Moves can
  break them too.
- **Fall out, lose a stock**: the pit, the sides, the top, or the tide. You
  come back on a halo. Last player with stocks wins.
- **Bodies only touch top to bottom**: land on someone to stomp them (they
  sink, their tiles crack), jump into their feet to bump them up, or ride on
  their head. Side to side you pass through.
- **Three moves each**: 1 Place (an obstacle), 2 Trick, 3 Break (wreck the
  floor). Everything you place affects everyone, you included. Throws go
  further holding forward and higher holding up.
- **Credit is indirect**: if your glue, spring, broken tile, stomp or reflected
  comet sends someone out within five seconds, the elimination is yours.

| Character | 1 Place | 2 Trick | 3 Break | Trait |
|---|---|---|---|---|
| Mason, the builder | Wall | Ledge | Anvil | builds his own footing |
| Glim, the alchemist | Glue | Oil | Acid | two air jumps |
| Pip, the acrobat | Spring | Gust | Drill | an air spring launches him |
| Fuse, the demolitionist | Bumper | Charge | Saw | an air bumper bounces him |
| Dab, the forger | Decoy | Hollow | Rub out | her fake floor holds only her |
| Fern, the gardener | Vine | Thorns | Roots | her plants sprout slowly and last |
| Ferro, the magnetist | Lodestone | Polarity | Ingot | takes the loose metal she pulls |

Stages: Crumble Yard (comets), The Quarry (rockfall), Tide Pools (the tide),
Gale Bridge (gales), Conveyor Sky (belts that stop and reverse), Sinking Ship
(heaving decks and the tide).

## Controls

| Seat | Left / right | Jump | Drop / fast fall | 1 Place | 2 Trick | 3 Break |
|---|---|---|---|---|---|---|
| P1 | A / D | W | S | Q | E | R |
| P2 | ← / → | ↑ | ↓ | `.` or Delete | `/` or End | Right Shift or Page Down |
| P3 | J / L | I | K | U | O | P |
| P4 | Numpad 4 / 6 | Numpad 8 | Numpad 5 or 2 | Numpad 7 | Numpad 9 | Numpad + |

Esc pauses, M mutes, Enter confirms. In the Players screen each seat joins
with its own Place key, changes character with its left/right keys and leaves
with its Break key; number keys 1 to 4 add a bot to that seat (press again
for hard, easy, off). The Trick key sets a team (solo, A or B: a team wins
together) and up/down give a handicap of up to two stocks either way. The
Controls screen has a key tester and lets you rebind keys (Enter to edit).
Keyboards cannot report every combination of keys held at once (ghosting), so
check yours there.

Every match is recorded: Results has Watch replay and Save replay, and the
title screen can load a saved replay file.

## Build and test

```sh
./scripts/verify-linux
```

The repository's one verify command (`dev.toml [verify]`): syntax-checks every
module and runs the Node test suite (`tests/*.test.js`), including headless
bot-versus-bot matches on every stage. Needs Node.js 24.

## Layout

- `src/`: the deterministic simulation (60 Hz fixed ticks, seeded RNG, no
  DOM). `createMatch(config)`, `step(state, inputs)`, `hashState(state)`.
- `web/`: the browser client (screens, rendering, keyboard, WebAudio sound).
- `server/`: the static server the image runs (`web/` and `src/` only, `/healthz`).
- `deploy/stack/`: the tailnet stack (Tailscale sidecar and the game).
- `tests/`: `node:test` suites.
- `docs/`: the brief and the design.

## License

MIT (`LICENSE`).
