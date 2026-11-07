You work in the repository at /tmp/de46/work/aip/invoice-paid/repo. Apply the skill in /tmp/de46/work/aip/invoice-paid/skill (read its SKILL.md first and follow its procedures) to the task in /tmp/de46/work/aip/invoice-paid/repo/TASK.md. The repo companion is /tmp/de46/work/aip/invoice-paid/repo/COMPANION.md; run commands from /tmp/de46/work/aip/invoice-paid/repo. The Postgres database for this repo is already running; its URL is in /tmp/de46/work/aip/invoice-paid/repo/database.url.

Run P0, then P1, then P2. Before anything else, run P0 and write its result to /tmp/de46/work/aip/invoice-paid/repo/RESULT.json as {"violations": [...], "problems": [numbers], "applies": bool}.
If the skill has script steps, run them (scripts are under the skill folder; read a script's header for usage). Do the steps yourself; do not look outside /tmp/de46/work/aip/invoice-paid/repo and /tmp/de46/work/aip/invoice-paid/skill.
If P0 says applies is false, stop after P0.
Finish with a short report (the steps you ran, what you changed, anything you could not do) and also write it to /tmp/de46/work/aip/invoice-paid/AGENT_REPORT.md.
