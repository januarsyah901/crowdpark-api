const { Prisma } = require('@prisma/client');

const ALLOWED_GEOM_COLS = new Set(['geom', 'entrance_geom']);

/**
 * Returns a raw SQL fragment for a geographic point.
 * Uses parameterized POINT string to avoid SQL concat injection.
 */
function fromPoint(lon, lat) {
    // Validate numeric inputs
    const lonNum = Number(lon);
    const latNum = Number(lat);
    if (!Number.isFinite(lonNum) || !Number.isFinite(latNum)) {
        throw new Error(`Invalid coordinates: lon=${lon}, lat=${lat}`);
    }
    return Prisma.sql`ST_GeogFromText(${`POINT(${lonNum} ${latNum})`})`;
}

/**
 * Utility to convert geography column to GeoJSON.
 * Whitelists column names to prevent injection via Prisma.raw.
 */
function toGeoJSON(geomColName = 'geom') {
    if (!ALLOWED_GEOM_COLS.has(geomColName)) {
        throw new Error(`Invalid geom column: ${geomColName}. Allowed: ${[...ALLOWED_GEOM_COLS].join(', ')}`);
    }
    // Use raw only for whitelisted identifiers
    return Prisma.sql`ST_AsGeoJSON(${Prisma.raw(`"${geomColName}"`)})::json`;
}

/**
 * Haversine distance fallback (meters) between two geography points.
 * Used when OSRM is unavailable.
 */
function stDistanceSQL(lon1, lat1, lon2, lat2) {
    return Prisma.sql`ST_Distance(ST_GeogFromText(${`POINT(${lon1} ${lat1})`}), ST_GeogFromText(${`POINT(${lon2} ${lat2})`}))`;
}

module.exports = {
    fromPoint,
    toGeoJSON,
    stDistanceSQL,
    ALLOWED_GEOM_COLS
};
