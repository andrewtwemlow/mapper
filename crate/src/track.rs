//! Core data types shared across all parser modules.
//!
//! [`Track`] is the single intermediate representation that every parser
//! (GPX, FIT, TCX) produces. It is serialised to JSON and passed back to
//! the JavaScript layer, which uses it for map rendering and for feeding
//! the GPX/HTML generators.

use serde::{Deserialize, Serialize};

/// A single GPS coordinate with optional elevation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Point {
    /// Latitude in decimal degrees (WGS-84).
    pub lat: f64,
    /// Longitude in decimal degrees (WGS-84).
    pub lon: f64,
    /// Elevation in metres above sea level, if available.
    pub ele: Option<f64>,
}

/// A parsed GPS track, produced by any of the file format parsers.
///
/// Each track corresponds to one uploaded file. The `name` is derived from
/// the original filename stem and used as the `<name>` element in GPX output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    /// Human-readable name, derived from the uploaded filename stem.
    pub name: String,
    /// Ordered sequence of GPS points making up the track.
    pub points: Vec<Point>,
}

impl Track {
    /// Create a new [`Track`] with the given name and points.
    pub fn new(name: impl Into<String>, points: Vec<Point>) -> Self {
        Self {
            name: name.into(),
            points,
        }
    }
}
