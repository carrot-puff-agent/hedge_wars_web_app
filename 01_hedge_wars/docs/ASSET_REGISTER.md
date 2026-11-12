# Asset and attribution register

Every imported font, image, audio clip, map and animation must be listed before shipping. Do not assume a repository-wide label overrides per-file/component notices.

| ID | Files | Origin | License/status | Modifications and attribution |
| --- | --- | --- | --- | --- |
| ORIGINAL-01 | `hub/src/` CSS and `client/src/preview.ts` procedural illustration | Authored for this project, 2026-11-12 | Repository license choice pending; no third-party art imported | No upstream attribution required |
| ORIGINAL-02 | `hub/public/icons/` | Original geometric icon created for this foundation | Repository license choice pending | Source generator is `scripts/create-icons.py` |
| UPSTREAM-00 | none | Hedgewars reference checkout only | Not imported | Complete component review at REL-01 / first import |

Runtime dependencies are recorded in package manifests/lockfile. Phaser and other library licenses remain their own; dependency notices must be audited for release bundles. Do not commit an invented umbrella license that conflicts with imported material.

