# Score Keeper

Score keeper for various games, starting with **Phase 10**. Built for a phone
passed round the table: one tap a hand, and nobody has to remember who is on
which phase.

Lives at **https://score.rasip.us** (port 8101, same shape as every other
project on the Hub).

## What it does

- **Phases and points in one place.** Each player's current phase, their running
  total and a ten-pip progress bar, ranked the way Phase 10 ranks: furthest
  along first, lower score breaking the tie.
- **Scoring a hand.** Mark who went out (points go to 0 and the phase counts
  automatically), tap *Made it* or *Missed* for everyone else, then the points
  left in their hand.
- **Counting the cards.** *Count cards* opens a tap-counter for 1–9 (5), 10–12
  (10), Skip (15) and Wild (25) so nobody does the arithmetic twice.
- **Fixing a hand.** Every total is replayed from the hands, so tapping a past
  hand and correcting it fixes every number after it. *Undo last hand* drops the
  last one entirely.
- **Who deals next**, rotating a seat each hand.
- **The phase list**, with each player's avatar sitting on the phase they are
  working on.
- **Winning.** First to finish phase 10 takes it; if two finish in the same hand,
  the lower score wins, and an exact tie offers a tie-breaker hand between just
  those players.
- **Rematch** keeps the same names, and *Copy the scores* puts a summary on the
  clipboard for the family chat.
- **House rule:** *Any phase, any order* lets each player pick which phase to
  attempt instead of working 1 to 10; the game is then won by finishing all ten.

Games are kept in the browser's local storage, so each device keeps its own.
Nothing is sent anywhere, and there is no account.

### The phases

| # | Phase | # | Phase |
|---|-------|---|-------|
| 1 | 2 sets of 3 | 6 | 1 run of 9 |
| 2 | 1 set of 3 + 1 run of 4 | 7 | 2 sets of 4 |
| 3 | 1 set of 4 + 1 run of 4 | 8 | 7 cards of one color |
| 4 | 1 run of 7 | 9 | 1 set of 5 + 1 set of 2 |
| 5 | 1 run of 8 | 10 | 1 set of 5 + 1 set of 3 |

## Running it

```
python server.py            # http://127.0.0.1:8101
python server.py 9000       # somewhere else
```

`server.py` serves the three files and nothing else — the README and the git
history are not reachable — and carries the Hub's cache policy: HTML always
revalidates, and `style.css` / `app.js` go out with a content hash in the URL
that the server fills in as the HTML is sent. Editing an asset changes its URL,
so a new version reaches a phone immediately, with no cache purge here or at
Cloudflare. `/healthz` answers `{"ok":true}`.

## Putting it on rasip.us

Three steps on the PC, matching how the other projects are wired up:

1. **Clone it** to `F:/Claude/Score-keeper`.

2. **Register it** in `F:/Claude/Hub/control/services.json`, in `projects`:

   ```json
   {
     "id": "score", "name": "Score Keeper", "hue": 330, "folder": "F:/Claude/Score-keeper",
     "url": "https://score.rasip.us", "directory": true,
     "description": "Phase 10 score keeper for the table -- phases, points and hand-by-hand history, on everyone's phone.",
     "services": [
       { "id": "score", "name": "Score keeper", "kind": "server", "ports": [8101],
         "hostnames": ["score.rasip.us"], "exposure": "public",
         "start": { "exe": "python", "args": ["server.py", "8101"], "cwd": "F:/Claude/Score-keeper",
                    "stdout": "F:/Claude/Score-keeper/server.log", "stderr": "F:/Claude/Score-keeper/server.err.log" },
         "logs": ["F:/Claude/Score-keeper/server.err.log"],
         "health": "/healthz", "freeze": "allow" }
     ],
     "tasks": []
   }
   ```

   8101 is clear of everything in the registry today (8080–8098 and 8100 are
   taken, and 8099 is left alone as it sits between the control engine's two
   ports).

3. **Route the hostname.** Add `score.rasip.us` to the cloudflared config
   pointing at `http://localhost:8101`, add the DNS record for it, and restart
   the tunnel. Then start the service from the Hub, or let the deploy page do
   the pull and the restart.

It has no watchdog yet, so the Hub will tag it `needsWatchdog` and offer
auto-restart — turning that on is enough for a static page like this one.
