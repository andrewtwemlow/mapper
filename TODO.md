# TODO

Last notes

```

Good progress — 12 passing. Two distinct remaining issues:

1. ENOENT: /home/andrew/code/mapper/tests/test-data/ — the path resolves wrong. fileURLToPath(import.meta.url) gives the file path itself, not its directory. Need path.dirname(fileURLToPath(import.meta.url)) to get the containing folder.

2. DataTransfer is not defined — DataTransfer is a browser API, not available in Node.js test context. The drag-and-drop test needs to use page.dispatchEvent differently.

Fixing the path issue in all five spec files first — it's one character change in each:
```

## New feature

- Able to remove an uploaded file
