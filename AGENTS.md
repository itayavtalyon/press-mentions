# Agents

Before writing code, read `docs/CODING-STANDARD.md`, `docs/ARCHITECTURE.md`, and the ADR the change touches.

One model is one file and one job. Put the change in the model that already owns that job. Do not add a file for a helper. The model table in the coding standard is the map. Entry files only wire ports and set the exit code.
