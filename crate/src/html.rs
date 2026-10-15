//! HTML map document generator.
//!
//! Produces a self-contained HTML file that renders all uploaded tracks on a
//! Leaflet.js map. The document:
//!
//! - References Leaflet JS and CSS from CDN (requires network for tiles).
//! - Embeds all track coordinate data as an inline JSON blob in a `<script>` tag.
//! - Supports all four CartoDB tile styles, defaulting to DarkMatter.
//! - Renders each track as a coloured polyline using the default 10-colour palette.

use crate::error::MapperError;
use crate::track::Track;

/// Leaflet CSS CDN URL.
const LEAFLET_CSS_URL: &str = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

/// Leaflet JS CDN URL.
const LEAFLET_JS_URL: &str = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

/// CartoDB DarkMatter tile URL template (default).
const TILE_DARK_MATTER: &str = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

/// CartoDB DarkMatter (no labels) tile URL template.
const TILE_DARK_MATTER_NO_LABELS: &str =
    "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";

/// CartoDB Positron tile URL template.
const TILE_POSITRON: &str = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

/// CartoDB Voyager tile URL template.
const TILE_VOYAGER: &str =
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

/// CartoDB tile attribution string required by the tile licence.
const TILE_ATTRIBUTION: &str =
    "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors &copy; <a href=\"https://carto.com/attributions\">CARTO</a>";

/// Default track colour palette — 10 colours that cycle when more tracks are uploaded.
///
/// Pre-serialised as a JSON array for embedding in HTML output.
/// Uses `r##` delimiters because the string contains `#` characters.
const DEFAULT_COLOURS_JSON: &str = r##"["#1f77b4","#ff7f0e","#2ca02c","#d62728","#6d20b6","#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf"]"##;

/// Generate a self-contained HTML map document from a slice of [`Track`] values.
///
/// The output is a complete HTML5 document that can be saved as a `.html` file
/// and opened in any modern browser. It embeds all track data as JSON and loads
/// Leaflet from CDN, so sharing the file requires only network access for tiles.
///
/// # Errors
///
/// Returns [`MapperError::Serialise`] if track data cannot be serialised to JSON.
pub fn generate(tracks: &[Track]) -> Result<String, MapperError> {
    let tracks_json = serialise_tracks(tracks)?;
    // JSON-encode the attribution so embedded quotes in href attributes are
    // safely escaped when inserted into the JS string literal.
    let attribution_json = serde_json::to_string(TILE_ATTRIBUTION)
        .map_err(|e| MapperError::Serialise(e.to_string()))?;

    Ok(format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GPX Map</title>
  <link rel="stylesheet" href="{leaflet_css}" />
  <style>
    html, body {{
      height: 100%;
      margin: 0;
      padding: 0;
    }}
    #map {{
      height: 100%;
      width: 100%;
    }}
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="{leaflet_js}"></script>
  <script>
    // Track data embedded at export time
    var TRACK_DATA = {tracks_json};

    // CartoDB tile configurations
    var TILE_LAYERS = {{
      "DarkMatter": {{
        url: "{dark_matter}",
        label: "Dark Matter"
      }},
      "DarkMatterNoLabels": {{
        url: "{dark_matter_no_labels}",
        label: "Dark Matter (No Labels)"
      }},
      "Positron": {{
        url: "{positron}",
        label: "Positron"
      }},
      "Voyager": {{
        url: "{voyager}",
        label: "Voyager"
      }}
    }};

    var ATTRIBUTION = {attribution_json};
    var DEFAULT_COLOURS = {colours_json};

    // Initialise the map centred on the track data bounds
    var map = L.map("map");

    // Add the default tile layer
    var currentTile = L.tileLayer(TILE_LAYERS["DarkMatter"].url, {{
      attribution: ATTRIBUTION,
      maxZoom: 19
    }}).addTo(map);

    // Render each track as a coloured polyline
    var bounds = [];
    TRACK_DATA.forEach(function(track, index) {{
      var colour = track.colour || DEFAULT_COLOURS[index % DEFAULT_COLOURS.length];
      var latlngs = track.points.map(function(p) {{ return [p.lat, p.lon]; }});
      L.polyline(latlngs, {{ color: colour, weight: 2, opacity: 1 }})
        .bindTooltip(track.name)
        .addTo(map);
      bounds = bounds.concat(latlngs);
    }});

    // Fit the map to the combined bounds of all tracks
    if (bounds.length > 0) {{
      map.fitBounds(L.latLngBounds(bounds));
    }} else {{
      map.setView([0, 0], 2);
    }}
  </script>
</body>
</html>
"#,
        leaflet_css = LEAFLET_CSS_URL,
        leaflet_js = LEAFLET_JS_URL,
        tracks_json = tracks_json,
        dark_matter = TILE_DARK_MATTER,
        dark_matter_no_labels = TILE_DARK_MATTER_NO_LABELS,
        positron = TILE_POSITRON,
        voyager = TILE_VOYAGER,
        attribution_json = attribution_json,
        colours_json = DEFAULT_COLOURS_JSON,
    ))
}

/// Serialise a slice of [`Track`] values to a JSON array string.
///
/// Each track is serialised with its `name` and `points` fields. The result
/// is embedded directly into the HTML `<script>` tag.
///
/// # Errors
///
/// Returns [`MapperError::Serialise`] if serialisation fails.
fn serialise_tracks(tracks: &[Track]) -> Result<String, MapperError> {
    serde_json::to_string(tracks).map_err(|e| MapperError::Serialise(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::track::Point;

    fn sample_tracks() -> Vec<Track> {
        vec![
            Track::new(
                "run_a",
                vec![
                    Point {
                        lat: 51.5,
                        lon: -0.1,
                        ele: Some(10.0),
                    },
                    Point {
                        lat: 51.6,
                        lon: -0.2,
                        ele: None,
                    },
                ],
            ),
            Track::new(
                "run_b",
                vec![Point {
                    lat: 52.0,
                    lon: -1.0,
                    ele: None,
                }],
            ),
        ]
    }

    #[test]
    fn generate_contains_leaflet_css_cdn_reference() {
        let html = generate(&sample_tracks()).unwrap();
        assert!(html.contains(LEAFLET_CSS_URL));
    }

    #[test]
    fn generate_contains_leaflet_js_cdn_reference() {
        let html = generate(&sample_tracks()).unwrap();
        assert!(html.contains(LEAFLET_JS_URL));
    }

    #[test]
    fn generate_contains_track_data_script_block() {
        let html = generate(&sample_tracks()).unwrap();
        assert!(html.contains("var TRACK_DATA ="));
        assert!(html.contains("run_a"));
        assert!(html.contains("run_b"));
    }

    #[test]
    fn generate_contains_all_carto_tile_urls() {
        let html = generate(&sample_tracks()).unwrap();
        assert!(html.contains(TILE_DARK_MATTER));
        assert!(html.contains(TILE_DARK_MATTER_NO_LABELS));
        assert!(html.contains(TILE_POSITRON));
        assert!(html.contains(TILE_VOYAGER));
    }

    #[test]
    fn generate_contains_attribution() {
        let html = generate(&sample_tracks()).unwrap();
        assert!(html.contains("CARTO"));
        assert!(html.contains("OpenStreetMap"));
    }

    #[test]
    fn generate_empty_tracks_produces_valid_html() {
        let html = generate(&[]).unwrap();
        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("var TRACK_DATA = []"));
    }

    #[test]
    fn generate_embeds_coordinate_data() {
        let html = generate(&sample_tracks()).unwrap();
        assert!(html.contains("51.5"));
        assert!(html.contains("-0.1"));
    }
}
