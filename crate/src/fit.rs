//! FIT file parser.
//!
//! Parses Garmin FIT files (`.fit` plain or `.fit.gz` gzip-compressed) from
//! raw bytes into a [`Track`].
//!
//! FIT files use semicircle units for lat/lon. The conversion factor is:
//! `degrees = semicircles × (180 / 2^31)`.

use std::collections::HashMap;
use std::io::Read;

use fitparser::{FitDataRecord, Value};
use flate2::read::GzDecoder;

use crate::error::MapperError;
use crate::track::{Point, Track};

/// Conversion factor from FIT semicircle units to decimal degrees.
const SEMICIRCLES_TO_DEGREES: f64 = 180.0 / 2_147_483_648.0;

/// FIT message type name for GPS record messages.
const FIT_RECORD_MESSAGE: &str = "record";

/// FIT field name for latitude in semicircle units.
const FIT_FIELD_LAT: &str = "position_lat";

/// FIT field name for longitude in semicircle units.
const FIT_FIELD_LON: &str = "position_long";

/// FIT field name for altitude in metres.
const FIT_FIELD_ALTITUDE: &str = "enhanced_altitude";

/// FIT field name for altitude fallback.
const FIT_FIELD_ALTITUDE_FALLBACK: &str = "altitude";

/// Parse raw FIT bytes (plain or gzip-compressed) into a [`Track`].
///
/// Detects gzip compression by checking for the two-byte gzip magic number
/// `0x1f 0x8b` at the start of `bytes`. If present, decompresses before
/// parsing. Otherwise parses directly.
///
/// The track name is set to the stem of `filename`.
///
/// # Errors
///
/// Returns [`MapperError::Decompress`] if gzip decompression fails.
/// Returns [`MapperError::FitParse`] if the bytes are not a valid FIT file.
/// Returns [`MapperError::NoTrackPoints`] if parsing succeeds but no GPS
/// points with valid coordinates were found.
pub fn parse(bytes: &[u8], filename: &str) -> Result<Track, MapperError> {
    let name = stem(filename);
    let data = decompress_if_gzipped(bytes)?;
    let points = parse_records(&data)?;

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
    // Gzip magic number: first two bytes are 0x1f 0x8b
    const GZIP_MAGIC: [u8; 2] = [0x1f, 0x8b];

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

/// Parse FIT record messages from raw (already decompressed) FIT bytes.
///
/// Extracts lat/lon from `position_lat` / `position_long` fields (semicircles)
/// and elevation from `enhanced_altitude` or `altitude` fields (metres).
/// Points missing lat or lon are silently skipped (the FIT format includes
/// many record types without GPS data).
///
/// # Errors
///
/// Returns [`MapperError::FitParse`] if the bytes cannot be parsed as a FIT file.
fn parse_records(bytes: &[u8]) -> Result<Vec<Point>, MapperError> {
    let records: Vec<FitDataRecord> =
        fitparser::from_bytes(bytes).map_err(|e| MapperError::FitParse(e.to_string()))?;

    let mut points = Vec::new();

    for record in records {
        if record.kind().to_string() != FIT_RECORD_MESSAGE {
            continue;
        }

        let fields: HashMap<&str, &Value> = record
            .fields()
            .iter()
            .map(|f| (f.name(), f.value()))
            .collect();

        let lat = extract_semicircles(fields.get(FIT_FIELD_LAT).copied());
        let lon = extract_semicircles(fields.get(FIT_FIELD_LON).copied());

        let (Some(lat), Some(lon)) = (lat, lon) else {
            continue;
        };

        let ele = extract_f64(fields.get(FIT_FIELD_ALTITUDE).copied())
            .or_else(|| extract_f64(fields.get(FIT_FIELD_ALTITUDE_FALLBACK).copied()));

        points.push(Point { lat, lon, ele });
    }

    Ok(points)
}

/// Convert a FIT [`Value`] in semicircle units to decimal degrees.
///
/// Returns `None` if the value is absent, not a numeric type, or is the
/// FIT invalid-value sentinel `i32::MIN` (which FIT devices write when GPS
/// lock has not been acquired).
fn extract_semicircles(value: Option<&Value>) -> Option<f64> {
    match value? {
        Value::SInt32(v) => {
            // FIT uses i32::MIN as a sentinel for "no data"
            if *v == i32::MIN {
                None
            } else {
                Some(f64::from(*v) * SEMICIRCLES_TO_DEGREES)
            }
        }
        _ => None,
    }
}

/// Extract a floating-point value from a FIT [`Value`].
///
/// Handles both `Float32` and `Float64` variants. Returns `None` for all
/// other value types or if `value` is `None`.
fn extract_f64(value: Option<&Value>) -> Option<f64> {
    match value? {
        Value::Float32(v) => Some(f64::from(*v)),
        Value::Float64(v) => Some(*v),
        _ => None,
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

    #[test]
    fn decompress_plain_bytes_unchanged() {
        // Plain FIT header starts with '.FIT' — not gzipped
        let plain = b"not gzipped data";
        let result = decompress_if_gzipped(plain).unwrap();
        assert_eq!(result, plain);
    }

    #[test]
    fn decompress_gzipped_bytes() {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use std::io::Write;

        let original = b"hello from inside gzip";
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(original).unwrap();
        let compressed = encoder.finish().unwrap();

        let result = decompress_if_gzipped(&compressed).unwrap();
        assert_eq!(result, original);
    }

    #[test]
    fn extract_semicircles_converts_correctly() {
        // 0x40000000 semicircles = 90.0 degrees
        let value = Value::SInt32(0x40000000);
        let degrees = extract_semicircles(Some(&value)).unwrap();
        assert!((degrees - 90.0).abs() < 1e-6);
    }

    #[test]
    fn extract_semicircles_rejects_sentinel() {
        let value = Value::SInt32(i32::MIN);
        assert!(extract_semicircles(Some(&value)).is_none());
    }

    #[test]
    fn extract_semicircles_zero_is_valid() {
        let value = Value::SInt32(0);
        let degrees = extract_semicircles(Some(&value)).unwrap();
        assert_eq!(degrees, 0.0);
    }

    #[test]
    fn parse_corrupt_bytes_returns_fit_parse_error() {
        let err = parse(b"not a fit file at all", "bad.fit").unwrap_err();
        assert!(matches!(err, MapperError::FitParse(_)));
    }

    #[test]
    fn stem_strips_extension() {
        assert_eq!(stem("activity.fit.gz"), "activity");
        assert_eq!(stem("10743961743.fit"), "10743961743");
    }

    /// Integration test using the real sample FIT file from test-data/.
    /// Requires the file to be present; skipped in unit-only CI if absent.
    #[test]
    fn parse_real_fit_gz_file() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../test-data/10743961743.fit.gz");

        if !path.exists() {
            eprintln!("Skipping: test-data file not present");
            return;
        }

        let bytes = std::fs::read(&path).unwrap();
        let track = parse(&bytes, "10743961743.fit.gz").unwrap();
        assert!(!track.points.is_empty(), "expected at least one GPS point");
        assert_eq!(track.name, "10743961743");
    }
}
