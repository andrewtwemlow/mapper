/**
 * @file elevation.ts
 * Elevation profile chart module.
 *
 * Computes cumulative distance along a track using the Haversine formula and
 * renders an elevation profile as a filled area chart on a canvas. The chart
 * colour matches the track's colour picker value. A public API is exposed for
 * showing, updating, and hiding the profile; the UI layer calls these from
 * track add/remove/colour-change handlers.
 */

import type { Map as LeafletMap, CircleMarker } from "leaflet";
import type { ParsedTrack } from "./wasm.js";
import { DEFAULT_COLOURS } from "./colours.js";

/** Leaflet is loaded from CDN and attached to `window.L` at runtime. */
declare const L: typeof import("leaflet");

// ── Constants ─────────────────────────────────────────────────────────────────

/** Earth radius in kilometres for the Haversine formula. */
const EARTH_RADIUS_KM = 6371;

/** Conversion factor from degrees to radians. */
const DEG_TO_RAD = Math.PI / 180;

/** Chart padding in CSS pixels — space reserved for axis labels. */
const PADDING_LEFT = 40;
const PADDING_RIGHT = 20;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 30;

/** Gap between an axis line and its labels in pixels. */
const LABEL_GAP = 5;

/** Opacity of the filled area beneath the elevation line. */
const FILL_OPACITY = 0.4;

/** Line width of the elevation stroke in pixels. */
const STROKE_WIDTH = 2;

/** Line width of the axis lines in pixels. */
const AXIS_LINE_WIDTH = 1;

/** Target number of tick marks per axis. */
const AXIS_TICK_COUNT = 5;

/** Font size for axis labels in pixels. */
const AXIS_LABEL_FONT_SIZE = 12;

/** Padding ratio applied to flat elevation data (all values identical). */
const FLAT_DATA_PAD_RATIO = 0.1;

/** Minimum padding in metres applied to flat elevation data. */
const FLAT_DATA_MIN_PAD_M = 10;

/** Minimum distance in km to avoid division by zero on degenerate tracks. */
const MIN_DIST_KM = 0.001;

/** Epsilon factor for tick-loop termination (fraction of the step size). */
const TICK_EPSILON_FACTOR = 0.01;

/** Step threshold above which tick values are formatted as whole numbers. */
const WHOLE_STEP_THRESHOLD = 1;

/** Step threshold above which tick values are formatted to 1 decimal place. */
const TENTH_STEP_THRESHOLD = 0.1;

/** ID of the elevation panel DOM element. */
const PANEL_ID = "elevation-panel";

/** ID of the elevation canvas DOM element. */
const CANVAS_ID = "elevation-canvas";

/** CSS class that hides the elevation panel. */
const HIDDEN_CLASS = "elevation-panel--hidden";

/** Minimum height in pixels for the elevation panel during resize. */
const MIN_PANEL_HEIGHT = 60;

/** Minimum height in pixels reserved for the map above the panel. */
const MIN_MAP_HEIGHT = 60;

/** CSS selector for the resize handle element. */
const RESIZE_HANDLE_SELECTOR = ".elevation-resize-handle";

/** Radius of the hover marker on the Leaflet map in pixels. */
const HOVER_MARKER_RADIUS = 6;

/** Horizontal padding inside the hover elevation label in pixels. */
const HOVER_LABEL_PAD_X = 8;

/** Vertical padding inside the hover elevation label in pixels. */
const HOVER_LABEL_PAD_Y = 4;

/** Dash pattern segments for the crosshair line [dash, gap]. */
const CROSSHAIR_DASH: number[] = [4, 4];

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A single point in the elevation profile with cumulative distance,
 * elevation, and geographic coordinates for map marker placement.
 */
interface ProfilePoint {
  /** Cumulative distance from the start of the track in kilometres. */
  distanceKm: number;
  /** Elevation in metres above sea level. */
  elevation: number;
  /** Latitude in decimal degrees. */
  lat: number;
  /** Longitude in decimal degrees. */
  lon: number;
}

/**
 * Cached chart geometry from the last `drawChart` call, used by the hover
 * handler to map cursor pixel positions back to data coordinates.
 */
interface ChartGeometry {
  /** Left edge of the plot area in CSS pixels. */
  plotLeft: number;
  /** Top edge of the plot area in CSS pixels. */
  plotTop: number;
  /** Width of the plot area in CSS pixels. */
  plotWidth: number;
  /** Height of the plot area in CSS pixels. */
  plotHeight: number;
  /** Span of the X axis (niceMax − niceMin). */
  xRange: number;
  /** Span of the Y axis (niceMax − niceMin). */
  yRange: number;
  /** Computed X axis bounds and step. */
  xAxis: { niceMin: number; niceMax: number; step: number };
  /** Computed Y axis bounds and step. */
  yAxis: { niceMin: number; niceMax: number; step: number };
}

// ── Module state ──────────────────────────────────────────────────────────────

/** Current profile points, retained for redraw on resize or colour change. */
let currentPoints: ProfilePoint[] = [];

/** Current chart colour (hex string, e.g. `#1f77b4`). */
let currentColour: string = DEFAULT_COLOURS[0];

/** The canvas element used for drawing. */
let currentCanvas: HTMLCanvasElement | null = null;

/** The Leaflet map instance, retained for hover markers (Task 4). */
let currentMap: LeafletMap | null = null;

/** Whether the resize mousedown listener has been attached to the handle. */
let resizeSetup = false;

/** Active mousemove handler during a resize drag, or `null` when idle. */
let activeMouseMove: ((e: MouseEvent) => void) | null = null;

/** Active mouseup handler during a resize drag, or `null` when idle. */
let activeMouseUp: (() => void) | null = null;

/** Cached chart geometry from the last render, for hover coordinate mapping. */
let currentGeometry: ChartGeometry | null = null;

/** Leaflet circle marker shown at the hovered track point. */
let hoverMarker: CircleMarker | null = null;

/** Whether hover listeners have been attached to the canvas. */
let hoverSetup = false;

/** Stored `pointermove` handler reference for listener removal. */
let pointerMoveHandler: ((e: PointerEvent) => void) | null = null;

/** Stored `pointerleave` handler reference for listener removal. */
let pointerLeaveHandler: (() => void) | null = null;

// ── Distance calculation ──────────────────────────────────────────────────────

/**
 * Compute the great-circle distance between two latitude/longitude points
 * using the Haversine formula.
 *
 * @param lat1 - Latitude of the first point in decimal degrees.
 * @param lon1 - Longitude of the first point in decimal degrees.
 * @param lat2 - Latitude of the second point in decimal degrees.
 * @param lon2 - Longitude of the second point in decimal degrees.
 * @returns Distance in kilometres.
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// ── Profile building ──────────────────────────────────────────────────────────

/**
 * Build an array of profile points from a parsed track.
 *
 * Points without elevation data are skipped. Cumulative distance is
 * accumulated from the first point that has elevation, using the Haversine
 * formula between consecutive included points.
 *
 * @param track - The parsed track to build a profile from.
 * @returns Array of profile points with cumulative distance and elevation.
 */
function buildProfilePoints(track: ParsedTrack): ProfilePoint[] {
  const points: ProfilePoint[] = [];
  let prevLat = 0;
  let prevLon = 0;
  let cumulativeKm = 0;
  let started = false;

  for (const pt of track.points) {
    // Skip points without a numeric elevation value.
    if (typeof pt.ele !== "number") continue;

    if (started) {
      cumulativeKm += haversineKm(prevLat, prevLon, pt.lat, pt.lon);
    }

    points.push({
      distanceKm: cumulativeKm,
      elevation: pt.ele,
      lat: pt.lat,
      lon: pt.lon,
    });

    prevLat = pt.lat;
    prevLon = pt.lon;
    started = true;
  }

  return points;
}

// ── Nice axis helpers ──────────────────────────────────────────────────────────

/**
 * Round a range to a "nice" number (1, 2, 5, or 10 × 10ⁿ) for axis tick
 * spacing.
 *
 * @param range - The raw range to round.
 * @param round - If `true`, round to the nearest nice number; if `false`,
 *   round up to the next nice number.
 * @returns A nice number close to the input range.
 */
function niceNum(range: number, round: boolean): number {
  if (range <= 0) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;

  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }

  return niceFraction * 10 ** exponent;
}

/**
 * Compute nice axis bounds and tick step for a data range.
 *
 * Expands the raw min/max to the nearest nice tick boundaries so axis labels
 * are round numbers.
 *
 * @param min - The minimum data value.
 * @param max - The maximum data value.
 * @returns The nice minimum, maximum, and tick step.
 */
function computeNiceAxis(
  min: number,
  max: number,
): { niceMin: number; niceMax: number; step: number } {
  // Handle flat data (all values the same).
  if (min === max) {
    const pad = Math.max(Math.abs(min) * FLAT_DATA_PAD_RATIO, FLAT_DATA_MIN_PAD_M);
    return computeNiceAxis(min - pad, max + pad);
  }

  const range = niceNum(max - min, false);
  const step = niceNum(range / (AXIS_TICK_COUNT - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  return { niceMin, niceMax, step };
}

/**
 * Format a tick value based on the step size.
 *
 * @param value - The tick value to format.
 * @param step - The tick step size (determines decimal precision).
 * @returns A formatted string.
 */
function formatTick(value: number, step: number): string {
  if (step >= WHOLE_STEP_THRESHOLD) return Math.round(value).toString();
  if (step >= TENTH_STEP_THRESHOLD) return value.toFixed(1);
  return value.toFixed(2);
}

// ── CSS variable helper ───────────────────────────────────────────────────────

/**
 * Read a CSS custom property from the document root.
 *
 * @param name - The CSS variable name (e.g. `"--colour-text-secondary"`).
 * @param fallback - Fallback value if the property is empty or unset.
 * @returns The property value or the fallback.
 */
function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// ── Chart drawing ─────────────────────────────────────────────────────────────

/**
 * Set up a canvas for high-DPI rendering and return its 2D context and
 * CSS pixel dimensions.
 *
 * Reads the canvas's bounding rect once, sets the internal resolution to
 * match devicePixelRatio, then scales the context so all drawing uses CSS
 * pixel coordinates. The dimensions are returned so callers don't need to
 * call getBoundingClientRect() again after the canvas is resized (which
 * would trigger a reflow and may return stale values).
 *
 * @param canvas - The canvas element to configure.
 * @returns The 2D context and CSS dimensions, or `null` if unavailable.
 */
function setupCanvas(
  canvas: HTMLCanvasElement,
): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const dpr = window.devicePixelRatio || 1;
  // Use offsetWidth/offsetHeight rather than getBoundingClientRect so we get
  // the layout box width (excluding CSS transforms) reliably before paint.
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (w <= 0 || h <= 0) return null;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/**
 * Draw the elevation profile chart on a canvas.
 *
 * Renders a filled area chart with labelled X (distance, km) and Y (elevation,
 * m) axes. The fill uses the supplied colour at reduced opacity; the top edge
 * is stroked at full opacity. If the points array is empty, the canvas is
 * cleared and no chart is drawn.
 *
 * @param canvas - The canvas element to draw on.
 * @param points - The profile points to plot.
 * @param colour - The hex colour string for the fill and stroke.
 */
function drawChart(canvas: HTMLCanvasElement, points: ProfilePoint[], colour: string): void {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w, h } = setup;

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = getCssVar("--colour-surface", "#16213e");
  ctx.fillRect(0, 0, w, h);

  if (points.length === 0) return;

  // ── Data range ──────────────────────────────────────────────────────────────
  const maxDistKm = points[points.length - 1].distanceKm;
  let minEle = points[0].elevation;
  let maxEle = points[0].elevation;
  for (const p of points) {
    if (p.elevation < minEle) minEle = p.elevation;
    if (p.elevation > maxEle) maxEle = p.elevation;
  }

  const yAxis = computeNiceAxis(minEle, maxEle);
  const xAxis = computeNiceAxis(0, Math.max(maxDistKm, MIN_DIST_KM));

  // ── Plot area ────────────────────────────────────────────────────────────────
  const plotLeft = PADDING_LEFT;
  const plotTop = PADDING_TOP;
  const plotWidth = w - PADDING_LEFT - PADDING_RIGHT;
  const plotHeight = h - PADDING_TOP - PADDING_BOTTOM;

  // Guard against non-positive plot area.
  if (plotWidth <= 0 || plotHeight <= 0) return;

  // ── Coordinate transforms ─────────────────────────────────────────────────────
  const xRange = xAxis.niceMax - xAxis.niceMin;
  const yRange = yAxis.niceMax - yAxis.niceMin;

  // Cache geometry for hover coordinate mapping.
  currentGeometry = {
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
    xRange,
    yRange,
    xAxis,
    yAxis,
  };

  const xToCanvas = (distKm: number): number =>
    plotLeft + ((distKm - xAxis.niceMin) / xRange) * plotWidth;
  const yToCanvas = (ele: number): number =>
    plotTop + plotHeight - ((ele - yAxis.niceMin) / yRange) * plotHeight;

  // ── Styling tokens ───────────────────────────────────────────────────────────
  const axisColour = getCssVar("--colour-border", "#2a2a4a");
  const labelColour = getCssVar("--colour-text-secondary", "#a0a0b8");
  const fontFamily = getCssVar("--font-family", "system-ui, sans-serif");
  const font = `${AXIS_LABEL_FONT_SIZE}px ${fontFamily}`;

  // ── Axis lines ───────────────────────────────────────────────────────────────
  ctx.strokeStyle = axisColour;
  ctx.lineWidth = AXIS_LINE_WIDTH;
  ctx.beginPath();
  // X axis (bottom of plot)
  ctx.moveTo(plotLeft, plotTop + plotHeight);
  ctx.lineTo(plotLeft + plotWidth, plotTop + plotHeight);
  // Y axis (left of plot)
  ctx.moveTo(plotLeft, plotTop);
  ctx.lineTo(plotLeft, plotTop + plotHeight);
  ctx.stroke();

  // ── Axis labels ──────────────────────────────────────────────────────────────
  ctx.fillStyle = labelColour;
  ctx.font = font;

  // X axis labels (distance in km).
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const xEpsilon = xAxis.step * TICK_EPSILON_FACTOR;
  for (let v = xAxis.niceMin; v <= xAxis.niceMax + xEpsilon; v += xAxis.step) {
    const x = xToCanvas(v);
    ctx.fillText(`${formatTick(v, xAxis.step)} km`, x, plotTop + plotHeight + LABEL_GAP);
  }

  // Y axis labels (elevation in m).
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const yEpsilon = yAxis.step * TICK_EPSILON_FACTOR;
  for (let v = yAxis.niceMin; v <= yAxis.niceMax + yEpsilon; v += yAxis.step) {
    const y = yToCanvas(v);
    ctx.fillText(`${formatTick(v, yAxis.step)} m`, plotLeft - LABEL_GAP, y);
  }

  // ── Filled area ───────────────────────────────────────────────────────────────
  const baselineY = yToCanvas(yAxis.niceMin);

  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const x = xToCanvas(points[i].distanceKm);
    const y = yToCanvas(points[i].elevation);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  // Close down to the baseline and back to the first point.
  ctx.lineTo(xToCanvas(points[points.length - 1].distanceKm), baselineY);
  ctx.lineTo(xToCanvas(points[0].distanceKm), baselineY);
  ctx.closePath();

  ctx.globalAlpha = FILL_OPACITY;
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.globalAlpha = 1;

  // ── Top edge stroke ───────────────────────────────────────────────────────────
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const x = xToCanvas(points[i].distanceKm);
    const y = yToCanvas(points[i].elevation);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = colour;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.stroke();
}

// ── Resize interaction ─────────────────────────────────────────────────────────

/**
 * Attach the mousedown listener to the resize handle.
 *
 * The listener is attached once and remains for the lifetime of the page.
 * The handle is inside the panel, which is hidden via `display: none` when
 * not in use, so the listener is inert while hidden.
 *
 * @param panel - The elevation panel element.
 * @param canvas - The canvas element to redraw during drag.
 */
function setupResizeHandle(panel: HTMLElement, canvas: HTMLCanvasElement): void {
  if (resizeSetup) return;
  const handle = panel.querySelector(RESIZE_HANDLE_SELECTOR) as HTMLElement | null;
  if (!handle) return;

  handle.addEventListener("mousedown", (e: MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = panel.getBoundingClientRect().height;
    const container = panel.parentElement;
    const containerHeight = container ? container.getBoundingClientRect().height : startHeight;
    const maxHeight = containerHeight - MIN_MAP_HEIGHT;

    activeMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY;
      const newHeight = Math.max(MIN_PANEL_HEIGHT, Math.min(maxHeight, startHeight + delta));
      // Dynamic height during drag requires inline style — the accepted
      // exception to the "no inline styles" coding standard.
      panel.style.height = `${newHeight}px`;
      drawChart(canvas, currentPoints, currentColour);
      currentMap?.invalidateSize();
    };

    activeMouseUp = () => {
      if (activeMouseMove) {
        document.removeEventListener("mousemove", activeMouseMove);
        activeMouseMove = null;
      }
      if (activeMouseUp) {
        document.removeEventListener("mouseup", activeMouseUp);
        activeMouseUp = null;
      }
      document.body.style.cursor = "";
    };

    document.addEventListener("mousemove", activeMouseMove);
    document.addEventListener("mouseup", activeMouseUp);
    document.body.style.cursor = "ns-resize";
  });

  resizeSetup = true;
}

/**
 * Cancel any active resize drag and reset the cursor.
 *
 * Called when the elevation panel is hidden to ensure no drag listeners
 * remain on the document.
 */
function teardownResizeHandle(): void {
  if (activeMouseMove) {
    document.removeEventListener("mousemove", activeMouseMove);
    activeMouseMove = null;
  }
  if (activeMouseUp) {
    document.removeEventListener("mouseup", activeMouseUp);
    activeMouseUp = null;
  }
  document.body.style.cursor = "";
}

// ── Hover overlay ──────────────────────────────────────────────────────────────

/**
 * Draw the crosshair and elevation label for the hovered point.
 *
 * Called after {@link drawChart} to overlay the hover indicator on top of the
 * chart. Uses the cached geometry to position the crosshair at the hovered
 * point's X coordinate.
 *
 * @param canvas - The canvas element to draw on.
 * @param points - The profile points.
 * @param index - The index of the hovered point.
 * @param geom - The cached chart geometry from the last {@link drawChart} call.
 */
function drawHoverOverlay(
  canvas: HTMLCanvasElement,
  points: ProfilePoint[],
  index: number,
  geom: ChartGeometry,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const point = points[index];
  const x =
    geom.plotLeft + ((point.distanceKm - geom.xAxis.niceMin) / geom.xRange) * geom.plotWidth;

  // ── Crosshair line ────────────────────────────────────────────────────────────
  ctx.strokeStyle = getCssVar("--colour-text-secondary", "#a0a0b8");
  ctx.lineWidth = AXIS_LINE_WIDTH;
  ctx.setLineDash(CROSSHAIR_DASH);
  ctx.beginPath();
  ctx.moveTo(x, geom.plotTop);
  ctx.lineTo(x, geom.plotTop + geom.plotHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Elevation label ───────────────────────────────────────────────────────────
  const label = `${Math.round(point.elevation)} m`;
  const fontFamily = getCssVar("--font-family", "system-ui, sans-serif");
  ctx.font = `${AXIS_LABEL_FONT_SIZE}px ${fontFamily}`;
  const metrics = ctx.measureText(label);
  const labelW = metrics.width + HOVER_LABEL_PAD_X * 2;
  const labelH = AXIS_LABEL_FONT_SIZE + HOVER_LABEL_PAD_Y * 2;
  // Clamp label horizontally within the plot area.
  const labelX = Math.max(
    geom.plotLeft,
    Math.min(geom.plotLeft + geom.plotWidth - labelW, x - labelW / 2),
  );
  const labelY = geom.plotTop;

  ctx.fillStyle = getCssVar("--colour-surface-raised", "#0f3460");
  ctx.fillRect(labelX, labelY, labelW, labelH);
  ctx.fillStyle = getCssVar("--colour-text-primary", "#e0e0e0");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, labelX + labelW / 2, labelY + labelH / 2);
}

// ── Hover listeners ───────────────────────────────────────────────────────────

/**
 * Attach `pointermove` and `pointerleave` listeners to the canvas for hover
 * interaction.
 *
 * On `pointermove`, finds the nearest profile point to the cursor's X
 * position, redraws the chart with a crosshair overlay, and places a Leaflet
 * marker at the corresponding geographic location. On `pointerleave`, clears
 * the overlay and removes the marker.
 *
 * The listeners are attached once and remain for the lifetime of the page.
 * They are inert when the canvas is hidden.
 *
 * @param canvas - The canvas element to listen on.
 */
function setupHoverListeners(canvas: HTMLCanvasElement): void {
  if (hoverSetup) return;
  hoverSetup = true;

  pointerMoveHandler = (e: PointerEvent) => {
    if (!currentGeometry || currentPoints.length === 0 || !currentCanvas) return;

    const rect = canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;

    // Convert cursor X to distance in km using cached geometry.
    const distanceKm =
      currentGeometry.xAxis.niceMin +
      ((cursorX - currentGeometry.plotLeft) / currentGeometry.plotWidth) * currentGeometry.xRange;

    // Find nearest point by distance.
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < currentPoints.length; i++) {
      const d = Math.abs(currentPoints[i].distanceKm - distanceKm);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    }

    drawChart(canvas, currentPoints, currentColour);
    drawHoverOverlay(canvas, currentPoints, nearest, currentGeometry);

    // Update Leaflet marker — replace on each move.
    if (currentMap) {
      if (hoverMarker) {
        hoverMarker.remove();
      }
      hoverMarker = L.circleMarker([currentPoints[nearest].lat, currentPoints[nearest].lon], {
        radius: HOVER_MARKER_RADIUS,
        color: getCssVar("--colour-bg", "#1a1a2e"),
        fillColor: getCssVar("--colour-white", "#ffffff"),
        fillOpacity: 1,
        weight: STROKE_WIDTH,
      }).addTo(currentMap);
    }
  };

  pointerLeaveHandler = () => {
    if (currentCanvas && currentPoints.length > 0) {
      drawChart(currentCanvas, currentPoints, currentColour);
    }
    if (hoverMarker) {
      hoverMarker.remove();
      hoverMarker = null;
    }
  };

  canvas.addEventListener("pointermove", pointerMoveHandler);
  canvas.addEventListener("pointerleave", pointerLeaveHandler);
}

/**
 * Remove hover listeners and clean up the Leaflet marker.
 *
 * Called when the elevation panel is hidden to ensure no listeners remain
 * on the canvas and no marker is left on the map.
 */
function teardownHoverListeners(): void {
  if (pointerMoveHandler && currentCanvas) {
    currentCanvas.removeEventListener("pointermove", pointerMoveHandler);
  }
  if (pointerLeaveHandler && currentCanvas) {
    currentCanvas.removeEventListener("pointerleave", pointerLeaveHandler);
  }
  pointerMoveHandler = null;
  pointerLeaveHandler = null;
  if (hoverMarker) {
    hoverMarker.remove();
    hoverMarker = null;
  }
  currentGeometry = null;
  hoverSetup = false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Show the elevation profile panel for a single track.
 *
 * Builds the profile points, makes the panel visible, and renders the chart
 * with the supplied track colour. If the track has no elevation data the panel
 * is not shown.
 *
 * @param track - The track to display.
 * @param colour - The hex colour string matching the track's colour picker.
 * @param map - The Leaflet map instance for hover marker placement.
 */
export function showElevationProfile(track: ParsedTrack, colour: string, map: LeafletMap): void {
  const panel = document.getElementById(PANEL_ID);
  const canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement | null;
  if (!panel || !canvas) return;

  currentPoints = buildProfilePoints(track);
  if (currentPoints.length === 0) return;

  currentColour = colour;
  currentCanvas = canvas;
  currentMap = map;

  panel.classList.remove(HIDDEN_CLASS);
  setupResizeHandle(panel, canvas);
  setupHoverListeners(canvas);
  map.invalidateSize();
  // Defer draw until after the browser has reflowed the newly-visible panel,
  // so getBoundingClientRect() returns the correct dimensions.
  requestAnimationFrame(() => {
    drawChart(canvas, currentPoints, currentColour);
  });
}

/**
 * Update the chart colour without rebuilding the profile data.
 *
 * Called when the user changes the track colour via the colour picker.
 *
 * @param colour - The new hex colour string.
 */
export function updateElevationColour(colour: string): void {
  currentColour = colour;
  if (currentCanvas && currentPoints.length > 0) {
    drawChart(currentCanvas, currentPoints, currentColour);
  }
}

/**
 * Hide the elevation profile panel and clean up state.
 *
 * Removes the panel from the layout so the map reclaims the full height.
 */
export function hideElevationProfile(): void {
  teardownResizeHandle();
  teardownHoverListeners();
  const panel = document.getElementById(PANEL_ID);
  if (panel) {
    panel.classList.add(HIDDEN_CLASS);
  }
  currentPoints = [];
  currentCanvas = null;
  const map = currentMap;
  currentMap = null;
  if (map) {
    map.invalidateSize();
  }
}
