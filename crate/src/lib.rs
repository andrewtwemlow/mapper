//! gpx-mapper — WebAssembly crate for parsing GPS activity files.
//!
//! Exposes functions to the JavaScript layer for:
//! - Parsing GPX, FIT (.fit / .fit.gz), and TCX (.tcx / .tcx.gz) bytes into track data.
//! - Generating a combined GPX document from one or more parsed tracks.
//! - Generating a self-contained HTML map document with embedded track data.
//!
//! All public functions cross the Wasm boundary and return `Result<T, JsValue>`
//! so callers can catch errors in JavaScript.

mod error;
mod fit;
mod gpx;
mod html;
mod tcx;
mod track;

use wasm_bindgen::prelude::*;

pub use track::Track;

/// Parse a GPX file from raw bytes and return a serialised [`Track`] JSON string.
///
/// # Errors
///
/// Returns a [`JsValue`] error if the bytes cannot be parsed as valid GPX XML,
/// or if no track points are found.
#[wasm_bindgen]
pub fn parse_gpx(bytes: &[u8], filename: &str) -> Result<JsValue, JsValue> {
    let track = gpx::parse(bytes, filename).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&track).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Parse a FIT file (plain or gzip-compressed) from raw bytes and return a serialised [`Track`] JSON string.
///
/// # Errors
///
/// Returns a [`JsValue`] error if the bytes cannot be parsed as a valid FIT file.
#[wasm_bindgen]
pub fn parse_fit(bytes: &[u8], filename: &str) -> Result<JsValue, JsValue> {
    let track = fit::parse(bytes, filename).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&track).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Parse a TCX file (plain or gzip-compressed) from raw bytes and return a serialised [`Track`] JSON string.
///
/// # Errors
///
/// Returns a [`JsValue`] error if the bytes cannot be parsed as a valid TCX file.
#[wasm_bindgen]
pub fn parse_tcx(bytes: &[u8], filename: &str) -> Result<JsValue, JsValue> {
    let track = tcx::parse(bytes, filename).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&track).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Generate a GPX 1.1 document containing one `<trk>` per track in `tracks_json`.
///
/// `tracks_json` must be a JSON array of serialised [`Track`] objects as produced
/// by [`parse_gpx`], [`parse_fit`], or [`parse_tcx`].
///
/// Returns the GPX document as a UTF-8 string.
///
/// # Errors
///
/// Returns a [`JsValue`] error if `tracks_json` cannot be deserialised or the
/// GPX document cannot be serialised.
#[wasm_bindgen]
pub fn generate_combined_gpx(tracks_json: &str) -> Result<String, JsValue> {
    let tracks: Vec<Track> = serde_json::from_str(tracks_json)
        .map_err(|e| JsValue::from_str(&format!("invalid tracks JSON: {e}")))?;
    gpx::generate_combined(&tracks).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Generate a self-contained HTML map document from `tracks_json`.
///
/// The output HTML references Leaflet.js and CartoDB tiles from CDN and embeds
/// all track coordinate data as an inline JSON blob.
///
/// `tracks_json` must be a JSON array of serialised [`Track`] objects.
///
/// Returns the HTML document as a UTF-8 string.
///
/// # Errors
///
/// Returns a [`JsValue`] error if `tracks_json` cannot be deserialised or the
/// HTML cannot be generated.
#[wasm_bindgen]
pub fn generate_map_html(tracks_json: &str) -> Result<String, JsValue> {
    let tracks: Vec<Track> = serde_json::from_str(tracks_json)
        .map_err(|e| JsValue::from_str(&format!("invalid tracks JSON: {e}")))?;
    html::generate(&tracks).map_err(|e| JsValue::from_str(&e.to_string()))
}
