i've completely lost control of the network widget.

the point of the refactor on the 'refactor' branch was to orthoganalize federation from layout.

the network widget is so entangled in federation conditions, and its monolothic bloat that only grew
more and more, drifting from `network/features/*.js` (which was suppose to make all feaure work easier
to manage), which have been neglected and might as well not even exist.

several steps have been taken on this branch:

- decouple federation from "stacking"
- decouple "columnation" from federation
- converge to a point where all widgets, regardless of source, can be treated as column elements with
graceful, responsive stacking fallbacks around min widths (and calculated interior min widths)

the main value prop of federation features:

- share controls for akinned widgets for cohesive view and operation (sorting down for all
metric.nas-[1-3] (example) when stacked or columnated
- merge data through interleaving and plotting
- treat wiki-mergers of markdown documents specially (these are not good pilots to base federation
work from, but they are done nonetheless as their own kind of status indeicator)

we have a working implementation now, but it's impossible to adapt it to aplace where widgets can be
fluid with each other, because proximity of two akinned widgets sharing controls makes separating
them, and therefore the modular paradigm, impossible. the number of event listeners expoinds, and i'm
trapped in unmaintainable bespoke code that cannot let me acheive my vision.

QUESTIONS I ask:

- do i need stacked or column-connected reminder widgets from two nodes to be coupled, when merged
should be the pure, federated super widget we wanted?
- do i need services to share controls when not mixed together?
- do i need metrics sharing plot controls when they are not mixed together?
- network upime pills? network stats?
- network ouages when stacked or columnated?

The answer to these is No. I do not need this.


The practical, pure mix widgets for federation:

- interleaved reminders
- interleaved services
- multi-source metrics plots
- multi-source speedtest plots
- interleaved network outages

Let me call the combinators.

These are the core value of federation where coupled controlling makes sense. The nice-to-haves that
were ultimately developed for all of the column and stacked versions of these make a tangled mess.

Every other scenario must be, I think, to make all other widget.component independent from the other.
Only in the case of the combinators, where shared controls can then allow you to filter, solo,
examine trends across instances, together in the same timeline, does this make sense.  Every other
widget.component (sometimes we use the word feature, subwidget, it's sloppy) should live agnostically
and should just be treated as independent strangers. No connected events. No connected controls.
Only cooperate around layout.

subwidgets:
- system metrics: "history" (chart & table always coupled), "snapshot" (tiles of statistics)
- network: "summary/statistics" (tiles), "uptime" (horizontal pills), "outages" (alerts/events
cards)
- speedtest: "control" (button to run), "history" (chart & table)
- reminders: "alerts" (cards like outages)
- services: "service/compact cards" (cards)
- wiki: "markdown" (bodies, fragments)

It's still a process decoupling and reworking that network.uptime and network.outages never need to
appear together. But they rely on the same type of data source, fundamentally.

Monitorat's paradigm is to be a continuous dashboard and documentation platform. It needs to be easy
to make new widgets for. It's a mix of wikipedia, journal articles, and a modular place to check on a
homelab.

To me, we need to first solidified columnation for any widget with any other widget without
dependency. A gap here is we need absolution in section headers <h2 "widget-title"> from the widget.
We do this annoying _suppressHeader for widgets we /don't/ want to be first class, then use parent:
in some of these widgets to be include with the others. I thinkg that part is fine. The CSS
disagrees.

We need to define the section header as something else, so columns and widgets belonging to that
section header do not need to be anchored or parent each other.

Proposals:
- Refactor to make Section Headers explicit section separators.
- OR accept that any subwidget can claim header, and you reference as via parent: id.
- We keep subwidgets contained for its principal "data manager". The real widgets are the subwidgets,
who are members of a subwidget manager (Network, Metrics, esp.)
- keep calling subwidgets "features" in config_default.yaml (and `widgets/*/default.yaml` it pulls
from)
- OR change vocabulary (i do not want to do this, as annoying as it is).
- Always maintain subwidget autonomy on position, conrols, etc
- Ironically: Centralize all Federation activity under each Widget Manager as Separate methods that
use a subwidget as a library, plus all the extra merging dynamics).

Anatomy of the Widgets:

```
monitorat/widgets/
├── __init__.py
├── metrics
│   ├── api.py
│   ├── app.js
│   ├── default.yaml
│   ├── features
│   │   ├── history           # CHARTS: Exract From {app.,features/}*.js
│   │   │   ├── chart.js
│   │   │   └── table.js
│   │   └── snapshot.js
│   ├── index.html
│   └── schema.json
├── network
│   ├── api.py
│   ├── app.js
│   ├── default.yaml
│   ├── features
│   │   ├── outages.js
│   │   ├── snapshot.js
│   │   └── uptime.js
│   ├── federation/            # INTERLEAF: Exract From {app.,features/}*.js 
│   ├── index.html
│   └── schema.json
├── reminders
│   ├── api.py
│   ├── app.js
│   ├── default.yaml
│   ├── features
│   │   ├── alerts.js
│   │   └── controls.js
│   ├── federation/            # INTERLEAF: Exract From {app.,features/}*.js 
│   ├── index.html
│   └── schema.json
├── services
│   ├── api.py
│   ├── app.js
│   ├── default.yaml
│   ├── features
│   │   ├── controls.js
│   │   ├── modal.js
│   │   └── snapshot.js
│   ├── federation/            # INTERLEAF: Exract From {app.,features/}*.js 
│   ├── index.html
│   └── schema.json
├── speedtest
│   ├── api.py
│   ├── app.js
│   ├── default.yaml
│   ├── features
│   │   ├── controls.js
│   │   └── history
│   │       ├── chart.js
│   │       └── table.js
│   ├── federation/            # CHARTS: Exract From {app.,features/}*.js
│   ├── index.html
│   └── schema.json
└── wiki
    ├── api.py
    ├── app.js
    ├── default.yaml
    ├── federation/            # includes, etc. (think about later, i like the way it works now)
    ├── index.html
    └── schema.json

14 directories, 45 files
```

You could just as well say outages-XL.js or history-fed/, I don't give a damn.  FEDERATION IS
FUNDAMENTALLY A DIFFERENT FORK OF THE BASE WIDGET since it's multisource. In fact, every one of these
subwidgets that is legitimately Federation-able is the more capable replacement for the original
subwidget.

In this case, the tree collapses again:

```
monitorat/widgets/
├── __init__.py
├── metrics
│   ├── api.py
│   ├── app.js
│   ├── default.yaml
│   ├── features
│   │   ├── history           # CHARTS/TABLES, MULTI-SOURCE
│   │   │   ├── chart.js
│   │   │   ├── federation.js # Federation Library for METRICS
│   │   │   └── table.js
│   │   └── snapshot.js       # ALWAYS SINGLE-SOURCE
│   ├── index.html
│   └── schema.json
├── network
│   ├── api.py
│   ├── app.js
│   ├── default.yaml
│   ├── features
│   │   ├── outages.js        # MULTI-SOURCE
│   │   ├── snapshot.js
│   │   └── uptime.js
│   ├── index.html
│   └── schema.json
```
.. or something of this nature. Something better than the crap we have now.

I haven't had a clear picture until now, because we just tried to make everything federated. But,
that doesn't make sense to make federation coupled to layouts. Indeed, I don't have any demos of
usingtwo mixed widgets with each other as columns. But users will definitely want that. some may want
to alway have a left documeent and a right widget. That's a feature hole i'm not covering and it's
arguably more important than federation at this stage of development.

The key is to untangle the federation stuff where we can and target its scope better.

nearly all federation demos are doing things they shouldn't be doing. Those are layout tests, not
federation material.

The federalization extraction of network.outages will look identical, nearly, to the merge-er for reminders.

GOALS
=====

- HYGIENE: untangle federation from inappropriate subwidgets
- CENTRALIZE: each widget's token federated subwidget
- REWRITE: all unnecessary federalized examples in demo/federation/central/config.yaml as LAYOUT-FOCUSED


ON DECK
=======

- HEADER: improve CSS binding to the Section Header (currently called widget-title)
- RESUME: roll-out of "everything is a column element" for any subwidget
- CREATE: separate layout demo
- ROADMAP: resume docs/readme.md
