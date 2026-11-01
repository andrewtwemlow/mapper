//! KML file parser.
//!
//! Parses KML (Keyhole Markup Language) files (`.kml` plain or `.kml.gz`
//! gzip-compressed) from raw bytes into a [`Track`].
//!
//! KML coordinate data is stored in `<LineString><coordinates>` elements as
//! space-separated tuples in `longitude,latitude[,altitude]` order. All
//! `<LineString>` elements in the file are combined into a single [`Track`].
//!
//! Handles OGC KML 2.2 (`http://www.opengis.net/kml/2.2`), the legacy Google
//! namespace (`http://earth.google.com/kml/2.2`), and namespace-free KML.

use std::io::Read;

use flate2::read::GzDecoder;
use quick_xml::events::Event;
use quick_xml::Reader;

use crate::error::MapperError;
use crate::track::{Point, Track};

/// Gzip magic number — first two bytes of any gzip stream.
const GZIP_MAGIC: [u8; 2] = [0x1f, 0x8b];

/// XML element name for a KML `<LineString>` geometry.
const ELEM_LINE_STRING: &str = "LineString";

/// XML element name for the coordinate sequence inside a `<LineString>`.
const ELEM_COORDINATES: &str = "coordinates";

/// Maximum valid latitude in decimal degrees.
const LAT_MAX: f64 = 90.0;

/// Maximum valid longitude in decimal degrees.
const LON_MAX: f64 = 180.0;

/// Parse raw KML bytes (plain or gzip-compressed) into a [`Track`].
///
/// Detects gzip compression by checking for the two-byte magic number at the
/// start of `bytes`. If present, decompresses before parsing.
///
/// All `<LineString>` coordinate sequences in the file are combined into a
/// single track. The track name is set to the stem of `filename` (everything
/// before the first `.`).
///
/// # Errors
///
/// Returns [`MapperError::Decompress`] if gzip decompression fails.
/// Returns [`MapperError::KmlParse`] if the bytes are not valid XML.
/// Returns [`MapperError::NoTrackPoints`] if parsing succeeds but no valid
/// GPS points were found.
pub fn parse(bytes: &[u8], filename: &str) -> Result<Track, MapperError> {
    let name = stem(filename);
    let data = decompress_if_gzipped(bytes)?;
    let points = parse_line_strings(&data)?;

    if points.is_empty() {
        return Err(MapperError::NoTrackPoints {
            filename: filename.to_owned(),
        });
    }

    Ok(Track::new(name, points))
}

/// Decompress `bytes` if they begin with the gzip magic number; otherwise
/// return a copy of the input unchanged.
///
/// # Errors
///
/// Returns [`MapperError::Decompress`] if gzip decompression fails.
fn decompress_if_gzipped(bytes: &[u8]) -> Result<Vec<u8>, MapperError> {
    if bytes.len() >= 2 && bytes[..2] == GZIP_MAGIC {
        let mut decoder = GzDecoder::new(bytes);
        let mut decompressed = Vec::new();
        decoder
            .read_to_end(&mut decompressed)
            .map_err(|e| MapperError::Decompress(e.to_string()))?;
        Ok(decompressed)
    } else {
        Ok(bytes.to_vec())
    }
}

/// Parse all `<LineString><coordinates>` blocks from raw KML bytes.
///
/// State machine:
/// - On `<LineString>`: set `in_line_string = true`.
/// - On `<coordinates>` inside a `<LineString>`: set `reading_coords = true`.
/// - On `Text` while `reading_coords`: parse coordinate tuples and append to
///   the point list.
/// - On `</coordinates>`: set `reading_coords = false`.
/// - On `</LineString>`: set `in_line_string = false`.
///
/// Coordinate tuples are `lon,lat[,alt]` separated by whitespace. Tuples with
/// out-of-range or unparseable lat/lon values are silently skipped.
///
/// # Errors
///
/// Returns [`MapperError::KmlParse`] if the bytes are not valid XML.
fn parse_line_strings(bytes: &[u8]) -> Result<Vec<Point>, MapperError> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);

    let mut points: Vec<Point> = Vec::new();
    let mut in_line_string = false;
    let mut reading_coords = false;

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name_bytes = e.name();
                let name = local_name(name_bytes.as_ref());
                match name {
                    n if n == ELEM_LINE_STRING => {
                        in_line_string = true;
                    }
                    n if n == ELEM_COORDINATES && in_line_string => {
                        reading_coords = true;
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                if reading_coords {
                    if let Ok(text) = quick_xml::escape::unescape(e.as_ref()) {
                        append_coordinate_points(text.trim(), &mut points);
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let name_bytes = e.name();
                let name = local_name(name_bytes.as_ref());
                match name {
                    n if n == ELEM_COORDINATES => {
                        reading_coords = false;
                    }
                    n if n == ELEM_LINE_STRING => {
                        in_line_string = false;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(MapperError::KmlParse(e.to_string())),
            _ => {}
        }
        buf.clear();
    }

    Ok(points)
}

/// Parse a whitespace-separated block of `lon,lat[,alt]` tuples and append
/// valid [`Point`] values to `points`.
///
/// Tuples are separated by ASCII whitespace (spaces, tabs, newlines). Each
/// tuple has comma-separated fields. The altitude field is optional; when
/// absent or unparseable, elevation is stored as `None`.
///
/// Tuples with out-of-range latitude (outside ±90°) or longitude (outside
/// ±180°) are silently skipped. Tuples at exactly 0°, 0° are valid.
fn append_coordinate_points(text: &str, points: &mut Vec<Point>) {
    for tuple in text.split_ascii_whitespace() {
        let mut parts = tuple.splitn(3, ',');
        let lon_str = parts.next().unwrap_or("");
        let lat_str = parts.next().unwrap_or("");
        let ele_str = parts.next();

        let lon = match lon_str.trim().parse::<f64>() {
            Ok(v) => v,
            Err(_) => continue,
        };
        let lat = match lat_str.trim().parse::<f64>() {
            Ok(v) => v,
            Err(_) => continue,
        };

        if lat.abs() > LAT_MAX || lon.abs() > LON_MAX {
            continue;
        }

        let ele = ele_str.and_then(|s| s.trim().parse::<f64>().ok());

        points.push(Point { lat, lon, ele });
    }
}

/// Extract the local (non-namespaced) portion of an XML element name.
///
/// Given `{http://www.opengis.net/kml/2.2}LineString`, returns `LineString`.
/// Given `kml:LineString`, returns `LineString`.
/// Given `LineString`, returns `LineString` unchanged.
fn local_name(name: &str) -> &str {
    if let Some(pos) = name.rfind('}') {
        &name[pos + 1..]
    } else if let Some(pos) = name.rfind(':') {
        &name[pos + 1..]
    } else {
        name
    }
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

    /// A minimal KML with a single `<LineString>` containing two points.
    const SIMPLE_KML: &[u8] = br#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <LineString>
        <coordinates>
          -0.1,51.5,10.0 -0.2,51.6,20.0
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>"#;

    /// KML with two `<Placemark>` elements, each with a `<LineString>`.
    const TWO_PLACEMARKS_KML: &[u8] = br#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <LineString>
        <coordinates>-0.1,51.5,10.0 -0.2,51.6,20.0</coordinates>
      </LineString>
    </Placemark>
    <Placemark>
      <LineString>
        <coordinates>-0.3,51.7,30.0 -0.4,51.8,40.0</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>"#;

    /// KML with no altitude values in coordinates.
    const NO_ALTITUDE_KML: &[u8] = br#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <LineString>
        <coordinates>-0.1,51.5 -0.2,51.6</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>"#;

    /// KML with no `<LineString>` elements at all.
    const NO_LINE_STRINGS_KML: &[u8] = br#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark><name>Just a point</name></Placemark>
  </Document>
</kml>"#;

    /// KML with one valid point and one with out-of-range coordinates.
    const OUT_OF_RANGE_KML: &[u8] = br#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <LineString>
        <coordinates>-0.1,51.5,10.0 -200.0,91.0,0.0 -0.2,51.6,20.0</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>"#;

    /// KML without any XML namespace declaration.
    const NO_NAMESPACE_KML: &[u8] = br#"<?xml version="1.0" encoding="UTF-8"?>
<kml>
  <Document>
    <Placemark>
      <LineString>
        <coordinates>-0.1,51.5,10.0 -0.2,51.6,20.0</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>"#;

    const MALFORMED_KML: &[u8] = b"not xml at all <<<";

    // -------------------------------------------------------------------------
    // Basic parsing
    // -------------------------------------------------------------------------

    #[test]
    fn parse_valid_kml_returns_two_points() {
        let track = parse(SIMPLE_KML, "route.kml").unwrap();
        assert_eq!(track.name, "route");
        assert_eq!(track.points.len(), 2);
        assert_eq!(track.points[0].lat, 51.5);
        assert_eq!(track.points[0].lon, -0.1);
        assert_eq!(track.points[0].ele, Some(10.0));
        assert_eq!(track.points[1].lat, 51.6);
        assert_eq!(track.points[1].lon, -0.2);
        assert_eq!(track.points[1].ele, Some(20.0));
    }

    #[test]
    fn parse_two_placemarks_combines_all_points() {
        let track = parse(TWO_PLACEMARKS_KML, "multi.kml").unwrap();
        assert_eq!(track.points.len(), 4);
    }

    // -------------------------------------------------------------------------
    // Elevation handling
    // -------------------------------------------------------------------------

    #[test]
    fn parse_kml_with_altitude_stores_elevation() {
        let track = parse(SIMPLE_KML, "route.kml").unwrap();
        assert_eq!(track.points[0].ele, Some(10.0));
        assert_eq!(track.points[1].ele, Some(20.0));
    }

    #[test]
    fn parse_kml_without_altitude_leaves_elevation_none() {
        let track = parse(NO_ALTITUDE_KML, "route.kml").unwrap();
        assert_eq!(track.points.len(), 2);
        assert_eq!(track.points[0].ele, None);
        assert_eq!(track.points[1].ele, None);
    }

    // -------------------------------------------------------------------------
    // Coordinate validation
    // -------------------------------------------------------------------------

    #[test]
    fn parse_zero_coordinate_is_valid() {
        let kml = br#"<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document><Placemark><LineString>
    <coordinates>0.0,0.0,0.0</coordinates>
  </LineString></Placemark></Document>
</kml>"#;
        let track = parse(kml, "zero.kml").unwrap();
        assert_eq!(track.points.len(), 1);
        assert_eq!(track.points[0].lat, 0.0);
        assert_eq!(track.points[0].lon, 0.0);
    }

    #[test]
    fn parse_out_of_range_coordinates_are_skipped() {
        // Three tuples; middle one has lat=91 and lon=-200 — both out of range.
        let track = parse(OUT_OF_RANGE_KML, "range.kml").unwrap();
        assert_eq!(track.points.len(), 2);
        assert_eq!(track.points[0].lat, 51.5);
        assert_eq!(track.points[1].lat, 51.6);
    }

    // -------------------------------------------------------------------------
    // Error cases
    // -------------------------------------------------------------------------

    #[test]
    fn parse_no_line_strings_returns_no_track_points_error() {
        let err = parse(NO_LINE_STRINGS_KML, "empty.kml").unwrap_err();
        assert!(matches!(err, MapperError::NoTrackPoints { .. }));
    }

    #[test]
    fn parse_malformed_kml_returns_parse_error() {
        let err = parse(MALFORMED_KML, "bad.kml").unwrap_err();
        assert!(matches!(err, MapperError::KmlParse(_)));
    }

    // -------------------------------------------------------------------------
    // Namespace variants
    // -------------------------------------------------------------------------

    #[test]
    fn parse_namespace_free_kml_succeeds() {
        let track = parse(NO_NAMESPACE_KML, "nons.kml").unwrap();
        assert_eq!(track.points.len(), 2);
    }

    #[test]
    fn parse_legacy_google_namespace_kml_succeeds() {
        let kml = br#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://earth.google.com/kml/2.2">
  <Document>
    <Placemark>
      <LineString>
        <coordinates>-0.1,51.5,10.0 -0.2,51.6,20.0</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>"#;
        let track = parse(kml, "google.kml").unwrap();
        assert_eq!(track.points.len(), 2);
    }

    // -------------------------------------------------------------------------
    // Gzip decompression
    // -------------------------------------------------------------------------

    #[test]
    fn parse_gzipped_kml_succeeds() {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use std::io::Write;

        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(SIMPLE_KML).unwrap();
        let compressed = encoder.finish().unwrap();

        let track = parse(&compressed, "route.kml.gz").unwrap();
        assert_eq!(track.name, "route");
        assert_eq!(track.points.len(), 2);
    }

    // -------------------------------------------------------------------------
    // Filename stem
    // -------------------------------------------------------------------------

    #[test]
    fn stem_strips_extension() {
        assert_eq!(stem("route.kml"), "route");
        assert_eq!(stem("my-track.kml.gz"), "my-track");
        assert_eq!(stem("noext"), "noext");
    }

    // -------------------------------------------------------------------------
    // Integration test against real test-data file
    // -------------------------------------------------------------------------

    /// Integration test using the real sample KML file from test-data/.
    #[test]
    fn parse_real_kml_file() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../test-data/bd29c115c93aaad665e3cc1435391eaf.kml");

        if !path.exists() {
            eprintln!("Skipping: test-data file not present");
            return;
        }

        let bytes = std::fs::read(&path).unwrap();
        let track = parse(&bytes, "bd29c115c93aaad665e3cc1435391eaf.kml").unwrap();
        assert!(
            !track.points.is_empty(),
            "expected at least one GPS point from real KML file"
        );
        assert_eq!(track.name, "bd29c115c93aaad665e3cc1435391eaf");
    }
}
