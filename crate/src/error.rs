//! Domain error types for the gpx-mapper crate.
//!
//! All errors implement [`std::error::Error`] via [`thiserror`] and are
//! converted to [`wasm_bindgen::JsValue`] only at the public Wasm boundary
//! in `lib.rs`.

use thiserror::Error;

/// Errors that can occur when parsing or generating GPS activity data.
#[derive(Debug, Error)]
pub enum MapperError {
    /// The input bytes could not be parsed as GPX XML.
    #[error("GPX parse error: {0}")]
    GpxParse(String),

    /// The input bytes could not be parsed as a FIT file.
    #[error("FIT parse error: {0}")]
    FitParse(String),

    /// The input bytes could not be parsed as TCX XML.
    #[error("TCX parse error: {0}")]
    TcxParse(String),

    /// The file contained no valid track points.
    #[error("no track points found in '{filename}'")]
    NoTrackPoints {
        /// The name of the file that was found to be empty.
        filename: String,
    },

    /// Gzip decompression failed.
    #[error("gzip decompression error: {0}")]
    Decompress(String),

    /// GPX or HTML serialisation failed.
    #[error("serialisation error: {0}")]
    Serialise(String),
}
