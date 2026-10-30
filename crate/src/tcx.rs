//! TCX file parser.
//!
//! Parses Garmin Training Center XML files (`.tcx` plain or `.tcx.gz`
//! gzip-compressed) from raw bytes into a [`Track`].
//!
//! TCX uses the namespace `http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2`.
//! Position elements contain `<LatitudeDegrees>` and `<LongitudeDegrees>` children.

use std::io::Read;

use flate2::read::GzDecoder;
use quick_xml::events::Event;
use quick_xml::Reader;

use crate::error::MapperError;
use crate::track::{Point, Track};

/// Gzip magic number — first two bytes of any gzip stream.
const GZIP_MAGIC: [u8; 2] = [0x1f, 0x8b];

/// XML element name for a TCX trackpoint.
const ELEM_TRACKPOINT: &str = "Trackpoint";

/// XML element name for a TCX position container.
const ELEM_POSITION: &str = "Position";

/// XML element name for latitude degrees inside a position.
const ELEM_LATITUDE: &str = "LatitudeDegrees";

/// XML element name for longitude degrees inside a position.
const ELEM_LONGITUDE: &str = "LongitudeDegrees";

/// XML element name for altitude in metres.
const ELEM_ALTITUDE: &str = "AltitudeMeters";

/// Parse raw TCX bytes (plain or gzip-compressed) into a [`Track`].
///
/// Detects gzip compression by checking for the two-byte magic number at the
/// start of `bytes`. If present, decompresses before parsing.
///
/// The track name is set to the stem of `filename` (everything before the
/// first `.`).
///
/// # Errors
///
/// Returns [`MapperError::Decompress`] if gzip decompression fails.
/// Returns [`MapperError::TcxParse`] if the bytes are not valid XML.
/// Returns [`MapperError::NoTrackPoints`] if parsing succeeds but no valid
/// GPS points were found.
pub fn parse(bytes: &[u8], filename: &str) -> Result<Track, MapperError> {
    let name = stem(filename);
    let data = decompress_if_gzipped(bytes)?;
    let points = parse_trackpoints(&data)?;

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

/// Parse `<Trackpoint>` elements from raw TCX bytes.
///
/// State machine:
/// - Inside a `<Trackpoint>`: accumulate lat, lon, ele as text values are read.
/// - On `</Trackpoint>`: emit a [`Point`] if both lat and lon were found.
/// - Skips trackpoints that have no `<Position>` element.
///
/// Namespace prefixes are stripped via [`local_name`] so both prefixed and
/// unprefixed elements are handled uniformly.
///
/// # Errors
///
/// Returns [`MapperError::TcxParse`] if the bytes are not valid XML.
fn parse_trackpoints(bytes: &[u8]) -> Result<Vec<Point>, MapperError> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);

    let mut points = Vec::new();

    // Per-trackpoint state
    let mut in_trackpoint = false;
    let mut in_position = false;
    let mut reading_lat = false;
    let mut reading_lon = false;
    let mut reading_ele = false;
    let mut current_lat: Option<f64> = None;
    let mut current_lon: Option<f64> = None;
    let mut current_ele: Option<f64> = None;

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = e.name();
                let name = local_name(name.as_ref());
                match name {
                    n if n == ELEM_TRACKPOINT => {
                        in_trackpoint = true;
                        current_lat = None;
                        current_lon = None;
                        current_ele = None;
                    }
                    n if n == ELEM_POSITION && in_trackpoint => {
                        in_position = true;
                    }
                    n if n == ELEM_LATITUDE && in_position => {
                        reading_lat = true;
                    }
                    n if n == ELEM_LONGITUDE && in_position => {
                        reading_lon = true;
                    }
                    n if n == ELEM_ALTITUDE && in_trackpoint => {
                        reading_ele = true;
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                if let Ok(text) = quick_xml::escape::unescape(e.as_ref()) {
                    let trimmed = text.trim();
                    if reading_lat {
                        current_lat = trimmed.parse::<f64>().ok();
                    } else if reading_lon {
                        current_lon = trimmed.parse::<f64>().ok();
                    } else if reading_ele {
                        current_ele = trimmed.parse::<f64>().ok();
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let name = e.name();
                let name = local_name(name.as_ref());
                match name {
                    n if n == ELEM_TRACKPOINT => {
                        if let (Some(lat), Some(lon)) = (current_lat, current_lon) {
                            points.push(Point {
                                lat,
                                lon,
                                ele: current_ele,
                            });
                        }
                        in_trackpoint = false;
                        in_position = false;
                        reading_lat = false;
                        reading_lon = false;
                        reading_ele = false;
                    }
                    n if n == ELEM_POSITION => {
                        in_position = false;
                    }
                    n if n == ELEM_LATITUDE => {
                        reading_lat = false;
                    }
                    n if n == ELEM_LONGITUDE => {
                        reading_lon = false;
                    }
                    n if n == ELEM_ALTITUDE => {
                        reading_ele = false;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(MapperError::TcxParse(e.to_string())),
            _ => {}
        }
        buf.clear();
    }

    Ok(points)
}

/// Extract the local (non-namespaced) portion of an XML element name.
///
/// Given `{http://...}Trackpoint`, returns `Trackpoint`.
/// Given `Trackpoint`, returns `Trackpoint` unchanged.
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

    const SIMPLE_TCX: &[u8] = br#"<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity>
      <Lap>
        <Track>
          <Trackpoint>
            <Position>
              <LatitudeDegrees>51.5</LatitudeDegrees>
              <LongitudeDegrees>-0.1</LongitudeDegrees>
            </Position>
            <AltitudeMeters>42.0</AltitudeMeters>
          </Trackpoint>
          <Trackpoint>
            <Position>
              <LatitudeDegrees>51.6</LatitudeDegrees>
              <LongitudeDegrees>-0.2</LongitudeDegrees>
            </Position>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>"#;

    const NO_POSITION_TCX: &[u8] = br#"<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity><Lap><Track>
    <Trackpoint><Time>2024-01-01T00:00:00Z</Time></Trackpoint>
  </Track></Lap></Activity></Activities>
</TrainingCenterDatabase>"#;

    const MALFORMED_TCX: &[u8] = b"not xml <<<";

    #[test]
    fn parse_valid_tcx_returns_two_points() {
        let track = parse(SIMPLE_TCX, "my_ride.tcx").unwrap();
        assert_eq!(track.name, "my_ride");
        assert_eq!(track.points.len(), 2);
        assert_eq!(track.points[0].lat, 51.5);
        assert_eq!(track.points[0].lon, -0.1);
        assert_eq!(track.points[0].ele, Some(42.0));
        assert_eq!(track.points[1].ele, None);
    }

    #[test]
    fn parse_zero_coordinate_is_valid() {
        let tcx = br#"<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity><Lap><Track>
    <Trackpoint>
      <Position>
        <LatitudeDegrees>0.0</LatitudeDegrees>
        <LongitudeDegrees>0.0</LongitudeDegrees>
      </Position>
    </Trackpoint>
  </Track></Lap></Activity></Activities>
</TrainingCenterDatabase>"#;
        let track = parse(tcx, "zero.tcx").unwrap();
        assert_eq!(track.points.len(), 1);
        assert_eq!(track.points[0].lat, 0.0);
        assert_eq!(track.points[0].lon, 0.0);
    }

    #[test]
    fn parse_no_position_returns_no_track_points_error() {
        let err = parse(NO_POSITION_TCX, "empty.tcx").unwrap_err();
        assert!(matches!(err, MapperError::NoTrackPoints { .. }));
    }

    #[test]
    fn parse_malformed_tcx_returns_parse_error() {
        let err = parse(MALFORMED_TCX, "bad.tcx").unwrap_err();
        assert!(matches!(err, MapperError::TcxParse(_)));
    }

    #[test]
    fn stem_strips_extension() {
        assert_eq!(stem("activity.tcx.gz"), "activity");
        assert_eq!(stem("9731596976.tcx"), "9731596976");
    }

    /// Integration test using the real sample TCX file from test-data/.
    #[test]
    fn parse_real_tcx_gz_file() {
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-data/9731596976.tcx.gz");

        if !path.exists() {
            eprintln!("Skipping: test-data file not present");
            return;
        }

        let bytes = std::fs::read(&path).unwrap();
        let track = parse(&bytes, "9731596976.tcx.gz").unwrap();
        assert!(!track.points.is_empty(), "expected at least one GPS point");
        assert_eq!(track.name, "9731596976");
    }
}
