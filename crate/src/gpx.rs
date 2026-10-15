//! GPX file parser and combined-GPX generator.
//!
//! Parses GPX 1.0 and GPX 1.1 files from raw bytes into [`Track`] values,
//! and generates a GPX 1.1 document containing one `<trk>` per [`Track`].

use quick_xml::events::Event;
use quick_xml::Reader;

use crate::error::MapperError;
use crate::track::{Point, Track};

/// GPX 1.1 namespace URI, required in the root `<gpx>` element.
const GPX_NAMESPACE: &str = "http://www.topografix.com/GPX/1/1";

/// Parse raw GPX bytes into a [`Track`].
///
/// Accepts both GPX 1.0 (no namespace) and GPX 1.1 (with namespace).
/// The track name is set to the stem of `filename` (everything before the
/// first `.`).
///
/// # Errors
///
/// Returns [`MapperError::GpxParse`] if the bytes are not valid XML or do not
/// contain any `<trkpt>` elements with valid lat/lon attributes.
/// Returns [`MapperError::NoTrackPoints`] if parsing succeeds but no valid
/// points were found.
pub fn parse(bytes: &[u8], filename: &str) -> Result<Track, MapperError> {
    let name = stem(filename);
    let points = parse_trkpts(bytes)?;

    if points.is_empty() {
        return Err(MapperError::NoTrackPoints {
            filename: filename.to_owned(),
        });
    }

    Ok(Track::new(name, points))
}

/// Generate a GPX 1.1 document with one `<trk>` per [`Track`].
///
/// Each track becomes a `<trk>` element containing a `<name>` and a single
/// `<trkseg>` with one `<trkpt>` per [`Point`]. Points with elevation data
/// include an `<ele>` child element.
///
/// # Errors
///
/// Returns [`MapperError::Serialise`] if the XML cannot be written.
pub fn generate_combined(tracks: &[Track]) -> Result<String, MapperError> {
    let mut out = String::new();

    out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    out.push_str(&format!(
        "<gpx version=\"1.1\" creator=\"GPX Mapper\" xmlns=\"{GPX_NAMESPACE}\">\n"
    ));

    for track in tracks {
        out.push_str("  <trk>\n");
        out.push_str(&format!("    <name>{}</name>\n", escape_xml(&track.name)));
        out.push_str("    <trkseg>\n");
        for point in &track.points {
            match point.ele {
                Some(ele) => {
                    out.push_str(&format!(
                        "      <trkpt lat=\"{}\" lon=\"{}\">\n        <ele>{}</ele>\n      </trkpt>\n",
                        point.lat, point.lon, ele
                    ));
                }
                None => {
                    out.push_str(&format!(
                        "      <trkpt lat=\"{}\" lon=\"{}\"/>\n",
                        point.lat, point.lon
                    ));
                }
            }
        }
        out.push_str("    </trkseg>\n");
        out.push_str("  </trk>\n");
    }

    out.push_str("</gpx>\n");
    Ok(out)
}

/// Parse `<trkpt>` elements from raw GPX bytes into a list of [`Point`] values.
///
/// Skips any track point that is missing or has invalid `lat`/`lon` attributes.
fn parse_trkpts(bytes: &[u8]) -> Result<Vec<Point>, MapperError> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);

    let mut points: Vec<Point> = Vec::new();
    let mut current_point: Option<Point> = None;
    let mut in_ele = false;

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                // Bind the name to a local so the temporary lives for the whole arm.
                let name_bytes = e.name();
                let local_name = local_name(name_bytes.as_ref());

                if local_name == b"trkpt" {
                    let lat = attr_f64(e, b"lat");
                    let lon = attr_f64(e, b"lon");
                    if let (Some(lat), Some(lon)) = (lat, lon) {
                        current_point = Some(Point {
                            lat,
                            lon,
                            ele: None,
                        });
                    }
                } else if local_name == b"ele" {
                    in_ele = true;
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_ele {
                    if let Some(ref mut p) = current_point {
                        if let Ok(text) = e.unescape() {
                            p.ele = text.trim().parse::<f64>().ok();
                        }
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                // Bind the name to a local so the temporary lives for the whole arm.
                let name_bytes = e.name();
                let local_name = local_name(name_bytes.as_ref());
                if local_name == b"trkpt" {
                    if let Some(point) = current_point.take() {
                        points.push(point);
                    }
                } else if local_name == b"ele" {
                    in_ele = false;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(MapperError::GpxParse(e.to_string()));
            }
            _ => {}
        }
        buf.clear();
    }

    Ok(points)
}

/// Extract the local (non-namespaced) portion of an XML element name.
///
/// Given `{http://www.topografix.com/GPX/1/1}trkpt`, returns `trkpt`.
/// Given `trkpt`, returns `trkpt` unchanged.
fn local_name(name: &[u8]) -> &[u8] {
    if let Some(pos) = name.iter().rposition(|&b| b == b'}') {
        &name[pos + 1..]
    } else {
        name
    }
}

/// Read a named attribute from a quick-xml element and parse it as `f64`.
///
/// Returns `None` if the attribute is absent or its value is not a valid float.
fn attr_f64(e: &quick_xml::events::BytesStart<'_>, name: &[u8]) -> Option<f64> {
    e.attributes()
        .filter_map(|a| a.ok())
        .find(|a| a.key.as_ref() == name)
        .and_then(|a| {
            std::str::from_utf8(&a.value)
                .ok()
                .and_then(|s| s.parse::<f64>().ok())
        })
}

/// Escape special XML characters in a text node value.
fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Return the filename stem: everything before the first `.`.
///
/// `split().next()` on a non-empty string always returns `Some`, so the
/// `unwrap_or` fallback is only reached on an empty filename.
fn stem(filename: &str) -> String {
    filename.split('.').next().unwrap_or(filename).to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIMPLE_GPX: &[u8] = br#"<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="51.5" lon="-0.1"><ele>10.0</ele></trkpt>
      <trkpt lat="51.6" lon="-0.2"/>
    </trkseg>
  </trk>
</gpx>"#;

    const NO_POINTS_GPX: &[u8] = br#"<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <trk><trkseg></trkseg></trk>
</gpx>"#;

    const MALFORMED_GPX: &[u8] = b"not xml at all <<<";

    #[test]
    fn parse_valid_gpx_returns_two_points() {
        let track = parse(SIMPLE_GPX, "my_run.gpx").unwrap();
        assert_eq!(track.name, "my_run");
        assert_eq!(track.points.len(), 2);
        assert_eq!(track.points[0].lat, 51.5);
        assert_eq!(track.points[0].lon, -0.1);
        assert_eq!(track.points[0].ele, Some(10.0));
        assert_eq!(track.points[1].ele, None);
    }

    #[test]
    fn parse_zero_coordinate_is_valid() {
        let gpx = br#"<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
  <trkpt lat="0.0" lon="0.0"/>
</trkseg></trk></gpx>"#;
        let track = parse(gpx, "zero.gpx").unwrap();
        assert_eq!(track.points.len(), 1);
        assert_eq!(track.points[0].lat, 0.0);
        assert_eq!(track.points[0].lon, 0.0);
    }

    #[test]
    fn parse_empty_gpx_returns_no_track_points_error() {
        let err = parse(NO_POINTS_GPX, "empty.gpx").unwrap_err();
        assert!(matches!(err, MapperError::NoTrackPoints { .. }));
    }

    #[test]
    fn parse_malformed_gpx_returns_parse_error() {
        let err = parse(MALFORMED_GPX, "bad.gpx").unwrap_err();
        assert!(matches!(err, MapperError::GpxParse(_)));
    }

    #[test]
    fn generate_combined_produces_valid_gpx_structure() {
        let tracks = vec![
            Track::new(
                "run_a",
                vec![Point {
                    lat: 51.5,
                    lon: -0.1,
                    ele: Some(5.0),
                }],
            ),
            Track::new(
                "run_b",
                vec![Point {
                    lat: 52.0,
                    lon: -1.0,
                    ele: None,
                }],
            ),
        ];
        let gpx = generate_combined(&tracks).unwrap();
        assert!(gpx.contains("xmlns=\"http://www.topografix.com/GPX/1/1\""));
        assert!(gpx.contains("<name>run_a</name>"));
        assert!(gpx.contains("<name>run_b</name>"));
        assert_eq!(gpx.matches("<trk>").count(), 2);
        assert!(gpx.contains("<ele>5</ele>") || gpx.contains("<ele>5.0</ele>"));
        // run_b point has no elevation — should not contain <ele> in its trkpt
        assert!(
            gpx.contains("<trkpt lat=\"52\" lon=\"-1\"/>")
                || gpx.contains("<trkpt lat=\"52.0\" lon=\"-1.0\"/>")
        );
    }

    #[test]
    fn generate_combined_escapes_xml_in_name() {
        let tracks = vec![Track::new(
            "a & b < c",
            vec![Point {
                lat: 1.0,
                lon: 1.0,
                ele: None,
            }],
        )];
        let gpx = generate_combined(&tracks).unwrap();
        assert!(gpx.contains("<name>a &amp; b &lt; c</name>"));
    }

    #[test]
    fn stem_strips_extension() {
        assert_eq!(stem("my_run.gpx"), "my_run");
        assert_eq!(stem("activity.fit.gz"), "activity");
        assert_eq!(stem("noext"), "noext");
    }
}
