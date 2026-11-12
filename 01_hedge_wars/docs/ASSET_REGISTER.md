# Asset and attribution register

Every imported font, image, audio clip, map and animation must be listed before shipping. Do not assume a repository-wide label overrides per-file/component notices.

| ID | Files | Origin | License/status | Modifications and attribution |
| --- | --- | --- | --- | --- |
| ORIGINAL-01 | `hub/src/` CSS and `client/src/preview.ts` procedural illustration | Authored for this project, 2026-11-12 | Repository license choice pending | No upstream attribution required |
| ORIGINAL-02 | `hub/public/icons/icon-192.png`, `icon-512.png` | Original foundation icons | Repository license choice pending | Retained temporarily for previously installed clients; new manifest references controller icons |
| MATERIAL-01 | `hub/public/icons/controller.svg`, `controller-192.png`, `controller-512.png`, controller path in `hub/src/main.ts` | Google Material Icons, `sports_esports` ([source](https://github.com/google/material-design-icons/blob/master/src/social/sports_esports/materialicons/24px.svg)) | Apache License 2.0; copy at `licenses/material-design-icons-APACHE-2.0.txt` | Vector recolored and centered, controller spans 50% of icon width; PNG generation via `scripts/create-icons.mjs` |
| UPSTREAM-00 | none | Hedgewars reference checkout only | Not imported | Complete component review at REL-01 / first import |

Runtime dependencies are recorded in package manifests/lockfile. Phaser and other library licenses remain their own; dependency notices must be audited for release bundles. Do not commit an invented umbrella license that conflicts with imported material.

