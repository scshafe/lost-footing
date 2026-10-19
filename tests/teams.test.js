import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatch, step, eliminate, hashState } from "../src/index.js";
import { testMatch, place, onTile, ROW_Y } from "./helpers.js";

const four = (teams, stocks = []) =>
  testMatch({ seats: [0, 1, 2, 3].map((i) => ({ kind: "human", character: "mason", team: teams[i], stocks: stocks[i] })) });

function standAll(s) {
  s.players.forEach((p, i) => {
    place(s, p, onTile(2 + i * 3), ROW_Y);
    p.stocks = 1;
  });
  step(s, []);
}

test("a seat's stocks override the match default (a handicap), within 1 to 9", () => {
  const s = createMatch({ seed: 1, stage: "test", stocks: 3, seats: [{ kind: "human", stocks: 5 }, { kind: "human" }, { kind: "human", stocks: 0 }, { kind: "human", stocks: 40 }] });
  assert.deepEqual(
    s.players.map((p) => p.stocks),
    [5, 3, 1, 9],
  );
  assert.deepEqual(
    s.players.map((p) => p.startStocks),
    [5, 3, 1, 9],
  );
});

test("a team wins when the other side is out, and its members place first", () => {
  const s = four([0, 0, 1, 1]);
  standAll(s);
  eliminate(s, s.players[2], "fall");
  step(s, []);
  assert.equal(s.phase, "play", "one of the other team is still in");
  eliminate(s, s.players[3], "fall");
  step(s, []);
  assert.equal(s.phase, "over");
  assert.deepEqual(s.result.winners, [0, 1]);
  assert.equal(s.result.team, 0);
  assert.deepEqual(s.result.ranking.slice(0, 2).sort(), [0, 1]);
  assert.deepEqual(s.result.ranking.slice(2), [3, 2], "the later elimination places higher");
  assert.ok(!s.result.tied);
});

test("a team does not lose until all of it is out", () => {
  const s = four([0, 0, 1, 1]);
  standAll(s);
  eliminate(s, s.players[0], "fall");
  eliminate(s, s.players[2], "fall");
  eliminate(s, s.players[3], "fall");
  step(s, []);
  assert.equal(s.phase, "over");
  assert.deepEqual(s.result.winners, [1], "the last teammate standing carries the win");
  assert.equal(s.result.team, 0);
});

test("teams need two sides; with one, everyone plays alone", () => {
  const s = four([0, 0, 0, 0]);
  assert.ok(s.players.every((p) => p.team === -1));
  assert.equal(s.teams, false);
  const t = four([0, 0, -1, -1]);
  assert.equal(t.teams, true);
  assert.deepEqual(
    t.players.map((p) => p.team),
    [0, 0, -1, -1],
  );
});

test("solo players are their own side against a team", () => {
  const s = four([0, 0, -1, -1]);
  standAll(s);
  eliminate(s, s.players[3], "fall");
  step(s, []);
  assert.equal(s.phase, "play", "the solo player and the team are still in");
  eliminate(s, s.players[2], "fall");
  step(s, []);
  assert.equal(s.phase, "over");
  assert.deepEqual(s.result.winners, [0, 1]);
});

test("without teams a lone survivor wins as before", () => {
  const s = four([-1, -1, -1, -1]);
  standAll(s);
  for (const i of [1, 2, 3]) eliminate(s, s.players[i], "fall");
  step(s, []);
  assert.equal(s.phase, "over");
  assert.deepEqual(s.result.winners, [0]);
  assert.equal(s.result.team, -1);
});

test("friendly fire earns no credit; an opponent's does", () => {
  const s = four([0, 0, 1, 1]);
  standAll(s);
  s.players.forEach((p) => (p.stocks = 3));
  s.players[1].blame = { seat: 0, tick: s.tick, cause: "glue" };
  eliminate(s, s.players[1], "fall");
  assert.equal(s.players[0].stats.kos, 0, "a teammate's glue is not a KO");
  assert.equal(s.players[1].stats.falls, 1);
  s.players[2].blame = { seat: 0, tick: s.tick, cause: "glue" };
  eliminate(s, s.players[2], "fall");
  assert.equal(s.players[0].stats.kos, 1);
});

test("a 2v2 bot match with a handicap ends and is deterministic", () => {
  const mk = () =>
    createMatch({
      seed: 8,
      stage: "yard",
      stocks: 2,
      seats: [
        { kind: "bot", character: "mason", team: 0, stocks: 1 },
        { kind: "bot", character: "glim", team: 0, stocks: 1 },
        { kind: "bot", character: "pip", team: 1, stocks: 3 },
        { kind: "bot", character: "fuse", team: 1, stocks: 3 },
      ],
    });
  const a = mk();
  const b = mk();
  while (a.phase !== "over" && a.tick < 22000) {
    step(a, []);
    step(b, []);
  }
  assert.equal(a.phase, "over");
  assert.equal(hashState(a), hashState(b));
  assert.ok(a.result.winners.every((seat) => a.players[seat].team === a.result.team), "the winners are one team");
});
