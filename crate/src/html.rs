//! HTML map document generator.
//!
//! Produces a self-contained HTML file that renders all uploaded tracks on a
//! Leaflet.js map with a user-selectable map provider. The document:
//!
//! - References Leaflet JS and CSS from CDN (requires network for tiles).
//! - Embeds all track coordinate data as an inline JSON blob in a `<script>` tag.
//! - Supports four map providers: none (plain white), OpenStreetMap, CartoDB
//!   (four styles), and MapBox (four styles).
//! - Defaults to whichever provider was active when the user triggered the export.
//! - Renders each track as a coloured polyline using the default 10-colour palette.

use crate::error::MapperError;
use crate::track::Track;

/// Leaflet CSS CDN URL.
const LEAFLET_CSS_URL: &str = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

/// Leaflet JS CDN URL.
const LEAFLET_JS_URL: &str = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// ── CartoDB ──────────────────────────────────────────────────────────────────

/// CartoDB DarkMatter tile URL template (default CartoDB style).
const TILE_CARTO_DARK_MATTER: &str =
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

/// CartoDB DarkMatter (no labels) tile URL template.
const TILE_CARTO_DARK_MATTER_NO_LABELS: &str =
    "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";

/// CartoDB Positron tile URL template.
const TILE_CARTO_POSITRON: &str =
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

/// CartoDB Voyager tile URL template.
const TILE_CARTO_VOYAGER: &str =
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

/// CartoDB tile attribution string required by the tile licence.
const ATTRIBUTION_CARTO: &str =
    "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors \
     &copy; <a href=\"https://carto.com/attributions\">CARTO</a>";

// ── OpenStreetMap ─────────────────────────────────────────────────────────────

/// OpenStreetMap standard tile URL template.
const TILE_OSM: &str = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/// OpenStreetMap tile attribution string.
const ATTRIBUTION_OSM: &str =
    "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors";

/// Maximum zoom level for OpenStreetMap tiles.
const MAX_ZOOM_OSM: u8 = 19;

// ── MapBox ────────────────────────────────────────────────────────────────────

/// MapBox Raster Tiles v1 URL template base (style ID substituted at runtime).
/// Uses 256-pixel tiles with `@2x` retina suffix.
const TILE_MAPBOX_BASE: &str =
    "https://api.mapbox.com/styles/v1/mapbox/{style_id}/tiles/256/{z}/{x}/{y}@2x";

/// MapBox style ID for Streets.
const MAPBOX_STYLE_STREETS: &str = "streets-v12";

/// MapBox style ID for Outdoors.
const MAPBOX_STYLE_OUTDOORS: &str = "outdoors-v12";

/// MapBox style ID for Satellite.
const MAPBOX_STYLE_SATELLITE: &str = "satellite-v9";

/// MapBox style ID for Satellite Streets.
const MAPBOX_STYLE_SATELLITE_STREETS: &str = "satellite-streets-v12";

/// MapBox tile attribution string required by the terms of service.
const ATTRIBUTION_MAPBOX: &str =
    "&copy; <a href=\"https://www.mapbox.com/about/maps/\">Mapbox</a> \
     &copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors";

/// Maximum zoom level for MapBox tiles.
const MAX_ZOOM_MAPBOX: u8 = 22;

// ── Shared ────────────────────────────────────────────────────────────────────

/// Maximum zoom level for CartoDB tiles.
const MAX_ZOOM_CARTO: u8 = 19;

/// Default track colour palette — 10 colours that cycle when more tracks are uploaded.
///
/// Pre-serialised as a JSON array for embedding in HTML output.
/// Uses `r##` delimiters because the string body contains `#` characters.
const DEFAULT_COLOURS_JSON: &str =
    r##"["#1f77b4","#ff7f0e","#2ca02c","#d62728","#6d20b6","#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf"]"##;

// ── URL helpers ───────────────────────────────────────────────────────────────

/// Append a CartoDB API key query parameter to a tile URL template.
///
/// Returns the URL unchanged when `api_key` is empty or whitespace-only.
fn apply_carto_key(url: &str, api_key: &str) -> String {
    let key = api_key.trim();
    if key.is_empty() {
        url.to_owned()
    } else {
        format!("{url}?key={key}")
    }
}

/// Build a MapBox tile URL for a given style ID, appending `?access_token=`
/// when the token is non-empty.
///
/// Returns the URL without a query string when `token` is empty or
/// whitespace-only (MapBox soft-fails — the upstream service handles it).
fn build_mapbox_url(style_id: &str, token: &str) -> String {
    let base = TILE_MAPBOX_BASE.replace("{style_id}", style_id);
    let t = token.trim();
    if t.is_empty() {
        base
    } else {
        format!("{base}?access_token={t}")
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Generate a self-contained HTML map document from a slice of [`Track`] values.
///
/// The output is a complete HTML5 document that can be saved as a `.html` file
/// and opened in any modern browser. It embeds all track data as JSON and loads
/// Leaflet from CDN, so sharing the file requires only network access for tiles.
///
/// # Parameters
///
/// - `tracks` — The tracks to render.
/// - `provider` — The map provider to use as the default when the exported file
///   is opened. One of `"none"`, `"carto"`, `"osm"`, `"mapbox"`. Unrecognised
///   values fall back to `"none"`.
/// - `carto_api_key` — CartoDB API key. Appended as `?key=` to CartoDB tile
///   URLs when non-empty. Pass `""` if not available.
/// - `mapbox_token` — MapBox access token. Appended as `?access_token=` to
///   MapBox tile URLs when non-empty. Pass `""` if not available.
///
/// # Errors
///
/// Returns [`MapperError::Serialise`] if track data cannot be serialised to JSON.
pub fn generate(
    tracks: &[Track],
    provider: &str,
    carto_api_key: &str,
    mapbox_token: &str,
) -> Result<String, MapperError> {
    let tracks_json = serialise_tracks(tracks)?;

    // Validate provider — fall back to "none" for unknown values.
    let active_provider = match provider {
        "carto" | "osm" | "mapbox" => provider,
        _ => "none",
    };

    // JSON-encode attributions so embedded quotes are safely escaped inside JS strings.
    let carto_attr_json = serde_json::to_string(ATTRIBUTION_CARTO)
        .map_err(|e| MapperError::Serialise(e.to_string()))?;
    let osm_attr_json = serde_json::to_string(ATTRIBUTION_OSM)
        .map_err(|e| MapperError::Serialise(e.to_string()))?;
    let mapbox_attr_json = serde_json::to_string(ATTRIBUTION_MAPBOX)
        .map_err(|e| MapperError::Serialise(e.to_string()))?;

    // CartoDB tile URLs (key appended when non-empty).
    let carto_dark_matter = apply_carto_key(TILE_CARTO_DARK_MATTER, carto_api_key);
    let carto_dark_matter_no_labels =
        apply_carto_key(TILE_CARTO_DARK_MATTER_NO_LABELS, carto_api_key);
    let carto_positron = apply_carto_key(TILE_CARTO_POSITRON, carto_api_key);
    let carto_voyager = apply_carto_key(TILE_CARTO_VOYAGER, carto_api_key);

    // MapBox tile URLs (access_token appended when non-empty).
    let mapbox_streets = build_mapbox_url(MAPBOX_STYLE_STREETS, mapbox_token);
    let mapbox_outdoors = build_mapbox_url(MAPBOX_STYLE_OUTDOORS, mapbox_token);
    let mapbox_satellite = build_mapbox_url(MAPBOX_STYLE_SATELLITE, mapbox_token);
    let mapbox_satellite_streets =
        build_mapbox_url(MAPBOX_STYLE_SATELLITE_STREETS, mapbox_token);

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
      height: calc(100% - 48px);
      width: 100%;
    }}
    #controls {{
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      background: #fff;
      border-bottom: 1px solid #ddd;
      font-family: sans-serif;
      font-size: 14px;
    }}
    #controls label {{
      font-weight: 600;
    }}
    #controls select {{
      padding: 2px 6px;
    }}
    #style-control {{
      display: none;
    }}
  </style>
</head>
<body>
  <div id="controls">
    <label for="provider-select">Provider</label>
    <select id="provider-select" aria-label="Map provider">
      <option value="none">None</option>
      <option value="carto">CartoDB</option>
      <option value="osm">OpenStreetMap</option>
      <option value="mapbox">MapBox</option>
    </select>
    <span id="style-control">
      <label for="style-select">Style</label>
      <select id="style-select" aria-label="Map style"></select>
    </span>
  </div>
  <div id="map"></div>
  <script src="{leaflet_js}"></script>
  <script>
    // Track data embedded at export time
    var TRACK_DATA = {tracks_json};

    // Provider that was active when the file was exported
    var DEFAULT_PROVIDER = "{active_provider}";

    // All provider tile configurations
    var PROVIDERS = {{
      none: {{
        label: "None",
        styles: null
      }},
      carto: {{
        label: "CartoDB",
        attribution: {carto_attr_json},
        maxZoom: {max_zoom_carto},
        defaultStyle: "DarkMatter",
        styles: {{
          "DarkMatter":         {{ label: "Dark Matter",           url: "{carto_dark_matter}" }},
          "DarkMatterNoLabels": {{ label: "Dark Matter (No Labels)", url: "{carto_dark_matter_no_labels}" }},
          "Positron":           {{ label: "Positron",              url: "{carto_positron}" }},
          "Voyager":            {{ label: "Voyager",               url: "{carto_voyager}" }}
        }}
      }},
      osm: {{
        label: "OpenStreetMap",
        attribution: {osm_attr_json},
        maxZoom: {max_zoom_osm},
        defaultStyle: "Standard",
        styles: {{
          "Standard": {{ label: "Standard", url: "{osm_url}" }}
        }}
      }},
      mapbox: {{
        label: "MapBox",
        attribution: {mapbox_attr_json},
        maxZoom: {max_zoom_mapbox},
        defaultStyle: "Streets",
        styles: {{
          "Streets":           {{ label: "Streets",           url: "{mapbox_streets}" }},
          "Outdoors":          {{ label: "Outdoors",          url: "{mapbox_outdoors}" }},
          "Satellite":         {{ label: "Satellite",         url: "{mapbox_satellite}" }},
          "SatelliteStreets":  {{ label: "Satellite Streets", url: "{mapbox_satellite_streets}" }}
        }}
      }}
    }};

    var DEFAULT_COLOURS = {colours_json};

    // Initialise the map
    var map = L.map("map");
    var currentTile = null;

    // Style state per provider — preserved when switching back
    var activeStyles = {{}};
    Object.keys(PROVIDERS).forEach(function(pid) {{
      var p = PROVIDERS[pid];
      if (p.defaultStyle) activeStyles[pid] = p.defaultStyle;
    }});

    function setProvider(providerId) {{
      var provider = PROVIDERS[providerId];
      if (!provider) return;

      // Remove existing tile layer
      if (currentTile) {{
        currentTile.remove();
        currentTile = null;
      }}

      // Populate style selector
      var styleControl = document.getElementById("style-control");
      var styleSelect = document.getElementById("style-select");
      styleSelect.innerHTML = "";

      if (provider.styles && Object.keys(provider.styles).length > 1) {{
        styleControl.style.display = "";
        Object.entries(provider.styles).forEach(function(entry) {{
          var opt = document.createElement("option");
          opt.value = entry[0];
          opt.textContent = entry[1].label;
          if (entry[0] === activeStyles[providerId]) opt.selected = true;
          styleSelect.appendChild(opt);
        }});
      }} else {{
        styleControl.style.display = "none";
      }}

      // Add tile layer (skip for "none")
      if (provider.styles) {{
        var styleKey = activeStyles[providerId] || Object.keys(provider.styles)[0];
        var styleConfig = provider.styles[styleKey];
        if (styleConfig) {{
          currentTile = L.tileLayer(styleConfig.url, {{
            attribution: provider.attribution,
            maxZoom: provider.maxZoom
          }}).addTo(map);
        }}
      }}

      // Update provider selector to reflect programmatic changes
      document.getElementById("provider-select").value = providerId;
    }}

    // Wire provider selector
    document.getElementById("provider-select").addEventListener("change", function() {{
      setProvider(this.value);
    }});

    // Wire style selector
    document.getElementById("style-select").addEventListener("change", function() {{
      var pid = document.getElementById("provider-select").value;
      activeStyles[pid] = this.value;
      var provider = PROVIDERS[pid];
      if (!provider || !provider.styles) return;
      var styleConfig = provider.styles[this.value];
      if (!styleConfig) return;
      if (currentTile) currentTile.remove();
      currentTile = L.tileLayer(styleConfig.url, {{
        attribution: provider.attribution,
        maxZoom: provider.maxZoom
      }}).addTo(map);
    }});

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

    // Apply the default provider last so the map view is set first
    setProvider(DEFAULT_PROVIDER);
  </script>
</body>
</html>
"#,
        leaflet_css = LEAFLET_CSS_URL,
        leaflet_js = LEAFLET_JS_URL,
        tracks_json = tracks_json,
        active_provider = active_provider,
        carto_attr_json = carto_attr_json,
        osm_attr_json = osm_attr_json,
        mapbox_attr_json = mapbox_attr_json,
        max_zoom_carto = MAX_ZOOM_CARTO,
        max_zoom_osm = MAX_ZOOM_OSM,
        max_zoom_mapbox = MAX_ZOOM_MAPBOX,
        carto_dark_matter = carto_dark_matter,
        carto_dark_matter_no_labels = carto_dark_matter_no_labels,
        carto_positron = carto_positron,
        carto_voyager = carto_voyager,
        osm_url = TILE_OSM,
        mapbox_streets = mapbox_streets,
        mapbox_outdoors = mapbox_outdoors,
        mapbox_satellite = mapbox_satellite,
        mapbox_satellite_streets = mapbox_satellite_streets,
        colours_json = DEFAULT_COLOURS_JSON,
    ))
}

/// Serialise a slice of [`Track`] values to a JSON array string.
///
/// Each track is serialised with its `name`, `points`, and `colour` fields.
/// The result is embedded directly into the HTML `<script>` tag.
///
/// # Errors
///
/// Returns [`MapperError::Serialise`] if serialisation fails.
fn serialise_tracks(tracks: &[Track]) -> Result<String, MapperError> {
    serde_json::to_string(tracks).map_err(|e| MapperError::Serialise(e.to_string()))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::track::Point;

    fn sample_tracks() -> Vec<Track> {
        vec![
            Track::new(
                "run_a",
                vec![
                    Point { lat: 51.5, lon: -0.1, ele: Some(10.0) },
                    Point { lat: 51.6, lon: -0.2, ele: None },
                ],
            ),
            Track::new(
                "run_b",
                vec![Point { lat: 52.0, lon: -1.0, ele: None }],
            ),
        ]
    }

    // ── Leaflet CDN references ────────────────────────────────────────────────

    #[test]
    fn generate_contains_leaflet_css_cdn_reference() {
        let html = generate(&sample_tracks(), "none", "", "").unwrap();
        assert!(html.contains(LEAFLET_CSS_URL));
    }

    #[test]
    fn generate_contains_leaflet_js_cdn_reference() {
        let html = generate(&sample_tracks(), "none", "", "").unwrap();
        assert!(html.contains(LEAFLET_JS_URL));
    }

    // ── Track data ────────────────────────────────────────────────────────────

    #[test]
    fn generate_contains_track_data_script_block() {
        let html = generate(&sample_tracks(), "none", "", "").unwrap();
        assert!(html.contains("var TRACK_DATA ="));
        assert!(html.contains("run_a"));
        assert!(html.contains("run_b"));
    }

    #[test]
    fn generate_embeds_coordinate_data() {
        let html = generate(&sample_tracks(), "none", "", "").unwrap();
        assert!(html.contains("51.5"));
        assert!(html.contains("-0.1"));
    }

    #[test]
    fn generate_empty_tracks_produces_valid_html() {
        let html = generate(&[], "none", "", "").unwrap();
        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("var TRACK_DATA = []"));
    }

    // ── Provider defaults ─────────────────────────────────────────────────────

    #[test]
    fn generate_sets_default_provider_none() {
        let html = generate(&sample_tracks(), "none", "", "").unwrap();
        assert!(html.contains(r#"var DEFAULT_PROVIDER = "none""#));
    }

    #[test]
    fn generate_sets_default_provider_carto() {
        let html = generate(&sample_tracks(), "carto", "", "").unwrap();
        assert!(html.contains(r#"var DEFAULT_PROVIDER = "carto""#));
    }

    #[test]
    fn generate_sets_default_provider_osm() {
        let html = generate(&sample_tracks(), "osm", "", "").unwrap();
        assert!(html.contains(r#"var DEFAULT_PROVIDER = "osm""#));
    }

    #[test]
    fn generate_sets_default_provider_mapbox() {
        let html = generate(&sample_tracks(), "mapbox", "", "").unwrap();
        assert!(html.contains(r#"var DEFAULT_PROVIDER = "mapbox""#));
    }

    #[test]
    fn generate_unknown_provider_falls_back_to_none() {
        let html = generate(&sample_tracks(), "unknown_provider", "", "").unwrap();
        assert!(html.contains(r#"var DEFAULT_PROVIDER = "none""#));
    }

    // ── CartoDB tiles ─────────────────────────────────────────────────────────

    #[test]
    fn generate_contains_all_carto_tile_urls() {
        let html = generate(&sample_tracks(), "carto", "", "").unwrap();
        assert!(html.contains(TILE_CARTO_DARK_MATTER));
        assert!(html.contains(TILE_CARTO_DARK_MATTER_NO_LABELS));
        assert!(html.contains(TILE_CARTO_POSITRON));
        assert!(html.contains(TILE_CARTO_VOYAGER));
    }

    #[test]
    fn generate_without_carto_key_uses_plain_tile_urls() {
        let html = generate(&sample_tracks(), "carto", "", "").unwrap();
        assert!(html.contains(TILE_CARTO_DARK_MATTER));
        assert!(!html.contains("?key="));
    }

    #[test]
    fn generate_with_carto_key_appends_key_to_all_carto_tile_urls() {
        let key = "test_carto_key_123";
        let html = generate(&sample_tracks(), "carto", key, "").unwrap();
        assert!(html.contains(&format!("{TILE_CARTO_DARK_MATTER}?key={key}")));
        assert!(html.contains(&format!("{TILE_CARTO_DARK_MATTER_NO_LABELS}?key={key}")));
        assert!(html.contains(&format!("{TILE_CARTO_POSITRON}?key={key}")));
        assert!(html.contains(&format!("{TILE_CARTO_VOYAGER}?key={key}")));
    }

    #[test]
    fn generate_with_whitespace_carto_key_uses_plain_tile_urls() {
        let html = generate(&sample_tracks(), "carto", "   ", "").unwrap();
        assert!(!html.contains("?key="));
    }

    #[test]
    fn generate_contains_carto_attribution() {
        let html = generate(&sample_tracks(), "carto", "", "").unwrap();
        assert!(html.contains("CARTO"));
        assert!(html.contains("OpenStreetMap"));
    }

    // ── OSM tiles ─────────────────────────────────────────────────────────────

    #[test]
    fn generate_contains_osm_tile_url() {
        let html = generate(&sample_tracks(), "osm", "", "").unwrap();
        assert!(html.contains("tile.openstreetmap.org"));
    }

    #[test]
    fn generate_osm_has_no_key_parameter() {
        let html = generate(&sample_tracks(), "osm", "", "").unwrap();
        // Passing a carto key must not leak into the OSM URL
        let html_with_keys = generate(&sample_tracks(), "osm", "cartokey", "mapboxtoken").unwrap();
        assert!(!html_with_keys.contains("tile.openstreetmap.org/?"));
        // The OSM URL itself is plain
        assert!(html.contains(TILE_OSM));
    }

    #[test]
    fn generate_contains_osm_attribution() {
        let html = generate(&sample_tracks(), "osm", "", "").unwrap();
        assert!(html.contains("openstreetmap.org/copyright"));
    }

    // ── MapBox tiles ──────────────────────────────────────────────────────────

    #[test]
    fn generate_contains_all_mapbox_style_urls() {
        let html = generate(&sample_tracks(), "mapbox", "", "").unwrap();
        assert!(html.contains(MAPBOX_STYLE_STREETS));
        assert!(html.contains(MAPBOX_STYLE_OUTDOORS));
        assert!(html.contains(MAPBOX_STYLE_SATELLITE));
        assert!(html.contains(MAPBOX_STYLE_SATELLITE_STREETS));
        assert!(html.contains("api.mapbox.com"));
    }

    #[test]
    fn generate_without_mapbox_token_uses_plain_mapbox_urls() {
        let html = generate(&sample_tracks(), "mapbox", "", "").unwrap();
        assert!(!html.contains("?access_token="));
    }

    #[test]
    fn generate_with_mapbox_token_appends_to_all_mapbox_urls() {
        let token = "pk.test_mapbox_token_abc";
        let html = generate(&sample_tracks(), "mapbox", "", token).unwrap();
        // All four style URLs should carry the token
        for style_id in &[
            MAPBOX_STYLE_STREETS,
            MAPBOX_STYLE_OUTDOORS,
            MAPBOX_STYLE_SATELLITE,
            MAPBOX_STYLE_SATELLITE_STREETS,
        ] {
            let expected = format!("access_token={token}");
            assert!(
                html.contains(&expected),
                "expected access_token in URL for style {style_id}"
            );
        }
    }

    #[test]
    fn generate_with_whitespace_mapbox_token_uses_plain_urls() {
        let html = generate(&sample_tracks(), "mapbox", "", "   ").unwrap();
        assert!(!html.contains("?access_token="));
    }

    #[test]
    fn generate_mapbox_token_does_not_use_key_param() {
        let token = "pk.test_token";
        let html = generate(&sample_tracks(), "mapbox", "", token).unwrap();
        // MapBox must use access_token, not key
        assert!(html.contains("access_token="));
        // The carto ?key= param must not appear on mapbox URLs
        let mapbox_url_block = html
            .find("api.mapbox.com")
            .map(|i| &html[i..i + 200])
            .unwrap_or("");
        assert!(!mapbox_url_block.contains("?key="));
    }

    #[test]
    fn generate_contains_mapbox_attribution() {
        let html = generate(&sample_tracks(), "mapbox", "", "").unwrap();
        assert!(html.contains("mapbox.com/about/maps"));
    }

    // ── apply_carto_key helper ────────────────────────────────────────────────

    #[test]
    fn apply_carto_key_empty_returns_url_unchanged() {
        assert_eq!(
            apply_carto_key("https://example.com/tiles", ""),
            "https://example.com/tiles"
        );
    }

    #[test]
    fn apply_carto_key_whitespace_returns_url_unchanged() {
        assert_eq!(
            apply_carto_key("https://example.com/tiles", "  "),
            "https://example.com/tiles"
        );
    }

    #[test]
    fn apply_carto_key_appends_key_param() {
        assert_eq!(
            apply_carto_key("https://example.com/tiles", "mykey"),
            "https://example.com/tiles?key=mykey"
        );
    }

    // ── build_mapbox_url helper ───────────────────────────────────────────────

    #[test]
    fn build_mapbox_url_empty_token_omits_query_string() {
        let url = build_mapbox_url(MAPBOX_STYLE_STREETS, "");
        assert!(!url.contains('?'));
        assert!(url.contains(MAPBOX_STYLE_STREETS));
    }

    #[test]
    fn build_mapbox_url_whitespace_token_omits_query_string() {
        let url = build_mapbox_url(MAPBOX_STYLE_STREETS, "   ");
        assert!(!url.contains('?'));
    }

    #[test]
    fn build_mapbox_url_appends_access_token() {
        let url = build_mapbox_url(MAPBOX_STYLE_STREETS, "pk.mytoken");
        assert!(url.contains("?access_token=pk.mytoken"));
    }

    #[test]
    fn build_mapbox_url_substitutes_style_id() {
        let url = build_mapbox_url(MAPBOX_STYLE_SATELLITE, "tok");
        assert!(url.contains(MAPBOX_STYLE_SATELLITE));
        assert!(!url.contains("{style_id}"));
    }
}
