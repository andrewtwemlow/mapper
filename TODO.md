# TODO


## New feature

- Able to remove an uploaded file
- ~~Need to pass in Carto API key~~ ✅ Done — API key input added to sidebar; see `.kiro/steering/carto-api.md`
- support different map providers, create a steering doc for each tile API provider
  - MapBox
  - OpenStreetMaps
- add support for KML files
- For docker build be more selective what is copied into the build layer
  - as it is currently copying in the localy compiled version as well
- docker build

```
[WARN]: :-) There's a newer version of wasm-pack available, the new version is: 0.15.0, you are using: 0.13.1. To update, navigate to: https://rustwasm.github.io/wasm-pack/installer/
```
- Add clean up task, that removes all local artifacts, e.g. create/target, app/dist, app/nodes_modules. ie. everything that is in gitignore, not test-data and `.env`
- when bulding for production are all files minified?

### Editor

When one file is uploaded

Display the elevation profile, is the data is present.
Use this in a similar was as a time series selector to be able to trim the map
the UI will refresh in real time with the map being trimmer.
The download options will then reflect the trimmer GPX trace/
