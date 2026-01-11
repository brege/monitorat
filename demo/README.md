# Demo Directory


## Overview

- Each demo has an `index.yml`
- `python docs.py` generates all fixture `docs/*.md`'s from `index.yml`
- Do not create `demo/docs/*.md`. They are .gitignore'd
- `setup.py` creates synthetic data in `demo/data/` used in wdigets

## Usage

Launch demos with:
```
uv tool install -e monitorat
monitorat demo --mode simple # simple | advanced | federation | editor
```
Or use `uv run demo/launcher.py --mode simple` (better).

Each README in each demo is the splash page for that demo on `monitorat.brege.org`.

## 1. Simple Demo

Every widget, full-fat: one example for each.

@simple/README.md

## 2. Advanced Demo

Widget features, modes. Widgets are collections of subwidgets

@advanced/README.md

## 3. Federation Demo

Each widget's token, federated subwidget. Two nodes and central head node.

@federation/README.md

## 4. Editor Demo

Editing wiki docs: **experimental.**

@editor/README.md

## 5. Layout Demo

@TODO

- wiki columns, stacks, document inclusions
- mixed widget columns, stacks
- NxM grid examples
